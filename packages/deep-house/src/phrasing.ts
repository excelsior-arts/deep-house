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
import GESTURES_FILE from '../recipes/arrangement/gestures.json' with { type: 'json' };
import { Rng } from './rng.ts';
import { lean } from './lean.ts';
import { weightOf, type Recipe } from './recipe.ts';
import { inBox, laneRoleOf, type SubSection } from './subsections.ts';
import type { LaneEdit, Letter } from './treatment.ts';
import type { MusicalTime } from './musical-time.ts';
import type { PhraseMap } from './phrase-map.ts';
import type { Spell } from './spell.ts';
import { planHatMoves, type HatMove, type HatSteps, type HatTransition } from './hat-moves.ts';
import { SEAMS, readSeam, type BarBed, type BarEnergy, type Direction, type SeamReading } from './seams.ts';
import { busyAt, callAt, vectorOf, type SceneBar } from './hat-scene.ts';

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
    filter: { hz: number; swellBeats: number; swellGain: number }; halfTime: { hz: number };
    /** U2e: more sub-segments, until no stretch of a long section runs unmarked past the shorter of `everyBars` and `everyS` */
    more?: { everyBars: number; everyS: number; longBars: number; longMostS: number; majorBars: number; majorLeastBars: number } };
  build: { level: number; rollFrom: number; stopStep: number; stopBeatStep: number; stopDb: number; cutS: number; edgeS: number; fieldDb: number; heldFieldDb: number };
  answers: { spacingPhrases: number; gestureBars: number; weights: W; crashGain: number; reverseBeats: number; reverseGain: number; breatheSteps: number;
    fieldDb: number; fieldDbDrop: number; leadBars: number; releaseBeats: number };
  outs: { into: Record<'drop' | 'return', W>; lean: W; withoutKick: number; fill: number;
    lift: { beats: Record<'drop' | 'return', number>; semitones: number; swellBeats: Record<'drop' | 'return' | 'break', number>; swellGain: number };
    dip: { hz: number } };
  cooldown: { phrases: W; keep: number; lean: W };
}

/** How a drop lands on its line (U2d): the theme's own stroke, the kick alone through the first beat, or the kick and the bass. */
export type LandingKind = 'stroke' | 'kick' | 'bass';
/**
 * **A build-and-drop gesture** (U2d, `recipes/arrangement/gestures.json`): a row of the vocabulary, read by the
 * interpreter below. Patterns are sixteenths right-aligned to the end of the gesture's window; every hit is a copy of
 * a hit the theme's own kit plays, every fx the glue's own voice where the theme already sounds it.
 */
export interface GestureRow {
  id: string; name: string; says?: string;
  /** how big a gesture it is, 1 to 3: a bigger arrival draws the bigger */
  size: number; weight: number;
  birds?: W; beats: W; stop: W; land: Partial<Record<LandingKind, number>>;
  /** the lane the pattern leads on: the first of `lanes` the kit plays (never a part's), cleared from the window's start */
  lead?: { lanes: string[]; pattern: string | Record<string, string> };
  /** other lanes' patterns, added */
  lanes?: Record<string, string | Record<string, string>>;
  /** a figure added over the line's last bar (a bar's sixteenths, ending where the stop starts) on the first of `lanes` the kit plays (never a part's): its hits only where the lane plays none (the whoosh's drums, his ear 10-13) */
  lift?: { lanes: string[]; pattern: string };
  /** lanes resting from the window's start */
  rest?: string[];
  /** the bass out from the window's start, out from the stop, or gated with the field */
  bass: 'window' | 'stop' | 'gate';
  field?: { cutDb?: number; cutFrom?: 'window'; gateDb?: number };
  /** the window is a stop: every drum lane silent across it (a part's hand drums too, as the stop), the gesture's own hits written after */
  silence?: boolean;
  fx?: { hpHz?: number; riserGain?: number; swellGain?: number };
  /** what the moment must offer: `swell` (the theme sounds the glue's swell and nothing lands on the line), `notIntoBreak`, `kick` (the kick plays in the build's bar: a whoosh's sweep is over the drums, never alone) */
  needs?: string[];
}
/** One parameter of the gestures' sound table: what it moves, the kinds it moves (every one where none is named), its unit, its birds' moves and its range. */
export interface SoundParam { of: string; kinds?: string[]; unit: 'octaves' | 'lean' | 'dB' | 'share'; birds: W; range: [number, number] }
export interface GestureFile {
  centre: Record<string, number | string>;
  choice: { size: Record<'big' | 'small', W>; recent: number; repeat: number; longer: { big: number } };
  landings: { big: W };
  /** how each gesture sounds by the birds: the one table (his word 10-13, "these effects should account for birds positions as well") */
  sound: { params: Record<string, SoundParam> };
  rows: GestureRow[];
}
/** The build-and-drop vocabulary, as written. */
export const GESTURES: Readonly<GestureFile> = GESTURES_FILE as unknown as GestureFile;

/**
 * **A gesture's sound by the birds** (his word 10-13 on U2d's pairs: "these effects should account for birds positions
 * as well"): each parameter of the table's move at a spell, about `centre` (the house's own birds; a fast place's own for
 * the producer's builds): the sum over its birds of the bird's move per unit times the bird's distance from the centre,
 * held to its range — nought at the centre, where nothing is written. Only the parameters that move are named.
 */
export function gestureSound(spell: Readonly<Record<string, number>>, centre: Readonly<Record<string, number | string>>, G: Readonly<GestureFile> = GESTURES): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, P] of Object.entries(G.sound.params)) {
    let x = 0;
    for (const [bird, k] of Object.entries(P.birds)) {
      const v = spell[bird], c = centre[bird];
      if (typeof v === 'number' && typeof c === 'number' && Number.isFinite(v) && v !== c) x += k * (v - c);
    }
    const y = Math.max(P.range[0], Math.min(P.range[1], x));
    if (y !== 0) out[id] = y;
  }
  return out;
}
/** A table parameter's move for one gesture: nought where it moves another kind. */
export const soundFor = (shift: Readonly<Record<string, number>>, id: string, kind: string, G: Readonly<GestureFile> = GESTURES): number =>
  (G.sound.params[id]?.kinds && !G.sound.params[id].kinds!.includes(kind) ? 0 : shift[id] ?? 0);
/**
 * A weight leaned per unit of a quantity by a lean parameter of the table (`roll.length` per doubling of the window,
 * `stop.length` per beat of the stop): the one lean of each of its birds on `units` of the move, multiplied in the
 * table's order (one bird is the same double the one lean gives), or the range's edge where the sum passes it.
 */
export function soundLean(spell: Readonly<Record<string, number>>, centre: Readonly<Record<string, number | string>>, id: string, units: number, G: Readonly<GestureFile> = GESTURES): number {
  const P = G.sound.params[id];
  if (!P || !units) return 1;
  let x = 0, f = 1;
  for (const [bird, k] of Object.entries(P.birds)) {
    const v = spell[bird], c = centre[bird];
    if (typeof v !== 'number' || typeof c !== 'number') continue;
    x += k * (v - c);
    f *= lean(k * units, v, 1, c);
  }
  return x < P.range[0] || x > P.range[1] ? Math.exp(Math.max(P.range[0], Math.min(P.range[1], x)) * units) : f;
}
/**
 * **A roll's density** (the table's `roll.density`): above nought, that share of the rests between its first hit and
 * its last filled, the latest first, each at the lower of its neighbours' levels; below, every other hit of its earliest
 * share thinned (its first kept), never in the last beat. A choked letter or a whole hit is a neighbour, never added.
 */
export function densified(pat: string, share: number): string {
  if (!share) return pat;
  const lvl = (c: string) => (c >= '1' && c <= '9' ? Number(c) : c === 'X' ? 10 : c === 'C' ? 7 : 0);
  const hits = [...pat].map((c, i) => (lvl(c) ? i : -1)).filter((i) => i >= 0);
  if (hits.length < 2) return pat;
  const a = hits[0], z = hits[hits.length - 1], out = pat.split('');
  if (share > 0) {
    const rests = [];
    for (let i = z - 1; i > a; i--) if (out[i] === '.') rests.push(i);
    const n = Math.round(rests.length * Math.min(1, share));
    for (const i of rests.slice(0, n)) {
      let l = i - 1; while (l > a && !lvl(pat[l])) l--;
      let r = i + 1; while (r < z && !lvl(pat[r])) r++;
      out[i] = String(Math.max(1, Math.min(9, lvl(pat[l]), lvl(pat[r]))));
    }
  } else {
    const early = hits.filter((i) => i < a + (pat.length - a) * Math.min(1, -share) && i < pat.length - 4);
    early.forEach((i, k) => { if (k % 2 === 1 && pat[i] !== 'C') out[i] = '.'; });
  }
  return out.join('');
}
/** One build as it was drawn (U2d): its line, the gesture, its length in beats, its stop in sixteenths, its landing, and whether the line is a big arrival. */
export interface Build { line: number; kind: string; beats: number; stop: number; land: LandingKind | 'none'; big: boolean;
  /** where it leads: a phrase's line inside a main, a drop, a main's return, a break */
  into: 'line' | 'drop' | 'return' | 'break' }

const FILE = PHRASING_FILE as unknown as { rows: PhrasingRow[] };
/** The phrasing rows, by id (`recipes/arrangement/phrasing.json`). */
export const PHRASING_ROWS: Readonly<Record<string, PhrasingRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/** A sub-segment as the ring may show it: its kind, its bars, the phrase function it answers and its name; what answered it (U2b). */
export interface Segment {
  kind: SegmentKind; from: number; to: number; fn: string; label: string; reentry: string | null; answered?: string[];
  /** the gesture its build into the line played, where heard (U2d) */
  build?: string;
  /** U2e: back in by the house's own one bar at this bar (the phrase's last), in place of a build of its own */
  houseEnd?: number;
}
/** A structural arrival answered: its bar, what arrives, and the answer's parts. */
export interface Answer { bar: number; by: string; into: string; parts: string[]; field: number; label: string }
/**
 * The bass out before an anchor, or across a cooldown, and what marks it (U2b, his ear 10-13: never a bare gap): the
 * fill on its last bar, the lift into the line (the bass's own glide, a reverse swell, or the gesture already there)
 * and the other voices' acknowledgement (the tops thinning, or the low-pass dipping).
 */
export interface Out { from: number; to: number; into: 'drop' | 'return' | 'break'; label: string; fill?: string | null; lift?: string[]; ack?: 'tops' | 'dip';
  /** the gesture its build into the line played, where heard (U2d) */
  build?: string }
/**
 * A glue note's colour by the birds (the gestures' sound table, nought or absent where the birds are the house's): its
 * noise band in octaves (`band`; a swell's `sweep` octaves under it at its onset), its fall after the line and its sends
 * against its direct sound (`tail`, a lean; `wet`, dB), and a landing stroke's level (`size`, dB), low-pass (`bright`,
 * octaves under 16 kHz) and ring (`decay`, a lean).
 */
export interface GlueSound { band?: number; sweep?: number; tail?: number; wet?: number; size?: number; bright?: number; decay?: number }
/** The glue's note parameters for a colour (the engine's `bandMul`, `sweep`, `tailMul`, the level held as the band moves; the sends' share by the level and `direct`; a stroke's level, its low-pass and its ring by a gain path); none where it is nought. */
export function glueParams(c: GlueSound | undefined, p: Readonly<Record<string, unknown>>, ringS = 2.4): Record<string, unknown> {
  if (!c) return {};
  const o: Record<string, unknown> = {}, r4 = (x: number) => +x.toFixed(4);
  if (c.band) o.bandMul = r4(2 ** c.band);
  if (c.sweep) o.sweep = r4(c.sweep);
  if (c.tail) o.tailMul = r4(Math.exp(c.tail));
  let g = typeof p.gain === 'number' ? p.gain : 1;
  // wetter: the note's level up and its direct share down by the same, so the direct sound holds and the sends move
  if (c.wet) { const w = 10 ** (c.wet / 20); g *= w; o.direct = r4(Math.min(2, 1 / w)); }
  if (c.size) g *= 10 ** (c.size / 20);
  // (a noise band moved down an octave carries half the power: its level held, 3 dB an octave)
  if (c.band) g *= 2 ** (-c.band / 2);
  if (c.wet || c.size || c.band) o.gain = +g.toFixed(6);
  if (c.bright) o.lpPath = Math.round(16000 * 2 ** c.bright);
  if (c.decay) { const d = ringS * Math.exp(c.decay); o.gainPath = [0, 1, r4(Math.min(0.05, d / 4)), 1, r4(d), 0]; }
  return o;
}
/** A gesture's glue colour off the table's moves (`gestureSound`): `glue` for a riser or a swell, `stroke` for a landing's stroke. */
export function glueSoundOf(shift: Readonly<Record<string, number>>, kind: string, what: 'riser' | 'swell' | 'stroke'): GlueSound | undefined {
  const c: GlueSound = {};
  const put = (k: keyof GlueSound, id: string) => { const v = soundFor(shift, id, kind); if (v) c[k] = v; };
  if (what === 'riser') { put('band', 'riser.band'); put('tail', 'glue.tail'); put('wet', 'glue.wet'); }
  if (what === 'swell') { put('band', 'reverse.band'); put('sweep', 'reverse.sweep'); put('tail', 'glue.tail'); put('wet', 'glue.wet'); }
  if (what === 'stroke') { put('size', 'landing.size'); put('bright', 'crash.bright'); put('decay', 'crash.decay'); }
  return Object.keys(c).length ? c : undefined;
}
/** A gesture the pass asks of the automation and the glue (U2b): a dip of the master's low-pass, a swell of the field, a reverse swell, the bass's glide. */
export interface Moves {
  /** the low-pass from `a` closed to `hz` by `b`, held, opened from `c` back to its own line at `d` (seconds); held closed to `d` and handed to the curve there where `hold` (a cooldown into its break) */
  dips: Array<{ a: number; b: number; c: number; d: number; hz: number; hold?: boolean; by?: SubSection;
    /** the opening's top at `d - edge`, octaves under the line's own there (the table's `filtered.open`), the line's own on `d` */
    top?: number; edge?: number;
    /** held closed into this next dip (its own opening kept in `reopen`, for where the next is not laid) */
    into?: Moves['dips'][number]; reopen?: { c: number; d: number } }>;
  /** the melodic bus shaped by factors at knots (seconds; 1 outside them): a build's rise, its stop, back on the line */
  gains: Array<{ knots: Array<{ t: number; f: number }>; by?: SubSection }>;
  /** a reverse swell into bar `bar`'s one, `beats` long (a reverse gesture's coloured by the birds: `sound`) */
  swells: Array<{ bar: number; beats: number; gain: number; by?: SubSection; sound?: GlueSound }>;
  /** the bass's glide into bar `bar`'s first note, from `semitones` under it over the last `beats` before the line */
  glides: Array<{ bar: number; beats: number; semitones: number; by?: SubSection }>;
  /** a crash on bar `bar`'s one (an overlaid fill's landing, where the theme sounds its crash and nothing lands there) */
  crashes: Array<{ bar: number; by?: SubSection; sound?: GlueSound }>;
  /** a high-pass sweeping up across every pitched note sounding from `a` to `z` (seconds), to `hz` at `z` and gone after it (U2d's whoosh) */
  hps: Array<{ a: number; z: number; hz: number; by?: SubSection }>;
  /** the bass gated on and off every sixteenth (`s16` seconds) from `a` to `z`, its off half at `depth` (U2d's stutter) */
  gates: Array<{ a: number; z: number; s16: number; depth: number; by?: SubSection }>;
  /** the glue's riser over the `beats` before bar `bar`'s one, at `gain`, where the theme sounds it (U2d's whoosh) */
  risers: Array<{ bar: number; beats: number; gain: number; by?: SubSection; sound?: GlueSound }>;
  /** a landing that moves the bass on bar `bar`: `kick`, its first note to the second beat; `bass`, its first note struck at the line's top (U2d) */
  landings: Array<{ bar: number; kind: 'kick' | 'bass'; by?: SubSection }>;
}
/**
 * **What a phrase's label may say** (the review of U2b: a label named marks that were never heard): each part of an
 * answer with what makes it true — its sub-section heard, its crash or swell struck on the line, its dip or glide laid.
 * The composer keeps the parts that hold and writes the label from them (`said`).
 */
export interface Said { text: string; by?: SubSection; crash?: number; swell?: number; dip?: Moves['dips'][number]; glide?: Moves['glides'][number];
  /** the gesture this part is the lead of (U2d): the build named on its segment or out where it holds */
  gesture?: string; build?: Build;
  /** the text where its dip ended held closed into the next (a filtered phrase into a cooldown or an out) */
  heldText?: string }
export interface Note { segment?: Segment; out?: Out; head: string; said: Said[]; tail: string }
/** A label from its head, the parts that hold and its tail. */
export const said = (n: Note, holds: (x: Said) => boolean): { label: string; parts: string[] } => {
  const parts = n.said.filter(holds).map((x) => (x.dip?.into && x.dip.hold && x.heldText ? x.heldText : x.text));
  return { label: `${n.head}${parts.length ? `; ${parts.join(', ')}` : ''}${n.tail}`, parts };
};

/** What the pass did: the track's `phrasing`, read by nothing new (the ring may show `segments` later). */
export interface Phrasing { segments: Segment[]; answers: Answer[]; outs: Out[]; cooldowns: Array<{ from: number; to: number; label: string }>; summary: string;
  /** every build heard, in line order: which gesture, how long, its stop and its landing (U2d) */
  builds?: Build[];
  /** the hats' moves at the transitions, as heard (hat-moves) */
  hats?: HatMove[];
  /** every noise transition read at its seam (hat-moves, `src/seams.ts`): kept, or refused for drum work or space */
  seams?: Seam[];
  /** what the scene did to the hats (round hat-scene, `src/hat-scene.ts`): the variations given another row's hats and
   * why, the hats' own hits it moved or took out, and the resting bars it filled */
  scene?: { varied: Array<{ bar: number; bars: number; from: string; to: string; why: string }>; shaped: number; out: number; filled: number[] } }
/** A noise transition read at its seam: the gesture or the glue row, its bar and line, the reading, and what played. */
export interface Seam { bar: number; line: number; what: string; dir: Direction; reading: SeamReading; verdict: 'kept' | 'drums' | 'space'; instead?: string }

/** The harmonic and melodic layers: what holds a chord or sings a line (the guards' own list, `tools/check-program-guards.ts`). */
export const TONAL_LAYERS: ReadonlySet<string> = new Set(['keys', 'pad', 'lead', 'stab', 'arp', 'pluck', 'piano', 'bell', 'vocal', 'strings', 'melodic']);

/** What a bar's kit plays, as the bar loop laid it. */
export interface BarKit {
  kick: boolean; backbeat: boolean; offbeat: boolean; earlyHats: boolean; bass: boolean;
  /** the tops sound in the bar: the sixteenth lane or the open hat (U2b: what thins under a filtered phrase and a cooldown) */
  tops?: boolean;
  /** the sixteenth lane sounds in the bar (U2b: an out's fill rolls on it where a track row owns the backbeat and the kick) */
  sixteenths?: boolean;
  /** the open hat sounds in the bar (U2d: what a gesture's rest of it would take) */
  open?: boolean;
  /** the groove's drums sound in the bar: the kick, the backbeat or the hats (the sixteenth lane alone is a part's colour, a pickup's) */
  drums: boolean;
  /** the space held without the bass: a harmonic or melodic note sounding in the bar, or the hats ticking (two onsets or more) */
  held: boolean;
  /** how much of the bar each held part sounds over (0 to 1): the bass, the held layer (the pad), the struck figure (the keys) */
  cover: { bass: number; drone: number; figure: number; harmony: number };
  /** the steps the hand part strikes on (hat-moves: where the hats leave room, where a gap answers) */
  hands?: number[];
  /** the drum onsets of the bar (the seams' energy) */
  onsets?: number;
  /** the steps the hats strike on (hat-moves: a gap only where it takes a hit) */
  hatSteps?: number[];
  /** the tonal voices sounding over a beat of the bar or more (the seams' energy: a pad or a lead entering or leaving) */
  voices?: number;
  /** the loudest hit of the open hat and of the closed hats (hat-moves: a mask on both hats copies the louder) */
  hatLoud?: { open: number; closed: number };
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
  can: { crash: boolean; reverse: boolean; glide?: boolean; swell?: boolean;
    /** the theme sounds the glue's riser (U2d: a whoosh's riser, never a voice the cast did not count) */
    riser?: boolean;
    /** the theme already strikes its stroke voice (U2d: a stroke landing is heard only where it does) */
    strokeSounds?: boolean;
    /** the glue's gates keep its noises in this theme (U2d: a reverse cymbal only where its swell will sound) */
    glue?: boolean };
  /** the theme's beat and bar, in seconds (U2b: the automation's gestures) */
  beatS?: number;
  /** the open hat's slot plays a voice the closed hats play too (U2d: an open hat resting would take the closed hats with it) */
  openShared?: boolean;
  /** roles no build edits, in the lane table's words (a part's: a pinned one, the listener's word, or one the composition drew, so the two play as one; only the stop's eighth silences them) */
  spare?: ReadonlySet<string>;
  /** the arrangement's own filter line moves between two bars (U2c review: no dip is laid there, so an out marks itself otherwise or is not taken) */
  filterMoves?: (fromBar: number, toBar: number) => boolean;
  /** bars another small thing owns (the rhythm development's pickups) */
  keep: ReadonlySet<number>;
  /** the roles an explicit part owns, in the lane table's words (a track row's rhythm cells, a pin): never edited */
  held: ReadonlySet<string>;
  /** the bed at a bar (the seams' texture): the held bed's hold, an air bed */
  bed?: (bar: number) => Omit<BarBed, 'hands'>;
  /** the open hat's hits, before any figure (hat-moves: a move on the open hat copies the theme's own) */
  openHits?: ReadonlyArray<{ bar: number; step: number }>;
  /** a house glue row would sound its slot's voice into the line (the composer's own test: the slot's voice, its fx, no glue near);
   * without it every glue row is taken to sound (its bars are its own, never a hat move's) and none is read at its seam */
  glueWould?: (slot: string, line: number, bars: number) => boolean;
  /** the open hat's ring to -10 dB, in seconds (hat-moves: a choke, a lift or a wash needs a hat that rings) */
  openRing?: number;
  /** the scene at a bar (round hat-scene): what the theme's own voices strike on its sixteenths; without it the hats'
   * moves read no vector and no figure (a track recipe's or a pin's parts are never read) */
  scene?: (bar: number) => SceneBar | null;
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
// likely need more like a build up and drop kind of approach") and **its vocabulary** (U2d; his word 10-13 on the
// Dubstep spell's out: "this is exactly what we needed, and likely need more, as in generated music, variety is a
// saving straw"): every build plays a gesture of `recipes/arrangement/gestures.json` — a snare roll, a hat roll into a
// choked open hat, the kick doubling, a stutter, a whoosh, a full stop with one hit, a reverse cymbal — drawn per
// moment. Its hits are copies of the theme's own (`playSubSections`), over a track row's own drums an overlay on the
// window's bars alone (U2b's `overlay`). Every other bar of the row is its own.
/** The lane a build leads on: the backbeat where the kit has one, else its closed hats, its sixteenths, its kick (U2c's order: a build is laid where one of them plays). */
type RollLane = 'backbeat' | 'offbeat' | 'sixteenth' | 'kick';
/** A pattern's letters: a digit is a hit at that many tenths of the copied hit's level. */
const DIGITS: Readonly<Record<string, Letter>> = Object.freeze(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), { level: (i + 1) / 10 }])));
/** A gesture's pattern for a window of `n` sixteenths: its own for the window's beats where it names one per length, right-aligned and cut from the left. */
const patternOf = (spec: string | Record<string, string>, beats: number, n: number): string => {
  const raw = typeof spec === 'string' ? spec : spec[String(beats)] ?? spec[Object.keys(spec).sort((x, y) => Number(y) - Number(x))[0]] ?? '';
  return raw.length >= n ? raw.slice(raw.length - n) : '.'.repeat(n - raw.length) + raw;
};
const BEAT_WORDS: Readonly<Record<number, string>> = { 1: 'the last beat', 2: 'the last two beats', 4: 'the last bar', 8: 'the last two bars' };
const STOP_WORDS: Readonly<Record<number, string>> = { 2: 'eighth', 4: 'beat' };
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

export function planPhrasing(I: PhrasingInput): { phrasing: Phrasing; subs: SubSection[]; moves: Moves; notes: Note[]; refusedGlue: string[]; hatBars: ReadonlySet<number> } {
  const R = I.row, T = I.time, L = I.map.time.phraseBars, bs = T.barS, beat = I.beatS ?? bs / 4;
  const segments: Segment[] = [], answers: Answer[] = [], outs: Out[] = [], cooldowns: Phrasing['cooldowns'] = [];
  const subs: SubSection[] = [];
  const moves: Moves = { dips: [], gains: [], swells: [], glides: [], crashes: [], hps: [], gates: [], risers: [], landings: [] };
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
  // (the house's own alone: a gesture's lead-in bar and a landing's line never sit on them, U2d)
  const houseMarked: ReadonlySet<number> = new Set(marked);
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

  // **The build and the drop into a line** (U2c, his ear 10-13 on U2b: "a build up and drop kind of approach"; U2d,
  // "variety is a saving straw"): on the line's last bar (or its last two) the drums build with a gesture of the
  // vocabulary, the drums stop (an eighth, a beat, or not at all; the bass out where it may leave, the field cut
  // `stopDb`), and the drop lands (the theme's own stroke, the kick alone through the first beat, or the kick and the
  // bass). A build is laid where U2c laid one (a lane the kit plays); which gesture is drawn after every build of the
  // theme is placed, in line order, so no kind follows itself (`realize` below). The other voices are timed to it: the
  // bass out from the window, the field rising `fieldDb` with it, a filter cut closed (`filter`) and opening with it to
  // the stop — never a fade.
  interface BuildOpts { rng: Rng; row?: Recipe | null; filter?: number; filterFrom?: number; hold?: boolean; field?: number; stop?: boolean; crash?: boolean; bass?: boolean;
    /** into a big arrival (a drop, a main's return): a bigger gesture, a longer one (U2d) */
    big?: boolean; into?: Build['into'] }
  /** A build placed, its gesture drawn later: its said parts are filled in place, and `done` hands its lead row to its segment or out. */
  interface Pending { line: number; kind: string; o: BuildOpts; said: Said[]; done?: (row: Recipe | null) => void;
    /** placed by U2e's second pass: its gesture drawn after every first-pass build's, so those stay as they were drawn */
    more?: boolean }
  const pending: Pending[] = [];
  const buildInto = (line: number, kind: string, o: BuildOpts): Pending => {
    const p: Pending = { line, kind, o, said: [] };
    pending.push(p);
    return p;
  };
  const G = GESTURES, spellOf = I.spell as unknown as Record<string, number>;
  const leanG = (leans: W) => { let x = 1; for (const [bird, v] of Object.entries(leans)) { const c = G.centre[bird]; if (typeof c === 'number') x *= lean(v, spellOf[bird], 1, c); } return x; };
  // the gestures' sound by the birds (the table's moves about the house's own: none at the house)
  const SH = gestureSound(spellOf, G.centre);
  // ----- the seams (hat-moves, `src/seams.ts`): a bar's energy as the kit plays it under the figures laid over it -----
  const seams: Seam[] = [];
  const ROLE_ENERGY: Readonly<Record<string, Array<keyof BarEnergy>>> = { kick: ['kick'], backbeat: ['backbeat'], offbeat: ['hats', 'tops'], sixteenth: ['tops'], open: ['tops'], bassline: ['bass'], figure: ['harmony', 'voices'], drone: ['harmony', 'voices'] };
  // (`dipped`: a bar under a low-pass not laid yet, the filtered phrase's own, which its build lays after its seam is read;
  // `voicesOnly`, round hat-scene: the scene's energy, the hats and their own figures left out, so the vector a hat move
  // leans to is what the other voices do across the seam)
  const energyAt = (b: number, dipped?: (b: number) => boolean, voicesOnly = false): BarEnergy | null => {
    if (b < 0 || b >= I.bars) return null;
    const k = I.kit(b);
    const e: BarEnergy = { kick: +k.kick, backbeat: +k.backbeat, hats: voicesOnly ? 0 : +k.offbeat, tops: voicesOnly ? +!!k.sixteenths : +!!k.tops, bass: +k.bass, harmony: k.cover.harmony, voices: k.voices ?? 0, onsets: k.onsets ?? 0 };
    for (const x of [...I.drawn, ...subs]) {
      if (b < x.startBar || b >= x.startBar + x.bars) continue;
      // (a variation the scene gave another row's hats is read as drawn: round hat-scene moves nothing but the hats)
      for (const [role, edit] of Object.entries((x.drawn ?? x.row)?.figure?.lanes ?? {})) {
        if (!editable(role) && !x.overlay) continue;
        if (voicesOnly && (role === 'offbeat' || role === 'open' || role === 'closed')) continue;
        const f = edit.mask ? 0.5 : edit.clear !== undefined && edit.until === undefined ? edit.clear / 16 : 1;
        for (const key of ROLE_ENERGY[role] ?? []) e[key] *= f;
      }
    }
    // (under a filtered phrase's low-pass the tops go and the harmony dulls: the cut's own energy, `energy.filtered`)
    const t0 = b * bs, t1 = (b + 1) * bs;
    if (dipped?.(b) || moves.dips.some((d) => t0 >= d.a - 1e-6 && t1 <= Math.max(d.c, d.b) + 1e-6)) for (const [k, f] of Object.entries(SEAMS.energy.filtered)) e[k as keyof BarEnergy] *= f;
    return e;
  };
  const bedAt = (b: number): BarBed | null => (b < 0 || b >= I.bars ? null : { ...(I.bed?.(b) ?? { hold: 0, air: false }), hands: !!I.kit(b).hands?.length });
  const seamAt = (bar: number, line: number, dir: Direction, dipped?: (b: number) => boolean) => readSeam(bar, line, dir, (b) => energyAt(b, dipped), bedAt);
  /** The build of one line, its gesture drawn after `prev` (the theme's last build's kind) and `used` (every kind it played). */
  /**
   * `dry`: the gesture drawn and nothing laid (every build's draw is known before any is laid, so a noise gesture swapped
   * for the drums never changes another build's draw); `near`, the kinds of the builds either side, drawn and as played
   * (a swap is never one of them). Returns the build as played and the kind drawn.
   */
  const realize = (p: Pending, avoid: ReadonlySet<string>, used: ReadonlySet<string>, busy: ReadonlySet<number>, dry = false,
    near: ReadonlySet<string> = new Set()): { build: Build | null; drawn: string } | null => {
    const { line, o } = p, bar = line - 1, k = I.kit(bar), items: Said[] = [];
    // a build and a stop edit the drums of their bar: an overlay wherever any drum lane they touch is a row's (the
    // review of U2c: a row owning the kick and the hats, not the backbeat, ticked its hats through the stop)
    const own = (['kick', 'backbeat', 'offbeat', 'sixteenth', 'open'] as const).some((r) => !editable(r));
    const spare = I.spare ?? new Set<string>(), lane = laneAt(bar), tLine = line * bs, E = B.edgeS;
    const intoBreak = o.stop === false, big = !!o.big, inBreak = sectionAt(bar)?.kind === 'breakdown';
    // a lane a gesture may play at a bar: the kit plays it there (never the hats in a breakdown, S6), and it is no part's
    const mayLane = (r: string) => !spare.has(laneRoleOf(r));
    const has = (r: string, at = bar) => {
      const x = I.kit(at);
      return mayLane(r) && (r === 'backbeat' ? x.backbeat : r === 'offbeat' ? x.offbeat && !inBreak : r === 'sixteenth' ? !!x.sixteenths : r === 'kick' ? x.kick : r === 'open' ? !inBreak : false);
    };
    // a lane a gesture's rest would quiet at this bar: one that sounds there (the open hat not where it is the closed
    // hats' own voice, which its rest skips)
    const rests = (r: string, at = bar) => { const x = I.kit(at); return mayLane(r) && (r === 'open' ? !!x.open && !I.openShared : r === 'offbeat' ? x.offbeat : r === 'sixteenth' ? !!x.sixteenths : r === 'kick' ? x.kick : r === 'backbeat' ? x.backbeat : false); };
    const leadOf = (g: GestureRow) => (g.lead ? g.lead.lanes.find((r) => has(r)) ?? null : null);
    const rng = new Rng(`${I.seed}::phrasing:gesture:${line}`);
    let gesture: GestureRow | null = null, beats = 2, stopSteps = 0;
    // (a noise gesture refused at its seam: the drums take its build, the line keeps the landings it was drawn for)
    let swappedFrom: GestureRow | null = null, drawnId: string | null = null, laid = false;
    // its length: two bars only where the bar before is the section's, plays drums and is no other small thing's
    // (and never over a track row's own drums: an overlay is that one bar's alone, U2b)
    const twoOk = !own && bar - 1 >= (sectionAt(bar)?.startBar ?? bar) && I.kit(bar - 1).drums && !houseMarked.has(bar - 1) && !busy.has(bar - 1);
    const lengthOf = (g: GestureRow): number => {
      const bw: W = {};
      for (const [x, wt] of Object.entries(g.beats)) {
        const n = Number(x), d = Math.log2(n / 2);
        if (n > 4 && !twoOk) continue;
        bw[x] = wt * soundLean(spellOf, G.centre, 'roll.length', d) * (big ? G.choice.longer.big ** d : 1);
      }
      return Number(weighted(rng, bw) ?? 2);
    };
    if (lane) {
      const needs = (g: GestureRow) => (g.needs ?? []).every((n) => (n === 'swell' ? !!I.can.swell && I.can.glue !== false && !I.gestured(line) : n === 'notIntoBreak' ? !intoBreak : n === 'kick' ? has('kick') : false));
      // a gesture with no lead lane is heard by what rests under it, by the lift it adds, or by its swell
      const admits = (g: GestureRow) => needs(g) && (g.lead ? !!leadOf(g) : (g.rest ?? []).some((r) => rests(r)) || !!g.lift?.lanes.some((r) => has(r)) || !!g.fx?.swellGain);
      const ok = G.rows.filter(admits);
      const size = G.choice.size[big ? 'big' : 'small'];
      const w = (g: GestureRow, repeat: number) => g.weight * (size[String(g.size)] ?? 1) * leanG(g.birds ?? {}) * (avoid.has(g.id) ? repeat : used.has(g.id) ? G.choice.recent : 1);
      // never the theme's last kind again, unless it is the only one the moment admits
      let pairs = ok.map((g) => ({ v: g, w: w(g, G.choice.repeat) })).filter((x) => x.w > 0);
      if (!pairs.length) pairs = ok.map((g) => ({ v: g, w: w(g, 1) })).filter((x) => x.w > 0);
      gesture = pairs.length ? rng.weighted(pairs) : null;
      // **a noise gesture earns its place** (hat-moves; his word 10-16): read at its seam, kept at the reading's share off
      // a die of its own; refused, the drums build instead (a gesture of the drums, off a stream of its own), or nothing
      const dir = gesture ? SEAMS.noise.gestures[gesture.id] : undefined;
      drawnId = gesture?.id ?? null;
      if (gesture && dir && !dry) {
        // (read over the window as it is laid: a two-bar one from the bars before its first)
        beats = lengthOf(gesture);
        laid = true;
        // (out of a filtered phrase, its bars before the line are under the low-pass this build lays)
        const reading = seamAt(bar - (beats > 4 ? 1 : 0), line, dir, o.filter ? (b) => b >= Math.round((o.filterFrom ?? bar * bs) / bs) && b < bar : undefined);
        const was = gesture.id;
        swappedFrom = gesture;
        if (!new Rng(`${I.seed}::phrasing:seam:${line}`).chance(reading.share)) {
          const alt = pairs.filter((x) => !SEAMS.noise.gestures[x.v.id] && !near.has(x.v.id));
          gesture = alt.length ? new Rng(`${I.seed}::phrasing:seam-draw:${line}`).weighted(alt) : null;
          laid = false;
          seams.push({ bar, line, what: was, dir, reading, verdict: gesture ? 'drums' : 'space', ...(gesture ? { instead: gesture.id } : {}) });
        } else seams.push({ bar, line, what: was, dir, reading, verdict: 'kept' });
      }
    }
    if (dry) return drawnId ? { build: null, drawn: drawnId } : null;
    if (gesture) {
      if (!laid) beats = lengthOf(gesture);
      // (the longer stop leaned by the birds, per beat of it: `stop.length`)
      const sw: W = SH['stop.length'] ? Object.fromEntries(Object.entries(gesture.stop).map(([x, wt]) => [x, wt * soundLean(spellOf, G.centre, 'stop.length', Number(x) / 4)])) : gesture.stop;
      stopSteps = intoBreak ? 0 : Number(weighted(rng, sw) ?? 0);
    }
    // the window: from its start to the stop's first step (the line where there is no stop)
    // the landing: drawn among those the line takes (never into a break)
    let land: LandingKind | 'none' = 'none';
    if (gesture && !intoBreak && o.crash !== false) {
      const struckThere = answers.some((x) => x.bar === line && x.parts.includes('crash'));
      // (the line is the next phrase's: never a track row's own drums, whose bars past the build are the row's, U2b)
      const lineFree = !own && line < I.bars && !houseMarked.has(line) && !pending.some((q) => q.line === line + 1) && I.kit(line).kick && !I.gestured(line) && !struckThere;
      const okL: Record<LandingKind, boolean> = {
        stroke: I.can.crash || I.gestured(line),
        kick: lineFree && !moves.glides.some((g) => g.bar === line) && (editable('bassline') || !I.kit(line).bass),
        bass: lineFree && editable('bassline') && I.kit(line).bass,
      };
      const lw: W = {};
      const was = swappedFrom?.land, keepsWas = !!was && Object.keys(gesture.land).some((x) => x in was);
      for (const [x, wt] of Object.entries(gesture.land)) if (okL[x as LandingKind] && (!keepsWas || x in was!)) lw[x] = (wt ?? 0) * (big ? G.landings.big[x] ?? 1 : 1);
      land = (weighted(rng, lw) as LandingKind | null) ?? 'none';
    }
    // a big arrival lands on silence (an eighth's stop at least, where the gesture has none of its own) where nothing
    // else is heard there (no stroke the theme sounds, no gesture there, no landing of the kick or the bass), and
    // under a sweep that plays no drum of its own (a whoosh: the drums would tick on into the drop)
    if (gesture && big && !intoBreak && stopSteps === 0 && !gesture.silence && gesture.field?.gateDb === undefined && !gesture.fx?.swellGain
      && ((!gesture.lead) || (!(land === 'stroke' && (I.gestured(line) || I.can.strokeSounds !== false)) && land !== 'kick' && land !== 'bass'))) stopSteps = 2;
    // the window: its beats before the line on the bar's grid, to the stop's first step (the line where there is none)
    const twoBar = !!gesture && beats * 4 > 16;
    const startStep = !gesture ? 8 : twoBar ? 0 : 16 - Math.min(beats * 4, 16);
    // (a stop leaves the window a beat at least)
    if (gesture && 16 - stopSteps - startStep < 4 && !twoBar) stopSteps = 0;
    const stopStep = gesture ? 16 - stopSteps : B.stopStep;
    const w0 = twoBar ? (bar - 1) * bs : bar * bs + startStep * s16, tEnd = bar * bs + stopStep * s16;
    let lead: SubSection | null = null, row: Recipe | null = null;
    const leadLane = gesture ? leadOf(gesture) : null;
    if (gesture?.silence) {
      // a full stop's window silences every drum lane as the stop does (an overlay always), before its one hit is written
      const st = sub('drop-out', stopFrom(startStep), bar, 1, `the silence ${bar}`);
      st.overlay = true;
      subs.push(st);
    }
    if (gesture) {
      const barsOf = twoBar ? [bar - 1, bar] : [bar];
      // the lead's pattern on the bar's grid, ending on the line (the stop takes its tail); an added lane's ends where
      // the window ends (an accent into the stop)
      const span = barsOf.length * 16;
      // (a roll's density by the birds: `roll.density`)
      const dense = soundFor(SH, 'roll.density', gesture.id);
      const leadAll = gesture.lead ? densified(patternOf(gesture.lead.pattern, beats, beats * 4), dense).padStart(span, '.') : null;
      // the lift: a figure on the first of its lanes the kit plays in the last bar, the lead's lane never
      const liftLane = gesture.lift?.lanes.find((r) => r !== leadLane && has(r)) ?? null;
      for (const b of barsOf) {
        const first = twoBar && b === bar - 1, from = twoBar ? 0 : startStep, k0 = first ? 0 : span - 16;
        // the rests first, then the lead lane, then the lanes it adds (the open hat after the hats it rolls on)
        const lanes: Record<string, LaneEdit> = {};
        // (a resting kick keeps the last bar's first half: never a bar of no kick under an out, the guards' thin bar;
        // and the open hat never rests where it is the closed hats' own voice: it would take them with it)
        for (const r of gesture.rest ?? []) if (r !== leadLane && rests(r, b) && !(r === 'kick' && first))
          lanes[r] = { clear: r === 'kick' ? Math.max(from, 8) : from };
        if (leadLane && leadAll) lanes[leadLane] = { clear: from, mask: [leadAll.slice(k0, k0 + 16)] };
        if (!first) for (const [r, spec] of Object.entries(gesture.lanes ?? {})) {
          if (r === leadLane || !has(r, b)) continue;
          const m = patternOf(spec, beats, stopStep - startStep).padStart(stopStep, '.').padEnd(16, '.');
          if (/[^.]/.test(m)) lanes[r] = { mask: [m] };
        }
        // (the lift climbs into the stop, its hits only where its lane plays none or plays quieter: a ghost yields to it)
        if (!first && liftLane && gesture.lift && !lanes[liftLane]) {
          const m = densified(patternOf(gesture.lift.pattern, 4, stopStep), dense).padStart(stopStep, '.').padEnd(16, '.');
          if (/[^.]/.test(m)) lanes[liftLane] = { mask: [m], insert: 'over-quieter' };
        }
        if (!Object.keys(lanes).length) continue;
        // `C`: the open hat choked where the window ends
        const letters = { ...DIGITS, C: { level: 0.7, chokeAt: stopStep } };
        const r0 = figureRow(`phrasing/${gesture.id}+build+${leadLane ?? 'rests'}${first ? '+lead-in' : ''}${own ? '+over-a-row' : ''}`, gesture.name, 'fill', { lanes, letters });
        const s0 = sub('fill', r0, b, 1, `${gesture.name} into ${line}${own ? ', over the row\'s drums' : ''}`);
        if (own) { s0.overlay = true; s0.spare = spare; }
        subs.push(s0);
        if (!first) { lead = s0; row = r0; }
      }
    }
    // (a gesture with no lead lane is heard by its own sound, a sweep or a swell: its rests are its colour, not its proof)
    const by = lead && gesture?.lead ? { by: lead } : {};
    const stop = !!gesture && stopSteps > 0 && !intoBreak;
    if (stop) {
      // the stop silences every drum lane from its step, a part's hand drums with them (the review of U2c: the house's
      // hand-drum parts played through it), so it is an overlay always — on its own steps alone
      const st = sub('drop-out', stopFrom(stopStep), bar, 1, `the stop ${bar}`);
      st.overlay = true;
      subs.push(st);
      items.push({ text: `a stop on the last ${STOP_WORDS[stopSteps] ?? `${stopSteps} sixteenths`}`, by: st });
    }
    if (o.bass !== false && editable('bassline') && bassMayLeave(k)) {
      // (a silence's bass a sixteenth early, its release gone by the time the drums stop)
      const fromStep = !gesture ? Math.min(8, B.stopStep) : gesture.bass === 'window' ? Math.max(0, (twoBar ? 0 : startStep) - (gesture.silence ? 1 : 0)) : Math.min(stopStep, 16);
      if (fromStep < 16) {
        const bo = sub('drop-out', bassOutFrom(fromStep), bar, 1, `bass out ${bar}, the build's`);
        subs.push(bo);
        items.push({ text: `the bass out from step ${fromStep}`, by: bo });
      }
    }
    if (o.filter) {
      const a = o.filterFrom ?? bar * bs;
      // the cut and the opening's top by the birds (`filtered.cut`, `filtered.open`: darker at the heavy end, his ear
      // 10-13 on the Dubstep spell's reverse into a filtered phrase's line, "for dubstep a bit too bright")
      const hz = Math.round(o.filter * 2 ** (SH['filtered.cut'] ?? 0)), top = SH['filtered.open'];
      // into a break the low-pass is held closed and handed to the break's own (the review of U2b: it reopened over the
      // out's last beats and fell again with the break's cut, 9 kHz to 900 Hz in 50 ms)
      const dip = o.hold ? { a, b: a + B.cutS, c: tLine - 0.05 * bs, d: tLine - 0.05 * bs, hz, hold: true }
        : { a, b: a + B.cutS, c: Math.max(a + B.cutS + 0.01, w0), d: tEnd, hz, ...(top ? { top, edge: B.edgeS } : {}) };
      const m = { ...dip, ...by };
      moves.dips.push(m);
      items.push({ text: o.hold ? `the low-pass cut to ${hz} Hz into the break` : `the low-pass cut to ${hz} Hz and opening with the build`, dip: m,
        heldText: `the low-pass cut to ${hz} Hz and held closed into what follows` });
    }
    const landBeat = land === 'kick' || land === 'bass';
    // the field: rising with the build, cut through the stop (a full stop's whole window), back on the line (on its
    // second beat where the kick lands alone)
    const field = o.field ?? 0;
    if (!gesture) {
      if (field) {
        moves.gains.push({ knots: [{ t: w0, f: 1 }, { t: tEnd - E, f: gain(field) }, { t: tEnd + E, f: 1 }, { t: tLine - E, f: 1 }, { t: tLine + E / 4, f: 1 }], ...by });
        items.push({ text: `the field rising ${field} dB with it`, ...by });
      }
    } else {
      const cutWindow = gesture.field?.cutFrom === 'window', cutting = stop || cutWindow;
      const cut = gain(gesture.field?.cutDb ?? B.stopDb), cutA = cutWindow ? w0 : stop ? tEnd : tLine, cutZ = landBeat ? tLine + beat : tLine;
      if (field || cutting || landBeat) {
        const knots: Array<{ t: number; f: number }> = [];
        if (cutA - E > w0 + E) knots.push({ t: w0, f: 1 }, { t: cutA - E, f: gain(field) });
        else knots.push({ t: cutA - E, f: 1 });
        if (cutting || landBeat) knots.push({ t: cutA + E, f: cut }, { t: cutZ - E, f: cut }, { t: cutZ + E / 4, f: 1 });
        else knots.push({ t: tLine + E / 4, f: 1 });
        moves.gains.push({ knots: knots.filter((x, i) => i === 0 || x.t > knots[i - 1].t + 1e-6), ...by });
        if (field && !cutWindow) items.push({ text: `the field rising ${field} dB with it`, ...by });
      }
      // the stutter's gate: the field and the bass on and off each sixteenth across the window
      if (gesture.field?.gateDb !== undefined) {
        const g = gain(gesture.field.gateDb), e = E / 2, gk: Array<{ t: number; f: number }> = [{ t: w0 - e, f: 1 }];
        for (let t = w0; t < tEnd - 1e-6; t += s16) { const h = t + s16 / 2; gk.push({ t: h - e, f: 1 }, { t: h + e, f: g }, { t: t + s16 - e, f: g }, { t: t + s16 + e / 2, f: 1 }); }
        moves.gains.push({ knots: gk, ...by });
        if (o.bass !== false) moves.gates.push({ a: w0, z: tEnd, s16, depth: g, ...by });
        items.push({ text: 'the field and the bass gated in sixteenths', ...by });
      }
      if (gesture.fx?.hpHz) {
        // (its top by the birds: `whoosh.hp`)
        const hz = Math.round(gesture.fx.hpHz * 2 ** soundFor(SH, 'whoosh.hp', gesture.id));
        moves.hps.push({ a: w0, z: tEnd, hz, ...by });
        items.push({ text: `the high-pass sweeping up to ${hz} Hz`, ...by });
      }
      if (gesture.fx?.riserGain && I.can.riser && !I.gestured(line)) {
        const sound = glueSoundOf(SH, gesture.id, 'riser');
        moves.risers.push({ bar: line, beats: (tLine - w0) / beat, gain: gesture.fx.riserGain, ...by, ...(sound ? { sound } : {}) });
        items.push({ text: 'the riser under it', ...by });
      }
      if (gesture.fx?.swellGain) {
        // the cymbal is the gesture's own: over its whole window at its own level, in place of a shorter swell a filtered
        // phrase or an out's lift laid on the line (said once, by whoever laid it first)
        const had = moves.swells.findIndex((x) => x.bar === line), beats0 = (tLine - w0) / beat;
        // (its colour by the birds: the band, its opening, its tail and its sends)
        const sound = glueSoundOf(SH, gesture.id, 'swell');
        if (had >= 0) moves.swells[had] = { ...moves.swells[had], beats: Math.max(moves.swells[had].beats, beats0), gain: Math.max(moves.swells[had].gain, gesture.fx.swellGain), ...(sound ? { sound } : {}) };
        else if (swellInto(line, beats0, gesture.fx.swellGain, lead ?? undefined)) {
          if (sound) moves.swells[moves.swells.length - 1].sound = sound;
          items.push({ text: `the reverse swell rising into ${line}`, swell: line });
        }
      }
    }
    const build: Build | null = gesture ? { line, kind: gesture.id, beats, stop: stopSteps, land, big, into: o.into ?? 'line' } : null;
    if (gesture) items.unshift({ text: `${gesture.name} (${BEAT_WORDS[beats] ?? `${beats} beats`})${own ? ' over the row\'s drums' : ''}`, ...by, gesture: gesture.id, ...(build ? { build } : {}) });
    if (land === 'stroke' && !I.gestured(line) && I.can.crash) {
      // (the landing's size, and the crash's brightness and ring, by the birds)
      const sound = gesture ? glueSoundOf(SH, gesture.id, 'stroke') : undefined;
      moves.crashes.push({ bar: line, ...by, ...(sound ? { sound } : {}) });
      items.push({ text: `a crash on ${line}`, crash: line });
    }
    else if (landBeat) {
      const lanes: Record<string, LaneEdit> = {};
      for (const r of ['backbeat', 'offbeat', 'sixteenth', 'open']) if (mayLane(r)) lanes[r] = { clear: 0, until: 4 };
      const ls = sub('drop-out', figureRow(`phrasing/land-${land}${own ? '+over-a-row' : ''}`, land === 'kick' ? 'the kick alone' : 'the kick and the bass', 'drop-out', { lanes }), line, 1,
        `${land === 'kick' ? 'the kick alone' : 'the kick and the bass'} on ${line}'s first beat`);
      if (own) { ls.overlay = true; ls.spare = spare; }
      // (the kick alone means alone: the hand player rests through the beat too)
      ls.silence = true;
      subs.push(ls);
      // (the landing is the build's: heard with its lead, the line's first beat already the kick's alone where nothing rests there)
      moves.landings.push({ bar: line, kind: land as 'kick' | 'bass', ...by });
      items.push({ text: land === 'kick' ? `the kick alone through ${line}'s first beat` : `the kick and the bass alone through ${line}'s first beat`, ...by });
    } else if (!gesture && o.crash !== false && I.can.crash && !I.gestured(line)) { moves.crashes.push({ bar: line, ...by }); items.push({ text: `a crash on ${line}`, crash: line }); }
    p.said.unshift(...items);
    p.done?.(row);
    return drawnId ? { build, drawn: drawnId } : null;
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
  const markOut = (out: SubSection, from: number, to: number, into: 'drop' | 'return' | 'break', kind: string): { m: Pick<Out, 'fill' | 'ack'>; said: Said[]; b: Pending | null } => {
    const last = to - 1;
    const rng = new Rng(`${I.seed}::phrasing:mark:${to}`);
    const tops = into === 'break' && topsMayThin(from, last);
    const b = rng.chance(O.fill) ? buildInto(to, kind, { rng, filter: tops ? undefined : O.dip.hz, filterFrom: from * bs, bass: false,
      into, ...(into === 'break' ? { stop: false, crash: false, hold: true } : { big: true }) }) : null;
    // (the build's own parts are put in front of these when its gesture is drawn)
    const said: Said[] = b ? b.said : [];
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
    return { m: { fill: null, ack: tops ? 'tops' : 'dip' }, said, b };
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
      const { m, said: sd, b } = markOut(out, o0, end, 'break', s.kind);
      const o: Out = { from: o0, to: end, into: 'break', label: '', ...m };
      if (b) b.done = (row) => { o.fill = row?.id ?? null; };
      notes.push({ out: o, head: `the bass out ${o0 === from ? 'across the cooldown' : `over the cooldown's last bar`} into the break at ${end}`, said: sd, tail: '' });
      outs.push(o);
    }
  }

  // ----- the sub-segments inside a long main -----
  const S = R.segments;
  const longAt = Math.min(S.longBars, S.longMostS / bs);
  const rate = leanOf(R, S.lean, I.spell);
  const span = Math.min(L - 1, Math.max(S.leastBars, Math.round(S.spanPhrases * L)));
  type Phrase = PhraseMap['phrases'][number];
  type Sec = (typeof sections)[number];
  /** What the kit admits at a phrase's end, each kind by its needs. */
  const admitsAt = (p: Phrase, fills: Recipe[], drops: Recipe[]): Record<SegmentKind, boolean> => {
    const last = p.to - 1;
    return {
      'breakdown-lite': editable('kick') && every(p.to - span, p.to, (k) => k.kick),
      'half-time': I.four && editable('kick') && every(p.to - span, p.to, (k) => k.kick),
      filtered: every(p.to - span, p.to, (k) => k.drums || k.bass),
      'drop-out': I.kit(last).drums && drops.some((r) => leaves(r, last)),
      fill: ((editable('backbeat') && I.kit(last).backbeat) || (editable('kick') && I.kit(last).kick)) && fills.length > 0,
    };
  };
  /**
   * A sub-segment of `kind` at phrase `p`'s end, its build placed; false where its bars are another's. `houseEnd` (U2e, a
   * major sub-segment only): the house's own one bar on the phrase's last (a turnaround, a drop-out bar, a fill) is its
   * way back in, in place of a build of its own.
   */
  const placeSegment = (s: Sec, p: Phrase, kind: SegmentKind, rng: Rng, fills: Recipe[], drops: Recipe[], more: boolean, houseEnd?: SubSection): boolean => {
      const last = p.to - 1;
      const n = kind === 'drop-out' || kind === 'fill' ? 1 : span;
      const from = p.to - n;
      if (houseEnd && !(n > 1 && kind !== 'filtered')) return false;
      if (!free(from, houseEnd ? last : p.to)) return false;
      // the re-entry's fill drawn as it was (its die kept), played as the build (U2c)
      const reentry = n > 1 && !houseEnd && rng.chance(S.reentryFill[kind] ?? 0) && ((editable('backbeat') && I.kit(last).backbeat) || (editable('kick') && I.kit(last).kick)) ? drawRow(rng, fills) : null;
      const where = `${from}-${p.to - 1}`;
      const k = I.kit(last);
      // where a track row owns the drums the other voices answer the more
      const ownDrums = !((editable('backbeat') && k.backbeat) || (editable('kick') && k.kick));
      let label: string, built: { said: Said[]; pend: Pending | null };
      const into = (o: BuildOpts) => { const pend = buildInto(p.to, s.kind, o); if (more) pend.more = true; return { said: pend.said, pend }; };
      if (houseEnd) {
        subs.push({ ...sub('switch-up', kind === 'half-time' ? HALF_TIME : BREAKDOWN_LITE, from, last - from, `${kind} ${where}`), ...(kind === 'half-time' ? {} : { silence: true }) });
        built = { said: [{ text: `back in by the house's own ${houseEnd.label} on ${last}` }], pend: null };
        label = kind === 'half-time' ? `half-time phrase ${where}: the kick on one and three-and, the backbeat on three`
          : `breakdown-lite ${where}: the kick, the backbeat and the tops out, the bed exposed`;
      } else if (kind === 'breakdown-lite') {
        // (the tops out and the bed exposed: the hand player rests with the kit)
        subs.push({ ...sub('switch-up', BREAKDOWN_LITE, from, last - from, `breakdown-lite ${where}`), silence: true });
        built = into({ rng, row: reentry ?? undefined, bass: false });
        label = `breakdown-lite ${where}: the kick, the backbeat and the tops out, the bed exposed`;
      } else if (kind === 'half-time') {
        subs.push(sub('switch-up', HALF_TIME, from, last - from, `half-time ${where}`));
        built = into({ rng, row: reentry ?? undefined, filter: S.halfTime.hz, field: B.fieldDb });
        label = `half-time phrase ${where}: the kick on one and three-and, the backbeat on three`;
      } else if (kind === 'filtered') {
        // the low-pass cut closed at the phrase's start (a cut, never a fade), the tops thinning under it
        const thin = topsMayThin(from, last) ? sub('switch-up', TOPS_THIN, from, last - from, `the tops thin ${from}-${last - 1}`) : null;
        if (thin) subs.push(thin);
        built = into({ rng, row: reentry ?? undefined, filter: S.filter.hz, filterFrom: from * bs, field: ownDrums ? B.heldFieldDb : B.fieldDb });
        if (thin) built.said.unshift({ text: 'the tops thin', by: thin });
        if (swellInto(p.to, S.filter.swellBeats, S.filter.swellGain)) built.said.push({ text: `a reverse swell into ${p.to}`, swell: p.to });
        label = `filtered phrase ${where}`;
      } else if (kind === 'fill') {
        built = into({ rng, bass: false });
        label = `a fill into the line at ${p.to}`;
      } else {
        const row = drawRow(rng, drops.filter((r) => leaves(r, last)))!;
        subs.push(sub(kind, row, last, 1, `${row.name} ${last}`));
        label = `a drop-out bar (${row.name}) at ${last}, the groove back on ${p.to}`;
        const said: Said[] = [];
        // a row's own drums stop on the last beat over it, so the drums lead the bar out too
        if (ownDrums && (k.kick || k.backbeat)) {
          const st = sub('drop-out', stopFrom(B.stopBeatStep), last, 1, `the stop ${last}, over the row's drums`);
          // a pinned or drawn part's drums keep their bar (as the build's and the landing's overlays do)
          st.overlay = true; st.spare = I.spare ?? new Set<string>();
          subs.push(st);
          said.push({ text: 'the drums stopping on the last beat', by: st });
        }
        if (I.can.crash && !I.gestured(p.to)) { moves.crashes.push({ bar: p.to }); said.push({ text: `a crash on ${p.to}`, crash: p.to }); }
        built = { said, pend: null };
      }
      take(from, p.to);
      const seg: Segment = { kind, from, to: p.to, fn: p.fn, label, reentry: null, ...(houseEnd ? { houseEnd: last } : {}) };
      if (built.pend) built.pend.done = (row) => { seg.reentry = row?.id ?? null; };
      notes.push({ segment: seg, head: label, said: built.said, tail: '' });
      segments.push(seg);
      return true;
  };

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
      const fills = rowsOf('fill', s.kind);
      const drops = rowsOf('drop-out', s.kind, dropsBar);
      const admits = admitsAt(p, fills, drops);
      // a kind the main already played is drawn at `recent` of its weight, so a long main changes its gesture
      const w = Object.fromEntries(Object.entries(S.byFunction[p.fn]).filter(([k]) => admits[k as SegmentKind])
        .map(([k, x]) => [k, segments.some((g) => g.kind === k && g.from >= s.startBar && g.to <= end) ? x * S.recent : x]));
      const kind = weighted(rng, w) as SegmentKind | null;
      if (!kind) continue;
      if (!placeSegment(s, p, kind, rng, fills, drops, false)) continue;
      chosen.push(p.from);
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
    const { m, said: sd, b } = markOut(out, from, a.bar, into, before.kind);
    const o: Out = { from, to: a.bar, into, label: '', ...m };
    if (b) b.done = (row) => { o.fill = row?.id ?? null; };
    notes.push({ out: o, head: `the bass out ${n} bar${n > 1 ? 's' : ''} before the ${into === 'drop' ? 'drop' : 'return'} at ${a.bar}, back with it`, said: sd, tail: '' });
    outs.push(o);
  }

  // ----- more sub-segments (U2e; his word 10-13: "need more frequent sub sequence … the more boring the ring in terms
  // of graphics, the more boring the music too", and on the Techno tile, "main segments need major sub segmentation") -----
  // After everything above is placed as it was drawn: a long section takes more sub-segments until no stretch of it runs
  // unmarked past the shorter of 16 bars and 30 s (Loom leaning it as it leans the rate), each on the candidate phrase
  // that best splits the longest stretch; a big section takes one major sub-segment at least. The groove keeps its
  // identity between them: never two spans in neighbouring phrases.
  const MORE = S.more;
  if (MORE && span >= 1) {
    const gapMost = Math.min(MORE.everyBars, MORE.everyS / bs) / rate;
    const longMore = Math.min(MORE.longBars, MORE.longMostS / bs);
    const SPANS: readonly SegmentKind[] = ['breakdown-lite', 'half-time', 'filtered'];
    const MAJOR: readonly SegmentKind[] = ['breakdown-lite', 'half-time'];
    for (const s of sections) {
      if (!S.sections.includes(s.kind) || !(s.bars > longMore)) continue;
      const end = s.startBar + s.bars, cool = coolFrom.get(s.index) ?? end;
      const candidates = I.map.phrases.filter((p) => p.from >= s.startBar && p.to <= end && p.to - p.from === L
        && p.from > s.startBar && p.to < end && p.to <= cool && !!S.byFunction[p.fn]);
      // the section's first phrase (U2e review: at the house's tempo a first phrase of 8 bars and a drop-out on the
      // second's last left 15 bars, 34-39 s, from the line with no mark): only where the line's stretch is over the cap,
      // and only a fill or a drop-out bar on its last bar, drawn at an interior phrase's weights
      const first = I.map.phrases.find((p) => p.from === s.startBar && p.to - p.from === L && p.to < end && p.to <= cool);
      const LIGHT: readonly SegmentKind[] = ['fill', 'drop-out'];
      const fnOf = (p: Phrase) => (p === first ? 'interior' : p.fn);
      if (!candidates.length && !first) continue;
      const fills = rowsOf('fill', s.kind);
      const drops = rowsOf('drop-out', s.kind, dropsBar);
      const inSection = () => segments.filter((g) => g.from >= s.startBar && g.to <= end);
      // what the section already marks: its lines, the cooldown's start, the house's own small things, the sub-segments, the outs
      const marks = (): number[] => {
        const xs = new Set<number>([s.startBar, cool]);
        // (never a variation, the hats' own figure a phrase event may sit over, nor a glue-only row the glue's gates may
        // take: the U2e review found a main's first 15 bars unmarked behind them)
        for (const x of I.drawn) {
          if (x.kind === 'variation' || (!Object.keys(x.row?.figure?.lanes ?? {}).length && !x.row?.figure?.layers)) continue;
          for (const b of [x.startBar, x.startBar + x.bars]) if (b > s.startBar && b < cool) xs.add(b);
        }
        for (const b of I.keep) if (b > s.startBar && b < cool) xs.add(b);
        for (const g of inSection()) { xs.add(g.from); xs.add(g.to); }
        for (const o of outs) if (o.from > s.startBar && o.from < cool) xs.add(o.from);
        return [...xs].sort((a, b) => a - b);
      };
      // the kinds a phrase may take here: a span only where no span stands in a neighbouring phrase (or its own)
      const kindsAt = (p: Phrase): SegmentKind[] => {
        if (inSection().some((g) => g.to === p.to)) return [];
        const a = admitsAt(p, fills, drops);
        const spanNear = inSection().some((g) => SPANS.includes(g.kind) && Math.abs(g.to - p.to) < (1 + S.spacingPhrases) * L);
        // (never a drop-out bar whose stop would fall over a part's drums, a pin's or a drawn recipe's: a part is exact
        // through this pass; a track row's own drums stop on the last beat as U2's do)
        const k0 = I.kit(p.to - 1), spare = I.spare ?? new Set<string>();
        const ownDrums = !((editable('backbeat') && k0.backbeat) || (editable('kick') && k0.kick)) && ((spare.has('kick') && k0.kick) || (spare.has('backbeat') && k0.backbeat));
        return (Object.keys(S.byFunction[fnOf(p)] ?? {}) as SegmentKind[]).filter((k) => a[k] && (!SPANS.includes(k) || !spanNear) && !(k === 'drop-out' && ownDrums)
          && (p !== first || LIGHT.includes(k)) && free(p.to - (k === 'drop-out' || k === 'fill' ? 1 : span), p.to));
      };
      // the longest stretch a placement at phrase `p` leaves (its mark from its first bar to its line)
      const longestWith = (p: Phrase, n: number) => {
        const xs = [...marks(), p.to - n, p.to].sort((a, b) => a - b);
        let most = 0;
        for (let i = 1; i < xs.length; i++) most = Math.max(most, xs[i] - xs[i - 1]);
        return most;
      };
      const longest = () => longestWith({ from: -1, to: s.startBar } as Phrase, 0);
      const place = (p: Phrase, kinds: SegmentKind[], houseEnd?: SubSection): boolean => {
        const rng = new Rng(`${I.seed}::phrasing:more:${s.index}:${p.from}`);
        const w = Object.fromEntries(Object.entries(S.byFunction[fnOf(p)] ?? {}).filter(([k]) => kinds.includes(k as SegmentKind))
          .map(([k, x]) => [k, inSection().some((g) => g.kind === k) ? x * S.recent : x]));
        const kind = weighted(rng, w) as SegmentKind | null;
        return !!kind && placeSegment(s, p, kind, rng, fills, drops, true, houseEnd);
      };
      // the house's own one bar on a phrase's last, every bar before it free: a major sub-segment may end on it, the
      // house's bar its way back in (the house marks most of its phrases' ends). Only a bar heard as a move back in (the
      // U2e review): a fill or a turnaround, or a drop-out bar that takes nothing the span already took (the bass out
      // after a breakdown-lite); never a glue-only row (the glue's gates may take its only sound), never a second
      // drop-out of the same lanes (a bar of the pad alone, then a bare line)
      const lanesOf = (r: Recipe | undefined) => Object.keys(r?.figure?.lanes ?? {});
      const houseEndOf = (p: Phrase, kind: SegmentKind): SubSection | undefined => {
        const last = p.to - 1;
        if (inSection().some((g) => g.to === p.to) || !free(p.to - span, last)) return undefined;
        const took = new Set(lanesOf(kind === 'half-time' ? HALF_TIME : BREAKDOWN_LITE));
        return I.drawn.find((x) => {
          if (x.startBar !== last || x.bars !== 1) return false;
          const lanes = lanesOf(x.row), layers = x.row?.figure?.layers;
          if (!lanes.length && !layers) return false;
          // heard: a lane of it the bar's kit sounds and a figure may edit (a ghost pickup on a backbeat the kit has not is no way back in)
          const k = I.kit(last);
          const sounds: Record<string, boolean> = { kick: k.kick, backbeat: k.backbeat, offbeat: k.offbeat, sixteenth: !!k.sixteenths, open: !!k.open, bassline: k.bass, figure: k.cover.figure > 0 };
          if (!layers && !lanes.some((l) => sounds[l] && editable(l))) return false;
          // ...and not a lane a variation over the bar plays its own figure on (a hat gap under the quarter hats is the variation's bar)
          const under = I.drawn.filter((y) => y !== x && y.kind === 'variation' && y.startBar <= last && y.startBar + y.bars > last).flatMap((y) => lanesOf(y.drawn ?? y.row));
          if (!layers && lanes.every((l) => !(sounds[l] && editable(l)) || under.includes(l))) return false;
          if (x.kind === 'fill' || x.kind === 'turnaround') return true;
          return x.kind === 'drop-out' && !layers && lanes.every((l) => !took.has(l));
        });
      };
      const majorAtHouseEnd = (p: Phrase): SegmentKind[] => {
        const a = admitsAt(p, fills, drops);
        const spanNear = inSection().some((g) => SPANS.includes(g.kind) && Math.abs(g.to - p.to) < (1 + S.spacingPhrases) * L);
        return spanNear ? [] : MAJOR.filter((k) => a[k] && k in S.byFunction[p.fn] && !!houseEndOf(p, k));
      };
      // the major sub-segment first, where the section is big and has none: on the phrase that best splits its longest stretch
      const majorOk = span >= MORE.majorLeastBars;
      if (s.bars >= MORE.majorBars && majorOk && !inSection().some((g) => MAJOR.includes(g.kind))) {
        const major = (p: Phrase) => { const ks = kindsAt(p); const m = ks.filter((k) => MAJOR.includes(k)); return m.length ? m : !editable('kick') ? ks.filter((k) => k === 'filtered') : []; };
        const best = candidates.filter((p) => major(p).length).sort((a, b) => longestWith(a, span) - longestWith(b, span) || a.from - b.from)[0];
        if (best && !(inSection().some((g) => g.kind === 'filtered') && !major(best).some((k) => MAJOR.includes(k)))) place(best, major(best));
        // none free to its line: one ending on the house's own bar
        if (!inSection().some((g) => MAJOR.includes(g.kind))) {
          const end = candidates.filter((p) => majorAtHouseEnd(p).length).sort((a, b) => longestWith(a, span) - longestWith(b, span) || a.from - b.from)[0];
          if (end) {
            const rng = new Rng(`${I.seed}::phrasing:more:${s.index}:${end.from}`), ks = majorAtHouseEnd(end);
            const w = Object.fromEntries(Object.entries(S.byFunction[end.fn]).filter(([k]) => ks.includes(k as SegmentKind))
              .map(([k, x]) => [k, inSection().some((g) => g.kind === k) ? x * S.recent : x]));
            const kind = weighted(rng, w) as SegmentKind | null;
            if (kind) placeSegment(s, end, kind, rng, fills, drops, true, houseEndOf(end, kind));
          }
        }
      }
      const lead = () => (marks().find((b) => b > s.startBar) ?? end) - s.startBar;
      // what runs past the cap, summed over the stretches a placement at `p` leaves (U2e review: two stretches of 15 bars,
      // neither placement alone shortening the longest, had left both)
      const overWith = (p: Phrase, n: number) => {
        const xs = [...marks(), p.to - n, p.to].sort((a, b) => a - b);
        let over = 0;
        for (let i = 1; i < xs.length; i++) over += Math.max(0, xs[i] - xs[i - 1] - gapMost);
        return over;
      };
      for (let guard = 0; guard <= candidates.length && longest() > gapMost + 1e-6; guard++) {
        const now = overWith({ from: -1, to: s.startBar } as Phrase, 0);
        const pool = first && lead() > gapMost + 1e-6 ? [first, ...candidates] : candidates;
        const best = pool.filter((p) => kindsAt(p).length).map((p) => ({ p, over: overWith(p, 1), after: longestWith(p, 1) }))
          .filter((x) => x.over < now - 1e-6).sort((a, b) => a.over - b.over || a.after - b.after || a.p.from - b.p.from)[0];
        if (!best || !place(best.p, kindsAt(best.p))) break;
      }
    }
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

  // ----- the builds' gestures, drawn in line order (U2d): never a kind twice in a row within the theme -----
  const builds: Build[] = [];
  const hatMoves: HatMove[] = [];
  // the bars the hats are a gesture's, a stop's, a landing's, the house's own small things', a move's (round hat-scene:
  // the scene's shaping of the hats' own hits leaves them as those lay them)
  const hatBars = new Set<number>();
  {
    // the draws first, nothing laid (`dry`), then the builds laid: a noise gesture its seam refuses is swapped for the
    // drums there alone, every other build drawing as it did; the chain reads the kinds drawn
    const drawnAt = new Map<number, string>(), finalAt = new Map<number, string>();
    const nearOf = (line: number) => {
      const lines = [...drawnAt.keys()].sort((a, b) => a - b), i = lines.indexOf(line), ks = new Set<string>();
      for (const l of [lines[i - 1], lines[i + 1]]) if (l !== undefined) { ks.add(drawnAt.get(l)!); if (finalAt.has(l)) ks.add(finalAt.get(l)!); }
      return ks;
    };
    for (const dry of [true, false]) {
      let prev: string | null = null;
      const used = new Set<string>(), busy = new Set<number>(), drawn: Array<{ line: number; kind: string }> = [];
      const take = (p: Pending, r: ReturnType<typeof realize>) => {
        if (!r) return;
        drawn.push({ line: p.line, kind: r.drawn });
        if (dry) drawnAt.set(p.line, r.drawn);
        else if (r.build) { finalAt.set(p.line, r.build.kind); builds.push(r.build); }
      };
      for (const p of pending.filter((x) => !x.more).sort((x, y) => x.line - y.line)) {
        const r = realize(p, new Set(prev ? [prev] : []), used, busy, dry, dry ? undefined : nearOf(p.line));
        busy.add(p.line - 1).add(p.line);
        if (r) { prev = r.drawn; used.add(r.drawn); }
        take(p, r);
      }
      // U2e's builds after them, so every build above keeps the gesture it drew: never the kind of the build before it or after it
      for (const p of pending.filter((x) => x.more).sort((x, y) => x.line - y.line)) {
        const before = drawn.filter((x) => x.line < p.line).sort((x, y) => y.line - x.line)[0], after = drawn.filter((x) => x.line > p.line).sort((x, y) => x.line - y.line)[0];
        const r = realize(p, new Set([before?.kind, after?.kind].filter((x): x is string => !!x)), used, busy, dry, dry ? undefined : nearOf(p.line));
        busy.add(p.line - 1).add(p.line);
        if (r) used.add(r.drawn);
        take(p, r);
      }
    }
    builds.sort((x, y) => x.line - y.line);
  }

  // ----- the house's glue rows at their seams (hat-moves): a ride-in's sweep, a riser, a swell into a line, each read as
  // a gesture of the drums' is; refused, its bar is the hats' (the drums in its place) -----
  const refusedGlue: string[] = [];
  // (a house glue row sounds only where no glue is near its line: an answer's crash or swell among it)
  const glueNear = (line: number, n: number) => answers.some((a) => a.bar >= line - n - 1 && a.bar <= line + 1 && a.parts.some((q) => q === 'crash' || q === 'reverse'));
  const swaps: HatTransition[] = [];
  // (a caller that cannot say whether a glue row sounds lays every one: none is read at its seam, none refused)
  for (const x of I.glueWould ? I.drawn : []) {
    const g = x.row?.figure?.glue, dir = g ? SEAMS.noise.glue[g.slot] : undefined;
    if (!g || !dir || x.kind === 'variation' || !I.glueWould!(g.slot, x.startBar + x.bars, g.bars ?? 1) || glueNear(x.startBar + x.bars, g.bars ?? 1)) continue;
    const line = x.startBar + x.bars, bar = line - 1;
    const reading = seamAt(bar, line, dir);
    if (new Rng(`${I.seed}::phrasing:seam:glue:${line}`).chance(reading.share)) { seams.push({ bar, line, what: x.row.id, dir, reading, verdict: 'kept' }); continue; }
    refusedGlue.push(`${g.slot}@${line}`);
    swaps.push({ bar, line, where: `in place of ${x.label}`, swap: true });
    seams.push({ bar, line, what: x.row.id, dir, reading, verdict: 'space' });
  }

  // ----- the hats' moves at the transitions (hat-moves, `src/hat-moves.ts`; his word 10-16 on seed 35: "explore a bit
  // more interesting hi-hat patterns in sub-segments transitions"): into and out of every sub-segment and the house's
  // own hat variations, and in place of a refused noise row; never on a bar a gesture, a stop, a landing or the house's
  // own small things hold (the hats follow those) -----
  {
    const busyHats = new Set<number>(I.keep);
    const touchesHats = (r: Recipe | undefined) => Object.keys(r?.figure?.lanes ?? {}).some((l) => ['offbeat', 'open', 'closed'].includes(l));
    // (a glue-only row of the house's that will not sound, its slot's voice gated or a glue near its line, holds nothing;
    // where the caller cannot say, it sounds, and its bars are its own)
    const silentGlue = (x: SubSection) => { const f = x.row?.figure, g = f?.glue; return !!g && !!I.glueWould && !Object.keys(f?.lanes ?? {}).length && !f?.layers && !f?.stroke
      && (!I.glueWould(g.slot, x.startBar + x.bars, g.bars ?? 1) || glueNear(x.startBar + x.bars, g.bars ?? 1)); };
    for (const x of I.drawn) if (x.kind !== 'variation' && (x.kind !== 'switch-up' || touchesHats(x.row)) && !silentGlue(x)) for (let b = x.startBar; b < x.startBar + x.bars; b++) busyHats.add(b);
    const SPAN_ROWS = new Set<Recipe>([BREAKDOWN_LITE, HALF_TIME, TOPS_THIN]);
    for (const x of subs) if (!SPAN_ROWS.has(x.row) && !x.row.id.startsWith('phrasing/bass-out')) for (let b = x.startBar; b < x.startBar + x.bars; b++) busyHats.add(b);
    // (a gesture's whole window, a sweep's two bars among it, is the gesture's: the hats follow it)
    for (const b of builds) for (let x = b.line - Math.max(1, Math.ceil(b.beats / 4)); x <= b.line; x++) busyHats.add(x);
    const toppedOut = (b: number) => subs.some((x) => (x.row === TOPS_THIN || x.row === BREAKDOWN_LITE) && b >= x.startBar && b < x.startBar + x.bars);
    const T: HatTransition[] = [...swaps];
    const built = new Set(builds.map((b) => b.line));
    for (const g of segments) {
      if (g.kind !== 'fill') T.push({ bar: g.from - 1, line: g.from, where: `into the ${g.kind}` });
      // (the way out that already has a gesture, a build's or the house's own small thing's, is the gesture's alone: a
      // move on the bar before it would double it)
      if (g.kind === 'drop-out' || g.kind === 'fill' || built.has(g.to) || g.houseEnd !== undefined) continue;
      const bar = g.to - 1;
      if (bar >= g.from) T.push({ bar, line: bar + 1, where: `out of the ${g.kind}` });
    }
    for (const v of I.drawn) if (v.kind === 'variation') {
      T.push({ bar: v.startBar - 1, line: v.startBar, where: `into the ${v.label}` });
      T.push({ bar: v.startBar + v.bars - 1, line: v.startBar + v.bars, where: `out of the ${v.label}` });
    }
    for (const t of T) if (toppedOut(t.bar)) t.closedOnly = true;
    // (round hat-scene: the vector the voices make across each seam, their energy two bars before the move's bar against
    // two from the line, the hats and their figures left out)
    if (I.scene) for (const t of T) t.vector = vectorOf(readSeam(t.bar, t.line, 'any', (b) => energyAt(b, undefined, true), bedAt).delta);
    const sceneAt = I.scene;
    const steps = (xs: number[] | undefined) => xs ?? [];
    const hm = planHatMoves({ seed: I.seed, spell: spellOf, four: I.four, transitions: T, busy: busyHats, openRing: I.openRing ?? Infinity,
      hats: (b) => b >= 0 && b < I.bars && I.kit(b).offbeat && editable('offbeat') && R.segments.sections.includes(sectionAt(b)?.kind ?? ''),
      // (an open hat the figures leave somewhere: never one the house's own hat figures or the phrases' tops take everywhere)
      open: !I.openShared && editable('open') && (I.openHits ?? []).some((h) => ![...I.drawn, ...subs].some((x) => h.bar >= x.startBar && h.bar < x.startBar + x.bars
        && Object.entries(x.row?.figure?.lanes ?? {}).some(([l, e]) => (l === 'offbeat' || l === 'open') && e.clear !== undefined && h.step >= e.clear && h.step < (e.until ?? 16)))
        && !answers.some((a) => a.bar === h.bar && a.parts.includes('hatsBreathe') && h.step < R.answers.breatheSteps)),
      // (the hand part alone answers a gap: the drum score never follows the harmonic parts, a part laid over a theme
      // keeps its drums as they were)
      hands: (b) => steps(I.kit(b).hands),
      // the hats' steps as the house's own hat figures and the spans leave them (a variation's mask, a clear), all of them
      // and the closed and the open hats' own (a move that would change none of them is never drawn)
      // (a variation may play one of its alternates in place of its row: the steps every one of them leaves)
      hatSteps: (b) => {
        const open0 = new Set((I.openHits ?? []).filter((h) => h.bar === b).map((h) => h.step));
        // (where the open hat is the closed hats' own voice, every hit of it is the closed lane's too)
        const all0 = [...new Set(steps(I.kit(b).hatSteps))];
        let st: HatSteps = { all: all0, open: [...open0], closed: I.openShared ? all0 : all0.filter((q) => !open0.has(q)) };
        const after = (e: LaneEdit | undefined, ys: number[]) => {
          if (!e) return ys;
          const zs = e.clear !== undefined ? ys.filter((q) => q < e.clear! || q >= (e.until ?? 16)) : [...ys];
          for (const m of e.mask ?? []) [...m].forEach((c, q) => { if (c !== '.') zs.push(q); });
          return [...new Set(zs)];
        };
        // (a mask on both hats copies the bar's loudest hit: its hits are that voice's lane's, the open's or the closed's;
        // where the two are as loud, neither's)
        const loud = I.kit(b).hatLoud, by = !loud || loud.open === loud.closed || I.openShared ? null : loud.open > loud.closed ? 'open' : 'closed';
        const through = (r: Recipe | undefined, x: HatSteps): HatSteps => {
          const L = r?.figure?.lanes ?? {}, bare = L.offbeat && { ...L.offbeat, mask: undefined };
          const open = after(L.open, after(by === 'open' ? L.offbeat : bare, x.open)), closed = after(L.closed, after(by === 'closed' || I.openShared ? L.offbeat : bare, x.closed));
          return { all: [...new Set([...after(L.offbeat, x.all), ...open, ...closed])], open, closed };
        };
        for (const x of [...I.drawn, ...subs.filter((y) => SPAN_ROWS.has(y.row))]) if (b >= x.startBar && b < x.startBar + x.bars) {
          const ways = [x.row, ...(x.alternates ?? [])].map((r) => through(r, st));
          const every = (k: keyof HatSteps) => ways[0][k].filter((q) => ways.every((w) => w[k].includes(q)));
          st = { all: every('all'), open: every('open'), closed: every('closed') };
        }
        return st;
      },
      ...(sceneAt ? { scene: { busy: (b: number) => { const x = sceneAt(b); return !!x && busyAt(x); }, call: (b: number) => { const x = sceneAt(b); return x ? callAt(x) : []; },
        kicks: (b: number) => { const x = sceneAt(b); return x ? x.kick.flatMap((y, q) => (y > 0 ? [q] : [])) : []; } } } : {}) });
    subs.push(...hm.subs);
    hatMoves.push(...hm.moves);
    for (const b of busyHats) hatBars.add(b);
    for (const m of hm.moves) hatBars.add(m.bar);
    // a refused glue row whose bar took no move is space
    for (const sw of seams) if (sw.verdict === 'space' && !SEAMS.noise.gestures[sw.what] && hm.moves.some((m) => m.swap && m.bar === sw.bar)) { sw.verdict = 'drums'; sw.instead = hm.moves.find((m) => m.bar === sw.bar)!.kind; }
  }

  // a dip opening within half a bar of the next one's cut is held closed into it (the review of U2c: a filtered phrase's
  // re-entry into a cooldown opened to 15 kHz and was cut to 2.5 kHz 50 ms later)
  moves.dips.sort((x, y) => x.a - y.a);
  for (let i = 0; i + 1 < moves.dips.length; i++) {
    const cur = moves.dips[i], next = moves.dips[i + 1];
    if (!cur.hold && next.a >= cur.b && next.a - cur.d < bs / 2) { cur.reopen = { c: cur.c, d: cur.d }; cur.into = next; cur.hold = true; cur.c = cur.d = next.a; }
  }
  return { phrasing: summarised({ segments, answers, outs, cooldowns, builds, ...(hatMoves.length ? { hats: hatMoves } : {}), ...(seams.length ? { seams } : {}) }),
    subs: subs.sort((a, b) => a.startBar - b.startBar || b.bars - a.bars), moves, notes, refusedGlue, hatBars };
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
export function dipCurve(points: Array<{ t: number; value: number }>, a: number, b: number, c: number, d: number, hz: number, hold = false, top = 0, edge = 0.012): Array<{ t: number; value: number }> {
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
  // (an opening that stops short of the line's own: to `top` octaves under it at `d - edge`, the line's own on `d`)
  const short = top < 0 && d - edge > Math.max(b, c) + 1e-6 ? [{ t: d - edge, value: Math.max(open, Math.round(v1 * 2 ** top)) }] : [];
  return [...points.filter((p) => p.t < a - 1e-9 || p.t > d + 1e-9), { t: a, value: v0 }, { t: b, value: close }, ...(c > b + 1e-9 ? [{ t: c, value: open }] : []), ...short, { t: d, value: v1 }]
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
/**
 * **The gesture rows' faults** (U2d): every row's weights numbers, its lanes the figure roles, its patterns only digits
 * (a level in tenths, at most 0.7 of the copied hit on a lead: a build never peaks over its lane), `C` and rests, its
 * landings and bass the interpreter's words, every bird it leans on a centre, every need known.
 */
export function gestureFaults(G: GestureFile): string[] {
  const bad: string[] = [];
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const LANES_OK = ['kick', 'backbeat', 'offbeat', 'sixteenth', 'open'];
  const ids = new Set<string>();
  const pats = (spec: unknown): string[] => (typeof spec === 'string' ? [spec] : spec && typeof spec === 'object' ? Object.values(spec as Record<string, string>) : []);
  for (const r of G.rows) {
    const at = `gesture ${r.id}`;
    if (ids.has(r.id)) bad.push(`${at}: twice`);
    ids.add(r.id);
    if (!(num(r.weight) && r.weight >= 0) || !(num(r.size) && r.size >= 1 && r.size <= 3)) bad.push(`${at}: a weight and a size 1 to 3`);
    for (const [k, w] of [...Object.entries(r.beats), ...Object.entries(r.stop)]) if (!num(Number(k)) || !num(w)) bad.push(`${at}: ${k} ${w}`);
    if (Object.keys(r.beats).some((k) => ![1, 2, 4, 8].includes(Number(k)))) bad.push(`${at}: beats are 1, 2, 4 or 8`);
    if (Object.keys(r.stop).some((k) => ![0, 2, 4].includes(Number(k)))) bad.push(`${at}: a stop is 0, 2 or 4 sixteenths`);
    for (const k of Object.keys(r.land)) if (!['stroke', 'kick', 'bass'].includes(k)) bad.push(`${at}: no landing ${k}`);
    if (!['window', 'stop', 'gate'].includes(r.bass)) bad.push(`${at}: bass is window, stop or gate`);
    for (const l of [...(r.lead?.lanes ?? []), ...(r.rest ?? []), ...Object.keys(r.lanes ?? {}), ...(r.lift?.lanes ?? [])]) if (!LANES_OK.includes(l)) bad.push(`${at}: ${l} is not a drum lane`);
    for (const p of [...pats(r.lead?.pattern), ...pats(r.lift?.pattern)]) if (!/^[1-7.]+$/.test(p)) bad.push(`${at}: the lead's or the lift's pattern ${p} is digits 1-7 and rests`);
    for (const spec of Object.values(r.lanes ?? {})) for (const p of pats(spec)) if (!/^[1-9C.]+$/.test(p)) bad.push(`${at}: a lane's pattern ${p}`);
    for (const k of Object.keys(r.birds ?? {})) if (typeof G.centre[k] !== 'number') bad.push(`${at}: a lean on ${k} with no centre`);
    for (const n of r.needs ?? []) if (!['swell', 'notIntoBreak', 'kick'].includes(n)) bad.push(`${at}: no need ${n}`);
    if (!r.lead && !(r.rest ?? []).length && !r.lift && !r.fx?.swellGain) bad.push(`${at}: nothing it plays`);
  }
  // the sound table: every parameter's unit known, its birds on a centre, its range holding nought (the house's own),
  // its kinds the rows'; the parameters the interpreters read all there
  for (const [id, P] of Object.entries(G.sound?.params ?? {})) {
    if (!['octaves', 'lean', 'dB', 'share'].includes(P.unit)) bad.push(`sound ${id}: no unit ${P.unit}`);
    for (const [k, x] of Object.entries(P.birds)) if (typeof G.centre[k] !== 'number' || !num(x)) bad.push(`sound ${id}: a move on ${k} with no centre`);
    if (!(Array.isArray(P.range) && P.range.length === 2 && P.range[0] <= 0 && P.range[1] >= 0)) bad.push(`sound ${id}: a range holding nought`);
    for (const k of P.kinds ?? []) if (!ids.has(k)) bad.push(`sound ${id}: no kind ${k}`);
  }
  for (const id of ['filtered.cut', 'filtered.open', 'reverse.band', 'reverse.sweep', 'whoosh.hp', 'riser.band', 'glue.tail', 'glue.wet', 'roll.density', 'roll.length', 'stop.length', 'landing.size', 'crash.bright', 'crash.decay'])
    if (!G.sound?.params?.[id]) bad.push(`sound: no ${id}`);
  return bad;
}
{
  const bad = [...Object.values(PHRASING_ROWS).flatMap(phrasingFaults), ...gestureFaults(GESTURES)];
  if (bad.length) throw new Error(`the phrasing rows: ${bad.join('; ')}`);
}
