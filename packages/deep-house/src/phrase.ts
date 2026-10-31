// **The riff's rows: chopped chords** (round trance-2, 10-28). His ear on the first sketches: the phrases *"no"*, the gated
// chords *"okay"*; on the second, built from source 10's measured chop: *"They all sound pretty good … So we can adopt all
// of these"*. Five rows: the gated chords, the gallop (a sixteenth, a sixteenth and an eighth on every beat) and its dark,
// bright and sparse moves.
//
// Every musical choice is the row's (`recipes/arrangement/phrases.json`): the chop's patterns, the slices' lengths and
// gap, the voicing (how many voices, which tones, the top, a colour on the loop's first chord), the cells and their order.
// The chords are the hook's (its loop in a run, `src/hook.ts`). This file is the mechanism and names no place and no genre:
// it places a row over whatever chords it is handed. Pure: no DOM, no engine, no dice.

import FILE from '../recipes/arrangement/phrases.json' with { type: 'json' };
import { voiceHeld } from './theory.ts';

/** The chord as a phrase needs it: its tones from the root, and the key's scale (pitch classes). */
export interface PhraseChord { rootMidi: number; notes: readonly number[]; scalePcs: readonly number[] }
/** A bar's chop with slices longer than a sixteenth. */
export interface GatePattern { steps: readonly number[]; lens?: readonly number[] }
export interface PhraseCell {
  /** the chord's top: the chord tone nearest this (MIDI) */
  top: number;
  /** a pattern name per bar */
  gate: readonly string[];
}
export interface PhraseRow {
  id: string;
  about: string;
  cellBars: number;
  order: readonly string[];
  cells: Readonly<Record<string, PhraseCell>>;
  vel: number;
  /** the corner's factor */
  filter: number;
  /**
   * the chord: `voices` notes under the top, from the chord's first `tones` (three: the triad) or its tones by index
   * (`[0, 2]`: the root and the fifth); a slice shuts `open`'s share of itself, or with `gap` a fixed share of a
   * sixteenth before its end
   */
  gate: { voices: number; open: number; tones?: number | readonly number[]; gap?: number; color?: 'add9' };
  /** a bar's chop: a level a sixteenth, or the levels and each slice's length in sixteenths (`lens`) */
  patterns: Readonly<Record<string, readonly number[] | GatePattern>>;
}
export const PHRASE_ROWS: readonly PhraseRow[] = (FILE as unknown as { rows: PhraseRow[] }).rows;
export const phraseRowOf = (id: string): PhraseRow | undefined => PHRASE_ROWS.find((r) => r.id === id);

/** One note a phrase writes in a bar: a chord tone held from `step` for `durSteps`, chopped by its gate. */
export interface PhraseNote {
  step: number; midi: number; durSteps: number; vel: number; cutoffMul: number;
  gate: { steps: readonly number[]; lens?: readonly number[]; open: number; gap?: number; lift: number };
}

const pc = (m: number) => ((m % 12) + 12) % 12;
const patternOf = (p: readonly number[] | GatePattern): GatePattern => (Array.isArray(p) ? { steps: p as readonly number[] } : p as GatePattern);
const sameChord = (a: PhraseChord, b: PhraseChord) => a.rootMidi === b.rootMidi && a.notes.join() === b.notes.join();

/**
 * **One bar of a row**: `at` the bar's place in the statement (the cells cycle from it), `chordAt` the chord at a step of
 * the bar. The bar is cut where the chord changes on a beat; each piece a held note a voice, its top the chord tone
 * nearest the cell's, chopped by the bar's pattern. A note's velocity is the energy its open slices hold (as the hook's
 * gate always wrote it), the gate's `lift` its peak back.
 */
export function phraseBar(row: PhraseRow, at: number, chordAt: (step: number) => PhraseChord): PhraseNote[] {
  const out: PhraseNote[] = [];
  const cell = row.cells[row.order[Math.floor(at / row.cellBars) % row.order.length]];
  const pat = patternOf(row.patterns[cell.gate[(at % row.cellBars) % cell.gate.length]]);
  const G = row.gate;
  const cuts = [0, ...[4, 8, 12].filter((st) => !sameChord(chordAt(st), chordAt(st - 4))), 16];
  for (let c = 0; c + 1 < cuts.length; c++) {
    const from = cuts[c], to = cuts[c + 1], chord = chordAt(from);
    const steps = pat.steps.slice(from, to), lens = pat.lens?.slice(from, to);
    const pick = Array.isArray(G.tones) ? (G.tones as readonly number[]).map((k) => chord.notes[k]).filter((m) => m != null)
      : chord.notes.slice(0, (G.tones as number | undefined) ?? chord.notes.length);
    // the top within three semitones of the cell's: seven in a row hold a tone of any chord whose tones lie a fifth apart at most
    const tones = voiceHeld(pick, G.voices, [cell.top - 3, cell.top + 3], cell.top);
    let energy = 0;
    for (let k = 0, cov = 0; k < steps.length; k++) {
      if (k < cov) continue;
      const len = Math.max(1, lens?.[k] ?? 1); cov = k + len;
      energy += steps[k] ** 2 * (G.gap != null ? Math.max(0.1, len - G.gap) : G.open * len);
    }
    if (energy <= 0) continue;
    const lift = 1 / Math.sqrt(Math.max(0.05, energy / steps.length));
    tones.forEach((midi, k) => out.push({ step: from, midi, durSteps: to - from, vel: +(row.vel * (1 - k * 0.06) / lift).toFixed(4), cutoffMul: row.filter,
      gate: { steps, ...(lens ? { lens } : {}), open: G.open, ...(G.gap != null ? { gap: G.gap } : {}), lift: +lift.toFixed(4) } }));
  }
  return out;
}
