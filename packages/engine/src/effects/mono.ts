// Mono-maker: the side taken out under a corner, and left alone over it.
//
//   L,R -> split -+-> M ------------------------+-> merge
//                 +-> S -> highpass -> keep ----+
//
// It is `width.ts` with one filter in it and it is a different tool: a width of
// nought is mono everywhere, and what a record actually wants is mono **under**
// a corner and as wide as it likes over one. `master.ts` does exactly this to
// the whole record and its note is the argument for doing it this way rather
// than with a crossover:
//
//   *Mono below a corner, done as mid/side rather than as a crossover… M =
//   (L+R)/2 goes through untouched, S = (L-R)/2 is highpassed, and the two are
//   recombined: below the corner there is no side, which **is** mono; above it
//   the width is whatever the material had. A lowpassed sum notched the mid
//   while the highpass went on passing the side.*
//
// That measurement is in `master.ts` in full — six bands of mid and side
// readings from the three reference sets — and the conclusion it reaches is the
// reason this effect exists at all: a low end that was never actually mono is
// the commonest fault in a generated record, and it is inaudible on headphones
// and fatal on a club system.
//
// Two knobs and they are not the same knob. `cornerHz` is where the side starts
// to survive; `amount` is how much of the side is taken away below it — 1 is
// true mono under the corner and anything less is a partial collapse, which is
// what a mastering engineer actually reaches for on a mix that is nearly right.

import { shell, knob } from './shell.ts';
import type { Knob } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);

  // Two channels in, explicitly — round G's finding and `master.ts`'s own: a
  // stream of the wrong width meeting a mid/side stage is mono to the sample in
  // one engine and 0.0266 apart in the other. It is written on the **shell's own
  // input** rather than on a gain of this module's, unlike `width.ts`, and that
  // is a node count and not a preference: this effect is thirteen nodes of its
  // own and the shell's four take it to seventeen, which is one past the cheap
  // band. The dry path goes through the same node and is unharmed — a pin to two
  // channels is what it already was.
  sh.input.channelCount = 2;
  sh.input.channelCountMode = 'explicit';
  sh.input.channelInterpretation = 'speakers';
  const split = ctx.createChannelSplitter(2);
  sh.input.connect(split);

  const mid = ctx.createGain();
  mid.gain.value = 0.5;
  const sidePos = ctx.createGain();
  sidePos.gain.value = 0.5;
  const sideNeg = ctx.createGain();
  sideNeg.gain.value = -0.5;
  split.connect(mid, 0);
  split.connect(mid, 1);
  split.connect(sidePos, 0);
  split.connect(sideNeg, 1);
  const sideSum = ctx.createGain();
  sidePos.connect(sideSum);
  sideNeg.connect(sideSum);

  // The side, two ways: through the highpass (what survives over the corner)
  // and round it (what `amount` lets through below it). `amount` of 1 is the
  // filtered path alone, which is true mono at the bottom.
  // **Two** highpasses in a row and not one, and it is a measurement: a
  // second-order Butterworth is 12 dB an octave, so one of them at 200 Hz
  // leaves the side at 100 Hz only 12.8 dB down — which is a narrower image and
  // not a mono low end. Two is 24 dB an octave and the same reading is -24.
  // `master.ts` uses one because what it is doing is different: it is shaping
  // the record's own width, not promising that a band is mono.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  // `master.ts` names its own `sideHpQdB` for the unit and sets it to this: on
  // a highpass the `Q` is decibels of resonance at the corner, and a resonant
  // mono-maker is a bump in the one band it exists to keep clean.
  hp.Q.value = -3.01;
  hp.frequency.value = p.cornerHz;
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.Q.value = -3.01;
  hp2.frequency.value = p.cornerHz;
  const filtered = ctx.createGain();
  const straight = ctx.createGain();
  sideSum.connect(hp);
  hp.connect(hp2);
  hp2.connect(filtered);
  sideSum.connect(straight);

  const side = ctx.createGain();
  filtered.connect(side);
  straight.connect(side);
  const sideNegOut = ctx.createGain();
  sideNegOut.gain.value = -1;
  side.connect(sideNegOut);

  const merge = ctx.createChannelMerger(2);
  mid.connect(merge, 0, 0);
  mid.connect(merge, 0, 1);
  side.connect(merge, 0, 0);
  sideNegOut.connect(merge, 0, 1);
  merge.connect(sh.wet);
  keep(split, mid, sidePos, sideNeg, sideSum, hp, hp2, filtered, straight, side, sideNegOut, merge);

  const cornerKnobs = [knob(ctx, hp.frequency, p.cornerHz), knob(ctx, hp2.frequency, p.cornerHz)];
  const knobs = {
    filtered: knob(ctx, filtered.gain, p.amount),
    straight: knob(ctx, straight.gain, 1 - p.amount),
  };

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      cornerHz: (v: number, at?: number, over?: number) => cornerKnobs.forEach((k: Knob) => k(Math.max(20, v), at, over)),
      amount: (v: number, at?: number, over?: number) => {
        const a = Math.max(0, Math.min(1, v));
        knobs.filtered(a, at, over);
        knobs.straight(1 - a, at, over);
      },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'mono',
  family: 'space',
  scope: 'bus',
  applies: ['sub', 'drums', 'melodic', 'keys', 'bass', 'keyboard', 'ensemble', 'noise'],
  params: {
    // MEASURED elsewhere and carried here: the record's own stage is at this
    // corner, chosen because 120-300 Hz still carries a side/mid of 0.38 in the
    // references and under 120 they carry nothing.
    cornerHz: { unit: 'hz', min: 40, max: 800, default: 120, rate: 'a' },
    amount: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'mono',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
