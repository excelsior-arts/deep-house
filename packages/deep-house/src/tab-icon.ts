// The tab's icon, in the ring's colour (Eugene, 10-12: *"it would be a nice
// feature to follow ring UI color"*).
//
// The page ships one icon, the sigil in pale gold on a black disc, written into
// `index.html` as an SVG data URL; that stays the icon before any script runs.
// From then on the ring hands this module every colour it wears (`wearColour`
// in `ring.ts`, the one place the gradient steps), and the icon is drawn again
// in **the pale gold re-based onto the ring's ink** — the same rule every fixed
// colour on the ring is re-based by (`restyle`), so at the house it comes back
// `#ffe0a0` to the byte and the href is the shipped one exactly. Same geometry,
// same black disc: the disc is what lets it read on a light strip and a dark
// one alike.
//
// **Legibility.** The icon's ink is lifted in OKLab lightness (never in hue)
// until it clears ICON_FLOOR against the black disc. Across the whole space the
// re-based pale gold never comes near it — its lowest is about 11.6:1, at a
// warm pink corner — so the floor is a guard and not a tint.
//
// **Cost.** A string template, no canvas and no request. Only a changed ink is
// written, and at most once every ICON_EVERY ms: the first write goes at once
// (a deep link's colour is on the tab the moment the ring wears it, with no gold
// in between), later ones wait out the interval and the last one asked for is
// the one that lands.
//
// **Safari** only rereads an icon whose `<link>` is new, so the element is
// replaced (a clone with the new href, in the same place in the head) rather
// than having its href changed; Chrome and Firefox take either.

import { applyRel, relTo, type RingColour } from './ring-colour.ts';

/** The pale gold the shipped icon is drawn in. */
export const ICON_GOLD = '#ffe0a0';
/** The contrast the icon's ink keeps against its black disc, as WCAG counts it. */
export const ICON_FLOOR = 10;
/** The least time between two writes of the icon, in ms. */
export const ICON_EVERY = 400;

const ICON_REL = relTo(ICON_GOLD);
/** The icon's ink for a colour the ring wears: its pale gold, re-based (`restyle`'s rule, at the icon's floor). */
export const iconInk = (colour: Pick<RingColour, 'fit' | 'C' | 'h'>): string =>
  applyRel(ICON_REL, colour.fit, colour.C, colour.h, ICON_FLOOR);

/** The icon as a data URL, byte for byte the one `index.html` carries when `ink` is the gold. */
export function iconHref(ink: string): string {
  const c = `%23${ink.slice(1)}`;
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' width='16' height='16'%3E"
    + "%3Ccircle cx='8' cy='8' r='8' fill='%23000'/%3E"
    + `%3Cg fill='none' stroke='${c}' stroke-linejoin='miter'%3E`
    + "%3Ccircle cx='8' cy='8' r='6.75' stroke-width='1'/%3E"
    + "%3Cpath d='M8 2.94 L13.06 8 L8 13.06 L2.94 8 Z' stroke-width='0.9'/%3E"
    + "%3Cpath d='M4.42 4.42 L11.58 4.42 L11.58 11.58 L4.42 11.58 Z' stroke-width='0.9'/%3E%3C/g%3E"
    + `%3Cpath d='M6.5 5.5 L10.6 8 L6.5 10.5 Z' fill='${c}'/%3E%3C/svg%3E`;
}

const SELECTOR = 'link[rel="icon"][type="image/svg+xml"]';
let written = ICON_GOLD;              // what the tab carries: the page's own gold until a write
let wanted = ICON_GOLD;               // what was last asked for
let wroteAt = -Infinity;
let timer: ReturnType<typeof setTimeout> | 0 = 0;

function write() {
  timer = 0;
  if (wanted === written) return;
  const old = document.querySelector<HTMLLinkElement>(SELECTOR);
  if (!old) return;                   // a page without the icon has nothing to recolour
  const next = old.cloneNode() as HTMLLinkElement;
  next.setAttribute('href', iconHref(wanted));
  old.replaceWith(next);
  written = wanted;
  wroteAt = performance.now();
}

/** The ring has put on a colour: the tab follows, if its ink moved. */
export function wearIcon(colour: RingColour): void {
  wanted = iconInk(colour);
  if (timer) return;                  // the write already waiting will take it
  if (wanted === written) return;
  const wait = wroteAt + ICON_EVERY - performance.now();
  if (wait <= 0) write();
  else timer = setTimeout(write, wait);
}
