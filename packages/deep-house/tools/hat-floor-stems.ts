// Lab tool (round hat-floor): the plan's read of the highs family by family against stem renders (`tools/hat-top-render.ts --stems`).
//   node tools/hat-floor-stems.ts --rows <stems.jsonl>
import fs from 'node:fs';
import { planOf, coordinateOf } from './like/features.ts';
import { biasFor } from '../src/spell.ts';
import { familyOf } from './hat-top-features.ts';
import { planTops } from './hat-floor-check.ts';
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const pw = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? 10 * Math.log10(v.reduce((a, x) => a + Math.pow(10, x / 10), 0) / v.length) : null; };
import { TOP_LANES } from '../src/top-lanes.ts';
delete (TOP_LANES.level as any).floor;
const rows = fs.readFileSync(arg('rows')!, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const acc: Record<string, { k: number[]; hi: number[] }> = {};
for (const r of rows) {
  if (r.error) continue;
  const c = coordinateOf(r.link); const { track } = planOf(c) as any; const birds = biasFor(c.spell, track.style).spell;
  const [a, z] = r.spans[0]; const t = r.trimDb ?? 0;
  const line: string[] = [];
  for (const [f, st] of Object.entries(r.stems) as any) {
    const rk = pw(st.kw.slice(a, z)), rh = pw(st.hi.slice(a, z));
    if (rk == null || rh == null || rk < -100) continue;
    const P = planTops(track, birds, a, z, { pick: (e) => familyOf(e) === f }).rest;
    if (!P) { line.push(`${f}: no plan`); continue; }
    const dk = P.k + t - rk, dh = P.hi + t - rh;
    (acc[f] ??= { k: [], hi: [] }).k.push(dk); acc[f].hi.push(dh);
    line.push(`${f} k${dk >= 0 ? '+' : ''}${dk.toFixed(1)} hi${dh >= 0 ? '+' : ''}${dh.toFixed(1)} (${rh.toFixed(0)})`);
  }
  console.log(`${r.name}: ${line.join('  ')}`);
}
for (const [f, x] of Object.entries(acc)) { const m = (v: number[]) => (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1); console.log(`${f}: n ${x.k.length} k ${m(x.k)} hi ${m(x.hi)}`); }
