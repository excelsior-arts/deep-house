// A bird's value as a listener reads it: a percent of the house.
//
// Eugene, 09-23: *"0.45 is not obvious."* The eight numbers a spell is made of
// stay what they have always been — 0..1, in the composer, the calibration, the
// machine view, the checks **and the link**, which is the stable value a
// bookmark keeps (his amendment of the same day: *"the URL stays the stable
// value that never changes; we will never have less than 0 or more than 1"*).
// What moves is the one thing a hand reads off the ring: the bird's readout,
// its explanation and the phone's panel say **a percent of the house**.
//
// **The mapping, in one place** (`tools/check.ts` holds it):
//
//   0          ↔   0 %    the inner wall
//   the house  ↔ 100 %    each bird's own measured median (`HOUSE`), exactly
//   1          ↔ 130 %    the outer wall
//
// piecewise linear about the house, the same two halves the ring has always
// drawn a value on. A percent is **presentation and never state**: the value a
// hand holds is still the hundredth `spellQuery` writes, and the percent is
// read off it and rounded to a whole number for the readout — so two
// hundredths on the short outer half can read as the same whole percent, and
// the node's position is what tells them apart.
//
// **Why 130 at the rim, where Eugene suggested 150.** The node is drawn on the
// map the ring was blessed with: 0.72 of the rest radius at 0, the rest radius
// at the house. Held to that, the inner half is 0.28 R for a hundred points,
// and a percent that is *the node's own distance from the 0 % radius* puts the
// rim at `0.72 + 0.28 × 1.30 = 1.084 R` — 342.5 of the ring's thousand units,
// a unit and a half from where the rim has stood since UX-1 (1.08 R). So one
// percent is the same step of the node on both sides of the house, and the
// radius *is* the percent. 150 % would put the rim at 1.14 R, 360 units, which
// is inside the lane band (352–430) a scrub runs along.
//
// It imports nothing but the house, so the page and the node checks read the
// same arithmetic.
import { HOUSE } from './spell.ts';
import type { Bird } from './spell.ts';

/** The outer wall, as a percent of the house. */
export const RIM_PERCENT = 130;

/** A bird's value as a percent of its house, unrounded: 0 → 0, the house → 100, 1 → the rim. */
export function percentOf(b: Bird, v: number): number {
  const h = HOUSE[b];
  const t = Math.min(1, Math.max(0, v));
  if (t === h) return 100;
  return t < h
    ? (t / h) * 100
    : 100 + ((t - h) / (1 - h)) * (RIM_PERCENT - 100);
}

/** And back: the value a percent of the house stands for, clamped to the two walls. */
export function valueOfPercent(b: Bird, p: number): number {
  const h = HOUSE[b];
  const q = Math.min(RIM_PERCENT, Math.max(0, p));
  if (q === 100) return h;
  if (q >= RIM_PERCENT) return 1;
  return q < 100
    ? h * (q / 100)
    : h + (1 - h) * ((q - 100) / (RIM_PERCENT - 100));
}

/**
 * **What a hand's steps are, in the percent the ring speaks** (R64 of the
 * review of 09-24, Eugene's question 16). They were value units — an arrow
 * was 0.05 of a value, the snap 0.03 — while the face reads percent, so the
 * same key moved each bird by another share of its house and the snap was
 * lopsided (Spark's was 10.9 % below the house and 1.2 % above). In points of
 * a percent, one step is the same step for every bird on both halves.
 */
/** How near the house a hand's release snaps home and lets go, either side — and, since round K11, how near a moving hand has to come for the bird to snap onto the house. */
export const HOUSE_ZONE = 3;
/**
 * **The magnet's other half** (Eugene, round K11: *"a little snap/lock into
 * the 100 % position, so you need to pull harder to get it out … a gravity
 * for the 100 % value, for easy reset to the default"* — and, the same day,
 * *"don't make the magnet too hard — maybe 3 % of the bird's value at best, as
 * we can't lose the option to tune a bird a bit up from 100 % to tune the
 * sound"*). A bird sitting at the house stays there while the hand is within
 * this many points of it, either side, and follows the hand again only past
 * it — the lock the hand pulls out of. Coming back, it snaps home inside
 * `HOUSE_ZONE`. Both hands read the two through `magnet` below — the drag
 * along the spoke and the phone's slider — and they are the two numbers to
 * tune by hand: a pull-out band wider than the snap-in zone is a detent with
 * hysteresis (the brief's first reading was 8), and at 3 and 3 it is a small
 * symmetric lock that leaves a 5 % step off the house — one arrow, one press
 * of More, a short pull, a slider notch — landing and holding.
 *
 * On a desktop's ring 3 points are 2.7 units, about 2.5 px of hand on a 940 px
 * ring; on the phone's slider (0 to 130 over about 230 px) about 5 px.
 */
export const HOUSE_HOLD = 3;
/** An arrow key on a focused cell, and the phone's Less and More: to the next whole step. */
export const PULL_STEP = 5;
/** And a page key. */
export const PULL_PAGE = 20;
/** The phone's panel steps as the arrows do, and snaps its slider to the same grid. */
export const TAP_STEP = PULL_STEP;

/**
 * **The magnet**: where a hand at `p` percent puts a bird, given whether the
 * bird is sitting at the house now. At the house it stays at 100 until the hand
 * is more than `HOUSE_HOLD` away; off it, it snaps to 100 inside `HOUSE_ZONE`;
 * anywhere else it is where the hand is.
 */
export function magnet(p: number, atHouse: boolean): number {
  return Math.abs(p - 100) <= (atHouse ? HOUSE_HOLD : HOUSE_ZONE) ? 100 : p;
}

/** Is a value inside the house's snap zone? */
export const nearHouse = (b: Bird, v: number): boolean => Math.abs(percentOf(b, v) - 100) <= HOUSE_ZONE;

/** What the ring prints: a whole percent. */
export const percentShown = (b: Bird, v: number): number => Math.round(percentOf(b, v));

/** The same, as type: `62%`. */
export const percentText = (b: Bird, v: number): string => `${percentShown(b, v)}%`;
