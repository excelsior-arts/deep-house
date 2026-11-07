// voice-homes (11-01), scratch: which featured tracks play a voice with a home (the piano), how many notes, how dense.
//   node tools/voice-homes-featured.ts
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';
import { homeOf } from '../packages/deep-house/src/stereo-stage.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const { plan } = quiet(() => played(link));
  const program: any = programOf(plan);
  const ev = program.events.filter((e: any) => homeOf(e.voice));
  if (!ev.length) return;
  const bars = new Set(ev.map((e: any) => Math.floor(e.t / program.barSeconds))).size, onsets = new Set(ev.map((e: any) => e.t.toFixed(3))).size;
  const seats = ev.map((e: any) => e.p.seat ?? 0);
  console.log(`${p.name} - ${p.labels[i]}`, '|', [...new Set(ev.map((e: any) => e.voice))].join(','), 'notes', ev.length, 'onsets/bar', (onsets / bars).toFixed(2), 'tide', (plan as any).bias?.spell?.tide ?? '-', 'seats', Math.min(...seats).toFixed(2), Math.max(...seats).toFixed(2), 'front', !!program.settings.returns?.front, 'body', !!program.settings.returns?.body, '|', link);
});
