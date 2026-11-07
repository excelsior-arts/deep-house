// **Love's heart: its point** (round ring-details, his eye 11-03: at a small size H1b's point *"looks like it merge
// into one pixel hair line and stretches down under heart"*), in node, pure, on the drawing the ring and the gallery
// share (`src/heart-glyph.ts`):
// - H1b-c is the heart the ring draws (his pick 11-03, "1b-c looks good, approved"), and H1b still draws as it did by
//   its own address (`?heart=1b`; both points measured and said);
// - each point drawn for his review (`?heart=1b-a`, `1b-b`, `1b-c`) is a crisp V: at least `POINT_MIN` degrees where
//   its sides leave it, and its two sides closer than the line drawn along them for no more than 1.2 of that line's
//   width at any size the ring draws a key at, while the arrow still passes through the heart's centre and every
//   mark stays inside the key.
//
//   node --test tools/check-heart.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { HEARTS, HEART_PICK, heartLabel, heartNamed, heartParts, heartSvg, type Pt } from '../src/heart-glyph.ts';

/** the least angle at the point of a variant drawn for the point (degrees) */
const POINT_MIN = 60;
/** the ring's `.thin`, in its units, and the key's radius at the sizes the ring draws one: the mini window's, the phone's and the machine view's corner, the desktop's */
const THIN = 1.6;
const KEY_R = [59.15, 45.5, 35];

/** The heart's outline at a radius of one, from its point outward along each side. */
function sides(n: number): { apex: Pt; right: Pt[]; left: Pt[] } {
  const q = heartParts(n, 1000, 75);
  const P = [...q.fill.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => [+m[1] / 1000, +m[2] / 1000] as Pt);
  P.pop();
  // the point: the mark farthest from the cleft, where the outline begins
  let ai = 0, far = -1;
  for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > far) { far = d; ai = i; } }
  return { apex: P[ai], right: P.slice(0, ai + 1).reverse(), left: P.slice(ai) };
}
const along = (line: Pt[], L: number): Pt => {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= L) { const k = (L - acc) / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
    acc += l;
  }
  return line[line.length - 1];
};
const toSegment = (p: Pt, a: Pt, b: Pt) => {
  const v = [b[0] - a[0], b[1] - a[1]], w = [p[0] - a[0], p[1] - a[1]];
  const t = Math.max(0, Math.min(1, (v[0] * w[0] + v[1] * w[1]) / (v[0] ** 2 + v[1] ** 2 || 1)));
  return Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]);
};
const toLine = (p: Pt, line: Pt[]) => { let m = Infinity; for (let i = 1; i < line.length; i++) m = Math.min(m, toSegment(p, line[i - 1], line[i])); return m; };
/** The point's angle: the two sides' chords from it, 0.03 of the radius along each. */
function pointAngle(n: number): number {
  const s = sides(n), a = along(s.right, 0.03), b = along(s.left, 0.03), o = s.apex;
  const va = [a[0] - o[0], a[1] - o[1]], vb = [b[0] - o[0], b[1] - o[1]];
  return (Math.acos((va[0] * vb[0] + va[1] * vb[1]) / Math.hypot(va[0], va[1]) / Math.hypot(vb[0], vb[1])) * 180) / Math.PI;
}
/** How far from the point the two sides stand closer than the line's width, in widths, on a key of radius `R`. */
function closeRun(n: number, R: number): number {
  const s = sides(n), w = THIN / R, near = s.left.slice(0, 60);
  let last = 0;
  for (let L = 0; L < 0.4; L += 0.0005) if (toLine(along(s.right, L), near) < w) last = L;
  return last / w;
}
const POINTED = HEARTS.map((h, i) => (h.point ? i + 1 : 0)).filter(Boolean);

// H1b, as `?heart=1b` still draws it, and the heart the ring shows: H1b-c (his pick 11-03, "1b-c looks good, approved")
const H1B = 8;
test('H1b-c is the pick, and H1b draws as it did by its own address', () => {
  assert.equal(heartLabel(HEART_PICK - 1), '1b-c');
  assert.equal(heartNamed(null), HEART_PICK);
  assert.equal(heartLabel(H1B - 1), '1b');
  const svg = heartSvg(H1B, 35, 35 * 1.12 * 0.075, { line: 'class="ln"', id: 'k', ring: true });
  assert.equal(crypto.createHash('sha256').update(svg).digest('hex').slice(0, 16), '7027083d3d6cdbff', 'H1b\'s drawing moved');
  for (const n of [H1B, HEART_PICK]) {
    const runs = KEY_R.map((R) => closeRun(n, R));
    console.log(`H${heartLabel(n - 1)}'s point: ${pointAngle(n).toFixed(1)}°, its sides closer than the line for ${Math.min(...runs).toFixed(2)}–${Math.max(...runs).toFixed(2)} of its width`);
  }
});

test('each point drawn for review is a crisp V at every size, by the address alone, the arrow through the centre', () => {
  assert.deepEqual(POINTED.map((n) => heartLabel(n - 1)), ['1b-a', '1b-b', '1b-c']);
  const pick = HEARTS[H1B - 1];
  for (const n of POINTED) {
    const h = HEARTS[n - 1], label = heartLabel(n - 1);
    assert.equal(heartNamed(label), n, `?heart=${label} names it`);
    // H1b's hand: everything but the point is H1b's
    const { point: _p, name: _n, label: _l, ...rest } = h;
    const { name: _n2, label: _l2, ...hers } = pick;
    assert.deepEqual(rest, hers, `H1b-${label} differs from H1b beyond its point`);
    const angle = pointAngle(n);
    assert.ok(angle >= POINT_MIN, `H${label}'s point is ${angle.toFixed(1)}°, under ${POINT_MIN}°`);
    for (const R of KEY_R) {
      const run = closeRun(n, R);
      assert.ok(run <= 1.2, `on a key of ${R} units H${label}'s sides stand closer than the line for ${run.toFixed(2)} of its width`);
    }
    // the arrow through the heart's centre: its axis 45 % of the way from the cleft to the drawn point
    const p = heartParts(n, 1000, 84), s = sides(n);
    const cleft = s.right[s.right.length - 1];
    const mid: Pt = [cleft[0] + (s.apex[0] - cleft[0]) * 0.45, cleft[1] + (s.apex[1] - cleft[1]) * 0.45];
    const sh = p.shaft.match(/-?\d+\.\d+/g)!.map((v) => +v / 1000);
    const off = toSegment(mid, [sh[0], sh[1]], [sh[2], sh[3]]);
    assert.ok(off < 0.02, `H${label}'s arrow passes ${off.toFixed(3)} of the radius off the heart's centre`);
    // and every mark inside the key
    const far = Math.max(...[p.outline, p.shaft, p.head, p.fletch].flatMap((d) => [...d.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => Math.hypot(+m[1], +m[2]) / 1000)));
    assert.ok(far <= 0.8, `H${label}'s farthest mark is ${far.toFixed(3)} of the radius out`);
    console.log(`H${label}: the point ${angle.toFixed(1)}°, its sides closer than the line for at most ${Math.max(...KEY_R.map((R) => closeRun(n, R))).toFixed(2)} of its width, the arrow ${off.toFixed(3)} off the centre, the farthest mark ${far.toFixed(2)} out`);
  }
});
