// Flanger: one short delay, swept, fed back into itself.
//
// The difference from the chorus next to it is two numbers and it is the whole
// sound. The delay is one to ten milliseconds instead of eleven to twenty-three,
// which puts the comb's teeth in the audible spectrum rather than under it, and
// there is **feedback**, which is what makes the teeth sharp enough to whistle.
//
// The feedback may be negative, and that is not a tidy-up either: a positive
// feedback comb has a peak at DC and its first null a long way up, and a
// negative one has a null at DC and its first peak low down — the hollow,
// through-zero flange. Both are useful, so the parameter runs from -0.8 to 0.8
// and the middle of its range is no feedback at all.
//
// The one number that has to be watched is the sum of the base delay and the
// modulation depth: a delay line asked for a negative time is a delay line with
// undefined behaviour in one engine and a clamp in another, so the LFO's depth
// is held to what is left under the base.

import { shell, lfo, knob } from './shell.ts';
import { resolveParams, beatsOrHz, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** Never ask a delay line for less than this. */
const FLOOR_MS = 0.15;

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  // Where the rate knob stands now, which a beats knob of nought falls back to:
  // it fell back to the rate this was *built* with, so a rate moved after the
  // build was undone by the next `rateBeats(0)` (R75 of the reconciled review of
  // 09-24).
  let rateNow = p.rateHz;
  const sh = shell(ctx, { mix: p.mix, tail: 0.5 });
  const beat = p.beat;
  const hz = beatsOrHz(p.rateBeats, p.rateHz, beat);

  const delay = ctx.createDelay(0.05);
  const feedback = ctx.createGain();
  const depth = ctx.createGain();
  const osc = lfo(ctx, hz, 0, 0);

  // The loop. A lowpass in it is what keeps a flanger at high feedback from
  // turning into a whistle that never comes down: each pass is a little darker
  // than the one before it, which is what a real one does.
  const loopTone = ctx.createBiquadFilter();
  loopTone.type = 'lowpass';
  loopTone.frequency.value = 7200;
  // DECIBELS, not a linear Q: Web Audio defines `Q` on lowpass and highpass as
  // the resonance at the cutoff in dB, and -3.01 dB is the Butterworth
  // 1/sqrt(2) (`master.ts` carries the same note over its own side filter).
  // Here it is not a nicety: a filter inside a feedback loop with +0.7 dB at
  // its corner multiplies the loop gain by 1.08 at that frequency, and a
  // declared tail computed from the feedback alone is then wrong.
  loopTone.Q.value = -3.01;

  sh.input.connect(delay);
  delay.connect(sh.wet);
  delay.connect(loopTone);
  loopTone.connect(feedback);
  feedback.connect(delay);
  osc.connect(depth);
  depth.connect(delay.delayTime);

  sh.sources.push(osc);
  sh.nodes.push(delay, feedback, depth, loopTone);

  // What the LFO may actually swing, given where the base sits: a base of
  // 1 ms with a depth of 8 would ask for -7, so the depth is what is left.
  const swing = (baseMs: number, depthMs: number): number => Math.max(0, Math.min(depthMs, baseMs - FLOOR_MS)) / 1000;

  let baseMs = p.delayMs;
  let depthMs = p.depthMs;
  const base = knob(ctx, delay.delayTime, baseMs / 1000);
  const depthKnob = knob(ctx, depth.gain, swing(baseMs, depthMs));
  const fb = knob(ctx, feedback.gain, p.feedback);
  const rate = knob(ctx, osc.frequency, hz);

  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      delayMs: (v, at, over) => { baseMs = v; base(v / 1000, at, over); depthKnob(swing(baseMs, depthMs), at, over); },
      depthMs: (v, at, over) => { depthMs = v; depthKnob(swing(baseMs, depthMs), at, over); },
      feedback: fb,
      rateHz: (v, at, over) => { rateNow = v; rate(Math.max(0.01, v), at, over); },
      rateBeats: (v, at, over) => rate(beatsOrHz(v, rateNow, beat), at, over),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'flanger',
  family: 'time',
  scope: 'voice',
  // A flanger wants something with harmonics to comb: the noise layer, where it
  // is the classic sweep, and the harmonic families. Not the sub, which has
  // nothing above the fundamental for a comb to bite on.
  applies: ['noise', 'keyboard', 'ensemble', 'drum'],
  params: {
    delayMs: { unit: 'ms', min: 0.5, max: 10, default: 2, rate: 'k' },
    // Negative is the hollow one. The middle of the range is a chorus with a
    // very short delay, which is what a flanger at no feedback is.
    feedback: { unit: 'ratio', min: -0.8, max: 0.8, default: 0.45, rate: 'k' },
    rateHz: { unit: 'hz', min: 0.02, max: 5, default: 0.25, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 64, default: 0, rate: 'k' },
    depthMs: { unit: 'ms', min: 0, max: 8, default: 1.6, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 0.4, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'flanger',
  // The bound over the range, not the reading at the defaults: ten milliseconds
  // of delay at a feedback of 0.8 is thirty-one passes before -60 dB, which is
  // 0.31 s, and the lowpass in the loop takes every one of them down further.
  tail: { seconds: 0.5 },
  latency: 'none',
  build,
};

export default build;
