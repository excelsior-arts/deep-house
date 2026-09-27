// Transient shaper: more attack, or less, without a threshold anywhere in it.
//
//   input ------------------> vca -> wet
//     |                        ^
//     +-> fast follower --+    |
//     +-> slow follower --(-)--+ x attack
//     +-> slower follower -----+ x sustain (against the slow one)
//
// A compressor asks *is this louder than a line*; a transient shaper asks *is
// this louder than it was a moment ago*, which is a different question and is
// why it works at any level. Two envelope followers on the same signal at two
// speeds: where they differ, something just happened. The difference is
// positive at an onset and negative as the sound falls away, and it is nought
// on anything steady — a held pad through this at any setting is a held pad,
// which is the property that makes it usable on a whole bus.
//
//   attack    the fast follower less the slow one, which is a spike at every
//             onset and nothing in between
//   sustain   the slow follower less a slower one, which is what is left after
//             the spike has gone: the body of a drum, the ring of a string
//
// Both are signed: negative takes the attack off a kick or dries out a room.
// They are added to a gain that sits at 1, so at nought the `vca` multiplies by
// exactly 1 and the effect is its own input, which is what the identity gate
// reads.
//
// The three corners are 2 ms, 45 ms and 250 ms, and they are not arbitrary: the
// first is faster than anything in this record's attack table (`kick.ts`'s
// click is 2 ms), the second is slower than every attack and faster than every
// decay, and the third is slower than a bar at any tempo the style draws. What
// separates an attack from a body is where those two lines fall.

import { shell, knob } from './shell.ts';
import type { Knob } from './shell.ts';
import { follower } from './detector.ts';
import type { Follower } from './detector.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

const FAST_MS = 2;
const SLOW_MS = 45;
const SLOWER_MS = 250;

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);

  const vca = ctx.createGain();
  vca.gain.value = 1;
  sh.input.connect(vca);
  vca.connect(sh.wet);
  keep(vca);

  const fast = follower(ctx, { ms: FAST_MS * p.speed, rms: false, poles: 2 }, keep);
  const slow = follower(ctx, { ms: SLOW_MS * p.speed, rms: false, poles: 2 }, keep);
  const slower = follower(ctx, { ms: SLOWER_MS * p.speed, rms: false, poles: 2 }, keep);
  for (const f of [fast, slow, slower]) sh.input.connect(f.input);

  // The two differences, each with its own amount, both summed onto one gain.
  // The negations are gains of -1 rather than inverted curves, because a
  // subtraction in Web Audio is a sum with a sign on it and nothing else.
  const mk = (a: Follower, b: Follower, amount: number): Knob => {
    const plus = ctx.createGain();
    const minus = ctx.createGain();
    const amt = ctx.createGain();
    plus.gain.value = 1;
    minus.gain.value = -1;
    amt.gain.value = amount * DEPTH;
    a.output.connect(plus);
    b.output.connect(minus);
    plus.connect(amt);
    minus.connect(amt);
    amt.connect(vca.gain);
    keep(plus, minus, amt);
    return knob(ctx, amt.gain, amount * DEPTH);
  };
  const attackKnob = mk(fast, slow, p.attack);
  const sustainKnob = mk(slow, slower, p.sustain);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      attack: (v: number, at?: number, over?: number) => attackKnob(Math.max(-1, Math.min(1, v)) * DEPTH, at, over),
      sustain: (v: number, at?: number, over?: number) => sustainKnob(Math.max(-1, Math.min(1, v)) * DEPTH, at, over),
      speed: (v: number, at?: number, over?: number) => {
        fast.setMs(FAST_MS * v, at, over);
        slow.setMs(SLOW_MS * v, at, over);
        slower.setMs(SLOWER_MS * v, at, over);
      },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

/**
 * How much gain one unit of difference buys. MEASURED rather than chosen: at 1
 * the two followers differ by about a fifth of full scale on this engine's own
 * kick, so a depth of 8 is about +6 dB on a transient at `attack: 1` and the
 * knob's own range is the useful one end to end. `notes/archive/2026-09-kitchen/rounds/k4.md` has the
 * reading.
 */
const DEPTH = 8;

export const descriptor: EffectDescriptor = {
  id: 'transient',
  family: 'dynamics',
  scope: 'bus',
  applies: ['kick', 'drums', 'melodic', 'keys', 'drum', 'bass', 'keyboard'],
  params: {
    // Signed: positive sharpens, negative softens.
    attack: { unit: 'ratio', min: -1, max: 1, default: 0.4, rate: 'a' },
    sustain: { unit: 'ratio', min: -1, max: 1, default: 0, rate: 'a' },
    // A multiplier on all three corners together: under 1 is a shaper for
    // clicks and over 1 is one for phrases.
    speed: { unit: 'ratio', min: 0.25, max: 4, default: 1, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'mid',
  bypass: 'transient',
  tail: 'none',
  // Two biquads a follower and three followers, all of them off to one side of
  // the signal path: what reaches the output is the input through one gain, so
  // the audio is not late. The *gain* is late, by the followers' own corners,
  // which is what a transient shaper is.
  latency: 'none',
  build,
};

export default build;
