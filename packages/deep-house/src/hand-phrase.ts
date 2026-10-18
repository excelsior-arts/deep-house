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
//   the presence the part plays wherever its lane plays, through the build too (`through`), and it is the hand
//                player's: the hats' variations and the phrasing's thinning clear the lane around it, never its
//                hits; every phrase closes on its answer, a section that ends inside one shortening it to fit
//   the stage    where the player sits and where each drum stands (`HandStage`, the review of hands-3: the two-drum
//                talk was a pitch trade with no space, every hit at one random pan): one seat a theme, the pair's two
//                drums mirrored about it at the voice's own width, the low drum toward the middle; every stroke of
//                the character names its drum and its stroke, carried on the event as plan data
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
  /** where the player sits and where each drum stands; a row without one leaves every hit where the lane puts it */
  stage?: HandStage;
  /**
   * the section kinds the hand part plays through where the section's grammar holds its lane off (his word 10-16: the
   * build); the lane's other players stay out as the grammar says
   */
  through?: readonly string[];
}

/** A stroke as a hand drummer names it: the plan's tag, read by readouts and never by the renderer. */
export type StrokeName = 'open' | 'slap' | 'mute' | 'heel' | 'tip';
export const STROKE_NAMES: readonly StrokeName[] = Object.freeze(['open', 'slap', 'mute', 'heel', 'tip']);

/**
 * **The hand player's stage.** A pair of hand drums stands as a player sets it: the high drum and the low one a fixed
 * distance apart, mirrored about the player's own seat, the low drum on the side toward the middle and the high drum
 * outward. The seat is a theme's draw (how far off the middle, by weight and the row's leans; which side, a coin), off
 * a stream of its own. The voice's width is how far each drum stands from the seat (a bongo pair closer than a conga
 * and its low drum). A hit keeps a small humanise about its drum, never more than the stage's `humanise`.
 */
export interface HandStage {
  /** each stroke of the character: the drum of the pair it sounds on and its name as a stroke */
  strokes: Readonly<Record<string, { drum: 'high' | 'low'; stroke: StrokeName }>>;
  /** by voice, how far each drum of the pair stands from the seat, in pan units */
  widths: Readonly<Record<string, number>>;
  /** how far off the middle the player sits, by weight (leaned by the row's leans on each id) */
  seats: ReadonlyArray<{ id: string; weight: number; at: number }>;
  /** the most a hit strays from its drum, in pan units */
  humanise: number;
}

/** A theme's seat: how far off the middle and to which side, off `<seed>::hands:seat`. */
export interface HandSeat { id: string; at: number }

/** The theme's seat, drawn once. */
export function handSeat(row: HandPhrases, seed: Seed, spell: Readonly<Record<string, number>>): HandSeat | null {
  if (!row.stage) return null;
  const r = new Rng(`${seed}::hands:seat`);
  const seat = r.pickWeighted(row.stage.seats, (s) => leanedWeight(row, s.id, s.weight, spell))!;
  return { id: seat.id, at: r.chance(0.5) ? seat.at : -seat.at };
}

/** Where one stroke of a voice stands, and its drum and stroke; null where the stage does not place it. */
export function handPlace(row: HandPhrases, seat: HandSeat | null, voice: string, stroke: string):
  { pan: number; drum: 'high' | 'low'; stroke: StrokeName } | null {
  const stage = row.stage, named = stage?.strokes[stroke], width = stage?.widths[voice];
  if (!stage || !seat || !named || width === undefined) return null;
  const outward = seat.at < 0 ? -1 : 1;
  return { pan: seat.at + (named.drum === 'high' ? outward : -outward) * width, drum: named.drum, stroke: named.stroke };
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
  /**
   * the hits of one bar, by the bar's place in its section: step 0-15 and stroke. Given the section's length, a phrase
   * the section ends inside is a shorter phrase that still closes on its answer, on the section's last bar
   */
  bar(barInSection: number, sectionIndex: number, sectionBars?: number): Array<{ step: number; stroke: string; accent: number }>;
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
    bar(barInSection, sectionIndex, sectionBars) {
      const phrase = Math.floor(barInSection / phraseBars), at = barInSection % phraseBars;
      // **A phrase is never cut before its answer** (his word 10-16, "better and complete phrasing"): where the section
      // ends inside a phrase (an eight-bar phrase in a twelve-bar section), that phrase is as long as the bars left and
      // answers on the section's last bar.
      const length = sectionBars === undefined ? phraseBars : Math.max(1, Math.min(phraseBars, sectionBars - phrase * phraseBars));
      // The phrase after an answer leads on the other drum.
      const swap = (s: string) => (phrase % 2 ? OPEN_SWAP[s] ?? s : s);
      if (at === length - 1) return answerOf(sectionIndex, phrase).hits.map(([step, s]) => ({ step, stroke: swap(s), accent: accentOf(step, swap(s)) }));
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
  if (row.through !== undefined && !(Array.isArray(row.through) && row.through.every((k) => typeof k === 'string' && k.length > 0))) bad.push('through: a list of section kinds');
  const st = row.stage;
  if (st) {
    for (const k of strokes) {
      const n = st.strokes[k];
      if (!n) bad.push(`stage: stroke ${k} names no drum`);
      else if ((n.drum !== 'high' && n.drum !== 'low') || !STROKE_NAMES.includes(n.stroke)) bad.push(`stage: stroke ${k} is not a drum of the pair and a stroke`);
    }
    // Mono-safe: no drum of any seat stands past half way to a side.
    const far = Math.max(0, ...st.seats.map((s) => s.at));
    for (const [v, w] of Object.entries(st.widths)) if (!(w > 0 && far + w <= 0.5)) bad.push(`stage: ${v}'s width ${w} with the farthest seat ${far} stands past 0.5`);
    if (!st.seats.length || st.seats.some((s) => !(s.at >= 0 && s.weight > 0))) bad.push('stage: a seat or more, each a distance from the middle and a weight');
    if (!(st.humanise >= 0 && st.humanise <= 0.02)) bad.push('stage: the humanise is at most 0.02');
  }
  return bad;
}
