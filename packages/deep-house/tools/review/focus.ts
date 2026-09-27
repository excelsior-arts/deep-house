// The small, repeatable style-review matrix. These are scenarios to inspect,
// not generation presets or claims that every roll is musically approved.
import { HOUSE, BIRDS, type Spell } from '../../src/spell.ts';
import { linkAt } from '../../src/link.ts';

export const FOCUS_SCENARIOS = [
  { id: 'home', label: 'Home', spell: { ...HOUSE } },
  { id: 'space', label: 'Warm and spacious', spell: { ...HOUSE, tide: .78, loom: .75 } },
  { id: 'ambient', label: 'Sparse and drumless', spell: { ...HOUSE, ember: .1, tide: .78, loom: .75 } },
  { id: 'movement', label: 'Moderate movement', spell: { ...HOUSE, spark: .52, gleam: .6 } },
  { id: 'faster', label: 'Faster straight groove', spell: { ...HOUSE, ember: .85 } },
  { id: 'broken', label: 'Faster broken groove', spell: { ...HOUSE, ember: .85, spark: .52, gleam: .6 } },
];

/** base points to a retained build, not a dev server that changes under a link. */
export function machineLink(base: string, place: { seed: string; spell: Spell; theme: number; fromBar: number; strategy?: string }): string {
  if (!Number.isSafeInteger(place.theme) || place.theme < 0 || !Number.isSafeInteger(place.fromBar) || place.fromBar < 0)
    throw new Error('machine link requires a valid theme and bar');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('machine link requires an HTTP app');
  for (const bird of BIRDS) {
    const n = place.spell[bird];
    if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`invalid bird ${bird}`);
  }
  // The whole query is deliberate: no inherited recipe, mute or debug options.
  // Through the page's own writer (`src/link.ts`), with the bar a dev deep link
  // may carry and a player's link never does.
  url.search = linkAt({ seed: place.seed, theme: place.theme, strategy: place.strategy || 'house-v2', spell: place.spell }, place.fromBar);
  return url.href;
}
