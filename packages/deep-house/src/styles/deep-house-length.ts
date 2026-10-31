// **The length rows both strategies read** (engine-data, 10-28; his word: *"we keep changes in data"*): the arithmetic is
// `src/length.ts`, the numbers are here. house-v1 and house-v2 roll a theme's minutes from the same rows (the page's set
// rolls minutes under either); a place names the struck row by its technique entry's `length` (house-v2's places).
import type { LengthKnobs } from '../length.ts';

/**
 * **The length rows** (round length-2, Eugene 10-27: *"if you look at our featured playlist vibe and drive most song 4-5
 * minutes some 8 or 10 … We should aim for 3-4mins here"*; *"for ambient … let's aim 9-10"*; round length-2b, 10-28:
 * *"bowls and bells should not aim to 9 mins as they are simplest ambient tone, for them 5-6 minute range was just
 * right"*): the arithmetic is `src/length.ts`, its tables there; tuning the length is editing these numbers and nothing
 * else. A place names the struck row by its technique entry's `length` (BELLS's and BOWLS's).
 */
export const LENGTH_ROWS: LengthKnobs = Object.freeze({
  /** a groove: 3-4 minutes at the house, Loom stretching to about 4:30 at its top, Veil shortening */
  groove: Object.freeze({ centre: null, band: Object.freeze([3.05, 4.0] as const), ember: 0.03, veil: 0.1, tide: 0.12, loom: 0.3 }),
  /** drumless (the slow side, the ambient places): 9-10 minutes at the slow places' middle, every bird a small lean */
  drumless: Object.freeze({
    centre: Object.freeze({ ember: 0.05, tide: 0.85, loom: 0.9, veil: 0.4, spark: 0.1 }),
    band: Object.freeze([9.1, 9.9] as const), ember: 0, veil: 0.08, tide: 0.08, loom: 0.15,
  }),
  named: Object.freeze({
    /** struck voices in conversation: 5-6 minutes, the simplest ambient tone, every bird a small lean about the middle of the conversation's places; blended into the drumless band by its share */
    struck: Object.freeze({
      family: 'drumless' as const,
      centre: Object.freeze({ ember: 0.035, tide: 0.8, zephyr: 0.575, root: 0.25, gleam: 0.8, veil: 0.15, spark: 0.275, loom: 0.95 }),
      band: Object.freeze([5.35, 5.85] as const), ember: 0, veil: 0.05, tide: 0.05, loom: 0.08,
    }),
  }),
  /** how far inside the naming entries' border (bird units, `lengthMargin`) a named row's share is whole: a twentieth of a bird */
  fade: 0.05,
  /** the guards, in minutes: never under, never over, and never the answer at a family pull */
  guard: Object.freeze([2.5, 20] as const),
});
