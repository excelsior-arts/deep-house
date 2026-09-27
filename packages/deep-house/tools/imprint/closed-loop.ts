// closed-loop.ts — the test the whole phase is for: ask for a sound, and then
// measure whether the sound came back.
//
//   node tools/imprint/closed-loop.ts --recipe house/sub-room --n 24
//   node tools/imprint/closed-loop.ts --pull tide:0.85 --n 8
//
// Everything else in phase 1 is arithmetic over a table. This is the loop
// closed: a spell is rolled inside a recipe's box, the bias turns it into
// weights, the dice draw under them, the theme is rendered, and the render is
// imprinted on the same scale the box was cut from. If the bias does what the
// birds say, the readings come back inside the box.
//
// It is slow — a render is most of a minute — so it is not in `npm run check`.
// What is in `npm run check` is the proxy: where the signatures *predict* a
// weighted pool will land. This is the thing the proxy stands for, and the
// numbers it prints go in `notes/archive/2026-09-kitchen/rounds/phase-1.md`.
//
// The control is free: the sweep already rendered seeds 1..40 theme 0 at the
// house, on this window and this scale, so a pulled spell is compared against
// the same seeds rather than against an average of something else.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { BIRDS, HOUSE, asSpell, parseSpell } from '../../src/spell.ts';
import { boxOf, spellFrom, outsideBox } from '../../src/recipe.ts';
import { recipeById } from '../../src/recipes.ts';
import Rng from '../../src/rng.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';

const OUT = path.join(ROOT, 'tmp', 'imprint', 'loop');
const SWEEP = path.join(ROOT, 'tmp', 'imprint', 'sweep');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const PORT = +arg('port', 7033);
const RATE = +arg('rate', 48000);
const BARS = +arg('bars', 32);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const N = +arg('n', 24);
const PY = arg('python', VENV);
const RECIPE = arg('recipe', null);
const PULL = arg('pull', null);

const r3 = (x) => Math.round(x * 1000) / 1000;
const dist = (a, b) => Math.sqrt(BIRDS.reduce((s, x) => s + (a[x] - b[x]) ** 2, 0));
const outOf = (o) => Math.sqrt(Object.values(o).reduce((s, x) => s + x * x, 0));

// --- what is asked for ------------------------------------------------------

const row = RECIPE ? recipeById(RECIPE) : null;
if (RECIPE && !row) throw new Error(`no recipe called ${RECIPE}`);
const pulled = PULL ? asSpell({ ...HOUSE, ...parseSpell(PULL) }) : null;
if (!row && !pulled) throw new Error('say --recipe <id> or --pull <bird:value>');
const tag = row ? row.id.replace(/\//g, '-') : `pull-${PULL.replace(/[:=]/g, '')}`;

const jobs = [];
for (let i = 1; i <= N; i++) {
  const master = String(i);
  // The spell a `?recipe=` would roll on this master seed, off `::spell` — the
  // same draw `spellFor` makes, so what is rendered is what the URL plays.
  const spell = row ? spellFrom(row, new Rng(`${master}::spell`)) : pulled;
  const track = planTheme(master, 0, { spell });
  const w = loudnessWindow(track, BARS);
  jobs.push({
    name: `${tag}-${master}`, masterSeed: master, theme: 0, spell,
    opts: { spell },
    preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + w.bars,
    tail: TAIL_SECONDS,
    say: `${track.preset} ${track.density} ${track.bpm} BPM`,
  });
}

// --- render and measure -----------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
const todo = jobs.filter((j) => !fs.existsSync(path.join(OUT, `${j.name}.json`)) || has('force'));
if (todo.length) {
  const server = await serveSite(PORT);
  const browser = await openPage(PORT);
  console.log(`  ${browser.label}; ${todo.length} of ${jobs.length} to render`);
  for (const j of todo) {
    const began = Date.now();
    const wav = path.join(OUT, `${j.name}.wav`);
    const r = await renderToWav(browser.page, j, wav, RATE);
    execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, wav, '--out', wav.replace(/\.wav$/, '.json'),
      '--origin', 'generated', '--raw', '--quiet', '--label', `closed loop ${j.name} (${j.say})`], { stdio: 'inherit' });
    if (!has('keep-wav')) fs.rmSync(wav, { force: true });
    console.log(`  ${j.name.padEnd(24)} ${j.say.padEnd(24)} ${r.seconds} s  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  server.close();
}

const readingOf = (file) => {
  if (!fs.existsSync(file)) return null;
  const im = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(BIRDS.map((b) => [b, im.summary.birds[b].median]));
};

console.log('');
if (row) {
  const box = boxOf(row);
  console.log(`  ${row.id}: ${BIRDS.map((b) => `${b.slice(0, 2)} ${box[b][0].toFixed(2)}-${box[b][1].toFixed(2)}`).join('  ')}`);
  let inside = 0;
  let sum = 0;
  let asked = 0;
  const misses = {};
  for (const j of jobs) {
    const read = readingOf(path.join(OUT, `${j.name}.json`));
    if (!read) continue;
    const out = outsideBox(row, read);
    const d = outOf(out);
    if (!Object.keys(out).length) inside++;
    else for (const b of Object.keys(out)) misses[b] = (misses[b] || 0) + 1;
    sum += d;
    asked += dist(read, j.spell);
    console.log(`  ${j.name.padEnd(24)} ${BIRDS.map((b) => read[b].toFixed(2)).join(' ')}  out ${d.toFixed(3)}  ${Object.keys(out).map((b) => `${b} ${r3(out[b])}`).join(' ') || 'inside'}`);
  }
  const n = jobs.filter((j) => readingOf(path.join(OUT, `${j.name}.json`))).length;
  console.log(`\n  ${inside} of ${n} inside the box; mean distance out ${(sum / n).toFixed(3)}; mean distance from the spell that was rolled ${(asked / n).toFixed(3)}`);
  console.log(`  the birds that put a reading out: ${Object.entries(misses).sort((a, b) => b[1] - a[1]).map(([b, k]) => `${b} ${k}`).join(', ') || 'none'}`);
} else {
  // A pull, against the same seeds at the house. The sweep rendered those and
  // this reads them where they are; nothing is rendered twice.
  console.log(`  ${PULL}: the same seeds at the house, and then pulled`);
  const moved = Object.fromEntries(BIRDS.map((b) => [b, []]));
  let n = 0;
  for (const j of jobs) {
    const there = readingOf(path.join(OUT, `${j.name}.json`));
    const here = readingOf(path.join(SWEEP, `sweep-${j.masterSeed}-0.json`));
    if (!there || !here) continue;
    n++;
    for (const b of BIRDS) moved[b].push(there[b] - here[b]);
    console.log(`  seed ${j.masterSeed.padEnd(4)} ${BIRDS.map((b) => `${(there[b] - here[b] >= 0 ? '+' : '') + (there[b] - here[b]).toFixed(2)}`).join(' ')}`);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`\n  ${n} seeds, the reading moved: ${BIRDS.map((b) => `${b} ${(mean(moved[b]) >= 0 ? '+' : '') + mean(moved[b]).toFixed(3)}`).join(', ')}`);
  console.log(`  the spell asked for: ${BIRDS.map((b) => `${b} ${(pulled[b] - HOUSE[b] >= 0 ? '+' : '') + (pulled[b] - HOUSE[b]).toFixed(3)}`).join(', ')}`);
}
