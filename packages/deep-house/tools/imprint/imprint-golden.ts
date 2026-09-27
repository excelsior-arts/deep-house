// imprint-golden.ts — the fourteen golden themes, read as eight birds.
//
//   node tools/imprint/imprint-golden.ts
//   node tools/imprint/imprint-golden.ts --bars 32 --only 1#0
//   node tools/imprint/imprint-golden.ts --no-imprint      render the wavs only
//   node tools/imprint/imprint-golden.ts --reuse           measure the renders already there
//   node tools/imprint/imprint-golden.ts --strategy house-v2   the same fourteen, under a second composition
//
// The scorecard's calibration stands on one claim: **the record this project
// already makes reads as the house default vector**. That cannot be asserted,
// it has to be measured, and the only way to measure it is to render the music
// and hand the audio to the same tool a reference track would go through. So
// this renders a main-groove window of each of the fourteen locked themes —
// master seeds 1, 92970 and 21323, the golden rule's own catalogue — writes it
// to `tmp/imprint/golden/`, and runs `imprint.py` over each file.
//
// The window is up to thirty-two bars of main groove, chosen by the rule
// `src/loudness.ts` already owns (`loudnessWindow`): the first long main
// section past bar 16, centred. Thirty-two bars and not eight, because Loom
// and Veil are about spans and a curve of phrase novelty cannot be taken off
// eighteen seconds — and it is still a groove and not a whole theme, so the
// reading is the record's centre and not an average over its breakdowns.
//
// Rendered offline through the real graph in headless Chromium against the
// built site, one at a time, the browser reniced to the bottom of the queue,
// the page opened on the silent route. An OfflineAudioContext reaches no output
// device; nothing here can be heard and nothing here plays. The port is 7023
// and never 6975, which is Eugene's dev server.
//
// **`--strategy` is round K5b's**, and it is one line of this tool rather than a
// second one: the fourteen themes are the fourteen themes, and what changes is
// which composition plans them. The default writes the files it has always
// written, so a re-run of the record reuses nine minutes of renders; a named
// strategy writes beside them under its own name. What the two readings are for
// is the only comparison that means anything here — the *same* seed, the same
// window rule, the same anchors, the same scale — so a bird that moves between
// them moved because the catalogue did.
//
// Nothing this writes is in git: `tmp/` is the lab. What leaves it is numbers.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planTheme } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'tmp', 'imprint', 'golden');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

// The golden rule's own catalogue: the three master seeds and their themes, as
// tools/golden.ts names them. This list is a copy of that one on purpose —
// what is being measured is the record, and a tool that took the list from the
// digest would follow a re-bless without anybody saying so.
const MASTERS = { 1: 6, 92970: 4, 21323: 4 };

const PORT = +arg('port', 7023);
const RATE = +arg('rate', 48000);
const BARS = +arg('bars', 32);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const ONLY = arg('only', null);
const PY = arg('python', VENV);
// Which composition plans the fourteen. The default's files keep the names they
// have had since the calibration, so the record's own renders are never
// re-made; every other strategy writes `golden-<id>-<master>-<theme>`.
const STRATEGY = arg('strategy', null);
const TAG = STRATEGY && STRATEGY !== 'house-v1' ? `${STRATEGY}-` : '';

// --- what is rendered -------------------------------------------------------

const jobs = [];
for (const master of Object.keys(MASTERS)) {
  for (let n = 0; n < MASTERS[master]; n++) {
    const name = `${master}#${n}`;
    if (ONLY && name !== ONLY) continue;
    const track = planTheme(String(master), n, { strategy: STRATEGY });
    const w = loudnessWindow(track, BARS);
    const bs = track.barSeconds;
    jobs.push({
      name, masterSeed: master, theme: n, fromBar: w.from, bars: w.bars,
      // The renderer plans it again on the page, so it has to be told the same
      // thing this side was: a window is only the same window if it is a window
      // of the same theme.
      opts: STRATEGY ? { strategy: STRATEGY } : {},
      lead: track.dice.leadTimbre, pad: track.dice.padTimbre, stab: track.dice.stabTimbre,
      bpm: track.bpm, preset: track.preset, key: track.key.name,
      density: track.density, seconds: +(w.bars * bs).toFixed(2),
      // What the renderer takes: the window in bars, which is what keeps a
      // re-render byte-identical (see render.ts).
      preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + w.bars,
      tail: TAIL_SECONDS,
    });
  }
}

// --- the page ---------------------------------------------------------------

// `--reuse` is for the measurement changing rather than the record: the renders
// are deterministic to the sample and take nine minutes, and a re-calibration
// does not need them made again.
const fileOf = (j) => path.join(OUT, `golden-${TAG}${j.masterSeed}-${j.theme}.wav`);
const REUSE = has('reuse') && jobs.every((j) => fs.existsSync(fileOf(j)));
const wrote = [];
const server = REUSE ? { close() {} } : await serveSite(PORT);

fs.mkdirSync(OUT, { recursive: true });
if (REUSE) {
  for (const job of jobs) {
    const file = fileOf(job);
    wrote.push({ job, file, r: null });
  }
  console.log(`  --reuse: ${wrote.length} renders already in ${path.relative(ROOT, OUT)}, nothing rendered`);
} else {
  const browser = await openPage(PORT);
  console.log(`  ${browser.label}; ${STRATEGY || 'house-v1'}`);
  for (const job of jobs) {
    const began = Date.now();
    const file = fileOf(job);
    const r = await renderToWav(browser.page, job, file, RATE);
    wrote.push({ job, file, r });
    console.log(`  ${job.name.padEnd(9)} ${job.preset.padEnd(6)} bar ${String(job.fromBar).padStart(3)}+${job.bars}  ${r.seconds} s  ${r.events} events  ${r.peak} dBFS  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
}
server.close();

// --- and then the measurement ----------------------------------------------

if (has('no-imprint')) {
  console.log(`\n${wrote.length} renders in ${path.relative(ROOT, OUT)}; --no-imprint, so nothing was measured`);
} else if (!fs.existsSync(PY)) {
  console.log(`\n${wrote.length} renders in ${path.relative(ROOT, OUT)}, and nothing measured them: there is no python at ${path.relative(ROOT, PY)}. See tools/imprint/README.md.`);
  process.exitCode = 2;
} else {
  console.log('');
  for (const { job, file } of wrote) {
    const out = file.replace(/\.wav$/, '.json');
    execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, file,
      '--out', out, '--origin', 'golden', '--raw',
      '--label', `golden ${job.name} under ${STRATEGY || 'house-v1'} (${job.preset}, ${job.density}, ${job.key}, ${job.bpm} BPM, ${job.lead}/${job.pad}/${job.stab})`],
      { stdio: 'inherit' });
  }
  console.log(`\n${wrote.length} imprints in ${path.relative(ROOT, OUT)}`);
}
