// What a composition strategy reads as, in the eight birds, over themes it
// rolled itself.
//
//   node tools/imprint/strategy-birds.ts --n 24
//   node tools/imprint/strategy-birds.ts --n 24 --reuse      measure what is there
//   node tools/imprint/strategy-birds.ts --strategies house-v1,house-v2
//
// Round K5b of PLAN-KITCHEN asks a question `imprint-golden.ts` cannot: the
// fourteen golden themes are fourteen *particular* records, and what a widened
// catalogue does to the record is not the same question as what it does to the
// music in general. So this rolls the **same seeds** under each strategy, reads
// a main-groove window of each through the real graph, and reports the mean and
// the spread of the eight birds per strategy.
//
// The same seeds, deliberately. A strategy is a set of weights over lists, so
// two samples drawn from different seeds would differ by the luck of the draw
// as well as by the weights, and no sample this size could tell the two apart.
// Rolled from one seed under two strategies, every difference is the catalogue.
//
// The sample is **stated and small**, and that is the honest shape of it: a
// window is a render of thirty-two bars through the whole graph and a hundred
// of them is an hour. `--n` is the number of themes per strategy and it is
// printed in every line of the report, because a mean of twenty-four is a
// reading and a mean of two hundred is another one.
//
// Rendered offline through the real graph in headless Chromium against the
// built site, one at a time, the browser reniced to the bottom of the queue,
// the page on the silent route. An OfflineAudioContext reaches no output
// device. The port is 7048 and never 6975, which is Eugene's dev server.
//
// Nothing this writes is in git: `tmp/` is the lab. What leaves it is numbers.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';

const OUT = path.join(ROOT, 'tmp', 'imprint', 'strategy');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const N = +arg('n', 24);
const PORT = +arg('port', 7048);
const RATE = +arg('rate', 48000);
const BARS = +arg('bars', 32);
const FIRST = +arg('first', 1000);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const PY = arg('python', VENV);
const STRATEGIES = arg('strategies', 'house-v1,house-v2').split(',').filter(Boolean);
const BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];

// The same seeds every strategy is asked about, and the same seeds every run
// asks about: masters 1000 and up, theme 0, which is the block round K5a's pull
// proof and round K5b's share table are both counted over.
const SEEDS = Array.from({ length: N }, (_, i) => String(FIRST + i));

const jobs = [];
for (const strategy of STRATEGIES) {
  for (const master of SEEDS) {
    const track = planTheme(master, 0, { strategy });
    const w = loudnessWindow(track, BARS);
    jobs.push({
      strategy, masterSeed: master, theme: 0,
      opts: { strategy },
      preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + w.bars,
      tail: TAIL_SECONDS,
      say: `${track.preset} ${track.density} ${track.bpm} BPM ${track.dice.leadTimbre}/${track.dice.padTimbre}/${track.dice.stabTimbre}`,
    });
  }
}

const fileOf = (j) => path.join(OUT, `${j.strategy}-${j.masterSeed}.wav`);
const REUSE = has('reuse') && jobs.every((j) => fs.existsSync(fileOf(j)));

fs.mkdirSync(OUT, { recursive: true });
if (!REUSE) {
  const server = await serveSite(PORT);
  const browser = await openPage(PORT);
  console.log(`  ${browser.label}; ${STRATEGIES.join(', ')} over ${N} seeds each`);
  for (const job of jobs) {
    const began = Date.now();
    const r = await renderToWav(browser.page, job, fileOf(job), RATE);
    console.log(`  ${job.strategy.padEnd(9)} ${job.masterSeed.padEnd(5)} ${job.say.padEnd(44)} ${r.seconds} s  ${String(r.events).padStart(5)} events  ${r.peak} dBFS  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  server.close();
} else {
  console.log(`  --reuse: ${jobs.length} renders already in ${path.relative(ROOT, OUT)}`);
}

if (!fs.existsSync(PY)) {
  console.log(`\nnothing measured them: there is no python at ${path.relative(ROOT, PY)}`);
  process.exitCode = 2;
} else {
  for (const job of jobs) {
    const file = fileOf(job);
    const out = file.replace(/\.wav$/, '.json');
    if (has('reuse') && fs.existsSync(out)) continue;
    execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, file, '--out', out,
      '--origin', 'generated', '--raw', '--quiet',
      '--label', `${job.strategy} ${job.masterSeed}#0 (${job.say})`]);
  }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const sd = (xs) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
  };

  const read = {};
  for (const strategy of STRATEGIES) {
    read[strategy] = {};
    for (const b of BIRDS) read[strategy][b] = [];
    for (const job of jobs.filter((j) => j.strategy === strategy)) {
      const row = JSON.parse(fs.readFileSync(fileOf(job).replace(/\.wav$/, '.json'), 'utf8'));
      for (const b of BIRDS) read[strategy][b].push(row.summary.birds[b].median);
    }
  }

  console.log(`\n## The eight birds, over ${N} themes of each strategy, the same seeds under both\n`);
  console.log(`| bird | ${STRATEGIES.map((s) => `${s} mean`).join(' | ')} | ${STRATEGIES.map((s) => `${s} sd`).join(' | ')} | mean moved | spread moved |`);
  console.log(`|---|${STRATEGIES.map(() => '---|').join('')}${STRATEGIES.map(() => '---|').join('')}---|---|`);
  for (const b of BIRDS) {
    const means = STRATEGIES.map((s) => mean(read[s][b]));
    const sds = STRATEGIES.map((s) => sd(read[s][b]));
    const dm = means[means.length - 1] - means[0];
    const ds = sds[sds.length - 1] - sds[0];
    console.log(`| ${b} | ${means.map((x) => x.toFixed(3)).join(' | ')} | ${sds.map((x) => x.toFixed(3)).join(' | ')} | ${dm >= 0 ? '+' : ''}${dm.toFixed(3)} | ${ds >= 0 ? '+' : ''}${ds.toFixed(3)} |`);
  }
  console.log(`\n${jobs.length} renders in ${path.relative(ROOT, OUT)}, ${N} per strategy`);
}
