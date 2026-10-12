// Drive: a soft clip on a bus, with a trim in front of it, a tone control
// behind it and a trim after that.
//
//   input -> input trim -> drive -> clip -> tone (low-pass) -> make-up -> output trim -> wet
//
// Round KV1 of the kitchen: the treatment a bus of drums has when it is pushed
// — the kit squashed together and thickened, its peaks rounded rather than
// cut. It is the overdrive's arithmetic (`overdrive.ts`) with the two things a
// bus insert needs that a note's does not:
//
//   the trims    an **input** trim in decibels, because what reaches a bus is
//                a whole kit at whatever level the mix left it, and how hard
//                it hits the clip is a decision about that level and not about
//                the curve; and an **output** trim, so what leaves is set
//                apart from how hard it was driven.
//   the curve    a symmetric tanh (hardness 2): odd harmonics only and no DC,
//                because a bus carries a kick and an offset riding a kick is a
//                pump nobody wrote.
//
// The make-up follows the drive, as every drive in this kitchen does
// (`curves.ts`, `makeupAt`): at a mix of one and both trims at nought, pink
// noise comes out at its own loudness across the drive's range, MEASURED by
// `tools/test-effects-2.ts --bless-drive`. So `drive` is a colour and the
// trims are the levels.

import { shell, knob } from './shell.ts';
import { makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';
import { curveOf } from '../dsp.ts';

/** How much gain the drive parameter buys: 0 is a wire into the curve, 1 is eighteen decibels. */
const DRIVE_RANGE = 7;
/** The tanh's hardness. */
const HARDNESS = 2;

/**
 * MEASURED (`tools/test-effects-2.ts --bless-drive`): the decibels that bring
 * pink noise at -36 dBFS back to its own loudness through this effect at a mix
 * of 1 and both trims at nought, at the table's points of the drive.
 */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.25, 0.3, 0.5, 0.75, 1];
export const MAKEUP_DB = [-4.78, -7.92, -10.22, -13.51, -14.53, -17.69, -20.4, -22.37];

const dbToGain = (db: number): number => Math.pow(10, db / 20);

const clipCurve = (): Float32Array<ArrayBuffer> => curveOf(`drive-tanh:${HARDNESS}`, () => {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(HARDNESS * x) / Math.tanh(HARDNESS);
  }
  return c;
});

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const inTrim = ctx.createGain();
  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = clipCurve();
  shaper.oversample = descriptor.oversample || 'none';
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = -3.01;
  const makeup = ctx.createGain();
  const outTrim = ctx.createGain();

  sh.input.connect(inTrim);
  inTrim.connect(drive);
  drive.connect(shaper);
  shaper.connect(tone);
  tone.connect(makeup);
  makeup.connect(outTrim);
  outTrim.connect(sh.wet);
  sh.nodes.push(inTrim, drive, shaper, tone, makeup, outTrim);

  const inKnob = knob(ctx, inTrim.gain, dbToGain(p.inputDb));
  const outKnob = knob(ctx, outTrim.gain, dbToGain(p.outputDb));
  const driveKnob = knob(ctx, drive.gain, 1 + p.drive * DRIVE_RANGE);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, p.drive));
  tone.frequency.value = p.toneHz;

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      inputDb: (v, at, over) => inKnob(dbToGain(v), at, over),
      drive: (v, at, over) => {
        const d = Math.max(0, Math.min(1, v));
        driveKnob(1 + d * DRIVE_RANGE, at, over);
        makeupKnob(makeupAt(MAKEUP_AT, MAKEUP_DB, d), at, over);
      },
      toneHz: tone.frequency,
      outputDb: (v, at, over) => outKnob(dbToGain(v), at, over),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'drive',
  family: 'drive',
  scope: 'bus',
  // A bus insert, the drums' first: the bus a kit lands on, the two harmonic
  // buses, and the families a note's own insert might carry it on.
  applies: ['drums', 'melodic', 'keys', 'drum', 'keyboard'],
  params: {
    inputDb: { unit: 'db', min: -12, max: 12, default: 0, rate: 'a' },
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.3, rate: 'a' },
    toneHz: { unit: 'hz', min: 800, max: 18000, default: 7000, rate: 'a' },
    outputDb: { unit: 'db', min: -24, max: 6, default: 0, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'drive',
  tail: 'none',
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
