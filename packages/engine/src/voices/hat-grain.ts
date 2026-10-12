// **The hats' grain** (round SPARK-2, `notes/rounds/spark-2.md`): what the
// references' struck tops have and ours did not, read off the catalogue's deep
// house chunks event by event (HPSS, onsets in the percussive part) against
// each of our hats rendered alone. Not the lid and not the level — the
// spectrum's shape over 2-16 kHz already sits at the references' median — but
// three things the shape does not show:
//
//   top     metal above 8 kHz. The references' hats read 0.33 of spectral
//           flatness at 8-12 kHz (partials standing out of the noise) where
//           ours read 0.52-0.58: smooth noise up there, the six squares' metal
//           all under it. A second ladder of partials, the record's own ratios
//           4.5 times up and floored at 7.5 kHz, takes `top` of the power over
//           the floor from the noise (`topLevel`, `swapDb`).
//   air     the noise let past the lid: two high-passes at `airHz`, a
//           low-pass at 16 kHz, at `air` of the noise's level. Baked into the
//           rendered noise, so a hit is the nodes it was.
//   tail    the choke. A hat here falls 10 dB in `t10` and then dives to
//           silence at nearly three times that slope, so -20 dB comes at 1.34
//           of `t10`; the references' closed hats fall on at the same slope
//           (their -20 dB at 1.9-2.0 of their -10, every band alike). `tail`
//           from 0 (the record's choke) to 1 (one slope to -20 dB, at twice
//           `t10`), then the record's dive — on the short hats only (`tailFor`).
//   beads   a shaker is grains, not a hiss: `beads` of the noise is a sparse
//           train of sub-millisecond clicks at `BEAD_HZ` a second, the same
//           power as the noise it replaces.
//
// Every one of them is nought in every row and every table, and nought builds
// nothing: a theme no place writes them for plays the graph it always played.
// And none of them is a level: a grained hit is played at the energy of the
// same hit without its grain (`makeUp`, below).

import { lcg } from '../dsp.ts';

/** The upper ladder: the record's six ratios, this many times up the hat's base. */
export const TOP_RATIO = 4.5;
/** The air's ceiling: what a 16 kHz top is, and where the references' own top stops. */
export const AIR_TOP_HZ = 16000;
/** The record's -20 dB point, as a multiple of `t10`: -10 dB at t10, then 70 dB over 2.4 t10. */
export const CHOKE_T20 = 1 + 2.4 * (10 / 70);
/** A shaker's grains a second, and how long one rings. */
export const BEAD_HZ = 900;
const BEAD_SECONDS = 0.00025;

/**
 * The tail a hat of this ring takes. The references' **closed** hats (their
 * -10 dB inside 60 ms: 1481 of 2198) fall on at one slope to -20 dB, at 1.9-2.0
 * of their -10 dB; their **longer** hats choke as ours do (1.1-1.5). So the
 * whole tail where a hat falls 10 dB in 40 ms or less, none from 80 ms, a
 * straight line between — the sub room's closed hat (85 ms) takes none, and
 * measured with it the phone lost two to three points of its mid onsets.
 */
export function tailFor(tail: number, t10: number): number {
  return tail > 0 ? tail * Math.max(0, Math.min(1, (0.08 - t10) / 0.04)) : 0;
}

/** Where -20 dB falls, as a multiple of `t10`, for a `tail` of 0 to 1. */
export const t20Of = (tail: number): number => CHOKE_T20 + (2 - CHOKE_T20) * Math.max(0, Math.min(1, tail));

/**
 * The envelope after the attack: -10 dB at `t10`, -20 at `t20Of(tail)·t10`,
 * then the record's dive to the floor (70 dB per 2.4 t10). Returns the instant
 * the floor is reached. With `tail` nought it is the record's two ramps exactly.
 */
export function tailRamps(param: AudioParam, time: number, peak: number, t10: number, tail: number, floor: number): number {
  param.exponentialRampToValueAtTime(peak * 0.3162, time + t10);
  if (!(tail > 0)) {
    param.exponentialRampToValueAtTime(floor, time + t10 * 3.4);
    return time + t10 * 3.4;
  }
  const t20 = t20Of(tail);
  param.exponentialRampToValueAtTime(peak * 0.1, time + t10 * t20);
  // from -20 dB to the floor at the record's own slope (70 dB per 2.4 t10)
  const rest = (2.4 / 70) * Math.max(0, 20 * Math.log10((peak * 0.1) / floor));
  param.exponentialRampToValueAtTime(floor, time + t10 * (t20 + rest));
  return time + t10 * (t20 + rest);
}

/** How long a hit rings, in multiples of `t10`, for a `tail`: 3.4 at the record's. */
export function ringOf(tail: number, peak = 1, floor = 1e-4): number {
  if (!(tail > 0)) return 3.4;
  return t20Of(tail) + (2.4 / 70) * Math.max(0, 20 * Math.log10((peak * 0.1) / floor));
}

/** Where the upper ladder starts: two high-passes, so its metal is the top's and not 4-8 kHz's. */
export const TOP_FLOOR_HZ = 7500;

/**
 * The upper ladder: six partials at the record's ratios, `TOP_RATIO` times up,
 * past two high-passes at `TOP_FLOOR_HZ`, into `dest` at `level` of a ladder.
 * MEASURED without the floor (seed 1 theme two's closed hat, the ladder as
 * loud as the record's): 8-12 kHz flatness 0.52 -> 0.38, the references' 0.33,
 * but 4-6 kHz 0.55 -> 0.38 too and the hat 1.7 dB louder — its fundamentals
 * sat at 4-8 kHz. Above the floor only its partials over 7.5 kHz are left.
 */
export function topLadder(ctx: BaseAudioContext, ratios: readonly number[], base: number, detune: number, level: number,
  dest: AudioNode, at: number, seconds: number): void {
  const bus = ctx.createGain();
  bus.gain.value = level / ratios.length;
  const a = ctx.createBiquadFilter();
  a.type = 'highpass'; a.frequency.value = TOP_FLOOR_HZ; a.Q.value = 0.707;
  const b = ctx.createBiquadFilter();
  b.type = 'highpass'; b.frequency.value = TOP_FLOOR_HZ; b.Q.value = 0.707;
  bus.connect(a); a.connect(b);
  for (let i = 0; i < ratios.length; i++) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const hz = Math.min(ctx.sampleRate * 0.45, base * TOP_RATIO * ratios[i]);
    o.frequency.value = hz;
    o.detune.value = detune * (i % 2 ? 1 : -1);
    o.connect(bus);
    // Each square from its own phase (a start a golden fraction of its period
    // late): six squares from phase zero line up into one spike on every
    // strike, measured +0.46 dB of true peak on the mix where the tight hat
    // played — a crest the record's own ladder has and its top need not.
    o.start(at + ((i * 0.618034) % 1) / hz);
    o.stop(at + seconds);
  }
  b.connect(dest);
}

/**
 * **The metal takes the noise's place, not a place on top of it.** Measured
 * (each hat alone, the ladder as loud as the record's): over the floor it
 * adds about `k·(metal/(1-metal))²` of the noise's own power up there — 1.0 on
 * the sub room's closed hat (metal .45), 1.95 on the tight kit hat (.6) — so
 * a ladder with nothing taken away is a louder hat (+1.4 and +3.3 dB). So
 * `top` is the **share of the hat's power over 7.5 kHz that is metal**: the
 * ladder is set to bring that share and the noise is shelved down over the
 * same floor by as much, so the power up there is the power it was and only
 * its grain changes. Half (`top` 0.5) reads the references' flatness at
 * 8-12 kHz on every hat measured (0.33-0.34 against their 0.33).
 */
export const SWAP_K = Object.freeze({ ladder: 1.5, kit: 0.87 });
const ratio2 = (metal: number): number => { const m = Math.min(0.95, Math.max(0.05, metal)); return (m / (1 - m)) ** 2; };
/** The upper ladder's level, against the record's ladder, that brings `top` of the power over the floor. */
export function topLevel(top: number, metal: number, k: number): number {
  return top > 0 ? Math.min(4, Math.sqrt(Math.min(0.9, top) / (k * ratio2(metal)))) : 0;
}
/** The noise's shelf over `TOP_FLOOR_HZ`, in dB: what is left of it when `top` of the power up there is metal. */
export function swapDb(top: number): number {
  return top > 0 ? 10 * Math.log10(1 - Math.min(0.9, top)) : 0;
}
/** The shelf itself: a high shelf at the ladder's floor, `db` down. */
export function swapShelf(ctx: BaseAudioContext, db: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'highshelf'; f.frequency.value = TOP_FLOOR_HZ; f.gain.value = db;
  return f;
}

/**
 * The air: `source` past two high-passes at `airHz` and a 16 kHz top, into
 * `dest` at `level`. The source must be noise of its own, not the hat's: the
 * same noise through these filters beside the hat's lid sums out of phase
 * above 8 kHz and takes the top away (measured: -1.6 dB at 8-12 kHz where it
 * was meant to add).
 */
export function airPath(ctx: BaseAudioContext, source: AudioNode, airHz: number, level: number, dest: AudioNode): void {
  const a = ctx.createBiquadFilter();
  a.type = 'highpass'; a.frequency.value = airHz; a.Q.value = 0.707;
  const b = ctx.createBiquadFilter();
  b.type = 'highpass'; b.frequency.value = airHz; b.Q.value = 0.707;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass'; top.frequency.value = Math.min(AIR_TOP_HZ, ctx.sampleRate * 0.45); top.Q.value = 0.707;
  const g = ctx.createGain();
  g.gain.value = level;
  source.connect(a); a.connect(b); b.connect(top); top.connect(g); g.connect(dest);
}

/**
 * Noise as beads: `beads` of the power a train of clicks (each a quarter
 * millisecond of decaying noise, `BEAD_HZ` a second at random), the rest the
 * noise it was handed — the same power either way, so the shaker's level is
 * the level it had. Deterministic, as the noise is.
 */
export function beadNoise(ctx: BaseAudioContext, noise: AudioBuffer, beads: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const out = ctx.createBuffer(noise.numberOfChannels, noise.length, sr);
  const b = Math.max(0, Math.min(1, beads));
  const tau = BEAD_SECONDS * sr;
  const span = Math.ceil(tau * 6);
  for (let c = 0; c < noise.numberOfChannels; c++) {
    const src = noise.getChannelData(c);
    const rnd = lcg(4242 + c * 977);
    const train = new Float32Array(noise.length);
    const p = BEAD_HZ / sr;
    for (let i = 0; i < noise.length; i++) {
      if ((rnd() + 1) / 2 >= p) continue;
      const amp = 0.4 + 0.6 * (rnd() + 1) / 2;
      for (let k = 0; k < span && i + k < noise.length; k++) train[i + k] += amp * Math.exp(-k / tau) * rnd();
    }
    let pn = 0, pt = 0;
    for (let i = 0; i < noise.length; i++) { pn += src[i] * src[i]; pt += train[i] * train[i]; }
    const kt = pt > 0 ? Math.sqrt(pn / pt) : 0;
    const dst = out.getChannelData(c);
    const wn = Math.sqrt(1 - b), wt = Math.sqrt(b) * kt;
    for (let i = 0; i < noise.length; i++) dst[i] = wn * src[i] + wt * train[i];
  }
  return out;
}

// --- the level held ----------------------------------------------------------
//
// The grain is a change of grain and not of level (the "only hats" rule of
// 09-24: on a phone the hats were all that was left, and their 4-8 kHz already
// sat at the references'). So a hit with a grain is played at the energy the
// same hit without one had: the rendered sources' power (the metal and the
// noise, or a kit hat's body, each measured once) times the envelope's energy,
// against the same of the grainless render, and the hit's peak is moved by the
// square root of the ratio. Measured before it, the top alone put +0.2 to
// +0.35 dB on the hats in the mix and the tail +0.1 to +0.17.

const msCache = new WeakMap<AudioBuffer, number>();
/** A rendered buffer's mean square over its channels, once. */
export function meanSquare(b: AudioBuffer): number {
  let v = msCache.get(b);
  if (v === undefined) {
    let s = 0, n = 0;
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      n += d.length;
    }
    v = n ? s / n : 0;
    msCache.set(b, v);
  }
  return v;
}

/** ∫ g² over an exponential fall from `a` to `b` in `T` seconds. */
const expEnergy = (a: number, b: number, T: number): number => (a > b && b > 0 ? (T * (a * a - b * b)) / (2 * Math.log(a / b)) : 0);
/** The energy of one hit's envelope at unit peak: the linear attack, -10 dB at `t10`, the tail, the dive to the floor. */
export function envelopeEnergy(t10: number, tail: number, attack: number, floor = 2e-4): number {
  let e = attack / 3 + expEnergy(1, 0.3162, Math.max(1e-4, t10 - attack));
  if (!(tail > 0)) return e + expEnergy(0.3162, floor, t10 * 2.4);
  const t20 = t20Of(tail);
  const rest = (2.4 / 70) * 20 * Math.log10(0.1 / floor);
  return e + expEnergy(0.3162, 0.1, t10 * (t20 - 1)) + expEnergy(0.1, floor, t10 * rest);
}

/** The gain that plays a grained hit at its grainless energy: sources' power and envelopes, before over after. */
export function makeUp(plainPower: number, grainPower: number, t10: number, tail: number, attack: number): number {
  const e0 = plainPower * envelopeEnergy(t10, 0, attack);
  const e1 = grainPower * envelopeEnergy(t10, tail, attack);
  return e0 > 0 && e1 > 0 ? Math.sqrt(e0 / e1) : 1;
}
