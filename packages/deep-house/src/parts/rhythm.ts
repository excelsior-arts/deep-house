// Musical cells: sixteenth positions and
// relative accents, resolved against each role's existing, enabled palette.
import type { Lane, Style } from '@deep-house/engine/style';
import { BY_NAME } from '@deep-house/engine/voices';
import { charactersOf } from './sound.ts';

export const RHYTHM_ROLES = ['kick', 'offbeat', 'sixteenth', 'backbeat'] as const;
export interface RhythmPart {
  bars: number;
  steps: number[];
  accents: number[];
  families: string[];
  /** A style-owned sound colour, independently selected for each player. */
  character?: string;
  /** One named articulation per hit, resolved by the selected character. */
  strokes?: string[];
  /** A short lead-in at the end of a rest before a groove. Same player/feel. */
  pickup?: { bars: number; steps: number[]; accents: number[]; strokes?: string[] };
  /** Per-part feel; timing is in beats, dynamics is a bounded attenuation. */
  feel?: { swing: number; delay: { beats: number }; timing: { beats: number }; dynamics: number };
  properties?: Properties;
  /**
   * A narrower profile inside `properties` that the draw leans toward: an
   * enabled candidate inside it weighs the style's `composition.prefer` times
   * its palette weight. A preference, never a gate: `properties` is the family
   * of sounds the part admits, `prefer` the one it was written on.
   */
  prefer?: Properties;
}
export interface Properties { struck?: boolean; holdMin?: number; holdMax?: number; brightnessMin?: number; brightnessMax?: number }
/** Whether a declared timbre lies inside a property window; an empty window admits anything. */
export function inside(t: { struck: boolean; hold: number; brightnessHz: number } | undefined, want: Properties | undefined): boolean {
  if (!want || !Object.keys(want).length) return true;
  return !!t && (want.struck === undefined || t.struck === want.struck)
    && (want.holdMin === undefined || t.hold >= want.holdMin)
    && (want.holdMax === undefined || t.hold <= want.holdMax)
    && (want.brightnessMin === undefined || t.brightnessHz >= want.brightnessMin)
    && (want.brightnessMax === undefined || t.brightnessHz <= want.brightnessMax);
}
/** How many times its palette weight a preferred candidate draws, where the style says. */
export const preferLean = (style: Style): number =>
  (style as Style & { composition?: { prefer?: number } }).composition?.prefer ?? 1;
function propertyProblems(props: any, at: string): string[] {
  const bad: string[] = [];
  if (!object(props)) return [`${at}: not an object`];
  for (const [key, v] of Object.entries(props)) {
    if (key === 'struck') { if (typeof v !== 'boolean') bad.push(`${at}.struck: not a boolean`); }
    else if (!['holdMin', 'holdMax', 'brightnessMin', 'brightnessMax'].includes(key) || !Number.isFinite(v) || Number(v) < 0) bad.push(`${at}.${key}: unknown property or invalid bound`);
  }
  for (const key of ['hold', 'brightness']) if (props[`${key}Min`] > props[`${key}Max`]) bad.push(`${at}.${key}: bounds run backwards`);
  return bad;
}
/** A preferred profile names the same properties and lies inside the admitted window. */
export function preferProblems(properties: any, prefer: any, at: string): string[] {
  if (prefer === undefined) return [];
  const bad = propertyProblems(prefer, at);
  if (bad.length) return bad;
  const p = object(properties) ? properties : {};
  if (prefer.struck !== undefined && p.struck !== undefined && prefer.struck !== p.struck) bad.push(`${at}.struck: contradicts the part's properties`);
  for (const key of ['hold', 'brightness']) {
    const lo = p[`${key}Min`] ?? -Infinity, hi = p[`${key}Max`] ?? Infinity;
    if ((prefer[`${key}Min`] ?? lo) < lo || (prefer[`${key}Max`] ?? hi) > hi) bad.push(`${at}.${key}: a preference must lie inside the part's window`);
  }
  return bad;
}
export interface RhythmLane { lane: Lane; part: RhythmPart }
const object = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

export function rhythmProblems(value: any): string[] {
  const bad: string[] = [];
  if (!object(value)) return ['wants.rhythm must be an object'];
  for (const [role, parts] of Object.entries(value)) {
    const at = `wants.rhythm.${role}`;
    if (!(RHYTHM_ROLES as readonly string[]).includes(role)) bad.push(`${at}: no cell player for this role`);
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 3) { bad.push(`${at}: use one to three parts`); continue; }
    parts.forEach((p, i) => {
      const here = `${at}[${i}]`;
      if (!object(p)) { bad.push(`${here}: not a part`); return; }
      if (Object.keys(p).some(k => !['bars', 'steps', 'accents', 'families', 'properties', 'prefer', 'feel', 'character', 'strokes', 'pickup'].includes(k))) bad.push(`${here}: unknown part field`);
      bad.push(...preferProblems(p.properties, p.prefer, `${here}.prefer`));
      if (p.pickup !== undefined) {
        if (!object(p.pickup) || Object.keys(p.pickup).some(k=>!['bars','steps','accents','strokes'].includes(k))
          || ![1,2].includes(p.pickup.bars)) bad.push(`${here}.pickup: a one- or two-bar musical cell required`);
        else bad.push(...rhythmProblems({[role]:[{...p,...p.pickup,strokes:p.pickup.strokes,pickup:undefined}]})
          .map(message=>`${here}.pickup: ${message}`));
      }
      if (p.character !== undefined && (typeof p.character !== 'string' || !p.character.trim())) bad.push(`${here}.character: name a style sound character`);
      if (p.strokes !== undefined && (typeof p.character !== 'string' || !p.character.trim()
        || !Array.isArray(p.strokes) || p.strokes.length !== p.steps?.length
        || p.strokes.some((s:any)=>typeof s!=='string'||!s.trim())))
        bad.push(`${here}.strokes: one named stroke per hit and a sound character required`);
      if (![1, 2, 4, 8, 16].includes(p.bars)) bad.push(`${here}.bars: use 1, 2, 4, 8 or 16`);
      if (!Array.isArray(p.steps) || !p.steps.length || p.steps.length > 256 || p.steps.some((s: any, j: number) => !Number.isInteger(s) || s < 0 || s >= 16 * p.bars || (j > 0 && s <= p.steps[j - 1]))) bad.push(`${here}.steps: ordered, unique sixteenth positions inside the cell required`);
      if (!Array.isArray(p.accents) || p.accents.length !== p.steps?.length || p.accents.some((a: any) => !Number.isFinite(a) || a <= 0 || a > 1)) bad.push(`${here}.accents: one relative strength in (0, 1] per step required`);
      if (!Array.isArray(p.families) || !p.families.length || p.families.some((f: any) => typeof f !== 'string')) bad.push(`${here}.families: declare at least one family`);
      if (p.feel !== undefined) {
        const f = p.feel;
        if (!object(f) || Object.keys(f).some(k => !['swing','delay','timing','dynamics'].includes(k))) bad.push(`${here}.feel: unknown feel instruction`);
        const bounded = (n: any, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
        if (!bounded(f?.swing,.5,.67) || !bounded(f?.dynamics,0,.4)) bad.push(`${here}.feel: swing .5–.67 and dynamics 0–.4 required`);
        for (const key of ['delay','timing']) if (!object(f?.[key]) || Object.keys(f[key]).some(k=>k!=='beats') || !bounded(f[key].beats,0,key==='delay'?.125:.04)) bad.push(`${here}.feel.${key}: bounded beat offset required`);
      }
      if (p.properties !== undefined) bad.push(...propertyProblems(p.properties, `${here}.properties`));
    });
  }
  return bad;
}

function matches(voice: string, part: RhythmPart, forbids: readonly string[], want = part.properties): boolean {
  const d = BY_NAME[voice];
  if (!d || !part.families.includes(d.family) || forbids.includes(d.family) || d.roles.some(r => forbids.includes(r))) return false;
  if (!want || !Object.keys(want).length) return true;
  // Missing declarations do not satisfy a hard property request.
  return Object.values(d.timbres || {}).some((t: any) => inside(t, want));
}

export function resolveRhythm(value: any, style: Style, forbids: readonly string[], namespace = 'recipe'): { lanes: RhythmLane[]; errors: string[] } {
  if (value === undefined) return { lanes: [], errors: [] };
  const errors = rhythmProblems(value);
  if (errors.length) return { lanes: [], errors };
  const lanes: RhythmLane[] = [];
  for (const [role, parts] of Object.entries(value) as Array<[string, RhythmPart[]]>) {
    const base = style.lanes.find(l => l.role === role && l.voices?.some(e => e.w > 0));
    if (!base || forbids.includes(role)) { errors.push(`${role}: no enabled, permitted lane`); continue; }
    parts.forEach((part, i) => {
      // A character's shape is the style's, checked once by `charactersOf`.
      const profile = part.character === undefined ? undefined : charactersOf(style)?.rhythm?.[part.character];
      if (part.character !== undefined && !profile) {
        errors.push(`${role}[${i}]: unknown rhythm character`); return;
      }
      if ([...(part.strokes??[]),...(part.pickup?.strokes??[])].some(s=>!Object.hasOwn(profile?.strokes??{},s))) {
        errors.push(`${role}[${i}]: unsupported stroke for this rhythm character`); return;
      }
      // Preserve list indices for the existing bird bias; an excluded candidate
      // stays at zero, including instruments reserved by earlier listening.
      const lean = preferLean(style);
      const voices = base.voices!.map(e => ({ ...e, w: matches(String(e.v), part, forbids)
        && (!profile || profile.requires.every(k=>BY_NAME[String(e.v)]?.noteControls?.includes(k)))
        ? e.w * (part.prefer && matches(String(e.v), part, forbids, part.prefer) ? lean : 1) : 0 }));
      if (!voices.some(e => e.w > 0)) { errors.push(`${role}[${i}]: no enabled candidate satisfies its family and properties`); return; }
      // A part's own windows say what plays it; the lane's texture rule is
      // for the lane's ordinary draw and does not follow the part (a pinned
      // hand row plays its membranes on any texture), and nor does the level
      // the lane's own sixteenths take behind the drone: a hand phrase is
      // levelled by its own character.
      const { withdraw: _ordinaryOnly, presence: _ordinaryLevel, ...lane } = base;
      lanes.push({ lane: { ...lane, id: `${namespace}:${role}:${i}`, figure: 'recipeRhythm', slot: null, voices }, part });
    });
  }
  // A partial cell set is not the requested groove; refuse it as a unit.
  return { lanes: errors.length ? [] : lanes, errors };
}

export function withRhythm(lanes: readonly Lane[], rhythm: readonly RhythmLane[]): readonly Lane[] {
  if (!rhythm.length) return lanes;
  const replaced = new Set(rhythm.map(r => r.lane.role));
  const seen = new Set<string>();
  return lanes.flatMap(l => {
    if (!replaced.has(l.role)) return [l];
    if (seen.has(l.role)) return [];
    seen.add(l.role);
    return rhythm.filter(r => r.lane.role === l.role).map(r => r.lane);
  });
}
