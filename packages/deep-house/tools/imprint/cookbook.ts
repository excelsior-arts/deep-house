// cookbook.ts — the archetypes of the record, found rather than written.
//
//   node tools/imprint/cookbook.ts --render   render and imprint what is missing
//   node tools/imprint/cookbook.ts            cluster, write the candidate rows and the sheet
//   node tools/imprint/cookbook.ts --ear      the same, and the reference wavs under them
//   node tools/imprint/cookbook.ts --refresh  re-derive every row and say what moved
//
// PLAN-RECIPES says the first recipes are **extracted from what exists**: the
// catalogue already contains archetypes, so find them and move to the recipe
// system without moving the golden. Eugene's own words for this round are the
// specification — *"you should be able to extract recipes in an automated
// fashion from v1, then make me reference wavs so by ear I pick which ones go
// to the cookbook"* — so this tool does four things and stops:
//
//   1. **Plan** a sweep of three hundred themes and read the facts off each of
//      them, per section kind and for the theme. Planning is milliseconds and
//      costs nothing, so the sweep is wide before it is deep.
//   2. **Cluster** them. At track scope on the audio *and* the plan together —
//      the eight birds of the theme's own main-groove imprint, and the roles,
//      timbre properties, rates and stage the birds cannot see; at section
//      scope on the plan alone, because a section has no imprint and inventing
//      one would be inventing the evidence.
//   3. **Render** the medoid of every archetype, so the thing a listener judges
//      is a real member of the cluster and not a synthesis of it.
//   4. **Write** each archetype as a recipe row with an empty `verdicts` list,
//      outside git, and a contact sheet with a verdict column for Eugene.
//
// ## The rule this tool is built round: everything but a label is derived
//
// The encoder is early — two recipes and eight labels, and `PLAN-IMPRINT`'s own
// "maturing the encoder" section says what settled looks like and that we are
// nowhere near it. Eugene's constraint follows from that and it shapes the
// whole file: *"if we pick recipes into the cookbook and then change the
// algorithm we will have to recreate the recipes"*. So **a cookbook row carries
// everything needed to make itself again** — the medoid's seed, theme and bar
// range, the sweep's seed range, the anchors the scale was read on, and the
// hash of this tool — and re-running regenerates every field from that
// provenance. Two fields are never regenerated because no tool can derive them:
//
//   `verdicts` — what Eugene said about the reference wav, in his words;
//   `picked`   — whether he wants the row in the cookbook.
//
// They are carried across by the **medoid** and not by the row's id or its file
// name, because a verdict points at a piece of music: `recipe-demo.md`'s rule
// that a variant keeps its number for life, kept by pointing at the seed rather
// than at the number. Change the distance, change k, change the tool, re-run:
// the labels follow the music they were given about.
//
// Two rules more, both of them the project's and neither of them new.
// **Nothing enters `packages/deep-house/recipes/` here.** A row in the library
// is a decision and the decision is his; what this writes is a candidate under
// `notes/recipes/candidates/`, which is outside git with the rest of `notes/`.
// And **nothing is rendered twice**: every render is cached by what decides its
// bytes — the seed, the theme, the bars, the sample rate and the build — so a
// re-run of a changed algorithm over the same catalogue costs no audio at all.
//
// The renders: one at a time, headless Chromium reniced to the bottom of the
// queue, the page on the silent route, on a port that is never 6975, and not
// begun while another headless browser on this machine is rendering. An
// OfflineAudioContext has no output device; nothing here can be heard.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BY_NAME, FAMILIES, ROLES, TIMBRES } from '@deep-house/engine/voices';
import { planTheme, STYLE } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { BIRDS } from '../../src/spell.ts';
import { validate, vocabularyOf, boxOf, weightOf } from '../../src/recipe.ts';
import Rng from '../../src/rng.ts';
import {
  eventsIn, ratesOf, stageOf, roleOfVoice, timbreWants, round3, RATE_BAND, STAGE_POLICY,
} from './plan-facts.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';
import { hasOpinion } from './human-fields.ts';
import { migrateState as migrateSession } from '../review/session.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(ROOT, 'packages', 'deep-house');
const OUT = path.join(ROOT, 'tmp', 'imprint', 'cookbook');
const SWEEP = path.join(ROOT, 'tmp', 'imprint', 'sweep');
const GOLDEN = path.join(ROOT, 'tmp', 'imprint', 'golden');
const CACHE = path.join(ROOT, 'tmp', 'imprint', 'cache');
const EAR = path.join(ROOT, 'tmp', 'ear', 'cookbook');
const EAR_IMPRINTS = path.join(ROOT, 'tmp', 'imprint', 'cookbook-ear');
const CANDIDATES = path.join(ROOT, 'notes', 'recipes', 'candidates');
const SHEET = path.join(ROOT, 'notes', 'analysis', 'cookbook.md');
const REVIEW = path.join(ROOT, 'notes', 'reviews', 'cookbook.json');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

/** A directory of files, by content, for the files a predicate keeps. */
function hashOf(dir, keep) {
  if (!fs.existsSync(dir)) return 'missing';
  const h = crypto.createHash('sha256');
  const walk = (at) => {
    for (const f of fs.readdirSync(at).sort()) {
      const full = path.join(at, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (keep(f)) { h.update(path.relative(dir, full)); h.update(fs.readFileSync(full)); }
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 12);
}

/** This tool, by content. A row says which version of the extraction made it. */
const TOOL_VERSION = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(HERE, 'cookbook.ts'))).digest('hex').slice(0, 8);

/** The built site, by content: the bundle a render actually went through. */
const BUILD_ID = hashOf(path.join(ROOT, 'docs'), (f) => /\.(js|html|css)$/.test(f));

/**
 * **The build, as far as the audio is concerned.** It is half of a render's
 * identity — the same seed through a different composer is a different piece of
 * audio — so a cache keyed without it would hand back last week's sound after a
 * change to the engine.
 *
 * It is the *sources that make the sound* and not the bundle, and the
 * difference matters because the interface is rewritten far more often than the
 * composer is: a round that moves a cell of the ring rebuilds `docs/` and
 * changes nothing a render can hear, and a cache keyed on the bundle would
 * throw away two hours of audio to prove it. The three files left out are the
 * three nothing on the render path reaches — `renderProgram` is handed a
 * `Program`, `planTheme` is handed a seed, and neither the ring, the control
 * surface nor the page's own markup is reachable from either. `debug.ts` is
 * *in*, because it is the surface the render calls through, and the style, the
 * voices and the master are in because they are the sound itself.
 *
 * The bundle's own hash is recorded on every cache entry beside this one, so a
 * row can still say which build made its bytes.
 */
const INTERFACE_ONLY = new Set(['ring.ts', 'control.ts', 'index.html']);
const COMPOSER_ID = crypto.createHash('sha256')
  .update(hashOf(path.join(PKG, 'src'), (f) => /\.(js|ts)$/.test(f) && !INTERFACE_ONLY.has(f)))
  .update(hashOf(path.join(ROOT, 'packages', 'engine', 'src'), (f) => /\.(js|ts)$/.test(f)))
  .digest('hex').slice(0, 12);

// --- the sweep ---------------------------------------------------------------
//
// A hundred master seeds and three themes of each. A hundred and not forty
// because phase 1's sweep was sized for the narrowest candidate list to have a
// count in double figures, and this one is sized for a *cluster* to: six to
// twelve archetypes over three hundred themes is twenty-five to fifty themes
// each, which is enough for a centre and a spread to mean something. The seeds
// are stated and not drawn, so a re-run measures the same record.
//
// Seeds 1-40 are phase 1's own sweep and are already imprinted; those hundred
// and twenty readings are taken off disk rather than made again.
export const COOKBOOK_SEEDS = Array.from({ length: 100 }, (_, i) => String(i + 1));
export const COOKBOOK_THEMES = 3;

// The window a theme is read over. Thirty-two bars of its own main groove, the
// window `analysis/imprint-calibration.md` calibrated on and the window phase
// 1's sweep used, because a reading taken over a different window is a
// different number and the readings already on disk were taken over this one.
const WINDOW_BARS = 32;

// The section kinds that get a scope of their own. `intro` and `outro` are
// left out on purpose: they are the arrangement's punctuation rather than a
// dish, they are four bars more often than not, and nobody marks one.
export const SECTION_KINDS = ['drop', 'breakdown', 'build'];

const PORT = +arg('port', 7031);
const RATE = +arg('rate', 48000);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const PY = arg('python', VENV);
// Sixteen bars for a reference wav, which is what `recipe-demo.md` asked for
// after ten seconds turned out to be four bars and left half the birds at a
// confidence that could not decide anything.
const EAR_BARS = +arg('ear-bars', 16);
// And a floor, for a section shorter than one. A four-bar build is ten seconds
// and ten seconds is what `recipe-demo.md` asked not to be given again, so a
// short section runs on into whatever follows it — which is what a build does
// anyway, and is the thing a listener is judging when they judge a build.
const EAR_FLOOR_BARS = 8;

/**
 * **The name of a rendered reference, which is its provenance and nothing else.**
 *
 * `<scope>-s<seed>-t<theme>-b<from>-<to>-<rate>` — the same key the render
 * cache is built on, and for the same reason: the same music must always be the
 * same file. The first cut of this named a wav by its rank in the run and a
 * truncated description of it (`track-01-sub-room-minimal-a-bright-figure…`),
 * and neither of those survives a re-clustering: a row that moves from second
 * to third, or a cluster whose modal pad changes, renames a file that Eugene
 * has already decided about and the decision points at nothing. A seed and a
 * bar range cannot move, because they *are* the music.
 *
 * The description is not lost, it is moved: it is the manifest item's `title`
 * and the row's `name`, where a person reads it and no tool keys on it.
 */
export const referenceName = (scope, master, theme, from, bars, rate = RATE) =>
  `${scope}-s${master}-t${theme}-b${from}-${from + bars}-${rate}`;

/** The bars a reference wav covers, for an archetype's medoid. */
export function earWindow(scope, track, window) {
  const from = scope === 'track' ? loudnessWindow(track, EAR_BARS).from : window.from;
  const want = scope === 'track'
    ? Math.min(EAR_BARS, loudnessWindow(track, EAR_BARS).bars)
    : Math.min(EAR_BARS, Math.max(EAR_FLOOR_BARS, window.bars));
  return { from, bars: Math.max(1, Math.min(want, track.bars - from)) };
}

// How many files Eugene is asked to listen to. Under twenty-five is the brief;
// clusters past that are merged into their nearest neighbour and the sheet says
// which, because a cookbook nobody finishes listening to is not a cookbook.
const MAX_FILES = +arg('max-files', 25);

// How much of a cluster a thing has to be before the row says the cluster wants
// it — `room-recipes.ts`'s own two numbers, kept the same so a cookbook row
// and a room row mean the same thing by `wants`.
const CAST_SHARE = 0.9;
const STAGE_SHARE = 0.6;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1)));
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const modal = (xs) => {
  const c = new Map();
  for (const x of xs) if (x != null) c.set(x, (c.get(x) || 0) + 1);
  const e = [...c.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return e.length ? { value: e[0][0], share: e[0][1] / xs.length } : { value: null, share: 0 };
};

// --- what the plan says ------------------------------------------------------

const fill = (mask) => (typeof mask === 'string' && mask.length
  ? [...mask].filter((c) => c !== '.').length / mask.length : 0);
const offGrid = (mask) => {
  if (typeof mask !== 'string' || !mask.length) return 0;
  const on = [...mask].filter((c, i) => c !== '.' && i % 4 === 0).length;
  const all = [...mask].filter((c) => c !== '.').length;
  return all ? round3((all - on) / all) : 0;
};
const densityWord = (f) => (f <= 0.15 ? 'sparse' : f <= 0.30 ? 'offbeat' : f <= 0.55 ? 'broken' : 'sixteenths');
const lengthWord = (bars) => (bars >= 2 ? 'held' : bars >= 0.9 ? 'long' : bars >= 0.4 ? 'medium' : 'short');

/**
 * Everything a recipe may know about a span of bars, read off the plan where
 * the plan is exact: which roles and families sound, what the three timbre
 * slots declare about themselves, how often each role fires, what the desk is
 * doing, and the figures' own shape.
 *
 * It is the same reading `recipe-from-mark.ts` makes of a listener's mark and
 * `room-recipes.ts` makes of a room, so what a cookbook row *wants* and what a
 * marked stretch *was* are the same measurement made twice.
 */
export function factsOf(track, fromBar, bars) {
  const toBar = fromBar + bars;
  const events = eventsIn(track, fromBar, toBar);
  const roles = new Set();
  const families = new Set();
  const lengths = {};
  for (const e of events) {
    const role = roleOfVoice(e.voice, track);
    if (role) roles.add(role);
    const d = BY_NAME[e.voice];
    if (d && d.family) families.add(d.family);
    if (role && e.p && typeof e.p.dur === 'number') (lengths[role] = lengths[role] || []).push(e.p.dur / track.barSeconds);
  }
  const noteLength = {};
  for (const role of Object.keys(lengths)) {
    const xs = lengths[role].sort((a, b) => a - b);
    noteLength[role] = lengthWord(xs[Math.floor(xs.length / 2)]);
  }
  // How many bars a chord holds inside the span, off the timeline itself.
  const inBars = [...new Set(events.map((e) => e.bar))].sort((a, b) => a - b);
  const romans = inBars.map((b) => track.timeline[b] && track.timeline[b].roman).filter(Boolean);
  let runs = 1;
  for (let i = 1; i < romans.length; i++) if (romans[i] !== romans[i - 1]) runs++;
  const d = track.dice;
  return {
    bars,
    events: events.length,
    roles: [...roles].sort(),
    families: [...families].sort(),
    rates: ratesOf(track, events, bars),
    stage: stageOf(track, fromBar, toBar),
    noteLength,
    timbres: { lead: d.leadTimbre, pad: d.padTimbre, stab: d.stabTimbre },
    // The room and the palette are read because they are facts of the plan and
    // they separate clusters; **neither may be written into a row**, because a
    // row names no room and no effect palette (`src/recipe.ts`'s own gate), so
    // they live here, in the distance and in the prose, and nowhere else.
    room: track.preset,
    palette: d.fxPalette,
    density: track.density,
    voicing: d.voicingStyle,
    hatDensity: densityWord(fill(d.hatMask)),
    bassDensity: densityWord(fill(d.bassMask)),
    figureDensity: densityWord(fill(d.stabMask)),
    bassSyncopation: offGrid(d.bassMask),
    figureSyncopation: offGrid(d.stabMask),
    loopBars: d.loopBars,
    barsPerChord: romans.length ? round3(romans.length / runs) : null,
  };
}

/**
 * The windows of one theme: its main-groove window at track scope, and every
 * drop, breakdown and build it has at section scope.
 *
 * The track window is `loudnessWindow`'s, which is the window the imprint of
 * this theme was read over; a section's window is the section, whole, because
 * a section is already the unit a `section` recipe is written in.
 */
export function windowsOf(track) {
  const w = loudnessWindow(track, WINDOW_BARS);
  const out = [{ scope: 'track', kind: 'main', from: w.from, bars: w.bars, index: null }];
  for (const s of track.arrangement.sections) {
    if (!SECTION_KINDS.includes(s.kind)) continue;
    out.push({ scope: 'section', kind: s.kind, from: s.startBar, bars: s.bars, index: s.index });
  }
  return out;
}

/** Every theme of the sweep, planned, with the facts of each of its windows. */
export function cookbookThemes() {
  const rows = [];
  for (const master of COOKBOOK_SEEDS) {
    for (let n = 0; n < COOKBOOK_THEMES; n++) {
      const track = planTheme(master, n, {});
      const windows = windowsOf(track).map((w) => ({ ...w, facts: factsOf(track, w.from, w.bars) }));
      rows.push({ key: `${master}#${n}`, master, theme: n, track, windows });
    }
  }
  return rows;
}

// --- what the audio says -----------------------------------------------------

/**
 * Every imprint on disk that is a main-groove window of a theme of this sweep,
 * wherever it was made: phase 1's own sweep and the golden's calibration are
 * the same window on the same scale, so they are read rather than re-rendered,
 * and `--render` only makes what neither of them has.
 *
 * A row measured on a different anchors file is a different number
 * (`PLAN-IMPRINT` section 7) and is refused rather than quietly averaged in.
 */
export function readings() {
  const rows = new Map();
  const from = new Map();
  const take = (dir, re, where) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const m = re.exec(f);
      if (!m) continue;
      const im = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const birds = {};
      for (const b of BIRDS) birds[b] = im.summary.birds[b].median;
      rows.set(`${m[1]}#${m[2]}`, { birds, confidence: im.summary.confidence, anchors: im.tool.anchors });
      from.set(`${m[1]}#${m[2]}`, where);
    }
  };
  take(SWEEP, /^sweep-(\d+)-(\d+)\.json$/, 'phase 1');
  take(GOLDEN, /^golden-(\d+)-(\d+)\.json$/, 'the calibration');
  take(OUT, /^cookbook-(\d+)-(\d+)\.json$/, 'here');
  const anchors = [...new Set([...rows.values()].map((r) => r.anchors))];
  if (anchors.length > 1) throw new Error(`the imprints on disk were read on ${anchors.length} scales (${anchors.join(', ')}); they are not comparable`);
  return { rows, from, anchors: anchors[0] || null };
}

// --- the render cache --------------------------------------------------------
//
// What decides a render's bytes, and nothing else: the seed, the theme, the
// bars either side of the window, the tail, the sample rate and the build. Two
// runs of a changed *algorithm* over the same catalogue ask for exactly the same
// audio, so the second one should cost nothing — which is the difference
// between an extraction that can be re-run when the encoder moves and one that
// is too expensive to re-run and therefore never is.

const cacheKey = (job, rate) => crypto.createHash('sha256').update(JSON.stringify({
  masterSeed: String(job.masterSeed), theme: job.theme,
  preFromBar: job.preFromBar, fromBar: job.fromBar, toBar: job.toBar, tail: job.tail,
  rate, composer: COMPOSER_ID,
})).digest('hex').slice(0, 16);

const cacheFile = (key) => path.join(CACHE, `${key}.json`);
const cacheWav = (key) => path.join(CACHE, `${key}.wav`);

function cacheGet(key) {
  const f = cacheFile(key);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function cachePut(key, entry) {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cacheFile(key), JSON.stringify(entry, null, 1) + '\n');
}

/** `imprint.py` over one wav, as the row it writes. */
function imprintWav(file, out, label) {
  execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, file,
    '--out', out, '--origin', 'generated', '--raw', '--quiet', '--label', label],
  { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

// --- the distances -----------------------------------------------------------

// **Which birds vote, and how much.** A bird votes in proportion to how well
// each of the two readings could measure it, which is `PLAN-IMPRINT` section 7's
// own rule for a nearest-recipe query, and Gleam votes less than the rest
// whatever its confidence says: the calibration found its key detector gets the
// root right four times in fourteen, both of its features are computed from the
// root it heard, and phase 1 measured the mode it is supposed to be about moving
// it by 0.008 against a spread of 0.08. A third of a vote is the demo's
// recommendation ("drop Gleam from a listener recipe's box, or keep it and let
// its confidence widen it to nothing") applied where it does least harm.
export const BIRD_WEIGHT = { ember: 1, tide: 1, zephyr: 1, root: 1, gleam: 0.35, veil: 1, spark: 1, loom: 1 };

/**
 * How far two readings stand apart, in units of **the record's own spread** on
 * each bird.
 *
 * The scaling is phase 1's kernel width and it is there for the same reason: a
 * bird the record barely varies on (Loom, 0.037) and a bird it varies on by a
 * fifth (Tide, 0.170) are not the same distance apart when they differ by the
 * same 0.05, and a raw Euclidean over the eight lets the wide ones do all the
 * clustering.
 */
export function birdDistance(a, b, spread) {
  let sum = 0;
  let w = 0;
  for (const bird of BIRDS) {
    const weight = BIRD_WEIGHT[bird] * Math.min(a.confidence[bird] ?? 1, b.confidence[bird] ?? 1);
    if (!(weight > 0)) continue;
    sum += weight * (((a.birds[bird] - b.birds[bird]) / spread[bird]) ** 2);
    w += weight;
  }
  return w ? Math.sqrt(sum / w) : 0;
}

const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  const both = [...A].filter((x) => B.has(x)).length;
  const all = new Set([...A, ...B]).size;
  return all ? 1 - both / all : 0;
};
const ratio = (a, b, octaves = 2) => (a > 0 && b > 0 ? Math.min(1, Math.abs(Math.log2(a / b)) / octaves) : (a === b ? 0 : 1));
const differs = (a, b) => (a === b ? 0 : 1);

/**
 * What the plan says, as a distance. Seven blocks, each normalised to 0..1
 * inside itself and then weighted, so the answer is 0..1 whatever a theme
 * happens to play.
 *
 * The weights are the same argument `src/style-distance.ts` makes about which
 * differences a listener notices first, read for a *recipe* rather than for a
 * throw of the dice: the cast and the timbre properties carry most, because the
 * eight verdicts of 09-18 were about exactly those two (a timbre whose `hold`
 * is 0.048 in the lead, and a desk that moved the front), and the room carries
 * one because it is the single biggest difference the generator makes — and
 * because at section scope there is no bird to see it.
 */
export const FACT_WEIGHTS = { roles: 1.2, families: 0.6, rates: 1, timbres: 1.2, stage: 1, figures: 1, room: 1 };

export function factDistance(a, b) {
  const roles = jaccard(a.roles, b.roles);
  const families = jaccard(a.families, b.families);

  const roleSet = new Set([...Object.keys(a.rates), ...Object.keys(b.rates)]);
  const rateParts = [...roleSet].map((role) => {
    const x = a.rates[role];
    const y = b.rates[role];
    if (!x || !y) return 1;
    return ratio(x.perBar, y.perBar);
  });
  const rates = rateParts.length ? mean(rateParts) : 0;

  const slotParts = ['lead', 'pad', 'stab'].map((slot) => {
    const x = TIMBRES[a.timbres[slot]];
    const y = TIMBRES[b.timbres[slot]];
    if (!x || !y) return x === y ? 0 : 1;
    // `hold` carries half of a slot on its own. It is the number that separated
    // the two variants Eugene rejected out of hand from the one he called a
    // hit, and it is the only property in the table with a verdict behind it.
    return 0.5 * ratio(x.hold, y.hold, 3) + 0.3 * ratio(x.brightnessHz, y.brightnessHz, 2) + 0.2 * differs(x.struck, y.struck);
  });
  const timbres = mean(slotParts);

  const stage = mean([
    differs(a.stage.front, b.stage.front),
    differs(a.stage.lead, b.stage.lead),
    jaccard(a.stage.back, b.stage.back),
    jaccard(a.stage.treatments, b.stage.treatments),
    differs(a.stage.steadyFront, b.stage.steadyFront),
  ]);

  const figures = mean([
    differs(a.hatDensity, b.hatDensity),
    differs(a.bassDensity, b.bassDensity),
    differs(a.figureDensity, b.figureDensity),
    Math.abs(a.bassSyncopation - b.bassSyncopation),
    Math.abs(a.figureSyncopation - b.figureSyncopation),
    differs(a.density, b.density),
    differs(a.voicing, b.voicing),
    differs(a.palette, b.palette),
    ratio(a.loopBars, b.loopBars, 2),
    a.barsPerChord && b.barsPerChord ? Math.min(1, Math.abs(a.barsPerChord - b.barsPerChord) / 4) : differs(a.barsPerChord, b.barsPerChord),
  ]);

  const parts = { roles, families, rates, timbres, stage, figures, room: differs(a.room, b.room) };
  let sum = 0;
  let total = 0;
  for (const k of Object.keys(FACT_WEIGHTS)) { sum += FACT_WEIGHTS[k] * parts[k]; total += FACT_WEIGHTS[k]; }
  return sum / total;
}

/**
 * The two halves, joined. Each is divided by its own mean over every pair
 * before they are added, so neither half decides the clustering by being
 * measured in bigger units than the other — the bird half is in spreads of the
 * record and the plan half is in a share of a vocabulary, and there is no
 * natural exchange rate between them. Half and half is a choice, and it is the
 * choice `recipe-demo.md` argues for: the birds said the nearest thing in the
 * catalogue was the thing he liked least, and the plan said why.
 */
export function matrixOf(points, { withBirds, spread }) {
  const n = points.length;
  const bird = withBirds ? Array.from({ length: n }, () => new Float64Array(n)) : null;
  const fact = Array.from({ length: n }, () => new Float64Array(n));
  let birdSum = 0;
  let factSum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const f = factDistance(points[i].facts, points[j].facts);
      fact[i][j] = f; fact[j][i] = f; factSum += f;
      if (withBirds) {
        const b = birdDistance(points[i].reading, points[j].reading, spread);
        bird[i][j] = b; bird[j][i] = b; birdSum += b;
      }
      pairs++;
    }
  }
  const factMean = factSum / pairs || 1;
  const birdMean = withBirds ? (birdSum / pairs || 1) : 0;
  const D = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = withBirds
        ? 0.5 * (bird[i][j] / birdMean) + 0.5 * (fact[i][j] / factMean)
        : fact[i][j] / factMean;
      D[i][j] = d; D[j][i] = d;
    }
  }
  return { D, birdMean: r3(birdMean), factMean: r3(factMean) };
}

// --- k-medoids ---------------------------------------------------------------
//
// Medoids and not centroids, for one reason that decides everything downstream:
// **a cluster's representative has to be a real theme**, because the thing
// Eugene listens to is a render and there is no way to render an average. The
// medoid is the member with the smallest total distance to the rest of its own
// cluster, so every reference wav is a piece of music the generator actually
// makes — and, because the labels are carried by the medoid, the thing a
// verdict points at is a seed and a bar range rather than a file name.

/** One run: build a seeding, then alternate assign and re-medoid until still. */
export function kmedoids(D, k, rng, members = null) {
  const idx = members || Array.from({ length: D.length }, (_, i) => i);
  const n = idx.length;
  if (k >= n) return { medoids: idx.slice(0, k), labels: idx.map((_, i) => i), cost: 0, index: idx };
  const dist = (a, b) => D[idx[a]][idx[b]];

  // A k-means++ seeding on the distance matrix: the first medoid is drawn, each
  // next one with a chance proportional to how far it is from everything chosen.
  const medoids = [rng.int(0, n)];
  const near = Array.from({ length: n }, (_, i) => dist(i, medoids[0]));
  while (medoids.length < k) {
    const total = near.reduce((a, x) => a + x * x, 0);
    let pick = n - 1;
    if (total > 0) {
      let r = rng.float(0, total);
      for (let i = 0; i < n; i++) { r -= near[i] * near[i]; if (r <= 0) { pick = i; break; } }
    } else pick = rng.int(0, n);
    if (medoids.includes(pick)) {
      const free = [...Array(n).keys()].filter((i) => !medoids.includes(i));
      pick = free[rng.int(0, free.length)];
    }
    medoids.push(pick);
    for (let i = 0; i < n; i++) near[i] = Math.min(near[i], dist(i, pick));
  }

  const labels = new Array(n).fill(0);
  let cost = Infinity;
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist(i, medoids[c]); if (d < bd) { bd = d; best = c; } }
      labels[i] = best;
    }
    let moved = false;
    let total = 0;
    for (let c = 0; c < k; c++) {
      const own = [];
      for (let i = 0; i < n; i++) if (labels[i] === c) own.push(i);
      if (!own.length) continue;
      let best = own[0];
      let bd = Infinity;
      for (const a of own) { let s = 0; for (const b of own) s += dist(a, b); if (s < bd) { bd = s; best = a; } }
      if (best !== medoids[c]) { medoids[c] = best; moved = true; }
      total += bd;
    }
    cost = total;
    if (!moved) break;
  }
  return { medoids: medoids.map((m) => idx[m]), labels, cost, index: idx };
}

/** The best of several seedings, by total distance to the medoid. */
export function bestClustering(D, k, seed, restarts = 12, members = null) {
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const c = kmedoids(D, k, new Rng(`${seed}::k${k}::${r}`), members);
    if (!best || c.cost < best.cost) best = c;
  }
  return best;
}

/**
 * How much of the clustering survives being asked again of less of the data.
 *
 * Hennig's clusterwise bootstrap, which is the honest version of "the k where
 * membership stops changing under seed resampling": cluster a random four
 * fifths of the points, and for each cluster of the full answer take the best
 * Jaccard agreement with any cluster of the resampled one, over the points both
 * have. Averaged over clusters and over resamples, that number is the
 * stability, and — unlike a pair-counting index — it does not go up merely
 * because k did.
 */
export function stabilityOf(D, k, seed, { resamples = 25, share = 0.8 } = {}) {
  const full = bestClustering(D, k, `${seed}::full`);
  const n = D.length;
  const groups = Array.from({ length: k }, () => new Set());
  full.labels.forEach((c, i) => groups[c].add(i));
  const scores = [];
  for (let b = 0; b < resamples; b++) {
    const rng = new Rng(`${seed}::boot${k}::${b}`);
    const keep = [];
    for (let i = 0; i < n; i++) if (rng.float(0, 1) < share) keep.push(i);
    if (keep.length < k * 3) continue;
    const sub = bestClustering(D, k, `${seed}::boot${k}::${b}`, 6, keep);
    const subGroups = Array.from({ length: k }, () => new Set());
    sub.labels.forEach((c, i) => subGroups[c].add(keep[i]));
    const kept = new Set(keep);
    const per = [];
    for (const g of groups) {
      const mine = [...g].filter((i) => kept.has(i));
      if (!mine.length) continue;
      let best = 0;
      for (const h of subGroups) {
        const both = mine.filter((i) => h.has(i)).length;
        const all = new Set([...mine, ...h]).size;
        if (all) best = Math.max(best, both / all);
      }
      per.push(best);
    }
    if (per.length) scores.push(mean(per));
  }
  return {
    k, stability: scores.length ? r3(mean(scores)) : 0, spread: r3(sd(scores)),
    resamples: scores.length, cost: r3(full.cost), clustering: full,
  };
}

/**
 * Which k. The stability is computed over the whole allowed range and the
 * answer is **the most stable k**, with ties inside a hundredth going to the
 * larger one — a cookbook with more dishes in it says more, as long as the
 * extra dish is a real one, and the whole point of measuring the stability is
 * that it says when it is not.
 */
export function pickK(D, seed, lo, hi, opts) {
  const table = [];
  for (let k = lo; k <= hi; k++) table.push(stabilityOf(D, k, seed, opts));
  const top = Math.max(...table.map((t) => t.stability));
  const chosen = table.filter((t) => t.stability >= top - 0.01).sort((a, b) => b.k - a.k)[0];
  return { table, chosen };
}

// --- naming ------------------------------------------------------------------

const holdWord = (t) => (TIMBRES[t] ? (TIMBRES[t].hold >= 0.45 ? 'held' : TIMBRES[t].hold >= 0.15 ? 'decaying' : 'plucked') : 'held');
const brightWord = (t) => (TIMBRES[t] ? (TIMBRES[t].brightnessHz >= 3000 ? 'bright' : TIMBRES[t].brightnessHz < 1500 ? 'dark' : 'open') : 'open');

const an = (word) => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;

/**
 * What a cluster mostly does, which is a lower bar than what it agrees about.
 *
 * `wants` is written at nine members in ten, because a want is enforced; a
 * **name** is a description and is written at six in ten, because a name that
 * left out the harmonic layer of a groove that plays one four times in five
 * would be a name nobody could match to a sound. Measured over the sweep: the
 * figure role is in 78% of main-groove windows and the held bed in 83%, so a
 * nine-in-ten rule calls almost every archetype "a bed alone" and says nothing.
 */
function sharedOf(members, threshold = STAGE_SHARE) {
  const n = members.length;
  const shareOf = (pick) => {
    const seen = new Map();
    for (const f of members) for (const x of new Set(pick(f))) seen.set(x, (seen.get(x) || 0) + 1);
    return seen;
  };
  const roles = [...shareOf((f) => f.roles)].filter(([, k]) => k / n >= threshold).map(([x]) => x);
  const families = [...shareOf((f) => f.families)].filter(([, k]) => k / n >= threshold).map(([x]) => x);
  return {
    roles,
    families,
    timbres: Object.fromEntries(['lead', 'pad', 'stab'].map((s) => [s, modal(members.map((f) => f.timbres[s])).value])),
    hatDensity: modal(members.map((f) => f.hatDensity)).value,
    bassDensity: modal(members.map((f) => f.bassDensity)).value,
    density: modal(members.map((f) => f.density)).value,
    room: modal(members.map((f) => f.room)).value,
    front: modal(members.map((f) => f.stage.front)).value,
    treatments: [...shareOf((f) => f.stage.treatments)].filter(([, k]) => k / n >= threshold).map(([x]) => x),
  };
}

/**
 * A name in music words, out of what the cluster mostly does. It may name the
 * room, which is what a musician would call it and what the two library rows
 * already do in their own `name`; it may not name an instrument, so the figure
 * is "bright" or "decaying" by the properties the registry declares of the
 * timbre filling it and never by that timbre's name.
 */
export function nameOf(shared, kind) {
  const lead = shared.roles.includes('melody') ? 'a melody'
    : shared.roles.includes('figure') ? an(`${brightWord(shared.timbres.stab)} figure`)
      : null;
  const bed = shared.roles.includes('sustained')
    ? (shared.families.includes('ensemble') ? an(`${holdWord(shared.timbres.pad)} ensemble`) : an(`${holdWord(shared.timbres.pad)} bed`))
    : null;
  const over = lead && bed ? `${lead} over ${bed}`
    : bed ? `${bed} alone`
      : lead ? `${lead}, no bed`
        : 'drums alone';
  const drums = shared.roles.includes('kick')
    ? `${shared.hatDensity} hats${shared.roles.includes('backbeat') ? ' and a backbeat' : ''}`
    : 'no kick';
  const front = shared.front && shared.front !== 'sustained' ? `, ${shared.front} in front` : '';
  const head = kind === 'main' ? `${shared.room} room, ${shared.density}` : `${kind}, ${shared.room} room`;
  return `${head}: ${over}, ${drums}${front}`;
}

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 46);

// --- a cluster as a row ------------------------------------------------------

/**
 * What a cluster's members agree about, as `wants`. It is `room-recipes.ts`'s
 * rule applied to a cluster instead of to a room: a role or a family at least
 * nine members in ten play, the median rate of each inside the ±1.5x band the
 * verdicts of 09-18 set, the timbre properties of the slot at least six in ten
 * fill the same way, the stage at least six in ten hold, and a figure property
 * only where six in ten say the same word.
 *
 * Anything the members do not agree about is left out rather than averaged,
 * because a want a recipe states is a want the ranker enforces, and a want
 * invented out of a coin flip would be a recipe describing one roll.
 */
export function wantsOf(members) {
  const n = members.length;
  const share = (pick) => {
    const seen = new Map();
    for (const f of members) for (const x of new Set(pick(f))) seen.set(x, (seen.get(x) || 0) + 1);
    return seen;
  };
  const roles = [...share((f) => f.roles)].filter(([, k]) => k / n >= CAST_SHARE).map(([x]) => x).sort();
  const families = [...share((f) => f.families)].filter(([, k]) => k / n >= CAST_SHARE).map(([x]) => x)
    .filter((x) => FAMILIES.includes(x)).sort();

  const rates = {};
  for (const role of roles) {
    const xs = members.map((f) => f.rates[role]).filter(Boolean).map((r) => r.perBar);
    if (xs.length < n * CAST_SHARE) continue;
    const perBar = round3(median(xs));
    rates[role] = { perBar, min: round3(perBar / RATE_BAND), max: round3(perBar * RATE_BAND) };
  }

  const timbres = {};
  for (const slot of ['lead', 'pad', 'stab']) {
    const m = modal(members.map((f) => f.timbres[slot]));
    if (m.value && m.share >= STAGE_SHARE) timbres[slot] = timbreWants(m.value);
  }

  const backs = share((f) => f.stage.back);
  const treats = share((f) => f.stage.treatments);
  const front = modal(members.map((f) => f.stage.front));
  const lead = modal(members.map((f) => f.stage.lead));
  const stage = {
    front: front.share >= STAGE_SHARE ? front.value : null,
    lead: lead.share >= STAGE_SHARE ? lead.value : null,
    back: [...backs].filter(([, k]) => k / n >= STAGE_SHARE).map(([x]) => x).sort(),
    treatments: [...treats].filter(([, k]) => k / n >= STAGE_SHARE).map(([x]) => x).sort(),
    steadyFront: members.filter((f) => f.stage.steadyFront).length / n >= STAGE_SHARE,
    tolerance: STAGE_POLICY,
  };

  const word = (pick) => { const m = modal(members.map(pick)); return m.share >= STAGE_SHARE ? m.value : null; };
  const figures = {
    hatDensity: word((f) => f.hatDensity),
    bassDensity: word((f) => f.bassDensity),
    figureDensity: word((f) => f.figureDensity),
    bassSyncopation: round3(median(members.map((f) => f.bassSyncopation))),
    figureSyncopation: round3(median(members.map((f) => f.figureSyncopation))),
    noteLength: Object.fromEntries(roles.map((role) => [role, word((f) => f.noteLength[role])]).filter(([, v]) => v)),
    barsPerChord: round3(median(members.map((f) => f.barsPerChord || 0))) || null,
    loopBars: word((f) => f.loopBars),
    voicing: word((f) => f.voicing),
    density: word((f) => f.density),
  };
  for (const k of Object.keys(figures)) if (figures[k] == null) delete figures[k];

  return { roles, families, timbres, rates, stage, figures };
}

/** The box: the cluster's own centre and spread on each bird, where there is one. */
export function boxFrom(rows) {
  if (!rows.length) return { birds: {}, centre: null, spread: null };
  const birds = {};
  const centre = {};
  const spread = {};
  for (const b of BIRDS) {
    const xs = rows.map((r) => r.birds[b]);
    const m = mean(xs);
    const s = Math.max(sd(xs), 0.02);
    centre[b] = r3(m);
    spread[b] = r3(s);
    birds[b] = [r3(Math.max(0, m - s)), r3(Math.min(1, m + s))];
  }
  return { birds, centre, spread };
}

// --- the clustering, scope by scope -----------------------------------------

function archetypesOf(label, points, { withBirds, spread, lo, hi, seed }) {
  const { D, birdMean, factMean } = matrixOf(points, { withBirds, spread });
  const { table, chosen } = pickK(D, seed, lo, hi);
  const { labels, medoids } = chosen.clustering;
  const clusters = [];
  for (let c = 0; c < medoids.length; c++) {
    const own = [];
    labels.forEach((x, i) => { if (x === c) own.push(i); });
    if (!own.length) continue;
    clusters.push({ scope: label, members: own.map((i) => points[i]), medoid: points[medoids[c]] });
  }
  // Ordered by share, so the archetype a listener meets first is the one the
  // record is most often. The order is a presentation and the id carries it,
  // which is why a verdict is carried across by the medoid and not by the id.
  clusters.sort((a, b) => b.members.length - a.members.length || a.medoid.key.localeCompare(b.medoid.key));
  return { clusters, table, chosen, D, points, birdMean, factMean };
}

/**
 * Merge the nearest pair until the whole cookbook fits inside the number of
 * files a person will actually sit through. The pair is the one whose medoids
 * are nearest, the merged cluster keeps the medoid of the larger half, and the
 * sheet says every merge out loud — a cookbook that quietly dropped a dish
 * would be a measurement with a secret in it.
 */
function mergeToFit(groups, max) {
  const merges = [];
  const at = new Map();
  for (const g of groups) g.points.forEach((p, i) => at.set(p, i));
  while (groups.reduce((a, g) => a + g.clusters.length, 0) > max) {
    let best = null;
    for (const g of groups) {
      if (g.clusters.length < 2) continue;
      for (let i = 0; i < g.clusters.length; i++) {
        for (let j = i + 1; j < g.clusters.length; j++) {
          const d = g.D[at.get(g.clusters[i].medoid)][at.get(g.clusters[j].medoid)];
          if (!best || d < best.d) best = { g, i, j, d };
        }
      }
    }
    if (!best) break;
    const { g, i, j, d } = best;
    const a = g.clusters[i];
    const b = g.clusters[j];
    const big = a.members.length >= b.members.length ? a : b;
    merges.push({ scope: g.label, a: a.members.length, b: b.members.length, distance: r3(d), medoid: `${big.medoid.master}#${big.medoid.theme}` });
    a.members = [...a.members, ...b.members];
    a.medoid = big.medoid;
    g.clusters.splice(j, 1);
    g.clusters.sort((x, y) => y.members.length - x.members.length || x.medoid.key.localeCompare(y.medoid.key));
  }
  return merges;
}

// --- the renders -------------------------------------------------------------

/** Nothing else on this machine is rendering. Eugene works here. */
async function waitForAQuietMachine(minutes = 60) {
  const alive = (pattern) => {
    try { return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim().length > 0; } catch { return false; }
  };
  const busy = () => alive('chromium_headless_shell') || alive('firefox.*headless');
  const until = Date.now() + minutes * 60 * 1000;
  let said = false;
  while (busy() && Date.now() < until) {
    if (!said) { console.log('  another headless browser is rendering; waiting for it'); said = true; }
    await new Promise((r) => { setTimeout(r, 30000); });
  }
  if (busy()) console.log(`  still busy after ${minutes} minutes; going ahead, one render at a time`);
  else if (said) console.log('  the machine is quiet');
}

/** The window a theme is rendered and imprinted over, as a render job. */
function sweepJob(master, theme) {
  const track = planTheme(master, theme, {});
  const w = loudnessWindow(track, WINDOW_BARS);
  return {
    track, window: w,
    job: {
      masterSeed: master, theme,
      preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + w.bars,
      tail: TAIL_SECONDS,
    },
  };
}

/** The themes of the sweep that nothing on disk has a reading for. */
export function missingThemes() {
  const { rows } = readings();
  const out = [];
  for (const master of COOKBOOK_SEEDS) {
    for (let n = 0; n < COOKBOOK_THEMES; n++) {
      if (rows.has(`${master}#${n}`)) continue;
      out.push({ master, theme: n });
    }
  }
  return out;
}

async function renderSweep() {
  fs.mkdirSync(OUT, { recursive: true });
  const missing = missingThemes();
  if (!missing.length) { console.log('  every theme of the cookbook sweep already has a reading'); return; }

  // The cache first, and with no browser open: a run after the algorithm
  // changed asks for exactly the audio the last one did, and should cost
  // nothing at all.
  const todo = [];
  let cached = 0;
  for (const { master, theme } of missing) {
    const { track, window: w, job } = sweepJob(master, theme);
    const key = cacheKey(job, RATE);
    const hit = cacheGet(key);
    if (hit && hit.imprint) {
      fs.writeFileSync(path.join(OUT, `cookbook-${master}-${theme}.json`), JSON.stringify(hit.imprint, null, 1) + '\n');
      cached++;
      continue;
    }
    todo.push({ master, theme, track, window: w, job, key });
  }
  if (cached) console.log(`  ${cached} readings came back out of the render cache`);
  if (!todo.length) { console.log('  nothing left to render'); return; }

  console.log(`  ${todo.length} themes to render and imprint (${COOKBOOK_SEEDS.length * COOKBOOK_THEMES - missing.length} already read, build ${BUILD_ID}, composer ${COMPOSER_ID})`);
  await waitForAQuietMachine();
  const server = await serveSite(PORT);
  const browser = await openPage(PORT);
  console.log(`  ${browser.label}`);
  let i = 0;
  for (const t of todo) {
    const began = Date.now();
    const file = path.join(OUT, `cookbook-${t.master}-${t.theme}.wav`);
    const out = file.replace(/\.wav$/, '.json');
    const r = await renderToWav(browser.page, t.job, file, RATE);
    const imprint = imprintWav(file, out,
      `cookbook ${t.master}#${t.theme} (${t.track.preset}, ${t.track.density}, ${t.track.key.name}, ${t.track.bpm} BPM)`);
    cachePut(t.key, { job: t.job, rate: RATE, build: BUILD_ID, composer: COMPOSER_ID, tool: TOOL_VERSION, render: { seconds: r.seconds, events: r.events, peak: r.peak }, imprint });
    // Four gigabytes of wav for a table of numbers is a bad trade; what the
    // cache keeps is the reading, and the audio is remade from the same seed if
    // it is ever wanted.
    if (!has('keep-wav')) fs.rmSync(file, { force: true });
    console.log(`  ${String(++i).padStart(3)}/${todo.length}  ${`${t.master}#${t.theme}`.padEnd(9)} ${t.track.preset.padEnd(6)} bar ${String(t.window.from).padStart(3)}+${t.window.bars}  ${r.seconds} s  ${r.events} events  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  server.close();
}

/**
 * One reference wav per archetype, rendered from its medoid.
 *
 * A track archetype gets sixteen bars of the medoid's own main groove and a
 * section archetype gets its section, eight to sixteen bars of it. Two bars of
 * pre-roll are rendered and thrown away in both, so the reverb, the delay and
 * the limiter are running when the file opens.
 *
 * Cached like everything else: the medoid of an archetype that survives a
 * change to the distance is the same seed over the same bars, and it is not
 * rendered twice.
 */
async function renderEar(rows) {
  fs.mkdirSync(EAR, { recursive: true });
  fs.mkdirSync(EAR_IMPRINTS, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  // A previous run's files, when the naming or the clustering moved under them.
  // They are removed rather than left, because a folder with thirty wavs in it
  // and a sheet that names seventeen is a folder nobody can listen through.
  const want = new Set(rows.map((r) => path.basename(r.wav)));
  const stale = fs.readdirSync(EAR).filter((f) => f.endsWith('.wav') && !want.has(f));
  for (const f of stale) fs.rmSync(path.join(EAR, f));
  if (stale.length) console.log(`  ${stale.length} wavs of a previous run removed; the audio is still in the cache`);
  const todo = [];
  let cached = 0;
  for (const row of rows) {
    const m = row.medoid;
    const { from, bars } = earWindow(row.scope, m.track, m.window);
    const job = {
      masterSeed: m.master, theme: m.theme,
      preFromBar: Math.max(0, from - PREROLL_BARS), fromBar: from, toBar: from + bars,
      tail: TAIL_SECONDS,
    };
    row.wavBars = { from, bars };
    const key = cacheKey(job, RATE);
    const hit = cacheGet(key);
    if (hit && hit.imprint && fs.existsSync(cacheWav(key))) {
      fs.copyFileSync(cacheWav(key), row.wav);
      row.medoidReading = hit.imprint;
      cached++;
      continue;
    }
    todo.push({ row, job, key });
  }
  if (cached) console.log(`  ${cached} reference wavs came back out of the render cache`);
  if (!todo.length) return;
  await waitForAQuietMachine();
  const server = await serveSite(PORT);
  const browser = await openPage(PORT);
  console.log(`  ${browser.label}; ${todo.length} reference wavs to render`);
  let i = 0;
  for (const { row, job, key } of todo) {
    const began = Date.now();
    const m = row.medoid;
    const r = await renderToWav(browser.page, job, row.wav, RATE);
    const out = path.join(EAR_IMPRINTS, `${path.basename(row.wav, '.wav')}.json`);
    const imprint = imprintWav(row.wav, out, `cookbook ${row.id} medoid ${m.master}#${m.theme} bar ${row.wavBars.from}+${row.wavBars.bars}`);
    fs.copyFileSync(row.wav, cacheWav(key));
    cachePut(key, { job, rate: RATE, build: BUILD_ID, composer: COMPOSER_ID, tool: TOOL_VERSION, render: { seconds: r.seconds, events: r.events, peak: r.peak }, imprint });
    row.medoidReading = imprint;
    console.log(`  ${String(++i).padStart(2)}/${todo.length}  ${row.id.slice(0, 40).padEnd(40)} ${`${m.master}#${m.theme}`.padEnd(9)} bar ${String(row.wavBars.from).padStart(3)}+${row.wavBars.bars}  ${r.seconds} s  ${r.peak} dBFS  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  server.close();
}

// --- the labels Eugene has already given -------------------------------------

/**
 * The verdicts and the picks on the rows that are already there, by **medoid**.
 *
 * A verdict points at a piece of music — `recipe-demo.md`'s rule that a variant
 * keeps its number for life — so it is carried across by the seed, theme and
 * bar range of the render he heard, not by the row's id or its file name, both
 * of which are presentation and both of which move when k does. A row whose
 * medoid is no longer any archetype's keeps its label in `orphans`, and the
 * sheet says so, because a label that quietly disappeared would be data lost.
 */
export function existingLabels() {
  const byMedoid = new Map();
  if (!fs.existsSync(CANDIDATES)) return byMedoid;
  for (const f of fs.readdirSync(CANDIDATES).filter((x) => x.endsWith('.json'))) {
    let row;
    try { row = JSON.parse(fs.readFileSync(path.join(CANDIDATES, f), 'utf8')); } catch { continue; }
    const p = row && row.provenance;
    if (!p || !p.medoidSeed) continue;
    const verdicts = Array.isArray(row.verdicts) ? row.verdicts : [];
    const score = row.score && Number.isFinite(row.score.chef) ? row.score : null;
    // Only a row that actually carries an opinion (`human-fields.ts`'s own
    // question). An empty `verdicts` and a score of nought on a row whose
    // cluster has since moved is nothing lost, and reporting it as one would
    // bury the case that matters in noise.
    if (!hasOpinion(row)) continue;
    const key = `${p.medoidSeed}#${p.medoidTheme}@${p.medoidFromBar}+${p.medoidBars}`;
    byMedoid.set(key, { verdicts, picked: row.picked, score, id: row.id });
  }
  return byMedoid;
}

/**
 * The chef's own column, read back out of the contact sheet.
 *
 * He scores by editing the sheet — which is the document he is looking at while
 * he listens — so the sheet is a *source* and not only an output, and it wins
 * over the row on disk when the two disagree. Keyed by the medoid and its bar
 * range, exactly as the rows are, so a re-clustering carries his hand with the
 * music it was about.
 *
 * A cell he has not filled in is not a nought: it is left alone, so a run that
 * happens before he listens does not write an opinion he has not given.
 */
export function scoresFromSheet() {
  const out = new Map();
  if (!fs.existsSync(SHEET)) return out;
  for (const line of fs.readFileSync(SHEET, 'utf8').split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 11) continue;
    const [, , , , , medoid, bars, , chef, note, picked] = cells;
    if (!/^\d+#\d+$/.test(medoid) || !/^\d+\+\d+$/.test(bars)) continue;
    const row = {};
    if (chef !== '' && Number.isFinite(Number(chef))) row.chef = Math.max(-3, Math.min(3, Number(chef)));
    if (note !== '') row.note = note;
    if (/^(yes|true|picked|y)$/i.test(picked)) row.picked = true;
    else if (/^(no|false|n)$/i.test(picked)) row.picked = false;
    if (Object.keys(row).length) out.set(`${medoid}@${bars}`, row);
  }
  return out;
}

// --- where the library already sits ------------------------------------------

/**
 * Which archetype each row of the library — and each of Eugene's own two
 * listener rows — is nearest to. It is the check that says whether the
 * extraction found what was already known: if the two rooms do not fall out of
 * three hundred themes clustered by a measurement that knows nothing about
 * rooms, something here is wrong.
 */
function placeExisting(tracks, spread) {
  const dirs = [path.join(PKG, 'recipes'), path.join(ROOT, 'notes', 'recipes')];
  const out = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      let row;
      try { row = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
      if (!row || row.kind !== 'recipe') continue;
      const box = boxOf(row);
      const centre = {};
      for (const b of BIRDS) centre[b] = (box[b][0] + box[b][1]) / 2;
      const named = Object.keys(row.birds || {});
      const conf = Object.fromEntries(BIRDS.map((b) => [b, named.includes(b) ? 1 : 0]));
      const ranked = tracks
        .filter((t) => t.centre)
        .map((t) => ({
          id: t.id, name: t.name,
          distance: r3(birdDistance({ birds: centre, confidence: conf }, { birds: t.centre, confidence: Object.fromEntries(BIRDS.map((b) => [b, 1])) }, spread)),
        }))
        .sort((a, b) => a.distance - b.distance);
      out.push({
        row: row.id, scope: row.scope, name: row.name,
        file: path.relative(ROOT, path.join(dir, f)),
        nearest: ranked[0] || null, second: ranked[1] || null,
        // A row that names no bird is the house's own box on that axis, and a
        // distance taken over the birds it does *not* speak about would be a
        // distance to a number it never claimed. Only the named ones vote.
        over: named.length ? named.join(', ') : 'none: the row names no bird',
      });
    }
  }
  return out;
}

// --- the sheet ---------------------------------------------------------------

const boxLine = (birds) => (Object.keys(birds).length
  ? BIRDS.map((b) => `${b.slice(0, 2)} ${birds[b][0].toFixed(2)}-${birds[b][1].toFixed(2)}`).join(', ')
  : '— a section has no imprint, so this row names no bird and every bird stays the house\'s own box');

const wantsLine = (w) => {
  const bits = [];
  if (w.roles.length) bits.push(`roles ${w.roles.join(', ')}`);
  if (w.families.length) bits.push(`families ${w.families.join(', ')}`);
  const slots = Object.keys(w.timbres);
  if (slots.length) bits.push(slots.map((s) => `${s} ${w.timbres[s].holdClass}/${w.timbres[s].brightnessClass}`).join(', '));
  if (w.stage.front) bits.push(`front ${w.stage.front}`);
  if (w.stage.lead) bits.push(`lead ${w.stage.lead}`);
  if (w.stage.back.length) bits.push(`back ${w.stage.back.join(', ')}`);
  if (w.stage.treatments.length) bits.push(`desk ${w.stage.treatments.join(', ')}`);
  if (w.figures.hatDensity) bits.push(`${w.figures.hatDensity} hats`);
  if (w.figures.density) bits.push(String(w.figures.density));
  if (w.figures.loopBars) bits.push(`${w.figures.loopBars}-bar loop`);
  if (w.figures.voicing) bits.push(String(w.figures.voicing));
  return bits.join('; ');
};

function sheet(rows, meta) {
  const L = [];
  L.push('# The cookbook: the archetypes of the record, and which of them Eugene keeps');
  L.push('');
  L.push(`Written by \`packages/deep-house/tools/imprint/cookbook.ts\` (\`@${TOOL_VERSION}\`) on ${meta.date}.`);
  L.push('Outside git, like the rest of `notes/`. **Nothing here is in the library**: the');
  L.push('rows are candidates under `notes/recipes/candidates/`, and a row enters');
  L.push('`packages/deep-house/recipes/` when Eugene says so and not before.');
  L.push('');
  L.push('## This is labelling round 2');
  L.push('');
  L.push('It is two things at once and the second one is the more valuable.');
  L.push('');
  L.push('1. **A pick.** Which of these archetypes belong in the cookbook.');
  L.push('2. **A label.** Every verdict here is training data for the encoder, exactly as');
  L.push('   the eight verdicts of 09-18 were (`analysis/recipe-demo.md` part two). Today');
  L.push('   the encoder stands on **8 labels across 2 recipes, one room each**, and');
  L.push('   `plans/PLAN-IMPRINT.md`\'s settling criteria ask for ~50 labels across ~10');
  L.push('   recipes and both rooms before a weight in the ranker stops being a');
  L.push(`   hypothesis. These ${rows.length} verdicts roughly quadruple that.`);
  L.push('');
  L.push('So **the clustering will be re-run after the encoder is tuned on these');
  L.push('labels**, and that is by design rather than by accident: every row here carries');
  L.push('the provenance that makes it again — the medoid\'s seed, theme and bar range,');
  L.push('the sweep\'s seed range, the anchors the scale was read on, the build and the');
  L.push('hash of the tool — and `cookbook.ts --refresh` regenerates every field of');
  L.push('every row from it. The two fields no tool may derive, **`verdicts` and');
  L.push('`picked`**, are carried across by the medoid, so a verdict follows the piece of');
  L.push('music it was given about and not the row number it happened to have.');
  L.push('');
  L.push('## How to score one');
  L.push('');
  L.push('Listen to the wav beside each archetype and **write a number from -3 to +3 in');
  L.push('its `chef` column** — the bench\'s own scale, and yours: *"I\'d introduce some');
  L.push('sort of score to recipes, as I am the chef."* A note in the next column is a');
  L.push('verdict in your own words and is stored as one. `yes` in the last column is a');
  L.push('pick: the row goes into the cookbook.');
  L.push('');
  L.push('The score is not only a pick, it is **how often the randomiser reaches for the');
  L.push('row**. `src/recipe.ts`:');
  L.push('');
  L.push('```');
  L.push('weightOf(row) = row.weight x 2^(chef / 2) x (1 + log10(1 + likes))');
  L.push('```');
  L.push('');
  L.push('`row.weight` is the share this extraction measured of the record; the chef\'s');
  L.push('hand spans a factor of eight across -3..+3; and `likes` is what listeners in');
  L.push('the wild add later, on a log so that it takes **sixty-seven likes to be worth');
  L.push('one +3 from you** and a thousand is still only half as much again. So your hand');
  L.push('decides the library while it is young, and the room decides it at scale. At a');
  L.push('score of nought and no likes it is `row.weight` to the bit, so an unscored');
  L.push('library draws exactly as it always did.');
  L.push('');
  L.push('A *partial* is not a failure — *"a bit different from the original, but');
  L.push('pleasantly different"* is the zone a recipe is for, so a 0 or a +1 is a real');
  L.push('answer and not a shrug. What a recipe has to exclude is the miss.');
  L.push('');
  L.push('The wav is the archetype\'s **medoid**: the real theme nearest the middle of its');
  L.push('cluster, so what you hear is a member and not an average of one.');
  L.push('');
  L.push('## What was measured');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| themes | **${meta.themes}** — master seeds ${COOKBOOK_SEEDS[0]}-${COOKBOOK_SEEDS[COOKBOOK_SEEDS.length - 1]}, themes 0-${COOKBOOK_THEMES - 1}, planned at the house with no spell |`);
  L.push(`| read | ${meta.measured} of them have an imprint of their own main groove — ${meta.reused} reused (phase 1's sweep and the golden's calibration), ${meta.rendered} rendered here |`);
  L.push(`| anchors | \`${meta.anchors}\` — the scale the golden was calibrated on |`);
  L.push(`| build | \`${BUILD_ID}\` — the bundle every render was made through; the composer inside it is \`${COMPOSER_ID}\`, which is what a cached render is keyed on |`);
  L.push(`| window | up to ${WINDOW_BARS} bars of main groove per theme at track scope; the whole section at section scope |`);
  L.push(`| sections | ${meta.sections} |`);
  L.push(`| distance | track scope: half the eight birds in units of the record's own spread (weighted by each reading's confidence, Gleam at ${BIRD_WEIGHT.gleam} whatever its confidence says) and half the plan's own facts. Section scope: the plan alone, because a section has no imprint |`);
  L.push(`| k | by clusterwise bootstrap stability — ${meta.kNote} |`);
  L.push('');
  if (meta.merges.length) {
    L.push(`**${meta.merges.length} merges**, to fit under ${MAX_FILES} files: `
      + meta.merges.map((m) => `${m.scope} (${m.a} + ${m.b} members, medoids ${m.distance} apart)`).join('; ') + '.');
    L.push('');
  }
  if (meta.orphans.length) {
    L.push(`**${meta.orphans.length} labels could not be carried across**: ${meta.orphans.join(', ')}. `
      + 'Their medoids are no longer an archetype\'s, so the verdict is kept in the previous run\'s row and not in this one.');
    L.push('');
  }
  L.push('## The archetypes');
  L.push('');
  L.push('| # | name | scope | share | medoid | bars | wav | chef | note | picked |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    const note = (r.verdicts || []).map((v) => v.note).filter(Boolean).join(' / ');
    const chef = r.score && r.score.chef ? String(r.score.chef) : '';
    L.push(`| ${i + 1} | ${r.name} | ${r.scope === 'track' ? 'track' : `section / ${r.applies}`} | ${(r.weight * 100).toFixed(0)}% | ${r.medoid.master}#${r.medoid.theme} | ${r.wavBars ? `${r.wavBars.from}+${r.wavBars.bars}` : '—'} | \`${path.relative(ROOT, r.wav)}\` | ${chef} | ${note} | ${r.picked === undefined ? '' : (r.picked ? 'yes' : 'no')} |`);
  });
  L.push('');
  L.push('The `chef`, `note` and `picked` columns are **read back** by');
  L.push('`cookbook.ts --refresh`, which writes them onto the rows; the sheet wins over');
  L.push('the row when the two disagree, because the sheet is what you are looking at.');
  L.push('A cell left empty is left alone and never written as a nought.');
  L.push('');
  L.push('## Each one, in full');
  L.push('');
  for (const [i, r] of rows.entries()) {
    L.push(`### ${i + 1}. ${r.name}`);
    L.push('');
    L.push(`\`${r.id}\` · ${r.scope === 'track' ? 'track' : `section, applies to the ${r.applies}`} · share **${(r.weight * 100).toFixed(0)}%** (${r.members} of ${r.pool}) · medoid **${r.medoid.master}#${r.medoid.theme}** bar ${r.wavBars ? `${r.wavBars.from}+${r.wavBars.bars}` : '—'}`);
    L.push('');
    L.push(`- **box** — ${boxLine(r.birds)}`);
    L.push(`- **wants** — ${wantsLine(r.wants)}`);
    L.push(`- **wav** — \`${path.relative(ROOT, r.wav)}\``);
    L.push(`- **row** — \`${path.relative(ROOT, r.file)}\``);
    L.push(`- **draw weight** — ${r.weight.toFixed(3)} share x ${(2 ** ((r.score ? r.score.chef : 0) / 2)).toFixed(3)} (chef ${r.score ? r.score.chef : 0}) x ${(1 + Math.log10(1 + (r.score ? r.score.likes : 0))).toFixed(3)} (${r.score ? r.score.likes : 0} likes) = **${weightOf(r).toFixed(3)}**`);
    L.push('- **chef (-3..+3)** — ');
    L.push('- **note** — ');
    L.push('');
  }
  L.push('## Where the library already sits');
  L.push('');
  L.push('The rows that exist today, against the track archetypes this found, over the');
  L.push('birds each row actually names. The two room rows are the check: a clustering');
  L.push('that knows nothing about rooms should still land on top of them.');
  L.push('');
  L.push('| row | scope | nearest archetype | distance | next | over |');
  L.push('|---|---|---|---|---|---|');
  for (const p of meta.existing) {
    L.push(`| \`${p.row}\` | ${p.scope} | ${p.nearest ? p.nearest.name : '—'} | ${p.nearest ? p.nearest.distance : '—'} | ${p.second ? p.second.distance : '—'} | ${p.over} |`);
  }
  L.push('');
  L.push('## The stability, by k');
  L.push('');
  for (const g of meta.groups) {
    L.push(`**${g.label}** — ${g.points} points, chose k = ${g.chosen}.`);
    L.push('');
    L.push('| k | stability | spread | cost |');
    L.push('|---|---|---|---|');
    for (const t of g.table) L.push(`| ${t.k}${t.k === g.chosen ? ' **←**' : ''} | ${t.stability.toFixed(3)} | ${t.spread.toFixed(3)} | ${t.cost.toFixed(1)} |`);
    L.push('');
  }
  L.push('Stability is Hennig\'s clusterwise bootstrap: cluster four fifths of the points');
  L.push('twenty-five times over, and for every cluster of the full answer take the best');
  L.push('Jaccard agreement with any cluster of the resampled one. A number near 1 is a');
  L.push('cluster that is there whichever four fifths you look at; under about 0.6 it is a');
  L.push('cut through a continuum and not a dish. It is used rather than a pair-counting');
  L.push('index because a pair-counting index goes up with k on its own.');
  L.push('');
  L.push('## Re-deriving all of this');
  L.push('');
  L.push('```');
  L.push('node packages/deep-house/tools/imprint/cookbook.ts --render   # only what has no reading');
  L.push('node packages/deep-house/tools/imprint/cookbook.ts --refresh --ear');
  L.push('```');
  L.push('');
  L.push('Every render is cached under `tmp/imprint/cache/` by the seed, the theme, the');
  L.push('bars, the sample rate and the build, so a re-run after a change to the distance,');
  L.push('to k or to the tool costs no audio at all. `--refresh` prints, row by row,');
  L.push('whether the re-derived row is the one on disk.');
  L.push('');
  return L.join('\n');
}

// --- the review session ------------------------------------------------------

/**
 * The same archetypes as a **review session**, which is the manifest
 * `packages/deep-house/tools/review/` opens: a vertical list of wavs with three
 * decisions under each, and the decision written back onto this row's own
 * `score.chef` and `verdicts`.
 *
 * It is written beside the contact sheet rather than instead of it. The sheet
 * is the document — the boxes, the wants, the stability, the argument — and the
 * session is the listening, and a person doing the second wants a page and not
 * a table. Both point at the same rows, so a score arrives in the same field
 * whichever way he gives it.
 *
 * The actions are the three he asked for, and each carries the chef's score it
 * means: a pick is a +2, a keep is a nought — which is `weightOf`'s identity
 * and exactly what he said of the two room rows, *"they fit deep house, we can
 * keep them, but they are not my favourites"* — and a drop is a -2, which is a
 * third of the draw and not a deletion, because a row nobody picked is still
 * evidence and a row deleted is not.
 */
/**
 * The provenance key of an item of an older manifest, so a decision he has
 * already made survives every rename this tool can do to a file.
 *
 * It is read off the meta the manifest carries — the seed, the theme and the
 * bar range — and never off the id, because the id is the thing that moved.
 * An id that is already a provenance key comes back as itself.
 */
export function keyOfOldItem(item) {
  if (!item || !item.meta) return item && item.id;
  const scope = String(item.id || '').split('-')[0];
  const bars = String(item.meta.bars || '');
  const m = /^(\d+)\+(\d+)$/.exec(bars);
  if (!scope || !m || item.meta.seed == null || item.meta.theme == null) return item.id;
  return referenceName(scope, item.meta.seed, item.meta.theme, +m[1], +m[2], item.meta.rate || RATE);
}

/**
 * What has already been decided, carried onto the new items. A decision that
 * names music no archetype is any more is **said out loud and not dropped**,
 * the way an orphaned label is.
 */
export function migrateState(previous, items) {
  // The review tool's own rule since 09-19 (`session.ts`): by provenance, and
  // onto the same audio only — a decision about an earlier build's render of
  // the same bars is kept as superseded and is not this card's answer.
  return migrateSession(previous, items, { rate: RATE });
}

export async function writeReviewSession(rows) {
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(REVIEW, 'utf8')); } catch { /* the first write has none */ }
  const session = {
    schema: 1,
    id: 'cookbook',
    title: 'The cookbook: the archetypes of the record',
    kind: 'cookbook',
    actions: [
      { id: 'pick', label: 'keep — the chef\'s pick', key: 'k', score: 2, chef: 2, verdict: 'hit' },
      { id: 'keep', label: 'keep — decent', key: 'd', score: 0, chef: 0, verdict: 'partial' },
      { id: 'drop', label: 'drop', key: 'x', score: -2, chef: -2, verdict: 'miss' },
      { id: 'later', label: 'come back to it', key: 'l', score: 0, pending: true },
    ],
    items: rows.map((r) => ({
      // The id **is** the provenance key, and it is the wav's own name without
      // its extension: one string identifies the music, the file and the
      // decision, and none of the three can drift from the other two.
      id: path.basename(r.wav, '.wav'),
      title: r.name,
      subtitle: `${r.scope === 'track' ? 'a whole theme' : `a ${r.applies}`} · ${(r.weight * 100).toFixed(0)}% of the record · ${r.medoid.master}#${r.medoid.theme} bar ${r.wavBars.from}+${r.wavBars.bars}`,
      wav: path.relative(ROOT, r.wav),
      row: path.relative(ROOT, r.file),
      meta: {
        seed: r.medoid.master,
        theme: r.medoid.theme,
        bars: `${r.wavBars.from}+${r.wavBars.bars}`,
        rate: RATE,
        // The approval identity: the record's strategy, the build the wav was
        // rendered by, and the wav's own bytes where it has been rendered.
        strategy: 'house-v1',
        build: BUILD_ID,
        ...(fs.existsSync(r.wav) ? { audioHash: crypto.createHash('sha256').update(fs.readFileSync(r.wav)).digest('hex').slice(0, 16) } : {}),
        room: modal(r.medoid.facts ? [r.medoid.facts.room] : []).value,
        density: r.wants.figures.density || (r.medoid.facts ? r.medoid.facts.density : null),
        share: r.weight,
        box: boxLine(r.birds),
        wants: wantsLine(r.wants),
      },
    })),
    state: {},
    provenance: {
      tool: 'packages/deep-house/tools/imprint/cookbook.ts',
      toolVersion: TOOL_VERSION,
      sheet: path.relative(ROOT, SHEET),
      note: 'One item per archetype, in the contact sheet\'s own order. A decision here writes '
        + 'the chef\'s score and a verdict onto the candidate row it names; everything else on the row '
        + 'is derived and is regenerated by `cookbook.ts --refresh`.',
    },
  };
  const { state, lost, superseded, blind } = migrateState(previous, session.items);
  session.state = state;
  if (Object.keys(superseded).length) session.superseded = superseded;
  if (lost.length) console.log(`  ! ${lost.length} decisions name music no archetype is any more: ${lost.join(', ')}`);
  if (Object.keys(superseded).length) console.log(`  ! ${Object.keys(superseded).length} decisions were about other audio of the same bars and are kept as superseded: ${Object.keys(superseded).join(', ')}`);
  if (blind.length) console.log(`  ${blind.length} decisions carried by provenance alone (no audio identity on one side)`);
  fs.mkdirSync(path.dirname(REVIEW), { recursive: true });
  let gate = 'the review tool is not here yet, so the manifest was written unchecked';
  try {
    const { validateSession } = await import('../review/session.ts');
    const bad = validateSession(session);
    gate = bad.length ? `the review tool refuses it: ${bad.join('; ')}` : 'it passes the review tool\'s own gate';
    if (bad.length) console.log(`  ! ${gate}`);
  } catch { /* the builder is another agent's and may not exist yet */ }
  fs.writeFileSync(REVIEW, JSON.stringify(session, null, 2) + '\n');
  return gate;
}

// --- the run -----------------------------------------------------------------

/** A row as it is written, with the working fields the sheet uses taken off. */
const rowFile = (r) => {
  const out = { ...r };
  for (const k of ['file', 'medoid', 'members', 'pool', 'wav', 'centre', 'clusterSpread', 'wavBars', 'medoidReading']) delete out[k];
  return out;
};

async function run() {
  if (has('render')) { await renderSweep(); if (!has('fit') && !has('ear') && !has('refresh')) return; }

  const date = new Date().toISOString().slice(0, 10);
  const themes = cookbookThemes();
  const { rows: read, from: readFrom, anchors } = readings();
  const measured = themes.filter((t) => read.has(t.key));
  if (measured.length < 40) throw new Error(`only ${measured.length} of ${themes.length} themes have an imprint; run --render first`);

  // The record's own spread per bird, over everything measured, which is the
  // scale a bird distance is taken in. Floored at 0.02 exactly as phase 1
  // floors its kernel width, and for the same reason.
  const spread = {};
  for (const b of BIRDS) spread[b] = Math.max(sd(measured.map((t) => read.get(t.key).birds[b])), 0.02);

  const trackPoints = measured.map((t) => {
    const w = t.windows.find((x) => x.scope === 'track');
    return { key: t.key, master: t.master, theme: t.theme, track: t.track, window: w, facts: w.facts, reading: read.get(t.key) };
  });

  const groups = [];
  groups.push({
    label: 'track', kind: 'main', applies: null,
    ...archetypesOf('track', trackPoints, { withBirds: true, spread, lo: 6, hi: 12, seed: 'cookbook::track' }),
  });
  for (const kind of SECTION_KINDS) {
    const pts = [];
    for (const t of themes) {
      for (const w of t.windows) {
        if (w.scope !== 'section' || w.kind !== kind) continue;
        pts.push({ key: `${t.key}@${w.index}`, master: t.master, theme: t.theme, track: t.track, window: w, facts: w.facts, reading: read.get(t.key) || null });
      }
    }
    groups.push({
      label: kind, kind, applies: STYLE.sections.kinds[kind].label,
      ...archetypesOf(kind, pts, { withBirds: false, spread, lo: 3, hi: 6, seed: `cookbook::${kind}` }),
    });
  }

  const merges = mergeToFit(groups, MAX_FILES);

  // --- the rows ---
  const vocab = vocabularyOf(STYLE, { TIMBRES, BY_NAME, FAMILIES, ROLES });
  const labels = existingLabels();
  const fromSheet = scoresFromSheet();
  const used = new Set();
  const rows = [];
  for (const g of groups) {
    const pool = g.points.length;
    for (const [n, c] of g.clusters.entries()) {
      const facts = c.members.map((m) => m.facts);
      const wants = wantsOf(facts);
      const name = nameOf(sharedOf(facts), g.kind);
      const measuredMembers = g.label === 'track' ? c.members.map((m) => m.reading).filter(Boolean) : [];
      const { birds, centre, spread: clusterSpread } = boxFrom(measuredMembers);
      const slug = slugOf(name);
      const num = String(n + 1).padStart(2, '0');
      const id = `cookbook/${g.label}-${num}-${slug}`;
      const file = path.join(CANDIDATES, `${g.label}-${num}-${slug}.json`);
      const { from, bars } = earWindow(g.label === 'track' ? 'track' : 'section', c.medoid.track, c.medoid.window);
      const medoidKey = `${c.medoid.master}#${c.medoid.theme}@${from}+${bars}`;
      const label = labels.get(medoidKey);
      if (label || fromSheet.has(medoidKey)) used.add(medoidKey);
      // The sheet is where he scores, so the sheet wins over the row on disk.
      const said = fromSheet.get(medoidKey) || {};
      const score = {
        chef: said.chef ?? (label && label.score ? label.score.chef : 0),
        likes: (label && label.score ? label.score.likes : 0),
      };
      const picked = said.picked ?? (label ? label.picked : undefined);
      // A note he wrote beside the score is a verdict in his own words, stored
      // where every other verdict this project has is stored.
      const verdicts = label ? [...label.verdicts] : [];
      if (said.note && !verdicts.some((v) => v.note === said.note)) {
        verdicts.push({
          seed: c.medoid.master, theme: c.medoid.theme, bar: from,
          verdict: said.chef === undefined ? 'note' : said.chef > 0 ? 'hit' : said.chef < 0 ? 'miss' : 'partial',
          note: said.note, by: 'Eugene', at: date,
        });
      }
      rows.push({
        schema: 1,
        kind: 'recipe',
        id,
        interpreter: 'v1',
        scope: g.label === 'track' ? 'track' : 'section',
        applies: g.applies,
        name,
        origin: 'golden',
        birds,
        wants,
        forbids: [],
        weight: r3(c.members.length / pool),
        // The three things no tool derives, carried across by the medoid: the
        // chef's own hand, the listeners' likes, and his words.
        score,
        verdicts,
        ...(picked !== undefined ? { picked } : {}),
        provenance: {
          // Everything needed to make this row again. A re-run of a changed
          // encoder against this block must give the same row back, apart from
          // `date` and the two fields above.
          tool: 'packages/deep-house/tools/imprint/cookbook.ts',
          toolVersion: TOOL_VERSION,
          date,
          sweepSeeds: `master seeds ${COOKBOOK_SEEDS[0]}-${COOKBOOK_SEEDS[COOKBOOK_SEEDS.length - 1]}, themes 0-${COOKBOOK_THEMES - 1}, planned at the house with no spell`,
          anchors,
          build: BUILD_ID,
          composer: COMPOSER_ID,
          scopeOf: g.label,
          medoidSeed: c.medoid.master,
          medoidTheme: c.medoid.theme,
          medoidFromBar: from,
          medoidBars: bars,
          medoidWindow: `${c.medoid.window.from}+${c.medoid.window.bars}`,
          members: c.members.length,
          pool,
          from: `${c.members.length} of ${pool} ${g.label === 'track' ? 'themes' : `${g.label}s`} of the cookbook sweep`,
          centre: measuredMembers.length
            ? `the mean of the ${measuredMembers.length} measured members on each bird`
            : 'not measured: a section has no imprint, so this row names no bird and every bird stays the house\'s own box',
          box: measuredMembers.length ? 'plus and minus their spread on that bird, clamped into 0..1' : null,
          wants: `read off the plans of the same members: a role or family at least ${Math.round(CAST_SHARE * 100)}% of them play, the median rate of each with the +/-${RATE_BAND}x band the verdicts of 09-18 set, and the timbre slots, stage and figures at least ${Math.round(STAGE_SHARE * 100)}% of them agree on`,
          window: g.label === 'track' ? `up to ${WINDOW_BARS} bars of main groove per theme` : 'the whole section',
          rederive: 'node packages/deep-house/tools/imprint/cookbook.ts --refresh --ear',
          note: 'A candidate, not a row of the library. Extracted from v1 automatically; every '
            + 'field here is derived from this provenance and is regenerated when the encoder changes. '
            + 'Only `verdicts` and `picked` are Eugene\'s, and they are carried across by the medoid.',
        },
        ...(centre ? { reading: { centre, spread: clusterSpread } } : {}),
        // Working fields, taken off before the row is written. `wavBars` is set
        // here and not only by the render, so the sheet's own key — the medoid
        // and its bar range — is the same whether a wav has been made yet or
        // not, and a score he wrote against it survives either way.
        file, medoid: c.medoid, members: c.members.length, pool, centre, clusterSpread, wavBars: { from, bars },
        wav: path.join(EAR, `${referenceName(g.label, c.medoid.master, c.medoid.theme, from, bars)}.wav`),
      });
    }
  }

  const orphans = [
    ...[...labels.entries()].filter(([k]) => !used.has(k)).map(([k, v]) => `${v.id} (medoid ${k})`),
    ...[...fromSheet.keys()].filter((k) => !used.has(k) && !labels.has(k)).map((k) => `a score in the sheet for a medoid nothing is now (${k})`),
  ];

  if (has('ear')) await renderEar(rows);

  // --- write, and say what moved ---
  fs.mkdirSync(CANDIDATES, { recursive: true });
  const before = new Map();
  for (const f of fs.readdirSync(CANDIDATES).filter((x) => x.endsWith('.json'))) {
    before.set(f, fs.readFileSync(path.join(CANDIDATES, f), 'utf8'));
    fs.rmSync(path.join(CANDIDATES, f));
  }
  let bad = 0;
  let same = 0;
  let moved = 0;
  for (const r of rows) {
    const row = rowFile(r);
    if (r.medoidReading) {
      row.reading = {
        ...(row.reading || {}),
        medoid: {
          birds: Object.fromEntries(BIRDS.map((b) => [b, r3(r.medoidReading.summary.birds[b].median)])),
          confidence: r.medoidReading.summary.confidence,
          note: 'the imprint of this archetype\'s own reference wav — one member, not a box',
        },
      };
    }
    const problems = validate(row, vocab);
    if (problems.length) { bad++; console.log(`  ! ${r.id}: ${problems.join('; ')}`); }
    const text = JSON.stringify(row, null, 2) + '\n';
    const was = before.get(path.basename(r.file));
    let state = 'new';
    if (was !== undefined) {
      // A re-derivation is the same row or it is not, and `date` is the one
      // field allowed to move: strip it from both sides before comparing.
      const strip = (t) => t.replace(/^\s*"date": ".*",$/gm, '');
      if (strip(was) === strip(text)) { same++; state = 'identical'; } else { moved++; state = 'moved'; }
    }
    if (has('refresh')) console.log(`  ${state.padEnd(9)} ${r.id}`);
    fs.writeFileSync(r.file, text);
  }

  const tracks = rows.filter((r) => r.scope === 'track');
  const existing = placeExisting(tracks, spread);
  const renderedHere = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith('.json')).length : 0;

  fs.mkdirSync(path.dirname(SHEET), { recursive: true });
  fs.writeFileSync(SHEET, sheet(rows, {
    date,
    themes: themes.length,
    measured: measured.length,
    reused: [...readFrom.values()].filter((x) => x !== 'here').length,
    rendered: renderedHere,
    anchors,
    sections: SECTION_KINDS.map((k) => `${groups.find((g) => g.label === k).points.length} ${k}s`).join(', '),
    kNote: groups.map((g) => `${g.label} ${g.chosen.k} (stability ${g.chosen.stability.toFixed(2)})`).join(', '),
    merges,
    orphans,
    existing,
    groups: groups.map((g) => ({ label: g.label, chosen: g.chosen.k, points: g.points.length, table: g.table })),
  }));

  console.log('');
  for (const g of groups) {
    console.log(`  ${g.label.padEnd(10)} ${String(g.points.length).padStart(4)} points  k ${g.chosen.k}  stability ${g.chosen.stability.toFixed(3)} +/- ${g.chosen.spread.toFixed(3)}  ${g.clusters.length} clusters`);
  }
  console.log(`\n  ${rows.length} archetypes, ${bad} of them invalid`);
  if (before.size) console.log(`  re-derived against ${before.size} rows already there: ${same} identical apart from the date, ${moved} moved, ${rows.length - same - moved} new`);
  if (orphans.length) console.log(`  ${orphans.length} labels could not be carried across: ${orphans.join(', ')}`);
  const gate = await writeReviewSession(rows);
  console.log(`  -> ${path.relative(ROOT, CANDIDATES)}/`);
  console.log(`  -> ${path.relative(ROOT, SHEET)}`);
  console.log(`  -> ${path.relative(ROOT, REVIEW)} (${gate})`);
  console.log(`     npm run review -- ${path.relative(ROOT, REVIEW)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
