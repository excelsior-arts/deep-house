// Haas: one channel a few milliseconds late, and the whole of what that means.
//
//   L ---------------> merge L
//   R -> delay (ms) -> merge R
//
// Under about thirty-five milliseconds the ear does not hear two sounds, it
// hears one sound *coming from the earlier side* — the precedence effect, which
// is the whole of what this is. Three nodes and a number, and it makes a mono
// source as wide as anything in this kitchen can.
//
// **It is the widening that changes the mono sum**, and that is why it is here
// with a warning on it rather than as a default. `width.ts` is a rotation: what
// it does to the side cannot touch `L + R`. A delay on one channel makes
// `L + R` a comb filter with its first notch at `1/(2·delay)` — 143 Hz at 3.5
// ms — so a listener on one speaker hears a different record. Half of dance
// music is heard on one speaker. So:
//
//   `mono` is a declared knob and not a promise. It is the width of the comb's
//   damage, measured: `notes/archive/2026-09-kitchen/rounds/k4.md` carries what the mono sum of this
//   fixture reads at each of the three declared delays.
//
//   The default delay is 12 ms and not 3. The precedence effect is strongest in
//   the low tens of milliseconds and the comb's notches are then close enough
//   together — 42 Hz apart at 12 ms — that a mono sum reads as a gentle loss of
//   level rather than as a hole in one octave.
//
// A `balance` control sits beside it because a Haas alone is lopsided: the
// earlier channel is where the sound is, so the *later* one usually wants a
// little more level to put the image back where it was asked for.

import { shell, knob } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** One side's line: the delay it is late by and the gain the balance sets. */
interface Line {
  d: DelayNode;
  g: GainNode;
}

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0.05 });
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);

  const pin = ctx.createGain();
  pin.channelCount = 2;
  pin.channelCountMode = 'explicit';
  pin.channelInterpretation = 'speakers';
  sh.input.connect(pin);
  const split = ctx.createChannelSplitter(2);
  pin.connect(split);

  // Both sides get a delay line and one of them is at nought, so `side` can be
  // moved while it plays: which channel is late is a crossfade between two
  // numbers rather than a graph being rebuilt.
  const lines: Line[] = [0, 1].map((ch: number) => {
    const d = ctx.createDelay(0.08);
    const g = ctx.createGain();
    split.connect(d, ch);
    d.connect(g);
    keep(d, g);
    return { d, g };
  });
  const merge = ctx.createChannelMerger(2);
  lines[0].g.connect(merge, 0, 0);
  lines[1].g.connect(merge, 0, 1);
  merge.connect(sh.wet);
  keep(pin, split, merge);

  let right = p.side >= 0.5;
  const apply = (at?: number, over?: number): void => {
    const secs = p.delayMs / 1000;
    knobs.delay[0](right ? 0 : secs, at, over);
    knobs.delay[1](right ? secs : 0, at, over);
    // The balance: positive is louder on the late side, which is what puts an
    // image the precedence effect has pulled one way back where it was asked
    // for. It is a pair of gains, so the sum of the two is always 2.
    const b = Math.max(-1, Math.min(1, p.balance));
    const late = 1 + b * 0.5;
    const early = 1 - b * 0.5;
    knobs.level[0](right ? early : late, at, over);
    knobs.level[1](right ? late : early, at, over);
  };
  const knobs = {
    delay: lines.map((l: Line) => knob(ctx, l.d.delayTime, 0)),
    level: lines.map((l: Line) => knob(ctx, l.g.gain, 1)),
  };
  apply();

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      delayMs: (v: number, at?: number, over?: number) => { p.delayMs = v; apply(at, over); },
      // 0 the left channel is late, 1 the right one is.
      side: (v: number, at?: number, over?: number) => { right = v >= 0.5; apply(at, over); },
      balance: (v: number, at?: number, over?: number) => { p.balance = v; apply(at, over); },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'haas',
  family: 'space',
  scope: 'voice',
  // Never the bottom two buses: a comb in the mono sum at 40 Hz is a bass that
  // disappears on a phone, which is the one thing this record may not do.
  applies: ['keyboard', 'ensemble', 'noise', 'drums', 'melodic', 'keys'],
  params: {
    delayMs: { unit: 'ms', min: 0, max: 40, default: 12, rate: 'k' },
    side: { unit: 'index', min: 0, max: 1, default: 1, rate: 'k' },
    balance: { unit: 'ratio', min: -1, max: 1, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'haas',
  // The longest delay it can be asked for, and a little: what is in the line
  // when the input stops still has to come out.
  tail: { seconds: 0.05 },
  // And this is the one effect in the kitchen whose latency is its **purpose**.
  // It is declared as the bound over the range, because a caller summing this
  // with a dry path is summing one channel that is up to forty milliseconds
  // late — which is the comb the header describes, arriving as a number.
  latency: { seconds: 0.04 },
  build,
};

export default build;
