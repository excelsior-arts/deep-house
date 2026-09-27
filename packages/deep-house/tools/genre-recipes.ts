// genre-recipes.ts — the genre library's audit renders: each row at its audit
// link, and the family key's spell alone at the same place, sixteen bars each.
//
//   npx vite build --outDir ../../tmp/recipes-g1/site          (a scratch build; never docs/)
//   nice -n 18 node tools/genre-recipes.ts --family dnb --site tmp/recipes-g1/site --out tmp/recipes-g1 --port 7261
//   ... --shard 0/2 --port 7261 & ... --shard 1/2 --port 7262     two at a time, and no more
//   ... --links                                                print the audit links and render nothing
//
// The points are `tools/genre-audit.json`. Each row is planned exactly as its
// link plays it — `recipesFor` over the link's own search, then `planTheme` —
// and the window is the theme's `loudnessWindow` (the one `genres.ts` renders),
// through the real graph in headless Chromium on the silent route. The key's
// render is the same seed, theme and spell with no recipe: what the recipe
// changes is the difference. Everything lands under tmp/, never in git:
// `<out>/renders/<family>__<name>{,__key}/{mix.wav,meta.json}` for
// `tools/genres.py --ours`, and `<out>/<family>/<name>.wav` for the ear.

import fs from 'node:fs';
import path from 'node:path';
import { planTheme, recipesFor } from '../src/mix.ts';
import { loudnessWindow } from '../src/loudness.ts';
import { asSpell, derive, parseSpell } from '../src/spell.ts';
import { linkWrite } from '../src/link.ts';
import { sceneOfDice } from '../src/composition.ts';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '..', '..', '..');
const AUDIT = JSON.parse(fs.readFileSync(path.join(HERE, 'genre-audit.json'), 'utf8'));

export interface AuditPoint { id: string; seed: string; theme: number; key: string; spell: string; search: string }
/** Every audit point, as the link that plays it (a written link: every sound row, `v=2`, never a bar). */
export function auditPoints(): AuditPoint[] {
  return Object.entries(AUDIT.rows as Record<string, { seed: string; theme: number; key: string }>).map(([id, p]) => {
    const spell = AUDIT.keys[p.key].spell as string;
    const search = linkWrite({ seed: p.seed, theme: p.theme - 1, strategy: 'house-v2', spell: parseSpell(spell), recipe: id,
      accompaniment: 'base', development: 'base' }, '', { explicit: true });
    return { id, seed: p.seed, theme: p.theme, key: p.key, spell, search };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'genre-recipes.ts')) {
  let list = auditPoints().filter((p) => !arg('family') || p.id.startsWith(`${arg('family')}/`));
  if (flag('links')) {
    for (const p of list) console.log(`${p.id.padEnd(24)} ?${p.search}`);
    process.exit(0);
  }
  const SHARD = arg('shard');
  if (SHARD) { const [i, n] = SHARD.split('/').map(Number); list = list.filter((_, k) => k % n === i); }
  const { serveSite, openPage, renderToWav } = await import('./imprint/render.ts');
  const OUT = path.resolve(ROOT, arg('out', 'tmp/recipes-g1')!);
  const PORT = +arg('port', '7261')!;
  const BARS = +arg('bars', '16')!;
  const RATE = 48000;
  const server: any = await serveSite(PORT, arg('site', 'tmp/recipes-g1/site')!);
  const browser: any = await openPage(PORT);
  const quiet = <T,>(f: () => T): T => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
  for (const p of list) {
    const spell = asSpell(parseSpell(p.spell)!);
    const cast = quiet(() => recipesFor({ masterSeed: p.seed, strategy: 'house-v2', search: `?${p.search}` }));
    const withRecipe = { strategy: 'house-v2', spell: cast.spell, recipe: cast.track };
    const track: any = quiet(() => planTheme(p.seed, p.theme - 1, withRecipe));
    const w = loudnessWindow(track, BARS);
    const slug = p.id.replace('/', '__');
    for (const [suffix, opts] of [['', withRecipe], ['__key', { strategy: 'house-v2', spell }]] as const) {
      const dir = path.join(OUT, 'renders', slug + suffix);
      if (flag('resume') && fs.existsSync(path.join(dir, 'meta.json'))) continue;
      const t: any = quiet(() => planTheme(p.seed, p.theme - 1, opts as any));
      const began = Date.now();
      const r: any = await renderToWav(browser.page, {
        masterSeed: p.seed, theme: p.theme - 1, opts: JSON.parse(JSON.stringify(opts)),
        preFromBar: Math.max(0, w.from - 2), fromBar: w.from, toBar: w.from + w.bars, tail: 1.5,
      }, path.join(dir, 'mix.wav'), RATE);
      const d = derive(spell);
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
        name: slug + suffix, group: p.id + suffix, id: p.id, recipe: suffix ? null : p.id, seed: p.seed, theme: p.theme, spell,
        link: p.search, bpm: t.bpm, preset: t.preset, density: t.density, scene: sceneOfDice(t.dice) ?? null,
        tempoFamily: d.tempoFamily, kit: d.kit, drumsOn: d.drumsOn, window: w, seconds: r.seconds, peak: r.peak,
      }, null, 1));
      if (!suffix) {
        fs.mkdirSync(path.join(OUT, path.dirname(p.id)), { recursive: true });
        fs.copyFileSync(path.join(dir, 'mix.wav'), path.join(OUT, `${p.id}.wav`));
      }
      console.log(`  ${(p.id + suffix).padEnd(28)} ${String(t.bpm).padStart(5)} BPM ${d.tempoFamily}/${d.kit} bars ${w.from}-${w.from + w.bars} peak ${r.peak} dB ${((Date.now() - began) / 1000).toFixed(0)} s`);
    }
  }
  await browser.close();
  server.close();
}
