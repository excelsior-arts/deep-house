// trance-drawn (11-04): the tripwire over the corner's themes. Seeds 1..N at each tile's own birds, and as many again at
// birds drawn inside the radius about each tile; per theme the draw (`tranceDrawn` on the plan): the front, its voice,
// the colours, the bed; counted as shares of the themes the rule wrote. Also each technique's share of its themes' bars.
//   node tools/trance-drawn-census.ts [N] [--list]
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import Rng from '../packages/deep-house/src/rng.ts';

const N = Number(process.argv[2] ?? 40);
const LIST = process.argv.includes('--list');
const ONLY = process.argv.includes('--tile') ? process.argv[process.argv.indexOf('--tile') + 1] : null;
export const TILES: Record<string, Record<string, number>> = {
  'Trance': { em: 0.83, ti: 0.62, ze: 0.60, ro: 0.62, gl: 0.62, ve: 0.55, sp: 0.42, lo: 0.82 },
  'Hard Trance': { em: 0.86, ti: 0.50, ze: 0.45, ro: 0.72, gl: 0.18, ve: 0.66, sp: 0.43, lo: 0.72 },
  'Uplifting Trance': { em: 0.82, ti: 0.78, ze: 0.72, ro: 0.55, gl: 0.92, ve: 0.45, sp: 0.33, lo: 0.92 },
};
const spellOf = (b: Record<string, number>) => Object.entries(b).map(([k, v]) => `${k}:${Math.max(0, Math.min(1, v)).toFixed(2)}`).join(',');
const plan = (q: string) => {
  const read = linkRead(`?${q}`);
  const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  return planTheme(seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development }) as any;
};
const count: Record<string, Record<string, number>> = { front: {}, voice: {}, colour: {}, bed: {}, lead: {}, shed: {}, form: {}, mood: {}, 'mood+grit': {} };
const byTile: Record<string, Record<string, number>> = {};
const bump = (k: string, v: string) => { count[k][v] = (count[k][v] ?? 0) + 1; };
const share: Record<string, number[]> = {};
let themes = 0, outside = 0;
for (const [tile, birds] of Object.entries(TILES).filter(([t]) => !ONLY || t === ONLY)) for (let seed = 1; seed <= N; seed++) for (const jitter of [false, true]) {
  const g = new Rng(`census:${tile}:${seed}`);
  // a point inside the radius: each bird moved up to ±0.15 (the distance stays well inside 0.5)
  const b = jitter ? Object.fromEntries(Object.entries(birds).map(([k, v]) => [k, v + g.float(-0.15, 0.15)])) : birds;
  const q = `seed=${seed}&v=2&spell=${spellOf(b)}`;
  const t = plan(q);
  const r = t.tranceDrawn;
  if (!r) { outside++; continue; }
  themes++;
  bump('front', r.front); (byTile[tile] ??= {})[r.front] = (byTile[tile][r.front] ?? 0) + 1;
  for (const c of r.colours) (byTile[`${tile} colours`] ??= {})[c] = (byTile[`${tile} colours`][c] ?? 0) + 1;
  (byTile[`${tile} colours`] ??= {})['(themes)'] = (byTile[`${tile} colours`]['(themes)'] ?? 0) + 1; bump('voice', r.voice); for (const c of r.colours) bump('colour', c); bump('bed', r.bed || '(the riff\'s own)');
  // the lead voice: the front's (the saw riff's grit), and the smooth saw where it plays
  bump('lead', r.voice);
  if (r.colours.includes('supersaw-peak') && !(r.shed ?? []).includes('saw')) bump('lead', 'supersawSmooth (peak)');
  for (const s of r.shed ?? []) bump('shed', s);
  // the third pass: the form's ask (a release pays for its wait) and the build that opens (the filter build's themes)
  const whats = (r.form?.wants ?? []).map((w: any) => w.what as string);
  if (!whats.some((w) => w !== 'intro' && w !== 'outro')) bump('form', r.form?.said?.some((x: string) => /left$/.test(x)) ? 'a wait outruns its release, left' : 'the wait paid as drawn');
  for (const w of whats) bump('form', w);
  if (r.colours.includes('filter-build')) bump('form', 'the build opens (filter build)');
  // the mood a listener hears, by the draw and the light (his early word: 60-70 % dark and distorted, about 20 % bright)
  const gl = (b as Record<string, number>).gl;
  const dark = r.colours.includes('dark-bed') || String(r.bed).startsWith('padHaze') || r.voice === 'formantPad' || r.voice === 'pulseLead' || (r.front === 'saw-riff' && gl < 0.5);
  const bright = r.colours.includes('euphoric-progression') || (r.colours.includes('supersaw-peak') && !(r.shed ?? []).includes('saw')) || (gl >= 0.75 && !dark && (String(r.bed).startsWith('sawPad') || String(r.bed).startsWith('stringsPad')));
  bump('mood', dark ? 'dark' : bright ? 'bright' : 'between');
  // ...and with the gritty riff counted as distorted (his words: "dark and distorted"), the fourth pass's reading
  const grit = dark || r.front === 'saw-riff' || r.voice === 'pianoFelt';
  bump('mood+grit', grit ? 'dark or distorted' : bright ? 'bright' : 'between');
  (byTile[`${tile} mood`] ??= {})[dark ? 'dark' : bright ? 'bright' : 'between'] = (byTile[`${tile} mood`][dark ? 'dark' : bright ? 'bright' : 'between'] ?? 0) + 1;
  (byTile[`${tile} mood`] ??= {})['(themes)'] = (byTile[`${tile} mood`]['(themes)'] ?? 0) + 1;
  const bars = new Map<string, Set<number>>();
  for (const e of t.events) if (e.part?.startsWith('trance:')) { const k = e.part.slice(7); (bars.get(k) ?? bars.set(k, new Set()).get(k)!).add(e.bar); }
  for (const [k, s] of bars) (share[k] ??= []).push(s.size / t.bars);
  if (LIST) console.log(`${tile.padEnd(16)} ${String(seed).padStart(3)} ${jitter ? 'in' : 'at'} ${t.bpm} ${r.front}:${r.voice} + ${r.colours.join(' + ')} | bed ${r.bed}${r.double ? ` | double ${r.double}` : ''}${r.shed ? ` | shed ${r.shed.join(',')}` : ''}`);
}
console.log(`${themes} themes written (${outside} outside the radius)`);
for (const [k, m] of Object.entries(count)) {
  const rows = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${(100 * n / themes).toFixed(0)}%${n / themes > 0.4 ? ' (OVER)' : ''}`);
  console.log(`${k.padEnd(7)} ${rows.join(' · ')}`);
}
for (const [tile, m] of Object.entries(byTile)) { const n = m['(themes)'] ?? Object.values(m).reduce((a, b) => a + b, 0); delete m['(themes)']; console.log(`  ${tile.padEnd(17)} ${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, k]) => `${v} ${(100 * k / n).toFixed(0)}%`).join(' · ')}`); }
console.log('bars, as a share of the track, where it plays (median):', Object.entries(share).map(([k, v]) => `${k} ${(100 * v.sort((a, b) => a - b)[Math.floor(v.length / 2)]).toFixed(0)}%`).join(' · '));
