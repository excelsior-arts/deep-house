// The fourth lock: **the sound rows the link digest plays**, as the engine reads them.
//
//   node tools/sound-rows.ts --check                  every row the digest's links play, hashed against the file
//   node tools/sound-rows.ts --bless --reason "<why>" rewrite it, the reason kept in the file
//
// The link digest (`tools/link-digest.ts`) hashes what a link plays: every event with its parameters, the settings
// the voices render with (a row's room-voiced block and every space row, by value), the stage and the automation.
// It does not hash a sound row's own numbers. A row with no `block` renders from itself, frozen, and the program
// names it only by its id, so a changed number moves no hash: on 10-29 the wobble bass's corner went from 460 to
// 1800 Hz, three featured tracks (Drive - Thunderhead, Drive - Fog Bank, Vibe - Undertow) played brighter, and
// `bless.ts` read "nothing moved". The program lock's `sounds` line (`tools/program.ts`) has held these rows since
// round R1, for the golden masters only.
//
// So this file holds, for **every sound row any row of the link digest plays** (the grid, the featured tracks, the
// sets' themes, the playlist links' tracks):
//   - a hash of the row as the registry admitted it (`ROWS` in the engine's `voices/index.ts`): its id, topology,
//     revision, block, voicings and parameters (the program lock's `soundLine`), its descriptor (the levels, the
//     controls' defaults, the timbre facts the trim reads), its measured numbers and its dice; everything but its
//     `provenance`, which is prose;
//   - the featured tracks that play it, by their playlist and title ("Drive - Thunderhead"), and how many of the
//     digest's rows do.
//
// Which rows a theme plays is the program lock's own reading (`rowsThrough`): each event's row, and where the voice
// dispatches by timbre (`pad`, `keys`) the row its timbre renders through.
//
// It is checked by `tools/check-link.ts` (so by `npm run check` and the release) and by `tools/bless.ts`, and written
// by `bless.ts --reason` beside the link digest. A row moves only by a stated re-bless.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROWS, rowsThrough, soundLine } from '@deep-house/engine/voices';
import { MIX_DEFAULTS, STRATEGIES, programOf, setLayout } from '../src/mix.ts';
import { readPlaylistLink } from '../src/playlist-link.ts';
import { FEATURED } from '../src/featured.ts';
import { exact } from './program.ts';
import { playedOnce as played, rowsAll, type GridRow } from './link-digest.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(HERE, 'sound-rows.json');

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const quiet = <T>(fn: () => T): T => { const say = console.log; console.log = () => {}; try { return fn(); } finally { console.log = say; } };

type Row = (typeof ROWS)[string];
/** A row as the engine reads it: everything the registry admitted but its prose. */
export const rowValue = (row: Row) => {
  const r = row as Row & { descriptor?: unknown; measured?: unknown; dice?: unknown };
  return { ...soundLine(row), descriptor: r.descriptor ?? null, measured: r.measured ?? null, dice: r.dice ?? null };
};
export const rowHash = (row: Row): string => sha(exact(rowValue(row)));

/** The rows a list of programs' events render through. */
const rowsOfPrograms = (programs: { events: readonly { voice: string; p?: unknown }[] }[]): Set<string> => {
  const ids = new Set<string>();
  for (const program of programs) for (const e of program.events) for (const r of rowsThrough(e.voice, e.p as never)) ids.add(r.id);
  return ids;
};

/** What one row of the digest plays: its theme, a set's themes as the set lays them out, a playlist's tracks. */
function rowsOfDigestRow(row: GridRow): Set<string> {
  if (row.group === 'lists') {
    const r = readPlaylistLink(row.link);
    if (!r.list) throw new Error(`sound rows: ${row.link} does not read as a playlist link`);
    return rowsOfPrograms(r.list.tracks.map((t) => programOf(played(t.link).plan)));
  }
  const { seed, request, plan } = played(row.link);
  if (!row.themes) return rowsOfPrograms([programOf(plan)]);
  // a set as `seamProgram` lays it out (the link digest's set rows): the strategy's style, the link's request
  const o = { ...MIX_DEFAULTS, style: STRATEGIES[request.strategy as keyof typeof STRATEGIES].style, strategy: request.strategy,
    spell: request.spell, recipe: request.recipe, accompaniment: request.accompaniment, development: request.development };
  const L = quiet(() => setLayout(seed, row.themes, o as never));
  return rowsOfPrograms(L.plans.map((p) => programOf(p)));
}

/** The featured tracks a link is, by "Playlist - Title" (a link two playlists share is both). */
function featuredNames(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of FEATURED) f.links.forEach((link, i) => {
    const name = `${f.name} - ${f.labels?.[i] ?? `track ${i + 1}`}`;
    out.set(link, [...(out.get(link) ?? []), name]);
  });
  return out;
}

export interface Line { revision: number; hash: string; featured: string[]; plays: number }
export interface Saved { note: string; blessings: string[]; rows: Record<string, Line> }
export const saved = (): Saved => JSON.parse(fs.readFileSync(FILE, 'utf8'));

/** **Every row the digest plays, now**: its hash, the featured tracks that play it, how many digest rows do. */
export function fresh(digest: GridRow[] = rowsAll()): Record<string, Line> {
  const names = featuredNames();
  const featured = new Map<string, Set<string>>();
  const plays = new Map<string, number>();
  for (const row of digest) {
    const ids = quiet(() => rowsOfDigestRow(row));
    const who = row.themes || row.group === 'lists' ? [] : names.get(row.link) ?? [];
    for (const id of ids) {
      plays.set(id, (plays.get(id) ?? 0) + 1);
      const f = featured.get(id) ?? new Set<string>();
      for (const n of who) f.add(n);
      featured.set(id, f);
    }
  }
  // featured names in the table's order: playlist first, as the playlists show them
  const order = [...names.values()].flat();
  const out: Record<string, Line> = {};
  for (const id of [...plays.keys()].sort()) {
    const row = ROWS[id];
    if (!row) throw new Error(`sound rows: a program plays ${id}, which no row of the registry is`);
    out[id] = { revision: row.revision, hash: rowHash(row), featured: order.filter((n) => featured.get(id)!.has(n)), plays: plays.get(id)! };
  }
  return out;
}

/** Whom a row reaches, in words: the featured tracks by name, then the count of the digest's other rows. */
const whom = (l: Line): string =>
  `${l.featured.length ? l.featured.join(', ') : 'no featured track'}; ${l.plays} digest row${l.plays === 1 ? '' : 's'} in all`;

/**
 * **The cheap half** (milliseconds): every row the file holds, re-hashed off the registry. A row whose numbers moved
 * is named with the tracks that play it. What a row moving looks like is all this can see; which rows the links play
 * is the full check's (`verify`).
 */
export function moved(file: Saved = saved()): string[] {
  const out: string[] = [];
  for (const [id, was] of Object.entries(file.rows)) {
    const row = ROWS[id];
    if (!row) { out.push(`${id}: in the lock and no longer a row of the registry (played by ${whom(was)})`); continue; }
    const hash = rowHash(row);
    if (hash !== was.hash) out.push(`${id}: moved (${row.revision === was.revision ? `revision ${row.revision}, not bumped` : `revision ${was.revision} -> ${row.revision}`}), played by ${whom(was)}`);
  }
  return out;
}

/** **The full check**: the rows the digest plays recomputed, against the file. Every difference, in words. */
export function verify(file: Saved = saved(), now: Record<string, Line> = fresh()): { moved: string[]; rows: number; featured: number } {
  const out = moved(file);
  const gone = new Set(out.map((m) => m.split(':')[0]));
  for (const [id, line] of Object.entries(now)) {
    const was = file.rows[id];
    if (!was) { out.push(`${id}: played and not in the lock (by ${whom(line)})`); continue; }
    if (gone.has(id)) continue;
    if (JSON.stringify(was.featured) !== JSON.stringify(line.featured) || was.plays !== line.plays)
      out.push(`${id}: played by ${whom(line)}, where the lock says ${whom(was)}`);
  }
  for (const id of Object.keys(file.rows)) if (!now[id] && !gone.has(id)) out.push(`${id}: in the lock and no longer played by any digest row`);
  return { moved: out, rows: Object.keys(now).length, featured: Object.values(now).filter((l) => l.featured.length).length };
}

const NOTE = 'The sound rows the link digest plays, as the engine reads them: for each row any digest row plays (the grid, the featured '
  + 'tracks, the sets\' themes, the playlists\' tracks), a SHA-256 of the row the registry admitted (id, topology, revision, block, voicings, '
  + 'parameters, descriptor, measured numbers, dice; not its provenance), the featured tracks that play it and how many digest rows do. '
  + 'The link digest hashes a program, which names a row only by its id. Written by tools/bless.ts --reason (tools/sound-rows.ts --bless); '
  + 'checked by tools/check-link.ts, tools/bless.ts and at release. A row moves only by a stated re-bless.';

function text(d: Saved): string {
  return '{\n'
    + `  "note": ${JSON.stringify(d.note)},\n`
    + `  "blessings": [\n${d.blessings.map((b) => `    ${JSON.stringify(b)}`).join(',\n')}\n  ],\n`
    + `  "rows": {\n${Object.entries(d.rows).map(([id, l]) => `    ${JSON.stringify(id)}: ${JSON.stringify(l)}`).join(',\n')}\n  }\n}\n`;
}

/** Write the file: the rows the digest plays now, the reason kept. */
export function bless(reason: string): { rows: number; moved: string[] } {
  const was: Saved | null = fs.existsSync(FILE) ? saved() : null;
  const now = fresh();
  const changed = was ? verify(was, now).moved : [];
  fs.writeFileSync(FILE, text({ note: NOTE, blessings: [...(was?.blessings ?? []), reason], rows: now }));
  return { rows: Object.keys(now).length, moved: changed };
}

function main(): void {
  const argv = process.argv.slice(2);
  const mode = argv[0] || '';
  if (!['--check', '--bless'].includes(mode)) {
    console.error('usage: node tools/sound-rows.ts --check | --bless --reason "<why the rows move>"');
    process.exit(2);
  }
  if (mode === '--check') {
    if (!fs.existsSync(FILE)) { console.error(`no ${path.relative(process.cwd(), FILE)}, and it is a committed file`); process.exit(2); }
    const v = verify();
    if (v.moved.length) {
      console.error(`a sound row the digest plays has moved: ${v.moved.length}\n${v.moved.slice(0, 12).map((m) => `  ${m}`).join('\n')}`);
      console.error('\nIf that is a deliberate move that Eugene has heard: node tools/bless.ts --reason "<why>"');
      process.exit(1);
    }
    console.log(`the sound rows the digest plays have not moved: ${v.rows} rows, ${v.featured} of them in featured tracks, against ${path.relative(process.cwd(), FILE)}`);
    return;
  }
  const at = argv.indexOf('--reason');
  const reason = at < 0 ? '' : (argv[at + 1] || '').trim();
  if (!reason) { console.error('a bless states its reason: --reason "<why the rows move>"'); process.exit(2); }
  const b = bless(reason);
  console.log(`wrote ${path.relative(process.cwd(), FILE)}: ${b.rows} sound rows${b.moved.length ? `, ${b.moved.length} moved` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
