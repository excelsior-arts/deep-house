// The third lock: **what a written link plays**, for a grid of links.
//
//   node tools/link-digest.ts --check                 recompute every row, diff the file
//   node tools/link-digest.ts --bless --reason "<why>" rewrite it, the reason kept in the file
//
// The two locks beside this one plan `{ preset: 'auto', strategy }` — the house
// spell, the base modes, no recipe — so they hold the promise at the house and
// nowhere else (the reconciled review of 09-24, R5, with R70 and R69 as its
// parts). A pulled bird, a development or accompaniment mode, a hand
// recipe and `recipe=auto` all reach a listener through a link, and until this
// file no hash answered for any of them: at the house every knob is at its
// default, so the whole bird-to-knob map had no lock at all.
//
// So this holds a grid of **written links** — each one the page's own writer's
// output (`linkWrite`), both engines — to the program the page plays off it:
// the link read the way the page reads it (`linkRead`, the whole request
// planned once, refusals and all), the cast made the way the page makes it
// (`recipesFor` over that address: a named row or a drawn one, and the spell
// rolled inside it where the link names none), the theme planned under it and
// then compiled. What is hashed is the **whole** program (`programOf`) — every
// event with its parameters, the settings the voices render with, the duck
// shape, the stage's rows, the automation lines themselves and not what a
// recorder of seven paths makes of them — plus the plan's knobs and overrides,
// with every number exact (a minus nought is not a nought). A few rows are a
// set of two to five themes instead, hashed as the seam program the set's
// hand-overs write.
//
// A link the page refuses in part is a row like any other: the promise is what
// it plays, and a refusal is part of that. The row names what was taken off.
//
// **The benchmark is a row group of its own** (`benchmark`): seed 27191 at
// Eugene's spell, the five themes of the nineteen minutes that must never
// change, and their set. `tools/check-scene.ts` holds its own reading of them
// to these committed hashes, where it used to compare the code with itself.
//
// It is checked by `tools/check-link.ts` (so by `npm run check`) and by the
// release. **house-v2's rows move only by a deliberate `--bless` with the
// reason stated**, which the file keeps; at the v2 release the grid freezes
// with the engine. house-v1's rows never move: they are the record's links.
//
// **The freeze is read off the last cut** (Eugene's question 6 of the
// reconciled review of 09-24: bless it now as what every v2 link plays today,
// freeze it at the v2 release). `--check` also reads the digest the last
// release shipped (`master`'s copy, `lastCut()`), and `sinceCut()` refuses two
// things: a row that cut shipped whose hash has moved or which has gone — a
// link a listener was given plays what it played, and no reason re-opens it —
// and rows that differ from the cut's with no blessing added since, which is
// a digest moved without a `--reason`. A bless refuses to move a shipped row
// the same way it refuses house-v1's. Until a cut carries the file (v1.0.0
// does not) there is nothing to freeze against, and the first cut to carry it
// is the v2 release: what it ships is frozen from then on. The release runs
// `--check`, so it stops on either.
//
// A fixture recipe (`tools/fixtures/`) is not here: no link can name one, and
// `fixtures/programs.json` already hashes them.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme, programOf, recipesFor } from '../src/mix.ts';
import { linkRead, linkWrite, type LinkState } from '../src/link.ts';
import { BIRDS, HOUSE, type Spell } from '../src/spell.ts';
import { LIBRARY } from '../src/recipes.ts';
import { exact, seamProgram } from './program.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(HERE, 'link-digest.json');

/** Eugene's ambient benchmark (09-22): "godlike, mega ambience", ~50 BPM, no drums. */
export const BENCHMARK_SEED = '27191';
export const BENCHMARK_SPELL: Readonly<Spell> = Object.freeze({ ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 });
export const BENCHMARK_THEMES = 5;

/** One row of the grid: a written link, and whether it is a theme or a set of `themes`. */
export interface GridRow { group: string; link: string; themes?: number }

const V = { '1': 'house-v1', '2': 'house-v2' } as const;
const GOLDEN_THEMES: Record<string, number> = { 1: 6, 92970: 4, 21323: 4 };
/** Three pulls of more than one bird each: a warm slow one, a bright one, a dark wide one. */
const MIXED: Partial<Spell>[] = [
  { ember: 0.2, tide: 0.8, veil: 0.7 },
  { ember: 0.85, spark: 0.9, gleam: 0.75, root: 0.3 },
  { zephyr: 0.9, loom: 0.15, veil: 0.1, tide: 0.25 },
];
const MODES = ['base', 'phrased', 'shaped', 'percussion'] as const;

const written = (s: LinkState) => linkWrite(s);

/** **The grid.** Built from the page's own writer, so every key is a link the page writes. */
export function grid(): GridRow[] {
  const rows: GridRow[] = [];
  const add = (group: string, s: LinkState, themes?: number) => rows.push({ group, link: written(s), ...(themes ? { themes } : {}) });
  // Both engines on the three golden masters, every golden theme, and a set of three.
  for (const [ver, strategy] of Object.entries(V)) {
    for (const master of Object.keys(GOLDEN_THEMES))
      for (let n = 0; n < GOLDEN_THEMES[master]; n++) add('masters', { seed: master, theme: n, strategy });
    add('sets', { seed: '1', theme: 0, strategy }, 3);
    void ver;
  }
  // The benchmark: 27191 at his spell, five themes and their set.
  for (let n = 0; n < BENCHMARK_THEMES; n++) add('benchmark', { seed: BENCHMARK_SEED, theme: n, strategy: 'house-v2', spell: BENCHMARK_SPELL });
  add('benchmark', { seed: BENCHMARK_SEED, theme: 0, strategy: 'house-v2', spell: BENCHMARK_SPELL }, BENCHMARK_THEMES);
  // Every bird alone at a tenth and nine tenths, and three mixed pulls, under both engines.
  for (const strategy of Object.values(V)) {
    for (const bird of BIRDS) for (const v of [0.1, 0.9]) add('pulls', { seed: '1', theme: 0, strategy, spell: { [bird]: v } });
    for (const spell of MIXED) add('pulls', { seed: '1', theme: 0, strategy, spell });
    add('sets', { seed: '1', theme: 0, strategy, spell: MIXED[0] }, 3);
  }
  // Each development mode under each accompaniment, no recipe, under both engines.
  for (const strategy of Object.values(V))
    for (const development of MODES) for (const accompaniment of ['base', 'auto'] as const)
      add('modes', { seed: '4', theme: 0, strategy, development, accompaniment });
  add('sets', { seed: '4', theme: 0, strategy: 'house-v2', development: 'shaped' }, 3);
  // The draw, and every shipped row in the mode it plays in: a track row alone,
  // a motif row over base and over auto, a hand row over auto (and two modes).
  for (const strategy of Object.values(V)) {
    add('recipes', { seed: '3', theme: 0, strategy, recipe: 'auto' });
    for (const r of LIBRARY) {
      const modes = r.scope === 'layer' ? ['auto'] as const : r.scope === 'motif' ? ['base', 'auto'] as const : ['base'] as const;
      for (const accompaniment of modes) add('recipes', { seed: '3', theme: 0, strategy, recipe: r.id, accompaniment });
    }
  }
  const hand = LIBRARY.find((r) => r.scope === 'layer')!.id;
  for (const development of ['phrased', 'shaped'] as const) add('recipes', { seed: '3', theme: 0, strategy: 'house-v2', recipe: hand, accompaniment: 'auto', development });
  add('sets', { seed: '3', theme: 0, strategy: 'house-v2', recipe: 'auto' }, 3);
  add('sets', { seed: '3', theme: 0, strategy: 'house-v2', recipe: hand, accompaniment: 'auto' }, 3);
  return rows;
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const quiet = <T>(fn: () => T): T => { const say = console.log; console.log = () => {}; try { return fn(); } finally { console.log = say; } };

/**
 * **What the page plays off a link**: read as the page reads an address, cast
 * as the page casts, planned as the page plans. The request the plan was made
 * under comes back too, so a set can be laid out under the same one.
 */
export function played(link: string, themeOverride?: number) {
  const read = quiet(() => linkRead(`?${link.replace(/^\?/, '')}`));
  const L = read.link;
  const seed = L.seed ?? '1';
  const cast = quiet(() => recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` }));
  const request = { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development };
  const plan = quiet(() => planTheme(seed, themeOverride ?? L.theme, request));
  return { read, seed, request, plan };
}

/** One row's line: what it plays, and the hash of it. */
export function lineOf(row: GridRow) {
  const { read, seed, request, plan } = played(row.link);
  const refused = read.problems.map((p) => p.param);
  const head = { group: row.group, link: row.link, ...(refused.length ? { refused } : {}) };
  if (row.themes) {
    const set = quiet(() => seamProgram(seed, row.themes, request.strategy, {
      spell: request.spell, recipe: request.recipe, accompaniment: request.accompaniment, development: request.development,
    }));
    return { ...head, strategy: request.strategy, themes: row.themes, seams: set.counts.seams, points: set.counts.points, hash: sha(exact(set)) };
  }
  return { ...head, strategy: request.strategy, bpm: plan.bpm, bars: plan.bars, events: programOf(plan).events.length, hash: themeHash(plan) };
}

/** A theme's hash: its whole program, its knobs and its overrides, every number exact. */
export function themeHash(plan: ReturnType<typeof planTheme>): string {
  return sha(exact({ program: programOf(plan), knobs: plan.knobs ?? null, paramOverrides: plan.paramOverrides ?? null }));
}

/** The committed line of a row, by its written link (and its theme count, for a set). */
export function blessedLine(link: string, themes = 0): Line {
  const row = saved().rows.find((r) => r.link === link && ('themes' in r ? r.themes : 0) === themes);
  if (!row) throw new Error(`link digest: ${link}${themes ? ` (${themes} themes)` : ''} has never been blessed`);
  return row;
}

export type Line = ReturnType<typeof lineOf>;
export interface Saved { note: string; blessings: string[]; rows: Line[] }

export const saved = (): Saved => JSON.parse(fs.readFileSync(FILE, 'utf8'));

/** Every row recomputed against the file: the rows that moved, in words, and what was held. */
export function verify(file: Saved = saved()): { moved: string[]; rows: number } {
  const fresh = grid().map(lineOf);
  const moved: string[] = [];
  const at = new Map(file.rows.map((r) => [`${r.link}|${'themes' in r ? r.themes : 0}`, r]));
  for (const f of fresh) {
    const key = `${f.link}|${'themes' in f ? f.themes : 0}`;
    const was = at.get(key);
    at.delete(key);
    if (!was) { moved.push(`${f.group} ${f.link}${'themes' in f ? ` (${f.themes} themes)` : ''}: not in the digest`); continue; }
    for (const k of Object.keys({ ...f, ...was }) as (keyof typeof f)[]) {
      if (JSON.stringify(f[k]) !== JSON.stringify((was as typeof f)[k])) {
        moved.push(`${f.group} ${f.link}${'themes' in f ? ` (${f.themes} themes)` : ''}: ${k} ${JSON.stringify((was as typeof f)[k])} -> ${JSON.stringify(f[k])}`);
        break;
      }
    }
  }
  for (const r of at.values()) moved.push(`${r.group} ${r.link}: in the digest and no longer in the grid`);
  return { moved, rows: fresh.length };
}

const keyOf = (r: Line) => `${r.link}|${'themes' in r ? r.themes : 0}`;

/**
 * **The digest the last release shipped**: `master`'s copy of this file, or
 * null where there is no git, no cut, or a cut that carries no digest (v1.0.0).
 */
export function lastCut(ref = 'refs/heads/master'): Saved | null {
  try {
    const out = execFileSync('git', ['show', `${ref}:./${path.basename(FILE)}`], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out) as Saved;
  } catch {
    return null;
  }
}

/**
 * **What the freeze refuses**, in words: every row the cut shipped still plays
 * the program it shipped with, and a digest that differs from the cut's has a
 * blessing (a stated `--reason`) the cut did not have. Nothing, with no cut.
 */
export function sinceCut(cut: Saved | null, now: Saved): string[] {
  if (!cut) return [];
  const faults: string[] = [];
  const at = new Map(now.rows.map((r) => [keyOf(r), r]));
  for (const r of cut.rows) {
    const is = at.get(keyOf(r));
    const name = `${r.link}${'themes' in r ? ` (${r.themes} themes)` : ''}`;
    if (!is) faults.push(`frozen: ${name} was shipped and is no longer in the digest`);
    else if (is.hash !== r.hash) faults.push(`frozen: ${name} was shipped as ${r.hash.slice(0, 12)} and plays ${is.hash.slice(0, 12)}`);
  }
  const differs = JSON.stringify(cut.rows) !== JSON.stringify(now.rows);
  const reasoned = now.blessings.length > cut.blessings.length && cut.blessings.every((b, i) => now.blessings[i] === b);
  if (differs && !reasoned) faults.push('the digest differs from the last cut\'s and no blessing was added since: a bless states its reason (--bless --reason)');
  return faults;
}

function text(d: Saved): string {
  return '{\n'
    + `  "note": ${JSON.stringify(d.note)},\n`
    + `  "blessings": [\n${d.blessings.map((b) => `    ${JSON.stringify(b)}`).join(',\n')}\n  ],\n`
    + `  "rows": [\n${d.rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

const NOTE = 'What a written link plays, for a grid of links: both engines on the golden masters, the 27191 benchmark at its spell, '
  + 'every bird at 0.1 and 0.9 and three mixed pulls, every development mode under each accompaniment, recipe=auto and every shipped row in its mode, '
  + 'and eight sets. Each key is the page\'s own writer\'s output; each hash is of the whole program the page plays off it (read, cast, planned and compiled '
  + 'as the page does) with the plan\'s knobs, every number exact, or of a set\'s seam program. Written by tools/link-digest.ts --bless --reason; '
  + 'checked by tools/check-link.ts and at release. house-v1\'s rows never move; house-v2\'s move only by a stated re-bless, and freeze at its release.';

function main(): void {
  const argv = process.argv.slice(2);
  const mode = argv[0] || '';
  if (!['--check', '--bless'].includes(mode)) {
    console.error('usage: node tools/link-digest.ts --check | --bless --reason "<why the rows move>"');
    process.exit(2);
  }
  if (mode === '--check') {
    if (!fs.existsSync(FILE)) { console.error(`no ${path.relative(process.cwd(), FILE)}, and it is a committed file`); process.exit(2); }
    const { moved, rows } = verify();
    if (moved.length) {
      console.error(`what a link plays has moved: ${moved.length} of ${rows} rows\n${moved.slice(0, 12).map((m) => `  ${m}`).join('\n')}`);
      console.error('\nIf that is a deliberate re-bless of house-v2 that Eugene has heard: node tools/link-digest.ts --bless --reason "<why>"');
      process.exit(1);
    }
    const cut = lastCut();
    const faults = sinceCut(cut, saved());
    if (faults.length) {
      console.error(`the link digest has moved since the last cut: ${faults.length}\n${faults.slice(0, 12).map((m) => `  ${m}`).join('\n')}`);
      console.error('\nA row a release shipped is frozen: a link a listener was given keeps its sound. A new sound is a new engine token.');
      process.exit(1);
    }
    console.log(`what a link plays has not moved: ${rows} written links, against ${path.relative(process.cwd(), FILE)}; `
      + (cut ? `${cut.rows.length} frozen at the last cut` : 'no cut carries the digest yet, so the next one freezes it'));
    return;
  }
  const at = argv.indexOf('--reason');
  const reason = at < 0 ? '' : (argv[at + 1] || '').trim();
  if (!reason) { console.error('a bless states its reason: --reason "<why the rows move>"'); process.exit(2); }
  const was: Saved | null = fs.existsSync(FILE) ? saved() : null;
  const rows = grid().map(lineOf);
  // house-v1's rows are the record's links, and a row the last cut shipped is
  // a link a listener was given: a bless that would move one stops.
  const fixed = new Map([
    ...(was?.rows.filter((r) => r.strategy === 'house-v1') ?? []),
    ...(lastCut()?.rows ?? []),
  ].map((r) => [keyOf(r), r.hash]));
  const movedFixed = rows.filter((r) => fixed.has(keyOf(r)) && fixed.get(keyOf(r)) !== r.hash);
  if (movedFixed.length) { console.error(`a bless cannot move the record's links or a shipped one: ${movedFixed.map((r) => r.link).join(', ')}`); process.exit(1); }
  fs.writeFileSync(FILE, text({ note: NOTE, blessings: [...(was?.blessings ?? []), reason], rows }));
  console.log(`wrote ${path.relative(process.cwd(), FILE)}: ${rows.length} written links`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
