// top-form (11-02): what the top form lays on a link, read off the plan (no audio). Per link: the sections, the top
// form's summary, its sub-sections, the break's holder and slope, and an arc table of 8-bar blocks against the top lanes
// playing (the closed hat, the open hat, the sixteenths, the backbeat, the kick, the bass; a letter a lane, `.` none).
//   node tools/top-form-plan.ts <link> [<link> …] [--arc] [--json <out>]
import fs from 'node:fs';
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const args = process.argv.slice(2);
const arc = args.includes('--arc');
const jsonAt = args.indexOf('--json');
const out = jsonAt >= 0 ? args[jsonAt + 1] : null;
const names = new Map<string, string>();
for (const p of FEATURED as any[]) p.links.forEach((l: string, i: number) => names.set(l, `${p.name} - ${p.labels[i]}`));
const byName = (x: string) => [...names].find(([, n]) => n.toLowerCase() === x.toLowerCase())?.[0] ?? x;
const links = args.filter((a, i) => !a.startsWith('--') && (jsonAt < 0 || i !== jsonAt + 1)).map(byName);
const rows: any[] = [];
for (const link of links) {
  const { plan } = quiet(() => played(link)) as any;
  const pr: any = quiet(() => programOf(plan));
  const bars = plan.bars, bs = pr.barSeconds;
  const lanes: Record<string, (e: any) => boolean> = {
    K: (e) => e.layer === 'kick', B: (e) => e.layer === 'bass', C: (e) => e.layer === 'clap',
    H: (e) => e.layer === 'hats' && !/open/i.test(e.voice), O: (e) => e.layer === 'hats' && /open/i.test(e.voice),
    S: (e) => e.layer === 'shaker',
  };
  const at: Record<string, number[]> = Object.fromEntries(Object.keys(lanes).map((k) => [k, new Array(bars).fill(0)]));
  for (const e of pr.events) { const b = e.bar ?? Math.floor(e.t / bs); if (b < 0 || b >= bars) continue; for (const [k, f] of Object.entries(lanes)) if (f(e)) at[k][b]++; }
  const top = plan.topForm;
  const subs = (plan.timeline as any[]).filter((r) => r.sub).map((r) => `${r.bar}:${r.sub}`);
  const row = { link, name: names.get(link) ?? link, bpm: +pr.bpm.toFixed(1), bars, sections: plan.arrangement.sections.map((s: any) => `${s.kind}@${s.startBar}+${s.bars}${s.topOpens != null ? `(opens ${s.topOpens})` : ''}`).join(' '),
    top: top ?? null, at };
  rows.push(row);
  console.log(`\n${row.name}  ${row.bpm} BPM, ${bars} bars (${(bars * bs).toFixed(0)} s)\n  ${row.sections}\n  ${top?.summary ?? '(no top form)'}${top?.deep ? `\n  ${top.deep.summary}` : ''}`);
  if (arc) {
    console.log('  bars       section     ' + Object.keys(lanes).map((k) => k.padStart(4)).join('') + '   (hits a bar, mean over the block; 8-bar blocks from each section\'s start)   the small things and the top form');
    for (const sec of plan.arrangement.sections) for (let b = sec.startBar; b < sec.startBar + sec.bars; b += 8) {
      const z = Math.min(sec.startBar + sec.bars, b + 8);
      const cells = Object.keys(lanes).map((k) => { let n = 0; for (let x = b; x < z; x++) n += at[k][x]; const m = n / (z - b); return (m ? m.toFixed(m < 10 ? 1 : 0) : '.').padStart(4); });
      const marks = [...new Set((plan.timeline as any[]).filter((r) => r.bar >= b && r.bar < z && r.sub).map((r) => r.sub))].join('; ');
      console.log(`  ${String(b).padStart(3)}-${String(z - 1).padEnd(4)}  ${sec.kind.padEnd(10)}  ${cells.join('')}   ${marks}`);
    }
  }
}
if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
