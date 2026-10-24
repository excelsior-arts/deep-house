// **The library in the Apple apps** (PLAN-LIBRARY phase 6): the page's half of the shell's pipe. In a browser there
// is no shell (`window.deepHouseShell`) and every function here does nothing, so the site is unchanged.
//
// - **Files:** "↓ .deephouse" and "Back up everything" hand the text and the name to the shell (a blob download does
//   nothing in a web view): the share sheet on iOS, a save panel on the Mac. "Open a .deephouse file" on iOS asks
//   the shell's document picker; the Mac's is WebKit's own file input. A `.deephouse` opened from outside (Files,
//   Mail, Messages, AirDrop, Finder) arrives as text and opens as the page's own Open does.
// - **iCloud:** the shell hands over the key-value store's value when the page says it is ready, and on every
//   change from another device. The page merges it with `playlists.ts`'s merge, silently, and writes the result
//   back after every local change, debounced. The page owns the merge; the shell is a pipe.
// - **Another iCloud account** (sync-fixes, 10-21): the shell says so with the value (`switched`). A library there is
//   adopted, never merged, and the one here is kept aside first (`keepAside`); an empty store takes this one up, as
//   on a first run. Signed out (`cloud-paused`), nothing is sent and the library here stays.
// - **The keyboard:** the shell posts how far the keyboard covers the page (iOS), which the panel's lift reads
//   before `visualViewport` (`library-panel.ts`).
// - **The fold** (iOS, the iPhone Duo's inner display, round duo-fold): the shell says where the crease runs across
//   the page, or that none does (`library-panel.ts` lays the ring and the panel round it).
// - **The Mac window's buttons** (round duo-fold): where they stand, so the wordmark lines up with them.
// - **The lock screen's Save** (iOS, round lock-like): the shell's feedback command in the system's player asks the
//   page to save what plays, through the throne's own save; the page says whether what plays is saved, and the
//   shell only shows it.
//
// Nothing here changes what plays.

import { readLibrary, mergeLibraries, byRecent, saveTarget, tracksOf } from './playlists.ts';
import type { LibraryStore, LibraryDoc, FileOut } from './playlists.ts';
import { indexOfSound } from './playlist-play.ts';

type Message = { kind: string; [k: string]: unknown };
interface ShellPipe {
  platform: string;
  send(m: { ev: string; [k: string]: unknown }): void;
  on(kind: string, fn: (m: Message) => void): void;
}

/** The shell's pipe, or null in a browser (or an older app without one). */
function pipe(): ShellPipe | null {
  const s = (typeof window !== 'undefined' ? window.deepHouseShell : undefined) as Partial<ShellPipe> | undefined;
  return s && typeof s.send === 'function' && typeof s.on === 'function' ? (s as ShellPipe) : null;
}

/** **Save a file through the shell**; false where there is none, and the page downloads as on the web. */
export function shellSave(f: FileOut): boolean {
  const s = pipe();
  if (!s) return false;
  s.send({ ev: 'save-file', name: f.fileName, text: f.text });
  return true;
}

/** **Share a link through the app's own share sheet** (iOS; his iPhone 10-21: the web view's `navigator.share` did nothing). */
export function shellShareLink(url: string): boolean {
  const s = pipe();
  if (!s || s.platform === 'macos') return false;
  s.send({ ev: 'share-link', url });
  return true;
}

/** **Open a file through the shell's picker** (iOS); false elsewhere, and the page's own file input opens. */
export function shellPick(): boolean {
  const s = pipe();
  if (!s || s.platform === 'macos') return false;
  s.send({ ev: 'pick-file' });
  return true;
}

// --- iCloud -------------------------------------------------------------------

const PUSH_MS = 1500;

/**
 * A document as text that two devices write the same whatever their order: keys sorted, and the playlists by id.
 * Each device keeps its own order of playlists (the merge keeps here's), so order alone never sends a write back,
 * and two devices can't hand one change back and forth.
 */
function canon(doc: LibraryDoc): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    return v;
  };
  const lists = [...doc.playlists].sort((a, b) => String(a.id ?? a.name ?? '').localeCompare(String(b.id ?? b.name ?? '')));
  return JSON.stringify(sort({ ...doc, playlists: lists }));
}
const cloudText = (doc: LibraryDoc): string => JSON.stringify({ ...doc, kind: 'library' });

/**
 * **The library's store, synced through iCloud in the apps.** In a browser it is `inner` itself. In the app, every
 * write here is sent to the cloud after a short pause, and the cloud's value, when the shell hands it over, is
 * merged into this store (its listeners told, as another tab's change is) and sent back when the merge added
 * something the cloud lacks.
 */
export function shellStore(inner: LibraryStore, refused: (message: string) => void = () => {}): LibraryStore {
  const s = pipe();
  if (!s) return inner;
  /** the cloud's document as last heard or written, canonical */
  let cloud: string | null = null;
  /** false until the cloud has been heard once: nothing is written before it is merged, so a fresh device never sends an empty library over a full one */
  let heard = false;
  let off = false;
  /** signed out of iCloud: nothing is sent until the shell hands a value over again */
  let paused = false;
  /**
   * **The cloud's value not yet written here** (the review of 10-21, F2): this store refused the merged document (a
   * full quota), so nothing is sent until it is (what is here lacks what the cloud brought). It is merged again
   * after the next write here that succeeds, and a newer value heard replaces it.
   */
  let pending: Message | null = null;
  let timer = 0;
  const push = () => {
    clearTimeout(timer);
    timer = 0;
    if (off || paused || !heard || pending) return;
    const r = inner.read();
    if (!r.doc) return;
    const c = canon(r.doc);
    if (c === cloud) return;
    cloud = c;
    s.send({ ev: 'cloud-write', text: cloudText(r.doc) });
  };
  const soon = () => { if (!off && !paused && heard) { clearTimeout(timer); timer = window.setTimeout(push, PUSH_MS); } };
  /** The merged document refused here: kept to merge again, and the storage's words said, as a local write's are. */
  const refuse = (m: Message, message: string) => {
    pending = m;
    console.warn(`Deep House: the iCloud library could not be written here (${message}); it is not sent until it is.`);
    refused(message);
  };
  const fromCloud = (m: Message) => {
    pending = null;
    if (off) return;
    const text = typeof m.text === 'string' ? m.text : '';
    const here = inner.read();
    if (!here.doc) return;   // this edition can't read its own record: leave both alone
    heard = true;
    paused = false;
    // another account: what was heard from the last one says nothing about this one's
    if (m.switched === true) cloud = null;
    if (!text) { if (here.doc.playlists.length) push(); return; }
    const there = readLibrary(text);
    if (!there.doc) {
      // a newer edition's library, or a value that doesn't read: never written over
      off = true;
      console.warn(`Deep House: the iCloud library is not read here (${there.error}); it is not synced.`);
      return;
    }
    if (m.switched === true) {
      // **adopted, not merged**: one account's playlists never pour into another's; the library here is kept aside first
      if (here.doc.playlists.length) inner.keepAside(here.doc);
      const w = inner.write(there.doc);
      if (!w.ok) { refuse(m, w.message); return; }
      cloud = canon(there.doc);
      lockSoon();
      if (there.assigned) push();
      return;
    }
    cloud = canon(there.doc);
    const merged = mergeLibraries(here.doc, there.doc);
    const m0 = canon(merged);
    if (m0 !== canon(here.doc)) {
      // published only once written here: a refused write left the old library here, which lacks what came
      const w = inner.write(merged);
      if (!w.ok) { refuse(m, w.message); return; }
      lockSoon();
    }
    if (m0 !== cloud) push();
  };
  s.on('cloud', fromCloud);
  s.on('cloud-paused', () => { paused = true; clearTimeout(timer); });
  s.on('cloud-off', (m) => {
    off = true;
    console.warn(`Deep House: iCloud sync stopped: ${String(m.why ?? '')}`);
  });
  return {
    read: () => inner.read(),
    write(doc) {
      const w = inner.write(doc);
      if (w.ok) {
        // the cloud's value refused before is merged again, after this write's listeners have their document
        if (pending) { const m = pending; window.setTimeout(() => { if (pending === m) fromCloud(m); }, 0); }
        soon();
        lockSoon();
      }
      return w;
    },
    subscribe: (fn) => inner.subscribe(fn),
    keepAside: (doc, now) => inner.keepAside(doc, now),
  };
}

// --- the keyboard -------------------------------------------------------------

let keyboardOverlap: number | null = null;
const keyboardListeners: (() => void)[] = [];

/** How far the keyboard covers the page from the bottom, in CSS pixels, as the shell last said; null in a browser. */
export const shellKeyboard = (): number | null => keyboardOverlap;

/** Called on every keyboard frame the shell posts. */
export function onShellKeyboard(fn: () => void): void {
  keyboardListeners.push(fn);
}

// --- the fold -----------------------------------------------------------------

/** **The crease across the page** (duo-fold): `v` a vertical line at x = `at`, `h` a horizontal one at y = `at`, in CSS px of the layout viewport. */
export interface ShellFold { axis: 'v' | 'h'; at: number }
let fold: ShellFold | null = null;
const foldListeners: (() => void)[] = [];

/** Where the fold runs, as the shell last said; null in a browser, on a screen without one, or in a window not spanning it. */
export const shellFold = (): ShellFold | null => fold;

/** Called whenever the shell says the fold moved, came or went. */
export function onShellFold(fn: () => void): void {
  foldListeners.push(fn);
}

function foldSaid(m: Message): void {
  const at = Number(m.at);
  const next: ShellFold | null = (m.axis === 'v' || m.axis === 'h') && Number.isFinite(at) ? { axis: m.axis, at } : null;
  if (next?.axis === fold?.axis && next?.at === fold?.at) return;
  fold = next;
  for (const fn of foldListeners) fn();
}

// --- the Mac's window buttons ---------------------------------------------------

/** **Where the Mac window's buttons stand** (duo-fold): the leftmost's left edge and their foot, in the page's CSS px (the foot above the page, so below 0). */
export interface ShellChrome { left: number; foot: number }
let chrome: ShellChrome | null = null;
const chromeListeners: (() => void)[] = [];

/** The Mac main window's buttons, as the shell last said; null in a browser, on iOS, in full screen and in the mini player. */
export const shellChrome = (): ShellChrome | null => chrome;

/** Called whenever the shell says the buttons moved, came or went. */
export function onShellChrome(fn: () => void): void {
  chromeListeners.push(fn);
}

function chromeSaid(m: Message): void {
  const left = Number(m.left), foot = Number(m.foot);
  const next = Number.isFinite(left) && Number.isFinite(foot) ? { left, foot } : null;
  if (next?.left === chrome?.left && next?.foot === chrome?.foot) return;
  chrome = next;
  for (const fn of chromeListeners) fn();
}

// --- the lock screen's Save -----------------------------------------------------

/** What the lock screen's Save needs of the page: the library as it stands, what plays, and the throne's save. */
interface LockDeps {
  doc: () => LibraryDoc;
  link: () => string;
  /** the throne's save into a playlist (none named: Saved is made), its words and its motion; false if refused */
  save: (name: string | undefined) => boolean;
}
let lock: LockDeps | null = null;
let lockSaid: boolean | null = null;
let lockTimer = 0;

/** **Is what plays saved**: its sound (the library's own match) in any playlist. */
function lockSaved(d: LockDeps): boolean {
  const link = d.link();
  return byRecent(d.doc()).some((p) => indexOfSound(tracksOf(p).map((t) => t.link), link) >= 0);
}
/** Says the flag to the shell when it changed (or `again`). */
function lockSay(again = false): void {
  const s = pipe();
  if (!s || !lock) return;
  let saved: boolean;
  try { saved = lockSaved(lock); } catch (e) { return; }
  if (saved === lockSaid && !again) return;
  lockSaid = saved;
  s.send({ ev: 'lock-saved', saved });
}
/** After a write, once the page's own copy of the library has caught up. */
function lockSoon(): void {
  if (!lock) return;
  clearTimeout(lockTimer);
  lockTimer = window.setTimeout(() => lockSay(), 0);
}
/**
 * **A press of the lock screen's Save**: the throne's save, with no menu to ask. Two or more playlists: into the most
 * recently modified (the top of the throne's menu). Saved already, in any playlist: nothing (a removal is the panel's,
 * with its Undo).
 */
function lockPress(): void {
  if (!lock) return;
  if (lockSaved(lock)) { lockSay(true); return; }
  const t = saveTarget(lock.doc());
  lock.save(t.kind === 'create' ? undefined : t.kind === 'one' ? t.name : t.names[0]);
  lockSay(true);
}

// --- start --------------------------------------------------------------------

/**
 * **The page is listening** (from `startPlaylists`): a file opened from outside is opened by `openFile`, and the
 * shell may now hand over what waited (a file at a cold launch) and the cloud's value.
 */
export function startShellLibrary(d: { openFile: (f: File) => void } & LockDeps): void {
  const s = pipe();
  if (!s) return;
  // inside the app, the App Store badge in About points at itself: it goes (his word 10-21: the web only)
  document.getElementById('aboutStore')?.remove();
  // the lock screen's Save: the flag follows what plays (a theme, a mix-in, a bird that moves the sound) once a
  // second, which a hidden page's timers still keep, and the library at once (lockSoon)
  lock = { doc: d.doc, link: d.link, save: d.save };
  s.on('lock-save', () => lockPress());
  window.setInterval(() => lockSay(), 1000);
  s.on('file', (m) => {
    const name = typeof m.name === 'string' ? m.name : 'Playlist.deephouse';
    d.openFile(new File([typeof m.text === 'string' ? m.text : ''], name, { type: 'application/json' }));
  });
  s.on('fold', foldSaid);
  s.on('mac-chrome', chromeSaid);
  s.on('keyboard', (m) => {
    const v = Number(m.overlap);
    keyboardOverlap = Number.isFinite(v) && v > 0 ? v : 0;
    for (const fn of keyboardListeners) fn();
  });
  s.send({ ev: 'ready' });
  lockSay(true);
}
