// **Love's heart, pierced** (star-keys round 3, his review 10-22: "arrow should go from top right down to bottom left
// corner through heart. less symmetry on heart"). Eight variants for his review, one drawing each: an engraved heart
// (never an emoji's), and the arrow that passes through it while what plays is in a playlist.
//
// Every variant is the same construction with its own numbers:
// - **the heart**: the classical heart curve, warped by hand: each side its own width and crown, the point pushed
//   off the middle, a slow wobble so no two runs of the line match, the whole tilted; its point and notch are the
//   curve's own, the stroke's round join softening them. One variant runs the two sides past the point so the line
//   crosses itself; one hatches a side; one carries an engraver's second line inside a lobe;
// - **the arrow**: a straight shaft through the heart's middle, flying down to the lower left (the head there, the
//   fletching at the upper right; variant 8 reads "from ... to" the other way), a chevron or a barbed head, two or
//   three vanes or two feathered ones; the shaft drawn through, hidden inside the heart, or **over and under** (in
//   front where it enters, the heart's line broken there; behind where it leaves, the shaft broken there).
//
// All in a node of radius R about its centre, in R's units, so it stays inside the key at every size (the farthest
// mark about 0.8 R out). Pure arithmetic and SVG strings: the ring parses the string into its key (`heartSvg`), and
// the gallery draws the same strings on a page.

export type Pt = [number, number];

interface HeartSpec {
  name: string;
  /** the gallery's and the address's label where it is not the variant's place (`1b`) */
  label?: string;
  /** the arrow passes through the heart's visual centre, on its axis 45 % down from the cleft (his word 10-22, "through roughly center of it") */
  centred?: true;
  /** each side's width and crown height, as factors of the classical curve's (left, right) */
  width: [number, number]; crown: [number, number];
  /** how far the point is pushed sideways (R), the whole's height factor, the tilt (degrees, clockwise) */
  tipShift: number; tall: number; tilt: number;
  /** a slow wobble in the line: its size (of the radius) and phase */
  wobble: number; phase: number;
  /** the two sides run past the point by these lengths (R; the left side's, the right side's), the line crossing itself */
  cross?: [number, number];
  hatch?: 'right' | 'left';
  /** a second line inside the left lobe and side, an engraver's shading */
  inner?: true;
  arrow: {
    /** degrees below the horizontal the arrow flies at */
    angle: number;
    head: 'chevron' | 'barbed';
    vanes: 2 | 3 | 'feather';
    shaft: 'through' | 'hidden' | 'over' | 'open';
    /** fly up to the upper right instead (the other reading of "from top right down to bottom left") */
    up?: true;
    /** the shaft's ends, along it from the heart's middle (R): the tail's and the head's */
    tailLen: number; headLen: number;
  };
}

/** **The variants**, the recommended pick first. */
export const HEARTS: readonly HeartSpec[] = [
  {
    name: 'Tilted, over and under',
    width: [1.06, 0.93], crown: [1.06, 0.9], tipShift: 0.03, tall: 1, tilt: -9, wobble: 0.018, phase: 0.7,
    arrow: { angle: 32, head: 'chevron', vanes: 2, shaft: 'over', tailLen: 0.64, headLen: 0.7 },
  },
  {
    name: 'Hand-cut, hidden shaft, barbed',
    width: [0.95, 1.07], crown: [0.92, 1.06], tipShift: -0.04, tall: 1, tilt: 5, wobble: 0.03, phase: 2.1,
    arrow: { angle: 30, head: 'barbed', vanes: 3, shaft: 'hidden', tailLen: 0.6, headLen: 0.7 },
  },
  {
    name: 'One line, crossing at the point',
    width: [1.03, 0.95], crown: [1.0, 0.93], tipShift: 0.02, tall: 0.96, tilt: -6, wobble: 0.015, phase: 4, cross: [0.1, 0.07],
    arrow: { angle: 30, head: 'chevron', vanes: 2, shaft: 'through', tailLen: 0.64, headLen: 0.7 },
  },
  {
    name: 'Hatched on the right',
    width: [1, 0.98], crown: [1, 1.03], tipShift: 0.03, tall: 1, tilt: 7, wobble: 0.015, phase: 1.3, hatch: 'right',
    arrow: { angle: 34, head: 'barbed', vanes: 2, shaft: 'hidden', tailLen: 0.62, headLen: 0.7 },
  },
  {
    name: 'Antique tattoo, inner line, feathered',
    width: [1.1, 0.94], crown: [1.06, 0.95], tipShift: 0.02, tall: 1.02, tilt: -4, wobble: 0.012, phase: 3, inner: true,
    arrow: { angle: 30, head: 'chevron', vanes: 'feather', shaft: 'over', tailLen: 0.62, headLen: 0.7 },
  },
  {
    name: 'Open where it enters and leaves',
    width: [0.97, 1.03], crown: [0.95, 1.04], tipShift: 0.05, tall: 1, tilt: -3, wobble: 0.025, phase: 5.2,
    arrow: { angle: 30, head: 'chevron', vanes: 3, shaft: 'open', tailLen: 0.64, headLen: 0.7 },
  },
  {
    name: 'Lean heart, steep arrow',
    width: [0.86, 0.8], crown: [1.04, 0.95], tipShift: 0.04, tall: 1.1, tilt: -12, wobble: 0.015, phase: 0.2,
    arrow: { angle: 44, head: 'barbed', vanes: 3, shaft: 'through', tailLen: 0.6, headLen: 0.68 },
  },
  {
    // round 4 (his pick 10-22: "the first heart was fine, maybe too asymmetrical now, the arrow should hit through
    // roughly center of it"): H1 taken halfway back toward a regular heart, the arrow through its centre (round 6: the visual centre on the axis)
    name: 'Tilted, over and under, evened, the arrow through its centre', label: '1b', centred: true,
    width: [1.03, 0.965], crown: [1.03, 0.95], tipShift: 0.015, tall: 1, tilt: -6, wobble: 0.012, phase: 0.7,
    arrow: { angle: 32, head: 'chevron', vanes: 2, shaft: 'over', tailLen: 0.64, headLen: 0.68 },
  },
  {
    name: 'The other reading: head at the upper right',
    width: [1.06, 0.93], crown: [1.06, 0.9], tipShift: 0.03, tall: 1, tilt: -9, wobble: 0.018, phase: 0.7,
    arrow: { angle: 32, head: 'chevron', vanes: 2, shaft: 'over', up: true, tailLen: 0.64, headLen: 0.7 },
  },
];
/** The pick when the address names none (1-based): H1b, the eighth entry (round 4). */
export const HEART_PICK = 8;
/** A variant's label, as the gallery shows it and the address may name it (`?heart=1b`). */
export const heartLabel = (i: number): string => HEARTS[i]?.label ?? String(i + 1 - HEARTS.slice(0, i).filter((h) => h.label).length);
/** The variant the address names (`?heart=3`, `?heart=1b`), 1-based, or the pick. */
export function heartNamed(v: string | null): number {
  if (!v) return HEART_PICK;
  const i = HEARTS.findIndex((_, k) => heartLabel(k) === v.trim().toLowerCase());
  return i >= 0 ? i + 1 : HEART_PICK;
}

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const turn = (deg: number) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (p: Pt): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/**
 * **The warped heart at `t`** (0 the notch, π the point, round clockwise through the right lobe first), in R's units,
 * untilted: the classical curve x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t, scaled to a half width
 * of 0.4 and a height of 0.7, each side and crown its own, the point pushed aside, the line wobbling slowly.
 */
function heartAt(h: HeartSpec, t: number): Pt {
  const X = 16 * Math.sin(t) ** 3;
  const Y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  let x = X * 0.025, y = (Y - 2.5) * 0.0242 * h.tall;
  // each side's width and, above the middle, its crown, blended across the notch so the line stays whole
  const s = smooth((x + 0.08) / 0.16);
  x *= h.width[0] + (h.width[1] - h.width[0]) * s;
  if (y < 0) y *= h.crown[0] + (h.crown[1] - h.crown[0]) * s;
  // the point pushed aside, more the lower the line
  x += h.tipShift * smooth((y + 0.1) / 0.45);
  // the hand: a slow wobble along the line, out from the middle
  const k = 1 + h.wobble * Math.sin(3 * t + h.phase);
  return [x * k, y * k];
}

export interface HeartParts {
  /** the outline (and the inner line and hatch), always drawn */
  outline: string;
  inner: string;
  hatch: string;
  /** the closed heart, for the knock-outs and the hatch's clip */
  fill: string;
  /** the arrow, tail to head */
  shaft: string;
  head: string;
  headClosed: boolean;
  fletch: string;
  /** the shaft hidden inside the heart */
  hidden: boolean;
  /** where the shaft breaks (it passes behind the heart's line), and where the heart's line breaks while pierced */
  shaftGaps: Pt[];
  heartGaps: Pt[];
  gapR: number;
}

/** **The parts of variant `n`** (1-based), for a node of radius `R`, corner radius `rr` (the die's). */
export function heartParts(n: number, R: number, rr: number): HeartParts {
  const h = HEARTS[(n - 1 + HEARTS.length) % HEARTS.length] ?? HEARTS[0];
  const T = turn(h.tilt);
  const S = (p: Pt): Pt => mul(T(p), R);
  const f = (p: Pt) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const N = 96;
  // round from the notch, the right lobe first, down to the point, up the left lobe and home
  const ring: Pt[] = Array.from({ length: N + 1 }, (_, i) => heartAt(h, (2 * Math.PI * i) / N));
  const poly = (pts: Pt[]) => 'M' + pts.map((p) => f(S(p))).join('L');
  const fill = poly(ring) + 'Z';
  let outline = fill;
  if (h.cross) {
    // one line: from past the point on the left side's run, up the left lobe, over, down the right and out past it
    const tip = heartAt(h, Math.PI);
    const leftRun = unit(sub(tip, heartAt(h, Math.PI + 0.08))), rightRun = unit(sub(tip, heartAt(h, Math.PI - 0.08)));
    const half = N / 2;
    const fromTip = [...ring.slice(half), ...ring.slice(1, half + 1)];   // the point, the left lobe, the notch, the right lobe, the point
    outline = poly([add(tip, mul(rightRun, h.cross[1])), ...fromTip, add(tip, mul(leftRun, h.cross[0]))]);
  }
  // an engraver's second line inside the left lobe and side: from below the notch over the crown and down toward the point
  let inner = '';
  if (h.inner) {
    const c: Pt = [-0.08, 0.02];
    const pts = ring.slice(Math.round(N * 0.56), Math.round(N * 0.94)).map((p) => add(mul(sub(p, c), 0.76), c));
    inner = poly(pts);
  }
  // hatch: short parallel strokes across one side, clipped to the heart by the drawer
  let hatch = '';
  if (h.hatch) {
    const sg = h.hatch === 'right' ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const x = sg * (0.1 + i * 0.075);
      hatch += `M${f(S([x - 0.12, -0.42]))} L${f(S([x + 0.16, 0.42]))} `;
    }
  }
  const pts = ring;
  // the heart's middle, where the arrow passes. Where asked, its visual centre (round 6, his word 10-22: "heart arrow
  // doesn't go through center still?"): the point on its axis 45 % of the way down from the cleft to the tip. The
  // outline's centroid (round 4) sits higher, up among the lobes' weight, and the arrow read as passing above the middle
  let mid = T([h.tipShift * 0.4, -0.02]);
  if (h.centred) {
    const cleft = heartAt(h, 0), tip = heartAt(h, Math.PI);
    mid = T(add(cleft, mul(sub(tip, cleft), 0.45)));
  }
  // the arrow: through the heart's middle, flying down to the lower left (or up to the upper right)
  const a = (h.arrow.angle * Math.PI) / 180;
  let d: Pt = [-Math.cos(a), Math.sin(a)];        // toward the head
  if (h.arrow.up) d = mul(d, -1);
  const q: Pt = [-d[1], d[0]];                     // across
  const at = (s: number, o = 0): Pt => mul(add(add(mid, mul(d, s)), mul(q, o)), R);
  const tailS = -h.arrow.tailLen, headS = h.arrow.headLen;
  const shaft = `M${f(at(tailS))} L${f(at(headS))}`;
  let head = '', headClosed = false;
  const hb = headS - 0.15;
  if (h.arrow.head === 'chevron') {
    head = roundedCorner(at(hb, 0.1), at(headS), at(hb, -0.1), rr, f);
  } else {
    headClosed = true;
    head = roundedPoly([at(headS), at(hb - 0.03, 0.1), at(hb + 0.03, 0), at(hb - 0.03, -0.1)], rr * 0.7, f);
  }
  let fletch = '';
  if (h.arrow.vanes === 'feather') {
    // two long vanes, their leading edges swept far back from the shaft, cut square at the tail, and the nock
    for (const o of [0.065, -0.065]) {
      const p0 = at(tailS), p1 = at(tailS - 0.02, o), p2 = at(tailS + 0.05, o), p3 = at(tailS + 0.22);
      fletch += `M${f(p0)} L${f(p1)} L${f(p2)} L${f(p3)} `;
    }
    fletch += `M${f(at(tailS - 0.05, 0.035))} L${f(at(tailS))} L${f(at(tailS - 0.05, -0.035))} `;
  } else {
    const n2 = h.arrow.vanes;
    for (let i = 0; i < n2; i++) {
      const s = tailS + i * (n2 === 3 ? 0.085 : 0.11);
      for (const o of [0.085, -0.085]) fletch += `M${f(at(s))} L${f(at(s - 0.11, o))} `;
    }
  }

  // where the shaft meets the heart's line: walk the outline and find where it crosses the shaft's line
  const mids: Pt[] = [];
  const midU: Pt = mul(mid, 1);
  const side2 = (p: Pt) => { const v = sub(T(p), midU); return v[0] * q[0] + v[1] * q[1]; };
  const along = (p: Pt) => { const v = sub(T(p), midU); return v[0] * d[0] + v[1] * d[1]; };
  for (let i = 1; i < pts.length; i++) {
    const s0 = side2(pts[i - 1]), s1 = side2(pts[i]);
    if (s0 === 0 || s0 * s1 < 0) {
      const k = s0 / (s0 - s1);
      mids.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
    }
  }
  // the crossing nearest the tail is where it enters, the one nearest the head where it leaves
  mids.sort((m1, m2) => along(m1) - along(m2));
  const enter = mids[0] ? mul(T(mids[0]), R) : null, leave = mids[mids.length - 1] ? mul(T(mids[mids.length - 1]), R) : null;
  const kind = h.arrow.shaft;
  const shaftGaps: Pt[] = kind === 'over' && leave ? [leave] : [];
  const heartGaps: Pt[] = (kind === 'over' && enter ? [enter] : []).concat(kind === 'open' ? [enter, leave].filter((p): p is Pt => !!p) : []);
  return {
    outline, inner, hatch, fill, shaft, head, headClosed, fletch,
    hidden: kind === 'hidden' || kind === 'open', shaftGaps, heartGaps, gapR: R * (kind === 'open' ? 0.06 : 0.085),
  };
}

function roundedCorner(a: Pt, b: Pt, c: Pt, r: number, f: (p: Pt) => string): string {
  const back = (p: Pt, q: Pt): Pt => { const v = sub(q, p), l = Math.hypot(v[0], v[1]) || 1, t = Math.min(r, l / 2) / l; return add(p, mul(v, t)); };
  return `M${f(a)} L${f(back(b, a))} Q${f(b)} ${f(back(b, c))} L${f(c)}`;
}
function roundedPoly(pts: Pt[], r: number, f: (p: Pt) => string): string {
  const n = pts.length;
  const back = (p: Pt, q: Pt): Pt => { const v = sub(q, p), l = Math.hypot(v[0], v[1]) || 1, t = Math.min(r, l / 2) / l; return add(p, mul(v, t)); };
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i], prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n];
    const a = back(p, prev), b = back(p, next);
    d += `${i ? 'L' : 'M'}${f(a)} Q${f(p)} ${f(b)} `;
  }
  return d + 'Z';
}

/**
 * **The drawing as SVG**, for the ring's key and the gallery alike. `line` is what every stroked mark carries (the
 * ring's class and its round ends, or a stroke and a width), `id` makes the masks' ids unique, `pierced` puts the
 * arrow and its gaps on at once (the gallery; the ring draws them always and shows them by its `loved` class).
 */
export function heartSvg(n: number, R: number, rr: number, o: { line: string; id: string; pierced?: boolean; ring?: boolean }): string {
  const p = heartParts(n, R, rr);
  const span = (R * 2).toFixed(1), x0 = (-R * 2).toFixed(1), w4 = (R * 4).toFixed(1);
  const rect = `<rect x="${x0}" y="${x0}" width="${w4}" height="${w4}" fill="#ffffff"/>`;
  const gapOn = o.ring ? '' : o.pierced ? ' opacity="1"' : ' opacity="0"';
  const circle = (c: Pt, cls: string) => `<circle class="${cls}" cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="${p.gapR.toFixed(2)}" fill="#000000"${cls === 'gap' ? gapOn : ''}/>`;
  const hm = `${o.id}H`, sm = `${o.id}S`, cl = `${o.id}C`;
  let s = '';
  // the heart's line, broken where the arrow passes in front of it (shown with the arrow)
  if (p.heartGaps.length) s += `<mask id="${hm}" maskUnits="userSpaceOnUse" x="${x0}" y="${x0}" width="${w4}" height="${w4}">${rect}${p.heartGaps.map((c) => circle(c, 'gap')).join('')}</mask>`;
  if (p.hatch) s += `<clipPath id="${cl}"><path d="${p.fill}"/></clipPath>`;
  const heartMask = p.heartGaps.length ? ` mask="url(#${hm})"` : '';
  s += `<g class="heartLine"${heartMask}><path ${o.line} d="${p.outline}"/>`;
  if (p.inner) s += `<path ${o.line} d="${p.inner}" stroke-opacity="0.75"/>`;
  s += '</g>';
  if (p.hatch) s += `<path ${o.line} d="${p.hatch}" clip-path="url(#${cl})" stroke-opacity="0.6" style="stroke-width:${(R * 0.028).toFixed(2)}px"/>`;
  if (o.ring || o.pierced) {
    const knock = p.hidden ? `<path d="${p.fill}" fill="#000000" stroke="#000000" stroke-width="${(R * 0.09).toFixed(2)}"/>` : '';
    s += `<g class="arrow"><mask id="${sm}" maskUnits="userSpaceOnUse" x="${x0}" y="${x0}" width="${w4}" height="${w4}">${rect}${knock}${p.shaftGaps.map((c) => circle(c, 'sgap')).join('')}</mask>`;
    s += `<path ${o.line} class-add="shaft" pathLength="1" mask="url(#${sm})" d="${p.shaft}"/>`;
    s += `<path ${o.line} class-add="head" d="${p.head}"/>`;
    s += `<path ${o.line} class-add="fletch" d="${p.fletch}"/></g>`;
  }
  void span;
  // the parts' own classes, merged into the line's class where it has one
  return s.replace(/class="([^"]*)"([^>]*?) class-add="([^"]*)"/g, 'class="$1 $3"$2').replace(/ class-add="([^"]*)"/g, ' class="$1"');
}
