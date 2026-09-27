// The theme: a small object stated once and developed, and the family box a
// concrete one is rolled inside.
//
// `notes/plans/PLAN-MOTIF.md`, round T1, from Eugene's question of 09-19:
// *"Each track should have a theme — simple for ambient, stupid for drum and
// bass, but for deep house a little progression of interesting melodic stuff
// gives the song coherence. I'm not sure we ever encoded that part."* We never
// did. The composer has harmony (the corpus's chord loops), figures (mined
// masks and a rate per lane) and timbre (the kitchen); what it has had no word
// for is an **object** — a shape you could hum, that comes back.
//
// Two things live here and they are deliberately separate:
//
//   a **motif**, which is degrees, a rhythm cell, a register and accents, and
//   is **relative to everything**: degrees against the chord that is sounding,
//   durations against the bar, a register that is a role and never a voice. So
//   a motif survives a key, a chord, an instrument and a year — the same rule
//   a recipe lives under, which is why a motif can be one.
//
//   a **family**, which is a *box* a motif is rolled inside: a contour class,
//   the share of its moves that are steps rather than leaps, how long its cell
//   is, how much of it lands on the grid, how far it reaches, how many notes a
//   bar and how many bars before it returns. **A family names no note.** It is
//   `notes/archive/2026-09-plans/cited/PLAN-MOTIF.md` §2b, which is Eugene's own shape for this: *"maybe the melody
//   part should use recipes as a vehicle, at least for general families of
//   melodies, not a particular melody."*
//
// The grammar between them is eight weighted dice — repeat, sequence, invert,
// augment, diminish, fragment, answer, rest — and the section says which of
// them may fire: **stated in the groove, fragmented in the build, whole in the
// drop, absent in the breakdown so its return is an event, echoed in the
// outro.** A two-chord deep house vamp holds together because one hook rides
// the pedal and comes back.
//
// Nothing in this file knows an instrument, a bus, a level or a hertz.

import { SCALES } from './theory.ts';

/** Which part of the register states the theme. A role, never a voice. */
export type Register = 'bass' | 'mid' | 'lead';
export const REGISTERS: readonly Register[] = Object.freeze(['bass', 'mid', 'lead'] as const);

/** The shapes a line can have, as a closed word. */
export type Contour = 'arch' | 'rise' | 'fall' | 'wave' | 'pedal';
export const CONTOURS: readonly Contour[] = Object.freeze(['arch', 'rise', 'fall', 'wave', 'pedal'] as const);

/** A pair of numbers a roll happens between, low first. */
export type Span = [number, number];

/**
 * One theme. `degrees` are **scale degrees above the chord's own degree** — 0
 * is the note the chord is built on, 2 is a third above it in the mode, and a
 * negative one is below — and `cell` is the same length, in sixteenths of a
 * bar. `accent` is what a hand gives each note, 0..1.
 */
export interface Motif {
  degrees: number[];
  cell: number[];
  register: Register;
  accent: number[];
  /** Optional sounding lengths in beats; gaps in the cell remain rests. */
  holds?: number[];
}

/** An ordered relative-note path, independent of key, tempo and instrument. */
export interface MotifPath {
  degrees: number[];
  beats: number[];
  holds?: number[];
  accents?: number[];
}
export function motifFromPath(path: MotifPath, register: Register): Motif {
  return { degrees: [...path.degrees], cell: path.beats.map(n => n * 4), register,
    accent: path.accents ? [...path.accents] : path.degrees.map(() => 1),
    ...(path.holds ? { holds: [...path.holds] } : {}) };
}
export function pathProblems(path: any): string[] {
  if (!path || typeof path !== 'object' || Array.isArray(path)) return ['path must be an object'];
  const bad: string[] = [];
  if (Object.keys(path).some(k => !['degrees', 'beats', 'holds', 'accents'].includes(k))) bad.push('unknown path field');
  if (!Array.isArray(path.degrees) || !path.degrees.length || path.degrees.length > 64 || path.degrees.some((d: any) => !Number.isInteger(d) || Math.abs(d) > 14)) bad.push('use 1–64 relative scale degrees within two octaves');
  if (!Array.isArray(path.beats) || path.beats.length !== path.degrees?.length || path.beats.some((b: any) => !Number.isFinite(b) || b < .25 || b > 64 || !Number.isInteger(b * 4)) || path.beats.reduce((a: number,b: number) => a+b,0) > 64) bad.push('one positive sixteenth-grid beat spacing per note, at most 64 beats total');
  for (const key of ['holds','accents']) if (path[key] !== undefined) {
    if (!Array.isArray(path[key]) || path[key].length !== path.degrees?.length || path[key].some((v: any,i: number) => !Number.isFinite(v) || v <= 0 || v > (key === 'holds' ? path.beats?.[i] : 1))) bad.push(`one bounded ${key} value per note`);
  }
  return bad;
}

/** A family bounded by musical readings, optionally retaining ordered paths. */
export interface MotifBox {
  contour: Contour;
  /** Choose a whole ordered path, preserving its intervals and rests. */
  paths?: MotifPath[];
  /** the shares of the moves that are steps and that are leaps */
  intervals: { steps: Span; leaps: Span };
  /** how long the cell is, in beats */
  cell: { beats: Span };
  /** Optional onset lattice in beats, including the end of the cell. */
  grid?: { beats: number };
  /** how much of it lands on a beat of the bar */
  onGrid: Span;
  /** how far the line reaches, top to bottom */
  range: { semitones: Span };
  /** notes a bar */
  density: Span;
  /** how many bars before it comes back */
  returns: { bars: Span };
}

/** A family as the library carries one: a box, a register, a name and a share. */
export interface MotifFamily {
  id: string;
  name: string;
  register: Register;
  weight: number;
  box: MotifBox;
  note: string;
}

// --- reading a motif ---------------------------------------------------------
//
// Every one of these is the **measurement** the matching field of a box is a
// range of, so a family's box and a motif's reading are the same seven numbers
// taken twice — the same relation `boxOf` and an imprint have in `recipe.ts`.

/** Sixteen steps to the bar, the grid this music has always been written on. */
export const STEPS_PER_BAR = 16;

/**
 * How far a run of degrees reaches, in semitones, **read in the minor scale**.
 * The mode a theme is in is the theme's; a box is a description of a shape, and
 * a shape measured in one mode and compared in another would be a box that
 * changes width with the key. Minor is 80 % of the record.
 */
export function spanSemitones(degrees: readonly number[]): number {
  const scale = SCALES.minor;
  const pitch = degrees.map((d) => {
    const len = scale.length;
    const oct = Math.floor(d / len);
    return scale[((d % len) + len) % len] + 12 * oct;
  });
  return Math.max(...pitch) - Math.min(...pitch);
}

/** The share of moves that are one scale step, and the share that are leaps. */
export function moveShares(degrees: readonly number[]): { steps: number; leaps: number } {
  const moves = degrees.slice(1).map((d, i) => Math.abs(d - degrees[i])).filter((d) => d !== 0);
  if (!moves.length) return { steps: 0, leaps: 0 };
  const steps = moves.filter((d) => d === 1).length;
  return { steps: steps / moves.length, leaps: (moves.length - steps) / moves.length };
}

/** Where the onsets fall, and how many of them land on a beat. */
export function onsetsOf(cell: readonly number[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const d of cell) { out.push(at); at += d; }
  return out;
}

export const onGridShare = (cell: readonly number[]): number => {
  const on = onsetsOf(cell);
  return on.length ? on.filter((s) => s % 4 === 0).length / on.length : 0;
};

/** How long the cell is, in beats, and how many notes a bar that works out at. */
export const cellBeats = (cell: readonly number[]): number => cell.reduce((a, b) => a + b, 0) / 4;
export const densityOf = (m: Motif): number => (cellBeats(m.cell) > 0 ? m.degrees.length / (cellBeats(m.cell) / 4) : 0);

/**
 * Which shape a run of degrees has. The classes are exclusive and are tried in
 * the order a musician would: is it a pedal at all, does it only go one way,
 * does it turn once, or does it wander.
 */
export function contourOf(degrees: readonly number[]): Contour {
  if (degrees.length < 2) return 'pedal';
  const counts = new Map<number, number>();
  for (const d of degrees) counts.set(d, (counts.get(d) || 0) + 1);
  const most = Math.max(...counts.values());
  if (most / degrees.length >= 0.6) return 'pedal';
  const moves = degrees.slice(1).map((d, i) => d - degrees[i]).filter((d) => d !== 0);
  if (!moves.length) return 'pedal';
  const up = moves.filter((d) => d > 0).length / moves.length;
  if (up >= 0.8) return 'rise';
  if (up <= 0.2) return 'fall';
  // One turn is an arch: everything up to the highest note rises and
  // everything after it falls, and the peak is not an end.
  const peak = degrees.indexOf(Math.max(...degrees));
  if (peak > 0 && peak < degrees.length - 1) {
    const before = degrees.slice(0, peak + 1);
    const after = degrees.slice(peak);
    const rising = before.slice(1).every((d, i) => d >= before[i]);
    const falling = after.slice(1).every((d, i) => d <= after[i]);
    if (rising && falling) return 'arch';
  }
  return 'wave';
}

/** Every reading of a motif, in the words a box is written in. */
export function readMotif(m: Motif): {
  contour: Contour; steps: number; leaps: number; beats: number; onGrid: number; semitones: number; density: number;
} {
  const sh = moveShares(m.degrees);
  return {
    contour: contourOf(m.degrees),
    steps: sh.steps,
    leaps: sh.leaps,
    beats: cellBeats(m.cell),
    onGrid: onGridShare(m.cell),
    semitones: spanSemitones(m.degrees),
    density: densityOf(m),
  };
}

/** Is this motif inside that box? Every axis at once, `returns` excepted. */
export function insideBox(m: Motif, box: MotifBox): string[] {
  const r = readMotif(m);
  const out: string[] = [];
  const within = (x: number, s: Span, what: string) => {
    if (!(x >= s[0] - 1e-9 && x <= s[1] + 1e-9)) out.push(`${what} ${+x.toFixed(3)} outside ${s[0]}..${s[1]}`);
  };
  if (r.contour !== box.contour) out.push(`contour ${r.contour}, not ${box.contour}`);
  within(r.steps, box.intervals.steps, 'the share of steps');
  within(r.leaps, box.intervals.leaps, 'the share of leaps');
  within(r.beats, box.cell.beats, 'the cell');
  within(r.onGrid, box.onGrid, 'what is on the grid');
  within(r.semitones, box.range.semitones, 'the reach');
  within(r.density, box.density, 'the density');
  if (box.grid && m.cell.some(n => Math.abs(n / (box.grid!.beats * 4) - Math.round(n / (box.grid!.beats * 4))) > 1e-9))
    out.push(`the cell leaves its ${box.grid.beats}-beat lattice`);
  return out;
}

/** What is wrong with this motif, as a shape. An empty list is a good one. */
export function motifFaults(m: any): string[] {
  const bad: string[] = [];
  if (!m || typeof m !== 'object') return ['not an object'];
  if (!Array.isArray(m.degrees) || !m.degrees.length) bad.push('degrees is not a list of notes');
  if (!Array.isArray(m.cell) || !m.cell.length) bad.push('cell is not a list of lengths');
  if (Array.isArray(m.degrees) && Array.isArray(m.cell) && m.degrees.length !== m.cell.length)
    bad.push(`${m.degrees.length} degrees against ${m.cell.length} lengths`);
  if (Array.isArray(m.accent) && Array.isArray(m.degrees) && m.accent.length !== m.degrees.length)
    bad.push('an accent for every note, or none');
  if (!REGISTERS.includes(m.register)) bad.push(`register ${JSON.stringify(m.register)} is not one of ${REGISTERS.join(', ')}`);
  for (const d of Array.isArray(m.degrees) ? m.degrees : []) {
    if (!Number.isInteger(d)) bad.push(`degree ${JSON.stringify(d)} is not a whole scale degree`);
  }
  for (const c of Array.isArray(m.cell) ? m.cell : []) {
    if (!Number.isFinite(c) || c <= 0) bad.push(`a length of ${JSON.stringify(c)} is not a length`);
  }
  for (const a of Array.isArray(m.accent) ? m.accent : []) {
    if (!Number.isFinite(a) || a < 0 || a > 1) bad.push(`an accent of ${JSON.stringify(a)} is not in 0..1`);
  }
  if (Array.isArray(m.cell) && cellBeats(m.cell) > 64) bad.push('a cell longer than sixteen bars is a section');
  if (m.holds !== undefined && (!Array.isArray(m.holds) || m.holds.length !== m.cell?.length
    || m.holds.some((n: number,i: number) => !Number.isFinite(n) || n <= 0 || n * 4 > m.cell[i]))) bad.push('one sounding length in beats within each cell interval');
  return bad;
}

// --- rolling one inside a family ---------------------------------------------

/** What a roll needs off the theme's own stream. Only these four calls. */
export interface MotifRng {
  float: (a: number, b: number) => number;
  int: (a: number, b: number) => number;
  chance: (p: number) => boolean;
  pickWeighted: <T>(list: T[]) => T | undefined;
}

const inSpan = (rng: MotifRng, s: Span) => rng.float(s[0], s[1]);

/**
 * How few notes each shape needs before it **is** that shape. Two notes are a
 * rise whatever anybody meant by them, and a wave has to turn twice or it is a
 * line: these are the arithmetic of `contourOf` read backwards, so a roll can
 * never ask for a shape its own note count cannot carry.
 */
const LEAST: Readonly<Record<Contour, number>> = Object.freeze({ pedal: 3, arch: 3, wave: 4, rise: 2, fall: 2 });

/**
 * The share of moves that may be single steps, once **both** halves of the box
 * have had their say. `steps` and `leaps` are shares of the same moves and sum
 * to one, so a box that says steps 0.3..1 and leaps 0..0.7 says one thing twice
 * and a box that disagrees with itself is narrowed to where the two agree.
 */
function stepSpan(box: MotifBox): Span {
  const lo = Math.max(box.intervals.steps[0], 1 - box.intervals.leaps[1]);
  const hi = Math.min(box.intervals.steps[1], 1 - box.intervals.leaps[0]);
  return hi >= lo ? [lo, hi] : [lo, lo];
}

/**
 * `k` single steps and the rest leaps, in an order the stream decides.
 *
 * **How big a leap may be is the box's own reach**, and that is not a detail:
 * a family that asks for twenty semitones over five notes cannot be built out
 * of leaps of a third, and a roll that tried would be refused by its own box
 * every time. The cap is whatever the widest move would have to be to cross
 * the reach in the moves the contour has going one way, with one degree of
 * slack, held between a third and a seventh.
 */
function magnitudes(rng: MotifRng, moves: number, stepShare: number, maxLeap: number): number[] {
  const hi = Math.max(3, Math.min(8, Math.round(maxLeap) + 1));
  const k = Math.max(0, Math.min(moves, Math.round(stepShare * moves)));
  const out = [
    ...new Array(k).fill(1),
    ...Array.from({ length: moves - k }, () => rng.int(2, hi)),
  ];
  // A shuffle off the same stream, so which move is the leap is the seed's.
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/**
 * The degree path of one contour, over `n` notes, with `stepShare` of its moves
 * a single scale degree.
 *
 * The shapes are **written out rather than searched for**, so a rolled motif is
 * in its family's class by construction and `contourOf` reading it back is a
 * check rather than a hope. What is not by construction is the reach, which
 * falls out of the magnitudes: `rollMotif` reads it and draws again.
 */
function pathOf(rng: MotifRng, contour: Contour, n: number, stepShare: number, maxLeap: number): number[] {
  if (contour === 'pedal') {
    // A pedal is one note with a neighbour in it: the note that makes it a
    // figure rather than a drone, on at most two fifths of the beats, so the
    // home note is still what `contourOf` counts a pedal by.
    const away = Math.max(1, Math.min(Math.floor(n * 0.4), Math.round(n * 0.3)));
    const when = new Set<number>();
    let guard = 0;
    while (when.size < away && guard++ < 64) when.add(rng.int(1, n));
    const size = magnitudes(rng, when.size, stepShare, maxLeap);
    const out = [0];
    let k = 0;
    for (let i = 1; i < n; i++) out.push(when.has(i) ? size[k++] ?? 1 : 0);
    return out;
  }
  const size = magnitudes(rng, n - 1, stepShare, maxLeap);
  const out = [0];
  let at = 0;
  if (contour === 'rise' || contour === 'fall') {
    const sign = contour === 'rise' ? 1 : -1;
    for (let i = 0; i < n - 1; i++) { at += sign * size[i]; out.push(at); }
    return out;
  }
  if (contour === 'arch') {
    // Up to a peak that is neither end, then down: monotone on both sides,
    // which is exactly what `contourOf` asks an arch for.
    const peak = Math.max(1, Math.min(n - 2, 1 + rng.int(0, n - 2)));
    for (let i = 0; i < n - 1; i++) { at += (i < peak ? 1 : -1) * size[i]; out.push(at); }
    return out;
  }
  // A wave turns at least twice, which is the class `contourOf` is left with
  // once a rise, a fall and an arch have all been refused.
  const turns = new Set<number>();
  let guard = 0;
  while (turns.size < 2 && guard++ < 64) turns.add(1 + rng.int(0, Math.max(1, n - 2)));
  let sign = 1;
  for (let i = 0; i < n - 1; i++) {
    if (turns.has(i)) sign = -sign;
    at += sign * size[i];
    out.push(at);
  }
  return out;
}

/**
 * The cell: `n` onsets over `beats` beats, `want` of them on a beat.
 *
 * `want` is a **count** and not a share, because what a cell can actually be is
 * `k` of `n` and nothing between: a five-note cell is on the grid 0.2, 0.4, 0.6
 * of the time and never 0.33, and a box asking for 0.29 to 0.38 of a five-note
 * cell is asking for something that does not exist. Who decides which `k` is
 * the caller's, above, where the note count is still open.
 */
function cellOf(rng: MotifRng, n: number, beats: number, want: number, grid = .25): number[] {
  const total = Math.max(n, Math.round(beats * 4));
  const beatSteps: number[] = [];
  const offSteps: number[] = [];
  for (let s = 0; s < total; s += grid * 4) (s % 4 === 0 ? beatSteps : offSteps).push(s);
  const steps = new Set<number>([0]);
  const take = (pool: number[]) => {
    const free = pool.filter((s) => !steps.has(s));
    if (!free.length) return false;
    steps.add(free[rng.int(0, free.length)]);
    return true;
  };
  while ([...steps].filter((s) => s % 4 === 0).length < want && take(beatSteps));
  let guard = 0;
  while (steps.size < n && guard++ < 64) if (!take(offSteps) && !take(beatSteps)) break;
  const list = [...steps].sort((a, b) => a - b);
  return list.map((s, i) => (i + 1 < list.length ? list[i + 1] - s : total - s));
}

/** One draw, before it has been read back. */
/**
 * **How many notes, and how many of them on a beat.** Both at once, because the
 * two constrain each other: the density band says how many notes a bar of this
 * cell may hold, and what falls on the grid can only ever be one of those notes
 * over all of them. A note count that admits no whole number of on-beat notes
 * inside the box's own band is a note count this family cannot use, whatever
 * the density says — so the count is drawn from the ones that work rather than
 * from the middle of the band and then refused.
 */
function countsFor(rng: MotifRng, box: MotifBox, beats: number): { n: number; want: number } | null {
  const bars = beats / 4;
  const lo = Math.max(LEAST[box.contour], Math.ceil(box.density[0] * bars - 1e-9));
  const hi = Math.min(12, Math.floor(box.density[1] * bars + 1e-9));
  const works: Array<{ n: number; want: number }> = [];
  for (let n = lo; n <= hi; n++) {
    if (box.grid && n > beats / box.grid.beats) continue;
    for (let k = Math.max(1, Math.ceil(box.onGrid[0] * n - 1e-9)); k <= Math.min(n, Math.floor(box.onGrid[1] * n + 1e-9)); k++) {
      if (box.grid) {
        const on = Math.ceil(beats / Math.max(1, box.grid.beats));
        if (k > on || n - k > beats / box.grid.beats - on) continue;
      }
      works.push({ n, want: k });
    }
  }
  if (!works.length) return null;
  return works[rng.int(0, works.length)];
}

function drawMotif(family: MotifFamily, rng: MotifRng): Motif | null {
  const box = family.box;
  if (box.paths) {
    if (!box.paths.length || box.paths.length > 8 || box.paths.some(p => pathProblems(p).length)) return null;
    const candidates = box.paths.map(p => motifFromPath(p, family.register));
    // A malformed family is not repaired by silently dropping one of its paths.
    if (candidates.some(m => insideBox(m, box).length)) return null;
    return candidates[rng.int(0, candidates.length)];
  }
  const beats = box.grid
    ? box.grid.beats * rng.int(Math.ceil(box.cell.beats[0] / box.grid.beats), Math.floor(box.cell.beats[1] / box.grid.beats) + 1)
    : Math.max(1, Math.round(inSpan(rng, box.cell.beats)));
  const counts = countsFor(rng, box, beats);
  if (!counts) return null;
  const n = counts.n;
  // The reach the box asks for, in scale degrees — a step of this scale is a
  // tone more often than a semitone — and the widest move that would have to be
  // to cross it in the moves one direction of this contour gets.
  const reach = Math.max(1, Math.round(inSpan(rng, box.range.semitones) / 2));
  const oneWay = box.contour === 'rise' || box.contour === 'fall' ? n - 1
    : box.contour === 'arch' ? Math.max(1, Math.round((n - 1) / 2))
      : box.contour === 'pedal' ? 1 : Math.max(1, Math.round((n - 1) / 3));
  const degrees = pathOf(rng, box.contour, n, inSpan(rng, stepSpan(box)), reach / oneWay);
  const cell = cellOf(rng, degrees.length, beats, counts.want, box.grid?.beats);
  // What a hand gives it: the first note strongest, one other lifted, the rest
  // level. An accent is a shape and not a level, so it is 0..1 and whatever
  // velocity the part already had is what it multiplies.
  const lift = rng.int(1, Math.max(2, degrees.length));
  const accent = degrees.map((_, i) => (i === 0 ? 1 : i === lift ? 0.85 : 0.6));
  return { degrees, cell: cell.slice(0, degrees.length), register: family.register, accent };
}

/**
 * How many times a roll may be asked again before the family is the thing at
 * fault. The reach is the one axis a path cannot hit by construction — it falls
 * out of the magnitudes, and the magnitudes are what carry the interval shares
 * — so a draw is read back and drawn again when it lands outside the box.
 *
 * Twelve, and `npm run check` reports how many are really needed: a family
 * whose own rolls rarely land in it is a family written wrongly, and the number
 * is how that shows.
 */
export const ATTEMPTS = 12;

/**
 * **A concrete theme, rolled inside a family's box, off the seed's own stream.**
 * Two tracks on one family are cousins and never twins, which is the same thing
 * a recipe's box says about a whole record.
 *
 * Read back before it is handed over, and drawn again where it landed outside —
 * so what leaves here is **inside the box or it is the family's own calibration
 * motif**, which is authored and is held inside the box by the gate. There is
 * no third answer: a theme that is not in its family is not a theme.
 */
export function rollMotif(family: MotifFamily, rng: MotifRng): Motif | null {
  for (let i = 0; i < ATTEMPTS; i++) {
    const m = drawMotif(family, rng);
    if (m && !motifFaults(m).length && !insideBox(m, family.box).length) return m;
  }
  // **A box is a promise.** Where the family has authored motifs of its own —
  // the three that ship do — one of them is the answer, and it is inside the
  // box because the gate holds it there. Where it has none, which is every
  // mined family, the answer is **nothing**: a track whose theme could not be
  // rolled has no theme, and that is a fact about the box rather than a motif
  // somebody is going to hear as one.
  const authored = CALIBRATION.filter((c) => c.family === family.id
    && c.motif.register === family.register && !insideBox(c.motif, family.box).length);
  if (!authored.length) return null;
  const pick = authored[rng.int(0, authored.length)];
  return { ...pick.motif, degrees: [...pick.motif.degrees], cell: [...pick.motif.cell], accent: [...pick.motif.accent] };
}

/** How many draws one roll really took, for a gate that has to report it. */
export function rollAttempts(family: MotifFamily, rng: MotifRng): number {
  for (let i = 0; i < ATTEMPTS; i++) {
    const m = drawMotif(family, rng);
    if (m && !motifFaults(m).length && !insideBox(m, family.box).length) return i + 1;
  }
  return ATTEMPTS + 1;
}

// --- the grammar -------------------------------------------------------------

/** The eight moves a theme is developed by. `notes/archive/2026-09-plans/cited/PLAN-MOTIF.md` §2. */
export type Move = 'repeat' | 'sequence' | 'invert' | 'augment' | 'diminish' | 'fragment' | 'answer' | 'rest';
export const MOVES: readonly Move[] = Object.freeze([
  'repeat', 'sequence', 'invert', 'augment', 'diminish', 'fragment', 'answer', 'rest',
] as const);

/**
 * One move, applied. `shift` is how far the next chord's own degree is from
 * this one's, in scale degrees, which is what makes a **sequence** land on the
 * next chord rather than somewhere near it; `null` back is a rest.
 *
 * Nothing here reads a chord, a key or a bar: the caller resolves degrees
 * against whatever is sounding, exactly as it does for the mined masks.
 */
export function develop(m: Motif, move: Move, { shift = 0 }: { shift?: number } = {}): Motif | null {
  const n = m.degrees.length;
  const half = Math.max(1, Math.ceil(n / 2));
  switch (move) {
    case 'repeat':
      return m;
    case 'sequence':
      return { ...m, degrees: m.degrees.map((d) => d + shift) };
    case 'invert': {
      const about = m.degrees[0];
      return { ...m, degrees: m.degrees.map((d) => 2 * about - d) };
    }
    case 'augment':
      return { ...m, cell: m.cell.map((c) => c * 2), ...(m.holds ? { holds: m.holds.map(n => n * 2) } : {}) };
    case 'diminish': {
      const cell = m.cell.map((c) => Math.max(1, Math.round(c / 2)));
      return { ...m, cell, ...(m.holds ? { holds: m.holds.map((n, i) => Math.min(n / 2, cell[i] / 4)) } : {}) };
    }
    case 'fragment':
      return { ...m, degrees: m.degrees.slice(0, half), cell: m.cell.slice(0, half), accent: m.accent.slice(0, half), ...(m.holds ? { holds: m.holds.slice(0, half) } : {}) };
    case 'answer': {
      // The tail, brought home: the same notes, moved so the last of them is
      // the chord's own. A question ends away and an answer ends at rest.
      const tail = m.degrees.slice(n - half);
      const home = tail[tail.length - 1];
      return {
        ...m,
        degrees: tail.map((d) => d - home),
        cell: m.cell.slice(n - half),
        accent: m.accent.slice(n - half),
        ...(m.holds ? { holds: m.holds.slice(n - half) } : {}),
      };
    }
    case 'rest':
    default:
      return null;
  }
}

/**
 * **Where a theme goes in a track.** `notes/archive/2026-09-plans/cited/PLAN-MOTIF.md` §2: stated in the groove,
 * fragmented in the build, whole in the drop, **absent in the breakdown so its
 * return is an event**, echoed in the outro. An intro is absent for the same
 * reason the breakdown is: a hook you have not heard yet cannot come back.
 *
 * `whole` says the section may not cut it — a drop that fragments its own theme
 * is a drop that has nothing to drop — and it is what the gate reads.
 */
export interface Placement {
  plays: boolean;
  whole: boolean;
  moves: ReadonlyArray<{ v: Move; w: number }>;
}

const SILENT: Placement = Object.freeze({ plays: false, whole: false, moves: Object.freeze([]) });

export const PLACEMENT: Readonly<Record<string, Placement>> = Object.freeze({
  // The groove is where it is stated, and where it is varied without being
  // taken apart: it repeats, it moves with the chord, and once in a while it
  // turns over.
  main: Object.freeze({ plays: true, whole: true, moves: Object.freeze([
    { v: 'repeat' as Move, w: 5 }, { v: 'sequence' as Move, w: 3 }, { v: 'invert' as Move, w: 1 }, { v: 'diminish' as Move, w: 1 },
  ]) }),
  // A drop states it whole and does nothing else to it.
  drop: Object.freeze({ plays: true, whole: true, moves: Object.freeze([
    { v: 'repeat' as Move, w: 6 }, { v: 'sequence' as Move, w: 1 },
  ]) }),
  // A build takes it apart: the head, quicker, and then the wait.
  build: Object.freeze({ plays: true, whole: false, moves: Object.freeze([
    { v: 'fragment' as Move, w: 4 }, { v: 'diminish' as Move, w: 2 }, { v: 'rest' as Move, w: 1 },
  ]) }),
  // Absent, so the return is an event.
  breakdown: SILENT,
  intro: SILENT,
  // An echo: the tail of it, and then silence.
  outro: Object.freeze({ plays: true, whole: false, moves: Object.freeze([
    { v: 'answer' as Move, w: 3 }, { v: 'fragment' as Move, w: 2 }, { v: 'rest' as Move, w: 3 },
  ]) }),
});

/** What this section may do to the theme; a kind nobody wrote a row for is silent. */
export const placementOf = (kind: string): Placement => PLACEMENT[kind] || SILENT;

// --- the three authored house families ---------------------------------------
//
// `notes/archive/2026-09-plans/cited/PLAN-MOTIF.md` §3: authored first, mined second. These three are convention
// written down — the pump a bass plays under a two-chord vamp, the lick a
// keyboard answers it with, and the question-and-answer that carries a
// four-bar phrase — and every number in them is a proportion. They are the
// library's first `motif` rows (`recipes/motif-*.json`, built by `motifRecipe`
// below and held to these by `npm run check`), so a listener can keep one, the
// chef can score one and the miner can propose a fourth.

export const HOUSE_FAMILIES: readonly MotifFamily[] = Object.freeze([
  Object.freeze({
    id: 'house/pump',
    name: 'the pump',
    register: 'bass' as Register,
    weight: 1,
    note: 'Two notes under a two-chord vamp: the root, and one move away from it and back. '
      + 'It is what the corpus measures as the commonest bass bar in 2966 — one note, then held — '
      + 'with the one neighbour that makes it a figure rather than a drone.',
    box: Object.freeze({
      contour: 'pedal' as Contour,
      // A pedal is a class about **how often** the line moves and not about how
      // far, so the two interval shares are the whole of 0..1 here on purpose:
      // the root and its ninth is all steps and the root and the fifth under it
      // is all leaps, and both are the pump. The contour and the density are
      // what say what this family is.
      intervals: { steps: [0, 1] as Span, leaps: [0, 1] as Span },
      cell: { beats: [2, 4] as Span },
      onGrid: [0.5, 1] as Span,
      range: { semitones: [2, 12] as Span },
      density: [1.5, 4.5] as Span,
      returns: { bars: [2, 8] as Span },
    }),
  }),
  Object.freeze({
    id: 'house/lick',
    name: 'the lick',
    register: 'lead' as Register,
    weight: 1,
    note: 'A line between the chords: four to seven notes that go up and come back, mostly by step, '
      + 'mostly on the beat. It is the part the record has never had — a figure above middle C with a '
      + 'shape of its own instead of a grid of chords.',
    box: Object.freeze({
      contour: 'arch' as Contour,
      intervals: { steps: [0.3, 1] as Span, leaps: [0, 0.7] as Span },
      cell: { beats: [2, 4] as Span },
      onGrid: [0.3, 0.9] as Span,
      range: { semitones: [3, 14] as Span },
      density: [2, 6.5] as Span,
      returns: { bars: [4, 8] as Span },
    }),
  }),
  Object.freeze({
    id: 'house/answer',
    name: 'the answer',
    register: 'lead' as Register,
    weight: 0.7,
    note: 'A question that wanders and comes home: a longer cell, more turns in it, and a reach wide '
      + 'enough to be a phrase rather than a figure. It is the one of the three that wants the '
      + 'grammar — stated, then answered — and the one a build has something to fragment.',
    box: Object.freeze({
      contour: 'wave' as Contour,
      intervals: { steps: [0, 0.9] as Span, leaps: [0.1, 1] as Span },
      cell: { beats: [4, 8] as Span },
      onGrid: [0.2, 0.8] as Span,
      range: { semitones: [5, 19] as Span },
      density: [1.5, 4] as Span,
      returns: { bars: [8, 16] as Span },
    }),
  }),
] as MotifFamily[]);

export const familyById = (id: string): MotifFamily | null =>
  HOUSE_FAMILIES.find((f) => f.id === id || f.id.endsWith('/' + id)) || null;

/**
 * **A library row as a family**, so a row somebody adopted is a family the
 * composer can roll inside without being written into this file. A row that is
 * not a `motif` row, or one whose box is missing, is `null` rather than a
 * family with holes in it.
 */
export function familyOf(recipe: any): MotifFamily | null {
  if (!recipe || recipe.scope !== 'motif' || !recipe.wants || !recipe.wants.motif) return null;
  if (!REGISTERS.includes(recipe.applies)) return null;
  return {
    id: String(recipe.id),
    name: String(recipe.name || recipe.id),
    register: recipe.applies as Register,
    weight: Number.isFinite(recipe.weight) ? recipe.weight : 1,
    box: recipe.wants.motif as MotifBox,
    note: String((recipe.provenance && recipe.provenance.note) || ''),
  };
}

/**
 * **The two fields a reading of audio cannot give.** The miner reads eight-bar
 * windows and measures a bass contour inside them: the shape, the shares of
 * steps and leaps, what falls on the grid, the reach and the density are all
 * properties of those windows. **How long the cell is** and **how many bars
 * before the theme returns** are not — a window has no cell and no return in
 * it — so a mined family is given the house's own two and says so on the row.
 * A family that wants to say otherwise says so by being authored or edited.
 */
export const MINED_CELL: Readonly<{ beats: Span }> = Object.freeze({ beats: [2, 4] as Span });
export const MINED_RETURNS: Readonly<{ bars: Span }> = Object.freeze({ bars: [4, 16] as Span });

/**
 * A mined bass-contour reading as a family's box. It is the composer's word on
 * what such a reading *means*, so it lives here and the miner imports it rather
 * than writing a second version of the same seven fields.
 */
export function boxFromContour(reading: any): MotifBox | null {
  if (!reading || !CONTOURS.includes(reading.contour)) return null;
  const span = (v: any): Span | null => (Array.isArray(v) && v.length === 2 && v.every((n: any) => Number.isFinite(n))
    ? [Math.min(v[0], v[1]), Math.max(v[0], v[1])] as Span : null);
  const steps = span(reading.intervals && reading.intervals.steps);
  const leaps = span(reading.intervals && reading.intervals.leaps);
  const onGrid = span(reading.onGrid);
  const semitones = span(reading.range && reading.range.semitones);
  const density = span(reading.density);
  if (!steps || !leaps || !onGrid || !semitones || !density) return null;
  return {
    contour: reading.contour as Contour,
    intervals: { steps, leaps },
    cell: { beats: [...MINED_CELL.beats] as Span },
    onGrid,
    range: { semitones },
    density,
    returns: { bars: [...MINED_RETURNS.bars] as Span },
  };
}

// --- the calibration set -----------------------------------------------------
//
// `notes/archive/2026-09-plans/cited/PLAN-MOTIF.md` §2b: *"the authored motifs of §3 become the calibration set (the
// miner and Eugene's ear judge families against them), not a table the composer
// draws from."* So these twelve are **not drawn**. They are what a family is
// held to: every one of them is a shape a deep house record really plays, in
// scale degrees, and `npm run check` asserts each is a valid motif and each
// falls inside one of the three boxes above. A family that stops containing its
// own calibration is a family somebody widened by accident.

export const CALIBRATION: ReadonlyArray<{ name: string; motif: Motif; family: string }> = Object.freeze([
  { name: 'the root and its ninth', family: 'house/pump',
    motif: { degrees: [0, 0, 1, 0], cell: [4, 4, 4, 4], register: 'bass', accent: [1, 0.6, 0.85, 0.6] } },
  { name: 'the root and the fifth under it', family: 'house/pump',
    motif: { degrees: [0, 0, 4, 0], cell: [8, 2, 4, 2], register: 'bass', accent: [1, 0.6, 0.85, 0.6] } },
  { name: 'the pedal with a seventh in it', family: 'house/pump',
    motif: { degrees: [0, 0, 6, 0], cell: [4, 4, 4, 4], register: 'bass', accent: [1, 0.6, 0.85, 0.6] } },
  { name: 'the octave bounce', family: 'house/pump',
    motif: { degrees: [0, 0, 3, 0], cell: [6, 2, 4, 4], register: 'bass', accent: [1, 0.6, 0.85, 0.6] } },
  { name: 'the three-note answer', family: 'house/lick',
    motif: { degrees: [0, 1, 2, 1], cell: [4, 2, 4, 6], register: 'lead', accent: [1, 0.6, 0.85, 0.6] } },
  { name: 'the offbeat stab lick', family: 'house/lick',
    motif: { degrees: [0, 2, 3, 2, 0], cell: [2, 2, 4, 4, 4], register: 'lead', accent: [1, 0.6, 0.85, 0.6, 0.6] } },
  { name: 'the step up and away', family: 'house/lick',
    motif: { degrees: [0, 1, 3, 2, 1, 0], cell: [2, 2, 2, 2, 4, 4], register: 'lead', accent: [1, 0.6, 0.6, 0.85, 0.6, 0.6] } },
  { name: 'the turn on the fourth', family: 'house/lick',
    motif: { degrees: [0, 1, 2, 1], cell: [4, 2, 4, 6], register: 'lead', accent: [1, 0.6, 0.85, 0.6] } },
  { name: 'the long question', family: 'house/answer',
    motif: { degrees: [0, 2, 1, 4, 2, 3], cell: [4, 4, 4, 6, 4, 10], register: 'lead', accent: [1, 0.6, 0.6, 0.85, 0.6, 0.6] } },
  { name: 'the wandering phrase', family: 'house/answer',
    motif: { degrees: [0, 3, 1, 4, 2], cell: [6, 4, 6, 4, 12], register: 'lead', accent: [1, 0.6, 0.85, 0.6, 0.6] } },
  { name: 'the two-bar sigh', family: 'house/answer',
    motif: { degrees: [0, 4, 2, 5, 3, 1], cell: [4, 4, 6, 4, 6, 8], register: 'lead', accent: [1, 0.6, 0.6, 0.85, 0.6, 0.6] } },
  { name: 'the late arrival', family: 'house/answer',
    motif: { degrees: [0, 2, 5, 3, 6, 4], cell: [6, 2, 4, 6, 4, 10], register: 'lead', accent: [1, 0.6, 0.6, 0.85, 0.6, 0.6] } },
] as Array<{ name: string; motif: Motif; family: string }>);

export default HOUSE_FAMILIES;
