// An envelope follower, out of nodes, and the three effects that need one.
//
// A compressor, a gate and a transient shaper all ask the same question —
// *how loud is this, right now* — and in an engine with no worklet in it there
// is exactly one way to ask it: rectify the signal with a `WaveShaper` and
// smooth it with a lowpass. Both of those are audio-rate nodes, and the answer
// they hand back is an audio-rate signal that can be connected straight to an
// AudioParam, which is what makes a gain reduction possible at all here.
//
// Two things about it are honest limits rather than choices, and the round
// writes them down because a parameter that cannot do what it says is worse
// than a parameter that is not there:
//
//   **The detector is one time constant, not two.** A hardware compressor
//   follows a rise fast and a fall slowly; a one-pole lowpass follows both at
//   the same speed. The asymmetry the effects here have is put *behind* the
//   detector — a second smoother on the gain signal — which slows the return
//   without slowing the grab. Where a number is measured rather than asserted
//   the round's write-up carries the reading.
//
//   **It is a mean and not an RMS unless it is asked.** `|x|` smoothed is an
//   average-rectified reading, which for a sine is 0.9 dB under its RMS and for
//   a snare a good deal further. `rms: true` squares instead of rectifying and
//   takes the root back out with a second shaper, which is two more nodes and
//   the honest quantity. Both are offered because the difference is audible on
//   a drum bus and inaudible on a pad.

import { curveOf } from '../dsp.ts';

/** `|x|`, as a table. */
function absCurve(n = 2048): Float32Array<ArrayBuffer> {
  return curveOf(`abs:${n}`, () => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.abs((i / (n - 1)) * 2 - 1);
    return c;
  });
}

/** `x²`, as a table: the first half of an RMS. */
function squareCurve(n = 2048): Float32Array<ArrayBuffer> {
  return curveOf(`sq:${n}`, () => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = x * x; }
    return c;
  });
}

/** `sqrt(max(0, x))`, as a table: the second half of an RMS. */
function rootCurve(n = 2048): Float32Array<ArrayBuffer> {
  return curveOf(`rt:${n}`, () => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = x > 0 ? Math.sqrt(x) : 0; }
    return c;
  });
}

/**
 * The corner a time constant asks for. A one-pole at `f` settles to within a
 * tenth of its target in `2.3/(2πf)` seconds, so a millisecond figure is a
 * corner of `2.3/(2π·seconds)` — written here once rather than guessed three
 * times.
 */
export const cornerFor = (ms: number): number => Math.max(0.2, Math.min(20000, 2.3 / (2 * Math.PI * Math.max(0.05, ms) / 1000)));

/** How a follower is built. */
export interface FollowerOptions {
  ms: number;
  rms?: boolean;
  poles?: number;
}

/** One envelope follower, running. */
export interface Follower {
  /** connect the signal to be measured here */
  input: GainNode;
  /** its envelope, as a signal an AudioParam can be driven from */
  output: AudioNode;
  /** the corners, so a caller's `attackMs` knob can move them together */
  filters: BiquadFilterNode[];
  /** move the time constant, in milliseconds */
  setMs(v: number, at?: number, over?: number): void;
}

/**
 * An envelope follower. Connect a signal into `input` and `output` is its
 * envelope, as a signal in roughly 0…1 that an AudioParam can be driven from.
 *
 * @param opts.ms the time constant
 * @param opts.rms square and root instead of rectify
 * @param opts.poles how many lowpasses in a row: two is a good deal
 *   smoother than one and still cheap
 */
export function follower(
  ctx: BaseAudioContext,
  { ms, rms = false, poles = 2 }: FollowerOptions,
  keep: (...n: AudioNode[]) => void,
): Follower {
  const input = ctx.createGain();
  const rect = ctx.createWaveShaper();
  rect.curve = rms ? squareCurve() : absCurve();
  rect.oversample = 'none';
  input.connect(rect);
  keep(input, rect);
  let node: AudioNode = rect;
  const filters: BiquadFilterNode[] = [];
  for (let i = 0; i < poles; i++) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // Decibels of resonance at the corner, not a linear Q: a detector that
    // rings is a detector that pumps.
    lp.Q.value = -3.01;
    lp.frequency.value = cornerFor(ms);
    node.connect(lp);
    keep(lp);
    filters.push(lp);
    node = lp;
  }
  if (rms) {
    const root = ctx.createWaveShaper();
    root.curve = rootCurve();
    root.oversample = 'none';
    node.connect(root);
    keep(root);
    node = root;
  }
  return {
    input,
    output: node,
    filters,
    setMs: (v, at, over) => {
      for (const f of filters) {
        const t = at == null ? ctx.currentTime : at;
        f.frequency.cancelScheduledValues(t);
        f.frequency.setValueAtTime(f.frequency.value, t);
        f.frequency.linearRampToValueAtTime(cornerFor(v), t + Math.max(0.004, over || 0));
      }
    },
  };
}

export default follower;
