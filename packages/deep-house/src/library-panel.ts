// **The panel and its one key, the gyroscope** (PLAN-LIBRARY §2, phase 2; his
// word 10-20: "three things on the page: the title, the ring and the
// gyroscope"). The footer went: its name moved to the foot of the About tab,
// and its gear became the machine-view key in the panel's corner.
//
// - **The gyroscope, a scroll since star-keys** (10-22, `scroll-glyph.ts`;
//   the element and the names stay `gyro`) stands right of the ring at its
//   middle in landscape, under it in portrait, and in the bottom-right corner
//   of a small window (the mini player, `smallWindow`). It hides while the
//   panel is open, and the panel unrolls out of it (`unroll`).
// - **The panel floats**: a rounded rectangle held in from the edges, a thin
//   line in the ring's colour, no glow, no shadow. Landscape: the ring moves
//   into the left 3/5 and scales; the panel takes the right 2/5, as tall as
//   the ring and centred on it. Portrait: the ring in the top 3/5, the panel in
//   the bottom 2/5, the title stepping aside. A small window: the panel lies
//   over the dimmed ring.
// - **The ring moves as one piece**: one transform on `#stage`, so nothing on
//   it is redrawn and every motion keeps its phase (ring rules). The ring's
//   own hit-testing reads the stage's transformed box (`readSquare`, ring.ts).
// - **It is a non-modal `<dialog>`**: the ring beside it stays live. It
//   closes by its × and by Esc (the page's keydown, ring.ts — the only key
//   besides Space, and only while it is open). Focus goes in the way the old
//   About's did and comes back to the key that opened it, the gyroscope.
// - **Not in the address**: a reload comes back closed.
//
// Tabs are read off the markup (`[role=tab][data-tab]` and a `[role=tabpanel]`
// of the same `data-tab`), so a third tab is a button and a section in
// index.html and nothing here.
import { reducedMotion, smallWindow, coarsePointer, pageViewport } from './motion.ts';
import { shellKeyboard, onShellKeyboard, shellFold, shellMid, onShellFold, shellChrome, onShellChrome, onShellDrag, shellNameBack, type ShellFold } from './shell-library.ts';
import { bezier } from './gyro-glyph.ts';
import { scrollDrawing, SCROLLS, SCROLL_PICK, type ScrollDetail } from './scroll-glyph.ts';
import { linkRaw } from './link-table.ts';
import { balanced, NARROW, PL_PAD, PL_PAD_FULL, NAME_TALL, ringPlace, LINE_TOP, LINE_H, NAME_CAP, NAME_WIDTH, shellLayout, type PanelMode, type Box, type ShellLayout, type NameCorner } from './shell-layout.ts';
export { ringPlace, shellLayout, type PanelMode, type Box, type ShellLayout, type NameCorner } from './shell-layout.ts';

/** Which of the scrolls the key draws: `?scroll=N` on the prototype (star-keys round 3), else the pick. */
const SCROLL_VARIANT = (() => { const v = Number(linkRaw('scroll')); return v >= 1 && v <= SCROLLS.length ? v : SCROLL_PICK; })();

export interface PanelDeps {
  /** Today's machine view, as the gear opened it. */
  openMachine: () => void;
  /** Put the focus back on a key by the page's rule (K24). */
  focusBack: (key: Element) => void;
  /** Whether the last input was a key. */
  byKey: () => boolean;
  /** Something to put away first (the phone's bird panel). */
  beforeOpen?: () => void;
}

const root = document.documentElement;
const gyroEl = document.getElementById('gyro') as HTMLButtonElement | null;
const sheet = document.getElementById('library') as HTMLDialogElement | null;
let opener: Element | null = null;
let deps: PanelDeps | null = null;

/** The viewport the page is seen in, as `fitViewport` (ring.ts) reads it. */
function viewport() {
  // one reader for the ring and the panel (round 4): the visual viewport, or the window where it lags a turn
  return pageViewport();
}

const px = (v: number) => `${v.toFixed(2)}px`;
/** A move by (x, y) px after a scale by `k` about the stage's centre, as one CSS matrix. */
const stageMatrix = (k: number, x: number, y: number): string => `matrix(${k.toFixed(4)}, 0, 0, ${k.toFixed(4)}, ${x.toFixed(2)}, ${y.toFixed(2)})`;
function place(el: HTMLElement, b: Box, left: number, top: number) {
  el.style.left = px(left + b.x);
  el.style.top = px(top + b.y);
  el.style.width = px(b.w);
  el.style.height = px(b.h);
}
/**
 * **The sheet on whole pixels** (round 7, his word 10-22 from the phone: "something is not right with paper corners"):
 * its edges at whole CSS px, so its 1 px line falls on one row of pixels and reads crisp, not two soft ones (the
 * phone's panel stood at 0.6 × 844 = 506.4).
 */
function whole(b: Box): Box {
  const x = Math.round(b.x), y = Math.round(b.y);
  return { x, y, w: Math.round(b.x + b.w) - x, h: Math.round(b.y + b.h) - y };
}

/**
 * **Wide or tall, from what a keyboard does not change** (his iPhone, 10-20: the panel flipped to the side as the
 * keyboard opened, since the height it left read wider than tall). On a touch device, the screen's orientation;
 * elsewhere the window's own shape.
 */
function wideNow(w: number, h: number): boolean {
  // **the shape laid out is the shape decided** (round 4): the window's own, except while a keyboard is up on a touch
  // screen (the visible height well under the window's), where the screen's orientation says it; the screen's
  // orientation alone told a turn's first `resize` the old way round and put the panel under the ring for a frame
  const vv = window.visualViewport;
  const keyboardUp = !!vv && vv.height < window.innerHeight - KEYBOARD_GAP && (vv.width > vv.height) === (window.innerWidth > window.innerHeight);
  if (coarsePointer.on && keyboardUp) {
    const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
    if (type) return type.startsWith('landscape');
    const o = (window as { orientation?: number }).orientation;
    if (typeof o === 'number') return Math.abs(o) === 90;
    try { return matchMedia('(orientation: landscape)').matches; } catch (e) { /* none */ }
  }
  return w > h;
}

/** A visible height this far under the window's is a keyboard's, not a turn's. */
const KEYBOARD_GAP = 120;

// **A field being typed in holds the layout** (his iPhone, 10-20): the keyboard shrinks the visible height, and
// nothing about the ring or the panel may follow it. While a text, date or select field in the panel has focus,
// the layout and the ring's size (`fitViewport`, ring.ts) stay as they were; they are read again a moment after it
// lets go, once the keyboard has gone. A rotation lets go of the field first.
const isField = (el: Element | null): boolean =>
  !!el && sheet !== null && sheet.contains(el) && (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes((el as HTMLInputElement).type)));
let typing = false;
let releaseTimer = 0;
/** Whether the keyboard holds the layout now. */
export const keyboardHold = (): boolean => typing;
/**
 * **The panel rides above the keyboard** (his iPhone, 10-20: the keyboard covered the whole panel, which is fixed at
 * the foot of the layout viewport and which iOS does not move). While a field is typed in, the panel alone is lifted
 * by a transform so its foot sits on the visible area's (`visualViewport`), capped to the visible height where it
 * would not fit, and the field is scrolled into sight inside it. The ring stays where it is, under it.
 */
const LIFT_MARGIN = 6;
function liftPanel(): void {
  if (!sheet || !typing || !sheet.open) return;
  const vv = window.visualViewport;
  // in the app, the keyboard's real frame from the shell, before what the visual viewport says (shell-library.ts)
  const kb = shellKeyboard();
  const top = vv ? vv.offsetTop : 0, height = kb !== null ? window.innerHeight - kb : vv ? vv.height : window.innerHeight;
  const baseTop = sheet.offsetTop;
  const fits = height - 2 * LIFT_MARGIN;
  const h = Math.min(sheet.offsetHeight, fits);
  sheet.style.maxHeight = sheet.offsetHeight > fits ? `${fits.toFixed(1)}px` : '';
  let dy = Math.min(0, top + height - LIFT_MARGIN - (baseTop + h));
  if (baseTop + dy < top + LIFT_MARGIN) dy = top + LIFT_MARGIN - baseTop;
  sheet.style.transform = Math.abs(dy) > 0.5 ? `translateY(${dy.toFixed(1)}px)` : '';
  const el = document.activeElement as HTMLElement | null;
  if (el && isField(el)) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* none */ } }
}
/** and back down with the keyboard, on the same short ease */
function lowerPanel(): void {
  if (!sheet) return;
  sheet.style.transform = '';
  sheet.style.maxHeight = '';
}
function release(): void {
  typing = false;
  delete root.dataset.typing;
  lowerPanel();
  window.dispatchEvent(new Event('resize'));
}

/** The ring's square as the last layout laid it, at rest and its open move (`layShell`), and the viewport's size. */
let ringLaid: RingLaid | null = null;
/**
 * **What the Mac's mini player must not take for a move** (his report 10-21): it drags the window by a press on the
 * black outside the ring's circle, where the gyroscope stands and the open panel's × and keys are. The page says
 * where its keys are and whether the panel is up, and the shell leaves those presses to the page (MiniPlayer.swift).
 * It says where the ring stands too, for the size it is laid at (mac-shell-resize, PageHost.swift).
 */
function tellShellKeys(): void {
  const s = (window as { deepHouseShell?: { send?: (m: unknown) => void } }).deepHouseShell;
  if (!s || typeof s.send !== 'function') return;
  const keys: number[][] = [];
  // the scroll, and love, which holds the throne's place in this field (star-keys)
  for (const el of sheet?.open ? [] : [gyroEl, document.getElementById('love')]) {
    const r = el?.getBoundingClientRect();
    if (r && r.width) keys.push([r.left, r.top, r.width, r.height]);
  }
  // and where the ring stands for the size the page is laid at (`ringLaid`): the Mac's window keeps the ring there
  // while WebKit's picture catches up with a resize (PageHost.swift)
  const ring = ringLaid && ringSaid(ringLaid);
  s.send({ ev: 'page-keys', panel: !!sheet?.open, keys, ...(ring ? { ring } : {}) });
}
type RingLaid = { w: number; h: number; cx: number; cy: number; side: number; dx: number; dy: number; k: number; panel: Box; name: Box | null; over: boolean; mode: PanelMode };
/**
 * The ring's square as it stands on the screen, in the page's points: at rest, or moved by the open panel (1 at [5]);
 * then the open panel's box (panel-resize: the Mac's window carries the ring and the paper together through a drag),
 * and the wordmark's ink box in its corner (the window keeps it there), each [x, y, w, h] and zeros where there is none.
 */
function ringSaid(r: RingLaid): number[] {
  const open = root.dataset.panel != null && root.dataset.view !== 'machine';
  const box = (b: Box | null) => (b ? [b.x, b.y, b.w, b.h] : [0, 0, 0, 0]);
  // the wordmark over the ring goes while the panel is open, under it or beside it (index.html; panel-fit)
  const name = r.over && open && r.mode !== 'mini' ? null : r.name;
  return [...(open ? [r.w, r.h, r.cx + r.dx, r.cy + r.dy, r.side * r.k, 1] : [r.w, r.h, r.cx, r.cy, r.side, 0]),
    ...box(open ? r.panel : null), ...box(name)].map((x) => Math.round(x * 100) / 100);
}
/**
 * The ring laid at `w` × `h`; the wordmark in its corner (`l.name`), or, `over` (a window narrow and upright), centred
 * over the ring at its stylesheet size (index.html `NAME_OVER`), or none (a small window).
 */
function ringOf(w: number, h: number, l: ShellLayout, panel: Box, over: boolean, small: boolean): RingLaid {
  let name: Box | null = l.name ? { x: l.name.x, y: l.name.y, w: l.name.w, h: l.name.h } : null;
  if (!name && over && !small) {
    const fs = l.nameFs ?? Math.max(24, Math.min(0.044 * Math.min(w, h), 32)), ch = NAME_CAP * fs, iw = ch * NAME_WIDTH;
    name = { x: w / 2 - iw / 2, y: 16 + safeInsets()[2] + 0.254 * fs, w: iw, h: ch };
  }
  return { w, h, cx: w / 2 + l.stage.dx, cy: h / 2 + l.stage.dy, side: l.stage.side, ...l.ring, panel, name, over, mode: l.mode };
}
/**
 * **Where the ring would stand were the page laid out at `w` × `h`** (mac-shell-resize): the Mac's window holds the
 * page at its size through a hand's resize and shows its picture scaled onto the window's (PageHost.swift), asking
 * this at each new size so the ring stands where the page will lay it. `layShell`'s own rule, with what it reads off
 * the page (a small window, the wordmark upright over the ring or in its corner) taken for that size.
 */
function ringAt(w: number, h: number): number[] {
  const v = viewport();
  const small = !coarsePointer.on && w <= 600 && h <= 600 && w / h >= 0.8 && w / h <= 1.25;
  const over = w <= 699 && h >= w;
  const corner = small || over ? null : nameCornerAt(v, Math.min(w, h));
  const l = shellLayout(w, h, small, w > h, over ? nameFoot(v.top) : 0, sideInsets(), foldNow(v), corner, !coarsePointer.on, null, endInsets(v));
  return ringSaid(ringOf(w, h, l, whole(l.panel), over, small));
}
{
  const s = (window as { deepHouseShell?: { send?: (m: unknown) => void; on?: (kind: string, fn: (m: Record<string, unknown>) => void) => void } }).deepHouseShell;
  if (s && typeof s.on === 'function' && typeof s.send === 'function') {
    const send = s.send;
    s.on('ring-at', (m) => {
      const w = Number(m.w), h = Number(m.h);
      // (a Debug tour's question, `judge`, is answered as such: the shell keeps it apart from what it steers by)
      if (w >= 1 && h >= 1) send({ ev: 'ring-at', ring: ringAt(w, h), ...(m.judge ? { judge: true } : {}) });
    });
  }
}
// love is laid by the ring after the shell's own layout: say again once it has stood
window.addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(tellShellKeys)));
requestAnimationFrame(() => requestAnimationFrame(tellShellKeys));

let laidMode = '';
let laidShape = '';
let turnRaf = 0;
/** Lay the gyroscope, the panel and the ring's open transform for the viewport as it is. */
export function layShell(): void {
  if (typing) return;
  const v = viewport();
  if (v.zoomed) return;   // a pinch is the reader looking closer and moves nothing
  const l = shellLayout(v.w, v.h, smallWindow.on, wideNow(v.w, v.h), nameFoot(v.top), sideInsets(), foldNow(v), nameCorner(v), !coarsePointer.on, midNow(v), endInsets(v));
  placeName(l);
  if (gyroEl) place(gyroEl, l.gyro, v.left, v.top);
  const panel = whole({ ...l.panel, x: l.panel.x + v.left, y: l.panel.y + v.top });
  laid = { gyro: { ...l.gyro, x: l.gyro.x + v.left, y: l.gyro.y + v.top }, panel };
  ringLaid = ringOf(v.w, v.h, l, whole(l.panel), typeof matchMedia === 'function' && matchMedia(NAME_OVER).matches, smallWindow.on);
  tellShellKeys();
  nameBack();
  const detail: ScrollDetail = l.mode === 'mini' ? 'mini' : 'key';
  if (detail !== gyroDetail || !gyroG?.childElementCount) { gyroDetail = detail; drawGyro(); }
  if (sheet) {
    place(sheet, panel, 0, 0);
    sheet.dataset.density = l.compact ? 'compact' : 'roomy';
    const k = l.mode === 'mini' ? 1 : panelType(panel.w, l.compact);
    if (k < 1) sheet.style.setProperty('--pk', k.toFixed(3)); else sheet.style.removeProperty('--pk');
    if (l.compact && l.mode !== 'mini' && panel.w < NARROW) sheet.dataset.narrow = ''; else delete sheet.dataset.narrow;
    // the Playlists tab's side padding in a compact panel (index.html `--pl-pad`): a phone's, wider with the panel
    const pad = PL_PAD * (1 + Math.max(0, Math.min(1, (panel.w - NARROW) / (PL_PAD_FULL - NARROW))));
    if (l.compact && l.mode !== 'mini') sheet.style.setProperty('--pl-pad', px(pad)); else sheet.style.removeProperty('--pl-pad');
  }
  // **a turn lands in one frame** (round 4): where the panel's mode or the window's shape changes, the ring's and the
  // panel's eases are held for the frame the new layout lands in (`data-turning`, index.html), so the ring does not
  // glide from where it stood in the old shape; an open panel whose mode changed fades in briefly where it now stands
  const shape = v.w > v.h ? 'wide' : 'tall';
  const turned = (laidMode !== '' && laidMode !== l.mode) || (laidShape !== '' && laidShape !== shape);
  if (turned) {
    root.dataset.turning = '';
    if (sheet?.open && laidMode !== l.mode && !reducedMotion.on) {
      sheet.classList.remove('turnIn');
      void sheet.offsetWidth;
      sheet.classList.add('turnIn');
    }
    cancelAnimationFrame(turnRaf);
    turnRaf = requestAnimationFrame(() => { turnRaf = requestAnimationFrame(() => { delete root.dataset.turning; }); });
  }
  laidMode = l.mode;
  laidShape = shape;
  root.dataset.panelMode = l.mode;
  nowYields(v.h, l);
  // the ring at rest, where the wordmark makes it give way (`ringPlace`); nothing said where it does not, so the
  // stylesheet's own square and middle stand as they always have
  const full = Math.min(0.94 * Math.min(v.w, v.h), 960);
  if (l.stage.side < full - 0.01) root.style.setProperty('--ring-fit', px(l.stage.side)); else root.style.removeProperty('--ring-fit');
  if (Math.abs(l.stage.dy) > 0.01) root.style.setProperty('--ring-dy', px(l.stage.dy)); else root.style.removeProperty('--ring-dy');
  // the stage's move at rest and with the panel open, each one matrix (index.html, panel-motion): the open one is the
  // rest's move, then the panel's move and scale about the ring's centre
  const rx = Math.abs(l.stage.dx) > 0.01 ? l.stage.dx : 0, ry = Math.abs(l.stage.dy) > 0.01 ? l.stage.dy : 0;
  if (rx || ry) root.style.setProperty('--ring-m', stageMatrix(1, rx, ry)); else root.style.removeProperty('--ring-m');
  root.style.setProperty('--open-m', stageMatrix(l.ring.k, rx + l.ring.dx, ry + l.ring.dy));
  const folded = foldNow(v);
  // what the page laid round (the shell's tours read it): the fold's axis, while one cuts the page
  if (folded && l.mode !== 'mini') root.dataset.fold = folded.axis; else delete root.dataset.fold;
}

/**
 * **The wordmark's corner** (duo-fold), in the visible area's coordinates: where it stands in one (not the phone held
 * upright, which centres it over the ring; not a small window, which has none). In a browser, where index.html puts it
 * (20 px in and 16 px down, past the safe area; its ink 0.082 em in and its cap line 0.254 em down); in the Mac app,
 * its ink's left edge on the leftmost window button's and its cap line `NAME_STEP` under their foot (`shellChrome`).
 */
const NAME_STEP = 16;
function nameCorner(v: { left: number; top: number }): NameCorner | null {
  if (smallWindow.on || typeof matchMedia !== 'function' || matchMedia(NAME_OVER).matches) return null;
  return nameCornerAt(v, Math.min(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight));
}
/** The wordmark's corner in a window whose shorter side is `vmin`, neither small nor upright. */
function nameCornerAt(v: { left: number; top: number }, vmin: number): NameCorner | null {
  if (!nameImg) return null;
  const fs = Math.max(24, Math.min(0.044 * vmin, 32));
  const c = shellChrome();
  if (c) return { left: c.left - v.left, top: c.foot + NAME_STEP - v.top, ax: 0, ay: 0, fs };
  const [l, , t] = safeInsets();
  return { left: 20 + l - v.left, top: 16 + t - v.top, ax: 0.082, ay: 0.254, fs };
}
/**
 * **The wordmark is the window's through a drag of its edge** (panel-resize): the Mac app shows its own in the
 * corner from the press, and the page's is put away (`data-name-away`, index.html) until its first layout at the size
 * the hand let go at, which says so (`nameBackAt`).
 */
let nameBackAt: { w: number; h: number } | null = null;
onShellDrag((d) => {
  if (d.on) { nameBackAt = null; root.dataset.nameAway = ''; return; }
  nameBackAt = { w: d.w, h: d.h };
  nameBack();
});
function nameBack(): void {
  if (!nameBackAt) return;
  const v = viewport();
  if (Math.abs(v.w - nameBackAt.w) > 0.5 || Math.abs(v.h - nameBackAt.h) > 0.5) return;
  delete root.dataset.nameAway;
  // said once the frame that shows it has gone out, so the window's own goes no sooner (a frame with both, in the
  // same place, rather than one with neither)
  const { w, h } = nameBackAt;
  requestAnimationFrame(() => requestAnimationFrame(() => shellNameBack(w, h)));
  nameBackAt = null;
}
/** The wordmark at the size and place `shellLayout` gave it: nothing said where it is today's. */
function placeName(l: ShellLayout): void {
  const n = l.name;
  // in its corner, or over the ring where the ring keeps the screen's middle (`ringPlace`, duo-balance)
  const fs = n ? n.fs : l.nameFs;
  const fs0 = fs != null ? Math.max(24, Math.min(0.044 * Math.min(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight), 32)) : 0;
  if (fs != null && fs < fs0 - 0.01) root.style.setProperty('--name-fs', px(fs)); else root.style.removeProperty('--name-fs');
  if (n) root.dataset.nameCorner = ''; else delete root.dataset.nameCorner;
  const c = n ? shellChrome() : null;
  if (n && c) {
    root.dataset.nameAt = '';
    root.style.setProperty('--name-x', px(c.left));
    root.style.setProperty('--name-y', px(c.foot + NAME_STEP));
  } else {
    delete root.dataset.nameAt;
    root.style.removeProperty('--name-x');
    root.style.removeProperty('--name-y');
  }
}

/** The shell's fold in the visible area's coordinates (duo-fold); null where there is none. */
function foldNow(v: { left: number; top: number }): ShellFold | null {
  const f = shellFold();
  return f ? { axis: f.axis, at: f.at - (f.axis === 'v' ? v.left : v.top) } : null;
}
/** Where the screen's middle falls down the visible area, as the shell says (duo-balance); null in a browser. */
function midNow(v: { top: number }): number | null {
  const m = shellMid();
  return m ? m[1] - v.top : null;
}

/**
 * **One type scale for the panel, by its own width** (iphone-duo round 2, his word 10-23: "it seems font size is not
 * balanced"): the tabs, the heads, the rows and the About's words are set at their sizes times `--pk` (index.html),
 * and the fold follows the tab line's foot (`measureLeg`). 1 where the panel is as wide as its design
 * (`TYPE_REF`: a desktop's 442, a phone's 370), less in proportion where it is narrower, never under `TYPE_MIN`; and
 * **the tab row always clears the fold**: where the three tabs would reach it, the scale steps down until they do.
 */
const TYPE_REF = 400;
const TYPE_REF_COMPACT = 300;
const TYPE_MIN = 0.8;
/** The tab row at scale 1 (roomy, compact), its left inset, and the fold's leg; the row is measured when it can be. */
const TABS_W = [239, 208.5];
const TABS_IN = [28, 16];
const FOLD = [44, 32];
let tabsAt1: number[] = [...TABS_W];
export function panelType(pw: number, compact: boolean): number {
  const i = compact ? 1 : 0;
  const row = sheet?.querySelector<HTMLElement>('.libTabs');
  if (row && sheet?.open && row.scrollWidth > 0 && sheet.dataset.density === (compact ? 'compact' : 'roomy')) {
    const now = parseFloat(sheet.style.getPropertyValue('--pk')) || 1;
    tabsAt1[i] = row.scrollWidth / now;
  }
  const byWidth = pw / (compact ? TYPE_REF_COMPACT : TYPE_REF);
  const byTabs = (pw - TABS_IN[i] - FOLD[i] - 6) / tabsAt1[i];
  return Math.max(TYPE_MIN, Math.min(1, byWidth, byTabs));
}

/**
 * **The playlist's line under the ring yields to the panel under it** (iphone-duo round 2, the Duo's store shots:
 * "LATE DRIVE · 1 OF 4" cut by the panel's top on a short page): where the open ring's line (`LINE_TOP` under its
 * centre, `LINE_H` tall, scaled with the ring) would reach the panel, it is put away while the panel is open; the
 * panel shows the playlist itself. (The wordmark no longer yields: it scales in its corner, `NameCorner`.)
 */
function nowYields(h: number, l: ShellLayout): void {
  let nowAway = false;
  if (l.mode === 'port') {
    const k = l.ring.k, cy = h / 2 + l.stage.dy + l.ring.dy;
    nowAway = cy + k * (LINE_TOP * l.stage.side + LINE_H) > l.panel.y - 2;
  }
  if (nowAway) root.dataset.nowAway = ''; else delete root.dataset.nowAway;
}

/** The safe area's insets (a notch turned sideways in a browser): left, right, top and foot, read off a probe styled with `env()`. */
let insetProbe: HTMLDivElement | null = null;
function safeInsets(): [number, number, number, number] {
  if (!insetProbe) {
    insetProbe = document.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px);'
      + 'padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(insetProbe);
  }
  const cs = getComputedStyle(insetProbe);
  return [parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0, parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0];
}
function sideInsets(): [number, number] {
  const [l, r] = safeInsets();
  return [l, r];
}
/** The safe insets at the top and the foot, in the visible area (duo-land: a short landscape's paper keeps inside them). */
function endInsets(v: { top: number; h: number }): [number, number] {
  const [, , t, b] = safeInsets();
  const below = (window.innerHeight || v.h) - v.top - v.h;
  return [Math.max(0, t - v.top), Math.max(0, b - below)];
}

/**
 * **Where the wordmark's foot stands**, in the visible area, when it stands over the ring: a phone held upright,
 * where it is centred at the top (index.html), its top below the status bar's inset. 0 anywhere else: beside the
 * ring in a corner on a desktop and sideways, and gone in a small window.
 */
const NAME_OVER = '(max-width: 699px) and (orientation: portrait)';
const nameImg = document.querySelector<HTMLImageElement>('#name img');
function nameFoot(top: number): number {
  if (!nameImg || typeof matchMedia !== 'function' || !matchMedia(NAME_OVER).matches) return 0;
  const r = nameImg.getBoundingClientRect();
  if (!(r.height > 0)) return 0;
  // at the stylesheet's size: where the layout made the mark smaller (`--name-fs`), its foot as it would stand unmade
  if (!root.style.getPropertyValue('--name-fs')) return r.bottom - top;
  const fsNow = r.height / NAME_CAP;
  const fs0 = Math.max(24, Math.min(0.044 * Math.min(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight), 32));
  return r.bottom - top + NAME_TALL * (fs0 - fsNow);
}

export const libraryOpen = (): boolean => !!sheet && sheet.open && !closing;
/**
 * **The panel opening or closing** (panel-motion): the zoom's frames run (`rollStep`). The ring draws at the screen's
 * rate meanwhile (`moving`, ring.ts), and the playlists' times wait for it to land (playlists-ui.ts).
 */
export const libraryRolling = (): boolean => rollRaf !== 0;

/**
 * **The last tab the hand chose** (his word 10-22: "remember the last tab on paper in local storage so if i use map i
 * get back to map on paper open"): the panel key opens on it. Kept per browser; storage blocked or empty, Playlists.
 */
const TAB_KEY = 'deephouse.panel.tab';
const lastTab = (): string => { try { return localStorage.getItem(TAB_KEY) || 'playlists'; } catch (e) { return 'playlists'; } };
const keepTab = (name: string): void => { try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* storage blocked */ } };
/**
 * **The panel key while a playlist plays** (his word 10-29: "when i am playing playlist when pressing panel icon it
 * should open on the playlist scrolled to current playing track, unless last mode was map"): the playing playlist's
 * page, its track in sight (playlists-ui.ts); the Map where the Map was last. Nothing playing, the last tab.
 */
let showPlaying: () => boolean = () => false;
export const onPanelKey = (fn: () => boolean): void => { showPlaying = fn; };

/** Show a tab by its name; an unknown name shows the first. */
function showTab(name: string): void {
  if (!sheet) return;
  const tabs = [...sheet.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')];
  const pick = tabs.some((t) => t.dataset.tab === name) ? name : tabs[0]?.dataset.tab;
  for (const t of tabs) t.setAttribute('aria-selected', t.dataset.tab === pick ? 'true' : 'false');
  for (const p of sheet.querySelectorAll<HTMLElement>('[role="tabpanel"][data-tab]')) p.hidden = p.dataset.tab !== pick;
  paintSheet();
}

/** Open the panel on a tab (Playlists unless told), remembering the key that opened it. */
export function openLibrary(tab = 'playlists', from: Element | null = gyroEl): void {
  if (!sheet) return;
  showTab(tab);
  if (sheet.open && !closing) return;
  if (deps && deps.beforeOpen) deps.beforeOpen();
  opener = from;
  layShell();
  root.dataset.panel = 'open';
  // a close still rolling back turns round where it is (ring rules: never cut)
  if (closing) { closing = false; sheet.inert = false; }
  else sheet.show();
  paintSheet();
  unroll(1);
  tellShellKeys();
  const byKey = !!deps && deps.byKey();
  const into = (byKey ? sheet.querySelector('#panelClose') : sheet) as HTMLElement | null;
  try { if (into) into.focus({ preventScroll: true, focusVisible: byKey } as FocusOptions); } catch (e) { /* nothing to focus */ }
}

/**
 * **One surface at a time** (his pick 10-21): where the panel stands under the ring (`port`), it shares the lower
 * space with a bird's control, so opening that control sends the panel away (a short slide down, index.html) and
 * closing it brings the panel back as it was: still open, the same tab, scroll, playlist and anything typed, nothing
 * re-rendered. The gyroscope stays hidden meanwhile; the panel is open. Beside the ring (`land`) nothing moves.
 */
export function libraryAway(on: boolean): void {
  if (on && sheet && sheet.open && root.dataset.panelMode === 'port') root.dataset.panelAway = '';
  else delete root.dataset.panelAway;
}

/** Close it; `quiet` leaves the focus where the next thing puts it (the machine view). */
export function closeLibrary(quiet = false): void {
  if (!sheet || !sheet.open || closing) return;
  // **rolled back into the scroll** (star-keys): the panel goes quiet at once and the ring comes home; the dialog
  // itself closes when the roll lands (`unrolled`), and the focus goes back then, the scroll being shown again
  closing = true;
  sheet.inert = true;
  closeQuiet = quiet;
  delete root.dataset.panel;
  delete root.dataset.panelAway;
  tellShellKeys();
  // a field closed with the panel lets go of the layout with it
  if (typing) { clearTimeout(releaseTimer); release(); }
  unroll(0);
}
/** The roll has landed back in the scroll: the dialog closes, the shell is told, the focus goes back. */
function closed(): void {
  if (!sheet) return;
  closing = false;
  sheet.inert = false;
  sheet.close();
  for (const k of ['opacity', 'transition', 'pointer-events'] as const) sheet.style.removeProperty(k);
  tellShellKeys();
  const quiet = closeQuiet;
  // a ring key redrawn while the panel was open (the view closing under the About, the ring laid out afresh) is found
  // again by its action, so the focus goes back to the key and not to the gyroscope
  const action = opener instanceof Element ? opener.getAttribute('data-action') : null;
  const again = opener && !opener.isConnected && action ? document.querySelector(`#actions g[data-action="${action}"]`) : null;
  const back = opener && opener.isConnected ? opener : again ?? gyroEl;
  opener = null;
  if (!quiet && back && deps) deps.focusBack(back);
}

// **The scroll's glyph** (star-keys, `scroll-glyph.ts`): one static frame at rest, redrawn per frame only while it
// opens or rolls back a little (the save's answer, a hover). The 62 px key draws the key's detail, the small
// window's 28 px key the mini's. It keeps the gyroscope's element, `#gyro`, and its place.
const SVG_NS = 'http://www.w3.org/2000/svg';
const gyroSvg = gyroEl?.querySelector('svg') ?? null;
let gyroG: SVGGElement | null = null;
let gyroDetail: ScrollDetail = 'key';
/** How far open the scroll stands: 1 at rest. */
let spread = 1;
let spreadRaf = 0;
/** The save's answer: open by a quarter and roll back, in about the time the gyroscope spun (1.2 s). */
const ANSWER_MS = 1200;
const ANSWER_OPEN = 1.22;
const HOVER_OPEN = 1.07;
const answerEase = bezier(0.3, 0, 0.3, 1);
const hoverEase = bezier(0.25, 0.1, 0.25, 1);

function drawGyro(): void {
  if (!gyroSvg) return;
  if (!gyroG || !gyroG.isConnected) {
    gyroG = document.createElementNS(SVG_NS, 'g');
    gyroSvg.replaceChildren(gyroG);
  }
  const g = gyroG;
  const { layers, turn } = scrollDrawing(SCROLL_VARIANT, gyroDetail, spread, scrollInkList);
  g.setAttribute('transform', `rotate(${turn})`);
  if (g.childElementCount !== layers.length) {
    g.replaceChildren(...layers.map(() => document.createElementNS(SVG_NS, 'path')));
  }
  layers.forEach((l, i) => {
    const p = g.children[i];
    p.setAttribute('d', l.d);
    p.setAttribute('opacity', String(l.o));
    if (l.fill) { p.setAttribute('fill', l.ink ?? 'currentColor'); p.setAttribute('stroke', 'none'); }
    else { p.removeAttribute('fill'); p.removeAttribute('stroke'); p.setAttribute('stroke-width', String(l.w)); }
  });
}

/** The playlists' colours the scroll's stars wear (playlists-ui.ts says them on every change of the library). */
let scrollInkList: string[] = [];
export function scrollInks(inks: readonly string[]): void {
  if (inks.join('|') === scrollInkList.join('|')) return;
  scrollInkList = [...inks];
  drawGyro();
}

/** Open the scroll to `to` over `ms` (and, with `back`, roll it back to rest over the same again); never cut, a new ask starts from where it stands. */
function openTo(to: number, ms: number, ease: (t: number) => number, back = false): void {
  cancelAnimationFrame(spreadRaf);
  const from = spread, t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    spread = from + (to - from) * ease(t);
    drawGyro();
    if (t < 1) { spreadRaf = requestAnimationFrame(step); return; }
    spreadRaf = 0;
    if (back) openTo(1, ms, ease);
  };
  spreadRaf = requestAnimationFrame(step);
}

/**
 * **The scroll answers a save** (the gyroscope's spin, kept by name for its callers): it opens a quarter wider, as if
 * to take the new star, and rolls back; with reduced motion it blinks once. Hidden while the panel is open, so
 * nothing shows then.
 */
export function gyroSpin(): void {
  if (!gyroEl) return;
  gyroEl.classList.remove('spin', 'blink');
  if (reducedMotion.on) {
    void gyroEl.offsetWidth;   // restart the blink if one is running
    gyroEl.classList.add('blink');
    return;
  }
  openTo(ANSWER_OPEN, ANSWER_MS / 2, answerEase, true);
}

/** A mouse resting on the key opens it a touch, and leaving lets it roll back. */
function gyroHover(e: PointerEvent): void {
  if (e.pointerType !== 'mouse' || reducedMotion.on || spread > HOVER_OPEN + 0.01) return;
  openTo(HOVER_OPEN, 320, hoverEase);
}
function gyroLeave(e: PointerEvent): void {
  if (e.pointerType !== 'mouse' || reducedMotion.on || spread > HOVER_OPEN + 0.01) return;
  openTo(1, 380, hoverEase);
}

// --- the sheet and its zoom ------------------------------------------------------
//
// **The panel is the key's sheet, zoomed** (star-keys round 5, his word 10-22: "i actually like S4 more conventional
// sheet, when we zoom we could still render that cute corner at top right, and have X icon in it?"). The open panel
// wears the folded map's outline: a sheet with its top right corner turned down, drawn at the panel's own scale in
// the panel's line (`paintSheet`), and the close × sits in that turned corner. Opening, a frame in the sheet's line
// and ground grows out of the key, one smooth move and scale from the key's sheet to the panel's (its tilt
// straightening, its crease fading as it opens flat), and the panel's content fades in once it is full size; closing
// is the same backwards. About 520 ms either way.
//
// **Never cut** (ring rules): one progress, `rollP`, walks toward where it was last asked (`rollTo`) at one pace; a
// close during the zoom turns round where it is, and so does an open during the close. Under reduced motion the
// frame is not drawn and the panel only fades.
const ZOOM_MS = 520;
const FADE_MS = 200;
/** The frame is the panel's size by here; the content fades in after. */
const FULL = 0.76;
let rollP = 0;
let rollTo = 0;
let rollRaf = 0;
let rollAt = 0;
let closing = false;
let closeQuiet = false;
/** The boxes `layShell` last laid, in the page's coordinates. */
let laid: { gyro: Box; panel: Box } | null = null;
let frame: HTMLDivElement | null = null;
const io = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * **The turned corner's leg at panel scale**, px (round 6, his word 10-22 from the phone: "on mobile fold is too big,
 * also rows overlapping it"): the fold stands inside the tab line's own height, its foot at the top of the active
 * tab's underline, so it never reaches below the line and the tab's content (which starts under the line) never
 * passes under it. Read off the laid-out tab by `paintSheet`; before that, the line's height in each density.
 */
let legNow = 0;
function cornerLeg(): number {
  if (legNow) return legNow;
  if (root.dataset.panelMode === 'mini') return 29;
  return sheet?.dataset.density === 'compact' ? 32 : 44;
}
function measureLeg(): number {
  const t = sheet?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? sheet?.querySelector<HTMLElement>('[role="tab"]');
  if (!sheet || !t) return 0;
  const line = parseFloat(getComputedStyle(t).borderBottomWidth) || 0;
  const foot = t.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top - line;
  return foot > 12 ? Math.floor(foot) : 0;
}
/** The × in the corner (round 6): the incircle's size, never under 16 px; a finger's target 44 px round it. */
const X_MIN = 16;
const X_TOUCH = 44;
/** The crease's alpha on the open panel (round 6, his word 10-22: "a fair hair line in the paper center as in the icon"). */
const CREASE_ALPHA = 0.12;
/**
 * **The open sheet's lines, quieter** (panel-fit, his word 10-26: "it still grabs attention from ring ui, so maybe we
 * mute it a bit, maybe 30-40% off"): its outline, turned corner and crease at this share of their ink (index.html
 * `--sheet-k`). The zoom's frame eases from the key's weight, 1, to this as it grows.
 */
const SHEET_QUIET = 0.65;
const n1 = (v: number) => v.toFixed(1);
/**
 * **The paper's corners, round as the ring** (his word 10-30: "can we make open panel corner more round? i think all
 * our UI is of ring, so need to follow that"; then "let's try 8-10px after all to match icon style", and of 8, 10 and
 * 16 drawn, "let's do 8px"): true quarter circles of 8 px, where round 7 (his word 10-22: "something is not right with paper corners") had them nearly square
 * at 1.5.
 */
const SHEET_R = 8;
/**
 * **The sheet's outline**, `w` by `h` px with its top right corner folded away at `c` and its other corners rounded by
 * `r`, `i` px in from the box (half the line, so the whole line stands inside the box). The crease is straight and
 * meets the top and the side at a point, as a paper's fold does (his word 10-30: "the fold edges should be straight
 * like normal paper fold, imagine a square with rounded corners where you fold the corner").
 */
export function sheetEdge(w: number, h: number, c: number, i = 0, r = SHEET_R): string {
  const a = `A${n1(r)} ${n1(r)} 0 0 1 `;
  return `M${n1(i + r)} ${n1(i)}L${n1(w - c + i)} ${n1(i)}L${n1(w - i)} ${n1(c - i)}L${n1(w - i)} ${n1(h - i - r)}`
    + `${a}${n1(w - i - r)} ${n1(h - i)}L${n1(i + r)} ${n1(h - i)}${a}${n1(i)} ${n1(h - i - r)}`
    + `L${n1(i)} ${n1(i + r)}${a}${n1(i + r)} ${n1(i)}Z`;
}
/**
 * The turned-down corner: the cut-off corner folded over the sheet, the paper's own corner mirrored in the crease, so
 * its legs are straight and its tip, at (w − c, c), is rounded as the paper's corners are (`f`, the same radius). Its
 * legs start where the crease meets the outline (`i` in, round 7), standing on half pixels as the outline's sides do,
 * crisp on a whole-pixel panel; its third side is the crease, the outline's own diagonal, the same one line.
 */
export function sheetFlap(w: number, c: number, i = 0.5, f = SHEET_R): string {
  f = foldTip(c, f);
  const x = w - c + i, y = c - i;
  return `M${n1(x)} ${n1(i)}L${n1(x)} ${n1(y - f)}A${n1(f)} ${n1(f)} 0 0 0 ${n1(x + f)} ${n1(y)}L${n1(w - i)} ${n1(y)}Z`;
}
/** The fold's tip on a leg of `c`: the paper's corner, never more than half the leg so the legs keep a straight run. */
const foldTip = (c: number, f: number): number => Math.max(0, Math.min(f, c / 2));
/**
 * **The ×'s place in the rounded fold** (his word 10-30: "there is a shift"): how far in from both legs, at the centre
 * of the largest circle the fold holds. With a sharp tip that is the triangle's incircle; a tip rounded past it pushes
 * the circle out toward the crease. Along the fold's bisector, `t` from the tip: the room to the crease is `D − t`, to
 * the rounded tip `f − (f√2 − t)`, to a leg past it `t / √2`.
 */
export function foldCentre(c: number, i = 0.5, f = SHEET_R): number {
  f = foldTip(c, f);
  const D = (c - 2 * i) / Math.SQRT2;
  const room = (t: number) => Math.min(D - t, t < f * Math.SQRT2 ? f - (f * Math.SQRT2 - t) : t / Math.SQRT2);
  let best = 0, at = 0;
  for (let k = 0; k <= 200; k++) { const t = (D * k) / 200; const r = room(t); if (r > best) { best = r; at = t; } }
  return at / Math.SQRT2;
}

/**
 * **The open panel as the sheet**: its ground, line and turned corner, the faint crease down its middle, and where
 * the × sits in the corner. The ground is the outline's fill, behind everything (the dialog's own is clear).
 *
 * **No clip** (round 7, his word 10-22 from the phone: "track menu is cropped", and the soft corners): the panel was
 * clipped to the outline, which cut a ⋯ menu standing past the panel's edge and shaved the outer half of the line at
 * the corners. Now the outline is drawn only, as a layer behind the content, and nothing is clipped to it: the content
 * keeps clear of the fold by its own padding (the head's, and the bodies start under the tab line), and the ×'s
 * finger target past the fold answers as it is.
 */
function paintSheet(): void {
  if (!sheet || !sheet.open) return;
  const w = sheet.offsetWidth, h = sheet.offsetHeight;
  if (!w || !h) return;
  legNow = measureLeg();
  const c = cornerLeg();
  // the × at the corner triangle's own centre (its incircle's): a leg's (2 − √2) / 2 in from both legs
  const ri = (c * (2 - Math.SQRT2)) / 2;
  const at = foldCentre(c, 0.5);
  const xx = w - c + 0.5 + at, xy = c - 0.5 - at;
  const d = Math.max(X_MIN, Math.floor(2 * ri));
  const reach = coarsePointer.on ? Math.max(d, X_TOUCH) : d;
  const svg = sheet.querySelector('.sheetEdge');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.querySelector('.edge')?.setAttribute('d', sheetEdge(w, h, c, 0.5));
    svg.querySelector('.flap')?.setAttribute('d', sheetFlap(w, c));
    // the crease: as on the key's folded map, down the middle from edge to edge (the fold never reaches the middle)
    svg.querySelector('.crease')?.setAttribute('d', `M${n1(Math.round(w / 2) + 0.5)} 1L${n1(Math.round(w / 2) + 0.5)} ${n1(h - 1)}`);
  }
  sheet.style.setProperty('--corner', `${c}px`);
  sheet.style.setProperty('--x-x', `${n1(xx)}px`);
  sheet.style.setProperty('--x-y', `${n1(xy)}px`);
  sheet.style.setProperty('--x-d', `${d}px`);
  sheet.style.setProperty('--x-g', `${Math.max(8, Math.min(14, Math.round(d * 0.5)))}px`);
  sheet.style.setProperty('--x-pad', `${n1(-(reach - d) / 2)}px`);
}
function frameEl(): HTMLDivElement {
  if (frame && frame.isConnected) return frame;
  frame = document.createElement('div');
  frame.id = 'unroll';
  frame.setAttribute('aria-hidden', 'true');
  // the flap's light, as the open sheet's (index.html): its own gradient, the sheet's sitting in a closed dialog
  frame.innerHTML = '<svg><defs><linearGradient id="flapLitZoom" class="flapLit" x1="1" y1="0" x2="0" y2="1"><stop offset="0.5"/><stop offset="1"/></linearGradient></defs>'
    + '<path class="edge"/><path class="crease"/><path class="flap"/></svg>';
  document.body.append(frame);
  return frame;
}

/** Ask the zoom toward open (1) or closed (0), from wherever it stands. */
function unroll(to: number): void {
  rollTo = to;
  // at once, so the first frame the dialog is shown or let go is already the zoom's
  paintRoll();
  if (!rollRaf) { rollAt = performance.now(); rollRaf = requestAnimationFrame(rollStep); }
}

function rollStep(now: number): void {
  const dt = Math.min(64, now - rollAt);
  rollAt = now;
  const ms = reducedMotion.on ? FADE_MS : ZOOM_MS;
  rollP = rollTo > rollP ? Math.min(rollTo, rollP + dt / ms) : Math.max(rollTo, rollP - dt / ms);
  paintRoll();
  if (rollP !== rollTo) { rollRaf = requestAnimationFrame(rollStep); return; }
  rollRaf = 0;
  if (rollP === 0 && closing) closed();
}

/** The frame and the panel at `rollP`. */
function paintRoll(): void {
  if (!sheet) return;
  const p = rollP;
  const done = p >= 1 && rollTo === 1;
  // the panel itself: its content fades in once the frame is full size, and takes no hand until it is whole
  sheet.style.transition = done ? '' : 'none';
  sheet.style.opacity = done ? '' : (reducedMotion.on ? p : clamp01((p - FULL) / (1 - FULL))).toFixed(3);
  sheet.style.pointerEvents = done ? '' : 'none';
  root.toggleAttribute('data-unrolling', !done && p > 0);
  const f = frameEl();
  if (reducedMotion.on || done || p <= 0 || !laid) { f.style.display = 'none'; return; }
  const { gyro: g, panel: b } = laid;
  // the key's sheet: the folded map in its glyph (scroll-glyph.ts, form 4), 21.6 by 17.3 of the key's 28 units at
  // 81 % of its square, turned −6°, its corner cut at 2.5 units
  const k = (g.w * 0.81) / 28;
  const s = io(clamp01(p / FULL));
  const x = lerp(g.x + g.w / 2 - 10.8 * k, b.x, s), y = lerp(g.y + g.h / 2 - 8.4 * k, b.y, s);
  const w = lerp(21.6 * k, b.w, s), h = lerp(17.3 * k, b.h, s), c = lerp(2.5 * k, cornerLeg(), s);
  f.style.display = 'block';
  f.style.left = `${n1(x)}px`;
  f.style.top = `${n1(y)}px`;
  f.style.width = `${n1(w)}px`;
  f.style.height = `${n1(h)}px`;
  f.style.transform = `rotate(${(-6 * (1 - s)).toFixed(2)}deg)`;
  // its line and the corner's light from the key's weight to the open sheet's quieter one, there by full size
  f.style.setProperty('--sheet-k', lerp(1, SHEET_QUIET, s).toFixed(3));
  const svg = f.firstElementChild as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${n1(w)} ${n1(h)}`);
  // the corners and the fold's tip, the same paper corner, grow from the key's near-square glyph to the sheet's
  svg.querySelector('.edge')?.setAttribute('d', sheetEdge(w, h, c, 0.5, lerp(1, SHEET_R, s)));
  svg.querySelector('.flap')?.setAttribute('d', sheetFlap(w, c, 0.5, lerp(1, SHEET_R, s)));
  // the crease down the middle carries into the open panel's faint hairline (round 6): from the key's weight to the
  // panel's, handed over to the panel's own as its content fades in (the two summing to the one line)
  const crease = svg.querySelector('.crease');
  crease?.setAttribute('d', `M${n1(w / 2)} 0.5L${n1(w / 2)} ${n1(h - 0.5)}`);
  const fadeIn = clamp01((p - FULL) / (1 - FULL));
  crease?.setAttribute('opacity', (lerp(0.7, (SHEET_QUIET * CREASE_ALPHA) / 0.55, s) * (1 - fadeIn)).toFixed(3));
}

/** Wire the keys once; ring.ts hands over what lives there. */
export function startLibrary(d: PanelDeps): void {
  deps = d;
  layShell();
  if (gyroEl) {
    gyroEl.addEventListener('click', () => {
      const tab = lastTab();
      if (tab === 'genres' || !showPlaying()) openLibrary(tab, gyroEl);
    });
    gyroEl.addEventListener('animationend', () => gyroEl.classList.remove('blink'));
    gyroEl.addEventListener('pointerenter', gyroHover);
    gyroEl.addEventListener('pointerleave', gyroLeave);
  }
  if (!sheet) return;
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => paintSheet()).observe(sheet);
  sheet.addEventListener('animationend', (e) => { if (e.animationName === 'libTurnIn') sheet.classList.remove('turnIn'); });
  for (const t of sheet.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')) {
    t.addEventListener('click', () => { showTab(t.dataset.tab || ''); keepTab(t.dataset.tab || 'playlists'); });
  }
  document.getElementById('panelClose')?.addEventListener('click', () => closeLibrary());
  document.getElementById('machineKey')?.addEventListener('click', () => {
    closeLibrary(true);
    d.openMachine();
  });
  const relay = () => layShell();
  window.addEventListener('resize', relay);
  window.addEventListener('orientationchange', () => {
    // a real rotation switches the layout: the field lets go first
    if (typing && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    clearTimeout(releaseTimer);
    if (typing) release(); else relay();
  });
  document.addEventListener('focusin', (e) => {
    // only a touch screen has a keyboard that comes up over the page: on a desktop and in the Mac app a field never
    // holds the layout, so a resize always lays it again (his report 10-21: the mini player's resize left the ring)
    if (!isField(e.target as Element) || !coarsePointer.on) return;
    clearTimeout(releaseTimer);
    typing = true;
    root.dataset.typing = '';
    // the panel rides above the keyboard as it comes up, and the field stays in sight; the ring does not move
    for (const t of [60, 320, 650]) setTimeout(liftPanel, t);
  });
  document.addEventListener('focusout', (e) => {
    if (!isField(e.target as Element)) return;
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => { if (!isField(document.activeElement)) release(); }, 450);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => { relay(); liftPanel(); });
    window.visualViewport.addEventListener('scroll', () => { relay(); liftPanel(); });
  }
  smallWindow.watch(relay);
  onShellKeyboard(liftPanel);
  // the fold came, went or moved: the ring and the panel are laid again as one resize (ring.ts reads it too)
  onShellFold(() => window.dispatchEvent(new Event('resize')));
  // the Mac's window buttons moved, came or went (full screen): the wordmark is laid again beside them
  onShellChrome(relay);
}
