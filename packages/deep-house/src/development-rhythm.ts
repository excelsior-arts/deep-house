// Local rhythmic direction within the whole-theme contour. The style owns
// the cells and palette; this player knows musical positions and role gates.
import type { Style } from '@deep-house/engine/style';
import type { Arrangement } from './arrangement.ts';
import type { ShapeTrace } from './development-shape.ts';
import { resolveRhythm, rhythmProblems, type RhythmLane, type RhythmPart } from './parts/rhythm.ts';
import Rng from './rng.ts';

export const RHYTHM_PHASES = ['space','motion','approach','peak','breath','pickup'] as const;
export type RhythmPhase = typeof RHYTHM_PHASES[number];
export interface RhythmDevelopmentPolicy {
  role: 'sixteenth';
  phraseBars: number;
  movingAfter: number;
  approachBars: number;
  pickupBars: number;
  candidateWeights: Record<string, number>;
  parts: Array<{ id: string; cells: Record<RhythmPhase, RhythmPart[]> }>;
  kickPickup: { steps: number[]; accents: number[] };
}

export function rhythmDevelopmentProblems(p: RhythmDevelopmentPolicy, style: Style): string[] {
  // The strategy's flagged list is binding: a development palette may not draw
  // what the ear has reserved, whatever weight it names.
  const flagged = ((style as Style & { flagged?: ReadonlyArray<{ id: string }> }).flagged ?? []).map(f => f.id);
  const reopened = Object.entries(p.candidateWeights ?? {}).filter(([id, w]) => w > 0 && flagged.includes(id)).map(([id]) => id);
  const bad: string[] = reopened.length ? [`rhythm palette draws flagged ${reopened.join(', ')}`] : [];
  if (p.role !== 'sixteenth' || !style.lanes.some(l=>l.role===p.role)) bad.push('rhythm role');
  if (![p.phraseBars,p.approachBars,p.pickupBars].every(n=>Number.isInteger(n)&&n>0)
    || p.approachBars>p.phraseBars || p.pickupBars>p.approachBars
    || !Number.isFinite(p.movingAfter)||p.movingAfter<=0||p.movingAfter>=1) bad.push('rhythm spans');
  if (Object.entries(p.candidateWeights??{}).some(([v,w])=>!Number.isFinite(w)||w<0
    || !style.lanes.some(l=>l.role===p.role&&l.voices?.some(e=>e.v===v)))) bad.push('rhythm palette');
  if (!p.parts?.length || p.parts.length>2 || new Set(p.parts.map(p=>p.id)).size!==p.parts.length) bad.push('rhythm parts');
  for (const part of p.parts??[]) for(const phase of RHYTHM_PHASES) {
    const cells=part.cells?.[phase];
    if(!cells?.length){bad.push(`${part.id}/${phase}`);continue;}
    for(const cell of cells) bad.push(...rhythmProblems({[p.role]:[cell]}));
    // A phrase changes its playing, never its instrument or its feel contract.
    const first=part.cells.space?.[0];
    for(const cell of cells) if(first && JSON.stringify([cell.families,cell.properties,cell.feel,cell.character])
      !==JSON.stringify([first.families,first.properties,first.feel,first.character])) bad.push(`${part.id}: changing palette`);
  }
  bad.push(...rhythmProblems({kick:[{bars:1,...p.kickPickup,families:['drum']}]}));
  return bad;
}

export function prepareRhythmDevelopment(style: Style, p: RhythmDevelopmentPolicy,
  existing: readonly RhythmLane[], protectedRoles: readonly string[], forbids: readonly string[]) {
  if (protectedRoles.includes(p.role) || forbids.includes(p.role)) return null;
  const palette={...style,lanes:style.lanes.map(l=>l.role!==p.role?l:{...l,
    voices:l.voices?.map(v=>({...v,w:p.candidateWeights[v.v]??v.w}))??null})};
  const resolved=resolveRhythm({[p.role]:p.parts.map(part=>part.cells.space[0])},palette,forbids,'development');
  // A family prohibition may leave no compatible ensemble. Keep the requested
  // score rather than partially installing a second rhythm section.
  if(resolved.errors.length)return null;
  const retained=new Set<string>();
  const developed=resolved.lanes.map(r=>{
    const allowed=new Set(r.lane.voices!.filter(v=>v.w>0).map(v=>v.v));
    const prior=existing.find(e=>e.lane.role===p.role&&!retained.has(e.lane.id)
      &&JSON.stringify(e.part.families)===JSON.stringify(r.part.families)
      &&e.lane.voices?.some(v=>v.w>0&&allowed.has(v.v)));
    if(!prior)return r;
    retained.add(prior.lane.id);
    // Keep an already selected player's stream and eligible weights. Adding
    // movement to a conga phrase should not roll a different instrument.
    return {...r,lane:{...prior.lane,voices:prior.lane.voices!.map(v=>({...v,w:allowed.has(v.v)?v.w:0}))}};
  });
  return { lanes:[...existing.filter(r=>r.lane.role!==p.role),...developed],
    parts:new Map(developed.map((r,i)=>[r.lane.id,p.parts[i]])),
    gates:[...new Set(developed.flatMap(r=>r.lane.gate?[r.lane.gate]:[]))] };
}

export function rhythmPhaseAt(arrangement: Arrangement, trace: ShapeTrace, bar: number,
  p: RhythmDevelopmentPolicy, grooveKind: string, restKind: string): RhythmPhase | null {
  const section=arrangement.sections.find(s=>bar>=s.startBar&&bar<s.startBar+s.bars);
  if(!section)return null;
  const inside=bar-section.startBar, remaining=section.bars-inside;
  const next=arrangement.sections[section.index+1];
  if(section.kind===restKind) return next?.kind===grooveKind&&remaining<=p.pickupBars?'pickup':'breath';
  if(section.kind!==grooveKind)return null;
  const peak=trace.peaks.find(v=>v.section===section.index);
  if(peak&&bar>=peak.to)return 'space';
  if(peak&&bar>=peak.from)return 'peak';
  if(next?.kind===restKind&&remaining<=p.approachBars)return 'approach';
  return inside/section.bars>=p.movingAfter?'motion':'space';
}

export function rhythmCell(part: RhythmDevelopmentPolicy['parts'][number], phase: RhythmPhase,
  seed: string|number, section: number, phrase: number): RhythmPart {
  return new Rng(`${seed}::development:rhythm:${part.id}:${section}:${phrase}:${phase}`).pick(part.cells[phase]);
}

/** End-aligned once, never tiled through the rest or into the next section. */
export function rhythmPickup(part: RhythmPart, arrangement: Arrangement, bar: number,
  restKind: string, grooveKind: string): { part: RhythmPart; offset: number } | null {
  if (!part.pickup) return null;
  const section=arrangement.sections.find(s=>bar>=s.startBar&&bar<s.startBar+s.bars);
  if (!section || section.kind!==restKind || part.pickup.bars>section.bars
    || arrangement.sections[section.index+1]?.kind!==grooveKind) return null;
  const from=section.startBar+section.bars-part.pickup.bars;
  if (bar<from) return null;
  return {part:{...part,...part.pickup,strokes:part.pickup.strokes,pickup:undefined},offset:(bar-from)*16};
}
