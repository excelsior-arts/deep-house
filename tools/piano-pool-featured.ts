// piano-pool (11-01), scratch: where each featured track that plays the house piano lands in the pool: its birds, each
// grand's chance at its spell, and the grand it drew (read off the compiled room: the string it plays).
//   node tools/piano-pool-featured.ts [--digest]
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';
import { pianoChances } from '../packages/deep-house/src/piano-pool.ts';
import { BY_NAME } from '../packages/engine/src/voices/index.ts';
import { recipesFor } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { HOUSE } from '../packages/deep-house/src/spell.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const GRANDS = ['piano', 'pianoClose', 'pianoUpright', 'pianoMute', 'pianoFelt', 'pianoConcert', 'pianoMellow'];
const sig = (s: any) => JSON.stringify([s?.felt, s?.body?.[0], s?.reach, s?.stiffness]);
const BY_SIG = new Map(GRANDS.map((g) => [sig((BY_NAME as any)[g].row.parameters.string), g]));
const short = (g: string) => g.replace(/^piano/, '').toLowerCase() || 'house';
const rows: any[] = [];
for (const p of FEATURED as any[]) p.links.forEach((link: string, i: number) => {
  const { plan } = quiet(() => played(link)) as any;
  if (!plan.events.some((e: any) => e.voice === 'piano')) return;
  const pr: any = programOf(plan);
  const read = linkRead(`?${link}`); const L: any = read.link;
  const spell: any = { ...HOUSE, ...(recipesFor({ masterSeed: L.seed ?? '1', strategy: L.strategy, search: `?${read.search}` }).spell ?? {}) };
  const ch = pianoChances('house-pianos', spell);
  const drew = BY_SIG.get(sig(pr.settings.piano.string)) ?? '?';
  const b = ['ember', 'tide', 'zephyr', 'root'].map((k) => `${k[0]}${(spell[k] ?? NaN).toFixed(2)}`).join(' ');
  console.log(`${p.name} - ${p.labels[i]}`.padEnd(26), b, '|', ch.map((x) => `${short(x.v)} ${(x.w * 100).toFixed(0)}`).join(' '), '| drew', short(drew));
  rows.push({ track: `${p.name} - ${p.labels[i]}`, link, spell, chances: ch, drew });
});
if (process.argv[2]) (await import('node:fs')).writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
