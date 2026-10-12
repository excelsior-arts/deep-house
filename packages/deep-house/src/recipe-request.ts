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
import { PLAYED_KINDS } from './treatment.ts';

export type Accompaniment = 'base' | 'auto';
/** One URL/API switch shared by live planning and tools. */
export function accompanimentFor(opts: { accompaniment?: Accompaniment; search?: string | null } = {}): Accompaniment {
  const value = opts.accompaniment ?? linkValue('accompaniment', opts.search === undefined ? undefined : opts.search ?? '') ?? 'base';
  if (value !== 'base' && value !== 'auto') throw new Error(`Unknown accompaniment mode: ${value}`);
  return value;
}

/**
 * **What a scope's player performs** (R04 of the review of 10-03): the
 * fields a pinned section or treatment row is played by. Anything else a row
 * carries with content is stored and not played, and a request for it is
 * refused with the reason rather than auditioned as if it had been heard — the
 * way the motif and layer branches below already refuse what they do not
 * play. A section is played by its block and its kind (and drawn by its
 * weight); a treatment by its figure, its kind, its place, its bird box and
 * tempo window (round M1's admission) and its weight. Scoped exclusion — what
 * a local row's `forbids` would remove, and over which span — is not decided
 * yet, so it is refused for both.
 */
export const PERFORMED: Readonly<Record<'section' | 'treatment', readonly string[]>> = Object.freeze({
  section: Object.freeze(['section', 'applies', 'weight']),
  treatment: Object.freeze(['figure', 'applies', 'place', 'birds', 'tempo', 'weight']),
});
/** The fields with a musical meaning somewhere, which a scope must perform before it may carry them. */
const MUSICAL = ['wants', 'forbids', 'birds', 'tempo', 'place', 'figure', 'section', 'placement'] as const;
const WHY: Record<string, string> = {
  wants: 'wishes are read only by a whole theme, a part or a motif',
  forbids: 'a local exclusion needs a span and an owner, which no player has yet',
  birds: 'a section is drawn by its place, not by a bird box',
  tempo: 'a section is drawn by its place, not by a tempo window',
  place: 'a section is placed by the form',
  placement: 'role claims belong to parts',
  figure: 'a figure belongs to a treatment',
  section: 'a section block belongs to a section row',
};
const filled = (v: unknown) => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : typeof v === 'object' ? Object.keys(v as object).length > 0 : true);
/** The fields a section or treatment row carries with content and its player does not perform, each with its reason. */
export function unperformed(recipe: Recipe): string[] {
  const scope = recipe.scope as 'section' | 'treatment';
  const performed = PERFORMED[scope];
  if (!performed) return [];
  return MUSICAL.filter((k) => !performed.includes(k) && filled((recipe as unknown as Record<string, unknown>)[k]))
    .map((k) => `${k} (${WHY[k]})`);
}
function refuseUnperformed(recipe: Recipe): void {
  const not = unperformed(recipe);
  if (not.length) throw new Error(`Recipe ${recipe.id}: a ${recipe.scope} row plays ${PERFORMED[recipe.scope as 'section' | 'treatment'].join(', ')} and cannot audition ${not.join('; ')}`);
}

export function recipeRequest(recipe?: Recipe | null, accompaniment: Accompaniment = 'base'):
  { track: Recipe | null; motif: MotifFamily | null; pin: PartPin | null; treatment: Recipe | null; section: Recipe | null } {
  const empty = { track: null, motif: null, pin: null, treatment: null, section: null };
  if (!recipe) return empty;
  // **A section row pinned** (round T2, `src/sections.ts`) plays for its kind
  // on every section of that kind the form draws, wherever the theme is and
  // whatever the place prefers: the audit of a pattern. A listener's mark of
  // a section (no block) is a note, not a pattern, and says so.
  if (recipe.scope === 'section') {
    if (!recipe.section) throw new Error(`Recipe ${recipe.id}: a section row needs a section block to play`);
    refuseUnperformed(recipe);
    return { ...empty, section: recipe };
  }
  // **A treatment row pinned** (round T1, `src/treatment.ts`) is laid on every
  // bar its kind's rule admits, over the house's or the link's spell: the
  // audit of a figure. Only a kind the mechanism plays; a lead-in or a solo
  // row is stored for the plan's later steps and says so.
  if (recipe.scope === 'treatment') {
    if (!recipe.figure) throw new Error(`Recipe ${recipe.id}: a treatment needs a figure`);
    if (!(PLAYED_KINDS as readonly string[]).includes(recipe.applies ?? ''))
      throw new Error(`Recipe ${recipe.id}: ${recipe.applies} treatments are not played yet (PLAN-TREATMENTS)`);
    refuseUnperformed(recipe);
    return { ...empty, treatment: recipe };
  }
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
