// Three bands: a shelf, a bell and a shelf.
//
//   input -> lowShelf -> bell -> highShelf -> wet
//
// The master has five of these in a row already, each with a measured number
// beside it — the low shelf, the low-mid, the midrange, the presence and the
// air — read off the three reference sets' long-term spectrum. They stay
// exactly where they are. This is the same three nodes as an **instance**, for
// the desk rather than for the master: something to put on a bus when a pad is
// in the way of a vocal-ish lead, or a kick is in the way of a bass.
//
// Three bands and not five, and the middle one is the only one with a Q,
// because that is what the shape is for. A shelf has no width to argue about —
// it turns a whole end of the spectrum up or down — and what a mix engineer
// actually does between two things fighting is one narrow cut in the one octave
// they share, which is `master.ts`'s own note about the dip: *a level takes a
// layer down everywhere; this takes it down in the one octave it is in the
// way, which is the only move that buys separation without buying a hole in the
// middle of the record.*
//
// **A `peaking` filter's Q is a real Q** — this is the one biquad type where
// the number means what it says, and it is the trap the other way round from
// the one the lowpasses carry. `distortion.ts` has the same note about its own
// pre-EQ. Nothing here subtracts 3.01 from anything.

import { shell } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = p.lowHz;
  low.gain.value = p.lowDb;
  const bell = ctx.createBiquadFilter();
  bell.type = 'peaking';
  bell.frequency.value = p.midHz;
  bell.gain.value = p.midDb;
  bell.Q.value = p.midQ;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = p.highHz;
  high.gain.value = p.highDb;

  sh.input.connect(low);
  low.connect(bell);
  bell.connect(high);
  high.connect(sh.wet);
  sh.nodes.push(low, bell, high);

  return {
    input: sh.input,
    output: sh.output,
    // Every one of them is the AudioParam itself. There is no arithmetic
    // between a knob and a node anywhere in this effect, which is the whole
    // reason it is three nodes and not four: a caller who wants to sweep a
    // cut over eight bars writes the curve straight onto the parameter.
    params: guardParams(descriptor, {
      lowHz: low.frequency,
      lowDb: low.gain,
      midHz: bell.frequency,
      midDb: bell.gain,
      midQ: bell.Q,
      highHz: high.frequency,
      highDb: high.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'eq',
  family: 'tone',
  scope: 'bus',
  applies: ['kick', 'sub', 'drums', 'melodic', 'keys', 'drum', 'bass', 'keyboard', 'ensemble', 'noise'],
  params: {
    lowHz: { unit: 'hz', min: 30, max: 1000, default: 180, rate: 'a' },
    lowDb: { unit: 'db', min: -18, max: 18, default: 0, rate: 'a' },
    midHz: { unit: 'hz', min: 100, max: 12000, default: 900, rate: 'a' },
    midDb: { unit: 'db', min: -18, max: 18, default: 0, rate: 'a' },
    // A real Q, unlike every lowpass in this kitchen.
    midQ: { unit: 'ratio', min: 0.2, max: 12, default: 1.2, rate: 'a' },
    highHz: { unit: 'hz', min: 1500, max: 18000, default: 7000, rate: 'a' },
    highDb: { unit: 'db', min: -18, max: 18, default: 0, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'eq',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
