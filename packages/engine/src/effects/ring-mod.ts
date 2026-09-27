// Ring modulator: the signal multiplied by a sine, and nothing else at all.
//
//   input -> vca -> wet
//              ^
//              +-- oscillator (gain at nought, so the product is the whole of it)
//
// It is four nodes and one idea. A `GainNode` whose `gain` is driven by an
// audio-rate signal **is** a multiplier — that is what the parameter does — so
// setting the gain's own value to nought and connecting an oscillator to it
// leaves the output as exactly `input × carrier`, which is the definition of a
// ring modulator and not an approximation of one.
//
// What multiplication does to a spectrum is the sum and difference of every
// pair: a note at 220 Hz against a carrier at 137 comes out as 357 and 83, and
// neither of them is harmonically related to anything, which is why a ring
// modulator is the one effect in the kitchen that can make a **struck metal**
// sound out of material that has none. `fm-bell.ts` makes the same argument
// from the other side — a ratio that is not a whole number is the whole of what
// makes a bell — and this is that arithmetic applied to something already
// playing.
//
// Two decisions:
//
//   **`carrierHz` goes down to 0.1 and not to 20.** Under about 20 Hz the two
//   sidebands are close enough together to be heard as one note beating, which
//   is a tremolo — a very deep, very clean one, because the carrier passes
//   through nought and the signal inverts. The range is continuous because the
//   ear's boundary between "wobble" and "new note" is, and because sweeping
//   across it is a gesture worth having.
//
//   **`track` is not here.** A ring modulator that follows the note is a
//   frequency shifter and needs a pitch detector, which is a worklet's job; the
//   carrier is a fixed frequency in hertz, which is what makes it inharmonic
//   and is the point.

import { shell, knob } from './shell.ts';
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
  // build was undone by the next `carrierBeats(0)` (R75 of the reconciled review of
  // 09-24).
  let rateNow = p.carrierHz;
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const hz = beatsOrHz(p.carrierBeats, p.carrierHz, p.beat);

  const vca = ctx.createGain();
  // Nought, so that what comes out is the product and not the product plus the
  // input. A base of 1 here is an amplitude modulator, which keeps the original
  // note in the output; `depth` is the knob that walks between the two.
  vca.gain.value = 1 - p.depth;
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = hz;
  const depth = ctx.createGain();
  depth.gain.value = p.depth;
  carrier.connect(depth);
  depth.connect(vca.gain);

  sh.input.connect(vca);
  vca.connect(sh.wet);
  sh.sources.push(carrier);
  sh.nodes.push(vca, depth);

  const rateKnob = knob(ctx, carrier.frequency, hz);
  const depthKnob = knob(ctx, depth.gain, p.depth);
  const baseKnob = knob(ctx, vca.gain, 1 - p.depth);
  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      carrierHz: (v: number, at?: number, over?: number) => { rateNow = v; rateKnob(Math.max(0.1, v), at, over); },
      carrierBeats: (v: number, at?: number, over?: number) => rateKnob(beatsOrHz(v, rateNow, p.beat), at, over),
      // One knob, two gains, and between them the whole distance from a wire
      // to a true ring modulator: at nought the base is 1 and the carrier
      // contributes nothing, at 1 the base is nought and the output is the
      // product.
      depth: (v: number, at?: number, over?: number) => {
        const d = Math.max(0, Math.min(1, v));
        depthKnob(d, at, over);
        baseKnob(1 - d, at, over);
      },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'ringMod',
  family: 'motion',
  scope: 'voice',
  applies: ['keyboard', 'ensemble', 'bass', 'drum', 'noise', 'melodic', 'keys', 'drums'],
  params: {
    carrierHz: { unit: 'hz', min: 0.1, max: 4000, default: 137, rate: 'a' },
    carrierBeats: { unit: 'beats', min: 0, max: 32, default: 0, rate: 'k' },
    depth: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 0.5, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'ringMod',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
