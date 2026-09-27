// signatures.ts — what each candidate of each wired list actually sounds like,
// in the eight birds, measured.
//
//   node tools/imprint/signatures.ts --render      render and imprint the sweep
//   node tools/imprint/signatures.ts               fit the signatures and write them
//   node tools/imprint/signatures.ts --render --fit    both, in one go
//
// Phase 0 of PLAN-MAGIC-V2 refused to invent a curve: seven of the eight birds
// were pass-throughs and exactly one stated shape — a pull on Root leans the
// room die — existed as proof the plumbing reached the dice. Phase 1 is where
// the shapes come from, and the rule is the same one the rest of this project
// keeps: **measure them**.
//
// The method, in one paragraph. Plan a sweep of themes with no spell at all —
// the record as it is — render each one's main-groove window offline through
// the real graph, imprint it, and then ask, for every candidate of every list a
// die draws from: *what did the themes that rolled this one read as?* That mean
// and spread over the eight birds is the candidate's **signature**. It is not a
// claim about what the candidate does on its own; it is what a theme that has
// it in it measures, which is exactly what a listener pulling a bird is asking
// for. For the draws that are not a list — a chance, a window of BPM, a blend's
// length — the same question is a slope: how far does the outcome move per unit
// of the bird that is supposed to be about it.
//
// What comes out is `src/styles/deep-house-signatures.json`, committed, with
// its provenance on it: the date, the seeds, the anchors the scale was read on
// and the count behind every row. `src/spell.ts` reads it and nothing else
// does. Re-running this rebuilds it; the renders are deterministic to about a
// sixteen-bit step, so the numbers move in the fourth decimal and no further.
//
// The renders: one at a time, headless Chromium reniced to the bottom of the
// queue, the page on the silent route, on port 7029 and never 6975. An
// OfflineAudioContext has no output device; nothing here can be heard.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme, MIX_DEFAULTS, STYLE } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { BIRDS } from '../../src/spell.ts';
import Rng from '../../src/rng.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';

const PKG = path.join(ROOT, 'packages', 'deep-house');
const OUT = path.join(ROOT, 'tmp', 'imprint', 'sweep');
const GOLDEN = path.join(ROOT, 'tmp', 'imprint', 'golden');
const TARGET = path.join(PKG, 'src', 'styles', 'deep-house-signatures.json');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

// --- the sweep --------------------------------------------------------------
//
// Forty master seeds, three themes of each. Forty and not four hundred because
// a render is half a minute and a hundred and twenty is where every candidate
// of every list that is actually drawn has a count in double figures — the
// narrowest pool in the catalogue, the pad partner's two entries, is the one
// that sets the floor and it is not the list that needed the samples.
//
// The seeds are 1..40 and are stated rather than drawn, so a re-run measures
// the same record. Seed 1's first three themes are also golden themes; they are
// the same window and the same scale, so the golden's own imprints are folded
// in at the fit and the duplicates drop out.
export const SWEEP_SEEDS = Array.from({ length: 40 }, (_, i) => String(i + 1));
export const SWEEP_THEMES = 3;

const PORT = +arg('port', 7029);
const RATE = +arg('rate', 48000);
const BARS = +arg('bars', 32);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const PY = arg('python', VENV);

// --- what a theme rolled ----------------------------------------------------

/**
 * Which entry of each wired list this theme drew. `null` where the die was not
 * reached at all on this theme, which is a real answer and not a missing one:
 * a lead that holds the chord itself never draws a pad partner.
 *
 * Read off the plan's own `dice` block wherever the plan records it, and
 * re-rolled off the theme's own stream where it does not — `melodyBars` is the
 * first and only draw of the `melody` stream, so rolling it again here is the
 * same number and adds a draw to nothing.
 */
export function drawsOf(track, style = STYLE) {
  const d = track.dice;
  const CAT = style.catalogue;
  const leadSustained = CAT.sustainedLeads.includes(d.leadTimbre);
  const ownFigure = style.figures.ownFigure.includes(d.stabTimbre);
  const melodyBars = ownFigure && d.pianoRole === 'melody'
    ? new Rng(`${track.seed}::melody`).weighted(CAT.melodyBars)
    : null;
  return {
    rooms: d.preset,
    leadTimbres: d.leadTimbre,
    // One of the two, never both: the partner die fills whichever role the
    // lead's own family leaves open.
    padPartners: leadSustained ? null : d.padTimbre,
    stabPartners: leadSustained ? d.stabTimbre : null,
    densities: d.density,
    densityLabels: d.densityDie.label,
    voicingStyles: d.voicingStyle,
    fxPalettes: d.fxPalette,
    keyRoots: track.key.root,
    melodyBars,
  };
}

/** The continuous outcomes of a theme: what the draws that are not a list made. */
export function outcomesOf(track) {
  const sections = track.arrangement.sections;
  return {
    bpm: track.bpm,
    blendBars: track.blendBars,
    sectionBars: sections.reduce((a, s) => a + s.bars, 0) / sections.length,
    sections: sections.length,
    bars: track.bars,
  };
}

/** Every theme of the sweep, planned. Pure and instant; no audio anywhere. */
export function sweepThemes() {
  const rows = [];
  for (const master of SWEEP_SEEDS) {
    for (let n = 0; n < SWEEP_THEMES; n++) {
      const track = planTheme(master, n, {});
      rows.push({ master, theme: n, track });
    }
  }
  return rows;
}

// --- the render -------------------------------------------------------------

async function render() {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = [];
  for (const { master, theme, track } of sweepThemes()) {
    const file = path.join(OUT, `sweep-${master}-${theme}.wav`);
    const out = file.replace(/\.wav$/, '.json');
    if (fs.existsSync(out) && !has('force')) continue;
    const w = loudnessWindow(track, BARS);
    jobs.push({
      name: `${master}#${theme}`, masterSeed: master, theme, file, out,
      preset: track.preset, density: track.density, key: track.key.name, bpm: track.bpm,
      fromBar: w.from, bars: w.bars,
      preFromBar: Math.max(0, w.from - PREROLL_BARS), toBar: w.from + w.bars,
      tail: TAIL_SECONDS,
    });
  }
  if (!jobs.length) { console.log('  every theme of the sweep is already rendered and imprinted'); return; }
  console.log(`  ${jobs.length} themes to render`);
  const server = await serveSite(PORT);
  const browser = await openPage(PORT);
  console.log(`  ${browser.label}`);
  let i = 0;
  for (const job of jobs) {
    const began = Date.now();
    const r = await renderToWav(browser.page, job, job.file, RATE);
    execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, job.file,
      '--out', job.out, '--origin', 'generated', '--raw', '--quiet',
      '--label', `sweep ${job.name} (${job.preset}, ${job.density}, ${job.key}, ${job.bpm} BPM)`],
      { stdio: 'inherit' });
    // The audio is the lab's and the numbers are the result: a hundred and
    // twenty windows is four gigabytes and the imprint is all that is read.
    if (!has('keep-wav')) fs.rmSync(job.file, { force: true });
    console.log(`  ${String(++i).padStart(3)}/${jobs.length}  ${job.name.padEnd(9)} ${job.preset.padEnd(6)} bar ${String(job.fromBar).padStart(3)}+${job.bars}  ${r.seconds} s  ${r.events} events  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  server.close();
}

// Only when this file is the command. `tools/check.ts` and `room-recipes.ts`
// import `drawsOf` and `SWEEP_SEEDS` out of here, and a check that rewrote a
// committed measurement on its way past would be a check that could never fail.
const RUN = import.meta.url === `file://${process.argv[1]}`;

if (RUN && has('render')) await render();

// --- the fit ----------------------------------------------------------------
//
// One row per candidate: how many themes rolled it, what they read as, and how
// much they disagreed. And one line per list saying **which birds drive it**,
// by the one test that keeps this from being numerology: a bird whose spread
// *across* the candidates of a list is smaller than its spread *within* them is
// not telling the candidates apart, and it carries no weight for that list. It
// is measured and recorded either way, because "Ember says nothing about which
// room a theme is in" is a result.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1)));
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;

/** Ordinary least squares of y on x, with the correlation beside it. */
function fitLine(x, y) {
  const n = x.length;
  if (n < 3) return { slope: 0, r: 0, n };
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return { slope: 0, r: 0, n, meanX: mx, meanY: my };
  return { slope: sxy / sxx, r: sxy / Math.sqrt(sxx * syy), n, meanX: mx, meanY: my };
}

/** Every imprint on disk that belongs to this sweep, keyed `master#theme`. */
function readings() {
  const rows = new Map();
  const take = (dir, re) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const m = re.exec(f);
      if (!m) continue;
      const im = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const birds = {};
      for (const b of BIRDS) birds[b] = im.summary.birds[b].median;
      rows.set(`${m[1]}#${m[2]}`, {
        master: m[1], theme: +m[2], birds,
        confidence: im.summary.confidence,
        anchors: im.tool.anchors, windows: im.summary.windows,
      });
    }
  };
  // The sweep first, and then the golden — which is the same window and the
  // same scale, so its fourteen are eleven more themes and three duplicates.
  take(OUT, /^sweep-(\d+)-(\d+)\.json$/);
  take(GOLDEN, /^golden-(\d+)-(\d+)\.json$/);
  return rows;
}

/**
 * The lists this phase has an opinion about, and what each candidate is called
 * in a plan. The mined tables (`bassMasks`, `stabMasks`, `hatMasks`,
 * `sectionOrders`) are deliberately not here: they are the corpus's own weights
 * and both rooms short-circuit three of the four, so a weight on them would be
 * a number that does nothing. Phase 0 said biasing a mined table is a different
 * kind of decision; it still is.
 */
export const WIRED_LISTS = [
  'rooms', 'leadTimbres', 'padPartners', 'stabPartners',
  'densities', 'densityLabels', 'voicingStyles', 'fxPalettes', 'keyRoots', 'melodyBars',
];

/**
 * How many times each stream is actually asked for while a set's themes are
 * planned, by the tag the style names its dice by.
 *
 * It is here because a weight on a list whose die is never reached is a number
 * that cannot do anything, and phase 1 would rather write that down than ship
 * it quietly. Two of the ten wired lists are in that position and neither is a
 * fault: both rooms carry their own `voicingStyle` and short-circuit that die
 * (the style's own reachability note, fact 1), and a **set** states its root
 * before `generate` draws one, so the twelve `keyRoots` are reached by a track
 * generated on its own and never by a theme of a set.
 */
export function drawCounts(masters) {
  const counts = new Map();
  const proto = Object.getOwnPropertyDescriptor(Rng.prototype, 'next');
  Object.defineProperty(Rng.prototype, 'next', {
    configurable: true,
    get() { return undefined; },
    set(fn) {
      const tag = String(this.seed).split('::').slice(1).join('::');
      Object.defineProperty(this, 'next', {
        configurable: true, writable: true,
        value: () => { counts.set(tag, (counts.get(tag) || 0) + 1); return fn(); },
      });
    },
  });
  try {
    for (const master of masters) for (let n = 0; n < SWEEP_THEMES; n++) planTheme(master, n, {});
  } finally {
    if (proto) Object.defineProperty(Rng.prototype, 'next', proto);
    else delete Rng.prototype.next;
  }
  return counts;
}

/** The signature of every candidate of every wired list, and which birds drive it. */
export function signaturesOf(rows, themes) {
  const lists = {};
  const byId = Object.fromEntries(STYLE.candidates.map((c) => [c.id, c]));
  const counts = drawCounts(SWEEP_SEEDS);
  for (const id of WIRED_LISTS) {
    const order = byId[id].list().map(String);
    const buckets = new Map();
    for (const { key, draws } of themes) {
      const row = rows.get(key);
      if (!row) continue;
      const c = draws[id];
      if (c === null || c === undefined) continue;
      const k = String(c);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(row.birds);
    }
    const candidates = {};
    for (const k of order) {
      const seen = buckets.get(k);
      if (!seen || !seen.length) { candidates[k] = { n: 0, mean: null, sd: null }; continue; }
      const m = {}, s = {};
      // Three decimals and not four: the reading repeats to about +/-0.006
      // across two renders of the same window (`analysis/imprint-calibration.md`
      // section 5), so a fourth decimal is a digit of noise carried into every
      // bundle this table ships in.
      for (const b of BIRDS) { const xs = seen.map((x) => x[b]); m[b] = r3(mean(xs)); s[b] = r3(sd(xs)); }
      candidates[k] = { n: seen.length, mean: m, sd: s };
    }
    // Which birds separate this list: the spread of the candidate centres
    // against the spread inside them. Counts weight both, so a candidate with
    // four themes behind it does not set the scale.
    const drives = [], silent = [], spreads = {};
    const drawn = order.filter((k) => candidates[k].n > 1);
    const total = drawn.reduce((a, k) => a + candidates[k].n, 0);
    for (const b of BIRDS) {
      if (drawn.length < 2 || !total) { silent.push(b); spreads[b] = { between: 0, within: 0, error: 0 }; continue; }
      const mu = drawn.map((k) => candidates[k].mean[b]);
      const w = drawn.map((k) => candidates[k].n / total);
      const grand = mu.reduce((a, x, i) => a + x * w[i], 0);
      const between = Math.sqrt(mu.reduce((a, x, i) => a + w[i] * (x - grand) ** 2, 0));
      const within = Math.sqrt(drawn.reduce((a, k, i) => a + w[i] * candidates[k].sd[b] ** 2, 0));
      // `error` is the uncertainty in those candidate means — the within-spread
      // over the root of how many themes stand behind an average candidate. It
      // decides nothing: the gate is the brief's own rule, that the spread
      // across the candidates has to be at least the spread within them. It is
      // written down because it is the weaker question ("is the difference
      // bigger than the noise in it?") and the difference between the two
      // answers is most of what phase 1 found.
      const error = within / Math.sqrt(Math.max(1, total / drawn.length));
      spreads[b] = { between: r4(between), within: r4(within), error: r4(error) };
      (between >= within ? drives : silent).push(b);
    }
    lists[id] = {
      die: byId[id].die,
      drawn: drawn.length,
      // How many times that stream was asked for over the sweep's own themes.
      // Nought is a fact about the released catalogue and not a gap: the weight
      // is computed, the die never reads it, and the round says why.
      draws: counts.get(byId[id].die.split(' ')[0]) || 0,
      drives, silent, spreads, candidates,
    };
    // The one list that is asked for grouped as well as entry by entry. Twelve
    // roots over a hundred and thirty themes is eleven themes each, and a root
    // is a pitch: no bird measures absolute pitch, so the twelve are noise by
    // construction. The grouping that could carry a bird is the **mode**, which
    // is what Gleam is about — so it is measured here and recorded, and it is
    // not wired, because the minor/dorian chance is a die of its own and phase
    // 1 adds no die and no range (rule R3).
    if (id === 'keyRoots') {
      const modes = new Map();
      for (const { key, track } of themes) {
        const row = rows.get(key);
        if (!row) continue;
        const m = track.key.scaleName;
        if (!modes.has(m)) modes.set(m, []);
        modes.get(m).push(row.birds);
      }
      const byMode = {};
      for (const [m, seen] of modes) {
        const mean_ = {}, sd_ = {};
        for (const b of BIRDS) { const xs = seen.map((x) => x[b]); mean_[b] = r3(mean(xs)); sd_[b] = r3(sd(xs)); }
        byMode[m] = { n: seen.length, mean: mean_, sd: sd_ };
      }
      lists[id].byMode = byMode;
      lists[id].byModeNote = 'measured and not wired: the mode is a die of its own '
        + '(`mix:key:<n>`\'s minor chance) and phase 1 adds no range to it. Recorded because it is '
        + 'the grouping of the roots that a bird could carry, and because Gleam reads the key it '
        + 'hears rather than the key the plan wrote.';
    }
  }
  return lists;
}

/**
 * The draws that are not a list, as one slope each: how far the outcome moves
 * per unit of the derived value that is supposed to be about it.
 *
 * The derived value is not asked of the plan — every theme in the sweep was
 * planned at the house, so `derive` returns the same block for all of them.
 * It is asked of the *audio*: the bird the composer reads that value under,
 * measured on the theme itself. Which is the only way round that means
 * anything — the question is what a listener pulling Veil should hear, and the
 * evidence is what the themes that read high on Veil actually did.
 */
export function rangeFits(rows, themes) {
  const at = (key) => rows.get(key);
  const pulse = (b) => b.ember * (0.35 + 0.65 * b.spark);
  const per = [];
  for (const { key, track, outcomes } of themes) {
    const row = at(key);
    if (!row) continue;
    per.push({ master: track.seed.split('#')[0], birds: row.birds, outcomes, pulse: pulse(row.birds) });
  }
  // The tempo is one draw for a whole set, so a set is one observation and its
  // themes are averaged into it.
  const sets = new Map();
  for (const p of per) {
    if (!sets.has(p.master)) sets.set(p.master, []);
    sets.get(p.master).push(p);
  }
  const setRows = [...sets.values()].map((g) => ({
    pulse: mean(g.map((p) => p.pulse)),
    bpm: mean(g.map((p) => p.outcomes.bpm)),
    slow: g[0].outcomes.bpm >= 100 ? 1 : 0,
  }));

  const bpm = fitLine(setRows.map((s) => s.pulse), setRows.map((s) => s.bpm));
  const slow = fitLine(setRows.map((s) => s.pulse), setRows.map((s) => s.slow));
  const blendBars = fitLine(per.map((p) => p.birds.veil), per.map((p) => p.outcomes.blendBars));
  const short = fitLine(per.map((p) => p.birds.veil), per.map((p) => (p.outcomes.blendBars <= 16 ? 1 : 0)));
  const sectionBars = fitLine(per.map((p) => p.birds.loom), per.map((p) => p.outcomes.sectionBars));

  // `derived` is the field of `derive(spell)` the multiplier is a function of,
  // and `bird` is the reading that stood in for it here. They are two names for
  // one quantity and both are written down, because the composer reads the
  // first and the measurement was made on the second.
  const row = (derived, bird, f, base, note) => ({
    derived, bird, slope: r4(f.slope), r: r3(f.r), n: f.n,
    meanBird: r4(f.meanX ?? 0), meanOutcome: r4(f.meanY ?? 0), base,
    // A slope the measurement does not support is not shipped as a number that
    // happens to be small: it is `wired: false` and it says why. The bar is two
    // standard errors of a correlation that is really nought — 2/sqrt(n) — so a
    // fit off forty sets has to clear twice what a fit off a hundred and thirty
    // themes does, which is the arithmetic of the sample and not a taste.
    wired: Math.abs(f.r) >= 2 / Math.sqrt(Math.max(1, f.n)) && f.n >= 20 && !note,
    note: note || null,
  });

  return {
    tempoSlowChance: row('pulse', 'pulse', slow, STYLE.settings.tempo.slowChance, null),
    tempoBpm: row('pulse', 'pulse', bpm, null, null),
    shortBlendChance: row('changeRate', 'veil', short, MIX_DEFAULTS.shortBlendChance, null),
    blendBars: row('changeRate', 'veil', blendBars, null, null),
    sectionBars: row('formLength', 'loom', sectionBars, null,
      'inert: makeArrangement scales the drawn lengths to the bars the theme asked for, '
      + 'so a multiplier on the p25/p75 window divides straight back out. Measured over 300 '
      + 'arrangements, multipliers of 0.5 to 2 give the same mean section length to the bar. '
      + 'The slope is recorded and the multiplier stays at 1 until the window is the thing that '
      + 'decides a section\'s length.'),
  };
}

function fit() {
  const rows = readings();
  const themes = [];
  const seen = new Set();
  for (const { master, theme, track } of sweepThemes()) {
    const key = `${master}#${theme}`;
    seen.add(key);
    themes.push({ key, track, draws: drawsOf(track), outcomes: outcomesOf(track) });
  }
  // The golden themes the sweep does not already cover.
  for (const key of rows.keys()) {
    if (seen.has(key)) continue;
    const [master, n] = key.split('#');
    const track = planTheme(master, +n, {});
    themes.push({ key, track, draws: drawsOf(track), outcomes: outcomesOf(track) });
  }
  const measured = themes.filter((t) => rows.has(t.key));
  if (measured.length < 20) throw new Error(`only ${measured.length} imprints on disk; run --render first`);

  const anchors = [...new Set([...rows.values()].map((r) => r.anchors))];
  const centre = {}, spread = {}, confidence = {};
  for (const b of BIRDS) {
    const xs = [...rows.values()].map((r) => r.birds[b]);
    centre[b] = r4(median(xs));
    // **The kernel's width, and the one number in this file that decides how
    // hard a bird leans.** It is how much the bird varies across the record at
    // all: a spell one of these from a candidate's own centre is a spell that
    // has left the record on that axis, and its weight is down by a factor of
    // e. The narrower alternative — a candidate's own within-spread — was tried
    // and is a switch rather than a lean: with it a bird moved from the house
    // to the edge of its own box already put a room twenty to one, and a room
    // the house draws half the time is not a room the edge of the house box
    // draws one time in twenty. Floored, because a bird a sweep barely moves
    // still must not divide by nothing.
    spread[b] = r4(Math.max(sd(xs), 0.02));
    confidence[b] = r3(median([...rows.values()].map((r) => r.confidence[b])));
  }

  const out = {
    schema: 1,
    kind: 'signatures',
    style: STYLE.id,
    provenance: {
      date: new Date().toISOString().slice(0, 10),
      tool: 'packages/deep-house/tools/imprint/signatures.ts',
      seeds: `master seeds ${SWEEP_SEEDS[0]}-${SWEEP_SEEDS[SWEEP_SEEDS.length - 1]}, themes 0-${SWEEP_THEMES - 1}, and the fourteen golden themes of 1, 92970 and 21323`,
      themes: measured.length,
      window: `up to ${BARS} bars of main groove per theme (src/loudness.ts's own loudnessWindow), rendered offline through the real graph at ${RATE} Hz, one at a time, and read by tools/imprint/imprint.py`,
      anchors: anchors.join(', '),
      spell: 'none: every theme of the sweep was planned at the house, so what is measured is the record as it is',
      note: 'A candidate\'s signature is what the themes that rolled it measured, not what the candidate does on its own. '
        + 'A bird drives a list only where its spread across the candidates is at least its spread within them.',
    },
    centre,
    spread,
    confidence,
    lists: signaturesOf(rows, measured),
    ranges: rangeFits(rows, measured),
  };
  fs.writeFileSync(TARGET, JSON.stringify(out, null, 1) + '\n');
  console.log(`\n  ${measured.length} themes measured on ${anchors.join(', ')}`);
  for (const [id, l] of Object.entries(out.lists)) {
    console.log(`  ${id.padEnd(14)} ${String(l.drawn).padStart(2)} drawn  driven by ${l.drives.length ? l.drives.join(', ') : '— nothing'}`);
  }
  for (const [id, r] of Object.entries(out.ranges)) {
    console.log(`  ${id.padEnd(18)} ${r.derived.padEnd(10)} slope ${String(r3(r.slope)).padStart(8)}  r ${String(r.r).padStart(6)}  n ${String(r.n).padStart(3)}  ${r.wired ? 'wired' : 'unwired'}`);
  }
  console.log(`\n  -> ${path.relative(ROOT, TARGET)}`);
}

if (RUN && (!has('render') || has('fit'))) fit();
