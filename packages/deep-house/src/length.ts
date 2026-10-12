// A theme's length, in minutes, from the birds (round L1).
//
// Eugene, 10-01: *"fast beat tracks tend to be too short, sometimes under 2
// minutes; the length must not come only from bars count and speed, it should
// be something more holistic"* — and then: *no hard-coded minutes; the length
// comes from the birds through a heuristic we can tune.*
//
// Until L1 a theme rolled its **bars** out of the set table and the tempo only
// converted them, so the same 56 bars were 2:13 at the house and 1:17 at 172.
// Now the derived state says how long a theme wants to be **in minutes**, the
// seed rolls inside that band the way it rolled bars, and the bars follow from
// the tempo the theme actually plays at (`barsFor`).
//
// **The heuristic, in one line:**
//
//   scale = (100 / tempoCentre)^ember
//         × e^( −veil × (changeRate − house)
//               + tide × (wet − house)
//               + loom × (formLength − house) )
//   band  = LENGTH.house × scale, each end inside LENGTH.guard
//
// every bird read as its distance from the house, so **at the house the scale
// is exactly 1** (every exponent is nought, and 100 / 100 is 1) and the band is
// `LENGTH.house` as written. Every term is multiplicative, so a knob reads the
// same share at every length: Veil at 0.3 takes about 4 % off per tenth of
// restlessness wherever the other birds put the band.
//
// **What each bird is for:**
//   Ember — energy. Its tempo centre on the curve (`tempoCentreOf`): a faster
//     pulse is a shorter track, gently, since a track at 172 is still a whole
//     track and not a sketch; a slow one is longer.
//   Veil — change rate. Restless is shorter (the material is used up sooner),
//     patient is longer (it unfolds).
//   Tide — wet and held. A deep, slow-wet piece is longer.
//   Loom — how long a form it wants. The bird whose very meaning is length.
//
// **The guards are guards.** Three minutes and twenty are not a band: they are
// where the heuristic would be broken, and at every authored family pull below
// neither binds — if one does, it is the weights that are wrong. They only
// bind at the far corners of the ring (every bird at its short end, say).
//
// **At the family pulls** (each the house with the named birds moved, as the
// machine view's genre keys and the benchmark have them; the tempo is the
// centre the pulse reads, and the bars are the band's ends at that tempo):
//
//   pull         birds off the house                      bpm  minutes      bars
//   house        —                                         100  3.50–5.90   88–148
//   tech house   em .70 sp .40 ze .60 ro .60 ti .45        123  3.21–5.41  100–168
//   techno       em .72 ro .60 ze .50 ve .60               125  3.26–5.49  100–172
//   DnB          em .96 sp .80 ve .60                      172  3.11–5.24  132–224
//   downtempo    em .30 ti .70 ro .55                       88  3.83–6.46   84–144
//   dub techno   em .72 sp .10 ti .90 ze .25 ro .85
//                ve .15 lo .80                             122  5.94–10.02 180–304
//   ambient      em .10 ti .85 ze .90 ro .50 ve .30
//                lo .80 sp 0                                47  6.37–10.73  76–128
//   27191        em .14 gl 0 ve .34 sp 0 lo .81             48  5.50–9.27   64–112
//
// **The slow side runs longer** (round L2, Eugene of 27191: *"raising the
// length to 9 is also acceptable"*): Loom 1.0 → 1.3, which only the rows
// that move Loom read — the house, the two driving fours, DnB and downtempo
// are the rows L1 wrote, and the house is exactly its band. The benchmark's
// third theme, at the ladder's top, is 9:02 (112 bars at 49.6), was 8:23.
//
// Neither guard binds on any row. The DnB row is the case this round is for:
// it is shorter than the house because a fast, restless pulse uses its
// material sooner (Ember × 0.89, Veil × 0.96), and whole because the minutes
// no longer shrink with the tempo — 56 bars at 172 were 1:17, and the shortest
// a seed rolls there now is 3:07.

import { HOUSE_DERIVED } from './spell.ts';
import type { Derived } from './spell.ts';

/**
 * **The knobs.** Tuning the length is editing these numbers and nothing else.
 */
export const LENGTH = Object.freeze({
  /** the band at the house, in minutes: the shortest and the longest a seed rolls */
  house: Object.freeze([3.5, 5.9] as const),
  /** Ember: the exponent on 100 / the tempo centre (0 = tempo has no say; 1 = a fixed bar count) */
  ember: 0.15,
  /** Veil: e-folds of length per unit of change rate off the house, shorter as it rises */
  veil: 0.3,
  /** Tide: e-folds per unit of wet off the house, longer as it rises */
  tide: 0.5,
  /** Loom: e-folds per unit of form length off the house, longer as it rises (1.0 until L2) */
  loom: 1.3,
  /** the guards, in minutes: never under, never over, and never the answer at a family pull */
  guard: Object.freeze([3, 20] as const),
});

/** The share of the house band the derived state asks for; exactly 1 at the house. */
export function lengthScale(d: Derived, k: typeof LENGTH = LENGTH): number {
  const h = HOUSE_DERIVED;
  const tempo = d.tempoCentre === h.tempoCentre ? 1 : Math.pow(h.tempoCentre / d.tempoCentre, k.ember);
  return tempo * Math.exp(
    -k.veil * (d.changeRate - h.changeRate)
    + k.tide * (d.wet - h.wet)
    + k.loom * (d.formLength - h.formLength),
  );
}

/** The band a theme's minutes are rolled inside: `[shortest, longest]`. Pure. */
export function minutesBand(d: Derived, k: typeof LENGTH = LENGTH): readonly [number, number] {
  const s = lengthScale(d, k);
  const [lo, hi] = k.guard;
  const at = (m: number) => Math.min(hi, Math.max(lo, m * s));
  return [at(k.house[0]), at(k.house[1])];
}

/** Where `pos` (0..1, the seed's place in the set table's ladder) lands in the band. */
export function minutesAt(band: readonly [number, number], pos: number): number {
  return band[0] + Math.min(1, Math.max(0, pos)) * (band[1] - band[0]);
}

/**
 * Minutes at a tempo as bars, on the four-bar grid: `minutes × bpm / 4`. The
 * grid never rounds a theme under the lower guard: a band that ends at it
 * keeps every bar of it.
 */
export function barsFor(minutes: number, bpm: number, k: typeof LENGTH = LENGTH): number {
  let bars = Math.max(16, Math.round((minutes * bpm) / 16) * 4);
  while (minutesOf(bars, bpm) < k.guard[0]) bars += 4;
  return bars;
}

/** What a theme of `bars` at `bpm` lasts, in minutes. */
export const minutesOf = (bars: number, bpm: number): number => (bars * 4) / bpm;

/** Minutes as the clock a listener reads them, `m:ss`. */
export function clockOf(minutes: number): string {
  const s = Math.round(minutes * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
