// trance-drawn (11-04, borrowed from dream-trance): the layers and voices the trance corner's themes write, over seeds (a census for the sketch).
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
const S = ['em:0.83,ti:0.62,ze:0.60,ro:0.62,gl:0.62,ve:0.55,sp:0.42,lo:0.82', 'em:0.86,ti:0.50,ze:0.45,ro:0.72,gl:0.18,ve:0.66,sp:0.43,lo:0.72', 'em:0.82,ti:0.78,ze:0.72,ro:0.55,gl:0.92,ve:0.45,sp:0.33,lo:0.92'];
const m: Record<string, Record<string, number>> = {};
const forms: Record<string, number> = {};
for (const s of S) for (let seed = 1; seed <= 12; seed++) {
  const read = linkRead(`?seed=${seed}&v=2&spell=${s}`);
  const L = read.link;
  const cast = recipesFor({ masterSeed: String(seed), strategy: L.strategy, search: `?${read.search}` });
  const t = planTheme(String(seed), L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track }) as any;
  for (const e of t.events) { (m[e.layer] ??= {}); m[e.layer][e.voice] = (m[e.layer][e.voice] ?? 0) + 1; }
  const f = t.arrangement.sections.map((x: any) => `${x.kind[0]}${x.bars}`).join(' ');
  forms[f] = (forms[f] ?? 0) + 1;
}
for (const [l, v] of Object.entries(m)) console.log(l.padEnd(8), Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' '));
for (const [f, n] of Object.entries(forms).sort((a, b) => b[1] - a[1])) console.log(n, f);
