// A theme's form: the arrangement the corpus draws, the optional development
// that phrases and shapes it, which harmonic roles carry the rests, and the
// bars a separated pitched part keeps free of the sustained bed. Split out of
// generator.ts in the composer fix round of 09-22 without moving an event.
import type { Lane, Style } from '@deep-house/engine/style';
import type Rng from './rng.ts';
import { makeArrangement, layersAtBar, SHORT_OUTRO_BARS, SECTION_TIME, type MainTexture } from './arrangement.ts';
import { switchOn } from './lanes.ts';
import { developArrangement, developmentQuantum, type DevelopmentPolicy } from './development.ts';
import { harmonicSupport, shapeArrangement, type HarmonicSupport, type ShapePolicy } from './development-shape.ts';
import { sustainedSupport } from './parts/support.ts';
import { placementOf } from './motif.ts';
import type { MusicalParts } from './parts/types.ts';
import type { CompositionPolicy, PartPin } from './composition-policy.ts';
import type { Composition } from './composition.ts';

export interface FormRequest {
  style: Style;
  /** the section grammar this theme plays where it is not the style's own (round T2, `src/sections.ts`): the style's with the theme's rows laid over it */
  grammar?: Style['sections'] | null;
  LANES: readonly Lane[];
  silent: readonly string[];
  laneOn: (lane: Lane, layers: Record<string, boolean | undefined>) => boolean;
  form: DevelopmentPolicy | null;
  contourPolicy: ShapePolicy | null;
  figureSelected: boolean;
  figureSustained: boolean;
  padUnderFigure: boolean;
  leadSustained: boolean;
  bothChance: number;
  leadAloneChance: number;
  parts: MusicalParts;
  pinned: PartPin | null;
  composition: Composition | null;
  wantedBars: number;
  /** the length to cut the arrangement to, mains first (S19); none is no cut */
  fitBars?: number | null;
  /**
   * The cut's reading of a main (round L2): its texture off the section's
   * harmonic roll, given the theme's continuity; and the bars a solo asks of
   * an open main, 0 where the theme may not solo.
   */
  texture?: ((index: number, continuity: HarmonicSupport | null) => MainTexture) | null;
  soloBars?: number;
  /** one section per this many bars: the window counted in time at the played tempo (L3, `SECTION_TIME`); the house's 22 where none */
  windowBars?: number;
  dArr: Rng;
  CORPUS: Style['corpus'];
  sectionBars: number;
  dice: (tag: string) => Rng;
}

/** The arrangement, its development trace, and the harmonic support the form leaves. */
export function planForm({ style, grammar = null, LANES, silent, laneOn, form, contourPolicy, figureSelected, figureSustained, padUnderFigure,
  leadSustained, bothChance, leadAloneChance, parts, pinned, composition, wantedBars, fitBars = null, texture = null, soloBars = 0, windowBars = SECTION_TIME.windowBars, dArr, CORPUS, sectionBars, dice }: FormRequest) {
  const roleAvailable = (role: string) => LANES.some(l => l.role === role && (!l.gate || !silent.includes(l.gate)));
  const continuity = contourPolicy ? harmonicSupport({
    figureAvailable:roleAvailable('figure'), sustainedAvailable:roleAvailable('sustained'),
    figureSelected, figureSustained,
    separate:parts.struckFigures.some(p => p.support?.sustained === 'separate'),
    leadSustained, padUnderFigure,
    bothChance, leadAloneChance,
  }, dice('development:support')) : null;
  // Authored scores contain their own rests. Preserve them through generic
  // thinning, whether the part was pinned or selected from the catalogue.
  const protectedRoles = new Set([...(pinned ? [pinned.role] : []),
    ...(composition?.trace.recipes?.flatMap(r=>r.roles)??[])]);
  const protectedGates = LANES.filter(l=>protectedRoles.has(l.role)&&l.gate).map(l=>l.gate!);
  // A short theme's eight-bar outro (R38, `sectionPhrases`): only where the
  // theme has a grid, the one place a seam over its build or drop is heard.
  const kick = LANES.find(l => l.role === 'kick');
  const shortOutro = switchOn(style, 'sectionPhrases') && !!kick?.gate && !silent.includes(kick.gate) ? SHORT_OUTRO_BARS : 0;
  // A development form lays out its own arrangement and is never cut, so it is
  // drawn at the heard length (`fitBars`, L1's minutes) rather than the length
  // the cut starts from; the form's own ceiling still holds.
  const cutRule = texture ? { texture: (index: number) => texture(index, continuity), soloBars } : null;
  // S25's rule (house-v2's `mainsApart`): no main beside a main of its own
  // texture; a development lays out its own form.
  const mains = !form && switchOn(style, 'mainsApart');
  // The theme's own grammar (T2), where it has one, everywhere the style's
  // was read: the form, the development's bridge beside its kinds, the
  // shape's re-read of a groove. The style itself where it has none.
  const styled = grammar ? { ...style, sections: grammar } : style;
  const sections = grammar ?? style.sections;
  const originalArrangement = makeArrangement(form ? Math.min(fitBars ?? wantedBars, form.themeBarsMax) : wantedBars, dArr, CORPUS, sections, sectionBars, silent, shortOutro, form ? null : fitBars, cutRule, windowBars, mains);
  const phrased = form ? developArrangement(originalArrangement, styled, form, developmentQuantum(parts, form), silent, protectedGates) : originalArrangement;
  const shaped = contourPolicy ? shapeArrangement(phrased,
    {...styled,sections:{...sections,kinds:{...sections.kinds,[form!.bridgeKind]:form!.bridge}}},
    contourPolicy, continuity!, dice('development:contour'), silent, protectedGates) : null;
  const arrangement = shaped?.arrangement ?? phrased;
  const bars = arrangement.bars;
  const separated = parts.struckFigures.some(p => p.support?.sustained === 'separate');
  const clearance = (style as Style & { composition?: CompositionPolicy }).composition?.placement?.sustainedClearanceBeats;
  const support = separated ? sustainedSupport(Array.from({ length: bars }, (_, bar) => {
    const { section, layers } = layersAtBar(arrangement, bar);
    return placementOf(section.kind).plays && LANES.some(l => l.role === 'figure' && laneOn(l, layers));
  }), clearance!) : null;
  if (support && composition) composition.trace.support = {
    figure: { sustained: 'separate', clearanceBeats: clearance! },
    reservedBars: support.reserved.flatMap((on, bar) => on ? [bar] : []),
  };
  return { continuity, shaped, arrangement, bars, support };
}
