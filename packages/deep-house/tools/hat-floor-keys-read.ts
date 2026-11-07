// Lab tool (round hat-floor): the plan's read of each voice of a groove beside its render inside the theme
// (`tools/hat-floor-keys.ts`), K-weighted and above 3 kHz, for the table's in-a-groove step. Numbers only.
//   node tools/hat-floor-keys-read.ts --rows <keys.jsonl> --out <json>
import fs from 'node:fs';
import { planOf, coordinateOf } from './like/features.ts';
import { TOP_LANES } from '../src/top-lanes.ts';
import { biasFor } from '../src/spell.ts';
import { topsKeyOf } from '../src/tops-read.ts';
import { planTops } from './hat-floor-check.ts';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
delete (TOP_LANES.level as any).floor;
const rows = fs.readFileSync(arg('rows')!, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out: any[] = [];
for (const r of rows) {
  const c = coordinateOf(r.link); const { track } = planOf(c) as any; const birds = biasFor(c.spell, track.style).spell;
  for (const g of r.grooves) for (const [key, v] of Object.entries(g.reads) as Array<[string, any]>) {
    if (v.k < -100) continue;
    const P = planTops(track, birds, g.startBar, g.startBar + g.bars, { pick: (e) => topsKeyOf(e) === key }).rest;
    out.push({ name: r.name, at: g.startBar, kind: g.kind, key, render: v, plan: P ? { k: +(P.k + r.trimDb).toFixed(2), hi: +(P.hi + r.trimDb).toFixed(2) } : null });
  }
}
fs.writeFileSync(arg('out')!, JSON.stringify(out));
console.log(`${out.length} voice reads over ${rows.length} links`);
