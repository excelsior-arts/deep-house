// **Feature a playlist** (featured, his word 10-23): his playlist, made in the app and shared, written into the table
// the release ships (`src/featured.json`), so curation is: make it in the app, share it, run this.
//
//   node tools/feature.ts "<the playlist's share link>"          add it, or replace the entry of its id where it stands
//   node tools/feature.ts "Ambient journey.deephouse"            the same from a downloaded playlist file
//   node tools/feature.ts "<link>" --replace <id>                put it in the place of another entry, keeping that id
//   node tools/feature.ts "<link>" --name "Drive" --at 1         its name in the tab, and its place (1 is the first run's)
//   node tools/feature.ts --remove <id>                          take an entry out
//   node tools/feature.ts --list                                 the table as it stands
//
// An entry is the playlist's id (its share link's; so sharing it again after an edit replaces it), its name, its track
// links as the page writes them (each naming its engine) and their labels. A track this edition cannot play is refused.
// Every featured link is a row of the link digest (`tools/link-digest.ts`, group `featured`): the links the digest
// does not hold yet are named at the end, and `node tools/bless.ts` reports them until a bless at merge adds them.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPlaylistLink } from '../src/playlist-link.ts';
import { readDeephouseFile, normaliseLink, tracksOf } from '../src/playlists.ts';
import type { Featured, FeaturedFile } from '../src/featured.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TABLE = path.join(HERE, '..', 'src', 'featured.json');

/** A refusal, in words: the command line says it and stops. */
const fail = (why: string): never => { throw new Error(why); };

/** The playlist a share link or a `.deephouse` file holds, as an entry: its id, name, links and labels. */
export function entryOf(input: string, read: (file: string) => string = (f) => fs.readFileSync(f, 'utf8')): Featured {
  let id: string | null = null, name = '';
  let tracks: Array<{ link: string; label?: string }> = [];
  const asFile = !/[?&](play|list)=|^(play|list)=/.test(input) && fs.existsSync(input);
  if (asFile) {
    const r = readDeephouseFile(read(input));
    if (r.error !== undefined) fail(`${input}: ${r.error}`);
    if (r.kind !== 'playlist') fail(`${input} is a backup of a whole library; download the one playlist (↓ .deephouse) instead`);
    const p = r.doc!.playlists.find((x) => x.removed === undefined)!;
    id = p.id ?? null;
    name = p.name ?? '';
    tracks = tracksOf(p).map((t) => ({ link: t.link, ...(t.label ? { label: t.label } : {}) }));
  } else {
    const search = input.includes('?') ? input.slice(input.indexOf('?') + 1) : input;
    const r = readPlaylistLink(search.replace(/#.*$/, ''));
    if (!r.list) fail(`the link does not read as a playlist link (${r.error})`);
    id = r.list!.id;
    name = r.list!.name;
    tracks = r.list!.tracks;
  }
  if (!tracks.length) fail('the playlist holds no tracks');
  const links: string[] = [], labels: string[] = [];
  for (const [i, t] of tracks.entries()) {
    const n = normaliseLink(t.link);
    if (!n.ok) fail(`track ${i + 1} (${t.link}) does not play in this edition: ${n.why}`);
    if (links.includes(n.link)) continue;
    links.push(n.link);
    labels.push(t.label ?? '');
  }
  return { id: id ?? crypto.randomUUID(), name: name.trim() || 'Featured playlist', links, ...(labels.some(Boolean) ? { labels } : {}) };
}

/** The table with an entry written in: over the one of `replace` (or of its own id) where it stands, else at `at` or the end. */
export function withEntry(table: FeaturedFile, e: Featured, opts: { replace?: string; at?: number } = {}): FeaturedFile {
  const lists = [...table.playlists];
  const over = opts.replace ?? e.id;
  const i = lists.findIndex((f) => f.id === over);
  if (opts.replace !== undefined && i < 0) fail(`no entry has the id ${opts.replace}`);
  const entry: Featured = { ...e, id: i >= 0 ? lists[i].id : e.id };
  // its own id elsewhere in the table (it was featured before, under another place) goes, so an id is one entry
  const rest = lists.filter((f, k) => k !== i && f.id !== entry.id);
  const where = opts.at !== undefined ? Math.max(0, Math.min(rest.length, opts.at - 1)) : i >= 0 ? Math.min(i, rest.length) : rest.length;
  rest.splice(where, 0, entry);
  const names = rest.map((f) => f.name);
  const twice = names.find((n, k) => names.indexOf(n) !== k);
  if (twice) console.warn(`feature: two featured playlists are called ${twice}`);
  return { ...table, playlists: rest };
}

export const writeTable = (t: FeaturedFile): void => fs.writeFileSync(TABLE, `${JSON.stringify(t, null, 2)}\n`);

function main(): void {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => { const i = argv.indexOf(name); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const table = JSON.parse(fs.readFileSync(TABLE, 'utf8')) as FeaturedFile;
  if (argv.includes('--list')) {
    for (const [i, f] of table.playlists.entries()) console.log(`${i + 1}. ${f.name} (${f.id}): ${f.links.length} tracks${i === 0 ? ', the first run\'s' : ''}`);
    return;
  }
  const remove = flag('--remove');
  if (remove !== undefined) {
    if (!table.playlists.some((f) => f.id === remove)) fail(`no entry has the id ${remove}`);
    writeTable({ ...table, playlists: table.playlists.filter((f) => f.id !== remove) });
    console.log(`removed ${remove} from ${path.relative(process.cwd(), TABLE)}`);
    return;
  }
  const name = flag('--name'), replace = flag('--replace'), at = flag('--at');
  const input = argv.find((a) => !a.startsWith('--'));
  if (!input) { console.error('usage: node tools/feature.ts "<share link>" | <file.deephouse> [--name "<name>"] [--replace <id>] [--at <n>] | --remove <id> | --list'); process.exit(2); }
  if (at !== undefined && !(Number.isInteger(Number(at)) && Number(at) >= 1)) fail(`--at takes a place from 1 (${at})`);
  const e = entryOf(input);
  if (name !== undefined && name.trim()) e.name = name.trim();
  const was = new Set(table.playlists.map((f) => f.id));
  const next = withEntry(table, e, { ...(replace !== undefined ? { replace } : {}), ...(at !== undefined ? { at: Number(at) } : {}) });
  writeTable(next);
  const placed = next.playlists.findIndex((f) => f.id === (replace ?? e.id));
  const entry = next.playlists[placed];
  console.log(`${was.has(entry.id) ? 'replaced' : 'added'} ${entry.name} (${entry.id}) at ${placed + 1} of ${next.playlists.length}: ${entry.links.length} tracks`);
  // what the release lock will ask for: the links the digest does not hold yet
  const digest = JSON.parse(fs.readFileSync(path.join(HERE, 'link-digest.json'), 'utf8')) as { rows: Array<{ link: string; themes?: number }> };
  const held = new Set(digest.rows.filter((r) => !r.themes).map((r) => r.link));
  const loose = [...new Set(next.playlists.flatMap((f) => f.links))].filter((l) => !held.has(l));
  if (loose.length) console.log(`the link digest does not hold ${loose.length} featured link${loose.length > 1 ? 's' : ''} yet; a bless at merge adds ${loose.length > 1 ? 'them' : 'it'}:\n${loose.map((l) => `  ${l}`).join('\n')}`);
  else console.log('every featured link is a frozen row of the link digest');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (e) { console.error(`feature: ${(e as Error).message}`); process.exit(1); }
}
