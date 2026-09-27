// What a voice is allowed to say about itself.
//
// One descriptor lives beside each voice function, in the module that makes
// the sound, and `voices/index.ts` gathers them into one ordered REGISTRY that
// `VOICES`, `VOICE_BUS`, `VOICE_LEVEL` and `TIMBRES` are derived from. The
// point of the arrangement is stated in PLAN-V1-NEXT and in the design review
// beside it, and it is one sentence: **the registry is a lookup table, never
// the pool the dice draw from.** Registering an instrument must not move a v1
// seed, so no die reads this file — the dice read the style's frozen
// candidate lists (`packages/deep-house/src/catalogue.ts`), which name their
// entries.
//
// The three vocabularies below are closed on purpose. A word that is not in
// them is a word nobody agreed to, and `tools/check.ts` fails on it.

import type { VoiceOut } from '../dsp.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

// What the thing is. `drum` is a hit with a body of its own, `noise` the
// band-passed hiss layer (the hats and the shaker are one engine: six
// inharmonic squares beating under a noise bed), `bass` the bottom octave,
// `keyboard` and `ensemble` the two halves of the harmonic layer — struck and
// held — and `effect` the seam and section glue that plays no part in the
// harmony.
export const FAMILIES = ['drum', 'bass', 'keyboard', 'ensemble', 'noise', 'effect', 'vocal'] as const;

// What it does in a composition. A role is what a recipe asks for; the
// instrument filling it is the recipe's business and never the role's.
export const ROLES = [
  'kick', 'offbeat', 'sixteenth', 'backbeat', 'bassline',
  'sustained', 'figure', 'melody', 'texture',
] as const;

// Where it lands. The five buses `buildGraph` makes.
export const BUSES = ['kick', 'sub', 'drums', 'melodic', 'keys'] as const;

export type VoiceFamily = typeof FAMILIES[number];
export type VoiceRole = typeof ROLES[number];
export type VoiceBus = typeof BUSES[number];

/**
 * What one note of a voice costs, as a class rather than a number. It is a
 * type and not a fourth vocabulary array, because nothing at runtime walks it:
 * `VOICE_COST_BANDS` and `VOICE_COST_UNITS` below are keyed by it and the gate
 * reads them.
 */
export type VoiceCost = 'cheap' | 'mid' | 'dear';

/** The three sends whose return is built only when something uses it. */
export const LAZY_RETURNS = ['hall', 'background', 'immersed'] as const;
export type LazyReturn = typeof LAZY_RETURNS[number];

/**
 * **A note's own parameters, and they are open on purpose.**
 *
 * Every instrument declares a different one — a pitch and a level for a note, a
 * curve and a tail for a sweep, a size for a tom — and the engine carries the
 * object from the compiler to the voice and reads none of it. One shared type
 * here rather than thirty is the same decision `program.ts` writes down on
 * `ProgramEvent.p`, in the same words: a shape stated here would be a list of
 * every instrument that exists, which is the thing the registry is for.
 *
 * The values are `any` for exactly that reason — what is in them belongs to the
 * one voice that wrote them and the one voice that reads them.
 */
export type NoteParams = Record<string, any>;

/**
 * What a pre-render hook may be told about the render it is preparing for.
 * `all` is an offline render, which has the whole timeline and no deadline;
 * `from` is the live mix, which prewarms a window round where it is about to
 * play rather than a whole theme it cannot hold.
 */
export interface PrepareOptions {
  all?: boolean;
  from?: number;
  /**
   * Which program this preparation is for, as an identity: a second
   * preparation with the same `id` (a seek) replaces the first rather than
   * standing beside it. `prepareVoices` fills it with the program's own
   * `events` array, which is the same object for as long as the program is,
   * where the array a hook is handed is filtered afresh on every call (R29).
   */
  id?: object;
}

/**
 * The voice function itself: the same five arguments everywhere in this
 * folder, and the instant the sound is silent back.
 */
export type VoiceRenderer = (
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams,
  settings: Settings,
  /** the event's own time in its theme, where a voice's dice are off the strike */
  at?: number,
) => number;

/**
 * The pre-render hook, as `prepareVoices` calls it: the events handed over are
 * the ones of the voices that share this hook and nothing else.
 */
export type PrepareHook = (
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
  opts: PrepareOptions,
) => Promise<void>;

/** The lead a voice's sound needs, in seconds, out of that event's own parameters. */
export type Anticipates = (p: NoteParams) => number;

/**
 * The four numbers a harmonic family declares about itself, for the loudness
 * fit — carried over verbatim from the TIMBRES table the loudness round wrote,
 * never re-measured here.
 */
export interface TimbreFacts {
  /** the timbre family the fit groups it under */
  family: string;
  /** does the note arrive as a hit */
  struck: boolean;
  /** the fraction still sounding at the bar line */
  hold: number;
  /** its own filter corner */
  brightnessHz: number;
  /**
   * MEASURED: the family alone in an eight-bar main groove, less the level its
   * room gave it
   */
  loudnessDb: number;
}

/**
 * **What a knob is in, where it may go, and which bird moves it.**
 *
 * PLAN-MODULATION M1. A voice's descriptor has always declared *fixed* facts —
 * `struck`, `hold`, `brightnessHz`, `loudnessDb` — and rendered at those numbers
 * every time, so a spell that wanted "brighter" could only reach for a brighter
 * *instrument* and, once the list was exhausted, the sound could not follow the
 * bird any further. A knob is the same fact declared as a **range**.
 *
 * Five rules, and none of them bends:
 *
 *   **`default` is the number the voice already uses**, so at the house every
 *   knob is at its default, the scale the voice multiplies by is exactly 1, and
 *   `x * 1 === x` for every finite double. The identity is the arithmetic and
 *   never a branch, which is the rule the spell layer was written under.
 *   **`min` and `max` are the ends a gate proved artefact-free** — DC, aliasing,
 *   clicks, peaks, both engines, both rates (`tools/test-voices.ts --knobs`).
 *   A hand may narrow them; only a measurement may widen one.
 *   **`slopeDb` is MEASURED**, in decibels per unit of the knob, by the same
 *   gate at min, default and max. The loudness fit reads
 *   `loudnessDb + slope x (setting - default)`, and the gate refuses a knob
 *   whose slope has not been measured exactly as it refuses a voice whose
 *   loudness has not.
 *   **A knob may not change the voice's cost class.** A filter is a filter at
 *   any corner; a knob that would move the class (an unison count) is a
 *   different voice. `knobFaults` asserts the class is declared and the budget
 *   check reads the same class it always did.
 *   **No knob is ever set by name** from a style, a recipe or a URL. The spell
 *   is the only writer, through one mapping over the bird this row names, so a
 *   recipe written in 2026 works on a voice written in 2028.
 */
export interface KnobSpec {
  unit: KnobUnit;
  /** the artefact-free floor */
  min: number;
  /** MEASURED: the number the voice uses at the house */
  default: number;
  /** the artefact-free ceiling */
  max: number;
  /** which bird moves it, by the composer's own name for it */
  bird: KnobBird;
  /** +1 where the bird pulled up opens the knob, -1 where it closes it */
  sense: 1 | -1;
  /** MEASURED: decibels per unit of the knob, written by the gate */
  slopeDb: number;
}

/**
 * The units a knob may be in. Deliberately shorter than the effects' list: a
 * voice knob is a corner, a time, or a fraction of itself, and a word that is
 * not here is a word nobody agreed to.
 *
 * **A knob name is a property and the unit says how that voice measures it.**
 * `hold` is a ratio on every voice that declares a `hold` timbre fact — the
 * fraction still sounding at the bar line — and is in seconds on the kick,
 * whose fraction at the bar line is nought by construction and whose tail is
 * the -34 dB time the benchmark states.
 */
export const KNOB_UNITS = ['hz', 'seconds', 'ratio', 'db'] as const;
export type KnobUnit = typeof KNOB_UNITS[number];

/**
 * The birds, as a closed vocabulary, so a knob cannot name one that does not
 * exist. It is the **composer's** list and it is written here because a knob
 * declares which bird moves it; `tools/check.ts` holds it word for word against
 * `src/spell.ts`'s `BIRDS`, so the two cannot drift.
 */
export const KNOB_BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'] as const;
export type KnobBird = typeof KNOB_BIRDS[number];

/**
 * **The one thing a voice does with a knob: a factor against its own default.**
 *
 * A setting reaches a voice on its event's own parameters, as `p.knobs`, put
 * there per theme at the boundary by the performance compiler the way a
 * treatment's settings are. What the voice multiplies its own number by is the
 * setting over the default, which is **exactly 1** where nothing was asked for
 * and where the spell is at the house — so the note is the note it always was,
 * to the bit, and the program digest is what says so.
 *
 * A factor and not the value itself, for the plainest of reasons: `keys` is
 * five patches with five corners and `pad` is four timbres with four, so a
 * setting written in absolute hertz would make one instrument out of five. The
 * declared `min`, `default` and `max` still say what the knob means in real
 * units, for the patch the timbre table measures.
 */
export function knobScale(p: NoteParams | undefined, knobs: Knobs | undefined, name: string): number {
  if (!knobs || !p) return 1;
  const spec = knobs[name];
  const set = p.knobs ? p.knobs[name] : undefined;
  if (!spec || typeof set !== 'number' || !Number.isFinite(set) || !(spec.default > 0)) return 1;
  // Held to the knob's own range here, at the voice, as a control is (R78 of
  // the reconciled review of 09-24): the spell clamps what it writes, so the
  // record never reaches past an end, but the range is the voice's promise and
  // not the one writer's — a knob asked past its end plays the end.
  return Math.max(spec.min, Math.min(spec.max, set)) / spec.default;
}

/** Every knob one voice declares, by the property it is a range of. */
export type Knobs = Record<string, KnobSpec>;

/**
 * **A note control: a number a part may write on a note, and the range the
 * voice takes it in.**
 *
 * Knobs are what a bird moves; controls are what a *part* writes — a conga's
 * colour, a sub's body, a vocal's vowel — through the composer's characters,
 * and v2's golden themes already lean on them (2,089 conga notes carry a colour
 * and 1,520 sub notes a body). Until the engine review of 09-22 they were a
 * list of names: no range, no clamp, no default anybody had checked, and a NaN
 * `bodyLp` threw on the note. Now each is declared once, beside the sound:
 *
 *   `min`/`max`  the range the voice takes it in. `noteControl()` clamps to it
 *                at the voice, so a value past an end plays the end and a value
 *                that is not a finite number plays the default — never a throw
 *                on the scheduling tick. `tools/test-voices.ts --controls`
 *                renders both ends on the voice's own fixture and holds them to
 *                the scenes' gates (finite, peaks, DC) and to doing something.
 *   `default`    what the voice plays when the note does not say, where that is
 *                one number; `null` where it is the articulation's or the
 *                room's own value (a conga's head tuning is the drum and the
 *                hand the note asked for). A number is MEASURED by the same pass:
 *                the fixture with the control written at its default renders
 *                the same samples as the fixture without it.
 *
 * No slope: no bird moves a control and the loudness fit reads none. A part
 * that changes a voice's level through its controls is trimmed by the part
 * (the hand colours carry their own measured `gainDb`), not by the voice.
 */
export interface ControlSpec {
  unit: ControlUnit;
  min: number;
  max: number;
  default: number | null;
}
/**
 * `level` is a gain on something inside the voice; `switch` is 0 or 1 (a value
 * between is taken to the nearer).
 */
export const CONTROL_UNITS = ['hz', 'seconds', 'ratio', 'cents', 'level', 'send', 'switch'] as const;
export type ControlUnit = typeof CONTROL_UNITS[number];
export type Controls = Record<string, ControlSpec>;

/**
 * The one reading of a control, clamped to its declared range: the number to
 * play, or `undefined` for "the voice's own", which is what an absent control,
 * and one that is not a finite number, both mean.
 */
export function noteControl(p: NoteParams | undefined, controls: Controls, name: string): number | undefined {
  const v = p ? p[name] : undefined;
  const spec = controls[name];
  if (v === undefined || v === null || !spec) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const c = Math.min(spec.max, Math.max(spec.min, v));
  return spec.unit === 'switch' ? Math.round(c) : c;
}

/**
 * A note's parameters with every declared control taken into its range: the
 * same object when nothing needed taking (so a note inside its ranges is the
 * note it always was), else a copy with the clamped values and without the
 * ones that were not numbers. For a voice whose body reads `p.<control>` in
 * several places, this is the one line at its door.
 */
export function withControls(p: NoteParams, controls: Controls): NoteParams {
  if (!p) return p;
  let out: NoteParams | null = null;
  for (const k of Object.keys(controls)) {
    const v = p[k];
    if (v === undefined) continue;
    const c = noteControl(p, controls, k);
    if (c === v) continue;
    out ??= { ...p };
    if (c === undefined) delete out[k]; else out[k] = c;
  }
  return out ?? p;
}

/** The sends a note may set, one range for every voice: a gain, at most 6 dB over unity. */
export const SEND_CONTROL: ControlSpec = { unit: 'send', min: 0, max: 2, default: null };

/**
 * Everything wrong with one voice's control table, as sentences; empty is a
 * complete one. The declaration only: whether the ends are clean and the
 * default is the voice's own are renders (`tools/test-voices.ts --controls`).
 * A voice that declares `controls` hands its names on as `noteControls`, so
 * the two may not disagree.
 */
export function controlFaults(d: any): string[] {
  const bad: string[] = [];
  const name = (d && d.name) || 'a voice with no name';
  if (!d || typeof d !== 'object') return bad;
  if (d.noteControls !== undefined && d.controls === undefined) return [`${name}: noteControls with no declared ranges`];
  if (d.controls === undefined) return bad;
  const table = d.controls;
  if (!table || typeof table !== 'object' || Array.isArray(table) || !Object.keys(table).length) return [`${name}: controls is not a table of ranges`];
  const names = Object.keys(table);
  if (!Array.isArray(d.noteControls) || d.noteControls.length !== names.length || names.some((k) => !d.noteControls.includes(k)))
    bad.push(`${name}: noteControls (${d.noteControls}) is not the declared controls (${names})`);
  for (const [k, s] of Object.entries<any>(table)) {
    if (!s || typeof s !== 'object') { bad.push(`${name}: ${k} is not a range`); continue; }
    if (!(CONTROL_UNITS as readonly string[]).includes(s.unit)) bad.push(`${name}: ${k} is in ${s.unit}, which is not a unit`);
    if (!Number.isFinite(s.min) || !Number.isFinite(s.max) || !(s.min < s.max)) bad.push(`${name}: ${k} runs from ${s.min} to ${s.max}`);
    if (s.default !== null && (!Number.isFinite(s.default) || s.default < s.min || s.default > s.max))
      bad.push(`${name}: ${k} defaults to ${s.default}, outside its own ${s.min} to ${s.max}`);
    if (s.unit === 'switch' && (s.min !== 0 || s.max !== 1)) bad.push(`${name}: ${k} is a switch and runs from ${s.min} to ${s.max}`);
  }
  return bad;
}

/**
 * One instrument, as the module that makes it describes it.
 */
export interface Descriptor {
  /**
   * the event string. It never changes: the golden digest hashes every event's
   * `voice`.
   */
  name: string;
  family: VoiceFamily;
  /** what it can play */
  roles: VoiceRole[];
  bus: VoiceBus;
  /** the key in the settings' `levels` it is trimmed to */
  level: string;
  /**
   * the layer its events carry — what the solo-stem renders, the lane meters
   * and the loudness fit filter on
   */
  layer: string;
  /**
   * the arrangement layer that gates it, or null for a voice the arrangement
   * does not schedule
   */
  plays: string | null;
  /** the mono gate: this voice has no side at all */
  mono: boolean;
  /**
   * whether the sound stage (packages/deep-house/src/performance.ts) may move
   * it
   */
  treat: boolean;
  /**
   * a voice whose sound has to *start* before its event's time says: the lead,
   * in seconds, from that event's own parameters. `null` for everything that
   * arrives when it is struck. The compiler resolves it once into the program's
   * `lead` and `onset`, so no scheduler ever asks.
   */
  anticipates: Anticipates | null;
  /**
   * the pre-render hook, if it has one. It is handed the events of the voices
   * that share it and nothing else, so no hook picks its own out of a theme
   */
  prepare: PrepareHook | null;
  /**
   * the voice function itself. Since round C the fifth argument is the resolved
   * settings the sound is made under; a voice that reads nothing from them (the
   * four effects) does not declare it.
   */
  render: VoiceRenderer;
  /**
   * The note controls this renderer implements, with the range it takes each
   * in (see `ControlSpec`). Absent on a voice with none.
   */
  controls?: Controls;
  /**
   * Their names, for a part asking whether a voice can take a character:
   * always `Object.keys(controls)`, which `controlFaults` holds.
   */
  noteControls?: readonly string[];
  /**
   * The lazy returns (a convolver built only for a program that uses it) this
   * voice sends to when its note does not say otherwise: the piano's hall. A
   * note's own `p.hall` of 0 still keeps it out, and the background and
   * immersed spaces are reached only by a note that asks (`p.background`,
   * `p.immersed`). `returnsOf` in the registry reads this so a deck builds its
   * returns when it is made and never on the tick a note is scheduled.
   */
  returns?: readonly LazyReturn[];
  /** the timbres this module renders, for the harmonic families; `{}` otherwise */
  timbres: Record<string, TimbreFacts>;
  /**
   * the legacy aliases: the timbre names this one event voice stands for. Empty
   * where the voice is one instrument.
   */
  dispatches: string[];
  /**
   * MEASURED: what one note of this voice costs, as a class rather than a
   * number, because the number is a property of the machine and the class is a
   * property of the instrument. Round K4 added it and `tools/budget.ts --bless`
   * writes it; `VOICE_COST_BANDS` below says what each class means. It is the
   * effects' own `cost` field, one folder over, and for the same purpose: a
   * strategy has to be able to add up what it is about to ask a phone for
   * **before** it asks.
   */
  cost?: VoiceCost;
  /**
   * The ranges this voice really has, if any. Absent — which is forty-six of
   * the fifty-two — is a voice no bird can season, which is honest and is what
   * the completeness readout prints. See `KnobSpec`.
   */
  knobs?: Knobs;
  /**
   * nothing reads it. It is here so that the day a recipe wants words, the
   * words have a home that is not a switch statement.
   */
  mood: string[];
}

/**
 * What a voice's cost class means, in the three readings round K4 takes.
 *
 * `nodes` is how many audio nodes **one note** builds — the count that decides
 * whether a bar of sixteenths is affordable at all. `relative` is how long a
 * minute of that voice *playing its own figure* takes to render, against the
 * same reference the effects use (`effects/contract.ts`'s `COST_REFERENCE`, the
 * overdrive through a minute of noise), so a chain and a cast add up in one
 * currency. `prepareKb` is what the voice asks a context to hold before its
 * first note, which is a memory budget and not a time one and is why it is a
 * third number rather than folded into the other two: a phone with the piano's
 * strings in it has paid for them whether or not it plays them.
 *
 * A voice is the first band it fits in on **all three**: what a phone runs out
 * of first is not something a class may average away.
 *
 * The three boundaries are MEASURED and they are where the catalogue actually
 * falls (`node tools/budget.ts`, and `notes/archive/2026-09-kitchen/rounds/k4.md` has the table): the
 * seam glue and the simplest drums under 8x, the rest of the percussion and the
 * plainest harmonic voices under 25x, and everything with a stack of
 * oscillators in it above that. And the headline of that table is a number
 * worth carrying: **a voice costs one to two orders of magnitude more than an
 * effect.** The whole effects kitchen, all twenty-six at once, is 64 units; one
 * pad is 35. A strategy that worries about its chain and not about its cast is
 * worrying about the wrong half.
 */
export const VOICE_COST_BANDS: Record<VoiceCost, { nodes: number; relative: number; prepareKb: number }> = {
  cheap: { nodes: 8, relative: 8, prepareKb: 64 },
  mid: { nodes: 20, relative: 25, prepareKb: 1024 },
  dear: { nodes: 512, relative: 400, prepareKb: 16384 },
};

/**
 * What one voice of each class is worth when a strategy is added up, in the
 * same units as the effects' `COST_UNITS` — one cheap effect. They are the
 * middles of the bands above, so a ceiling stated in these is a ceiling in the
 * thing actually being rationed.
 */
export const VOICE_COST_UNITS: Record<VoiceCost, number> = { cheap: 4, mid: 12, dear: 35 };

/**
 * What a field is checked as. Four of them are a shape rather than a word: a
 * `plays` is a string or nothing, and `anticipates` and `prepare` are a
 * function or nothing.
 */
export type VoiceFieldKind =
  | 'string' | 'array' | 'boolean' | 'object'
  | 'string-or-null' | 'function' | 'function-or-null';

/** Every field a descriptor must carry, and what it must be. */
export const FIELDS = {
  name: 'string',
  family: 'string',
  roles: 'array',
  bus: 'string',
  level: 'string',
  layer: 'string',
  plays: 'string-or-null',
  mono: 'boolean',
  treat: 'boolean',
  anticipates: 'function-or-null',
  prepare: 'function-or-null',
  render: 'function',
  timbres: 'object',
  dispatches: 'array',
  mood: 'array',
} as const satisfies Record<string, VoiceFieldKind>;

/**
 * Everything wrong with one voice's knob table, as sentences. Empty is a
 * complete one.
 *
 * It lives here rather than in the gate for the reason the effects' `faultsOf`
 * lives in their contract: the vocabularies are in this file, and a rule stated
 * in the checker instead of the contract is a rule the contract does not have.
 * `d` is unvalidated on purpose — up to and including a descriptor that is not
 * an object — so every unchecked read below is the point of it.
 *
 * What it does **not** check is whether the ends are clean or the slope is
 * true: those are renders, and they are `tools/test-voices.ts --knobs`. What it
 * checks is that the declaration is well formed and that nothing was left for
 * a measurement to fill in later and then forgotten.
 */
export function knobFaults(d: any): string[] {
  const bad: string[] = [];
  const name = (d && d.name) || 'a voice with no name';
  const say = (what: string) => bad.push(`${name}: ${what}`);
  if (!d || typeof d !== 'object' || d.knobs === undefined) return bad;
  if (!d.knobs || typeof d.knobs !== 'object' || Array.isArray(d.knobs)) return [`${name}: knobs is not a table`];
  if (!Object.keys(d.knobs).length) return [`${name}: an empty knob table, where a voice with no knobs declares none at all`];
  // A knob may not change the cost class, so there has to be one to hold it to.
  if (!d.cost) say('it declares knobs and no cost class, and a knob may not move a class that is not there');
  for (const [knob, spec] of Object.entries<any>(d.knobs)) {
    if (!spec || typeof spec !== 'object') { say(`${knob} is not a knob`); continue; }
    if (!(KNOB_UNITS as readonly string[]).includes(spec.unit)) say(`${knob} is in ${spec.unit}, which is not a unit`);
    if (!(KNOB_BIRDS as readonly string[]).includes(spec.bird)) say(`${knob} is moved by ${spec.bird}, which is not a bird`);
    if (spec.sense !== 1 && spec.sense !== -1) say(`${knob} has a sense of ${spec.sense}, which is neither +1 nor -1`);
    for (const k of ['min', 'default', 'max']) if (!Number.isFinite(spec[k])) say(`${knob} has no ${k}`);
    // The slope is a measurement and `null` is what an unmeasured one looks
    // like. A knob may not ship without one: the loudness fit would read a
    // seasoned voice at the level of an unseasoned one and trim the theme by
    // the difference.
    if (!Number.isFinite(spec.slopeDb)) say(`${knob} has no measured slopeDb: run tools/test-voices.ts --knobs --bless`);
    if (Number.isFinite(spec.min) && Number.isFinite(spec.max) && !(spec.min < spec.max)) say(`${knob} runs from ${spec.min} to ${spec.max}`);
    if (Number.isFinite(spec.default) && (spec.default < spec.min || spec.default > spec.max))
      say(`${knob} sits at ${spec.default}, outside its own ${spec.min} to ${spec.max}`);
    // **That the default is the number the voice already uses is not checked
    // here, and deliberately.** A table beside a table proves nothing: `keys`
    // is five patches with five corners and a timbre's `brightnessHz` is what
    // the *fit* reads, which is not always the corner the filter is set to.
    // What proves it is a render — the scene at the declared default against
    // the scene with no knob on it, sample for sample, in both engines — and
    // that is `tools/test-voices.ts --knobs`, where the ends are proved too.
  }
  return bad;
}

/** The knobs one voice declares, or an empty table. */
export const knobsOf = (d: Descriptor | undefined): Knobs => (d && d.knobs) || {};

/**
 * **The same seasoning, in another voice's units.**
 *
 * Two voices in this folder dispatch: `pad` renders two of its four timbres
 * itself and hands the other two to `keys` held rather than struck. A setting
 * is a number against the *declaring* voice's default, so handing `pad`'s
 * `hold` of 0.52 straight to a module whose default is 0.32 would be a factor
 * of 1.6 nobody asked for. This re-expresses each setting against the callee's
 * own default so that the **factor** survives the hand-over, which is the thing
 * the sound is made of.
 *
 * A note with no knobs on it is handed back the object it came with, so the
 * dispatch is the dispatch it always was.
 */
export function rescaleKnobs(p: NoteParams, from: Knobs, to: Knobs): NoteParams {
  if (!p || !p.knobs) return p;
  const out: Record<string, number> = {};
  for (const [name, set] of Object.entries<any>(p.knobs)) {
    const a = from[name];
    const b = to[name];
    if (!a || !b || !(a.default > 0) || typeof set !== 'number' || !Number.isFinite(set)) continue;
    out[name] = b.default * (set / a.default);
  }
  return { ...p, knobs: out };
}
