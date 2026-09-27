// A multimode filter with a drive in front of it: the one every gesture wants.
//
//   input -> drive -> shaper -> biquad -> level -> wet
//
// Round K1 §6 maps the stage's `hpRise` and `lpClose` onto this file by name:
// both of them are today a *multiplier on the voice's own filter*, written into
// every note as a parameter, and what they become in K5 is automation over one
// instance of this. Which is why the two things this has that a `BiquadFilter`
// has not are the two a DJ filter needs — a mode it can be told, and a drive,
// because a resonant filter swept with nothing driving it is thin and every
// filter anybody sweeps in this music has something warm in front of it.
//
// ## The resonance trap, which is two traps
//
// **Web Audio's `Q` on a lowpass and a highpass is decibels of resonance at the
// corner, and on a bandpass it is a real Q.** `master.ts` has carried the first
// half of that note since the low end became mid/side and round K1 found what
// it costs inside a feedback loop. Here it is worse than a nicety, because this
// effect is all three types: the same number written into `Q.value` means +6 dB
// of peak on a lowpass and a two-octave-wide passband on a bandpass. So the
// knob is in decibels, always, and the mapping into the node is per mode:
//
//   lowpass, highpass   `Q = resonanceDb - 3.01`, so **nought is Butterworth**
//                       and the knob reads as decibels of peak over the passband
//   bandpass            `Q = 0.7 · 2^(resonanceDb/6)`, a real Q from a half
//                       octave wide open to a twelfth of one at the top
//
// The second trap is the one underneath it: a bandpass's gain at its own corner
// is 1 whatever its Q, so turning the resonance up on a bandpass makes it
// *quieter* overall where on a lowpass it makes it louder. That is the filter
// and not a fault, and `level` is where a strategy answers it.

import { shell, knob } from './shell.ts';
import { overdriveCurve, makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** 0 lowpass, 1 highpass, 2 bandpass — the order the descriptor's `mode` indexes. */
const TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];

/** The decibels a knob asks for, as the number this filter type's `Q` actually is. */
export function qFor(type: BiquadFilterType, resonanceDb: number): number {
  if (type === 'bandpass') return 0.7 * Math.pow(2, resonanceDb / 6);
  return resonanceDb - 3.01;
}

/**
 * MEASURED (`tools/test-effects-2.ts --bless-drive`): the decibels that keep
 * pink noise at -18 dBFS at the loudness this filter gives it with no drive, at
 * 0, a quarter, a half, three quarters and all of the drive. A filter's own
 * corner and resonance are its sound and are not made up for; its drive is a
 * gain in front of a curve and is (curves.ts, `makeupAt`).
 */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.15, 0.25, 0.5, 0.75, 1];
export const MAKEUP_DB = [0, -3.51, -5.98, -6.8, -9.44, -13.69, -16.35, -18.22];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const drive = ctx.createGain();
  drive.gain.value = 1 + p.drive * 8;
  const shaper = ctx.createWaveShaper();
  shaper.curve = overdriveCurve(2.2, 0.18);
  shaper.oversample = 'none';
  const f = ctx.createBiquadFilter();
  let mode = Math.max(0, Math.min(2, Math.round(p.mode)));
  f.type = TYPES[mode];
  f.frequency.value = p.cutoffHz;
  f.Q.value = qFor(TYPES[mode], p.resonanceDb);
  // The DC blocker, and the reason it is here and the curve is not changed.
  // This drive is a *drive*: its asymmetry is what grows the even harmonics and
  // is the whole point of having a shaper in front of a filter at all. But an
  // asymmetric curve leaves a standing offset that follows the envelope, and in
  // `lowpass` mode there is nothing after it to take that out — MEASURED at
  // **0.0011 of full scale** on the fixture, against a dry that leaves nought.
  // `ladder.ts` had the same fault an order of magnitude larger and was heard;
  // there the answer was a symmetric curve, because a transistor ladder has no
  // asymmetry to model. Here the curve is right and the output needed blocking.
  // 18 Hz is under everything this record has.
  const dc = ctx.createBiquadFilter();
  dc.type = 'highpass';
  dc.frequency.value = 18;
  dc.Q.value = -3.01;
  const level = ctx.createGain();
  level.gain.value = p.level;
  // The make-up, which follows the drive (curves.ts, `makeupAt`).
  const makeup = ctx.createGain();

  sh.input.connect(drive);
  drive.connect(shaper);
  shaper.connect(f);
  f.connect(dc);
  dc.connect(makeup);
  makeup.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(drive, shaper, f, dc, makeup, level);

  const driveKnob = knob(ctx, drive.gain, 1 + p.drive * 8);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, p.drive));
  const qKnob = knob(ctx, f.Q, qFor(TYPES[mode], p.resonanceDb));
  let resonanceDb = p.resonanceDb;

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      // The cutoff is the AudioParam itself: it is the one knob in this kitchen
      // a caller is most likely to write a curve onto, and `exponentialRamp` on
      // a frequency is the straight line in octaves a sweep wants.
      cutoffHz: f.frequency,
      resonanceDb: (v: number, at?: number, over?: number) => { resonanceDb = v; qKnob(qFor(TYPES[mode], v), at, over); },
      mode: (v: number) => {
        mode = Math.max(0, Math.min(2, Math.round(v)));
        f.type = TYPES[mode];
        // The Q means a different thing now, so it is written again: a mode
        // change that left the number alone would change the sound twice.
        qKnob(qFor(TYPES[mode], resonanceDb), null, 0);
      },
      drive: (v: number, at?: number, over?: number) => {
        const d = Math.max(0, Math.min(1, v));
        driveKnob(1 + d * 8, at, over);
        makeupKnob(makeupAt(MAKEUP_AT, MAKEUP_DB, d), at, over);
      },
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'filter',
  family: 'tone',
  scope: 'bus',
  applies: ['kick', 'sub', 'drums', 'melodic', 'keys', 'drum', 'bass', 'keyboard', 'ensemble', 'noise'],
  params: {
    mode: { unit: 'index', min: 0, max: 2, default: 0, rate: 'k' },
    cutoffHz: { unit: 'hz', min: 30, max: 20000, default: 1200, rate: 'a' },
    // Decibels, whatever the mode; the mapping into the node is the module's.
    resonanceDb: { unit: 'db', min: 0, max: 24, default: 3, rate: 'a' },
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.15, rate: 'a' },
    level: { unit: 'ratio', min: 0, max: 2, default: 0.85, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'filter',
  // A biquad's own ringing is not a tail, however resonant it is: nothing here
  // outlives the block.
  tail: 'none',
  // A filter's group delay is not a latency (round K1's gate carries the
  // arithmetic: a second-order Butterworth at 4.2 kHz delays by 2.4 samples).
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
