// **A note's contours, in musical time and in physical time** (liquid-fix, 10-07;
// the review of the liquid V port, section 3).
//
// A note may carry contours over its own length, each knots of seconds from its
// start: its pitch's path (`bend`), its output level (`directEnvelope`, points),
// its pair's level (`subBeatCurve`), its third-harmonic share (`bodyCurve`) and the dips under the backbeat (`dips`);
// the part's paths over the note (`gainPath`, `panPath`, `lpPath`, `hpPath`, `dsp.ts` `withMotion`, and a
// return's amount as a path, `returns`, `withReturns`); and a sung phrase's paths (`levelCurve`, `pitchCurve`,
// `vibratoCurve`, `breathCurve`, `formant-pad.ts` and the wordless vocal).
// They are written in the theme's seconds and belong to its bars — a fall onto
// the next sixteenth, a dip under the snare — so they are **musical** time: on a
// grid that moves (a tempo ride) they move with it, and a note sounded again
// from inside itself (a seek) starts that far into them. The kick's contour, a
// sampled envelope, the entrance transient and a release are **physical** time,
// a sound's own seconds, and keep them on any grid.
//
// How far in a note starts is `curveDuration`, its whole length, less what is
// left of it (`dur`). A note without one starts at its beginning; the copy a
// start inside a note sounds (`spanning` in `deck.ts`) carries its whole length,
// so every walker of a path reads it from where the note stands (`pathFrom`).
//
// A rate can be musical too: a note that names controls in `gridRates` wrote
// them in the theme's hertz — a pair beating twice a beat, say — and on a grid
// that moves each is scaled by the note's whole length in the theme over its
// length on the grid. A voice takes one rate per note, so inside a note the
// rate is the ride's mean there: the note still spans the cycles it was written
// with, and the next note, written from theme time, starts on its own phase.
// A note that names none keeps every rate in its own seconds.
import type { NoteParams } from './descriptor.ts';

/** How far into its musical contours a note starts, in the note's contour seconds. */
export function contourElapsed(p: NoteParams): number {
  const dur = p.dur, whole = p.curveDuration;
  return typeof whole === 'number' && typeof dur === 'number' && Number.isFinite(whole) && whole > dur ? whole - dur : 0;
}

/** The dips from `elapsed` on: each moved back by it, the ones already past dropped. At nought, the note's own (an early dip at its start stays). */
export function dipsFrom(dips: readonly number[], elapsed: number): number[] {
  if (!(elapsed > 0)) return dips as number[];
  const out: number[] = [];
  for (let i = 0; i + 1 < dips.length; i += 2) if (dips[i] >= elapsed) out.push(dips[i] - elapsed, dips[i + 1]);
  return out;
}

/**
 * A path from `elapsed` on, as a walker lays it (`walkPath` in `formant-pad.ts`, `withMotion` and `withReturns` in
 * `dsp.ts`: its first value at the note's start, straight lines between the knots, a knot within a tenth of a
 * millisecond of the one before a step): the value it stands at there first, then the knots after it moved back by
 * it, a step after it kept a step. At nought, the note's own path.
 */
export function pathFrom(path: readonly number[], elapsed: number): number[] {
  if (!(elapsed > 0)) return path as number[];
  let value = path[1], last = 0;
  const out: number[] = [];
  for (let i = 2; i < path.length; i += 2) {
    const t = Math.max(0, path[i]), v = path[i + 1];
    if (!out.length) {
      if (t <= elapsed) { value = v; last = Math.max(last, t); continue; }
      if (t > last + 1e-4) out.push(0, value + (v - value) * (elapsed - last) / (t - last));
      else out.push(0, value, t - elapsed, value);
    }
    out.push(t - elapsed, v);
  }
  return out.length ? out : [0, value];
}

const pairs = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 2 && v.length % 2 === 0
  && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const mapped = (curve: readonly number[], map: (seconds: number) => number): number[] =>
  curve.map((v, i) => (i % 2 ? v : map(v)));

/** The note's contours that are knots of seconds from its start and a value, by key. */
const MUSICAL_PATHS = ['bend', 'subBeatCurve', 'bodyCurve', 'dips', 'gainPath', 'panPath', 'lpPath', 'hpPath',
  'levelCurve', 'pitchCurve', 'vibratoCurve', 'breathCurve'] as const;

/**
 * The note's musical contours through a grid's time: `map` takes seconds from
 * the note's own start, in its theme, to seconds from that start on the grid
 * (`curveDuration` with them, so a resumed note starts as far in as it did),
 * and the rates it names in `gridRates` by its whole length there.
 * Its physical controls are left as they are. A contour that is not a list of
 * finite pairs is left for the voice to refuse.
 */
export function contoursOnGrid(p: NoteParams, map: (seconds: number) => number): NoteParams {
  const out: NoteParams = { ...p };
  for (const key of MUSICAL_PATHS) if (pairs(p[key])) out[key] = mapped(p[key], map);
  // a return's amount written as a path over the note (`withReturns`) rides with them; an amount stays a number
  const returns = p.returns;
  if (returns && typeof returns === 'object' && Object.values(returns).some(pairs))
    out.returns = Object.fromEntries(Object.entries(returns).map(([k, v]) => [k, pairs(v) ? mapped(v, map) : v]));
  const env = p.directEnvelope;
  if (env && env.kind === 'points' && pairs(env.curve)) out.directEnvelope = { kind: 'points', curve: mapped(env.curve, map) };
  if (typeof p.curveDuration === 'number' && Number.isFinite(p.curveDuration)) out.curveDuration = map(p.curveDuration);
  if (Array.isArray(p.gridRates)) {
    const whole = typeof p.curveDuration === 'number' && Number.isFinite(p.curveDuration) ? p.curveDuration : p.dur;
    const onGrid = typeof whole === 'number' && whole > 0 ? map(whole) : NaN;
    if (onGrid > 0 && Number.isFinite(onGrid)) for (const key of p.gridRates)
      if (typeof key === 'string' && typeof p[key] === 'number' && Number.isFinite(p[key])) out[key] = p[key] * whole / onGrid;
  }
  return out;
}
