// **The Genres tab: the sky** (PLAN-LIBRARY §2, phase 4). A flat sky on a canvas you pan and zoom, line work only:
//
// - each family a region, its name small and quiet, fading as you zoom in;
// - each lit star (`sky.ts`, `lit`) a dot with its name, at its real place: its spell through the frozen projection;
// - each other sub-genre a small open ring scattered round its family's region, named on hover, focus or a tap;
// - your saved tracks as faint dots in their own colours, the playing playlist as a dashed line through its tracks;
// - where you are: a ring round the playing track's place, live as the birds move.
//
// **A lit star pressed** asks the control for its spell exactly as the machine view's genre keys did (`setSpell`, a
// spell and nothing else): the address carries it at once and the set mixes in at the next phrase line. The star is
// marked until the birds leave it. Under house-v1, which reads no birds, only the house's star presses. An open ring
// does nothing but show its name.
//
// The rings round a family stand at no spell of their own (an untuned sub-genre has none), so their places are a
// drawing: pushed out from the sky's middle and scattered by their names, worked out once. Every lit star and every
// track stands where its birds put it.

import { SKY_PLACES, skyOf, spellOf, colourOf } from './sky.ts';
import type { SkyPlace, SkyPoint } from './sky.ts';
import { spellGap, NEAR } from './genres/genre-table.ts';
import { asSpell, spellQuery } from './spell.ts';
import { note } from './ledger.ts';
import type { Control } from './control.ts';
import { libraryOpen } from './library-panel.ts';
import { skyFeed, skyWatch } from './playlists-ui.ts';
import { ringColour, hexToLch, lchToHex, liftToContrast } from './ring-colour.ts';

type P2 = { x: number; y: number };

const LIT = SKY_PLACES.filter((p) => p.lit);
const FAMILY_NAMES = [...new Set(SKY_PLACES.map((p) => p.family))];

// --- the drawing's fixed layout, in sky units ---------------------------------

/** The least spread of a family's rings about its centre (a family of one lit star, or none). */
const RING = 0.075;
/** An open ring's magnitude, from its name: one of three sizes and one of two brightnesses. Lit stars stay brightest. */
interface Ring { place: SkyPlace; at: P2; r: number; dim: boolean }
interface Cluster { family: string; centre: P2; rings: Ring[]; named: boolean }

/** A name's own random numbers (FNV-1a into mulberry32): the same name, the same sky, every time. */
function rngOf(name: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Open rings kept this far from a lit star and from each other, in sky units. */
const CLEAR_LIT = 0.05, CLEAR_OPEN = 0.032;

const CLUSTERS: Cluster[] = (() => {
  const mean = (ps: P2[]): P2 => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
  const lo = { x: Math.min(...LIT.map((p) => p.point.x)), y: Math.min(...LIT.map((p) => p.point.y)) };
  const hi = { x: Math.max(...LIT.map((p) => p.point.x)), y: Math.max(...LIT.map((p) => p.point.y)) };
  // **A family's region is about its own lit stars** (his review 10-20: Liquid read as no part of DnB & Dub): its name
  // at their centroid and its open rings scattered round it, as far out as the stars themselves spread
  const raw = FAMILY_NAMES.map((family) => {
    const own = LIT.filter((p) => p.family === family).map((p) => p.point);
    const centre = own.length ? mean(own) : null;
    const spread = centre ? Math.min(0.3, Math.max(RING, Math.sqrt(own.reduce((s, p) => s + (p.x - centre.x) ** 2 + (p.y - centre.y) ** 2, 0) / own.length))) : RING;
    return { family, centre, spread, rings: SKY_PLACES.filter((p) => p.kind === 'sub' && p.family === family && !p.lit) };
  });
  // a family with no lit star has no place: its region takes the emptiest spot in the sky
  for (const c of raw) {
    if (c.centre) continue;
    let best: P2 = mean(LIT.map((p) => p.point)), far = -1;
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
      const q = { x: lo.x + ((hi.x - lo.x) * i) / 12, y: lo.y + ((hi.y - lo.y) * j) / 12 };
      const near = Math.min(...LIT.map((p) => Math.hypot(p.point.x - q.x, p.point.y - q.y)),
        ...raw.filter((o) => o.centre).map((o) => Math.hypot(o.centre!.x - q.x, o.centre!.y - q.y) - o.spread));
      if (near > far) { far = near; best = q; }
    }
    c.centre = best;
  }
  // **Scattered, not a flower** (his note 10-20): each open ring at a radius of 0.3 to 1.2 of the family's spread and
  // an angle, both from its name, tried again (from the same name) until it clears the lit stars and the rings placed
  const placed: P2[] = [];
  return raw.map((c) => ({
    family: c.family, centre: c.centre!,
    // a family whose own preset is its lit star is named by that star
    named: !LIT.some((p) => p.kind === 'family' && p.family === c.family),
    rings: c.rings.map((place): Ring => {
      const rnd = rngOf(place.id);
      let q: P2 = c.centre!;
      for (let n = 0; n < 40; n++) {
        const rr = c.spread * (0.3 + 0.9 * rnd()), t = 2 * Math.PI * rnd();
        q = { x: c.centre!.x + rr * Math.cos(t), y: c.centre!.y + rr * Math.sin(t) };
        if (LIT.every((p) => Math.hypot(p.point.x - q.x, p.point.y - q.y) >= CLEAR_LIT) && placed.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= CLEAR_OPEN)) break;
      }
      placed.push(q);
      const m = rngOf(`${place.id}#magnitude`);
      return { place, at: q, r: [1.2, 1.7, 2.2][Math.floor(m() * 3)], dim: m() < 0.5 };
    }),
  }));
})();

/** **The families' figures**: for each family of two lit stars or more, the shortest tree joining them (Prim's). */
const FIGURES: { family: string; a: P2; b: P2 }[] = FAMILY_NAMES.flatMap((family) => {
  const ps = LIT.filter((p) => p.family === family).map((p) => p.point);
  if (ps.length < 2) return [];
  const inTree = [ps[0]], rest = ps.slice(1), out: { family: string; a: P2; b: P2 }[] = [];
  while (rest.length) {
    let best = { i: 0, from: inTree[0], d: Infinity };
    rest.forEach((q, i) => { for (const p of inTree) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < best.d) best = { i, from: p, d }; } });
    const [q] = rest.splice(best.i, 1);
    inTree.push(q);
    out.push({ family, a: best.from, b: q });
  }
  return out;
});

/** The sky's frame in sky units: every star and ring, with a margin. Fixed, so nothing moves as tracks are saved. */
const FRAME = (() => {
  const ps: P2[] = [...LIT.map((p) => p.point), ...CLUSTERS.flatMap((c) => [c.centre, ...c.rings.map((r) => r.at)])];
  const m = 0.06;
  return { x0: Math.min(...ps.map((p) => p.x)) - m, x1: Math.max(...ps.map((p) => p.x)) + m, y0: Math.min(...ps.map((p) => p.y)) - m, y1: Math.max(...ps.map((p) => p.y)) + m };
})();

// --- colour: what the ring would wear at each place (his review 10-20) ---------------

/** A star's ink: the ring's colour at its spell, exactly what the ring wears tuned there. */
const INK = new Map<string, string>(SKY_PLACES.map((p) => [p.id, ringColour(p.spell).hex]));
/** A family's ink: the ring's colour at the family's preset; its open rings and its name wear it. */
const FAMILY_INK = new Map<string, string>(SKY_PLACES.filter((p) => p.kind === 'family').map((p) => [p.family, ringColour(p.spell).hex]));
/** A name's ink: the star's hue, lighter, lifted until it reads as type against the black (contrast 10). */
const NAME_INK = new Map<string, string>([...INK].map(([id, hex]) => {
  const [L, C, h] = hexToLch(hex), c = C * 0.75;
  return [id, lchToHex(liftToContrast(Math.min(1, L + 0.08), c, h, 10), c, h)];
}));

// --- the view: a pannable, zoomable canvas (his phone, 10-20) ---------------------

const section = document.getElementById('libGenres') as HTMLElement | null;
const sheet = document.getElementById('library') as HTMLElement | null;
const wrap = section?.querySelector<HTMLElement>('.skyWrap') ?? null;
const recentre = document.getElementById('skyHome') as HTMLButtonElement | null;
let control: Control;
/** the lit star pressed, marked until the birds leave it */
let pressed: SkyPlace | null = null;
/** the open ring whose name shows (a tap, a hover, a focus) */
let shown: string | null = null;
/** the lit star under the mouse or the keyboard's focus: its dot and name light together */
let hover: string | null = null;
/** the shown names' boxes, as last painted: a name is its star's target too */
let labels = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
let size = { w: 0, h: 0 };
/**
 * **The view**: `k` screen pixels to a sky unit and the sky point at the canvas's centre. Everything is drawn at its
 * screen place, so a dot, a line and a name keep their size whatever the zoom.
 */
interface View { k: number; cx: number; cy: number }
let view: View = { k: 1, cx: 0, cy: 0 };
let first: View = view;
let fit = 1;
/** Stars at least this far apart on a phone's first view: a finger's target each. */
const FINGER = 44;
/**
 * **A phone's first view gives way, within reason** (his word 10-21: the first view was so deep that a press near
 * its edge showed only half its rings): it zooms out to fit the lit stars, but never so far that the closest two stand
 * nearer than two thirds of a finger. Where they cannot all fit, it shows as many as it can, where you are inside.
 */
const FIRST_SPACING = 30;
/** The first view keeps the lit stars and where you are this far inside the canvas, in px. */
const FIRST_EDGE = 24;
/** The closest two lit stars, in sky units. */
const CLOSEST = (() => {
  let d = Infinity;
  for (let i = 0; i < LIT.length; i++) for (let j = i + 1; j < LIT.length; j++) d = Math.min(d, Math.hypot(LIT[i].point.x - LIT[j].point.x, LIT[i].point.y - LIT[j].point.y));
  return d;
})();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const f1 = (v: number) => v.toFixed(1);
const compact = () => sheet?.dataset.density === 'compact';
const visible = () => !!section && !section.hidden && libraryOpen() && size.w > 0;
const toPxIn = (v: View, p: P2): P2 => ({ x: size.w / 2 + (p.x - v.cx) * v.k, y: size.h / 2 - (p.y - v.cy) * v.k });
const toPx = (p: P2): P2 => toPxIn(view, p);
const toSky = (x: number, y: number): P2 => ({ x: view.cx + (x - size.w / 2) / view.k, y: view.cy - (y - size.h / 2) / view.k });
const moved = () => Math.abs(view.k / first.k - 1) > 0.01 || Math.hypot(view.cx - first.cx, view.cy - first.cy) * view.k > 2;

/** Where the page is: the playing track's birds, as the address holds them while a hand moves them. */
const here = (): SkyPoint => { try { return skyOf(spellOf(control.linkNow())); } catch (e) { return skyOf(null); } };
const asked = () => { try { return spellOf(control.linkNow()); } catch (e) { return null; } };
const playingSpell = () => { try { return spellOf(control.linkPlaying()); } catch (e) { return null; } };
const v1 = () => control.state.strategy === 'house-v1';

/** Bounds: the zoom between a little under the fit and eight times a finger's spacing; the centre inside the sky. */
function clampView(v: View): View {
  const k = Math.min(Math.max(v.k, fit * 0.8), Math.max(fit * 2, (FINGER / CLOSEST) * 4));
  return { k, cx: Math.min(Math.max(v.cx, FRAME.x0), FRAME.x1), cy: Math.min(Math.max(v.cy, FRAME.y0), FRAME.y1) };
}

/**
 * **The first view**: the sky's extent fitted to the whole canvas; on a phone and the mini player zoomed in until
 * the closest two lit stars stand a finger apart, centred on where you are.
 */
function firstView(): View {
  const pad = 16;
  fit = Math.min((size.w - 2 * pad) / (FRAME.x1 - FRAME.x0), (size.h - 2 * pad) / (FRAME.y1 - FRAME.y0));
  const whole: View = { k: fit, cx: (FRAME.x0 + FRAME.x1) / 2, cy: (FRAME.y0 + FRAME.y1) / 2 };
  if (!compact() || fit * CLOSEST >= FINGER) return whole;
  const h = here();
  // the zoom that fits every lit star and where you are, held between a finger's spacing and two thirds of it
  const xs = [...LIT.map((p) => p.point.x), h.x], ys = [...LIT.map((p) => p.point.y), h.y];
  const kLit = Math.min((size.w - 2 * FIRST_EDGE) / (Math.max(...xs) - Math.min(...xs)), (size.h - 2 * FIRST_EDGE) / (Math.max(...ys) - Math.min(...ys)));
  const k = Math.max(FIRST_SPACING / CLOSEST, Math.min(FINGER / CLOSEST, kLit));
  // the centre: as many lit stars inside as the canvas holds, where you are always inside, and as near the middle as
  // that allows
  const rx = (size.w / 2 - FIRST_EDGE) / k, ry = (size.h / 2 - FIRST_EDGE) / k;
  if (rx <= 0 || ry <= 0) return clampView({ k, cx: h.x, cy: h.y });
  let best = { n: -1, d: Infinity, cx: h.x, cy: h.y };
  const N = 24;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const cx = h.x - rx + (2 * rx * i) / N, cy = h.y - ry + (2 * ry * j) / N;
    const n = LIT.filter((p) => Math.abs(p.point.x - cx) <= rx && Math.abs(p.point.y - cy) <= ry).length;
    const d = Math.hypot(cx - h.x, cy - h.y);
    if (n > best.n || (n === best.n && d < best.d)) best = { n, d, cx, cy };
  }
  return clampView({ k, cx: best.cx, cy: best.cy });
}

// --- bringing a mark into view: a short glide, never a jump, never against a hand (his word 10-21) ------------

/** A hand's last pan or zoom; for this long after it nothing moves the view by itself. */
let handAt = -Infinity;
const HAND_QUIET = 1500;
/** Whether a finger or a button is down on the canvas (set by the gestures). */
let handDown = () => false;
const handBusy = () => handDown() || performance.now() - handAt < HAND_QUIET;
/** A mark is brought this far inside the canvas, in px. */
const MARGIN = 12;
const GLIDE_MS = 320;
let glide: { from: View; to: View; t0: number } | null = null;
/** The view as it will rest: a glide's end while one runs. */
const resting = () => glide?.to ?? view;
const stillMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** A glide's step: the view eased toward its end (a cubic ease-out). */
function stepGlide(): void {
  if (!glide) return;
  const t = Math.min(1, (performance.now() - glide.t0) / GLIDE_MS), e = 1 - (1 - t) ** 3;
  const { from, to } = glide;
  view = { k: from.k + (to.k - from.k) * e, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e };
  if (t >= 1) glide = null;
}
/** A hand takes the view: any glide stops where it is. */
function handTakes(): void { glide = null; handAt = performance.now(); }

/**
 * **Bring a mark in, just enough**: of the boxes offered (the mark with its name on each side it may take), the one
 * that needs the least move. Nothing moves when one already sits inside with the margin; it never recentres.
 */
function bringIn(options: Box[]): void {
  if (!options.length || size.w <= 0) return;
  const axis = (lo: number, hi: number, room: number) =>
    hi - lo > room - 2 * MARGIN ? room / 2 - (lo + hi) / 2 : lo < MARGIN ? MARGIN - lo : hi > room - MARGIN ? room - MARGIN - hi : 0;
  const shifts = options.map((b) => ({ x: axis(b.x0, b.x1, size.w), y: axis(b.y0, b.y1, size.h) }));
  const s = shifts.reduce((a, b) => (Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y) - 0.5 ? b : a));
  if (Math.abs(s.x) < 0.5 && Math.abs(s.y) < 0.5) return;
  const v = resting();
  const to = clampView({ k: v.k, cx: v.cx - s.x / v.k, cy: v.cy + s.y / v.k });
  if (stillMotion()) { glide = null; view = to; } else glide = { from: view, to, t0: performance.now() };
  schedule();
}

/** A mark's boxes at the resting view: its ring, and with a name, the ring and the name on each side it may take. */
function markBoxes(at: P2, ring: number, name: string | null): Box[] {
  const q = toPxIn(resting(), at), r = ring + 1;
  const dot: Box = { x0: q.x - r, x1: q.x + r, y0: q.y - r, y1: q.y + r };
  if (!name) return [dot];
  const fs = nameSize(resting()), w = widthOf(name.toUpperCase(), fs, 0.06) + 2, g = 12;
  const join = (b: Box): Box => ({ x0: Math.min(dot.x0, b.x0), x1: Math.max(dot.x1, b.x1), y0: Math.min(dot.y0, b.y0), y1: Math.max(dot.y1, b.y1) });
  const side = (base: number) => ({ y0: base - fs * 0.78 - 1, y1: base + fs * 0.22 + 1 });
  return [
    join({ x0: q.x + g - 2, x1: q.x + g + w, ...side(q.y + fs * 0.36) }),
    join({ x0: q.x - g - w, x1: q.x - g + 2, ...side(q.y + fs * 0.36) }),
    join({ x0: q.x - w / 2, x1: q.x + w / 2, ...side(q.y - g - 1) }),
    join({ x0: q.x - w / 2, x1: q.x + w / 2, ...side(q.y + g + fs * 0.78) }),
  ];
}
/** The ring of where you are, and the pressed star's: the larger, with its stroke. */
const HERE_R = 9.5;

/** Zoom by `f` about a screen point, the sky point under it held in place. */
function zoomAt(f: number, x: number, y: number): void {
  handTakes();
  const at = toSky(x, y);
  const k = clampView({ ...view, k: view.k * f }).k;
  view = clampView({ k, cx: at.x - (x - size.w / 2) / k, cy: at.y + (y - size.h / 2) / k });
  schedule();
}
function panBy(dx: number, dy: number): void {
  handTakes();
  view = clampView({ ...view, cx: view.cx - dx / view.k, cy: view.cy + dy / view.k });
  schedule();
}

// --- the drawing --------------------------------------------------------------

/**
 * Names grow a little as you zoom in (his word 10-20): today's size at the fit, up to 1.35 times at the deepest zoom,
 * eased by the log of the zoom; the dots keep their size.
 */
function growAt(v: View): number {
  const deepest = Math.max(fit * 2, (FINGER / CLOSEST) * 4) / fit;
  return 1 + 0.35 * Math.min(1, Math.max(0, Math.log(v.k / fit) / Math.log(deepest)));
}
const nameSize = (v: View) => (compact() ? 9 : 9.5) * growAt(v);

type Box = { x0: number; y0: number; x1: number; y1: number };
let measure: CanvasRenderingContext2D | null = null;
/** A name's width as drawn: the panel's face, its tracking. */
function widthOf(text: string, fs: number, track: number): number {
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return text.length * fs * 0.75;
  measure.font = `450 ${fs}px Jost, Futura, sans-serif`;
  return measure.measureText(text).width + text.length * fs * track;
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * **Names never overlap.** In order of importance (the pressed star, then the lit stars nearest where you are), each
 * name takes the first side of its dot with room (right, left, above, below), clear of every name placed and every
 * dot. A name with no room waits: zooming in makes room, and it shows.
 */
function placeNames(fs: number, taken: Box[], hereAt: P2): Map<string, { x: number; y: number; anchor: string; b: Box }> {
  const out = new Map<string, { x: number; y: number; anchor: string; b: Box }>();
  const dots = LIT.map((p) => { const q = toPx(p.point); return { id: p.id, b: { x0: q.x - 5, x1: q.x + 5, y0: q.y - 5, y1: q.y + 5 } }; });
  const boxes: Box[] = [...taken];
  const inside = (b: Box) => b.x0 >= 2 && b.x1 <= size.w - 2 && b.y0 >= 2 && b.y1 <= size.h - 2;
  const order = [...LIT].sort((a, b) => (a === pressed ? -1 : b === pressed ? 1 : 0)
    || Math.hypot(a.point.x - hereAt.x, a.point.y - hereAt.y) - Math.hypot(b.point.x - hereAt.x, b.point.y - hereAt.y));
  for (const p of order) {
    const q = toPx(p.point);
    if (q.x < -40 || q.x > size.w + 40 || q.y < -40 || q.y > size.h + 40) continue;
    const text = p.name.toUpperCase(), w = widthOf(text, fs, 0.06), h = fs, g = 12;
    const at = (x: number, base: number, anchor: string) => {
      const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      return { x, y: base, anchor, b: { x0: x0 - 2, x1: x0 + w + 2, y0: base - h * 0.78 - 1, y1: base + h * 0.22 + 1 } };
    };
    const tries = [at(q.x + g, q.y + h * 0.36, 'start'), at(q.x - g, q.y + h * 0.36, 'end'), at(q.x, q.y - g - 1, 'middle'), at(q.x, q.y + g + h * 0.78, 'middle')];
    const pick = tries.find((t) => inside(t.b) && !boxes.some((o) => overlaps(t.b, o)) && !dots.some((d) => d.id !== p.id && overlaps(t.b, d.b)));
    if (!pick) continue;
    boxes.push(pick.b);
    out.set(p.id, { x: pick.x, y: pick.y, anchor: pick.anchor, b: pick.b });
  }
  return out;
}

// --- the starfield: depth under the sky (his word 10-20, "to make it look more like space") ---------------------

/**
 * **Two layers of faint dust**, a tile each repeated across the canvas, so the density follows the canvas's area: a
 * phone and a desktop see the same sky. Each tile is seeded (the same every time), drawn in gentle clusters over a
 * sparse scatter, never a grid. The layers pan at 0.6 and 0.85 of the sky and feel a zoom far less, and every dot keeps
 * its size on screen. Nothing on it presses, and no dot is as large or as bright as a track's.
 */
const TILE = 360;
interface Dust { x: number; y: number; r: number; a: number; c: string }
const DUST_TINTS = ['255,255,255', '255,240,222', '226,236,255'];
const LAYERS: { rate: number; zoom: number; dots: Dust[] }[] = [
  { rate: 0.6, zoom: 0.18, seed: 'sky dust far', n: 46 },
  { rate: 0.85, zoom: 0.32, seed: 'sky dust near', n: 30 },
].map(({ rate, zoom, seed, n }) => {
  const rnd = rngOf(seed), dots: Dust[] = [];
  const wrapT = (v: number) => ((v % TILE) + TILE) % TILE;
  const dust = (x: number, y: number): Dust => ({ x: wrapT(x), y: wrapT(y), r: 0.28 + 0.32 * rnd() * rnd(), a: [0.16, 0.26, 0.4][Math.floor(rnd() * 3)] * (rate < 0.7 ? 0.8 : 1), c: DUST_TINTS[rnd() < 0.7 ? 0 : rnd() < 0.5 ? 1 : 2] });
  // a sparse scatter, then a few clusters about seeded centres: voids fall between them
  for (let i = 0; i < n * 0.55; i++) dots.push(dust(rnd() * TILE, rnd() * TILE));
  for (let c = 0; c < 3; c++) {
    const cx = rnd() * TILE, cy = rnd() * TILE, spread = 18 + rnd() * 34;
    for (let i = 0; i < n * 0.15; i++) {
      const t = 2 * Math.PI * rnd(), d = spread * Math.sqrt(-2 * Math.log(1 - rnd() * 0.98));
      dots.push(dust(cx + d * Math.cos(t), cy + d * Math.sin(t)));
    }
  }
  return { rate, zoom, dots };
});
let fieldKey = '';
function paintField(): void {
  const cv = wrap?.querySelector<HTMLCanvasElement>('canvas.skyField');
  if (!cv) return;
  const key = `${size.w}x${size.h}:${view.k.toFixed(3)}:${view.cx.toFixed(4)}:${view.cy.toFixed(4)}`;
  if (key === fieldKey) return;
  fieldKey = key;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) { cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr); }
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size.w, size.h);
  for (const L of LAYERS) {
    // the layer's spacing follows the zoom only a little; its offset follows the pan at its rate
    const s = Math.pow(view.k / fit, L.zoom), T = TILE * s;
    const ox = size.w / 2 - view.cx * view.k * L.rate, oy = size.h / 2 + view.cy * view.k * L.rate;
    const x0 = ((ox % T) + T) % T - T, y0 = ((oy % T) + T) % T - T;
    for (let tx = x0; tx < size.w; tx += T) for (let ty = y0; ty < size.h; ty += T) {
      for (const d of L.dots) {
        const x = tx + d.x * s, y = ty + d.y * s;
        if (x < -2 || y < -2 || x > size.w + 2 || y > size.h + 2) continue;
        g.fillStyle = `rgba(${d.c},${d.a})`;
        g.beginPath();
        g.arc(x, y, d.r, 0, 2 * Math.PI);
        g.fill();
      }
    }
  }
}

let frame = 0;
const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; stepGlide(); paint(); if (glide) schedule(); }); };
let painted = { here: '', pressed: '' };

/** Lay the canvas for its size: the first view, the keys. */
function draw(): void {
  if (!section || !wrap) return;
  const r = wrap.getBoundingClientRect();
  const next = { w: r.width, h: r.height };
  const resized = next.w !== size.w || next.h !== size.h;
  size = next;
  if (!visible()) return;
  if (resized || !wrap.querySelector('.skyKey')) {
    first = firstView();
    view = first;
    glide = null;
    lastHere = here();
    // the keys: one for every star, for the keyboard and a reader; a pointer finds the nearest star itself
    const keys = [...LIT.map((p) => ({ p, lit: true })), ...CLUSTERS.flatMap((c) => c.rings.map((g) => ({ p: g.place, lit: false })))]
      .map(({ p, lit }) => `<button type="button" class="skyKey${lit ? '' : ' open'}" data-id="${esc(p.id)}" aria-label="${esc(lit ? p.name : `${p.name}, not tuned`)}"${lit ? '' : ' aria-disabled="true"'}></button>`).join('');
    wrap.querySelectorAll('canvas.skyField, svg.sky, .skyKey').forEach((e) => e.remove());
    wrap.insertAdjacentHTML('afterbegin', `<canvas class="skyField" aria-hidden="true"></canvas><svg class="sky" role="img" aria-label="The genre sky"></svg>`);
    fieldKey = '';
    wrap.insertAdjacentHTML('beforeend', keys);
  }
  paint();
}

/** Everything at its screen place for the view as it is. */
function paint(): void {
  if (!wrap || !visible()) return;
  const svg = wrap.querySelector('svg.sky');
  if (!svg) return;
  const fs = nameSize(view), fam = 8 * growAt(view);
  const hereAt = here();
  if (pressed && spellGap(asked(), asSpell(pressed.spell)) > NEAR && spellGap(playingSpell(), asSpell(pressed.spell)) > NEAR) pressed = null;
  const feed = skyFeed();
  const dots = feed.saved.map((l) => { const q = toPx(skyOf(spellOf(l))); return `<circle cx="${f1(q.x)}" cy="${f1(q.y)}" r="1.6" fill="${esc(colourOf(l))}" opacity="0.5"/>`; }).join('');
  const line = feed.playing && feed.playing.length > 1
    ? `<polyline class="skyList" points="${feed.playing.map((l) => { const q = toPx(skyOf(spellOf(l))); return `${f1(q.x)},${f1(q.y)}`; }).join(' ')}"/>` : '';
  // family names fade as you zoom in: gone at two and a half times the fit
  const fade = Math.max(0, Math.min(1, (2.5 - view.k / fit) / 1));
  const taken: Box[] = [];
  const dotBoxes: Box[] = LIT.map((p) => { const q = toPx(p.point); return { x0: q.x - 6, x1: q.x + 6, y0: q.y - 6, y1: q.y + 6 }; });
  // **a family's figure** (his review 10-20): faint lines joining its lit stars, the shortest tree through them, in the
  // family's colour, so a star far from its kin (Liquid) still reads as theirs; never across families
  const figures = FIGURES.map(({ family, a, b }) => {
    const p = toPx(a), q = toPx(b);
    return `<line class="skyFigure" x1="${f1(p.x)}" y1="${f1(p.y)}" x2="${f1(q.x)}" y2="${f1(q.y)}" style="stroke:${FAMILY_INK.get(family)}"/>`;
  }).join('');
  const regions = figures + CLUSTERS.map((c) => {
    // the family's name at its lit stars' centroid, stepped up or down off any dot, kept inside the canvas
    const text = c.family.toUpperCase(), w = widthOf(text, fam, 0.16), ink = FAMILY_INK.get(c.family) ?? 'var(--quiet)';
    const at = toPx(c.centre), x = Math.min(Math.max(at.x, w / 2 + 4), size.w - w / 2 - 4);
    const boxAt = (y: number): Box => ({ x0: x - w / 2, x1: x + w / 2, y0: y - fam / 2, y1: y + fam / 2 });
    const y = [0, 14, -14, 26, -26].map((d) => at.y + d).find((yy) => !dotBoxes.some((b) => overlaps(boxAt(yy), b)) && !taken.some((b) => overlaps(boxAt(yy), b))) ?? at.y;
    const q = { x, y };
    let label = '';
    if (c.named && fade > 0) {
      if (fade > 0.3) taken.push({ x0: q.x - w / 2, x1: q.x + w / 2, y0: q.y - fam / 2, y1: q.y + fam / 2 });
      label = `<text class="skyFamily" x="${f1(q.x)}" y="${f1(q.y + fam / 2 - 1)}" font-size="${fam}" opacity="${(0.55 * fade).toFixed(2)}" style="fill:${ink}">${esc(text)}</text>`;
    }
    return label + c.rings.map((g) => { const p = toPx(g.at); return `<circle class="skyOpen${g.dim ? ' dim' : ''}" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${g.r}" style="stroke:${ink}"/>`; }).join('');
  }).join('');
  const names = placeNames(fs, taken, hereAt);
  labels = new Map([...names].map(([id, n]) => [id, n.b]));
  const stars = LIT.map((p) => {
    const q = toPx(p.point), n = names.get(p.id), lit = hover === p.id;
    // hovered or focused, the dot and its name light together
    return `<circle class="skyStar" cx="${f1(q.x)}" cy="${f1(q.y)}" r="${lit ? 4.2 : 3}" style="fill:${INK.get(p.id)}"/>${n ? `<text class="skyName" x="${f1(n.x)}" y="${f1(n.y)}" text-anchor="${n.anchor}" font-size="${fs}" style="fill:${lit ? '#ffffff' : NAME_INK.get(p.id)}">${esc(p.name.toUpperCase())}</text>` : ''}`;
  }).join('');
  const h = toPx(hereAt), pr = pressed ? toPx(pressed.point) : null;
  let tip = '';
  const ring = shown ? CLUSTERS.flatMap((c) => c.rings).find((g) => g.place.id === shown) : null;
  if (ring) {
    const q = toPx(ring.at), right = q.x > size.w * 0.6;
    tip = `<text class="skyTip" style="fill:${NAME_INK.get(ring.place.family ? SKY_PLACES.find((x) => x.kind === 'family' && x.family === ring.place.family)!.id : '')}" x="${f1(right ? q.x - 6 : q.x + 6)}" y="${f1(q.y - 6)}" text-anchor="${right ? 'end' : 'start'}" font-size="${fs}">${esc(ring.place.name.toUpperCase())}</text>`;
  }
  paintField();
  svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  svg.innerHTML = `${dots}${line}${regions}${stars}${pr ? `<circle class="skyPressed" r="6.5" cx="${f1(pr.x)}" cy="${f1(pr.y)}"/>` : ''}<circle class="skyHere" r="${HERE_R}" cx="${f1(h.x)}" cy="${f1(h.y)}"/>${tip}`;
  for (const k of wrap.querySelectorAll<HTMLElement>('.skyKey')) {
    const place = byId(k.dataset.id);
    const at = place ? toPx(place.lit ? place.point : CLUSTERS.flatMap((c) => c.rings).find((g) => g.place.id === place.id)!.at) : { x: -99, y: -99 };
    k.style.left = `${f1(at.x)}px`;
    k.style.top = `${f1(at.y)}px`;
    k.toggleAttribute('data-pressed', !!pressed && k.dataset.id === pressed.id);
  }
  if (recentre) { const off = !moved(); recentre.toggleAttribute('data-off', off); recentre.tabIndex = off ? -1 : 0; recentre.setAttribute('aria-hidden', String(off)); }
  painted = { here: `${f1(h.x)},${f1(h.y)}`, pressed: pressed?.id ?? '' };
}

/** The marks that move without a hand on the canvas: where you are and the pressed star. */
let lastHere: P2 | null = null;
function live(): void {
  if (!visible()) return;
  const hs = here();
  // **where you are, kept in sight** as it walks: only while it was in sight, so a hand that panned away is not
  // pulled back, and never while a hand is on the canvas or just left it
  if (lastHere && Math.hypot(hs.x - lastHere.x, hs.y - lastHere.y) > 1e-6 && !handBusy()) {
    const was = toPxIn(resting(), lastHere);
    if (was.x >= 0 && was.y >= 0 && was.x <= size.w && was.y <= size.h) bringIn(markBoxes(hs, HERE_R, null));
  }
  lastHere = { x: hs.x, y: hs.y };
  const h = toPx(hs);
  if (`${f1(h.x)},${f1(h.y)}` !== painted.here || (pressed?.id ?? '') !== painted.pressed
    || (pressed && spellGap(asked(), asSpell(pressed.spell)) > NEAR && spellGap(playingSpell(), asSpell(pressed.spell)) > NEAR)) schedule();
}

/** **Press a lit star**: the machine view's own ask (`setSpell`), and one line in the ledger. */
function press(p: SkyPlace): void {
  if (v1() && !p.home) return;
  const spell = asSpell(p.spell);
  const query = spellQuery(spell);
  note('spell', `genre preset: ${p.name} → spell ${query ?? 'the house'}`, { genre: p.name, spell: query ?? 'house', reachable: true });
  // the house is asked for as nothing at all, which is what a bare link and a release of every bird ask for
  control.setSpell(query ? spell : null);
  pressed = p;
  shown = null;
  // **a press always shows its result whole**: the star, its rings and its name come inside the canvas
  bringIn(markBoxes(p.point, HERE_R, p.name));
  lastHere = here();
  schedule();
}

/** The star nearest a point on the canvas, within a finger's reach (22 px), a lit one before an open ring. */
function nearest(x: number, y: number): { place: SkyPlace; lit: boolean } | null {
  let best: { place: SkyPlace; lit: boolean } | null = null, at = FINGER / 2;
  for (const p of LIT) {
    const q = toPx(p.point);
    let d = Math.hypot(q.x - x, q.y - y);
    // **a shown name is the star's too** (his word 10-20): within 4 px of its box, counted 3 px further than the box
    // itself, so a dot nearer the pointer still wins where a name lies over it
    const b = labels.get(p.id);
    if (b) {
      const out = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
      if (out <= 4) d = Math.min(d, out + 3);
    }
    if (d <= at) { at = d; best = { place: p, lit: true }; }
  }
  if (best) return best;
  at = 14;
  for (const g of CLUSTERS.flatMap((c) => c.rings)) { const q = toPx(g.at), d = Math.hypot(q.x - x, q.y - y); if (d <= at) { at = d; best = { place: g.place, lit: false }; } }
  return best;
}
const byId = (id: string | undefined) => SKY_PLACES.find((p) => p.id === id) ?? null;

/** A tap: a lit star tunes, an open ring shows its name, empty sky clears it. */
function tap(x: number, y: number): void {
  const hit = nearest(x, y);
  if (!hit) { if (shown) { shown = null; schedule(); } return; }
  if (hit.lit) press(hit.place);
  else { shown = hit.place.id; schedule(); }
}

// --- the gestures: inside the canvas, never the panel's scroll -------------------

function wireGestures(el: HTMLElement): void {
  const pts = new Map<number, P2>();
  let start: { x: number; y: number; t: number; panned: boolean } | null = null;
  let pinch: { d: number; mid: P2 } | null = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  handDown = () => pts.size > 0;
  const local = (e: PointerEvent | WheelEvent | MouseEvent): P2 => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pair = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; };
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.skyHome')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { const p = local(e); start = { x: p.x, y: p.y, t: performance.now(), panned: false }; pinch = null; }
    if (pts.size === 2) { pinch = pair(); if (start) start.panned = true; }
  });
  el.addEventListener('pointermove', (e) => {
    const p = local(e);
    // a mouse with no button down is hovering, whatever a lost pointerup left behind
    if (e.pointerType === 'mouse' && e.buttons === 0 && pts.has(e.pointerId)) { pts.delete(e.pointerId); if (!pts.size) { start = null; pinch = null; } }
    if (!pts.has(e.pointerId)) {
      // a mouse hovering, by the same hit test as a press: a lit star or its name shows the hand, an open ring the arrow
      // (and says its name), the empty sky the open hand
      if (e.pointerType !== 'mouse') return;
      const hit = nearest(p.x, p.y);
      el.style.cursor = hit ? (hit.lit ? 'pointer' : 'default') : 'grab';
      const next = hit && !hit.lit ? hit.place.id : null;
      const over = hit && hit.lit ? hit.place.id : null;
      if (next !== shown || over !== hover) { shown = next; hover = over; schedule(); }
      return;
    }
    const was = pts.get(e.pointerId)!;
    pts.set(e.pointerId, p);
    if (pts.size >= 2 && pinch) {
      const now = pair();
      if (pinch.d > 0) zoomAt(now.d / pinch.d, now.mid.x, now.mid.y);
      panBy(now.mid.x - pinch.mid.x, now.mid.y - pinch.mid.y);
      pinch = now;
      return;
    }
    if (!start) return;
    // a drag that starts on a star pans and never tunes
    if (!start.panned && Math.hypot(p.x - start.x, p.y - start.y) > 6) { start.panned = true; el.style.cursor = 'grabbing'; }
    if (start.panned) panBy(p.x - was.x, p.y - was.y);
  });
  const end = (e: PointerEvent, cancel: boolean) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 1) { pinch = null; const [only] = [...pts.values()]; start = { x: only.x, y: only.y, t: performance.now(), panned: true }; return; }
    if (pts.size) return;
    const s = start;
    start = null;
    { const p = local(e), hit = nearest(p.x, p.y); el.style.cursor = e.pointerType === 'mouse' ? (hit ? (hit.lit ? 'pointer' : 'default') : 'grab') : ''; }
    if (cancel || !s || s.panned) return;
    const p = local(e), t = performance.now();
    // a second tap at the same spot zooms in a step there
    if (t - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) { lastTap = { t: 0, x: 0, y: 0 }; zoomAt(2, p.x, p.y); return; }
    lastTap = { t, x: p.x, y: p.y };
    tap(p.x, p.y);
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pts.size && (shown || hover)) { shown = null; hover = null; schedule(); } });
  // a trackpad's pinch (ctrl and the wheel), and ctrl, shift or cmd with the wheel, zoom about the pointer (his word
  // 10-20: ctrl is the least convenient on a Mac); a plain wheel pans. macOS turns shift and a vertical wheel into a
  // horizontal one, so with shift the amount is deltaX where deltaY is nought.
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.h : 1;
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      const dy = e.deltaY === 0 && e.shiftKey ? e.deltaX : e.deltaY;
      zoomAt(Math.exp(-dy * unit * 0.01), p.x, p.y);
    } else panBy(-e.deltaX * unit, -e.deltaY * unit);
  }, { passive: false });
  // Safari's own pinch events would zoom the page: the pointers above already zoom the sky
  for (const t of ['gesturestart', 'gesturechange']) el.addEventListener(t, (e) => e.preventDefault());
}

export function startGenres(c: Control): void {
  control = c;
  if (!section || !wrap) return;
  wireGestures(wrap);
  // a key pressed by the keyboard is its own star; pointers are the gestures' (the keys take none)
  wrap.addEventListener('click', (e) => {
    const key = (e.target as HTMLElement).closest<HTMLElement>('.skyKey');
    if (!key || e.detail !== 0) return;
    const place = byId(key.dataset.id);
    if (!place) return;
    if (place.lit) press(place);
    else { shown = place.id; schedule(); }
  });
  wrap.addEventListener('focusin', (e) => {
    const key = (e.target as HTMLElement).closest<HTMLElement>('.skyKey');
    if (!key) return;
    shown = key.classList.contains('open') ? key.dataset.id ?? null : null;
    hover = key.classList.contains('open') ? null : key.dataset.id ?? null;
    // a star focused out of sight comes into view
    const x = parseFloat(key.style.left), y = parseFloat(key.style.top);
    if (x < 22 || y < 22 || x > size.w - 22 || y > size.h - 22) { const at = toSky(x, y); glide = null; view = clampView({ ...view, cx: at.x, cy: at.y }); }
    schedule();
  });
  wrap.addEventListener('focusout', () => { if (hover || shown) { hover = null; shown = null; schedule(); } });
  recentre?.addEventListener('click', () => { glide = null; view = first; schedule(); });
  new ResizeObserver(() => draw()).observe(wrap);
  skyWatch(() => { if (visible()) schedule(); });
  control.subscribe(() => live());
  // a hand moving a bird writes the address and nothing else: the ring of where you are follows it
  window.setInterval(live, 250);
}
