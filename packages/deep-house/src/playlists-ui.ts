// **The Playlists tab, the throne's save and playing a playlist** (PLAN-LIBRARY §2, phase 3).
//
// - **The throne, now love** (ring.ts draws the heart key at the star's lower left and hands its presses here; star-keys
//   10-22) saves what plays into Saved:
//   a copy of the birds' imprint lifts off the ring and slides into the gyroscope, which spins (`gyroSpin`). With
//   the panel open the throne flashes once; under reduced motion the gyroscope blinks. A save never opens the panel.
// - **The tab**: the overview (what plays, your playlists in your order, + New playlist, files), a playlist's page (its
//   header, Play and ↓ .deephouse, its rows, reordering), one ⋯ menu for a track and a playlist, and the questions a
//   file asks. Your playlists reorder as a playlist's tracks do (pl-order, his word 10-23): a drag of a row, a press
//   and hold for a finger, or Move up and Move down in the playlist's ⋯; each with Undo.
// - **Playing**: a row plays through `control.playPlace` (the journal walk's `mix.cast` path); next and back step
//   through the playlist (`control.steer`), the next track is asked just before the record's own seam, the
//   playlist repeats, and the dice leave it. Where it is (its name and the track's place) rides the player's store.
// - **Files**: ↓ .deephouse and Back up everything download through `playlists.ts`'s writers; Open a .deephouse
//   file and a file dropped on the page read through `readDeephouseFile`.
//
// - **Featured** (his word 10-23, `featured.ts`): the release's own playlists, under yours after a hairline with the
//   section's word, read-only (play, share, Save a copy, open in app), never in the record. A bare address in a browser
//   that stored nothing starts on the first, at its first track (`openListLink`).
//
// The record is `playlists.ts`'s and the worked-out values `sky.ts`'s; this file only shows and asks. Copy is
// short point labels, no prose (his word 10-20). Nothing here is written into the address.

import {
  libraryStore, playlistOf, tracksOf, saveTrack, addToPlaylist, createPlaylist, removeTrack, removePlaylist, renamePlaylist,
  moveTrack, movePlaylist, inOrder, setLabel, replaceLink, restore, replaceLibrary, writePlaylistFile, writeBackupFile, readDeephouseFile, playlistFileSummary,
  openPlaylistFile, backupSummary, saveTarget, playlistById, mergeLibraries, normaliseLink, soundKey, SAVED, PlaylistError,
} from './playlists.ts';
import { writePlaylistLink, readPlaylistLink, isPlaylistLink, savePlaylistLink, LIST_ROWS, LONG_LINK } from './playlist-link.ts';
import { linkQuery, SOUND } from './link-table.ts';
import type { LinkProblem } from './link.ts';
import type { LibraryDoc, Playlist, Track, FileOut } from './playlists.ts';
import { colourOf, genreOf, timeOf, totalOf, constellationOf } from './sky.ts';
import { cleanLink, copyText, clock } from './share-link.ts';
import { pageBase } from './page-base.ts';
import { appleDevice, openInApp, APP_STORE, syncAppBanner } from './open-in-app.ts';
import { note } from './ledger.ts';
import { stepIndex, indexOfSound, seamDue, placeWords, playMark } from './playlist-play.ts';
import { romanNumeral, placeStored } from './control.ts';
import { linkBare } from './link.ts';
import { FEATURED, FEATURED_WORD, featuredById, featuredTracks, copyOfFeatured } from './featured.ts';
import type { Featured } from './featured.ts';
import type { Control } from './control.ts';
import { openLibrary, libraryOpen, gyroSpin, scrollInks } from './library-panel.ts';
import { reducedMotion } from './motion.ts';
import { shellStore, shellSave, shellPick, shellShareLink, startShellLibrary } from './shell-library.ts';
import { BIRDS, BIRD_CODE, HOUSE } from './spell.ts';
import type { Bird } from './spell.ts';

export interface PlaylistDeps {
  control: Control;
  /** the save's key on the ring (love, since star-keys), for its menu's anchor, its focus and its one pulse */
  throne: () => Element | null;
  /** says whether what plays is in a playlist: the heart filled or drawn in outline */
  loved: (on: boolean) => void;
  /**
   * **The ring's imprint**, a copy to fly: the star sheet cloned (the eight birds in their nodes with their glyphs,
   * the lines joining them, the core ring), line work only, and the screen box it stands in. The live ring is not
   * touched. `null`: nothing to copy.
   */
  imprint: () => { svg: SVGSVGElement; box: DOMRect } | null;
}

type Name = string | null;
type View =
  | { kind: 'overview' }
  | { kind: 'list'; name: Name; from?: string }
  | { kind: 'askFile'; file: LibraryDoc; text: string; keepBoth: string; name: Name }
  | { kind: 'askBackup'; file: LibraryDoc; text: string; removed: string[] };

const PULSE_KEY = 'deephouse.throne';
// the cloud's value this device's storage refused is said as a local write's refusal is (`commit`)
const store = shellStore(libraryStore(), (message) => { notice = message; say(message); render(); });
let deps: PlaylistDeps;
let doc: LibraryDoc = (() => {
  const r = store.read();
  // ids made on reading an older copy are written back at once, so they stay the playlists' own
  if (r.doc && r.assigned) store.write(r.doc);
  return r.doc ?? { format: 'deep-house.library', version: 1, kind: 'library', playlists: [] };
})();
let view: View = { kind: 'overview' };
/** the playlist the page plays in, and the track's place in it: device state, never the record */
let playing: { name: Name; index: number } | null = null;
let undo: { text: string; doc: LibraryDoc; timer: number } | null = null;
let notice = '';
/** "Not installed? Get the app", for a moment after Open in app did not take (open-in-app.ts) */
let noticeApp = 0;
function appMissed(): void {
  clearTimeout(noticeApp);
  noticeApp = window.setTimeout(() => { noticeApp = 0; render(); }, 9000);
  render();
}
let quiet = false;
/** Share's word beside its key: "Copied", and "Long link" past `LONG_LINK` */
let shared: { name: Name; long: boolean; timer: number } | null = null;
/**
 * a playlist link opened this page (`open`: the panel opens on it), or a first run put the first featured playlist's
 * first track on the address (it does not): where it is and the track the address holds, for `startPlaylists`
 */
let fromLink: { name: Name; index: number; open: boolean } | null = null;
const section = document.getElementById('libPlaylists') as HTMLElement | null;
const label = document.getElementById('nowList') as HTMLButtonElement | null;

// --- small things -----------------------------------------------------------

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/**
 * **A featured playlist's name in the page** (featured, 10-23): its id behind a mark no typed name begins with (U+E000,
 * a private-use character), so it never meets one of yours, in the views, the attributes and the place the store
 * keeps (an older edition finds no playlist of that name and resumes none).
 */
const FEAT = '\uE000';
const featKey = (id: string): string => `${FEAT}${id}`;
const isFeat = (n: Name): n is string => n !== null && n.startsWith(FEAT);
const featOf = (n: Name): Featured | undefined => (isFeat(n) ? featuredById(n.slice(FEAT.length)) : undefined);
/** each featured playlist as the record's shape, made once: it is never written */
const FEAT_LISTS = new Map<string, Playlist>(FEATURED.map((f) => [featKey(f.id), { id: f.id, name: f.name, tracks: featuredTracks(f) }]));
/**
 * **The line over the featured section while you have no playlist** (featured, 10-23; his review): a loved track
 * starts your own.
 */
const YOURS_FIRST = 'Love a track to start your own';
const shownName = (n: Name) => featOf(n)?.name ?? n ?? SAVED;
const keyOf = (n: Name) => n ?? '';
const say = (text: string) => { const el = document.getElementById('say'); if (el) el.textContent = text; };
/** Your playlists, in the order you keep them (`inOrder`, pl-order). */
const liveLists = (): Playlist[] => inOrder(doc);
/** A playlist by its name in the page: one of yours (`null`, Saved), or a featured one (`featKey`). */
const listOf = (n: Name): Playlist | undefined => (isFeat(n) ? FEAT_LISTS.get(n) : playlistOf(doc, n));
const linksOf = (n: Name) => tracksOf(listOf(n)).map((t) => t.link);

function linkParts(link: string) {
  const q = new URLSearchParams(normaliseLink(link).link);
  return { q, seed: q.get('seed') ?? '?', theme: Math.max(0, Number(q.get('theme') ?? 1) - 1) || 0 };
}
/** A track's words: its label, or "Theme IV · seed 27191". */
function titleOf(t: Track): string {
  if (t.label) return t.label;
  const { seed, theme } = linkParts(t.link);
  return `Theme ${romanNumeral(theme + 1)} · seed ${seed}`;
}
const genreSafe = (link: string) => { try { return genreOf(link).name; } catch (e) { return ''; } };
const colourSafe = (link: string) => { try { return colourOf(link); } catch (e) { return 'var(--gold)'; } };

/**
 * **A playlist's constellation, in a slot of its own** (his word 10-23: "at least we assume some kind of fixed width of
 * the star map thumbnail"): a box the stylesheet sizes for each place and density (`.skySlot`, index.html), there from
 * the first paint whether or not the drawing is, so the words beside it never move; the drawing fills it. An empty
 * ring where the playlist has no stars yet; an empty box where the drawing fails.
 */
function sky(links: readonly string[], px: number, h = px, cls = ''): string {
  return `<span class="skySlot${cls ? ` ${cls}` : ''}" aria-hidden="true">${drawSky(links, px, h)}</span>`;
}
/**
 * **Each drawing once** (pl-sky, 10-23): kept by what it is drawn from (the links in order, which carry each star's
 * place and ink, and the size), the most recently used kept, at most `SKIES_MAX`, so a re-render (every change of the
 * record or the transport) copies a string instead of working the stars out again.
 */
const SKIES = new Map<string, string>();
const SKIES_MAX = 48;
function drawSky(links: readonly string[], px: number, h: number): string {
  if (!links.length) return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 4}" fill="none" stroke="currentColor" stroke-dasharray="2 3" opacity="0.5"/></svg>`;
  const k = `${px}x${h}\n${links.join('\n')}`;
  const hit = SKIES.get(k);
  if (hit !== undefined) { SKIES.delete(k); SKIES.set(k, hit); return hit; }
  let svg: string;
  try { svg = constellationOf(links, px, h); } catch (e) { return ''; }
  SKIES.set(k, svg);
  if (SKIES.size > SKIES_MAX) SKIES.delete(SKIES.keys().next().value!);
  return svg;
}
/**
 * **Warmed in an idle slot after the page starts**: the drawings the page has not needed yet (a playlist's own page,
 * the throne's menu, the line under the ring), so the first of each draws from the store. The rows' are drawn by the
 * first render.
 */
function warmSkies(): void {
  const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  const later = (fn: () => void) => (typeof ric === 'function' ? ric(fn, { timeout: 2000 }) : setTimeout(fn, 200));
  const lists = [...liveLists().slice(0, 12), ...FEAT_LISTS.values()].map((p) => tracksOf(p).map((t) => t.link)).filter((l) => l.length);
  const work = () => {
    const links = lists.shift();
    if (!links) return;
    drawSky(links, 52, 52);
    drawSky(links, 16, 16);
    later(work);
  };
  later(work);
}

// --- time, lazily (a full plan a link: asked in idle slots, kept by sky.ts) --

interface Time { clock: string; minutes: number }
/** a link's time as planned this session */
const known = new Map<string, Time>();
const queue: string[] = [];
let queued = false;
/** a link's time as it reads, planned now or kept from before (`kept`); null while it is neither */
const timeKnown = (link: string): Time | undefined => known.get(link) ?? kept.get(link);
function timeText(link: string): string | null {
  const k = known.get(link);
  if (k) return k.clock;
  if (!queue.includes(link)) queue.push(link);
  runTimes();
  return kept.get(link)?.clock ?? null;
}
/**
 * **Times kept from the last session** (pl-sky, 10-23): the first opening of the panel planned every row's tracks one
 * by one, 1.8 s (WebKit) to 2.9 s (Chromium at a sixth of the speed) for 23 tracks, and each row's stats stepped
 * 43 px right as its time joined ("6 tracks", then "38 m · 6 tracks"). So the times planned are kept in local storage
 * for the version that planned them and shown at once; each is still planned again in its turn (what plays decides,
 * never what was kept), and only one that differs moves. At most `KEPT_MAX` links, the most recently planned.
 */
const TIMES_KEY = 'deephouse.times';
const KEPT_MAX = 400;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const kept = ((): Map<string, Time> => {
  const m = new Map<string, Time>();
  try {
    const o = JSON.parse(localStorage.getItem(TIMES_KEY) ?? 'null') as { v?: string; t?: Record<string, [number, string]> } | null;
    if (o && o.v === VERSION && o.t) for (const [l, x] of Object.entries(o.t)) if (Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string') m.set(l, { minutes: x[0], clock: x[1] });
  } catch (e) { /* nothing kept */ }
  return m;
})();
let keepTimer = 0;
function keepTimes(): void {
  clearTimeout(keepTimer);
  keepTimer = window.setTimeout(() => {
    const all = new Map(kept);
    for (const [l, t] of known) { all.delete(l); all.set(l, t); }
    const t: Record<string, [number, string]> = {};
    for (const [l, x] of [...all].slice(-KEPT_MAX)) t[l] = [Math.round(x.minutes * 1000) / 1000, x.clock];
    try { localStorage.setItem(TIMES_KEY, JSON.stringify({ v: VERSION, t })); } catch (e) { /* nothing kept */ }
  }, 1000);
}
/**
 * **Times are planned only while they can be seen** (the review of 10-21, F7): the panel open on Playlists. Each is
 * a whole plan on the page's thread, so with the panel closed or on another tab the queue waits, and `seamTick` starts
 * it again within a second of the tab showing. The calculation is the same; moving it to the plan worker is later.
 */
const timesShown = (): boolean => !!section && libraryOpen() && !section.closest('[hidden]');
function runTimes(): void {
  if (queued || !queue.length || !timesShown()) return;
  queued = true;
  const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  const later = (fn: () => void) => (typeof ric === 'function' ? ric(fn, { timeout: 400 }) : setTimeout(fn, 30));
  const work = () => {
    if (!timesShown()) { queued = false; return; }
    const l = queue.shift();
    if (l) {
      const t = timeOf(l);
      const now = { clock: t ? t.clock : '', minutes: t?.minutes ?? 0 };
      const was = kept.get(l);
      known.set(l, now);
      if (!was || was.clock !== now.clock || Math.round(was.minutes * 1000) !== Math.round(now.minutes * 1000)) paintTimes();
      keepTimes();
    }
    if (queue.length) later(work); else queued = false;
  };
  later(work);
}
/** Repeat is said only where it applies (his word 10-20): on the current or playing playlist. */
const modeOf = (n: Name) => (playing && playing.name === n ? ' · Repeat' : '');
/**
 * **A playlist's stats, one plain string** (his word 10-20: "let's do strings"), the count first as music apps say it
 * (featured, 10-23: "5 tracks · 39 m"): "6 tracks · 46 m", "4 tracks · 2 h 44 m" past the hour, and "· Repeat" on the
 * current playlist. The count is known from the first paint and the time joins at the end once every track is planned,
 * so nothing before it moves (it replaced pl-sky's slot as wide as "8 h 88 m", which left a gap in every row). Only
 * "· Repeat" after it may step once, the first time the time arrives on a first-ever launch. A playlist with no tracks
 * has no time. The row and the playlist's page head say the same.
 */
function totalCols(n: Name): string {
  const links = linksOf(n);
  let sum = 0, all = true;
  for (const l of links) { const t = timeText(l); if (t === null) all = false; else sum += timeKnown(l)?.minutes ?? 0; }
  const m = Math.round(sum);
  const time = links.length && all ? ` · ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`}` : '';
  return `${links.length} track${links.length === 1 ? '' : 's'}${time}${esc(modeOf(n))}`;
}
/**
 * **The playing mark** (his review 10-20): three level bars after the name, moving with the set's own beat (`levelTick`);
 * still and dimmer on the current playlist or track while paused or stopped, and still under reduced motion. One
 * component for the overview's playlist row and the playlist page's track row (his word 10-20: "our own standard").
 */
const levelMark = (live: boolean) => `<svg class="plLevel${live ? '' : ' still'}" viewBox="0 0 12 12" aria-hidden="true">${[2, 6, 10].map((x, i) => `<rect x="${x - 1}" y="${[5, 2, 7][i]}" width="2" height="${[7, 10, 5][i]}" rx="0.6"/>`).join('')}</svg>`;
let levelFrame = 0;
function levelTick(): void {
  levelFrame = 0;
  const bars = section && libraryOpen() && !reducedMotion.on ? section.querySelectorAll<SVGRectElement>('.plLevel:not(.still) rect') : null;
  if (!bars || !bars.length) return;
  // **a calm level meter** (his note 10-20, "too fast"): each bar steps at most once a beat, easing over 80 % of it,
  // to a height between 35 and 100 %; bar one on beats one and three, bar two on two and four, bar three once a bar;
  // above 130 BPM on half notes. All of it off the set's own clock, so it never runs free.
  const r = deps.control.readout() as { seconds?: number; beat?: number; gridBpm?: number } | null;
  const spb = r?.beat && r.beat > 0 ? r.beat : 0.5, B = (r?.seconds ?? 0) / spb, unit = (r?.gridBpm ?? 0) > 130 ? 2 : 1;
  const level = (i: number, k: number) => { const x = Math.sin(k * 12.9898 + i * 78.233) * 43758.5453; return 0.35 + 0.65 * (x - Math.floor(x)); };
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  bars.forEach((b, i) => {
    const period = [2, 2, 4][i] * unit, offset = [0, 1, 0][i] * unit;
    const at = (B - offset) / period, k = Math.floor(at);
    const t = Math.min(1, ((at - k) * period) / (0.8 * unit));
    const from = level(i, k - 1), to = level(i, k), h = 10 * (from + (to - from) * ease(t));
    b.setAttribute('y', (11 - h).toFixed(2));
    b.setAttribute('height', h.toFixed(2));
  });
  levelFrame = requestAnimationFrame(levelTick);
}
function paintTimes(): void {
  if (!section) return;
  for (const el of section.querySelectorAll<HTMLElement>('[data-time]')) { const t = timeKnown(el.dataset.time!); if (t !== undefined) el.textContent = t.clock; }
  for (const el of document.querySelectorAll<HTMLElement>('[data-total]')) el.innerHTML = totalCols(dec(el.dataset.total));
  for (const el of document.querySelectorAll<HTMLElement>('[data-cols]')) el.innerHTML = totalCols(dec(el.dataset.cols));
}
/** A playlist's name in an attribute: `s` for Saved, `n:` and the name for a named one. */
const enc = (n: Name) => esc(n === null ? 's' : `n:${n}`);
const dec = (v: string | undefined): Name => (v === undefined || v === 's' ? null : v.slice(2));
const totalAttr = enc;

// --- icon keys (his review 10-20: icon buttons, compact) --------------------
/** Line-work glyphs on a 16-unit square, in the ring's colour. */
const GLYPH: Record<string, string> = {
  download: '<path d="M8 2.5 V9.6 M5.2 6.9 L8 9.7 L10.8 6.9"/><path d="M2.6 10 V13.2 H13.4 V10"/>',
  open: '<path d="M8 10.2 V3 M5.2 5.6 L8 2.8 L10.8 5.6"/><path d="M2.6 10 V13.2 H13.4 V10"/>',
  backup: '<rect x="2.4" y="3" width="11.2" height="3.2" rx="0.6"/><path d="M3.4 6.2 V13.2 H12.6 V6.2 M6.4 8.8 H9.6"/>',
  plus: '<path d="M8 3 V13 M3 8 H13"/>',
  link: '<path d="M6.8 9.2 L9.2 6.8"/><path d="M7.4 4.6 L8.6 3.4 A2.5 2.5 0 0 1 12.6 7.4 L11.4 8.6"/><path d="M8.6 11.4 L7.4 12.6 A2.5 2.5 0 0 1 3.4 8.6 L4.6 7.4"/>',
  time: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.8 V8 L10.2 9.4"/>',
  up: '<path d="M8 13 V3.2 M4.6 6.6 L8 3.2 L11.4 6.6"/>',
  down: '<path d="M8 3 V12.8 M4.6 9.4 L8 12.8 L11.4 9.4"/>',
  remove: '<path d="M4 4 L12 12 M12 4 L4 12"/>',
  check: '<path d="M3.4 8.4 L6.6 11.6 L12.8 4.6"/>',
  replace: '<path d="M3 6 H12 M9.4 3.4 L12 6 L9.4 8.6"/><path d="M13 10 H4 M6.6 7.4 L4 10 L6.6 12.6"/>',
};
const glyph = (name: string) => `<svg class="plGlyph" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${GLYPH[name]}</svg>`;
/** **An icon key**: the glyph, its words as its label and title, and one short word beside it where that helps. */
function key(act: string, name: string, label: string, word = '', extra = ''): string {
  return `<button type="button" class="plIcon${word ? ' plWord' : ''}"${act ? ` data-act="${act}" data-focus="${act}"` : ''} aria-label="${esc(label)}" title="${esc(label)}"${extra}>${glyph(name)}${word ? `<span>${esc(word)}</span>` : ''}</button>`;
}
const plFoot = document.getElementById('plFoot');
/**
 * **Esc closes the ⋯ menu first** (its Move to… level back to the top), then a track's label being renamed, and
 * only then the panel: true where it closed something here.
 */
export function closeMenu(): boolean {
  if (shareMenu) { closeShareMenu(true); return true; }
  if (menu) {
    const back = menu.level !== 'top' ? { ...menu, level: 'top' as const } : null;
    const opener = menu.anchor;
    menu = back;
    render();
    if (!back) section?.querySelector<HTMLElement>(`[data-focus="${opener}"]`)?.focus();
    else focusMenu();
    return true;
  }
  if (renaming !== null) { renaming = null; drafts.delete('label'); render(); return true; }
  if (renamingList) { renamingList = false; drafts.delete('rename'); render(); section?.querySelector<HTMLElement>('[data-focus="menu"]')?.focus(); return true; }
  // a new playlist's name: Esc with nothing typed cancels it, and with a name keeps it
  if (naming === 'new') { naming = null; drafts.delete('newName'); render(); return true; }
  return false;
}

// --- the record -------------------------------------------------------------

/** Write the library; a refusal (a full quota) is said, never swallowed. */
function commit(next: LibraryDoc, opts: { undoText?: string; silent?: boolean } = {}): boolean {
  if (next === doc) return true;
  const was = doc;
  quiet = !!opts.silent;
  const w = store.write(next);
  quiet = false;
  if (!w.ok) { notice = w.message; say(w.message); render(); return false; }
  doc = next;
  if (opts.undoText) {
    if (undo) clearTimeout(undo.timer);
    undo = { text: opts.undoText, doc: was, timer: window.setTimeout(() => { undo = null; render(); }, 9000) };
  } else if (undo) {
    // **any later write ends the Undo** (the test round, 10-21): a throne save, a drag, a rename or a new playlist
    // made after a removal would be wiped by restoring the snapshot taken before them
    clearTimeout(undo.timer);
    undo = null;
  }
  if (!opts.silent) render();
  return true;
}
/** An edit that may refuse with a sentence: said in the panel. */
function edit(fn: () => LibraryDoc, opts: { undoText?: string; silent?: boolean } = {}): boolean {
  try { return commit(fn(), opts); } catch (e) {
    if (e instanceof PlaylistError) { notice = e.message; render(); return false; }
    throw e;
  }
}

// --- the share circle (his word 10-21) -------------------------------------------

/**
 * **The share circle** beside the machine key: the ⋯ menus' small menu, placed as they are (`placeAt`), with
 * **Copy link** (the playing sound's link as the address shows it, `ringLink`), **Copy at m:ss** (with `t` at the
 * transport's second, its time running while the menu is open: the machine view's COPY AT, moved here) and, in the
 * app, **Share…** (the system's share sheet). A copy reads "Copied" a moment, then the menu closes. Esc, a press
 * outside or the circle again close it.
 */
let shareMenu: HTMLElement | null = null;
let shareTick = 0;
const shareCircle = () => document.getElementById('panelShare');
function openShareMenu(): void {
  const k = shareCircle(), panel = document.getElementById('library');
  if (!k || !panel || !deps) return;
  closeShareMenu(false);
  const m = document.createElement('div');
  m.className = 'plMenu shareMenu';
  m.setAttribute('role', 'menu');
  m.dataset.by = menuBy;
  m.setAttribute('aria-label', 'Share');
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  // the system's share sheet in the iPhone and iPad app; the Mac app's web view has none that answers (his report 10-21)
  const native = !!window.deepHouseShell && (window.deepHouseShell as { platform?: string }).platform !== 'macos';
  m.innerHTML = '<button type="button" role="menuitem" tabindex="-1" data-share="link">Copy link</button>'
    + '<button type="button" role="menuitem" tabindex="-1" data-share="at"></button>'
    + (native ? '<button type="button" role="menuitem" tabindex="-1" data-share="native">Share…</button>' : '')
    + (appleDevice() ? '<button type="button" role="menuitem" tabindex="-1" data-share="app">Open in app</button>' : '');
  k.after(m);
  shareMenu = m;
  k.setAttribute('aria-expanded', 'true');
  const at = m.querySelector<HTMLElement>('[data-share="at"]')!;
  const seconds = () => { const r = deps.control.readout() as { seconds?: number } | null; return Math.floor(r?.seconds ?? 0); };
  // the track's own rows only (`cleanLink`): the address where it names a track, else the ring's own link
  const base = pageBase();
  const timed = () => { const w = deps.control.link.withTime(); return cleanLink(new URL(w).search, base, true) ?? w; };
  const plain = () => cleanLink(location.search, base) ?? cleanLink(new URL(deps.control.link.withTime()).search, base) ?? base;
  const paint = () => { if (!at.dataset.done) at.textContent = `Copy at ${clock(seconds())}`; };
  paint();
  shareTick = window.setInterval(paint, 250);
  fitShareMenu();
  m.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  const copied = (b: HTMLElement) => {
    b.dataset.done = '1';
    b.textContent = 'Copied';
    say('Copied');
    window.setTimeout(() => { if (shareMenu === m) closeShareMenu(true); }, 900);
  };
  m.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-share]');
    if (!b || b.dataset.done) return;
    if (b.dataset.share === 'link') {
      const link = plain();
      void copyText(link).then((ok) => { if (!ok) return; note('transport', 'link copied', { link }); copied(b); });
    } else if (b.dataset.share === 'app') {
      closeShareMenu(true);
      openInApp(new URL(plain()).search, appMissed);
    } else if (b.dataset.share === 'at') {
      const link = timed();
      const t = Number(new URL(link).searchParams.get('t') ?? seconds());
      void copyText(link).then((ok) => { if (!ok) return; note('transport', `link copied at ${clock(t)}`, { link, t }); copied(b); });
    } else {
      closeShareMenu(true);
      // the app's own sheet (AirDrop, Messages); the web view's share as a fallback
      if (!shellShareLink(plain())) nav.share?.({ url: plain() }).catch(() => { /* dismissed */ });
    }
  });
  m.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const l = [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')], i = l.indexOf(document.activeElement as HTMLElement);
    l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]?.focus();
  });
}
function fitShareMenu(): void {
  const k = shareCircle(), panel = document.getElementById('library');
  if (!shareMenu || !k || !panel) return;
  for (const s of ['position', 'top', 'left', 'right', 'bottom', 'maxHeight', 'maxWidth'] as const) shareMenu.style[s] = '';
  if (document.documentElement.dataset.panelMode !== 'mini') placeAt(shareMenu, k, panel);
}
function closeShareMenu(focusKey: boolean): void {
  if (!shareMenu) return;
  clearInterval(shareTick);
  shareMenu.remove();
  shareMenu = null;
  const k = shareCircle();
  k?.setAttribute('aria-expanded', 'false');
  if (focusKey) k?.focus({ preventScroll: true });
}
document.getElementById('panelShare')?.addEventListener('click', () => { if (shareMenu) closeShareMenu(true); else openShareMenu(); });
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Node;
  if (shareMenu && !shareMenu.contains(t) && !shareCircle()?.contains(t)) closeShareMenu(false);
}, true);

// --- the throne -------------------------------------------------------------

/**
 * **A press of the throne**: what plays goes into Saved, on top, never doubled, and the panel stays as it is.
 * `release` lifts the pressed throne: at once, or, where a menu asks which playlist, when that menu closes.
 */
export function pressThrone(release: () => void = () => {}): void {
  if (!deps) { release(); return; }
  // a second press closes the menu without saving, as does the press outside that just closed it
  if (throneMenu) { closeThroneMenu(); release(); return; }
  if (performance.now() - throneMenuClosed < 450) { release(); return; }
  // **where it goes** (his word 10-20, no default): none, Saved is made; one, into it; more, a menu asks
  const link = deps.control.linkPlaying();
  const t = saveTarget(doc);
  if (t.kind === 'pick') { openThroneMenu(t.names, link); throneRelease = release; return; }
  release();
  saveInto(t.kind === 'one' ? t.name : undefined, link);
}
/** Save `link` into a playlist (none named: where `saveTarget` says), never doubled, then the save's motion. */
function saveInto(name: string | undefined, link: string): boolean {
  if (name !== undefined && indexOfSound(linksOf(name), link) >= 0) { say('Already there'); return false; }
  if (!edit(() => saveTrack(doc, link, Date.now(), undefined, name))) return false;
  say('Saved');
  saveMotion();
  return true;
}

/**
 * **Is what plays saved** (star-keys): its sound in any playlist, the library's own match, the same reading the lock
 * screen's Save gives the shell (`lockSaved`, shell-library.ts). The heart is filled while it is.
 */
function savedNow(): boolean {
  if (!deps) return false;
  const link = deps.control.linkPlaying();
  return liveLists().some((p) => indexOfSound(tracksOf(p).map((t) => t.link), link) >= 0);
}
/**
 * **The scroll's stars in the playlists' colours** (his review 10-22): one per playlist, the colour its
 * constellation's first star is drawn in (`colourOf`, the Map tab's and the rows' own source), in the library's
 * order; with no playlist holding a track, the featured playlists' (featured, 10-23: they took the example sky's place).
 */
function paintScroll(): void {
  const lists = liveLists().map((p) => tracksOf(p)).filter((t) => t.length);
  scrollInks(lists.length ? lists.map((t) => colourSafe(t[0].link)) : FEATURED.map((f) => colourSafe(f.links[0])));
}
function paintLoved(): void {
  if (!deps) return;
  try { deps.loved(savedNow()); } catch (e) { /* a link the page cannot read is not saved */ }
}

// --- the throne's menu: which playlist (his word 10-20) -------------------------

let throneMenu: HTMLElement | null = null;
let throneMenuClosed = 0;
/** the pressed throne's lift, held while its menu is open (his word 10-21) */
let throneRelease: (() => void) | null = null;
/**
 * **The throne's menu**: the playlists, the most recently modified first (`byRecent`), each its small constellation
 * and its name, anchored under the throne. The first row has the focus, so a press and Enter saves to the most
 * recent; arrows move, Esc, a press outside or a second throne press close it without saving. It is the ⋯ menus'
 * component and look, about six rows tall before it scrolls.
 */
function openThroneMenu(names: string[], link: string): void {
  closeThroneMenu();
  const m = document.createElement('div');
  m.id = 'throneMenu';
  m.className = 'plMenu thMenu';
  m.setAttribute('role', 'menu');
  m.dataset.by = menuBy;
  m.setAttribute('aria-label', 'Save to');
  m.innerHTML = names.map((n) => `<button type="button" role="menuitem" tabindex="-1" data-name="${esc(n)}">${sky(linksOf(n), 16)}<span>${esc(n)}</span></button>`).join('');
  document.body.append(m);
  throneMenu = m;
  // under the throne, centred on it, kept inside the window (the mini player's may cover the ring)
  const t = deps.throne()?.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  const x = t ? t.left + t.width / 2 - w / 2 : (vw - w) / 2, y = t ? t.bottom + 6 : 40;
  m.style.left = `${Math.max(6, Math.min(vw - w - 6, x)).toFixed(1)}px`;
  m.style.top = `${Math.max(6, Math.min(vh - h - 6, y)).toFixed(1)}px`;
  const items = () => [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  items()[0]?.focus({ preventScroll: true });
  m.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-name]');
    if (!b) return;
    const name = b.dataset.name!;
    if (indexOfSound(linksOf(name), link) >= 0) {
      // already there: said in the menu a moment, nothing doubled
      m.innerHTML = '<p class="thNote" role="status">Already there</p>';
      say('Already there');
      window.setTimeout(closeThroneMenu, 900);
      return;
    }
    closeThroneMenu();
    saveInto(name, link);
  });
  m.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeThroneMenu(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const l = items(), i = l.indexOf(document.activeElement as HTMLElement);
    l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]?.focus();
  });
}
function closeThroneMenu(): void {
  if (!throneMenu) return;
  throneMenu.remove();
  throneMenu = null;
  throneMenuClosed = performance.now();
  const release = throneRelease;
  throneRelease = null;
  release?.();
  (deps.throne() as HTMLElement | SVGElement | null)?.focus?.({ preventScroll: true });
}
// a press anywhere outside the menu closes it, without saving
document.addEventListener('pointerdown', (e) => { if (throneMenu && !throneMenu.contains(e.target as Node)) closeThroneMenu(); }, true);

let dotTimer = 0;
function saveMotion(): void {
  const throne = deps.throne();
  // the plus's dot fills as the imprint lifts off, a star added to the map, and stays full for one beat of the set's
  // clock (half a second while nothing plays); no fade
  if (throne) {
    const r = deps.control.readout() as { beat?: number; playing?: boolean } | null;
    const beatMs = r?.playing && r.beat && r.beat > 0 ? r.beat * 1000 : 500;
    clearTimeout(dotTimer);
    throne.classList.add('saved');
    dotTimer = window.setTimeout(() => throne.classList.remove('saved'), beatMs);
  }
  if (libraryOpen()) return;
  const gyro = document.getElementById('gyro');
  const im = reducedMotion.on || !gyro || typeof document.body.animate !== 'function' ? null : deps.imprint();
  if (!im || !gyro || im.box.width < 4) { gyroSpin(); return; }
  // **a disc lifted off the instrument** (his word 10-21: "not slide into toilet, but a lift, flip and move via
  // slightly curved trajectory while flipping and landing on gyroscope"): a copy of the ring's imprint rises toward the
  // viewer, turns over once along a shallow arc that bows up and over the straight line, shrinking to the key, and
  // is set down flat on the gyroscope, firm and without overshoot; then the gyroscope turns
  const { svg, box } = im;
  const fly = document.createElement('div');
  fly.className = 'imprintFly';
  fly.setAttribute('aria-hidden', 'true');
  Object.assign(fly.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, perspective: `${(box.width * 3.2).toFixed(0)}px` });
  const face = document.createElement('div');
  face.className = 'imprintFace';
  face.append(svg);
  fly.append(face);
  document.body.append(fly);
  const g = gyro.getBoundingClientRect();
  const dx = g.left + g.width / 2 - (box.left + box.width / 2), dy = g.top + g.height / 2 - (box.top + box.height / 2);
  const k = (g.width * 0.7) / box.width;
  // about 1.4 s; while a set plays, whole beats between 1.2 and 1.8 s, so it lands on one
  const r = deps.control.readout() as { beat?: number; playing?: boolean } | null;
  let T = 1400;
  if (r?.playing && r.beat && r.beat > 0) {
    const n = Math.round(1.4 / r.beat);
    for (const m of [n, n + 1, n - 1]) if (m > 0 && m * r.beat >= 1.2 && m * r.beat <= 1.8) { T = m * r.beat * 1000; break; }
  }
  // the lift (to 0.16), the flight along the arc (to 0.9), the set-down (to 1)
  const LIFT = 0.16, LAND = 0.9, up = -Math.min(22, box.height * 0.05);
  const len = Math.hypot(dx, dy - up) || 1;
  // the bow: a fifth of the way across, to the side that is up (to the right where the line runs straight down)
  let nx = -(dy - up) / len, ny = dx / len;
  if (ny > 0 || (Math.abs(ny) < 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
  const bow = 0.2 * len, cx = dx / 2 + nx * bow, cy = (up + dy) / 2 + ny * bow;
  const io = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const moves: Keyframe[] = [], turns: Keyframe[] = [];
  moves.push({ offset: 0, transform: 'translate(0px, 0px) scale(1)', opacity: 0.92 });
  turns.push({ offset: 0, transform: 'rotateX(0deg) rotateY(0deg)' });
  moves.push({ offset: LIFT, transform: `translate(0px, ${up.toFixed(1)}px) scale(1.04)`, opacity: 1 });
  turns.push({ offset: LIFT, transform: 'rotateX(14deg) rotateY(0deg)' });
  const N = 22;
  for (let i = 1; i <= N; i++) {
    const u = i / N, s = io(u), o = LIFT + (LAND - LIFT) * u;
    const x = 2 * (1 - s) * s * cx + s * s * dx, y = (1 - s) * (1 - s) * up + 2 * (1 - s) * s * cy + s * s * dy;
    const sc = 1.04 + (k * 1.08 - 1.04) * s;
    moves.push({ offset: o, transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(4)})`, opacity: 1 });
    // the turn spread over the whole flight, the lean toward the viewer easing out as it nears the key
    turns.push({ offset: o, transform: `rotateX(${(14 * (1 - s)).toFixed(1)}deg) rotateY(${(360 * s).toFixed(1)}deg)` });
  }
  // set down: the last fall onto the key, quickening into a firm stop
  moves.push({ offset: 1, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(4)})`, opacity: 0.95, easing: 'linear' });
  turns.push({ offset: 1, transform: 'rotateX(0deg) rotateY(360deg)' });
  moves[moves.length - 2].easing = 'cubic-bezier(0.55, 0, 1, 1)';
  moves[0].easing = 'cubic-bezier(0.25, 0, 0.3, 1)';
  const a = fly.animate(moves, { duration: T, fill: 'forwards' });
  face.animate(turns, { duration: T, fill: 'forwards' });
  a.onfinish = () => { fly.remove(); gyroSpin(); };
  a.oncancel = () => fly.remove();
}

/**
 * The throne's one hint: after the first minute of listening it is pressed a little, twice, as by an unseen finger,
 * then never again (his word 10-21: a physical object can't blink or disappear). Nobody who has saved anything is
 * told: a library with a track in it, or a playlist playing, means the throne is known.
 */
let listened = 0;
function pulseTick(): void {
  if (!deps.control.playing) return;
  if (++listened < 60 || listened > 61) return;
  if (playing || liveLists().some((p) => tracksOf(p).length)) return;
  let done = false;
  try { done = localStorage.getItem(PULSE_KEY) === 'pulsed'; } catch (e) { done = true; }
  if (done) return;
  try { localStorage.setItem(PULSE_KEY, 'pulsed'); } catch (e) { /* blocked: it pulses this once anyway */ }
  deps.throne()?.classList.add('pulse');
}

// --- playing a playlist -------------------------------------------------------

/**
 * **The step on its way** (the review of 10-21, F1): the place a playing set was asked to leave, and the
 * furthest second of it heard since. Set only when a step is asked of a playing set; stopped, a track starts at once and nothing is on its way.
 * Cleared on arrival: another place heard, or the same one begun again (a one-track playlist repeating, a row pressed
 * on what plays). The place is the whole sound (`placeHeard`): two tracks differing only by their birds differ.
 */
let asked: { from: string; at: number } | null = null;
let lastRecord = '';
const recordKey = () => deps.control.placeHeard;

/** A track this edition can play: one whose engine it lacks reads "Needs a newer version". */
const playable = (link: string) => normaliseLink(link).ok;
/** The first track from `i` this edition plays, stepping `d` (-1 where none). */
function playableFrom(links: readonly string[], i: number, d: number): number {
  for (let k = 0, at = stepIndex(i, links.length, 0); k < links.length; k++, at = stepIndex(at, links.length, d)) if (playable(links[at])) return at;
  return -1;
}
/**
 * Play a playlist's track `i` (a row, Play, a step, the seam). A track this edition can't play is passed over in
 * the step's direction (`d`); a row pressed on one (`d` 0) says so.
 */
function playAt(name: Name, i: number, kind: 'cast' | 'skip' | 'back' = 'cast', d = 1): boolean {
  const links = linksOf(name);
  if (!links.length) return false;
  const at = d ? playableFrom(links, i, d) : stepIndex(i, links.length, 0);
  if (at < 0 || !playable(links[at])) { notice = 'Needs a newer version'; render(); return false; }
  const c = deps.control, from = recordKey(), was = c.state.position, mixing = !!c.state.mix;
  const ok = c.playPlace(links[at], kind);
  if (!ok) { notice = 'Can’t play this link'; render(); return false; }
  playing = { name, index: at };
  // playing, the track is on its way to the seam; stopped, it is already where the set is
  if (mixing) asked = { from, at: was };
  else { asked = null; lastRecord = recordKey(); }
  deps.control.remember();
  render();
  return true;
}
function step(d: number, kind: 'skip' | 'back' | 'cast'): boolean {
  if (!playing) return false;
  const n = linksOf(playing.name).length;
  if (!n || !listOf(playing.name)) { leave(); return false; }
  return playAt(playing.name, stepIndex(playing.index, n, d), kind, d < 0 ? -1 : 1);
}
/**
 * **Leaving the playlist** (the dice, a typed seed, the reset, a genre star, a bird let go, another engine: the
 * transport's one door for each, `control.ts`): the label under the ring and the marks go, the seam no longer steers
 * (`seamTick` asks nothing), prev and next walk the set, and the store forgets the place. Coming back is a row's press.
 */
function leave(): void {
  if (!playing) return;
  playing = null;
  asked = null;
  deps.control.remember();
  render();
}

/** Once a second: the next track at the seam, and a seam the set took on its own (a hidden tab) put right. */
/** **Sounding**: the transport's own state, as the ring's play key reads it (a start under way counts). */
const sounding = (): boolean => !!deps && (deps.control.playing || deps.control.state.starting);
let wasSounding = false;
/** The playing marks follow the transport: a play, a pause from anywhere, a stop. */
function soundingChanged(): void {
  const now = sounding();
  if (now === wasSounding) return;
  wasSounding = now;
  render();
}
function seamTick(): void {
  pulseTick();
  paintLoved();
  runTimes();
  // the level bars wake when the panel opens again on a playing row
  if (!levelFrame) levelFrame = requestAnimationFrame(levelTick);
  soundingChanged();
  if (!playing) return;
  const c = deps.control, s = c.state;
  const rec = recordKey();
  if (rec !== lastRecord) {
    const [seed0, theme0] = lastRecord.split('|');
    // the set's own next theme, taken while nothing asked: the playlist's next instead, at once
    if (lastRecord && !asked && s.seed === seed0 && s.themeIndex === Number(theme0) + 1 && c.playing) {
      lastRecord = rec;
      step(1, 'cast');
      return;
    }
    lastRecord = rec;
    render();
  }
  // arrived: another place heard, or the needle back at the start of the same one; `at` follows the needle forward
  if (asked && (rec !== asked.from || s.position < asked.at - 1)) asked = null;
  else if (asked) asked.at = Math.max(asked.at, s.position);
  if (!c.playing || s.starting || s.castTo !== null || asked) return;
  if (!seamDue(s.position, c.seamAt)) return;
  // **A one-track playlist**: the transport never hands over into the place it is at, so nothing is asked here; the
  // set's own next theme comes, and the step above brings the track back at once
  const links = linksOf(playing.name);
  if (playableFrom(links, stepIndex(playing.index, links.length, 1), 1) === playing.index) return;
  step(1, 'cast');
}

// --- files ------------------------------------------------------------------

/** **A download** on the web; in the Apple app, the share sheet or the save panel (`shell-library.ts`). */
function download(f: FileOut): void {
  if (shellSave(f)) return;
  const url = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
let picker: HTMLInputElement | null = null;
function pickFile(): void {
  if (shellPick()) return;
  if (!picker) {
    picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.deephouse,.json,application/json';
    picker.hidden = true;
    picker.addEventListener('change', () => { const f = picker!.files?.[0]; if (f) void openFile(f); picker!.value = ''; });
    document.body.append(picker);
  }
  picker.click();
}
async function openFile(f: File): Promise<void> {
  let text = '';
  try { text = await f.text(); } catch (e) { notice = 'Can’t read this file'; openLibrary('playlists'); render(); return; }
  const r = readDeephouseFile(text);
  if (r.error !== undefined) { notice = r.error; view = { kind: 'overview' }; render(); openLibrary('playlists'); return; }
  if (r.kind === 'library') {
    const sum = backupSummary(doc, r.doc, r.bad);
    view = { kind: 'askBackup', file: r.doc, text: sum.text, removed: sum.removed.map((x) => `${x.label ?? titleOf({ link: x.link })} · ${shownName(x.playlist)}`) };
  } else {
    const sum = playlistFileSummary(doc, r.doc);
    if (sum.exists) view = { kind: 'askFile', file: r.doc, text: sum.text, keepBoth: sum.keepBoth, name: sum.name };
    else { addFile(r.doc, 'add', sum.name); return; }
  }
  render();
  openLibrary('playlists');
}
/** One playlist from a file: added (or kept both, or replacing), played, and the panel open on it. */
function addFile(file: LibraryDoc, how: 'add' | 'keep-both' | 'replace', name: Name): void {
  const next = (() => { try { return openPlaylistFile(doc, file, how); } catch (e) { if (e instanceof PlaylistError) { notice = e.message; return null; } throw e; } })();
  if (!next) { render(); return; }
  // where it landed: the playlist of its id where it replaced one, else the one just added at the end
  const lives = next.playlists.filter((p) => p.removed === undefined && p.renamed === undefined);
  const id = file.playlists.find((p) => p.removed === undefined)?.id;
  const landed: Name = (how === 'replace' ? playlistById(next, id)?.name : lives[lives.length - 1]?.name) ?? name;
  if (!commit(next, { silent: true })) return;
  view = { kind: 'list', name: landed, from: 'file' };
  openLibrary('playlists');
  if (!playAt(landed, 0)) render();
}

// --- rendering ----------------------------------------------------------------

/** which page the section last showed, so a re-render of the same page keeps its scroll */
let shownWhere = '';
/** where the overview was left, so Back from a playlist lands where the hand went in (his word 10-23) */
let overviewTop = 0;
/** the playlist Back came from: its row takes the focus Back had */
let backFrom: string | null = null;
/** a row is lifted under a hand: the section is not rewritten under it (`renderHeld` runs once it is set down) */
let holding = false;
let renderHeld = false;
function render(): void {
  if (holding) { renderHeld = true; return; }
  renderHeld = false;
  paintLabel();
  paintLoved();
  paintScroll();
  for (const fn of watchers) fn();
  if (!section) return;
  if (view.kind === 'list' && !listOf(view.name)) view = { kind: 'overview' };
  if (menu && (view.kind !== 'list' || (menu.link && indexOfSound(linksOf(view.name), menu.link) < 0))) menu = null;
  const head = (notice ? `<p class="plNotice" role="status">${esc(notice)}</p>` : '')
    + (noticeApp ? `<p class="plNotice" role="status">Not installed? <a href="${APP_STORE}" target="_blank" rel="noopener">Get the app</a></p>` : '');
  const foot = undo ? `<div class="plUndo" role="status"><span>${esc(undo.text)}</span><button type="button" data-act="undo">Undo</button></div>` : '';
  let body = '';
  if (view.kind === 'overview') body = overview();
  else if (view.kind === 'list') body = listPage(view.name, view.from);
  else if (view.kind === 'askFile') body = askFile(view);
  else body = askBackup(view);
  const focused = document.activeElement && section.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
  // the focused field leaves as the section is rewritten, and that leaving is not the hand's: it commits nothing
  // the list stays where the hand left it when the page it shows is the same one (his report 10-21: a press on the last
  // track to play it threw the list to its top)
  const where = view.kind === 'list' ? `list:${view.name}` : view.kind;
  if (shownWhere === 'overview' && where !== 'overview') overviewTop = section.scrollTop;
  const keep = where === shownWhere ? section.scrollTop : where === 'overview' ? overviewTop : 0;
  shownWhere = where;
  rendering = true;
  try { section.innerHTML = `<div class="pl">${head}${body}</div>${foot}`; } finally { rendering = false; }
  if (keep) section.scrollTop = keep;
  // what is being typed survives a re-render
  for (const [k, v] of drafts) { const i = section.querySelector<HTMLInputElement>(`input[data-focus="${k}"]`); if (i) i.value = v; }
  // New, Open and Back up belong to the overview's foot alone; Back up only once there is something of yours to keep
  if (plFoot) plFoot.innerHTML = view.kind === 'overview' && (liveLists().length || FEATURED.length) ? `${naming === 'new' ? '' : newBox('new')}${key('open', 'open', 'Open a .deephouse file', 'Open')}${liveLists().length ? key('backup', 'backup', 'Back up everything', 'Back up') : ''}` : '';
  const backRow = focused === 'back' && backFrom !== null && view.kind === 'overview' ? `l:${backFrom}` : null;
  backFrom = null;
  if (backRow || focused) section.querySelector<HTMLElement>(`[data-focus="${CSS.escape(backRow ?? focused!)}"]`)?.focus({ preventScroll: true });
  paintTimes();
  placeMenu();
  if (!levelFrame) levelFrame = requestAnimationFrame(levelTick);
}

/**
 * **A playlist's row** in the overview: its constellation, its name with the playing mark, its stats, the way in. One of
 * yours carries its id (`drag`), which a drag moves it by; a featured one has none and stays where it is.
 */
function rowHtml(n: Name, links: readonly string[], drag?: string): string {
  const mark = playMark(!!playing && playing.name === n, sounding());
  const on = mark === 'playing';
  // the position in the playlist is the label under the ring's; the row says only that it plays (his word 10-20)
  return `<li class="plRow${on ? ' on' : mark ? ' current' : ''}" data-row="${totalAttr(n)}"${drag ? ` data-drag="1" data-id="${esc(drag)}"` : ''}><button type="button" class="plOpen" data-act="list" data-name="${totalAttr(n)}" data-focus="l:${esc(keyOf(n))}"${on ? ' aria-current="true"' : ''}>${sky(links, 44)}
      <span class="plText"><span class="plName"><span class="plNameText">${esc(shownName(n))}</span>${mark ? levelMark(on) : ''}</span><span class="plSub" data-cols="${totalAttr(n)}">${totalCols(n)}</span></span><svg class="plChev" viewBox="0 0 10 16" aria-hidden="true"><path d="M3 2.5 L8 8 L3 13.5"/></svg></button>
      </li>`;
}

function overview(): string {
  const lists = liveLists();
  const named = lists.filter((p) => p.name !== undefined);
  const shown = lists.filter((p) => p.name !== undefined || tracksOf(p).length || !named.length);
  // **the featured section** (featured, his word 10-23): under yours, a hairline with the section's word, the rows as yours look
  const featured = FEATURED.length
    ? `<div class="plSplit"><span class="plCaps">${esc(FEATURED_WORD)}</span></div><ul class="plLists plFeatured">${FEATURED.map((f) => rowHtml(featKey(f.id), f.links)).join('')}</ul>`
    : '';
  const newRow = naming === 'new' ? `<li class="plRow plNewRow">${newBox('new')}</li>` : '';
  if (!shown.length) {
    // nothing of yours yet: one line saying how yours starts, then the featured playlists (they took the example sky's
    // place); the foot holds New and Open. With no featured playlist either, the first visit's words and its two keys.
    if (featured) return `${newRow ? `<ul class="plLists">${newRow}</ul>` : `<p class="plLead">${esc(YOURS_FIRST)}</p>`}${featured}`;
    return `<div class="libFirst"><h2>No playlists yet</h2><p>Press the heart on the ring to save</p>
      ${naming === 'new' ? newBox('new') : `<div class="plKeys">${newBox('new')}${key('open', 'open', 'Open a .deephouse file', 'Open file')}</div>`}</div>`;
  }
  const rows = shown.map((p) => rowHtml(p.name ?? null, tracksOf(p).map((t) => t.link), shown.length > 1 ? p.id : undefined)).join('');
  // a new playlist's name is typed in place, as the first row: where it lands (pl-order)
  return `<ul class="plLists plOwn">${newRow}${rows}</ul>${featured}`;
}

let naming: string | null = null;   // where the + New playlist box is open: 'new'
/**
 * **What is typed is never lost** (his iPhone, 10-20: Done on the keyboard dropped a new playlist's name). Every
 * field's text is kept as it is typed (`drafts`, restored by a re-render), and committed synchronously and once by
 * whichever comes first: the form's submit (Done), Enter, a change, or leaving the field. Only Esc, or leaving it
 * empty, cancels.
 */
const drafts = new Map<string, string>();
/** a re-render is rewriting the section: a field leaving now is not leaving */
let rendering = false;
function commitNew(): void {
  if (naming !== 'new') return;
  const input = section?.querySelector<HTMLInputElement>('input[data-focus="newName"]');
  const name = (drafts.get('newName') ?? input?.value ?? '').trim();
  naming = null;
  drafts.delete('newName');
  if (name) edit(() => createPlaylist(doc, name), { silent: true });
  render();
}
function commitLabel(el: HTMLInputElement): void {
  if (!el.dataset.label || renaming !== el.dataset.label) return;
  const link = renaming;
  const value = drafts.get('label') ?? el.value;
  renaming = null;
  drafts.delete('label');
  edit(() => setLabel(doc, link, value));
}
function newBox(where: string): string {
  if (naming === where) return `<form class="plNew" data-form="${where}">${textField('placeholder="Name" aria-label="New playlist" maxlength="80" data-focus="newName"')}<button type="submit" class="plIcon" aria-label="Save" title="Save">${glyph('check')}</button></form>`;
  return key('new', 'plus', 'New playlist', 'New', ` data-where="${where}"`);
}

// --- the ⋯ menu: one component for a track and a playlist (his note 10-20) ---
type MenuItem = { act: string; label: string; data?: Record<string, string> };
/** the open menu: whose (a track by its link, or the playlist), its level, and the ⋯ key it hangs from */
let menu: { link?: string; level: 'top' | 'move' | 'copy'; anchor: string } | null = null;
/** the track whose label is being renamed on its row */
let renaming: string | null = null;
/** the playlist's header name is being renamed (⋯ → Rename): at rest it is plain text (his word 10-20) */
let renamingList = false;
/**
 * **The one field for a rename** (his word 10-20: "sync renaming a playlist with how we rename a track"): the input,
 * full width, and its ✓ circle. A track's label and a playlist's name both use it; Done, Enter, ✓ or leaving commits,
 * Esc or leaving it empty cancels, and a re-render keeps what is typed.
 */
const editField = (kind: 'label' | 'rename', input: string) =>
  `<form class="plFieldForm plEdit" data-form="${kind}">${input}<button type="submit" class="plIcon" aria-label="Save" title="Save">${glyph('check')}</button></form>`;
/** Focus a rename's field with the caret at the end of its text. */
function focusEnd(sel: string): void {
  const i = section?.querySelector<HTMLInputElement>(sel);
  if (!i) return;
  i.focus();
  try { const n = i.value.length; i.setSelectionRange(n, n); } catch (e) { /* none */ }
}
/**
 * **Every text field in the library** (his word 10-21: a password manager offered his username for a playlist's
 * name): one plain line, done on Enter, that no password manager fills or offers to (1Password, LastPass, Bitwarden,
 * Dashlane each by its own mark), with no autocorrect or spell marks and a capital to start. No field has an id or
 * a name a manager reads as an account's.
 */
/**
 * **How the last menu was asked for** (star-keys round 6, his word 10-22: "playlist dropdown shows first row highlight
 * on mobile, which is not correct as we don't have mouse events"). Every menu still takes the focus on its first row
 * (a keyboard's and a reader's), but it is drawn lit only for a keyboard: each menu carries `data-by` (touch, mouse,
 * key), and index.html lights a row by the focus only under `key`, by hover only where a pointer can hover, and by a
 * finger only while it presses. A key pressed in an open menu turns it to `key`.
 */
type MenuBy = 'touch' | 'mouse' | 'key';
let menuBy: MenuBy = 'mouse';
document.addEventListener('pointerdown', (e) => { menuBy = e.pointerType === 'mouse' ? 'mouse' : 'touch'; }, true);
// WebKit presses a row (`:active`) only where a touch is listened for
document.addEventListener('touchstart', () => { /* :active on iOS */ }, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  menuBy = 'key';
  for (const m of document.querySelectorAll<HTMLElement>('.plMenu[data-by]')) m.dataset.by = 'key';
}, true);
const FIELD_ATTRS = 'type="text" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" autocapitalize="sentences" autocorrect="off" spellcheck="false" enterkeyhint="done"';
const textField = (attrs: string): string => `<input ${FIELD_ATTRS} ${attrs} />`;
function menuHtml(items: MenuItem[], label: string): string {
  return `<div class="plMenu" role="menu" data-by="${menuBy}" aria-label="${esc(label)}">${items.map((it) => `<button type="button" role="menuitem" tabindex="-1" data-act="${it.act}"${Object.entries(it.data ?? {}).map(([k, v]) => ` data-${k}="${v}"`).join('')}>${esc(it.label)}</button>`).join('')}</div>`;
}
function trackMenu(n: Name, link: string): string {
  // the second level, shared by Move to… and Copy to…: the other playlists
  if (menu && menu.level !== 'top') {
    const others = liveLists().filter((p) => (p.name ?? null) !== n);
    const [act, label] = menu.level === 'move' ? ['moveTo', 'Move to'] : ['copyTo', 'Copy to'];
    return menuHtml([{ act: 'moveBack', label: `‹ ${label}` }, ...others.map((p) => ({ act, label: shownName(p.name ?? null), data: { name: enc(p.name ?? null) } }))], label);
  }
  // **a featured playlist's track is read-only** (featured, 10-23): it is copied into one of yours, its link copied
  // or opened in the app; never renamed, moved or removed
  if (isFeat(n)) return menuHtml([...(liveLists().length ? [{ act: 'copyOpen', label: 'Copy to…' }] : []), { act: 'copy', label: 'Copy link' }, ...(appleDevice() ? [{ act: 'openApp', label: 'Open in app' }] : [])], 'Track');
  const others = liveLists().length > 1;
  // the order by the menu as well as by a drag (his word 10-21), each only where it can go
  const at = indexOfSound(linksOf(n), link), last = linksOf(n).length - 1;
  const order = n === null || at < 0 ? [] : [...(at > 0 ? [{ act: 'moveUp', label: 'Move up' }] : []), ...(at < last ? [{ act: 'moveDown', label: 'Move down' }] : [])];
  return menuHtml([{ act: 'renameTrack', label: 'Rename' }, ...order,
    ...(others ? [{ act: 'moveOpen', label: 'Move to…' }, { act: 'copyOpen', label: 'Copy to…' }] : []), { act: 'copy', label: 'Copy link' }, ...(appleDevice() ? [{ act: 'openApp', label: 'Open in app' }] : []), { act: 'removeTrack', label: 'Remove' }], 'Track');
}
function listMenu(n: Name): string {
  // a featured playlist's: Save a copy (an ordinary playlist of yours) and Open in app; nothing that edits it
  if (isFeat(n)) return menuHtml([{ act: 'saveCopy', label: 'Save a copy' }, ...(appleDevice() ? [{ act: 'openAppList', label: 'Open in app' }] : [])], 'Playlist');
  // Make default is the header's star circle alone (his word 10-20): no second way in the menu
  // its place among yours by the menu as well as by a drag (pl-order), each only where it can go
  const lists = liveLists(), at = lists.findIndex((p) => (p.name ?? null) === n);
  const order = at < 0 ? [] : [...(at > 0 ? [{ act: 'listUp', label: 'Move up' }] : []), ...(at < lists.length - 1 ? [{ act: 'listDown', label: 'Move down' }] : [])];
  return menuHtml([{ act: 'renameFocus', label: 'Rename' }, ...order, ...(appleDevice() && tracksOf(listOf(n)).length ? [{ act: 'openAppList', label: 'Open in app' }] : []), { act: 'removeList', label: 'Remove', data: { name: enc(n) } }], 'Playlist');
}
/** Focus the open menu's first item. */
function focusMenu(): void { section?.querySelector<HTMLElement>('.plMenu [role="menuitem"]')?.focus({ preventScroll: true }); }
/** An open menu, placed where it is seen whole (`fitMenu`); it gets the focus. */
function placeMenu(): void {
  const m = fitMenu();
  if (m && !m.contains(document.activeElement)) focusMenu();
}
/**
 * **Never cut off** (his word 10-21: the last track's menu ran past the screen's foot). A menu stands out of its
 * list's scroll, over the panel, and where the panel is too short for it (a phone's, 260 px on a small one) past its
 * edge over the dimmed ring, always inside the visual viewport, which the keyboard and the browser's bars shrink. It
 * opens under its ⋯ where it fits whole in the panel, else over it; failing both, over it and then under it in the
 * visible area; else on the roomier side with its height capped to that room and scrolling inside. Its right edge
 * stands under the ⋯'s and it keeps inside the panel across. A ⋯ scrolled out of the list's sight closes it. On the
 * mini player it covers the panel (index.html) and is not placed.
 */
function fitMenu(): HTMLElement | null {
  const m = section?.querySelector<HTMLElement>('.plMenu');
  if (!m) return null;
  for (const k of ['position', 'top', 'left', 'right', 'bottom', 'maxHeight', 'maxWidth'] as const) m.style[k] = '';
  const more = m.previousElementSibling?.classList.contains('plMore') ? m.previousElementSibling as HTMLElement : null;
  const panel = m.closest<HTMLElement>('#library'), list = m.closest<HTMLElement>('.libBody');
  if (document.documentElement.dataset.panelMode === 'mini' || !more || !panel || !list) return m;
  const a = more.getBoundingClientRect(), l = list.getBoundingClientRect();
  if (a.bottom <= l.top || a.top >= l.bottom) { menu = null; render(); return null; }
  placeAt(m, more, panel);
  return m;
}
/** Place an open menu `m` by its key `more` in the panel: down, up, past a short panel's edge, or capped (`fitMenu`). */
function placeAt(m: HTMLElement, more: HTMLElement, panel: HTMLElement): void {
  const a = more.getBoundingClientRect();
  const p = panel.getBoundingClientRect(), vv = window.visualViewport;
  const vt = vv ? vv.offsetTop : 0, vl = vv ? vv.offsetLeft : 0;
  const box = {
    t: Math.max(p.top + panel.clientTop, vt) + 6, b: Math.min(p.top + panel.clientTop + panel.clientHeight, vt + (vv ? vv.height : window.innerHeight)) - 6,
    l: Math.max(p.left + panel.clientLeft, vl) + 6, r: Math.min(p.left + panel.clientLeft + panel.clientWidth, vl + (vv ? vv.width : window.innerWidth)) - 6,
  };
  // fixed, and so placed in the panel's frame where the panel is moved by a transform (lifted over the keyboard)
  const o = getComputedStyle(panel).transform !== 'none' ? { x: p.left + panel.clientLeft, y: p.top + panel.clientTop } : { x: 0, y: 0 };
  m.style.position = 'fixed';
  m.style.right = m.style.bottom = 'auto';
  m.style.top = '0px';
  m.style.left = '0px';
  const w = Math.min(m.offsetWidth, box.r - box.l);
  if (w < m.offsetWidth) m.style.maxWidth = `${w.toFixed(1)}px`;
  m.style.left = `${(Math.max(box.l, Math.min(box.r, a.right) - w) - o.x).toFixed(1)}px`;
  const h = m.offsetHeight, below = box.b - (a.bottom + 2), above = a.top - 2 - box.t;
  const vb = vt + (vv ? vv.height : window.innerHeight) - 6 - (a.bottom + 2), va = a.top - 2 - (vt + 6);
  const down = h <= below || (h > above && (h > va && (h <= vb || vb >= va)));
  const room = h <= below ? below : h <= above ? above : down ? vb : va;
  if (h > room) m.style.maxHeight = `${Math.max(44, room).toFixed(1)}px`;
  const mh = Math.min(h, Math.max(44, room));
  m.style.top = `${((down ? a.bottom + 2 : a.top - 2 - mh) - o.y).toFixed(1)}px`;
}
// the panel scrolled or the visible area moved under an open menu: placed again (its own scroll is its own)
let refit = 0;
const refitSoon = (e?: Event) => {
  if (e?.target instanceof Element && e.target.closest('.plMenu')) return;
  if (!refit && (section?.querySelector('.plMenu') || shareMenu)) refit = requestAnimationFrame(() => { refit = 0; fitMenu(); fitShareMenu(); });
};
document.addEventListener('scroll', refitSoon, { capture: true, passive: true });
window.addEventListener('resize', () => refitSoon());
window.visualViewport?.addEventListener('resize', () => refitSoon());
window.visualViewport?.addEventListener('scroll', () => refitSoon());
// --- the playlist as a link (PLAN-LIBRARY §3) ----------------------------------

/** **The playlist's link**: this page's own origin and path, then the playlist (`playlist-link.ts`). */
function shareUrl(n: Name): string {
  const p = listOf(n)!;
  return `${pageBase()}?${writePlaylistLink({ name: shownName(p.name ?? n), id: p.id ?? null, tracks: tracksOf(p) })}`;
}
/** Share, and beside it "Copied" for a moment, with "Long link" past `LONG_LINK`. */
function shareKey(n: Name, count: number): string {
  const word = shared && shared.name === n ? `<span class="plShared" role="status">Copied${shared.long ? '<b>Long link</b>' : ''}</span>` : '';
  return `<span class="plShareAt">${key('share', 'link', 'Share link', '', count ? '' : ' disabled')}${word}</span>`;
}
/** **A press of Share**: the link to the clipboard; the system's share only where there is no clipboard. No question. */
function share(n: Name): void {
  const url = shareUrl(n);
  const done = () => {
    if (shared) clearTimeout(shared.timer);
    shared = { name: n, long: url.length > LONG_LINK, timer: window.setTimeout(() => { shared = null; render(); }, 2400) };
    say('Copied');
    render();
  };
  const viaShare = () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') nav.share({ url }).catch(() => { /* dismissed */ });
    else { notice = url; render(); }
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, viaShare);
  else viaShare();
}

/**
 * **A playlist link on the address, read before the page reads it** (§3, *Opening one*): the playlist saved under
 * its id (the same id here is replaced by the link's version, with Undo; none is a new one, " 2" where its name is
 * taken), and the address made the first playable track's link, the list's rows gone. The panel opens on it once
 * `startPlaylists` runs, and play waits for the first press. A link that doesn't read leaves a plain page and the
 * ring's line. Called by the ring before the transport is made.
 */
export function openListLink(): LinkProblem | null {
  if (typeof location === 'undefined') return null;
  if (!isPlaylistLink(location.search)) { firstRun(); return null; }
  const rest = linkQuery(location.search);
  for (const name of [...LIST_ROWS, ...SOUND]) rest.delete(name);
  const address = (link: string) => {
    const q = linkQuery(link);
    for (const [k, v] of rest) q.append(k, v);
    const search = q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');
    try { history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`); } catch (e) { /* no history to write on */ }
  };
  const r = readPlaylistLink(location.search);
  if (!r.list) {
    address('');
    return { param: 'play', short: 'bad playlist link', long: `the playlist link was not read (${r.error}); the page opens as it would` };
  }
  const list = r.list;
  let id = '';
  if (!edit(() => { const s = savePlaylistLink(doc, list); id = s.id; return s.doc; }, { silent: true, ...(playlistById(doc, list.id ?? undefined) ? { undoText: 'Updated' } : {}) })) {
    address(list.tracks.find((t) => playable(t.link))?.link ?? '');
    return null;
  }
  const name = playlistById(doc, id)?.name ?? null;
  const links = linksOf(name);
  const at = links.length ? playableFrom(links, 0, 1) : -1;
  address(at >= 0 ? links[at] : '');
  fromLink = { name, index: Math.max(0, at), open: true };
  return null;
}

/**
 * **A first run starts on the first featured playlist** (featured, his word 10-23: "never just on bare arena"): a bare
 * address (no sound row) in a browser that keeps no place puts that playlist's first track it can play on the address,
 * the rest of the address kept (the view, `out`), before the transport reads it; `startPlaylists` makes it the playing
 * playlist, so the ring's line names it and the seam takes its next track. The page starts as any link does: cued,
 * waiting for a hand. The panel stays shut. A link, a stored place, or a table with nothing playable leaves it.
 */
function firstRun(): void {
  try { if (!linkBare(location.search) || placeStored()) return; } catch (e) { return; }
  const f = FEATURED[0];
  if (!f) return;
  const name = featKey(f.id), links = linksOf(name);
  const at = playableFrom(links, 0, 1);
  if (at < 0) return;
  const q = linkQuery(links[at]);
  for (const [k, v] of linkQuery(location.search)) q.append(k, v);
  const search = q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');
  try { history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`); } catch (e) { return; }
  fromLink = { name, index: at, open: false };
}

function listPage(n: Name, from?: string): string {
  const p = listOf(n)!;
  const ts = tracksOf(p);
  const links = ts.map((t) => t.link);
  const on = !!playing && playing.name === n;
  // a featured playlist's page: the same rows, nothing that edits it (no drag, no rename, no download)
  const fixed = isFeat(n);
  const banner = from ? `<div class="plFrom"><span class="plCaps">From a ${esc(from)} · ${esc(shownName(n))}</span><button type="button" data-act="removeList" data-name="${totalAttr(n)}">Remove</button></div>` : '';
  const named = p.name ?? SAVED;
  const name = renamingList && !fixed
    ? editField('rename', textField(`class="plLabel plRename" value="${esc(named)}" aria-label="Playlist name" maxlength="80" data-rename="${esc(named)}" data-focus="rename"`))
    : `<span class="plTitle">${esc(named)}</span>`;
  const headMenu = menu && !menu.link ? listMenu(n) : '';
  // no Play or Pause here (his word 10-20): a row's press plays, and the ring's own transport plays and pauses
  const rows = ts.map((t, i) => {
    const mark = playMark(on && playing!.index === i, sounding());
    const time = timeText(t.link);
    return `<li class="plTrack${mark === 'playing' ? ' on' : mark ? ' current' : ''}${renaming === t.link ? ' renaming' : ''}" data-i="${i}"${fixed ? '' : ' data-drag="1"'}>
      <button type="button" class="plPlay" data-act="play" data-i="${i}" aria-label="Play ${esc(titleOf(t))}" data-focus="t:${i}">
        <span class="plNum" aria-hidden="true">${i + 1}</span><span class="plDot" style="background:${esc(colourSafe(t.link))}"></span>
        <span class="plText">${renaming === t.link ? '' : `<span class="plName"><span class="plNameText">${esc(titleOf(t))}</span>${mark ? levelMark(mark === 'playing') : ''}</span>`}<span class="plSub">${esc(playable(t.link) ? genreSafe(t.link) : 'Needs a newer version')}</span></span>
        <span class="plTime" data-time="${esc(t.link)}">${esc(time ?? '')}</span></button>
      ${renaming === t.link ? editField('label', textField(`class="plLabel" data-label="${esc(t.link)}" value="${esc(t.label ?? '')}" maxlength="200" placeholder="${esc(titleOf({ link: t.link }))}" aria-label="Label" data-focus="label"`)) : ''}
      <button type="button" class="plMore" aria-label="Track" aria-haspopup="menu" aria-expanded="${menu?.link === t.link}" data-act="trackMenu" data-link="${esc(t.link)}" data-focus="m:${i}">⋯</button>${menu?.link === t.link ? trackMenu(n, t.link) : ''}</li>`;
  }).join('');
  return `${banner}<div class="plListHead"><button type="button" class="plBack" aria-label="Back" title="All playlists" data-act="back" data-focus="back"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M8.6 2.6 L4.2 7 L8.6 11.4"/></svg></button>${sky(links, 52)}
      <div class="plText"><span class="plTitleRow">${name}</span><span class="plSub" data-total="${totalAttr(n)}">${totalCols(n)}</span></div>
      ${fixed ? '' : key('download', 'download', 'Download .deephouse')}${shareKey(n, ts.length)}
      <button type="button" class="plMore" aria-label="Playlist" aria-haspopup="menu" aria-expanded="${!!headMenu}" data-act="menu" data-focus="menu">⋯</button>${headMenu}</div>
    <ul class="plTracks" data-list="${totalAttr(n)}">${rows}</ul>`;
}

function askFile(v: Extract<View, { kind: 'askFile' }>): string {
  return `<div class="plAsk"><span class="plCaps">From a file</span><p>“${esc(shownName(v.name))}” is already here</p>
    <div class="plKeys">${key('keepBoth', 'plus', 'Keep both', 'Keep both')}${key('replaceFile', 'replace', 'Replace', 'Replace')}${key('cancel', 'remove', 'Cancel', 'Cancel')}</div></div>`;
}
function askBackup(v: Extract<View, { kind: 'askBackup' }>): string {
  const gone = v.removed.length ? `<ul class="plGone">${v.removed.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
  return `<div class="plAsk"><span class="plCaps">A backup</span><p>${esc(v.text)}</p>${gone}
    <div class="plKeys">${key('merge', 'download', 'Import', 'Import')}${key('cancel', 'remove', 'Cancel', 'Cancel')}</div>
    <button type="button" class="plLink" data-act="replaceAll">Replace instead</button></div>`;
}

/** **Under the ring, while a playlist plays**: its small constellation, its name and "8 of 10"; a press opens it. */
function paintLabel(): void {
  if (!label) return;
  if (!playing || !listOf(playing.name)) { label.hidden = true; return; }
  const links = linksOf(playing.name);
  label.hidden = false;
  // where you are, always; quieter while nothing sounds
  label.classList.toggle('quiet', !sounding());
  label.innerHTML = `${sky(links, 18)}<span class="nlName">${esc(shownName(playing.name))}</span><span class="nlOf">${esc(placeWords(playing.index, links.length))}</span>`;
  label.setAttribute('aria-label', `${sounding() ? 'Playing from' : 'In'} ${shownName(playing.name)}, ${placeWords(playing.index, links.length)}: open it`);
}

// --- the hand ----------------------------------------------------------------

const nameOf = (el: HTMLElement): Name => dec(el.dataset.name);
let dragged = false;

function act(el: HTMLElement): void {
  const a = el.dataset.act;
  notice = '';
  // Undo stands for several seconds or until the next action, whichever comes first
  if (undo && a !== 'undo') { clearTimeout(undo.timer); undo = null; }
  const v = view;
  const was = menu;
  if (!['moveOpen', 'copyOpen', 'moveBack', 'copy'].includes(a ?? '')) menu = null;
  // **a featured playlist is read-only** (featured, 10-23): whatever would edit it does nothing, whichever way it came
  if (v.kind === 'list' && isFeat(v.name) && ['renameTrack', 'renameFocus', 'removeList', 'moveUp', 'moveDown', 'listUp', 'listDown', 'moveOpen', 'moveTo', 'removeTrack', 'download'].includes(a ?? '')) { render(); return; }
  switch (a) {
    case 'list': if (dragged) return; view = { kind: 'list', name: nameOf(el) }; renamingList = false; break;
    case 'back': backFrom = v.kind === 'list' ? keyOf(v.name) : null; view = { kind: 'overview' }; renamingList = false; break;
    case 'trackMenu': menu = was && was.link === el.dataset.link ? null : { link: el.dataset.link!, level: 'top', anchor: el.dataset.focus ?? '' }; renaming = null; break;
    case 'menu': menu = was && !was.link ? null : { level: 'top', anchor: 'menu' }; break;
    case 'moveOpen': if (was) menu = { ...was, level: 'move' }; break;
    case 'copyOpen': if (was) menu = { ...was, level: 'copy' }; break;
    case 'moveBack': if (was) menu = { ...was, level: 'top' }; break;
    case 'renameTrack': if (was?.link) { renaming = was.link; render(); focusEnd('.plTrack .plLabel'); } return;
    case 'renameFocus': renamingList = true; render(); focusEnd('[data-rename]'); return;
    // **Save a copy** (featured, 10-23): the featured playlist as an ordinary one of yours, opened; Undo takes it back
    case 'saveCopy': if (v.kind === 'list') {
      const f = featOf(v.name);
      let id = '';
      if (f && edit(() => { const c = copyOfFeatured(doc, f); id = c.id; return c.doc; }, { undoText: 'Saved a copy', silent: true })) {
        say('Saved');
        view = { kind: 'list', name: playlistById(doc, id)?.name ?? null };
      }
    } break;
    case 'new': naming = el.dataset.where ?? 'new'; render(); section?.querySelector<HTMLInputElement>('[data-focus="newName"]')?.focus(); return;
    case 'open': pickFile(); return;
    case 'backup': download(writeBackupFile(doc)); return;
    case 'download': if (v.kind === 'list') download(writePlaylistFile(doc, v.name)); return;
    case 'share': if (v.kind === 'list') share(v.name); return;
    case 'play': if (v.kind === 'list' && !dragged) {
      const i = Number(el.dataset.i);
      // **a row press plays that track** (his note 10-20): mixed in while the set sounds, started while it is
      // stopped (a reload resumed the place but not the sound): the track already there carries on from where it is
      const here = !!playing && playing.name === v.name && playing.index === i && indexOfSound(linksOf(v.name), deps.control.linkNow(), i) === i;
      if (here && !sounding()) { deps.control.start(); setTimeout(render, 250); }
      else if (!here) playAt(v.name, i, 'cast', 0);
    } return;
    case 'removeList': {
      const n = nameOf(el);
      if (n === null) return;
      if (edit(() => removePlaylist(doc, n), { undoText: `Removed ${n}`, silent: true })) {
        if (playing && playing.name === n) playing = null;
        view = { kind: 'overview' };
      }
      break;
    }
    // **a dated edit** (sync-fixes, 10-21): what comes back is dated after the removal, so the next merge keeps it everywhere
    case 'undo': if (undo) {
      const back = undo.doc;
      clearTimeout(undo.timer);
      undo = null;
      // the playing track keeps playing where Undo puts it (a move of it, or of one before it, taken back)
      const was = playing ? linksOf(playing.name)[playing.index] : undefined;
      if (commit(restore(back, doc), { silent: true }) && playing && was !== undefined) {
        const i = indexOfSound(linksOf(playing.name), was, playing.index);
        if (i >= 0 && i !== playing.index) { playing.index = i; deps.control.remember(); }
      }
    } break;
    case 'listUp': case 'listDown': if (v.kind === 'list' && !isFeat(v.name)) {
      const lists = liveLists(), from = lists.findIndex((p) => (p.name ?? null) === v.name);
      const to = from + (a === 'listUp' ? -1 : 1);
      // the ⋯ keeps the focus, so a keyboard moves it again at once
      if (from >= 0 && to >= 0 && to < lists.length && shiftList(lists[from].id!, to)) { section?.querySelector<HTMLElement>('[data-focus="menu"]')?.focus({ preventScroll: true }); return; }
    } break;
    case 'moveUp': case 'moveDown': if (v.kind === 'list' && v.name !== null && was?.link) {
      const from = indexOfSound(linksOf(v.name), was.link), to = from + (a === 'moveUp' ? -1 : 1);
      if (from >= 0 && to >= 0 && to < linksOf(v.name).length) shiftTrack(v.name, from, to);
    } break;
    case 'moveTo': if (v.kind === 'list' && was?.link) {
      const to = nameOf(el), link = was.link;
      const i = indexOfSound(linksOf(v.name), link);
      if (to !== null && edit(() => removeTrack(addToPlaylist(doc, to, link), v.name, link), { undoText: `Moved to ${shownName(to)}`, silent: true }))
        if (playing && playing.name === v.name && i >= 0 && i < playing.index) playing.index -= 1;
    } break;
    // a copy: the track stays here and joins the picked playlist at its end (one sound may sit in several, in step)
    case 'copyTo': if (was?.link) {
      const to = nameOf(el), link = was.link;
      if (to === null) break;
      if (indexOfSound(linksOf(to), link) >= 0) { notice = 'Already there'; break; }
      edit(() => addToPlaylist(doc, to, link), { undoText: `Copied to ${shownName(to)}`, silent: true });
    } break;
    case 'removeTrack': if (v.kind === 'list' && was?.link) {
      const link = was.link;
      const i = indexOfSound(linksOf(v.name), link);
      const t = tracksOf(playlistOf(doc, v.name)).find((x) => soundKey(x.link) === soundKey(link));
      if (edit(() => removeTrack(doc, v.name, link), { undoText: `Removed ${t ? titleOf(t) : ''}`.trim(), silent: true }))
        if (playing && playing.name === v.name && i >= 0 && i < playing.index) playing.index -= 1;
    } break;
    case 'openApp': if (was?.link) { menu = null; openInApp(normaliseLink(was.link).link, appMissed); } break;
    case 'openAppList': if (v.kind === 'list') { menu = null; openInApp(new URL(shareUrl(v.name)).search, appMissed); } break;
    case 'copy': if (was?.link) {
      const url = `${pageBase()}?${normaliseLink(was.link).link}`;
      menu = null;
      void navigator.clipboard?.writeText(url).then(() => say('Link copied'), () => { notice = url; render(); });
    } break;
    case 'keepBoth': case 'replaceFile': if (v.kind === 'askFile') { addFile(v.file, a === 'keepBoth' ? 'keep-both' : 'replace', v.name); return; } break;
    case 'merge': if (v.kind === 'askBackup') { edit(() => mergeLibraries(doc, v.file), { undoText: 'Imported', silent: true }); view = { kind: 'overview' }; } break;
    case 'replaceAll': if (v.kind === 'askBackup') {
      const file = v.file;
      // it wins over sync (sync-fixes, 10-21): what it drops is tombstoned and what it writes dated, now
      edit(() => replaceLibrary(doc, file), { undoText: 'Replaced', silent: true });
      if (playing && !listOf(playing.name)) playing = null;
      view = { kind: 'overview' };
    } break;
    case 'cancel': view = { kind: 'overview' }; break;
    default: return;
  }
  render();
}

function wire(): void {
  if (!section) return;
  section.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (el && section.contains(el)) act(el);
  });
  // a press outside an open menu closes it
  document.addEventListener('pointerdown', (e) => {
    if (!menu) return;
    const t = e.target as HTMLElement;
    if (t.closest('.plMenu') || t.closest('[data-act="trackMenu"], [data-act="menu"]')) return;
    menu = null;
    render();
  }, true);
  // Done on a phone's keyboard submits the field's form; every path commits once, synchronously
  const commitField = (el: HTMLInputElement | null) => {
    // a field leaving as a re-render rewrites the section (its blur and its change) is not the hand's
    if (!el || rendering) return;
    if (el.dataset.focus === 'newName') commitNew();
    else if (el.dataset.label) commitLabel(el);
    else if (el.dataset.rename !== undefined) rename(el);
  };
  section.addEventListener('submit', (e) => {
    e.preventDefault();
    commitField((e.target as HTMLFormElement).querySelector<HTMLInputElement>('input'));
  });
  for (const k of ['input', 'compositionend'] as const) section.addEventListener(k, (e) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName === 'INPUT' && el.dataset.focus && ['newName', 'label', 'rename'].includes(el.dataset.focus)) drafts.set(el.dataset.focus, el.value);
  });
  section.addEventListener('change', (e) => commitField(e.target as HTMLInputElement));
  // leaving the field commits it (a track's label, the new name, the header's name); Esc (`closeMenu`) cancels
  // (a field a re-render took away is not left: the re-render puts it back with its text and its focus)
  section.addEventListener('focusout', (e) => commitField(e.target as HTMLInputElement));
  section.addEventListener('keydown', (e) => {
    const el = e.target as HTMLInputElement;
    if (e.key === 'Enter' && el.tagName === 'INPUT' && el.dataset.focus && ['newName', 'label', 'rename'].includes(el.dataset.focus)) { e.preventDefault(); commitField(el); return; }
    // the menu's keys: arrows move, Enter picks (the button's own), Esc closes (`closeMenu`)
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && el.closest?.('.plMenu')) {
      e.preventDefault();
      const items = [...el.closest('.plMenu')!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const i = items.indexOf(el);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });
  wireGestures();
  plFoot?.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (el) act(el);
  });
}
function rename(el: HTMLInputElement): void {
  const from = el.dataset.rename!;
  const to = (drafts.get('rename') ?? el.value).trim();
  drafts.delete('rename');
  // once: a second path after the first committed finds the old name gone
  if (!playlistOf(doc, from)) return;
  renamingList = false;
  if (!to || to === from) { render(); return; }
  if (edit(() => renamePlaylist(doc, from, to), { silent: true })) {
    if (playing && playing.name === from) playing.name = to;
    if (view.kind === 'list') view = { ...view, name: to };
    deps.control.remember();
  }
  render();
}

/** A track from one place in its playlist to another, the playing one's index following it (a drag, or Move up/down), with Undo. */
function shiftTrack(name: string, from: number, to: number): void {
  if (isFeat(name)) return;
  const t = tracksOf(playlistOf(doc, name))[from];
  if (edit(() => moveTrack(doc, name, from, to), { silent: true, undoText: `Moved ${t ? titleOf(t) : ''}`.trim() })) {
    if (playing && playing.name === name) {
      const p = playing.index;
      playing.index = p === from ? to : p > from && p <= to ? p - 1 : p < from && p >= to ? p + 1 : p;
      deps.control.remember();
    }
    render();
  }
}
/** **One of your playlists to place `to`** among yours (a drag, or Move up/down; pl-order), with Undo. */
function shiftList(id: string, to: number): boolean {
  const p = playlistById(doc, id);
  if (!p) return false;
  if (!edit(() => movePlaylist(doc, id, to), { silent: true, undoText: `Moved ${shownName(p.name ?? null)}` })) return false;
  render();
  return true;
}

/**
 * Reorder by drag (a press and hold on touch): a playlist's tracks on its page, and your playlists in the overview
 * (pl-order), each row only among its own list's (a featured row is never dragged, nor anything into their section).
 * A playlist is removed only by its ⋯ menu, with Undo (his word 10-20).
 */
function wireGestures(): void {
  if (!section) return;
  let g: { id: number; el: HTMLElement; kind: 'drag' | 'wait'; x: number; y: number; from: number; to: number; hold: number; touch: boolean } | null = null;
  /** the rows the held one moves among: its own list's that move (a playlist's tracks, or your playlists) */
  const rowsOf = (el: HTMLElement) => [...(el.parentElement?.children ?? [])].filter((x): x is HTMLElement => x instanceof HTMLElement && x.matches('li[data-drag]'));
  section.addEventListener('pointerdown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.plTracks > li[data-drag], .plOwn > li[data-drag]');
    if (!li || (e.target as HTMLElement).closest('.plMore')) return;
    dragged = false;
    const touch = e.pointerType === 'touch';
    const i = rowsOf(li).indexOf(li);
    g = { id: e.pointerId, el: li, kind: 'wait', x: e.clientX, y: e.clientY, from: i, to: i, hold: 0, touch };
    if (touch && li.dataset.drag) g.hold = window.setTimeout(() => { if (g && g.kind === 'wait') startDrag(); }, 380);
  });
  const startDrag = () => {
    if (!g) return;
    g.kind = 'drag';
    dragged = true;
    holding = true;
    g.el.classList.add('dragging');
    try { g.el.setPointerCapture(g.id); } catch (e) { /* gone */ }
  };
  section.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.kind === 'wait') {
      if (g.el.dataset.drag && !g.touch && Math.abs(dy) > 6) startDrag();
      else if (Math.hypot(dx, dy) > 8) { clearTimeout(g.hold); g = null; return; }
    }
    if (g.kind === 'drag') {
      e.preventDefault();
      g.el.style.transform = `translateY(${dy}px)`;
      const rows = rowsOf(g.el);
      let to = g.from;
      for (const [i, r] of rows.entries()) { if (r === g.el) continue; const b = r.getBoundingClientRect(); if (e.clientY > b.top + b.height / 2) to = i >= g.from ? i : i + 1; else if (i < g.from && e.clientY < b.top + b.height / 2) { to = Math.min(to, i); } }
      g.to = Math.max(0, Math.min(rows.length - 1, to));
    }
  });
  const end = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(g.hold);
    const was = g;
    g = null;
    was.el.style.transform = '';
    was.el.classList.remove('dragging');
    holding = false;
    const v = view;
    const id = was.el.dataset.id;
    const target = rowsOf(was.el)[was.to]?.dataset.id;
    if (was.kind === 'drag' && was.to !== was.from) {
      if (id !== undefined && target !== undefined && v.kind === 'overview') {
        const to = liveLists().findIndex((p) => p.id === target);
        if (to >= 0) shiftList(id, to);
      } else if (id === undefined && v.kind === 'list' && v.name !== null) shiftTrack(v.name, was.from, was.to);
    }
    if (renderHeld) render();
    if (was.kind === 'drag') setTimeout(() => { dragged = false; }, 0);
  };
  section.addEventListener('pointerup', end);
  section.addEventListener('pointercancel', end);
  // a held finger's drag keeps the list from scrolling under it
  section.addEventListener('touchmove', (e) => { if (g && g.kind === 'drag') e.preventDefault(); }, { passive: false });
}

// --- what the Genres sky draws of the record (genres-sky.ts) -------------------

const watchers = new Set<() => void>();
/** Every saved track's link (once each, in the playlists' order) and the playing playlist's, in its order. */
export function skyFeed(): { saved: string[]; playing: string[] | null } {
  const seen = new Set<string>(), saved: string[] = [];
  for (const p of liveLists()) for (const t of tracksOf(p)) { const k = soundKey(t.link); if (!seen.has(k)) { seen.add(k); saved.push(t.link); } }
  return { saved, playing: playing && listOf(playing.name) ? linksOf(playing.name) : null };
}
/** Called after every change the tab draws (the record, the playing playlist). */
export const skyWatch = (fn: () => void): void => { watchers.add(fn); };

/** Open the panel on a playlist. */
export function showPlaylist(name: Name): void {
  view = { kind: 'list', name };
  render();
  openLibrary('playlists', label);
}

export function startPlaylists(d: PlaylistDeps): void {
  deps = d;
  // a reload carries on in the playlist the store names, where what plays is still its track
  const r = d.control.resumedPlaylist;
  const opened = !!fromLink && !!listOf(fromLink.name);
  if (fromLink && opened) {
    playing = { name: fromLink.name, index: fromLink.index };
    if (fromLink.open) view = { kind: 'list', name: fromLink.name, from: 'link' };
  } else if (r) {
    const i = indexOfSound(linksOf(r.name), d.control.linkNow(), r.index);
    if (i >= 0 && listOf(r.name)) playing = { name: r.name, index: i };
  }
  lastRecord = recordKey();
  d.control.steer({ next: () => step(1, 'skip'), back: () => step(-1, 'back'), leave, place: () => playing && { ...playing } });
  // the place written down once the steer is there to say it, so a reload resumes in the playlist
  if (opened) d.control.remember();
  store.subscribe((next) => {
    if (quiet) return;
    // another tab's write or an iCloud merge ends the Undo too: its snapshot predates what arrived
    if (undo && next !== doc) { clearTimeout(undo.timer); undo = null; }
    doc = next;
    if (playing && !listOf(playing.name)) playing = null;
    render();
  });
  wire();
  label?.addEventListener('click', () => { if (playing) showPlaylist(playing.name); });
  // a file dropped anywhere on the page
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    void openFile(f);
  });
  window.setInterval(seamTick, 1000);
  // and at once on every change of the transport's own state: the ring's key, the lock screen, Space
  d.control.subscribe(() => soundingChanged());
  render();
  warmSkies();
  if (fromLink?.open) openLibrary('playlists', label);
  fromLink = null;
  syncAppBanner();
  startShellLibrary({ openFile: (f) => void openFile(f), doc: () => doc, link: () => d.control.linkPlaying(), save: (name) => saveInto(name, d.control.linkPlaying()) });
}
