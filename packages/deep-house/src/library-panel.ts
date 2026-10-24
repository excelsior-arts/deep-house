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
import { shellKeyboard, onShellKeyboard, shellFold, onShellFold, shellChrome, onShellChrome, type ShellFold } from './shell-library.ts';
import { bezier } from './gyro-glyph.ts';
import { scrollDrawing, SCROLLS, SCROLL_PICK, type ScrollDetail } from './scroll-glyph.ts';
import { linkRaw } from './link-table.ts';

/** Which of the scrolls the key draws: `?scroll=N` on the prototype (star-keys round 3), else the pick. */
const SCROLL_VARIANT = (() => { const v = Number(linkRaw('scroll')); return v >= 1 && v <= SCROLLS.length ? v : SCROLL_PICK; })();

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
/** The side panel beside the ring: this share of the ring's square in height and of its room in width (his word 10-21). */
const LAND_SCALE = 0.8;
/**
 * **One rule for the panel at every window size** (iphone-duo round 2, his word 10-23: "these overlaps are clearly
 * bugs, the panel position was not optimal in some scenarios based on window size"). Swept over browser and Mac
 * windows 600 to 1600 wide, iPad with Split View, phones both ways and the Duo (notes/rounds/iphone-duo.md):
 *
 * - **The panel is never narrower than its head needs**: `PANEL_NEED` roomy and `PANEL_NEED_COMPACT` on a phone, the
 *   tabs clear of the fold and a playlist's head (back, sky, title, three keys) inside the edge at the smallest type
 *   (`panelType`). Where today's share (`LAND_SCALE` of two fifths) is narrower, **the ring gives up size first**: the
 *   panel takes the width it needs and the ring is centred in what is left.
 * - **Beside the ring when the window is wide and the ring keeps at least `SIDE_RING_SHARE` of the width** with the
 *   panel at that width, or when the panel under it would be shorter than `UNDER_MIN_H`; otherwise under it. This replaces the 300 px floor (his iPhone, 10-20), which sent a short
 *   landscape screen (the Duo closed and turned, 678 x 466; an SE turned; an iPhone's app turned, 750 x 381 inside
 *   its notch) under the ring, where its panel showed one row.
 * - **As tall as its width asks**: at least `PANEL_ASPECT` of its width, within the window's gutters, so a panel
 *   made wider is not left a short strip in the middle; where its share already is taller (a desktop), unchanged.
 */
/**
 * **The ring's visible rim inside its square** (round 3, his word 10-23: "padding between ring and panel and panel and
 * window edge does not seem uniform"): the lanes' outer labels ("1:00", "OUT") stand 1.2 to 1.8 % of the side in from
 * the square on the side where a track draws one, and up to 4.6 % where it draws none (measured over seeds 1, 3, 8, 9
 * and 27191). The gutters are measured from the labels' ring, the rim's outermost place, so they read equal to the eye
 * and never move with the track.
 */
const RING_INK = 0.015;
/** Beside the ring, no gutter is narrower than this share of the window's width (and the gutter's own minimum). */
const GUTTER_SHARE = 0.04;
const PANEL_NEED = 360;
const PANEL_NEED_COMPACT = 280;
const SIDE_RING_SHARE = 0.4;
const PANEL_ASPECT = 1.4;
/** A panel under the ring shorter than this shows a row or two: beside the ring instead, wherever the window is wide. */
const UNDER_MIN_H = 240;
/** A compact panel narrower than this sets a track's place under its name (index.html, `data-narrow`). */
const NARROW = 340;
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
  /** The ring at rest: its square's side, and its centre's move from the window's middle (`ringPlace`; `dx` the fold's). */
  stage: { side: number; dx: number; dy: number };
  /** Beside the ring: the three gutters, edge to rim, rim to panel, panel to edge (round 3), all one. */
  gutters?: [number, number, number];
  /** The wordmark in its corner: its font size and its ink's box (duo-fold). */
  name?: Box & { fs: number };
}

/**
 * **The ring keeps under the wordmark** (inapp-layout, his word 10-22 from X's in-app browser: "ring is not center
 * and logo seem to overlap … make it proportional"). An app's browser shows the page short — X's sheet takes the
 * foot of the screen and its page runs under the status bar, so the wordmark stands lower — and the ring, sized by
 * the width and centred in the window, ran its top under the wordmark. Where the wordmark stands over the ring (a
 * phone held upright; `nameFoot`, its foot, else 0), the ring is as large as the space under it allows and centred
 * in that space, whichever way gives the larger ring: above the key's slot, the key under it as everywhere upright,
 * or down to the window's foot with the key in its corner, the ring's circle clear of it. A window with room keeps
 * the ring in its own middle as before, untouched to the pixel; between the two the ring eases across `RING_EASE`
 * px of clearance, so a sheet dragged never makes it jump.
 */
/** Kept between the wordmark's foot and the ring's ink, between the ring and the window's foot, and round the key. */
const RING_CLEAR = 10;
/** How far the ring's ink stands above its square, as a share of the side (the throne's top is 0.018). */
const RING_REACH = 0.02;
/** The clearance over which the ring eases from the window's middle to the middle of the space under the wordmark. */
const RING_EASE = 48;
export function ringPlace(w: number, h: number, nameFoot = 0): { side: number; cy: number } {
  const s0 = ringSide(w, h);
  if (!(nameFoot > 0)) return { side: s0, cy: h / 2 };
  const top = nameFoot + RING_CLEAR;
  // how clear of the wordmark the ring stands in the window's middle, as it always has
  const clear = h / 2 - s0 / 2 - RING_REACH * s0 - top;
  if (clear >= RING_EASE) return { side: s0, cy: h / 2 };
  // the highest and lowest the ring's centre may stand, for a side `s`: its ink (the square and its reach above)
  // under the wordmark, and over the key's slot, or over the window's foot and clear of the key in its corner
  const lo = (s: number) => top + s / 2 + RING_REACH * s;
  const slot = GYRO + 2 * EDGE;
  const dx = Math.max(0, w / 2 - GYRO - EDGE);
  const hiBelow = (s: number) => h - slot - s / 2;
  const hiCorner = (s: number) => Math.min(h - RING_CLEAR - s / 2,
    s / 2 + RING_CLEAR > dx ? h - GYRO - EDGE - Math.sqrt((s / 2 + RING_CLEAR) ** 2 - dx * dx) : Infinity);
  const largest = (hi: (s: number) => number) => {
    if (lo(s0) <= hi(s0)) return s0;
    let a = 0, b = s0;
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (lo(m) <= hi(m)) a = m; else b = m; }
    return a;
  };
  const sBelow = largest(hiBelow), sCorner = largest(hiCorner);
  const below = sBelow >= sCorner - 1;
  const side = below ? sBelow : sCorner;
  const centred = (lo(side) + (below ? hiBelow : hiCorner)(side)) / 2;
  const t = Math.min(1, 1 - clear / RING_EASE);
  return { side: s0 + t * (side - s0), cy: h / 2 + t * (centred - h / 2) };
}

/**
 * **The fold is the layout's axis** (round duo-fold, his word 10-23 on the iPhone Duo: "if we consider due is a perfect
 * wold in half, would it make sense to respect it, so when ring only is shown make sure it's right in the fold center,
 * and when panel is opened, make sure ring is on the left side and pape on the right. Because ring going through fold,
 * looks like Dali bent watch"). Where the shell says a crease runs across the page (`shellFold`, the Duo's inner
 * display, the window spanning it), the page is two halves:
 *
 * - **The ring alone stands centred on the fold,** as large as it is elsewhere, smaller only where an edge (or, upright,
 *   the wordmark over it) is nearer the fold than its half.
 * - **The panel open: the ring wholly in one half, the paper wholly in the other.** A vertical fold (held as a book):
 *   ring left, paper right; a horizontal one: ring top, paper bottom. In each half round 3's one gutter: the ring
 *   centred in its half, as large as the half allows with every gutter at least `GUTTER_SHARE` of the long side; the
 *   paper fills its half inside the same gutter, from the fold, the edges and the far side alike. A paper half too
 *   narrow for a roomy head takes the compact one; too narrow for that, today's layout stands.
 * - Opening moves the ring from the fold into its half with the open panel's own move (one transform, never cut) and
 *   closing brings it back.
 */
const FOLD_MIN = 1;
/** The fold, if it cuts the viewport with room on both sides. */
const foldIn = (w: number, h: number, f: ShellFold | null): ShellFold | null =>
  f && f.at > FOLD_MIN && f.at < (f.axis === 'v' ? w : h) - FOLD_MIN ? f : null;
/** The ring alone on the fold: its side and centre. */
function ringOnFold(w: number, h: number, f: ShellFold, nameFoot: number): { side: number; cx: number; cy: number } {
  const r = ringPlace(w, h, nameFoot);
  if (f.axis === 'v') return { side: Math.min(r.side, 0.94 * 2 * Math.min(f.at, w - f.at)), cx: f.at, cy: r.cy };
  let side = Math.min(ringSide(w, h), 0.94 * 2 * Math.min(f.at, h - f.at));
  // upright, its ink stays under the wordmark over it
  if (nameFoot > 0) side = Math.min(side, (f.at - nameFoot - RING_CLEAR) / (0.5 + RING_REACH));
  return { side: Math.max(0, side), cx: w / 2, cy: f.at };
}
/** The open layout on the fold: the ring in its half, the paper in the other; null where the paper's half is too narrow. */
function openOnFold(w: number, h: number, f: ShellFold, small: boolean, base: boolean): { compact: boolean; s2: number; cx: number; cy: number; panel: Box; g: number } | null {
  const vertical = f.axis === 'v';
  const long = vertical ? w : h, across = vertical ? h : w;
  const a = f.at, b = long - f.at;
  for (const compact of base ? [true] : [false, true]) {
    const m = small ? GUTTER_MINI : compact ? GUTTER_COMPACT : GUTTER;
    const gMin = Math.max(m, GUTTER_SHARE * long);
    const s2 = Math.max(0, Math.min(ringSide(Infinity, across), (a - 2 * gMin) / (1 - 2 * RING_INK), (across - 2 * gMin) / (1 - 2 * RING_INK)));
    const g = (a - s2 * (1 - 2 * RING_INK)) / 2;
    const paperW = (vertical ? b : across) - 2 * g;
    if (paperW < (compact ? PANEL_NEED_COMPACT : PANEL_NEED)) continue;
    const panel: Box = vertical ? { x: a + g, y: g, w: b - 2 * g, h: across - 2 * g } : { x: g, y: a + g, w: across - 2 * g, h: b - 2 * g };
    return { compact, s2, cx: vertical ? a / 2 : w / 2, cy: vertical ? h / 2 : a / 2, panel, g };
  }
  return null;
}

/**
 * **The ring keeps room for its line, clear of its readout** (duo-fold, his word 10-23 on the Mac: "ring is closer to
 * the bottom, and playlist name is uncomfortable close to the window edge"; and his 640 × 450 window, where the line
 * lay over the ring's "5:00" and its readout). The line under the ring (`#nowList`, the playlist that plays) stands
 * `LINE_TOP` of the ring's square under its centre, under the position readout's orbit (measured at 0.518 to 0.52 of
 * the side, its text's foot; the clock labels stand at 0.49), and `LINE_H` tall. Wherever the ring is as large as
 * the height allows, its block (the square's top, down to the line's foot) keeps a margin at both ends: at rest 0.03
 * of the shorter side, as the square always had; beside the open panel round 3's gutter, measured from the labels'
 * ring. The ring first rises in its window as far as it may, then gives up size; where there is room, nothing moves.
 * The room is kept whether a playlist plays or not, so the ring never moves when one starts.
 */
const LINE_TOP = 0.53;
const LINE_H = 2 + 26;
/**
 * **The wordmark always shows, in the top-left corner** (duo-fold, his word 10-23: "maybe we should make it all simple,
 * always logo with scaling, like it used to be … it was a big size so why logo wasn't there?"): round 2 put it away
 * wherever the open ring's circle reached it, so his larger windows lost it while the small ones, whose ring stands
 * under it, kept it. Now it is never put away (the upright phone keeps its own rule: centred over the ring, and gone
 * under an open panel). Its size is today's (`clamp(24px, 4.4vmin, 32px)`) where the ring leaves it room, and smaller
 * down to `NAME_FLOOR` where the ring would reach it, by the window's shape alone: measured against the ring at rest
 * and against the ring beside or over the open panel, so opening the panel never changes it. Only where the floor
 * still meets the ring (a phone or the Duo turned, a short window) does the ring give way, a little smaller about its
 * own centre. The ring's reach is its circle at `RING_REACH`: the clock labels and the throne stand at 0.49 to 0.505
 * of the side, but the position readout orbits at 0.52 and passes the corner once a track.
 */
const NAME_FLOOR = 18;
/**
 * **The mark keeps its proportion to the ring** (duo-fold, his word 10-23 on the sheet: "one screenshot has logo
 * clearly too large", the 640 × 450 Mac window, where today's 24 px floor made it 27 % of the window and as large as
 * the panel's head): its width is at most this share of the ring's square at rest, as it stands in his 1336 × 871
 * window (225 px against a 742 px ring), between `NAME_FLOOR` and today's size.
 */
const NAME_RING = 0.31;
/** Kept between the wordmark and the ring's reach. */
const NAME_CLEAR = 6;
/** The mark's cap height in its font size, and its width to its cap height (index.html `#name img`, wordmark.svg). */
const NAME_CAP = 0.786;
const NAME_WIDTH = 14415 / 1610;
/** The wordmark's corner: its ink's left and cap line at font size `fs` are `left + ax·fs` and `top + ay·fs`. */
export interface NameCorner { left: number; top: number; ax: number; ay: number; fs: number }
const nameBox = (c: NameCorner, fs: number): Box => {
  const ch = NAME_CAP * fs;
  return { x: c.left + c.ax * fs, y: c.top + c.ay * fs, w: ch * NAME_WIDTH, h: ch };
};
/** Whether a ring of square `side` about (cx, cy) keeps clear of box `b` by NAME_CLEAR. */
function clearOfName(b: Box, cx: number, cy: number, side: number): boolean {
  const nx = Math.max(b.x - NAME_CLEAR, Math.min(cx, b.x + b.w + NAME_CLEAR));
  const ny = Math.max(b.y - NAME_CLEAR, Math.min(cy, b.y + b.h + NAME_CLEAR));
  return Math.hypot(nx - cx, ny - cy) >= side * (0.5 + RING_REACH);
}
/** The largest side up to `s` whose ring about (cx, cy) keeps clear of `b`. */
function sideClearOf(b: Box, cx: number, cy: number, s: number): number {
  if (clearOfName(b, cx, cy, s)) return s;
  let lo = 0, hi = s;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (clearOfName(b, cx, cy, mid)) lo = mid; else hi = mid; }
  return lo;
}

/**
 * Where everything stands in a `w` × `h` viewport: pure arithmetic, so a
 * check can read it without a page. `fold`, the crease across it (duo-fold); `name`, the wordmark's corner where it
 * stands in one (not upright on a phone, not in a small window).
 */
export function shellLayout(w: number, h: number, small: boolean, wide: boolean = w > h, nameFoot = 0, sides: readonly [number, number] = [0, 0], fold: ShellFold | null = null, name: NameCorner | null = null): ShellLayout {
  const f = small ? null : foldIn(w, h, fold);
  const placed = f ? ringOnFold(w, h, f, nameFoot) : { ...ringPlace(w, h, small ? 0 : nameFoot), cx: w / 2 };
  let s = placed.side, cy = placed.cy;
  const cx0 = placed.cx;
  // the ring's line under it (`LINE_TOP`): the ring rises, then shrinks, to keep it inside the margin; not in a small
  // window (its line has its own place) nor where the wordmark stands over the ring (the phone upright, `ringPlace`)
  if (!small && !(nameFoot > 0)) {
    const mg = 0.03 * Math.min(w, h);
    if (f?.axis === 'h') s = Math.min(s, (h - mg - LINE_H - cy) / LINE_TOP);
    else {
      s = Math.min(s, (h - 2 * mg - LINE_H) / (0.5 + LINE_TOP));
      cy = Math.min(cy, h - mg - LINE_TOP * s - LINE_H);
    }
  }
  const base = small || w < 700 || h < 500;
  const onFold = f ? openOnFold(w, h, f, small, base) : null;
  const compact = onFold ? onFold.compact : base;
  const m0 = compact ? GUTTER_COMPACT : GUTTER;
  const need = compact ? PANEL_NEED_COMPACT : PANEL_NEED;
  // beside the ring: today's share where it is wide enough; where not, the width the head needs, and the ring takes
  // what is left of the room before the panel (`side`); beside only while the ring keeps its share of the window
  const share = LAND_SCALE * (0.4 * w - m0);
  const sideW = Math.min(Math.max(share, need), PANEL_MAX_W);
  const side = share >= need ? 0.6 * w : w - sideW - (0.4 * w - share);
  const mode: PanelMode = small ? 'mini' : onFold && f ? (f.axis === 'v' ? 'land' : 'port')
    : wide && (side >= SIDE_RING_SHARE * w || 0.4 * h - m0 < UNDER_MIN_H) ? 'land' : 'port';
  const m = small ? GUTTER_MINI : compact ? GUTTER_COMPACT : GUTTER;
  const fit = (x0: number, room: number) => {
    const pw = Math.min(room, PANEL_MAX_W);
    return { x: x0 + (room - pw) / 2, w: pw };
  };
  // the open ring and the panel, by the mode; `shrink` gives the ring a smaller side where the wordmark needs it
  type Open = { s2: number; cx: number; cy: number; panel: Box; gutters?: [number, number, number]; shrink: (s2: number) => { s2: number; cx: number; cy: number; gutters?: [number, number, number] } };
  let open: Open;
  if (mode === 'mini') {
    open = { s2: s, cx: cx0, cy, panel: { x: m, y: m, w: w - 2 * m, h: h - 2 * m }, shrink: (s2) => ({ s2, cx: cx0, cy }) };
  } else if (onFold) {
    const { s2, cx, cy: cy2, panel, g } = onFold;
    open = { s2, cx, cy: cy2, panel, gutters: [g, g, g], shrink: (t) => ({ s2: t, cx, cy: cy2, gutters: [g, g, g] }) };
  } else if (mode === 'land') {
    // a little smaller than the ring's square (his word 10-21: "too large, unless users have that many playlists"):
    // LAND_SCALE of its height, centred on the window's middle, and as much narrower; never under what its width asks
    const ph = Math.min(h - 2 * m, Math.max(LAND_SCALE * ringSide(0.6 * w, h), share >= need ? 0 : PANEL_ASPECT * sideW));
    // the ring at the size the rule gives it (its share of the width, or what the panel's width leaves), and the
    // panel at its width; then **three equal gutters** (round 3): the window's edge (a notch's or a band's inset
    // counts as the edge) to the ring's visible rim, the rim to the panel, the panel to the far edge
    // the ring as large as the window's height allows, or as the width allows with every gutter at least
    // `GUTTER_SHARE` of the width; what is left over goes to the gutters, evenly
    const pw = share >= need ? Math.min(share, PANEL_MAX_W) : sideW;
    const room = w - sides[0] - sides[1];
    const gMin = Math.max(m, GUTTER_SHARE * w);
    // and up and down (duo-fold): the labels' ring to the top, the line's foot to the foot, each at least the gutter;
    // the ring in the window's middle where that holds, else risen to it, else smaller (`LINE_TOP`)
    const lineK = LINE_H / s;
    let s2 = Math.max(0, Math.min(ringSide(Infinity, h), (room - pw - 3 * gMin) / (1 - 2 * RING_INK)));
    // up and down, a phone's or a short window's own gutter (compact): round 3's would cost its ring a fifth
    const gv = compact ? m : gMin;
    s2 = Math.min(s2, Math.max(0, (h - 2 * gv) / (0.5 - RING_INK + LINE_TOP + lineK)));
    const at = (t: number) => {
      const seen = t * (1 - 2 * RING_INK);
      const g = (room - pw - seen) / 3;
      const cyT = Math.min(h / 2, h - gv - (LINE_TOP + lineK) * t);
      return { s2: t, cx: sides[0] + g + seen / 2, cy: cyT, gutters: [g, g, g] as [number, number, number] };
    };
    const a = at(s2);
    open = { ...a, panel: { x: sides[0] + 2 * a.gutters[0] + s2 * (1 - 2 * RING_INK), y: (h - ph) / 2, w: pw, h: ph }, shrink: at };
  } else {
    const s2 = ringSide(w, 0.6 * h);
    // under the ring on a desktop, no wider than four fifths of the ring's square, as beside it (his word 10-21), and
    // never narrower than its head needs; a phone (compact) keeps the whole width its thumb needs
    const room = compact ? w - 2 * m : Math.min(w - 2 * m, Math.max(LAND_SCALE * s2, need));
    const { x, w: pw } = fit((w - room) / 2, room);
    open = { s2, cx: w / 2, cy: 0.3 * h, panel: { x, y: 0.6 * h, w: pw, h: 0.4 * h - m }, shrink: (t) => ({ s2: t, cx: w / 2, cy: 0.3 * h }) };
  }
  // the wordmark in its corner (above): as large as it may be against both rings, and where even the floor meets one,
  // that ring a little smaller
  let nameOut: ShellLayout['name'];
  if (name && mode !== 'mini') {
    const ok = (fs: number) => { const b = nameBox(name, fs); return clearOfName(b, cx0, cy, s) && clearOfName(b, open.cx, open.cy, open.s2); };
    // in proportion to the ring at rest (the window's shape, never the panel), capped at today's size
    let fs = Math.min(name.fs, Math.max(NAME_FLOOR, (NAME_RING * s) / (NAME_CAP * NAME_WIDTH)));
    if (!ok(fs)) {
      let lo = Math.min(NAME_FLOOR, fs), hi = fs;
      for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
      fs = lo;
      const b = nameBox(name, fs);
      s = sideClearOf(b, cx0, cy, s);
      if (!clearOfName(b, open.cx, open.cy, open.s2)) {
        let lo2 = 0, hi2 = open.s2;
        for (let k = 0; k < 30; k++) { const mid = (lo2 + hi2) / 2; const o = open.shrink(mid); if (clearOfName(b, o.cx, o.cy, o.s2)) lo2 = mid; else hi2 = mid; }
        const o = open.shrink(lo2);
        open = { ...open, ...o };
        if (mode === 'land' && !onFold && o.gutters) open.panel = { ...open.panel, x: sides[0] + 2 * o.gutters[0] + o.s2 * (1 - 2 * RING_INK) };
      }
    }
    nameOut = { fs, ...nameBox(name, fs) };
  }
  const stage = { side: s, dx: cx0 - w / 2, dy: cy - h / 2 };
  const g = small ? GYRO_MINI : GYRO;
  const corner = (e: number): Box => ({ x: w - g - e, y: h - g - e, w: g, h: g });
  let gyro: Box;
  if (mode === 'mini') gyro = corner(GUTTER_MINI);
  else if (mode === 'land') {
    // in the gap between the ring and the window's edge, 3/5 of the way out from the ring (his word 10-20)
    const right = cx0 + s / 2;
    gyro = w - right >= g + 2 * EDGE ? { x: right + GYRO_OUT * (w - right) - g / 2, y: h / 2 - g / 2, w: g, h: g } : corner(EDGE);
  } else {
    const below = cy + s / 2;
    gyro = h - below >= g + 2 * EDGE ? { x: w / 2 - g / 2, y: below + GYRO_OUT * (h - below) - g / 2, w: g, h: g } : corner(EDGE);
  }
  const ring = mode === 'mini' ? { dx: 0, dy: 0, k: 1 } : { dx: open.cx - cx0, dy: open.cy - cy, k: open.s2 / s };
  return { mode, compact, gyro, panel: open.panel, ring, stage, ...(open.gutters && mode !== 'mini' ? { gutters: open.gutters } : {}), ...(nameOut ? { name: nameOut } : {}) };
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
  // one reader for the ring and the panel (round 4): the visual viewport, or the window where it lags a turn
  return pageViewport();
}

const px = (v: number) => `${v.toFixed(2)}px`;
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

/**
 * **What the Mac's mini player must not take for a move** (his report 10-21): it drags the window by a press on the
 * black outside the ring's circle, where the gyroscope stands and the open panel's × and keys are. The page says
 * where its keys are and whether the panel is up, and the shell leaves those presses to the page (MiniPlayer.swift).
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
  s.send({ ev: 'page-keys', panel: !!sheet?.open, keys });
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
  const l = shellLayout(v.w, v.h, smallWindow.on, wideNow(v.w, v.h), nameFoot(v.top), sideInsets(), foldNow(v), nameCorner(v));
  placeName(l);
  if (gyroEl) place(gyroEl, l.gyro, v.left, v.top);
  const panel = whole({ ...l.panel, x: l.panel.x + v.left, y: l.panel.y + v.top });
  laid = { gyro: { ...l.gyro, x: l.gyro.x + v.left, y: l.gyro.y + v.top }, panel };
  tellShellKeys();
  const detail: ScrollDetail = l.mode === 'mini' ? 'mini' : 'key';
  if (detail !== gyroDetail || !gyroG?.childElementCount) { gyroDetail = detail; drawGyro(); }
  if (sheet) {
    place(sheet, panel, 0, 0);
    sheet.dataset.density = l.compact ? 'compact' : 'roomy';
    const k = l.mode === 'mini' ? 1 : panelType(panel.w, l.compact);
    if (k < 1) sheet.style.setProperty('--pk', k.toFixed(3)); else sheet.style.removeProperty('--pk');
    if (l.compact && l.mode !== 'mini' && panel.w < NARROW) sheet.dataset.narrow = ''; else delete sheet.dataset.narrow;
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
  root.style.setProperty('--open-dx', px(l.ring.dx));
  root.style.setProperty('--open-dy', px(l.ring.dy));
  root.style.setProperty('--open-k', l.ring.k.toFixed(4));
  // the ring at rest, where the wordmark makes it give way (`ringPlace`); nothing said where it does not, so the
  // stylesheet's own square and middle stand as they always have
  const full = Math.min(0.94 * Math.min(v.w, v.h), 960);
  if (l.stage.side < full - 0.01) root.style.setProperty('--ring-fit', px(l.stage.side)); else root.style.removeProperty('--ring-fit');
  if (Math.abs(l.stage.dy) > 0.01) root.style.setProperty('--ring-dy', px(l.stage.dy)); else root.style.removeProperty('--ring-dy');
  if (Math.abs(l.stage.dx) > 0.01) root.style.setProperty('--ring-dx', px(l.stage.dx)); else root.style.removeProperty('--ring-dx');
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
  if (smallWindow.on || !nameImg || typeof matchMedia !== 'function' || matchMedia(NAME_OVER).matches) return null;
  const vmin = Math.min(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
  const fs = Math.max(24, Math.min(0.044 * vmin, 32));
  const c = shellChrome();
  if (c) return { left: c.left - v.left, top: c.foot + NAME_STEP - v.top, ax: 0, ay: 0, fs };
  const [l, , t] = safeInsets();
  return { left: 20 + l - v.left, top: 16 + t - v.top, ax: 0.082, ay: 0.254, fs };
}
/** The wordmark at the size and place `shellLayout` gave it: nothing said where it is today's. */
function placeName(l: ShellLayout): void {
  const n = l.name;
  const fs0 = n ? Math.max(24, Math.min(0.044 * Math.min(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight), 32)) : 0;
  if (n && n.fs < fs0 - 0.01) root.style.setProperty('--name-fs', px(n.fs)); else root.style.removeProperty('--name-fs');
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

/** The safe area's insets (a notch turned sideways in a browser): left, right and top, read off a probe styled with `env()`. */
let insetProbe: HTMLDivElement | null = null;
function safeInsets(): [number, number, number] {
  if (!insetProbe) {
    insetProbe = document.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px)';
    document.body.appendChild(insetProbe);
  }
  const cs = getComputedStyle(insetProbe);
  return [parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0, parseFloat(cs.paddingTop) || 0];
}
function sideInsets(): [number, number] {
  const [l, r] = safeInsets();
  return [l, r];
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
  return r.height > 0 ? r.bottom - top : 0;
}

export const libraryOpen = (): boolean => !!sheet && sheet.open && !closing;

/**
 * **The last tab the hand chose** (his word 10-22: "remember the last tab on paper in local storage so if i use map i
 * get back to map on paper open"): the panel key opens on it. Kept per browser; storage blocked or empty, Playlists.
 */
const TAB_KEY = 'deephouse.panel.tab';
const lastTab = (): string => { try { return localStorage.getItem(TAB_KEY) || 'playlists'; } catch (e) { return 'playlists'; } };
const keepTab = (name: string): void => { try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* storage blocked */ } };

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
const n1 = (v: number) => v.toFixed(1);
/**
 * **The paper's corners** (round 7, his word 10-22: "something is not right with paper corners"): a sheet's corners
 * are nearly square, so a radius of 1.5 px, where it was 5.
 */
const SHEET_R = 1.5;
/**
 * **The sheet's outline**, `w` by `h` px with its top right corner cut at `c` and its other corners rounded by `r`,
 * `i` px in from the box (half the line, so the whole line stands inside the box).
 */
export function sheetEdge(w: number, h: number, c: number, i = 0, r = SHEET_R): string {
  return `M${n1(i + r)} ${n1(i)}L${n1(w - c + i)} ${n1(i)}L${n1(w - i)} ${n1(c - i)}L${n1(w - i)} ${n1(h - i - r)}`
    + `Q${n1(w - i)} ${n1(h - i)} ${n1(w - i - r)} ${n1(h - i)}L${n1(i + r)} ${n1(h - i)}Q${n1(i)} ${n1(h - i)} ${n1(i)} ${n1(h - i - r)}`
    + `L${n1(i)} ${n1(i + r)}Q${n1(i)} ${n1(i)} ${n1(i + r)} ${n1(i)}Z`;
}
/**
 * The turned-down corner: the cut-off triangle folded over the sheet, its point at (w − c, c). Its corners are the
 * outline's own, `i` in (round 7), so its crease is the outline's diagonal, the same one line, and its legs stand on
 * half pixels as the outline's sides do, crisp on a whole-pixel panel.
 */
export const sheetFlap = (w: number, c: number, i = 0.5): string =>
  `M${n1(w - c + i)} ${n1(i)}L${n1(w - c + i)} ${n1(c - i)}L${n1(w - i)} ${n1(c - i)}Z`;

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
  const xx = w - c + ri, xy = c - ri;
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
  const svg = f.firstElementChild as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${n1(w)} ${n1(h)}`);
  svg.querySelector('.edge')?.setAttribute('d', sheetEdge(w, h, c, 0.5, lerp(1, SHEET_R, s)));
  svg.querySelector('.flap')?.setAttribute('d', sheetFlap(w, c));
  // the crease down the middle carries into the open panel's faint hairline (round 6): from the key's weight to the
  // panel's, handed over to the panel's own as its content fades in (the two summing to the one line)
  const crease = svg.querySelector('.crease');
  crease?.setAttribute('d', `M${n1(w / 2)} 0.5L${n1(w / 2)} ${n1(h - 0.5)}`);
  const fadeIn = clamp01((p - FULL) / (1 - FULL));
  crease?.setAttribute('opacity', (lerp(0.7, CREASE_ALPHA / 0.55, s) * (1 - fadeIn)).toFixed(3));
}

/** Wire the keys once; ring.ts hands over what lives there. */
export function startLibrary(d: PanelDeps): void {
  deps = d;
  layShell();
  if (gyroEl) {
    gyroEl.addEventListener('click', () => openLibrary(lastTab(), gyroEl));
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
