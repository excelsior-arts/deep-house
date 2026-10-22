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
 * (the v2.3.0 cut, 10-19: the panel's row at 390 x 600 lost its sheet).
 * Neither is a tablet, a desktop window or the machine view's corner, which is
 * small in a big window.
 */
export const SMALL_WINDOW = '(max-width: 600px) and (max-height: 600px) and (min-aspect-ratio: 4/5) and (max-aspect-ratio: 5/4)';
export const smallWindow: MediaFact = fact(SMALL_WINDOW);
/**
 * **A phone-size touch screen** (his word 10-21): a finger, and a viewport the panel lays out compact (narrower than
 * 700 or lower than 500, `shellLayout`), so a phone either way round and the app on an iPhone; never a desktop, and
 * never the mini player (`smallWindow`, which callers exclude). The throne is larger there and the menus are a
 * thumb's (index.html says the same query).
 */
export const PHONE_SIZE = '(pointer: coarse) and (max-width: 699px), (pointer: coarse) and (max-height: 499px)';
export const phoneSize: MediaFact = fact(PHONE_SIZE);
