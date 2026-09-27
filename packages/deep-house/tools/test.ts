// The test suite: the plans are locked, and so is the sound.
//
//   npm test                          build the site into a scratch folder and run
//                                     everything below, eight renders at a time
//   DEEP_HOUSE_JOBS=1 npm test        the same, one render at a time
//   node tools/test.ts --jobs N       N renders at once over both engines
//   node tools/test.ts --build        build the site to a scratch folder first
//   node tools/test.ts --bless       rewrite the blessed envelopes from the current sound
//   node tools/test.ts --bless-legacy   and tools/reference-seed1.json with them
//   node tools/test.ts --scene <name>   one scene, by name
//   node tools/test.ts --engines chromium   fewer engines, for a fast loop
//   node tools/test.ts --allow-skip  accept a missing browser tool
//   node tools/test.ts --site <dir>  meter a build other than docs/
//   node tools/test.ts --port <n>    serve on that port, or borrow what is there
//
//   1. the golden plans (tools/golden.ts --check)
//   2. the meters themselves (tools/meter.ts --selftest): an instrument is
//      checked before the measurement it is trusted for
//   3. the scenes in tools/scenes.json, rendered offline through the real graph
//      in headless Chromium and headless Firefox, and metered
//
// ## What a scene is
//
// Eight bars of seed 1 was one window of one seed, and the things that have
// actually gone wrong in this project went wrong somewhere else: a drop whose
// sub overflowed, a breakdown the push curve drove into the drop behind it, a
// minimal room whose hats were chosen without looking at it, two voicings that
// put a semitone in the middle of a chord, and a seam. `tools/scenes.json` is
// one scene per fault, each a window of bars with the section kind it belongs
// to, so a fix that comes undone fails a line that says which fix.
//
// A scene is rendered as the window and nothing else, because a theme is four
// minutes long and a suite is two. Three things make that window the music it
// would have been in the middle of the theme rather than a theme that happens
// to start there:
//
//   the whole theme is compiled and the window is a *slice of the program*.
//   The sound stage reads the theme's real history — a four-bar block of a
//   layer as a string, and the bars since each layer last played something it
//   had not played in the last sixteen — and it reads it over the whole
//   theme, once, before anything is cut. Without that history, seed 15576's
//   minimal room measured 4.48 dB out in a band: a window on its own looks
//   like a theme in which nothing has held long enough to be moved to the back
//   of the stage. Until round D the window was taken off the *plan* instead,
//   with every event outside it handed to the render under a voice name no
//   voice has so that the stage would read it and `fireEvent` would build
//   nothing for it; that worked, and what it cost was a stage run again on a
//   list nobody would ever play, and a property — that slicing does not
//   compound a treatment — which had to be believed. `tools/check.ts` proves
//   it now: a window of the compiled theme is the compile of that window,
//   field for field.
//
//   the automation is moved with the window rather than cut. `applyCurve`
//   already interpolates into the segment it lands inside, so a macro filter
//   or a push curve whose points now sit at negative times starts at the value
//   it had reached — which is the whole point of the curve at bar 60.
//
//   two bars before the window are rendered and thrown away, so the reverb,
//   the delay line and the limiter's envelope are running by the time the
//   window opens.
//
// What it is still not: the graph's state from the *whole* theme. Measured
// against a render of all sixty-eight bars, seed 1's drop reads its loudness
// and its true peak to a hundredth and one band 1.3 dB out. That band is the
// price of the window, it is the same price every time — two renders of a
// scene agree to 0.000 dB — and the envelope is blessed from the window, so it
// is a gate on the mix moving and not on the tail of the bars before it.
//
// ## What every scene is held to
//
// The ceilings are absolute and are checked whatever the reference says,
// blessing included: true peak at or under -1 dBTP, sample peak at or under
// -1 dBFS, and the true peak never under its own sample peak. Then the kick
// and bass stem, rendered alone, has to be mono to the sample in both engines
// — the first rule in the DSP, and the fault it is here for was an engine's
// own per-channel filter state and not the plan's — with no hit moving one
// channel while the other holds still. Then the click gate: the largest
// one-sample move in a 2 ms window round every kick and hat, where a hit with
// nothing else on it is held to 0.05 and a hit sharing its window with a clap
// fails only for a move standing eight times over the moves round it. Then the
// limiter: the worklet posts the worst gain reduction it saw every eighth of a
// second, and no more than the stated share of a window may be over a decibel.
// Then loudness by section kind — a main a decibel and a quarter either side of
// -12 LUFS, a drop no more than 1.5 LU over its own theme's mains, a breakdown
// no more than half a decibel over them. And then the blessed third-octave
// envelope, per scene and per engine, within half a decibel.
//
// Per engine, because Firefox is a second engine and not a second machine: it
// reads the same eight bars up to 3.6 dB apart in a band and 1.2 LU louder,
// which is its own biquads and not a change in the record. WebKit agrees with
// Chromium to a hundredth of a decibel, which is why two engines are enough.
// The absolute loudness band is therefore Chromium's, the same way the click
// gate's absolute number is; everything relative — the drop against its mains,
// the stem against itself — is asked of both.
//
// What is metered is the built site: `npm test` builds it into a scratch
// folder (`--build`; it used to build into docs/, which rewrote the published
// site in the working tree on every run) and this serves that, or docs/, or
// `--site`, on a free port of its own, so what is listened to is the bundle
// that ships and not the loose modules — and a scenario run, the engine's
// suite, or this suite in another worktree, can go at the same time.
// `--port <n>` names a port instead, and a server already there is borrowed,
// after it is asked to prove it is serving this build before a note is
// rendered.
// Nothing here can be heard: an OfflineAudioContext has no output device, and
// the page is opened with the silent route besides.
//
// Playwright is borrowed from one of two documented places and is not a
// dependency of the page. When it is in neither the sound is not checked, and
// that is a skip: the run ends non-zero unless --allow-skip says the gap is
// wanted.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// The harness and the meter are the machine's: generic test tooling that knows
// no music, and since round W of PLAN-V1-NEXT they come from the engine by its
// package name. `ROOT` is the repository, which is where `docs/` is; `HERE` is
// this folder, which is where the scenes, the references and the two locks are.
import { ROOT, PORT, siteDir, serve, servedIsUnderTest, playwright, finish, pageUrl, launchOptions } from '@deep-house/engine/harness';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const METER = fileURLToPath(import.meta.resolve('@deep-house/engine/meter'));
import { setLayout } from './setplan.ts';
import { layersWhere } from '@deep-house/engine/voices';
import { planTheme } from '../src/mix.ts';
import { programOf } from '../src/performance.ts';
import { laneVoices } from '../src/lanes.ts';
import { biasFor } from '../src/spell.ts';
import { voicePlaying } from '@deep-house/engine/voices';
import { FIXTURES } from './lane-fixtures.ts';

// The stem that has to be mono to the sample, straight off the registry: every
// registered voice whose descriptor says it has no side at all, by the layer
// its events carry — the kick and the bass. It is worked out here, in node,
// and carried into the page on the job, because what runs in the page is a
// function serialised into it and cannot import a module of ours.
const MONO_STEM = layersWhere((d) => d.mono);

const BLESS = process.argv.includes('--bless');
// tools/reference-seed1.json is Eugene's blessed reading and this suite only
// ever checks it. Re-writing it is a second, deliberate word.
const BLESS_LEGACY = process.argv.includes('--bless-legacy');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ENGINES = arg('engines', 'chromium,firefox').split(',').filter(Boolean);
const ONLY = arg('scene', null);
// How many renders run at once, over both engines. Measured on the machine the
// suite was written on (an 18-core M-series): the wall time stops falling at
// JOBS_DEFAULT, and every reading at that is the reading `--jobs 1` gives
// (notes/reviews/suites-2026-09-24.md). `--jobs 1`, or `DEEP_HOUSE_JOBS=1
// npm test`, is the serial suite.
const JOBS_DEFAULT = 8;
const JOBS = Math.max(1, Math.floor(Number(arg('jobs', process.env.DEEP_HOUSE_JOBS ?? JOBS_DEFAULT))) || JOBS_DEFAULT);

const PLAN = JSON.parse(fs.readFileSync(path.join(HERE, 'scenes.json'), 'utf8'));
const G = PLAN.gates;
const SCENES = PLAN.scenes.filter((s) => !ONLY || s.name === ONLY);
const REF_DIR = path.join(HERE, 'reference');
const refFile = (scene, engine) => path.join(REF_DIR, `${scene}-${engine}.json`);

let failed = 0;
const skipped = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => { failed++; console.log(`  FAIL  ${msg}`); };
const skip = (msg) => { skipped.push(msg); console.log(`  skip  ${msg}`); };

// --- 1. the plans -----------------------------------------------------------
console.log('golden plans');
try {
  // Every strategy, not the default alone: a bare link plays house-v2 (R4).
  const out = execFileSync(process.execPath, [path.join(HERE, 'golden.ts'), '--check', '--all'], { encoding: 'utf8' });
  for (const line of out.trim().split('\n')) ok(line);
} catch (e) {
  bad(`the generator moved: ${(e.stderr || e.stdout || e.message).toString().trim().split('\n')[0]}`);
}

// --- 2. the meters ----------------------------------------------------------
// The true peak used to be read from a convolution that started once the
// filter was full and stopped at the last sample, so a hit at either end of a
// buffer was invisible to it. What the instrument says about signals whose
// answer is known on paper is checked before it is pointed at the music.
console.log('the meters');
try {
  const out = execFileSync(process.execPath, [METER, '--selftest'], { encoding: 'utf8' });
  ok(out.trim().split('\n').pop());
} catch (e) {
  const lines = (e.stdout || e.message).toString().trim().split('\n');
  bad(`the meters: ${lines.filter((l) => l.includes('FAIL')).join(' | ') || lines.pop()}`);
}

// --- the job each scene becomes in the page --------------------------------
// The set's own arithmetic, out here rather than in the page, so a mix scene
// can be rendered up to its first seam and no further. What it predicts is
// checked against what the render reports.
function jobFor(scene) {
  const job = {
    ...scene,
    sampleRate: PLAN.sampleRate,
    prerollBars: Math.min(G.prerollBars, scene.fromBar || 0),
    tailSeconds: G.tailSeconds,
    monoStem: MONO_STEM,
  };
  if (scene.source === 'mix') {
    const layout = setLayout(scene.masterSeed, scene.themes, { themeBars: scene.themeBars });
    const s = layout.seams[0];
    job.predicted = { at: s.at, swapAt: s.swapAt, end: s.end, bars: s.bars, bar: s.bar };
    job.maxSeconds = s.end + G.tailSeconds;
  }
  return job;
}

// --- what the page does with it --------------------------------------------
const MEASURE = async (job) => {
  const HITS = ['kick', 'hatClosed', 'hatOpen', 'shaker'];
  const rate = job.sampleRate;
  const meter = await import('../tools/meter.ts');
  const began = performance.now();

  // The limiter's own meter, read where it is posted. The worklet sends the
  // worst reduction it saw once every ceil((rate/8)/128)*128 samples, so the
  // posts are a timeline of the render at about eight a second.
  const reductions = [];
  const Orig = window.AudioWorkletNode;
  const watch = () => {
    window.AudioWorkletNode = class extends Orig {
      constructor(...a) {
        super(...a);
        this.port.addEventListener('message', (e) => {
          if (e.data && typeof e.data.reduction === 'number') reductions.push(e.data.reduction);
        });
        this.port.start();
      }
    };
  };
  const period = (Math.ceil((rate / 8) / 128) * 128) / rate;
  // **Every post, and not whatever arrived in 80 ms.** The posts cross from the
  // render's thread to the page's on their own and the promise of the render
  // does not wait for them, so a page slow to get round to its messages — a
  // machine rendering eight windows at once — read the limiter's share off
  // fewer posts than the render made. How many there are is arithmetic: the
  // render runs in whole blocks of 128 and the worklet posts once every
  // `period` of them, so the count is waited for (ten seconds at the most, and
  // then the reading is what arrived, as it always was).
  const posted = async (frames) => {
    const want = Math.floor((Math.ceil(frames / 128) * 128) / Math.round(period * rate));
    for (let waited = 0; reductions.length < want && waited < 10000; waited += 10) await new Promise((r) => setTimeout(r, 10));
  };

  // One window of one theme, cut out of the program the whole theme compiles
  // to. The theme is compiled once; the window is a slice of that value, so
  // the stage is not run again on a list nobody plays and there is nothing a
  // slice can compound.
  const window1 = (program, fromBar, bars, only) => {
    const bs = program.barSeconds;
    const preBar = Math.max(0, fromBar - job.prerollBars);
    const tp = preBar * bs;
    const t0 = fromBar * bs;
    const t1 = (fromBar + bars) * bs;
    const slice = window.deepHouse.sliceProgram(program, { from: tp, to: t1, tail: job.tailSeconds, layers: only });
    return { slice, sounding: slice.events, from: t0 - tp, bs };
  };

  const clicksOf = (L, R, sounding, offset) => {
    const hits = sounding.filter((e) => HITS.includes(e.voice) && e.t >= offset);
    const alone = (h) => !sounding.some((e) => e !== h && Math.abs(e.t - h.t) < 0.002);
    return {
      both: meter.clicks([L, R], rate, hits.map((e) => e.t - offset)).map((c, i) => ({ ...c, voice: hits[i].voice, alone: alone(hits[i]) })),
      // 20 ms round each hit, not the 2 ms the click gate uses: a filter that
      // starts its second channel from rest is wrong for as long as its own
      // transient lasts, and the worst of it landed four milliseconds after
      // the kick, outside a 2 ms window.
      sided: meter.sidedClicks([L, R], rate, hits.map((e) => e.t - offset), 20).map((c, i) => ({ ...c, voice: hits[i].voice })),
      hits: hits.length,
    };
  };

  const read = (buf, from) => {
    const L = buf.getChannelData(0).slice(from), R = buf.getChannelData(1).slice(from);
    let gap = 0, at = 0;
    for (let i = 0; i < L.length; i++) { const d = Math.abs(L[i] - R[i]); if (d > gap) { gap = d; at = i; } }
    return { L, R, gap: +gap.toFixed(6), gapAt: +(at / rate).toFixed(4) };
  };

  let out = { engineMs: 0 };
  if (job.source === 'mix') {
    watch();
    const mix = await window.deepHouse.renderMix({
      masterSeed: job.masterSeed, themes: job.themes, themeBars: job.themeBars,
      maxSeconds: job.maxSeconds, sampleRate: rate, tail: job.tailSeconds,
    });
    window.AudioWorkletNode = Orig;
    await posted(mix.buffer.length);
    const seam = mix.seams[0];
    const from = Math.round(seam.at * rate);
    const { L, R } = read(mix.buffer, from);
    // The outgoing deck starts at time zero and the grid is still its own
    // until the blend is over, so its event times are the set's times. That is
    // the deck whose fader, sub and filter are all moving through the seam,
    // which is where a click would come from; the arriving deck's hits are not
    // covered here.
    const out0 = window.deepHouse.planTheme(String(job.masterSeed), 0, { themeBars: job.themeBars });
    out = {
      ...out,
      seams: mix.seams.map((s) => ({ at: s.at, swapAt: s.swapAt, end: s.end, bars: s.bars })),
      duration: +mix.buffer.duration.toFixed(3),
      seconds: +(L.length / rate).toFixed(3),
      bpm: mix.themes[0].bpm,
      events: out0.events.filter((e) => e.t >= seam.at && e.t < mix.buffer.duration).length,
      bands: meter.thirdOctaves(L, R, rate),
      lufs: meter.integratedLoudness([L, R], rate),
      truePeak: meter.truePeak([L, R]),
      peak: +(20 * Math.log10(meter.samplePeak([L, R]) + 1e-30)).toFixed(2),
      ...clicksOf(L, R, out0.events, seam.at),
      stem: null,
    };
  } else {
    const track = job.source === 'track'
      ? window.deepHouse.generate({ seed: job.masterSeed, minutes: job.minutes || 1 })
      : window.deepHouse.planTheme(String(job.masterSeed), job.theme, {});
    const program = window.deepHouse.programOf(track);
    const w = window1(program, job.fromBar, job.bars, null);
    watch();
    const buf = await window.deepHouse.renderProgram(w.slice, { sampleRate: rate });
    window.AudioWorkletNode = Orig;
    await posted(buf.length);
    const { L, R } = read(buf, Math.round(w.from * rate));
    // The kick and the bass share one bus and that bus is mono, so their stem
    // has no side at all. There is no threshold to argue about: it is
    // arithmetic, and before the patch it read 0.5235 in Firefox. Which layers
    // the stem is made of comes in on the job, from the registry: every
    // descriptor with `mono: true`.
    const sw = window1(program, job.fromBar, job.bars, job.monoStem);
    const sbuf = await window.deepHouse.renderProgram(sw.slice, { sampleRate: rate });
    const s = read(sbuf, Math.round(sw.from * rate));
    const sc = clicksOf(s.L, s.R, sw.sounding, sw.from);
    out = {
      ...out,
      duration: +buf.duration.toFixed(3),
      seconds: +(L.length / rate).toFixed(3),
      bpm: program.bpm,
      barSeconds: w.bs,
      events: w.sounding.length,
      bands: meter.thirdOctaves(L, R, rate),
      lufs: meter.integratedLoudness([L, R], rate),
      truePeak: meter.truePeak([L, R]),
      peak: +(20 * Math.log10(meter.samplePeak([L, R]) + 1e-30)).toFixed(2),
      ...clicksOf(L, R, w.sounding, w.from),
      stem: { gap: s.gap, gapAt: s.gapAt, sided: sc.sided, peak: +meter.samplePeak([s.L, s.R]).toFixed(4) },
    };
  }
  // The posts that fall inside the metered window, and how many of them saw
  // more than a decibel taken off.
  const first = Math.floor((out.duration - out.seconds) / period);
  const inWindow = reductions.slice(first);
  out.limiter = {
    posts: inWindow.length,
    over1: inWindow.filter((r) => r > 1).length,
    share: inWindow.length ? +(inWindow.filter((r) => r > 1).length / inWindow.length).toFixed(3) : 0,
    worst: +Math.max(0, ...inWindow).toFixed(2),
  };
  out.engineMs = Math.round(performance.now() - began);
  return out;
};

// --- the site under test ---------------------------------------------------
//
// **`--build` builds it, into a folder of its own** (the suites' round of
// 09-24), which is what `npm test` asks for: the suite used to be run after a
// `vite build` into `docs/`, so every run rewrote the published site in the
// working tree and somebody had to put it back. The build here is the same
// build — the same config, the same flags, the private tier off — written to a
// scratch folder that is gone when the run is. Without `--build` the suite
// meters `docs/`, or `--site <dir>`, as it always has: that is what a dry
// release hands it.
let BUILT = null;
if (process.argv.includes('--build')) {
  const { build } = await import('vite');
  BUILT = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-house-site-'));
  process.on('exit', () => fs.rmSync(BUILT, { recursive: true, force: true }));
  await build({ configFile: path.join(HERE, '..', 'vite.config.ts'), logLevel: 'warn', build: { outDir: BUILT, emptyOutDir: true } });
}

// --- 3. the scenes ---------------------------------------------------------
console.log(`the scenes: ${SCENES.length} of them, in ${ENGINES.join(' and ')}`);
const site = BUILT || siteDir();
const server = await serve(site);
// The meters are read from the page, so they are part of what has to be
// answering: the identity check asks for them by name as well as for the build.
const served = await servedIsUnderTest(site, ['tools/meter.ts']);
if (!served.ok) bad(`what is on ${PORT} is not the build under test: ${served.why}`);
else ok(`${server.borrowed ? `borrowed the server on ${PORT}, which serves` : `serving ${path.relative(ROOT, site)} on ${PORT}:`} ${served.what}`);

let pw = null;
if (served.ok) {
  try {
    const found = await playwright();
    pw = found.pw;
    ok(found.label);
  } catch (e) {
    skip(`no scene was rendered: ${e.message.split('\n').join(' ').replace(/\s+/g, ' ')}`);
  }
}

const jobs = SCENES.map(jobFor);
const readings = {}; // engine -> scene name -> reading

// --- the lane-count fixtures ------------------------------------------------
//
// Round K6. Eugene's decision of 09-18 is that the number of lanes belongs to
// the style, and it is only true if nothing downstream assumes a number — which
// neither strategy can prove, because both have the same twelve. So two styles
// that exist only to be counted (`tools/lane-fixtures.ts`, in no bundle and
// named by no strategy) are **planned and compiled in node** and their programs
// are handed to the page to be **rendered offline through the real graph**.
// A program is values all the way down, so it crosses the bridge as JSON and
// the page needs no style of theirs at all.
//
// What is asserted is the thing a lane count can break: a finite, non-silent
// buffer of the length the program says, and **every lane of the table
// audible** — the peak of each lane's own layer, read from a render with only
// that layer sounding, above a floor.
const LANE_FIXTURES = Object.entries(FIXTURES).map(([name, style]) => {
  const track = planTheme('16', 0, { preset: 'auto', style, themeBars: 32 });
  const program = JSON.parse(JSON.stringify(programOf(track)));
  const drawn = laneVoices(style, track.seed, biasFor(null, style));
  // Who is playing each lane, asked the way the composer asks it, and how many
  // events that instrument really wrote. A lane with no events is not a fault —
  // the glue is a chance inside a chance and a mined hat mask may leave nothing
  // between its offbeats — but a lane that sounded and then rendered silence is.
  const lanes = style.lanes.map((l) => {
    const voice = l.voices ? drawn[l.id] : voicePlaying(l.gate, track.dice[l.timbre]);
    return { id: l.id, voice, n: program.events.filter((e) => e.voice === voice).length };
  });
  const sounding = lanes.filter((l) => l.n);
  return {
    name, lanes: style.lanes.length, sounding: sounding.length,
    sampleRate: PLAN.sampleRate,
    program,
    layers: [...new Set(sounding.map((l) => (program.events.find((e) => e.voice === l.voice) || {}).layer))].filter(Boolean),
    silent: lanes.filter((l) => !l.n).map((l) => `${l.id}/${l.voice}`),
    events: program.events.length,
    seconds: program.duration,
  };
});

// What the page does with one: render it whole, and then once per layer with
// only that layer's events in it, so "the lane sounded" is a measurement and
// not an event count. Each of those renders is a job of its own (`part` is
// null for the whole, or the layer), because a fixture is twelve renders of a
// seventy-eight-second program and, as one job, it was the longest thing in
// the suite by twice; split, the renders spread over the pool like any other.
const RENDER_PART = async (job) => {
  const meter = await import('../tools/meter.ts');
  const program = job.part == null ? job.program : { ...job.program, events: job.program.events.filter((e) => e.layer === job.part) };
  const buf = await window.deepHouse.renderProgram(program, { sampleRate: job.sampleRate });
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let bad = 0;
  for (let i = 0; i < L.length; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) bad++;
  return { seconds: +(L.length / job.sampleRate).toFixed(3), peak: +meter.samplePeak([L, R]).toFixed(5), bad };
};

// --- the machine view's meters are not in the record ------------------------
//
// **The gate that says the view is inert** (`notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` §2).
// The view hangs an `AnalyserNode` off each of the five buses and off the set's
// last node, and the claim it stands on is that a node connected to an analyser
// and to nothing else sums exactly as it summed before. That is a claim about
// the engine and not about our intentions, so it is measured: one window of
// real music is rendered **twice through the same graph** — once plain, once
// with `attachTaps` hung on it through `renderProgram`'s `onGraph`, which
// exists for this and for nothing else — and the two buffers have to be byte
// for byte the same.
//
// It is the *same* `attachTaps` the view calls, off the page's own surface. A
// gate that attached analysers of its own would have proved something about
// analysers and nothing about the view.
//
// Eight bars of seed 1 rather than a whole theme: it is the same arithmetic at
// every length, three renders of it cost a few seconds, and a suite that takes
// a minute longer is a suite somebody stops running.
//
// **What each engine can actually prove.** Firefox renders the same program
// twice sample for sample, so there it is byte identity and nothing weaker.
// Chromium does *not*: measured here, two plain renders of this window differ
// by up to 8.2e-7 with nothing attached at all, which is the engine's own
// arithmetic and not ours. So an engine that repeats itself is held to being
// byte-identical, and one that does not is held to the spread it has with
// nothing attached — which is the honest ceiling on what a measurement can say
// there, and is the shape the effects' bypass gate already takes for the same
// reason.
//
// **And an absolute floor under the relative one** (09-20). Chromium's own
// spread is measured fresh every run and is sometimes near enough nought that
// four times it is nought: the icon round caught this gate red and then green
// on one build, minutes apart, with nothing changed — the engine's own floor
// 1.07e-6 and the tapped difference 1.53e-4 on the red run, 7.45e-7 and
// 1.07e-6 on the green (`rounds/icon-polish.md` §6). A gate that is a multiple
// of a number near nought is a coin. So the tolerance is the larger of the
// relative one and `TAPS_FLOOR`: a thousandth, which is -60 dBFS, two orders
// of magnitude over the red run's reading and two under what any tap that
// really touched the signal would cost — a gain of 0.99 in the path at this
// window's peak is 5e-3, a doubled connection 0.5. Firefox repeats itself
// exactly and its floor stays nought; the absolute floor is the only tolerance
// it gets, and byte identity is still what its line says when it holds.
//
// **Why Chromium did not repeat itself, found** (the suites' round of 09-24).
// The coin was not the renderer's arithmetic. Chromium switches a node off
// once every input it has has finished and on again when a note connects, the
// instant it notices is set by the page's main thread and not by the render,
// and a compressor, a filter or a delay line switched off and on does not
// carry on where it was. Twenty renders of this window with the page idle gave
// three different buffers, up to 5.9e-4 apart in the release tails after 37 s;
// ten with the main thread kept busy gave nine, up to 6.6e-3 apart. The
// engine's offline render now holds every door of the graph open with a
// source of exact nought (`holdOpen` in `packages/engine/src/scheduler.ts`),
// and the same twenty renders agree to 2.1e-6 idle and 2.0e-6 busy. What is
// left is Chromium summing three or more connections into one input in an
// order that is not the same from render to render — measured on three
// oscillators into one gain, with nothing of ours in the page — which is one
// or two float32 steps and is what the relative tolerance is for. The floor
// stays where it was: it is now five hundred times what the engine does on
// its own, and it never had to be moved to make this pass.
const TAPS_SPREAD = 4;
const TAPS_FLOOR = 1e-3;
const TAPS_JOB = (() => {
  const track = planTheme('1', 0, { preset: 'auto', themeBars: 8 });
  return { name: 'the view\'s taps', sampleRate: PLAN.sampleRate, program: JSON.parse(JSON.stringify(programOf(track))) };
})();

const RENDER_TAPPED = async (job) => {
  const read = (buf) => [buf.getChannelData(0), buf.getChannelData(1)];
  const render = (onGraph, sourceMix) => window.deepHouse.renderProgram(job.program, { sampleRate: job.sampleRate, onGraph, sourceMix });
  // **Three renders and not two**, because the question is not whether two
  // buffers are equal but whether the *taps* are what made them differ. The
  // same window rendered twice with nothing attached is the denominator — the
  // shape the effects' own bypass gate takes, for the same reason — and a
  // difference the taps cause has to be bigger than one the renderer causes on
  // its own before it is a difference the taps caused.
  const plain = read(await render());
  const again = read(await render());
  let taps = null;
  const tapped = read(await render((graph) => { taps = window.deepHouse.attachTaps(graph); }));
  const count = taps ? taps.count : 0;
  // A frame off the offline meters before they go, so what is proved inert is
  // a set of meters that were actually reading and not six idle nodes.
  const frame = taps ? taps.read() : null;
  if (taps) taps.dispose();
  // **The listening controls are not in the record either** (the page review
  // of 09-22, finding 1). Opening the machine view hands every deck and every
  // export a clean source mix, and a unity gain node in the path is not
  // transparent — Firefox read 448,395 samples different with one installed.
  // So the engine installs nothing for a clean state and retires what it had
  // when a state comes back to clean. Both are rendered here: a clean mix
  // handed to the render, and a graph whose mixer was built by a control that
  // moved and then taken out again by the control moving back.
  const clean = { mute: [], solo: [], dry: [] };
  let installed = false;
  const mixed = read(await render((graph) => {
    installed = graph.setSourceMix({ ...clean, mute: ['kick'] });
    graph.setSourceMix({ ...clean, gain: { kick: 1 } });
  }, clean));
  const compare = (A, B) => {
    let worst = 0;
    let at = -1;
    let differing = 0;
    for (let c = 0; c < 2; c++) {
      const a = A[c];
      const b = B[c];
      if (a.length !== b.length) return { lengths: [a.length, b.length] };
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        differing++;
        const d = Math.abs(a[i] - b[i]);
        if (d > worst) { worst = d; at = i; }
      }
    }
    return { worst, at, differing };
  };
  return {
    count,
    samples: plain[0].length,
    renderer: compare(plain, again),
    taps: compare(plain, tapped),
    mixer: { installed, ...compare(plain, mixed) },
    peak: Math.max(...plain.map((ch) => { let p = 0; for (let i = 0; i < ch.length; i++) { const v = ch[i] < 0 ? -ch[i] : ch[i]; if (v > p) p = v; } return p; })),
    meters: frame ? { buses: Object.keys(frame.buses).length, out: frame.out.peak, ceiling: frame.ceilingDb } : null,
  };
};

// --- the renders, as a pool of jobs -----------------------------------------
//
// **Every render is a job, and the jobs run side by side** (the suites' round
// of 09-24). A scene, each render of a lane fixture and the view's taps are
// independent offline renders, and an offline render is a function of its
// program and nothing else — the engine's `holdOpen` is what made that true of
// Chromium, whose output used to move with how busy the page's main thread
// was. So the two engines' browsers are launched together and `--jobs N`
// renders run at once over one queue, each in a page of its own (a page per
// slot per engine, made the first time the slot needs it, in a context of its
// own so it gets a process of its own), the longest first. What is printed
// does not depend on which job finished first: the readings are collected, and
// the lines are written afterwards in the order the serial suite always wrote
// them, so `--jobs 1` and the default print the same rows, byte for byte bar
// the milliseconds (which are wall time, and a busier machine has more of it).
//
// The default is `JOBS_DEFAULT`, measured on the machine this was written on;
// `--jobs 1` is the serial run.
const pending = []; // { engine, kind, cost, run(page) }
for (const engine of pw ? ENGINES : []) {
  for (const job of jobs) {
    // Seconds of audio rendered, as the cost: a window and its stem, or a set
    // up to its first seam.
    const seconds = job.source === 'mix' ? job.maxSeconds : 2 * ((job.bars || 8) + (job.prerollBars || 0)) * 2.4;
    pending.push({ engine, kind: 'scene', name: job.name, seconds, run: (page) => page.evaluate(MEASURE, job) });
  }
  for (const f of LANE_FIXTURES)
    for (const part of [null, ...f.layers])
      pending.push({ engine, kind: 'fixture', name: f.name, part, seconds: f.seconds, run: (page) => page.evaluate(RENDER_PART, { program: f.program, sampleRate: f.sampleRate, part }) });
  pending.push({ engine, kind: 'taps', name: TAPS_JOB.name, seconds: 4 * TAPS_JOB.program.duration, run: (page) => page.evaluate(RENDER_TAPPED, TAPS_JOB) });
}
// Chromium renders a second of this music about three times slower than
// Firefox does (measured: the nine scenes are 88 s in one and 27 in the other),
// so its jobs go to the front with the long ones.
const SLOWER = { chromium: 3, firefox: 1 };
pending.sort((x, y) => y.seconds * (SLOWER[y.engine] || 1) - x.seconds * (SLOWER[x.engine] || 1));

const browsers = {};
const pageErrors = {};
for (const engine of pw ? ENGINES : []) {
  if (!pw[engine]) { skip(`${engine} is not a browser playwright knows`); continue; }
  try {
    browsers[engine] = await pw[engine].launch(launchOptions(engine));
    pageErrors[engine] = [];
    readings[engine] = {};
  } catch (e) {
    skip(`the scenes were not rendered in ${engine}: it is not installed (${e.message.split('\n')[0].slice(0, 80)})`);
  }
}
const queue = pending.filter((p) => browsers[p.engine]);
const done = new Map(); // a pending job -> { value } or { error }
const setupFailed = {}; // engine -> the message, when its page never came up
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  const pages = {};
  const pageFor = async (engine) => {
    if (pages[engine]) return pages[engine];
    const context = await browsers[engine].newContext();
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors[engine].push(e.message));
    await page.goto(pageUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.deepHouse, { timeout: 30000 });
    return (pages[engine] = page);
  };
  for (let next = queue.shift(); next; next = queue.shift()) {
    if (setupFailed[next.engine]) continue;
    let page;
    try {
      page = await pageFor(next.engine);
    } catch (e) {
      setupFailed[next.engine] = setupFailed[next.engine] || e.message.split('\n')[0];
      continue;
    }
    try {
      done.set(next, { value: await next.run(page) });
    } catch (e) {
      done.set(next, { error: e.message.split('\n')[0] });
    }
  }
}));
for (const engine of Object.keys(browsers)) await browsers[engine].close();

// What each engine's jobs came back with, judged in the order the serial suite
// always judged them in: the scenes' renders (whose readings are held to their
// gates further down), then the lane fixtures, then the taps.
for (const engine of Object.keys(browsers)) {
  console.log(`  ${engine}`);
  if (setupFailed[engine]) { bad(`${engine}: ${setupFailed[engine]}`); continue; }
  const mine = pending.filter((p) => p.engine === engine);
  for (const job of jobs) {
    const got = done.get(mine.find((p) => p.kind === 'scene' && p.name === job.name));
    if (got && 'value' in got) readings[engine][job.name] = got.value;
    else bad(`${job.name} in ${engine}: the render did not run: ${got ? got.error : 'it was never reached'}`);
  }
  for (const job of LANE_FIXTURES) {
    const parts = mine.filter((p) => p.kind === 'fixture' && p.name === job.name).map((p) => ({ part: p.part, got: done.get(p) }));
    const missing = parts.find((p) => !p.got || 'error' in p.got);
    if (missing) {
      bad(`${job.name} in ${engine}: the fixture did not render: ${missing.got ? missing.got.error : 'it was never reached'}`);
      continue;
    }
    const whole = parts.find((p) => p.part == null).got.value;
    const r = { ...whole, bad: parts.reduce((n, p) => n + p.got.value.bad, 0), perLayer: Object.fromEntries(job.layers.map((l) => [l, parts.find((p) => p.part === l).got.value.peak])) };
    // A layer that rendered *nothing* is the fault; a quiet one is the level
    // table (the fixture room puts its sixteenths 60 dB down, which is the
    // record's own number and not this suite's business).
    const silent = Object.entries(r.perLayer).filter(([, pk]) => !(pk > 0)).map(([l]) => l);
    if (r.bad) bad(`${job.name} in ${engine}: ${r.bad} samples of the render are not finite`);
    else if (Math.abs(r.seconds - job.seconds) > 0.05) bad(`${job.name} in ${engine}: the render is ${r.seconds} s and the program says ${job.seconds.toFixed(3)}`);
    else if (r.peak < 1e-3) bad(`${job.name} in ${engine}: ${job.lanes} lanes rendered silence`);
    else if (silent.length) bad(`${job.name} in ${engine}: the lane layers ${silent.join(', ')} rendered nothing (${Object.entries(r.perLayer).map(([l, pk]) => `${l} ${pk}`).join(', ')})`);
    else ok(`${job.name.padEnd(11)} ${String(job.lanes).padStart(2)} lanes, ${job.sounding} sounding${job.silent.length ? ` (${job.silent.join(', ')} drew nothing)` : ''}, ${String(job.events).padStart(4)} events, ${r.seconds} s, peak ${r.peak}; every layer audible: ${job.layers.map((l) => `${l} ${r.perLayer[l]}`).join(', ')}`);
  }
  {
    const got = done.get(mine.find((p) => p.kind === 'taps'));
    if (!got || 'error' in got) bad(`the view's taps in ${engine}: the render did not run: ${got ? got.error : 'it was never reached'}`);
    else {
      const r = got.value;
      const seconds = (r.samples / TAPS_JOB.sampleRate).toFixed(1);
      const floor = r.renderer && r.renderer.worst ? r.renderer.worst : 0;
      const how = (c) => `${c.differing} of ${r.samples * 2} samples, worst ${c.worst}${c.at >= 0 ? ` at ${c.at}` : ''}`;
      if (r.taps && r.taps.lengths) bad(`the view's taps in ${engine}: the two renders are ${r.taps.lengths[0]} and ${r.taps.lengths[1]} samples long`);
      else if (!r.count) bad(`the view's taps in ${engine}: no tap was attached, so nothing was proved`);
      else if (!(r.peak > 0.01)) bad(`the view's taps in ${engine}: the window rendered silence, so nothing was proved`);
      else if (r.taps.worst > Math.max(TAPS_FLOOR, floor * TAPS_SPREAD)) bad(`the view's taps in ${engine}: the tapped render differs by ${r.taps.worst} at sample ${r.taps.at} of ${r.samples}, `
        + `where the same window rendered twice with nothing attached differs by ${floor} (${how(r.renderer)}) and the floor under that is ${TAPS_FLOOR}`);
      else if (r.taps.differing > Math.max(64, r.renderer.differing * TAPS_SPREAD)) bad(`the view's taps in ${engine}: ${how(r.taps)} differ with the taps on, `
        + `against ${how(r.renderer)} with nothing attached`);
      else if (!r.mixer.installed) bad(`the view's source controls in ${engine}: a mute did not build the mixer, so nothing was proved`);
      else if (r.mixer.lengths || (floor === 0 ? r.mixer.worst !== 0 : r.mixer.worst > Math.max(TAPS_FLOOR, floor * TAPS_SPREAD))) bad(`the view's source controls in ${engine}: `
        + `a clean mix, and a mixer built and returned to clean, render ${r.mixer.lengths ? `${r.mixer.lengths} samples long` : how(r.mixer)} away from the plain render, against ${how(r.renderer)} with nothing attached`);
      else ok(`the view's taps in ${engine}: ${r.count} meters attached to a render of ${seconds} s at peak ${r.peak.toFixed(4)}, `
        + `reading ${r.meters ? `${r.meters.buses} buses and an output at ${r.meters.out} dBFS against a ${r.meters.ceiling} dBFS ceiling` : 'nothing'} — `
        + (floor === 0 && r.taps.worst === 0
          ? `and the buffer is byte for byte the one rendered without them, over ${r.samples * 2} samples`
          : `and the buffer is no further from the untapped one than this engine's own two renders of it are from each other — `
            + `this engine does not repeat itself, so byte identity is not a thing that can be measured in it: `
            + `with the taps on, ${how(r.taps)}; with nothing attached at all, ${how(r.renderer)}; the tolerance is the larger of ${TAPS_SPREAD}x that and ${TAPS_FLOOR}`)
        + `; and a clean source mix with a mixer built by a mute and returned to clean renders ${r.mixer.worst === 0 ? 'byte for byte the plain buffer' : how(r.mixer)}`);
    }
  }
  if (pageErrors[engine].length) bad(`page errors in ${engine}: ${pageErrors[engine].join(' | ')}`);
}

// --- what a reading has to satisfy -----------------------------------------
const pct = (x) => `${Math.round(x * 100)}%`;
const worstBand = (a, b) => {
  let d = 0, at = 0;
  a.forEach((v, i) => { const x = Math.abs(v - b[i]); if (x > d) { d = x; at = i; } });
  return { d, at };
};
const legacySummary = (r) => ({
  sampleRate: PLAN.sampleRate,
  seconds: r.seconds,
  events: r.events,
  bpm: r.bpm,
  bands: r.bands,
  lufs: r.lufs,
  truePeak: r.truePeak,
  peak: r.peak,
  worstClick: r.both.reduce((a, c) => (c.step > a.step ? c : a), { step: 0 }),
});

if (BLESS) fs.mkdirSync(REF_DIR, { recursive: true });

for (const engine of Object.keys(readings)) {
  const { THIRDS } = await import('@deep-house/engine/meter');
  for (const job of jobs) {
    const r = readings[engine][job.name];
    if (!r) continue;
    const say = [];
    const before = failed;
    const fail = (why) => bad(`${job.name.padEnd(18)} ${engine}: ${why}`);

    // The ceilings, whatever any reference says.
    if (r.truePeak > G.truePeakCeilingDbTP) fail(`true peak ${r.truePeak} dBTP is over the ${G.truePeakCeilingDbTP} dBTP gate`);
    if (r.peak > G.samplePeakCeilingDbFS) fail(`sample peak ${r.peak} dBFS is over the ${G.samplePeakCeilingDbFS} dBFS gate`);
    if (r.truePeak < r.peak - 0.01) fail(`the meter reads a true peak of ${r.truePeak} dBTP under its own sample peak of ${r.peak} dBFS`);

    // The kick and bass stem, as arithmetic.
    if (r.stem) {
      const sided = r.stem.sided.reduce((a, c) => (c.step > a.step ? c : a), { step: 0, side: 'neither' });
      if (r.stem.gap > G.monoTolerance || sided.step > G.monoTolerance)
        fail(`the kick and bass stem is not mono: the channels differ by ${r.stem.gap} at ${r.stem.gapAt} s and the worst hit moves ${sided.step} in the ${sided.side} alone (limit ${G.monoTolerance})`);
      say.push(`mono ${r.stem.gap}`);
    }

    // The click gate. The absolute number belongs to a lone kick, in either
    // engine: it is a sine on a bus that is mono and its one-sample move is
    // arithmetic. Every other hit is held to the ratio, because a lone hat is
    // a pre-rendered noise burst that reads 0.06 to 0.08 in Chromium and 1.7x
    // that in Firefox, and that is a timbre and not a step.
    const worstClick = r.both.reduce((a, c) => (c.step > a.step ? c : a), { step: 0 });
    const loneKick = r.both.filter((c) => c.alone && c.voice === 'kick')
      .reduce((a, c) => (c.step > a.step ? c : a), { step: 0 });
    // A reading this list already knows about, written down in scenes.json
    // with why it is there. It is pinned, not waived: it may not grow.
    const known = (job.knownClick || {})[engine] || null;
    const clicked = r.both.filter((c) =>
      ((c.alone && c.voice === 'kick' && c.step > G.clickStep) ||
       (c.step > G.clickStep && c.ratio > G.clickRatio)) &&
      !(known && c.step <= known.step + 0.01));
    if (clicked.length)
      fail(`a click: ${clicked[0].voice} at ${clicked[0].t} s moves ${clicked[0].step} in one sample, ${clicked[0].ratio}x its neighbours${clicked[0].alone ? ', with nothing else on it' : ''}`);
    say.push(`click ${worstClick.step}/${worstClick.ratio}x`);
    say.push(`lone kick ${loneKick.step}`);
    if (known && worstClick.step > G.clickStep) say.push(`KNOWN ${known.step}`);

    // The limiter. The stated ceiling is the outer net; the blessed share is
    // the gate that moves when the mix does.
    if (r.limiter.share > G.limiterOver1dBShare)
      fail(`the limiter took over a decibel off ${pct(r.limiter.share)} of the window (ceiling ${pct(G.limiterOver1dBShare)}), worst ${r.limiter.worst} dB`);
    say.push(`lim ${pct(r.limiter.share)}/${r.limiter.worst}dB`);

    // Loudness by section kind. Chromium's, because a drop and a main do not
    // move by the same amount between engines.
    if (job.kind === 'main' && engine === 'chromium') {
      const d = Math.abs(r.lufs - G.mainLufs);
      if (d > G.mainLufsTolerance)
        fail(`a main groove at ${r.lufs} LUFS is ${d.toFixed(2)} LU from ${G.mainLufs} (band ${G.mainLufsTolerance})`);
    }
    if (job.against && engine === 'chromium') {
      const m = readings[engine][job.against];
      if (!m) fail(`there is no reading of ${job.against} to measure it against`);
      else {
        const over = r.lufs - m.lufs;
        const limit = job.kind === 'drop' ? G.dropOverMainsLU : G.breakdownOverMainsLU;
        if (over > limit)
          fail(`a ${job.kind} at ${r.lufs} LUFS sits ${over.toFixed(2)} LU over its theme's mains at ${m.lufs} (limit ${limit})`);
        say.push(`${over >= 0 ? '+' : ''}${over.toFixed(2)} LU on mains`);
      }
    }

    // The seam a mix scene landed on has to be the one the plan predicted.
    if (job.predicted) {
      const s = r.seams[0];
      const d = Math.abs(s.at - job.predicted.at);
      if (d > 0.01 || Math.abs(s.swapAt - job.predicted.swapAt) > 0.01 || s.bars !== job.predicted.bars)
        fail(`the render's first seam is ${s.bars} bars at ${s.at.toFixed(3)} s swapping at ${s.swapAt.toFixed(3)}, where the plan says ${job.predicted.bars} bars at ${job.predicted.at.toFixed(3)} swapping at ${job.predicted.swapAt.toFixed(3)}`);
      else say.push(`seam bar ${job.predicted.bar} at ${s.at.toFixed(1)} s, swap +${(s.swapAt - s.at).toFixed(1)} s`);
    }

    // The blessed envelope.
    const file = refFile(job.name, engine);
    const summary = {
      scene: job.name, engine, kind: job.kind, sampleRate: PLAN.sampleRate,
      seconds: r.seconds, events: r.events, bpm: r.bpm,
      bands: r.bands, lufs: r.lufs, truePeak: r.truePeak, peak: r.peak,
      limiterOver1dBShare: r.limiter.share,
      worstClick,
    };
    if (BLESS) {
      fs.writeFileSync(file, JSON.stringify(summary, null, 1) + '\n');
      if (job.legacy && engine === 'chromium' && BLESS_LEGACY)
        fs.writeFileSync(path.join(HERE, job.legacy), JSON.stringify(legacySummary(r), null, 1) + '\n');
      say.push('blessed');
    } else if (!fs.existsSync(file)) {
      fail(`no blessed envelope at ${path.relative(ROOT, file)}; run node tools/test.ts --bless once`);
    } else {
      const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
      const w = worstBand(r.bands, ref.bands);
      if (w.d > G.bandTolerance) fail(`the third-octave band at ${THIRDS[w.at]} Hz moved ${w.d.toFixed(2)} dB (limit ${G.bandTolerance})`);
      if (Math.abs(r.lufs - ref.lufs) > G.lufsTolerance) fail(`loudness ${r.lufs} LUFS is ${Math.abs(r.lufs - ref.lufs).toFixed(2)} LU from the blessed ${ref.lufs}`);
      if (Math.abs(r.truePeak - ref.truePeak) > G.peakTolerance) fail(`true peak ${r.truePeak} dBTP is ${Math.abs(r.truePeak - ref.truePeak).toFixed(2)} dB from the blessed ${ref.truePeak}`);
      if (Math.abs(r.peak - ref.peak) > G.peakTolerance) fail(`sample peak ${r.peak} dBFS is ${Math.abs(r.peak - ref.peak).toFixed(2)} dB from the blessed ${ref.peak}`);
      if (typeof ref.limiterOver1dBShare === 'number' && Math.abs(r.limiter.share - ref.limiterOver1dBShare) > G.limiterShareTolerance)
        fail(`the limiter is over a decibel for ${pct(r.limiter.share)} of the window where it was blessed at ${pct(ref.limiterOver1dBShare)} (band ${Math.round(G.limiterShareTolerance * 100)} points)`);
      say.push(`band ${w.d.toFixed(2)}`);
      // And seed 1's opening is still the reading the file it has always lived
      // in says it is, field for field.
      if (job.legacy && engine === 'chromium') {
        const legacy = path.join(HERE, job.legacy);
        if (!fs.existsSync(legacy)) fail(`${job.legacy} is missing, and it is a committed file`);
        else {
          const old = JSON.parse(fs.readFileSync(legacy, 'utf8'));
          const lw = worstBand(r.bands, old.bands);
          const moved = [];
          if (lw.d > G.bandTolerance) moved.push(`the band at ${THIRDS[lw.at]} Hz by ${lw.d.toFixed(2)} dB`);
          if (Math.abs(r.lufs - old.lufs) > G.lufsTolerance) moved.push(`loudness by ${(r.lufs - old.lufs).toFixed(2)} LU`);
          if (Math.abs(r.truePeak - old.truePeak) > G.peakTolerance) moved.push(`true peak by ${(r.truePeak - old.truePeak).toFixed(2)} dB`);
          if (Math.abs(r.peak - old.peak) > G.peakTolerance) moved.push(`sample peak by ${(r.peak - old.peak).toFixed(2)} dB`);
          if (old.events !== r.events || old.bpm !== r.bpm || Math.abs(old.seconds - r.seconds) > 0.002)
            moved.push(`the window itself: ${old.events} events of ${old.seconds} s at ${old.bpm} BPM, now ${r.events} of ${r.seconds} at ${r.bpm}`);
          if (moved.length) fail(`${job.legacy} no longer describes this render: ${moved.join('; ')}`);
          else say.push(`= ${job.legacy}`);
        }
      }
    }
    console.log(`  ${failed === before ? 'ok  ' : '....'}  ${job.name.padEnd(18)} ${String(job.kind).padEnd(9)} ${String(r.lufs).padStart(7)} LUFS  ${String(r.truePeak).padStart(6)} dBTP  ${String(r.peak).padStart(6)} dBFS  ${say.join('  ')}  (${r.engineMs} ms)`);
  }
}

server.close();
finish({ failed, skipped });
