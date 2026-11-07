// **The plan's read of the highs** (round hat-floor, 11-03; his ear on Drive - Eli's Ignition: *"hats clearly have an
// issue in Ignition, even the snare is louder than the hat there"*). How much each part of a groove puts above 3 kHz, off
// the plan alone: every note's energy, K-weighted and above 3 kHz, from the engine's measured table of the voices' tops
// (`@deep-house/engine/voices/tops`, each voice alone across its register, its lengths and velocities, and the rooms
// Spark, Gleam and Zephyr make), at the note's own gain and the room's lane level. No render and no meter: the floor
// under the hats (`set-plan.ts` `hatFloor`) reads the kit's hats against the rest in that band with it.
//
// Nothing here knows a genre: a note is read by its voice, its pitch, its length and its velocity, a room by its birds.

import TOPS from '@deep-house/engine/voices/tops' with { type: 'json' };
import { VOICE_BUS, strikes, edgeReads } from '@deep-house/engine/voices';
import { duckShape } from '@deep-house/engine/program';
import type { Settings } from '@deep-house/engine/settings';

export interface TopsEntry {
  ref: { midi: number | null; dur: number | null; vel: number };
  /** (midi, k, hi) across the register, at `ref`'s length and velocity, in the house's room */
  reg: Array<[number | null, number, number]>;
  /** (length, k, hi) against `ref` */
  dur?: Array<[number, number, number]>;
  /** (velocity, k, hi) against `ref` */
  vel: Array<[number, number, number]>;
  /** each bird's move at nought and at one against the house's room: (k, hi) */
  birds?: Partial<Record<'spark' | 'gleam' | 'zephyr', [[number, number], [number, number]]>>;
  /** (the melodic and keys buses) the harmonic edge's move by the note's blend: (blend, k, hi) */
  edge?: Array<[number, number, number]>;
  /** the theme's seasoning of the voice (`track.knobs`): (value, k, hi) at the knob's ends and its default */
  knobs?: Record<string, Array<[number, number, number]>>;
  layer?: string;
  /** the share of the top's power over 6 kHz */
  over6?: number;
}
export interface TopsTable { voices: Record<string, TopsEntry>; measured: { house: Record<'spark' | 'gleam' | 'zephyr', number> } }
export const TOPS_TABLE = TOPS as unknown as TopsTable;

/** The key a note is tabled by: its voice, or its voice and the timbre or preset it names (the pad's strings, the keys' rhodes). */
export const topsKeyOf = (e: { voice: string; p?: Record<string, unknown> }): string => {
  const n = e.p?.timbre ?? e.p?.preset;
  return typeof n === 'string' && n !== e.voice ? `${e.voice}|${n}` : e.voice;
};

/** Piecewise-linear through (x, a, b) rows, held flat past the ends. */
function lerp(rows: ReadonlyArray<readonly [number, number, number]>, x: number): [number, number] {
  if (!rows.length) return [0, 0];
  if (x <= rows[0][0]) return [rows[0][1], rows[0][2]];
  for (let i = 1; i < rows.length; i++) {
    if (x <= rows[i][0]) { const u = (x - rows[i - 1][0]) / Math.max(1e-9, rows[i][0] - rows[i - 1][0]); return [rows[i - 1][1] + u * (rows[i][1] - rows[i - 1][1]), rows[i - 1][2] + u * (rows[i][2] - rows[i - 1][2])]; }
  }
  const l = rows[rows.length - 1];
  return [l[1], l[2]];
}

/**
 * **The drum bus's hits in the mix, against each alone** (dB): the table's snares, claps and hand percussion are each
 * rendered alone, quiet; in a groove they meet the theme's glue, its drum clip and its limiter at their loudest. MEASURED
 * (round hat-floor, 11-03): the read of the rest's top against renders of 61 grooves (21 featured, 40 house-pace links
 * of random spells, 163 sections) leaves it 2.8 dB hot where the drums carry the rest's top and 0.3 cool where they do
 * not; 3 dB off the drum bus's hits takes the error's median from 1.8 to 1.3 dB.
 */
export const TOPS_DRUMS_DB = -3;

/**
 * **The hat ceiling's read of a kit hat, on the table's scale** (dB): the ceiling's units are fitted to its own read
 * against the mix, and stand under a hat's level rendered alone by this much. MEASURED (round hat-floor, 11-03): the
 * median over the same 163 sections, the hats rendered alone (0.8 dB median spread about it, 1.9 at the 90th percentile;
 * the table's own hats spread 0.8 and 5.0, the ladder hats' ring the room sets being the ceiling read's and not the
 * table's).
 */
export const TOPS_HAT_READ_DB = 7.65;

/** The bars of each groove the read takes: its first eight, where the renders it was checked against were read. */
export const TOPS_BARS = 8;

export type TopsBirds = Partial<Record<'spark' | 'gleam' | 'zephyr', number>>;

/**
 * **One note's energy, K-weighted and above 3 kHz** (dB, at unit gain, before the room's lane level), from its voice's row:
 * the register at its pitch, the step its length and velocity take, the birds' moves. A note longer than the longest
 * probed holds the energy rate of its last probed step (a held voice keeps sounding; a struck one has decayed and
 * the step says so). Null where the table has no row for it.
 */
export function noteTops(e: { voice: string; p?: Record<string, unknown> }, birds: TopsBirds = {}, T: TopsTable = TOPS_TABLE, knobs?: Record<string, number> | null, edge = 0.25): { k: number; hi: number } | null {
  const E = T.voices[topsKeyOf(e)] ?? T.voices[e.voice];
  if (!E) return null;
  const midi = Number(e.p?.midi);
  const reg = E.reg.filter((r): r is [number, number, number] => r[0] != null);
  let [k, hi] = reg.length && Number.isFinite(midi) ? lerp(reg, midi) : [E.reg[0][1], E.reg[0][2]];
  const vel = Number(e.p?.vel ?? 1);
  const [vk, vh] = lerp(E.vel.map((r) => [20 * Math.log10(Math.max(1e-3, r[0])), r[1], r[2]] as [number, number, number]), 20 * Math.log10(Math.max(1e-3, vel)));
  // past the softest probe, the voice is taken as linear in velocity
  const soft = E.vel[0]?.[0] ?? 1, under = vel < soft ? 20 * Math.log10(Math.max(1e-3, vel / soft)) : 0;
  k += vk + under; hi += vh + under;
  const dur = Number(e.p?.dur);
  if (E.dur && E.dur.length && Number.isFinite(dur) && dur > 0) {
    const [dk, dh] = lerp(E.dur, dur);
    k += dk; hi += dh;
    const top = E.dur[E.dur.length - 1];
    if (dur > top[0] && E.dur.length > 1) {
      // the rate of the last step, in energy per second of note, carried on past it (never more than a held note's)
      const prev = E.dur[E.dur.length - 2];
      const slope = (a: number, b: number) => Math.max(0, Math.min(1, (b - a) / Math.max(1e-6, 10 * Math.log10(top[0] / Math.max(1e-6, prev[0])))));
      const lk = slope(prev[1], top[1]), lh = slope(prev[2], top[2]);
      const over = 10 * Math.log10(dur / top[0]);
      k += lk * over; hi += lh * over;
    }
  }
  if (E.knobs && knobs) for (const [n, rows] of Object.entries(E.knobs)) {
    const x = knobs[n];
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    const [dk, dh] = lerp(rows, x);
    k += dk; hi += dh;
  }
  if (E.edge) { const [ek, eh] = lerp(E.edge, edge); k += ek; hi += eh; }
  const H = T.measured.house;
  for (const b of ['spark', 'gleam', 'zephyr'] as const) {
    const m = E.birds?.[b], x = birds[b];
    if (!m || x == null || !Number.isFinite(x)) continue;
    const h = H[b];
    const [end, u] = x < h ? [m[0], (h - x) / Math.max(1e-6, h)] : [m[1], (x - h) / Math.max(1e-6, 1 - h)];
    k += end[0] * u; hi += end[1] * u;
  }
  return { k, hi };
}

export interface TopsReadEvent { t: number; voice: string; p: Record<string, unknown>; layer?: string; by?: unknown }

type Pt = { t: number; value: number };
/** A line's value at `t`, straight between its points, held past its ends. */
export function lineAt(points: readonly Pt[] | null | undefined, t: number, none: number): number {
  if (!points || !points.length) return none;
  if (t <= points[0].t) return points[0].value;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (t < b.t) return b.t > a.t ? a.value + ((t - a.t) / (b.t - a.t)) * (b.value - a.value) : b.value;
  }
  return points[points.length - 1].value;
}

/**
 * **How much of a note's top a low-pass at `hz` lets through** (the engine's biquads, Q 0.707, as power; dB against the
 * filter wide open): the band in two halves, 3 to 6 kHz and over 6, each at its middle, by the share of the voice's top
 * over 6 kHz (`over6`, the table's: a hat's top lies high, a pad's low).
 */
export function lpTopDb(hz: number, over6 = 0.35): number {
  const H = (f: number, fc: number) => 1 / (1 + Math.pow(f / Math.max(20, fc), 4));
  const at = (fc: number) => (1 - over6) * H(4200, fc) + over6 * H(9500, fc);
  return 10 * Math.log10(Math.max(1e-6, at(hz) / at(20000)));
}

/** The energy a note's own gain path keeps over its length (power, one where it has none): `gainPath` is [t, gain, t, gain...]. */
export function pathEnergy(p: Record<string, unknown>): number {
  const g = p.gainPath, dur = Number(p.dur);
  if (!Array.isArray(g) || g.length < 4 || !(dur > 0)) return 1;
  let e = 0;
  for (let i = 2; i + 1 < g.length; i += 2) {
    const t0 = Number(g[i - 2]), a = Number(g[i - 1]), t1 = Math.min(dur, Number(g[i])), b = Number(g[i + 1]);
    if (!(t1 > t0)) continue;
    e += ((t1 - t0) * (a * a + a * b + b * b)) / 3;
  }
  const last = Number(g[g.length - 2]);
  if (last < dur) e += (dur - last) * Math.pow(Number(g[g.length - 1]), 2);
  return Math.max(0, e / dur);
}

/** The lines a theme's mix moves the top with, as the plan holds them (`track.automation`). */
export interface TopsLines {
  macroFilter?: readonly Pt[];
  melodicGain?: readonly Pt[];
  sweep?: { lp?: { cutoff?: readonly Pt[]; wet?: readonly Pt[] } } | null;
  tops?: { layers?: readonly string[]; lp?: { cutoff?: readonly Pt[]; wet?: readonly Pt[] } | null; shelf?: readonly Pt[] | null } | null;
}

/**
 * **What the mix's own lines do to a note's top at `t`** (dB, K and above 3 kHz): the macro low-pass over all but the
 * kick and the sub, the melodic bus's gain and its sweep's low-pass, and for the layers on the tops bus its low-pass and
 * its shelf, each against the line wide open.
 */
export function linesDb(e: TopsReadEvent, t: number, L: TopsLines | null | undefined, T: TopsTable = TOPS_TABLE): { k: number; hi: number } {
  if (!L) return { k: 0, hi: 0 };
  const bus = VOICE_BUS[e.voice];
  const o6 = (T.voices[topsKeyOf(e)] ?? T.voices[e.voice])?.over6 ?? 0.35;
  const lpTop = (hz: number) => lpTopDb(hz, o6);
  let k = 0, hi = 0;
  if (bus !== 'kick' && bus !== 'sub') hi += lpTop(lineAt(L.macroFilter, t, 20000)) - lpTop(15000);
  if (bus === 'melodic' || bus === 'keys') {
    const g = 20 * Math.log10(Math.max(1e-4, lineAt(L.melodicGain, t, 1)));
    k += g; hi += g;
    const w = Math.max(0, Math.min(1, lineAt(L.sweep?.lp?.wet, t, 0)));
    if (w > 0) hi += 10 * Math.log10(Math.max(1e-6, (1 - w) * (1 - w) + w * w * Math.pow(10, lpTop(lineAt(L.sweep?.lp?.cutoff, t, 20000)) / 10)));
  }
  const B = L.tops;
  if (B && e.layer && B.layers?.includes(e.layer)) {
    const w = Math.max(0, Math.min(1, lineAt(B.lp?.wet, t, 0)));
    if (w > 0) hi += 10 * Math.log10(Math.max(1e-6, (1 - w) * (1 - w) + w * w * Math.pow(10, lpTop(lineAt(B.lp?.cutoff, t, 20000)) / 10)));
    // the shelf sits at 8 kHz: about half the band's energy lies over it
    if (Array.isArray(B.shelf) && B.shelf.length) { const s = lineAt(B.shelf, t, 0); hi += 10 * Math.log10(1 - o6 + o6 * Math.pow(10, s / 10)); }
  }
  return { k, hi };
}

/** The harmonic edge's blend a note goes through: the room's (nought where it has none), nought where the room names the note clean (`edgeReads`). */
export const edgeBlend = (e: { voice: string; p?: Record<string, unknown> }, settings: Settings): number => {
  const b = Number((settings as { harmonicEdge?: { blend?: number } | null }).harmonicEdge?.blend ?? 0);
  return b > 0 && edgeReads(e.voice, e.p as never, settings) ? b : 0;
};

/** The sidechain's mean power over one beat, per line the kick ducks (dB, nought or less): the held melodic bus (`duck`), the sub (`duckLow`) and the struck notes (`struckDuck`). */
export function duckLossDb(settings: Settings, beat: number): Record<'duck' | 'duckLow' | 'struckDuck', number> {
  const shape = duckShape(settings, beat);
  const out = { duck: 0, duckLow: 0, struckDuck: 0 };
  for (const name of ['duck', 'duckLow', 'struckDuck'] as const) {
    const pts = shape.filter((d) => d.p === `${name}.gain`).map((d) => [Math.max(0, d.dt), d.v] as [number, number]).sort((a, b) => a[0] - b[0]);
    if (!pts.length) continue;
    let e = 0, t = 0, v = 1;
    for (const [tt, vv] of pts) { const z = Math.min(beat, tt); if (z > t) { const w = v + ((vv - v) * (z - t)) / Math.max(1e-9, tt - t); e += ((z - t) * (v * v + v * w + w * w)) / 3; } t = Math.max(t, Math.min(beat, tt)); v = vv; if (tt >= beat) break; }
    if (t < beat) e += (beat - t) * v * v;
    out[name] = 10 * Math.log10(Math.max(1e-6, e / beat));
  }
  return out;
}

/**
 * **What a set of notes puts out over a stretch, K-weighted and above 3 kHz** (dB of mean power over the stretch, at the
 * theme's own scale before its trim): each note's energy (`noteTops`) at its gain, its own gain path and its room's lane
 * level (`levelDb`), through the mix's lines where the plan holds them (`linesDb`), the share of a held note that sounds
 * inside the stretch. Null where no note sounds there.
 */
export function topsOver(I: {
  events: readonly TopsReadEvent[]; from: number; to: number; levelDb: (e: TopsReadEvent) => number;
  pick: (e: TopsReadEvent) => boolean; birds?: TopsBirds; table?: TopsTable; lines?: TopsLines | null;
  /** the theme's seasoning per voice (`track.knobs`) */
  knobs?: Record<string, Record<string, number>> | null;
  /** a note's energy read another way (dB, K-weighted, at its gain and level: the kit's hats by the hat ceiling's read), its top then the table's tilt over it; null, the table's own */
  hitOf?: (e: TopsReadEvent) => number | null;
  /** the drum bus's hits (not the kit's hats) under the theme's glue, clip and limiter, in dB (MEASURED: the rest's top read against renders) */
  drumsDb?: number;
  /** the harmonic edge's blend a note goes through (`edgeBlend`); absent, the house's */
  edgeOf?: (e: TopsReadEvent) => number;
  /** the kick's duck over a beat (`duckLossDb`), and the beat; taken where the kick plays, by how many beats it plays on */
  duck?: { loss: Record<'duck' | 'duckLow' | 'struckDuck', number>; beat: number } | null;
}): { k: number; hi: number } | null {
  let pk = 0, ph = 0;
  const secs = I.to - I.from;
  if (!(secs > 0)) return null;
  // the share of the stretch's beats a kick lands on, and the duck each line takes at that share
  let kicks = 0;
  if (I.duck) for (const e of I.events) if (VOICE_BUS[e.voice] === 'kick' && e.t >= I.from && e.t < I.to) kicks++;
  const share = I.duck ? Math.min(1, kicks / Math.max(1, secs / I.duck.beat)) : 0;
  const duckDb = (l: 'duck' | 'duckLow' | 'struckDuck') => (share > 0 ? 10 * Math.log10(1 - share + share * Math.pow(10, I.duck!.loss[l] / 10)) : 0);
  const D = { duck: duckDb('duck'), duckLow: duckDb('duckLow'), struckDuck: duckDb('struckDuck') };
  for (const e of I.events) {
    if (!I.pick(e)) continue;
    const dur = Number(e.p?.dur);
    const len = (Number.isFinite(dur) && dur > 0 ? dur : 0) + 0.3;
    const a = Math.max(I.from, e.t), z = Math.min(I.to, e.t + len);
    const inside = e.t >= I.from && e.t < I.to;
    if (z <= a && !inside) continue;
    const part = len > 0.31 ? Math.max(0, z - a) / len : (inside ? 1 : 0);
    if (!(part > 0)) continue;
    let n = noteTops(e, I.birds, I.table, I.knobs?.[e.voice], I.edgeOf ? I.edgeOf(e) : 0.25);
    if (!n) continue;
    const hit = I.hitOf ? I.hitOf(e) : null;
    const m = linesDb(e, (a + Math.max(a, z)) / 2, I.lines, I.table);
    const bus = VOICE_BUS[e.voice];
    const duck = bus === 'sub' ? D.duckLow : bus === 'melodic' || bus === 'keys' ? (strikes(e.voice, e.p as never) ? D.struckDuck : D.duck) : 0;
    let g = 20 * Math.log10(Math.max(1e-6, Number(e.p?.gain ?? 1))) + I.levelDb(e) + 10 * Math.log10(Math.max(1e-6, pathEnergy(e.p ?? {}))) + duck;
    if (hit != null) { n = { k: 0, hi: n.hi - n.k }; g = hit; }
    else if (bus === 'drums' && I.drumsDb && !/^hat/.test(e.voice) && e.voice !== 'ride') g += I.drumsDb;
    // what the lines take off the top they take off the note's K-weighted level by the top's share of it
    const share = Math.min(1, Math.pow(10, (n.hi - n.k) / 10));
    const topK = m.hi - m.k !== 0 ? 10 * Math.log10(Math.max(1e-6, 1 - share + share * Math.pow(10, (m.hi - m.k) / 10))) : 0;
    pk += part * Math.pow(10, (n.k + g + m.k + topK) / 10);
    ph += part * Math.pow(10, (n.hi + g + m.hi) / 10);
  }
  if (!(pk > 0)) return null;
  return { k: 10 * Math.log10(pk / secs), hi: ph > 0 ? 10 * Math.log10(ph / secs) : -150 };
}
