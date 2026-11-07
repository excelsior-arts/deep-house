// trance-drawn pass 2 (11-04): the sixteenth snare roll outside a build, counted house-wide. For every genre preset (each
// family and each sub with a spell, as the sky's keys play them) seeds 1..N, and every featured track: a track counts
// where the snare or clap lane strikes sixteenths (six or more neighbouring sixteenths in a bar) for more than two bars
// running outside a build; with the longest such run, how many runs, and the roll's loudest hit against the lane's
// median backbeat hit (dB).
//   node tools/roll-count.ts [N] [--list]
import fs from 'node:fs';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { FAMILIES, familyPreset, subPreset } from '../packages/deep-house/src/genres/genre-table.ts';

const N = Number(process.argv[2] ?? 20) || 20;
const LIST = process.argv.includes('--list');
const LANES = new Set(['clap', 'snare']);
const spellOf = (s: Record<string, number>) => Object.entries(s).map(([k, v]) => `${k.slice(0, 2)}:${(+v).toFixed(2)}`).join(',');
const ASW = process.argv.includes('--as-written');
const THEMES = process.argv.includes('--themes') ? Number(process.argv[process.argv.indexOf('--themes') + 1]) : 1;
const plan = (q: string, theme?: number) => {
  const read = linkRead(`?${q}`); const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  return { t: planTheme(seed, theme ?? L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development, ...(ASW ? { rolls: 'as-written' } : {}) } as never) as any, recipe: cast.track?.id ?? '' };
};
export function rolls(t: any) {
  const by = new Map<number, Set<number>>();
  const vels: number[] = [], rollVels: number[] = [];
  for (const e of t.events) if (LANES.has(e.layer) && e.step != null) { (by.get(e.bar) ?? by.set(e.bar, new Set()).get(e.bar)!).add(e.step); vels.push(Number(e.p?.vel ?? 1) * Number(e.p?.gain ?? 1)); }
  const kindAt = (b: number) => t.arrangement.sections.find((s: any) => b >= s.startBar && b < s.startBar + s.bars)?.kind;
  const sixteenths = (b: number) => { const s = by.get(b); if (!s) return false; let n = 0; for (const x of s) if (s.has(x + 1)) n++; return n >= 6; };
  const runs: number[] = [];
  let run = 0;
  for (let b = 0; b <= t.bars; b++) {
    if (b < t.bars && sixteenths(b) && kindAt(b) !== 'build') run++;
    else { if (run > 2) runs.push(run); run = 0; }
  }
  for (const e of t.events) if (LANES.has(e.layer) && sixteenths(e.bar)) rollVels.push(Number(e.p?.vel ?? 1) * Number(e.p?.gain ?? 1));
  vels.sort((a, b) => a - b);
  const med = vels[Math.floor(vels.length / 2)] ?? 1, top = Math.max(0, ...rollVels);
  return { runs, longest: Math.max(0, ...runs), peakDb: rollVels.length ? +(20 * Math.log10(top / med)).toFixed(1) : null };
}
const rows: Array<{ place: string; n: number; hit: number; longest: number; recipes: Record<string, number>; peak: number[] }> = [];
const presets: Array<{ label: string; spell: Record<string, number> }> = [];
for (const f of FAMILIES) {
  const fp = familyPreset(f); if (fp.spell) presets.push({ label: f.label, spell: fp.spell as Record<string, number> });
  for (const s of f.subs ?? []) { const sp = subPreset(f, s); if (sp.spell && JSON.stringify(sp.spell) !== JSON.stringify(fp.spell)) presets.push({ label: `${f.label} / ${s.label}`, spell: sp.spell as Record<string, number> }); }
}
presets.push({ label: 'Hard Trance (tile)', spell: { ember: 0.86, tide: 0.5, zephyr: 0.45, root: 0.72, gleam: 0.18, veil: 0.66, spark: 0.43, loom: 0.72 } });
presets.push({ label: 'Uplifting Trance (tile)', spell: { ember: 0.82, tide: 0.78, zephyr: 0.72, root: 0.55, gleam: 0.92, veil: 0.45, spark: 0.33, loom: 0.92 } });
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
for (const p of presets) {
  if (ONLY && !p.label.includes(ONLY)) continue;
  const row = { place: p.label, n: 0, hit: 0, longest: 0, recipes: {} as Record<string, number>, peak: [] as number[] };
  for (let seed = 1; seed <= N; seed++) for (let th = 0; th < THEMES; th++) {
    const { t, recipe } = plan(`seed=${seed}&v=2&spell=${spellOf(p.spell)}`, th);
    row.n++;
    const r = rolls(t);
    if (r.runs.length) { row.hit++; row.longest = Math.max(row.longest, r.longest); row.recipes[recipe || '(drawn)'] = (row.recipes[recipe || '(drawn)'] ?? 0) + 1; if (r.peakDb != null) row.peak.push(r.peakDb);
      if (LIST) console.log(`  ${p.label} seed ${seed} theme ${th}: ${r.runs.length} runs, longest ${r.longest} bars, peak +${r.peakDb} dB, ${recipe}`); }
  }
  rows.push(row);
}
console.log('| place | themes | with a roll outside a build | longest run (bars) | the roll\'s peak over the lane\'s median hit | from |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) if (r.hit) console.log(`| ${r.place} | ${r.n} | ${r.hit} | ${r.longest} | ${r.peak.length ? `+${Math.max(...r.peak)} dB` : '—'} | ${Object.entries(r.recipes).map(([k, v]) => `${k} ×${v}`).join(', ')} |`);
console.log(`places with none: ${rows.filter((r) => !r.hit).map((r) => r.place).join(', ')}`);
const total = rows.reduce((a, r) => a + r.hit, 0), all = rows.reduce((a, r) => a + r.n, 0);
console.log(`total: ${total} of ${all} themes`);
// the featured tracks
const feat = JSON.parse(fs.readFileSync(new URL('../packages/deep-house/src/featured.json', import.meta.url), 'utf8'));
const fh: string[] = [];
for (const p of feat.playlists) p.links.forEach((l: string, i: number) => { const r = rolls(plan(l).t); if (r.runs.length) fh.push(`${p.name} - ${p.labels[i]} (${r.runs.length} runs, longest ${r.longest})`); });
console.log(`featured with a roll outside a build: ${fh.length ? fh.join('; ') : 'none'}`);
