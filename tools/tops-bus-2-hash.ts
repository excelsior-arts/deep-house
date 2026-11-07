// tops-bus-2 (11-02), scratch: a hash of every featured link's compiled program (events, settings, automation) in a
// tree given as the argument, to compare a branch against `local`:
//   node tools/tops-bus-2-hash.ts <tree root> > out.txt   (then diff two outputs)
import crypto from 'node:crypto';
const root = process.argv[2];
const { played } = await import(`${root}/packages/deep-house/tools/link-digest.ts`);
const { programOf } = await import(`${root}/packages/deep-house/src/performance.ts`);
const { FEATURED } = await import(`${root}/packages/deep-house/src/featured.ts`);
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const h = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12);
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const { plan } = quiet(() => played(link)) as any;
  const pr: any = programOf(plan);
  console.log(`${p.name} - ${p.labels[i]} | events ${pr.events.length} ${h(pr.events)} | settings ${h(pr.settings)} | automation ${h(pr.automation)}`);
});
