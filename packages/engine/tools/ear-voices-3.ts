// Round KV1's voices, as four-bar files somebody can listen to.
//
//   node packages/engine/tools/ear-voices-3.ts
//   node packages/engine/tools/ear-voices-3.ts --only reeseBass
//
// writes, at 48 kHz, into `tmp/kv1/` (never committed):
//
//   kv1-<id>.wav   four bars of one instrument on its figure, a chord a bar,
//                  with a quiet organ pad under anything that is not a pad
//
// `ear-voices-2.ts`'s twin with this round's table behind it, and part of no
// suite: the gate (`tools/test-voices-3.ts`) says whether an instrument is what
// it claims; whether it is worth having is Eugene's ear.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT, playwright, launchOptions, renice, listenOn } from './harness.ts';
import { KV1_VOICES } from './audition-voices-3.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
// `/sounds/` is the rows the registry imports (rounds R1 and R2).
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE, '/sounds/': path.join(HERE, '..', 'sounds') };
const OUT = path.join(ROOT, 'tmp', 'kv1');
// The default says what the flag is in — a rate is a number and a name is a
// string or nothing — so what comes back is a string off the command line or
// whatever was handed in.
const arg = <T>(k: string, d: T): string | T => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RATE = +arg('rate', 48000);
const ONLY = arg('only', null);
// ...and the echo send, on the struck organ's stabs: `echo`.
const WANT = [...KV1_VOICES, 'echo'].filter((k) => !ONLY || k === ONLY);

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, 'http://127.0.0.1').pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>kitchen</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  // `root` is a string wherever `file` is one: they are set together on the line
  // above, and this arm is only reached when `file` was named.
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
const PORT = await listenOn(server, 0);

/**
 * What the page is asked for: the URL it loads this package's source from,
 * which fixture, and at what rate.
 */
interface RenderJob {
  base: string;
  kind: string;
  rate: number;
}

const RENDER = async ({ base, kind, rate }: RenderJob) => {
  const S = base;
  const [G, MA, VO, SC, PL, AU, ME] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-voices-3.ts`),
    import(`${S}tools/meter.ts`),
  ]);
  const aud = kind === 'echo' ? AU.voiceOverChords3('organStab', { extra: { echo: 0.6 } }) : AU.voiceOverChords3(kind);
  const program = aud.program;
  const settings = program.settings;
  const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
  await MA.prepareLimiter(ctx, settings);
  const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
  graph.out.connect(ctx.destination);
  await VO.prepareVoices(ctx, settings, program.events, { all: true });
  PL.scheduleAutomation(graph, program, 0);
  for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, program, s.pe, s.at);
  const buf = await ctx.startRendering();
  graph.dispose();

  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const pcm = new Int16Array(buf.length * 2);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    pcm[i * 2] = Math.round(l * 32767);
    pcm[i * 2 + 1] = Math.round(r * 32767);
  }
  const bytes = new Uint8Array(pcm.buffer);
  const chunks = [];
  const size = 1 << 20;
  for (let o = 0; o < bytes.length; o += size) {
    let s2 = '';
    const end = Math.min(bytes.length, o + size);
    for (let i = o; i < end; i += 4096) s2 += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096)));
    chunks.push(btoa(s2));
  }
  return {
    chunks,
    seconds: +buf.duration.toFixed(2),
    peak: +(20 * Math.log10(peak + 1e-30)).toFixed(2),
    lufs: ME.integratedLoudness([L, R], rate),
    notes: program.events.length,
    voices: [...new Set(program.events.map((e: { voice: string }) => e.voice))].join(' '),
    bpm: program.bpm,
  };
};

const wav = (pcm: Buffer, rate: number): Buffer => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const { pw, label } = await playwright();
console.log(`  ${label}`);
const browser = await pw.chromium.launch(launchOptions('chromium'));
renice(browser);
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
fs.mkdirSync(OUT, { recursive: true });
for (const kind of WANT) {
  const began = Date.now();
  const r = await page.evaluate(RENDER, { base: `http://127.0.0.1:${PORT}/`, kind, rate: RATE });
  const pcm = Buffer.concat(r.chunks.map((c: string) => Buffer.from(c, 'base64')));
  const file = path.join(OUT, `kv1-${kind}.wav`);
  fs.writeFileSync(file, wav(pcm, RATE));
  console.log(`  ${path.relative(ROOT, file)}: ${r.seconds} s at ${RATE / 1000} kHz, ${r.notes} notes of ${r.voices} at ${r.bpm} BPM, ${r.lufs} LUFS, peaking at ${r.peak} dBFS (${((Date.now() - began) / 1000).toFixed(1)} s)`);
}
await browser.close();
server.close();
