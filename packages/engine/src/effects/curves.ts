// The two shaping curves of the drive family, and one rule they both obey.
//
// **A curve is normalised so that full scale in is full scale out.** A shaper
// whose output peak depends on how hard it is driven is a shaper whose level
// has to be chased with a gain every time the drive moves, and a level table is
// only a level table if nothing in it does that. So the table is built, its own
// largest magnitude is found, and it is divided through: the loudest a drive
// can be is the loudest its input was, and `level` is then a level and not a
// compensation.
//
// `dsp.ts` already has three curves and they stay exactly where they are: the
// soft clipper is the master's safety, `saturationCurve` is the push and the
// glue, `evenCurve` is the sub's second harmonic. These two are the kitchen's
// own and are meant to be *heard*, which is a different job from being a
// safety, and putting them here keeps round K1 out of v1's files entirely.
//
// Round K4 adds two more under the same rule — a fuzz and a staircase — and one
// of them is deliberately **not** normalised: a bit crusher's whole job is that
// the output lands on a fixed grid, and dividing the table through by its own
// peak would move the grid.

import { curveOf } from '../dsp.ts';

/**
 * Soft and asymmetric: a tanh whose two halves saturate at different levels.
 *
 * A tanh alone is odd-symmetric, so it grows the 3rd, 5th and 7th harmonic and
 * never the 2nd — which is why a driven sine gets reedy rather than warm, and
 * the note over `evenCurve` in `dsp.ts` says the same thing. The asymmetry here
 * is that the negative half tops out at `1 - a` where the positive half tops
 * out at 1, with the same slope through nought, so the curve is smooth where
 * the signal crosses and the two halves are different shapes where it
 * saturates.
 *
 * **MEASURED, because the obvious way round does not work.** The first draft
 * bent the *input* — `tanh(k·(x + a·x²))`, which is the textbook way to add
 * even harmonics — and the second harmonic came out 46 dB down at every drive
 * from 1 to 31, against the 20 dB the bend alone gives. The reason is that the
 * bend only exists where the tanh is straight: by the time the drive is doing
 * anything, both peaks are pressed against ±1 and the asymmetry has been
 * flattened out of the signal. Asymmetry has to be in the *saturation* to
 * survive being driven, which is what this is: the second harmonic reads -24 dB
 * at a drive of 1, -33 at a drive of 4 and -41 at the top of the range, where
 * the input bend read -46 at every one of them.
 *
 * @param k how hard the tanh is: 1 is nearly a wire, 6 is a fuzz
 * @param a how much lower the negative half saturates, and so the
 *   even harmonics
 * @param n table size
 */
export function overdriveCurve(k = 3, a = 0.3, n = 4096): Float32Array<ArrayBuffer> {
  return curveOf(`od:${k}:${a}:${n}`, () => {
    const curve = new Float32Array(n);
    const low = Math.max(0.2, 1 - a);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = x >= 0 ? Math.tanh(k * x) : -low * Math.tanh((k * -x) / low);
    }
    // An asymmetric curve leaves a standing offset, and a shaper that outputs a
    // constant with nothing in front of it is a DC generator. The value the curve
    // takes at nought is subtracted back out, which is the whole of it: the
    // asymmetry stays and the offset goes. (What a sine through it leaves is a
    // *different* offset, which is the even harmonics' own DC term and belongs to
    // the signal; the record's master chain has a DC blocker at 20 Hz.)
    // The table has no sample at exactly nought — it runs from -1 to 1 over an
    // even count — so the two either side of it are averaged.
    return settle(curve, n);
  });
}

/**
 * Harder: a knee and then a wall.
 *
 * The difference from the overdrive above is what happens to a *quiet* signal.
 * A tanh bends everything, so a passage twelve decibels down is shaped as much
 * as the loud one is, in proportion; a knee clipper is a straight line under
 * its knee and a wall over it, so the drive is what decides whether a note
 * distorts at all. That is what a distortion is for and a saturator is not.
 *
 * The asymmetry is in the walls and not in the knees, for the reason written
 * over the overdrive: the negative half stops at `1 - a` where the positive
 * half stops at 1, so what survives being driven hard is two different
 * ceilings.
 *
 * @param knee where the straight line ends, as a fraction of full scale
 * @param a how much lower the negative half's wall is
 * @param n table size
 */
export function distortionCurve(knee = 0.2, a = 0.25, n = 4096): Float32Array<ArrayBuffer> {
  return curveOf(`dist:${knee}:${a}:${n}`, () => {
    const curve = new Float32Array(n);
    const t = Math.max(0.02, Math.min(0.9, knee));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const m = Math.abs(x);
      const head = Math.max(0.05, (x >= 0 ? 1 : 1 - a) - t);
      curve[i] = m <= t ? x : Math.sign(x) * (t + head * Math.tanh((m - t) / head));
    }
    return settle(curve, n);
  });
}

export default { overdriveCurve, distortionCurve, fuzzCurve, crushCurve, makeupAt };

// --- the level a drive leaves ------------------------------------------------
//
// **A normalised curve is not a level-neutral effect.** Full scale in is full
// scale out, which is what the rule above promises, and it is true; but a
// voice reaches an insert at about -18 dBFS and not at full scale, and there a
// drive is a gain: the knob in front multiplies the signal and the curve only
// bends what is left of it. MEASURED on pink noise at -18 dBFS
// (`tools/drive-level.ts`), mix 1: the overdrive at its default drive was
// **+9.6 dB** over its input, the distortion +8.2, the fuzz +5.2, the filter
// +5.9 of it from its drive alone — and more at the level a note reaches a
// per-note insert at, where the curve is straight and the whole of the drive
// is gain. house-v2's treatment rota writes only the
// mix, so a pad under the overdrive came out of the wet about twenty decibels
// hotter than its level and drove the master's limiter into half its blocks
// (round F's finding, seed 20 bars 8-16).
//
// So every drive carries its own make-up: a gain after the shaper that follows
// the drive knob, read off a table MEASURED at points of the knob's range and
// interpolated in decibels between them. The points are its two ends, its
// quarters, its first eighth and sixteenth (a drive rises steepest at the
// bottom, and a straight line from nought to a quarter was a decibel out at
// the filter's default of 0.15) and its default, so the number the rota plays
// is a reading and not an interpolation. It is measured at -36 dBFS, where the
// curve is still straight, so a note at its own level comes out at its own
// loudness and anything louder is bent and comes out quieter, never louder
// (`tools/drive-level.ts` has the readings at both levels). The table is written by
// `node tools/test-effects-2.ts --bless-drive` and nothing else, and the same
// file's gate holds every drive effect to within a decibel of its input
// loudness at the reference at every one of those points. `level` is then a
// level again, and at its default of 1 the mix knob blends two signals of one
// loudness.

/**
 * The make-up gain a drive needs at a fraction of its knob's range, off its
 * measured table: `at` the fractions, ascending, and `db` the readings there.
 */
export function makeupAt(at: readonly number[], db: readonly number[], frac: number): number {
  const f = Math.max(at[0], Math.min(at[at.length - 1], frac));
  let i = 0;
  while (i < at.length - 2 && f > at[i + 1]) i++;
  const span = at[i + 1] - at[i];
  const v = db[i] + (db[i + 1] - db[i]) * (span > 0 ? (f - at[i]) / span : 0);
  return Math.pow(10, v / 20);
}

// --- round K4's two ---------------------------------------------------------

/** The last two lines of every curve in this file: take the offset out, scale to full. */
function settle(curve: Float32Array<ArrayBuffer>, n: number): Float32Array<ArrayBuffer> {
  const zero = (curve[n / 2 - 1] + curve[n / 2]) / 2;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    curve[i] -= zero;
    if (Math.abs(curve[i]) > peak) peak = Math.abs(curve[i]);
  }
  if (peak > 0) for (let i = 0; i < n; i++) curve[i] /= peak;
  return curve;
}

/**
 * A fuzz: a wall with an octave blended into it.
 *
 * The difference from `distortionCurve` above is not degree, it is shape. A
 * distortion has a knee and then a wall, so a quiet passage goes through it
 * untouched; a fuzz has no knee at all — it is a straight line with a very
 * steep slope into a wall, so **everything** is squared off and the only thing
 * a level change buys is how long each half cycle spends against the wall. That
 * is why a fuzz sustains and a distortion does not.
 *
 * The octave is a full-wave rectifier, `2·|y| - 1`, which is the oldest trick
 * there is and is genuinely an octave: an even function of a sine is a sine at
 * twice the rate. It is blended rather than switched, because what a fuzz box
 * actually does is leak — a little rectification is a bright fuzz and all of it
 * is a ring-modulator with one input.
 *
 * At `octave: 1` the curve is **even**, so it has no fundamental left in it at
 * all, and what comes out of a chord through it is the sum and difference of
 * every pair of partials. That is the sound and it is why the range runs to 1.
 *
 * @param k how steep the line into the wall is: 2 is dirty, 40 is a wall
 * @param octave how much of the output is rectified
 */
export function fuzzCurve(k = 8, octave = 0.35, n = 4096): Float32Array<ArrayBuffer> {
  return curveOf(`fuzz:${k}:${octave}:${n}`, () => {
    const curve = new Float32Array(n);
    const o = Math.max(0, Math.min(1, octave));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const hard = Math.max(-1, Math.min(1, x * k));
      curve[i] = (1 - o) * hard + o * (2 * Math.abs(hard) - 1);
    }
    return settle(curve, n);
  });
}

/**
 * A staircase: the signal rounded to `2^bits` levels.
 *
 * It is what a bit crusher is, exactly and with nothing left out — quantisation
 * is rounding and rounding is a table — and it is the one effect in the kitchen
 * that a `WaveShaper` does *better* than a worklet would, because a table of
 * 8192 points interpolated is a staircase with no aliasing on its own risers.
 *
 * `bits` is allowed to be fractional, which is not a thing a converter can be
 * and is a thing a knob should be: 6.5 bits is 91 levels and the step between
 * six and seven is otherwise a doubling.
 *
 * @param n the table, which has to be a good deal finer than the
 *   staircase or the interpolation rounds the corners off it
 */
export function crushCurve(bits = 6, n = 16384): Float32Array<ArrayBuffer> {
  return curveOf(`crush:${bits}:${n}`, () => {
    const curve = new Float32Array(n);
    const levels = Math.max(1, Math.pow(2, Math.max(1, bits) - 1));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.max(-1, Math.min(1, Math.round(x * levels) / levels));
    }
    return curve;
  });
}
