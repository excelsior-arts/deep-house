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
import { voicePlaying, TIMBRES, VOICE_KNOBS, GLUE_SHAPES, BY_NAME, VOICE_COST_UNITS, rowsThrough } from '@deep-house/engine/voices';
import { CEILING as CAST_CEILING } from './catalogue-v2.ts';
import type { Knobs } from '@deep-house/engine/voices';
import { dbToGain, midiToHz } from '@deep-house/engine/dsp';
import { ROOM_OFF_DB, subTrimDb } from './lane-level.ts';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import type { Lane, Room, Style } from '@deep-house/engine/style';
import { laneVoices, laneWeight, sourcesOf, slotOf, layerOf, percussionGates, PERCUSSION_ROLES, switchOn, silencedBy, withdrawnFrom, withdrawnAtTempo, rowCellsAt, familyOf, type LaneWithdrawal } from './lanes.ts';
import type { FigureGroup } from './lanes.ts';
import Rng from './rng.ts';
import type { Seed } from './rng.ts';
import { HOUSE, biasFor, houseTempoOf, knobsFor, pickerFor, scaleWeighted, tempoInFamily } from './spell.ts';
import type { Bias, Derived, KnobSettings, Spell } from './spell.ts';
import { shiftOf } from './lean.ts';
import { interpretWants, maskLean, type RateWindow } from './interpret.ts';
import type { Register, MotifBox } from './motif.ts';
import type { Recipe } from './recipe.ts';
import { withRhythm } from './parts/rhythm.ts';
import { asksRealWorld, composeParts, medianGapSteps, permitted, realWorld, type SceneContext } from './composition.ts';
import type { CompositionPolicy } from './composition-policy.ts';
import { developmentOf, type Development } from './development.ts';
import { prepareRhythmDevelopment, type RhythmPhase, type rhythmPickup } from './development-rhythm.ts';
import { kickPickupHits, recipeRhythmSource, rhythmGates, type RhythmPerformer } from './parts/perform-rhythm.ts';
import { recipeRequest, type Accompaniment } from './recipe-request.ts';
import { accompanimentOf, drawLibrary, settleDrums, travelOf, type LibraryDrawn, type Settled } from './library-draw.ts';
import { turnRoles } from './roles.ts';
import type { RolesReadout } from './roles.ts';
import { nearestEntry, leanFactor, leanShift, placedProfile, placedKnob, bassDriveFor, grainFor, drumGrainFor, BED_BELL, bellOfBed, floorOfBed, GHOST_VEL, type StylePlaces, type GrammarNeed } from './places.ts';
import { loudnessFeatures } from './loudness.ts';
import { eqProfileOf, type EqProfile } from '@deep-house/engine/master';
import { costOf as effectsCost } from '@deep-house/engine/effects';
import { rollMotifs, performMotif, type MotifPerformer, type PlayedMotif } from './motif-perform.ts';
import { rollPhrased, phrasedInSection, rollMined, minedEntrance, drawRiff, pairClockAt } from './glide.ts';
import { minedPhraseRuns, runPitch, withAfterKick, afterKickAt, knobAt } from './mined-phrase.ts';
import { recipeFigureSource, rollFigures } from './parts/perform-figure.ts';
import { rollTexture, treat } from './parts/treat.ts';
import { SCALES, makeProgression, chordAtBar, noteName, foldTo, foldInto, DEGREE_NAMES } from './theory.ts';
import { planKeys, inPickup, keysReadout, type KeysPlan, type KeysChord, type KeysReadout } from './keys-phrase.ts';
import { laneLevelDb, offShift } from './lane-level.ts';
import { walkAt, walked } from './walk.ts';
import type { Chord, Progression } from './theory.ts';
import { makeArrangement, filterCurve, pushCurve, layersAtBar, phraseGrid, sectionWindowBars, setGrid, type Section } from './arrangement.ts';
import { planForm } from './form-plan.ts';
import { readout } from './readout.ts';
import { swellsOf, applySwells, spellVerdict } from './swell.ts';
import { liftTexture, soloPlace, soloEvents, soloCeiling, soloMinBars, SOLO_SECTION_BARS } from './solo.ts';
import type { HarmonicSupport } from './development-shape.ts';
import { hatsBySection } from './hats.ts';
import { fillSilence, bedUnderExposed } from './silence.ts';
import { glueVerdict, isNoiseGlue } from './glue.ts';
import { planSubSections, playSubSections, pinnedRates, subAt, gatesAt, laneRoleOf, type SubSection, type RoleLanes } from './subsections.ts';
import { kitOf, answersOf, statesOf, type Kit, type KitLane, type KitMove } from './kit.ts';
import { planDevelopment, resolveForm, developmentOf as developmentRowOf, auxOf, surfaceOf, bassAnswersOf, stateAt, arcAt, withEndGlide,
  type DevelopmentPlan, type ReservedWindow } from './phrase-development.ts';
import { planAmbientVoices, admitAmbient, ambientEvents, type AmbientVoicesPlan } from './ambient-voices.ts';
import { TREATMENTS as TREATMENT_ROWS, SECTION_LIBRARY as SECTION_ROWS, FORM_LIBRARY, GLIDE_LIBRARY, recipeById } from './recipes.ts';
import { drawSectionRows, grammarWith, type SectionPin } from './sections.ts';
import { sweepsOf, sweepCurves, glueFadesOf, type BusSweepCurves } from './sweep.ts';
import * as P from './patterns.ts';
import { planAmbient, chapterPolicy, settleAmbient, detailWindows, voicesSlots, bedRowOf, type AmbientPlan } from './ambient-plan.ts';
import { PASSAGE_ROWS, playPassage, type PassageResult } from './passage.ts';
import { PRODUCER_ROWS, arrange, type PhrasePlan, type FilterSpan } from './producer.ts';
import { musicalTime, type MusicalTime } from './musical-time.ts';
import { planPhraseMap, type PhraseMap } from './phrase-map.ts';
import { applyHygiene, HYGIENE_ROWS, type HygieneResult } from './hygiene.ts';
import { planPhrasing, summarised, said as saidOf, bumpCurve, dipCurve, factorCurve, PHRASING_ROWS, TONAL_LAYERS, type Phrasing, type BarKit } from './phrasing.ts';
import { applyPadArc, PAD_ARC_ROWS, type PadArc } from './pad-arc.ts';
import type { SpaceRow } from '@deep-house/engine/space';

const TAIL_SECONDS = 4;

/**
 * A riff row's pair clock whose rate the voice's control would clamp at this
 * tempo is not written (its troughs would leave the grid, so the pair keeps
 * its own spacing there); said once a row, voice and rate, never silently
 * (the review of 10-08, A4).
 */
const CLAMPED_CLOCKS = new Set<string>();
function clampedClock(riff: string, voice: string, hz: number, range: { min: number; max: number }): void {
  const key = `${riff}|${voice}|${hz}`;
  if (CLAMPED_CLOCKS.has(key)) return;
  CLAMPED_CLOCKS.add(key);
  if (typeof console !== 'undefined') console.warn(`riff row ${riff}: its pair clock asks ${voice} for ${hz} Hz, outside its ${range.min}-${range.max}; the pair keeps its own spacing`);
}

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

/** A voicing between two ends, placed by the birds: `lean` is a `shiftOf` row (its birds' leans, its `centre`). */
export interface LeanedVoicing {
  lean: Readonly<Record<string, number>>;
  from: Readonly<Record<string, number>>;
  to: Readonly<Record<string, number>>;
}
const isLeaned = (v: unknown): v is LeanedVoicing => !!v && typeof v === 'object' && 'lean' in v && 'from' in v && 'to' in v;
/**
 * Where a leaned voicing stands for a spell: `from` at a shift of -0.5 and under, `to` at +0.5 and over, half-way at
 * the row's centre; a field in decibels (`…Db`) in a straight line, every other field in ratio (a frequency, a trim).
 * Rounded to 1e-4, so a spell lands on one block.
 */
export function voicingAt(v: LeanedVoicing, spell: Readonly<Record<string, number>>): Record<string, number> {
  const p = Math.max(0, Math.min(1, 0.5 + shiftOf(v.lean, spell)));
  const out: Record<string, number> = {};
  for (const k of Object.keys(v.from)) {
    const a = v.from[k], b = v.to[k] ?? a;
    const x = /Db$/.test(k) || !(a > 0 && b > 0) ? a + (b - a) * p : a * Math.pow(b / a, p);
    out[k] = Math.round(x * 1e4) / 1e4;
  }
  return out;
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

/**
 * A voice's unequal pair as its row states it (the liquid knobs, 10-07): the beat rate a note's phase
 * is kept on and the depth a phrase's pair shares are written against — the record's numbers, never
 * the desk's (a desk move is the page's and reaches the note at the voice).
 */
const pairOf = (voice: string): { hz: number; level: number } | null =>
  ((BY_NAME[voice]?.row?.parameters as { pair?: { hz: number; level: number } | null } | undefined)?.pair) ?? null;

// A send amount rolled inside a family's own measured spread, leaning wet:
// `dB` is the [p10, p90] of that family's wetness and `base` the send the
// median sits at.
/**
 * **The kit's lift, as runs** (10-06, `Kit.lift`): the runs of grooves side by side (a drop and the main after it are
 * one run), each long enough, with its midpoint and where its straight eighths begin. One arithmetic for the kit pass
 * and the phrase planner, which counts the lift's turns as the supporting changes they are (liquid-space).
 */
function kitLiftRuns(K: Kit, sections: readonly Section[]): Array<{ start: number; end: number; mid: number; eighthsFrom: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  for (const sec of sections) {
    if (!K.grooves.includes(sec.kind)) continue;
    const last = runs[runs.length - 1];
    if (last && last.end === sec.startBar) last.end = sec.startBar + sec.bars; else runs.push({ start: sec.startBar, end: sec.startBar + sec.bars });
  }
  const L = K.lift;
  if (!L) return [];
  return runs.filter((r) => r.end - r.start >= L.minBars).map((r) => {
    const mid = r.start + Math.floor((r.end - r.start) / 2);
    return { ...r, mid, eighthsFrom: Math.max(r.start, mid - L.eighthsBars) };
  });
}

/**
 * **The kit's phrase fills** (10-06, `Kit.phraseFill`): the last bar of each phrase of a groove, at the row's odds,
 * where no sub-section stands. One arithmetic for the kit pass and the phrase planner, which keeps the ones that have
 * somewhere to go (liquid-space).
 */
function kitPhraseFills(K: Kit, seed: Seed, sections: readonly Section[], subs: readonly SubSection[]): number[] {
  const subBars = new Set(subs.flatMap((x) => Array.from({ length: x.bars }, (_, i) => x.startBar + i)));
  const out: number[] = [];
  if (K.phraseFill) for (const sec of sections) {
    if (!K.grooves.includes(sec.kind)) continue;
    const every = K.phraseFill.everyBars;
    for (let b = sec.startBar + every - 1; b < sec.startBar + sec.bars - 1; b += every)
      if (!subBars.has(b) && new Rng(`${seed}::kitfill:${b}`).chance(K.phraseFill.chance)) out.push(b);
  }
  return out;
}

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
  /** the treatment row that wrote this hit (`src/subsections.ts`): a derived hit says so, and never wears a part's name */
  by?: string;
  /** A phrase may reserve its sound from the stage's rotating treatments. */
  treatment?: 'none';
  /** A ringing struck note is not a sustained tone merely because it is long. */
  articulation?: 'struck';
  /** A background texture keeps its musical role even when borrowing a keys voice; the sparse keys are a part of their own (liquid-space round 1); a featured detail too (liquid-ambient). */
  role?: 'texture' | 'sparse-keys' | 'detail';
  bar: number;
  step?: number;
  /** the layer the **descriptor** declares, asked of the registry and never written here */
  layer: string;
  /** the pitch spelled out for a readout; only an event that carries one has it */
  note?: string;
  /** the labelled phrase or exchange of the arrangement this event belongs to (`src/passage.ts`), where one wrote it */
  label?: string;
  /** the voice the draw chose, where a place swapped only its sound (`DrumsEntry.soundOnly`): the cast counts this one */
  drawn?: string;
  /** an exposed held front's note: the stage stands it where it settles after this bar (`performance.ts`, `stageHold`) */
  stageHold?: number;
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
  /** the presence bell's gain on the harmonic bus, in dB, section by section by the bed (round EQ-5), where the theme has a bell */
  bell?: PlanPoint[];
  /** the floors keyed to the bed (round EQ-6): from each section's start, how far under the room's level a role plays, in dB, where any section stands under the most */
  floors?: BedFloorStep[];
  /** the part's own space's dry and each send's level, by section (liquid-space round 1) */
  partSpace?: { dry: PlanPoint[]; sends: Record<string, PlanPoint[]> };
  /** lines on the theme's shared returns (`settings.returns`, the written passage's), each by its path into one (`returns.<id>.…`) */
  returns?: Array<{ param: string; points: PlanPoint[] }>;
}

/** One section's step of the keyed floors (round EQ-6): from `t`, in theme seconds, each role named plays that many dB under the room's level. */
export interface BedFloorStep {
  t: number;
  keys?: number;
  pad?: number;
  piano?: number;
}

/** One bar of the readout: which section, which chord, and what was playing. */
export interface TimelineRow {
  bar: number;
  t: number;
  section: string;
  /** the section row's own name (round T2, `src/sections.ts`), where it is not the kind's word: the ledger's, never the ring's */
  sectionName?: string;
  sectionIndex: number;
  phrase: number;
  chord: string;
  roman: string;
  layers: string[];
  /** the sub-section the bar is in (round DNB-1, `src/subsections.ts`): a switch-up's figure, a turnaround, a fill, a drop-out */
  sub?: string;
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
  /**
   * **The library's turn** (round GA1): the row drawn, or why a turn drew
   * none. Absent on a theme that is not a turn, so an ordinary theme's readout
   * is the object it was.
   */
  library?: string;
  /** the bass's own figure where it is not the mask's (a held line; round DNB-7, a glide line) */
  bassFigure?: string;
  /** the glide row the place played (round DNB-7), and the bar its second line takes over */
  glide?: string;
  glideSwitchBar?: number;
  /** the riff row the theme's gliding bass drew (liquid-riffs-2, `drawRiff`) */
  riff?: string;
  /** the form row the place drew (round DNB-6) */
  form?: string;
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
  sound: {
    wetness: DieReadout;
    /** the sub's step under its room, in dB (`subTrimDb`): what `?sub=` replaces */
    subDb?: number;
    /** what a place's roles changed (round DUB-1, `turnRoles`): what `roles=classic` puts back */
    roles?: RolesReadout;
    /**
     * **Who plays a lane the plan gave another voice** (liquid-desk, 10-07): by lane id, the voices a
     * lane plays where they are not the lane's own draw — a place's bass sound (the liquid sine on the
     * bassline), its glue sound, the broken backbeat, a tool's hand, and the parts a place's kit
     * strikes in voices of its own (its hats, on the first lane of their group; liquid-desk-2, 10-08).
     * The machine view reads it to put those voices on their lane, where the lane's candidate list does
     * not name them. A readout: no lock sees it, and absent where every lane plays its own draw (the house).
     */
    lanes?: Record<string, string[]>;
    /** the most the set's trim may lift this theme, in dB (round DNB-3, `DrumsEntry.trimMostDb`) */
    trimMostDb?: number;
    /** the level the set's trim aims this theme's window at, in LUFS, where its place names one (round DNB-4, `DrumsEntry.targetLufs`) */
    targetLufs?: number;
    /** what the place's windows measure at a trim of nought, in LUFS (round DNB-4, `DrumsEntry.measuredLufs`) */
    measuredLufs?: number;
  };
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
  /** the sparse keys and the harmony they set, where a place admits them (liquid-space round 1, `keysReadout`) */
  keys?: KeysReadout;
  /**
   * **What the library's turn drew, and from how far** (round D1): the row,
   * its distance from the playing birds and tempo, the nearest candidate's,
   * the reach it was drawn at and whether it leaked from past today's band.
   * Absent on a theme that is not a turn and on a turn that drew nothing; a
   * readout for the machine view, and outside everything a lock hashes.
   */
  drawn?: { id: string; scope: string; distance: number; nearest: number; reach: number; away: boolean; among: number; settled?: Settled };
  /** A pinned section row read against the grammar's own (R02): both definitions, and whether it was laid over. Present only under a section pin. */
  sectionPin?: SectionPin;
  /**
   * The post-selection admission's refusals: a place's swap of a lane's sound
   * that a recipe's `forbids` or explicit `tone` refused (`kept` is the voice
   * the lane plays instead), and a forbidden voice that still sounds (`at:
   * 'plays'`). Present only where something was refused.
   */
  admission?: Array<{ at: string; lane: string; voice: string; kept: string | null; why: string }>;
  /**
   * **The phrase plan** (liquid-space, `src/phrase-development.ts`): the form's draws, each phrase's state, the move
   * it drew and the alternatives it rejected, the auxiliary part's spans, the bass's answers, the throws, the fills
   * kept and dropped, the surface's spans. Present only where a place plans its phrases (the fast places).
   */
  development?: DevelopmentPlan;
  /**
   * **The ambient plan** (liquid-ambient, `src/ambient-plan.ts`): the chapters and their functions, the bed's gestures
   * and notes, the featured-detail slots, the reservations, the salient moments, what the deadline required and the
   * return's staggered axes. Present only where a place names ambient rows (the fast places).
   */
  ambient?: AmbientPlan;
  /**
   * **The ambient voices** (liquid-ambient, `src/ambient-voices.ts`): the vocabulary, the motif and its statements, the
   * fillers, the weather's spans and thunder, the windows the featured detail took, and their admission under the budget.
   * Present only where a place lays them (the fast places).
   */
  ambientVoices?: AmbientVoicesPlan;
  /**
   * **The written passage** (`src/passage.ts`), and the producer's plan of the whole track around it where the place
   * arranges one (`src/producer.ts`): the row, its window, what it retired and wrote, its timeline bar by bar, the
   * phrases and the filter spans. Present only where a place names a passage (the fast places).
   */
  passage?: Omit<PassageResult, 'returns' | 'lines'> & { phrases: PhrasePlan[]; filters: FilterSpan[] };
  /** the theme's phrases and structural arrivals in its own time (PLAN-UNIFY §2.5, `src/phrase-map.ts`): house-v2's places only */
  phraseMap?: PhraseMap;
  /** what the arrangement's hygiene did (PLAN-UNIFY U1, `src/hygiene.ts`): the holds it faded, the beds it laid where the groove went bare; house-v2's positions the producer does not arrange, where it did anything */
  hygiene?: HygieneResult;
  /**
   * what the arrangement's phrases did (PLAN-UNIFY U2, `src/phrasing.ts`): the sub-segments inside the long mains (each
   * labelled, for the ring to show one day), the structural arrivals the drums answered, the bass's outs and the
   * cooldowns; house-v2's positions whose kit no phrase planner owns, where it did anything. Read by nothing new.
   */
  phrasing?: Phrasing;
  /**
   * what the pad arc did (PLAN-UNIFY U3, `src/pad-arc.ts`): each long main's arc (its crest phrase, where it opened and
   * settled) over the theme's own pad, the restrikes it reshaped and the top voices it left out at the thin ends;
   * house-v2's positions the producer does not arrange, from 70 BPM up (the slow side behind its own switch), where it ran
   */
  padArc?: PadArc;
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
  /**
   * **The set's turn** (round GA1, `src/library-draw.ts`): whether this theme is
   * the one in three a set gives the library. Written by the set, which knows the
   * master seed and the theme's place (`themeAt`); absent — a theme on its own,
   * and every path house-v1 takes — is no turn. On a turn, under a style with the
   * `libraryDraw` switch and nothing pinned, the theme draws one row the spell
   * admits and plays it as its pin.
   */
  visit?: boolean | null;
  /**
   * **A tool's hand on the library a turn draws from**, in place of the shipped
   * one. It is the lane and timbre overrides' twin and on no playing path: the
   * checks hand a row lifted off weight 0 to prove the draw is its pin.
   */
  library?: readonly Recipe[] | null;
  /**
   * **How far a turn's row may leak beyond its place** (round D1,
   * `reachOf` in `src/library-draw.ts`): the set's `reach`, 0 to 1. Absent or
   * 0 is today's band, so every path the locks take draws what it drew.
   */
  reach?: number | null;
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
 * **The seasoning a spell asks of the voices a theme drew — the whole chain**,
 * as `generate` writes it onto the plan (`track.knobs`): the spell's setting of
 * every knob (`knobsFor`), the derived state's lean on the bass lane's `hold`
 * and `mass` toward their light end (Eugene, 09-20: faster drums, a lighter
 * bass), and the place's own bass mass over both (round DNB-2: where the
 * nearest bass row states one and the voice it plays declares the knob, the
 * place's number, moved by Root from there). One function, so the plan and the
 * live seasoning of a held bird (`seasonOf`, `mix.ts`) cannot part.
 */
export function seasoningOf(style: Style, bias: Bias, tables: Record<string, Knobs>, bass: ReadonlySet<string>, bpm: number): KnobSettings {
  const knobs = knobsFor(bias.spell, tables, undefined, { derived: derivedFor(style, bias), bass });
  if (!switchOn(style, 'placeTables')) return knobs;
  const PLACED = ((style as Style & { places?: StylePlaces }).places ?? {}) as StylePlaces;
  const bassPlaced = nearestEntry(PLACED.bassSound ?? [], bias.spell, bpm);
  if (bassPlaced?.mass != null) {
    const voice = (PLACED.sounds ?? {})[bassPlaced.sound];
    const spec = voice ? tables[voice]?.mass : undefined;
    if (voice && spec) {
      const set = +Math.max(spec.min, Math.min(spec.max, placedKnob({ bird: spec.bird, of: 'value', min: spec.min, max: spec.max, sense: spec.sense }, bassPlaced.mass, bassPlaced.place, bias.spell))).toFixed(4);
      const row = { ...(knobs[voice] ?? {}) } as Record<string, number>;
      if (set !== spec.default) row.mass = set; else delete row.mass;
      if (Object.keys(row).length) knobs[voice] = row; else delete knobs[voice];
    }
  }
  return knobs;
}

/** Who played the bass lane of a plan this module composed, remembered beside it (the plan's bytes carry no such field). */
const BASS_LANE = new WeakMap<object, ReadonlySet<string>>();
/** That lane, read and remembered again, for a plan carried from the thread that composed it to another (`src/plan-ask.ts`). */
export const bassLaneOf = (track: object): ReadonlySet<string> | null => BASS_LANE.get(track) ?? null;
export const keepBassLane = (track: object, lane: Iterable<string>): void => { BASS_LANE.set(track, new Set(lane)); };

/**
 * **The seasoning a spell asks of a theme already planned** — the plan's own
 * chain (`seasoningOf`) under another spell, on the voices the theme drew, at
 * its own tempo. What a held bird gives the notes of a theme that is sounding:
 * under the spell the theme was planned at it is the plan's own `knobs`.
 */
export function seasonOf(track: Track, spell: Partial<Spell> | null): KnobSettings {
  const bass = BASS_LANE.get(track) ?? new Set(track.events.filter((e) => e.layer === 'bass').map((e) => e.voice));
  return seasoningOf(track.style, biasFor(spell, track.style), knobTablesOf(track), bass, track.bpm);
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

/** The most Zephyr opens the keys' own low-pass above a place's tile (PLAN-UNIFY U3): a little, never past the voice's own top by much. */
const KEYS_LP_MOST = 1.15;

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

/**
 * **A turn of the library** (round GA1): on the set's turn, with the style's
 * `libraryDraw` switch and nothing pinned — no recipe, no tool's motif — the
 * theme draws a row (`drawLibrary`) and is planned exactly as that row's pin
 * would plan it: a track row as `?recipe=<id>`, a layer or a motif as
 * `?recipe=<id>&accompaniment=auto`. A pin that refuses is the house for the
 * theme, with the refusal on the readout; a drawn row never throws out of here.
 * Off a turn, and on a turn the spell admits nothing on, nothing is drawn and
 * nothing is written, so the theme is the plan it was, byte for byte.
 */
function compose(opts: GenerateOptions, leadOnly: boolean): Track | string {
  const { style, seed = 1, spell = null, recipe = null, motif = null, visit = null, library = null, development = 'base', reach = null } = opts;
  if (!visit || recipe || motif || !switchOn(style, 'libraryDraw')) return composeTheme(opts, leadOnly);
  // The theme's tempo where the set forces it (every set does), which is what
  // the nearest key is asked at (GA5); a lone theme is asked at its centre.
  const drawn: LibraryDrawn | null = drawLibrary(seed, { style, bias: biasFor(spell, style), form: !!developmentOf(style, development),
    ...(opts.bpm ? { bpm: opts.bpm } : {}), ...(reach ? { reach } : {}) },
    library ?? undefined);
  // the turn's word on the readout; the row itself is named in the composition's trace where the theme writes it
  // (`composeTheme`'s `turnRow`), never by reading the written trace back
  const mark = (plan: Track | string, said: string): Track | string => {
    if (typeof plan === 'string') return plan;
    plan.dice.library = said;
    return plan;
  };
  // A turn with nothing admitted is the house and writes nothing: the turn is
  // the set's rule (`libraryTurn`), asked again by whoever needs it, and a
  // readout that moved on every third theme would move every lock for a word.
  if (!drawn) return composeTheme(opts, leadOnly);
  let played: Track | string;
  try {
    played = composeTheme({ ...opts, recipe: drawn.row, accompaniment: accompanimentOf(drawn.row) }, leadOnly, true, drawn.row);
  } catch (e) {
    const why = String((e as Error)?.message || e).replace(/\s+/g, ' ').slice(0, 160);
    return mark(composeTheme(opts, leadOnly), `turn: ${drawn.row.id} refused (${why})`);
  }
  if (typeof played !== 'string') {
    // **A travelled row's drums are the place's** (round D1, `settleDrums`):
    // its ghosts thinned toward the density and its drums scaled to the level
    // the composer writes at these birds with no row, by how far it travelled.
    const settled = drawn.away ? settleDrums(played, composeTheme(opts, false, true) as Track, travelOf(drawn), style) : null;
    played.drawn = { id: drawn.row.id, scope: drawn.row.scope, distance: +drawn.distance.toFixed(3), nearest: +drawn.nearest.toFixed(3),
      reach: drawn.reach, away: drawn.away, among: drawn.among, ...(settled ? { settled } : {}) };
  }
  return mark(played, `${drawn.row.id} (${drawn.row.scope}, of ${drawn.among})`);
}

function composeTheme({ style, seed = 1, minutes = 2, preset = 'auto', bpm: forceBpm = null, root: forceRoot = null, scaleName: forceScale = null, bars: forceBars = null, fitBars = null, avoidOrgan = false, spell = null, lanes = null, timbres = null, recipe = null, accompaniment = 'base', development = 'base', motif: forceMotif = null }: GenerateOptions, leadOnly: boolean, fromLibrary = false, turnRow: { id: string; scope: string } | null = null): Track | string {
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
    log: typeof console !== 'undefined' && !leadOnly && !fromLibrary ? (line: string) => console.log(line) : null,
  });
  const invalidPart = wanted.notes.find(n => ['figures.figure', 'figures.texture', 'ambience', 'presence', 'tone'].includes(n.block) && n.state !== 'applied');
  if (invalidPart) throw new Error(`recipe ${invalidPart.block}: ${invalidPart.say}`);
  // **The post-selection admission** (the September review's first two
  // contract faults, rechecked by the review of 10-03): a recipe's
  // `forbids` and an explicit `tone` are read where the dice draw, and a place
  // then swaps a lane's sound after every die — the held layer, the bass, the
  // stroke on a line, the backbeat of a broken kit, the place's own drums. One
  // check sees the voice that would actually play and what the request
  // requires of it: a voice that carries a forbidden family or role, or that
  // lacks the controls an explicitly requested tone needs, is not swapped in —
  // the lane keeps the voice the dice drew, which the interpreter admitted —
  // and the refusal is written on the plan (`admission`). With no recipe, or
  // one that forbids nothing and asks no tone, nothing is read and nothing is
  // written.
  const forbidden = new Set(recipe?.forbids ?? []);
  const explicitTone: Record<string, string> = { ...(request.pin?.request.tone ?? {}), ...wanted.tone } as Record<string, string>;
  const admission: Array<{ at: string; lane: string; voice: string; kept: string | null; why: string }> = [];
  const inadmissible = (voice: string): string | null => {
    const d = BY_NAME[voice];
    if (!d) return null;
    const hit = [d.family, ...(d.roles ?? [])].find((x) => forbidden.has(x as string));
    if (hit) return `the recipe forbids ${hit}`;
    for (const role of d.roles ?? []) {
      const character = explicitTone[role];
      const profile = character ? charactersOf(style)?.tone[role]?.[character] : undefined;
      if (profile && !profile.requires.every((k) => (d.noteControls ?? []).includes(k)))
        return `the recipe's ${role} tone '${character}' needs ${profile.requires.join(', ')}, which ${voice} does not declare`;
    }
    return null;
  };
  const passes = (at: string, lane: string, voice: string, kept: string | null): boolean => {
    if (!forbidden.size && !Object.keys(explicitTone).length) return true;
    const why = inadmissible(voice);
    if (why) admission.push({ at, lane, voice, kept, why });
    return !why;
  };
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
  // Round GA6: the tables read by place (`src/styles/deep-house-places.ts`).
  const placesOn = switchOn(style, 'placeTables');
  // The tables themselves are the style's (`style.places`), never imported here.
  const PLACED = ((style as Style & { places?: StylePlaces }).places ?? {}) as StylePlaces;
  const HARMONY = PLACED.harmony ?? [], FORM = PLACED.form ?? [], TREATMENTS = PLACED.treatments ?? [], BASS_SOUND = PLACED.bassSound ?? [], LANE_SOUND = PLACED.laneSound ?? [], SOUNDS = PLACED.sounds ?? {};
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
  // **A room that writes no sixteenths takes them where the density die asks
  // for more** (round EQ-3, `notes/rounds/eq-3.md`; a style's `sixteenthsLean`,
  // house-v2's only). Over seeds 1-40, three themes each, 102 of the house's
  // 168 mains outside a drone in front went eight bars or more with no high
  // bed under the offbeat hat, and 75 of them were the growl room playing no
  // sixteenth lane at all: its measured minute had none (`shape.sixteenths:
  // false`, its shaker written off). Where the die rolled one of the lean's densities the
  // room's "no" stands aside and the lane plays as it does in a room that
  // never said it: the same draw, the same figure, its own gates (a drone in
  // front still holds it off) -- at `underHatDb` under the room's offbeat hat
  // (the reference sets' sixteenth layer, `notes/analysis/REPORT.md` rule 6).
  // A minimal die keeps the room as it was measured.
  const LEAN = (style as Style & { sixteenthsLean?: { densities: readonly string[]; underHatDb: number } }).sixteenthsLean;
  const leanSixteenths = !!LEAN && shape.sixteenths === false && LEAN.densities.includes(density);
  const shakerBaseDb = (style.base.levels as Record<string, number>).shaker;
  const leanLevels = leanSixteenths && Number.isFinite(shakerBaseDb) && (S.levels as Record<string, number>).shaker <= ROOM_OFF_DB
    ? { shaker: shakerBaseDb } : null;
  const leanGain = leanSixteenths
    ? dbToGain((S.levels as Record<string, number>).hatClosed + LEAN!.underHatDb - (leanLevels ? leanLevels.shaker : (S.levels as Record<string, number>).shaker))
    : 1;
  // **The room's levels as the theme plays them**: `S` with the lean's shaker over it. The lean writes its level into
  // the theme's room (`paramOverrides.levels`, below), not into `S`, so every pass that sets a note's gain against its
  // lane's level reads this and never `S.levels`: a gain struck against the room's "off" (−60) while the lane plays at
  // the lean's level stands some 50 dB over its lane (10-13: seed 11 at Zephyr, a growl room at a busy die, its
  // shaker at +50.5 dB over its −9.5 and the limiter taking everything else under it: "I only hear hat").
  const roomLevels: Readonly<Record<string, number>> = Object.freeze({ ...(S.levels as Record<string, number>), ...(leanLevels ?? {}) });
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
  // **A lane's sound by place** (GA6, the kitchen's voices): the nearest
  // place's held or struck layer swapped for the timbre its sound word
  // resolves to, after every die above has been rolled, so no stream moves.
  // Where the lead is the layer swapped (a held lead is the pad, a struck one
  // the stab), the lead is the swapped timbre too, and it is a pin from here
  // on, as a shape's own timbre is.
  const laneSound = placesOn ? nearestEntry(LANE_SOUND, bias.spell, bpm) : null;
  const placedTimbre = laneSound ? SOUNDS[laneSound.sound] ?? null : null;
  const placed = { lead: false, pad: false, stab: false };
  if (laneSound && placedTimbre && passes('lane sound', laneSound.lane, placedTimbre, drawn[laneSound.lane] || null)) {
    placed[laneSound.lane] = true;
    drawn[laneSound.lane] = placedTimbre;
    if ((laneSound.lane === 'pad') === leadSustained) { drawn.lead = placedTimbre; placed.lead = true; }
  }
  // **The support by place** (round DNB-3, `SupportEntry` in places.ts): what
  // the voices beside the drums and the bass may do where the nearest place
  // says. The held layer's timbre is drawn from the place's beds off a stream
  // of its own, after every die above, as the lane's sound is; a held lead is
  // the held layer, so it is the drawn bed too.
  const supportRow = placesOn ? nearestEntry(PLACED.support, bias.spell, bpm) : null;
  const ONE_BED = !!supportRow?.oneBed;
  if ((supportRow?.bed || supportRow?.bedRule) && !shape.padTimbre && !placed.pad) {
    const rule = supportRow.bedRule;
    const beds = rule
      ? [...new Set((CAT.padPartners as readonly { v: string }[]).map((o) => o.v))]
        .filter((t) => { const f = TIMBRES[t]; return !!f && !f.struck && (f.hold ?? 0) >= rule.holdLeast && (f.brightnessHz ?? Infinity) <= rule.brightMost; })
        .map((v) => ({ v, w: 1 }))
      : Object.entries(supportRow.bed!).filter(([t, w]) => w > 0 && TIMBRES[t]).map(([v, w]) => ({ v, w }));
    // **A rule's beds are the partners' timbres, and a partner the list holds at
    // weight nought is not drawn by it** (the deep review of 10-08, B6): the
    // rule took the list's names and not its weights, so a reserved partner —
    // weight nought, rejected by ear — played the bed in 17 of 120 themes at
    // the liquid place. Drawn as before, and a draw that lands on one is drawn
    // again off a stream of its own among the rest, so no other theme moves.
    const weighed = new Set((CAT.padPartners as readonly { v: string; w: number }[]).filter((o) => o.w > 0).map((o) => o.v));
    const drawnBed = beds.length ? dice('bed-place').weighted(beds) : null;
    const others = rule && drawnBed && !weighed.has(drawnBed) ? beds.filter((b) => weighed.has(b.v)) : null;
    const bedTimbre = others ? (others.length ? dice('bed-place:again').weighted(others) : null) : drawnBed;
    if (bedTimbre && passes('bed by place', 'pad', bedTimbre, drawn.pad || null)) {
      drawn.pad = bedTimbre;
      placed.pad = true;
      if (leadSustained && !shape.leadTimbre) { drawn.lead = bedTimbre; placed.lead = true; }
    }
  }

  // Explicit recipes retain their interpretation and replay. With no recipe,
  // the style can choose musical parts for these same players. No preview
  // recipe, source chunk, render tool or library lookup participates here.
  // Component assembly is opt-in. Complete arrangements and accepted motif
  // comparisons retain their interpretation; pins reserve their role first.
  //
  // **A row that asks for no part leaves the parts to the composer** (round
  // GA2): a track row whose wants only lean the dice — the rooms' casts, the two
  // mined whole themes — has no arrangement of its own to retain, so the
  // ordinary families are drawn under its leaned bias as under any other. Only
  // a row that writes a part (a rhythm cell, a figure, a texture, a tone, a
  // presence, an ambience, a held or moving bass, a pedal) keeps the theme to
  // itself. A style with no composition policy (house-v1) composes nothing
  // either way.
  const writesParts = wanted.rhythm.length > 0 || !!wanted.bassMotif || wanted.heldBass || wanted.struckFigures.length > 0
    || !!wanted.texture || wanted.pedalHarmony || Object.keys(wanted.tone).length > 0
    || Object.keys(wanted.ambience).length > 0 || Object.keys(wanted.presence).length > 0;
  const composition = request.pin || ((!recipe || wanted.identity || !writesParts) && !forceMotif && !request.motif)
    ? composeParts(style, seed, bias, density, bpm, request.pin ?? undefined,
      { bedHold: TIMBRES[drawn.pad]?.hold ?? 0, leadHolds: leadSustained, bedStruck: TIMBRES[drawn.pad]?.struck },
      supportRow?.withhold?.length ? new Set(supportRow.withhold) : undefined) : null;
  // A track row's own cells answer the lanes' withdrawal as a part's do (`rowCellsAt`, 10-13: the afro-house
  // row's bongo): a hand cell leaves on a fast four-floor or over a continuous bed, its shaker cell plays on.
  const rowRhythm = composition ? wanted.rhythm
    : rowCellsAt(wanted.rhythm, style.lanes, bpm, bias.spell as unknown as Record<string, number>, { kit: bias.derived.kit, bed: TIMBRES[drawn.pad] });
  const parts = composition?.parts ?? (rowRhythm === wanted.rhythm ? wanted : { ...wanted, rhythm: [...rowRhythm] });
  // **One foreground** (composition.ts): with the drone in front, the lanes
  // and the timbre dice withdraw the real-world class too, each at its pace.
  const sceneAt: SceneContext | null = composition?.trace.scene === 'drone-forward'
    ? { policy: (style as Style & { composition: CompositionPolicy }).composition.scene!, bpm, drumsOn: bias.derived.drumsOn, characters: charactersOf(style),
      ...(composition.trace.floor ? { floor: true } : {}) }
    : null;

  // The mined masks, each off a stream of its own, drawn here so the scene can
  // ask a lane's pace before the timbre dice are settled; nothing else reads
  // these streams, so drawing them earlier moves no number.
  // A row's rates lean the two masks (round GA2, `wanted.masks`); with none the
  // draw is the one it always was.
  const maskRate = (w?: RateWindow) => w && ((perBar: number) => maskLean(w, perBar));
  const stabTemplate = shape.stabMask ? { m: shape.stabMask, c: 1 } : P.pickStabMask(dStab, CORPUS, maskRate(wanted.masks?.stabs));
  const drawnHats = shape.hatMask ? { m: shape.hatMask, c: 1 } : P.pickHatMask(dHat, CORPUS, maskRate(wanted.masks?.hats));
  // On the floor under a drone (round GA7) the hats play the figure the floor
  // names (`Lane.floor.mask`) in place of the mined one, drawn all the same so
  // no stream moves: a mined mask whose hits fall between the offbeats leaves
  // the hat lane silent, and the floor's hats are what keep the time.
  const floorHats = !shape.hatMask && sceneAt?.floor
    ? style.lanes.find((l) => l.figure === 'hatMask' && l.floor?.mask)?.floor?.mask : undefined;
  const hatTemplate = floorHats ? { m: floorHats, c: 1 } : drawnHats;
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
  // **Timbres from far-apart scenes don't share a track** (`catalogue.apart`,
  // his ear 10-13): where the draw — the scene's included — lands on a front
  // timbre a row names over a bed it names, it is drawn again off the same
  // stream with the row's front timbres at nought: the struck lead against the
  // drawn bed (a struck lead's bed is the bed it was drawn with), the stab
  // against the bed the theme holds. Every other draw is the draw it was, to
  // the stream. A pin (a shape's, a place's) keeps its timbre; a style with no
  // block, which is house-v1, draws as it did.
  const APART: ReadonlyArray<{ front: readonly string[]; beds: readonly string[]; db?: number; bedMostDb?: number; frontMostDb?: number }> = CAT.apart ?? [];
  const apart = (front: string, bed: string) => APART.some((r) => r.front.includes(front) && r.beds.includes(bed));
  const besides = (bed: string) => <T extends { v: string }>(list: T[]): T[] => list.filter((e) => !apart(e.v, bed));
  const leadDrawn = shape.leadTimbre || placed.lead || !strikes(drawn.lead, leadPace) ? drawn.lead
    : leadTimbreFor(style, seed, avoidOrgan, bias, (list) => admitted(leadPace, leadSustained)(lean('leadTimbres')(list)));
  // The bed a lead plays over: the lead itself where it holds, else the drawn partner as the scene admits it (off a
  // fresh `partner` stream, so asking twice is the same answer). A struck lead's bed does not depend on the lead, so
  // the far-apart question asks it of the bed that plays.
  const padOf = (lead: string) => shape.padTimbre || placed.pad ? drawn.pad : leadSustained ? lead : !strikes(drawn.pad, padPace) ? drawn.pad
    : dice('partner').weighted(admitted(padPace)(lean('padPartners')(scaleWeighted(CAT.padPartners, bias, 'padPartners'))));
  const struckBed = leadSustained ? '' : padOf(leadDrawn);
  const leadTimbre = shape.leadTimbre || placed.lead || leadSustained || !apart(leadDrawn, struckBed) ? leadDrawn
    : leadTimbreFor(style, seed, avoidOrgan, bias, (list) => besides(struckBed)(admitted(leadPace, leadSustained)(lean('leadTimbres')(list))));
  if (leadOnly) return leadTimbre;
  const padTimbre = padOf(leadTimbre);
  const stabDrawn = shape.stabTimbre || placed.stab ? drawn.stab : !leadSustained ? leadTimbre : !strikes(drawn.stab, keysPace) ? drawn.stab
    : dice('partner').weighted(admitted(keysPace)(lean('stabPartners')(scaleWeighted(CAT.stabPartners, bias, 'stabPartners'))));
  const stabTimbre = shape.stabTimbre || placed.stab || !leadSustained || !apart(stabDrawn, padTimbre) ? stabDrawn
    : dice('partner').weighted(besides(padTimbre)(admitted(keysPace)(lean('stabPartners')(scaleWeighted(CAT.stabPartners, bias, 'stabPartners')))));
  // A redrawn front plays the figure that was written for the one it replaced; a held one at the row's `db`
  // (`apart`, below): the reed's figure is a sixteenth-long strike its 45 ms attack never fully opened, and a held
  // voice drawn in its place opens on every one of them. A struck one decays from its strike and stands at or under
  // the reed already (the FM glass 3.3 dB under it, the vibes 0.7, the FM EP 0.2, at the same notes), so it keeps
  // its own level.
  const redrawnFrom = stabTimbre !== stabDrawn ? stabDrawn : !leadSustained && leadTimbre !== leadDrawn ? leadDrawn : null;
  const redrawnDb = redrawnFrom && TIMBRES[stabTimbre] && !TIMBRES[stabTimbre].struck ? APART.find((r) => r.front.includes(redrawnFrom))?.db ?? 0 : 0;
  // The lanes that put their candidates to the scene's question, each at its
  // own mined figure's pace; a lane whose figure is not known here is taken at
  // the grid's (no gap at all), so only the tempo band can admit it.
  const lanePace = (lane: Lane) => lane.figure === 'sixteenthMask' ? maskPace(sixteenthTemplate?.m, 0)
    : lane.figure === 'hatMask' ? maskPace(hatTemplate.m, 0) : lane.figure === 'stabMask' ? keysPace : { gap: 0, ring: 0 };
  // A lane's percussion families are hits with no pitch by what the family is;
  // a candidate that declares no facts of its own (the record's shaker) is
  // read as one.
  // **On the floor** (round GA7, `ScenePolicy.floor`): a lane the floor holds
  // off withdraws every candidate, so its gate is held off in the plan; a lane
  // that asks for a ring withdraws the candidates whose measured ring falls
  // short of it, where one of its live candidates reaches it (where none does,
  // the lane draws as it would). Off the floor no lane is asked.
  const ringMs = (style as { ringMs?: Readonly<Record<string, number>> }).ringMs ?? {};
  const floorRing = new Map<Lane, number | null>();
  const ringAsked = (lane: Lane): number | null => {
    if (!floorRing.has(lane)) {
      const from = lane.floor?.ringFrom, w = laneWeight(lane, bias), list = lane.voices || [];
      floorRing.set(lane, from !== undefined && list.some((e, i) => w(e, i) > 0 && (ringMs[String(e.v)] ?? 0) >= from) ? from : null);
    }
    return floorRing.get(lane)!;
  };
  const offFloor = (lane: Lane, voice: string): boolean => {
    if (!sceneAt?.floor || !lane.floor) return false;
    if (lane.floor.off) return true;
    const from = ringAsked(lane);
    return from !== null && (ringMs[voice] ?? 0) < from;
  };
  // A family withdrawn by tempo, kit and bed (`withdrawnAtTempo`: the hand
  // drums off the sixteenth lane on a fast four-floor and over a continuous
  // bed, 10-13) is withdrawn under any scene. The bed is the drawn pad's own
  // facts, as the composition read them.
  const laneTheme = { kit: bias.derived.kit, bed: TIMBRES[drawn.pad] };
  const byTempo = (lane: Lane, voice: string): boolean => withdrawnAtTempo(lane, bpm, bias.spell as unknown as Record<string, number>, laneTheme).has(familyOf(voice));
  const laneWithdrawn: LaneWithdrawal | undefined = sceneAt
    ? (lane, voice) => byTempo(lane, voice) || offFloor(lane, voice) || withdrawnFrom(lane, 'drone-forward').has(familyOf(voice))
      && realWorld({ struck: TIMBRES[voice]?.struck ?? true, pitched: TIMBRES[voice]?.family === 'harmonic',
        hold: TIMBRES[voice]?.hold ?? 0, ...lanePace(lane) }, sceneAt)
    : (lane, voice) => byTempo(lane, voice);
  /** What a lane's notes carry on the floor: its level and its knob settings; nothing off it. */
  const onFloor = (lane: Lane): { gain?: number; knobs?: Record<string, number> } =>
    sceneAt?.floor && lane.floor ? {
      ...(lane.floor.db ? { gain: dbToGain(lane.floor.db) } : {}),
      ...(lane.floor.knobs ? { knobs: { ...lane.floor.knobs } } : {}),
    } : {};
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
  // ...and the lanes the place's support holds off by role (round DNB-3: the sixteenths at the fast broken places).
  const heldByPlace = (supportRow?.holdOff ?? []).flatMap((role) => style.lanes.filter((l) => l.role === role && l.gate).map((l) => l.gate as string));
  const silentDerived = [...new Set([...(DERIVED && !DERIVED.drumsOn ? percussionGates(style.lanes) : []), ...silencedBy(style, bias, laneWithdrawn), ...heldByPlace])];
  const silent = wanted.silent.length
    ? [...new Set([...silentDerived, ...wanted.silent])]
    : silentDerived;
  // **Harmony by place** (round GA6, `placeTables`): the chord walk of the
  // place nearest the birds and the tempo, the house's own place competing —
  // so at the house the mined walk is what it was. A cycle is drawn off a
  // stream of its own; the progression's own stream is read as before.
  const HARM = placesOn ? nearestEntry(HARMONY, bias.spell, bpm) : null;
  const cycle = HARM?.cycles ? dice('harmony-place').weighted(HARM.cycles.map((c) => ({ v: c, w: c.w }))) : null;
  let progression = makeProgression(dice('prog'), chordRoot, scaleName, S, CORPUS, {
    pedal: parts.pedalHarmony || !!HARM?.pedal,
    ...(cycle ? { degrees: cycle.degrees, loopBars: cycle.loop, changeEvery: cycle.every, ...(cycle.voicing ? { voicingStyle: cycle.voicing } : {}) } : {}),
    ...(cycle?.voicing ? {} : { voicingStyle }),
    degreeBias: shape.degreeBias,
    ...(cycle ? {} : { loopBars: shape.loopBars, changeEvery: shape.changeEvery }),
  });

  // The broken kit's own figure, where the spell derived one and the style has
  // a table of it. Off `<seed>::break`, a stream nothing else reads, and drawn
  // only when the kit really is broken — so the record, the house and every
  // four-floor theme consume nothing from it at all.
  // At a place with figures of its own (round DNB-4, `BreaksEntry`) the die
  // draws from the place's, on the same stream.
  const breaksPlaced = placesOn && kit === 'breaks' ? nearestEntry(PLACED.breaks, bias.spell, bpm) : null;
  const breakRow = breaksPlaced?.masks.length
    ? dice('break').weighted(breaksPlaced.masks.map((b) => ({ v: b as P.BreakRow, w: b.c })))
    : kit === 'breaks' && CAT.breakMasks && CAT.breakMasks.length
    ? dice('break').weighted(
        scaleWeighted((CAT.breakMasks as P.BreakRow[]).map((b) => ({ v: b, w: b.c })), bias, 'breakMasks')
      )
    : null;
  /** A break's mask for a bar: a two-bar mask plays its first sixteen on the even bars and the rest on the odd. */
  const breakBar = (mask: string, bar: number) => (mask.length > 16 ? mask.slice((bar % 2) * 16, (bar % 2) * 16 + 16) : mask);
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
  const EXPOSED: { fronts: readonly string[]; bedDb: number; frontDb?: number; sparseBedMostDb?: number } | null = CAT.exposed ?? null;
  /** The notes the exposed reed's bed laid: the bed bell reads them at the bed's full level (below). */
  const exposedBed = new Set<object>();

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
  // **The glide line by place** (round DNB-7, `src/glide.ts`): where the nearest
  // glide row carries a grammar, the bass lanes read `glide` — a home note held and
  // glided off — in place of a theme stated in the bass or the mined mask. A
  // recipe's own bass (a phrase family, a held line, a pinned part) and a tool's
  // hand on the theme keep theirs.
  const glideRow = placesOn ? nearestEntry(PLACED.glide, bias.spell, bpm) : null;
  // the row the theme draws among the place's, off a stream of its own (so no other die moves)
  const glideRecipe = glideRow?.rows?.length ? recipeById(new Rng(`${seed}::gliderow`).weighted(glideRow.rows), GLIDE_LIBRARY) : null;
  const glideWants = (glideRecipe?.wants?.motif as MotifBox | undefined)?.glide ?? null;
  // A row the library's turn drew (not a link's pin) gives its bass to the line and keeps
  // its drums (his word on the mined bass-led beats, 10-05: their bass figures play in
  // the sub and become a muddy floor).
  const glideOn = !!glideWants && (fromLibrary || (!parts.bassMotif && !parts.heldBass)) && request.pin?.role !== 'bassline'
    && request.motif?.register !== 'bass' && !forceMotif;
  // A held bass is the same kind of rewrite: the bass lanes read `heldBass`.
  const motifLanes = motifRoles.length || parts.heldBass || glideOn
    ? style.lanes.map((l) => (glideOn && l.role === 'bassline' ? { ...l, figure: 'glide' }
      : motifRoles.includes(l.role) ? { ...l, figure: 'motif' }
      : parts.heldBass && l.role === 'bassline' ? { ...l, figure: 'heldBass' } : l))
    : style.lanes;
  const rhythmMotion = rhythmPolicy ? prepareRhythmDevelopment(style,rhythmPolicy,parts.rhythm,
    [...rowRhythm.map(r=>r.lane.role),...(request.pin?[request.pin.role]:[]),
      ...(composition?.trace.recipes?.flatMap(r=>r.roles)??[])],recipe?.forbids??[],bpm,bias.spell as unknown as Record<string, number>,laneTheme) : null;
  const rhythm = rhythmMotion?.lanes ?? parts.rhythm;
  const LANES: readonly Lane[] = withRhythm(UPPER
    ? motifLanes.map(l => l.role === 'figure' ? { ...l, figure: 'recipeFigure' } : l)
    : motifLanes, rhythm);
  const TIMBRE = { leadTimbre, padTimbre, stabTimbre };
  // A tool's override on top of the draw (`lanes` above); absent, the draw.
  const ownVoices: Record<string, string> = laneVoices(rhythm.length ? { ...style, lanes: LANES as Lane[] } : style, seed, bias, laneWithdrawn,
    // house-v2's `hatRing` (round S6): an offbeat's grid is an eighth at this tempo
    switchOn(style, 'hatRing') && (style as { ringMs?: Record<string, number> }).ringMs
      ? { gridSeconds: 30 / bpm, ringMs: (style as { ringMs?: Record<string, number> }).ringMs!, roles: ['offbeat'] } : undefined);
  // Every swap below passes the post-selection admission (`passes`); a tool's
  // own hand on the lanes (`lanes`) is a tool's and is laid on as it asks.
  const admit = (at: string, swaps: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(swaps).filter(([lane, voice]) => passes(at, lane, voice, ownVoices[lane] ?? null)));
  const playing: Record<string, string> = {
    ...ownVoices,
    // **Who plays the backbeat when the kit is broken.** PLAN-MAGIC-V2 §6's
    // second line: *a kit whose snare is not the clap*. The list is the
    // strategy's — `catalogue.breaksBackbeatVoices` — and the draw is off a
    // stream of the lane's own with the kit's word on the end of it, so a lane
    // that never reaches it draws exactly the number it always drew. Every
    // other lane keeps the voice it was given: a break is a kick and a snare,
    // and the hats over one are still the hats of whatever room this is.
    ...(breakRow && CAT.breaksBackbeatVoices && CAT.breaksBackbeatVoices.length
      ? admit('broken backbeat', Object.fromEntries(
          style.lanes
            .filter((l) => l.role === 'backbeat' && l.voices)
            .map((l) => [
              l.id,
              String(new Rng(`${seed}::lane:${l.id}:breaks`).weighted(
                scaleWeighted([...CAT.breaksBackbeatVoices], bias, 'breaksBackbeatVoices')
              )),
            ])
        ))
      : {}),
    // **The bass's sound by place** (GA6): the nearest place's sound word, as
    // the voice the style resolves it to (`SOUNDS`); a word that resolves to
    // nothing yet (the kitchen's voice not landed) leaves the lane's own draw.
    ...(() => {
      const B = placesOn ? nearestEntry(BASS_SOUND, bias.spell, bpm) : null;
      const voice = B ? SOUNDS[B.sound] : null;
      return voice ? admit('bass sound', Object.fromEntries(style.lanes.filter((l) => l.role === 'bassline' && l.voices).map((l) => [l.id, voice]))) : {};
    })(),
    // **The stroke on a line by place** (round DNB-1): the impact lane's voice
    // swapped for the one the nearest place's sound word resolves to (the
    // crash, where the fast broken beat lands its lines).
    ...(() => {
      const G = placesOn ? nearestEntry(PLACED.glueSound, bias.spell, bpm) : null;
      const voice = G ? SOUNDS[G.sound] : null;
      return voice ? admit('glue sound', Object.fromEntries(style.lanes.filter((l) => l.figure === 'glue' && l.slot === G!.slot && l.voices).map((l) => [l.id, voice]))) : {};
    })(),
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
  /**
   * **An asked cell plays at its voice's own level** (round GA3, the loose hat
   * at -17.6 dB): a lane's trims are measured against its incumbent on its own
   * figure, so the ringing loose hat drawn onto the closed hats' lane was
   * trimmed 12.6 dB to sit like a closed hat — right for the mined hat mask,
   * wrong for a row's cell that asks for an open "tss" on every offbeat. A cell's
   * voice takes the trim the lane owning its level word gives it (the loose
   * hat's `hatOpen`: the open lane's -5.8), where that lane carries the voice;
   * every other voice keeps its own lane's.
   */
  const cellTrimOf = (lane: Lane, voice: string): Record<string, number> => {
    const word = (BY_NAME as Record<string, { level?: string }>)[voice]?.level;
    // The style's own table: a row's cells stand in lanes of their own, built
    // off the role's first lane, so the open lane is looked for where it is.
    const own = word && lane.gate !== word
      ? (style.lanes as Lane[]).find((l) => l.role === lane.role && l.gate === word && (l.voices || []).some((c) => c.v === voice)) : undefined;
    return trimOf(own ?? lane, voice);
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
  // **A section's harmonic roll** — which of the two harmonic layers it plays.
  // One harmonic layer at a time, most of the time, and which one it is
  // changes from section to section so the texture still moves. A stream of
  // its own per section index (`<seed>::harm:<index>`), so asking it twice —
  // once by the cut, before the bars are laid (round L2's `texture`), and once
  // per bar by the loop below — is the same answer and moves no other draw.
  // **The bed by place** (round EQ-2, `placeTables`): the nearest row of the
  // style's bed table, else the house's own (`bedHouse`). Its lean to two
  // harmonic layers is read here, where the layers are rolled; its levels,
  // its duck and its bell go into the theme's room below.
  const bedRow = placesOn ? nearestEntry(PLACED.bed, bias.spell, bpm) ?? PLACED.bedHouse ?? null : null;
  // The lean is the draw's and not a rule (ROADMAP 10-01, fewer hard rules):
  // the same one number off the same stream, measured against a higher
  // chance, so a section that rolled both still rolls both and only a
  // section that rolled one layer may roll two. Never where the drone is in
  // front: that scene's foreground is the drone.
  const bothChance = ONE_BED ? 0 : Math.min(1, D.bothHarmonicChance[density]
    + (bedRow?.bothLean && composition?.trace.scene !== 'drone-forward' ? bedRow.bothLean : 0));
  const harmonyOf = (index: number, continuity: HarmonicSupport | null) => {
    const hr = new Rng(`${seed}::harm:${index}`);
    // MEASURED: 40% of tracks run two harmonic layers, so it is 60/40 rather
    // than the 90/10 a strict reading of "minimal" would give — and a pluck
    // always gets its pad.
    const both = (padUnderStab && !ONE_BED) || hr.chance(bothChance);
    // When only one of them plays, it is usually the lead family's own role.
    const leadWins = hr.chance(TB.leadAlone);
    // **One bed** (round DNB-3, the support's `oneBed`): the two draws are made
    // as above and the layer is the place's — the figure where a part asks for
    // one, else the held layer; never both, never the stab mask alone.
    if (ONE_BED) return { rolledKeys: continuity?.figure ?? !!UPPER, rolledPad: continuity?.sustained ?? !UPPER };
    const rolledKeys = continuity?.figure ?? (both || (leadSustained ? !leadWins : leadWins));
    const rolledPad = continuity?.sustained ?? (both || !rolledKeys);
    return { rolledKeys, rolledPad };
  };
  // **The kinds of section as rows** (round T2, `src/sections.ts`): the form
  // draws by kind as it always has, and reads each kind's row for the
  // pattern. A row pinned by link plays for its kind; else the nearest
  // place's shares (`SECTIONS`) say which row of a kind, off the kind's own
  // stream, and a kind with one row in the running — every kind at the house —
  // spends no die. The record (no place tables) reads the style's own grammar.
  const sectionPlace = placesOn ? nearestEntry(PLACED.sections, bias.spell, bpm) : null;
  // **The form by row** (round DNB-6): where the nearest form row names track
  // rows with a form, the theme draws one among those whose window holds its
  // length, off a stream of its own; its order is laid in its blocks and the
  // section rows it prefers join the place's.
  const formPlace = placesOn ? nearestEntry(FORM, bias.spell, bpm) : null;
  const formRecipe = (() => {
    if (!formPlace?.rows?.length) return null;
    const length = fitBars ?? wantedBars;
    // the birds on the rows' weights (PLAN-UNIFY U2: Root leans the liquid forms toward the roller), ×1 at the tile
    const fit = formPlace.rows.map((e) => ({ v: recipeById(e.v, FORM_LIBRARY), w: formPlace.leans ? e.w * leanFactor(formPlace.leans, `row:${e.v}`, bias.spell) : e.w }))
      .filter((e): e is { v: Recipe; w: number } => !!e.v?.form && length >= e.v.form.fits[0] && length <= e.v.form.fits[1] && e.w > 0);
    return fit.length ? new Rng(`${seed}::formrow`).weighted(fit) : null;
  })();
  const formPrefers = formRecipe?.form?.prefers ? { ...(sectionPlace?.prefers ?? {}), ...formRecipe.form.prefers } : sectionPlace?.prefers ?? null;
  // **The form's alternatives** (liquid-space, 10-11, `FormBlock.choices`): a row that offers lengths and states has them
  // drawn once, each off a stream of its own (`resolveForm`), before its blocks are laid; a row that offers none is laid
  // at its own bars, as before.
  const formDraw = formRecipe?.form && (formRecipe.form.choices || formRecipe.form.states) ? resolveForm(seed, formRecipe.form) : null;
  // A pinned row is read against the grammar's own by its resolved definition
  // (R02), and the reading rides on the plan beside the pin, nowhere else.
  const sectionPin: SectionPin[] = [];
  const sectionRows = placesOn || request.section
    ? drawSectionRows(seed, SECTION_ROWS, style.sections, formPrefers, request.section, sectionPin) : new Map<string, Recipe>();
  const grammar = sectionRows.size ? grammarWith(style.sections, sectionRows, LANES.flatMap((l) => (l.gate ? [l.gate] : []))) : null;
  const { continuity, shaped, arrangement, bars, support } = planForm({ style, grammar, LANES, silent, laneOn, form, contourPolicy,
    figureSelected: !!UPPER || playedMotifs.some(m => m.register !== 'bass'), figureSustained: UPPER?.articulation === 'sustained',
    padUnderFigure: !UPPER && padUnderStab && !ONE_BED, leadSustained, bothChance, leadAloneChance: TB.leadAlone,
    parts, pinned: request.pin, composition, wantedBars, fitBars,
    // **The cut reads the texture** (round L2): a main's is its harmonic roll
    // — the sustained layer held or away, the figure on or not — and the
    // theme may solo where the bass's solo would ask it (`src/solo.ts`): the
    // slow side, no drums, and the solo's minutes at the tempo played. The
    // room is kept whether or not `bassSolo` is on, so the switch moves the
    // solo's bars and nothing of the form round them.
    texture: (index, continuity) => {
      const { rolledKeys, rolledPad } = harmonyOf(index, continuity);
      const keys = !!UPPER || rolledKeys;
      return { key: `${rolledPad ? 'held' : 'open'}${keys ? '+figure' : ''}`, open: !rolledPad };
    },
    soloBars: fitBars != null && fitBars >= soloMinBars(bpm)
      && spellVerdict(bias.spell, style).side === 'slow'
      && LANES.some((l) => l.role === 'kick' && !!l.gate && silent.includes(l.gate)) ? SOLO_SECTION_BARS : 0,
    // **The form in time** (round L3): one section per 22 bars at the tempo
    // the house would play this theme, so the house's window is its 22 bars
    // and a theme at half the tempo takes a section per eleven.
    windowBars: sectionWindowBars(bpm, houseTempoOf(bpm, DERIVED)),
    dArr,
    // **Form by place** (GA6): the section orders of the nearest place, in
    // place of the mined DJ orders; the house's own place, and a row with no orders, keeps the corpus.
    // A row that states its sections' lengths (round DNB-4) draws them there in
    // place of the corpus's windows; the scaling to the theme's length is the same.
    // A form row drawn (round DNB-6) plays its own order in its own blocks.
    CORPUS: (() => { const F = formPlace;
      if (formRecipe?.form) return { ...CORPUS, sectionOrders: [formRecipe.form.order], sectionBlocks: { bars: formDraw?.bars ?? formRecipe.form.bars, stretch: formRecipe.form.stretch } };
      return F && F.orders.length ? { ...CORPUS, sectionOrders: F.orders, ...(F.sectionBars ? { sectionBars: { ...CORPUS.sectionBars, ...F.sectionBars } } : {}) } : CORPUS; })(),
    sectionBars: RANGE.sectionBars, dice });
  // **The sparse keys and the harmony they set** (liquid-space round 1, `src/keys-phrase.ts`):
  // where the nearest keys row admits the part, a theme whose harmony is the place's own
  // (no recipe's pedal) draws one phrase off a stream of its own, its keys land where the
  // whole track's density row says, and the chords change only there: the progression
  // becomes the phrase's two chords by bar (`Progression.states`), which the bed, the bass's
  // home and every reader of `chordAtBar` take. Every other theme keeps its loop.
  const keysRow = placesOn && !parts.pedalHarmony ? nearestEntry(PLACED.keys, bias.spell, bpm) : null;
  const keysPlan: KeysPlan | null = keysRow?.keys ? planKeys({ seed: String(seed), root: rootPc, scale, bars, barSeconds,
    sections: arrangement.sections, choice: keysRow.keys, spell: bias.spell as unknown as Record<string, number>, padLow: S.register.padLow, padHigh: S.register.padHigh }) : null;
  if (keysPlan) {
    const asChord = (c: KeysChord): Chord => {
      const notes = [...c.plain.left, ...c.plain.right].sort((a, b) => a - b);
      const at = scale.indexOf((((c.rootPc - rootPc) % 12) + 12) % 12);
      const degree = at < 0 ? 0 : at;
      return { degree, size: notes.length, startBar: 0, bars, notes, voicing: [...c.plain.right], rootMidi: chordRoot + ((((c.rootPc - rootPc) % 12) + 12) % 12),
        label: c.symbol, roman: DEGREE_NAMES[degree], bassPc: c.bassPc };
    };
    const chords = keysPlan.chords.map(asChord);
    progression = { ...progression, changeEvery: bars, loopBars: bars, chords, states: keysPlan.states.map((st) => ({ bar: st.bar, chord: chords[st.chord] })) };
  }
  // **The theme's time and its phrase map** (PLAN-UNIFY §2.2 and §2.5, step 1): the felt pulse and the phrase the
  // nearest place pins (or the ring's own rule, Loom's target in seconds), and the track cut into phrases with its
  // structural arrivals, from the form and the harmony as they stand now — before the part planners. Written to the
  // plan; read by the producer (its phrase, and its arrivals where no keys plan runs). house-v1 runs none of it.
  const time: MusicalTime | null = placesOn ? musicalTime({ bpm, spell: bias.spell as unknown as Record<string, number>, entry: nearestEntry(PLACED.time, bias.spell, bpm) }) : null;
  const phraseMap: PhraseMap | null = time ? planPhraseMap({ time, bars, sections: arrangement.sections, landings: keysPlan?.landings ?? null,
    chordAt: (b) => chordAtBar(progression, b).label }) : null;
  /** Sixteenths from `step` (from the theme's start) to the next chord change, where the keys set the harmony; else none. */
  const toChange = (step: number): number => {
    if (!keysPlan) return Infinity;
    const next = keysPlan.states.find((st) => st.bar * 16 > step);
    return next ? next.bar * 16 - step : Infinity;
  };

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
  /** where the line's last note ended, in theme seconds, at the length it was written with */
  let lastBassEnd = -Infinity;
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
    arrangement, silent, at, beat, barSeconds, laneOn, voiceOf, trimOf, cellTrimOf, push, characters, pinned: request.pin, selectedRecipeFor };
  const motifPerformer: MotifPerformer = { seed, S, progression, bassDevelopment, parts, arrangement, bars, beat, barSeconds,
    at, laneOn, voiceOf, push, bassChanges, ownFigure, pianoHall, pianoDelay, stabTimbre, tremolo, fx, stabWet };
  const heldBassUntil = new Map<Lane, number>();
  // **The theme's glide lines** (round DNB-7): home is the key's own note folded into
  // the line's register, the room over it the register's; the first line plays to the
  // first breakdown after the first drop, the second (the switch-up, off a stream of its
  // own, the home kept) from what follows it.
  const glideHome = (() => {
    const pc = ((progression.root % 12) + 12) % 12;
    let m = pc + 12 * Math.round((S.register.subCenter - 2 - pc) / 12);
    while (m < S.register.subLow) m += 12;
    return m;
  })();
  // 10-06, hands-on: the line phrased (`src/glide.ts`), its statement and the switch-up's
  const PHRASED = glideOn ? [rollPhrased(String(seed)), rollPhrased(String(seed), ':switch')] : [];
  // the theme's riff (liquid-riffs-2, 10-08): one of the nearest riff entry's rows, by weight, off a stream of its own;
  // the switch-up rolls the same row's grammar again
  const RIFF = glideOn ? drawRiff(String(seed), placesOn ? nearestEntry(PLACED.riff, bias.spell, bpm) : null) : null;
  const MINED = RIFF ? [rollMined(RIFF, String(seed)), rollMined(RIFF, String(seed), ':switch')] : [];
  // the phrase's held runs that press the kick's low duck, in theme seconds, and how deep (the riff row's `press`)
  const pressed: Array<{ from: number; to: number; db: number }> = [];
  // a scale degree over a home in the key, in semitones
  const degreeSemis = (home: number, degree: number): number => {
    const key = ((progression.root % 12) + 12) % 12;
    const idx = scale.indexOf((((home - key) % 12) + 12) % 12);
    if (idx < 0) return [0, 2, 3, 5, 7, 8, 10, 12][((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);
    const at = idx + degree, oct = Math.floor(at / 7);
    return scale[((at % 7) + 7) % 7] + 12 * oct - scale[idx];
  };
  // a line off the pedal keeps its home on each chord's own root, in the same room
  const glideHomeAt = (c: BarContext) => {
    // the harmony's own home for the line under this chord (the phrase row's `bass`), where the keys set it
    if (c.chord.bassPc != null) return glideHome + ((c.chord.bassPc - glideHome % 12 + 18) % 12) - 6;
    if (glideWants?.pedal !== false) return glideHome;
    const pc = ((c.chord.rootMidi % 12) + 12) % 12;
    return glideHome + ((pc - glideHome % 12 + 18) % 12) - 6;
  };
  const glideSwitchAt = (() => {
    const secs = arrangement.sections;
    const d1 = secs.findIndex((x) => x.kind === 'drop');
    const bd = d1 < 0 ? -1 : secs.findIndex((x, i) => i > d1 && x.kind === 'breakdown');
    const back = bd < 0 ? -1 : secs.findIndex((x, i) => i > bd && ['drop', 'main', 'groove'].includes(x.kind));
    return back < 0 ? Infinity : back;
  })();
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
        ? P.breakHits(c.r, breakBar(breakRow.m, c.bar), { ghost: 0.55, wobble: 0.01 })
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
            // under a drone on the floor, the soft kick (`Lane.floor`)
            ...onFloor(lane),
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
      if (shape.sixteenths === false && !leanSixteenths) return;
      if (shape.sixteenths !== true && !D.sixteenthHats[density]) return;
      const hits = P.sixteenthPattern(c.r, sixteenthTemplate, { settings: S });
      const leaned = (lane: Lane, voice: string): Record<string, number> => {
        const own = trimOf(lane, voice);
        return leanSixteenths ? { gain: (own.gain ?? 1) * leanGain } : own;
      };
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
            ...leaned(lane, voice),
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
        ? P.breakHits(c.r, breakBar(breakRow.s, c.bar), { ghost: 0.45, wobble: 0.04 })
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
      // where the keys set the harmony, the bed is theirs: common tones held, one voice moving, thinned round a landing
      if (keysPlan) { if (c.padSection) for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) (ambientPlan ? ambientLane : bedLane)(lane, c); return; }
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
    // **The glide line** (round DNB-7, `src/glide.ts`; the riff's phrase since 10-07):
    // in a drop, the drawn riff row's phrase of held runs, each one note whose pitch
    // follows its path (`bend`) through the line's register; outside the drops the
    // phrased cells (a build's pickup, an outro's bars).
    glide(g, c) {
      if (!PHRASED.length || !RIFF) return;
      const second = c.section.index >= glideSwitchAt;
      const line = second ? PHRASED[1] : PHRASED[0];
      const inSection = c.bar - c.section.startBar;
      const sec = arrangement.sections[c.section.index];
      const drop = c.section.kind === 'drop' || c.section.kind === 'main' || c.section.kind === 'groove';
      // how the line plays: the riff row's `play` (10-07); the register's ceiling is the room's, the floor the row's
      const PL = RIFF.play, ART = RIFF.articulation, PHRASE = RIFF.phrase, ceiling = S.register.subCeiling + PL.ceilingOver;
      const accentAt = (s: number): number => (PL.accent.steps.includes(s) ? PL.accent.on : PL.accent.off);
      // the pair on the grid, where the row's `play.pairClock` states it: a voice that declares the pair's rate and
      // phase takes the grid's rate and the phase that puts its troughs where the row says, from the note's theme
      // time; the rate rides the grid with the note on a tempo ride (`gridRates`). A rate the voice's control would
      // clamp is not written: its troughs would leave the grid, and the pair keeps its own spacing there.
      const onClock = (e: { voice: string; t: number }): Record<string, unknown> => {
        const controls = BY_NAME[e.voice]?.controls, hz = controls?.subBeatHz, ph = controls?.subBeatPhase;
        if (!PL.pairClock || !hz || !ph) return {};
        const at = pairClockAt(PL.pairClock, beat, e.t);
        if (at.hz >= hz.min && at.hz <= hz.max) return { subBeatHz: at.hz, subBeatPhase: at.phase, gridRates: ['subBeatHz'] };
        clampedClock(RIFF.id, e.voice, at.hz, hz);
        return {};
      };
      if (drop) {
        // A phrase run is emitted once, with its entire path across bar lines.
        // Continued bars must not restart either its envelope or its body.
        const step = barSeconds / 16, home = glideHomeAt(c);
        const floor = home >= PL.floor && home <= ceiling ? Math.min(PL.floor, home - ART.lowerNeighbor) : PL.floor;
        const fold = (semis: number): number => foldInto(home + semis, floor, ceiling);
        const clipped = (path: number[], end: number): number[] => {
          const out = path.slice(0, 2);
          for (let i = 2; i < path.length; i += 2) {
            if (path[i] < end) { out.push(path[i], path[i + 1]); continue; }
            const u = (end - path[i - 2]) / (path[i] - path[i - 2]);
            out.push(end, path[i - 1] + u * (path[i + 1] - path[i - 1]));
            return out;
          }
          out.push(end, path[path.length - 1]);
          return out;
        };
        // the phrase's gestures at their knobs (the liquid knobs, 10-07; the liquid desk, 10-08): V's at the defaults,
        // where `x × 1` and `g × 1 + 0` are the identity — the scoop of the pitch knots' offsets (Zephyr's), the
        // swell of the level knots (Tide's), the pair on the holds (Tide's), the edge of the body accents, the press
        // (Ember's), and the after-kick gesture's flick and sag at theirs
        const K = PHRASE.knobs;
        const scoop = knobAt(K.scoop), swell = knobAt(K.swell), pairOnHold = knobAt(K.pairOnHold), edge = knobAt(K.edge), pressDb = knobAt(K.pressDb);
        const afterKick = PHRASE.afterKick ? afterKickAt(PHRASE.afterKick) : null;
        // the riff's level against the place's line (its `trimDb`), on each note's gain; none on V's
        const trim = PHRASE.trimDb ? 10 ** (PHRASE.trimDb / 20) : null;
        // **The plan's phrase** (liquid-space, 10-11): a half-time phrase plays the bass's half-time sentence on the
        // riff's own voice and register (`BassAnswersRow.halfTime`); a phrase whose end the plan answers rests or glides
        // there, run by run, whatever riff the theme drew. Decided before the kit pass, from the same plan the kit plays.
        const halfTime = !!BASS_ANSWERS && barState?.[c.bar] === 'half-time';
        const inPhrase = inSection - Math.floor(inSection / 8) * 8;
        const answer = devPlan && BASS_ANSWERS && !halfTime ? devPlan.bass.find((b) => b.phrase === c.bar - inPhrase) ?? null : null;
        const sentence = halfTime ? (BASS_ANSWERS!.halfTime.find((h) => h.id === devPlan?.halfTimeBass) ?? BASS_ANSWERS!.halfTime[0]).phrase : null;
        const phraseRuns = sentence ? minedPhraseRuns(sentence, MINED[0], inSection) : minedPhraseRuns(PHRASE, second ? MINED[1] : MINED[0], inSection);
        for (const written of phraseRuns) {
          // after the kick (liquid-k10): a run held flat and without its pair from the kick through the snare flicks
          // on the kick and sags through the snare, riding its own path; the sag is lifted over the register's floor.
          // It is judged on the written path and joins the residual, so the scoop below scales it with the rest
          let run = afterKick && !halfTime ? withAfterKick(written, afterKick, PL.floor - afterKick.underFloorSt - fold(0)) : written;
          // ...and never across a chord change, where the keys set the harmony: a held run stops where the home moves
          let length = Math.min(run.len, ((sec?.bars ?? 0) - inSection) * 16 - run.step, toChange(c.bar * 16 + run.step));
          if (answer) {
            // the run's start in the plan's phrase, in sixteenths: a rest ends it on the last bar's rest step (and a run
            // that would start after it is not played: the next phrase enters fresh); a glide rises across the gap
            const from = inPhrase * 16 + run.step;
            if (answer.mode === 'rest') {
              const rest = 7 * 16 + (answer.step ?? 12);
              if (from >= rest) continue;
              length = Math.min(length, rest - from);
            } else {
              const a = 7 * 16 + (answer.fromStep ?? 8) - from, b = Math.min(length, 8 * 16 - from);
              if (b > Math.max(0, a)) run = withEndGlide(run, Math.max(0, a), b, answer.semis ?? 5);
            }
          }
          if (length <= 0) continue;
          const dur = length * step - PL.phraseGapS;
          if (dur < 0.05) continue; // Do not let the voice's minimum extend past a section boundary.
          // the run's knots, in sixteenths from its start, as seconds; the pitch over the run's own note. The
          // register is chosen once: home folds as the line's notes do, and the anchors keep their rolled
          // intervals over it, so a gesture between two notes is never turned over by folding them apart, and
          // the residual rides its own anchor, never a knot folded on its own (liquid-fix, 10-07). The scoop
          // scales the residual alone, never the anchors (liquid-desk, 10-07)
          const folded = fold(0), base = folded + run.anchors[0][1];
          const bend = clipped(runPitch(run, scoop).flatMap(([at, semis]) => [at * step, folded + semis - base]), dur);
          const level = clipped(run.level.flatMap(([at, gain]) => [at * step, Math.max(0, Math.min(2, gain * swell + (1 - swell)))]), dur);
          const pair = clipped(run.pair.flatMap(([at, share]) => [at * step, share * pairOnHold]), dur);
          const bodyCurve = run.body ? clipped(run.body.flatMap(([at, gain]) => [at * step, Math.max(0, Math.min(8, gain * edge + (1 - edge)))]), dur) : null;
          // the line steps aside under each backbeat it spans, across its bar lines
          const dips: number[] = [];
          for (let bar = 0; bar * 16 < run.step + length; bar++) for (const s of PL.dips.steps) {
            const hit = bar * 16 + s;
            if (hit >= run.step && hit < run.step + length) dips.push(+((hit - run.step) * step - PL.dips.earlyS).toFixed(4), PL.dips.db);
          }
          const entrance = minedEntrance(RIFF, run.step, 0);
          if (run.press) pressed.push({ from: at(c.bar, run.step), to: at(c.bar, run.step) + dur, db: pressDb });
          for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) {
            const from = events.length;
            bassChanges(lane, c, [{ step: run.step, interval: 0 }], [accentAt(run.step)], null, { midis: [base], seconds: [dur] });
            for (let k = from; k < events.length; k++) {
              const controls = BY_NAME[events[k].voice]?.controls, extent = pairOf(events[k].voice)?.level;
              // held under the voice's own ceiling for a pair, where a share over one would ask past it
              const ceiling = controls?.subBeatLevel?.max ?? 0.75;
              const subBeatCurve = typeof extent === 'number' && extent > 0 ? pair.map((v, i) => i % 2 ? Math.min(ceiling, v * extent) : v) : null;
              // the contours resume where a seek finds the note held (`curveDuration`, the note's whole length)
              events[k].p = { ...events[k].p, bend, slideFrom: undefined, dips, release: PL.release.resting,
                directEnvelope: { kind: 'points', curve: level }, curveDuration: dur,
                ...(entrance && controls?.subEntryLevel ? entrance : {}), ...(subBeatCurve ? { subBeatCurve } : {}),
                ...(bodyCurve ? { bodyCurve } : {}), ...(trim ? { gain: (events[k].p.gain ?? 1) * trim } : {}), ...onClock(events[k]) };
            }
          }
        }
        return;
      }
      // the phrased cells where the line plays outside the drops (a build's pickup, an outro's bars); the drops play the phrase above
      const notes = phrasedInSection(line, c.section.kind, inSection, sec?.bars ?? 0);
      if (!notes.length) return;
      const step = barSeconds / 16;
      const home = glideHomeAt(c);
      const midis = notes.map((n) => foldInto(home + degreeSemis(home, n.degree), PL.floor, ceiling));
      // a note that slides in: the one before it holds to it, so the voice glides there
      // legato inside a phrase: a note holds to the next one when the gap is a beat or less, so the sub is one line, not a pulse
      const seconds = notes.map((n, i) => {
        const next = notes[i + 1];
        const held = next?.slide ? (next.step - n.step) * step + PL.legato.slideOverS
          : next && next.step - (n.step + n.len) <= PL.legato.gapSteps ? (next.step - n.step) * step * PL.legato.joined
          : n.len * step * PL.legato.detached;
        // never across a chord change, where the keys set the harmony
        return Math.min(held, toChange(c.bar * 16 + n.step) * step);
      });
      const changes = notes.map((n) => ({ step: n.step, interval: 0 }));
      const accents = notes.map((n) => accentAt(n.step));
      const from = events.length;
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) bassChanges(lane, c, changes, accents, null, { midis, seconds });
      if (PL.pairClock) for (let k = from; k < events.length; k++) events[k].p = { ...events[k].p, ...onClock(events[k]) };
    },

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

  // How often the root walks, by the nearest place (none at the house).
  const walkRow = placesOn ? nearestEntry(PLACED.walk, bias.spell, bpm) : null;
  const walks = new Map<number, number>();
  function walkOfBar(c: BarContext): number {
    if (!walkRow || !(walkRow.rate > 0)) return 0;
    let w = walks.get(c.bar);
    if (w === undefined) {
      let b = c.bar + 1;
      while (b < c.bar + 16 && chordAtBar(progression, b) === c.chord) b++;
      w = walkAt(String(seed), c.bar, walkRow.rate, c.chord, chordAtBar(progression, b), scale, c.chordChanged);
      walks.set(c.bar, w);
    }
    return w;
  }

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
    // The walking root (round DNB-2, `src/walk.ts`): the bar's root notes
    // moved inside a chord that holds, where the place walks — the figure's
    // other notes (its fifth, its pickup off another degree) stay where the
    // chord puts them, so the line stays in the key; a row's own phrase and a
    // held note across the chord keep the chord's root.
    const semis = !phrase && heldSeconds == null ? walkOfBar(c) : 0;
    changes.forEach((ch, i) => {
      const nextStep = i + 1 < changes.length ? changes[i + 1].step : 16 + (changes[0]?.step ?? 0);
      const dur = phrase?.seconds[i] ?? heldSeconds ?? Math.max(0.09, ((nextStep - ch.step) / 4) * beat);
      const midi = phrase?.midis[i] ?? (semis && !(ch.interval ?? 0)
        ? walked(P.bassNote(c.chord, ch, S), semis, S.register.subLow, ch.octave ? S.register.subCeiling : S.register.subHigh)
        : P.bassNote(c.chord, ch, S));
      const previous = phrase ? lastRecipeBassNote.get(lane) : undefined;
      const previousMidi = phrase ? previous?.p.midi ?? null : lastBassMidi;
      const time = at(c.bar, ch.step);
      // **A slide is from a note the line is still on** (the deep review of
      // 10-08, B13): the bass slid in from whatever note it last played, and
      // where it had rested since — a section without it, a breakdown — that
      // was a note 8 to 16 bars gone. The note before has to have ended no
      // more than a beat before this one starts; the line's own rests (a
      // sixteenth, a step off the bar line) still slide.
      const near = previousMidi != null && Math.abs(midi - previousMidi) <= 12
        && (phrase ? !!previous && time <= previous.t + Number(previous.p.dur) + 1e-6 : time <= lastBassEnd + beat + 1e-6);
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
      lastBassEnd = time + dur;
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

  /**
   * **The bed where the keys set the harmony** (liquid-space round 1, manual A1): the
   * plan's voices (`KeysPlan.bed`), each held from where it starts to where it moves,
   * so a common tone runs on across a chord change and only the voice that moves
   * strikes again; round a landing the moving voice leaves before the pickup and comes
   * back after the strike. A voice is written where it starts, or on the bar the bed
   * comes back in after a rest; it runs to its end or to the last bar of the run of
   * bars whose grammar keeps the bed, whichever is first. The same sound, the same
   * sends and the same room as the drone's chord.
   */
  const bedWritten = new Map<Lane, Map<number, number>>();
  function bedLane(lane: Lane, c: BarContext) {
    const voice = voiceOf(lane);
    const step16 = barSeconds / 16;
    let written = bedWritten.get(lane);
    if (!written) bedWritten.set(lane, (written = new Map()));
    // the run of bars the bed's own gate keeps, from this bar on
    let runEnd = c.bar + 1;
    while (runEnd < bars && !!layersAtBar(arrangement, runEnd).layers[droneGate as string]) runEnd++;
    const lo = c.bar * 16, hi = lo + 16;
    for (const [k, span] of keysPlan!.bed.entries()) {
      if (span.to <= lo || span.from >= hi) continue;
      if ((written.get(k) ?? -1) > lo) continue;
      const from = Math.max(span.from, lo);
      const to = Math.min(span.to, runEnd * 16);
      if (to - from < 2) continue;
      written.set(k, to);
      const dur = (to - from) * step16;
      const release = Math.min(span.release ?? 1.6, dur * 0.8);
      push(voice, from * step16, {
        midi: span.midi,
        dur: Math.max(0.05, dur),
        vel: 0.75 - span.voice * 0.04,
        timbre: padTimbre,
        attack: FIG.slowAttack.includes(padTimbre) ? Math.min(SG.swellAttack + span.voice * 0.09, dur * 0.45) : undefined,
        release,
        spread: padSpread,
        reverb: padWet,
        delay: padDelay,
      }, { bar: Math.floor(from / 16), step: from % 16, layer: layerOf(voice), note: noteName(span.midi) });
    }
  }

  /**
   * **The bed in gestures** (liquid-ambient, `src/ambient-plan.ts`): each of the ambient plan's notes where it starts,
   * at its own length, attack, release and level, opening over its own crest (its entrance swell) under a darker corner,
   * in its final register — the bed's octave rule leaves these where they are (`ambientNotes`). Clipped, as the bed
   * always was, to the run of bars the bed's lane is on.
   */
  const ambientNotes = new Set<PlanEvent>();
  const ambientSwell = new Map<PlanEvent, { db: number; oct: number; over: number }>();
  function ambientLane(lane: Lane, c: BarContext) {
    const voice = voiceOf(lane);
    const step16 = barSeconds / 16;
    let runEnd = c.bar + 1;
    while (runEnd < bars && !!layersAtBar(arrangement, runEnd).layers[droneGate as string]) runEnd++;
    const lo = c.bar * 16, hi = lo + 16;
    for (const n of ambientPlan!.bed) {
      if (n.from < lo || n.from >= hi) continue;
      const to = Math.min(n.to, runEnd * 16);
      if (to - n.from < 2) continue;
      const dur = (to - n.from) * step16;
      push(voice, n.from * step16, {
        midi: n.midi, dur, vel: n.vel, gain: n.gain, timbre: padTimbre, attack: Math.min(n.attack, dur * 0.8), release: n.release,
        cutoffMul: n.cutoffMul, swell: { ...n.swell, over: Math.min(n.swell.over, dur * 0.8) }, spread: padSpread, reverb: padWet, delay: padDelay,
      }, { bar: Math.floor(n.from / 16), step: n.from % 16, layer: layerOf(voice), note: noteName(n.midi) });
      const e = events[events.length - 1];
      ambientNotes.add(e);
      ambientSwell.set(e, e.p.swell as { db: number; oct: number; over: number });
    }
  }

  // **The small things inside the sections** (round DNB-1, `subSections`):
  // switch-ups, turnarounds, fills and drop-outs, by place, off streams of
  // their own. Planned before the bars, played after every figure is laid
  // (`playSubSections`, before `treat`), and named on the readout where heard.
  // A complete arrangement (a track recipe that writes its own rhythm cells)
  // keeps them, as it refuses every automatic overlay: it draws none.
  // Which figure of a kind plays is a draw among the treatment rows
  // (`recipes/treatments/`, round T1); a treatment row pinned by link plays
  // its own kind on every bar the kind's rule admits, the other kinds silent.
  const ownCells = recipe?.scope === 'track' && Object.keys((recipe.wants as { rhythm?: object } | undefined)?.rhythm ?? {}).length > 0;
  // the birds on the rates (PLAN-UNIFY U2: Veil on the fill at a section's line at the fast places), held under one
  const subEntry = placesOn ? nearestEntry(PLACED.subSections, bias.spell, bpm) : null;
  const subEntryRates = subEntry?.leans ? { ...subEntry.rates, fill: Math.min(1, subEntry.rates.fill * leanFactor(subEntry.leans, 'fill', bias.spell)) } : subEntry?.rates;
  const placeRates = switchOn(style, 'subSections') && !ownCells
    ? subEntryRates ?? PLACED.subSectionsHouse ?? null
    : null;
  // a pinned switch-up's spans where the place names none: the row's own, else every span the style's tables name
  const pinnedSpans = (): number[] => request.treatment?.place?.bars?.length ? [...request.treatment.place.bars]
    : [...new Set([...(PLACED.subSections ?? []).flatMap((e) => e.rates.switchBars), ...(PLACED.subSectionsHouse?.switchBars ?? [])])].sort((a, b) => a - b);
  const subRates = placeRates && request.treatment ? pinnedRates(placeRates, request.treatment.applies!, pinnedSpans()) : placeRates;
  const subsDrawn: SubSection[] = subRates
    ? planSubSections(seed, arrangement, subRates, { drums: DERIVED ? DERIVED.drumsOn : true, broken: !!breakRow, pinned: !!request.treatment,
      spell: bias.spell, bpm }, request.treatment ? [request.treatment] : TREATMENT_ROWS)
    : [];
  // **The phrase development by place** (liquid-space, 10-11, `src/phrase-development.ts`): where the nearest place
  // names a development row and its kit plays, the track is planned phrase by phrase before a bar is laid — the
  // form's states, one move a phrase, the bass's answers, one auxiliary part, the surface. The planner owns the
  // moves inside the passages: the small things it does not (a turnaround, a hat variation, a drop-out at a line
  // inside a section) come off the sub-sections, drawn as before so no stream moves; a section line's own fill and
  // drop-out stay, and own their bar. A recipe's theme (a pin, a library turn) and every other place keep the old path.
  const drumsPlaced = placesOn ? nearestEntry(PLACED.drums, bias.spell, bpm) : null;
  const KIT: Kit | null = drumsPlaced?.kit ? kitOf(drumsPlaced.kit) : null;
  const devEntry = placesOn ? nearestEntry(PLACED.development, bias.spell, bpm) : null;
  const devRow = developmentRowOf(devEntry?.row);
  // **Each grammar is admitted by what it needs** (PLAN-UNIFY §0b), never by another grammar's admission: the phrase
  // development plans the kit's phrases (it needs the place's kit); the ambient plan needs the keys' harmony and a held
  // part to lay its bed on; the ambient voices need the keys' harmony; the written passage and the producer need a
  // first drop to count from and arrivals to answer (the keys' landings, else the phrase map's). A pinned recipe is
  // its own and plays none of them; a library turn keeps the place's kit and line (`fromLibrary`), so its phrases are
  // planned too, whether or not its row's own cells leave room for the small things.
  const ownTheme = !recipe || fromLibrary;
  const has: Record<GrammarNeed, boolean> = { kit: !!KIT };
  const needsMet = (needs: readonly GrammarNeed[] | undefined) => (needs ?? []).every((n) => has[n]);
  const devOn = !!devRow && !!KIT && ownTheme;
  const lineEnds = new Set(arrangement.sections.map((s) => s.startBar + s.bars - 1));
  const subsAtLines: SubSection[] = devOn
    ? subsDrawn.filter((x) => x.kind === 'fill' || (x.kind === 'drop-out' && lineEnds.has(x.startBar + x.bars - 1)))
    : subsDrawn;
  const auxAdmitted = !!supportRow?.admits?.includes('auxiliary');
  const AUX = devOn && auxAdmitted ? auxOf(devEntry?.aux) : null;
  // the surface: the place's row, or one of its rows by weight, drawn once a track off a stream of its own
  const surfaceRows = devEntry?.surface;
  const SURFACE = devOn ? surfaceOf(typeof surfaceRows === 'string' || surfaceRows == null ? surfaceRows
    : new Rng(`${seed}::surface`).weighted(surfaceRows.map((x) => ({ v: x.v, w: x.w })))) : null;
  const BASS_ANSWERS = devOn ? bassAnswersOf(devEntry?.bass) : null;
  // **The ambient plan** (liquid-ambient, `src/ambient-plan.ts`), in the manual's order: after the form and the keys'
  // harmony, before the drums — the chapters, the reservations, the featured-detail slots and the bed's gestures. The
  // 8-bar planner then takes the chapters' policy and leaves the required motif slots to the detail.
  const bedLaneOf = firstByRole('sustained');
  const bedVoice = bedLaneOf ? voiceOf(bedLaneOf) : null;
  const ambientPlan: AmbientPlan | null = ownTheme && keysPlan && devEntry?.ambient && needsMet(devEntry.ambient.needs) && bedVoice ? (() => {
    const P0 = (BY_NAME[bedVoice]?.row?.parameters ?? {}) as Record<string, unknown>;
    const num = (k: string, d: number) => (typeof P0[k] === 'number' ? P0[k] as number : d);
    return planAmbient({ seed, arrangement, bars, barSeconds, keys: keysPlan, spell: bias.spell as unknown as Record<string, number>, rows: devEntry.ambient!,
      form: formRecipe ? { id: formRecipe.id, bars: formDraw?.bars ?? formRecipe.form?.bars ?? null } : null,
      // the bars the bed's lane can sound, as the bar loop will decide them: its gate on, and under one bed not given to the figure
      bedOn: (bar) => { const L = layersAtBar(arrangement, bar).layers;
        return !!L[droneGate as string] && !(ONE_BED && !!UPPER && !!L[figureGate as string]) && !(support?.reserved[bar]) && (!support || support.until[bar] > bar * 4); },
      voice: bedVoice,
      envelope: { attack: num('attack', 0.5), decay: num('decay', 1.2), sustain: num('sustain', 0.75), release: num('release', 0.9) } });
  })() : null;
  // **The ambient voices** (liquid-ambient, `src/ambient-voices.ts`): where the place lays them, the motif's statements,
  // a thunder and the fillers take the one featured-detail slot before the phrases are planned, and their windows ride
  // in as reserved (`detail`), so no conspicuous drum answer is drawn while one speaks; realised after the kit, under the budget
  const ambientAt = placesOn ? nearestEntry(PLACED.ambientVoices, bias.spell, bpm)?.ambient ?? null : null;
  const ambientEntry = ambientAt && needsMet(ambientAt.needs) ? ambientAt : null;
  const voicesPlan: AmbientVoicesPlan | null = ownTheme && keysPlan && ambientEntry ? planAmbientVoices({ seed: String(seed), entry: ambientEntry,
    sections: arrangement.sections, bars, barSeconds, keys: keysPlan, spell: bias.spell as unknown as Record<string, number>,
    ...(ambientPlan ? { slots: voicesSlots(ambientPlan, arrangement.sections) } : {}) }) : null;
  // the reserved windows: the keys' pickups and landings (`keysPlan.reserved`, in sixteenths), the details the ambient plan
  // reserved and the ones the voices took
  const reserved: ReservedWindow[] = [...(keysPlan?.reserved ?? []), ...(ambientPlan ? detailWindows(ambientPlan) : []), ...(voicesPlan?.windows ?? [])];
  const devPlan: DevelopmentPlan | null = devOn ? (() => {
    const lifts = kitLiftRuns(KIT!, arrangement.sections);
    const T = drumsPlaced?.throws;
    // the birds on the plan (PLAN-UNIFY U2: Veil on the effect moves, the throws and the chapters' deadline), ×1 at the tile
    const leans = devEntry?.leans;
    const throwLean = T && drumsPlaced?.leans ? leanFactor(drumsPlaced.leans, 'throws', bias.spell) : 1;
    const chapters = ambientPlan ? chapterPolicy(ambientPlan, barSeconds, bars) : null;
    return planDevelopment({
      seed, row: devRow!, lean: leans ? { ...(devEntry?.lean ?? {}), effect: (devEntry?.lean?.effect ?? 1) * leanFactor(leans, 'effect', bias.spell) } : devEntry?.lean, arrangement,
      form: formRecipe ? { id: formRecipe.id, drawn: formDraw?.drawn ?? [], features: formRecipe.form?.features } : null,
      sectionStates: formDraw?.states ?? [],
      kitAnswers: Object.keys(answersOf(KIT!)),
      aux: AUX, surface: SURFACE, bass: BASS_ANSWERS, reserved,
      endThrowAt: (bar) => !!T && (bar + 1) % T.everyBars === 0 && new Rng(`${seed}::throw:${bar}`).chance(Math.min(1, T.chance * throwLean)),
      liftTurns: new Set(lifts.flatMap((r) => [r.eighthsFrom, r.mid])),
      liftSpans: lifts.map((r) => ({ from: r.eighthsFrom, to: r.end })),
      lineFills: subsAtLines.map((x) => x.startBar + x.bars - 1),
      phraseFills: kitPhraseFills(KIT!, seed, arrangement.sections, subsAtLines),
      // the deadline shortens as Veil rises past the tile, and never stands longer than its row's (the bed's own promise)
      ...(chapters ? { chapters: leans ? { ...chapters, maxGap: Math.round(chapters.maxGap * Math.min(1, leanFactor(leans, 'deadline', bias.spell))) } : chapters } : {}),
    });
  })() : null;
  if (ambientPlan) {
    settleAmbient(ambientPlan, devPlan, { bars, barSeconds, keys: keysPlan! });
    if (devPlan) devPlan.summary += ` · ${ambientPlan.summary}`;
  }
  // the sub-sections that play: under a plan, the section lines' own that lead into a change
  const subs: SubSection[] = devPlan ? subsAtLines.filter((x) => devPlan.fills.lines.includes(x.startBar + x.bars - 1)) : subsDrawn;
  // the state each bar plays in, where the plan puts one (a half-time phrase, an exposed passage's hints or pulse)
  const barState: Array<string | null> | null = devPlan ? Array.from({ length: bars }, (_, b) => stateAt(devPlan, b)) : null;
  /** whether a bar of an exposed passage plays its state's drums: every bar but the passage's last, which breathes before the return */
  const stateDrums = (bar: number): string | null => {
    const st = barState?.[bar];
    if (st !== 'hints' && st !== 'pulse') return null;
    const s = layersAtBar(arrangement, bar).section;
    return bar < s.startBar + s.bars - 1 ? st : null;
  };
  const auxBars = new Set<number>(devPlan ? devPlan.aux.spans.flatMap((s) => Array.from({ length: s.to - s.from }, (_, i) => s.from + i)) : []);
  /** the gate of the lane the auxiliary part's voice belongs to, by its role (the cabasa's and the hands' the sixteenth lane, the rim's the backbeat) */
  const auxGates = (identity: string): string[] => {
    const voice = AUX?.parts[identity]?.voice, roles: readonly string[] = voice ? BY_NAME[voice]?.roles ?? [] : [];
    return LANES.filter((l) => !!l.gate && roles.includes(l.role)).map((l) => l.gate as string).slice(0, 1);
  };
  // **A sub-section's layers** (round M1, a figure's `layers`): the roles it
  // switches in or out, as the lane table's gates — the composer lays what a
  // layer switched in plays, on the chord. A sub-section over a bar the rhythm
  // development fills with its own pickup is left out whole, as the overlay
  // leaves it (`playSubSections`); the pickups are the arrangement's and known
  // before the bars are laid.
  const gatesOf = (role: string): string[] => LANES.filter((l) => !!l.gate && (
    role === 'drone' ? l.role === 'sustained' : role === 'open' ? l.role === 'offbeat' && l.slot === 'open' : l.role === role)).map((l) => l.gate as string);
  const pickupAhead = new Set<number>();
  if (subs.some((s) => s.row.figure?.layers)) for (let bar = 0; bar < bars; bar++) {
    const g = rhythmGates(rhythmPerformer, bar, {});
    if (g.phase === 'pickup' || g.rhythmPickups.size) pickupAhead.add(bar);
  }
  const gateSubs = subs.filter((s) => {
    if (!s.row.figure?.layers) return false;
    for (let b = s.startBar; b < s.startBar + s.bars; b++) if (pickupAhead.has(b)) return false;
    return true;
  });
  const gateHeard = new Set<SubSection>();
  // The sub-sections the readout names, and the glue each laid: a noise the glue's gate takes out later un-names its row.
  let namedSubs: SubSection[] = [];
  const subGlue: Array<{ ev: unknown; line: number }> = [];
  // Where a switched-out layer's held notes are to stop: the role's lanes, and the bar it went out on.
  const gateCuts: Array<{ role: string; bar: number }> = [];

  // The bars the rhythm development already fills with its own pickup (the
  // bridge's last bar under the percussion development, a shaped rest's last
  // bar): a sub-section leaves them alone — two small things on one bar is
  // one too many, and the development's was there first (the DNB-1 landing).
  const pickupBars = new Set<number>();
  // The roles an explicit part owns (a pinned part, a recipe's rhythm cells,
  // the recipes a composition drew): a sub-section's layer switch never takes
  // one of them off nor trades it — a named part is a promise the overlay
  // keeps, in the gates as in the events (the M1 landing).
  const heldRoles = new Set<string>([
    ...(request.pin ? [request.pin.role] : []),
    ...rowRhythm.map((r) => r.lane.role),
    ...(composition?.trace.recipes?.flatMap((r) => r.roles) ?? []),
  ]);
  for (let bar = 0; bar < bars; bar++) {
    const { section, layers: sectionLayers } = layersAtBar(arrangement, bar);
    // **A theme never opens silent** (house-v2's `openingSound`, round S13): a
    // first phrase of the theme whose grammar switches nothing on takes the
    // section's own held layer — the drone where any phrase of the section
    // plays it, else the bass — so the first bar sounds.
    const originalLayers = openingSound && section.index === 0 && openingEmpty(section, bar, sectionLayers)
      ? { ...sectionLayers, [openingLayer(section)]: true } : sectionLayers;
    const { phase, rhythmPickups, layers: gatedLayers } = rhythmGates(rhythmPerformer, bar, originalLayers);
    let layers = gatedLayers;
    if (phase === 'pickup' || rhythmPickups.size) pickupBars.add(bar);
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
    // The roll is `harmonyOf`'s (above the form), the same two draws off the
    // same stream: the cut reads it before the bars are laid (L2).
    // **The lead-entry rule** (`notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1): a section that has been
    // pad-alone for this many bars opens the figure role for the rest of
    // itself. No new die and no re-roll — the draw that was made is kept and a
    // floor is put under it, so a section that already plays both is untouched
    // and a section shorter than the floor is the section it always was.
    // The roll is the section's own index's, or the one S25's form rules gave it (`Section.roll`).
    const { rolledKeys, rolledPad } = harmonyOf(section.roll ?? section.index, continuity);
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
    // Under one bed (round DNB-3) the figure is the bed where a part asks for
    // one and the section lets its lane sound this bar, and the held layer
    // everywhere else: so a section whose grammar has no figure still has its bed.
    let keysSection = ONE_BED ? !!UPPER && !!layers[figureGate as string] : !!UPPER || rolledKeys || lateEnough || figureOnly;
    let padSection = (ONE_BED ? !keysSection : rolledPad || droneOnly) && !(support?.reserved[bar])
      && (!support || support.until[bar] > bar * 4);
    // A sub-section's layers (round M1): switched in, switched out, the two harmonic layers traded.
    const gate = gateSubs.length ? gatesAt(gateSubs, bar) : null;
    if (gate) {
      const before = { layers: { ...layers }, keysSection, padSection };
      layers = { ...layers };
      const set = (role: string, on: boolean) => {
        if (role === 'figure') keysSection = on;
        if (role === 'drone') padSection = on;
        for (const g of gatesOf(role)) (layers as Record<string, boolean>)[g] = on;
      };
      const held = (role: string) => heldRoles.has(laneRoleOf(role));
      if (gate.swap && !held('figure') && !held('drone') && !!layers[figureGate as string] && !!layers[droneGate as string]) {
        // One of the two plays: the other plays instead. Both play: the held one rests and the struck one carries the chords.
        if (keysSection !== padSection) { const keys = keysSection; keysSection = !keys; padSection = keys; }
        else if (keysSection) padSection = false;
      }
      for (const r of gate.on) if (!held(r)) set(r, true);
      for (const r of gate.off) if (!held(r)) set(r, false);
      // **A groove is never pad-alone for long** (the lead-entry rule): a span
      // that would leave the pad alone past the rule's floor keeps the figure
      // from the bar the floor is reached — the rule's word over the row's.
      if (LEAD_ENTRY > 0 && padSection && !!layers[droneGate as string] && !(keysSection && layers[figureGate as string])
        && before.keysSection && !!before.layers[figureGate as string]) {
        let alone = 0;
        for (let b = timeline.length - 1; b >= 0 && timeline[b].layers.includes(droneGate as string) && !timeline[b].layers.includes(figureGate as string); b--) alone++;
        if (alone + 1 > LEAD_ENTRY) { keysSection = true; (layers as Record<string, boolean>)[figureGate as string] = true; }
      }
      const sounds = (g: string, L: Record<string, boolean | undefined>, k: boolean, p: boolean) => !!L[g] && (g !== figureGate || k) && (g !== droneGate || p);
      const moved = Object.keys({ ...before.layers, ...layers }).filter((g) =>
        sounds(g, before.layers, before.keysSection, before.padSection) !== sounds(g, layers, keysSection, padSection));
      if (moved.length) for (const s of gate.by) gateHeard.add(s);
      // A layer out on this bar that sounded on the one before: its held notes stop here.
      for (const g of moved) if (!sounds(g, layers, keysSection, padSection)) {
        const lane = LANES.find((l) => l.gate === g);
        if (lane) gateCuts.push({ role: g, bar });
      }
    }
    // One bed holds through the sub-sections too: a figure switched in with no part to play is the stab mask, and is not played.
    if (ONE_BED) { if (!UPPER) keysSection = false; if (keysSection && padSection) padSection = false; }
    // **An exposed passage's state** (liquid-space, the plan's `hints` and `pulse`): the drums it remembers are switched
    // on in the plan, so the timeline says so and the lead-ins read it; the kit plays the state's own lanes there.
    const remembered = stateDrums(bar);
    if (remembered) {
      const gateOf = (role: string, slot?: string) => LANES.find((l) => l.role === role && (slot === undefined || l.slot === slot))?.gate;
      layers = { ...layers };
      for (const g of [kickGate, remembered === 'hints' ? gateOf('backbeat') : gateOf('offbeat', 'offbeat')]) if (g) (layers as Record<string, boolean>)[g] = true;
    }
    const kickParts = rhythm.filter(r=>r.lane.role==='kick');
    const kickThisBar = !!layers[kickGate as string] && (kickParts.length
      ? kickParts.some(({part})=>part.steps.some(s=>Math.floor(s/16)===bar%part.bars)) : !kickOut.has(bar));
    if (kickThisBar) kickBars++;

    timeline.push({
      bar,
      t: barStart,
      section: section.label,
      ...(section.name ? { sectionName: section.name } : {}),
      sectionIndex: section.index,
      phrase: Math.floor(bar / 8),
      chord: chord.label,
      roman: chord.roman,
      layers: Object.keys(layers)
        .filter((k) => layers[k])
        .filter((k) => k !== kickGate || kickThisBar)
        .filter((k) => k !== figureGate || keysSection)
        .filter((k) => k !== droneGate || padSection)
        // the plan's auxiliary part, on its lane's gate where it plays (liquid-space): the timeline says what sounds
        .concat(auxBars.has(bar) && devPlan ? auxGates(devPlan.aux.identity).filter((g) => !layers[g]) : []),
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

  // **The keys themselves** (liquid-space round 1): every note of the plan — the strikes
  // rolled from the bass, a re-touch, the pickups and the answers — on each of the tone's
  // layers, played on the grid's straight sixteenths and the plan's own lateness, into the
  // part's own space (`partSpace`: the tone's inserts and the hall, one for the theme) and
  // into no other send. A section's class sets their level (a full one low and wet, as the
  // lab's drops). They are a part of their own (`role`), which the stage, its rota and the
  // bed's octave rule leave as written; the level table's word on the voice is taken back
  // once the room is known (below), so the space's trim is the part's level.
  const keysEvents: PlanEvent[] = [];
  // a keys tone the place's birds swapped for its sound alone (PLAN-UNIFY U3): each note counts the drawn tone's voice
  // (`EventMeta.drawn`, as the crack's swap does), so the cast and every admission read what the draw chose
  // ...and sounds as itself at no more cost (`KeysPlan.cast`): its EQ as the note's own low-pass where the drawn tone's
  // inserts could not pay for it, its own room a send to the field's shared hall (the note's direct at the room's dry share)
  // **Zephyr, how bright the air** (PLAN-UNIFY U3): the keys' own low-pass leaned about the place's own tile, whatever
  // voice was drawn (the grands' and the tines' own filters; the FM pianos' the stage's tone filter), closing below the tile and opening a
  // little above it, never past `keysLpMost`; exactly one at the tile, which writes nothing
  const keysLp = keysRow?.keys?.leans ? Math.min(KEYS_LP_MOST, leanFactor(keysRow.keys.leans, 'keysLp', bias.spell)) : 1;
  const swapSound = (lp?: unknown): Partial<NoteParams> => {
    const C = keysPlan?.cast;
    const mul = (C?.lpMul ?? 1) * keysLp;
    if ((!C || (C.lpMul == null && C.hall == null)) && keysLp === 1) return {};
    const base = Array.isArray(lp) ? lp as number[] : [1, 1];
    return { ...(mul !== 1 ? { lpMul: base.map((x) => +(x * mul).toFixed(4)) } : {}), ...(C?.hall != null ? { returns: { 'field.hall': C.hall } } : {}),
      ...(C?.direct != null ? { direct: C.direct } : {}) };
  };
  const castAsDrawn = (e: PlanEvent, voice: string) => {
    const C = keysPlan?.cast;
    if (!C) return;
    const i = keysPlan!.layers.findIndex((L) => L.voice === voice), was = C.voices[Math.min(Math.max(0, i), C.voices.length - 1)];
    if (was && was !== voice) e.drawn = was;
  };
  /** the ambient voices' featured details, whose level is their row's: the level table's word is taken back off them */
  const ambientOwn: PlanEvent[] = [];
  /** the surface the weather replaced, the phrase plan's units, and the surface's own laying (for a weather over the budget) */
  let replacedSurface: string | null = null;
  let ambientCast: { unitsOf: (voices: Iterable<string>) => number; castBesides: number } | null = null;
  let layOldSurface: (() => void) | null = null;
  if (keysPlan) {
    const step16 = barSeconds / 16;
    const mixAt = (bar: number) => { let at = keysPlan.sections[0]; for (const x of keysPlan.sections) if (x.startBar <= bar) at = x; return at; };
    for (const n of keysPlan.notes) for (const L of keysPlan.layers) {
      if (L.hands === 'right' && n.hand === 'left') continue;
      const bar = Math.floor(n.step / 16);
      const t = n.step * step16 + n.lateMs / 1000;
      if (bar < 0 || bar >= bars || t < 0) continue;
      push(L.voice, t, { midi: n.midi, vel: n.vel, dur: n.dur, gain: L.gain * dbToGain(mixAt(bar).levelDb), partSpace: 1, hall: 0, delay: 0, reverb: 0, tremolo: 1, ...swapSound() },
        { bar, step: n.step % 16, layer: layerOf(L.voice), note: noteName(n.midi), role: 'sparse-keys', treatment: 'none' });
      keysEvents.push(events[events.length - 1]);
      castAsDrawn(events[events.length - 1], L.voice);
    }
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

  // **The arrangement's phrases** (PLAN-UNIFY U2, `src/phrasing.ts`): where the theme's small things are the house's own
  // (a place that draws them, no phrase planner over the kit, no complete arrangement, no pinned treatment), the long
  // mains take sub-segments by the phrase map, the drums answer the structural arrivals, the bass leaves before a drop
  // and a return, and a main's end into a break is its cooldown. Planned off the bars as the loop laid them and the glue
  // the lead-ins put down; its figures are sub-sections, played with the house's own below.
  // A complete arrangement (a track row's own rhythm cells) is phrased too: its cells are a promise the figures keep (the
  // roles it owns are never edited), so a phrase there is what the kit leaves free — a filtered phrase, the bass and
  // the chords out for a bar, the bass's outs, the glue's answers.
  const phraseRates = switchOn(style, 'subSections') ? (placesOn ? nearestEntry(PLACED.subSections, bias.spell, bpm)?.rates : null) ?? PLACED.subSectionsHouse ?? null : null;
  const phrasingOn = switchOn(style, 'phrasing') && !!time && !!phraseMap && !devPlan && !!phraseRates && !request.treatment && bpm >= PHRASING_ROWS.ring.leastBpm
    && (phraseRates.fill > 0 || phraseRates.dropOut > 0 || phraseRates.switchUp > 0 || phraseRates.turnaround > 0) && (DERIVED ? DERIVED.drumsOn : true)
    // never a held drone over a broken beat: the beat's own displacement against the drone is that groove's motion
    // (his ear 10-13 on the Spark and Loom combo, seed 10 with the drone in front: "groovy", keep it; and its documented
    // fan track, seed 1 theme 16, the drone behind a two-step); a drone over the house's four is the house's own scene
    // (his goldens) and is phrased
    && !((scene === 'drone-forward' || scene === 'drone-back') && !!breakRow);
  // **Whether the theme's bass glides** (U2b, the lift into a drop or a return): every voice its bass notes play slides
  // into a note from `slideFrom` over `slideTime` (the sub's topology), so a note under the anchor's first one rises
  // into it, and the line moves inside its bars (a held line, every note on a bar's one, takes no pickup: its notes
  // are the harmony's boundaries); a bass that does not is lifted by the glue's swell alone
  // (the voice the line ends up on: a place's roles row turns the line onto its own at the end, `turnRoles`)
  const glidesInto = (voice: string) => BY_NAME[voice]?.row?.topology === 'sub';
  const rolesEntry = placesOn ? nearestEntry(PLACED.roles, bias.spell, bpm) : null;
  const turnedBass = rolesEntry?.bass ? SOUNDS[rolesEntry.bass] ?? null : null;
  const bassGlides = (layers: ReadonlySet<string>) => {
    const notes = events.filter((e) => layers.has(e.layer) && typeof e.p.midi === 'number');
    const voices = new Set(notes.map((e) => e.voice));
    return voices.size > 0 && [...voices].every(glidesInto) && (!turnedBass || glidesInto(turnedBass)) && notes.some((e) => (e.step ?? 0) !== 0);
  };
  const phrased = phrasingOn ? (() => {
    const roleLayers = (role: string) => new Set(LANES.filter((l) => l.role === role).map((l) => layerOf(voiceOf(l))));
    const K = roleLayers('kick'), B = roleLayers('backbeat'), O = roleLayers('offbeat'), BASS = roleLayers('bassline');
    // the tops (U2b): the sixteenth lane and the open hat, what thins under a filtered phrase and a cooldown
    const SIXTEENTH = roleLayers('sixteenth'), OPEN = new Set(LANES.filter((l) => l.role === 'offbeat' && l.slot === 'open').map((l) => voiceOf(l)));
    const kitAt: BarKit[] = Array.from({ length: bars + 1 }, () => ({ kick: false, backbeat: false, offbeat: false, earlyHats: false, bass: false, drums: false, held: false, tops: false, sixteenths: false,
      cover: { bass: 0, drone: 0, figure: 0, harmony: 0 } }));
    // the sixteenths each held part sounds over, by its lanes' layers: the bass, the held layer (the pad), the figure (the keys)
    const PARTS = { bass: BASS, drone: roleLayers('sustained'), figure: roleLayers('figure') } as const;
    const partSounding = { bass: new Uint8Array((bars + 1) * 16), drone: new Uint8Array((bars + 1) * 16), figure: new Uint8Array((bars + 1) * 16) };
    const hats = new Array<number>(bars + 1).fill(0);
    const s16 = barSeconds / 16, sounding = new Uint8Array((bars + 1) * 16);
    // what sounds over a bar: a note's span (at least its own bar)
    const over = (e: PlanEvent, f: (k: BarKit) => void) => { const z = Math.min(bars, Math.floor((e.t + Number(e.p.dur ?? 0)) / barSeconds - 1e-6)); for (let b = e.bar; b <= Math.max(e.bar, z); b++) f(kitAt[b]); };
    for (const e of events) {
      if (e.p.gone || e.bar == null || e.bar < 0 || e.bar > bars) continue;
      const k = kitAt[e.bar];
      if (SIXTEENTH.has(e.layer)) k.tops = k.sixteenths = true;
      else if (O.has(e.layer) && OPEN.has(e.voice)) k.tops = true;
      if (typeof e.p.midi === 'number') for (const part of ['bass', 'drone', 'figure'] as const) if (PARTS[part].has(e.layer)) {
        const a = Math.max(0, Math.floor(e.t / s16)), z = Math.min(partSounding[part].length, Math.ceil((e.t + Number(e.p.dur ?? 0)) / s16));
        for (let i = a; i < z; i++) partSounding[part][i] = 1;
      }
      if (K.has(e.layer)) k.kick = k.drums = true;
      else if (B.has(e.layer)) k.backbeat = k.drums = true;
      else if (O.has(e.layer)) { k.offbeat = k.drums = true; hats[e.bar]++; if ((e.step ?? 0) < PHRASING_ROWS.ring.answers.breatheSteps) k.earlyHats = true; }
      else if (BASS.has(e.layer) && typeof e.p.midi === 'number') over(e, (x) => { x.bass = true; });
      else if (typeof e.p.midi === 'number' && TONAL_LAYERS.has(e.layer)) {
        // the sixteenths a harmonic or melodic note sounds over
        const a = Math.max(0, Math.floor(e.t / s16)), z = Math.min(sounding.length, Math.ceil((e.t + Number(e.p.dur ?? 0)) / s16));
        for (let i = a; i < z; i++) sounding[i] = 1;
      }
    }
    // a bar holds the space without the bass where the hats tick in it, or where no gap in its harmony is longer than
    // the guards' hole (max(1.5 felt beats, 0.7 s))
    const holeSteps = Math.max(1.5 * time!.feltBeatS, 0.7) / s16;
    for (let b = 0; b <= bars; b++) {
      let gap = 0, most = 0;
      let on = 0;
      for (let i = b * 16; i < (b + 1) * 16; i++) { gap = sounding[i] ? 0 : gap + 1; most = Math.max(most, gap); on += sounding[i]; }
      kitAt[b].cover.harmony = on / 16;
      kitAt[b].held = hats[b] >= 2 || most <= holeSteps;
      for (const part of ['bass', 'drone', 'figure'] as const) {
        let n = 0;
        for (let i = b * 16; i < (b + 1) * 16; i++) n += partSounding[part][i];
        kitAt[b].cover[part] = n / 16;
      }
    }
    const near = PHRASING_ROWS.ring.answers.gestureBars * barSeconds;
    // a gesture is where it starts and where it arrives: a riser or a sweep landing on the line is one there
    const gestures = events.filter((e) => e.layer === 'fx' && !/weather|vinyl|airBed/i.test(e.voice)).flatMap((e) => [e.t, e.t + Number(e.p.dur ?? 0)]);
    return planPhrasing({ row: PHRASING_ROWS.ring, seed, spell: bias.spell, bpm, time: time!, map: phraseMap!, sections: arrangement.sections, bars,
      drawn: subs, treatments: TREATMENT_ROWS, four: !breakRow, kit: (b) => kitAt[b] ?? kitAt[bars], keep: pickupBars, held: heldRoles,
      gestured: (b) => gestures.some((t) => Math.abs(t - b * barSeconds) <= near),
      // a part's lane (a pinned part's, a part the composition drew: a hand row) is never a build's to roll or thin; a
      // track row's own cells are (his word on the drums at a break), and the stop silences every lane
      spare: new Set([...(request.pin ? [request.pin.role] : []), ...(composition?.trace.recipes?.flatMap((r) => r.roles) ?? [])].map(laneRoleOf)),
      filterMoves: (a, z) => {
        // the arrangement's own line, in bars, before any phrase is laid on it: a point inside the out, or its value at
        // the build's stop, away from where it stood at the out's start
        const pts = shaped?.filter ?? filterCurve(arrangement);
        const at = (b: number) => { let prev = pts[0]; for (const p of pts) { if (p.bar >= b) return prev.bar === p.bar ? p.value : prev.value + (p.value - prev.value) * (b - prev.bar) / (p.bar - prev.bar); prev = p; } return prev?.value ?? 0; };
        const v0 = at(a), end = z - 1 / 8;
        return pts.some((p) => p.bar > a + 1e-6 && p.bar < end && Math.abs(p.value - v0) > 0.01 * v0) || Math.abs(at(end) - v0) > 0.01 * v0;
      },
      // the answer on a glue gesture's own sound: the crash on a struck one, the reverse swell on a swell's shape or a noise
      // the glue's gates govern — never on a held bed the palette drew into the slot (a vinyl bed struck at a line is a
      // crackle, not a crash or a swell)
      can: { crash: !!stroke && !!fx.impact && !((TIMBRES[stroke.voice]?.hold ?? 0) >= 1), reverse: !!swell && isNoiseGlue(swell.voice), glide: bassGlides(BASS),
        swell: !!swell && isNoiseGlue(swell.voice) && events.some((e) => e.voice === swell.voice) },
      beatS: beat });
  })() : null;
  if (phrased) {
    // the answers: a crash into the hall and a reverse swell into the arrival on the glue's own lanes (the glue's gates
    // below admit or refuse them as they do every glue noise), the hats breathing for the arrival's first beats
    const A = PHRASING_ROWS.ring.answers;
    const hatsLayers = new Set(LANES.filter((l) => l.role === 'offbeat').map((l) => layerOf(voiceOf(l))));
    const breathe = new Set<number>();
    for (const x of phrased.phrasing.answers) {
      const t = x.bar * barSeconds;
      if (x.parts.includes('crash') && stroke) push(stroke.voice, t, { gain: A.crashGain }, { bar: x.bar, layer: layerOf(stroke.voice), label: x.label });
      if (x.parts.includes('reverse') && swell) push(swell.voice, t, { dur: A.reverseBeats * beat, gain: A.reverseGain }, { bar: x.bar, layer: layerOf(swell.voice), label: x.label });
      if (x.parts.includes('hatsBreathe') && !heldRoles.has('offbeat')) breathe.add(x.bar);
    }
    if (breathe.size) {
      const kept = events.filter((e) => !(breathe.has(e.bar) && hatsLayers.has(e.layer) && !e.part && (e.step ?? 0) < A.breatheSteps));
      events.length = 0;
      events.push(...kept);
    }
  }
  const phraseSubs = new Set<SubSection>(phrased?.subs ?? []);
  const allSubs = phrased ? [...subs, ...phrased.subs] : subs;
  let phraseHeard = new Set<SubSection>();
  if (allSubs.length) {
    const strokeVoice = stroke ? voiceOf(stroke.lane) : null;
    // The roles past the drums (round M1): the open hat alone, the bassline, the keys and the pad, by the lane table.
    const roleLanes = (role: string, filter: (l: Lane) => boolean, extra: { borrow?: boolean; held?: boolean }) => {
      const lanes = LANES.filter(filter);
      if (!lanes.length) return null;
      const voices = new Set(lanes.map((l) => voiceOf(l)));
      const layer = layerOf([...voices][0]);
      return [role, { layer, voices, ...extra }] as const;
    };
    const roles: RoleLanes = Object.fromEntries([
      roleLanes('open', (l) => l.role === 'offbeat' && l.slot === 'open', { borrow: true }),
      roleLanes('bassline', (l) => l.role === 'bassline', { held: true }),
      roleLanes('figure', (l) => l.role === 'figure', { held: true }),
      roleLanes('drone', (l) => l.role === 'sustained', { held: true }),
    ].filter((x): x is NonNullable<typeof x> => !!x));
    // The glue a figure plays on its line, as the lead-ins lay it: the slot's
    // own voice where this theme's palette carries it, and never where a glue
    // event already sits within a bar of the line.
    const glueAt = (slot: string, line: number, n: number, level: number): boolean => {
      const lane = slot === 'impact' ? stroke : slot === 'swell' ? swell : slot === 'sweep' ? fall : slot === 'riser' ? rise : null;
      const allowed = slot === 'impact' ? fx.impact : slot === 'sweep' ? fx.sweep : slot === 'riser' ? fx.riser : !!swell;
      if (!lane || !allowed || line <= 0 || line >= bars) return false;
      const from = line - n;
      if (events.some((e) => e.layer === layerOf(lane.voice) && e.bar != null && e.bar >= from - 1 && e.bar <= line + 1)) return false;
      if (slot === 'impact') push(lane.voice, line * barSeconds, { gain: level }, { bar: line, layer: layerOf(lane.voice) });
      else if (slot === 'swell') push(lane.voice, line * barSeconds, { dur: n * barSeconds, gain: level }, { bar: line, layer: layerOf(lane.voice) });
      else push(lane.voice, from * barSeconds, { dur: n * barSeconds, gain: level }, { bar: from, layer: layerOf(lane.voice) });
      subGlue.push({ ev: events[events.length - 1], line });
      return true;
    };
    const beforeSubs = phrased ? [...events] : null;
    const playedSubs = playSubSections(events as any, allSubs, at, subRates?.crash && strokeVoice === 'crash' ? { voice: strokeVoice, layer: layerOf(strokeVoice) } : null,
      { bars: pickupBars, roles, glue: glueAt, held: heldRoles });
    // a voice the arrangement's phrases took off its last bars is played there as it was (U2c: a build's hats resting
    // took a loose hat struck only on two fill bars out of the theme: never a voice the cast counted taken away)
    if (beforeSubs) {
      const now = new Set(events.map((e) => e.voice));
      const lost = beforeSubs.filter((e) => !now.has(e.voice) && phrased!.subs.some((x) => e.bar >= x.startBar && e.bar < x.startBar + x.bars));
      // never inside a build's roll or its stop (the review of U2c): a hit there is put back only outside the window, and
      // a voice with none outside keeps one, moved to the beat before its window
      const windowAt = new Map<number, number>();
      const playedSet = new Set(playedSubs);
      for (const x of phrased!.subs) if (playedSet.has(x) && (x.row.id.includes('+build') || x.row.id.startsWith('phrasing/stop-')))
        for (const e of Object.values(x.row.figure?.lanes ?? {})) if (e.clear !== undefined) windowAt.set(x.startBar, Math.min(windowAt.get(x.startBar) ?? 16, e.clear));
      const outside = (e: PlanEvent) => e.bar == null || !windowAt.has(e.bar) || (e.step ?? 0) < windowAt.get(e.bar)!;
      for (const voice of new Set(lost.map((e) => e.voice))) {
        const hits = lost.filter((e) => e.voice === voice);
        const kept = hits.filter(outside);
        if (kept.length) { events.push(...kept); continue; }
        const e = hits[0], w = windowAt.get(e.bar)!, step = Math.max(0, w - 4);
        events.push({ ...e, t: at(e.bar, step) + (e.t - at(e.bar, e.step ?? 0)), step });
      }
    }
    // the arrangement's phrases are named on the track's `phrasing`, not on the readout's bars (read by nothing new)
    phraseHeard = new Set(playedSubs.filter((s) => phraseSubs.has(s)));
    const heard = playedSubs.filter((s) => !phraseSubs.has(s));
    // A layer switched out cuts the held notes ringing into its first bar out.
    for (const c of gateCuts) {
      const t0 = c.bar * barSeconds;
      const voices = new Set(LANES.filter((l) => l.gate === c.role).map((l) => voiceOf(l)));
      for (const e of events) if (voices.has(e.voice) && !(e as { part?: unknown }).part && e.role !== 'sparse-keys' && e.t < t0 - 1e-9 && typeof e.p.dur === 'number' && e.t + e.p.dur > t0 + 1e-9)
        e.p = { ...e.p, dur: t0 - e.t };
    }
    namedSubs = [...heard, ...[...gateHeard].filter((s) => !heard.includes(s))];
    // The readout names the sub-section a bar is in, where it was heard.
    for (const row of timeline) { const s = subAt(namedSubs, row.bar); if (s) row.sub = s.label; }
  }
  // **The marks the arrangement's phrases asked for** (U2b, his ear 10-13): a reverse swell into a line (a filtered
  // phrase's, an out's lift) on the glue's swell where the theme already sounds it (never a voice the cast did not
  // count), and the bass's glide into a drop or a return — a note `semitones` under the anchor's first bass note, the
  // same voice and level, sliding up into it over the out's last beats. Each only where the sub-section it marks was heard.
  const glided = new Set<object>();
  if (phrased) {
    const M = phrased.moves, heardBy = (by?: SubSection) => !by || phraseHeard.has(by);
    // an answer's own reverse swell into the same line is the one (it is pushed above)
    const answered = new Set(phrased.phrasing.answers.filter((x) => x.parts.includes('reverse')).map((x) => x.bar));
    if (swell && events.some((e) => e.voice === swell.voice))
      for (const x of M.swells) if (heardBy(x.by) && !answered.has(x.bar))
        push(swell.voice, x.bar * barSeconds, { dur: x.beats * beat, gain: x.gain }, { bar: x.bar, layer: layerOf(swell.voice), label: `a reverse swell into ${x.bar}, the arrangement's phrase` });
    // a build's crash on the line (U2b, U2c), the theme's own struck crash, never a second one on the bar
    if (stroke && events.some((e) => e.voice === stroke.voice))
      for (const c of M.crashes) if (heardBy(c.by) && !events.some((e) => e.voice === stroke.voice && e.bar === c.bar))
        push(stroke.voice, c.bar * barSeconds, { gain: PHRASING_ROWS.ring.answers.crashGain }, { bar: c.bar, layer: layerOf(stroke.voice), label: `a crash on ${c.bar}, the build's landing` });
    const bassLayers = new Set(LANES.filter((l) => l.role === 'bassline').map((l) => layerOf(voiceOf(l))));
    // the line's median velocity: a glide is struck at least at it (the review of U2b: 17 of 252 glides copied a
    // ghost note's and landed at ghost velocity)
    const vels = events.filter((e) => bassLayers.has(e.layer) && typeof e.p.midi === 'number' && !e.p.gone).map((e) => Number(e.p.vel ?? 1)).sort((a, b) => a - b);
    const medianVel = vels.length ? vels[Math.floor(vels.length / 2)] : 1;
    for (const g of M.glides) if (heardBy(g.by)) {
      const t0 = g.bar * barSeconds, dur = g.beats * beat;
      const first = events.filter((e) => bassLayers.has(e.layer) && typeof e.p.midi === 'number' && !e.p.gone && e.t >= t0 - 1e-6 && e.t < t0 + barSeconds)
        .sort((a, b) => a.t - b.t)[0];
      if (!first || !glidesInto(first.voice)) continue;
      const { part: _part, ...rest } = first;
      const vel = Math.max(Number(first.p.vel ?? 1), medianVel);
      events.push({ ...rest, t: t0 - dur, bar: g.bar - 1, step: 16 - Math.round(4 * g.beats), by: 'phrasing/bass-lift', label: `the bass gliding up into ${g.bar}`,
        p: { ...first.p, vel, dur, slideFrom: (first.p.midi as number) - g.semitones, slideTime: dur } });
      // ...and the note it lands on struck at least as the glide is (the review of U2c: a glide resolving to a ghost)
      if (Number(first.p.vel ?? 1) < vel) first.p = { ...first.p, vel };
      glided.add(g);
    }
  }
  treat({ style, levels: roomLevels, parts, characters, events, upperEvents, phraseParameters, LANES, voiceOf, UPPERS, TEXTURE, silent,
    bars, arrangement, progression, at, beat, barSeconds, push });
  // **The drums' weight by place** (round DNB-1): the backbeat and the bass
  // lifted where the nearest place says so, after the presence pass has set
  // their levels.
  const drumsRow = placesOn ? nearestEntry(PLACED.drums, bias.spell, bpm) : null;
  // the voice the cast counts for an event: the drawn one where a place swapped only its sound (`DrumsEntry.soundOnly`)
  const castVoice = (e: PlanEvent) => e.drawn ?? e.voice;
  // the layers a role's lanes play on, for the passes below
  const layersOfRole = (...roles: string[]): Set<string> => new Set(LANES.filter((l) => roles.includes(l.role)).map((l) => layerOf(voiceOf(l))));
  if (drumsRow && (drumsRow.backbeatDb || drumsRow.bassDb || drumsRow.kickDb)) {
    const lifts = new Map<string, number>();
    // the birds on the line's lift (PLAN-UNIFY U2: Root, the low end's weight, inside ±2 dB at the fast places; nought at the tile)
    const subDb = (drumsRow.bassDb ?? 0) + leanShift(drumsRow.leans, 'subDb', bias.spell);
    for (const [role, db] of [['backbeat', drumsRow.backbeatDb], ['bassline', subDb], ['kick', drumsRow.kickDb ?? 0]] as const)
      if (db) for (const l of LANES.filter((l) => l.role === role)) lifts.set(voiceOf(l), dbToGain(db));
    for (const e of events) { const g = lifts.get(e.voice); if (g) e.p = { ...e.p, gain: (e.p.gain ?? 1) * g }; }
  }
  // **The mined kit** (10-06, hands-on, `src/kit.ts`): where the place names a kit row, every bar in
  // which the kick, the backbeat or the hats play has that part's hits replaced by the row's: per lane
  // and step of its cycle, a chance, a level over the lane's loudest (with its spread) and an offset in
  // ms. The arrangement still says where the drums play; the row says what they play, and the moves
  // they make where the sub-sections fall. Its ghosts are struck soft on the snare.
  const K = drumsRow?.kit ? kitOf(drumsRow.kit) : null;
  // the hits the kit struck: each says whether it is a ghost (`hit`), where a drawn pattern's says it by velocity
  const kitHits = new Set<(typeof events)[number]>();
  // the hits a kit state struck (liquid-space): a passage's own drums, which the place's lifts and the hats' thinning leave as the state wrote them
  const stateHits = new Set<(typeof events)[number]>();
  if (K) {
    const beforeKit = new Set(events);
    // a row the link pins plays its own cells: the kit steps aside for every part the row writes (a drawn row does not, so
    // the place keeps its kit on a set's turn)
    const pinnedCells = (fromLibrary ? null : (recipe?.wants as { rhythm?: Record<string, unknown[]> } | undefined)?.rhythm) ?? {};
    const groups: Record<string, Set<string>> = Object.fromEntries((['kick', 'backbeat', 'offbeat'] as const)
      .filter((role) => !pinnedCells[role]?.length).map((role) => [role, layersOfRole(role)]));
    const tmpl: Record<string, Map<number, (typeof events)[number]>> = { kick: new Map(), backbeat: new Map(), offbeat: new Map() };
    const groove = (kind: string) => K.grooves.includes(kind);
    for (const e of events) for (const [g, ls] of Object.entries(groups)) if (e.layer && ls.has(e.layer) && e.bar != null) {
      const prev = tmpl[g].get(e.bar);
      if (!prev || (e.p.vel ?? 1) > (prev.p.vel ?? 1)) tmpl[g].set(e.bar, e);
    }
    // inside a groove the kit plays whole: a part a generic drop-out took out of a bar
    // comes back from the section's nearest bar (source 9 never drops its kick or hats inside a groove)
    for (const sec of arrangement.sections) {
      if (!groove(sec.kind)) continue;
      for (let b = sec.startBar; b < sec.startBar + sec.bars; b++) {
        if (!Object.values(tmpl).some((m) => m.has(b))) continue;
        for (const m of Object.values(tmpl)) if (!m.has(b)) {
          // the nearest bar inside the section, on either side: a bar before the section's line is never a
          // reason not to look after the gap (the review of 10-08, B2: a groove's opening bars lost their hats)
          for (let d = 1; d < sec.bars; d++) {
            const near = (b - d >= sec.startBar ? m.get(b - d) : undefined) ?? (b + d < sec.startBar + sec.bars ? m.get(b + d) : undefined);
            if (near) { m.set(b, near); break; }
          }
        }
      }
    }
    // the planner's drums out wherever the kit plays the bar, the rest in their order (one pass, not a splice a hit)
    const groupList = Object.entries(groups);
    let kept = 0;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!(e.layer && e.bar != null && groupList.some(([g, ls]) => ls.has(e.layer!) && tmpl[g].has(e.bar!)))) events[kept++] = e;
    }
    events.length = kept;
    const cycleOf = (bar: number) => ((bar % K.cycleBars) + K.cycleBars) % K.cycleBars;
    // a lane's velocity off a level: its own floor and span, a ghost under the backbeat's ghost line
    const velOf = (L: KitLane, rel: number) => {
      const v = L.vel ? L.vel[0] + L.vel[1] * rel : Math.max(0.12, rel);
      return L.ghost ? Math.min(GHOST_VEL - 0.02, v) : v;
    };
    const spaceOf = (L: KitLane, pan = L.pan) => ({ ...(pan != null ? { pan } : {}), ...(L.room != null ? { room: L.room } : {}), ...(L.reverb != null ? { reverb: L.reverb } : {}) });
    // the kit's offsets are against its kick: the lane that plays the bar's own kick
    const kickMs = Object.values(K.lanes).find((l) => l.plays === 'kick')?.steps[0]?.ms ?? 0;
    // **A bar in a state** (liquid-space, the plan's half-time phrases and an exposed passage's hints or pulse): it
    // plays the state's own lanes (`Kit.states`) and none of the kit's, off streams of their own; every other bar
    // strikes exactly what it struck.
    const STATES = statesOf(K);
    const kitStateAt = (bar: number): string | null => {
      if (!barState) return null;
      const asked = barState[bar] === 'half-time' ? 'half-time' : stateDrums(bar);
      const st = asked ? devPlan?.kitStates[asked] ?? asked : null;
      return st && STATES[st] ? st : null;
    };
    // the bar's own template, else the nearest bar's (the first of two as near, as a stable sort would hand it)
    const nearestOf = (m: Map<number, (typeof events)[number]>, bar: number) => {
      const own = m.get(bar);
      if (own) return own;
      let best: (typeof events)[number] | undefined, gap = Infinity;
      for (const [b, t] of m) { const d = Math.abs(b - bar); if (d < gap) { gap = d; best = t; } }
      return best;
    };
    // a lane that plays a voice of its own (the backbeat's ghosts) off a template whose voice the room had off: its gain
    // was struck over that room's "off" (S18), and is brought back to the voice it plays (PLAN-UNIFY U1, bug 3: a clap
    // room's ghosts stood some 47 dB over the crack's); nought anywhere else
    const offLift = (from: string, to: string): number => offShift(style, roomLevels, from, to);
    const laneTops = new Map<KitLane, number>();
    const laneTopOf = (lane: KitLane) => { let v = laneTops.get(lane); if (v === undefined) laneTops.set(lane, (v = Math.max(...lane.steps.map((x) => x.vel)))); return v; };
    const strikeSteps = (name: string, lane: KitLane, bar: number, t: (typeof events)[number], r: Rng) => {
      const cyc = cycleOf(bar);
      for (const st of lane.steps) {
        if (Math.floor(st.step / 16) !== cyc || st.p < K.minP || !r.chance(st.p)) continue;
        // a kick note the transcription read under a quarter of the lane's level is its noise, and our kick's body makes it a thump
        if (lane.minVel != null && st.vel < lane.minVel) continue;
        const step = st.step % 16;
        const rel = Math.max(0.05, Math.min(1, st.vel + st.velSd * (r.float(-1, 1))));
        const vel = velOf(lane, rel);
        const voice = lane.plays === 'kick' || lane.plays === 'snare' ? t.voice : lane.plays;
        const time = Math.max(0, at(bar, step) + (st.ms - kickMs) / 1000);
        // the source's accent as level, not only as velocity (10-06: its snare on 4 louder than on 2, its soft hat's
        // accent after the downbeat; velocity alone barely moved our voices' level): over the lane's loudest step
        const laneTop = laneTopOf(lane);
        const share = Math.max(0.01, rel / Math.max(0.05, laneTop));
        const accent = lane.accent === 'level' ? share : Math.sqrt(share);
        const gain = (t.p.gain ?? 1) * dbToGain(lane.gainDb ?? 0) * accent * offLift(t.voice, voice);
        // the lane's place in the room (10-06, source 9's drums: hats left and wide, everything into a room)
        const pan = lane.pan != null ? Math.max(-1, Math.min(1, lane.pan + (lane.panSpread ?? 0) * r.float(-1, 1))) : undefined;
        push(voice, time, { ...t.p, vel: +vel.toFixed(3), gain, ...spaceOf(lane, pan != null ? +pan.toFixed(3) : undefined), ...(lane.ghost ? { hit: 'ghost' } : {}) }, { bar, step, layer: layerOf(voice) });
        if (name.includes(':')) stateHits.add(events[events.length - 1]);
      }
    };
    for (const [name, lane] of Object.entries(K.lanes)) {
      const g = lane.group;
      for (const [bar, t] of tmpl[g]) {
        if (kitStateAt(bar)) continue;
        strikeSteps(name, lane, bar, t, new Rng(`${seed}::kit:${name}:${bar}`));
      }
    }
    if (barState) for (let bar = 0; bar < bars; bar++) {
      const state = kitStateAt(bar);
      if (!state) continue;
      for (const [name, lane] of Object.entries(STATES[state].lanes)) {
        const t = nearestOf(tmpl[lane.group], bar);
        if (t) strikeSteps(`${state}:${name}`, lane, bar, t, new Rng(`${seed}::kit:${state}:${name}:${bar}`));
      }
    }
    // a single hit of a lane, on the bar's own drum (or, with `nearest`, the nearest bar's where the bar has none)
    const kitVoice = (lane: string) => { const L = K.lanes[lane]; return L && (L.plays === 'kick' || L.plays === 'snare') ? null : L?.plays ?? null; };
    // **A lane's voice on a bar** (the research manual's §2, the kit-voice adapter): a lane that plays the bar's own
    // kick or snare resolves to the instrument the bar actually has (its template, or the nearest bar's), where
    // `kitVoice` alone said nothing, so a keep list, a free step or a clear can name those lanes too
    const laneVoiceAt = (lane: string, bar: number): string | null => {
      const named = kitVoice(lane);
      if (named || !K.lanes[lane]) return named;
      return nearestOf(tmpl[K.lanes[lane].group], bar)?.voice ?? null;
    };
    // how many events stand at a bar, a step and a voice, while the kit's moves run (`free` asks it; they change the
    // events only by `strike`, `drop` and `clear`, which keep it), so a free step is one look and not a walk of the track
    let standing: Map<string, number> | null = null;
    const standKey = (bar: number | null | undefined, step: number | null | undefined, voice: string | null) => `${bar}|${step}|${voice}`;
    const stand = (e: (typeof events)[number], n: number) => { if (standing) { const k = standKey(e.bar, e.step, e.voice); standing.set(k, (standing.get(k) ?? 0) + n); } };
    const unstand = (i: number) => { stand(events[i], -1); events.splice(i, 1); };
    const strike = (bar: number, step: number, lane: string, vel: number, nearest = false) => {
      const L = K.lanes[lane]; let t = tmpl[L.group]?.get(bar);
      if (!t && nearest) t = nearestOf(tmpl[L.group], bar);
      if (!t) return;
      const voice = kitVoice(lane) ?? t.voice;
      // a voice of its own off a template the room had off comes back to its own level, as the kit's lanes do (`offLift`)
      const gain = (t.p.gain ?? 1) * dbToGain(L.gainDb ?? 0) * offLift(t.voice, voice);
      push(voice, at(bar, step), { ...t.p, vel, gain, ...spaceOf(L), ...(L.ghost ? { hit: 'ghost' } : {}) }, { bar, step, layer: layerOf(voice) });
      stand(events[events.length - 1], 1);
    };
    const drop = (bar: number, step: number, lane: string) => {
      const t = tmpl[K.lanes[lane].group]?.get(bar); if (!t) return;
      const voice = kitVoice(lane) ?? t.voice;
      for (let i = events.length - 1; i >= 0; i--) if (events[i].bar === bar && events[i].step === step && events[i].voice === voice && (K.lanes[lane].plays !== 'snare' || (events[i].p.vel ?? 1) >= GHOST_VEL)) unstand(i);
    };
    const free = (bar: number, step: number, lane: string) => {
      const voice = laneVoiceAt(lane, bar);
      return standing ? !((standing.get(standKey(bar, step, voice)) ?? 0) > 0) : !events.some((e) => e.bar === bar && e.step === step && e.voice === voice);
    };
    const drumLayers = new Set(Object.values(groups).flatMap((g) => [...g]));
    // every hit of the lanes from a step to another, on the bar (a clear: the end of a bar left open)
    const clear = (bar: number, lanes: string[], from: number, to: number) => {
      const voices = new Set(lanes.map((l) => laneVoiceAt(l, bar)).filter(Boolean) as string[]);
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.bar === bar && e.step != null && e.step >= from && e.step < to && voices.has(e.voice) && !!e.layer && drumLayers.has(e.layer)) unstand(i);
      }
    };
    // the phrase fills inside a long groove, which no section line asks for: the last bar of each
    // phrase of a groove, at the row's odds, where no sub-section stands (the source fills
    // inside its drops every sixteen to thirty-two bars); under a phrase plan only the ones with somewhere to go
    const phraseFills: Array<{ kind: string; startBar: number; bars: number }> = (devPlan ? devPlan.fills.kept : kitPhraseFills(K, seed, arrangement.sections, subs))
      .map((b) => ({ kind: 'fill', startBar: b, bars: 1 }));
    // **The drop's lift in two stages** (10-06, hands-on; source 9 at 2:30-3:40): over a run of grooves (a drop and
    // the main after it are one run, as the source's one drop) the bars before its midpoint play a hat as straight
    // eighths; from the midpoint a closing hit every bar. A bar in a state plays its own hats.
    standing = new Map();
    for (const e of events) stand(e, 1);
    if (K.lift) for (const run of kitLiftRuns(K, arrangement.sections)) {
      const { eighths, close } = K.lift;
      const cleared = new Set(eighths.clears.map((l) => kitVoice(l)).filter(Boolean) as string[]);
      for (let b = run.eighthsFrom; b < run.mid; b++) {
        if (kitStateAt(b)) continue;
        for (let i = events.length - 1; i >= 0; i--) if (events[i].bar === b && cleared.has(events[i].voice)) unstand(i);
        for (const [st, vel] of eighths.steps) strike(b, st, eighths.lane, vel);
      }
      for (let b = run.mid; b < run.end; b++) if (!kitStateAt(b) && free(b, close.step, close.lane)) strike(b, close.step, close.lane, close.vel);
    }
    // **The kit's own small things** (10-06, hands-on): where the sub-sections fall, the moves source 9
    // makes there, read bar by bar over the whole tune against its two-bar groove (the row's `moves`); and the
    // phrase plan's own (liquid-space): its answers, each on its one bar, and its lifts, each over its span
    const playMoves = (moves: KitMove[], sub: { startBar: number; bars: number }, r: Rng) => {
      const last = sub.startBar + sub.bars - 1;
      for (const m of moves) {
        if (m.p != null && !r.chance(m.p)) continue;
        const bars = m.bar === 'first' ? [sub.startBar] : m.bar === 'last' ? [last] : Array.from({ length: sub.bars }, (_, i) => sub.startBar + i);
        for (const b of bars) {
          if (kitStateAt(b)) continue;
          if (m.clear) clear(b, m.clear, m.fromStep ?? 0, m.toStep ?? 16);
          else if (m.drop) drop(b, m.step!, m.drop);
          else if (m.lane && (!m.ifFree || free(b, m.step!, m.lane))) strike(b, m.step!, m.lane, m.vel ?? 0.5);
        }
      }
    };
    // a keys pickup owns its bars (liquid-space round 1, `KeysPlan.reserved`): no fill there
    const pickupOwns = (sub: { kind: string; startBar: number; bars: number }) => sub.kind === 'fill' && !!keysPlan
      && keysPlan.reserved.some((w) => w.kind === 'pickup' && w.from < (sub.startBar + sub.bars) * 16 && w.to > sub.startBar * 16);
    for (const sub of [...subs, ...phraseFills]) {
      if (pickupOwns(sub)) continue;
      const moves = K.moves?.[sub.kind];
      if (!Array.isArray(moves)) continue;
      playMoves(moves, sub, new Rng(`${seed}::kitmove:${sub.kind}:${sub.startBar}`));
    }
    if (devPlan) {
      const answers = answersOf(K);
      for (const a of devPlan.answers) playMoves(answers[a.answer] ?? [], { startBar: a.bar, bars: 1 }, new Rng(`${seed}::kitanswer:${a.bar}`));
      for (const l of devPlan.lifts) {
        const moves = K.moves?.[l.kind];
        if (Array.isArray(moves)) playMoves(moves, { startBar: l.from, bars: l.to - l.from }, new Rng(`${seed}::kitlift:${l.from}`));
      }
    }
    standing = null;
    // **The kit between sections** (10-06, hands-on; source 9 read bar by bar over the whole tune): its drums
    // are either in or out — none in an intro but the hats over its last four bars as a lead-in, none in a
    // breakdown (its build carries none either), and in an outro the kit plays on and stops clean eight bars
    // before the end. The row names, per kind, the lanes a section keeps; a kind it leaves out keeps the kit.
    // A section whose row gates the kit (`section.kit`, liquid-space: the mixing intro) keeps what its phrases
    // switched on, and a bar the plan puts in a state keeps its state's hits.
    if (K.sections) {
      const voicesOf = (lanes: string[], a: number, b: number) => new Set(lanes.flatMap((l) => {
        const named = kitVoice(l);
        if (named) return [named];
        const L = K.lanes[l]; if (!L) return [];
        const own = [...tmpl[L.group].entries()].filter(([bar]) => bar >= a && bar < b).map(([, t]) => t.voice);
        return own.length ? own : [laneVoiceAt(l, a)].filter(Boolean) as string[];
      }));
      for (const sec of arrangement.sections) {
        const rule = K.sections[sec.kind]; if (!rule) continue;
        if (sec.row && (recipeById(sec.row, SECTION_ROWS)?.section as { kit?: string } | undefined)?.kit === 'gated') continue;
        const a = sec.startBar, b = sec.startBar + sec.bars;
        const keep = rule.lanes ? voicesOf(rule.lanes, a, b) : null;
        // the section's drums out but what the row keeps, the rest in their order (one pass, not a splice a hit)
        const out = (e: (typeof events)[number]) => {
          if (!e.layer || !drumLayers.has(e.layer) || e.bar == null || e.bar < a || e.bar >= b) return false;
          if (stateHits.has(e)) return false;
          if (rule.lanesUntilBeforeEnd != null) return e.bar >= b - rule.lanesUntilBeforeEnd;
          const inLead = rule.lastBars != null && e.bar >= b - rule.lastBars;
          return !keep || !keep.has(e.voice) || (rule.lastBars != null && !inLead);
        };
        let j = 0;
        for (let i = 0; i < events.length; i++) if (!out(events[i])) events[j++] = events[i];
        events.length = j;
        // an intro's lead-in plays the hats wherever the section had none: the row's own steps over its last bars
        if (rule.lastBars && keep && keep.size) for (let bar = b - rule.lastBars; bar < b; bar++) {
          if (events.some((e) => e.bar === bar && keep.has(e.voice))) continue;
          for (const lane of rule.lanes ?? []) {
            const L = K.lanes[lane];
            for (const st of L.steps) if (Math.floor(st.step / 16) === cycleOf(bar) && st.p >= (rule.minP ?? 0)) strike(bar, st.step % 16, lane, velOf(L, st.vel), true);
          }
        }
      }
    }
    for (const e of events) if (!beforeKit.has(e)) kitHits.add(e);
  }
  // A ghost is a hit struck as one: the kit's by its lane (its snare on 2 is struck soft, 0.39, and is no ghost:
  // the review of 10-08, B4), a drawn pattern's by the backbeat's ghost line.
  const isGhost = (e: (typeof events)[number]) => (kitHits.has(e) ? e.p.hit === 'ghost' : (e.p.vel ?? 1) < GHOST_VEL);
  // **The throw by place** (round DNB-5, `DrumsEntry.throws`): on the last
  // backbeat of a phrase, at the row's chance, the snare sent to the echo and
  // the room by the row's amounts — one small event whose tail fills the bar
  // line, the dub delay as an instrument, drawn phrase by phrase.
  if (drumsRow?.throws) {
    const T = drumsRow.throws;
    const backbeat = layersOfRole('backbeat');
    for (const e of events) {
      if (!e.layer || !backbeat.has(e.layer) || e.bar == null || e.step !== 12 || (e.bar + 1) % T.everyBars) continue;
      if (isGhost(e) || !new Rng(`${seed}::throw:${e.bar}`).chance(T.chance)) continue;
      e.p = { ...e.p, delay: Math.max(T.delay, e.p.delay ?? 0), reverb: Math.max(T.reverb, e.p.reverb ?? 0) };
    }
  }
  // **The ghosts and the hats by place** (round DNB-3): the backbeat's ghosts
  // (struck as ghosts, `isGhost`) brought back under the lift that stands the
  // snare beside the kick, and the offbeat hats leaned by the place's number.
  if (drumsRow && (drumsRow.ghostDb || drumsRow.hatsDb)) {
    const backbeat = layersOfRole('backbeat'), offbeat = layersOfRole('offbeat');
    const ghost = dbToGain(drumsRow.ghostDb ?? 0), hats = dbToGain(drumsRow.hatsDb ?? 0);
    for (const e of events) {
      if (drumsRow.ghostDb && backbeat.has(e.layer) && isGhost(e)) e.p = { ...e.p, gain: (e.p.gain ?? 1) * ghost };
      else if (drumsRow.hatsDb && offbeat.has(e.layer)) e.p = { ...e.p, gain: (e.p.gain ?? 1) * hats };
    }
  }
  // **The kit under a lifted section by place** (round DNB-4,
  // `DrumsEntry.liftDrums`): where a section lifts the harmonic layer (a
  // breakdown, an intro whose row says so), the kit's roles the row names for
  // that kind of section play this many decibels quieter, so the drums that
  // play there play under the pads and not over them.
  if (drumsRow?.liftDrums) {
    const byLayer = new Map<string, Map<string, number>>();
    for (const [kind, roles] of Object.entries(drumsRow.liftDrums)) {
      const m = new Map<string, number>();
      for (const [role, db] of Object.entries(roles)) for (const l of LANES.filter((l) => l.role === role)) m.set(layerOf(voiceOf(l)), dbToGain(db));
      byLayer.set(kind, m);
    }
    for (const s of arrangement.sections) {
      const m = s.lift ? byLayer.get(s.kind) : undefined;
      if (!m) continue;
      const a = s.startBar * barSeconds - 1e-6, b = (s.startBar + s.bars) * barSeconds - 1e-6;
      // a hit is in the section its bar is in: the kit strikes ahead of the line by its ms offsets (a downbeat
      // hat 5.8 ms early), and by time the drop's first hat took the breakdown's -18 dB (the review of 10-08, B3)
      const inside = (e: (typeof events)[number]) => (e.bar != null ? e.bar >= s.startBar && e.bar < s.startBar + s.bars : e.t >= a && e.t < b);
      // a kit state's own hits (liquid-space: an exposed passage's hints or pulse) are at the level their lanes say
      for (const e of events) { const g = m.get(e.layer); if (g != null && inside(e) && !stateHits.has(e)) e.p = { ...e.p, gain: (e.p.gain ?? 1) * g }; }
    }
  }
  // **The bed far and wide** (round DNB-3, the support's `wet`): the held
  // layer's notes sent to the room and spread at least as far as the place says.
  if (supportRow?.wet && droneGate) {
    const { reverb, spread } = supportRow.wet;
    for (const e of events) if (e.layer === droneGate && e.role !== 'sparse-keys' && e.role !== 'detail')
      e.p = { ...e.p, reverb: Math.max(reverb, e.p.reverb ?? 0), spread: Math.max(spread, e.p.spread ?? 0) };
  }
  // **The place's own drums** (round DNB-2): a drawn kit voice swapped for the
  // row the place's sound word resolves to, on the events themselves, so a hit
  // keeps its step, level and trim and only the sound changes.
  if (drumsRow?.sounds) {
    const swap = new Map(Object.entries(drumsRow.sounds).map(([from, word]) => [from, SOUNDS[word] ?? null] as const)
      .filter((p): p is [string, string] => !!p[1] && passes('drum swap', p[0], p[1], p[0])));
    // ...at the level the drawn voice sounded at: a hit's gain was set against its own voice's level, and where the room
    // had that voice's word off (S18: an "off" is about the word's own voice; the planner struck it some 50 dB over the
    // room's −60), the voice in its place is moved by the difference (PLAN-UNIFY U1, the fast-place birds' bug 3: the
    // crack taking a clap the room had off). Anywhere else, nought: a snare taking the crack plays as it did
    const shift = new Map([...swap].map(([from, to]) => [from, offShift(style, roomLevels, from, to)] as const));
    const soundOnly = new Set(drumsRow.soundOnly ?? []);
    if (swap.size) for (const e of events) { const v = swap.get(e.voice); if (v) { const g = shift.get(e.voice)!; if (g !== 1) e.p = { ...e.p, gain: (e.p.gain ?? 1) * g }; if (soundOnly.has(e.voice)) e.drawn = e.voice; e.voice = v; } }
  }
  // **The phrase plan, after the kit** (liquid-space, 10-11, `src/phrase-development.ts`): what the plan placed once
  // the drums are final — in the manual's order, the bass's dips on the snares the kit really struck, then the one
  // auxiliary part, then the effects, then the surface.
  if (devPlan) {
    const backbeat = layersOfRole('backbeat');
    // **The line steps aside under the snares that sound** (B5, B7): every phrase run's dips laid again on the
    // principal backbeats of the final events — a snare an answer took out, a fill moved or a half-time bar put on
    // the bar's middle leaves no dip where it was, and gains one where it is
    const DIPS = RIFF?.play.dips;
    if (DIPS) {
      const stepS = barSeconds / 16;
      const hits = [...new Set(events.filter((e) => !!e.layer && backbeat.has(e.layer) && e.bar != null && e.step != null && !isGhost(e))
        .map((e) => e.bar! * 16 + e.step!))].sort((a, b) => a - b);
      for (const e of events) {
        if (e.layer !== 'bass' || !Array.isArray(e.p.dips) || e.bar == null || e.step == null) continue;
        const whole = typeof e.p.curveDuration === 'number' ? e.p.curveDuration : Number(e.p.dur);
        const from = e.bar * 16 + e.step, length = Math.round((whole + (RIFF?.play.phraseGapS ?? 0)) / stepS);
        const dips: number[] = [];
        for (const hit of hits) if (hit >= from && hit < from + length) dips.push(+((hit - from) * stepS - DIPS.earlyS).toFixed(4), DIPS.db);
        e.p = { ...e.p, dips };
      }
    }
    // **The one auxiliary part** (P1, P3, P4, P5): its steps over each span the plan entered it for, on the kit's own
    // two-bar cycle, at its lane's trim and its row's level; every span ends where the plan said
    // **Under the phone's ceiling** (the catalogue's 220 units, the voices 4/12/35): the cast this theme already
    // sounds, and what it builds besides that the events do not show (at the merge, builder K's part space), with the
    // auxiliary part's voice and the surface's added where they are new. Over the ceiling, the auxiliary falls to the
    // row's cheapest part, then goes; then the surface goes (the manual: remove an optional auxiliary, then a bed)
    const unitsOf = (voices: Iterable<string>) => [...new Set(voices)].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
    // the keys' own space is cast too: its effects, in the same units
    // (a tone the birds swapped counts the part space the drawn tone would have built: it sounds no dearer, U3)
    const space = keysPlan?.cast?.space ?? keysPlan?.space;
    const castBesides = space ? effectsCost([...space.inserts, ...space.sends, ...space.sends.flatMap((x) => x.after ?? [])].map((x) => x.effect)) : 0;
    const sounding = new Set(events.map(castVoice));
    const before = unitsOf(sounding) + castBesides;
    const costWith = (aux: string | null, bed: boolean) => unitsOf([...sounding, ...(aux ? [aux] : []), ...(bed && SURFACE && devPlan.surface.length ? [SURFACE.voice] : [])]) + castBesides;
    let identity = devPlan.aux.identity, auxVoice = devPlan.aux.spans.length ? AUX?.parts[identity]?.voice ?? null : null, bedOn = true;
    const budget: NonNullable<DevelopmentPlan['budget']> = { ceiling: CAST_CEILING, before, aux: 'kept', surface: 'kept', after: 0 };
    if (costWith(auxVoice, true) > CAST_CEILING && auxVoice && AUX) {
      const cheapest = Object.entries(AUX.parts).sort((x, y) => unitsOf([x[1].voice]) - unitsOf([y[1].voice]))[0];
      if (cheapest && costWith(cheapest[1].voice, true) <= CAST_CEILING) { identity = cheapest[0]; auxVoice = cheapest[1].voice; budget.aux = `cheaper: ${identity}`; }
      else { auxVoice = null; budget.aux = 'dropped'; }
    }
    if (costWith(auxVoice, true) > CAST_CEILING) { bedOn = false; budget.surface = 'dropped'; }
    budget.after = costWith(auxVoice, bedOn);
    devPlan.budget = budget;
    if (budget.aux !== 'kept' || budget.surface !== 'kept') devPlan.summary += ` · over the ceiling (${budget.before} units): auxiliary ${budget.aux}, surface ${budget.surface}`;
    // the ambient voices' weather replaces the surface where it lays anything (admitted, with its fallback, below)
    if (voicesPlan?.weather.spans.length && SURFACE && bedOn && devPlan.surface.length) { replacedSurface = SURFACE.voice; bedOn = false; budget.surface = 'replaced by the weather'; }
    ambientCast = { unitsOf, castBesides };
    const part = auxVoice ? AUX?.parts[identity] : undefined;
    const auxHits: PlanEvent[] = [];
    if (part) {
      const roles: readonly string[] = BY_NAME[part.voice]?.roles ?? [];
      const lane = LANES.find((l) => roles.includes(l.role));
      for (const span of devPlan.aux.spans) for (let bar = span.from; bar < span.to; bar++) {
        const r = new Rng(`${seed}::auxhit:${bar}`);
        for (const st of part.steps) {
          const play = r.chance(st.p), wobble = r.float(-0.08, 0.08), pan = r.float(-0.1, 0.1);
          if (Math.floor(st.step / 16) !== ((bar % part.cycleBars) + part.cycleBars) % part.cycleBars || !play) continue;
          const step = st.step % 16;
          const gain = (lane ? trimOf(lane, part.voice).gain ?? 1 : 1) * dbToGain(part.gainDb);
          push(part.voice, at(bar, step), { vel: +Math.max(0.05, Math.min(1, st.vel * (1 + wobble))).toFixed(3), gain,
            ...(part.pan != null ? { pan: +Math.max(-1, Math.min(1, part.pan + pan)).toFixed(3) } : {}),
            ...(part.room != null ? { room: part.room } : {}), ...(part.reverb != null ? { reverb: part.reverb } : {}), ...(st.params ?? {}) },
          { bar, step, layer: layerOf(part.voice) });
          auxHits.push(events[events.length - 1]);
        }
      }
    }
    // **One throw** (F1): the plan's backbeat throw on its phrase's fourth bar, or its rim answer's last hit, into the
    // place's echo and room by the place's own amounts; the place's end throw was checked when the plan drew it
    const T = drumsRow?.throws;
    for (const th of devPlan.throws) {
      const target = th.kind === 'mid'
        ? events.find((e) => e.bar === th.bar && e.step === 12 && !!e.layer && backbeat.has(e.layer) && !isGhost(e))
        : auxHits.filter((e) => e.bar === th.bar).pop();
      if (target && T) target.p = { ...target.p, delay: Math.max(T.delay, target.p.delay ?? 0), reverb: Math.max(T.reverb, target.p.reverb ?? 0) };
      (th as { played?: boolean }).played = !!(target && T);
    }
    // **The surface** (N1, N4): one bed under each span the plan found, in events of the row's length laid end to end
    // (the voice's own fades overlap them into one surface, and a seek resumes it on the next), each at its place on
    // the span's one slow arc of level and brightness; the last ends a fade early, so the bed is gone at the line
    layOldSurface = () => {
      if (!SURFACE) return;
      const fade = SURFACE.tailS ?? 0;
      for (const span of devPlan.surface) {
        const n = span.to - span.from;
        for (let b = span.from; b < span.to; b += SURFACE.segmentBars) {
          const segBars = Math.min(SURFACE.segmentBars, span.to - b), last = b + segBars >= span.to;
          const u0 = (b - span.from) / n, u1 = (b + segBars - span.from) / n;
          const db = SURFACE.present[span.class] + arcAt(SURFACE.level, (u0 + u1) / 2) + (devEntry?.surfaceDb ?? 0);
          const dur = segBars * barSeconds - (last ? fade : 0);
          if (dur <= 0.5) continue;
          push(SURFACE.voice, b * barSeconds, { dur: +dur.toFixed(4), vel: SURFACE.vel, gain: +dbToGain(db).toFixed(4),
            lpMul: [+arcAt(SURFACE.bright, u0).toFixed(3), +arcAt(SURFACE.bright, u1).toFixed(3)], midi: SURFACE.midi, reverb: SURFACE.reverb },
          { bar: b, layer: layerOf(SURFACE.voice) });
        }
      }
    };
    if (SURFACE && bedOn) layOldSurface();
  }
  // **The ambient voices, admitted and laid** (liquid-ambient), once every pass that adds a voice has run (the sparse
  // texture's lift, the silence's fill): every new part through the phrase plan's units against the cast the program
  // will really sound, in the admission row's order against its target, each fallback recorded (a weather over it gives
  // the surface back); then the motif on its owner (a keys-voiced note on each of the tone's layers into the part's
  // space, as the keys' own), the fillers, the weather, the thunder
  const layAmbientVoices = () => {
    if (!voicesPlan || !devPlan || !ambientCast) return;
    admitAmbient(voicesPlan, { sounding: new Set(events.map(castVoice)), besides: ambientCast.castBesides, ceiling: CAST_CEILING, unitsOf: ambientCast.unitsOf, surfaceVoice: replacedSurface, keysPlan: keysPlan! });
    devPlan.summary += ` · ${voicesPlan.summary}`;
    if (replacedSurface && !voicesPlan.weather.spans.length) { devPlan.budget!.surface = 'kept: the weather was over the budget'; layOldSurface?.(); }
    {
      const sectionKind = (bar: number) => (arrangement.sections.find((x) => bar >= x.startBar && bar < x.startBar + x.bars) ?? arrangement.sections[arrangement.sections.length - 1]).kind;
      const keysMix = (bar: number) => { let at = keysPlan!.sections[0]; for (const x of keysPlan!.sections) if (x.startBar <= bar) at = x; return at.levelDb; };
      for (const a of ambientEvents(voicesPlan, { barSeconds, spell: bias.spell as unknown as Record<string, number>, sectionKind, seed: String(seed) })) {
        if (a.bar < 0 || a.bar >= bars) continue;
        if (a.keysLayer) {
          const { levelDb, ...p } = a.p as { levelDb: number } & NoteParams;
          for (const L of keysPlan!.layers) {
            push(L.voice, a.t, { ...p, gain: L.gain * dbToGain(keysMix(a.bar) + levelDb), partSpace: 1, hall: 0, delay: 0, reverb: 0, tremolo: 1, ...swapSound(p.lpMul) },
              { bar: a.bar, step: a.step, layer: layerOf(L.voice), note: noteName(p.midi as number), role: 'sparse-keys', part: a.part, treatment: 'none' });
            keysEvents.push(events[events.length - 1]);
            castAsDrawn(events[events.length - 1], L.voice);
          }
          continue;
        }
        push(a.voice, a.t, a.p as NoteParams, { bar: a.bar, ...(a.step != null ? { step: a.step } : {}), layer: layerOf(a.voice),
          ...(typeof a.p.midi === 'number' && a.role === 'detail' ? { note: noteName(a.p.midi) } : {}), ...(a.role ? { role: a.role } : {}),
          ...(a.part ? { part: a.part } : {}), ...(a.role === 'detail' ? { treatment: 'none' as const } : {}) });
        if (a.ownLevel) ambientOwn.push(events[events.length - 1]);
      }
    }
    // laid after the theme's events were put in time order: in order again (stable, so nothing else moves)
    events.sort((a, b) => a.t - b.t);
  };
  // **What plays, admitted once more** (the same check, on the events): a
  // voice an explicit tone cannot reach is a refusal of the request, said with
  // its reason, never a tone quietly dropped (`parts/treat.ts` skips only a
  // style's own preference); a forbidden voice still sounding — a list the
  // interpreter could not empty and left alone, as its note says — is written
  // on the plan beside the refusals.
  if (forbidden.size || Object.keys(explicitTone).length) {
    const seen = new Set<string>();
    for (const e of events) {
      if (seen.has(e.voice)) continue;
      seen.add(e.voice);
      const why = inadmissible(e.voice);
      if (!why) continue;
      if (!why.startsWith('the recipe forbids')) throw new Error(`Recipe ${recipe?.id ?? request.pin?.id}: ${why}`);
      admission.push({ at: 'plays', lane: e.layer ?? e.voice, voice: e.voice, kept: null, why });
    }
  }
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
      // A sub-section whose only sound was a noise the gate took is not heard (round M1).
      const gone = new Set(subGlue.filter((g) => !kept.includes(g.ev as never)).map((g) => g.line));
      if (gone.size) {
        const silent = namedSubs.filter((s) => gone.has(s.startBar + s.bars) && s.row.figure?.glue && !s.row.figure.lanes && !s.row.figure.layers);
        if (silent.length) {
          namedSubs = namedSubs.filter((s) => !silent.includes(s));
          for (const row of timeline) { const s = subAt(namedSubs, row.bar); if (s) row.sub = s.label; else delete row.sub; }
        }
      }
    }
  }
  // The offbeat hat thinned by its section: house-v2's `hatSections` (`src/hats.ts`).
  if (switchOn(style, 'hatSections')) {
    // a kit state's own hats (liquid-space: a pulse's offbeats) are the state's, and the section's thinning leaves them
    const thinned = new Set(hatsBySection(events, arrangement));
    // ...and a build's roll on the hats (U2c, the arrangement's phrases) is the build's
    const built = (e: PlanEvent) => typeof e.by === 'string' && e.by.includes('+build');
    const kept = stateHits.size || events.some(built) ? events.filter((e) => thinned.has(e) || stateHits.has(e) || built(e)) : [...thinned];
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
  // **A held reed is never alone** (`catalogue.exposed`, his ear 10-13 on the Downtempo tile's seed 17: "reed organ
  // in empty quiet room is like a little torture for listener, although the motif is interesting"): after the gaps
  // are filled, a run of bars where a front the block names sounds and nothing else does — no bed, no kick, no bass,
  // no backbeat, no other voice, hats at most a tick or two — takes the theme's own bed, `bedDb` under its level,
  // let go where the run ends (`bedUnderExposed`, `src/silence.ts`).
  const exposedRuns = EXPOSED ? bedUnderExposed(events as any, EXPOSED.fronts, EXPOSED.bedDb, bars, barSeconds, progression.loopBars || 8, timeline, exposedBed) : [];
  layAmbientVoices();
  const swells = switchOn(style, 'swellIn')
    ? swellsOf({ style, spell: bias.spell, barSeconds, bars, arrangement, timeline, events, lanes: LANES }) : [];
  applySwells(events, swells, barSeconds);
  // the ambient bed's notes keep their own entrance (each opens over its own crest), whatever a layer's entrance swell wrote
  for (const [e, sw] of ambientSwell) e.p = { ...e.p, swell: sw };
  // The melodic bus's filter, moved by the section where the spell, the cast,
  // the section and the seam let it: house-v2's `busSweeps`, the rules at the
  // head of `src/sweep.ts`. Automation only; the record never asks.
  // The glue's noises come in and go out by a curve where the spell and the
  // cast ask it: house-v2's `glueFades`, the rules in `src/sweep.ts`.
  if (switchOn(style, 'glueFades'))
    glueFadesOf({ style, spell: bias.spell, barSeconds, timeline, events, lanes: LANES, beat }, GLUE_SHAPES, true);
  // **The bed up and back** (round DNB-7, `BedEntry.up`; his rule on DNB-6, 10-05: *"all
  // pads, drones and synths should sit on the higher octaves in DnB, so they don't steal
  // the stage from the drums and bass"*): where the drums and the bass play — every
  // section that does not lift — the harmonic lanes' notes an octave or two up and under
  // where they were; a lifted section keeps its bed.
  if (placesOn && bedRow?.up) {
    const U = bedRow.up;
    const bed = layersOfRole('sustained', 'figure');
    const flat = arrangement.sections.filter((s) => !s.lift);
    const gain = dbToGain(U.db);
    // **A chord folded into the window keeps one of each note** (the deep
    // review of 10-08, B7): two notes of a chord an octave apart fold onto the
    // same pitch, and the voice then struck it twice at once — 302 of 1301
    // pad chords. The second strike of a pitch the same layer already strikes
    // at that instant is dropped, its length kept on the one that stays.
    const struck = new Map<string, PlanEvent>();
    const twice = new Set<PlanEvent>();
    for (const e of events) {
      if (!e.layer || !bed.has(e.layer) || typeof e.p?.midi !== 'number' || e.role === 'sparse-keys' || e.role === 'detail') continue;
      const bar = e.t / barSeconds + 1e-6;
      if (!flat.some((s) => bar >= s.startBar && bar < s.startBar + s.bars)) continue;
      // the ambient bed's notes are in their final register already (its own register policy): level only
      const midi = ambientNotes.has(e) ? e.p.midi : foldTo(e.p.midi + 12 * U.octaves, U.floor, U.ceiling);
      e.p = { ...e.p, midi, gain: (e.p.gain ?? 1) * gain, ...(typeof e.p.slideFrom === 'number' ? { slideFrom: e.p.slideFrom + (midi - e.p.midi) } : {}) };
      const key = `${e.layer}|${e.voice}|${Math.round(e.t * 1e6)}|${midi}`;
      const first = struck.get(key);
      if (!first) { struck.set(key, e); continue; }
      if (Number(e.p.dur) > Number(first.p.dur)) first.p = { ...first.p, dur: e.p.dur };
      twice.add(e);
    }
    if (twice.size) {
      const kept = events.filter((e) => !twice.has(e));
      events.length = 0;
      events.push(...kept);
    }
  }
  // A place's thinned breakdowns (round DNB-4, `BedEntry.thinHz`): the bus's
  // high-pass held at the row's corner across every section that lifts, beside
  // whatever moves the rules laid (the fast places' spell lays none).
  const holdMove = (stage: 'hp' | 'lp', hz: number) => arrangement.sections.filter((s) => s.lift).map((s) => ({ kind: 'hold' as const, stage,
    bar: s.startBar, bars: s.bars, line: s.startBar, section: s.kind, hz, spell: 'place', cast: 'place', sectionVerdict: 'place', laid: true }));
  // ...and the bed's band in every other section (round DNB-5, `BedEntry.bandHz`):
  // the bus held between the row's two corners where nothing lifts it, so the
  // bed sits over the line's harmonics and under the snare's crack.
  const bandMove = (stage: 'hp' | 'lp', hz: number) => arrangement.sections.filter((s) => !s.lift).map((s) => ({ kind: 'hold' as const, stage,
    bar: s.startBar, bars: s.bars, line: s.startBar, section: s.kind, hz, spell: 'place', cast: 'place', sectionVerdict: 'place', laid: true }));
  const thinMoves = placesOn ? [...(bedRow?.thinHz ? holdMove('hp', bedRow.thinHz) : []), ...(bedRow?.darkHz ? holdMove('lp', bedRow.darkHz) : []),
    ...(bedRow?.bandHz ? [...bandMove('hp', bedRow.bandHz[0]), ...bandMove('lp', bedRow.bandHz[1])] : [])] : [];
  const ruled = switchOn(style, 'busSweeps') ? sweepsOf({ style, spell: bias.spell, barSeconds, bars, arrangement, timeline, events, lanes: LANES, swells }) : null;
  const sweeps = ruled || thinMoves.length
    ? sweepCurves(thinMoves.length ? [...(ruled ?? []), ...thinMoves].sort((a, b) => a.bar - b.bar) : ruled!, barSeconds) : null;

  // MEASURED: a breakdown lifts the pad and midrange by about 1.4 dB.
  // ...or the place's own, where its bed row says (round DNB-4, `BedEntry.liftDb`).
  // A place's row may name it by the section's kind.
  const liftOf = (kind: string) => {
    const own = placesOn ? bedRow?.liftDb : undefined;
    return dbToGain(own == null ? S.master.breakdownLiftDb : typeof own === 'number' ? own : own[kind] ?? S.master.breakdownLiftDb);
  };
  // Two lifted sections side by side are one lift: the gain goes from the first's to the second's across the line
  // and never back to unity between them (the review of 10-08, B11: a 1.4 dB dip for a second at each such line).
  const melodicGain: PlanPoint[] = [{ t: 0, value: 1 }];
  arrangement.sections.forEach((s, i) => {
    if (!s.lift) return;
    const lift = liftOf(s.kind);
    const a = s.startBar * barSeconds;
    const b = (s.startBar + s.bars) * barSeconds;
    const prev = arrangement.sections[i - 1], next = arrangement.sections[i + 1];
    const fromLift = !!prev?.lift && prev.startBar + prev.bars === s.startBar;
    const intoLift = !!next?.lift && s.startBar + s.bars === next.startBar;
    if (!fromLift) melodicGain.push({ t: Math.max(0.01, a - 0.4), value: 1 });
    melodicGain.push({ t: a + 0.4, value: lift });
    melodicGain.push({ t: b - 0.6, value: lift });
    if (!intoLift) melodicGain.push({ t: b, value: 1 });
  });

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
    push: pushCurve(arrangement, drumsRow?.push ? { ...S.push, ...drumsRow.push } : S.push, edges).map((p) => ({
      t: Math.max(0, p.bar * barSeconds),
      value: p.value,
    })),
    ...(sweeps && (sweeps.hp || sweeps.lp) ? { sweep: sweeps } : {}),
  };
  // **The arrangement's phrases on the automation** (PLAN-UNIFY U2): a filtered phrase closes the master's low-pass and
  // opens it into its line; a breakdown-lite lifts the melodic bus as a breakdown does (the bed exposed); the field
  // leans into an answered arrival and back. What was heard is what the track names.
  const phrasing: Phrasing | null = phrased ? (() => {
    const P = phrased.phrasing, R = PHRASING_ROWS.ring;
    const heardIn = (from: number, to: number) => phrased.subs.some((x) => phraseHeard.has(x) && x.startBar < to && x.startBar + x.bars > from);
    const segments = P.segments.filter((x) => x.kind === 'filtered' || heardIn(x.from, x.to));
    const heardBy = (by?: SubSection) => !by || phraseHeard.has(by);
    for (const x of segments) {
      const a = x.from * barSeconds, d = x.to * barSeconds;
      if (x.kind === 'breakdown-lite') {
        const e = R.segments.liftEdgeS, end = (x.reentry ? x.to - 1 : x.to) * barSeconds;
        automation.melodicGain = bumpCurve(automation.melodicGain, Math.max(0.01, a - e), a + e, end - e, end, dbToGain(R.segments.liftDb));
      }
    }
    // the builds' filter cuts and openings and their field (its rise, the stop, back on the line) (U2c), each where heard,
    // and never over a stretch the arrangement's own line already moves (a build's sweep into its drop, a breakdown's
    // way out: the review of U2b, a dip choked the sweep it sat on within a beat)
    const dipped = new Set<object>();
    // (a dip held into a break reads the line up to the main's own last point, the break's cut being the break's; every
    // dip is read on the line as the arrangement wrote it, before any phrase's dip)
    const ownLine = automation.macroFilter;
    const moving = (a: number, d0: number, hold: boolean) => {
      const d = hold ? d0 - 0.01 * barSeconds : d0;
      const pts = ownLine, inside = pts.filter((p) => p.t > a + 1e-6 && p.t < d - 1e-6);
      const at = (t: number) => { let prev = pts[0]; for (const p of pts) { if (p.t >= t) return prev.t === p.t ? p.value : prev.value + (p.value - prev.value) * (t - prev.t) / (p.t - prev.t); prev = p; } return prev?.value ?? 0; };
      const v0 = at(a);
      return inside.some((p) => Math.abs(p.value - v0) > 0.01 * v0) || Math.abs(at(d) - v0) > 0.01 * v0;
    };
    const lays = (m: (typeof phrased.moves.dips)[number]) => heardBy(m.by) && !moving(m.a, m.into ? m.reopen!.d : m.d, !!m.hold && !m.into);
    for (const m of phrased.moves.dips) if (lays(m)) {
      // a dip held into the next opens as it would have where the next is not laid (never a fade across a stretch)
      if (m.into && !lays(m.into)) { automation.macroFilter = dipCurve(automation.macroFilter, m.a, m.b, m.reopen!.c, m.reopen!.d, m.hz); dipped.add(m); continue; }
      automation.macroFilter = dipCurve(automation.macroFilter, m.a, m.b, m.c, m.d, m.hz, !!m.hold);
      dipped.add(m);
    }
    for (const g of phrased.moves.gains) if (heardBy(g.by)) automation.melodicGain = factorCurve(automation.melodicGain, g.knots);
    for (const x of P.answers) if (x.field) {
      const t = x.bar * barSeconds;
      automation.melodicGain = bumpCurve(automation.melodicGain, t - R.answers.leadBars * barSeconds, t, t, t + R.answers.releaseBeats * beat, dbToGain(x.field));
    }
    // **the labels say what was heard** (the review of U2b; the ring will read them): each part of an answer only where
    // its sub-section was heard, its crash or swell struck on the line, its dip or glide laid
    const struck = (voice: string | undefined, bar: number) => !!voice && events.some((e) => e.voice === voice && e.bar === bar);
    const holds = (x: import('./phrasing.ts').Said) => heardBy(x.by) && (x.crash === undefined || struck(stroke?.voice, x.crash))
      && (x.swell === undefined || struck(swell?.voice, x.swell)) && (!x.dip || dipped.has(x.dip)) && (!x.glide || glided.has(x.glide));
    // the stroke named as it sounds: a sweep, an impact or a crash (the review of U2c: 232 of 589 "crashes" were a sweep)
    const strokeWord = (bar: number) => stroke && /sweep/i.test(stroke.voice) ? `a sweep into ${bar}` : stroke && /impact/i.test(stroke.voice) ? `an impact on ${bar}` : `a crash on ${bar}`;
    for (const n of phrased.notes) for (const x of n.said) if (x.crash !== undefined) x.text = strokeWord(x.crash);
    for (const n of phrased.notes) {
      const { label, parts } = saidOf(n, holds);
      if (n.segment) { n.segment.label = label; if (parts.length) n.segment.answered = parts; else delete n.segment.answered; }
      if (n.out) { n.out.label = label; n.out.lift = parts; }
    }
    return summarised({ segments, answers: P.answers, outs: P.outs.filter((x) => heardIn(x.from, x.to)), cooldowns: P.cooldowns });
  })() : null;

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
  // ...the derived state's lean on the bass lane and the place's bass mass
  // over it (`seasoningOf`, the one chain the live seasoning reads too). The
  // lane table says who the bass lane is — a role and not a name.
  const bassLane = new Set(LANES.filter((l) => l.role === 'bassline').map((l) => voiceOf(l)));
  const knobs = seasoningOf(style, bias, knobTables, bassLane, bpm);
  const bassPlaced = placesOn ? nearestEntry(BASS_SOUND, bias.spell, bpm) : null;

  // **The bass's gate by place** (round DNB-4, `BassEntry.gate`): where the
  // nearest bass row states one, every note of the line ends a little before
  // the next strikes and holds no longer than the row's most, so the line is
  // notes with air between them rather than one held tone that only changes.
  if (bassPlaced?.gate) {
    const step = barSeconds / 16, { mostSteps, gapSteps } = bassPlaced.gate;
    const line = events.filter((e) => e.layer === 'bass' && typeof e.p?.dur === 'number').sort((a, b) => a.t - b.t);
    for (let i = 0; i < line.length; i++) {
      const e = line[i];
      let j = i + 1;
      while (j < line.length && line[j].t <= e.t + 1e-6) j++;
      let d = Math.min(e.p.dur as number, mostSteps * step);
      // a note the next glides out of is not cut before it (round DNB-6: the riff's runs)
      if (j < line.length && line[j].p.slideFrom == null) d = Math.min(d, line[j].t - e.t - gapSteps * step);
      if (d >= step / 2 && d < (e.p.dur as number) - 1e-6) e.p = { ...e.p, dur: d };
    }
  }

  // **The line's motion by place** (round DNB-5, `BassEntry.wobbleBeats`,
  // `glideS`, `pitchCents`): on every note of the place's bass, the sweep on
  // the grid — its rate the period's, and where in its cycle the note starts,
  // nought the corner at its lowest on the bar line — the slide into a note
  // the composer wrote legato, and the pitch's share of the sweep. A voice that
  // does not declare the controls reads none of it.
  if (bassPlaced && (bassPlaced.wobbleBeats || bassPlaced.glideS || bassPlaced.pitchCents)) {
    const voice = SOUNDS[bassPlaced.sound];
    const period = (bassPlaced.wobbleBeats ?? 0) * beat;
    for (const e of events) {
      if (e.layer !== 'bass' || !voice || e.voice !== voice) continue;
      const add: Record<string, number> = {};
      if (period > 0) {
        // the line's own pulse on the grid, shifted where the place says (10-06: source 9's sub swells on the eighth)
        const turns = e.t / period + (bassPlaced.wobblePhase ?? 0);
        add.movementHz = +(1 / period).toFixed(5);
        add.movementPhase = +(((turns % 1) + 1) % 1).toFixed(5);
      }
      if (bassPlaced.glideS && typeof e.p.slideFrom === 'number') add.glide = bassPlaced.glideS;
      if (bassPlaced.pitchCents) add.pitchCents = bassPlaced.pitchCents;
      // An intrinsic beat in the voice keeps its phase across runs. Record
      // the phase in the original theme before an offline window rebases t.
      // A note on the riff's pair clock (`play.pairClock`) has its rate and phase already.
      const controls = BY_NAME[voice]?.controls;
      const beatHz = pairOf(voice)?.hz;
      if (controls?.subBeatPhase && typeof beatHz === 'number' && beatHz > 0 && e.p.subBeatPhase === undefined) {
        const turns = e.t * beatHz + (controls.subBeatPhase.default ?? 0);
        add.subBeatPhase = +(((turns % 1) + 1) % 1).toFixed(6);
      }
      e.p = { ...e.p, ...add };
    }
  }

  // **A kick inside a pressed run** (the liquid bass rounds, 10-07): where the riff's phrase marks a run
  // `press`, a kick that lands inside it while the run still holds through the kick's duck asks the low
  // duck at the row's depth (`duckLowDb`); the room's duck shape keeps its times. The kicks are the
  // events that post the sidechain, as the compiler reads them (a descriptor that plays the kick role).
  if (pressed.length) {
    const recover = beat * (drumsRow?.duck?.recoverBy ?? S.sidechain.recoverBy);
    for (const e of events) {
      if (!BY_NAME[e.voice]?.roles.includes('kick')) continue;
      const run = pressed.find((w) => e.t > w.from + 1e-6 && e.t + recover <= w.to + 1e-6);
      if (run) e.p = { ...e.p, duckLowDb: run.db };
    }
  }

  // **The master's tone by place** (round E1, `eqByTheme`): the room's own
  // profile moved by the nearest row of the style's EQ table, written into the
  // theme's room so its settings carry it -- and the program's settings hash
  // with them. Nothing is written where the row is the house's.
  const eqRowPlaced = placesOn && switchOn(style, 'eqByTheme') ? nearestEntry(PLACED.eq, bias.spell, bpm) : null;
  const eqPlaced: EqProfile | null = eqRowPlaced
    ? placedProfile(eqRowPlaced, eqProfileOf(style.base.master),
      eqProfileOf({ ...style.base.master, ...((pre.params as { master?: Partial<EqProfile> } | undefined)?.master ?? {}) }))
    : null;
  // **Root in the low end's tone** (U2b, his ear 10-13 on the Drum & Bass tile's Root sweep: "less bass (if ears are
  // tired) but still good DnB!! We could technically connect Root to EQ"): the row's lean on the master's low shelf,
  // nought at the tile's own Root, so the tile's settings are the ones they were
  const shelfLean = eqPlaced ? leanShift(eqRowPlaced?.leans, 'lowShelfDb', bias.spell) : 0;
  if (eqPlaced && shelfLean) eqPlaced.lowShelfDb = +(eqPlaced.lowShelfDb + shelfLean).toFixed(3);

  // **The bass drive in parallel by place** (round B1, `placeTables`): the
  // driven copy's blend from the nearest row of the style's table, written
  // into the theme's room as `bass.parallel` where it is above nought -- the
  // graph builds the copy off it (`master.ts`) -- and written nowhere else, so
  // a theme the table leaves clean resolves to the settings it always had.
  // The corner follows the theme's bass register: the lowest tenth of the
  // bass part's notes, as pitch, so a low, dark theme gets its edge an octave
  // under a bright one's; the birds then move it (`bassDriveFor`).
  // Round EQ-1: where no row of the table stands nearer than the house's own
  // place, the house's own row plays (`bassDriveHouse`, as `subSectionsHouse`
  // does for the small things).
  const bassDriveRow = placesOn ? nearestEntry(PLACED.bassDrive, bias.spell, bpm) ?? PLACED.bassDriveHouse ?? null : null;
  const bassMidis = bassDriveRow ? events.filter((e) => e.layer === 'bass' && Number.isFinite(e.p?.midi)).map((e) => e.p.midi as number).sort((a, b) => a - b) : [];
  const bassRegisterHz = bassMidis.length ? midiToHz(bassMidis[Math.floor(0.1 * (bassMidis.length - 1))]) : 0;
  const bassDrivePlaced = bassDriveFor(bassDriveRow, bias.spell, bassRegisterHz);

  // **The bed by place** (round EQ-2): the row read above, into the theme's
  // room -- the keys' and the pad's levels raised to the row's floor where
  // the room stands under it (the whole floor here, so the beds below are read
  // standing on it; round EQ-6 keys it to them section by section), the melodic duck at the row's depth, the
  // presence bell on the harmonic bus, the strings' corner where the place
  // keeps its own -- and nothing where the row leaves a field out, so a
  // theme whose room already stands where the row asks resolves as it did.
  const bedLevels = bedRow ? {
    ...(bedRow.keysDb != null && S.levels.keys < bedRow.keysDb ? { keys: bedRow.keysDb } : {}),
    ...(bedRow.padDb != null && S.levels.pad < bedRow.padDb ? { pad: bedRow.padDb } : {}),
    ...(bedRow.pianoDb != null && S.levels.piano < bedRow.pianoDb ? { piano: bedRow.pianoDb } : {}),
    // the ceilings (round DNB-3): a room over the place's ceiling comes down to it
    ...(bedRow.keysCeilDb != null && S.levels.keys > bedRow.keysCeilDb ? { keys: bedRow.keysCeilDb } : {}),
    ...(bedRow.padCeilDb != null && S.levels.pad > bedRow.padCeilDb ? { pad: bedRow.padCeilDb } : {}),
    ...(bedRow.pianoCeilDb != null && S.levels.piano > bedRow.pianoCeilDb ? { piano: bedRow.pianoCeilDb } : {}),
  } : {};
  const bedOverrides = bedRow ? {
    // over the sixteenths' lean's shaker level and never instead of it: the two
    // are one `levels` key in the literal below
    ...(Object.keys(bedLevels).length ? { levels: { ...(leanLevels || {}), ...bedLevels } } : {}),
    ...(bedRow.stringsHz != null && bedRow.stringsHz !== S.strings.cutoffHz ? { strings: { cutoffHz: bedRow.stringsHz } } : {}),
    ...(bedRow.bellDb ? { harmonicBell: { ...BED_BELL, db: bedRow.bellDb } } : {}),
  } : {};
  const duckDepth = {
    ...(bedRow?.duckDb != null && bedRow.duckDb !== S.sidechain.depthDb ? { depthDb: bedRow.duckDb } : {}),
    // the struck voices' own (round PIANO-2), where the row says other than the room
    ...(bedRow?.struckDuckDb != null && bedRow.struckDuckDb !== S.sidechain.struckDepthDb ? { struckDepthDb: bedRow.struckDuckDb } : {}),
  };

  // **The keys at the part's own level** (liquid-space round 1): the level table's word on
  // the keys' voice (the room's, under the place's bed ceiling) taken back off each note, so
  // what sets the part's level is the part's space (its trim) and the section's class.
  if (keysEvents.length) {
    const levels = { ...roomLevels, ...bedLevels } as Record<string, number>;
    for (const e of [...keysEvents, ...ambientOwn]) {
      const db = laneLevelDb(style, levels, e.voice, BY_NAME[e.voice].level);
      if (Number.isFinite(db)) e.p = { ...e.p, gain: +((e.p.gain ?? 1) / dbToGain(db as number)).toFixed(6) };
    }
  }
  // **A pickup owns its window** (manual §5: a keys pickup is priority 3, over a decorative
  // texture): a texture event struck inside one is not played. The windows ride on the plan
  // (`keys.reserved`) for a planner that places answers and effects to read.
  if (keysPlan) {
    const step16 = barSeconds / 16;
    const kept = events.filter((e) => !(e.role === 'texture' && inPickup(keysPlan, e.t / step16)));
    if (kept.length !== events.length) { events.length = 0; events.push(...kept); }
  }
  // The part's space's dry and sends by section: the class's `send` and `dry` over the space row's.
  if (keysPlan) {
    const R = keysPlan.space;
    const at = (key: 'dry' | 'send', base: number) => {
      const pts: PlanPoint[] = [];
      let last: number | null = null;
      for (const x of keysPlan.sections) {
        const v = +(base * x[key]).toFixed(5), t = x.startBar * barSeconds;
        if (last === null) pts.push({ t: 0, value: v });
        else if (v !== last) pts.push({ t: Math.max(0, t - 0.12), value: last }, { t: t + 0.12, value: v });
        last = v;
      }
      return pts;
    };
    (automation as PlanAutomation).partSpace = { dry: at('dry', R.dry), sends: Object.fromEntries(R.sends.map((x) => [x.id, at('send', x.level)])) };
  }

  // **The written passage** (`src/passage.ts`): where the place names one, its window counted from the first drop is
  // rewritten as the row writes it — the soloist's phrases, the keys' touches, the drums' states and endings, the bass's
  // variants, the shared hall and echo — and the rest of the track is left as the planners laid it; where the place
  // also names a producer row (`src/producer.ts`), the grammar arranges the whole track around it and the row it writes
  // is the one played
  // the producer names the passage it keeps (its row's `passage`); a place may name a passage alone
  const producerRow = ownTheme && ambientEntry?.producer ? PRODUCER_ROWS[ambientEntry.producer] ?? null : null;
  const passageId = producerRow?.passage ?? (ownTheme ? ambientEntry?.passage : undefined);
  const passageRow = passageId ? PASSAGE_ROWS[passageId] ?? null : null;
  // the arrivals are the keys' landings; a keyless place takes no passage yet (U0 is sound-neutral: the phrase map's
  // arrivals would let the producer run where `local` played none — a round that wants that says so with his A/B)
  const arrivals = keysPlan?.landings ?? null;
  const firstDrop = arrangement.sections.find((x) => x.kind === 'drop')?.startBar;
  const passage = passageRow && arrivals && firstDrop != null ? (() => {
    const levels = { ...roomLevels, ...bedLevels } as Record<string, number>;
    const isKick = (v: string) => !!BY_NAME[v]?.roles.includes('kick'), isSnare = (v: string) => !!BY_NAME[v]?.roles.includes('backbeat');
    const degreeAt = (bar: number) => chordAtBar(progression, bar).degree;
    const arranged = producerRow ? arrange({ row: producerRow, seed: String(seed), spell: bias.spell as unknown as Record<string, number>, sections: arrangement.sections,
      bars, drop: firstDrop, landings: arrivals, phraseBars: time!.phraseBars, time: time!, events, barSeconds, isKick, scale, tonic: rootPc, degreeAt, bedVoice }) : null;
    const played = playPassage({ row: arranged?.row ?? passageRow, events, bars, barSeconds, beat, drop: firstDrop, tonic: rootPc, scale,
      landings: arrivals.map((l) => l.bar), degreeAt,
      ownGain: (voice, db) => { const lane = laneLevelDb(style, levels, voice, BY_NAME[voice].level); return dbToGain(db) / dbToGain(Number.isFinite(lane) ? lane as number : 0); },
      layerOf, isKick, isSnare, bedVoice, noteName, ceiling: CAST_CEILING,
      // a keys tone the birds swapped: its room as a send to the field's hall, kept beside the passage's own keys sends
      ...(keysPlan?.cast?.hall != null ? { keysRoomHall: keysPlan.cast.hall } : {}),
      // the bed's own level where the groove plays: its row's full level as the planner writes a note's gain, and the
      // place's lift of the bed in a section that does not lift (`bedRow.up`), as the bed's notes take it
      ...(ambientPlan ? (() => { const full = bedRowOf(ambientPlan.rows.bed)?.colour.levelDb.full;
        return full == null ? {} : { bedGain: +(10 ** (full / 20)).toFixed(4) * (bedRow?.up ? dbToGain(bedRow.up.db) : 1) }; })() : {}),
      castWith: (voices, returns) => [...new Set(voices)].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0)
        + ([keysPlan?.cast?.space ?? keysPlan?.space, ...returns] as Array<SpaceRow | undefined>).reduce((a: number, x) =>
          a + (x ? effectsCost([...x.inserts, ...x.sends, ...x.sends.flatMap((y) => y.after ?? [])].map((y) => y.effect)) : 0), 0) });
    // the arrangement's filter spans (the harmony-alone section less dull): the macro line's and the melodic sweep's corners
    // inside each span walked from its first value to its second
    for (const F of arranged?.filters ?? []) {
      const a = F.from * barSeconds, z = F.to * barSeconds - 1e-3;
      const walk = (pts: Array<{ t: number; value: number }> | undefined, [v0, v1]: [number, number]) => {
        if (!pts) return;
        for (const p of pts) if (p.t >= a - 1e-6 && p.t <= z) p.value = +(v0 * (v1 / v0) ** ((p.t - a) / (z - a))).toFixed(2);
      };
      walk(automation.macroFilter, F.macro);
      const sw = (automation as PlanAutomation).sweep;
      walk(sw?.lp?.cutoff, F.lp);
      walk(sw?.hp?.cutoff, F.hp);
    }
    return { ...played, phrases: arranged?.phrases ?? [], filters: arranged?.filters ?? [] };
  })() : null;
  if (passage) {
    (automation as PlanAutomation).returns = passage.lines;
    if (devPlan) devPlan.summary += ` · ${passage.summary}`;
  }
  // **A swapped keys tone's room where the theme builds no shared hall** (PLAN-UNIFY U3; the shared returns are the
  // passage's): never a send into a return that is not there. Its own room insert where the drawn tone's inserts pay
  // for it, else no room, and the note at its own direct level
  if (keysPlan?.cast?.hall != null && !passage?.returns?.field?.sends?.some((x) => x.id === 'hall')) {
    for (const e of keysEvents) {
      if (!e.p.returns && e.p.direct == null) continue;
      const { direct: _d, returns, ...p } = e.p as NoteParams & { returns?: Record<string, unknown> };
      const { ['field.hall']: _h, ...rest } = returns ?? {};
      e.p = { ...p, ...(Object.keys(rest).length ? { returns: rest } : {}) } as NoteParams;
    }
    if (keysPlan.cast.ownRoom) keysPlan.space = keysPlan.cast.ownRoom;
  }


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
      ...(drumsRow?.push ? { push: { ...drumsRow.push } } : {}),
      ...(leanLevels ? { levels: leanLevels } : {}),
      ...(characters && events.some(e => e.p.background || e.p.immersed) ? { backgroundSpaces: characters.returns } : {}),
      ...(eqPlaced || drumsRow?.clip || drumsRow?.busComp || drumsRow?.limiterReleaseMs != null ? { master: { ...(eqPlaced ?? {}), ...(drumsRow?.clip ? { drumClip: (({ mix: _mix, ...drums }) => drums)(drumsRow.clip), ...(drumsRow.clip.mix ? { mixClip: { ...drumsRow.clip.mix } } : {}) } : {}),
        ...(drumsRow?.busComp ? { busComp: { ...drumsRow.busComp } } : {}),
        // the place's limiter release (the liquid bass rounds, 10-07); the live master follows it (`mix.ts`)
        ...(drumsRow?.limiterReleaseMs != null ? { limiter: { releaseMs: drumsRow.limiterReleaseMs } } : {}) } } : {}),
      ...(bassDrivePlaced || drumsRow?.bassComp || drumsRow?.bassBodyDb != null ? { bass: { ...(bassDrivePlaced ? { parallel: bassDrivePlaced } : {}),
        ...(drumsRow?.bassComp ? { comp: { ...drumsRow.bassComp } } : {}),
        // the place's own body on the line (10-06: the house's +3 dB at 115 Hz read as mud under a clean sine line)
        ...(drumsRow?.bassBodyDb != null ? { bodyDb: drumsRow.bassBodyDb } : {}) } } : {}),
      ...(drumsRow && drumsRow.kickDecay !== 1 ? { kick: { t20: +(S.kick.t20 * drumsRow.kickDecay).toFixed(4), t34: +(S.kick.t34 * drumsRow.kickDecay).toFixed(4) } } : {}),
      // the place's room and reverb (10-06, hands-on: source 9's drums sit in a bright, wide room, ours in a dark closet)
      ...(drumsRow?.sends ? { sends: { ...drumsRow.sends } } : {}),
      ...(drumsRow?.duck || Object.keys(duckDepth).length ? { sidechain: { ...duckDepth, ...(drumsRow?.duck ? { lowDepthDb: drumsRow.duck.lowDepthDb,
        minimumAt: drumsRow.duck.minimumAt, firstLeg: drumsRow.duck.firstLeg, recoverBy: drumsRow.duck.recoverBy } : {}) } } : {}),
      ...bedOverrides,
      // the part's own space (liquid-space round 1): the keys' tone and hall, one for the theme
      ...(keysPlan ? { partSpace: keysPlan.space } : {}),
      // the theme's shared returns: the written passage's hall and echo
      ...(passage ? { returns: passage.returns } : {}),
    }),
    dice: { ...readout({ form, development, refused, bars, shaped, bassDevelopment, composition, turnRow, preset: pre.id, density, slow, chordRoot,
      scaleName, voicingStyle, CAT, leadTimbre, padTimbre, stabTimbre, UPPER, UPPERS, DERIVED, breakRow, MOTIF, ACCOMPANIMENT_BASS,
      ownFigure, pianoRole, fx, bassTemplate, parts, rhythm, rhythmMotion, rhythmPolicy, rhythmWithheld, stabTemplate, hatTemplate, progression }),
      // the glide line, where the place's bass plays one (round DNB-7): which row, and where it switches
      ...(formRecipe ? { form: formRecipe.id } : {}),
      // the keys' drawn combo (liquid-space round 1), one line a listener can flag a mix by: tone · space · phrase · motif · wetness · density
      ...(keysPlan ? { keys: [keysPlan.choice.tone, keysPlan.choice.space, keysPlan.choice.phrase, keysPlan.choice.motif, keysPlan.choice.wetness, keysPlan.choice.density].join(' · ') } : {}),
      ...(glideOn ? { bassFigure: 'glide', glide: glideRecipe!.id, ...(RIFF ? { riff: RIFF.id } : {}), ...(Number.isFinite(glideSwitchAt) ? { glideSwitchBar: arrangement.sections[glideSwitchAt].startBar } : {}) } : {}) },
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
      ...(() => {
        const given: Record<string, string[]> = Object.fromEntries(Object.entries(playing).filter(([id, voice]) => voice !== ownVoices[id]).map(([id, voice]) => [id, [voice]]));
        // the place's kit (10-06): a part it strikes in a voice of its own (the liquid kit's hats, its ghost snare)
        // plays its group's first lane of the style's, which the kit emptied, wherever that voice sounds; a voice a lane
        // of the group already lists plays that lane (the kit's open hat on the open hat's lane: the review of 10-08, B5)
        if (K) for (const lane of Object.values(K.lanes)) {
          if (lane.plays === 'kick' || lane.plays === 'snare' || !events.some((e) => e.voice === lane.plays)) continue;
          const ofGroup = style.lanes.filter((l) => l.role === lane.group);
          const listed = ofGroup.find((l) => l.voices?.some((c) => String(c.v) === lane.plays));
          if (listed) continue;
          const id = ofGroup[0]?.id;
          if (id && !given[id]?.includes(lane.plays)) given[id] = [...(given[id] ?? []), lane.plays];
        }
        return Object.keys(given).length ? { lanes: given } : {};
      })(),
    },
    progression,
    arrangement,
    timeline,
    events,
    automation,
    // the sparse keys and the harmony they set (liquid-space round 1): the phrase, where it landed and what the keys own
    ...(keysPlan ? { keys: keysReadout(keysPlan) } : {}),
    // Present only where the spell really seasoned something: an empty table is
    // the house and is not a field at all, which is what keeps the record's own
    // bytes the record's own bytes.
    ...(Object.keys(knobs).length ? { knobs } : {}),
    ...(sectionPin.length ? { sectionPin: sectionPin[0] } : {}),
    ...(admission.length ? { admission } : {}),
    ...(devPlan ? { development: devPlan } : {}),
    ...(ambientPlan ? { ambient: ambientPlan } : {}),
    ...(voicesPlan ? { ambientVoices: voicesPlan } : {}),
    ...(passage ? { passage: (({ returns: _r, lines: _l, ...rest }) => rest)(passage) } : {}),
    // the theme's phrases and structural arrivals, in its own time (PLAN-UNIFY §2.5): what a planner may read
    ...(phraseMap ? { phraseMap } : {}),
    ...(phrasing && (phrasing.segments.length || phrasing.answers.length || phrasing.outs.length || phrasing.cooldowns.length) ? { phrasing } : {}),
    // **A row's treatments reach the stage** (round S18): `wants.stage.
    // treatments` leans the catalogue's `treatmentRota`, which house-v2's
    // stage draws from as its palette, row for row — and the stage is in the
    // compiler, which never sees the bias. So the leaned weights ride on the
    // plan, present only where a row leaned them, and `stage()` reads them.
    ...(() => {
      // **Effects by place** (GA6): the nearest place's multipliers on the
      // rota's weights, over whatever a row's wants leaned; none at the house.
      const T = placesOn ? nearestEntry(TREATMENTS, bias.spell, bpm) : null;
      const base = bias.weights.treatmentRota;
      if (!base) return {};
      const names = ((style.candidates as any[]).find((c) => c.id === 'treatmentRota')?.list() ?? []).map((e: any) => String(e.v ?? e));
      const w = T ? base.map((x: number, i: number) => x * (T.weights[names[i]] ?? 1)) : base;
      return w.some((x: number) => x !== 1) ? { treatmentWeights: [...w] } : {};
    })(),
  };

  // **The sub under its room** (rounds EQ-5 and LOUD-2, `subTrimDb` in
  // lane-level.ts): the room's own `levels.sub` less two where the bass is the
  // room (no grid), five under a grid with the mids carrying the theme, six
  // where the scene is loaded (a bass in front of the bottom, or a broken
  // kit). `?sub=` replaces the step with its own number (`applyBypass`,
  // set-plan.ts, reads it back off `sound.subDb`), and the sub's ceiling still
  // applies after both. Both engines.
  {
    const subDb = subTrimDb({
      drums: DERIVED ? DERIVED.drumsOn : true,
      brokenKit: kit === 'breaks',
      bassVoices: new Set(events.filter((e) => e.layer === 'bass').map((e) => e.voice)),
      bassDriven: !!bassDrivePlaced,
    });
    const roomSub = (pre.params?.levels as Record<string, number> | undefined)?.sub ?? style.base.levels.sub;
    track.paramOverrides = mergeParams(track.paramOverrides, { levels: { sub: roomSub + subDb } }) as ParamOverrides;
    track.sound = { ...track.sound, subDb };
  }
  // The trim's ceiling by place (round DNB-3, `DrumsEntry.trimMostDb`): read by the set's trim (`set-plan.ts`).
  if (drumsRow?.trimMostDb != null) track.sound = { ...track.sound, trimMostDb: drumsRow.trimMostDb };
  // ...and the place's own level (round DNB-4): read by the trim's model (`loudnessFamily`).
  if (drumsRow?.targetLufs != null) track.sound = { ...track.sound, targetLufs: drumsRow.targetLufs,
    ...(drumsRow.measuredLufs != null ? { measuredLufs: drumsRow.measuredLufs } : {}) };

  // **The grain by place** (round SPARK-1, `grainFor` in places.ts): the
  // nearest row of the style's grain table, else the house's own, written into
  // the theme's room -- the keys' edge, the strings' breath, the piano's hammer
  // and body, the harmonic bus's edge -- each where the row has one, merged
  // over what the room already says so no block is replaced. A row with no
  // parts (the fast broken place, the drones) writes nothing at all.
  {
    const grainRow = placesOn ? nearestEntry(PLACED.grain, bias.spell, bpm) ?? PLACED.grainHouse ?? null : null;
    const grain = grainFor(grainRow, bias.spell);
    if (Object.keys(grain).length) track.paramOverrides = mergeParams(track.paramOverrides, grain) as ParamOverrides;
  }

  // **The drums' grain by place** (round SPARK-2, `drumGrainFor` in
  // places.ts): the hats' metal above 8 kHz, their air and tail, the shaker's
  // beads, the clap's crack — the nearest row, else the house's, merged over
  // the room's own blocks. A row with no parts writes nothing.
  {
    const drumRow = placesOn ? nearestEntry(PLACED.drumGrain, bias.spell, bpm) ?? PLACED.drumGrainHouse ?? null : null;
    const drums = drumGrainFor(drumRow, bias.spell);
    if (Object.keys(drums).length) track.paramOverrides = mergeParams(track.paramOverrides, drums) as ParamOverrides;
  }

  // **The beds** (rounds EQ-5 and EQ-6): each section's harmonic layer as the
  // notes written for it fill the section, standing on the row's floors -- the
  // loudness model's own sum (`harmonicEnergyDb`), read once the theme is
  // written and before anything below moves a level, so the floors and the
  // bell are keyed off one reading of one bed.
  const floored = bedRow ? (['keys', 'pad', 'piano'] as const)
    .map((role) => ({ role, room: S.levels[role], floor: bedRow[`${role}Db`] }))
    .filter((f): f is { role: 'keys' | 'pad' | 'piano'; room: number; floor: number } => f.floor != null && f.room < f.floor) : [];
  // The exposed reed's bed is read at its full level: it is held low under the reed, and a section it fills is not a
  // thin one for the bell to lift (his ear 10-13: the 1.1 kHz bell is the reed's nasal band, in that breakdown).
  const bedRead = exposedBed.size && EXPOSED ? { ...track, events: track.events.map((e) => exposedBed.has(e)
    ? { ...e, p: { ...e.p, gain: ((e.p as { gain?: number }).gain ?? 1) / dbToGain(EXPOSED.bedDb) } } : e) } : track;
  const beds = bedRow && (bedRow.bellDb || floored.length)
    ? arrangement.sections.map((sec) => ({ sec, bed: loudnessFeatures(bedRead as any, style, { from: sec.startBar, bars: sec.bars }).harmonicEnergyDb }))
    : [];

  // **The floors keyed to the bed** (round EQ-6, `floorOfBed` in places.ts):
  // the row's floor is the most a role is lifted to, and each section takes
  // what its own bed leaves room for -- the whole lift where the harmonic layer
  // is thin, none where it already stands forward, the room's own level there.
  // The theme's room carries the most any section takes, as the bell's gain
  // does, and a section under it is a step in the plan's `floors`: from the
  // section's first bar its notes of that role play that much under (a note
  // keeps the level it was struck at). A level and never a note's gain, so the
  // notes are the notes they were. A room that stands over the floor is not
  // moved, and a theme whose every section stands forward plays at its room's
  // own levels.
  if (floored.length && beds.length) {
    const levels: Record<string, number> = {};
    const steps: BedFloorStep[] = beds.map((b) => ({ t: b.sec.startBar * barSeconds }));
    for (const f of floored) {
      const at = beds.map((b) => floorOfBed(f.room, f.floor, b.bed));
      const most = Math.max(...at);
      levels[f.role] = most;
      at.forEach((db, i) => { if (db < most) steps[i][f.role] = +(db - most).toFixed(2); });
    }
    track.paramOverrides = mergeParams(track.paramOverrides, { levels }) as ParamOverrides;
    if (steps.some((st) => Object.keys(st).length > 1)) track.automation = { ...track.automation, floors: steps };
  }

  // **The bell keyed to the bed** (round EQ-5, `bellOfBed` in places.ts): the
  // row's bell is the most it lifts, and each section takes what its own bed
  // leaves room for -- the whole of it where the harmonic layer is thin, none
  // where it already stands forward -- off the beds read above. The move lands
  // on the section's first bar, ramped over the bar before it. A theme whose
  // every section stands forward builds no bell at all.
  if (bedRow?.bellDb) {
    const gains = beds.map(({ sec, bed }) => ({ sec, db: bellOfBed(bedRow.bellDb!, bed) }));
    const most = Math.max(0, ...gains.map((g) => g.db));
    const { harmonicBell, ...rest } = track.paramOverrides as ParamOverrides & { harmonicBell?: unknown };
    if (most > 0) {
      const points: PlanPoint[] = [];
      let was: number | null = null;
      for (const { sec, db } of gains) {
        const t = sec.startBar * barSeconds;
        if (was == null) points.push({ t: 0, value: db });
        else if (db !== was) points.push({ t: Math.max(0, t - barSeconds), value: was }, { t, value: db });
        was = db;
      }
      track.paramOverrides = { ...rest, harmonicBell: { ...BED_BELL, db: most } } as ParamOverrides;
      track.automation = { ...track.automation, bell: points };
    } else {
      track.paramOverrides = rest as ParamOverrides;
    }
  }

  // **The pad arc** (PLAN-UNIFY U3, `src/pad-arc.ts`; his goal: *"the pads move across the main and still sit
  // behind"*): at every position the producer does not arrange (its row writes its own arc) and no phrase planner owns
  // the kit, each long main reshapes the theme's own pad — its voicing, level, width and air rising to a crest phrase
  // and settling, every restrike kept — around the arrangement's phrases as they were heard. From 70 BPM up; the slow
  // side only under its row's own switch (`slow.on`, off: the ambients and 27191 stay as they are, his word 10-13); never a held drone
  // over a broken beat (the Spark and Loom combo and its fan track, as the phrases leave them). After the beds above
  // are read, so the arc moves no section's floor or bell; before the hygiene, whose fades ride over it.
  const arcRow = PAD_ARC_ROWS.ring;
  const arcSlow = bpm < arcRow.leastBpm;
  const padArc = switchOn(style, 'padArc') && (!arcSlow || arcRow.slow.on) && time && phraseMap && !passage && !devPlan
    && !((scene === 'drone-forward' || scene === 'drone-back') && !!breakRow) ? applyPadArc({
      row: arcRow, slow: arcSlow, events, barSeconds, spell: bias.spell as unknown as Record<string, number>, map: phraseMap, sections: arrangement.sections,
      phrasing: phrasing ? { segments: phrasing.segments, cooldowns: phrasing.cooldowns } : null,
      // the held bed: a pad note of a bar or more (a figure's short strikes on the pad lane are a part's rhythm, not the bed)
      isPad: (e) => e.layer === 'pad' && typeof e.p.midi === 'number' && !e.part && !e.role && !e.p.gone && !ambientNotes.has(e) && Number(e.p.dur) >= barSeconds - 1e-6,
      keepVoicing: heldRoles.has('sustained'),
      rootPcAt: (b) => ((chordAtBar(progression, b).rootMidi % 12) + 12) % 12,
    }) : null;
  if (padArc) track.padArc = padArc;

  // **The arrangement's hygiene** (PLAN-UNIFY U1, `src/hygiene.ts`): at every position the producer does not arrange,
  // the last pass over the events — a quiet bed where the groove would go bare, then a fade on every long hold that
  // would stop — in the theme's own time and leaned by its birds. Where the producer arranged the track its row's own
  // `holds` and `arc.filler` did the same (the fast places' numbers). After the beds above are read, so a fade's tail
  // moves no section's floor or bell. house-v1 never asks.
  const hygiene = switchOn(style, 'hygiene') && time && !(passage && producerRow) ? applyHygiene({
    row: HYGIENE_ROWS.ring, events, bars, time, spell: bias.spell as unknown as Record<string, number>, sections: arrangement.sections,
    chordAt: (b) => chordAtBar(progression, b).label, noteName,
    // the ambient bed's notes shape their own holds (its seconds caps, its plateaus, its entrance swells)
    ownShape: (e) => ambientNotes.has(e),
    scene: composition?.trace.scene ?? null,
    releaseOf: (e) => { const r = e.p.release ?? (S as unknown as Record<string, { release?: unknown } | undefined>)[e.voice]?.release; return typeof r === 'number' ? r : null; },
  }) : null;
  if (hygiene && (hygiene.faded || hygiene.fillers.length)) track.hygiene = hygiene;

  // **Who carries the low end** (round DUB-1, `turnRoles` in roles.ts): read
  // last, over the theme every table above has written, so what it changes is
  // said on the plan (`sound.roles`) and `roles=classic` puts it back. Every
  // place but the one whose row asks is the theme it was.
  turnRoles(track, placesOn ? nearestEntry(PLACED.roles, bias.spell, bpm) : null, SOUNDS);

  // **A redraw only where the front sounds** (the review of 10-13): a theme whose keys are played by another voice
  // (a part's own timbre) or not at all never sounded the front, and its dice say what they said before the redraw,
  // so the loudness fit, which reads the dice, trims it as it did. Where the redrawn front sounds it plays at its
  // row's level (`redrawnDb`), and the fit reads the keys as the timbre the figure was levelled for
  // (`keysLevelledAs`): the row's level is what brings the new voice to where the old one stood in the mix, and the
  // new die's declared hold (a tri lead's 0.6 against the reed's 0.8) is not a fact about the sound.
  if (redrawnFrom) {
    const sounds = track.events.some((e) => e.voice === stabTimbre || (e.p as { preset?: string }).preset === stabTimbre);
    const d = track.dice as Record<string, unknown>;
    if (!sounds) {
      if (d.stabTimbre === stabTimbre) d.stabTimbre = redrawnFrom;
      if (d.keysPreset === stabTimbre) d.keysPreset = redrawnFrom;
      if (!leadSustained && d.leadTimbre === leadTimbre) d.leadTimbre = leadDrawn;
    } else {
      // the row's level, and no hotter on its lane than the row's `frontMostDb`
      const frontMost = APART.find((r) => r.front.includes(redrawnFrom))?.frontMostDb;
      const keysLevel = roomLevels.keys;
      const frontDb = redrawnDb + (frontMost !== undefined && Number.isFinite(keysLevel) && keysLevel > frontMost ? frontMost - keysLevel : 0);
      if (frontDb) {
        const g = dbToGain(frontDb);
        for (const e of track.events) if (e.voice === stabTimbre || (e.p as { preset?: string }).preset === stabTimbre) {
          const p = e.p as Record<string, number>;
          p.gain = (p.gain ?? 1) * g;
        }
      }
      if (d.stabTimbre === stabTimbre) d.keysLevelledAs = redrawnFrom;
      // ...and the bed under it no hotter than the row's `bedMostDb` on its lane: the reed it replaced stood over a
      // hot room's bed, and the voice in its place, at its level, leaves that bed in front of the drums.
      const most = APART.find((r) => r.front.includes(redrawnFrom))?.bedMostDb;
      const padLevel = roomLevels.pad;
      if (most !== undefined && Number.isFinite(padLevel) && padLevel > most) {
        const g = dbToGain(most - padLevel);
        for (const e of track.events) if (e.layer === 'pad') { const p = e.p as Record<string, number>; p.gain = (p.gain ?? 1) * g; }
      }
    }
  }

  // **The held reed's level** (`EXPOSED.frontDb`, `exposedDb`; his ear 10-13 on seed 17: "a bit too loud, when it's in
  // foreground, this is the only thing you hear… such a cutting-through timbre", and across its break into the drop
  // at bar 72: "dramatically quieter than in the break and it sounds confusing"): every note of a named front plays
  // `frontDb` under, and a note inside an exposed run `exposedDb` under that, so the break meets the main it opens
  // into. Last, after the bed's bell and floors are read, so they stand as they were; the loudness trim, planned
  // after this, reads the notes at the level they play.
  if (EXPOSED) {
    const isFront = (e: PlanEvent) => EXPOSED.fronts.includes(e.voice) || EXPOSED.fronts.includes((e.p as { preset?: string }).preset ?? '');
    // **One level through an exposed run and into what follows** (his ear 10-13 on seed 17: "it drops in volume
    // entering deeper into the segment … maybe the reed organ should be on that same level during the break?"). The
    // reed's level moved inside the break by the stage, not by the notes: its novelty rota stood the keys at the back
    // for bars 52-63 (-15.0 dB), at the front for 64-71 (-10.5, a brighter colour) and brought them down again over
    // the drop's first two bars (-9.9, -11.8, -12.5). So a front's note inside a run, and in the bars after it until
    // the stage settles, stands where the stage settles (`stageHold`, read by `programOf`); the breakdown's melodic
    // lift (`melodicGain`) is taken back off its notes; and its strikes are struck at the mean velocity of the
    // eight bars that follow, so the break is played as the main is.
    const melodic = track.automation?.melodicGain ?? [];
    const melodicAt = (t: number) => {
      let v = 1;
      for (let i = 0; i < melodic.length; i++) {
        const a = melodic[i], b = melodic[i + 1];
        if (t < a.t) break;
        v = !b || t >= b.t ? a.value : a.value + (b.value - a.value) * (t - a.t) / Math.max(1e-9, b.t - a.t);
      }
      return v;
    };
    for (const r of exposedRuns) {
      const end = r.from + r.bars;
      const after = track.events.filter((e) => isFront(e) && e.t >= end * barSeconds - 1e-6 && e.t < (end + 8) * barSeconds - 1e-6);
      const ref = after.length ? after : track.events.filter((e) => isFront(e) && e.t < r.from * barSeconds - 1e-6 && e.t >= (r.from - 8) * barSeconds - 1e-6);
      const meanVel = ref.length ? ref.reduce((a, e) => a + ((e.p as { vel?: number }).vel ?? 1), 0) / ref.length : null;
      for (let b = r.from; b < end; b++) {
        const xs = track.events.filter((e) => isFront(e) && e.t >= b * barSeconds - 1e-6 && e.t < (b + 1) * barSeconds - 1e-6);
        const mean = xs.length ? xs.reduce((a, e) => a + ((e.p as { vel?: number }).vel ?? 1), 0) / xs.length : 0;
        const k = meanVel && mean ? meanVel / mean : 1;
        for (const e of xs) {
          const p = e.p as Record<string, number>;
          p.vel = (p.vel ?? 1) * k;
          p.gain = (p.gain ?? 1) / melodicAt(e.t);
          e.stageHold = end;
        }
      }
      for (const e of after) e.stageHold = end;
    }
    // ...and over a sparse bed (one that strikes, or holds under half the bar by `TIMBRES`: the rhodes, the swell)
    // no hotter on the keys' lane than `sparseBedMostDb`, the cap a redrawn front takes: there the reed is the only
    // held voice, and in the growl room's -9.5 it stood 2 to 5 dB into the mix.
    const bedT = TIMBRES[padTimbre];
    const sparse = !bedT || bedT.struck || (bedT.hold ?? 0) < 0.5;
    const capDb = sparse && EXPOSED.sparseBedMostDb !== undefined && Number.isFinite(roomLevels.keys)
      ? Math.min(0, EXPOSED.sparseBedMostDb - roomLevels.keys) : 0;
    const frontDb = (EXPOSED.frontDb ?? 0) + capDb;
    if (frontDb) for (const e of track.events) {
      if (!isFront(e)) continue;
      const p = e.p as Record<string, number>;
      p.gain = (p.gain ?? 1) * dbToGain(frontDb);
    }
  }

  // **The clean keys** (his ear, 10-13: seed 4's electric piano at Tide 0.95, "noise makes it cheap", and on round 1's
  // softer strike "still looks like a bug"): a style's `cleanKeys` are the keyboard rows it plays with no strike noise
  // and past the harmonic bus's edge, written into the theme's settings only where the theme sounds one of them, struck
  // or held, over a room with a strike or an edge to take away; every other theme carries the room it always did.
  const cleanKeys = (style as Style & { cleanKeys?: readonly string[] }).cleanKeys;
  if (cleanKeys?.length) {
    const room = track.paramOverrides as { keys?: { edge?: { chiff: number } }; harmonicEdge?: { blend: number } };
    if ((room.keys?.edge?.chiff ?? 0) > 0 || (room.harmonicEdge?.blend ?? 0) > 0) {
      const sounded = new Set(track.events.flatMap((e) => rowsThrough(e.voice, e.p).map((row) => row.id)));
      const played = cleanKeys.filter((id) => sounded.has(id));
      if (played.length) track.paramOverrides = mergeParams(track.paramOverrides, { cleanKeys: played }) as ParamOverrides;
    }
  }

  // **The hand voicing** (his ear, 10-13: seed 8's conga "not as bouncy HF … a hand conversation"): a style's
  // `voicings` are a voice's settings block as the style voices it, written into the theme's room only where the
  // theme sounds that voice, so a theme without a conga or a bongo carries the room it always did.
  // A voicing may instead be **leaned by the birds** (`LeanedVoicing`, 10-13: "choosing bright or dark shouldn't be
  // to me, but to birds positions"): its two ends, and the one lean's shift (`shiftOf`) placing the theme between
  // them, half-way at the row's centre; a level in decibels walks in a straight line, every other number in ratio.
  const voicings = (style as Style & { voicings?: Readonly<Record<string, Readonly<Record<string, number>> | LeanedVoicing>> }).voicings;
  if (voicings) {
    const sounded = new Set(track.events.map((e) => e.voice));
    const voiced = Object.fromEntries(Object.entries(voicings).filter(([voice]) => sounded.has(voice))
      .map(([voice, v]) => [voice, isLeaned(v) ? voicingAt(v, bias.spell as unknown as Record<string, number>) : v]));
    if (Object.keys(voiced).length) track.paramOverrides = mergeParams(track.paramOverrides, voiced) as ParamOverrides;
  }

  BASS_LANE.set(track, bassLane);
  return track;
}

export default generate;
