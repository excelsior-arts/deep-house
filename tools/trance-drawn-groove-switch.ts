// trance-drawn pass 2 (11-04): the groove sketch's switch read as the page reads it: `groove=uplifting` through
// `readBypass` and `applyBypass`, nothing at all without the private tier; the kit's voices counted.
//   node tools/trance-drawn-groove-switch.ts '<link query with groove=uplifting>'
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { readBypass, applyBypass } from '../packages/deep-house/src/set-plan.ts';
const q = process.argv[2];
const plan = () => { const read = linkRead(`?${q}`); const L = read.link; const cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search: `?${read.search}` });
  return planTheme(L.seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track } as never) as any; };
const count = (t: any) => { const m: Record<string, number> = {}; for (const e of t.events) if (['hats', 'clap', 'kick', 'shaker'].includes(e.layer)) m[`${e.layer}:${e.voice}`] = (m[`${e.layer}:${e.voice}`] ?? 0) + 1; return JSON.stringify(m); };
console.log('release tier:', readBypass(`?${q}`)?.label ?? 'nothing read');
(globalThis as any).__PRIVATE_TOOLS__ = true;
const b = readBypass(`?${q}`);
console.log('private tier:', b?.label, count(applyBypass(plan(), b)));
