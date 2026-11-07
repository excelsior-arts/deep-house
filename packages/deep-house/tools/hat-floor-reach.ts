// Lab tool (round hat-floor): which themes the floor moves, and by what. Each link planned with the row's floor and
// without it; the kit's hats' lift, the plan's read of the hats against the rest above 3 kHz, the ceiling's cut.
//   node tools/hat-floor-reach.ts [--featured] [--house 1-200] [--grid 1-4] [--all]
import { planOf, coordinateOf } from './like/features.ts';
import { TOP_LANES } from '../src/top-lanes.ts';
import { linksOf } from './hat-floor-gather.ts';
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const F = (TOP_LANES.level as any).floor;
const jobs = linksOf({ featured: process.argv.includes('--featured'), house: arg('house'), grid: arg('grid'), dots: process.argv.includes('--dots') });
let moved = 0, n = 0;
for (const [name, link] of jobs) {
  (TOP_LANES.level as any).floor = F; const a = (planOf(coordinateOf(link)) as any).track;
  delete (TOP_LANES.level as any).floor; const b = (planOf(coordinateOf(link)) as any).track;
  (TOP_LANES.level as any).floor = F;
  const diff = a.events.filter((e: any, i: number) => JSON.stringify(e) !== JSON.stringify(b.events[i])).length;
  const L = a.topLanes ?? {};
  if (L.ceilingDb != null) n++;
  if (diff) moved++;
  if (diff || process.argv.includes('--all')) console.log(`${name}: ${diff} events; bpm ${a.bpm}; hats over the rest above 3 kHz ${L.hatTopDb ?? '-'} (plan); lift ${L.hatLiftDb ?? '-'} dB; the ceiling's cut ${b.topLanes?.hatCutDb ?? '-'}`);
}
console.log(`${moved} of ${jobs.length} moved (${n} under the ceiling)`);
