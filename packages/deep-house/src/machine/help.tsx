// The manual, at the box it explains.
//
// Eugene (M2): *"a manual excerpt per box: hovering (or a long press on touch)
// a box's title shows one or two compact paragraphs in the tone of a
// professional manual: what kind of stage it is and what it is for here, and,
// where its meaning changes with the birds or the engine, a line saying how."*
//
// The words are data (`manual.json`, keyed by `manualKey`), filled from the box
// as it is described now; this file is the key, the fill, and the one tooltip:
// solid, in the panel's own look, kept while the pointer is on the box it
// explains, faded on leave, and placed beside the box — never over it — or,
// where there is no room beside it (a phone), under or over it. It takes no
// pointer itself: lying over the next box, it must not stop a hand reaching it.

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { MachineNode, MachineSnapshot } from './model.ts';

import { ENTRIES, fill } from './manual.ts';
export { ENTRIES, fill, manualKey, said } from './manual.ts';

/** What one showing carries: the words, and the box it must not cover. */
export interface Showing {
  key: string;
  title: string;
  paras: string[];
  lines: string[];
  now: string;
  rect: { left: number; top: number; right: number; bottom: number };
}

/** An entry, filled and cut to the engine that is playing. */
export function showingOf(key: string, node: MachineNode | null, snap: MachineSnapshot, rect: Showing['rect'], now = ''): Showing | null {
  const e = ENTRIES[key];
  if (!e) return null;
  const lane = node && node.stage === 'sources' ? snap.lanes.find((l) => `lane:${l.id}` === node.id) : null;
  const inst = lane ? lane.playing.join(' · ') : '';
  const f = (t: string) => (node ? fill(t, node, inst) : t);
  const lines: string[] = [];
  if (snap.strategy === 'house-v1' && e.v1) lines.push(f(e.v1));
  if (snap.strategy !== 'house-v1' && e.v2) lines.push(f(e.v2));
  if (e.ring) lines.push(f(e.ring));
  if (e.aside) lines.push(f(e.aside));
  // the box's own name after the entry's, unless the entry's already says it
  const said = node && !e.title.toLowerCase().includes(node.label.toLowerCase().replace(/^bus /, ''));
  // one "now" only (M6: *"Now: −120 dB." then "now: gain −120 dB"*): where the
  // entry's own sentence carries a reading, the raw line is not added
  const carries = [...e.text, e.v1, e.v2, e.ring, e.aside].some((t) => t && t.includes('{r:'));
  return { key, title: said ? `${e.title} — ${node!.label}` : e.title, paras: e.text.map(f), lines, now: carries ? '' : now, rect };
}

/**
 * **A key's page** (M8, Eugene: *"when I press SENDS OFF in the boxes, what
 * does it mean?"*): the popovers' keys and faders have pages of their own,
 * keyed `key:<what>`, with the boxes' grace; the key itself is the target, and
 * the page stands beside the popover it is in, never over it.
 */
const isKey = (s: Showing) => s.key.startsWith('key:');
function showingKey(key: string, rect: Showing['rect']): Showing | null {
  const e = ENTRIES[key];
  if (!e) return null;
  return { key, title: e.title, paras: [...e.text], lines: [e.ring, e.aside].filter((x): x is string => !!x), now: '', rect };
}
/** A popover key's hover, as props: a mouse resting on it opens its page. */
export function keyHelp(key: string) {
  const rectOf = (el: HTMLElement) => {
    const r = (el.closest('.desk-pop') ?? el).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  return {
    'data-page': key,
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') ask(showingKey(key, rectOf(e.currentTarget))); },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') leave(); },
  };
}

// --- the one tooltip -----------------------------------------------------------

let current: Showing | null = null;
let fading = false;
let timer = 0;
const listeners = new Set<() => void>();
let snapshot: { current: Showing | null; fading: boolean } = { current, fading };
const tell = () => { snapshot = { current, fading }; for (const fn of listeners) fn(); };

/** Show this one now (a pointer on a box), replacing whatever was up. */
export function show(s: Showing | null): void {
  window.clearTimeout(timer);
  if (!s) return;
  if (current && current.key === s.key && !fading && current.rect.left === s.rect.left) return;
  current = s;
  fading = false;
  tell();
}
/** Let it go: fade after a moment, unless a pointer comes back onto it. */
export function hide(after = 220): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    fading = true;
    tell();
    timer = window.setTimeout(() => { current = null; fading = false; tell(); }, 160);
  }, after);
}
/**
 * **A page opens for a pointer that stays** (M4, Eugene: *"if I move my mouse
 * around they shouldn't pop up, only if I stay over the box for longer"*): a
 * pointer must rest on a box `HELP_DELAY` before its page opens, and moving off
 * the box starts over. Once a page is up, the next box's opens after
 * `HELP_SWITCH`, as a toolbar's do. A finger's half-second hold is its own.
 */
export const HELP_DELAY = 650;
export const HELP_SWITCH = 150;
let pending: { s: Showing; t: number } | null = null;
/** what the pointer is resting on now, whether or not its page may open */
let resting: Showing | null = null;
const cancel = () => { if (pending) { window.clearTimeout(pending.t); pending = null; } };
/**
 * **A popover is the hand at work, and the manual waits** (M4): while one is
 * open no page opens, and one opening closes whatever page was up.
 */
const busy = () => typeof document !== 'undefined' && !!document.querySelector('#machine .desk-pop');
/** A popover opened: the page goes at once. */
export function quiet(): void { cancel(); window.clearTimeout(timer); current = null; fading = false; tell(); }
/** A popover closed: the pointer still resting on a title asks again, from the start. */
export function resume(): void { if (resting) { const s = resting; resting = null; cancel(); ask(s); } }
/** A pointer is on a box's title: its page opens if it stays. Nothing: it is on the box's body. */
export function ask(s: Showing | null): void {
  if (!s) { leave(); return; }
  resting = s;
  if (busy() && !isKey(s)) { cancel(); return; }
  if (pending && pending.s.key === s.key) { pending.s = s; return; }
  cancel();
  if (current && !fading && current.key === s.key) { window.clearTimeout(timer); return; }
  const wait = current ? HELP_SWITCH : HELP_DELAY;
  pending = { s, t: window.setTimeout(() => { const x = pending; pending = null; if (x && (!busy() || isKey(x.s))) show(x.s); }, wait) };
}
/** The pointer left the title: nothing waits to open, and what is open fades. */
export function leave(): void { resting = null; cancel(); if (current) hide(); }

/**
 * **Nothing outlives the view** (M14, the review of 09-26): the tooltip's state lives here,
 * at module level, and a page up when the view closed by a key came back at
 * once on the next open, over nothing. The Help that mounts clears it, and so
 * does the one that unmounts: its state is its mount's.
 */
function clearAll(): void {
  cancel();
  window.clearTimeout(timer);
  current = null; fading = false; resting = null;
  tell();
}

/**
 * A box's hover and long press, as props for its outer `<g>`. A mouse asks on
 * entering (and opens only if it stays) and lets go on leaving; a finger shows after a still half-second and
 * swallows the click that ends it, so a long press on a key opens nothing.
 */
export function useHelp(get: (e: ReactPointerEvent<SVGGElement>, el: SVGGElement) => Showing | null) {
  const press = useRef<{ t: number; x: number; y: number; fired: boolean } | null>(null);
  const on = (e: ReactPointerEvent<SVGGElement>) => ask(get(e, e.currentTarget));
  return {
    onPointerEnter: (e: ReactPointerEvent<SVGGElement>) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') on(e); },
    onPointerMove: (e: ReactPointerEvent<SVGGElement>) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') on(e);
      else if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) { window.clearTimeout(press.current.t); press.current = null; } },
    onPointerLeave: (e: ReactPointerEvent<SVGGElement>) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') leave(); },
    onPointerDown: (e: ReactPointerEvent<SVGGElement>) => {
      if (e.pointerType !== 'touch') return;
      const el = e.currentTarget;
      const at = { x: e.clientX, y: e.clientY };
      const t = window.setTimeout(() => {
        const s = get({ ...e, clientX: at.x, clientY: at.y } as ReactPointerEvent<SVGGElement>, el);
        if (s && !busy()) { show(s); if (press.current) press.current.fired = true; }
      }, 500);
      press.current = { t, ...at, fired: false };
    },
    onPointerUp: () => { if (press.current && !press.current.fired) { window.clearTimeout(press.current.t); press.current = null; } },
    onPointerCancel: () => { if (press.current) { window.clearTimeout(press.current.t); press.current = null; } },
    onClickCapture: (e: ReactMouseEvent) => {
      if (press.current && press.current.fired) { e.stopPropagation(); e.preventDefault(); }
      press.current = null;
    },
  };
}

/** The tooltip itself, in `#machine`. */
export function Help() {
  useLayoutEffect(() => { clearAll(); return clearAll; }, []);
  const { current: s, fading: out } = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => snapshot, () => snapshot,
  );
  const el = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    if (!s || !el.current) return;
    const b = el.current.getBoundingClientRect();
    const r = s.rect;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const clampY = (y: number) => Math.max(8, Math.min(y, vh - b.height - 8));
    const clampX = (x: number) => Math.max(8, Math.min(x, vw - b.width - 8));
    // beside the box, right then left; else under it, else over it — never on
    // it, and never on a strip's keys or an open popover (M4): the first place
    // of those that covers nothing a hand works
    // (a key's page, M8, is kept off the popover it explains as well)
    const keep = [...document.querySelectorAll('#machine .desk-strip [role="button"], #machine .desk-pop')]
      .map((k) => k.getBoundingClientRect()).filter((k) => k.width && k.bottom > 0 && k.top < vh);
    const clear = (x: number, y: number) => keep.every((k) => x + b.width <= k.left || x >= k.right || y + b.height <= k.top || y >= k.bottom);
    const places: Array<[number, number]> = [];
    if (r.right + 10 + b.width <= vw - 8) places.push([r.right + 10, clampY(r.top)]);
    if (r.left - 10 - b.width >= 8) places.push([r.left - 10 - b.width, clampY(r.top)]);
    if (r.bottom + 8 + b.height <= vh - 8) { places.push([clampX(r.left), r.bottom + 8]); places.push([8, r.bottom + 8]); }
    if (r.top - 8 - b.height >= 8) { places.push([clampX(r.left), r.top - 8 - b.height]); places.push([8, r.top - 8 - b.height]); }
    const at = places.find(([x, y]) => clear(x, y)) ?? places[0] ?? [clampX(r.left), Math.max(8, r.top - 8 - b.height)];
    // drawn at the type step's zoom (M6), whose own left and top are zoomed
    // with it: the place is written in the page's pixels divided by it (M8)
    const z = parseFloat(getComputedStyle(el.current).zoom) || 1;
    setAt({ left: at[0] / z, top: at[1] / z });
  }, [s]);
  // a finger elsewhere puts it away
  useLayoutEffect(() => {
    if (!s) return;
    const away = (e: PointerEvent) => { if (e.pointerType === 'touch' && !el.current?.contains(e.target as Node)) hide(0); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [s]);
  const host = typeof document !== 'undefined' ? document.getElementById('machine') : null;
  if (!s || !host) return null;
  return createPortal(
    // it takes no pointer (pointer-events: none), so it has no hover of its own
    <div ref={el} className={`help${out ? ' out' : ''}`} role="tooltip" data-help={s.key} style={at}>
      <div className="help-title">{s.title}</div>
      {s.paras.map((p, i) => <p key={i}>{p}</p>)}
      {s.lines.map((p, i) => <p key={`l${i}`} className="help-line">{p}</p>)}
      {s.now ? <p className="help-now">now: {s.now}</p> : null}
    </div>,
    host,
  );
}
