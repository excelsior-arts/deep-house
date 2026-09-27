// kitchen-presence.ts — the sixteenth lane's tuned voices behind the drone,
// each metered alone against the hats layer on the theme's first main.
//
//   node packages/deep-house/tools/imprint/kitchen-presence.ts
//   ... --from 1 --to 200 --margin 6 --site tmp/<somewhere>/site
//
// Eugene, 09-23, of seed 33 (body + chords, the drone behind): "the woodblock
// is still a bit too pronounced compared to the rest of the mix; when in
// machine view I set the woodblock to 20 % volume it got back into the mix".
// The lane trim matched every sixteenth to the shaker's loudness, and a voice
// whose energy is in 400 Hz-2 kHz matched to a shaker owns a band nothing else
// in a drone-behind mix is in. The style writes it `Lane.presence` under its
// trim there; this is the render that says where that lands.
//
// Every ordinary house-v2 theme 0 of the range whose scene is drone-back and
// whose sixteenth lane plays a voice the presence reaches is rendered twice
// over its first main's eight bars (`loudnessWindow`): the lane's layer alone
// and the hats layer alone. The line: the lane reads at least `--margin` LU
// under the hats. A theme with another part on the lane's layer in the window
// (a hand row) is refused rather than metered as the lane.
//
// One headless Chromium, one render at a time, reniced, on port 7093 and
// never 6975. A scratch build, never docs/.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { sceneOfDice } from '../../src/composition.ts';
import { strategyById } from '../../src/strategies/index.ts';
import { BY_NAME } from '@deep-house/engine/voices';
import { integratedLoudness } from '@deep-house/engine/meter';
import { ROOT, serveSite, openPage, renderToWav } from './render.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FROM = +arg('from', 1), TO = +arg('to', 200), MARGIN = +arg('margin', 6), PORT = +arg('port', 7093), RATE = 48000;
const SITE = arg('site', path.join('tmp', 'kitchen-presence', 'site'));
const LAB = path.join(ROOT, 'tmp', 'kitchen-presence');

const style = strategyById('house-v2').style;
const lane = style.lanes.find((l) => l.presence?.length);
if (!lane) throw new Error('no lane of house-v2 carries a presence');
const reached = (voice) => {
  const e = lane.voices.find((c) => c.v === voice);
  return !!e && lane.presence.some((p) => p.scene === 'drone-back' && (e.mid ?? 0) >= p.midFrom);
};

const themes = [];
for (let s = FROM; s <= TO; s++) {
  const t = planTheme(String(s), 0, { strategy: 'house-v2' });
  if (sceneOfDice(t.dice) !== 'drone-back') continue;
  const layer = BY_NAME[lane.incumbent ?? lane.voices[0].v].layer;
  const tuned = [...new Set(t.events.filter((e) => e.layer === layer && !e.part).map((e) => e.voice))].filter(reached);
  if (!tuned.length) continue;
  const w = loudnessWindow(t, 8), bs = t.barSeconds;
  const inWindow = t.events.filter((e) => e.layer === layer && e.t >= w.from * bs && e.t < (w.from + w.bars) * bs);
  if (inWindow.some((e) => e.part)) throw new Error(`seed ${s}: another part plays the ${layer} layer in bars ${w.from}+${w.bars}`);
  themes.push({ seed: String(s), voice: tuned.join('+'), layer, w, gain: inWindow[0]?.p.gain });
}
console.error(`  ${themes.length} drone-back themes of ${FROM}-${TO} with a tuned sixteenth: ${themes.map((t) => `${t.seed} ${t.voice}`).join(', ')}`);

function readWav(file) {
  const b = fs.readFileSync(file);
  const n = (b.length - 44) / 4, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { L[i] = b.readInt16LE(44 + i * 4) / 32768; R[i] = b.readInt16LE(46 + i * 4) / 32768; }
  return [L, R];
}
const site = path.isAbsolute(SITE) ? SITE : path.join(ROOT, SITE);
if (!fs.existsSync(path.join(site, 'index.html')) || process.argv.includes('--build'))
  execFileSync('npx', ['vite', 'build', '--outDir', site, '--logLevel', 'error'], { cwd: path.join(ROOT, 'packages', 'deep-house'), stdio: 'inherit' });
fs.mkdirSync(LAB, { recursive: true });
const server = await serveSite(PORT, site);
const page = await openPage(PORT);
const rows = [];
try {
  for (const t of themes) {
    const lufs = {};
    for (const layer of [t.layer, 'hats']) {
      const file = path.join(LAB, `${t.seed}-${layer}.wav`);
      await renderToWav(page.page, { masterSeed: t.seed, theme: 0, opts: { strategy: 'house-v2' },
        preFromBar: Math.max(0, t.w.from - 2), fromBar: t.w.from, toBar: t.w.from + t.w.bars, tail: 1.5, layers: [layer] }, file, RATE);
      lufs[layer] = +integratedLoudness(readWav(file), RATE).toFixed(2);
    }
    const over = +(lufs[t.layer] - lufs.hats).toFixed(2);
    rows.push({ ...t, lane: lufs[t.layer], hats: lufs.hats, over });
    console.error(`  ${t.seed.padStart(4)} ${t.voice.padEnd(10)} bars ${t.w.from}+${t.w.bars}  lane ${lufs[t.layer]} LUFS  hats ${lufs.hats}  ${over >= 0 ? '+' : ''}${over} LU`);
  }
} finally {
  await page.close();
  server.close();
}
const loud = rows.filter((r) => r.over > -MARGIN);
if (loud.length) throw new Error(`a tuned sixteenth out-louds its line of ${MARGIN} LU under the hats: ${loud.map((r) => `${r.seed} ${r.voice} ${r.over}`).join(', ')}`);
console.log(`${rows.length} themes, every tuned sixteenth at least ${MARGIN} LU under the hats (closest ${Math.max(...rows.map((r) => r.over))} LU)`);
