// The two auditions, as files somebody can listen to.
//
//   node packages/engine/tools/ear.ts
//   node packages/engine/tools/ear.ts --only drone --rate 48000
//   node packages/engine/tools/ear.ts --effect chorus
//   node packages/engine/tools/ear.ts --effect all
//
// writes
//
//   tmp/ear/audition-pluck.wav            eight bars of the plucked mid bass, alone
//   tmp/ear/audition-drone.wav            a minute and a half of the drumless piece
//   tmp/ear/kitchen/effect-<id>.wav       round K1: one effect, dry and then wet
//
// An effect's audition is **the same music twice**: the fixture through a wire,
// and then the fixture through the effect at its declared defaults, with a
// second of quiet between them. Nothing is levelled between the halves, because
// what a listener needs to hear is what the effect actually does to the level
// as well as to the sound.
//
// The suite measures these two fixtures and says whether they are inside their
// gates; a gate cannot say whether an instrument is worth having. So this is
// the same render, through the same graph, written to a file — round G's
// auditions are *auditions*, and the point of one is that somebody hears it.
//
// It is not part of `npm test`: it writes files, it takes a minute, and nothing
// downstream reads what it writes. `tmp/` is the lab and is not in git, so the
// files are Eugene's to keep or to throw away.
//
// The render happens in a headless browser, because Web Audio is the machine
// and node has none of it; the page is served this package's own source, the
// way `tools/test.ts` serves it, and the samples come back as 16-bit PCM in
// chunks. The WAV header is written here, in node, in fourteen lines — the
// composer has a `wav.ts` of its own and the machine may not name it.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT, playwright, launchOptions, renice } from './harness.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };
// Above the suites' 6977 and beside the engine suite's 7023, and never 6975.
const PORT = 7024;
const OUT = path.join(ROOT, 'tmp', 'ear');
// The default says what the flag is in — a rate is a number and a name is a
// string or nothing — so what comes back is a string off the command line or
// whatever was handed in.
const arg = <T>(k: string, d: T): string | T => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RATE = +arg('rate', 44100);
const ONLY = arg('only', null);
const EFFECT = arg('effect', null);
const WANT = EFFECT ? [] : ['pluck', 'drone'].filter((k) => !ONLY || k === ONLY);

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${PORT}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>audition</title>'); return; }
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
await new Promise<void>((done) => server.listen(PORT, '127.0.0.1', done));

/**
 * What the page is asked for: the URL it loads this package's source from, which
 * fixture, at what rate, and — for an effect — which one.
 */
interface RenderJob {
  base: string;
  kind: string;
  rate: number;
  id?: string;
}

// One audition, rendered and handed back as 16-bit PCM. It is the runner
// `tools/test.ts` measures with, without the meters: the program through the
// one scheduling contract into the v1 graph, and the drones held beside it.
const RENDER = async ({ base, kind, rate, id }: RenderJob) => {
  const S = base;
  const [G, MA, VO, SC, PL, AU, FX, AF] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition.ts`),
    import(`${S}src/effects/index.ts`),
    import(`${S}tools/audition-effects.ts`),
  ]);
  let buf;
  let said = {};
  if (kind === 'effect') {
    // Round K1: the same music twice in one render — through a wire, a second
    // of quiet, then through the effect at its declared defaults. No graph and
    // no master anywhere near it: what is being auditioned is the effect, and a
    // limiter in front of it would be a limiter being auditioned.
    // An effect job always names one: `id` is only left out by the two
    // auditions, which are the other arm of this.
    const d = FX.BY_ID[id!];
    if (!d) return { error: `no effect called ${id}` };
    // Which fixture, from the round's own table where there is one, so the ear
    // and the gate hear the same music: a dynamics effect on a held chord is an
    // effect on the one material it cannot do anything to.
    const row = AF.SCENES_FX.find((s2: { id: string; source: string }) => s2.id === id);
    const source = row ? row.source : (d.family === 'drive' ? 'pluck' : 'strings');
    const aud = AU.effectAudition({ source });
    const half = aud.program.duration + 1;
    const ctx = new OfflineAudioContext(2, Math.ceil((half * 2) * rate), rate);
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    await VO.prepareVoices(ctx, aud.program.settings, aud.program.events, { all: true });
    AU.playAudition(ctx, aud, { dry: out }, 0);
    const fx = FX.makeEffect(id, ctx, aud.program.settings, { beat: 60 / aud.program.bpm });
    fx.output.connect(out);
    AU.playAudition(ctx, aud, { dry: fx.input }, half);
    buf = await ctx.startRendering();
    fx.dispose(0);
    said = {
      notes: aud.program.events.length, drones: 0, bpm: aud.program.bpm,
      source, half: +half.toFixed(2), params: FX.defaultsOf(id),
    };
  } else {
    const aud = kind === 'pluck' ? AU.pluckAudition() : AU.droneAudition();
    const program = aud.program;
    const settings = program.settings;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
    graph.out.connect(ctx.destination);
    await VO.prepareVoices(ctx, settings, program.events, { all: true });
    PL.scheduleAutomation(graph, program, 0);
    for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, program, s.pe, s.at);
    const held = AU.startDrones(ctx, graph, aud, 0);
    buf = await ctx.startRendering();
    for (const h of held) h.dispose();
    graph.dispose();
    said = { notes: program.events.length, drones: aud.drones.length, bpm: program.bpm };
  }

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
  // Base64 in pieces: one string of a hundred megabytes is a way to lose a
  // render to an out-of-memory in the bridge rather than in the audio.
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
    frames: buf.length,
    seconds: +buf.duration.toFixed(2),
    peak: +(20 * Math.log10(peak + 1e-30)).toFixed(2),
    ...said,
  };
};

const wav = (pcm: Buffer, rate: number): Buffer => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28); // bytes a second
  header.writeUInt16LE(4, 32); // bytes a frame
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const { pw, label } = await playwright();
console.log(`  ${label}`);
const browser = await pw.chromium.launch(launchOptions('chromium'));
renice(browser);
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
fs.mkdirSync(OUT, { recursive: true });

// Round K1's auditions: one file per effect, rendered one at a time.
if (EFFECT) {
  const KITCHEN = path.join(OUT, 'kitchen');
  fs.mkdirSync(KITCHEN, { recursive: true });
  const ids = await page.evaluate(async (base: string) => (await import(`${base}src/effects/index.ts`)).EFFECTS, `http://127.0.0.1:${PORT}/`);
  const want = EFFECT === 'all' ? ids : [EFFECT];
  for (const id of want) {
    if (!ids.includes(id)) { console.log(`  no effect called ${id}; the kitchen holds ${ids.join(', ')}`); continue; }
    const began = Date.now();
    const r = await page.evaluate(RENDER, { base: `http://127.0.0.1:${PORT}/`, kind: 'effect', id, rate: RATE });
    if (r.error) { console.log(`  ${r.error}`); continue; }
    const file = path.join(KITCHEN, `effect-${id}.wav`);
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c: string) => Buffer.from(c, 'base64'))), RATE));
    console.log(`  ${path.relative(ROOT, file)}: ${r.seconds} s at ${RATE / 1000} kHz — ${r.notes} notes of the ${r.source} fixture at ${r.bpm} BPM, dry until ${r.half} s and through the effect after it, peaking at ${r.peak} dBFS (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  }
}

for (const kind of WANT) {
  const began = Date.now();
  const r = await page.evaluate(RENDER, { base: `http://127.0.0.1:${PORT}/`, kind, rate: RATE });
  const pcm = Buffer.concat(r.chunks.map((c: string) => Buffer.from(c, 'base64')));
  const file = path.join(OUT, `audition-${kind}.wav`);
  fs.writeFileSync(file, wav(pcm, RATE));
  console.log(`  ${path.relative(ROOT, file)}: ${r.seconds} s at ${RATE / 1000} kHz, ${r.notes} notes and ${r.drones} held voices at ${r.bpm} BPM, peaking at ${r.peak} dBFS (${((Date.now() - began) / 1000).toFixed(1)} s)`);
}
await browser.close();
server.close();
