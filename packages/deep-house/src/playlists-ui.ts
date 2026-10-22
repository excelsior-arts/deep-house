// **The Playlists tab, the throne's save and playing a playlist** (PLAN-LIBRARY §2, phase 3).
//
// - **The throne** (ring.ts draws it at twelve o'clock and hands its presses here) saves what plays into Saved:
//   a copy of the birds' imprint lifts off the ring and slides into the gyroscope, which spins (`gyroSpin`). With
//   the panel open the throne flashes once; under reduced motion the gyroscope blinks. A save never opens the panel.
// - **The tab**: the overview (what plays, your playlists, + New playlist, files), a playlist's page (its header,
//   Play and ↓ .deephouse, its rows, reordering), one ⋯ menu for a track and a playlist, and the questions a file asks.
// - **Playing**: a row plays through `control.playPlace` (the journal walk's `mix.cast` path); next and back step
//   through the playlist (`control.steer`), the next track is asked just before the record's own seam, the
//   playlist repeats, and the dice leave it. Where it is (its name and the track's place) rides the player's store.
// - **Files**: ↓ .deephouse and Back up everything download through `playlists.ts`'s writers; Open a .deephouse
//   file and a file dropped on the page read through `readDeephouseFile`.
//
// The record is `playlists.ts`'s and the worked-out values `sky.ts`'s; this file only shows and asks. Copy is
// short point labels, no prose (his word 10-20). Nothing here is written into the address.

import {
  libraryStore, playlistOf, tracksOf, saveTrack, addToPlaylist, createPlaylist, removeTrack, removePlaylist, renamePlaylist,
  moveTrack, setLabel, replaceLink, restore, replaceLibrary, writePlaylistFile, writeBackupFile, readDeephouseFile, playlistFileSummary,
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
import { romanNumeral } from './control.ts';
import type { Control } from './control.ts';
import { openLibrary, libraryOpen, gyroSpin } from './library-panel.ts';
import { reducedMotion } from './motion.ts';
import { shellStore, shellSave, shellPick, shellShareLink, startShellLibrary } from './shell-library.ts';
import { BIRDS, BIRD_CODE, HOUSE } from './spell.ts';
import type { Bird } from './spell.ts';

export interface PlaylistDeps {
  control: Control;
  /** the throne on the ring, for its flash and its one pulse */
  throne: Element | null;
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
/** a playlist link opened this page: where it landed and the track the address holds, for `startPlaylists` */
let fromLink: { name: Name; index: number } | null = null;
const section = document.getElementById('libPlaylists') as HTMLElement | null;
const label = document.getElementById('nowList') as HTMLButtonElement | null;

// --- small things -----------------------------------------------------------

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const shownName = (n: Name) => n ?? SAVED;
const keyOf = (n: Name) => n ?? '';
const say = (text: string) => { const el = document.getElementById('say'); if (el) el.textContent = text; };
const liveLists = (): Playlist[] => doc.playlists.filter((p) => p.removed === undefined && p.renamed === undefined);
const linksOf = (n: Name) => tracksOf(playlistOf(doc, n)).map((t) => t.link);

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

// the empty tab's example sky (his word 10-21): seven real tuned genre links (Drone, Bells, Deep House, Dub Techno, Chillstep, Tech House, Liquid), four colour families
const EXAMPLE_SKY: readonly string[] = [
  'seed=5&v=2&spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81',
  'seed=8&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90',
  'seed=7&v=2',
  'seed=21&v=2&spell=em:0.73,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80',
  'seed=16&v=2&spell=em:0.92,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80',
  'seed=14&v=2&spell=em:0.70,ti:0.45,ze:0.60,ro:0.60,sp:0.40',
  'seed=3&v=2&spell=em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85',
];
/** A playlist's constellation, or an empty ring where it has no stars yet. */
function sky(links: readonly string[], px: number, h = px): string {
  if (!links.length) return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" aria-hidden="true"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 4}" fill="none" stroke="currentColor" stroke-dasharray="2 3" opacity="0.5"/></svg>`;
  try { return constellationOf(links, px, h).replace('<svg ', '<svg aria-hidden="true" '); } catch (e) { return ''; }
}

// --- time, lazily (a full plan a link: asked in idle slots, kept by sky.ts) --

const known = new Map<string, string>();
const queue: string[] = [];
let queued = false;
function timeText(link: string): string | null {
  if (known.has(link)) return known.get(link)!;
  if (!queue.includes(link)) queue.push(link);
  runTimes();
  return null;
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
      known.set(l, t ? t.clock : '');
      paintTimes();
    }
    if (queue.length) later(work); else queued = false;
  };
  later(work);
}
/**
 * **A playlist's total, written out** (his review 10-20): "2 h 44 m · 4 tracks · Repeat", "52 m · 1 track · Repeat".
 * Repeat is its mode, the only one for now. The time joins once every track's is planned.
 */
/** Repeat is said only where it applies (his word 10-20): on the current or playing playlist. */
const modeOf = (n: Name) => (playing && playing.name === n ? ' · Repeat' : '');
function totalText(n: Name): string {
  const links = linksOf(n);
  let sum = 0, all = true;
  for (const l of links) { const t = timeText(l); if (t === null) all = false; else sum += timeOf(l)?.minutes ?? 0; }
  const m = Math.round(sum);
  const time = all && links.length ? `${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`} · ` : '';
  return `${time}${links.length} track${links.length === 1 ? '' : 's'}${modeOf(n)}`;
}
/**
 * **A playlist's stats, one plain string** (his word 10-20: "let's do strings"): "46 m · 6 tracks", and "· Repeat" on
 * the current playlist. The only help to the eye: each number of one or two digits sits in a box two figures wide,
 * right-aligned, in tabular figures, so "7 m" and "46 m" start together down the rows; hours just flow.
 */
function totalCols(n: Name): string {
  const links = linksOf(n);
  let sum = 0, all = true;
  for (const l of links) { const t = timeText(l); if (t === null) all = false; else sum += timeOf(l)?.minutes ?? 0; }
  const m = Math.round(sum);
  const num = (x: number) => (x < 100 ? `<span class="plFig">${x}</span>` : String(x));
  const time = all && links.length ? `${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${num(m)} m`} · ` : '';
  return `${time}${num(links.length)} track${links.length === 1 ? '' : 's'}${esc(modeOf(n))}`;
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
  for (const el of section.querySelectorAll<HTMLElement>('[data-time]')) { const t = known.get(el.dataset.time!); if (t !== undefined) el.textContent = t; }
  for (const el of document.querySelectorAll<HTMLElement>('[data-total]')) el.textContent = totalText(dec(el.dataset.total));
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
  m.setAttribute('aria-label', 'Save to');
  m.innerHTML = names.map((n) => `<button type="button" role="menuitem" tabindex="-1" data-name="${esc(n)}">${sky(linksOf(n), 16)}<span>${esc(n)}</span></button>`).join('');
  document.body.append(m);
  throneMenu = m;
  // under the throne, centred on it, kept inside the window (the mini player's may cover the ring)
  const t = (deps.throne as Element | null)?.getBoundingClientRect();
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
  (deps.throne as HTMLElement | null)?.focus?.({ preventScroll: true });
}
// a press anywhere outside the menu closes it, without saving
document.addEventListener('pointerdown', (e) => { if (throneMenu && !throneMenu.contains(e.target as Node)) closeThroneMenu(); }, true);

let dotTimer = 0;
function saveMotion(): void {
  const throne = deps.throne;
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
  deps.throne?.classList.add('pulse');
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
  if (!n || !playlistOf(doc, playing.name)) { leave(); return false; }
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
function render(): void {
  paintLabel();
  for (const fn of watchers) fn();
  if (!section) return;
  if (view.kind === 'list' && !playlistOf(doc, view.name)) view = { kind: 'overview' };
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
  const keep = where === shownWhere ? section.scrollTop : 0;
  shownWhere = where;
  rendering = true;
  try { section.innerHTML = `<div class="pl">${head}${body}</div>${foot}`; } finally { rendering = false; }
  if (keep) section.scrollTop = keep;
  // what is being typed survives a re-render
  for (const [k, v] of drafts) { const i = section.querySelector<HTMLInputElement>(`input[data-focus="${k}"]`); if (i) i.value = v; }
  // Open and Back up belong to the overview's foot alone
  if (plFoot) plFoot.innerHTML = view.kind === 'overview' && liveLists().length ? `${naming === 'new' ? '' : newBox('new')}${key('open', 'open', 'Open a .deephouse file', 'Open')}${key('backup', 'backup', 'Back up everything', 'Back up')}` : '';
  if (focused) section.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus({ preventScroll: true });
  paintTimes();
  placeMenu();
  if (!levelFrame) levelFrame = requestAnimationFrame(levelTick);
}

function overview(): string {
  const lists = liveLists();
  const named = lists.filter((p) => p.name !== undefined);
  const shown = lists.filter((p) => p.name !== undefined || tracksOf(p).length || !named.length);
  if (!shown.length) {
    // a playlist's sky, as its row draws one (his word 10-21: "the sky map icon ... is how we show our playlists");
    // then two ways in: a new playlist, or a file (his word 10-20: "so Add or Open")
    return `<div class="libFirst"><span class="libSky">${sky(EXAMPLE_SKY, 68, 44)}</span>
      <h2>No playlists yet</h2><p>Press the throne on top of the ring to save</p>
      ${naming === 'new' ? newBox('new') : `<div class="plKeys">${newBox('new')}${key('open', 'open', 'Open a .deephouse file', 'Open file')}</div>`}</div>`;
  }
  const rows = shown.map((p) => {
    const n: Name = p.name ?? null;
    const links = tracksOf(p).map((t) => t.link);
    const mark = playMark(!!playing && playing.name === n, sounding());
    const on = mark === 'playing';
    // the position in the playlist is the label under the ring's; the row says only that it plays (his word 10-20)
    return `<li class="plRow${on ? ' on' : mark ? ' current' : ''}" data-row="${totalAttr(n)}"><button type="button" class="plOpen" data-act="list" data-name="${totalAttr(n)}" data-focus="l:${esc(keyOf(n))}"${on ? ' aria-current="true"' : ''}>${sky(links, 44)}
      <span class="plText"><span class="plName"><span class="plNameText">${esc(shownName(n))}</span>${mark ? levelMark(on) : ''}</span><span class="plSub" data-cols="${totalAttr(n)}">${totalCols(n)}</span></span><svg class="plChev" viewBox="0 0 10 16" aria-hidden="true"><path d="M3 2.5 L8 8 L3 13.5"/></svg></button>
      </li>`;
  }).join('');
  // a new playlist's name is typed in place, as the last row
  return `<ul class="plLists">${rows}${naming === 'new' ? `<li class="plRow plNewRow">${newBox('new')}</li>` : ''}</ul>`;
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
const FIELD_ATTRS = 'type="text" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" autocapitalize="sentences" autocorrect="off" spellcheck="false" enterkeyhint="done"';
const textField = (attrs: string): string => `<input ${FIELD_ATTRS} ${attrs} />`;
function menuHtml(items: MenuItem[], label: string): string {
  return `<div class="plMenu" role="menu" aria-label="${esc(label)}">${items.map((it) => `<button type="button" role="menuitem" tabindex="-1" data-act="${it.act}"${Object.entries(it.data ?? {}).map(([k, v]) => ` data-${k}="${v}"`).join('')}>${esc(it.label)}</button>`).join('')}</div>`;
}
function trackMenu(n: Name, link: string): string {
  // the second level, shared by Move to… and Copy to…: the other playlists
  if (menu && menu.level !== 'top') {
    const others = liveLists().filter((p) => (p.name ?? null) !== n);
    const [act, label] = menu.level === 'move' ? ['moveTo', 'Move to'] : ['copyTo', 'Copy to'];
    return menuHtml([{ act: 'moveBack', label: `‹ ${label}` }, ...others.map((p) => ({ act, label: shownName(p.name ?? null), data: { name: enc(p.name ?? null) } }))], label);
  }
  const others = liveLists().length > 1;
  // the order by the menu as well as by a drag (his word 10-21), each only where it can go
  const at = indexOfSound(linksOf(n), link), last = linksOf(n).length - 1;
  const order = n === null || at < 0 ? [] : [...(at > 0 ? [{ act: 'moveUp', label: 'Move up' }] : []), ...(at < last ? [{ act: 'moveDown', label: 'Move down' }] : [])];
  return menuHtml([{ act: 'renameTrack', label: 'Rename' }, ...order,
    ...(others ? [{ act: 'moveOpen', label: 'Move to…' }, { act: 'copyOpen', label: 'Copy to…' }] : []), { act: 'copy', label: 'Copy link' }, ...(appleDevice() ? [{ act: 'openApp', label: 'Open in app' }] : []), { act: 'removeTrack', label: 'Remove' }], 'Track');
}
function listMenu(n: Name): string {
  // Make default is the header's star circle alone (his word 10-20): no second way in the menu
  return menuHtml([{ act: 'renameFocus', label: 'Rename' }, ...(appleDevice() && tracksOf(playlistOf(doc, n)).length ? [{ act: 'openAppList', label: 'Open in app' }] : []), { act: 'removeList', label: 'Remove', data: { name: enc(n) } }], 'Playlist');
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
  const p = playlistOf(doc, n)!;
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
  if (typeof location === 'undefined' || !isPlaylistLink(location.search)) return null;
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
  fromLink = { name, index: Math.max(0, at) };
  return null;
}

function listPage(n: Name, from?: string): string {
  const p = playlistOf(doc, n)!;
  const ts = tracksOf(p);
  const links = ts.map((t) => t.link);
  const on = !!playing && playing.name === n;
  const banner = from ? `<div class="plFrom"><span class="plCaps">From a ${esc(from)} · ${esc(shownName(n))}</span><button type="button" data-act="removeList" data-name="${totalAttr(n)}">Remove</button></div>` : '';
  const named = p.name ?? SAVED;
  const name = renamingList
    ? editField('rename', textField(`class="plLabel plRename" value="${esc(named)}" aria-label="Playlist name" maxlength="80" data-rename="${esc(named)}" data-focus="rename"`))
    : `<span class="plTitle">${esc(named)}</span>`;
  const headMenu = menu && !menu.link ? listMenu(n) : '';
  // no Play or Pause here (his word 10-20): a row's press plays, and the ring's own transport plays and pauses
  const rows = ts.map((t, i) => {
    const mark = playMark(on && playing!.index === i, sounding());
    const time = timeText(t.link);
    return `<li class="plTrack${mark === 'playing' ? ' on' : mark ? ' current' : ''}${renaming === t.link ? ' renaming' : ''}" data-i="${i}" data-drag="1">
      <button type="button" class="plPlay" data-act="play" data-i="${i}" aria-label="Play ${esc(titleOf(t))}" data-focus="t:${i}">
        <span class="plNum" aria-hidden="true">${i + 1}</span><span class="plDot" style="background:${esc(colourSafe(t.link))}"></span>
        <span class="plText">${renaming === t.link ? '' : `<span class="plName"><span class="plNameText">${esc(titleOf(t))}</span>${mark ? levelMark(mark === 'playing') : ''}</span>`}<span class="plSub">${esc(playable(t.link) ? genreSafe(t.link) : 'Needs a newer version')}</span></span>
        <span class="plTime" data-time="${esc(t.link)}">${esc(time ?? '')}</span></button>
      ${renaming === t.link ? editField('label', textField(`class="plLabel" data-label="${esc(t.link)}" value="${esc(t.label ?? '')}" maxlength="200" placeholder="${esc(titleOf({ link: t.link }))}" aria-label="Label" data-focus="label"`)) : ''}
      <button type="button" class="plMore" aria-label="Track" aria-haspopup="menu" aria-expanded="${menu?.link === t.link}" data-act="trackMenu" data-link="${esc(t.link)}" data-focus="m:${i}">⋯</button>${menu?.link === t.link ? trackMenu(n, t.link) : ''}</li>`;
  }).join('');
  return `${banner}<div class="plListHead"><button type="button" class="plBack" aria-label="Back" title="All playlists" data-act="back" data-focus="back"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M8.6 2.6 L4.2 7 L8.6 11.4"/></svg></button>${sky(links, 52)}
      <div class="plText"><span class="plTitleRow">${name}</span><span class="plSub" data-total="${totalAttr(n)}">${esc(totalText(n))}</span></div>
      ${key('download', 'download', 'Download .deephouse')}${shareKey(n, ts.length)}
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
  if (!playing || !playlistOf(doc, playing.name)) { label.hidden = true; return; }
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
  switch (a) {
    case 'list': view = { kind: 'list', name: nameOf(el) }; renamingList = false; break;
    case 'back': view = { kind: 'overview' }; renamingList = false; break;
    case 'trackMenu': menu = was && was.link === el.dataset.link ? null : { link: el.dataset.link!, level: 'top', anchor: el.dataset.focus ?? '' }; renaming = null; break;
    case 'menu': menu = was && !was.link ? null : { level: 'top', anchor: 'menu' }; break;
    case 'moveOpen': if (was) menu = { ...was, level: 'move' }; break;
    case 'copyOpen': if (was) menu = { ...was, level: 'copy' }; break;
    case 'moveBack': if (was) menu = { ...was, level: 'top' }; break;
    case 'renameTrack': if (was?.link) { renaming = was.link; render(); focusEnd('.plTrack .plLabel'); } return;
    case 'renameFocus': renamingList = true; render(); focusEnd('[data-rename]'); return;
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
    case 'undo': if (undo) { const back = undo.doc; clearTimeout(undo.timer); undo = null; commit(restore(back, doc), { silent: true }); } break;
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
      if (playing && !playlistOf(doc, playing.name)) playing = null;
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

/** A track from one place in its playlist to another, the playing one's index following it (a drag, or Move up/down). */
function shiftTrack(name: string, from: number, to: number): void {
  if (edit(() => moveTrack(doc, name, from, to), { silent: true })) {
    if (playing && playing.name === name) {
      const p = playing.index;
      playing.index = p === from ? to : p > from && p <= to ? p - 1 : p < from && p >= to ? p + 1 : p;
      deps.control.remember();
    }
    render();
  }
}

/** Reorder by drag (a press and hold on touch). A playlist is removed only by its ⋯ menu, with Undo (his word 10-20). */
function wireGestures(): void {
  if (!section) return;
  let g: { id: number; el: HTMLElement; kind: 'drag' | 'wait'; x: number; y: number; from: number; to: number; hold: number; touch: boolean } | null = null;
  const rowsOf = () => [...section.querySelectorAll<HTMLElement>('.plTracks > li')];
  section.addEventListener('pointerdown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-drag]');
    if (!li || (e.target as HTMLElement).closest('.plMore')) return;
    dragged = false;
    const touch = e.pointerType === 'touch';
    g = { id: e.pointerId, el: li, kind: 'wait', x: e.clientX, y: e.clientY, from: Number(li.dataset.i), to: Number(li.dataset.i), hold: 0, touch };
    if (touch && li.dataset.drag) g.hold = window.setTimeout(() => { if (g && g.kind === 'wait') startDrag(); }, 380);
  });
  const startDrag = () => {
    if (!g) return;
    g.kind = 'drag';
    dragged = true;
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
      const rows = rowsOf();
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
    const v = view;
    if (was.kind === 'drag' && v.kind === 'list' && v.name !== null && was.to !== was.from) shiftTrack(v.name, was.from, was.to);
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
  return { saved, playing: playing && playlistOf(doc, playing.name) ? linksOf(playing.name) : null };
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
  if (fromLink && playlistOf(doc, fromLink.name)) {
    playing = { ...fromLink };
    view = { kind: 'list', name: fromLink.name, from: 'link' };
    d.control.remember();
  } else if (r) {
    const i = indexOfSound(linksOf(r.name), d.control.linkNow(), r.index);
    if (i >= 0 && playlistOf(doc, r.name)) playing = { name: r.name, index: i };
  }
  lastRecord = recordKey();
  d.control.steer({ next: () => step(1, 'skip'), back: () => step(-1, 'back'), leave, place: () => playing && { ...playing } });
  store.subscribe((next) => {
    if (quiet) return;
    // another tab's write or an iCloud merge ends the Undo too: its snapshot predates what arrived
    if (undo && next !== doc) { clearTimeout(undo.timer); undo = null; }
    doc = next;
    if (playing && !playlistOf(doc, playing.name)) playing = null;
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
  if (fromLink) openLibrary('playlists', label);
  fromLink = null;
  syncAppBanner();
  startShellLibrary({ openFile: (f) => void openFile(f), doc: () => doc, link: () => d.control.linkPlaying(), save: (name) => saveInto(name, d.control.linkPlaying()) });
}
