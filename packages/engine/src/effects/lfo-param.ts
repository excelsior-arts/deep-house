// An LFO with an offset, in the shape of an effect: the one whose output is
// meant for an AudioParam and not for a speaker.
//
//   input -> dry (1) ------+
//                          +-> output
//   LFO -> depth ----------+
//   offset ----------------+
//
// PLAN-KITCHEN asks for "LFO to any param (rate in beats or seconds, any target
// param)", and *any* is the whole difficulty: an effect's contract says an
// instance is `{ input, output, params, setBypass, dispose }` and nothing else,
// so there is no field to hand a caller a modulation source through, and adding
// one would change every effect in the kitchen for the sake of this one.
//
// It does not need one. **`output` is an `AudioNode`, and in Web Audio a node
// may be connected to an AudioParam as readily as to another node.** So this is
// an effect whose output is a signal rather than a sound, and it is used two
// ways round:
//
//   as a modulator   feed it nothing and connect its `output` to the parameter
//                    to be moved. `offset` is where that parameter sits and
//                    `depth` is how far it swings, both in **that parameter's
//                    own units** — hertz for a filter's corner, a fraction for
//                    a gain, seconds for a delay time — which is why neither of
//                    them is in a unit of this effect's choosing.
//   as an insert     put it in an audio chain at a depth and an offset of
//                    nought, and it is a wire: `x + 0` is exactly `x` for every
//                    finite float, so the identity is arithmetic and not a
//                    tolerance, which is what the gate reads.
//
// The defaults are therefore a depth of nought and an offset of nought — a
// modulator is at rest until somebody says what it is for — and the honest
// consequence, written down rather than hidden, is that **its audition is
// silence**: `ear.ts --effect lfoParam` writes the fixture twice and the two
// halves are the same samples, because that is what this effect at its declared
// defaults does. It is the one audition in the kitchen where hearing nothing is
// the result.
//
// The rate is in beats when the caller has said what a beat is, which is the
// point of it being an effect at all: a filter swept once every two bars is one
// number at 120 BPM and another at 70 and the sweep is the same sweep.

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
  // A mix of nought, always, and there is no `mix` knob: what this adds is
  // *summed with* its input and not put in place of it, so the dry path is the
  // whole of the signal path and `depth` is the only thing that decides how
  // much there is. A mix control here would be a knob that does nothing, which
  // this kitchen says twice over is worse than no knob at all.
  const sh = shell(ctx, { mix: 0, tail: 0 });
  const hz = beatsOrHz(p.rateBeats, p.rateHz, p.beat);

  const osc = lfo(ctx, hz, p.shape, p.phase);
  const depth = ctx.createGain();
  depth.gain.value = p.depth;
  osc.connect(depth);
  depth.connect(sh.output);
  sh.sources.push(osc);
  sh.nodes.push(depth);

  // The offset: a `ConstantSourceNode` through a gain, which is how a constant
  // is spelled in Web Audio. It is a source and so it is started and stopped by
  // the shell along with the oscillator, which is why it is in `sh.sources`.
  const one = ctx.createConstantSource();
  const offset = ctx.createGain();
  offset.gain.value = p.offset;
  one.offset.value = 1;
  one.connect(offset);
  offset.connect(sh.output);
  sh.sources.push(one);
  sh.nodes.push(offset);

  let shape = p.shape;
  let phase = p.phase;
  const rateKnob = knob(ctx, osc.frequency, hz);
  const depthKnob = knob(ctx, depth.gain, p.depth);
  const offsetKnob = knob(ctx, offset.gain, p.offset);
  sh.start(at);

  // The bypass has to take the modulation out too, or a bypassed modulator is
  // still moving something. It is the shell's own bypass with the two summed
  // paths taken to nought beside it.
  // The requested depth and offset are kept apart from what is on the nodes,
  // the way the shell keeps its requested mix apart from its effective one: an
  // edit made while bypassed is remembered and applied when the bypass lifts,
  // and does not turn the modulation back on under a bypass that is still
  // holding (the outside review, 09-19: depth 100 -> 0 -> 200 while logically bypassed).
  let bypassed = false;
  const setBypass = (on: boolean, at?: number, over?: number): void => {
    bypassed = on;
    sh.setBypass(on, at, over);
    depthKnob(on ? 0 : p.depth, at, over);
    offsetKnob(on ? 0 : p.offset, at, over);
  };

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      rateHz: (v: number, at?: number, over?: number) => { rateNow = v; rateKnob(Math.max(0.001, v), at, over); },
      rateBeats: (v: number, at?: number, over?: number) => rateKnob(beatsOrHz(v, rateNow, p.beat), at, over),
      // In the target's own units, which is why the unit here is `ratio`: this
      // effect does not know what it is driving and a unit it invented would be
      // a lie about the parameter at the other end.
      depth: (v: number, at?: number, over?: number) => { p.depth = v; if (!bypassed) depthKnob(v, at, over); },
      offset: (v: number, at?: number, over?: number) => { p.offset = v; if (!bypassed) offsetKnob(v, at, over); },
      shape: (v: number) => { shape = v; osc.setPeriodicWave(lfoWave(ctx, shape, phase)); },
      phase: (v: number) => { phase = v; osc.setPeriodicWave(lfoWave(ctx, shape, phase)); },
    }),
    setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'lfoParam',
  family: 'motion',
  scope: 'bus',
  // Everything, because what it modulates is not what it is connected to: an
  // `applies` list here is a statement about where the *parameter* lives.
  applies: ['kick', 'sub', 'drums', 'melodic', 'keys', 'drum', 'bass', 'keyboard', 'ensemble', 'noise', 'effect'],
  params: {
    rateHz: { unit: 'hz', min: 0.001, max: 40, default: 0.5, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 128, default: 0, rate: 'k' },
    // Both of these are in the target parameter's units and both start at
    // nought, which is what makes an untouched instance a wire.
    depth: { unit: 'ratio', min: -20000, max: 20000, default: 0, rate: 'a' },
    offset: { unit: 'ratio', min: -20000, max: 20000, default: 0, rate: 'a' },
    shape: { unit: 'index', min: 0, max: 3, default: 0, rate: 'k' },
    phase: { unit: 'ratio', min: 0, max: 1, default: 0, rate: 'k' },
  },
  cost: 'cheap',
  output: 'signal',
  bypass: 'lfoParam',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
