// Where a theme's loudness comes from, measured once so the record does not
// have to measure it again.
//
//   node tools/loudness-fit.ts --measure     render and meter the set
//   node tools/loudness-fit.ts --fit         fit the model to what was measured
//   node tools/loudness-fit.ts --after       re-measure with the trim in place
//   node tools/loudness-fit.ts --ab          the four-theme montage, before and after
//   node tools/loudness-fit.ts --limiter     what the master's limiter does at the trim
//   node tools/loudness-fit.ts               --measure then --fit
//
//   node tools/loudness-fit.ts --strategy house-v2 --site tmp/site --measure     (six pages; --pages 1 to be polite)
//   node tools/loudness-fit.ts --strategy house-v2 --site tmp/site --after
//   node tools/loudness-fit.ts --strategy house-v2 --fit --bless
//
// A refit is all three, in that order: the slope is read off an after pass of
// *this* measurement and no other, and a `--measure --fit` alone keeps the
// style's slopes and says so.
//   node tools/loudness-fit.ts --strategy house-v2 --site tmp/k6/site
//
// ## Per style, since round K6
//
// A loudness model is fitted on a **palette**, and a strategy is a palette. The
// coefficients were house-v1's and were read by every strategy until K6, where
// the measurement of `notes/archive/2026-09-kitchen/rounds/k6.md` §0 found the v1 model reading
// house-v2 two and a half to three and a half LU quieter than it is on every
// seed it was pointed at — because `harmonicDb` is a sum over what the
// instruments declare about themselves and the kitchen's declared levels are
// on a footing the v1 fit never saw. So `--strategy` measures, fits and blesses
// one strategy's own block, writes its rows to a file of its own, and touches
// no other strategy's number.
//
// And one thing that was true when this was written and had quietly stopped
// being true: **`--measure` renders with the trim at nought**, which is what
// the report says and what the original run had by construction, because there
// were no coefficients yet. There are now, so it is said in the job rather than
// left to the absence of a fit. `--after` is the pass that puts the trim back
// in, and the two together are where the master's slope comes from.
//
// ## Why this exists
//
// The make-up gain is one number for the whole record and the limiter does the
// levelling, so a main groove lands anywhere between about -13.6 and -10.7
// LUFS depending on which room the die rolled and how much is playing. Three
// units is not a mix: it is one theme quieter than the next, and a listener
// hears it as a fault in the record rather than as a property of the seed.
//
// The answer is a per-theme trim worked out *at plan time* — no rendering on
// the listener's machine, ever. What makes that possible is that a theme's
// loudness is almost entirely a function of things the plan already knows: the
// room's own level table, the density die, how many layers are sounding, and
// how thick the mined masks are. This tool measures that function over a few
// hundred themes and fits it; `loudnessTrimDb()` in src/loudness.ts evaluates the
// fit in microseconds and `planTheme` writes the answer onto the track.
//
// ## What is measured
//
// One window per theme: eight bars of a *main* groove, with two bars of
// pre-roll — for house-v1 the middle of the first long main section past bar
// 16, and for a style whose model says `window: 'loudest'` the main window the
// fit reads loudest (`trimWindow` in src/loudness.ts). The window is cut out of
// the theme's compiled program with `sliceProgram`, the scene gate's own cut:
// the sound stage has already run over the whole theme, the automation moves
// with the window rather than being cut, and the two pre-roll bars are
// rendered and thrown away so the reverb, the delay and the limiter's envelope
// are running when the window opens.
//
// A main groove and not a drop or a breakdown, because the trim has to be one
// number for the theme and the main is what a theme mostly is; the scene gate's
// drop and breakdown rules go on measuring those against their own mains.
//
// Rendered offline in headless Chromium — the engine the loudness gates use —
// against the built site on port 6997. Nothing here reaches an output device:
// an OfflineAudioContext has no destination hardware.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planTheme } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { trimWindow, loudnessFeatures, loudnessFamily, LOUDNESS_COLUMNS } from '../src/loudness.ts';
import { levelKeyOfRole } from '@deep-house/engine/voices';
import { playwright, launchOptions, bodyOf } from '@deep-house/engine/harness';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The repository, two folders up out of this package: `tmp/` is the lab and
// `docs/` is the published site, and both belong to the repository and not to
// one package of it.
const ROOT = path.join(HERE, '..', '..', '..');
const METER = path.dirname(fileURLToPath(import.meta.resolve('@deep-house/engine/meter')));
// Not 6975 (Eugene's dev server) and not 6977 (the two suites'): this tool
// serves its own build on its own port and stops it when it is done.
const PORT = 6997;
const OUT_DIR = path.join(ROOT, 'tmp', 'analysis');
const EAR_DIR = path.join(ROOT, 'tmp', 'ear');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

// Which palette is being fitted. The default writes the files it has always
// written, so the record's own measurement is never overwritten by somebody
// measuring a second strategy; every other strategy writes beside them under
// its own name.
const STRATEGY = arg('strategy', null);
// `--spell` measures under a spell (the benchmark's, say) into files of its
// own: the fit is the house's, and this is how far it reads off elsewhere.
// `--tag` names those files, so two spells measured for the fit (below) do
// not write over each other: `--spell <the drone's> --tag drone` writes
// `loudness-fit-house-v2-drone.json`.
const SPELL_TEXT = arg('spell', null);
const SPELL = SPELL_TEXT ? parseSpell(SPELL_TEXT) : null;
const TAG = (STRATEGY && STRATEGY !== 'house-v1' ? `-${STRATEGY}` : '') + (SPELL ? `-${arg('tag', 'spell')}` : '');
const TAG_OF = (tag) => (STRATEGY && STRATEGY !== 'house-v1' ? `-${STRATEGY}` : '') + `-${tag}`;
const OPTS = { ...(STRATEGY ? { strategy: STRATEGY } : {}), ...(SPELL ? { spell: SPELL } : {}) };
const DATA = path.join(OUT_DIR, `loudness-fit${TAG}.json`);
const AFTER = path.join(OUT_DIR, `loudness-fit${TAG}-after.json`);
const REPORT = path.join(OUT_DIR, `loudness-fit${TAG}.md`);
// Which measurement a file of rows is: every theme, its window and what it
// metered there. `--after` stamps the measurement it re-rendered with this, and
// `--fit` reads an after pass only when the stamp is the measurement it is
// fitting. Without it a `--measure --fit` regressed today's renders against
// whatever `-after.json` an earlier build had left in tmp/ — on 10-01 one from
// 09-19, other windows and another EQ, which read as a master that gives back
// 0.15 dB per dB with a 1.8 dB residual (round N1).
const measurementOf = (data) => createHash('sha1').update(data.rows.map((r) => `${r.masterSeed}#${r.theme}@${r.fromBar}:${r.lufs}`).join(' ')).digest('hex').slice(0, 12);
// The after pass, if there is one and it is of this measurement; otherwise
// null, and a line saying why it was left out.
function afterOf(before) {
  if (!fs.existsSync(AFTER)) return null;
  const af = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
  const want = measurementOf(before);
  if (af.of === want) return af;
  console.log(`${path.relative(ROOT, AFTER)} (${af.measuredAt}) is ${af.of ? `of measurement ${af.of}` : 'of no stated measurement'} and this one is ${want}: not read; run --after on this build for the slope`);
  return null;
}
// Where a blessed block is written. The record's own is in the style file with
// the prose that produced it; a second strategy's is a JSON file beside the
// style, for the reason `deep-house-signatures.json` is one — nothing in it was
// reasoned, this tool wrote every number and can write them again.
const BLOCK = (styleId) => path.join(ROOT, 'packages', 'deep-house', 'src', 'styles', `${styleId}-loudness.json`);
// The file is a command and a library at once: `--check`'s stored predictions
// and the comparison between two pools import `fit` from here, and importing it
// must not start a browser.
const CLI = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const WITHOUT = (arg('without', '') || '').split(',').filter(Boolean);
const SEED_FROM = +arg('from', 1);
const SEED_TO = +arg('to', 40);
const THEMES = +arg('themes', 3);
const WINDOW_BARS = +arg('bars', 8);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const RATE = 48000;
// Six pages rendering at once, every one reniced to the bottom of the queue the
// moment it is up. One page was the rule from 09-17, when five pages at a
// hundred per cent each cooked the machine under an agent's tests; by 10-03 a
// window took nine to fifteen seconds and a refit of six passes ran eighty
// minutes on one background core. Eugene, 10-04: *"I don't mind it at fifty
// or sixty per cent of the CPU to cut the time four times or more"* -- six of
// eighteen cores, under nice 18 so his own work keeps the priority, and the
// number lives here rather than in a memory so it is never forgotten.
// `--pages 1` is the polite run for a machine somebody is listening on.
const PAGES = +arg('pages', 6);
const NICE = +arg('nice', 18);
const SITE = arg('site', 'docs');
// `--after` and `--limiter` are the passes that render with the trim in the
// graph; every other pass renders the mix as it leaves the desk.
const LIMITER = has('limiter');
const TRIM_IN = has('after') || LIMITER;
// Every render that meters a window also reads what the limiter did there:
// the gate needs it, the measurement is what the headroom model is fitted on,
// and `--after` is where the two are checked against each other.
const PRE_LIMITER = LIMITER || has('measure') || has('after') || (!has('fit') && !has('ab') && !has('timbres'));

// --- what the limiter is allowed to do ---------------------------------------
//
// Read on every render that meters a window: the same bars rendered a second
// time with the master's make-up gain taken straight to the output, ahead of
// the limiter and the clipper, and each 10 ms block's peak read against the
// ceiling. A block over it is a block the limiter works in, and by how much is
// how deep — the engine round's measure of seed 20 (09-22), so the numbers
// read the same.
//
// **The record is the reference.** house-v1 at its own trim windows, seeds 1-60
// theme 0 and the fourteen golden themes (09-22): the limiter works in a
// median 6.8 % of blocks and 5.6 dB deep at the deepest, and in 11.9 % and 7.9
// dB at the ninetieth percentile. This record lives on its limiter; one that
// never touched it would be set too high. Seed 20 under house-v2, which Eugene
// heard pumping, was 22.2 % and 10.8 dB.
//
// Three sets of numbers come off that:
//
//   the headroom a trim may use: 15 % of the blocks and 8 dB. It was the
//   record's ninetieth percentile, rounded — a tenth of the blocks — until
//   10-03 (round LOUD-1), when the share went to 15 % so the house's mains
//   stand at the deep house sets' level (they measured -13.9 LUFS) rather
//   than a decibel under it: the tenth bound 86 of 120 measured windows on the
//   sustained sub, bass and pads between the kicks, and held the median window
//   at about -14.1 (round EQ-6 §2). It is over the record's ninetieth
//   percentile (11.9 %) and under the line below. The headroom model is
//   fitted to it, so a theme is only ever trimmed up to where the record's
//   busiest themes sit;
//
//   the line no theme may cross, which is what `--limiter` fails a theme for:
//   a fifth of the blocks or 10 dB, under what was heard as pumping and over
//   the headroom by the model's error;
//
//   the sweep as a whole: its median and ninetieth percentile of both, no
//   higher than the record's own.
const HEADROOM_ACTIVE = 15;
const HEADROOM_DEEPEST = 8;
const LIMITER_ACTIVE_MAX = 20;
const LIMITER_DEEPEST_MAX = 10;
const RECORD = { activeMedian: 6.8, activeP90: 11.9, deepestMedian: 5.6, deepestP90: 7.9 };

// How much trim a window rendered **at nought** can take before it passes the
// headroom: the block level `HEADROOM_ACTIVE` per cent of blocks reach must stay
// under the ceiling, and the loudest block within `HEADROOM_DEEPEST` of it.
// Null for a row the limiter was not read on.
export function headroomOf(limiter) {
  if (!limiter || !limiter.q) return null;
  const share = limiter.q[100 - HEADROOM_ACTIVE];
  const top = limiter.q[100];
  if (!Number.isFinite(share) || !Number.isFinite(top)) return null;
  return +Math.min(-share, HEADROOM_DEEPEST - top).toFixed(2);
}

// --- the window, and what the plan already knows about it -------------------
//
// Both come from src/loudness.ts, which is where the record itself reads them:
// the rule that picks the eight bars and the features the fit is allowed to
// draw on are one implementation, so what was measured and what is evaluated on
// a listener's machine cannot drift apart. What is here is only the sampling
// decision — which themes are fit for teaching a fit anything.

// A theme earns a row if its window really is eight bars and every one of them
// is a main groove. A theme too short for that is not a counter-example, it is
// a different measurement, and the record still gets a trim for it from the
// same rule with a shorter window.
//
// The window is the one the trim is fitted for (`trimWindow`): the first long
// main for house-v1, which is what it always was, and for a style whose model
// says `window: 'loudest'` the main window the fit reads loudest, so what is
// measured is the passage the trim has to be right for.
//
// A theme with no main is fitted at its loudest drop (round LOUD-1,
// `trimWindow`), so under a spell whose forms have none (the Dubstep place's)
// eight bars that are all one drop earn a row the same way.
export function sampleWindow(track) {
  const w = trimWindow(track, track.style);
  if (w.bars !== track.style.loudness.windowBars) return null;
  const noMain = !((track.arrangement && track.arrangement.sections) || []).some((s) => s.kind === 'main');
  const kind = track.timeline[w.from] && track.timeline[w.from].section;
  if (kind !== 'main groove' && !(noMain && kind === 'drop')) return null;
  for (let b = w.from; b < w.from + w.bars; b++) {
    if (!track.timeline[b] || track.timeline[b].section !== kind) return null;
  }
  return w.from;
}

// Which entry of the level table a role is actually played at: the harmonic
// layer is one role and three voices, and the piano has a level of its own.
export function levelOfRole(f, role) {
  return f[`lv${levelKeyOfRole(role, f.stabTimbre) === 'pad' ? 'Pad' : levelKeyOfRole(role, f.stabTimbre) === 'piano' ? 'Piano' : 'Keys'}`];
}

// The plan's own features, plus the labels a report wants to read. A measured
// row passes the bars it was rendered at, so a row measured under one window
// rule is read at those bars under any other.
export function featuresOf(track, window = undefined) {
  const f = loudnessFeatures(track, track.style, window);
  return {
    ...f,
    seed: track.seed,
    preset: track.preset,
    stabTimbre: track.dice.stabTimbre,
    padTimbre: track.dice.padTimbre,
    leadTimbre: track.dice.leadTimbre,
    progression: track.dice.progression,
    kind: 'main',
  };
}

// The whole measured set, planned in node: cheap, pure and the same plan the
// page will make, so the page only has to render.
function jobs() {
  const out = [];
  const skipped = [];
  // `--after` re-renders **the windows that were measured**, read off the
  // measurement, and not the windows today's model would choose: the master's
  // slope is what moved between the two renders of the same bars, and a
  // window the refit moved would be a different passage and not a slope.
  if (has('after') && fs.existsSync(DATA)) {
    for (const r of JSON.parse(fs.readFileSync(DATA, 'utf8')).rows) {
      const track = planTheme(String(r.masterSeed), r.theme, OPTS);
      out.push({ ...featuresOf(track, { from: r.fromBar, bars: WINDOW_BARS }), masterSeed: r.masterSeed, theme: r.theme, fromBar: r.fromBar, bars: WINDOW_BARS });
    }
    return { out, skipped };
  }
  for (let s = SEED_FROM; s <= SEED_TO; s++) {
    for (let n = 0; n < THEMES; n++) {
      const track = planTheme(String(s), n, OPTS);
      const from = sampleWindow(track);
      if (from == null) { skipped.push(`${s}#${n}`); continue; }
      out.push({ ...featuresOf(track, { from, bars: WINDOW_BARS }), masterSeed: s, theme: n, fromBar: from, bars: WINDOW_BARS });
    }
  }
  return { out, skipped };
}

// --- the page ---------------------------------------------------------------

// `.ts` is in it because the meter is TypeScript since 2026-09-19 and is
// stripped on the way past by `bodyOf`, the harness's own reader — the same
// seam this tool broke at once already, when the meter moved packages.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve(site) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
      // `/tools/` is the meter, which the page imports to do its own metering.
      // It is the **engine's** since round W of PLAN-V1-NEXT and this line still
      // reached for the repository's own top, so every render since has come
      // back `Failed to fetch dynamically imported module` — which the row loop
      // reported as a theme that did not render, a hundred and twenty times, and
      // nobody has run this tool since the split. `METER` is where it resolves to.
      const file = name.startsWith('/tools/') ? path.join(METER, name.slice('/tools/'.length)) : path.join(site, name === '/' ? '/index.html' : name);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(bodyOf(file));
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve({ close: () => server.close() }));
  });
}

// One window, rendered and metered, in the page. `want` is 'lufs' for the
// measurement and 'pcm' for the montage.
const RENDER = async (job) => {
  const meter = await import('/tools/meter.ts');
  const track = window.deepHouse.planTheme(String(job.masterSeed), job.theme, job.opts || {});
  const bs = track.barSeconds;
  const preBar = Math.max(0, job.fromBar - job.prerollBars);
  const tp = preBar * bs;
  const t0 = job.fromBar * bs;
  const t1 = (job.fromBar + job.bars) * bs;
  // The window is cut out of the theme's compiled program, the way the scene
  // gate cuts one (`sliceProgram`): the stage has already run over the whole
  // theme, every automation point moves with the window, and the two pre-roll
  // bars are rendered and thrown away so the reverb, the delay and the
  // limiter's envelope are running when the window opens. It used to hand the
  // renderer the events outside the window under a voice called
  // `silent:not-in-window`, which the registry now refuses by name.
  //
  // **The trim is the thing being measured and is therefore not in the render**
  // unless the caller asks for it: `--measure` is the record as the mix leaves
  // it and `--after` is the record with the answer applied.
  const cut = window.deepHouse.sliceProgram(window.deepHouse.programOf(track), { from: tp, to: t1, tail: job.tailSeconds, layers: job.only || null });
  const trimDb = job.trim ? (track.trimDb ?? 0) : 0;
  const slice = { ...cut, trimDb, themeGain: Math.pow(10, trimDb / 20) };
  const buf = await window.deepHouse.renderProgram(slice, { sampleRate: job.sampleRate });
  const from = Math.round((t0 - tp) * job.sampleRate);
  const to = Math.round((t1 - tp) * job.sampleRate);
  // What the limiter did: the same window rendered again with the master's
  // make-up gain taken straight to the output, ahead of the limiter and the
  // clipper, and every 10 ms block of it read against the ceiling.
  let limiter = null;
  if (job.limiter) {
    const ceiling = slice.settings.master.limiter.ceiling;
    const pre = await window.deepHouse.renderProgram(slice, { sampleRate: job.sampleRate, onGraph: (g) => {
      const c = g.nodes.chain;
      c.master.disconnect();
      c.master.connect(c.ctx.destination);
    } });
    const ch = [pre.getChannelData(0), pre.getChannelData(1)];
    const blk = Math.round(job.sampleRate / 100);
    let n = 0, over = 0, deepest = 0, peak = 0;
    const depths = [];
    const blocks = [];
    for (let i = from; i + blk <= to; i += blk) {
      let p = 0;
      for (const c of ch) for (let j = i; j < i + blk; j++) { const a = Math.abs(c[j]); if (a > p) p = a; }
      n++;
      blocks.push(20 * Math.log10(p / ceiling + 1e-30));
      if (p > peak) peak = p;
      if (p > ceiling) { over++; const d = 20 * Math.log10(p / ceiling); depths.push(d); if (d > deepest) deepest = d; }
    }
    depths.sort((a, b) => a - b);
    limiter = {
      active: +(100 * over / Math.max(1, n)).toFixed(2),
      median: +(depths.length ? depths[Math.floor(depths.length / 2)] : 0).toFixed(2),
      deepest: +deepest.toFixed(2),
      preLimiterPeak: +(20 * Math.log10(peak + 1e-30)).toFixed(2),
      // The block peaks against the ceiling at the share the gate allows: a
      // trim moves every one of them by itself, decibel for decibel, so how
      // far a theme could be trimmed before it failed is read off these two.
      p90: +(blocks.sort((a, b) => a - b)[Math.floor(blocks.length * 0.9)] ?? -120).toFixed(2),
      // ...and the upper tail of them, so a threshold can be moved after the
      // fact without rendering again: `q[k]` is the block peak (dB against the
      // ceiling, at the trim this render had) that 100 - k per cent of blocks
      // reach or pass, `q[100]` the loudest block.
      q: Object.fromEntries([80, 85, 90, 92, 94, 95, 96, 97, 98, 99, 100].map((k) => [k, +(blocks[Math.min(blocks.length - 1, Math.floor(blocks.length * k / 100))] ?? -120).toFixed(2)])),
    };
  }
  const L = buf.getChannelData(0).slice(from, to);
  const R = buf.getChannelData(1).slice(from, to);
  const out = {
    lufs: meter.integratedLoudness([L, R], job.sampleRate),
    truePeak: meter.truePeak([L, R]),
    peak: +(20 * Math.log10(meter.samplePeak([L, R]) + 1e-30)).toFixed(2),
    trimDb: typeof track.trimDb === 'number' ? track.trimDb : null,
    appliedTrimDb: slice.trimDb,
    style: track.style.id,
    seconds: +(L.length / job.sampleRate).toFixed(3),
    // Which of the stage's effect treatments the window's notes carry, by lane,
    // because the plan the fit reads is written before the stage puts them on.
    fx: [...new Set(cut.events.filter((e) => e.t >= t0 - tp && e.p && e.p.fx).map((e) => `${e.layer}:${e.p.fx.id}`))].sort(),
    ...(limiter ? { limiter } : {}),
  };
  if (job.want === 'pcm') {
    // 16-bit interleaved, base64: a montage is stitched in node and a float
    // buffer through a page boundary is four times the bytes for no more ear.
    const n = L.length;
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      pcm[i * 2] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
      pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    out.pcm = btoa(bin);
  }
  return out;
};

// Everything this tool starts goes to the back of the queue. The measurement
// is a background errand on somebody's working machine, and a render that takes
// twice as long and is never felt is the better trade.
function renice(browser) {
  if (!NICE) return;
  const pid = browser.process && browser.process() && browser.process().pid;
  if (!pid) return;
  try {
    const kids = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
    execFileSync('renice', ['-n', String(NICE), '-p', String(pid), ...kids], { stdio: 'ignore' });
  } catch (e) { /* not every machine has pgrep; the run is only slower without it */ }
}

async function run(list, { want = 'lufs', label = 'measuring' } = {}) {
  // Which build. `docs/` by default, because that is what this tool has always
  // read; `--site tmp/<round>/site` lets a round measure the working tree
  // without rebuilding the committed public site.
  const site = path.isAbsolute(SITE) ? SITE : path.join(ROOT, SITE);
  if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error(`${SITE} has not been built; run \`npm run build\` (or \`npx vite build --outDir ${SITE}\` in packages/deep-house) first`);
  const server = await serve(site);
  const { pw, label: pwLabel } = await playwright();
  console.log(`  ${pwLabel}`);
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu'] });
  renice(browser);
  // The page under measurement is the ring, and the ring draws. Software
  // rasterising eight cells and a turning star at sixty frames a second costs
  // more than the render does — six pages of it put six renderers at 110% of a
  // core each and turned a four-second render into forty. The loop reschedules
  // itself through requestAnimationFrame, so taking that away lets the current
  // frame finish and no other begin. Nothing in an offline render asks for a
  // frame, so what is metered is untouched.
  const still = async (page) => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.deepHouse, { timeout: 30000 });
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  };
  const pages = [];
  for (let i = 0; i < Math.max(1, Math.min(PAGES, list.length)); i++) {
    const page = await browser.newPage();
    await still(page);
    pages.push(page);
  }
  // Again, now the renderers exist: a page's process is a child of the
  // browser's and is not there to be reniced until the page is.
  renice(browser);
  const results = new Array(list.length);
  let next = 0, done = 0;
  const began = Date.now();
  // A page is reloaded every so often. Every render leaves an
  // OfflineAudioContext, its buffers and a piano cache behind it, and a page
  // asked for a hundred of them in a row slows to a crawl on its own garbage.
  const RELOAD_EVERY = +arg('reload', 25);
  await Promise.all(pages.map(async (page) => {
    let since = 0;
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      if (since >= RELOAD_EVERY) { await still(page); renice(browser); since = 0; }
      const job = { ...list[i], opts: OPTS, trim: TRIM_IN, limiter: PRE_LIMITER, prerollBars: Math.min(PREROLL_BARS, list[i].fromBar), tailSeconds: TAIL_SECONDS, sampleRate: RATE, want, only: list[i].only || null };
      const t0 = Date.now();
      try {
        results[i] = await page.evaluate(RENDER, job);
      } catch (e) {
        results[i] = { error: e.message.split('\n')[0] };
      }
      since++;
      done++;
      const per = (Date.now() - began) / done;
      process.stdout.write(`\r  ${label} ${done}/${list.length}  ${list[i].masterSeed}#${list[i].theme} ${Math.round(Date.now() - t0)} ms  ${(per / 1000).toFixed(2)} s each, ${Math.round((list.length - done) * per / 1000)} s left        `);
    }
  }));
  process.stdout.write('\n');
  await browser.close();
  server.close();
  return results;
}

// --- the fit ----------------------------------------------------------------
//
// Ordinary least squares with a whisper of ridge, and the features chosen by
// forward selection on the cross-validated residual rather than on R², so a
// column that only fits the noise cannot earn its place. The model is small on
// purpose: it runs on a listener's machine every time a theme is planned, and a
// coefficient nobody can explain is a coefficient that will be wrong on a seed
// nobody measured.

// The candidate pool: every column src/loudness.ts knows how to read. A column
// whose every value is 0 or 1 is left where it is; anything else is centred on
// the measured mean, so the intercept is the loudness of an average theme and a
// coefficient is a decibel per unit of departure from it.
//
// **The theme's sum clip's columns are the depth line's alone** (round drum-clip): `clipRoom` and `clipHeld` read the
// trim the clip's top is set for, and that trim is planned off the main loudness model and the share line
// (`loudness.ts` `clipPlan`, which reads `need` while `clipRoomDb` is still nought). A fit of either, of the base
// headroom model or of a family that took a clip column would be fitted on its own output. They are left out of every
// pool unless the fit opts in with `clip: true`, which only the depth line's (`tools/headroom-front.ts`) does.
export const CLIP_COLUMNS: readonly string[] = Object.freeze(['clipRoom', 'clipHeld']);
function pool(rows, { instruments = false, clip = false } = {}) {
  const c = {};
  // Not part of the record and never written into params.ts: the one-hot pool
  // the property pool is measured against, so "does an instrument need its own
  // coefficient?" is a number and not an opinion.
  const extra = instruments ? {
    stabPiano: (r) => (r.stabTimbre === 'piano' ? 1 : 0),
    stabOrgan: (r) => (r.stabTimbre === 'organ' ? 1 : 0),
    stabGlass: (r) => (r.stabTimbre === 'glass' ? 1 : 0),
    stabPluck: (r) => (r.stabTimbre === 'pluck' ? 1 : 0),
    stabEp: (r) => (r.stabTimbre === 'ep' ? 1 : 0),
    stabRhodes: (r) => (r.stabTimbre === 'rhodes' ? 1 : 0),
    padStrings: (r) => (r.padTimbre === 'strings' ? 1 : 0),
    padRhodes: (r) => (r.padTimbre === 'rhodes' ? 1 : 0),
    padOrgan: (r) => (r.padTimbre === 'organ' ? 1 : 0),
    padSwell: (r) => (r.padTimbre === 'swell' ? 1 : 0),
    roomGrowl: (r) => (r.preset === 'growl' ? 1 : 0),
    roomSub: (r) => (r.preset === 'sub' ? 1 : 0),
  } : {};
  // `--exclude a,b` keeps columns out of both pools: a column the sample
  // never moves far enough to teach (a kick's share, when every measured
  // window has one) can still be chosen and then read wildly off a theme it
  // never saw (round EQ-5: the held drone, which has no kick).
  const EXCLUDE = new Set((arg('exclude', '') || '').split(',').filter(Boolean));
  for (const name of [...Object.keys(LOUDNESS_COLUMNS), ...Object.keys(extra)]) {
    if (EXCLUDE.has(name) || (!clip && CLIP_COLUMNS.includes(name))) continue;
    const f = LOUDNESS_COLUMNS[name] || extra[name];
    const xs = rows.map(f);
    const binary = xs.every((x) => x === 0 || x === 1);
    const spread = Math.max(...xs) - Math.min(...xs);
    // A column that never moves over the measured set can teach nothing and
    // would make the normal equations singular.
    if (spread < 1e-9) continue;
    const centre = binary ? 0 : +(xs.reduce((a, v) => a + v, 0) / xs.length).toFixed(6);
    c[name] = { f, centre };
  }
  return c;
}

function solve(A, b, ridge = 1e-6) {
  const n = A[0].length;
  const M = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < A.length; k++) s += A[k][i] * A[k][j];
      M[i][j] = s + (i === j ? ridge : 0);
    }
    let s = 0;
    for (let k = 0; k < A.length; k++) s += A[k][i] * b[k];
    M[i][n] = s;
  }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      if (!f) continue;
      for (let cI = i; cI <= n; cI++) M[r][cI] -= f * M[i][cI];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}

const design = (rows, names, cand) => rows.map((r) => [1, ...names.map((n) => cand[n].f(r) - cand[n].centre)]);

function rmse(rows, y, names, cand, w) {
  const X = design(rows, names, cand);
  let s = 0;
  for (let i = 0; i < rows.length; i++) {
    let p = 0;
    for (let j = 0; j < w.length; j++) p += X[i][j] * w[j];
    s += (p - y[i]) ** 2;
  }
  return Math.sqrt(s / rows.length);
}

// Five folds, deterministic: every fifth row, so a fold is a sample of the
// whole set of seeds and not a block of neighbouring ones.
function crossVal(rows, y, names, cand, folds = 5) {
  let ss = 0, n = 0, worst = 0;
  for (let f = 0; f < folds; f++) {
    const trR = [], trY = [], teR = [], teY = [];
    rows.forEach((r, i) => { if (i % folds === f) { teR.push(r); teY.push(y[i]); } else { trR.push(r); trY.push(y[i]); } });
    const w = solve(design(trR, names, cand), trY);
    if (!w) return { rmse: Infinity, worst: Infinity };
    const X = design(teR, names, cand);
    for (let i = 0; i < teR.length; i++) {
      let p = 0;
      for (let j = 0; j < w.length; j++) p += X[i][j] * w[j];
      const e = Math.abs(p - teY[i]);
      ss += e * e; n++;
      if (e > worst) worst = e;
    }
  }
  return { rmse: Math.sqrt(ss / n), worst };
}

// Forward selection on the rows given: the column that lowers the cross-validated residual most, taken while it
// lowers it by more than `gain` (the best of the round, not the first to clear the bar: a later column that beats
// the first by less than `gain` is still the better one).
function select(rows, y, { max, gain, instruments, clip }) {
  const cand = pool(rows, { instruments, clip });
  // `--without a,b` keeps columns out of the selection (round DNB-4: the bass's
  // note rate, which read a switch-up's doubled line at the fast broken place
  // as two decibels louder than it measured, through a compressed bass).
  for (const n of WITHOUT) delete cand[n];
  const names = [];
  let best = crossVal(rows, y, names, cand);
  for (;;) {
    if (names.length >= max) break;
    let pick = null, pickCv = null;
    for (const n of Object.keys(cand)) {
      if (names.includes(n)) continue;
      const cv = crossVal(rows, y, [...names, n], cand);
      if (!pickCv || cv.rmse < pickCv.rmse) { pick = n; pickCv = cv; }
    }
    if (!pick || !(pickCv.rmse < best.rmse - gain)) break;
    names.push(pick);
    best = pickCv;
  }
  return { cand, names, best };
}

// The selection scores its candidates by the same five folds it would report, so that figure is the winner's of
// many and reads low (round saw-bed: 1.27 and 1.69 dB written, 1.50 and 1.86 on seeds the selection never saw).
// `outer` makes the held-out figure honest: it names each row's outer fold (or null for a row only ever trained on),
// and for each fold the whole selection and fit run again on the other rows and are scored on that fold's alone.
// `cv` is then that figure; `cvSelection` the one the selection steered by. Without `outer`, `cv` is as it was.
export function fit(rows, { max = 16, gain = 0.005, instruments = false, y: yKey = 'lufs', outer = null, clip = false } = {}) {
  const y = rows.map((r) => r[yKey]);
  const { cand, names, best } = select(rows, y, { max, gain, instruments, clip });
  const w = solve(design(rows, names, cand), y);
  const mean = y.reduce((a, v) => a + v, 0) / y.length;
  const sst = y.reduce((a, v) => a + (v - mean) ** 2, 0);
  const res = rmse(rows, y, names, cand, w);
  const r2 = 1 - (res * res * rows.length) / sst;
  let held = null;
  if (outer) {
    const keys = [...new Set(rows.map(outer).filter((k) => k != null))];
    let ss = 0, n = 0, worst = 0;
    for (const k of keys) {
      const tr = rows.filter((r) => outer(r) !== k), te = rows.filter((r) => outer(r) === k);
      const trY = tr.map((r) => r[yKey]);
      const m = select(tr, trY, { max, gain, instruments, clip });
      const wk = solve(design(tr, m.names, m.cand), trY);
      if (!wk) throw new Error(`fit: the outer fold ${k} is singular`);
      const X = design(te, m.names, m.cand);
      te.forEach((r, i) => {
        let p = 0;
        for (let j = 0; j < wk.length; j++) p += X[i][j] * wk[j];
        const e = Math.abs(p - r[yKey]);
        ss += e * e; n++;
        if (e > worst) worst = e;
      });
    }
    held = { rmse: Math.sqrt(ss / n), worst, n, folds: keys.length };
  }
  return {
    names,
    intercept: +w[0].toFixed(5),
    coef: Object.fromEntries(names.map((n, i) => [n, +w[i + 1].toFixed(5)])),
    centre: Object.fromEntries(names.map((n) => [n, cand[n].centre])),
    r2: +r2.toFixed(4),
    rmse: +res.toFixed(4),
    cv: +(held ?? best).rmse.toFixed(4),
    cvWorst: +(held ?? best).worst.toFixed(4),
    ...(held ? { cvSelection: +best.rmse.toFixed(4), heldOutRows: held.n, heldOutFolds: held.folds } : {}),
    n: rows.length,
  };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, v) => a + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, v) => a + (v - mean) ** 2, 0) / xs.length);
  return { min: s[0], max: s[s.length - 1], mean, sd, p05: s[Math.floor(s.length * 0.05)], p95: s[Math.floor(s.length * 0.95)] };
};
const f2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);

// --- the montage ------------------------------------------------------------

function wav(chunks, rate = RATE) {
  const data = Buffer.concat(chunks);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const silence = (seconds) => Buffer.alloc(Math.round(seconds * RATE) * 4);

// --- what the run does ------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- what an instrument is worth, measured once ------------------------------
//
// The fit may not name an instrument: the catalogue is meant to grow, and a
// coefficient per timbre is a coefficient somebody has to fit again every time
// a voice is written. So each timbre declares a number instead — how loud it is,
// alone, at the level its room's table gives it — and the fit reads a sum over
// whatever is sounding.
//
// This is where that number comes from: the same eight-bar window, rendered
// with only the harmonic layer sounding, across up to `--per` themes that
// happen to have rolled that timbre, and the median taken. What is written down
// is the reading *minus* the level the table set, so it belongs to the
// instrument and not to the room it was measured in: a preset that moves its
// `keys` level by three decibels moves the prediction by three decibels without
// this number changing at all.
if (CLI && has('timbres')) {
  const which = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const PER = +arg('per', 5);
  const groups = new Map();
  for (const r of which.rows) {
    const track = planTheme(String(r.masterSeed), r.theme, OPTS);
    const f = featuresOf(track, { from: r.fromBar, bars: WINDOW_BARS });
    for (const [role, timbre, share] of [['keys', f.stabTimbre, f.share_keys], ['pad', f.padTimbre, f.share_pad]]) {
      if (!timbre || !share) continue;
      const key = `${timbre}:${role}`;
      if (!groups.has(key)) groups.set(key, []);
      const g = groups.get(key);
      if (g.length < PER) g.push({ masterSeed: r.masterSeed, theme: r.theme, fromBar: r.fromBar, bars: WINDOW_BARS, only: [role], role, timbre, level: levelOfRole(f, role) });
    }
  }
  const list = [...groups.values()].flat();
  console.log(`${groups.size} timbre and role pairs, ${list.length} solo windows`);
  const read = await run(list, { label: 'soloing' });
  const by = new Map();
  list.forEach((j, i) => {
    if (read[i].error || !Number.isFinite(read[i].lufs)) return;
    const key = `${j.timbre}:${j.role}`;
    if (!by.has(key)) by.set(key, { timbre: j.timbre, role: j.role, rows: [] });
    by.get(key).rows.push({ seed: `${j.masterSeed}#${j.theme}`, lufs: read[i].lufs, level: j.level, own: +(read[i].lufs - j.level).toFixed(2) });
  });
  const table = [...by.values()].map((g) => {
    const owns = g.rows.map((r) => r.own).sort((a, b) => a - b);
    return { timbre: g.timbre, role: g.role, n: owns.length, loudnessDb: +owns[Math.floor(owns.length / 2)].toFixed(2), lo: owns[0], hi: owns[owns.length - 1] };
  }).sort((a, b) => (a.timbre < b.timbre ? -1 : 1));
  fs.writeFileSync(path.join(OUT_DIR, 'loudness-timbres.json'), JSON.stringify({ note: 'Each timbre alone in an eight-bar main groove, metered, minus the level its room gave it. The median over the themes that rolled it.', measuredAt: new Date().toISOString().slice(0, 10), perTimbre: PER, table, detail: [...by.values()] }, null, 1) + '\n');
  console.table(table);
  console.log(`wrote ${path.relative(ROOT, path.join(OUT_DIR, 'loudness-timbres.json'))}`);
  process.exit(0);
}

if (CLI && has('ab')) {
  const which = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const pick = (arg('picks', '') || '').split(',').filter(Boolean);
  let chosen;
  if (pick.length) {
    chosen = pick.map((p) => {
      const [s, t] = p.split('#');
      const row = which.rows.find((r) => String(r.masterSeed) === s && String(r.theme) === t);
      if (!row) throw new Error(`no measured row for ${p}`);
      return row;
    });
  } else {
    const sorted = [...which.rows].sort((a, b) => a.lufs - b.lufs);
    chosen = [sorted[0], sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((sorted.length * 2) / 3)], sorted[sorted.length - 1]];
  }
  console.log(`the montage: ${chosen.map((r) => `${r.masterSeed}#${r.theme} at ${r.lufs}`).join(', ')}`);
  const out = await run(chosen, { want: 'pcm', label: 'rendering' });
  const side = has('after') ? 'after' : 'before';
  const chunks = [];
  out.forEach((r, i) => {
    if (r.error) throw new Error(`${chosen[i].masterSeed}#${chosen[i].theme}: ${r.error}`);
    chunks.push(Buffer.from(r.pcm, 'base64'));
    if (i < out.length - 1) chunks.push(silence(0.35));
  });
  fs.mkdirSync(EAR_DIR, { recursive: true });
  const file = path.join(EAR_DIR, `ab-trim-${side}.wav`);
  fs.writeFileSync(file, wav(chunks));
  const table = out.map((r, i) => ({ seed: chosen[i].masterSeed, theme: chosen[i].theme, room: chosen[i].preset, density: chosen[i].density, lufs: r.lufs, trimDb: r.trimDb }));
  fs.writeFileSync(path.join(OUT_DIR, `ab-trim-${side}.json`), JSON.stringify(table, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, file)}`);
  console.table(table);
  process.exit(0);
}

// --- the limiter gate --------------------------------------------------------
//
//   node tools/loudness-fit.ts --strategy house-v2 --limiter --from 1 --to 60 --themes 1 --golden
//
// Every theme asked for, at the window its trim is fitted for, rendered with the
// trim in and read for what the master's limiter had to do there (the RENDER
// above). `--golden` adds the fourteen golden themes. A theme over either
// threshold fails the gate and is named; the rows are written to
// tmp/analysis/loudness-limiter<-strategy>.json. Its whole reason for being is
// seed 20 of 09-22: a trim fitted where the pad was gated off, handed to a theme
// whose first main has the pad and the stabs together.
const GOLDEN_THEMES = [[1, 6], [92970, 4], [21323, 4]];
if (CLI && LIMITER) {
  const list = [];
  const seen = new Set();
  const add = (s, n, golden) => {
    const key = `${s}#${n}`;
    if (seen.has(key)) return;
    seen.add(key);
    const track = planTheme(String(s), n, OPTS);
    const w = trimWindow(track, track.style);
    list.push({ masterSeed: s, theme: n, fromBar: w.from, bars: w.bars, golden, trimDb: track.trimDb });
  };
  if (has('golden')) for (const [s, k] of GOLDEN_THEMES) for (let n = 0; n < k; n++) add(s, n, true);
  if (!has('golden') || arg('from', null) != null) for (let s = SEED_FROM; s <= SEED_TO; s++) for (let n = 0; n < THEMES; n++) add(s, n, false);
  console.log(`${list.length} themes, the window each one's trim is fitted for, the trim in; the limiter may work in ${LIMITER_ACTIVE_MAX} % of 10 ms blocks at most, ${LIMITER_DEEPEST_MAX} dB deep at most`);
  const read = await run(list, { label: 'limiter' });
  const rows = list.map((j, i) => ({ theme: `${j.masterSeed}#${j.theme}`, golden: j.golden, fromBar: j.fromBar, trimDb: j.trimDb, ...(read[i].error ? { error: read[i].error } : { lufs: read[i].lufs, truePeak: read[i].truePeak, fx: read[i].fx, ...read[i].limiter }) }));
  const bad = rows.filter((r) => r.error || r.active > LIMITER_ACTIVE_MAX || r.deepest > LIMITER_DEEPEST_MAX);
  const file = path.join(OUT_DIR, `loudness-limiter${TAG}.json`);
  fs.writeFileSync(file, JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), activeMax: LIMITER_ACTIVE_MAX, deepestMax: LIMITER_DEEPEST_MAX, rows }, null, 1) + '\n');
  const ok = rows.filter((r) => !r.error);
  const st = (k) => { const x = ok.map((r) => r[k]).sort((a, b) => a - b); return `${x[0]} / ${x[Math.floor(x.length / 2)]} / ${x[x.length - 1]}`; };
  console.log(`  active % (min / median / max) ${st('active')}; deepest dB ${st('deepest')}; LUFS ${st('lufs')}; trim ${st('trimDb')}`);
  console.table([...ok].sort((a, b) => b.deepest - a.deepest).slice(0, 12).map((r) => ({ theme: r.theme, bar: r.fromBar, trim: r.trimDb, lufs: r.lufs, active: r.active, median: r.median, deepest: r.deepest })));
  console.log(`wrote ${path.relative(ROOT, file)}`);
  // The sweep as a whole against the record's own reading: the ordinary seeds
  // only, since the golden themes are fourteen chosen ones.
  const sweep = ok.filter((r) => !r.golden);
  const pct = (k, p) => { const x = sweep.map((r) => r[k]).sort((a, b) => a - b); return x[Math.min(x.length - 1, Math.floor(x.length * p))]; };
  const got = { activeMedian: pct('active', 0.5), activeP90: pct('active', 0.9), deepestMedian: pct('deepest', 0.5), deepestP90: pct('deepest', 0.9) };
  console.log(`  the sweep of ${sweep.length}: active median ${got.activeMedian} % (record ${RECORD.activeMedian}), p90 ${got.activeP90} % (record ${RECORD.activeP90}); deepest median ${got.deepestMedian} dB (record ${RECORD.deepestMedian}), p90 ${got.deepestP90} dB (record ${RECORD.deepestP90})`);
  // A failing window that carries a drive on a harmonic lane says so: the
  // stage's overdrive treatment puts the pad eight LU up under it (seed 20 bars
  // 8-16, 09-22), which the plan the trim is fitted on cannot see, so the line
  // names it rather than leaving it to read as the trim's.
  const DRIVE = /:(overdrive|distortion|fuzz)$/;
  const failures = bad.map((r) => (r.error ? `${r.theme} (${r.error})` : `${r.theme} ${r.active} % / ${r.deepest} dB${(r.fx || []).some((x) => DRIVE.test(x)) ? ` [${r.fx.filter((x) => DRIVE.test(x)).join(' ')}]` : ''}`));
  if (sweep.length) for (const k of Object.keys(RECORD)) if (got[k] > RECORD[k]) failures.push(`the sweep's ${k} ${got[k]} over the record's ${RECORD[k]}`);
  if (failures.length) {
    console.log(`FAILED: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`passed: all ${rows.length} inside ${LIMITER_ACTIVE_MAX} % and ${LIMITER_DEEPEST_MAX} dB`);
  process.exit(0);
}

if (CLI && (has('measure') || has('after') || (!has('fit') && !has('ab')))) {
  const { out, skipped } = jobs();
  console.log(`${out.length} themes from master seeds ${SEED_FROM}..${SEED_TO} x ${THEMES}${skipped.length ? `, ${skipped.length} with no eight-bar main past bar 16 (${skipped.slice(0, 6).join(' ')}${skipped.length > 6 ? ' ...' : ''})` : ''}`);
  const read = await run(out, { label: has('after') ? 'measuring (after)' : 'measuring' });
  const rows = [];
  const bad = [];
  out.forEach((j, i) => {
    if (read[i].error) { bad.push(`${j.masterSeed}#${j.theme}: ${read[i].error}`); return; }
    rows.push({ ...j, ...read[i] });
  });
  if (bad.length) console.log(`  ${bad.length} did not render: ${bad.slice(0, 3).join(' | ')}`);
  const file = has('after') ? AFTER : DATA;
  fs.writeFileSync(file, JSON.stringify({
    note: 'One row per theme: eight bars of its main groove, rendered offline in headless Chromium through the real graph and metered, with everything the plan knew about it before a node was built.',
    measuredAt: new Date().toISOString().slice(0, 10),
    // The measurement these are the same windows of, with the trim in.
    ...(has('after') ? { of: measurementOf(JSON.parse(fs.readFileSync(DATA, 'utf8'))) } : {}),
    seeds: [SEED_FROM, SEED_TO], themes: THEMES, windowBars: WINDOW_BARS, prerollBars: PREROLL_BARS, sampleRate: RATE,
    ...(SPELL_TEXT ? { spell: SPELL_TEXT } : {}),
    rows,
  }, null, 1) + '\n');
  if (!rows.length) {
    console.log(`  nothing rendered, so nothing was measured; ${path.relative(ROOT, file)} holds no rows`);
    process.exit(2);
  }
  const s = stats(rows.map((r) => r.lufs));
  console.log(`  ${rows.length} rows -> ${path.relative(ROOT, file)}`);
  console.log(`  LUFS ${s.min.toFixed(2)} .. ${s.max.toFixed(2)}, mean ${s.mean.toFixed(2)}, sd ${s.sd.toFixed(3)}, spread ${(s.max - s.min).toFixed(2)} LU`);
}

if (CLI && (has('fit') || (!has('measure') && !has('after') && !has('ab')))) {
  const before = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  // The loudness is the only thing a render can tell us; every feature beside
  // it is a pure function of the plan, so it is worked out again here from the
  // seed rather than read out of a file written by an older definition of it.
  // A measurement therefore never has to be repeated because a column was
  // renamed, and a fit is always over today's arithmetic.
  const rowsOf = (data, opts, spell, family) => data.rows.map((r) => ({
    ...featuresOf(planTheme(String(r.masterSeed), r.theme, opts), { from: r.fromBar, bars: data.windowBars }),
    masterSeed: r.masterSeed, theme: r.theme, fromBar: r.fromBar, spell, family,
    lufs: r.lufs, truePeak: r.truePeak, peak: r.peak,
    headroom: headroomOf(r.limiter),
  }));
  // **The model's reach** (round LOUD-1). `--with drone,dubstep` reads the rows
  // of measurements made under a spell (`--spell … --tag drone --measure`),
  // each planned again under the spell it was measured at, and fits **a model
  // of its own for each family of windows the house's sample never held**
  // (`loudnessFamily` in src/loudness.ts: `drumless`, a window with no kick in
  // it; `drop`, the loudest drop of a form with no main). A fit taught on
  // house mains alone read both far outside what it was fitted on: the held
  // drone's first theme went to the +6 clamp and the Dubstep theme from -6 to
  // +3.5 (round EQ-6 §3). One fit over all three was tried and costs the house:
  // its own residual went from 0.73 to 0.89 LU and its loudest-window choice
  // with it, s29 theme 2 cut 2.7 dB from a main measured at -12.7. So the
  // house's model is fitted on the house's rows as it always was, and each
  // family on its own. The slopes, the target, the clamps and the margin stay
  // the house's: the after pass is of the house's own measurement.
  const WITH = (arg('with', '') || '').split(',').filter(Boolean).map((tag) => {
    const file = path.join(OUT_DIR, `loudness-fit${TAG_OF(tag)}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.spell) throw new Error(`${path.relative(ROOT, file)} names no spell: measure it with --spell … --tag ${tag}`);
    return { tag, data, rows: rowsOf(data, { ...OPTS, spell: parseSpell(data.spell) }, data.spell, tag) };
  });
  const allRows = [...rowsOf(before, OPTS, SPELL_TEXT || null, 'house'), ...WITH.flatMap((w) => w.rows)];
  const famOf = (r) => (WITH.length ? loudnessFamily(r) : 'house');
  const rows = allRows.filter((r) => famOf(r) === 'house');
  const m = fit(rows, { max: +arg('max', 16) });
  // The headroom model, where the measurement read the limiter: the same
  // columns, the same selection, fitted on how far each measured window could be
  // trimmed before the gate's share or depth is passed (`headroomOf`). The
  // margin taken off it is its own cross-validated residual unless `--margin`
  // says otherwise.
  const hRows = rows.filter((r) => Number.isFinite(r.headroom));
  const hm = hRows.length >= 40 ? fit(hRows, { max: +arg('max', 16), y: 'headroom' }) : null;
  // The families' own models: the same selection on each family's rows.
  const FAMILIES = {};
  for (const name of ['drumless', 'drop', 'placed']) {
    const fr = allRows.filter((r) => famOf(r) === name);
    if (!fr.length) continue;
    if (fr.length < 40) { console.log(`  ${name}: ${fr.length} rows, too few for a model of its own; the house's reads them`); continue; }
    const fh = fr.filter((r) => Number.isFinite(r.headroom));
    FAMILIES[name] = { rows: fr, m: fit(fr, { max: +arg('max', 16) }), hm: hm && fh.length >= 40 ? fit(fh, { max: +arg('max', 16), y: 'headroom' }) : null,
      tags: [...new Set(fr.map((r) => r.family))] };
  }
  // The margin: a decibel, about two thirds of the model's cross-validated
  // error at the 09-22 refit (1.46 dB). Against no headroom at all, the whole
  // residual cost the median measured theme 0.5 LU of loudness; a decibel costs
  // it 0.3 and, in sample, keeps every one of the 120 windows under the gate's
  // line, where none left 4 of them over it. A decibel and a half since LOUD-1
  // (10-03): at the 15 % share a decibel left one house window in eight with the
  // limiter past 15 % of its blocks and eleven of 117 past 20 %; the half back
  // costs the median main about 0.3 LU and lands it at the sets' level still.
  const MARGIN = hm ? +(+arg('margin', 1.5)).toFixed(2) : 0;
  // The same rows, the same selection, with a coefficient per instrument and
  // per room allowed as well. It is not written anywhere: it is the number the
  // property fit has to beat to be worth having.
  const oneHot = fit(rows, { max: +arg('max', 16), instruments: true });
  const b = stats(rows.map((r) => r.lufs));
  // What the trim would be, clamped, and where each theme would land if the
  // record answered the fit exactly.
  // The target and the clamp are the **style's own**, not this tool's: a refit
  // of a second palette levels it against the record it belongs to, and moving
  // where a record sits is a different decision from levelling it. -13.0 is
  // where the blessed reference measures and is the mean of the 120 main grooves
  // to a hundredth; a listener who wants to argue with it passes `--target`.
  const M0 = planTheme('1', 0, OPTS).style.settings.loudness;
  const TARGET = +arg('target', M0.targetLufs);
  const CLAMP = +arg('clamp', M0.clampDb);
  const cand = pool(rows);
  const predict = (r) => m.intercept + m.names.reduce((a, n) => a + m.coef[n] * (cand[n].f(r) - m.centre[n]), 0);

  // How much of a decibel put in front of the master comes out the other side.
  // The record lives on its limiter, so it is not one: this is measured by
  // rendering the same themes a second time with the trim in the graph and
  // regressing what moved against what was asked for, through the origin.
  // Two of them, because a limiter is one-sided: a decibel driven up into the
  // ceiling does not come back the same as a decibel pulled out of it.
  // Without a second pass the slopes are the ones the style already has, and
  // not 1: a refit of the coefficients does not change what the master gives
  // back, and a slope of 1 would under-trim every theme until `--after` ran.
  let slopeUp = M0.slopeUp || 1, slopeDown = M0.slopeDown || 1, slopeFit = null;
  const afterPass = afterOf(before);
  if (afterPass) {
    const af = afterPass;
    const key = (r) => `${r.masterSeed}#${r.theme}`;
    const was = new Map(before.rows.map((r) => [key(r), r.lufs]));
    const pts = [];
    for (const r of af.rows) {
      const b = was.get(key(r));
      const t = r.trimDb;
      if (b == null || !Number.isFinite(t) || Math.abs(t) < 0.05) continue;
      pts.push({ t, moved: r.lufs - b });
    }
    const reg = (g) => {
      let sxy = 0, sxx = 0;
      for (const p of g) { sxy += p.t * p.moved; sxx += p.t * p.t; }
      if (!(sxx > 0)) return null;
      const s = sxy / sxx;
      const e = g.map((p) => p.moved - s * p.t);
      return { s: +s.toFixed(4), n: g.length, rms: +Math.sqrt(e.reduce((a, v) => a + v * v, 0) / e.length).toFixed(3) };
    };
    const up = reg(pts.filter((p) => p.t > 0));
    const down = reg(pts.filter((p) => p.t < 0));
    const both = reg(pts);
    if (up) slopeUp = up.s;
    if (down) slopeDown = down.s;
    if (up && down) slopeFit = { up, down, both };
  }
  const slopeFor = (d) => (d >= 0 ? slopeUp : slopeDown);
  const hCand = hm ? pool(hRows) : null;
  const room = (r) => (hm ? hm.intercept + hm.names.reduce((a, n) => a + hm.coef[n] * (hCand[n].f(r) - hm.centre[n]), 0) - MARGIN : Infinity);
  // The style's narrower lift for a window with no kick (`loudnessTrimDb`).
  const upFor = (r) => ((r.share_kick ?? 1) > 0 || M0.clampUpNoKickDb == null ? CLAMP : Math.min(CLAMP, M0.clampUpNoKickDb));
  const trims = rows.map((r) => {
    const need = TARGET - predict(r);
    return Math.max(-CLAMP, Math.min(upFor(r), need / slopeFor(need), room(r)));
  });
  const after = rows.map((r, i) => r.lufs + trims[i] * slopeFor(trims[i]));
  const a = stats(after);
  const t = stats(trims);

  const lines = [];
  lines.push('# Per-theme loudness: the measurement and the fit');
  lines.push('');
  lines.push(`Measured ${rows.length} themes — master seeds ${before.seeds[0]}..${before.seeds[1]}, themes 0..${before.themes - 1} — as ${before.windowBars} bars of main groove with ${before.prerollBars} bars of voiceless pre-roll, rendered offline through the real graph in headless Chromium at ${before.sampleRate} Hz, with the trim at 0 dB. ${before.measuredAt}.`);
  lines.push('');
  lines.push('## Before');
  lines.push('');
  lines.push(`| | LUFS |`);
  lines.push(`| --- | --- |`);
  lines.push(`| min | ${b.min.toFixed(2)} |`);
  lines.push(`| p05 | ${b.p05.toFixed(2)} |`);
  lines.push(`| mean | ${b.mean.toFixed(2)} |`);
  lines.push(`| p95 | ${b.p95.toFixed(2)} |`);
  lines.push(`| max | ${b.max.toFixed(2)} |`);
  lines.push(`| sd | ${b.sd.toFixed(3)} |`);
  lines.push(`| spread | ${(b.max - b.min).toFixed(2)} LU |`);
  lines.push('');
  lines.push('By room and density:');
  lines.push('');
  lines.push('| room | density | n | mean | min | max | sd |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const room of ['sub', 'growl']) {
    for (const d of ['minimal', 'medium', 'busy']) {
      const g = rows.filter((r) => r.preset === room && r.density === d);
      if (!g.length) continue;
      const gs = stats(g.map((r) => r.lufs));
      lines.push(`| ${room} | ${d} | ${g.length} | ${gs.mean.toFixed(2)} | ${gs.min.toFixed(2)} | ${gs.max.toFixed(2)} | ${gs.sd.toFixed(3)} |`);
    }
  }
  lines.push('');
  lines.push('## The fit');
  lines.push('');
  lines.push(`\`predicted LUFS = intercept + Σ coefficient × (feature − centre)\`, and \`trim = ${TARGET} − predicted\`, clamped to ±${CLAMP} dB.`);
  lines.push('');
  lines.push(`Features were chosen by forward selection on the five-fold cross-validated residual, not on R², so a column that only fits the noise cannot earn a place. ${m.names.length} of them did.`);
  lines.push('');
  lines.push('| feature | coefficient (dB per unit) | centre |');
  lines.push('| --- | --- | --- |');
  lines.push(`| (intercept) | ${m.intercept.toFixed(4)} | — |`);
  for (const n of m.names) lines.push(`| \`${n}\` | ${m.coef[n] >= 0 ? '+' : ''}${m.coef[n].toFixed(4)} | ${m.centre[n]} |`);
  lines.push('');
  lines.push(`- R² **${m.r2.toFixed(4)}**`);
  lines.push(`- in-sample residual **${m.rmse.toFixed(3)} LU** RMS`);
  lines.push(`- five-fold cross-validated residual **${m.cv.toFixed(3)} LU** RMS, worst held-out theme ${m.cvWorst.toFixed(2)} LU`);
  lines.push('');
  lines.push(`Against a pool that is also allowed a coefficient per instrument and per room — the thing this fit is built not to need — the same selection picks ${oneHot.names.length} features (${oneHot.names.join(', ')}) and cross-validates at **${oneHot.cv.toFixed(3)} LU**. The property fit is ${(oneHot.cv - m.cv >= 0 ? 'the better of the two by ' : 'behind it by ') + Math.abs(oneHot.cv - m.cv).toFixed(3)} LU, so nothing is given up by refusing to name an instrument, and a family written tomorrow needs its module and its four declared numbers and no new coefficient.`);
  lines.push('');
  lines.push('## What the master gives back');
  lines.push('');
  if (slopeFit) {
    lines.push(`A decibel of trim is not a decibel of loudness: it goes in front of the shared master, and this record lives on its limiter. MEASURED by rendering the same themes a second time with the trim in the graph and regressing what moved against what was asked for, through the origin — and **two slopes and not one**, because a limiter is one-sided:`);
    lines.push('');
    lines.push('| direction | dB out per dB in | themes | residual |');
    lines.push('| --- | --- | --- | --- |');
    lines.push(`| up, into the ceiling | ${slopeFit.up.s} | ${slopeFit.up.n} | ${slopeFit.up.rms} LU |`);
    lines.push(`| down, out of it | ${slopeFit.down.s} | ${slopeFit.down.n} | ${slopeFit.down.rms} LU |`);
    lines.push(`| one slope for both | ${slopeFit.both.s} | ${slopeFit.both.n} | ${slopeFit.both.rms} LU |`);
    lines.push('');
    lines.push('The trim is divided by the one that applies to its direction, so what the meter sees is the decibel that was wanted. One slope in the middle over-trims everything quiet and under-trims everything loud, which is what put seed 38 theme 2 a decibel and a half under its neighbours in the first montage.');
  } else {
    lines.push(`Not measured on this measurement: the style's own slopes are kept (${slopeUp} up, ${slopeDown} down). Run \`node tools/loudness-fit.ts --after\` with the trim in the build, and the slope appears here.`);
  }
  lines.push('');
  if (hm) {
    const hs = stats(hRows.map((r) => r.headroom));
    lines.push('## The headroom');
    lines.push('');
    lines.push(`How far each measured window could be trimmed before the master's limiter works in more than ${HEADROOM_ACTIVE} % of its 10 ms blocks or more than ${HEADROOM_DEEPEST} dB deep — the block peaks ahead of the limiter against the ceiling, read on the same renders at nought. Measured ${hs.min.toFixed(2)} to ${hs.max.toFixed(2)} dB, mean ${hs.mean.toFixed(2)}, over ${hRows.length} windows. Fitted on the same columns by the same selection:`);
    lines.push('');
    lines.push('| feature | coefficient (dB per unit) | centre |');
    lines.push('| --- | --- | --- |');
    lines.push(`| (intercept) | ${hm.intercept.toFixed(4)} | — |`);
    for (const n of hm.names) lines.push(`| \`${n}\` | ${hm.coef[n] >= 0 ? '+' : ''}${hm.coef[n].toFixed(4)} | ${hm.centre[n]} |`);
    lines.push('');
    lines.push(`R² ${hm.r2.toFixed(4)}, in-sample ${hm.rmse.toFixed(3)} dB, cross-validated ${hm.cv.toFixed(3)} dB (worst held out ${hm.cvWorst.toFixed(2)}). The trim never exceeds the least headroom any main window of the theme has, less a margin of ${MARGIN} dB for the model's own error.`);
    lines.push('');
  }
  lines.push('## After, as the fit predicts it');
  lines.push('');
  lines.push(`| | LUFS |`);
  lines.push(`| --- | --- |`);
  lines.push(`| min | ${a.min.toFixed(2)} |`);
  lines.push(`| mean | ${a.mean.toFixed(2)} |`);
  lines.push(`| max | ${a.max.toFixed(2)} |`);
  lines.push(`| sd | ${a.sd.toFixed(3)} |`);
  lines.push(`| spread | ${(a.max - a.min).toFixed(2)} LU |`);
  lines.push('');
  lines.push(`The trim itself runs ${t.min.toFixed(2)} to ${t.max.toFixed(2)} dB, mean ${t.mean.toFixed(2)}; ${trims.filter((x) => Math.abs(x) >= CLAMP - 1e-9).length} themes are on the clamp.`);
  lines.push('');
  if (afterPass) {
    const af = afterPass;
    const key = (r) => `${r.masterSeed}#${r.theme}`;
    const byKey = new Map(af.rows.map((r) => [key(r), r]));
    const pairs = rows.filter((r) => r.family === 'house' && byKey.has(key(r))).map((r) => ({ r, after: byKey.get(key(r)) }));
    if (pairs.length) {
      const ms = stats(pairs.map((p) => p.after.lufs));
      lines.push('## After, measured');
      lines.push('');
      lines.push(`${pairs.length} of the same themes re-rendered with the trim in the graph: min ${ms.min.toFixed(2)}, max ${ms.max.toFixed(2)}, mean ${ms.mean.toFixed(2)}, sd ${ms.sd.toFixed(3)}, spread ${(ms.max - ms.min).toFixed(2)} LU.`);
      lines.push('');
      lines.push('The twelve furthest from the target before and where they landed:');
      lines.push('');
      lines.push('| theme | room | density | before | trim | after |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      [...pairs].sort((x, y) => Math.abs(y.r.lufs - TARGET) - Math.abs(x.r.lufs - TARGET)).slice(0, 12)
        .forEach((p) => lines.push(`| ${key(p.r)} | ${p.r.preset} | ${p.r.density} | ${p.r.lufs.toFixed(2)} | ${f2(p.after.trimDb ?? 0)} | ${p.after.lufs.toFixed(2)} |`));
      lines.push('');
    }
  }
  if (fs.existsSync(path.join(OUT_DIR, 'ab-trim-before.json'))) {
    const bJ = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'ab-trim-before.json'), 'utf8'));
    const aJ = fs.existsSync(path.join(OUT_DIR, 'ab-trim-after.json')) ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'ab-trim-after.json'), 'utf8')) : null;
    lines.push('## The montage in tmp/ear');
    lines.push('');
    lines.push('`ab-trim-before.wav` and `ab-trim-after.wav`: four main grooves of eight bars each, in the order below, a third of a second of silence between them, 48 kHz.');
    lines.push('');
    lines.push('| theme | room | density | before | trim | after |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    bJ.forEach((r, i) => lines.push(`| ${r.seed}#${r.theme} | ${r.room} | ${r.density} | ${r.lufs.toFixed(2)} | ${aJ && aJ[i] ? f2(aJ[i].trimDb ?? 0) : '—'} | ${aJ && aJ[i] ? aJ[i].lufs.toFixed(2) : '—'} |`));
    lines.push('');
  }
  // --- the block, written by the gate ---------------------------------------
  //
  // Nothing in a style is typed, and a loudness model least of all: fifty
  // features, ten coefficients and two slopes are numbers nobody can check by
  // reading them. `--bless` writes the block; the style imports it.
  //
  // One thing in it is not the fit's (round LOUD-2): a family's own
  // `targetLufs`, set by hand in the blessed file, is a level asked for and not
  // a number a render produced, so a refit carries it over rather than
  // dropping it, and the note says so.
  const priorFile = BLOCK(planTheme('1', 0, OPTS).style.id);
  const prior = fs.existsSync(priorFile) ? JSON.parse(fs.readFileSync(priorFile, 'utf8')) : null;
  const handTargets = Object.fromEntries(Object.entries(prior?.families ?? {})
    .filter(([name, F]) => FAMILIES[name] && Number.isFinite((F as { targetLufs?: number }).targetLufs))
    .map(([name, F]) => [name, (F as { targetLufs: number }).targetLufs]));
  const block = {
    note: 'Written by tools/loudness-fit.ts --bless. Every number here came off a render; nothing in it was reasoned, which is why it is JSON beside the style and not a table inside it.'
      + (Object.keys(handTargets).length ? ` Except, by hand and carried over from the blessed file: ${Object.entries(handTargets).map(([k, v]) => `families.${k}.targetLufs ${v}`).join(', ')} (round LOUD-2: a family's own target in place of the block's).` : ''),
    measuredAt: new Date().toISOString().slice(0, 10),
    strategy: STRATEGY || 'house-v1',
    sample: { seeds: before.seeds, themes: before.themes, n: rows.length, windowBars: before.windowBars, sampleRate: before.sampleRate,
      ...(WITH.length ? { with: WITH.map((w) => ({ tag: w.tag, spell: w.data.spell, seeds: w.data.seeds, themes: w.data.themes, n: w.rows.length })) } : {}) },
    residual: { r2: m.r2, inSample: m.rmse, crossValidated: m.cv, worstHeldOut: m.cvWorst },
    targetLufs: TARGET,
    clampDb: CLAMP,
    slopeUp: +slopeUp.toFixed(4),
    slopeDown: +slopeDown.toFixed(4),
    intercept: m.intercept,
    coef: Object.fromEntries(m.names.map((n) => [n, m.coef[n]])),
    centre: Object.fromEntries(m.names.map((n) => [n, m.centre[n]])),
    ...(hm ? { headroom: {
      activeMax: HEADROOM_ACTIVE,
      deepestMax: HEADROOM_DEEPEST,
      marginDb: MARGIN,
      residual: { r2: hm.r2, inSample: hm.rmse, crossValidated: hm.cv, worstHeldOut: hm.cvWorst, n: hm.n },
      intercept: hm.intercept,
      coef: Object.fromEntries(hm.names.map((n) => [n, hm.coef[n]])),
      centre: Object.fromEntries(hm.names.map((n) => [n, hm.centre[n]])),
    } } : {}),
    ...(Object.keys(FAMILIES).length ? { families: Object.fromEntries(Object.entries(FAMILIES).map(([name, F]) => [name, {
      ...(name in handTargets ? { targetLufs: handTargets[name] } : {}),
      sample: { from: F.tags, n: F.rows.length },
      residual: { r2: F.m.r2, inSample: F.m.rmse, crossValidated: F.m.cv, worstHeldOut: F.m.cvWorst },
      intercept: F.m.intercept,
      coef: Object.fromEntries(F.m.names.map((n) => [n, F.m.coef[n]])),
      centre: Object.fromEntries(F.m.names.map((n) => [n, F.m.centre[n]])),
      ...(F.hm ? { headroom: {
        residual: { r2: F.hm.r2, inSample: F.hm.rmse, crossValidated: F.hm.cv, worstHeldOut: F.hm.cvWorst, n: F.hm.n },
        intercept: F.hm.intercept,
        coef: Object.fromEntries(F.hm.names.map((n) => [n, F.hm.coef[n]])),
        centre: Object.fromEntries(F.hm.names.map((n) => [n, F.hm.centre[n]])),
      } } : {}),
    }])) } : {}),
  };
  // The file is named after the **style** and not after the strategy, because a
  // loudness model belongs to a palette and a palette is a style: it sits beside
  // `deep-house-signatures.json`, which is there for the same reason.
  const blockFile = BLOCK(planTheme('1', 0, OPTS).style.id);
  if (has('bless')) {
    fs.writeFileSync(blockFile, `${JSON.stringify(block, null, 2)}\n`);
    console.log(`blessed ${path.relative(ROOT, blockFile)}`);
  } else {
    // Unblessed, the whole block -- the headroom model with it, which the
    // report's table below leaves out -- goes beside the report in the lab, so
    // a round can read what a bless would write, and build a site on it,
    // without the style's file moving (round EQ-5).
    const draft = path.join(OUT_DIR, `loudness-fit${TAG}-block.json`);
    fs.writeFileSync(draft, `${JSON.stringify(block, null, 2)}\n`);
    console.log(`not blessed: the block a bless would write is in ${path.relative(ROOT, draft)}`);
  }
  lines.push(`## The \`loudness\` block${has('bless') ? ` — written to ${path.relative(ROOT, blockFile)}` : ''}`);
  lines.push('');
  lines.push('```js');
  lines.push('loudness: {');
  lines.push(`  targetLufs: ${TARGET},`);
  lines.push(`  clampDb: ${CLAMP},`);
  lines.push(`  slopeUp: ${+slopeUp.toFixed(4)},`);
  lines.push(`  slopeDown: ${+slopeDown.toFixed(4)},`);
  lines.push(`  intercept: ${m.intercept},`);
  lines.push('  coef: {');
  for (const n of m.names) lines.push(`    ${n}: ${m.coef[n]},`);
  lines.push('  },');
  lines.push('  centre: {');
  for (const n of m.names) lines.push(`    ${n}: ${m.centre[n]},`);
  lines.push('  },');
  lines.push('},');
  lines.push('```');
  lines.push('');
  fs.writeFileSync(REPORT, lines.join('\n'));

  console.log(`\nfeatures (${m.names.length}): ${m.names.join(', ')}`);
  console.log(`R2 ${m.r2}  in-sample ${m.rmse} LU  cross-validated ${m.cv} LU  worst held out ${m.cvWorst} LU`);
  console.log(`one-hot pool for comparison (${oneHot.names.length}): ${oneHot.names.join(', ')}`);
  console.log(`  R2 ${oneHot.r2}  cross-validated ${oneHot.cv} LU  worst held out ${oneHot.cvWorst} LU`);
  console.log(`before: ${b.min.toFixed(2)} .. ${b.max.toFixed(2)} LUFS, sd ${b.sd.toFixed(3)}, spread ${(b.max - b.min).toFixed(2)} LU`);
  console.log(slopeFit
    ? `master gives back ${slopeFit.up.s} dB per dB going up (${slopeFit.up.n}, residual ${slopeFit.up.rms}) and ${slopeFit.down.s} coming down (${slopeFit.down.n}, residual ${slopeFit.down.rms}); one slope for both would be ${slopeFit.both.s} at ${slopeFit.both.rms}`
    : `master slope not measured on this measurement: the style's ${slopeUp} up and ${slopeDown} down are kept; run --after with the trim in the build`);
  if (hm) {
    const hs = stats(hRows.map((r) => r.headroom));
    console.log(`headroom (${hm.names.length}): ${hm.names.join(', ')}`);
    console.log(`  measured ${hs.min.toFixed(2)} .. ${hs.max.toFixed(2)} dB, mean ${hs.mean.toFixed(2)}; R2 ${hm.r2}  in-sample ${hm.rmse} dB  cross-validated ${hm.cv} dB  worst held out ${hm.cvWorst} dB; margin ${MARGIN} dB; ${trims.filter((t, i) => room(rows[i]) < Math.min(CLAMP, (TARGET - predict(rows[i])) / slopeFor(TARGET - predict(rows[i])))).length} of ${rows.length} trims held by it`);
  }
  console.log(`after (predicted): ${a.min.toFixed(2)} .. ${a.max.toFixed(2)} LUFS, sd ${a.sd.toFixed(3)}, spread ${(a.max - a.min).toFixed(2)} LU`);
  // ...and each family on its own: what its model reads there against what was
  // measured, and the trims it would hand those windows.
  const evalM = (M, r) => M.intercept + Object.keys(M.coef).reduce((acc, n) => acc + M.coef[n] * (LOUDNESS_COLUMNS[n](r) - M.centre[n]), 0);
  const famLine = (name, fr, M, H) => {
    const err = stats(fr.map((r) => evalM(M, r) - r.lufs));
    const hr = fr.filter((r) => Number.isFinite(r.headroom));
    const hErr = H ? stats(hr.map((r) => evalM(H, r) - r.headroom)) : null;
    const tr = fr.map((r) => { const need = TARGET - evalM(M, r); return Math.max(-CLAMP, Math.min(upFor(r), need / slopeFor(need), H ? evalM(H, r) - MARGIN : Infinity)); });
    const af = stats(fr.map((r, i) => r.lufs + tr[i] * slopeFor(tr[i])));
    const ts = stats(tr);
    console.log(`  ${name} (${fr.length}): loudness predicted minus measured mean ${f2(err.mean)} sd ${err.sd.toFixed(2)}${hErr ? `; headroom mean ${f2(hErr.mean)} sd ${hErr.sd.toFixed(2)}` : ''}; trims ${ts.min.toFixed(2)} .. ${ts.max.toFixed(2)} mean ${f2(ts.mean)}; after ${af.min.toFixed(2)} .. ${af.max.toFixed(2)} mean ${af.mean.toFixed(2)}`);
  };
  if (WITH.length) famLine('house', rows, m, hm);
  for (const [name, F] of Object.entries(FAMILIES)) {
    console.log(`${name} (${F.rows.length}, from ${F.tags.join(', ')}): ${F.m.names.join(', ')}; R2 ${F.m.r2} cross-validated ${F.m.cv} LU${F.hm ? `; headroom ${F.hm.names.join(', ')}; R2 ${F.hm.r2} cross-validated ${F.hm.cv} dB` : ''}`);
    famLine(name, F.rows, F.m, F.hm);
    for (const tag of F.tags) if (F.tags.length > 1) famLine(`  of which ${tag}`, F.rows.filter((r) => r.family === tag), F.m, F.hm);
  }
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  console.log('\nthe block for the style\'s loudness section:\n');
  console.log(lines.slice(lines.lastIndexOf('```js') + 1, lines.length - 2).join('\n'));
}
