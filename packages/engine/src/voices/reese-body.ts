import { remainingCurve } from './output-envelope.ts';

/** Optional H3 gain relative to the row's own, linear between seconds/gain
 * pairs. The composer owns the shape. Validate before seeking, so a seek
 * cannot hide bad knots; a curve may outlast the remaining note. */
export function bodyCurve(value: unknown, elapsed = 0): readonly number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length < 4 || value.length > 256 || value.length % 2 !== 0)
    return refuse();
  for (let i = 0; i < value.length; i += 2) {
    const t: unknown = value[i], gain: unknown = value[i + 1];
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 60
      || (i === 0 ? t !== 0 : t <= value[i - 2])
      || typeof gain !== 'number' || !Number.isFinite(gain) || gain < 0 || gain > 8)
      return refuse();
  }
  const curve = elapsed > 0 ? remainingCurve(value, elapsed) : value as number[];
  // No extra nodes for an absent or neutral request, including after an accent.
  return curve.every((v, i) => i % 2 === 0 || v === 1) ? null : curve;
}

let told = false;
function refuse(): null {
  if (!told) console.warn('reese: bodyCurve needs 2-128 ordered pairs, starting at 0, within 60 seconds and gain 0-8; using the row\'s third harmonic');
  told = true;
  return null;
}
