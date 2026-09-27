// A theme's form: the arrangement the corpus draws, the optional development
// that phrases and shapes it, which harmonic roles carry the rests, and the
// bars a separated pitched part keeps free of the sustained bed. Split out of
// generator.ts in the composer fix round of 09-22 without moving an event.
import type { Lane, Style } from '@deep-house/engine/style';
import type Rng from './rng.ts';
import { makeArrangement, layersAtBar, SHORT_OUTRO_BARS } from './arrangement.ts';
import { switchOn } from './lanes.ts';
import { developArrangement, developmentQuantum, type DevelopmentPolicy } from './development.ts';
import { harmonicSupport, shapeArrangement, type ShapePolicy } from './development-shape.ts';
import { sustainedSupport } from './parts/support.ts';
import { placementOf } from './motif.ts';
import type { MusicalParts } from './parts/types.ts';
import type { CompositionPolicy, PartPin } from './composition-policy.ts';
import type { Composition } from './composition.ts';

export interface FormRequest {
  style: Style;
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
  dArr: Rng;
  CORPUS: Style['corpus'];
  sectionBars: number;
  dice: (tag: string) => Rng;
}

/** The arrangement, its development trace, and the harmonic support the form leaves. */
export function planForm({ style, LANES, silent, laneOn, form, contourPolicy, figureSelected, figureSustained, padUnderFigure,
  leadSustained, bothChance, leadAloneChance, parts, pinned, composition, wantedBars, fitBars = null, dArr, CORPUS, sectionBars, dice }: FormRequest) {
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
  const originalArrangement = makeArrangement(form ? Math.min(wantedBars, form.themeBarsMax) : wantedBars, dArr, CORPUS, style.sections, sectionBars, silent, shortOutro, form ? null : fitBars);
  const phrased = form ? developArrangement(originalArrangement, style, form, developmentQuantum(parts, form), silent, protectedGates) : originalArrangement;
  const shaped = contourPolicy ? shapeArrangement(phrased,
    {...style,sections:{...style.sections,kinds:{...style.sections.kinds,[form!.bridgeKind]:form!.bridge}}},
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
