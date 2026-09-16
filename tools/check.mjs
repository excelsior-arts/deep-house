// The checks that need no browser, no sound card and no seconds to spare.
//
//   npm run check          this, then the release audit
//   node tools/check.mjs   on its own
//
// Everything here is arithmetic over the plan: the generator is pure, the seam
// layout is pure, the push curve is pure and the style distance is pure, so the
// things that used to be probe scripts under tmp/ — run by hand, once, and then
// remembered — are checks that run every time in about the time it takes to
// read this sentence. Each prints one line. Any of them failing ends the run
// non-zero naming what moved.
//
// What is *not* here is anything that has to be heard: that is tools/test.mjs,
// which renders the scene list in two engines, and tools/test-browsers.mjs,
// which plays a set.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planTheme, makeSetClock, MIX_DEFAULTS, SEAM_FLOOR } from '../src/mix.js';
import { predictedLufs, loudnessTrimDb, loudnessWindow, LOUDNESS_COLUMNS } from '../src/loudness.js';
import { pushCurve } from '../src/arrangement.js';
import { VOICES } from '../src/voices/index.js';
import PARAMS from '../src/params.js';
import { styleDistance, FLOOR } from '../src/style.js';
import { setLayout } from './setplan.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(name, fn) {
  let note;
  try {
    note = fn();
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
    return;
  }
  console.log(`ok    ${name}: ${note}`);
}
const must = (cond, why) => { if (!cond) throw new Error(why); };

// --- the generator has not moved -------------------------------------------
check('the plans', () => {
  try {
    return execFileSync(process.execPath, [path.join(ROOT, 'tools', 'golden.mjs'), '--check'], { encoding: 'utf8' })
      .trim().split('\n').pop().replace(/^the generator has not moved: /, '');
  } catch (e) {
    throw new Error((e.stdout || e.message).toString().trim().split('\n').slice(0, 2).join(' — '));
  }
});

// --- the seams, over nine hundred pairs ------------------------------------
// A theme hands over in its last quarter, on a sixteen-bar line, and never
// inside the blend the theme before it is still finishing. The old rule — "the
// last breakdown past 55%" — put seed 15576's third theme on bar 144 of 240 and
// its own build, drop and last four minutes were never heard alone.
// Three quarters, written here rather than read out of src/mix.js: a check
// that takes its threshold from the thing it is checking passes whatever the
// threshold becomes, which is how the old rule — the last breakdown past 55% —
// would have slipped back in without a word. A deliberate change to the floor
// is a deliberate change to this line as well.
const SEAM_QUARTER = 0.75;
check('the seam floor, 900 pairs', () => {
  must(SEAM_FLOOR === SEAM_QUARTER, `src/mix.js puts the floor at ${SEAM_FLOOR * 100}% where this check is written against ${SEAM_QUARTER * 100}%`);
  let pairs = 0, under = 0, off = 0, small = 0, overlap = 0;
  let lowest = { pct: 2 };
  for (let seed = 1; seed <= 100; seed++) {
    const L = setLayout(seed, 10);
    for (let i = 0; i < L.seams.length; i++) {
      const s = L.seams[i];
      pairs++;
      if (s.pct < SEAM_QUARTER - 1e-9) under++;
      if (!s.onLine) off++;
      if (s.boundary !== MIX_DEFAULTS.boundaryBars) small++;
      if (i > 0 && s.at < L.seams[i - 1].end - 1e-9) overlap++;
      if (s.pct < lowest.pct) lowest = { pct: s.pct, seed, theme: i, bar: s.bar };
    }
  }
  must(pairs === 900, `${pairs} pairs swept, not 900`);
  must(!under, `${under} seams begin before ${SEAM_QUARTER * 100}% of their theme`);
  must(!off, `${off} seams are off a ${MIX_DEFAULTS.boundaryBars}-bar line`);
  must(!overlap, `${overlap} seams begin inside the blend before them`);
  must(!small, `${small} seams fell back to a line shorter than ${MIX_DEFAULTS.boundaryBars} bars`);
  return `${pairs} pairs, none under ${SEAM_QUARTER * 100}%, none off a ${MIX_DEFAULTS.boundaryBars}-bar line, none inside the blend before it; the earliest is seed ${lowest.seed} theme ${lowest.theme} at bar ${lowest.bar}, ${(lowest.pct * 100).toFixed(1)}%`;
});

// --- one grid through a blend ----------------------------------------------
// The review's counterexample: master seed 1's first pair, 104 into 104.1. The
// hand-over falls 18.461538 s after the seam and the arriving theme's eighth
// bar used to fall 17.7 ms before it, so the downbeat the bass changes hands on
// was excluded and the first kick came 559 ms late. The set now counts one
// grid, pinned for the length of the blend.
check('the set clock through a hand-over', () => {
  const plans = [0, 1].map((i) => planTheme('1', i, {}));
  const clock = makeSetClock(plans[0].beat, 0);
  const at = 100;
  const startBeat = clock.beatAt(at);
  const barSeconds = clock.pin(startBeat) * 4;
  const bar = (n) => clock.timeAt(startBeat + n * 4) - at;
  const handoff = MIX_DEFAULTS.swapAfterBars * barSeconds;
  const errorMs = (bar(MIX_DEFAULTS.swapAfterBars) - handoff) * 1000;
  const ownMs = (MIX_DEFAULTS.swapAfterBars * plans[1].barSeconds - handoff) * 1000;
  const longMs = (bar(64) - 64 * barSeconds) * 1000;
  must(Math.abs(errorMs) < 1e-6, `the arriving theme's swap bar misses the hand-over by ${errorMs.toFixed(4)} ms`);
  must(Math.abs(longMs) < 1e-6, `a 64-bar blend accumulates ${longMs.toFixed(4)} ms of offset`);
  must(Math.abs(ownMs) > 1, 'the two themes are at the same tempo, so this proves nothing; pick a pair that is not');
  return `seed 1's first pair at ${plans[0].bpm} into ${plans[1].bpm} BPM: the swap downbeat coincides to ${errorMs.toFixed(6)} ms where the arriving theme's own tempo would miss it by ${ownMs.toFixed(2)}, and a 64-bar blend accumulates ${longMs.toFixed(6)}`;
});

check('the tempo glide after a hand-over', () => {
  const plans = [0, 1].map((i) => planTheme('1', i, {}));
  const clock = makeSetClock(plans[0].beat, 0);
  const b = clock.beatAt(50);
  const bars = MIX_DEFAULTS.tempoGlideBars ?? 16;
  clock.glide(b, plans[1].beat, bars * 4);
  const bpmAt = (beat) => 60 / clock.spbAt(beat);
  must(Math.abs(bpmAt(b) - plans[0].bpm) < 0.01, `the glide starts at ${bpmAt(b).toFixed(3)}, not ${plans[0].bpm}`);
  must(Math.abs(bpmAt(b + bars * 4) - plans[1].bpm) < 0.01, `the glide ends at ${bpmAt(b + bars * 4).toFixed(3)}, not ${plans[1].bpm}`);
  must(Math.abs(bpmAt(b + bars * 8) - plans[1].bpm) < 0.01, 'the glide does not stay at the tempo it reached');
  let last = -Infinity;
  for (let k = 0; k <= bars * 8; k += 2) {
    const t = clock.timeAt(b + k);
    must(t > last, `the clock is not monotonic at beat ${k}`);
    last = t;
  }
  const trip = clock.beatAt(clock.timeAt(b + 37.5)) - (b + 37.5);
  must(Math.abs(trip) < 1e-6, `beatAt(timeAt()) is ${trip} beats off inside the glide`);
  return `${plans[0].bpm} to ${plans[1].bpm} over ${bars} bars, linear in BPM, monotonic, and beatAt(timeAt()) is exact to ${Math.abs(trip).toExponential(1)} beats`;
});

// --- the push curve writes its zero before a drop --------------------------
// `applyCurve` joins points with ramps, so a drop that wrote one point at its
// own downbeat and nothing before it ramped from wherever the section before
// had left off. On master seed 1 theme 2 that was eleven bars of breakdown
// driven into the drop: the quietest section in the theme measured 4 LU over
// the loudest mains, with no kick in it.
const MASTERS = ['1', '92970', '21323', '15576', '25417', '68299'];
const THEMES = 4;
const curveAt = (pts, bar) => {
  if (bar <= pts[0].bar) return pts[0].value;
  for (let i = 1; i < pts.length; i++) {
    if (bar > pts[i].bar) continue;
    const a = pts[i - 1], b = pts[i];
    const span = b.bar - a.bar;
    return span > 0 ? a.value + (b.value - a.value) * ((bar - a.bar) / span) : b.value;
  }
  return pts[pts.length - 1].value;
};
check('a drop writes its own zero first', () => {
  let drops = 0, afterBuild = 0, ramped = null, worst = 0;
  for (const m of MASTERS) {
    for (let i = 0; i < THEMES; i++) {
      const t = planTheme(m, i, {});
      const pts = pushCurve(t.arrangement, PARAMS.push);
      for (let k = 1; k < pts.length; k++)
        must(pts[k].bar > pts[k - 1].bar, `master ${m} theme ${i}: the push curve has two points at bar ${pts[k].bar}`);
      const secs = t.arrangement.sections;
      for (let k = 0; k < secs.length; k++) {
        const s = secs[k];
        if (s.kind !== 'drop') continue;
        const prev = secs[k - 1];
        if (prev && prev.kind === 'build') { afterBuild++; continue; }
        drops++;
        const before = curveAt(pts, s.startBar - 1);
        if (before > worst) { worst = before; ramped = { m, i, bar: s.startBar, prev: prev && prev.kind }; }
        must(before <= 0.01,
          `master ${m} theme ${i}: the push reads ${before.toFixed(3)} a bar before the drop at ${s.startBar}, which follows a ${prev ? prev.kind : 'nothing'}`);
        must(Math.abs(curveAt(pts, s.startBar) - PARAMS.push.dropLevel) < 1e-9,
          `master ${m} theme ${i}: the drop at bar ${s.startBar} does not reach ${PARAMS.push.dropLevel} on its downbeat`);
      }
    }
  }
  return `${MASTERS.length * THEMES} themes: ${drops} drops that no build precedes all read ${worst.toFixed(3)} a bar before their downbeat and the drop level on it, and ${afterBuild} more ride a build in`;
});

// --- the event list is a list a scheduler can pour ---------------------------
check('the events of 24 themes', () => {
  let n = 0, worstLead = 0;
  for (const m of MASTERS) {
    for (let i = 0; i < THEMES; i++) {
      const t = planTheme(m, i, {});
      const bs = t.barSeconds;
      must(Number.isFinite(bs) && bs > 0, `master ${m} theme ${i} has a bar of ${bs} seconds`);
      let last = -Infinity;
      for (const e of t.events) {
        n++;
        const where = `master ${m} theme ${i}, ${e.voice} at bar ${e.bar}`;
        must(VOICES[e.voice], `${where}: no such voice`);
        must(typeof e.layer === 'string' && e.layer, `${where}: no layer, and the solo-stem renders filter on it`);
        must(Number.isFinite(e.t) && e.t >= 0, `${where}: its time is ${e.t}`);
        must(e.t >= last - 1e-9, `${where}: it comes at ${e.t} after an event at ${last}`);
        last = e.t;
        must(Number.isFinite(e.bar) && e.bar >= 0 && e.bar < t.bars, `${where}: bar ${e.bar} of ${t.bars}`);
        const into = e.t - e.bar * bs;
        must(into >= -1e-9 && into < bs + 1e-9, `${where}: it says bar ${e.bar} and falls ${into.toFixed(4)} s into a ${bs.toFixed(4)} s bar`);
        must(e.t <= t.bars * bs + 1e-6, `${where}: it falls past the end of the theme`);
        for (const k of Object.keys(e.p || {})) {
          const v = e.p[k];
          must(typeof v !== 'number' || Number.isFinite(v), `${where}: p.${k} is ${v}`);
        }
        // The one anticipatory voice: its time is the arrival and p.dur is the
        // lead, so it has to be able to start where it says it does.
        if (e.voice === 'swell') {
          const lead = e.p?.dur ?? 1.6;
          must(Number.isFinite(lead) && lead > 0, `${where}: a swell whose lead is ${lead}`);
          if (lead > worstLead) worstLead = lead;
        }
      }
    }
  }
  return `${n} events over ${MASTERS.length * THEMES} themes: every voice known, every layer named, every time finite, in order, inside its own bar and inside the theme; the longest swell leads its arrival by ${worstLead.toFixed(2)} s`;
});

// --- the dice, and how far a throw reaches ----------------------------------
// The ring's own constants live in src/ring.js, which is a page module and
// cannot be imported here. They are mirrored below and the mirror is checked
// against the source text, so the two cannot drift apart quietly.
const RING = fs.readFileSync(path.join(ROOT, 'src', 'ring.js'), 'utf8');
const BANDS = [[15, 0], [90, 0.25], [360, 0.55], [1080, 1]];
const CANDIDATES = 12;
const TAP_BAND = 0.5;
const SEED_MIN = 1;
const SEED_MAX = 99999;
function bandOf(power) {
  if (!(power > BANDS[0][0])) return 0;
  for (let i = 1; i < BANDS.length; i++) {
    const [p0, q0] = BANDS[i - 1];
    const [p1, q1] = BANDS[i];
    if (power <= p1) return q0 + ((q1 - q0) * Math.log(power / p0)) / Math.log(p1 / p0);
  }
  return 1;
}
const pickCast = (pool, band, floor) => {
  let up = pool.filter((c) => floor(c.parts));
  if (!up.length) up = pool.filter((c) => FLOOR.loud(c.parts));
  if (!up.length) up = pool;
  return { pick: up[Math.max(0, Math.min(up.length - 1, Math.round(band * (up.length - 1))))], up };
};
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

check('the ring\'s cast constants', () => {
  const want = [
    [`const CANDIDATES = ${CANDIDATES};`, 'the pool size'],
    [`const TAP_BAND = ${TAP_BAND};`, 'where a tap reaches'],
    [`const SEED_MIN = ${SEED_MIN};`, 'the first seed'],
    [`const SEED_MAX = ${SEED_MAX};`, 'the last seed'],
    [`const BANDS = ${JSON.stringify(BANDS).replace(/,/g, ', ').replace(/\], \[/g, '], [')};`, 'the power bands'],
  ];
  for (const [line, what] of want)
    must(RING.includes(line), `${what} has moved in src/ring.js: this file still expects \`${line}\``);
  return `${want.length} of them still read in src/ring.js exactly as they are mirrored here`;
});

check('a throw reaches further the harder it is thrown', () => {
  must(bandOf(0) === 0 && bandOf(BANDS[0][0]) === 0, 'a turn under the first mark does not reach the nearest record');
  must(bandOf(BANDS[BANDS.length - 1][0] * 4) === 1, 'the hardest throw does not reach the far end');
  let last = -1;
  for (let p = BANDS[0][0] + 0.5; p <= BANDS[BANDS.length - 1][0]; p += 0.5) {
    const b = bandOf(p);
    must(b > last, `the band is ${b} at power ${p} and was ${last} just under it`);
    must(b >= 0 && b <= 1, `the band is ${b} at power ${p}`);
    last = b;
  }
  for (const [p, q] of BANDS) must(Math.abs(bandOf(p === BANDS[0][0] ? p + 1e-9 : p) - q) < 1e-6 || p === BANDS[0][0],
    `the band at the mark ${p} is ${bandOf(p)} where the table says ${q}`);
  // And the consequence: a wider band lands on a record at least as far away.
  const pool = [0.1, 0.2, 0.35, 0.5, 0.7, 0.9].map((d, i) => ({ seed: String(i), distance: d, parts: { room: 1 } }));
  let far = -1;
  for (let band = 0; band <= 1.0001; band += 0.05) {
    const { pick } = pickCast(pool, band, FLOOR.loud);
    must(pick.distance >= far, `a band of ${band.toFixed(2)} lands nearer than the band under it`);
    far = pick.distance;
  }
  return `zero under ${BANDS[0][0]} degrees of turn, one over ${BANDS[BANDS.length - 1][0]}, strictly increasing between them, and a wider band never lands nearer`;
});

// A tap on the die asks for the room or the key, which is the pair nothing else
// can disguise. Casting four or five times used to land on four or five
// versions of the same record.
check('twenty taps from seed 1', () => {
  const preset = 'auto';
  let here = SEED_MIN;
  let cur = planTheme(String(here), 0, { masterSeed: String(here), preset });
  const walk = [String(here)];
  const rnd = mulberry(20260917);
  let narrowest = 99;
  for (let tap = 0; tap < 20; tap++) {
    const seen = new Set([String(here)]);
    const pool = [];
    for (let i = 0; i < CANDIDATES; i++) {
      const seed = String(SEED_MIN + Math.floor(rnd() * (SEED_MAX - SEED_MIN + 1)));
      if (seen.has(seed)) continue;
      seen.add(seed);
      const plan = planTheme(seed, 0, { masterSeed: seed, preset });
      const d = styleDistance(cur, plan);
      pool.push({ seed, distance: d.distance, parts: d.parts, plan });
    }
    pool.sort((a, b) => a.distance - b.distance);
    const fresh = pool.filter((c) => FLOOR.fresh(c.parts));
    must(fresh.length > 0, `tap ${tap + 1} from seed ${here}: not one of ${pool.length} candidates moves the room or the key`);
    if (fresh.length < narrowest) narrowest = fresh.length;
    const { pick } = pickCast(pool, TAP_BAND, FLOOR.fresh);
    must(FLOOR.fresh(pick.parts), `tap ${tap + 1} landed on seed ${pick.seed}, which is the same room and the same key`);
    must(pick.distance > 0, `tap ${tap + 1} landed on a record no die apart from the one playing`);
    here = pick.seed;
    cur = pick.plan;
    walk.push(String(here));
  }
  must(new Set(walk).size === walk.length, `the walk came back to a seed it had already played: ${walk.join(' ')}`);
  return `${walk.length - 1} taps, each moving the room or the key, none repeating a seed; the narrowest pool of ${CANDIDATES} still offered ${narrowest} records that did`;
});

// --- the loudness fit is the one that was measured --------------------------
//
// Nine themes and what the fit says about them, **stated here rather than read
// out of the code this checks**, the way the seam floor and the ring's cast
// constants are: a check that takes its answer from the thing it is checking
// passes whatever that thing becomes. If a coefficient, a centre, the window
// rule, a column, either slope or a timbre's declared loudness moves, these
// numbers move with it and this fails naming the theme. A theme on each side of
// the target is in the list on purpose, because the two slopes are not one.
//
// They were read off the build of 2026-09-17 that the 120-theme measurement
// blessed (tools/loudness-fit.mjs, tmp/analysis/loudness-fit.md).
const LOUDNESS_PREDICTIONS = [
  // master seed, theme, predicted LUFS, trim dB
  ['1', 0, -12.9961, -0.005],
  ['1', 1, -13.9744, 1.46],
  ['1', 2, -13.5329, 0.799],
  ['92970', 0, -12.5152, -0.633],
  ['21323', 2, -13.5808, 0.87],
  ['15576', 0, -13.2867, 0.43],
  ['15576', 1, -12.1831, -1.066],
  ['25417', 1, -11.8646, -1.482],
  ['68299', 1, -13.1407, 0.211],
];

check('the loudness fit reproduces what it was measured on', () => {
  for (const [seed, n, lufs, trim] of LOUDNESS_PREDICTIONS) {
    const t = planTheme(seed, n, {});
    const got = predictedLufs(t);
    must(Math.abs(got - lufs) < 0.001, `master seed ${seed} theme ${n} is predicted at ${got.toFixed(4)} LUFS where the fit was blessed at ${lufs}`);
    must(t.trimDb === trim, `master seed ${seed} theme ${n} trims ${t.trimDb} dB where the fit was blessed at ${trim}`);
    must(loudnessTrimDb(t) === t.trimDb, `master seed ${seed} theme ${n}: the trim on the plan is ${t.trimDb} and the fit says ${loudnessTrimDb(t)}`);
  }
  // And nothing in a wide sweep leaves the clamp or comes back as anything but
  // a number, because the trim becomes an AudioParam and a NaN there is silence.
  const P = PARAMS.loudness;
  let lo = Infinity, hi = -Infinity, sum = 0, count = 0;
  for (let s = 1; s <= 60; s++) {
    for (let i = 0; i < 3; i++) {
      const t = planTheme(String(s), i, {});
      must(Number.isFinite(t.trimDb), `master seed ${s} theme ${i} trims ${t.trimDb}`);
      must(Math.abs(t.trimDb) <= P.clampDb, `master seed ${s} theme ${i} trims ${t.trimDb} dB, past the ${P.clampDb} dB clamp`);
      // The window the fit reads has to be inside the theme, always.
      const w = loudnessWindow(t);
      must(w.from >= 0 && w.from + w.bars <= t.bars && w.bars >= 1, `master seed ${s} theme ${i}: the loudness window is bars ${w.from}..${w.from + w.bars} of ${t.bars}`);
      lo = Math.min(lo, t.trimDb); hi = Math.max(hi, t.trimDb); sum += t.trimDb; count++;
    }
  }
  // Every coefficient has to name a column that exists, or it is read as zero
  // and the record is levelled by a fit nobody can see is broken.
  for (const k of Object.keys(P.coef)) must(LOUDNESS_COLUMNS[k], `PARAMS.loudness.coef names ${k}, which is not a column in src/loudness.js`);
  const mean = sum / count;
  must(Math.abs(mean) < 0.5, `the trim averages ${mean.toFixed(2)} dB over ${count} themes, so it is moving the record and not levelling it`);
  return `${LOUDNESS_PREDICTIONS.length} themes predicted to a thousandth of a decibel, ${Object.keys(P.coef).length} coefficients all naming a column, and ${count} trims between ${lo.toFixed(2)} and ${hi.toFixed(2)} dB averaging ${mean >= 0 ? '+' : ''}${mean.toFixed(2)}`;
});

check('the style distance is a distance', () => {
  const a = planTheme('1', 0, {});
  const b = planTheme('15576', 1, {});
  must(styleDistance(a, a).distance === 0, 'a theme is not nought away from itself');
  must(Math.abs(styleDistance(a, b).distance - styleDistance(b, a).distance) < 1e-12, 'it is not symmetric');
  let hi = 0, lo = 1;
  for (let s = 2; s <= 61; s++) {
    const d = styleDistance(a, planTheme(String(s), 0, {})).distance;
    must(d >= 0 && d <= 1, `seed ${s} scores ${d}`);
    if (d > hi) hi = d;
    if (d < lo) lo = d;
  }
  must(hi > 0.5, `no seed in sixty gets further than ${hi.toFixed(3)} from seed 1, so the scale is not being used`);
  return `nought against itself, symmetric, and sixty other seeds against seed 1 spread ${lo.toFixed(3)} to ${hi.toFixed(3)}`;
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
