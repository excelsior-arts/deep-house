// The test suite: the plans are locked, and so is the sound.
//
//   npm test                          run everything below
//   node tools/test.mjs --bless       rewrite the blessed envelopes from the current sound
//   node tools/test.mjs --bless-legacy   and tools/reference-seed1.json with them
//   node tools/test.mjs --scene <name>   one scene, by name
//   node tools/test.mjs --engines chromium   fewer engines, for a fast loop
//   node tools/test.mjs --allow-skip  accept a missing browser tool
//   node tools/test.mjs --site <dir>  meter a build other than docs/
//
//   1. the golden plans (tools/golden.mjs --check)
//   2. the meters themselves (tools/meter.mjs --selftest): an instrument is
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
//   the events outside it are still handed to the render, with no voice. That
//   is what `develop()` reads — a four-bar block of a layer as a string, and
//   the bars since each layer last played something it had not played in the
//   last sixteen — so the window is staged against the theme's real history.
//   `fireEvent` looks its voice up in VOICES and returns when there is none,
//   so not one node is built for them. Without this, seed 15576's minimal room
//   measured 4.48 dB out in a band: a window on its own looks like a theme in
//   which nothing has held long enough to be moved to the back of the stage.
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
// What is metered is the built site: `npm test` runs the build first and this
// serves docs/ on port 6977 (or borrows a server already there), so what is
// listened to is the bundle that ships and not the loose modules. A borrowed
// server is asked to prove it is serving this build before a note is rendered.
// Nothing here can be heard: an OfflineAudioContext has no output device, and
// the page is opened with the silent route besides.
//
// Playwright is borrowed from one of two documented places and is not a
// dependency of the page. When it is in neither the sound is not checked, and
// that is a skip: the run ends non-zero unless --allow-skip says the gap is
// wanted.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, PORT, siteDir, serve, servedIsUnderTest, playwright, finish, pageUrl, launchOptions } from './harness.mjs';
import { setLayout } from './setplan.mjs';

const BLESS = process.argv.includes('--bless');
// tools/reference-seed1.json is Eugene's blessed reading and this suite only
// ever checks it. Re-writing it is a second, deliberate word.
const BLESS_LEGACY = process.argv.includes('--bless-legacy');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ENGINES = arg('engines', 'chromium,firefox').split(',').filter(Boolean);
const ONLY = arg('scene', null);

const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'scenes.json'), 'utf8'));
const G = PLAN.gates;
const SCENES = PLAN.scenes.filter((s) => !ONLY || s.name === ONLY);
const REF_DIR = path.join(ROOT, 'tools', 'reference');
const refFile = (scene, engine) => path.join(REF_DIR, `${scene}-${engine}.json`);

let failed = 0;
const skipped = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => { failed++; console.log(`  FAIL  ${msg}`); };
const skip = (msg) => { skipped.push(msg); console.log(`  skip  ${msg}`); };

// --- 1. the plans -----------------------------------------------------------
console.log('golden plans');
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'golden.mjs'), '--check'], { encoding: 'utf8' });
  ok(out.trim().split('\n').pop());
} catch (e) {
  bad(`the generator moved: ${(e.stdout || e.message).toString().trim().split('\n').pop()}`);
}

// --- 2. the meters ----------------------------------------------------------
// The true peak used to be read from a convolution that started once the
// filter was full and stopped at the last sample, so a hit at either end of a
// buffer was invisible to it. What the instrument says about signals whose
// answer is known on paper is checked before it is pointed at the music.
console.log('the meters');
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'meter.mjs'), '--selftest'], { encoding: 'utf8' });
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
  // A voice name no voice has: `fireEvent` looks the name up in VOICES and
  // returns when it finds nothing, so an event carrying this is read by
  // develop() and built by nobody.
  const MUTE = 'silent:not-in-window';
  const HITS = ['kick', 'hatClosed', 'hatOpen', 'shaker'];
  const rate = job.sampleRate;
  const meter = await import('../tools/meter.mjs');
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

  // One window of one theme, with everything outside it handed over voiceless.
  const window1 = (track, fromBar, bars, only) => {
    const bs = track.barSeconds;
    const preBar = Math.max(0, fromBar - job.prerollBars);
    const tp = preBar * bs;
    const t0 = fromBar * bs;
    const t1 = (fromBar + bars) * bs;
    const automation = {};
    for (const k of Object.keys(track.automation || {})) {
      const v = track.automation[k];
      automation[k] = Array.isArray(v) ? v.map((p) => ({ ...p, t: p.t - tp })) : v;
    }
    const sounding = [];
    const events = track.events.map((e) => {
      const inside = e.t >= tp && e.t < t1 && (!only || only.includes(e.layer));
      if (!inside) return { ...e, voice: MUTE, t: 0 };
      const ev = { ...e, t: e.t - tp };
      sounding.push(ev);
      return ev;
    });
    return { slice: { ...track, duration: t1 - tp + job.tailSeconds, events, automation }, sounding, from: t0 - tp, bs };
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
    await new Promise((r) => setTimeout(r, 80));
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
    const w = window1(track, job.fromBar, job.bars, null);
    watch();
    const buf = await window.deepHouse.renderTrack(w.slice, { sampleRate: rate });
    window.AudioWorkletNode = Orig;
    await new Promise((r) => setTimeout(r, 80));
    const { L, R } = read(buf, Math.round(w.from * rate));
    // The kick and the bass share one bus and that bus is mono, so their stem
    // has no side at all. There is no threshold to argue about: it is
    // arithmetic, and before the patch it read 0.5235 in Firefox.
    const sw = window1(track, job.fromBar, job.bars, ['kick', 'bass']);
    const sbuf = await window.deepHouse.renderTrack(sw.slice, { sampleRate: rate });
    const s = read(sbuf, Math.round(sw.from * rate));
    const sc = clicksOf(s.L, s.R, sw.sounding, sw.from);
    out = {
      ...out,
      duration: +buf.duration.toFixed(3),
      seconds: +(L.length / rate).toFixed(3),
      bpm: track.bpm,
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

// --- 3. the scenes ---------------------------------------------------------
console.log(`the scenes: ${SCENES.length} of them, in ${ENGINES.join(' and ')}`);
const site = siteDir();
const server = await serve(site);
// The meters are read from the page, so they are part of what has to be
// answering: the identity check asks for them by name as well as for the build.
const served = await servedIsUnderTest(site, ['tools/meter.mjs']);
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

for (const engine of pw ? ENGINES : []) {
  if (!pw[engine]) { skip(`${engine} is not a browser playwright knows`); continue; }
  let browser = null;
  try {
    browser = await pw[engine].launch(launchOptions(engine));
  } catch (e) {
    skip(`the scenes were not rendered in ${engine}: it is not installed (${e.message.split('\n')[0].slice(0, 80)})`);
    continue;
  }
  console.log(`  ${engine}`);
  readings[engine] = {};
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(pageUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.deepHouse, { timeout: 30000 });
    for (const job of jobs) {
      try {
        const r = await page.evaluate(MEASURE, job);
        readings[engine][job.name] = r;
      } catch (e) {
        bad(`${job.name} in ${engine}: the render did not run: ${e.message.split('\n')[0]}`);
      }
    }
  } catch (e) {
    bad(`${engine}: ${e.message.split('\n')[0]}`);
  }
  if (errors.length) bad(`page errors in ${engine}: ${errors.join(' | ')}`);
  await browser.close();
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
  const { THIRDS } = await import('./meter.mjs');
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
        fs.writeFileSync(path.join(ROOT, 'tools', job.legacy), JSON.stringify(legacySummary(r), null, 1) + '\n');
      say.push('blessed');
    } else if (!fs.existsSync(file)) {
      fail(`no blessed envelope at ${path.relative(ROOT, file)}; run node tools/test.mjs --bless once`);
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
        const legacy = path.join(ROOT, 'tools', job.legacy);
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
