// Playback admission is narrower than storage. Never interpret a local scope
// as a whole-track wish merely because the schema can preserve it.
import { linkValue } from './link-table.ts';
import { placementProblems } from './recipe-placement.ts';
import type { Recipe } from './recipe.ts';
import { familyOf, type MotifFamily } from './motif.ts';
import { motifWants, bassFigureProblems } from './parts/validation.ts';
import { RHYTHM_ROLES } from './parts/rhythm.ts';
import type { PartRequest } from './parts/types.ts';
import type { PartPin } from './composition-policy.ts';

export type Accompaniment = 'base' | 'auto';
/** One URL/API switch shared by live planning and tools. */
export function accompanimentFor(opts: { accompaniment?: Accompaniment; search?: string | null } = {}): Accompaniment {
  const value = opts.accompaniment ?? linkValue('accompaniment', opts.search === undefined ? undefined : opts.search ?? '') ?? 'base';
  if (value !== 'base' && value !== 'auto') throw new Error(`Unknown accompaniment mode: ${value}`);
  return value;
}

export function recipeRequest(recipe?: Recipe | null, accompaniment: Accompaniment = 'base'):
  { track: Recipe | null; motif: MotifFamily | null; pin: PartPin | null } {
  const empty = { track: null, motif: null, pin: null };
  if (!recipe) return empty;
  if (recipe.scope === 'track') {
    if (accompaniment === 'auto') throw new Error(`Recipe ${recipe.id}: a complete arrangement cannot receive automatic overlays; extract a part first`);
    return { ...empty, track: recipe };
  }
  if (recipe.scope === 'layer' && accompaniment === 'auto') {
    if (recipe.forbids?.length || Object.keys(recipe.birds || {}).length)
      throw new Error(`Recipe ${recipe.id}: local bird boxes and exclusions need scoped placement`);
    const role = recipe.applies;
    if (!role || !['bassline', 'figure', ...RHYTHM_ROLES].includes(role))
      throw new Error(`Recipe ${recipe.id}: no part player for ${role}`);
    const wants = recipe.wants || {}, parts: PartRequest = {};
    for (const block of Object.keys(wants)) {
      if (!['figures','rhythm','tone','ambience','presence'].includes(block))
        throw new Error(`Recipe ${recipe.id}: layer cannot apply ${block} outside its role`);
      const value = wants[block];
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, role))
        throw new Error(`Recipe ${recipe.id}: ${block} must address only ${role}`);
      if (block === 'figures') {
        if (role === 'figure') {
          const figures = Array.isArray(value.figure) ? value.figure : [value.figure];
          if (figures.length !== 1) throw new Error(`Recipe ${recipe.id}: select one figure part`);
          parts.struckFigures = figures;
        } else if (role === 'bassline') {
          const bad = bassFigureProblems(value.bassline);
          if (bad.length) throw new Error(`Recipe ${recipe.id}: ${bad.join('; ')}`);
          if (value.bassline.articulation === 'legato') parts.bassMotif = value.bassline.motif;
          else parts.heldBass = true;
        } else throw new Error(`Recipe ${recipe.id}: percussion requires a rhythm cell`);
      } else Object.assign(parts, { [block]: value });
    }
    if (!parts.struckFigures && !parts.bassMotif && !parts.heldBass && !parts.rhythm)
      throw new Error(`Recipe ${recipe.id}: a layer needs a playable phrase or rhythm cell`);
    if (recipe.placement) {
      const bad = placementProblems(recipe.placement);
      if (!Number.isSafeInteger(recipe.revision) || recipe.revision! < 1 || bad.length || recipe.placement.roles.length !== 1 || recipe.placement.roles[0] !== role)
        throw new Error(`Recipe ${recipe.id}: invalid placement claims ${bad.join('; ')}`);
    }
    return { ...empty, pin: { id: recipe.id, role, request: parts,
      ...(recipe.placement ? { source: { id: recipe.id, revision: recipe.revision!, ...recipe.placement } } : {}) } };
  }
  if (recipe.scope !== 'motif') throw new Error(`Recipe ${recipe.id}: ${recipe.scope} playback is not implemented`);
  const motif = familyOf(recipe);
  if (!motif) throw new Error(`Recipe ${recipe.id}: missing motif family or register`);
  const problems: string[] = [];
  motifWants(motif.box, message => problems.push(message));
  if (problems.length) throw new Error(`Recipe ${recipe.id}: ${problems.join('; ')}`);
  const extra = Object.keys(recipe.wants || {}).filter(key => key !== 'motif');
  if (extra.length || recipe.forbids?.length || Object.keys(recipe.birds || {}).length) {
    throw new Error(`Recipe ${recipe.id}: motif playback supports the phrase family only; local bird, exclusion and other wishes need scoped placement`);
  }
  return { ...empty, motif, pin: accompaniment === 'auto' ? {
    id: recipe.id, role: motif.register === 'bass' ? 'bassline' : 'figure', request: {},
    ...(motif.register !== 'bass' ? { usage: { upperParts: 1, sparseUpper: 1 } } : {}),
  } : null };
}
