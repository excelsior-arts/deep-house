// Round tide-space (11-01), scratch: the featured tracks' render jobs (a mix and the same window with every send at
// nought, `-dry`), each over a sixteen-bar window where the wash is heard: the first main section after the intro.
//   node tools/tide-space-jobs.ts <out.json> [--rate 32000] [--bars 16] [--only name,name]
import fs from 'node:fs';
import { played } from './link-digest.ts';
import { programOf } from '../src/performance.ts';
import { FEATURED } from '../src/featured.ts';

const argv = process.argv.slice(2);
const out = argv[0];
const arg = (k: string, d: string) => { const i = argv.indexOf(k); return i > 0 && argv[i + 1] ? argv[i + 1] : d; };
const rate = Number(arg('--rate', '32000')), span = Number(arg('--bars', '16'));
const only = arg('--only', '') ? new Set(arg('--only', '').split(',')) : null;
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const DRY = { sends: { reverbLevel: 0, hallLevel: 0, delayLevel: 0, roomLevel: 0 }, space: { kitRoom: 0 }, returns: { front: null }, partSpace: null };

const jobs: any[] = [];
const windows: any[] = [];
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const name = `${p.name} - ${p.labels[i]}`;
  if (only && !only.has(slug(name))) return;
  const { plan } = quiet(() => played(link));
  const t: any = plan;
  const program = programOf(plan);
  const secs = t.arrangement.sections as Array<{ kind: string; startBar: number; bars: number }>;
  const main = secs.find((s) => s.startBar >= 8 && /drop|main|groove|body|peak/.test(s.kind)) ?? secs.find((s) => s.startBar >= 8) ?? secs[0];
  const from = Math.min(main.startBar, Math.max(0, t.bars - span)), to = Math.min(t.bars, from + span);
  const s = slug(name);
  windows.push({ name, slug: s, link, from, to, t: +(from * program.barSeconds).toFixed(1), bpm: program.bpm, sections: secs.map((x) => `${x.kind}@${x.startBar}+${x.bars}`).join(' ') });
  jobs.push({ name: s, link, fromBar: from, toBar: to, rate });
  jobs.push({ name: `${s}-dry`, link, fromBar: from, toBar: to, rate, settings: DRY });
});
fs.writeFileSync(out, JSON.stringify(jobs, null, 1));
fs.writeFileSync(out.replace(/\.json$/, '-windows.json'), JSON.stringify(windows, null, 1));
for (const w of windows) console.log(w.slug, `${w.from}-${w.to}`, `t=${w.t}`, w.bpm, '|', w.sections);
