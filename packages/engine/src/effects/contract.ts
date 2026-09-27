// What an effect is allowed to say about itself, and what a built one hands
// back.
//
// This is the technique registry PLAN-SCALE §2.3 sketched and the design
// review's §8 sharpened: *an effect contract needs its parameter schema and
// units, inputs and outputs, lifecycle, setup cost, latency, tail behaviour,
// bypass behaviour, and automatable controls. A global `applies: ['bass']` is
// not enough to wire a graph.* So every one of those is a field here, and the
// gate in `tools/test.ts` fails on a descriptor that leaves one out.
//
// The arrangement is the voices' arrangement, on purpose: one module per
// effect, its descriptor beside the code that makes the sound,
// `effects/index.ts` gathering them into one ordered REGISTRY that every
// derived table comes off. And the same sentence holds about it —
// **the registry is a lookup table and never the pool a composer draws from.**
// No die reads this file; a strategy's candidate lists name what they want,
// and until one does, an effect registered here is dormant and no seed moves.
//
// Two things this file is deliberately not:
//
//   It is **not a gesture vocabulary.** "Become background", "throw", "leave a
//   hole", "open the filter" are policies that write automation and move
//   events; they live in the composer's `performance.ts` and they *use* DSP.
//   An effect here is an audio implementation and knows nothing about bars,
//   phrases or who is in front. The design review draws that line and round K1
//   keeps it: `performance.ts` is untouched.
//
//   It is **not a routing table.** `scope` and `applies` say where an effect
//   may reasonably be put and what it is for; they do not wire a graph. A
//   strategy that wires one states the instances, the order, the sends and the
//   gain staging, and that is a composer's file.

import { BUSES, FAMILIES as VOICE_FAMILIES } from '../voices/descriptor.ts';
import type { Settings } from '../settings.ts';

/** What the effect *does*. Closed: a word that is not here is a word nobody agreed to. */
export const FAMILIES = ['time', 'dynamics', 'drive', 'tone', 'motion', 'space'] as const;

/**
 * Where an instance of it lives.
 *
 *   voice   an insert on one note's own chain, built and let go with the note
 *   bus     an insert on one of the graph's five buses, for the life of a theme
 *   send    a parallel line something is sent *to*, returning to a bus
 *   master  an insert on the tail the whole set shares
 */
export const SCOPES = ['voice', 'bus', 'send', 'master'] as const;

/**
 * What it costs to run, as a class rather than a number, because the number is
 * a property of the machine it runs on and the class is a property of the
 * effect. MEASURED and never guessed: `tools/test.ts --verbose` renders the
 * fixture through each effect and prints its node count and its render time
 * against the dry chain, and `COST_BANDS` below is what those two readings are
 * read as. A phone ceiling is `costOf` over a strategy's whole chain.
 */
export const COSTS = ['cheap', 'mid', 'dear'] as const;

/**
 * How often a parameter is read: `a` is per sample and `k` is per block or at
 * build. It is the Web Audio distinction, written down, because a caller that
 * wants to sweep a knob over a bar needs to know which knobs can be swept.
 *
 * An `a` parameter may be handed over as the AudioParam itself or as a setter
 * that writes one — the ramp underneath is the same ramp either way — and a `k`
 * one is always a setter, because a knob that is three nodes' worth of
 * arithmetic has no single AudioParam to hand over.
 */
export const RATES = ['a', 'k'] as const;

/**
 * The units a parameter may be in. Closed, so that "rate" means the same thing
 * in every module and a caller converting beats to seconds does it once.
 *
 *   hz       cycles a second — an LFO's rate, a filter's corner
 *   beats    the same thing in the music's own time. **A beats parameter of 0
 *            means "not in beats": use the hz or seconds one beside it.** It is
 *            resolved against `params.beat` (the seconds of one beat), which a
 *            caller hands the builder and which is not itself a parameter; with
 *            no beat it is ignored, and the effect is in seconds
 *   seconds  a delay time, a tail
 *   ms       the same, where the numbers are small enough that seconds read as
 *            noise: a chorus depth, a flanger's delay
 *   db       decibels
 *   ratio    a fraction, a mix, a feedback, a drive — dimensionless
 *   index    a choice, as a number: a shape, a flag, a count of voices
 */
export const UNITS = ['hz', 'beats', 'seconds', 'ms', 'db', 'ratio', 'index'] as const;

export type EffectFamily = typeof FAMILIES[number];
export type EffectScope = typeof SCOPES[number];
export type EffectCost = typeof COSTS[number];
export type ParamRate = typeof RATES[number];
export type ParamUnit = typeof UNITS[number];

/** One knob: what it is in, where it may go, where it starts, how fast it is read. */
export interface ParamSpec {
  unit: ParamUnit;
  min: number;
  max: number;
  default: number;
  rate: ParamRate;
}

/**
 * A parameter of a built effect: either the AudioParam itself, where one node's
 * one parameter *is* the knob and the caller may automate it with the whole Web
 * Audio vocabulary, or a setter where the knob is arithmetic over several nodes
 * — a mix that is two gains, a drive that is a pre-gain and a curve.
 *
 * The setter's shape is the held voice's (`voices/voice-contract.ts`): a value,
 * the instant it takes effect and the ramp it takes to get there, so the same
 * handle serves an offline render that schedules everything before a sample is
 * computed and a live context that finds out what it wants while the sound is
 * playing. `over` of nought is a step, and a step still takes the engine's
 * minimum ramp, because nothing in this machine moves a gain without one.
 */
export type ParamSetter = (value: number, at?: number, over?: number) => void;
export type EffectParam = AudioParam | ParamSetter;

/**
 * One effect, running.
 *
 * `input` and `output` are nodes and nothing else: a caller connects into one
 * and out of the other and never reaches inside. Which is the whole point of
 * the scope vocabulary — the same instance is an insert on a voice, an insert
 * on a bus or the far end of a send depending only on what is connected to it.
 */
export interface EffectInstance {
  /** connect the source here */
  input: AudioNode;
  /** connect this onward */
  output: AudioNode;
  /**
   * every knob the descriptor declares, by the name it declares it under. A
   * setter clamps to the declared range on every write (`guardParams`); an
   * AudioParam handed over raw is the stated escape hatch and does not
   */
  params: Record<string, EffectParam>;
  /**
   * The bypass, which is **arithmetic and not a switch**: the dry path goes to
   * exactly 1 and the wet to exactly 0, so a bypassed effect is its own input
   * and not a near-miss of it. `tools/test.ts` asserts it in two engines, with
   * the honest tolerance a measurement found: identical to the sample in
   * Firefox, and one float32 ULP away in Chromium — which is what a *unity gain
   * node* costs there with no effect in the graph at all, so the same run
   * renders the fixture through a bare wire and holds the bypassed effect to
   * being no further off than that.
   */
  setBypass(on: boolean, at?: number, over?: number): void;
  /**
   * Let it go. **The tail policy: the tail finishes, and then it disconnects.**
   * Sources stop at the end of the declared tail and the output is
   * disconnected there, so a delay that is let go at a seam rings out instead
   * of being cut off — which is the design review's *removing an input must
   * allow an effect tail to finish; releasing an instrument is different from
   * disposing its graph.*
   *
   * An offline render has no clock to wait on and no device to protect, so
   * there the sources are stopped at the end of the tail and nothing is
   * disconnected: the render ends and the graph goes with it.
   */
  dispose(at?: number): void;
}

/**
 * What a builder is handed.
 *
 * `settings` is the resolved room, for the same reason every voice is handed
 * one: a room is a value somebody owns and never a global (round C). None of
 * the first six reads it — they are made out of their own parameters — and it
 * is in the signature all the same, so the day an effect wants the room's own
 * reverb seconds there is no signature to change.
 *
 * `params` is the declared knobs, each optional and each falling back to its
 * own default, plus one reserved key that is not a knob:
 *
 *   beat   the seconds of one beat, from whatever is playing. It is what a
 *          `beats` parameter is resolved against. It is not a parameter
 *          because it is not the effect's to choose: a delay in dotted eighths
 *          is one number at 120 BPM and another at 70, and the effect is the
 *          same effect.
 */
export type EffectParams = Record<string, number> & { beat?: number };

/**
 * `at` is the instant the instance begins: every source it makes — an LFO, a
 * wander, a shifter's ramp — is started there, so a phase declared on a knob is
 * the phase at the note, live and rendered alike. A per-note insert passes the
 * note's time; until R28 of the reconciled review of 09-24 every source was
 * started at nought, which is *now* live (up to a look-ahead before the note)
 * and the head of the render offline (eight minutes of oscillator before a note
 * at minute eight). A bus or master instance, which begins when it is built,
 * leaves it out.
 */
export type EffectBuilder = (
  ctx: BaseAudioContext,
  settings: Settings,
  params?: EffectParams,
  at?: number,
) => EffectInstance;

/**
 * One effect, as the module that makes it describes it.
 */
export interface EffectDescriptor {
  /** the name a strategy's candidate list would say. It never changes */
  id: string;
  family: EffectFamily;
  scope: EffectScope;
  /**
   * What it is *for*: the graph's buses (`kick`, `sub`, `drums`, `melodic`,
   * `keys`) and the voices' own families (`drum`, `bass`, `keyboard`,
   * `ensemble`, `noise`, `effect`), never a voice's name. Both vocabularies are
   * the ones already written down in `voices/descriptor.ts`, so the gate reads
   * a real list rather than a copy of one, and an effect that claims to apply
   * to something nobody declares fails.
   */
  applies: string[];
  params: Record<string, ParamSpec>;
  /** MEASURED, in the round that wrote it; see COST_BANDS */
  cost: EffectCost;
  /** the query switch, for listening: `?fx=chorus:0` and the like, for free */
  bypass: string;
  /**
   * How long the output can go on sounding after its input stops — **the bound
   * over the whole declared parameter range**, not the reading at the defaults,
   * because a caller tearing a graph down needs a number that is true of the
   * instance it actually built. `'none'` means nothing outlives the block: a
   * filter's own ringing is not a tail.
   */
  tail: { seconds: number } | 'none';
  /**
   * What the wet path is delayed by against its own input, which a caller
   * summing it with a dry path has to align or comb. MEASURED by
   * cross-correlation in both engines; `'none'` means zero samples, and a
   * bypassed instance is its input to the sample, which is the same statement.
   */
  latency: { seconds: number } | 'none';
  /**
   * For anything with a shaper in it: what the WaveShaper is asked to
   * oversample at. Declared because round G measured four decibels between two
   * engines' up-samplers on the same curve, so this is a number a listener can
   * hear and not an implementation detail.
   */
  oversample?: OverSampleType;
  /**
   * **What its output is.** Absent is a sound, and the effect is an insert: its
   * input goes in and a treated sound comes out. `'signal'` is a modulation
   * source (`lfoParam`): its output is meant for an AudioParam, and in an audio
   * chain the signal is *summed into the sound* — a 0.16 Hz sine at the depth
   * the caller gave, which a rota's depth of half a unit made +10 dBFS of
   * sub-audio on a pad bus and six decibels of limiter pumping (Eugene on
   * 96f81df). A signal effect is never built as a note's insert.
   */
  output?: 'signal';
  build: EffectBuilder;
}

/**
 * What a field is checked as. Two of them are a shape rather than a word — a
 * `tail` is `'none'` or a number of seconds, `params` is a table of ParamSpecs
 * — and `latency` is checked as a tail because it is one.
 */
export type FieldKind =
  | 'string' | 'function' | 'family' | 'scope' | 'cost' | 'tail' | 'applies' | 'params';

/** Every field a descriptor must carry, and what it must be. The gate walks it. */
export const FIELDS = {
  id: 'string',
  family: 'family',
  scope: 'scope',
  applies: 'applies',
  params: 'params',
  cost: 'cost',
  bypass: 'string',
  tail: 'tail',
  latency: 'tail',
  build: 'function',
} as const satisfies Record<string, FieldKind>;

/**
 * What a cost class means, in the two readings the round takes: how many nodes
 * one instance makes, and how long the same minute of audio takes to render
 * through it. Both are upper bounds and the class is the first band an effect
 * fits in.
 *
 * `relative` is **against one named effect** (`COST_REFERENCE` below), and that
 * denominator took two measurements to choose — K1's, which made it the
 * cheapest of the six, and K4's, which found that "the cheapest" is not a fixed
 * point. The obvious one is the dry chain —
 * the source through a wire — and it is reported, but it is not a class:
 * rendering a minute of looping noise into a destination costs 11.8 ms in
 * Chromium and 4 ms in Firefox, so the same chorus reads 10.6x in one engine
 * and 31.5x in the other and the number says more about the denominator than
 * about the effect. Divided by the cheapest of the six instead, the same six
 * effects sort identically in both engines and land within a fifth of each
 * other — 2.78 and 3.5 for the chorus, 1.45 and 1.42 for the flanger — because
 * both are audio-thread work measured the same way on the same machine.
 * `notes/archive/2026-09-kitchen/rounds/k1.md` has the whole table.
 */
export const COST_BANDS: Record<EffectCost, { nodes: number; relative: number }> = {
  cheap: { nodes: 16, relative: 2 },
  mid: { nodes: 32, relative: 5 },
  dear: { nodes: 128, relative: 15 },
};

/**
 * What `relative` is measured **against**, by name.
 *
 * Round K1 wrote "the cheapest of the six" and that was right for six and wrong
 * for twenty-six: round K4 measured the same six effects against the cheapest
 * of the whole kitchen and every one of them read **2.08 times** what it had
 * read before, because the denominator had moved and nothing else had. A
 * denominator that changes when the kitchen grows is a denominator that
 * re-classifies effects nobody touched, so it is pinned to a name.
 *
 * The overdrive is the name because it *was* the cheapest of K1's six and reads
 * 1.00 there, so every number in `notes/archive/2026-09-kitchen/rounds/k1.md`'s cost table still means
 * what it said; and because it is four nodes of the plainest kind — a gain, a
 * shaper, a filter and a gain — so what it measures is about as close to "one
 * effect's worth of audio thread" as this kitchen has.
 */
export const COST_REFERENCE = 'overdrive';

/**
 * What one instance of each class is worth when a chain is added up. The unit
 * is "one cheap effect", and the numbers are the middles of the bands above, so
 * a ceiling stated in these is a ceiling in the thing being rationed — time on
 * the audio thread — rather than in a count of effects.
 */
export const COST_UNITS: Record<EffectCost, number> = { cheap: 1, mid: 3, dear: 8 };

/** Every value a parameter may take, clamped to what the descriptor declares. */
export function clampParam(spec: ParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.default;
  return Math.max(spec.min, Math.min(spec.max, value));
}

/**
 * The parameters a builder actually works with: the declared defaults, with
 * whatever the caller asked for clamped over them. Nothing a caller passes that
 * the descriptor does not declare reaches the sound — the design review's
 * *validate this instead of ignoring unknown parameters* — and `beat` is
 * carried through because it is the one reserved key.
 */
export function resolveParams(
  descriptor: EffectDescriptor,
  params: EffectParams = {},
): EffectParams {
  const out: EffectParams = {};
  for (const [name, spec] of Object.entries(descriptor.params)) {
    out[name] = name in params ? clampParam(spec, params[name]) : spec.default;
  }
  if (params.beat != null && Number.isFinite(params.beat) && params.beat > 0) out.beat = params.beat;
  return out;
}

/**
 * The knobs a built effect hands back, with every **setter** held to the range
 * its own spec declares — the same clamp `resolveParams` puts on construction,
 * on the day-to-day path a live control takes.
 *
 * Until the outside review of 09-19 (its E04) the range in a descriptor was
 * true of the instant an instance was built and of nothing after it: a
 * flanger's `feedback(1.5)` wrote 1.5 against a declared 0.8, which is outside
 * the stability assumption its declared tail was derived from. Every module
 * now hands its knobs through here, so the range is a runtime invariant of the
 * setter and not a note beside it. What it does, per write:
 *
 *   a finite number   clamped to `[min, max]`, exactly as construction clamps it
 *   `null`/`undefined` handed on as it is: the contract's own "no argument",
 *                     which the duck's `trigger()` reads as "the usual one"
 *   anything else     refused — nothing is written. A NaN that reached a knob
 *                     used to be a NaN on an AudioParam, and a knob asked for
 *                     nothing stays where it is
 *
 * **An AudioParam handed over raw is the stated escape hatch and is not
 * wrapped.** A caller holding the parameter itself holds the whole Web Audio
 * vocabulary — `setValueCurveAtTime`, a signal connected into it — and there
 * is no honest way to clamp a signal; the descriptor's range is then what the
 * caller is trusted with, and the kinds are printed by the suite (`name:param`
 * against `name:setter`) so which knobs those are is a matter of record.
 */
export function guardParams(
  descriptor: EffectDescriptor,
  params: Record<string, EffectParam>,
): Record<string, EffectParam> {
  const out: Record<string, EffectParam> = {};
  for (const [name, knob] of Object.entries(params)) {
    const spec = descriptor.params[name];
    if (typeof knob !== 'function' || !spec) { out[name] = knob; continue; }
    const setter = knob as (value: number | null | undefined, at?: number, over?: number) => void;
    out[name] = (value: number | null | undefined, at?: number, over?: number): void => {
      if (value == null) { setter(value, at, over); return; }
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      setter(Math.max(spec.min, Math.min(spec.max, value)), at, over);
    };
  }
  return out;
}

/**
 * A time in seconds out of a pair of parameters: the one in beats if it is not
 * nought and the caller said what a beat is, and the one in seconds or hertz
 * otherwise. The rule is written once, here, so that six modules do not each
 * decide what "or beats" means.
 *
 * @param beats the value of the `beats` parameter; 0 means "not in beats"
 * @param fallback the seconds the paired parameter says
 * @param beat the seconds of one beat, or nothing
 */
export function beatsOrSeconds(beats: number, fallback: number, beat?: number): number {
  if (beats > 0 && beat != null && beat > 0) return beats * beat;
  return fallback;
}

/** The same, for a rate: beats per cycle against hertz. */
export function beatsOrHz(beats: number, fallbackHz: number, beat?: number): number {
  if (beats > 0 && beat != null && beat > 0) return 1 / (beats * beat);
  return fallbackHz;
}

/**
 * Everything wrong with a descriptor, as sentences. Empty is a complete one.
 *
 * It lives here rather than in the gate because it is the contract's own
 * arithmetic: the vocabularies are in this file, the bus and family lists are
 * the registry's, and a rule stated in the checker instead of the contract is a
 * rule the contract does not have.
 *
 * `d` is `any` and stays `any`: this is the one function in the folder whose
 * argument is *unvalidated outside input* — a descriptor that has not been
 * checked yet, up to and including one that is not an object — so every
 * unchecked read in the body is the point of it rather than a gap in it.
 */
export function faultsOf(d: any): string[] {
  const bad: string[] = [];
  const say = (what: string) => bad.push(`${(d && d.id) || 'an effect with no id'}: ${what}`);
  if (!d || typeof d !== 'object') return ['a descriptor that is not an object'];
  for (const [field, kind] of Object.entries(FIELDS)) {
    const v = d[field];
    if (v === undefined) { say(`no ${field}`); continue; }
    if (kind === 'string' && typeof v !== 'string') say(`${field} is not a string`);
    if (kind === 'function' && typeof v !== 'function') say(`${field} is not a function`);
    if (kind === 'family' && !(FAMILIES as readonly string[]).includes(v)) say(`${v} is not one of the families`);
    if (kind === 'scope' && !(SCOPES as readonly string[]).includes(v)) say(`${v} is not one of the scopes`);
    if (kind === 'cost' && !(COSTS as readonly string[]).includes(v)) say(`a cost of ${v}, which is not a class`);
    if (kind === 'tail') {
      const ok = v === 'none' || (v && typeof v === 'object' && Number.isFinite(v.seconds) && v.seconds >= 0);
      if (!ok) say(`${field} is neither 'none' nor a number of seconds`);
    }
    if (kind === 'applies') {
      if (!Array.isArray(v) || !v.length) say('applies is not a list of at least one thing');
      else for (const a of v) {
        const known = (BUSES as readonly string[]).includes(a) || (VOICE_FAMILIES as readonly string[]).includes(a);
        if (!known) say(`it applies to ${a}, which is neither a bus nor a family`);
      }
    }
    if (kind === 'params') {
      if (!v || typeof v !== 'object' || !Object.keys(v).length) say('no parameters at all');
      // `any` for the reason the whole function is: what is being walked here
      // is an unchecked table, and a spec in it is whatever was written there.
      else for (const [name, spec] of Object.entries<any>(v)) {
        if (!spec || typeof spec !== 'object') { say(`${name} is not a parameter`); continue; }
        if (!(UNITS as readonly string[]).includes(spec.unit)) say(`${name} is in ${spec.unit}, which is not a unit`);
        if (!(RATES as readonly string[]).includes(spec.rate)) say(`${name} is read at ${spec.rate}, which is neither a nor k`);
        for (const k of ['min', 'max', 'default']) {
          if (!Number.isFinite(spec[k])) say(`${name} has no ${k}`);
        }
        if (Number.isFinite(spec.min) && Number.isFinite(spec.max) && spec.min > spec.max) say(`${name} runs from ${spec.min} down to ${spec.max}`);
        if (Number.isFinite(spec.default) && (spec.default < spec.min || spec.default > spec.max))
          say(`${name} starts at ${spec.default}, outside its own ${spec.min} to ${spec.max}`);
        if (spec.unit === 'beats' && spec.min !== 0) say(`${name} is in beats and cannot be switched off (its floor is ${spec.min}, not 0)`);
      }
    }
  }
  if (d.oversample !== undefined && !['none', '2x', '4x'].includes(d.oversample))
    say(`an oversample of ${d.oversample}`);
  // The bypass is a word a query string can carry, and it is deliberately not
  // required to be the id: the day two drives want turning off together they
  // share a key, which is what a switch is for.
  if (typeof d.bypass === 'string' && !/^[a-z][a-zA-Z0-9]*$/.test(d.bypass))
    say(`a bypass key of "${d.bypass}", which is not a word a query string can carry`);
  return bad;
}

export default FIELDS;
