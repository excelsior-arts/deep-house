// mine-v2.ts — the three reference sets as recipe rows, in v2's own terms.
//
//   node packages/deep-house/tools/imprint/mine-v2.ts
//   ... --in tmp/analysis/mine_v2      where mine_sources.py left its numbers
//   ... --rows notes/recipes/mined     where the rows go
//   ... --report notes/analysis/mining-v2.md
//   ... --themes 200                   rolled house-v2 themes for the gap count
//   ... --no-write                     say everything, write nothing
//
// The reading half is `mine_sources.py`: it decodes the sources in memory,
// windows each of v1's fifty-one coherent stretches at eight bars of its own
// tempo, and writes the eight birds and a handful of properties per window.
// **This file never touches audio.** It reads those numbers and answers the
// four questions PLAN-RECIPES' *Mining from reference tracks* asks:
//
//   1. **Does the encoder separate anything on the sources?** The 09-17
//      calibration found a whole-mix imprint separates the two rooms of the
//      record and nothing else, and phase 1 found the same thing from the
//      other end. That was measured on *our* record, where every theme is one
//      generator at one setting. The sources are fifty-one different records
//      by different people, so this is the real test of the instrument, and it
//      is between-stretch spread against within-stretch spread, per bird —
//      the same arithmetic `signatures.ts` puts on a candidate list.
//   2. **Where does the record sit inside the sources?** Per bird: the
//      sources' centre and middle half, `HOUSE`'s distance from that centre,
//      and whether `HOUSE_BOX` lies inside the sources' box, beside it or
//      across it. **Nothing is re-centred here.** A re-centring is a re-bless
//      and is Eugene's (ROADMAP, *Open for Eugene*); this only says where the
//      two stand.
//   3. **What are the dishes?** Clusters at four scopes — `track` over the
//      stretches, `section` over the windows of a labelled section, `layer`
//      over the drum properties alone, `seam` over the hand-overs — with k
//      chosen by the data (silhouette, with Hennig's clusterwise bootstrap
//      beside it) and one row per cluster.
//   4. **What is missing?** Which of v1's seventeen archetypes fall inside a
//      mined box, which mined boxes nothing in the record reaches, and how
//      many of two hundred themes rolled under `house-v2` land in each.
//
// ## Two rules this file keeps and states
//
// **A mined row names nothing.** `origin: 'mined'`, provenance is the set
// number, the segment's start and duration in seconds and the date; `score` is
// `{chef: 0, likes: 0}` and `verdicts` is empty, because those are the two
// fields no tool may derive. Every row is run through `src/recipe.ts`'s own
// validator before it is written, against the same vocabulary the app holds it
// to, and a row that does not pass is not written.
//
// **Every class word is cut out of the corpus's own quartiles.** "Busy hats",
// "a bright mix", "a wide stage" are all thresholds, and a threshold chosen by
// eye is a number nobody measured. The cut points are computed here, printed in
// the report, and carried on every row that uses one.
//
// **A regeneration carries every verdict, note and chef's score across by the
// music and never by the file** (`human-fields.ts`, after M1 of the mining review of 09-19: a
// plain re-run of this tool erased six verdicts and three chef scores). The
// rows are read off disk before anything is written, each regenerated row
// takes the human fields of the previous row that is the same medoid, and a
// previous row with an opinion on it that no new row is the music of is an
// **orphan**: the run says its name and **refuses to write** unless it is told
// `--orphans-ok`, in which case the orphan is moved to `orphans/` beside the
// rows and never deleted. `--rows` may point at a scratch copy, which is how
// the rule is proved.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync as run } from 'node:child_process';
import * as registry from '@deep-house/engine/voices';
import { BIRDS, HOUSE, HOUSE_BOX } from '../../src/spell.ts';
import { validate, vocabularyOf, boxOf } from '../../src/recipe.ts';
import { strategyById } from '../../src/strategies/index.ts';
import { planTheme } from '../../src/mix.ts';
import { ROOT } from './render.ts';
import { carryAcross, hasOpinion, identityOf } from './human-fields.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const IN = path.resolve(ROOT, arg('in', path.join('tmp', 'analysis', 'mine_v2')));
const ROWS = path.resolve(ROOT, arg('rows', path.join('notes', 'recipes', 'mined')));
const REPORT = path.resolve(ROOT, arg('report', path.join('notes', 'analysis', 'mining-v2.md')));
const CANDIDATES = path.resolve(ROOT, arg('cookbook', path.join('notes', 'recipes', 'candidates')));
const SESSION = path.resolve(ROOT, arg('session', path.join('notes', 'reviews', 'cookbook.json')));
const THEMES = +arg('themes', 200);
const WRITE = !has('no-write');
const TODAY = arg('date', new Date().toISOString().slice(0, 10));

const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);
const num = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
const median = (xs) => { const a = num(xs).slice().sort((p, q) => p - q); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const quantile = (xs, q) => {
  const a = num(xs).slice().sort((p, q2) => p - q2);
  if (!a.length) return null;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
};
const mean = (xs) => { const a = num(xs); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const sd = (xs) => { const a = num(xs); if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

// --- what was measured -------------------------------------------------------

const windowsDoc = JSON.parse(fs.readFileSync(path.join(IN, 'windows.json'), 'utf8'));
const seamsDoc = fs.existsSync(path.join(IN, 'seams.json'))
  ? JSON.parse(fs.readFileSync(path.join(IN, 'seams.json'), 'utf8')) : { seams: [] };
const stretches = windowsDoc.stretches;
const allWindows = [];
for (const s of stretches) {
  // How much of each window is each section. v1's arrangement is a list of runs
  // in bars, so an eight-bar window that straddles a boundary is read as the
  // share it holds of each side rather than as one label or as nothing: a drop
  // is a median of eight bars and a window grid that has to fall exactly on one
  // of them would find almost none.
  const labels = [];
  for (const [name, bars] of (s.sections || [])) for (let i = 0; i < bars; i += 1) labels.push(name);
  for (const w of s.windows) {
    const span = labels.slice(w.barFrom, w.barFrom + (w.bars || 8));
    const counts = new Map();
    for (const l of span) counts.set(l, (counts.get(l) || 0) + 1);
    let top = null, n = 0;
    for (const [l, c] of counts) if (c > n) { top = l; n = c; }
    allWindows.push({ ...w, set: s.set, track: s.track, bpm: s.bpm, key: s.key, mode: s.mode,
      stretchStart: s.start_s, stretchDur: s.dur_s, stretchId: `${s.set}/${s.track}`,
      sectionTop: top, sectionShare: span.length ? n / span.length : 0 });
  }
}
// A window belongs to the section that holds **most** of it, and never to one
// that holds less than five of its eight bars.
const MAJORITY = 5 / 8;
for (const w of allWindows) w.sectionOf = (w.sectionShare >= MAJORITY ? w.sectionTop : null);
// The fair comparison with the record's own 32-bar main groove: a window whose
// whole eight bars carry one `groove` label. If v1's arrangement reading is not
// on the data at all, every window stands in for it and the report says so.
const pureGroove = allWindows.filter((w) => w.section === 'groove' && w.sectionPure);
const grooveIsAll = pureGroove.length < 50;
const groove = grooveIsAll ? allWindows : pureGroove;

// --- the class words, cut out of the corpus's own quartiles ------------------

/**
 * A word per property, and the cut points that made it. Terciles, not halves:
 * three words is the fewest that can say *and the middle is the usual thing*,
 * which is what a recipe's `wants` needs so that a row can be silent about a
 * property by simply carrying the middle word.
 *
 * `hats` is the exception and takes four, because its two shares are two
 * questions — how much of the bar is the offbeat eighth, and how much of it is
 * the sixteenths between — and the corpus answers them separately.
 */
function cuts() {
  const centroid = groove.map((w) => w.props.centroidLogHz);
  const lowShare = groove.map((w) => w.props.lowShareDb);
  const sus = groove.map((w) => w.props.sustainBarDb);
  const width = groove.map((w) => w.props.width && w.props.width.sideMidDb);
  const six = groove.map((w) => w.props.hatShares && w.props.hatShares.sixteenth);
  const off = groove.map((w) => w.props.hatShares && w.props.hatShares.offbeat);
  return {
    brightness: { at: [quantile(centroid, 1 / 3), quantile(centroid, 2 / 3)], words: ['dark', 'warm', 'bright'], of: 'centroidLogHz' },
    lowMass: { at: [quantile(lowShare, 1 / 3), quantile(lowShare, 2 / 3)], words: ['light', 'full', 'heavy'], of: 'lowShareDb' },
    sustain: { at: [quantile(sus, 1 / 3), quantile(sus, 2 / 3)], words: ['short', 'decaying', 'held'], of: 'sustainBarDb' },
    width: { at: [quantile(width, 1 / 3), quantile(width, 2 / 3)], words: ['narrow', 'centred', 'wide'], of: 'sideMidDb' },
    hatSixteenth: { at: [quantile(six, 1 / 3), quantile(six, 2 / 3)], words: null, of: 'hatShares.sixteenth' },
    hatOffbeat: { at: [quantile(off, 1 / 3), quantile(off, 2 / 3)], words: null, of: 'hatShares.offbeat' },
  };
}
const CUT = cuts();

const wordOf = (spec, v) => (v == null || !Number.isFinite(v) ? null
  : v < spec.at[0] ? spec.words[0] : v < spec.at[1] ? spec.words[1] : spec.words[2]);

/**
 * The hat word, off the two shares rather than off one. A bar whose sixteenth
 * share is in the corpus's top third is `sixteenths` whatever else it does; of
 * what is left, a bar whose offbeat share is in the top third is `offbeat` —
 * the genre's own default figure, `..x...x...x...x.`, 591 bars of `CORPUS.md`
 * §4 — and the rest is `eighths`. A window with no high band at all is `none`.
 */
function hatWord(shares) {
  if (!shares) return 'none';
  if (shares.sixteenth >= CUT.hatSixteenth.at[1]) return 'sixteenths';
  if (shares.offbeat >= CUT.hatOffbeat.at[1]) return 'offbeat';
  if (shares.offbeat >= CUT.hatOffbeat.at[0]) return 'eighths';
  return 'beats';
}

for (const w of allWindows) {
  w.words = {
    hats: hatWord(w.props.hatShares),
    brightness: wordOf(CUT.brightness, w.props.centroidLogHz),
    lowMass: wordOf(CUT.lowMass, w.props.lowShareDb),
    sustain: wordOf(CUT.sustain, w.props.sustainBarDb),
    width: wordOf(CUT.width, w.props.width && w.props.width.sideMidDb),
  };
}

// --- 1. does the encoder separate anything on the sources? -------------------

/**
 * Between against within, per bird, over a grouping of the windows.
 *
 * The same shape `signatures.ts` reports for a candidate list: `between` is the
 * spread of the group means, `within` the mean spread inside a group, and a
 * bird separates that grouping where the first is at least the second. It is
 * the honest form of "does this instrument tell these things apart", because a
 * bird with a large spread everywhere separates nothing however large it is.
 */
function separation(rows, keyOf) {
  const groups = new Map();
  for (const w of rows) {
    const k = keyOf(w);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  const out = {};
  for (const b of BIRDS) {
    const means = [], withins = [];
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      means.push(mean(g.map((w) => w.birds[b])));
      withins.push(sd(g.map((w) => w.birds[b])));
    }
    const between = sd(means), within = mean(withins);
    out[b] = { between: r4(between), within: r4(within), ratio: r3(within ? between / within : null) };
  }
  return { groups: groups.size, birds: out };
}

// --- 2. the measured box against ours ----------------------------------------

/** Where the record's own box stands to the sources', per bird. */
function boxTable(rows) {
  const out = [];
  for (const b of BIRDS) {
    const xs = rows.map((w) => w.birds[b]);
    const c = median(xs), p25 = quantile(xs, 0.25), p75 = quantile(xs, 0.75);
    const half = (p75 - p25) / 2;
    const lo = HOUSE[b] - HOUSE_BOX[b], hi = HOUSE[b] + HOUSE_BOX[b];
    const overlap = Math.min(hi, p75) - Math.max(lo, p25);
    const where = overlap <= 0 ? 'beside' : (lo >= p25 && hi <= p75) ? 'inside' : 'across';
    out.push({
      bird: b, centre: r3(c), p25: r3(p25), p75: r3(p75), halfIqr: r3(half),
      house: HOUSE[b], houseBox: HOUSE_BOX[b],
      gap: r3(HOUSE[b] - c), gapInIqr: r3(half ? (HOUSE[b] - c) / half : null),
      where, overlap: r3(overlap),
    });
  }
  return out;
}

// --- the distance a cluster is cut with --------------------------------------

/**
 * Two halves with no exchange rate between them, so each is divided by its own
 * mean over every pair — the same device `cookbook.ts` used for the same
 * reason. The bird half is the eight in units of the **sources'** own spread
 * (this is a description of the sources, so their spread is the ruler), each
 * weighted by that window's confidence in that bird; the property half is the
 * rates, the hat shares, the sustain, the brightness, the low mass and the
 * width, each in units of its own spread over the corpus.
 */
function makeDistance(rows, { birds = true, props = true, only = null } = {}) {
  const spread = {};
  for (const b of BIRDS) spread[b] = Math.max(1e-6, (quantile(rows.map((w) => w.birds[b]), 0.75) - quantile(rows.map((w) => w.birds[b]), 0.25)) / 1.349);
  const propOf = (w) => ({
    kick: w.props.rates.kick, figure: w.props.rates.figure, offbeat: w.props.rates.offbeat,
    sixteenth: w.props.hatShares ? w.props.hatShares.sixteenth : null,
    hatOffbeat: w.props.hatShares ? w.props.hatShares.offbeat : null,
    sustain: w.props.sustainBarDb, bright: w.props.centroidLogHz, low: w.props.lowShareDb,
    width: w.props.width ? w.props.width.sideMidDb : null,
  });
  const keys = only || Object.keys(propOf(rows[0]));
  const pspread = {};
  for (const k of keys) {
    const xs = rows.map((w) => propOf(w)[k]);
    pspread[k] = Math.max(1e-6, (quantile(xs, 0.75) - quantile(xs, 0.25)) / 1.349);
  }
  const raw = (a, b2) => {
    let bd = 0, bw = 0, pd = 0, pn = 0;
    if (birds) {
      for (const bird of BIRDS) {
        const w = Math.min(a.confidence[bird], b2.confidence[bird]);
        bd += w * ((a.birds[bird] - b2.birds[bird]) / spread[bird]) ** 2;
        bw += w;
      }
    }
    if (props) {
      const pa = propOf(a), pb = propOf(b2);
      for (const k of keys) {
        if (pa[k] == null || pb[k] == null) continue;
        pd += ((pa[k] - pb[k]) / pspread[k]) ** 2;
        pn += 1;
      }
    }
    return [bw ? Math.sqrt(bd / bw) : 0, pn ? Math.sqrt(pd / pn) : 0];
  };
  // The two halves' own means over a sample of pairs, so neither can dominate
  // by being measured in a bigger unit.
  let sb = 0, sp = 0, n = 0;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const [x, y] = raw(rows[i], rows[j]); sb += x; sp += y; n += 1;
      if (n > 40000) break;
    }
    if (n > 40000) break;
  }
  const mb = sb / Math.max(1, n) || 1, mp = sp / Math.max(1, n) || 1;
  return (a, b2) => {
    const [x, y] = raw(a, b2);
    if (!birds) return y / mp;
    if (!props) return x / mb;
    return 0.5 * (x / mb) + 0.5 * (y / mp);
  };
}

// --- k-medoids, silhouette, stability ----------------------------------------

function medoidCluster(rows, dist, k, seed = 1) {
  const n = rows.length;
  const D = [];
  for (let i = 0; i < n; i += 1) { D.push(new Float64Array(n)); }
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) { const d = dist(rows[i], rows[j]); D[i][j] = d; D[j][i] = d; }
  // k-means++ over the distance matrix, off a stated stream so a run repeats.
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const med = [Math.floor(rnd() * n)];
  while (med.length < k) {
    const d2 = [];
    for (let i = 0; i < n; i += 1) d2.push(Math.min(...med.map((m) => D[i][m])) ** 2);
    const tot = d2.reduce((a, b) => a + b, 0);
    let x = rnd() * tot, pick = 0;
    for (let i = 0; i < n; i += 1) { x -= d2[i]; if (x <= 0) { pick = i; break; } }
    if (med.includes(pick)) pick = d2.indexOf(Math.max(...d2));
    med.push(pick);
  }
  let assign = new Int32Array(n);
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < med.length; c += 1) if (D[i][med[c]] < bd) { bd = D[i][med[c]]; best = c; }
      if (assign[i] !== best) { assign[i] = best; moved = true; }
    }
    for (let c = 0; c < med.length; c += 1) {
      const members = []; for (let i = 0; i < n; i += 1) if (assign[i] === c) members.push(i);
      if (!members.length) continue;
      let best = med[c], bd = Infinity;
      for (const m of members) { const t = members.reduce((a, o) => a + D[m][o], 0); if (t < bd) { bd = t; best = m; } }
      if (med[c] !== best) { med[c] = best; moved = true; }
    }
    if (!moved) break;
  }
  // The silhouette, which is the number the task asks the data to speak in.
  let sil = 0, counted = 0;
  for (let i = 0; i < n; i += 1) {
    const own = []; const other = new Map();
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      if (assign[j] === assign[i]) own.push(D[i][j]);
      else { if (!other.has(assign[j])) other.set(assign[j], []); other.get(assign[j]).push(D[i][j]); }
    }
    if (!own.length || !other.size) continue;
    const a = mean(own), b = Math.min(...[...other.values()].map((xs) => mean(xs)));
    sil += (b - a) / Math.max(a, b); counted += 1;
  }
  return { medoids: med, assign: Array.from(assign), silhouette: counted ? sil / counted : 0, D };
}

/** Hennig's clusterwise bootstrap: four fifths, many times, best Jaccard. */
function stability(rows, dist, k, runs = 20, seed = 11) {
  const full = medoidCluster(rows, dist, k, seed);
  const sets = [];
  for (let c = 0; c < k; c += 1) sets.push(new Set(rows.map((r, i) => (full.assign[i] === c ? i : -1)).filter((i) => i >= 0)));
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const best = sets.map(() => []);
  for (let run = 0; run < runs; run += 1) {
    const idx = rows.map((_, i) => i).filter(() => rnd() < 0.8);
    if (idx.length < k * 3) continue;
    const sub = idx.map((i) => rows[i]);
    const r = medoidCluster(sub, dist, k, seed + run + 1);
    const subSets = [];
    for (let c = 0; c < k; c += 1) subSets.push(new Set(idx.filter((_, j) => r.assign[j] === c)));
    for (let c = 0; c < k; c += 1) {
      let bj = 0;
      for (const t of subSets) {
        let inter = 0; for (const i of sets[c]) if (t.has(i)) inter += 1;
        const union = sets[c].size + t.size - inter;
        if (union) bj = Math.max(bj, inter / union);
      }
      best[c].push(bj);
    }
  }
  const per = best.map((xs) => mean(xs) || 0);
  return { full, perCluster: per.map(r3), mean: r3(mean(per)), spread: r3(sd(per)) };
}

/**
 * The points too far from everything to be a dish, taken out before k is
 * chosen.
 *
 * A medoid clustering handed one record that stands well away from the other
 * fifty spends a whole cluster on it, and then every larger k spends another —
 * which is what happened here before this existed: **every k from two to eight
 * left a cluster of one or two**, so the pick fell back to the smallest and the
 * answer was a 49-and-2 split, which is outlier detection wearing a
 * clustering's clothes. So the outliers are named first and separately: a point
 * whose third-nearest neighbour is further than the stated quantile of that
 * distance over all the points is not a member of any dish, and the report says
 * which records they were. It is the same honesty as `missing` on a window —
 * a thing that could not be grouped is reported, not quietly folded into the
 * nearest group.
 */
function trimOutliers(rows, dist, q = 0.9) {
  if (rows.length < 12) return { kept: rows, dropped: [] };
  const third = rows.map((a) => {
    const ds = rows.filter((b) => b !== a).map((b) => dist(a, b)).sort((x, y) => x - y);
    return ds[2];
  });
  const cut = quantile(third, q);
  const kept = [], dropped = [];
  rows.forEach((r, i) => (third[i] > cut ? dropped : kept).push(r));
  return { kept, dropped, cut: r3(cut) };
}

/**
 * Let the data pick k.
 *
 * **By the bootstrap and not by the silhouette**, and that is a decision with a
 * measurement under it: on this corpus the silhouette sits between 0.09 and
 * 0.21 at every k tried, which is what a silhouette does on a continuum — it
 * has no maximum to find, so picking its maximum is picking noise. Hennig's
 * clusterwise bootstrap does not rise with k on its own (it is the reason
 * `cookbook.ts` used it on the record), so it is the picker, and the silhouette
 * is reported at every k beside it. Under about 0.6 the bootstrap is saying
 * *this is a cut through a continuum and not a dish*, and where it says that,
 * the report says it too.
 */
function pickK(rows, dist, lo, hi, runs = 20, minMembers = 3) {
  const tried = [];
  const runsOf = [];
  for (let k = lo; k <= Math.min(hi, Math.floor(rows.length / 3)); k += 1) {
    const st = stability(rows, dist, k, runs, 11);
    const sizes = new Array(k).fill(0);
    for (const c of st.full.assign) sizes[c] += 1;
    const smallest = Math.min(...sizes);
    tried.push({ k, silhouette: r3(st.full.silhouette), stability: st.mean, spread: st.spread, smallest });
    // **A k that leaves a cluster of one or two is not considered.** A row's box
    // is the middle half of its members on each bird, and a middle half of one
    // member is a point with no width in it — a recipe that can only ever be
    // satisfied by the exact record it was cut from, which is the opposite of
    // what a box is for.
    if (smallest >= minMembers) runsOf.push({ k, st });
  }
  if (!runsOf.length) {
    const st = stability(rows, dist, lo, runs, 11);
    return { best: { k: lo, stability: st.mean, silhouette: st.full.silhouette, spread: st.spread, result: st.full }, top: { k: lo, stability: st.mean }, tried };
  }
  const top = runsOf.reduce((a, b) => (b.st.mean > a.st.mean ? b : a));
  // **A tie on a continuum is broken towards fewer dishes.** The best k here
  // beats the second by less than the bootstrap's own spread, and a difference
  // smaller than the instrument's noise is not a difference: the smallest k
  // whose stability is inside one spread of the best is taken, because a dish
  // nobody can tell from its neighbour is not a dish.
  const floor = top.st.mean - top.st.spread;
  const chosen = runsOf.find((r) => r.st.mean >= floor) || top;
  return {
    best: { k: chosen.k, stability: chosen.st.mean, silhouette: chosen.st.full.silhouette,
      spread: chosen.st.spread, result: chosen.st.full },
    top: { k: top.k, stability: top.st.mean },
    tried,
  };
}

// --- the rows ----------------------------------------------------------------

const vocab = vocabularyOf(strategyById('house-v1').style, registry);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54);

/**
 * One cluster, as a row. The box is the members' middle half on each bird —
 * PLAN-IMPRINT §4: *`summary.birds[b].p25/p75` is the range a recipe is cut
 * from* — and never a mean plus a guessed width; the wants are the class words
 * and the per-role rates the members agree on; the weight is the share of the
 * pool the cluster holds.
 *
 * `rates` is keyed by the three composition roles the three bands stand in for
 * — `kick`, `figure`, `offbeat` — and that mapping is the one honest liberty
 * in the row: they are band proxies and not separated sources. The provenance
 * says so in a line, because a reader of the row in a year will not otherwise
 * know that `rates.figure` counted a clap.
 */
/**
 * The box a cluster is cut from, and the two things a box has to be true of
 * before it is a target for anything (M4 of the mining review, 09-19): **it
 * contains its own medoid**, and **it contains a stated share of its own
 * members on all eight birds at once**.
 *
 * The middle half on each bird separately is what PLAN-IMPRINT §4 says a
 * recipe is cut from, and on eight axes at once it is almost nothing:
 * `0.5^8` of independent points is a third of one percent, and measured, none
 * of the eight boxes of the first mining pass contained its medoid and the two
 * track boxes contained none of the fifty-one records. So the band is widened
 * symmetrically — the same quantile on every bird, from the quartiles outward —
 * until at least half the members sit inside on every bird together, and then
 * each bird's range is stretched the last hair it takes to include the medoid.
 * What the widening did is written on the row (`reading.coverage`), so a box is
 * a number with its own coverage beside it and never a promise.
 */
const JOINT_COVERAGE = 0.5;
function boxFor(members, medoid) {
  let q = 0.25;
  let box = {};
  let inside = 0;
  const cut = (qq) => {
    const out = {};
    for (const b of BIRDS) {
      const xs = members.map((w) => w.birds[b]);
      out[b] = [Math.max(0, quantile(xs, qq)), Math.min(1, quantile(xs, 1 - qq))];
    }
    return out;
  };
  const countIn = (bx, rows) => rows.filter((w) => BIRDS.every((b) => w.birds[b] >= bx[b][0] && w.birds[b] <= bx[b][1])).length;
  for (;;) {
    box = cut(q);
    inside = countIn(box, members);
    if (inside >= members.length * JOINT_COVERAGE || q <= 0) break;
    q = Math.max(0, +(q - 0.025).toFixed(3));
  }
  for (const b of BIRDS) {
    box[b] = [r3(Math.min(box[b][0], medoid.birds[b])), r3(Math.max(box[b][1], medoid.birds[b]))];
  }
  return { box, quantile: q, membersInside: countIn(box, members), countIn };
}

function rowFrom({ scope, applies, id, name, members, pool, poolRows = null, everyRow = null, medoid, extra = {}, wants = {} }) {
  const cutBox = boxFor(members, medoid);
  const birds = cutBox.box;
  const coverage = {
    quantile: cutBox.quantile,
    members: { inside: cutBox.membersInside, of: members.length },
    ...(poolRows ? { pool: { inside: cutBox.countIn(birds, poolRows), of: poolRows.length } } : {}),
    ...(everyRow ? { every: { inside: cutBox.countIn(birds, everyRow), of: everyRow.length } } : {}),
    medoidInside: BIRDS.every((b) => medoid.birds[b] >= birds[b][0] && medoid.birds[b] <= birds[b][1]),
  };
  const conf = {};
  for (const b of BIRDS) conf[b] = r3(median(members.map((w) => w.confidence[b])));
  const rates = {};
  for (const role of ['kick', 'figure', 'offbeat']) {
    const m = median(members.map((w) => w.props.rates[role]));
    if (m != null) rates[role] = { perBar: r3(m), min: r3(quantile(members.map((w) => w.props.rates[role]), 0.25)), max: r3(quantile(members.map((w) => w.props.rates[role]), 0.75)) };
  }
  const agree = (f) => {
    const counts = new Map();
    for (const w of members) { const v = f(w); if (v == null) continue; counts.set(v, (counts.get(v) || 0) + 1); }
    let best = null, n = 0;
    for (const [v, c] of counts) if (c > n) { best = v; n = c; }
    return n / Math.max(1, members.length) >= 0.5 ? best : null;
  };
  const figures = {};
  const hats = agree((w) => w.words.hats); if (hats) figures.hatDensity = hats;
  const bright = agree((w) => w.words.brightness); if (bright) figures.brightness = bright;
  const low = agree((w) => w.words.lowMass); if (low) figures.lowMass = low;
  const sus = agree((w) => w.words.sustain); if (sus) figures.sustain = sus;
  const wide = agree((w) => w.words.width);
  const row = {
    schema: 1, kind: 'recipe', id, interpreter: 'v1',
    scope, applies, name, origin: 'mined',
    birds,
    wants: { ...wants, rates, figures, ...(wide ? { mix: { width: wide } } : {}) },
    forbids: [],
    weight: r3(members.length / Math.max(1, pool)),
    score: { chef: 0, likes: 0 },
    verdicts: [],
    provenance: {
      tool: 'packages/deep-house/tools/imprint/mine-v2.ts',
      reading: 'packages/deep-house/tools/imprint/mine_sources.py',
      date: TODAY,
      anchors: windowsDoc.anchors,
      sources: windowsDoc.sources,
      segmentation: windowsDoc.segmentation,
      segmentationNote:
        "v1's own coherent stretches, reused and not re-cut (CORPUS.md: a key segment is not "
        + 'guaranteed to be one track — two tracks in the same key back to back merge into one '
        + 'entry and a track that modulates splits into two).',
      medoidSet: medoid.set,
      medoidStart: medoid.stretchStart,
      medoidDuration: medoid.stretchDur,
      medoidWindowFrom: medoid.from,
      medoidWindowSeconds: medoid.seconds,
      medoidBars: medoid.bars,
      members: members.length,
      pool,
      box: `the members' ${r3(100 * coverage.quantile)}th to ${r3(100 * (1 - coverage.quantile))}th percentile on every bird — the middle half widened symmetrically until at least ${Math.round(100 * JOINT_COVERAGE)}% of the members sit inside on all eight birds at once — then stretched to include the medoid; the coverage is in reading.coverage`,
      rates:
        'onsets per bar in three bands — 40-120 Hz, 300-2000 Hz, 6-11 kHz — keyed by the role each '
        + 'band stands in for. They are band proxies and not source separation: a bassline that moves '
        + 'inside the low band is a low-band onset and a clap is a mid-band one.',
      words: 'every class word is a tercile of the corpus itself; the cut points are in notes/analysis/mining-v2.md',
      name: 'the class words at least half the members agree on, and the medoid\'s own where they do not — '
        + 'so a name may describe the medoid where `wants` stays silent, which is the honest way round: '
        + 'a name is a description and a want is an instruction.',
      note: 'A candidate, not a row of the library. Only `score` and `verdicts` are Eugene\'s, and no tool writes them.',
      ...extra,
    },
    reading: {
      confidence: conf,
      coverage,
      centre: Object.fromEntries(BIRDS.map((b) => [b, r3(median(members.map((w) => w.birds[b])))])),
      medoid: { birds: medoid.birds, confidence: medoid.confidence,
        note: 'one member of the cluster, the nearest to its middle — not an average' },
    },
  };
  return row;
}

/**
 * The rows already on disk, read before anything is written: the previous
 * regeneration's, with whatever a person has since said about them.
 */
function readPreviousRows() {
  if (!fs.existsSync(ROWS)) return [];
  return fs.readdirSync(ROWS).filter((f) => f.endsWith('.json')).map((f) => {
    try { return { file: f, row: JSON.parse(fs.readFileSync(path.join(ROWS, f), 'utf8')) }; } catch { return null; }
  }).filter((x) => x && x.row && x.row.kind === 'recipe');
}
const previousRows = readPreviousRows();

/** The file a row lives in: its id's last segment, which carries the rank and the slug. */
const fileOf = (row) => `${row.id.split('/').pop()}.json`;

/**
 * Validate a row against the app's own gate. **Nothing is written here**: the
 * rows are written together at the end, after the previous rows' human fields
 * have been carried onto them and the orphan gate has passed, so a run that
 * would lose a verdict writes nothing at all.
 */
function writeRow(row) {
  row.provenance.identity = identityOf(row);
  const problems = validate(row, vocab);
  if (problems.length) {
    console.error(`  REFUSED ${row.id}: ${problems.join('; ')}`);
    return { row, problems };
  }
  return { row, problems: [] };
}

/**
 * The write, once, after the carry: every valid row to its file with the
 * previous row's human fields on it, the orphans named and kept, and the
 * previous files that are now the same music under another name moved aside
 * rather than left to be read twice.
 */
function flushRows(written) {
  const valid = written.filter((w) => !w.problems.length);
  const { rows, carried, orphans } = carryAcross(valid.map((w) => w.row), previousRows.map((p) => p.row));
  valid.forEach((w, i) => { w.row = rows[i]; });
  for (const c of carried) console.error(`  carried ${c.verdicts} verdict${c.verdicts === 1 ? '' : 's'}, chef ${c.chef}${c.picked !== undefined ? `, picked ${c.picked}` : ''} onto ${c.identity}`);
  if (orphans.length) {
    console.error(`  ${orphans.length} previous row${orphans.length === 1 ? '' : 's'} with an opinion on ${orphans.length === 1 ? 'it' : 'them'} would be orphaned by this regeneration:`);
    for (const o of orphans) console.error(`    ${o.id} (${identityOf(o) || 'no identity'}): ${Array.isArray(o.verdicts) ? o.verdicts.length : 0} verdicts, chef ${o.score ? o.score.chef : 0}`);
    if (!has('orphans-ok')) {
      console.error('  nothing written. A verdict is the one field no tool derives; re-run with --orphans-ok to keep the orphans in orphans/ beside the rows.');
      process.exit(3);
    }
  }
  if (!WRITE) return { carried, orphans };
  fs.mkdirSync(ROWS, { recursive: true });
  const newFiles = new Set(valid.map((w) => fileOf(w.row)));
  const newIdentities = new Set(valid.map((w) => identityOf(w.row)).filter(Boolean));
  for (const w of valid) fs.writeFileSync(path.join(ROWS, fileOf(w.row)), `${JSON.stringify(w.row, null, 2)}\n`);
  // The previous files this run did not rewrite: an orphan (an opinion on music
  // no row is now) goes to orphans/, and a row that is now the same music under
  // another file name, or a derived row nobody said anything about, goes to
  // superseded/. Nothing is deleted.
  for (const p of previousRows) {
    if (newFiles.has(p.file)) continue;
    const dir = hasOpinion(p.row) && !newIdentities.has(identityOf(p.row)) ? 'orphans' : 'superseded';
    fs.mkdirSync(path.join(ROWS, dir), { recursive: true });
    fs.renameSync(path.join(ROWS, p.file), path.join(ROWS, dir, p.file));
    console.error(`  ${dir}/${p.file}`);
  }
  return { carried, orphans };
}

// --- a theme's birds, guessed off its plan ----------------------------------

/**
 * What two hundred rolled themes read as, **without rendering one of them**.
 *
 * `src/styles/deep-house-signatures.json` holds, per candidate of every list a
 * die draws, the mean of the eight birds over the themes that rolled it. A
 * theme's estimate is the sweep's own centre plus, for every list, how far its
 * drawn candidate's mean stands from that list's own mean — an additive-effects
 * guess, on the **same scale** as everything else here (`anchors.json`), which
 * is the whole reason the layer signatures are not used instead: those are
 * measured on `anchors-layer.json` and the file says in so many words that a
 * row on one scale may never be compared with a row on the other.
 *
 * It is reported two ways, because the honest and the useful answers differ:
 *
 *   **strict** — only the birds a list actually *separates* (its between-spread
 *     at or above its within-spread) contribute. Phase 1's finding is that
 *     exactly one list qualifies, `rooms`, on Veil and Spark, so a strict
 *     estimate is *the house centre with the room's own Veil and Spark on it*
 *     and a theme's plan predicts nothing else. That is not a defect of this
 *     function; it is the measurement.
 *   **loose** — every list contributes whatever its candidates' means differ
 *     by. It moves, and most of what it adds is noise the sample does not
 *     support. It is here so the count below is not a single number wearing a
 *     confidence it has not got.
 */
function planBirds(signatures, dice, strict) {
  const map = {
    rooms: dice.preset, leadTimbres: dice.leadTimbre, padPartners: dice.padTimbre,
    stabPartners: dice.stabTimbre, densities: dice.density, voicingStyles: dice.voicingStyle,
    fxPalettes: dice.fxPalette, melodyBars: dice.melodyBars,
  };
  const out = { ...signatures.centre };
  for (const [list, drawn] of Object.entries(map)) {
    const spec = signatures.lists[list];
    if (!spec || drawn == null) continue;
    const cand = spec.candidates[String(drawn)];
    // A candidate with no mean is one the sweep never rolled; it carries no
    // reading and must not be turned into a zero.
    if (!cand || !cand.mean) continue;
    let tot = 0; const listMean = {};
    for (const c of Object.values(spec.candidates)) {
      if (!c.mean || !c.n) continue;
      tot += c.n;
      for (const b of BIRDS) listMean[b] = (listMean[b] || 0) + c.mean[b] * c.n;
    }
    if (!tot) continue;
    for (const b of BIRDS) {
      if (strict && !(spec.drives || []).includes(b)) continue;
      out[b] += cand.mean[b] - listMean[b] / Math.max(1, tot);
    }
  }
  for (const b of BIRDS) out[b] = Math.min(1, Math.max(0, out[b]));
  return out;
}

const inBox = (box, point) => BIRDS.every((b) => point[b] >= box[b][0] && point[b] <= box[b][1]);
const outBy = (box, point) => BIRDS
  .map((b) => (point[b] < box[b][0] ? box[b][0] - point[b] : point[b] > box[b][1] ? point[b] - box[b][1] : 0));

// --- the run -----------------------------------------------------------------

const out = [];
const written = [];
const say = (s = '') => { out.push(s); };

const nWindows = allWindows.length;
console.error(`  ${stretches.length} stretches, ${nWindows} windows, ${groove.length} whole-groove windows`);

// §1 — what the encoder separates on the sources.
const sepStretch = separation(allWindows, (w) => w.stretchId);
const sepSection = separation(allWindows, (w) => w.sectionOf);
const sepSet = separation(allWindows, (w) => w.set);

// §3 — the clusters.
/**
 * A stretch as one point: the median of its own windows, which is the rule
 * (`PLAN-IMPRINT` §2 — a piece is the median and the spread of its own windows,
 * never one number over its whole length).
 *
 * `keep` narrows which windows count, so the same function gives the point a
 * track recipe is cut from (all of it, breakdown included) and the point the
 * box table compares with the record (its groove only, which is what the
 * record's own 32-bar main-groove window is).
 */
function stretchPoint(s, keep = null) {
  const ws = keep ? (s.windows.filter(keep).length ? s.windows.filter(keep) : s.windows) : s.windows;
  const pick = (f) => median(ws.map(f));
  const point = {
    stretchId: `${s.set}/${s.track}`, set: s.set, track: s.track,
    stretchStart: s.start_s, stretchDur: s.dur_s, from: s.start_s, seconds: s.dur_s, bars: null,
    bpm: s.bpm, key: s.key, mode: s.mode,
    birds: Object.fromEntries(BIRDS.map((b) => [b, r4(pick((w) => w.birds[b]))])),
    confidence: Object.fromEntries(BIRDS.map((b) => [b, r3(pick((w) => w.confidence[b]))])),
    props: {
      rates: { kick: r3(pick((w) => w.props.rates.kick)), figure: r3(pick((w) => w.props.rates.figure)), offbeat: r3(pick((w) => w.props.rates.offbeat)) },
      hatShares: { beat: r3(pick((w) => w.props.hatShares && w.props.hatShares.beat)), offbeat: r3(pick((w) => w.props.hatShares && w.props.hatShares.offbeat)), sixteenth: r3(pick((w) => w.props.hatShares && w.props.hatShares.sixteenth)) },
      sustainBarDb: r3(pick((w) => w.props.sustainBarDb)),
      centroidLogHz: r4(pick((w) => w.props.centroidLogHz)),
      lowShareDb: r3(pick((w) => w.props.lowShareDb)),
      width: { sideMidDb: r3(pick((w) => w.props.width && w.props.width.sideMidDb)) },
    },
    span: s.span,
  };
  point.words = {
    hats: hatWord(point.props.hatShares),
    brightness: wordOf(CUT.brightness, point.props.centroidLogHz),
    lowMass: wordOf(CUT.lowMass, point.props.lowShareDb),
    sustain: wordOf(CUT.sustain, point.props.sustainBarDb),
    width: wordOf(CUT.width, point.props.width.sideMidDb),
  };
  return point;
}
const points = stretches.map((s) => stretchPoint(s));
// One point per record, its groove only. This and not the window list is what
// the box table stands on: `HOUSE` is the median of fourteen *themes*, each
// counted once, and a centre taken over windows would weight a twenty-minute
// stretch three times a five-minute one.
const groovePoints = stretches.map((s) => {
  const p = stretchPoint(s, (w) => w.section === 'groove' && w.sectionPure);
  p.words = p.words || {};
  return p;
});

// The 09-17 reading of the same three sets, for the window-rule comparison.
const oldSets = {};
for (const set of [1, 2, 3]) {
  const f = path.join(ROOT, 'tmp', 'imprint', 'sets', `set${set}.json`);
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  oldSets[set] = Object.fromEntries(BIRDS.map((b) => [b, j.summary.birds[b].median]));
}

// §2 — the box table, on one point per record.
const table = boxTable(groovePoints);
const tableWindows = boxTable(groove);
const tableAll = boxTable(allWindows);

const trackDist = makeDistance(points);
const trackTrim = trimOutliers(points, trackDist, 0.9);
const trackK = pickK(trackTrim.kept, trackDist, 2, 8);
const trackStab = { mean: trackK.best.stability, spread: trackK.best.spread };

const sectionRuns = {};
for (const label of ['breakdown', 'drop', 'build']) {
  const rows = allWindows.filter((w) => w.sectionOf === label);
  if (rows.length < 12) { sectionRuns[label] = { rows, skipped: true }; continue; }
  const d = makeDistance(rows);
  const k = pickK(rows, d, 2, 5, 15);
  sectionRuns[label] = { rows, dist: d, k, stab: { mean: k.best.stability, spread: k.best.spread } };
}

// The drum layer: the properties that are the drums and nothing else, so a
// `layer` row is about the figure and never about the harmony over it.
const DRUM_KEYS = ['kick', 'offbeat', 'sixteenth', 'hatOffbeat', 'low'];
const layerRows = groove;
const layerDist = makeDistance(layerRows, { birds: false, props: true, only: DRUM_KEYS });
const layerK = pickK(layerRows, layerDist, 2, 6, 12);
const layerStab = { mean: layerK.best.stability, spread: layerK.best.spread };

// --- the rows ---------------------------------------------------------------

function cluster(rows, result) {
  const groups = [];
  for (let c = 0; c < result.medoids.length; c += 1) {
    const members = rows.filter((_, i) => result.assign[i] === c);
    groups.push({ members, medoid: rows[result.medoids[c]], n: members.length });
  }
  return groups.sort((a, b) => b.n - a.n);
}

function nameOf(members, medoid, prefix) {
  const agree = (f) => {
    const c = new Map();
    for (const w of members) { const v = f(w); if (v == null) continue; c.set(v, (c.get(v) || 0) + 1); }
    let best = null, n = 0; for (const [v, k] of c) if (k > n) { best = v; n = k; }
    return n / members.length >= 0.5 ? best : null;
  };
  const bits = [];
  // The low band's own rate first, because it is the one number in the row that
  // a reader can check against the music by counting: four a bar is the genre's
  // whole floor and anything else is the thing worth saying about the cluster.
  const kick = median(members.map((w) => w.props.rates.kick));
  if (kick != null) {
    bits.push(kick < 2 ? 'almost no low end on the beat'
      : kick < 3.2 ? 'a sparse low end'
        : kick <= 5.2 ? 'four on the floor'
          : kick <= 8 ? 'a moving low end' : 'a low end on every sixteenth');
  }
  const hats = agree((w) => w.words.hats) || (medoid && medoid.words && medoid.words.hats);
  if (hats && hats !== 'none') {
    bits.push(hats === 'sixteenths' ? 'hats on the sixteenths'
      : hats === 'offbeat' ? 'offbeat hats'
        : hats === 'eighths' ? 'hats on the eighths' : 'hats on the beat');
  }
  const b = agree((w) => w.words.brightness) || (medoid && medoid.words && medoid.words.brightness);
  if (b) bits.push(`a ${b} mix`);
  const l = agree((w) => w.words.lowMass) || (medoid && medoid.words && medoid.words.lowMass);
  if (l) bits.push(`${l} low end`);
  const su = agree((w) => w.words.sustain) || (medoid && medoid.words && medoid.words.sustain);
  if (su) bits.push(su === 'held' ? 'long tails' : `${su} tails`);
  const wd = agree((w) => w.words.width) || (medoid && medoid.words && medoid.words.width);
  if (wd) bits.push(`a ${wd} stage`);
  return `${prefix}${bits.join(', ')}`;
}

const trackGroups = cluster(trackTrim.kept, trackK.best.result);
trackGroups.forEach((g, i) => {
  const name = nameOf(g.members, g.medoid, '');
  const id = `mined/track-${String(i + 1).padStart(2, '0')}-${slug(name)}`;
  written.push({ scope: 'track', ...writeRow(rowFrom({
    scope: 'track', applies: null, id, name, members: g.members, pool: trackTrim.kept.length, poolRows: trackTrim.kept, everyRow: points, medoid: g.medoid,
    extra: { scopeOf: 'track', k: trackK.best.k, silhouette: r3(trackK.best.silhouette), stability: trackStab.mean,
      unit: 'one coherent stretch, taken as the median of its own eight-bar windows' },
  })), group: g, name });
});

for (const [label, run] of Object.entries(sectionRuns)) {
  if (run.skipped) continue;
  const groups = cluster(run.rows, run.k.best.result);
  groups.forEach((g, i) => {
    const name = nameOf(g.members, g.medoid, `${label}: `);
    const id = `mined/${label}-${String(i + 1).padStart(2, '0')}-${slug(name)}`;
    written.push({ scope: 'section', label, ...writeRow(rowFrom({
      scope: 'section', applies: label, id, name, members: g.members, pool: run.rows.length, poolRows: run.rows, medoid: g.medoid,
      extra: { scopeOf: 'section', section: label, k: run.k.best.k, silhouette: r3(run.k.best.silhouette), stability: run.stab.mean,
        unit: 'one eight-bar window whose whole span carries one section label',
        sectionSource: "the section labels are v1's own arrangement reading of the same stretches (CORPUS.md §5: measured for groove and breakdown, definitional for build and drop)" },
    })), group: g, name });
  });
}

const layerGroups = cluster(layerRows, layerK.best.result);
layerGroups.forEach((g, i) => {
  const name = nameOf(g.members, g.medoid, 'drums: ');
  const id = `mined/layer-${String(i + 1).padStart(2, '0')}-${slug(name)}`;
  const row = rowFrom({
    scope: 'layer', applies: 'drum', id, name, members: g.members, pool: layerRows.length, poolRows: layerRows, medoid: g.medoid,
    extra: { scopeOf: 'layer', k: layerK.best.k, silhouette: r3(layerK.best.silhouette), stability: layerStab.mean,
      unit: 'one eight-bar groove window, clustered on the drum properties alone',
      note: 'A layer row speaks for the figure and not for the harmony over it, so its box is dropped: the birds of a window are the whole mix and would be describing the keys as well.' },
  });
  // A layer row says nothing about a bird on purpose: `boxOf` gives an
  // unnamed bird the house's own box, which is exactly "the randomiser's".
  row.birds = {};
  delete row.reading.centre;
  delete row.reading.coverage;
  written.push({ scope: 'layer', ...writeRow(row), group: g, name });
});

// --- the seams ---------------------------------------------------------------

const seams = seamsDoc.seams.filter((s) => s.blendSeconds != null);
const blendCut = [quantile(seams.map((s) => Math.abs(s.blendSeconds)), 1 / 3), quantile(seams.map((s) => Math.abs(s.blendSeconds)), 2 / 3)];
const firstCounts = new Map();
for (const s of seams) firstCounts.set(s.first, (firstCounts.get(s.first) || 0) + 1);
const seamGroups = [...firstCounts.entries()].sort((a, b) => b[1] - a[1]);
seamGroups.forEach(([band, n], i) => {
  const mine = seams.filter((s) => s.first === band);
  const blend = median(mine.map((s) => Math.abs(s.blendSeconds)));
  const word = blend < blendCut[0] ? 'short' : blend < blendCut[1] ? 'medium' : 'long';
  const name = `the ${band} band leads a ${word} hand-over`;
  const id = `mined/seam-${String(i + 1).padStart(2, '0')}-${slug(name)}`;
  const row = {
    schema: 1, kind: 'recipe', id, interpreter: 'v1', scope: 'seam', applies: null,
    name, origin: 'mined', birds: {},
    wants: {
      handOver: {
        first: band, blend: word,
        seconds: r3(blend),
        min: r3(quantile(mine.map((s) => Math.abs(s.blendSeconds)), 0.25)),
        max: r3(quantile(mine.map((s) => Math.abs(s.blendSeconds)), 0.75)),
        order: mine[0].order.join('>'),
      },
    },
    forbids: [], weight: r3(mine.length / seams.length),
    score: { chef: 0, likes: 0 }, verdicts: [],
    provenance: {
      tool: 'packages/deep-house/tools/imprint/mine-v2.ts',
      reading: 'packages/deep-house/tools/imprint/mine_sources.py',
      date: TODAY, anchors: windowsDoc.anchors, sources: windowsDoc.sources,
      scopeOf: 'seam', members: mine.length, pool: seams.length,
      medoidSet: mine[0].set, medoidStart: mine[0].at_s, medoidDuration: 120,
      unit: 'one junction where a stretch begins exactly where the one before it ended, read sixty seconds either side',
      measure: "each band's own half-way point between its plateau before the junction and its plateau after; "
        + 'the hand-over length is the spread of the three points and the order is what they sort into',
      note: 'A seam row names no bird: the hand-over is a shape in time and the imprint has no scope for it.',
    },
    reading: {
      blendSeconds: mine.map((s) => r3(s.blendSeconds)),
      bandsThatMoved: mine.map((s) => s.bandsThatMoved),
    },
  };
  written.push({ scope: 'seam', ...writeRow(row), name, group: { members: mine, n: mine.length } });
});

// Every row is built; now the carry and the write, once.
const flushed = flushRows(written);

// --- 4. the record against the mined boxes -----------------------------------

const trackRows = written.filter((w) => w.scope === 'track' && !w.problems.length);
/** Every mined row that names a bird: the ones a point can fall inside. */
const boxRows = written.filter((w) => !w.problems.length && w.row.birds && Object.keys(w.row.birds).length);

/**
 * The record as it was actually measured, and not as a plan guesses it.
 *
 * `tmp/imprint/` already holds the readings this question wants: phase 1's
 * sweep and the cookbook's own renders are 221 themes of `house-v1` read
 * through the real graph on `anchors.json`, and round K5b left fourteen
 * `house-v2` golden themes beside the fourteen `house-v1` ones on the same
 * scale. Those are used first, because a measured theme beats an estimated
 * one; the two hundred *planned* themes below are the cheap route the ask
 * names, and they are reported as what they are.
 */
function readImprints(dir, filter = null) {
  const at = path.join(ROOT, 'tmp', 'imprint', dir);
  if (!fs.existsSync(at)) return [];
  return fs.readdirSync(at).filter((f) => f.endsWith('.json') && (!filter || filter(f)))
    .map((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(at, f), 'utf8'));
      if (!j.summary || !j.summary.birds) return null;
      const point = {}; for (const b of BIRDS) point[b] = j.summary.birds[b].median;
      return { file: f, label: j.label, point, confidence: j.summary.confidence };
    }).filter(Boolean);
}
const recordThemes = [...readImprints('sweep'), ...readImprints('cookbook'),
  ...readImprints('golden', (f) => !f.includes('house-v2'))];
const v2Themes = readImprints('golden', (f) => f.includes('house-v2'));

const cookbookFiles = fs.existsSync(CANDIDATES) ? fs.readdirSync(CANDIDATES).filter((f) => f.endsWith('.json')).sort() : [];
const cookbook = cookbookFiles.map((f) => JSON.parse(fs.readFileSync(path.join(CANDIDATES, f), 'utf8')));
const session = fs.existsSync(SESSION) ? JSON.parse(fs.readFileSync(SESSION, 'utf8')) : { state: {} };
const verdictOf = (row) => {
  const key = row.id.split('/').pop();
  const st = session.state[key];
  return st ? st.action : null;
};

const reach = [];
for (const c of cookbook) {
  const centre = (c.reading && c.reading.centre) || null;
  const same = boxRows.filter((t) => t.row.scope === c.scope && (c.scope !== 'section' || t.row.applies === c.applies));
  const pool = same.length ? same : boxRows;
  if (!centre) { reach.push({ row: c, verdict: verdictOf(c), centre: null, hits: [], nearest: null }); continue; }
  const hits = pool.filter((t) => inBox(boxOf(t.row), centre));
  const nearest = pool
    .map((t) => ({ t, d: Math.sqrt(outBy(boxOf(t.row), centre).reduce((a, x) => a + x * x, 0)) }))
    .sort((a, b) => a.d - b.d)[0];
  reach.push({ row: c, verdict: verdictOf(c), centre, hits: hits.map((h) => h.row.id), nearest });
}

const sig = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'deep-house', 'src', 'styles', 'deep-house-signatures.json'), 'utf8'));
const rolled = [];
for (let i = 0; i < THEMES; i += 1) {
  const p = planTheme(String(2000 + i), 0, { strategy: 'house-v2' });
  rolled.push({ seed: String(2000 + i), room: p.preset, density: p.density,
    strict: planBirds(sig, p.dice, true), loose: planBirds(sig, p.dice, false) });
}
const dOf = (box, pt) => Math.sqrt(outBy(box, pt).reduce((a, x) => a + x * x, 0));
const rolledCounts = boxRows.map((t) => {
  const box = boxOf(t.row);
  const sum = Object.fromEntries(BIRDS.map((b) => [b, 0]));
  for (const r of recordThemes) { const o = outBy(box, r.point); BIRDS.forEach((b, j) => { sum[b] += o[j]; }); }
  return {
    id: t.row.id, name: t.name, scope: t.row.scope, applies: t.row.applies, share: t.row.weight,
    measuredV1: recordThemes.filter((r) => inBox(box, r.point)).length,
    measuredV1Of: recordThemes.length,
    nearestV1: r3(Math.min(...recordThemes.map((r) => dOf(box, r.point)))),
    measuredV2: v2Themes.filter((r) => inBox(box, r.point)).length,
    measuredV2Of: v2Themes.length,
    nearestV2: v2Themes.length ? r3(Math.min(...v2Themes.map((r) => dOf(box, r.point)))) : null,
    strict: rolled.filter((r) => inBox(box, r.strict)).length,
    loose: rolled.filter((r) => inBox(box, r.loose)).length,
    nearestLoose: r3(Math.min(...rolled.map((r) => dOf(box, r.loose)))),
    worstBird: BIRDS.slice().sort((a, b) => sum[b] - sum[a]).slice(0, 2)
      .map((b) => `${b} ${r3(sum[b] / Math.max(1, recordThemes.length))}`).join(', '),
  };
});

// --- the report --------------------------------------------------------------

const pct = (a, b) => `${Math.round((100 * a) / Math.max(1, b))}%`;

say('# Mining the three reference sets, in v2 terms');
say('');
say(`${TODAY}, on \`local\`, under \`plans/PLAN-RECIPES.md\`'s last unbuilt section,`);
say("*Mining from reference tracks*. Eugene's ask: *\"we still have in tmp the original");
say('sources 1, 2, 3 and the chopped pieces used for v1; do a pass on them again and');
say('build recipes in v2 terms."*');
say('');
say('The tool is two files beside `birds.py`: **`mine_sources.py`** decodes the');
say('sources in memory and measures, **`mine-v2.ts`** clusters, writes the rows and');
say('writes this. No audio was copied, played or written anywhere; what left the lab');
say('is the numbers below and the rows in `notes/recipes/mined/`.');
say('');
say('## Method, and the segmentation');
say('');
say('| | |');
say('|---|---|');
say(`| segmentation | **v1's own**, reused and not re-cut: the ${stretches.length} coherent stretches of \`tmp/analysis/corpus.json\` |`);
say('| window | **eight bars of the stretch\'s own measured tempo**, non-overlapping, read through — not sampled |');
say(`| read | ${stretches.length} stretches, **${nWindows} windows**, ${r3(allWindows.reduce((a, w) => a + w.seconds, 0) / 3600)} h of audio |`);
say(`| of those | ${groove.length} windows whose whole eight bars carry one \`groove\` label, which is the fair comparison with the record's 32-bar main groove |`);
say(`| scale | \`${windowsDoc.anchors}\` — the same anchors the golden was calibrated on, so a source window and a golden theme are the same number |`);
say('| beyond the eight | onset rates in three bands, the hat fold, sustain at the bar, brightness, low mass and **stereo width**, which no bird can carry |');
say('');
say('**The segmentation is inherited whole, caveat included.** `CORPUS.md` is blunt');
say('that a key segment is not guaranteed to be one track: two tracks in the same key');
say('back to back merge into one entry and a track that modulates splits into two. It');
say('was reusable — every stretch has a tempo, a key and a section plan already on it,');
say('and eight bars of that tempo is the window rule `PLAN-IMPRINT` §2 states — so');
say('nothing was re-cut. What changed is the **reading**: v1 and the 09-17 calibration');
say('both read these sets as forty scattered twenty-second windows, which has no');
say("novelty curve in it at all and dropped Loom's confidence to 0.23. A stretch is");
say(`three to twenty minutes of contiguous audio, so Loom's span is measurable here:`);
say(`**${stretches.filter((s) => s.span && s.span.spanSeconds).length} of ${stretches.length} stretches gave one**, median ${r3(median(stretches.map((s) => s.span && s.span.spanSeconds)))} s.`);
say('');

say('## 1. What the encoder separates, on the sources');
say('');
say('The 09-17 calibration found a whole-mix imprint separates the two rooms of the');
say('record and nothing else, and phase 1 found the same from the other end. Both were');
say('measured on *our* record, where every theme is one generator at one setting. These');
say('are fifty-one different records by different people, so this is the instrument\'s');
say('real test. Between-stretch spread against within-stretch spread, per bird — the');
say('same arithmetic `signatures.ts` puts on a candidate list, where a bird separates a');
say('grouping only when the first is at least the second.');
say('');
say('| bird | between stretches | within a stretch | ratio | between sections | within | ratio |');
say('|---|---|---|---|---|---|---|');
for (const b of BIRDS) {
  const a = sepStretch.birds[b], c = sepSection.birds[b];
  say(`| ${b} | ${a.between} | ${a.within} | **${a.ratio}** | ${c.between} | ${c.within} | **${c.ratio}** |`);
}
say('');
const sepGood = BIRDS.filter((b) => sepStretch.birds[b].ratio >= 1);
say(`**${sepGood.length} of the eight separate one record from another** (${sepGood.join(', ')}), and`);
say(`the ratio is the number to read: a bird at ${r3(Math.max(...BIRDS.map((b) => sepStretch.birds[b].ratio)))} tells these records apart `);
say(`${r3(Math.max(...BIRDS.map((b) => sepStretch.birds[b].ratio)))} times as well as it tells one record's own bars apart.`);
say('');

say('### The same sets, read the old way and this way');
say('');
say('The 09-17 calibration read these three sets as **forty scattered twenty-second');
say('windows** each; this pass reads them as **eight-bar windows through every');
say('coherent stretch**. Same audio, same anchors, two window rules — so the column');
say('difference is the window rule and nothing else. It is worth having because');
say('`imprint-calibration.md` §4 already suspected it of Loom (*"mostly an artefact…');
say('two thirds of that gap is the window"*), and here is the size of it on all eight.');
say('');
say('| set | reading | ' + BIRDS.map((b) => b.slice(0, 2)).join(' | ') + ' |');
say('|---|---|' + BIRDS.map(() => '---|').join(''));
for (const set of [1, 2, 3]) {
  const old = oldSets[set];
  const mine = stretches.filter((x) => x.set === set).map((x) => stretchPoint(x, (w) => w.section === 'groove' && w.sectionPure));
  if (!mine.length) continue;
  if (old) say(`| ${set} | 09-17, 40 x 20 s sampled | ${BIRDS.map((b) => r3(old[b])).join(' | ')} |`);
  say(`| ${set} | this pass, 8-bar windows | **${BIRDS.map((b) => r3(median(mine.map((m) => m.birds[b])))).join('** | **')}** |`);
}
say('');
say(`And what the three sets separate from each other, as between against within:`);
say('');
say('| bird | ' + BIRDS.map((b) => b.slice(0, 2)).join(' | ') + ' |');
say('|---|' + BIRDS.map(() => '---|').join(''));
say('| between sets / within a set | ' + BIRDS.map((b) => sepSet.birds[b].ratio).join(' | ') + ' |');
say('');

say('## 2. The measured box against ours');
say('');
say('Where the sources sit, against `HOUSE` and `HOUSE_BOX` in `src/spell.ts` — the');
say('median and half the interquartile range of the fourteen golden themes. **Nothing');
say('is re-centred:** a re-centring is a re-bless and is Eugene\'s. The sources here are');
say(`the ${groovePoints.length} records, each counted once as the median of its own whole-groove`);
say("windows — which is like for like with the record's own fourteen, each counted");
say('once as the median of a 32-bar main groove. The two tables under it are the');
say('same reading taken over windows instead of over records, and over every window');
say('including the breakdowns, so the effect of each choice is visible rather than');
say('argued about.');
say('');
say('| bird | sources p25 | centre | p75 | half IQR | HOUSE | HOUSE_BOX | gap | gap / half IQR | the record\'s box is |');
say('|---|---|---|---|---|---|---|---|---|---|');
for (const t of table) {
  say(`| ${t.bird} | ${t.p25} | **${t.centre}** | ${t.p75} | ${t.halfIqr} | ${t.house} | ±${t.houseBox} | ${t.gap > 0 ? '+' : ''}${t.gap} | ${t.gapInIqr} | **${t.where}** |`);
}
say('');
say('Over the groove windows one by one, and then over every window there is:');
say('');
say('| bird | groove windows p25 / centre / p75 | gap | every window p25 / centre / p75 | gap |');
say('|---|---|---|---|---|');
for (let i = 0; i < BIRDS.length; i += 1) {
  const a = tableWindows[i], b = tableAll[i];
  say(`| ${a.bird} | ${a.p25} / ${a.centre} / ${a.p75} | ${a.gap > 0 ? '+' : ''}${a.gap} | ${b.p25} / ${b.centre} / ${b.p75} | ${b.gap > 0 ? '+' : ''}${b.gap} |`);
}
say('');

say('## 3. The dishes');
say('');
say('| scope | points | k | silhouette | stability | rows |');
say('|---|---|---|---|---|---|');
say(`| track | ${trackTrim.kept.length} stretches of ${points.length} | **${trackK.best.k}** | ${r3(trackK.best.silhouette)} | ${trackStab.mean} ± ${trackStab.spread} | ${trackGroups.length} |`);
for (const [label, run] of Object.entries(sectionRuns)) {
  if (run.skipped) { say(`| section / ${label} | ${run.rows.length} windows | — | — | — | 0 (too few) |`); continue; }
  say(`| section / ${label} | ${run.rows.length} windows | **${run.k.best.k}** | ${r3(run.k.best.silhouette)} | ${run.stab.mean} ± ${run.stab.spread} | ${run.k.best.k} |`);
}
say(`| layer / drum | ${layerRows.length} groove windows | **${layerK.best.k}** | ${r3(layerK.best.silhouette)} | ${layerStab.mean} ± ${layerStab.spread} | ${layerGroups.length} |`);
say(`| seam | ${seams.length} hand-overs | ${seamGroups.length} | — | — | ${seamGroups.length} |`);
say('');
say("k is **Hennig's clusterwise bootstrap** — cluster four fifths of the points many");
say('times over and take, per cluster of the full answer, the best Jaccard agreement');
say('with any cluster of the resample — and not the silhouette, which rises with k on a');
say('continuum and therefore has no maximum to find. Under about 0.6 the bootstrap is');
say('saying *this is a cut through a continuum and not a dish*, and where it says that');
say('below, it is not argued with. **A k that would leave a cluster of fewer than three');
say('is refused outright**: a row\'s box is the middle half of its members on each bird,');
say('and a middle half of one member is a point with no width in it — a recipe only the');
say('exact record it was cut from could ever satisfy.');
say('');
say('| scope | k | stability | silhouette | smallest cluster |');
say('|---|---|---|---|---|');
for (const t of trackK.tried) say(`| track | ${t.k}${t.k === trackK.best.k ? ' **←**' : ''} | ${t.stability} ± ${t.spread} | ${t.silhouette} | ${t.smallest}${t.smallest < 3 ? ' — refused' : ''} |`);
for (const [label, run] of Object.entries(sectionRuns)) {
  if (run.skipped) continue;
  for (const t of run.k.tried) say(`| ${label} | ${t.k}${t.k === run.k.best.k ? ' **←**' : ''} | ${t.stability} ± ${t.spread} | ${t.silhouette} | ${t.smallest}${t.smallest < 3 ? ' — refused' : ''} |`);
}
for (const t of layerK.tried) say(`| drum layer | ${t.k}${t.k === layerK.best.k ? ' **←**' : ''} | ${t.stability} ± ${t.spread} | ${t.silhouette} | ${t.smallest}${t.smallest < 3 ? ' — refused' : ''} |`);
say('');
if (trackTrim.dropped.length) {
  say(`**${trackTrim.dropped.length} of the ${points.length} records stand too far from everything to be a dish** and are`);
  say('named rather than folded into the nearest one: '
    + trackTrim.dropped.map((d) => `set ${d.set} at ${d.stretchStart} s (${r3(d.bpm)} BPM, ${d.key})`).join(', ')
    + `. The cut is the ${90}th percentile of each record's distance to its third-nearest`);
  say('neighbour, and with them in, every k from two to eight left a cluster of one or');
  say('two and the pick collapsed to a 49-and-2 split.');
  say('');
}
say('### The rows');
say('');
say('| row | scope | share | members | medoid | box |');
say('|---|---|---|---|---|---|');
for (const w of written) {
  if (w.problems.length) continue;
  const p = w.row.provenance;
  const box = w.row.birds && Object.keys(w.row.birds).length
    ? BIRDS.map((b) => `${b.slice(0, 2)} ${w.row.birds[b][0]}-${w.row.birds[b][1]}`).join(', ')
    : '— names no bird; every bird stays the house\'s own';
  say(`| \`${w.row.id}\` | ${w.row.scope}${w.row.applies ? ` / ${w.row.applies}` : ''} | ${pct(p.members, p.pool)} | ${p.members} of ${p.pool} | set ${p.medoidSet}, ${p.medoidStart} s +${p.medoidDuration} s | ${box} |`);
}
say('');
say('### Every box contains its medoid, and this much of its own pool');
say('');
say('The first pass cut each box as the middle half on each bird separately, and on');
say('eight axes at once that is next to nothing: none of the eight boxes contained');
say('its own medoid and the two track boxes contained none of the fifty-one records');
say('(M4 of the mining review, 09-19). A box is now the same quantile band on every');
say(`bird, widened from the quartiles until at least ${Math.round(100 * JOINT_COVERAGE)}% of the members sit inside on`);
say('all eight together, then stretched to include the medoid — and the coverage is');
say('on the row, so a box is a number with its own reach beside it.');
say('');
say('| row | band | members inside | pool inside | of all 51 records | medoid inside |');
say('|---|---|---|---|---|---|');
for (const w of written) {
  if (w.problems.length) continue;
  const c = w.row.reading && w.row.reading.coverage;
  if (!c) continue;
  say(`| \`${w.row.id.split('/').pop()}\` | p${r3(100 * c.quantile)}–p${r3(100 * (1 - c.quantile))} | ${c.members.inside} of ${c.members.of} | ${c.pool ? `${c.pool.inside} of ${c.pool.of}` : '—'} | ${c.every ? `${c.every.inside} of ${c.every.of}` : '—'} | ${c.medoidInside ? 'yes' : '**no**'} |`);
}
say('');
say('### The class words, and where they were cut');
say('');
say('Every word on a row is a tercile of the corpus itself, so no threshold here was');
say('chosen by eye:');
say('');
say('| property | measured as | lower third under | upper third over | words |');
say('|---|---|---|---|---|');
for (const [k, c] of Object.entries(CUT)) {
  say(`| ${k} | \`${c.of}\` | ${r3(c.at[0])} | ${r3(c.at[1])} | ${c.words ? c.words.join(' / ') : 'used by `hatDensity`'} |`);
}
say('');

say('## 4. The record against the mined boxes');
say('');
say("v1's seventeen archetypes, and where each falls. An archetype is compared against");
say('the mined rows of its own scope (and, for a section row, of its own section), over');
say("the eight birds. **Eleven of the seventeen carry no centre at all**: they are the");
say('section rows of `notes/archive/2026-09-kitchen/rounds/cookbook.md`, and a section of the record has no imprint —');
say('which is exactly the hole this pass fills on the source side, because a section of');
say('a source *is* a stretch of real audio. Their line is here so the absence is visible.');
say("Eugene's verdict of 09-18 is beside each one, because the interesting case is an");
say('archetype he kept that no source box reaches.');
say('');
say('| v1 archetype | his verdict | inside a mined box | nearest mined box | distance |');
say('|---|---|---|---|---|');
for (const r of reach) {
  if (!r.centre) { say(`| \`${r.row.id.split('/').pop()}\` | ${r.verdict || '—'} | — *(names no bird)* | — | — |`); continue; }
  say(`| \`${r.row.id.split('/').pop()}\` | ${r.verdict || '—'} | ${r.hits.length ? r.hits.map((h) => `\`${h.split('/').pop()}\``).join(', ') : '**none**'} | \`${r.nearest ? r.nearest.t.row.id.split('/').pop() : '—'}\` | ${r.nearest ? r3(r.nearest.d) : '—'} |`);
}
say('');
const placed = reach.filter((r) => r.centre);
say(`**${placed.filter((r) => r.hits.length).length} of the ${placed.length}** archetypes that name a bird fall inside a mined box,`);
say(`out of ${reach.length} in the catalogue.`);
say('');
say('### What the record actually measures, against each mined box');
say('');
say(`\`tmp/imprint/\` already holds the readings this question wants: phase 1's sweep and`);
say(`the cookbook's own renders are **${recordThemes.length} themes of \`house-v1\`** read through the real`);
say(`graph on the same anchors, and round K5b left **${v2Themes.length} \`house-v2\` golden themes** beside`);
say('the fourteen v1 ones. A measured theme beats an estimated one, so they go first.');
say('');
say('| mined box | scope | share | of ' + recordThemes.length + ' v1 | nearest | of ' + v2Themes.length + ' v2 golden | nearest | the two birds that exclude most |');
say('|---|---|---|---|---|---|---|---|');
for (const c of rolledCounts) {
  say(`| \`${c.id.split('/').pop()}\` | ${c.scope}${c.applies ? `/${c.applies}` : ''} | ${pct(c.share * 100, 100)} | ${c.measuredV1} | ${c.nearestV1} | ${c.measuredV2} | ${c.nearestV2 == null ? '—' : c.nearestV2} | ${c.worstBird} |`);
}
say('');
say(`### ${THEMES} themes rolled under \`house-v2\`, without rendering one`);
say('');
say('A plan has no birds, so a theme\'s reading is guessed from');
say('`src/styles/deep-house-signatures.json` — the mean of the eight over the themes');
say('that rolled each candidate — as the sweep\'s centre plus each drawn candidate\'s own');
say('departure from its list\'s mean. It is on `anchors.json`, the same scale as');
say('everything else here; the **per-layer** signatures are deliberately not used,');
say('because they are measured on `anchors-layer.json` and that file says in so many');
say('words that a row on one scale may never be compared with a row on the other.');
say('');
say('**Strict** counts only the birds a list actually separates. Phase 1 found exactly');
say('one list qualifies — `rooms`, on Veil and Spark — so a strict estimate is the');
say('house centre with the room\'s own Veil and Spark on it, and *a plan predicts');
say('nothing else about a theme\'s birds*. That is not a defect of the arithmetic, it is');
say('the measurement, and it is the strongest argument in this report for the per-layer');
say('imprint. **Loose** lets every list contribute; most of what it adds is noise the');
say('sample does not support, and it is here so the count is not one number wearing a');
say('confidence it has not got.');
say('');
say(`| mined box | of ${THEMES}, strict | of ${THEMES}, loose | nearest plan |`);
say('|---|---|---|---|');
for (const c of rolledCounts) say(`| \`${c.id.split('/').pop()}\` | ${c.strict} | ${c.loose} | ${c.nearestLoose} |`);
say('');
const rooms = new Map();
for (const r of rolled) rooms.set(r.room, (rooms.get(r.room) || 0) + 1);
say(`The ${THEMES} rolled ${[...rooms].map(([k, v]) => `${v} ${k}`).join(' and ')}.`);
say('');

say('### The hand-overs');
say('');
say(`${seamsDoc.seams.length} junctions where a stretch begins exactly where the one before it ended —`);
say('a DJ\'s transition caught in the middle. Each band\'s own half-way point between its');
say('plateau before and its plateau after is that band\'s hand-over instant; the length is');
say('the spread of the three and the order is what they sort into.');
say('');
say('| what | number |');
say('|---|---|');
say(`| junctions read | ${seamsDoc.seams.length} |`);
say(`| of those, with at least two bands that moved at all | ${seams.length} |`);
say(`| hand-over length, median | ${r3(median(seams.map((x) => Math.abs(x.blendSeconds))))} s |`);
say(`| hand-over length, middle half | ${r3(quantile(seams.map((x) => Math.abs(x.blendSeconds)), 0.25))} - ${r3(quantile(seams.map((x) => Math.abs(x.blendSeconds)), 0.75))} s |`);
for (const [band, n] of seamGroups) say(`| the ${band} band changes hands first | ${n} of ${seams.length} |`);
say('');
if (seams.length) {
  const low = seams.filter((x) => x.first === 'low').length;
  say(`**No band leads a hand-over more often than not.** The low band goes first in ${low} of`);
  say(`${seams.length}, the other two in the rest, and the length spans a bar or two to the better`);
  say('part of a minute. The record has one rule where the sources have three: `seamCurves`');
  say('hands the low end over on the bar and takes every other layer with it, which is the');
  say(`${low} of ${seams.length} shape and not the other ${seams.length - low}. A mined seam row says which band leads and`);
  say('how long it takes, in the sources\' own numbers, and nothing in `set-plan.ts` reads');
  say('one yet.');
}
say('');

// The gap list, five lines, written from the numbers.
say('## The gap list');
say('');
say('Which mined boxes nothing in the record reaches, by the measured themes first and');
say('the planned ones second, biggest share of the sources first.');
say('');
const gaps = rolledCounts.filter((c) => c.measuredV1 === 0 && c.measuredV2 === 0 && c.loose === 0)
  .sort((a, b) => b.share - a.share);
for (const g of gaps.slice(0, 5)) {
  say(`- **\`${g.id.split('/').pop()}\`** — ${pct(g.share * 100, 100)} of its scope in the sources, and **nothing** in `
    + `${recordThemes.length} measured v1 themes, ${v2Themes.length} measured v2 themes or ${THEMES} v2 plans lands in it. `
    + `The nearest v1 theme is ${g.nearestV1} away, and what keeps the record out, averaged over all `
    + `${recordThemes.length} of them, is ${g.worstBird}.`);
}
if (!gaps.length) say('- Nothing: every mined box is reached by something the record makes.');
if (gaps.length > 5) say(`- …and ${gaps.length - 5} more boxes nothing reaches; the whole list is in \`tmp/analysis/mine_v2/summary.json\`.`);
say('');

// What the instrument cannot see, stated rather than discovered later.
const wallShare = {};
for (const b of BIRDS) {
  const xs = allWindows.map((w) => w.birds[b]);
  wallShare[b] = { zero: xs.filter((x) => x <= 0.0001).length, one: xs.filter((x) => x >= 0.9999).length };
}
say('## Caveats');
say('');
say('- **The scale is ours, not the genre\'s.** `anchors.json` was centred on the');
say('  fourteen golden themes, so every number above says how far the sources stand');
say('  from *our record* and never how far our record stands from deep house. That is');
say('  the right way round for a recipe — a recipe is an instruction to our generator —');
say('  and it is the wrong way round for any claim about the music.');
say('- **A bird cannot see a quiet salient figure.** Every bird is energy over a window');
say('  and a mix is mostly its drums (`PLAN-IMPRINT`, and the eight verdicts behind it),');
say('  so the whole of the harmonic half of these records is worth a few hundredths on');
say('  Gleam and nothing anywhere else. The `rates`, the hat fold and the sustain on');
say('  every row exist for exactly that reason and they are **band proxies, not source');
say('  separation**: a bassline that moves inside the low band is a low-band onset and a');
say('  clap is a mid-band one.');
say('- **The walls.** A reading that sits on a wall is a lean and not a measurement');
say('  (round K5b). Over the ' + allWindows.length + ' windows:');
say('');
say('  | bird | readings at 0 | readings at 1 |');
say('  |---|---|---|');
for (const b of BIRDS) say(`  | ${b} | ${wallShare[b].zero} | ${wallShare[b].one} |`);
say('');
say(`- **Veil reads exactly 1 in ${wallShare.veil.one} of the ${allWindows.length} windows**, which is the bird this report`);
say('  leans on hardest and is the one place to be careful: Veil\'s 1 wall is 2.2x the');
say('  house centre, so a window changing faster than that is pinned rather than');
say('  measured, and a box whose top edge is 1 is a box that may be wider than it says.');
say('- **Gleam is noise over one window.** Its key detector got the root right four');
say('  times in fourteen on the golden and both its features hang off that root;');
say(`  its median confidence here is ${r3(median(allWindows.map((w) => w.confidence.gleam)))}, which says the same thing again.`);
say('- **Tide is two features, not three.** `decayDbPerSec` is at weight nought because');
say('  in a sidechained record the mid band after a hit is the duck recovering.');
say('- **Nothing above 11 kHz and no stereo image in any bird.** Everything is measured');
say('  mono at 22050 Hz. Width is measured here beside the birds, as a property of the');
say('  mix, which is what `space.md` and `PLAN-IMPRINT` both say it is.');
say('- **The segmentation is v1\'s and carries v1\'s fault**: a key segment is not');
say('  guaranteed to be one track. Two tracks in one key back to back are one stretch');
say('  here and a track that modulates is two.');
say('- **The section labels are v1\'s arrangement reading**, measured for groove and');
say('  breakdown and *definitional* for build and drop (`CORPUS.md` §5), and a window');
say('  is assigned to the section holding at least five of its eight bars.');
say('- **A per-layer imprint would change most of this.** The whole-mix reading cannot');
say('  tell one held ensemble from another, which is phase 1\'s finding and K5a\'s; the');
say('  layer signatures that can are on a different scale and may not be compared with');
say('  a row here. A mined row that wanted to say *this pad and not that one* has no');
say('  way to, today.');
say('');
say('## What is left');
say('');
say('1. **The rows are candidates and Eugene names them.** Every `name` above is a');
say('   plain description written by the tool out of the class words its members agree');
say('   on; `score` is nought and `verdicts` is empty on every row, because those are');
say('   the two fields no tool may derive.');
say('2. **Whether any of this re-centres `HOUSE`** is his and is not a round\'s. The box');
say('   table says where the two stand and stops there.');
say('3. **The section rows now have boxes, and v1\'s could not.** `notes/archive/2026-09-kitchen/rounds/cookbook.md`');
say('   left *a section has no box* as the thing that would most improve those rows;');
say('   a source section is a stretch of real audio and has an imprint, so these rows');
say('   name birds. The record\'s own section rows still cannot, and that is still the');
say('   per-layer imprint\'s job.');
say('4. **The gap list wants an ear, not another measurement.** What it says is that');
say('   the record\'s dice cannot reach these boxes; whether they *should* is the');
say('   question a listening round answers.');
say('');

const text = `${out.join('\n')}\n`;
if (WRITE) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, text);
  fs.writeFileSync(path.join(IN, 'summary.json'), `${JSON.stringify({
    date: TODAY, cuts: CUT, separation: { stretch: sepStretch, section: sepSection, set: sepSet },
    box: table, boxAll: tableAll,
    clusters: {
      track: { tried: trackK.tried, chose: trackK.best.k, stability: trackStab, dropped: trackTrim.dropped.map((d) => `${d.set}/${d.track}`) },
      sections: Object.fromEntries(Object.entries(sectionRuns).map(([k, v]) => [k, v.skipped ? null : { tried: v.k.tried, chose: v.k.best.k, stability: v.stab }])),
      layer: { tried: layerK.tried, chose: layerK.best.k, stability: layerStab },
    },
    rows: written.map((w) => ({ id: w.row.id, scope: w.row.scope, weight: w.row.weight, problems: w.problems })),
    reach: reach.map((r) => ({ id: r.row.id, verdict: r.verdict, hits: r.hits, nearest: r.nearest && r.nearest.t.row.id, d: r.nearest && r3(r.nearest.d) })),
    rolled: rolledCounts,
  }, null, 1)}\n`);
}
console.error(`  ${written.filter((w) => !w.problems.length).length} rows written to ${path.relative(ROOT, ROWS)}, ${flushed.carried.length} carrying an earlier opinion, ${flushed.orphans.length} orphaned`);
console.error(`  report -> ${path.relative(ROOT, REPORT)}`);
if (!WRITE) process.stdout.write(text);

// --- the ear -----------------------------------------------------------------

/** The first sixteen hex digits of a file's SHA-256: the audio's own identity. */
function hashOfFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

/** The build that rendered a card: a hash over the scratch site's own files. */
function buildIdOf(site) {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir).sort()) {
      const at = path.join(dir, f);
      if (fs.statSync(at).isDirectory()) walk(at);
      else if (/\.(js|html|css)$/.test(f)) h.update(f).update(fs.readFileSync(at));
    }
  };
  walk(site);
  return h.digest('hex').slice(0, 12);
}

/**
 * `--ear`: the nearest thing today's catalogue can make to a mined dish, eight
 * bars of it, for a listener.
 *
 * **There is no A/B on these cards and there cannot be one.** The dish is a
 * stretch of somebody's record, and that record is analysed only — never
 * copied, never played — so the card carries the row's words and its numbers
 * and the render, and nothing else. That is why the session's actions are
 * `MINED_ACTIONS` and not the variants' hit/partial/miss: with no source to
 * hold it against, *did the recipe catch it* is not a question an ear can
 * answer, and *is this dish worth having* is.
 *
 * The candidate is not searched for by rendering. `tmp/imprint/` already holds
 * 235 measured themes of `house-v1` and 14 of `house-v2` on these very anchors,
 * so the ranking is done on measurements that exist and only the winner is
 * rendered — which is the same shape as `variants.ts`'s three stages with its
 * expensive one already paid for. The winner is then rendered **under
 * `house-v2`**, because the ask is what today's catalogue can do, and imprinted
 * again afterwards, because a theme ranked on its v1 reading and played on the
 * v2 catalogue is not the same music and the card must say what it actually is.
 * That is round K5b's rule: when a file is made for an ear, read back what the
 * file says it is before handing it over.
 */
if (has('ear')) {
  const { loudnessWindow } = await import('../../src/loudness.ts');
  const { serveSite, openPage, renderToWav, VENV, IMPRINT_PY } = await import('./render.ts');
  const { execFileSync } = await import('node:child_process');
  const { SCHEMA, MINED_ACTIONS, assertSession, migrateState, provenanceKey, writeSession } = await import('../review/session.ts');

  const EAR = path.join(ROOT, 'tmp', 'ear', 'mined');
  const LAB = path.join(IN, 'ear');
  const PORT = +arg('port', 7051);
  const RATE = +arg('rate', 48000);
  const EAR_BARS = +arg('ear-bars', 8);
  // How many candidates a **section** row auditions before it picks: the
  // record has no measured breakdowns, builds or drops — every reading in
  // `tmp/imprint/` is a main groove — so a section card ranks on the groove
  // readings, renders the named section of each of the nearest few, imprints
  // those, and keeps the nearest of what was actually rendered.
  const EAR_TRY = +arg('ear-try', 5);
  const SITE = arg('site', path.join('tmp', 'analysis', 'mine_v2', 'site'));
  const MAX_CARDS = Math.min(8, +arg('cards', 6));
  const OUT_SESSION = path.resolve(ROOT, arg('out', path.join('notes', 'reviews', 'mined.json')));

  // Which rows get a card: the track rows first, then the biggest section row
  // of each kind, then whatever is left by share. A layer row and a seam row
  // name no bird, so there is no box to find a nearest for and no card.
  const order = [...boxRows].sort((a, b) => {
    const rank = (r) => (r.row.scope === 'track' ? 0 : 1);
    return rank(a) - rank(b) || b.row.weight - a.row.weight;
  });
  const picked = [];
  const seenSection = new Set();
  for (const w of order) {
    if (picked.length >= MAX_CARDS) break;
    if (w.row.scope === 'section') {
      if (seenSection.has(w.row.applies)) continue;
      seenSection.add(w.row.applies);
    }
    picked.push(w);
  }
  for (const w of order) {
    if (picked.length >= MAX_CARDS) break;
    if (!picked.includes(w)) picked.push(w);
  }

  const seedOf = (file) => {
    const m = file.replace(/\.json$/, '').match(/-(\d+)-(\d+)$/);
    return m ? { seed: m[1], theme: +m[2] } : null;
  };
  /**
   * The distance from a box, **weighted by the row's own confidence in each
   * bird** (M9 of the mining review): a bird the sources' reading was unsure
   * of does not get to decide which theme is nearest.
   */
  const distOf = (row, box, point) => {
    const conf = (row.reading && row.reading.confidence) || {};
    const o = outBy(box, point);
    let sum = 0; let w = 0;
    BIRDS.forEach((b, i) => { const c = Number.isFinite(conf[b]) ? conf[b] : 1; sum += c * o[i] * o[i]; w += c; });
    return Math.sqrt(sum / (w || 1));
  };
  /**
   * The window a card is rendered over: for a track row the theme's own main
   * groove, which is the window every reading in `tmp/imprint/` was taken over;
   * for a section row, the first run of the **named** section that is long
   * enough, or nothing — a card for a breakdown that plays a main groove is a
   * card that says what it is not (M9). Bars ahead of the section's first,
   * because a drop is heard as the bar it lands on.
   */
  const windowFor = (row, track) => {
    if (row.scope !== 'section') {
      const win = loudnessWindow(track, 32);
      return { from: Math.max(0, Math.min(track.bars - EAR_BARS, win.from)), section: 'main groove' };
    }
    const run = (track.arrangement.sections || []).find((sec) => sec.kind === row.applies && sec.bars >= EAR_BARS);
    return run ? { from: run.startBar, section: `${run.label || run.kind} (bars ${run.startBar}–${run.startBar + run.bars})` } : null;
  };
  const jobs = [];
  // **One theme per card.** The nearest theme to five of these six boxes is the
  // same one, which is a finding in itself — the record's themes stand together
  // in one place relative to the sources — and it is a useless listening
  // session, because five cards would be the same eight bars five times. So a
  // theme is taken once and the next card gets the next-nearest, and each card
  // says which rank it got.
  const used = new Set();
  const rankWord = (rank) => ['the nearest', 'the second nearest', 'the third nearest', 'the fourth nearest',
    'the fifth nearest', 'the sixth nearest'][rank] || `number ${rank + 1}`;
  for (const w of picked) {
    const box = boxOf(w.row);
    const ranked = [...recordThemes, ...v2Themes]
      .map((t) => ({ t, d: distOf(w.row, box, t.point), where: seedOf(t.file) }))
      .filter((r) => r.where)
      .sort((a, b) => a.d - b.d);
    // A track row takes the nearest unused theme, rendered over its own main
    // groove. A section row takes the nearest **few** unused themes that have
    // a run of the named section long enough to play, and the card is chosen
    // among them after they are rendered and read (below).
    const tries = [];
    for (let i = 0; i < ranked.length && tries.length < (w.row.scope === 'section' ? EAR_TRY : 1); i += 1) {
      const r = ranked[i];
      const key = `${r.where.seed}#${r.where.theme}`;
      if (used.has(key) || tries.some((t) => `${t.seed}#${t.theme}` === key)) continue;
      const track = planTheme(r.where.seed, r.where.theme, { strategy: 'house-v2' });
      const win = windowFor(w.row, track);
      if (!win) continue;
      tries.push({ seed: r.where.seed, theme: r.where.theme, track, fromBar: win.from, section: win.section,
        rank: i + 1, rankWord: rankWord(i), d0: r.d, nearest: ranked[0].d });
    }
    if (!tries.length) { console.error(`  ${w.row.id}: no measured theme has a ${w.row.applies} of ${EAR_BARS} bars; no card`); continue; }
    for (const t of tries) used.add(`${t.seed}#${t.theme}`);
    jobs.push({ row: w, tries });
  }

  fs.mkdirSync(LAB, { recursive: true });
  // A scratch build, never `docs/`: the public site is a committed artefact and
  // rebuilding it is a separate decision from wanting a render.
  const site = path.isAbsolute(SITE) ? SITE : path.join(ROOT, SITE);
  if (!fs.existsSync(path.join(site, 'index.html')) || has('build')) {
    console.error(`  building a scratch site into ${path.relative(ROOT, site)}`);
    execFileSync('npx', ['vite', 'build', '--outDir', site, '--logLevel', 'error'],
      { cwd: path.join(ROOT, 'packages', 'deep-house'), stdio: 'inherit' });
  }
  // The approval identity every card carries (M2 of the mining review): which strategy
  // planned it, which build rendered it — a hash of the scratch site's own
  // files, plus the git head for a reader — and what the wav's bytes hash to.
  // A decision migrates onto a rebuilt card only when all three are the same.
  const build = buildIdOf(site);
  let head = null;
  try { head = run('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* no git here */ }
  const server = await serveSite(PORT, site);
  const page = await openPage(PORT);
  const items = [];
  try {
    for (const j of jobs) {
      const box = boxOf(j.row.row);
      const read = [];
      for (const t of j.tries) {
        // The name is the provenance of the music and nothing else, which is
        // the rule `cookbook.ts` settled: the same music is always the same
        // file and a decision survives a re-ranking.
        const id = provenanceKey('mined', t.seed, t.theme, t.fromBar, EAR_BARS, RATE);
        const file = path.join(EAR, `${id}.wav`);
        const began = Date.now();
        const r = await renderToWav(page.page, {
          masterSeed: t.seed, theme: t.theme, opts: { strategy: 'house-v2' },
          preFromBar: Math.max(0, t.fromBar - 2), fromBar: t.fromBar, toBar: t.fromBar + EAR_BARS, tail: 1.5,
        }, file, RATE);
        // Read back what the file says it is. The page planned this theme
        // itself; if its tempo is not the tempo the node-side plan has, the
        // page is not playing the record this card claims and the card must
        // not be written.
        if (Math.abs(r.bpm - t.track.bpm) > 0.01) {
          throw new Error(`${id}: the page planned ${r.bpm} BPM where node planned ${t.track.bpm}`);
        }
        const im = path.join(LAB, `${id}.json`);
        execFileSync(VENV, [IMPRINT_PY, file, '--out', im, '--origin', 'generated', '--quiet',
          '--window', String(r.seconds), '--label', `house-v2 ${t.seed}#${t.theme} bar ${t.fromBar}+${EAR_BARS}`]);
        const imprint = JSON.parse(fs.readFileSync(im, 'utf8'));
        const point = Object.fromEntries(BIRDS.map((b) => [b, imprint.summary.birds[b].median]));
        const outside = BIRDS.filter((b) => point[b] < box[b][0] || point[b] > box[b][1]);
        const d = r3(distOf(j.row.row, box, point));
        read.push({ ...t, id, file, r, point, outside, d });
        console.error(`  ${id}  ${((Date.now() - began) / 1000).toFixed(1)} s  ${r.events} events  ${t.section}  `
          + `${outside.length ? `out on ${outside.join(',')}` : 'inside'}  d ${d}`);
      }
      // The card is the nearest of what was **rendered and read**, which for a
      // track row is its one candidate and for a section row the nearest
      // section among the few that were played.
      read.sort((a, b) => a.d - b.d);
      const best = read[0];
      const others = read.slice(1);
      items.push({
        id: best.id,
        title: j.row.row.name,
        subtitle: `${j.row.row.scope}${j.row.row.applies ? ` / ${j.row.row.applies}` : ''} · `
          + `${pct(j.row.row.weight * 100, 100)} of the sources · ${best.seed}#${best.theme} bar ${best.fromBar}+${EAR_BARS} under house-v2 · `
          + (best.outside.length ? `out of the box on ${best.outside.join(', ')}` : 'inside the box'),
        wav: path.relative(ROOT, best.file),
        meta: {
          seed: best.seed, theme: best.theme, bars: `${best.fromBar}+${EAR_BARS}`, rate: RATE,
          strategy: 'house-v2', build, head, audioHash: hashOfFile(best.file),
          section: best.section,
          room: best.track.preset, density: best.track.density,
          bpm: r3(best.r.bpm), events: best.r.events,
          'the dish, in the sources': BIRDS.map((b) => `${b.slice(0, 2)} ${box[b][0]}-${box[b][1]}`).join(', '),
          'what this render measured': BIRDS.map((b) => `${b.slice(0, 2)} ${r3(best.point[b])}`).join(', '),
          'distance from the box': best.d,
          'ranked on': `its main-groove reading, ${r3(best.d0 ?? best.d)} from the box — ${best.rankWord} of `
            + `${recordThemes.length + v2Themes.length} measured themes${best.rank > 1 ? `, the ones above it already having a card or no ${j.row.row.applies || 'groove'} to play (the nearest of all is ${r3(best.nearest)})` : ''}; `
            + (j.row.row.scope === 'section'
              ? `${read.length} candidate${read.length === 1 ? '' : 's'} rendered at ${j.row.row.applies === 'main' ? 'the groove' : `the ${j.row.row.applies}`} and read back, this one the nearest`
                + (others.length ? ` (the others: ${others.map((o) => `${o.seed}#${o.theme} at ${o.d}`).join(', ')})` : '')
              : 'played here on the house-v2 catalogue'),
          'wants': [
            j.row.row.wants.figures ? Object.entries(j.row.row.wants.figures).map(([k, v]) => `${k} ${v}`).join(', ') : null,
            j.row.row.wants.rates ? Object.entries(j.row.row.wants.rates).map(([k, v]) => `${k} ${v.perBar}/bar`).join(', ') : null,
          ].filter(Boolean).join(' · '),
          'no A/B': 'the dish is a stretch of a reference set, which is analysed only and never played',
        },
        row: path.relative(ROOT, path.join(ROWS, `${j.row.row.id.split('/').pop()}.json`)),
      });
    }
  } finally {
    await page.close();
    server.close();
  }

  const previous = fs.existsSync(OUT_SESSION) ? JSON.parse(fs.readFileSync(OUT_SESSION, 'utf8')) : null;
  const migrated = previous ? migrateState(previous, items, { rate: RATE }) : { state: {}, lost: [], superseded: {}, blind: [] };
  if (migrated.lost.length) console.error(`  ${migrated.lost.length} earlier decisions name music no row is nearest to any more: ${migrated.lost.join(', ')}`);
  const sup = Object.keys(migrated.superseded);
  if (sup.length) console.error(`  ${sup.length} earlier decisions were about other audio of the same seed and bars and are kept as superseded, not as answers: ${sup.join(', ')}`);
  if (migrated.blind.length) console.error(`  ${migrated.blind.length} earlier decisions carried by provenance alone (no audio identity on one side): ${migrated.blind.join(', ')}`);
  const session = {
    schema: SCHEMA,
    id: 'mined',
    title: 'Mined from the reference sets: the nearest today\'s catalogue gets',
    kind: 'mined',
    rowWrite: 'score+verdict',
    items,
    actions: MINED_ACTIONS,
    // A decision already given survives a re-run: it is keyed by the music's
    // own provenance, so a card that is still the same eight bars keeps its
    // answer even when the ranking moves it to another row — **and only when
    // it is still the same audio**; an answer about an earlier build's render
    // of the same bars is kept beside the state as superseded.
    state: migrated.state,
    ...(sup.length ? { superseded: migrated.superseded } : {}),
    provenance: {
      tool: 'packages/deep-house/tools/imprint/mine-v2.ts --ear',
      report: 'notes/analysis/mining-v2.md',
      rows: path.relative(ROOT, ROWS),
      date: TODAY,
      note: 'One card per mined row that names a bird. The music is house-v2, rendered offline '
        + 'through the real graph; the dish it is nearest to is a stretch of a reference set, which '
        + 'is analysed only and is never played — so there is no source button and the card carries '
        + "the dish's numbers instead. The candidate was ranked on the 249 themes already measured "
        + 'in tmp/imprint/ and only the winner was rendered.',
    },
  };
  assertSession(session, OUT_SESSION);
  writeSession(OUT_SESSION, session);
  console.error(`  ${items.length} cards -> ${path.relative(ROOT, OUT_SESSION)}`);

  // The report gets a section of its own, appended rather than re-run, because
  // the analysis above is the same analysis whether anything was rendered or
  // not and re-deriving it to add six lines would be a second answer to a
  // question already answered.
  if (WRITE && fs.existsSync(REPORT)) {
    const add = [];
    add.push('## 5. The nearest today\'s catalogue gets, by ear');
    add.push('');
    add.push(`\`npm run review -- ${path.relative(ROOT, OUT_SESSION)}\` — ${items.length} cards in \`tmp/ear/mined/\`.`);
    add.push('');
    add.push('**There is no A/B on these cards and there cannot be one.** The dish is a stretch');
    add.push('of somebody\'s record and that record is analysed only, so the card carries the');
    add.push('row\'s words and the two readings — the box the sources cut, and what the render');
    add.push('actually measured — and the question is whether the dish is worth having, which');
    add.push('is why the session\'s actions are a fourth set (`MINED_ACTIONS`) and not the');
    add.push('variants\' hit/partial/miss.');
    add.push('');
    add.push('Nothing was searched for by rendering. The ranking is over the 249 themes already');
    add.push('measured in `tmp/imprint/`, and only the winner of each row was rendered — under');
    add.push('`house-v2`, because the ask is what today\'s catalogue can do, and imprinted again');
    add.push('afterwards, because a theme ranked on its v1 reading and played on the v2');
    add.push('catalogue is not the same music.');
    add.push('');
    add.push('| row | the theme, and the section it is played at | ranked | what the render measured outside the box | distance |');
    add.push('|---|---|---|---|---|');
    for (const it of items) {
      add.push(`| \`${it.row.split('/').pop().replace(/\.json$/, '')}\` | ${it.meta.seed}#${it.meta.theme} bar ${it.meta.bars}, ${it.meta.section} `
        + `| ${it.meta['ranked on'].split(' — ')[1].split(' of ')[0]} `
        + `| ${it.subtitle.split(' · ').pop().replace('out of the box on ', '')} | ${it.meta['distance from the box']} |`);
    }
    add.push('');
    add.push('**The nearest theme to five of the six boxes was the same one.** That is a finding');
    add.push('and not a coincidence: the record\'s themes stand together in one place relative to');
    add.push('the sources, so a listening session built on "the nearest" would have been the');
    add.push('same eight bars five times over. A theme is therefore taken once and each card');
    add.push('says which rank it got.');
    add.push('');
    add.push('And the reading to take from the table: **Spark and Loom are out on every one of');
    add.push('the six, Veil on five**, which are the three birds `imprint-calibration.md` §4');
    add.push('already named as the real gap between the record and the sources. Nothing here');
    add.push('is new evidence for that; what is new is that it survives a per-window reading of');
    add.push('contiguous audio, which is the reading the 09-17 note said it could not make.');
    add.push('');
    // Before the gap list, so the report reads 1 to 5 and then what is missing.
    fs.writeFileSync(REPORT, fs.readFileSync(REPORT, 'utf8')
      .replace('## The gap list', `${add.join('\n')}\n## The gap list`));
  }
}
