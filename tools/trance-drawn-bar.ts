// trance-drawn (11-04, borrowed from dream-trance): every event of a theme in a few bars, with its fields (a look at what a lane writes).
//   node tools/trance-drawn-bar.ts '<link query>' <fromBar> <toBar> [layer,layer]
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
const [q, a, b, ls] = process.argv.slice(2);
const read = linkRead(`?${q}`);
const L = read.link, seed = L.seed ?? '1';
const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
const opts = { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development };
const t = planTheme(seed, L.theme, opts) as any;
const layers = ls ? ls.split(',') : null;
for (const e of t.events) if (e.bar >= +a && e.bar < +b && (!layers || layers.includes(e.layer))) {
  const { t: tt, bar, step, layer, voice, note, p, ...rest } = e;
  console.log(bar, step, layer, voice, note ?? '', JSON.stringify(p), Object.keys(rest).length ? JSON.stringify(rest) : '');
}
console.log('track keys:', Object.keys(t).join(' '));
