// Facts about the person at the page, read from the browser and kept current:
// whether they have asked for less motion, whether they point with a finger,
// and whether the window is a small one. The ring and the machine view both ask, and both used to read the
// media query once at load and never again — so a listener who turned reduced
// motion on in the system settings with the page open went on watching the
// star sway, the pulse swell and the cast turn (the reconciled review, R53).
//
// One module, one query each, and a change is told to whoever watches: the ring
// rests its decorative motion the moment the preference arrives and takes it
// up again, from where the drawing stands, the moment it goes.

import { report } from './ledger.ts';

/** A media fact: what it is now, and a way to hear when it changes. */
export interface MediaFact {
  readonly on: boolean;
  /** tell me when it changes; returns the way to stop being told */
  watch(fn: (on: boolean) => void): () => void;
}

function fact(query: string): MediaFact {
  const q = typeof matchMedia === 'function' ? matchMedia(query) : null;
  let on = !!q && q.matches;
  const listeners = new Set<(on: boolean) => void>();
  if (q) {
    const told = (e: MediaQueryListEvent) => {
      if (e.matches === on) return;
      on = e.matches;
      for (const fn of listeners) {
        try { fn(on); } catch (err) { console.error(err); report('page', 'a listener to a media query threw', err); }
      }
    };
    // Safari before 14 has only the old pair; nothing here is older than that
    // on a page that plays through an AudioWorklet, but the guard is free.
    if (typeof q.addEventListener === 'function') q.addEventListener('change', told);
    else if (typeof (q as MediaQueryList).addListener === 'function') (q as MediaQueryList).addListener(told);
  }
  return {
    get on() { return on; },
    watch(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

/** `prefers-reduced-motion: reduce` — the ring's decorative motion rests; state still draws. */
export const reducedMotion: MediaFact = fact('(prefers-reduced-motion: reduce)');
/** `pointer: coarse` — a finger, rather than a pointer that can rest on a thing. */
export const coarsePointer: MediaFact = fact('(pointer: coarse)');
/**
 * **The small window** (round apple-mini-2): a viewport no more than 600 CSS px
 * either way and near square (4:5 to 5:4) — the Mac app's mini player (a
 * square of 160 to 600 points), or a browser window or a frame made as small —
 * where the ring stands alone and its words go as its square shrinks
 * (index.html says the same query; ring.ts, the bigger keys and the sheets that
 * do not open). No phone is one: a phone's screen is over 600 the long way,
 * and a phone's browser that its bars cut under 600 (390 x 600, an SE's
 * 375 x 548) is still tall and thin, which is why the square is part of it
 * (the v2.3.0 cut, 10-19: the panel's row at 390 x 600 lost its sheet). And
 * the pointer is part of it (inapp-layout, 10-22): an app's browser under its
 * sheet shows a phone's page near square and under 600 (X's on a 393 x 852
 * phone, about 393 x 487), and a finger is never the mini player, whose
 * pointer is the Mac's. Neither is a tablet, a desktop window or the machine view's corner, which is
 * small in a big window.
 */
export const SMALL_WINDOW = '(pointer: fine) and (max-width: 600px) and (max-height: 600px) and (min-aspect-ratio: 4/5) and (max-aspect-ratio: 5/4)';
export const smallWindow: MediaFact = fact(SMALL_WINDOW);
/**
 * **A phone-size touch screen** (his word 10-21): a finger, and a viewport the panel lays out compact (narrower than
 * 700 or lower than 500, `shellLayout`), so a phone either way round and the app on an iPhone; never a desktop, and
 * never the mini player (`smallWindow`, which callers exclude). The throne is larger there and the menus are a
 * thumb's (index.html says the same query).
 */
export const PHONE_SIZE = '(pointer: coarse) and (max-width: 699px), (pointer: coarse) and (max-height: 499px)';
export const phoneSize: MediaFact = fact(PHONE_SIZE);

/**
 * **The viewport as the page lays itself out in it, read one way everywhere** (iphone-duo round 4, his iPhone Air in
 * an app's browser, turned: "the pivot was kind of jerky … the panel was first right at the bottom, then quickly
 * ascended on the right"). The visual viewport, unless it has not caught up with a turn: a web view on iOS fires
 * `resize` with the window's new size while its visual viewport still has the old one (its shape the other way round,
 * or taller than the window), and may settle later without an event. Then the window's own size is the truth. A
 * pinch (scale off 1) is reported as `zoomed`, and nothing is laid out for it.
 */
export interface PageViewport { w: number; h: number; top: number; left: number; zoomed: boolean }
export function pageViewport(): PageViewport {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const iw = window.innerWidth, ih = window.innerHeight;
  if (!vv) return { w: iw, h: ih, top: 0, left: 0, zoomed: false };
  const zoomed = Math.abs(vv.scale - 1) > 0.01;
  const stale = !zoomed && ((vv.width > vv.height) !== (iw > ih) || vv.height > ih + 1 || vv.width > iw + 1);
  return stale ? { w: iw, h: ih, top: 0, left: 0, zoomed } : { w: vv.width, h: vv.height, top: vv.offsetTop, left: vv.offsetLeft, zoomed };
}

/**
 * **A turn settles in one layout** (round 4): after anything that may move the viewport (a resize, a turn, the visual
 * viewport's own resize, the root's size), the numbers are read again on every frame for a second, and the moment
 * they differ from the ones last laid out the whole layout runs again at once, as one `resize`, so a web view whose
 * visual viewport settles late, or silently, never leaves a stale ring or panel. Nothing runs while they hold still.
 */
const SETTLE_MS = 1000;
let laidSig = '';
let settleUntil = 0;
let settleRaf = 0;
const viewportSig = (): string => {
  const v = pageViewport();
  const o = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.type : '';
  return [window.innerWidth, window.innerHeight, v.w, v.h, v.top, v.left, o].map((x) => (typeof x === 'number' ? x.toFixed(1) : x)).join(' ');
};
/** The layout has just run on the numbers as they are now (a `resize` listener says so). */
export function viewportLaid(): void { laidSig = viewportSig(); }
function settleStep(): void {
  settleRaf = 0;
  if (viewportSig() !== laidSig) window.dispatchEvent(new Event('resize'));
  if (performance.now() < settleUntil) settleRaf = requestAnimationFrame(settleStep);
}
/** Watch the viewport for a second from now. */
export function settleViewport(): void {
  settleUntil = performance.now() + SETTLE_MS;
  if (!settleRaf && typeof requestAnimationFrame === 'function') settleRaf = requestAnimationFrame(settleStep);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // the last listener on `resize` of the page's own: whatever ran before it laid out on these numbers
  queueMicrotask(() => {
    window.addEventListener('resize', () => { viewportLaid(); settleViewport(); });
    window.addEventListener('orientationchange', settleViewport);
    window.visualViewport?.addEventListener('resize', settleViewport);
    if (typeof ResizeObserver === 'function') new ResizeObserver(settleViewport).observe(document.documentElement);
    viewportLaid();
  });
}
