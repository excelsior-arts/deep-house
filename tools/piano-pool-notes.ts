// piano-pool (11-01), scratch: with `phrase` (notes with a time `t`), the notes on one timeline in one context, a phrase;
// else a piano row's notes one by one, dry, through the engine's own piano topology, with the
// row's parameters patched per render (so "before" is the same row with a field taken out: `null` deletes it). Each
// note renders alone in its own OfflineAudioContext for `window` seconds (its later ring is cut; nothing overlaps the
// next strike) and the windows are laid end to end into one stereo WAV; notes.json beside it says where each starts.
// Silent: nothing reaches an output.
//
//   node tools/piano-pool-notes.ts <port> <out-dir> <spec.json> [engine-root]
//
// spec: { rate?, window?, link?, notes?: [{midi, vel, dur, ring?, held?}] | grid?: {midi:[], vel:[], life:[]},
//         renders: [{ name, voice, topology?, patch?, piano?, row? }] }
//   patch   a partial of the row's parameters (deep merge, null deletes), for a row without a block
//   piano   a partial of the settings' `piano` block (the house piano: the block is what it plays)
//   row     another row's id whose parameters stand in (with `patch` over them)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '../packages/engine/tools/harness.ts';
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';

const [port, out, specFile, engineRoot] = [+process.argv[2], process.argv[3], process.argv[4], process.argv[5]];
fs.mkdirSync(out, { recursive: true });
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const ENGINE = engineRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'engine');
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

const RUN = async ({ base, settings, notes, render, rate, win }) => {
  const V = await import(`${base}src/voices/index.ts`);
  const P = await import(`${base}src/voices/piano.ts`);
  const merge = (a, b) => { if (b === null) return undefined; if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b; const o = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) }; for (const k of Object.keys(b)) { const v = merge(o[k], b[k]); if (v === undefined) delete o[k]; else o[k] = v; } return o; };
  const real = V.BY_NAME[render.voice].row;
  const src = render.row ? V.BY_NAME[render.row].row : real;
  const row = { ...real, parameters: merge(JSON.parse(JSON.stringify(src.parameters)), render.patch ?? {}) };
  const topo = row.topology === 'piano' ? P.PIANO : null;
  const play = topo ? topo.render(row) : V.VOICES[render.voice];
  if (notes.length && typeof notes[0].t === 'number') {
    const len = Math.ceil((Math.max(...notes.map((x) => x.t + x.dur)) + win) * rate);
    const ctx = new OfflineAudioContext(2, len, rate);
    const evs = notes.map((x, i) => ({ i, voice: render.voice, layer: 'keys', t: 0.05 + x.t, p: { gain: 1, ...x } }));
    if (topo && !render.row && !render.patch) await P.preparePiano(ctx, settings, evs, { all: true });
    for (const e of evs) play(ctx, { dry: ctx.destination }, e.t, e.p, settings);
    const buf = await ctx.startRendering();
    const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1), f0 = new Float32Array(L0.length * 2);
    for (let i = 0; i < L0.length; i++) { f0[2 * i] = L0[i]; f0[2 * i + 1] = R0[i]; }
    const b0 = new Uint8Array(f0.buffer), c0 = [];
    for (let o = 0; o < b0.length; o += 1 << 20) { let s = ''; const end = Math.min(b0.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...b0.subarray(i, Math.min(end, i + 4096))); c0.push(btoa(s)); }
    return c0;
  }
  const n = Math.ceil(win * rate);
  const L = new Float32Array(n * notes.length), R = new Float32Array(n * notes.length);
  for (let i = 0; i < notes.length; i++) {
    const ctx = new OfflineAudioContext(2, n, rate);
    play(ctx, { dry: ctx.destination }, 0.05, { gain: 1, ...notes[i] }, settings);
    const buf = await ctx.startRendering();
    L.set(buf.getChannelData(0), i * n); R.set(buf.getChannelData(1), i * n);
  }
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
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };

const { pw } = await playwright();
const browser = await pw.chromium.launch({ ...launchOptions('chromium'), args: [...(launchOptions('chromium').args ?? []), '--mute-audio'] });
renice(browser);
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
try {
  const settings = JSON.parse(JSON.stringify(programOf(quiet(() => played(spec.link ?? 'seed=40&v=2').plan)).settings));
  const rate = spec.rate ?? 32000, win = spec.window ?? 3;
  const notes: any[] = spec.notes ?? [];
  if (!spec.notes) { const G = spec.grid; for (const life of G.life) for (const midi of G.midi) for (const vel of G.vel) notes.push({ midi, vel, dur: life, ring: 0 }); }
  for (const r of spec.renders) {
    const file = `${out}/${r.name}.wav`;
    if (fs.existsSync(file) && !r.again && !spec.again) { console.log(r.name, 'kept'); continue; }
    const del = (a: any, b: any): any => { if (b === null) return undefined; if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b; const o = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) }; for (const k of Object.keys(b)) { const v = del(o[k], b[k]); if (v === undefined) delete o[k]; else o[k] = v; } return o; };
    const s = r.settings ? del(settings, r.settings) : r.piano ? merge(settings, { piano: r.piano }) : settings;
    const chunks = await page.evaluate(RUN, { base: `http://127.0.0.1:${port}/`, settings: s, notes: r.notes ?? notes, render: { ...r, notes: undefined }, rate, win });
    fs.writeFileSync(file, wav(Buffer.concat(chunks.map((c: string) => Buffer.from(c, 'base64'))), rate));
    console.log(r.name);
  }
  fs.writeFileSync(`${out}/notes.json`, JSON.stringify({ window: win, start: 0.05, rate, notes }));
} finally { await browser.close(); server.close(); }
