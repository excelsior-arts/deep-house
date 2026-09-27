// The musical rules. The vocabulary is no longer hand-written: bass, stab and
// hat figures are drawn from masks mined out of the reference sets (see
// src/corpus.ts), weighted by how often they actually occur. What stays
// hand-written is how a figure is varied across a phrase and how a contour
// becomes a note under the chord that is sounding.
//
// The grid is 16 steps to the bar. Swing bends the second half of each beat;
// measured at 49.8% it is straight, but the dial is still here.

import type { Settings } from '@deep-house/engine/settings';
import { scaleNote } from './theory.ts';
import type { Chord, Progression } from './theory.ts';
import type Rng from './rng.ts';

export const STEPS_PER_BAR = 16;

/**
 * One row of a mined table: the onset mask, how often that bar occurred in the
 * 2966 analysed, and — where the table carries them — a level per step (the
 * hats) or a contour label per firing step (the bass). `src/corpus.ts` is where
 * they come from and its header says what each table is.
 */
export interface MaskRow {
  /** sixteen characters, `x` where the part fires */
  m: string;
  /** how often it occurred */
  c: number;
  /** a level per step, normalised to the bar */
  v?: number[];
  /** the contour label of each firing step, in order */
  k?: string[];
}

/**
 * The mined tables a figure is drawn from, as this file reads them. It is the
 * reader's half of `style.corpus` and not that table's own shape: what is
 * mined, and out of what, is the corpus's business.
 */
export interface FigureCorpus {
  hats: MaskRow[];
  bass16: MaskRow[];
  stabs: MaskRow[];
  /** how often an open hat was detected on each step of the bar */
  openHatByStep: Record<number, number>;
}

/** One drum's hit: where in the bar, and how hard. */
export interface DrumHit {
  step: number;
  vel: number;
}

/**
 * One hit of the hat family, carrying the **slot** it belongs to and not the
 * instrument playing it: `offbeat`, `open` and `sixteenth` are the three parts
 * one mask decides between and the lane table says who fills each.
 */
export interface HatHit extends DrumHit {
  slot: string;
}

/** One change of the bass line: where the pitch moves, and to what above the chord root. */
export interface BassChange {
  step: number;
  interval: number;
  /** a note carried over the bar line into the next one */
  pickup?: boolean;
  /** thrown an octave up, where the register has room for it */
  octave?: boolean;
}

/** One stab: where, how hard, how long, how rolled, and whether only the top speaks. */
export interface Stab {
  step: number;
  vel: number;
  len: number;
  spread: number;
  top: boolean;
}

/** One note of the piano's arpeggio. */
export interface ArpNote {
  step: number;
  midi: number;
  vel: number;
}

/** One note of the piano's melody, in its own phrase's bars. */
export interface MelodyNote {
  bar: number;
  step: number;
  midi: number;
  vel: number;
  /** on the one or the three, where the chord claims the pitch */
  strong: boolean;
}

// Everything here that used to read the live params table is handed the
// caller's own settings instead (round C). There is no default: a rule that
// falls back to the base table when nobody says which room it is in is a rule
// that plays the wrong room and says nothing about it.

/** @param swing the theme's own, from its settings */
export function stepToBeats(step: number, swing: number): number {
  const beat = Math.floor(step / 4);
  const sub = step % 4;
  const f = [0, swing / 2, swing, swing + (1 - swing) / 2][sub];
  return beat + f;
}

export function maskSteps(mask: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] === 'x') out.push(i);
  return out;
}

// Draw by count, but flattened: the corpus is very top-heavy (one stab mask is
// 434 of 2966 bars) and a generator that always picks the mode is a generator
// with one idea. The exponent keeps the ranking and widens the tail.
function draw<T extends { c: number }>(rng: Rng, list: T[], power = 0.6): T {
  return rng.weighted(list.map((t) => ({ v: t, w: Math.pow(t.c, power) })));
}

// ---------------------------------------------------------------- drums ---

// MEASURED: four on the floor, all four slots within 1% of each other.
export function kickPattern(rng: Rng, { fill, sparse }: { fill: boolean; sparse: boolean }): DrumHit[] {
  const hits: DrumHit[] = [];
  for (let step = 0; step < 16; step += 4) {
    if (sparse && step !== 0 && step !== 8) continue;
    hits.push({ step, vel: step === 0 ? 1 : 0.98 + rng.float(-0.01, 0.01) });
  }
  if (fill && rng.chance(0.25)) hits.push({ step: 14, vel: 0.8 });
  return hits;
}

// --- the broken kit --------------------------------------------------------
//
// Derive-lite, and PLAN-MAGIC-V2 §6's second line — *there is no breakbeat
// vocabulary; breaks need authored masks and a kit whose snare is not the clap*
// — answered where the plan says to answer it: the **figures** are a table in
// the strategy that plays them (`catalogue.breakMasks` in house-v2), and this is
// the reader of one. They are authored from production convention and mined from
// nothing, which is rule 3 of the v2 plan: deep house is the only measured
// region and a breakbeat corpus does not exist.
//
// A break row carries two masks of sixteen, the kick's and the snare's, and the
// snare's can spell its own accents: `x` is a hit and `o` is a ghost. The kick's
// mask is hits only — a kick has no ghost.
//
// **The ghosts left the table on 09-20 and the reader kept them**, which is the
// difference between a vocabulary and a figure. Eugene heard the first five
// authored breaks as "too complex and hardly listenable" and "no musical value
// in this particular clip" (`reviews/derive.json`, spark-high and dnb), and the
// count said the same thing: a break was landing **10.97 events a bar on the
// drum lanes against the four on the floor's 8.87**, so the thing that was
// supposed to open a groove up was filling it in. The rows are the backbeat
// only now. An `o` still reads as a ghost here, because the day a breaks corpus
// is mined it will have them and this file is the reader, not the table.

/**
 * One authored break: the kick's mask, the snare's, what convention calls the
 * shape, and how often it is drawn against the others.
 *
 * It is stated here beside `MaskRow` and for the same reason — this file is the
 * reader of a figure table, and what a row of one is, is the composer's word —
 * while the rows themselves are the strategy's (`catalogue.breakMasks`). `m` is
 * the kick's, so a break row is a mask row as far as every gate that walks a
 * mask table is concerned.
 */
export interface BreakRow {
  /** the kick's sixteen, `x` where it fires */
  m: string;
  /** the snare's sixteen: `x` a hit, `o` a ghost, `.` nothing */
  s: string;
  /** what convention calls the shape */
  name: string;
  /** how often it is drawn, against the others */
  c: number;
  /**
   * **How many notes of bass this break leaves room for**: one is a pedal, two
   * a pump. The taste rail of `notes/diagrams/landscape.md` — *a break must
   * leave the bass room* — and it is a budget rather than a figure, because the
   * figure is the corpus's and the budget is the break's. It reaches the bass
   * through the thinner the density budget already goes through, so a break's
   * bass is the theme's own line with fewer notes in it and never a second line
   * somebody wrote.
   */
  b: number;
}

/** One break's hits, from its own mask. `x` full, `o` a ghost, `.` silence. */
export function breakHits(rng: Rng, mask: string, { ghost, wobble }: { ghost: number; wobble: number }): DrumHit[] {
  const hits: DrumHit[] = [];
  for (let step = 0; step < mask.length; step++) {
    const c = mask[step];
    if (c !== 'x' && c !== 'o') continue;
    // The downbeat is the one hit a break does not wobble, exactly as the four
    // on the floor does not wobble its own: it is the thing everything else is
    // heard against.
    const base = c === 'o' ? ghost : step === 0 ? 1 : 0.95;
    const vel = step === 0 ? base : Math.max(0.15, Math.min(1, base * (1 + rng.float(-wobble, wobble))));
    hits.push({ step, vel });
  }
  return hits;
}

// A hat figure is one of the mined masks, drawn once per track. The mask
// carries a level per step, so the velocity shape is the corpus's, not mine.
// The offbeat eighths are hats; anything between them is the shaker layer.
export function pickHatMask(rng: Rng, corpus: FigureCorpus): MaskRow {
  const usable = corpus.hats.filter((h) => h.m.includes('x'));
  return draw(rng, usable);
}

// A hit carries the **slot** it belongs to and not the instrument playing it
// (round K6): `offbeat`, `open` and `sixteenth` are the three parts one mined
// hat mask decides between, and which instrument fills each of them is the
// lane table's answer and not this file's. It said `hatClosed`, `hatOpen` and
// `shaker` until K6, which is why sixteen registered percussion instruments
// could be weighted and leaned and heard by nobody.
export function hatPattern(
  rng: Rng,
  template: MaskRow,
  { openHat, sixteenths, corpus, settings }: {
    openHat: boolean;
    sixteenths: boolean;
    corpus: FigureCorpus;
    settings: Settings;
  },
): HatHit[] {
  const hits: HatHit[] = [];
  const cv = settings.groove.hatVelocityCv;
  const steps = maskSteps(template.m);
  const levels = template.v || [];

  for (const step of steps) {
    // MEASURED: the on-beat energy in the hat bands is the kick leaking, not a
    // part. Nothing of ours fires on the beat.
    if (step % 4 === 0) continue;
    const offbeat = step % 4 === 2;
    if (!offbeat && !sixteenths) continue;
    const base = levels[step] ?? (offbeat ? 0.9 : 0.3);
    const vel = Math.max(0.2, Math.min(1, base * (1 + rng.float(-cv, cv))));
    hits.push({ step, slot: offbeat ? 'offbeat' : 'sixteenth', vel });
  }

  // MEASURED: 43% of detected open hats sit on an offbeat eighth. The open hat
  // takes over whichever one the corpus is most likely to open.
  if (openHat) {
    const candidates = hits.filter((h) => h.step % 4 === 2);
    if (candidates.length) {
      const chosen = rng.weighted(
        candidates.map((h) => ({ v: h, w: (corpus.openHatByStep[h.step] ?? 100) }))
      );
      chosen.slot = 'open';
      chosen.vel = Math.min(1, chosen.vel * 1.05);
    }
  }
  return hits;
}

// --- the sixteenth lane's own figure ---------------------------------------
//
// Round K6. Until it, a sixteenth lane played whatever a mined **hat** mask
// left between its offbeats, which is a part defined by the absence of another
// one: a mask whose hits all land on offbeat eighths leaves nothing at all, and
// under house-v2's mined tables that is most of them — K5b measured the shaker
// silent in 173 of 200 rolled themes. Eugene's answer was not a patch but a
// design: *a style declares its own lanes*, and a lane with a figure of its own
// is the first of them.
//
// The table is `catalogue.sixteenthMasks`, mined in `src/catalogue.ts` out of
// the same hat masks — what the reference sets put **between** the offbeats,
// over the whole table rather than over the one mask the hats happened to draw
// — and it is drawn off a stream of the lane's own, so the two figures are two
// decisions.

/** One row of the sixteenth table, drawn the way every mined table is drawn. */
export function pickSixteenthMask(rng: Rng, table: MaskRow[]): MaskRow | null {
  const usable = table.filter((t) => t.m.includes('x'));
  return usable.length ? draw(rng, usable) : null;
}

/** A bar of it: the mask's own steps at the mask's own levels, wobbled. */
export function sixteenthPattern(
  rng: Rng,
  template: MaskRow,
  { settings }: { settings: Settings },
): HatHit[] {
  const hits: HatHit[] = [];
  // `hatVelocityCv` is the half-width of a uniform draw here and at the
  // offbeat hats above, not a coefficient of variation: a uniform +-0.28 has a
  // CV of 0.16, and the clamp at 1 pins about three in ten offbeat hits at a
  // base of 0.9 (R108 of the reconciled review of 09-24). Reading it as the CV
  // it is named would move both strategies' every hat, so it is said here and
  // left for Eugene's ear.
  const cv = settings.groove.hatVelocityCv;
  const levels = template.v || [];
  for (const step of maskSteps(template.m)) {
    const base = levels[step] ?? 0.3;
    const vel = Math.max(0.2, Math.min(1, base * (1 + rng.float(-cv, cv))));
    hits.push({ step, slot: 'sixteenth', vel });
  }
  return hits;
}

// MEASURED: clap on 2 and 4, soft — only 1.13x the downbeat energy.
export function clapPattern(
  rng: Rng,
  { ghost, settings }: { ghost: boolean; settings: Settings },
): DrumHit[] {
  const hits: DrumHit[] = [{ step: 4, vel: 0.95 }, { step: 12, vel: 1 }];
  if (ghost && rng.chance(settings.groove.ghostClapChance)) {
    hits.push({ step: rng.pickWeighted([11, 15, 7])!, vel: 0.35 });
  }
  return hits;
}

// ----------------------------------------------------------------- bass ---
//
// MEASURED: the bass is not an offbeat stab. Its energy never falls to zero
// between kicks; what moves on the offbeat is the pitch. The corpus stores
// where those pitch changes land, and what interval above the chord root each
// one takes — `.x..............` (one note, then held) is the single commonest
// bar in 2966, and `.xx..xx..xx..xx.` is the second.

const CONTOUR: Record<string, number> = { R: 0, '9': 2, m3: 3, '4': 5, '5': 7, b7: 10, x: 0 };

export function countSteps(mask: string): number {
  let n = 0;
  for (const c of mask) if (c === 'x') n++;
  return n;
}

// Deep house is minimal: two to four note changes in a bar, the note held in
// between, and space where a busier genre would put another note.
//
// The corpus disagrees — its second most common mask has eight note starts —
// but the analyst rated bass-mask confidence low-medium for exactly the reason
// that matters here: with the kick and the bass in the same band, the detector
// counts the sidechain pumping and the kick bleeding as note starts. So the
// corpus overstates density, and the cap is a correction to a known bias
// rather than a preference.
export function pickBassTemplate(rng: Rng, corpus: FigureCorpus, maxNotes = 4): MaskRow {
  const pool = corpus.bass16.filter((t) => {
    const n = countSteps(t.m);
    return n >= 1 && n <= maxNotes;
  });
  const usable = pool.length ? pool : corpus.bass16;
  // Weighted by how often it occurs, and then again toward the sparse end.
  return rng.weighted(
    usable.map((t) => ({ v: t, w: Math.pow(t.c, 0.6) / Math.max(1, countSteps(t.m) - 1) }))
  );
}

// If a preset or the corpus hands over something denser than the budget, thin
// it: keep the first change of each beat, drop the rest from the back.
export function thinMask(template: MaskRow, maxNotes: number): MaskRow {
  const steps = maskSteps(template.m);
  if (steps.length <= maxNotes) return template;
  const keep: number[] = [];
  const seenBeat = new Set<number>();
  for (const st of steps) {
    const beat = Math.floor(st / 4);
    if (!seenBeat.has(beat)) {
      seenBeat.add(beat);
      keep.push(st);
    }
  }
  const trimmed = keep.slice(0, maxNotes);
  const m = Array.from({ length: 16 }, (_, i) => (trimmed.includes(i) ? 'x' : '.')).join('');
  // `template.k!` inside the callback: the ternary has already asked whether
  // the row carries a contour, and a narrowing does not reach into a closure.
  const k = template.k ? trimmed.map((st) => template.k![steps.indexOf(st)] ?? 'R') : undefined;
  return { ...template, m, k };
}

// A template becomes a list of {step, interval}.
export function bassChanges(
  template: MaskRow,
  { chordChanged }: { chordChanged: boolean },
): BassChange[] {
  const steps = maskSteps(template.m);
  const k = template.k || [];
  const changes: BassChange[] = steps.map((step, i) => ({
    step,
    interval: CONTOUR[k[i]] ?? 0,
  }));
  // The root moves with the chord; that is harmony, not groove, so it lands on
  // the downbeat even though measured changes never do.
  if (chordChanged && !changes.some((c) => c.step === 0)) {
    changes.unshift({ step: 0, interval: 0 });
  }
  if (!changes.length) changes.push({ step: 0, interval: 0 });
  return changes.sort((a, b) => a.step - b.step);
}

// One transformation per variation point: drop a note, add a pickup into the
// next bar, or throw one an octave up.
export function varyBass(rng: Rng, changes: BassChange[], strength: string): BassChange[] {
  let out = changes.map((c) => ({ ...c }));
  const moves = strength === 'big' ? 2 : 1;
  for (let i = 0; i < moves; i++) {
    const what = rng.weighted([
      { v: 'drop', w: out.length > 1 ? 2 : 0 },
      { v: 'pickup', w: 2.5 },
      { v: 'octave', w: 2 },
      { v: 'shift', w: 1.5 },
    ]);
    if (what === 'drop' && out.length > 1) {
      const idx = 1 + rng.int(0, out.length - 1);
      out.splice(Math.min(idx, out.length - 1), 1);
    } else if (what === 'pickup') {
      const step = rng.pickWeighted([14, 15])!;
      if (!out.some((c) => c.step === step)) {
        out.push({ step, interval: rng.pickWeighted([0, 7, 10])!, pickup: true });
      }
    } else if (what === 'octave') {
      const c = out[rng.int(0, out.length)];
      if (c) c.octave = !c.octave;
    } else {
      const c = out[rng.int(0, out.length)];
      if (c && c.step > 0) {
        const step = Math.max(1, Math.min(15, c.step + rng.pickWeighted([-1, 1])!));
        if (!out.some((m) => m.step === step)) c.step = step;
      }
    }
  }
  return out.sort((a, b) => a.step - b.step);
}

// The budget applies after the variations too, or a "small change every four
// bars" quietly turns three notes into six.
export function capChanges(changes: BassChange[], budget: number): BassChange[] {
  if (changes.length <= budget) return changes;
  const kept: BassChange[] = [];
  const seenBeat = new Set<number>();
  for (const c of changes) {
    const beat = Math.floor(c.step / 4);
    if (c.step === 0 || !seenBeat.has(beat)) {
      seenBeat.add(beat);
      kept.push(c);
    }
    if (kept.length >= budget) break;
  }
  return kept.length ? kept : changes.slice(0, budget);
}

// How much a note gives back for being low. Notes under the reference are
// trimmed per octave, so a track in a low key is as loud as one in a high key
// rather than louder — the kick body and the sub stop stacking.
export function bassLowTrim(midi: number, settings: Settings): number {
  const B = settings.bass;
  const hz = 440 * Math.pow(2, (midi - 69) / 12);
  if (hz >= B.tiltRefHz) return 1;
  return Math.pow(10, (-B.lowTiltDb * Math.log2(B.tiltRefHz / hz)) / 20);
}

// Turn a contour interval into a MIDI note under the chord that is sounding.
// The window is the style's register (`subLow` to `subHigh`, folded toward
// `subCenter`), and an octave change may reach `subCeiling`. The comment that
// sat above `bassLowTrim` said "MIDI 29-41, never above 45", the benchmarks'
// measured range and not this window: the fold lands within six semitones of
// `subCenter` (24-36 at the record's 30), so `subHigh` never binds (R109 of
// the reconciled review of 09-24).
export function bassNote(chord: Chord, change: BassChange, settings: Settings): number {
  const R = settings.register;
  // Fold toward the register's centre, not up off its floor: folding up from a
  // floor puts every root in the top of the window, which is how a bass ends
  // up an octave above where the benchmarks put theirs.
  const pc = ((chord.rootMidi + (change.interval ?? 0)) % 12 + 12) % 12;
  let m = pc + 12 * Math.round((R.subCenter - pc) / 12);
  while (m < R.subLow) m += 12;
  while (m > R.subHigh) m -= 12;
  if (change.octave && m + 12 <= R.subCeiling) return m + 12;
  return m;
}

// ----------------------------------------------------------------- keys ---
//
// MEASURED: 434 of 2966 bars put a chord on every beat, which is the single
// commonest stab figure by a distance; the rest of the table is where the
// variety lives.

export function pickStabMask(rng: Rng, corpus: FigureCorpus): MaskRow {
  const usable = corpus.stabs.filter((t) => t.m.includes('x'));
  return draw(rng, usable);
}

export function stabsFromMask(rng: Rng, template: MaskRow): Stab[] {
  return maskSteps(template.m).map((step) => ({
    step,
    vel: 0.62 + rng.float(-0.12, 0.18),
    len: rng.weighted([{ v: 1, w: 2 }, { v: 2, w: 3 }, { v: 4, w: 2 }]),
    // Roll the voicing a little, like a hand not quite together.
    spread: rng.float(0.004, 0.016),
    // Sometimes only the top of the chord speaks.
    top: rng.chance(0.3),
  }));
}

export function varyStabs(rng: Rng, motif: Stab[]): Stab[] {
  const out = motif.map((n) => ({ ...n }));
  if (rng.chance(0.45) && out.length > 1) out.splice(rng.int(0, out.length), 1);
  if (rng.chance(0.55)) {
    const step = rng.pickWeighted([2, 3, 6, 7, 10, 11, 14, 15])!;
    if (!out.some((n) => n.step === step)) {
      out.push({ step, vel: 0.6, len: 2, spread: 0.01, top: rng.chance(0.4) });
    }
  }
  return out.sort((a, b) => a.step - b.step);
}

// ---------------------------------------------------------------- piano ---
//
// Two roles, and a die picks which one a theme gets. Both are minimal on
// purpose: the deep house piano is a few notes a bar a long way back in a
// room, and the silence between them is as much of the part as the notes.

// The pool an arpeggio draws from: the chord's own tones plus the ninth, every
// octave of them inside the piano's register.
export function pianoPool(
  chord: Chord,
  progression: Progression,
  low = 55,
  high = 84,
): number[] {
  const pcs = new Set(chord.notes.map((n) => ((n % 12) + 12) % 12));
  const ninth = scaleNote(progression.root, progression.scale, chord.degree + 8);
  pcs.add(((ninth % 12) + 12) % 12);
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

// Where in the bar an arpeggio may fire. Never more than four, usually two or
// three, and never a run of sixteenths.
const ARP_SLOTS = [
  { v: [0, 6, 12], w: 3 },
  { v: [0, 8], w: 3 },
  { v: [6, 12], w: 2 },
  { v: [2, 8, 14], w: 2 },
  { v: [0, 4, 10, 14], w: 1.5 },
  { v: [0, 6, 10, 14], w: 1 },
];

export const ARP_CONTOURS = ['up', 'down', 'upHold', 'broken'];

// (a) The minimal arpeggio: chord tones with the ninth, one at a time, two to
// four in a bar. The contour is held for a phrase so the figure is a figure.
export function pianoArp(
  rng: Rng,
  pool: number[],
  { maxNotes = 3, contour = 'up', base = null }: {
    maxNotes?: number;
    contour?: string;
    base?: number | null;
  } = {},
): ArpNote[] {
  if (!pool.length) return [];
  let slots = rng.weighted(ARP_SLOTS);
  if (slots.length > maxNotes) slots = slots.slice(0, maxNotes);
  const n = slots.length;
  const start = Math.max(0, Math.min(pool.length - n, base == null ? Math.floor(pool.length / 2) - 1 : base));
  const order: (i: number) => number = ({
    up: (i: number) => i,
    down: (i: number) => n - 1 - i,
    upHold: (i: number) => Math.min(i, Math.max(0, n - 2)),
    broken: (i: number) => [0, 2, 1, 3][i % 4],
  } as Record<string, (i: number) => number>)[contour] || ((i: number) => i);
  const top = pool[pool.length - 1];
  return slots.map((step, i) => {
    const idx = Math.max(0, Math.min(pool.length - 1, start + order(i)));
    let midi = pool[idx];
    // An octave shift now and then, so the figure is not a ladder.
    if (rng.chance(0.12) && midi + 12 <= top) midi += 12;
    return { step, midi, vel: (step === 0 ? 0.78 : 0.64) + rng.float(-0.07, 0.1) };
  });
}

// Where a melody note may land: the strong positions plus a few weak ones.
// Nothing on a sixteenth that is not the last one of a beat.
const MEL_POSITIONS = [0, 4, 6, 8, 12, 14];
const MEL_MOVES = [
  { v: 1, w: 4 }, { v: -1, w: 4 }, { v: 2, w: 2.5 }, { v: -2, w: 2.5 },
  { v: 3, w: 1 }, { v: -3, w: 1 }, { v: 0, w: 1 },
];

// (b) The simple melody: a two or four bar phrase of three to six scale notes,
// steps and small leaps, the strong positions left for the chord to claim.
export function makeMelody(
  rng: Rng,
  scalePool: number[],
  { bars = 2, center = 69 }: { bars?: number; center?: number } = {},
): MelodyNote[] {
  if (!scalePool.length) return [];
  const n = rng.int(3, 7); // 3-6 notes
  const positions: number[] = [];
  for (let b = 0; b < bars; b++) for (const st of MEL_POSITIONS) positions.push(b * 16 + st);
  const chosen = new Set([rng.chance(0.7) ? 0 : 8]);
  let guard = 0;
  while (chosen.size < n && guard++ < 60) chosen.add(rng.pickWeighted(positions)!);
  const steps = [...chosen].sort((a, b) => a - b);

  let idx = scalePool.findIndex((m) => m >= center);
  if (idx < 0) idx = Math.floor(scalePool.length / 2);
  return steps.map((abs, i) => {
    if (i > 0) idx = Math.max(0, Math.min(scalePool.length - 1, idx + rng.weighted(MEL_MOVES)));
    const step = abs % 16;
    return {
      bar: Math.floor(abs / 16),
      step,
      midi: scalePool[idx],
      vel: 0.68 + rng.float(-0.08, 0.12),
      strong: step === 0 || step === 8,
    };
  });
}

// One small change, once, across the eight-bar loop: a note moves, a note
// goes, one is thrown an octave, or one is added. A phrase that repeats
// identically for eight bars is a loop; a phrase with one change is a part.
export function varyMelody(rng: Rng, phrase: MelodyNote[], scalePool: number[]): MelodyNote[] {
  const out = phrase.map((n) => ({ ...n }));
  if (!out.length) return out;
  const what = rng.weighted([
    { v: 'move', w: 3 },
    { v: 'drop', w: out.length > 3 ? 2 : 0 },
    { v: 'octave', w: 1 },
    { v: 'add', w: 1.5 },
  ]);
  const i = rng.int(0, out.length);
  if (what === 'move') {
    const at = scalePool.indexOf(out[i].midi);
    if (at >= 0) out[i].midi = scalePool[Math.max(0, Math.min(scalePool.length - 1, at + rng.pickWeighted([-1, 1, 2, -2])!))];
  } else if (what === 'drop') {
    out.splice(i, 1);
  } else if (what === 'octave') {
    const up = out[i].midi + 12;
    if (scalePool.includes(up)) out[i].midi = up;
  } else {
    const last = out[out.length - 1];
    const step = rng.pickWeighted([6, 14])!;
    if (!out.some((n) => n.bar === last.bar && n.step === step)) {
      const at = Math.max(0, scalePool.indexOf(last.midi));
      out.push({
        bar: last.bar,
        step,
        midi: scalePool[Math.max(0, Math.min(scalePool.length - 1, at + rng.pickWeighted([-1, 1])!))],
        vel: 0.6,
        strong: false,
      });
    }
  }
  return out.sort((a, b) => a.bar * 16 + a.step - (b.bar * 16 + b.step));
}

// A strong position belongs to the chord. If the phrase's note is not in it,
// move to the nearest tone that is.
export function snapToChord(midi: number, chord: Chord): number {
  const pcs = new Set(chord.notes.map((n) => ((n % 12) + 12) % 12));
  if (pcs.has(((midi % 12) + 12) % 12)) return midi;
  for (let d = 1; d <= 6; d++) {
    if (pcs.has((((midi + d) % 12) + 12) % 12)) return midi + d;
    if (pcs.has((((midi - d) % 12) + 12) % 12)) return midi - d;
  }
  return midi;
}

export default {
  stepToBeats,
  maskSteps,
  kickPattern,
  pickHatMask,
  hatPattern,
  pickSixteenthMask,
  sixteenthPattern,
  clapPattern,
  pickBassTemplate,
  thinMask,
  countSteps,
  bassChanges,
  varyBass,
  capChanges,
  bassNote,
  bassLowTrim,
  pickStabMask,
  stabsFromMask,
  varyStabs,
  pianoPool,
  pianoArp,
  makeMelody,
  varyMelody,
  snapToChord,
};
