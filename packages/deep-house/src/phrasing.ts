// **The house gets phrases** (PLAN-UNIFY U2; his word of 10-13: *"the main segment is a bit monotonous … lacking
// dynamic, sub segments"*, *"we divide only break, groove, and in and out"*). At every house-v2 position whose kit no
// phrase planner owns — the house, the mid ring, a groove the fast places' development does not plan — the arrangement
// is read through the phrase map (`src/phrase-map.ts`: the phrases with their functions, the structural arrivals) and
// gets what the fast places' producer gives its tracks, in the theme's own time (`src/musical-time.ts`):
//
//   - **sub-segments inside a long main**: a main longer than about 32 bars or 60 s takes a phrase event every 40 s or
//     so (Loom leaning the rate), at an interior phrase's end or an approach's, the groove back on the phrase line —
//     a drop-out bar, a filtered phrase, a half-time phrase, a breakdown-lite (the drums thinned, the bed exposed), a
//     plain fill — each small, its last bar the re-entry (a fill there, the drums back for it);
//   - **the drums answering the structural arrivals**: a section line the drums play into, a progression arriving after
//     its harmony held a phrase — a crash into the hall, the hats breathing, a reverse swell into it, the field leaning
//     in — never more than one a phrase, never over a gesture the lead-ins already laid (§1.3, §1.6);
//   - **the bass out before an anchor**: before a drop and a main's return, so the line lands with it (§1.10);
//   - **the cooldown**: a main's last stretch into a break declared, the bass out across it and no sub-segment in it.
//
// **One vocabulary** (§2.4): the row's `vocabulary` names every ending and phrase event once, with where it leads and
// what the kit must have, and where each side plays it — the house's sub-sections (`recipes/treatments/`, the house's
// rates their defaults), this pass's segments, answers and outs, the producer's ending names. A phrase event here is a
// sub-section (`src/subsections.ts`): a figure in roles, played by `playSubSections` on the theme's own kit, so it is
// never an instrument the theme did not draw; a filtered phrase and the field's lean are the automation's.
//
// Every draw is off a stream of its own (`<seed>::phrasing:…`), so a segment drawn or not moves no other die. Nothing
// here names a place, a genre or a seed.
import PHRASING_FILE from '../recipes/arrangement/phrasing.json' with { type: 'json' };
import { Rng } from './rng.ts';
import { lean } from './lean.ts';
import { weightOf, type Recipe } from './recipe.ts';
import { inBox, type SubSection } from './subsections.ts';
import type { LaneEdit } from './treatment.ts';
import type { MusicalTime } from './musical-time.ts';
import type { PhraseMap } from './phrase-map.ts';
import type { Spell } from './spell.ts';

type W = Record<string, number>;
export type SegmentKind = 'breakdown-lite' | 'half-time' | 'filtered' | 'drop-out' | 'fill';
export const SEGMENT_KINDS: readonly SegmentKind[] = Object.freeze(['breakdown-lite', 'half-time', 'filtered', 'drop-out', 'fill']);

export interface VocabularyEntry { destinations: string[]; needs: string[]; house: string | null; producer: string[] }
export interface PhrasingRow {
  id: string;
  name: string;
  /** the house's own birds: every lean of the row is nought there */
  centre: Record<string, number | string>;
  /** the slowest tempo the pass plays at (the slow side's arrangement is its own: his ear 10-13) */
  leastBpm: number;
  vocabulary: { entries: Record<string, VocabularyEntry> };
  segments: { sections: string[]; longBars: number; longMostS: number; everyS: number; spacingPhrases: number; spanPhrases: number; leastBars: number;
    dropOutLeaves: { bass: number; drone: number; figure: number };
    byFunction: Record<string, W>; reentryFill: W; recent: number; lean: W; liftDb: number; liftEdgeS: number;
    filter: { hz: number; swellBeats: number; swellGain: number }; halfTime: { hz: number } };
  build: { level: number; rollFrom: number; stopStep: number; stopBeatStep: number; stopDb: number; cutS: number; edgeS: number; fieldDb: number; heldFieldDb: number };
  answers: { spacingPhrases: number; gestureBars: number; weights: W; crashGain: number; reverseBeats: number; reverseGain: number; breatheSteps: number;
    fieldDb: number; fieldDbDrop: number; leadBars: number; releaseBeats: number };
  outs: { into: Record<'drop' | 'return', W>; lean: W; withoutKick: number; fill: number;
    lift: { beats: Record<'drop' | 'return', number>; semitones: number; swellBeats: Record<'drop' | 'return' | 'break', number>; swellGain: number };
    dip: { hz: number } };
  cooldown: { phrases: W; keep: number; lean: W };
}

const FILE = PHRASING_FILE as unknown as { rows: PhrasingRow[] };
/** The phrasing rows, by id (`recipes/arrangement/phrasing.json`). */
export const PHRASING_ROWS: Readonly<Record<string, PhrasingRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/** A sub-segment as the ring may show it: its kind, its bars, the phrase function it answers and its name; what answered it (U2b). */
export interface Segment {
  kind: SegmentKind; from: number; to: number; fn: string; label: string; reentry: string | null; answered?: string[];
}
/** A structural arrival answered: its bar, what arrives, and the answer's parts. */
export interface Answer { bar: number; by: string; into: string; parts: string[]; field: number; label: string }
/**
 * The bass out before an anchor, or across a cooldown, and what marks it (U2b, his ear 10-13: never a bare gap): the
 * fill on its last bar, the lift into the line (the bass's own glide, a reverse swell, or the gesture already there)
 * and the other voices' acknowledgement (the tops thinning, or the low-pass dipping).
 */
export interface Out { from: number; to: number; into: 'drop' | 'return' | 'break'; label: string; fill?: string | null; lift?: string[]; ack?: 'tops' | 'dip' }
/** A gesture the pass asks of the automation and the glue (U2b): a dip of the master's low-pass, a swell of the field, a reverse swell, the bass's glide. */
export interface Moves {
  /** the low-pass from `a` closed to `hz` by `b`, held, opened from `c` back to its own line at `d` (seconds); held closed to `d` and handed to the curve there where `hold` (a cooldown into its break) */
  dips: Array<{ a: number; b: number; c: number; d: number; hz: number; hold?: boolean; by?: SubSection;
    /** held closed into this next dip (its own opening kept in `reopen`, for where the next is not laid) */
    into?: Moves['dips'][number]; reopen?: { c: number; d: number } }>;
  /** the melodic bus shaped by factors at knots (seconds; 1 outside them): a build's rise, its stop, back on the line */
  gains: Array<{ knots: Array<{ t: number; f: number }>; by?: SubSection }>;
  /** a reverse swell into bar `bar`'s one, `beats` long */
  swells: Array<{ bar: number; beats: number; gain: number; by?: SubSection }>;
  /** the bass's glide into bar `bar`'s first note, from `semitones` under it over the last `beats` before the line */
  glides: Array<{ bar: number; beats: number; semitones: number; by?: SubSection }>;
  /** a crash on bar `bar`'s one (an overlaid fill's landing, where the theme sounds its crash and nothing lands there) */
  crashes: Array<{ bar: number; by?: SubSection }>;
}
/**
 * **What a phrase's label may say** (the review of U2b: a label named marks that were never heard): each part of an
 * answer with what makes it true — its sub-section heard, its crash or swell struck on the line, its dip or glide laid.
 * The composer keeps the parts that hold and writes the label from them (`said`).
 */
export interface Said { text: string; by?: SubSection; crash?: number; swell?: number; dip?: Moves['dips'][number]; glide?: Moves['glides'][number];
  /** the text where its dip ended held closed into the next (a filtered phrase into a cooldown or an out) */
  heldText?: string }
export interface Note { segment?: Segment; out?: Out; head: string; said: Said[]; tail: string }
/** A label from its head, the parts that hold and its tail. */
export const said = (n: Note, holds: (x: Said) => boolean): { label: string; parts: string[] } => {
  const parts = n.said.filter(holds).map((x) => (x.dip?.into && x.dip.hold && x.heldText ? x.heldText : x.text));
  return { label: `${n.head}${parts.length ? `; ${parts.join(', ')}` : ''}${n.tail}`, parts };
};

/** What the pass did: the track's `phrasing`, read by nothing new (the ring may show `segments` later). */
export interface Phrasing { segments: Segment[]; answers: Answer[]; outs: Out[]; cooldowns: Array<{ from: number; to: number; label: string }>; summary: string }

/** The harmonic and melodic layers: what holds a chord or sings a line (the guards' own list, `tools/check-program-guards.ts`). */
export const TONAL_LAYERS: ReadonlySet<string> = new Set(['keys', 'pad', 'lead', 'stab', 'arp', 'pluck', 'piano', 'bell', 'vocal', 'strings', 'melodic']);

/** What a bar's kit plays, as the bar loop laid it. */
export interface BarKit {
  kick: boolean; backbeat: boolean; offbeat: boolean; earlyHats: boolean; bass: boolean;
  /** the tops sound in the bar: the sixteenth lane or the open hat (U2b: what thins under a filtered phrase and a cooldown) */
  tops?: boolean;
  /** the sixteenth lane sounds in the bar (U2b: an out's fill rolls on it where a track row owns the backbeat and the kick) */
  sixteenths?: boolean;
  /** the groove's drums sound in the bar: the kick, the backbeat or the hats (the sixteenth lane alone is a part's colour, a pickup's) */
  drums: boolean;
  /** the space held without the bass: a harmonic or melodic note sounding in the bar, or the hats ticking (two onsets or more) */
  held: boolean;
  /** how much of the bar each held part sounds over (0 to 1): the bass, the held layer (the pad), the struck figure (the keys) */
  cover: { bass: number; drone: number; figure: number; harmony: number };
}

export interface PhrasingInput {
  row: PhrasingRow;
  seed: string | number;
  spell: Readonly<Spell>;
  bpm: number;
  time: MusicalTime;
  map: PhraseMap;
  sections: ReadonlyArray<{ index: number; kind: string; startBar: number; bars: number }>;
  bars: number;
  /** the house's own small things, drawn (their bar marks and switch-ups are theirs) */
  drawn: readonly SubSection[];
  /** the treatment rows the draw sees (the library's): a re-entry's fill and a drop-out bar are drawn among them, in the theme's box */
  treatments: readonly Recipe[];
  /** the kick is a four-on-the-floor (no broken kit): a half-time phrase is a four's breath */
  four: boolean;
  kit: (bar: number) => BarKit;
  /** a gesture stands within the answers' `gestureBars` of a bar's one (a lead-in, a section's impact, a stroke) */
  gestured: (bar: number) => boolean;
  /** the glue's crash (the impact slot) and reverse swell (the swell slot) the palette carries; whether the bass's voice glides, and whether the theme already sounds the glue's swell (U2b: the pass's own swells, never a voice the cast did not count) */
  can: { crash: boolean; reverse: boolean; glide?: boolean; swell?: boolean };
  /** the theme's beat and bar, in seconds (U2b: the automation's gestures) */
  beatS?: number;
  /** roles no build edits, in the lane table's words (a part's: a pinned one, the listener's word, or one the composition drew, so the two play as one; only the stop's eighth silences them) */
  spare?: ReadonlySet<string>;
  /** the arrangement's own filter line moves between two bars (U2c review: no dip is laid there, so an out marks itself otherwise or is not taken) */
  filterMoves?: (fromBar: number, toBar: number) => boolean;
  /** bars another small thing owns (the rhythm development's pickups) */
  keep: ReadonlySet<number>;
  /** the roles an explicit part owns, in the lane table's words (a track row's rhythm cells, a pin): never edited */
  held: ReadonlySet<string>;
}

/** A row of a figure, as `playSubSections` plays it (a treatment's shape; written here, never in the library). */
const figureRow = (id: string, name: string, applies: 'switch-up' | 'drop-out' | 'fill', figure: Recipe['figure']): Recipe =>
  ({ schema: 1, kind: 'recipe', id, revision: 1, name, scope: 'treatment', applies, birds: {}, figure, forbids: [], weight: 0 }) as unknown as Recipe;
const BREAKDOWN_LITE = figureRow('phrasing/breakdown-lite', 'breakdown-lite', 'switch-up',
  { lanes: { kick: { clear: 0 }, backbeat: { clear: 0 }, sixteenth: { clear: 0 }, open: { clear: 0 } } });
const HALF_TIME = figureRow('phrasing/half-time', 'half-time phrase', 'switch-up',
  { lanes: { kick: { clear: 0, mask: ['X.........X.....'] }, backbeat: { clear: 0, mask: ['........X.......'] } } });
const BASS_OUT = figureRow('phrasing/bass-out', 'bass out', 'drop-out', { lanes: { bassline: { clear: 0 } } });
// U2b (his ear 10-13): the answers a filtered phrase and a bass out are marked by — the tops thinning (the sixteenths and
// the open hat; the closed hats keep the time), the bass stepping out from a step, the keys resting
const TOPS_THIN = figureRow('phrasing/tops-thin', 'the tops thin', 'switch-up', { lanes: { sixteenth: { clear: 0 }, open: { clear: 0 } } });
const bassOutFrom = (step: number) => step > 0 ? figureRow(`phrasing/bass-out-from-${step}`, 'bass out', 'drop-out', { lanes: { bassline: { clear: step } } }) : BASS_OUT;
// **The build** (U2c; his ear 10-13 on U2b's pairs: "we need to have more drum work on any little breaks like that …
// if track has drums, it's essential to use drums for emphasis these kind of moments, also fading in sounds cheap,
// likely need more like a build up and drop kind of approach"): the library's fill, its roll held at `level` of the
// backbeat's own hit it copies (a build's peak never over the lane), the hats resting under the roll so it reads; over a
// track row's own drums an overlay on that one bar (U2b's `overlay`). Every other bar of the row is its own.
const rollFrom = (row: Recipe): number => Math.min(16, ...Object.values(row.figure?.lanes ?? {}).map((e) => e.roll?.from ?? 16));
/** The lane a build rolls on: the backbeat where the kit has one, else its closed hats, its sixteenths, its kick. */
type RollLane = 'backbeat' | 'offbeat' | 'sixteenth' | 'kick';
const ROLLS: Readonly<Record<RollLane, string>> = { backbeat: 'the backbeat rolling', offbeat: 'the hats rolling', sixteenth: 'the sixteenths rolling', kick: 'the kick rolling' };
const buildOf = (row: Recipe, level: number, over: boolean, longest: number, lane: RollLane): Recipe => {
  // the library row's roll (its shape and its level, held at `level`), from `longest` at the latest (two beats), on the
  // lane the kit has; the hats rest under it from there, and the kick's gap is the row's own (a step after the roll)
  const src = Object.values(row.figure?.lanes ?? {}).find((e) => e.roll)?.roll ?? { from: 8, base: 0.45, rise: 0.5 };
  const from = Math.min(src.from, longest);
  const roll = { from, base: +(src.base * level).toFixed(4), rise: +(src.rise * level).toFixed(4) };
  const kick = row.figure?.lanes?.kick?.clear;
  // (the rolling lane last, so the open hat's rest never takes a roll its closed hat plays where the two share a voice)
  const lanes: Record<string, LaneEdit> = { ...(lane !== 'offbeat' ? { offbeat: { clear: from } } : {}), open: { clear: from },
    ...(kick !== undefined && lane !== 'kick' ? { kick: { clear: Math.min(kick, from + 1) } } : {}) };
  lanes[lane] = { clear: from, roll };
  return figureRow(`${row.id}+build+${lane}${over ? '+over-a-row' : ''}`, row.name, 'fill', { lanes });
};
// the roll's shape where the library offers no fill at the place
const DEFAULT_FILL = figureRow('phrasing/roll', 'a roll', 'fill', { lanes: { backbeat: { clear: 8, roll: { from: 8, base: 0.45, rise: 0.5 } } } });
// the stop: every drum lane out from a step to the line (an eighth, or the last beat), so the line lands on silence
const stopFrom = (step: number): Recipe => figureRow(`phrasing/stop-${step}`, 'the stop', 'drop-out',
  { lanes: { kick: { clear: step }, backbeat: { clear: step }, offbeat: { clear: step }, sixteenth: { clear: step }, open: { clear: step } } });

/** The one lean of each bird a row names, about the row's centre (the house's own value of that bird). */
function leanOf(row: PhrasingRow, leans: W, spell: Readonly<Spell>): number {
  let x = 1;
  for (const [bird, v] of Object.entries(leans)) {
    const c = row.centre[bird];
    if (typeof c === 'number') x *= lean(v, (spell as unknown as Record<string, number>)[bird], 1, c);
  }
  return x;
}

export function planPhrasing(I: PhrasingInput): { phrasing: Phrasing; subs: SubSection[]; moves: Moves; notes: Note[] } {
  const R = I.row, T = I.time, L = I.map.time.phraseBars, bs = T.barS, beat = I.beatS ?? bs / 4;
  const segments: Segment[] = [], answers: Answer[] = [], outs: Out[] = [], cooldowns: Phrasing['cooldowns'] = [];
  const subs: SubSection[] = [];
  const moves: Moves = { dips: [], gains: [], swells: [], glides: [], crashes: [] };
  const notes: Note[] = [];
  // a reverse swell into a line where the glue carries one and no gesture lands there already (each line once)
  const swellInto = (bar: number, beats: number, gain: number, by?: SubSection) => {
    if (!(I.can.swell ?? I.can.reverse) || I.gestured(bar) || moves.swells.some((x) => x.bar === bar)) return false;
    moves.swells.push({ bar, beats, gain, ...(by ? { by } : {}) });
    return true;
  };
  const sections = [...I.sections].sort((a, b) => a.startBar - b.startBar);
  const sectionAt = (bar: number) => sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
  // the bars the house's own small things already mark: a bar mark's bar, every bar of a switch-up (a variation, the
  // hats' own figure over a phrase's second half, is a part's figure and lets a phrase event sit over it)
  const marked = new Set<number>([...I.keep]);
  for (const s of I.drawn) if (s.kind !== 'variation') for (let b = s.startBar; b < s.startBar + s.bars; b++) marked.add(b);
  const free = (a: number, z: number) => { for (let b = a; b < z; b++) if (marked.has(b)) return false; return true; };
  const take = (a: number, z: number) => { for (let b = a; b < z; b++) marked.add(b); };
  const every = (a: number, z: number, f: (k: BarKit) => boolean) => { for (let b = a; b < z; b++) if (!f(I.kit(b))) return false; return true; };
  const sub = (kind: SubSection['kind'], row: Recipe, startBar: number, bars: number, label: string): SubSection => ({ kind, startBar, bars, label, figure: row.id, row });
  // the library's rows of a kind in the theme's box, placed in the section's kind
  const rowsOf = (applies: string, kind: string, ok: (r: Recipe) => boolean = () => true) => I.treatments.filter((r) => r.scope === 'treatment' && r.applies === applies
    && weightOf(r) > 0 && inBox(r, I.spell, I.bpm) && (!r.place?.sections || r.place.sections.includes(kind)) && !r.place?.into && ok(r));
  const drawRow = (rng: Rng, rows: Recipe[]) => (rows.length ? rows.length === 1 ? rows[0] : rng.pickWeighted(rows, weightOf) ?? null : null);
  // a role the figures may edit (not an explicit part's), in the figure's words (`laneRoleOf`: the open hat is an offbeat)
  const editable = (role: string) => !I.held.has(role === 'open' ? 'offbeat' : role === 'drone' ? 'sustained' : role);
  // a drop-out bar takes the kick out where it may, else what it may of the bar (the bass and the chords out under a
  // row's own drums: the drums alone for a bar)
  const dropsBar = (r: Recipe) => Object.entries(r.figure?.lanes ?? {}).some(([role, e]) => e.clear === 0 && editable(role))
    && (r.figure?.lanes?.kick?.clear === 0 || !editable('kick'));
  // ...and on the bar it would play, the bar keeps a part that holds it after the row's clears: a sounding bass, or a
  // sounding harmony (the pad, or the keys over most of the bar) — never a bar of nothing, or the hand drums alone (the
  // review of U2: a breath that took the figure from a theme whose harmony was the figure)
  // a bar the bass may leave: the harmony or the hats hold the space, and the bar keeps its kick or a harmony over most
  // of it (never a bar of a main with no kick, no bass and a stab or two: the guards' thin bar)
  const bassMayLeave = (k: BarKit) => k.bass && k.held && (k.kick || k.cover.harmony >= R.outs.withoutKick);
  const leaves = (r: Recipe, bar: number) => {
    const cleared = (role: string) => r.figure?.lanes?.[role]?.clear === 0 && editable(role);
    const c = I.kit(bar).cover, M = R.segments.dropOutLeaves;
    return (!cleared('bassline') && c.bass >= M.bass) || (!cleared('drone') && c.drone >= M.drone) || (!cleared('figure') && c.figure >= M.figure);
  };
  const weighted = (rng: Rng, w: W) => { const pairs = Object.entries(w).filter(([, x]) => x > 0).map(([v, x]) => ({ v, w: x })); return pairs.length ? rng.weighted(pairs) : null; };

  const some = (a: number, z: number, f: (k: BarKit) => boolean) => { for (let b = a; b < z; b++) if (f(I.kit(b))) return true; return false; };
  const topsMayThin = (a: number, z: number) => z > a && (editable('sixteenth') || editable('open')) && some(a, z, (k) => !!k.tops);
  const B = R.build, s16 = bs / 16, gain = (db: number) => 10 ** (db / 20);
  // the lane a build rolls on at a bar: never a pinned part's, and never the hats in a breakdown, whose hats are the
  // section's own (S6)
  const laneAt = (bar: number): RollLane | null => {
    const k = I.kit(bar), spare = I.spare ?? new Set<string>(), inBreak = sectionAt(bar)?.kind === 'breakdown';
    const may = (r: RollLane) => !spare.has(r);
    return k.backbeat && may('backbeat') ? 'backbeat' : k.offbeat && may('offbeat') && !inBreak ? 'offbeat'
      : k.sixteenths && may('sixteenth') ? 'sixteenth' : k.kick && may('kick') ? 'kick' : null;
  };
  const fillable = (bar: number) => { const k = I.kit(bar); return (editable('backbeat') && k.backbeat) || (editable('kick') && k.kick) || (editable('sixteenth') && !!k.sixteenths); };

  // **The build and the drop into a line** (U2c, his ear 10-13 on U2b: "a build up and drop kind of approach"): on the
  // line's last bar the drums build (`buildOf`: the library's fill, its roll over the last beat or two), stop on the last
  // eighth (`stopStep`: the drums and, where it may leave, the bass out; the field cut `stopDb`), and everything comes
  // back at once on the line with a crash on its one (the theme's own, where nothing lands there already). Over a track
  // row's own drums the build and the stop are overlays on that bar alone. The other voices are timed to it: the bass
  // out from the roll, the field rising `fieldDb` with the roll, a filter cut closed (`filter`) and opening with the roll
  // to the stop — never a fade.
  interface BuildOpts { rng: Rng; row?: Recipe | null; filter?: number; filterFrom?: number; hold?: boolean; field?: number; stop?: boolean; crash?: boolean; bass?: boolean }
  const buildInto = (line: number, kind: string, o: BuildOpts): { said: Said[]; lead: SubSection | null; row: Recipe | null } => {
    const bar = line - 1, k = I.kit(bar), said: Said[] = [];
    // a build and a stop edit the drums of their bar: an overlay wherever any drum lane they touch is a row's (the
    // review of U2c: a row owning the kick and the hats, not the backbeat, ticked its hats through the stop)
    const own = (['kick', 'backbeat', 'offbeat', 'sixteenth', 'open'] as const).some((r) => !editable(r));
    const spare = I.spare ?? new Set<string>(), lane = laneAt(bar);
    const fills = rowsOf('fill', kind);
    const base = o.row ?? (lane && fills.length ? drawRow(o.rng, fills) : null) ?? DEFAULT_FILL;
    let lead: SubSection | null = null, row: Recipe | null = null;
    if (lane) {
      row = buildOf(base, B.level, own, B.rollFrom, lane);
      lead = sub('fill', row, bar, 1, `${ROLLS[lane]} into ${line}${own ? ', over the row\'s drums' : ''}`);
      if (own) { lead.overlay = true; lead.spare = spare; }
      subs.push(lead);
      said.push({ text: `${ROLLS[lane]}${own ? ' over the row\'s drums' : ''}`, by: lead });
    }
    const from = row ? rollFrom(row) : 8, t0 = bar * bs + from * s16, tStop = bar * bs + B.stopStep * s16, tLine = line * bs;
    const stop = o.stop !== false && !!lane;
    if (stop) {
      // the stop silences every drum lane on its eighth, a part's hand drums with them (the review of U2c: the house's
      // hand-drum parts played through it), so it is an overlay always — on its own steps alone
      const st = sub('drop-out', stopFrom(B.stopStep), bar, 1, `the stop ${bar}`);
      st.overlay = true;
      subs.push(st);
      said.push({ text: 'a stop on the last eighth', by: st });
    }
    if (o.bass !== false && editable('bassline') && bassMayLeave(k)) {
      const bo = sub('drop-out', bassOutFrom(Math.min(from, B.stopStep)), bar, 1, `bass out ${bar}, the build's`);
      subs.push(bo);
      said.push({ text: `the bass out from step ${Math.min(from, B.stopStep)}`, by: bo });
    }
    if (o.filter) {
      const a = o.filterFrom ?? bar * bs;
      // into a break the low-pass is held closed and handed to the break's own (the review of U2b: it reopened over the
      // out's last beats and fell again with the break's cut, 9 kHz to 900 Hz in 50 ms)
      const dip = o.hold ? { a, b: a + B.cutS, c: tLine - 0.05 * bs, d: tLine - 0.05 * bs, hz: o.filter, hold: true }
        : { a, b: a + B.cutS, c: Math.max(a + B.cutS + 0.01, t0), d: tStop, hz: o.filter };
      const m = { ...dip, ...(lead ? { by: lead } : {}) };
      moves.dips.push(m);
      said.push({ text: o.hold ? `the low-pass cut to ${o.filter} Hz into the break` : `the low-pass cut to ${o.filter} Hz and opening with the roll`, dip: m,
        heldText: `the low-pass cut to ${o.filter} Hz and held closed into what follows` });
    }
    const field = o.field ?? 0;
    if (field || stop) {
      const E = B.edgeS;
      moves.gains.push({ knots: [{ t: t0, f: 1 }, { t: tStop - E, f: gain(field) }, { t: tStop + E, f: stop ? gain(B.stopDb) : 1 }, { t: tLine - E, f: stop ? gain(B.stopDb) : 1 }, { t: tLine + E / 4, f: 1 }],
        ...(lead ? { by: lead } : {}) });
      if (field) said.push({ text: `the field rising ${field} dB with it`, ...(lead ? { by: lead } : {}) });
    }
    if (o.crash !== false && I.can.crash && !I.gestured(line)) { moves.crashes.push({ bar: line, ...(lead ? { by: lead } : {}) }); said.push({ text: `a crash on ${line}`, crash: line }); }
    return { said, lead, row };
  };

  // **An out is marked** (U2b; his ear 10-13 on the Dubstep spell's: "not bad, but cheap, need some drum filling, more
  // accurate bass lift … otherwise it actually sounds like bass machine got a glitch while other tracks were keep
  // going"): the build and the drop into its line (U2c; into a break without the stop and the crash, the cooldown's tops
  // thinning where they may), the lift (the bass's own glide where its voice glides, a reverse swell where the glue carries
  // one, or the gesture already landing there), the low-pass cut at its start and opening with the build
  const O = R.outs;
  // an out is taken only where something marks it (the review of U2c: 29 of 629 outs were bare, a build bar with no
  // drums and an arrangement's own filter line over it — the "glitch" he named): a build, the tops, or a dip
  const markable = (from: number, to: number, intoBreak: boolean) => {
    return !!laneAt(to - 1) || (intoBreak && topsMayThin(from, to - 1)) || !I.filterMoves?.(from, to);
  };
  const markOut = (out: SubSection, from: number, to: number, into: 'drop' | 'return' | 'break', kind: string): { m: Pick<Out, 'fill' | 'ack'>; said: Said[] } => {
    const last = to - 1;
    const rng = new Rng(`${I.seed}::phrasing:mark:${to}`);
    const tops = into === 'break' && topsMayThin(from, last);
    const b = rng.chance(O.fill) ? buildInto(to, kind, { rng, filter: tops ? undefined : O.dip.hz, filterFrom: from * bs, bass: false,
      ...(into === 'break' ? { stop: false, crash: false, hold: true } : {}) }) : null;
    const said: Said[] = [...(b?.said ?? [])];
    if (into !== 'break' && I.can.glide && I.kit(to).bass) {
      const g = { bar: to, beats: O.lift.beats[into], semitones: O.lift.semitones, by: out };
      moves.glides.push(g);
      said.push({ text: 'the bass gliding up into it', glide: g });
    }
    if (I.gestured(to)) said.push({ text: 'the gesture landing there' });
    else if (swellInto(to, O.lift.swellBeats[into], O.lift.swellGain, out)) said.push({ text: 'a reverse swell into it', swell: to });
    if (tops) {
      const t = sub('switch-up', TOPS_THIN, from, last - from, `the tops thin ${from}-${last - 1}, the cooldown's`);
      subs.push(t);
      said.push({ text: 'the tops thinning across it', by: t });
    } else if (!b) {
      const dip = into === 'break' ? { a: from * bs, b: from * bs + B.cutS, c: (to - 0.05) * bs, d: (to - 0.05) * bs, hz: O.dip.hz, hold: true, by: out }
        : { a: from * bs, b: from * bs + B.cutS, c: last * bs + 8 * s16, d: last * bs + B.stopStep * s16, hz: O.dip.hz, by: out };
      moves.dips.push(dip);
      said.push({ text: `the low-pass cut to ${O.dip.hz} Hz across it`, dip });
    }
    return { m: { fill: b?.row?.id ?? null, ack: tops ? 'tops' : 'dip' }, said };
  };

  // ----- the cooldowns: a main's end into a break, declared, the bass out across it -----
  const C = R.cooldown;
  const coolFrom = new Map<number, number>();
  for (const s of sections) {
    const next = sections.find((x) => x.startBar === s.startBar + s.bars);
    if (!R.segments.sections.includes(s.kind) || next?.kind !== 'breakdown') continue;
    const rng = new Rng(`${I.seed}::phrasing:cool:${s.index}`);
    const longest = Math.max(...Object.keys(C.phrases).map(Number));
    const w: W = Object.fromEntries(Object.entries(C.phrases).map(([k, x]) => [k, Number(k) === longest ? x * leanOf(R, { loom: C.lean.loom }, I.spell) : x]));
    const n = Math.min(Math.floor(s.bars / 2), Math.max(1, Math.round(Number(weighted(rng, w)) * L)));
    const end = s.startBar + s.bars, from = end - n;
    coolFrom.set(s.index, from);
    cooldowns.push({ from, to: end, label: `the cooldown into the break at ${end} (${from}-${end - 1})` });
    const keep = weighted(rng, { out: 100 - C.keep, keep: C.keep * leanOf(R, { root: C.lean.root }, I.spell) }) === 'keep';
    // never a hole: the bass leaves only where the harmony or the hats hold the space without it (§1.7, the guards' hole),
    // and never over a bar the house's own small things mark (a drop-out of theirs on the main's last bar is the way out)
    // ...and where no drum can fill its last bar (a track row's own drums), the bass leaves for that bar alone (U2b)
    const o0 = fillable(end - 1) ? from : end - 1;
    if (!keep && editable('bassline') && free(from, end) && every(o0, end, bassMayLeave) && I.kit(end - 1).drums && markable(o0, end, true)) {
      take(from, end);
      const out = sub('drop-out', BASS_OUT, o0, end - o0, 'bass out (the cooldown)');
      subs.push(out);
      const { m, said: sd } = markOut(out, o0, end, 'break', s.kind);
      const o: Out = { from: o0, to: end, into: 'break', label: '', ...m };
      notes.push({ out: o, head: `the bass out ${o0 === from ? 'across the cooldown' : `over the cooldown's last bar`} into the break at ${end}`, said: sd, tail: '' });
      outs.push(o);
    }
  }

  // ----- the sub-segments inside a long main -----
  const S = R.segments;
  const longAt = Math.min(S.longBars, S.longMostS / bs);
  const rate = leanOf(R, S.lean, I.spell);
  const span = Math.min(L - 1, Math.max(S.leastBars, Math.round(S.spanPhrases * L)));
  for (const s of sections) {
    if (!S.sections.includes(s.kind) || !(s.bars > longAt) || span < 1) continue;
    const end = s.startBar + s.bars, cool = coolFrom.get(s.index) ?? end;
    const phrases = I.map.phrases.filter((p) => p.from >= s.startBar && p.to <= end && p.to - p.from === L);
    const candidates = phrases.filter((p) => p.from > s.startBar && p.to < end && p.to <= cool && !!S.byFunction[p.fn]);
    if (!candidates.length) continue;
    const r = new Rng(`${I.seed}::phrasing:${s.index}`);
    const order = candidates.map((p) => ({ p, k: r.next() })).sort((a, b) => a.k - b.k).map((x) => x.p);
    const want = Math.max(1, Math.round((s.bars * bs / S.everyS) * rate));
    const chosen: number[] = [];
    for (const p of order) {
      if (chosen.length >= want) break;
      if (chosen.some((f) => Math.abs(f - p.from) < (1 + S.spacingPhrases) * L)) continue;
      const rng = new Rng(`${I.seed}::phrasing:${s.index}:${p.from}`);
      const last = p.to - 1;
      const fills = rowsOf('fill', s.kind);
      const drops = rowsOf('drop-out', s.kind, dropsBar);
      // what the kit admits at this phrase's end, each kind by its needs
      const admits: Record<SegmentKind, boolean> = {
        'breakdown-lite': editable('kick') && every(p.to - span, p.to, (k) => k.kick),
        'half-time': I.four && editable('kick') && every(p.to - span, p.to, (k) => k.kick),
        filtered: every(p.to - span, p.to, (k) => k.drums || k.bass),
        'drop-out': I.kit(last).drums && drops.some((r) => leaves(r, last)),
        fill: ((editable('backbeat') && I.kit(last).backbeat) || (editable('kick') && I.kit(last).kick)) && fills.length > 0,
      };
      // a kind the main already played is drawn at `recent` of its weight, so a long main changes its gesture
      const w = Object.fromEntries(Object.entries(S.byFunction[p.fn]).filter(([k]) => admits[k as SegmentKind])
        .map(([k, x]) => [k, segments.some((g) => g.kind === k && g.from >= s.startBar && g.to <= end) ? x * S.recent : x]));
      const kind = weighted(rng, w) as SegmentKind | null;
      if (!kind) continue;
      const n = kind === 'drop-out' || kind === 'fill' ? 1 : span;
      const from = p.to - n;
      if (!free(from, p.to)) continue;
      // the re-entry's fill drawn as it was (its die kept), played as the build (U2c)
      const reentry = n > 1 && rng.chance(S.reentryFill[kind] ?? 0) && ((editable('backbeat') && I.kit(last).backbeat) || (editable('kick') && I.kit(last).kick)) ? drawRow(rng, fills) : null;
      const where = `${from}-${p.to - 1}`;
      const k = I.kit(last);
      // where a track row owns the drums the other voices answer the more
      const ownDrums = !((editable('backbeat') && k.backbeat) || (editable('kick') && k.kick));
      let label: string, built: ReturnType<typeof buildInto> | null = null;
      if (kind === 'breakdown-lite') {
        subs.push(sub('switch-up', BREAKDOWN_LITE, from, last - from, `breakdown-lite ${where}`));
        built = buildInto(p.to, s.kind, { rng, row: reentry ?? undefined, bass: false });
        label = `breakdown-lite ${where}: the kick, the backbeat and the tops out, the bed exposed`;
      } else if (kind === 'half-time') {
        subs.push(sub('switch-up', HALF_TIME, from, last - from, `half-time ${where}`));
        built = buildInto(p.to, s.kind, { rng, row: reentry ?? undefined, filter: S.halfTime.hz, field: B.fieldDb });
        label = `half-time phrase ${where}: the kick on one and three-and, the backbeat on three`;
      } else if (kind === 'filtered') {
        // the low-pass cut closed at the phrase's start (a cut, never a fade), the tops thinning under it
        const thin = topsMayThin(from, last) ? sub('switch-up', TOPS_THIN, from, last - from, `the tops thin ${from}-${last - 1}`) : null;
        if (thin) subs.push(thin);
        built = buildInto(p.to, s.kind, { rng, row: reentry ?? undefined, filter: S.filter.hz, filterFrom: from * bs, field: ownDrums ? B.heldFieldDb : B.fieldDb });
        if (thin) built.said.unshift({ text: 'the tops thin', by: thin });
        if (swellInto(p.to, S.filter.swellBeats, S.filter.swellGain)) built.said.push({ text: `a reverse swell into ${p.to}`, swell: p.to });
        label = `filtered phrase ${where}`;
      } else if (kind === 'fill') {
        built = buildInto(p.to, s.kind, { rng, bass: false });
        label = `a fill into the line at ${p.to}`;
      } else {
        const row = drawRow(rng, drops.filter((r) => leaves(r, last)))!;
        subs.push(sub(kind, row, last, 1, `${row.name} ${last}`));
        label = `a drop-out bar (${row.name}) at ${last}, the groove back on ${p.to}`;
        const said: Said[] = [];
        // a row's own drums stop on the last beat over it, so the drums lead the bar out too
        if (ownDrums && (k.kick || k.backbeat)) {
          const st = sub('drop-out', stopFrom(B.stopBeatStep), last, 1, `the stop ${last}, over the row's drums`);
          st.overlay = true;
          subs.push(st);
          said.push({ text: 'the drums stopping on the last beat', by: st });
        }
        if (I.can.crash && !I.gestured(p.to)) { moves.crashes.push({ bar: p.to }); said.push({ text: `a crash on ${p.to}`, crash: p.to }); }
        built = { said, lead: null, row: null };
      }
      take(from, p.to);
      chosen.push(p.from);
      const seg: Segment = { kind, from, to: p.to, fn: p.fn, label, reentry: built.row?.id ?? null };
      notes.push({ segment: seg, head: label, said: built.said, tail: '' });
      segments.push(seg);
    }
  }

  // ----- the bass out before a drop and a return -----
  for (const a of I.map.arrivals) {
    if (a.by !== 'section' || a.bar < 2) continue;
    const here = sectionAt(a.bar), before = sectionAt(a.bar - 1);
    if (!here || !before) continue;
    const into = here.kind === 'drop' ? 'drop' : (here.kind === 'main' || here.kind === 'groove') && ['breakdown', 'build', 'drop'].includes(before.kind) ? 'return' : null;
    if (!into || !editable('bassline') || !I.kit(a.bar - 1).bass || !I.kit(a.bar).bass) continue;
    const rng = new Rng(`${I.seed}::phrasing:out:${a.bar}`);
    const w: W = Object.fromEntries(Object.entries(R.outs.into[into]).map(([k, x]) => [k, k === '0' ? x * leanOf(R, R.outs.lean, I.spell) : x]));
    const sec = Number(weighted(rng, w) ?? 0);
    if (!sec) continue;
    // where no drum can fill its last bar (a track row's own drums, no free sixteenths), the gap is a bar at most: a
    // breath the lift and the dip carry, never bars of a line gone while everything else plays on (U2b, his ear 10-13)
    const n = Math.min(Math.floor(before.bars / 2), Math.max(1, Math.round(sec / bs)), fillable(a.bar - 1) ? Infinity : 1);
    const from = a.bar - n;
    if (n < 1 || !free(from, a.bar) || !every(from, a.bar, bassMayLeave) || !markable(from, a.bar, false)) continue;
    take(from, a.bar);
    const out = sub('drop-out', BASS_OUT, from, n, `bass out before ${a.bar}`);
    subs.push(out);
    const { m, said: sd } = markOut(out, from, a.bar, into, before.kind);
    const o: Out = { from, to: a.bar, into, label: '', ...m };
    notes.push({ out: o, head: `the bass out ${n} bar${n > 1 ? 's' : ''} before the ${into === 'drop' ? 'drop' : 'return'} at ${a.bar}, back with it`, said: sd, tail: '' });
    outs.push(o);
  }

  // ----- the drums answering the structural arrivals -----
  const A = R.answers;
  let lastAnswer = -Infinity;
  for (const a of I.map.arrivals) {
    if (a.bar < 1 || a.bar >= I.bars || a.bar - lastAnswer < A.spacingPhrases * L) continue;
    const into = sectionAt(a.bar)?.kind ?? 'outro';
    // the drums play into it (the groove's own lanes: a pickup's sixteenths before it are a part's, not the groove), and
    // no gesture stands there already (a lead-in, a section's impact)
    if (!I.kit(a.bar - 1).drums || I.gestured(a.bar)) continue;
    // the groove's first bar out of the intro takes no breath and no swell (a stumble on the bar the groove starts, the
    // review of U2): a crash there, the DJ's landing, or nothing
    const fromIntro = sectionAt(a.bar - 1)?.kind === 'intro';
    const ok: Record<string, boolean> = { crash: I.can.crash, reverse: I.can.reverse && !fromIntro,
      hatsBreathe: into !== 'breakdown' && !fromIntro && editable('offbeat') && I.kit(a.bar).earlyHats };
    const w: W = Object.fromEntries(Object.entries(A.weights).filter(([k]) => k.split('+').every((x) => ok[x])));
    const pick = weighted(new Rng(`${I.seed}::phrasing:answer:${a.bar}`), w);
    if (!pick) continue;
    lastAnswer = a.bar;
    const field = into === 'breakdown' ? 0 : into === 'drop' ? A.fieldDbDrop : A.fieldDb;
    answers.push({ bar: a.bar, by: a.by, into, parts: pick.split('+'), field,
      label: `the drums answer the ${a.by === 'section' ? `${into} at` : a.by === 'progression' ? 'progression\'s arrival at' : 'landing at'} ${a.bar}: ${pick.replace(/\+/g, ', ')}${field ? `, the field ${field} dB into it` : ''}` });
  }

  // a dip opening within half a bar of the next one's cut is held closed into it (the review of U2c: a filtered phrase's
  // re-entry into a cooldown opened to 15 kHz and was cut to 2.5 kHz 50 ms later)
  moves.dips.sort((x, y) => x.a - y.a);
  for (let i = 0; i + 1 < moves.dips.length; i++) {
    const cur = moves.dips[i], next = moves.dips[i + 1];
    if (!cur.hold && next.a >= cur.b && next.a - cur.d < bs / 2) { cur.reopen = { c: cur.c, d: cur.d }; cur.into = next; cur.hold = true; cur.c = cur.d = next.a; }
  }
  return { phrasing: summarised({ segments, answers, outs, cooldowns }), subs: subs.sort((a, b) => a.startBar - b.startBar || b.bars - a.bars), moves, notes };
}

/** The pass's one line, for the readout. */
export function summarised(P: Omit<Phrasing, 'summary'>): Phrasing {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const segments = [...P.segments].sort((a, b) => a.from - b.from);
  return { ...P, segments, summary: `phrasing: ${n(segments.length, 'sub-segment')}${segments.length ? ` (${segments.map((x) => `${x.kind} ${x.from}-${x.to - 1}`).join(', ')})` : ''}, `
    + `${n(P.answers.length, 'arrival')} answered, ${n(P.outs.length, 'bass out')}, ${n(P.cooldowns.length, 'cooldown')}` };
}

/**
 * **A curve with a bump multiplied in** (the automation's points, in theme seconds): ×1 at `a`, rising linearly to ×`peak`
 * at `b`, held to `c`, back to ×1 at `d`; every point inside keeps its own shape under the factor, and the curve's value
 * at each corner is read off its own line, so outside `[a, d]` nothing moves.
 */
export function bumpCurve(points: Array<{ t: number; value: number }>, a: number, b: number, c: number, d: number, peak: number): Array<{ t: number; value: number }> {
  if (!(d > a) || peak === 1) return points;
  const valueAt = (t: number) => {
    let prev = points[0];
    if (!prev || t <= prev.t) return prev?.value ?? 1;
    for (const p of points) { if (p.t >= t) return prev.t === p.t ? p.value : prev.value + (p.value - prev.value) * (t - prev.t) / (p.t - prev.t); prev = p; }
    return prev.value;
  };
  const factor = (t: number) => (t <= a || t >= d ? 1 : t < b ? 1 + (peak - 1) * (t - a) / Math.max(1e-9, b - a) : t <= c ? peak : 1 + (peak - 1) * (d - t) / Math.max(1e-9, d - c));
  const corners = [a, b, c, d].filter((t, i, xs) => xs.indexOf(t) === i).map((t) => ({ t, value: valueAt(t) }));
  const out = [...points.map((p) => ({ ...p })), ...corners.filter((q) => !points.some((p) => Math.abs(p.t - q.t) < 1e-9))]
    .sort((x, y) => x.t - y.t)
    .map((p) => ({ t: p.t, value: +(p.value * factor(p.t)).toFixed(4) }));
  return out;
}

/**
 * **A curve multiplied by factors at knots** (U2c: a build's rise, its stop, back on the line): the factor runs straight
 * between the knots and is one outside them; each knot is a point of the curve (its own value there, read off its line).
 */
export function factorCurve(points: Array<{ t: number; value: number }>, knots: ReadonlyArray<{ t: number; f: number }>): Array<{ t: number; value: number }> {
  if (knots.length < 2) return points;
  const a = knots[0].t, z = knots[knots.length - 1].t;
  const valueAt = (t: number) => {
    let prev = points[0];
    if (!prev || t <= prev.t) return prev?.value ?? 1;
    for (const p of points) { if (p.t >= t) return prev.t === p.t ? p.value : prev.value + (p.value - prev.value) * (t - prev.t) / (p.t - prev.t); prev = p; }
    return prev.value;
  };
  const factor = (t: number) => {
    if (t <= a || t >= z) return 1;
    for (let i = 1; i < knots.length; i++) if (t <= knots[i].t) { const k0 = knots[i - 1], k1 = knots[i]; return k0.f + (k1.f - k0.f) * (t - k0.t) / Math.max(1e-9, k1.t - k0.t); }
    return 1;
  };
  const extra = knots.filter((k) => !points.some((p) => Math.abs(p.t - k.t) < 1e-9)).map((k) => ({ t: k.t, value: valueAt(k.t) }));
  return [...points.map((p) => ({ ...p })), ...extra].sort((x, y) => x.t - y.t).map((p) => ({ t: p.t, value: +(p.value * factor(p.t)).toFixed(4) }));
}

/**
 * **A filtered phrase on the master's low-pass**: from `a` the line closes to `hz` by `b`, holds there, and opens from
 * `c` back to its own value at `d`; the points between `a` and `d` are the dip's, the rest the curve's own. With `c` at
 * `b` there is no hold: the line closes to `b` and opens from there.
 */
export function dipCurve(points: Array<{ t: number; value: number }>, a: number, b: number, c: number, d: number, hz: number, hold = false): Array<{ t: number; value: number }> {
  if (!(d > a)) return points;
  const valueAt = (t: number) => {
    let prev = points[0];
    if (!prev || t <= prev.t) return prev?.value ?? hz;
    for (const p of points) { if (p.t >= t) return prev.t === p.t ? p.value : prev.value + (p.value - prev.value) * (t - prev.t) / (p.t - prev.t); prev = p; }
    return prev.value;
  };
  const v0 = valueAt(a), v1 = valueAt(d);
  const close = Math.min(hz, v0), open = Math.min(hz, v1);
  // a dip with no hold (the close's end its opening's start: a half-time phrase's fade, U2b) has one corner there
  // held, the line stays closed to `d` and the curve's own next point takes it from there (a cooldown into its break)
  if (hold) return [...points.filter((p) => p.t < a - 1e-9 || p.t > d + 1e-9), { t: a, value: v0 }, { t: b, value: close }, ...(d > b + 1e-9 ? [{ t: d, value: close }] : [])]
    .sort((x, y) => x.t - y.t);
  return [...points.filter((p) => p.t < a - 1e-9 || p.t > d + 1e-9), { t: a, value: v0 }, { t: b, value: close }, ...(c > b + 1e-9 ? [{ t: c, value: open }] : []), { t: d, value: v1 }]
    .sort((x, y) => x.t - y.t);
}

/** The row's faults: every vocabulary entry well formed, every segment kind and answer part known, every weight a number. */
export function phrasingFaults(row: PhrasingRow): string[] {
  const bad: string[] = [];
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  for (const [id, e] of Object.entries(row.vocabulary?.entries ?? {})) {
    if (!Array.isArray(e.destinations) || !Array.isArray(e.needs) || !Array.isArray(e.producer)) bad.push(`vocabulary ${id}: destinations, needs and producer are lists`);
    if (e.house !== null && !/^(treatment|answer|segment):[a-zA-Z-]+$|^out$/.test(e.house)) bad.push(`vocabulary ${id}: house ${e.house} is not a treatment, an answer, a segment or the out`);
    if (e.house?.startsWith('segment:') && !SEGMENT_KINDS.includes(e.house.slice(8) as SegmentKind)) bad.push(`vocabulary ${id}: no segment ${e.house}`);
  }
  for (const [fn, w] of Object.entries(row.segments.byFunction)) for (const [k, x] of Object.entries(w)) {
    if (!SEGMENT_KINDS.includes(k as SegmentKind)) bad.push(`segments.byFunction.${fn}: no kind ${k}`);
    if (!num(x) || x < 0) bad.push(`segments.byFunction.${fn}.${k}: ${x}`);
  }
  for (const k of Object.keys(row.answers.weights)) for (const part of k.split('+')) if (!['crash', 'reverse', 'hatsBreathe'].includes(part)) bad.push(`answers.weights: no part ${part}`);
  for (const [into, w] of Object.entries(row.outs.into)) for (const [k, x] of Object.entries(w)) if (!num(Number(k)) || !num(x)) bad.push(`outs.into.${into}.${k}: ${x}`);
  for (const [k, x] of Object.entries(row.cooldown.phrases)) if (!(Number(k) > 0) || !num(x)) bad.push(`cooldown.phrases.${k}: ${x}`);
  for (const k of [...Object.keys(row.segments.lean), ...Object.keys(row.outs.lean), ...Object.keys(row.cooldown.lean)]) if (typeof row.centre[k] !== 'number') bad.push(`a lean on ${k} with no centre`);
  return bad;
}
{
  const bad = Object.values(PHRASING_ROWS).flatMap(phrasingFaults);
  if (bad.length) throw new Error(`the phrasing rows: ${bad.join('; ')}`);
}
