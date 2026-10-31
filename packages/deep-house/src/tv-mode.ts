// **The TV's page** (round tv-scene, his word 10-26: "users can keep phone vertical while TV still shows
// horizontally"). In the Apple app, while Screen Mirroring is on, the app hands the TV a scene of its own and loads
// this same page in it with `view=tv` (a view row: nothing a link plays depends on it). That page is a picture of what
// the phone plays: the ring alone at the TV's size, the wordmark in its corner and the line under the ring. It never
// sounds, never plans a set of its own and never writes anything this browser keeps (the store, the journal, the
// playlists): the phone's page is the one that plays and keeps, and the TV's is told what to draw (`tv-view.ts`).
//
// Read once, before any module that stores anything is evaluated: this module is imported first by `ring.ts`, so
// the guard below is in place before the transport, the journal and the playlists read or write their keys.

import { linkRaw } from './link-table.ts';

/** Whether this page is the TV's: `view=tv` on the address as the page opened. */
export const TV_VIEW: boolean = (() => {
  try { return typeof location !== 'undefined' && linkRaw('view', location.search) === 'tv'; } catch (e) { return false; }
})();

/**
 * **The TV's page keeps nothing** (the brief: "never writes the store, the journal or iCloud"). Its storage is the
 * phone's own (one website data store, so it opens on the phone's place), and so every write to it is made a no-op
 * here, whichever module would make one: the shell says the same at document start (ShellScript.swift), this is the
 * page's own word for it, in a browser too. Reading stays.
 */
if (TV_VIEW && typeof Storage !== 'undefined') {
  try {
    const keep = Storage.prototype;
    Object.defineProperty(keep, 'setItem', { value: function setItem() {}, configurable: true, writable: true });
    Object.defineProperty(keep, 'removeItem', { value: function removeItem() {}, configurable: true, writable: true });
    Object.defineProperty(keep, 'clear', { value: function clear() {}, configurable: true, writable: true });
  } catch (e) { /* a browser that will not let it be written: nothing on the TV's page writes on purpose */ }
}
if (TV_VIEW && typeof document !== 'undefined') document.documentElement.dataset.tv = '';
