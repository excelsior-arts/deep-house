// Gate: below a line, nothing.
//
//   input ------------------------> vca -> wet
//     |                              ^
//     +-> rms follower -> curve -> smooth
//
// The curve is the gate and it is a `WaveShaper` used for something other than
// distortion: the follower hands it a number between nought and one and it
// hands back a gain, nought under the threshold, one over it, and a smooth ramp
// across the knee. That is the whole of the decision, done per sample with no
// branch anywhere, which is what a gate has to be when the machine underneath
// it has no worklet in it.
//
// **The follower is an RMS one here and a mean one in the transient shaper**,
// and the difference is the point of having both: a threshold in decibels only
// means what it says if the thing being compared with it is a real level, and
// `|x|` smoothed reads 0.9 dB under RMS on a sine and several decibels under it
// on anything percussive. A transient shaper compares two readings of the same
// signal, so the bias cancels and the cheaper one is honest; a gate compares a
// reading with a *number*, so it cannot use it.
//
// **Attack and release are not symmetric, and the round says how.** The
// detector is one time constant (`detector.ts` carries the reason), so the
// asymmetry is behind the curve: the detector runs at the attack and a second
// lowpass on the gain signal runs at the release. The consequence is that the
// release also slows the opening a little, which is measurable rather than
// arguable — `notes/archive/2026-09-kitchen/rounds/k4.md` has the 10-to-90 per cent times the gate
// actually reads at the declared settings, and they are what a caller should
// read the two knobs as.

import { shell, knob } from './shell.ts';
import { follower, cornerFor } from './detector.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

const N = 16384;
// One table per threshold, knee and floor, 64 KB each — and **at most
// `CURVES` of them** (R79 of the reconciled review of 09-24): a live drag of
// any of the three walks through a new key every step, and the map kept every
// one it had ever made. The oldest goes first; a hit moves its key to the back.
const CURVES = 32;
export const gateCurves = (): number => curves.size;
const curves = new Map<string, Float32Array<ArrayBuffer>>();

/**
 * The gate itself, as a table: a level in, a gain out.
 * @param thresholdDb where it opens
 * @param kneeDb how wide the ramp is
 * @param floor how far down it closes, as a gain
 */
export function gateCurve(thresholdDb: number, kneeDb: number, floor: number): Float32Array<ArrayBuffer> {
  const key = `${thresholdDb.toFixed(2)}:${kneeDb.toFixed(2)}:${floor.toFixed(4)}`;
  const hit = curves.get(key);
  if (hit) { curves.delete(key); curves.set(key, hit); return hit; }
  if (curves.size >= CURVES) curves.delete(curves.keys().next().value!);
  const lo = Math.pow(10, (thresholdDb - kneeDb / 2) / 20);
  const hi = Math.pow(10, (thresholdDb + kneeDb / 2) / 20);
  const c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    // Below nought is unreachable — a follower's output is a magnitude — and is
    // filled with the floor rather than left at zero so a stray negative sample
    // in the detector cannot slam the gain shut.
    const level = Math.max(0, x);
    let open: number;
    if (level <= lo) open = 0;
    else if (level >= hi) open = 1;
    else {
      const u = (level - lo) / (hi - lo);
      // Smoothstep, so the gain's own slope is nought at both ends of the knee
      // and the gate does not have a corner in it.
      open = u * u * (3 - 2 * u);
    }
    c[i] = floor + (1 - floor) * open;
  }
  curves.set(key, c);
  return c;
}

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);

  const vca = ctx.createGain();
  sh.input.connect(vca);
  vca.connect(sh.wet);
  keep(vca);

  const det = follower(ctx, { ms: p.attackMs, rms: true, poles: 2 }, keep);
  sh.input.connect(det.input);

  const shape = ctx.createWaveShaper();
  let floor = Math.pow(10, p.floorDb / 20);
  let threshold = p.thresholdDb;
  let knee = p.kneeDb;
  shape.curve = gateCurve(threshold, knee, floor);
  shape.oversample = 'none';
  det.output.connect(shape);
  keep(shape);

  const smooth = ctx.createBiquadFilter();
  smooth.type = 'lowpass';
  smooth.Q.value = -3.01;
  smooth.frequency.value = cornerFor(p.releaseMs);
  shape.connect(smooth);
  keep(smooth);

  // The gain signal drives the VCA. The node's own `gain` sits at nought so
  // that what multiplies the signal is the detector's answer and nothing else:
  // a base of 1 with the curve summed onto it would be a gate that can only
  // ever make things louder.
  //
  // **And it starts open.** The detector has nothing to say until it has
  // charged, and until 09-20 the VCA was written open and then written shut
  // for the detector to drive, so the first quantum of anything through a gate
  // was the floor and the gate opened on its own attack — a hole, then the
  // music (the second outside review of 09-19, its issue 1, and a comment here that
  // said the opposite of what the code did). The honest answer while the
  // detector charges is "as it was", so the base is written once at the
  // instant the gate is built: `1 - floor` decaying toward nought with the time
  // constant of the slowest smoother in the chain, so that the base falling and
  // the detector's answer rising sum to unity on a signal over the threshold
  // and close over the gate's own time on one under it. From then on the gain
  // is the detector's and nothing else.
  vca.gain.value = 0;
  const t0 = Math.max(at, ctx.currentTime); // the note's own instant (R28)
  const tau = Math.max(p.attackMs, p.releaseMs) / 1000 / 2.3;
  vca.gain.setValueAtTime(1 - floor, t0);
  vca.gain.setTargetAtTime(0, t0, tau);
  smooth.connect(vca.gain);

  const releaseKnob = knob(ctx, smooth.frequency, cornerFor(p.releaseMs));

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      thresholdDb: (v: number) => { threshold = v; shape.curve = gateCurve(threshold, knee, floor); },
      kneeDb: (v: number) => { knee = Math.max(0, v); shape.curve = gateCurve(threshold, knee, floor); },
      floorDb: (v: number) => { floor = Math.pow(10, v / 20); shape.curve = gateCurve(threshold, knee, floor); },
      attackMs: (v: number, at?: number, over?: number) => det.setMs(v, at, over),
      releaseMs: (v: number, at?: number, over?: number) => releaseKnob(cornerFor(v), at, over),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'gate',
  family: 'dynamics',
  scope: 'bus',
  applies: ['kick', 'drums', 'melodic', 'keys', 'drum', 'keyboard', 'noise'],
  params: {
    thresholdDb: { unit: 'db', min: -80, max: 0, default: -38, rate: 'k' },
    kneeDb: { unit: 'db', min: 0, max: 30, default: 8, rate: 'k' },
    // How far down it closes. Not silence by default: a gate that shuts to
    // nothing is a gate a listener hears working, and -40 dB is under the floor
    // of anything this record puts on a bus.
    floorDb: { unit: 'db', min: -90, max: 0, default: -40, rate: 'k' },
    attackMs: { unit: 'ms', min: 0.2, max: 200, default: 3, rate: 'k' },
    releaseMs: { unit: 'ms', min: 5, max: 2000, default: 120, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  // MEASURED: 2.05x the kitchen's reference effect, which is over the cheap
  // band's 2. A detector is two `WaveShaper`s and two biquads off to the side
  // of the signal, and off to the side is not free.
  cost: 'mid',
  bypass: 'gate',
  tail: 'none',
  // The signal path is one gain node and the detector is off to the side of
  // it, so what reaches the output is not late; the *gain* is, by the
  // detector's own corner, which is what a gate is.
  latency: 'none',
  build,
};

export default build;
