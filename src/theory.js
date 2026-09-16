// Scales, chords, voice leading and the progression generator.
// Everything here is pure arithmetic on MIDI note numbers.

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// The degrees deep house actually leans on, written as scale indices.
// i (0), iii (2), iv (3), v (4), VI (5), VII (6).
export const DEGREE_POOL = [0, 2, 3, 4, 5, 6];

export const DEGREE_NAMES = ['i', 'ii', 'III', 'iv', 'v', 'VI', 'VII'];

export function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function noteName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// Scale degree -> MIDI note, wrapping octaves for indices outside 0..6.
export function scaleNote(root, scale, index) {
  const len = scale.length;
  const oct = Math.floor(index / len);
  const step = ((index % len) + len) % len;
  return root + scale[step] + 12 * oct;
}

// Stack diatonic thirds. Size 4 gives a seventh chord, 5 gives a ninth.
// In a minor/dorian scale that yields min7, maj7 and dom7 in the right places
// without a single hard-coded quality.
export function buildChord(root, scale, degree, size = 4) {
  const notes = [];
  for (let i = 0; i < size; i++) notes.push(scaleNote(root, scale, degree + i * 2));
  // A ninth that lands a semitone above the root is a b9: correct arithmetic,
  // wrong music on a seventh chord. Drop back to the seventh instead.
  if (size >= 5 && (notes[4] - notes[0]) % 12 === 1) return notes.slice(0, 4);
  return notes;
}

// Name a chord well enough for the readout: measure it against its own root.
export function chordLabel(root, scale, degree, size) {
  const notes = buildChord(root, scale, degree, size);
  const iv = notes.map((n) => ((n - notes[0]) % 12 + 12) % 12);
  const third = iv.includes(3) ? 'm' : iv.includes(4) ? '' : 'sus';
  const flatFive = iv.includes(6) && !iv.includes(7) ? 'b5' : '';
  const seventh = iv.includes(10) ? '7' : iv.includes(11) ? 'maj7' : '';
  const ninth = notes.length >= 5 ? '9' : '';
  let quality = third + (ninth && seventh ? (seventh === 'maj7' ? 'maj9' : '9') : seventh);
  if (ninth && !seventh) quality = third + 'add9';
  quality += flatFive;
  return noteName(notes[0]).replace(/-?\d+$/, '') + quality;
}

export function pitchClasses(notes) {
  return [...new Set(notes.map((n) => ((n % 12) + 12) % 12))];
}

// Voice leading: put each chord tone in the octave nearest the voice that was
// there before, so the hand barely moves between chords and common tones stay
// on the same key. Falls back to a close voicing around `center` on bar one.
// Semitone clusters are decided here, not in the chord. MEASURED across six
// master seeds x five themes, `elevenths` put a minor 2nd in 79.5% of its stab
// chords and `ninths` in 41.3%, and Eugene marked two such bars -3 ("weird
// effect", "sounds very annoying"). The chords are right: it is where the
// octaves fell. This function reduces a chord to pitch classes and re-places
// them in a 29-semitone window, so with five tones the b7 lands under the
// root, or the 11th under the 3rd, as often as not.
//
// The rule, therefore, lives where the octaves are chosen: a tone goes in the
// nearest octave that is *not* a semitone from one already placed, and only
// falls back to the plain nearest when the window offers nothing else.
// Anything still clashing is an extension in the wrong place -- it is moved to
// a clash-free octave, and dropped only if there is none and the chord can
// spare it. The hand still barely moves: every choice is still the nearest
// octave to the voice that was there, so the voice leading is unchanged in
// kind. No die is rolled here, so the dice and their weights do not move.
//
// Rank of what may give way, worst offender first: the b7 and the maj7 sit one
// step under the root, the 11th one step over the 3rd, the 9th one step over
// the root. A pair of structural tones is left alone -- that is the chord.
const EXT_RANK = { 10: 4, 11: 4, 5: 3, 2: 2 };

export function voiceLead(prevVoicing, chordNotes, opts = {}) {
  const low = opts.low ?? 55;
  const high = opts.high ?? 72;
  const center = opts.center ?? (low + high) / 2;
  const rootPc = opts.rootPc;
  const pcs = pitchClasses(chordNotes);

  const targets = prevVoicing && prevVoicing.length ? prevVoicing.slice() : null;
  const out = [];
  const used = new Set();
  const clashes = (m) => used.has(m - 1) || used.has(m + 1);

  // The nearest octave to `anchor` inside the window; with `avoid`, the
  // nearest one that is not a semitone from a tone already placed.
  const place = (pc, anchor, avoid) => {
    let best = null;
    let bestDist = Infinity;
    for (let m = low - 12; m <= high + 12; m++) {
      if (((m % 12) + 12) % 12 !== pc) continue;
      if (m < low || m > high) continue;
      if (used.has(m)) continue;
      if (avoid && clashes(m)) continue;
      const d = Math.abs(m - anchor);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best;
  };

  pcs.forEach((pc, i) => {
    const anchor = targets ? targets[Math.min(i, targets.length - 1)] : center;
    let best = place(pc, anchor, true);
    if (best == null) best = place(pc, anchor, false);
    if (best == null) {
      // Window too tight for this tone; take the nearest octave anywhere.
      best = pc + 12 * Math.round((anchor - pc) / 12);
    }
    used.add(best);
    out.push(best);
  });

  // Without a root there is no way to say which tone is the extension, so the
  // placement above is all there is.
  if (rootPc == null) return out.sort((a, b) => a - b);

  const rank = (m) => EXT_RANK[(((m - rootPc) % 12) + 12) % 12] ?? 0;
  for (let guard = 0; guard < 4; guard++) {
    const sorted = out.slice().sort((a, b) => a - b);
    let pair = null;
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (sorted[i + 1] - sorted[i] === 1) {
        pair = [sorted[i], sorted[i + 1]];
        break;
      }
    }
    if (!pair) break;
    const victim = rank(pair[1]) >= rank(pair[0]) ? pair[1] : pair[0];
    if (rank(victim) === 0) break; // two structural tones: that is the chord
    const idx = out.indexOf(victim);
    used.delete(victim);
    const moved = place(((victim % 12) + 12) % 12, victim, true);
    if (moved != null) {
      out[idx] = moved;
      used.add(moved);
    } else if (out.length > 3) {
      out.splice(idx, 1);
    } else {
      used.add(victim);
      break;
    }
  }

  return out.sort((a, b) => a - b);
}

// Inversion and spread. A voicing that is the same five notes every bar is the
// most obviously generated thing a chord layer can do, so: rotate the stack so
// a different tone is in the bass, optionally drop the fifth (which a bass
// line is already saying) or double the root an octave down, and let the top
// note move. Voice leading still runs afterwards, so the hand still barely
// moves; it just is not frozen.
export function shapeVoicing(rng, notes, opts = {}) {
  const inversion = opts.inversion ?? 0;
  let out = notes.slice().sort((a, b) => a - b);

  // Rotate: take the lowest `inversion` tones up an octave.
  for (let i = 0; i < inversion && out.length > 2; i++) {
    const lowest = out.shift();
    out.push(lowest + 12);
  }

  // The fifth is the tone the bass is already covering, so it is the one that
  // can leave without the chord losing its name.
  if (opts.dropFifth && out.length > 3) {
    const root = out[0];
    const fifth = out.findIndex((n, i) => i > 0 && ((n - root) % 12 + 12) % 12 === 7);
    if (fifth > 0) out.splice(fifth, 1);
  }

  if (opts.doubleRoot) {
    const pc = ((out[0] % 12) + 12) % 12;
    out.unshift(out[0] - 12);
    void pc;
  }

  // Move the top: lift the highest tone an octave, or bring it down to sit
  // inside the chord, so the melody note is not the same one every bar.
  if (opts.topLift === 1 && out.length > 2) {
    out[out.length - 1] += 12;
  } else if (opts.topLift === -1 && out.length > 3) {
    out[out.length - 1] -= 12;
  }

  return out.sort((a, b) => a - b);
}

// Relative root (semitones above the tonic) -> the scale degree nearest it.
// The corpus stores roots in semitones; the scale decides what chord sits
// there, because the corpus's own quality labels are not to be trusted.
export function degreeFromRelroot(relroot, scale) {
  const pc = ((relroot % 12) + 12) % 12;
  let best = 0;
  let bestD = 99;
  for (let i = 0; i < scale.length; i++) {
    const d = Math.min(Math.abs(scale[i] - pc), 12 - Math.abs(scale[i] - pc));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Walk the mined second-order chord table. The corpus is pedal-heavy — 74% of
// bars sit on the tonic, and `i - i` is the commonest whole loop — which is
// authentic, so the walk is left alone except for one nudge at the end: a loop
// that never leaves the tonic gets one bar moved somewhere else, because a
// generator that produces the same single chord for every seed is not a
// generator.
export function walkMarkov(rng, corpus, slots) {
  const table = corpus.markov2;
  const states = Object.keys(table);

  // Start from a state whose first bar is the tonic, weighted by how often the
  // state was seen at all.
  const tonicStates = states.filter((k) => k.startsWith('0:'));
  const startPool = (tonicStates.length ? tonicStates : states).map((k) => ({
    v: k,
    w: Object.values(table[k]).reduce((a, b) => a + b, 0),
  }));
  let state = rng.weighted(startPool);
  const [a, b] = state.split('|');
  const roots = [rootOf(a), rootOf(b)];

  while (roots.length < slots) {
    const conts = table[state];
    let next;
    if (conts) {
      next = rng.weighted(Object.entries(conts).map(([v, w]) => ({ v, w })));
    } else {
      // First-order fallback: any state that begins with the bar we are on.
      const prev = state.split('|')[1];
      const cand = states.filter((k) => k.startsWith(prev + '|'));
      next = cand.length ? rng.weighted(cand.map((k) => ({ v: k.split('|')[1], w: 1 }))) : '0:min9';
    }
    roots.push(rootOf(next));
    state = `${state.split('|')[1]}|${next}`;
  }

  const out = roots.slice(0, slots);
  out[0] = 0; // re-anchor every loop to the tonic
  return out;
}

function rootOf(token) {
  const n = parseInt(token.split(':')[0], 10);
  return Number.isFinite(n) ? ((n % 12) + 12) % 12 : 0;
}

// Build the progression: roots from the corpus, chords from the scale.
export function makeProgression(rng, root, scaleName, params, corpus, opts = {}) {
  const scale = SCALES[scaleName];
  const H = params.harmony;

  // MEASURED loop-length distribution: 2 bars 21, 4 bars 17, 8 bars 6.
  const loopBars = opts.loopBars || rng.weighted(
    Object.entries(corpus.loopLengthBars)
      .filter(([k]) => k !== '0' && Number(k) <= 8)
      .map(([k, w]) => ({ v: Number(k), w }))
  );
  let changeEvery = opts.changeEvery || rng.weighted(H.chordBarsWeights);
  // A loop with one slot is one chord for the whole track; halve until the
  // loop has at least two things to say.
  while (changeEvery > loopBars / 2) changeEvery = Math.max(1, changeEvery / 2);
  const slots = Math.max(1, Math.round(loopBars / changeEvery));

  const usable = DEGREE_POOL.filter((d) => {
    const t = buildChord(root, scale, d, 3);
    return (t[2] - t[0]) % 12 === 7;
  });

  // A preset can name the harmony it was measured with (a static tonic, or i
  // alternating with III) instead of walking the table.
  let degrees;
  if (opts.degreeBias) {
    const pool = opts.degreeBias.filter((o) => usable.includes(o.v));
    degrees = [0];
    for (let i = 1; i < slots; i++) {
      const prev = degrees[i - 1];
      const away = pool.filter((o) => o.v !== prev);
      degrees.push(rng.chance(0.55) && away.length ? rng.weighted(away) : rng.weighted(pool));
    }
  } else {
    degrees = walkMarkov(rng, corpus, slots).map((r) => degreeFromRelroot(r, scale));
    degrees = degrees.map((d) => (usable.includes(d) ? d : 0));
  }

  // One nudge: every loop says at least two things.
  if (slots > 1 && degrees.every((d) => d === degrees[0])) {
    const away = usable.filter((d) => d !== degrees[0]);
    const pool = away.map((d) => ({ v: d, w: H.degreeWeights[d] ?? 1 }));
    degrees[slots === 2 ? 1 : slots - 1] = rng.weighted(pool);
  }

  // Voicing style is its own die: how wide the chord is and whether the
  // eleventh comes in. The corpus's quality labels are not used.
  const style = opts.voicingStyle || 'ninths';

  let voicing = null;
  const chords = degrees.map((degree, i) => {
    const triad = buildChord(root, scale, degree, 3);
    const isMinor = (triad[1] - triad[0]) % 12 === 3;
    const wantNine =
      style === 'sevenths' ? rng.chance(0.25) : style === 'elevenths' ? true : rng.chance(H.ninthChance);
    let notes = buildChord(root, scale, degree, wantNine ? 5 : 4);
    const wantEleven =
      isMinor && notes.length >= 5 && (style === 'elevenths' ? rng.chance(0.75) : rng.chance(H.eleventhChance));
    if (wantEleven) {
      notes = notes.filter((_, k) => k !== 2).concat([scaleNote(root, scale, degree + 10)]);
    }
    notes.sort((a, b) => a - b);
    // Each chord gets its own shape: an inversion, sometimes the fifth out or
    // the root doubled below, and a top note that moves across the loop.
    const shaped = shapeVoicing(rng, notes, {
      inversion: rng.weighted([{ v: 0, w: 3 }, { v: 1, w: 3 }, { v: 2, w: 2 }]),
      dropFifth: rng.chance(0.3),
      doubleRoot: rng.chance(0.22),
      topLift: rng.weighted([{ v: 0, w: 5 }, { v: 1, w: 2 }, { v: -1, w: 1.5 }]),
    });
    voicing = voiceLead(voicing, shaped, {
      low: 50,
      high: 79,
      center: 64,
      rootPc: ((scaleNote(root, scale, degree) % 12) + 12) % 12,
    });
    return {
      degree,
      size: notes.length,
      startBar: i * changeEvery,
      bars: changeEvery,
      notes,
      voicing,
      rootMidi: scaleNote(root, scale, degree),
      label: chordLabel(root, scale, degree, notes.length),
      roman: DEGREE_NAMES[degree],
    };
  });

  return { changeEvery, loopBars, chords, root, scaleName, scale, voicingStyle: style };
}

// Which chord is sounding in a given bar of the track.
export function chordAtBar(progression, bar) {
  const loop = progression.loopBars || 8;
  const inLoop = ((bar % loop) + loop) % loop;
  for (let i = progression.chords.length - 1; i >= 0; i--) {
    if (inLoop >= progression.chords[i].startBar) return progression.chords[i];
  }
  return progression.chords[0];
}

// Fold a MIDI note into a register window without changing its pitch class.
export function foldTo(midi, low, high) {
  let m = midi;
  while (m < low) m += 12;
  while (m > high) m -= 12;
  return m;
}
