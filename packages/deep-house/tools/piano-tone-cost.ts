// Round piano-tone (10-29): what the string costs to prepare. For each link, the theme's piano events and its room as
// the page plans them, handed to the engine's own `preparePiano` in a headless page (the engine's sources served as
// they are, no app around them), twice: the six-partial string (`string: null` in the room) and the row's string as
// house-v2 writes it. Timed: the offline render's whole preparation (`{ all: true }`, every distinct string of the
// theme) and the live window a set prepares before a theme plays (`{ from: 0 }`, what fits the cache's share). Read
// beside them: the strings, the renders, the bytes held. A note at play is not measured here: it builds the same
// nodes either way (one cached buffer, two filters, a pan, an envelope and the hammer's noise and filter). Silent: an
// OfflineAudioContext, nothing reaches an output.
//
//   node tools/piano-tone-cost.ts <port> [--runs 5] <link>...

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '../../engine/tools/harness.ts';
import { played } from './link-digest.ts';
import { programOf } from '../src/performance.ts';

const argv = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = +argv[i + 1]; argv.splice(i, 2); return v; };
const RUNS = opt('runs', 5);
const [port, ...links] = [+argv[0], ...argv.slice(1)];

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine');
const ROOTS: Record<string, string> = { '/src/': path.join(ENGINE, 'src'), '/sounds/': path.join(ENGINE, 'sounds') };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${port}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>piano cost</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : 'text/javascript', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise<void>((done) => server.listen(port, '127.0.0.1', () => done()));

const RUN = async ({ base, settings, events, live }) => {
  await import(`${base}src/voices/index.ts`);
  const P = await import(`${base}src/voices/piano.ts`);
  P.resetPianoCacheStats();
  const ctx = new OfflineAudioContext(2, 48000, 48000);
  const t0 = performance.now();
  await P.preparePiano(ctx, settings, events, live ? { from: 0, id: {} } : { all: true });
  const ms = performance.now() - t0;
  return { ms, renders: P.pianoCacheStats().renders, mib: P.pianoCacheBytes(ctx) / 1048576 };
};

const { pw } = await playwright();
const browser = await pw.chromium.launch(launchOptions('chromium'));
renice(browser);
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
const median = (xs: number[]) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
try {
  for (const link of links) {
    const program = programOf(played(link).plan);
    const events = JSON.parse(JSON.stringify(program.events.filter((e) => e.voice === 'piano')));
    const settings = JSON.parse(JSON.stringify(program.settings));
    const six = { ...settings, piano: { ...settings.piano, string: null } };
    for (const live of [false, true]) {
      const got: Record<string, { ms: number[]; renders: number; mib: number }> = {};
      for (let r = 0; r < RUNS; r++) for (const [k, s] of [['six', six], ['string', settings]] as const) {
        const x = await page.evaluate(RUN, { base: `http://127.0.0.1:${port}/`, settings: s, events, live });
        got[k] ??= { ms: [], renders: x.renders, mib: x.mib };
        got[k].ms.push(x.ms);
      }
      const a = median(got.six.ms), b = median(got.string.ms);
      console.log(`${link} | ${live ? 'live window' : 'whole theme'} | ${events.length} notes, ${got.six.renders} strings (${got.six.mib.toFixed(1)} MiB) / ${got.string.renders} (${got.string.mib.toFixed(1)} MiB) | six partials ${Math.round(a)} ms, the string ${Math.round(b)} ms (${b >= a ? '+' : ''}${Math.round((b / a - 1) * 100)} %; ${(a / got.six.renders).toFixed(1)} → ${(b / got.string.renders).toFixed(1)} ms a string)`);
    }
  }
} finally { await browser.close(); server.close(); }
