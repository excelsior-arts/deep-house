// air-voices (11-02), scratch: a hash of every featured link's compiled program (events and settings), to compare a
// branch against `local`: `node tools/air-voices-hash.ts > out.txt` in each tree, then diff.
import crypto from 'node:crypto';
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const { plan } = quiet(() => played(link)) as any;
  const pr: any = programOf(plan);
  const h = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12);
  console.log(`${p.name} - ${p.labels[i]} | events ${pr.events.length} ${h(pr.events)} | settings ${h(pr.settings)} | ${link}`);
});
