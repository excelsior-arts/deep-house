// The fields on a recipe row that no tool may derive, and the one way a
// regeneration carries them.
//
// PLAN-RECIPES has said since 09-18 that `verdicts`, `score` and `picked` are
// somebody's ear and are carried across every re-encoding by the tool that
// made the row. Three tools each wrote their own version of that sentence —
// `cookbook.ts` carried three fields by the medoid, `recipe-from-mark.ts`
// carried one field by the file, and `mine-v2.ts` carried none and overwrote
// the file (M1 of the mining review, 09-19: a plain regeneration erased six verdicts and three
// chef scores). This module is the sentence written once, and every authoring
// tool reads it.
//
// Two rules, and both are the reason a verdict is not lost:
//
//   **A row's identity is its provenance and never its file name or its id.**
//   An id carries a rank and a slug, and both move when k moves; a medoid — a
//   stretch of a reference set, a seed and a bar range of the record, a mark —
//   is the music the verdict was about and cannot move.
//
//   **A verdict is carried onto the same music and onto nothing else.** A row
//   whose identity no regenerated row has is an *orphan*: it is reported by
//   name, kept in a folder beside the rows, and never transplanted onto the
//   nearest thing. A regeneration that would orphan a row with an opinion on it
//   refuses to write unless told the orphans are understood.

/** One recipe row as this module reads it: the human fields, and the rest. */
export interface RowLike {
  id?: string;
  scope?: string;
  applies?: string | null;
  origin?: string;
  name?: string;
  namedBy?: string;
  score?: { chef?: number; likes?: number };
  picked?: boolean;
  verdicts?: unknown[];
  provenance?: Record<string, unknown>;
  [extra: string]: unknown;
}

/**
 * The fields a human wrote, in the order they are carried. `name` is on the
 * list only when the row says who named it (`namedBy`), because every name a
 * tool writes is a description and a description is regenerated.
 */
export const HUMAN_FIELDS: readonly string[] = Object.freeze(['score', 'verdicts', 'picked', 'namedBy', 'name']);

/** Does this row carry an opinion at all — anything a regeneration could lose? */
export function hasOpinion(row: RowLike | null | undefined): boolean {
  if (!row) return false;
  const chef = row.score && typeof row.score.chef === 'number' ? row.score.chef : 0;
  const likes = row.score && typeof row.score.likes === 'number' ? row.score.likes : 0;
  return (Array.isArray(row.verdicts) && row.verdicts.length > 0)
    || chef !== 0 || likes > 0 || row.picked !== undefined || typeof row.namedBy === 'string';
}

/**
 * The identity of a row: the music it was cut from, said as one string.
 *
 * By origin, because each origin's provenance names its music differently:
 *   mined     the reference set, the medoid stretch's start and length
 *   golden    the medoid seed, theme and bar range (the cookbook's own key)
 *   listener  the mark it was encoded from
 * and every one of them is prefixed by the scope and what it applies to, so a
 * breakdown row and a drop row cut from the same stretch are two identities.
 * A row that names none of these has no identity and is never carried onto.
 */
export function identityOf(row: RowLike | null | undefined): string | null {
  if (!row || !row.provenance) return null;
  const p = row.provenance;
  const head = `${row.origin}:${row.scope}${row.applies ? `/${row.applies}` : ''}`;
  if (row.origin === 'mined') {
    if (p.medoidSet === undefined || p.medoidStart === undefined) return null;
    return `${head}@set${p.medoidSet}:${p.medoidStart}+${p.medoidDuration ?? ''}`;
  }
  if (row.origin === 'golden') {
    if (p.medoidSeed === undefined || p.medoidTheme === undefined) return null;
    return `${head}@${p.medoidSeed}#${p.medoidTheme}@${p.medoidFromBar ?? ''}+${p.medoidBars ?? ''}`;
  }
  if (row.origin === 'listener') {
    return p.markId !== undefined ? `${head}@mark:${p.markId}` : null;
  }
  return null;
}

/**
 * A regenerated row with the previous row's human fields on it. The derived
 * fields are the new row's; the human ones are the old row's, field for field,
 * and only when the two are the same music. Returns the row it was given when
 * there is nothing to carry.
 */
export function carryHuman<T extends RowLike>(next: T, previous: RowLike | null | undefined): T {
  if (!previous) return next;
  const a = identityOf(next);
  const b = identityOf(previous);
  if (!a || a !== b) return next;
  const out: RowLike = { ...next };
  for (const f of HUMAN_FIELDS) {
    if (f === 'name' && typeof previous.namedBy !== 'string') continue;
    if (previous[f] !== undefined) out[f] = previous[f];
  }
  return out as T;
}

/** What carrying a set of rows across a regeneration found. */
export interface Carried<T extends RowLike> {
  /** the regenerated rows, human fields carried where the music is the same */
  rows: T[];
  /** identities that were carried, with what they carried */
  carried: { identity: string; verdicts: number; chef: number; picked: boolean | undefined }[];
  /** previous rows with an opinion on them that no regenerated row is the music of */
  orphans: RowLike[];
}

/**
 * Every regenerated row given the human fields of the previous row that is the
 * same music, and the orphans named. Two previous rows with one identity is a
 * fault in the previous set and is thrown, because carrying one of them onto
 * the new row would quietly choose between two opinions.
 */
export function carryAcross<T extends RowLike>(next: T[], previous: RowLike[]): Carried<T> {
  const byIdentity = new Map<string, RowLike>();
  for (const row of previous) {
    const id = identityOf(row);
    if (!id) continue;
    if (byIdentity.has(id)) throw new Error(`two previous rows are the same music (${id}): ${byIdentity.get(id)!.id} and ${row.id}`);
    byIdentity.set(id, row);
  }
  const used = new Set<string>();
  const carried: Carried<T>['carried'] = [];
  const rows = next.map((row) => {
    const id = identityOf(row);
    const old = id ? byIdentity.get(id) : undefined;
    if (!id || !old) return row;
    used.add(id);
    if (hasOpinion(old)) {
      carried.push({
        identity: id,
        verdicts: Array.isArray(old.verdicts) ? old.verdicts.length : 0,
        chef: old.score && typeof old.score.chef === 'number' ? old.score.chef : 0,
        picked: old.picked,
      });
    }
    return carryHuman(row, old);
  });
  const orphans = previous.filter((row) => {
    const id = identityOf(row);
    return hasOpinion(row) && (!id || !used.has(id));
  });
  return { rows, carried, orphans };
}
