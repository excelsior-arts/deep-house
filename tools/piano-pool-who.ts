// piano-pool (11-01), scratch: which featured tracks (and digest rows) play an acoustic piano voice, which one, how many notes.
//   node tools/piano-pool-who.ts [--digest]
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';
import { BY_NAME } from '../packages/engine/src/voices/index.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const PIANOS = new Set(Object.values(BY_NAME as Record<string, any>).filter((v: any) => v.row && (v.row.topology === 'piano' || v.row.topology === 'bright-piano')).map((v: any) => v.row.id));
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const { plan } = quiet(() => played(link));
  const counts: Record<string, number> = {};
  for (const e of (plan as any).events) if (PIANOS.has(e.voice)) counts[e.voice] = (counts[e.voice] ?? 0) + 1;
  if (!Object.keys(counts).length) return;
  console.log(`${p.name} - ${p.labels[i]}`, '|', Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '), '|', link);
});
