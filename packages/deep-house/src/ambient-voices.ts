// **The ambient voices** (liquid-ambient, 10-11; the research manual's sections 4, 5 and 6): the breathy soloist and
// the one motif a track remembers, the conversation's one vocabulary around it, and one weather identity a track.
// A composer mechanism that knows rows, a form and the keys' plan, never a genre; a place table says where it plays
// (`AMBIENT_VOICES` in `styles/deep-house-places.ts`).
//
// **The order** (the manual's section 2): the form and the keys are planned first; the ambient plan's chapters and
// slots (the bed's planner's, or this module's stand-in until it lands: `standInSlots`) and the keys' windows say
// where a featured detail may speak; this module then places, in priority, the motif's statements, a thunder event,
// and the decorative fillers, each in the one featured-detail slot; the windows it took ride into the phrase planner
// as reserved (`kind: 'detail'`), so no conspicuous drum answer or fill is drawn while it speaks; the weather spans
// are laid as a surface beside it. After the drums are final every new part is admitted through the cast budget in
// the admission row's order, with its fallback recorded (`admitAmbient`), and only then realised (`ambientEvents`).
//
// **Hierarchical draws, each off a stream of its own** (`<seed>::ambient:*`): the vocabulary, the motif (family,
// shape, length), the soloist's tone and the weather identity once a track; the statements' counts and places per
// slot; the small performance per note. Nothing here draws from another planner's stream, so the kit, the riff and
// the keys keep every die they had.
//
// The rows: `recipes/ambient/soloist.json` (the voice, the motif families, the tone ranges), `fillers.json` (the
// vocabularies, the occurrence by chapter function, the gestures' rates), `weather.json` (the identities, their
// places, contours and techniques) and `admission.json` (the budget's order and target). Weights are listening
// hypotheses, his to move.

import { leaned, type LeanRow } from './lean.ts';
import { dbToGain } from '@deep-house/engine/dsp';
import SOLOIST_FILE from '../recipes/ambient/soloist.json' with { type: 'json' };
import FILLERS_FILE from '../recipes/ambient/fillers.json' with { type: 'json' };
import WEATHER_FILE from '../recipes/ambient/weather.json' with { type: 'json' };
import ADMISSION_FILE from '../recipes/ambient/admission.json' with { type: 'json' };
import { Rng } from './rng.ts';
import type { Section } from './arrangement.ts';
import type { KeysPlan, KeysChord } from './keys-phrase.ts';
import { chordIndexAt } from './keys-phrase.ts';

// --- the rows ---------------------------------------------------------------------

type Pairs<T> = Array<[T, number]>;
type Range = [number, number];
export interface MotifShape { id: string; w: number; deg: number[]; at: number[]; len: number[] }
export interface SoloistRow {
  id: string;
  /** the soloist's voice by weight; a voice at nought is drawn never, and serves as a fallback only where the cast already sounds it */
  voices: Array<{ voice: string; w: number; says?: string }>;
  families: Array<{ id: string; name: string; w: number; shapes: MotifShape[] }>;
  phraseBars: Pairs<number>;
  register: Range;
  centre: Range;
  legato: number;
  lateMs: Range;
  vel: Range;
  tone: Record<string, Range>;
  shortNoteSteps: number;
  shortVibratoCents: Range;
  sends: { dry: number; reverb: number; delay: number };
  dissolve: { chance: number; notes: number; dry: number; reverb: number; delay: number; tailBars: number };
  swell: { attackShare: number; bars: Range; notes: Pairs<number> };
  levelDb: number;
  classDb: Record<string, number>;
  birds: Record<string, Record<string, number | string>>;
  /** a held destination's breath: a longer attack, and the mouth opening over this share of its length */
  heldAttack: Range;
  vowelOpen: number;
  /** the slow wavetable pad's per-note controls, where it is the soloist */
  wavePad: { attack: Range; release: Range; cutoffMul: Range };
}
type Owner = 'soloist' | 'keys' | 'bell';
type Gesture = 'statement' | 'keys-echo' | 'delay-tail' | 'swell' | 'reverse' | 'silence';
export type StatementKind = 'statement' | 'recurrence' | 'developed' | 'spacious' | 'fragment';
export interface FillersRow {
  id: string;
  vocabularies: Array<{ id: string; w: number; owner: Owner; gestures: Gesture[] }>;
  birds: LeanRow;
  owners: {
    soloist: { notes: Range; minGapBars: number; gapBars: Range; least?: number };
    keys: { notes: Range; minGapBars: number; gapBars: Range; least?: number; register: Range; vel: Range; lenSteps: Range; levelDb: number };
    bell: { voice: string; notes: Range; minGapBars: number; gapBars: Range; least?: number; register: Range; vel: Range; levelDb: number; indexMul: number; lpMul: Range; reverb: number; delay: number };
  };
  byFunction: Record<string, { count: Pairs<number>; kinds: StatementKind[]; delayBars?: number }>;
  track: { least: number; most: number };
  recoveryBars: number;
  landingAttackSteps: number;
  landingTailSteps: number;
  echo: { perBars: number; chance: number; repeats: Range; everySteps: Pairs<number>; decay: number; lpMul: Range; fromKinds: string[] };
  delayTail: { perBars: number };
  swell: { perBars: number; chance: number; functions: string[] };
  reverse: { count: Pairs<number>; voice: string; dur: Range; gainDb: number };
  silence: { chance: number; bars: number };
}
type Main = 'wind' | 'rain' | 'dark';
interface PlaceRule { chance: number; bars: Range; db: number; most?: number }
export interface WeatherFamily {
  id: string; w: number; main: Main;
  places: Record<string, PlaceRule>;
  spansMost?: number;
  inner?: { bars: Range; db: number; bright: number };
  upper?: { perSpan: Pairs<number>; bars: Range; db: number };
  thunder?: { count: Pairs<number>; apartBars: number; classes: string[]; dur: Range; db: number; bars: number };
}
export interface WeatherRow {
  id: string;
  sounds: { wind: string; upper: string; rain: string; dark: string; rumble: string };
  families: WeatherFamily[];
  birds: LeanRow;
  contours: Array<{ id: string; w: number; level: Array<[number, number]>; bright: Array<[number, number]> }>;
  main: Record<Main, { midi: number; vel: number; reverb: number; levelDb: number; bright?: number }>;
  upperTone: { midi: number; vel: number; reverb: number; levelDb: number; lpMul: Range };
  /**
   * the birds on the upper air (PLAN-UNIFY U3, the fast places' birds), about the place's own tile (`centre`, by bird):
   * Zephyr's step on its level (dB a unit, held to ±`mostDb`) and its lean on its brightness (a factor on the low-pass)
   */
  upperBirds?: { centre: Record<string, number>; zephyr?: { db?: number; bright?: number }; mostDb: number };
  rumbleTone: { midi: number; vel: number; reverb: number };
  segmentBars: number;
  tailS: number;
  absenceBars: number;
  upperMost: number;
  cleanBars: number;
  loomLonger: number;
  veilChance: Range;
  tideReverb: number;
}
export interface AdmissionRow { id: string; target: number; order: Array<{ part: 'weather' | 'owner' | 'upper' | 'rumble' | 'reverse'; fallback: string; says: string }> }

const SOLOISTS = SOLOIST_FILE.rows as unknown as SoloistRow[];
const FILLERS = FILLERS_FILE.rows as unknown as FillersRow[];
const WEATHERS = WEATHER_FILE.rows as unknown as WeatherRow[];
const ADMISSIONS = ADMISSION_FILE.rows as unknown as AdmissionRow[];
export const AMBIENT_ROWS = Object.freeze({ soloist: SOLOISTS, fillers: FILLERS, weather: WEATHERS, admission: ADMISSIONS });

const byId = <T extends { id: string }>(list: readonly T[], id: string, what: string): T => {
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`ambient: no ${what} row ${id}`);
  return r;
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const range = (v: unknown, lo = -Infinity, hi = Infinity): boolean => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] <= v[1] && v[0] >= lo && v[1] <= hi;
const pairs = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every((x) => Array.isArray(x) && x.length === 2 && finite(x[1]) && x[1] >= 0);

/** Everything wrong with the ambient rows, as sentences; `voiceExists` and `controls` are the engine's word on a voice. */
export function ambientRowsFaults(voiceExists: (v: string) => boolean = () => true, controls: (v: string) => string[] = () => []): string[] {
  const bad: string[] = [];
  for (const r of SOLOISTS) {
    for (const v of r.voices) if (!voiceExists(v.voice) || !(v.w >= 0)) bad.push(`${r.id}: ${v.voice} is no voice, or weighs ${v.w}`);
    if (!r.voices.some((v) => v.w > 0)) bad.push(`${r.id}: one voice drawn at least`);
    const tot = r.families.reduce((a, f) => a + f.w, 0);
    if (!(tot > 0)) bad.push(`${r.id}: the families weigh nothing`);
    for (const f of r.families) for (const s of f.shapes) {
      const at = `${r.id}.${f.id}.${s.id}`;
      if (s.deg.length < 2 || s.deg.length > 5) bad.push(`${at}: two to five notes`);
      if (s.at.length !== s.deg.length || s.len.length !== s.deg.length) bad.push(`${at}: deg, at and len of one length`);
      if (Math.max(...s.deg) - Math.min(...s.deg) > 4) bad.push(`${at}: within a fifth (four scale steps)`);
      if (!s.at.every((x, i) => i === 0 || x >= s.at[i - 1] + s.len[i - 1])) bad.push(`${at}: one note at a time`);
      if (s.at.some((x) => x % 4 !== 0)) bad.push(`${at}: the rhythm on the slow pulse (onsets on quarters of the fast bar)`);
      if (s.at[s.at.length - 1] + s.len[s.len.length - 1] > 32) bad.push(`${at}: inside two fast bars`);
      if (s.len.some((x) => x < 2 || x > 16)) bad.push(`${at}: a note from half a beat to one bar`);
      if (s.len.filter((x) => x > 8).length > 1) bad.push(`${at}: one longer destination at most`);
    }
    if (!pairs(r.phraseBars) || r.phraseBars.some(([b]) => b !== 2 && b !== 4)) bad.push(`${r.id}: phraseBars two or four`);
    if (!range(r.register, 36, 96) || !range(r.centre, r.register[0], r.register[1])) bad.push(`${r.id}: register and centre`);
    const known = controls(r.voices.find((v) => v.w > 0)?.voice ?? '');
    for (const [k, v] of Object.entries(r.tone)) {
      if (!range(v)) bad.push(`${r.id}: tone.${k} a range`);
      if (known.length && !known.includes(k)) bad.push(`${r.id}: tone.${k} is no control of the drawn voice`);
    }
  }
  for (const r of FILLERS) {
    if (!r.vocabularies.length || r.vocabularies.some((v) => !(v.w >= 0) || !['soloist', 'keys', 'bell'].includes(v.owner))) bad.push(`${r.id}: vocabularies, each an owner and a weight`);
    if (!voiceExists(r.owners.bell.voice)) bad.push(`${r.id}: ${r.owners.bell.voice} is no voice`);
    if (!voiceExists(r.reverse.voice)) bad.push(`${r.id}: ${r.reverse.voice} is no voice`);
    for (const [fn, x] of Object.entries(r.byFunction)) if (!pairs(x.count)) bad.push(`${r.id}: byFunction.${fn}.count by weight`);
    if (!(r.track.least >= 2) || !(r.track.most >= r.track.least)) bad.push(`${r.id}: a track states its motif twice at least`);
  }
  for (const r of WEATHERS) {
    for (const v of Object.values(r.sounds)) if (!voiceExists(v)) bad.push(`${r.id}: ${v} is no voice`);
    for (const f of r.families) {
      if (!(f.w >= 0)) bad.push(`${r.id}.${f.id}: weighs ${f.w}`);
      if (!r.main[f.main]) bad.push(`${r.id}.${f.id}: no main ${f.main}`);
      for (const [c, p] of Object.entries(f.places)) if (!range(p.bars, 4, 64) || !(p.chance >= 0 && p.chance <= 1)) bad.push(`${r.id}.${f.id}: places.${c}`);
      if (f.thunder && f.thunder.apartBars < 64) bad.push(`${r.id}.${f.id}: thunder sixty-four bars apart at least`);
    }
    if (!(r.absenceBars >= 8)) bad.push(`${r.id}: an absence of eight bars at least`);
    if (!(r.upperMost <= 0.25)) bad.push(`${r.id}: the upper air under a quarter of the track`);
  }
  for (const r of ADMISSIONS) if (!(r.target > 0 && r.target <= 220)) bad.push(`${r.id}: a target under the ceiling`);
  return bad;
}

// --- the slots: the ambient plan's shape -------------------------------------------

/** A stretch of a passage with one function (the bed's planner's chapters): bars, `to` not included. */
export interface AmbientChapter { from: number; to: number; section: number; fn: string }
/** Where a featured detail may speak, with its chapter's function: bars, `to` not included. */
export interface DetailSlot {
  from: number; to: number; chapter: number; fn: string;
  /** the bed's planner's word, where it made the slot: what it is for, whether a statement must fill it, what the bed does under it */
  use?: string; required?: boolean; bed?: string;
}
/** A window in sixteenths from the theme's start, `to` not included: hard (no competing attack), soft (compatible, quieter material only) or recovery (no new featured entrance). */
export interface AmbientReservation { kind: 'hard' | 'soft' | 'recovery'; from: number; to: number; owner: string }
/** The ambient plan's slots and reservations (the shape the bed's planner hands this module). */
export interface AmbientSlots { source: string; chapters: AmbientChapter[]; slots: DetailSlot[]; reservations: AmbientReservation[] }

/** A section's class for the ambient voices: what a passage is to a listener. */
export const ambientClass = (kind: string): string =>
  kind === 'intro' ? 'intro' : kind === 'build' ? 'opening' : kind === 'breakdown' ? 'exposed' : kind === 'outro' ? 'outro' : 'full';

const ORDERS: Array<[string[], number]> = [
  [['statement', 'answer', 'subtraction', 'reprise'], 50],
  [['statement', 'subtraction', 'answer', 'reprise'], 30],
  [['statement', 'rhythmic', 'answer', 'reprise'], 20],
];

/**
 * **The stand-in for the bed's planner's slots** (until the two branches meet): chapters off the form, each passage of
 * full sections cut into 32-bar chapters after its clean first eight bars, their functions in one development order
 * drawn a track; an exposed passage's own; the intro past its mixing bars an opening, the outro before its last
 * sixteen. Reservations: the keys' pickups and each landing's attack hard, the landing's tail soft, the mixing regions
 * hard (a section's last bar the planner reserves itself, whoever made the slots).
 */
export function standInSlots(seed: string, sections: readonly Section[], keys: KeysPlan | null, row: FillersRow): AmbientSlots {
  const order = new Rng(`${seed}::ambient:standin-order`).weighted(ORDERS.map(([v, w]) => ({ v, w })));
  const chapters: AmbientChapter[] = [];
  const cut = (from: number, to: number, section: number, fns: (i: number) => string, size = 32) => {
    let i = 0;
    for (let b = from; b < to;) {
      let e = Math.min(to, b + size);
      if (to - e < 16) e = to;
      chapters.push({ from: b, to: e, section, fn: fns(i++) });
      b = e;
    }
  };
  let passage = -1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], cls = ambientClass(s.kind), end = s.startBar + s.bars;
    if (cls === 'full') {
      if (i > 0 && ambientClass(sections[i - 1].kind) === 'full') continue;
      passage++;
      let j = i, to = end;
      while (j + 1 < sections.length && ambientClass(sections[j + 1].kind) === 'full') { j++; to = sections[j].startBar + sections[j].bars; }
      const clean = Math.min(8, to - s.startBar);
      chapters.push({ from: s.startBar, to: s.startBar + clean, section: s.index, fn: 'mix' });
      const fns = passage === 0 ? order : ['return', ...order.slice(1)];
      // the return's first chapter starts at the line (its statement waits its own delay), the first passage's after the clean bars
      if (passage === 0) cut(s.startBar + clean, to, s.index, (k) => fns[k % fns.length]);
      else { chapters.pop(); cut(s.startBar, to, s.index, (k) => fns[k % fns.length]); }
      continue;
    }
    if (cls === 'intro') {
      const clean = Math.min(16, s.bars);
      chapters.push({ from: s.startBar, to: s.startBar + clean, section: s.index, fn: 'mix' });
      if (s.bars - clean >= 8) cut(s.startBar + clean, end, s.index, () => 'opening');
      continue;
    }
    if (cls === 'outro') {
      const clean = Math.min(16, s.bars);
      if (s.bars - clean >= 8) cut(s.startBar, end - clean, s.index, () => 'outro');
      chapters.push({ from: end - clean, to: end, section: s.index, fn: 'mix' });
      continue;
    }
    cut(s.startBar, end, s.index, () => cls);
  }
  const slots: DetailSlot[] = chapters.flatMap((c, i) => (c.fn === 'mix' ? [] : [{ from: c.from, to: c.to, chapter: i, fn: c.fn }]));
  const reservations: AmbientReservation[] = [];
  for (const w of keys?.reserved ?? []) {
    if (w.kind === 'pickup') reservations.push({ kind: 'hard', from: w.from, to: w.to, owner: `the keys' pickup into bar ${w.bar}` });
    else {
      reservations.push({ kind: 'hard', from: w.from, to: w.from + row.landingAttackSteps, owner: `the keys' landing at bar ${w.bar}` });
      reservations.push({ kind: 'soft', from: w.from + row.landingAttackSteps, to: w.from + row.landingTailSteps, owner: `the keys' landing tail at bar ${w.bar}` });
    }
  }
  for (const c of chapters) if (c.fn === 'mix') reservations.push({ kind: 'hard', from: c.from * 16, to: c.to * 16, owner: 'a clean region' });
  return { source: 'stand-in', chapters, slots, reservations };
}

// --- the plan -----------------------------------------------------------------------

/** One note of a statement or a gesture: sixteenths from the theme's start, its length in sixteenths, its pitch. */
export interface AmbientNote { step: number; len: number; midi: number; vel: number; lateMs: number; vibrato: boolean }
export interface Statement {
  owner: Owner;
  kind: StatementKind;
  /** how this statement keeps the motif: the same rhythm and contour, the rhythm with a changed ending, the contour slowed, the ending alone */
  relation: 'same' | 'rhythm' | 'contour' | 'fragment';
  bar: number;
  from: number;
  to: number;
  fn: string;
  chord: string;
  /** the last note let go into the delay and the room (the delay-tail answer) */
  dissolve: boolean;
  /** it starts inside a landing's tail, on a tone of that chord */
  sharedTone: boolean;
  /** it fills a slot the bed's planner required */
  required?: boolean;
  notes: AmbientNote[];
}
export interface Filler {
  kind: 'keys-echo' | 'swell' | 'reverse' | 'silence';
  bar: number;
  from: number;
  to: number;
  why: string;
  notes?: AmbientNote[];
  /** the echo's darkening, per repeat */
  lpMul?: number[];
  /** the reverse-like arrival's length in seconds and the entrance it lands on */
  durS?: number;
}
export interface WeatherSpan {
  technique: 'main' | 'upper';
  voice: string;
  from: number;
  to: number;
  cls: string;
  contour: string;
  db: number;
}
export interface Thunder { bar: number; from: number; to: number; durS: number; db: number }
export interface AmbientVoicesPlan {
  rows: { soloist: string; fillers: string; weather: string; admission: string };
  slots: { source: string; chapters: AmbientChapter[]; slots: DetailSlot[] };
  vocabulary: string;
  owner: Owner;
  /** the owner the vocabulary drew, before the budget */
  drawnOwner: Owner;
  /** the soloist's voice, drawn (the syllable), or the fallback the budget chose */
  voice: string;
  drawnVoice: string;
  gestures: Gesture[];
  motif: { family: string; shape: string; bars: number; deg: number[]; at: number[]; len: number[]; centre: number };
  tone: Record<string, number>;
  statements: Statement[];
  fillers: Filler[];
  weather: { family: string; main: string | null; spans: WeatherSpan[]; thunder: Thunder[]; upperShare: number };
  /** the featured detail's windows, in sixteenths: they ride into the phrase planner as reserved (`kind: 'detail'`) */
  windows: Array<{ kind: 'detail'; bar: number; from: number; to: number; owner: string }>;
  /** where the bed should withdraw or keep one quiet tone (a statement speaking) and where it should stay away (a silence answer), in sixteenths */
  bedYield: Array<{ from: number; to: number; why: string }>;
  rejected: Array<{ what: string; why: string }>;
  /** the statements each slot drew, before the track's bounds */
  counts: string[];
  budget?: AmbientBudget;
  summary: string;
}
export interface AmbientBudget { target: number; ceiling: number; before: number; after: number; voices: string[]; parts: Array<{ part: string; voice: string | null; units: number; verdict: string }> }

export interface AmbientVoicesInput {
  seed: string;
  entry: { soloist: string; fillers: string; weather: string; admission: string };
  sections: readonly Section[];
  bars: number;
  barSeconds: number;
  keys: KeysPlan;
  spell: Readonly<Record<string, number>>;
  /** the bed's planner's slots, where it has run; else the stand-in's */
  slots?: AmbientSlots;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const lerp = (r: Rng, [a, b]: Range) => a + (b - a) * r.float();
const pick = <T>(r: Rng, items: ReadonlyArray<readonly [T, number]>): T => r.weighted(items.map(([v, w]) => ({ v, w })));
/** `k` scale steps from `midi` along `scale` (pitch classes), from a note that may sit off the scale */
function scaleStep(midi: number, k: number, scale: readonly number[]): number {
  let x = midi, left = Math.abs(k);
  const dir = Math.sign(k);
  while (left > 0) { x += dir; if (scale.includes(mod(x, 12))) left--; }
  return x;
}
/** the nearest tone of `tones` to `midi`, toward `dir` first where two are as near */
function nearestTone(midi: number, tones: readonly number[], dir = 0): number {
  for (let d = 0; d <= 6; d++) {
    const order = dir < 0 ? [-d, d] : [d, -d];
    for (const x of order) if (tones.includes(mod(midi + x, 12))) return midi + x;
  }
  return midi;
}
const overlaps = (a: { from: number; to: number }, from: number, to: number) => from < a.to && to > a.from;

/**
 * **The ambient voices' plan**: the vocabulary, the motif, the statements and fillers in the featured slot, the weather.
 * Pure: it reads its rows and the plans it is handed and writes nothing but the plan.
 */
export function planAmbientVoices(I: AmbientVoicesInput): AmbientVoicesPlan {
  const { seed, sections, bars, keys, spell } = I;
  const S = byId(SOLOISTS, I.entry.soloist, 'soloist');
  const F = byId(FILLERS, I.entry.fillers, 'fillers');
  const W = byId(WEATHERS, I.entry.weather, 'weather');
  const slots = I.slots ?? standInSlots(seed, sections, keys, F);
  const rejected: Array<{ what: string; why: string }> = [];

  // --- the track's identity: vocabulary, motif, tone ---
  const vocab = new Rng(`${seed}::ambient:vocabulary`).weighted(F.vocabularies.map((v) => ({ v, w: leaned(v.w, v.id, F.birds, spell) })));
  const mr = new Rng(`${seed}::ambient:motif`);
  const family = mr.weighted(S.families.map((f) => ({ v: f, w: f.w })));
  const shape = mr.weighted(family.shapes.map((s) => ({ v: s, w: s.w })));
  const phraseBars = pick(mr, S.phraseBars);
  const gleam = typeof S.birds.gleam?.centre === 'number' ? (S.birds.gleam.centre as number) * ((spell.gleam ?? 0.5) - 0.5) : 0;
  const centre = Math.round(lerp(mr, S.centre) + gleam);
  // a four-bar statement is the two-bar one on the slow pulse: its onsets twice as far apart, its notes longer
  const stretch = phraseBars / 2;
  const motif = {
    family: family.id, shape: shape.id, bars: phraseBars, deg: [...shape.deg], centre,
    at: shape.at.map((x) => x * stretch), len: shape.len.map((x) => Math.min(16, Math.round(x * (stretch > 1 ? 1.5 : 1)))),
  };
  const voice = new Rng(`${seed}::ambient:voice`).weighted(S.voices.filter((v) => v.w > 0).map((v) => ({ v: v.voice, w: v.w })));
  const tr = new Rng(`${seed}::ambient:tone`);
  const tone: Record<string, number> = {};
  for (const [k, v] of Object.entries(S.tone)) tone[k] = +lerp(tr, v).toFixed(3);
  const ownerNotes = vocab.owner === 'soloist' ? motif.deg.length
    : Math.min(motif.deg.length, new Rng(`${seed}::ambient:owner-notes`).int(F.owners[vocab.owner].notes[0], F.owners[vocab.owner].notes[1] + 1));

  // --- the featured slot's occupancy ---
  // hard: the slots' own, and every section's last bar (its line's fill owns it), whoever made the slots
  const hard = [...slots.reservations.filter((r) => r.kind === 'hard'),
    ...sections.filter((s) => s.startBar + s.bars < bars).map((s) => ({ kind: 'hard' as const, from: (s.startBar + s.bars - 1) * 16, to: (s.startBar + s.bars) * 16, owner: `the line at bar ${s.startBar + s.bars}` }))];
  const soft = slots.reservations.filter((r) => r.kind === 'soft');
  const featured: Array<{ from: number; to: number; owner: string; recovery: number }> = [];
  const free = (from: number, to: number, recovery = true) => !hard.some((r) => overlaps(r, from, to))
    && !featured.some((f) => overlaps({ from: f.from, to: f.to + (recovery ? f.recovery : 0) }, from, to) || (recovery && overlaps({ from: f.from - F.recoveryBars * 16, to: f.from }, from, to)));
  const chordAt = (bar: number): KeysChord => keys.chords[chordIndexAt(keys, bar)];
  const sameChord = (from: number, to: number) => !keys.states.some((st) => st.bar * 16 > from && st.bar * 16 < to);

  // --- the statements, slot by slot ---
  const owner = F.owners[vocab.owner];
  const stepsOf = (kind: StatementKind) => {
    const n = ownerNotes;
    const at = motif.at, len = motif.len;
    if (kind === 'spacious') {
      const keep = [...motif.deg.keys()].slice(0, n);
      // slowed on the slow pulse: its onsets half as far apart again (twice, from two bars), its notes as long as they may be
      const sAt = keep.map((i) => at[i] * (stretch > 1 ? 1.5 : 2));
      return { at: sAt, len: keep.map((i, j) => Math.min(16, len[i] * 2, j + 1 < sAt.length ? sAt[j + 1] - sAt[j] : 16)), deg: keep.map((i) => motif.deg[i]), keep };
    }
    if (kind === 'fragment' || n < motif.deg.length) {
      const k = kind === 'fragment' ? Math.max(1, Math.min(n, 3, motif.deg.length - 1)) : n;
      const keep = kind === 'fragment' ? [...motif.deg.keys()].slice(-k) : [...motif.deg.keys()].slice(0, k);
      const base = at[keep[0]];
      return { at: keep.map((i) => at[i] - base), len: keep.map((i) => len[i]), deg: keep.map((i) => motif.deg[i]), keep };
    }
    return { at, len, deg: motif.deg, keep: [...motif.deg.keys()] };
  };
  const windowOf = (kind: StatementKind) => { const s = stepsOf(kind); return s.at[s.at.length - 1] + s.len[s.len.length - 1]; };
  const statements: Statement[] = [];
  let lastAnchorPc: number | null = null;
  const realise = (kind: StatementKind, from: number, fn: string): Statement => {
    const bar = Math.floor(from / 16);
    const c = chordAt(bar);
    const st = stepsOf(kind);
    const reg = vocab.owner === 'soloist' ? S.register : F.owners[vocab.owner as 'keys' | 'bell'].register;
    const target = vocab.owner === 'soloist' ? motif.centre : Math.round((reg[0] + reg[1]) / 2);
    // the destination: the tone of the chord nearest the centre, the last statement's own where the chord keeps it
    let anchor = nearestTone(target, c.tones);
    if (lastAnchorPc != null && c.tones.includes(lastAnchorPc)) { const a = target + mod(lastAnchorPc - target + 6, 12) - 6; anchor = a; }
    lastAnchorPc = mod(anchor, 12);
    let midis = st.deg.map((d) => scaleStep(anchor, d, c.scale));
    // a developed answer: the rhythm kept, the ending turned the other way, onto a tone of the chord
    if (kind === 'developed' && midis.length >= 2) {
      const last = midis.length - 1, dir = Math.sign(midis[last] - midis[last - 1]) || -1;
      midis[last] = nearestTone(scaleStep(midis[last - 1], -dir * 2, c.scale), c.tones, -dir);
    }
    // first and last on tones of the chord, the contour's direction kept
    snapEnds(midis, c);
    // into the owner's register by octaves
    while (Math.max(...midis) > reg[1]) midis = midis.map((m) => m - 12);
    while (Math.min(...midis) < reg[0]) midis = midis.map((m) => m + 12);
    const pr = new Rng(`${seed}::ambient:perform:${from}`);
    const vel = vocab.owner === 'soloist' ? S.vel : F.owners[vocab.owner as 'keys' | 'bell'].vel;
    const notes: AmbientNote[] = midis.map((midi, i) => ({
      step: from + st.at[i], len: vocab.owner === 'keys' ? Math.max(F.owners.keys.lenSteps[0], Math.min(F.owners.keys.lenSteps[1], st.len[i])) : st.len[i], midi,
      vel: +lerp(pr, vel).toFixed(3), lateMs: Math.round(lerp(pr, S.lateMs)), vibrato: st.len[i] > S.shortNoteSteps,
    }));
    const relation: Statement['relation'] = kind === 'developed' ? 'rhythm' : kind === 'spacious' ? 'contour' : kind === 'fragment' ? 'fragment' : 'same';
    return { owner: vocab.owner, kind, relation, bar, from, to: from + windowOf(kind), fn, chord: c.symbol, dissolve: false,
      sharedTone: soft.some((r) => from >= r.from && from < r.to), notes };
  };
  const minGap = owner.minGapBars * 16;
  let placedAny = false;
  const drawnCounts: string[] = [];
  // a slot the bed's planner requires is filled first, so no optional statement's gap keeps it out
  for (const slot of [...slots.slots].sort((a, b) => Number(!!b.required) - Number(!!a.required) || a.from - b.from)) {
    const rule = F.byFunction[slot.fn];
    if (!rule) { rejected.push({ what: `the ${slot.fn} chapter at bar ${slot.from}`, why: 'no occurrence rule for its function' }); continue; }
    const cr = new Rng(`${seed}::ambient:count:${slot.from}`);
    let n = pick(cr, rule.count);
    if (vocab.owner === 'bell') n = Math.min(n, 1);
    // a slot the bed's planner made for a statement (the motif's recurrence, the return's answer) is filled
    if (slot.required) n = Math.max(n, 1);
    drawnCounts.push(`${slot.fn}@${slot.from}:${n}`);
    for (let k = 0; k < n; k++) {
      // the first is the statement; a later one in a statement chapter is its recurrence
      const drawn: StatementKind = rule.kinds.length ? rule.kinds[Math.min(k, rule.kinds.length - 1)] : 'recurrence';
      const kind: StatementKind = !placedAny ? 'statement' : drawn === 'statement' ? 'recurrence' : drawn;
      const len = windowOf(kind) + 4;
      // the return's wait is the stand-in's; a slot the bed's planner made already stands where the statement goes
      const lo = slot.from + (slot.use ? 0 : rule.delayBars ?? 0);
      const cands: Array<{ v: number; w: number }> = [];
      // inside the stand-in's chapter whole, on every other bar; inside a slot the bed's planner made (its withdrawal), starting there
      const own = !!slot.use;
      for (let b = lo; own ? b < slot.to : b + Math.ceil(len / 16) <= slot.to; b += own ? 1 : 2) {
        const from = b * 16, to = from + len;
        if (!free(from, to) || !sameChord(from, to)) continue;
        // a required slot keeps the soloist's gap whoever speaks (the bell's own 32 bars would leave it empty)
        const gap0 = slot.required ? Math.min(minGap, F.owners.soloist.minGapBars * 16) : minGap;
        if (statements.some((s) => from < s.to + gap0 && to + gap0 > s.from)) continue;
        const prev = [...statements].reverse().find((s) => s.from < from);
        const gap = prev ? (from - prev.to) / 16 : 24;
        cands.push({ v: from, w: gap >= owner.gapBars[0] && gap <= owner.gapBars[1] ? 3 : gap > owner.gapBars[1] ? 2 : 1 });
      }
      if (!cands.length) { rejected.push({ what: `a ${kind} in the ${slot.fn} chapter at bar ${slot.from}`, why: 'no free window between the keys, the lines and the other details' }); break; }
      const from = new Rng(`${seed}::ambient:place:${slot.from}:${k}`).weighted(cands);
      const s = realise(kind, from, slot.fn);
      if (slot.required) s.required = true;
      statements.push(s);
      statements.sort((a, b) => a.from - b.from);
      featured.push({ from: s.from, to: s.to, owner: `the motif's ${s.kind}`, recovery: F.recoveryBars * 16 });
      placedAny = true;
    }
  }
  // the track's bounds: too many, the latest optional ones go; too few to recognise, a recurrence where one fits
  while (statements.length > F.track.most) {
    // the latest a slot did not require goes first
    const at = statements.map((x) => !x.required).lastIndexOf(true);
    const drop = statements[at >= 0 ? at : statements.length - 1];
    statements.splice(statements.indexOf(drop), 1);
    const i = featured.findIndex((f) => f.from === drop.from);
    if (i >= 0) featured.splice(i, 1);
    rejected.push({ what: `the ${drop.kind} at bar ${drop.bar}`, why: `the track's most is ${F.track.most}` });
  }
  // too few to remember: recurrences where they fit, a slot with the fewest statements first, never in a subtraction
  const least = owner.least ?? F.track.least;
  for (let pass = 0; pass < 4 && statements.length < least; pass++) {
    const order = slots.slots.filter((x) => x.fn !== 'subtraction' && x.fn !== 'mix')
      .map((x) => ({ x, n: statements.filter((s) => s.bar >= x.from && s.bar < x.to).length })).sort((a, b) => a.n - b.n || (b.x.to - b.x.from) - (a.x.to - a.x.from));
    for (const { x: slot } of order) {
      if (statements.length >= least) break;
      const first = F.byFunction[slot.fn]?.kinds[0] ?? 'recurrence';
      const kind: StatementKind = statements.length ? (first === 'statement' ? 'recurrence' : first) : 'statement';
      const len = windowOf(kind) + 4;
      for (let b = slot.from; b + Math.ceil(len / 16) <= slot.to; b += 2) {
        const from = b * 16, to = from + len;
        if (!free(from, to) || !sameChord(from, to) || statements.some((s) => from < s.to + minGap && to + minGap > s.from)) continue;
        const s = realise(kind, from, slot.fn);
        statements.push(s);
        statements.sort((a, b) => a.from - b.from);
        featured.push({ from: s.from, to: s.to, owner: `the motif's ${s.kind}`, recovery: F.recoveryBars * 16 });
        rejected.push({ what: `a ${kind} at bar ${b}`, why: `added: the ${vocab.owner} states the motif ${least} times at least` });
        break;
      }
    }
  }
  // the first statement is the statement; the rest keep their kinds
  if (statements.length && statements[0].kind !== 'statement') { const s0 = realise('statement', statements[0].from, statements[0].fn); statements[0] = s0; }
  for (const s of statements.slice(1)) if (s.kind === 'statement') s.kind = 'recurrence';

  // --- the weather identity and its spans ---
  const wr = new Rng(`${seed}::ambient:weather`);
  const wfam = wr.weighted(W.families.map((f) => ({ v: f, w: leaned(f.w, f.id, W.birds, spell) })));
  const spans: WeatherSpan[] = [];
  const thunder: Thunder[] = [];
  const veil = W.veilChance[0] + (W.veilChance[1] - W.veilChance[0]) * (spell.veil ?? 0.5);
  const mainVoice = W.sounds[wfam.main];
  let placedFull = 0;
  for (const s of sections) {
    const cls = ambientClass(s.kind);
    const rule = wfam.places[cls];
    if (!rule) continue;
    if (wfam.spansMost != null && spans.filter((x) => x.technique === 'main').length >= wfam.spansMost) break;
    if (cls === 'full' && placedFull >= (rule.most ?? 1)) continue;
    const r = new Rng(`${seed}::ambient:weather:${s.startBar}`);
    if (!r.chance(Math.min(1, rule.chance * veil))) { rejected.push({ what: `weather over the ${s.kind} at bar ${s.startBar}`, why: 'not drawn' }); continue; }
    const lo = s.startBar + (cls === 'intro' || cls === 'full' ? Math.min(W.cleanBars, s.bars) : 0);
    const prevEnd = spans.filter((x) => x.technique === 'main').reduce((a, x) => Math.max(a, x.to), -Infinity);
    const from0 = Math.max(lo, prevEnd + W.absenceBars);
    const room = s.startBar + s.bars - from0;
    if (room < rule.bars[0]) { rejected.push({ what: `weather over the ${s.kind} at bar ${s.startBar}`, why: 'no room after the last span\'s absence' }); continue; }
    const longer = r.chance(W.loomLonger * (spell.loom ?? 0.5));
    let len = Math.round((longer ? rule.bars[1] : lerp(r, rule.bars)) / 4) * 4;
    len = Math.max(rule.bars[0], Math.min(len, room - (room % 4)));
    const slack = Math.floor((room - len) / 4);
    const from = from0 + 4 * (cls === 'exposed' ? 0 : r.int(0, slack + 1));
    const contour = r.weighted(W.contours.map((c) => ({ v: c, w: c.w })));
    spans.push({ technique: 'main', voice: mainVoice, from, to: from + len, cls, contour: contour.id, db: rule.db });
    if (cls === 'full') placedFull++;
  }
  // the upper air: short windows inside a span, under a quarter of the track, the Zephyr's more
  let upperBars = 0;
  if (wfam.upper) for (const span of spans.filter((x) => x.technique === 'main')) {
    const r = new Rng(`${seed}::ambient:upper:${span.from}`);
    let n = pick(r, wfam.upper.perSpan);
    if ((spell.zephyr ?? 0.5) < 0.4) n = Math.max(0, n - 1);
    const taken: Array<{ from: number; to: number }> = [];
    for (let k = 0; k < n; k++) {
      const len = Math.round(lerp(r, wfam.upper.bars));
      if ((upperBars + len) / bars > W.upperMost) { rejected.push({ what: `upper air in the span at bar ${span.from}`, why: 'the track\'s quarter is taken' }); break; }
      const opts: number[] = [];
      for (let b = span.from + 2; b + len <= span.to - 2; b += 2) if (!taken.some((t) => b < t.to + 4 && b + len + 4 > t.from)) opts.push(b);
      if (!opts.length) break;
      const b = opts[r.int(0, opts.length)];
      taken.push({ from: b, to: b + len });
      upperBars += len;
      spans.push({ technique: 'upper', voice: W.sounds.upper, from: b, to: b + len, cls: span.cls, contour: 'bright-to-dark', db: wfam.upper.db });
    }
  }
  spans.sort((a, b) => a.from - b.from);
  // thunder under a dark cloud: zero to two, sixty-four bars apart, in the featured slot
  if (wfam.thunder) {
    const T = wfam.thunder;
    const r = new Rng(`${seed}::ambient:thunder`);
    const n = pick(r, T.count);
    const cands = spans.filter((x) => x.technique === 'main' && T.classes.includes(x.cls)).flatMap((x) => {
      const out: number[] = [];
      for (let b = x.from + 4; b + T.bars <= x.to - 2; b += 2) out.push(b);
      return out;
    });
    for (let k = 0; k < n; k++) {
      const ok = cands.filter((b) => free(b * 16, (b + T.bars) * 16) && thunder.every((t) => Math.abs(t.bar - b) >= T.apartBars));
      if (!ok.length) { rejected.push({ what: 'a distant thunder', why: 'no free exposed bar sixty-four bars from the last' }); break; }
      const b = ok[r.int(0, ok.length)];
      thunder.push({ bar: b, from: b * 16, to: (b + T.bars) * 16, durS: +lerp(r, T.dur).toFixed(2), db: T.db });
      featured.push({ from: b * 16, to: (b + T.bars) * 16, owner: 'a distant thunder', recovery: F.recoveryBars * 16 });
    }
    thunder.sort((a, b) => a.bar - b.bar);
  }

  // --- the fillers ---
  const fillers: Filler[] = [];
  const has = (g: Gesture) => vocab.gestures.includes(g);
  // the delay-tail answer: a statement's last note let go into the delay and the room, never every ending
  if (has('delay-tail')) {
    let last = -Infinity;
    for (const s of statements) {
      if (s.owner !== 'soloist' || s.from - last < F.delayTail.perBars * 16) continue;
      if (!new Rng(`${seed}::ambient:dissolve:${s.from}`).chance(S.dissolve.chance)) continue;
      const tailTo = s.to + S.dissolve.tailBars * 16;
      if (hard.some((r) => overlaps(r, s.to, tailTo) && r.owner.startsWith('the keys\' pickup'))) continue;
      s.dissolve = true;
      last = s.from;
      const f = featured.find((x) => x.from === s.from);
      if (f) f.recovery = Math.max(f.recovery, S.dissolve.tailBars * 16);
    }
  }
  // a keys-note echo: the final note of a landing's answer, a few darker repetitions, inside the landing's own tail
  if (has('keys-echo')) {
    let last = -Infinity;
    const byLanding = new Map<number, typeof keys.notes>();
    for (const n of keys.notes) if (F.echo.fromKinds.includes(n.kind) && n.kind === 'post') { const l = byLanding.get(n.landing) ?? []; l.push(n); byLanding.set(n.landing, l); }
    for (const [landing, notes] of [...byLanding].sort((a, b) => a[0] - b[0])) {
      const n = notes.reduce((a, x) => (x.step > a.step || (x.step === a.step && x.midi > a.midi) ? x : a));
      const r = new Rng(`${seed}::ambient:echo:${landing}`);
      if (!r.chance(F.echo.chance)) continue;
      if (n.step - last < F.echo.perBars * 16) { rejected.push({ what: `a keys echo after bar ${landing}`, why: `one in ${F.echo.perBars} bars` }); continue; }
      const repeats = r.int(F.echo.repeats[0], F.echo.repeats[1] + 1), every = pick(r, F.echo.everySteps);
      const from = n.step + every, to = n.step + every * repeats + 4;
      const clear = !hard.some((h) => overlaps(h, from, to)) && !featured.some((f) => overlaps({ from: f.from, to: f.to + f.recovery }, from, to));
      if (!clear || !sameChord(n.step, to)) { rejected.push({ what: `a keys echo after bar ${landing}`, why: 'its repeats would meet a pickup, a line, a chord change or another detail' }); continue; }
      const notesOut: AmbientNote[] = [], lp: number[] = [];
      for (let i = 1; i <= repeats; i++) {
        notesOut.push({ step: n.step + every * i, len: Math.max(2, every), midi: n.midi, vel: +(n.vel * Math.pow(F.echo.decay, i)).toFixed(3), lateMs: Math.max(0, n.lateMs), vibrato: false });
        lp.push(+(F.echo.lpMul[0] + (F.echo.lpMul[1] - F.echo.lpMul[0]) * ((i - 1) / Math.max(1, repeats - 1))).toFixed(3));
      }
      fillers.push({ kind: 'keys-echo', bar: Math.floor(from / 16), from, to, why: `the answer's last note of the landing at bar ${landing}`, notes: notesOut, lpMul: lp });
      featured.push({ from, to, owner: 'a keys echo', recovery: F.recoveryBars * 16 });
      last = n.step;
    }
  }
  // the vocal-like swell: one chord tone, or a two-note answer, shaped over a bar or two, then gone
  if (has('swell')) {
    for (const ch of slots.chapters) {
      if (!F.swell.functions.includes(ch.fn)) continue;
      if (statements.some((s) => s.bar >= ch.from && s.bar < ch.to)) continue;
      const r = new Rng(`${seed}::ambient:swell:${ch.from}`);
      if (!r.chance(F.swell.chance)) continue;
      const len = Math.round(lerp(r, S.swell.bars)) * 16;
      const opts: number[] = [];
      for (let b = ch.from + 2; (b * 16) + len + 8 <= ch.to * 16; b += 2) if (free(b * 16, b * 16 + len + 8) && sameChord(b * 16, b * 16 + len)) opts.push(b);
      if (!opts.length) continue;
      const b = opts[r.int(0, opts.length)];
      const c = chordAt(b);
      const k = pick(r, S.swell.notes);
      const first = nearestTone(motif.centre, c.tones);
      const notes: AmbientNote[] = [{ step: b * 16, len: k === 1 ? len : len / 2, midi: first, vel: +lerp(r, S.vel).toFixed(3), lateMs: 0, vibrato: true }];
      if (k === 2) notes.push({ step: b * 16 + len / 2, len: len / 2, midi: nearestTone(scaleStep(first, -1, c.scale), c.tones, -1), vel: notes[0].vel, lateMs: 0, vibrato: true });
      fillers.push({ kind: 'swell', bar: b, from: b * 16, to: b * 16 + len, why: `the ${ch.fn} chapter at bar ${ch.from} speaks no statement`, notes });
      featured.push({ from: b * 16, to: b * 16 + len, owner: 'a vocal-like swell', recovery: F.recoveryBars * 16 });
    }
  }
  // the reverse-like arrival: a short noise swell landing on a real entrance (a statement's first note), none over a pickup
  if (has('reverse')) {
    const r = new Rng(`${seed}::ambient:reverse`);
    const n = pick(r, F.reverse.count);
    const targets = statements.filter((s) => s.fn !== 'full').map((s) => s);
    const used = new Set<number>();
    for (let k = 0; k < n && targets.length; k++) {
      const ok = targets.filter((s) => !used.has(s.from) && !hard.some((h) => h.owner.startsWith('the keys\' pickup') && overlaps(h, s.from - 8, s.from)));
      if (!ok.length) break;
      const s = ok[r.int(0, ok.length)];
      used.add(s.from);
      const durS = +lerp(r, F.reverse.dur).toFixed(2);
      fillers.push({ kind: 'reverse', bar: s.bar, from: s.from - Math.ceil(durS / (I.barSeconds / 16)), to: s.from, why: `arrives on the motif's ${s.kind} at bar ${s.bar}`, durS });
    }
  }
  // the silence answer: after a recognisable statement, the bed and the details stay away a few bars
  if (has('silence')) for (const s of statements) {
    if (!new Rng(`${seed}::ambient:silence:${s.from}`).chance(F.silence.chance)) continue;
    const to = s.to + F.silence.bars * 16;
    fillers.push({ kind: 'silence', bar: Math.floor(s.to / 16), from: s.to, to, why: `after the motif's ${s.kind} at bar ${s.bar}` });
  }
  fillers.sort((a, b) => a.from - b.from);

  const windows = [
    ...statements.map((s) => ({ kind: 'detail' as const, bar: s.bar, from: s.from, to: s.to, owner: `the motif's ${s.kind} (${s.owner})` })),
    ...thunder.map((t) => ({ kind: 'detail' as const, bar: t.bar, from: t.from, to: t.to, owner: 'a distant thunder' })),
    ...fillers.filter((f) => f.kind === 'keys-echo' || f.kind === 'swell').map((f) => ({ kind: 'detail' as const, bar: f.bar, from: f.from, to: f.to, owner: f.kind })),
  ].sort((a, b) => a.from - b.from);
  const bedYield = [
    ...statements.map((s) => ({ from: s.from, to: s.to, why: `the motif's ${s.kind} speaks: the bed withdraws or keeps one quiet tone` })),
    ...fillers.filter((f) => f.kind === 'silence').map((f) => ({ from: f.from, to: f.to, why: 'a silence answer' })),
  ];
  const upperShare = +(upperBars / bars).toFixed(3);
  const plan: AmbientVoicesPlan = {
    rows: { ...I.entry }, slots: { source: slots.source, chapters: slots.chapters, slots: slots.slots },
    vocabulary: vocab.id, owner: vocab.owner, drawnOwner: vocab.owner, voice, drawnVoice: voice, gestures: [...vocab.gestures], motif, tone,
    statements, fillers, weather: { family: wfam.id, main: spans.some((x) => x.technique === 'main') ? mainVoice : null, spans, thunder, upperShare },
    windows, bedYield, rejected, counts: drawnCounts, summary: '',
  };
  plan.summary = summarise(plan);
  return plan;
}

function summarise(p: AmbientVoicesPlan): string {
  const count = (k: Filler['kind']) => p.fillers.filter((f) => f.kind === k).length;
  const kinds = new Map<string, number>();
  for (const s of p.statements) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  return [
    `ambient ${p.vocabulary}${p.owner === 'soloist' ? ` on ${p.voice}${p.voice !== p.drawnVoice ? ` (for ${p.drawnVoice}, over the budget)` : ''}` : ''}${p.owner !== p.drawnOwner ? ` (the ${p.drawnOwner} over the budget: ${p.owner})` : ''}`,
    `motif ${p.motif.family}/${p.motif.shape} ${p.motif.bars} bars ×${p.statements.length} (${[...kinds].map(([k, n]) => `${k}${n > 1 ? `×${n}` : ''}`).join(', ')})`,
    `weather ${p.weather.family} (${p.weather.spans.filter((x) => x.technique === 'main').length} spans${p.weather.spans.some((x) => x.technique === 'upper') ? `, upper air ×${p.weather.spans.filter((x) => x.technique === 'upper').length}` : ''}${p.weather.thunder.length ? `, thunder ×${p.weather.thunder.length}` : ''})`,
    `fillers echo ×${count('keys-echo')}, tails ×${p.statements.filter((s) => s.dissolve).length}, swell ×${count('swell')}, reverse ×${count('reverse')}, silence ×${count('silence')}`,
  ].join(' · ');
}

// --- the budget -------------------------------------------------------------------

/**
 * **Every new ambient part admitted through the cast budget** (the research manual's section 8): `before` is what the
 * theme already costs (its sounding voices, the keys' space, the auxiliary and the surface as the phrase plan admitted
 * them); each part is added in the admission row's order where it is new, and over the target it takes its fallback,
 * recorded. Mutates the plan: a dropped part's spans or fillers go, a fallen owner speaks through the keys.
 */
export function admitAmbient(plan: AmbientVoicesPlan, A: { sounding: ReadonlySet<string>; besides: number; ceiling: number; unitsOf: (voices: Iterable<string>) => number; surfaceVoice: string | null; keysPlan: KeysPlan }): AmbientBudget {
  const R = byId(ADMISSIONS, plan.rows.admission, 'admission');
  const F = byId(FILLERS, plan.rows.fillers, 'fillers');
  const W = byId(WEATHERS, plan.rows.weather, 'weather');
  const target = Math.min(R.target, A.ceiling);
  // the surface the weather replaced was never laid (`surfaceVoice`): the cast is what sounds; `before` counts the
  // surface as it would have been, and a weather over the target gives it back
  const cast = new Set(A.sounding);
  const replacing = plan.weather.spans.length > 0;
  const before = A.unitsOf(A.sounding) + A.besides + (A.surfaceVoice && !A.sounding.has(A.surfaceVoice) ? A.unitsOf([A.surfaceVoice]) : 0);
  const parts: AmbientBudget['parts'] = [];
  const cost = () => A.unitsOf(cast) + A.besides;
  const tryAdd = (part: string, voice: string | null): boolean => {
    if (!voice) { parts.push({ part, voice, units: 0, verdict: 'nothing to admit' }); return true; }
    if (cast.has(voice)) { parts.push({ part, voice, units: 0, verdict: 'already in the cast' }); return true; }
    const units = A.unitsOf([voice]);
    if (cost() + units <= target) { cast.add(voice); parts.push({ part, voice, units, verdict: 'admitted' }); return true; }
    return false;
  };
  const fallback = (part: string, voice: string | null, says: string) => parts.push({ part, voice, units: voice ? A.unitsOf([voice]) : 0, verdict: `over the target (${cost()} + ${voice ? A.unitsOf([voice]) : 0} > ${target}): ${says}` });
  for (const step of R.order) {
    if (step.part === 'weather') {
      const v = plan.weather.main;
      if (!replacing) { tryAdd('weather', null); if (A.surfaceVoice) cast.add(A.surfaceVoice); continue; }
      if (!tryAdd('weather', v)) {
        fallback('weather', v, 'the surface plays as before');
        plan.weather.spans = [];
        plan.weather.thunder = [];
        plan.weather.main = null;
        if (A.surfaceVoice) cast.add(A.surfaceVoice);
      }
    } else if (step.part === 'owner') {
      const S = byId(SOLOISTS, plan.rows.soloist, 'soloist');
      const voice = plan.owner === 'soloist' || plan.fillers.some((f) => f.kind === 'swell') ? plan.voice : plan.owner === 'bell' ? F.owners.bell.voice : null;
      if (!tryAdd('owner', voice)) {
        // a soloist voice the cast already sounds (the bed's slow wavetable pad) speaks it at no new identity
        const sounding = plan.owner === 'soloist' ? S.voices.find((v) => v.voice !== voice && cast.has(v.voice)) : undefined;
        if (sounding) {
          fallback('owner', voice, `the ${sounding.voice} the cast already sounds speaks the motif`);
          plan.voice = sounding.voice;
          parts.push({ part: 'owner', voice: sounding.voice, units: 0, verdict: 'already in the cast' });
          continue;
        }
        fallback('owner', voice, 'the keys speak the motif');
        plan.owner = 'keys';
        plan.fillers = plan.fillers.filter((f) => f.kind !== 'swell');
        for (const s of plan.statements) { s.owner = 'keys'; s.dissolve = false; }
        rekeys(plan, F, A.keysPlan);
      }
    } else if (step.part === 'upper') {
      const ups = plan.weather.spans.filter((x) => x.technique === 'upper');
      if (!ups.length) { tryAdd('upper', null); continue; }
      if (!tryAdd('upper', W.sounds.upper)) {
        const onMain = plan.weather.main === W.sounds.rain;
        fallback('upper', W.sounds.upper, onMain ? 'laid on the rain row through the stage\'s colour' : 'the main row does not reach 2.5 kHz: it goes');
        if (onMain) for (const x of ups) x.voice = W.sounds.rain;
        else plan.weather.spans = plan.weather.spans.filter((x) => x.technique !== 'upper');
      }
    } else if (step.part === 'rumble') {
      if (!plan.weather.thunder.length) { tryAdd('rumble', null); continue; }
      if (!tryAdd('rumble', W.sounds.rumble)) { fallback('rumble', W.sounds.rumble, 'the thunder goes'); plan.weather.thunder = []; }
    } else if (step.part === 'reverse') {
      if (!plan.fillers.some((f) => f.kind === 'reverse')) { tryAdd('reverse', null); continue; }
      if (!tryAdd('reverse', F.reverse.voice)) { fallback('reverse', F.reverse.voice, 'the reverse-like arrivals go'); plan.fillers = plan.fillers.filter((f) => f.kind !== 'reverse'); }
    }
  }
  plan.weather.upperShare = +(plan.weather.spans.filter((x) => x.technique === 'upper').reduce((a, x) => a + x.to - x.from, 0) / Math.max(1, A.keysPlan.sections.reduce((a, s) => Math.max(a, s.startBar + s.bars), 0))).toFixed(3);
  const budget: AmbientBudget = { target, ceiling: A.ceiling, before, after: cost(), voices: [...cast].sort(), parts };
  plan.budget = budget;
  plan.summary = summarise(plan) + (parts.some((x) => x.verdict.startsWith('over')) ? ` · over the target: ${parts.filter((x) => x.verdict.startsWith('over')).map((x) => x.part).join(', ')}` : '');
  return budget;
}

/**
 * A statement's notes moved into the keys' register and length, where the keys take the motif over: the head of the
 * motif (its tail for a fragment) at the keys' count, by octaves into their register, the first and the last again on
 * a tone of the chord in force, each in its own direction from its neighbour.
 */
function rekeys(plan: AmbientVoicesPlan, F: FillersRow, keys: KeysPlan) {
  const K = F.owners.keys;
  const most = Math.max(K.notes[0], Math.min(K.notes[1], plan.motif.deg.length));
  for (const s of plan.statements) {
    const c = keys.chords[chordIndexAt(keys, s.bar)];
    let notes = s.kind === 'fragment' ? s.notes.slice(-most) : s.notes.slice(0, most);
    while (Math.max(...notes.map((n) => n.midi)) > K.register[1]) notes = notes.map((n) => ({ ...n, midi: n.midi - 12 }));
    while (Math.min(...notes.map((n) => n.midi)) < K.register[0]) notes = notes.map((n) => ({ ...n, midi: n.midi + 12 }));
    const midis = notes.map((n) => n.midi);
    snapEnds(midis, c);
    s.notes = notes.map((n, i) => ({ ...n, midi: midis[i], len: Math.max(K.lenSteps[0], Math.min(K.lenSteps[1], n.len)), vel: +((K.vel[0] + K.vel[1]) / 2).toFixed(3) }));
    s.to = Math.max(s.from + 4, s.notes[s.notes.length - 1].step + s.notes[s.notes.length - 1].len);
  }
}

/** The first and the last of a line on tones of the chord: a note off it moves on in its own direction from its neighbour, so a step down stays a step down. */
function snapEnds(midis: number[], c: KeysChord) {
  const snap = (i: number, nb: number) => {
    if (c.tones.includes(mod(midis[i], 12))) return;
    const dir = i === nb ? 0 : Math.sign(midis[i] - midis[nb]);
    if (!dir) { midis[i] = nearestTone(midis[i], c.tones, 0); return; }
    let x = midis[i];
    for (let k = 0; k < 6 && !c.tones.includes(mod(x, 12)); k++) x += dir;
    midis[i] = c.tones.includes(mod(x, 12)) ? x : nearestTone(midis[i], c.tones, dir);
  };
  if (midis.length > 1) { snap(0, 1); snap(midis.length - 1, midis.length - 2); } else snap(0, 0);
}

// --- the events -------------------------------------------------------------------

/** One event the generator pushes: its voice, its time, its params and its meta (the role and part it plays as). */
export interface AmbientEvent {
  voice: string;
  t: number;
  p: Record<string, unknown>;
  bar: number;
  step?: number;
  role?: 'texture' | 'sparse-keys' | 'detail';
  part?: string;
  /** a keys-voiced note: the generator gives it each keys layer's gain and the section's level, as the keys' own */
  keysLayer?: boolean;
  /** the level table's word to be taken back off it (a featured detail's level is its row's) */
  ownLevel?: boolean;
}

/** A knot curve over nought to one, read at `u`. */
const arcAt = (knots: ReadonlyArray<readonly [number, number]>, u: number): number => {
  if (u <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (u <= knots[i][0]) {
    const [a, x] = knots[i - 1], [b, y] = knots[i];
    return x + ((u - a) / (b - a)) * (y - x);
  }
  return knots[knots.length - 1][1];
};

/**
 * **The plan, as events**: the motif's notes on its owner's voice (the soloist's per-note controls, the keys' tone
 * into its own space, the bell's fragment), the fillers, the weather's spans in events of a few bars each at its place
 * on the span's arc, the thunder. Times in seconds from the theme's start.
 */
export function ambientEvents(plan: AmbientVoicesPlan, I: { barSeconds: number; spell: Readonly<Record<string, number>>; sectionKind: (bar: number) => string; seed: string }): AmbientEvent[] {
  const S = byId(SOLOISTS, plan.rows.soloist, 'soloist');
  const F = byId(FILLERS, plan.rows.fillers, 'fillers');
  const W = byId(WEATHERS, plan.rows.weather, 'weather');
  const step16 = I.barSeconds / 16;
  const out: AmbientEvent[] = [];
  const tide = (I.spell.tide ?? 0.5) - 0.5;
  const lean = (k: 'reverb' | 'dry') => typeof S.birds.tide?.[k] === 'number' ? (S.birds.tide[k] as number) * tide : 0;
  const sends = { dry: +Math.max(0, S.sends.dry + lean('dry')).toFixed(3), reverb: +Math.max(0, S.sends.reverb + lean('reverb')).toFixed(3), delay: S.sends.delay };
  const T = plan.tone;
  const soloistNote = (n: AmbientNote, extra: Record<string, unknown>, part: string, levelDb: number, i: number, last: boolean, dissolve: boolean) => {
    const r = new Rng(`${I.seed}::ambient:note:${n.step}:${i}`);
    // a breath between notes: never held into the next, whatever its lateness
    const dur = Math.max(0.08, n.len * step16 * S.legato - 0.03);
    if (plan.voice === 'wavePad') {
      const P = S.wavePad, D = S.dissolve;
      out.push({ voice: plan.voice, t: n.step * step16 + n.lateMs / 1000, bar: Math.floor(n.step / 16), step: n.step % 16, role: 'detail', part, ownLevel: true,
        p: { midi: n.midi, dur: +dur.toFixed(4), vel: n.vel, gain: +dbToGain(levelDb).toFixed(5), attack: +Math.min(dur * 0.5, lerp(r, P.attack)).toFixed(3), release: +lerp(r, P.release).toFixed(3),
          cutoffMul: +lerp(r, P.cutoffMul).toFixed(3), ...(last && dissolve ? { reverb: D.reverb, delay: D.delay } : { reverb: sends.reverb, delay: sends.delay }), ...extra } });
      return;
    }
    const vib = n.vibrato ? { vibratoCents: T.vibratoCents, vibratoDelay: T.vibratoDelay, vibratoHz: T.vibratoHz } : { vibratoCents: +lerp(r, S.shortVibratoCents).toFixed(2), vibratoDelay: T.vibratoDelay, vibratoHz: T.vibratoHz };
    const D = S.dissolve;
    out.push({ voice: plan.voice, t: n.step * step16 + n.lateMs / 1000, bar: Math.floor(n.step / 16), step: n.step % 16, role: 'detail', part, ownLevel: true,
      p: { midi: n.midi, dur: +dur.toFixed(4), vel: n.vel, gain: +dbToGain(levelDb).toFixed(5),
        // a breath-shaped attack, longer on a held destination, whose mouth opens over the note's own length
        attack: +Math.min(dur * 0.4, n.vibrato ? lerp(r, S.heldAttack) : Math.min(T.attack, 0.12)).toFixed(3), release: T.release,
        ...(n.vibrato ? { vowelSeconds: +Math.min(4, dur * S.vowelOpen).toFixed(3) } : {}),
        sourceTilt: T.sourceTilt, vocalDetune: T.vocalDetune, breath: T.breath, formantWidth: T.formantWidth, formantScale: T.formantScale, open: Math.round(T.open),
        ...vib, ...(last && dissolve ? { dry: D.dry, reverb: D.reverb, delay: D.delay } : sends), ...extra } });
  };
  const classDb = (bar: number) => S.classDb[ambientClass(I.sectionKind(bar))] ?? 0;
  for (const s of plan.statements) {
    s.notes.forEach((n, i) => {
      const last = i === s.notes.length - 1;
      if (s.owner === 'soloist') soloistNote(n, {}, 'soloist', S.levelDb + classDb(s.bar), i, last, s.dissolve);
      else if (s.owner === 'keys') out.push({ voice: '', t: n.step * step16 + n.lateMs / 1000, bar: Math.floor(n.step / 16), step: n.step % 16, role: 'sparse-keys', part: 'keys-motif', keysLayer: true,
        p: { midi: n.midi, vel: n.vel, dur: +(n.len * step16 * 1.6).toFixed(4), levelDb: F.owners.keys.levelDb } });
      else {
        const B = F.owners.bell;
        out.push({ voice: B.voice, t: n.step * step16 + n.lateMs / 1000, bar: Math.floor(n.step / 16), step: n.step % 16, role: 'detail', part: 'bell', ownLevel: true,
          p: { midi: n.midi, vel: n.vel, dur: +(n.len * step16).toFixed(4), gain: +dbToGain(B.levelDb).toFixed(5), indexMul: B.indexMul, lpMul: [...B.lpMul], reverb: B.reverb, delay: B.delay } });
      }
    });
  }
  for (const f of plan.fillers) {
    if (f.kind === 'keys-echo') f.notes!.forEach((n, i) => out.push({ voice: '', t: n.step * step16 + n.lateMs / 1000, bar: Math.floor(n.step / 16), step: n.step % 16, role: 'sparse-keys', part: 'keys-echo', keysLayer: true,
      p: { midi: n.midi, vel: n.vel, dur: +(n.len * step16 * 1.5).toFixed(4), lpMul: f.lpMul![i], levelDb: 0 } }));
    else if (f.kind === 'swell') f.notes!.forEach((n, i) => {
      const dur = n.len * step16;
      soloistNote(n, { attack: +(dur * S.swell.attackShare).toFixed(3), release: +Math.min(1.2, dur * 0.4).toFixed(3) }, 'soloist-swell', S.levelDb - 2 + classDb(f.bar), 100 + i, false, false);
    });
    else if (f.kind === 'reverse') out.push({ voice: F.reverse.voice, t: f.to * step16, bar: Math.floor(f.to / 16), role: 'texture', part: 'reverse-arrival',
      p: { dur: f.durS!, gain: +(0.4 * dbToGain(F.reverse.gainDb)).toFixed(5) } });
  }
  // the weather: each span in events of a few bars, each at its place on the span's arc (and the wind's inner arcs)
  const bs = I.barSeconds;
  const fam = W.families.find((x) => x.id === plan.weather.family);
  const reverbLean = W.tideReverb * tide;
  for (const span of plan.weather.spans) {
    const n = span.to - span.from;
    const contour = W.contours.find((c) => c.id === span.contour);
    if (span.technique === 'upper') {
      const U = W.upperTone;
      // Zephyr, how bright the air: the upper air a little louder and brighter up, about the tile's own value
      const UB = W.upperBirds, off = UB && typeof UB.centre.zephyr === 'number' && typeof I.spell.zephyr === 'number' ? I.spell.zephyr - UB.centre.zephyr : 0;
      const upDb = off ? Math.max(-UB!.mostDb, Math.min(UB!.mostDb, (UB!.zephyr?.db ?? 0) * off)) : 0, upLp = off ? Math.exp((UB!.zephyr?.bright ?? 0) * off) : 1;
      out.push({ voice: span.voice, t: span.from * bs, bar: span.from, part: 'weather-upper',
        p: { dur: +(n * bs - W.tailS).toFixed(4), vel: U.vel, gain: +dbToGain(U.levelDb + span.db + upDb).toFixed(5), lpMul: off ? U.lpMul.map((x) => +Math.min(4, x * upLp).toFixed(3)) : [...U.lpMul], midi: U.midi, reverb: +Math.max(0, U.reverb + reverbLean).toFixed(3),
          ...(span.voice !== W.sounds.upper ? { hpMul: [62, 62] } : {}) } });
      continue;
    }
    const mainKey = (Object.keys(W.sounds) as Array<keyof WeatherRow['sounds']>).find((k) => W.sounds[k] === span.voice && k !== 'upper' && k !== 'rumble') as Main;
    const M = W.main[mainKey];
    const inner = fam?.inner;
    const innerBars = inner ? Math.round((inner.bars[0] + inner.bars[1]) / 2) : 0;
    for (let b = span.from; b < span.to; b += W.segmentBars) {
      const seg = Math.min(W.segmentBars, span.to - b), last = b + seg >= span.to;
      const u0 = (b - span.from) / n, u1 = (b + seg - span.from) / n, um = (u0 + u1) / 2;
      const wave = (bar: number) => inner ? -inner.db * (0.5 - 0.5 * Math.cos((2 * Math.PI * (bar - span.from)) / innerBars)) : 0;
      const wbright = (bar: number) => inner ? 1 - inner.bright * (0.5 - 0.5 * Math.cos((2 * Math.PI * (bar - span.from)) / innerBars)) : 1;
      const db = M.levelDb + span.db + (contour ? arcAt(contour.level, um) : 0) + wave(b + seg / 2);
      const br = (u: number, bar: number) => +((contour ? arcAt(contour.bright, u) : 1) * (M.bright ?? 1) * wbright(bar)).toFixed(3);
      const dur = seg * bs - (last ? W.tailS : 0);
      if (dur <= 0.5) continue;
      out.push({ voice: span.voice, t: b * bs, bar: b, part: 'weather',
        p: { dur: +dur.toFixed(4), vel: M.vel, gain: +dbToGain(db).toFixed(5), lpMul: [br(u0, b), br(u1, b + seg)], midi: M.midi, reverb: +Math.max(0, M.reverb + reverbLean).toFixed(3) } });
    }
  }
  for (const th of plan.weather.thunder) {
    const R = W.rumbleTone;
    out.push({ voice: W.sounds.rumble, t: th.bar * bs, bar: th.bar, part: 'weather-thunder',
      p: { dur: th.durS, vel: R.vel, gain: +dbToGain(th.db).toFixed(5), midi: R.midi, reverb: +Math.max(0, R.reverb + reverbLean).toFixed(3) } });
  }
  return out.sort((a, b) => a.t - b.t);
}
