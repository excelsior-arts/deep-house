// Every fixture table in this engine, in one list, and the one question none
// of them can answer alone.
//
// Round K4 of PLAN-KITCHEN, and it exists because round K3 found the hole and
// wrote down where the fix belongs (`notes/archive/2026-09-kitchen/rounds/k3.md` §6): *the day there are
// two fixture tables, "every registered voice has a fixture" is a question
// neither of them can answer alone. The place it belongs is one exported list
// of the tables, which is K4's to make if a third one appears.* K4 adds a third
// (`audition-voices-2.ts`, with its own voices), so here it is — made first, so
// that the fix K3 asked for lands before the voices that would need it.
//
// The shape is the registries' own and for the same reason: **one ordered list,
// and every answer below derived from it.** A fourth table is one line here and
// nothing anywhere else; a table left out of it is a table whose voices read as
// missing, which is the failure being loud rather than quiet.
//
// Nothing in this file renders anything. It is names.

import { SCENES } from './audition-voices.ts';
import { DRUM_SCENES } from './audition-drums.ts';
import { SCENES_2 } from './audition-voices-2.ts';
import { REGISTRY, BY_NAME } from '../src/voices/index.ts';

/** One fixture table: where it lives, whose round wrote it, and what it plays. */
export interface SceneTable {
  file: string;
  round: string;
  /** the rows, as `{ id, voice }` — the two fields every table's rows share */
  rows: Array<{ id: string; voice: string }>;
}

/**
 * The tables, in the order they were written. `audition.ts` is deliberately not
 * one of them: its two fixtures are *pieces of music* with a fixed cast and not
 * a row per instrument, so it covers what it plays by accident and claiming
 * otherwise would let a voice through on a coincidence.
 */
export const TABLES: SceneTable[] = [
  { file: 'tools/audition-voices.ts', round: 'K2', rows: SCENES },
  { file: 'tools/audition-drums.ts', round: 'K3', rows: DRUM_SCENES },
  { file: 'tools/audition-voices-2.ts', round: 'K4', rows: SCENES_2 },
];

/** Every registered voice any table plays, in the tables' own order. */
export const COVERED: string[] = (() => {
  const out: string[] = [];
  for (const t of TABLES) for (const r of t.rows) if (!out.includes(r.voice)) out.push(r.voice);
  return out;
})();

/** Every playable instrument, over every table: the count that is not the registry's. */
export const PLAYABLE: string[] = TABLES.flatMap((t) => t.rows.map((r) => `${t.round}:${r.id}`));

/**
 * The voices no table plays, and the rows that name no voice. Empty is the
 * whole of what the three gates each assert, each from its own file, each
 * handing this the same answer.
 */
export function uncovered(): string[] {
  const has = new Set(COVERED);
  const out: string[] = [];
  for (const d of REGISTRY) if (!has.has(d.name)) out.push(d.name);
  for (const t of TABLES) for (const r of t.rows) if (!BY_NAME[r.voice]) out.push(`${t.file}: ${r.id} names no registered voice`);
  return out;
}

/** A sentence for a gate's own log: how many instruments over how many voices. */
export const coverage = () =>
  `${PLAYABLE.length} playable instruments over ${COVERED.length} voices in ${TABLES.length} tables (${TABLES.map((t) => `${t.round} ${t.rows.length}`).join(', ')})`;

export default TABLES;
