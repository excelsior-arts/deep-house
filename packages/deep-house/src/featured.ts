// **The featured playlists** (his word 10-23): playlists curated for the release and shipped inside it, offered in
// the Playlists tab to every listener, even one with nothing saved, and the one a first run starts on (the first).
//
// - **The table** is `featured.json`, a row file: each entry a stable `id` (so a copy or a playing place survives a
//   later edit), a `name`, its `links` (track links as the page writes them, each naming its engine, so a playlist
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

/** **The section's word**, said once, as the split in the Playlists tab. */
export const FEATURED_WORD = 'Featured';

export interface Featured {
  id: string;
  name: string;
  links: readonly string[];
  /** a label per link, `''` for none; absent where no track has one */
  labels?: readonly string[];
}
export interface FeaturedFile { note: string; playlists: Featured[] }

const ok = (f: Partial<Featured>): f is Featured =>
  typeof f.id === 'string' && !!f.id.trim() && typeof f.name === 'string' && !!f.name.trim()
  && Array.isArray(f.links) && f.links.length > 0 && f.links.every((l) => typeof l === 'string' && !!l);

/** **The featured playlists, in the table's order**: an entry that doesn't read (no id, no name, no links) is left out. */
export const FEATURED: readonly Featured[] = Object.freeze(((ROWS as FeaturedFile).playlists ?? []).filter(ok).map((f) => Object.freeze({ ...f })));

/** The featured playlist with an id. */
export const featuredById = (id: string | undefined | null): Featured | undefined => (id ? FEATURED.find((f) => f.id === id) : undefined);

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
