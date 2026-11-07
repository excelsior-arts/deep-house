// Lab tool (round hat-floor): what the floor's read (`hatsTopOverRest`) costs the planner, per theme.
import { planOf, coordinateOf } from './like/features.ts';
import { hatsTopOverRest } from '../src/set-plan.ts';
import { biasFor } from '../src/spell.ts';
import { linksOf } from './hat-floor-gather.ts';
const jobs = linksOf({ featured: true, house: '1-20' });
const T = jobs.map(([, l]) => { const c = coordinateOf(l); const { track } = planOf(c) as any; return { track, birds: biasFor(c.spell, track.style).spell }; }).filter((x) => x.track.topLanes?.ceilingDb != null);
let n = 0; const t0 = performance.now();
for (let k = 0; k < 3; k++) for (const x of T) { hatsTopOverRest(x.track, x.track.style, x.birds); n++; }
console.log(`the floor's read: ${((performance.now() - t0) / n).toFixed(1)} ms a theme (${T.length} themes under the ceiling)`);
