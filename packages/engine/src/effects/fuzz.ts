// Fuzz: no knee, a wall, and an octave leaking through it.
//
//   input -> pre (highpass) -> drive -> curve -> body (lowpass) -> level -> wet
//
// The kitchen has two drives already and this is the third thing a shaper can
// be. The overdrive is a tanh, which bends everything in proportion; the
// distortion has a knee, so a quiet passage goes through it untouched and the
// drive decides whether a note distorts at all. A fuzz has **no knee**: the
// line into the wall is so steep that every part of the signal is squared off,
// which is why a fuzz sustains — the output is a square wave at the note's own
// pitch for as long as the note is over the noise floor, and it does not get
// quieter as the note decays, it gets shorter.
//
// The octave is the second half of it and it is a full-wave rectifier in the
// curve (`curves.ts`). Blended rather than switched, because what a fuzz box
// does is leak: a little is a bright fuzz, all of it is an even function with
// no fundamental in it at all, and what comes out of a chord at that setting is
// every sum and difference of every pair of partials. On a bass that is the
// sound; on a chord it is a decision.
//
// **The highpass in front is what makes it usable**, and it is the one node
// here that is not obvious. A fuzz squares the *sum* of what goes into it, so a
// bass note and a chord together come out as neither: the loudest thing in the
// band wins the whole waveform. Taking the bottom out in front means the fuzz
// hears the note and not the room it is in. `distortion.ts` makes the same
// argument one octave up with its pre-EQ and the sentence is the same one: **a
// drive is a filter with a shaper after it.**

import { shell, knob } from './shell.ts';
import { fuzzCurve, makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * What the drive parameter buys, from a wire to a wall.
 *
 * MEASURED down from 24: a fuzz has no knee, so its slope through nought is the
 * drive times the curve's own steepness, and at 24 the default setting carried
 * **36 dB** of gain — which turned the two-thousandth of a step the fixture
 * leaves when its last note ends into a move of 0.064 in one sample, over the
 * scenes' own click gate. That is not a click in the effect, it is the effect
 * doing its job to a number at the noise floor, and the honest answer is that a
 * default with 36 dB of gain in it is not a default.
 */
const DRIVE_RANGE = 14;
/** How steep the line into the wall is. Six is still no knee at all. */
const WALL = 6;

/** MEASURED, as the overdrive's, at the default octave (`tools/test-effects-2.ts --bless-drive`). */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.25, 0.35, 0.5, 0.75, 1];
export const MAKEUP_DB = [-6.62, -12.08, -15.41, -19.68, -21.99, -24.21, -25.95, -26.7];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const pre = ctx.createBiquadFilter();
  pre.type = 'highpass';
  pre.Q.value = -3.01;
  pre.frequency.value = p.preHz;
  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  let octave = p.octave;
  shaper.curve = fuzzCurve(WALL, octave);
  shaper.oversample = descriptor.oversample || 'none';
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.Q.value = -3.01;
  body.frequency.value = p.tone;
  const level = ctx.createGain();
  level.gain.value = p.level;
  // The make-up, which follows the drive (curves.ts, `makeupAt`).
  const makeup = ctx.createGain();

  sh.input.connect(pre);
  pre.connect(drive);
  drive.connect(shaper);
  shaper.connect(body);
  body.connect(makeup);
  makeup.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(pre, drive, shaper, body, makeup, level);

  const driveKnob = knob(ctx, drive.gain, 1 + p.drive * DRIVE_RANGE);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, p.drive));

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      drive: (v: number, at?: number, over?: number) => {
        const d = Math.max(0, Math.min(1, v));
        driveKnob(1 + d * DRIVE_RANGE, at, over);
        makeupKnob(makeupAt(MAKEUP_AT, MAKEUP_DB, d), at, over);
      },
      // The octave is the table and so it is a `k` parameter: a curve cannot be
      // crossfaded from inside one node. A strategy that wants to sweep it
      // builds two instances, which is what two fuzz pedals are.
      octave: (v: number) => { octave = Math.max(0, Math.min(1, v)); shaper.curve = fuzzCurve(WALL, octave); },
      preHz: pre.frequency,
      tone: body.frequency,
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'fuzz',
  family: 'drive',
  scope: 'voice',
  applies: ['bass', 'keyboard', 'drum', 'noise'],
  params: {
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.35, rate: 'a' },
    octave: { unit: 'ratio', min: 0, max: 1, default: 0.3, rate: 'k' },
    preHz: { unit: 'hz', min: 20, max: 2000, default: 180, rate: 'a' },
    tone: { unit: 'hz', min: 300, max: 18000, default: 3000, rate: 'a' },
    // 1 now the make-up carries the level (it was 0.6 while it did).
    level: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'fuzz',
  tail: 'none',
  latency: 'none',
  // Round K1's table, and the same answer for the same reason: an oversampled
  // shaper is 128 or 192 samples late in Chromium and 8 in Firefox, and a wet
  // path that is 2.9 ms late in one browser and 0.2 ms late in another combs
  // the dry it is summed with differently in each.
  oversample: 'none',
  build,
};

export default build;
