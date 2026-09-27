// A four-pole lowpass with a saturator in the middle of it, and an honest name.
//
//   input -> drive -> [ biquad 1 (resonant) -> shaper -> biquad 2 ] -> level -> wet
//
// It is called `ladder` because that is what this shape is for — the
// twenty-four-decibel lowpass a synthesiser is built round, where the record's
// own filters are all twelve — and the module says plainly what it is not.
//
// **A real ladder is a feedback loop and this is not one.** Four one-pole
// sections with the output fed back to the input, inverted, is what makes a
// Moog-style filter resonate and what makes its resonance *thin the bottom* as
// it comes up. A loop like that has to be computed sample by sample, and in
// this engine a loop through nodes cannot be shorter than a render quantum —
// 128 samples, round K2's Karplus finding, the same wall that put a string into
// a cached buffer and a comb into a feed-forward one. So this is two
// second-order sections in series, which is four poles and the right slope, with
// the resonance on the first of them.
//
// What that costs, said exactly, because the round measures it: the slope is a
// real 24 dB an octave; the resonance is a peak at the corner and does **not**
// take the bottom out from under it the way a ladder's does; and the saturator
// between the two sections is where a ladder's transistors are, which is the
// part that matters most by ear — a resonant filter that cannot clip its own
// resonance sounds like a filter and not like an instrument.
//
// The shaper is between the sections rather than in front of them on purpose.
// In front, it is a drive and the second filter takes its harmonics off; in the
// middle, what it is shaping is *already resonant*, so what it clips is the peak
// and the result is the compression a self-oscillating filter has.
//
// ## And the shaper is SYMMETRIC, which is the one thing this file got wrong
//
// The first build used the kitchen's asymmetric curve — `overdriveCurve(2.6,
// 0.22)`, the one whose negative half saturates lower than its positive half so
// that it grows even harmonics. That is right for a drive and wrong for a
// ladder, twice over.
//
// It is wrong **physically**: a transistor ladder is a stack of differential
// pairs, and a differential pair saturates the same amount either way. That is
// the whole reason a Moog-style filter's overdrive is odd-harmonic and reads as
// warm rather than as fuzzy, and it is why a fuzz and a ladder do not sound
// alike however hard either is driven.
//
// And it is wrong **audibly**, which is how it was caught. An asymmetric curve
// leaves a standing offset that depends on how loud its input is — `curves.ts`
// subtracts the offset the *curve* has at nought, which is a different thing —
// so the output rail rides up and down with the envelope. MEASURED at the
// declared defaults on a 220 Hz tone: **0.0702 of full scale, which is -23
// dBFS of DC**, moving with every note. Eugene heard the audition as artefacts
// and that is what they were: a thump at every onset and release, and six
// tenths of a decibel of headroom gone. A symmetric curve has no offset to
// leave at any level, and the reading is **0.00000**.
//
// A **DC blocker** stands behind it all the same, because an effect has to be
// inside its own contract and not inside somebody else's. `master.ts` has one
// at the end of the record, so in a mix this would have been swallowed; a
// `voice`-scope insert may be rendered into a wire — every fixture in this
// kitchen does exactly that — and an effect that is only clean downstream of
// the master is an effect nobody can measure. It is a highpass at 18 Hz, which
// is under everything this record has (the sub's own fundamental is 40 Hz), and
// it costs one node.

import { shell, knob } from './shell.ts';
import type { Knob } from './shell.ts';
import { overdriveCurve, makeupAt } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** MEASURED, as the filter's: against this ladder's own loudness with no drive (`tools/test-effects-2.ts --bless-drive`). */
export const MAKEUP_AT = [0, 0.0625, 0.125, 0.25, 0.35, 0.5, 0.75, 1];
export const MAKEUP_DB = [0, -2.76, -4.84, -7.89, -9.72, -11.86, -14.46, -16.35];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const drive = ctx.createGain();
  drive.gain.value = 1 + p.drive * 6;
  const one = ctx.createBiquadFilter();
  one.type = 'lowpass';
  one.frequency.value = p.cutoffHz;
  // Decibels at the corner, not a linear Q. All of the resonance is on the
  // first section: split between the two it is two peaks a little apart, which
  // is a wobble and not a resonance.
  one.Q.value = p.resonanceDb - 3.01;
  const bite = ctx.createWaveShaper();
  // **Symmetric**: the second argument is the asymmetry and a ladder has none.
  bite.curve = overdriveCurve(2.6, 0);
  bite.oversample = 'none';
  const two = ctx.createBiquadFilter();
  two.type = 'lowpass';
  two.frequency.value = p.cutoffHz;
  two.Q.value = -3.01;
  // The DC blocker. Last, so what leaves this effect has no offset in it
  // whatever was put into it — including an input that arrived with one.
  const dc = ctx.createBiquadFilter();
  dc.type = 'highpass';
  dc.frequency.value = 18;
  // Decibels of resonance at the corner, not a linear Q: a DC blocker that
  // rings is a bump in the octave it exists to keep clean.
  dc.Q.value = -3.01;
  const level = ctx.createGain();
  level.gain.value = p.level;
  // The make-up, which follows the drive (curves.ts, `makeupAt`).
  const makeup = ctx.createGain();

  sh.input.connect(drive);
  drive.connect(one);
  one.connect(bite);
  bite.connect(two);
  two.connect(dc);
  dc.connect(makeup);
  makeup.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(drive, one, bite, two, dc, makeup, level);

  const driveKnob = knob(ctx, drive.gain, 1 + p.drive * 6);
  const makeupKnob = knob(ctx, makeup.gain, makeupAt(MAKEUP_AT, MAKEUP_DB, p.drive));
  const qKnob = knob(ctx, one.Q, p.resonanceDb - 3.01);
  const cutKnobs = [knob(ctx, one.frequency, p.cutoffHz), knob(ctx, two.frequency, p.cutoffHz)];

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      // A setter and not the AudioParam, because the corner is two nodes: a
      // caller writing a sweep writes it once and both sections follow.
      cutoffHz: (v: number, at?: number, over?: number) => cutKnobs.forEach((k: Knob) => k(Math.max(20, v), at, over)),
      resonanceDb: (v: number, at?: number, over?: number) => qKnob(v - 3.01, at, over),
      drive: (v: number, at?: number, over?: number) => {
        const d = Math.max(0, Math.min(1, v));
        driveKnob(1 + d * 6, at, over);
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
  id: 'ladder',
  family: 'tone',
  scope: 'voice',
  applies: ['bass', 'keyboard', 'ensemble', 'sub', 'melodic', 'keys'],
  params: {
    cutoffHz: { unit: 'hz', min: 30, max: 20000, default: 900, rate: 'k' },
    resonanceDb: { unit: 'db', min: 0, max: 22, default: 8, rate: 'a' },
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.35, rate: 'a' },
    // MEASURED, and it came down when the curve became symmetric: an
    // asymmetric shaper was throwing away the top fifth of every negative half
    // cycle, so the same settings are **1.2 dB louder** without it. The default
    // is where it is so that the declared defaults sit in the headroom they sat
    // in before — -2.4 dBFS on the fixture rather than -1.3.
    level: { unit: 'ratio', min: 0, max: 2, default: 0.7, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'ladder',
  tail: 'none',
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
