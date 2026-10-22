// **A playlist as a link** (PLAN-LIBRARY §3; the format is his word, 10-20). Pure: the writer and the reader,
// each the other's inverse.
//
//   ?list=Ambient+journey&v=2&play=27191-3-em95ti45~6~812-2-ze20ve80&names=cool+bells+dialog~~&id=3f9c…8a90
//
// - `list`: the name ("Shared list" where none is given).
// - `v`: the engine most tracks share, written once. A track on another engine ends in its own `@1`.
// - `play`: the tracks in order, `~` between. A track is its seed, then `-` and its theme where it isn't the first
//   (the track link's own count: `theme=3` is `-3`), then `-` and its birds off their house (`em95` is Ember at
//   0.95, `ze20.5` Zephyr at 0.205: the link's own digits with the point moved two places, so nothing rounds).
//   Every other row the track's link holds follows as `;name:value`, in the link's order.
// - `names`: the labels, `~` between, an empty one for none; always written.
// - `id`: the playlist's UUID without its dashes, last.
//
// Inside a piece, `%` and the separators it would break (`-` in a seed; `~ ; @` everywhere; `:` in a row's name)
// are written `%XX`, so a seed, a label or a row's value can hold any of them.

import { normaliseLink, readLibrary, openPlaylistFile, playlistById } from './playlists.ts';
import type { LibraryDoc } from './playlists.ts';
import { linkQuery } from './link-table.ts';
import { BIRDS, BIRD_CODE } from './spell.ts';

/** The rows a playlist link holds, beside the shared `v`. */
export const LIST_ROWS = ['list', 'play', 'names', 'id'] as const;
/** The name a link with none gives its playlist. */
export const SHARED_LIST = 'Shared list';
/** Past this many characters some apps cut a link: Share says "Long link". */
export const LONG_LINK = 2000;

export interface ListTrack { link: string; label?: string }
export interface ListLink { name: string; id: string | null; tracks: ListTrack[] }

const CODES = new Set(BIRDS.map((b) => BIRD_CODE[b]));
const hex = (c: string) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
const escIn = (s: string, chars: string) => s.replace(new RegExp(`[%${chars.replace(/[-\]\\^]/g, '\\$&')}]`, 'g'), hex);
const unesc = (s: string) => s.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const SEED_ESC = '-~;@', ROW_ESC = '~;@:', VALUE_ESC = '~;@', LABEL_ESC = '~';

/** A bird's value as a percent, its digits moved two places: `0.95` → `95`, `0.205` → `20.5`, `1.00` → `100`. */
export function percentOf(value: string): string | null {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(value);
  if (!m) return null;
  const f = m[2] ?? '';
  const whole = `${m[1]}${f.slice(0, 2).padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  const rest = f.slice(2);
  return rest ? `${whole}.${rest}` : whole;
}
/** The inverse: `95` → `0.95`, `20.5` → `0.205`, `100` → `1.00`, `0` → `0.00`. */
export function valueOf(percent: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(percent);
  if (!m) return null;
  const w = m[1].padStart(3, '0');
  return `${w.slice(0, -2).replace(/^0+(?=\d)/, '')}.${w.slice(-2)}${m[2] ?? ''}`;
}
/** A spell's text as birds (`em:0.95,ti:0.45` → `em95ti45`), or null where any piece would not come back as written. */
function birdsOf(spell: string): string | null {
  let out = '';
  for (const piece of spell.split(',')) {
    const m = /^([a-z]{2}):(\d+(?:\.\d+)?)$/.exec(piece);
    if (!m || !CODES.has(m[1])) return null;
    const p = percentOf(m[2]);
    if (p === null || valueOf(p) !== m[2]) return null;
    out += `${m[1]}${p}`;
  }
  return out || null;
}
const BIRDS_RE = /^(?:[a-z]{2}\d+(?:\.\d+)?)+$/;
function spellOf(birds: string): string {
  return [...birds.matchAll(/([a-z]{2})(\d+(?:\.\d+)?)/g)].map((m) => `${m[1]}:${valueOf(m[2])}`).join(',');
}

/** The engine most of the tracks name; a tie goes to the earlier one. */
function sharedVer(links: string[]): string | null {
  const count = new Map<string, number>();
  for (const l of links) { const v = linkQuery(l).get('v'); if (v !== null) count.set(v, (count.get(v) ?? 0) + 1); }
  let best: string | null = null;
  for (const [v, n] of count) if (best === null || n > count.get(best)!) best = v;
  return best;
}

/** One track as its piece of `play`, or null where its link names no seed. */
function trackPiece(link: string, ver: string | null): string | null {
  const q = linkQuery(link);
  const seed = q.get('seed');
  if (!seed) return null;
  let core = escIn(seed, SEED_ESC);
  const rows: Array<[string, string]> = [];
  const used = new Set(['seed', 'v']);
  const theme = q.get('theme');
  if (theme !== null) { used.add('theme'); if (/^[1-9]\d{0,3}$/.test(theme) && theme !== '1') core += `-${theme}`; else rows.push(['theme', theme]); }
  const spell = q.get('spell');
  if (spell !== null) { used.add('spell'); const b = birdsOf(spell); if (b) core += `-${b}`; else rows.push(['spell', spell]); }
  const seen = new Set<string>();
  for (const [k, v] of q) { if (used.has(k) && !seen.has(k)) { seen.add(k); continue; } rows.push([k, v]); }
  const own = q.get('v');
  return core + rows.map(([k, v]) => `;${escIn(k, ROW_ESC)}:${escIn(v, VALUE_ESC)}`).join('') + (own === ver ? '' : `@${escIn(own ?? '', VALUE_ESC)}`);
}

/** The id as the link writes it: a UUID without its dashes, anything else as it stands. */
const idOut = (id: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.replace(/-/g, '').toLowerCase() : id);
const idIn = (s: string) => (/^[0-9a-f]{32}$/i.test(s) ? s.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : s);

/**
 * **The writer**: a playlist in, the query out (no `?`), in the order `list`, `v`, `play`, `names`, `id`. Each
 * track's link is first written the way the page writes one. A track with no seed has nothing to play and is left
 * out, with its label.
 */
export function writePlaylistLink(list: ListLink): string {
  const tracks = list.tracks.map((t) => ({ link: normaliseLink(t.link).link, label: t.label ?? '' }));
  const ver = sharedVer(tracks.map((t) => t.link));
  const kept: Array<{ piece: string; label: string }> = [];
  for (const t of tracks) { const piece = trackPiece(t.link, ver); if (piece !== null) kept.push({ piece, label: t.label }); }
  const q = new URLSearchParams();
  q.set('list', list.name);
  if (ver !== null) q.set('v', ver);
  q.set('play', kept.map((k) => k.piece).join('~'));
  q.set('names', kept.map((k) => escIn(k.label.replace(/\s+/g, ' ').trim(), LABEL_ESC)).join('~'));
  if (list.id) q.set('id', idOut(list.id));
  // the separators as a person reads them; an escaped one inside a piece stays escaped (`%257E`)
  return q.toString().replace(/%7E/g, '~').replace(/%3B/g, ';').replace(/%40/g, '@').replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');
}

/** Whether an address is a playlist link: it carries any of the list's rows. */
export const isPlaylistLink = (search: string): boolean => {
  const q = linkQuery(search);
  return LIST_ROWS.some((name) => q.has(name));
};

export type ListRead = { list: ListLink; error?: undefined } | { error: string; list?: undefined };

/**
 * **The reader**: the query in, the playlist out, each track's link written the way the page writes one (a link
 * this edition can't play, an engine it lacks, is kept as read). A link that doesn't parse is refused whole, with
 * a short reason.
 */
export function readPlaylistLink(search: string): ListRead {
  const q = linkQuery(search);
  const play = q.get('play');
  if (!play) return { error: 'no tracks' };
  const ver = q.get('v');
  const labels = (q.get('names') ?? '').split('~').map((s) => unesc(s).replace(/\s+/g, ' ').trim());
  const tracks: ListTrack[] = [];
  for (const [i, piece] of play.split('~').entries()) {
    const at = piece.lastIndexOf('@');
    const body = at < 0 ? piece : piece.slice(0, at);
    const own = at < 0 ? ver : unesc(piece.slice(at + 1));
    const [core, ...rows] = body.split(';');
    const [seed, ...rest] = core.split('-');
    if (!seed) return { error: `track ${i + 1} has no seed` };
    const link = new URLSearchParams();
    link.set('seed', unesc(seed));
    if (own) link.set('v', own);
    let k = 0;
    if (rest[k] !== undefined && /^\d{1,4}$/.test(rest[k])) link.set('theme', rest[k++]);
    if (rest[k] !== undefined && BIRDS_RE.test(rest[k])) link.set('spell', spellOf(rest[k++]));
    if (k !== rest.length) return { error: `track ${i + 1} does not read` };
    for (const row of rows) {
      const c = row.indexOf(':');
      if (c < 1) return { error: `track ${i + 1} does not read` };
      const name = unesc(row.slice(0, c)), value = unesc(row.slice(c + 1));
      if (['theme', 'spell'].includes(name)) link.set(name, value); else link.append(name, value);
    }
    tracks.push({ link: normaliseLink(link.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/')).link, ...(labels[i] ? { label: labels[i] } : {}) });
  }
  const id = (q.get('id') ?? '').trim();
  return { list: { name: (q.get('list') ?? '').replace(/\s+/g, ' ').trim() || SHARED_LIST, id: id ? idIn(id) : null, tracks } };
}

/**
 * **A playlist link saved** (§3, *Opening one*): the playlist of its id here is replaced by the link's version (its
 * name, tracks, order and labels; the caller offers Undo); a link with no id, or an id not here, adds a new one,
 * " 2" where its name is taken. A playlist removed here and opened again from its link comes back. Where it landed
 * comes back with it.
 */
export function savePlaylistLink(here: LibraryDoc, list: ListLink, now: number = Date.now()): { doc: LibraryDoc; id: string; replaced: boolean } {
  const file = readLibrary({ kind: 'playlist', playlists: [{ ...(list.id ? { id: list.id } : {}), name: list.name, tracks: list.tracks }] }, now).doc!;
  const id = file.playlists[0].id!;
  const replaced = !!playlistById(here, id);
  return { doc: openPlaylistFile(here, file, replaced ? 'replace' : 'add', now), id, replaced };
}
