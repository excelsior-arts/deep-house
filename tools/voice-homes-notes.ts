// voice-homes (11-01), scratch: a copy of piano-tone's note renderer. A fixed set of test notes (pitches by velocity,
// a short and a held length) and, with --theme, a theme's own piano notes, played one by one, dry, through the
// engine's piano voice in a link's room, once per variant (a partial of the room's `piano` block, merged), into a
// stereo WAV a variant, notes `gap` seconds apart; notes.json beside them. Silent: an OfflineAudioContext.
//   node tools/voice-homes-notes.ts <port> <out-dir> <link> <variants.json>
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
import { playwright, launchOptions, renice } from '../packages/engine/tools/harness.ts';
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';

const argv = process.argv.slice(2);
const every = (() => { const i = argv.indexOf('--every'); if (i < 0) return 1; const v = +argv[i + 1]; argv.splice(i, 2); return v; })();
const [port, out, link, variantsFile, notesFile] = [+argv[0], argv[1], argv[2], argv[3], argv[4]];
fs.mkdirSync(out, { recursive: true });

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'engine');
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

const RUN = async ({ base, settings, notes, gap, voice }) => {
  const V = await import(`${base}src/voices/index.ts`);
  const P = await import(`${base}src/voices/piano.ts`);
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil((notes.length * gap + 1) * rate), rate);
  const events = notes.map((p, i) => ({ i, voice: voice ?? 'piano', layer: 'keys', t: 0.2 + i * gap, p }));
  await P.preparePiano(ctx, settings, events, { all: true });
  for (const e of events) V.VOICES[voice ?? 'piano'](ctx, { dry: ctx.destination }, e.t, e.p, settings);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer), chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  return chunks;
};

const wav = (f: Buffer, rate: number) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + f.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(f.length, 40);
  return Buffer.concat([h, f]);
};
const merge = (a: any, b: any): any => { if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b; const o = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) }; for (const k of Object.keys(b)) o[k] = merge(o[k], b[k]); return o; };

const { pw } = await playwright();
const browser = await pw.chromium.launch(launchOptions('chromium'));
renice(browser);
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
try {
  const program = programOf(played(link).plan);
  const settings = JSON.parse(JSON.stringify(program.settings));
  const variants: Record<string, any> = JSON.parse(fs.readFileSync(variantsFile, 'utf8'));
  const notes: any[] = notesFile ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : [];
  if (!notesFile) for (const dur of [1.2, 4]) for (const midi of [43, 48, 55, 60, 64, 67, 72, 79]) for (const vel of (dur === 4 ? [0.6] : [0.35, 0.6, 0.85])) notes.push({ midi, vel, dur, gain: 1, panAbout: midi });
  const gap = 5;
  for (const [name, v] of Object.entries(variants)) {
    const { voice, ...rest } = v;
    const s = merge(settings, { piano: rest });
    const chunks = await page.evaluate(RUN, { base: `http://127.0.0.1:${port}/`, settings: s, notes, gap, voice });
    fs.writeFileSync(`${out}/${name}.wav`, wav(Buffer.concat(chunks.map((c: string) => Buffer.from(c, 'base64'))), 48000));
    console.log(name);
  }
  fs.writeFileSync(`${out}/notes.json`, JSON.stringify({ link, gap, start: 0.2, notes }));
} finally { await browser.close(); server.close(); }
