// Two facts about the person at the page, read from the browser and kept
// current: whether they have asked for less motion, and whether they point with
// a finger. The ring and the machine view both ask, and both used to read the
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
