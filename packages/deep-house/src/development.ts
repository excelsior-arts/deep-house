// Optional, style-owned long-form development through the normal arranger.
import { linkValue } from './link-table.ts';
import type { Style, SectionKind } from '@deep-house/engine/style';
import { sectionsFrom, type Arrangement } from './arrangement.ts';
import type { MusicalParts } from './parts/types.ts';
import type { Conditions } from './composition-policy.ts';
import { shapeProblems, type ShapePolicy } from './development-shape.ts';
import { rhythmDevelopmentProblems, type RhythmDevelopmentPolicy } from './development-rhythm.ts';

export type Development = 'base' | 'phrased' | 'shaped' | 'percussion';
export interface DevelopmentPolicy {
  when?: Conditions;
  themeBarsMax: number;
  kinds: string[];
  maxSectionBars: number;
  phraseBars: number;
  bridgeKind: string;
  bridge: SectionKind;
  bridgeBars: number;
  withdrawGates: string[];
  shape?: ShapePolicy;
  rhythm?: RhythmDevelopmentPolicy;
}
export const developmentFor = (opts: { development?: Development; search?: string | null } = {}): Development => {
  const value = opts.development ?? linkValue('development', opts.search === undefined ? undefined : opts.search ?? '') ?? 'base';
  if (!['base','phrased','shaped','percussion'].includes(value)) throw new Error(`Unknown development mode: ${value}`);
  return value as Development;
};
export function developmentOf(style: Style, mode: Development): DevelopmentPolicy | null {
  if (mode === 'base') return null;
  if (!['phrased','shaped','percussion'].includes(mode)) throw new Error(`Unknown development mode: ${mode}`);
  const p = (style as Style & { development?: DevelopmentPolicy }).development;
  if (!p) throw new Error('This style has no phrased development policy');
  if ([p.themeBarsMax,p.maxSectionBars,p.phraseBars,p.bridgeBars].some(n => !Number.isInteger(n) || n < 4 || n % 4)
    || p.phraseBars > p.maxSectionBars || p.maxSectionBars > p.themeBarsMax
    || !p.kinds.length || p.kinds.some(k => !style.sections.kinds[k])
    || !p.bridgeKind || style.sections.kinds[p.bridgeKind] || p.kinds.includes(p.bridgeKind)
    || !p.bridge || typeof p.bridge.layers !== 'function' || !p.bridge.label
    || p.withdrawGates.some(g => !style.lanes.some(l => l.gate === g)))
    throw new Error('Invalid development policy');
  if (mode !== 'phrased' && (!p.shape || shapeProblems(p.shape, style, p.bridgeKind).length))
    throw new Error('This style has no valid shaped development policy');
  if (mode === 'percussion' && (!p.rhythm || rhythmDevelopmentProblems(p.rhythm, style).length))
    throw new Error('This style has no valid percussion development policy');
  return p;
}
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
/** Ordered phrases must finish before a structural interruption. */
export function developmentQuantum(parts: MusicalParts, p: DevelopmentPolicy): number {
  let bars = p.phraseBars;
  for (const part of parts.struckFigures.filter(p => p.motif.paths)) {
    // Fixed ordered cycles are supported; an uncertain structural span must
    // not be rounded silently into a shorter phrase.
    if (part.spacing.bars[0] !== part.spacing.bars[1]) throw new Error('Developed ordered phrases require a fixed cycle span');
    const span = part.spacing.bars[0];
    bars = bars * span / gcd(bars, span);
  }
  if (bars > p.maxSectionBars) throw new Error('Ordered phrase does not fit the development section budget');
  return bars;
}
export function developArrangement(base: Arrangement, style: Style, p: DevelopmentPolicy, quantum: number,
  silent: readonly string[], protectedGates: readonly string[] = []): Arrangement {
  const rows: Array<{ kind: string; bars: number }> = [];
  const maximum = Math.floor(p.maxSectionBars / quantum) * quantum;
  for (let i = 0; i < base.sections.length; i++) {
    const section = base.sections[i];
    if (!p.kinds.includes(section.kind)) { rows.push({ kind: section.kind, bars: section.bars }); continue; }
    // Adjacent names for the same full groove do not reset its length budget.
    let remaining = section.bars;
    while (i+1 < base.sections.length && p.kinds.includes(base.sections[i+1].kind)) remaining += base.sections[++i].bars;
    let first = true;
    while (remaining >= quantum + (first ? 0 : p.bridgeBars)) {
      if (!first) { rows.push({ kind: p.bridgeKind, bars: p.bridgeBars }); remaining -= p.bridgeBars; }
      const bars = Math.min(maximum, Math.floor(remaining / quantum) * quantum);
      rows.push({ kind: section.kind, bars });
      remaining -= bars; first = false;
    }
    // Unused partial phrases shorten the theme; they are not clipped notes or
    // extra silence appended to an already long breakdown.
  }
  if (!rows.some(r => p.kinds.includes(r.kind))) throw new Error('No complete phrase fits this developed arrangement');
  const grammar = { ...style.sections, kinds: { ...style.sections.kinds, [p.bridgeKind]: p.bridge } };
  const result = sectionsFrom(rows, grammar, silent);
  for (const section of result.sections) if (p.kinds.includes(section.kind)) {
    for (const phrase of section.phrases) if (phrase.indexInSection % 2 === 0) {
      phrase.layers = { ...phrase.layers };
      for (const gate of p.withdrawGates) if (!protectedGates.includes(gate)) phrase.layers[gate] = false;
    }
  }
  return result;
}
