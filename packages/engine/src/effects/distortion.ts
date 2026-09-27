// Distortion: a pre-EQ, a knee and a wall, and a lowpass to live with it.
//
//   input -> pre (bell) -> drive (gain) -> shaper -> tone (lowpass) -> level -> wet
//
// One node more than the overdrive beside it, and it is the one that decides
// what the result sounds like. **A distortion is a filter with a shaper after
// it**: which part of the spectrum is loudest going in is which part generates
// the harmonics, so a bell at 900 Hz before the wall is the difference between
// a bass that grows teeth in its own octave and a bass that grows them at the
// top of the record. Cranking a shaper on a full-range signal and then trying
// to fix it with the tone control afterwards is the mistake this node exists to
// avoid; the post-lowpass is there to take the fizz off what is left, not to
// choose the character.
//
// The curve is a straight line under its knee, so unlike the overdrive this one
// leaves a quiet passage alone and the drive is what decides whether a note
// distorts at all.

import { shell, knob } from './shell.ts';
import { distortionCurve, makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** How much gain the drive parameter buys: 1 to 31, which is thirty decibels. */
const DRIVE_RANGE = 30;

/** MEASURED, as the overdrive's (`tools/test-effects-2.ts --bless-drive`). */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.25, 0.5, 0.75, 1];
export const MAKEUP_DB = [-1.1, -10.27, -14.63, -19.65, -24.79, -27.46, -29.01];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const pre = ctx.createBiquadFilter();
  pre.type = 'peaking';
  pre.Q.value = 0.9;
  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(0.2, 0.25);
  shaper.oversample = descriptor.oversample || 'none';
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  // Decibels of resonance at the corner, not a linear Q: Butterworth. The
  // pre-EQ above is a `peaking`, whose Q *is* linear, which is the trap.
  tone.Q.value = -3.01;
  const level = ctx.createGain();
  // The make-up, which follows the drive (curves.ts, `makeupAt`).
  const makeup = ctx.createGain();

  sh.input.connect(pre);
  pre.connect(drive);
  drive.connect(shaper);
  shaper.connect(tone);
  tone.connect(makeup);
  makeup.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(pre, drive, shaper, tone, makeup, level);

  const driveKnob = knob(ctx, drive.gain, 1 + p.drive * DRIVE_RANGE);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, p.drive));
  pre.frequency.value = p.preHz;
  pre.gain.value = p.preDb;
  tone.frequency.value = p.tone;
  level.gain.value = p.level;

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      drive: (v, at, over) => {
        const d = Math.max(0, Math.min(1, v));
        driveKnob(1 + d * DRIVE_RANGE, at, over);
        makeupKnob(makeupAt(MAKEUP_AT, MAKEUP_DB, d), at, over);
      },
      preHz: pre.frequency,
      preDb: pre.gain,
      tone: tone.frequency,
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'distortion',
  family: 'drive',
  scope: 'voice',
  // An insert on one thing, not on a bus: a distortion across a whole mix is a
  // decision about the record and this one is a decision about a part.
  applies: ['drum', 'bass', 'keyboard', 'noise'],
  params: {
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.5, rate: 'a' },
    // The pre-EQ: where the harmonics are generated from.
    preHz: { unit: 'hz', min: 100, max: 4000, default: 900, rate: 'a' },
    preDb: { unit: 'db', min: 0, max: 15, default: 6, rate: 'a' },
    tone: { unit: 'hz', min: 200, max: 18000, default: 3000, rate: 'a' },
    // 1 now the make-up carries the level (it was 0.5 while it did).
    level: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'distortion',
  tail: 'none',
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
