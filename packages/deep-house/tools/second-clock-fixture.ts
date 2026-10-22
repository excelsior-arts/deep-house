// **A lab place that says `free`** (PLAN-AMBIENT §4, the second clock, P5): the round's fixture, in tools/ and never
// shipped. No place in `src/` says `clock: 'free'` in this round, so nothing the page plays is free; this hands a check,
// a render and a bench one that is, without a line of the shipped tables moving.
//
// The place is the Ambient tile's own (FLOATING's birds and window), listed ahead of every time entry of the house-v2
// style, so at the tile and wherever FLOATING's time would win it is this entry that wins (a tie goes to the table's
// order) and the theme plans free, at the nominal 60. Everything else about the tile's themes is the tile's: only the
// time table is touched. The set the checks lay out is free -> house -> free: the tile, a house theme near 120 BPM
// (seed 1 at Ember 0.60 draws 119.1), the tile again.

import { STRATEGIES } from '../src/strategies/index.ts';
import { planTheme } from '../src/mix.ts';
import type { TimeEntry } from '../src/musical-time.ts';
import type { StylePlaces } from '../src/places.ts';
import type { Style } from '@deep-house/engine/style';

/** The Ambient tile's spell (`src/genres/genres.json`), FLOATING's birds. */
export const TILE = Object.freeze({ ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, spark: 0, loom: 0.80 });
/** A house theme near 120 BPM: seed 1 at Ember 0.60 is 119.1. */
export const HOUSE_120 = Object.freeze({ ember: 0.6 });

/** The fixture's one entry: the tile's place, free. */
export const FREE_AT_THE_TILE: TimeEntry = Object.freeze({
  id: 'lab-free-at-the-tile',
  place: Object.freeze({ birds: TILE, tempo: Object.freeze([40, 70] as const) }),
  clock: 'free' as const,
});

/** A style that is house-v2 with the fixture's entry ahead of its own time table. */
export function freeStyle(base: Style = STRATEGIES['house-v2'].style): Style {
  const places = (base as Style & { places: StylePlaces }).places;
  return { ...base, places: { ...places, time: [FREE_AT_THE_TILE, ...(places.time ?? [])] } } as Style;
}

/** The test set: free -> house -> free, themes 0-2 of one seed under the fixture style. */
export function freeHouseFree(seed = '1', style: Style = freeStyle()) {
  const quiet = console.log; console.log = () => {};
  try {
    return [TILE, HOUSE_120, TILE].map((spell, i) => planTheme(seed, i, { style, spell, preset: 'auto' } as any));
  } finally { console.log = quiet; }
}
