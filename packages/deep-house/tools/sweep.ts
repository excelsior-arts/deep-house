// **A sweep's seeds, by the run** (round test-sane, 11-05). The node tests that walk a list of seeds, probes or link
// rows to hold one rule on every member take the list from here: the merge gate's `npm run check` walks every third
// member (the first, the fourth, …: the same members every run), and the night's `DEEP_HOUSE_SWEEP=full npm run check`
// walks them all. The rule is the same in both; what the gate gives up is a member that only the full list would show
// broken, which the night shows the same day.
//
//   import { sweep, upTo, FULL_SWEEP } from './sweep.ts';
//   for (const seed of upTo(30)) …            1..30 at night, 1, 4, 7, … 28 at the gate
//   for (const p of sweep(probes())) …        every member at night, every third at the gate
//
// A test that counts what it walked counts `sweep(...)`'s length, never the full list's.

export const FULL_SWEEP = process.env.DEEP_HOUSE_SWEEP === 'full';
export const EVERY = 3;

/** Every member under `DEEP_HOUSE_SWEEP=full`; otherwise every `every`-th, from the first. */
export function sweep<T>(all: Iterable<T>, every = EVERY): T[] {
  const xs = [...all];
  return FULL_SWEEP || every <= 1 ? xs : xs.filter((_, i) => i % every === 0);
}

/** The whole numbers `from..to` (inclusive), swept. */
export function upTo(to: number, from = 1, every = EVERY): number[] {
  return sweep(Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i), every);
}

/** A count a test held at the full list, scaled to the swept one (rounded down), for a floor like "at least 150 of them". */
export function swept(n: number, every = EVERY): number {
  return FULL_SWEEP || every <= 1 ? n : Math.floor(n / every);
}
