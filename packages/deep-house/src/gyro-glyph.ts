// **The gyroscope key, drawn from a small 3D model** (round gyro-volume, his word 10-21: "a more conventional volume
// look, tilt it from left to right", then "on the gold side, closer to a classic astronomical antique vibe"). A toy
// gyroscope read as a brass instrument, like an armillary sphere or an astrolabe:
//
// - **the model**: the outer gimbal standing vertical, the horizontal gimbal through its equator, the rotor (a
//   double-line rim, a hub and spokes) on the axle, and the axle's pin ends past the outer gimbal with turned finials;
// - **the view**: seen from a little above (`elev`), the whole instrument leaning upper right to lower left (`tilt`, mirrored 10-21),
//   projected orthographically into the key's viewBox (-14..14);
// - **the depth cue is the volume**: every ring is split where it passes behind the centre; back halves are drawn
//   first, thin and dim, then the rotor and the axle, then the front halves at full weight. Line work in one colour
//   (the key's, `currentColor`), no gradients, no glow, no shading. The rotor rim is the strongest line;
// - **antique cues by size** (`detail`): at a large size the outer gimbal's front half carries an engraved band and
//   limb ticks, the rim is a double line, six spokes; at the 44 px key the ticks, the band and the rim's inner line
//   go (they merged into a blur on the real-pixel sheet) and four spokes stay; the 30 px key keeps three and drops
//   the finials' collars.
//
// Pure arithmetic and path strings, no DOM, so a tool can draw the same glyph on a sheet.

/** **His pick is one constant**: the axle's lean from vertical, degrees (12, 18 or 24 on the variants sheet). */
export const GYRO_TILT = 18;
/** The view's elevation that goes with each lean: a steeper lean is seen from a little higher. */
export const gyroElevation = (tilt: number) => 11 + 0.55 * tilt;
/** How far the outer gimbal is turned about the axle, so it reads as a ring in space rather than a flat circle. */
const YAW = 34;
/** The model's scale in the viewBox: a leaning instrument is narrower than a flat circle, so it is drawn a little larger to stand as tall as the key did. */
const SCALE = 1.1;

/** `full` on a sheet; `key` at the 44 px key; `mini` at the small window's 30 px key. */
export type GyroDetail = 'full' | 'key' | 'mini';

/** `weight` scales every line (1 at the key; a sheet's large drawing thins them to read as line work at its size). */
export interface GyroPose { tilt: number; elev: number; spin: number; detail: GyroDetail; weight?: number }

/** One stroke group in draw order: a path, its weight in viewBox units, its opacity, and whether it is filled. */
export interface GyroLayer { id: string; d: string; w: number; o: number; fill?: true }

const R_GIMBAL = 10;
const R_RIM = 6.7;
const R_RIM_IN = 5.8;
const R_HUB = 1.0;
const AXLE_END = 13.1;

type V3 = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const f = (v: number) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2));

/** The camera: yaw a part about the axle, look from above, lean the whole; returns screen x, y (down) and depth (toward the eye). */
function viewer(tilt: number, elev: number) {
  const ce = Math.cos(rad(elev)), se = Math.sin(rad(elev));
  const ct = Math.cos(rad(tilt)), st = Math.sin(rad(tilt));
  return (p: V3): V3 => {
    const [x, y, z] = p;
    const y1 = y * ce - z * se, z1 = y * se + z * ce;
    const x2 = x * ct - y1 * st, y2 = x * st + y1 * ct;
    // mirrored (his word 10-21: "tilt should be from left to right"): the axle's top leans right, its foot left
    return [-x2 * SCALE, -y2 * SCALE, z1];
  };
}
const yawed = (deg: number) => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return (p: V3): V3 => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

/** A polyline's points split into runs in front of the centre and behind it, as path data. */
function split(pts: V3[], closed: boolean): { front: string; back: string } {
  const runs: { front: boolean; pts: V3[] }[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], fr = p[2] >= 0;
    const cur = runs[runs.length - 1];
    if (cur && cur.front === fr) cur.pts.push(p);
    else {
      // start the new run where the last one ended, so the halves meet
      const prev = cur ? cur.pts[cur.pts.length - 1] : null;
      const mid: V3[] = prev ? [[(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2, 0]] : [];
      if (cur && prev) cur.pts.push(mid[0]);
      runs.push({ front: fr, pts: [...mid, p] });
    }
  }
  // a closed ring: the last run joins the first when they face the same way
  if (closed && runs.length > 1 && runs[0].front === runs[runs.length - 1].front) {
    const last = runs.pop()!;
    runs[0].pts = [...last.pts, ...runs[0].pts];
  } else if (closed && runs.length === 1) runs[0].pts.push(runs[0].pts[0]);
  const d = (r: V3[]) => 'M' + r.map((p) => `${f(p[0])} ${f(p[1])}`).join('L');
  return {
    front: runs.filter((r) => r.front && r.pts.length > 1).map((r) => d(r.pts)).join(''),
    back: runs.filter((r) => !r.front && r.pts.length > 1).map((r) => d(r.pts)).join(''),
  };
}

/** A circle of radius `r` in the model's horizontal plane at height `y` (the rotor's and the horizontal gimbal's). */
const flat = (r: number, y = 0, n = 72): V3[] =>
  Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), y, r * Math.sin((2 * Math.PI * i) / n)] as V3);
/** A circle of radius `r` in the model's vertical plane (the outer gimbal's), from angle `a0` to `a1` degrees. */
const upright = (r: number, a0 = 0, a1 = 360, n = 72): V3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    return [r * Math.cos(a), r * Math.sin(a), 0] as V3;
  });

/** **The glyph's layers** for a pose, in draw order: back halves, rotor and axle, front halves, finials. */
export function gyroLayers(pose: GyroPose): GyroLayer[] {
  const { tilt, elev, spin, detail } = pose;
  const view = viewer(tilt, elev);
  const yaw = yawed(YAW), turn = yawed(spin);
  const pv = (pts: V3[], g = yaw) => pts.map((p) => view(g(p)));
  const full = detail === 'full', mini = detail === 'mini';

  const gimbalV = split(pv(upright(R_GIMBAL)), true);
  const gimbalH = split(pv(flat(R_GIMBAL)), true);
  const rim = split(pv(flat(R_RIM), turn), true);
  const rimIn = split(pv(flat(R_RIM_IN), turn), true);
  const hub = split(pv(flat(R_HUB, 0, 24), turn), true);

  // spokes from the hub to the rim's inner line, each behind or in front by its middle
  const spokes = full ? 6 : mini ? 3 : 4;
  let spokeFront = '', spokeBack = '';
  for (let i = 0; i < spokes; i++) {
    const a = (2 * Math.PI * i) / spokes;
    const c = Math.cos(a), s = Math.sin(a);
    const [p, q] = pv([[R_HUB * c, 0, R_HUB * s], [R_RIM_IN * c, 0, R_RIM_IN * s]], turn);
    const seg = `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
    if (p[2] + q[2] >= 0) spokeFront += seg; else spokeBack += seg;
  }

  // the axle, end to end, and its finials: a knob at each end and a turned collar just inside it
  const top = view([0, AXLE_END, 0]), bot = view([0, -AXLE_END, 0]);
  const axle = `M${f(top[0])} ${f(top[1])}L${f(bot[0])} ${f(bot[1])}`;
  const knob = mini ? 0.9 : 0.8;
  const dot = (p: V3, r: number) =>
    `M${f(p[0] - r)} ${f(p[1])}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
  const finials = dot(top, knob) + dot(bot, knob);
  let collars = '';
  if (!mini) {
    // a turned collar: a small flat disc on the pin, seen as an ellipse
    for (const sgn of [1, -1]) {
      const c = pv(flat(0.8, sgn * (AXLE_END - 1.5), 16), (p) => p);
      collars += 'M' + c.map((p) => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
    }
  }

  // the astrolabe cues on the outer gimbal's front half: an engraved band inside it and limb ticks between the two
  let band = '', ticks = '';
  if (full) {
    band = split(pv(upright(R_GIMBAL - 0.9)), true).front;
    for (let a = 0; a < 360; a += 10) {
      const [p, q] = pv([
        [(R_GIMBAL - 0.9) * Math.cos(rad(a)), (R_GIMBAL - 0.9) * Math.sin(rad(a)), 0],
        [(R_GIMBAL - (a % 30 === 0 ? 0 : 0.45)) * Math.cos(rad(a)), (R_GIMBAL - (a % 30 === 0 ? 0 : 0.45)) * Math.sin(rad(a)), 0],
      ]);
      if (p[2] > 0.4) ticks += `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
    }
  }

  const W = mini ? { g: 1.4, gb: 0.9, rim: 2.0, ax: 1.35 } : full ? { g: 1.3, gb: 0.75, rim: 1.75, ax: 1.2 } : { g: 1.35, gb: 0.85, rim: 1.9, ax: 1.25 };
  const back = full ? 0.4 : 0.5;
  const layers: GyroLayer[] = [
    { id: 'gimbalBack', d: gimbalV.back + gimbalH.back, w: W.gb, o: back },
    { id: 'rimBack', d: rim.back + (full ? rimIn.back : ''), w: W.gb, o: back + 0.15 },
    { id: 'spokesBack', d: spokeBack + hub.back, w: mini ? 0.8 : 0.6, o: back + 0.1 },
    { id: 'axle', d: axle + collars, w: W.ax, o: 1 },
    { id: 'spokesFront', d: spokeFront + hub.front, w: mini ? 0.9 : 0.7, o: 0.85 },
    { id: 'rimIn', d: full ? rimIn.front : '', w: 0.8, o: 1 },
    { id: 'rim', d: rim.front, w: W.rim, o: 1 },
    { id: 'gimbal', d: gimbalV.front + gimbalH.front, w: W.g, o: 0.92 },
    { id: 'band', d: band + ticks, w: 0.45, o: 0.8 },
    { id: 'finials', d: finials, w: 0, o: 1, fill: true },
  ];
  const k = pose.weight ?? 1;
  return k === 1 ? layers : layers.map((l) => ({ ...l, w: l.w * k }));
}

/** The layers as SVG elements, for a sheet or a static frame. */
export function gyroSvgInner(pose: GyroPose): string {
  return gyroLayers(pose)
    .map((l) => l.fill
      ? `<path data-g="${l.id}" d="${l.d}" fill="currentColor" stroke="none" opacity="${l.o}"/>`
      : `<path data-g="${l.id}" d="${l.d}" stroke-width="${l.w}" opacity="${l.o}"/>`)
    .join('');
}

/** `cubic-bezier(x1, y1, x2, y2)` as a function of time 0..1, the curve the spin has always eased by. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const B = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0, hi = 1, s = t;
    for (let i = 0; i < 24; i++) {
      s = (lo + hi) / 2;
      if (B(x1, x2, s) < t) lo = s; else hi = s;
    }
    return B(y1, y2, s);
  };
}
