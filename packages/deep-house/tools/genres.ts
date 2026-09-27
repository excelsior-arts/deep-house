// genres.ts — the genre search's renders: any list of spells, one window each.
//
//   node tools/genres.ts --points ../../tmp/genres/r1.json --out tmp/genres/r1 --site tmp/genres/site
//   ... --shard 0/2 --port 7295        two at a time, under nice 18, and no more
//   ... --resume                       skip what is already there
//
// PLAN-GENRES' render half; `genres.py` is the reading half. A point is
// `{ name, group, seed, theme, spell, strategy? }` (house-v2 unless named); its
// window is the theme's own `loudnessWindow` — the first long main past bar 16,
// the window the loudness fit and the mastering measurement read — sixteen bars
// after two of pre-roll, rendered offline in headless Chromium through the real
// graph (imprint/render.ts: the silent route, no output device). The wav and a
// `meta.json` of what the plan derived (tempo family, kit, drums, scene) go
// under tmp/, never into git.

import fs from 'node:fs';
import path from 'node:path';
import { planTheme } from '../src/mix.ts';
import { loudnessWindow } from '../src/loudness.ts';
import { asSpell, derive } from '../src/spell.ts';
import { sceneOfDice, textureOfDice } from '../src/composition.ts';
import { serveSite, openPage, renderToWav, ROOT } from './imprint/render.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);

const SITE = arg('site', 'tmp/genres/site');
const OUT = path.resolve(ROOT, arg('out', 'tmp/genres/ours'));
const PORT = +arg('port', 7295);
const RATE = 48000;
const BARS = +arg('bars', 16);

let list = JSON.parse(fs.readFileSync(path.resolve(arg('points', '')), 'utf8'))
  .map((p) => ({ strategy: 'house-v2', theme: 0, group: p.name, ...p, seed: String(p.seed) }));
const SHARD = arg('shard', null);
if (SHARD) { const [i, n] = SHARD.split('/').map(Number); list = list.filter((_, k) => k % n === i); }

const server = await serveSite(PORT, SITE);
const browser = await openPage(PORT);
console.log(`  ${browser.label}; ${list.length} points, ${BARS} bars, site ${SITE}`);
for (const p of list) {
  const dir = path.join(OUT, p.name);
  if (flag('resume') && fs.existsSync(path.join(dir, 'meta.json'))) continue;
  const opts = { strategy: p.strategy, spell: asSpell(p.spell) };
  const track = planTheme(p.seed, p.theme, opts);
  const w = loudnessWindow(track, BARS);
  const began = Date.now();
  const r = await renderToWav(browser.page, {
    masterSeed: p.seed, theme: p.theme, opts,
    preFromBar: Math.max(0, w.from - 2), fromBar: w.from, toBar: w.from + w.bars, tail: 1.5,
  }, path.join(dir, 'mix.wav'), RATE);
  const d = derive(asSpell(p.spell));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    ...p, spell: asSpell(p.spell), bpm: track.bpm, preset: track.preset, density: track.density,
    scene: sceneOfDice(track.dice) ?? null, texture: textureOfDice(track.dice) ?? null,
    tempoFamily: d.tempoFamily, kit: d.kit, drumsOn: d.drumsOn, window: w, seconds: r.seconds, peak: r.peak,
  }, null, 1));
  console.log(`  ${p.name.padEnd(22)} ${String(track.bpm).padStart(5)} BPM ${d.tempoFamily}/${d.kit}${d.drumsOn ? '' : '/no drums'} ${String(sceneOfDice(track.dice)).padEnd(14)} ${((Date.now() - began) / 1000).toFixed(0)} s`);
}
await browser.close();
server.close();
