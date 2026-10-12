// The library this build ships: every recipe row that travels with the page.
//
// Each row is a committed JSON file. Provenance distinguishes measurements
// from listener-authored material; approval never implies measured weights.
// Track rows define whole-set spells; motifs and layers reserve local parts.
// A style explicitly admits shipped parts to ordinary generation. Library
// membership alone never makes a layer eligible for a whole-theme draw.

import type { Recipe } from './recipe.ts';
import handsConversation from '../recipes/hand-conversation.json' with { type: 'json' };
import handsRolling from '../recipes/hand-rolling.json' with { type: 'json' };
import handsAnswers from '../recipes/hand-answers.json' with { type: 'json' };
import house from '../recipes/house.json' with { type: 'json' };
import subRoom from '../recipes/sub-room.json' with { type: 'json' };
import growlRoom from '../recipes/growl-room.json' with { type: 'json' };
import motifPump from '../recipes/motif-pump.json' with { type: 'json' };
import motifLick from '../recipes/motif-lick.json' with { type: 'json' };
import motifAnswer from '../recipes/motif-answer.json' with { type: 'json' };
import dnbTwoStep from '../recipes/genres/dnb/two-step.json' with { type: 'json' };
import dnbAmen from '../recipes/genres/dnb/amen.json' with { type: 'json' };
import dnbJungleChop from '../recipes/genres/dnb/jungle-chop.json' with { type: 'json' };
import dnbLiquidRoller from '../recipes/genres/dnb/liquid-roller.json' with { type: 'json' };
import dnbHalftime from '../recipes/genres/dnb/halftime.json' with { type: 'json' };
import dnbBreakbeat from '../recipes/genres/dnb/breakbeat.json' with { type: 'json' };
import dubDubTechnoChord from '../recipes/genres/dub/dub-techno-chord.json' with { type: 'json' };
import dubOneDrop from '../recipes/genres/dub/one-drop.json' with { type: 'json' };
import dubDubstepHalftime from '../recipes/genres/dub/dubstep-halftime.json' with { type: 'json' };
import dubDeepDubstep from '../recipes/genres/dub/deep-dubstep.json' with { type: 'json' };
import dubSteppers from '../recipes/genres/dub/steppers.json' with { type: 'json' };
import tranceOffbeatBass from '../recipes/genres/trance/offbeat-bass.json' with { type: 'json' };
import tranceRollingBass from '../recipes/genres/trance/rolling-bass.json' with { type: 'json' };
import tranceSupersawAnthem from '../recipes/genres/trance/supersaw-anthem.json' with { type: 'json' };
import tranceGatedChords from '../recipes/genres/trance/gated-chords.json' with { type: 'json' };
import tranceBuildRoll from '../recipes/genres/trance/build-roll.json' with { type: 'json' };
import garage2Step from '../recipes/genres/garage/2-step.json' with { type: 'json' };
import garageSpeedGarage from '../recipes/genres/garage/speed-garage.json' with { type: 'json' };
import garageBassline from '../recipes/genres/garage/bassline.json' with { type: 'json' };
import garageUkFunky from '../recipes/genres/garage/uk-funky.json' with { type: 'json' };
import technoDrivingFour from '../recipes/genres/techno/driving-four.json' with { type: 'json' };
import technoMinimal from '../recipes/genres/techno/minimal.json' with { type: 'json' };
import technoDetroitChords from '../recipes/genres/techno/detroit-chords.json' with { type: 'json' };
import technoAcidLine from '../recipes/genres/techno/acid-line.json' with { type: 'json' };
import downtempoTripHop from '../recipes/genres/downtempo/trip-hop.json' with { type: 'json' };
import downtempoLoFi from '../recipes/genres/downtempo/lo-fi.json' with { type: 'json' };
import downtempoTripHopDust from '../recipes/genres/downtempo/trip-hop-dust.json' with { type: 'json' };
import downtempoTripHopHalfstep from '../recipes/genres/downtempo/trip-hop-halfstep.json' with { type: 'json' };
import downtempoChilloutGroove from '../recipes/genres/downtempo/chillout-groove.json' with { type: 'json' };
import ambientSlowChords from '../recipes/genres/ambient/slow-chords.json' with { type: 'json' };
import ambientPedalSwell from '../recipes/genres/ambient/pedal-swell.json' with { type: 'json' };
import houseMinimalHouse from '../recipes/genres/house/minimal-house.json' with { type: 'json' };
import houseAfroHouse from '../recipes/genres/house/afro-house.json' with { type: 'json' };
import houseDiscoHouse from '../recipes/genres/house/disco-house.json' with { type: 'json' };
import houseAcidHouse from '../recipes/genres/house/acid-house.json' with { type: 'json' };
import houseProgressiveHouse from '../recipes/genres/house/progressive-house.json' with { type: 'json' };
import bigbeatBreaksFour from '../recipes/genres/bigbeat/breaks-four.json' with { type: 'json' };
import bigbeatRiffBass from '../recipes/genres/bigbeat/riff-bass.json' with { type: 'json' };
import bigbeatStabSiren from '../recipes/genres/bigbeat/stab-siren.json' with { type: 'json' };
import bigbeatDropoutBuild from '../recipes/genres/bigbeat/dropout-build.json' with { type: 'json' };
import bigbeatHardcoreBreak from '../recipes/genres/bigbeat/hardcore-break.json' with { type: 'json' };
import tracksDarkSixteenths from '../recipes/tracks/dark-sixteenths.json' with { type: 'json' };
import tracksBrightEighths from '../recipes/tracks/bright-eighths.json' with { type: 'json' };
import dnbMinedTwoStepGhosts from '../recipes/genres/dnb/two-step-ghosts.json' with { type: 'json' };
import dnbMinedRollingSnare from '../recipes/genres/dnb/rolling-snare.json' with { type: 'json' };
import dnbMinedDoubledSnare from '../recipes/genres/dnb/doubled-snare.json' with { type: 'json' };
import dnbMinedStepperRoll from '../recipes/genres/dnb/stepper-roll.json' with { type: 'json' };
import dnbMinedSwungSixteenths from '../recipes/genres/dnb/swung-sixteenths.json' with { type: 'json' };
import dnbMinedReeseRoller from '../recipes/genres/dnb/reese-roller.json' with { type: 'json' };
import dnbMinedBrightSixteenths from '../recipes/genres/dnb/bright-sixteenths.json' with { type: 'json' };
import dnbMinedFifthPopPedal from '../recipes/genres/dnb/fifth-pop-pedal.json' with { type: 'json' };
import dnbMinedSteppingRiff from '../recipes/genres/dnb/stepping-riff.json' with { type: 'json' };
import dnbMinedHalfTimeRoller from '../recipes/genres/dnb/half-time-roller.json' with { type: 'json' };
import dnbMinedBrokenHalfTime from '../recipes/genres/dnb/broken-half-time.json' with { type: 'json' };
import dnbMinedJungleRush from '../recipes/genres/dnb/jungle-rush.json' with { type: 'json' };
import dnbMinedDoubleKickTwoStep from '../recipes/genres/dnb/double-kick-two-step.json' with { type: 'json' };
import dnbMinedOffBeatKick from '../recipes/genres/dnb/off-beat-kick.json' with { type: 'json' };
import dnbMinedHatlessRiff from '../recipes/genres/dnb/hatless-riff.json' with { type: 'json' };
import dnbMinedSparseHalfStep from '../recipes/genres/dnb/sparse-half-step.json' with { type: 'json' };
import dnbMinedLiquidGhosts from '../recipes/genres/dnb/liquid-ghosts.json' with { type: 'json' };
import dnbMinedSemitoneLean from '../recipes/genres/dnb/semitone-lean.json' with { type: 'json' };
import dnbMinedOctaveFall from '../recipes/genres/dnb/octave-fall.json' with { type: 'json' };
import dnbMinedWalkDown from '../recipes/genres/dnb/walk-down.json' with { type: 'json' };
import dnbGlideAndBack from '../recipes/genres/dnb/glide-and-back.json' with { type: 'json' };
import dnbGlideOverTheBar from '../recipes/genres/dnb/glide-over-the-bar.json' with { type: 'json' };
import dnbGlideHeldSwoop from '../recipes/genres/dnb/glide-held-swoop.json' with { type: 'json' };
import smallSwitchRollingSnare from '../recipes/treatments/switch-rolling-snare.json' with { type: 'json' };
import smallSwitchDoubledSnare from '../recipes/treatments/switch-doubled-snare.json' with { type: 'json' };
import smallSwitchKickPush from '../recipes/treatments/switch-kick-push.json' with { type: 'json' };
import smallSwitchStepper from '../recipes/treatments/switch-stepper.json' with { type: 'json' };
import smallSwitchHalfTime from '../recipes/treatments/switch-half-time.json' with { type: 'json' };
import smallTurnDoubleKick from '../recipes/treatments/turn-double-kick.json' with { type: 'json' };
import smallTurnGhostPickup from '../recipes/treatments/turn-ghost-pickup.json' with { type: 'json' };
import smallTurnHatGap from '../recipes/treatments/turn-hat-gap.json' with { type: 'json' };
import smallFill from '../recipes/treatments/fill.json' with { type: 'json' };
import smallHalfBarFill from '../recipes/treatments/half-bar-fill.json' with { type: 'json' };
import smallDropOut from '../recipes/treatments/drop-out.json' with { type: 'json' };
import dnbFillSnareRoll from '../recipes/treatments/fill-snare-roll.json' with { type: 'json' };
import dnbFillHalfBar from '../recipes/treatments/fill-half-bar.json' with { type: 'json' };
import dnbTurnaroundDoubleKick from '../recipes/treatments/turnaround-double-kick.json' with { type: 'json' };
import dnbTurnaroundGhostPickup from '../recipes/treatments/turnaround-ghost-pickup.json' with { type: 'json' };
import dnbTurnaroundHatGap from '../recipes/treatments/turnaround-hat-gap.json' with { type: 'json' };
import dnbDropOutPickup from '../recipes/treatments/drop-out-pickup.json' with { type: 'json' };
// The mains pass (round M1, 10-02): the house's own small things inside its mains.
import mainsHatLift from '../recipes/treatments/house/hat-lift.json' with { type: 'json' };
import mainsStabIn from '../recipes/treatments/house/stab-in.json' with { type: 'json' };
import mainsStabsOut from '../recipes/treatments/house/stabs-out.json' with { type: 'json' };
import mainsPadSwap from '../recipes/treatments/house/pad-swap.json' with { type: 'json' };
import mainsHalfTimeKick from '../recipes/treatments/house/half-time-kick.json' with { type: 'json' };
import mainsLateClap from '../recipes/treatments/house/late-clap.json' with { type: 'json' };
import mainsBassOut from '../recipes/treatments/house/bass-out.json' with { type: 'json' };
import mainsBreath from '../recipes/treatments/house/breath.json' with { type: 'json' };
import mainsRideIn from '../recipes/treatments/house/ride-in.json' with { type: 'json' };
import mainsHatsQuarters from '../recipes/treatments/house/hats-quarters.json' with { type: 'json' };
import mainsHatsOpenAnd from '../recipes/treatments/house/hats-open-and.json' with { type: 'json' };
import mainsHatsSkip from '../recipes/treatments/house/hats-skip.json' with { type: 'json' };
import mainsHatsRest from '../recipes/treatments/house/hats-rest.json' with { type: 'json' };
import dnbRiserEveryTwo from '../recipes/treatments/riser-every-two.json' with { type: 'json' };
import dnbCrashOnTheOne from '../recipes/treatments/crash-on-the-one.json' with { type: 'json' };
import sectionIntro from '../recipes/sections/intro.json' with { type: 'json' };
import sectionBuild from '../recipes/sections/build.json' with { type: 'json' };
import sectionMain from '../recipes/sections/main.json' with { type: 'json' };
import sectionBreakdown from '../recipes/sections/breakdown.json' with { type: 'json' };
import sectionDrop from '../recipes/sections/drop.json' with { type: 'json' };
import sectionOutro from '../recipes/sections/outro.json' with { type: 'json' };
import dnbIntro from '../recipes/sections/dnb-intro.json' with { type: 'json' };
import dnbMixIntro from '../recipes/sections/dnb-mix-intro.json' with { type: 'json' };
import dnbFormClassic from '../recipes/tracks/dnb-form-classic.json' with { type: 'json' };
import dnbFormTwoDrop from '../recipes/tracks/dnb-form-two-drop.json' with { type: 'json' };
import dnbFormRolling from '../recipes/tracks/dnb-form-rolling.json' with { type: 'json' };
// liquid-space (10-11): the research manual's arrangement grammars, and the exposed passage they ask for
import dnbFormTwoReturn from '../recipes/tracks/dnb-form-two-return.json' with { type: 'json' };
import dnbFormRoller from '../recipes/tracks/dnb-form-roller.json' with { type: 'json' };
import dnbFormIslands from '../recipes/tracks/dnb-form-islands.json' with { type: 'json' };
import dnbFormHalfTimeDialogue from '../recipes/tracks/dnb-form-half-time-dialogue.json' with { type: 'json' };
import dnbFormBrokenAir from '../recipes/tracks/dnb-form-broken-air.json' with { type: 'json' };
import dnbExposed from '../recipes/sections/dnb-exposed.json' with { type: 'json' };
import dnbMain from '../recipes/sections/dnb-main.json' with { type: 'json' };
import dnbBreakdown from '../recipes/sections/dnb-breakdown.json' with { type: 'json' };
import dnbOutro from '../recipes/sections/dnb-outro.json' with { type: 'json' };
import dnbBreakdownIntoDrop from '../recipes/seams/breakdown-into-drop.json' with { type: 'json' };
import dnbDropIntoBreakdown from '../recipes/seams/drop-into-breakdown.json' with { type: 'json' };

/**
 * The rows, in the order a listing shows them: the house first, because it is
 * the whole record and the other two are inside it, and then the two rooms —
 * which are the two clusters `notes/analysis/imprint-calibration.md` found in
 * the golden without knowing a room existed.
 */
export const LIBRARY: Recipe[] = Object.freeze([
  house as unknown as Recipe,
  subRoom as unknown as Recipe,
  growlRoom as unknown as Recipe,
  // ...and the three melody families (PLAN-MOTIF T1). They are `motif` rows, so
  // `?recipe=auto` never draws one as a whole night's spell — the draw is
  // partitioned by scope (`drawable` in `src/mix.ts`) — and the composer draws
  // among them per theme, by register, where the strategy's own list names them.
  motifPump as unknown as Recipe,
  motifLick as unknown as Recipe,
  motifAnswer as unknown as Recipe,
  handsConversation as unknown as Recipe,
  handsRolling as unknown as Recipe,
  handsAnswers as unknown as Recipe,
]) as Recipe[];

/**
 * **The pattern rows** (recipes-g1, Eugene 09-26). Classic patterns — the
 * two-step, the Amen, the skank — written from public knowledge as `track`
 * rows under `recipes/genres/<folder>/` (the folder and the id are the rows'
 * own names, authored content; the composer reads neither).
 *
 * A row here is **pinnable and nothing else**: `recipeById` finds it, so a
 * link `?v=2&spell=<the family key's>&recipe=dnb/two-step` plays it, and no
 * draw ever sees it — `?recipe=auto` draws among `LIBRARY` alone, no style
 * admits a part from here, and every row carries `weight: 0` so it would not
 * be drawn even if it were handed to a draw. The house, its locks and its
 * links cannot hear this list. `notes/rounds/recipes-g1.md` is the audit table.
 *
 * (That was round G1's; since GA1 the library's turn draws a row here by its
 * weight where the birds and the tempo stand nearest its place, so a row
 * weighs its audited standing — 0.75 where it reaches, 0.5 where it leans —
 * and a row comes from public knowledge or, since R1, from a named cut of a
 * mined source on Eugene's word.)
 */
export const PATTERN_LIBRARY: Recipe[] = Object.freeze([
  dnbTwoStep as unknown as Recipe,
  dnbAmen as unknown as Recipe,
  dnbJungleChop as unknown as Recipe,
  dnbLiquidRoller as unknown as Recipe,
  dnbHalftime as unknown as Recipe,
  dnbBreakbeat as unknown as Recipe,
  dubDubTechnoChord as unknown as Recipe,
  dubOneDrop as unknown as Recipe,
  dubDubstepHalftime as unknown as Recipe,
  dubDeepDubstep as unknown as Recipe,
  dubSteppers as unknown as Recipe,
  tranceOffbeatBass as unknown as Recipe,
  tranceRollingBass as unknown as Recipe,
  tranceSupersawAnthem as unknown as Recipe,
  tranceGatedChords as unknown as Recipe,
  tranceBuildRoll as unknown as Recipe,
  garage2Step as unknown as Recipe,
  garageSpeedGarage as unknown as Recipe,
  garageBassline as unknown as Recipe,
  garageUkFunky as unknown as Recipe,
  technoDrivingFour as unknown as Recipe,
  technoMinimal as unknown as Recipe,
  technoDetroitChords as unknown as Recipe,
  technoAcidLine as unknown as Recipe,
  downtempoTripHop as unknown as Recipe,
  downtempoLoFi as unknown as Recipe,
  downtempoTripHopDust as unknown as Recipe,
  downtempoTripHopHalfstep as unknown as Recipe,
  downtempoChilloutGroove as unknown as Recipe,
  ambientSlowChords as unknown as Recipe,
  ambientPedalSwell as unknown as Recipe,
  houseMinimalHouse as unknown as Recipe,
  houseAfroHouse as unknown as Recipe,
  houseDiscoHouse as unknown as Recipe,
  houseAcidHouse as unknown as Recipe,
  houseProgressiveHouse as unknown as Recipe,
  bigbeatBreaksFour as unknown as Recipe,
  bigbeatRiffBass as unknown as Recipe,
  bigbeatStabSiren as unknown as Recipe,
  bigbeatDropoutBuild as unknown as Recipe,
  bigbeatHardcoreBreak as unknown as Recipe,
  // ...and the eleven of round DNB-1's mined rows Eugene admitted (R1, part 4):
  // five that reach the drum and bass rule at their audit link, at 0.75, and
  // six that lean, at 0.5. Mined from a named cut of source 8, never public
  // knowledge; placed at the Drum & Bass key (`row-places.json`).
  dnbMinedStepperRoll as unknown as Recipe,
  dnbMinedHalfTimeRoller as unknown as Recipe,
  dnbMinedReeseRoller as unknown as Recipe,
  dnbMinedOffBeatKick as unknown as Recipe,
  dnbMinedFifthPopPedal as unknown as Recipe,
  dnbMinedTwoStepGhosts as unknown as Recipe,
  dnbMinedRollingSnare as unknown as Recipe,
  dnbMinedDoubledSnare as unknown as Recipe,
  dnbMinedLiquidGhosts as unknown as Recipe,
  dnbMinedSwungSixteenths as unknown as Recipe,
  dnbMinedJungleRush as unknown as Recipe,
  // ...and two of the nine, on the brief of round DNB-3 (liquid first at the
  // fast broken places, his word of 10-05): the two-step thinned with its sub
  // held long at 0.5, the double-kick two-step at DNB-2's 0.25.
  dnbMinedSparseHalfStep as unknown as Recipe,
  dnbMinedDoubleKickTwoStep as unknown as Recipe,
]) as Recipe[];

/**
 * **Whole themes a turn may draw** (round GA2): track rows that are an
 * arrangement for one theme, not a cast for a whole set. The two mined whole-theme rows,
 * mined from the reference sets on 09-19 and ported to what house-v2 reads
 * (`notes/rounds/genres-ga2.md`): kept out of `LIBRARY`, so `?recipe=auto`
 * never casts a set in one and the link digest's recipe rows are where they
 * were; pinnable, and reached by GA1's die (`src/library-draw.ts`) on a turn
 * whose spell is inside their family's region.
 */
export const TRACK_LIBRARY: Recipe[] = Object.freeze([
  tracksDarkSixteenths as unknown as Recipe,
  tracksBrightEighths as unknown as Recipe,
]) as Recipe[];

/**
 * **Rows mined from a recording, waiting for his ear** (round DNB-1): drum
 * beats, beat variations, bass riffs and bass motifs read bar by bar off the
 * catalog's source 8, a drum and bass mix (`notes/rounds/dnb-1.md` §5; the cut
 * each comes from in its provenance). Pinnable — a link with the Drum & Bass
 * tile's spell and `recipe=dnb/<row>` plays one — and drawn by nothing: every
 * row weighs 0 (`library-draw.ts` keeps a weight-0 row out of every pool) and
 * none is in `PATTERN_LIBRARY`, whose rows are weighed by their audited
 * standing. On his word a row moves there at the weight its standing gives
 * (0.75 where it reaches, 0.5 where it leans): eleven did on 10-02 (R1, part
 * 4), two more on round DNB-3's brief (10-05); these seven wait (round DNB-6 played
 * the three bass motifs as riffs; round DNB-7 retired the riff for `GLIDE_LIBRARY`).
 */
export const CANDIDATE_LIBRARY: Recipe[] = Object.freeze([
  dnbMinedBrightSixteenths as unknown as Recipe,
  dnbMinedSteppingRiff as unknown as Recipe,
  dnbMinedBrokenHalfTime as unknown as Recipe,
  dnbMinedHatlessRiff as unknown as Recipe,
  dnbMinedSemitoneLean as unknown as Recipe,
  dnbMinedOctaveFall as unknown as Recipe,
  dnbMinedWalkDown as unknown as Recipe,
]) as Recipe[];

/**
 * **The glide lines a place plays its bass by** (round DNB-7, `src/glide.ts`):
 * bass motif rows carrying a glide line (`wants.motif.glide`), read off the
 * territory's lines as statistics, never a record's curve; a drawn row decides that
 * the bass glides, and its `pedal` where the home sits (the grammar beyond it went on
 * riff-trim, 10-10). At nought and not admitted: a place table
 * (`deep-house-places.ts` `GLIDE`) names them by id and weight, and nothing else
 * draws or pins them.
 */
export const GLIDE_LIBRARY: Recipe[] = Object.freeze([
  dnbGlideAndBack as unknown as Recipe,
  dnbGlideOverTheBar as unknown as Recipe,
  dnbGlideHeldSwoop as unknown as Recipe,
]) as Recipe[];

/**
 * **The small things as rows** (round T1, `notes/plans/PLAN-TREATMENTS.md`):
 * the figures `src/subsections.ts` plays inside a section — the switch-ups,
 * the turnarounds, the fills, the drop-out — each a `treatment` row under
 * `recipes/treatments/`, drawn by its weight among the rows of its kind
 * wherever the place table (`deep-house-places.ts` `SUBSECTIONS`) draws the
 * kind. **The order is the draw's**: the rows of a kind are weighed in the
 * order they stand here, which is the order the code listed its figures in
 * (round DNB-1), so the migration moved no lock. A row pinned by link
 * (`?recipe=small/fill&spell=…`) plays on every bar its kind admits.
 */
export const TREATMENT_LIBRARY: Recipe[] = Object.freeze([
  smallSwitchRollingSnare as unknown as Recipe,
  smallSwitchDoubledSnare as unknown as Recipe,
  smallSwitchKickPush as unknown as Recipe,
  smallSwitchStepper as unknown as Recipe,
  smallSwitchHalfTime as unknown as Recipe,
  smallTurnDoubleKick as unknown as Recipe,
  smallTurnGhostPickup as unknown as Recipe,
  smallTurnHatGap as unknown as Recipe,
  smallFill as unknown as Recipe,
  smallHalfBarFill as unknown as Recipe,
  smallDropOut as unknown as Recipe,
  // ...and the six of DNB-1's small-thing candidates admitted on 2026-10-02 on
  // the review of the links, at 0.5 each beside the code's figure of their
  // kind: the mined bar as the source had it, a row of its own. Listed after
  // the code's rows, so the draw's order among the eleven is as it was.
  dnbFillSnareRoll as unknown as Recipe,
  dnbFillHalfBar as unknown as Recipe,
  dnbTurnaroundDoubleKick as unknown as Recipe,
  dnbTurnaroundGhostPickup as unknown as Recipe,
  dnbTurnaroundHatGap as unknown as Recipe,
  dnbDropOutPickup as unknown as Recipe,
  // ...and the mains pass's nine (round M1, 10-02; `recipes/treatments/house/`):
  // the house's own figures inside a main — five switch-ups written for the
  // four-floor kit (`place.kit`), a turnaround, and three on the line — each
  // boxed to the house and its near places by tempo and Ember, so the fast
  // broken place and the drones draw exactly as they did. Listed last, so the
  // draw's order among the rows before them is as it was.
  mainsHatLift as unknown as Recipe,
  mainsStabIn as unknown as Recipe,
  mainsStabsOut as unknown as Recipe,
  mainsPadSwap as unknown as Recipe,
  mainsHalfTimeKick as unknown as Recipe,
  mainsLateClap as unknown as Recipe,
  mainsBassOut as unknown as Recipe,
  mainsBreath as unknown as Recipe,
  mainsRideIn as unknown as Recipe,
  // ...and the hats' own (his word on seed 1, "straight like a train"): three
  // variations over a phrase's second half, and a bar of rest before a line.
  mainsHatsQuarters as unknown as Recipe,
  mainsHatsOpenAnd as unknown as Recipe,
  mainsHatsSkip as unknown as Recipe,
  mainsHatsRest as unknown as Recipe,
]) as Recipe[];

/**
 * **DNB-1's thirteen small-thing candidates, in the contract** (round T1):
 * read off source 8 bar by bar, each at weight nought — pinnable, drawn by
 * nothing — until the ear admits it. Six were admitted on 2026-10-02 (above);
 * two are lead-in kinds the plan's step 5 will play, three were sections
 * (played since T2, `SECTION_LIBRARY`) and two are seams, stored and
 * validated for the plan's step 6. A row admitted moves to
 * `TREATMENT_LIBRARY` at the weight the ear gives it.
 */
export const TREATMENT_CANDIDATES: Recipe[] = Object.freeze([
  dnbRiserEveryTwo as unknown as Recipe,
  dnbCrashOnTheOne as unknown as Recipe,
]) as Recipe[];
/**
 * **The kinds of section as rows** (round T2, PLAN-TREATMENTS §3 step 4;
 * `src/sections.ts` is the mechanism). The house's six first, one per kind at
 * weight 1 — the layer pattern, the floor, the admits and the flags the
 * record's grammar carried as code, written as rows, and the style's own
 * grammar is built from them (`deep-house.ts` `sections`). Then the mined
 * rows of source 8, a second row of a kind: at nought in the row, so no place
 * draws one on the row's word alone, and preferred by the fast broken place
 * (`deep-house-places.ts` `SECTIONS`) at a share beside the house's. Any row
 * here is pinnable (`?recipe=dnb/dnb-intro`) and plays for its kind.
 */
export const SECTION_LIBRARY: Recipe[] = Object.freeze([
  sectionIntro as unknown as Recipe,
  sectionBuild as unknown as Recipe,
  sectionMain as unknown as Recipe,
  sectionBreakdown as unknown as Recipe,
  sectionDrop as unknown as Recipe,
  sectionOutro as unknown as Recipe,
  dnbIntro as unknown as Recipe,
  dnbMain as unknown as Recipe,
  dnbBreakdown as unknown as Recipe,
  dnbOutro as unknown as Recipe,
  // round DNB-6: the intro built for mixing, preferred by the form rows that ask for it
  dnbMixIntro as unknown as Recipe,
  // liquid-space (10-11): the harmony alone, the exposed passage the new form rows ask for (its state drawn by the form)
  dnbExposed as unknown as Recipe,
]) as Recipe[];
export const SEAM_CANDIDATES: Recipe[] = Object.freeze([
  dnbBreakdownIntoDrop as unknown as Recipe,
  dnbDropIntoBreakdown as unknown as Recipe,
]) as Recipe[];

/**
 * **Track forms as rows** (round DNB-6; his ear on DNB-5, 10-05: *"we use deep
 * house track structure … we need to come up with a few archetypical DnB track
 * structures"*): track rows carrying a `form` — an order of sections laid in
 * whole blocks of bars, the labels that take up the theme's length, the
 * lengths the row fits, the section rows it prefers. A place's form table
 * (`deep-house-places.ts` `FORM`) names them by id and weight; nothing else
 * draws them, and they are not pinnable (a track pin is a whole theme's cast).
 */
export const FORM_LIBRARY: Recipe[] = Object.freeze([
  dnbFormClassic as unknown as Recipe,
  dnbFormTwoDrop as unknown as Recipe,
  dnbFormRolling as unknown as Recipe,
  // liquid-space (10-11): the manual's shapes, with their lengths, states and return feature drawn (`FormBlock.choices`)
  dnbFormTwoReturn as unknown as Recipe,
  dnbFormRoller as unknown as Recipe,
  dnbFormIslands as unknown as Recipe,
  dnbFormHalfTimeDialogue as unknown as Recipe,
  dnbFormBrokenAir as unknown as Recipe,
]) as Recipe[];

/** The treatment rows the composer's draw sees: the library and the candidates (the latter at nought, so never drawn). */
export const TREATMENTS: Recipe[] = Object.freeze([...TREATMENT_LIBRARY, ...TREATMENT_CANDIDATES]) as Recipe[];

/** Every row a link may pin: the shipped library, the patterns, the whole themes, the candidates, then the scoped rows. */
export const PINNABLE: Recipe[] = Object.freeze([...LIBRARY, ...PATTERN_LIBRARY, ...TRACK_LIBRARY, ...CANDIDATE_LIBRARY,
  ...TREATMENT_LIBRARY, ...TREATMENT_CANDIDATES, ...SECTION_LIBRARY, ...SEAM_CANDIDATES]) as Recipe[];

export const PART_LIBRARY: Recipe[] = LIBRARY.filter(r => r.scope === 'layer');

/** The melody families of the library, in the order it lists them. */
export const MOTIF_LIBRARY: Recipe[] = LIBRARY.filter((r) => r.scope === 'motif');

/**
 * A row by its id, or by the half of it after the slash — among every row a
 * link may pin unless a library is named.
 */
export function recipeById(id: string, library: Recipe[] = PINNABLE): Recipe | null {
  const exact = library.find(r => r.id === id);
  if (exact) return exact;
  const short = library.filter(r => r.id.endsWith('/' + id));
  if (short.length > 1) throw new Error(`Ambiguous recipe name ${id}; use its full ID`);
  return short[0] ?? null;
}

export default LIBRARY;
