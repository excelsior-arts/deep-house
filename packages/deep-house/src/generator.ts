// seed + length -> the whole track as data. No audio here at all: this file
// produces an event list and a set of automation curves you can print, diff or
// inspect in the console before a single oscillator exists.
//
// Every choice is a separate die rolled from the seed — key, tempo family,
// voicing style, keys timbre, bass template, stab figure, hat figure, section
// plan, FX palette — so the product of the dice, not one number, is what makes
// two seeds different records.

import { charactersOf } from './parts/sound.ts';
import { mergeParams, hatEnergy } from '@deep-house/engine/params';
import type { ParamOverrides } from '@deep-house/engine/params';
import { resolveSettings } from '@deep-house/engine/settings';
import { voicePlaying, TIMBRES, VOICE_KNOBS, GLUE_SHAPES } from '@deep-house/engine/voices';
import type { Knobs } from '@deep-house/engine/voices';
import { dbToGain } from '@deep-house/engine/dsp';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import type { Lane, Room, Style } from '@deep-house/engine/style';
import { laneVoices, sourcesOf, slotOf, layerOf, percussionGates, PERCUSSION_ROLES, switchOn, silencedBy, withdrawnFrom, familyOf, type LaneWithdrawal } from './lanes.ts';
import type { FigureGroup } from './lanes.ts';
import Rng from './rng.ts';
import type { Seed } from './rng.ts';
import { HOUSE, biasFor, knobsFor, pickerFor, scaleWeighted, tempoInFamily } from './spell.ts';
import type { Bias, Derived, KnobSettings, Spell } from './spell.ts';
import { interpretWants } from './interpret.ts';
import type { Register } from './motif.ts';
import type { Recipe } from './recipe.ts';
import { withRhythm } from './parts/rhythm.ts';
import { asksRealWorld, composeParts, medianGapSteps, permitted, realWorld, type SceneContext } from './composition.ts';
import type { CompositionPolicy } from './composition-policy.ts';
import { developmentOf, type Development } from './development.ts';
import { prepareRhythmDevelopment, type RhythmPhase, type rhythmPickup } from './development-rhythm.ts';
import { kickPickupHits, recipeRhythmSource, rhythmGates, type RhythmPerformer } from './parts/perform-rhythm.ts';
import { recipeRequest, type Accompaniment } from './recipe-request.ts';
import { rollMotifs, performMotif, type MotifPerformer, type PlayedMotif } from './motif-perform.ts';
import { recipeFigureSource, rollFigures } from './parts/perform-figure.ts';
import { rollTexture, treat } from './parts/treat.ts';
import { SCALES, makeProgression, chordAtBar, noteName, foldTo } from './theory.ts';
import type { Chord, Progression } from './theory.ts';
import { makeArrangement, filterCurve, pushCurve, layersAtBar, phraseGrid, setGrid, type Section } from './arrangement.ts';
import { planForm } from './form-plan.ts';
import { readout } from './readout.ts';
import { swellsOf, applySwells } from './swell.ts';
import { liftTexture, soloPlace, soloEvents, soloCeiling } from './solo.ts';
import { hatsBySection } from './hats.ts';
import { fillSilence } from './silence.ts';
import { glueVerdict, isNoiseGlue } from './glue.ts';
import { sweepsOf, sweepCurves, glueFadesOf, type BusSweepCurves } from './sweep.ts';
import * as P from './patterns.ts';

const TAIL_SECONDS = 4;

// Which room this theme is in. The style declares its rooms and its catalogue
// names the ones the die may draw; a room that is declared and not named is
// dormant, which is what makes measuring a third one free.
//
// One draw, through the sampler whose equal-weight case *is* `pick` — proved
// bit-identical to it on every boundary value a list of this length can put a
// draw on (round A, `the exact-boundary sampler` in tools/check.ts). It is
// what lets the pool carry a weight, and a room at weight 0, without moving a
// seed; every legacy `pick` the dice used went the same way in round B.
export function resolveRoom(
  style: Style,
  id: string | null | undefined,
  rng: Rng,
  bias: Bias = biasFor(null, style),
): Room {
  if (id && id !== 'auto' && style.rooms[id]) return style.rooms[id];
  const rooms = style.catalogue.rooms;
  return style.rooms[rng.pickWeighted(rooms, pickerFor(bias, 'rooms', rooms.length))];
}

// Which instrument leads a theme. MEASURED weights (timbres.md); the list and
// its weights are the style's `catalogue.leadTimbres`, which is its own table's
// `timbre.lead` — read off the *style* rather than a room's resolved settings.
// The set asks what theme n-1 really led with through `leadTimbreOfTheme`
// below; the raw die it once asked, before the lean and the scene's redraw,
// was a draw no theme makes (R37 of the review of 09-24).
//
// The organ is the rare colour: about one theme in ten, and never two themes
// running. `avoidOrgan` is the mix telling this theme that the last one was an
// organ; a single track never sets it — and, as things stand, neither does the
// mix, so `dice('timbre:again')` draws zero times in the released catalogue.
// That is a fact and not a fault; it is in the style's reachability note.
export function leadTimbreFor(
  style: Style,
  seed: Seed,
  avoidOrgan = false,
  bias: Bias = biasFor(null, style),
  lean: <T extends { v: string; w: number }>(list: T[]) => T[] = (list) => list,
): string {
  const t = new Rng(`${seed}::timbre`).weighted(lean(scaleWeighted(style.catalogue.leadTimbres, bias, 'leadTimbres')));
  if (t !== 'organ' || !avoidOrgan) return t;
  return new Rng(`${seed}::timbre:again`).weighted(
    lean(scaleWeighted(style.catalogue.leadTimbres, bias, 'leadTimbres')).filter((o) => o.v !== 'organ')
  );
}

/**
 * The lean a strategy's `catalogue.holdLean` asks for at this density, as a
 * function over a list — one per list id, the identity where the block is
 * absent, names another density or names another list. A newcomer (an entry
 * rule 2 opened, which carries `opened`) is scaled by one minus its timbre's
 * declared `hold`; an incumbent is handed through as the same object.
 */
export function holdLeanFor(
  catalogue: { holdLean?: { densities: readonly string[]; lists: readonly string[] } | null },
  density: string,
): (id: string) => <T extends { v: string; w: number; opened?: number }>(list: T[]) => T[] {
  const block = catalogue.holdLean;
  const on = !!block && block.densities.includes(density);
  return (id) => (list) => {
    if (!on || !block!.lists.includes(id)) return list;
    return list.map((e) => {
      if (e.opened === undefined) return e;
      const hold = TIMBRES[e.v]?.hold;
      return Number.isFinite(hold) ? { ...e, w: e.w * (1 - (hold as number)) } : e;
    });
  };
}

// A send amount rolled inside a family's own measured spread, leaning wet:
// `dB` is the [p10, p90] of that family's wetness and `base` the send the
// median sits at.
function rollWet(rng: Rng, base: number, db: number[]): number {
  const u = Math.pow(rng.next(), 0.55); // leaning toward the wet end
  return base * Math.pow(10, (db[0] + (db[1] - db[0]) * u) / 20);
}

// --- what a plan is ------------------------------------------------------
//
// The value this file hands back, written down. The engine's `deck.ts` takes
// it as `any` deliberately — a plan belongs to whoever composed it, and what is
// in one is this music's business and not the machine's — so here is where the
// shape is stated, and everything above the dice reads it from here rather than
// describing it a second time.

/** One point of an automation curve, in theme seconds. */
export interface PlanPoint {
  t: number;
  value: number;
}

/** Where an event is and whose layer it is: what `push` is handed beside the note. */
export interface EventMeta {
  /** A selected logical part, independent of the voice performing it. */
  part?: string;
  /** A phrase may reserve its sound from the stage's rotating treatments. */
  treatment?: 'none';
  /** A ringing struck note is not a sustained tone merely because it is long. */
  articulation?: 'struck';
  /** A background texture keeps its musical role even when borrowing a keys voice. */
  role?: 'texture';
  bar: number;
  step?: number;
  /** the layer the **descriptor** declares, asked of the registry and never written here */
  layer: string;
  /** the pitch spelled out for a readout; only an event that carries one has it */
  note?: string;
}

/**
 * One planned event. `p` is the voice's own parameter object — `NoteParams`,
 * which the engine states is open on purpose — and the chain carries it from
 * here to the instrument and reads none of it.
 */
export interface PlanEvent extends EventMeta {
  t: number;
  voice: string;
  p: NoteParams;
}

/** The three curves a plan carries, each a list of points in theme seconds. */
export interface PlanAutomation {
  macroFilter: PlanPoint[];
  melodicGain: PlanPoint[];
  push: PlanPoint[];
  /** the melodic bus's section sweeps (house-v2's `busSweeps`), where any is laid */
  sweep?: BusSweepCurves;
}

/** One bar of the readout: which section, which chord, and what was playing. */
export interface TimelineRow {
  bar: number;
  t: number;
  section: string;
  sectionIndex: number;
  phrase: number;
  chord: string;
  roman: string;
  layers: string[];
}

/** One roll as the ring draws it: what came up, and what a listener would call it. */
export interface DieReadout {
  value: string;
  label: string;
}

/**
 * Every die of this theme, written down, so a listener can see why two seeds
 * differ. An alias and not an interface, because the ring's scoring asks for
 * the dice as a plain table (`PlannedTheme` in `src/style-distance.ts`) and
 * only an alias carries the implicit index signature that makes one.
 */
export type ThemeDice = {
  preset: string;
  density: string;
  tempoFamily: string;
  key: string;
  voicingStyle: string;
  densityDie: DieReadout;
  leadTimbre: string;
  padTimbre: string;
  stabTimbre: string;
  /**
   * Derive-lite's two readouts, and they are **optional on purpose**: a theme
   * the derived state did not move carries neither, so the golden snapshot of
   * the record and of the house is the object it always was. `band` is the
   * family the pulse landed in where that is not the room's own, and `breakMask`
   * the authored break the kit drew where it drew one.
   */
  band?: string;
  breakMask?: string;
  pianoRole: string | null;
  keysPreset: string;
  fxPalette: string;
  bassMask: string;
  stabMask: string;
  hatMask: string;
  loopBars: number;
  progression: string;
};

/**
 * The whole of one theme as data: the seed's record, before a single
 * oscillator exists.
 *
 * Four of its fields are optional and are the four a theme can only have once
 * it is a theme **in a set**: nothing here writes them, `planTheme` in
 * `src/set-plan.ts` writes all four, and a `SetTrack` there is this value with
 * them required. A theme rendered on its own has none of them, which is why
 * they are optional rather than absent, and the golden snapshot never sees them.
 */
export interface Track {
  seed: Seed;
  /** the music this was planned in; a plan is enough to play it */
  style: Style;
  minutes: number;
  bpm: number;
  beat: number;
  barSeconds: number;
  swing: number;
  bars: number;
  duration: number;
  kickPresent: number;
  key: { root: number; name: string; scaleName: string; scale: number[] };
  preset: string;
  presetLabel: string;
  density: string;
  paramOverrides: ParamOverrides;
  dice: ThemeDice;
  /** a mixing decision and not a plan: the interface draws it, the golden file never sees it */
  sound: { wetness: DieReadout };
  progression: Progression;
  arrangement: ReturnType<typeof makeArrangement>;
  timeline: TimelineRow[];
  events: PlanEvent[];
  automation: PlanAutomation;
  /** which theme of the set this is */
  index?: number;
  /** the blend it rolled, in bars */
  blendBars?: number;
  /** `'close'`, `'open'`, or no filter move at all */
  filterMove?: string | null;
  /** how far this theme is from the record's target loudness, in dB */
  trimDb?: number;
  /**
   * **What the spell asked of the voices this theme drew**, by event name —
   * PLAN-MODULATION M1's own field, and it is on the plan for the same reason
   * `trimDb` is: it is a parameter of the program, worked out once per theme at
   * the boundary, and the performance compiler writes it onto the notes.
   *
   * **Absent at the house**, and absent under a strategy that carries no
   * `knobs` switch, which is the record. Not an empty object and not a table of
   * defaults: absent, so the plan the digest hashes is the object it has always
   * hashed.
   */
  knobs?: KnobSettings;
}

/**
 * One bar as a figure source is handed it: the bar's own stream, the layers the
 * section grammar has switched on, the section and the chord it is in, and the
 * answers the loop worked out before asking anybody for a figure.
 */
export interface BarContext {
  bar: number;
  r: Rng;
  layers: Record<string, boolean>;
  section: { startBar: number; kind: string; index: number };
  chord: Chord;
  chordChanged: boolean;
  isFillBar: boolean;
  barStart: number;
  keysSection: boolean;
  padSection: boolean;
  kickThisBar: boolean;
  rhythmPickups?: Map<string, NonNullable<ReturnType<typeof rhythmPickup>>>;
  /** where the percussion development stands this bar, when it plays */
  rhythmPhase?: RhythmPhase | null;
}

/** One figure source: handed the lanes it feeds and the bar, it writes events. */
export type FigureSource = (g: FigureGroup, c: BarContext) => void;

/** What `generate` is asked for: the music, the seed, and whatever a set forces. */
export interface GenerateOptions {
  /** the music being made: every list a die draws from and every number that is not an instrument's */
  style: Style;
  seed?: Seed;
  minutes?: number;
  /** the room by id, or `auto` to let the preset die choose one */
  preset?: string;
  bpm?: number | null;
  root?: number | null;
  scaleName?: string | null;
  bars?: number | null;
  /** the length the arrangement is cut to, mains first, off `bars` (a set's `themeTrim`, S19) */
  fitBars?: number | null;
  /** the mix telling this theme that the one before it was an organ */
  avoidOrgan?: boolean;
  /** the eight birds, where a listener, a bench or a URL asked for any */
  spell?: Partial<Spell> | null;
  /**
   * A tool's hand on the lanes: which voice plays a lane, by lane id, in place
   * of the lane's own draw. It exists so a candidate can be rendered on the
   * record's own figure at the record's own window and measured against the
   * incumbent — `tools/imprint/lane-trim.ts` — and it is on no playing path:
   * nothing the page or a set asks for names one, and absent it is nothing.
   */
  lanes?: Record<string, string> | null;
  /**
   * The same hand, on the harmonic draws: which timbre leads, which holds under
   * it and which strikes over it, in place of the three dice. It is the lane
   * override's twin and it is on no playing path either — nothing the page or a
   * set asks for names one, and absent it is nothing.
   *
   * It exists because a gate that asks *what did the seasoning do* has to hold
   * the cast still: house-v2's widened lists already redraw which instrument
   * plays when a bird moves, which is what `notes/archive/2026-09-v2-day-chain/rounds/derive-lite.md` §5
   * measured, and a file that changed its instruments **and** its tails would
   * answer neither question. `tools/ear.ts --knobs` pins these to the house's
   * own three and the gate asserts the plans then name the same voices.
   */
  timbres?: { leadTimbre?: string; padTimbre?: string; stabTimbre?: string } | null;
  /**
   * **The row a listener, a bench or a URL named**, whose `wants` the
   * interpreter turns into weights on the same lists the bias leans and whose
   * `forbids` is the one hard rule (`src/interpret.ts`). The row's `birds` have
   * already become the `spell` above by the time it arrives here, because a box
   * is rolled once per set and a want is read once per theme.
   *
   * Absent — which is every path the golden takes, and every set with nothing
   * asked of it — the bias is handed through as the identity it always was.
   */
  recipe?: Recipe | null;
  accompaniment?: Accompaniment;
  development?: Development;
  /**
   * **A tool's hand on the theme**: which melody family states it and in which
   * register, in place of the draw. It is the lane override's and the timbre
   * override's twin and it is on no playing path — nothing the page or a set
   * asks for names one, and absent it is nothing.
   *
   * It exists for the same reason those two do: a card that asks *what does a
   * melody family sound like* has to hold everything else still, and a file
   * that changed its family **and** its seed would answer neither question.
   * `tools/ear.ts --recipes` pins it; the gate asserts the plans then differ in
   * the theme and in nothing else.
   */
  motif?: { family?: string; register?: Register; off?: boolean } | null;
}

/**
 * **What the spell derived, where a strategy reads it.**
 *
 * `derive()` has existed since phase 0 and until derive-lite nothing below the
 * bias read a word of it, which is why seven of the eight birds moved a render
 * by one sixteen-bit step. A strategy opens it with the `derived` switch
 * (`src/styles/deep-house-v2.ts`); a style that carries no switches — which is
 * the record, and always will be — gets `null` here and every path below takes
 * exactly the shape it had.
 *
 * The bias already worked it out: `biasFor` puts `derive(spell)` on the value it
 * hands back, and at the house that is the frozen `HOUSE_DERIVED`. So this is a
 * read and not a second call.
 */
const derivedFor = (style: Style, bias: Bias): Derived | null =>
  (switchOn(style, 'derived') ? bias.derived : null);

/** The house's own answers, which are what a style with the switch off keeps. */
const FOUR_FLOOR = 'fourFloor';

// `bpm`, `root` and `scaleName` can be forced from outside, which is how the
// mix engine keeps a whole set tempo-locked and chooses the next key.
//
// The seed is a **string or a number**, and in a set it is always a string:
// `themeSeed(masterSeed, n)` in mix.ts builds one, and `Rng` hashes
// `String(input)` whichever it is given. The default of `1` says number and
// says it wrongly, which is what the type checking round B turned on found
// first; the type below is what the machine has always accepted.
/**
 * `style` is the music being made: every list a die draws from and every number
 * that is not an instrument's. It is required — there is no default, because a
 * default would be this file knowing one style's name — and the plan carries it
 * back out, so everything downstream that has a plan has the style it was
 * planned in without being told twice.
 *
 * `spell` is the eight birds, and it is the one thing above the dice: it
 * becomes a **bias** — a weight on every entry of every candidate list and a
 * multiplier on every continuous range — which the draws below read. Absent, or
 * at the house vector, that bias is the identity and this is the call it always
 * was, bit for bit. See `src/spell.ts`.
 */
/**
 * **The knob tables of the voices a theme actually drew**, by event name.
 *
 * A knob on a voice nothing played is a setting nobody can hear, and a strategy
 * that carries no `knobs` switch — the record, and always — has none at all. It
 * is the cast that decides, so this is the question asked of the events and not
 * of the catalogue.
 *
 * It is a function of its own because it is asked **twice**: once when a theme
 * is planned, and again when a hand moves a bird under a theme that is already
 * playing and the notes not yet handed to the audio clock are seasoned again
 * (`mix.setSpell`). One arithmetic, so what a note is re-given live is what it
 * would have been planned with.
 */
export function tablesOf(style: Style, events: { voice: string }[]): Record<string, Knobs> {
  const out: Record<string, Knobs> = {};
  if (!switchOn(style, 'knobs')) return out;
  for (const ev of events) {
    const k = VOICE_KNOBS[ev.voice];
    if (k && Object.keys(k).length) out[ev.voice] = k;
  }
  return out;
}

/**
 * The same tables, remembered per plan: a face asks this on every frame of a
 * drag and a plan's events are in the thousands. A plan is immutable, so the
 * answer is too.
 */
const TABLES = new WeakMap<object, Record<string, Knobs>>();
export function knobTablesOf(track: Track): Record<string, Knobs> {
  let t = TABLES.get(track);
  if (!t) { t = tablesOf(track.style, track.events); TABLES.set(track, t); }
  return t;
}

/**
 * **A room's tempo, drawn** — the one roll a theme and a set both make, off the
 * style's tempo window and the spell's two range multipliers: a `chance` for
 * which of the style's two families and a `float` inside it, in that order and
 * no other (a theme draws it on its own `tempo` stream, a set on its
 * `mix:tempo`). It was written out twice, in `generate` and in `set-plan.ts`,
 * until round (f) of the reconciled review of 09-24 (D21).
 *
 * The style's names for the two families are older than the numbers in them:
 * `slow` is the *upper* family, 100–105 BPM, and `fast` the lower, 95–100
 * (`styles/deep-house.ts`, Eugene's 95–105 decision), which is why a theme's
 * readout calls a `slow` roll `upper` (R101).
 */
export function rollTempo(
  rng: Rng,
  T: { slowMin: number; slowMax: number; fastMin: number; fastMax: number; slowChance: number },
  RANGE: { tempoSlowChance: number; tempoBpm: number },
): { slow: boolean; bpm: number } {
  const slow = rng.chance(T.slowChance * RANGE.tempoSlowChance);
  const bpmMul = RANGE.tempoBpm;
  const bpm = slow
    ? Math.min(T.slowMax * bpmMul, Math.round(rng.float(T.slowMin * bpmMul, (T.slowMax + 0.99) * bpmMul)))
    : Math.min(T.fastMax * bpmMul, Math.round(rng.float(T.fastMin * bpmMul, (T.fastMax + 0.99) * bpmMul)));
  return { slow, bpm };
}

export function generate(opts: GenerateOptions): Track {
  return compose(opts, false) as Track;
}

/**
 * **Which instrument a theme really leads with**, asked without the rest of
 * the theme: the lead die as `generate` rolls it — the room's own answer, the
 * hold lean at the density drawn, the organ refused where the set says so, and
 * the drone in front's redraw — and nothing after it. It is the set's question
 * for the organ rule (`organTheme`, `src/set-plan.ts`), which read the raw die
 * and so answered for a draw the theme does not make (R37 of the review of
 * 09-24). The same code as `generate` up to that line, so the two cannot part.
 */
export function leadTimbreOfTheme(opts: GenerateOptions): string {
  return compose(opts, true) as string;
}

function compose({ style, seed = 1, minutes = 2, preset = 'auto', bpm: forceBpm = null, root: forceRoot = null, scaleName: forceScale = null, bars: forceBars = null, fitBars = null, avoidOrgan = false, spell = null, lanes = null, timbres = null, recipe = null, accompaniment = 'base', development = 'base', motif: forceMotif = null }: GenerateOptions, leadOnly: boolean): Track | string {
  const requestedForm = developmentOf(style, development);
  if (requestedForm && recipe?.scope === 'track') throw new Error('A complete arrangement retains its own development; extract a part first');
  const request = recipeRequest(recipe, accompaniment);
  if (request.pin && forceMotif) throw new Error('A pinned part and a tool motif override cannot both select the phrase');
  if (request.motif && forceMotif) throw new Error('A recipe motif and a tool motif override cannot both select the phrase');
  if (request.motif && (!switchOn(style, 'motif') || !['bass', 'lead'].includes(request.motif.register))) {
    throw new Error(`Recipe ${recipe!.id}: this style has no enabled ${request.motif.register} motif player`);
  }
  const dice = (tag: string) => new Rng(`${seed}::${tag}`);
  // The bias, worked out once before the first die is rolled. At the house it
  // is every weight 1 and every range 1, which is the identity, and the golden
  // digest is what proves it stays that way.
  // ...and the row's own `wants` folded into it, where a row was named. With no
  // row — every path the golden takes — `interpretWants` hands the same object
  // straight back, so this is the call it has always been, to the bit.
  const wanted = interpretWants(request.track, style, biasFor(spell, style), {
    log: typeof console !== 'undefined' && !leadOnly ? (line: string) => console.log(line) : null,
  });
  const invalidPart = wanted.notes.find(n => ['figures.figure', 'figures.texture', 'ambience', 'presence', 'tone'].includes(n.block) && n.state !== 'applied');
  if (invalidPart) throw new Error(`recipe ${invalidPart.block}: ${invalidPart.say}`);
  const bias = wanted.bias;
  const RANGE = bias.ranges;
  const CAT = style.catalogue;
  const FIG = style.figures;
  const CORPUS = style.corpus;

  // The preset decides the room; the seed decides the record inside it. Its
  // params are resolved into `S` — this plan's own frozen settings value — and
  // stored on the track as `paramOverrides`, so the deck, the player and the
  // renderer resolve the same room again when they come to make the sound.
  //
  // Planning used to *write* to the live table every voice imported and put
  // back what it found at the end, because a plan worked out while a set played
  // would otherwise change rooms under the deck that was sounding — which is
  // how a growl theme's kick arrived on a sub deck. Since round C there is no
  // table to write to: `S` belongs to this call and to nothing else, so a plan
  // is pure by construction rather than by a save and a restore.
  const pre = resolveRoom(style, preset, dice('preset'), bias);
  // The room's own answers, with a tool's hand over them where one is given.
  // Absent — which is every playing path — this is the room's object itself.
  const shape = timbres ? { ...(pre.shape || {}), ...timbres } : pre.shape || {};
  const S = resolveSettings({ base: style.base, room: pre.params });

  // --- the dice ---------------------------------------------------------
  const dTempo = dice('tempo');
  const dKey = dice('key');
  const dVoice = dice('voicing');
  const dPartner = dice('partner');
  const dWet = dice('wet');
  const dPiano = dice('pianorole');
  const dMel = dice('melody');
  const dBass = dice('bass');
  const dStab = dice('stab');
  const dHat = dice('hat');
  const dArr = dice('arrangement');
  const dFx = dice('fx');
  const dDense = dice('density');

  // MEASURED: set 1 sits at 122 BPM, two of three sets run near 103. Fix the
  // tempo for the whole piece — within a track the reference drifts < 0.3 BPM.
  const { slow, bpm: roomBpm } = rollTempo(dTempo, S.tempo, RANGE);
  // What the spell derived, if this strategy reads it. `null` is the record.
  const DERIVED = derivedFor(style, bias);
  const kit = DERIVED ? DERIVED.kit : FOUR_FLOOR;
  // The room drew a tempo out of its own measured window; the derived family
  // says which band of tempi this theme belongs in, and `tempoInFamily` carries
  // the one into the other at the same position. At the house family the two
  // bands are the same pair of numbers and this is `room` to the bit.
  //
  // A set forces the tempo (`forceBpm`), and `src/set-plan.ts` has already
  // mapped it for the whole set before it gets here — one grid for a set is the
  // thing `makeSetClock` exists for, so the mapping happens once, where the set
  // draws, and never twice.
  const bpm = forceBpm || (DERIVED ? tempoInFamily(roomBpm, DERIVED) : roomBpm);
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const swing = S.swing;

  const rootPc = forceRoot == null ? dKey.pickWeighted(CAT.keyRoots, pickerFor(bias, 'keyRoots', CAT.keyRoots.length)) : ((forceRoot % 12) + 12) % 12;
  // MEASURED: minor 80% of the time; the remainder reads as dorian.
  const scaleName = forceScale || (dKey.chance(S.key.minorChance) ? 'minor' : 'dorian');
  const scale = SCALES[scaleName];
  const chordRoot = 48 + rootPc;

  // How much is allowed to happen at once. Most seeds are minimal; a few are
  // busier. This is the die that keeps the record deep house rather than
  // something with a note on every sixteenth.
  const D = S.density;
  // The word is the style's — `catalogue.densities` — and every per-density
  // table below is keyed by it, so it is read as one of their keys.
  const density = (shape.density ||
    dDense.weighted(scaleWeighted(CAT.densities, bias, 'densities'))) as keyof typeof D.bassNotes;
  const maxBassNotes = D.bassNotes[density];
  const maxStabs = D.maxStabs[density];
  const fxEveryBars = D.fxEveryBars[density];

  const voicingStyle = shape.voicingStyle || dVoice.pickWeighted(CAT.voicingStyles, pickerFor(bias, 'voicingStyles', CAT.voicingStyles.length));
  const fx = dFx.pickWeighted(CAT.fxPalettes, pickerFor(bias, 'fxPalettes', CAT.fxPalettes.length));

  // --- who is holding the chord and who is playing the figure -----------
  //
  // One die picks the theme's *lead* family; whether that family leads from
  // the sustained role or the rhythmic one is a property of the family, and a
  // second die fills the other role when two layers play. So a theme can be
  // strings holding under an electric piano, a piano over strings, a piano
  // alone with the drums and the bass, or — most often, under minimalism —
  // one layer and silence where the other would be.
  const TB = S.timbre;
  // A strategy may lean its widened harmonic lists by `hold` under a density
  // it names (`catalogue.holdLean`, house-v2 since the music review of 09-19):
  // a newcomer's weight is scaled by one minus its declared hold, so a voice
  // that is still sounding at the bar line is drawn less often into a sparse
  // room, where the record's own struck voices carried the groove, and a
  // struck one is left almost where rule 2 opened it. The incumbents — the
  // record's own instruments — are never leaned, and a style with no such
  // block, which is the record, hands every list through untouched.
  const lean = holdLeanFor(CAT, density);
  // The draw as the palette has it, and the texture and scene read off it.
  const drawn = { lead: shape.leadTimbre || leadTimbreFor(style, seed, avoidOrgan, bias, lean('leadTimbres')), pad: '', stab: '' };
  const leadSustained = CAT.sustainedLeads.includes(drawn.lead);
  drawn.pad = shape.padTimbre || (leadSustained ? drawn.lead : dPartner.weighted(lean('padPartners')(scaleWeighted(CAT.padPartners, bias, 'padPartners'))));
  drawn.stab = shape.stabTimbre || (leadSustained ? dPartner.weighted(lean('stabPartners')(scaleWeighted(CAT.stabPartners, bias, 'stabPartners'))) : drawn.lead);

  // Explicit recipes retain their interpretation and replay. With no recipe,
  // the style can choose musical parts for these same players. No preview
  // recipe, source chunk, render tool or library lookup participates here.
  // Component assembly is opt-in. Complete arrangements and accepted motif
  // comparisons retain their interpretation; pins reserve their role first.
  const composition = request.pin || ((!recipe || wanted.identity) && !forceMotif && !request.motif)
    ? composeParts(style, seed, bias, density, bpm, request.pin ?? undefined,
      { bedHold: TIMBRES[drawn.pad]?.hold ?? 0, leadHolds: leadSustained }) : null;
  const parts = composition?.parts ?? wanted;
  // **One foreground** (composition.ts): with the drone in front, the lanes
  // and the timbre dice withdraw the real-world class too, each at its pace.
  const sceneAt: SceneContext | null = composition?.trace.scene === 'drone-forward'
    ? { policy: (style as Style & { composition: CompositionPolicy }).composition.scene!, bpm, drumsOn: bias.derived.drumsOn, characters: charactersOf(style) }
    : null;

  // The mined masks, each off a stream of its own, drawn here so the scene can
  // ask a lane's pace before the timbre dice are settled; nothing else reads
  // these streams, so drawing them earlier moves no number.
  const stabTemplate = shape.stabMask ? { m: shape.stabMask, c: 1 } : P.pickStabMask(dStab, CORPUS);
  const hatTemplate = shape.hatMask ? { m: shape.hatMask, c: 1 } : P.pickHatMask(dHat, CORPUS);
  // The sixteenth lane's own figure, where a style gives that lane a table of
  // its own (round K6). Off `<seed>::sixteenth`, a stream nothing else reads, so
  // a style that has no such table draws nothing at all and the record's own
  // streams are where they were.
  const sixteenthTemplate = CAT.sixteenthMasks && CAT.sixteenthMasks.length
    ? P.pickSixteenthMask(dice('sixteenth'), CAT.sixteenthMasks)
    : null;
  const stepSeconds = 15 / bpm;
  /** A mined figure as a pace: its hits' median gap, and how many steps a hit is held. */
  const maskPace = (mask: string | undefined, held: number) =>
    ({ gap: mask ? medianGapSteps(P.maskSteps(mask), mask.length) * stepSeconds : Infinity, ring: held * stepSeconds });
  // The keys lane plays the stab mask, each hit held for the stab's own length
  // (`stabsFromMask`: one, two or four steps, two the median).
  const keysPace = maskPace(stabTemplate.m, 2);
  // The drone lane strikes at most once a chord, and holds it for the bar.
  const padPace = { gap: 16 * stepSeconds, ring: 16 * stepSeconds };
  const strikes = (timbre: string, pace: { gap: number; ring: number }) =>
    !!sceneAt && !!TIMBRES[timbre] && realWorld({ struck: TIMBRES[timbre].struck, pitched: true, hold: TIMBRES[timbre].hold, ...pace }, sceneAt);
  // The timbre dice under the drone in front: a timbre the scene admits is the
  // one drawn; one it withdraws is drawn again off the same stream with the
  // withdrawn candidates at nought — the lead within its own role, so the
  // layer it plays is the layer it played.
  const admitted = (pace: { gap: number; ring: number }, role?: boolean) => <T extends { v: string }>(list: T[]): T[] =>
    list.filter((e) => !strikes(e.v, pace) && (role === undefined || CAT.sustainedLeads.includes(e.v) === role));
  const leadPace = leadSustained ? padPace : keysPace;
  const leadTimbre = shape.leadTimbre || !strikes(drawn.lead, leadPace) ? drawn.lead
    : leadTimbreFor(style, seed, avoidOrgan, bias, (list) => admitted(leadPace, leadSustained)(lean('leadTimbres')(list)));
  if (leadOnly) return leadTimbre;
  const padTimbre = shape.padTimbre ? drawn.pad : leadSustained ? leadTimbre : !strikes(drawn.pad, padPace) ? drawn.pad
    : dice('partner').weighted(admitted(padPace)(lean('padPartners')(scaleWeighted(CAT.padPartners, bias, 'padPartners'))));
  const stabTimbre = shape.stabTimbre ? drawn.stab : !leadSustained ? leadTimbre : !strikes(drawn.stab, keysPace) ? drawn.stab
    : dice('partner').weighted(admitted(keysPace)(lean('stabPartners')(scaleWeighted(CAT.stabPartners, bias, 'stabPartners'))));
  // The lanes that put their candidates to the scene's question, each at its
  // own mined figure's pace; a lane whose figure is not known here is taken at
  // the grid's (no gap at all), so only the tempo band can admit it.
  const lanePace = (lane: Lane) => lane.figure === 'sixteenthMask' ? maskPace(sixteenthTemplate?.m, 0)
    : lane.figure === 'hatMask' ? maskPace(hatTemplate.m, 0) : lane.figure === 'stabMask' ? keysPace : { gap: 0, ring: 0 };
  // A lane's percussion families are hits with no pitch by what the family is;
  // a candidate that declares no facts of its own (the record's shaker) is
  // read as one.
  const laneWithdrawn: LaneWithdrawal | undefined = sceneAt
    ? (lane, voice) => withdrawnFrom(lane, 'drone-forward').has(familyOf(voice))
      && realWorld({ struck: TIMBRES[voice]?.struck ?? true, pitched: TIMBRES[voice]?.family === 'harmonic',
        hold: TIMBRES[voice]?.hold ?? 0, ...lanePace(lane) }, sceneAt)
    : undefined;
  // Which figures the theme's two harmonic timbres bring with them. Every one
  // of these was a comparison against an instrument's name until round F and
  // every one of them is a list in the style now (`figures` there carries the
  // measurement each was written from).
  const padUnderStab = FIG.padUnder.includes(stabTimbre);
  // A timbre that brings a figure of its own rather than playing the stab grid.
  const ownFigure = FIG.ownFigure.includes(stabTimbre);

  // "Strings with various FX levels": MEASURED as the strings family's own
  // spread across its 16 tracks — wetness -5.3 to +0.2 dB and width -5.8 to
  // -1.4 dB — rolled per theme and leaning wet.
  const SG = S.strings;
  const padWet = rollWet(dWet, SG.wetBase, SG.wetDb) * fx.reverb;
  const padDelay = 0.1 * fx.delay;
  const padSpread = Math.min(
    1,
    SG.spread * Math.pow(10, (SG.widthDb[0] + (SG.widthDb[1] - SG.widthDb[0]) * dWet.next() + 4.4) / 20)
  );
  const stabWet =
    rollWet(
      dWet,
      S.keys.wetBase[stabTimbre as keyof typeof S.keys.wetBase] ?? 0.26,
      S.keys.wetDb[stabTimbre as keyof typeof S.keys.wetDb] ?? [-3.5, -1.6]
    ) *
    fx.reverb;
  // A chance per timbre, and a timbre the style gives no row never rolls the
  // die: the `wet` stream's draw count is where it was.
  const tremoloChance = FIG.tremolo[stabTimbre];
  const tremolo = tremoloChance !== undefined && dWet.chance(tremoloChance);

  // The piano's two roles, and its room. Heavy ambient reverberation is the
  // deep house piano; the dry note is quiet and rolled wetter still.
  const PI = S.piano;
  const pianoRole = dPiano.chance(PI.arpChance) ? 'arp' : 'melody';
  const pianoHall = PI.wet[0] + (PI.wet[1] - PI.wet[0]) * Math.pow(dPiano.next(), 0.55);
  const pianoDelay = (PI.delayWet[0] + (PI.delayWet[1] - PI.delayWet[0]) * dPiano.next()) * fx.delay;

  // A development mode is a request about form, and the style says where its
  // form applies (a four-floor kit, today). Outside it — a pulled bird on a
  // shaped link — the theme falls back to the base form and says so in its
  // dice, rather than refusing every theme of the set.
  const refused = !!requestedForm && !permitted(requestedForm.when, bias, density, bpm);
  const form = refused ? null : requestedForm;
  const developed: Development = refused ? 'base' : development;
  const contourPolicy = developed === 'shaped' || developed === 'percussion' ? form!.shape! : null;
  // The percussion development is a request for form; its palette is a part
  // like any other, and a drone in front withdraws it at its pace (the brushed
  // sixteenths and the replies), leaving the shaped contour it rides on.
  const rhythmWithheld = developed === 'percussion' && !!sceneAt
    && asksRealWorld({ rhythm: { [form!.rhythm!.role]: form!.rhythm!.parts.flatMap(p => Object.values(p.cells).flat()) } }, sceneAt);
  const rhythmPolicy = developed === 'percussion' && !rhythmWithheld ? form!.rhythm! : null;
  const characters = charactersOf(style);
  const partOrigin = composition ? `ordinary/${composition.trace.version}` : recipe?.id;
  const partStream = composition ? 'composition' : 'recipe';
  const selectedRecipeFor = (role: string) => composition?.trace.recipes?.find(r=>r.roles.includes(role));
  const originFor = (role: string) => request.pin?.role === role ? request.pin.id : selectedRecipeFor(role)?.id ?? partOrigin;
  const streamFor = (role: string) => request.pin?.role === role ? `pin:${request.pin.id}` : partStream;

  const wantedBars = forceBars
    ? Math.max(16, Math.round(forceBars / 4) * 4)
    : Math.max(16, Math.round((minutes * 60) / barSeconds / 4) * 4);
  // **`drumsOn` false is a gate in the plan and not a filter on the events.**
  // The grammar's own keys for every percussion lane of this style — read off
  // the lane table by role, never by name — are held off phrase by phrase, so
  // the timeline says the layer is not playing, the machine view draws the lane
  // gated for nothing, the figure sources below are never asked for a bar, and
  // the duck at every kick is a list of nought points because there is no kick
  // to lay one at. The sections still turn over: an ambient piece has an intro,
  // a groove, a breakdown and an outro, and what is missing is the grid.
  // The gates this theme holds off: the percussion grid where the spell derived
  // no drums, and whatever a recipe's `forbids` closed. Both are the same
  // machinery — a lane switched off *in the plan*, phrase by phrase — and the
  // union of two empty lists is the empty list, which is the record.
  // ...and a lane the drone in front leaves with nothing to draw is held off
  // the same way: the sixteenth lane under a drone at a mask's pace.
  const silentDerived = [...(DERIVED && !DERIVED.drumsOn ? percussionGates(style.lanes) : []), ...silencedBy(style, bias, laneWithdrawn)];
  const silent = wanted.silent.length
    ? [...new Set([...silentDerived, ...wanted.silent])]
    : silentDerived;
  const progression = makeProgression(dice('prog'), chordRoot, scaleName, S, CORPUS, {
    pedal: parts.pedalHarmony,
    voicingStyle,
    degreeBias: shape.degreeBias,
    loopBars: shape.loopBars,
    changeEvery: shape.changeEvery,
  });

  // The broken kit's own figure, where the spell derived one and the style has
  // a table of it. Off `<seed>::break`, a stream nothing else reads, and drawn
  // only when the kit really is broken — so the record, the house and every
  // four-floor theme consume nothing from it at all.
  const breakRow = kit === 'breaks' && CAT.breakMasks && CAT.breakMasks.length
    ? dice('break').weighted(
        scaleWeighted((CAT.breakMasks as P.BreakRow[]).map((b) => ({ v: b, w: b.c })), bias, 'breakMasks')
      )
    : null;
  /**
   * **What a break leaves the bass** (09-20, the taste rail of
   * `notes/diagrams/landscape.md`: *a break must leave the bass room*). The
   * density budget above is the theme's own and it is what the record walks on;
   * a break's row carries its own, one note for a pedal and two for a pump, and
   * the two meet at the smaller. It is a budget and not a figure: it goes
   * through `thinMask` and `capChanges`, the same two places the density budget
   * already goes through, so a break's bass is the theme's own line with fewer
   * notes in it and never a second line somebody wrote underneath it.
   *
   * With no break it **is** `maxBassNotes`, the same number, so every four-floor
   * theme thins by exactly what it always thinned by.
   */
  const bassBudget = breakRow ? Math.min(maxBassNotes, breakRow.b) : maxBassNotes;

  // A measured preset brings the figures it was measured with; otherwise they
  // are drawn from the corpus.
  // The **draw** is the density budget's, exactly as it was — a break does not
  // change which figure the corpus hands over, only how much of it is played —
  // and the thinning is the break's. At the house the two numbers are one.
  const bassTemplate = P.thinMask(
    shape.bassMask
      ? { m: shape.bassMask, k: shape.bassContour, c: 1 }
      : P.pickBassTemplate(dBass, CORPUS, maxBassNotes),
    bassBudget
  );

  // The piano's melody, if that is the role it drew: one short phrase, and the
  // same phrase with one small change, which is the whole difference between a
  // part and a loop.
  let melody: P.MelodyNote[] | null = null;
  let melodyVaried: P.MelodyNote[] | null = null;
  let melodyBars = 2;
  if (ownFigure && pianoRole === 'melody') {
    melodyBars = dMel.weighted(scaleWeighted(CAT.melodyBars, bias, 'melodyBars'));
    const scalePool: number[] = [];
    for (let m = PI.low; m <= PI.high; m++) {
      if (scale.includes((((m - chordRoot) % 12) + 12) % 12)) scalePool.push(m);
    }
    melody = P.makeMelody(dMel, scalePool, { bars: melodyBars, center: 71 });
    melodyVaried = P.varyMelody(dMel, melody, scalePool);
  }

  /**
   * **The theme, where this strategy has one** (PLAN-MOTIF T1).
   *
   * One draw off `<seed>::motif`, a stream nothing else reads: whether this
   * track has a theme at all, which register states it — the lead or the bass,
   * which is the plan's own open question answered as a die — which family it
   * is, and then the concrete theme rolled inside that family's box. The
   * `returns` is drawn from the box too: how many bars before it comes back.
   *
   * `null` under a style with no `motif` switch, which is the record, and under
   * house-v2 on the themes whose first draw off that stream says no.
   */
  /**
   * How many bars a section may be pad-alone before the figure role opens
   * (`notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1). **0 under a style with no `leadEntry` switch**, which
   * is the record, and 0 is `false` in the comparison below: the rule is
   * arithmetic and not a branch round a feature.
   */
  const LEAD_ENTRY = switchOn(style, 'leadEntry') ? ((CAT as any).leadEntryBars ?? 0) : 0;

  const { MOTIF, ACCOMPANIMENT_BASS } = rollMotifs({ style, CAT, parts, request, recipe, forceMotif, silent,
    wantedSilent: wanted.silent, bias, dice, originFor, streamFor, partOrigin });
  const playedMotifs = [MOTIF, ACCOMPANIMENT_BASS].filter((m): m is PlayedMotif => !!m);
  // Keep an explicit bass phrase's own development. An ordinary supporting
  // bass keeps its cell AND return interval; only its development has a slower
  // clock, aligned to both the declared returns and the style's phrase grid.
  const bassDevelopment = contourPolicy && request.pin?.role !== 'bassline' && request.motif?.register !== 'bass' && !forceMotif
    ? contourPolicy.bass : null;

  const { UPPERS, FIGURE } = rollFigures({ style, parts, forbids: recipe?.forbids || [], silent, dice, streamFor, originFor, characters });
  const UPPER = UPPERS[0] ?? null;
  const TEXTURE = rollTexture({ style, parts, forbids: recipe?.forbids || [], dice, partStream });

  const events: PlanEvent[] = [];
  const upperEvents = new Set<PlanEvent>();
  const phraseParameters = new Map<PlanEvent, NoteParams>();
  const timeline: TimelineRow[] = [];

  const at = (bar: number, step: number) => bar * barSeconds + P.stepToBeats(step, swing) * beat;
  const push = (voice: string, t: number, p: NoteParams, meta: EventMeta) => events.push({ t, voice, p, ...meta });

  // --- the lanes ---------------------------------------------------------
  //
  // **Which parts this music has, and who plays each of them.** Round K6, and
  // Eugene's decision of 09-18: a style declares its own lanes and their number
  // is the style's. Nothing below writes an instrument's name down: a lane is
  // asked who is playing it, and the answer is a draw over the lane's own
  // candidate list off a stream of the lane's own — which is why the record,
  // where every lane has exactly one candidate, does not move.
  //
  // The two harmonic lanes are the exception the registry already answers: they
  // are chosen by *what they play*, so the timbre dice above name a timbre and
  // `voicePlaying` says which instrument makes it (round K5b's seam).
  //
  // **And the one row a theme may rewrite for itself**: where this track has a
  // theme, the lane of the register that states it reads `motif` instead of its
  // mined mask. A lane's figure is data, so this is the table with one word
  // changed and not a branch inside a source — which is what `notes/archive/2026-09-plans/cited/PLAN-MOTIF.md` §4 asks
  // for (*"a lane's figure can be a mask (today) or a motif stated through a
  // grammar; lanes are data since K6, so it is one more figure source"*). Every
  // other lane is the style's own object, untouched.
  const motifRoles: string[] = playedMotifs.map(m => m.register === 'bass' ? 'bassline' : 'figure');
  // A held bass is the same kind of rewrite: the bass lanes read `heldBass`.
  const motifLanes = motifRoles.length || parts.heldBass
    ? style.lanes.map((l) => (motifRoles.includes(l.role) ? { ...l, figure: 'motif' }
      : parts.heldBass && l.role === 'bassline' ? { ...l, figure: 'heldBass' } : l))
    : style.lanes;
  const rhythmMotion = rhythmPolicy ? prepareRhythmDevelopment(style,rhythmPolicy,parts.rhythm,
    [...wanted.rhythm.map(r=>r.lane.role),...(request.pin?[request.pin.role]:[]),
      ...(composition?.trace.recipes?.flatMap(r=>r.roles)??[])],recipe?.forbids??[]) : null;
  const rhythm = rhythmMotion?.lanes ?? parts.rhythm;
  const LANES: readonly Lane[] = withRhythm(UPPER
    ? motifLanes.map(l => l.role === 'figure' ? { ...l, figure: 'recipeFigure' } : l)
    : motifLanes, rhythm);
  const TIMBRE = { leadTimbre, padTimbre, stabTimbre };
  // A tool's override on top of the draw (`lanes` above); absent, the draw.
  const playing: Record<string, string> = {
    ...laneVoices(rhythm.length ? { ...style, lanes: LANES as Lane[] } : style, seed, bias, laneWithdrawn,
      // house-v2's `hatRing` (round S6): an offbeat's grid is an eighth at this tempo
      switchOn(style, 'hatRing') && (style as { ringMs?: Record<string, number> }).ringMs
        ? { gridSeconds: 30 / bpm, ringMs: (style as { ringMs?: Record<string, number> }).ringMs!, roles: ['offbeat'] } : undefined),
    // **Who plays the backbeat when the kit is broken.** PLAN-MAGIC-V2 §6's
    // second line: *a kit whose snare is not the clap*. The list is the
    // strategy's — `catalogue.breaksBackbeatVoices` — and the draw is off a
    // stream of the lane's own with the kit's word on the end of it, so a lane
    // that never reaches it draws exactly the number it always drew. Every
    // other lane keeps the voice it was given: a break is a kick and a snare,
    // and the hats over one are still the hats of whatever room this is.
    ...(breakRow && CAT.breaksBackbeatVoices && CAT.breaksBackbeatVoices.length
      ? Object.fromEntries(
          style.lanes
            .filter((l) => l.role === 'backbeat' && l.voices)
            .map((l) => [
              l.id,
              String(new Rng(`${seed}::lane:${l.id}:breaks`).weighted(
                scaleWeighted([...CAT.breaksBackbeatVoices], bias, 'breaksBackbeatVoices')
              )),
            ])
        )
      : {}),
    ...(lanes || {}),
  };
  /**
   * The level trim a lane's candidate carries, as the gain the event will
   * carry: measured against the lane's incumbent on the same figure
   * (`tools/imprint/lane-trim.ts`) and written on the candidate's own entry. An
   * incumbent carries none, so the record's events carry no `gain` at all and
   * the event is the object it always was.
   */
  //
  // And the level the lane gives it under this theme's scene (`Lane.presence`):
  // a candidate measured to sit in the band a presence names is written that
  // many decibels under its trim. A scene the lane names no presence for, and
  // every lane of the record, add nothing, so those events are unchanged.
  const scene = composition?.trace.scene;
  const trimOf = (lane: Lane, voice: string): Record<string, number> => {
    const e = (lane.voices || []).find((c) => c.v === voice);
    if (!e) return {};
    const db = (Number.isFinite(e.trimDb) ? e.trimDb as number : 0)
      + (lane.presence || []).filter((p) => p.scene === scene && (e.mid ?? 0) >= p.midFrom).reduce((a, p) => a + p.db, 0);
    return db !== 0 ? { gain: dbToGain(db) } : {};
  };
  const sources: FigureGroup[] = sourcesOf(LANES);
  const firstByRole = (role: string) => LANES.find((l) => l.role === role) || null;
  /**
   * Who plays this lane: the voice drawn for it, or the one its timbre names.
   *
   * The second branch reads `gate` and `timbre` as words because it is the
   * branch a lane with no candidate list takes, which is the two harmonic
   * lanes, and those carry both.
   */
  const voiceOf = (lane: Lane): string =>
    UPPER && lane.role === 'figure' ? UPPER.voice : lane.voices ? playing[lane.id] : voicePlaying(lane.gate as string, TIMBRE[lane.timbre as keyof typeof TIMBRE]);
  /** The lane of a group that takes a named slot, and who is playing it. */
  const onSlot = (g: FigureGroup, slot: string | null) => {
    const lane: Lane | undefined = slotOf(g, slot);
    return lane ? { lane, voice: voiceOf(lane) } : null;
  };
  /**
   * Whether a lane's own gate is on this bar. A group is *asked* when any of
   * its lanes' gates is on and its figure is one draw off the bar's stream;
   * each lane of it then *emits* under its own gate, after the draw. Until
   * 09-20 the group was asked under its first lane's gate and every lane
   * emitted under it: a second lane on a figure with a gate of its own played
   * whenever the first lane's gate was on and never when only its own was
   * (the outside review of 09-19, §1 of its composition review — a clap lane
   * on and a snare lane off wrote 70 claps and 70 snares). No plan of the
   * record moves under either half: every group of both shipped strategies is
   * one lane, or the hat mask, whose open and sixteenth slots already read
   * their own gates, and MEASURED over the fourteen golden themes and seeds
   * 1-199 of both strategies there is no bar where the closed hats are off
   * and either of the others on.
   */
  const laneOn = (lane: Lane, layers: Record<string, boolean | undefined>): boolean =>
    !lane.gate || !!layers[lane.gate];
  const { continuity, shaped, arrangement, bars, support } = planForm({ style, LANES, silent, laneOn, form, contourPolicy,
    figureSelected: !!UPPER || playedMotifs.some(m => m.register !== 'bass'), figureSustained: UPPER?.articulation === 'sustained',
    padUnderFigure: !UPPER && padUnderStab, leadSustained, bothChance: D.bothHarmonicChance[density], leadAloneChance: TB.leadAlone,
    parts, pinned: request.pin, composition, wantedBars, fitBars, dArr, CORPUS, sectionBars: RANGE.sectionBars, dice });
  // The three gates the timeline's own readout asks about by name, taken off
  // the lane table instead: which layer the kick is, which the figure and which
  // the drone. A style with no lane in one of those roles simply has no such
  // filter, rather than filtering on a word it does not use.
  const kickGate = (firstByRole('kick') || ({} as Partial<Lane>)).gate;
  const figureGate = (firstByRole('figure') || ({} as Partial<Lane>)).gate;
  const droneGate = (firstByRole('sustained') || ({} as Partial<Lane>)).gate;
  const bassGate = (firstByRole('bassline') || ({} as Partial<Lane>)).gate;
  const openingSound = switchOn(style, 'openingSound');
  // The theme's first phrase switches nothing on (a bar of the first section
  // before its second phrase starts, with every gate off).
  const openingEmpty = (section: Section, bar: number, layers: Record<string, boolean>) =>
    (section.phrases.length < 2 || bar < section.phrases[1].startBar) && !Object.values(layers).some(Boolean);
  const openingLayer = (section: Section): string =>
    (droneGate && section.phrases.some((p) => p.layers[droneGate]) ? droneGate
      : bassGate && section.phrases.some((p) => p.layers[bassGate]) ? bassGate : (droneGate ?? bassGate)) as string;
  // Where a phrase begins and ends: on the set's eight-bar line for the record,
  // and from each section's first bar under house-v2's `sectionPhrases` where
  // the theme has a grid (R16 of the review of 09-24, question 4). Every device
  // below that counts phrases asks this and nothing else.
  const phraseAt = phraseGrid(arrangement, switchOn(style, 'sectionPhrases'), kickGate as string | undefined);

  // Phrase-level variation, memoised so a bar and its neighbour share the same
  // music and the change happens where the rule says it does.
  const phraseBass = new Map<string, P.BassChange[]>();
  const phraseStabs = new Map<string, P.Stab[]>();

  function bassForBar(bar: number, chordChanged: boolean): P.BassChange[] {
    const base = P.bassChanges(bassTemplate, { chordChanged });
    const ph = phraseAt(bar);
    const phrase = ph.n;
    const half = Math.floor((bar - ph.start) / 4);
    if (phrase === 0 && half === 0) return base;
    const key = `${phrase}:${half}:${chordChanged ? 1 : 0}`;
    if (!phraseBass.has(key)) {
      const r = new Rng(`${seed}::bassvar:${phrase}:${half}`);
      phraseBass.set(key, P.varyBass(r, base, half === 0 ? 'big' : 'small'));
    }
    return phraseBass.get(key)!;
  }

  function stabsForBar(bar: number): P.Stab[] {
    const ph = phraseAt(bar);
    const phrase = ph.n;
    const half = Math.floor((bar - ph.start) / 4);
    const key = `${phrase}:${half}`;
    if (!phraseStabs.has(key)) {
      const base = P.stabsFromMask(new Rng(`${seed}::stabgen`), stabTemplate);
      phraseStabs.set(
        key,
        phrase === 0 && half === 0 ? base : P.varyStabs(new Rng(`${seed}::stabvar:${key}`), base)
      );
    }
    return phraseStabs.get(key)!;
  }

  // MEASURED: 2-5 bar kick dropouts are far more common than real breakdowns
  // and are what keeps a four-on-the-floor groove from feeling mechanical.
  //
  // The dropout sits on the global eight-bar line and a section may begin four
  // bars into one, so a dropout could take a section's first bar — a drop's
  // downbeat among them (R16 of the review of 09-24). A strategy with the
  // `sectionEdges` switch keeps a dropout inside the section it began in: the
  // bars from the next section's first bar on keep their kick. The dice are
  // the same dice, so nothing but those bars moves.
  const edges = switchOn(style, 'sectionEdges');
  //
  // Counted from each section's start (`sectionPhrases`), a dropout is the end
  // of a phrase of its own section: every phrase but the theme's first draws
  // one, keyed by the phrase's number so a phrase on the set's line draws the
  // dice it always drew, and no dropout takes more than half its phrase — two
  // to four bars of eight, as measured, and at most two of a four-bar one.
  const kickOut = new Set<number>();
  const dropouts: Array<{ n: number; end: number; room: number }> = [];
  if (phraseAt === setGrid) {
    for (let phrase = 1; phrase < Math.floor(bars / 8); phrase++) dropouts.push({ n: phrase, end: phrase * 8 + 8, room: 8 });
  } else {
    for (const s of arrangement.sections) for (const p of s.phrases) {
      if (p.startBar === 0) continue;
      const ph = phraseAt(p.startBar);
      dropouts.push({ n: ph.n, end: ph.end, room: ph.end - ph.start });
    }
  }
  for (const { n, end, room } of dropouts) {
    const r = new Rng(`${seed}::drop:${n}`);
    if (!r.chance(S.groove.kickDropoutChance)) continue;
    const len = Math.min(r.int(2, 5), room / 2);
    const start = end - len;
    for (let b = start; b < start + len; b++) {
      if (edges && layersAtBar(arrangement, b).section.startBar >= start) break;
      const anchored = contourPolicy && !continuity!.sustained && contourPolicy.restAnchorRoles.includes('kick')
        && layersAtBar(arrangement, b).section.kind === contourPolicy.restKind;
      if (!anchored) kickOut.add(b);
    }
  }

  // The harmonic loop's length, which a chord's identity and a held note's
  // reach are both counted in.
  const loopBars = progression.loopBars || 8;
  let lastBassMidi: number | null = null;
  const lastRecipeBassNote = new Map<Lane, PlanEvent>();
  let lastChordKey: string | null = null;
  let kickBars = 0;
  /**
   * **How many bars since the figure last sounded**, which is what the
   * lead-entry rule counts. Not bars since the section began: a pad-alone
   * section that ends and is followed by another pad-alone section is
   * thirty-two bars of one chord loop to a listener, whatever the plan calls
   * the boundary, and counting per section let exactly that through — 38 themes
   * of 200 kept a run past the floor, the longest of them 36 bars.
   */
  let sinceFigure = 0;

  // --- the figure sources ------------------------------------------------
  //
  // One function per word a lane's `figure` may be, and the whole of what
  // changed in this file: **a source writes to a lane and asks who is playing
  // it**, where before it wrote an instrument's name. Each is handed the group
  // of lanes it feeds and the bar's own context, and each is called once a bar
  // however many lanes it feeds — the hat mask decides the offbeats, whichever
  // of them opens and what falls between them in one pass over one mask, and
  // three calls where there was one would be three draws off one stream.
  //
  // The order they are called in is the **lane table's** order, which is the
  // order the bar's stream is consumed in and the order two events at the same
  // instant come out in. That is why the table is a list and not a set.


  const rhythmPerformer: RhythmPerformer = { seed, S, rhythm, rhythmMotion, rhythmPolicy, contourPolicy, trace: shaped?.trace ?? null,
    arrangement, silent, at, beat, barSeconds, laneOn, voiceOf, trimOf, push, characters, pinned: request.pin, selectedRecipeFor };
  const motifPerformer: MotifPerformer = { seed, S, progression, bassDevelopment, parts, arrangement, bars, beat, barSeconds,
    at, laneOn, voiceOf, push, bassChanges, ownFigure, pianoHall, pianoDelay, stabTimbre, tremolo, fx, stabWet };
  const heldBassUntil = new Map<Lane, number>();
  const FIGURES: Record<string, FigureSource | null> = {
    recipeFigure: recipeFigureSource({ seed, UPPERS, FIGURE, streamFor, progression, at, beat, push,
      pinned: request.pin, events, upperEvents, phraseParameters, characters }),
    // A requested part replaces its role's mask, keeping its gate and palette.    // A requested part replaces its role's mask, keeping its gate and palette.
    // Separate random streams leave unrelated instruments' variation alone.
    recipeRhythm: recipeRhythmSource(rhythmPerformer),
    // MEASURED: four on the floor, all four slots within 1% of each other.    // MEASURED: four on the floor, all four slots within 1% of each other.
    kick(g, c) {
      if (!c.kickThisBar) return;
      // The break's own steps where the spell derived a broken kit, and four on
      // the floor where it did not. The fill belongs to the four-floor: a break
      // already says where its own extra kick goes, and a fourteenth-step fill
      // on top of one is two figures arguing.
      const originalHits = breakRow
        ? P.breakHits(c.r, breakRow.m, { ghost: 0.55, wobble: 0.01 })
        : P.kickPattern(c.r, { fill: c.isFillBar, sparse: false });
      const hits = kickPickupHits(rhythmPerformer, c) ?? originalHits;
      // Every lane of the group and not the first of them: a figure is one
      // decision and how many instruments take it is the style's. The record
      // has one kick lane, so this is one pass; a style that layers two plays
      // the same four on the floor on both, off one draw.
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) for (const h of hits) {
        const voice = voiceOf(lane);
        push(
          voice,
          at(c.bar, h.step),
          // `startHzSlow` is not in the table and never has been, in the base
          // or in either measured room, so on a slow theme this writes
          // `startHz: undefined` and kick.ts falls back to `K.startHz` — which
          // is the pitch every theme actually plays. Typing the settings in
          // round C is what turned that up; it is left exactly as it stands,
          // because changing it changes the record, and it is written down in
          // notes/TODO.md for Eugene's ear rather than fixed inside a
          // structural round. The bracket is what says "this key is not in the
          // shape and the miss is the point", and the cast is what lets the
          // checker keep saying so rather than refusing the line.
          {
            vel: h.vel,
            startHz: slow
              ? (S.kick as Record<string, number | undefined>)['startHzSlow']
              : S.kick.startHz,
          },
          { bar: c.bar, step: h.step, layer: layerOf(voice) }
        );
      }
    },

    // One mined hat mask, read for up to three lanes: the offbeat eighths,
    // whichever of them opens, and — where a style puts its sixteenth lane on
    // this source, which the record does and house-v2 does not — everything
    // between them.
    hatMask(g, c) {
      const open = onSlot(g, 'open');
      const six = onSlot(g, 'sixteenth');
      const hits = P.hatPattern(c.r, hatTemplate, {
        openHat: !!(open && c.layers[open.lane.gate as string]) && c.r.chance(S.groove.openHatChance + (c.isFillBar ? 0.3 : 0)),
        sixteenths:
          !!six &&
          !!c.layers[six.lane.gate as string] &&
          shape.sixteenths !== false &&
          (shape.sixteenths === true || D.sixteenthHats[density]),
        corpus: CORPUS,
        settings: S,
      });
      for (const h of hits) {
        const on = onSlot(g, h.slot);
        if (!on || !laneOn(on.lane, c.layers)) continue;
        // MEASURED: hats sit 5-10 ms ahead of the grid.
        const t = Math.max(0, at(c.bar, h.step) - S.hatNudge);
        push(
          on.voice,
          t,
          {
            vel: h.vel,
            pan: c.r.float(-S.space.hatPan, S.space.hatPan),
            haas: c.r.float(0.002, S.space.hatHaas),
            ...trimOf(on.lane, on.voice),
          },
          { bar: c.bar, step: h.step, layer: layerOf(on.voice) }
        );
      }
    },

    // A lane with a figure of its own, off a table of its own. Round K6: the
    // hat mask says where the *hats* are, and a sixteenth lane taking whatever
    // it leaves over is a lane that is silent whenever the mined figure happens
    // to be all offbeats — which is most of them. `catalogue.sixteenthMasks` is
    // what the reference sets put between the offbeats, over the whole mined
    // table instead of over the one mask the hats drew, and the draw is off
    // `<seed>::sixteenth`, a stream of its own.
    sixteenthMask(g, c) {
      if (!sixteenthTemplate) return;
      // **Off under a broken kit** (09-20). The sixteenth lane's part is the
      // air between the offbeats and it is written for a kick on all four; over
      // a break the kick is already speaking in sixteenths, and a shaker
      // filling in behind it is the difference between a figure and a mess.
      // Eugene on the two cards this plays: "too complex and hardly
      // listenable", "no musical value in this particular clip". It returns
      // before the draw, so a broken theme consumes nothing from the bar's
      // stream here; no four-floor theme reaches this line at all.
      if (breakRow) return;
      if (shape.sixteenths === false) return;
      if (shape.sixteenths !== true && !D.sixteenthHats[density]) return;
      const hits = P.sixteenthPattern(c.r, sixteenthTemplate, { settings: S });
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) for (const h of hits) {
        const voice = voiceOf(lane);
        const t = Math.max(0, at(c.bar, h.step) - S.hatNudge);
        push(
          voice,
          t,
          {
            vel: h.vel,
            pan: c.r.float(-S.space.hatPan, S.space.hatPan),
            haas: c.r.float(0.002, S.space.hatHaas),
            ...trimOf(lane, voice),
          },
          { bar: c.bar, step: h.step, layer: layerOf(voice) }
        );
      }
    },

    // MEASURED: two and four, soft — only 1.13x the downbeat energy.
    //
    // Under a broken kit it is the break's own snare instead, ghosts and all,
    // and `clap.on` does not hold it: that number is a measured property of one
    // deep house room's *clap* — the sub room plays none — and it has nothing
    // to say about whether a break has a snare in it. A break without one is a
    // four on the floor with the kick moved.
    backbeat(g, c) {
      if (!breakRow && !S.clap.on) return;
      const hits = breakRow
        ? P.breakHits(c.r, breakRow.s, { ghost: 0.45, wobble: 0.04 })
        : P.clapPattern(c.r, { ghost: true, settings: S });
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) for (const h of hits) {
        const voice = voiceOf(lane);
        push(voice, at(c.bar, h.step), { vel: h.vel, ...trimOf(lane, voice) }, { bar: c.bar, step: h.step, layer: layerOf(voice) });
      }
    },

    // A sustained line: each change is held until the next, across the bar
    // line, so the level between kicks never reaches zero.
    bassMask(g, c) {
      const changes = P.capChanges(
        bassForBar(c.bar, c.chordChanged),
        bassBudget + (c.chordChanged ? 1 : 0)
      );
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) bassChanges(lane, c, changes);
    },

    // The rhythmic / melodic lane: the mined stab grid, or the figure the
    // timbre brings with it. One call per lane of the group, because how many
    // instruments take a figure is the style's decision and not this file's.
    stabMask(g, c) {
      if (!c.keysSection) return;
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) stabLane(lane, c);
    },

    // The drone: the voicing, held, when the chord changes.
    chord(g, c) {
      const entering = continuity && c.padSection && !timeline[c.bar-1]?.layers.includes(droneGate!);
      if (!c.padSection || (!c.chordChanged && !entering)) return;
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) droneLane(lane, c);
    },

    /**
     * **The theme, stated and developed** (PLAN-MOTIF T1). The figure source a
     * lane reads when this track has a theme and this is the register that
     * states it — the lead lane or the bass lane, by the theme's own die.
     *
     * What happens in a bar is three questions and no more:
     *
     *   **does this section state it at all?** `placementOf` is the grammar's
     *   table — stated in the groove, fragmented in the build, whole in the
     *   drop, absent in the breakdown so the return is an event, echoed in the
     *   outro — and an absent one writes nothing.
     *   **is this bar inside a statement?** The theme comes back every
     *   `returns` bars, which is drawn out of the family's own box, and it
     *   occupies the first bars of each return for as long as its cell is.
     *   **which move?** One draw per return, off a stream of its own, over the
     *   weights the section allows. A sequence is handed the step from this
     *   chord's own degree to the next one's, which is what makes it land on
     *   the next chord rather than near it.
     */
    motif(g, c) {
      for (const motif of playedMotifs) {
        const role = motif.register === 'bass' ? 'bassline' : 'figure';
        const lanes = g.lanes.filter(l => l.role === role);
        if (lanes.length) {
          const from = events.length;
          performMotif(motifPerformer, motif, { ...g, lanes }, c);
          if (request.pin?.role === role) for (let i = from; i < events.length; i++) events[i].part = request.pin.id;
        }
      }
    },

    // A held bass: the chord root sustained until the chord, the harmonic loop
    // or the lane's gate changes. The bass lanes read this figure instead of
    // their mask when a request asks for a held line (`wants.figures.bassline`
    // with `articulation: 'held'`); it is vocabulary for recipes, and nothing
    // ordinary draws it.
    heldBass(g, c) {
      for (const lane of g.lanes.filter(l => laneOn(l, c.layers))) {
        if (c.bar < (heldBassUntil.get(lane) ?? -1)) continue;
        let end = c.bar + 1;
        const loop = Math.floor(c.bar / loopBars);
        while (end < bars && chordAtBar(progression, end) === c.chord
          && Math.floor(end / loopBars) === loop
          && laneOn(lane, layersAtBar(arrangement, end).layers)) end++;
        bassChanges(lane, c, [{ step: 0, interval: 0 }], null, (end - c.bar) * barSeconds);
        heldBassUntil.set(lane, end);
      }
    },

    // The section glue does not fire bar by bar: it fires at a boundary, and
    // it is written after the loop below, where the sections are.
    glue: null,
  };

  /**
   * **One bar of a bass line, whichever figure wrote it.** The mined mask
   * writes the changes and so does the theme, and what happens to them here —
   * the hold across to the next change, the low trim, the legato slide into a
   * neighbour — is the same in both cases and is written once.
   *
   * `accent` is the theme's own shape where there is one: an accent multiplies
   * the velocity the line already had rather than replacing it, so a motif is
   * played by the bass and is not a second bass underneath it.
   */
  function bassChanges(lane: Lane, c: BarContext, changes: P.BassChange[], accent: number[] | null = null, heldSeconds: number | null = null, phrase?: { midis: number[]; seconds: number[] }) {
    const voice = voiceOf(lane);
    changes.forEach((ch, i) => {
      const nextStep = i + 1 < changes.length ? changes[i + 1].step : 16 + (changes[0]?.step ?? 0);
      const dur = phrase?.seconds[i] ?? heldSeconds ?? Math.max(0.09, ((nextStep - ch.step) / 4) * beat);
      const midi = phrase?.midis[i] ?? P.bassNote(c.chord, ch, S);
      const previous = phrase ? lastRecipeBassNote.get(lane) : undefined;
      const previousMidi = phrase ? previous?.p.midi ?? null : lastBassMidi;
      const time = at(c.bar, ch.step);
      const near = previousMidi != null && Math.abs(midi - previousMidi) <= 12
        && (!phrase || !!previous && time <= previous.t + Number(previous.p.dur) + 1e-6);
      if (previous && previous.t + Number(previous.p.dur) > time) {
        // A developed cell may restart before the preceding cell's last
        // nominal duration ends. End it at the actual next note, once known.
        previous.p.dur = Math.max(0.01, time - previous.t);
      }
      push(
        voice,
        at(c.bar, ch.step),
        {
          midi,
          dur,
          vel: (ch.step === 0 ? 0.95 : 0.88) * P.bassLowTrim(midi, S) * (accent ? accent[i] ?? 1 : 1),
          // Legato: the line is one instrument, so every change inside it
          // slides rather than restarting.
          slideFrom: near && midi !== previousMidi ? previousMidi : undefined,
        },
        { bar: c.bar, step: ch.step, layer: layerOf(voice), note: noteName(midi),
          ...(request.pin?.role === 'bassline' ? { part: request.pin.id } : {}) }
      );
      lastBassMidi = midi;
      if (phrase) lastRecipeBassNote.set(lane, events[events.length - 1]);
    });
  }

  /**
   * One figure lane's bar.
   *
   * **Which instrument, asked of the registry** — in the record this is always
   * `keys` or `piano`, because every timbre house-v1 can draw is one of those
   * two's own or one they stand in front of as a legacy alias; in a widened
   * catalogue it is whichever voice makes the timbre that was drawn, and the
   * layer, the bus and the level come off the same descriptor, so nothing else
   * in the chain has to be told.
   */
  function stabLane(lane: Lane, c: BarContext) {
    const voice = voiceOf(lane);
    if (ownFigure) {
      if (pianoRole === 'arp') {
        // (a) The minimal arpeggio: chord tones with the ninth, one at a time,
        // and — this is most of what makes it deep house — not every bar.
        const ph = phraseAt(c.bar);
        const opens = c.bar === ph.start || new Rng(`${seed}::arpbar:${c.bar}`).chance(PI.arpBarChance);
        if (!opens) return;
        const contour = new Rng(`${seed}::arpphrase:${ph.n}`).pickWeighted(P.ARP_CONTOURS)!;
        const pool = P.pianoPool(c.chord, progression, PI.low, PI.high);
        const figure = P.pianoArp(new Rng(`${seed}::arp:${c.bar}`), pool, {
          maxNotes: Math.min(4, maxStabs + 1),
          contour,
        });
        for (const n of figure) {
          push(
            voice,
            at(c.bar, n.step),
            { midi: n.midi, dur: beat * 1.5, vel: n.vel, hall: pianoHall, delay: pianoDelay },
            { bar: c.bar, step: n.step, layer: layerOf(voice), note: noteName(n.midi) }
          );
        }
        return;
      }
      if (!melody) return;
      // (b) The simple melody: it enters after a section's first phrase, and in
      // a breakdown it either plays alone or rests — a melody and a pad both
      // filling a breakdown is two things saying the same thing.
      const inSection = c.bar - c.section.startBar;
      const play = c.section.kind === 'breakdown' ? !c.padSection : inSection >= 8;
      if (!play) return;
      // `melodyVaried!`: the phrase and its one small change are written
      // together in the one block above, so a theme with a melody has both.
      const inBar = c.bar - phraseAt(c.bar).start;
      const phrase = inBar >= 4 ? melodyVaried! : melody;
      const inPhrase = inBar % melodyBars;
      for (const n of phrase) {
        if (n.bar !== inPhrase) continue;
        // A strong position belongs to the chord.
        const midi = n.strong ? P.snapToChord(n.midi, c.chord) : n.midi;
        push(
          voice,
          at(c.bar, n.step),
          { midi, dur: beat, vel: n.vel, hall: pianoHall, delay: pianoDelay },
          { bar: c.bar, step: n.step, layer: layerOf(voice), note: noteName(midi) }
        );
      }
      return;
    }
    for (const st of stabsForBar(c.bar).slice(0, maxStabs)) {
      if (!c.r.chance(S.groove.stabChance + 0.3)) continue;
      const voicing = st.top ? c.chord.voicing.slice(-3) : c.chord.voicing;
      const dur = Math.max(0.12, (shape.stabLen ?? st.len) * 0.25 * beat);
      voicing.forEach((midi, i) => {
        push(
          voice,
          at(c.bar, st.step) + i * st.spread,
          {
            midi,
            dur,
            vel: st.vel * (1 - i * 0.05),
            preset: stabTimbre,
            tremolo,
            delay: 0.28 * fx.delay,
            reverb: stabWet,
          },
          { bar: c.bar, step: st.step, layer: layerOf(voice), note: noteName(midi) }
        );
      });
    }
  }

  /** One drone lane's chord: the voicing, folded into the register, held. */
  function droneLane(lane: Lane, c: BarContext) {
    const voice = voiceOf(lane);
    const available = support ? support.until[c.bar] * beat - c.barStart : Infinity;
    const release = Math.min(1.6, c.chord.bars * barSeconds * .8);
    const dur = Math.min(c.chord.bars * barSeconds, available - release);
    if (dur <= 0) return;
    const notes = c.chord.voicing.map((m) => foldTo(m, S.register.padLow, S.register.padHigh));
    // A bottom octave when the voicing has floated up out of the register.
    // MEASURED: the references carry -9.5 dB in 120-250 Hz and a chord sitting
    // entirely above middle C leaves that band to the kick alone, which is what
    // makes a mix sound like a bass and a treble with a hole between them.
    const lowest = Math.min(...notes);
    if (lowest > S.register.padOctaveBelow) notes.unshift(lowest - 12);
    notes.forEach((midi, i) => {
      push(
        voice,
        c.barStart,
        {
          midi,
          dur,
          vel: 0.75 - i * 0.04,
          timbre: padTimbre,
          // Only the rare "swell" family really swells; everything else attacks
          // in a few tens of milliseconds and holds. Which is which is
          // `figures.slowAttack` in the style, with the measurement.
          attack: FIG.slowAttack.includes(padTimbre) ? Math.min(SG.swellAttack + i * 0.09, dur * 0.45) : undefined,
          release: Math.min(release, dur * 0.8),
          spread: padSpread,
          reverb: padWet,
          delay: padDelay,
        },
        { bar: c.bar, step: 0, layer: layerOf(voice), note: noteName(midi) }
      );
    });
  }

  for (let bar = 0; bar < bars; bar++) {
    const { section, layers: sectionLayers } = layersAtBar(arrangement, bar);
    // **A theme never opens silent** (house-v2's `openingSound`, round S13): a
    // first phrase of the theme whose grammar switches nothing on takes the
    // section's own held layer — the drone where any phrase of the section
    // plays it, else the bass — so the first bar sounds.
    const originalLayers = openingSound && section.index === 0 && openingEmpty(section, bar, sectionLayers)
      ? { ...sectionLayers, [openingLayer(section)]: true } : sectionLayers;
    const { phase, rhythmPickups, layers } = rhythmGates(rhythmPerformer, bar, originalLayers);
    const chord = chordAtBar(progression, bar);
    const r = new Rng(`${seed}::bar:${bar}`);
    // The fill is a phrase's last bar, so under `sectionPhrases` it is the bar
    // before every section line and not four bars short of one.
    const isFillBar = bar === phraseAt(bar).end - 1;
    const barStart = bar * barSeconds;
    const chordKey = `${Math.floor(bar / loopBars)}:${progression.chords.indexOf(chord)}`;
    const chordChanged = chordKey !== lastChordKey;
    // One harmonic layer at a time, most of the time, and which one it is
    // changes from section to section so the texture still moves.
    const hr = new Rng(`${seed}::harm:${section.index}`);
    // MEASURED: 40% of tracks run two harmonic layers, so it is 60/40 rather
    // than the 90/10 a strict reading of "minimal" would give — and a pluck
    // always gets its pad.
    const both = padUnderStab || hr.chance(D.bothHarmonicChance[density]);
    // When only one of them plays, it is usually the lead family's own role.
    const leadWins = hr.chance(TB.leadAlone);
    // **The lead-entry rule** (`notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1): a section that has been
    // pad-alone for this many bars opens the figure role for the rest of
    // itself. No new die and no re-roll — the draw that was made is kept and a
    // floor is put under it, so a section that already plays both is untouched
    // and a section shorter than the floor is the section it always was.
    const rolledKeys = continuity?.figure ?? (both || (leadSustained ? !leadWins : leadWins));
    const rolledPad = continuity?.sustained ?? (both || !rolledKeys);
    // Only a **pad-alone** section gains anything, which is the rule as
    // `notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` writes it — *"force `keysSection` true for the second 16
    // bars of any 32 in which the rhythmic role has not sounded"* — so a
    // section that already plays both is untouched, a lead-alone section is
    // untouched, and the pad never goes away: it keeps playing and the figure
    // joins it.
    const lateEnough = LEAD_ENTRY > 0 && sinceFigure >= LEAD_ENTRY && rolledPad && !rolledKeys;
    // **The roll respects the section** (`openingSound`, round S13): where the
    // grammar allows only one of the two harmonic layers, that one plays. The
    // roll's two draws above are made as they always were, so every stream
    // after them is where it was; only which layer sounds is corrected, and
    // only where the roll picked the one the section does not allow.
    const figureOnly = openingSound && !!layers[figureGate as string] && !layers[droneGate as string];
    const droneOnly = openingSound && !!layers[droneGate as string] && !layers[figureGate as string];
    const keysSection = !!UPPER || rolledKeys || lateEnough || figureOnly;
    const padSection = (rolledPad || droneOnly) && !(support?.reserved[bar])
      && (!support || support.until[bar] > bar * 4);
    const kickParts = rhythm.filter(r=>r.lane.role==='kick');
    const kickThisBar = !!layers[kickGate as string] && (kickParts.length
      ? kickParts.some(({part})=>part.steps.some(s=>Math.floor(s/16)===bar%part.bars)) : !kickOut.has(bar));
    if (kickThisBar) kickBars++;

    timeline.push({
      bar,
      t: barStart,
      section: section.label,
      sectionIndex: section.index,
      phrase: Math.floor(bar / 8),
      chord: chord.label,
      roman: chord.roman,
      layers: Object.keys(layers)
        .filter((k) => layers[k])
        .filter((k) => k !== kickGate || kickThisBar)
        .filter((k) => k !== figureGate || keysSection)
        .filter((k) => k !== droneGate || padSection),
    });

    // Every lane of this style, by the source that feeds it, in the table's
    // own order. A group none of whose gates the section grammar has switched
    // on is not asked for a figure at all, which is the shape the six
    // hand-written blocks had and is why the bar's own stream is consumed in
    // the same order and to the same depth; a lane whose own gate is off emits
    // nothing from the draw (`laneOn`).
    for (const g of sources) {
      const f = FIGURES[g.figure];
      if (!f) continue;
      if (!g.lanes.some((l) => laneOn(l, layers))) continue;
      f(g, { bar, r, layers, section, chord, chordChanged, isFillBar, barStart, keysSection, padSection, kickThisBar, rhythmPickups, rhythmPhase: phase });
    }

    lastChordKey = chordKey;
    // The rule's own counter, read at the top of the next bar. A bar whose
    // grammar has the figure lane off counts as a bar without it, which is what
    // a listener hears.
    // **Since the figure's last *drawn* bar and not its last sounding one.**
    // Reading the forced value here made the rule fire, reset its own counter
    // and go out again: the figure blinked on for one bar in every seventeen
    // instead of entering and staying, which is 1 of 16 bars where the plan
    // says 12. The draw is what the counter is about — *how long has it been
    // since the dice put a figure here* — and the rule's own answer must not
    // count as one.
    sinceFigure = layers[figureGate as string] && rolledKeys ? 0 : sinceFigure + 1;
  }

  // --- section FX --------------------------------------------------------
  let lastFxBar = -999;
  const fxAllowed = (bar: number) => {
    if (bar - lastFxBar < fxEveryBars) return false;
    lastFxBar = bar;
    return true;
  };
  // The four glue lanes, each of them a moment rather than a spelling: the
  // boundary, the swell that arrives on it, the fall out of a section and the
  // rise into one. They are lanes the section grammar does not gate bar by bar,
  // which is what `gate: null` says, and each of them is asked who is playing
  // it exactly as every other lane is.
  const glue = sources.find((g) => g.figure === 'glue');
  const onGlue = (slot: string) => (glue ? onSlot(glue, slot) : null);
  const stroke = onGlue('impact');
  const swell = onGlue('swell');
  const fall = onGlue('sweep');
  const rise = onGlue('riser');
  if (switchOn(style, 'leadIns')) leadIns();
  else for (const s of arrangement.sections) {
    const startT = s.startBar * barSeconds;
    const endT = (s.startBar + s.bars) * barSeconds;
    const r = new Rng(`${seed}::fxsec:${s.index}`);
    if (stroke && s.impactFirst && fx.impact && s.startBar > 0 && fxAllowed(s.startBar)) {
      push(stroke.voice, startT, { gain: 0.65 }, { bar: s.startBar, layer: layerOf(stroke.voice) });
      // The swell is an *anticipatory* effect: `t` is when it arrives, on this
      // downbeat, and `dur` is how long before that it has to start making a
      // sound. Both are in the event; which of the two the scheduler fires on
      // is the compiler's business (`leadOf` in performance.ts), so the plan
      // keeps one time per event and the locked order does not move.
      if (swell) push(swell.voice, startT, { dur: 1.8, gain: 0.35 }, { bar: s.startBar, layer: layerOf(swell.voice) });
    }
    if (fall && s.sweepFirst && fx.sweep && s.startBar > 0 && fxAllowed(s.startBar)) {
      push(fall.voice, startT, { dur: barSeconds * 2, gain: 0.45 }, { bar: s.startBar, layer: layerOf(fall.voice) });
    }
    if (
      rise &&
      s.riserLast &&
      fx.riser &&
      s.bars > s.riserLast + 2 &&
      r.chance(S.arrangement.riserChance) &&
      fxAllowed(s.startBar + s.bars - s.riserLast)
    ) {
      const dur = s.riserLast * barSeconds;
      push(rise.voice, endT - dur, { dur, gain: 0.5 }, { bar: s.startBar + s.bars - s.riserLast, layer: layerOf(rise.voice) });
    }
  }


  /**
   * **The lead-ins, by rules and not by a coin** — house-v2's `leadIns` switch;
   * R34 of the reconciled review of 09-24 and Eugene's answer to its question
   * 11 (*"it shouldn't be luck but heuristics: musical ideas and rules for how
   * we schedule it"*). The record rolled the riser at a breakdown's end at
   * `riserChance` (0.45), and one glue spacing, which the breakdown's own
   * opening sweep had already spent, let it through once in 272 breakdowns.
   * The rules:
   *
   *   Scheduled by what follows. A lead-in belongs to the last bars of a
   *     section whose next section brings the kick back, a breakdown into a
   *     drop or a groove. Never at the end of a build (its filter sweep is the
   *     rise), never before an outro, never at the track's end.
   *   Contrast decides presence. The rhythm layers the return adds (kick,
   *     bass, clap, sixteenths, the open hat) against the ones it leaves out:
   *     a full return — every rhythm layer the theme plays — takes the noise
   *     riser; a partial one only the filter's open point `filterCurve`
   *     already places. The riser's gain follows the contrast in three steps,
   *     0.35 / 0.5 / 0.65 for three, four, five or more layers gained.
   *   The scene gates the family, the birds bias within it. A drone in front
   *     takes no riser, ever (one foreground: a synth drone admits only its own
   *     domain). Ember above the house lowers the contrast a return needs,
   *     all the way to a quarter at the top of its scale; Veil past half-way
   *     from the house to the top (haze) plays the swell lane where the noise
   *     riser would be. Neither ever takes one away from a full return.
   *   The palette biases the lead-in, never gates it (Eugene, 09-24). The fx
   *     die still says what glue a theme is — open and deep carry a riser,
   *     dry and tight do not — and a palette without one raises the bar: a
   *     full return rises there only where it brings back five rhythm layers
   *     or more (four with Ember at the top of its scale), and its riser is a
   *     step quieter, so a dry track's rise is the quiet one. Under the bar it
   *     takes the swell and the impact or the fall, as before.
   *   Alternate the lead-ins. The first return rises, the second takes a
   *     different lead-in — the swell and the impact on the downbeat, or the
   *     fall into a bar's drop-out — and the third rises again; two returns
   *     running never share one.
   *   Length by tempo. Four bars at 110 BPM and over, two from 90, and under
   *     90 one bar of swell rather than noise.
   *   Spacing is between sections' moments. A breakdown's opening sweep and
   *     its closing lead-in are two moments of one section and do not spend
   *     each other's `fxEveryBars`; the lead-in and the impact on the return's
   *     downbeat are one moment.
   *
   * No die is drawn: the same plan always gets the same lead-ins.
   */
  function leadIns() {
    const RHYTHM = new Set(LANES.filter((l) => l.gate && [...PERCUSSION_ROLES, 'bassline'].includes(l.role)).map((l) => l.gate!));
    const played = new Set(timeline.flatMap((row) => row.layers.filter((l) => RHYTHM.has(l))));
    const lean = (bird: 'ember' | 'veil') => Math.max(0, Math.min(1, (bias.spell[bird] - HOUSE[bird]) / (1 - HOUSE[bird])));
    const need = 1 - 0.75 * lean('ember');
    const haze = lean('veil') >= 0.5;
    // A palette with no riser of its own: the loud returns only, a step down.
    const sparse = !fx.riser;
    const sparseGained = 5 - Math.round(lean('ember'));
    const bars = bpm >= 110 ? 4 : bpm >= 90 ? 2 : 1;
    // One moment per section line: where it is, and which section owns it.
    const moments: Array<{ bar: number; owner: number }> = [];
    const momentAt = (bar: number, owner: number) => {
      if (moments.some((m) => m.bar === bar)) return true;
      const last = moments.filter((m) => m.owner !== owner && m.bar < bar).pop();
      if (last && bar - last.bar < fxEveryBars) return false;
      moments.push({ bar, owner });
      return true;
    };
    const hit = (bar: number) => {
      const t = bar * barSeconds;
      push(stroke!.voice, t, { gain: 0.65 }, { bar, layer: layerOf(stroke!.voice) });
    };
    const arrive = (bar: number, dur: number, gain: number) => {
      push(swell!.voice, bar * barSeconds, { dur, gain }, { bar, layer: layerOf(swell!.voice) });
    };
    let previous: string | null = null, returns = 0;
    const sections = arrangement.sections;
    sections.forEach((s, i) => {
      const next = sections[i + 1];
      const back = s.startBar > 0 ? sections[i - 1] : undefined;
      // A drop the lead-in already arrived on has its downbeat from there.
      const led = back && back.kind === 'breakdown' && returnInto(back, s);
      if (!led && stroke && s.impactFirst && fx.impact && s.startBar > 0 && momentAt(s.startBar, s.index)) {
        hit(s.startBar);
        if (swell) arrive(s.startBar, 1.8, 0.35);
      }
      if (fall && s.sweepFirst && fx.sweep && s.startBar > 0 && momentAt(s.startBar, s.index)) {
        push(fall.voice, s.startBar * barSeconds, { dur: barSeconds * 2, gain: 0.45 }, { bar: s.startBar, layer: layerOf(fall.voice) });
      }
      if (!next || !returnInto(s, next)) return;
      const line = next.startBar;
      const before = timeline[line - 1].layers.filter((l) => RHYTHM.has(l));
      const after = timeline[line].layers.filter((l) => RHYTHM.has(l));
      const gained = after.filter((l) => !before.includes(l)).length;
      const missing = [...played].filter((l) => !after.includes(l)).length;
      const contrast = gained / Math.max(1, gained + missing);
      const earned = contrast >= need - 1e-9 && (!sparse || gained >= sparseGained);
      const riser = rise && scene !== 'drone-forward' && earned && s.bars > bars + 2
        ? (haze || bars === 1 ? (swell ? 'swell-long' : null) : 'riser') : null;
      const accent = stroke && fx.impact && next.impactFirst ? 'swell-impact' : null;
      const drop = fall && fx.sweep ? 'fall' : null;
      const order = returns % 2 === 0 ? [riser, accent, drop] : [accent, drop, riser];
      returns++;
      const pick = order.find((x) => x && x !== previous) ?? null;
      if (!pick || !momentAt(line, s.index)) { previous = null; return; }
      previous = pick;
      const STEPS = [0.35, 0.5, 0.65];
      const level = STEPS[Math.max(0, (gained >= 5 ? 2 : gained === 4 ? 1 : 0) - (sparse ? 1 : 0))];
      if (pick === 'riser' || pick === 'swell-long') {
        const from = line - bars;
        if (pick === 'riser') push(rise!.voice, from * barSeconds, { dur: bars * barSeconds, gain: level }, { bar: from, layer: layerOf(rise!.voice) });
        else arrive(line, bars * barSeconds, level * 0.7);
        if (stroke && fx.impact && next.impactFirst) hit(line);
      } else if (pick === 'swell-impact') {
        hit(line);
        if (swell) arrive(line, 1.8, 0.35);
      } else {
        push(fall!.voice, (line - 1) * barSeconds, { dur: barSeconds, gain: 0.45 }, { bar: line - 1, layer: layerOf(fall!.voice) });
      }
    });
    // Whether `next` brings the kick back after `s`: a section whose grammar
    // has the kick off in its last phrase (a breakdown, in this grammar) into
    // a drop or a groove that plays it on its first bar. That is what a
    // lead-in is for.
    function returnInto(s: Section, next: Section): boolean {
      if (!['drop', 'main'].includes(next.kind) || !kickGate || s.phrases[s.phrases.length - 1].layers[kickGate]) return false;
      const line = next.startBar;
      return line > 0 && line < timeline.length && !timeline[line - 1].layers.includes(kickGate) && timeline[line].layers.includes(kickGate);
    }
  }

  treat({ style, S, parts, characters, events, upperEvents, phraseParameters, LANES, voiceOf, UPPERS, TEXTURE, silent,
    bars, arrangement, progression, at, beat, barSeconds, push });
  events.sort((a, b) => a.t - b.t);
  // A held layer entering after a phrase without it swells in rather than
  // stepping in, where the section, the spell and the cast let it: house-v2's
  // `swellIn`, the rules at the head of `src/swell.ts`. It writes a parameter on
  // the notes it reaches and moves none of them; the record never asks.
  // Round S3's two rules for the sparse passages of a calm theme (`src/solo.ts`):
  // the bass's solo at the arc, an experiment written off (`bassSolo`), and the
  // texture part brought up where it is alone with the bass (`sparseTexture`).
  // The glue's noises only where the spell and the cast are bright and
  // driving: house-v2's `glueGates` (`src/glue.ts`).
  if (switchOn(style, 'glueGates')) {
    const s2 = style as { layers?: { rows: Record<string, { mean: Record<string, number> }> }; hatCentroid?: Record<string, number> };
    const brightness = Object.fromEntries(Object.entries(s2.layers?.rows ?? {}).map(([k, r]) => [k, r.mean.zephyr]));
    const v = glueVerdict({ style, spell: bias.spell, events, kit: DERIVED?.kit, brightness, hatCentroid: s2.hatCentroid ?? {} });
    if (!v.keep) {
      const kept = events.filter((e) => !(e.layer === 'fx' && isNoiseGlue(e.voice)));
      if (kept.length !== events.length) { events.length = 0; events.push(...kept); }
    }
  }
  // The offbeat hat thinned by its section: house-v2's `hatSections` (`src/hats.ts`).
  if (switchOn(style, 'hatSections')) {
    const kept = hatsBySection(events, arrangement);
    if (kept.length !== events.length) { events.length = 0; events.push(...kept); }
  }
  const sparseInput = { style, spell: bias.spell, bars, barSeconds, beat, arrangement, events, lanes: LANES };
  if (switchOn(style, 'bassSolo')) {
    const place = soloPlace(sparseInput);
    if (place) {
      const solo = soloEvents({ ...sparseInput, scale, root: rootPc, progression, ceiling: soloCeiling(S.register) }, place);
      events.length = 0;
      events.push(...(solo.events as typeof events));
    }
  }
  if (switchOn(style, 'sparseTexture')) liftTexture(sparseInput, true);
  // Nothing in the middle of a theme is ever fully silent: house-v2's
  // `neverSilent` (`src/silence.ts`), the last word after every pass above
  // that takes notes away, and before the swells, which read the bed it lays.
  if (switchOn(style, 'neverSilent')) fillSilence(events as any, arrangement.sections, bars, barSeconds, progression.loopBars || 8, timeline);
  const swells = switchOn(style, 'swellIn')
    ? swellsOf({ style, spell: bias.spell, barSeconds, bars, arrangement, timeline, events, lanes: LANES }) : [];
  applySwells(events, swells, barSeconds);
  // The melodic bus's filter, moved by the section where the spell, the cast,
  // the section and the seam let it: house-v2's `busSweeps`, the rules at the
  // head of `src/sweep.ts`. Automation only; the record never asks.
  // The glue's noises come in and go out by a curve where the spell and the
  // cast ask it: house-v2's `glueFades`, the rules in `src/sweep.ts`.
  if (switchOn(style, 'glueFades'))
    glueFadesOf({ style, spell: bias.spell, barSeconds, timeline, events, lanes: LANES, beat }, GLUE_SHAPES, true);
  const sweeps = switchOn(style, 'busSweeps')
    ? sweepCurves(sweepsOf({ style, spell: bias.spell, barSeconds, bars, arrangement, timeline, events, lanes: LANES, swells }), barSeconds) : null;

  // MEASURED: a breakdown lifts the pad and midrange by about 1.4 dB.
  const lift = Math.pow(10, S.master.breakdownLiftDb / 20);
  const melodicGain: PlanPoint[] = [{ t: 0, value: 1 }];
  for (const s of arrangement.sections) {
    if (!s.lift) continue;
    const a = s.startBar * barSeconds;
    const b = (s.startBar + s.bars) * barSeconds;
    melodicGain.push({ t: Math.max(0.01, a - 0.4), value: 1 });
    melodicGain.push({ t: a + 0.4, value: lift });
    melodicGain.push({ t: b - 0.6, value: lift });
    melodicGain.push({ t: b, value: 1 });
  }

  // How far the macro filter is allowed to travel is a preset choice: one
  // benchmark minute moves its high band 25 dB across the minute, the other
  // moves it 2 dB and holds everything still.
  const sweep = shape.sweep ?? 1;
  const open = S.master.filterOpen;
  const automation = {
    macroFilter: (shaped?.filter ?? filterCurve(arrangement)).map((p) => ({
      t: Math.max(0, p.bar * barSeconds),
      value: open * Math.pow(p.value / open, sweep),
    })),
    melodicGain,
    // The push: 0 through a groove, up for the last bars of a build and the
    // first bars of a drop, and away again.
    push: pushCurve(arrangement, S.push, edges).map((p) => ({
      t: Math.max(0, p.bar * barSeconds),
      value: p.value,
    })),
    ...(sweeps && (sweeps.hp || sweeps.lp) ? { sweep: sweeps } : {}),
  };

  // **What the spell asks of the voices this theme actually drew**
  // (PLAN-MODULATION M1). It is worked out here, once, after the events exist,
  // because the question is about the cast and not about the catalogue: a knob
  // on a voice nothing played is a setting nobody can hear, and writing one
  // would put a field on a plan that says nothing.
  //
  // A strategy that carries no `knobs` switch — the record, and always — never
  // asks, and at the house the table comes back empty on every voice, so the
  // field below is absent either way and the plan is the plan it was.
  const knobTables = tablesOf(style, events);
  // ...and the one thing the **derived state** asks of them: faster drums, a
  // lighter bass (Eugene, 09-20). The lane table says who the bass lane is —
  // a role and not a name — and `knobsFor` leans that voice's `hold` and `mass`
  // toward their light end by however far the family has travelled from the
  // house. At the house family the lean is nought and the table is the table it
  // was; under house-v1, which carries no `knobs` switch, there is no table.
  const knobs = knobsFor(bias.spell, knobTables, undefined, {
    derived: DERIVED,
    bass: new Set(LANES.filter((l) => l.role === 'bassline').map((l) => voiceOf(l))),
  });

  const track: Track = {
    seed,
    // The music this was planned in. A plan is enough to play it: a deck, the
    // single-theme player, an offline render and the program tool each resolve
    // the same room out of `style.base` and `paramOverrides` without being told
    // which style it is. Nothing in the golden snapshot sees it — the snapshot
    // names its fields — and nothing writes to it.
    style,
    minutes,
    bpm,
    beat,
    barSeconds,
    swing,
    bars,
    duration: bars * barSeconds + TAIL_SECONDS,
    kickPresent: kickBars / bars,
    key: {
      root: rootPc,
      name: noteName(chordRoot).replace(/-?\d+$/, '') + ' ' + scaleName,
      scaleName,
      scale,
    },
    // Every die, written down, so a listener can see why two seeds differ.
    preset: pre.id,
    presetLabel: pre.label,
    density,
    // The preset's own params, plus the one hat decision this theme's room and
    // character add to them. It is folded in here rather than in the preset so
    // it reaches every preset, and it is in `paramOverrides` rather than in the
    // plan so the golden snapshot never sees it: the hats play exactly where
    // they always played.
    paramOverrides: mergeParams(pre.params || {}, { hats: hatEnergy(pre.params, density),
      ...(characters && events.some(e => e.p.background || e.p.immersed) ? { backgroundSpaces: characters.returns } : {}),
    }),
    dice: readout({ form, development, refused, bars, shaped, bassDevelopment, composition, preset: pre.id, density, slow, chordRoot,
      scaleName, voicingStyle, CAT, leadTimbre, padTimbre, stabTimbre, UPPER, UPPERS, DERIVED, breakRow, MOTIF, ACCOMPANIMENT_BASS,
      ownFigure, pianoRole, fx, bassTemplate, parts, rhythm, rhythmMotion, rhythmPolicy, rhythmWithheld, stabTemplate, hatTemplate, progression }),
    // Not part of the plan: how wet this theme's harmonic layer is, is a
    // mixing decision, so it lives here as a readout rather than in `dice`.
    // The interface draws it; the golden file does not see it.
    sound: {
      wetness: (() => {
        const send = leadSustained ? padWet : ownFigure ? pianoHall : stabWet;
        const db = 20 * Math.log10(Math.max(1e-4, send));
        const word = db < -14 ? 'dry' : db < -8 ? 'damp' : db < -3.5 ? 'wet' : 'drowned';
        return { value: word, label: `${word} ${db >= 0 ? '+' : ''}${db.toFixed(1)} dB` };
      })(),
    },
    progression,
    arrangement,
    timeline,
    events,
    automation,
    // Present only where the spell really seasoned something: an empty table is
    // the house and is not a field at all, which is what keeps the record's own
    // bytes the record's own bytes.
    ...(Object.keys(knobs).length ? { knobs } : {}),
    // **A row's treatments reach the stage** (round S18): `wants.stage.
    // treatments` leans the catalogue's `treatmentRota`, which house-v2's
    // stage draws from as its palette, row for row — and the stage is in the
    // compiler, which never sees the bias. So the leaned weights ride on the
    // plan, present only where a row leaned them, and `stage()` reads them.
    ...(bias.weights.treatmentRota && bias.weights.treatmentRota.some((w: number) => w !== 1)
      ? { treatmentWeights: [...bias.weights.treatmentRota] } : {}),
  };

  return track;
}

export default generate;
