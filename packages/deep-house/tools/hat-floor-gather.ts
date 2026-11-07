// Lab tool (round hat-floor): which voices play in grooves, at which pitches, with which note parameters, over a sample
// of links (the featured, the Map's places, house seeds). What `tools/hat-floor-table.ts` probes each voice with.
//   node tools/hat-floor-gather.ts [--featured] [--grid 1-1] [--house 1-20] --out <json>
import fs from 'node:fs';
import { planOf, coordinateOf } from './like/features.ts';
import { SKY_DOTS, SKY_PLACES } from '../src/sky.ts';
import { linkWrite } from '../src/link.ts';
import { isKitHat } from '../src/top-lanes.ts';
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
export function linksOf(o: { featured?: boolean; grid?: string | null; house?: string | null; dots?: boolean }): Array<[string, string]> {
  const jobs: Array<[string, string]> = [];
  if (o.featured) {
    const F = JSON.parse(fs.readFileSync(new URL('../src/featured.json', import.meta.url), 'utf8'));
    for (const p of F.playlists) p.links.forEach((l: string, i: number) => jobs.push([`${p.name} - ${p.labels[i]}`, l]));
  }
  if (o.house) { const [a, b] = o.house.split('-').map(Number); for (let s = a; s <= b; s++) jobs.push([`house seed ${s}`, `seed=${s}&v=2`]); }
  if (o.grid) { const [a, b] = o.grid.split('-').map(Number);
    for (const p of SKY_PLACES) for (const s of [{ n: 'star', spell: p.spell }, ...(o.dots ? SKY_DOTS.filter((d) => d.star === p.id).map((d) => ({ n: `dot ${d.n}`, spell: d.spell })) : [])])
      for (let k = a; k <= b; k++) jobs.push([`${p.name} ${s.n} seed ${k}`, linkWrite({ seed: String(k), theme: 0, strategy: 'house-v2', spell: s.spell } as never)]); }
  return jobs;
}
/** The key a voice is tabled by: the voice and the timbre or preset its note names (the pad's strings, the keys' rhodes). */
export const keyOf = (e: { voice: string; p?: Record<string, unknown> }): string => {
  const n = e.p?.timbre ?? e.p?.preset;
  return typeof n === 'string' && n !== e.voice ? `${e.voice}|${n}` : e.voice;
};
async function main() {
  const jobs = linksOf({ featured: process.argv.includes('--featured'), grid: arg('grid'), house: arg('house'), dots: process.argv.includes('--dots') });
  const K: Record<string, any> = {};
  for (const [name, link] of jobs) {
    let t: any;
    try { t = (planOf(coordinateOf(link)) as any).track; } catch (e) { console.log(name, 'FAILED', String(e).slice(0, 200)); continue; }
    const groove = new Set<number>();
    for (const s of t.arrangement.sections) if (s.kind === 'main' || s.kind === 'drop') for (let b = s.startBar; b < s.startBar + s.bars; b++) groove.add(b);
    for (const e of t.events) {
      if (!groove.has(Math.floor(e.t / t.barSeconds + 1e-6))) continue;
      const k = keyOf(e);
      const a = K[k] ??= { voice: e.voice, layer: e.layer, n: 0, links: new Set(), midi: [], dur: [], vel: [], kit: isKitHat(e), p: null };
      a.n++; a.links.add(name);
      if (typeof e.p?.midi === 'number') a.midi.push(e.p.midi);
      if (Array.isArray(e.p?.notes)) for (const m of e.p.notes) if (typeof m === 'number') a.midi.push(m);
      if (typeof e.p?.dur === 'number') a.dur.push(e.p.dur);
      a.vel.push(Number(e.p?.vel ?? 1));
      if (!a.p) a.p = e.p;
    }
  }
  const q = (xs: number[], f: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
  const out: Record<string, any> = {};
  for (const [k, a] of Object.entries(K)) out[k] = { voice: a.voice, layer: a.layer, kit: a.kit, n: a.n, links: a.links.size,
    midi: a.midi.length ? [q(a.midi, 0.02), q(a.midi, 0.5), q(a.midi, 0.98)] : null, dur: a.dur.length ? [q(a.dur, 0.1), q(a.dur, 0.5), q(a.dur, 0.9)] : null,
    vel: [q(a.vel, 0.1), q(a.vel, 0.5), q(a.vel, 0.9)], p: a.p };
  fs.writeFileSync(arg('out')!, JSON.stringify({ links: jobs.length, keys: out }, null, 1));
  console.log(`${Object.keys(out).length} voice keys over ${jobs.length} links`);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
