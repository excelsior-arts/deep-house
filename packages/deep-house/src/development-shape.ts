// A whole-theme contour over the existing phrase arranger. Taste belongs to
// the style; this module knows roles, spans and gates, never instruments.
import type { Style } from '@deep-house/engine/style';
import { MOVES, type Move } from './motif.ts';
import type Rng from './rng.ts';
import { sectionsFrom, type Arrangement, type BarPoint } from './arrangement.ts';

export interface ShapeState {
  withdraw: string[];
  filter: number;
}
export interface ShapePolicy {
  grooveKind: string;
  grooveKinds: string[];
  restKinds: string[];
  transitionKinds: string[];
  restKind: string;
  emptyRestBars: number;
  supportedRestBars: number;
  /** Existing rhythm roles which keep a short, unsupported breath connected. */
  restAnchorRoles: string[];
  finishClosingPhrase: boolean;
  prepareBars: number;
  settleBars: number;
  plateauBars: number;
  contours: Array<{
    id: string;
    weight: { struck: number; sustained: number };
    /** Desired positions in the theme, snapped to eligible complete sections. */
    peaks: Array<[number, number]>;
  }>;
  flow: ShapeState[];
  prepare: ShapeState;
  plateau: ShapeState;
  settle: ShapeState;
  /** A supporting bass develops more slowly; explicit bass pins keep their score. */
  bass: { variationBars: number; moves: Array<{ v: Move; w: number }> };
}

/** Develop only at a shared boundary; the phrase's return clock is unchanged. */
export function variationSpan(returns: number, minimum: number): number {
  if (![returns,minimum].every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid phrase variation span');
  const gcd = (a: number, b: number): number => b ? gcd(b,a%b) : a;
  return returns * minimum / gcd(returns,minimum);
}

export interface HarmonicSupport {
  figure: boolean;
  sustained: boolean;
  character: 'struck' | 'sustained';
}

/** One palette decision for the theme, after actual parts replace its proposal. */
export function harmonicSupport(input: {
  figureAvailable: boolean; sustainedAvailable: boolean;
  figureSelected: boolean; figureSustained: boolean;
  separate: boolean; leadSustained: boolean; padUnderFigure: boolean;
  bothChance: number; leadAloneChance: number;
}, rng: Rng): HarmonicSupport {
  const both = input.padUnderFigure || rng.chance(input.bothChance);
  const leadWins = rng.chance(input.leadAloneChance);
  const figure = input.figureAvailable && (input.figureSelected || !input.sustainedAvailable
    || input.separate || both || (input.leadSustained ? !leadWins : leadWins));
  const sustained = input.sustainedAvailable && !input.separate && (both || !figure);
  return { figure, sustained, character: input.figureSelected
    ? input.figureSustained ? 'sustained' : 'struck'
    : sustained && !figure ? 'sustained' : 'struck' };
}

export function shapeProblems(p: ShapePolicy, style: Style, restKind: string): string[] {
  const bad: string[] = [];
  const gates = new Set(style.lanes.flatMap(l => l.gate ? [l.gate] : []));
  const percussion = new Set(style.lanes.filter(l => ['offbeat','sixteenth','backbeat'].includes(l.role)).flatMap(l => l.gate ? [l.gate] : []));
  if (!style.sections.kinds[p.grooveKind] || !p.grooveKinds?.includes(p.grooveKind)
    || p.grooveKinds.some(k => !style.sections.kinds[k]) || p.restKind !== restKind
    || !p.restKinds?.length || !p.transitionKinds?.length) bad.push('section kinds');
  if ([p.emptyRestBars,p.supportedRestBars,p.prepareBars,p.settleBars,p.plateauBars,p.bass?.variationBars]
    .some(n => !Number.isInteger(n) || n < 4 || n % 4)
    || p.emptyRestBars > p.supportedRestBars
    || [p.prepareBars,p.settleBars,p.plateauBars].some(n => n % 8)) bad.push('phrase spans');
  if (!p.restAnchorRoles?.length || p.restAnchorRoles.some(r => !style.lanes.some(l => l.role === r && l.gate))) bad.push('rest anchors');
  if (typeof p.finishClosingPhrase !== 'boolean') bad.push('closing phrase');
  if (!p.flow?.length || [p.flow,p.prepare && [p.prepare],p.plateau && [p.plateau],p.settle && [p.settle]]
    .some(states => !states || states.some(s => !Array.isArray(s.withdraw)
      || s.withdraw.some(g => !gates.has(g) || !percussion.has(g)) || !Number.isFinite(s.filter) || s.filter < 20 || s.filter > 20000))) bad.push('phrase states');
  if (!p.contours?.length || p.contours.some(c => !c.id || !Array.isArray(c.peaks)
    || c.peaks.some(r => r.length !== 2 || r.some(n => !Number.isFinite(n) || n < 0 || n > 1) || r[0] > r[1])
    || ['struck','sustained'].some(k => !Number.isFinite(c.weight?.[k as keyof typeof c.weight]) || c.weight[k as keyof typeof c.weight] < 0))
    || ['struck','sustained'].some(k => !p.contours.some(c => c.weight?.[k as keyof typeof c.weight] > 0))) bad.push('contours');
  if (!p.bass?.moves?.length || p.bass.moves.some(m => !MOVES.includes(m.v) || !Number.isFinite(m.w) || m.w < 0)
    || !p.bass.moves.some(m => m.w > 0)) bad.push('supporting bass');
  return bad;
}

export interface ShapeTrace {
  contour: string;
  support: HarmonicSupport;
  requestedPeaks: number;
  peaks: Array<{ section: number; prepare: number; from: number; to: number; settled: number }>;
  rests: Array<{ kind: string; before: number; after: number; supported: boolean }>;
}

export function shapeArrangement(base: Arrangement, style: Style, p: ShapePolicy,
  support: HarmonicSupport, rng: Rng, silent: readonly string[], protectedGates: readonly string[] = []) {
  const sustainedGates = style.lanes.filter(l => l.role === 'sustained').flatMap(l => l.gate ? [l.gate] : []);
  const rests: ShapeTrace['rests'] = [];
  const rows = base.sections.map(s => {
    if (p.restKinds.includes(s.kind) || p.transitionKinds.includes(s.kind)) {
      const bars = Math.min(s.bars, support.sustained ? p.supportedRestBars : p.emptyRestBars);
      rests.push({kind:s.kind,before:s.bars,after:bars,supported:support.sustained});
      return {kind:p.restKind,bars};
    }
    // Existing full-groove labels do not create automatic impacts or drive bursts.
    return {kind: p.grooveKinds.includes(s.kind) ? p.grooveKind : s.kind, bars:s.bars};
  });
  // Adjacent breaths are one audible rest; do not evade its bound by relabeling.
  const joined = rows.reduce<typeof rows>((out, row) => {
    const last = out.at(-1);
    if (row.kind === p.restKind && last?.kind === p.restKind)
      last.bars = Math.min(last.bars + row.bars, support.sustained ? p.supportedRestBars : p.emptyRestBars);
    else out.push({...row});
    return out;
  }, []);
  const arrangement = sectionsFrom(joined, style.sections, silent);
  const closing = [...arrangement.sections].reverse().find(s => s.kind === p.grooveKind);
  if (p.finishClosingPhrase && closing) arrangement.handoverNotBefore = closing.startBar + closing.bars;
  const contour = rng.weighted(p.contours.filter(c => c.weight[support.character] > 0)
    .map(c => ({v:c,w:c.weight[support.character]})));
  const peaks: ShapeTrace['peaks'] = [];
  const used = new Set<number>();
  for (const position of contour.peaks) {
    const target = rng.float(...position) * arrangement.bars;
    const candidates = arrangement.sections.filter(s => s.kind === p.grooveKind && !used.has(s.index)
      && s.bars >= p.prepareBars + p.plateauBars + p.settleBars
      && (s.startBar+s.bars/2)/arrangement.bars >= position[0]
      && (s.startBar+s.bars/2)/arrangement.bars <= position[1]);
    candidates.sort((a,b) => Math.abs(a.startBar+a.bars/2-target)-Math.abs(b.startBar+b.bars/2-target));
    const s = candidates[0];
    if (!s) continue; // A short theme can stay level; never squeeze in a token climax.
    used.add(s.index);
    peaks.push({section:s.index,prepare:s.startBar,from:s.startBar+p.prepareBars,
      to:s.startBar+s.bars-p.settleBars,settled:s.startBar+s.bars});
  }
  peaks.sort((a,b) => a.from-b.from);
  const filter: BarPoint[] = [];
  for (const section of arrangement.sections) {
    const peak = peaks.find(p => p.section === section.index);
    for (const phrase of section.phrases) {
      let layers = {...phrase.layers};
      if (section.kind === p.grooveKind) {
        // Re-read the base grammar: the previous pacing proposal's alternating
        // masks must not accidentally thin the new contour's plateau.
        layers = {...style.sections.kinds[p.grooveKind].layers(phrase.indexInSection,section.phrases.length)};
        const state = peak ? phrase.startBar < peak.from ? p.prepare
          : phrase.startBar < peak.to ? p.plateau : p.settle
          : p.flow[phrase.indexInSection % p.flow.length];
        for (const gate of state.withdraw) if (!protectedGates.includes(gate)) layers[gate] = false;
        filter.push({bar:phrase.startBar,value:state.filter});
      } else {
        const span = section.bars;
        const progress = (phrase.startBar-section.startBar)/span;
        filter.push({bar:phrase.startBar,value:section.filter[0]+(section.filter[1]-section.filter[0])*progress});
        if (section.kind === p.restKind && !support.sustained)
          for (const lane of style.lanes) if (lane.gate && p.restAnchorRoles.includes(lane.role)) layers[lane.gate] = true;
      }
      if (!support.sustained) for (const gate of sustainedGates) layers[gate] = false;
      for (const gate of silent) layers[gate] = false;
      phrase.layers = layers;
    }
    if (section.kind !== p.grooveKind) filter.push({bar:section.startBar+section.bars-.05,value:section.filter[1]});
  }
  filter.push({bar:arrangement.bars,value:filter.at(-1)!.value});
  return {arrangement,filter,trace:{contour:contour.id,support,requestedPeaks:contour.peaks.length,peaks,rests} satisfies ShapeTrace};
}
