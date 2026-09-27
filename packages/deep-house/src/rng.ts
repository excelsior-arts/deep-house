// Seeded randomness. A seed reproduces a track exactly, so the same number
// typed tomorrow is the same four minutes of music.

// What a weighted entry is, is the machine's contract and not this file's:
// `style.ts` states it in the engine and says so in as many words — "the shape
// `Rng.weighted` reads" — so the shape is named from there rather than written
// out a second time here.
import type { Weighted } from '@deep-house/engine/style';

/** What a stream may be seeded with: anything `String()` reads the same way twice. */
export type Seed = string | number;

export function hashSeed(input: Seed): number {
  const str = String(input);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  // `declare` and not a plain field declaration, because this file is the
  // record: a field written `seed: Seed;` is still a field once the types are
  // stripped, and it would define `seed` and `next` as undefined before the
  // constructor body runs. Nothing here would notice, but the emitted class
  // would no longer be the one the digests were blessed against. `declare`
  // erases to nothing, so the JavaScript that draws the numbers is unchanged.
  declare seed: Seed;
  declare next: () => number;
  constructor(seed: Seed) {
    this.seed = seed;
    this.next = mulberry32(hashSeed(seed));
  }
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    // inclusive of min, exclusive of max
    return Math.floor(this.float(min, max));
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  // Pick from [{v, w}, ...] by weight.
  weighted<T>(pairs: ReadonlyArray<Weighted<T>>): T {
    let total = 0;
    for (const p of pairs) total += p.w;
    let r = this.next() * total;
    for (const p of pairs) {
      r -= p.w;
      if (r <= 0) return p.v;
    }
    return pairs[pairs.length - 1].v;
  }
  // Pick from a plain list by weight, where the equal-weight case is `pick`
  // itself.
  //
  // `pick` and `weighted` disagree, and the disagreement is exact rather than
  // statistical. `pick` is `floor(u * n)`, which is n half-open intervals
  // `[k/n, (k+1)/n)`; `weighted` subtracts until `r <= 0`, which closes the
  // interval at the *top* and hands a boundary to the entry before it. Over
  // two equal entries, `u = 0.5` is therefore the second for `pick` and the
  // first for `weighted`, and an entry of weight 0 sits at the front of
  // `weighted`'s ladder and catches `u = 0` outright. So converting a legacy
  // `pick` to `weighted` is not free: it moves two seeds in every list.
  //
  // This is the sampler those conversions can go through instead. Two rules,
  // and they are the whole of it:
  //
  //   Zero weights are dropped before anything is drawn. An entry that is not
  //   in the running is not in the list, so it cannot catch a boundary value,
  //   and a catalogue may carry a disabled entry without moving a seed.
  //
  //   Every interval is half-open at the top, `[lo, hi)`, which is `pick`'s
  //   own rule. And the equal-weight case is not *derived* to be `pick` — a
  //   cumulative sum of equal weights is not exactly `k/n` in floating point —
  //   it *is* `pick`: the expression below is `Math.floor(u * n)`, written
  //   once here and once in `pick`, so the two agree bit for bit at every
  //   boundary rather than agreeing on a sweep that missed them.
  //
  // One draw from the stream, exactly like `pick`, so a call can be swapped
  // for a call without reshuffling anything behind it. `weightOf` is given the
  // entry and its index in the original list; an empty list, or one in which
  // nothing has a positive weight, returns `undefined` — which is what
  // `pick([])` does.
  pickWeighted<T>(list: readonly T[], weightOf: (entry: T, index: number) => number = () => 1): T | undefined {
    const live: T[] = [];
    const weights: number[] = [];
    let total = 0;
    let equal = true;
    for (let i = 0; i < list.length; i++) {
      const w = weightOf(list[i], i);
      // `> 0` and not `!== 0`: a negative weight, a NaN and an undefined one
      // are all "not in the running" rather than a hole in the ladder.
      if (!(w > 0)) continue;
      if (weights.length && w !== weights[0]) equal = false;
      live.push(list[i]);
      weights.push(w);
      total += w;
    }
    const n = live.length;
    if (!n) return undefined;
    const u = this.next();
    if (equal) return live[Math.floor(u * n)];
    // Unequal: the same half-open intervals, scaled by weight. The cumulative
    // sum is walked from the bottom, and the last entry catches whatever the
    // arithmetic leaves over, so a `u` a bit-width under 1 can never fall off
    // the end of the ladder.
    const x = u * total;
    let hi = 0;
    for (let i = 0; i < n - 1; i++) {
      hi += weights[i];
      if (x < hi) return live[i];
    }
    return live[n - 1];
  }

  // A child stream, so adding a layer later does not reshuffle the layers
  // that were generated before it.
  fork(tag: Seed): Rng {
    return new Rng(`${this.seed}::${tag}`);
  }
}

export default Rng;
