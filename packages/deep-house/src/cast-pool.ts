// A tap on the die: a dozen candidate seeds, each planned and measured against
// what is playing, and the one the tap asks for. The ring draws the pool and
// `tools/check.ts` walks twenty taps through the same two functions, so the
// check measures the cast the page makes and not a copy of it (the reconciled
// review, R59).
//
// **The plan is asked of the caller**, because what a candidate is planned as
// is the page's whole request — the engine the set is on, the spell and recipe
// a seed of its own would be cast under, the modes, the theme length — and the
// one place that resolves that request is the control (`control.planned`). The
// pool planned every candidate with no strategy at all, which is house-v1 on a
// house-v2 page: distances measured against a record the throw would never
// land on, and under `?development=shaped` every candidate throwing.

import { styleDistance, FLOOR } from './style-distance.ts';
import type { Parts, PlannedTheme } from './style-distance.ts';

/** One seed the throw might land on, with how far it stands from what is playing. */
export interface Candidate { seed: string; distance: number; differs: string[]; parts: Parts; plan: PlannedTheme }

/** What a pool is drawn from. */
export interface PoolAsk {
  /** the plan under the needle, which the candidates are measured against */
  cur: PlannedTheme | null;
  /** the seed playing now, as a number where it is one */
  here: number;
  /** which side of it the throw was going: +1, −1, or 0 for the whole range */
  dir: number;
  rnd: () => number;
  /** the candidate's first theme, planned as the page would play it */
  plan: (seed: string) => PlannedTheme;
  candidates: number;
  seedMin: number;
  seedMax: number;
}

/**
 * The candidates, planned and scored against what is playing. The side of the
 * current seed they are drawn from is the side the drag was going, so a throw
 * backwards is not the same throw as one forwards. A candidate that cannot be
 * planned is left out, not thrown.
 */
export function castPool(o: PoolAsk): Candidate[] {
  let lo = o.seedMin;
  let hi = o.seedMax;
  if (o.dir > 0 && o.seedMax - o.here > o.candidates * 8) lo = o.here + 1;
  else if (o.dir < 0 && o.here - o.seedMin > o.candidates * 8) hi = o.here - 1;
  const seen = new Set([String(o.here)]);
  const pool: Candidate[] = [];
  for (let i = 0; i < o.candidates; i++) {
    const seed = String(lo + Math.floor(o.rnd() * (hi - lo + 1)));
    if (seen.has(seed)) continue;
    seen.add(seed);
    let plan: PlannedTheme | null = null;
    try { plan = o.plan(seed); } catch (err) { continue; }
    const d = styleDistance(o.cur, plan);
    pool.push({ seed, distance: d.distance, differs: d.differs, parts: d.parts, plan });
  }
  pool.sort((a, b) => a.distance - b.distance);
  return pool;
}

/**
 * Which one the throw asks for: the floor first — a record that moves nothing a
 * listener would name is not a new record, whatever its number says — and then
 * the band.
 */
export function pickCast(pool: Candidate[], band: number, floor: (p: Parts) => boolean): Candidate | null {
  if (!pool.length) return null;
  let up = pool.filter((c) => floor(c.parts));
  if (!up.length) up = pool.filter((c) => FLOOR.loud(c.parts));
  if (!up.length) up = pool;
  return up[Math.max(0, Math.min(up.length - 1, Math.round(band * (up.length - 1))))];
}
