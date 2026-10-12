// Optional direct-output articulation: a note's own (`directEnvelope`, carried
// by the note as serializable numbers) or a row's (`contour`, every note of the
// row). Registered renderers keep their identity; a note without either, of a
// row without one, adds no node.
import type { VoiceRenderer } from './descriptor.ts';
import { contourElapsed } from './contour-time.ts';
import { inUnit, num } from './schema.ts';
import { movedOf } from './desk-layer.ts';

/**
 * **A row's output contour** (the liquid bass rounds, 10-07): a gain over every
 * note of the row, at the voice's dry output, from its onset. Knots `[seconds,
 * gain, ease?]`, the first at nought; from one knot to the next the gain moves
 * on the knot's ease — `linear` (absent), `smooth` (smoothstep) or `sine`
 * (sine squared) — and after the last it holds, to `seconds` and on.
 */
export interface OutputContour {
  seconds: number;
  /**
   * How much of the contour is heard (the liquid knobs, 10-07): each gain `g`
   * is played as `g × depth + (1 − depth)`, so 1 is the contour as its points
   * say and 0 is none of it — the row's own output, flat at one. Absent, 1.
   */
  depth?: number;
  points: [at: number, gain: number, ease?: 'linear' | 'smooth' | 'sine'][];
}

/**
 * **The contour's depth as a desk line** (the liquid knobs, 10-07): a row with
 * a contour carries one number more than its topology's contract, at this
 * path, in this field — a share from none of the contour to all of it. It is
 * the row's (`descriptor.contour`), not the topology's, so the device reads it
 * beside the contract's lines and the desk's layer holds a move on it as on
 * any other line; a note reads the move at its onset (`withOutputEnvelope`).
 */
export const CONTOUR_DEPTH_PATH = 'contour.depth';
export const CONTOUR_DEPTH = inUnit(num(0, 1), 'ratio');

/** The rate a contour is laid down at: one value a millisecond, interpolated by the parameter between them. */
export const CONTOUR_RATE = 1000;

/** What is wrong with a row's contour, in words; nothing for a good one. */
export function contourFaults(c: unknown): string[] {
  const bad: string[] = [];
  const o = c as OutputContour;
  if (!o || typeof o !== 'object' || !Number.isFinite(o.seconds) || o.seconds <= 0 || o.seconds > 2) return ['a contour needs seconds from 0 to 2'];
  if (!Array.isArray(o.points) || o.points.length < 2 || o.points.length > 64) return ['a contour needs 2 to 64 points'];
  if (o.depth !== undefined && (!Number.isFinite(o.depth) || o.depth < CONTOUR_DEPTH.min || o.depth > CONTOUR_DEPTH.max)) bad.push('a contour\'s depth is from 0 to 1');
  o.points.forEach((k, i) => {
    if (!Array.isArray(k) || k.length < 2 || k.length > 3) { bad.push(`contour point ${i} is not [seconds, gain, ease?]`); return; }
    const [at, gain, ease] = k;
    if (!Number.isFinite(at) || at < 0 || at > o.seconds || (i === 0 ? at !== 0 : at <= o.points[i - 1][0])) bad.push(`contour point ${i} is not after the one before it, inside the contour`);
    if (!Number.isFinite(gain) || gain < 0 || gain > 2) bad.push(`contour point ${i}'s gain is not from 0 to 2`);
    if (ease !== undefined && !['linear', 'smooth', 'sine'].includes(ease)) bad.push(`contour point ${i}'s ease ${JSON.stringify(ease)} is not linear, smooth or sine`);
  });
  return bad;
}

/** A contour as the sampled envelope the wrapper lays down. */
export function contourEnvelope(c: OutputContour): DirectEnvelope {
  const n = Math.round(c.seconds * CONTOUR_RATE) + 1, pts = c.points;
  // at a depth of one, `g × 1 + 0` is `g` to the bit: the contour as its points say
  const depth = c.depth ?? 1, flat = 1 - depth;
  const values = Array.from({ length: n }, (_, i) => depth * gainAt(i) + flat);
  return Object.freeze({ kind: 'samples', seconds: c.seconds, values: Object.freeze(values) as number[] });
  function gainAt(i: number): number {
    const t = i / CONTOUR_RATE;
    for (let j = 1; j < pts.length; j++) {
      if (t >= pts[j][0]) continue;
      const [t0, a] = pts[j - 1], [t1, b, ease] = pts[j];
      const u = (t - t0) / (t1 - t0);
      const w = ease === 'smooth' ? u * u * (3 - 2 * u) : ease === 'sine' ? Math.sin((Math.PI / 2) * u) ** 2 : u;
      return a + (b - a) * w;
    }
    return pts[pts.length - 1][1];
  }
}

export type DirectEnvelope =
  | { kind: 'points'; curve: number[] }
  | { kind: 'samples'; seconds: number; values: number[] };

/** A linear contour from an elapsed point onward, including its current value. */
export function remainingCurve(curve: number[], elapsed: number): number[] {
  let value = curve[curve.length - 1];
  for (let i = 2; i < curve.length; i += 2) if (elapsed <= curve[i]) {
    const u = Math.max(0, (elapsed - curve[i - 2]) / (curve[i] - curve[i - 2]));
    value = curve[i - 1] + u * (curve[i + 1] - curve[i - 1]);
    break;
  }
  const out = [0, value];
  for (let i = 0; i < curve.length; i += 2) if (curve[i] > elapsed + 1e-9) out.push(curve[i] - elapsed, curve[i + 1]);
  return out;
}

const admitted = new WeakMap<object, Float32Array<ArrayBuffer> | null>();
function admit(e: DirectEnvelope): Float32Array<ArrayBuffer> | null {
  if (!e || typeof e !== 'object') throw Error('Invalid direct envelope');
  if (admitted.has(e)) return admitted.get(e)!;
  let sampled: Float32Array<ArrayBuffer> | null = null;
  if (e.kind === 'points') {
    const c = e.curve;
    if (!Array.isArray(c) || c.length < 4 || c.length > 256 || c.length % 2 || c[0] !== 0
      || c.some((v, i) => !Number.isFinite(v) || (i % 2 ? v < 0 || v > 2 : v < 0 || v > 60 || (i > 0 && v <= c[i - 2]))))
      throw Error('Invalid direct envelope points');
  } else if (e.kind === 'samples') {
    if (!Number.isFinite(e.seconds) || e.seconds <= 0 || e.seconds > 60 || !Array.isArray(e.values)
      || e.values.length < 2 || e.values.length > 2048 || e.values.some(v => !Number.isFinite(v) || v < 0 || v > 2))
      throw Error('Invalid sampled direct envelope');
    sampled = Float32Array.from(e.values);
  } else throw Error('Unknown direct envelope');
  // Cached inputs must not change after admission; compiler output is already frozen.
  if (Object.isFrozen(e) && Object.isFrozen(e.kind === 'points' ? e.curve : e.values)) admitted.set(e, sampled);
  return sampled;
}

export function withOutputEnvelope(render: VoiceRenderer, contour: OutputContour | null = null, voice: string | null = null): VoiceRenderer {
  const own = contour ? contourEnvelope(contour) : null;
  // the contour at the depth the desk moved it to, built once per depth asked
  let movedDepth: number | undefined, moved: DirectEnvelope | null = null;
  const rowEnvelope = (): DirectEnvelope | null => {
    const depth = contour && voice ? movedOf(voice)?.get(CONTOUR_DEPTH_PATH) : undefined;
    if (depth === undefined) return own;
    if (depth !== movedDepth) { movedDepth = depth; moved = contourEnvelope({ ...contour!, depth }); }
    return moved;
  };
  return (ctx, out, at, note, settings, themeTime) => {
    // the note's own envelope where it carries one, else the row's contour
    const envelope: DirectEnvelope | undefined = note.directEnvelope ?? rowEnvelope() ?? undefined;
    if (!envelope || !out.dry) return render(ctx, out, at, note, settings, themeTime);
    const sampled = admit(envelope), gain = ctx.createGain();
    if (envelope.kind === 'samples') {
      gain.gain.setValueCurveAtTime(sampled!, at, envelope.seconds);
      gain.gain.setValueAtTime(sampled![sampled!.length - 1], at + envelope.seconds);
    } else {
      // a note started inside itself is as far into its level as into its other contours (`contour-time.ts`);
      // the level is straight between knots, so trimming it is reading it from there
      const elapsed = contourElapsed(note);
      const curve = elapsed > 0 ? remainingCurve(envelope.curve, elapsed) : envelope.curve;
      gain.gain.setValueAtTime(curve[1], at);
      for (let i = 2; i < curve.length; i += 2) gain.gain.linearRampToValueAtTime(curve[i + 1], at + curve[i]);
    }
    gain.connect(out.dry);
    return render(ctx, { ...out, dry: gain }, at, note, settings, themeTime);
  };
}
