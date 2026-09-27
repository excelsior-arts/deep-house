// The six above middle C, each alone against its own declared numbers.
//
//   node tools/test-voices.ts                 the whole suite, about 90 s
//   node tools/test-voices.ts --only sawLead  one of them, for a fast loop
//   node tools/test-voices.ts --ab            the shaper's oversample, per engine
//   node tools/test-voices.ts --bless         write the measured loudness into
//                                              the modules (only with Eugene's say-so)
//   node tools/test-voices.ts --knobs         PLAN-MODULATION M1's own pass: every
//                                              declared knob at its two ends, in both
//                                              engines and at both rates
//   node tools/test-voices.ts --knobs --bless  write the measured slopes
//   node tools/test-voices.ts --controls      the note controls' pass: every
//                                              declared control at its default
//                                              (the same samples as none) and at
//                                              its two ends (clean, and live)
//
// Round K2 of PLAN-KITCHEN. It is round G's per-instrument scene, six times
// over, and it is a file of its own rather than six more cases in `test.ts`
// for one reason: `test.ts` is the machine's suite and another agent is inside
// it this round. What it holds each voice to is what round G held the plucked
// mid bass to, because a fixture allowed to be louder or clickier than the
// record proves nothing:
//
//   the loudness    the voice alone through the real graph, eight bars of its
//                   role's own figure at 120 BPM with two bars of pre-roll
//                   thrown away, integrated, less the level the fixture's table
//                   gave it — within a decibel of the number its own module
//                   declares, in both engines and at both rates.
//   the peaks       a true peak at or under -1 dBTP and a sample peak at or
//                   under -1 dBFS.
//   the clicks      the scenes' own gate: a move over 0.05 in one sample *and*
//                   eight times its own neighbours.
//   the width       what the descriptor says. A voice that declares `mono` has
//                   to be mono to the sample; a voice that does not has to
//                   actually have two channels, because `mono: false` on a
//                   voice whose channels are identical is a claim about the
//                   sound that is not true.
//   finite          not one sample that is not a number.
//
// And three things that are this round's own:
//
//   the tuning      the Karplus string is arithmetic rather than a graph of
//                   nodes, so its pitch is checkable in node, with no browser
//                   and no audio context at all — and it is, at six pitches
//                   across the range, against the note it was asked for.
//   the hold        the two pads that hold, against the contract: holding,
//                   paused, back at the level they were holding at, released
//                   over their own stated tail, and gone.
//   the oversample  the one shaper this round adds, at `none`, `2x` and `4x`
//                   in both engines, because round G found four decibels
//                   between two engines' up-samplers and a declared loudness
//                   cannot be built on one.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice, finish } from './harness.ts';
import { INSTRUMENTS } from '../src/params.ts';
import { stringBuffer } from '../src/voices/karplus-pluck.ts';
import { midiToHz } from '../src/dsp.ts';
import { K2, missingScenes } from './audition-voices.ts';
import { REGISTRY, VOICE_KNOBS, knobFaultsOfAll, knobReadout, controlFaultsOfAll } from '../src/voices/index.ts';
import { PIANO_MEASURED } from '../src/voices/piano.ts';
import type { KnobSpec } from '../src/voices/descriptor.ts';
import { COVERED, coverage } from './tables.ts';
import type { PlaywrightFound } from './harness.ts';
import type { Program, ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { Audition } from './audition.ts';
import type { HeldVoice } from '../src/voices/voice-contract.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };
// Above the suites' 6977 and beside the engine suite's 7023 and the ear's 7024,
// and never 6975, which is Eugene's.
const PORT = 7045;

const arg = (k: string, d: string | null = null): string | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ONLY = arg('only');
const BLESS = process.argv.includes('--bless');
const AB = process.argv.includes('--ab');
const KNOBS = process.argv.includes('--knobs');
const CONTROLS = process.argv.includes('--controls');
// Which seasoned voice to meter, for a fast loop while a range is being narrowed.
const KNOB_ONLY = arg('knob-only');
const VERBOSE = process.argv.includes('--verbose');
const ENGINES = (arg('engines') || 'chromium,firefox').split(',');
const RATES = (arg('rates') || '44100,48000').split(',').map(Number);
// The six of round K2, and two more held to the same scene: the piano, whose
// declared loudness was typed from an older measurement and moved when the
// hammer's channel change stopped resetting its filter (the engine review of
// 09-22, finding 1), and the wordless vocal, registered with its facts typed
// (finding 5). Neither has a better gate than this one: the voice alone on its
// fixture through the real graph, in both engines at both rates.
const GATED = [...K2, 'piano', 'wordlessVocal'];
/** A scene held to a number of its own rather than to the timbre's `loudnessDb`. */
const SCENE_DECLARED: Record<string, number> = { piano: PIANO_MEASURED.piano.sceneDb };
/** ...and the field `--bless` writes it into. */
const BLESS_FIELD: Record<string, string> = { piano: 'sceneDb' };
const WANT = GATED.filter((id) => !ONLY || id === ONLY);
/** Which voices declare `mono`, read once so the knob pass holds an end to the same width the scene is held to. */
const BY_NAME_MONO: Record<string, boolean> = Object.fromEntries(REGISTRY.map((d) => [d.name, d.mono]));

let failed = 0;
const skipped: string[] = [];
const ok = (what: string): void => console.log(`  ok    ${what}`);
const bad = (what: string): void => { failed++; console.log(`  FAIL  ${what}`); };
const must = (cond: boolean, why: string, what: string): void => (cond ? ok(what) : bad(why));

// The gates, and they are the nine scenes' own.
const GATES = {
  truePeakDbTP: -1,
  samplePeakDbFS: -1,
  clickStep: 0.05,
  clickRatio: 8,
  monoTolerance: 0.0002,
  loudnessBandDb: 1.0,
  // What a resume has to come back within. Round G held `holdStrings` to half a
  // decibel over a four-second window, and the formant pad cannot be: its vowel
  // walks a whole cycle in twenty-two seconds, so two four-second windows ten
  // seconds apart are two different vowels and the level is legitimately
  // different. MEASURED: the resume reads 0.61 dB over the hold on a voice
  // whose own drift moves it by that much inside one window, and the supersaw
  // beside it — whose drift is six cents at a fourteenth of a Hertz — reads
  // 0.25. A decibel is the band, and what it is holding is what the contract
  // actually promises: the drone came back, and at the level it was holding at.
  holdBandDb: 1.0,
  centsBand: 1.0,
  // What a filter or a shaper may leave behind at a knob's end. The scenes have
  // never measured one; a knob that moves a corner or a drive can, and a DC
  // offset is headroom spent on nothing.
  knobDc: 0.001,
  // How far the loudness model may be wrong over a knob's whole travel.
  knobSlopeDb: 0.5,
  // How much further a knob's end may peak than the fixture itself does.
  knobPeakSlackDb: 0.1,
  // How far a render at every knob's default may be from one with no knob on
  // it at all, in difference RMS, against the same engine's own spread over two
  // identical renders — the multiplier the engine is allowed over itself.
  knobSpread: 1.25,
  // ...and the floor under that, because a spread that reads nought over one
  // pair of renders is not proof the engine is reproducible on that run. It is
  // MEASURED: Firefox read byte-identical on eleven of twelve readings of this
  // pass and on six of six when nothing else was rendering, and the twelfth —
  // taken while five other voices were being metered — came back at 1.13e-8 of
  // difference RMS, which is -157 dBFS and four float32 steps on the worst
  // sample. This is an order of magnitude over that, and it is eighty decibels
  // under the smallest difference any real knob makes.
  knobIdentityRms: 1e-7,
};

// --- 1. node: the table, and a string that is in tune ------------------------
console.log('the fixtures, without a browser');

// Round K4's one-line fix, which round K3 wrote out and could not apply:
// `missingScenes` walks the whole registry, and with a second fixture table
// beside this one the sixteen instruments of the drum kitchen read as sixteen
// faults — a true statement about this table and a false one about the tree.
// `tools/tables.ts` is the one list of the tables; what is asserted is that
// **no** table plays a registered voice and no row names a voice nobody
// registered.
must(
  !missingScenes(COVERED).length,
  `the scene tables and the registry disagree: ${missingScenes(COVERED).join(', ')}`,
  `every registered voice has a fixture and every fixture names a registered voice: ${coverage()}`
);

// --- the knob contract, before a sample is rendered ------------------------
//
// PLAN-MODULATION M1. What a knob **declares** is checkable with no browser at
// all — the unit and the bird are closed vocabularies, the ends have to be the
// right way round, the default has to sit between them, and the slope has to
// have been measured. What a knob *does* is a render, and that is `--knobs`
// below.
{
  const faults = knobFaultsOfAll();
  must(!faults.length, `the knob contract: ${faults.join('; ')}`, `every declared knob is well formed: ${knobReadout()}`);
}

// The Karplus string is a few thousand multiplies and a Float32Array, so its
// pitch can be measured in node with no audio context at all: the only thing
// `stringBuffer` asks of a context is its sample rate and somewhere to put the
// samples. That is the whole argument for computing the loop rather than
// building it out of nodes, stated as a test.

/** The four things `stringBuffer` reads off the buffer a context hands it. */
interface StringBuffer {
  length: number;
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  getChannelData(c: number): Float32Array;
}

/**
 * And the two things it asks the context itself for. Naming them is what makes
 * the claim above checkable rather than asserted: what follows satisfies this
 * interface and builds no node at all.
 */
interface StringContext {
  sampleRate: number;
  createBuffer(channels: number, length: number): StringBuffer;
}

const fakeCtx = (sampleRate: number): StringContext => ({
  sampleRate,
  createBuffer(channels: number, length: number): StringBuffer {
    const data: Float32Array[] = [];
    for (let c = 0; c < channels; c++) data.push(new Float32Array(length));
    return { length, sampleRate, duration: length / sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
  },
});

/** The fundamental of a stretch of samples, by autocorrelation with a parabolic peak. */
function pitchOf(x: Float32Array, sr: number, about: number): number {
  const a = x.subarray(Math.round(0.15 * sr), Math.round(0.45 * sr));
  const lo = Math.max(2, Math.floor(sr / (about * 1.2)));
  const hi = Math.ceil(sr / (about * 0.83));
  const ac = [];
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i < a.length - lag; i++) s += a[i] * a[i + lag];
    ac.push(s / (a.length - lag));
  }
  let k = 0;
  for (let i = 1; i < ac.length; i++) if (ac[i] > ac[k]) k = i;
  let lag = lo + k;
  if (k > 0 && k < ac.length - 1) {
    const d = (ac[k - 1] - ac[k + 1]) / (2 * (ac[k - 1] - 2 * ac[k] + ac[k + 1]));
    if (Number.isFinite(d)) lag += d;
  }
  return sr / lag;
}

{
  const K = INSTRUMENTS.karplusPluck;
  const worst = { cents: 0, midi: 0, rate: 0 };
  const read = [];
  for (const rate of RATES) {
    const ctx = fakeCtx(rate);
    for (const midi of [55, 60, 67, 72, 79, 84]) {
      // `stringBuffer` asks for a whole `BaseAudioContext` because every other
      // voice in the folder is handed one; this one is a context in the only two
      // ways that function uses one, which is the point being made.
      const buf = stringBuffer(ctx as unknown as BaseAudioContext, midi, 0.8, K);
      const hz = midiToHz(midi);
      const cents = 1200 * Math.log2(pitchOf(buf.getChannelData(0), rate, hz) / hz);
      if (Math.abs(cents) > Math.abs(worst.cents)) Object.assign(worst, { cents, midi, rate });
      if (rate === RATES[0]) read.push(`${midi}: ${cents >= 0 ? '+' : ''}${cents.toFixed(2)}`);
    }
  }
  must(
    Math.abs(worst.cents) <= GATES.centsBand,
    `the Karplus string is out of tune: ${worst.cents.toFixed(2)} cents at MIDI ${worst.midi}, ${worst.rate} Hz`,
    `the Karplus string is in tune at every pitch and both rates, with no audio context anywhere: worst ${worst.cents >= 0 ? '+' : ''}${worst.cents.toFixed(2)} cents (${read.join(', ')} at ${RATES[0] / 1000} kHz)`
  );
}

// --- the page ---------------------------------------------------------------
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${PORT}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>voices</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  // `root` is a string wherever `file` is one: they are set together on the line
  // above, and this arm is only reached when `file` was named.
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise<void>((done) => server.listen(PORT, '127.0.0.1', done));
const BASE = `http://127.0.0.1:${PORT}/`;

/**
 * The settings blocks an override may be put over: the fields of the table that
 * are themselves tables. `swing` and `hatNudge` are numbers and there is
 * nothing to put over one, which is what this says in type.
 */
type SettingsBlock = { [K in keyof Settings]-?: Settings[K] extends object ? K : never }[keyof Settings];

/** One settings block, overridden for the length of one render. */
interface BlockOverride {
  block: SettingsBlock;
  with: Record<string, unknown>;
}

/** The two channels of one window of a render, as the meters take them. */
type Channels = [Float32Array, Float32Array];

/**
 * The worst one-sample move found round a set of hits: the reading `meter.ts`
 * gives back, and the empty one `worstOf` starts from, which has no `at`
 * because it is not anywhere.
 */
interface Worst {
  t: number;
  step: number;
  ratio: number;
  at?: number;
}

/** One render of the oversample A/B, at one of its three settings. */
interface AbOut {
  lufs: number;
  peak: number;
  less: number;
}

/** What the page is asked for: which reading, of which voice, at what rate. */
interface RunJob {
  base: string;
  kind: string;
  id: string;
  rate?: number;
  /** the A/B's own two: which settings block to override, and with what */
  block?: SettingsBlock;
  values?: string[];
  /** the knob pass's own three: which fixture table the scene is in, and the
   * settings to put on every note of it */
  table?: 'K2' | 'K3' | 'K4';
  knobs?: Record<string, number>;
  /** the controls' pass: parameters written straight onto every note */
  params?: Record<string, number>;
  /** ...and what the fixture already carries under them, for "did it move" */
  under?: Record<string, number>;
}

// Everything below runs in the page: it is serialised on its way there, so it
// closes over nothing and imports what it needs by URL from the two roots this
// file serves.
const RUN = async (job: RunJob) => {
  const S = job.base;
  const [G, MA, VO, SC, PL, AU, AU2, ME, AD] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-voices.ts`),
    import(`${S}tools/audition-voices-2.ts`),
    import(`${S}tools/meter.ts`),
    import(`${S}tools/audition-drums.ts`),
  ]);
  const rate = job.rate || 44100;
  const began = performance.now();
  const round = (v: number, n = 2): number => +v.toFixed(n);
  const db = (v: number): number => round(20 * Math.log10(v + 1e-30));
  const channels = (buf: AudioBuffer, from = 0, to: number | null = null): Channels => {
    const a = Math.max(0, Math.round(from * buf.sampleRate));
    const b = Math.min(buf.length, Math.round((to == null ? buf.duration : to) * buf.sampleRate));
    return [buf.getChannelData(0).slice(a, b), buf.getChannelData(1).slice(a, b)];
  };
  const rms = ([L, R]: Channels): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / Math.max(1, 2 * L.length));
  };
  const notNumbers = ([L, R]: Channels): number => {
    let n = 0;
    for (let i = 0; i < L.length; i++) { if (!Number.isFinite(L[i])) n++; if (!Number.isFinite(R[i])) n++; }
    return n;
  };
  const monoGap = ([L, R]: Channels): number => {
    let g = 0;
    for (let i = 0; i < L.length; i++) { const d = Math.abs(L[i] - R[i]); if (d > g) g = d; }
    return round(g, 6);
  };
  const worstOf = (list: Worst[]): Worst => list.reduce((a: Worst, c: Worst) => (c.step > a.step ? c : a), { step: 0, ratio: 0, t: 0 });

  // The fixture's own runner: the program through `schedule()` into the v1
  // graph. No composer, no plan, no style.
  const play = async (aud: Audition, over: BlockOverride | null = null, asked: Program | null = null) => {
    const program = asked || aud.program;
    const settings = over ? { ...program.settings, [over.block]: { ...program.settings[over.block], ...over.with } } : program.settings;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
    graph.out.connect(ctx.destination);
    await VO.prepareVoices(ctx, settings, program.events, { all: true });
    PL.scheduleAutomation(graph, { ...program, settings }, 0);
    for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, { ...program, settings }, s.pe, s.at);
    const buf = await ctx.startRendering();
    const duck = graph.param('duck.gain').value;
    graph.dispose();
    return { buf, duck };
  };

  if (job.kind === 'scene') {
    const aud = AU.voiceAudition(job.id);
    const { buf, duck } = await play(aud);
    // The level table is read by name for the reason `audition.ts` writes down:
    // `VOICE_LEVEL` is keyed and valued by plain strings where `levels` is a
    // closed table of named fields.
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL[AU.sceneOf(job.id).voice]];
    const win = channels(buf, aud.window.from, aud.window.to);
    const withTail = channels(buf, aud.window.from);
    const onsets = aud.program.events.filter((e: ProgramEvent) => e.t >= aud.window.from).map((e: ProgramEvent) => e.t - aud.window.from);
    const lufs = ME.integratedLoudness(win, rate);
    const d = VO.BY_NAME[AU.sceneOf(job.id).voice];
    return {
      rate, ms: Math.round(performance.now() - began),
      notes: aud.program.events.length, hits: onsets.length,
      lufs, level, loudnessDb: round(lufs - level),
      declared: VO.TIMBRES[job.id] ? VO.TIMBRES[job.id].loudnessDb : null,
      mono: d.mono,
      truePeak: ME.truePeak(withTail),
      peak: db(ME.samplePeak(withTail)),
      rms: db(rms(win)),
      gap: monoGap(withTail),
      bad: notNumbers(withTail),
      click: worstOf(ME.clicks(withTail, rate, onsets)),
      duck,
    };
  }

  // The same eight bars with one settings block overridden: what an oversample
  // costs, measured rather than assumed.
  if (job.kind === 'ab') {
    const aud = AU.voiceAudition(job.id);
    // Read by name, as above.
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL[AU.sceneOf(job.id).voice]];
    const out: Record<string, AbOut> = {};
    // The A/B job is the one that names a block and the values to try; no other
    // job does, which is why they are the two optional fields of `RunJob`.
    for (const os of job.values!) {
      const { buf } = await play(aud, { block: job.block!, with: { oversample: os } });
      const win = channels(buf, aud.window.from, aud.window.to);
      out[os] = { lufs: ME.integratedLoudness(win, rate), peak: db(ME.samplePeak(channels(buf, aud.window.from))), less: round(ME.integratedLoudness(win, rate) - level) };
    }
    return { rate, ms: Math.round(performance.now() - began), out };
  }

  // --- PLAN-MODULATION M1's two readings ------------------------------------
  //
  // The fixture is the one the rest of this file meters: the instrument alone
  // on its own figure, two bars of pre-roll thrown away, eight bars read. What
  // is different is one line — a `knobs` table on every note of the program —
  // so what the two renders differ by is the seasoning and nothing else.
  const auditionOf = (id: string, table?: string) => (table === 'K4' ? AU2.voiceAudition2(id)
    : table === 'K3' ? AD.drumAudition(id) : AU.voiceAudition(id));
  const voiceOf = (id: string, table?: string) => (table === 'K4' ? AU2.scene2Of(id)
    : table === 'K3' ? AD.drumSceneOf(id) : AU.sceneOf(id)).voice;
  // A knob table on every note, or (the controls' pass) parameters written
  // onto every note as they are; nothing else about the fixture moves.
  const seasoned = (program: any, knobs: Record<string, number> | null, params: Record<string, number> | null = job.params || null) => (knobs || params
    ? { ...program, events: program.events.map((e: ProgramEvent) => ({ ...e, p: { ...e.p, ...(params || {}), ...(knobs ? { knobs } : {}) } })) }
    : program);
  /** The spectral centroid, off the third-octave bands the meter already makes. */
  const centroidOf = (win: Channels): number => {
    const bands = ME.thirdOctaves(win[0], win[1], rate);
    let num = 0;
    let den = 0;
    for (let i = 0; i < ME.THIRDS.length; i++) {
      const power = Math.pow(10, bands[i] / 10);
      num += ME.THIRDS[i] * power;
      den += power;
    }
    return den > 0 ? Math.round(num / den) : 0;
  };
  /** The offset a filter or a shaper leaves behind: the mean of the window. */
  const dcOf = ([L, R]: Channels): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] + R[i];
    return round(s / Math.max(1, 2 * L.length), 6);
  };

  if (job.kind === 'knob') {
    const aud = auditionOf(job.id, job.table);
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL[voiceOf(job.id, job.table)]];
    const { buf } = await play(aud, null, seasoned(aud.program, job.knobs || null));
    const unmoved = job.params ? await play(aud, null, seasoned(aud.program, null, job.under || null)) : null;
    const win = channels(buf, aud.window.from, aud.window.to);
    const withTail = channels(buf, aud.window.from);
    const onsets = aud.program.events.filter((e: ProgramEvent) => e.t >= aud.window.from).map((e: ProgramEvent) => e.t - aud.window.from);
    const lufs = ME.integratedLoudness(win, rate);
    return {
      rate, ms: Math.round(performance.now() - began),
      lufs, loudnessDb: round(lufs - level),
      truePeak: ME.truePeak(withTail),
      peak: db(ME.samplePeak(withTail)),
      dc: dcOf(withTail),
      centroid: centroidOf(win),
      gap: monoGap(withTail),
      bad: notNumbers(withTail),
      click: worstOf(ME.clicks(withTail, rate, onsets)),
      // The controls' pass asks one more thing of an end: that it does
      // something. A range whose end renders the fixture unchanged is a
      // control the voice does not read.
      moved: unmoved ? (() => {
        let d = 0;
        for (let c = 0; c < 2; c++) {
          const a = buf.getChannelData(c);
          const b = unmoved.buf.getChannelData(c);
          for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
        }
        return d;
      })() : null,
    };
  }

  // **Is the declared default the number the voice already uses?** Two renders
  // of the same fixture in one call — one with no knobs on it at all and one
  // with every knob written at its declared default — compared sample for
  // sample. It is the only honest way to make that claim: a table beside a
  // table proves nothing, and this is the identity the whole contract rests on.
  if (job.kind === 'knobIdentity') {
    const aud = auditionOf(job.id, job.table);
    const gap = (x: AudioBuffer, y: AudioBuffer) => {
      let worst = 0;
      let differing = 0;
      let n = 0;
      let sum = 0;
      for (let c = 0; c < 2; c++) {
        const a = x.getChannelData(c);
        const b = y.getChannelData(c);
        n += a.length;
        for (let i = 0; i < a.length; i++) {
          const d = a[i] - b[i];
          sum += d * d;
          const m = Math.abs(d);
          if (m !== 0) { differing++; if (m > worst) worst = m; }
        }
      }
      // The RMS as well as the worst sample, because over two million samples
      // the worst one is a lottery and the RMS is a measurement: two identical
      // renders in Chromium land a different single sample each time and the
      // energy between them does not move.
      return { worst, differing, n, rms: Math.sqrt(sum / Math.max(1, n)) };
    };
    // **Three renders and not two.** The same graph rendered twice is not the
    // same samples in every engine — round 1b measured it and the machine
    // view's pictures are blessed against it — so the bare fixture is rendered
    // twice and *that* is the tolerance the seasoned one is held to. In Firefox
    // the spread is nought and the claim is byte identity; in Chromium the
    // claim is that a knob at its default is no further off than the engine is
    // from itself, which is the strongest thing that engine can be asked.
    const bare = await play(aud, null, aud.program);
    const again = await play(aud, null, aud.program);
    const set = await play(aud, null, seasoned(aud.program, job.knobs || null));
    const spread = gap(bare.buf, again.buf);
    const off = gap(bare.buf, set.buf);
    return {
      rate, ms: Math.round(performance.now() - began),
      worst: off.worst, differing: off.differing, n: off.n, rms: off.rms,
      spread: spread.worst, spreadDiffering: spread.differing, spreadRms: spread.rms,
    };
  }

  if (job.kind === 'held') {
    const aud = AU.heldVoiceAudition(job.id);
    const d = aud.drones[0];
    const program = aud.program;
    const settings = program.settings;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: 0 });
    graph.out.connect(ctx.destination);
    const held = AU.startHeldVoices(ctx, graph, aud, job.id, 0);
    const facts = { tails: held.map((h: HeldVoice) => h.tail), controls: [...held[0].controls], states: held.map((h: HeldVoice) => h.state) };
    const buf = await ctx.startRendering();
    for (const h of held) h.dispose();
    const gone = held.map((h: HeldVoice) => h.state);
    graph.dispose();
    const level = (from: number, to: number): number => db(rms(channels(buf, from, to)));
    const silent = d.release + facts.tails[0];
    return {
      rate, ms: Math.round(performance.now() - began),
      tail: facts.tails[0], controls: facts.controls, state: facts.states[0], disposed: gone[0],
      at: d.at, pause: d.pause, resume: d.resume, release: d.release, silentAt: round(silent, 3),
      // Four seconds a window, for the reason round G wrote down: a pad's own
      // level swings several decibels from one second to the next and a short
      // window reads the beating rather than the drone.
      holding: level(3, 7),
      paused: level(10.5, 11.5),
      resumed: level(13, 17),
      afterTail: level(silent + 0.2, program.duration),
      bad: notNumbers(channels(buf)),
      peak: db(ME.samplePeak(channels(buf))),
    };
  }
  return { error: `no job called ${job.kind}` };
};

// --- 2. every one of the six, in every engine, at both rates -----------------
let pw: PlaywrightFound | null = null;
try {
  pw = await playwright();
  console.log(`  ${pw.label}`);
} catch (e) {
  skipped.push(`the voice scenes: ${(e as Error).message.split('\n')[0]}`);
}

/**
 * One row of what was measured.
 *
 * A scene's row is the five numbers it was read on. The oversample A/B keeps
 * its rows in the same table, under `ab` — the one key here that is not a
 * voice — and such a row carries its three renders under `out` and none of the
 * five, which is why the fields are optional. The two places that walk this
 * table each read only the rows they put there: the blessing walks `WANT`,
 * which is voices, and the write-up skips `ab` by name.
 */
interface Reading {
  engine: string;
  rate?: number;
  loudnessDb?: number;
  truePeak?: number;
  peak?: number;
  gap?: number;
  click?: Worst;
  out?: Record<string, AbOut>;
}

/** What each reading measured, gathered for `--bless`. */
const measured: Record<string, Reading[]> = {};

// --- PLAN-MODULATION M1: the knob pass --------------------------------------

/**
 * **Which fixture each seasoned voice is metered on, and which module declares
 * it.** One row per voice that declares a knob, and the gate asserts that: a
 * voice with ranges and no row here is a voice whose ends nobody proved, which
 * is exactly the hole this table exists to make impossible.
 *
 * The scene is the *playable instrument* and not the voice, because `keys` is
 * five patches and `pad` is four: `keys:ep` is the record's commonest patch and
 * the one master seed 1's first theme actually plays, and `pad:strings` is the
 * family `strings.ts` makes itself.
 */
/**
 * **Which fixture each voice's note controls are proved on.** One row per voice
 * that declares controls, which the node section asserts. `with` is written
 * under every end of that voice: the vocal's vowel only walks, and its vibrato
 * only has a rate and a delay, while the gesture is asked for.
 */
const CONTROL_SCENES: Array<{ voice: string; scene: string; table: 'K2' | 'K3' | 'K4'; with?: Record<string, number> }> = [
  { voice: 'kick', scene: 'kick', table: 'K2' },
  { voice: 'sub', scene: 'sub', table: 'K2' },
  { voice: 'pad', scene: 'pad:strings', table: 'K2' },
  { voice: 'piano', scene: 'piano', table: 'K2' },
  { voice: 'fmBell', scene: 'fmBell', table: 'K2' },
  { voice: 'formantPad', scene: 'formantPad', table: 'K2' },
  { voice: 'wordlessVocal', scene: 'wordlessVocal', table: 'K2', with: { vowelSeconds: 0.3 } },
  { voice: 'conga', scene: 'conga', table: 'K3' },
  { voice: 'bongo', scene: 'bongo', table: 'K3' },
];

const KNOB_SCENES: Array<{ voice: string; scene: string; table: 'K2' | 'K4'; module: string }> = [
  { voice: 'kick', scene: 'kick', table: 'K2', module: 'kick.ts' },
  { voice: 'sub', scene: 'sub', table: 'K2', module: 'bass.ts' },
  { voice: 'keys', scene: 'keys:ep', table: 'K2', module: 'keys.ts' },
  { voice: 'pad', scene: 'pad:strings', table: 'K2', module: 'strings.ts' },
  { voice: 'fmPluck', scene: 'fmPluck', table: 'K4', module: 'fm-keys.ts' },
  { voice: 'brightPiano', scene: 'brightPiano', table: 'K4', module: 'keys-2.ts' },
];

/** One end of one knob, as the page read it. */
interface KnobReading {
  engine: string;
  rate: number;
  at: 'min' | 'default' | 'max';
  setting: number;
  loudnessDb: number;
  centroid: number;
  peak: number;
  truePeak: number;
  dc: number;
}

/** Every reading, by `voice/knob`. */
const knobRead: Record<string, KnobReading[]> = {};

/** Every knob table, with its defaults written out as a setting object. */
const defaultsOf = (voice: string): Record<string, number> =>
  Object.fromEntries(Object.entries(VOICE_KNOBS[voice]).map(([n, k]) => [n, (k as KnobSpec).default]));

/** The same, with one knob moved to one of its ends. */
const settingAt = (voice: string, knob: string, at: 'min' | 'max'): Record<string, number> => {
  const out = defaultsOf(voice);
  out[knob] = (VOICE_KNOBS[voice][knob] as KnobSpec)[at];
  return out;
};

/**
 * The slope through the three readings, in decibels per unit of the knob: an
 * ordinary least-squares line, because a knob is not promised to be linear and
 * a line through two of the three would say what the third does not.
 */
function slopeOf(rows: Array<{ x: number; y: number }>): number {
  const n = rows.length;
  if (n < 2) return NaN;
  const mx = rows.reduce((a, r) => a + r.x, 0) / n;
  const my = rows.reduce((a, r) => a + r.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const r of rows) { num += (r.x - mx) * (r.y - my); den += (r.x - mx) * (r.x - mx); }
  return den > 0 ? num / den : NaN;
}

// The note controls, declared: well formed, and every voice that declares them
// has a fixture row in the controls' pass.
{
  const faults = controlFaultsOfAll();
  const declaring = REGISTRY.filter((d) => d.controls).map((d) => d.name);
  const missing = declaring.filter((v) => !CONTROL_SCENES.some((r) => r.voice === v));
  must(!faults.length && !missing.length,
    `the note controls: ${[...faults, ...missing.map((v) => `${v} declares controls and has no fixture`)].join('; ')}`,
    `every declared note control is a range: ${REGISTRY.filter((d) => d.controls).reduce((n, d) => n + Object.keys(d.controls!).length, 0)} controls on ${declaring.length} voices, each with a fixture for --controls`);
}

// A voice with ranges and no fixture row is a voice nobody can prove anything
// about, so it is a fault and not a skip.
{
  const declaring = REGISTRY.filter((d) => d.knobs && Object.keys(d.knobs).length).map((d) => d.name);
  const missing = declaring.filter((v) => !KNOB_SCENES.some((r) => r.voice === v));
  const extra = KNOB_SCENES.filter((r) => !declaring.includes(r.voice)).map((r) => r.voice);
  must(
    !missing.length && !extra.length,
    `the knob fixtures and the registry disagree: ${[...missing.map((v) => `${v} declares knobs and has no fixture`), ...extra.map((v) => `${v} has a fixture and declares none`)].join('; ')}`,
    `every voice that declares a knob is metered on a fixture: ${KNOB_SCENES.map((r) => `${r.voice} on ${r.scene}`).join(', ')}`
  );
}

if (pw) {
  for (const engine of ENGINES) {
    if (!pw.pw[engine]) { skipped.push(`the voice scenes in ${engine}: playwright does not know it`); continue; }
    let browser = null;
    try {
      browser = await pw.pw[engine].launch(launchOptions(engine));
    } catch (e) {
      skipped.push(`the voice scenes in ${engine}: it is not installed (${(e as Error).message.split('\n')[0].slice(0, 60)})`);
      continue;
    }
    renice(browser);
    console.log(`  ${engine}`);
    const run = async (job: Omit<RunJob, 'base'>) => {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(e.message));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      const out = await page.evaluate(RUN, { ...job, base: BASE });
      await page.close();
      if (VERBOSE) console.log(`        ${job.kind} ${job.id}${job.rate ? `@${job.rate}` : ''} ${JSON.stringify(out)}`);
      if (errors.length) bad(`${job.kind} ${job.id} in ${engine}: the page threw: ${errors.join(' | ')}`);
      return out;
    };

    for (const id of WANT) {
      for (const rate of RATES) {
        const r = await run({ kind: 'scene', id, rate });
        (measured[id] = measured[id] || []).push({ engine, rate, loudnessDb: r.loudnessDb, truePeak: r.truePeak, peak: r.peak, gap: r.gap, click: r.click });
        // The piano's declared loudness is the fit's input and stays where the
        // fit was blessed (`PIANO_TIMBRES`); what the scene holds it to is the
        // number the scene measured.
        if (SCENE_DECLARED[id] !== undefined) r.declared = SCENE_DECLARED[id];
        const off = Math.abs(r.loudnessDb - r.declared);
        const widthOk = r.mono ? r.gap <= GATES.monoTolerance : r.gap > GATES.monoTolerance;
        const clicked = r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio;
        must(
          r.bad === 0 && off <= GATES.loudnessBandDb && widthOk && r.truePeak <= GATES.truePeakDbTP &&
            r.peak <= GATES.samplePeakDbFS && !clicked && r.duck === 1,
          `${id} at ${rate}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${off > GATES.loudnessBandDb ? `${r.loudnessDb} dB against the declared ${r.declared}; ` : ''}${widthOk ? '' : `it declares ${r.mono ? 'mono' : 'stereo'} and its channels differ by ${r.gap}; `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS; ` : ''}${clicked ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s; ` : ''}${r.duck === 1 ? '' : `it wrote a sidechain (${r.duck})`}`,
          `${id} alone at ${rate / 1000} kHz: ${r.hits} notes over eight bars at ${r.loudnessDb} dB (declared ${r.declared}, ${off.toFixed(2)} off), ${r.mono ? 'mono to' : 'two channels apart by'} ${r.gap}, ${r.truePeak} dBTP / ${r.peak} dBFS, worst click ${r.click.step} at ${r.click.ratio}x, no sidechain written (${r.ms} ms)`
        );
      }
    }

    // The two that hold, against the contract.
    for (const id of WANT.filter((v) => ['formantPad', 'supersawPad'].includes(v))) {
      const r = await run({ kind: 'held', id, rate: 48000 });
      const back = Math.abs(r.resumed - r.holding);
      must(
        r.bad === 0 && r.paused < r.holding - 40 && back <= GATES.holdBandDb && r.afterTail < -80 &&
          r.state === 'released' && r.disposed === 'gone' && r.controls.length >= 2,
        `${id} held: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${r.paused < r.holding - 40 ? '' : `a pause left ${r.paused} dB where it was holding at ${r.holding}; `}${back <= GATES.holdBandDb ? '' : `it came back at ${r.resumed} dB where it was holding at ${r.holding}; `}${r.afterTail < -80 ? '' : `${r.afterTail} dB is still sounding after its stated tail; `}${r.state === 'released' ? '' : `it says it is ${r.state}`}`,
        `${id} held, paused and brought back: ${r.holding} dB holding, ${r.paused} dB paused at ${r.pause} s, ${r.resumed} dB after ${r.resume} s (${back.toFixed(2)} dB of it), released at ${r.release} s over its stated ${r.tail} s tail and silent at ${r.silentAt} s (${r.afterTail} dB after it), then disposed; it answers to ${r.controls.join(', ')} (${r.ms} ms)`
      );
    }

    // --- PLAN-MODULATION M1: every declared knob at its two ends -----------
    //
    // Two claims, and they are the two the contract makes. **The default is the
    // number the voice already uses**, proved by two renders of the same
    // fixture compared sample for sample — one bare, one with every knob
    // written at its default. And **the ends are clean**, proved by the nine
    // scenes' own gates: finite samples, a true peak and a sample peak under
    // -1, no click, the width the descriptor declares, and no DC the filters
    // and the shapers left behind. The slope falls out of the same three
    // readings and is what the loudness fit is given.
    if (KNOBS) {
      for (const row of KNOB_SCENES.filter((r) => !KNOB_ONLY || r.voice === KNOB_ONLY)) {
        for (const rate of RATES) {
          const id = await run({ kind: 'knobIdentity', id: row.scene, table: row.table, knobs: defaultsOf(row.voice), rate });
          const asFar = id.worst === 0 || id.rms <= Math.max(id.spreadRms * GATES.knobSpread, GATES.knobIdentityRms);
          must(
            asFar,
            `${row.voice} at its declared defaults is not the record: ${id.differing} of ${id.n} samples differ, worst ${id.worst}, difference RMS ${id.rms.toExponential(2)} — ${(20 * Math.log10(id.rms + 1e-30)).toFixed(0)} dBFS — where two identical renders in this engine differ by ${id.spreadRms.toExponential(2)}`,
            `${row.voice} at every knob's declared default is ${row.scene} with no knob on it at all over ${id.n} samples at ${rate / 1000} kHz in ${engine}: ${id.worst === 0 ? 'byte-identical' : `${id.rms.toExponential(2)} of difference RMS against this engine's own ${id.spreadRms.toExponential(2)} over two identical renders, ${(20 * Math.log10(id.rms + 1e-30)).toFixed(0)} dBFS`} (${id.ms} ms)`
          );

          const knobs = VOICE_KNOBS[row.voice];
          const base = await run({ kind: 'knob', id: row.scene, table: row.table, knobs: defaultsOf(row.voice), rate });
          for (const [knob, spec] of Object.entries(knobs) as Array<[string, KnobSpec]>) {
            const key = `${row.voice}/${knob}`;
            const rows = knobRead[key] = knobRead[key] || [];
            rows.push({ engine, rate, at: 'default', setting: spec.default, loudnessDb: base.loudnessDb, centroid: base.centroid, peak: base.peak, truePeak: base.truePeak, dc: base.dc });
            for (const at of ['min', 'max'] as const) {
              const r = await run({ kind: 'knob', id: row.scene, table: row.table, knobs: settingAt(row.voice, knob, at), rate });
              rows.push({ engine, rate, at, setting: spec[at], loudnessDb: r.loudnessDb, centroid: r.centroid, peak: r.peak, truePeak: r.truePeak, dc: r.dc });
              const clicked = r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio;
              const wide = BY_NAME_MONO[row.voice] ? r.gap <= GATES.monoTolerance : r.gap > GATES.monoTolerance;
              // **The ceiling a knob's end is held to is the fixture's own.**
              // The nine scenes' -1 dBTP is where it stays for every instrument
              // that has room under it, and `pad:strings` has not: alone at its
              // room's own level it already sits on the limiter at -1.01, and
              // the two engines read that same default 0.01 dB apart. So an end
              // may not make the instrument peak materially worse than it
              // already does, and materially is a tenth of a decibel — inside
              // what the limiter itself varies by between two engines on the
              // same render.
              const peakCeiling = Math.max(GATES.truePeakDbTP, base.truePeak + GATES.knobPeakSlackDb);
              const sampleCeiling = Math.max(GATES.samplePeakDbFS, base.peak + GATES.knobPeakSlackDb);
              must(
                r.bad === 0 && r.truePeak <= peakCeiling && r.peak <= sampleCeiling &&
                  Math.abs(r.dc) <= GATES.knobDc && !clicked && wide,
                `${key} at its ${at} of ${spec[at]} ${spec.unit}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${r.truePeak > peakCeiling ? `a true peak of ${r.truePeak} dBTP against this fixture's own ${base.truePeak}; ` : ''}${r.peak > sampleCeiling ? `a sample peak of ${r.peak} dBFS against this fixture's own ${base.peak}; ` : ''}${Math.abs(r.dc) > GATES.knobDc ? `a DC offset of ${r.dc}; ` : ''}${clicked ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s; ` : ''}${wide ? '' : `it declares ${BY_NAME_MONO[row.voice] ? 'mono' : 'stereo'} and its channels differ by ${r.gap}`} — narrow the range, never widen it by hand`,
                `${key} at its ${at} of ${spec[at]} ${spec.unit} at ${rate / 1000} kHz in ${engine}: ${r.loudnessDb} dB (${(r.loudnessDb - base.loudnessDb >= 0 ? '+' : '') + (r.loudnessDb - base.loudnessDb).toFixed(2)} on the default), centroid ${r.centroid} Hz, ${r.truePeak} dBTP / ${r.peak} dBFS, DC ${r.dc}, worst click ${r.click.step} at ${r.click.ratio}x (${r.ms} ms)`
              );
            }
          }
        }
      }
    }

    // --- the note controls: every declared control, its default and its ends ---
    //
    // The engine review of 09-22 (finding 4): a part writes these on notes and
    // v2's golden themes lean on them, and they were names with nothing behind
    // them. The same two claims the knob pass makes, on the voice's own
    // fixture: **a numeric default is the voice's own number** — every control
    // that has one written at it renders the same samples as the fixture with
    // none — and **each end is clean**, by the knob pass's gates, and **live**:
    // the end has to move the render, or the voice does not read the control.
    if (CONTROLS) {
      for (const row of CONTROL_SCENES.filter((r) => !ONLY || r.voice === ONLY)) {
        const controls = REGISTRY.find((d) => d.name === row.voice)!.controls!;
        const defaults = Object.fromEntries(Object.entries(controls).filter(([, c]) => c.default !== null).map(([k, c]) => [k, c.default as number]));
        for (const rate of RATES) {
          if (Object.keys(defaults).length) {
            const id = await run({ kind: 'knobIdentity', id: row.scene, table: row.table, params: defaults, rate });
            const asFar = id.worst === 0 || id.rms <= Math.max(id.spreadRms * GATES.knobSpread, GATES.knobIdentityRms);
            must(asFar,
              `${row.voice} with ${Object.keys(defaults).join(', ')} written at their declared defaults is not the fixture: ${id.differing} of ${id.n} samples differ, worst ${id.worst}, difference RMS ${id.rms.toExponential(2)} against this engine's own ${id.spreadRms.toExponential(2)}`,
              `${row.voice} with ${Object.keys(defaults).length} controls written at their declared defaults is ${row.scene} with none at ${rate / 1000} kHz in ${engine}: ${id.worst === 0 ? 'byte-identical' : `${id.rms.toExponential(2)} of difference RMS against this engine's own ${id.spreadRms.toExponential(2)}`}`);
          }
          const base = await run({ kind: 'knob', id: row.scene, table: row.table, rate, ...(row.with ? { params: row.with } : {}) });
          for (const [name, spec] of Object.entries(controls)) {
            // Live is a claim about the range and not about each end: an end
            // that is the voice's own number (a switch off, a send of nought,
            // a motion of one) renders the fixture, and the other end has to
            // move it.
            const moved: number[] = [];
            for (const at of ['min', 'max'] as const) {
              const r = await run({ kind: 'knob', id: row.scene, table: row.table, params: { ...row.with, [name]: spec[at] }, under: row.with, rate });
              const peakCeiling = Math.max(GATES.truePeakDbTP, base.truePeak + GATES.knobPeakSlackDb);
              const sampleCeiling = Math.max(GATES.samplePeakDbFS, base.peak + GATES.knobPeakSlackDb);
              moved.push(r.moved);
              const live = at === 'min' || Math.max(...moved) > 1e-4;
              must(
                r.bad === 0 && r.truePeak <= peakCeiling && r.peak <= sampleCeiling && Math.abs(r.dc) <= GATES.knobDc && live,
                `${row.voice}/${name} at its ${at} of ${spec[at]} ${spec.unit}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${r.truePeak > peakCeiling ? `a true peak of ${r.truePeak} dBTP against this fixture's own ${base.truePeak}; ` : ''}${r.peak > sampleCeiling ? `a sample peak of ${r.peak} dBFS; ` : ''}${Math.abs(r.dc) > GATES.knobDc ? `a DC offset of ${r.dc}; ` : ''}${live ? '' : `neither end moved the render (worst ${Math.max(...moved)}), so the voice does not read it`} — narrow the range, never widen it by hand`,
                `${row.voice}/${name} at its ${at} of ${spec[at]} ${spec.unit} at ${rate / 1000} kHz in ${engine}: ${r.loudnessDb} dB (${(r.loudnessDb - base.loudnessDb >= 0 ? '+' : '') + (r.loudnessDb - base.loudnessDb).toFixed(2)} on the fixture), ${r.truePeak} dBTP, DC ${r.dc}, moved by ${r.moved.toFixed(4)}`);
            }
          }
        }
      }
    }

    // The one shaper this round adds, at three settings.
    if (AB) {
      const r = await run({ kind: 'ab', id: 'clavKey', block: 'clavKey', values: ['none', '2x', '4x'], rate: 48000 });
      console.log(`        clavKey oversample in ${engine}: ${Object.entries(r.out as Record<string, AbOut>).map(([k, v]) => `${k} ${v.lufs} LUFS (${v.less} less the level)`).join(', ')}`);
      (measured.ab = measured.ab || []).push({ engine, out: r.out });
    }
    await browser.close();
  }
}

server.close();

// --- 3. and what the readings say, if they are to be written down ------------
//
// A declared number is written by the gate that measures it and never typed.
// What is written is the **mean over every reading** — two engines and two
// rates — rounded to a tenth of a decibel, and the band the gate then holds it
// to is a whole decibel, so a number blessed here passes everywhere it was
// measured by construction.
//
// **The slopes are written the same way**, and for the same reason: a declared
// number is written by the gate that measured it and never typed. The slope of
// one knob is the least-squares line through its three settings, meaned over
// every reading — two engines, two rates — and kept to three significant
// figures, because a knob in hertz reads in ten-thousandths of a decibel and a
// knob in seconds in tens.
if (KNOBS) {
  console.log('\nthe knobs, as the ends read against their own default');
  for (const [key, rows] of Object.entries(knobRead)) {
    const [voice, knob] = key.split('/');
    const spec = VOICE_KNOBS[voice][knob] as KnobSpec;
    const per = (at: string) => rows.filter((r) => r.at === at);
    const mean = (at: string, f: (r: KnobReading) => number) => per(at).reduce((a, r) => a + f(r), 0) / Math.max(1, per(at).length);
    const slope = slopeOf(rows.map((r) => ({ x: r.setting, y: r.loudnessDb })));
    // **The declared slope against the measured one**, in the only units that
    // mean anything across a knob in hertz and a knob in seconds: how far the
    // loudness model would be wrong over the knob's own travel. Half a decibel
    // end to end is the band, which is half what the scenes hold a declared
    // loudness to — the model is allowed to be approximate and is not allowed
    // to be a number nobody measured.
    const travel = Math.abs(spec.max - spec.min);
    const off = Math.abs((spec.slopeDb - slope) * travel);
    must(
      Number.isFinite(slope) && off <= GATES.knobSlopeDb,
      `${key} declares a slope of ${spec.slopeDb} dB/${spec.unit} and reads ${Number(slope.toPrecision(3))}: ${off.toFixed(2)} dB out over its own ${spec.min} to ${spec.max} — run --knobs --bless`,
      `${key}'s declared slope is what it measures: ${spec.slopeDb} dB/${spec.unit} against ${Number(slope.toPrecision(3))}, ${off.toFixed(2)} dB over the whole range`
    );
    console.log(`  ${key.padEnd(24)} ${spec.unit.padEnd(8)} min ${String(spec.min).padStart(8)} ${mean('min', (r) => r.loudnessDb).toFixed(2).padStart(7)} dB ${String(Math.round(mean('min', (r) => r.centroid))).padStart(6)} Hz  |  default ${String(spec.default).padStart(8)} ${mean('default', (r) => r.loudnessDb).toFixed(2).padStart(7)} dB ${String(Math.round(mean('default', (r) => r.centroid))).padStart(6)} Hz  |  max ${String(spec.max).padStart(8)} ${mean('max', (r) => r.loudnessDb).toFixed(2).padStart(7)} dB ${String(Math.round(mean('max', (r) => r.centroid))).padStart(6)} Hz  |  slope ${Number(slope.toPrecision(3))} dB/${spec.unit}`);
  }
  if (BLESS) {
    console.log('\nblessing the slopes');
    for (const row of KNOB_SCENES.filter((r) => !KNOB_ONLY || r.voice === KNOB_ONLY)) {
      const file = path.join(SRC, 'voices', row.module);
      let text = fs.readFileSync(file, 'utf8');
      for (const knob of Object.keys(VOICE_KNOBS[row.voice])) {
        const rows = knobRead[`${row.voice}/${knob}`] || [];
        if (rows.length < 3) { console.log(`  ${row.voice}/${knob}: ${rows.length} readings, not blessed`); continue; }
        const slope = slopeOf(rows.map((r) => ({ x: r.setting, y: r.loudnessDb })));
        if (!Number.isFinite(slope)) { console.log(`  ${row.voice}/${knob}: no slope`); continue; }
        const now = Number(slope.toPrecision(3));
        const re = new RegExp(`(${knob}: \\{[^}]*slopeDb: )(-?[0-9.eE+-]+)`);
        if (!re.test(text)) { console.log(`  ${row.voice}/${knob}: no slopeDb found in ${row.module}`); continue; }
        const was = text.match(re)![2];
        text = text.replace(re, `$1${now}`);
        console.log(`  ${row.voice}/${knob}: ${was} -> ${now} dB/${(VOICE_KNOBS[row.voice][knob] as KnobSpec).unit}`);
      }
      fs.writeFileSync(file, text);
    }
    console.log('\nre-run without --bless to check the declared slopes against the readings.');
    process.exit(failed ? 1 : 0);
  }
}

const MODULES: Record<string, string> = {
  sawLead: 'saw-lead.ts', fmBell: 'fm-bell.ts', karplusPluck: 'karplus-pluck.ts',
  formantPad: 'formant-pad.ts', clavKey: 'clav-key.ts', supersawPad: 'supersaw-pad.ts',
  piano: 'piano.ts', wordlessVocal: 'wordless-vocal.ts',
};
if (BLESS) {
  console.log('\nblessing');
  for (const id of WANT) {
    const rows = measured[id] || [];
    if (rows.length < 2) { console.log(`  ${id}: ${rows.length} readings, not blessed`); continue; }
    // Every row under a voice's own name carries the five; only the `ab` row
    // does not, and `WANT` is voices.
    const mean = rows.reduce((a: number, r: Reading) => a + r.loudnessDb!, 0) / rows.length;
    const now = Math.round(mean * 10) / 10;
    const file = path.join(SRC, 'voices', MODULES[id]);
    const text = fs.readFileSync(file, 'utf8');
    const re = new RegExp(`(${id}: \\{[^}]*${BLESS_FIELD[id] || 'loudnessDb'}: )(-?[0-9.]+)`);
    if (!re.test(text)) { console.log(`  ${id}: no declared loudness found in ${MODULES[id]}`); continue; }
    // The guard above is `re.test(text)`, so there is a match to read.
    const was = text.match(re)![2];
    fs.writeFileSync(file, text.replace(re, `$1${now}`));
    console.log(`  ${id}: ${was} -> ${now}  (${rows.map((r: Reading) => `${r.engine}@${r.rate! / 1000}k ${r.loudnessDb}`).join(', ')})`);
  }
  console.log('\nre-run without --bless to check the declared numbers against the band.');
  process.exit(0);
}

if (VERBOSE) {
  for (const [id, rows] of Object.entries(measured)) {
    if (id === 'ab') continue;
    console.log(`  ${id}: ${rows.map((r: Reading) => `${r.engine}@${r.rate! / 1000}k ${r.loudnessDb} dB, ${r.truePeak} dBTP, gap ${r.gap}`).join(' | ')}`);
  }
}

finish({ failed, skipped });
