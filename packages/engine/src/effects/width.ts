// Stereo width: the master's mid/side stage as an instance.
//
//   L,R -> split -+-> M = (L+R)/2 -----------------+-> merge -> L
//                 +-> S = (L-R)/2 -> width -> ±S --+-> merge -> R
//
// `master.ts` builds exactly this once, on the theme sum, with an LFO on the
// width because a measurement said so: *the image breathes — the side/mid ratio
// of the chord band modulates at about 0.21 Hz with a coefficient of variation
// of 0.45, and that movement, not more width, is what a static generator is
// missing.* That graph is untouched and its numbers are blessed. This is the
// same eight nodes as an instance, so a strategy can widen one bus and narrow
// another without the sum being touched at all.
//
// **Mid/side rather than a Haas or a pan law**, and the reason is the one
// `master.ts` writes out at length: M and S are a rotation, so at a width of
// exactly 1 the output is the input — `M + S = L` and `M - S = R`, by
// arithmetic — at nought there is no side at all, which *is* mono, and over 1
// the side is amplified, which is the only widening that cannot change the
// mono sum. A delay-based widener changes what a mono listener hears, and half
// of dance music is heard on one speaker.
//
// The identity is still the shell's dry path and not this arithmetic, and that
// is deliberate: `(L+R)/2 + (L-R)/2` is `L` in real numbers and is `L` to
// within a float32 ULP in a computer, so a bypass that relied on it would be a
// bypass with a tolerance. The shell's bypass is exact.
//
// There is an LFO here for `master.ts`'s own reason, and it is **off by
// default**: a width that moves is what the measurement asked for, and a width
// that moves when nobody asked is an instance that cannot be used as a plain
// widener.

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
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);

  // Two channels in, explicitly, before the splitter: round G's finding and
  // `master.ts`'s own — a stream of the wrong width meeting a mid/side stage is
  // mono to the sample in one engine and 0.0266 apart in the other.
  const pin = ctx.createGain();
  pin.channelCount = 2;
  pin.channelCountMode = 'explicit';
  pin.channelInterpretation = 'speakers';
  sh.input.connect(pin);

  const split = ctx.createChannelSplitter(2);
  pin.connect(split);
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

  const width = ctx.createGain();
  width.gain.value = p.width;
  sideSum.connect(width);
  const widthNeg = ctx.createGain();
  widthNeg.gain.value = -1;
  width.connect(widthNeg);

  const merge = ctx.createChannelMerger(2);
  mid.connect(merge, 0, 0);
  mid.connect(merge, 0, 1);
  width.connect(merge, 0, 0);
  widthNeg.connect(merge, 0, 1);
  merge.connect(sh.wet);
  keep(pin, split, mid, sidePos, sideNeg, sideSum, width, widthNeg, merge);

  // The breathing, off unless asked for.
  const hz = beatsOrHz(p.rateBeats, p.rateHz, p.beat);
  const osc = lfo(ctx, hz, 0, p.phase);
  const depth = ctx.createGain();
  depth.gain.value = p.depth;
  osc.connect(depth);
  depth.connect(width.gain);
  sh.sources.push(osc);
  keep(depth);

  const widthKnob = knob(ctx, width.gain, p.width);
  const depthKnob = knob(ctx, depth.gain, p.depth);
  const rateKnob = knob(ctx, osc.frequency, hz);
  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      width: (v: number, at?: number, over?: number) => widthKnob(Math.max(0, v), at, over),
      depth: (v: number, at?: number, over?: number) => depthKnob(v, at, over),
      rateHz: (v: number, at?: number, over?: number) => { rateNow = v; rateKnob(Math.max(0.001, v), at, over); },
      rateBeats: (v: number, at?: number, over?: number) => rateKnob(beatsOrHz(v, rateNow, p.beat), at, over),
      phase: (v: number) => { osc.setPeriodicWave(lfoWave(ctx, 0, v)); },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'width',
  family: 'space',
  scope: 'bus',
  // Not the kick and not the sub. `master.ts` takes the side out from under
  // 120 Hz on the whole record and the two bass buses are pinned to one channel
  // besides; an instance of this on either is a stage with nothing to do.
  applies: ['drums', 'melodic', 'keys', 'keyboard', 'ensemble', 'noise'],
  params: {
    // 1 is exactly the input, 0 is mono, over 1 is the side amplified.
    width: { unit: 'ratio', min: 0, max: 3, default: 1.3, rate: 'a' },
    depth: { unit: 'ratio', min: 0, max: 1, default: 0, rate: 'a' },
    rateHz: { unit: 'hz', min: 0.001, max: 8, default: 0.21, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 128, default: 0, rate: 'k' },
    phase: { unit: 'ratio', min: 0, max: 1, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'width',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
