// **The chord stab's shape in front** (round front-stabs; his verdicts 10-31 on the chord on beat 1 and beat 2: "sounds
// horrible", "it almost always borderlining unpleasant in house"). The stab lane keeps a mined mask's first hits under the
// density's cap, so a sparse theme strikes beat 1 and beat 2 and leaves the bar empty, bar after bar. From the row's tempo
// up: a bar the cap cuts to a front-loaded shape does not play (the bed, the bass and the drums carry it), and a stab that
// plays walks its chord bar to bar, its later hits softer (`recipes/arrangement/stab-shape.json`). Nothing here names a
// voice, a place, a genre or a seed.
import STAB_SHAPE_FILE from '../recipes/arrangement/stab-shape.json' with { type: 'json' };

export interface StabShapeRow { id: string; name: string; leastBpm: number; frontSteps: number; inversions: number[]; laterVel: number }
const FILE = STAB_SHAPE_FILE as unknown as { rows: StabShapeRow[] };
/** The stab-shape rows, by id. */
export const STAB_SHAPE_ROWS: Readonly<Record<string, StabShapeRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/** Whether the cap leaves a bar front-loaded: it cut some of the bar's hits, and every hit it kept falls before `frontSteps`. */
export function cutToFront(row: StabShapeRow, all: ReadonlyArray<{ step: number }>, kept: ReadonlyArray<{ step: number }>): boolean {
  return all.length > kept.length && kept.length > 0 && kept.every((h) => h.step < row.frontSteps);
}

/** The chord walked for a bar: its `inversions[bar in phrase]` lowest voices an octave up, in order. */
export function walkedVoicing(row: StabShapeRow, voicing: readonly number[], barInPhrase: number): number[] {
  const k = Math.min(row.inversions[((barInPhrase % row.inversions.length) + row.inversions.length) % row.inversions.length] ?? 0, Math.max(0, voicing.length - 1));
  const sorted = [...voicing].sort((a, b) => a - b);
  return sorted.map((m, i) => (i < k ? m + 12 : m)).sort((a, b) => a - b);
}

/**
 * `n` of a bar's hits spread over it, in their order: for each of `n` points evenly through the bar (the first on its
 * downbeat), the nearest hit not yet taken. A cap that keeps the bar's shape (beat 1 and beat 3 of a hit on every beat),
 * never its front (beat 1 and beat 2).
 */
export function spreadHits<T extends { step: number }>(all: readonly T[], n: number, steps = 16): T[] {
  if (all.length <= n) return [...all];
  const taken = new Set<number>();
  for (let i = 0; i < n; i++) {
    const at = (i * steps) / n;
    let best = -1;
    for (let j = 0; j < all.length; j++) if (!taken.has(j) && (best < 0 || Math.abs(all[j].step - at) < Math.abs(all[best].step - at))) best = j;
    taken.add(best);
  }
  return all.filter((_, j) => taken.has(j));
}
