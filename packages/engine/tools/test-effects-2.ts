// Round K4's twenty effects, each against its own contract and its own number.
//
//   node tools/test-effects-2.ts                the whole suite
//   node tools/test-effects-2.ts --only reverb  one of them, for a fast loop
//   node tools/test-effects-2.ts --engines chromium
//   node tools/test-effects-2.ts --verbose      every reading, as JSON
//   node tools/test-effects-2.ts --jobs 1       one render at a time (the
//                                                default is six at once over both
//                                                engines, and the cost alone)
//   node tools/test-effects-2.ts --bless-drive  write the drives' make-up tables
//                                                (tools/drive-level.ts) from a
//                                                measurement in both engines
//
// It is round K1's effect gate run over the rest of the kitchen, in a file of
// its own for the reason round K2 gave about `test-voices.ts`: `test.ts` is
// the machine's whole suite and a round's twenty new modules do not belong
// inside it. The two files are held to covering the registry between them
// (`audition-effects.ts`'s `uncoveredEffects`), which is round K4's own lesson
// about fixture tables asked one folder over.
//
// What every effect is held to — K1's list, unchanged, because a contract that
// is enforced differently for the second twenty is not a contract:
//
//   the offset      an effect that is not a drive adds no DC to what its own
//                   dry already has. A rectifier is a DC generator by definition
//                   — that is what the octave in a fuzz is, and it reads 0.0703
//                   — so the drive family is exempt and says so; everything else
//                   may add -70 dBFS and no more.
//   the identity    bypassed, and at a mix of nought, it is its own input — to
//                   within what a **bare unity gain** costs in that engine,
//                   which is measured in the same run and is not nought.
//   the peaks       a true peak at or under -1 dBTP and a sample peak at or
//                   under -1 dBFS.
//   the clicks      the scenes' own gate, against the fixture's own dry.
//   the tail        what is left a declared tail after the input stops, against
//                   what the piece was doing: -60 dB or under. And for anything
//                   with feedback, the same reading with the feedback wide open
//                   for the whole of the declared tail.
//   the disposal    letting it go at the instant its input stops does not
//                   shorten its tail.
//   the latency     what the declared field says — measured as **when the
//                   output starts** after an impulse, which is round K4's own
//                   correction to K1's recipe and is explained where it is
//                   taken: a reverb's wet half does not correlate with its own
//                   input, so a correlation peak through one is noise.
//   the knobs       every declared parameter exposed, and nothing else.
//   the cost        the node count and a minute of looping noise through it,
//                   against the cheapest of the whole kitchen — K1's own
//                   denominator, and the whole kitchen is measured here so the
//                   twenty-six sort in one table.
//
// And then the second half, which is this round's own: **a contract gate cannot
// say whether a compressor compresses.** So every row of `audition-effects.ts`
// that names a probe gets one, and the reading is printed whether or not the
// row asserts anything about it. `notes/archive/2026-09-kitchen/rounds/k4.md` is where they are read.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice, finish, listenOn } from './harness.ts';
import { lanes, captured, say, jobsArg } from './lanes.ts';
import * as FX from '../src/effects/index.ts';
import { resolveSettings } from '../src/settings.ts';
import { K4, SCENES_FX, uncoveredEffects } from './audition-effects.ts';
import { table } from './fixture.ts';
import { DRIVES } from './drive-level.ts';
import { makeupAt } from '../src/effects/curves.ts';
import { standin } from './standin.ts';
import type { StandinContext } from './standin.ts';
import type { PlaywrightFound, PlaywrightThing } from './harness.ts';
import type { EffectCost, EffectDescriptor, EffectInstance, ParamSetter } from '../src/effects/contract.ts';
import type { EffectSource } from './audition-effects.ts';
import type { Audition } from './audition.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };

// A `--name value` off the command line, or nothing when it is not there.
const arg = (k: string, d: string | null = null): string | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ONLY = arg('only');
const VERBOSE = process.argv.includes('--verbose');
const BLESS_DRIVE = process.argv.includes('--bless-drive');
const ENGINES = (arg('engines') || 'chromium,firefox').split(',');
const WANT = K4.filter((id) => !ONLY || id === ONLY);
// How many offline renders run at once, over both engines (`lanes.ts`); the
// default is measured (notes/reviews/suites-2026-09-24.md) and `--jobs 1` is
// the serial suite.
const JOBS = jobsArg(6);

let failed = 0;
const skipped: string[] = [];
const round = (v: number, n = 2): number => +v.toFixed(n);
const ok = (what: string) => say(`  ok    ${what}`);
const bad = (what: string) => { failed++; say(`  FAIL  ${what}`); };
const must = (cond: boolean, why: string, what: string) => (cond ? ok(what) : bad(why));

// The nine scenes' own gates, and round K1's four over the top of them.
const GATES = { truePeakDbTP: -1, samplePeakDbFS: -1, clickStep: 0.05, clickRatio: 8 };
const KITCHEN = {
  tailFloorDb: -60,
  identity: 1.1920928955078125e-7,
  // How much DC an effect may **add** to what its own dry already has, which is
  // not nought: the plucked fixture's own render leaves 0.000141 of offset, and
  // an effect that multiplies a signal by a moving gain moves that with it. Three
  // ten-thousandths is -70 dBFS — inaudible, and two and a half orders of
  // magnitude under the 0.0703 a listener heard on the ladder. Everything but
  // the drive family is held to it.
  dcFloor: 3e-4,
  latencyMs: 0.16,
  disposeDb: 0.75,
};

// --- 1. node: the two tables against the registry ---------------------------
console.log('the rest of the kitchen, on paper');
must(
  !uncoveredEffects().length,
  `the effect gates and the registry disagree: ${uncoveredEffects().join(', ')}`,
  `every registered effect is measured by one of the two gates: ${FX.EFFECTS.length} effects, ${SCENES_FX.length} of them here and 6 in tools/test.ts`
);
{
  const noRow = WANT.filter((id) => !FX.BY_ID[id]);
  const probes = SCENES_FX.filter((s) => s.probe).length;
  must(
    !noRow.length,
    `${noRow.join(', ')} has a row here and no descriptor`,
    `${SCENES_FX.length} rows, ${probes} of them with a question of their own beyond the contract`
  );
}

// --- every setter clamps to the range its descriptor declares ---------------
// The outside review of 09-19 (its E04): construction clamped and the
// setters did not, so a flanger's `feedback(1.5)` wrote 1.5 against a declared
// 0.8 and the range was a note beside the knob rather than a fact about it.
// Every module now hands its knobs through `guardParams`, and this is the gate
// on that: each setter of each effect is written a value past either end of
// its range on one instance and the range's own end on another, against a
// context that records what it is told, and the two logs have to be the same
// log — not "close": the same commands with the same numbers, curves and
// buffers. A NaN written to a setter has to write nothing. A knob handed over
// as the AudioParam itself is the contract's stated escape hatch and is counted
// rather than checked, so the line says how many of each there are.
{
  const settings = resolveSettings({ base: table });
  const build = (d: EffectDescriptor) => { const ctx = standin(); const fx = d.build(ctx, settings, {}); return { ctx, fx }; };
  const log = (ctx: StandinContext) => JSON.stringify(ctx.events());
  const outside: string[] = [];
  let setters = 0;
  let raw = 0;
  for (const d of FX.REGISTRY) {
    for (const [name, spec] of Object.entries(d.params)) {
      if (typeof build(d).fx.params[name] !== 'function') { raw++; continue; }
      setters++;
      const span = Math.max(1, spec.max - spec.min);
      for (const [ask, edge] of [[spec.max + span, spec.max], [spec.min - span, spec.min]]) {
        const a = build(d);
        (a.fx.params[name] as ParamSetter)(ask, 1, 0.1);
        const b = build(d);
        (b.fx.params[name] as ParamSetter)(edge, 1, 0.1);
        if (log(a.ctx) !== log(b.ctx)) outside.push(`${d.id}.${name} written ${ask} is not ${d.id}.${name} written ${edge}`);
      }
      const c = build(d);
      const before = log(c.ctx);
      (c.fx.params[name] as ParamSetter)(NaN, 1, 0.1);
      if (log(c.ctx) !== before) outside.push(`${d.id}.${name} wrote a NaN`);
    }
  }
  must(
    !outside.length,
    `${outside.length} live writes escaped the declared range: ${outside.slice(0, 3).join('; ')}`,
    `every setter clamps to the range its descriptor declares: ${setters} setters over ${FX.REGISTRY.length} effects each written past both ends and a NaN, and ${raw} knobs handed over as the AudioParam itself, which is the stated escape hatch`
  );
}

// --- the page ---------------------------------------------------------------
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, 'http://127.0.0.1').pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>effects</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
// A free port of its own, unless ENGINE_EFFECTS_PORT names one (never 6975,
// which is Eugene's): so this suite, the machine's own, `npm test` and a
// second worktree's run can all go at once (`listenOn`, harness.ts).
const PORT = await listenOn(server, Number(process.env.ENGINE_EFFECTS_PORT) || 0);
const BASE = `http://127.0.0.1:${PORT}/`;

// What the page is asked for: the contract's nine readings over one effect,
// that effect's own question, or what the whole kitchen costs. `base` is where
// the page imports the engine from and `rate` is the render's; the machine
// fills both in.
type Job =
  | { kind: 'effect'; id: string; base: string; rate?: number }
  | { kind: 'probe'; id: string; base: string; rate?: number }
  | { kind: 'cost'; base: string; rate?: number }
  | { kind: 'drive'; id: string; base: string; rate?: number };

/**
 * The same job as the machine asks for it, before those two are filled in.
 * The cost job names no effect, which is why the id is optional here where it
 * is not in the page's own.
 */
type Ask = { kind: Job['kind']; id?: string };

/**
 * A node factory on the context, as the counter reaches one. The twelve have
 * twelve different signatures and are wrapped by name, so what the table holds
 * is "any of them": what is being read is a count of the calls and never of
 * what they handed back, which is why the arguments are `any`.
 */
type NodeFactory = (...a: any[]) => AudioNode;

/** One click, as `meter.ts` reports one: the step, how far over the floor, and when. */
interface Click { step: number; ratio: number; t: number }

/** How far two renders are from each other at their worst, and where. */
interface Apart { worst: number; at: number }

/**
 * How one render is made: what to build the effect with, and whatever has to
 * be done to the instance once it exists — a bypass, a disposal, a trigger.
 */
interface RenderHow {
  params?: Record<string, number>;
  then?: (fx: EffectInstance, ctx: OfflineAudioContext) => void;
}

/** The tail with the feedback wide open, for the effects that have feedback. */
interface WorstCase { params: Record<string, number>; after: number; body: number; bad: number; peak: number }

/** Everything the contract's own questions come back as, for one effect in one engine. */
interface EffectReading {
  rate: number;
  ms: number;
  id: string;
  source: EffectSource;
  notes: number;
  nodes: number;
  declaredCost: EffectCost;
  declaredTail: number;
  declaredLatency: { seconds: number } | 'none';
  /** the knobs the descriptor declares, and the knobs the instance exposes */
  params: string[];
  exposed: string[];
  /** each exposed knob as `name:setter` or `name:param` */
  kinds: string[];
  bad: number;
  dc: number;
  dryDc: number;
  dryPeak: number;
  peak: number;
  truePeak: number;
  body: number;
  afterTail: number;
  tailFloor: number;
  click: Click;
  dryClick: Click;
  bypassApart: Apart;
  /** null for an effect that declares no mix */
  mixZeroApart: Apart | null;
  wireApart: Apart;
  lag: number;
  onset: { samples: number; peak: number };
  disposed: { tail: number; against: number; bad: number };
  worstCase: WorstCase | null;
}

/**
 * What a probe hands back. `id` and `what` are every row's; everything after
 * them is the effect's own reading, and which readings there are is a property
 * of which effect was asked — a reverb reports its rooms and a crusher its
 * error per bit. That is what the index signature says: an open set of
 * readings, gathered here and printed by name rather than read by it. The few
 * that are named are the ones this file does arithmetic on or reads at the
 * end.
 */
interface ProbeOut {
  id: string;
  what: string | null;
  ms?: number;
  /** the reverb's three rooms, each with what is left at half a second, one and two */
  rooms?: Array<{ mode: number; at: number[] }>;
  centreHz?: number;
  crestOpen?: number;
  crestShut?: number;
  crestFellDb?: number;
  levelChangeDb?: number;
  sharpPeak?: number;
  softPeak?: number;
  gapOpen?: number;
  gapShut?: number;
  body?: number;
  afterHalfSecond?: number;
  [reading: string]: unknown;
}

/** One effect in the cost table: what it cost, and what that is against the reference. */
interface CostRow {
  id: string;
  ms: number;
  nodes: number;
  cost: EffectCost;
  /** against a bare wire, and against `COST_REFERENCE` — filled in once every row is in */
  ratio?: number;
  relative?: number;
}

/** What the whole kitchen cost, in one engine. */
interface CostReading { rate: number; seconds: number; wire: number; rows: CostRow[]; ms: number }

/** What one engine's run leaves behind, for the two questions asked across engines at the end. */
interface EngineSeen {
  effects: Record<string, EffectReading>;
  probes: Record<string, ProbeOut>;
  cost: CostReading | null;
}

// Everything below runs in the page: it is serialised on its way there, so it
// closes over nothing and imports what it needs by URL from the two roots this
// file serves.
const RUN = async (job: Job) => {
  const S = job.base;
  const [VO, AU, AF, ME, FXR, DSP] = await Promise.all([
    import(`${S}src/voices/index.ts`),
    import(`${S}tools/audition.ts`),
    import(`${S}tools/audition-effects.ts`),
    import(`${S}tools/meter.ts`),
    import(`${S}src/effects/index.ts`),
    import(`${S}src/dsp.ts`),
  ]);
  const rate = job.rate || 44100;
  const began = performance.now();
  const r2 = (v: number, n = 2): number => +v.toFixed(n);
  const db = (v: number): number => r2(20 * Math.log10(Math.abs(v) + 1e-30));
  const channels = (buf: AudioBuffer, from = 0, to: number | null = null): [Float32Array, Float32Array] => {
    const a = Math.max(0, Math.round(from * buf.sampleRate));
    const b = Math.min(buf.length, Math.round((to == null ? buf.duration : to) * buf.sampleRate));
    return [buf.getChannelData(0).slice(a, b), buf.getChannelData(1).slice(a, b)];
  };
  const rms = ([L, R]: [Float32Array, Float32Array]): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / Math.max(1, 2 * L.length));
  };
  /**
   * The standing offset of a render, per channel. Round K4 added it because a
   * listener heard one: an asymmetric shaper leaves a DC term that follows the
   * envelope, so the output rail rides up and down with every note — a thump at
   * each onset and release and headroom gone. `master.ts` blocks DC at the end
   * of the record, so in a mix it is swallowed; a `voice`-scope insert rendered
   * into a wire, which is what every fixture here does, has nothing to swallow
   * it, and an effect that is only clean downstream of somebody else's blocker
   * is an effect nobody can measure.
   */
  const offset = ([L, R]: [Float32Array, Float32Array]): number => {
    let a = 0; let b = 0;
    for (let i = 0; i < L.length; i++) { a += L[i]; b += R[i]; }
    return Math.max(Math.abs(a / Math.max(1, L.length)), Math.abs(b / Math.max(1, R.length)));
  };
  const notNumbers = ([L, R]: [Float32Array, Float32Array]): number => {
    let n = 0;
    for (let i = 0; i < L.length; i++) { if (!Number.isFinite(L[i])) n++; if (!Number.isFinite(R[i])) n++; }
    return n;
  };
  const worstOf = (list: Click[]): Click => list.reduce((a, c) => (c.step > a.step ? c : a), { step: 0, ratio: 0, t: 0 });
  /** One magnitude at one frequency, windowed with a Blackman-Harris. */
  const magAt = (x: Float32Array, f: number, from: number, n: number): number => {
    const i0 = Math.round(from * rate);
    let re = 0; let im = 0; let norm = 0;
    for (let i = 0; i < n && i0 + i < x.length; i++) {
      const t = (2 * Math.PI * i) / (n - 1);
      const w = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
      const a = (2 * Math.PI * f * i) / rate;
      re += x[i0 + i] * w * Math.cos(a);
      im -= x[i0 + i] * w * Math.sin(a);
      norm += w;
    }
    return (2 * Math.sqrt(re * re + im * im)) / Math.max(1e-9, norm);
  };

  // --- the contract, the same six questions K1 asks --------------------------
  if (job.kind === 'effect') {
    const d = FXR.BY_ID[job.id];
    const scene = AF.fxSceneOf(job.id);
    const aud: Audition = AF.fxAudition(job.id);
    const prog = aud.program;
    const settings = prog.settings;
    const beat = 60 / prog.bpm;
    const stop = aud.window.to;
    const declared = d.tail === 'none' ? 0 : d.tail.seconds;
    const seconds = stop + Math.min(declared, 4) + 1;
    const onsets = prog.events.map((e) => e.t);

    const render = async (how: RenderHow | null = null, secs = seconds, { silent = false }: { silent?: boolean } = {}) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      let fx: EffectInstance | null = null;
      let nodes = 0;
      if (how) {
        const counters = ['createGain', 'createBiquadFilter', 'createOscillator', 'createWaveShaper',
          'createDelay', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner',
          'createChannelSplitter', 'createChannelMerger', 'createConstantSource', 'createBufferSource'];
        const real: Record<string, NodeFactory> = {};
        // The same context reached by name: the wrapping is of its own methods
        // and the two names are one object.
        const counted = ctx as unknown as Record<string, NodeFactory>;
        for (const k of counters) {
          real[k] = counted[k].bind(ctx);
          counted[k] = (...a) => { nodes++; return real[k](...a); };
        }
        fx = FXR.makeEffect(job.id, ctx, settings, { beat, ...(how.params || {}) }) as EffectInstance;
        for (const k of counters) counted[k] = real[k];
        fx.output.connect(out);
        if (how.then) how.then(fx, ctx);
      }
      // `silent` is for the one effect whose output is meant for an AudioParam:
      // it is measured with nothing fed in at all, because what it makes is not
      // made out of its input.
      if (!silent) AU.playAudition(ctx, aud, { dry: fx ? fx.input : out });
      const buf = await ctx.startRendering();
      return { buf, nodes, fx };
    };

    const dry = await render(null);
    const wet = await render({});
    const off = await render({ then: (fx) => fx.setBypass(true, 0) });
    const zero = 'mix' in d.params ? await render({ params: { mix: 0 } }) : null;
    const wire = await (async () => {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      const through = ctx.createGain();
      through.gain.value = 1;
      through.connect(out);
      AU.playAudition(ctx, aud, { dry: through });
      return ctx.startRendering();
    })();

    const apart = (a: AudioBuffer, b: AudioBuffer, from = 0): Apart => {
      const i0 = Math.round(from * rate);
      let worst = 0; let at = 0;
      for (let c = 0; c < 2; c++) {
        const A = a.getChannelData(c);
        const B = b.getChannelData(c);
        for (let i = i0; i < A.length; i++) {
          const dd = Math.abs(A[i] - B[i]);
          if (dd > worst) { worst = dd; at = i / rate; }
        }
      }
      return { worst, at: r2(at, 3) };
    };
    const lagOf = (a: AudioBuffer, b: AudioBuffer, from: number, span: number, max = 2048): number => {
      const A = a.getChannelData(0);
      const B = b.getChannelData(0);
      const i0 = Math.round(from * rate);
      const n = Math.min(Math.round(span * rate), A.length - i0 - max - 1);
      let best = 0; let top = -Infinity;
      for (let l = -max; l <= max; l++) {
        let acc = 0;
        for (let i = 0; i < n; i++) acc += A[i0 + i] * B[i0 + i + l];
        if (acc > top) { top = acc; best = l; }
      }
      return best;
    };

    const body = db(rms(channels(wet.buf, Math.max(0, stop - 4), stop)));
    const all = channels(wet.buf);
    const afterTail = db(rms(channels(wet.buf, Math.min(seconds - 0.3, stop + Math.min(declared, 4)), seconds)));

    let worstCase = null;
    if ('feedback' in d.params) {
      const hot: Record<string, number> = { feedback: d.params.feedback.max };
      if ('timeSeconds' in d.params) hot.timeSeconds = d.params.timeSeconds.max;
      if ('timeBeats' in d.params) hot.timeBeats = 0;
      if ('sizeSeconds' in d.params) hot.sizeSeconds = d.params.sizeSeconds.max;
      const secs = stop + declared + 1;
      const r = await render({ params: hot }, secs);
      worstCase = {
        params: hot,
        after: db(rms(channels(r.buf, stop + declared, secs))),
        body: db(rms(channels(r.buf, Math.max(0, stop - 4), stop))),
        bad: notNumbers(channels(r.buf)),
        peak: db(ME.samplePeak(channels(r.buf))),
      };
    }
    const let_go = await render({ then: (fx) => fx.dispose(stop) });

    // The latency, by an **impulse** rather than by a correlation peak, and
    // that is round K4's own correction to K1's recipe. Cross-correlating a
    // fixture against itself through an effect finds a peak only where the two
    // still look alike; through a reverb they do not — the wet half is a cloud
    // of noise with the same spectrum and no alignment — and the first run of
    // this gate read the reverb at **-452 samples**, a wet path leading its own
    // input by ten milliseconds, which is not a thing a causal graph can do. So
    // what is measured is when the output *starts*: one sample in, at a mix of
    // one where there is a mix, and the first sample out over a thousandth of
    // the peak. That is well defined for a convolution, for a compressor with a
    // look-ahead, and for a delay on one channel, which is every case the field
    // exists for.
    const onset = await (async () => {
      const wet1 = 'mix' in d.params ? { mix: 1 } : {};
      const ctx = new OfflineAudioContext(2, Math.ceil(0.5 * rate), rate);
      const fx = FXR.makeEffect(job.id, ctx, settings, { beat, ...wet1 });
      fx.output.connect(ctx.destination);
      const buf = ctx.createBuffer(2, Math.round(0.002 * rate), rate);
      for (let c = 0; c < 2; c++) {
        const ch = buf.getChannelData(c);
        // Two milliseconds of full-scale noise rather than one sample: a single
        // impulse through a highpass is almost nothing, and what is wanted is
        // an onset and not a spectrum.
        let sd = 1234567;
        for (let i = 0; i < ch.length; i++) { sd = (Math.imul(sd, 1103515245) + 12345) >>> 0; ch[i] = (sd / 2147483648) - 1; }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(fx.input);
      src.start(0.05);
      const out = await ctx.startRendering();
      const x = out.getChannelData(0);
      const y = out.getChannelData(1);
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]), Math.abs(y[i]));
      // A ten-thousandth and not a thousandth: a hall's first reflections are
      // deliberately thinned (`spaces.ts`'s `build`), so the tail takes a
      // couple of milliseconds to reach a thousandth of what it will be, and
      // that is the room's shape and not a delay in front of it.
      const floor = peak * 1e-4;
      let first = -1;
      for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > floor || Math.abs(y[i]) > floor) { first = i; break; }
      return { samples: first < 0 ? -1 : first - Math.round(0.05 * rate), peak: db(peak) };
    })();

    return {
      rate, ms: Math.round(performance.now() - began),
      id: job.id, source: scene.source, notes: prog.events.length,
      nodes: wet.nodes,
      declaredCost: d.cost, declaredTail: declared, declaredLatency: d.latency,
      params: Object.keys(d.params),
      exposed: Object.keys(wet.fx!.params),
      kinds: Object.entries(wet.fx!.params).map(([k, v]) => `${k}:${typeof v === 'function' ? 'setter' : 'param'}`),
      bad: notNumbers(all),
      dc: +offset(all).toFixed(6),
      dryDc: +offset(channels(dry.buf)).toFixed(6),
      dryPeak: db(ME.samplePeak(channels(dry.buf))),
      peak: db(ME.samplePeak(all)),
      truePeak: ME.truePeak(all),
      body,
      afterTail,
      tailFloor: r2(afterTail - body),
      click: worstOf(ME.clicks(all, rate, onsets)),
      dryClick: worstOf(ME.clicks(channels(dry.buf), rate, onsets)),
      bypassApart: apart(dry.buf, off.buf, 0.05),
      mixZeroApart: zero ? apart(dry.buf, zero.buf, 0) : null,
      wireApart: apart(dry.buf, wire, 0),
      lag: lagOf(dry.buf, wet.buf, Math.max(0.5, stop / 3), 0.5),
      onset,
      disposed: {
        tail: db(rms(channels(let_go.buf, stop, seconds))),
        against: db(rms(channels(wet.buf, stop, seconds))),
        bad: notNumbers(channels(let_go.buf)),
      },
      worstCase,
    };
  }

  // --- the second question: does it do what it is for? -----------------------
  if (job.kind === 'probe') {
    const scene = AF.fxSceneOf(job.id);
    const aud: Audition = AF.fxAudition(job.id);
    const beat = 60 / aud.program.bpm;
    const stop = aud.window.to;
    const secs = stop + 2;
    const make = async (
      params: Record<string, number>,
      { silent = false, then = null, seconds = secs }: { silent?: boolean; then?: RenderHow['then'] | null; seconds?: number } = {},
    ) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      const fx = FXR.makeEffect(job.id, ctx, aud.program.settings, { beat, ...params });
      fx.output.connect(out);
      if (then) then(fx, ctx);
      if (!silent) AU.playAudition(ctx, aud, { dry: fx.input });
      return ctx.startRendering();
    };
    const wet: Record<string, number> = { ...(scene.probe && scene.probe.params ? scene.probe.params : {}) };
    const out: ProbeOut = { id: job.id, what: scene.probe ? scene.probe.what : null };

    // A tone into the effect, for the ones whose answer is a spectrum. The
    // source is one oscillator and nothing else, so what a magnitude says is
    // what the effect did.
    const tone = async (hz: number, params: Record<string, number>, seconds = 1.2) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      o.connect(g);
      const fx = FXR.makeEffect(job.id, ctx, aud.program.settings, { beat, ...params });
      g.connect(fx.input);
      fx.output.connect(ctx.destination);
      o.start(0);
      o.stop(seconds);
      return ctx.startRendering();
    };

    if (job.id === 'reverb') {
      out.rooms = [];
      for (const mode of [0, 1, 2]) {
        const b = await make({ ...wet, mode }, { seconds: stop + 9 });
        const head = db(rms(channels(b, stop - 0.5, stop)));
        const rows = [0.5, 1, 2].map((t) => r2(db(rms(channels(b, stop + t, stop + t + 0.3))) - head));
        out.rooms.push({ mode, at: rows });
      }
    }
    if (job.id === 'shimmer') {
      // A 220 Hz tone in; what comes back an octave up is the loop's own work.
      // The octave is **searched for** rather than read at 440 Hz, because what
      // is being asked is two things at once — is there an octave, and is it in
      // tune — and a magnitude at one bin cannot tell a missing partial from a
      // flat one. The first run read -80 dB at 440 and the answer was that the
      // shifter was seven tenths of a semitone flat.
      const b = await tone(220, { ...wet, feedback: 0.7, shift: 1 }, 3);
      const x = b.getChannelData(0);
      const n = Math.round(0.4 * rate);
      out.fundamental = db(magAt(x, 220, 2.2, n));
      // The octave is read as a **band** and not as a bin, and the reason is
      // the shifter's own arithmetic. The two taps sit half a window apart, so
      // what comes out of them adds at the carrier only when the output
      // frequency times half the window is a whole number of cycles: at 440 Hz
      // and a 60 ms window that is 13.2, which is close enough to a half to
      // cancel. So the octave arrives as a **pair of sidebands** at the window's
      // own rate either side of 440 — 423 and 457 — with a null between them,
      // which is a 16.7 Hz warble and is what a granular shifter sounds like.
      // A bin at 440 reads -104 dB and says the octave is missing; the band
      // says it is there and where its middle is.
      let sum = 0; let weighted = 0; let bestHz = 440; let best = -999;
      for (let hz = 400; hz <= 484; hz += 1) {
        const v = magAt(x, hz, 2.2, n);
        sum += v;
        weighted += v * hz;
        if (v > best) { best = v; bestHz = hz; }
      }
      out.octaveBand = db(sum / 85);
      out.loudestAtHz = bestHz;
      out.centreHz = r2(weighted / Math.max(1e-30, sum), 1);
      out.centsOff = r2(1200 * Math.log2(out.centreHz / 440));
      out.atExactly440 = db(magAt(x, 440, 2.2, n));
      out.windowHz = r2(1 / 0.06, 1);
    }
    if (job.id === 'compressor') {
      // **Not the level**, and that took a reading to learn: a
      // `DynamicsCompressorNode` applies a make-up gain of its own, so the
      // compressed render came out 6 dB *louder* than the open one at the same
      // nominal settings and a gate reading "how much quieter" would have
      // failed a compressor for compressing. What a compressor does is to the
      // **crest factor** — the distance between the peak and the body — so that
      // is what is read, and the level change is printed beside it because it
      // is the engine's own doing and worth knowing.
      const open = await make({ ...wet, ratio: 1, thresholdDb: 0 });
      const shut = await make(wet);
      const crest = (buf: AudioBuffer): number => r2(db(ME.samplePeak(channels(buf))) - db(rms(channels(buf, 0.2, stop))));
      out.crestOpen = crest(open);
      out.crestShut = crest(shut);
      out.crestFellDb = r2(out.crestOpen - out.crestShut);
      out.levelChangeDb = r2(db(rms(channels(shut, 0.2, stop))) - db(rms(channels(open, 0.2, stop))));
      out.peakBefore = db(ME.samplePeak(channels(open)));
      out.peakAfter = db(ME.samplePeak(channels(shut)));
    }
    if (job.id === 'transient') {
      const flat = await make({ attack: 0, sustain: 0 });
      const up = await make({ attack: 1, sustain: 0 });
      const down = await make({ attack: -1, sustain: 0 });
      out.flatPeak = db(ME.samplePeak(channels(flat)));
      out.sharpPeak = db(ME.samplePeak(channels(up)));
      out.softPeak = db(ME.samplePeak(channels(down)));
      out.rangeDb = r2(out.sharpPeak - out.softPeak);
    }
    if (job.id === 'gate') {
      const open = await make({ ...wet, thresholdDb: -90 });
      const shut = await make(wet);
      // The quietest half-second of each: what a gate does is to the gaps.
      const quiet = (buf: AudioBuffer): number => {
        let worst = 0;
        for (let t = 0.5; t < stop - 0.5; t += 0.25) {
          const v = rms(channels(buf, t, t + 0.25));
          if (worst === 0 || v < worst) worst = v;
        }
        return db(worst);
      };
      out.gapOpen = quiet(open);
      out.gapShut = quiet(shut);
      out.shutBy = r2(out.gapShut - out.gapOpen);
      out.bodyOpen = db(rms(channels(open, 0.2, 0.6)));
      out.bodyShut = db(rms(channels(shut, 0.2, 0.6)));
    }
    if (job.id === 'duck') {
      // One ramp on a held chord, read where the ramp says its minimum is.
      const at = 4;
      const b = await make(wet, { then: (fx) => (fx.params.trigger as ParamSetter)(-9, at) });
      const flat = await make(wet);
      const w = (t0: number, t1: number): number => db(rms(channels(b, t0, t1))) - db(rms(channels(flat, t0, t1)));
      out.beforeDb = r2(w(at - 0.4, at - 0.05));
      out.minimumDb = r2(w(at + 0.055, at + 0.075));
      out.recoveredDb = r2(w(at + 0.55, at + 0.9));
    }
    if (job.id === 'fuzz') {
      const b = await tone(220, { ...wet, octave: 1, mix: 1 }, 1.2);
      const x = b.getChannelData(0);
      const n = Math.round(0.5 * rate);
      const f = db(magAt(x, 220, 0.4, n));
      out.fundamentalDb = f;
      out.octaveDb = r2(db(magAt(x, 440, 0.4, n)) - f);
      const c = await tone(220, { ...wet, octave: 0, mix: 1 }, 1.2);
      const y = c.getChannelData(0);
      out.atOctaveZeroDb = r2(db(magAt(y, 440, 0.4, n)) - db(magAt(y, 220, 0.4, n)));
    }
    if (job.id === 'crush') {
      // **The quantisation error and not a count of levels.** Counting distinct
      // sample values reads 420 for a four-bit crusher, because the anti-fizz
      // lowpass behind the staircase interpolates between its treads — which is
      // the effect working and not the effect failing. What a bit depth is, is
      // the size of the error, and every bit taken away should double it.
      const at = async (bits: number) => {
        const b = await tone(220, { bits, mix: 1, tone: 18000, drive: 1, level: 1 }, 0.6);
        return b.getChannelData(0);
      };
      const clean = await at(16);
      const rows = [];
      for (const bits of [12, 8, 6, 4, 3]) {
        const x = await at(bits);
        let acc = 0; let n = 0;
        for (let i = Math.round(0.2 * rate); i < Math.round(0.5 * rate); i++) { const e = x[i] - clean[i]; acc += e * e; n++; }
        rows.push({ bits, errorDb: r2(20 * Math.log10(Math.sqrt(acc / n) + 1e-30)) });
      }
      out.error = rows;
      out.perBitDb = r2((rows[rows.length - 1].errorDb - rows[0].errorDb) / (rows[0].bits - rows[rows.length - 1].bits));
    }
    if (job.id === 'filter' || job.id === 'ladder') {
      // The slope: two magnitudes an octave apart, both over the corner.
      const corner = 900;
      const rows = [];
      for (const hz of [corner, corner * 2, corner * 4]) {
        const b = await tone(hz, { cutoffHz: corner, resonanceDb: 0, drive: 0, mix: 1 }, 0.8);
        rows.push(db(magAt(b.getChannelData(0), hz, 0.3, Math.round(0.4 * rate))));
      }
      out.atCornerDb = r2(rows[0]);
      out.oneOctaveDb = r2(rows[1] - rows[0]);
      out.twoOctavesDb = r2(rows[2] - rows[0]);

      // The three things a resonant filter with a shaper in it can do wrong,
      // asked of it directly. Round K4 added them because a listener heard the
      // first one before any gate did.
      //
      // A **sawtooth** is the source on purpose: it is the worst case for a
      // filter, and its own wrap is a step of nearly two in one sample, which is
      // why what is asserted is that a *sweep* does not make that step bigger
      // rather than that the step is small. It is round K3's rule about a
      // cymbal's own edge, said about a waveform's.
      const saw = async (params: Record<string, number>, sweep: boolean) => {
        const secs = 2.2;
        const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
        const src = ctx.createOscillator();
        src.type = 'sawtooth';
        src.frequency.value = 110;
        const g = ctx.createGain();
        g.gain.value = 0.5;
        src.connect(g);
        const fx = FXR.makeEffect(job.id, ctx, aud.program.settings, { beat, mix: 1, ...params });
        g.connect(fx.input);
        fx.output.connect(ctx.destination);
        // Eight commands, as a gesture over two bars would write them — and
        // written **both ways the contract allows**, because these two effects
        // hand the corner over differently: the ladder's is a setter, since its
        // corner is two nodes, and the multimode's is the AudioParam itself,
        // since its corner is one. A gesture writing a sweep has to work on
        // either, and so does the gate that measures one.
        if (sweep) {
          for (let i = 0; i < 8; i++) {
            const to = 300 + i * 900;
            const at = 0.1 + i * 0.2;
            const knobbed = fx.params.cutoffHz;
            if (typeof knobbed === 'function') knobbed(to, at, 0.2);
            else { knobbed.setValueAtTime(knobbed.value, at); knobbed.linearRampToValueAtTime(to, at + 0.2); }
          }
        }
        src.start(0);
        src.stop(2);
        const b = await ctx.startRendering();
        const x = b.getChannelData(0);
        let step = 0; let at = 0;
        for (let i = 1; i < Math.round(1.9 * rate); i++) {
          const d = Math.abs(x[i] - x[i - 1]);
          if (d > step) { step = d; at = i / rate; }
        }
        let dc = 0;
        for (let i = 0; i < x.length; i++) dc += x[i];
        return { step: r2(step, 4), at: r2(at, 3), dc: +(dc / x.length).toFixed(6) };
      };
      // Parked at the **top of the sweep** and not in the middle of it: the
      // control has to be the corner that passes the most of the sawtooth's own
      // edge, or the comparison reads "a higher cutoff lets more through",
      // which it does and which is not the question. A first pass parked it at
      // 3900 against a sweep ending at 6600 and read a growth of 1.49 that was
      // entirely the corner.
      const parked = await saw({ cutoffHz: 6600 }, false);
      const swept = await saw({}, true);
      out.parkedStep = parked.step;
      out.sweptStep = swept.step;
      out.sweepGrowth = r2(swept.step / Math.max(1e-9, parked.step));

      // The offset, at the declared defaults and with everything wide open. A
      // filter may not make DC at any setting: `ladder.ts` carries what this
      // read before it was symmetric.
      const hot = await saw({ resonanceDb: 22, drive: 1 }, false);
      out.dcAtDefaults = parked.dc;
      out.dcWideOpen = hot.dc;

      // And the one a four-pole with feedback round it would fail: at the
      // highest resonance and the highest drive, is anything still sounding a
      // second after the source stopped? A filter that self-oscillates is an
      // oscillator, and this one has no feedback path to do it with — which is
      // a claim worth checking rather than asserting.
      {
        const secs = 3;
        const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
        const src = ctx.createOscillator();
        src.type = 'sawtooth';
        src.frequency.value = 180;
        const g = ctx.createGain();
        g.gain.value = 0.6;
        src.connect(g);
        const fx = FXR.makeEffect(job.id, ctx, aud.program.settings, { beat, mix: 1, resonanceDb: 22, drive: 1 });
        g.connect(fx.input);
        fx.output.connect(ctx.destination);
        src.start(0);
        src.stop(0.4);
        const b = await ctx.startRendering();
        out.body = db(rms(channels(b, 0.1, 0.4)));
        out.afterHalfSecond = db(rms(channels(b, 0.9, 1.4)));
        out.afterTwoSeconds = db(rms(channels(b, 2, 3)));
        out.ringsOnDb = r2(out.afterHalfSecond - out.body);
      }
    }
    if (job.id === 'eq') {
      const flat = await tone(900, { midDb: 0 }, 0.8);
      const bell = await tone(900, wet, 0.8);
      const n = Math.round(0.4 * rate);
      out.bellDb = r2(db(magAt(bell.getChannelData(0), 900, 0.3, n)) - db(magAt(flat.getChannelData(0), 900, 0.3, n)));
      const away = await tone(200, wet, 0.8);
      const awayFlat = await tone(200, { midDb: 0 }, 0.8);
      out.twoOctavesBelowDb = r2(db(magAt(away.getChannelData(0), 200, 0.3, n)) - db(magAt(awayFlat.getChannelData(0), 200, 0.3, n)));
    }
    if (job.id === 'autoWah') {
      // How far the corner travels: a bandpass at two levels, read at two
      // frequencies. What is asserted is that a loud input passes more of the
      // top than a quiet one does.
      const at = async (gain: number) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(1.2 * rate), rate);
        const src = DSP.noiseSource(ctx, 0, 1.2);
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(g);
        const fx = FXR.makeEffect('autoWah', ctx, aud.program.settings, { beat });
        g.connect(fx.input);
        fx.output.connect(ctx.destination);
        const b = await ctx.startRendering();
        const x = b.getChannelData(0);
        const n = Math.round(0.5 * rate);
        return { low: db(magAt(x, 400, 0.5, n)), high: db(magAt(x, 2600, 0.5, n)) };
      };
      const quiet = await at(0.02);
      const loud = await at(0.9);
      out.quiet = quiet;
      out.loud = loud;
      out.openedByDb = r2((loud.high - loud.low) - (quiet.high - quiet.low));
    }
    if (job.id === 'formant') {
      const rows = [];
      for (const hz of [270, 730, 2290]) {
        const b = await tone(hz, { vowel: 0, mix: 1 }, 0.8);
        rows.push(r2(db(magAt(b.getChannelData(0), hz, 0.3, Math.round(0.4 * rate)))));
      }
      out.atFormantsOfA = rows;
      const flat = await make({ mix: 0 });
      const bank = await make({ mix: 1 });
      out.bankLossDb = r2(db(rms(channels(bank, 1, stop))) - db(rms(channels(flat, 1, stop))));
    }
    if (job.id === 'autoPan') {
      // The power over one sweep, and it is measured on a **mono** source for a
      // reason that is in the specification and is easy to be caught by:
      // `StereoPannerNode` is a constant-power panner for a mono input and a
      // *balance* control for a stereo one. Fed the stereo fixture it swings by
      // 13 dB across a full sweep, because a balance at the extremes throws one
      // channel away; fed a mono source it is flat, which is the law the effect
      // claims. Both readings are here, because an instance of this on a stereo
      // bus is the first case and a caller should know it.
      const swing = async (stereo: boolean): Promise<number> => {
        const ctx = new OfflineAudioContext(2, Math.ceil(4 * rate), rate);
        const fx = FXR.makeEffect('autoPan', ctx, aud.program.settings, { beat, depth: 1, rateHz: 2, mix: 1 });
        fx.output.connect(ctx.destination);
        const src = DSP.noiseSource(ctx, 0, 4);
        const g = ctx.createGain();
        g.gain.value = 0.3;
        if (!stereo) {
          // One channel of the noise, taken to both: a mono source, explicitly.
          const sp = ctx.createChannelSplitter(2);
          const mg = ctx.createChannelMerger(2);
          src.connect(sp);
          sp.connect(mg, 0, 0);
          sp.connect(mg, 0, 1);
          mg.connect(g);
        } else src.connect(g);
        g.connect(fx.input);
        const b2 = await ctx.startRendering();
        const [L, R] = channels(b2, 1, 3);
        let lo = Infinity; let hi = 0;
        const win = Math.round(0.02 * rate);
        for (let i = 0; i + win < L.length; i += win) {
          let acc = 0;
          for (let j = 0; j < win; j++) acc += (L[i + j] * L[i + j] + R[i + j] * R[i + j]);
          const v = Math.sqrt(acc / win);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        return r2(db(hi) - db(lo));
      };
      out.powerSwingDb = await swing(false);
      out.onAStereoBusDb = await swing(true);
    }
    if (job.id === 'lfoParam') {
      // With nothing fed in at all: what comes out is the modulation, and what
      // is measured is its rate and its depth.
      const b = await make({ depth: 1, offset: 0, rateHz: 4 }, { silent: true, seconds: 3 });
      const x = b.getChannelData(0);
      const n = Math.round(1 * rate);
      out.atRateDb = db(magAt(x, 4, 1, n));
      out.atTwiceDb = db(magAt(x, 8, 1, n));
      let peak = 0;
      for (let i = Math.round(1 * rate); i < Math.round(2 * rate); i++) peak = Math.max(peak, Math.abs(x[i]));
      out.peak = r2(peak, 4);
      const flat = await make({ depth: 0, offset: 0.5 }, { silent: true, seconds: 1 });
      out.offsetHolds = r2(flat.getChannelData(0)[Math.round(0.5 * rate)], 4);
    }
    if (job.id === 'width') {
      const b = await make(wet);
      const n = await make({ width: 0 });
      const ms = (buf: AudioBuffer): number => {
        const [L, R] = channels(buf, 1, stop);
        let m = 0; let s = 0;
        for (let i = 0; i < L.length; i++) { const a = (L[i] + R[i]) / 2; const c = (L[i] - R[i]) / 2; m += a * a; s += c * c; }
        return r2(10 * Math.log10((s + 1e-30) / (m + 1e-30)));
      };
      out.sideOverMidWide = ms(b);
      out.sideOverMidMono = ms(n);
    }
    if (job.id === 'haas') {
      const rows = [];
      for (const delayMs of [3, 12, 30]) {
        const b = await make({ delayMs });
        const [L, R] = channels(b, 1, stop);
        let sum = 0; let one = 0;
        for (let i = 0; i < L.length; i++) { const s = (L[i] + R[i]) / 2; sum += s * s; one += L[i] * L[i]; }
        rows.push({ delayMs, monoDb: r2(10 * Math.log10((sum + 1e-30) / (one + 1e-30))) });
      }
      out.mono = rows;
    }
    if (job.id === 'mono') {
      const b = await make({ cornerHz: 200, amount: 1 });
      out.cornerHz = 200;
      const sideAt = async (hz: number, buf: AudioBuffer): Promise<number> => {
        const [L, R] = channels(buf, 1, Math.min(stop, 6));
        const s = new Float32Array(L.length);
        for (let i = 0; i < L.length; i++) s[i] = (L[i] - R[i]) / 2;
        return db(magAt(s, hz, 0, Math.round(0.5 * rate)));
      };
      const raw = await make({ mix: 0 });
      out.sideBelow = r2(await sideAt(100, b) - await sideAt(100, raw));
      out.sideAbove = r2(await sideAt(1200, b) - await sideAt(1200, raw));
    }
    out.ms = Math.round(performance.now() - began);
    return out;
  }

  // --- what the whole kitchen costs ------------------------------------------
  // A drive's level against the reference (tools/drive-level.ts): the table
  // points and the default, and what they are held to.
  if (job.kind === 'drive') {
    const DL = await import(`${S}tools/drive-level.ts`);
    return DL.driveReadings(job.id, AU.effectAudition().program.settings, rate);
  }

  if (job.kind === 'cost') {
    // A minute of looping noise, three times each, fastest taken — K1's own
    // recipe, and the source is nearly nothing on purpose: measured against the
    // *voice* fixture every effect reads 1.0x, because eight ensemble notes
    // build a hundred nodes between them.
    const settings = AU.effectAudition().program.settings;
    const seconds = 60;
    const wireOf = async () => {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const src = DSP.noiseSource(ctx, 0, seconds);
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(g);
      g.connect(ctx.destination);
      const t0 = performance.now();
      await ctx.startRendering();
      return performance.now() - t0;
    };
    const through = async (id: string) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const src = DSP.noiseSource(ctx, 0, seconds);
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(g);
      let nodes = 0;
      const counters = ['createGain', 'createBiquadFilter', 'createOscillator', 'createWaveShaper',
        'createDelay', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner',
        'createChannelSplitter', 'createChannelMerger', 'createConstantSource', 'createBufferSource'];
      const real: Record<string, NodeFactory> = {};
      const counted = ctx as unknown as Record<string, NodeFactory>;
      for (const k of counters) { real[k] = counted[k].bind(ctx); counted[k] = (...a) => { nodes++; return real[k](...a); }; }
      const fx = FXR.makeEffect(id, ctx, settings, { beat: 0.5 });
      for (const k of counters) counted[k] = real[k];
      g.connect(fx.input);
      fx.output.connect(ctx.destination);
      const t0 = performance.now();
      await ctx.startRendering();
      return { ms: performance.now() - t0, nodes };
    };
    let wire = Infinity;
    for (let i = 0; i < 3; i++) wire = Math.min(wire, await wireOf());
    const rows: CostRow[] = [];
    for (const id of FXR.EFFECTS) {
      let best: { ms: number; nodes: number } | null = null;
      for (let i = 0; i < 3; i++) {
        const r = await through(id);
        if (!best || r.ms < best.ms) best = r;
      }
      rows.push({ id, ms: Math.round(best!.ms), nodes: best!.nodes, cost: FXR.EFFECT_COST[id] });
    }
    // Against one named effect and not against the cheapest of the set: round
    // K4 measured K1's own six against the cheapest of twenty-six and every one
    // of them read 2.08x what it had read before, with nothing about the
    // effects changed. `COST_REFERENCE` is the fixed point.
    const ref: { ms: number } = rows.find((r) => r.id === FXR.COST_REFERENCE) || { ms: Math.min(...rows.map((r) => r.ms)) };
    for (const r of rows) {
      r.ratio = r2(r.ms / wire);
      r.relative = r2(r.ms / ref.ms);
    }
    rows.sort((a, b) => a.ms - b.ms);
    return { rate, seconds, wire: Math.round(wire), rows, ms: Math.round(performance.now() - began) };
  }

  // All three kinds are answered above, so nothing the type allows reaches
  // here; it is what a job from somewhere else would be told.
  return { error: `no job called ${(job as Job).kind}` };
};

// --- 2. every one of the twenty, in every engine ----------------------------
let pw: PlaywrightFound | null = null;
try {
  pw = await playwright();
  console.log(`  ${pw.label}`);
} catch (e) {
  skipped.push(`the effects: ${(e as Error).message.split('\n')[0]}`);
}

const seen: Record<string, EngineSeen> = {};
/** One drive's readings, per engine, for the gate and for `--bless-drive`. */
interface DriveReading { engine?: string; id: string; knob: string; fractions: number[]; points: number[]; table: number[]; def: number; atDefault: number; target: number; loud: number[]; loudTarget: number }
const driveSeen: Record<string, DriveReading[]> = {};
// How far a drive may read off its target, in LU: the band the brief of
// round I states, and twice what the gate's two engines disagree by.
const DRIVE_BAND_DB = 1;
if (pw) {
  // Both engines at once and, inside each, every offline job handed to one
  // pool the moment the engine starts; the kitchen's cost is a clock and runs
  // `alone` (`lanes.ts`). Each engine's lines are kept and printed whole, in
  // the order `--jobs 1` prints them.
  const browsers: Record<string, PlaywrightThing> = {};
  for (const engine of ENGINES) {
    if (!pw.pw[engine]) { skipped.push(`the effects in ${engine}: playwright does not know it`); continue; }
    try {
      browsers[engine] = await pw.pw[engine].launch(launchOptions(engine));
    } catch (e) {
      skipped.push(`the effects in ${engine}: it is not installed (${(e as Error).message.split('\n')[0].slice(0, 60)})`);
      continue;
    }
    renice(browsers[engine]);
  }
  const pool = lanes(JOBS, Object.keys(browsers));
  const inEngine = async (engine: string): Promise<void> => {
    const browser = browsers[engine];
    say(`  ${engine}`);
    seen[engine] = { effects: {}, probes: {}, cost: null };
    const run = async (job: Ask) => {
      const page: PlaywrightThing = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(e.message));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      const out = await page.evaluate(RUN, { ...job, base: BASE });
      await page.close();
      if (VERBOSE) say(`        ${job.kind} ${job.id || ''} ${JSON.stringify(out)}`);
      if (errors.length) bad(`${job.kind} ${job.id} in ${engine}: the page threw: ${errors.join(' | ')}`);
      return out;
    };
    // Every offline job this engine will ask for, handed to the pool now; the
    // assertions below read them in their own order.
    const OFFLINE: Ask[] = [
      ...WANT.map((id) => ({ kind: 'effect', id }) as Ask),
      ...WANT.filter((x) => SCENES_FX.find((s) => s.id === x && s.probe)).map((id) => ({ kind: 'probe', id }) as Ask),
      ...Object.keys(DRIVES).filter((x) => !ONLY || x === ONLY).map((id) => ({ kind: 'drive', id }) as Ask),
    ];
    const ahead = new Map<string, Promise<any>>();
    for (const job of OFFLINE) ahead.set(JSON.stringify(job), pool.run(() => run(job)));
    pool.done(engine);
    const offline = (job: Ask) => {
      const got = ahead.get(JSON.stringify(job));
      if (!got) throw new Error(`${job.kind} ${job.id || ''} was not handed to the pool`);
      return got;
    };

    for (const id of WANT) {
      const r: EffectReading = await offline({ kind: 'effect', id });
      seen[engine].effects[id] = r;
      const wantLag = r.declaredLatency === 'none' ? 0 : Math.round(r.declaredLatency.seconds * r.rate);
      // A declared latency is a **bound** over the whole range where the range
      // is a range — the Haas's delay is a knob — so what is held is that the
      // onset does not arrive later than the declaration allows, and that a
      // declared `none` starts at nought. The reading is the impulse's, not the
      // correlation's; both are reported.
      const lagOff = Math.max(0, (Math.max(0, r.onset.samples) - wantLag) / r.rate) * 1000;
      const clicked = r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio;
      const tailOk = r.tailFloor <= KITCHEN.tailFloorDb;
      const worstOk = !r.worstCase || r.worstCase.after - r.worstCase.body <= KITCHEN.tailFloorDb;
      const keptTail = Math.abs(r.disposed.tail - r.disposed.against) <= KITCHEN.disposeDb;
      const declaredNodes = FX.COST_BANDS[r.declaredCost].nodes;
      const exposed = r.exposed.slice().sort().join(' ') === r.params.slice().sort().join(' ');
      const zeroOk = !r.mixZeroApart || r.mixZeroApart.worst <= KITCHEN.identity;
      // **An effect that is not a drive may not make DC.** A rectifier is a DC
      // generator by definition and that is what the octave in a fuzz *is*, so
      // the drive family is exempt and says so; everything else is held to a
      // ten-thousandth, which is -80 dBFS. It is the gate that would have caught
      // `ladder` before a listener did: it read 0.0702 on a tone at its declared
      // defaults, which is -23 dBFS of offset moving with the envelope.
      const dcOk = FX.BY_ID[r.id].family === 'drive' || r.dc - r.dryDc <= KITCHEN.dcFloor;
      must(
        r.bad === 0 && exposed && r.truePeak <= GATES.truePeakDbTP && r.peak <= GATES.samplePeakDbFS &&
          !clicked && r.bypassApart.worst <= KITCHEN.identity && zeroOk && dcOk &&
          lagOff <= KITCHEN.latencyMs && tailOk && worstOk && keptTail && r.nodes <= declaredNodes,
        `${r.id}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${exposed ? '' : `it declares ${r.params.join(', ')} and exposes ${r.exposed.join(', ')}; `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS; ` : ''}${clicked ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s; ` : ''}${r.bypassApart.worst > KITCHEN.identity ? `bypassed it is ${r.bypassApart.worst} away from its own input at ${r.bypassApart.at} s, where a bare wire is ${r.wireApart.worst}; ` : ''}${zeroOk ? '' : `at a mix of nought it is ${r.mixZeroApart!.worst} away from its own input at ${r.mixZeroApart!.at} s; `}${dcOk ? '' : `it adds ${round(r.dc - r.dryDc, 6)} of DC to the ${r.dryDc} its own dry leaves; `}${lagOff > KITCHEN.latencyMs ? `it declares ${JSON.stringify(r.declaredLatency)} of latency and its output starts ${r.onset.samples} samples after its input, which is ${round(lagOff, 3)} ms past it; ` : ''}${tailOk ? '' : `${r.tailFloor} dB is still sounding a declared tail (${r.declaredTail} s) after the input stopped; `}${worstOk ? '' : `at ${JSON.stringify(r.worstCase && r.worstCase.params)} the tail is still at ${r.worstCase && round(r.worstCase.after - r.worstCase.body)} dB after its declared ${r.declaredTail} s; `}${keptTail ? '' : `let go at the instant its input stopped, its tail lost ${round(r.disposed.against - r.disposed.tail)} dB; `}${r.nodes > declaredNodes ? `it declares ${r.declaredCost} and makes ${r.nodes} nodes` : ''}`,
        `${r.id} through ${r.notes} notes of the ${r.source} fixture: ${r.nodes} nodes, ${r.exposed.length} knobs, ${r.peak} dBFS / ${r.truePeak} dBTP against the dry's ${r.dryPeak}, worst click ${r.click.step} at ${r.click.ratio}x (the dry's own is ${r.dryClick.step}), ${r.dc} of DC (the dry's own is ${r.dryDc}), **bypassed it is its own input** (${r.bypassApart.worst}${r.mixZeroApart ? ` and ${r.mixZeroApart.worst} at a mix of nought` : ', and it declares no mix'}, where a bare wire here is ${r.wireApart.worst}), its output starts ${r.onset.samples} samples after an impulse (the music correlates at ${r.lag}) against a declared ${JSON.stringify(r.declaredLatency)}, ${r.tailFloor} dB left ${r.declaredTail ? `${r.declaredTail} s` : 'the moment'} after the input stopped${r.worstCase ? `, ${round(r.worstCase.after - r.worstCase.body)} dB after the declared tail at its hottest` : ''}, letting it go kept it within ${round(Math.abs(r.disposed.tail - r.disposed.against), 2)} dB (${r.ms} ms)`
      );
    }

    // What each is actually for, measured. A probe prints; the four that carry
    // an assertion are the four where a number can be wrong rather than merely
    // surprising.
    for (const id of WANT.filter((x) => SCENES_FX.find((s) => s.id === x && s.probe))) {
      const r = await offline({ kind: 'probe', id });
      seen[engine].probes[id] = r;
      const say = Object.entries(r)
        .filter(([k]) => !['id', 'what', 'ms'].includes(k))
        .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ');
      const claims: Record<string, () => boolean> = {
        // A gate that does not shut is not a gate.
        gate: () => r.shutBy <= -10,
        // A duck that does not duck is not a duck: the minimum has to be within
        // two decibels of the nine it was asked for, and it has to come back.
        duck: () => Math.abs(r.minimumDb - -9) <= 2.5 && r.recoveredDb >= -2,
        // An octave that is not there is not an octave.
        fuzz: () => r.octaveDb > r.atOctaveZeroDb + 10,
        // A constant-power pan does not dip.
        autoPan: () => r.powerSwingDb <= 3,
        // Mono under the corner and untouched over it.
        mono: () => r.sideBelow <= -20 && r.sideAbove >= -1.5,
        // The octave has to be in the loop, and in tune: a shimmer with no
        // octave in it is a reverb, and one a semitone flat is a fault.
        // The octave is read as a band round 440 and not at 440: see the probe,
        // where the two taps' own interference is measured rather than
        // explained away. What would be a fault is no energy near the octave at
        // all, or a band whose middle is not the octave.
        shimmer: () => r.octaveBand > r.fundamental - 40 && Math.abs(r.centsOff) <= 80,
        // A resonant filter with a shaper in it: no DC at any setting, no
        // energy left over when the source stops, and a sweep that does not
        // make the source's own edge bigger than parking the cutoff does.
        ladder: () => Math.abs(r.dcAtDefaults) <= 1e-4 && Math.abs(r.dcWideOpen) <= 1e-4
          && r.ringsOnDb <= -60 && r.sweepGrowth <= 1.25,
        filter: () => Math.abs(r.dcAtDefaults) <= 1e-4 && Math.abs(r.dcWideOpen) <= 1e-4
          && r.ringsOnDb <= -60 && r.sweepGrowth <= 1.25,
        // A compressor that does not narrow the distance between the peak and
        // the body is not a compressor.
        compressor: () => r.crestFellDb >= 2,
        // A bit crusher whose error does not grow as the bits come off is not
        // quantising anything. Six decibels a bit is the arithmetic; four is the
        // band, because a lowpass sits behind the staircase.
        crush: () => r.perBitDb >= 4,
      };
      const claim = claims[id];
      must(
        !claim || claim(),
        `${id}: ${r.what} — ${say}`,
        `${id}, ${r.what}: ${say} (${r.ms} ms)`
      );
    }

    {
      const r = await pool.alone(() => run({ kind: 'cost' }));
      seen[engine].cost = r;
      const over = r.rows.filter((row: CostRow) => row.relative! > FX.COST_BANDS[row.cost].relative || row.nodes > FX.COST_BANDS[row.cost].nodes);
      must(
        !over.length,
        `${over.length} effects cost more than the class they declare: ${over.map((x: CostRow) => `${x.id} is ${x.cost} and renders at ${x.relative}x the cheapest of them in ${x.nodes} nodes`).join('; ')}`,
        `what the whole kitchen costs, ${r.seconds} s of looping noise through a wire in ${r.wire} ms: ${r.rows.map((x: CostRow) => `${x.id} ${x.ms} ms (${x.relative}x, ${x.nodes} nodes, ${x.cost})`).join(', ')} — ${r.ms} ms in all`
      );
    }
    // **A drive is loudness-neutral where the rota's inserts live, and never
    // adds loudness above it.** Pink noise through each drive-family effect at
    // a mix of 1, every other knob at its default, at both ends of the drive,
    // its quarters, its first eighth and sixteenth and its default: at -36 dBFS
    // out within a decibel of its input (or, for the two filters, of their own
    // loudness with no drive), and at -18 dBFS no more than a decibel over it —
    // a drive may compress a loud signal, it may not add to one
    // (tools/drive-level.ts says why the two levels). Round F found why it has
    // to be asserted: the overdrive at its default drive was 9.6 dB over its
    // input at -18 and more at a note's own level, the rota wrote only its mix,
    // and a pad under it drove the master into half its blocks.
    for (const id of Object.keys(DRIVES).filter((x) => !ONLY || x === ONLY)) {
      const r = await offline({ kind: 'drive', id });
      (driveSeen[id] = driveSeen[id] || []).push({ ...r, engine });
      const off = [...r.table, r.atDefault].map((v: number) => Math.abs(v - r.target));
      const added = Math.max(...r.loud.map((v: number) => v - r.loudTarget));
      const at = (v: number, i: number) => `${r.knob} ${r.points[i]} ${v - r.target >= 0 ? '+' : ''}${round(v - r.target)}`;
      const atLoud = (v: number, i: number) => `${r.points[i]} ${v - r.loudTarget >= 0 ? '+' : ''}${round(v - r.loudTarget)}`;
      const onWhat = r.target === 0 ? 'its input' : 'itself undriven';
      must(
        Math.max(...off) <= DRIVE_BAND_DB && added <= DRIVE_BAND_DB,
        `${id} in ${engine}: pink noise at -36 dBFS comes out ${r.table.map(at).join(', ')} and ${round(r.atDefault - r.target)} at its default ${r.def} dB on ${onWhat}; at -18 dBFS ${r.loud.map(atLoud).join(', ')} — run --bless-drive`,
        `${id} is loudness-neutral across its drive in ${engine}: pink noise at -36 dBFS in, ${r.table.map(at).join(', ')} and ${round(r.atDefault - r.target)} at its default ${r.def} dB on ${onWhat}; at -18 dBFS nowhere over (${r.loud.map(atLoud).join(', ')})`
      );
    }
  };
  const engines = await Promise.all(Object.keys(browsers).map((engine) => captured(() => inEngine(engine))));
  for (const { lines } of engines) for (const line of lines) console.log(line);
  for (const browser of Object.values(browsers)) await browser.close();
}

server.close();

// The make-up tables, written from what both engines read: each point moved by
// the mean of how far it read off its target. The effect's make-up is a gain
// after its shaper, so one pass lands it.
if (BLESS_DRIVE) {
  console.log('\nblessing the drives');
  for (const [id, seenIn] of Object.entries(driveSeen)) {
    // In the engines' order, whichever finished first: the mean is summed in it.
    const rows = seenIn.slice().sort((x, y) => ENGINES.indexOf(x.engine!) - ENGINES.indexOf(y.engine!));
    const file = path.join(SRC, 'effects', `${id}.ts`);
    const text = fs.readFileSync(file, 'utf8');
    const mAt = text.match(/export const MAKEUP_AT = \[([^\]]*)\];/);
    const mDb = text.match(/export const MAKEUP_DB = \[([^\]]*)\];/);
    if (!mAt || !mDb) { console.log(`  ${id}: no MAKEUP_AT and MAKEUP_DB in ${id}.ts`); continue; }
    const oldAt = mAt[1].split(',').map(Number);
    const oldDb = mDb[1].split(',').map(Number);
    // What the old table gave at each point measured now, in decibels.
    const was = (f: number) => 20 * Math.log10(makeupAt(oldAt, oldDb, f));
    const at = rows[0].fractions;
    const old = at.map((f) => round(was(f), 2));
    const next = at.map((f, i) => round(was(f) - rows.reduce((a: number, r: DriveReading) => a + (r.table[i] - r.target), 0) / rows.length, 2));
    fs.writeFileSync(file, text.replace(mAt[0], `export const MAKEUP_AT = [${at.join(', ')}];`).replace(mDb[0], `export const MAKEUP_DB = [${next.join(', ')}];`));
    console.log(`  ${id}: [${old.join(', ')}] -> [${next.join(', ')}]`);
  }
  console.log('\nre-run without --bless-drive to check them.');
}

// The identity, said once for the whole round rather than twenty times per
// engine — K1's own closing assertion, over K4's twenty.
if (seen.chromium && seen.firefox) {
  const ids = Object.keys(seen.chromium.effects).filter((id) => seen.firefox.effects[id]);
  if (ids.length) {
    const worst = Math.max(...ids.flatMap((id) => [
      seen.chromium.effects[id].bypassApart.worst, seen.firefox.effects[id].bypassApart.worst,
      seen.chromium.effects[id].mixZeroApart ? seen.chromium.effects[id].mixZeroApart.worst : 0,
      seen.firefox.effects[id].mixZeroApart ? seen.firefox.effects[id].mixZeroApart.worst : 0,
    ]));
    must(
      worst <= KITCHEN.identity,
      `an effect is ${worst} away from its own input where it promised to be it`,
      `${ids.length} effects bypassed and at a mix of nought, in two engines: every render is its own dry to within what a bare unity gain costs there — ${Math.max(...ids.map((id) => seen.firefox.effects[id].bypassApart.worst))} in firefox, ${Math.max(...ids.map((id) => seen.chromium.effects[id].bypassApart.worst))} in chromium, against the ${Math.max(...ids.map((id) => seen.chromium.effects[id].wireApart.worst))} a wire costs there`
    );
  }
  // The one probe whose result is a statement about the two engines rather than
  // about the effect: a `DynamicsCompressorNode` is the engine's own and they do
  // not implement it the same way.
  const C = seen.chromium.probes.compressor;
  const F = seen.firefox.probes.compressor;
  if (C && F) {
    console.log(`  note  the same compressor at the same settings: the crest factor falls ${C.crestFellDb} dB in chromium and ${F.crestFellDb} in firefox, and the level moves ${C.levelChangeDb} and ${F.levelChangeDb} — the node is the engine's, its make-up gain is its own, and the detector is not a knob`);
  }
}

finish({ failed, skipped });
