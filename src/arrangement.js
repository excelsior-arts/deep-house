// The shape of the track. The order of sections is drawn from real section
// runs mined out of the reference sets, and their lengths from the measured
// per-label distributions, so two seeds do not get the same plan.
//
// Sections decide which layers may play and where the macro filter sits; the
// pattern generators decide what those layers actually do.

const FULL = {
  kick: true,
  hatClosed: true,
  hatOpen: true,
  sixteenths: true,
  clap: true,
  bass: true,
  keys: true,
  pad: true,
};

const NONE = {
  kick: false,
  hatClosed: false,
  hatOpen: false,
  sixteenths: false,
  clap: false,
  bass: false,
  keys: false,
  pad: false,
};

function L(over) {
  return { ...NONE, ...over };
}

// Layers per phrase within a section. `i` is the phrase index inside the
// section, `n` how many phrases it has.
const KINDS = {
  intro: {
    label: 'intro',
    layers: (i, n) =>
      i === 0 && n > 1
        ? L({ kick: true, hatClosed: true })
        : L({ kick: true, hatClosed: true, hatOpen: true, clap: true, pad: true }),
    filter: [700, 5000],
  },
  build: {
    label: 'build',
    // MEASURED: a build is a filter sweep in 64-83% of cases; the high band
    // rises in only half of them, so the noise riser is optional here.
    layers: (i, n) =>
      i < n - 1
        ? L({ kick: true, hatClosed: true, hatOpen: true, clap: true, bass: true, pad: true })
        : L({ ...FULL, sixteenths: false }),
    filter: [2600, 15000],
    riserLast: 0,
  },
  main: {
    label: 'main groove',
    layers: () => L(FULL),
    filter: [15000, 15000],
  },
  breakdown: {
    label: 'breakdown',
    layers: (i, n) =>
      i === 0
        ? L({ pad: true, keys: true, hatClosed: true })
        : L({ pad: true, keys: true, hatClosed: true, sixteenths: true, bass: true }),
    filter: [900, 11000],
    sweepFirst: true,
    riserLast: 4,
    // MEASURED: the harmonic layer gets louder when the kick leaves.
    lift: true,
  },
  drop: {
    label: 'drop',
    layers: () => L(FULL),
    filter: [15000, 15000],
    impactFirst: true,
  },
  outro: {
    label: 'outro',
    layers: (i, n) =>
      i < n - 1
        ? L({ kick: true, hatClosed: true, hatOpen: true, clap: true, bass: true, pad: true })
        : L({ kick: true, hatClosed: true, pad: true }),
    filter: [14000, 800],
  },
};

const LABEL_TO_KIND = {
  intro: 'intro',
  groove: 'main',
  build: 'build',
  breakdown: 'breakdown',
  drop: 'drop',
  outro: 'outro',
};

// Round to whole 4-bar phrases: MEASURED, 85% of section boundaries land on a
// multiple of 4.
function toPhrases(bars, min = 4) {
  return Math.max(min, Math.round(bars / 4) * 4);
}

// Draw a plan: an order from the corpus, lengths from the measured
// distribution for each label, then scaled to the length that was asked for.
export function makeArrangement(totalBars, rng, corpus) {
  const orders = corpus.sectionOrders.filter((o) => o.length >= 2);
  let order = rng.pick(orders).slice();

  // Long mined runs are whole DJ stretches; take a window that suits the
  // length we want rather than squeezing eleven sections into two minutes.
  const wantSections = Math.max(2, Math.min(order.length, Math.round(totalBars / 22)));
  if (order.length > wantSections) {
    // Start the window on a groove, so the track does not open on the far side
    // of a breakdown that never happened.
    const grooveStarts = order
      .map((l, i) => (l === 'groove' && i <= order.length - wantSections ? i : -1))
      .filter((i) => i >= 0);
    const start = grooveStarts.length
      ? rng.pick(grooveStarts)
      : rng.int(0, order.length - wantSections + 1);
    order = order.slice(start, start + wantSections);
  }
  // An outro that is not last is a key-segment boundary in the middle of a
  // DJ set, not a section of this track.
  order = order.filter((l, i) => l !== 'outro' || i === order.length - 1);
  if (!['intro', 'build'].includes(order[0])) order.unshift('intro');
  if (order[1] && ['drop', 'breakdown'].includes(order[1])) order.splice(1, 0, 'groove');
  if (totalBars >= 96 && order[order.length - 1] !== 'outro') order.push('outro');

  const dist = corpus.sectionBars;
  const raw = order.map((label) => {
    const d = dist[label] || { p25: 8, p75: 16, median: 12 };
    return Math.max(4, rng.float(d.p25, d.p75));
  });

  const rawTotal = raw.reduce((a, b) => a + b, 0);
  const scale = totalBars / rawTotal;
  const bars = raw.map((b) => toPhrases(b * scale));

  // Settle the remainder on the longest groove, which is where a real set
  // absorbs it too.
  // Settle the remainder round-robin over the grooves — the way a set absorbs
  // it — rather than piling it all onto one, which makes a 4-minute track that
  // is eighty bars of the same loop.
  let total = bars.reduce((a, b) => a + b, 0);
  const grooves = order.map((l, i) => (l === 'groove' ? i : -1)).filter((i) => i >= 0);
  const pool = grooves.length ? grooves : order.map((_, i) => i);
  let turn = 0;
  let guard = 0;
  while (total !== totalBars && guard++ < 500) {
    const idx = pool[turn % pool.length];
    turn++;
    if (total < totalBars) {
      bars[idx] += 4;
      total += 4;
    } else if (bars[idx] > 8) {
      bars[idx] -= 4;
      total -= 4;
    } else if (guard > pool.length * 3) {
      const big = bars.indexOf(Math.max(...bars));
      if (bars[big] <= 8) break;
      bars[big] -= 4;
      total -= 4;
    }
  }

  const sections = [];
  let bar = 0;
  order.forEach((label, i) => {
    if (bars[i] <= 0) return;
    const kindName = LABEL_TO_KIND[label] || 'main';
    const kind = KINDS[kindName];
    const section = {
      kind: kindName,
      label: kind.label,
      startBar: bar,
      bars: bars[i],
      phrases: [],
      filter: kind.filter,
      sweepFirst: !!kind.sweepFirst,
      impactFirst: !!kind.impactFirst,
      riserLast: kind.riserLast || 0,
      lift: !!kind.lift,
      index: sections.length,
    };
    // Phrases of 8 bars, with a 4-bar remainder allowed at the end.
    const n = Math.max(1, Math.ceil(bars[i] / 8));
    for (let j = 0; j < n; j++) {
      section.phrases.push({
        startBar: bar + j * 8,
        indexInSection: j,
        layers: kind.layers(j, n),
      });
    }
    bar += bars[i];
    sections.push(section);
  });

  return { sections, bars: bar, phrases: Math.round(bar / 8) };
}

// The macro filter curve, in bars. One point at the start of each section and
// one at its end, plus an extra open point where a riser lifts into a drop.
export function filterCurve(arrangement) {
  const points = [];
  for (const s of arrangement.sections) {
    points.push({ bar: s.startBar, value: s.filter[0] });
    const endBar = s.startBar + s.bars;
    if (s.riserLast && s.bars > s.riserLast + 2) {
      points.push({ bar: endBar - s.riserLast / 4 - 1, value: s.filter[1] * 0.55 });
    }
    points.push({ bar: endBar - 0.05, value: s.filter[1] });
  }
  return points;
}

// The push curve, in bars: how hard the low end is driven. Zero through a
// normal groove — the kick and the bass are the structure of the record and
// structure does not distort — lifting over the last bars of a build, high for
// the first bars of a drop, and gone again within eight. Eugene's ear, not a
// measurement: distortion is "fine in some parts to support exaggeration of
// the moment, but only on breaks where the drums fill and the energy rises".
export function pushCurve(arrangement, push) {
  const pts = [{ bar: 0, value: 0 }];
  const sections = arrangement.sections;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const end = s.startBar + s.bars;
    if (s.kind === 'build') {
      const lift = Math.min(s.bars, push.buildBars);
      pts.push({ bar: Math.max(0, end - lift), value: 0 });
      pts.push({ bar: end - 0.02, value: push.buildLevel });
    } else if (s.kind === 'drop') {
      // The drive belongs to the drop and starts on its downbeat. Without a
      // zero immediately before that downbeat there is no point between the
      // end of the previous section and the drop's, and the curve is a list of
      // ramps -- so a drop that follows a breakdown rather than a build used to
      // ramp the *whole breakdown* up into it. MEASURED on master seed 1, theme
      // 2: bars 101-112 are a breakdown, and the push read 0.08 at bar 102 and
      // 0.77 at bar 111, which is how the quietest section of the theme came
      // out 4.5 LU *louder* than the mains round it.
      const prev = sections[i - 1];
      if (!prev || prev.kind !== 'build') {
        pts.push({ bar: Math.max(0, s.startBar - 0.02), value: 0 });
      }
      pts.push({ bar: s.startBar, value: push.dropLevel });
      pts.push({ bar: Math.min(end, s.startBar + push.dropBars), value: 0 });
    } else if (s.kind === 'breakdown' && s.startBar > 1) {
      // The hand-off out of a loud section into a quiet one: one bar of drive
      // to mark the change, then clean again on the other side of it.
      pts.push({ bar: s.startBar - 1.5, value: 0 });
      pts.push({ bar: s.startBar - 0.1, value: push.markLevel });
      pts.push({ bar: s.startBar + 1, value: 0 });
    } else {
      pts.push({ bar: s.startBar, value: 0 });
    }
  }
  pts.push({ bar: arrangement.bars, value: 0 });
  pts.sort((a, b) => a.bar - b.bar);
  // Strictly increasing, so the curve is a list of ramps and not a stack of
  // events at one instant.
  return pts.filter((p, i) => i === 0 || p.bar > pts[i - 1].bar);
}

export function sectionAtBar(arrangement, bar) {
  for (const s of arrangement.sections) {
    if (bar >= s.startBar && bar < s.startBar + s.bars) return s;
  }
  return arrangement.sections[arrangement.sections.length - 1];
}

export function layersAtBar(arrangement, bar) {
  const s = sectionAtBar(arrangement, bar);
  let phrase = s.phrases[0];
  for (const p of s.phrases) if (bar >= p.startBar) phrase = p;
  return { section: s, phrase, layers: phrase.layers };
}

export default makeArrangement;
