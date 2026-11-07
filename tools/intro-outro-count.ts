// trance-drawn pass 4 (11-04): the intro and the outro against the phrase, counted house-wide, for the house rule's plan.
// For every genre preset (each family and each sub with a spell, as the sky's keys play them) seeds 1..N, and every
// featured track: the form as the house drew it (the first plan, before any second ask), its phrase in bars, the intro's
// bars against the phrase, the outro's bars against the groove before it. A theme counts where its intro is shorter
// than its phrase, and where its outro is longer than a phrase and longer than the last groove.
//   node tools/intro-outro-count.ts [N] [--list]
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { FAMILIES, familyPreset, subPreset } from '../packages/deep-house/src/genres/genre-table.ts';
import FEATURED from '../packages/deep-house/src/featured.json' with { type: 'json' };
const N = Number(process.argv[2] ?? 12) || 12;
const LIST = process.argv.includes('--list');
const FEATURED_ONLY = process.argv.includes('--featured-only');
const spellOf = (s: Record<string, number>) => Object.entries(s).map(([k, v]) => `${k.slice(0, 2)}:${(+v).toFixed(2)}`).join(',');
const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
const plan = (q: string) => {
  const read = linkRead(`?${q}`); const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  return quiet(() => planTheme(seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } as never)) as any;
};
function read(t: any) {
  const u = t.unsplit ?? t;
  const secs = u.arrangement.sections as Array<{ kind: string; bars: number }>;
  const phrase: number = u.phraseMap?.time?.phraseBars ?? 8;
  const intro = secs[0]?.kind === 'intro' ? secs[0].bars : null;
  const last = secs[secs.length - 1], before = secs[secs.length - 2];
  const outro = last?.kind === 'outro' ? last.bars : null;
  const groove = before && (before.kind === 'drop' || before.kind === 'main' || before.kind === 'groove') ? before.bars : null;
  const kick = u.events.some((e: any) => e.layer === 'kick');
  return { phrase, intro, outro, groove, bars: u.bars, bpm: u.bpm, kick,
    introShort: intro != null && intro < phrase, outroLong: outro != null && outro > phrase && groove != null && outro > groove };
}
const presets: Array<{ label: string; spell: Record<string, number> }> = [];
for (const f of FAMILIES) {
  const fp = familyPreset(f); if (fp.spell) presets.push({ label: f.label, spell: fp.spell as Record<string, number> });
  for (const s of f.subs ?? []) { const sp = subPreset(f, s); if (sp.spell && JSON.stringify(sp.spell) !== JSON.stringify(fp.spell)) presets.push({ label: `${f.label} / ${s.label}`, spell: sp.spell as Record<string, number> }); }
}
presets.push({ label: 'Hard Trance (dot)', spell: { ember: 0.86, tide: 0.5, zephyr: 0.45, root: 0.72, gleam: 0.18, veil: 0.66, spark: 0.43, loom: 0.72 } });
presets.push({ label: 'Uplifting Trance (dot)', spell: { ember: 0.82, tide: 0.78, zephyr: 0.72, root: 0.55, gleam: 0.92, veil: 0.45, spark: 0.33, loom: 0.92 } });
let all = 0, introShort = 0, outroLong = 0, drumless = 0;
const byPlace: string[] = [];
for (const p of FEATURED_ONLY ? [] : presets) {
  let n = 0, i = 0, o = 0, k = 0; const phrases = new Set<number>();
  for (let seed = 1; seed <= N; seed++) {
    const r = read(plan(`seed=${seed}&v=2&spell=${spellOf(p.spell)}`));
    if (!r.kick) { drumless++; continue; }
    n++; all++; phrases.add(r.phrase); if (r.introShort) { i++; introShort++; } if (r.outroLong) { o++; outroLong++; }
    if (LIST) console.log(`  ${p.label} seed ${seed}: ${r.bpm} BPM, phrase ${r.phrase}, intro ${r.intro}, outro ${r.outro} after a groove of ${r.groove}${r.introShort ? ' INTRO SHORT' : ''}${r.outroLong ? ' OUTRO LONG' : ''}`);
  }
  if (n) byPlace.push(`${p.label}: ${n} themes, phrase ${[...phrases].join('/')}, intro short ${i}, outro long ${o}`);
}
console.log(byPlace.join('\n'));
let fn = 0, fi = 0, fo = 0; const fl: string[] = [];
for (const list of (FEATURED as any).playlists) for (const [j, link] of ((list as any).links ?? []).entries()) {
  const r = read(plan(String(link).replace(/^\?/, '')));
  if (!r.kick) continue;
  fn++; if (r.introShort) { fi++; fl.push(`${(list as any).name} ${j + 1} (${(list as any).labels?.[j] ?? ''}): intro ${r.intro} of a phrase of ${r.phrase}`); } if (r.outroLong) { fo++; fl.push(`${(list as any).name} ${j + 1} (${(list as any).labels?.[j] ?? ''}): outro ${r.outro} after a groove of ${r.groove}`); }
}
console.log(`\n${all} beat-led themes over ${presets.length} presets (${drumless} drumless skipped): the intro shorter than its phrase in ${introShort} (${(100 * introShort / all).toFixed(0)} %), the outro longer than a phrase and than the groove before it in ${outroLong} (${(100 * outroLong / all).toFixed(0)} %)`);
console.log(`featured, beat-led: ${fn}; the intro short in ${fi}, the outro long in ${fo}\n${fl.join('\n')}`);
