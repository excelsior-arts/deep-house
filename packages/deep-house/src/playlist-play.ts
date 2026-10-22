// **Playing a playlist, the arithmetic** (PLAN-LIBRARY §2, *Playing a playlist*): which track is next and which
// before, and when the next is asked for. Pure, so `tools/check-playlists.ts` holds it; the page's half is
// `playlists-ui.ts`.

import { soundKey } from './playlists.ts';

/** The track `d` steps from `i` in a playlist of `n`: **a playlist always repeats** (after the last, the first). -1: empty. */
export function stepIndex(i: number, n: number, d: number): number {
  if (!(n > 0)) return -1;
  const at = Number.isInteger(i) ? i : 0;
  return (((at + d) % n) + n) % n;
}

/**
 * **Which track of a playlist plays**: the one whose sound is the link's, the hint first where it is that sound
 * (one sound is one entry per list, so the hint only decides a playlist read before a merge folded it); -1 where
 * none is (a bird pulled since: the place stays the last one known).
 */
export function indexOfSound(links: readonly string[], link: string, hint = -1): number {
  let k: string;
  try { k = soundKey(link); } catch (e) { return -1; }
  if (hint >= 0 && hint < links.length && soundKey(links[hint]) === k) return hint;
  return links.findIndex((l) => soundKey(l) === k);
}

/**
 * **How far ahead of the record's own seam the next track is asked for**, in seconds: the cast then hands over on
 * the record's next line, where the set's own seam would have begun. A tick reads it once a second, so it is more
 * than a tick and less than the shortest phrase.
 */
export const SEAM_LEAD_S = 6;

/** Whether the next track is due: the record within `SEAM_LEAD_S` of its seam, and the theme long enough to have one. */
export const seamDue = (position: number, seamAt: number, lead = SEAM_LEAD_S): boolean =>
  seamAt > lead && position >= seamAt - lead;

/** "8 of 10", the place as the panel and the label under the ring say it. */
export const placeWords = (index: number, count: number): string => `${index + 1} of ${count}`;

/**
 * **A playlist's or a track's mark**: `playing` only while it is current and the transport sounds, `current` while
 * it is where the page is but nothing sounds (a reload resumed it, a pause), and none otherwise. The transport's
 * own state decides, never the resume store.
 */
export const playMark = (isCurrent: boolean, sounding: boolean): 'playing' | 'current' | null =>
  !isCurrent ? null : sounding ? 'playing' : 'current';
