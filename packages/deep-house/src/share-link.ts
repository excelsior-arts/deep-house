// **The ring's link, to copy or share** (moved from the machine view's toolbar, 10-21, to the panel's share circle):
// the address as the ring plays it, the clipboard by the async API or, where that is missing (an iOS home-screen
// web app, a frame, a page over plain http), a selected hidden field inside the press, and a clock's m:ss.

import { normaliseLink } from './playlists.ts';

/**
 * **A clean link to what plays** (his OK 10-21): only the track's own rows, as a playlist's link and a track's
 * Copy link write them (`normaliseLink`: seed, engine, theme, the birds off the house, recipe, mode, reach and the
 * rest of a track's rows), `t` only when `withTime`, on `base` (the page's own origin and path). Whatever else the
 * address carries (`out`, the machine view, a lock, a test flag, a playlist's rows) stays behind. `null` where the
 * address names no track.
 */
export function cleanLink(search: string, base: string, withTime = false): string | null {
  const n = normaliseLink(search.replace(/^\?/, ''));
  if (!n.ok) return null;
  const q = withTime ? n.link : n.link.split('&').filter((kv) => !kv.startsWith('t=')).join('&');
  return `${base}?${q}`;
}

/** A time into the theme as a clock says it: 4:12. */
export const clock = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/**
 * Into the clipboard: the async clipboard where the page has it and it answers,
 * and else a selected hidden field and `execCommand('copy')` — which is what an
 * iOS home-screen web app, and a page inside another's frame, still honour
 * inside the press.
 */
export async function copyText(text: string): Promise<boolean> {
  const fallback = () => {
    // the key keeps the focus (M14, both reviews: the field took it and left it on the page)
    const had = document.activeElement as HTMLElement | null;
    const f = document.createElement('textarea');
    f.value = text;
    f.setAttribute('readonly', '');
    f.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
    document.body.appendChild(f);
    f.focus({ preventScroll: true });
    f.select();
    f.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    f.remove();
    try { if (had && had.isConnected) had.focus({ preventScroll: true }); } catch (e) { /* nothing to focus */ }
    return ok;
  };
  // the fallback first where the async clipboard is known not to be there, so
  // it runs inside the press itself
  if (!navigator.clipboard || !window.isSecureContext) return fallback();
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return fallback(); }
}

