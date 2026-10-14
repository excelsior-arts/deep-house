// **Musical time: one helper, three units** (PLAN-UNIFY §2.2). A knob written in bars means three different things
// across the ring — an eight-bar phrase is 11 s at 174 BPM, 18 s at 104 and 38 s at 52 — so every knob that moves
// from the fast places to the rest of the ring declares its unit and is resolved here, per theme:
//
//   - **felt** beats or bars, for anything rhythmic (endings, rolls, pickups, delay times): the pulse the kit makes
//     felt, which is half the written one where the kit plays half-time (a place's `felt: 'half'`);
//   - **seconds**, for anything the ear hears as a duration (fades, holds, deadlines, the spacing of sparse strikes);
//   - **phrases**, for anything structural (arcs, the cooldown, how often a moment recurs). A phrase is the power of
//     two of felt bars nearest a target length in seconds; the target leans with Loom, 12 s at nought to 24 s at one
//     (`PHRASE_TARGET`, the one lean of `src/lean.ts`, so 17 s at the middle).
//
// A place may pin a knob as the absolute it is today (`TimeEntry`): the fast places pin their phrase at eight
// written bars, as the producer's grammar was written, and lean it by Loom from their own centre at a strength of
// nought, so every bird position there resolves to today's eight bars exactly (the U0 round is sound-neutral; a later
// round gives the lean its strength). Nothing here names a place, a genre or a seed: the place tables say where.
import { lean } from './lean.ts';
import type { PlaceEntry } from './places.ts';

/** The pulse a theme is felt in: its written beat, or half of it where the kit plays half-time. */
export type Felt = 'whole' | 'half';

/**
 * **Time by place**: the felt pulse a place's kit makes, and the phrase it pins. A place that names neither is the
 * ring's own rule (the written beat; the phrase from Loom's target).
 */
export interface TimeEntry extends PlaceEntry {
  felt?: Felt;
  /**
   * The phrase pinned at the place: `bars` written bars at the place's own Loom (`loom.centre`), leaned from there by
   * the one lean at `loom.strength` (its target in seconds; nought keeps `bars` at every Loom).
   */
  phrase?: Readonly<{ bars: number; loom: Readonly<{ centre: number; strength: number }> }>;
}

/** The ring's phrase target, in seconds: 12 s at Loom nought, 24 s at one, geometric between (the one lean). */
export const PHRASE_TARGET = Object.freeze({ leastS: 12, mostS: 24 });
/** The phrase's bounds, in felt bars (a power of two inside them). */
export const PHRASE_FELT_BARS = Object.freeze({ least: 1, most: 32 });

/** A theme's time, resolved: every unit a knob may declare, in seconds and in the theme's written bars. */
export interface MusicalTime {
  bpm: number;
  beatsPerBar: number;
  /** the written beat and bar, in seconds */
  beatS: number;
  barS: number;
  felt: Felt;
  /** the felt beat and bar, in seconds (twice the written ones at half-time) */
  feltBeatS: number;
  feltBarS: number;
  /** the phrase: its target in seconds, its length in felt bars, in written bars and in seconds; `pinned` where a place set it */
  phraseTargetS: number;
  phraseFeltBars: number;
  phraseBars: number;
  phraseS: number;
  pinned: boolean;
}

/** The helper's inputs: the theme's tempo and metre, its birds, and the place's entry (if any). */
export interface TimeInput {
  bpm: number;
  beatsPerBar?: number;
  spell: Readonly<Record<string, number>>;
  entry?: Pick<TimeEntry, 'felt' | 'phrase'> | null;
}

const log2 = (x: number) => Math.log(x) / Math.LN2;
/** The power of two nearest `x` (in the log), inside `[least, most]`. */
const nearestPow2 = (x: number, least: number, most: number) => Math.min(most, Math.max(least, 2 ** Math.round(log2(Math.max(1e-9, x)))));

export function musicalTime(I: TimeInput): MusicalTime {
  const beatsPerBar = I.beatsPerBar ?? 4;
  const beatS = 60 / I.bpm, barS = beatS * beatsPerBar;
  const felt: Felt = I.entry?.felt ?? 'whole';
  const k = felt === 'half' ? 2 : 1;
  const feltBeatS = beatS * k, feltBarS = barS * k;
  const loom = I.spell.loom;
  const P = I.entry?.phrase;
  let phraseTargetS: number, phraseFeltBars: number;
  if (P) {
    // the place's own phrase at its own Loom, leaned from there (nought: the pinned bars, whatever Loom says)
    phraseTargetS = P.bars * barS * lean(1, loom, P.loom.strength, P.loom.centre);
    phraseFeltBars = P.loom.strength === 0 ? P.bars / k : nearestPow2(phraseTargetS / feltBarS, PHRASE_FELT_BARS.least, PHRASE_FELT_BARS.most);
  } else {
    // the ring's own: Loom leans the target from 12 s to 24 s (strength ln 2 about the middle, the geometric mean)
    const mid = Math.sqrt(PHRASE_TARGET.leastS * PHRASE_TARGET.mostS);
    phraseTargetS = mid * lean(1, loom, log2(PHRASE_TARGET.mostS / PHRASE_TARGET.leastS) * Math.LN2, 0.5);
    phraseFeltBars = nearestPow2(phraseTargetS / feltBarS, PHRASE_FELT_BARS.least, PHRASE_FELT_BARS.most);
  }
  const phraseBars = phraseFeltBars * k;
  return { bpm: I.bpm, beatsPerBar, beatS, barS, felt, feltBeatS, feltBarS, phraseTargetS: +phraseTargetS.toFixed(3), phraseFeltBars, phraseBars, phraseS: phraseBars * barS, pinned: !!P };
}

/** A knob's units (`recipes/ambient/producer.json`'s `units`, the guards' limits): what its number counts. */
export type Unit = 'bars' | 'felt-bars' | 'beats' | 'felt-beats' | 'sixteenths' | 'phrases' | 'seconds' | 'ms' | 'dB' | 'Hz' | 'semitones' | 'cents'
  | 'MIDI' | 'scale-steps' | 'octaves' | 'weight' | 'share' | 'lean' | 'velocity' | 'gain' | 'pan' | 'ratio' | 'count' | 'position' | 'mark';

/** A duration in a unit, in seconds, by the theme's time (the units that are durations). */
export function secondsOf(T: MusicalTime, n: number, unit: Unit): number {
  switch (unit) {
    case 'bars': return n * T.barS;
    case 'felt-bars': return n * T.feltBarS;
    case 'beats': return n * T.beatS;
    case 'felt-beats': return n * T.feltBeatS;
    case 'sixteenths': return n * T.barS / 16;
    case 'phrases': return n * T.phraseS;
    case 'seconds': return n;
    case 'ms': return n / 1000;
    default: throw new Error(`musical time: ${unit} is not a duration`);
  }
}

/** A duration in a unit, in the theme's written bars. */
export const barsOf = (T: MusicalTime, n: number, unit: Unit): number => secondsOf(T, n, unit) / T.barS;

/** A duration of `n` in `unit`, held between `leastS` and `mostS` seconds (e.g. a fade of 1.5 bars, 2 s to 5 s). */
export const clampS = (T: MusicalTime, n: number, unit: Unit, leastS: number, mostS: number): number => Math.min(mostS, Math.max(leastS, secondsOf(T, n, unit)));
