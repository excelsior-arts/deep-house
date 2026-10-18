// **A noise transition earns its place** (his word 10-16 on golden 38's second theme: "a little whoosh/wind effect in
// between two fairly similar-in-level segments, moreover on the sparse acoustic side of things … maybe it's more suited
// to segment seams that change from higher to lower or the other way (dynamic), and to tracks where we have synth pads
// and other noisy voices"). A seam is read two ways, by the row `recipes/arrangement/seams.json`:
//
//   the energy across it   what the bars before and after play (the kick, the backbeat, the hats, the tops, the bass,
//                          the harmony, the tonal voices sounding, the drum onsets), so a gesture rising into more,
//                          falling into less, or neither
//   the texture there      the held bed's own hold (a supersaw's 0.95, a strings' 0.52, a struck rhodes none), an air
//                          bed, and the hand drums playing (they lean noise away)
//
// The two multiply into a share; a die off the seam's own stream keeps the noise at that share. Nothing here names a
// place, a genre or a seed.
import SEAMS_FILE from '../recipes/arrangement/seams.json' with { type: 'json' };

export type Direction = 'up' | 'down' | 'any';
export interface SeamsRow {
  energy: { bars: number; weights: Record<'kick' | 'backbeat' | 'hats' | 'tops' | 'bass' | 'harmony' | 'voices' | 'density', number>; densityFull: number;
    /** the tonal voices sounding over a bar that read as all of the `voices` weight */
    voicesFull: number;
    /** what a filtered phrase's low-pass leaves of a bar's readings */
    filtered: Partial<Record<'kick' | 'backbeat' | 'hats' | 'tops' | 'bass' | 'harmony' | 'voices' | 'onsets', number>> };
  fit: { dead: number; span: number };
  texture: { holdFrom: number; holdFull: number; air: number; hands: number };
  noise: { gestures: Record<string, Direction>; glue: Record<string, Direction> };
}
export const SEAMS: Readonly<SeamsRow> = SEAMS_FILE as unknown as SeamsRow;

/** What a bar plays, as the seam reads it (each 0 to 1; `voices`, the tonal voices sounding, and `onsets`, counts). */
export interface BarEnergy { kick: number; backbeat: number; hats: number; tops: number; bass: number; harmony: number; voices: number; onsets: number }
/** The bed at a bar: the held bed's hold (a struck bed's none), whether an air bed sounds, whether the hand part plays. */
export interface BarBed { hold: number; air: boolean; hands: boolean }

/** A bar's energy, 0 to the weights' sum. */
export function energyOf(b: BarEnergy, R: Readonly<SeamsRow> = SEAMS): number {
  const W = R.energy.weights;
  return W.kick * b.kick + W.backbeat * b.backbeat + W.hats * b.hats + W.tops * b.tops + W.bass * b.bass + W.harmony * b.harmony
    + W.voices * Math.min(1, b.voices / R.energy.voicesFull) + W.density * Math.min(1, b.onsets / R.energy.densityFull);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** How a change of energy admits a gesture of a direction: nought up to `dead`, all of it from `dead + span`. */
export function fitOf(delta: number, dir: Direction, R: Readonly<SeamsRow> = SEAMS): number {
  const x = dir === 'up' ? delta : dir === 'down' ? -delta : Math.abs(delta);
  return clamp01((x - R.fit.dead) / R.fit.span);
}
/** How the bed admits noise: the held bed's hold between `holdFrom` and `holdFull`, or an air bed; less where the hands play. */
export function textureOf(beds: readonly BarBed[], R: Readonly<SeamsRow> = SEAMS): number {
  if (!beds.length) return 0;
  const T = R.texture;
  const hold = Math.max(...beds.map((b) => b.hold));
  const held = clamp01((hold - T.holdFrom) / Math.max(1e-9, T.holdFull - T.holdFrom));
  const x = Math.max(held, beds.some((b) => b.air) ? T.air : 0);
  return x * (beds.some((b) => b.hands) ? T.hands : 1);
}

/** One seam read: the energy before and after, its change, the two fits and the share the noise is kept at. */
export interface SeamReading { before: number; after: number; delta: number; fit: number; texture: number; share: number }
/**
 * **A seam's reading** for a noise gesture of `dir` on bar `bar` into the line `line`: the energy over the `energy.bars`
 * bars before `bar` against the bars from `line`, and the bed over the gesture's bar and the line's.
 */
export function readSeam(bar: number, line: number, dir: Direction, energyAt: (b: number) => BarEnergy | null, bedAt: (b: number) => BarBed | null,
  R: Readonly<SeamsRow> = SEAMS): SeamReading {
  const n = R.energy.bars;
  const mean = (bars: number[]) => { const xs = bars.map(energyAt).filter((x): x is BarEnergy => !!x).map((x) => energyOf(x, R)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
  const before = mean(Array.from({ length: n }, (_, i) => bar - n + i).filter((b) => b >= 0));
  const after = mean(Array.from({ length: n }, (_, i) => line + i));
  const delta = after - before;
  const fit = fitOf(delta, dir, R);
  const texture = textureOf([bar, line].map(bedAt).filter((x): x is BarBed => !!x), R);
  const r4 = (x: number) => +x.toFixed(4);
  return { before: r4(before), after: r4(after), delta: r4(delta), fit: r4(fit), texture: r4(texture), share: r4(fit * texture) };
}

/** The row's faults: every weight a share, the fits and the texture well formed, every direction known. */
export function seamsFaults(R: Readonly<SeamsRow>): string[] {
  const bad: string[] = [];
  const share = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;
  for (const [k, x] of Object.entries(R.energy.weights)) if (!share(x)) bad.push(`energy.weights.${k}: ${x}`);
  if (!(R.energy.bars >= 1) || !(R.energy.densityFull > 0) || !(R.energy.voicesFull > 0)) bad.push('energy: bars, densityFull and voicesFull');
  for (const [k, x] of Object.entries(R.energy.filtered ?? {})) if (!share(x)) bad.push(`energy.filtered.${k}: ${x}`);
  if (!share(R.fit.dead) || !(R.fit.span > 0)) bad.push('fit: dead a share, span above nought');
  if (!(R.texture.holdFull > R.texture.holdFrom) || !share(R.texture.air) || !share(R.texture.hands)) bad.push('texture');
  for (const [k, d] of [...Object.entries(R.noise.gestures), ...Object.entries(R.noise.glue)]) if (!['up', 'down', 'any'].includes(d)) bad.push(`noise ${k}: ${d}`);
  return bad;
}
{
  const bad = seamsFaults(SEAMS);
  if (bad.length) throw new Error(`the seams row: ${bad.join('; ')}`);
}
