// **The glide line** (round DNB-7): a bass that holds a home note and glides
// off it and back — a third, a fourth or a fifth up over a few sixteenths, held,
// and down again, on half-bar and bar shapes — with a bigger swoop every four or
// eight bars, and few real note changes. It replaces round DNB-6's riff, which
// played sixteenth-note groups and flicks.
//
// Eugene, 10-05, on DNB-6: *"the bass now is closer to psytrance with crazy
// syncopated riffs … You play 16th notes, where source 8 never does. They have a
// wobble that is perceived with 16th amplitude, but I don't think those are actual
// note progressions; the notes are simple in that track."* Read as a curve
// (`packages/mining/tools/score-8.py`, the sub's pitch every 5 ms; the numbers in
// `notes/rounds/dnb-7.md`), the territory's lines (source 8's two-step and liquid
// cuts) sit on their home a quarter of the time, glide a quarter to three fifths
// of it, a half bar spanning one and a half to four semitones, the widest bars ten
// to twelve, a glide lasting two and a half to three and a half sixteenths.
//
// **The rows are data**: a motif row's `wants.motif.glide` (`GlideWants`, held
// exactly by `glideProblems` in `parts/validation.ts`), the rows under
// `recipes/genres/dnb/glide-*.json` carrying one each, and a place table
// (`GlideEntry`) naming the rows a place draws, by weight.
//
// **What is read today** (the review of 10-08, A4): since the phrased cells (10-06)
// and the riff's phrase (10-07) play the line, a glide row's grammar is no longer
// laid; the place's draw of a glide row (`<seed>::gliderow`) still decides whether
// the bass glides at all, and its `pedal` where its home sits: the key's note under
// every chord, or, false, each chord's own root (a real note change where the chord
// changes). The code that laid the rest (the call, the answer and the swoop, the
// mined bars, their bridges and motion, the growl over the line) was taken out,
// moving no plan, and the rows' grammar beyond `pedal` with it (riff-trim, 10-10:
// reach, shapes, answer, held, swoop and over; the riff rows' bridges and growl).
// Nothing here names a note, a key, a voice or any record's curve.
import { Rng } from './rng.ts';
import type { PlaceEntry } from './places.ts';
import RIFF_ROW from '../recipes/genres/dnb/riff-liquid-mined.json' with { type: 'json' };
import RIFF_HELD_ROW from '../recipes/genres/dnb/riff-liquid-held.json' with { type: 'json' };
import RIFF_STAIRS_ROW from '../recipes/genres/dnb/riff-liquid-stairs.json' with { type: 'json' };
import PHRASED_ROW from '../recipes/genres/dnb/phrased-liquid.json' with { type: 'json' };
import { validatePhrase, type PhraseSpec } from './mined-phrase.ts';

type W<T> = ReadonlyArray<{ w: number } & T>;

/** A glide line as a motif row states it (`wants.motif.glide`): where its home sits, on the key's note (`pedal`) or each chord's root. */
export interface GlideWants { pedal: boolean }

/** How the bass glides at a place: the motif rows carrying a glide grammar it draws, by weight; none is the lane's own figure. */
export interface GlideEntry extends PlaceEntry { rows?: ReadonlyArray<{ v: string; w: number }> }

// **The phrased line** (10-06, hands-on with Eugene, after DNB-7): his ear on the glide
// line — *"this glide is consistent and repetitive … no asymmetry, boring monotone rhythm
// following the rhythm one to one, where is the DnB full-body energy that comes and goes,
// surprises you, takes attention and leaves with drums?"* So the line is phrased: two-bar
// cells against the two-step (kick on 0 and 10, snare on 4 and 12), notes of three
// sixteenths and longer, rests where the drums take the stage, and a slide into a note
// where the cell says so. An eight-bar phrase is statement, answer, statement, turn: the
// statement is the theme's (its hook), the answer and the turn are drawn per phrase, and a
// turn may leave the drums alone for most of two bars and come back on a pickup.
/** One note of a cell: its sixteenth over the cell, its length, its scale degree over home, and whether it slides in. */
export type CellNote = readonly [step: number, len: number, degree: number, slide?: 's'];
// The cells and where they play are a row (`recipes/genres/dnb/phrased-liquid.json`, 10-07): the
// statements, answers and turns by weight, the phrase's order of them, a build's pickup and the outro's bars.
type Cells = W<{ v: readonly CellNote[]; note?: string }>;
const PHRASED_CELLS = (PHRASED_ROW as unknown as { wants: { phrased: {
  cellBars: number; phrase: Array<'statement' | 'answer' | 'turn'>;
  statements: Cells; answers: Cells; turns: Cells; build: readonly CellNote[];
  outro: { everyPhrases: number; restBars: number; bars: number[] };
} } }).wants.phrased;
{
  const P = PHRASED_CELLS, period = (P.cellBars ?? 0) * 16;
  const cellsOk = (cells: Cells): boolean => Array.isArray(cells) && cells.length > 0 && cells.every((c) => Number.isFinite(c.w) && c.w > 0
    && Array.isArray(c.v) && c.v.every((n: CellNote) => Array.isArray(n) && [n[0], n[1], n[2]].every(Number.isFinite) && n[0] >= 0 && n[0] < period && n[1] > 0 && (n[3] === undefined || n[3] === 's')));
  const phraseBars = P.cellBars * (P.phrase?.length ?? 0);
  if (!Number.isInteger(P.cellBars) || P.cellBars < 1 || P.cellBars > 4 || !Array.isArray(P.phrase) || !P.phrase.length
    || P.phrase.some((k) => !['statement', 'answer', 'turn'].includes(k))
    || ![P.statements, P.answers, P.turns].every(cellsOk) || !Array.isArray(P.build) || !cellsOk([{ w: 1, v: P.build }])
    || !Number.isInteger(P.outro?.everyPhrases) || P.outro.everyPhrases < 1 || !Number.isInteger(P.outro.restBars) || P.outro.restBars < 0
    || !Array.isArray(P.outro.bars) || P.outro.bars.length !== phraseBars || P.outro.bars.some((b) => !Number.isInteger(b) || b < 0 || b >= phraseBars))
    throw new Error('the phrased cells need cell bars, a phrase of statement, answer and turn, cells of [step, length, degree, s?] by weight, a build pickup and the outro\'s bars');
}

/** A theme's phrased line: its statement, rolled once; answers and turns by phrase. */
export interface Phrased { statement: readonly CellNote[]; seed: string }

export function rollPhrased(seed: string, tag = ''): Phrased {
  const r = new Rng(`${seed}::phrased${tag}`);
  return { statement: r.weighted(PHRASED_CELLS.statements), seed: `${seed}::phrased${tag}` };
}

/** One bar of the phrased line `inSection` bars into a drop: the notes starting in it, steps within the bar. */
export function phrasedBar(line: Phrased, inSection: number): Array<{ step: number; len: number; degree: number; slide: boolean }> {
  const P = PHRASED_CELLS, phraseBars = P.cellBars * P.phrase.length, cellSteps = P.cellBars * 16;
  const phrase = Math.floor(inSection / phraseBars), pos = inSection % phraseBars, cellAt = Math.floor(pos / P.cellBars), half = pos % P.cellBars;
  const r = new Rng(`${line.seed}:${phrase}`);
  const answer: readonly CellNote[] = r.weighted(P.answers), turn: readonly CellNote[] = r.weighted(P.turns);
  const kind = P.phrase[cellAt];
  const cell: readonly CellNote[] = kind === 'answer' ? answer : kind === 'turn' ? turn : line.statement;
  return cell.filter((n) => Math.floor(n[0] / 16) === half)
    .map((n) => ({ step: n[0] - half * 16, len: Math.min(n[1], cellSteps - n[0]), degree: n[2], slide: n[3] === 's' }));
}

/** What the phrased line plays in a section of a kind: the drops and grooves whole; a build's last bar its pickup; an outro the row's bars every few phrases; else rest. */
export function phrasedInSection(line: Phrased, kind: string, inSection: number, sectionBars: number) {
  const P = PHRASED_CELLS, phraseBars = P.cellBars * P.phrase.length;
  if (kind === 'drop' || kind === 'main' || kind === 'groove') return phrasedBar(line, inSection);
  if (kind === 'build') return inSection === sectionBars - 1 ? P.build.map((n) => ({ step: n[0], len: n[1], degree: n[2], slide: n[3] === 's' })) : [];
  if (kind === 'outro') return Math.floor(inSection / phraseBars) % P.outro.everyPhrases === 0 && inSection < sectionBars - P.outro.restBars
    ? phrasedBar(line, P.outro.bars[inSection % phraseBars]) : [];
  return [];
}

// **The mined line** (10-06, hands-on, source 9's drop transcribed per sixteenth, in memory;
// `recipes/genres/dnb/riff-liquid-mined.json`): an eight-bar riff of bar shapes in the row's form.
// Every shape rests on steps 2-3 before the snare, comes back on 4-5 and holds, moves around 9-12,
// and lands on the leading note or home for 12-15; most bars fall into home from above over their
// first two sixteenths. What is kept is the grammar — the shapes' rhythm and their intervals over
// home as a vocabulary — and each theme writes its own riff in it: every non-home note of a shape
// may move to a neighbour in the vocabulary, so no theme plays the source's line. Semitones over
// home; `s` slides into the note.
//
// Since liquid-riffs-2 (10-08) a place may name several riff rows (`RiffEntry`): V's at the
// liquid place's centre, and beside it two riffs read off source 8 (held and stairs; a third, the swoop,
// was heard and left out on his word: musically not pleasing),
// drawn by weight where the birds stand nearer them. Each row is a riff whole: its shapes, its
// phrase and its playing numbers; the generator reads the drawn row's, never a module's own.
type MinedNote = readonly [step: number, len: number, semis: number, slide?: 's'];
interface MinedEntrance { steps: number[]; level: number; cents: number; seconds: number }
/**
 * **How the line is played** (the riff row's `play`, 10-07): the numbers the glide pass plays the
 * riff, the phrase and the phrased cells by — the register's floor and ceiling, the accents, the
 * dips under the backbeat, the releases and holds and the legato.
 */
export interface MinedPlay {
  floor: number; ceilingOver: number;
  accent: { steps: number[]; on: number; off: number };
  dips: { steps: number[]; db: number; earlyS: number };
  release: { touching: number; resting: number };
  touch: { holdS: number; restShare: number };
  changeShare: number;
  phraseGapS: number;
  legato: { gapSteps: number; joined: number; detached: number; slideOverS: number };
  pairClock?: PairClock;
}
/**
 * **A riff row** (`wants.riff`, scope `riff`), as the glide pass reads it: the bar
 * shapes in the row's form and the vocabulary a theme rolls them in, how a change
 * articulates, the entrance after a rest, the phrase of held runs the
 * drops play, and `play`, how the line is played. Each row carries all of it, so a
 * riff is read whole off its own row (liquid-riffs-2, 10-08: several riffs a place).
 */
export interface Riff {
  id: string;
  shapes: Readonly<Record<string, MinedNote[]>>;
  form: readonly string[];
  vocab: readonly number[];
  moveP: number;
  oneStepP: number;
  articulation: Readonly<{ lowerNeighbor: number; slide: number; change: number }>;
  entrance?: MinedEntrance;
  phrase: PhraseSpec;
  play: Readonly<MinedPlay>;
}
/**
 * **The pair on the grid** (the riff row's `play.pairClock`, optional): where a row
 * states it, every note the riff plays beats its pair on the theme's grid instead
 * of at the voice's own spacing — `perBeat` cycles of the pair per quarter note
 * (2 is the eighth: 5.8 Hz at 174 BPM), and `trough` where in each cycle its
 * trough falls after the grid line, in turns (nought: on the eighth, the swell
 * between; a half: the crest on the eighth). The rate and the phase are written
 * from absolute theme time, so troughs keep their lines across notes and slices;
 * on a tempo ride the rate rides the grid with the note (`gridRates`,
 * `contour-time.ts`). Absent, the pair keeps the voice's own spacing.
 */
export interface PairClock { perBeat: number; trough: number }
export function validatePairClock(v: unknown): asserts v is PairClock {
  const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const keys = typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.keys(v) : null;
  const c = v as Record<string, unknown>;
  if (!keys || keys.some((k) => k !== 'perBeat' && k !== 'trough')
    || !finite(c.perBeat) || c.perBeat < 0.25 || c.perBeat > 4
    || !finite(c.trough) || c.trough < 0 || c.trough >= 1)
    throw new Error('the riff row\'s pairClock needs perBeat, cycles per quarter note from 0.25 to 4, and trough, where in the cycle the trough falls, from 0 to under 1; nothing else');
}
/** The pair's rate on the grid, in hertz at `beat` seconds a quarter, and its phase at theme time `t` (crest at nought). */
export function pairClockAt(clock: PairClock, beat: number, t: number): { hz: number; phase: number } {
  const hz = +(clock.perBeat / beat).toFixed(6);
  // the trough is the cycle's half turn: at `trough` of a cycle past each grid line the phase is a half
  const turns = t * hz + 0.5 - clock.trough;
  return { hz, phase: +(((turns % 1) + 1) % 1).toFixed(6) };
}

/**
 * **A riff row read once, at load, by the loader's rules**: the play block, the
 * phrase (`validatePhrase`), the entrance and the articulation, each in bounds,
 * and the form's letters naming the row's shapes. A row
 * that breaks one is refused with its id, and the app does not load.
 */
export function loadRiff(row: unknown): Riff {
  const id = String((row as { id?: unknown })?.id ?? '(a row with no id)');
  try {
    const R = (row as { wants?: { riff?: Record<string, unknown> } })?.wants?.riff as unknown as Omit<Riff, 'id'> | undefined;
    if (!R || typeof R !== 'object') throw new Error('it carries no wants.riff');
    const shapes = R.shapes as Record<string, unknown>;
    if (!shapes || typeof shapes !== 'object' || Array.isArray(shapes) || Object.values(shapes).some((notes) => !Array.isArray(notes)
      || notes.some((n: unknown) => !Array.isArray(n) || ![n[0], n[1], n[2]].every((v) => typeof v === 'number' && Number.isFinite(v))
        || n[0] < 0 || n[0] >= 16 || !(n[1] > 0) || (n[3] !== undefined && n[3] !== 's'))))
      throw new Error('its shapes need notes of [step in the bar, length, semitones, \'s\'?]');
    if (!Array.isArray(R.form) || !R.form.length || R.form.some((k) => typeof k !== 'string' || !Object.hasOwn(shapes, k)))
      throw new Error('its form needs letters, each naming one of its shapes');
    if (!Array.isArray(R.vocab) || !R.vocab.length || R.vocab.some((v) => !Number.isFinite(v))
      || ![R.moveP, R.oneStepP].every((p) => typeof p === 'number' && p >= 0 && p <= 1))
      throw new Error('its vocabulary needs intervals, and moveP and oneStepP chances from 0 to 1');
    const p = R.play;
    const steps = (v: unknown): boolean => Array.isArray(v) && v.every((s, i) => Number.isInteger(s) && s >= 0 && s < 16 && (i === 0 || s > v[i - 1]));
    const within = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (!p || !within(p.floor, 12, 48) || !within(p.ceilingOver, 0, 12)
      || !steps(p.accent?.steps) || !within(p.accent.on, 0, 1) || !within(p.accent.off, 0, 1)
      || !steps(p.dips?.steps) || !within(p.dips.db, -24, 0) || !within(p.dips.earlyS, 0, 0.05)
      || !within(p.release?.touching, 0.005, 0.2) || !within(p.release.resting, 0.005, 0.2)
      || !within(p.touch?.holdS, 0, 0.05) || !within(p.touch.restShare, 0.5, 1)
      || !within(p.changeShare, 0.05, 1) || !within(p.phraseGapS, 0, 0.05)
      || !within(p.legato?.gapSteps, 0, 16) || !within(p.legato.joined, 0.5, 1) || !within(p.legato.detached, 0.5, 1) || !within(p.legato.slideOverS, 0, 0.05))
      throw new Error('the riff row\'s play block needs its floor, ceiling, accents, dips, releases, holds and legato, each in bounds');
    if (p.pairClock !== undefined) validatePairClock(p.pairClock);
    // the drops play the phrase's held runs (a riff with no phrase has nothing to play there since the mined bars went, 10-08)
    if (!R.phrase) throw new Error('mined phrase: a riff needs its phrase');
    {
      validatePhrase(R.phrase, R.shapes);
      // a note a run's gesture belongs to moves among the vocabulary's neighbours on every theme (`rollMined`),
      // so it must stand in the vocabulary, or be home; a note no run names may stand outside it, and is kept
      const outside = [...new Set(R.phrase.runs.flatMap((run) => run.anchors.filter((a) => a.length === 3)
        .map((a) => [a[1], a[2], R.shapes[a[1]][a[2]][2]] as const)
        .filter(([, , semis]) => semis !== 0 && !R.vocab.includes(semis)).map(([k, i, semis]) => `${k}[${i}] ${semis}`)))];
      if (outside.length) throw new Error(`its phrase anchors notes outside its vocabulary: ${outside.join(', ')}`);
    }
    const e = R.entrance;
    if (e && (!Array.isArray(e.steps) || e.steps.length > 16
      || e.steps.some((s) => !Number.isInteger(s) || s < 0 || s >= 16)
      || ![e.level, e.cents, e.seconds].every(Number.isFinite)
      || e.level < 0 || e.level > 1 || e.cents < 0 || e.cents > 1200
      || e.seconds < 0.03 || e.seconds > 0.25))
      throw new Error('mined riff entrance needs bar steps and bounded low transient controls');
    const a = R.articulation;
    if (!a || !Number.isInteger(a.lowerNeighbor) || a.lowerNeighbor < 0 || a.lowerNeighbor > 2
      || ![a.slide, a.change].every((v) => Number.isFinite(v) && v > 0 && v <= 0.1))
      throw new Error('mined riff articulation needs a 0–2 semitone approach and positive pitch-transition times up to 0.1 seconds');
    return Object.freeze({ ...R, id, articulation: Object.freeze({ ...a }) }) as Riff;
  } catch (error) {
    throw new Error(`riff row ${id}: ${(error as Error).message}`);
  }
}

/**
 * **The riff rows**, by id (liquid-riffs-2, 10-08): V's, the place's first, and the
 * three read off source 8 beside it. Each is read and checked once, here; a place
 * names the ones its themes draw (`RiffEntry`).
 */
/** The riff rows as written, in the table's order, for what reads a row whole (the measurement stamp). */
export const RIFF_ROWS: readonly unknown[] = Object.freeze([RIFF_ROW, RIFF_HELD_ROW, RIFF_STAIRS_ROW]);
/** The phrased cells' row as written. */
export const PHRASED_ROWS: readonly unknown[] = Object.freeze([PHRASED_ROW]);
/** Riff rows by id, each read by `loadRiff`; two rows of one id are refused rather than one overwriting the other. */
export function riffsOf(rows: readonly unknown[]): Readonly<Record<string, Riff>> {
  const out: Record<string, Riff> = {};
  for (const row of rows) {
    const r = loadRiff(row);
    if (Object.hasOwn(out, r.id)) throw new Error(`riff row ${r.id}: two rows carry this id`);
    out[r.id] = r;
  }
  return Object.freeze(out);
}
const RIFFS: Readonly<Record<string, Riff>> = riffsOf(RIFF_ROWS);
/** Every riff row's id, for the checks. */
export const RIFF_IDS: readonly string[] = Object.freeze(Object.keys(RIFFS));
/** The riff a row id names; null for an id no row carries. */
export const riffOf = (id: string): Riff | null => RIFFS[id] ?? null;
/** The riff where no place names one: the first row of the riff rows (V's, the liquid place's own), by its place in the list and never by its name. */
export const RIFF_DEFAULT: Riff = Object.values(RIFFS)[0];

/**
 * **The riffs by place** (liquid-riffs-2, 10-08): the riff rows a place's themes
 * draw among, by weight. The nearest entry to the playing birds and tempo is read
 * (`nearestEntry`), as every place table is, and the theme draws one of its rows
 * off a stream of its own, so no other die moves.
 */
export interface RiffEntry extends PlaceEntry { rows: ReadonlyArray<{ v: string; w: number }> }
/** Everything wrong with a riff table, as sentences: every row a riff, every weight positive. */
export function riffTableFaults(table: readonly RiffEntry[]): string[] {
  const bad: string[] = [];
  for (const e of table) {
    if (!Array.isArray(e.rows) || !e.rows.length) bad.push(`${e.id}: no riff rows`);
    for (const r of e.rows ?? []) {
      if (!RIFFS[r.v]) bad.push(`${e.id}: ${r.v} is not a riff row`);
      if (!(Number.isFinite(r.w) && r.w > 0)) bad.push(`${e.id}: ${r.v} weighs ${r.w}`);
    }
  }
  return bad;
}
/** **The theme's riff**: one of the entry's rows by weight off `<seed>::riffrow`; V's where no entry is near. */
export function drawRiff(seed: string, entry: RiffEntry | null): Riff {
  if (!entry || !entry.rows.length) return RIFF_DEFAULT;
  return RIFFS[new Rng(`${seed}::riffrow`).weighted(entry.rows)] ?? RIFF_DEFAULT;
}

/** A selected run after a real rest, never an internal glide or bar boundary.
 * The recipe owns the musical choice; the voice only sees physical controls. */
export function minedEntrance(riff: Riff, step: number, previousEnd: number | undefined): Record<string, number> | null {
  const e = riff.entrance;
  return e && e.level > 0 && previousEnd !== undefined && step > previousEnd + 0.01 && e.steps.includes(step)
    ? { subEntryLevel: e.level, subEntryCents: e.cents, subEntrySeconds: e.seconds } : null;
}

export interface MinedLine { seed: string; shapes: Record<string, MinedNote[]>; riff: Riff }
/** A theme's riff: each shape's non-home notes moved to a vocabulary neighbour at even odds, once per theme (and per switch-up). */
export function rollMined(riff: Riff, seed: string, tag = ''): MinedLine {
  const r = new Rng(`${seed}::mined${tag}`);
  const shapes: Record<string, MinedNote[]> = {};
  for (const [k, notes] of Object.entries(riff.shapes)) shapes[k] = notes.map((n) => {
    if (n[2] === 0 || !r.chance(riff.moveP)) return n;
    const i = riff.vocab.indexOf(n[2]);
    const j = Math.max(0, Math.min(riff.vocab.length - 1, i + (r.chance(0.5) ? 1 : -1) * (r.chance(riff.oneStepP) ? 1 : 2)));
    // a note outside the vocabulary has no neighbours to move to: kept as written, its draws made all the same so no
    // later note's stream moves (V's D[3], 6 over home, which no run of its phrase names)
    if (i < 0) return n;
    return [n[0], n[1], riff.vocab[j] === 0 ? n[2] : riff.vocab[j], n[3]] as MinedNote;
  });
  return { seed: `${seed}::mined${tag}`, shapes, riff };
}
