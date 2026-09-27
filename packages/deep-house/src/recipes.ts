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
import ambientSlowChords from '../recipes/genres/ambient/slow-chords.json' with { type: 'json' };
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
 * **The genres beyond the house, kept out of the draw** (recipes-g1, Eugene
 * 09-26: *"we can keep them out [of the default draw] and use a link to audit
 * in the app"*). Classic patterns of other genres — the two-step, the Amen, the
 * dub skank — written from public knowledge as `track` rows under
 * `recipes/genres/<family>/`, one family of `src/machine/genres.json` per
 * folder.
 *
 * A row here is **pinnable and nothing else**: `recipeById` finds it, so a
 * link `?v=2&spell=<the family key's>&recipe=dnb/two-step` plays it, and no
 * draw ever sees it — `?recipe=auto` draws among `LIBRARY` alone, no style
 * admits a part from here, and every row carries `weight: 0` so it would not
 * be drawn even if it were handed to a draw. The house, its locks and its
 * links cannot hear this list. `notes/rounds/recipes-g1.md` is the audit table.
 */
export const GENRE_LIBRARY: Recipe[] = Object.freeze([
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
  ambientSlowChords as unknown as Recipe,
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
]) as Recipe[];

/** Every row a link may pin: the shipped library, then the genres. */
export const PINNABLE: Recipe[] = Object.freeze([...LIBRARY, ...GENRE_LIBRARY]) as Recipe[];

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
