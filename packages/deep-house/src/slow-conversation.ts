// **Struck voices in slow conversation** (PLAN-AMBIENT Phase 1, ambient-bells, 10-17; his words: *"something
// acoustical like bells slow conversation with hint of percussion ... keep existing cool mixes while adding more
// variety and approaches to ambient domain"*). A composer mechanism that knows a row, the theme's sections, its key and
// its chords, never a genre; a place table says where it plays (`CONVERSATION` in `styles/deep-house-places.ts`), and
// the place holds off the lanes it replaces (the pad, the sub and the keys' figure), so what is heard is the row.
//
// **The music, as a producer hears it.** A ground that is struck and rings: a singing bowl on the tonic or the fifth,
// struck every 10-24 s and ringing some 40 s, so the room is never silent and never a pad, and closer in the chapters
// where nobody talks. Over it two voices talk. A caller strikes one to three notes of the key's pentatonic, starting on
// a tone of the chord that holds (and not where the last call started), softer the higher it goes; a breath of 3-8 s;
// then an answerer, in another voice, answers, softer than the call: the call's contour echoed from a tone of the chord
// over or under where the call began, mirrored from where it stopped, or completed to the tonic or the fifth (down
// after a call that rose, up after one that fell, home to the tonic where the section closes) — and sometimes the
// question is left open and only the ground answers. An answer the last few exchanges already said is said another
// way; the theme's first answer may come back as its last word. Then a long rest of 10-32 s. The ground gives way to
// the talk: a strike that would fall inside an exchange moves a breath before its call or after its answer. A hand
// marks a phrase now and then (a round low woodblock, a frame drum under a muted hand, a soft shaker: a hint, never a
// strike, some 12 dB under the answer), between the call and the answer or after it, at most once an exchange and
// never on a strike. The chapters are the section kinds: the intro and the outro are the
// ground alone (its last strike some seconds before the end, so it dies out), the grooves the exchanges, the
// breakdown the answerer alone now and then and sometimes a long silence over the ground.
//
// **Hierarchical draws, each off a stream of its own** (`<seed>::conversation:<what>`): the voices once a theme; the
// ground's strikes; each section's exchanges (`exchange:<section>`), each exchange's notes (`note:<section>:<n>`), the
// breakdown's line. Nothing here draws from another planner's stream, so every die the theme had is where it was.
// Where a rule can choose (the answer's way, its direction, the ground's give), a rule does, and no die is cast.
//
// **The room** the theme's die drew moves nothing here: the roles' levels were measured on the keys layer at the row's
// `keysDb`, and in a room whose keys stand elsewhere the whole conversation moves by the difference.
//
// **The birds** lean the row about the place's own birds (the one lean, `leanFactor`/`leanShift` in places.ts), so the
// place's tile plays the row's numbers exactly, each bird the thing its name promises, by the conventions of struck
// instruments (bells-birds, 10-18; his ask: "technically most compatible birds should influence sound"):
//   - **Root, the bells' size**: thin, a light composition of small bells (higher, shorter rings, quicker talk, a small
//     high bowl, quieter); the place's own, low and high bells; full, great bells (a great temple bell two octaves under
//     the call with its slow beating, the temple bell answering, a large low bowl, strikes rarer, calls of one note);
//   - **Veil, the count**: how many strikes and how far apart (the rests and the ground's gaps), and how often the call
//     and the answer change hands across sections;
//   - **Ember, the pulse**: free time under the place (later strikes), the grid's eighth and beat over it, and a soft
//     heartbeat on each bar's one at its top, before the kit takes the pulse over (the drums come on over 0.18);
//   - **Tide, the space**: the sends, the width between the caller and the answerer, the hall's tail;
//   - **Zephyr, the timbre**: the caller's and the answerer's voices, and the strike's hardness (its top, not its level);
//   - **Gleam, the light**: the call's targets toward the third and the seventh, and how often the ground leaves the tonic;
//   - **Spark, the movement**: the hand's chance, the share of three-note calls, the answer's liveliness;
//   - **Loom, the form**: the rests longer, the memory, the theme's first answer returning, the breakdown's silence (at
//     its low end a loop: no memory and no return).
//
// **Time**: every rest and gap is in seconds, placed on the theme's sixteenths with a little lateness, so the plan's
// bars and steps say where a strike falls and its seconds say when.

import { Rng } from './rng.ts';
import { leanFactor, leanShift, type BirdLeans } from './places.ts';
import { airAbout, airDraw, voiceAir } from './air-lean.ts';
import { dbToGain } from '@deep-house/engine/dsp';
import { BIRDS, HOUSE, type Spell } from './spell.ts';
import CONVERSATION_FILE from '../recipes/ambient/conversation.json' with { type: 'json' };

type Range = [number, number];
type Pairs<T> = Array<[T, number]>;
/**
 * A role's voice: its weight, a level of its own beside the role's where it sits louder or softer alone, and `oct`, the
 * octaves it sounds the role's pitches at (a great bell's hum two octaves under where a small bell would ring them).
 */
/**
 * A role's voice: its weight, its `db` alone, the octaves it sounds at, and `hardGain`, its own power on Zephyr's hardness
 * where the row's would leave its hardest strike peakier than its own (`ConversationRow.hardGain`; set by rendering the
 * strike alone at the place and at the hardness's ends)
 */
export interface RoleVoice { v: string; w: number; db?: number; oct?: number; hardGain?: number }
export type AnswerKind = 'echo' | 'invert' | 'complete' | 'open';
export type Chapter = 'ground' | 'exchanges' | 'answerer';
/**
 * **A pole of the bells' size** (bells-birds, 10-18): what a composition of small bells (`small`) or of great ones
 * (`large`) is, each number reached at the pole and leaned linearly from the place's own size (nought) toward it.
 * `caller`, `answerer`, `ground`: semitones the role's register moves; `groundDb`: the ground's level; `rest`, `every`,
 * `gaps`, `after`: log factors on the rest after an exchange, the ground's gap, a call's notes' gaps and the breath
 * before the answer; `notes`: log factors on a call's count of notes.
 */
export interface SizePole {
  caller?: number; answerer?: number; ground?: number; groundDb?: number; rest?: number; every?: number; gaps?: number; after?: number;
  /** whole rings the ground's `ringsMost` moves by (rounded), toward the pole: a great bell's long rings need room */
  ringsMost?: number;
  notes?: Record<string, number>;
  /**
   * `voice`: the pole's own caller and answerer, which take the theme's drawn ones over with a chance that grows with
   * the size (`curve`'s), each on a die of its own, so a drag toward the pole hands a voice over once and never back
   */
  voice?: { caller?: string; answerer?: string };
  /** how the pole is reached: |size| to this power (2: the middle still the place's own, the pole only near the end) */
  curve?: number;
}
export interface ConversationRow {
  id: string;
  /** the indexes of the theme's scale the conversation strikes: its pentatonic subset */
  scale: number[];
  degrees: Record<string, string>;
  lateMs: Range;
  /** the conversation's whole level over its roles' (dB): where the place's windows measure at nought */
  mixDb: number;
  /**
   * the keys layer's room level (dB) the roles' levels and `mixDb` were measured on: in a room the die draws whose
   * keys stand elsewhere, the whole conversation moves by the difference, so the place's level is its own in any room
   */
  keysDb: number;
  /** the most oscillators its strikes run at once (the phone's ceiling for long rings, PLAN-AMBIENT §6.1) */
  oscillatorsMost: number;
  /** no strike of another part within this of a strike (s) */
  clearS: number;
  /**
   * `ringsMost`: the ground's strikes ringing at once, at most (a strike waits for the oldest ring to end); `pace`: the
   * gap's factor by chapter (closer where nobody talks); `yieldS`: the breath a strike that gives way to the talk
   * leaves before the call or after the answer; `touch`: how much softer a strike is for what still rings of its own
   * pitch (each ring counted by what is left of it, a ring falling 60 dB over its length); `dbFrom`, `dbByOctave` and
   * `dbTo`: the level by register, falling by `dbByOctave` an octave from `dbFrom` up to `dbTo` and held there (MIDI
   * numbers; zones-pilot-2 and -3, measured alone on the keys' floor: the struck bowl reads 4.8 LU louder at F#3 than at
   * G2 and rises no further, level to A3 and a decibel under from B3 to C#4, so a theme whose key put the bowl at the top
   * of its register stood two LU over the place and its strikes 3-4 dB into the limiter)
   */
  ground: { voices: RoleVoice[]; degrees: Pairs<number>; register: Range; everyS: Range; ringShare: number; ringsMost: number; firstS: Range; apartS: number; lastS: number;
    pace: Partial<Record<Chapter, number>>; yieldS: Range; touch: number; vel: Range; levelDb: number; reverb: number; delay: number; pan: Range;
    dbFrom?: number; dbByOctave?: number; dbTo?: number;
    /** Gleam's light on the ground: log factors per unit of `leave` on the tonic's weight and the others', and degrees it adds */
    leave?: { tonic: number; others: number; add: Pairs<number> } };
  /**
   * `restartW`: the weight of a start on the pitch the last call started on (under one, the call leans off it);
   * `velFrom` and `velByOctave`: the touch by register, the velocity's factor falling by `velByOctave` an octave over
   * `velFrom` (a struck voice's top is its loudest and brightest)
   */
  caller: { voices: RoleVoice[]; register: Range; notes: Pairs<number>; contours: Record<string, Array<[number[], number]>>; targets: Record<string, number>;
    restartW: number; gapS: Range; vel: Range; velFrom: number; velByOctave: number; fade: number; dur: Range; levelDb: number; reverb: number; delay: number; pan: Range };
  /** `memory`: the exchanges an answer's figure is remembered for (not said again inside them); `recall`: the theme's first answer may be its last */
  answerer: { voices: RoleVoice[]; register: Range; kinds: Pairs<AnswerKind>; memory: number; recall: boolean; afterS: Range; gapMul: number; velMul: number; levelDb: number; dur: Range;
    reverb: number; delay: number; pan: Range;
    /** Spark's liveliness in the answer's rhythm: `quicker` and `slower` its gaps' factor per unit, `lilt` its short-long */
    lively?: { quicker: number; slower: number; lilt: number } };
  exchange: { entryS: Range; restS: Range; endS: number };
  /**
   * **The pulse** (Ember, bells-birds): `freeLate`, how much later a strike may fall on the free side (its lateness's
   * factor at the bird's free end); `grid`, the strikes' grid in sixteenths from a pulse up (an eighth, then a beat);
   * the heartbeat from `from` up, a soft stroke on each bar's one, in one of `voices` (the hand's own where it is one), `levelDb` against the hand's footing, never where the theme's kit
   * plays (the kit is then the pulse)
   */
  pulse?: { freeLate: number; grid: Array<[number, number]>; from: number; voices: string[]; vel: Range; levelDb: number };
  /**
   * **The count** (Veil, bells-birds): log factors per unit of the `count` lean on the rest after an exchange (and the
   * breakdown's gaps, which the rest's factor moves) and on the ground's gap: how many strikes, and how far apart; `db`
   * per unit of a busier count on every strike (a player's touch lightens as the talk crowds, and the rings sum);
   * `floor` and `groundFloor`, the least the rests' and the ground gap's factors reach with every bird together
   */
  count?: { rest: number; ground: number; db?: number; floor?: number; groundFloor?: number };
  /**
   * **The still end** (Spark, bells-birds; his call of 10-18, "shavasana is part of bells zone"): per unit of `still`
   * (one at Spark nought, nought from the place's own Spark up), log factors on the rests and the ground's gaps, the
   * ground's dB, and the hand's chance's share lost: toward bowls alone, fewer calls, no hand, the ground carrying more
   */
  still?: { rest: number; ground: number; groundDb: number; hand: number };
  punctuation: { voices: RoleVoice[]; chance: number; where: Pairs<'between' | 'after'>; afterS: Range; vel: Range; levelDb: number; reverb: number; delay: number; pan: Range };
  breakdown: { everyS: Range; firstS: Range; steps: Pairs<number>; velMul: number; silence: { chance: number; s: Range } };
  chapters: Record<string, Chapter>;
  /** the most |pan| Tide's width takes the caller and the answerer to */
  widthMost?: number;
  /** Zephyr's hardness: the gain moves by (vel / hardened vel) to this power (1 holds the fundamental's level) */
  hardGain?: number;
  /** the bells' size at its two poles, reached by the `size` knob's lean (-1 small, +1 large; nought the place's own) */
  size?: { small: SizePole; large: SizePole };
  birds: { by: BirdLeans['by']; most?: BirdLeans['most']; ends?: BirdLeans['ends'] };
  budget: { fallbacks: string[] };
}

const ROWS = CONVERSATION_FILE.rows as unknown as ConversationRow[];
export const CONVERSATION_ROWS: readonly ConversationRow[] = Object.freeze(ROWS);
export const conversationRowOf = (id: string | null | undefined): ConversationRow | null => (id ? ROWS.find((r) => r.id === id) ?? null : null);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const range = (v: unknown, lo = -Infinity, hi = Infinity): boolean => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] <= v[1] && v[0] >= lo && v[1] <= hi;
const pairs = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every((x) => Array.isArray(x) && x.length === 2 && finite(x[1]) && x[1] >= 0) && (v as Array<[unknown, number]>).some((x) => x[1] > 0);

/** Everything wrong with the conversation rows, as sentences; `voiceExists` is the engine's word on a voice. */
export function conversationRowsFaults(voiceExists: (v: string) => boolean = () => true): string[] {
  const bad: string[] = [];
  for (const r of ROWS) {
    const at = (what: string) => `${r.id}: ${what}`;
    const voices = (role: string, list: RoleVoice[]) => {
      if (!Array.isArray(list) || !list.some((x) => x.w > 0)) bad.push(at(`${role} draws no voice`));
      for (const x of list ?? []) {
        if (!voiceExists(x.v)) bad.push(at(`${role}: ${x.v} is no voice`));
        if (!(x.w >= 0)) bad.push(at(`${role}: ${x.v} weighs ${x.w}`));
        if (x.db !== undefined && !(finite(x.db) && Math.abs(x.db) <= 18)) bad.push(at(`${role}: ${x.v}'s db within 18`));
        if (x.oct !== undefined && !(Number.isInteger(x.oct) && Math.abs(x.oct) <= 2)) bad.push(at(`${role}: ${x.v}'s oct a whole number of octaves, two at most`));
        if (x.hardGain !== undefined && !(finite(x.hardGain) && x.hardGain >= 1 && x.hardGain <= 4)) bad.push(at(`${role}: ${x.v}'s hardGain within 1-4`));
      }
    };
    voices('ground', r.ground.voices); voices('caller', r.caller.voices); voices('answerer', r.answerer.voices); voices('punctuation', r.punctuation.voices);
    if (!r.scale.length || r.scale.some((i) => !Number.isInteger(i) || i < 0 || i > 6) || new Set(r.scale).size !== r.scale.length || r.scale[0] !== 0) bad.push(at('the scale is distinct indexes of a seven-note scale, the tonic first'));
    for (const [role, reg] of [['ground', r.ground.register], ['caller', r.caller.register], ['answerer', r.answerer.register]] as const)
      if (!range(reg, 24, 108) || reg[1] - reg[0] < 11) bad.push(at(`${role}'s register is an octave at least, so every degree has a pitch in it`));
    if (!pairs(r.ground.degrees) || r.ground.degrees.some(([d]) => !Number.isInteger(d) || d < 0 || d >= r.scale.length)) bad.push(at('the ground strikes degrees of the conversation\'s scale'));
    if (!range(r.ground.everyS, 4, 60) || !(r.ground.apartS > 0 && r.ground.apartS <= r.ground.everyS[0])) bad.push(at('the ground strikes every few seconds, never two closer than apartS'));
    if (!(r.ground.ringShare > 0 && r.ground.ringShare <= 1)) bad.push(at('the ground restrikes inside its ring (ringShare in (0, 1])'));
    if (!(Number.isInteger(r.ground.ringsMost) && r.ground.ringsMost >= 2 && r.ground.ringsMost <= 6)) bad.push(at('the ground rings two to six strikes at once at most'));
    if (!r.ground.pace || Object.entries(r.ground.pace).some(([c, f]) => !['ground', 'exchanges', 'answerer'].includes(c) || !(finite(f) && f >= 0.5 && f <= 1.5))) bad.push(at('the ground\'s pace a factor from 0.5 to 1.5 by chapter'));
    if (!range(r.ground.yieldS, 0.25, 6)) bad.push(at('the ground gives way to the talk by a breath of 0.25-6 s'));
    if (!(r.ground.touch >= 0 && r.ground.touch <= 1)) bad.push(at('the ground\'s touch in [0, 1]'));
    if (!(r.caller.restartW > 0 && r.caller.restartW <= 1)) bad.push(at('restartW in (0, 1]'));
    if ((r.ground.dbFrom !== undefined || r.ground.dbByOctave !== undefined) && !(finite(r.ground.dbFrom) && finite(r.ground.dbByOctave) && r.ground.dbByOctave! <= 0 && r.ground.dbByOctave! >= -8 && (r.ground.dbTo === undefined || (finite(r.ground.dbTo) && r.ground.dbTo > r.ground.dbFrom!)))) bad.push(at('the ground\'s level by register falls, by at most 8 dB an octave, from dbFrom up to a dbTo over it'));
    if (!(finite(r.caller.velFrom) && finite(r.caller.velByOctave) && r.caller.velByOctave <= 0 && r.caller.velByOctave >= -0.6)) bad.push(at('the call\'s touch by register falls, by at most 0.6 an octave'));
    if (!(Number.isInteger(r.answerer.memory) && r.answerer.memory >= 0 && r.answerer.memory <= 8) || typeof r.answerer.recall !== 'boolean') bad.push(at('the answer\'s memory 0-8 exchanges, its recall a yes or a no'));
    if (!pairs(r.caller.notes) || r.caller.notes.some(([n]) => !Number.isInteger(n) || n < 1 || n > 3)) bad.push(at('a call is one to three notes'));
    for (const [n] of r.caller.notes) {
      if (n === 1) continue;
      const c = r.caller.contours[String(n)];
      if (!Array.isArray(c) || !c.length || c.some(([shape, w]) => !Array.isArray(shape) || shape.length !== n || shape[0] !== 0 || !(w > 0) || shape.some((x) => !Number.isInteger(x) || Math.abs(x) > 4)))
        bad.push(at(`the ${n}-note contours start at nought and move at most four steps`));
    }
    for (const d of Object.keys(r.caller.targets)) if (!(Number(d) >= 0 && Number(d) < r.scale.length) || !(r.caller.targets[d] >= 0)) bad.push(at(`target ${d}`));
    if (!range(r.caller.gapS, 0.2, 4)) bad.push(at('a call\'s notes 0.2-4 s apart'));
    if (!pairs(r.answerer.kinds) || r.answerer.kinds.some(([k]) => !['echo', 'invert', 'complete', 'open'].includes(k))) bad.push(at('answer kinds echo, invert, complete or open'));
    if (!range(r.answerer.afterS, 1, 20)) bad.push(at('the answer 1-20 s after the call'));
    if (!(r.answerer.velMul > 0 && r.answerer.velMul <= 1)) bad.push(at('the answer no louder than the call (velMul in (0, 1])'));
    if (!range(r.exchange.restS, 3, 90)) bad.push(at('a rest of 3-90 s after an exchange'));
    if (!(r.punctuation.chance >= 0 && r.punctuation.chance <= 1)) bad.push(at('the hand\'s chance in [0, 1]'));
    if (!pairs(r.punctuation.where) || r.punctuation.where.some(([w]) => w !== 'between' && w !== 'after')) bad.push(at('the hand between or after'));
    if (!(r.clearS > 0)) bad.push(at('clearS above nought'));
    if (!(finite(r.mixDb) && Math.abs(r.mixDb) <= 24)) bad.push(at('mixDb within 24'));
    if (!(finite(r.keysDb) && r.keysDb <= 0 && r.keysDb >= -30)) bad.push(at('keysDb, the keys layer\'s level the row was measured on, from -30 to 0'));
    if (!(Number.isInteger(r.oscillatorsMost) && r.oscillatorsMost >= 16 && r.oscillatorsMost <= 64)) bad.push(at('oscillatorsMost a whole number from 16 to 64'));
    for (const [kind, c] of Object.entries(r.chapters)) if (!['ground', 'exchanges', 'answerer'].includes(c)) bad.push(at(`chapter ${kind}: ${c}`));
    // the bells' size: its poles' numbers in range, and every voice they name in its role's list
    for (const [name, P] of Object.entries(r.size ?? {}) as Array<[string, SizePole]>) {
      for (const k of ['caller', 'answerer', 'ground'] as const) if (P[k] !== undefined && !(finite(P[k]) && Math.abs(P[k]!) <= 12)) bad.push(at(`size.${name}.${k} within an octave`));
      for (const k of ['groundDb', 'rest', 'every', 'gaps', 'after'] as const) if (P[k] !== undefined && !(finite(P[k]) && Math.abs(P[k]!) <= (k === 'groundDb' ? 12 : 2))) bad.push(at(`size.${name}.${k} in range`));
      for (const n of Object.keys(P.notes ?? {})) if (!['1', '2', '3'].includes(n)) bad.push(at(`size.${name}.notes.${n}: a call is one to three notes`));
      for (const [role, v] of Object.entries(P.voice ?? {})) if (!(r as unknown as Record<string, { voices?: RoleVoice[] }>)[role]?.voices?.some((x) => x.v === v)) bad.push(at(`size.${name}.voice: ${v} is no voice of the ${role}'s list`));
      if (P.curve !== undefined && !(P.curve >= 0.5 && P.curve <= 4)) bad.push(at(`size.${name}.curve from 0.5 to 4`));
      if (P.ringsMost !== undefined && !(Math.abs(P.ringsMost) <= 3)) bad.push(at(`size.${name}.ringsMost within 3 rings`));
    }
    if (r.widthMost !== undefined && !(r.widthMost >= Math.max(...[r.caller.pan, r.answerer.pan].flat().map(Math.abs)) && r.widthMost <= 1)) bad.push(at('widthMost holds the roles\' own pans, at most 1'));
    if (r.count && !(finite(r.count.rest) && finite(r.count.ground) && Math.abs(r.count.rest) <= 2 && Math.abs(r.count.ground) <= 2 && (r.count.db ?? 0) <= 0 && (r.count.db ?? 0) >= -6)) bad.push(at('the count\'s factors within 2, its touch from -6 to 0 dB'));
    if (r.still && !(finite(r.still.rest) && finite(r.still.ground) && finite(r.still.groundDb) && Math.abs(r.still.rest) <= 2 && Math.abs(r.still.ground) <= 2 && Math.abs(r.still.groundDb) <= 6 && r.still.hand >= -1 && r.still.hand <= 0)) bad.push(at('the still end\'s numbers in range'));
    if (r.pulse) {
      const P = r.pulse;
      if (!(P.from > 0 && P.from <= 1) || !range(P.vel, 0, 1) || !(P.freeLate >= 0 && P.freeLate <= 3)) bad.push(at('the pulse\'s numbers in range'));
      if (!P.grid.every(([from, n]) => from > 0 && from <= 1 && [2, 4].includes(n))) bad.push(at('the pulse\'s grid an eighth or a beat'));
      if (!P.voices.length || !P.voices.every((v) => r.punctuation.voices.some((x) => x.v === v))) bad.push(at('the heartbeat in a voice of the hand\'s list'));
    }
    for (const role of ['ground', 'caller', 'answerer', 'punctuation'] as const) {
      const x = r[role];
      if (!finite(x.levelDb) || x.levelDb > 6 || x.levelDb < -30) bad.push(at(`${role}'s levelDb from -30 to 6`));
      if (!(x.reverb >= 0 && x.reverb <= 1) || !(x.delay >= 0 && x.delay <= 1)) bad.push(at(`${role}'s sends in [0, 1]`));
    }
  }
  return bad;
}

// --- the plan -------------------------------------------------------------------------

/** One strike the composer lays: a voice at a second, its bar and sixteenth, the part it plays and its notes' numbers. */
export interface ConversationEvent {
  voice: string;
  t: number;
  bar: number;
  step: number;
  part: 'conversation-ground' | 'conversation-call' | 'conversation-answer' | 'conversation-punctuation' | 'conversation-pulse';
  p: { midi?: number; vel: number; dur: number; gain: number; reverb: number; delay: number; panPath: number; hardness?: number };
}

/** What the plan says of the conversation: its row, its voices, how many of each thing, and what the budget did. */
export interface ConversationSummary {
  row: string;
  voices: { ground: string; caller: string; answerer: string; punctuation: string | null };
  /** Veil's change of hands: the callers and answerers that took over a section, in order */
  handovers: string[];
  /** the bells' size the theme was laid at (-1 small, +1 great), and Ember's heartbeat strokes */
  size: number;
  pulse: number;
  /** Veil's count the theme was laid at (the planner's own reading, `conversationLeans`): the ring's labels are held to it */
  count: number;
  /** Tide's room: the factor on the hall's tail the theme asks of its room (one where it asks nothing) */
  tail: number;
  /** the longest breath before an answer the theme was laid with (s): the answerer's `afterS` as leaned; the ring's marks close an exchange at a longer gap */
  breathS: number;
  exchanges: number;
  /** the answers as laid (an answer said another kind's way is counted as that kind) */
  answers: Record<AnswerKind, number>;
  /** the theme's first answer brought back as its last word, and the answers said another kind's way (the memory's) */
  returns: number;
  recalled: number;
  punctuation: number;
  ground: number;
  breakdownNotes: number;
  silences: number;
  /** the cast's units against the catalogue's ceiling, and the strikes the oscillators' ceiling refused */
  budget: { ceiling: number; before: number; after: number; fallback: string[]; oscillatorsMost: number; refused: number };
  says: string;
}

export interface ConversationInput {
  seed: string;
  row: ConversationRow;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  bars: number;
  barSeconds: number;
  /** the key's root (pitch class) and the theme's scale, as semitones from it */
  key: { root: number; scale: readonly number[] };
  /** the chord's notes (MIDI) that hold at a bar */
  chordAt: (bar: number) => readonly number[];
  spell: Spell;
  /** the place's own birds, every bird named: the leans' centre */
  centre: Readonly<Record<string, number>>;
  /** inside a zone, its address birds' bands: their leans reach their `ends` at the bands' edges (PLAN-ZONES §3.3) */
  bands?: BirdLeans['bands'];
  /** how long a voice rings after a strike at a velocity (s), or null where the row's `dur` is its length */
  ringOf: (voice: string, vel: number) => number | null;
  /** the oscillators one strike of a voice runs, each as the seconds it runs from the strike (none where it runs none) */
  oscillatorsOf: (voice: string, vel: number, dur: number) => readonly number[];
  /** the dB a voice is moved by to stand on the keys layer's footing (its layer's room level against the keys') */
  layerDbOf: (voice: string) => number;
  /** the keys layer's level in the room this theme drew (dB), or null where the room says none */
  roomKeysDb: number | null;
  /** the cast budget: the units of a set of voices, the units the theme sounds besides, and the ceiling */
  unitsOf: (voices: Iterable<string>) => number;
  besides: number;
  ceiling: number;
  /** whether the theme's kit plays (the drums on): the kit is then the pulse, and the heartbeat is not laid */
  kit?: boolean;
}

/** A role's air lean off the place's own birds: each voice's factor and its place in the air's order (`air-lean.ts`). */
interface AirTilt { tilt: (v: string) => number; rank: (v: string) => number }
/**
 * The air lean a role's voices are drawn under (zephyr-air): every bird's `air:<role>` (its strength, a factor's log an
 * octave of air a unit of the bird) times the bird's distance from the place's own, on each voice's air about the role's
 * middle (the row's weighted voices); none at the place's own birds, and none where no bird names one.
 */
function airTiltOf(R: ConversationRow, role: 'caller' | 'answerer', voices: readonly RoleVoice[], spell: Spell, centre: Readonly<Record<string, number>>): AirTilt | undefined {
  let e = 0;
  for (const [bird, leans] of Object.entries(R.birds.by)) {
    const x = (leans as Record<string, number>)[`air:${role}`], c = centre[bird];
    if (typeof x === 'number' && typeof c === 'number') e += x * (spell[bird as keyof Spell] - c);
  }
  if (!e) return undefined;
  // each role's voices by their air as they strike in it: the calls', the answers' (`voice-air.json`, both measured)
  const about = airAbout(voices.map((x) => ({ v: x.v, w: x.w })), voiceAir(role === 'answerer' ? 'answer' : 'call'));
  const at = new Map(voices.map((x, i) => [x.v, about[i]]));
  return { tilt: (v) => Math.exp(e * (at.get(v) ?? 0)), rank: (v) => at.get(v) ?? 0 };
}
const lerp = (r: Rng, [a, b]: Range) => a + (b - a) * r.next();
const weighted = <T>(r: Rng, list: ReadonlyArray<[T, number]>): T => r.weighted(list.map(([v, w]) => ({ v, w })));
/**
 * A role's voice by its leaned weights, another voice than the ones it answers where its list holds one. `add` is weight
 * a lean adds to a voice (a voice of weight nought in the row plays only where a lean adds to it), `lean` a factor.
 */
const voiceOf = (r: Rng, list: RoleVoice[], lean: (v: string) => number, except: readonly string[] = [], add: (v: string) => number = () => 0, air?: AirTilt): string => {
  const live = list.map((x) => ({ x, w: (x.w + add(x.v)) * lean(x.v) })).filter((y) => y.w > 0);
  const others = live.filter((y) => !except.includes(y.x.v));
  const at = (others.length ? others : live).map((y) => ({ v: y.x.v, w: y.w }));
  // Zephyr's air (zephyr-air): the draw here coupled to the draw at the place's own Zephyr, one die
  return air ? airDraw(r, at, at.map((e) => ({ v: e.v, w: e.w * air.tilt(e.v) })), air.rank) : r.weighted(at);
};

/**
 * **The leans a theme's conversation plays under** (bells-birds, 10-18): the one lean about the place's own birds, and
 * what it makes of the row — the bells' size, and the registers, the ground's gaps and its level at that size. The
 * planner reads it, and so does the check, so the two read one arithmetic.
 */
export function conversationLeans(R: ConversationRow, spell: Spell, centre: Readonly<Record<string, number>>, bands?: BirdLeans['bands']) {
  const L: BirdLeans = { centre, by: R.birds.by, ...(R.birds.most ? { most: R.birds.most } : {}), ...(R.birds.ends ? { ends: R.birds.ends } : {}), ...(bands ? { bands } : {}) };
  const factor = (knob: string) => leanFactor(L, knob, spell);
  const shift = (knob: string) => leanShift(L, knob, spell);
  // **Root is the bells' size** (his ask, 10-18: "thin root ... lighter bells composition ... mid way for low and high
  // bells and full root only for deep heavy bells with long low freq waves"): -1 a composition of small bells, nought
  // the place's own (low and high), +1 great bells; every number of a pole reached linearly from the place's own
  const size = Math.max(-1, Math.min(1, shift('size')));
  const pole = size < 0 ? R.size?.small : R.size?.large;
  // how far toward the pole: |size| to the pole's `curve` (his ask: "mid way for low and high bells and full root only
  // for deep heavy bells", so the great pole comes late, the middle still low and high bells)
  const reach = Math.pow(Math.abs(size), pole?.curve ?? 1);
  const at = (k: Exclude<keyof SizePole, 'notes' | 'voice' | 'curve'>) => (pole?.[k] ?? 0) * reach;
  const atOf = (k: 'notes', key: string) => (pole?.[k]?.[key] ?? 0) * reach;
  const reg = (r: Range, by: number): Range => [r[0] + Math.round(by), r[1] + Math.round(by)];
  // **Veil is the count** (bells-birds): the rate of change is how often a thing is struck, so it moves the rests and
  // the ground's gaps as one, the whole conversation thinning or crowding, its busy end reached at the zone's 0.6;
  // Loom's form moves them too over its whole travel (a loop close, a long form breathing)
  const count = shift('count');
  // **Spark's still end**: from the place's own Spark down toward nought, the talk thins and the ground carries it
  const still = Math.max(0, Math.min(1, shift('still')));
  const ST = R.still;
  const groundF = Math.max(R.count?.groundFloor ?? 0, factor('groundEvery') * Math.exp(at('every') + (R.count?.ground ?? 0) * count + (ST?.ground ?? 0) * still));
  // **Ember is the pulse**: free time on its low side (the lateness wider), the grid's eighth and beat on its high side
  // and a heartbeat at its top, before the kit takes the pulse over (the drums come on over Ember 0.18, app-wide)
  const pulse = Math.max(-1, Math.min(1, shift('pulse')));
  const P = R.pulse;
  const lateMul = !P ? 1 : pulse > 0 ? 1 - pulse : 1 + P.freeLate * -pulse;
  const unit = !P || pulse <= 0 ? 1 : P.grid.reduce((u, [from, n]) => (pulse >= from ? n : u), 1);
  const notesF = (n: number) => factor(`notes:${n}`) * Math.exp(atOf('notes', String(n)));
  return {
    factor, shift, size, pulse, lateMul, unit, notesF, count, still,
    // the rest's factor, every bird's together, never under the count's floor: Veil's count and Loom's loop each keep
    // their meaning, and their corner stays a slow conversation and never a chatter
    restF: Math.max(R.count?.floor ?? 0, factor('rest') * Math.exp(at('rest') + (R.count?.rest ?? 0) * count + (ST?.rest ?? 0) * still)),
    /** the touch of a busier count on every strike (dB) */
    touchDb: count > 0 ? (R.count?.db ?? 0) * count : 0,
    handF: Math.max(0, 1 + (ST?.hand ?? 0) * still),
    // Tide: the width between the caller and the answerer, and the hall's tail (a factor; `ends` in log units)
    width: factor('width'), tail: Math.exp(shift('tail')),
    // Zephyr: the strike's hardness (the velocity up, the level held: a harder mallet, a higher FM index)
    hard: factor('hardness'),
    // Gleam: how far the ground leaves the tonic (-1 never, +1 the fifth and the relative major's root as often)
    leave: Math.max(-1, Math.min(1, shift('leave'))),
    // Spark: the answer's liveliness (-1 slow and even, +1 quick and lilting)
    lively: shift('lively'),
    // Loom: the memory (nought is a loop: an answer may come back at once), the recall, the breakdown's silence
    memory: Math.max(0, Math.min(8, Math.round(R.answerer.memory + shift('memory')))),
    recall: R.answerer.recall && 1 + shift('recall') >= 0.5,
    silence: Math.min(1, R.breakdown.silence.chance * factor('silence')),
    // Veil: a section's chance of handing the call and the answer to another voice
    handover: Math.max(0, Math.min(1, shift('handover'))),
    sizeAt: at, sizeOf: atOf, reach, pole,
    ringsMost: Math.max(2, R.ground.ringsMost + Math.round(at('ringsMost'))),
    registers: { caller: reg(R.caller.register, at('caller')), answerer: reg(R.answerer.register, at('answerer')), ground: reg(R.ground.register, at('ground')) },
    groundF, apartS: R.ground.apartS * Math.min(1, groundF),
    groundDb: at('groundDb') + (ST?.groundDb ?? 0) * still,
  };
}

/**
 * **The conversation over a theme**: the events in time order and what they were. The invariants the check holds
 * (`tools/check-conversation.ts`): no call and no answer overlap another (each starts after the last one's last
 * strike); the ground's ring covers every bar from its first strike to its last, so no run of two bars is silent;
 * the hand at most once an exchange and never within `clearS` of a strike; every pitch inside its role's register.
 *
 * **The talk is laid first and the ground around it** (ambient-bells, the review of 10-17): the ground is the room the
 * voices talk in, so it gives way to them — a strike that would fall inside an exchange (from its call to its answer)
 * moves to the nearer edge of it, a breath before the call or after the answer, and its pace is closer in the chapters
 * where nobody talks. Laid the other way round, the ground was a clock (three 44 s rings struck as the oldest died:
 * a strike every 15 s, give or take three, in every theme) and the talk stepped round it.
 */
export function planConversation(I: ConversationInput): { events: ConversationEvent[]; summary: ConversationSummary } | null {
  const R = I.row;
  const LN = conversationLeans(R, I.spell, I.centre, I.bands);
  const { factor, shift } = LN;
  const end = I.bars * I.barSeconds;
  const s16 = I.barSeconds / 16;
  /** the grid a strike asked at a second is laid on (Ember's: the sixteenth, the eighth or the beat), before its lateness */
  const gridOf = (t: number) => { const q = s16 * LN.unit; return Math.ceil(t / q - 1e-9) * LN.unit; };

  // --- the voices, once a theme, under the budget ---
  const rv = new Rng(`${I.seed}::conversation:voices`);
  const ground = voiceOf(rv, R.ground.voices, () => 1);
  // three voices where the lists allow: the caller is not the ground's voice, the answerer neither the caller's nor the
  // ground's; drawn as at the place's own size
  const lean = (role: string) => (v: string) => factor(`${role}:${v}`);
  // **Zephyr is air** (zephyr-air): a bird's `air:<role>` leans the role's voices by their measured air
  // (`voice-air.json`, the calls' onsets) about the place's own birds, up airier and down darker; the row's menu as it is
  const airs = { caller: airTiltOf(R, 'caller', R.caller.voices, I.spell, I.centre), answerer: airTiltOf(R, 'answerer', R.answerer.voices, I.spell, I.centre) };
  let caller = voiceOf(rv, R.caller.voices, lean('caller'), [ground], undefined, airs.caller);
  let answerer = voiceOf(rv, R.answerer.voices, lean('answerer'), [caller, ground], undefined, airs.answerer);
  // **Root's size hands the call and the answer to its pole's voices** (the review of 10-18: weights leaned under one
  // die walked the cast through the lightest voices on the way to the great bell): each role on a die of its own, the
  // pole's voice taking over where the die falls under how far the size has gone, so a drag hands a voice over once,
  // toward the pole, and never back; never onto the other role's voice or the ground's
  {
    const rs = new Rng(`${I.seed}::conversation:size`);
    const uc = rs.next(), ua = rs.next();
    const V = LN.pole?.voice;
    if (V?.caller && uc < LN.reach && V.caller !== ground && V.caller !== answerer) caller = V.caller;
    if (V?.answerer && ua < LN.reach && V.answerer !== ground && V.answerer !== caller) answerer = V.answerer;
  }
  let punct: string | null = voiceOf(rv, R.punctuation.voices, () => 1);
  const fallback: string[] = [];
  const cost = () => I.unitsOf([ground, caller, answerer, ...(punct ? [punct] : [])]) + I.besides;
  const before = cost();
  if (cost() > I.ceiling) { answerer = caller; fallback.push(R.budget.fallbacks[0] ?? 'answerer'); }
  if (cost() > I.ceiling) { punct = null; fallback.push(R.budget.fallbacks[1] ?? 'punctuation'); }
  if (cost() > I.ceiling) return null;
  const cast = new Set<string>([ground, caller, answerer, ...(punct ? [punct] : [])]);
  const fits = (v: string) => I.unitsOf([...cast, v]) + I.besides <= I.ceiling;

  // --- the pitches: the key's pentatonic in a register, each with its degree ---
  const pcs = R.scale.map((i) => (I.key.root + I.key.scale[i]) % 12);
  const pitches = ([lo, hi]: Range): Array<{ midi: number; degree: number }> => {
    const out: Array<{ midi: number; degree: number }> = [];
    for (let m = Math.ceil(lo); m <= hi; m++) { const d = pcs.indexOf(((m % 12) + 12) % 12); if (d >= 0) out.push({ midi: m, degree: d }); }
    return out;
  };
  // **The place's level is its own in any room** (the review of 10-17): the row's levels and `mixDb` were measured on
  // the keys layer at `keysDb`; a room the die draws at a pull whose keys stand elsewhere (5 dB up in one of the two)
  // would play every strike that much hotter, so the whole conversation moves by the difference, and nowhere else
  const footingDb = I.roomKeysDb != null && Number.isFinite(I.roomKeysDb) ? R.keysDb - I.roomKeysDb : 0;
  // Veil's busier count, a lighter touch on every strike of the bells (nothing on the sparser side, nothing at the tile)
  const countDb = LN.touchDb;
  const voiceDb = (role: RoleVoice[], v: string) => (role.find((x) => x.v === v)?.db ?? 0) + R.mixDb + footingDb + countDb;
  /** the octaves a voice sounds its role's pitches at (a great bell's hum under where the call is written) */
  const octOf = (role: RoleVoice[], v: string) => 12 * (role.find((x) => x.v === v)?.oct ?? 0);
  // Tide's width between the caller and the answerer: their pan ranges widened or drawn in about the middle, never
  // past `widthMost` (a loud call panned hard puts its rings in one channel, and that channel into the limiter)
  const wm = R.widthMost ?? 0.95;
  const widened = (rr: Range): Range => (LN.width === 1 ? rr : [Math.max(-wm, Math.min(wm, rr[0] * LN.width)), Math.max(-wm, Math.min(wm, rr[1] * LN.width))]);
  const callPan = widened(R.caller.pan), answerPan = widened(R.answerer.pan);
  const pan = (r: Rng, rr: Range) => +lerp(r, rr).toFixed(3);
  const send = (x: number) => +Math.max(0, Math.min(1, x + shift('send'))).toFixed(3);
  const lateRange: Range = [R.lateMs[0] / 1000 * LN.lateMul, R.lateMs[1] / 1000 * LN.lateMul];
  const late = (r: Rng) => lerp(r, lateRange);
  /**
   * Zephyr's hardness: a strike struck harder by `hard` and played softer by as much, so its fundamental stands where it
   * stood and only its top (a struck bar's upper partials and its head, an FM bell's index) moves
   */
  const hardened = (vel: number, gain: number, role?: readonly RoleVoice[], voice?: string): { vel: number; gain: number; hardness?: number } => {
    if (LN.hard === 1) return { vel, gain };
    const v = +Math.max(0.05, Math.min(0.95, vel * LN.hard)).toFixed(3);
    // a harder strike a little past the level's hold (`hardGain`; 1 holds the fundamental), so it is brighter and not
    // peakier, the voice's own power where it states one (the temple bell's and the soft mallet's lifted partials add to
    // a peak the row's power leaves +4.5 dB over their own: the review of 10-18); a softer one held exactly (past the
    // hold it would be lifted into the limiter); and the strike's hardness as the voice's own control (zephyr-air): the
    // struck voices' upper modes, head and index follow it, so a harder strike is a brighter one and not only a louder
    // one held level (none at the place's own Zephyr)
    const hardness = +(v / vel).toFixed(4);
    const power = role?.find((x) => x.v === voice)?.hardGain ?? R.hardGain ?? 1;
    return { vel: v, gain: +(gain * Math.pow(vel / v, v > vel ? power : 1)).toFixed(5), ...(hardness !== 1 ? { hardness } : {}) };
  };
  const events: ConversationEvent[] = [];
  // **The phone's ceiling on the rings** (PLAN-AMBIENT §6.1's risk: long decays overlap): each oscillator of a strike
  // runs its own seconds (a bar's partials stop at their own ends, the fundamental last), so a strike is laid only where
  // the ones already running leave it room under `oscillatorsMost` while its own run; a call or an answer that finds
  // none ends where it is, an exchange waits, the ground waits.
  const alive: Array<{ from: number; to: number }> = [];
  let refused = 0;
  const room = (t: number, lives: readonly number[]) => {
    if (!lives.length) return true;
    const longest = Math.max(...lives);
    // what runs only grows where a strike already laid starts, and the strike's own only falls, so its start and
    // theirs are the moments to count
    const at = [t, ...alive.filter((x) => x.from > t && x.from < t + longest).map((x) => x.from)];
    return at.every((u) => alive.reduce((a, x) => a + (x.from <= u && x.to > u ? 1 : 0), 0) + lives.filter((s) => t + s > u).length <= R.oscillatorsMost);
  };
  /** a strike at a second: on the grid at or after it, plus its lateness; null past the end or over the ceiling */
  /** a strike refused while it waits (a call asked again two seconds on, the ground a second on) is counted once */
  let waiting = false;
  const strike = (voice: string, t: number, part: ConversationEvent['part'], r: Rng, p: Omit<ConversationEvent['p'], 'panPath'> & { pan: number }): ConversationEvent | null => {
    const step = gridOf(t);
    const at = step * s16 + late(r);
    if (at >= end - 0.05) return null;
    const lives = I.oscillatorsOf(voice, p.vel, p.dur);
    if (!room(at, lives)) { if (!waiting) refused++; return null; }
    for (const s of lives) alive.push({ from: at, to: at + s });
    const { pan: pp, ...rest } = p;
    const e: ConversationEvent = { voice, t: +at.toFixed(6), bar: Math.floor(step / 16), step: step % 16, part, p: { ...rest, panPath: pp } };
    events.push(e);
    return e;
  };
  const ring = (voice: string, vel: number, dur: Range, r: Rng) => +(I.ringOf(voice, vel) ?? lerp(r, dur)).toFixed(4);
  const clearOfAll = (t: number) => events.every((e) => Math.abs(e.t - t) >= R.clearS);
  const kindAt = (t: number) => (I.sections.find((x) => t >= x.startBar * I.barSeconds && t < (x.startBar + x.bars) * I.barSeconds) ?? I.sections[I.sections.length - 1])?.kind ?? 'main';

  // --- the exchanges, the breakdown's line ---
  const callerP = pitches(LN.registers.caller), answerP = pitches(LN.registers.answerer);
  const answerMid = (LN.registers.answerer[0] + LN.registers.answerer[1]) / 2;
  const targetW = (degree: number) => (R.caller.targets[String(degree)] ?? 0) * factor(`target:${degree}`);
  const callDbOf = (v: string) => R.caller.levelDb + voiceDb(R.caller.voices, v) + I.layerDbOf(v);
  const answerDbOf = (v: string) => R.answerer.levelDb + voiceDb(R.answerer.voices, v) + I.layerDbOf(v);
  const punctDb = punct ? R.punctuation.levelDb + voiceDb(R.punctuation.voices, punct) + I.layerDbOf(punct) : 0;
  /** the call's touch by register: a struck voice's top is its loudest and brightest, so a player leans off it */
  const callVelAt = (midi: number) => Math.max(0.1, 1 + R.caller.velByOctave * Math.max(0, midi - R.caller.velFrom) / 12);
  const restF = LN.restF;
  const gapF = Math.exp(LN.sizeAt('gaps')), afterF = Math.exp(LN.sizeAt('after'));
  const notesW: Pairs<number> = R.caller.notes.map(([n, w]) => [n, w * LN.notesF(n)]);
  const handChance = Math.min(1, R.punctuation.chance * factor('punctuation') * LN.handF);
  // Spark's liveliness in the answer: quicker and lilting (short, long) on its high side, slower and even on its low
  const LV = R.answerer.lively;
  const lv = LN.lively;
  const answerGapAt = (i: number) => !LV || lv === 0 ? 1 : lv > 0 ? (1 - LV.quicker * lv) * (1 + (i % 2 ? 1 : -1) * LV.lilt * lv) : 1 + LV.slower * -lv;
  const answers: Record<AnswerKind, number> = { echo: 0, invert: 0, complete: 0, open: 0 };
  let exchanges = 0, hands = 0, breakdownNotes = 0, silences = 0, returns = 0, recalled = 0;
  const barOf = (t: number) => Math.max(0, Math.min(I.bars - 1, Math.floor(t / I.barSeconds)));
  const chordPcs = (t: number) => new Set(I.chordAt(barOf(t)).map((m) => ((m % 12) + 12) % 12));
  /** an index into a pitch list nearest a MIDI note, by octave where the note is outside it */
  const nearestIdx = (list: Array<{ midi: number }>, midi: number) => {
    let best = 0;
    for (let i = 1; i < list.length; i++) if (Math.abs(list[i].midi - midi) < Math.abs(list[best].midi - midi)) best = i;
    return best;
  };
  /** a contour (steps in a pitch list) from an index, moved by whole octaves (five steps) until it fits */
  const fit = (list: unknown[], from: number, shape: readonly number[]): number[] => {
    let idx = shape.map((s) => from + s);
    const n = list.length;
    for (let k = 0; k < 4 && Math.min(...idx) < 0; k++) idx = idx.map((i) => i + R.scale.length);
    for (let k = 0; k < 4 && Math.max(...idx) >= n; k++) idx = idx.map((i) => i - R.scale.length);
    return idx.map((i) => Math.max(0, Math.min(n - 1, i)));
  };
  // **The conversation's memory** (the review of 10-17: one answer figure came back four times in a theme): the
  // answers of the last `memory` exchanges, so an answer finds another way to say it, and the theme's first answer,
  // which its last exchange may bring back on purpose (a motif returns; a habit does not). Loom leans it: at its low
  // end the memory is nought and nothing returns on purpose (a loop: an answer may be said again at once)
  const memory: string[] = [];
  const figureOf = (idx: readonly number[]) => idx.map((i) => answerP[i].midi).join(' ');
  let firstAnswer: number[] | null = null;
  let lastCallStart: number | null = null;
  const spans: Range[] = [];
  const lastTalkSection = Math.max(-1, ...I.sections.map((s, i) => ((R.chapters[s.kind] ?? 'exchanges') === 'exchanges' ? i : -1)));
  const firstTalkSection = I.sections.findIndex((s) => (R.chapters[s.kind] ?? 'exchanges') === 'exchanges');
  // **Veil's change of hands**: from the second section that talks on, the call and the answer may each pass to
  // another voice of the role (never the ground's, never the other role's), where the cast's ceiling has room
  let callerNow = caller, answererNow = answerer;
  const handovers: string[] = [];

  for (const [si, sec] of I.sections.entries()) {
    const chapter = R.chapters[sec.kind] ?? 'exchanges';
    const s0 = sec.startBar * I.barSeconds, s1 = Math.min(end, (sec.startBar + sec.bars) * I.barSeconds);
    if (chapter === 'ground') continue;
    if (LN.handover > 0 && chapter === 'exchanges' && si !== firstTalkSection && answerer !== caller) {
      const rh = new Rng(`${I.seed}::conversation:handover:${si}`);
      if (rh.chance(LN.handover)) {
        const v = voiceOf(rh, R.caller.voices, lean('caller'), [ground, answererNow, callerNow], undefined, airs.caller);
        if (v !== callerNow && v !== answererNow && v !== ground && fits(v)) { callerNow = v; cast.add(v); handovers.push(v); }
      }
      if (rh.chance(LN.handover)) {
        const v = voiceOf(rh, R.answerer.voices, lean('answerer'), [ground, callerNow, answererNow], undefined, airs.answerer);
        if (v !== callerNow && v !== answererNow && v !== ground && fits(v)) { answererNow = v; cast.add(v); handovers.push(v); }
      }
    }
    const callDb = callDbOf(callerNow), answerDb = answerDbOf(answererNow);
    const callOct = octOf(R.caller.voices, callerNow), answerOct = octOf(R.answerer.voices, answererNow);
    if (chapter === 'answerer') {
      // the answerer alone, a note every 20-40 s, wandering by a step or two; sometimes a silence over the ground
      const rb = new Rng(`${I.seed}::conversation:breakdown:${si}`);
      const silent = rb.chance(LN.silence) ? lerp(rb, R.breakdown.silence.s) : 0;
      if (silent) silences++;
      let t = s0 + Math.max(silent, lerp(rb, R.breakdown.firstS));
      let at = nearestIdx(answerP, answerMid);
      while (t < s1 - R.exchange.endS) {
        const tt = clearOfAll(t) ? t : t + R.clearS * 1.5;
        const vel = +(lerp(rb, R.caller.vel) * R.answerer.velMul * R.breakdown.velMul).toFixed(3);
        const h = hardened(vel, +dbToGain(answerDb).toFixed(5), R.answerer.voices, answererNow);
        const e = strike(answererNow, tt, 'conversation-answer', rb, { midi: answerP[at].midi + answerOct, vel: h.vel, dur: ring(answererNow, h.vel, R.answerer.dur, rb), gain: h.gain, ...(h.hardness ? { hardness: h.hardness } : {}),
          reverb: send(R.answerer.reverb), delay: R.answerer.delay, pan: pan(rb, answerPan) });
        if (e) { breakdownNotes++; spans.push([e.t, e.t]); }
        at = fit(answerP, at, [weighted(rb, R.breakdown.steps)])[0];
        t = tt + lerp(rb, R.breakdown.everyS) * restF;
      }
      continue;
    }
    // the exchanges: a call, a breath, an answer (or none), a hand now and then, a long rest
    const rx = new Rng(`${I.seed}::conversation:exchange:${si}`);
    let t = s0 + lerp(rx, R.exchange.entryS);
    /** an exchange's own draws, off its own stream: how many notes, their gaps, the breath before the answer */
    const drawsOf = (r: Rng) => {
      const count = weighted(r, notesW);
      const gaps = Array.from({ length: count - 1 }, () => lerp(r, R.caller.gapS) * gapF);
      return { count, gaps, callLen: gaps.reduce((a, b) => a + b, 0), afterS: lerp(r, R.answerer.afterS) * afterF };
    };
    const span = (d: { callLen: number; afterS: number }) => d.callLen + d.afterS + d.callLen * R.answerer.gapMul;
    for (let n = 0; ; n++) {
      const rn = new Rng(`${I.seed}::conversation:note:${si}:${n}`);
      const { count, gaps, callLen, afterS } = drawsOf(rn);
      const kind: AnswerKind = weighted(rn, R.answerer.kinds);
      const rest = lerp(rn, R.exchange.restS) * restF;
      // room for the call, the breath and the answer before the section's end
      if (t + callLen + afterS + callLen * R.answerer.gapMul > s1 - R.exchange.endS) break;
      // the section's last exchange: the next one's own draws find no room after this one's rest (it closes)
      const closing = t + span({ callLen, afterS }) + rest + span(drawsOf(new Rng(`${I.seed}::conversation:note:${si}:${n + 1}`))) > s1 - R.exchange.endS;
      // the call: a chord tone of the chord that holds, then the contour the targets lean toward; never started where
      // the last call started, where another tone of the chord is there to start on
      const tones = callerP.map((x, i) => ({ ...x, i })).filter((x) => chordPcs(t).has(pcs[x.degree]));
      const starts = tones.length ? tones : callerP.map((x, i) => ({ ...x, i }));
      const first = rn.weighted(starts.map((x) => ({ v: x.i, w: Math.max(1e-6, targetW(x.degree)) * (x.midi === lastCallStart ? R.caller.restartW : 1) })));
      const shapes = count === 1 ? [[[0], 1] as [number[], number]] : R.caller.contours[String(count)];
      const shape = rn.weighted(shapes.map(([s, w]) => ({ v: s, w: w * Math.max(1e-6, targetW(callerP[fit(callerP, first, s)[s.length - 1]].degree)) })));
      const callIdx = fit(callerP, first, shape);
      const callVel = lerp(rn, R.caller.vel);
      let at = t;
      const callOn: number[] = [];
      for (const [i, ix] of callIdx.entries()) {
        if (i > 0) waiting = false;
        const vel = +(callVel * callVelAt(callerP[ix].midi) * (1 - R.caller.fade * i)).toFixed(3);
        const h = hardened(vel, +dbToGain(callDb).toFixed(5), R.caller.voices, callerNow);
        const e = strike(callerNow, at, 'conversation-call', rn, { midi: callerP[ix].midi + callOct, vel: h.vel, dur: ring(callerNow, h.vel, R.caller.dur, rn), gain: h.gain, ...(h.hardness ? { hardness: h.hardness } : {}),
          reverb: send(R.caller.reverb), delay: R.caller.delay, pan: pan(rn, callPan) });
        if (!e) break;
        callOn.push(e.t);
        // the next note at its gap, and never on the grid step this one took
        at = Math.max(at + (gaps[i] ?? 0), e.t + 0.1);
      }
      // a call with no room for its first strike waits two seconds for the rings to fall
      if (!callOn.length) { if (t + 2 < s1 - R.exchange.endS) { t += 2; n--; waiting = true; continue; } waiting = false; break; }
      waiting = false;
      exchanges++;
      lastCallStart = callerP[callIdx[0]].midi;
      const callEnd = callOn[callOn.length - 1];
      const lastMidi = callerP[callIdx[callOn.length - 1]].midi, firstMidi = callerP[callIdx[0]].midi;
      const laidShape = shape.slice(0, callOn.length);
      // **the answer, by rules** (the review of 10-17): each kind's ways of saying it, in the order a player would
      // reach for them, and the first the last few exchanges have not already said
      const ta = callEnd + afterS;
      const ways = (k: AnswerKind): number[][] => {
        if (k === 'echo') {
          // the call's contour from a tone of the chord over or under where the call began (folded into the answer's
          // register), never its pitch class: toward the register's middle first, the nearer tone first, then wider
          const near = nearestIdx(answerP, firstMidi);
          const home = answerP[near].midi + (firstMidi - answerP[near].midi) % 12;
          const tones2 = answerP.map((x, i) => ({ ...x, i })).filter((x) => chordPcs(ta).has(pcs[x.degree]) && pcs[x.degree] !== ((firstMidi % 12) + 12) % 12);
          const toward = home > answerMid ? -1 : 1;
          const side = (dir: number) => tones2.filter((x) => (x.midi - home) * dir > 0).sort((a, b) => Math.abs(a.midi - home) - Math.abs(b.midi - home));
          const a = side(toward), b = side(-toward);
          const order = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter((x) => x);
          return (order.length ? order.map((x) => x.i) : [near]).map((i) => fit(answerP, i, laidShape));
        }
        if (k === 'invert') {
          // mirrored, from where the call stopped, else from a step toward the middle or away from it
          const i0 = nearestIdx(answerP, lastMidi), toward = answerP[i0].midi > answerMid ? -1 : 1;
          return [i0, i0 + toward, i0 - toward].filter((i) => i >= 0 && i < answerP.length).map((i) => fit(answerP, i, laidShape.map((s) => -s)));
        }
        // completed: from where the call stopped, a step at a time, to the tonic or the fifth. Its direction is the
        // phrase's: a section's closing exchange comes down to the tonic; a call that rose is answered falling and one
        // that fell rising (the contrary motion that makes a pair of phrases one); a call of one note toward the middle
        const i0 = nearestIdx(answerP, lastMidi);
        const rose = laidShape[laidShape.length - 1] - laidShape[0];
        const dir = closing ? -1 : rose > 0 ? -1 : rose < 0 ? 1 : (answerP[i0].midi > answerMid ? -1 : 1);
        const walk = (d: number, goals: readonly number[], most: number) => {
          const path: number[] = [];
          for (let i = i0 + d; i >= 0 && i < answerP.length && path.length < most; i += d) { path.push(i); if (goals.includes(answerP[i].degree)) return path; }
          return null;
        };
        // the nearer of the two goals that way first; then on to the other one, a note longer; then the other way
        const goals = closing ? [0] : [0, 3];
        const nearer = walk(dir, goals, 3);
        const other = nearer ? goals.filter((g) => g !== answerP[nearer[nearer.length - 1]].degree) : [];
        return [nearer, other.length ? walk(dir, other, 4) : null, walk(-dir, goals, 3)].filter((x): x is number[] => !!x && x.length > 0);
      };
      let answered = false, answerEnd = callEnd, answerStart = Infinity, kindLaid: AnswerKind = kind;
      if (kind !== 'open') {
        // the theme's last word may be its first answer, on purpose (once the memory has let it go); otherwise the drawn kind's first fresh way, then
        // the other kinds', and where every way is fresh in memory the question is left open
        let idx: number[] | null = null;
        if (closing && si === lastTalkSection && firstAnswer && LN.recall && !memory.includes(figureOf(firstAnswer))) { idx = firstAnswer; returns++; }
        for (const k of [kind, ...(['echo', 'invert', 'complete'] as const).filter((x) => x !== kind)]) {
          if (idx) break;
          const w = ways(k).find((x) => !memory.includes(figureOf(x)));
          if (w) { idx = w; kindLaid = k; if (k !== kind) recalled++; }
        }
        if (!idx) kindLaid = 'open';
        let ta2 = ta;
        for (const [i, ix] of (idx ?? []).entries()) {
          const vel = +(callVel * R.answerer.velMul * (1 - R.caller.fade * i)).toFixed(3);
          const h = hardened(vel, +dbToGain(answerDb).toFixed(5), R.answerer.voices, answererNow);
          const e = strike(answererNow, ta2, 'conversation-answer', rn, { midi: answerP[ix].midi + answerOct, vel: h.vel, dur: ring(answererNow, h.vel, R.answerer.dur, rn), gain: h.gain, ...(h.hardness ? { hardness: h.hardness } : {}),
            reverb: send(R.answerer.reverb), delay: R.answerer.delay, pan: pan(rn, answerPan) });
          if (!e) break;
          if (!answered) answerStart = e.t;
          answered = true;
          answerEnd = e.t;
          ta2 = Math.max(ta2 + (gaps[i] ?? lerp(rn, R.caller.gapS) * gapF) * R.answerer.gapMul * answerGapAt(i), e.t + 0.1);
        }
        if (answered) {
          const laid = events.filter((e) => e.part === 'conversation-answer' && e.t >= answerStart && e.t <= answerEnd).map((e) => nearestIdx(answerP, e.p.midi! - answerOct));
          memory.push(figureOf(laid));
          if (memory.length > LN.memory) memory.shift();
          firstAnswer ??= laid;
        } else kindLaid = 'open';
      }
      answers[kindLaid]++;
      spans.push([callOn[0], answerEnd]);
      // the hand: at most once an exchange, between the call and the answer that came or after it, never on a strike
      if (punct && rn.chance(handChance)) {
        const where = weighted(rn, R.punctuation.where);
        const th = where === 'between' && answered ? (callEnd + answerStart) / 2 : answerEnd + lerp(rn, R.punctuation.afterS);
        if (th < s1 - 0.5 && clearOfAll(th) && clearOfAll(gridOf(th) * s16)) {
          const vel = +lerp(rn, R.punctuation.vel).toFixed(3);
          const e = strike(punct, th, 'conversation-punctuation', rn, { vel, dur: 0.6, gain: +dbToGain(punctDb).toFixed(5), reverb: send(R.punctuation.reverb), delay: R.punctuation.delay, pan: pan(rn, R.punctuation.pan) });
          if (e && events.every((x) => x === e || Math.abs(x.t - e.t) >= R.clearS)) hands++;
          else if (e) events.splice(events.indexOf(e), 1);
        }
      }
      // the rest, in seconds, leaned by Veil and Loom (and the bells' size)
      t = answerEnd + rest;
    }
  }

  // --- the ground: struck at its pace from the first section to the last strike before the end, around the talk ---
  const rg = new Rng(`${I.seed}::conversation:ground`);
  const groundReg = LN.registers.ground;
  const groundPitches = pitches(groundReg);
  const groundDb = R.ground.levelDb + voiceDb(R.ground.voices, ground) + I.layerDbOf(ground) + LN.groundDb;
  const groundRing = I.ringOf(ground, R.ground.vel[1]) ?? R.ground.everyS[1];
  const groundOn: number[] = [];
  const groundEnds: number[] = [];
  const groundStrikes: Array<{ t: number; dur: number; midi: number }> = [];
  // Gleam's light on the ground: how often it leaves the tonic for the fifth and, past the place's own, the relative
  // major's root; the row's own degrees where Gleam stands at the place
  const GL = R.ground.leave;
  const groundDegrees: Pairs<number> = !GL || LN.leave === 0 ? R.ground.degrees
    : [...R.ground.degrees.map(([d, w]): [number, number] => [d, w * Math.exp((d === 0 ? GL.tonic : GL.others) * LN.leave)]),
      ...(LN.leave > 0 ? GL.add.filter(([d]) => !R.ground.degrees.some(([x]) => x === d)).map(([d, w]): [number, number] => [d, w * LN.leave]) : [])];
  /**
   * whether a strike asked at a second stands clear of the talk once it is laid: on the grid at or after it and up to
   * its lateness later (a second clear by `clearS` could be laid a step nearer and flam it)
   */
  const talk = events.slice();
  const lateMost = lateRange[1];
  const clearOfTalk = (t: number) => {
    const from = gridOf(t) * s16, to = from + lateMost;
    return talk.every((e) => e.t + R.clearS <= from || e.t >= to + R.clearS);
  };
  /** the second itself where it stands clear of the talk, else moved past it by steps of `clearS` and a half (eight at most) */
  const pastTalk = (t: number) => { for (let k = 0; k < 8 && !clearOfTalk(t); k++) t += R.clearS * 1.5; return t; };
  const ringingAt = (t: number) => groundEnds.filter((x) => x > t).length;
  const apartS = LN.apartS;
  {
    let t = lerp(rg, R.ground.firstS);
    let prev = -Infinity;
    // the latest second a strike was refused at (the ceiling had no room): a strike that gives way to the talk never
    // steps back before it, or a refused strike would be asked again at the same breath for ever
    let tried = -Infinity;
    // the last strike `lastS` before the end, once it is on its grid and late
    const last = end - R.ground.lastS - s16 * LN.unit - lateMost;
    while (t < last) {
      // no more than `ringsMost` of its rings at once: the strike waits for the oldest to end
      const ringing = groundEnds.filter((x) => x > t).sort((a, b) => a - b);
      if (ringing.length >= LN.ringsMost) { t = ringing[ringing.length - LN.ringsMost] + 0.05; continue; }
      // the talk's turn: a strike inside an exchange gives way to its nearer edge, a breath before the call or after
      // the answer; after only while the last ring still holds the room, before only where the rings leave it room.
      // Read where the strike would be laid (its grid step and its lateness, `clearOfTalk`): a second just clear of
      // the call that lands inside `clearS` of it as laid would otherwise be stepped past the call, into the breath
      const inside = spans.find(([a, b]) => t + s16 * LN.unit + lateMost > a - R.clearS && t < b + R.clearS);
      if (inside) {
        const y = lerp(rg, R.ground.yieldS);
        const early = inside[0] - y, later = inside[1] + y;
        const okEarly = early >= 0 && early > tried && early - prev >= apartS && ringingAt(early) < LN.ringsMost;
        const okLater = later - prev <= groundRing * R.ground.ringShare && later < last;
        if (okEarly && (!okLater || t - early <= later - t)) t = early;
        else if (okLater) t = later;
      }
      const tt = pastTalk(t);
      if (tt >= last) break;
      const degree = weighted(rg, groundDegrees);
      const at = groundPitches.filter((x) => x.degree === degree);
      const mid = (groundReg[0] + groundReg[1]) / 2;
      const pick = (at.length ? at : groundPitches).slice().sort((a, b) => Math.abs(a.midi - mid) - Math.abs(b.midi - mid))[0];
      // a bowl struck while its own pitch still rings is struck softer, by what still rings of it (its rings add in
      // phase with the new strike's, and the sum was what the limiter caught)
      const still = groundStrikes.filter((g) => g.midi === pick.midi && g.t + g.dur > tt).reduce((a, g) => a + Math.pow(10, -3 * (tt - g.t) / g.dur), 0);
      const vel0 = +(lerp(rg, R.ground.vel) * Math.max(0.5, 1 - R.ground.touch * still)).toFixed(3);
      // the bowl's level by register: its upper notes read louder on the keys' floor, so a player leans off them, up to
      // the register where it stops reading louder (`dbTo`), and no more over it
      const byReg = R.ground.dbByOctave ? R.ground.dbByOctave * Math.max(0, Math.min(pick.midi, R.ground.dbTo ?? Infinity) - (R.ground.dbFrom ?? 0)) / 12 : 0;
      const h = hardened(vel0, +dbToGain(groundDb + byReg).toFixed(5));
      const e = strike(ground, tt, 'conversation-ground', rg, { midi: pick.midi, vel: h.vel, dur: ring(ground, h.vel, [groundRing, groundRing], rg), gain: h.gain,
        reverb: send(R.ground.reverb), delay: R.ground.delay, pan: pan(rg, R.ground.pan) });
      if (!e) { if (tt < last - 1) { tried = tt; t = tt + 1; waiting = true; continue; } break; }
      waiting = false;
      groundOn.push(e.t); groundEnds.push(e.t + e.p.dur); groundStrikes.push({ t: e.t, dur: e.p.dur, midi: pick.midi }); prev = e.t;
      // the next strike inside this one's ring, never closer than `apartS`; closer where nobody talks; Veil's count and
      // the bells' size on its gap
      const pace = R.ground.pace[R.chapters[kindAt(e.t)] ?? 'exchanges'] ?? 1;
      t = e.t + Math.max(apartS, Math.min(lerp(rg, R.ground.everyS) * pace * LN.groundF, groundRing * R.ground.ringShare));
    }
  }

  // --- the heartbeat (Ember's top, where the kit does not play): a soft stroke on each bar's one in the sections that
  // talk; never on a strike ---
  let pulses = 0;
  const PU = R.pulse;
  if (PU && !I.kit && LN.pulse >= PU.from) {
    const pv = punct && PU.voices.includes(punct) ? punct : PU.voices.find((v) => cast.has(v) || fits(v)) ?? null;
    if (pv) {
      cast.add(pv);
      const rp = new Rng(`${I.seed}::conversation:pulse`);
      const db = R.punctuation.levelDb + voiceDb(R.punctuation.voices, pv) + I.layerDbOf(pv) + PU.levelDb;
      const u = (LN.pulse - PU.from) / Math.max(1e-9, 1 - PU.from);
      const vel = PU.vel[0] + (PU.vel[1] - PU.vel[0]) * u;
      const placed = events.slice();
      for (const sec of I.sections) {
        if ((R.chapters[sec.kind] ?? 'exchanges') !== 'exchanges') continue;
        for (let b = sec.startBar; b < sec.startBar + sec.bars && b < I.bars; b++) {
          const t = b * I.barSeconds;
          if (t >= end - R.exchange.endS || placed.some((e) => Math.abs(e.t - t) < R.clearS + lateMost)) continue;
          const e = strike(pv, t, 'conversation-pulse', rp, { vel: +vel.toFixed(3), dur: 0.6, gain: +dbToGain(db).toFixed(5), reverb: send(R.punctuation.reverb), delay: 0, pan: 0 });
          if (e) pulses++;
        }
      }
    }
  }
  events.sort((a, b) => a.t - b.t);
  const voices = { ground, caller, answerer, punctuation: punct };
  const says = `${R.id}: ${ground} ground, ${caller} calls, ${answerer} answers${punct ? `, ${punct} marks` : ''}; ${exchanges} exchanges (${Object.entries(answers).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}${returns ? `, ${returns} return` : ''}), ${hands} hands, ${groundOn.length} ground strikes`
    + (handovers.length ? `; handed to ${handovers.join(', ')}` : '') + (pulses ? `; ${pulses} heartbeats` : '');
  return {
    events,
    summary: { row: R.id, voices, handovers, size: +LN.size.toFixed(3), pulse: pulses, count: +LN.count.toFixed(4), tail: +LN.tail.toFixed(4), breathS: +(R.answerer.afterS[1] * afterF).toFixed(3), exchanges, answers, returns, recalled, punctuation: hands, ground: groundOn.length, breakdownNotes, silences,
      budget: { ceiling: I.ceiling, before, after: I.unitsOf(cast) + I.besides, fallback, oscillatorsMost: R.oscillatorsMost, refused }, says },
  };
}

/**
 * **A zone, as the conversation's leans read it** (PLAN-ZONES §3.3; zones-pilot's `Zone` in places.ts): the centre its
 * leans are about, and its address birds' bands, at whose edges a lean with `ends` reaches them (`zoneBands`).
 */
export interface ConversationZone {
  centre?: Readonly<Partial<Record<string, number>>>;
  bands?: Readonly<Partial<Record<string, readonly [number, number]>>>;
}
/** **The leans' frame**: the centre, every bird named, and inside a zone its address birds' bands. */
export interface ConversationFrame {
  centre: Readonly<Record<string, number>>;
  bands?: ConversationZone['bands'];
}
/**
 * **The frame a place's conversation is leaned in** (the bird-labels review, 10-18): the entry's own `centre` (a tile
 * it names apart from where it is placed), else its zone's, else its place's birds, every bird named; inside a zone its
 * bands. The planner's path reads this centre (`generator.ts`: `convEntry?.centre ?? ZONE?.centre ?? convPlace.birds`)
 * and the ring's labels read this function, so the cut a cell's word turns at is where the planner's
 * own number turns.
 */
export function conversationFrame(
  entry: { place: { birds: Readonly<Partial<Record<string, number>>> }; centre?: Readonly<Partial<Record<string, number>>> },
  zone: ConversationZone | null = null,
): ConversationFrame {
  const at = entry.centre ?? zone?.centre ?? entry.place.birds;
  return { centre: Object.fromEntries(BIRDS.map((b) => [b, at[b] ?? HOUSE[b]])), ...(zone?.bands ? { bands: zone.bands } : {}) };
}
/** **The leans in a frame**: `conversationLeans` about its centre, inside a zone with its bands (the planner's own reading). */
export function conversationLeansIn(R: ConversationRow, spell: Spell, frame: ConversationFrame) {
  return conversationLeans(R, spell, frame.centre, frame.bands as BirdLeans['bands']);
}
