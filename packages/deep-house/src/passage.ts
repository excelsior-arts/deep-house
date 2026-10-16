// **A written passage**: one row in the shape of `recipes/ambient/passage.json` played over a window of a track,
// counted from its first drop, the way a producer arranges a passage. The planners have laid the whole track already;
// this pass rewrites the window only (the producer's grammar, `src/producer.ts`, writes a row whose window is the whole
// track), in this order:
//
//   1. what the passage replaces goes (the evenly spaced soloist statements and their swells, the keys'
//      automatic echoes, the reverse arrival, the bed's background notes, the drop's vinyl layer);
//   2. the shared space: a hall and a slow filtered echo as the theme's shared returns
//      (`settings.returns`), every source's direct level and sends written per note, a throw opening the
//      echo for one note, the field dipped from the drums' actual hits;
//   3. the soloist's phrases in real notes: one note per slur, its pitches joined under one breath, each
//      note weighted and re-articulated by its role, vibrato on held destinations, one scoop;
//   4. the keys' quiet touches, a suspension resolved inside its chord and a passing dominant's shells,
//      beside the planner's full landings, which stay; no automatic answer where the voice answers;
//   5. the drums' states and endings, bar by bar, on the kit's own hits; the bass's variants on the
//      accepted line's own notes, its dips rebuilt from the snares that now play;
//   6. the glue (crashes, reverse swells, risers), the field's duck and swells, the texture under a straight top,
//      long holds faded, and the returns admitted under the phone's ceiling.
//
// Nothing here names a seed or a genre. The harmony is the track's own chord in force; a pitch is a
// scale step over that chord's root in the track's key (a chromatic `alt` where the row means one),
// placed over a root floor; a passing dominant is the dominant of the chord it arrives on. Another seed
// at the place plays the same passage over its own key, chords and cast.

import PASSAGE_FILE from '../recipes/ambient/passage.json' with { type: 'json' };
import { asSpace, type SpaceRow } from '@deep-house/engine/space';
import { dbToGain } from '@deep-house/engine/dsp';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import type { PlanEvent, PlanPoint } from './generator.ts';
import { bendInRoom, type BendRoom } from './mined-phrase.ts';
import { fadeHolds } from './hygiene.ts';
import type { LeanRow } from './lean.ts';
import { glueParams, type GlueSound } from './phrasing.ts';

type Pos = string; // `bar:beat`, the bar relative to the first drop, the beat 1-4 with `e`, `&` or `a`
interface Send { direct: number; hall: number; echo: number; dub?: number }
interface Role { vel: number; attack: number; release: number; dip: number }
interface PhraseNote { deg?: number; alt?: number; len?: string; rest?: string; role?: string; scoop?: boolean; send?: string }
/**
 * One utterance: a phrase of the vocabulary at a position, over the chord in force there (`here`) or the one its last
 * note arrives on (`arrival`), in a send profile. `skip` leaves out its first notes (the same identity, another entry),
 * `take` keeps only its first notes, `octave` moves it by octaves before the register's fit, `vel` scales its weight
 * (a softer statement), `dub` throws its last note into the slow dub echo instead of the throw; `label` names the
 * exchange it belongs to (every event of an arrangement belongs to a labelled phrase).
 */
export interface Line { at: Pos; phrase: string; over: 'here' | 'arrival'; send: string; throwLast?: boolean; dubLast?: boolean; says?: string;
  skip?: number; take?: number; octave?: number; vel?: number; stretch?: Record<number, string>; label?: string }
export interface Strike { at: Pos; over?: 'here' | 'arrival'; notes?: number[]; dominant?: number[]; db: number; bars: number; vel: number; cut?: number[]; says?: string;
  /** a send profile for the strike (a pickup leaning into the hall before an arrival) */
  send?: string; label?: string;
  /** the planner's own landing chord in force struck again (its voicing, at `db` and `vel` scaled): a drop's interior restrike */
  restrike?: boolean }
/**
 * An operation on the accepted bass line's notes in one eight-bar phrase (`i` its notes in order, 0 the first): the
 * removals and joins (`drop`, `shorten`, `trim`, `glide`, `copy`, `move`), and the written answers: `add` writes a new note (`deg` a scale step over the chord in
 * force's root, `oct` octaves over the bass floor, `len` sixteenths, cloned from the note `like` whose sound it keeps),
 * `octave` moves a note, `shift` moves it by sixteenths, `repitch` sets it to a scale step of the chord, `out` takes the
 * line out over bars of the phrase (`from` to `to`, relative bars; a note sounding into the gap is cut at its edge).
 */
export interface BassOp { op: 'drop' | 'shorten' | 'glide' | 'copy' | 'move' | 'trim' | 'add' | 'octave' | 'shift' | 'repitch' | 'out';
  i?: number | number[]; to?: number; beats?: number; bars?: number; at?: Pos; as?: number;
  deg?: number; oct?: number; len?: number; like?: number; vel?: number; by?: number; steps?: number; from?: number;
  /** an `add` that is a melodic note, not a riff note: its path a small scoop into the pitch and held there, its level flat */
  plain?: { st: number; s: number };
  /** an `add`'s level against the note it is cloned from, in dB */
  db?: number }
export type End = 'ghostTurn' | 'openEnding' | 'halfBarBreath' | 'kickOut' | 'shortRoll' | 'hatCut' | 'snareDeparture' | 'topsDarken' | 'ghostAnswer' | 'lastBeatEmpty'
  | 'fill' | 'roll' | 'snarePickup' | 'crash' | 'hatsBreathe' | 'reverseCymbal' | 'topsClose' | 'topsOpen' | 'ghostTail' | 'kickPickup' | 'openHatPickup' | 'beatSilence'
  /** `kickBack`: the kick of the bar before carried on through a bar the planner left without one (a build keeps rising) */
  | 'kickBack';
/** Every ending, by name, once: the one vocabulary (`recipes/arrangement/phrasing.json`, PLAN-UNIFY §2.4) names each in one entry. */
const ENDS: Readonly<Record<End, true>> = Object.freeze({ ghostTurn: true, openEnding: true, halfBarBreath: true, kickOut: true, shortRoll: true, hatCut: true,
  snareDeparture: true, topsDarken: true, ghostAnswer: true, lastBeatEmpty: true, fill: true, roll: true, snarePickup: true, crash: true, hatsBreathe: true,
  reverseCymbal: true, topsClose: true, topsOpen: true, ghostTail: true, kickPickup: true, openHatPickup: true, beatSilence: true, kickBack: true });
export const END_NAMES: readonly End[] = Object.freeze(Object.keys(ENDS) as End[]);
export interface DrumState { from: number; to: number; state: 'S' | 'R' | 'X' | 'T' | 'H' | 'O' | 'B'; spotlight?: [number, number]; topFrom?: number; topVel?: number;
  /** the drums thinned under a phrase: no ghosts, no open hat, the tops a little softer */
  thin?: boolean;
  /** `B`, the build: the drums of a later bar (`source` bars on) cloned in, each hit's high-pass and level walked from the first value to the second across the span */
  fade?: { source: number; hp: [number, number]; db: [number, number] };
  /** a send profile for the snares of the span: a skeleton's hits carried by the hall and the echo, so its gaps ring */
  space?: string }
/**
 * **A drum-led build into a line and its landing** (fast-drops: the producer's drops and the half-time breath's return,
 * drawn off `recipes/arrangement/gestures.json`): on the line's last bar (two where `beats` is 8) the `lead` lane, the
 * first of its lanes the kit plays, is cleared from the window's start and plays its pattern (sixteenths, one per
 * step of the window, right-aligned to the line; a digit is a hit at that many tenths of the lane's own hit, `X` a whole one); `lanes`
 * add theirs over the last bar (`C` the open hat at 0.7, choked where the window ends); `rest` lanes go quiet from the
 * window's start (the kick never before the last bar's half); `silence` quiets every drum lane across the window before
 * its own hits; then every drum is out over the last `stop` sixteenths, the bass out from the window (or the stop), and
 * the line lands (`kick`: the kick alone through its first beat, the bass's first note on the second; `bass`: the kick
 * and the bass alone, the bass struck at the line's top). `hpHz`: a high-pass sweeping up across every pitched note
 * sounding over the window, to that corner where the stop starts and gone on the line. Lanes are the kit's roles:
 * `kick`, `backbeat` (the snare's crack, its ghosts resting with it), `offbeat` (the closed hats), `sixteenth` (the soft
 * hats), `open`. Every hit is a copy of the kit's own; no build ever adds a voice.
 */
export interface DropBuild { line: number; kind: string; name: string; beats: number; stop: number; land: 'stroke' | 'kick' | 'bass' | 'none'; into: 'drop' | 'return';
  lead?: { lanes: string[]; pattern: string }; lanes?: Record<string, string>; rest: string[]; bass: 'window' | 'stop'; silence?: boolean; hpHz?: number; label: string;
  /** the field cut (every chord and line, the bed and the weather: what the drums lead) `db` from the window's start, the
   * stop's or the line, to the line or through its first beat (a landing of the kick alone), every edge `edgeS` */
  cut?: { db: number; from: 'window' | 'stop' | 'line'; to: 'line' | 'beat'; edgeS: number };
  /** the landing crash's colour by the birds (the gestures' sound table about the fast place's own: its size, brightness and ring) */
  stroke?: GlueSound }
/** a weather span: its level, its sends, brighter (its low-pass corners scaled), its pan walked across the span, or gone */
export interface WeatherSpan { from: number; to: number; db?: number; send?: string; gone?: boolean; bright?: number; lid?: number; pan?: [number, number]; panBars?: number; label?: string;
  /** the level walked across the span (dB at its start and its end: the wind rising toward an entry); the pan's shape (a sine drifts, a triangle travels); the hall's share in place of the send's */
  rise?: [number, number]; panShape?: 'triangle' | 'sine'; air?: number;
  /** the bar (relative) the pan's travel is counted from, where a span continues another's */
  panAt?: number }
/** a gesture of the glue: a crash or ride into the hall on a landing, a reverse-like swell into one, a riser into a drop */
export interface Fx { at: Pos; kind: 'crash' | 'swell' | 'riser'; beats?: number; db?: number; send?: string; label?: string;
  /** a build's riser coloured by the birds (the gestures' sound table: its band, its tail, its sends) */
  sound?: GlueSound }
/** the field swelling (the shared returns' level), in dB from `from` to `to`, back over `release` beats */
export interface FieldSwell { from: Pos; to: Pos; db: number; release?: number }

export interface PassageRow {
  id: string;
  name: string;
  window: { from: number; to: number };
  retire: { parts: string[]; voices: string[]; bed: boolean; layers?: string[] };
  returns: Record<string, unknown>;
  /** what a return gives up, in order, where the cast would pass the ceiling with it: an effect of a send's return chain, or a whole send */
  admission: Array<{ return: string; send: string; effect?: string }>;
  sends: Record<string, Send | string>;
  duck: { kickDb: number; snareDb: number; principalVel: number; attackS: number; holdS: number; recoverBeats: number };
  voice: { voice: string; levelDb: number; rootFloor: number; laidBackMs: number; glideS: number; legato: number; roles: Record<string, Role>;
    vibrato: { hz: number; cents: number; afterS: number; riseS: number; leastS: number }; scoop: { cents: number; seconds: number };
    tone: Record<string, number>; register: { refMidi: number; dbPerSemitone: number; floor: number; top: number };
    keysFallback: { db: number; velScale: number; ring: number; sendScale: number };
    /** the hall's share by a note's role inside one breath (the run-up lightly, the destination fully); the echo on its last note only */
    hallByRole: Record<string, number>;
    /** each note of a breath heard to start: the dip's lead, the pitch's step where it does not glide, the roles that glide, the consonant's puff by role and its length */
    articulation: { dipS: number; holdS: number; stepS: number; glideRoles: string[]; puff: Record<string, number>; puffS: number } };
  phrases: Record<string, PhraseNote[] | string>;
  lines: Line[];
  keys: { rootFloor: number; dominantFloor: number; strum: number; strikes: Strike[]; drop: Array<{ bar: number; from: number; to: number; says?: string }>;
    /** the send profile a planner's pickup leans into the hall with before its landing */
    pickupSend?: string };
  pad: { rootFloor: number; levelDb: number; blooms: Bloom[];
    /** the register every pad is moved by, in semitones (its floor and its ceiling): the bed's lean by the birds, carried (the producer writes it) */
    shift?: number;
    /**
     * the birds on every pad the grammar writes (PLAN-UNIFY U3, the fast places' birds; the producer writes it, only off
     * the tile's own values): `width` and `air` factors on a bloom's spread and its hall (Zephyr), `db` on every pad's
     * level (Tide: a wetter, farther field holds its background a little higher)
     */
    lean?: { width: number; air: number; db: number } };
  /** the wind's one visit inside the window (from its start to `dropFrom`, then gone); a whole track writes `weather` spans instead */
  wind?: { dropFrom: number; db: number; send: string };
  weather?: WeatherSpan[];
  fx?: Fx[];
  swells?: FieldSwell[];
  drums: { states: DrumState[];
    endings: Array<{ bar: number; end: End[]; says?: string }>; ghost: { vel: number; gainOf: number }; roll: { steps: number[]; vel: number[] }; darken: { fromStep: number; db: number };
    /** the gestures: the fill's steps and weights, the accelerating roll, the crash's level into the hall (its gain where the track has none), the tops' filter */
    fill: { steps: number[]; vel: number[] }; accel: { from: number; vel: [number, number] }; crash: { db: number; send: string; gain: number }; tops: { closeHz: [number, number]; openHz: [number, number] };
    swell: { beats: number; db: number; send: string; gain: number }; riser: { gain: number; beats: number };
    /** the ghost figures: [step, weight over the ghost's velocity] for the roller's answering bar and each ending that is ghosts */
    ghosts: Record<'answer' | 'snarePickup' | 'ghostTail' | 'ghostTurn' | 'ghostAnswer', Array<[number, number]>>;
    /** the hats by state: the answering bar's accents, the straight top's two weights, the spotlight's, a thinning's and the breath's scale */
    hats: { answering: { soft: number; loud: number; ceiling: number }; straight: [number, number]; spotlight: [number, number]; thin: number; breath: number };
    /** bars (relative) where the drums thin under the voice, whatever their state */
    thinBars?: number[];
    /** the drum-led builds into the drops and returns, and their landings (the producer writes them) */
    builds?: DropBuild[] };
  bass: { variants: Record<string, BassOp[] | string>; phrases: Array<{ from: number; variant: string | BassOp[]; label?: string }>; floor?: number;
    /** every bend kept inside the riff's register (`bendInRoom`), its window in sixteenths */
    register?: Omit<BendRoom, 'windowS'> & { windowSteps: number } };
  /** the fade of long holds */
  holds?: Holds;
  /** the texture under the straight top */
  texture?: Texture;
  /** hand percussion, where a row writes a part for it (`src/hand.ts`) */
  hand?: unknown;
}

/**
 * A pad's entry: scale steps over the chord in force at a root floor, held `bars`. An entry of a line of pads adds its
 * level (`db` over the row's), its width (the notes spread across the field, lowest to highest alternately), its air
 * (the hall's share), a level walked across it (`rise`, dB at its start and end), a ceiling its notes are folded under
 * (`top`), and a fade over its last bars written into the same path.
 */
export interface Bloom { at: Pos; over: 'here' | 'arrival'; notes: number[]; bars: number; attack: number; release: number; send: string; label?: string;
  db?: number; width?: number; air?: number; rise?: [number, number]; top?: number; fadeBars?: number;
  /** a drum-led build's line (fast-drops): the entry's rise carried on, in place of its fade, to `bars` from its start
   * (the line), cut at `cut` (bars from its start: where the build's silence or stop starts), else released on the line */
  into?: { bars: number; cut?: number } }
/** The fade every long hold gets where it ends while the music goes on (`holds` in the producer row). */
export interface Holds { leastS: number; fadeBars: number; tailBars: number; handoverBeats: number; easeDb: number; layers: string[];
  /** the fade in seconds, out of bars held between two bounds and leaned by its birds (`fadeLeastS`, `fadeMostS`, `lean`: `src/hygiene.ts`, `fadeSOf`) */
  fadeLeastS?: number; fadeMostS?: number; lean?: LeanRow;
  /** the fade and the ring past a written end, resolved in seconds by the theme's time (the producer writes them) */
  fadeS?: number; tailS?: number }
/** The texture that hears the drums' straight top (a shaker, else the weather gated, else the pad's tremolo), by span. */
export interface Texture {
  spans: Array<{ from: number; to: number; label?: string }>;
  shaker: { voice: string; db: number; pan: number; accents: number[]; in: number[]; outFrom: number; outTo: number; hall: number; jitter: number };
  gate: { db: number; accents: number[]; floor: number; holdShare: number; inBars: number; outBars: number; hall: number };
  tremolo: { depth: number; notes: number[]; db: number; attack: number; release: number };
}

const FILE = PASSAGE_FILE as unknown as { rows: PassageRow[] };
/** The passage rows, by id; each one's returns admitted as space rows (a row that is not refuses the module). */
export const PASSAGE_ROWS: Readonly<Record<string, PassageRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => {
  for (const raw of Object.values(r.returns)) asSpace(raw);
  return [r.id, r];
})));

/** A note's or a rest's length in sixteenths, by its word. */
export const LEN: Readonly<Record<string, number>> = Object.freeze({ s: 1, e: 2, q: 4, dq: 6, h: 8, dh: 12, w: 16 });
const BEATS = ['', 'e', '&', 'a'];

/** `bar:beat[e|&|a]` as a bar and a sixteenth inside it. */
export function posOf(at: Pos): { bar: number; step: number } {
  const m = /^(-?\d+):([1-4])(e|&|a)?$/.exec(at);
  if (!m) throw new Error(`passage: ${at} is not a bar:beat position`);
  return { bar: Number(m[1]), step: (Number(m[2]) - 1) * 4 + (m[3] === 'e' ? 1 : m[3] === '&' ? 2 : m[3] === 'a' ? 3 : 0) };
}
/** A position as sixteenths from its bar 0 (a row's bars are counted from the first drop, so this is relative too). */
export const sixteenthsOf = (at: Pos): number => { const p = posOf(at); return p.bar * 16 + p.step; };
/** A track's sixteenth (absolute) as a position counted from the first drop. */
export function posAt(sixteenth: number, drop: number): Pos {
  const b = Math.floor(sixteenth / 16), s = ((sixteenth % 16) + 16) % 16;
  return `${b - drop}:${Math.floor(s / 4) + 1}${BEATS[s % 4]}`;
}

/**
 * A pitch: scale step `deg` (and a chromatic `alt`) over the root of the chord on scale degree `degree`, the root placed
 * at or over `floor`, in the key of `tonic` and `scale`.
 */
export function scalePitch(scale: readonly number[], tonic: number, degree: number, floor: number, deg: number, alt = 0): number {
  const d0 = ((degree % 7) + 7) % 7, idx = d0 + deg;
  return rootOver(scale, tonic, degree, floor) + scale[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7) - scale[d0] + alt;
}
/** The root of the chord on scale degree `degree`, the first MIDI note of its pitch class at or over `floor`. */
export function rootOver(scale: readonly number[], tonic: number, degree: number, floor: number): number {
  const pc = (tonic + scale[((degree % 7) + 7) % 7]) % 12;
  return floor + ((pc - floor) % 12 + 12) % 12;
}

/** What the generator hands the pass: the track's clock, key, harmony and cast, and its events (rewritten in place). */
export interface PassageInput {
  row: PassageRow;
  events: PlanEvent[];
  bars: number;
  barSeconds: number;
  beat: number;
  /** the first drop's bar: the passage's bars are counted from it */
  drop: number;
  tonic: number;
  scale: number[];
  /** the chord in force at a bar: its scale degree in the key */
  degreeAt: (bar: number) => number;
  /** a part's own level: the level table's word on the voice taken back off, so `db` is what plays */
  ownGain: (voice: string, db: number) => number;
  layerOf: (voice: string) => string;
  isKick: (voice: string) => boolean;
  isSnare: (voice: string) => boolean;
  /** the bed's voice, whose background notes the passage retires */
  bedVoice: string | null;
  /** the bed voice's own level where the groove plays (its row's full level, the place's lift of the bed applied), as a
   *  note's gain: the level every bloom is set against (the bed's first retired note's where none is named) */
  bedGain?: number;
  /** a keys tone the birds swapped (PLAN-UNIFY U3): its own room as a send to the field's hall, added to every keys send the passage writes */
  keysRoomHall?: number;
  noteName: (midi: number) => string;
  /** the cast in units with the voices named sounding and the returns named built, besides the keys' own space */
  castWith: (voices: Iterable<string>, returns: SpaceRow[]) => number;
  ceiling: number;
  /** the keys plan's landings (bars), by which the planner's own keys notes are labelled: a landing, its pickup, its answer */
  landings?: number[];
}

/** What the pass hands back: the theme's shared returns, their lines, and what it did, bar by bar. */
export interface PassageResult {
  id: string;
  window: { from: number; to: number };
  returns: Record<string, SpaceRow>;
  lines: Array<{ param: string; points: PlanPoint[] }>;
  /** the cast in units with the passage's returns, what they gave up under the ceiling, and after */
  budget: { before: number; gave: string[]; after: number };
  removed: Record<string, number>;
  added: Record<string, number>;
  timeline: Array<{ bar: number; drums: string; harmony: string; bass: string; voice: string; space: string }>;
  summary: string;
  /** every drum-led build heard, in line order (absolute bars), where the row writes builds: what the ring may mark */
  builds?: Array<{ line: number; kind: string; beats: number; stop: number; land: DropBuild['land']; into: DropBuild['into']; big: true; label: string }>;
}

const round = (v: number, n = 5) => +v.toFixed(n);
/** The pitched layers a whoosh's high-pass sweeps: what holds a chord or sings a line, and the bass. */
/** The field a build's cut takes besides the pitched layers: the weather, its upper air and the textures. */
const FIELD_PARTS: ReadonlySet<string> = new Set(['weather', 'weather-upper', 'texture']);
const PITCHED: ReadonlySet<string> = new Set(['keys', 'pad', 'lead', 'stab', 'arp', 'pluck', 'piano', 'bell', 'vocal', 'strings', 'melodic', 'bass']);

export function playPassage(I: PassageInput): PassageResult {
  const R = I.row;
  const bs = I.barSeconds, s16 = bs / 16;
  const from = I.drop + R.window.from, to = Math.min(I.bars, I.drop + R.window.to);
  const tOf = (bar: number, step: number) => bar * bs + step * s16;
  const inWindow = (t: number) => t >= from * bs - 1e-6 && t < to * bs - 1e-6;
  const abs = (at: Pos) => { const p = posOf(at); return { bar: I.drop + p.bar, step: p.step }; };
  const removed: Record<string, number> = {}, added: Record<string, number> = {};
  const note = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };
  const send = (name: string): Send => {
    const s = R.sends[name];
    if (!s || typeof s === 'string') throw new Error(`passage ${R.id}: no send profile ${name}`);
    return s;
  };
  // a keys note's sends: the row's, and a swapped tone's own room into the hall beside them (PLAN-UNIFY U3: the room it
  // replaced was its own, under whatever the row throws into the hall)
  const keysSends = (r: Record<string, number>): Record<string, number> => (I.keysRoomHall ? { ...r, 'field.hall': round((r['field.hall'] ?? 0) + I.keysRoomHall, 4) } : r);
  const returnsOf = (s: Send, direct = true) => ({ ...(direct ? { direct: s.direct } : {}), returns: { ...(s.hall > 0 ? { 'field.hall': s.hall } : {}), ...(s.echo > 0 ? { 'field.echo': s.echo } : {}), ...((s.dub ?? 0) > 0 ? { 'field.dub': s.dub! } : {}) } });
  const tl = new Map<number, { drums: string[]; harmony: string[]; bass: string[]; voice: string[]; space: string[] }>();
  const say = (bar: number, k: 'drums' | 'harmony' | 'bass' | 'voice' | 'space', s: string) => {
    if (bar < from || bar >= to) return;
    let row = tl.get(bar);
    if (!row) tl.set(bar, (row = { drums: [], harmony: [], bass: [], voice: [], space: [] }));
    row[k].push(s);
  };

  // a pitch: a scale step over a chord's root in the key, over a root floor
  const rootOf = (degree: number, floor: number) => rootOver(I.scale, I.tonic, degree, floor);
  const pitch = (degree: number, floor: number, deg: number, alt = 0) => scalePitch(I.scale, I.tonic, degree, floor, deg, alt);

  // ----- 1. what the passage replaces -----
  const templates: Record<string, PlanEvent | undefined> = {};
  const keep = I.events.filter((e) => {
    if (!inWindow(e.t)) return true;
    const gone = (e.part && R.retire.parts.includes(e.part)) || R.retire.voices.includes(e.voice) || (R.retire.layers ?? []).includes(e.layer)
      || (R.retire.bed && I.bedVoice && e.voice === I.bedVoice && e.layer === 'pad' && !e.role);
    if (!gone) return true;
    if (e.part === 'soloist' && !templates.soloist) templates.soloist = e;
    if (e.voice === I.bedVoice && !templates.bed) templates.bed = e;
    if (!templates[`layer:${e.layer}`]) templates[`layer:${e.layer}`] = e;
    note(removed, e.part ?? e.voice);
    return false;
  });
  I.events.length = 0;
  I.events.push(...keep);
  const evs = I.events;
  // the events by voice, in the order they stand in the track (the glue looks its templates and its doubles up here)
  const byVoice = new Map<string, PlanEvent[]>();
  const index = (e: PlanEvent) => { const l = byVoice.get(e.voice); if (l) l.push(e); else byVoice.set(e.voice, [e]); };
  for (const e of evs) index(e);
  const push = (e: PlanEvent, k: string) => { evs.push(e); index(e); note(added, k); return e; };

  // ----- 2. the keys -----
  const keysIn = evs.filter((e) => e.role === 'sparse-keys' && inWindow(e.t));
  for (const d of R.keys.drop) {
    const bar = I.drop + d.bar;
    for (const e of keysIn) {
      const st = (e.t - bar * bs) / s16;
      if (st >= d.from - 0.3 && st < d.to && e.bar === bar && Number(e.p.dur) < 4 * bs) { e.p = { ...e.p, gone: 1 }; note(removed, 'keys-note'); }
    }
  }
  // the planner's own keys notes, labelled by the landing they belong to: the landing's chord, its pickup in the two bars
  // before, its answer in the three bars after (anything else would be an unlabelled keys event)
  for (const e of keysIn) {
    if (e.part || e.p.gone) continue;
    const L = (I.landings ?? []).find((b) => e.t >= (b - 2) * bs - 1e-6 && e.t < (b + 3) * bs);
    if (L == null) { e.label = Number(e.p.dur) > 2 * bs ? `keys chord ${e.bar} (the planner's restrike)` : `keys figure ${e.bar} (the planner's)`; continue; }
    e.label = Number(e.p.dur) > 4 * bs ? `keys landing ${L}` : e.t < L * bs - 0.05 ? `keys pickup into ${L}` : `keys answer to ${L}`;
    // the pickup leans into the hall before its arrival (the anticipation), where the row says how
    if (R.keys.pickupSend && e.t < L * bs - 0.05 && Number(e.p.dur) <= 4 * bs) e.p = { ...e.p, returns: keysSends(returnsOf(send(R.keys.pickupSend)).returns) };
  }
  // the keys' own template: the earliest note longer than four bars of each layer's voice, the planner's landing
  const keysTemplates = new Map<string, PlanEvent>();
  for (const e of evs) if (e.role === 'sparse-keys' && !e.part && Number(e.p.dur) > 4 * bs) { const was = keysTemplates.get(e.voice); if (!was || e.t < was.t) keysTemplates.set(e.voice, e); }
  const writtenKeys: Array<{ e: PlanEvent; midi: number }> = [];
  for (const k of R.keys.strikes) {
    const { bar, step } = abs(k.at);
    if (bar < from || bar >= to) continue;
    if (k.restrike) {
      // the planner's landing chord in force struck again: its own notes, voicing and sound, quieter
      const t = tOf(bar, step);
      const landing = evs.filter((e) => e.role === 'sparse-keys' && !e.part && !e.p.gone && e.label?.startsWith('keys landing') && e.t <= t + 1e-6);
      const t0 = landing.length ? Math.max(...landing.map((e) => e.t)) : -1;
      const chord = landing.filter((e) => e.t >= t0 - 0.25);
      for (const e of chord) push({ ...e, t: round(t + (e.t - Math.min(...chord.map((x) => x.t))), 6), bar, step, part: 'study-keys', label: k.label ?? `keys restrike ${bar}`,
        p: { ...e.p, vel: round(Number(e.p.vel ?? 0.5) * k.vel, 4), dur: round(k.bars * bs, 4), gain: round(Number(e.p.gain ?? 1) * dbToGain(k.db), 6), ...(k.send ? { returns: keysSends(returnsOf(send(k.send)).returns) } : {}) } }, 'keys-restrike');
      say(bar, 'harmony', `restrike ${chord.map((e) => e.note).join(' ')} (${k.db} dB)`);
      continue;
    }
    const arrival = I.degreeAt(bar + 1);
    const deg = k.over === 'arrival' ? arrival : I.degreeAt(bar);
    // a dominant's shell is written in semitones over its root, the arriving chord's fifth above (whatever the
    // key's own fifth degree is), placed over the dominant floor; a touch in scale steps over the chord's root
    const domRoot = () => { const fifth = (rootOf(arrival, 0) + 7) % 12; return R.keys.dominantFloor + ((fifth - R.keys.dominantFloor) % 12 + 12) % 12; };
    const midis = k.dominant ? k.dominant.map((x) => domRoot() + x) : (k.notes ?? []).map((x) => pitch(deg, R.keys.rootFloor, x));
    for (const c of k.cut ?? []) {
      const cutMidi = pitch(deg, R.keys.rootFloor, c);
      for (const s of writtenKeys) if (s.midi === cutMidi && s.e.t < tOf(bar, step) && s.e.t + Number(s.e.p.dur) > tOf(bar, step)) s.e.p = { ...s.e.p, dur: round(tOf(bar, step) - s.e.t + 0.04, 4) };
    }
    for (const T of keysTemplates.values()) midis.forEach((m, i) => {
      const e = push({ ...T, t: round(tOf(bar, step) + i * R.keys.strum * s16, 6), bar, step, note: I.noteName(m), part: 'study-keys', label: k.label ?? `keys ${k.dominant ? 'dominant shell' : k.cut ? 'resolution' : 'touch'} ${bar}`,
        p: { ...T.p, midi: m, vel: k.vel, dur: round(k.bars * bs, 4), gain: round(Number(T.p.gain ?? 1) * dbToGain(k.db), 6), ...(k.send ? { returns: keysSends(returnsOf(send(k.send)).returns) } : {}) } }, 'keys-touch');
      writtenKeys.push({ e, midi: m });
    });
    say(bar, 'harmony', `${k.dominant ? 'dominant shell' : k.cut ? 'resolution' : 'touch'} ${midis.map(I.noteName).join(' ')} (${k.db} dB)`);
  }

  // ----- 3. the soloist -----
  const V = R.voice;
  const solo = templates.soloist;
  const tone = solo ? Object.fromEntries(['sourceTilt', 'vocalDetune', 'breath', 'formantWidth', 'formantScale', 'open'].filter((k) => solo.p[k] != null).map((k) => [k, solo.p[k]])) : V.tone;
  const voiceName = solo?.voice ?? V.voice;
  const soloGain = I.ownGain(voiceName, V.levelDb);
  // the soloist only under the phone's ceiling: a track that does not sound it already and would go over the
  // ceiling with it hands the phrases to the keys' own tone, note by note (no new identity)
  // the cast counts the drawn voice where a place swapped only its sound (`EventMeta.drawn`)
  const castVoice = (e: PlanEvent) => e.drawn ?? e.voice;
  const sounding = new Set(evs.map(castVoice));
  // the returns as small as the row's admission would let them become (each give-up applied): the soloist is admitted
  // where it fits against those, and the admission below gives up only what the cast then needs
  const rowReturns = Object.values(Object.fromEntries(Object.entries(R.returns).map(([id, raw]) => {
    const r = structuredClone(asSpace(raw));
    for (const g of R.admission ?? []) {
      if (g.return !== id) continue;
      if (g.effect) { const sd = r.sends.find((x) => x.id === g.send); if (sd?.after) sd.after = sd.after.filter((x) => x.effect !== g.effect); }
      else r.sends = r.sends.filter((x) => x.id !== g.send);
    }
    return [id, r];
  })));
  // the glue the row will write counted too (a crash, a reverse swell, a riser), so the soloist is admitted against the whole cast
  const glue = [...new Set([...(R.fx ?? []).map((f) => f.kind), ...R.drums.endings.flatMap((x) => x.end).flatMap((e) => (e === 'crash' ? ['crash'] : e === 'reverseCymbal' ? ['swell'] : [])),
    ...(R.pad.blooms.length && templates.bed ? [templates.bed.voice] : [])])];
  const keysVoice = !sounding.has(voiceName) && I.castWith([...sounding, ...glue, voiceName], rowReturns) > I.ceiling && keysTemplates.size > 0;
  if (keysVoice) note(added, 'phrases on the keys (the soloist over the ceiling)', 0);
  const phrase = (id: string): PhraseNote[] => {
    const p = R.phrases[id];
    if (!Array.isArray(p)) throw new Error(`passage ${R.id}: no phrase ${id}`);
    return p;
  };
  for (const L of R.lines) {
    const { bar, step } = abs(L.at);
    if (bar < from || bar >= to) continue;
    // the line's own reading of the phrase: its first notes left out (a new entry), only its first kept, a note held longer
    let notes = phrase(L.phrase).map((n, i) => (L.stretch?.[i] ? { ...n, len: L.stretch[i] } : n));
    if (L.skip) { notes = notes.slice(L.skip); while (notes[0]?.rest) notes = notes.slice(1); if (notes[0] && notes[0].role === 'approach') notes = [{ ...notes[0], role: 'pickup' }, ...notes.slice(1)]; }
    if (L.take) notes = notes.slice(0, L.take);
    const label = L.label ?? `${L.phrase} ${bar}`;
    // lay the notes out: onsets in sixteenths from the phrase's start
    let at = bar * 16 + step;
    const laid: Array<{ on: number; len: number; midi: number; role: string; scoop: boolean; send: string; breath: boolean }> = [];
    let rest = false;
    const total = notes.reduce((a, n) => a + LEN[n.len ?? n.rest ?? 'e'], 0);
    const refDeg = L.over === 'arrival' ? I.degreeAt(Math.floor((bar * 16 + step + total - 1) / 16)) : I.degreeAt(bar);
    for (const n of notes) {
      if (n.rest) { at += LEN[n.rest]; rest = true; continue; }
      const len = LEN[n.len ?? 'e'];
      laid.push({ on: at, len, midi: pitch(refDeg, V.rootFloor, n.deg ?? 0, n.alt ?? 0) + 12 * (L.octave ?? 0), role: n.role === 'breath' ? 'departure' : n.role ?? 'approach', scoop: !!n.scoop,
        send: n.send ?? L.send, breath: rest || n.role === 'breath' });
      rest = false;
      at += len;
    }
    if (L.throwLast && laid.length) laid[laid.length - 1].send = 'throw';
    if (L.dubLast && laid.length) laid[laid.length - 1].send = 'dub';
    // the phrase fitted to the voice's register by whole octaves, its intervals kept: its top under the ceiling, then its
    // lowest over the floor
    if (laid.length) {
      let shift = 0;
      while (Math.max(...laid.map((n) => n.midi)) + shift > V.register.top) shift -= 12;
      while (Math.min(...laid.map((n) => n.midi)) + shift < V.register.floor) shift += 12;
      for (const n of laid) n.midi += shift;
    }
    if (keysVoice) {
      const K = V.keysFallback;
      for (const n of laid) for (const T of keysTemplates.values()) {
        const b = Math.floor(n.on / 16);
        push({ ...T, t: round(n.on * s16 + V.laidBackMs / 1000, 6), bar: b, step: n.on % 16, note: I.noteName(n.midi), part: 'study-phrase', label,
          p: { ...T.p, midi: n.midi, vel: round((V.roles[n.role] ?? V.roles.approach).vel * K.velScale * (L.vel ?? 1), 4), dur: round(n.len * s16 * K.ring * (n.send === 'dub' ? 1.6 : 1), 4),
            gain: round(Number(T.p.gain ?? 1) * dbToGain(K.db), 6),
            returns: keysSends(Object.fromEntries(Object.entries(returnsOf(send(n.send)).returns).map(([k, v]) => [k, round(v * K.sendScale, 4)]))) } }, 'phrase-on-keys');
      }
      say(Math.floor(laid[0]?.on / 16), 'voice', `${L.phrase} on the keys: ${laid.map((n) => I.noteName(n.midi)).join(' ')}`);
      continue;
    }
    // slurs: a new breath at a rest, a breath mark, or a change of space
    const slurs: typeof laid[] = [];
    for (const n of laid) {
      const cur = slurs[slurs.length - 1];
      if (!cur || n.breath || n.send !== cur[cur.length - 1].send) slurs.push([n]); else cur.push(n);
    }
    const late = V.laidBackMs / 1000;
    for (const sl of slurs) {
      const t0 = sl[0].on * s16 + late;
      const last = sl[sl.length - 1];
      const roleOf = (r: string) => V.roles[r] ?? V.roles.approach;
      // each note's weight by its role, ridden down as the line climbs (the voice's formants pass a higher note's
      // lower harmonics: left alone, an octave up is some ten decibels louder)
      const velOf = (n: { midi: number; role: string }) => roleOf(n.role).vel * dbToGain(-V.register.dbPerSemitone * (n.midi - V.register.refMidi));
      const top = Math.max(...sl.map(velOf));
      const end = (last.on + last.len * V.legato) * s16 + late;
      const dur = end - t0;
      const m0 = sl[0].midi;
      const pc: number[] = [], lv: number[] = [], vb: number[] = [], br: number[] = [];
      const A = V.articulation, b0 = Number(tone.breath ?? V.tone.breath ?? 0.05);
      br.push(0, b0);
      const add = (list: number[], t: number, v: number) => {
        const x = Math.max(0, t);
        if (list.length && x < list[list.length - 2] + 1e-4) { list[list.length - 1] = v; return; }
        list.push(round(x, 4), round(v, 4));
      };
      sl.forEach((n, i) => {
        const on = n.on * s16 + late - t0;
        const cents = (n.midi - m0) * 100;
        const r = roleOf(n.role), lvl = velOf(n) / top;
        if (i === 0) {
          add(pc, 0, n.scoop ? cents + V.scoop.cents : cents);
          if (n.scoop) add(pc, V.scoop.seconds, cents);
          add(lv, 0, lvl);
          add(vb, 0, 0);
        } else {
          // each note heard to start: a dip and a soft consonant at every note, the pitch gliding only into a
          // connected approach (or a scoop), stepping inside the dip everywhere else
          const prev = sl[i - 1], was = (prev.midi - m0) * 100, wasLvl = velOf(prev) / top;
          const glides = A.glideRoles.includes(n.role) || n.scoop;
          add(pc, on - (glides ? V.glideS : A.stepS), was);
          add(pc, on, n.scoop ? cents + V.scoop.cents : cents);
          if (n.scoop) add(pc, on + V.scoop.seconds, cents);
          add(lv, on - A.dipS, wasLvl);
          add(lv, on, Math.min(wasLvl, lvl) * r.dip);
          add(lv, on + A.holdS, Math.min(wasLvl, lvl) * r.dip);
          add(lv, on + A.holdS + Math.max(0.02, r.attack), lvl);
          add(vb, on - 0.01, 0);
          const puff = A.puff[n.role] ?? A.puff.approach;
          add(br, on - 0.006, b0);
          add(br, on + 0.006, b0 + puff);
          add(br, on + A.puffS, b0);
        }
        // the vibrato on a held destination only, rising after it has settled
        const noteEnd = (i === sl.length - 1 ? end - t0 : sl[i + 1].on * s16 + late - t0);
        if ((n.role === 'destination' || n.role === 'held') && noteEnd - on >= V.vibrato.leastS) {
          add(vb, on + V.vibrato.afterS, 0);
          add(vb, Math.min(noteEnd - 0.05, on + V.vibrato.afterS + V.vibrato.riseS), V.vibrato.cents);
          add(vb, noteEnd - V.glideS, V.vibrato.cents);
        }
      });
      const first = roleOf(sl[0].role), fin = roleOf(last.role);
      const sp = send(last.send);
      // the sends as paths over the breath: the hall by each note's role, the echo opened for its last note only
      const hallPath: number[] = [], echoPath: number[] = [];
      sl.forEach((n, i) => {
        const on = n.on * s16 + late - t0;
        const h = round(sp.hall * (V.hallByRole[n.role] ?? 1), 4), e = i === sl.length - 1 ? sp.echo : 0;
        if (i === 0) { hallPath.push(0, h); echoPath.push(0, e); return; }
        hallPath.push(round(on - 0.02, 4), hallPath[hallPath.length - 1], round(on + 0.03, 4), h);
        echoPath.push(round(on - 0.02, 4), echoPath[echoPath.length - 1], round(on + 0.03, 4), e);
      });
      const flat = (x: number[]) => x.every((v, i) => i % 2 === 0 || v === x[1]);
      const sends = { direct: sp.direct, returns: {
        ...(sp.hall > 0 ? { 'field.hall': flat(hallPath) ? hallPath[1] : hallPath } : {}),
        ...(sp.echo > 0 ? { 'field.echo': flat(echoPath) ? echoPath[1] : echoPath } : {}),
        ...((sp.dub ?? 0) > 0 ? { 'field.dub': sp.dub! } : {}) } };
      const p: NoteParams = {
        midi: m0, dur: round(dur, 4), vel: round(Math.min(1, top), 4), gain: round(soloGain * Math.max(1, top) * (L.vel ?? 1), 6),
        attack: first.attack, release: fin.release, vowelSeconds: round(Math.min(0.5, dur * 0.6), 3),
        ...tone, vibratoHz: V.vibrato.hz, vibratoCurve: vb, ...(pc.some((v, i) => i % 2 === 1 && v !== 0) ? { pitchCurve: pc } : {}),
        ...(lv.length > 2 ? { levelCurve: lv } : {}), ...(br.length > 2 ? { breathCurve: br } : {}),
        dry: 1, reverb: 0, delay: 0, ...sends,
      };
      const b = Math.floor(sl[0].on / 16);
      push({ t: round(t0, 6), voice: voiceName, layer: I.layerOf(voiceName), bar: b, step: sl[0].on % 16, role: 'detail', part: 'study-soloist', treatment: 'none', label,
        note: I.noteName(m0), p }, 'soloist-slur');
      say(b, 'voice', `${L.phrase}${slurs.length > 1 ? ` (${slurs.indexOf(sl) + 1}/${slurs.length})` : ''}: ${sl.map((n) => I.noteName(n.midi)).join(' ')}`);
      if (last.send === 'throw') say(b, 'space', 'throw: the last note into the echo');
      else if (last.send === 'dub') say(b, 'space', 'dub stroke: the note into the slow echo');
      else if (last.send !== 'main') say(b, 'space', `${last.send} profile`);
    }
  }

  // ----- the pad's blooms -----
  // the bed's first retired note lends its sound (the voice, its tone); the level is the bed voice's own where the groove
  // plays (`bedGain`), not that note's (the deep review of 10-12: the first note carried its section's lift, so a form
  // whose first bed note fell in a breakdown played every bloom 8.5 dB hotter, and one in a quieter section 9 dB under)
  const bedT = templates.bed;
  const PL = R.pad.lean;
  if (bedT) for (const B of R.pad.blooms) {
    const { bar, step } = abs(B.at);
    if (bar < from || bar >= to) continue;
    const deg = I.degreeAt(B.over === 'arrival' ? bar + Math.ceil(B.bars) : bar);
    // the voicing folded under its ceiling, each note once
    const sh = R.pad.shift ?? 0;
    const midis = [...new Set(B.notes.map((x) => { let m = pitch(deg, R.pad.rootFloor + sh, x); while (B.top != null && m > B.top + sh) m -= 12; return m; }))].sort((a, b) => a - b);
    // spread across the field, alternately left and right, the low voices near the middle and the high ones wide
    const dur = B.bars * bs;
    // the level walked across the entry (a swell toward its end) and, where it fades, a squared fall over its last bars
    const lvl = (x: number) => (B.rise ? dbToGain(B.rise[0] + (B.rise[1] - B.rise[0]) * x) / dbToGain(B.rise[1]) : 1);
    let path: number[] | null = null;
    if (B.rise || B.fadeBars) {
      path = [];
      const f0 = B.fadeBars ? Math.max(dur * 0.35, dur - B.fadeBars * bs) : dur;
      for (let k = 0; k <= 8; k++) { const t = f0 * k / 8; path.push(round(t, 4), round(lvl(t / dur), 4)); }
      // (a build's line: the rise on its slope to the line or the cut, then out)
      if (B.into) { const e = (B.into.cut ?? B.into.bars) * bs; path.push(round(e, 4), round(lvl(Math.min(1.25, e / dur)), 4)); if (B.into.cut != null) path.push(round(e + 0.012, 4), 0); }
      else if (B.fadeBars) for (let k = 1; k <= 6; k++) { const t = f0 + (dur - f0) * k / 6; path.push(round(t, 4), round(lvl(t / dur) * (1 - k / 6) ** 2, 4)); }
    }
    midis.forEach((m, i) => {
      const { swell: _swell, ...p0 } = bedT.p as NoteParams & { swell?: unknown };
      const width = B.width && PL ? B.width * PL.width : B.width, air = B.air != null && PL ? round(Math.min(1, B.air * PL.air), 3) : B.air;
      const pan = width && midis.length > 1 ? round(Math.max(-1, Math.min(1, width * (i % 2 ? 1 : -1) * (0.35 + 0.65 * i / (midis.length - 1)))), 3) : null;
      const sends = air != null ? { direct: send(B.send).direct, returns: { 'field.hall': air } } : returnsOf(send(B.send));
      push({ ...bedT, t: tOf(bar, step), bar, step, note: I.noteName(m), part: 'study-pad', label: B.label ?? `pad bloom ${bar}`,
        p: { ...p0, midi: m, dur: round(B.into ? (B.into.cut ?? B.into.bars) * bs + (B.into.cut != null ? 0.012 : 0) : dur, 4), attack: B.attack, release: B.release, reverb: 0, delay: 0, gain: round(Number(I.bedGain ?? bedT.p.gain ?? 1) * dbToGain(R.pad.levelDb + (B.db ?? 0) + (PL?.db ?? 0)), 6), ...sends,
          ...(pan != null ? { panPath: pan } : {}), ...(path ? { gainPath: path } : {}) } }, 'pad-bloom');
    });
    say(bar, 'space', `pad bloom into the hall${midis.length > 2 ? ` (${midis.length} voices)` : ''}`);
  }

  // ----- the weather: its visits by span (the wind's one visit inside the window, or a whole track's spans) -----
  const spans: WeatherSpan[] = R.weather ?? (R.wind ? [{ from: R.window.from, to: R.wind.dropFrom, db: R.wind.db, send: R.wind.send, label: 'the wind\'s visit' },
    { from: R.wind.dropFrom, to: R.window.to, gone: true }] : []);
  for (const e of [...evs]) {
    if ((e.part !== 'weather' && e.part !== 'weather-upper') || !inWindow(e.t)) continue;
    const W = spans.find((w) => e.bar >= I.drop + w.from && e.bar < I.drop + w.to);
    if (!W) continue;
    if (W.gone) { e.p = { ...e.p, gone: 1 }; note(removed, 'weather'); continue; }
    // the level walked across the span (the wind rising toward an entry), at the note's start
    const across = W.rise ? W.rise[0] + (W.rise[1] - W.rise[0]) * Math.max(0, Math.min(1, (e.t / bs - (I.drop + W.from)) / Math.max(1, W.to - W.from))) : 0;
    const q: Record<string, unknown> = { gain: round(Number(e.p.gain ?? 1) * dbToGain((W.db ?? 0) + across), 6) };
    if (W.rise) {
      // and on across the note itself, so a long note keeps rising
      const d = Number(e.p.dur ?? 4), x0 = (I.drop + W.from) * bs, span = Math.max(1, W.to - W.from) * bs, path: number[] = [];
      for (let k = 0; k <= 4; k++) { const t = d * k / 4, u = Math.max(0, Math.min(1, (e.t + t - x0) / span)); path.push(round(t, 3), round(dbToGain(W.rise[0] + (W.rise[1] - W.rise[0]) * u - across), 4)); }
      q.gainPath = path;
    }
    if (W.send) Object.assign(q, returnsOf(send(W.send), false));
    if (W.air != null) q.returns = { ...((q.returns as Record<string, number>) ?? {}), 'field.hall': W.air };
    if (W.bright && Array.isArray(e.p.lpMul)) q.lpMul = (e.p.lpMul as number[]).map((x) => round(Math.min(4, x * W.bright!), 3));
    // the lid opened: the voice's own corner raised and the stage's darkening taken off, so the air above 6 kHz is there
    if (W.lid) { q.lidHz = W.lid; q.lpMul = [1, 1]; }
    if (W.pan) {
      // a slow pan across the span: a triangle from one side to the other and back, `panBars` a side to side
      const period = W.panBars ?? 12, x0 = (I.drop + (W.panAt ?? W.from)) * bs;
      // a triangle travels from side to side; a sine drifts, slowing at each side, so it never reads as a speaker test
      const at = (t: number) => { const ph = ((t - x0) / (period * bs)) % 2; const u = W.panShape === 'sine' ? (1 - Math.cos(Math.PI * ph)) / 2 : ph < 1 ? ph : 2 - ph; return round(W.pan![0] + (W.pan![1] - W.pan![0]) * u, 3); };
      const dur = Number(e.p.dur ?? 4) + 3, path: number[] = [];
      for (let x = 0; x <= dur + 1e-6; x += bs / 2) path.push(round(x, 3), at(e.t + x));
      q.panPath = path;
    }
    e.p = { ...e.p, ...q };
    e.label = W.label ?? 'weather';
  }

  // ----- 5. the drums -----
  const D = R.drums;
  const drumLayer = (e: PlanEvent) => e.layer === 'kick' || e.layer === 'clap' || e.layer === 'hats';
  const stepIn = (e: PlanEvent, bar: number) => (e.t - bar * bs) / s16;
  const byBar = new Map<number, PlanEvent[]>();
  for (const e of evs) if (drumLayer(e) && e.bar >= from && e.bar < to) { const l = byBar.get(e.bar) ?? []; l.push(e); byBar.set(e.bar, l); }
  const bar$ = (bar: number) => byBar.get(bar) ?? [];
  const gone = (e: PlanEvent) => { e.p = { ...e.p, gone: 1 }; };
  const isHat = (e: PlanEvent) => e.layer === 'hats';
  const isGhost = (e: PlanEvent) => e.voice === 'snareGhost' || e.p.hit === 'ghost';
  const isCrack = (e: PlanEvent) => I.isSnare(e.voice) && !isGhost(e);
  const near = (e: PlanEvent, bar: number, step: number, tol = 0.6) => Math.abs(stepIn(e, bar) - step) < tol;
  const live = (e: PlanEvent) => !e.p.gone;
  const ghostTemplate = (bar: number) => bar$(bar).find((e) => isGhost(e) && live(e)) ?? [...byBar.values()].flat().find((e) => isGhost(e));
  const crackTemplate = (bar: number) => bar$(bar).find((e) => isCrack(e) && live(e) && stepIn(e, bar) > 8) ?? [...byBar.values()].flat().find(isCrack);
  const addHit = (T: PlanEvent | undefined, bar: number, step: number, vel: number, gainScale: number, k: string): PlanEvent | undefined => {
    if (!T) return undefined;
    const off = stepIn(T, T.bar) - Math.round(stepIn(T, T.bar));
    // a hit cloned from the kit's own, never inheriting the template's filter, its sends or its removal
    const { gone: _g, hpPath: _h, lpPath: _l, returns: _r, direct: _d, ...p0 } = T.p as NoteParams & { gone?: number };
    const e = push({ ...T, t: round(tOf(bar, step + off), 6), bar, step, label: undefined, p: { ...p0, vel, gain: round(Number(T.p.gain ?? 1) * gainScale, 6) } }, k);
    const l = byBar.get(bar) ?? []; l.push(e); byBar.set(bar, l);
    return e;
  };
  const ghostAt = (bar: number, step: number, vel = D.ghost.vel) => {
    const T = ghostTemplate(bar);
    if (T) addHit(T, bar, step, vel, D.ghost.gainOf * (vel / Number(T.p.vel ?? vel)) ** 2 * (Number(T.p.gain) > 0.1 ? 1 : 2.5), 'ghost');
  };
  /** a ghost figure: each [step, weight] a ghost at the ghost's velocity times the weight */
  const ghosts = (bar: number, fig: ReadonlyArray<readonly [number, number]>) => { for (const [step, w] of fig) ghostAt(bar, step, D.ghost.vel * w); };
  const reVel = (e: PlanEvent, v: number) => {
    const was = Number(e.p.vel ?? 1);
    e.p = { ...e.p, vel: round(v, 4), gain: round(Number(e.p.gain ?? 1) * (v / was) ** 2, 6) };
  };
  const stateOf = (rel: number) => D.states.find((s) => rel >= s.from && rel < s.to);
  // the glue: a crash, a reverse-like swell and a riser, cloned from the track's own where it has one, else new
  const fxTemplate = (voice: string): PlanEvent => byVoice.get(voice)?.[0] ?? { t: 0, voice, layer: I.layerOf(voice), bar: 0, role: 'texture', p: {} };
  const soundingAt = (voice: string, t: number) => byVoice.get(voice)?.find((e) => !e.p.gone && Math.abs(e.t - t) < 0.05);
  const fxAt = (voice: string, t: number, p: NoteParams, label: string, k: string) => {
    const T = fxTemplate(voice);
    const { gone: _g, ...p0 } = T.p as NoteParams & { gone?: number };
    return push({ ...T, t: round(t, 6), bar: Math.floor((t + 1e-6) / bs), step: Math.round(((t / bs) % 1) * 16) % 16, part: undefined, role: 'texture', label, p: { ...p0, ...p } }, k);
  };
  const crashAt = (bar: number, label: string) => {
    // one crash on a downbeat: where one already sounds there it is sent into the hall instead of doubled
    const C = D.crash;
    const there = soundingAt('crash', tOf(bar, 0));
    if (there) { there.p = { ...there.p, ...returnsOf(send(C.send), false) }; there.label = there.label ?? label; return there; }
    const T = fxTemplate('crash');
    return fxAt('crash', tOf(bar, 0), { gain: round(Number(T.p.gain ?? C.gain) * dbToGain(C.db), 6), ...returnsOf(send(C.send), false) }, label, 'crash');
  };
  const swellInto = (bar: number, label: string, beats?: number) => {
    const W = D.swell;
    const there = soundingAt('swell', tOf(bar, 0));
    if (there) return there;
    return fxAt('swell', tOf(bar, 0), { dur: round((beats ?? W.beats) * I.beat, 4), gain: round(W.gain * dbToGain(W.db), 6), ...returnsOf(send(W.send), false) }, label, 'swell');
  };
  const tops = D.tops;
  const sweepTops = (bar: number, hz: [number, number], fromStep = 0) => {
    for (const e of bar$(bar)) if (isHat(e) && live(e) && stepIn(e, bar) >= fromStep - 0.4) {
      const x = Math.max(0, Math.min(1, (stepIn(e, bar) - fromStep) / Math.max(1, 16 - fromStep)));
      e.p = { ...e.p, lpPath: round(hz[0] * (hz[1] / hz[0]) ** x, 1) };
    }
  };
  // the bars of every `B` state's span, cloned from their source before any bar is rewritten
  const fadeSource = new Map<number, PlanEvent[]>();
  for (const st of D.states) if (st.state === 'B' && st.fade) for (let r = st.from; r < st.to; r++) {
    const src = I.drop + r + st.fade.source;
    // a source bar inside the window is the drums' own index of it, as the planner laid it (no bar is rewritten yet)
    fadeSource.set(I.drop + r, (src >= from && src < to ? byBar.get(src) ?? [] : evs.filter((e) => drumLayer(e) && e.bar === src)).filter((e) => !e.p.gone));
  }
  for (let bar = from; bar < to; bar++) {
    const rel = bar - I.drop;
    const found = stateOf(rel);
    const st: DrumState = found ?? { from: rel, to: rel + 1, state: 'S' };
    const hits = bar$(bar);
    // the top from another bar's (the straight hats withdrawn where the planner kept them)
    const source = st.topFrom != null ? bar$(bar + st.topFrom).filter((e) => isHat(e) && live(e)) : [];
    if (st.topFrom != null && source.some((e) => e.voice === 'hatShut') && hits.some((e) => isHat(e)) && !hits.some((e) => e.voice === 'hatShut')) {
      for (const e of hits) if (isHat(e)) gone(e);
      for (const e of source) {
        const c = push({ ...e, t: round(e.t - st.topFrom * bs, 6), bar, p: { ...e.p } }, 'hat-moved');
        byBar.get(bar)!.push(c);
      }
    }
    if (st.topVel) for (const e of bar$(bar)) if (isHat(e) && live(e)) reVel(e, Number(e.p.vel) * st.topVel);
    const answering = (rel - st.from) % 2 === 1;
    let what: string = st.state;
    if (st.state === 'R' && answering) {
      ghosts(bar, D.ghosts.answer);
      const H = D.hats.answering;
      for (const e of bar$(bar)) if (e.voice === 'hatSoft' && live(e)) {
        const s = Math.round(stepIn(e, bar));
        if (s === 2 || s === 10) reVel(e, Number(e.p.vel) * H.soft);
        else if (s === 6 || s === 14) reVel(e, Math.min(H.ceiling, Number(e.p.vel) * H.loud));
      }
      what = 'R (answering: ghosts on 7 and 15, the accents moved)';
    }
    if (st.state === 'X' && answering) {
      for (const e of bar$(bar)) {
        if (isCrack(e) && near(e, bar, 4)) e.t = round(e.t + 2 * s16, 6);
        else if (isGhost(e) && near(e, bar, 3.1, 0.5)) gone(e);
      }
      what = 'X (the quieter snare moved from 4 to 6)';
    }
    if (st.state === 'T' && bar$(bar).some((e) => e.voice === 'hatShut')) {
      // the soft hat where the kit has one, else its closed hat: a kit's own top, made straight
      const T = bar$(bar).find((e) => e.voice === 'hatSoft') ?? bar$(bar).find((e) => isHat(e) && e.voice !== 'hatOpen');
      for (const e of bar$(bar)) if (isHat(e)) gone(e);
      for (let s = 0; s < 16; s += 2) addHit(T, bar, s, s % 4 === 0 ? D.hats.straight[0] : D.hats.straight[1], 1, 'hat-straight');
      what = 'T (the straight top: soft hats on every eighth)';
    }
    if (st.state === 'T' && st.spotlight && rel >= st.spotlight[0] && rel < st.spotlight[1]) {
      for (const e of bar$(bar)) if (e.voice === 'hatSoft' && live(e)) reVel(e, Math.round(stepIn(e, bar)) % 4 === 0 ? D.hats.spotlight[0] : D.hats.spotlight[1]);
      if ((rel - st.spotlight[0]) % 2 === 1) ghosts(bar, D.ghosts.answer);
      what = 'T (the spotlight: wider accents, ghosts on the answering bar)';
    }
    if (st.thin || D.thinBars?.includes(rel)) {
      // under a phrase: the ghosts and the open hat out, the tops a little softer
      for (const e of bar$(bar)) if (live(e) && (isGhost(e) || e.voice === 'hatOpen')) gone(e);
      for (const e of bar$(bar)) if (live(e) && isHat(e)) reVel(e, Number(e.p.vel) * D.hats.thin);
      what += ' thinned under the voice';
    }
    if (st.state === 'O') { for (const e of bar$(bar)) gone(e); what = 'none'; }
    if (st.space) {
      for (const e of bar$(bar)) if (live(e) && I.isSnare(e.voice)) e.p = { ...e.p, ...returnsOf(send(st.space), false) };
      what += `, its snares into the ${st.space} space`;
    }
    if (st.state === 'B' && st.fade) {
      // the build: the drums of the arrival cloned in through a high-pass walking down, their level walking up
      for (const e of bar$(bar)) gone(e);
      const x = (rel - st.from) / Math.max(1, st.to - st.from);
      for (const e of fadeSource.get(bar) ?? []) {
        const s0 = (e.t - e.bar * bs) / s16, xi = Math.min(1, x + s0 / 16 / Math.max(1, st.to - st.from));
        const hz = round(st.fade.hp[0] * (st.fade.hp[1] / st.fade.hp[0]) ** xi, 1), db = st.fade.db[0] + (st.fade.db[1] - st.fade.db[0]) * xi;
        const { gone: _g, ...p0 } = e.p as NoteParams & { gone?: number };
        const c = push({ ...e, t: round(tOf(bar, s0), 6), bar, p: { ...p0, hpPath: hz, gain: round(Number(e.p.gain ?? 1) * dbToGain(db), 6) }, label: 'the build: the drums fading in' }, 'build-hit');
        const l = byBar.get(bar) ?? []; l.push(c); byBar.set(bar, l);
      }
      what = `B (the arrival's drums fading in through a high-pass ${Math.round(st.fade.hp[0])}->${Math.round(st.fade.hp[1])} Hz)`;
    }
    if (st.state === 'H') {
      const crack = bar$(bar).find((e) => isCrack(e) && live(e) && stepIn(e, bar) > 8);
      for (const e of bar$(bar)) {
        const s = stepIn(e, bar);
        if (I.isKick(e.voice)) { if (s > 1) gone(e); continue; }
        if (e === crack) { e.t = round(tOf(bar, 8) + (s - Math.round(s)) * s16, 6); continue; }
        if (I.isSnare(e.voice)) { gone(e); continue; }
        if (isHat(e)) { const r = Math.round(s); if (e.voice !== 'hatSoft' || r % 4 !== 2) gone(e); else reVel(e, Number(e.p.vel) * D.hats.breath); }
      }
      what = 'H (kick on 1, snare on 3, offbeat hats)';
    }
    const ends = D.endings.filter((x) => x.bar === rel).flatMap((x) => x.end);
    const endSays = D.endings.filter((x) => x.bar === rel).map((x) => x.says).filter(Boolean).join('; ');
    for (const end of ends) {
      const here = bar$(bar).filter(live);
      const kickT = () => bar$(bar).find((e) => I.isKick(e.voice) && live(e)) ?? [...byBar.values()].flat().find((e) => I.isKick(e.voice));
      if (end === 'fill') {
        // a pickup fill: the snare's own hits over the last beats, rising, the last one thrown into the echo
        const F = D.fill;
        for (const e of here) if (!I.isKick(e.voice) && stepIn(e, bar) >= F.steps[0] - 0.4) gone(e);
        let last: PlanEvent | undefined;
        const C = crackTemplate(bar), cv = Number(C?.p.vel ?? 0.8);
        F.steps.forEach((st16, i) => { last = addHit(C, bar, st16, F.vel[i], Math.sqrt(F.vel[i] / cv), 'fill') ?? last; });
        if (last) last.p = { ...last.p, ...returnsOf(send('snareDeparture'), false) };
      }
      if (end === 'roll') {
        // the accelerating roll into an arrival: eighths, then sixteenths, then thirty-seconds over the last beat, rising
        const A = D.accel;
        for (const e of here) if (!I.isKick(e.voice) && !isHat(e) && stepIn(e, bar) >= A.from - 0.4) gone(e);
        const at: number[] = [];
        for (let x = A.from; x < 8; x += 2) at.push(x);
        for (let x = Math.max(8, A.from); x < 12; x += 1) at.push(x);
        for (let x = Math.max(12, A.from); x < 15.5; x += 0.5) at.push(x);
        let last: PlanEvent | undefined;
        const C = crackTemplate(bar), cv = Number(C?.p.vel ?? 0.8);
        at.forEach((x, i) => { const v = A.vel[0] + (A.vel[1] - A.vel[0]) * (i / Math.max(1, at.length - 1)); last = addHit(C, bar, x, round(v, 3), Math.sqrt(v / cv), 'roll') ?? last; });
        if (last) last.p = { ...last.p, ...returnsOf(send('snareDeparture'), false) };
      }
      if (end === 'snarePickup' || end === 'ghostTail' || end === 'ghostTurn' || end === 'ghostAnswer') ghosts(bar, D.ghosts[end]);
      if (end === 'kickPickup') addHit(kickT(), bar, 14, 0.7, 0.7, 'kick-pickup');
      if (end === 'kickBack' && !bar$(bar).some((e) => I.isKick(e.voice) && live(e))) {
        for (const e of bar$(bar - 1).filter((x) => I.isKick(x.voice) && live(x))) addHit(e, bar, Math.round(stepIn(e, bar - 1)), Number(e.p.vel ?? 0.7), 1, 'kick-back');
      }
      if (end === 'openHatPickup') {
        const T = byVoice.get('hatOpen')?.[0];
        for (const e of here) if (isHat(e) && stepIn(e, bar) >= 13.6) gone(e);
        if (T) addHit(T, bar, 14, 0.7, 1, 'open-hat-pickup');
      }
      if (end === 'crash') crashAt(bar, `the crash on the landing at ${bar}, into the hall`);
      if (end === 'hatsBreathe') for (const e of here) if ((isHat(e) || isGhost(e)) && stepIn(e, bar) < 7.6) gone(e);
      if (end === 'reverseCymbal') swellInto(bar + 1, `the reverse swell into ${bar + 1}`);
      if (end === 'topsClose') sweepTops(bar, tops.closeHz as [number, number], 4);
      if (end === 'topsOpen') sweepTops(bar, tops.openHz as [number, number], 0);
      if (end === 'beatSilence') for (const e of bar$(bar)) if (live(e) && stepIn(e, bar) >= 11.6) gone(e);
      if (end === 'openEnding') for (const e of here) if ((isCrack(e) && stepIn(e, bar) > 10) || (isGhost(e) && stepIn(e, bar) > 10)) gone(e);
      if (end === 'halfBarBreath') for (const e of here) if (stepIn(e, bar) >= 7.6) gone(e);
      if (end === 'kickOut') for (const e of here) if (I.isKick(e.voice) && stepIn(e, bar) > 6) gone(e);
      if (end === 'shortRoll') {
        // the roll's gap is the snare's and the kick's: the hats carry on through it, so the mix never falls away
        for (const e of here) if ((stepIn(e, bar) > 12.4 && !isHat(e)) || (isGhost(e) && stepIn(e, bar) > D.roll.steps[0] - 0.5)) gone(e);
        D.roll.steps.forEach((s, i) => {
          if (i === D.roll.steps.length - 1) addHit(crackTemplate(bar), bar, s, D.roll.vel[i], 0.6, 'roll');
          else ghostAt(bar, s, D.roll.vel[i]);
        });
      }
      if (end === 'hatCut') for (const e of here) if (isHat(e) && stepIn(e, bar) >= 11.6) gone(e);
      if (end === 'snareDeparture') {
        const c = here.find((e) => isCrack(e) && stepIn(e, bar) < 8);
        if (c) { c.p = { ...c.p, ...returnsOf(send('snareDeparture'), false) }; say(bar, 'space', 'snare departure thrown into the echo'); }
      }
      if (end === 'topsDarken') for (const e of here) if (isHat(e) && stepIn(e, bar) >= D.darken.fromStep - 0.4) {
        if (e.voice === 'hatOpen') { gone(e); continue; }
        const x = Math.max(0, Math.min(1, (stepIn(e, bar) - D.darken.fromStep) / (16 - D.darken.fromStep)));
        e.p = { ...e.p, gain: round(Number(e.p.gain ?? 1) * dbToGain(D.darken.db * (0.35 + 0.65 * x)), 6) };
      }
      if (end === 'lastBeatEmpty') for (const e of bar$(bar)) if (live(e) && stepIn(e, bar) >= 11.6) gone(e);
    }
    if (found || ends.length) say(bar, 'drums', what + (ends.length ? `; ${ends.join(', ')}` : '') + (endSays ? ` (${endSays})` : ''));
  }

  // ----- the texture that hears the straight top -----
  // where the hats go straight the main line answers with a texture locked to the sixteenths, in and out with the state:
  // a shaker where the cast admits it, else the weather the cast already has gated at sixteenths, else the pad's tremolo
  const TX = R.texture;
  if (TX?.spans.length) {
    const live = evs.filter((e) => !e.p.gone);
    const hats = live.filter((e) => isHat(e) && e.bar >= from && e.bar < to);
    const meanPan = hats.length ? hats.reduce((a, e) => a + Number(e.p.pan ?? 0), 0) / hats.length : 0;
    const side = meanPan > 0.02 ? -1 : 1;
    const voicesNow = new Set(live.map(castVoice));
    const fullReturns = Object.values(R.returns).map((raw) => asSpace(raw));
    const shakerFits = voicesNow.has(TX.shaker.voice) || I.castWith([...voicesNow, TX.shaker.voice], fullReturns) <= I.ceiling;
    // the weather's template: its loudest note, so the gate's level does not hang on a quiet visit
    const weathers = live.filter((e) => e.part === 'weather');
    const weatherT = (weathers.length ? weathers : live.filter((e) => e.part === 'weather-upper')).sort((x, y) => Number(y.p.gain ?? 0) - Number(x.p.gain ?? 0))[0];
    const jitter = (k: number) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const G = TX.gate, Sh = TX.shaker;
    for (const sp of TX.spans) {
      const a = I.drop + sp.from, b = Math.min(to, I.drop + sp.to);
      if (b <= a || a < from) continue;
      const label = sp.label ?? `the texture under the straight top ${a}-${b - 1}`;
      if (shakerFits) {
        const gain = I.ownGain(Sh.voice, Sh.db);
        const hit = (bar: number, step: number, vel: number, extra: Record<string, unknown> = {}) => push({ t: round(tOf(bar, step), 6), voice: Sh.voice, layer: I.layerOf(Sh.voice), bar, step, role: 'texture', part: 'texture', label,
          p: { vel: round(Math.max(0.05, Math.min(1, vel * (1 + Sh.jitter * (2 * jitter(bar * 16 + step) - 1)))), 4), gain: round(gain, 6), pan: round(side * Sh.pan, 3), ...extra } }, 'shaker');
        // in on a rising last beat, the sixteenths accented off the hats (the e and the a), out over the last half bar
        Sh.in.forEach((v, k) => hit(a - 1, 12 + k, v));
        for (let bar = a; bar < b; bar++) for (let st = 0; st < 16; st++) {
          const out = bar === b - 1 && st >= Sh.outFrom ? 1 - (1 - Sh.outTo) * (st - Sh.outFrom + 1) / (16 - Sh.outFrom) : 1;
          hit(bar, st, Sh.accents[st % 4] * out);
        }
        // the last hit, on the downbeat after the span, into the hall: only inside the track (a span to its end has none)
        if (b < I.bars) hit(b, 0, Sh.accents[1] * Sh.outTo, { direct: 1, returns: { 'field.hall': Sh.hall } });
        say(a, 'space', `shaker sixteenths ${a}-${b - 1}, off the hats, panned ${side < 0 ? 'left' : 'right'}`);
      } else if (weatherT) {
        // the weather gated: one note over the span with its way in and out, its level a sixteenth gate with the accents
        const t0 = (a - G.inBars) * bs, t1 = (b + G.outBars * 0.5) * bs, len = s16;
        const env = (t: number) => Math.min(1, Math.max(0, (t - t0) / (G.inBars * bs)), Math.max(0, (t1 - t) / (G.outBars * 0.5 * bs)));
        const path: number[] = [0, 0];
        for (let k = 0; t0 + k * len < t1 - 1e-6; k++) {
          const t = t0 + k * len, e = env(t), acc = G.accents[k % 4];
          path.push(round(t - t0 + 0.004, 4), round(G.floor * e, 4), round(t - t0 + 0.01, 4), round(acc * e, 4), round(t - t0 + len * G.holdShare, 4), round(G.floor * e, 4));
        }
        const { gone: _g, panPath: _pp, gainPath: _gp, returns: _r, direct: _d, ...p0 } = weatherT.p as NoteParams & { gone?: number };
        push({ ...weatherT, t: round(t0, 6), bar: a - G.inBars, step: 0, part: 'texture', label, p: { ...p0, dur: round(t1 - t0, 4), gain: round(Number(weatherT.p.gain ?? 1) * dbToGain(G.db), 6), gainPath: path, panPath: round(side * Sh.pan, 3), returns: { 'field.hall': G.hall } } }, 'weather-gate');
        say(a, 'space', `the weather gated at sixteenths ${a}-${b - 1}`);
      } else if (bedT) {
        // the pad's tremolo at sixteenths: the chord's fifth and seventh
        const deg = I.degreeAt(a), dur = (b - a) * bs, path: number[] = [];
        for (let k = 0; k * s16 < dur - 1e-6; k++) path.push(round(k * s16, 4), 1, round(k * s16 + s16 * 0.5, 4), round(1 - TX.tremolo.depth, 4));
        const { swell: _sw, ...p0 } = bedT.p as NoteParams & { swell?: unknown };
        const Tr = TX.tremolo;
        for (const x of Tr.notes) { const m = pitch(deg, R.pad.rootFloor + (R.pad.shift ?? 0), x); push({ ...bedT, t: tOf(a, 0), bar: a, step: 0, note: I.noteName(m), part: 'texture', label, p: { ...p0, midi: m, dur: round(dur, 4), attack: Tr.attack, release: Tr.release, gain: round(Number(I.bedGain ?? bedT.p.gain ?? 1) * dbToGain(R.pad.levelDb + Tr.db + (R.pad.lean?.db ?? 0)), 6), gainPath: path, reverb: 0, delay: 0 } }, 'pad-tremolo'); }
        say(a, 'space', `the pad's tremolo at sixteenths ${a}-${b - 1}`);
      }
    }
  }

  // ----- the drum-led builds into the drops and returns, and their landings (fast-drops) -----
  // the drums lead the line's last bar (or two) with the gesture the producer drew, stop where it says, and land on the
  // line; the bass's part (out, the landing's first note) and a whoosh's sweep are laid once the bass is written, below
  const heardBuilds: NonNullable<PassageResult['builds']> = [];
  const buildsLaid: Array<{ b: DropBuild; line: number; bar: number; startStep: number; stopStep: number; twoBar: boolean }> = [];
  {
    const laneOfHit = (e: PlanEvent): string | null => (I.isKick(e.voice) ? 'kick' : e.layer === 'clap' ? 'backbeat' : !isHat(e) ? null
      : e.voice === 'hatOpen' ? 'open' : e.voice === 'hatSoft' ? 'sixteenth' : 'offbeat');
    // every drum of a bar: the kit's lanes, and a texture's shaker or a part's hand drums with them (a stop is a stop)
    const drumsOfBar = (bar: number) => [...bar$(bar), ...evs.filter((e) => (e.layer === 'shaker' || e.layer === 'perc') && e.bar === bar)].filter(live);
    // a lane's own hit to copy: its strongest unfiltered hit on the line, the bar after it, or the window's own bars
    const templateOf = (lane: string, bars: number[]) => {
      for (const b of bars) {
        const xs = bar$(b).filter((e) => live(e) && e.p.hpPath === undefined && e.p.gainPath === undefined && laneOfHit(e) === lane && !(lane === 'backbeat' && isGhost(e)));
        if (xs.length) return xs.reduce((m, e) => (Number(e.p.vel ?? 0) > Number(m.p.vel ?? 0) ? e : m));
      }
      return undefined;
    };
    const copyHit = (T: PlanEvent, bar: number, step: number, level: number, label: string, chokeAt?: number) => {
      const off = stepIn(T, T.bar) - Math.round(stepIn(T, T.bar));
      // a copy of the kit's own hit, at `level` of its velocity, never its filter, its sends or its removal; a choked
      // hit's ring cut where the window ends, by a gain path on the hit
      const { gone: _g, hpPath: _h, lpPath: _l, returns: _r, direct: _d, gainPath: _gp, ...p0 } = T.p as NoteParams & { gone?: number };
      const t = round(tOf(bar, step + off), 6);
      const cutS = chokeAt !== undefined && chokeAt > step ? tOf(bar, chokeAt) - t : null;
      const e = push({ ...T, t, bar, step, label, p: { ...p0, vel: round(Number(T.p.vel ?? 1) * level, 4),
        ...(cutS !== null && cutS > 0.01 ? { gainPath: [0, 1, round(cutS - 0.008, 4), 1, round(cutS, 4), 0] } : {}) } }, 'build-hit');
      const l = byBar.get(bar) ?? []; l.push(e); byBar.set(bar, l);
      return e;
    };
    for (const b of D.builds ?? []) {
      const line = I.drop + b.line, bar = line - 1;
      if (bar < from || line > to) continue;
      const twoBar = b.beats * 4 > 16, startStep = twoBar ? 0 : 16 - Math.min(b.beats * 4, 16), stopStep = 16 - b.stop;
      const barsOf = twoBar ? [bar - 1, bar] : [bar], tpl = [line, line + 1, bar, bar - 1];
      const name = `${b.name} into ${line}`;
      let heard = 0;
      const lead = b.lead ? b.lead.lanes.map((l) => ({ l, T: templateOf(l, tpl) })).find((x) => x.T) ?? null : null;
      const leadAll = lead && b.lead ? b.lead.pattern.padStart(barsOf.length * 16, '.') : null;
      barsOf.forEach((bb, i) => {
        const first = twoBar && i === 0, fromStep = twoBar ? 0 : startStep;
        // the silence first (every drum lane out across the window), the rests, the lead lane cleared and played, the
        // lanes it adds over the last bar
        if (b.silence) for (const e of drumsOfBar(bb)) if (stepIn(e, bb) >= fromStep - 0.4) { gone(e); heard++; }
        for (const r of b.rest) if (r !== lead?.l && !(r === 'kick' && first)) {
          const f = r === 'kick' ? Math.max(fromStep, 8) : fromStep;
          for (const e of bar$(bb)) if (live(e) && laneOfHit(e) === r && stepIn(e, bb) >= f - 0.4) { gone(e); heard++; }
        }
        if (lead && leadAll) {
          for (const e of bar$(bb)) if (live(e) && laneOfHit(e) === lead.l && stepIn(e, bb) >= fromStep - 0.4) gone(e);
          const m = leadAll.slice(i * 16, i * 16 + 16);
          for (let st = 0; st < 16; st++) if (((m[st] >= '1' && m[st] <= '9') || m[st] === 'X') && (first || st < stopStep)) { copyHit(lead.T!, bb, st, m[st] === 'X' ? 1 : Number(m[st]) / 10, name); heard++; }
        }
        if (!first) for (const [r, pat] of Object.entries(b.lanes ?? {})) {
          if (r === lead?.l) continue;
          const T = templateOf(r, tpl) ?? (r === 'open' ? byVoice.get('hatOpen')?.find((e) => live(e) && e.p.hpPath === undefined && e.p.gainPath === undefined) : undefined);
          if (!T) continue;
          const m = pat.padStart(stopStep, '.').padEnd(16, '.');
          for (let st = 0; st < 16; st++) {
            if (m[st] === 'C') { copyHit(T, bb, st, 0.7, name, stopStep); heard++; }
            // (an added hit only where its lane plays none: the crack keeps its own; a quieter ghost yields to it)
            else if ((m[st] >= '1' && m[st] <= '9') || m[st] === 'X') {
              const level = m[st] === 'X' ? 1 : Number(m[st]) / 10, v = Number(T.p.vel ?? 1) * level;
              const there = bar$(bb).filter((e) => live(e) && laneOfHit(e) === r && Math.round(stepIn(e, bb)) === st);
              if (there.some((e) => !isGhost(e) || Number(e.p.vel ?? 1) >= v)) continue;
              for (const e of there) gone(e);
              copyHit(T, bb, st, level, name); heard++;
            }
          }
        }
      });
      // the stop: every drum out over the last sixteenths before the line
      if (b.stop > 0) for (const e of drumsOfBar(bar)) if (stepIn(e, bar) >= stopStep - 0.4) { gone(e); heard++; }
      // the landing: the kick alone (or the kick and the bass) through the line's first beat
      if (b.land === 'kick' || b.land === 'bass') for (const e of drumsOfBar(line)) if (!I.isKick(e.voice) && stepIn(e, line) < 3.6) gone(e);
      say(barsOf[0], 'drums', `the build into ${line}: ${b.label}`);
      if (b.land !== 'none') say(line, 'drums', b.land === 'stroke' ? 'the build lands: the crash on the one' : b.land === 'kick' ? 'the build lands: the kick alone through the first beat' : 'the build lands: the kick and the bass alone through the first beat');
      // the landing crash coloured by the birds (its size, its brightness, its ring)
      if (b.land === 'stroke' && b.stroke) { const c = soundingAt('crash', tOf(line, 0)); if (c) c.p = { ...c.p, ...glueParams(b.stroke, c.p) }; }
      buildsLaid.push({ b, line, bar, startStep, stopStep, twoBar });
      if (heard) heardBuilds.push({ line, kind: b.kind, beats: b.beats, stop: b.stop, land: b.land, into: b.into, big: true, label: b.label });
    }
  }

  // ----- the bass -----
  const bassAll = evs.filter((e) => e.layer === 'bass' && typeof e.p.midi === 'number' && !e.p.gone);
  const variant = (id: string | BassOp[]): BassOp[] => { if (Array.isArray(id)) return id; const v = R.bass.variants[id]; if (!Array.isArray(v)) throw new Error(`passage ${R.id}: no bass variant ${id}`); return v; };
  const bassFloor = R.bass.floor ?? 28;
  // the paths a glide carries on through the later note; the level (`directEnvelope`) is an envelope object and not a
  // knot list, so a glided note keeps the level its first note wrote, held at its last knot (following it moves the
  // sound of the glided runs, a listening round's question)
  const curveKeys = ['bend', 'directEnvelope', 'bodyCurve', 'subBeatCurve'] as const;
  for (const ph of R.bass.phrases) {
    const b0 = I.drop + ph.from;
    if (b0 < from || b0 >= to) continue;
    const riff = bassAll.filter((e) => e.t >= b0 * bs - 1e-6 && e.t < (b0 + 8) * bs - 1e-6).sort((a, b) => a.t - b.t);
    const notes: Array<PlanEvent | undefined> = [...riff];
    for (const op of variant(ph.variant)) {
      const ids = Array.isArray(op.i) ? op.i : op.i == null ? [] : [op.i];
      if (op.op === 'drop') { for (const i of ids) { const e = notes[i]; if (e) gone(e); } continue; }
      if (op.op === 'out') {
        // the line out over bars of the phrase: what starts inside goes, what sounds into it is cut at its edge
        const a = (b0 + (op.from ?? 0)) * bs, z = (b0 + (op.to ?? 8)) * bs;
        for (const e of notes) {
          if (!e || e.p.gone) continue;
          if (e.t >= a - 1e-6 && e.t < z - 1e-6) gone(e);
          else if (e.t < a && e.t + Number(e.p.dur) > a) e.p = { ...e.p, dur: round(Math.max(0.12, a - e.t - 0.02), 4) };
        }
        continue;
      }
      if (op.op === 'add' && op.at) {
        // a written answer: a new note of the chord in force, in the sound of the riff's own note it is cloned from
        const p = posOf(op.at), at = tOf(b0 + p.bar, p.step), len = (op.len ?? 4) * s16;
        // a melodic line's notes are cloned from the riff's own, never from one written before them (its level would compound)
        const live = (op.plain || op.db ? riff : notes).filter((x): x is PlanEvent => !!x);
        const T = (op.like != null ? notes[op.like] : undefined) ?? [...live].sort((x, y) => Math.abs(Number(x.p.dur) - len) - Math.abs(Number(y.p.dur) - len))[0] ?? bassAll[0];
        if (!T) continue;
        const midi = pitch(I.degreeAt(b0 + p.bar), bassFloor, op.deg ?? 0) + 12 * (op.oct ?? 0);
        const { gone: _g, bodyCurve: _bc, subBeatCurve: _sb, ...p0 } = T.p as NoteParams & { gone?: number };
        const d = round(len, 4);
        // a melodic note: a small scoop into its pitch and held there, its level flat, the riff's pair held at
        // its opening share (V's body), no accent
        const pair0 = Array.isArray(T.p.subBeatCurve) ? Number((T.p.subBeatCurve as number[])[1]) : null;
        const plain = op.plain ? { bend: [0, op.plain.st, op.plain.s, 0, d, 0], directEnvelope: { kind: 'points', curve: [0, 1, d, 1] }, curveDuration: d,
          ...(pair0 != null && pair0 > 0 ? { subBeatCurve: [0, pair0, d, pair0] } : {}) } : { ...(T.p.bodyCurve !== undefined ? { bodyCurve: T.p.bodyCurve } : {}), ...(T.p.subBeatCurve !== undefined ? { subBeatCurve: T.p.subBeatCurve } : {}) };
        const c = push({ ...T, t: round(at, 6), bar: b0 + p.bar, step: p.step, note: I.noteName(midi), label: ph.label ?? `bass ${b0}`,
          p: { ...p0, ...plain, midi, dur: d, ...(op.vel ? { vel: op.vel } : {}), ...(op.db ? { gain: round(Number(T.p.gain ?? 1) * dbToGain(op.db), 6) } : {}) } as NoteParams }, 'bass-answer');
        notes.push(c);
        continue;
      }
      const e = notes[ids[0]];
      if (!e) continue;
      if (op.op === 'octave') e.p = { ...e.p, midi: Number(e.p.midi) + (op.by ?? 12) };
      if (op.op === 'shift' && op.steps) { e.t = round(e.t + op.steps * s16, 6); e.bar = Math.floor((e.t + 1e-6) / bs); }
      if (op.op === 'repitch' && op.deg != null) e.p = { ...e.p, midi: pitch(I.degreeAt(e.bar), bassFloor, op.deg) + 12 * (op.oct ?? 0) };
      if (op.op === 'shorten' && op.beats) e.p = { ...e.p, dur: round(Math.min(Number(e.p.dur), op.beats * I.beat), 4) };
      if (op.op === 'trim' && op.bars) e.p = { ...e.p, dur: round(Math.min(Number(e.p.dur), op.bars * bs), 4) };
      if (op.op === 'move' && op.at) { const p = posOf(op.at); e.t = round(tOf(b0 + p.bar, p.step), 6); e.bar = b0 + p.bar; e.step = p.step; }
      if (op.op === 'copy' && op.at) {
        const p = posOf(op.at);
        const { gone: _g, ...p0 } = e.p as NoteParams & { gone?: number };
        const c = push({ ...e, t: round(tOf(b0 + p.bar, p.step), 6), bar: b0 + p.bar, step: p.step, p: { ...p0 } }, 'bass-copy');
        notes[op.as ?? notes.length] = c;
      }
      if (op.op === 'glide' && op.to != null) {
        // one connected run: the first note held on through the later one, its path gliding into the later one's
        // and then following it; the notes between and the later one are absorbed
        const g = notes[op.to];
        if (!g) continue;
        const dt = g.t - e.t, semis = Number(g.p.midi) - Number(e.p.midi);
        // a note with no path of its own keeps none (its curve's length is written only where it has one)
        const ext: Record<string, unknown> = { dur: round(dt + Number(g.p.dur), 4), ...(typeof e.p.curveDuration === 'number' ? { curveDuration: round(dt + Number(g.p.curveDuration ?? g.p.dur), 4) } : {}) };
        for (const k of curveKeys) {
          const a = e.p[k] as number[] | undefined, b = g.p[k] as number[] | undefined;
          if (!Array.isArray(a) || !Array.isArray(b)) continue;
          const head: number[] = [];
          for (let j = 0; j < a.length; j += 2) if (a[j] < dt - 0.06 - 1e-6) head.push(a[j], a[j + 1]);
          const tailVal = head.length ? head[head.length - 1] : a[1];
          const shift = k === 'bend' ? semis : 0;
          ext[k] = [...head, round(dt - 0.06, 4), tailVal, ...b.flatMap((v, i) => (i % 2 === 0 ? [round(v + dt, 4)] : [round(v + shift, 4)]))];
        }
        e.p = { ...e.p, ...ext };
        for (let j = ids[0] + 1; j <= op.to; j++) { const x = notes[j]; if (x && x !== e) gone(x); }
      }
    }
    say(b0, 'bass', typeof ph.variant === 'string' ? ph.variant : ph.label ?? 'written');
    for (const e of notes) if (e && !e.label) e.label = ph.label ?? `bass ${typeof ph.variant === 'string' ? ph.variant : 'written'} ${b0}`;
  }
  // every bend kept inside the riff's register: the passage's octaves, repitches and glides moved the notes the
  // planner's paths were written for, so the register is read after them
  if (R.bass.register) {
    const room = { ...R.bass.register, windowS: R.bass.register.windowSteps * s16 };
    for (const e of evs) {
      if (e.layer !== 'bass' || e.p.gone || !Array.isArray(e.p.bend) || !inWindow(e.t)) continue;
      const b = bendInRoom(e.p.bend as number[], Number(e.p.midi), bassFloor, room);
      if (b.some((v, i) => v !== (e.p.bend as number[])[i])) { e.p = { ...e.p, bend: b }; note(added, 'bend kept in its register'); }
    }
  }
  // the builds' bass: out from the window (or from the stop) to the line, and the landing's first note; a whoosh's
  // high-pass sweeping up across every pitched note sounding over its window, in octaves, gone on the line (fast-drops)
  for (const { b, line, bar, startStep, stopStep, twoBar } of buildsLaid) {
    const lineT = line * bs, w0 = tOf(twoBar ? bar - 1 : bar, startStep);
    // (a silence's bass a sixteenth early, its release gone by the time the drums stop)
    const a = b.bass === 'stop' ? tOf(bar, stopStep) : w0 - (b.silence ? s16 : 0);
    const isBass = (e: PlanEvent) => e.layer === 'bass' && typeof e.p.midi === 'number' && !e.p.gone;
    if (a < lineT - s16 / 2) for (const e of evs) {
      if (!isBass(e)) continue;
      if (e.t >= a - 1e-6 && e.t < lineT - s16 / 2) gone(e);
      else if (e.t < a && e.t + Number(e.p.dur) > a) e.p = { ...e.p, dur: round(Math.max(0.12, a - e.t - 0.02), 4) };
    }
    if (b.land === 'kick' || b.land === 'bass') {
      const lineNotes = evs.filter((e) => isBass(e) && e.t >= lineT - s16 / 2 && e.t < lineT + bs).sort((x, y) => x.t - y.t);
      const first = lineNotes[0], t1 = lineT + I.beat;
      if (first && first.t < t1 - 1e-6) {
        if (b.land === 'bass') {
          const top = Math.max(...lineNotes.map((e) => Number(e.p.vel ?? 1)));
          if (Number(first.p.vel ?? 1) < top) first.p = { ...first.p, vel: top };
        } else {
          // the first beat the kick's alone: the line's first note moved to the second beat (where none starts there),
          // every other note of the first beat out
          const onTwo = lineNotes.some((e) => Math.abs(e.t - t1) < 1e-3), d = Number(first.p.dur) - (t1 - first.t);
          for (const e of lineNotes) if (e.t < t1 - 1e-6 && (e !== first || onTwo || d <= 0.05)) gone(e);
          if (!onTwo && d > 0.05) { first.t = round(t1, 6); first.bar = line; first.step = 4; first.p = { ...first.p, dur: round(d, 4) }; }
        }
      }
    }
    if (b.hpHz) {
      const z = tOf(bar, stopStep), hz = b.hpHz;
      const corners = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ t: w0 + (z - w0) * f, hz: 30 * (hz / 30) ** f }));
      for (const e of evs) {
        const d = Number(e.p.dur ?? 0);
        if (typeof e.p.midi !== 'number' || e.p.gone || !PITCHED.has(e.layer) || e.p.hpPath !== undefined || !(e.t < lineT - s16 / 2 && e.t + d > w0)) continue;
        // (a note sounding from before the window: its path's first knot at the window's start)
        const path: number[] = [round(Math.max(0, w0 - e.t), 4), round(e.t >= w0 ? 30 * (hz / 30) ** Math.min(1, (e.t - w0) / (z - w0)) : 30, 4)];
        for (const c of corners) if (c.t > e.t + 1e-4) path.push(round(c.t - e.t, 4), round(c.hz, 4));
        if (e.t + d > lineT + 0.01) path.push(round(Math.max(lineT, e.t) - e.t, 4), round(hz, 4), round(lineT - e.t + 0.01, 4), 30);
        e.p = { ...e.p, hpPath: path };
      }
      say(bar, 'space', `the high-pass sweeping up to ${hz} Hz into ${line}`);
    }
    // the field cut through the stop (a full stop's whole window), back on the line or on its second beat: a gain path on
    // every chord, line, bed and weather note sounding there, times its own
    if (b.cut) {
      const E = b.cut.edgeS, f = dbToGain(b.cut.db);
      const cA = b.cut.from === 'window' ? w0 : b.cut.from === 'stop' ? tOf(bar, stopStep) : lineT, cZ = b.cut.to === 'beat' ? lineT + I.beat : lineT;
      const knots = [{ t: cA - E, f: 1 }, { t: cA + E, f }, { t: cZ - E, f }, { t: cZ + E / 4, f: 1 }];
      const at = (ks: Array<{ t: number; f: number }>, t: number) => {
        if (t <= ks[0].t) return ks[0].f;
        for (let i = 1; i < ks.length; i++) if (t <= ks[i].t) return ks[i - 1].f + (ks[i].f - ks[i - 1].f) * (t - ks[i - 1].t) / (ks[i].t - ks[i - 1].t);
        return ks[ks.length - 1].f;
      };
      let n = 0;
      for (const e of evs) {
        if (e.p.gone || e.layer === 'bass' || e.layer === 'shaker' || e.layer === 'perc' || !(PITCHED.has(e.layer) || FIELD_PARTS.has(String(e.part)))) continue;
        const end = e.t + Number(e.p.dur ?? 0) + Number(e.p.release ?? 0.5);
        // (a note struck on the line or after it, the landing's chord, plays whole: the cut is the build's)
        if (!(e.t < lineT - 1e-3 && end > cA - E)) continue;
        const own = typeof e.p.gainPath === 'number' ? [0, e.p.gainPath] : Array.isArray(e.p.gainPath) ? (e.p.gainPath as number[]) : [0, 1];
        const ownK = Array.from({ length: own.length / 2 }, (_, i) => ({ t: e.t + own[2 * i], f: own[2 * i + 1] }));
        const ts = [...new Set([...ownK.map((k) => k.t), ...knots.map((k) => k.t)].filter((t) => t >= e.t).map((t) => round(t - e.t, 4)))].sort((x, y) => x - y);
        if (ts[0] !== 0) ts.unshift(0);
        e.p = { ...e.p, gainPath: ts.flatMap((t) => [t, round(at(ownK, e.t + t) * at(knots, e.t + t), 4)]) };
        n++;
      }
      if (n) say(b.cut.from === 'window' ? (twoBar ? bar - 1 : bar) : bar, 'space', `the field cut ${b.cut.db} dB ${b.cut.from === 'window' ? 'through the silence' : b.cut.from === 'stop' ? 'through the stop' : 'on the line'}${b.cut.to === 'beat' ? ', back on the line\'s second beat' : ', back on the line'}`);
    }
  }

  // the dips rebuilt from the snares that now play (a note steps aside under each)
  const cracks = evs.filter((e) => isCrack(e) && !e.p.gone && e.t >= from * bs - bs && e.t < to * bs + bs).map((e) => e.t).sort((a, b) => a - b);
  for (const e of evs) {
    if (e.layer !== 'bass' || e.p.gone || !Array.isArray(e.p.dips) || !inWindow(e.t)) continue;
    const db = (e.p.dips as number[])[1] ?? -8;
    const d: number[] = [];
    // the first crack at or after the note's start (less 20 ms), then each until its end: the cracks are sorted
    const a = e.t - 0.02, z = e.t + Number(e.p.dur);
    let lo = 0, hi = cracks.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cracks[mid] >= a) hi = mid; else lo = mid + 1; }
    for (let i = lo; i < cracks.length && cracks[i] < z; i++) d.push(round(cracks[i] - e.t, 4), db);
    e.p = { ...e.p, dips: d };
  }

  // ----- the glue the arrangement writes: crashes into the hall, reverse-like swells into arrivals, risers -----
  for (const F of R.fx ?? []) {
    const { bar, step } = abs(F.at);
    if (bar < from || bar >= to) continue;
    const t = tOf(bar, step), label = F.label ?? `${F.kind} ${bar}`;
    if (F.kind === 'crash') crashAt(bar, label);
    else if (F.kind === 'swell') swellInto(bar, label, F.beats);
    else {
      const T = fxTemplate('riser');
      const gain = round(Number(T.p.gain ?? D.riser.gain) * dbToGain(F.db ?? 0), 6);
      fxAt('riser', t, { dur: round((F.beats ?? D.riser.beats) * I.beat, 4), gain, ...(F.send ? returnsOf(send(F.send), false) : {}), ...glueParams(F.sound, { gain }) }, label, 'riser');
    }
    say(bar, 'space', label);
  }

  // ----- the field's duck, from the drums' actual hits -----
  const U = R.duck, hits: Array<{ t: number; v: number }> = [];
  for (const e of evs) {
    if (e.p.gone || e.t < from * bs - 1e-6 || e.t > to * bs + 8) continue;
    if (I.isKick(e.voice)) hits.push({ t: e.t, v: dbToGain(U.kickDb) });
    else if (isCrack(e) && Number(e.p.vel ?? 0) >= U.principalVel) hits.push({ t: e.t, v: dbToGain(U.snareDb) });
  }
  hits.sort((a, b) => a.t - b.t);
  const pts: PlanPoint[] = [{ t: 0, value: 1 }];
  // every time here in seconds: the hold is the row's seconds, the recovery its beats at the theme's beat; a recovery
  // no longer than the hold has nothing to climb through, so a hit cut short by the next one is not divided by nought
  const recoverS = U.recoverBeats * I.beat, climbS = recoverS - U.holdS;
  hits.forEach((h, i) => {
    const next = hits[i + 1]?.t ?? Infinity;
    const at = (t: number, v: number) => { if (t > pts[pts.length - 1].t + 1e-4) pts.push({ t: round(t, 5), value: round(v, 5) }); };
    at(h.t - 0.001, Math.max(pts[pts.length - 1].value, h.v));
    at(h.t + U.attackS, h.v);
    if (next > h.t + U.holdS) at(h.t + U.holdS, h.v);
    if (next > h.t + recoverS) at(h.t + recoverS, 1);
    else at(next - 0.002, h.v + (1 - h.v) * (climbS > 0 ? Math.min(1, Math.max(0, (next - 0.002 - h.t - U.holdS) / climbS)) : 0));
  });

  // the field swelling into an arrival (its level in dB, rising from `from` to `to`, back over `release` beats), laid over
  // the duck's line: each point of either, the two multiplied
  const sw = (R.swells ?? []).map((x) => { const a = abs(x.from), b = abs(x.to); return { a: tOf(a.bar, a.step), b: tOf(b.bar, b.step), db: x.db, r: (x.release ?? 2) * I.beat }; })
    .filter((x) => x.b > from * bs - 1e-6 && x.a < to * bs);
  if (sw.length) {
    // overlapping swells do not stack: the field rises to the strongest one in force
    const swellAt = (t: number) => sw.reduce((g, x) => Math.max(g, t <= x.a || t >= x.b + x.r ? 1 : t <= x.b ? dbToGain(x.db * (t - x.a) / (x.b - x.a)) : dbToGain(x.db * (1 - (t - x.b) / x.r))), 1);
    let k = 0;
    const duckAt = (t: number) => { while (k + 1 < pts.length && pts[k + 1].t <= t) k++; const a = pts[k], b = pts[k + 1]; return !b ? a.value : a.value + (b.value - a.value) * (t - a.t) / Math.max(1e-6, b.t - a.t); };
    const ts = new Set(pts.map((x) => x.t));
    for (const x of sw) for (let t = x.a; t <= x.b + x.r + 1e-6; t += I.beat / 4) ts.add(round(t, 5));
    const all = [...ts].sort((a, b) => a - b).map((t) => ({ t, value: round(duckAt(t) * swellAt(t), 5) }));
    pts.length = 0;
    pts.push(...all);
    for (const x of sw) say(Math.floor(x.b / bs), 'space', `the field swells ${x.db > 0 ? '+' : ''}${x.db} dB into the arrival`);
  }

  // ----- long holds fade, never stop -----
  // a held keys chord or pad that ends while the music goes on fades over its last bars, held on past its written end
  // where nothing harmonic follows; one that ends into the next strike eases into it
  const H = R.holds;
  if (H) {
    // the rule is the ring's (`src/hygiene.ts`, `fadeHolds`); the producer resolves the row's fade in seconds by the
    // theme's time and its Tide (`fadeS`, `tailS`), and a row that names none plays its bars
    fadeHolds(evs, {
      fadeS: H.fadeS ?? H.fadeBars * bs, tailS: H.tailS ?? H.tailBars * bs, handoverS: H.handoverBeats * I.beat, leastS: H.leastS,
      easeDb: H.easeDb, easeS: 0.5 * bs, onsetLeastS: 0.25 * bs, endMarginS: bs,
      harmonic: (e) => H.layers.includes(e.layer) && e.part !== 'study-soloist' && e.part !== 'study-phrase' && e.part !== 'texture' && e.voice !== voiceName,
      inWindow, note: (k) => note(added, k),
    });
  }

  // the gone events out, the rest in time order
  const kept = evs.filter((e) => !e.p.gone);
  evs.length = 0;
  evs.push(...kept.sort((a, b) => a.t - b.t));

  // the returns under the phone's ceiling: where the cast would pass it, each return gives up what the row's admission
  // names, in order (a return chain's chorus, its filter, a whole send), and a note's key into a send gone is taken off
  const returns: Record<string, SpaceRow> = Object.fromEntries(Object.entries(R.returns).map(([id, raw]) => [id, structuredClone(asSpace(raw))]));
  const voicesNow = new Set(evs.map(castVoice));
  const budget = { before: I.castWith(voicesNow, Object.values(returns)), gave: [] as string[], after: 0 };
  for (const g of R.admission ?? []) {
    if (I.castWith(voicesNow, Object.values(returns)) <= I.ceiling) break;
    const r = returns[g.return];
    if (!r) continue;
    if (g.effect) {
      const sd = r.sends.find((x) => x.id === g.send);
      if (sd?.after?.some((x) => x.effect === g.effect)) { sd.after = sd.after.filter((x) => x.effect !== g.effect); budget.gave.push(`${g.return}.${g.send}'s ${g.effect}`); }
    } else if (r.sends.some((x) => x.id === g.send)) {
      r.sends = r.sends.filter((x) => x.id !== g.send);
      for (const x of r.sends) if (x.into?.[g.send] != null) { const { [g.send]: _gone, ...rest } = x.into; x.into = rest; }
      for (const e of evs) if (e.p.returns && typeof e.p.returns === 'object') {
        const { [`${g.return}.${g.send}`]: _off, ...rest } = e.p.returns as Record<string, number>;
        e.p = { ...e.p, returns: rest };
      }
      budget.gave.push(`${g.return}.${g.send}`);
    }
  }
  budget.after = I.castWith(voicesNow, Object.values(returns));

  const timeline = [...tl.entries()].sort((a, b) => a[0] - b[0]).map(([bar, r]) => ({ bar, drums: r.drums.join('; '), harmony: r.harmony.join('; '), bass: r.bass.join('; '), voice: r.voice.join('; '), space: r.space.join('; ') }));
  return {
    id: R.id, window: { from, to }, returns, budget,
    lines: Object.keys(returns).map((id) => ({ param: `returns.${id}.duck.gain`, points: pts })),
    removed, added, timeline,
    ...(R.drums.builds ? { builds: heardBuilds } : {}),
    summary: `the passage ${R.id} over bars ${from}-${to}: ${Object.values(added).reduce((a, b) => a + b, 0)} events written, ${Object.values(removed).reduce((a, b) => a + b, 0)} retired, the cast ${budget.after} units${budget.gave.length ? ` (the returns gave up ${budget.gave.join(', ')})` : ''}${keysVoice ? ', the phrases on the keys (the soloist over the ceiling)' : ''}`,
  };
}
