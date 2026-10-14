// **The one lean** (PLAN-UNIFY §0b, §2.3): how far a bird moves a weight, the same everywhere. A row's lean `x` on a
// choice multiplies its weight by
//
//   exp(x · strength · (bird − centre))
//
// so a bird at the row's centre leaves the weight as written, and a lean of 1 at strength 1 is ×0.61 at nought and
// ×1.65 at one (centre 0.5). Every planner that leans a draw by the birds calls this: the keys' draw, the ambient
// plan's bed and chapters, the ambient voices' vocabulary and weather, the producer's drum states and voice. Each row
// declares its `centre` and `strength` beside its leans (the producer's and the voices' rows kept their numbers when
// the three older conventions became this one: their leans were rewritten so every weight is the same double).
//
// A bird the spell does not carry, or a lean that is not a number, leans nothing (×1).

/** A row's leans: by bird, a choice's lean (a number) or a note in words; the row's `centre` and `strength` beside them. */
export interface LeanRow {
  centre?: number;
  strength?: number;
  [bird: string]: Record<string, number | string> | number | undefined;
}

/** The factor one bird puts on a weight: exp(x · strength · (v − centre)); ×1 where either number is missing. */
export function lean(x: unknown, v: unknown, strength = 1, centre = 0.5): number {
  return typeof x === 'number' && Number.isFinite(x) && x !== 0 && typeof v === 'number' && Number.isFinite(v) ? Math.exp(x * strength * (v - centre)) : 1;
}

/** The birds of a lean row with their leans (the row's `centre`, `strength` and words left out), in the row's order. */
export function leansOf(row: LeanRow | Record<string, unknown> | undefined): Array<[string, Record<string, number | string>]> {
  if (!row) return [];
  return Object.entries(row).filter(([bird, l]) => bird !== 'centre' && bird !== 'strength' && bird !== 'says' && typeof l === 'object' && l !== null) as Array<[string, Record<string, number | string>]>;
}

/** A row's centre and strength, as it declares them (0.5 and 1 where it names none). */
export const centreOf = (row: { centre?: unknown } | undefined): number => (typeof row?.centre === 'number' ? row.centre : 0.5);
export const strengthOf = (row: { strength?: unknown } | undefined): number => (typeof row?.strength === 'number' ? row.strength : 1);

/**
 * A weight leaned by every bird of a row on one choice, multiplied on in the row's order (`w` × the first bird's
 * factor × the second's …): the voices' and the producer's convention, kept so every weight is the same double.
 */
export function leaned(w: number, id: string, row: LeanRow | Record<string, unknown> | undefined, spell: Readonly<Record<string, number>>): number {
  const s = strengthOf(row as LeanRow), c = centreOf(row as LeanRow);
  let x = w;
  for (const [bird, leans] of leansOf(row)) if (typeof leans[id] === 'number') x *= lean(leans[id], spell[bird], s, c);
  return x;
}

/**
 * **The one lean, as a step** (PLAN-UNIFY U1): where a bird moves a quantity by steps (semitones of a register) rather
 * than a weight, its move is the lean's exponent, x · strength · (bird − centre), summed over the row's birds in the
 * row's order. A row's `centre` may be one value or one per bird (a place's own birds: the lean is nought there). The
 * sum is the caller's to round and bound.
 */
export function shiftOf(row: Readonly<Record<string, unknown>> | undefined, spell: Readonly<Record<string, number>>): number {
  if (!row) return 0;
  const s = typeof row.strength === 'number' ? row.strength : 1;
  const c = row.centre;
  let a = 0;
  for (const [bird, x] of Object.entries(row)) {
    if (bird === 'centre' || bird === 'strength' || bird === 'most' || bird === 'says') continue;
    const v = spell[bird], at = typeof c === 'number' ? c : c && typeof c === 'object' ? (c as Record<string, number>)[bird] : 0.5;
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof v !== 'number' || !Number.isFinite(v) || typeof at !== 'number') continue;
    a = a + x * s * (v - at);
  }
  return a;
}
