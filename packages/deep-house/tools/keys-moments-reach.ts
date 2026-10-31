// **Where the keys' moments play** (round keys-moments, 10-29; `src/keys-moments.ts`). Over the program guards' grid
// (`check-program-guards.ts`: the tiles, the ring, the crossings, the slow side, 27191; seeds 1-12, theme 1), the featured
// tracks and the house at seeds 1-60 (themes 1-3): every theme whose keys play, and of those, where a moment fits (the
// plan's words: a long breakdown under a part that may take a solo, or a long stretch of a piano lead) and where it plays.
//
//   node tools/keys-moments-reach.ts                 the shares by set, by keys family and by grid row; the featured
//   node tools/keys-moments-reach.ts --link "<q>"    one theme: its plan's words and its moments
//   --house <n>                                      house seeds 1-n (60 by default); --no-grid, --no-featured
import { grid, linkOf, playedAt } from './check-program-guards.ts';
import { keysAbsences } from './keys-absence.ts';
import { FEATURED } from '../src/featured.ts';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

interface Reading { link: string; name?: string; set: string; row: string; family: string; solo: string; riff: string; said: string[] }
const span = (s: { from: number; to: number } | null | undefined) => (s ? `${s.from}-${s.to - 1}` : '');

function readingOf(t: any, L: { link: string; name?: string; set: string; row: string }): Reading | null {
  const k = keysAbsences(t);
  if (!k) return null;
  const km = t.keysMoments ?? null;
  return { ...L, family: k.family, solo: span(km?.solo), riff: span(km?.riff), said: km?.said ?? [] };
}

const one = opt('--link');
if (one) {
  const t: any = playedAt(one);
  console.log(t.arrangement.sections.map((s: any) => `${s.kind} ${s.startBar}+${s.bars}`).join(' | '));
  const r = readingOf(t, { link: one, set: 'one', row: 'one' });
  console.log(r ? `${r.family}: ${r.said.join('; ') || 'no moment fits'}${r.solo ? `; solo ${r.solo}` : ''}${r.riff ? `; riff ${r.riff}` : ''}` : 'no keys');
  process.exit(0);
}
const links: Array<{ link: string; name?: string; set: string; row: string }> = [];
if (!argv.includes('--no-grid')) for (const g of grid()) for (const seed of g.seeds) links.push({ link: linkOf(seed, g.spell), set: 'grid', row: g.name });
if (!argv.includes('--no-featured')) for (const p of FEATURED) p.links.forEach((l, i) => links.push({ link: l, name: `${p.name} - ${p.labels?.[i] || i + 1}`, set: 'featured', row: p.name }));
const house = Number(opt('--house') ?? 60);
for (let s = 1; s <= house; s++) for (let th = 0; th < 3; th++) links.push({ link: linkOf(String(s), null, th), set: 'house', row: 'house' });

const rows: Reading[] = [];
let none = 0;
for (const L of links) { const r = readingOf(playedAt(L.link), L); if (r) rows.push(r); else none++; }
const fitsSolo = (r: Reading) => r.said.some((x) => /solo/.test(x));
const fitsRiff = (r: Reading) => r.said.some((x) => /riff/.test(x));
const pct = (n: number, d: number) => `${n}/${d}${d ? ` (${Math.round(100 * n / d)} %)` : ''}`;
console.log(`keys moments over ${links.length} themes (${none} without keys): ${rows.length} with keys`);
for (const set of ['all', 'grid', 'house', 'featured']) {
  const xs = set === 'all' ? rows : rows.filter((r) => r.set === set);
  if (!xs.length) continue;
  const fs = xs.filter(fitsSolo), fr = xs.filter(fitsRiff);
  console.log(`\n${set}: ${xs.length} themes with keys`);
  console.log(`  solo: fits ${pct(fs.length, xs.length)}, plays ${pct(fs.filter((r) => r.solo).length, fs.length)} of those, ${pct(xs.filter((r) => r.solo).length, xs.length)} of all`);
  console.log(`  riff: fits ${pct(fr.length, xs.length)}, plays ${pct(fr.filter((r) => r.riff).length, fr.length)} of those, ${pct(xs.filter((r) => r.riff).length, xs.length)} of all`);
  const fams = new Map<string, { n: number; fs: number; s: number; fr: number; r: number }>();
  for (const r of xs) { const f = fams.get(r.family) ?? { n: 0, fs: 0, s: 0, fr: 0, r: 0 }; f.n++; if (fitsSolo(r)) f.fs++; if (r.solo) f.s++; if (fitsRiff(r)) f.fr++; if (r.riff) f.r++; fams.set(r.family, f); }
  console.log(`  by keys family (themes: solo fits/plays, riff fits/plays): ${[...fams].sort((a, b) => b[1].n - a[1].n).filter(([, f]) => f.fs || f.fr).map(([k, f]) => `${k} ${f.n}: ${f.fs}/${f.s}, ${f.fr}/${f.r}`).join('; ') || 'none'}`);
}
const byRow = new Map<string, { n: number; s: number; r: number }>();
for (const r of rows.filter((x) => x.set === 'grid')) { const f = byRow.get(r.row) ?? { n: 0, s: 0, r: 0 }; f.n++; if (r.solo) f.s++; if (r.riff) f.r++; byRow.set(r.row, f); }
console.log(`\nthe grid's rows that play one (themes with keys: solos, riffs): ${[...byRow].filter(([, f]) => f.s || f.r).map(([k, f]) => `${k} ${f.n}: ${f.s}, ${f.r}`).join('; ') || 'none'}`);
console.log('\nfeatured with a moment that fits:');
for (const r of rows.filter((x) => x.set === 'featured' && (fitsSolo(x) || fitsRiff(x)))) console.log(`  ${r.name}  ${r.family}: ${r.said.join('; ')}`);
