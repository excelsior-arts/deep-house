// The calibration map: what a die's position measures as, and what to ask the
// die for to measure as something.
//
// ## The two spaces, and why nothing joined them until now
//
// A **spell** is eight dice positions. A **reading** is what eight birds
// measure as when the audio that came out of those dice is put through
// `tools/imprint/`. They are written in the same eight names and on the same
// 0..1 scale, and for that reason they have been used interchangeably since the
// day both existed — a recipe's `birds` is a box the randomiser rolls *inside*
// and a mined row's `birds` is a box somebody's record measured *as*.
//
// They are not the same number. `notes/rounds/analysts-tooling.md` §7 is the
// reproduction: an attempt asked Loom for 0.381 and read back 0.758, asked
// 0.012 and read 0.718 — a third of the die moved the reading by four
// hundredths — and every mined box is scored on that axis. Until something maps
// one space onto the other, a mined row asks for the wrong place by the offset
// between the two, and the catalog's closeness measures that offset as much as
// it measures the recipe.
//
// This file is the map, as a value. The measurement behind it is
// `packages/mining/tools/calibration.ts`; the numbers are
// `strategies/calibration-v2.json`, written by that tool's gate and named by
// the strategy row the way a digest is. Today there is no such live map: the
// one sweep ever fitted is `strategies/calibration-v2-legacy.json`, a map of a
// generator that no longer exists, carried only as `legacyCalibration` for
// replaying rows captured through interpreter v2.8.
//
// ## What the map is a map of
//
// **Displacement from the live house-spell reading.** Every knot is `delta`:
//
//     forward(b, x)  =  origin[b] + delta_b(x)          delta_b(house) = 0
//
// `origin` is what the house die measured as on the sweep, not the golden
// `HOUSE` vector. Those two disagree (Spark 0.48 live against 0.275 on the
// vector), and adding a live delta onto the vector was reporting Spark's
// reach as 0.14–0.35 when the die actually reads 0.36–0.55. The house knot
// is still nought by construction of the pairing. Three things follow:
//
//   1. **`forward(b, HOUSE[b])` is `origin[b]` to the bit**, and
//      `inverse(b, origin[b])` is the house die. The golden vector is not
//      this identity — a live house-v2 eight-bar render of these seeds is.
//   2. **The record's own scatter is not in it.** Pairing still differences
//      each seed against itself at the house.
//   3. **It is a strategy's.** `house-v2` carries one. `house-v1` carries
//      `null`.
//
// A reading outside the reach is clamped onto it, then inverted; a plateau
// (displacements within `PLATEAU`) answers with the house-nearest die, not
// the wall. Ember above the house is a plateau: asking 0.46 is the house
// die, not 0.90. `attempt` does not invert bird by bird at all: it picks the
// nearest row of `table`, because Ember at 0.10 is a different piece.

import { BIRDS, HOUSE } from './spell.ts';
import type { Bird, Spell } from './spell.ts';

/** Bumped when a field's meaning changes, never when a number moves. */
export const CALIBRATION_SCHEMA = 2;

/**
 * Two displacements closer than this are one reading. Inverse of that reading
 * is the house-nearest die on the plateau, not the wall: Ember above the house
 * moves the *music* (tempo) and not the encoder, and asking for 0.46 used to
 * become die 0.90 and a different piece.
 */
export const PLATEAU = 0.01;

/** Which window a bird's map was fitted at, and is therefore valid at. */
export type Window = 'short' | 'long';

/** One bird's map. `knots` is `[die, displacement]`, ascending in the die. */
export interface BirdMap {
  window: Window;
  knots: Array<[number, number]>;
  /** the die the house sits at, which is the knot whose displacement is nought */
  house: number;
  /**
   * What the house die **measures as** at this bird's window, mean over the
   * sweep's house-spell seeds. Forward is `origin + delta`, not `HOUSE + delta`:
   * the golden vector and a live house-v2 render of these seeds disagree (Spark
   * 0.275 against 0.48).
   */
  origin: number;
  /** the readings this die can actually produce, `[lo, hi]` = origin plus the knots */
  reach: [number, number];
  /** the whole reach over the whole die: how much a unit of die is worth */
  slope: number;
  /** what another bird's die does to this one, where it earned its place */
  cross: Record<string, Array<[number, number]>>;
  /** the held-out root mean square error, in bird units */
  residual: number;
  /** how many held-out readings that residual is over */
  n: number;
  /** why that window, in one line */
  why?: string;
}

export interface Calibration {
  schema: number;
  kind: 'calibration';
  strategy: string;
  /** the encoder the sweep was read with; a reading under another is not this */
  encoder: string;
  windows: Record<Window, string>;
  provenance: Record<string, any>;
  birds: Record<Bird, BirdMap>;
  /**
   * The sweep as a table: one row per (spell, seed) at eight bars, which is
   * the window `attempt` renders. Eight independent inverses cannot say
   * "Ember at 0.10 is a different piece"; a nearest row can.
   */
  table?: CalPoint[];
}

/** One measured spell, dice and short-window readings. */
export interface CalPoint {
  id: string;
  seed: string;
  spell: Spell;
  read: Spell;
}

/**
 * A piecewise-linear table read at `x`, clamped at both ends, **exact on a
 * knot**. The equality branch is not an optimisation: `y0 + (x - x0) * (y1 -
 * y0) / (x1 - x0)` at `x === x1` is `y0 + (y1 - y0)`, which is not `y1` for
 * every pair of doubles, and the house is a knot.
 */
export function atKnots(knots: Array<[number, number]>, x: number): number {
  if (!knots.length) return 0;
  for (const k of knots) if (x === k[0]) return k[1];
  if (x < knots[0][0]) return knots[0][1];
  const last = knots[knots.length - 1];
  if (x > last[0]) return last[1];
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1];
    const [x1, y1] = knots[i];
    if (x < x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  return last[1];
}

/**
 * A table read the other way: the die that produces this displacement.
 * Knots within `PLATEAU` of the asked displacement are one reading, and the
 * answer is the house-nearest of them — so a high-end Ember plateau (0.003
 * above the house, inside the encoder's noise) asks for the house die, not 0.90.
 */
function dieForDelta(knots: Array<[number, number]>, d: number, house: number): number {
  if (!knots.length) return house;
  let exact: number | null = null;
  for (const k of knots) {
    if (Math.abs(k[1] - d) > PLATEAU) continue;
    if (exact === null || Math.abs(k[0] - house) < Math.abs(exact - house)) exact = k[0];
  }
  if (exact !== null) return exact;
  const up = knots[knots.length - 1][1] >= knots[0][1];
  const first = knots[0];
  const last = knots[knots.length - 1];
  if (up ? d < first[1] : d > first[1]) return first[0];
  if (up ? d > last[1] : d < last[1]) return last[0];
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1];
    const [x1, y1] = knots[i];
    const inside = up ? d > y0 && d < y1 : d < y0 && d > y1;
    if (!inside) continue;
    return y1 === y0 ? x0 : x0 + ((d - y0) * (x1 - x0)) / (y1 - y0);
  }
  return house;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The live reading at the house die, or the golden vector if the map is old. */
export function originOf(cal: Calibration | null | undefined, bird: Bird): number {
  const m = cal && cal.birds ? cal.birds[bird] : null;
  return m && typeof m.origin === 'number' ? m.origin : HOUSE[bird];
}

/** The eight live house-spell readings the map was differenced against. */
export function originSpell(cal: Calibration | null | undefined): Spell {
  const out = {} as Spell;
  for (const b of BIRDS) out[b] = originOf(cal, b);
  return out;
}

/**
 * What a die reads as, one bird at a time and the other seven wherever they
 * are: the **main effect**, which is the half of the map that has an inverse.
 * The cross-terms are `forwardSpell` below.
 */
export function forwardOf(cal: Calibration | null | undefined): (bird: Bird, die: number) => number {
  return (bird: Bird, die: number): number => {
    const m = cal && cal.birds ? cal.birds[bird] : null;
    if (!m) return die;
    return originOf(cal, bird) + atKnots(m.knots, die);
  };
}

/**
 * What die to ask for, to read as this. A reading outside the reach is clamped
 * onto it first, then inverted: the wall of the die is a different piece, and
 * the closest *reachable reading* on a saturating curve is the house.
 */
export function inverseOf(cal: Calibration | null | undefined): (bird: Bird, reading: number) => number {
  return (bird: Bird, reading: number): number => {
    const m = cal && cal.birds ? cal.birds[bird] : null;
    if (!m) return reading;
    const asked = clamp(reading, m.reach[0], m.reach[1]);
    return clamp01(dieForDelta(m.knots, asked - originOf(cal, bird), m.house));
  };
}

/**
 * The whole prediction, cross-terms and all: what eight dice at once read as.
 * This is what a residual is measured against and what a readout shows beside
 * what was asked; it is not invertible bird by bird, which is why the box goes
 * through the main effect and this stands beside it.
 */
export function forwardSpell(cal: Calibration | null | undefined, spell: Spell): Spell {
  const out = {} as Spell;
  for (const b of BIRDS) {
    const m = cal && cal.birds ? cal.birds[b] : null;
    if (!m) { out[b] = spell[b]; continue; }
    let d = atKnots(m.knots, spell[b]);
    for (const [c, knots] of Object.entries(m.cross)) {
      const v = spell[c as Bird];
      if (typeof v === 'number') d += atKnots(knots, v);
    }
    out[b] = clamp01(originOf(cal, b) + d);
  }
  return out;
}

/**
 * The eight dice that read as this whole vector, cross-terms included: the
 * main-effect inverse, then two passes that take off what the other seven dice
 * are doing to each bird.
 *
 * Two and not until it settles: the cross-terms are small next to the main
 * effects wherever a main effect exists at all, so two passes are inside the
 * measurement's own noise of the fixed point, and a loop with a tolerance in it
 * would be a number nobody measured. **At the live origin it is the identity**:
 * every displacement asked for is nought, every cross-term at the house die is
 * nought, and the main inverse of nought is the house die.
 */
export function inverseSpell(cal: Calibration | null | undefined, reading: Spell): Spell {
  const inverse = inverseOf(cal);
  const out = {} as Spell;
  for (const b of BIRDS) out[b] = inverse(b, reading[b]);
  if (!cal || !cal.birds) return out;
  for (let pass = 0; pass < 2; pass++) {
    const next = {} as Spell;
    for (const b of BIRDS) {
      const m = cal.birds[b];
      if (!m) { next[b] = out[b]; continue; }
      let off = 0;
      for (const [c, knots] of Object.entries(m.cross)) {
        const v = out[c as Bird];
        if (typeof v === 'number') off += atKnots(knots, v);
      }
      const asked = clamp(reading[b], m.reach[0], m.reach[1]);
      next[b] = clamp01(dieForDelta(m.knots, asked - originOf(cal, b) - off, m.house));
    }
    for (const b of BIRDS) out[b] = next[b];
  }
  return out;
}

/**
 * The measured spell whose short-window reading is nearest `asked`. Eight
 * independent inverses cannot represent "Ember at 0.10 is a different piece";
 * a row of the sweep can. Null when the map carries no table.
 */
export function nearestSpell(
  cal: Calibration | null | undefined,
  asked: Spell,
): { spell: Spell; id: string; seed: string; dist: number } | null {
  const table = cal && cal.table;
  if (!table || !table.length) return null;
  let best: CalPoint | null = null;
  let bestD = Infinity;
  for (const row of table) {
    let d = 0;
    for (const b of BIRDS) {
      const a = asked[b];
      const r = row.read[b];
      if (typeof a === 'number' && typeof r === 'number') d += (a - r) * (a - r);
    }
    if (d < bestD) { bestD = d; best = row; }
  }
  return best ? { spell: best.spell, id: best.id, seed: best.seed, dist: Math.sqrt(bestD) } : null;
}

/** Dice for a reading: the nearest measured spell, else the independent inverse. */
export function spellForReading(cal: Calibration | null | undefined, asked: Spell): Spell {
  const n = nearestSpell(cal, asked);
  return n ? n.spell : inverseSpell(cal, asked);
}

/**
 * A row's box, read as readings and handed back as dice.
 *
 * The **main effect** and not `inverseSpell`, deliberately: a box is mapped
 * before anything is rolled, so there is no spell yet for a cross-term to be a
 * function of, and a box whose ends were corrected against a roll that has not
 * happened would be a box that changed under the die. What the cross-terms are
 * for is saying how far a rolled spell will land from what the row asked, which
 * is `forwardSpell` beside the answer.
 *
 * Both ends go through the same map, so an end below the house stays below it:
 * the map is monotone, which is the property the fit is made to have.
 */
export function boxInDice(
  cal: Calibration | null | undefined,
  box: Record<Bird, [number, number]>,
): Record<Bird, [number, number]> {
  if (!cal) return box;
  const inverse = inverseOf(cal);
  const out = {} as Record<Bird, [number, number]>;
  for (const b of BIRDS) {
    const r = box[b];
    const lo = inverse(b, r[0]);
    const hi = inverse(b, r[1]);
    out[b] = lo <= hi ? [lo, hi] : [hi, lo];
  }
  return out;
}

/** Which birds a reading asks for outside what their die can reach. */
export function unreachable(
  cal: Calibration | null | undefined,
  box: Record<Bird, [number, number]>,
): Array<{ bird: Bird; asked: [number, number]; reach: [number, number] }> {
  const out: Array<{ bird: Bird; asked: [number, number]; reach: [number, number] }> = [];
  if (!cal || !cal.birds) return out;
  for (const b of BIRDS) {
    const m = cal.birds[b];
    const r = box[b];
    if (!m || !r) continue;
    const lo = Math.max(r[0], m.reach[0]);
    const hi = Math.min(r[1], m.reach[1]);
    if (!(lo <= hi)) out.push({ bird: b, asked: [r[0], r[1]], reach: [m.reach[0], m.reach[1]] });
  }
  return out;
}

export default forwardOf;

/**
 * The interpreters whose captured rows replay through a strategy's
 * `legacyCalibration`: `local` only ever captured `v1` and `v2`, and v2.8 was
 * the last interpreter before generation changed under the map (checked commit
 * by commit). Anything newer needs a map measured on the current generator.
 */
export const LEGACY_INTERPRETERS = /^v(?:1|2(?:\.[0-8])?)$/;

/** A map may describe an earlier generator; do not turn that into a live claim. */
export function calibrationStatus(cal: Calibration | null, generation: string, encoder?: string): 'missing' | 'stale' | 'current' {
  if (!cal) return 'missing';
  return cal.provenance.generation === generation && (!encoder || cal.encoder === encoder) ? 'current' : 'stale';
}
export function requireCurrentCalibration(cal: Calibration | null, generation: string, encoder?: string): Calibration {
  const status = calibrationStatus(cal, generation, encoder);
  if (status !== 'current') throw new Error(`calibration ${status}: ${generation} needs a matching measured map; historical reach is not current reach`);
  return cal!;
}
