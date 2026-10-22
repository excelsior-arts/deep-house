// **The panel and its one key, the gyroscope** (PLAN-LIBRARY §2, phase 2; his
// word 10-20: "three things on the page: the title, the ring and the
// gyroscope"). The footer went: its name moved to the foot of the About tab,
// and its gear became the machine-view key in the panel's corner.
//
// - **The gyroscope** stands right of the ring at its middle in landscape,
//   under it in portrait, and in the bottom-right corner of a small window
//   (the mini player, `smallWindow`). It hides while the panel is open.
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
import { reducedMotion, smallWindow, coarsePointer } from './motion.ts';
import { shellKeyboard, onShellKeyboard } from './shell-library.ts';
import { gyroLayers, gyroElevation, bezier, GYRO_TILT, type GyroDetail } from './gyro-glyph.ts';

export type PanelMode = 'land' | 'port' | 'mini';

/** The gyroscope's touch square, a small window's, where it stands in the gap past the ring, and the edge. */
// 40 % larger than the first 44 / 30 (his word 10-21: "we need to see it 40% bigger as it's tiny with realistic lines")
const GYRO = 62;
const GYRO_MINI = 28;   // the mini player's square is small: a size down again (his word 10-21)
const GYRO_OUT = 0.6;
const EDGE = 12;
/** The panel's gutter from the window's edge, roomy and compact, and in a small window. */
const GUTTER = 24;
const GUTTER_COMPACT = 10;
const GUTTER_MINI = 6;
/** A panel wider than this stands centred in its 2/5. */
const PANEL_MAX_W = 680;
/**
 * **The side layout needs a panel at least this wide** (his iPhone, 10-20): narrower, the panel goes under the
 * ring. A landscape phone (844 by 390) still gets its 327 beside the ring, where under it would be 156 tall.
 */
const PANEL_MIN_SIDE = 300;
/** The side panel beside the ring: this share of the ring's square in height and of its room in width (his word 10-21). */
const LAND_SCALE = 0.8;
/** The ring's square, as index.html says it: 0.94 of the shorter side, at most 960. */
const ringSide = (w: number, h: number) => Math.min(0.94 * Math.min(w, h), 960);

export interface Box { x: number; y: number; w: number; h: number }
export interface ShellLayout {
  mode: PanelMode;
  compact: boolean;
  gyro: Box;
  panel: Box;
  /** The stage's transform while the panel is open: a move and a scale about the ring's centre. */
  ring: { dx: number; dy: number; k: number };
}

/**
 * Where everything stands in a `w` × `h` viewport: pure arithmetic, so a
 * check can read it without a page.
 */
export function shellLayout(w: number, h: number, small: boolean, wide: boolean = w > h): ShellLayout {
  const s = ringSide(w, h);
  const compact = small || w < 700 || h < 500;
  // beside the ring only where the window is wide and the panel gets its room; otherwise under it
  const sideRoom = Math.min(0.4 * w - (compact ? GUTTER_COMPACT : GUTTER), PANEL_MAX_W);
  const mode: PanelMode = small ? 'mini' : wide && sideRoom >= PANEL_MIN_SIDE ? 'land' : 'port';
  const g = small ? GYRO_MINI : GYRO;
  const corner = (e: number): Box => ({ x: w - g - e, y: h - g - e, w: g, h: g });
  let gyro: Box;
  if (mode === 'mini') gyro = corner(GUTTER_MINI);
  else if (mode === 'land') {
    // in the gap between the ring and the window's edge, 3/5 of the way out from the ring (his word 10-20)
    const right = w / 2 + s / 2;
    gyro = w - right >= g + 2 * EDGE ? { x: right + GYRO_OUT * (w - right) - g / 2, y: h / 2 - g / 2, w: g, h: g } : corner(EDGE);
  } else {
    const below = h / 2 + s / 2;
    gyro = h - below >= g + 2 * EDGE ? { x: w / 2 - g / 2, y: below + GYRO_OUT * (h - below) - g / 2, w: g, h: g } : corner(EDGE);
  }
  const m = small ? GUTTER_MINI : compact ? GUTTER_COMPACT : GUTTER;
  const fit = (x0: number, room: number) => {
    const pw = Math.min(room, PANEL_MAX_W);
    return { x: x0 + (room - pw) / 2, w: pw };
  };
  if (mode === 'mini') {
    return { mode, compact, gyro, panel: { x: m, y: m, w: w - 2 * m, h: h - 2 * m }, ring: { dx: 0, dy: 0, k: 1 } };
  }
  if (mode === 'land') {
    const s2 = ringSide(0.6 * w, h);
    // a little smaller than the ring's square (his word 10-21: "too large, unless users have that many playlists"):
    // LAND_SCALE of its height, centred on the ring's middle, and as much narrower
    const { x, w: pw } = fit(0.6 * w, LAND_SCALE * (0.4 * w - m));
    const ph = LAND_SCALE * s2;
    return { mode, compact, gyro, panel: { x, y: (h - ph) / 2, w: pw, h: ph }, ring: { dx: -0.2 * w, dy: 0, k: s2 / s } };
  }
  const s2 = ringSide(w, 0.6 * h);
  // under the ring on a desktop, no wider than four fifths of the ring's square, as beside it (his word 10-21); a phone
  // (compact) keeps the whole width its thumb needs
  const room = compact ? w - 2 * m : Math.min(w - 2 * m, LAND_SCALE * s2);
  const { x, w: pw } = fit((w - room) / 2, room);
  return { mode, compact, gyro, panel: { x, y: 0.6 * h, w: pw, h: 0.4 * h - m }, ring: { dx: 0, dy: -0.2 * h, k: s2 / s } };
}

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
  const vv = window.visualViewport;
  return {
    w: vv ? vv.width : window.innerWidth, h: vv ? vv.height : window.innerHeight,
    left: vv ? vv.offsetLeft : 0, top: vv ? vv.offsetTop : 0, zoomed: !!vv && Math.abs(vv.scale - 1) > 0.01,
  };
}

const px = (v: number) => `${v.toFixed(2)}px`;
function place(el: HTMLElement, b: Box, left: number, top: number) {
  el.style.left = px(left + b.x);
  el.style.top = px(top + b.y);
  el.style.width = px(b.w);
  el.style.height = px(b.h);
}

/**
 * **Wide or tall, from what a keyboard does not change** (his iPhone, 10-20: the panel flipped to the side as the
 * keyboard opened, since the height it left read wider than tall). On a touch device, the screen's orientation;
 * elsewhere the window's own shape.
 */
function wideNow(w: number, h: number): boolean {
  if (coarsePointer.on) {
    const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
    if (type) return type.startsWith('landscape');
    const o = (window as { orientation?: number }).orientation;
    if (typeof o === 'number') return Math.abs(o) === 90;
    try { return matchMedia('(orientation: landscape)').matches; } catch (e) { /* none */ }
  }
  return w > h;
}

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

/**
 * **What the Mac's mini player must not take for a move** (his report 10-21): it drags the window by a press on the
 * black outside the ring's circle, where the gyroscope stands and the open panel's × and keys are. The page says
 * where its keys are and whether the panel is up, and the shell leaves those presses to the page (MiniPlayer.swift).
 */
function tellShellKeys(): void {
  const s = (window as { deepHouseShell?: { send?: (m: unknown) => void } }).deepHouseShell;
  if (!s || typeof s.send !== 'function') return;
  const keys: number[][] = [];
  // the gyroscope, and the throne, which on the mini player stands at 45° outside the ring's circle (his report 10-21)
  for (const el of sheet?.open ? [] : [gyroEl, document.getElementById('throne')]) {
    const r = el?.getBoundingClientRect();
    if (r && r.width) keys.push([r.left, r.top, r.width, r.height]);
  }
  s.send({ ev: 'page-keys', panel: !!sheet?.open, keys });
}
// the throne is laid by the ring after the shell's own layout: say again once it has stood
window.addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(tellShellKeys)));
requestAnimationFrame(() => requestAnimationFrame(tellShellKeys));

/** Lay the gyroscope, the panel and the ring's open transform for the viewport as it is. */
export function layShell(): void {
  if (typing) return;
  const v = viewport();
  if (v.zoomed) return;   // a pinch is the reader looking closer and moves nothing
  const l = shellLayout(v.w, v.h, smallWindow.on, wideNow(v.w, v.h));
  if (gyroEl) place(gyroEl, l.gyro, v.left, v.top);
  tellShellKeys();
  const detail: GyroDetail = l.mode === 'mini' ? 'mini' : 'key';
  if (detail !== gyroDetail || !gyroSvg?.childElementCount) { gyroDetail = detail; drawGyro(); }
  if (sheet) {
    place(sheet, l.panel, v.left, v.top);
    sheet.dataset.density = l.compact ? 'compact' : 'roomy';
  }
  root.dataset.panelMode = l.mode;
  root.style.setProperty('--open-dx', px(l.ring.dx));
  root.style.setProperty('--open-dy', px(l.ring.dy));
  root.style.setProperty('--open-k', l.ring.k.toFixed(4));
}

export const libraryOpen = (): boolean => !!sheet && sheet.open;

/** Show a tab by its name; an unknown name shows the first. */
function showTab(name: string): void {
  if (!sheet) return;
  const tabs = [...sheet.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')];
  const pick = tabs.some((t) => t.dataset.tab === name) ? name : tabs[0]?.dataset.tab;
  for (const t of tabs) t.setAttribute('aria-selected', t.dataset.tab === pick ? 'true' : 'false');
  for (const p of sheet.querySelectorAll<HTMLElement>('[role="tabpanel"][data-tab]')) p.hidden = p.dataset.tab !== pick;
}

/** Open the panel on a tab (Playlists unless told), remembering the key that opened it. */
export function openLibrary(tab = 'playlists', from: Element | null = gyroEl): void {
  if (!sheet) return;
  showTab(tab);
  if (sheet.open) return;
  if (deps && deps.beforeOpen) deps.beforeOpen();
  opener = from;
  layShell();
  root.dataset.panel = 'open';
  sheet.show();
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
  if (!sheet || !sheet.open) return;
  sheet.close();
  delete root.dataset.panel;
  delete root.dataset.panelAway;
  // a field closed with the panel lets go of the layout with it
  if (typing) { clearTimeout(releaseTimer); release(); }
  tellShellKeys();
  // a ring key redrawn while the panel was open (the view closing under the About, the ring laid out afresh) is found
  // again by its action, so the focus goes back to the key and not to the gyroscope
  const action = opener instanceof Element ? opener.getAttribute('data-action') : null;
  const again = opener && !opener.isConnected && action ? document.querySelector(`#actions g[data-action="${action}"]`) : null;
  const back = opener && opener.isConnected ? opener : again ?? gyroEl;
  opener = null;
  if (!quiet && back && deps) deps.focusBack(back);
}

// **The gyroscope's glyph** (round gyro-volume, `gyro-glyph.ts`): one static frame at rest, redrawn per frame only
// while its rotor turns. The 44 px key draws the key's detail, the small window's 30 px key the mini's.
const SVG_NS = 'http://www.w3.org/2000/svg';
const gyroSvg = gyroEl?.querySelector('svg') ?? null;
let gyroDetail: GyroDetail = 'key';
/** The rotor's turn about its axle, degrees; whole spoke steps at rest, so the idle frame never changes. */
let gyroAngle = 0;
let gyroRaf = 0;
/** The spin's length, its two turns and the curve it has always eased by. */
const SPIN_MS = 2000;
const SPIN_TURN = 720;
const spinEase = bezier(0.15, 0.6, 0.3, 1);
const hoverEase = bezier(0.25, 0.1, 0.25, 1);
/** One spoke's step: the rotor rests on whole steps, so its rest frame is always the same picture. */
const spokeStep = () => 360 / (gyroDetail === 'mini' ? 3 : 4);

function drawGyro(): void {
  if (!gyroSvg) return;
  const layers = gyroLayers({ tilt: GYRO_TILT, elev: gyroElevation(GYRO_TILT), spin: gyroAngle, detail: gyroDetail });
  if (gyroSvg.childElementCount !== layers.length) {
    gyroSvg.replaceChildren(...layers.map(() => document.createElementNS(SVG_NS, 'path')));
  }
  layers.forEach((l, i) => {
    const p = gyroSvg.children[i];
    p.setAttribute('d', l.d);
    p.setAttribute('opacity', String(l.o));
    if (l.fill) { p.setAttribute('fill', 'currentColor'); p.setAttribute('stroke', 'none'); }
    else { p.removeAttribute('fill'); p.removeAttribute('stroke'); p.setAttribute('stroke-width', String(l.w)); }
  });
}

/** Turn the rotor `by` degrees over `ms`, the gimbals still; `done` when it lands. */
function turnRotor(by: number, ms: number, ease: (t: number) => number, done?: () => void): void {
  cancelAnimationFrame(gyroRaf);
  const from = gyroAngle, t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    gyroAngle = from + by * ease(t);
    drawGyro();
    if (t < 1) { gyroRaf = requestAnimationFrame(step); return; }
    gyroAngle %= 360;
    gyroRaf = 0;
    done?.();
  };
  gyroRaf = requestAnimationFrame(step);
}

/**
 * **The gyroscope spins** for about two seconds (phase 3 calls it when
 * something is saved): its rotor turns twice about the leaning axle, the
 * gimbals still; with reduced motion it blinks once. Hidden while the panel is
 * open, so nothing shows then.
 */
export function gyroSpin(): void {
  if (!gyroEl) return;
  gyroEl.classList.remove('spin', 'blink');
  if (reducedMotion.on) {
    void gyroEl.offsetWidth;   // restart the blink if one is running
    gyroEl.classList.add('blink');
    return;
  }
  gyroEl.classList.add('spin');
  gyroAngle = Math.round(gyroAngle / spokeStep()) * spokeStep();
  turnRotor(SPIN_TURN, SPIN_MS, spinEase, () => gyroEl.classList.remove('spin'));
}

/** A mouse resting on the key turns the rotor one spoke on (it was the inner ring's small turn); never over a spin. */
function gyroHover(e: PointerEvent): void {
  if (e.pointerType !== 'mouse' || gyroRaf || reducedMotion.on) return;
  turnRotor(spokeStep(), 420, hoverEase);
}

/** Wire the keys once; ring.ts hands over what lives there. */
export function startLibrary(d: PanelDeps): void {
  deps = d;
  layShell();
  if (gyroEl) {
    gyroEl.addEventListener('click', () => openLibrary('playlists', gyroEl));
    gyroEl.addEventListener('animationend', () => gyroEl.classList.remove('blink'));
    gyroEl.addEventListener('pointerenter', gyroHover);
  }
  if (!sheet) return;
  for (const t of sheet.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')) {
    t.addEventListener('click', () => showTab(t.dataset.tab || ''));
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
}
