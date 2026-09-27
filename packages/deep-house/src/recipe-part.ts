// Compile shipped musical data into the same contract used by ordinary parts.
// No style or library import here: a style explicitly admits a recipe.
import type { Recipe } from './recipe.ts';
import type { PartVariant } from './composition-policy.ts';
import { placementProblems } from './recipe-placement.ts';
import { recipeRequest } from './recipe-request.ts';

export function partFromRecipe(recipe: Recipe): Pick<PartVariant, 'request' | 'source'> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.id)
    || /^(study|attempt|test)\//.test(recipe.id))
    throw new Error('Catalogue recipes require a permanent collection/musical-name ID');
  const bad = placementProblems(recipe.placement);
  if (bad.length) throw new Error(`Recipe ${recipe.id}: ${bad.join('; ')}`);
  // Multi-role bundles and section/seam placement still need players. Do not
  // flatten one to a track, or silently select only one of its components.
  if (recipe.scope !== 'layer') throw new Error(`Recipe ${recipe.id}: catalogue parts currently require a layer`);
  const pin = recipeRequest(recipe, 'auto').pin!;
  if (recipe.placement!.roles.length !== 1 || recipe.placement!.roles[0] !== pin.role)
    throw new Error(`Recipe ${recipe.id}: placement claims must match its playable role`);
  return { request: pin.request, source: { id: recipe.id, revision: recipe.revision!, ...recipe.placement! } };
}
