// **Places** (round GA6): a table the composer reads by where the birds and the
// tempo stand, never by a name. An entry is a place — birds over the house
// (dice, the link's) and a tempo window — and what the music does there; the
// entry nearest the playing birds and tempo is the one that plays, the house's
// own place competing like any other, so at the default birds nothing moves.
//
// The distance is the library's (`src/library-draw.ts`): Euclidean over the
// eight birds, and the tempo outside the window at one bird step of 0.15 per
// ten BPM. No radius and no dead zone: some entry is always nearest.
import { BIRDS, HOUSE, type Bird, type Spell } from './spell.ts';
import { EQ_BANDS, type EqProfile } from '@deep-house/engine/master';
import type { Settings } from '@deep-house/engine/settings';
import { BY_ID, defaultsOf, type EffectKnob } from '@deep-house/engine/effects';
import type { SubRates } from './subsections.ts';
import type { WalkEntry } from './walk.ts';
import type { GlideEntry, RiffEntry } from './glide.ts';
import type { ComposerKnob } from './mined-phrase.ts';
import type { TimeEntry } from './musical-time.ts';
import type { KeysEdge, StringsBreath, PianoGrain, HarmonicEdge, MalletStrike } from '@deep-house/engine/style';
import { BY_NAME } from '@deep-house/engine/voices';
import { GLIDE_LIBRARY, FORM_LIBRARY, SECTION_LIBRARY } from './recipes.ts';
import { KIT_IDS, kitOf, answersOf, statesOf } from './kit.ts';
import { KEYS_ROWS } from './keys-phrase.ts';
import { DEVELOPMENT_IDS, FAMILIES, developmentOf, developmentFaults, auxOf, auxFaults, surfaceOf, surfaceFaults, bassAnswersOf, type Family } from './phrase-development.ts';

/**
 * **What a grammar needs of the theme** (PLAN-UNIFY §0b), beside the inputs it cannot run without (the keys' harmony,
 * a held part, a first drop): a place's row says what else it is written over, so a grammar is admitted by its own
 * needs and never by another grammar's admission. `kit`: the place's own kit plays (`DrumsEntry.kit`), the drums
 * whose phrases the row's conversation, passage and arrangement were written against.
 */
export type GrammarNeed = 'kit';
export const GRAMMAR_NEEDS: readonly GrammarNeed[] = Object.freeze(['kit']);

/** Where an entry plays. */
export interface Place { birds: Partial<Spell>; tempo: readonly [number, number] }

/**
 * **A place's birds, leaned** (PLAN-UNIFY U2, the fast places' birds): a bird's lean on a knob the entry's reader
 * names, the one lean (`src/lean.ts`) about `centre` — the bird's value where the place's own tile stands, so the tile
 * plays its numbers to the bit and only the positions around it move. A knob a reader multiplies is `factorOf`
 * (exp(x · (bird − centre))); one it moves by steps (dB) is `shiftOf` (x · (bird − centre)).
 */
export interface BirdLeans {
  centre: Readonly<Partial<Record<Bird, number>>>;
  /** by bird, its lean on each knob the readers name */
  by: Readonly<Partial<Record<Bird, Readonly<Record<string, number>>>>>;
  /** the most a shift moves its knob either way (its unit's), by knob */
  most?: Readonly<Record<string, number>>;
  /**
   * a shift that reaches its knob's ends at the bird's own ends (its unit's, by knob): the bird's lean on it is then a
   * sign, and the shift runs from the centre to ±this at nought and at one, linearly either side — a centre off the
   * middle (the tile's Root at 0.75) still moves as far each way
   */
  ends?: Readonly<Record<string, number | readonly [number, number]>>;
}
/** A knob's factor under an entry's leans: the product of every bird's one lean on it (×1 where none names it). */
export function leanFactor(L: BirdLeans | null | undefined, knob: string, spell: Spell): number {
  if (!L) return 1;
  let x = 1;
  for (const [bird, leans] of Object.entries(L.by) as Array<[Bird, Readonly<Record<string, number>>]>) {
    const k = leans[knob], c = L.centre[bird];
    if (typeof k === 'number' && typeof c === 'number') x *= Math.exp(k * (spell[bird] - c));
  }
  return x;
}
/** A knob's shift under an entry's leans: the sum of every bird's step on it (nought where none names it). */
export function leanShift(L: BirdLeans | null | undefined, knob: string, spell: Spell): number {
  if (!L) return 0;
  let x = 0;
  for (const [bird, leans] of Object.entries(L.by) as Array<[Bird, Readonly<Record<string, number>>]>) {
    const k = leans[knob], c = L.centre[bird];
    if (typeof k !== 'number' || typeof c !== 'number') continue;
    const end = L.ends?.[knob], d = spell[bird] - c;
    // a pair of ends is the shift at the bird's nought and at its one (U2b: Root's low shelf, -4 dB down and +1.5 up
    // about the tile's own Root), each reached linearly from the centre
    x += Array.isArray(end) ? (d > 0 ? end[1] * d / Math.max(1e-9, 1 - c) : end[0] * -d / Math.max(1e-9, c))
      : typeof end === 'number' ? Math.sign(k) * end * (d > 0 ? d / Math.max(1e-9, 1 - c) : d / Math.max(1e-9, c)) : k * d;
  }
  const most = L.most?.[knob];
  return typeof most === 'number' ? Math.max(-most, Math.min(most, x)) : x;
}
/** An entry of a place table: its place and anything the table's reader wants. */
export interface PlaceEntry { id: string; place: Place }

/** Ten BPM is one bird step of 0.15. */
export const PLACE_TEMPO_WEIGHT = 0.15 / 10;
/**
 * **The house's own place**: every bird at home, **at any tempo** — the
 * composer's own harmony and form are what it plays wherever the birds are the
 * house's, however far Ember has taken the tempo, so an entry wins only where
 * the birds have moved toward it. (Which is also why 27191's drumless theme, whose
 * birds stand nearer the house's than any place's, keeps its own form.)
 */
export const HOUSE_PLACE: Place = Object.freeze({ birds: Object.freeze({}), tempo: Object.freeze([0, Infinity] as const) });

/** How far a spell at a tempo stands from a place. */
export function placeDistance(place: Place, spell: Spell, bpm: number): number {
  let d2 = 0;
  for (const b of BIRDS) d2 += (spell[b] - (place.birds[b] ?? HOUSE[b])) ** 2;
  const out = bpm < place.tempo[0] ? place.tempo[0] - bpm : bpm > place.tempo[1] ? bpm - place.tempo[1] : 0;
  return Math.sqrt(d2 + (PLACE_TEMPO_WEIGHT * out) ** 2);
}

/**
 * **The entry nearest** a spell at a tempo, or `null` where the house's own
 * place is nearer than every entry (the table's music does not reach the
 * house). Ties go to the table's order, the house first.
 */
export function nearestEntry<T extends PlaceEntry>(table: readonly T[] | undefined, spell: Spell, bpm: number): T | null {
  if (!table || !table.length) return null;
  let best: T | null = null, at = placeDistance(HOUSE_PLACE, spell, bpm);
  for (const e of table) { const d = placeDistance(e.place, spell, bpm); if (d < at - 1e-12) { at = d; best = e; } }
  return best;
}

/**
 * **An entry's row**: what it says, without its id and its place — two entries with the same row play the same, so a
 * spell crossing from one to the other moves nothing (the fast-birds analysis of 10-12: a place flip that lands on an
 * identical row looked like steering). The house's own place is `house`.
 */
export function rowOf(e: PlaceEntry | null | undefined): string {
  if (!e) return 'house';
  const { id: _id, place: _place, ...row } = e as PlaceEntry & Record<string, unknown>;
  return JSON.stringify(row);
}

/** One chord cycle: scale degrees from the tonic, a chord every `every` bars, the loop's length. */
export interface Cycle { degrees: number[]; every: number; loop: number; voicing?: string; w: number }
export interface HarmonyEntry extends PlaceEntry { pedal?: boolean; cycles?: Cycle[] }
export interface FormEntry extends PlaceEntry {
  /** the place's section orders; none is the corpus's own (the record's mined DJ orders) */
  orders: string[][];
  /**
   * The window each section's length is drawn in at the place, by the orders'
   * own labels (round DNB-4), in place of the corpus's: the drawn lengths are
   * scaled to the theme's as the corpus's are, so these say the proportions.
   * A label the row leaves out keeps the corpus's window.
   */
  sectionBars?: Readonly<Record<string, { p25: number; p75: number; median: number }>>;
  /**
   * The track rows whose forms the place draws (round DNB-6, a row's `form`),
   * by weight, among those that fit the theme's length; where one is drawn it
   * plays in place of `orders`, which stay for a theme none fits.
   */
  rows?: ReadonlyArray<{ v: string; w: number }>;
  /** the birds on the rows' weights (PLAN-UNIFY U2): a bird's lean on the row named by the knob `row:<id>` */
  leans?: BirdLeans;
}
export interface TreatmentEntry extends PlaceEntry { weights: Record<string, number> }
export interface BassEntry extends PlaceEntry {
  sound: string;
  /**
   * The bass sound's `mass` at the place (round DNB-2: the sine against the
   * saws, the body under the drive), where the voice declares the knob: Root
   * moves it from this number (`placedKnob`), and the tempo's lean to a lighter
   * bass does not reach it — the place's number is what was tuned there.
   */
  mass?: number;
  /**
   * The line's gate at the place (round DNB-4): every note ends `gapSteps`
   * sixteenths before the next strikes and lasts `mostSteps` at the most, so
   * the bass is struck notes with air between them, as a two-step's is.
   */
  gate?: Readonly<{ mostSteps: number; gapSteps: number }>;
  /**
   * The line's motion at the place (round DNB-5), written on every note of the
   * place's bass where its voice declares the controls: `wobbleBeats` the sweep
   * locked to the grid, its period in beats (the voice's `movementHz` and
   * `movementPhase`, so it runs on across the notes on the bar's phase);
   * `glideS` the slide into a note that changes pitch legato, in seconds (the
   * voice's `glide`, on the notes the composer wrote a `slideFrom` on);
   * `pitchCents` how far the sweep moves the pitch either way.
   */
  wobbleBeats?: number;
  /** where in its cycle the line's pulse sits on the grid, in turns (10-06) */
  wobblePhase?: number;
  glideS?: number;
  pitchCents?: number;
}
/**
 * A harmonic lane's sound by place: the pad (the held layer) or the stab (the
 * struck layer on the keys) swapped for the voice the sound word resolves to —
 * a swap on a lane that already pays for a voice, never a voice added on top.
 */
export interface LaneSoundEntry extends PlaceEntry { lane: 'pad' | 'stab'; sound: string }
/**
 * **The master's tone by place** (round E1): the five gains of the master's
 * tone stages (`EqProfile`) a place's themes play at. A row is a whole profile,
 * stated as it stands at the style's own base room; a theme in another room
 * keeps that room's own lean on top (`placedProfile`).
 */
export interface EqEntry extends PlaceEntry {
  profile: Readonly<EqProfile>;
  /** the birds on the profile (U2b, his ear 10-13 on the Drum & Bass tile's Root sweep): Root's on the low shelf (`lowShelfDb`, dB), nought at the tile */
  leans?: BirdLeans;
}
/**
 * **The bass drive in parallel by place** (round B1): the driven copy of the
 * bass summed under the clean one (`effects/bass-drive.ts`), at a blend —
 * 0 is none, and the house's row and every row off the corner say 0. A row
 * may lean the copy's drive and its floor; the rest are the effect's own.
 */
export interface BassDriveEntry extends PlaceEntry {
  blend: number;
  drive?: number;
  floorHz?: number;
  /** the copy's corner as a harmonic of the theme's bass register (the bass part's lowest notes): 8 is three octaves over the note */
  toneHarmonic?: number;
  /** the wobble on the corner: its period in beats (0 is none) and its depth as a fraction of the corner */
  wobbleBeats?: number;
  wobbleDepth?: number;
}

/**
 * **A knob a bird moves, from the place's number** (`EffectKnob`): the
 * bird at the place's own value — or the house's, where the place leaves the
 * bird alone — gives the place's number; pulled toward the end the knob's
 * sense names it goes to that end, the other way to the other, in a straight
 * line each side. A voice knob does the same from the house (`knobSetting`,
 * `spell.ts`); here the reference is the place, because the place's number
 * is what was tuned there.
 */
export function placedKnob(knob: EffectKnob, placed: number, place: Place, spell: Spell): number {
  const bird = knob.bird as Bird;
  const v = spell[bird];
  const ref = place.birds[bird] ?? HOUSE[bird];
  if (!Number.isFinite(v)) return placed;
  const end = (m: number) => (knob.of === 'multiplier' ? placed * m : m);
  const far = end(knob.sense > 0 ? knob.max : knob.min);
  const near = end(knob.sense > 0 ? knob.min : knob.max);
  if (v >= ref) return 1 - ref > 0 ? placed + ((v - ref) / (1 - ref)) * (far - placed) : placed;
  return ref > 0 ? placed - ((ref - v) / ref) * (placed - near) : placed;
}

/**
 * **What a theme writes for its bass drive** (`paramOverrides.bass.parallel`),
 * or `null` for none: the row's blend, the drive and the corner moved by the
 * birds from the row's numbers (`placedKnob`, the effect's own `knobs`), and
 * the corner itself set off the theme's bass register — the row's harmonic of
 * the lowest notes the bass part plays, so the same place on two themes gives
 * an edge an octave apart when their basses are — then the wobble's numbers
 * as the row has them.
 * @param registerHz the bass part's register, in hertz (its lowest notes)
 */
export function bassDriveFor(row: BassDriveEntry | null, spell: Spell, registerHz: number): Record<string, number> | null {
  if (!row || !(row.blend > 0)) return null;
  const knobs = BASS_DRIVE_KNOBS;
  const out: Record<string, number> = { blend: row.blend };
  const drive0 = row.drive ?? BASS_DRIVE_DEFAULTS.drive;
  out.drive = +(knobs.drive ? placedKnob(knobs.drive, drive0, row.place, spell) : drive0).toFixed(3);
  const tone0 = (row.toneHarmonic ?? 0) > 0 && registerHz > 0 ? registerHz * row.toneHarmonic! : BASS_DRIVE_DEFAULTS.toneHz;
  out.toneHz = Math.round(knobs.toneHz ? placedKnob(knobs.toneHz, tone0, row.place, spell) : tone0);
  if (row.floorHz) out.floorHz = row.floorHz;
  if ((row.wobbleBeats ?? 0) > 0 && (row.wobbleDepth ?? 0) > 0) { out.wobbleBeats = row.wobbleBeats!; out.wobbleDepth = row.wobbleDepth!; }
  return out;
}
const BASS_DRIVE_KNOBS = BY_ID.bassDrive.knobs ?? {};
const BASS_DRIVE_DEFAULTS = defaultsOf('bassDrive');

/**
 * **A theme's tone**: its room's profile, moved by however far the nearest
 * row stands from the house's (`house`, the style's own base profile). The
 * room's own lean is the room's -- a room that sits 1.3 dB under the base's
 * presence still does at every place -- and the row moves the rest. `null`
 * where the row is the house's own to the bit (nothing to write, and the
 * theme's settings are the ones they were).
 */
export function placedProfile(row: EqEntry | null, house: Readonly<EqProfile>, room: Readonly<EqProfile>): EqProfile | null {
  if (!row) return null;
  if (EQ_BANDS.every((b) => row.profile[b] === house[b])) return null;
  const out = {} as EqProfile;
  for (const b of EQ_BANDS) out[b] = +(room[b] + row.profile[b] - house[b]).toFixed(3);
  return out;
}

/**
 * **A drums entry's line, limiter and drop push as ranges** (the liquid knobs, 10-07; the liquid
 * desk, 10-08): the numbers of V a place states — the line's lift (`bassDb`, Root's when a bird
 * moves it), the master limiter's release (`limiterReleaseMs`, Ember's) and the drop's push on the
 * shared low sum (`push.dropLevel`, a path into the entry's `push`) — each held to the ends a
 * setting may reach. A place's own number is its default (the fast places' 5 dB, 90 ms and 0); an
 * entry that states none plays the room's. Nothing writes a setting yet. A release under 50 ms
 * reaches inside one period of the line's E1 (41 Hz) and shapes the wave; a drop push of 1 is the
 * whole drive the room's push can add.
 */
export const DRUMS_KNOBS: Readonly<Record<'bassDb' | 'limiterReleaseMs' | 'push.dropLevel', Omit<ComposerKnob, 'default'>>> = Object.freeze({
  bassDb: Object.freeze({ unit: 'db', min: -6, max: 6 }),
  limiterReleaseMs: Object.freeze({ unit: 'ms', min: 50, max: 300 }),
  'push.dropLevel': Object.freeze({ unit: 'ratio', min: 0, max: 1 }),
});
/** A drums entry's number at a knob's path (`push.dropLevel` is the entry's `push.dropLevel`), or undefined. */
export function drumsKnobOf(e: DrumsEntry, path: keyof typeof DRUMS_KNOBS): number | undefined {
  const v = path.split('.').reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), e);
  return v === undefined ? undefined : v as number;
}
/** Everything wrong with a drums entry's knobs against their ranges, as sentences. */
export function drumsKnobFaults(e: DrumsEntry): string[] {
  const bad: string[] = [];
  for (const [name, k] of Object.entries(DRUMS_KNOBS)) {
    const v = drumsKnobOf(e, name as keyof typeof DRUMS_KNOBS);
    if (v !== undefined && !(Number.isFinite(v) && v >= k.min && v <= k.max)) bad.push(`${e.id}: ${name} ${v} is outside its ${k.min} to ${k.max}`);
  }
  return bad;
}

/**
 * **The drums' weight by place** (round DNB-1): the backbeat's lift over the
 * level the lane gives it, the bass line's lift over its own, the kick's decay as a multiple of the room's, and a
 * duck of the place's own where the readings put one (`duck`: the low bus's
 * depth in dB, where its minimum falls in seconds, and the two legs of the way
 * back in beats). The house's row and every row that leaves them say nothing.
 */
export interface DrumsEntry extends PlaceEntry {
  backbeatDb: number;
  /** a mined kit row the place plays its drums by (10-06, hands-on) */
  kit?: string;
  /** the line's body bell at the place, in dB (`bass.bodyDb`; the house's +3) */
  bassBodyDb?: number;
  /** the room's and the reverb's numbers at the place (`sends` in the settings) */
  sends?: Record<string, number>;
  /** the kick's lift over its lane's level, in dB (round DNB-4); absent, nought */
  kickDb?: number;
  /** the bass line's lift over its lane's level, in dB (the sub under a kick that does not bury it) */
  bassDb?: number;
  kickDecay: number;
  duck?: { lowDepthDb: number; minimumAt: number; firstLeg: number; recoverBy: number };
  /**
   * The master limiter's release at the place, in milliseconds (the liquid bass rounds, 10-07): the
   * room's 200 let the line come back late after every kick; absent, the room's.
   */
  limiterReleaseMs?: number;
  /** Arrangement pressure on the shared low sum; absent fields retain the style's push. */
  push?: Readonly<Partial<Settings['push']>>;
  /**
   * A drum the place plays in place of the one the kit drew (round DNB-2): the
   * drawn voice to the sound word the style resolves (`sounds`) — the short
   * kick for the kick, the dry snare for the snare. A swap on the events after
   * every figure is laid, so the hit keeps its step, its level and its trim;
   * a voice the map does not name plays as drawn.
   */
  sounds?: Readonly<Record<string, string>>;
  /**
   * The drawn voices whose swap changes the sound alone (PLAN-UNIFY U1, bug 3): the cast's units and every admission
   * read on them are counted on the voice the draw chose (`EventMeta.drawn`), so a backbeat taking the crack moves
   * nothing but the backbeat's sound.
   */
  soundOnly?: readonly string[];
  /**
   * The birds on the drums (PLAN-UNIFY U2, the fast places' birds): Root's on the bass line's lift (`subDb`, dB a unit,
   * held to ±`subMostDb`) and Veil's on the throws' chance (`throws`, a factor held under one)
   */
  leans?: BirdLeans;
  /**
   * The bass compressor's numbers at the place (round DNB-2), over the room's
   * (`bass.comp`): a lift the line is given is a lift the compressor at the
   * room's threshold takes half of back.
   */
  bassComp?: Readonly<{ threshold?: number; knee?: number; ratio?: number; attack?: number; release?: number }>;
  /**
   * The ghosts' level at the place (round DNB-3), in dB: a backbeat note struck
   * under `GHOST_VEL` is this much quieter than the backbeat's lift leaves it,
   * so the lift that stands the snare beside the kick does not stand its
   * ghosts there too. Absent or nought: the ghosts ride with the snare.
   */
  ghostDb?: number;
  /** The offbeat hats' level at the place (round DNB-3), in dB over the lane's own. */
  hatsDb?: number;
  /**
   * The most the theme's trim may lift at the place, in dB (round DNB-3). The
   * loudness model reads the room's levels and the harmonic layer and not the
   * lifts this row puts on the events (DNB-2 said so): with the bed under the
   * place's ceiling it read the fast broken themes eight decibels thinner than
   * they play and lifted them into the limiter, the snare and the kick
   * squashed under the sub. The trim the model asks for, never over this.
   */
  trimMostDb?: number;
  /**
   * The level the place's themes are trimmed to, in LUFS (round DNB-4): the
   * set's trim reads such a theme's window with a model fitted on the place's
   * own windows (`loudnessFamily`'s `placed`) and aims it here, not at the
   * house's level.
   */
  targetLufs?: number;
  /**
   * What the place's windows measure at a trim of nought, in LUFS (round
   * DNB-4): the `placed` family's level, measured by `tools/loudness-fit.ts
   * --spell <the place's> --measure` and fitted by its `--fit --with`, so the
   * trim is (`targetLufs` − this) over the master's slope.
   */
  measuredLufs?: number;
  /**
   * The drums' clip at the place (round DNB-4, the engine's `master.drumClip`):
   * the drums' bus and the kick's through a soft clipper, so a hit's first
   * peak is rounded where it stands rather than pulling the whole mix down at
   * the limiter after it.
   */
  /**
   * The kit under a section that lifts the harmonic layer (round DNB-4): by
   * the section's kind, the roles the row names (`kick`, `backbeat`,
   * `offbeat`, …) this many dB quieter there.
   */
  liftDrums?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  clip?: Readonly<{ driveDb: number; knee?: number; curve?: number; low?: Readonly<{ driveDb: number; knee?: number; curve?: number }>;
    /** the theme's whole sum after its trim (`master.mixClip`) */
    mix?: Readonly<{ driveDb: number; knee?: number; curve?: number }> }>;
  /** the throw (round DNB-5): the last backbeat of every `everyBars` sent to the echo and the room at `chance` */
  throws?: Readonly<{ everyBars: number; chance: number; delay: number; reverb: number }>;
  /** the theme's sum through a gentle compressor after its trim (round DNB-5, `master.busComp`) */
  busComp?: Readonly<{ threshold: number; knee: number; ratio: number; attack: number; release: number }>;
}
/**
 * **The broken kit's figures by place** (round DNB-4): where a theme's kit is
 * broken and this table's nearest row is a place's, the break die draws from
 * the row's figures in place of the style's table (`catalogue.breakMasks`),
 * on the same stream. A figure's masks may be two bars long (32 steps): the
 * first sixteen play on the even bars and the next on the odd. The house's
 * own place and every place left out of the table draw the style's.
 */
export interface BreaksEntry extends PlaceEntry {
  masks: readonly Readonly<{ name: string; m: string; s: string; b: number; c: number }>[];
}
/** A backbeat note under this velocity is a ghost (round DNB-3): the broken kit's ghosts are struck at 0.2-0.35, its snare at 0.9-1. */
export const GHOST_VEL = 0.5;
/**
 * **The roles at a place** (round DUB-1, `notes/rounds/dub-1.md`): who carries
 * the low end. Under the room's own rows the kick carries the sub and the bass
 * line rides on it; where a place turns that round, the kick is a punch over
 * the line and the line is the sub, its sweep on its own filter. Read last of
 * all (`turnRoles` in `src/roles.ts`), over a theme the other tables have
 * already written, so that what it changed is said on the plan and the
 * listening row `roles=classic` puts it back to the bit:
 *
 * - `kick`: the sound word the kit's kick is swapped for, on the events (the
 *   kick the kit drew most, so one drawn voice maps to one row);
 * - `bass`: the same for the plain bottom on the bass lane (the sub, the soft
 *   sub, the triangle) — the line keeps its notes, its level and its gain;
 * - `wobbleBeats`: the bass's own sweep locked to the grid, its period in
 *   beats: written on every bass note as the voice's `movementHz` and
 *   `movementPhase` controls, so the sweep runs on across the notes on the
 *   bar's phase (shut on the line and opening);
 * - `lowDepthDb`: the bass's duck under the kick (`sidechain.lowDepthDb`), its
 *   shape the room's;
 * - `parallelOff`: no driven copy in parallel, where the line's own saws make
 *   the sweep the copy made;
 * - `parallelBlend` (round DUB-3): the room's driven copy kept over the turned
 *   line at this blend, its tone and its sweep the copy's own row's — the
 *   grain and the low-mid wave riding over the sine, never the bass;
 *   `parallelFloorHz` its floor, under which it carries nothing;
 * - `ride` (round DUB-4): the line as drawn, before the hold, played again as
 *   the ride — every note at its own velocity and length, written with the
 *   reese's `ride` switch so it plays into the copy's side door alone, and the
 *   copy fed by nothing else: two rhythms on the lane, the held sub clean and
 *   the figure driven over it (`RolesRide`);
 * - `hold` (round DUB-2): the line held, so the sweep and not the re-strike is
 *   its rhythm — the figure as drawn, read on a coarser grid (`RolesHold`).
 *
 * Every field is optional and a row with none changes nothing.
 */
export interface RolesEntry extends PlaceEntry {
  kick?: string;
  bass?: string;
  wobbleBeats?: number;
  lowDepthDb?: number;
  parallelOff?: boolean;
  parallelBlend?: number;
  parallelFloorHz?: number;
  hold?: RolesHold;
  ride?: RolesRide;
}
/**
 * **The line held** (round DUB-2, `notes/rounds/dub-2.md`): the swapped line's
 * notes read on a coarser grid than the one they were drawn on, in beats from
 * the theme's first bar. A note joins the held note before it — which then
 * runs to the end of it — where it starts off the `strikeBeats` grid, or where
 * it is the held note's own pitch off the `againBeats` grid; any other note
 * strikes, and the note before it runs on to it. A gap longer than
 * `bridgeBeats` is a rest: the note before keeps its own length and the next
 * strikes wherever it falls, so the fills, drop-outs and switch-ups keep their
 * rests. Nothing is added and no pitch is moved: a note is held, or it goes.
 */
/**
 * **The ride** (round DUB-4): the figure as drawn, into the copy alone.
 * `releaseS` is each ride note's release, in seconds, where the line's voice
 * would hold its own, and the gap it leaves: the copy squares what it is fed,
 * so a note that rings into the next is one long note to it, and the figure's
 * eighths are only heard as eighths where each falls to nothing before the
 * next strikes (the plain sub the classic roles feed it falls 0.06 s from a
 * decayed sustain). A ride note that would still sound then is ended a
 * release and a gap before the next one's strike; its start, pitch and
 * velocity are the figure's.
 */
export interface RolesRide { releaseS?: number }
export interface RolesHold {
  /** the grid a new pitch strikes on: a note between its lines is the held note's (1: the beat) */
  strikeBeats: number;
  /** the grid the same pitch strikes again on (2: the half bar, the sweep's own cycle) */
  againBeats: number;
  /** the longest gap a held note runs on across; a longer one is a rest */
  bridgeBeats: number;
}
/**
 * **The bed by place** (round EQ-2, `notes/rounds/eq-2.md`): what the harmonic
 * layer is given at a place, where the house's grooves had 630 Hz-2 kHz
 * seven to sixteen decibels under the references. Every field is optional and
 * an absent one is the room's own:
 *
 * - `stringsHz`: the strings' low-pass corner (`strings.cutoffHz`) where the
 *   place keeps one of its own — the held drone's dark one;
 * - `keysDb`, `padDb`, `pianoDb`: a floor under the keys', the pad's and
 *   (round EQ-5) the piano's levels — a room that already stands over it
 *   keeps its own (the growl room does); since round EQ-6 the most a section
 *   is lifted to, section by section by the section's own bed
 *   (`floorOfBed`), as the bell is;
 * - `duckDb`: the melodic duck's depth (`sidechain.depthDb`); the bass's
 *   (`lowDepthDb`) is not this row's;
 * - `struckDuckDb` (round PIANO-2): the struck voices' duck
 *   (`sidechain.struckDepthDb`), the shallow dip after the strike that the
 *   piano, the plucks and the stabs take where the pads take `duckDb`;
 * - `bellDb`: the presence bell on the harmonic bus (`harmonicBell`, at
 *   `BED_BELL`'s corner and width), nought or absent for none; since round
 *   EQ-5 the most it lifts, section by section by the section's own bed
 *   (`bellOfBed`);
 * - `bothLean`: added to the density's chance of both harmonic layers in a
 *   section (`density.bothHarmonicChance`), on a theme whose scene is not
 *   the drone in front — a lean on the draw, never a rule that a main keeps
 *   a pad;
 * - `keysCeilDb`, `padCeilDb`, `pianoCeilDb` (round DNB-3): a ceiling over
 *   the keys', the pad's and the piano's levels — the floors' other side, for
 *   a place whose bed is a support under the drums and the bass and never
 *   their equal: a room that stands over it comes down to it, one under it
 *   keeps its own.
 */
export interface BedEntry extends PlaceEntry {
  stringsHz?: number;
  keysDb?: number;
  padDb?: number;
  pianoDb?: number;
  /** how far a lifted section lifts the harmonic layer at the place, in dB, in place of the room's `breakdownLiftDb` — one number, or one by the section's kind (round DNB-4) */
  liftDb?: number | Readonly<Record<string, number>>;
  /** the melodic bus's high-pass held at this corner across every section that lifts, in Hz (round DNB-4): the bed thinned of its bottom where the sub has gone */
  thinHz?: number;
  /** the melodic bus's low-pass held at this corner across every section that lifts, in Hz (round DNB-4): the bed darkened there */
  darkHz?: number;
  /** the melodic bus held between these two corners in every section that does not lift, in Hz (round DNB-5): the bed's band */
  bandHz?: readonly [number, number];
  /**
   * **The bed up and back** (round DNB-7): in every section that does not lift, the
   * held and struck harmonic lanes' notes (the sustained role and the figure's) moved
   * up `octaves`, a note still under `floor` one more, one over `ceiling` back down,
   * and `db` under where they were — so the stage under them is the drums' and the
   * bass's. A lifted section (a breakdown, an intro that lifts) keeps its bed.
   */
  up?: Readonly<{ octaves: number; floor: number; ceiling: number; db: number }>;
  keysCeilDb?: number;
  padCeilDb?: number;
  pianoCeilDb?: number;
  duckDb?: number;
  struckDuckDb?: number;
  bellDb?: number;
  bothLean?: number;
}
/** The bell's corner and width (round EQ-2): the master's mid bell's corner, a little wider. */
export const BED_BELL = Object.freeze({ hz: 1100, q: 0.6 });
/**
 * **The bell keyed to the bed** (round EQ-5, `notes/rounds/eq-5.md`): the
 * row's `bellDb` is the most the bell lifts, and how much of it a section
 * takes is read off that section's own bed — the harmonic layer as the notes
 * written for it fill the section (`harmonicEnergyDb` of the loudness model,
 * `src/loudness.ts`: each role's level, the instrument's declared loudness and
 * how much of the section its notes sound for). A section whose bed sits at
 * or under `thinDb` takes the whole bell, one at or over `forwardDb` takes
 * none, and between them the bell falls in a straight line, about eight
 * tenths of a decibel of bell for every decibel the bed is under the forward
 * anchor. The anchors are where the measured links fall: the two thin beds
 * the bell was built for (seed 1 and seed 6, theme two) at -16.2 and -16.0,
 * the three already forward (seed 29 and 31 theme two, seed 6 theme one) at
 * -11.9, -11.0 and -13.5; over seeds 1-40 at the house, 38 % of the mains sit
 * at or under -16 and 43 % over -13. Nothing is measured from audio.
 */
export const BED_BELL_KEY = Object.freeze({ thinDb: -16, forwardDb: -13 });
/**
 * How much of what the row allows a section takes, from nought to one, off its
 * own bed (`BED_BELL_KEY`): all of it at or under the thin anchor, none at or
 * over the forward one, a straight line between. The bell and the floors read
 * the same number off the same reading, so a section is one bed to both.
 */
export function shareOfBed(bedDb: number): number {
  const { thinDb, forwardDb } = BED_BELL_KEY;
  return Math.max(0, Math.min(1, (forwardDb - bedDb) / (forwardDb - thinDb)));
}
/** The bell a section takes, in dB, from the most the row allows and the section's own bed (`BED_BELL_KEY`). */
export function bellOfBed(mostDb: number, bedDb: number): number {
  return +(mostDb * shareOfBed(bedDb)).toFixed(2) + 0;
}
/**
 * **The floors keyed to the bed** (round EQ-6, `notes/rounds/eq-6.md`): the
 * level a role plays at in a section, in dB, from the room's own level, the
 * row's floor and the section's own bed — the bed read as the bell reads it
 * (the harmonic layer standing on the floor). A thin bed rises the whole way
 * to the floor, a forward one keeps its room's level, and between them the
 * lift falls in the same straight line as the bell. A room that already stands
 * over the floor keeps its own level in every section (the growl room's keys,
 * pad and piano all do). The keyed level is never under the room's.
 */
export function floorOfBed(roomDb: number, floorDb: number, bedDb: number): number {
  return +(roomDb + Math.max(0, floorDb - roomDb) * shareOfBed(bedDb)).toFixed(2) + 0;
}

/**
 * **The grain by place** (round SPARK-1, `notes/rounds/spark-1.md`): the
 * 2-8 kHz presence the harmonic voices carry at their own register, made by
 * the voices and never by an octave up. Each part is optional and an absent
 * one is the record's sound (`grain.ts` in the engine says what each field is
 * and the range it is admitted in):
 *
 * - `keys`: the keyboard's edge — its own oscillators high-passed and let
 *   through beside its lowpass on the strike — and the strike's noise;
 * - `breath`: filtered noise under the strings' ensemble, at a whisper;
 * - `piano`: the hammer's level times `hammer`, the body lifted by `body`;
 * - `bus`: the parallel edge on the harmonic bus, its blend moved by Spark
 *   from the row's number (`grainFor`);
 * - `strike` (round HF-NOISE): the click a struck bar the edge does not read
 *   takes on its strike instead — written only where the bus's edge is, and
 *   moved by Spark as the bus's blend is, so it stands in for the edge and
 *   never plays where no edge would have.
 *
 * The keys' and the pad's are moved by Spark at the note, by the voices' own
 * `grain` knob; the bus's here, at plan time; the piano's not at all.
 */
export interface GrainEntry extends PlaceEntry {
  keys?: Readonly<KeysEdge>;
  breath?: Readonly<StringsBreath>;
  piano?: Readonly<PianoGrain>;
  bus?: Readonly<HarmonicEdge>;
  strike?: Readonly<MalletStrike>;
}
/** Spark on the bus's blend: from none at nought to two and a half times the row's at one, the row's at the place's own Spark. */
export const GRAIN_BUS_KNOB: EffectKnob = Object.freeze({ bird: 'spark', of: 'multiplier', min: 0, max: 2.5, sense: 1 });
/**
 * **What a theme writes for its grain**: the row's parts, each where the row
 * has one, as the settings' own fields — the bus's blend moved by Spark from
 * the row's (`placedKnob`) and left out where Spark takes it to nought.
 */
export function grainFor(row: GrainEntry | null, spell: Spell): Record<string, unknown> {
  if (!row) return {};
  const out: Record<string, unknown> = {};
  if (row.keys && (row.keys.level > 0 || row.keys.chiff > 0)) out.keys = { edge: { ...row.keys } };
  if (row.breath && row.breath.level > 0) out.strings = { breath: { ...row.breath } };
  if (row.piano && (row.piano.hammer !== 1 || row.piano.body > 0)) out.piano = { grain: { ...row.piano } };
  if (row.bus && row.bus.blend > 0) {
    const blend = +Math.min(1, placedKnob(GRAIN_BUS_KNOB, row.bus.blend, row.place, spell)).toFixed(4);
    if (blend > 0) out.harmonicEdge = { ...row.bus, blend };
    if (blend > 0 && row.strike && row.strike.level > 0) {
      const level = +Math.min(1, placedKnob(GRAIN_BUS_KNOB, row.strike.level, row.place, spell)).toFixed(4);
      if (level > 0) out.malletStrike = { ...row.strike, level };
    }
  }
  return out;
}

/**
 * **The drums' grain by place** (round SPARK-2, `notes/rounds/spark-2.md`):
 * the top of the kit given what the references' struck events have and ours
 * did not, at the level it had (`hat-grain.ts` in the engine says what each
 * field is). Each part optional, and an absent one is the record's sound:
 *
 * - `hats`: the closed and open hats and the kit's three (`hatTight`,
 *   `hatLoose`, `hatSizzle`): `top` the upper ladder's share of the metal,
 *   `air` the noise past the lid, `tail` the slope after -10 dB held to -20;
 * - `shaker`: the shaker's own `air` and `tail`, and `beads` of its hiss;
 * - `clap`: each hand's `crack`, its band `crackHz` and its fall `crackDecay`.
 *
 * Spark moves the levels from the row's at plan time (`DRUM_GRAIN_KNOB`,
 * `placedKnob`: none at nought, two and a half times at one, the row's at the
 * place's own Spark); the tail is a shape and Spark leaves it.
 */
export interface DrumGrainEntry extends PlaceEntry {
  hats?: Readonly<{ top: number; air: number; tail: number }>;
  shaker?: Readonly<{ air: number; tail: number; beads: number }>;
  clap?: Readonly<{ crack: number; crackHz: number; crackDecay: number }>;
}
/** Spark on the drums' grain: from none at nought to two and a half times the row's at one, the row's at the place's own Spark. */
export const DRUM_GRAIN_KNOB: EffectKnob = Object.freeze({ bird: 'spark', of: 'multiplier', min: 0, max: 2.5, sense: 1 });
/** The kit's hats a place's `hats` part reaches beside the closed and open hats: their room-voiced blocks. */
export const KIT_HATS = Object.freeze(['hatTight', 'hatLoose', 'hatSizzle'] as const);
/**
 * **What a theme writes for its drums' grain**: the row's parts as the
 * settings' own fields — the `hats` block's `top`, `air`, `tail` and the
 * shaker's three, the kit hats' blocks, the clap's crack — each level moved by
 * Spark from the row's (`placedKnob`) and held to its range.
 */
export function drumGrainFor(row: DrumGrainEntry | null, spell: Spell): Record<string, unknown> {
  if (!row) return {};
  const k = (v: number) => placedKnob(DRUM_GRAIN_KNOB, v, row.place, spell);
  const unit = (v: number) => +Math.max(0, Math.min(1, v)).toFixed(4);
  const out: Record<string, Record<string, number>> = {};
  if (row.hats && (row.hats.top > 0 || row.hats.air > 0 || row.hats.tail > 0)) {
    // the top is a share of the power over 7.5 kHz and stops at nine tenths (the noise is never all gone)
    const h = { top: Math.min(0.9, unit(k(row.hats.top))), air: unit(k(row.hats.air)), tail: unit(row.hats.tail) };
    out.hats = { ...h };
    for (const id of KIT_HATS) out[id] = { ...h };
  }
  if (row.shaker && (row.shaker.air > 0 || row.shaker.tail > 0 || row.shaker.beads > 0)) {
    out.hats = { ...(out.hats ?? {}), shakerAir: unit(k(row.shaker.air)), shakerTail: unit(row.shaker.tail), shakerBeads: unit(k(row.shaker.beads)) };
  }
  if (row.clap && row.clap.crack > 0) {
    const crack = +Math.max(0, Math.min(2, k(row.clap.crack))).toFixed(4);
    if (crack > 0) out.clap = { crack, crackHz: row.clap.crackHz, crackDecay: row.clap.crackDecay };
  }
  return out;
}

/**
 * **The support by place** (round DNB-3, `notes/rounds/dnb-3.md`; Eugene,
 * 10-05: *"give emphasis to the drums and bass, and have the other
 * peripherals create light ambient support for the low end"*): what the
 * voices that are neither the drums nor the bass may do at a place. Every
 * field is optional and a row with none is the composer as it was; the house
 * reads no row.
 *
 * - `withhold`: the composer's part families not drawn here (`composeParts`):
 *   each family draws off a stream of its own, so a family withheld moves no
 *   other, and a family that only follows a withheld one goes with it;
 * - `oneBed`: one harmonic layer at a time — the held layer, or the figure
 *   where a part asks for one (a row's chords) and the section lets the
 *   figure lane sound — never both, and never the struck layer on the stab
 *   mask alone: no stabs, no lead-entry rule, no lean to two layers;
 * - `bed`: the held layer's timbre drawn at the place from these weights, off
 *   a stream of its own after every die (as `LANE_SOUND`'s swap is), so the
 *   draw still decides inside the place's character;
 * - `bedRule`: the same draw by a rule instead of a list — any sustained timbre
 *   the catalogue holds that is not struck, holds at least `holdLeast` of
 *   itself at the bar line and has a corner at most `brightMost` Hz, each as
 *   likely as the next (his word, 10-05: *"it should really be fairly random;
 *   I'd rather be looking to make some general rules versus targeting a
 *   particular instrument"*);
 * - `holdOff`: lanes held off in the plan at the place, by role, as the drums
 *   off and a recipe's forbids hold theirs;
 * - `wet`: the held layer's notes sent to the room at least `reverb` and
 *   spread at least `spread` — the bed far and wide behind the drums.
 */
export interface SupportEntry extends PlaceEntry {
  withhold?: readonly string[];
  oneBed?: boolean;
  bed?: Readonly<Record<string, number>>;
  bedRule?: Readonly<{ holdLeast: number; brightMost: number }>;
  holdOff?: readonly string[];
  /**
   * What the place admits past a lane it holds off (liquid-space, 10-11): `auxiliary`, the one quiet part a phrase's
   * plan enters and takes out again (`DevelopmentEntry.aux`) — the sixteenth lane's own figure stays held off, so the
   * old sixteenths never come back; a narrow admission and not a lifted hold.
   */
  admits?: readonly string[];
  wet?: Readonly<{ reverb: number; spread: number }>;
}

/**
 * **The sparse keys by place** (liquid-space round 1, `src/keys-phrase.ts`): where a
 * place admits a keys part, the rows its themes play — the tone, the space, the
 * motif grammar, the wetness and the whole track's density — and the part's level in
 * the place's mix (`levelDb`, over the rows' own). The phrase is drawn by the rows'
 * own weights among those that fit the theme's key, and it is the theme's harmony: the
 * chords change where the keys land, and the bed and the bass read the same state. An
 * entry with no `keys` is a place without the part: its themes keep the harmony they had.
 */
export interface KeysEntry extends PlaceEntry {
  keys?: Readonly<{ draw: string; levelDb: number; leans?: BirdLeans }>;
}

/**
 * **The phrase development by place** (liquid-space, 10-11; `src/phrase-development.ts`): where the composer plans
 * the track phrase by phrase — a development row (the families and their variants), the one auxiliary part's row,
 * the surface's row and the bass's answers — and how the place leans it: `lean` multiplies a family's weight (the
 * birds' bias, by where the entry stands: higher Tide and Loom with lower Veil fewer answers), `surfaceDb` moves the
 * surface's level. A row of null is the place saying it plans nothing (every place but the fast ones, listed so a
 * place left out does not take a neighbour's).
 */
export interface DevelopmentEntry extends PlaceEntry {
  row: string | null;
  aux?: string;
  /** the surface's row, or its rows by weight (a track draws one) */
  surface?: string | ReadonlyArray<{ v: string; w: number }>;
  bass?: string;
  lean?: Readonly<Partial<Record<Family, number>>>;
  /** the birds on the plan (PLAN-UNIFY U2): Veil's on the effect moves (`effect`, a factor on the family's lean) and on the chapters' deadline for something salient (`deadline`, a factor on its bars) */
  leans?: BirdLeans;
  surfaceDb?: number;
  /** the ambient planner's rows (liquid-ambient, `src/ambient-plan.ts`): the bed's gestures and the chapters; absent, the bed is the keys planner's as written */
  ambient?: Readonly<{ bed: string; chapters: string; needs?: readonly GrammarNeed[] }>;
}

/**
 * **The ambient voices by place** (liquid-ambient, 10-11; `src/ambient-voices.ts`): where the composer lays the
 * breathy soloist and its motif, the conversation's one vocabulary and the weather family, each by the rows named
 * here (`recipes/ambient/`). An entry with no `ambient` is the place saying it lays none (every place but the fast
 * ones, listed so a place left out does not take a neighbour's).
 */
export interface AmbientVoicesEntry extends PlaceEntry {
  /**
   * `passage`: a written passage over the window it names (`src/passage.ts`); `producer`: the whole track arranged by
   * the producer's grammar around it (`src/producer.ts`). Each is one line in a place's entry: a place that names
   * neither plays the planners' track.
   */
  ambient?: Readonly<{ soloist: string; fillers: string; weather: string; admission: string; passage?: string; producer?: string; needs?: readonly GrammarNeed[] }>;
}

/** **The small things by place** (round DNB-1, `src/subsections.ts`). */
export interface SubSectionsEntry extends PlaceEntry {
  rates: SubRates;
  /** the birds on the rates (PLAN-UNIFY U2): Veil's on the fill at a section line (`fill`), a factor held under one */
  leans?: BirdLeans;
}
/**
 * **The kinds of section by place** (round T2, `src/sections.ts`): the shares
 * a place prefers among the section rows of a kind, by row id. A row the
 * entry does not name keeps its own weight; an empty table is the rows' own
 * weights, which at the house is one row per kind and no die.
 */
export interface SectionsEntry extends PlaceEntry { prefers: Readonly<Record<string, number>> }
/**
 * **A glue lane's sound by place** (round DNB-1): the stroke a section line
 * lands on swapped for the voice the sound word resolves to — a swap on a lane
 * that already plays a cheap voice, never a voice added on top.
 */
export interface GlueSoundEntry extends PlaceEntry { slot: 'impact'; sound: string }

/** The place tables a style may carry (`style.places`), read by `generate` under `placeTables`. */
export interface StylePlaces {
  harmony?: readonly HarmonyEntry[];
  form?: readonly FormEntry[];
  treatments?: readonly TreatmentEntry[];
  bassSound?: readonly BassEntry[];
  laneSound?: readonly LaneSoundEntry[];
  sounds?: Readonly<Record<string, string | null>>;
  /** read under `eqByTheme` as well: the master's tone by place (round E1) */
  eq?: readonly EqEntry[];
  /** the bass drive in parallel by place (round B1): written into a theme's `paramOverrides.bass.parallel`; `bassDriveHouse` is the house's own (round EQ-1) */
  bassDrive?: readonly BassDriveEntry[];
  bassDriveHouse?: BassDriveEntry;
  /** the bed by place (round EQ-2): the bed's level floors, the melodic duck, the bus bell, the lean to two harmonic layers; `bedHouse` is the house's own */
  bed?: readonly BedEntry[];
  bedHouse?: BedEntry;
  /** the grain by place (round SPARK-1): the keys' edge, the strings' breath, the piano's hammer and body, the harmonic bus's edge; `grainHouse` is the house's own */
  grain?: readonly GrainEntry[];
  grainHouse?: GrainEntry;
  /** the drums' grain by place (round SPARK-2): the hats' top, air and tail, the shaker's, the clap's crack; `drumGrainHouse` is the house's own */
  drumGrain?: readonly DrumGrainEntry[];
  drumGrainHouse?: DrumGrainEntry;
  /** the drums' weight by place (round DNB-1): the backbeat's lift, the kick's decay, the duck */
  drums?: readonly DrumsEntry[];
  /** the broken kit's figures by place (round DNB-4): the break table a place draws from in place of the style's */
  breaks?: readonly BreaksEntry[];
  /** the small things by place (round DNB-1), read under `subSections`; `subSectionsHouse` is the house's own */
  subSections?: readonly SubSectionsEntry[];
  subSectionsHouse?: SubRates;
  /** the kinds of section by place (round T2): which section row of a kind a place prefers, by weight */
  sections?: readonly SectionsEntry[];
  /** a glue lane's sound by place (round DNB-1) */
  glueSound?: readonly GlueSoundEntry[];
  /** how often the bass's root walks inside a held chord, by place (round DNB-2, `src/walk.ts`) */
  walk?: readonly WalkEntry[];
  /** the bass as a glide line over a home note, by place (round DNB-7, `src/glide.ts`): a row without a grammar is the lane's own figure */
  glide?: readonly GlideEntry[];
  /** the bass riff by place (liquid-riffs-2, `src/glide.ts`): the riff rows a gliding bass's themes draw, by weight; V's where none is near */
  riff?: readonly RiffEntry[];
  /** who carries the low end, by place (round DUB-1, `src/roles.ts`): read last, said on the plan, undone by `roles=classic` */
  roles?: readonly RolesEntry[];
  /** what the voices beside the drums and the bass may do, by place (round DNB-3); the house reads none */
  support?: readonly SupportEntry[];
  /** the sparse keys and the harmony they set, by place (liquid-space round 1, `src/keys-phrase.ts`); the house reads none */
  keys?: readonly KeysEntry[];
  /** the phrase development by place (liquid-space): the planner's rows and its lean; the house reads none */
  development?: readonly DevelopmentEntry[];
  /** the ambient voices by place (liquid-ambient): the soloist's, the conversation's, the weather's and the admission's rows; the house reads none */
  ambientVoices?: readonly AmbientVoicesEntry[];
  /** time by place (PLAN-UNIFY §2.2, `src/musical-time.ts`): the felt pulse a place's kit makes and the phrase it pins; the house reads none (the ring's own rule) */
  time?: readonly TimeEntry[];
}

/** The loop lengths a chord cycle may take, in bars: the phrase's own (`makeProgression` needs two chords' room). */
export const CYCLE_LOOPS: readonly number[] = Object.freeze([2, 4, 8, 16]);
/** Everything wrong with a place table's chord cycles, as sentences: a loop of 2, 4, 8 or 16 bars, a change every bars that divide it, whole degrees, a positive weight. */
export function cycleFaults(e: HarmonyEntry): string[] {
  const bad: string[] = [];
  for (const [i, c] of (e.cycles ?? []).entries()) {
    const at = `${e.id} cycle ${i}`;
    if (!CYCLE_LOOPS.includes(c.loop)) bad.push(`${at}: loop ${c.loop} is not one of ${CYCLE_LOOPS.join(', ')} bars`);
    if (!Number.isInteger(c.every) || c.every < 1 || c.loop % c.every !== 0) bad.push(`${at}: every ${c.every} does not divide its loop of ${c.loop}`);
    if (!Array.isArray(c.degrees) || !c.degrees.length || c.degrees.some((d) => !Number.isInteger(d))) bad.push(`${at}: degrees need whole scale degrees`);
    if (!(Number.isFinite(c.w) && c.w > 0)) bad.push(`${at}: weighs ${c.w}`);
  }
  return bad;
}

/**
 * **Everything wrong with a style's place tables, as sentences** (the review of
 * 10-08, A4): read once at load, so a typo in a table refuses the app by the
 * entry's id instead of falling through to a neighbour's or the lane's own.
 * Every sound word one the style resolves (`sounds`) and every resolved voice
 * one the engine has; the glide, form and kit rows the tables name rows that
 * exist, their weights positive; the section rows a place or a form row
 * prefers rows that exist; a treatment multiplier one the stage's rota draws;
 * the families a place withholds families the style composes, the lanes it
 * holds off roles a lane plays; and the chord cycles (`cycleFaults`). The
 * words a table may use come from the style (`vocab`), so nothing here names one.
 */
export function placesFaults(p: StylePlaces, vocab: { families: readonly string[]; roles: readonly string[]; treatments: readonly string[] }): string[] {
  const bad: string[] = [];
  const sounds = p.sounds ?? {};
  for (const [word, voice] of Object.entries(sounds)) if (voice !== null && !BY_NAME[voice]) bad.push(`sounds: ${word} resolves to ${voice}, no voice`);
  const word = (at: string, w: string | undefined) => { if (w !== undefined && !Object.hasOwn(sounds, w)) bad.push(`${at}: ${w} is not a sound word`); };
  for (const e of p.bassSound ?? []) word(e.id, e.sound);
  for (const e of p.laneSound ?? []) word(e.id, e.sound);
  for (const e of p.glueSound ?? []) word(e.id, e.sound);
  for (const e of p.drums ?? []) {
    for (const [from, w] of Object.entries(e.sounds ?? {})) { if (!BY_NAME[from]) bad.push(`${e.id}: sounds swaps ${from}, no voice`); word(e.id, w); }
    if (e.kit !== undefined && !KIT_IDS.includes(e.kit)) bad.push(`${e.id}: ${e.kit} is not a kit row`);
  }
  const rows = (at: string, list: ReadonlyArray<{ v: string; w: number }> | undefined, ids: readonly string[], what: string) => {
    for (const r of list ?? []) {
      if (!ids.includes(r.v)) bad.push(`${at}: ${r.v} is not a ${what} row`);
      if (!(Number.isFinite(r.w) && r.w > 0)) bad.push(`${at}: ${r.v} weighs ${r.w}`);
    }
  };
  const sectionIds = SECTION_LIBRARY.map((r) => r.id), formIds = FORM_LIBRARY.map((r) => r.id);
  for (const e of p.glide ?? []) rows(e.id, e.rows, GLIDE_LIBRARY.map((r) => r.id), 'glide');
  for (const e of p.form ?? []) rows(e.id, e.rows, formIds, 'form');
  for (const r of FORM_LIBRARY) for (const id of Object.keys((r as { form?: { prefers?: object } }).form?.prefers ?? {}))
    if (!sectionIds.includes(id)) bad.push(`${r.id}: form.prefers ${id}, no section row`);
  for (const e of p.sections ?? []) for (const [id, w] of Object.entries(e.prefers)) {
    if (!sectionIds.includes(id)) bad.push(`${e.id}: prefers ${id}, no section row`);
    if (!(Number.isFinite(w) && w >= 0)) bad.push(`${e.id}: prefers ${id} at ${w}`);
  }
  for (const e of p.treatments ?? []) for (const [name, w] of Object.entries(e.weights)) {
    if (!vocab.treatments.includes(name)) bad.push(`${e.id}: ${name} is not a treatment the rota draws`);
    if (!(Number.isFinite(w) && w >= 0)) bad.push(`${e.id}: ${name} at ${w}`);
  }
  for (const e of p.support ?? []) {
    for (const f of e.withhold ?? []) if (!vocab.families.includes(f)) bad.push(`${e.id}: withholds ${f}, no family`);
    for (const r of e.holdOff ?? []) if (!vocab.roles.includes(r)) bad.push(`${e.id}: holds off ${r}, no lane's role`);
  }
  for (const e of p.harmony ?? []) bad.push(...cycleFaults(e));
  for (const e of p.keys ?? []) {
    if (!e.keys) continue;
    const k = e.keys;
    if (!KEYS_ROWS.draws.includes(k.draw)) bad.push(`${e.id}: ${k.draw} is not a keys draw row`);
    if (!Number.isFinite(k.levelDb) || Math.abs(k.levelDb) > 18) bad.push(`${e.id}: levelDb ${k.levelDb}`);
  }
  // the phrase development: its rows exist and agree with the kit the same place plays, the voices they name are voices
  const kitAt = (place: Place) => {
    const d = (p.drums ?? []).find((x) => x.place === place)?.kit;
    return d ? kitOf(d) : null;
  };
  for (const e of p.development ?? []) {
    if (e.row === null) continue;
    const row = developmentOf(e.row);
    if (!row) { bad.push(`${e.id}: ${e.row} is not a development row (${DEVELOPMENT_IDS.development.join(', ')})`); continue; }
    const kit = kitAt(e.place) ?? (p.drums ?? []).map((x) => x.kit && kitOf(x.kit)).find(Boolean) ?? null;
    if (!kit) bad.push(`${e.id}: no kit plays where it plans`);
    const answers = kit ? Object.keys(answersOf(kit)) : [], moves = kit ? Object.keys(kit.moves ?? {}).filter((k) => Array.isArray(kit.moves![k])) : [];
    bad.push(...developmentFaults(row, answers, moves, kit ? Object.keys(statesOf(kit)) : []).map((m) => `${e.id} (${e.row}): ${m}`));
    if (e.aux !== undefined) { const a = auxOf(e.aux); if (!a) bad.push(`${e.id}: ${e.aux} is not an auxiliary row`); else bad.push(...auxFaults(a, (v) => !!BY_NAME[v]).map((m) => `${e.id} (${e.aux}): ${m}`)); }
    for (const id of typeof e.surface === 'string' ? [e.surface] : (e.surface ?? []).map((x) => x.v)) {
      const s = surfaceOf(id);
      if (!s) bad.push(`${e.id}: ${id} is not a surface row`); else bad.push(...surfaceFaults(s, (v) => !!BY_NAME[v]).map((m) => `${e.id} (${id}): ${m}`));
    }
    if (typeof e.surface === 'object' && e.surface.some((x) => !(Number.isFinite(x.w) && x.w > 0))) bad.push(`${e.id}: a surface weighs nought or less`);
    if (e.bass !== undefined && !bassAnswersOf(e.bass)) bad.push(`${e.id}: ${e.bass} is not a bass answers row`);
    for (const [f, m] of Object.entries(e.lean ?? {})) if (!(FAMILIES as readonly string[]).includes(f) || !(Number.isFinite(m) && (m as number) >= 0)) bad.push(`${e.id}: leans ${f} by ${m}`);
    if (e.surfaceDb !== undefined && !(Number.isFinite(e.surfaceDb) && e.surfaceDb <= 6 && e.surfaceDb >= -24)) bad.push(`${e.id}: surfaceDb from -24 to 6`);
  }
  for (const e of p.support ?? []) for (const a of e.admits ?? []) if (a !== 'auxiliary') bad.push(`${e.id}: admits ${a}, which is not auxiliary`);
  for (const e of [...(p.development ?? []), ...(p.ambientVoices ?? [])]) for (const n of e.ambient?.needs ?? [])
    if (!GRAMMAR_NEEDS.includes(n)) bad.push(`${e.id}: needs ${n}, which is not a grammar's need (${GRAMMAR_NEEDS.join(', ')})`);
  // time: a pinned phrase is a whole number of felt bars, a power of two of them; its Loom lean a centre in the bird's range
  for (const e of p.time ?? []) {
    if (e.felt !== undefined && e.felt !== 'whole' && e.felt !== 'half') bad.push(`${e.id}: felt ${e.felt}`);
    const P = e.phrase;
    if (!P) continue;
    const felt = P.bars / (e.felt === 'half' ? 2 : 1);
    if (!(Number.isInteger(felt) && felt >= 1 && (felt & (felt - 1)) === 0)) bad.push(`${e.id}: a phrase of ${P.bars} bars is not a power of two of felt bars`);
    if (!(P.loom.centre >= 0 && P.loom.centre <= 1) || !Number.isFinite(P.loom.strength)) bad.push(`${e.id}: the phrase's Loom lean`);
  }
  // a form row's states are states the kit plays (a full passage's) or the exposed ones the planner knows
  for (const r of FORM_LIBRARY) for (const st of ((r as { form?: { states?: unknown[] } }).form?.states ?? []).flat(2))
    if (typeof st === 'string' && !['bed', 'hints', 'pulse', 'half-time', 'developed'].includes(st)) bad.push(`${r.id}: form.states names ${st}`);
  return bad;
}

/**
 * **A technique is one line of a place's entry**: the ambient plan (a development entry's `ambient`), the written
 * passage and the producer's arrangement around it (an ambient-voices entry's `passage` and `producer`). A place turns
 * one on by naming its row; nothing else switches it.
 */
export type PlaceTechnique = 'ambient' | 'passage' | 'producer';

/**
 * The style with techniques taken out of every place's entry, as if no place named them: what a check plans when it
 * holds a planner to its own invariants without the technique that rewrites its work afterwards (a passage without
 * its producer is the passage alone; without the passage, neither plays). The app never plans this.
 */
export function withoutTechniques<S extends { places?: StylePlaces }>(style: S, ...off: PlaceTechnique[]): S {
  const P = style.places ?? {};
  const drop = <T extends object>(x: T | undefined, keys: string[]): T | undefined => {
    if (!x) return x;
    const out = { ...x } as Record<string, unknown>;
    for (const k of keys) delete out[k];
    return out as T;
  };
  return {
    ...style,
    places: {
      ...P,
      ...(P.development && off.includes('ambient') ? { development: P.development.map((e) => drop(e, ['ambient'])!) } : {}),
      // the producer keeps the passage its row names, so a passage taken out takes the producer with it
      ...(P.ambientVoices ? { ambientVoices: P.ambientVoices.map((e) => ({ ...e, ambient: drop(e.ambient, [...off.filter((k) => k !== 'ambient'), ...(off.includes('passage') ? ['producer'] : [])]) })) } : {}),
    },
  };
}
