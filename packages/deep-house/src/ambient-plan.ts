// **The ambient planner** (liquid-ambient, 10-11; the research manual's round 2, its §2, §3, §6 and §7): the
// ambient layer's own plan, coordinated with the keys planner and the 8-bar phrase planner rather than bolted on
// after them. It knows no genre: it reads rows (`recipes/ambient/`) and a form, and a place table says where it plays.
//
// **The contract's order** (the manual's §2), and where each step lives:
//   1. the form and its long-passage development — the regions, their chapters (16 or 32 bars, each a function off
//      the track's drawn development ordering; a stretched passage acquires chapters), here (`planAmbient`);
//   2. the keys and the shared harmonic timeline — `KeysPlan` (`src/keys-phrase.ts`), the authority for landings,
//      chord states and its reserved windows, read and never moved;
//   3. the structural arrivals and the keys windows reserved — hard, soft and recovery windows, here;
//   4. the ambient phrases and the principal detail slot — the bed's gestures (its pitch memory extracted from
//      `KeysPlan.bed`, its sound bounded) and the featured-detail slots a melodic part may fill, here;
//   5. the drum and bass planner on the remaining slots — `planDevelopment` (`src/phrase-development.ts`), handed
//      the chapters' policy (`chapterPolicy`): a lean by function, the salient moments already planned, the
//      32-bar deadline, and the bed's planned subtraction where nothing else can play;
//   6. the notes realised — the generator writes the bed's notes (`AmbientPlan.bed`) on its lane;
//   7. the final events validated — `tools/check-ambient.ts`, on the compiled program, after every pass.
//
// **Three occupancy categories** (the manual's §2): harmonic support is the bed (`bed`, one or two notes, a third at
// a crest); a featured detail is a slot (`slots`: one speaks at a time, by construction no two overlap); the surface
// is the weather's (another part's, outside this plan).
//
// Every draw is off a stream of its own (`<seed>::ambient:*`), so a seed's kit, riff, keys and form draws are the
// ones they were. Weights and ranges are the rows' (listening hypotheses, his to move); this file holds none.
import BED_FILE from '../recipes/ambient/bed.json' with { type: 'json' };
import CHAPTER_FILE from '../recipes/ambient/chapters.json' with { type: 'json' };
import { Rng } from './rng.ts';
import type { Arrangement } from './arrangement.ts';
import { chordIndexAt, type KeysPlan } from './keys-phrase.ts';
import type { DevelopmentPlan, Family } from './phrase-development.ts';

// --- the rows -------------------------------------------------------------------

type Range = readonly [number, number];
type Weighted<T> = ReadonlyArray<readonly [T, number]>;
interface GrammarParams {
  cellBars?: number; start?: Range; statement?: Range; rest?: Range; answer?: Range; answerNotes?: Weighted<number>; tailRest?: number;
  first?: Range; enter?: Range; second?: Range;
  arcBars?: Weighted<number>; per16?: number; length?: Range; gap?: Range;
}
export interface GrammarRow { id: string; w: number; says?: string; full: GrammarParams; exposed: GrammarParams; return?: { start?: Range; intervals?: number[] } }
type Leans = { centre: number; strength: number } & Record<string, unknown>;
export interface BedRow {
  id: string;
  grammars: GrammarRow[];
  birds: Leans;
  innerMotion: Weighted<string>;
  limits: { noteBars: Range; maxNoteBars: number; arcOverBars: number; plateauBars: number; plateauDb: number; samePitchBars: number;
    retreatBars: number; retreatBlockBars: number; retreatDb: number; maxNotes: number; mergeS: number; breathBars: number;
    noteMostS: number; plateauMostS: number; samePitchMostS: number };
  envelope: { crest: Range; plateauAimBars: number; plateauAimS: number; release: Range };
  lengthBirds: Leans;
  occupancy: { full: Range; exposed: Range };
  register: { full: Range; exposed: Range; intervals: number[]; crestNote: number; lowLean: number; birds?: Record<string, number> & { centre: number; most: number } };
  colour: { cutoffMul: number; vel: Range; thinVel: number; oneToneVel: number; swell: { db: number; oct: number }; levelDb: { full: number; exposed: number } };
  absences: { cleanBars: number; outroBars: number; landingLeadSteps: number; landingAfterSteps: number; cleanDrop: number; cleanDropBars: number; salientRestBars: number };
}
export type SlotOwner = 'motif' | 'drums' | 'weather' | 'any';
export type BedUnder = 'withdrawn' | 'one-tone' | 'present';
interface SlotRow { use: string; owner: SlotOwner; at: Range; bars: number; required?: boolean; bed: BedUnder }
type BedMode = 'grammar' | 'thin' | 'absent-first-half' | 'absent' | 'recall' | 'return' | 'late' | 'early';
interface FunctionRow { lean?: Partial<Record<Family, number>>; bed: BedMode; recalls?: boolean; slots: SlotRow[] }
export interface ChapterRow {
  id: string;
  obligations: { opportunityBars: number; changeBars: number; recallBars: number };
  chapterBars: Record<string, Weighted<number>>;
  birds: Leans;
  orderings: Array<{ id: string; w: number; order: string[] }>;
  forms: Record<string, { first: string[]; return: string[] }>;
  stretch: string[];
  regions: Record<'intro' | 'build' | 'exposed' | 'outro', string>;
  functions: Record<string, FunctionRow>;
  return: { bedOffBars: Weighted<number>; within: number; mostAxes: number };
  continuation: { maxGapBars: number; salient: string[]; countRequiredSlots: boolean };
  reservations: { arrivalSteps: number; recoverySteps: number; detailRecoverySteps: number };
  slots: { minGapBars: number };
}

const BED_ROWS: Record<string, BedRow> = { [BED_FILE.id]: BED_FILE as unknown as BedRow };
const CHAPTER_ROWS: Record<string, ChapterRow> = { [CHAPTER_FILE.id]: CHAPTER_FILE as unknown as ChapterRow };
export const AMBIENT_ROWS = Object.freeze({ bed: Object.keys(BED_ROWS), chapters: Object.keys(CHAPTER_ROWS) });
/** The rows as written, for what reads a row whole (the release audit, a catalogue). */
export const AMBIENT_ROWS_AS_WRITTEN: readonly unknown[] = Object.freeze([BED_FILE, CHAPTER_FILE]);
export const bedRowOf = (id: string | null | undefined): BedRow | null => (id && BED_ROWS[id]) || null;
export const chapterRowOf = (id: string | null | undefined): ChapterRow | null => (id && CHAPTER_ROWS[id]) || null;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const range = (r: unknown, lo = -Infinity, hi = Infinity) => Array.isArray(r) && r.length === 2 && finite(r[0]) && finite(r[1]) && r[0] <= r[1] && r[0] >= lo && r[1] <= hi;
const BED_MODES: readonly BedMode[] = ['grammar', 'thin', 'absent-first-half', 'absent', 'recall', 'return', 'late', 'early'];
const MOTIONS = ['revoice', 'inner', 'remove-return'];

/** Everything wrong with the ambient rows, as sentences; empty is admitted. */
export function ambientRowsFaults(): string[] {
  const bad: string[] = [];
  for (const B of Object.values(BED_ROWS)) {
    if (!B.grammars?.length) bad.push(`${B.id}: no grammar`);
    for (const g of B.grammars ?? []) {
      if (!(finite(g.w) && g.w > 0)) bad.push(`${B.id} ${g.id}: weighs ${g.w}`);
      if (!['breath-and-rest', 'passing-overlap', 'long-arc'].includes(g.id)) bad.push(`${B.id}: ${g.id} is no grammar this planner plays`);
      for (const cls of ['full', 'exposed'] as const) {
        const P = g[cls];
        if (!P) { bad.push(`${B.id} ${g.id}: no ${cls} parameters`); continue; }
        for (const k of ['start', 'statement', 'rest', 'answer', 'first', 'enter', 'second', 'length', 'gap'] as const)
          if (P[k] !== undefined && !range(P[k], 0, 32)) bad.push(`${B.id} ${g.id}.${cls}.${k}: a range of bars`);
        for (const k of ['statement', 'answer', 'first', 'second', 'length'] as const)
          if (P[k] && (P[k]![0] < B.limits.noteBars[0] || P[k]![1] > B.limits.noteBars[1])) bad.push(`${B.id} ${g.id}.${cls}.${k}: a note of ${P[k]!.join('-')} bars, outside ${B.limits.noteBars.join('-')}`);
      }
    }
    if (!B.innerMotion?.length || B.innerMotion.some(([m, w]) => !MOTIONS.includes(m) || !(w > 0))) bad.push(`${B.id}: innerMotion is ${MOTIONS.join(', ')} by weight`);
    if (!range(B.limits?.noteBars, 0.5, 8) || B.limits.noteBars[1] > B.limits.arcOverBars) bad.push(`${B.id}: an ordinary note is at most ${B.limits?.arcOverBars} bars (longer carries an arc)`);
    if (!(B.limits.plateauBars > 0 && B.limits.samePitchBars > 0 && B.limits.retreatBars > 0 && B.limits.maxNotes >= 2)) bad.push(`${B.id}: limits`);
    if (!range(B.envelope?.crest, 0.05, 0.8) || !range(B.envelope?.release, 0.1, 4) || !(B.envelope.plateauAimBars > 0 && B.envelope.plateauAimBars <= B.limits.plateauBars)) bad.push(`${B.id}: envelope`);
    for (const cls of ['full', 'exposed'] as const) if (!range(B.register?.[cls], 36, 96) || B.register[cls][1] - B.register[cls][0] < 9) bad.push(`${B.id}: register.${cls} a window of a sixth or more`);
    if (!B.register.intervals?.length || B.register.intervals.some((i) => !Number.isInteger(i) || i < 3 || i > 12)) bad.push(`${B.id}: register.intervals, a third to an octave`);
    if (!(B.colour?.cutoffMul > 0.2 && B.colour.cutoffMul <= 1.5) || !range(B.colour.vel, 0.05, 1) || !(B.colour.swell?.db <= 0 && B.colour.swell.oct >= 0)) bad.push(`${B.id}: colour`);
  }
  for (const C of Object.values(CHAPTER_ROWS)) {
    const fns = new Set(Object.keys(C.functions ?? {}));
    for (const [id, f] of Object.entries(C.functions ?? {})) {
      if (!BED_MODES.includes(f.bed)) bad.push(`${C.id} ${id}: bed is ${f.bed}`);
      for (const s of f.slots ?? []) {
        if (!['motif', 'drums', 'weather', 'any'].includes(s.owner)) bad.push(`${C.id} ${id}: a slot owned by ${s.owner}`);
        if (!range(s.at, 0, 64) || !(Number.isInteger(s.bars) && s.bars >= 2 && s.bars <= 8)) bad.push(`${C.id} ${id}: a slot's at and bars`);
        if (!['withdrawn', 'one-tone', 'present'].includes(s.bed)) bad.push(`${C.id} ${id}: a slot's bed is ${s.bed}`);
      }
    }
    const named = (x: string) => x.startsWith('@') ? Number.isInteger(+x.slice(1)) && +x.slice(1) >= 0 && +x.slice(1) < 4 : fns.has(x);
    for (const o of C.orderings ?? []) { if (o.order.length !== 4 || o.order.some((x) => !fns.has(x))) bad.push(`${C.id} ${o.id}: four functions the row has`); if (!(o.w > 0)) bad.push(`${C.id} ${o.id}: weighs ${o.w}`); }
    for (const [form, f] of Object.entries(C.forms ?? {})) for (const x of [...f.first, ...f.return]) if (!named(x)) bad.push(`${C.id} forms.${form}: ${x} names no function`);
    for (const x of C.stretch ?? []) if (!named(x)) bad.push(`${C.id} stretch: ${x} names no function`);
    for (const x of Object.values(C.regions ?? {})) if (!fns.has(x)) bad.push(`${C.id} regions: ${x} names no function`);
    if (!C.forms?.default) bad.push(`${C.id}: forms.default`);
    if (!C.chapterBars?.default?.length || Object.values(C.chapterBars).some((l) => l.some(([b, w]) => ![16, 32].includes(b) || !(w > 0)))) bad.push(`${C.id}: chapterBars of 16 or 32 by weight`);
    if (!(C.continuation?.maxGapBars > 0 && C.continuation.maxGapBars <= C.obligations.changeBars)) bad.push(`${C.id}: continuation.maxGapBars at most the change obligation`);
    if (!C.return?.bedOffBars?.length || !(C.return.within >= 16 && C.return.within <= 32)) bad.push(`${C.id}: return`);
  }
  return bad;
}
{
  const bad = ambientRowsFaults();
  if (bad.length) throw new Error(`the ambient rows: ${bad.join('; ')}`);
}

// --- the plan's shape (the interface another builder reads) ------------------------

/** Where a region of the form sits: its kind is the form's, its function the chapter row's. */
export type RegionKind = 'mixing' | 'opening' | 'passage' | 'exposed' | 'mixing-out';
export interface Chapter {
  index: number;
  region: RegionKind;
  /** the passage it belongs to (0 the first, 1 the return …), where it is a passage's */
  passage: number | null;
  /** bars, `to` not included */
  from: number;
  to: number;
  function: string;
  /** why it has its function: the form's order and the ordering's place */
  why: string;
  /** where a stretched passage acquired it */
  added?: string;
  recalls: boolean;
  /** what each obligation asked and what met it (`settleAmbient`) */
  obligations: Array<{ kind: 'opportunity' | 'change' | 'recall'; by: number; met?: string }>;
}
/** One note of the bed: sixteenths from the theme's start (`to` not included), the envelope's attack and release in seconds. */
export interface BedNote { midi: number; from: number; to: number; attack: number; release: number; vel: number; gesture: number; swell: { db: number; oct: number; over: number }; cutoffMul: number; gain: number }
export interface BedGesture { index: number; chapter: number; from: number; to: number; role: string; motion: string; notes: number; grammar: string; variant: 'primary' | 'return'; under?: BedUnder }
/**
 * **A featured-detail slot**: bars a featured detail may use (`to` not included), with its chapter's function. One
 * speaks at a time: no two slots overlap. `owner` says who it is for — a melodic `motif` statement or answer, a
 * conspicuous `drums` exchange, a `weather` accent (thunder, a crest) — or `any`. `required` slots carry an obligation
 * (the motif's recurrence, the return's answer); the others are opportunities a part may leave empty. `bed` is what
 * the bed does under it: withdrawn, one quiet tone, or present.
 */
export interface DetailSlot {
  id: string;
  from: number;
  to: number;
  chapter: number;
  function: string;
  use: string;
  owner: SlotOwner;
  required: boolean;
  bed: BedUnder;
  /** the manual's scheduling priority: 3 a scheduled melodic statement, 4 a coordinated drum or bass answer, 5 a decorative detail */
  priority: 3 | 4 | 5;
}
/**
 * **A reservation**, in sixteenths of the theme (`to` not included, the keys windows' convention): `hard` — competing
 * attacks prohibited; `soft` — compatible, quieter material allowed (a keys tail); `recovery` — no new featured
 * entrance right after a conspicuous gesture.
 */
export interface Reservation { kind: 'hard' | 'soft' | 'recovery'; owner: 'keys-pickup' | 'keys-landing' | 'keys-tail' | 'arrival' | 'detail'; bar: number; from: number; to: number; why: string }
export interface Salient { bar: number; kind: 'keys-landing' | 'arrival' | 'bed-withdrawal' | 'bed-entrance' | 'detail' | 'drums'; what: string }
export interface ReturnPlan { passage: number; from: number; bedOffBars: number; axes: Array<{ axis: string; at: number; what: string; by: 'bed' | 'slot' | 'drums' }> }
export interface AmbientPlan {
  rows: { bed: string; chapters: string };
  /** the track's identity draws, each off a stream of its own */
  drawn: { grammar: string; ordering: string; voice: string };
  /** the bed's final sounding windows by class, after the birds' lean (the register policy the program is held to) */
  register: { full: Range; exposed: Range };
  chapters: Chapter[];
  bedGestures: BedGesture[];
  bed: BedNote[];
  slots: DetailSlot[];
  reservations: Reservation[];
  absences: Array<{ from: number; to: number; why: string }>;
  /** the salient moments of the track as planned: keys landings, arrivals, the bed's withdrawals and entrances, the drum planner's moves */
  salient: Salient[];
  /** every event the deadline required, why, and what it replaced */
  required: Array<{ bar: number; why: string; met: string }>;
  returnPlan: ReturnPlan | null;
  /** what could not be placed and why (a slot no window admitted, a gesture no room took) */
  admission: Array<{ what: string; why: string }>;
  summary: string;
}

export interface AmbientInput {
  seed: string | number;
  arrangement: Arrangement;
  bars: number;
  barSeconds: number;
  keys: KeysPlan;
  /** the form row and the bars it drew per position, where a form row laid the theme */
  form: { id: string | null; bars: readonly number[] | null } | null;
  /** whether the section grammar keeps the bed's lane on at a bar */
  bedOn: (bar: number) => boolean;
  /** the bed's voice and its envelope (its row's own), so a gesture's plateau is sized against the voice that plays it */
  voice: string;
  envelope: { attack: number; decay: number; sustain: number; release: number };
  spell: Readonly<Record<string, number>>;
  rows: { bed: string; chapters: string };
}

// --- small arithmetic ------------------------------------------------------------

const mod = (a: number, n: number) => ((a % n) + n) % n;
const lerp = (r: Rng, [a, b]: Range) => a + (b - a) * r.float();
const wpick = <T>(r: Rng, items: Weighted<T>): T => r.weighted(items.map(([v, w]) => ({ v, w })));
const leanOf = (L: Leans, spell: Readonly<Record<string, number>>, id: string): number => {
  let m = 1;
  for (const [bird, leans] of Object.entries(L)) {
    if (bird === 'centre' || bird === 'strength' || typeof leans !== 'object' || leans === null) continue;
    const x = (leans as Record<string, unknown>)[id], v = spell[bird];
    if (finite(x) && finite(v)) m *= Math.exp(x * L.strength * (v - L.centre));
  }
  return m;
};
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

const regionKindOf = (kind: string): RegionKind => kind === 'intro' ? 'mixing' : kind === 'build' ? 'opening' : kind === 'breakdown' ? 'exposed' : kind === 'outro' ? 'mixing-out' : 'passage';

// --- the planner ------------------------------------------------------------------

/**
 * **A theme's ambient plan**: its chapters, reservations, featured-detail slots and the bed's gestures, in the
 * contract's order (above). The drum planner then runs with `chapterPolicy(plan)`, and `settleAmbient` records what
 * met each obligation once it has.
 */
export function planAmbient(I: AmbientInput): AmbientPlan {
  const B = bedRowOf(I.rows.bed), C = chapterRowOf(I.rows.chapters);
  if (!B || !C) throw new Error(`ambient: no rows ${I.rows.bed}, ${I.rows.chapters}`);
  const { seed, arrangement, bars, barSeconds, keys } = I;
  const step16 = barSeconds / 16;
  const sections = arrangement.sections;
  const admission: AmbientPlan['admission'] = [];

  // --- 1. the form's regions and their chapters
  const ordering = new Rng(`${seed}::ambient:ordering`).weighted(C.orderings.map((o) => ({ v: o, w: o.w })));
  const grammar = new Rng(`${seed}::ambient:grammar`).weighted(B.grammars.map((g) => ({ v: g, w: g.w * leanOf(B.birds, I.spell, g.id) })));
  const formId = I.form?.id ?? null;
  const formOrders = (formId && C.forms[formId]) || C.forms.default;
  const resolve = (x: string) => (x.startsWith('@') ? ordering.order[+x.slice(1)] : x);
  type Region = { kind: RegionKind; from: number; to: number; nominal: number; passage: number | null; sections: number[] };
  const regions: Region[] = [];
  let passages = 0;
  for (const s of sections) {
    const kind = regionKindOf(s.kind);
    const nominal = I.form?.bars?.[s.index] ?? s.bars;
    const last = regions[regions.length - 1];
    if (last && last.kind === kind && (kind === 'passage' || kind === 'exposed') && last.to === s.startBar) { last.to += s.bars; last.nominal += nominal; last.sections.push(s.index); continue; }
    regions.push({ kind, from: s.startBar, to: s.startBar + s.bars, nominal, passage: kind === 'passage' ? passages++ : null, sections: [s.index] });
  }
  const chapters: Chapter[] = [];
  /** the last chapter that recalled the idea (an exposed passage's statement counts), for the 64-bar obligation */
  let lastRecallBar = -Infinity;
  const chapterW = (C.chapterBars[formId ?? ''] ?? C.chapterBars.default).map(([b, w]) => [b, w * leanOf(C.birds, I.spell, String(b))] as const);
  for (const R of regions) {
    const lengths: number[] = [];
    if (R.kind === 'passage' || R.kind === 'exposed') {
      const r = new Rng(`${seed}::ambient:chapters:${R.from}`);
      let rem = R.to - R.from;
      while (rem > 0) {
        const want = R.kind === 'exposed' ? 32 : wpick(r, chapterW);
        let L: number;
        if (rem <= 32) L = rem === 32 && want === 16 ? 16 : rem;
        else { L = want; if (rem - L < 16) L = rem - 16; }
        lengths.push(L);
        rem -= L;
      }
    } else lengths.push(R.to - R.from);
    let fns: string[];
    if (R.kind === 'passage') {
      const list = (R.passage === 0 ? formOrders.first : formOrders.return).map(resolve);
      const n = lengths.length;
      if (n <= list.length) fns = R.passage === 0 || n < 3 ? list.slice(0, n) : [...list.slice(0, n - 1), list[list.length - 1]];
      else {
        const stretch = C.stretch.map(resolve);
        const middle: string[] = [];
        let k = 0;
        while (middle.length < n - list.length) {
          const prev = middle[middle.length - 1] ?? list[list.length - 2];
          const x = stretch[k++ % stretch.length];
          if (x !== prev || k > stretch.length * 3) middle.push(x);
        }
        fns = [...list.slice(0, list.length - 1), ...middle, list[list.length - 1]];
      }
      for (let i = 1; i < fns.length; i++) if (fns[i] === fns[i - 1]) fns[i] = C.stretch.map(resolve).find((x) => x !== fns[i - 1] && x !== fns[i + 1]) ?? fns[i];
      // the 64-bar obligation: a chapter that would end past 64 bars of the passage without a recall recalls instead
      // (the ordering's own recalling function, else the reprise), never as its neighbour does
      let since = Number.isFinite(lastRecallBar) ? lastRecallBar : R.from;
      const recallers = [...ordering.order, 'reprise'].filter((f) => C.functions[f]?.recalls);
      let at0 = R.from;
      fns.forEach((f, i) => {
        const end = at0 + lengths[i];
        if (C.functions[f]?.recalls) since = at0;
        else if (end - since > C.obligations.recallBars) {
          const x = recallers.find((y) => y !== fns[i - 1] && y !== fns[i + 1]);
          if (x) { fns[i] = x; since = at0; }
        }
        at0 = end;
      });
    } else fns = lengths.map(() => C.regions[R.kind === 'mixing' ? 'intro' : R.kind === 'opening' ? 'build' : R.kind === 'exposed' ? 'exposed' : 'outro']);
    let at = R.from;
    lengths.forEach((L, i) => {
      const f = fns[i];
      const why = R.kind !== 'passage' ? `the form's ${R.kind}`
        : `the ${R.passage === 0 ? 'first' : 'return'} passage's chapter ${i + 1} (${ordering.id})`;
      const added = R.kind === 'passage' && at >= R.from + R.nominal ? `the form stretched this passage by ${R.to - R.from - R.nominal} bars` : undefined;
      chapters.push({ index: chapters.length, region: R.kind, passage: R.passage, from: at, to: at + L, function: f, why, ...(added ? { added } : {}),
        recalls: !!C.functions[f]?.recalls, obligations: [] });
      if (C.functions[f]?.recalls || (R.kind === 'passage' && !Number.isFinite(lastRecallBar))) lastRecallBar = at;
      at += L;
    });
  }
  const chapterAt = (bar: number) => chapters.find((c) => bar >= c.from && bar < c.to) ?? null;
  const liftAt = (bar: number) => { const s = sections.find((x) => bar >= x.startBar && bar < x.startBar + x.bars); return !!s?.lift; };

  // --- 3. the reservations: the keys' windows, the structural arrivals (the slots' own come with them, below)
  const R0 = C.reservations;
  const reservations: Reservation[] = [];
  for (const w of keys.reserved) reservations.push({ kind: 'hard', owner: w.kind === 'pickup' ? 'keys-pickup' : 'keys-landing', bar: w.bar, from: w.from, to: w.to,
    why: w.kind === 'pickup' ? 'the keys\' pickup into their landing' : 'the keys\' strike' });
  for (const l of keys.landings) {
    const L = l.bar * 16;
    reservations.push({ kind: 'soft', owner: 'keys-tail', bar: l.bar, from: L + 4, to: (l.bar + l.hold) * 16, why: 'the strike\'s tail: quieter, compatible material only' });
    reservations.push({ kind: 'recovery', owner: 'keys-landing', bar: l.bar, from: L + 4, to: L + R0.recoverySteps, why: 'no new featured entrance while the strike\'s attack passes' });
  }
  for (const R of regions.slice(1)) reservations.push({ kind: 'hard', owner: 'arrival', bar: R.from, from: R.from * 16 - R0.arrivalSteps, to: R.from * 16 + R0.arrivalSteps,
    why: `the arrival of the ${R.kind === 'passage' ? 'passage' : R.kind}` });
  const hard = () => reservations.filter((x) => x.kind === 'hard');

  // --- the return: the second passage's opening, its bed away and its axes staggered (manual §7)
  const absences: AmbientPlan['absences'] = [];
  let returnPlan: ReturnPlan | null = null;
  const returnChapter = chapters.find((c) => c.function === 'return') ?? null;
  if (returnChapter) {
    const off = Math.min(wpick(new Rng(`${seed}::ambient:return`), C.return.bedOffBars), returnChapter.to - returnChapter.from);
    returnPlan = { passage: returnChapter.passage ?? 1, from: returnChapter.from, bedOffBars: off, axes: [] };
    absences.push({ from: returnChapter.from, to: returnChapter.from + off, why: 'the return opens on the familiar drums and bass without the bed' });
    returnPlan.axes.push({ axis: 'ambient-occupancy', at: returnChapter.from, what: `the bed away for its first ${off} bars`, by: 'bed' });
  }
  // the drops that open clean (some of them; the return's own opening is its)
  for (const R of regions) if (R.kind === 'passage' && R.passage === 0 && new Rng(`${seed}::ambient:cleandrop:${R.from}`).chance(B.absences.cleanDrop))
    absences.push({ from: R.from, to: R.from + B.absences.cleanDropBars, why: 'the drop\'s opening statement is clean' });

  // --- 4a. the featured-detail slots, one speaking at a time
  const slots: DetailSlot[] = [];
  const slotRng = new Rng(`${seed}::ambient:slots`);
  for (const ch of chapters) {
    const F = C.functions[ch.function];
    for (const S of F?.slots ?? []) {
      const lo = ch.from + S.at[0], hi = Math.min(ch.from + S.at[1], ch.to - S.bars);
      if (hi < lo) { if (S.required) admission.push({ what: `${ch.function} ${S.use} slot in chapter ${ch.index}`, why: `the chapter's ${ch.to - ch.from} bars hold no ${S.bars}-bar window from bar ${S.at[0]}` }); continue; }
      const cands = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      const first = cands[slotRng.int(0, cands.length)];
      cands.sort((a, b) => Math.abs(a - first) - Math.abs(b - first) || a - b);
      const ok = (b: number) => {
        const f = b * 16, t = (b + S.bars) * 16;
        if (hard().some((x) => overlaps(f, t, x.from, x.to))) return false;
        if (reservations.some((x) => x.kind === 'recovery' && f >= x.from && f < x.to)) return false;
        if (slots.some((s) => overlaps(b, b + S.bars, s.from, s.to))) return false;
        if (S.owner === 'motif' && slots.some((s) => s.owner === 'motif' && (b < s.to + C.slots.minGapBars && s.from < b + S.bars + C.slots.minGapBars))) return false;
        for (let x = b; x < b + S.bars; x++) if (!chapterAt(x) || chapterAt(x)!.index !== ch.index) return false;
        return true;
      };
      const b = cands.find(ok);
      if (b === undefined) { admission.push({ what: `${ch.function} ${S.use} slot in chapter ${ch.index} (${S.owner})`, why: 'every window there crosses a keys pickup or strike, an arrival, a recovery or another slot' }); continue; }
      const slot: DetailSlot = { id: `slot:${b}`, from: b, to: b + S.bars, chapter: ch.index, function: ch.function, use: S.use, owner: S.owner, required: !!S.required, bed: S.bed,
        priority: S.owner === 'motif' ? 3 : S.owner === 'drums' ? 4 : 5 };
      slots.push(slot);
      if (slot.required) {
        reservations.push({ kind: 'hard', owner: 'detail', bar: b, from: b * 16, to: (b + S.bars) * 16, why: `the ${S.use} slot: one featured detail at a time` });
        reservations.push({ kind: 'recovery', owner: 'detail', bar: b, from: (b + S.bars) * 16, to: (b + S.bars) * 16 + R0.detailRecoverySteps, why: `after the ${S.use}: no new featured entrance` });
      }
      if (ch.function === 'return' && S.use === 'return-answer' && returnPlan)
        returnPlan.axes.push({ axis: 'motif', at: b, what: 'a motif answer (a melodic part fills the slot)', by: 'slot' });
    }
  }
  slots.sort((a, b) => a.from - b.from);

  // --- 4b. the bed's gestures, chapter by chapter
  const L = B.limits;
  const env = B.envelope;
  const avoid: Array<{ from: number; to: number; why: string }> = [];
  for (const l of keys.landings) {
    const pickup = keys.reserved.find((w) => w.kind === 'pickup' && w.bar === l.bar);
    avoid.push({ from: Math.min(pickup ? pickup.from : Infinity, l.bar * 16 - B.absences.landingLeadSteps), to: l.bar * 16 + B.absences.landingAfterSteps, why: `round the keys' landing at bar ${l.bar}` });
  }
  for (const s of slots) if (s.bed === 'withdrawn') avoid.push({ from: s.from * 16, to: s.to * 16, why: `under the ${s.use} slot` });
  // the mixing regions, the outro and the chapters' own absences, by mode
  for (const ch of chapters) {
    const mode = C.functions[ch.function]?.bed ?? 'grammar';
    if (mode === 'absent') absences.push({ from: ch.from, to: ch.to, why: `the ${ch.function} chapter rests the bed` });
    if (mode === 'absent-first-half') absences.push({ from: ch.from, to: ch.from + Math.max(8, Math.floor((ch.to - ch.from) / 16) * 8), why: `the ${ch.function} chapter withdraws the bed` });
    if (mode === 'late' && ch.from < B.absences.cleanBars) absences.push({ from: ch.from, to: Math.min(ch.to, B.absences.cleanBars), why: 'the mixing intro\'s clean bars' });
    if (mode === 'early' && ch.to - ch.from > B.absences.outroBars) absences.push({ from: ch.from + B.absences.outroBars, to: ch.to, why: 'the mixing outro, most of it without the bed' });
  }
  for (const a of absences) avoid.push({ from: a.from * 16, to: a.to * 16, why: a.why });
  const oneTone = slots.filter((s) => s.bed === 'one-tone');

  // the pitch memory: the keys planner's common-tone voicing (its bed's voices), at a sixteenth
  const memoryAt = (step: number): number[] => {
    const byVoice = new Map<number, { from: number; midi: number }>();
    for (const sp of keys.bed) {
      const had = byVoice.get(sp.voice);
      if (sp.from <= step ? !had || had.from > step || sp.from >= had.from : !had) byVoice.set(sp.voice, { from: sp.from, midi: sp.midi });
    }
    return [...new Set([...byVoice.values()].map((v) => mod(v.midi, 12)))];
  };

  type Planned = { at: number; notes: Array<{ off: number; len: number }>; role: string; vel: number; crest?: boolean; thin?: boolean };
  const gestures: BedGesture[] = [];
  const notes: BedNote[] = [];
  const chain = new Map<number, { start: number; end: number }>();
  let prev: { midis: number[]; chord: number } | null = null;
  let pendingInterval: number | null = null;
  const statementLayout: Planned[] = [];
  /** where the gesture before ends, in bars: the next is laid after it (a grammar's own overlap is inside one gesture) */
  let lastEnd = 0;
  let statementChapter: Chapter | null = null;
  const voiceDecay = I.envelope.decay;
  // **The limits in seconds as in bars** (a slower tempo keeps them): a note's bars scale down where they would outlast
  // `noteMostS`, its shortest with them; the drawn length leaned by the birds, always inside the limits
  const k = Math.min(1, L.noteMostS / (L.noteBars[1] * barSeconds));
  const minNote = L.noteBars[0] * k, maxNote = Math.floor(L.noteBars[1] * k * 16) / 16;
  const lenLean = leanOf(B.lengthBirds, I.spell, 'tide') * leanOf(B.lengthBirds, I.spell, 'veil');
  const nl = (r: Rng, rg: Range) => Math.max(minNote, Math.min(maxNote, lerp(r, rg) * k * lenLean));
  // the register leaned by the birds: whole semitones, bounded
  const RB = B.register.birds;
  const shift = RB ? Math.max(-RB.most, Math.min(RB.most, Math.round(Object.entries(RB).reduce((a, [bird, x]) => bird === 'centre' || bird === 'most' || !finite(I.spell[bird]) || !finite(x) ? a : a + x * (I.spell[bird] - RB.centre), 0)))) : 0;
  const windowOf = (cls: 'full' | 'exposed'): Range => [B.register[cls][0] + shift, B.register[cls][1] + shift];

  /**
   * A gesture moved into the room its cell leaves: the free stretches between the windows the bed keeps out of (a
   * note's release must end before one starts) and the bars its lane is off; the stretch nearest where the grammar put
   * it, the gesture shortened to fit (never under the shortest note), else dropped.
   */
  const place = (g: Planned, cellFrom: number, cellEnd: number, release: number): Planned | null => {
    const rel = Math.ceil(release / step16);
    const lo = Math.round(cellFrom * 16), hi = Math.round(cellEnd * 16);
    const blocked: Array<[number, number]> = avoid.map((a) => [a.from - rel, a.to] as [number, number]);
    for (let b = Math.floor(cellFrom); b < Math.ceil(cellEnd); b++) if (b < 0 || b >= bars || !I.bedOn(b)) blocked.push([b * 16 - rel, (b + 1) * 16]);
    blocked.sort((x, y) => x[0] - y[0]);
    const free: Array<[number, number]> = [];
    let at = lo;
    for (const [x, y] of blocked) { if (y <= at) continue; if (x > at) free.push([at, Math.min(x, hi)]); at = Math.max(at, y); if (at >= hi) break; }
    if (at < hi) free.push([at, hi]);
    const body = Math.round(Math.max(...g.notes.map((n) => n.off + n.len)) * 16);
    const least = Math.round((g.notes[0].off + minNote) * 16);
    const want = Math.round(g.at * 16);
    let best: { start: number; room: number } | null = null;
    for (const [x, y] of free) {
      if (y - x < least) continue;
      const start = Math.max(x, Math.min(want, y - Math.min(body, y - x)));
      if (!best || Math.abs(start - want) < Math.abs(best.start - want)) best = { start, room: y - start };
    }
    if (!best) return null;
    const room = best.room / 16;
    const notesIn = g.notes.filter((n) => n.off + minNote <= room + 1e-9).map((n) => ({ ...n, len: Math.min(n.len, room - n.off) }));
    if (!notesIn.length) return null;
    return { ...g, at: best.start / 16, notes: notesIn };
  };

  const chooseMidis = (step: number, count: number, cls: 'full' | 'exposed', intervals: readonly number[], len: number, release: number, motion: string, r: Rng): { midis: number[]; motion: string } => {
    const chord = chordIndexAt(keys, Math.floor(step / 16));
    const tones = keys.chords[chord].tones;
    const [lo, hi] = windowOf(cls);
    const cands: number[] = [];
    for (let m = lo; m <= hi; m++) if (tones.includes(mod(m, 12))) cands.push(m);
    const memory = memoryAt(step);
    const fromS = step * step16, endS = (step + len * 16) * step16 + release;
    const free = (m: number) => {
      const c = chain.get(m);
      if (!c || fromS > c.end + L.mergeS) return true;
      return endS - c.start <= Math.min(L.samePitchBars * barSeconds, L.samePitchMostS);
    };
    const dyads: Array<{ v: number[]; w: number }> = [];
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i], b = cands[j];
      if (!intervals.includes(b - a) || !free(a) || !free(b)) continue;
      let w = (memory.includes(mod(a, 12)) ? 1.8 : 1) * (memory.includes(mod(b, 12)) ? 1.8 : 1) * B.register.lowLean ** ((hi - b) / 12);
      if (prev) {
        const shared = [a, b].filter((x) => prev!.midis.includes(x)).length;
        const move = Math.abs(a - prev.midis[0]) + Math.abs(b - (prev.midis[1] ?? prev.midis[0]));
        if (prev.chord !== chord) w *= 1 / (1 + move / 4);
        else if (motion === 'revoice') w *= shared === 2 || (prev.midis.length === 2 && b - a === prev.midis[1] - prev.midis[0] && shared > 0) ? 0.02 : 1 / (1 + move / 8);
        else if (motion === 'inner') w *= shared === 1 && move <= 5 ? 1 : 0.03;
        if (pendingInterval !== null && b - a === pendingInterval) w *= 0.05;
      }
      if (w > 0) dyads.push({ v: [a, b], w });
    }
    if (!dyads.length) {
      const single = cands.filter(free);
      if (!single.length) return { midis: [], motion };
      return { midis: [single[r.int(0, single.length)]], motion };
    }
    const d = r.weighted(dyads.map((x) => ({ v: x.v, w: x.w })));
    if (count === 1) {
      // one tone: a revoice or an inner move goes to a tone the gesture before did not sound, where the dyad has one
      const fresh = motion === 'revoice' || motion === 'inner' ? d.filter((m) => !prev?.midis.includes(m)) : [];
      const pool = fresh.length ? fresh : d;
      return { midis: [pool[r.int(0, pool.length)]], motion };
    }
    if (count >= 3) {
      const third = cands.filter((m) => !d.includes(m) && free(m) && d.every((x) => Math.abs(x - m) >= 3) && Math.max(...d, m) - Math.min(...d, m) <= 12);
      if (third.length) return { midis: [...d, third[r.int(0, third.length)]].sort((x, y) => x - y), motion };
    }
    return { midis: d, motion };
  };

  const lay = (ch: Chapter, g: Planned, cellFrom: number, end: number, variant: 'primary' | 'return', r: Rng) => {
    const release = lerp(r, env.release);
    const placed = place(g, Math.max(cellFrom, lastEnd + L.breathBars), end, release);
    if (!placed) { admission.push({ what: `a ${g.role} gesture at bar ${g.at.toFixed(1)} (chapter ${ch.index})`, why: 'no room between the keys\' landings, the slots and the absences' }); return; }
    const step = Math.round(placed.at * 16);
    const cls = liftAt(Math.floor(placed.at)) ? 'exposed' : 'full';
    const under = oneTone.find((s) => overlaps(step, step + 16 * Math.max(...placed.notes.map((n) => n.off + n.len)), s.from * 16, s.to * 16));
    let count = placed.notes.length === 1 && !placed.crest ? 1 : placed.crest ? 3 : 2;
    if (placed.thin || under) count = 1;
    const sameChord = prev && prev.chord === chordIndexAt(keys, Math.floor(placed.at));
    let motion = sameChord ? (pendingInterval !== null ? 'return' : wpick(r, B.innerMotion)) : prev ? 'voice-led' : 'first';
    if (motion === 'remove-return' && count > 1) count = 1;
    const intervals = variant === 'return' ? grammar.return?.intervals ?? B.register.intervals : B.register.intervals;
    const maxLen = Math.max(...placed.notes.map((n) => n.len));
    const { midis } = chooseMidis(step, count, cls, intervals, maxLen, release, motion === 'return' ? 'revoice' : motion, r);
    if (!midis.length) { admission.push({ what: `a ${g.role} gesture at bar ${placed.at.toFixed(1)}`, why: 'every chord tone in the window would run its pitch past the same-pitch limit' }); return; }
    if (motion === 'remove-return' && prev) pendingInterval = prev.midis.length > 1 ? prev.midis[prev.midis.length - 1] - prev.midis[0] : null;
    else if (motion === 'return') pendingInterval = null;
    const gi = gestures.length;
    const vel = Math.max(0.05, Math.min(1, placed.vel * (under ? B.colour.oneToneVel : 1) * (placed.thin ? B.colour.thinVel : 1)));
    // the notes: a dyad's two together, a passing overlap's one after the other (the second note the dyad's other)
    const parts = placed.notes.length === midis.length ? placed.notes : midis.map(() => placed.notes[0]);
    let lastTo = step;
    midis.forEach((midi, i) => {
      const n = parts[Math.min(i, parts.length - 1)];
      const from = step + Math.round(n.off * 16), to = step + Math.round((n.off + n.len) * 16);
      const dur = (to - from) * step16;
      let attack = lerp(r, env.crest) * dur;
      const aim = Math.min(env.plateauAimBars * barSeconds, env.plateauAimS);
      if (dur - attack - voiceDecay > aim) attack = dur - voiceDecay - aim;
      // the crest inside the note: the attack and the voice's decay end by its end, so its release starts where the plan says
      attack = Math.max(0.2, Math.min(attack, dur * 0.65, dur - voiceDecay - 0.05));
      const rel = release * (1 - 0.15 * i);
      notes.push({ midi, from, to, attack: +attack.toFixed(3), release: +rel.toFixed(3), vel: +(vel - i * 0.04).toFixed(3), gesture: gi,
        swell: { db: B.colour.swell.db, oct: B.colour.swell.oct, over: +attack.toFixed(3) }, cutoffMul: B.colour.cutoffMul, gain: +(10 ** (B.colour.levelDb[cls] / 20)).toFixed(4) });
      const c = chain.get(midi), fromS = from * step16, endS = to * step16 + rel;
      chain.set(midi, c && fromS <= c.end + L.mergeS ? { start: c.start, end: Math.max(c.end, endS) } : { start: fromS, end: endS });
      lastTo = Math.max(lastTo, to);
    });
    lastEnd = lastTo / 16;
    gestures.push({ index: gi, chapter: ch.index, from: step, to: lastTo, role: placed.role, motion, notes: midis.length, grammar: grammar.id, variant, ...(under ? { under: under.bed } : {}) });
    prev = { midis, chord: chordIndexAt(keys, Math.floor(placed.at)) };
  };

  /** One grammar cell from `at` to `end`, its gestures as the drawn grammar lays them at the class's parameters. */
  const cell = (at: number, end: number, cls: 'full' | 'exposed', variant: 'primary' | 'return', thin: boolean, r: Rng): Planned[] => {
    const P = grammar[cls];
    const start = variant === 'return' && grammar.return?.start ? grammar.return.start : P.start ?? [0, 0];
    const velAt = (u: number) => B.colour.vel[0] + (B.colour.vel[1] - B.colour.vel[0]) * Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
    const out: Planned[] = [];
    const span = end - at;
    if (grammar.id === 'breath-and-rest') {
      const s = at + lerp(r, start);
      const l1 = nl(r, P.statement!);
      out.push({ at: s, notes: [{ off: 0, len: l1 }], role: 'statement', vel: velAt(0.5), thin });
      const a = s + l1 + lerp(r, P.rest!);
      const l2 = Math.min(nl(r, P.answer!), l1 - 0.5, end - (P.tailRest ?? 0) - a);
      if (l2 >= minNote) out.push({ at: a, notes: [{ off: 0, len: l2 }], role: 'answer', vel: velAt(0.35), thin: thin || wpick(r, P.answerNotes ?? [[2, 1]]) === 1 });
      // a dyad is two notes together; the planner's count says so
      for (const g of out) if (!g.thin) g.notes = [g.notes[0], g.notes[0]];
    } else if (grammar.id === 'passing-overlap') {
      // pairs while the cell has room: one note, the second entering under it, the first leaving, both gone, a rest
      let s = at + lerp(r, start);
      while (s + minNote <= end - (P.tailRest ?? 0)) {
        const la = Math.min(nl(r, P.first!), end - s), enter = Math.min(lerp(r, P.enter!) * k, la - 0.5);
        const lb = Math.min(nl(r, P.second!), end - (P.tailRest ?? 0) - s - enter);
        if (lb >= minNote && !thin) out.push({ at: s, notes: [{ off: 0, len: la }, { off: enter, len: lb }], role: 'passing', vel: velAt((s - at) / span + 0.25) });
        else out.push({ at: s, notes: [{ off: 0, len: la }], role: 'passing', vel: velAt(0.5), thin: true });
        s += Math.max(la, enter + Math.max(lb, 0)) + lerp(r, P.rest ?? [3, 4]);
      }
    } else {
      // the long arc: bounded gestures, the most active near the middle, a clear withdrawal at its end
      const arc = Math.min(span, wpick(r, P.arcBars ?? [[16, 1]]));
      const count = Math.max(2, Math.round((arc / 16) * (P.per16 ?? 3)));
      let x = at + lerp(r, start);
      const stop = at + arc - (P.tailRest ?? 2);
      const planned: Planned[] = [];
      for (let i = 0; i < count && x + minNote <= stop; i++) {
        const len = Math.min(nl(r, P.length!), stop - x);
        if (len < minNote) break;
        planned.push({ at: x, notes: [{ off: 0, len }], role: 'arc', vel: 0, thin });
        x += len + lerp(r, P.gap!);
      }
      planned.forEach((g, i) => {
        const u = (g.at + g.notes[0].len / 2 - at) / Math.max(1, stop - at);
        g.vel = velAt(u);
        // a quiet one-tone entrance, and a one-tone farewell only where the arc has room for both ends and a middle
        const edge = i === 0 || (i === planned.length - 1 && planned.length >= 4);
        if (!edge && !thin) g.notes = [g.notes[0], g.notes[0]];
        else g.thin = true;
      });
      // the crest: the middle gesture may take a third note
      const mid = planned.filter((g) => !g.thin).sort((a, b) => b.vel - a.vel)[0];
      if (mid && r.chance(B.register.crestNote)) mid.crest = true;
      out.push(...planned);
      if (arc < span) out.push(...cell(at + arc, end, cls, variant, thin, r));
    }
    return out.filter((g) => g.at < end);
  };

  for (const ch of chapters) {
    const mode = C.functions[ch.function]?.bed ?? 'grammar';
    if (mode === 'absent') continue;
    const r = new Rng(`${seed}::ambient:bed:${ch.from}`);
    const variant: 'primary' | 'return' = ch.passage != null && ch.passage > 0 ? 'return' : 'primary';
    const thin = mode === 'thin';
    let from = ch.from, to = ch.to;
    if (mode === 'early') to = Math.min(ch.to, ch.from + B.absences.outroBars);
    // the reprise recalls the first statement's layout, its gestures where they fell in their chapter, in the chord it now has
    if (mode === 'recall' && statementChapter && statementLayout.length) {
      const span = Math.min(ch.to - ch.from, statementChapter.to - statementChapter.from);
      for (const g of statementLayout) {
        const at = g.at - statementChapter.from + ch.from;
        if (at + Math.max(...g.notes.map((n) => n.off + n.len)) > ch.from + span) continue;
        lay(ch, { ...g, at }, ch.from, ch.from + span, variant, r);
      }
      // past the recalled stretch, the grammar again
      from = ch.from + span;
      if (to - from < minNote + 1) continue;
    }
    // cells from the chapter's line, each class by its own length, evened out so no stub is left at the chapter's end
    let at = from;
    while (at < to - minNote) {
      const cls = liftAt(Math.floor(at)) ? 'exposed' : 'full';
      const P = grammar[cls];
      const rest = to - at, n = Math.max(1, Math.round(rest / (P.cellBars ?? 16)));
      const end = Math.min(to, at + rest / n);
      const laid = cell(at, end, cls, variant, thin, r);
      if (ch.function === 'statement' && !statementChapter) statementLayout.push(...laid);
      for (const g of laid) lay(ch, g, at, end, variant, r);
      at = end;
    }
    if (ch.function === 'statement' && !statementChapter) statementChapter = ch;
  }
  const plan: AmbientPlan = {
    rows: { bed: B.id, chapters: C.id }, drawn: { grammar: grammar.id, ordering: ordering.id, voice: I.voice }, register: { full: windowOf('full'), exposed: windowOf('exposed') },
    chapters, bedGestures: gestures, bed: notes, slots, reservations: reservations.sort((a, b) => a.from - b.from), absences,
    salient: [], required: [], returnPlan, admission, summary: '',
  };
  retreats(plan, B, bars, barSeconds);
  plan.salient = plannedSalient(plan, I, C, regions.slice(1).map((R) => ({ bar: R.from, what: `the ${R.kind === 'passage' ? 'passage' : R.kind} arrives` })));
  return plan;
}

/**
 * **A genuine retreat in every 32-bar block** (the manual's §3): where a block that has bed in it holds no run of
 * `retreatBars` with nothing sounding (a note's release counted), its shortest gesture is taken out, and so on until
 * one is there. Said on the plan's admission.
 */
function retreats(plan: AmbientPlan, B: BedRow, bars: number, barSeconds: number) {
  const step16 = barSeconds / 16;
  const block = B.limits.retreatBlockBars * 16, need = B.limits.retreatBars * 16;
  for (let b0 = 0; b0 < bars * 16; b0 += block) {
    const b1 = Math.min(bars * 16, b0 + block);
    for (let guard = 0; guard < 12; guard++) {
      const inBlock = plan.bed.filter((n) => n.from < b1 && n.to + n.release / step16 > b0);
      if (!inBlock.length || b1 - b0 < need) break;
      const iv = inBlock.map((n) => [Math.max(b0, n.from), Math.min(b1, n.to + Math.ceil(n.release / step16))] as const).sort((x, y) => x[0] - y[0]);
      let at = b0, longest = 0;
      for (const [x, y] of iv) { longest = Math.max(longest, x - at); at = Math.max(at, y); }
      longest = Math.max(longest, b1 - at);
      if (longest >= need) break;
      const gs = [...new Set(inBlock.map((n) => n.gesture))].map((g) => plan.bedGestures[g]).sort((x, y) => (x.to - x.from) - (y.to - y.from));
      const drop = gs[0];
      plan.bed = plan.bed.filter((n) => n.gesture !== drop.index);
      plan.admission.push({ what: `the ${drop.role} gesture at bar ${(drop.from / 16).toFixed(1)}`, why: `the block from bar ${b0 / 16} had no ${B.limits.retreatBars}-bar retreat` });
      (drop as BedGesture & { dropped?: string }).dropped = 'the block\'s retreat';
    }
  }
}

/** The bed sounding by bar (its notes and their releases), and its chapter-level withdrawals and entrances. */
export function bedMoments(bed: readonly BedNote[], bars: number, barSeconds: number, restBars: number): Salient[] {
  const step16 = barSeconds / 16;
  const on = new Array<boolean>(bars).fill(false);
  for (const n of bed) for (let b = Math.floor(n.from / 16); b < Math.min(bars, Math.ceil((n.to + n.release / step16) / 16)); b++) on[b] = true;
  const out: Salient[] = [];
  const first = on.indexOf(true);
  if (first < 0) return out;
  out.push({ bar: first, kind: 'bed-entrance', what: 'the bed enters' });
  for (let b = first; b < bars;) {
    if (on[b]) { b++; continue; }
    let e = b;
    while (e < bars && !on[e]) e++;
    if (e - b >= restBars) {
      out.push({ bar: b, kind: 'bed-withdrawal', what: `the bed withdraws for ${e - b} bars` });
      if (e < bars) out.push({ bar: e, kind: 'bed-entrance', what: 'the bed comes back' });
    }
    b = e;
  }
  return out;
}

function plannedSalient(plan: AmbientPlan, I: AmbientInput, C: ChapterRow, arrivals: Array<{ bar: number; what: string }>): Salient[] {
  const B = bedRowOf(plan.rows.bed)!;
  return [
    ...I.keys.landings.map((l): Salient => ({ bar: l.bar, kind: 'keys-landing', what: `the keys land${l.change ? ' and the chord changes' : ''}` })),
    ...arrivals.map((a): Salient => ({ bar: a.bar, kind: 'arrival', what: a.what })),
    ...bedMoments(plan.bed, I.bars, I.barSeconds, B.absences.salientRestBars),
    ...(C.continuation.countRequiredSlots ? plan.slots.filter((s) => s.required && s.owner === 'motif').map((s): Salient => ({ bar: s.from, kind: 'detail', what: `the ${s.use}` })) : []),
  ].sort((a, b) => a.bar - b.bar);
}

// --- 5. the drum and bass planner's side of it ------------------------------------

/**
 * **The chapters' policy, as the 8-bar planner takes it** (`PlannerInput.chapters`): its chapter's lean on a phrase,
 * the salient moments planned before the drums (keys landings, arrivals, the bed's chapter-level withdrawals and
 * entrances), the longest gap a developed passage may go without one, which of its moves count, and the bed's
 * planned subtraction where no move can play. A subtraction rewrites the plan's bed and says why.
 */
export function chapterPolicy(plan: AmbientPlan, barSeconds: number, bars: number) {
  const C = chapterRowOf(plan.rows.chapters)!;
  const B = bedRowOf(plan.rows.bed)!;
  const chapterAt = (bar: number) => plan.chapters.find((c) => bar >= c.from && bar < c.to) ?? null;
  return {
    leanAt: (bar: number) => { const ch = chapterAt(bar); return ch ? C.functions[ch.function]?.lean : undefined; },
    salient: plan.salient.map((s) => s.bar),
    maxGap: C.continuation.maxGapBars,
    counts: (family: string, variant: string) => C.continuation.salient.includes(family) || C.continuation.salient.includes(`${family}.${variant}`),
    subtract: (from: number, to: number, why: string): boolean => {
      const hit = plan.bedGestures.filter((g) => overlaps(g.from, g.to, from * 16, to * 16) && plan.bed.some((n) => n.gesture === g.index));
      if (!hit.length) return false;
      const ids = new Set(hit.map((g) => g.index));
      plan.bed = plan.bed.filter((n) => !ids.has(n.gesture));
      // the withdrawal is heard only if the rest it opens is a chapter's: say what it opened
      const moments = bedMoments(plan.bed, bars, barSeconds, B.absences.salientRestBars).filter((m) => m.bar >= from - B.absences.salientRestBars && m.bar < to);
      plan.absences.push({ from, to, why });
      return moments.length > 0;
    },
  };
}

/**
 * **What met each obligation, once the drums are planned** (the manual's §6: record why an event was required and what
 * it replaced): the 8-bar planner's required moves, its salient moves on the timeline, the return's drum axis, each
 * chapter's 16-, 32- and 64-bar obligations, and the one-line summary for the ledger.
 */
export function settleAmbient(plan: AmbientPlan, dev: DevelopmentPlan | null, I: Pick<AmbientInput, 'bars' | 'barSeconds' | 'keys'>): AmbientPlan {
  const C = chapterRowOf(plan.rows.chapters)!;
  const B = bedRowOf(plan.rows.bed)!;
  const counts = (f?: string, v?: string) => !!f && (C.continuation.salient.includes(f) || C.continuation.salient.includes(`${f}.${v}`));
  const drums: Salient[] = [];
  for (const p of dev?.phrases ?? []) {
    const q = p as typeof p & { required?: string; met?: string };
    if (q.required) plan.required.push({ bar: p.at ?? p.start, why: q.required, met: q.met ?? (p.variant ? `${p.family}.${p.variant}, in place of continuing` : 'nothing') });
    if (p.variant && counts(p.family, p.variant) && p.at != null) drums.push({ bar: p.at, kind: 'drums', what: `${p.family}.${p.variant}` });
    for (const f of p.foreground) if (f.startsWith('into ')) drums.push({ bar: p.start, kind: 'drums', what: f });
  }
  for (const s of dev?.aux.spans ?? []) drums.push({ bar: s.to, kind: 'drums', what: `the ${dev!.aux.identity} leaves` });
  plan.salient = [...plan.salient.filter((s) => s.kind !== 'bed-withdrawal' && s.kind !== 'bed-entrance' && s.kind !== 'drums'),
    ...bedMoments(plan.bed, I.bars, I.barSeconds, B.absences.salientRestBars), ...drums].sort((a, b) => a.bar - b.bar);
  // the return's voicing axis: where the bed comes back after its opening, in the grammar's return variant (read off
  // the bed as it now stands, after the retreats and any planned subtraction)
  if (plan.returnPlan) {
    const R = plan.returnPlan;
    R.axes = R.axes.filter((a) => a.axis !== 'harmonic-voicing');
    const back = plan.bed.filter((n) => n.from >= (R.from + R.bedOffBars) * 16 && plan.bedGestures[n.gesture]?.variant === 'return').sort((a, b) => a.from - b.from)[0];
    if (back && back.from < (R.from + C.return.within) * 16)
      R.axes.push({ axis: 'harmonic-voicing', at: Math.floor(back.from / 16), what: `the bed back in ${plan.drawn.grammar}'s return variant (its wider spacing, its later start)`, by: 'bed' });
  }
  // the return's drum axis: the form's feature where the drum planner played it
  if (plan.returnPlan && dev?.form.feature) {
    const p = dev.phrases.find((x) => x.forced?.startsWith('the return\'s feature') && x.start >= plan.returnPlan!.from);
    if (p && p.start < plan.returnPlan.from + C.return.within)
      plan.returnPlan.axes.push({ axis: 'drum-articulation', at: p.start, what: `the return's feature, ${dev.form.feature}`, by: 'drums' });
  }
  plan.returnPlan?.axes.sort((a, b) => a.at - b.at);
  // each chapter's obligations and what met them
  const meets = (from: number, to: number) => plan.salient.find((s) => s.bar >= from && s.bar < to);
  let lastRecall = -Infinity;
  for (const ch of plan.chapters) {
    ch.obligations = [];
    if (ch.region !== 'passage' && ch.region !== 'exposed') continue;
    // a change of function or of featured material: a salient moment, or the chapter's own featured slot
    const change = meets(ch.from, Math.min(ch.to, ch.from + C.obligations.changeBars));
    const own = plan.slots.find((x) => x.chapter === ch.index && x.owner !== 'weather');
    ch.obligations.push({ kind: 'change', by: ch.from + C.obligations.changeBars, met: change ? `${change.what} (bar ${change.bar})` : own ? `the ${own.use} slot (bar ${own.from})` : undefined });
    for (let b = ch.from + C.obligations.opportunityBars; b < ch.to; b += C.obligations.opportunityBars) {
      const s = plan.slots.find((x) => x.from >= b - C.obligations.opportunityBars && x.from < b) ?? null;
      ch.obligations.push({ kind: 'opportunity', by: b, met: s ? `the ${s.use} slot (bar ${s.from})` : meets(b - C.obligations.opportunityBars, b)?.what });
    }
    // an idea is stated where the first passage starts; from there a chapter that recalls it is due every 64 bars
    if (!Number.isFinite(lastRecall) && ch.region === 'passage') lastRecall = ch.from;
    if (ch.recalls) { if (Number.isFinite(lastRecall) && ch.from - lastRecall >= C.obligations.recallBars) ch.obligations.push({ kind: 'recall', by: ch.from, met: `the ${ch.function}` }); lastRecall = ch.from; }
    else if (ch.region === 'passage' && ch.to - lastRecall > C.obligations.recallBars)
      ch.obligations.push({ kind: 'recall', by: lastRecall + C.obligations.recallBars, met: undefined });
  }
  const moves = plan.required.length ? ` · required ${plan.required.length}` : '';
  plan.summary = [
    `ambient ${plan.drawn.grammar} bed, ${plan.drawn.ordering}`,
    `chapters ${plan.chapters.filter((c) => c.region === 'passage').map((c) => c.function).join('/')}`,
    `slots ${plan.slots.filter((s) => s.owner === 'motif').length} motif, ${plan.slots.filter((s) => s.owner !== 'motif').length} other`,
    ...(plan.returnPlan ? [`return ${plan.returnPlan.axes.map((a) => `${a.axis}@+${a.at - plan.returnPlan!.from}`).join(', ')}`] : []),
  ].join(' · ') + moves;
  return plan;
}

/** The windows the drum planner treats as owned by a featured detail: the required motif slots, in sixteenths. */
export function detailWindows(plan: AmbientPlan): Array<{ kind: 'detail'; bar: number; from: number; to: number }> {
  return plan.slots.filter((s) => s.required && s.owner === 'motif').map((s) => ({ kind: 'detail' as const, bar: s.from, from: s.from * 16, to: s.to * 16 }));
}

/** The occupancy at a bar: how many bed notes sound (harmonic support) and which slot, if any, is the featured detail's. */
export function occupancyAt(plan: AmbientPlan, bar: number): { support: number; featured: DetailSlot | null } {
  const s = bar * 16;
  return { support: plan.bed.filter((n) => n.from <= s && n.to > s).length, featured: plan.slots.find((x) => bar >= x.from && bar < x.to) ?? null };
}

/**
 * **The slots in the ambient voices' shape** (builder VOICES's `AmbientSlots`, `src/ambient-voices.ts` on its branch):
 * the chapters with their functions in that module's words, the slots a melodic part may fill (owner `motif` or `any`:
 * each the exact window the bed withdraws or thins under, so a statement placed inside it lands where the bed made
 * room), and the reservations other than the details' own (those keep the drums out of the slots, not the detail).
 * At the merge `I.slots = voicesSlots(ambientPlan, sections)` replaces the stand-in.
 */
const VOICES_FN: Record<string, string> = {
  statement: 'statement', groove: 'statement', answer: 'answer', 'developed-answer': 'answer', 'exposed-answer': 'answer', subtraction: 'subtraction',
  'rhythmic-development': 'rhythmic', feature: 'rhythmic', reprise: 'reprise', return: 'return', opening: 'opening', exposed: 'exposed',
};
export function voicesSlots(plan: AmbientPlan, sections: ReadonlyArray<{ index: number; startBar: number; bars: number }>) {
  const B = bedRowOf(plan.rows.bed)!;
  const sectionAt = (bar: number) => sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars)?.index ?? 0;
  const chapters: Array<{ from: number; to: number; section: number; fn: string; of: number }> = [];
  for (const c of plan.chapters) {
    if (c.function === 'mixing') {
      const clean = Math.min(c.to, c.from + B.absences.cleanBars);
      chapters.push({ from: c.from, to: clean, section: sectionAt(c.from), fn: 'mix', of: c.index });
      if (c.to > clean) chapters.push({ from: clean, to: c.to, section: sectionAt(clean), fn: 'opening', of: c.index });
    } else if (c.function === 'mixing-out') {
      const clean = Math.max(c.from, c.to - B.absences.cleanBars);
      if (clean > c.from) chapters.push({ from: c.from, to: clean, section: sectionAt(c.from), fn: 'outro', of: c.index });
      chapters.push({ from: clean, to: c.to, section: sectionAt(clean), fn: 'mix', of: c.index });
    } else chapters.push({ from: c.from, to: c.to, section: sectionAt(c.from), fn: VOICES_FN[c.function] ?? c.function, of: c.index });
  }
  const slots = plan.slots.filter((s) => s.owner === 'motif' || s.owner === 'any').map((s) => {
    const ci = chapters.findIndex((c) => s.from >= c.from && s.from < c.to);
    return { from: s.from, to: s.to, chapter: ci, fn: chapters[ci]?.fn ?? 'mix', use: s.use, required: s.required, bed: s.bed };
  });
  const reservations = plan.reservations.filter((r) => r.owner !== 'detail').map((r) => ({ kind: r.kind, from: r.from, to: r.to, owner: r.why }));
  return { source: 'ambient-plan', chapters: chapters.map(({ of: _of, ...c }) => c), slots, reservations };
}
