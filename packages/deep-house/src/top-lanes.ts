// **The lanes we have, turned** (round top-lanes, 11-02; his word on the top end's table: T13, T21, T23 and T31 go, T15
// and T37 as pairs only). Where `src/top-form.ts` moves the top lanes in and out on the phrase lines, this turns what a
// lane plays inside a bar: the sixteenth lane's figure leans round the section changes (T13, a mark: his ear 11-02 on a
// constant lean, "too busy") and breathes in pairs of bars (T23), the ghosts
// between the eighths take their own place in the stereo round a centred offbeat hat (T21), and the closed hat and the
// sixteenths reach into the kit's short room by Tide (T31). Each idea is a word in the place's list (`SubRates.top`,
// beside the top form's) and a block of `recipes/arrangement/top-lanes.json`; the theme's choices are drawn once, off
// streams of their own, so no other draw of the theme moves.
//
// T15 (pass 3, his word 11-02, "actually sounds pretty good"): a beat-led house main never runs without its offbeat
// hat; where a main plays none, a soft one, 12 dB under a plain hat, at the middle.
//
// The hats' level (round hats-level, his ear 11-02: "hats now a bit too pronounced to steal attention from mix as the
// whole", on a display's speakers and on headphones): with the gaps filled by the quiet voices and the air richer, the
// same hat takes attention. One number, the row's `level.db`: every hat the kit's lanes play (the closed and the open
// hat, the offbeat floor, the break's holders, a sixteenth lane's hat) that many dB down after the quiet voices are set
// against it, so they stay where his ear put them and the gap between the hat and them closes toward the sources'.
//
// Nothing raises a level: a leaned figure carries the mined figure's own energy a bar, a panned ghost sits a touch
// behind, and the room's tail is paid for by the dry hit. A hand player's phrase on the sixteenth lane (a part the
// composition drew) is never turned.

import ROW_FILE from '../recipes/arrangement/top-lanes.json' with { type: 'json' };
import { Rng } from './rng.ts';
import { lean } from './lean.ts';

export type LaneIdea = 'lean' | 'ghost-pan' | 'breath' | 'wash' | 'offbeat' | 'level';
export const LANE_IDEAS: readonly LaneIdea[] = Object.freeze(['lean', 'ghost-pan', 'breath', 'wash', 'offbeat', 'level']);
export const isLaneIdea = (x: string): x is LaneIdea => (LANE_IDEAS as readonly string[]).includes(x);

type Leans = Record<string, Record<string, number>>;
interface Figure { id: string; weight: number; db: Array<number | null>; gallop?: boolean; leans?: Record<string, number> }
interface Template { id: string; weight: number; pan: number[]; db: number[] }
interface Move { id: string; drop?: number[]; add?: number[] }
interface Marks {
  before: number; after: number; most: number; share: number; apart: number; least: number; changes: Array<{ id: string; from: string[]; to: string[] }>;
  phrase: { on: boolean; least: number; most: number };
}
/** The harmony a mark reads (T13 pass 3): the chord a bar plays, and the length of the progression's cycle in bars. */
export interface LaneHarmony { chordAt: (bar: number) => string; cycleBars: number }
export interface TopLanesRow {
  centre: Record<string, number>;
  lean: { chance: number; leans: Leans; gallopFrom: number; figures: Figure[]; marks: Marks };
  ghostPan: { offbeatPan: number; leastBars: number; depth: { least: number; atTideOne: number }; templates: Template[] };
  breath: { chance: number; leans: Leans; keysRestLean: number; moves: Move[] };
  wash: { fromTide: number; gain: number; most: number; longer: number; mostSeconds: number; dryDbPerRoom: number };
  offbeatFloor: { voice: string; vel: number; gain: number; db: number; steps: number[]; sections: string[]; holds?: boolean };
  level: { db: number; ceilingDb?: number; read?: HatRead; floor?: { db: number } };
}
/**
 * **The plan's read of the kit's hats against the mix** (round hat-ceiling): each hit's level off the plan (its gain and
 * velocity, the room's level word and the section's floor; a ladder hat's room trim and the energy of its ring), power
 * summed over the groove's bars, a constant a voice for what one hit at unit level carries (`voiceDb`, measured on the
 * stems), against the mix the theme's trim aims at (the aim, less `mixDb`: a main's power under its loudness, measured).
 */
export interface HatRead { voiceDb: Record<string, number>; mixDb: number }
export const TOP_LANES: Readonly<TopLanesRow> = ROW_FILE as unknown as TopLanesRow;

/** One step of a figure: where, and its level as a share of the mined figure's loudest hit. */
export interface LaneStep { step: number; level: number }

export interface TopLanesPlan {
  /**
   * T13: the leaned figure that replaces the mined one (bar A), its id, and the bars it plays in: the marks round the
   * section changes it was given (his ear 11-02: as a constant figure "too busy"; a fill marking the structure)
   */
  lean: { id: string; steps: LaneStep[]; bars: number[]; marks: Array<{ bar: number; change: string; window: [number, number]; cadence: number[] }> } | null;
  /** T23: bar B of every pair, its move's id: over `lean`'s steps in a marked bar (`steps`), over the mined figure elsewhere (`plain`) */
  breath: { id: string; steps: LaneStep[]; plain: LaneStep[] | null } | null;
  /** T21: the pan and level column of the ghosts, already scaled by Tide's depth */
  pan: { id: string; pan: number[]; db: number[]; offbeat: number; leastBars: number } | null;
  /** T31: the closed hat's and the sixteenths' room send as a share of the theme's kit room floor, and the dry gain */
  wash: { roomScale: number; most: number; lengthScale: number; mostSeconds: number; dryDbPerRoom: number } | null;
  /** T15: a beat-led house main never runs without its offbeat hat: the soft hat a hatless main takes, its voice, level and steps */
  offbeat: { voice: string; vel: number; gain: number; steps: number[]; sections: string[]; holds: boolean } | null;
  /** the hats' level at the house's pace (round hats-level): every hat of the kit's lanes this many dB down, never a quiet voice; and
   * (round hat-ceiling) no louder than `ceilingDb` against the mix, as the plan reads it once the trim is known (`hatCeilingDb`) */
  level: { db: number; ceilingDb?: number } | null;
  summary: string;
}

export interface TopLanesInput {
  seed: string | number;
  spell: Readonly<Record<string, number>>;
  ideas: readonly LaneIdea[];
  /** the theme plays a sixteenth lane of its own (a mined figure, no hand player's phrase) */
  sixteenths: boolean;
  /** the mined sixteenth figure: its steps and their levels (`MaskRow`) */
  mined: { m: string; v: number[] | null } | null;
  /** the keys' figure (the stab mask), whose rests B leans to */
  keys?: string | null;
  /** the form, and the bars the sixteenth lane's layer plays in, where the lean's marks go (absent: no marks, no lean) */
  sections?: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  laneBars?: ReadonlySet<number>;
  /** the harmony's phrase, which the lean follows inside a mark (absent: the marks as fixed windows) */
  harmony?: LaneHarmony;
  row?: TopLanesRow;
}

const dbToAmp = (db: number) => Math.pow(10, db / 20);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const leanOf = (leans: Leans | undefined, choice: string, sp: Readonly<Record<string, number>>, C: Record<string, number>) => {
  let x = 1;
  for (const [bird, w] of Object.entries(leans ?? {})) x *= lean(w?.[choice], sp[bird], 1, C[bird] ?? 0.5);
  return x;
};
const draw = <T>(r: Rng, list: Array<{ v: T; w: number }>): T | null => {
  const live = list.filter((x) => x.w > 0);
  return live.length ? r.weighted(live) : null;
};

/** The mined figure's hits at their own levels (a mask's `x` steps; 0.3 where it states no level, as the lane plays it). */
export function minedSteps(mined: { m: string; v: number[] | null }): LaneStep[] {
  const out: LaneStep[] = [];
  for (let i = 0; i < mined.m.length && i < 16; i++) if (mined.m[i] === 'x') out.push({ step: i, level: mined.v?.[i] ?? 0.3 });
  return out;
}

/** A figure's levels a step, scaled so the bar carries the mined figure's energy and never tops its loudest hit. */
export function leanedSteps(fig: Figure, mined: LaneStep[]): LaneStep[] {
  const rel = fig.db.map((d, step) => (d === null ? null : { step, a: dbToAmp(d) })).filter((x): x is { step: number; a: number } => !!x);
  const energy = mined.reduce((s, x) => s + x.level * x.level, 0);
  const top = Math.max(...mined.map((x) => x.level));
  const relEnergy = rel.reduce((s, x) => s + x.a * x.a, 0);
  const relTop = Math.max(...rel.map((x) => x.a));
  const k = Math.min(Math.sqrt(energy / relEnergy), top / relTop);
  return rel.map((x) => ({ step: x.step, level: r3(x.a * k) }));
}

/** A move over a figure: its steps out, its added steps at the dropped steps' levels (past them a ghost); null unless B stands 2-4 steps from A. */
export function movedSteps(A: LaneStep[], move: Move): LaneStep[] | null {
  const at = new Map(A.map((x) => [x.step, x.level]));
  const drop = (move.drop ?? []).filter((s) => at.has(s));
  const add = (move.add ?? []).filter((s) => !at.has(s));
  const differ = drop.length + add.length;
  if (differ < 2 || differ > 4) return null;
  const B = A.filter((x) => !drop.includes(x.step));
  if (!B.length && !add.length) return null;
  // a move carries its accent: an added hit takes a dropped hit's level, in turn; past the drops it is a ghost of the
  // figure (its quietest hit's level)
  const dropped = A.filter((x) => drop.includes(x.step)).map((x) => x.level);
  const least = Math.min(...A.map((x) => x.level));
  add.forEach((s, i) => B.push({ step: s, level: r3(dropped[i] ?? least) }));
  return B.sort((a, b) => a.step - b.step);
}

/**
 * T13's marks: the section changes the leaned figure marks, `before` bars into the change and `after` bars out of it,
 * wherever the lane plays there. A change is a section line where a main or a drop turns (the row's `changes`, in their
 * order: a main into a breakdown first, then an arrival, then a main into the next, then the way out); the track's
 * first arrival (out of the intro) is never one, so the plain figure is heard before a mark. At most `most` marks a
 * track and `share` of the lane's bars, each sounding in `least` bars or more and at least `apart` bars from the next
 * mark's sounding bars (read off the sections' own layers).
 */
export function leanMarks(sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>, laneBars: ReadonlySet<number>, M: Marks, H?: LaneHarmony) {
  const cands: Array<{ bar: number; change: string; rank: number; sounding: number[]; span: number[] }> = [];
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    const rank = M.changes.findIndex((c) => c.from.includes(a.kind) && c.to.includes(b.kind));
    if (rank < 0) continue;
    const span: number[] = [];
    for (let x = Math.max(0, b.startBar - M.before); x < b.startBar + M.after; x++) span.push(x);
    const sounding = span.filter((x) => laneBars.has(x));
    if (sounding.length >= M.least) cands.push({ bar: b.startBar, change: M.changes[rank].id, rank, sounding, span });
  }
  cands.sort((x, y) => x.rank - y.rank || x.bar - y.bar);
  const taken: typeof cands = [];
  let n = 0;
  const first = (c: (typeof cands)[number]) => c.sounding[0], last = (c: (typeof cands)[number]) => c.sounding[c.sounding.length - 1];
  for (const c of cands) {
    if (taken.length >= M.most || n + c.sounding.length > M.share * laneBars.size) continue;
    if (taken.some((t) => first(c) <= last(t) + M.apart && first(t) <= last(c) + M.apart)) continue;
    taken.push(c); n += c.sounding.length;
  }
  taken.sort((x, y) => x.bar - y.bar);
  // the lean plays wherever the lane sounds in a mark (a staged entry or a sub-section may open it inside a span the
  // sections' own layers leave quiet); the sections' layers only choose and space the marks.
  // **The lean follows the harmony's phrase** (pass 3, his ear 11-02 on Vibe - Sunrise: the hats "more dense on first two
  // cords, and the sparce on last to underline the end of conversation"): each side of a change reads one phrase of the
  // harmony, the progression's cycle (`phrase.least` to `phrase.most` bars, counted from the change's line); where it
  // moves through two chords or more, the side is that whole phrase, the lean on the chords that state it and the plain
  // figure on its closing chord (the cadence). Where the harmony holds one chord across the side, the side is as it was.
  const out: number[] = [], marks: Array<{ bar: number; change: string; window: [number, number]; cadence: number[] }> = [];
  const cycle = H ? Math.max(M.phrase.least, Math.min(M.phrase.most, H.cycleBars * Math.ceil(M.phrase.least / Math.max(1, H.cycleBars)))) : 0;
  for (const t of taken) {
    const i = sections.findIndex((x) => x.startBar === t.bar);
    const prev = sections[i - 1], next = sections[i];
    const sides: Array<[number, number, number, number]> = [
      [Math.max(prev.startBar, t.bar - cycle), t.bar, Math.max(0, t.bar - M.before), t.bar],
      [t.bar, Math.min(next.startBar + next.bars, t.bar + cycle), t.bar, t.bar + M.after],
    ];
    let lo = Infinity, hi = -Infinity;
    const cadence: number[] = [];
    for (const [a, z, a0, z0] of sides) {
      const chords = H && M.phrase.on ? Array.from({ length: z - a }, (_, k) => H.chordAt(a + k)) : [];
      const spans = chords.filter((c, k) => k === 0 || c !== chords[k - 1]).length;
      if (spans >= 2) {
        let c0 = chords.length - 1;
        while (c0 > 0 && chords[c0 - 1] === chords[chords.length - 1]) c0--;
        for (let b = a; b < z; b++) (b - a < c0 ? out : cadence).push(b);
        lo = Math.min(lo, a); hi = Math.max(hi, z);
      } else {
        for (let b = a0; b < z0; b++) out.push(b);
        lo = Math.min(lo, a0); hi = Math.max(hi, z0);
      }
    }
    marks.push({ bar: t.bar, change: t.change, window: [lo, hi - 1], cadence });
  }
  return { bars: out, marks };
}

export function planTopLanes(I: TopLanesInput): TopLanesPlan {
  const R = I.row ?? TOP_LANES, C = R.centre, sp = I.spell;
  const on = new Set(I.ideas);
  const bird = (b: string) => (typeof sp[b] === 'number' ? sp[b] : C[b] ?? 0.5);
  const said: string[] = [];
  const P: TopLanesPlan = { lean: null, breath: null, pan: null, wash: null, offbeat: null, level: null, summary: '' };
  const mined = I.sixteenths && I.mined ? minedSteps(I.mined) : [];

  // T13: the leaned figure, a theme's draw off its own stream
  let A = mined;
  if (on.has('lean') && mined.length) {
    const r = new Rng(`${I.seed}::top-lanes:lean`);
    const chance = Math.min(1, R.lean.chance * leanOf(R.lean.leans, 'on', sp, C));
    const spark = bird('spark');
    if (r.chance(chance)) {
      const fig = draw(r, R.lean.figures.map((f) => ({ v: f, w: f.gallop && spark < R.lean.gallopFrom ? 0
        : f.weight * lean(f.leans?.spark, spark, 1, C.spark ?? 0.5) })));
      const m = fig && I.sections && I.laneBars ? leanMarks(I.sections, I.laneBars, R.lean.marks, I.harmony) : null;
      if (fig && m && m.bars.length) {
        A = leanedSteps(fig, mined);
        P.lean = { id: fig.id, steps: A, ...m };
        said.push(`the sixteenths lean (${fig.id}) round ${m.marks.map((x) => `${x.change}@${x.bar}`).join(', ')}`);
      }
    }
  }

  // T23: bar B of every pair, leaning to the moves whose added hits fall where the keys rest
  if (on.has('breath') && A.length) {
    const r = new Rng(`${I.seed}::top-lanes:breath`);
    if (r.chance(Math.min(1, R.breath.chance * leanOf(R.breath.leans, 'on', sp, C)))) {
      const keys = I.keys ?? '';
      const rests = (m: Move) => (m.add ?? []).every((s) => keys[s] !== 'x');
      const options = R.breath.moves.map((m) => ({ m, B: movedSteps(A, m) })).filter((x) => !!x.B);
      const pick = draw(r, options.map((x) => ({ v: x, w: rests(x.m) ? R.breath.keysRestLean : 1 })));
      if (pick) {
        P.breath = { id: pick.m.id, steps: pick.B!, plain: A === mined ? pick.B! : movedSteps(mined, pick.m) };
        said.push(`the sixteenths breathe in pairs (${pick.m.id})`);
      }
    }
  }

  // T21: the ghosts' place in the stereo, its depth by Tide
  if (on.has('ghost-pan')) {
    const r = new Rng(`${I.seed}::top-lanes:pan`);
    const t = draw(r, R.ghostPan.templates.map((x) => ({ v: x, w: x.weight })));
    if (t) {
      const D = R.ghostPan.depth;
      const depth = Math.max(D.least, Math.min(D.atTideOne, D.least + (D.atTideOne - D.least) * bird('tide')));
      P.pan = { id: t.id, pan: t.pan.map((x) => r3(x * depth)), db: t.db.slice(), offbeat: R.ghostPan.offbeatPan, leastBars: R.ghostPan.leastBars };
      said.push(`the ghosts placed (${t.id}, depth ${depth.toFixed(2)})`);
    }
  }

  // T31: the hats' own wash, by Tide
  if (on.has('wash')) {
    const W = R.wash;
    const x = Math.max(0, Math.min(1, (bird('tide') - W.fromTide) / (1 - W.fromTide)));
    if (x > 0) {
      P.wash = { roomScale: r3(1 + (W.gain - 1) * x), most: W.most, lengthScale: r3(1 + W.longer * x), mostSeconds: W.mostSeconds, dryDbPerRoom: W.dryDbPerRoom };
      said.push(`the hats' room ×${P.wash.roomScale.toFixed(2)}, ×${P.wash.lengthScale.toFixed(2)} long`);
    }
  }
  // T15: the offbeat hat's floor, a rule where the word is listed (the generator lays it only in a main without one)
  if (on.has('offbeat')) {
    const O = R.offbeatFloor;
    P.offbeat = { voice: O.voice, vel: r3(O.vel * dbToAmp(O.db)), gain: O.gain, steps: O.steps.slice(), sections: O.sections.slice(), holds: O.holds !== false };
  }
  // the hats' level (round hats-level): one number for the house's pace, the kit's hats down and the quiet voices where they were
  if (on.has('level') && (R.level.db || R.level.ceilingDb != null)) {
    P.level = { db: R.level.db, ...(R.level.ceilingDb != null ? { ceilingDb: R.level.ceilingDb } : {}) };
    if (R.level.db) said.push(`the hats ${R.level.db} dB`);
    if (R.level.ceilingDb != null) said.push(`the hats no louder than ${R.level.ceilingDb} dB against the mix`);
  }
  P.summary = said.join(' · ');
  return P;
}

/** A kit hat as the plan holds it: what `hatOverMixDb` reads. */
export interface HatReadEvent { t: number; voice: string; p: Record<string, unknown>; by?: unknown }
/** Is this the kit's hat (a lane's hat, the offbeat floor, a holder's), never a quiet voice of the top's set. */
export const isKitHat = (e: { voice: string; by?: unknown }): boolean => (/^hat/.test(e.voice) || e.voice === 'ride') && !String(e.by ?? '').startsWith('top-voices/');

/**
 * **How loud the kit's hats stand against the mix, read off the plan** (round hat-ceiling), in dB over the groove's bars
 * (mains and drops): no render, no meter. `tableDb` is a hit's level from the room's table (its word and the section's
 * floor), `ladder` a hat's ring as the voice plays it (its ten-decibel time, the ring's velocity term, its tail) where the
 * hat is the room's ladder, and `trimDb` and `aimLufs` the theme's own. Null where there is no hat in the groove or no aim.
 */
export function hatOverMixDb(I: {
  events: readonly HatReadEvent[]; sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>; barSeconds: number;
  tableDb: (e: HatReadEvent) => number; ladderDb: (e: HatReadEvent) => number | null; familyTrimDb: number;
  trimDb: number; aimLufs: number | null | undefined; read: HatRead;
  /** the bars read (round break-hats: a groove's first bars, where a break lands); absent, the groove's bars (mains and drops) */
  bars?: ReadonlySet<number>;
}): number | null {
  if (I.aimLufs == null) return null;
  const groove = new Set<number>(I.bars ?? []);
  if (!I.bars) for (const s of I.sections) if (s.kind === 'main' || s.kind === 'drop') for (let b = s.startBar; b < s.startBar + s.bars; b++) groove.add(b);
  let power = 0;
  for (const e of I.events) {
    if (!isKitHat(e) || !groove.has(Math.floor(e.t / I.barSeconds + 1e-6))) continue;
    const k = I.read.voiceDb[e.voice];
    if (k == null) continue;
    const ring = I.ladderDb(e);
    const db = I.tableDb(e) + 20 * Math.log10(Math.max(1e-9, Number(e.p.gain ?? 1) * Number(e.p.vel ?? 1))) + k + (ring == null ? 0 : ring + I.familyTrimDb);
    power += Math.pow(10, db / 10);
  }
  if (!(power > 0) || !groove.size) return null;
  return 10 * Math.log10(power / (groove.size * I.barSeconds)) + I.trimDb - (I.aimLufs + I.read.mixDb);
}

/**
 * **The lift the floor asks** (round hat-floor), in dB (nought or more): where the kit's hats stand under `floorDb`
 * against the rest above 3 kHz (`topDb`, as the plan reads it after the ceiling), they come up to it, never past the
 * level they were drawn at (`cutDb`, the ceiling's cut, is all there is to give back).
 */
export const hatFloorDb = (topDb: number | null, floorDb: number, cutDb: number): number => (topDb == null ? 0 : Math.max(0, Math.min(-cutDb, floorDb - topDb)));

/** The cut the ceiling asks, in dB (nought or less): the kit's hats down to `ceilingDb` against the mix, never up. */
export const hatCeilingDb = (overDb: number | null, ceilingDb: number): number => (overDb == null ? 0 : Math.min(0, ceilingDb - overDb));
