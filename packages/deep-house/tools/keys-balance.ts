// **The keys' balance, across the house** (round keys-balance, 10-29; his words: *"we keep piano, trying to see if we
// can ditch chord from Saturn rings, balance the volume based on hat loudness as it work in one place but not in
// another"*). Over the set `tools/keys-absence.ts` reads (the program guards' grid, seeds 1-12 theme 1; the featured;
// the house at seeds 1-60, themes 1-3), every theme whose keys play:
//
//   - **one tone**: the keys chords struck as one tone of the bed's chord under the drone in front (`plan.oneTone`);
//   - **the hats' room**: the keys' level step section by section where the hats leave them exposed or covered
//     (`plan.keysByHats`), its range and where it lands.
//
//   node tools/keys-balance.ts                 the counts, the featured named
//   node tools/keys-balance.ts --link "<q>"    one theme: its chords and its steps
//   --house <n>, --no-grid, --no-featured
import { grid, linkOf, playedAt } from './check-program-guards.ts';
import { FEATURED } from '../src/featured.ts';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

type Step = { bar: number; kind: string; db: number; over: number | null };
const readOf = (t: any) => ({
  keys: (t.events as any[]).some((e) => e.layer === 'keys'),
  scene: (() => { try { return JSON.parse(t.dice?.composition ?? '{}').scene ?? null; } catch { return null; } })() as string | null,
  oneTone: ((t as any).oneTone ?? []) as string[],
  steps: ((t as any).keysByHats ?? []) as Step[],
});

const one = opt('--link');
if (one) {
  const t: any = playedAt(one);
  const r = readOf(t);
  console.log(`scene ${r.scene}; sections ${t.arrangement.sections.map((s: any) => `${s.kind} ${s.startBar}+${s.bars}`).join(' | ')}`);
  console.log(`one tone: ${r.oneTone.length ? r.oneTone.join('; ') : 'none'}`);
  console.log(`keys by the hats: ${r.steps.length ? r.steps.map((s) => `${s.kind}@${s.bar} keys over hats ${s.over ?? '(held)'} → ${s.db >= 0 ? '+' : ''}${s.db}`).join('; ') : 'none'}`);
  process.exit(0);
}

const links: Array<{ link: string; name?: string; set: string }> = [];
if (!argv.includes('--no-grid')) for (const g of grid()) for (const seed of g.seeds) links.push({ link: linkOf(seed, g.spell), set: 'grid' });
if (!argv.includes('--no-featured')) for (const p of FEATURED) p.links.forEach((l, i) => links.push({ link: l, name: `${p.name} - ${p.labels?.[i] || i + 1}`, set: 'featured' }));
const house = Number(opt('--house') ?? 60);
for (let s = 1; s <= house; s++) for (let th = 0; th < 3; th++) links.push({ link: linkOf(String(s), null, th), set: 'house' });

const rows: Array<ReturnType<typeof readOf> & { link: string; name?: string; set: string }> = [];
for (const L of links) {
  const t: any = playedAt(L.link);
  const r = readOf(t);
  if (!r.keys) continue;
  rows.push({ ...r, ...L });
}
const pct = (n: number, d: number) => `${n}/${d} (${d ? Math.round(100 * n / d) : 0} %)`;
console.log(`keys balance over ${links.length} themes: ${rows.length} with keys`);
for (const set of ['all', 'grid', 'house', 'featured']) {
  const xs = set === 'all' ? rows : rows.filter((r) => r.set === set);
  if (!xs.length) continue;
  const fwd = xs.filter((r) => r.scene === 'drone-forward');
  const toned = xs.filter((r) => r.oneTone.length);
  const chords = toned.reduce((a, r) => a + r.oneTone.length, 0);
  const stepped = xs.filter((r) => r.steps.some((s) => s.db !== 0));
  const dbs = xs.flatMap((r) => r.steps.map((s) => s.db));
  const hist = new Map<string, number>();
  for (const d of dbs) { const k = d <= -2.5 ? '-3..-2.5' : d <= -1 ? '-2.5..-1' : d < 0 ? '-1..0' : 'none'; hist.set(k, (hist.get(k) ?? 0) + 1); }
  // the reading itself, per groove section the lane strikes in: where the house sits against `over`
  const overs = xs.flatMap((r) => r.steps.filter((s) => s.over !== null).map((s) => s.over as number)).sort((a, b) => a - b);
  const q = (f: number) => overs.length ? overs[Math.min(overs.length - 1, Math.floor(f * overs.length))].toFixed(1) : '-';
  console.log(`\n${set}: ${xs.length} themes with keys; the drone in front ${fwd.length}`);
  console.log(`  one tone: ${pct(toned.length, xs.length)} themes, ${chords} chords struck as one tone`);
  console.log(`  keys by the hats: the piano over a groove in ${xs.filter((r) => r.steps.some((s) => s.over !== null)).length} themes; ${pct(stepped.length, xs.length)} moved; sections ${dbs.length}: ${['none', '-1..0', '-2.5..-1', '-3..-2.5'].map((k) => `${k} ${hist.get(k) ?? 0}`).join(' · ')}`);
  console.log(`    keys over the hats, groove sections ${overs.length}: 10 % ${q(0.1)} · median ${q(0.5)} · 90 % ${q(0.9)} · 95 % ${q(0.95)}; over 15: ${overs.filter((o) => o > 15).length}, over 20: ${overs.filter((o) => o > 20).length}`);
  if (set !== 'featured' && argv.includes('--list')) for (const r of xs) if (r.steps.some((s) => s.db !== 0)) console.log(`    ${r.link}: ${r.steps.map((s) => `${s.kind}@${s.bar} ${s.over ?? '·'} ${s.db}`).join(' ')}`);
  if (set === 'featured') for (const r of xs) {
    if (!r.oneTone.length && !r.steps.some((s) => s.db !== 0)) continue;
    console.log(`  ${r.name}: ${r.oneTone.length ? `one tone ×${r.oneTone.length}; ` : ''}${r.steps.filter((s) => s.db !== 0).map((s) => `${s.kind}@${s.bar} ${s.db >= 0 ? '+' : ''}${s.db}`).join(' ')}`);
  }
}
