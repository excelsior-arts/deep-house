// The arithmetic every instrument of the drum kitchen does, once.
//
// Round K3 of PLAN-KITCHEN. `held.ts` is the precedent: the second and third
// held voice moved the state machine out of `strings.ts` rather than copying
// it, and sixteen percussion instruments would otherwise be sixteen copies of
// the same four decisions. What is here is exactly those four and nothing an
// instrument's own sound:
//
//   the body      pre-rendered, per variant, once per context. `hats.ts` is
//                 where this engine learned it — six oscillators and four
//                 filters per hit was 47 % of the audio thread — and the split
//                 it found is the one every drum here uses: the buffer holds
//                 the instrument's *timbre* at a constant overall level, with
//                 its pitch drop, its slap and its spectral decay baked in,
//                 and the **overall** decay is the per-hit envelope. So a
//                 hit's decay can follow its velocity without anything being
//                 rendered again, which is what a drum played by a person
//                 does.
//   the spread    four numbers off the strike time and nothing else: which of
//                 the few rendered tones this hit reads, how fast it reads it,
//                 how loud it is, how long it rings — and, here, where it
//                 stands. The dice are the time itself, so the same bar of the
//                 same theme varies the same way in the mix, in a render and
//                 in a slice of a render, and nothing reads a seed the plan
//                 does not already have.
//   the velocity  a harder hit is brighter and rings longer, because the
//                 buffer is read faster and the envelope is given more time.
//                 Not a second filter: a filter per hit is what the hats were
//                 measured out of.
//   the width     the output is pinned to two channels, explicitly. Round G:
//                 a stream of the wrong width meeting the graph's mid/side
//                 stage is mono to the sample in one engine and 0.0266 apart
//                 in the other, and `mono` is a promise about the whole voice.
//
// An instrument is a value — `{ id, seed, spec, variant, build }` — and the
// module that declares it holds nothing else but its descriptor and its own
// four lines of sound.

import { route, panner, MIN_RELEASE, startTime, lcg, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams, PrepareHook, VoiceCost, VoiceRenderer } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { cached, bound, holding, offline } from './render-cache.ts';
import { patchOf } from './sound.ts';
import { makeUp, meanSquare, ringOf, tailFor, tailRamps } from './hat-grain.ts';
import type { SoundRow, Topology } from './sound.ts';
import { num, BODY_SECONDS, CENTS, LEVEL, PAN, SECONDS, SEND, SPREAD, VARIANTS } from './schema.ts';
import type { Contract, Fields, PatchOf } from './schema.ts';

/**
 * One articulation, as the instrument that makes it states it: everything
 * fixed about this sound.
 *
 * The named fields are the ones the machinery below reads, and they are all it
 * reads. Everything else in here — a tuning, a lid, the decay of a slap — is
 * the instrument's own and is handed back to its own `variant` and `build`
 * untouched, which is why the index signature is `any`: a shape stated here
 * would be every drum in the kitchen written out twice.
 */
export interface DrumSpec {
  /** what this articulation is, as a word: the key the rendered bodies are cached under */
  key: string;
  /** how long one rendered body is, in seconds */
  seconds: number;
  /** how many channels it is rendered in; two unless the instrument says otherwise */
  channels?: number;
  /** how many tones are rendered, so that two hits in a row are not one buffer */
  variants?: number;
  /** the instrument's own decay: how long it takes to fall ten decibels */
  t10: number;
  attack?: number;
  /** the one family trim, in gain */
  trim?: number;
  rateSpread?: number;
  gainSpread?: number;
  decaySpread?: number;
  panSpread?: number;
  velBright?: number;
  velDecay?: number;
  pan?: number;
  room?: number;
  delay?: number;
  reverb?: number;
  [field: string]: any;
}

/**
 * One instrument of the kitchen, as its own module states it.
 */
export interface DrumInstrument {
  /** the event name, and the key in the settings table */
  id: string;
  /**
   * this instrument's own offset in the strike-time dice, so two instruments
   * struck on the same sixteenth are not the same hit twice
   */
  seed: number;
  /**
   * the articulation this hit is: everything fixed about the sound, out of the
   * settings and whatever the note asked for
   */
  spec(p: NoteParams, settings: Settings): DrumSpec;
  /**
   * the k'th rendered tone, with k centred on nought. A variant is not the same
   * drum a little detuned: its partials have to beat differently, or two
   * buffers are one buffer
   */
  variant(spec: DrumSpec, k: number): DrumSpec;
  /**
   * the sound itself, at a constant overall level, started at `at` and stopped
   * `spec.seconds` later
   */
  build(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void;
}

// --- what a strike decides --------------------------------------------------

// The strike hash, the one the hats read as well (`hats.ts` asks `strikeDice`
// and `variantK` here), and it is here rather than in `dsp.ts` for the reason
// that file gives: `phasedLfo` is a node, and this is four numbers.
function hash(x: number): number {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** The five numbers one hit gets, each of them nought to one. */
export interface StrikeDice {
  variant: number;
  rate: number;
  gain: number;
  decay: number;
  pan: number;
}

/**
 * The five numbers this hit gets, off the strike time and the instrument's own
 * offset in it.
 */
export function strikeDice(time: number, seed: number): StrikeDice {
  const x = time * 1000 + seed;
  return {
    variant: hash(x),
    rate: hash(x + 7.77),
    gain: hash(x + 19.19),
    decay: hash(x + 41.41),
    pan: hash(x + 57.05),
  };
}

// --- the rendered bodies ----------------------------------------------------

/** Every rendered tone of one articulation, or the promise of them while they are in the air. */
export type DrumBodies = AudioBuffer[] | Promise<AudioBuffer[]>;

const cache = new WeakMap<BaseAudioContext, Map<string, DrumBodies>>();



const variants = (spec: DrumSpec): number => Math.max(1, Math.round(spec.variants ?? 1));

/** The k of the i'th variant: centred on nought, so one variant is the spec itself. */
export const variantK = (i: number, n: number): number => (n < 2 ? 0 : (i % n) - (n - 1) / 2);

/**
 * The body of one variant, rendered. It is the instrument at a constant
 * overall level: the envelope is the hit's, never the buffer's.
 */
function renderBody(ctx: BaseAudioContext, inst: DrumInstrument, spec: DrumSpec): Promise<AudioBuffer> {
  return offline(ctx, spec.channels ?? 2, Math.ceil(spec.seconds * ctx.sampleRate), (off) => inst.build(off, spec, off.destination, 0));
}

/**
 * Every rendered tone of one articulation, once per context. Returns the array
 * where it is ready and the promise while it is not, which is what lets a hit
 * that arrives before its buffers exist fall back to building the same sound
 * live rather than going silent.
 */
//
// Through the shared render cache (`render-cache.ts`, R30 of the reconciled
// review of 09-24): a render that fails leaves its key empty, where it used to
// stay a rejected promise for the life of the context; the renders are jobs,
// rationed with the piano's and the hats'; one asked for by a hit (`defer`) is
// started off the tick. And the map is **bounded** (R79): a body is keyed on
// every resolved field of its colour — the congas' membrane controls write
// the whole spec into the key — so a set that walks its colours kept every one
// it had ever rendered. `DRUM_BODIES` is far more than a theme strikes (a
// kitchen theme draws a handful of articulations); the oldest go first, and
// one still rendering is kept.
//
// **One permit per variant, not per articulation** (E01 of the outside review of
// 10-03). The entry used to be one job around all of an articulation's
// variants, each its own OfflineAudioContext, so four admitted jobs were twelve
// contexts alive at once for the three-variant conga, bongo, snare and tom.
// Each variant is its own render now (`offline`), and the entry is only the
// promise of all of them — it holds no permit, so it cannot wait on the
// permits its own variants need. And the cap is held when an entry lands as
// well as when one is asked for (E02): a preparation that asked for more than
// `DRUM_BODIES` at once is trimmed back to it as they finish, where it used
// to keep every one until the next miss.
export const DRUM_BODIES = 64;
export function bodiesFor(ctx: BaseAudioContext, inst: DrumInstrument, spec: DrumSpec, defer = false): DrumBodies {
  let per = cache.get(ctx);
  if (!per) {
    per = new Map();
    cache.set(ctx, per);
  }
  const n = variants(spec);
  const key = `${inst.id}:${spec.key}:${n}:${spec.seconds}`;
  const hit = per.get(key);
  if (hit !== undefined) {
    // A read refreshes the order, so what a theme strikes is never the oldest.
    per.delete(key);
    per.set(key, hit);
    return hit;
  }
  const got = cached(per, ctx, key, () => {
    const specs: DrumSpec[] = [];
    for (let i = 0; i < n; i++) specs.push(inst.variant(spec, variantK(i, n)));
    return Promise.all(specs.map((s) => renderBody(ctx, inst, s)));
  }, defer);
  bound(per, DRUM_BODIES);
  return got;
}

/** What one context's drum bodies hold: the completed entries, which `DRUM_BODIES` bounds, and the ones in flight. */
export const drumBodies = (ctx: BaseAudioContext): { ready: number; flight: number } => holding(cache.get(ctx));

/**
 * The pre-render hook a module declares: the bodies of the articulations its
 * own events actually ask for, before the first one wants them.
 *
 * It returns at once when there are no events, and that is not an optimisation
 * — `prepareVoices` is called on every theme the record plays, and a kitchen
 * that rendered sixteen instruments there would cost every v1 theme a dozen
 * offline renders for a sound nothing in it can draw.
 *
 * @param events this hook's own voices' events, handed over by `prepareVoices`
 */
export function warmDrums(
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
  insts: Record<string, DrumInstrument>,
): Promise<void> {
  if (!events || !events.length) return Promise.resolve();
  const waits: Promise<AudioBuffer[]>[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const inst = insts[e.voice];
    if (!inst) continue;
    const spec = inst.spec(e.p || {}, settings);
    if (seen.has(`${inst.id}:${spec.key}`)) continue;
    seen.add(`${inst.id}:${spec.key}`);
    const got = bodiesFor(ctx, inst, spec);
    if (got instanceof Promise) waits.push(got);
    // a kit hat with a grain is held to the level of the same hat without it (`strike`)
    if (grained(spec)) {
      const plain = bodiesFor(ctx, inst, plainOf(spec));
      if (plain instanceof Promise) waits.push(plain);
    }
  }
  return Promise.all(waits).then(() => undefined);
}

// A kit hat's grain (round SPARK-2, `hat-grain.ts`), and the same hat without it.
const grained = (spec: DrumSpec): boolean => (spec.top ?? 0) > 0 || (spec.air ?? 0) > 0 || (spec.tail ?? 0) > 0;
const plainOf = (spec: DrumSpec): DrumSpec => ({ ...spec, top: 0, air: 0, tail: 0, key: `${spec.key}:plain` });

// --- one hit ----------------------------------------------------------------

/**
 * A hit of one instrument of the kitchen.
 *
 * Eight nodes where the buffers are ready: a source, the envelope, the pan and
 * whatever sends the articulation declares. Nothing here builds a filter, and
 * that is the hats' finding and not a preference.
 *
 * @returns the instant the hit is silent
 */
export function strike(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams,
  inst: DrumInstrument,
  settings: Settings,
  at?: number,
): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const spec = inst.spec(p, settings);
  const vel = p.vel ?? 1;
  // Off the event's own time in its theme where the deck says it (R74), so a
  // bar varies the same way live, rendered and after a seek; a slice of a
  // program counts its events from its own start, so a window rolls as its
  // own theme would. Off the context's clock only where nothing hands a time
  // (a fixture).
  const d = strikeDice(at ?? time, inst.seed);
  const n = variants(spec);

  // A louder hit is a brighter hit — on a struck drum because the head moves
  // further and the skin stiffens, here because the buffer is read faster —
  // and every hit is a few tens of cents off its neighbours. Held to a half
  // and a double, which is the hats' own clamp: a rate outside that is an
  // instrument and not a spread.
  const rate = Math.max(0.5, Math.min(2,
    (1 + (spec.rateSpread ?? 0) * (2 * d.rate - 1)) * (1 + (spec.velBright ?? 0) * (vel - 0.9))));

  // ...and a louder hit rings longer, which is the other half of the same
  // gesture and the half a sampler cannot do at all.
  const t10 = Math.max(0.004, spec.t10
    * (1 + (spec.decaySpread ?? 0) * (2 * d.decay - 1))
    * (1 + (spec.velDecay ?? 0) * (vel - 0.9)));
  // A kit hat's `tail` (round SPARK-2, `hat-grain.ts`) rings on at its first
  // slope to -20 dB before the dive; every other drum has none and rings 3.4 t10.
  const tail = tailFor(spec.tail ?? 0, spec.t10);
  const dur = t10 * ringOf(tail) + 0.02;

  const g = ctx.createGain();
  // Two channels leave every voice of this kitchen, explicitly. Round G
  // measured what becomes of a stream of the wrong width inside the graph's
  // mid/side stage, and the answer was not the same in both engines; the two
  // alternative kicks are as mono as the measured one and say so by being the
  // same samples in both channels by construction, not by an up-mixing rule.
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const bodies = bodiesFor(ctx, inst, spec, true);
  const ready = Array.isArray(bodies) && dur * rate + 0.02 <= spec.seconds;
  // A grained kit hat at its grainless energy (round SPARK-2): the body's power
  // and the envelope's, against the same variant of the plain body.
  let held = 1;
  const vi = Math.min(n - 1, Math.floor(d.variant * n));
  if (ready && grained(spec)) {
    const plain = bodiesFor(ctx, inst, plainOf(spec), true);
    if (Array.isArray(plain)) held = makeUp(meanSquare(plain[vi]), meanSquare(bodies[vi]), t10, tail, Math.max(0.0008, spec.attack ?? 0.0025));
  }
  if (ready) {
    const src = ctx.createBufferSource();
    src.buffer = bodies[vi];
    src.playbackRate.value = rate;
    src.start(time);
    src.stop(time + dur + 0.02);
    src.connect(g);
  } else {
    // The same sound, built where it stands. A hit that lands before its
    // bodies exist is the first bar of a page that started playing while the
    // renders were still in the air; it is not silent, it simply pays for
    // itself. The level is the same either way, because nothing here is
    // normalised: what the builder writes into a buffer is what it writes into
    // a graph.
    inst.build(ctx, inst.variant(spec, variantK(Math.floor(d.variant * n), n)), g, time);
  }

  // `trim` is the one family trim and it is here rather than in the level
  // table for the hats' reason: every measured room writes its own levels, and
  // a change to the table would never reach the minute a listener is hearing.
  // `gainSpread` is this hit's own — under a decibel, which is a drummer and
  // not a fader.
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * (spec.trim ?? 1) * held
    * (1 + (spec.gainSpread ?? 0) * (2 * d.gain - 1)));
  // A *linear* attack from true zero, the kick's contract: an exponential from
  // a ten-thousandth spends its last fraction of a millisecond crossing 60 dB,
  // which is a step, and the step is the loudest sample of the hit.
  const attack = Math.max(0.0008, spec.attack ?? 0.0025);
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  // -10 dB at t10, the benchmark's own unit, then the dive to the floor
  const floorAt = tailRamps(g.gain, time, peak, t10, tail, GAIN_FLOOR);
  g.gain.linearRampToValueAtTime(0, floorAt + MIN_RELEASE);
  const end = floorAt + MIN_RELEASE;

  // Where it stands, and it moves a little: a pair of hands is not a point
  // source and a player does not hit the same spot twice. The spread is the
  // fifth die and it is what makes `mono: false` true of a drum whose body is
  // one channel.
  const pan = panner(ctx, Math.max(-1, Math.min(1,
    (p.pan ?? spec.pan ?? 0) + (spec.panSpread ?? 0) * (2 * d.pan - 1))));
  g.connect(pan);
  route(ctx, pan, out, { dry: p.dry ?? 1, room: p.room ?? spec.room ?? 0, delay: p.delay ?? spec.delay ?? 0, reverb: p.reverb ?? spec.reverb ?? 0,
    ...(p.background !== undefined ? { background: p.background } : {}) });
  return end;
}

// --- the small sources every body is made of --------------------------------

/**
 * Noise, as samples, deterministic and one channel: a body is rendered once
 * and read back for the life of a context, so two hits differ because the
 * *spread* says so and never because the noise did.
 *
 * `dsp.ts`'s `noiseBuffer` is two correlated channels and two seconds long,
 * which is what a hat reads a different stretch of every hit. A drum body here
 * is shorter than that and the same every time, so it carries its own.
 */
export function drumNoise(ctx: BaseAudioContext, seconds: number, seed = 20260918): AudioBufferSourceNode {
  const len = Math.max(16, Math.ceil(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const white = lcg(seed);
  for (let i = 0; i < len; i++) d[i] = white();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** A biquad, with the one thing this engine keeps getting wrong written down. */
export function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  hz: number,
  q = 0.707,
  gain = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  // Web Audio's `Q` on a **lowpass and a highpass** is decibels of resonance
  // at the corner and not a linear Q (`master.ts` and the effects kitchen both
  // carry this note; Butterworth is -3.01). On a bandpass, a notch, an allpass
  // and a peaking filter the same field *is* a quality factor, which is the
  // trap: the two readings differ by an order of magnitude and both compile.
  f.Q.value = q;
  if (type === 'peaking' || type === 'highshelf' || type === 'lowshelf') f.gain.value = gain;
  return f;
}

/** One oscillator of a body: where it is tuned, where it is struck from, how loud. */
export interface TunedTone {
  type?: OscillatorType;
  hz: number;
  /** the multiple of `hz` the note is struck at, before the drop */
  from?: number;
  /** how long the drop takes */
  over?: number;
  level?: number;
  detune?: number;
}

/**
 * A tuned body: one oscillator with a pitch drop, at a constant level.
 *
 * The drop is what makes a struck head a drum rather than a tone — the skin is
 * tightest at the moment it is hit — and it is exponential in frequency, which
 * is a straight line in semitones.
 */
export function tuned(
  ctx: BaseAudioContext,
  { type = 'sine', hz, from = 1, over = 0.04, level = 1, detune = 0 }: TunedTone,
  dest: AudioNode,
  at: number,
  seconds: number,
): GainNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(hz * from, at);
  if (from !== 1) o.frequency.exponentialRampToValueAtTime(hz, at + over);
  const g = ctx.createGain();
  g.gain.value = level;
  o.connect(g);
  g.connect(dest);
  o.start(at);
  o.stop(at + seconds);
  return g;
}

/**
 * A transient inside a body: a burst that dies away while the body rings on.
 *
 * This is the part of the split that matters. The buffer is rendered at a
 * constant *overall* level so the hit's own envelope can be velocity's, but
 * the pieces inside it decay against each other — a slap dies in twenty
 * milliseconds under a head that rings for a second — and that relative shape
 * is the instrument.
 */
export function transient(
  ctx: BaseAudioContext,
  source: AudioNode,
  decay: number,
  dest: AudioNode,
  at: number,
  level = 1,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, at);
  g.gain.exponentialRampToValueAtTime(Math.max(1e-5, level * 0.0001), at + Math.max(0.002, decay));
  source.connect(g);
  g.connect(dest);
  return g;
}

// --- a kit drum as a row ------------------------------------------------------

/**
 * The fields every kit drum's spec carries to `strike` and `bodiesFor`, each
 * in its range (`schema.ts`): how long a body is (the buffer it allocates),
 * how many are rendered (a bounded count), and the per-hit spreads. A kit
 * topology's contract spreads the ones its rows carry.
 */
export const KIT = {
  t10: SECONDS,
  seconds: BODY_SECONDS,
  variants: VARIANTS,
  variantCents: CENTS,
  attack: SECONDS,
  trim: LEVEL,
  rateSpread: SPREAD,
  gainSpread: SPREAD,
  decaySpread: SPREAD,
  panSpread: SPREAD,
  velBright: num(0, 4),
  velDecay: num(0, 4),
  pan: PAN,
  room: SEND,
  delay: SEND,
} as const;
//
// Round R2 of the sounds. An instrument of the kitchen was a module: a spec
// out of its settings block, a variant, a body, an offset in the strike dice
// and a descriptor. The first three are how the sound is made and they are the
// topology's; the block, the offset and the descriptor are the sound's and
// they are a row (`sounds/<family>/<id>.json`, `sound.ts`). `kitTopology` is
// the one place the two meet, so a kit module states its build and nothing
// else.

/**
 * The rows that share one pre-render pass. Their bodies are warmed in one walk
 * of their events, in time order, as a module's `INSTS` always were — the
 * per-context cache is bounded and evicts the oldest, so the order bodies are
 * made in is part of the sound and a module split into topologies must not
 * split its pass.
 */
export interface Kit {
  instruments: Record<string, DrumInstrument>;
  prepare: PrepareHook;
}

export function kit(): Kit {
  const instruments: Record<string, DrumInstrument> = {};
  return { instruments, prepare: (ctx, settings, events) => warmDrums(ctx, settings, events, instruments) };
}

/** What a kit topology states: its build, and the contract its rows' parameters keep (`schema.ts`). */
export interface KitBuild<S extends Fields> {
  id: string;
  cost: VoiceCost;
  parameters: Contract<S>;
  /** everything fixed about this hit, out of the row's patch (the room's copy of it) and the note */
  spec(patch: PatchOf<S>, p: NoteParams): DrumSpec;
  variant(spec: DrumSpec, k: number): DrumSpec;
  build(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void;
  /** the pass this topology's rows are warmed in; its own when absent */
  kit?: Kit;
}

// What a patch is, as a short word for a cache key: the same numbers are the
// same word, whichever object holds them, and an object is read once.
const prints = new WeakMap<object, string>();
function printOf(o: object): string {
  let s = prints.get(o);
  if (s === undefined) {
    const text = JSON.stringify(o);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    s = (h >>> 0).toString(36);
    prints.set(o, s);
  }
  return s;
}

/**
 * A kit topology: every row of it struck through `strike`, with the row's own
 * offset in the strike dice (`dice`) and its numbers read off the resolved
 * settings' block where it names one.
 *
 * The rendered bodies are keyed by the patch they were made of as well as by
 * the articulation (E05/E06 of the outside review of 10-03): one row under two
 * rooms that voice its block differently, or two rows with one articulation's
 * name, are two bodies, never one body read for the other.
 */
export function kitTopology<S extends Fields>(b: KitBuild<S>): Topology {
  const shelf = b.kit ?? kit();
  return {
    id: b.id,
    cost: b.cost,
    parameters: b.parameters,
    render(row: SoundRow): VoiceRenderer {
      const inst: DrumInstrument = {
        id: row.id,
        seed: row.dice as number,
        spec: (p: NoteParams, s: Settings) => {
          const patch = patchOf(s, row, b.parameters);
          const spec = b.spec(patch, p);
          spec.key = `${printOf(patch)}:${spec.key}`;
          return spec;
        },
        variant: b.variant,
        build: b.build,
      };
      shelf.instruments[row.id] = inst;
      return (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number =>
        strike(ctx, out, time, p, inst, settings, at);
    },
    prepare: shelf.prepare,
    check: (row) => (Number.isFinite(row.dice) ? [] : [`${row.id}: a kit drum carries its offset in the strike dice as \`dice\``]),
  };
}
