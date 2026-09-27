// The shell every effect in the kitchen is built in, and the two or three
// pieces of arithmetic all six of them would otherwise each write out.
//
// There is one shape here and it is the reason the contract can promise what it
// promises:
//
//   input ---> dry (1 - mix) -------------------> output
//     |                                             ^
//     +------> [ whatever the effect is ] --> wet --+
//
// A mix of nought is a dry gain of exactly 1 and a wet gain of exactly 0, and a
// float multiplied by 1 and summed with 0 is the same float — so **bypass is
// arithmetic, not a switch**. `tools/test.ts` holds the bypassed render to the
// dry render in two engines: identical to the sample in Firefox, and one
// float32 ULP away in Chromium, which is exactly what a *unity gain node* costs
// there — three oscillators summed straight into a destination and the same
// three summed into a gain of 1 that is connected to it come out 1.19e-7 apart,
// with no effect anywhere in the graph. So the same run measures a bare wire
// and the gate is that the effect is no further from the dry than the wire is.
//
// Nothing in an effect module has to remember any of this, because nothing in
// an effect module does it: it connects its own tail to `wet` and the shell is
// the rest.

import { line } from '../ramp.ts';

/**
 * Is this a render rather than a device? An OfflineAudioContext has
 * `startRendering` and an AudioContext has not, and the difference matters for
 * exactly one thing in this folder: a tail that has to finish before a node is
 * disconnected is finished by the *render* offline and by a timer live.
 */
export const isOffline = (ctx: BaseAudioContext): boolean =>
  typeof (ctx as Partial<OfflineAudioContext>).startRendering === 'function';

/**
 * One knob's handle: the contract's setter, and the line it is on, readable.
 * `at` is where the ramp will be at an instant, which is what a caller writing
 * the next move has to know before the last one has landed.
 *
 * The instant is `number | null | undefined` and not the contract's plain
 * `at?: number`, because the body reads it as `at == null ? now : at` and two
 * modules say `null` in so many words for "now, and the ramp is the argument
 * after this one". A knob is still a `ParamSetter`: it takes everything one
 * does and two things more.
 */
export interface Knob {
  (value: number, at?: number | null, over?: number): void;
  at(t: number): number;
}

/**
 * One knob over one AudioParam, moved to a value at an instant over a ramp.
 *
 * It keeps its own line — every ramp written and not yet cancelled — and
 * interpolates along it, which is round G's finding carried over from the
 * held voice: `param.value` is the value **now** and not the value at the
 * instant being scheduled, and `cancelScheduledValues(t)` drops a ramp's
 * destination and leaves the parameter heading for where it began. Until
 * 09-20 the line was the *last* ramp only, and a nearer command landing under
 * an earlier, longer one read the wrong value (the outside review of 09-19,
 * its E07); the line is `../ramp.ts` now, the one copy the held voices stand
 * on too.
 *
 * @param initial the value it is built at — written as a value and not
 *   as an event, so a render that never touches the knob has no automation on
 *   it at all and a bypassed effect is its input to the sample
 */
export function knob(ctx: BaseAudioContext, param: AudioParam, initial: number): Knob {
  param.value = initial;
  const l = line(ctx, param, initial);
  const set = (value: number, at?: number | null, over?: number): void => {
    l.to(value, at == null ? ctx.currentTime : at, over);
  };
  set.at = l.at;
  return set;
}

/**
 * A periodic wave for an LFO, with its phase set and its shape chosen.
 *
 * `dsp.ts`'s `phasedLfo` is a sine with a starting phase and nothing else, and
 * a tremolo has three shapes in it. The harmonics are the textbook ones — a
 * square is the odd harmonics at 1/n, a triangle the odd harmonics at 1/n² with
 * the sign alternating — and the phase is applied per harmonic, which is what
 * makes it a shift of the whole wave rather than of its first partial.
 *
 * Web Audio sums `real[k]·cos(2πkt) + imag[k]·sin(2πkt)`, so a harmonic of
 * amplitude A at phase kφ is `real[k] = A·sin(kφ)`, `imag[k] = A·cos(kφ)`. The
 * wave is normalised by the engine, so a truncated square's ripple is inside
 * ±1 and a depth of 1 cannot ask a gain for more than it has.
 *
 * Round K4 added the fourth shape, and it is not a shape a tremolo wants: a
 * **sawtooth** is what a delay-line pitch shifter's head rides on, because a
 * delay time falling at a constant rate is a constant pitch ratio, and the
 * phase is what lets two of them run half a cycle apart so one is crossfaded in
 * while the other wraps. `shimmer.ts` is its one caller.
 *
 * @param shape 0 sine, 1 triangle, 2 square, 3 sawtooth (rising)
 * @param phase in turns, not radians: 0.5 is the other side of the cycle
 */
export function lfoWave(ctx: BaseAudioContext, shape: number, phase: number): PeriodicWave {
  let per = waveCache.get(ctx);
  if (!per) { per = new Map(); waveCache.set(ctx, per); }
  const kind = Math.max(0, Math.min(3, Math.round(shape)));
  // Quantised to a sixty-fourth of a turn, for the reason dsp.ts quantises its
  // own: building a PeriodicWave allocates and normalises a table, and an LFO
  // is not worth one per call.
  const step = Math.round((((phase % 1) + 1) % 1) * 64) % 64;
  const key = `${kind}:${step}`;
  if (per.has(key)) return per.get(key)!;
  const phi = (step / 64) * Math.PI * 2;
  const n = kind === 0 ? 2 : (kind === 3 ? 33 : 18);
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    let a = 0;
    // A sawtooth is every harmonic at 1/k with the sign alternating, and it
    // needs more of them than the other three: what rides on it is a delay
    // time, and a rounded corner is a glide where a wrap should be.
    if (kind === 3) a = ((2 / (Math.PI * k)) * (k % 2 === 1 ? 1 : -1));
    else if (kind === 0) a = k === 1 ? 1 : 0;
    else if (k % 2 === 1) {
      a = kind === 1
        ? (8 / (Math.PI * Math.PI * k * k)) * (((k - 1) / 2) % 2 === 0 ? 1 : -1)
        : 4 / (Math.PI * k);
    }
    if (!a) continue;
    real[k] = a * Math.sin(k * phi);
    imag[k] = a * Math.cos(k * phi);
  }
  // **The sawtooth is the one shape that must not be normalised.** Web Audio
  // scales a `PeriodicWave` to a peak of one by default, which is what keeps a
  // truncated square's Gibbs ripple inside ±1 and a tremolo's depth honest. A
  // band-limited ramp overshoots at its wrap by about nine per cent, so
  // normalising it divides the *slope* of the ramp by 1.09 — and what rides on
  // this ramp is a delay time, where the slope **is** the pitch ratio. MEASURED:
  // normalised, `shimmer.ts`'s octave came out at 423 Hz instead of 440, which
  // is seven tenths of a semitone flat and audible as out of tune.
  const wave = kind === 3
    ? ctx.createPeriodicWave(real, imag, { disableNormalization: true })
    : ctx.createPeriodicWave(real, imag);
  per.set(key, wave);
  return wave;
}
const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/**
 * An LFO of a shape at a phase, started. It is handed back unstarted-on-purpose
 * — the shell starts and stops every source it is given, so an effect module
 * never owns a lifetime.
 * @param phase in turns
 */
export function lfo(ctx: BaseAudioContext, hz: number, shape = 0, phase = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.setPeriodicWave(lfoWave(ctx, shape, phase));
  o.frequency.value = hz;
  return o;
}

/** What a shell is built with. */
export interface ShellOptions {
  mix?: number;
  tail?: number;
}

/**
 * The dry/wet shell an effect is built in, as its module sees it: the two ends
 * of the graph, the node its own tail goes to, the two lists the lifecycle is
 * run over, and the three methods the contract's `EffectInstance` is made of.
 */
export interface EffectShell {
  /** connect the source here */
  input: GainNode;
  /** connect this onward */
  output: GainNode;
  /** the node an effect connects its own tail to */
  wet: GainNode;
  /** the other side of the crossfade: the input, at `1 - mix` */
  dry: GainNode;
  /** every source the effect made, so one place starts and stops them */
  sources: AudioScheduledSourceNode[];
  /** every node of the effect, so one place lets them go */
  nodes: AudioNode[];
  /** the mix, as the contract's setter: it is two gains, so it cannot be an AudioParam */
  setMix(value: number, at?: number, over?: number): void;
  /** where the crossfade is now */
  mix(): number;
  /**
   * Bypass: the dry to exactly 1 and the wet to exactly 0, and back to the mix
   * that was asked for. The ramp is the engine's minimum by default, because
   * a gain that steps is a gain that clicks, and a caller wanting a crossfade
   * says how long.
   */
  setBypass(on: boolean, at?: number, over?: number): void;
  /** whether it is bypassed */
  bypassed(): boolean;
  /** Everything this effect made, started at one instant */
  start(at?: number): void;
  /**
   * The tail finishes, and then it disconnects. Offline there is nothing to
   * wait with and nothing to protect — the render ends when it ends — so the
   * sources are stopped at the end of the tail and the nodes are left where
   * they are.
   */
  dispose(at?: number): void;
}

/**
 * The dry/wet shell: the input, the output, the two gains between them, and the
 * lifecycle every instance shares.
 *
 * @param opts.mix where the crossfade starts
 * @param opts.tail the declared tail, in seconds: what `dispose`
 *   waits for before it disconnects anything
 */
export function shell(ctx: BaseAudioContext, { mix = 1, tail = 0 }: ShellOptions = {}): EffectShell {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry);
  dry.connect(output);
  wet.connect(output);

  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [input, output, dry, wet];

  let asked = Math.max(0, Math.min(1, mix));
  let bypassed = false;
  let gone = false;
  // Written as values and not as events: an instance nobody touches carries no
  // automation at all, which is what makes the identity exact.
  dry.gain.value = 1 - asked;
  wet.gain.value = asked;
  const dryKnob = knob(ctx, dry.gain, 1 - asked);
  const wetKnob = knob(ctx, wet.gain, asked);

  const apply = (at?: number, over?: number): void => {
    dryKnob(bypassed ? 1 : 1 - asked, at, over);
    wetKnob(bypassed ? 0 : asked, at, over);
  };

  return {
    input,
    output,
    wet,
    dry,
    sources,
    nodes,
    setMix(value, at, over) {
      asked = Math.max(0, Math.min(1, value));
      apply(at, over);
    },
    mix: () => asked,
    setBypass(on, at, over) {
      bypassed = !!on;
      apply(at, over);
    },
    bypassed: () => bypassed,
    start(at = 0) {
      for (const s of sources) {
        try { s.start(at); } catch (e) { /* already started */ }
      }
    },
    dispose(at) {
      if (gone) return;
      gone = true;
      const t = at == null ? ctx.currentTime : at;
      const end = t + tail;
      for (const s of sources) {
        try { s.stop(end); } catch (e) { /* already stopped */ }
      }
      if (isOffline(ctx)) return;
      const wait = Math.max(0, end - ctx.currentTime) * 1000 + 50;
      const letGo = () => {
        for (const n of nodes) {
          try { n.disconnect(); } catch (e) { /* already gone */ }
        }
      };
      if (typeof setTimeout === 'function') setTimeout(letGo, wait);
      else letGo();
    },
  };
}

export default shell;
