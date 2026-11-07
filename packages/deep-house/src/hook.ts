// **The hook: chopped supersaw chords, placed as a producer places them** (round trance-1, 10-28; its riff and its arc
// round trance-2). His words: *"we are missing a single most important electronic music technique, which is trance style
// super saw"*; on round 2: *"we can't play repetitive trance supersaw throughout the whole segment … it's intense sound and
// should be used for max peak of the song"*; on the sketches built from source 10's measured chop: *"So we can adopt all
// of these"*; and the share: *"Getting 50-60% probably sounds right, because the peak only would be too sparse."*
//
// **The riff** is one of the five rows he picked (`recipes/arrangement/phrases.json`, `src/phrase.ts`): the gated
// chords, the gallop, and the gallop dark, bright and sparse. The birds choose among them about the tile's own mix (the
// hook entry's `picks`): Gleam down the dark gallop, Gleam up the bright one, the patient birds (Loom, Tide) the sparse
// one, the restless ones (Veil, Spark) the full gallop and the gated chords. A weighted draw off the seed's own stream.
//
// **The arc** is source 10's, measured: the saw plays in runs that cut in and out, grooves with no saw between them, each
// run ending in a few bars of the saw alone; the chop deepens run by run (its floor from a shallow tease to the peak's
// deep cut), the last run the longest, the peak. Where by the section's kind is the row's `arc`; the code names no place.
//
// **The pedal** (his experiment, *"one or two prolonged notes and this sequence of four chords laying over"*): a held
// synth pad on the key's tonic (and its fifth where it fits) under the runs, chosen by Loom and Tide. A background: it
// stands the row's `underDb` under the saw sounding over its hold, whichever voice it drew (trance-pad, his ear 10-28:
// *"the pad is too loud and dominates over the track (the saw is okay)"*; `pedalGainDb`, set last in the generator).
//
// **The voice's two ends** are the birds' too, written on every note: `light`, Gleam's upper part, pulls it bright;
// `edge`, Spark from the house's toward the broken kit's edge, drives it harder. Where the table reads the house, the
// row's zone about the house: a share that grows only as Pulse, Gleam or Spark rise past it, and the same arc. Every
// zone is `src/place-zone.ts`'s shape, widened by the reach dial as the library's band is. It needs a four-on-the-
// floor kit and the drums on. Pure: no DOM, no engine. Every draw is a stream of its own (`<seed>::hook…`).

import Rng, { type Seed } from './rng.ts';
import { BIRDS, HOUSE, type Bird, type Spell } from './spell.ts';
import type { HookEntry } from './places.ts';
import type { GrammarNeed } from './needs.ts';
import type { ZoneShape } from './place-zone.ts';
import { drawZone, type HouseZone, type TechniqueRead } from './technique.ts';
import FILE from '../recipes/arrangement/hook.json' with { type: 'json' };
import { phraseRowOf, type PhraseRow, type PhraseChord } from './phrase.ts';
import { buildChord, chordLabel, DEGREE_NAMES, type Chord } from './theory.ts';
import { arcOf, arcRuleOf, type ArcSection, type ArcState } from './arc.ts';

/** A hook row (`recipes/arrangement/hook.json`). */
export interface HookRow {
  id: string;
  voice: string;
  light: { from: number; full: number };
  edge: { from: number; full: number };
  /** the hook's zone about the house (`src/place-zone.ts`): its share growing along the birds it rises by */
  house: ZoneShape;
  picks: Array<{ row: string; by: Partial<Record<Bird, number>> }>;
  /** `underDb`: how far under the saw the pedal sounds; a voice's `db` its measured loudness holding the pedal against the saw's at the same written energy */
  pedal: { w: number; most: number; by: Partial<Record<Bird, number>>; voices: Array<{ v: string; w: number; db: number }>; tones: number[]; low: number; vel: number; underDb: number; restrikeBars: number };
  /** the arc rule the saw plays by (`recipes/arrangement/arcs.json`, `src/arc.ts`): its knobs `floorDb` (the chop's depth) and `levelDb` (the saw's level), dB */
  arc: string;
  /** what the theme must be (`src/needs.ts`): the drums on, the four-on-the-floor kit */
  needs?: readonly GrammarNeed[];
  room: { reverb: [number, number]; delay: [number, number]; lowHz?: number };
  /** the saw's level against its lane's, dB */
  levelDb?: number;
  /** the run's harmony: short loops of triads (beats, the key's scale degree), drawn by `w`; `bass` the bass's home under them */
  loops: HookLoop[];
}
export interface HookLoop { id: string; w: number; beats: Array<[number, number]>; bass: 'roots' | 'pedal' }
export const HOOK_ROWS: readonly HookRow[] = (FILE as unknown as { rows: HookRow[] }).rows;
/** A hook row by id: the file's first where none is named (the house's own place names none); null for an id the file does not have. */
export const hookRowOf = (id?: string | null): HookRow | null => (id == null ? HOOK_ROWS[0] : HOOK_ROWS.find((r) => r.id === id) ?? null);
/** The first row's voice, for a tool's sketch; a theme's hook plays its drawn row's (`HookPlan.row.voice`). */
export const HOOK_VOICE = HOOK_ROWS[0].voice;

export interface HookPlan {
  row: HookRow;
  entry: string;
  /** the riff's row, the birds' pick */
  pick: PhraseRow;
  /** the run's loop of chords (the hook owns the harmony in its runs) */
  loop: HookLoop;
  /** Gleam's upper part, 0..1 */
  light: number;
  /** Spark's edge, 0..1 */
  edge: number;
  /** the held synth pad under the runs, where the birds chose it */
  pedal: { voice: string } | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The voice's two ends at a spell, as the row maps Gleam and Spark. */
export function toneOf(spell: Spell, row: HookRow = HOOK_ROWS[0]): { light: number; edge: number } {
  return {
    light: +clamp01((spell.gleam - row.light.from) / (row.light.full - row.light.from)).toFixed(3),
    edge: +clamp01((spell.spark - row.edge.from) / (row.edge.full - row.edge.from)).toFixed(3),
  };
}

/** An entry's hook block (its `technique` of the hook's kind), or null: a "none" row and the house have none. */
const hookOf = (entry: HookEntry | null | undefined) => (entry?.technique?.kind === 'hook' ? entry.technique : null);
/**
 * **The hook's zone about the house** (`techniqueAt`'s house zone): the house's own place, and an entry that says
 * `house`, play the row's `house` zone (the house's own place reads the file's first row), its share growing as Pulse,
 * Gleam or Spark rise past the house.
 */
export const HOOK_HOUSE: HouseZone = { zone: (entry) => hookRowOf(hookOf(entry)?.row)?.house ?? null };

/** The birds the leans are read about: the entry's tile (its `leans.centre`, its place's birds), or the house for the house's zone. */
const centreOf = (entry: HookEntry | null): Partial<Record<Bird, number>> =>
  entry ? { ...Object.fromEntries(BIRDS.map((b) => [b, entry.place.birds[b] ?? HOUSE[b]])), ...(hookOf(entry)?.leans?.centre ?? {}) } : HOUSE;
const leaned = (by: Partial<Record<Bird, number>>, spell: Spell, centre: Partial<Record<Bird, number>>) =>
  Math.exp((Object.entries(by) as Array<[Bird, number]>).reduce((s, [b, k]) => s + k * (spell[b] - (centre[b] ?? HOUSE[b])), 0));

/** **The riff rows' weights** at a spell: the entry's own mix (or, about the house, the row's picks evenly) times the birds' leans about its tile. */
export function pickWeights(entry: HookEntry | null, spell: Spell, row: HookRow = HOOK_ROWS[0]): Array<{ row: string; w: number }> {
  const centre = centreOf(entry), base = hookOf(entry)?.picks;
  return row.picks.map((p) => ({ row: p.row, w: (base ? base[p.row] ?? 0 : 1) * leaned(p.by, spell, centre) }));
}

/** How far Veil stands past the tile toward the restless rows (the full gallop, the gated chords) and away from the patient ones: the labels' reading. */
export const restlessOf = (entry: HookEntry | null, spell: Spell): number => +(spell.veil - (centreOf(entry).veil ?? HOUSE.veil)).toFixed(3);

/** The pedal's chance at a spell (his experiment under the runs), about the entry's tile. */
export function pedalChance(entry: HookEntry | null, spell: Spell, row: HookRow = HOOK_ROWS[0]): number {
  return Math.min(row.pedal.most, row.pedal.w * leaned(row.pedal.by, spell, centreOf(entry)));
}

/** Where a theme is, as the hook asks it. */
export interface HookAsk {
  seed: Seed;
  spell: Spell;
  /**
   * the hook lane's read (`techniqueAt` with `HOOK_HOUSE`): the entry read (null: the house's own place), its zone's
   * share, and past reach 0 every other entry's zone and the house's away from it; its needs (the row's) are met before
   * it is asked
   */
  read: TechniqueRead;
  /** the theme's scale (intervals): a loop with a diminished triad in it is never drawn */
  scale: readonly number[];
  /** the trance corner's draw called the riff (`GenerateOptions.hookForced`): the zone's share is taken as whole */
  force?: boolean;
}

/**
 * **The theme's hook**, or null where none plays. The lane's read is the one reader's (`techniqueAt`, `drawZone`): a
 * tile plays its share within its radius, the house's own place (or an entry that says `house`) the row's zone about the
 * house; past reach 0 every other entry is a candidate as a library row is, drawn against the place's own choice, so
 * the dial means here what it means for the library. Then the riff's row by the birds' weights, its harmony by the seed,
 * the pedal by Loom and Tide, about the zone's tile. Its needs (the row's `needs`) are the caller's to meet (`needsMet`).
 */
export function planHook(a: HookAsk): HookPlan | null {
  const drawn = drawZone(a.read, a.seed, 'hook') ?? (a.force ? { entry: a.read.entry } : null);
  if (!drawn) return null;
  const E = drawn.entry;
  const row = hookRowOf(hookOf(E)?.row);
  if (!row) return null;
  const by = !E || hookOf(E)?.house ? null : E;
  const weights = pickWeights(by, a.spell, row).filter((p) => p.w > 0 && phraseRowOf(p.row));
  if (!weights.length) return null;
  const pick = phraseRowOf(new Rng(`${a.seed}::hook:pick`).weighted(weights.map((p) => ({ v: p.row, w: p.w }))))!;
  const { light, edge } = toneOf(a.spell, row);
  const pedal = new Rng(`${a.seed}::hook:pedal`).chance(pedalChance(by, a.spell, row))
    ? { voice: new Rng(`${a.seed}::hook:pedal:voice`).weighted(row.pedal.voices.map((x) => ({ v: x.v, w: x.w }))) } : null;
  const triad = (d: number) => buildChord(60, [...a.scale], d, 3).map((n, _i, all) => n - all[0]);
  const loops = row.loops.filter((l) => l.beats.every(([, d]) => triad(d)[2] === 7));
  const loop = new Rng(`${a.seed}::hook:loop`).weighted((loops.length ? loops : row.loops).map((l) => ({ v: l, w: l.w })));
  return { row, entry: E?.id ?? 'house', pick, loop, light, edge, pedal };
}

/** What a hook says about itself, for the plan's dice: `hook · <row> · loop <loop> · pedal <voice>` (the ring's labels read it). */
export const hookWord = (h: HookPlan): string =>
  ['hook', h.pick.id, `loop ${h.loop.id}`, h.pedal ? `pedal ${h.pedal.voice}` : ''].filter(Boolean).join(' · ');

// --- the arc ---------------------------------------------------------------------------------------------------------

/** A section as the hook reads it (the arc rule's). */
export type HookSection = ArcSection;
/** A bar of the hook's arc: the rule's bar (`src/arc.ts`) in the hook's units. */
export interface ArcBar {
  state: ArcState;
  /** the bar's place in its run (or the tease), from nought: the riff's cells count from it */
  at: number;
  /** the run's number, from nought (-1: the tease or none) */
  run: number;
  /** the chop's floor, a share of the slice's level */
  floor: number;
  /** the saw's level here, a gain (the runs lift toward the peak) */
  gain: number;
  /** the pedal strikes here (a run's first bar, and every `restrikeBars` of it), held this many bars */
  pedalBars: number;
}

/**
 * **Where the saw plays** over a theme's sections: the row's arc rule (`arcOf`, `src/arc.ts`: the runs shaped to the
 * peak, each run's closing bars the saw alone), its two knobs read as the chop's floor and the saw's gain, and the
 * pedal's strikes at a run's first bar and every `restrikeBars` of it. One entry a bar.
 */
export function hookArc(h: HookPlan, sections: readonly HookSection[], bars: number): ArcBar[] {
  const A = arcRuleOf(h.row.arc);
  if (!A) throw new Error(`hook: ${h.row.id} names no arc rule (${h.row.arc})`);
  const dB = (x: number) => 10 ** (x / 20);
  return arcOf(A, sections, bars).map((x) => {
    if (x.state === 'off') return { state: 'off' as ArcState, at: 0, run: -1, floor: 0, gain: 1, pedalBars: 0 };
    const floor = +dB(x.knobs.floorDb).toFixed(4), gain = +dB(x.knobs.levelDb ?? 0).toFixed(4);
    if (x.state === 'tease') return { state: 'tease' as ArcState, at: x.at, run: -1, floor, gain, pedalBars: 0 };
    return { state: x.state, at: x.at, run: x.run, floor, gain,
      pedalBars: x.state === 'run' && h.pedal && x.at % h.row.pedal.restrikeBars === 0 ? Math.min(h.row.pedal.restrikeBars, x.until - x.at) : 0 };
  });
}

/** The saw's share of a theme's bars by the arc (the tease, the runs and their breaks). */
export const arcShare = (arc: readonly ArcBar[]): number => arc.filter((x) => x.state !== 'off').length / Math.max(1, arc.length);

/**
 * **The pedal's tones** under a run: the key's `tones` (scale steps from the tonic) from `low`, each kept only where it
 * fits every chord the run plays (a chord tone, or no semitone from one).
 */
export function pedalTones(h: HookPlan, key: number, scale: readonly number[], chords: ReadonlyArray<readonly number[]>): number[] {
  const P = h.row.pedal;
  return P.tones.map((s) => P.low + ((((key + scale[s % 7]) - P.low) % 12) + 12) % 12)
    .filter((m) => chords.every((notes) => {
      const pcs = notes.map((n) => ((n % 12) + 12) % 12), p = ((m % 12) + 12) % 12;
      return pcs.includes(p) || !pcs.some((q) => Math.abs(q - p) === 1 || Math.abs(q - p) === 11);
    }));
}

/** A saw note as the pedal's level reads it: its written level and length, and its gate where it is chopped. */
export interface SawNote { gain: number; vel: number; dur: number; edge?: number; gate?: { steps: number[]; stepS: number; lens?: number[]; open?: number; gap?: number; lift?: number; floor?: number } }

/**
 * **The energy a saw note sounds**, in seconds at full level per (gain x velocity) squared: under a gate, each struck
 * slice at its level (`steps` x `lift`) while it is open, and the chop's `floor` of it until the next strike, as the
 * voice draws its envelope (`supersaw-grit.ts`); a held note its length.
 */
export function sawEnergy(n: SawNote): number {
  const g = n.gate, dur = Math.max(0, n.dur);
  if (!g || !g.steps?.length || !(g.stepS > 0.02)) return dur;
  const edge = Math.max(0, Math.min(1, n.edge ?? 0)), lift = Math.max(1, Math.min(8, g.lift ?? 1));
  const floor = Math.max(0, Math.min(0.9, g.floor ?? 0));
  const open = Math.max(0.2, Math.min(1, (g.open ?? 0.7) * (1 - 0.1 * edge)));
  let e = 0, low = 0, last = 0, covered = 0;
  for (let k = 0; k < g.steps.length; k++) {
    if (k < covered) continue;
    const len = Math.max(1, Math.round(g.lens?.[k] ?? 1)), span = len * g.stepS, t0 = k * g.stepS;
    covered = k + len;
    if (t0 >= dur) break;
    const a = Math.max(0, Math.min(1, g.steps[k]));
    if (a <= 0) continue;
    e += low * low * (t0 - last);
    const lvl = a * lift;
    const on = Math.min(dur - t0, g.gap != null ? span - Math.min(0.9, g.gap * (1 + 0.2 * edge)) * g.stepS : open * span);
    e += lvl * lvl * 0.8 * on;
    low = lvl * floor; last = t0 + on;
  }
  return e + low * low * Math.max(0, dur - last);
}

/**
 * **The pedal's gain** (trance-pad, his ear 10-28: *"the pad is too loud and dominates over the track"*): a tone's level,
 * in dB on the pad's lane, that puts the pedal's tones together `underDb` under the saw sounding over its hold. `sawDb`:
 * the saw's written energy over the hold (gain, velocity and gate, its lane and stage) less the pad's lane and stage at
 * the strike; the voice's own loudness (`db`, measured) taken off, and the tones' count, so every voice the pedal can
 * draw and one tone or two land at the same place.
 */
export function pedalGainDb(h: HookPlan, sawDb: number, tones: number): number {
  const P = h.row.pedal, v = P.voices.find((x) => x.v === h.pedal?.voice);
  return sawDb - P.underDb - (v?.db ?? 0) - 10 * Math.log10(Math.max(1, tones)) - 20 * Math.log10(P.vel);
}

/**
 * **The loop's chord** at a beat of a run (`beat` from the run's first bar): the key's triad on the loop's degree, rooted
 * from `chordRoot` up a fifth at most; its first chord coloured where the riff row asks (`add9`). As a `Chord` for the
 * progression's readers (the bass, the pad) and the riff: `bassPc` the key's tonic where the loop holds the bass there.
 */
export function loopChordAt(h: HookPlan, beat: number, chordRoot: number, scale: readonly number[]): Chord & PhraseChord {
  const L = h.loop.beats, cycle = L.reduce((s, [b]) => s + b, 0);
  let at = ((beat % cycle) + cycle) % cycle, k = 0;
  while (k < L.length - 1 && at >= L[k][0]) { at -= L[k][0]; k++; }
  const d = L[k][1], sc = [...scale];
  const notes = buildChord(chordRoot, sc, d, 3);
  if (k === 0 && h.pick.gate.color === 'add9') notes.push(buildChord(chordRoot, sc, d, 5)[4] ?? notes[0] + 14);
  const key = ((chordRoot % 12) + 12) % 12;
  return { degree: d, size: notes.length, startBar: 0, bars: 1, notes, voicing: [...notes], rootMidi: notes[0], label: chordLabel(chordRoot, sc, d, 3),
    roman: DEGREE_NAMES[d] ?? String(d + 1), scalePcs: sc.map((i) => (key + i) % 12), loop: true, ...(h.loop.bass === 'pedal' ? { bassPc: key } : { bassPc: notes[0] % 12 }) };
}
