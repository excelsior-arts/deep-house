// **What the music does away from the house, by place** (round GA6, Eugene
// 09-27: *"need to fill mids and highs … add more voices, effects, whatever it
// takes; drum beats are good, but we need everything else too now"*; and the
// rule over it: the composer knows the birds and the tempo, never a name). Each
// table is a list of places (birds over the house, a tempo window: `src/places.ts`)
// and what plays there; the entry nearest the playing birds and tempo plays,
// the house's own place competing, so the house is untouched. The places are
// where the pattern rows were audited (the analysis side's spells, as numbers);
// the entries are named for what they are musically.
import { HOUSE_PLACE, drumsKnobFaults } from '../places.ts';
import type { Zone, PlaceEntry, PlaceLane } from '../places.ts';
import { HOUSE, DRUMS_ON_ABOVE, BREAKS_ABOVE, type Spell } from '../spell.ts';
import BORROWED from './zones-borrowed.json' with { type: 'json' };
import type { BirdLeans, Place, HarmonyEntry, FormEntry, TreatmentEntry, BassEntry, LaneSoundEntry, EqEntry, BassDriveEntry, BedEntry, GrainEntry, DrumGrainEntry, StylePlaces,
  DrumsEntry, SubSectionsEntry, SectionsEntry, GlueSoundEntry, RolesEntry, SupportEntry, BreaksEntry, KeysEntry, DevelopmentEntry, AmbientVoicesEntry, ConversationEntry, JourneyEntry } from '../places.ts';
import type { WalkEntry } from '../walk.ts';
import type { TimeEntry } from '../musical-time.ts';
import { riffTableFaults, type GlideEntry, type RiffEntry } from '../glide.ts';
import { NO_SUBS, type SubRates } from '../subsections.ts';
import type { EqProfile } from '@deep-house/engine/master';
import { EQ_V1 } from './deep-house.ts';

const place = (birds: Place['birds'], tempo: [number, number]): Place => Object.freeze({ birds: Object.freeze(birds), tempo: Object.freeze(tempo) });
/** A fast broken beat, bright and mid-heavy. */
const FAST_BROKEN = place({ ember: 0.95, spark: 0.85, zephyr: 0.70, root: 0.60, veil: 0.60 }, [160, 176]);
/**
 * The fast broken beat with the weight up (round DNB-1): the Drum & Bass
 * tile's own birds with Root a step over them. It was written for the bass's
 * sound (Root up to the sub-led reese, down to the mid-range one); since the
 * liquid bass rounds both places play the same sine reese, and every table
 * that lists it gives it the same row as FAST_BROKEN's (the form's differs
 * only in the section windows a theme no form row fits would take); the
 * tables that leave it out answer it with their fast entry. A sweep that
 * crosses from one to the other moves no sound (the fast-birds analysis of
 * 10-12: Root is inert at the tile; PLAN-UNIFY gives it a meaning there).
 */
const FAST_BROKEN_DEEP = place({ ember: 0.95, spark: 0.85, zephyr: 0.60, root: 0.80, veil: 0.60, tide: 0.45 }, [160, 176]);
/** A broken beat at a driving tempo. */
const BROKEN_DRIVING = place({ ember: 0.72, spark: 0.70, tide: 0.45, zephyr: 0.65 }, [120, 140]);
/** A deep, wet, still four, dark and heavy. */
const DEEP_STILL = place({ ember: 0.72, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 }, [118, 126]);
/** The same deep stillness at a half-time tempo. */
const DEEP_HALF = place({ ember: 0.92, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 }, [134, 146]);
/** A slow, wet groove. */
const SLOW_WET = place({ ember: 0.30, tide: 0.70, root: 0.55 }, [75, 95]);
/** A driving four, restless. */
const DRIVING_FOUR = place({ ember: 0.75, root: 0.60, zephyr: 0.50, veil: 0.60 }, [124, 134]);
/** A bright, dry four at a club tempo. */
const BRIGHT_FOUR = place({ ember: 0.70, spark: 0.40, zephyr: 0.60, root: 0.60, tide: 0.45 }, [118, 130]);
/** A driving four at the high tempo. */
const HIGH_FOUR = place({ ember: 0.88, root: 0.60, zephyr: 0.50, veil: 0.60 }, [134, 146]);
/** A free pulse, airy, wet and long. */
const FLOATING = place({ ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, loom: 0.80, spark: 0 }, [40, 70]);
/**
 * Bright, light, no floor, a little broken, long: struck voices in conversation (PLAN-AMBIENT Phase 1, ambient-bells).
 * It stands 0.88 from the Ambient tile and 1.1-1.2 from the two goldens' spells, past every protected spell's reach.
 */
const BELLS = place({ ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.10, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 }, [40, 70]);
/**
 * BELLS's level (ambient-bells, measured on the branch's site, offline and silent), the conversation's own and not the
 * place's drums' (`DrumsEntry.targetLufs` would trim a library turn there, a theme of pads, by the conversation's
 * number): its trim windows measure -17.77 LUFS at a trim of nought (the median of the 24 own themes of seeds 1-12,
 * themes 1-3; -21.1 to -15.6), with the deepest limiting 3.2 dB. Remeasured 10-19 (zones-pilot-3) after the bowl's level
 * by register: the -16.96 of 10-17 (after the review's mix) had gone 0.4 LU stale as the row moved, and the register's
 * cut took another 0.4. The target is about the place's measured level, not the drumless family's -13 (WAVES's
 * reasoning): every decibel of trim over the place's level is a decibel of limiter on the strikes' attacks. Set by the
 * deepest limiting, whole themes with the trim in: from -17.1 (a trim of +1.0 dB) in 0.2 dB steps until the hottest of
 * the tile's 24 own themes, Root 0.97 seeds 1 and 3 and the turns stood within about 3.3 dB (at -17.1 a call struck a
 * breath after a fresh bowl, the tile's seed 11 theme 3, went 4.2 dB deep, seed 7 theme 3 4.1, the turns s6t1 and
 * s12t1 3.7): -17.7, a trim of +0.1 dB, 0.6 dB under the 0.69 the place had played at.
 */
const BELLS_TARGET_LUFS = -17.7;
/**
 * Restless, broken, wet: one long filter journey, the held voices on tape, slow swirls and long echoes, in a mode of
 * the place's own (PLAN-AMBIENT Phase 6, ambient-psy). It stands 0.98 from 27191's golden spell and 1.0 from seed 6's,
 * 0.87 from the Ambient tile and 0.96 from BELLS, past every protected spell's reach (PLAN-AMBIENT §2.4).
 */
const PSY = place({ ember: 0.08, tide: 0.90, zephyr: 0.65, root: 0.60, gleam: 0.35, veil: 0.90, spark: 0.55, loom: 0.70 }, [40, 70]);
/**
 * **The birds at PSY** (the zones direction: the address birds take you there, the others steer inside it), each the one
 * lean about the place's own value: Gleam the mode's brightness here (`scale:<mode>`, phrygian down, mixolydian and
 * lydian up, dorian the pivot); Veil, Tide, Root and Spark lean the journey's row (`recipes/ambient/journey.json`).
 */
const PSY_MODE_LEANS: BirdLeans = Object.freeze({
  centre: Object.freeze({ gleam: 0.35 }),
  by: Object.freeze({ gleam: Object.freeze({ 'scale:phrygian': -4, 'scale:mixolydian': 3, 'scale:lydian': 5 }) }),
});
const BELLS_MEASURED_LUFS = -17.77;
/**
 * The tile with motion: airy, wet and long like the floating pulse, a little more restless, the sea under it (PLAN-AMBIENT
 * Phase 4, ambient-waves). It stands 0.41 from the Ambient tile (FLOATING, listed in every table it is, so the tile keeps
 * its own rows) and 0.77-0.78 from the two goldens' spells, past every protected spell's reach. It is named in one
 * table only, the ambient voices' (the sea; the harmony that moves with its sets is its row's own, and no family of the
 * style's parts is drawn where it plays, so no whistle), so nothing of it is read where the sea does not play, and the
 * zones' address of it is this one line.
 */
const WAVES = place({ ember: 0.05, tide: 0.85, zephyr: 0.75, root: 0.55, gleam: 0.50, veil: 0.60, spark: 0.10, loom: 0.95 }, [40, 70]);
/**
 * WAVES's level (ambient-waves, measured on the branch's site, offline and silent): the sea's own, as BELLS's is the
 * conversation's, read only by a theme that lays the sea (a library turn there is trimmed as it always was). Its trim
 * windows measure -17.6 LUFS at a trim of nought on the irregular sea (ambient-waves-2, 10-18: the median of the 24 own
 * themes of seeds 1-12, themes 1-3; -22.5 to -15.1; the limiter 0.7 dB deep at the most), within 0.15 dB of the
 * scripted sea's -17.75. The target is -17.1, a trim of +0.75 dB (the trim climbs half again as fast as the gap, the
 * model's own slope): 0.3 dB under the scripted sea's +1.05, since the irregular sea's larger waves and longer blooms
 * put Tide 1.00 at 3.0 dB of limiting at +1.05; whole themes stay inside the ambient neighbours' spread (-13 to -19
 * LUFS). The measured numbers are in `notes/rounds/ambient-waves.md`.
 */
const WAVES_TARGET_LUFS = -17.1;
const WAVES_MEASURED_LUFS = -17.6;
/** The Liquid key's own spell (the Drum & Bass tile's liquid centre), read by the riff, form and development tables. */
const LIQUID_KEY = { ember: 0.95, tide: 0.45, zephyr: 0.60, root: 0.75, veil: 0.60, spark: 0.85, loom: 0.85 };
/** The liquid centre as a place (liquid-space, 10-11). */
const LIQUID_CENTRE = place(LIQUID_KEY, [160, 176]);
/** The liquid centre with Tide and Loom up and Veil down: the exposed, atmospheric fast context (liquid-space). */
const LIQUID_ISLANDS = place({ ...LIQUID_KEY, tide: 0.80, loom: 0.90, veil: 0.30 }, [160, 176]);
/**
 * The liquid centre with Root up and Spark moderate: the continuous roller (liquid-space). Reached with Spark down
 * toward 0.6; Root alone does not reach it — at Spark 0.85 or more the centre stays nearer (by 0.005 at Root 1).
 */
const LIQUID_ROLLER = place({ ...LIQUID_KEY, root: 0.95, spark: 0.60 }, [160, 176]);
/** The liquid centre with Spark up: broken-air development (liquid-space). */
const LIQUID_BROKEN = place({ ...LIQUID_KEY, spark: 1.0, zephyr: 0.70 }, [160, 176]);

/**
 * **The birds at the fast places** (PLAN-UNIFY U2, the addendum *The birds at the fast places*; his word 10-12, *"we put
 * the birds issue into unify"*): Root and Veil given their meaning there, each the one lean about the Drum & Bass tile's
 * own value (the Liquid key's), so the tile plays its numbers to the bit and every other position moves.
 *
 *   - **Root, the low end's weight**: the line's lift, ±2 dB at its ends about the tile's own (`subDb`, a step reaching `ends`), the roller's share among the forms (`row:dnb/form-roller`: Root up rolls — bug 4, *"Root up → the
 *     roller"*, decided as Root's meaning: the roller place stays Spark's, and Root leans the form toward it wherever
 *     the liquid forms are drawn); with the riff rows toward Root (`RIFF`) and the producer's own (fewer outs up, more
 *     answers into the drums' gaps down: `recipes/ambient/producer.json`'s `bass.birds`).
 *   - **Veil, the rate of change and the fx palette**: the throws (`throws`), the fills at a section's line (`fill`),
 *     the development's effect moves (`effect`), the chapters' deadline for something salient (`deadline`, shorter as
 *     Veil rises past the tile, never longer than its row's 32 bars); with the producer's own (the fill-like endings, the reverse swells: `drums.fx`).
 */
const FAST_LEANS: BirdLeans = Object.freeze({
  centre: Object.freeze({ root: LIQUID_KEY.root, veil: LIQUID_KEY.veil, zephyr: LIQUID_KEY.zephyr }),
  by: Object.freeze({
    root: Object.freeze({ subDb: 1, 'row:dnb/form-roller': 2, lowShelfDb: 1 }),
    veil: Object.freeze({ throws: 1.5, fill: 1, effect: 1, deadline: -0.6 }),
    // PLAN-UNIFY U3: Zephyr is which keys and how bright the air. Since zephyr-air (his word 10-18, "Zephyr is air") the
    // keys' tone leans by its voice's measured air (`air:tone`, `src/air-lean.ts`; the row's own Zephyr tone lean held
    // at the tile's 0.6): up toward the dark tine and the suitcase (629, 600 Hz) and the felt and close grands (539,
    // 519), down toward the soft FM electric piano (341), the glass one (426) and the far grand (462). It had leaned by
    // names the other way, the FM pianos up, and the grands are this engine's brighter keys, so the tile's travel fell
    // 499 -> 422 Hz. Its strength 10.8 a unit of Zephyr an octave of air is the reach the typed lean had (the spread of its
    // slopes, the row's and the place's: 3.07, over the tones' air: 0.28 octave). The blooms' width and air and the
    // weather's upper air are the producer's and the weather's rows
    zephyr: Object.freeze({ 'air:tone': 10.8,
      // ...and how bright the air, whatever voice: the keys' own low-pass (`keysLp`, a factor on the voice's filter, ×0.56
      // at 0.2 and ×0.42 at nought; above the tile held to ×1.15), measured on the grands; the FM electric pianos take it
      // through the stage's tone filter, on the tine's top only (their click stays: measured, no floor)
      keysLp: 1.45 }),
  }),
  // the line's lift ±2 dB at Root's ends, as far down at nought as up at one (the review of U2: it was +0.67 and -2);
  // the master's low shelf -4 dB at Root's nought and +1.5 at its one (U2b, his ear 10-13 on the Root sweep: "less bass
  // (if ears are tired) but still good DnB!! We could technically connect Root to EQ and reduce bass presence in dB
  // values"), so "less bass" is in the tone as well as in the passages
  ends: Object.freeze({ subDb: 2, lowShelfDb: Object.freeze([-4, 1.5] as const) }),
});

/**
 * **Harmony by place**: the chord walk a place plays in place of the mined
 * Markov walk. Written from public knowledge of the music these places stand
 * for (as the pattern rows were); degrees are the scale's, from the tonic.
 */
export const HARMONY: readonly HarmonyEntry[] = Object.freeze([
  // Round DNB-1: a chord holds 1.7-4.0 bars over the 33 cuts of source 8
  // (median 2.3; four to five on the liquid and half-time cuts), so the
  // eight-chord cycle a bar at a time GA6 wrote is now two bars a chord, and
  // a held i-VI four bars a chord stands beside the turns.
  // Round DNB-6 (his ear on DNB-5: the deep house dress; the riff is the motif now
  // and keeps its home under the chords): the chords step back — a change every
  // eight bars, or four on the busiest cycle, where they changed every two; the
  // riff's pedal clashes less and the bed holds behind it.
  { id: 'minor-cycles', place: FAST_BROKEN, cycles: [
    { degrees: [0, 5], every: 8, loop: 16, w: 2 },                  // i-VI, a phrase each
    { degrees: [0, 3], every: 8, loop: 16, w: 1 },                  // i-iv, a phrase each
    { degrees: [0, 6], every: 8, loop: 16, w: 1 },                  // i-VII
    { degrees: [0, 5, 2, 6], every: 4, loop: 16, w: 1 },            // i-VI-III-VII, four bars a chord
  ] },
  { id: 'riff-over-tonic', place: BROKEN_DRIVING, pedal: true },    // the bass riff carries the harmony
  { id: 'one-chord-deep', place: DEEP_STILL, pedal: true },         // one minor chord, the echo carries the motion
  { id: 'one-chord-half', place: DEEP_HALF, pedal: true },
  { id: 'minor-turn', place: SLOW_WET, cycles: [
    { degrees: [0, 5, 6, 0], every: 2, loop: 8, w: 2 },            // i-VI-VII-i
    { degrees: [0, 3, 6, 0], every: 2, loop: 8, w: 1 },            // i-iv-VII-i
  ] },
  { id: 'one-chord-driving', place: DRIVING_FOUR, pedal: true },    // the motion is in the stab and the held mid
  { id: 'seventh-vamp', place: BRIGHT_FOUR, cycles: [
    { degrees: [0, 3], every: 2, loop: 4, voicing: 'sevenths', w: 2 },
    { degrees: [0, 6], every: 2, loop: 4, voicing: 'sevenths', w: 1 },
  ] },
  { id: 'anthem-turns', place: HIGH_FOUR, cycles: [
    { degrees: [0, 5, 2, 6], every: 2, loop: 8, w: 2 },            // vi-IV-I-V of the relative major
    { degrees: [5, 2, 6, 0], every: 2, loop: 8, w: 1 },
    { degrees: [0, 6, 5, 6], every: 2, loop: 8, w: 1 },
  ] },
  { id: 'modal-drift', place: FLOATING, cycles: [
    { degrees: [0, 6], every: 4, loop: 8, w: 1 },                  // no cadence: two chords a step apart
    { degrees: [0, 3], every: 4, loop: 8, w: 1 },
  ] },
  // ambient-bells (PLAN-AMBIENT Phase 1): under the struck voices a chord every eight bars (about 41 s), so a call
  // and its answer share one chord and the next exchange may find another
  { id: 'slow-drift-under-bells', place: BELLS, cycles: [
    { degrees: [0, 5], every: 8, loop: 16, w: 2 },                 // i-VI
    { degrees: [0, 3], every: 8, loop: 16, w: 1 },                 // i-iv
  ] },
  // ambient-psy (PLAN-AMBIENT Phase 6): the place's own mode, drawn by these weights and Gleam (`PSY_MODE_LEANS`: at the
  // place's own Gleam phrygian and dorian 3 to 1 over the brighter two; at nought phrygian 78 %, at one lydian 72 %), and
  // two chords a long way apart (every eight bars, some 38 s), voiced in sevenths (no ninths' and
  // elevenths' clusters under the drift and the echoes), each pair the mode's own colour: phrygian's flat second,
  // dorian's major fourth, mixolydian's flat seventh, lydian's major second; the tonic and a step under it everywhere
  { id: 'modal-journey', place: PSY, scales: { phrygian: 3, dorian: 3, mixolydian: 1, lydian: 1 }, leans: PSY_MODE_LEANS, cycles: [
    { degrees: [0, 1], every: 8, loop: 16, voicing: 'sevenths', w: 3, scales: ['phrygian', 'lydian'] },    // i-bII / I-II
    { degrees: [0, 3], every: 8, loop: 16, voicing: 'sevenths', w: 3, scales: ['dorian'] },                // i-IV
    { degrees: [0, 6], every: 8, loop: 16, voicing: 'sevenths', w: 3, scales: ['mixolydian'] },            // I-bVII
    { degrees: [0, 6], every: 8, loop: 16, voicing: 'sevenths', w: 1 },                                    // i-bvii, i-VII, I-vii
  ] },
] as HarmonyEntry[]);

/**
 * **Form by place**: the section orders a place's themes draw from, in the
 * mined orders' own words (intro, groove, build, breakdown, drop, outro), in
 * place of the mined DJ orders; S19's trim applies as to any drawn length.
 */
// liquid-space (10-11): the research manual's five shapes at its balanced fast-atmospheric weights (two returns 30,
// the roller 25, the islands 20, broken-air 15, the half-time dialogue 10), and the bird bias as places, the mechanism
// every table has: Tide and Loom up with Veil down lean to the islands, Spark moderate (toward 0.6, Root up) to the
// roller — Root alone never reaches it, the centre stays nearer while Spark is at the tile's 0.85 — and Spark up to
// broken-air. DNB-6's three rows stay in the library, drawn by no place now.
const forms = (twoReturn: number, roller: number, islands: number, brokenAir: number, halfTime: number) => Object.freeze([
  { v: 'dnb/form-two-return', w: twoReturn }, { v: 'dnb/form-roller', w: roller }, { v: 'dnb/form-islands', w: islands },
  { v: 'dnb/form-broken-air', w: brokenAir }, { v: 'dnb/form-half-time-dialogue', w: halfTime }]);
const LIQUID_FORMS = forms(30, 25, 20, 15, 10);
const ISLAND_FORMS = forms(15, 10, 60, 5, 10);
const ROLLER_FORMS = forms(20, 55, 10, 5, 10);
const BROKEN_FORMS = forms(20, 10, 5, 55, 10);
export const FORM: readonly FormEntry[] = Object.freeze([
  // Round DNB-4: the opening of source 8 as one track form — an intro of 73
  // bars (the pads and the break without its kick, then the full break 28
  // bars), a drop of 88 that is a drop and then its groove, a breakdown of 45
  // with the sub gone that runs straight into the second drop (no build: the
  // risers are the breakdown's own), and a second drop of 93 the same way. So
  // the order carries a groove after each drop and no second build, and the
  // lengths are drawn in windows read off those cuts (the proportions; the
  // theme's length still scales them).
  // Round DNB-6 (his ear on DNB-5: *"we use deep house track structure"*): the
  // form drawn among three track rows in whole blocks of bars — the classic read
  // off source 8's first tune, the short two-drop, the roller — by the theme's
  // length and these weights; the orders below stay for a theme none fits.
  { id: 'drop-and-second-drop', place: FAST_BROKEN, rows: LIQUID_FORMS, leans: FAST_LEANS, orders: [['intro', 'build', 'drop', 'groove', 'breakdown', 'drop', 'groove', 'outro']],
    sectionBars: Object.freeze({
      intro: { p25: 24, p75: 28, median: 26 }, build: { p25: 22, p75: 26, median: 24 }, drop: { p25: 12, p75: 16, median: 14 },
      groove: { p25: 84, p75: 96, median: 90 }, breakdown: { p25: 30, p75: 36, median: 33 }, outro: { p25: 10, p75: 14, median: 12 },
    }) },
  // liquid-space (10-11): the liquid centre, the deep fast place and the two leans, each drawing the new shapes
  { id: 'liquid-forms', place: LIQUID_CENTRE, rows: LIQUID_FORMS, leans: FAST_LEANS, orders: [['intro', 'build', 'drop', 'groove', 'breakdown', 'drop', 'groove', 'outro']] },
  { id: 'liquid-forms-deep', place: FAST_BROKEN_DEEP, rows: LIQUID_FORMS, leans: FAST_LEANS, orders: [['intro', 'build', 'drop', 'groove', 'breakdown', 'drop', 'groove', 'outro']] },
  { id: 'islands-toward-tide-and-loom', place: LIQUID_ISLANDS, rows: ISLAND_FORMS, leans: FAST_LEANS, orders: [['intro', 'build', 'drop', 'groove', 'breakdown', 'drop', 'groove', 'outro']] },
  { id: 'rollers-toward-root', place: LIQUID_ROLLER, rows: ROLLER_FORMS, leans: FAST_LEANS, orders: [['intro', 'build', 'drop', 'groove', 'breakdown', 'drop', 'groove', 'outro']] },
  { id: 'broken-air-toward-spark', place: LIQUID_BROKEN, rows: BROKEN_FORMS, leans: FAST_LEANS, orders: [['intro', 'build', 'drop', 'groove', 'breakdown', 'drop', 'groove', 'outro']] },
  { id: 'drop-outs-and-builds', place: BROKEN_DRIVING, orders: [['intro', 'groove', 'breakdown', 'build', 'drop', 'groove', 'breakdown', 'drop', 'outro']] },
  { id: 'stripped-outs', place: DEEP_STILL, orders: [['intro', 'groove', 'breakdown', 'groove', 'breakdown', 'breakdown', 'groove', 'outro']] },
  { id: 'stripped-outs-half', place: DEEP_HALF, orders: [['intro', 'build', 'drop', 'breakdown', 'drop', 'breakdown', 'outro']] },
  { id: 'flat-mains', place: DRIVING_FOUR, orders: [['intro', 'groove', 'groove', 'breakdown', 'groove', 'groove', 'outro']] },
  { id: 'long-build', place: HIGH_FOUR, orders: [['intro', 'groove', 'breakdown', 'build', 'drop', 'groove', 'breakdown', 'build', 'drop', 'outro']] },
  { id: 'no-sections', place: FLOATING, orders: [['groove', 'groove']] },
  // ambient-bells: the conversation's chapters, the ground alone in, exchanges, the answerer alone, exchanges, the ground out
  { id: 'bells-chapters', place: BELLS, orders: [['intro', 'groove', 'breakdown', 'groove', 'outro']] },
  // **The bright four plays the record's own form** (the deep review of
  // 10-08, B9): GA6 named it no form, so the nearest row decided, and that was
  // the driving four's flat mains at 118-130. No orders is the corpus's mined
  // DJ orders, as at the house's own place; a form of its own is a row here.
  { id: 'own-form-bright', place: BRIGHT_FOUR, orders: [] },
] as FormEntry[]);

/**
 * **Effects by place**: how much more often the stage's rota draws a treatment
 * at a place (a multiplier on its weight; unnamed ones are left as they are).
 */
export const TREATMENTS: readonly TreatmentEntry[] = Object.freeze([
  // Round DNB-3: liquid — the room and the echo over the filter, nothing driven or crushed.
  { id: 'washed-and-filtered', place: FAST_BROKEN, weights: { 'fx:reverb': 3, 'fx:tapeDelay': 2, 'fx:chorus': 2, 'fx:filter': 2, throw: 2,
    'fx:ladder': 0.5, 'fx:overdrive': 0, 'fx:distortion': 0, 'fx:crush': 0 } },
  { id: 'driven-and-crushed', place: BROKEN_DRIVING, weights: { 'fx:overdrive': 3, 'fx:distortion': 2, 'fx:crush': 2, 'fx:compressor': 2 } },
  { id: 'tape-echoes', place: DEEP_STILL, weights: { 'fx:tapeDelay': 4, throw: 3, 'fx:filter': 2, 'fx:lfoParam': 2 } },
  { id: 'tape-echoes-wobble', place: DEEP_HALF, weights: { 'fx:tapeDelay': 3, 'fx:lfoParam': 4, 'fx:filter': 2, throw: 2 } },
  { id: 'lo-fi', place: SLOW_WET, weights: { 'fx:crush': 3, 'fx:eq': 2, 'fx:tapeDelay': 2, 'fx:tremolo': 2 } },
  { id: 'driven-and-swept', place: DRIVING_FOUR, weights: { 'fx:overdrive': 2, 'fx:ladder': 3, 'fx:filter': 2, 'fx:lfoParam': 2 } },
  { id: 'swept-and-pumped', place: BRIGHT_FOUR, weights: { 'fx:filter': 2, 'fx:compressor': 2, hpRise: 2, 'fx:phaser': 1.5 } },
  { id: 'long-tails', place: HIGH_FOUR, weights: { 'fx:reverb': 3, 'fx:shimmer': 2, hpRise: 3, 'fx:autoPan': 2 } },
  { id: 'shimmer-and-space', place: FLOATING, weights: { 'fx:shimmer': 4, 'fx:reverb': 3, 'fx:tapeDelay': 2, 'fx:chorus': 2 } },
] as TreatmentEntry[]);

/**
 * **The bass's sound by place**, as a word the style resolves (`SOUNDS`): the
 * swap to the kitchen's new voice is one line there. A `mass` is the sound's
 * sine against its saws at the place (round DNB-2: the body under B1's
 * drive, which on the first cut was heard as the drive alone): Root moves
 * it from the place's number, and the tempo's lean to a lighter bass, which
 * halved the reese's at this tempo, does not reach it — the deep reese at 1.6
 * where its row says 1.2 (+2.6 dB of sine), the reese at its own 0.8.
 */
// 10-06, hands-on: no gap before the next note — the half-sixteenth gate cut a hole under every downbeat kick once the line held its runs across the bar line
const FAST_BASS_GATE = Object.freeze({ mostSteps: 32, gapSteps: 0 });
// 10-06, the liquid bass rounds: the sine row's own unequal pair makes the line's movement
// (`reeseSub`'s subBeat controls), so no pitch sweep is stacked on it (`pitchCents` nought).
const FAST_LINE_MOTION = Object.freeze({ wobbleBeats: 0.5, wobblePhase: 0.83, glideS: 0.1, pitchCents: 0 });
// The mid-bass voice of rounds DNB-6 and DNB-7 (`mid`, `midWobble`) is gone from both fast places (the
// performance review of 10-06): once the hands-on rounds set its detune to nought, its two saws cancelled to
// exact silence, so every note of it was four oscillators sounding nothing; the table's field and its code went on
// the review of 10-08.
export const BASS_SOUND: readonly BassEntry[] = Object.freeze([
  // Round DNB-4: the line gated at both fast places — a note ends a sixteenth
  // before the next and holds a beat at the most: source 8's two-step drops
  // read their bass notes 1.8-5.5 sixteenths long (p25-p75), half of them held
  // a beat, where the place's line held three in four through to the next.
  // Round DNB-5 (his ear on DNB-4, 10-05: *"their bass is pronounced: a
  // well-phrased DnB wobbly bassline; ours sounds like a cheap bass guitar
  // plugged into a Metal Zone"*), read off source 8's first tune in memory: its
  // line is a sine, the second harmonic 25-30 dB under the note, whose notes
  // glide into the next over a sixteenth or two and whose pitch wobbles some
  // thirty cents on the eighths, with the faint harmonics over it moving at the
  // same rate (5.8 Hz at 174). So both fast places play the sine reese
  // (`reeseSub`): the sweep on the eighths, the glide 80 ms, the pitch ±20
  // cents with it — where the place played the mid-range reese and the deep one
  // with its saws a whole voice over the sine.
  // Round DNB-6: and the mid-bass voice beside it (`reeseMid`, gone since 10-06: silent; the reese's saws
  // without the sine). Round DNB-7: where the place's bass is a glide line
  // (`GLIDE`), the sub holds home and takes the glides, a note a bar, and the
  // mid-bass voice plays the same path an octave over it and carries the wobble.
  { id: 'gliding-sine-line', place: FAST_BROKEN, sound: 'sine-reese', gate: FAST_BASS_GATE, ...FAST_LINE_MOTION },
  { id: 'gliding-sine-line-deep', place: FAST_BROKEN_DEEP, sound: 'sine-reese', gate: FAST_BASS_GATE, ...FAST_LINE_MOTION },
  { id: 'driven-riff-bass', place: BROKEN_DRIVING, sound: 'driven' },
  { id: 'resonant-line', place: DRIVING_FOUR, sound: 'line303' },
  // Every other place keeps the lane's own draw, and says so: a table is read
  // by its nearest entry, so a place it leaves out would take a neighbour's.
  { id: 'own-bass-deep', place: DEEP_STILL, sound: 'own' },
  // the deep half's line under `ROLES` is the wobble reese (round DUB-1); this is what `roles=classic` plays
  { id: 'own-bass-half', place: DEEP_HALF, sound: 'own' },
  { id: 'own-bass-slow', place: SLOW_WET, sound: 'own' },
  { id: 'own-bass-bright', place: BRIGHT_FOUR, sound: 'own' },
  { id: 'own-bass-high', place: HIGH_FOUR, sound: 'own' },
  { id: 'own-bass-floating', place: FLOATING, sound: 'own' },
] as BassEntry[]);

/**
 * **The held and the struck layer's sound by place** — each a swap on a lane
 * that already plays a dear voice (the pad, the keys), so the phone pays for
 * what it paid for: a shimmer holding the chord where the pulse floats, a wide
 * saw holding it at the high four, a struck organ on the stab at the bright four.
 */
export const LANE_SOUND: readonly LaneSoundEntry[] = Object.freeze([
  { id: 'shimmer-bed', place: FLOATING, lane: 'pad', sound: 'shimmer' },
  { id: 'wide-held-saw', place: HIGH_FOUR, lane: 'pad', sound: 'supersaw' },
  { id: 'organ-on-the-stab', place: BRIGHT_FOUR, lane: 'stab', sound: 'struck-organ' },
  // The rest keep the lanes' own draw (see BASS_SOUND).
  ...[FAST_BROKEN, BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR]
    .map((place, i) => ({ id: `own-layers-${i + 1}`, place, lane: 'pad' as const, sound: 'own' })),
] as LaneSoundEntry[]);

/**
 * **The sound words and the timbre each resolves to** (the kitchen's voices,
 * round KV1, admitted here). `null` is the lane's own draw: the siren has no
 * lane it can take over without adding a voice (it is a melody over the
 * others, 12 units on a cast at 217 of 220), so it waits.
 */
export const SOUNDS: Readonly<Record<string, string | null>> = Object.freeze({
  reese: 'reeseBass', driven: 'reeseDriven', line303: 'line303', 'deep-reese': 'reeseDeep', crash: 'crash', 'tight-kick': 'kickTight', 'dry-snare': 'snareDry', 'high-punch-kick': 'kickPunchHigh', 'crack-snare': 'snareCrack', 'tight-hat': 'hatTight', 'shut-hat': 'hatShut',
  'knock-kick': 'kickKnock', 'wobble-reese': 'reeseWobble', 'sine-reese': 'reeseSub',
  shimmer: 'shimmerPad', supersaw: 'supersawLead', 'struck-organ': 'organStab', siren: null, own: null,
});

/**
 * **house-v2's own EQ** (round E1, Eugene 10-01: *"apply to v2 explicitly …
 * we need to cut more bass in v2 while keeping our range"*): the house's row of
 * the table below, and `baseV2.master`'s five gains. Over v1's (`EQ_V1`):
 *
 * - the **mid** bell (1.1 kHz) +2.5, the **presence** bell (2.6 kHz) +1.5 and
 *   the **air** shelf (8.5 kHz) +3 dB -- the tonal-balance listening draft
 *   of 09-28, which Eugene heard and said sounded better;
 * - the **low shelf** -2 -> -4 dB at the same 70 Hz: a cut of the sub's level
 *   and not of its range -- no high-pass moves, the corner stays, and S12's
 *   `bassBusDb: -2` stays beside it.
 *
 * The low-mid bell is v1's. What it measured is in `notes/rounds/eq-e1.md`.
 */
export const EQ_V2: Readonly<EqProfile> = Object.freeze({
  lowShelfDb: -4.0,
  lowMidDb: EQ_V1.lowMidDb,
  midDb: EQ_V1.midDb + 2.5,
  presenceDb: EQ_V1.presenceDb + 1.5,
  airDb: EQ_V1.airDb + 3,
});

/**
 * The benchmark drone's own place: the spell 27191 is played under
 * (`?spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81`), slow, dark and held --
 * no gleam, no spark, the loom up -- at the tempi a free pulse is played at.
 * The other tables leave it to the house (it stands nearer the house's place
 * than any of theirs); the EQ table names it, because its bottom is the music.
 */
const HELD_DRONE = place({ ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }, [40, 70]);
/** A row of the EQ table: the house's profile with a few gains of its own. */
const eqRow = (id: string, at: Place, own: Partial<EqProfile> = {}): EqEntry =>
  Object.freeze({ id, place: at, profile: Object.freeze({ ...EQ_V2, ...own }) });

/**
 * **The master's tone by place** (round E1, Eugene: *"assume it may be
 * adjusted on birds change (for fine-tuning genres)"*): the profile a place's
 * themes play at, read off the birds and the tempo like every table here (the
 * nearest row; the house's is `EQ_V2`), carried by each theme's settings and
 * walked to at the theme's boundary over a bar (`src/mix.ts`). **Every row is
 * the house's in this round** -- the table is the hook, and its tuning is a
 * listening pass of its own -- but for the one that is not:
 *
 * - **slow and held keeps v1's shelf** (-2 dB): the floating pulse and the
 *   benchmark drone are bass-led by design, the drone *is* the floor, and
 *   27191 is the ear fixture that says so;
 * - **and so does the fast broken beat** (round DNB-1), whose music is a sub
 *   (and since round DNB-2 its shelf is flat).
 *
 * Every place is listed, as `BASS_SOUND` lists its own: the table is read by
 * its nearest row, so a place it left out would take a neighbour's.
 */
export const EQ: readonly EqEntry[] = Object.freeze([
  // Round DNB-1: the fast broken beat keeps v1's shelf as the drones do — 77 %
  // of a drum and bass mix's power is under 120 Hz (source 8, 33 cuts), and
  // the place's own output read 42-66 %. Round DNB-2: flat (0 dB), since the
  // short kick took the low band the old one had been holding with it; the
  // mid, presence and air are E1's, untouched.
  // Round DNB-3: and the top v1's — the mid, the presence and the air back
  // under E1's lift, the liquid cuts of source 8 reading their mid 3-7 dB and
  // their presence 2-10 dB under the place's own.
  // Round DNB-5: the low-mid bell +2.5 where the base's is +7.5 (a broad lift
  // at 160 Hz, written for a house mix whose octave over the kick belonged to
  // nothing): here it stacked the line's harmonics, the snare's shell and the
  // bed's floor into 120-400 Hz, which read 6 dB over source 8's in the
  // harmonic half — the build-up he heard as pads in front of the bass.
  // U2b (his ear 10-13 on the Root sweep): Root leans the low shelf about the tile's own Root, -4 dB at nought, +1.5 at one
  Object.freeze({ ...eqRow('fast-broken-keeps-its-floor', FAST_BROKEN, { lowShelfDb: 0, lowMidDb: 2.5, midDb: EQ_V1.midDb, presenceDb: EQ_V1.presenceDb, airDb: EQ_V1.airDb }), leans: FAST_LEANS }),
  eqRow('base-tone-broken-driving', BROKEN_DRIVING),
  eqRow('base-tone-deep-still', DEEP_STILL),
  eqRow('base-tone-deep-half', DEEP_HALF),
  eqRow('base-tone-slow-wet', SLOW_WET),
  eqRow('base-tone-driving-four', DRIVING_FOUR),
  eqRow('base-tone-bright-four', BRIGHT_FOUR),
  eqRow('base-tone-high-four', HIGH_FOUR),
  eqRow('floating-keeps-its-floor', FLOATING, { lowShelfDb: EQ_V1.lowShelfDb }),
  eqRow('held-drone-keeps-its-floor', HELD_DRONE, { lowShelfDb: EQ_V1.lowShelfDb }),
  // ambient-bells (his ear, 10-17, at Spark 0.85): BELLS keeps the floor it plays at its own birds (the floating
  // pulse's), so a lean of Spark no longer hands it a grid place's tone
  eqRow('bells-keep-their-floor', BELLS, { lowShelfDb: EQ_V1.lowShelfDb }),
]);

/**
 * **The bass drive in parallel by place** (round B1, Eugene 09-29: *"the
 * original bass plus a driven copy, so it keeps its weight with the lo-fi
 * edge; distorted alone it loses it"*; and on hearing it 10-02: the slow
 * side is not where it belongs -- the aim was always the fast, bass-forward
 * side): the blend of the driven copy (`effects/bass-drive.ts`) summed under
 * the clean bass, written into the theme's `paramOverrides.bass.parallel`
 * where it is above nought and nowhere else, so the house's themes resolve
 * to the settings they always had. The blend is against the bass: at 1 the
 * edge is as loud as the bass, at a half six decibels under it;
 * `toneHarmonic` is the copy's low-pass as a harmonic of the theme's own bass
 * register (Eugene on the first cut, 10-02: *"a bit too mid-frequency"* at a
 * fixed 1.4 kHz, and the band should sit where the track is -- an octave
 * lower on a low, dark one): the eighth under the deep four, three octaves
 * over the lowest note, and the sixteenth under the broken beat, where the
 * reese wants its bite; Gleam and Root move the corner and the drive from
 * there (`bassDriveFor`, the effect's `knobs`); and the corner moves
 * (Eugene: *"repetitive as hell"* held still) -- a half-note wobble half
 * the corner deep under the deep four, shut on the bar line and opening,
 * and a lighter eighth-note one under the broken beat. Under the broken
 * beat the copy's floor is 240 Hz and the blend 0.35 (Eugene on the first
 * cut: *"I hear only the drive, not really a full-body bass underneath"*):
 * the reese's own body is 100-250 Hz and a copy with its floor at 150 sat
 * ten decibels over it there; lifted above the sub's second harmonic and
 * nine decibels under the bass, the sum's 100-300 Hz moves +0.9 dB where it
 * moved +6.4 (`notes/rounds/bass-b1.md`). It is on at the two fast places
 * and off everywhere else: the deep, still four at the
 * half-time tempo, where the bass is a held weight that wants grit, and the
 * fast broken beat, where it is a rolling reese. Every place is listed, as
 * `BASS_SOUND` lists its own: the table is read by its nearest row, so a
 * place it left out would take a neighbour's -- and the benchmark drone's
 * place is here at nought, so 27191 stays as it is.
 *
 * **And a quiet one at the house** (round EQ-1, `notes/rounds/eq-1.md`): the
 * house's own place reads no row of the table (it is nearer the house than
 * any place), so its row is `BASS_DRIVE_HOUSE`, read where nothing above is
 * nearer. The house's groove held 85-90 % of its power under 100 Hz and
 * 6-7 % at 100-300 against the references' 14-18 %; the copy fills the
 * body above the sub and leaves the sub to the clean bass: blend 0.3 (ten
 * decibels under the bass), the corner the eighth harmonic of the bass
 * register (about 265-280 Hz on the house's low notes), the floor at 180 Hz
 * so the sub's second harmonic stays the clean bass's own, and no wobble --
 * the deep four's half-note sweep is that place's movement, not the house's.
 * Measured on seeds 1, 6 and 29 at theme two with the kick's partial at 0.2:
 * 100-300 Hz 6.1-9.0 % to 9.3-11.2 %, the 20-60 Hz band at -14 LUFS within
 * 0.35 dB. `?bassdrive=0` switches it off as it does the fast places'.
 */
export const BASS_DRIVE: readonly BassDriveEntry[] = Object.freeze([
  // under the deep half's `ROLES` row at 0.45 over the turned line (round DUB-3: the two-beat wave over the
  // held sine; DUB-1 and DUB-2 had it off); `roles=classic` plays it at its own 0.6
  { id: 'driven-under-deep-half', place: DEEP_HALF, blend: 0.6, drive: 0.9, toneHarmonic: 8, wobbleBeats: 2, wobbleDepth: 0.5 },
  // Round DNB-3: a breath of edge under the liquid sub, not a growl — the blend
  // 0.15 (16 dB under the bass) where it was 0.35, the drive 0.6, no wobble.
  // Round DNB-5: off — the line is a clean sine and the copy's edge was half
  // the fizz he heard ("a Metal Zone"); the row stays, at nought.
  { id: 'driven-under-fast-broken', place: FAST_BROKEN, blend: 0, drive: 0.6, toneHarmonic: 16, floorHz: 240 },
  // The rest keep the clean bass alone.
  ...[BROKEN_DRIVING, DEEP_STILL, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `clean-bass-${i + 1}`, place, blend: 0 })),
] as BassDriveEntry[]);
/** The house's own row (round EQ-1): what plays where no row above stands nearer than the house's own place. */
/**
 * Round EQ-5 (10-03, heard: *"the bass sounds like it has a light overdrive
 * effect"*; the parallel drive is not for deep house): the house's row stays
 * and plays nothing, blend 0, so the house's seeds play the clean bass; the
 * fast places keep theirs. The tone and the floor are kept as they were, so a
 * row that comes back under a bird or on a break starts where this one stood.
 */
export const BASS_DRIVE_HOUSE: BassDriveEntry = Object.freeze({ id: 'quiet-edge-at-the-house', place: HOUSE_PLACE, blend: 0, toneHarmonic: 8, floorHz: 180 });

/**
 * **The bed by place** (round EQ-2, `notes/rounds/eq-2.md`; the review's
 * second and third causes, `notes/grok/eq-review.md` §5): the house's
 * grooves held 630 Hz-2 kHz seven to sixteen decibels under the references,
 * on notes that exist and were played too far back. The house's row
 * (`BED_HOUSE`, read where no row below stands nearer than the house's own
 * place) and every place with a grid take it alike:
 *
 * - **the bed's levels a floor**: the keys at least `keysDb`, the pad at least
 *   `padDb` -- the sub room's -14.5 and -9.5 rise to it, the growl room
 *   (-9.5 / -6) already stands over it and keeps its own; since round EQ-6
 *   (`notes/rounds/eq-6.md`) the most a section rises to, keyed to its own bed
 *   as the bell is (`floorOfBed`): a thin bed takes the whole floor, a forward
 *   one keeps the room's level -- seed 29 theme two's main, a piano and a pad
 *   over a sub, came back from 36.7 to 28.5 % at 300 Hz-2 kHz, the thin beds
 *   of seeds 1 and 7 not at all;
 * - **the melodic duck shallower**: `duckDb` where the base table's -16
 *   reached every v2 theme (the sets duck the mids 6-9 dB); the bass's
 *   -8 is not this row's and stays; and (round PIANO-2) `struckDuckDb` for
 *   the struck voices, a shallow dip after the strike, so a sparse piano
 *   motif is not six decibels apart note to note by where it falls;
 * - **a presence bell on the harmonic bus**, `bellDb` at 1.1 kHz
 *   (`BED_BELL`), before the duck, so it lifts the notes and not their rooms;
 * - **a lean to two harmonic layers**, `bothLean` on the density's chance,
 *   where the scene is not the drone in front.
 *
 * **The drones keep their floor**: the floating pulse and the benchmark
 * drone's place (27191) take none of it, and keep the strings' corner they
 * had (`DARK_STRINGS_HZ`) where the instrument's own opened (`params.ts`):
 * the held drone's dark chord is the music there.
 *
 * Walked one at a time on the eight links of EQ-1 and seeds 3 and 7: the
 * floors (-13.25 / -8.5, then -12 / -7.5) took seed 1 theme two's 300 Hz-2 kHz
 * from 4.8 to 6.9 % and seed 29's from 23.9 to 31.0; the duck at -14, -12 and
 * -10 each added a few tenths of a point and took the mid band's trough
 * under the kick from 18 dB to 16, 14 and 12.6 on seed 1; the bell +2.5 added
 * two points on the thin beds and six to nine on the beds already full;
 * the lean, a quarter, took the house's mains with no pad and the drone not
 * in front from 41 of 168 to 26 (seeds 1-40, three themes each), and gave seed
 * 6 theme two the pad its first long main lacked (0.9 % to 11.7). The duck's
 * depth is his ear's: `?duckdb=` listens to another.
 */
const BED_HOUSE_ROW = { keysDb: -12, padDb: -7.5, pianoDb: -13.5, duckDb: -12, struckDuckDb: -3, bellDb: 2.5, bothLean: 0.25 };
/** The strings' corner before round EQ-2, which the drones keep. */
const DARK_STRINGS_HZ = 1200;
/**
 * **The bed under the drums and the bass** (round DNB-3): at the fast broken
 * places the harmonic layer is a support, so its levels have a ceiling where
 * the house's have a floor — the pad held LIQUID_BED_UNDER_DB under the house's
 * floor, the keys and the piano as far under theirs — no bell, no lean to two
 * layers (the support's one bed), and a gentler duck, so the held chord
 * breathes under the kick rather than pumping.
 */
// Round DNB-4: 11 dB under where it was 6 (the source's drops read their
// 250 Hz-3 kHz 3-4 dB under the place's), and the bed **lifted where the kick
// leaves** — 5 dB in a breakdown, 3 in an intro whose row lifts (`liftDb`), as
// the source's pads carry its breakdown (the low-mids 1.9 dB under the level)
// and its intro (3.8) — held between 420 Hz and 650 Hz there (`thinHz`,
// `darkHz`: the source's breakdown keeps its 60-250 Hz 22 dB and its 800 Hz-3 kHz
// 13 dB under the level), and the duck −4 where it was −8: a pad that
// breathes, not one that waves.
// Round DNB-5 (his ear on DNB-4: *"non-stop drone pads in front, competing
// with an already busy and overdriven bass"*): 15 dB under where it was 11, and
// held between 250 Hz and 3 kHz wherever no section lifts it — the source's
// harmonic 1.5-5 kHz reads 33 dB under its whole, the place's beds 19-26, and
// the tails after its snares fall 6 dB in 200 ms where the bed held ours at 2-3.
// Round DNB-7 (his ear on DNB-6: *"the drone notes have a similar grain … which
// makes the overdriven part of the bass blend in, so I can't hear the bass at all"*,
// and his rule: *"all pads, drones and synths should sit on the higher octaves in
// DnB"*): where the drums and the bass play, the held and struck lanes' notes under
// C4 go up an octave and the bed 3 dB under where it was (`up`), its band 350 Hz-4 kHz
// where it was 250 Hz-3 kHz. Measured on the stems of the benchmark and seeds 23 and 7
// (`score-8.py --masking`), the share of the bass's 200 Hz-2 kHz power the bed covers
// 0.21 / 0.15 / 0.19 -> 0.11 / 0.07 / 0.12, the bed over the bass there +7.4 / +6.1 /
// +9.1 dB -> +2.4 / +0.5 / +4.3. The bed carries no noise grain at this place (the
// GRAIN row is empty; its 200 Hz-2 kHz flatness 0.0008, a tone): the grain he hears
// is the saws' own. A whole octave up (`octaves` 1) halves the cover again and costs
// score-8 the low mids the source has; his ear to say.
export const LIQUID_BED_UNDER_DB = 15;
const LIQUID_BED_ROW = {
  padCeilDb: BED_HOUSE_ROW.padDb - LIQUID_BED_UNDER_DB, keysCeilDb: BED_HOUSE_ROW.keysDb - LIQUID_BED_UNDER_DB,
  pianoCeilDb: BED_HOUSE_ROW.pianoDb - LIQUID_BED_UNDER_DB, duckDb: -8, struckDuckDb: -3, bellDb: 0, bothLean: 0,
  liftDb: Object.freeze({ breakdown: 1.5, intro: 0 }), thinHz: 420, darkHz: 650, bandHz: Object.freeze([600, 5000]) as readonly [number, number],
  // 10-06, hands-on: the bed still covered the kick's punch (200-1500 Hz 7-12 dB under source 9's at each kick); a whole octave up, 6 dB under, 600 Hz-5 kHz
  up: Object.freeze({ octaves: 1, floor: 60, ceiling: 84, db: -6 }),
};
export const BED: readonly BedEntry[] = Object.freeze([
  ...[FAST_BROKEN, FAST_BROKEN_DEEP].map((place, i) => Object.freeze({ id: `a-bed-under-the-drums-${i + 1}`, place, ...LIQUID_BED_ROW })),
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR]
    .map((place, i) => Object.freeze({ id: `a-fuller-bed-${i + 3}`, place, ...BED_HOUSE_ROW })),
  Object.freeze({ id: 'floating-keeps-its-floor', place: FLOATING, stringsHz: DARK_STRINGS_HZ }),
  Object.freeze({ id: 'held-drone-keeps-its-floor', place: HELD_DRONE, stringsHz: DARK_STRINGS_HZ }),
  // ambient-bells (his ear, 10-17, at Spark 0.85): BELLS keeps the bed it plays at its own birds (the floating pulse's).
  // Without it, from Spark 0.7 or so the nearest row was a grid place's fuller bed: the keys' floor 2.5 dB up (the
  // bells are on the keys layer, so every strike went 2.5 dB further into the limiter), a presence bell at 1.1 kHz
  // and the melodic duck.
  Object.freeze({ id: 'bells-keep-their-floor', place: BELLS, stringsHz: DARK_STRINGS_HZ }),
] as BedEntry[]);
/** The house's own row (round EQ-2): what plays where no row above stands nearer than the house's own place. */
export const BED_HOUSE: BedEntry = Object.freeze({ id: 'a-fuller-bed', place: HOUSE_PLACE, ...BED_HOUSE_ROW });

/**
 * **The grain by place** (round SPARK-1, `notes/rounds/spark-1.md`; the one
 * hole EQ-1/2/3/5 left: 2-8 kHz at 0.5-1.5 % of the house against the
 * references' 2.5-3): the presence comes from the voices themselves, at
 * their own register, and never from an octave up. The reading behind it, the
 * harmonic layer of the catalogue's deep house chunks where the pads and keys
 * carry the mids (HPSS, 32 chunks): 2-8 kHz sits a median 19.6 dB under the
 * 200 Hz-2 kHz body, above 8 kHz 35 dB under, the 2-8 kHz band is a third
 * noise by its flatness (0.28), and the strike stands 1.3 dB over the sustain.
 * Ours, the same reading: the electric piano 47 dB under its body, the piano
 * 23-37, the strings (since EQ-2's corner) 13-17 and none of it noise, and
 * nothing at all above 8 kHz. So the row gives the keys their tine through the
 * lowpass, the strings a breath of air, the piano its hammer and body, and the
 * bus a quiet edge — dry, never a drive heard as drive:
 *
 * - **the house and every place with a grid**: the house's row;
 * - **the fast broken place takes none**: its 2-8 kHz is already 11 % against
 *   its ~4 % (the clav, the wavetable pad and the loose hat carry it);
 * - **the drones take none**: the floating pulse and the benchmark drone's
 *   place (27191) keep the record's sound.
 *
 * Walked in steps on the house links (`notes/rounds/spark-1.md`); the listening
 * rows `?sparkkeys=0`, `?sparkpad=0`, `?sparkpiano=0`, `?sparkbus=0`,
 * `?sparkstrike=0` (the bars' strike, round HF-NOISE) and
 * `?spark=0` take each part, or all of them, away on one build.
 */
const GRAIN_HOUSE_ROW = {
  keys: Object.freeze({ level: 1, hz: 2000, decay: 0.15, tine: 3, hold: 0.3, chiff: 0.1, chiffHz: 4500, chiffDecay: 0.01 }),
  breath: Object.freeze({ level: 0.03, loHz: 6000, hiHz: 14000 }),
  piano: Object.freeze({ hammer: 2.5, body: 0.4 }),
  bus: Object.freeze({ blend: 0.25, drive: 0.6, preHz: 250, floorHz: 1800, toneHz: 5000 }),
  // Round HF-NOISE (`notes/rounds/hf-noise.md`): the vibes, off the edge, take
  // their 3-6 kHz on the strike — 2.5-5 kHz noise at a fifth of the note's
  // peak, sixty decibels down in 40 ms: at the strike 5 dB over what the edge's
  // copy laid there, 73 dB under it 150 ms on.
  strike: Object.freeze({ level: 0.2, hz: 3500, decay: 0.04 }),
};
/**
 * The bus's edge at the deep half-time place, set by ear at the desk (10-05,
 * seed 6 at its own spell): the held Rhodes' two carriers beat under the drive
 * and the edge wobbles with them; 0.25 was too much of it, 0.12 calms it and
 * costs the house nothing, since the house keeps its row. Spark moves it from
 * here as from the row (the place's Spark is the spell's, so this is the blend).
 */
const DEEP_HALF_BUS = Object.freeze({ ...GRAIN_HOUSE_ROW.bus, blend: 0.12 });
export const GRAIN: readonly GrainEntry[] = Object.freeze([
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR]
    .map((place, i) => Object.freeze({ id: `grain-from-the-voices-${i + 1}`, place, ...GRAIN_HOUSE_ROW, ...(place === DEEP_HALF ? { bus: DEEP_HALF_BUS } : {}) })),
  Object.freeze({ id: 'fast-broken-has-its-top', place: FAST_BROKEN }),
  Object.freeze({ id: 'fast-broken-deep-has-its-top', place: FAST_BROKEN_DEEP }),
  Object.freeze({ id: 'floating-keeps-its-grain', place: FLOATING }),
  Object.freeze({ id: 'held-drone-keeps-its-grain', place: HELD_DRONE }),
  // ambient-bells (his ear, 10-17: "some clap like ... maybe just hi hat ... this particular timbre with super sparse
  // bell space was a bit unexpected", at Spark 0.85): BELLS took the nearest grain row's, and from Spark 0.6 or so it
  // wrote the harmonic bus's edge and the mallet strike's top, a 3.5 kHz click 40 ms long on every bowl, bell and vibes
  // strike. An acoustic place takes none: the struck voices' own attacks are the strike.
  Object.freeze({ id: 'bells-take-no-grain', place: BELLS }),
] as GrainEntry[]);
/** The house's own row (round SPARK-1): what plays where no row above stands nearer than the house's own place. */
export const GRAIN_HOUSE: GrainEntry = Object.freeze({ id: 'grain-from-the-voices', place: HOUSE_PLACE, ...GRAIN_HOUSE_ROW });

/**
 * **The drums' grain by place** (round SPARK-2, `notes/rounds/spark-2.md`):
 * the top of the kit, read event by event against the catalogue's deep house
 * chunks (HPSS, onsets in the percussive part, 2198 hats and 2061 claps in
 * 32 chunks) and against each of our drums struck alone. The shape over
 * 2-16 kHz was not what was closed — our hats sit at the references' median
 * band for band — but what the shape does not show: the references' hats
 * carry metal above 8 kHz (0.33 of spectral flatness there, ours 0.52-0.58,
 * smooth noise), their closed hats fall on at one slope to -20 dB (at 1.9-2.0
 * times their -10 dB, ours choked at 1.3-1.7), their claps crack (the first
 * 6 ms a decibel over the body, ours three under), and their top is grainier
 * than our shaker (2.91 against 2.73 by the envelope-free kurtosis). So the
 * row gives the hats half their top as metal, a breath of air past the lid
 * and a little tail, the shaker air and beads, the clap its slap — each hat
 * at the energy it had (`makeUp` in the engine), so the hats' level in the
 * mix holds within two tenths of a decibel. The tail is the phone's price
 * (mid onsets 52, 50, 48 of a hundred at 0, 0.3, 0.6 on seed 6 theme two), so
 * the house takes a quarter of it and the deep half the whole:
 *
 * - **the house and every place with a grid**: the house's row;
 * - **the deep half (the Dubstep spell)** takes more air and the whole
 *   tail: its top was the emptiest (0.13 % over 8 kHz), the tight hat
 *   carrying it alone, and its share moves only to 0.145 — the hats' level is
 *   what that share is, and the level is held;
 * - **the fast broken place takes none** (both rows): its 2-8 kHz is 11 %;
 * - **the drones take none**: the floating pulse and the held drone (27191).
 *
 * The listening rows `?sparkhats=0`, `?sparkshaker=0`, `?sparkclap=0` and
 * `?sparkdrums=0` take each part, or all of them, away on one build.
 */
const DRUM_GRAIN_HOUSE_ROW = {
  hats: Object.freeze({ top: 0.5, air: 0.2, tail: 0.25 }),
  shaker: Object.freeze({ air: 0.25, tail: 0.6, beads: 0.35 }),
  clap: Object.freeze({ crack: 1, crackHz: 3200, crackDecay: 0.0015 }),
};
const DRUM_GRAIN_DEEP_ROW = {
  ...DRUM_GRAIN_HOUSE_ROW,
  hats: Object.freeze({ top: 0.5, air: 0.4, tail: 1 }),
};
export const DRUM_GRAIN: readonly DrumGrainEntry[] = Object.freeze([
  ...[BROKEN_DRIVING, DEEP_STILL, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR]
    .map((place, i) => Object.freeze({ id: `drums-grain-${i + 1}`, place, ...DRUM_GRAIN_HOUSE_ROW })),
  Object.freeze({ id: 'deep-half-opens-its-top', place: DEEP_HALF, ...DRUM_GRAIN_DEEP_ROW }),
  Object.freeze({ id: 'fast-broken-keeps-its-kit', place: FAST_BROKEN }),
  Object.freeze({ id: 'fast-broken-deep-keeps-its-kit', place: FAST_BROKEN_DEEP }),
  Object.freeze({ id: 'floating-keeps-its-kit', place: FLOATING }),
  Object.freeze({ id: 'held-drone-keeps-its-kit', place: HELD_DRONE }),
] as DrumGrainEntry[]);
/** The house's own row (round SPARK-2): what plays where no row above stands nearer than the house's own place. */
export const DRUM_GRAIN_HOUSE: DrumGrainEntry = Object.freeze({ id: 'drums-grain', place: HOUSE_PLACE, ...DRUM_GRAIN_HOUSE_ROW });

/**
 * **The drums' weight by place** (round DNB-1, the readings of source 8 against
 * the fast broken place's own output, `notes/rounds/dnb-1.md` §3): the
 * backbeat at the kick's weight there (the snare read +0.4 dB against the kick
 * over the cuts, median; the fast broken place's own snare -7.4 to -9.0: eight
 * decibels on the plan, of which the drum bus and the limiter leave some), the
 * bass five decibels up (77 % of the mix's power under 120 Hz against the
 * place's 42-66 %; the bass compressor takes about half of it back), the kick
 * shorter (its tail held the low band 12-26 dB over the sub for 160 ms where
 * the mix's sub dips 3 dB for 80 and is back), and a short duck: the low bus
 * 5 dB down at 20 ms and back within an eighth note. Every other place keeps
 * its room's.
 *
 * Round DNB-2, the low end against source 8 again (`notes/rounds/dnb-2.md`):
 * the record's kick shortened still held the 25-60 Hz band 10-14 dB over the
 * sub 20 ms after a hit and 6-14 dB at 80, where the mix's sub is 3.4 dB down
 * and back. A shorter kick is a different drum and not a decay multiple, so
 * the place plays its own: `kickTight` (`sounds`), a punch onto 58 Hz gone by
 * 140 ms, in place of whichever kick the kit drew, 5 dB under the punch's
 * trim so the snare stands nearer it (the snare read 4-6 dB under the kick,
 * the source's level with it); the kick's decay multiple is then the
 * room's (nothing at the place plays the room's kick). And the sub that kick
 * was standing in for — the old kick's tail was most of the band's power, and
 * without it the sub share fell to 15-32 % — is the line's own: 11 dB up where
 * it was 5, into a bass compressor the readings ask for (the source's bass
 * crest 8-11 dB, the place's 12-15), threshold -26, ratio 4, 5 ms in and 90
 * out where the room's -20, 2.2, 18 and 120 took half of any lift back and
 * left the peaks; the power under 120 Hz reads 62-85 % where it read 38-73.
 * And the duck under it 8 dB deep where it was 5 — the house's own low depth,
 * in the place's short shape (the minimum at 20 ms, 60 % back at an eighth of
 * a beat, whole by a quarter): the bass alone under silent kicks dips 5.6-6.3
 * dB at 20 ms on 25-120 Hz and is back within a decibel by 80, on the tile's
 * four themes and on the DnB rows that duck at all (5.3-7.5 dB), where the
 * mix's sub dips 3-10 dB and is back by 80 ms.
 *
 * And the snare drier (`snareDry`, in place of the snare the broken kit
 * drew; a clap or a rim played as drawn until U1, when the crack took the
 * backbeat whatever was drawn): the same shell, wires and crack,
 * -10 dB at 55 ms where the snare's is 70, the shell gone in 80 ms and a third
 * of its room — alone it is 43-50 ms to -12 dB where the snare read 52-65. A
 * gentle step and not half: the place's long tail in the mix (130-500 ms
 * against the source's 70-100) is the pads and keys sounding after the hit,
 * which the snare alone never was, and the backbeat's lift stays DNB-1's 8 dB.
 */
//
// Round DNB-3, liquid: the ghosts 6 dB back under the snare's lift (struck at
// 0.2-0.35, they rode the 8 dB with it and read as hits: six snares a bar at
// the drops where source 8's liquid cuts read 2.4-3.4 and their ghosts
// 0.8-2.5), and the hats 2 dB lighter.
// Round DNB-3, his ear (10-05): *"the drums are using some sort of hi-hat that's
// very loud and dominating … definitely need to close hats for now"*, and the
// drums waving under the limiter on every snare — the bass stem read 12 dB over
// the kick and the snare, and drove it. The bass lift 11 → 5, the hats closed
// and 5 dB lighter.
//
// Round DNB-4, against the opening of source 8 (`packages/mining/tools/match-8.py`,
// `notes/rounds/dnb-4.md`). What made the drums wave was the snare: alone it
// stood 6 dB over the master's ceiling, its crest 18 dB, so the limiter pulled
// the whole mix down for a beat after every hit. So:
// - **the clips** (`clip`): the drums' bus through a soft clip 11 dB into its
//   knee, the kick and the bass where they sum at 4, and the theme's whole sum
//   after its trim at 10 — each rounds a peak where it stands and moves nothing
//   after it; at the benchmark's drops the limiter is asked for 2 dB at the
//   most where it was asked for 14, and the ask swings a decibel beat to beat
//   where it swung 12;
// - **the balance read off the cuts**: the snare level with the kick at their
//   hits (+0.3 dB in the source's drops: the backbeat's lift 8 → 2 and the kick
//   4 dB under its lane), the hats 8 dB under the snare at theirs (the
//   noise-led closed hat, `hatShut`, 4.5 dB over its lane), the bass 10 dB over
//   the drums (its lift 5 → 10, now that it no longer drives the limiter), the
//   ghosts nearly with the snare (−1.5: the source's read two a bar);
// - **the level** (`targetLufs`, `measuredLufs`): the place's themes trimmed to
//   −11.5 LUFS (his word: about −11, more than the house; the Dubstep drops'
//   family stands there too) from what the place's own windows measure at a
//   trim of nought — −15.12 LUFS, 60 windows of seeds 1-30 at the benchmark's
//   spell, sd 0.96 (`tools/loudness-fit.ts --spell … --tag fastbroken3
//   --measure`, `--fit --with …,fastbroken3 --max 0`); the house's model read
//   them eight decibels thin, and DNB-3 had capped the trim at nought;
// - **the kit under a lifted section** (`liftDrums`): in a breakdown the break
//   18 dB under the pads (the source's drums sit 38 dB under its pads there), in
//   the intro the snare 6 and the hats 10 under, so the pads lead it.
// Round DNB-5, the line (`BASS_SOUND`'s sine reese): the kick and the bass no
// longer through a clip where they sum (`clip.low` gone: the bass's own clip
// was half the fuzz), and the duck under the kick 6 dB where it was 8: the
// reference text asks 1-3 dB, but the recording's sub, read period by period,
// falls 6-10 dB for the first 100 ms after each kick on a held note as on a new
// one, and is back by 120 ms — his ear to say.
// The liquid bass rounds (10-06/07): the line 4 dB forward (`bassDb` -1 to 3, the drums
// as they were: a more defined shape), and the master limiter letting go in 90 ms where the
// room's 200 held the line down after every kick (`limiterReleaseMs`).
// The line's own contours supply its pressure. The old eight-bar drop push
// doubled part of the low fundamental, then faded it away; the repeat lost
// about 4.6 dB of weight. Keep the build/transition pushes, and give the line
// a steady place level with less backbeat competition (definition round, 10-08).
// `bassDb` and `limiterReleaseMs` are knobs since the liquid knobs (10-07), `push.dropLevel` since
// the liquid desk (10-08): ranges declared in `DRUMS_KNOBS` (`places.ts`), these numbers their defaults.
const FAST_DRUMS = { kit: 'dnb/kit-liquid-two-step', bassBodyDb: 0, push: { dropLevel: 0 }, clip: { driveDb: 0, knee: 0.6, curve: 2, mix: { driveDb: 2, knee: 0.7, curve: 2, makeupDb: 6.2 }}, sends: { reverbToneHz: 10000, roomCorr: 0.3, roomHighHz: 14000, roomLowHz: 200 }, backbeatDb: -2, kickDb: 8, bassDb: 5, kickDecay: 1, limiterReleaseMs: 90, ghostDb: -2, hatsDb: -2.5, targetLufs: -9, measuredLufs: -15.22, liftDrums: { breakdown: { kick: -18, backbeat: -18, offbeat: -18 }, intro: { backbeat: -6, offbeat: -10 } }, busComp: { threshold: -6, knee: 6, ratio: 2, attack: 0.01, release: 0.08 }, throws: { everyBars: 8, chance: 0.5, delay: 0.45, reverb: 0.3 },
 bassComp: { threshold: -24, knee: 6, ratio: 1.4, attack: 0.03, release: 0.15 },
  duck: { lowDepthDb: -3, minimumAt: 0.02, firstLeg: 0.12, recoverBy: 0.25 },
  // the backbeat whatever the house's draw put on it (PLAN-UNIFY U1, the fast-place birds' bug 3: the clap and the rim,
  // leaned in by Gleam, played through the liquid kit in place of its crack — seed 1 at Gleam 1 struck 552 rimshots)
  sounds: { kick: 'high-punch-kick', kickPunch: 'high-punch-kick', kickLong: 'high-punch-kick', snare: 'crack-snare', clap: 'crack-snare', rimshot: 'crack-snare', hatClosed: 'shut-hat', hatLoose: 'shut-hat', hatSizzle: 'shut-hat' },
  // ...and the clap and the rim are a sound swap only: the cast is counted on the drawn voice, so no admission flips
  soundOnly: ['clap', 'rimshot'],
  // the birds at the fast places (PLAN-UNIFY U2): Root on the line's lift, Veil on the throws
  leans: FAST_LEANS };
/**
 * **The broken kit's figures by place** (round DNB-4, `BreaksEntry`): at the
 * fast broken places the kick talks more than the style's table lets it — the
 * mix's two-step drops read 3.2-3.5 kicks a bar where the place played two —
 * so its figures are two bars long, the second bar pushing: a kick before the
 * third beat and after it, the snare on two and four as everywhere. Common
 * shapes of the style, none of them any record's.
 */
export const BREAKS: readonly BreaksEntry[] = Object.freeze([
  ...[FAST_BROKEN, FAST_BROKEN_DEEP].map((place, i) => Object.freeze({ id: `two-step-pushing-${i + 1}`, place, masks: Object.freeze([
    Object.freeze({ name: 'two-step, the classic', m: 'x.........x.....x.........x.....', s: '....x.......x...', b: 2, c: 3 }),
    Object.freeze({ name: 'two-step, a push in the second bar', m: 'x.........x.....x......x..x.....', s: '....x.......x...', b: 2, c: 2 }),
    Object.freeze({ name: 'two-step with its pickup', m: 'x.........x....xx.........x.....', s: '....x.......x...', b: 2, c: 1 }),
  ]) })),
  // Every other place draws the style's own table, and says so: a table is
  // read by its nearest row, so a place left out would take the fast one's.
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `the-style-s-own-figures-${i + 1}`, place, masks: [] })),
] as BreaksEntry[]);
export const DRUMS: readonly DrumsEntry[] = Object.freeze([
  { id: 'snare-at-the-kick-short-duck', place: FAST_BROKEN, ...FAST_DRUMS },
  { id: 'snare-at-the-kick-short-duck-deep', place: FAST_BROKEN_DEEP, ...FAST_DRUMS },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `room-drums-${i + 1}`, place, backbeatDb: 0, kickDecay: 1 })),
] as DrumsEntry[]);
{
  // the line's lift, the limiter's release and the drop push, held to their declared ranges (`DRUMS_KNOBS`)
  const bad = DRUMS.flatMap(drumsKnobFaults);
  if (bad.length) throw new Error(`the drums table: ${bad.join('; ')}`);
}

/**
 * **The small things by place** (round DNB-1, `src/subsections.ts`). The fast
 * broken beat draws a lot, from the readings: a switch-up in four drops of
 * five, eight or sixteen bars long (the mix's held 12-32, median 16); a
 * turnaround on a third of the four-bar groups (a two-step drop varies its
 * beat about once in four bars); a fill on seven section lines in ten (the
 * bar before a line varies on 0.74 of the half-time lines and 0.86 of the
 * breakdowns'); a one-bar drop-out at four sixteen-bar lines in ten and a
 * crash after it. The places between draw some (`HOUSE_SUBSECTIONS`: a fill
 * on three lines in ten, a drop-out on one in ten, nothing else), the house
 * itself its mains' own (`THE_HOUSE_SUBSECTIONS`, round M1), and the drone
 * places none.
 */
export const HOUSE_SUBSECTIONS: SubRates = Object.freeze({ switchUp: 0, switchBars: [], turnaround: 0, fill: 0.3, dropOut: 0.1, crash: false });
/**
 * **The house's own mains** (round M1, the mains pass; `notes/rounds/mains-m1.md`).
 * Read the same way, bar by bar against the cycles before it, a reference
 * house main changes something on 7.9 bars in 16 (four cuts of source 1, the
 * readings' drums and bands, `the mains pass's readings in the catalog`) and the
 * house's on 2.2 (its plans over 120 themes, `tools/mains.ts`; 0-1.9 off three
 * of its own mains rendered and read by the same tool). A measured step toward
 * the cuts, the share his ear's to set: a switch-up in three mains of five, a
 * phrase or two long (the cuts' changes hold four to eight bars, not the
 * mix's 12-32), announced by a turnaround on the phrase before it; a
 * turnaround on three four-bar groups in ten; a mark on three sixteen-bar
 * lines in five — a drop-out, the bass out, a breath, a sweep in — and a fill
 * into two section lines in five. The house's near places keep
 * `HOUSE_SUBSECTIONS`. (His word on M1, 10-02, "we can move more": the line
 * and the turnaround rates raised from 0.4 and 0.2.)
 */
export const THE_HOUSE_SUBSECTIONS: SubRates = Object.freeze({
  switchUp: 0.6, switchBars: [8, 8, 16], turnaround: 0.3, fill: 0.4, dropOut: 0.6, crash: false, turnIntoSwitch: true,
  // The hats' own (his word on seed 1): a variation over a sixteen-bar phrase's second half one phrase in two,
  // half a phrase or a quarter of one (the last four bars), and at least one in any main past sixteen bars.
  variation: 0.5, variationBars: [8], variationFloor: 16,
});
// Which figure plays is the rows' own weight (`recipes/treatments/`, round T1):
// the rolling snare and the doubled snare at 3, the kick push and the stepper
// at 2, the half-time switch at 1; the place says only how much of each kind.
// Round DNB-3, liquid (T2's ear on the tile: "the sounds are all over the
// place"): fewer of them — a switch-up in half the drops where it was four in
// five, a turnaround on a quarter of the groups, a fill on three lines in
// five; the drop-out and the crash as they were. Source 8's liquid cut reads
// 2.4 small things in 16 bars, its intro 3.3, its busiest 8.
// 10-06, hands-on: source 9 never switches its beat; it fills most phrase lines, picks up into a bar every few
// bars in a drop's second half, drops a backbeat now and then, and lifts its open hat for a phrase's second half
const MANY_SUBSECTIONS: SubRates = Object.freeze({
  switchUp: 0, switchBars: [8, 16, 16], turnaround: 0.35, fill: 0.8, dropOut: 0.2, crash: true,
  variation: 0.5, variationBars: [8], variationFloor: 16,
});
export const SUBSECTIONS: readonly SubSectionsEntry[] = Object.freeze([
  // the birds at the fast places (PLAN-UNIFY U2): Veil on the fill at a section's line
  { id: 'many-small-things', place: FAST_BROKEN, rates: MANY_SUBSECTIONS, leans: FAST_LEANS },
  { id: 'many-small-things-deep', place: FAST_BROKEN_DEEP, rates: MANY_SUBSECTIONS, leans: FAST_LEANS },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR]
    .map((place, i) => ({ id: `some-small-things-${i + 1}`, place, rates: HOUSE_SUBSECTIONS })),
  ...[FLOATING, HELD_DRONE].map((place, i) => ({ id: `no-small-things-${i + 1}`, place, rates: NO_SUBS })),
] as SubSectionsEntry[]);

/**
 * **The kinds of section by place** (round T2, `src/sections.ts`): the form
 * draws its sections by kind as it always has, and where a kind has a second
 * row the place says which it prefers, by share. The fast broken beat prefers
 * the rows read off source 8 — its intro of pads then the break, its
 * breakdown with the sub gone and a roll, its outro thinning — at twice the
 * house row's share (`sections/<kind>` at 1), so the house's own pattern is
 * still drawn there one time in three; its main of kick and sub then the
 * break at the house row's own share. Every other place names nothing: the
 * rows' own weights, which is the house's one row per kind and no die.
 */
// Round DNB-3: the intro of pads and the break without its kick at three
// times the house's share where it was two (source 8's first cut, the one he
// points at: "drop4 nokick8 A4 nokick4 B4 nokick4", its long stretches with
// no kick), so the house's own intro is drawn one time in four.
const THE_MIX_S_SECTIONS: SectionsEntry['prefers'] = Object.freeze({
  'dnb/dnb-intro': 3, 'dnb/dnb-breakdown': 2, 'dnb/dnb-outro': 2, 'dnb/dnb-main': 1,
});
export const SECTIONS: readonly SectionsEntry[] = Object.freeze([
  { id: 'the-mix-s-sections', place: FAST_BROKEN, prefers: THE_MIX_S_SECTIONS },
  { id: 'the-mix-s-sections-deep', place: FAST_BROKEN_DEEP, prefers: THE_MIX_S_SECTIONS },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `own-sections-${i + 1}`, place, prefers: Object.freeze({}) })),
] as SectionsEntry[]);

/**
 * **The stroke on a section line by place** (round DNB-1): the crash where the
 * fast broken beat lands a line (the readings' crash on the one after a
 * drop-out, and on a drop's first bar), a cheap voice on the impact lane in
 * place of the impact's sine. Every other place keeps the lane's own.
 */
export const GLUE_SOUND: readonly GlueSoundEntry[] = Object.freeze([
  { id: 'crash-on-the-line', place: FAST_BROKEN, slot: 'impact', sound: 'crash' },
  { id: 'crash-on-the-line-deep', place: FAST_BROKEN_DEEP, slot: 'impact', sound: 'crash' },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `own-stroke-${i + 1}`, place, slot: 'impact' as const, sound: 'own' })),
] as GlueSoundEntry[]);

/**
 * **The walking root by place** (round DNB-2, `src/walk.ts`): the share of a
 * held chord's later bars whose bass root moves — a step mostly, toward the
 * next chord where it can. At the fast broken beat 0.45 (source 8: the root
 * every 1.6 bars while the chord holds 2.3, so with the place's chords of two
 * and four bars the root moves about every one and a half); nowhere else,
 * the house included, whose bass follows its chords as the benchmarks do.
 */
export const WALK: readonly WalkEntry[] = Object.freeze([
  { id: 'walking-root', place: FAST_BROKEN, rate: 0.45 },
  { id: 'walking-root-deep', place: FAST_BROKEN_DEEP, rate: 0.45 },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `root-on-the-chord-${i + 1}`, place, rate: 0 })),
] as WalkEntry[]);

/**
 * **The bass as a glide line, by place** (round DNB-7, `src/glide.ts`; Eugene,
 * 10-05, on DNB-6's riff: *"closer to psytrance with crazy syncopated riffs … You
 * play 16th notes, where source 8 never does … the notes are simple in that
 * track"*). Source 8's lines read as curves across seven of its two-step and liquid
 * cuts (`score-8.py --territory`): on their home 22-29 % of the time (78 % on the
 * pedal tune), gliding 26-60 %, a half bar spanning 1.4-4.1 semitones, the widest
 * bars 9.6-13.6, a glide 2.5-3.4 sixteenths long. The grammars are rows: the half-bar
 * glide and back at twice the share, the glide over the bar, the held line and its
 * swoop — drawn one a theme off the seed's own stream. Every other place keeps the
 * lane's own figure.
 */
const GLIDE_ROWS = Object.freeze([{ v: 'dnb/glide-and-back', w: 2 }, { v: 'dnb/glide-over-the-bar', w: 1.5 }, { v: 'dnb/glide-held-swoop', w: 1 }]);
export const GLIDE: readonly GlideEntry[] = Object.freeze([
  { id: 'glide-over-a-home-note', place: FAST_BROKEN, rows: GLIDE_ROWS },
  { id: 'glide-over-a-home-note-deep', place: FAST_BROKEN_DEEP, rows: GLIDE_ROWS },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `the-lane-s-own-line-${i + 1}`, place })),
] as GlideEntry[]);

/**
 * **The bass riff by place** (liquid-riffs-2, 10-08; `src/glide.ts`, `RiffEntry`):
 * where the bass glides, which riff rows its themes draw, by weight. The Liquid
 * key's own spell (the Drum & Bass tile) and the two fast broken places play V's
 * riff alone, so V stays at the centre on every seed. Moved off the tile toward a
 * bird, the place draws among V's and one riff read off source 8 for that bird's
 * corner: Tide (the calm) the held riff's long low holds, Spark and Loom (the busy,
 * the phrase) the stairs' climbing figure (his ear, 10-08: both ok; the swoop's dives
 * toward Zephyr were heard and left out, musically not pleasing). His ear set it;
 * the weights are the table's numbers. Every other place is left out: a theme
 * whose bass does not glide never reads this table, and one that does stands
 * nearer one of these than the house.
 */
const V_RIFF = 'dnb/riff-liquid-mined';
export const RIFF: readonly RiffEntry[] = Object.freeze([
  { id: 'the-liquid-riff', place: place(LIQUID_KEY, [160, 176]), rows: [{ v: V_RIFF, w: 1 }] },
  { id: 'the-liquid-riff-fast', place: FAST_BROKEN, rows: [{ v: V_RIFF, w: 1 }] },
  { id: 'the-liquid-riff-deep', place: FAST_BROKEN_DEEP, rows: [{ v: V_RIFF, w: 1 }] },
  { id: 'held-toward-tide', place: place({ ...LIQUID_KEY, tide: 0.80 }, [160, 176]), rows: [{ v: 'dnb/riff-liquid-held', w: 2 }, { v: V_RIFF, w: 1 }] },
  { id: 'stairs-toward-spark-and-loom', place: place({ ...LIQUID_KEY, spark: 1, loom: 1 }, [160, 176]), rows: [{ v: 'dnb/riff-liquid-stairs', w: 2 }, { v: V_RIFF, w: 1 }] },
  // the riff toward Root (PLAN-UNIFY U2, the fast places' birds: Root is the low end's weight): up, the held riff's long
  // low holds; down, the stairs' climbing figure, the lighter, busier line — each beside V's, as the two corners above
  { id: 'held-toward-root', place: place({ ...LIQUID_KEY, root: 1 }, [160, 176]), rows: [{ v: 'dnb/riff-liquid-held', w: 2 }, { v: V_RIFF, w: 1 }] },
  { id: 'stairs-away-from-root', place: place({ ...LIQUID_KEY, root: 0.35 }, [160, 176]), rows: [{ v: 'dnb/riff-liquid-stairs', w: 2 }, { v: V_RIFF, w: 1 }] },
] as RiffEntry[]);
{
  const bad = riffTableFaults(RIFF);
  if (bad.length) throw new Error(`the riff table: ${bad.join('; ')}`);
}

/** The tables as the style carries them (`style.places`). */
/**
 * **Who carries the low end, by place** (round DUB-1, `notes/rounds/dub-1.md`;
 * Eugene, 10-04, on seed 6 at the Dubstep spell: *"drums are not the boomiest
 * part; drums create the rhythm, and the bassline drops the massive bass that
 * defines the style. In this track the boom comes from the straight kick, it
 * carries that sub, and the wobbling bass is fairly shallow"*). Under the
 * deep half-time place's own rows the room's kick (54 -> 46 Hz under a 130 Hz
 * lid, -34 dB only after 270 ms) was the sub, four times a bar, the plain sub
 * line under it at -17 ducked under every hit, and the wobble a driven copy at
 * the eighth harmonic with no sub in it. Here the roles turn round:
 *
 * - the kick a knock (`kickKnock`): onto 60 Hz, open to 220, -34 dB by
 *   120 ms, a click at 3.2 kHz a phone hears — the rhythm over the line;
 * - the line the sub (`reeseWobble`): the deep reese's sine under its saws,
 *   the sweep on its own filter two beats a cycle, shut on the bar line;
 * - the copy in parallel kept, a little under the room's (0.45 where the
 *   classic plays 0.6; round DUB-3, heard on DUB-2: *"the track lost its
 *   charm: the mid-frequency bass wobble was giving that smooth, ambient,
 *   hypnotic ride"*) — the two-beat wave and the grain over the held sine,
 *   riding on the line and not carrying it (DUB-1 and DUB-2 had it off);
 *   its floor 110 Hz, so it adds nothing to the sub;
 * - the ride (round DUB-4, heard on DUB-3: *"now it seems to just wave in a
 *   linear manner; the original track's bass had a more interesting
 *   wobble"*): the figure as the place drew it — every eighth, every accent —
 *   played again beside the held line into the copy's side door alone, each
 *   note ended 30 ms before the next strikes so the copy hears the eighths;
 *   the copy is fed by the ride and nothing else, so the held sub is never
 *   driven and the ride is never heard clean. Two rhythms on the lane: the
 *   sub held, the figure struck under the two-beat wave;
 * - the bass's duck -5 dB where the base's -8 dipped it under every kick, its
 *   shape the room's — the line continuous, the kick through on its transient;
 * - the line held (round DUB-2; Eugene, 10-04: *"the bass still doesn't sound
 *   like a bass; at best it is a low-mid wave with distortion"* — notes of a
 *   sixth of a second on every eighth gave a 58 Hz tone ten cycles): a new
 *   pitch strikes on the beat, the same pitch again on the half bar where the
 *   sweep's cycle starts, and anything between is the held note's, so a note
 *   runs a beat or two and the wobble is the rhythm inside it. The figure the
 *   place drew is the figure held, and `roles=classic` plays it as drawn —
 *   which is why the hold is a reading on this row and not a figure row in the
 *   draw: a row the place drew differently could not be put back to the bit.
 *
 * The other tables keep their rows at the place (the room's drums, the lane's
 * own bass, the driven copy): they are what `roles=classic` plays, and the
 * levels, the sub's step (`subTrimDb`: a bass in front of the bottom either
 * way, -4) and the line's notes are the same under both. Every other place is
 * listed with a row that changes nothing, as `BASS_SOUND` lists its own: a
 * table is read by its nearest row, so a place left out would take the deep
 * half's.
 */
export const ROLES: readonly RolesEntry[] = Object.freeze([
  { id: 'the-line-carries-the-sub', place: DEEP_HALF, kick: 'knock-kick', bass: 'wobble-reese', wobbleBeats: 2, lowDepthDb: -5, parallelBlend: 0.45, parallelFloorHz: 110, ride: { releaseS: 0.03 },
    hold: { strikeBeats: 1, againBeats: 2, bridgeBeats: 0.5 } },
  ...[FAST_BROKEN, FAST_BROKEN_DEEP, BROKEN_DRIVING, DEEP_STILL, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `roles-as-drawn-${i + 1}`, place })),
] as RolesEntry[]);

/**
 * **The support by place** (round DNB-3, `SupportEntry` in places.ts; Eugene,
 * 10-05: *"current tracks sound overloaded and honestly unlistenable … at
 * first we should aim for liquid DnB … give emphasis to, obviously, the drums
 * and bass, and have the other peripherals create light ambient support for
 * the low end"*). Measured on the DnB tile before it (seeds 1, 7 and 5555,
 * theme one): six or seven lanes at once in every drop and main, the keys
 * lane on the house's stab mask a thousand notes a theme (a clav, a pulse
 * lead, a reed organ, a piano), a saw or supersaw pad under it, the mid band
 * (800 Hz-3 kHz) 4-9 dB over source 8's liquid cuts. So at the two fast
 * broken places:
 *
 * - **withhold** the house's struck figures — the fast figure (and with it
 *   its ornament, its groove and its pedal), the ringing piano, the bright
 *   stab over a two-tone line: no house piano stabs, no busy keys figures;
 * - **one bed**: the held layer, or a row's chords where a row asks for them
 *   (the liquid roller's Rhodes sevenths), never both and never the stab mask;
 * - **the bed** drawn by a rule, not a list: any sustained timbre that is not
 *   struck, holds half of itself at the bar line and has its corner at
 *   2.6 kHz or under, each as likely as the next;
 * - **no sixteenths**: the sixteenth lane held off (the shaker and the hands),
 *   the hats alone on the top;
 * - **wet and wide**: the bed at least half into the room and spread wide.
 *
 * Its level is the bed table's ceiling (`LIQUID_BED_ROW`). Every other place
 * is listed with a row that changes nothing, as `BASS_SOUND` lists its own: a
 * table is read by its nearest row, so a place left out would take the fast
 * broken place's.
 */
const LIQUID_SUPPORT = Object.freeze({
  withhold: Object.freeze(['figure', 'ringing-keys', 'stab-and-two-tone']),
  oneBed: true,
  bedRule: Object.freeze({ holdLeast: 0.5, brightMost: 2600 }),
  // liquid-space (10-11): the sixteenth lane's own figure stays held off (the old sixteenths never come back), and the
  // one quiet auxiliary part a phrase's plan enters and takes out again is admitted past it (`DEVELOPMENT`)
  holdOff: Object.freeze(['sixteenth']),
  admits: Object.freeze(['auxiliary']),
  wet: Object.freeze({ reverb: 0.5, spread: 0.9 }),
});
export const SUPPORT: readonly SupportEntry[] = Object.freeze([
  { id: 'light-support', place: FAST_BROKEN, ...LIQUID_SUPPORT },
  { id: 'light-support-deep', place: FAST_BROKEN_DEEP, ...LIQUID_SUPPORT },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `all-the-support-${i + 1}`, place })),
  // ambient-bells: no whistle — the conversation is the upper light (the lanes it replaces are its own entry's, `CONVERSATION`)
  { id: 'bells-alone', place: BELLS, withhold: ['pulse'] },
  // ambient-psy: no whistle — one pitch for the whole theme is the opposite of a modal line drifting
  { id: 'journey-without-the-whistle', place: PSY, withhold: ['pulse'] },
] as SupportEntry[]);

/**
 * **The sparse keys by place** (liquid-space round 1, `KeysEntry` in places.ts, `src/keys-phrase.ts`;
 * his word on the keys lab's round 3, 10-11: *"way closer to liquid dnb"*, and then: *"most of those
 * were actually fine, as well as effects etc … now we just need to have that variety be available to
 * composer then we listen then we trim some bad mixes"*). At the two fast broken places and round the
 * liquid key's own spell (the Drum & Bass tile, and Tide's corner of it) every theme draws its keys
 * from the tested variety (`recipes/keys/draw.json`, the `liquid-keys` row): a phrase, a tone, a
 * space, a motif grammar, a wetness and a whole track's density, each off a stream of its own and
 * leaned by the birds there. The part's level is over the rows' own (`levelDb`). Every other place is
 * listed without the part, as `BASS_SOUND` lists its own: a table is read by its nearest row, so a
 * place left out would take the fast one's.
 */
// the birds on the draw (PLAN-UNIFY U3): Zephyr's tone lean about the tile's own value (`FAST_LEANS`)
const LIQUID_KEYS = Object.freeze({ draw: 'liquid-keys', levelDb: -6, leans: FAST_LEANS });
export const KEYS: readonly KeysEntry[] = Object.freeze([
  { id: 'sparse-keys-fast', place: FAST_BROKEN, keys: LIQUID_KEYS },
  { id: 'sparse-keys-deep', place: FAST_BROKEN_DEEP, keys: LIQUID_KEYS },
  { id: 'sparse-keys-liquid', place: LIQUID_CENTRE, keys: LIQUID_KEYS },
  { id: 'sparse-keys-toward-tide', place: place({ ...LIQUID_KEY, tide: 0.80 }, [160, 176]), keys: LIQUID_KEYS },
  { id: 'sparse-keys-islands', place: LIQUID_ISLANDS, keys: LIQUID_KEYS },
  { id: 'sparse-keys-roller', place: LIQUID_ROLLER, keys: LIQUID_KEYS },
  { id: 'sparse-keys-broken', place: LIQUID_BROKEN, keys: LIQUID_KEYS },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `no-keys-${i + 1}`, place })),
] as KeysEntry[]);

/**
 * **The phrase development by place** (liquid-space, 10-11; `src/phrase-development.ts`): the fast places plan their
 * tracks phrase by phrase — one move a phrase from the development row, the kit's answers and states, the bass's
 * answers, one quiet auxiliary part, the dark air under the exposed passages. The islands' lean (Tide and Loom up,
 * Veil down: the exposed, atmospheric context) draws fewer drum answers and fewer effects and lays a quieter surface.
 * Every other place plans nothing, and says so.
 */
const LIQUID_DEVELOPMENT = Object.freeze({ row: 'dnb/phrase-development-liquid', aux: 'dnb/aux-liquid-quiet', bass: 'dnb/bass-answers-liquid',
  // liquid-ambient (10-11): the bed in bounded gestures and the chapters over the phrases (`src/ambient-plan.ts`)
  // the bed's chapters are written over the kit's phrases (the development's salient drums count in them)
  ambient: Object.freeze({ bed: 'ambient/bed-liquid', chapters: 'ambient/chapters-liquid', needs: Object.freeze(['kit'] as const) }),
  surface: Object.freeze([{ v: 'dnb/surface-dark-air', w: 3 }, { v: 'dnb/surface-hiss', w: 2 }, { v: 'dnb/surface-air-swell', w: 2 }]),
  // the birds at the fast places (PLAN-UNIFY U2): Veil on the effect moves and the chapters' deadline
  leans: FAST_LEANS });
export const DEVELOPMENT: readonly DevelopmentEntry[] = Object.freeze([
  { id: 'phrases-developed', place: FAST_BROKEN, ...LIQUID_DEVELOPMENT },
  { id: 'phrases-developed-deep', place: FAST_BROKEN_DEEP, ...LIQUID_DEVELOPMENT },
  { id: 'phrases-developed-liquid', place: LIQUID_CENTRE, ...LIQUID_DEVELOPMENT },
  { id: 'phrases-sparing-toward-tide-and-loom', place: LIQUID_ISLANDS, ...LIQUID_DEVELOPMENT,
    lean: Object.freeze({ continue: 1.3, subtract: 0.75, answer: 0.5, effect: 0.5 }), surfaceDb: -3,
    surface: Object.freeze([{ v: 'dnb/surface-dark-air', w: 3 }, { v: 'dnb/surface-air-swell', w: 3 }, { v: 'dnb/surface-hiss', w: 1 }]) },
  { id: 'phrases-developed-roller', place: LIQUID_ROLLER, ...LIQUID_DEVELOPMENT },
  { id: 'phrases-developed-broken', place: LIQUID_BROKEN, ...LIQUID_DEVELOPMENT },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `phrases-as-drawn-${i + 1}`, place, row: null })),
] as DevelopmentEntry[]);

/**
 * **The ambient voices by place** (liquid-ambient, 10-11; `src/ambient-voices.ts`, the research manual's sections 4-6):
 * at the fast places the composer lays one remembered motif and the conversation's one vocabulary (the breathy
 * soloist, the keys' own fragments or the filtered bell, with keys echoes, delay tails, reverse-like arrivals and
 * silences), and one weather identity a track (clear, wind, rain or a dark cloud), each admitted under the phone's
 * budget (`recipes/ambient/admission.json`). Every other place lays none, and says so.
 */
const LIQUID_AMBIENT = Object.freeze({ soloist: 'liquid-breath', fillers: 'liquid-conversation', weather: 'liquid-weather', admission: 'liquid-admission',
  // the first main passage written as one arrangement (`recipes/ambient/passage.json`)
  passage: 'first-passage',
  // the whole track arranged by the producer's grammar around it (`recipes/ambient/producer.json`)
  producer: 'liquid-producer',
  // all three are written over the liquid kit's phrases: the voices' windows keep its answers clear, the passage and the
  // producer rewrite its states and endings in its own voices (PLAN-UNIFY §0b: a need of the row, not a chain)
  needs: Object.freeze(['kit'] as const) });
export const AMBIENT_VOICES: readonly AmbientVoicesEntry[] = Object.freeze([
  { id: 'details-and-weather-fast', place: FAST_BROKEN, ambient: LIQUID_AMBIENT },
  { id: 'details-and-weather-deep', place: FAST_BROKEN_DEEP, ambient: LIQUID_AMBIENT },
  { id: 'details-and-weather-liquid', place: LIQUID_CENTRE, ambient: LIQUID_AMBIENT },
  { id: 'details-and-weather-islands', place: LIQUID_ISLANDS, ambient: LIQUID_AMBIENT },
  { id: 'details-and-weather-roller', place: LIQUID_ROLLER, ambient: LIQUID_AMBIENT },
  { id: 'details-and-weather-broken', place: LIQUID_BROKEN, ambient: LIQUID_AMBIENT },
  ...[BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `no-details-or-weather-${i + 1}`, place })),
  // ambient-waves (PLAN-AMBIENT Phase 4): the sea, a weather alone (`src/surf.ts`, `recipes/ambient/surf.json`): the
  // pad's chord blooming on its crests, a bell on its breaks and the bass on its undertows, in place of the held pad,
  // the sub and the keys' figure, and the chords moving with its sets; BELLS lays none, and says so (it stands nearer
  // WAVES than FLOATING does)
  { id: 'the-sea-at-waves', place: WAVES, weather: Object.freeze({ row: 'waves-surf', needs: Object.freeze(['no-kit'] as const), holdOff: Object.freeze(['sustained', 'bassline', 'figure']),
    level: Object.freeze({ targetLufs: WAVES_TARGET_LUFS, measuredLufs: WAVES_MEASURED_LUFS }) }) },
  { id: 'no-details-or-weather-at-bells', place: BELLS },
] as AmbientVoicesEntry[]);

/**
 * **Time by place** (PLAN-UNIFY §2.2, `src/musical-time.ts`): where the kit plays half-time, the pulse is felt at
 * half the written tempo (the fast places' two-step, the deep half's stillness); and the fast places pin the phrase
 * the producer's grammar was written in, eight written bars, leaned by Loom from the liquid key's own Loom at a
 * strength of nought (the U0 round: every bird position there resolves to today's eight bars; the lean is a later
 * round's, by his ear). The places are the ambient voices' own, so the time that plays is the one the producer's
 * place names. Every other place is the ring's own rule, and says so.
 */
const FAST_TIME = Object.freeze({ felt: 'half' as const, phrase: Object.freeze({ bars: 8, loom: Object.freeze({ centre: LIQUID_KEY.loom, strength: 0 }) }) });
export const TIME: readonly TimeEntry[] = Object.freeze([
  { id: 'half-time-eight-bar-phrases-fast', place: FAST_BROKEN, ...FAST_TIME },
  { id: 'half-time-eight-bar-phrases-deep', place: FAST_BROKEN_DEEP, ...FAST_TIME },
  { id: 'half-time-eight-bar-phrases-liquid', place: LIQUID_CENTRE, ...FAST_TIME },
  { id: 'half-time-eight-bar-phrases-islands', place: LIQUID_ISLANDS, ...FAST_TIME },
  { id: 'half-time-eight-bar-phrases-roller', place: LIQUID_ROLLER, ...FAST_TIME },
  { id: 'half-time-eight-bar-phrases-broken', place: LIQUID_BROKEN, ...FAST_TIME },
  { id: 'half-time-felt-deep-half', place: DEEP_HALF, felt: 'half' },
  ...[BROKEN_DRIVING, DEEP_STILL, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE]
    .map((place, i) => ({ id: `the-ring-s-own-time-${i + 1}`, place })),
] as TimeEntry[]);

/**
 * **Struck voices in conversation by place** (PLAN-AMBIENT Phase 1, ambient-bells, 10-17; `ConversationEntry` in
 * places.ts, `src/slow-conversation.ts`; his words: *"something acoustical like bells slow conversation with hint of
 * percussion"*): at BELLS the composer's own themes are a ground of a struck singing bowl, a caller (a temple bell,
 * the FM bell or the vibes) and an answerer (the marimba or the soft mallets) and a hand now and then
 * (`recipes/ambient/conversation.json`), and the lanes they replace are held off — the held pad, the sub and the keys'
 * figure: acoustic, so no sub and no synth pad (the whistle is the support's `bells-alone`). Every other place lays
 * none, and says so: a table is read by its nearest row, so a place left out would take BELLS's.
 */
export const CONVERSATION: readonly ConversationEntry[] = Object.freeze([
  { id: 'bells-in-conversation', place: BELLS,
    conversation: Object.freeze({ row: 'bells-in-conversation', holdOff: Object.freeze(['sustained', 'bassline', 'figure']),
      level: Object.freeze({ targetLufs: BELLS_TARGET_LUFS, measuredLufs: BELLS_MEASURED_LUFS }) }) },
  ...[FAST_BROKEN, FAST_BROKEN_DEEP, BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE,
    LIQUID_CENTRE, LIQUID_ISLANDS, LIQUID_ROLLER, LIQUID_BROKEN]
    .map((place, i) => ({ id: `no-conversation-${i + 1}`, place })),
  { id: 'no-conversation-on-the-journey', place: PSY },
] as ConversationEntry[]);

/**
 * **One long journey by place** (PLAN-AMBIENT Phase 6, ambient-psy; `JourneyEntry` in places.ts, `src/journey.ts`): at
 * PSY the composer's themes travel one filter line over minutes, the held voices on tape, the stage's swirl slowed,
 * the keys and the bed thrown into two long ping-pong echoes and, where Spark allows, a soft broken pulse far back
 * (`recipes/ambient/journey.json`). Every other place lays none, and says so: a table is read by its nearest row, so a
 * place left out would take PSY's.
 */
// The journey's own form and treatments ride on its entry and not in `FORM` and `TREATMENTS`: those two tables list
// fewer places than this one (no BELLS, no SLOW_WET in the form's), so PSY would be nearest there over 22.8 % and
// 26.6 % of the drumless ring where it is nearest here over 21.2 %: a form or a palette of the place's heard in 311 and
// 1084 of 20000 drumless spells its journey never reaches, BELLS's neighbourhood the most of them (measured,
// ambient-psy). On the entry they play exactly where the journey does. The zones round may move them back into the
// tables in one step once a place's tables are read by one address.
const JOURNEY_ARC = Object.freeze({
  // the journey's arc, out of the dark (a short intro), two long grooves rising into the light, a breakdown for the
  // descent and an outro of some sixteen bars held at the line's start, where the set hands over (a 4-8 bar outro left
  // seams on its last lines with blends of 2-6 bars): no build, no drop (the line is the build, and it is minutes long)
  orders: [['intro', 'groove', 'groove', 'breakdown', 'outro']],
  sectionBars: Object.freeze({ intro: { p25: 6, p75: 10, median: 8 }, groove: { p25: 20, p75: 28, median: 24 }, breakdown: { p25: 20, p75: 28, median: 24 }, outro: { p25: 14, p75: 18, median: 16 } }),
});
// the bed phased, breathing and swirling, at the journey's slow rates (the row's `swirl`), as `TREATMENTS`' multipliers.
// Weighed on the rota's live entries: the plan's `fx:phaser`, `fx:tapeDelay` and `fx:shimmer` stand at nought on the
// rota (the cast ceiling's rule 4 took them), so a multiplier on them is nothing, and the stage's own phaser gesture is
// the phaser here; the echoes are the journey's own return. `fx:lfoParam` at nought: drawn onto a note it is a
// modulation source that is never built (TODO R33), a segment of the bed with no treatment at all; the hole, the
// crusher and the tremolo's pulse are not this place's; the drive a little more, for the colour at the peak.
const JOURNEY_TREATMENTS = Object.freeze({ phaser: 4, breath: 3, 'fx:autoPan': 4, throw: 2, 'fx:width': 2, 'fx:formant': 1.5, 'fx:overdrive': 1.5,
  hpRise: 0.5, hole: 0, 'fx:lfoParam': 0, 'fx:crush': 0, 'fx:tremolo': 0, 'fx:ringMod': 0, 'fx:fuzz': 0, 'fx:distortion': 0 });
// the journey's level (ambient-psy, measured on the round's site, offline and silent): the target only, so the style's
// own model reads each theme's window, since the place's themes stand 5 dB apart at the journey's peak at a trim of
// nought (seeds 2 and 5 -10.3 LUFS, 3 -13.0, 7 -15.1: the growl room's held strings the loudest; `local` at the spell
// and seconds -10.0) and one measure for them all trims the quiet ones to -20; the model ranks them as the renders do.
// The target is under the drumless family's -13, the neighbours' middle: every decibel over it is a decibel of limiter
// on the bed's peaks. Never lifted: where the model misreads a theme as quiet (seed 3 at +2 dB, its peak at -13.0 at
// nought, 4.9 dB into the limiter there) a lift is a decibel more of limiter, and the quietest peak measured is -15.1.
const JOURNEY_LEVEL = Object.freeze({ targetLufs: -15, trimMostDb: 0 });
export const JOURNEY: readonly JourneyEntry[] = Object.freeze([
  { id: 'long-filter-journey', place: PSY, journey: Object.freeze({ row: 'long-filter-journey', form: JOURNEY_ARC, treatments: JOURNEY_TREATMENTS, level: JOURNEY_LEVEL }) },
  ...[FAST_BROKEN, FAST_BROKEN_DEEP, BROKEN_DRIVING, DEEP_STILL, DEEP_HALF, SLOW_WET, DRIVING_FOUR, BRIGHT_FOUR, HIGH_FOUR, FLOATING, HELD_DRONE, BELLS,
    LIQUID_CENTRE, LIQUID_ISLANDS, LIQUID_ROLLER, LIQUID_BROKEN]
    .map((place, i) => ({ id: `no-journey-${i + 1}`, place })),
  // ambient-waves (the review of 10-19): WAVES lays the sea and no journey, and says so; without it the journey's table
  // read PSY nearest from Veil 0.79 up at WAVES, and the one foreground gave the sea's rough end to the journey
  { id: 'no-journey-at-waves', place: WAVES },
] as JourneyEntry[]);

/**
 * **Zephyr's centre by place** (zephyr-air; his word 10-18, *"Zephyr is air"*): the places the timbre draws were tuned
 * at, each its own Zephyr the centre the voices' measured air leans the lead, pad and stab lists about
 * (`src/air-lean.ts`, `spell.ts` `drawTimbre`). A spell's centre is the nearest place's Zephyr, blended with any other
 * place standing within a tenth of a bird as near (`airBlend`), so a bird other than Zephyr slides the centre and never
 * steps it; the distance is every place table's (the birds, and the tempo outside the place's range at Ember's curve)
 * with Zephyr left out, so Zephyr's own travel stays at one centre, and at that place's own Zephyr every list draws what
 * it drew.
 * The tiles' own birds, BELLS, 27191's drone and the drumless deep still (seed 6's golden, PLAN-AMBIENT §2.4) are
 * listed, and the house's own place competes as in every table, so each plays at its own birds as it did;
 * `tools/check-air.ts` holds every tuned place to a centre at its Zephyr.
 */
export const AIR: readonly PlaceEntry[] = Object.freeze([
  { id: 'liquid-centre', place: LIQUID_CENTRE },
  { id: 'deep-half', place: DEEP_HALF },
  { id: 'deep-still-drumless', place: place({ ember: 0, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 }, [40, 70]) },
  { id: 'high-four-open', place: place({ ember: 0.88, root: 0.60, zephyr: 0.60, veil: 0.60, tide: 0.70 }, [134, 146]) },
  { id: 'driving-four', place: DRIVING_FOUR },
  { id: 'broken-driving', place: BROKEN_DRIVING },
  { id: 'slow-wet', place: SLOW_WET },
  { id: 'slow-broken-dark', place: place({ ember: 0.27, spark: 0.60, tide: 0.55, zephyr: 0.30, root: 0.80, veil: 0.25, gleam: 0.20 }, [75, 95]) },
  { id: 'floating', place: FLOATING },
  { id: 'bells', place: BELLS },
  { id: 'held-drone', place: HELD_DRONE },
  { id: 'psy', place: PSY },
  { id: 'waves', place: WAVES },
].map((e) => Object.freeze(e)));

/**
 * **The zones** (PLAN-ZONES §3; the pilot, §5, 10-18): a few birds take a theme into one, every lane then plays the
 * zone's, and the rest steer inside it without pulling it out. The time birds address (Ember the family, Spark the
 * kind of movement, Veil the rate of change); the sound birds steer (Root weight, Gleam light, Zephyr timbre, Tide
 * space, Loom form), and Zephyr is never an address (his word, 10-18).
 *
 * **Struck voices in conversation** (BELLS): drumless (Ember to the kit's threshold), moving (Spark from the kit's own
 * edge, where a four turns broken: one Spark edge on the whole ring) and not restless (Veil to 0.60; over it is the
 * restless side's). Its eight entries are its own rows (the journey's among them: none at BELLS); the other eighteen lanes are borrowed by value as they read at
 * the tile before the zone (`zones-borrowed.json`, written by `tools/zones.ts --freeze`: seventeen of the floating
 * pulse's rows and the house's riff), so the tile's own themes play as they did. Its controls are the conversation
 * row's leans (`recipes/ambient/conversation.json`, bells-birds): every bird wired, none inert, Spark and Veil and
 * Ember steering inside their bands. No library row is drawn inside it: every theme there is the conversation.
 */
export const ZONES: readonly Zone[] = Object.freeze([
  Object.freeze({
    id: 'struck-in-conversation',
    address: Object.freeze({ ember: Object.freeze({ to: DRUMS_ON_ABOVE }), spark: Object.freeze({ from: BREAKS_ABOVE }), veil: Object.freeze({ to: 0.60 }) }),
    centre: Object.freeze({ ...HOUSE, ...BELLS.birds }) as Spell,
    rows: Object.freeze({ harmony: 'slow-drift-under-bells', form: 'bells-chapters', eq: 'bells-keep-their-floor', bed: 'bells-keep-their-floor',
      grain: 'bells-take-no-grain', support: 'bells-alone', conversation: 'bells-in-conversation', journey: 'no-journey-12',
      ambientVoices: 'no-details-or-weather-at-bells' }),
    borrow: BORROWED.zones['struck-in-conversation'] as unknown as Partial<Record<PlaceLane, PlaceEntry | null>>,
    // in the lanes' words: the calls and the answers the figure, the bowl the held ground and the low end (the three the
    // conversation holds off), its floor the texture; the kit's four left free (Z7 reads it)
    roles: Object.freeze(['figure', 'sustained', 'bassline', 'texture']),
    library: Object.freeze([]),
  }),
]);

export const places: StylePlaces = Object.freeze({ harmony: HARMONY, form: FORM, treatments: TREATMENTS, bassSound: BASS_SOUND, laneSound: LANE_SOUND, sounds: SOUNDS, eq: EQ, bassDrive: BASS_DRIVE, bassDriveHouse: BASS_DRIVE_HOUSE, bed: BED, bedHouse: BED_HOUSE, grain: GRAIN, grainHouse: GRAIN_HOUSE, drumGrain: DRUM_GRAIN, drumGrainHouse: DRUM_GRAIN_HOUSE,
  drums: DRUMS, breaks: BREAKS, subSections: SUBSECTIONS, subSectionsHouse: THE_HOUSE_SUBSECTIONS, sections: SECTIONS, glueSound: GLUE_SOUND, walk: WALK, roles: ROLES, glide: GLIDE,
  riff: RIFF, support: SUPPORT, keys: KEYS, development: DEVELOPMENT, ambientVoices: AMBIENT_VOICES, time: TIME, conversation: CONVERSATION,
  journey: JOURNEY, air: AIR, zones: ZONES });
