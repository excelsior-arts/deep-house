// **The hand drums' own grammar** (his ear 10-13, house seed 35: "still barely hear conga and it's too primitive,
// only one hit, doesn't sound like congas"). Where the sixteenth lane's own draw lands on a hand drum, the lane used
// to strike it on the mined sixteenth mask: a shaker's figure, one drum, one stroke, often one hit a bar. A hand
// part is a conversation instead, and this reads it off a style's row (`HandPhrases`, the row is JSON):
//
//   the phrase   a two-bar cell across two drums, drawn once per theme: the open tone on the high drum, the bass
//                tone on the low one, the slap, and the ghosted fingertips and heels between
//   the answer   the last bar of every phrase (four or eight bars, drawn once per theme) is an answer bar, drawn per
//                phrase; the phrase after an answer leads on the other drum (tone and low trade places)
//   the birds    every draw is leaned by the row's own leans (`lean.ts`'s one lean, centred on the row's centres)
//
// Every draw is off a stream of its own (`<seed>::hands…`), so no other draw of the theme or the bar moves. The
// phrase is counted from its section's first bar, so it turns on the section's phrase lines. Nothing here knows a
// genre or an instrument: the voices it plays and the strokes it names are the row's.
import Rng from './rng.ts';
import type { Seed } from './rng.ts';
import { lean } from './lean.ts';

/** One hit of a phrase: a sixteenth of the two-bar cell (0-31) or of the answer bar (0-15), and its stroke. */
export type HandHit = readonly [number, string];

export interface HandPhrases {
  kind: 'hand-phrases';
  /** the voices this grammar plays: a lane's draw that lands on one of them plays the phrase */
  voices: readonly string[];
  /** the sound character whose strokes the phrase names */
  character: string;
  feel: { swing: number; delay: { beats: number }; timing: { beats: number }; dynamics: number };
  /** the accent each stroke is struck at */
  accents: Readonly<Record<string, number>>;
  /** the strong offbeats, struck a little harder when an open stroke lands there */
  strong?: { steps: readonly number[]; lift: number };
  /** the part's level against the lane's own trim, in decibels */
  db: number;
  /** the phrase lengths, by weight (the key is the bars) */
  phraseBars: Readonly<Record<string, number>>;
  cells: ReadonlyArray<{ id: string; weight: number; hits: readonly HandHit[] }>;
  answers: ReadonlyArray<{ id: string; weight: number; hits: readonly HandHit[] }>;
  lean?: { centre?: Readonly<Record<string, number>>; strength?: number } & Record<string, unknown>;
}

/** A choice's weight under the row's leans: its own weight times each bird's factor, centred on the row's centre for that bird. */
function leanedWeight(row: HandPhrases, id: string, w: number, spell: Readonly<Record<string, number>>): number {
  const L = row.lean;
  if (!L) return w;
  const s = typeof L.strength === 'number' ? L.strength : 1;
  let x = w;
  for (const [bird, leans] of Object.entries(L)) {
    if (bird === 'centre' || bird === 'strength' || bird === 'says' || !leans || typeof leans !== 'object') continue;
    const by = (leans as Record<string, unknown>)[id];
    x *= lean(by, spell[bird], s, L.centre?.[bird] ?? 0.5);
  }
  return x;
}

/** The theme's hand part: its cell and phrase length, drawn once; its bars asked one at a time. */
export interface HandPart {
  cell: string;
  phraseBars: number;
  /** the hits of one bar, by the bar's place in its section: step 0-15 and stroke */
  bar(barInSection: number, sectionIndex: number): Array<{ step: number; stroke: string; accent: number }>;
}

const OPEN_SWAP: Readonly<Record<string, string>> = Object.freeze({ tone: 'low', low: 'tone' });

/** The hand part a theme plays, off `<seed>::hands`. */
export function handPart(row: HandPhrases, seed: Seed, spell: Readonly<Record<string, number>>): HandPart {
  const r = new Rng(`${seed}::hands`);
  const cell = r.pickWeighted(row.cells, (c) => leanedWeight(row, c.id, c.weight, spell))!;
  const lengths = Object.entries(row.phraseBars).map(([bars, w]) => ({ bars: +bars, w }));
  const phraseBars = r.pickWeighted(lengths, (l) => leanedWeight(row, String(l.bars), l.w, spell))!.bars;
  const answers = new Map<string, HandPhrases['answers'][number]>();
  const answerOf = (section: number, phrase: number) => {
    const k = `${section}:${phrase}`;
    if (!answers.has(k)) answers.set(k, new Rng(`${seed}::hands:answer:${k}`).pickWeighted(row.answers, (a) => leanedWeight(row, a.id, a.weight, spell))!);
    return answers.get(k)!;
  };
  const strong = new Set(row.strong?.steps ?? []);
  const accentOf = (step: number, stroke: string) => {
    const a = row.accents[stroke] ?? 0;
    return stroke !== 'touch' && stroke !== 'heel' && strong.has(step) ? a * (row.strong?.lift ?? 1) : a;
  };
  return {
    cell: cell.id,
    phraseBars,
    bar(barInSection, sectionIndex) {
      const phrase = Math.floor(barInSection / phraseBars), at = barInSection % phraseBars;
      // The phrase after an answer leads on the other drum.
      const swap = (s: string) => (phrase % 2 ? OPEN_SWAP[s] ?? s : s);
      if (at === phraseBars - 1) return answerOf(sectionIndex, phrase).hits.map(([step, s]) => ({ step, stroke: swap(s), accent: accentOf(step, swap(s)) }));
      const half = at % 2;
      return cell.hits.filter(([s]) => Math.floor(s / 16) === half).map(([s, k]) => ({ step: s % 16, stroke: swap(k), accent: accentOf(s % 16, swap(k)) }));
    },
  };
}

/** A hand-phrases row's faults, for the style's own load-time check. */
export function handPhrasesFaults(row: HandPhrases, strokes: readonly string[]): string[] {
  const bad: string[] = [];
  const hits = (where: string, hs: readonly HandHit[], span: number) => {
    for (const [s, k] of hs) {
      if (!Number.isInteger(s) || s < 0 || s >= span) bad.push(`${where}: step ${s} outside 0-${span - 1}`);
      if (!strokes.includes(k)) bad.push(`${where}: stroke ${k} is not the character's`);
      if (!Number.isFinite(row.accents[k])) bad.push(`${where}: stroke ${k} has no accent`);
    }
  };
  for (const c of row.cells) hits(`cell ${c.id}`, c.hits, 32);
  for (const a of row.answers) hits(`answer ${a.id}`, a.hits, 16);
  if (!row.cells.length || !row.answers.length) bad.push('a hand-phrases row needs a cell and an answer');
  if (!Object.keys(row.phraseBars).every((b) => Number.isInteger(+b) && +b >= 2)) bad.push('phrase lengths are whole bars, two or more');
  return bad;
}
