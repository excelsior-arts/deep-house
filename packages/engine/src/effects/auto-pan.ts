// Auto-pan: one panner, one LFO, and the reason it is not the tremolo.
//
//   input -> panner -> wet
//              ^
//              +-- LFO
//
// Round K1's tremolo can already pan: it splits the input, puts a gain on each
// channel, and a **stereo phase** of half a turn makes the two dip alternately,
// which is what an auto-pan looks like. This is a different thing and the
// difference is measurable rather than a matter of taste.
//
// **A tremolo at half a turn is not constant power and a panner is.** Two gains
// half a cycle apart cross at the depth's own floor: at a depth of 1 they meet
// at nought, so twice a cycle the sum of the two channels goes to silence and
// what a listener hears is a hole in the middle of the pan. A
// `StereoPannerNode` uses the equal-power law — `cos(x)` and `sin(x)` of a
// quarter turn — so the *sum* is flat all the way across and only the place
// changes. That is what a pan is, and it is why this is four nodes rather than
// a setting on something that already exists.
//
// The second difference is what it does to a mono source. A tremolo's two gains
// act on whatever channels arrive; a panner takes a mono input to a real
// position. So this is the one that belongs on a drum.

import { shell, lfo, lfoWave, knob } from './shell.ts';
import { resolveParams, beatsOrHz, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

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
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const hz = beatsOrHz(p.rateBeats, p.rateHz, p.beat);

  const pan = ctx.createStereoPanner();
  pan.pan.value = p.centre;
  const osc = lfo(ctx, hz, p.shape, p.phase);
  const depth = ctx.createGain();
  depth.gain.value = p.depth;
  osc.connect(depth);
  depth.connect(pan.pan);
  sh.input.connect(pan);
  pan.connect(sh.wet);
  sh.sources.push(osc);
  sh.nodes.push(pan, depth);

  let shape = p.shape;
  let phase = p.phase;
  const rateKnob = knob(ctx, osc.frequency, hz);
  const depthKnob = knob(ctx, depth.gain, p.depth);
  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      rateHz: (v: number, at?: number, over?: number) => { rateNow = v; rateKnob(Math.max(0.005, v), at, over); },
      rateBeats: (v: number, at?: number, over?: number) => rateKnob(beatsOrHz(v, rateNow, p.beat), at, over),
      depth: (v: number, at?: number, over?: number) => depthKnob(Math.max(0, Math.min(1, v)), at, over),
      // Where the middle of the sweep is, so a pan can wander round a place
      // that is not the centre of the record. It is the AudioParam itself and
      // the LFO is summed onto it, which is Web Audio's own arithmetic.
      centre: pan.pan,
      shape: (v: number) => { shape = v; osc.setPeriodicWave(lfoWave(ctx, shape, phase)); },
      phase: (v: number) => { phase = v; osc.setPeriodicWave(lfoWave(ctx, shape, phase)); },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'autoPan',
  family: 'motion',
  scope: 'voice',
  applies: ['keyboard', 'ensemble', 'noise', 'drum', 'drums', 'melodic', 'keys'],
  params: {
    rateHz: { unit: 'hz', min: 0.005, max: 20, default: 0.25, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 64, default: 0, rate: 'k' },
    depth: { unit: 'ratio', min: 0, max: 1, default: 0.7, rate: 'a' },
    centre: { unit: 'ratio', min: -1, max: 1, default: 0, rate: 'a' },
    // 0 sine, 1 triangle, 2 square, 3 sawtooth. A square is a ping-pong and a
    // sawtooth is a pan that always travels the same way, which is a thing a
    // riser wants.
    shape: { unit: 'index', min: 0, max: 3, default: 0, rate: 'k' },
    phase: { unit: 'ratio', min: 0, max: 1, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'autoPan',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
