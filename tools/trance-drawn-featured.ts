// trance-drawn (11-04): what moves among the featured tracks. Each featured link planned on this branch: does the corner's
// rule write it (the plan's `tranceDrawn`), how far it stands from the corner's nearest tile, and is its program the same
// as with the rule off (the theme as the place lays it, today's).
//   node tools/trance-drawn-featured.ts
import fs from 'node:fs';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { placeDistance } from '../packages/deep-house/src/places.ts';
import { places } from '../packages/deep-house/src/styles/deep-house-places.ts';
import { HOUSE } from '../packages/deep-house/src/spell.ts';

const feat = JSON.parse(fs.readFileSync(new URL('../packages/deep-house/src/featured.json', import.meta.url), 'utf8'));
const corner = (places.hook ?? []).filter((e: any) => ['saw-corner', 'saw-corner-dark', 'saw-corner-bright'].includes(e.id));
let moved = 0;
for (const p of feat.playlists) p.links.forEach((l: string, i: number) => {
  const read = linkRead(`?${l}`); const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  const o = { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development };
  const on = planTheme(seed, L.theme, o as never) as any, off = planTheme(seed, L.theme, { ...o, trance: 'off' } as never) as any;
  const spell = { ...HOUSE, ...cast.spell };
  const near = corner.map((e: any) => placeDistance(e.place, spell, on.bpm)).sort((a: number, b: number) => a - b)[0];
  const same = JSON.stringify(programOf(on)) === JSON.stringify(programOf(off));
  if (!same) moved++;
  console.log(`${`${p.name} - ${p.labels[i]}`.padEnd(30)} ${String(on.bpm).padStart(4)} BPM  corner ${near.toFixed(2)}  ${on.tranceDrawn ? 'WRITTEN ' + JSON.stringify(on.tranceDrawn) : 'not in the radius'}  ${same ? 'program the same' : 'PROGRAM MOVES'}`);
});
console.log(moved, 'featured programs move');
