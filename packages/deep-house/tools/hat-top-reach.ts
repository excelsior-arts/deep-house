// Lab tool (round hat-top): which themes the outro hold moves, and by what. Each link planned twice in this tree, with the
// row's `into` as it stands and with the outro taken out (round break-hats' reach), the break's hats compared.
//   node tools/hat-top-reach.ts [--featured] [--house 1-200] [--grid 1-4]
import fs from 'node:fs';
import { planOf, coordinateOf } from './like/features.ts';
import { BREAK_PULSE } from '../src/break-pulse.ts';
import { SKY_DOTS, SKY_PLACES } from '../src/sky.ts';
import { linkWrite } from '../src/link.ts';
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const H = BREAK_PULSE.level.hold as any; const KEY = arg('toggle', 'into')!; const NOW = H[KEY]; const OFF = KEY === 'into' ? ['main', 'drop'] : undefined;
const jobs: Array<[string, string]> = [];
if (process.argv.includes('--featured')) {
  const F = JSON.parse(fs.readFileSync(new URL('../src/featured.json', import.meta.url), 'utf8'));
  for (const p of F.playlists) p.links.forEach((l: string, i: number) => jobs.push([`${p.name} - ${p.labels[i]}`, l]));
}
if (arg('house')) { const [a, b] = arg('house')!.split('-').map(Number); for (let s = a; s <= b; s++) jobs.push([`house seed ${s}`, `seed=${s}&v=2`]); }
if (arg('grid')) { const [a, b] = arg('grid')!.split('-').map(Number);
  for (const p of SKY_PLACES) for (const s of [{ n: 'star', spell: p.spell }, ...SKY_DOTS.filter((d) => d.star === p.id).map((d) => ({ n: `dot ${d.n}`, spell: d.spell }))])
    for (let k = a; k <= b; k++) jobs.push([`${p.name} ${s.n} seed ${k}`, linkWrite({ seed: String(k), theme: 0, strategy: 'house-v2', spell: s.spell } as never)]); }
let moved = 0;
for (const [name, link] of jobs) {
  H[KEY] = NOW; const a = (planOf(coordinateOf(link)) as any).track;
  H[KEY] = OFF; const b = (planOf(coordinateOf(link)) as any).track;
  H[KEY] = NOW;
  const diff = a.events.filter((e: any, i: number) => JSON.stringify(e) !== JSON.stringify(b.events[i])).length;
  if (!diff && a.events.length === b.events.length) continue;
  moved++;
  const brk = (a.breakPulse?.breaks ?? []).filter((x: any, i: number) => x.heldDb !== (b.breakPulse?.breaks?.[i]?.heldDb ?? null));
  console.log(`${name}: ${diff} events; ${brk.map((x: any) => `break ${x.from}-${x.until} ${x.heldDb} dB`).join(', ')}`);
}
console.log(`${moved} of ${jobs.length} moved`);
