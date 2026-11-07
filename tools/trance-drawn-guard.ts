// trance-drawn (11-04): the round's plan guards over the corner's themes: every written note in the theme's scale, the
// front's register (its highest and lowest), the bass under the bed's harmony (its root the bed's chord root), and no
// bar left with nothing sounding at all.
//   node tools/trance-drawn-guard.ts [N]
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
const N = Number(process.argv[2] ?? 30);
const TILES = ['em:0.83,ti:0.62,ze:0.60,ro:0.62,gl:0.62,ve:0.55,sp:0.42,lo:0.82', 'em:0.86,ti:0.50,ze:0.45,ro:0.72,gl:0.18,ve:0.66,sp:0.43,lo:0.72', 'em:0.82,ti:0.78,ze:0.72,ro:0.55,gl:0.92,ve:0.45,sp:0.33,lo:0.92'];
let notes = 0, outside = 0, hi = 0, lo = 999, themes = 0, silentBars = 0, bars = 0;
const pc = (m: number) => ((m % 12) + 12) % 12;
for (const s of TILES) for (let seed = 1; seed <= N; seed++) {
  const read = linkRead(`?seed=${seed}&v=2&spell=${s}`); const L = read.link;
  const cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search: `?${read.search}` });
  const t = planTheme(L.seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track } as never) as any;
  if (!t.tranceDrawn) continue;
  themes++;
  const sc = new Set(t.key.scale.map((i: number) => pc(t.key.root + i)));
  for (const e of t.events) if (e.part?.startsWith('trance:') && Number.isFinite(e.p?.midi)) {
    notes++;
    if (!sc.has(pc(e.p.midi))) outside++;
    if (e.part === 'trance:front') { hi = Math.max(hi, e.p.midi); lo = Math.min(lo, e.p.midi); }
  }
  // a bar where nothing sounds at all (no event starts and nothing held over it)
  const held = new Set<number>();
  for (const e of t.events) for (let b = e.bar; b < e.bar + Math.max(1, Math.ceil(((e.p?.dur ?? 0) - 1e-3) / t.barSeconds)); b++) held.add(b);
  for (let b = 0; b < t.bars; b++) { bars++; if (!held.has(b)) silentBars++; }
}
const name = (m: number) => `${['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][pc(m)]}${Math.floor(m / 12) - 1}`;
console.log(`${themes} themes: ${notes} written notes, ${outside} outside the theme's scale; the front from ${name(lo)} to ${name(hi)}; ${silentBars} of ${bars} bars silent`);
