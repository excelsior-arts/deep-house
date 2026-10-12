/** A note's optional secondary/main ratio path. Musical decisions belong to
 * the composer; this module only interpolates a bounded physical control.
 * `lifetime` is what the note has left to sound (the control buffer's length);
 * knots past it are held, never a reason to refuse the curve — a tempo ride or a
 * seek moves where the note ends, and a pair that fell back to its constant
 * level there would wobble through a passage written to glide (liquid-fix,
 * 10-07). A curve that is not one — unordered, out of bounds — is refused, and
 * says so once. */
export function beatCurve(value: unknown, bounds: { min: number; max: number } | undefined, lifetime: number): readonly number[] | null {
  if (value === undefined || value === null) return null;
  const refuse = (why: string): null => { refused(why); return null; };
  if (!bounds) return refuse('the row declares no subBeatLevel');
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 16) return refuse(`a lifetime of ${lifetime} s is outside 0-16 s`);
  if (!Array.isArray(value) || value.length < 4 || value.length > 128 || value.length % 2 !== 0) return refuse('it is not 2 to 64 pairs');
  for (let i = 0; i < value.length; i += 2) {
    const t: unknown = value[i], r: unknown = value[i + 1];
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0
      || (i > 0 && t - value[i - 2] < 0.002)
      || typeof r !== 'number' || !Number.isFinite(r) || r < Math.max(0, bounds.min) || r > bounds.max || r >= 1)
      return refuse(`knot ${i / 2} is out of order or bounds`);
  }
  return value as number[];
}
const told = new Set<string>();
function refused(why: string): void {
  if (told.has(why)) return;
  told.add(why);
  console.warn(`reese: a pair curve was refused (${why}); the note plays its constant pair`);
}

/** Smoothstep, held outside the knots. The derivative matters: changing the
 * ratio also changes the pair's phase, even with fixed frequency separation. */
export function beatAt(curve: readonly number[], t: number): [ratio: number, derivative: number] {
  if (t <= curve[0]) return [curve[1], 0];
  for (let i = 2; i < curve.length; i += 2) {
    if (t >= curve[i]) continue;
    const dt = curve[i] - curve[i - 2], u = (t - curve[i - 2]) / dt;
    const dr = curve[i + 1] - curve[i - 1];
    return [curve[i - 1] + dr * u * u * (3 - 2 * u), dr * 6 * u * (1 - u) / dt];
  }
  return [curve[curve.length - 1], 0];
}

export const BEAT_CONTROL_RATE = 4000;
/** The rate the pair's two slow controls (its ratio and its power
 * normalisation) are sampled at: they follow the written smoothstep alone, and
 * a millisecond grid draws a segment of 64 ms or more to within 1e-5 of the
 * ratio; a shorter segment is drawn with 64 points, never finer than
 * `BEAT_CONTROL_RATE` (the engine review of 10-08, F5). */
export const LEVEL_CONTROL_RATE = 1000;
export function levelRate(curve: readonly number[]): number {
  let shortest = Infinity;
  for (let i = 2; i < curve.length; i += 2) if (curve[i + 1] !== curve[i - 1]) shortest = Math.min(shortest, curve[i] - curve[i - 2]);
  return Math.min(BEAT_CONTROL_RATE, Math.max(LEVEL_CONTROL_RATE, Math.ceil(64 / shortest)));
}

/** The pair's ratio and power normalisation as a two-channel control buffer at
 * `rate` (`levelRate`), played slower as the body's is: every frame the
 * written curve's smoothstep exactly, from `offset` seconds into it. */
export function levelBuffer(ctx: BaseAudioContext, curve: readonly number[], lifetime: number, power: number, rate: number, offset = 0): AudioBuffer {
  const n = Math.ceil(lifetime * rate) + 2;
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  const ratio = buffer.getChannelData(0), norm = buffer.getChannelData(1);
  const last = curve.length - 2;
  let k = 2;
  for (let i = 0; i < n; i++) {
    const at = offset + i / rate;
    let r: number;
    if (at <= curve[0]) r = curve[1];
    else {
      while (k <= last && at >= curve[k]) k += 2;
      if (k > last) r = curve[last + 1];
      else {
        const u = (at - curve[k - 2]) / (curve[k] - curve[k - 2]);
        r = curve[k - 1] + (curve[k + 1] - curve[k - 1]) * u * u * (3 - 2 * u);
      }
    }
    ratio[i] = r;
    norm[i] = Math.sqrt(power / (power + r * r));
  }
  return buffer;
}

/** Native interpolated controls for the following body: its H3 frequency
 * correction and H3 amplitude, which turn at the pair's own rate and so stay
 * at `BEAT_CONTROL_RATE`. A buffer uses the context's supported sample rate
 * and plays slower, yielding 4 kHz controls without a JS audio callback.
 * Uncached and bounded to 16 seconds (about 512 KiB); includes a tail pad.
 * (Until 10-08 it carried the ratio and the normalisation too, four channels
 * at 4 kHz: `levelBuffer` carries those, at a quarter of the rate.) The curve
 * is walked once rather than searched per sample, and the pair's angle turns by
 * a fixed rotation, drawn afresh from the cosine every 1024 frames — the same
 * numbers as a cosine per frame to well under a float's last bit. */
export function bodyBuffer(ctx: BaseAudioContext, curve: readonly number[], lifetime: number, hz: number, phase: number, h3: number, offset = 0): AudioBuffer {
  const n = Math.ceil(lifetime * BEAT_CONTROL_RATE) + 2;
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  const frequency = buffer.getChannelData(0), amplitude = buffer.getChannelData(1);
  // `offset`: a note started inside itself reads its curve from there, value and slope (`phase` is the pair's at that point)
  const last = curve.length - 2;
  const turn = 2 * Math.PI * hz / BEAT_CONTROL_RATE, cr = Math.cos(turn), sr = Math.sin(turn);
  let k = 2, c = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const t = i / BEAT_CONTROL_RATE, at = offset + t;
    let r: number, derivative = 0;
    if (at <= curve[0]) r = curve[1];
    else {
      while (k <= last && at >= curve[k]) k += 2;
      if (k > last) r = curve[last + 1];
      else {
        const dt = curve[k] - curve[k - 2], u = (at - curve[k - 2]) / dt, dr = curve[k + 1] - curve[k - 1];
        r = curve[k - 1] + dr * u * u * (3 - 2 * u);
        derivative = dr * 6 * u * (1 - u) / dt;
      }
    }
    if ((i & 1023) === 0) {
      const theta = 2 * Math.PI * (phase + hz * t);
      c = Math.cos(theta); s = Math.sin(theta);
    } else {
      const c1 = c * cr - s * sr;
      s = s * cr + c * sr; c = c1;
    }
    const d = 1 + 2 * r * c + r * r;
    // d/dt arg(1 + r(t) exp(i theta(t))), in hertz, threefold.
    frequency[i] = 3 * (hz * (r * c + r * r) + derivative * s / (2 * Math.PI)) / d;
    amplitude[i] = h3 * Math.sqrt(d / (1 + r * r));
  }
  return buffer;
}
