// Overdrive: a soft asymmetric shaper with a gain in front of it and a lowpass
// behind it.
//
//   input -> drive (gain) -> shaper -> tone (lowpass) -> level -> wet
//
// The three nodes are the three decisions and they are in that order for a
// reason. The **gain in front** is what "drive" means: the curve does not
// change, the amount of it the signal reaches does, which is what lets the
// drive be swept over a bar without the timbre jumping as a table is rebuilt.
// The **lowpass behind** is not a tone control in the guitar-pedal sense, it is
// the thing that makes the result usable: a shaper puts harmonics above
// everything, and the ones over about 5 kHz are the ones that read as fizz
// rather than as weight. The **make-up after that** follows the drive, so a
// drive sweep is a timbre change and not a volume ramp: a normalised curve only
// promises that full scale in is full scale out, and a note reaches this insert
// far under full scale, where the drive is a gain (curves.ts, `makeupAt`). The
// **level** behind it is then a level, and at its default of 1 the wet is as
// loud as the dry.
//
// The oversample setting is declared and MEASURED in both engines, because
// round G found four decibels between two browsers' up-samplers on one curve
// and a declared number cannot be built on that. `notes/archive/2026-09-kitchen/rounds/k1.md` carries
// the table this one is chosen from.

import { shell, knob } from './shell.ts';
import { overdriveCurve, makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** How much gain the drive parameter buys: 0 is a wire, 1 is twenty-two decibels. */
const DRIVE_RANGE = 12;

/**
 * MEASURED (`tools/test-effects-2.ts --bless-drive`): the decibels that bring
 * pink noise at -18 dBFS back to its own loudness through this effect at a
 * mix of 1 and a level of 1, at 0, a quarter, a half, three quarters and all
 * of the drive. See curves.ts on why a normalised curve still needs one.
 */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.25, 0.4, 0.5, 0.75, 1];
export const MAKEUP_DB = [-7.15, -11.95, -14.96, -18.79, -21.63, -22.96, -25.26, -26.72];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = overdriveCurve(3, 0.3);
  shaper.oversample = descriptor.oversample || 'none';
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  // Decibels of resonance at the corner, not a linear Q: Butterworth.
  tone.Q.value = -3.01;
  const level = ctx.createGain();
  // The make-up, which follows the drive (curves.ts, `makeupAt`).
  const makeup = ctx.createGain();

  sh.input.connect(drive);
  drive.connect(shaper);
  shaper.connect(tone);
  tone.connect(makeup);
  makeup.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(drive, shaper, tone, makeup, level);

  const driveKnob = knob(ctx, drive.gain, 1 + p.drive * DRIVE_RANGE);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, p.drive));
  tone.frequency.value = p.tone;
  level.gain.value = p.level;

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      // A setter, because the knob is 0 to 1 and the node behind it is a gain
      // of 1 to 13. The ramp underneath is the AudioParam's own, so a sweep is
      // per sample however it was asked for.
      drive: (v, at, over) => {
        const d = Math.max(0, Math.min(1, v));
        driveKnob(1 + d * DRIVE_RANGE, at, over);
        makeupKnob(makeupAt(MAKEUP_AT, MAKEUP_DB, d), at, over);
      },
      // These two *are* AudioParams and are handed over as themselves: a
      // caller with a curve of its own writes the curve, and nothing here is in
      // the way of it.
      tone: tone.frequency,
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'overdrive',
  family: 'drive',
  scope: 'bus',
  // The bottom and the middle of the record: the bus a bass lands on, the
  // drums, and the harmonic bus. The kick's own bus is deliberately not here —
  // the master's push already drives the low sum and two drives on one path is
  // a decision a strategy makes explicitly, not one an `applies` list invites.
  applies: ['sub', 'drums', 'melodic', 'bass', 'keyboard'],
  params: {
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.4, rate: 'a' },
    tone: { unit: 'hz', min: 200, max: 18000, default: 4200, rate: 'a' },
    // 1: the make-up has brought the wet to the dry's loudness, so the level
    // is a level and not a compensation (it was 0.7 while it was one).
    level: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'overdrive',
  // A lowpass's own ringing is not a tail: nothing here outlives the block.
  tail: 'none',
  // MEASURED by cross-correlating the driven output against its own input in
  // both engines, at each of the three settings: see notes/archive/2026-09-kitchen/rounds/k1.md.
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
