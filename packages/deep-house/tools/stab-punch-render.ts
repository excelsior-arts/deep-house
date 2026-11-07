// **The stab lane against the rest, today and in each sketch** (round stab-punch, 11-04): a lab tool, in no gate.
//
// Renders a window of each job in headless Chromium, muted, the way the page plays it: the mix, the stab lane alone and
// everything but the stab lane, for today and for each sketch asked (`globalThis.__stabPunchLab` in the page, so one
// build renders them all: src/stab-punch.ts). Reads the stab lane's loudness against the rest (integrated, and in the
// fifth of a second after each of its hits), and checks that the rest is the same in every sketch as today (only the
// stab lane may differ). A sketch is rendered as its stab lane over today's everything else, so a pair differs in the
// lane alone; `--whole` renders the sketch's own plan, as its build plays it (the house answers the lane: the hats, the
// bass, the bed may move). With `--wav <dir>` it writes each mix as 16-bit WAV, every sketch level-matched to today by
// integrated loudness, or every file to `--lufs`.
//
//   node tools/stab-punch-render.ts --site <built site> [--port 7471] --jobs <json> [--what mix,stab,rest] [--wav <dir> [--lufs -16]] --out <json>
//
// `--jobs`: [{ "name", "link", "from", "bars", "sketches": ["today", "rule", "a", ...] }] (bars of the theme, from bar `from`),
// or a count of tools/stab-punch.ts (`--count <json> --sets house,grid,featured`): each punch's first 8 bars, today only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';
import { integratedLoudness } from '@deep-house/engine/meter';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RATE = 48000;

type Job = { name: string; link: string; from: number; bars: number; sketches: string[] };

function jobs(): Job[] {
  if (arg('jobs')) return JSON.parse(fs.readFileSync(path.resolve(arg('jobs')!), 'utf8'));
  const C = JSON.parse(fs.readFileSync(path.resolve(arg('count')!), 'utf8'));
  const sets = arg('sets', 'house,grid,featured')!.split(',');
  return C.rows.filter((r: any) => r.punch && sets.includes(r.set)).map((r: any) => ({ name: r.name, link: r.link, from: r.punch.from, bars: Math.min(8, r.punch.to - r.punch.from), sketches: ['today'] }));
}

/** Runs in the page: the window planned as the page plays it under a sketch, rendered whole, the stab lane alone and the rest. */
const RENDER = async (job: { link: string; from: number; bars: number; sketch: string; what: string[]; whole: boolean }) => {
  const W = window as any, D = W.deepHouse;
  const search = `?${job.link}`, q = new URLSearchParams(job.link);
  const seed = q.get('seed')!, theme = Math.max(0, Number(q.get('theme') || 1) - 1);
  const planned = (sketch: string) => {
    // (pass 2) `today` plays the lane as it was before the rule; `rule` the house's rule as the build plays it
    if (sketch === 'rule') delete W.__stabPunchLab; else W.__stabPunchLab = sketch;
    const cast = D.recipesFor({ masterSeed: seed, strategy: 'house-v2', search });
    const track = D.planTheme(seed, theme, { strategy: 'house-v2', search, spell: cast.spell, recipe: cast.track });
    delete W.__stabPunchLab;
    const d = track.dice ?? {};
    const stab = new Set([d.stabTimbre, d.keysPreset].filter(Boolean));
    // the stab lane's notes in the plan, by voice and time
    const lane = new Set<string>();
    const hits: number[] = [];
    for (const e of track.events) {
      if (e.layer !== 'keys' || e.role || e.part || (!stab.has(e.p?.preset) && !stab.has(e.voice))) continue;
      lane.add(`${e.voice}|${Math.round(e.t * 1000)}`);
      if (!hits.length || Math.abs(hits[hits.length - 1] - e.t) > 0.05) hits.push(e.t);
    }
    // (a slice's events are timed from its start: `at` is that start)
    const inLane = (at: number) => (e: any) => { const ms = Math.round((e.t + at) * 1000); return lane.has(`${e.voice}|${ms}`) || lane.has(`${e.voice}|${ms - 1}`) || lane.has(`${e.voice}|${ms + 1}`); };
    return { track, program: D.programOf(track), lane, hits, inLane, d };
  };
  const today = planned('today'), mine = job.sketch === 'today' ? today : planned(job.sketch);
  const track = mine.track, d = mine.d, lane = mine.lane, hits = mine.hits, bs = track.barSeconds;
  // by default the sketch's stab lane over today's everything else, so a pair differs in the stab lane alone; `whole`, the
  // sketch's own plan as its build plays it (the house's own answers to the lane: the hats, the bass, the bed)
  const program = job.whole || mine === today ? mine.program : (() => {
    const keep = today.inLane(0), take = mine.inLane(0);
    const events = [...today.program.events.filter((e: any) => !keep(e)), ...mine.program.events.filter((e: any) => take(e))]
      .sort((x: any, y: any) => x.t - y.t || x.i - y.i).map((e: any, i: number) => ({ ...e, i }));
    return { ...today.program, events };
  })();
  const inLane = mine.inLane;
  const pre = Math.min(2, job.from), t0 = (job.from - pre) * bs, t1 = Math.min((job.from + job.bars) * bs, program.duration);
  const last = t1 >= program.duration - 1e-6;
  const whole = D.sliceProgram(program, { from: t0, to: t1, tail: last ? 0 : 0.01 });
  const out: Record<string, string[]> = {};
  for (const what of job.what) {
    const f = inLane(t0);
    const p = what === 'mix' ? whole : { ...whole, events: whole.events.filter((e: any) => f(e) === (what === 'stab')).map((e: any, i: number) => ({ ...e, i })) };
    const buf = await D.renderProgram(p, { sampleRate: 48000 });
    const a = Math.round(pre * bs * 48000), b = Math.min(buf.length, a + Math.round(job.bars * bs * 48000));
    const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
    const f32 = new Float32Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { f32[2 * i] = L[i]; f32[2 * i + 1] = R[i]; }
    const bytes = new Uint8Array(f32.buffer); const chunks: string[] = [];
    for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
    out[what] = chunks;
  }
  const w0 = job.from * bs, w1 = (job.from + job.bars) * bs;
  return { bpm: track.bpm, barSeconds: bs, trimDb: track.trimDb, hits: hits.filter((t) => t >= w0 && t < w1).map((t) => t - w0), laneNotes: lane.size, pcm: out,
    scene: d.scene ?? null, texture: d.texture ?? null, voice: d.stabTimbre ?? null };
};

const chansOf = (chunks: string[]) => {
  const buf = Buffer.concat(chunks.map((x) => Buffer.from(x, 'base64')));
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length >> 2);
  const n = f.length >> 1, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return [L, R];
};
const power = (ch: Float32Array[], a = 0, b = ch[0].length) => { let s = 0; for (const c of ch) for (let i = a; i < Math.min(b, c.length); i++) s += c[i] * c[i]; return s / Math.max(1, (Math.min(b, ch[0].length) - a) * ch.length); };
const dB = (x: number) => (x > 0 ? +(10 * Math.log10(x)).toFixed(1) : -120);

function wav16(ch: Float32Array[], gain = 1): Buffer {
  const n = ch[0].length, pcm = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[k][i] * gain)) * 32767), 4 * i + 2 * k);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  const site = path.resolve(arg('site')!), port = +arg('port', '7471')!, wavDir = arg('wav');
  const what = arg('what', 'mix,stab,rest')!.split(',');
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${port}`).pathname);
    const file = path.join(site, name === '/' ? '/index.html' : name);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : /\.(m?js|ts)$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' });
    res.end(bodyOf(file));
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
  const { pw } = await playwright();
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu', '--mute-audio'] });
  renice(browser);
  const rows: any[] = [];
  let page: any = null, since = 0;
  for (const j of jobs()) {
    const row: any = { ...j, sketches: {} };
    let today: any = null;
    for (const sk of j.sketches) {
      if (!page || since >= 6) {
        if (page) await page.close();
        page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
        await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
        renice(browser); since = 0;
      }
      since++;
      try {
        const r = await page.evaluate(RENDER, { link: j.link, from: j.from, bars: j.bars, sketch: sk, what, whole: process.argv.includes('--whole') });
        const ch: Record<string, Float32Array[]> = {};
        for (const k of Object.keys(r.pcm)) ch[k] = chansOf(r.pcm[k]);
        const x: any = { trimDb: r.trimDb, laneNotes: r.laneNotes, hits: r.hits.length };
        for (const k of Object.keys(ch)) x[`${k}Lufs`] = integratedLoudness(ch[k], RATE);
        if (ch.stab && ch.rest) {
          x.stabOverRestDb = +(x.stabLufs - x.restLufs).toFixed(1);
          // in the fifth of a second after each hit: the stab against the rest, the median over the hits
          const at = r.hits.map((t: number) => { const a = Math.round(t * RATE), b = a + Math.round(0.2 * RATE); return dB(power(ch.stab, a, b)) - dB(power(ch.rest, a, b)); }).sort((p: number, q: number) => p - q);
          x.hitOverRestDb = at.length ? +at[Math.floor(at.length / 2)].toFixed(1) : null;
        }
        if (sk === 'today') { today = { ch, x }; Object.assign(row, { bpm: r.bpm, barSeconds: r.barSeconds, scene: r.scene, texture: r.texture, voice: r.voice }); }
        else if (today && ch.rest && today.ch.rest) {
          // the rest against today's: what differs besides the stab lane, as a level under today's rest
          const a = today.ch.rest, b = ch.rest, n = Math.min(a[0].length, b[0].length);
          let e = 0, s = 0; for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) { const d = a[k][i] - b[k][i]; e += d * d; s += a[k][i] * a[k][i]; }
          x.restDiffDb = e > 0 ? +(10 * Math.log10(e / s)).toFixed(1) : -Infinity;
        }
        if (wavDir && ch.mix) {
          fs.mkdirSync(wavDir, { recursive: true });
          // every file to `--lufs` where asked (each at the same loudness, none clipped), else every sketch to today's
          const aim = arg('lufs') != null ? Number(arg('lufs')) : sk !== 'today' ? today?.x.mixLufs : null;
          const g = aim != null && Number.isFinite(aim) && Number.isFinite(x.mixLufs) ? Math.pow(10, (aim - x.mixLufs) / 20) : 1;
          x.matchDb = +(20 * Math.log10(g)).toFixed(2);
          const slug = j.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          fs.writeFileSync(path.join(wavDir, `${slug}-${sk}.wav`), wav16(ch.mix, g));
        }
        row.sketches[sk] = x;
        console.log(`${j.name} [${sk}]: ${JSON.stringify(x)}`);
      } catch (e) {
        console.log(`${j.name} [${sk}]: FAILED ${String((e as Error).message || e).slice(0, 300)}`);
        row.sketches[sk] = { error: String((e as Error).message || e) }; since = 99;
      }
    }
    rows.push(row);
  }
  await browser.close();
  server.close();
  const out = path.resolve(arg('out')!);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ note: 'tools/stab-punch-render.ts: the stab lane against the rest (round stab-punch)', site, rows }, null, 1) + '\n');
  console.log(`wrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
