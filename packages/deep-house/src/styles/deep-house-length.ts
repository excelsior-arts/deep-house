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
    /**
     * **A groove felt at half its written tempo** (round dark-fronts' tenth pass, his word 11-04 on the heavy-bass
     * half-time tracks: *"they have fast bpm, but fundamentally they are slow … could be a bit longer, they actually
     * seem to not fit the 3 min limit, and could go into 3:30-4"*): 3:30-4:00 about the deep half-time place, every bird
     * a small lean (Loom the smallest of the groove's: these are the places where Loom sits low by nature); named by the
     * time entries whose kit plays half-time (`length: 'half'`, `TIME` in deep-house-places.ts) and played only where
     * the plan's own drums read half (`feltPulseOf`, set-plan.ts): a kick on every beat keeps the groove's band.
     */
    half: Object.freeze({
      family: 'groove' as const,
      centre: Object.freeze({ ember: 0.92, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 }),
      band: Object.freeze([3.5, 4.0] as const), ember: 0.03, veil: 0.08, tide: 0.08, loom: 0.1,
    }),
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
