// tops-bus (11-02): the tops bus's moves per featured deep track (and any links given), with the verdicts
import fs from 'node:fs';
import { played } from '../packages/deep-house/tools/link-digest.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const deep = JSON.parse(fs.readFileSync(new URL('./tops-bus-deep.json', import.meta.url), 'utf8'));
const extra = process.argv.slice(2).map((l) => ({ name: l, link: l }));
for (const t of extra.length ? extra : deep) {
  const { plan } = quiet(() => played(t.link)) as any;
  const T = plan.automation.tops;
  const sp = plan.dice?.spell ?? {};
  console.log(`\n${t.name}  bpm ${plan.bpm}  ${plan.arrangement.sections.map((s: any) => `${s.kind}@${s.startBar}+${s.bars}`).join(' ')}  layers ${T?.layers?.join(',') ?? '-'}`);
  for (const m of T?.moves ?? []) console.log(`   ${m.laid ? 'LAID' : '    '} ${m.kind}/${m.shape} ${m.from}->${m.line}${m.hz ? ' ' + m.hz + 'Hz' : ''}${m.db != null ? ` +${m.db}dB base ${m.base}` : ''}${m.step != null ? ' step ' + m.step : ''}  ${m.why}`);
}
