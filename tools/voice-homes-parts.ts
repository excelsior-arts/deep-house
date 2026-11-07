// voice-homes round 2 (11-01), scratch: each featured piano part's rhythm, block by block (eight bars): onsets a
// sounding bar, the median written length in beats, the share of onsets on the eighth grid, the velocity's spread,
// and Ember.  node tools/voice-homes-parts.ts
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';
import { homeOf } from '../packages/deep-house/src/stereo-stage.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const { plan } = quiet(() => played(link));
  const program: any = programOf(plan);
  const ev = program.events.filter((e: any) => homeOf(e.voice) && e.layer === 'keys');
  if (!ev.length) return;
  const bs = program.barSeconds, beat = bs / 4;
  const blocks = new Map<number, any[]>();
  for (const e of ev) { const b = Math.floor(Math.floor(e.t / bs + 1e-6) / 8); (blocks.get(b) ?? blocks.set(b, []).get(b))!.push(e); }
  const rows = [...blocks].map(([b, l]) => {
    const bars = new Set(l.map((e) => Math.floor(e.t / bs + 1e-6))).size, on = [...new Set(l.map((e) => +e.t.toFixed(3)))];
    const grid = on.filter((t) => Math.abs(t / (beat / 2) - Math.round(t / (beat / 2))) < 0.08).length / on.length;
    return `${b * 8}:${(on.length / bars).toFixed(1)}/${(med(l.map((e) => e.p.dur ?? 0)) / beat).toFixed(2)}b/${grid.toFixed(2)}g/${med(l.map((e) => e.p.ring ?? -1)).toFixed(2)}r`;
  });
  console.log(`${p.name} - ${p.labels[i]} ember ${(plan as any).bias?.spell?.ember ?? (plan as any).spell?.ember ?? '-'} |`, rows.join(' '));
});
