// **The hats against what plays with them, bar by bar** (round break-hats, 11-03): a lab tool. Each link's theme is
// rendered whole three times in headless Chromium, muted, at the trim the app plays: the mix, the kit's hats alone (a
// lane's hat, the offbeat floor, a break's carrier or holder; never a quiet voice of the top's set), and the mix without
// them. Per bar: the K-weighted power of each, and the same above 3 kHz. The read the round is about: the hats against
// the rest, across the end of every break into the groove it lands on (the break's last bars, the groove's first).
//
//   node tools/break-hats.ts --site <built site> [--port 7411] --links "name|link;name|link" [--chillstep 1-4] [--featured "Vibe - Undertow,..."]
//        [--wav <dir> --tag today] --out <json>
//
// `--wav` writes, for each link, the window from 8 bars before its first arrival out of a break to 8 bars into it, the
// mix as 16-bit WAV, with the facts beside it. Numbers only otherwise. Not in any gate.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';
import { SKY_DOTS, SKY_PLACES } from '../src/sky.ts';
import { linkWrite } from '../src/link.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

type Job = { name: string; link: string; seed: string; theme: number; search: string };

function jobs(): Job[] {
  const out: Job[] = [];
  const add = (name: string, link: string) => {
    const s = link.includes('?') ? link.slice(link.indexOf('?') + 1) : link;
    const q = new URLSearchParams(s);
    out.push({ name, link: s, seed: q.get('seed')!, theme: Math.max(0, Number(q.get('theme') || 1) - 1), search: `?${s}` });
  };
  if (arg('links')) for (const x of arg('links')!.split(/\s*;\s*/).filter(Boolean)) { const [n, l] = x.includes('|') ? x.split('|') : [x, x]; add(n, l); }
  if (arg('featured')) {
    const F = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'featured.json'), 'utf8')) as { playlists: { name: string; links: string[]; labels: string[] }[] };
    const want = arg('featured')!.split(/\s*,\s*/);
    for (const p of F.playlists) p.links.forEach((l, i) => { const n = `${p.name} - ${p.labels[i]}`; if (want.includes(n) || want.includes('all')) add(n, l); });
  }
  // a star of the Map and its four dots, over seeds a..b (`--star dnb-and-dub/chillstep --seeds 1-4`)
  if (arg('star')) {
    const id = arg('star')!, [a, b] = arg('seeds', '1-4')!.split('-').map(Number);
    const star = SKY_PLACES.find((p) => p.id === id)!;
    const spells = [{ n: 'star', spell: star.spell }, ...SKY_DOTS.filter((d) => d.star === id).map((d) => ({ n: `dot ${d.n}`, spell: d.spell }))];
    for (const s of spells) for (let k = a; k <= (b ?? a); k++) add(`${star.name} ${s.n} seed ${k}`, linkWrite({ seed: String(k), theme: 0, strategy: 'house-v2', spell: s.spell } as never));
  }
  return out;
}

/** Runs in the page: the theme planned as the page plays it, rendered three ways, read per bar. */
const RENDER = async (job: { seed: string; theme: number; search: string; wav: boolean; window: boolean }) => {
  const D = (window as any).deepHouse;
  const cast = D.recipesFor({ masterSeed: job.seed, strategy: 'house-v2', search: job.search });
  const track = D.planTheme(job.seed, job.theme, { strategy: 'house-v2', search: job.search, spell: cast.spell, recipe: cast.track });
  const program = D.programOf(track);
  const sr = 48000, bs = track.barSeconds, bars = track.bars;
  // a program event is the kit's hat where the plan has one of the kit's hats of its voice at its time (a slice's events
  // are timed from the slice's start: `at` is that start)
  const kitOf = (e: any) => (/^hat/.test(e.voice) || e.voice === 'ride') && !String(e.by ?? '').startsWith('top-voices/');
  const kitTimes = new Map<string, number[]>();
  for (const e of track.events) if (kitOf(e)) (kitTimes.get(e.voice) ?? kitTimes.set(e.voice, []).get(e.voice)!).push(e.t);
  const kit = { size: [...kitTimes.values()].reduce((a, v) => a + v.length, 0) };
  const isKitAt = (at: number) => (e: any) => { const ts = kitTimes.get(e.voice); if (!ts) return false; const t = e.t + at; let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t - 1e-3) lo = m + 1; else hi = m; } return Math.abs(ts[lo] - t) < 1e-3; };
  // K-weighting (BS.1770-4 at 48 kHz) and a 3 kHz high-pass (RBJ, Q 0.707)
  const K = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]];
  const w0 = 2 * Math.PI * 3000 / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0), a0 = 1 + al;
  const HP = [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0, (-2 * cw) / a0, (1 - al) / a0];
  const biquad = (x: Float32Array, c: number[]) => {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  const sections = track.arrangement.sections.map((s: any) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars }));
  // every arrival out of a break: a main or a drop after a breakdown or a build
  const arrivalsAt: number[] = [];
  for (let i = 1; i < sections.length; i++) if (/main|drop/.test(sections[i].kind) && /breakdown|build/.test(sections[i - 1].kind)) arrivalsAt.push(sections[i].startBar);
  // the window a WAV is cut at: the first arrival a carried break lands on (round break-pulse's stretch ending there), else the first
  const carried = (track.breakPulse?.breaks ?? []).map((b: any) => b.until).filter((u: number) => arrivalsAt.includes(u));
  const arrival = carried[0] ?? arrivalsAt[0] ?? null;
  // the stretches rendered: the whole theme, or (`window`) 8 bars either side of each arrival, with 4 bars of pre-roll
  const spans: Array<[number, number]> = job.window ? arrivalsAt.map((a) => [Math.max(0, a - 8), Math.min(bars, a + 8)] as [number, number]) : [[0, bars]];
  const kw = (x: Float32Array) => biquad(biquad(x, K[0]), K[1]);
  const hi = (x: Float32Array) => biquad(biquad(x, HP), HP);
  const read = async (which: 'mix' | 'hats' | 'rest') => {
    const out = { kw: new Array(bars).fill(null) as (number | null)[], hi: new Array(bars).fill(null) as (number | null)[], wav: null as Float32Array[] | null };
    for (const [a, z] of spans) {
      const pre = job.window ? Math.max(0, a - 4) : 0;
      const t0 = pre * bs, t1 = Math.min(z * bs, program.duration), last = t1 >= program.duration - 1e-6;
      let p = job.window ? D.sliceProgram(program, { from: t0, to: t1, tail: last ? 0 : 0.01 }) : program;
      if (which !== 'mix') { const k = isKitAt(job.window ? t0 : 0); p = { ...p, events: p.events.filter((e: any) => k(e) === (which === 'hats')).map((e: any, i: number) => ({ ...e, i })) }; }
      const buf = await D.renderProgram(p, { sampleRate: sr });
      const chs = [buf.getChannelData(0), buf.getChannelData(1)];
      for (const [f, dst] of [[kw, out.kw], [hi, out.hi]] as const) {
        const ys = chs.map((c) => f(c));
        for (let b = a; b < z; b++) {
          const i0 = Math.round((b - pre) * bs * sr), i1 = Math.min(ys[0].length, Math.round((b + 1 - pre) * bs * sr));
          let s = 0; for (const y of ys) for (let i = i0; i < i1; i++) s += y[i] * y[i];
          const v = s / Math.max(1, i1 - i0); dst[b] = v > 0 ? +(10 * Math.log10(v)).toFixed(2) : -120;
        }
      }
      const wa = Math.max(0, (arrival ?? -99) - 8), wz = Math.min(bars, (arrival ?? -99) + 8);
      if (!out.wav && arrival != null && a <= wa && z >= wz) { const i0 = Math.round((wa - pre) * bs * sr), i1 = Math.round((wz - pre) * bs * sr); out.wav = chs.map((c) => c.slice(i0, Math.min(c.length, i1))); }
    }
    return out;
  };
  const mix = await read('mix'), hats = await read('hats'), rest = await read('rest');
  let chunks: string[] | null = null, win: [number, number] | null = null;
  if (job.wav && arrival != null) {
    win = [Math.max(0, arrival - 8), Math.min(bars, arrival + 8)];
    const [L, R] = mix.wav!; const pcm = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.round(Math.max(-1, Math.min(1, L[i])) * 32767); pcm[2 * i + 1] = Math.round(Math.max(-1, Math.min(1, R[i])) * 32767); }
    const bytes = new Uint8Array(pcm.buffer); chunks = [];
    for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  }
  return { bpm: track.bpm, barSeconds: bs, bars, trimDb: track.trimDb, sections, arrival, win, breakPulse: track.breakPulse ? { carrier: track.breakPulse.carrier, breaks: track.breakPulse.breaks } : null,
    topLanes: track.topLanes ? { ceilingDb: track.topLanes.ceilingDb, hatOverMixDb: track.topLanes.hatOverMixDb, hatCutDb: track.topLanes.hatCutDb } : null,
    kitHits: kit.size, mix: { kw: mix.kw, hi: mix.hi }, hats: { kw: hats.kw, hi: hats.hi }, rest: { kw: rest.kw, hi: rest.hi }, chunks };
};

const pw10 = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.reduce((a, x) => a + Math.pow(10, x / 10), 0) / Math.max(1, v.length); };
const db = (p: number) => (p > 0 ? +(10 * Math.log10(p)).toFixed(1) : null);

/** The hats against the rest and against the mix over bars [a, z): K-weighted and above 3 kHz. */
export function over(r: any, a: number, z: number) {
  const span = (x: (number | null)[]) => x.slice(a, z);
  const H = pw10(span(r.hats.kw)), Rr = pw10(span(r.rest.kw)), M = pw10(span(r.mix.kw));
  const Hh = pw10(span(r.hats.hi)), Rh = pw10(span(r.rest.hi));
  return { hats: db(H), rest: db(Rr), mix: db(M), hatsOverRest: H > 0 && Rr > 0 ? db(H / Rr) : null, hatsOverMix: H > 0 && M > 0 ? db(H / M) : null, hiHatsOverRest: Hh > 0 && Rh > 0 ? db(Hh / Rh) : null };
}

/** Every arrival out of a break: the break's last `n` bars against the groove's first `n`. */
export function arrivals(r: any, n = 8) {
  const S = r.sections, out: any[] = [];
  for (let i = 1; i < S.length; i++) {
    if (!/main|drop/.test(S[i].kind) || !/breakdown|build/.test(S[i - 1].kind)) continue;
    // the break: the run of breakdown and build sections ending here
    let from = S[i - 1].startBar; for (let j = i - 1; j >= 0 && /breakdown|build/.test(S[j].kind); j--) from = S[j].startBar;
    const at = S[i].startBar, k = Math.min(n, at - from), m = Math.min(n, S[i].bars);
    const end = over(r, at - k, at), start = over(r, at, at + m), whole = over(r, from, at);
    out.push({ at, into: S[i].kind, breakBars: at - from, breakWhole: whole, breakEnd: end, grooveStart: start,
      jump: end.hatsOverRest != null && start.hatsOverRest != null ? +(end.hatsOverRest - start.hatsOverRest).toFixed(1) : null,
      hatsStep: end.hats != null && start.hats != null ? +(start.hats - end.hats).toFixed(1) : null,
      restStep: end.rest != null && start.rest != null ? +(start.rest - end.rest).toFixed(1) : null });
  }
  return out;
}

function wav16(pcm: Buffer, sr = 48000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  const site = path.resolve(arg('site')!), port = +arg('port', '7411')!, wavDir = arg('wav'), tag = arg('tag', 'today')!;
  const J = jobs();
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
  for (const j of J) {
    if (!page || since >= 4) {
      if (page) await page.close();
      page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
      await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
      renice(browser); since = 0;
    }
    try {
      const r = await page.evaluate(RENDER, { seed: j.seed, theme: j.theme, search: j.search, wav: !!wavDir, window: process.argv.includes('--window') });
      const { chunks, ...rest } = r;
      const row = { ...j, ...rest, arrivals: arrivals(r), sectionsRead: process.argv.includes('--window') ? null : r.sections.map((s: any) => ({ ...s, ...over(r, s.startBar, s.startBar + s.bars) })) };
      rows.push(row);
      if (arg('jsonl')) fs.appendFileSync(path.resolve(arg('jsonl')!), JSON.stringify(row) + '\n');
      if (wavDir && chunks) {
        fs.mkdirSync(wavDir, { recursive: true });
        const slug = j.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        fs.writeFileSync(path.join(wavDir, `${slug}-${tag}.wav`), wav16(Buffer.concat(chunks.map((x: string) => Buffer.from(x, 'base64')))));
      }
      const a = row.arrivals.map((x: any) => `bar ${x.at}: break end ${x.breakEnd.hatsOverRest} / groove ${x.grooveStart.hatsOverRest} (jump ${x.jump})`).join('; ');
      console.log(`${j.name}: ${a || 'no arrival out of a break'}`);
    } catch (e) {
      console.log(`${j.name}: FAILED ${String((e as Error).message || e).slice(0, 300)}`);
      rows.push({ ...j, error: String((e as Error).message || e) }); since = 99;
    }
    since++;
  }
  await browser.close();
  server.close();
  const out = path.resolve(arg('out')!);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ note: 'tools/break-hats.ts: the kit hats against the rest, per bar (round break-hats)', site, tag, rows }, null, 1) + '\n');
  console.log(`wrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
