// **A kind of section is a row** — round T2 (`notes/plans/PLAN-TREATMENTS.md`
// §3, step 4; the contract in `src/treatment.ts`). Until T2 the six kinds of
// section — intro, build, main, breakdown, drop, outro — were a table of
// functions in `src/styles/deep-house.ts`: which lanes each kind switches on,
// phrase by phrase, which small things it takes, and the glue its line
// carries. That is a figure, not a mechanism, and it is now
// `recipes/sections/*.json`, one row per kind for the house and a second row
// of a kind where a place prefers one (`dnb/dnb-intro` beside
// `sections/intro`). This file is the mechanism: how a row's block becomes
// the grammar's `layers(i, n)`, which rows a theme plays, and nothing a row
// could not say.
//
// **The layer pattern, by phrase.** A row's `phrases` are read in order and
// the first entry that holds for a phrase gives its layers: `first` holds for
// a section's first phrase, `last` for its last, `rest` for one that is
// neither. A section of one phrase is both its first and its last, and the
// order of the entries says which it is — the record's intro, build and outro
// list `last` first (a short section is its ending: the intro opens full, the
// build is at its brightest, the outro thins), its breakdown lists `first`
// first (a short breakdown is its opening: the pad and the keys, no bass).
// That is exactly what the six functions answered, and the stamp
// (`src/generation.ts`) reads a grammar by its answers, so the row and the
// function are one music.
//
// **What a kind admits** is the placement rules of `src/subsections.ts` by
// name — `fill: last`, `turnaround: groups`, `drop-out: [lines, last]`,
// `switch-up: span` — and the mechanism keeps every rule's own arithmetic
// (where a line is, how long a span may be, the precedence on a bar); the row
// only says which of them this kind takes. **The floor** is the fewest bars a
// kind is laid at where the form is counted in time (`SECTION_TIME`,
// `src/arrangement.ts`); the arithmetic that holds it is the form's.
//
// **The draw.** The form draws sections *by kind*, as it always has
// (`makeArrangement`: an order off the corpus, lengths off the measured
// distributions), and reads the kind's row for the pattern. Where a kind has
// several rows, the place table (`deep-house-places.ts` `SECTIONS`) says the
// shares a place prefers, by row id; a row's own `weight` is its share where
// no place says otherwise, and a row at nought is played only where a place
// names it. The rows of a kind are drawn off a stream of the kind's own
// (`<seed>::section:<kind>`), and a kind with one live row spends no die —
// which is how the house, whose every kind has one row, draws exactly as it
// did when the kinds were code. A row pinned by link plays for its kind
// wherever the theme is, no die: the audit of a pattern.

import { Rng } from './rng.ts';
import { weightOf, type Recipe } from './recipe.ts';
import type { SectionKind, Style } from '@deep-house/engine/style';
import type { SectionBlock } from './treatment.ts';
import { definitionOf } from './generation.ts';

/** What a kind admits, normalised: each figure kind to the placements it takes. */
export type Admits = Readonly<Record<string, readonly string[]>>;

/**
 * A kind of section as the grammar carries it since T2: the engine's kind
 * (its word, its layers, its filter and its flags) and what the row adds —
 * the floor, what it admits, and the row it was read from.
 */
export interface RowKind extends SectionKind {
  /** the fewest bars it is laid at where the form is counted in time */
  floor: number;
  admits: Admits;
  /** the row's id */
  row: string;
  /** the row's resolved definition — id, revision and content (`definitionOf`) */
  definition: string;
  /** the row's own name, where it is not the kind's word (the ledger's) */
  name?: string;
}

/** A row's `admits`, each kind's word or list as a list. */
export function admitsOf(admits: SectionBlock['admits']): Admits {
  const out: Record<string, readonly string[]> = {};
  for (const [kind, where] of Object.entries(admits ?? {})) out[kind] = Object.freeze(Array.isArray(where) ? [...where] : [where]);
  return Object.freeze(out);
}

/** Whether a section's row admits a figure kind at a placement. */
export const admits = (section: { admits?: Admits }, kind: string, where: string): boolean => !!section.admits?.[kind]?.includes(where);

const HOLDS: Record<'first' | 'rest' | 'penult' | 'last', (i: number, n: number) => boolean> = {
  first: (i) => i === 0,
  last: (i, n) => i === n - 1,
  // the phrase before the last, where a section has three or more (round
  // DNB-4): read before `rest` where a row names it, so a section can fall
  // away a phrase ahead of its end
  penult: (i, n) => n >= 3 && i === n - 2,
  rest: (i, n) => i > 0 && i < n - 1,
};

/**
 * A row's layer pattern as the grammar's `layers(i, n)`: the phrases read in
 * order, the first that holds gives the lanes on, every other gate off, in
 * the lane table's order (`gates`). A fresh object per call, as the table of
 * functions gave one.
 */
export function patternOf(block: SectionBlock, gates: readonly string[]): (i: number, n: number) => Record<string, boolean> {
  const phrases = block.phrases.map((p) => ({ holds: HOLDS[p.at], on: new Set(p.on) }));
  return (i: number, n: number) => {
    const p = phrases.find((x) => x.holds(i, n));
    if (!p) throw new Error(`a section row's phrases say nothing of phrase ${i + 1} of ${n}`);
    return Object.fromEntries(gates.map((g) => [g, p.on.has(g)]));
  };
}

/**
 * A kind of section from a row: the word and the filter are the base kind's
 * (the filter is in hertz, which a row may not name), everything else the
 * row's.
 */
export function kindFromRow(row: Recipe, base: { label: string; filter: number[] }, gates: readonly string[]): RowKind {
  const s = row.section;
  if (!s) throw new Error(`${row.id} is a section row with no section block`);
  const f = s.flags ?? {};
  return {
    label: base.label,
    layers: patternOf(s, gates),
    filter: base.filter,
    ...(f.sweepFirst ? { sweepFirst: true } : {}),
    ...(f.impactFirst ? { impactFirst: true } : {}),
    ...(f.riserLast ? { riserLast: f.riserLast } : {}),
    ...(f.lift ? { lift: true } : {}),
    floor: s.floor,
    admits: admitsOf(s.admits),
    row: row.id,
    definition: definitionOf(row)!,
    ...(row.name !== base.label ? { name: row.name } : {}),
  };
}

/** A section row of a kind: scope, kind and a block to play. */
export const sectionRowsOf = (rows: readonly Recipe[], kind: string): Recipe[] =>
  rows.filter((r) => r.scope === 'section' && r.applies === kind && !!r.section);

/**
 * **The style's grammar from its rows**: one kind per base entry (its word
 * and its filter), the pattern, floor, admits and flags from the row of that
 * kind — exactly one, at the style's own place.
 */
export function grammarFromRows(rows: readonly Recipe[], base: Readonly<Record<string, { label: string; filter: number[] }>>,
  gates: readonly string[], labelToKind: Record<string, string>): { kinds: Record<string, RowKind>; labelToKind: Record<string, string> } {
  const kinds: Record<string, RowKind> = {};
  for (const [kind, b] of Object.entries(base)) {
    const own = sectionRowsOf(rows, kind).filter((r) => weightOf(r) > 0);
    if (own.length !== 1) throw new Error(`the grammar's ${kind} needs one row of its own at a weight and has ${own.length}`);
    kinds[kind] = kindFromRow(own[0], b, gates);
  }
  return { kinds, labelToKind };
}

/**
 * How a pinned section row was read against the grammar's own row of its
 * kind: the two resolved definitions (`definitionOf`) and whether the pin was
 * laid over the grammar. Equal definitions are the grammar's own and play as
 * the grammar has them; anything else — a new revision of the same id
 * included — is laid over it.
 */
export interface SectionPin { kind: string; id: string; asked: string; grammar: string | null; applied: boolean }

/**
 * **The section rows a theme plays**, by kind: a pinned row for its kind;
 * else, where a kind has several rows in the running at this place — the
 * place's shares by id, a row's own weight where the place says nothing —
 * one drawn off the kind's own stream; a kind with one row in the running
 * spends no die. Only the kinds whose row is not the grammar's own are
 * answered: the rest play as the grammar has them.
 *
 * **The grammar's own is a definition, not a name** (R02 of the review
 * of 10-03): a pinned row was dropped whenever its id was the grammar's, so a
 * new revision of `sections/main` handed to the planner played the old one. A
 * pin is compared by its resolved definition (`definitionOf`: id, revision and
 * content), and the comparison is written to `trace` where one is passed.
 */
export function drawSectionRows(seed: string | number, rows: readonly Recipe[], grammar: { kinds: Record<string, SectionKind> },
  prefers: Readonly<Record<string, number>> | null, pinned: Recipe | null, trace?: SectionPin[]): Map<string, Recipe> {
  const out = new Map<string, Recipe>();
  for (const kind of Object.keys(grammar.kinds)) {
    const own = grammar.kinds[kind] as Partial<RowKind>;
    if (pinned && pinned.applies === kind && pinned.section) {
      const asked = definitionOf(pinned)!, theirs = own.definition ?? null;
      const applied = asked !== theirs;
      if (applied) out.set(kind, pinned);
      trace?.push({ kind, id: pinned.id, asked, grammar: theirs, applied });
      continue;
    }
    const share = (r: Recipe) => prefers?.[r.id] ?? weightOf(r);
    const live = sectionRowsOf(rows, kind).filter((r) => share(r) > 0);
    if (!live.length) continue;
    const row = live.length === 1 ? live[0] : new Rng(`${seed}::section:${kind}`).pickWeighted(live, share)!;
    if (row.id !== own.row || definitionOf(row) !== own.definition) out.set(kind, row);
  }
  return out;
}

/** The style's grammar with a theme's rows laid over it, kind by kind. */
export function grammarWith(grammar: Style['sections'], rows: ReadonlyMap<string, Recipe>, gates: readonly string[]): Style['sections'] {
  const kinds = { ...grammar.kinds };
  for (const [kind, row] of rows) kinds[kind] = kindFromRow(row, grammar.kinds[kind], gates);
  return { ...grammar, kinds };
}
