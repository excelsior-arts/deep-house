// **The phrase-development planner** (liquid-space, 10-11; the research manual's §5 and §6): a composer
// mechanism that decides, phrase by phrase, which layer leads, answers or withdraws, before a single
// event is written. It knows no genre: it reads rows and a form, and a place table says where it plays.
//
// Hierarchical randomness, as the manual has it: the identity is drawn once a track (the form's bars and
// states, the return's one new feature, the auxiliary part), the development once a phrase (an action
// family, then a variant inside it), the performance once a hit (the kit's own draws, untouched). Every
// draw is off a stream of its own (`<seed>::phrasedev:<bar>`, `<seed>::aux`, `<seed>::formbars`, …), so
// a seed's kit, riff and bass draws are the ones they were.
//
// **The order of planning** (the manual's §6): form → sections → phrase states → drum anchors → bass →
// auxiliary → effects and texture. This module plans all of it as data before the bars are laid; the
// generator then plays it: the kit pass strikes the answers and the states (so the kit takes part and
// does not overwrite), the bass reads the same plan before the kit pass and its dips are laid on the
// kit's final snares after it, the auxiliary and the surface are written last.
//
// **At each eligible 8-bar phrase** a family is drawn from the row (continue, subtract, answer,
// support-change, effect), after:
//   1. the ineligible families are removed (no variant can play: a section line's fill owns the bar,
//      no auxiliary part, a slot already taken);
//   2. the place's lean is applied (the bird bias, `DevelopmentEntry.lean`);
//   3. a reserved window is respected (builder K's keys pickups and landings: `ReservedWindow`);
//   4. the previous phrase's identical featured move is refused where there is an alternative;
//   5. a conspicuous family waits out its cooldown;
// then a variant inside it. The budget is one foreground change and one supporting change a phrase; a
// drum drop-out and the bass's answer to it are one coordinated move. Every choice and every rejected
// alternative is written on the trace (`DevelopmentPlan`), which rides on the plan as `track.development`.
//
// The rows: `recipes/genres/<dir>/phrase-development-*.json` (the families), `aux-*.json` (the one quiet
// auxiliary part), `surface-*.json` (the noise bed under the exposed passages), `bass-answers-*.json`
// (the bass's rest, its glide and its half-time sentence). Weights are listening hypotheses, his to move.

import { Rng } from './rng.ts';
import type { Arrangement } from './arrangement.ts';
import { validatePhrase, type PhraseSpec } from './mined-phrase.ts';
import DEV_LIQUID from '../recipes/genres/dnb/phrase-development-liquid.json' with { type: 'json' };
import AUX_LIQUID from '../recipes/genres/dnb/aux-liquid-quiet.json' with { type: 'json' };
import SURFACE_DARK_AIR from '../recipes/genres/dnb/surface-dark-air.json' with { type: 'json' };
import SURFACE_HISS from '../recipes/genres/dnb/surface-hiss.json' with { type: 'json' };
import SURFACE_AIR_SWELL from '../recipes/genres/dnb/surface-air-swell.json' with { type: 'json' };
import BASS_LIQUID from '../recipes/genres/dnb/bass-answers-liquid.json' with { type: 'json' };

// --- the rows ---------------------------------------------------------------

export const FAMILIES = ['continue', 'subtract', 'answer', 'support-change', 'effect'] as const;
export type Family = typeof FAMILIES[number];
export type Slot = 'foreground' | 'support';

/** One way a family plays. Every field names what the generator already knows how to play. */
export interface Variant {
  id: string;
  w: number;
  /** a kit answer (`Kit.answers`) struck on one of these bars of the phrase, counted from one */
  drums?: string;
  at?: number[];
  /** the bass's coordinated move, where the answer falls on the phrase's last bar */
  bass?: 'rest' | 'glide';
  /** the auxiliary part enters for one of these many phrases (an exit is planned with every entry) */
  aux?: number[];
  /** a kit `moves` kind played over the phrase's second half (the open hat's lift) */
  lift?: string;
  /** a throw: the principal backbeat on the phrase's fourth bar, or the auxiliary's last hit */
  throw?: 'mid' | 'aux';
}
export interface FamilyRow { family: Family; w: number; slot?: Slot; cooldown?: number; variants?: Variant[] }
/** A move a form's feature forces at a passage's phrase: a family's variant, by id. */
export interface Forced { family: Family; variant: string }
export interface DevelopmentRow {
  id: string;
  unitBars: number;
  families: FamilyRow[];
  budget: { foreground: number; support: number };
  /** what each of a form's return features plays (`FormBlock.features.return`) */
  features?: Record<string, Forced | { state: string } | { lift: string } | null>;
  /** a fill on a phrase's last bar plays only into a change (`destination`), and the bass rests under it */
  fills?: { destination: boolean; bass?: 'rest' };
  /** the kit state a track plays where its form asks a state, among the kit's states by weight (drawn once a track) */
  stateVariants?: Record<string, Array<[string, number]>>;
  /** a full passage marked for development: the families' lean there, and the edit vocabularies (variant multipliers by `family.variant`) */
  developed?: { lean: Partial<Record<Family, number>>; edits: Record<string, Record<string, number>> };
}

/** The one quiet auxiliary part (the manual's P1, P3, P4): drawn once a track, played a phrase at a time. */
export interface AuxPart {
  voice: string;
  /** its level against the template hit it borrows, in dB, and its place */
  gainDb: number;
  pan?: number;
  room?: number;
  reverb?: number;
  /** the cycle its steps repeat over, in bars, and per step a chance, a velocity and the note's own params */
  cycleBars: number;
  steps: Array<{ step: number; p: number; vel: number; params?: Record<string, string | number> }>;
}
export interface AuxRow {
  id: string;
  choices: Array<{ v: string; w: number }>;
  parts: Record<string, AuxPart>;
  /** the phrases it rests after an exit before it may enter again */
  rest: number;
}

/** The surface under the exposed passages (the manual's N1, N4): one bed, one slow arc a span. */
export interface SurfaceRow {
  id: string;
  voice: string;
  /** the passages it plays under, by class, and its level there in dB; a class it does not name is silent */
  present: Record<string, number>;
  /** the bars one event of the bed covers; a span shorter than `leastBars` plays none */
  segmentBars: number;
  leastBars: number;
  /** the arc over a span, from nought to one: its level in dB and its brightness as the stage lowpass's multiple */
  level: Array<[number, number]>;
  bright: Array<[number, number]>;
  /** how early the span's last event ends, in seconds: the voice's own fade, so the bed is gone at the line */
  tailS?: number;
  /** the note the stage lowpass is opened from, its velocity and its room */
  midi: number;
  vel: number;
  reverb: number;
}

/** The bass's answers (the manual's B1, B5, B6, B7), played on whatever riff the theme drew, by its runs. */
export interface BassAnswersRow {
  id: string;
  /** a rest from this step of the phrase's last bar to its end; variants by weight, drawn a phrase at a time */
  rest: Array<{ id: string; w: number; step: number }>;
  /** a glide from this step of the phrase's last bar to its end, this many semitones over the held note; drawn a phrase at a time */
  glide: Array<{ id: string; w: number; fromStep: number; semis: number }>;
  /** the half-time sentences, by weight, drawn once a track: fewer entrances, a travel into the bar's middle backbeat, a short answer */
  halfTime: Array<{ id: string; w: number; phrase: PhraseSpec }>;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Everything wrong with a development row, as sentences. */
export function developmentFaults(row: unknown, kitAnswers: readonly string[] = [], kitMoves: readonly string[] = [], states: readonly string[] = []): string[] {
  const bad: string[] = [];
  if (!record(row)) return ['not a row'];
  const R = row as unknown as DevelopmentRow;
  if (R.unitBars !== 8) bad.push('unitBars: eight bars a phrase');
  if (!Array.isArray(R.families) || !R.families.length) bad.push('families: one or more');
  const seen = new Set<string>();
  for (const f of R.families ?? []) {
    if (!FAMILIES.includes(f.family)) bad.push(`${String(f.family)}: not one of ${FAMILIES.join(', ')}`);
    if (seen.has(f.family)) bad.push(`${f.family}: twice`);
    seen.add(f.family);
    if (!finite(f.w) || f.w < 0) bad.push(`${f.family}: weighs ${f.w}`);
    if (f.cooldown !== undefined && !(Number.isInteger(f.cooldown) && f.cooldown >= 0)) bad.push(`${f.family}: cooldown in whole phrases`);
    if (f.family === 'continue') { if (f.variants?.length) bad.push('continue: plays nothing, so it has no variants'); continue; }
    if (f.slot !== 'foreground' && f.slot !== 'support') bad.push(`${f.family}: slot is foreground or support`);
    if (!Array.isArray(f.variants) || !f.variants.length) bad.push(`${f.family}: one variant or more`);
    for (const v of f.variants ?? []) {
      const at = `${f.family}.${v.id}`;
      if (!v.id || !finite(v.w) || v.w < 0) bad.push(`${at}: an id and a weight`);
      if (v.drums !== undefined && !kitAnswers.includes(v.drums)) bad.push(`${at}: ${v.drums} is not one of the kit's answers`);
      if (v.drums !== undefined && (!Array.isArray(v.at) || !v.at.length || v.at.some((b) => !Number.isInteger(b) || b < 1 || b > 8))) bad.push(`${at}: at names bars of the phrase, one to eight`);
      if (v.bass !== undefined && (v.bass !== 'rest' && v.bass !== 'glide' || !v.at?.every((b) => b === 8))) bad.push(`${at}: the bass answers on the phrase's last bar alone, a rest or a glide`);
      if (v.aux !== undefined && (!Array.isArray(v.aux) || !v.aux.length || v.aux.some((n) => !Number.isInteger(n) || n < 1 || n > 2))) bad.push(`${at}: aux names one or two phrases`);
      if (v.lift !== undefined && !kitMoves.includes(v.lift)) bad.push(`${at}: ${v.lift} is not one of the kit's moves`);
      if (v.throw !== undefined && v.throw !== 'mid' && v.throw !== 'aux') bad.push(`${at}: a throw is mid or aux`);
      const acts = [v.drums, v.aux, v.lift, v.throw].filter((x) => x !== undefined).length;
      if (acts !== 1) bad.push(`${at}: plays one thing (drums, aux, lift or throw)`);
    }
  }
  if (!record(R.budget) || R.budget.foreground !== 1 || R.budget.support !== 1) bad.push('budget: one foreground and one supporting change a phrase');
  for (const [state, list] of Object.entries(R.stateVariants ?? {}))
    if (!Array.isArray(list) || !list.length || list.some(([v, w]) => !states.includes(v) || !finite(w) || w <= 0)) bad.push(`stateVariants.${state}: the kit's states by weight`);
  const named = new Set((R.families ?? []).flatMap((f) => (f.variants ?? []).map((v) => `${f.family}.${v.id}`)));
  for (const [edit, m] of Object.entries(R.developed?.edits ?? {})) for (const [v, x] of Object.entries(m))
    if (!named.has(v) || !finite(x) || x < 0) bad.push(`developed.edits.${edit}: ${v} is no variant, or weighs ${x}`);
  for (const [f, x] of Object.entries(R.developed?.lean ?? {})) if (!(FAMILIES as readonly string[]).includes(f) || !finite(x) || x < 0) bad.push(`developed.lean: ${f} by ${x}`);
  for (const [feature, plays] of Object.entries(R.features ?? {})) {
    if (plays === null) continue;
    if ('state' in plays) { if (!states.includes(plays.state)) bad.push(`features.${feature}: ${plays.state} is not one of the kit's states`); continue; }
    if ('lift' in plays) { if (!kitMoves.includes(plays.lift)) bad.push(`features.${feature}: ${plays.lift} is not one of the kit's moves`); continue; }
    const fam = R.families?.find((f) => f.family === plays.family);
    if (!fam?.variants?.some((v) => v.id === plays.variant)) bad.push(`features.${feature}: no variant ${plays.variant} in ${plays.family}`);
  }
  return bad;
}

/** Everything wrong with an auxiliary row. */
export function auxFaults(row: unknown, voiceExists: (v: string) => boolean = () => true): string[] {
  const bad: string[] = [];
  if (!record(row)) return ['not a row'];
  const R = row as unknown as AuxRow;
  if (!Array.isArray(R.choices) || !R.choices.length) bad.push('choices: one or more');
  for (const c of R.choices ?? []) {
    if (!finite(c.w) || c.w < 0) bad.push(`${c.v}: weighs ${c.w}`);
    if (c.v !== 'none' && !R.parts?.[c.v]) bad.push(`${c.v}: no part`);
  }
  for (const [name, p] of Object.entries(R.parts ?? {})) {
    if (!voiceExists(p.voice)) bad.push(`${name}: ${p.voice} is no voice`);
    if (!finite(p.gainDb) || p.gainDb < -40 || p.gainDb > 6) bad.push(`${name}: gainDb from -40 to 6`);
    if (!Number.isInteger(p.cycleBars) || p.cycleBars < 1 || p.cycleBars > 4) bad.push(`${name}: a cycle of one to four bars`);
    if (!Array.isArray(p.steps) || !p.steps.length) bad.push(`${name}: steps, one or more`);
    for (const s of p.steps ?? []) if (!(Number.isInteger(s.step) && s.step >= 0 && s.step < 16 * p.cycleBars) || !finite(s.p) || s.p < 0 || s.p > 1 || !finite(s.vel) || s.vel <= 0 || s.vel > 1)
      bad.push(`${name}: step ${s.step} inside the cycle, a chance and a velocity`);
    // a separate register from the hats, never the old sixteenths: at most a third of a cycle's sixteenths
    if (Array.isArray(p.steps) && p.steps.length > (16 * p.cycleBars) / 3) bad.push(`${name}: ${p.steps.length} strokes in ${16 * p.cycleBars} sixteenths is the old clutter`);
  }
  if (!Number.isInteger(R.rest) || R.rest < 1) bad.push('rest: one phrase or more off after an exit');
  return bad;
}

/** Everything wrong with a surface row. */
export function surfaceFaults(row: unknown, voiceExists: (v: string) => boolean = () => true): string[] {
  const bad: string[] = [];
  if (!record(row)) return ['not a row'];
  const R = row as unknown as SurfaceRow;
  if (!voiceExists(R.voice)) bad.push(`${R.voice} is no voice`);
  if (!record(R.present) || !Object.keys(R.present).length || Object.values(R.present).some((db) => !finite(db) || db > 0 || db < -40)) bad.push('present: classes at a level from -40 to 0 dB');
  if (!Number.isInteger(R.segmentBars) || R.segmentBars < 2 || R.segmentBars > 16) bad.push('segmentBars: two to sixteen');
  if (!Number.isInteger(R.leastBars) || R.leastBars < R.segmentBars) bad.push('leastBars: at least one segment');
  const arc = (name: string, knots: unknown, lo: number, hi: number) => {
    if (!Array.isArray(knots) || knots.length < 2 || knots[0]?.[0] !== 0 || knots[knots.length - 1]?.[0] !== 1
      || knots.some((k, i) => !Array.isArray(k) || !finite(k[0]) || !finite(k[1]) || k[1] < lo || k[1] > hi || (i > 0 && k[0] <= knots[i - 1][0])))
      bad.push(`${name}: knots from nought to one, each value from ${lo} to ${hi}`);
  };
  arc('level', R.level, -24, 0);
  arc('bright', R.bright, 0.1, 2);
  if (R.tailS !== undefined && (!finite(R.tailS) || R.tailS < 0 || R.tailS > 8)) bad.push('tailS: from 0 to 8 seconds');
  if (!finite(R.midi) || R.midi < 36 || R.midi > 96 || !finite(R.vel) || R.vel <= 0 || R.vel > 1 || !finite(R.reverb) || R.reverb < 0 || R.reverb > 1) bad.push('midi, vel and reverb in bounds');
  return bad;
}

/** Everything wrong with a bass answers row. */
export function bassAnswersFaults(row: unknown): string[] {
  const bad: string[] = [];
  if (!record(row)) return ['not a row'];
  const R = row as unknown as BassAnswersRow;
  const listed = (name: string, list: unknown, each: (v: Record<string, unknown>) => boolean) => {
    if (!Array.isArray(list) || !list.length) { bad.push(`${name}: one variant or more`); return; }
    for (const v of list) if (!record(v) || typeof v.id !== 'string' || !finite(v.w) || (v.w as number) < 0 || !each(v)) bad.push(`${name}: ${String((v as { id?: unknown })?.id)} out of bounds`);
  };
  listed('rest', R.rest, (v) => Number.isInteger(v.step) && (v.step as number) >= 4 && (v.step as number) <= 15);
  listed('glide', R.glide, (v) => Number.isInteger(v.fromStep) && (v.fromStep as number) >= 0 && (v.fromStep as number) <= 14 && finite(v.semis) && Math.abs(v.semis as number) <= 12 && v.semis !== 0);
  listed('halfTime', R.halfTime, (v) => {
    try {
      validatePhrase(v.phrase, {});
      const ph = v.phrase as PhraseSpec;
      return !ph.afterKick && !ph.runs.some((r) => r.press || r.anchors.some((a) => a.length !== 2));
    } catch { return false; }
  });
  return bad;
}

type Wrapped<T> = { id: string; wants: Record<string, T> };
const unwrap = <T>(row: unknown, key: string): T => ({ id: (row as Wrapped<T>).id, ...(row as Wrapped<T>).wants[key] } as T);
const DEVELOPMENT_ROWS: Record<string, DevelopmentRow> = Object.fromEntries([DEV_LIQUID].map((r) => [r.id, unwrap<DevelopmentRow>(r, 'development')]));
const AUX_ROWS: Record<string, AuxRow> = Object.fromEntries([AUX_LIQUID].map((r) => [r.id, unwrap<AuxRow>(r, 'auxiliary')]));
const SURFACE_ROWS: Record<string, SurfaceRow> = Object.fromEntries([SURFACE_DARK_AIR, SURFACE_HISS, SURFACE_AIR_SWELL].map((r) => [r.id, unwrap<SurfaceRow>(r, 'surface')]));
const BASS_ROWS: Record<string, BassAnswersRow> = Object.fromEntries([BASS_LIQUID].map((r) => [r.id, unwrap<BassAnswersRow>(r, 'bass')]));
/** The rows as written, for what reads a row whole. */
export const DEVELOPMENT_ROWS_AS_WRITTEN: readonly unknown[] = Object.freeze([DEV_LIQUID, AUX_LIQUID, SURFACE_DARK_AIR, SURFACE_HISS, SURFACE_AIR_SWELL, BASS_LIQUID]);
export const developmentOf = (id: string | null | undefined): DevelopmentRow | null => (id && DEVELOPMENT_ROWS[id]) || null;
export const auxOf = (id: string | null | undefined): AuxRow | null => (id && AUX_ROWS[id]) || null;
export const surfaceOf = (id: string | null | undefined): SurfaceRow | null => (id && SURFACE_ROWS[id]) || null;
export const bassAnswersOf = (id: string | null | undefined): BassAnswersRow | null => (id && BASS_ROWS[id]) || null;
export const DEVELOPMENT_IDS = Object.freeze({
  development: Object.keys(DEVELOPMENT_ROWS), aux: Object.keys(AUX_ROWS), surface: Object.keys(SURFACE_ROWS), bass: Object.keys(BASS_ROWS),
});
// the rows that need nothing outside themselves are read once, here; the kit and the voices are checked where the place names them (`placesFaults`)
for (const [id, row] of Object.entries(BASS_ROWS)) { const bad = bassAnswersFaults(row); if (bad.length) throw new Error(`bass answers row ${id}: ${bad.join('; ')}`); }

// --- the form's draws -------------------------------------------------------

/** A form row's alternatives (the manual's §4): bars by weight per section, a state per section, the return's one feature. */
export interface FormChoices {
  choices?: ReadonlyArray<ReadonlyArray<[number, number]> | null>;
  states?: ReadonlyArray<ReadonlyArray<[string, number]> | string | null>;
  features?: Readonly<Record<string, ReadonlyArray<[string, number]>>>;
}
/** The form's track-scale draws, each off a stream of its own: the bars, the states by the order's position. */
export function resolveForm(seed: string | number, form: { bars: readonly number[] } & FormChoices): { bars: number[]; states: Array<string | null>; drawn: string[] } {
  const r = new Rng(`${seed}::formbars`), s = new Rng(`${seed}::formstates`);
  const drawn: string[] = [];
  const bars = form.bars.map((b, i) => {
    const c = form.choices?.[i];
    if (!c || !c.length) return b;
    const v = r.weighted(c.map(([bars, w]) => ({ v: bars, w })));
    drawn.push(`bars ${i}: ${v} of ${c.map(([x, w]) => `${x}:${w}`).join('/')}`);
    return v;
  });
  const states = form.bars.map((_, i) => {
    const c = form.states?.[i];
    if (c == null) return null;
    if (typeof c === 'string') return c;
    const v = s.weighted(c.map(([state, w]) => ({ v: state, w })));
    drawn.push(`state ${i}: ${v} of ${c.map(([x, w]) => `${x}:${w}`).join('/')}`);
    return v;
  });
  return { bars, states, drawn };
}

// --- the plan ----------------------------------------------------------------

/**
 * **A window another part reserves** — builder K's keys plan (`KeysPlan.reserved`, `KeysWindow`, the same shape):
 * a keys `pickup` (its first note to the strike) or `landing` (the strike's beat), in sixteenths of the theme, with
 * the bar it lands on. No drum answer, effect or auxiliary entry is drawn over a pickup (the manual's foreground
 * priority: the keys pickup over a secondary drum answer), and an auxiliary part has left before a landing (P5).
 * The kit's own fills inside a pickup are K's filter's (`pickupOwns`), never a second one here.
 */
export interface ReservedWindow { kind: 'pickup' | 'landing' | 'detail'; bar: number; from: number; to: number }

/**
 * **The chapters' policy** (liquid-ambient, `src/ambient-plan.ts`, the research manual's §6): a lean on a phrase by
 * its chapter's function; the salient moments planned before the drums (keys landings, arrivals, the bed's
 * withdrawals and entrances); the longest gap a developed passage may go without one; which of this planner's moves
 * count as one; and the bed's planned subtraction, where nothing else can play. A phrase the deadline reaches may not
 * continue: it draws among the moves that count, and says why it was required and what it replaced.
 */
export interface ChapterPolicy {
  leanAt(bar: number): Partial<Record<Family, number>> | undefined;
  salient: readonly number[];
  maxGap: number;
  counts(family: string, variant: string): boolean;
  subtract(from: number, to: number, why: string): boolean;
}

/** One phrase as the plan has it. */
export interface PhrasePlan {
  start: number;
  bars: number;
  section: number;
  kind: string;
  state: string;
  /** why it draws nothing, where it is not eligible */
  held?: string;
  family?: Family;
  variant?: string;
  /** the bar the move falls on */
  at?: number;
  /** what changes in it, by slot: the drawn move, a forced one, an entry, an exit, a state change, a fill into it */
  foreground: string[];
  support: string[];
  rejected?: Array<{ what: string; why: string }>;
  forced?: string;
  /** why the chapters' deadline required a move here (`ChapterPolicy`), and what met it */
  required?: string;
  met?: string;
  /** what leaves with a section line's own arrival (an auxiliary part's exit on the line), outside the phrase's budget */
  arrival?: string[];
}
export interface DevelopmentPlan {
  row: string;
  form: { id: string | null; drawn: string[]; states: Array<{ section: number; state: string }>; feature: string | null; featureRejected: Array<{ what: string; why: string }> };
  aux: { row: string | null; identity: string; spans: Array<{ from: number; to: number }> };
  phrases: PhrasePlan[];
  /** the kit answers, by bar */
  answers: Array<{ bar: number; answer: string }>;
  /** the bass's coordinated moves, by the phrase's first bar */
  /** the bass's coordinated moves, each with the variant it drew (a rest's step, a glide's start and size) */
  bass: Array<{ phrase: number; mode: 'rest' | 'glide'; why: string; variant: string; step?: number; fromStep?: number; semis?: number }>;
  /** the bass's half-time sentence this track plays, where it has a half-time phrase */
  halfTimeBass: string | null;
  /** the kit state each asked state plays, drawn once a track (`stateVariants`) */
  kitStates: Record<string, string>;
  /** the edit vocabulary a developed passage plays, drawn once a track (`FormBlock.features.edits`) */
  edits: string | null;
  /** the track's drawn identity in one line, for the ledger and a report: the form, its draws, the kit states, the auxiliary, the surface, the bass, the moves */
  summary: string;
  /** the cast against the phone's ceiling, in units, once the drums are final: what the auxiliary and the surface became under it */
  budget?: { ceiling: number; before: number; aux: string; surface: string; after: number };
  /** the kit's moves kinds played over spans (a lift, the brighter return) */
  lifts: Array<{ from: number; to: number; kind: string }>;
  throws: Array<{ bar: number; kind: 'mid' | 'aux' }>;
  fills: { kept: number[]; dropped: Array<{ bar: number; why: string }>; lines: number[]; linesDropped: Array<{ bar: number; why: string }> };
  surface: Array<{ from: number; to: number; class: string }>;
  reserved: ReservedWindow[];
}

/** What the planner is handed: the arrangement, the form's draws, the rows and what the kit and the place already do. */
export interface PlannerInput {
  seed: string | number;
  row: DevelopmentRow;
  lean?: Partial<Record<Family, number>>;
  arrangement: Arrangement;
  /** the form row, its draws, and each section's state by its position in the form (`resolveForm`) */
  form: { id: string | null; drawn: string[]; features?: FormChoices['features'] } | null;
  sectionStates: Array<string | null>;
  kitAnswers: readonly string[];
  aux: AuxRow | null;
  surface: SurfaceRow | null;
  bass: BassAnswersRow | null;
  reserved: readonly ReservedWindow[];
  /** whether the place's own snare throw already sounds on a phrase's last bar */
  endThrowAt: (bar: number) => boolean;
  /** bars on which a structural support change already happens (the kit's lift turning), and the span of its closing hits */
  liftTurns: ReadonlySet<number>;
  liftSpans: ReadonlyArray<{ from: number; to: number }>;
  /** the bars a section line's own fill or drop-out was drawn on (the sub-sections kept); the plan keeps the ones that lead into a change */
  lineFills: readonly number[];
  /** the kit's phrase fills, drawn by its own odds, before the plan says which have somewhere to go */
  phraseFills: readonly number[];
  /** the chapters' policy over the phrases, where an ambient plan has chapters (`src/ambient-plan.ts`) */
  chapters?: ChapterPolicy;
}

/** The section kinds whose phrases develop: the full passages. */
const FULL = new Set(['drop', 'main']);
/** The states a full section may be put in, and the ones a breakdown may be (a passage that remembers the drums). */
export const FULL_STATES = ['half-time', 'developed'] as const;
/** a phrase that develops: a full passage's, or one the form marks for development */
const develops = (state: string) => state === 'full' || state === 'developed';
/** a phrase of a passage: one that develops, or a half-time one */
const inPassage = (state: string) => develops(state) || state === 'half-time';
export const EXPOSED_STATES = ['bed', 'hints', 'pulse'] as const;

export function planDevelopment(I: PlannerInput): DevelopmentPlan {
  const { seed, row, arrangement } = I;
  const sections = arrangement.sections;
  // the section's state: the form's, else its kind's
  const stateOf = sections.map((s) => {
    const pos = s.roll ?? s.index;
    const drawn = I.sectionStates[pos] ?? null;
    if (FULL.has(s.kind)) return drawn && (FULL_STATES as readonly string[]).includes(drawn) ? drawn : 'full';
    if (s.kind === 'breakdown') return drawn && (EXPOSED_STATES as readonly string[]).includes(drawn) ? drawn : 'bed';
    return s.kind;
  });
  const states = sections.map((s, i) => ({ section: s.index, state: stateOf[i] }));
  // the passages: runs of full sections side by side
  const passageOf = new Map<number, number>();
  let passage = -1;
  sections.forEach((s, i) => {
    if (inPassage(stateOf[i])) {
      if (i === 0 || !inPassage(stateOf[i - 1])) passage++;
      passageOf.set(i, passage);
    }
  });
  // the phrases, eight bars from each section's line
  const phrases: PhrasePlan[] = [];
  sections.forEach((s, i) => {
    for (const p of s.phrases) {
      const bars = Math.min(8, s.startBar + s.bars - p.startBar);
      phrases.push({ start: p.startBar, bars, section: i, kind: s.kind, state: stateOf[i], foreground: [], support: [] });
    }
  });
  const phraseAt = (bar: number) => phrases.find((p) => bar >= p.start && bar < p.start + p.bars) ?? null;
  // a window over bars `from` to `to` (exclusive), its own in sixteenths; a pickup unless a kind is named
  const inReserved = (from: number, to: number, kinds: string[] = ['pickup', 'detail']) => I.reserved.some((w) => from * 16 < w.to && to * 16 > w.from && kinds.includes(w.kind));

  // **The return's one new feature** (two-return: the manual's §4): drawn once, among the features its
  // passage can play; the return is the second passage.
  const featureRejected: Array<{ what: string; why: string }> = [];
  let feature: string | null = null;
  const passages = [...new Set(passageOf.values())];
  const returnPassage = passages.length >= 2 ? passages[1] : null;
  const returnPhrases = returnPassage == null ? [] : phrases.filter((p) => passageOf.get(p.section) === returnPassage);
  const auxIdentity = I.aux ? new Rng(`${seed}::aux`).weighted(I.aux.choices.map((c) => ({ v: c.v, w: c.w }))) : 'none';
  const auxPart = auxIdentity !== 'none' ? I.aux?.parts[auxIdentity] ?? null : null;
  const offered = I.form?.features?.return;
  if (offered && returnPhrases.length) {
    const live = offered.filter(([f]) => {
      const plays = row.features?.[f];
      if (plays === undefined || plays === null) { featureRejected.push({ what: f, why: 'the development row plays no such feature' }); return false; }
      if (f === 'aux' && !auxPart) { featureRejected.push({ what: f, why: 'the track drew no auxiliary part' }); return false; }
      if ('state' in plays && returnPhrases.length < 3) { featureRejected.push({ what: f, why: 'the return is too short to open in another state and still return' }); return false; }
      if (!('state' in plays) && returnPhrases.length < 2) { featureRejected.push({ what: f, why: 'the return has one phrase, which is held' }); return false; }
      return true;
    });
    if (live.length) feature = new Rng(`${seed}::returnfeature`).weighted(live.map(([v, w]) => ({ v, w })));
  }
  // a feature that is a state: the return's first phrase in it (the 87/174 hinge)
  const featurePlays = feature ? row.features?.[feature] ?? null : null;
  if (featurePlays && 'state' in featurePlays) {
    const first = returnPhrases[0];
    first.state = featurePlays.state;
    first.forced = `the return's feature: ${feature}`;
  }

  // **A section line's own fill leads into a change** (D4): a line between two sections of one passage (a drop into
  // its main) is a phrase line like any other, and its fill plays only where a structural change waits after it (the
  // kit's lift turning, a state changing); a line out of or into a passage is its own destination
  const lineDropped: Array<{ bar: number; why: string }> = [];
  const lineOwned = new Set<number>();
  for (const bar of I.lineFills) {
    const left = sections.findIndex((x) => bar >= x.startBar && bar < x.startBar + x.bars), right = left + 1;
    const inPassage = right < sections.length && passageOf.has(left) && passageOf.get(left) === passageOf.get(right);
    if (inPassage && !I.liftTurns.has(bar + 1) && stateOf[left] === stateOf[right]) { lineDropped.push({ bar, why: 'a line inside a passage, and nothing changes after it' }); continue; }
    lineOwned.add(bar);
  }
  // the structural changes already there: the kit's lift turning (support), a section line's own fill or drop-out on
  // the phrase's last bar (foreground: the line owns it), a state changing inside a passage (foreground)
  for (const [i, p] of phrases.entries()) {
    if (!inPassage(p.state)) continue;
    for (const b of I.liftTurns) if (b === p.start) p.support.push('the kit\'s lift turns');
    if (lineOwned.has(p.start + p.bars - 1)) p.foreground.push('the section line\'s fill');
    const before = phrases[i - 1];
    if (before && passageOf.get(before.section) === passageOf.get(p.section) && before.state !== p.state && (before.state === 'half-time' || p.state === 'half-time'))
      p.foreground.push(`into ${develops(p.state) && before.state === 'half-time' ? 'the skeleton from half-time' : p.state}`);
  }

  // the track's other identity draws, each off a stream of its own: the kit state per asked state, the edit vocabulary, the half-time sentence
  const kitStates: Record<string, string> = {};
  for (const [state, list] of Object.entries(row.stateVariants ?? {}))
    kitStates[state] = list.length > 1 ? new Rng(`${seed}::kitstate:${state}`).weighted(list.map(([v, w]) => ({ v, w }))) : list[0][0];
  const editsOffered = I.form?.features?.edits;
  const edits = editsOffered && phrases.some((p) => p.state === 'developed') && row.developed
    ? new Rng(`${seed}::edits`).weighted(editsOffered.filter(([e]) => !!row.developed!.edits[e]).map(([v, w]) => ({ v, w }))) : null;
  const halfTimeBass = I.bass && phrases.some((p) => p.state === 'half-time')
    ? new Rng(`${seed}::halftimebass`).weighted(I.bass.halfTime.map((h) => ({ v: h.id, w: h.w }))) : null;
  const out: DevelopmentPlan = {
    halfTimeBass, kitStates, edits, summary: '',
    row: row.id,
    form: { id: I.form?.id ?? null, drawn: I.form?.drawn ?? [], states, feature, featureRejected },
    aux: { row: I.aux?.id ?? null, identity: auxIdentity, spans: [] },
    phrases, answers: [], bass: [], lifts: [], throws: [], fills: { kept: [], dropped: [], lines: [...lineOwned], linesDropped: lineDropped }, surface: [], reserved: [...I.reserved],
  };

  // the bass's answer on a phrase, its variant drawn off the phrase's own stream
  const bassMove = (phrase: number, mode: 'rest' | 'glide', why: string) => {
    if (!I.bass) { out.bass.push({ phrase, mode, why, variant: mode }); return; }
    if (mode === 'rest') {
      const v = new Rng(`${seed}::bassrest:${phrase}`).weighted(I.bass.rest.map((x) => ({ v: x, w: x.w })));
      out.bass.push({ phrase, mode, why, variant: v.id, step: v.step });
    } else {
      const v = new Rng(`${seed}::bassglide:${phrase}`).weighted(I.bass.glide.map((x) => ({ v: x, w: x.w })));
      out.bass.push({ phrase, mode, why, variant: v.id, fromStep: v.fromStep, semis: v.semis });
    }
  };
  // the feature's own moves at the return's second phrase (a lift over the whole return, or a forced variant)
  const forcedAt = new Map<number, Forced>();
  if (featurePlays && 'lift' in featurePlays && returnPhrases.length >= 2) {
    const from = returnPhrases[1].start, last = returnPhrases[returnPhrases.length - 1];
    out.lifts.push({ from, to: last.start + last.bars, kind: featurePlays.lift });
    returnPhrases[1].support.push(`the return's feature: ${feature}`);
    returnPhrases[1].forced = `the return's feature: ${feature}`;
  } else if (featurePlays && 'family' in featurePlays && returnPhrases.length >= 2) {
    forcedAt.set(returnPhrases[1].start, featurePlays);
  }

  // --- the draw, phrase by phrase ---
  const cooldownUntil = new Map<Family, number>();
  let previous: string | null = null;
  let auxUntil = -1, auxRestUntil = -1;
  const auxIn = (p: PhrasePlan, count: number): { to: number; phrases: number } | null => {
    // the entry's span: this phrase and the next where it is a full one of the same passage, ending before a reserved
    // landing, and leaving where its exit is a change of its own: on a section line (the line's arrival carries it) or
    // into a phrase whose supporting change is free
    const exitOk = (to: number) => {
      const q = phraseAt(to);
      return !q || q.section !== p.section && sections[q.section].startBar === to || !q.support.length;
    };
    let to = p.start + p.bars, n = 1;
    const next = phraseAt(to);
    if (count > 1 && next && passageOf.get(next.section) === passageOf.get(p.section) && develops(next.state) && next.bars === 8) { to = next.start + next.bars; n = 2; }
    while (n > 0 && (inReserved(p.start, to, ['landing']) || !exitOk(to))) { n--; to -= 8; }
    return n > 0 ? { to, phrases: n } : null;
  };
  // the salient moments so far: the chapters' planned ones, then this planner's own as it draws them
  const salientSoFar: number[] = [...(I.chapters?.salient ?? [])].sort((a, b) => a - b);
  for (const p of phrases) {
    // an auxiliary part leaving: the exit is this phrase's supporting change, or the section line's own arrival
    if (auxUntil === p.start) (sections[p.section].startBar === p.start ? (p.arrival ??= []) : p.support).push(`the ${auxIdentity} leaves`);
    if (!develops(p.state)) { p.held = p.state === 'half-time' ? 'a half-time phrase is its own change' : `a ${p.state} phrase does not develop`; continue; }
    const pi = passageOf.get(p.section);
    const firstOfPassage = !phrases.some((q) => q.start < p.start && passageOf.get(q.section) === pi);
    if (firstOfPassage) { p.held = 'the passage\'s first phrase plays the skeleton whole'; continue; }
    if (p.bars !== 8) { p.held = 'a short phrase'; continue; }
    const rng = new Rng(`${seed}::phrasedev:${p.start}`);
    const rejected: Array<{ what: string; why: string }> = [];
    const last = p.start + 7;
    const auxOn = (bar: number) => out.aux.spans.some((s) => bar >= s.from && bar < s.to);
    // a variant's reasons not to play here
    const why = (f: FamilyRow, v: Variant): string | null => {
      if (v.drums) {
        const ok = (v.at ?? []).filter((b) => !lineOwned.has(p.start + b - 1) && !inReserved(p.start + b - 1, p.start + b));
        if (!ok.length) return inReserved(p.start, p.start + 8, ['pickup']) ? 'a keys pickup owns the bar' : inReserved(p.start, p.start + 8, ['detail']) ? 'a featured detail owns the bar' : 'the section line\'s fill owns the bar';
      }
      if (v.aux) {
        if (!auxPart) return 'the track drew no auxiliary part';
        if (auxOn(p.start) || p.start < auxRestUntil) return 'the auxiliary part is playing or resting';
        if (inReserved(p.start, p.start + 8)) return 'a keys pickup in the phrase';
        if (!v.aux.some((n) => auxIn(p, n))) return 'it could not leave before a keys landing or into a free change';
      }
      if (v.lift) {
        if (I.liftSpans.some((s) => p.start + 4 < s.to && p.start + 8 > s.from)) return 'the kit\'s lift already closes every bar here';
        if (out.lifts.some((s) => p.start < s.to && p.start + 8 > s.from)) return 'a lift is already there';
      }
      if (v.throw === 'mid') {
        if (I.endThrowAt(last)) return 'the phrase\'s end throw already sounds';
        if (inReserved(p.start + 3, p.start + 4)) return 'a keys pickup owns the bar';
      }
      if (v.throw === 'aux') {
        if (auxIdentity !== 'rim' || !auxOn(p.start)) return 'no rim answer plays in the phrase';
        if (I.endThrowAt(last)) return 'the phrase\'s end throw already sounds';
      }
      if (previous === `${f.family}.${v.id}`) return 'the previous phrase\'s featured move';
      return null;
    };
    const forced = forcedAt.get(p.start);
    let family: FamilyRow | undefined, variant: Variant | undefined;
    // **The chapters' deadline**: nothing salient since `last`, none planned before `last + maxGap`, and the next phrase
    // too late to answer it — this phrase may not continue, and its move falls by the deadline
    const CP = I.chapters;
    let deadline = Infinity;
    if (CP && !forced) {
      const last = Math.max(-Infinity, ...salientSoFar.filter((b) => b < p.start));
      const next = salientSoFar.find((b) => b >= p.start);
      if (Number.isFinite(last) && (next === undefined || next > last + CP.maxGap) && p.start + 15 >= last + CP.maxGap) {
        deadline = last + CP.maxGap;
        p.required = `nothing salient since bar ${last}: the ${CP.maxGap}-bar deadline falls on bar ${deadline}`;
      }
    }
    if (forced) {
      family = row.families.find((f) => f.family === forced.family);
      variant = family?.variants?.find((v) => v.id === forced.variant);
      const no = family && variant ? why(family, variant) : 'not in the row';
      if (no && no !== 'the previous phrase\'s featured move') { rejected.push({ what: `forced ${forced.family}.${forced.variant}`, why: no }); family = variant = undefined; }
      else p.forced = `the return's feature: ${feature}`;
    }
    if (!family) {
      // 1-5: the eligible families at the place's lean, each with the variants that can play
      const live: Array<{ f: FamilyRow; vs: Variant[]; w: number }> = [];
      const developed = p.state === 'developed' ? row.developed : undefined;
      const edit = developed && edits ? developed.edits[edits] : undefined;
      const chapterLean = CP?.leanAt(p.start);
      for (const f of row.families) {
        const w = f.w * (I.lean?.[f.family] ?? 1) * (developed?.lean[f.family] ?? 1) * (chapterLean?.[f.family] ?? 1);
        if (p.required && f.family === 'continue') { rejected.push({ what: f.family, why: 'the chapters\' deadline' }); continue; }
        if (!(w > 0)) { rejected.push({ what: f.family, why: 'weighs nought here' }); continue; }
        if (f.family === 'continue') { live.push({ f, vs: [], w }); continue; }
        const slot = f.slot === 'support' ? p.support : p.foreground;
        if (slot.length >= (f.slot === 'support' ? row.budget.support : row.budget.foreground)) { rejected.push({ what: f.family, why: `the phrase's ${f.slot} change is ${slot.join(', ')}` }); continue; }
        if ((cooldownUntil.get(f.family) ?? -1) > p.start) { rejected.push({ what: f.family, why: 'its cooldown' }); continue; }
        const vs: Variant[] = [];
        for (const v of f.variants ?? []) {
          let no = why(f, v);
          if (!no && p.required && !CP!.counts(f.family, v.id)) no = 'it is not a salient moment, and the deadline wants one';
          if (!no && p.required && v.drums && !(v.at ?? []).some((b) => p.start + b - 1 <= deadline && !lineOwned.has(p.start + b - 1) && !inReserved(p.start + b - 1, p.start + b))) no = 'it falls after the deadline';
          const vw = v.w * (edit ? edit[`${f.family}.${v.id}`] ?? 1 : 1);
          if (no) rejected.push({ what: `${f.family}.${v.id}`, why: no }); else if (vw > 0) vs.push(vw === v.w ? v : { ...v, w: vw });
        }
        if (!vs.length) { rejected.push({ what: f.family, why: 'no variant can play here' }); continue; }
        live.push({ f, vs, w });
      }
      if (!live.length) {
        // nothing that counts can play: the bed's planned subtraction carries the deadline, or it goes unmet and says so
        p.family = 'continue';
        p.rejected = rejected;
        p.met = CP!.subtract(p.start, p.start + 8, `the deadline on bar ${deadline}: no drum move could play`) ? 'the bed\'s planned subtraction' : 'unmet';
        previous = null;
        continue;
      }
      const pick = rng.weighted(live.map((x) => ({ v: x, w: x.w })));
      family = pick.f;
      variant = pick.vs.length ? rng.weighted(pick.vs.map((v) => ({ v, w: v.w }))) : undefined;
    }
    p.family = family.family;
    p.rejected = rejected;
    if (!variant) { previous = null; continue; }
    p.variant = variant.id;
    previous = `${family.family}.${variant.id}`;
    if (family.cooldown) cooldownUntil.set(family.family, p.start + 8 * (family.cooldown + 1));
    const slot = family.slot === 'support' ? p.support : p.foreground;
    if (variant.drums) {
      const ok = (variant.at ?? []).filter((b) => !lineOwned.has(p.start + b - 1) && !inReserved(p.start + b - 1, p.start + b) && p.start + b - 1 <= deadline);
      const b = ok.length > 1 ? ok[rng.int(0, ok.length)] : ok[0];
      p.at = p.start + b - 1;
      out.answers.push({ bar: p.at, answer: variant.drums });
      slot.push(`${variant.drums} on bar ${b}`);
      if (variant.bass && b === 8) bassMove(p.start, variant.bass, `with the drums' ${variant.drums}`);
    } else if (variant.aux) {
      const counts = variant.aux.filter((c) => auxIn(p, c));
      const n = counts.length > 1 ? counts[rng.int(0, counts.length)] : counts[0];
      const span = auxIn(p, n)!;
      out.aux.spans.push({ from: p.start, to: span.to });
      auxUntil = span.to;
      auxRestUntil = span.to + 8 * (I.aux?.rest ?? 1);
      slot.push(`the ${auxIdentity} enters for ${span.phrases} phrase${span.phrases > 1 ? 's' : ''}`);
      p.at = p.start;
    } else if (variant.lift) {
      out.lifts.push({ from: p.start + 4, to: p.start + 8, kind: variant.lift });
      slot.push(`the kit's ${variant.lift} over bars 5-8`);
      p.at = p.start + 4;
    } else if (variant.throw) {
      p.at = variant.throw === 'mid' ? p.start + 3 : last;
      out.throws.push({ bar: p.at, kind: variant.throw });
      slot.push(`a ${variant.throw === 'mid' ? 'backbeat' : 'rim'} throw on bar ${p.at - p.start + 1}`);
    }
    if (CP && p.at != null && CP.counts(family.family, variant.id)) {
      salientSoFar.push(p.at);
      salientSoFar.sort((a, b) => a - b);
      if (p.required) p.met = `${family.family}.${variant.id} on bar ${p.at}, in place of continuing`;
    }
  }

  // --- the fills: only where something changes, one owner per boundary ---
  const changesAt = (bar: number): string | null => {
    const p = phraseAt(bar);
    if (!p) return null;
    if (p.start === bar && (p.support.length || p.arrival?.length || p.state !== phraseAt(bar - 1)?.state)) return p.support[0] ?? p.arrival?.[0] ?? `into ${p.state}`;
    return null;
  };
  for (const bar of I.phraseFills) {
    const p = phraseAt(bar);
    if (!p) continue;
    if (p.foreground.length) { out.fills.dropped.push({ bar, why: `the phrase's foreground change is ${p.foreground.join(', ')}` }); continue; }
    // a featured detail speaking keeps the kit's fill out (the ambient voices' windows); a fill may reply after it
    if (inReserved(bar, bar + 1, ['detail'])) { out.fills.dropped.push({ bar, why: 'a featured detail owns the bar' }); continue; }
    const dest = changesAt(bar + 1);
    if (!dest) { out.fills.dropped.push({ bar, why: 'nothing changes after it' }); continue; }
    out.fills.kept.push(bar);
    p.foreground.push(`a fill into ${dest}`);
    if (row.fills?.bass && develops(p.state)) bassMove(p.start, row.fills.bass, 'under the fill');
  }
  // the section lines' own fills: the bass rests under them where it plays (the drums busy, the bass simple)
  if (row.fills?.bass) for (const bar of lineOwned) {
    const p = phraseAt(bar);
    if (!p || p.start + p.bars - 1 !== bar || !develops(p.state) || out.bass.some((b) => b.phrase === p.start)) continue;
    bassMove(p.start, row.fills.bass, 'under the section line\'s fill');
  }

  // --- the surface: the passages it lies under, one arc each ---
  if (I.surface) {
    const classOf = (bar: number): string | null => {
      const p = phraseAt(bar);
      if (!p) return null;
      const c = p.state === 'bed' || p.state === 'hints' || p.state === 'pulse' ? 'exposed' : p.kind === 'intro' ? 'intro' : p.kind === 'outro' ? 'outro' : null;
      return c && Object.hasOwn(I.surface!.present, c) ? c : null;
    };
    for (let bar = 0; bar < arrangement.bars;) {
      const c = classOf(bar);
      if (!c) { bar++; continue; }
      let end = bar;
      while (end < arrangement.bars && classOf(end) === c) end++;
      if (end - bar >= I.surface.leastBars) out.surface.push({ from: bar, to: end, class: c });
      bar = end;
    }
  }
  // the drawn identity in one line
  const moves = new Map<string, number>();
  for (const p of phrases) if (p.variant) moves.set(`${p.family}.${p.variant}`, (moves.get(`${p.family}.${p.variant}`) ?? 0) + 1);
  const used = [...new Set(phrases.map((p) => p.state))].filter((st) => kitStates[st]).map((st) => `${st}→${kitStates[st]}`);
  out.summary = [
    `form ${I.form?.id ?? 'the place\'s orders'}${I.form?.drawn.length ? ` (${I.form.drawn.map((d) => d.replace(/ of .*/, '')).join(', ')})` : ''}`,
    ...(feature ? [`return feature ${feature}`] : []),
    ...(used.length ? [`kit states ${used.join(', ')}`] : []),
    ...(edits ? [`edits ${edits}`] : []),
    `auxiliary ${auxIdentity}${out.aux.spans.length ? ` ×${out.aux.spans.length}` : ''}`,
    `surface ${I.surface?.id ?? 'none'}`,
    ...(halfTimeBass ? [`half-time bass ${halfTimeBass}`] : []),
    `moves ${[...moves].map(([m, n]) => `${m}${n > 1 ? `×${n}` : ''}`).join(', ') || 'none'}`,
  ].join(' · ');
  return out;
}

/** The per-bar state the plan puts a bar in, for the bar loop and the kit pass: a phrase's own, else none. */
export function stateAt(plan: DevelopmentPlan, bar: number): string | null {
  const p = plan.phrases.find((x) => bar >= x.start && bar < x.start + x.bars);
  return p ? p.state : null;
}

/** A knot curve over nought to one, read at `u` (straight between knots, held outside them). */
export function arcAt(knots: ReadonlyArray<readonly [number, number]>, u: number): number {
  if (u <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (u <= knots[i][0]) {
    const [a, x] = knots[i - 1], [b, y] = knots[i];
    return x + ((u - a) / (b - a)) * (y - x);
  }
  return knots[knots.length - 1][1];
}

/**
 * A run with a glide added to its residual (the bass's answer across a gap the drums left): straight from nought at
 * `from` to `semis` at `to`, held after, in sixteenths from the run's start; the run's own gestures stay under it.
 */
export function withEndGlide<R extends { pitch: [number, number][] }>(run: R, from: number, to: number, semis: number): R {
  const piece = (s: number): number => (s <= from ? 0 : s >= to ? semis : ((s - from) / (to - from)) * semis);
  const at = (knots: readonly [number, number][], s: number): number => {
    if (s <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) if (s <= knots[i][0]) {
      const [a, x] = knots[i - 1], [b, y] = knots[i];
      return s === b ? y : x + ((s - a) / (b - a)) * (y - x);
    }
    return knots[knots.length - 1][1];
  };
  const steps = [...new Set([...run.pitch.map(([s]) => s), from, to])].filter((s) => s >= run.pitch[0][0] && s <= run.pitch[run.pitch.length - 1][0]).sort((x, y) => x - y);
  return { ...run, pitch: steps.map((s): [number, number] => [s, at(run.pitch, s) + piece(s)]) };
}
