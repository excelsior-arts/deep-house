// **The shell's layout, as numbers** (split from library-panel.ts, his word 10-29 on the open Duo: "please put it
// somewhere so we don't break this rule … as this is important for duo"): where the ring, the panel and the
// gyroscope stand in a window of a given size, with or without a fold. Pure: no page, so `tools/check-layout.ts` reads
// it in the gate.

import type { ShellFold } from './shell-library.ts';

export type PanelMode = 'land' | 'port' | 'mini';

/** The gyroscope's touch square, a small window's, where it stands in the gap past the ring, and the edge. */
// 40 % larger than the first 44 / 30 (his word 10-21: "we need to see it 40% bigger as it's tiny with realistic lines")
export const GYRO = 62;
export const GYRO_MINI = 28;   // the mini player's square is small: a size down again (his word 10-21)
export const GYRO_OUT = 0.6;
export const EDGE = 12;
/** The panel's gutter from the window's edge, roomy and compact, and in a small window. */
export const GUTTER = 24;
export const GUTTER_COMPACT = 10;
export const GUTTER_MINI = 6;
/** A panel wider than this stands centred in its 2/5. */
export const PANEL_MAX_W = 680;
/** The side panel beside the ring: this share of the ring's square in height and of its room in width (his word 10-21). */
export const LAND_SCALE = 0.8;
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
 *   Since duo-balance that is only its ceiling beside the ring: the ring's balance sets it (`PANEL_ROWS_H`).
 */
/**
 * **The ring's visible rim inside its square** (round 3, his word 10-23: "padding between ring and panel and panel and
 * window edge does not seem uniform"): the lanes' outer labels ("1:00", "OUT") stand 1.2 to 1.8 % of the side in from
 * the square on the side where a track draws one, and up to 4.6 % where it draws none (measured over seeds 1, 3, 8, 9
 * and 27191). The gutters are measured from the labels' ring, the rim's outermost place, so they read equal to the eye
 * and never move with the track.
 */
export const RING_INK = 0.015;
/** Beside the ring, no gutter is narrower than this share of the window's width (and the gutter's own minimum). */
export const GUTTER_SHARE = 0.04;
export const PANEL_NEED = 360;
export const PANEL_NEED_COMPACT = 280;
export const SIDE_RING_SHARE = 0.4;
export const PANEL_ASPECT = 1.4;
/** A panel under the ring shorter than this shows a row or two: beside the ring instead, wherever the window is wide. */
export const UNDER_MIN_H = 240;
/**
 * **The paper beside the ring keeps the balance** (duo-balance, his word 10-26 on the iPhone Duo: "ring and panel are
 * not proportional"; "side panel dramatically dominates ring height, breaking previous balancing rules"): where the
 * paper is widened to the width its head needs, it was made at least `PANEL_ASPECT` of that width tall, which stood it
 * far taller than a ring the width had left small (the Duo turned: 392 against a 250 ring; an SE turned, a short Mac
 * window, a desktop under about 1200 wide). And on the Duo's fold it filled its half from top to bottom. Now beside
 * the ring it is `LAND_SCALE` of the ring's square tall (the desktop's rule, his word 10-21), centred on the ring's
 * middle; where that is too short for three rows (`PANEL_ROWS_H`: a head and three rows, roomy or compact), it gives up
 * to the ring's own visible height, and never more. A desktop wide enough for the paper's share is untouched.
 */
export const PANEL_ROWS_H = 300;
/** The paper's height beside a ring of square `s2`: the balance, given up to the ring's visible side for three rows, at most `cap`. */
export const balanced = (s2: number, cap: number): number =>
  Math.max(0, Math.min(cap, Math.max(LAND_SCALE * s2, Math.min(s2 * (1 - 2 * RING_INK), PANEL_ROWS_H))));
/**
 * **On a short landscape screen the paper gets the screen's height** (duo-land, his word 10-26 on the Duo turned: "we
 * should give more size to panel in landscape, now it's too small I can only see two lines of playlist, it seems we
 * are bouncing between two extremes, either giant, or tiny"). The balance is a rule for screens with room. Where it
 * leaves fewer than four playlist rows in sight, the paper spans the usable height instead, as a tiny upright screen
 * gives it the whole width: from the top safe edge to the bottom one inside round 3's gutter (narrower, down to the
 * compact one, where that keeps four rows), under the wordmark where the wordmark stands over it, beside it where not.
 * Its width stays the head's, so the ring keeps its size.
 *
 * "Short" is read off the rows, not a device list: the height the head, four rows and the foot take (`rowsH`, measured
 * on Playlists, a list of his own lists or the featured head and its three; the phone's 53 px rows, a desktop's
 * compact 43). Where the balance already shows four, nothing moves. And it is a short screen's rule, under the short
 * layout's `SHORT_H`: the windows that lose rows at 500 and taller are narrow, not short (a desktop 560 to 740 wide),
 * and there the screen's height would stand the paper two or three times the ring ("desktop looks great though!").
 * It eases in over `SHORT_EASE` px of the balance's shortfall and over `RING_EASE` px of height under `SHORT_H`, so a
 * window dragged shorter or narrower goes from the balance into the full height without a step.
 */
export const ROWS_H_PHONE = 288;
export const ROWS_H_COMPACT = 249;
export const rowsH = (phone: boolean): number => (phone ? ROWS_H_PHONE : ROWS_H_COMPACT);
export const SHORT_EASE = 10;
export const SHORT_H = 500;
/** A compact panel narrower than this sets a track's place under its name (index.html, `data-narrow`). */
export const NARROW = 340;
/**
 * **The phone's layout only where the window is phone-sized** (panel-fit, his word 10-26 on the Mac app: "There is
 * still one size … where … the paper from being balanced with ring goes to end to end stretch … we should reduce the
 * break for mobile mode"). The compact layout (the phone's: its head, its tight gutters and, under the ring, the paper
 * from edge to edge) stood wherever a window was narrower than 700 or lower than 500. A wide window there already
 * keeps its paper beside the ring, balanced, its compact head giving the ring a quarter more room than the roomy one
 * would (292 against 209 px at the Mac's smallest window, 640 x 420). An upright one put its paper under the ring
 * end to end: 679 px wide at 699 x 760, 360 at 700. So on a desktop (a fine pointer), an upright window keeps the
 * roomy layout, its paper under the ring at `LAND_SCALE` of the ring's square and never narrower than its head, down
 * to `PHONE_W`: wider than any phone held upright (440) and the Duo's outer display (466) and its Split View (475),
 * and above the narrowest window the roomy head stands in with its gutters (`PANEL_NEED` + 2 `GUTTER`, 408). A touch
 * screen keeps the 700 x 500 rule, so every phone, iPad and Duo lays out as it did.
 */
export const PHONE_W = 480;
/**
 * **A compact panel's Playlists tab, its side padding** (panel-fit, his word 10-26: "double inner panel padding … only
 * for playlist"): `PL_PAD` (a phone's, as it was) on a panel up to `NARROW` wide, twice that from `PL_PAD_FULL` on,
 * and in proportion between. Doubled on a phone's 355 px panel, it cut the track names and crowded the foot's keys;
 * the void he saw is on the wide ones (a phone-layout window on the Mac, 679 px; an iPad's Split View; the Duo open).
 */
export const PL_PAD = 12;
export const PL_PAD_FULL = 480;
/** The ring's square, as index.html says it: 0.94 of the shorter side, at most 960. */
export const ringSide = (w: number, h: number) => Math.min(0.94 * Math.min(w, h), 960);

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
  /** The wordmark over the ring (a phone upright), smaller than the stylesheet's where the ring keeps the screen's middle (duo-balance). */
  nameFs?: number;
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
export const RING_CLEAR = 10;
/** How far the ring's ink stands above its square, as a share of the side (the throne's top is 0.018). */
export const RING_REACH = 0.02;
/** The clearance over which the ring eases from the window's middle to the middle of the space under the wordmark. */
export const RING_EASE = 48;
/**
 * **In the app, the ring keeps the screen's middle** (duo-balance, his word 10-26 on the iPhone Duo folded and
 * upright: "ring is not in the screen center"). The rule above lowered it under the wordmark, into the middle of the
 * space between the wordmark and the key, wherever it stood within `RING_EASE` of the wordmark: right for an app's
 * browser, whose page a sheet cuts short and which runs under the status bar (his ask, inapp-layout), but on the Duo's
 * short outer display, whose page nothing cuts, it set the ring 43 px under the screen's middle. Where the shell says
 * where the screen's middle falls on the page (`mid`, the app: its web view stands under the status bar's band, so the
 * page's middle is 24 px under the screen's on the Duo), the ring is centred there instead, and gives way in this
 * order: the wordmark smaller first, down to `NAME_FLOOR`, then the ring a little smaller, until the ring's ink clears
 * the wordmark by `RING_CLEAR`. It eases in over the same `RING_EASE` of clearance, so a window with room (every
 * iPhone, the Duo's Split View) is untouched to the pixel, and an app's browser keeps the rule above.
 */
/** The wordmark's ink foot under its box's top, in its font size (index.html `#name img`: 0.254 em down, 0.786 em tall). */
export const NAME_TALL = 0.254 + 0.786;   // NAME_CAP below, and the 0.254 em it stands down
/** The wordmark's stylesheet size in a `w` x `h` window (index.html `#name`). */
export const nameSize = (w: number, h: number) => Math.max(24, Math.min(0.044 * Math.min(w, h), 32));
export function ringPlace(w: number, h: number, nameFoot = 0, mid: number | null = null): { side: number; cy: number; fs?: number } {
  const s0 = ringSide(w, h);
  if (!(nameFoot > 0)) return { side: s0, cy: h / 2 };
  const top = nameFoot + RING_CLEAR;
  // how clear of the wordmark the ring stands in the window's middle, as it always has
  const clear = h / 2 - s0 / 2 - RING_REACH * s0 - top;
  if (clear >= RING_EASE) return { side: s0, cy: h / 2 };
  if (mid != null && mid > top && mid < h) {
    const reach = 0.5 + RING_REACH;
    // eased by the clearance in the middle or on the screen's, whichever is the less (the Duo: 2 and -22 px, so whole)
    const t = Math.min(1, 1 - Math.min(clear, mid - reach * s0 - top) / RING_EASE);
    const fs0 = nameSize(w, h);
    // the wordmark as large as lets the whole ring stand there, not under its floor; its foot moves up as it shrinks
    const fs = Math.min(fs0, Math.max(NAME_FLOOR, fs0 - (top - (mid - reach * s0)) / NAME_TALL));
    let side = Math.min(s0, (mid - (top - NAME_TALL * (fs0 - fs))) / reach);
    // the ring's line over the window's foot, and the ring's circle clear of the key in its corner
    side = Math.min(side, (h - RING_CLEAR - LINE_H - mid) / LINE_TOP);
    const dx = Math.max(0, w / 2 - GYRO - EDGE), dy = h - GYRO - EDGE - mid;
    if (dy > 0) side = Math.min(side, 2 * (Math.hypot(dx, dy) - RING_CLEAR));
    side = Math.max(0, side);
    return { side: s0 + t * (side - s0), cy: h / 2 + t * (mid - h / 2), fs: fs0 + t * (fs - fs0) };
  }
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
 *   paper as wide as its half inside the same gutter, from the fold and the far side alike, and as tall as the
 *   balance gives it (`balanced`, duo-balance: it filled its half from top to bottom, "dramatically" over the ring),
 *   centred on the ring's middle. Turned, the same across: the paper as wide as its half inside the gutter, centred
 *   under the ring, and its half's height. A paper half too narrow for a roomy head takes the compact one; too narrow
 *   for that, today's layout stands.
 * - Opening moves the ring from the fold into its half with the open panel's own move (one transform, never cut) and
 *   closing brings it back.
 */
export const FOLD_MIN = 1;
/** The fold, if it cuts the viewport with room on both sides. */
export const foldIn = (w: number, h: number, f: ShellFold | null): ShellFold | null =>
  f && f.at > FOLD_MIN && f.at < (f.axis === 'v' ? w : h) - FOLD_MIN ? f : null;
/** The ring alone on the fold: its side and centre. */
export function ringOnFold(w: number, h: number, f: ShellFold, nameFoot: number): { side: number; cx: number; cy: number } {
  const r = ringPlace(w, h, nameFoot);
  if (f.axis === 'v') return { side: Math.min(r.side, 0.94 * 2 * Math.min(f.at, w - f.at)), cx: f.at, cy: r.cy };
  let side = Math.min(ringSide(w, h), 0.94 * 2 * Math.min(f.at, h - f.at));
  // upright, its ink stays under the wordmark over it
  if (nameFoot > 0) side = Math.min(side, (f.at - nameFoot - RING_CLEAR) / (0.5 + RING_REACH));
  return { side: Math.max(0, side), cx: w / 2, cy: f.at };
}
/** The open layout on the fold: the ring in its half, the paper in the other; null where the paper's half is too narrow. */
export function openOnFold(w: number, h: number, f: ShellFold, small: boolean, base: boolean): { compact: boolean; s2: number; cx: number; cy: number; panel: Box; g: number } | null {
  const vertical = f.axis === 'v';
  const long = vertical ? w : h, across = vertical ? h : w;
  const a = f.at, b = long - f.at;
  for (const compact of base ? [true] : [false, true]) {
    const m = small ? GUTTER_MINI : compact ? GUTTER_COMPACT : GUTTER;
    const gMin = Math.max(m, GUTTER_SHARE * long);
    const s2 = Math.max(0, Math.min(ringSide(Infinity, across), (a - 2 * gMin) / (1 - 2 * RING_INK), (across - 2 * gMin) / (1 - 2 * RING_INK)));
    const g = (a - s2 * (1 - 2 * RING_INK)) / 2;
    const paperW = (vertical ? b : across) - 2 * g;
    const need = compact ? PANEL_NEED_COMPACT : PANEL_NEED;
    if (paperW < need) continue;
    // the balance (duo-balance): held as a book, the paper as wide as its half within the gutter (to `PANEL_MAX_W`),
    // `balanced` in height and centred on the ring's middle; turned, the same across: as wide as its half within the
    // gutter, centred under the ring, and its half's height
    let panel: Box;
    if (vertical) {
      const pw = Math.min(paperW, PANEL_MAX_W), ph = balanced(s2, across - 2 * g);
      panel = { x: a + g + (paperW - pw) / 2, y: across / 2 - ph / 2, w: pw, h: ph };
    } else {
      // upright with the crease across, as wide as its half inside the gutter too, as held as a book (his word 10-29 on
      // the open Duo: "the panel looks tiny on the open screen")
      const pw = Math.min(paperW, PANEL_MAX_W);
      panel = { x: across / 2 - pw / 2, y: a + g, w: pw, h: b - 2 * g };
    }
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
export const LINE_TOP = 0.53;
export const LINE_H = 2 + 26;
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
export const NAME_FLOOR = 18;
/**
 * **The mark keeps its proportion to the ring** (duo-fold, his word 10-23 on the sheet: "one screenshot has logo
 * clearly too large", the 640 × 450 Mac window, where today's 24 px floor made it 27 % of the window and as large as
 * the panel's head): its width is at most this share of the ring's square at rest, as it stands in his 1336 × 871
 * window (225 px against a 742 px ring), between `NAME_FLOOR` and today's size.
 */
export const NAME_RING = 0.31;
/** Kept between the wordmark and the ring's reach. */
export const NAME_CLEAR = 6;
/** The mark's cap height in its font size, and its width to its cap height (index.html `#name img`, wordmark.svg). */
export const NAME_CAP = 0.786;
export const NAME_WIDTH = 14415 / 1610;
/** The wordmark's corner: its ink's left and cap line at font size `fs` are `left + ax·fs` and `top + ay·fs`. */
export interface NameCorner { left: number; top: number; ax: number; ay: number; fs: number }
export const nameBox = (c: NameCorner, fs: number): Box => {
  const ch = NAME_CAP * fs;
  return { x: c.left + c.ax * fs, y: c.top + c.ay * fs, w: ch * NAME_WIDTH, h: ch };
};
/** Whether a ring of square `side` about (cx, cy) keeps clear of box `b` by NAME_CLEAR. */
export function clearOfName(b: Box, cx: number, cy: number, side: number): boolean {
  const nx = Math.max(b.x - NAME_CLEAR, Math.min(cx, b.x + b.w + NAME_CLEAR));
  const ny = Math.max(b.y - NAME_CLEAR, Math.min(cy, b.y + b.h + NAME_CLEAR));
  return Math.hypot(nx - cx, ny - cy) >= side * (0.5 + RING_REACH);
}
/** The largest side up to `s` whose ring about (cx, cy) keeps clear of `b`. */
export function sideClearOf(b: Box, cx: number, cy: number, s: number): number {
  if (clearOfName(b, cx, cy, s)) return s;
  let lo = 0, hi = s;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (clearOfName(b, cx, cy, mid)) lo = mid; else hi = mid; }
  return lo;
}

/**
 * Where everything stands in a `w` × `h` viewport: pure arithmetic, so a
 * check can read it without a page. `fold`, the crease across it (duo-fold); `name`, the wordmark's corner where it
 * stands in one (not upright on a phone, not in a small window); `desk`, a fine pointer (`PHONE_W`); `mid`, where the
 * screen's middle falls down the page, where the shell says (duo-balance); `ends`, the safe insets at the top and the
 * foot (duo-land: the paper of a short landscape keeps inside them).
 */
export function shellLayout(w: number, h: number, small: boolean, wide: boolean = w > h, nameFoot = 0, sides: readonly [number, number] = [0, 0], fold: ShellFold | null = null, name: NameCorner | null = null, desk = false, mid: number | null = null, ends: readonly [number, number] = [0, 0]): ShellLayout {
  const f = small ? null : foldIn(w, h, fold);
  const placed: { side: number; cy: number; cx: number; fs?: number } = f ? ringOnFold(w, h, f, nameFoot) : { ...ringPlace(w, h, small ? 0 : nameFoot, small ? null : mid), cx: w / 2 };
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
  // a desktop window held upright and wider than a phone keeps the roomy paper under the ring (`PHONE_W`); a
  // near-square one too low for that paper to show its rows (`UNDER_MIN_H`) lays it beside the ring as the window a
  // pixel wider than tall does, where the ring keeps its share there (640 x 640 and up, not a narrow browser)
  const deskUp = desk && !wide && w >= PHONE_W && (w < 700 || h < 500);
  const shareC = LAND_SCALE * (0.4 * w - GUTTER_COMPACT);
  const sideC = shareC >= PANEL_NEED_COMPACT ? 0.6 * w : w - PANEL_NEED_COMPACT - (0.4 * w - shareC);
  const deskBeside = deskUp && 0.4 * h - GUTTER < UNDER_MIN_H && sideC >= SIDE_RING_SHARE * w;
  const base = small || ((w < 700 || h < 500) && !(deskUp && !deskBeside));
  const wideNowOrBeside = wide || deskBeside;
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
    : wideNowOrBeside && (side >= SIDE_RING_SHARE * w || 0.4 * h - m0 < UNDER_MIN_H) ? 'land' : 'port';
  const m = small ? GUTTER_MINI : compact ? GUTTER_COMPACT : GUTTER;
  const fit = (x0: number, room: number) => {
    const pw = Math.min(room, PANEL_MAX_W);
    return { x: x0 + (room - pw) / 2, w: pw };
  };
  // the open ring and the panel, by the mode; `shrink` gives the ring a smaller side where the wordmark needs it
  type Ring = { s2: number; cx: number; cy: number; gutters?: [number, number, number] };
  type Open = Ring & { panel: Box; shrink: (s2: number) => Ring; paper?: (o: Ring) => Box };
  let open: Open;
  if (mode === 'mini') {
    open = { s2: s, cx: cx0, cy, panel: { x: m, y: m, w: w - 2 * m, h: h - 2 * m }, shrink: (s2) => ({ s2, cx: cx0, cy }) };
  } else if (onFold) {
    const { s2, cx, cy: cy2, panel, g } = onFold;
    open = { s2, cx, cy: cy2, panel, gutters: [g, g, g], shrink: (t) => ({ s2: t, cx, cy: cy2, gutters: [g, g, g] }) };
  } else if (mode === 'land') {
    // a little smaller than the ring's square (his word 10-21: "too large, unless users have that many playlists"):
    // LAND_SCALE of its height, centred on the window's middle, and as much narrower; where it is widened to its head,
    // the balance with the open ring itself (`balanced`, duo-balance), centred on the ring's middle
    const widened = share < need;
    const ph0 = Math.min(h - 2 * m, Math.max(LAND_SCALE * ringSide(0.6 * w, h), widened ? PANEL_ASPECT * sideW : 0));
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
    // a short landscape (`rowsH`, duo-land): where the balance shows fewer than four rows, the paper eases into the
    // usable height, inside the safe insets and round 3's gutter (its least, so the paper's top, foot and far side read
    // alike; less, down to the compact gutter, where four rows need it), under the wordmark where it stands over the paper
    const rows = rowsH(!desk && (w < 700 || h < 500));
    const tall = (b: Box): Box => {
      if (!compact || b.h >= rows) return b;
      const t = Math.min(1, (rows - b.h) / SHORT_EASE, (SHORT_H - h) / RING_EASE);
      if (!(t > 0)) return b;
      let top = ends[0];
      if (name) {
        const nb = nameBox(name, name.fs);
        if (nb.x + nb.w + gMin > b.x) top = Math.max(top, nb.y + nb.h);
      }
      const foot = h - ends[1];
      const gp = Math.max(m, Math.min(gMin, (foot - top - rows) / 2));
      const span = foot - top - 2 * gp;
      if (span <= b.h) return b;
      return { ...b, y: b.y + t * (top + gp - b.y), h: b.h + t * (span - b.h) };
    };
    const paper = (o: Ring): Box => {
      const x = sides[0] + 2 * (o.gutters?.[0] ?? 0) + o.s2 * (1 - 2 * RING_INK);
      if (!widened) return tall({ x, y: (h - ph0) / 2, w: pw, h: ph0 });
      const ph = balanced(o.s2, ph0);
      return tall({ x, y: Math.max(m, Math.min(h - m - ph, o.cy - ph / 2)), w: pw, h: ph });
    };
    const a = at(s2);
    open = { ...a, panel: paper(a), shrink: at, paper };
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
        if (open.paper) open.panel = open.paper(o);
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
    const under = { x: w / 2 - g / 2, y: below + GYRO_OUT * (h - below) - g / 2, w: g, h: g };
    // where the ring keeps the screen's middle (`ringPlace`, the app), the key under it also keeps clear of its line
    const lineFoot = placed.fs != null ? cy + LINE_TOP * s + LINE_H : -Infinity;
    gyro = h - below >= g + 2 * EDGE && under.y >= lineFoot + EDGE ? under : corner(EDGE);
  }
  const ring = mode === 'mini' ? { dx: 0, dy: 0, k: 1 } : { dx: open.cx - cx0, dy: open.cy - cy, k: open.s2 / s };
  return { mode, compact, gyro, panel: open.panel, ring, stage, ...(open.gutters && mode !== 'mini' ? { gutters: open.gutters } : {}), ...(nameOut ? { name: nameOut } : {}),
    ...(placed.fs != null && !nameOut ? { nameFs: placed.fs } : {}) };
}
