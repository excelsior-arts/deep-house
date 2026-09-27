// Crush: the signal rounded to a grid, and the reason there is no second grid.
//
//   input -> drive -> staircase -> tone (lowpass) -> level -> wet
//
// A bit crusher is quantisation and quantisation is rounding, so the whole
// effect is one table (`curves.ts`'s `crushCurve`) — and it is the one place in
// this kitchen where a `WaveShaper` is not a compromise but the right node:
// sixteen thousand points interpolated give a staircase whose risers are
// exactly vertical and whose treads are exactly flat.
//
// The **drive in front matters more here than in any of the drives**, and it is
// worth saying why, because it looks like a level control and is not. The grid
// is fixed in absolute terms — six bits is thirty-two steps between -1 and 1,
// wherever the signal happens to sit — so a signal twelve decibels down uses a
// quarter of the steps and comes out four times as crushed. The gain in front
// is therefore how *much* of the effect there is, and the level behind it is
// what puts the result back where it was. Without the pair, a crusher's amount
// would be whatever the bus level happened to be that bar.
//
// ## And the second half of a crusher, which this engine cannot have
//
// PLAN-KITCHEN asks for "bit/rate crush" and this is bits only. A rate crusher
// is a **sample-and-hold**: the signal read once every `1/R` seconds and held
// flat between, which is what puts the aliased images either side of every
// partial that a bit crusher does not. Out of Web Audio nodes a hold is a
// feedback path — `held = x·g + held(t - 1/R)·(1 - g)` with `g` a pulse train —
// and round K2 measured the wall that runs into: **a cycle through a
// `DelayNode` is quantised to a render quantum by the specification**, 128
// samples, so the shortest hold this engine can build out of nodes is
// `sampleRate / 128` — 344 Hz at 44.1 kHz and 375 at 48. A rate crusher that
// tops out at 344 Hz is a rate crusher for the bottom two octaves and nothing
// else, and one whose top rate changes with the listener's hardware is not a
// declared parameter at all.
//
// So the knob is not here, and what is here instead is the note. The day the
// kitchen has an `AudioWorklet` of its own — which round K1 named as the answer
// to the other half of this same problem, its two engines' up-samplers — a hold
// is four lines inside it and this effect gains a `rateHz`. That is the same
// day, and it is one piece of work rather than two.

import { shell, knob } from './shell.ts';
import { crushCurve, makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * MEASURED, as the overdrive's (`tools/test-effects-2.ts --bless-drive`), at the
 * default six bits: the decibels that bring pink noise at -18 dBFS back to its
 * own loudness at the bottom, the quarters and the top of the drive. The grid
 * does not move: the make-up is after the staircase, so what is rounded is
 * rounded where it always was and only the level of the result follows the
 * drive.
 */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.1429, 0.25, 0.5, 0.75, 1];
export const MAKEUP_DB = [7.48, 2.36, 0.25, -0.18, -2.32, -6.18, -8.88, -10.96];
const DRIVE_MIN = 0.5;
const DRIVE_MAX = 4;
const fracOf = (d: number): number => (d - DRIVE_MIN) / (DRIVE_MAX - DRIVE_MIN);

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const drive = ctx.createGain();
  drive.gain.value = p.drive;
  const shaper = ctx.createWaveShaper();
  let bits = p.bits;
  shaper.curve = crushCurve(bits);
  // `none`, and here it is not a trade-off at all: up-sampling a staircase
  // rounds its risers, which is the one thing that must not happen to it.
  shaper.oversample = 'none';
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = -3.01;
  tone.frequency.value = p.tone;
  const level = ctx.createGain();
  level.gain.value = p.level;
  // The make-up, which follows the drive (curves.ts, `makeupAt`).
  const makeup = ctx.createGain();

  sh.input.connect(drive);
  drive.connect(shaper);
  shaper.connect(tone);
  tone.connect(makeup);
  makeup.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(drive, shaper, tone, makeup, level);

  const driveKnob = knob(ctx, drive.gain, p.drive);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, fracOf(p.drive)));

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      bits: (v: number) => { bits = Math.max(1, Math.min(16, v)); shaper.curve = crushCurve(bits); },
      drive: (v: number, at?: number, over?: number) => {
        const d = Math.max(DRIVE_MIN, Math.min(DRIVE_MAX, v));
        driveKnob(d, at, over);
        makeupKnob(makeupAt(MAKEUP_AT, MAKEUP_DB, fracOf(d)), at, over);
      },
      tone: tone.frequency,
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'crush',
  family: 'drive',
  scope: 'voice',
  applies: ['drums', 'melodic', 'keys', 'drum', 'keyboard', 'bass', 'noise'],
  params: {
    // Fractional on purpose: a converter cannot be 6.5 bits and a knob should
    // be, because the step from six to seven is otherwise a doubling.
    bits: { unit: 'index', min: 1, max: 16, default: 6, rate: 'k' },
    // How far up the grid the signal sits, which is how much crushing there is.
    // Narrowed from 0.05 on a measurement: below about half, six bits round a
    // voice at -18 dBFS to silence (-31.5 dB at 0.05), and no make-up after the
    // staircase can put back what the grid threw away.
    drive: { unit: 'ratio', min: 0.5, max: 4, default: 1, rate: 'a' },
    tone: { unit: 'hz', min: 300, max: 18000, default: 9000, rate: 'a' },
    level: { unit: 'ratio', min: 0, max: 2, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'crush',
  tail: 'none',
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
