// Round piano-tone (10-29): the piano's notes one by one, the six-partial string against the row's string, in a
// theme's own room. Each of the theme's piano notes (its pitch, velocity, length and per-note controls) is played alone
// through the engine's piano voice into an OfflineAudioContext, dry (no hall), both ways, and written as one mono WAV
// a side with the notes 3 s apart; the listing beside it says where each note starts. Silent: nothing reaches an
// output. `tools/piano-tone-notes.py`-style readers measure the two files note by note.
//
//   node tools/piano-tone-notes.ts <port> <out-dir> <link> [--every n]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '../../engine/tools/harness.ts';
import { played } from './link-digest.ts';
import { programOf } from '../src/performance.ts';

const argv = process.argv.slice(2);
const every = (() => { const i = argv.indexOf('--every'); if (i < 0) return 1; const v = +argv[i + 1]; argv.splice(i, 2); return v; })();
const [port, out, link] = [+argv[0], argv[1], argv[2]];
fs.mkdirSync(out, { recursive: true });

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine');
const ROOTS: Record<string, string> = { '/src/': path.join(ENGINE, 'src'), '/sounds/': path.join(ENGINE, 'sounds') };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${port}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>piano notes</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : 'text/javascript', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise<void>((done) => server.listen(port, '127.0.0.1', () => done()));

const RUN = async ({ base, settings, notes, gap }) => {
  const V = await import(`${base}src/voices/index.ts`);
  const P = await import(`${base}src/voices/piano.ts`);
  const rate = 48000;
  const ctx = new OfflineAudioContext(1, Math.ceil((notes.length * gap + 1) * rate), rate);
  const events = notes.map((p, i) => ({ i, voice: 'piano', layer: 'keys', t: 0.2 + i * gap, p }));
  await P.preparePiano(ctx, settings, events, { all: true });
  for (const e of events) V.VOICES.piano(ctx, { dry: ctx.destination }, e.t, e.p, settings);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  const bytes = new Uint8Array(d.buffer.slice(0)), chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  return chunks;
};

const wav = (f: Buffer, rate: number) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + f.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(f.length, 40);
  return Buffer.concat([h, f]);
};

const { pw } = await playwright();
const browser = await pw.chromium.launch(launchOptions('chromium'));
renice(browser);
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
try {
  const program = programOf(played(link).plan);
  const notes = program.events.filter((e) => e.voice === 'piano').filter((_, i) => i % every === 0).map((e) => ({ ...e.p, gain: 1 }));
  const settings = JSON.parse(JSON.stringify(program.settings));
  const gap = 3;
  for (const [side, s] of [['six', { ...settings, piano: { ...settings.piano, string: null } }], ['string', settings]] as const) {
    const chunks = await page.evaluate(RUN, { base: `http://127.0.0.1:${port}/`, settings: s, notes: JSON.parse(JSON.stringify(notes)), gap });
    fs.writeFileSync(`${out}/${side}.wav`, wav(Buffer.concat(chunks.map((c: string) => Buffer.from(c, 'base64'))), 48000));
  }
  fs.writeFileSync(`${out}/notes.json`, JSON.stringify({ link, gap, start: 0.2, notes }));
  console.log(`${notes.length} notes of ${link} written to ${out}`);
} finally { await browser.close(); server.close(); }
