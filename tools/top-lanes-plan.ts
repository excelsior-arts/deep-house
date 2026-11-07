// top-lanes (11-02): what the lanes' own turns lay on a link, read off the plan (no audio): the theme's draw (the lean,
// the pairs, the ghosts' column, the wash), and the top lanes' hits with their pans, levels and room sends.
//   node tools/top-lanes-plan.ts <link or featured name> [...] [--bars a-b]
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const args = process.argv.slice(2);
const bi = args.indexOf('--bars');
const [b0, b1] = bi >= 0 ? args[bi + 1].split('-').map(Number) : [-1, -1];
const names = new Map<string, string>();
for (const p of FEATURED as any[]) p.links.forEach((l: string, i: number) => names.set(l, `${p.name} - ${p.labels[i]}`));
const byName = (x: string) => [...names].find(([, n]) => n.toLowerCase() === x.toLowerCase())?.[0] ?? x;
for (const a of args.filter((x, i) => !x.startsWith("--") && (bi < 0 || i !== bi + 1))) {
  const link = byName(a);
  const { plan } = quiet(() => played(link)) as any;
  const pr: any = quiet(() => programOf(plan));
  console.log(`\n${names.get(link) ?? link}  ${pr.bpm.toFixed(1)} BPM  ${plan.arrangement.sections.map((s: any) => `${s.kind}@${s.startBar}+${s.bars}`).join(' ')}`);
  console.log('  top lanes:', plan.topLanes ? JSON.stringify(plan.topLanes) : '(none)');
  const top = pr.events.filter((e: any) => e.layer === 'hats' || e.layer === 'shaker');
  const by: Record<string, { n: number; pans: Set<number>; room: Set<number>; dry: Set<number> }> = {};
  for (const e of top) { const k = `${e.voice}${e.part ? '|' + e.part : ''}`; const o = (by[k] ||= { n: 0, pans: new Set(), room: new Set(), dry: new Set() }); o.n++; o.pans.add(+(e.p.pan ?? 0).toFixed(2)); if (e.p.room != null) o.room.add(e.p.room); if (e.p.dry != null) o.dry.add(e.p.dry); }
  for (const [k, o] of Object.entries(by)) console.log(`  ${k.padEnd(36)} ${String(o.n).padStart(5)} hits  pans ${o.pans.size} [${[...o.pans].sort((x, y) => x - y).slice(0, 8).join(' ')}${o.pans.size > 8 ? ' …' : ''}]  room ${[...o.room].join(' ') || '-'}  dry ${[...o.dry].join(' ') || '-'}`);
  console.log('  kit room floor', pr.settings.space?.kitRoom, 'room s', pr.settings.sends?.roomSeconds);
  if (b0 >= 0) for (let b = b0; b <= b1; b++) {
    const row = top.filter((e: any) => e.bar === b).sort((x: any, y: any) => x.step - y.step);
    console.log(`  bar ${b}: ` + row.map((e: any) => `${e.voice[0]}${e.voice.slice(-5)}@${e.step}:${(+e.p.vel).toFixed(2)}${e.p.pan ? (e.p.pan > 0 ? 'R' : 'L') + Math.abs(e.p.pan).toFixed(2) : ''}`).join(' '));
  }
}
