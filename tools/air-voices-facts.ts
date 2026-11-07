// air-voices (11-02), scratch: the featured deep tracks' form and parts, to place the air sketches.
//   node tools/air-voices-facts.ts [label ...]
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const want = process.argv.slice(2);
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const name = `${p.name} - ${p.labels[i]}`;
  if (want.length && !want.some((w) => name.includes(w))) return;
  const { plan } = quiet(() => played(link)) as any;
  const program: any = programOf(plan);
  const bs = program.barSeconds;
  const secs = plan.arrangement.sections.map((s: any) => `${s.kind}@${s.startBar}+${s.bars}`).join(' ');
  const byVoice: Record<string, { n: number; bars: Set<number>; layer: string }> = {};
  for (const e of program.events) { const k = `${e.layer}/${e.voice}${e.p?.timbre ? ':' + e.p.timbre : ''}`; (byVoice[k] ||= { n: 0, bars: new Set(), layer: e.layer }).n++; byVoice[k].bars.add(Math.floor(e.t / bs + 1e-6)); }
  console.log(`\n## ${name} | ${link}\n bpm ${program.bpm.toFixed(1)} bar ${bs.toFixed(3)}s bars ${plan.bars} | ${secs}`);
  for (const [k, v] of Object.entries(byVoice).sort()) { const b = [...v.bars].sort((x, y) => x - y); console.log(`  ${k}: ${v.n} ev, bars ${b[0]}-${b[b.length - 1]} (${b.length})`); }
});
