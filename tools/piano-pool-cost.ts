// piano-pool (11-01), scratch: a copy of piano-tone's cost tool. What each piano costs to prepare and hold, on one
// part: for each link, its piano part's events and room as the page plans them, handed to the engine's `preparePiano`
// (engine sources served as they are), once per piano: the house piano, and each grand of the pool voicing the room
// (`pianoVoicing`, the part's touch on it: `touchOnGrand`). Or, with --voice, the link's own events of that voice, as
// they are (the liquid keys' grands), so the same link can be timed on two engines (`--engine <root>`). Timed: the
// whole theme (`all`) and the live window (`from: 0`); read: the strings rendered and the MiB held. Silent.
//
//   node tools/piano-pool-cost.ts <port> [--runs 3] [--engine root] [--voice v] <link>...

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '../packages/engine/tools/harness.ts';
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
import { pianoVoicing, touchOnGrand } from '../packages/deep-house/src/piano-pool.ts';

const argv = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = +argv[i + 1]; argv.splice(i, 2); return v; };
const RUNS = opt('runs', 3);
const str = (k: string) => { const i = argv.indexOf(`--${k}`); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const engineRoot = str('engine'), voiceOnly = str('voice');
const [port, ...links] = [+argv[0], ...argv.slice(1)];

const ENGINE = engineRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'engine');
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
  const GRANDS = ['piano', 'pianoClose', 'pianoUpright', 'pianoMute', 'pianoFelt', 'pianoConcert', 'pianoMellow'];
  for (const link of links) {
    const program = programOf(played(link).plan) as any;
    const settings = JSON.parse(JSON.stringify(program.settings));
    const cases: Array<[string, any, any[]]> = [];
    if (voiceOnly) cases.push([voiceOnly, settings, JSON.parse(JSON.stringify(program.events.filter((e: any) => e.voice === voiceOnly)))]);
    else {
      const ev = JSON.parse(JSON.stringify(program.events.filter((e: any) => e.voice === 'piano')));
      // the house room (a theme the pool leaves on the house piano): the room every grand voices over
      const room = (programOf(played('seed=40&v=2').plan) as any).settings.piano;
      for (const g of GRANDS) {
        const v = g === 'piano' ? null : pianoVoicing(g, room);
        const s2 = { ...settings, piano: v ? { ...room, ...v } : room };
        cases.push([g, s2, v ? ev.map((e: any) => ({ ...e, p: touchOnGrand(e.p, room, v) })) : ev]);
      }
    }
    for (const [g, s2, events] of cases) {
      const out: string[] = [];
      for (const live of [false, true]) {
        const ms: number[] = []; let renders = 0, mib = 0;
        for (let r = 0; r < RUNS; r++) { const x = await page.evaluate(RUN, { base: `http://127.0.0.1:${port}/`, settings: s2, events, live }); ms.push(x.ms); renders = x.renders; mib = x.mib; }
        out.push(`${live ? 'live' : 'whole'} ${Math.round(median(ms))} ms, ${renders} strings, ${mib.toFixed(1)} MiB`);
      }
      console.log(`${link} | ${g} | ${events.length} notes | ${out.join(' | ')}`);
    }
  }
} finally { await browser.close(); server.close(); }
