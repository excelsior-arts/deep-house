// Seeded randomness. A seed reproduces a track exactly, so the same number
// typed tomorrow is the same four minutes of music.

export function hashSeed(input) {
  const str = String(input);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function mulberry32(a) {
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
  constructor(seed) {
    this.seed = seed;
    this.next = mulberry32(hashSeed(seed));
  }
  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    // inclusive of min, exclusive of max
    return Math.floor(this.float(min, max));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  // Pick from [{v, w}, ...] by weight.
  weighted(pairs) {
    let total = 0;
    for (const p of pairs) total += p.w;
    let r = this.next() * total;
    for (const p of pairs) {
      r -= p.w;
      if (r <= 0) return p.v;
    }
    return pairs[pairs.length - 1].v;
  }
  // A child stream, so adding a layer later does not reshuffle the layers
  // that were generated before it.
  fork(tag) {
    return new Rng(`${this.seed}::${tag}`);
  }
}

export default Rng;
