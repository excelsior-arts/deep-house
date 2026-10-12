// **The walking root** (round DNB-2): the bass's root moving inside a chord
// that holds, by a step, now and then by a third or a fourth down.
//
// Source 8 read the bass's root moving every 1.1-3.2 bars (median 1.6) while a
// chord holds 1.7-4.0 (median 2.3), 47 % of the moves a tone or less and
// octave jumps rare: the root moves first and the chord follows every second
// root (`notes/rounds/dnb-1.md` §2, *The bass*). The composer's bass followed
// the chord's root and nothing else, so a chord of four bars was one root for
// four bars.
//
// It is not a figure. A figure, under T1's contract (`src/treatment.ts`), is
// lane edits in drum roles, sixteenths and levels; this moves the pitch the
// bass's own figure plays and keeps its rhythm, so it is a place table (how
// often, by the nearest place: `walk` in `StylePlaces`) and this mechanism.
//
// **Where.** Every bar after a chord's first, while the chord holds: a chord's
// first bar is its own root, so the harmony still lands. **How often.** The
// place's `rate`, one die a bar off a stream of its own
// (`<seed>::walk:<bar>`), so a walk moves no other draw and the same bar asks
// the same question for every lane. **Where to.** One of four places from the
// chord's root, by weight — the scale step toward the next chord's root (an
// approach: 3), the other scale step (1.5), the chord's third (1), the fifth
// as a fourth down (0.5) — so most moves are steps and few are leaps. The
// walked note is the root's own note moved by that many semitones and kept in
// the register, never refolded from its pitch class, so a step is a step.
import { Rng } from './rng.ts';
import type { Chord } from './theory.ts';
import type { PlaceEntry } from './places.ts';

/** How often the bass walks at a place: the share of a held chord's later bars whose root moves. */
export interface WalkEntry extends PlaceEntry { rate: number }

/** The weights of the four places a walk may go, in the order above. */
export const WALK_WEIGHTS = Object.freeze({ approach: 3, step: 1.5, third: 1, fourthDown: 0.5 });

/**
 * The semitones a bar's bass root moves from its chord's root, or 0.
 * @param scale the key's scale, as semitones from its tonic (`SCALES`)
 * @param chordStart whether this bar is the chord's first in the theme (it never walks)
 */
export function walkAt(seed: string, bar: number, rate: number, chord: Chord, next: Chord, scale: readonly number[], chordStart: boolean): number {
  if (!(rate > 0) || chordStart) return 0;
  const r = new Rng(`${seed}::walk:${bar}`);
  if (!r.chance(rate)) return 0;
  const n = scale.length;
  const d = ((chord.degree % n) + n) % n;
  const up = (d + 1 < n ? scale[d + 1] : scale[0] + 12) - scale[d];
  const down = -(scale[d] - (d - 1 >= 0 ? scale[d - 1] : scale[n - 1] - 12));
  // Toward the next chord's root: the step whose pitch class stands nearer it.
  const pc = (m: number) => ((m % 12) + 12) % 12;
  const gap = (a: number, b: number) => { const x = Math.abs(pc(a) - pc(b)); return Math.min(x, 12 - x); };
  const target = next.rootMidi;
  const upNearer = gap(chord.rootMidi + up, target) <= gap(chord.rootMidi + down, target);
  const third = chord.notes.length > 1 ? chord.notes[1] - chord.notes[0] : 3;
  const options: Array<[number, number]> = [
    [upNearer ? up : down, WALK_WEIGHTS.approach],
    [upNearer ? down : up, WALK_WEIGHTS.step],
    [third, WALK_WEIGHTS.third],
    [-5, WALK_WEIGHTS.fourthDown],
  ];
  const total = options.reduce((a, [, w]) => a + w, 0);
  let x = r.next() * total;
  for (const [semis, w] of options) { if ((x -= w) < 0) return semis; }
  return options[0][0];
}

/** A walked note kept in the register by octaves: the root's own note moved, never refolded. */
export function walked(midi: number, semis: number, low: number, high: number): number {
  let m = midi + semis;
  while (m > high) m -= 12;
  while (m < low) m += 12;
  return m;
}
