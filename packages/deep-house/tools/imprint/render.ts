// One window of one theme, rendered offline to samples. The three tools in
// this folder all want the same thing and it is written once here.
//
// Nothing in this file decides *which* window: `imprint-golden.ts` asks for a
// main groove of a locked theme, `recipe-from-mark.ts` for the seconds Eugene
// marked, `variants.ts` for a candidate's main groove. What is shared is the
// machinery — a built site on a port that is never 6975, one headless Chromium
// reniced to the bottom of the queue, the page opened on the silent route with
// its animation frame taken away, and the window cut out of the *program* the
// way the scene gate cuts one.
//
// An OfflineAudioContext has no output device, so nothing here can be heard;
// the silent route is the second lock and the two are independent.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..', '..', '..', '..');
export const VENV = path.join(ROOT, 'tmp', 'analysis', 'venv', 'bin', 'python');
export const IMPRINT_PY = path.join(HERE, 'imprint.py');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

/**
 * The built site, served on one port. Not 6975, which is the dev server.
 *
 * `dir` is which build, and it defaults to `docs/` because that is the one the
 * calibration and every round since has read. A caller may name a scratch build
 * instead — `npx vite build --outDir tmp/<round>/site` in the app package, a
 * fifth of a second — and then a round that needs a render of the working tree
 * does not have to rebuild the committed public site to get one. That rule is
 * older than this parameter; this is how a render obeys it.
 */
export function serveSite(port, dir = 'docs') {
  const site = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (!fs.existsSync(path.join(site, 'index.html')))
    throw new Error(`${dir}/ has not been built; run \`npm run build\` (or \`npx vite build --outDir ${dir}\` in packages/deep-house) first`);
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
      const file = path.join(site, name === '/' ? '/index.html' : name);
      if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(file));
    });
    s.on('error', reject);
    s.listen(port, '127.0.0.1', () => resolve({ close: () => s.close() }));
  });
}

/** One headless Chromium on the silent route, at the back of the queue. */
export async function openPage(port) {
  const { pw, label } = await playwright();
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu'] });
  renice(browser);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.deepHouse, { timeout: 30000 });
  // The ring draws, and software-rasterising a turning star costs more than the
  // render does. Nothing in an offline render asks for a frame.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  renice(browser);
  return { browser, page, label, close: () => browser.close() };
}

/**
 * The job the page runs: a theme compiled once, a window sliced out of the
 * program, the pre-roll rendered and thrown away so the reverb, the delay and
 * the limiter are running when the window opens. Handed back as 16-bit PCM in
 * base64 pieces, because one string of a hundred megabytes is a way to lose a
 * render in the bridge.
 *
 * `layers` names the layers to solo (`['hats']`), for a tool that measures one
 * lane alone; absent, the whole program renders.
 *
 * Three times: where the render starts, where the reading starts, and where it
 * ends. A caller gives them **in bars** (`preFromBar`, `fromBar`, `toBar`) or in
 * seconds (`preFrom`, `from`, `to`), and bars win where both are there.
 *
 * Bars are not a convenience. `from - preroll`, `preBar * barSeconds` and
 * `(fromBar - 2) * barSeconds` are the same number in arithmetic and three
 * different doubles, and an event scheduled a hair earlier renders a hair
 * differently: the refactor that moved this arithmetic out of the page and into
 * node moved 6877 samples of a 3.5 million sample render by one sixteen-bit
 * step, which is nothing to hear and is not the same file. A window that falls
 * on bars says so and gets the same bytes every time; the seconds are there for
 * a window that does not, like the ten seconds somebody marked.
 */
export const RENDER_WINDOW = async (job) => {
  // `opts` is what the page would have been asked for: a spell, a recipe's
  // roll, a room. Absent — which is every caller that reads the record as it
  // is — it is `{}` and this is the call it has always been, to the sample.
  const track = window.deepHouse.planTheme(String(job.masterSeed), job.theme, job.opts || {});
  const program = window.deepHouse.programOf(track);
  const bs = program.barSeconds;
  const tp = job.preFromBar != null ? Math.max(0, job.preFromBar) * bs : Math.max(0, job.preFrom);
  const t0 = job.fromBar != null ? job.fromBar * bs : job.from;
  const t1 = job.toBar != null ? job.toBar * bs : job.to;
  // `layers` solos a layer or a few, the way the scene gate's stem renders do;
  // absent it is the whole program, which is every caller that reads the record.
  const slice = window.deepHouse.sliceProgram(program, { from: tp, to: t1, tail: job.tail, layers: job.layers || null });
  const buf = await window.deepHouse.renderProgram(slice, { sampleRate: job.sampleRate });
  const a = Math.round((t0 - tp) * job.sampleRate);
  const b = Math.min(buf.length, Math.round((t1 - tp) * job.sampleRate));
  const L = buf.getChannelData(0).slice(a, b);
  const R = buf.getChannelData(1).slice(a, b);
  const n = L.length;
  const pcm = new Int16Array(n * 2);
  let peak = 0;
  for (let i = 0; i < n; i++) {
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
    let s = '';
    const end = Math.min(bytes.length, o + size);
    for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096)));
    chunks.push(btoa(s));
  }
  return {
    chunks, frames: n, seconds: +(n / job.sampleRate).toFixed(2),
    bpm: program.bpm, barSeconds: program.barSeconds,
    events: slice.events.length, peak: +(20 * Math.log10(peak + 1e-30)).toFixed(2),
  };
};

/** The pieces back into one buffer. */
export const pcmOf = (r) => Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64')));

/** Sixteen-bit stereo PCM with a header on it. Fourteen lines, in node. */
export function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Render one window and write it as a wav. One at a time, by construction. */
export async function renderToWav(page, job, file, rate) {
  const r = await page.evaluate(RENDER_WINDOW, { ...job, sampleRate: rate });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wav(pcmOf(r), rate));
  return r;
}
