// A variant keeps its number for life: the ledger that makes it so.
//
// `recipe-A-variant-3.wav` is the file a verdict points at, and 09-18's rule
// is that it goes on meaning the same eight bars however the ranking moves.
// `variants.ts` kept that rule by reading the *previous run's picks* and
// replacing them with the new ones, so a candidate that fell out of one top
// four was forgotten and its number could be handed to another candidate on
// the run after (M3 of the mining review, 09-19). This is the rule as an append-only file:
// every number ever given, keyed by the recipe's own id and by the music — the
// seed, the theme and the window — and never by the letter a run happened to
// print or the rank it happened to give.

export interface Ledger {
  /** recipe id -> music key -> the number it was given */
  numbers: Record<string, Record<string, number>>;
}

/** The music a number belongs to: the seed, the theme and the bars, and nothing about the run. */
export const musicKey = (seed: string | number, theme: number, fromBar: number, bars: number): string =>
  `${seed}#${theme}@${fromBar}+${bars}`;

/** An empty ledger, or the one on disk. */
export function emptyLedger(): Ledger {
  return { numbers: {} };
}

/**
 * The numbers for a recipe's picks: a key that has one keeps it, a key that
 * has none takes the next number above every number the recipe has ever
 * given. The ledger is written to, never pruned, so a number is never reused.
 */
export function assignNumbers(ledger: Ledger, recipeId: string, keys: string[]): Map<string, number> {
  const own = ledger.numbers[recipeId] || (ledger.numbers[recipeId] = {});
  let next = Math.max(0, ...Object.values(own)) + 1;
  const out = new Map<string, number>();
  for (const key of keys) {
    if (own[key] === undefined) own[key] = next++;
    out.set(key, own[key]);
  }
  return out;
}

/**
 * Seed a ledger from what an older `variants.json` recorded, once: its picks
 * were the only place a number lived before this file existed, and the numbers
 * already on disk must not be renumbered by the tool that now protects them.
 */
export function seedFromPicks(
  ledger: Ledger,
  recipeId: string,
  picks: readonly { seed: string | number; theme: number; fromBar: number; n: number }[] | undefined,
  bars: number,
): void {
  if (!picks) return;
  const own = ledger.numbers[recipeId] || (ledger.numbers[recipeId] = {});
  for (const p of picks) {
    const key = musicKey(p.seed, p.theme, p.fromBar, bars);
    if (own[key] === undefined) own[key] = p.n;
  }
}
