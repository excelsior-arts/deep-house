// **The scroll, the panel's key** (star-keys, his word 10-22: "a little piece of paper with star map, aka scroll").
// Seven forms for his review (round 3, "thinner stroke for paper rolls"), all engraved line work in the key's colour
// (`currentColor`) at about four fifths of the first prototype's weight, the map's lines finer still, and the map's
// stars in real colours: one per playlist in the colour its constellation draws, the example sky's with none
// (`inks`, from playlists-ui.ts), the brightest star the first; stars past the playlists' count stay in the ink.
//
// 1. two rods, the sheet open between them (the first prototype's, finer);
// 2. one roll, the other end loose, its corner curling up;
// 3. half unrolled and seen at an angle, the roll lying at the far edge;
// 4. a folded map, its crease down the middle and a corner turned down;
// 5. a sheet hanging from one roll, a wax seal on ribbons at its foot;
// 6. a narrow, tall scroll on two rods, top and foot;
// 7. a celestial chart: the two rods, a ring chart on the sheet with its ecliptic, the stars inside it.
//
// `spread` (1 at rest) is how far open it stands: the save's answer opens it a little and lets it roll back
// (`library-panel.ts`), a hover a touch. Pure arithmetic and path strings in the key's viewBox (-14..14).

/** `key` at the 62 px key; `mini` at the small window's 28 px key: fewer stars, a little heavier, no curls. */
export type ScrollDetail = 'key' | 'mini';

/** One stroke group: a path, its weight in viewBox units, its opacity, whether it is filled, and its own colour (else the key's). */
export interface ScrollLayer { id: string; d: string; w: number; o: number; fill?: true; ink?: string }
export interface ScrollDrawing { layers: ScrollLayer[]; turn: number }

const f = (v: number) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2));
const P = (x: number, y: number) => `${f(x)} ${f(y)}`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${P(cx - rx, cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0`;
const dot = (x: number, y: number, r: number) => ellipse(x, y, r, r);
const line = (pts: Array<[number, number]>) => 'M' + pts.map(([x, y]) => P(x, y)).join('L');

type Star = [number, number, number];
interface Form {
  name: string;
  turn: number;
  /** the paper's marks (sheet, edges, folds) and the rolls' (cylinders, rods, curls), and the knobs and seals filled */
  draw: (mini: boolean, spread: number) => { paper: string; rolls: string; rods: string; fine: string; fills: string; flap?: string };
  stars: (mini: boolean, spread: number) => { stars: Star[]; joins: Array<[number, number]> };
}

/** An upright roll: its sides, its top end whole (and the paper's curl in it), its foot's front half, its rod and knobs. */
function uprightRoll(cx: number, top: number, foot: number, r: number, rod: number, mini: boolean) {
  const ey = r * 0.42;
  const rolls = `M${P(cx - r, top)}L${P(cx - r, foot)}M${P(cx + r, top)}L${P(cx + r, foot)}` + ellipse(cx, top, r, ey)
    + `M${P(cx - r, foot)}A${f(r)} ${f(ey)} 0 0 0 ${P(cx + r, foot)}`;
  const fine = mini ? '' : `M${P(cx + r * 0.62, top)}A${f(r * 0.62)} ${f(ey * 0.62)} 0 1 0 ${P(cx - r * 0.3, top + ey * 0.55)}`;
  const rods = `M${P(cx, top - rod)}L${P(cx, top - ey)}M${P(cx, foot + ey)}L${P(cx, foot + rod)}`;
  const k = mini ? 0.9 : 0.7;
  const fills = dot(cx, top - rod - k * 0.6, k) + dot(cx, foot + rod + k * 0.6, k);
  return { rolls, fine, rods, fills };
}
/** A lying roll: its long sides, its two ends seen as narrow ellipses, its rod and knobs past them. */
function lyingRoll(x0: number, x1: number, cy: number, r: number, rod: number, mini: boolean) {
  const ex = r * 0.42;
  const rolls = `M${P(x0, cy - r)}L${P(x1, cy - r)}M${P(x0, cy + r)}L${P(x1, cy + r)}` + ellipse(x1, cy, ex, r)
    + `M${P(x0, cy - r)}A${f(ex)} ${f(r)} 0 0 0 ${P(x0, cy + r)}`;
  const fine = mini ? '' : `M${P(x1, cy - r * 0.62)}A${f(ex * 0.62)} ${f(r * 0.62)} 0 1 1 ${P(x1 + ex * 0.5, cy + r * 0.3)}`;
  const rods = `M${P(x0 - rod, cy)}L${P(x0 - ex, cy)}M${P(x1 + ex, cy)}L${P(x1 + rod, cy)}`;
  const k = mini ? 0.9 : 0.7;
  const fills = dot(x0 - rod - k * 0.6, cy, k) + dot(x1 + rod + k * 0.6, cy, k);
  return { rolls, fine, rods, fills };
}

const STAR_KEY: Star[] = [[-0.66, -0.45, 0.95], [-0.22, -0.06, 1.25], [0.34, -0.43, 0.9], [0.66, 0.08, 0.95], [0.12, 0.5, 0.9]];
const STAR_MINI: Star[] = [[-0.62, -0.38, 1.0], [-0.08, -0.04, 1.25], [0.55, -0.36, 0.9], [0.36, 0.44, 0.9]];
const JOIN_KEY: Array<[number, number]> = [[0, 1], [1, 3], [3, 2], [1, 4]];
const JOIN_MINI: Array<[number, number]> = [[0, 1], [1, 2], [1, 3]];
/** The standard map laid into a box: x across its width, y across its height (both -1..1). */
const mapIn = (mini: boolean, cx: number, cy: number, hw: number, hh: number) => ({
  stars: (mini ? STAR_MINI : STAR_KEY).map(([x, y, r]) => [cx + x * hw, cy + y * hh, r] as Star),
  joins: mini ? JOIN_MINI : JOIN_KEY,
});

const ROLL = 1.9, PAPER = 8.2, ROD = 10.6, LEFT = -10.6, RIGHT = 9.6;
const twoRods = (spread: number) => {
  const right = LEFT + (RIGHT - LEFT) * spread;
  return { right, x0: LEFT + ROLL, x1: right - ROLL };
};

export const SCROLLS: readonly Form[] = [
  {
    name: 'Two rods, open between them',
    turn: -9,
    draw: (mini, spread) => {
      const { right, x0, x1 } = twoRods(spread), mid = (x0 + x1) / 2;
      const a = uprightRoll(LEFT, -PAPER, PAPER, ROLL, ROD - PAPER, mini), b = uprightRoll(right, -PAPER, PAPER, ROLL, ROD - PAPER, mini);
      return {
        paper: `M${P(x0, -PAPER)}Q${P(mid, -PAPER + 0.55)} ${P(x1, -PAPER)}M${P(x0, PAPER)}Q${P(mid, PAPER + 0.55)} ${P(x1, PAPER)}`,
        rolls: a.rolls + b.rolls, rods: a.rods + b.rods, fine: a.fine + b.fine, fills: a.fills + b.fills,
      };
    },
    stars: (mini, spread) => { const { x0, x1 } = twoRods(spread); return mapIn(mini, (x0 + x1) / 2, 0, (x1 - x0) / 2, 8.6); },
  },
  {
    name: 'One roll, the far end curling',
    turn: -8,
    draw: (mini, spread) => {
      const a = uprightRoll(LEFT, -PAPER, PAPER, ROLL, ROD - PAPER, mini);
      const x0 = LEFT + ROLL, x1 = 9.4 + (spread - 1) * 6;
      // the loose end: the top and foot waving a little into a loose curl, no rod in it: its two sides, its top end
      // an open spiral, its foot the front half of an ellipse
      const r = 1.25, cx = x1 + r * 0.6, top = -PAPER + 0.3, foot = PAPER + 0.1;
      const paper = `M${P(x0, -PAPER)}C${P(x0 + 5, -PAPER + 0.7)} ${P(x1 - 5, -PAPER - 0.6)} ${P(cx - r, top)}`
        + `M${P(x0, PAPER)}C${P(x0 + 5, PAPER + 0.6)} ${P(x1 - 6, PAPER + 0.2)} ${P(cx - r, foot)}`;
      const curl = `M${P(cx - r, top)}C${P(cx - r + 0.3, -2)} ${P(cx - r - 0.2, 3)} ${P(cx - r, foot)}`
        + `M${P(cx + r, top + 0.3)}C${P(cx + r + 0.4, -2)} ${P(cx + r - 0.1, 3)} ${P(cx + r, foot)}`
        + `M${P(cx - r, top)}A${f(r)} ${f(r * 0.45)} 0 1 1 ${P(cx + r, top + 0.3)}`
        + `M${P(cx - r, foot)}A${f(r)} ${f(r * 0.45)} 0 0 0 ${P(cx + r, foot)}`;
      const spiral = mini ? '' : `M${P(cx + r * 0.55, top + 0.1)}A${f(r * 0.55)} ${f(r * 0.25)} 0 1 0 ${P(cx - r * 0.2, top + 0.3)}`;
      return { paper: paper + curl, rolls: a.rolls, rods: a.rods, fine: a.fine + spiral, fills: a.fills };
    },
    stars: (mini, spread) => { const x0 = LEFT + ROLL, x1 = 9.4 + (spread - 1) * 6; return mapIn(mini, (x0 + x1) / 2 - 0.6, -0.4, (x1 - x0) / 2 - 0.6, 8.2); },
  },
  {
    name: 'Half unrolled, at an angle',
    turn: -4,
    draw: (mini, spread) => {
      // a sheet lying back from the eye: the near edge wide, the far edge narrow under the roll
      const near = 11.2 + (spread - 1) * 4, far = 7.6, yn = 8.4, yf = -5.2;
      const a = lyingRoll(-far - 0.6, far + 0.6, yf - 1.5, 1.5, 1.8, mini);
      const paper = `M${P(-far, yf)}L${P(-near, yn)}Q${P(0, yn + 0.9)} ${P(near, yn)}L${P(far, yf)}`;
      return { paper, rolls: a.rolls, rods: a.rods, fine: a.fine, fills: a.fills };
    },
    stars: (mini) => {
      // the map foreshortened: drawn into the trapezoid, smaller toward the far edge
      const m = mapIn(mini, 0, 0, 1, 1);
      return {
        stars: m.stars.map(([x, y, r]) => { const t = (y + 1) / 2, w = 6.4 + 3.6 * t; return [x * w * 0.9, -3.4 + t * 10.2, r * (0.8 + 0.25 * t)] as Star; }),
        joins: m.joins,
      };
    },
  },
  {
    name: 'Folded map, crease and a turned corner',
    turn: -6,
    draw: (mini, spread) => {
      const w = 10.8 + (spread - 1) * 4;
      // two panels meeting at the crease, the right one a little lower, as a fold lies
      const paper = `M${P(0, -8.4)}L${P(-w, -7.4)}L${P(-w, 7.8)}L${P(0, 8.4)}`
        + `M${P(0, -8.4)}L${P(w - 2.6, -7.0)}M${P(w, -4.6)}L${P(w, 8.9)}L${P(0, 8.4)}`;
      // the turned corner: folded down over the sheet
      const corner = `M${P(w - 2.6, -7.0)}L${P(w, -4.6)}M${P(w - 2.6, -7.0)}L${P(w - 2.2, -4.0)}L${P(w, -4.6)}`;
      // its back side, lighter than the sheet (round 7): the open panel's flap at the key's size
      const flap = `M${P(w - 2.6, -7.0)}L${P(w - 2.2, -4.0)}L${P(w, -4.6)}Z`;
      return { paper: paper + corner, rolls: '', rods: '', fine: `M${P(0, -8.4)}L${P(0, 8.4)}`, fills: '', flap };
    },
    stars: (mini, spread) => mapIn(mini, -0.3, 0.4, 7.6 + (spread - 1) * 3, 8.4),
  },
  {
    name: 'Hanging from one roll, sealed',
    turn: -6,
    draw: (mini, spread) => {
      const hw = 9 + (spread - 1) * 4, top = -8.2, foot = 7.4;
      const a = lyingRoll(-hw - 0.6, hw + 0.6, top - 1.4, 1.4, 1.6, mini);
      const paper = `M${P(-hw, top)}L${P(-hw, foot)}Q${P(-hw / 2, foot + 0.8)} ${P(0, foot)}T${P(hw, foot)}L${P(hw, top)}`;
      // the seal on two ribbon tails at the foot's right corner
      const sx = hw - 3.2, sy = foot + 0.6;
      const ribbon = `M${P(sx - 0.6, sy + 1)}L${P(sx - 1.6, sy + 4.4)}L${P(sx - 0.8, sy + 3.8)}M${P(sx + 0.6, sy + 1)}L${P(sx + 1.4, sy + 4.4)}L${P(sx + 0.4, sy + 3.9)}`;
      const seal = ellipse(sx, sy, 2, 2) + (mini ? '' : ellipse(sx, sy, 1.2, 1.2));
      return { paper: paper + ribbon + seal, rolls: a.rolls, rods: a.rods, fine: a.fine, fills: a.fills };
    },
    stars: (mini, spread) => mapIn(mini, -0.4, -1.4, 7.4 + (spread - 1) * 3, 7.2),
  },
  {
    name: 'Narrow and tall',
    turn: -7,
    draw: (mini, spread) => {
      const hh = 8.8 + (spread - 1) * 3, hw = 4.9;
      const a = lyingRoll(-hw - 0.5, hw + 0.5, -hh - 1.3, 1.3, 1.6, mini), b = lyingRoll(-hw - 0.5, hw + 0.5, hh + 1.3, 1.3, 1.6, mini);
      const paper = `M${P(-hw, -hh)}Q${P(-hw + 0.5, 0)} ${P(-hw, hh)}M${P(hw, -hh)}Q${P(hw + 0.5, 0)} ${P(hw, hh)}`;
      return { paper, rolls: a.rolls + b.rolls, rods: a.rods + b.rods, fine: a.fine + b.fine, fills: a.fills + b.fills };
    },
    stars: (mini, spread) => {
      // the map turned on end to fill the narrow sheet
      const m = mapIn(mini, 0, 0, 1, 1), hh = 8.8 + (spread - 1) * 3;
      return { stars: m.stars.map(([x, y, r]) => [y * 3.6, x * (hh - 2), r] as Star), joins: m.joins };
    },
  },
  {
    name: 'Celestial chart on two rods',
    turn: -9,
    draw: (mini, spread) => {
      const { right, x0, x1 } = twoRods(spread), mid = (x0 + x1) / 2;
      const a = uprightRoll(LEFT, -PAPER, PAPER, ROLL, ROD - PAPER, mini), b = uprightRoll(right, -PAPER, PAPER, ROLL, ROD - PAPER, mini);
      const r = Math.min(6.2, (x1 - x0) / 2 - 0.8);
      // the chart: its ring, and at the key's size its ecliptic, a tilted ellipse, and the meridian
      const chart = ellipse(mid, 0, r, r) + (mini ? '' : `M${P(mid - r, 0.9)}C${P(mid - r * 0.4, -3.4)} ${P(mid + r * 0.4, -3.4)} ${P(mid + r, -0.9)}` + `M${P(mid, -r)}L${P(mid, r)}`);
      return {
        paper: `M${P(x0, -PAPER)}Q${P(mid, -PAPER + 0.55)} ${P(x1, -PAPER)}M${P(x0, PAPER)}Q${P(mid, PAPER + 0.55)} ${P(x1, PAPER)}`,
        rolls: a.rolls + b.rolls, rods: a.rods + b.rods, fine: a.fine + b.fine + chart, fills: a.fills + b.fills,
      };
    },
    stars: (mini, spread) => { const { x0, x1 } = twoRods(spread); return mapIn(mini, (x0 + x1) / 2, 0.2, Math.min(6.2, (x1 - x0) / 2 - 0.8) * 0.78, 6.4); },
  },
];
/** The pick when the address names none (1-based): the folded map (his pick, round 5). */
export const SCROLL_PICK = 4;

/** The flap's ground on the key: the open sheet's gradient (17 % at the crease, 10 % at the tip) at its mean. */
const FLAP_LIGHT = 0.14;

/** **The glyph's layers** for form `n` (1-based) at a spread: the paper, the map on it, then the rolls over its ends. */
export function scrollDrawing(n: number, detail: ScrollDetail, spread = 1, inks: readonly string[] = []): ScrollDrawing {
  const form = SCROLLS[(n - 1 + SCROLLS.length) % SCROLLS.length] ?? SCROLLS[0];
  const mini = detail === 'mini';
  const d = form.draw(mini, spread);
  const { stars, joins } = form.stars(mini, spread);
  let lines = '';
  for (const [a, b] of joins) {
    // each line stops short of its stars, as an engraver leaves them clear
    const [ax, ay] = stars[a], [bx, by] = stars[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ga = stars[a][2] + 0.5, gb = stars[b][2] + 0.5;
    lines += line([[ax + (bx - ax) * ga / len, ay + (by - ay) * ga / len], [bx - (bx - ax) * gb / len, by - (by - ay) * gb / len]]);
  }
  const order = stars.map((_, i) => i).sort((a, b) => stars[b][2] - stars[a][2]);
  const starLayers: ScrollLayer[] = stars.map((s, i) => {
    const k = order.indexOf(i);
    return { id: `star${i}`, d: dot(s[0], s[1], s[2] * 0.8), w: 0, o: 1, fill: true, ...(inks[k] ? { ink: inks[k] } : {}) };
  });
  // about four fifths of the first prototype's weight (his word 10-22, "thinner stroke for paper rolls"); the map's
  // lines finer than the paper, so the map reads as drawn on it
  // **the turned corner's back** (round 7, his word 10-22: "paper fold should be lighter for more realistic feel"): the
  // key's colour at the open flap's mean light over the black, so the key, the zoom and the panel match
  const W = mini ? { roll: 1.2, paper: 1.0, rod: 1.05, line: 0.75, fine: 0.5 } : { roll: 1.05, paper: 0.88, rod: 0.95, line: 0.6, fine: 0.45 };
  return {
    turn: form.turn,
    layers: [
      { id: 'flap', d: d.flap ?? '', w: 0, o: FLAP_LIGHT, fill: true },
      { id: 'paper', d: d.paper, w: W.paper, o: 0.95 },
      { id: 'lines', d: lines, w: W.line, o: 0.85 },
      ...starLayers,
      { id: 'rods', d: d.rods, w: W.rod, o: 1 },
      { id: 'rolls', d: d.rolls, w: W.roll, o: 1 },
      { id: 'fine', d: d.fine, w: W.fine, o: 0.75 },
      { id: 'fills', d: d.fills, w: 0, o: 1, fill: true },
    ],
  };
}

/** The drawing as an SVG fragment (the gallery's), in the key's colour unless a star has its own. */
export function scrollSvgInner(n: number, detail: ScrollDetail, inks: readonly string[] = []): string {
  const { layers, turn } = scrollDrawing(n, detail, 1, inks);
  return `<g transform="rotate(${turn})">` + layers.filter((l) => l.d).map((l) => l.fill
    ? `<path d="${l.d}" fill="${l.ink ?? 'currentColor'}" stroke="none" opacity="${l.o}"/>`
    : `<path d="${l.d}" fill="none" stroke="currentColor" stroke-width="${l.w}" stroke-linecap="round" stroke-linejoin="round" opacity="${l.o}"/>`).join('') + '</g>';
}
