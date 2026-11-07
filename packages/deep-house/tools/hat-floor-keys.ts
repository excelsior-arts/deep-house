// Lab tool (round hat-floor): every voice of a groove rendered on its own inside the theme (its own notes, the theme's
// room, its lines and its duck), each main's and drop's first 8 bars (two grooves a link), read K-weighted and above
// 3 kHz: what the table's notes, rendered alone, become in a groove. Tried for a per-voice step in a groove (round
// hat-floor: it took the rest's per-voice error from 1.33 to 1.17 dB but left the hats-over-rest read where it was, the
// error being the sum's own glue and limiter, not any one voice's; not kept).
//
//   node tools/hat-floor-keys.ts --site <built site> --port 7436 --rows <hat-top-render jsonl,...> --out <jsonl>
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const RENDER = async (job: { seed: string; theme: number; search: string }) => {
  const D = (window as any).deepHouse;
  const cast = D.recipesFor({ masterSeed: job.seed, strategy: 'house-v2', search: job.search });
  const track = D.planTheme(job.seed, job.theme, { strategy: 'house-v2', search: job.search, spell: cast.spell, recipe: cast.track });
  const program = D.programOf(track);
  const sr = 48000, bs = track.barSeconds;
  const kitOf = (e: any) => (/^hat/.test(e.voice) || e.voice === 'ride') && !String(e.by ?? '').startsWith('top-voices/');
  const keyOf = (e: any) => { const n = e.p?.timbre ?? e.p?.preset; return typeof n === 'string' && n !== e.voice ? `${e.voice}|${n}` : e.voice; };
  // each program event's key, from the plan event at its voice and time
  const keyAt = new Map<string, string>();
  for (const e of track.events) keyAt.set(`${e.voice}|${Math.round(e.t * 1000)}`, kitOf(e) ? 'HAT' : keyOf(e));
  const keyOfProg = (at: number) => (e: any) => { const ms = Math.round((e.t + at) * 1000); return keyAt.get(`${e.voice}|${ms}`) ?? keyAt.get(`${e.voice}|${ms - 1}`) ?? keyAt.get(`${e.voice}|${ms + 1}`) ?? 'unmatched'; };
  const K = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]];
  const w0 = 2 * Math.PI * 3000 / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0), a0 = 1 + al;
  const HP = [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0, (-2 * cw) / a0, (1 - al) / a0];
  const biquad = (x: Float32Array, c: number[]) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const grooves = track.arrangement.sections.filter((s: any) => s.kind === 'main' || s.kind === 'drop').slice(0, 2);
  const out: any[] = [];
  for (const s of grooves) {
    const a = s.startBar, z = s.startBar + Math.min(8, s.bars), pre = Math.max(0, a - 2);
    const t0 = pre * bs, t1 = Math.min(z * bs, program.duration);
    const sliced = D.sliceProgram(program, { from: t0, to: t1, tail: 0.01 });
    const kf = keyOfProg(t0);
    const keys = [...new Set(sliced.events.map((e: any) => kf(e)))].filter((k) => k !== 'HAT' && k !== 'unmatched') as string[];
    const reads: Record<string, { k: number; hi: number }> = {};
    for (const key of keys) {
      const p = { ...sliced, events: sliced.events.filter((e: any) => kf(e) === key).map((e: any, i: number) => ({ ...e, i })) };
      const buf = await D.renderProgram(p, { sampleRate: sr });
      const chs = [buf.getChannelData(0), buf.getChannelData(1)];
      const i0 = Math.round((a - pre) * bs * sr), i1 = Math.min(chs[0].length, Math.round((z - pre) * bs * sr));
      const e = (f: (x: Float32Array) => Float32Array) => { let s2 = 0; for (const c of chs) { const y = f(c); for (let i = i0; i < i1; i++) s2 += y[i] * y[i]; } const v = s2 / Math.max(1, i1 - i0); return v > 0 ? +(10 * Math.log10(v)).toFixed(2) : -150; };
      reads[key] = { k: e((x) => biquad(biquad(x, K[0]), K[1])), hi: e((x) => biquad(biquad(x, HP), HP)) };
    }
    out.push({ kind: s.kind, startBar: a, bars: z - a, reads });
  }
  return { trimDb: track.trimDb, grooves: out };
};

async function main() {
  const site = path.resolve(arg('site')!), port = +arg('port', '7436')!, outFile = path.resolve(arg('out')!);
  const rows = arg('rows')!.split(',').flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r: any) => !r.error);
  const done = new Set<string>(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).name) : []);
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
  for (const r of rows) {
    if (done.has(r.name)) continue;
    const q = new URLSearchParams(r.link);
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
      await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
      renice(browser);
      const got = await page.evaluate(RENDER, { seed: q.get('seed')!, theme: Math.max(0, Number(q.get('theme') || 1) - 1), search: `?${r.link}` });
      fs.appendFileSync(outFile, JSON.stringify({ name: r.name, link: r.link, ...got }) + '\n');
      console.log(`${r.name}: ${got.grooves.map((g: any) => `${g.kind}@${g.startBar} ${Object.keys(g.reads).length} voices`).join(', ')}`);
    } catch (e) { console.log(`${r.name}: FAILED ${String((e as Error).message || e).slice(0, 200)}`); }
    await page.close();
  }
  await browser.close();
  server.close();
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
