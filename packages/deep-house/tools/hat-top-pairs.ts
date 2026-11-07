// **A/B pairs for round hat-top** (11-03): a lab tool. Each job's window [from, to) bars is rendered from two built sites
// (today's and the rule's) in headless Chromium, muted: the mix, the kit's hats alone and the rest without them. The
// mix is written as 16-bit WAV, the rule's side level-matched to today's by integrated loudness (the gain stated), with
// the facts beside them: per side the hats against the rest, K-weighted and above 3 kHz, over the window and over its
// halves (`at`, the seam bar), and whether the rest renders the same on both sides (the only difference the hats).
//
//   node tools/hat-top-pairs.ts --a <site today> --b <site rule> [--port 7425] --jobs "slug|link|from|to|at[|hatsDb];..." --out <dir>
// (`hatsDb`: a sketch side, the b site's kit hats moved by that many dB in the page; pass the same site twice)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';
import { integratedLoudness } from '@deep-house/engine/meter';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const RENDER = async (job: { seed: string; theme: number; search: string; from: number; to: number; hatsDb: number }) => {
  const D = (window as any).deepHouse;
  const cast = D.recipesFor({ masterSeed: job.seed, strategy: 'house-v2', search: job.search });
  const track = D.planTheme(job.seed, job.theme, { strategy: 'house-v2', search: job.search, spell: cast.spell, recipe: cast.track });
  const program = D.programOf(track);
  const sr = 48000, bs = track.barSeconds;
  const kitOf = (e: any) => (/^hat/.test(e.voice) || e.voice === 'ride') && !String(e.by ?? '').startsWith('top-voices/');
  const kitTimes = new Map<string, number[]>();
  for (const e of track.events) if (kitOf(e)) (kitTimes.get(e.voice) ?? kitTimes.set(e.voice, []).get(e.voice)!).push(e.t);
  const isKitAt = (at: number) => (e: any) => { const ts = kitTimes.get(e.voice); if (!ts) return false; const t = e.t + at; let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t - 1e-3) lo = m + 1; else hi = m; } return Math.abs(ts[lo] - t) < 1e-3; };
  const pre = Math.max(0, job.from - 2), t0 = pre * bs, t1 = Math.min(job.to * bs, program.duration), last = t1 >= program.duration - 1e-6;
  let sliced = D.sliceProgram(program, { from: t0, to: t1, tail: last ? 0 : 0.01 });
  // (a sketch side) the kit's hats moved by `hatsDb`, nothing else
  if (job.hatsDb) { const k = isKitAt(t0), g = Math.pow(10, job.hatsDb / 20); sliced = { ...sliced, events: sliced.events.map((e: any) => (k(e) ? { ...e, p: { ...e.p, gain: Number(e.p?.gain ?? 1) * g } } : e)) }; }
  const K = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]];
  const w0 = 2 * Math.PI * 3000 / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0), a0 = 1 + al;
  const HP = [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0, (-2 * cw) / a0, (1 - al) / a0];
  const biquad = (x: Float32Array, c: number[]) => {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  const i0 = Math.round((job.from - pre) * bs * sr);
  const perBar = (chs: Float32Array[], f: (x: Float32Array) => Float32Array) => {
    const ys = chs.map((c) => f(c)); const out: number[] = [];
    for (let b = job.from; b < job.to; b++) {
      const a = Math.round((b - pre) * bs * sr), z = Math.min(ys[0].length, Math.round((b + 1 - pre) * bs * sr));
      let s = 0; for (const y of ys) for (let i = a; i < z; i++) s += y[i] * y[i]; out.push(s / Math.max(1, z - a));
    }
    return out;
  };
  const kw = (x: Float32Array) => biquad(biquad(x, K[0]), K[1]), hi = (x: Float32Array) => biquad(biquad(x, HP), HP);
  const one = async (which: 'mix' | 'hats' | 'rest') => {
    let p = sliced;
    if (which !== 'mix') { const k = isKitAt(t0); p = { ...p, events: p.events.filter((e: any) => k(e) === (which === 'hats')).map((e: any, i: number) => ({ ...e, i })) }; }
    const buf = await D.renderProgram(p, { sampleRate: sr });
    const chs = [buf.getChannelData(0), buf.getChannelData(1)];
    return { chs: chs.map((c) => c.slice(i0)), kw: perBar(chs, kw), hi: perBar(chs, hi) };
  };
  const mix = await one('mix'), hats = await one('hats'), rest = await one('rest');
  // the rest's own fingerprint: its samples' sum of squares, to say both sides render the same rest
  let rs = 0; for (const c of rest.chs) for (let i = 0; i < c.length; i += 7) rs += c[i] * c[i];
  const pcm = (chs: Float32Array[]) => { const L = chs[0], R = chs[1]; const out = new Float32Array(L.length * 2); for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; } return out; };
  const f32 = pcm(mix.chs); const bytes = new Uint8Array(f32.buffer); const chunks: string[] = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  return { barSeconds: bs, hats: { kw: hats.kw, hi: hats.hi }, rest: { kw: rest.kw, hi: rest.hi }, restSum: rs, chunks, topLanes: track.topLanes ?? null,
    breaks: (track.breakPulse?.breaks ?? []).map((b: any) => ({ from: b.from, until: b.until, heldDb: b.heldDb })) };
};

const dbOf = (xs: number[]) => { const v = xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length); return v > 0 ? +(10 * Math.log10(v)).toFixed(1) : null; };
function place(r: any, a: number, z: number) {
  const H = dbOf(r.hats.kw.slice(a, z)), Rr = dbOf(r.rest.kw.slice(a, z)), Hh = dbOf(r.hats.hi.slice(a, z)), Rh = dbOf(r.rest.hi.slice(a, z));
  return { K: H != null && Rr != null ? +(H - Rr).toFixed(1) : null, above3k: Hh != null && Rh != null ? +(Hh - Rh).toFixed(1) : null, hatsK: H };
}
function wav16(f: Float32Array, gain: number, sr = 48000): Buffer {
  const pcm = Buffer.alloc(f.length * 2);
  for (let i = 0; i < f.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, f[i] * gain)) * 32767), 2 * i);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  const port = +arg('port', '7425')!, outDir = path.resolve(arg('out')!);
  const sites = { a: path.resolve(arg('a')!), b: path.resolve(arg('b')!) };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url!, `http://127.0.0.1:${port}`); const [, side, ...rest] = decodeURIComponent(u.pathname).split('/');
    const root = (sites as any)[side]; const name = '/' + rest.join('/');
    const file = root ? path.join(root, name === '/' ? '/index.html' : name) : '';
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : /\.(m?js|ts)$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' });
    res.end(bodyOf(file));
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
  const { pw } = await playwright();
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu', '--mute-audio'] });
  renice(browser);
  fs.mkdirSync(outDir, { recursive: true });
  const facts: any[] = [];
  for (const spec of arg('jobs')!.split(/\s*;\s*/).filter(Boolean)) {
    const [slug, link, from, to, at, sketch] = spec.split('|');
    const q = new URLSearchParams(link);
    const job = { seed: q.get('seed')!, theme: Math.max(0, Number(q.get('theme') || 1) - 1), search: `?${link}`, from: +from, to: +to, hatsDb: 0 };
    const got: any = {};
    for (const side of ['a', 'b'] as const) {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/${side}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
      await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
      renice(browser);
      got[side] = await page.evaluate(RENDER, { ...job, hatsDb: side === 'b' && sketch ? +sketch : 0 });
      await page.close();
    }
    const f32 = (r: any) => { const b = Buffer.concat(r.chunks.map((x: string) => Buffer.from(x, 'base64'))); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
    const A = f32(got.a), B = f32(got.b);
    const lufs = (f: Float32Array) => { const L = new Float32Array(f.length / 2), R = new Float32Array(f.length / 2); for (let i = 0; i < L.length; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; } return integratedLoudness([L, R], 48000); };
    const la = lufs(A), lb = lufs(B), g = Math.pow(10, (la - lb) / 20);
    fs.writeFileSync(path.join(outDir, `${slug}-today.wav`), wav16(A, 1));
    fs.writeFileSync(path.join(outDir, `${slug}-rule.wav`), wav16(B, g));
    const n = +to - +from, s = at ? +at - +from : null;
    const read = (r: any) => ({ window: place(r, 0, n), ...(s != null ? { before: place(r, 0, s), after: place(r, s, n) } : {}) });
    const row = { slug, link, bars: [+from, +to], seamBar: at ? +at : null, seamSeconds: s != null ? +(s * got.a.barSeconds).toFixed(2) : null,
      lufs: { today: +la.toFixed(2), rule: +lb.toFixed(2), ruleGainDb: +(la - lb).toFixed(2) }, restSame: Math.abs(got.a.restSum - got.b.restSum) <= 1e-6 * Math.max(1, got.a.restSum),
      today: read(got.a), rule: read(got.b), topLanes: { today: got.a.topLanes && { hatCutDb: got.a.topLanes.hatCutDb, topDb: got.a.topLanes.hatTopDb ?? null }, rule: got.b.topLanes && { hatCutDb: got.b.topLanes.hatCutDb, topDb: got.b.topLanes.hatTopDb ?? null, liftDb: got.b.topLanes.hatLiftDb ?? null } },
      breaks: { today: got.a.breaks, rule: got.b.breaks } };
    facts.push(row);
    console.log(JSON.stringify({ slug, lufs: row.lufs, restSame: row.restSame, today: row.today, rule: row.rule }));
  }
  fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 1) + '\n');
  await browser.close(); server.close();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
