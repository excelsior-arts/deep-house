// Compressor: the engine's own, with a make-up gain and a mix on it.
//
//   input -> comp -> makeup -> wet
//
// The record has two compressors in it already and neither of them is this one:
// `master.ts` builds the low-end glue on the kick-and-bass sum and the master's
// own, both with measured numbers and both untouched. This is the same node as
// an **instance** — threshold, knee, ratio, attack and release as declared
// knobs, a make-up gain behind it, and a mix, which is what makes it a parallel
// compressor when a strategy wants one.
//
// **The detector is the engine's and is not a knob**, and that is a finding
// rather than an omission. PLAN-KITCHEN asks for "RMS/peak"; a
// `DynamicsCompressorNode` decides for itself how it follows a signal, and
// there is no way to ask it for one or the other. The two honest options were a
// parameter that does nothing, or no parameter — and `detector.ts` beside this
// file is the third, which is what `gate.ts` and `transient.ts` are built on
// when the follower has to be ours. A compressor built that way would need a
// logarithm and an exponent out of `WaveShaper` tables whose input range is
// ±1, which is a great deal of arithmetic to arrive at a node the engine
// already has, so this one is the engine's and the round measures what the
// engine actually does. That measurement is worth having on its own account:
// **the two browsers do not implement this node the same way**, and
// `notes/archive/2026-09-kitchen/rounds/k4.md` carries the gain reduction each of them reads on the
// same fixture at the same settings.
//
// The make-up is a plain gain and not a computed one, deliberately. A make-up
// that tracks the threshold and the ratio is a guess about the material — it
// assumes the input is at full scale — and what it buys is a compressor whose
// level changes when nothing else did. A level table is only a level table if
// nothing in it does that (round G).

import { shell, knob } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams, ParamSetter } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = p.thresholdDb;
  comp.knee.value = p.kneeDb;
  comp.ratio.value = p.ratio;
  comp.attack.value = p.attackMs / 1000;
  comp.release.value = p.releaseMs / 1000;
  const makeup = ctx.createGain();
  makeup.gain.value = Math.pow(10, p.makeupDb / 20);

  sh.input.connect(comp);
  comp.connect(makeup);
  makeup.connect(sh.wet);
  sh.nodes.push(comp, makeup);

  const makeupKnob = knob(ctx, makeup.gain, Math.pow(10, p.makeupDb / 20));
  const msKnob = (param: AudioParam, ms: number): ParamSetter => {
    const k = knob(ctx, param, ms / 1000);
    return (v: number, at?: number, over?: number) => k(v / 1000, at, over);
  };

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      // These four *are* AudioParams and are handed over as themselves: a
      // caller with a curve of its own writes the curve.
      thresholdDb: comp.threshold,
      kneeDb: comp.knee,
      ratio: comp.ratio,
      attackMs: msKnob(comp.attack, p.attackMs),
      releaseMs: msKnob(comp.release, p.releaseMs),
      makeupDb: (v, at, over) => makeupKnob(Math.pow(10, v / 20), at, over),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'compressor',
  family: 'dynamics',
  scope: 'bus',
  // Every bus, and the families whose material is dynamic enough for one to do
  // anything. Not `noise`: a hat bed through a compressor is a hat bed with its
  // own decay taken off it.
  applies: ['kick', 'sub', 'drums', 'melodic', 'keys', 'drum', 'bass', 'keyboard', 'ensemble'],
  params: {
    thresholdDb: { unit: 'db', min: -60, max: 0, default: -18, rate: 'a' },
    kneeDb: { unit: 'db', min: 0, max: 40, default: 12, rate: 'a' },
    ratio: { unit: 'ratio', min: 1, max: 20, default: 4, rate: 'a' },
    attackMs: { unit: 'ms', min: 0.1, max: 1000, default: 8, rate: 'k' },
    releaseMs: { unit: 'ms', min: 10, max: 1000, default: 180, rate: 'k' },
    makeupDb: { unit: 'db', min: -12, max: 24, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  // MEASURED, and it is **the engine and not the graph**: six nodes, of which
  // one is a `DynamicsCompressorNode`, and that one node costs 1.86 times the
  // kitchen's reference effect in Chromium and **6.31** in Firefox. A class is
  // the worst of the engines it has to run in, so it is `dear` — the only
  // effect in this kitchen whose class is decided by a browser rather than by
  // what it is made of, which is exactly the thing a phone budget needs to know.
  cost: 'dear',
  bypass: 'compressor',
  // A compressor's release is not a tail: nothing outlives the block, because
  // nothing sounds that was not fed in.
  tail: 'none',
  // MEASURED, and it is the one field of this descriptor a browser decides:
  // `DynamicsCompressorNode` is allowed a look-ahead and the two engines do not
  // use the same one — **264 samples in Chromium and none at all in Firefox**,
  // which is 6.0 ms against 0. This is the larger of them, because a caller
  // aligning a dry path with a parallel compressor needs the bound and not the
  // average. It is also why `mix` on this effect is a knob to use with care:
  // half of a six-millisecond-late copy summed with the dry is a comb with its
  // first notch at 83 Hz in one browser and no comb at all in the other.
  latency: { seconds: 0.006 },
  build,
};

export default build;
