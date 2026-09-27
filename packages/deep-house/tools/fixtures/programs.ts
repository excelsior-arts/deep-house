// The program locks the recipe checks hold, as rows and one blessed file.
//
//   node tools/fixtures/programs.ts --check   recompute every row, diff the file
//   node tools/fixtures/programs.ts --bless   rewrite programs.json (a stated reason, in the commit)
//
// Until the composer fix round of 2026-09-22 these were fifteen SHA-256 strings
// typed into five test bodies, and a move of any of them was a hand edit a
// commit message could leave unsaid (the branch review of 09-22, composition #3
// and generation #8). A row here names what is played — a shipped recipe by id
// or a fixture beside this file — the seed, the theme and the options, and
// `programs.json` holds its hash. A check asks `blessed(name)` and recomputes;
// the only way a hash moves is `--bless`, and the only record of why is the
// commit that ran it.
//
// Two kinds, and they are not the same promise:
//
//   `approved`  a comparison Eugene heard and approved, in the mode it was heard
//               in. A move is a change to an approved performance: it needs his
//               ear before it is blessed, never a routine re-bless.
//   `context`   a current program that includes ordinary accompaniment around a
//               pinned part. It moves whenever the ordinary style moves, and a
//               commit that blesses one says which style change moved it.
//
// Fixture recipes are copies of local studies with neutral provenance; their
// ids are the studies' own, because a pinned part's streams are keyed by its id
// and the evidence records name those performances.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme, programOf } from '../../src/mix.ts';
import { recipeById } from '../../src/recipes.ts';
import { HOUSE } from '../../src/spell.ts';
import type { Recipe } from '../../src/recipe.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'programs.json');

/** A study copied beside the checks, so a release that strips `notes/` still checks. */
export const fixture = (name: string): Recipe =>
  JSON.parse(fs.readFileSync(path.join(HERE, `${name}.json`), 'utf8'));

/** Attacks one statement of an ordered phrase lays: each note with its chord shape. */
export const attacksPerCycle = (figure: { voicings?: number[][]; motif: { paths?: { degrees: number[] }[] } }): number =>
  figure.motif.paths![0].degrees.reduce((n, _, i) => n + (figure.voicings?.[i % figure.voicings.length].length ?? 1), 0);

export interface ProgramRow {
  name: string;
  kind: 'approved' | 'context';
  /** a shipped library id, or `fixture:<file>` */
  recipe: string;
  /** as the original lock wrote it: a number and a string are different seeds to a plan's own record */
  seed: number | string;
  accompaniment: 'base' | 'auto';
  development?: 'base' | 'phrased' | 'shaped' | 'percussion';
}

export const ROWS: readonly ProgramRow[] = Object.freeze([
  // The three motif comparisons, heard and approved in base mode.
  { name: 'pump/base/3', kind: 'approved', recipe: 'house/pump', seed: 3, accompaniment: 'base' },
  { name: 'lick/base/3', kind: 'approved', recipe: 'house/lick', seed: 3, accompaniment: 'base' },
  { name: 'answer/base/3', kind: 'approved', recipe: 'house/answer', seed: 3, accompaniment: 'base' },
  // The twelve auto-accompaniment programs: a pinned part with ordinary parts around it.
  { name: 'pump/auto/4', kind: 'context', recipe: 'house/pump', seed: 4, accompaniment: 'auto' },
  { name: 'calm-piano-01/auto/4', kind: 'context', recipe: 'fixture:calm-piano-part-01', seed: 4, accompaniment: 'auto' },
  { name: 'calm-piano-01/auto/6', kind: 'context', recipe: 'fixture:calm-piano-part-01', seed: 6, accompaniment: 'auto' },
  { name: 'calm-piano-02/base/6', kind: 'context', recipe: 'fixture:calm-piano-part-02', seed: 6, accompaniment: 'auto', development: 'base' },
  { name: 'pump/phrased/4', kind: 'context', recipe: 'house/pump', seed: 4, accompaniment: 'auto', development: 'phrased' },
  { name: 'calm-piano-02/phrased/4', kind: 'context', recipe: 'fixture:calm-piano-part-02', seed: 4, accompaniment: 'auto', development: 'phrased' },
  { name: 'calm-piano-02/shaped/6', kind: 'context', recipe: 'fixture:calm-piano-part-02', seed: 6, accompaniment: 'auto', development: 'shaped' },
  { name: 'pump/shaped/4', kind: 'context', recipe: 'house/pump', seed: 4, accompaniment: 'auto', development: 'shaped' },
  { name: 'calm-piano-02/shaped/4', kind: 'context', recipe: 'fixture:calm-piano-part-02', seed: 4, accompaniment: 'auto', development: 'shaped' },
  { name: 'calm-piano-02/percussion/6', kind: 'context', recipe: 'fixture:calm-piano-part-02', seed: '6', accompaniment: 'auto', development: 'percussion' },
  { name: 'pump/percussion/4', kind: 'context', recipe: 'house/pump', seed: '4', accompaniment: 'auto', development: 'percussion' },
  { name: 'ringing-chords-01/percussion/4', kind: 'context', recipe: 'fixture:ringing-chords-01', seed: '4', accompaniment: 'auto', development: 'percussion' },
]);

const recipeOf = (row: ProgramRow): Recipe => {
  if (row.recipe.startsWith('fixture:')) return fixture(row.recipe.slice('fixture:'.length));
  const r = recipeById(row.recipe);
  if (!r) throw new Error(`programs: no shipped recipe ${row.recipe}`);
  return r;
};

/** The plan a row names, under house-v2 at the house. */
export const planOf = (row: ProgramRow) => planTheme(row.seed, 0, {
  strategy: 'house-v2', spell: HOUSE, recipe: recipeOf(row), accompaniment: row.accompaniment,
  ...(row.development ? { development: row.development } : {}),
});

export const hashOf = (row: ProgramRow): string =>
  crypto.createHash('sha256').update(JSON.stringify(programOf(planOf(row)))).digest('hex');

export const rowNamed = (name: string): ProgramRow => {
  const row = ROWS.find((r) => r.name === name);
  if (!row) throw new Error(`programs: no row ${name}`);
  return row;
};

/** The hash the last `--bless` wrote for a row. */
export function blessed(name: string): string {
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) as { rows: Record<string, { sha256: string }> };
  const row = saved.rows[name];
  if (!row) throw new Error(`programs: ${name} has never been blessed`);
  return row.sha256;
}

function main(): void {
  const mode = process.argv[2] || '--check';
  if (!['--check', '--bless'].includes(mode)) { console.error('use --check or --bless'); process.exit(2); }
  const fresh = Object.fromEntries(ROWS.map((r) => [r.name, { kind: r.kind, sha256: hashOf(r) }]));
  if (mode === '--bless') {
    fs.writeFileSync(FILE, JSON.stringify({
      note: 'Program hashes of the rows in programs.ts. Written by --bless only; the commit that blesses says why each moved.',
      rows: fresh,
    }, null, 2) + '\n');
    console.log(`wrote ${Object.keys(fresh).length} rows`);
    return;
  }
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8')).rows as Record<string, { kind: string; sha256: string }>;
  const moved = ROWS.filter((r) => saved[r.name]?.sha256 !== fresh[r.name].sha256);
  for (const r of moved) console.log(`moved: ${r.name} (${r.kind})`);
  console.log(`${ROWS.length - moved.length} of ${ROWS.length} rows unmoved`);
  if (moved.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
