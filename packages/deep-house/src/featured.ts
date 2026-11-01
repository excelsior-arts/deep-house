// **The featured playlists** (his word 10-23): playlists curated for the release and shipped inside it, offered in
// the Playlists tab to every listener, even one with nothing saved, and the one a first run starts on (the first).
//
// - **The table** is `featured.json`, a row file: each entry a stable `id` (so a copy or a playing place survives a
//   later edit), a `key` (its short fixed name on a link, `in=vibe`), a `name`, its `links` (track links as the page writes them, each naming its engine, so a playlist
//   plays on the engine it was chosen on) and, where any track has one, its `labels`. Its order is the order shown.
//   `tools/feature.ts` writes an entry from a playlist's share link or file.
// - **Read-only**: a featured playlist is never in the record (`playlists.ts`), so it is never synced or backed up and
//   its tracks never count as saved. Save a copy makes an ordinary playlist of yours (`copyOfFeatured`).
// - **The release lock**: every link is a row of the link digest (`tools/link-digest.ts`, group `featured`), so an
//   engine change that moves a featured track stops the release.
//
// The word is one constant, `FEATURED_WORD`: renaming the section is this one line. It is said in the paper panel's
// Playlists tab only, as the split between your playlists and these; the ring's line says the playlist's name.

import ROWS from './featured.json' with { type: 'json' };
import { readLibrary, openPlaylistFile } from './playlists.ts';
import type { LibraryDoc } from './playlists.ts';
import { linkSameSound } from './link.ts';
import { linkQuery, linkRaw } from './link-table.ts';

/** **The section's word**, said once, as the split in the Playlists tab. */
export const FEATURED_WORD = 'Featured';

export interface Featured {
  id: string;
  /**
   * **The playlist's name on a link** (his word 10-31: "for our featured list, we should use a hard-coded name as a
   * constant … they will never change, and they're unique and same in all apps and web apps"): `in=vibe`. Lowercase,
   * fixed in the table per list, never made from the display name; the `id` stays the page's own handle (the store,
   * the views) and is never read on a link (`featuredByKey`).
   */
  key: string;
  name: string;
  links: readonly string[];
  /** a label per link, `''` for none; absent where no track has one */
  labels?: readonly string[];
}
export interface FeaturedFile { note: string; playlists: Featured[] }

/** A key as a link writes it: lowercase letters, digits and dashes, a letter first. */
export const FEATURED_KEY = /^[a-z][a-z0-9-]*$/;
const ok = (f: Partial<Featured>): f is Featured =>
  typeof f.id === 'string' && !!f.id.trim() && typeof f.key === 'string' && FEATURED_KEY.test(f.key) && typeof f.name === 'string' && !!f.name.trim()
  && Array.isArray(f.links) && f.links.length > 0 && f.links.every((l) => typeof l === 'string' && !!l);

/** **The featured playlists, in the table's order**: an entry that doesn't read (no id, no name, no links) is left out. */
export const FEATURED: readonly Featured[] = Object.freeze(((ROWS as FeaturedFile).playlists ?? []).filter(ok).map((f) => Object.freeze({ ...f })));

/** An id as one text: a UUID with or without its dashes, any case, is one id. */
const idKey = (id: string): string => (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id.trim()) ? id.trim().replace(/-/g, '').toLowerCase() : id.trim());

/** The featured playlist with an id (a UUID read with or without its dashes): the page's own handle, never a link's. */
export const featuredById = (id: string | undefined | null, table: readonly Featured[] = FEATURED): Featured | undefined =>
  (id && id.trim() ? table.find((f) => f.id === id) ?? table.find((f) => idKey(f.id) === idKey(id)) : undefined);

/**
 * **The featured playlist a link's `in` names: by its key only** (`vibe`; his word 10-31: "I don't think any URLs been
 * shared … so there's no need to backward compatibility right now"). A UUID on `in` names none, and the track plays
 * alone, as any unknown `in` does.
 */
export const featuredByKey = (key: string | undefined | null, table: readonly Featured[] = FEATURED): Featured | undefined =>
  (key && key.trim() ? table.find((f) => f.key === key.trim().toLowerCase()) : undefined);

/** A featured playlist's tracks as the record writes tracks: its links, each with its label where it has one. */
export const featuredTracks = (f: Featured): Array<{ link: string; label?: string }> =>
  f.links.map((link, i) => ({ link, ...(f.labels?.[i] ? { label: f.labels[i] } : {}) }));

/**
 * **Save a copy**: the featured playlist as an ordinary playlist of yours, at the end, with its own new id (so it is
 * yours to rename, reorder and remove, and syncs as any other) and its name, " 2" where the name is taken. Its tracks
 * keep their labels. Where it landed comes back with it.
 */
export function copyOfFeatured(here: LibraryDoc, f: Featured, now: number = Date.now()): { doc: LibraryDoc; id: string } {
  const file = readLibrary({ kind: 'playlist', playlists: [{ name: f.name, tracks: featuredTracks(f) }] }, now).doc!;
  const doc = openPlaylistFile(here, file, 'add', now);
  return { doc, id: file.playlists[0].id! };
}

// --- a track's link inside a featured playlist (round pl-link, his word 10-26) --------------------------------------

/**
 * **A featured playlist's name in the page** (featured, 10-23): its id behind a mark no typed name begins with (U+E000,
 * a private-use character), so it never meets one of yours, in the views, the attributes and the place the store
 * keeps (an older edition finds no playlist of that name and resumes none).
 */
export const FEAT = '\uE000';
export const featKey = (id: string): string => `${FEAT}${id}`;
export const isFeat = (n: string | null): n is string => n !== null && n.startsWith(FEAT);
/** The featured playlist a name in the page is: `undefined` for one of yours (or Saved, `null`). */
export const featOf = (n: string | null): Featured | undefined => (isFeat(n) ? featuredById(n.slice(FEAT.length)) : undefined);

/**
 * **Where a track stands in a featured playlist**: the first of its links that plays the same sound (`linkSameSound`:
 * the seed, the theme, the engine, the birds, the recipe and the modes), never by place; -1 where none does.
 */
export function featuredIndex(f: Featured, link: string): number {
  const search = link.includes('?') ? link.slice(link.indexOf('?')) : link;
  try { return f.links.findIndex((l) => linkSameSound(l, search)); } catch (e) { return -1; }
}

/**
 * **A track's link, knowing its featured playlist** (round pl-link): the link (a whole address or its query) with
 * `in=<the playlist's key>` last (`in=vibe`; round featured-address, his word 10-31), where `f` is given and holds the
 * track (`featuredIndex`); else the link as it is. A track played from one of yours, or alone, passes `undefined`.
 */
export function linkInFeatured(link: string, f: Featured | undefined | null): string {
  if (!f || featuredIndex(f, link) < 0) return link;
  const at = link.indexOf('?');
  const head = at < 0 ? '' : link.slice(0, at + 1), query = at < 0 ? link : link.slice(at + 1);
  const q = linkQuery(query);
  q.delete('in');
  const rest = q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');
  return `${head}${rest}${rest ? '&' : ''}in=${encodeURIComponent(f.key)}`;
}

/** **The share circle's and a row's link** for a track playing in, or shown in, the playlist the page names `n`. */
export const trackShareLink = (link: string, n: string | null | undefined): string => linkInFeatured(link, featOf(n ?? null));

/**
 * **A track's link opened in its featured playlist** (round pl-link): the playlist `in` names and where the address's
 * track stands in it (the first place with its sound). `null` where there is no `in`, this edition has no playlist of
 * that key, or the playlist doesn't hold the track: the link then plays as a plain track link, with no notice.
 */
export function featuredPlace(search: string, table: readonly Featured[] = FEATURED): { featured: Featured; index: number } | null {
  const key = linkRaw('in', search);
  if (!key) return null;
  const featured = featuredByKey(key, table);
  if (!featured) return null;
  const index = featuredIndex(featured, search);
  return index < 0 ? null : { featured, index };
}
