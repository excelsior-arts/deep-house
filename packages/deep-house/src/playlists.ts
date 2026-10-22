// The listener's saved tracks and playlists: the record, its reading, its
// merge, its edits, its files and its one storage key (PLAN-LIBRARY §1).
//
// One JSON document, the same shape in local storage and in a `.deephouse`
// file: `playlists`, each holding its `tracks` in order. **The link is the
// track's identity**: two tracks are one when their links play the same sound
// (`soundKey`), read through the link's own reader and writer (`link.ts`), never
// compared as text. Every level keeps the fields it does not know and writes
// them back unchanged, so a library from a newer edition passes through this
// one whole.
//
// Pure but for `libraryStore`, the thin adapter over `localStorage`: the panel
// never touches storage itself, so a move to IndexedDB or the app's iCloud
// changes that one function. Nothing here changes what plays.
//
// The word is *playlists* because the tree's recipe library owns *library*
// (`library-draw.ts`); the storage key and the format keep the plan's words.

import { linkRead, linkWrite, linkWithTime, pageDefault } from './link.ts';
import type { LinkState } from './link.ts';
import { ROW, linkQuery } from './link-table.ts';
import { BIRDS, HOUSE, isHouse } from './spell.ts';
import type { Spell } from './spell.ts';

export const LIBRARY_KEY = 'deephouse.library';
/** Where a stored library that doesn't read is kept, once, before a write replaces it. */
export const UNREAD_KEY = 'deephouse.library.unread';
/** Where the app keeps the library it had before another iCloud account's was adopted: a whole backup, dated by `switched`. */
export const BEFORE_SWITCH_KEY = 'deephouse.library.before-switch';
export const LIBRARY_FORMAT = 'deep-house.library';
/** The version this edition reads and writes. It rises only for a change an old reader would misread. */
export const LIBRARY_VERSION = 1;
/** Tombstones (a removed track, a removed playlist, a rename) expire after a year, each copy cleaning up its own. */
export const TOMBSTONE_MS = 365 * 24 * 3600 * 1000;
/**
 * **The name the first save makes** (his word 10-20: Saved is an ordinary playlist). Every playlist has a name. There
 * is no default playlist (his word 10-20, "the concept doesn't scale"): the throne saves into the only one, or asks
 * which (`saveTarget`). An older file's `default` and `defaultEdited` are read past and never written. An unnamed
 * playlist from an older file reads as Saved (`readLibrary`).
 */
export const SAVED = 'Saved';

/** A track: its link, an optional label, when it was saved, when it was last edited; or a tombstone (`removed`). */
export interface Track {
  link: string;
  label?: string;
  saved?: string;
  edited?: string;
  removed?: string;
  [extra: string]: unknown;
}
/**
 * **A playlist, by its id** (his word 10-20: playlists get a stable id, tracks do not). `id` is a UUID made once at
 * its creation and never changed; any non-empty string reads (a hand-edited file). Its `name` is a plain field,
 * dated by `nameEdited` so a rename on one device and a track added on another both survive a merge. A removed
 * playlist leaves `{ id, name, removed }`, and one folded into another by a merge `{ id, removed, into }`. An
 * older file's rename record (`renamed`, `at`) is followed once on reading and never written.
 */
export interface Playlist {
  id?: string;
  name?: string;
  edited?: string;
  nameEdited?: string;
  removed?: string;
  into?: string;
  renamed?: string;
  at?: string;
  tracks?: Track[];
  [extra: string]: unknown;
}
export interface LibraryDoc {
  format: string;
  version: number;
  kind?: string;
  playlists: Playlist[];
  preferences?: Record<string, unknown>;
  [extra: string]: unknown;
}
/** A track whose link the page cannot play (or has none): kept and marked, never dropped. */
export interface BadTrack { playlist: string | null; link: string; why: string; newer?: boolean }

/** A refusal: a sentence the panel can say as it stands. */
export class PlaylistError extends Error {}

// --- time -------------------------------------------------------------------

/** A moment as the record writes it: the local time with its offset, `2026-10-20T21:14:05-07:00`. */
export function stamp(at: Date | number = Date.now()): string {
  const d = new Date(at);
  const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`;
}
const ms = (s: unknown): number => (typeof s === 'string' ? Date.parse(s) : NaN);
const msOr = (s: unknown, fallback: number) => { const t = ms(s); return Number.isFinite(t) ? t : fallback; };

/** A track's last change: `removed`, else `edited`, else `saved`. */
export const trackChange = (t: Track): number => msOr(t.removed ?? t.edited ?? t.saved, 0);
/** A playlist's last change: `removed`, else `at` (a rename record), else `edited`. */
export const playlistChange = (p: Playlist): number => msOr(p.removed ?? p.at ?? p.edited, 0);

const live = (t: Track) => t.removed === undefined;
const isRename = (p: Playlist) => typeof p.renamed === 'string';
const isList = (p: Playlist) => !isRename(p) && p.removed === undefined;
const keyOfList = (p: Playlist) => p.name ?? '';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
/** A value as text with its keys sorted: the same value is the same text on every device. */
const sortedText = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
/**
 * **The newer of two copies, the same on every device** (the review of 10-21, F4): the later change wins. Two copies
 * changed in the same second (the record keeps seconds) are settled by what they hold, never by which is here: a live
 * copy over a removal (nothing is lost on a tie), then the greater by its text. So merging either way round agrees.
 */
function newer<T>(here: T, there: T, change: (x: T) => number, alive: (x: T) => boolean): T {
  const a = change(here), b = change(there);
  if (a !== b) return b > a ? there : here;
  if (alive(here) !== alive(there)) return alive(there) ? there : here;
  return sortedText(there) > sortedText(here) ? there : here;
}

// --- links ------------------------------------------------------------------

/** The rows a saved link never keeps: the view, the bypass rows, the private desk (`solo`, `mute`), a playlist link's and the bar. */
const dropped = (name: string) => {
  const row = ROW[name];
  if (!row) return false;
  if (name === 'reach') return false;
  return row.class === 'view' || row.class === 'bypass' || row.class === 'private' || row.class === 'list' || name === 'bar';
};

/** A number in one form (`0.50` and `0.5` are `0.5`); anything else as given. */
const oneNumber = (v: string) => (/^\s*-?\d*\.?\d+\s*$/.test(v) && Number.isFinite(Number(v)) ? String(Number(v)) : v);

export interface NormalLink {
  /** the link as the page writes it, or the text as given where it cannot be played */
  link: string;
  ok: boolean;
  /** what is wrong, where it is not ok */
  why?: string;
  /** the link names an engine this edition lacks: "Needs a newer version" */
  newer?: boolean;
}

/**
 * **A link written the way the page writes one** (`linkWrite`): the sound rows in their fixed order, the birds in
 * the ring's order, a bird at its house left out, numbers in one form, `v` always (pinned to this edition's default
 * engine where absent), then `reach` and every parameter the table does not know, in their own order, then `t`
 * where it was given. The view, bypass and private rows and the bar are dropped. A spell entirely at the house is
 * none, except under a recipe, where a written spell (even the house's) is what stops the recipe rolling one, so it
 * is kept as the page writes it: all eight. A link the page cannot play (no seed, a seed nobody could type, an
 * engine this edition lacks, a spell that does not parse, a recipe it does not hold) is handed back as given and
 * marked. Accepts a whole address too: what follows its `?`.
 */
export function normaliseLink(text: unknown): NormalLink {
  if (typeof text !== 'string' || !text.trim()) return { link: typeof text === 'string' ? text : '', ok: false, why: 'the track has no link' };
  const raw = text.trim();
  const search = (raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw).replace(/#.*$/, '');
  const { link: L, problems } = linkRead(search, { trial: false, pageDefault: pageDefault() });
  if (problems.length) return { link: raw, ok: false, why: problems[0].long, ...(problems.some((p) => p.param === 'v') ? { newer: true } : {}) };
  if (!L.seed) return { link: raw, ok: false, why: 'the link names no seed' };
  const spell: Partial<Spell> | null = !L.spell || (L.recipe === null && isHouse(L.spell)) ? null : L.spell;
  const state: LinkState = { seed: L.seed, theme: L.theme, strategy: L.strategy, spell, recipe: L.recipe, accompaniment: L.accompaniment, development: L.development };
  const base = new URLSearchParams();
  for (const [k, v] of linkQuery(search)) if (!dropped(k) && !ROW[k]?.class.match(/^(sound|place)$/)) base.append(k, k === 'reach' ? oneNumber(v) : v);
  const out = L.t !== null ? linkWithTime(state, L.t, base.toString()) : linkWrite(state, base.toString());
  return { link: out, ok: true };
}

/**
 * **The sound a link plays, as one string**: two links are the same track when their keys are equal. It is
 * `linkSameSound`'s test (the seed, the theme, the engine, the eight birds through the house, the recipe, the two
 * modes) widened to `reach` and every unknown parameter (as a set, numbers as numbers), with one more distinction:
 * under a recipe, a written spell and none differ (none is rolled). `t` never counts. A link the page cannot play
 * is its own text.
 */
export function soundKey(text: string): string {
  const hit = KEYS.get(text);
  if (hit !== undefined) return hit;
  if (KEYS.size > 50000) KEYS.clear();
  const key = soundKeyOf(text);
  KEYS.set(text, key);
  return key;
}
const KEYS = new Map<string, string>();
function soundKeyOf(text: string): string {
  const n = normaliseLink(text);
  if (!n.ok) return `raw:${n.link}`;
  const { link: L } = linkRead(n.link, { trial: false, pageDefault: pageDefault() });
  const birds = L.spell === null && L.recipe !== null ? 'rolled' : BIRDS.map((b) => (L.spell ?? HOUSE)[b]).join(',');
  const extra: string[] = [];
  for (const [k, v] of linkQuery(n.link)) if (k === 'reach' || !ROW[k]) extra.push(`${k}=${oneNumber(v)}`);
  // no reach is the style's own: house-v2's is nought
  const reach0 = L.strategy === 'house-v2' ? 'reach=0' : null;
  return [L.seed, L.theme, L.strategy, birds, L.recipe ?? '', L.accompaniment, L.development,
    extra.filter((e) => e !== reach0).sort().join('&')].join('|');
}

/** Whether two links play the same sound. */
export const sameSound = (a: string, b: string): boolean => soundKey(a) === soundKey(b);

// --- reading ----------------------------------------------------------------

export const emptyLibrary = (): LibraryDoc => ({ format: LIBRARY_FORMAT, version: LIBRARY_VERSION, kind: 'library', playlists: [] });

/** One migration step per version, from the version named to the next. None yet: version 1 is the first. */
const MIGRATIONS: Record<number, (doc: LibraryDoc) => LibraryDoc> = {};

/** `assigned`: the reading gave a playlist its id, so the copy it came from wants writing back. */
export type ReadResult = { doc: LibraryDoc; bad: BadTrack[]; assigned?: boolean; error?: undefined } | { error: string; doc?: undefined; bad?: undefined; assigned?: undefined };

/** **A playlist's id**: a standard UUID v4, random, never derived from anything about the listener or the device. */
/**
 * A new playlist's id, a v4 UUID. `randomUUID` exists only in a secure context, and a page opened over plain http
 * on the LAN (a phone trying a build, 10-21) has none: there the same UUID is made from `getRandomValues`, which
 * every context has. Without it the first playlist (Saved, or New) was never made.
 */
export const newId = (): string => {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/**
 * **Read a library**, forgivingly: text or a parsed value in, a whole document out. No `version` is 1; a higher one
 * is refused with a sentence. No `saved` is now. Every link is normalised; one the page cannot play is kept as given
 * and listed in `bad`. Several unnamed playlists merge into Saved, and two with one name into one. Every field this
 * edition does not know is kept where it stands. The smallest file, `{"playlists":[{"tracks":[{"link":"seed=6&v=2"}]}]}`,
 * reads.
 */
export function readLibrary(input: unknown, now: number = Date.now()): ReadResult {
  let v: unknown = input;
  if (typeof input === 'string') {
    try { v = JSON.parse(input); } catch (e) { return { error: 'This file is not a Deep House library: it does not read as JSON.' }; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'This file is not a Deep House library: it holds no playlists.' };
  let doc = clone(v) as LibraryDoc;
  if (doc.format !== undefined && doc.format !== LIBRARY_FORMAT) return { error: `This file is not a Deep House library: its format is ${JSON.stringify(doc.format)}.` };
  const version = doc.version === undefined ? 1 : Number(doc.version);
  if (!Number.isInteger(version) || version < 1) return { error: `This library names a version this edition cannot read (${JSON.stringify(doc.version)}).` };
  if (version > LIBRARY_VERSION)
    return { error: `This library was written by a newer Deep House (version ${version}); this edition reads version ${LIBRARY_VERSION}. Update the app to open it.` };
  for (let at = version; at < LIBRARY_VERSION; at++) doc = MIGRATIONS[at](doc);
  doc.format = LIBRARY_FORMAT;
  doc.version = LIBRARY_VERSION;
  const lists = Array.isArray(doc.playlists) ? doc.playlists : [];
  const bad: BadTrack[] = [];
  const read: Playlist[] = [];
  const records: Playlist[] = [];
  for (const raw of lists) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Playlist;
    if (typeof p.name === 'string' && !p.name.trim()) delete p.name;
    else if (p.name !== undefined) p.name = String(p.name).trim();
    if (typeof p.id !== 'string' || !p.id.trim()) delete p.id;
    if (isRename(p)) { if (p.name !== undefined) records.push(p); continue; }
    // a removal is kept by its id; one an older edition kept by its name alone matches nothing now
    if (p.removed !== undefined) { delete p.tracks; if (p.id !== undefined) read.push(p); continue; }
    const tracks: Track[] = [];
    for (const t0 of Array.isArray(p.tracks) ? p.tracks : []) {
      const t = (typeof t0 === 'string' ? { link: t0 } : t0) as Track;
      if (!t || typeof t !== 'object') continue;
      const n = normaliseLink(t.link);
      t.link = n.link;
      if (t.removed === undefined) {
        if (!Number.isFinite(ms(t.saved))) t.saved = stamp(now);
        if (typeof t.label === 'string') { t.label = oneLine(t.label); if (!t.label) delete t.label; }
        if (!n.ok) bad.push({ playlist: p.name ?? null, link: n.link, why: n.why!, ...(n.newer ? { newer: true } : {}) });
      }
      tracks.push(t);
    }
    p.tracks = tracks;
    read.push(p);
  }
  // several with one name (or none) are one: the later ones merge into the first, as a merge would
  const out: Playlist[] = [];
  for (const p of read) {
    if (!isList(p)) { out.push(p); continue; }
    const i = out.findIndex((q) => isList(q) && keyOfList(q) === keyOfList(p));
    if (i < 0) out.push(p);
    else out[i] = mergeList(out[i], p);
  }
  doc.playlists = savedFirst(dedupeTracks(out));
  const lives = () => doc.playlists.filter(isList);
  // an older file's rename records, followed once: a playlist still under an old name takes the new one where it is free
  for (const r of records.sort((x, y) => msOr(x.at, 0) - msOr(y.at, 0))) {
    const p = lives().find((q) => q.name === r.name);
    if (p && !lives().some((q) => q.name === r.renamed)) p.name = r.renamed;
  }
  // **an unnamed playlist is Saved** (or "Saved 2" where a playlist has that name)
  const unnamed = lives().find((p) => p.name === undefined);
  if (unnamed) {
    const taken = (n: string) => doc.playlists.some((q) => q !== unnamed && q.name === n);
    let name = SAVED;
    for (let i = 2; taken(name); i++) name = `${SAVED} ${i}`;
    unnamed.name = name;
  }
  // every playlist has its id, made here once where a file had none
  let assigned = false;
  for (const p of lives()) if (p.id === undefined) { p.id = newId(); assigned = true; }
  // an older file's default is read past: there is none (his word 10-20)
  delete doc.default;
  delete doc.defaultEdited;
  return { doc, bad, ...(assigned ? { assigned } : {}) };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One sound is one entry per list: a second copy in the same list is folded into the first, the newer winning. */
function dedupeTracks(lists: Playlist[]): Playlist[] {
  for (const p of lists) {
    if (!p.tracks) continue;
    const at = new Map<string, number>();
    const kept: Track[] = [];
    for (const t of p.tracks) {
      const k = soundKey(t.link);
      const i = at.get(k);
      if (i === undefined) { at.set(k, kept.length); kept.push(t); }
      else kept[i] = newer(kept[i], t, trackChange, live);
    }
    p.tracks = kept;
  }
  return lists;
}

const savedFirst = (lists: Playlist[]): Playlist[] => {
  const i = lists.findIndex((p) => isList(p) && p.name === undefined);
  return i > 0 ? [lists[i], ...lists.slice(0, i), ...lists.slice(i + 1)] : lists;
};

// --- the merge --------------------------------------------------------------

/**
 * Two copies of one playlist, here's and there's: the newer last change wins its own fields and its order (a tie is
 * `newer`'s), each track the newer of its two copies, whole. The name is the newer naming's (`nameEdited`), so
 * a rename here and a track added there both survive. A track the winning order does not hold is never lost (only
 * a tombstone removes): it goes at the end.
 */
function mergeList(here: Playlist, there: Playlist): Playlist {
  const thereWins = newer(here, there, playlistChange, () => true) === there;
  const [win, lose] = thereWins ? [there, here] : [here, there];
  const out: Playlist = { ...clone(win) };
  const naming = (p: Playlist) => ({ at: msOr(p.nameEdited, 0), name: p.name ?? '' });
  const thereNaming = naming(there);
  const named = newer(naming(here), thereNaming, (x) => x.at, () => true) === thereNaming ? there : here;
  if (named.name !== undefined) out.name = named.name;
  if (named.nameEdited !== undefined) out.nameEdited = named.nameEdited;
  const loseByKey = new Map((lose.tracks ?? []).map((t) => [soundKey(t.link), t]));
  const held = new Set<string>();
  const tracks: Track[] = [];
  for (const t of win.tracks ?? []) {
    const k = soundKey(t.link);
    held.add(k);
    const o = loseByKey.get(k);
    // the newer copy, whole; a tie is `newer`'s
    const hereT = thereWins ? o : t, thereT = thereWins ? t : o;
    tracks.push(clone(!hereT ? thereT! : !thereT ? hereT : newer(hereT, thereT, trackChange, live)));
  }
  tracks.push(...(lose.tracks ?? []).filter((t) => !held.has(soundKey(t.link))).map(clone));
  out.tracks = tracks;
  return out;
}

/** How old a playlist is, as far as the record says: its first naming, edit or save. */
const ageOf = (p: Playlist): number => Math.min(...[p.nameEdited, p.edited, ...(p.tracks ?? []).map((t) => t.saved)].map((x) => msOr(x, Infinity)));

/**
 * **The merge**: one rule for an import, iCloud and a playlist link. Playlists match by id, tracks by sound. The
 * newer last change wins, a tie settled by what the two hold (`newer`); the winner's whole object wins. Removals happen only through a
 * tombstone newer than the last change on the other side; a playlist folded into another follows it. **Two live
 * playlists of one name** (made offline on two devices) fold into one: the older id stays, and the newer leaves a
 * tombstone pointing to it. Neither side's old `default` is carried. Tombstones older than a year
 * are dropped. The playlists keep here's order, then there's new ones.
 */
export function mergeLibraries(here: LibraryDoc, there: LibraryDoc, now: number = Date.now()): LibraryDoc {
  // each side drops its own expired tombstones first, so one past its year removes nothing
  const a = expire(here, now).playlists.filter((p) => !isRename(p)), b = expire(there, now).playlists.filter((p) => !isRename(p));
  const into = new Map<string, string>();
  const folds: Playlist[] = [];
  for (const p of [...a, ...b]) if (p.removed !== undefined && p.into && p.id && !into.has(p.id)) { into.set(p.id, p.into); folds.push(p); }
  const follow = (id: string | undefined) => {
    const seen = new Set<string>();
    let at = id;
    while (at !== undefined && into.has(at) && !seen.has(at)) { seen.add(at); at = into.get(at); }
    return at;
  };
  const out: Playlist[] = [];
  const index = new Map<string, number>();
  for (const p0 of [...a, ...b]) {
    if (p0.into) continue;
    const p = isList(p0) ? { ...p0, id: follow(p0.id) } : p0;
    const k = p.id ?? `\u0000${keyOfList(p)}`;
    const i = index.get(k);
    if (i === undefined) { index.set(k, out.length); out.push(p); continue; }
    const q = out[i];
    // a tombstone against a playlist: the newer change wins; two playlists: the merge above
    if (!isList(q) || !isList(p)) out[i] = newer(q, p, playlistChange, isList);
    else out[i] = mergeList(q, p);
  }
  // two live playlists of one name fold into the older
  const byName = new Map<string, Playlist>();
  const kept: Playlist[] = [];
  for (const p of out) {
    if (!isList(p) || p.name === undefined) { kept.push(p); continue; }
    const q = byName.get(p.name);
    if (!q) { byName.set(p.name, p); kept.push(p); continue; }
    const [old, young] = ageOf(p) < ageOf(q) || (ageOf(p) === ageOf(q) && String(p.id) < String(q.id)) ? [p, q] : [q, p];
    const merged = mergeList(old, { ...young, id: old.id, name: old.name, nameEdited: old.nameEdited });
    kept[kept.indexOf(q)] = merged;
    byName.set(p.name, merged);
    into.set(young.id!, old.id!);
    folds.push({ id: young.id, removed: stamp(now), into: old.id });
  }
  const { kind: _k, preferences: _p, ...thereFields } = clone(there);
  const doc: LibraryDoc = { ...thereFields, ...clone(here), playlists: savedFirst(inStep(dedupeTracks([...kept, ...folds]))) };
  delete doc.default;
  delete doc.defaultEdited;
  return expire(doc, now);
}

/** Drop every tombstone older than a year: removed tracks, removed playlists and rename records. */
export function expire(doc: LibraryDoc, now: number = Date.now()): LibraryDoc {
  const fresh = (t: number) => now - t <= TOMBSTONE_MS;
  const out = clone(doc);
  out.playlists = out.playlists.filter((p) => isList(p) || fresh(playlistChange(p)));
  for (const p of out.playlists) if (p.tracks) p.tracks = p.tracks.filter((t) => live(t) || fresh(trackChange(t)));
  return out;
}

/** A track's fields are the track's everywhere: the newest live copy of each sound is copied to every other. */
function inStep(lists: Playlist[]): Playlist[] {
  const best = new Map<string, Track>();
  for (const p of lists) for (const t of p.tracks ?? []) {
    if (!live(t)) continue;
    const k = soundKey(t.link), b = best.get(k);
    best.set(k, b ? newer(b, t, (x) => msOr(x.edited, 0), () => true) : t);
  }
  for (const p of lists) if (p.tracks) p.tracks = p.tracks.map((t) => (live(t) ? clone(best.get(soundKey(t.link))!) : t));
  return lists;
}

// --- edits ------------------------------------------------------------------

/** The live playlist of a name (`null`, Saved), or undefined. */
/** The live playlist with an id. */
export const playlistById = (doc: LibraryDoc, id: string | undefined): Playlist | undefined =>
  id === undefined ? undefined : doc.playlists.find((p) => isList(p) && p.id === id);
/** The live playlist of a name (names are unique); `null` is Saved's. */
export const playlistOf = (doc: LibraryDoc, name: string | null): Playlist | undefined =>
  doc.playlists.find((p) => isList(p) && keyOfList(p) === (name ?? SAVED));
/** **The live playlists, the most recently modified first** (its own `edited`: a save, an edit, a rename; never undefined first). */
export function byRecent(doc: LibraryDoc): Playlist[] {
  const changed = (p: Playlist) => Math.max(msOr(p.edited, 0), msOr(p.nameEdited, 0));
  return doc.playlists.filter(isList).map((p, i) => ({ p, i })).sort((a, b) => changed(b.p) - changed(a.p) || a.i - b.i).map((x) => x.p);
}
/**
 * **Where the throne saves** (his word 10-20): with no playlist it makes Saved; with one, into it; with two or more it
 * asks, offering them the most recently modified first.
 */
export type SaveTarget = { kind: 'create' } | { kind: 'one'; name: string } | { kind: 'pick'; names: string[] };
export function saveTarget(doc: LibraryDoc): SaveTarget {
  const lists = byRecent(doc);
  if (!lists.length) return { kind: 'create' };
  if (lists.length === 1) return { kind: 'one', name: keyOfList(lists[0]) };
  return { kind: 'pick', names: lists.map(keyOfList) };
}
/** The tracks a playlist shows: its live ones, in order. */
export const tracksOf = (p: Playlist | undefined): Track[] => (p?.tracks ?? []).filter(live);

const mustHave = (doc: LibraryDoc, name: string | null): Playlist => {
  const p = playlistOf(doc, name);
  if (!p) throw new PlaylistError(`There is no playlist called ${name ?? SAVED}.`);
  return p;
};
/** A live copy of a sound anywhere in the library, for keeping copies in step. */
const copyOf = (doc: LibraryDoc, key: string): Track | undefined => {
  for (const p of doc.playlists) for (const t of p.tracks ?? []) if (live(t) && soundKey(t.link) === key) return t;
  return undefined;
};
const newTrack = (doc: LibraryDoc, link: string, now: number, label?: string): Track => {
  const n = normaliseLink(link);
  const was = copyOf(doc, soundKey(n.link));
  if (was) return clone(was);
  return { ...(label && oneLine(label) ? { label: oneLine(label) } : {}), link: n.link, saved: stamp(now) };
};

/**
 * **Save what plays**, at a playlist's end, never doubled: into `into` where it is named, else where `saveTarget`
 * says (with none, Saved is made). With two or more and none named, the throne asks first; this refuses.
 */
export function saveTrack(doc0: LibraryDoc, link: string, now: number = Date.now(), label?: string, into?: string): LibraryDoc {
  let doc = doc0;
  let name = into;
  if (name === undefined) {
    const t = saveTarget(doc);
    if (t.kind === 'pick') throw new PlaylistError('Pick a playlist.');
    if (t.kind === 'one') name = t.name;
    else {
      doc = clone(doc0);
      doc.playlists.unshift({ id: newId(), name: SAVED, edited: stamp(now), nameEdited: stamp(now), tracks: [] });
      name = SAVED;
    }
  }
  const out = addToPlaylist(doc, name, link, now);
  if (label && out !== doc) return setLabelIn(out, link, label, now);
  return out;
}
const setLabelIn = (doc: LibraryDoc, link: string, label: string, now: number) => (oneLine(label) ? setLabel(doc, link, label, now) : doc);

/** **Add a track to a named playlist**, at its end; nothing doubled. */
export function addToPlaylist(doc0: LibraryDoc, name: string, link: string, now: number = Date.now()): LibraryDoc {
  const doc = clone(doc0);
  const p = mustHave(doc, name);
  const k = soundKey(link);
  const tracks = p.tracks ?? [];
  if (tracks.some((t) => live(t) && soundKey(t.link) === k)) return doc0;
  // **dated now** (the test round, 10-21): a copy of a sound already elsewhere keeps its old `saved`, and a removal of
  // it from this playlist dated after that would win the merge on the next device and take the new copy away
  const t = newTrack(doc, link, now);
  t.edited = stamp(now);
  p.tracks = [...tracks.filter((x) => soundKey(x.link) !== k), t];
  p.edited = stamp(now);
  return doc;
}

/** **A new playlist**, at the end, with its own new id; names are unique. */
export function createPlaylist(doc0: LibraryDoc, name: string, now: number = Date.now()): LibraryDoc {
  const n = oneLine(name);
  if (!n) throw new PlaylistError('A playlist needs a name.');
  if (playlistOf(doc0, n)) throw new PlaylistError(`A playlist called ${n} already exists.`);
  const doc = clone(doc0);
  doc.playlists.push({ id: newId(), name: n, edited: stamp(now), nameEdited: stamp(now), tracks: [] });
  return doc;
}

/** **Remove a track** from one playlist: it stays as a tombstone, its link and when. */
export function removeTrack(doc0: LibraryDoc, name: string | null, link: string, now: number = Date.now()): LibraryDoc {
  const doc = clone(doc0);
  const p = mustHave(doc, name);
  const k = soundKey(link);
  p.tracks = (p.tracks ?? []).map((t) => (live(t) && soundKey(t.link) === k ? { link: t.link, removed: stamp(now) } : t));
  if (name !== null) p.edited = stamp(now);
  return doc;
}

/** **Remove a named playlist**: it leaves `{ id, name, removed }`. Any playlist, the last one too (his word 10-20). */
export function removePlaylist(doc0: LibraryDoc, name: string, now: number = Date.now()): LibraryDoc {
  if (!name) throw new PlaylistError('A playlist needs a name.');
  const doc = clone(doc0);
  const p = mustHave(doc, name);
  doc.playlists[doc.playlists.indexOf(p)] = { id: p.id, name, removed: stamp(now) };
  return doc;
}

/** **Rename a playlist**: an ordinary edit of its name, which its id keeps across every copy. */
export function renamePlaylist(doc0: LibraryDoc, from: string, to: string, now: number = Date.now()): LibraryDoc {
  const n = oneLine(to);
  if (!from) throw new PlaylistError('A playlist needs a name.');
  if (!n) throw new PlaylistError('A playlist needs a name.');
  if (n === from) return doc0;
  if (playlistOf(doc0, n)) throw new PlaylistError(`A playlist called ${n} already exists.`);
  const doc = clone(doc0);
  const p = mustHave(doc, from);
  p.name = n;
  p.edited = stamp(now);
  p.nameEdited = stamp(now);
  return doc;
}

/** **Reorder** a named playlist: its shown track at `from` moved to `to`. Tombstones keep to the end. */
export function moveTrack(doc0: LibraryDoc, name: string, from: number, to: number, now: number = Date.now()): LibraryDoc {
  const doc = clone(doc0);
  const p = mustHave(doc, name);
  const shown = tracksOf(p);
  if (from < 0 || from >= shown.length || to < 0 || to >= shown.length) return doc0;
  const [t] = shown.splice(from, 1);
  shown.splice(to, 0, t);
  p.tracks = [...shown, ...(p.tracks ?? []).filter((x) => !live(x))];
  p.edited = stamp(now);
  return doc;
}

/**
 * **A track's link cleaned** (a chip removed on the card, PLAN-LIBRARY §1): a different sound, so a new record.
 * It takes the old one's place in this playlist and keeps its label and saved date; the old one is tombstoned.
 * Where the cleaned sound is in the playlist already, the old one only goes.
 */
export function replaceLink(doc0: LibraryDoc, name: string | null, from: string, to: string, now: number = Date.now()): LibraryDoc {
  const doc = clone(doc0);
  const p = mustHave(doc, name);
  const k = soundKey(from), n = normaliseLink(to);
  const tracks = p.tracks ?? [];
  const at = tracks.findIndex((t) => live(t) && soundKey(t.link) === k);
  if (at < 0) throw new PlaylistError('That track is not in this playlist.');
  if (soundKey(n.link) === k) return doc0;
  const old = tracks[at];
  const there = tracks.some((t) => live(t) && soundKey(t.link) === soundKey(n.link));
  // dated now, as `addToPlaylist`'s: the old saved date it keeps must not lose the merge to an older removal of the sound
  const fresh: Track = { ...newTrack(doc, n.link, now), ...(old.label ? { label: old.label } : {}), ...(old.saved ? { saved: old.saved } : {}), edited: stamp(now) };
  const rest = tracks.filter((t, i) => i !== at && !(soundKey(t.link) === soundKey(n.link) && !live(t)));
  if (!there) rest.splice(Math.min(at, rest.length), 0, fresh);
  p.tracks = [...rest, { link: old.link, removed: stamp(now) }];
  if (name !== null) p.edited = stamp(now);
  return doc;
}

/** Every live copy of a sound, edited together (a track's fields are the track's everywhere). */
function editTrack(doc0: LibraryDoc, link: string, now: number, edit: (t: Track) => void): LibraryDoc {
  const doc = clone(doc0);
  const k = soundKey(link);
  let any = false;
  for (const p of doc.playlists) for (const t of p.tracks ?? []) if (live(t) && soundKey(t.link) === k) { edit(t); t.edited = stamp(now); any = true; }
  if (!any) throw new PlaylistError('That track is not in your playlists.');
  return doc;
}

/** **Set a track's label**: one line; an empty one is none. */
export const setLabel = (doc: LibraryDoc, link: string, label: string, now: number = Date.now()): LibraryDoc =>
  editTrack(doc, link, now, (t) => { const l = oneLine(label); if (l) t.label = l; else delete t.label; });

/** **Set a track's saved date** (a `Date`, a time, or a stamp). */
export function setSaved(doc: LibraryDoc, link: string, saved: Date | number | string, now: number = Date.now()): LibraryDoc {
  const at = typeof saved === 'string' ? ms(saved) : +new Date(saved);
  if (!Number.isFinite(at)) throw new PlaylistError('That is not a date.');
  return editTrack(doc, link, now, (t) => { t.saved = typeof saved === 'string' ? saved : stamp(at); });
}

/**
 * **A stamp strictly after every change a library records**: now, or a second past its newest change where that is
 * now's own second (a fast Undo) or later (another device's clock ahead). A tie would leave it to the two copies' contents (`newer`).
 */
function after(doc: LibraryDoc, now: number): string {
  let newest = 0;
  for (const p of doc.playlists) {
    newest = Math.max(newest, playlistChange(p), msOr(p.nameEdited, 0));
    for (const t of p.tracks ?? []) newest = Math.max(newest, trackChange(t), msOr(t.edited, 0));
  }
  return stamp(Math.max(now, Math.floor(newest / 1000) * 1000 + 1000));
}

/**
 * **Undo as a dated edit** (sync-fixes, 10-21): the library back to `snapshot`, everything Undo changes dated now, so
 * the next merge keeps it on every device. A playlist or track that comes back is dated after the removal's tombstone
 * (which may have reached another device inside the Undo's seconds); one made since the snapshot is tombstoned now.
 */
export function restore(snapshot: LibraryDoc, current: LibraryDoc, now: number = Date.now()): LibraryDoc {
  const doc = clone(snapshot);
  const at = after(current, now);
  const lists = (d: LibraryDoc) => new Map(d.playlists.filter((p) => p.id !== undefined && !isRename(p)).map((p) => [p.id!, p]));
  const was = lists(current);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const p of doc.playlists) {
    if (p.id === undefined || isRename(p)) continue;
    const q = was.get(p.id);
    was.delete(p.id);
    if (!q || same(p, q)) continue;
    if (!isList(p)) { if (isList(q)) p.removed = at; continue; }
    p.edited = at;
    if (!isList(q)) continue;
    if (p.name !== q.name) p.nameEdited = at;
    const theirs = new Map((q.tracks ?? []).map((t) => [soundKey(t.link), t]));
    const mine = new Set<string>();
    for (const t of p.tracks ?? []) {
      const k = soundKey(t.link);
      mine.add(k);
      const o = theirs.get(k);
      if (o && same(o, t)) continue;
      if (live(t)) t.edited = at;
      else if (o && live(o)) t.removed = at;
    }
    for (const [k, o] of theirs) if (!mine.has(k) && live(o)) (p.tracks ??= []).push({ link: o.link, removed: at });
  }
  // a playlist made since the snapshot (an import, a copy kept both) goes as a dated removal
  for (const q of was.values()) if (isList(q)) doc.playlists.push({ id: q.id, name: q.name, removed: at });
  return doc;
}

/**
 * **Replace everything with a backup** (sync-fixes, 10-21; his call: opening a file and choosing Replace is the more
 * deliberate act, so it wins over sync): the file's library, every live playlist and track in it dated now, and every
 * playlist or track here it drops tombstoned now, so a later merge with a stale copy brings none of them back. The
 * record's own fields only (`edited`, `nameEdited`, `removed`): a 2.3.0 app reads it as it stands.
 */
export function replaceLibrary(here: LibraryDoc, file: LibraryDoc, now: number = Date.now()): LibraryDoc {
  const doc: LibraryDoc = { ...clone(file), kind: 'library' };
  const at = after(here, now);
  const theirs = new Map(doc.playlists.filter((p) => p.id !== undefined && !isRename(p)).map((p) => [p.id!, p]));
  for (const p of doc.playlists.filter(isList)) {
    p.edited = at;
    p.nameEdited = at;
    for (const t of p.tracks ?? []) if (live(t)) t.edited = at;
  }
  for (const h of here.playlists.filter(isList)) {
    const p = theirs.get(h.id!);
    if (!p) { doc.playlists.push({ id: h.id, name: h.name, removed: at }); continue; }
    if (!isList(p)) { p.removed = at; continue; }
    const keys = new Set((p.tracks ?? []).filter(live).map((t) => soundKey(t.link)));
    const gone = tracksOf(h).filter((t) => !keys.has(soundKey(t.link)));
    if (gone.length) p.tracks = [...(p.tracks ?? []).filter((t) => !gone.some((g) => sameSound(g.link, t.link))), ...gone.map((t) => ({ link: t.link, removed: at }))];
  }
  return doc;
}

// --- files ------------------------------------------------------------------

export const FILE_EXTENSION = '.deephouse';
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A name made safe for every file system: no separators or reserved characters, no trailing dot, not too long. */
export function safeFileName(name: string): string {
  let s = name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  s = Array.from(s).slice(0, 100).join('').trim();
  if (!s) s = 'Playlist';
  if (RESERVED.test(s)) s = `${s} playlist`;
  return `${s}${FILE_EXTENSION}`;
}

export interface FileOut { text: string; fileName: string }

/** **One playlist as a file** (`"kind": "playlist"`): that playlist alone, no tombstones, named after it. */
export function writePlaylistFile(doc: LibraryDoc, name: string | null): FileOut {
  const p = clone(mustHave(doc, name));
  p.tracks = tracksOf(p);
  const out: LibraryDoc = { format: LIBRARY_FORMAT, version: LIBRARY_VERSION, kind: 'playlist', playlists: [p] };
  return { text: `${JSON.stringify(out, null, 2)}\n`, fileName: safeFileName(name ?? SAVED) };
}

/** **Everything as a file** (`"kind": "library"`): the whole document, tombstones included, and the page's preferences. */
export function writeBackupFile(doc: LibraryDoc, preferences: Record<string, unknown> = {}, now: number = Date.now()): FileOut {
  const out: LibraryDoc = { ...clone(doc), format: LIBRARY_FORMAT, version: LIBRARY_VERSION, kind: 'library', preferences: clone(preferences) };
  return { text: `${JSON.stringify(out, null, 2)}\n`, fileName: safeFileName(`Deep House backup ${stamp(now).slice(0, 10)}`) };
}

export type FileIn = { kind: 'playlist' | 'library'; doc: LibraryDoc; bad: BadTrack[]; error?: undefined } | { error: string; kind?: undefined };

/**
 * **Read a `.deephouse` file**, or a `.json` with the same content: either kind. A file with no `kind` holding one
 * named playlist reads as a playlist file; anything else with no kind as a library.
 */
export function readDeephouseFile(text: string, now: number = Date.now()): FileIn {
  const r = readLibrary(text, now);
  if (r.error !== undefined) return { error: r.error };
  const lists = r.doc.playlists.filter(isList);
  const named = r.doc.kind ?? (lists.length === 1 && r.doc.playlists.length === 1 && lists[0].name !== undefined ? 'playlist' : 'library');
  if (named !== 'playlist' && named !== 'library') return { error: `This file holds a kind of Deep House file this edition does not know (${JSON.stringify(named)}).` };
  if (named === 'playlist' && lists.length !== 1) return { error: 'This playlist file holds no single playlist.' };
  r.doc.kind = named;
  return { kind: named, doc: r.doc, bad: r.bad };
}

/** The name Keep both gives: the name with " 2", " 3", … the first that is free. */
export function keepBothName(doc: LibraryDoc, name: string | null): string {
  const base = name ?? SAVED;
  for (let n = 2; ; n++) if (!playlistOf(doc, `${base} ${n}`)) return `${base} ${n}`;
}

/**
 * **What opening a playlist file would do**: its id here already (`exists`: the same playlist, perhaps renamed
 * since) asks Keep both or Replace; its name here under another id adds it as the Keep-both name.
 */
export function playlistFileSummary(here: LibraryDoc, file: LibraryDoc): { name: string | null; id: string | null; exists: boolean; text: string; keepBoth: string } {
  const p = file.playlists.find(isList)!;
  const name = p.name ?? null;
  const exists = !!playlistById(here, p.id);
  const shown = name ?? SAVED;
  return { name, id: p.id ?? null, exists, text: exists ? `${shown} exists` : `adds ${shown}`, keepBoth: keepBothName(here, name) };
}

/**
 * **Open a playlist file**: added as it stands (`add`: a new id here; its name with " 2" where the name is taken),
 * as a copy beside the one of its id (`keep-both`: a new id and the Keep-both name), or over the one of its id
 * (`replace`: its name and tracks become the file's, the ones it drops tombstoned so a merge does not bring them
 * back).
 */
export function openPlaylistFile(here: LibraryDoc, file: LibraryDoc, how: 'add' | 'keep-both' | 'replace', now: number = Date.now()): LibraryDoc {
  const p = clone(file.playlists.find(isList)!);
  p.tracks = tracksOf(p);
  p.edited = stamp(now);
  const doc = clone(here);
  const was = playlistById(doc, p.id);
  if (how === 'replace' && was) {
    const keys = new Set(p.tracks.map((t) => soundKey(t.link)));
    const gone = tracksOf(was).filter((t) => !keys.has(soundKey(t.link))).map((t) => ({ link: t.link, removed: stamp(now) }));
    const old = (was.tracks ?? []).filter((t) => !live(t) && !keys.has(soundKey(t.link)));
    const clash = doc.playlists.some((q) => q !== was && isList(q) && q.name === p.name);
    // what it writes is dated now (sync-fixes, 10-21), so a stale copy's older edit of a track never wins it back
    const wrote = p.tracks.map((t) => ({ ...t, edited: stamp(now) }));
    doc.playlists[doc.playlists.indexOf(was)] = { ...p, ...(clash ? { name: keepBothName(doc, p.name ?? null) } : {}), nameEdited: stamp(now), tracks: [...wrote, ...gone, ...old] };
    return doc;
  }
  if (was && how === 'add') throw new PlaylistError(`${p.name ?? SAVED} is here already.`);
  if (was || how === 'keep-both') p.id = newId();
  if (playlistOf(doc, p.name ?? null)) { p.name = keepBothName(doc, p.name ?? null); p.nameEdited = stamp(now); }
  doc.playlists = doc.playlists.filter((q) => !(q.removed !== undefined && q.id === p.id));
  doc.playlists.push(p);
  return doc;
}

export interface BackupSummary {
  added: number;
  labels: number;
  removed: Array<{ playlist: string | null; link: string; label?: string }>;
  newPlaylists: string[];
  removedPlaylists: string[];
  renamed: Array<{ from: string; to: string }>;
  bad: number;
  /** "Adds 12, updates 3 labels, removes 2, new playlist Ambient journey" */
  text: string;
}

/** **What a backup would do** to this library: the panel's question before Import. */
export function backupSummary(here: LibraryDoc, file: LibraryDoc, bad: BadTrack[] = [], now: number = Date.now()): BackupSummary {
  const after = mergeLibraries(here, file, now);
  // a playlist here folded into another by the merge is followed to it
  const into = new Map(after.playlists.filter((p) => p.into && p.id).map((p) => [p.id!, p.into!]));
  const at = (id: string | undefined) => { let x = id; for (let i = 0; x !== undefined && into.has(x) && i < 50; i++) x = into.get(x); return x ?? ''; };
  const lists = (doc: LibraryDoc) => new Map(doc.playlists.filter(isList).map((p) => [p.id ?? '', p]));
  const before = lists(here), later = lists(after);
  const liveTracks = (doc: LibraryDoc, place: (id: string | undefined) => string) => {
    const m = new Map<string, { playlist: string | null; id: string; t: Track }>();
    for (const p of doc.playlists.filter(isList)) for (const t of tracksOf(p)) m.set(`${place(p.id)}\u0000${soundKey(t.link)}`, { playlist: p.name ?? null, id: place(p.id), t });
    return m;
  };
  const was = liveTracks(here, at), will = liveTracks(after, (id) => id ?? '');
  const renamed: BackupSummary['renamed'] = [];
  const removedPlaylists: string[] = [];
  for (const [id, p] of before) {
    const q = later.get(at(id));
    if (!q) removedPlaylists.push(p.name ?? SAVED);
    else if (q.name !== p.name && at(id) === id) renamed.push({ from: p.name ?? SAVED, to: q.name ?? SAVED });
  }
  const reached = new Set([...before.keys()].map(at));
  const newPlaylists = [...later].filter(([id]) => !reached.has(id)).map(([, p]) => p.name ?? SAVED);
  let added = 0, labels = 0;
  for (const [k, v] of will) { const w = was.get(k); if (!w) added++; else if ((w.t.label ?? '') !== (v.t.label ?? '')) labels++; }
  const removed: BackupSummary['removed'] = [];
  for (const [k, v] of was) {
    if (will.has(k) || !later.has(v.id)) continue;
    removed.push({ playlist: v.playlist, link: v.t.link, ...(v.t.label ? { label: v.t.label } : {}) });
  }
  const parts: string[] = [];
  if (added) parts.push(`adds ${added}`);
  if (labels) parts.push(`updates ${labels} label${labels === 1 ? '' : 's'}`);
  if (removed.length) parts.push(`removes ${removed.length}`);
  for (const n of newPlaylists) parts.push(`new playlist ${n}`);
  for (const r of renamed) parts.push(`renames ${r.from} to ${r.to}`);
  for (const n of removedPlaylists) parts.push(`removes playlist ${n}`);
  if (bad.length) parts.push(`${bad.length} link${bad.length === 1 ? '' : 's'} this edition cannot play`);
  const text = parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'Nothing new';
  return { added, labels, removed, newPlaylists, removedPlaylists, renamed, bad: bad.length, text };
}

// --- storage ----------------------------------------------------------------

export type StoreWrite = { ok: true } | { ok: false; error: 'quota' | 'blocked'; message: string };

export interface LibraryStore {
  /** the stored library (an empty one where none is), or the reader's refusal */
  read(): ReadResult;
  /** write the whole document; a full quota comes back as an error value, never swallowed */
  write(doc: LibraryDoc): StoreWrite;
  /** keep a library aside under `BEFORE_SWITCH_KEY` as a dated backup, before another account's replaces it; false if it could not be kept */
  keepAside(doc: LibraryDoc, now?: number): boolean;
  /** called with the new document on every write here and every change from another tab; returns the unsubscribe */
  subscribe(fn: (doc: LibraryDoc) => void): () => void;
}

const isQuota = (e: unknown) => {
  const x = e as { name?: string; code?: number };
  return x?.name === 'QuotaExceededError' || x?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x?.code === 22 || x?.code === 1014;
};

/**
 * **The one key** (`deephouse.library`) in a `Storage`, and the `storage` events other tabs fire on it. Both are
 * passed in for a check; the page passes nothing and gets `localStorage` and `window`.
 */
/** Whether stored text is a library from a newer edition: a version above this one's. */
function newerLibrary(text: string): boolean {
  try { const v = (JSON.parse(text) as { version?: unknown } | null)?.version; return Number.isInteger(Number(v)) && Number(v) > LIBRARY_VERSION; } catch (e) { return false; }
}

export function libraryStore(storage?: Storage | null, events?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null): LibraryStore {
  const store = (): Storage | null => {
    if (storage !== undefined) return storage;
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  };
  const target = events !== undefined ? events : typeof window !== 'undefined' ? window : null;
  const listeners = new Set<(doc: LibraryDoc) => void>();
  const read = (): ReadResult => {
    let text: string | null = null;
    try { text = store()?.getItem(LIBRARY_KEY) ?? null; } catch (e) { text = null; }
    return text === null ? { doc: emptyLibrary(), bad: [] } : readLibrary(text);
  };
  const onStorage = (e: Event) => {
    const key = (e as StorageEvent).key;
    if (key !== LIBRARY_KEY && key !== null) return;
    const r = read();
    if (r.doc) for (const fn of listeners) fn(r.doc);
  };
  return {
    read,
    write(doc) {
      const s = store();
      if (!s) return { ok: false, error: 'blocked', message: 'This browser keeps no storage for this page, so playlists cannot be saved here.' };
      // **never over a library this edition can't read** (the test round, 10-21): a newer edition's is refused with its
      // sentence, so an old page (or an old tab left open) never writes its smaller copy over it; one that doesn't read
      // at all is kept once under a spare key before it is replaced, so nothing is lost without a trace
      try {
        const was = s.getItem(LIBRARY_KEY);
        if (was !== null) {
          const r = readLibrary(was);
          if (r.error !== undefined) {
            if (newerLibrary(was)) return { ok: false, error: 'blocked', message: r.error };
            if (s.getItem(UNREAD_KEY) === null) s.setItem(UNREAD_KEY, was);
          }
        }
      } catch (e) { /* the copy is a courtesy; the write below says what went wrong */ }
      try { s.setItem(LIBRARY_KEY, JSON.stringify(doc)); } catch (e) {
        if (isQuota(e)) return { ok: false, error: 'quota', message: 'This browser\'s storage for the page is full, so the change was not saved. Back up everything, then remove a playlist or old tracks.' };
        return { ok: false, error: 'blocked', message: 'This browser refused to save the playlists.' };
      }
      for (const fn of listeners) fn(doc);
      return { ok: true };
    },
    keepAside(doc, now = Date.now()) {
      try { store()?.setItem(BEFORE_SWITCH_KEY, JSON.stringify({ ...doc, kind: 'library', switched: stamp(now) })); return true; } catch (e) { return false; }
    },
    subscribe(fn) {
      if (!listeners.size) target?.addEventListener('storage', onStorage);
      listeners.add(fn);
      return () => { listeners.delete(fn); if (!listeners.size) target?.removeEventListener('storage', onStorage); };
    },
  };
}
