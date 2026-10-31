// **The hand-over pairs** (round mix-voices, his word 10-30: "our mixing became kind of too abrupt … I almost don't
// even hear any ahead of time voices"): a playlist's hand-over, rendered offline through the set's own graph
// (`renderMix`, the two stated plans, the record's seam line, the hand's numbers, `hand: true`), and measured off solo
// renders of the same seam: each deck alone, each deck's voices alone (its kick, drums and bass holed), and both
// decks' drums alone (the pulse). Headless and silent (an OfflineAudioContext on the `out=silent` page).
//
//   node tools/mix-voices-pairs.ts <site> <port> <out> <jobs.json> <side> [--wav]
//
// jobs.json: [{ name, a: <link>, b: <link>, listBpm, window?: [from, to] }] — the window in seconds; left out, six
// record bars before the blend to eight arriving bars past the swap. A line per job in <out>/measure-<side>.json:
// the seam, the levels and the readings below; with --wav the full render's window as a float WAV.
//
// Readings (100 ms RMS, both channels; the stems are solo renders, so each is the level it has in the mix before
// the master's limiter):
//   - heard: the first instant from the blend's start where the arriving voices are within 12 dB of the record
//     (whole), and `clear` within 6 dB, each against the swap;
//   - linger: the last instant after the swap where the record's voices are within 12 dB of the arriving theme;
//   - level: the full mix's RMS over each part (the four bars before the blend, the lead, the swap's bar, after),
//     and the limiter's share over a decibel through the blend;
//   - pulse: the longest stretch through the blend with no drum hit above -40 dBFS in a beat (both decks' drums).

import fs from 'node:fs';
import { serveSite, openPage } from './imprint/render.ts';
import { recipesFor } from '../src/mix.ts';
import { linkRead } from '../src/link.ts';
import { played } from './link-digest.ts';
import { seamPlan, blendAsked, handSeamBars } from '../src/performance.ts';
import { seamFromHere } from '../src/performance.ts';
import { setOptions } from '../src/set-plan.ts';
import { STRATEGIES } from '../src/strategies/index.ts';

const [site, port, out, jobsFile, side] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5], process.argv[6]];
const WAV = process.argv.includes('--wav');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1].split(',') : null; })();
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8')).filter((j: any) => !ONLY || ONLY.includes(j.name));
fs.mkdirSync(out, { recursive: true });
const o = setOptions(STRATEGIES['house-v2'].style, {});

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const request = (link: string) => {
  const read = linkRead(`?${link}`);
  const L = read.link, seed = L.seed ?? '1';
  const cast = quiet(() => recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` }));
  return { seed, theme: L.theme, spell: cast.spell ?? null, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } };
};

const RENDER = async (job: any) => {
  const dh = (window as any).deepHouse;
  const reductions: number[] = [];
  const Orig = window.AudioWorkletNode;
  (window as any).AudioWorkletNode = class extends Orig {
    constructor(...a: any[]) {
      super(...(a as [any, any, any]));
      this.port.addEventListener('message', (e: any) => { if (e.data && typeof e.data.reduction === 'number') reductions.push(e.data.reduction); });
      this.port.start();
    }
  };
  const period = (Math.ceil((job.rate / 8) / 128) * 128) / job.rate;
  const pa = dh.planTheme(job.A.seed, job.A.theme, job.A.opts);
  const pb = dh.planTheme(job.B.seed, job.B.theme, job.B.opts);
  const HOLE = (d: any, k: string) => { d.gaps ??= {}; (d.gaps[k] ??= []).push([0, Infinity]); };
  const muteOf: Record<string, (ds: any[]) => void> = {
    full: () => {},
    from: (ds) => HOLE(ds[1], '*'),
    to: (ds) => HOLE(ds[0], '*'),
    fromVoices: (ds) => { HOLE(ds[1], '*'); for (const b of ['bus:kick', 'bus:drums', 'bus:sub', 'kick', 'sub']) HOLE(ds[0], b); },
    toVoices: (ds) => { HOLE(ds[0], '*'); for (const b of ['bus:kick', 'bus:drums', 'bus:sub', 'kick', 'sub']) HOLE(ds[1], b); },
    pulse: (ds) => { for (const d of ds) for (const b of ['bus:melodic', 'bus:keys', 'bus:sub', 'sub']) HOLE(d, b); },
  };
  const outs: any = {};
  for (const v of job.variants) {
    reductions.length = 0;
    const r = await dh.renderMix({ plans: [pa, pb], seams: [{ bar: job.bar, bars: job.blend }], entries: [job.entry, 0], listBpm: job.listBpm, spells: [job.A.spell, job.B.spell],
      opts: { strategy: 'house-v2' }, sampleRate: job.rate, maxSeconds: job.to + 1, tail: 0, hand: true, onDecks: muteOf[v] });
    const buf = r.buffer;
    const a = Math.round(job.from * job.rate), b = Math.min(buf.length, Math.round(job.to * job.rate));
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const hop = Math.round(job.rate * 0.1), env: number[] = [], peak: number[] = [];
    for (let i = a; i + hop <= b; i += hop) {
      let s = 0, p = 0;
      for (let k = i; k < i + hop; k++) { s += L[k] * L[k] + R[k] * R[k]; p = Math.max(p, Math.abs(L[k]), Math.abs(R[k])); }
      env.push(+(10 * Math.log10(s / (2 * hop) + 1e-20)).toFixed(2));
      peak.push(+(20 * Math.log10(p + 1e-20)).toFixed(2));
    }
    // the limiter's posts, wait for the count the render made
    const want = Math.floor((Math.ceil(buf.length / 128) * 128) / Math.round(period * job.rate));
    for (let w = 0; reductions.length < want && w < 10000; w += 10) await new Promise((res) => setTimeout(res, 10));
    outs[v] = { env, peak, seams: r.seams, red: reductions.slice(), period };
    if (v === 'full' && job.wav) {
      const l = L.slice(a, b), rr = R.slice(a, b);
      const f = new Float32Array(l.length * 2);
      for (let i = 0; i < l.length; i++) { f[2 * i] = l[i]; f[2 * i + 1] = rr[i]; }
      const bytes = new Uint8Array(f.buffer), chunks: string[] = [];
      for (let q = 0; q < bytes.length; q += 1 << 20) { let s = ''; const end = Math.min(bytes.length, q + (1 << 20)); for (let i = q; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
      outs[v].chunks = chunks;
    }
  }
  (window as any).AudioWorkletNode = Orig;
  return outs;
};

function wavFloat(buf: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}
const pow = (db: number) => Math.pow(10, db / 10);
const dbOf = (xs: number[]) => (xs.length ? +(10 * Math.log10(xs.reduce((s, x) => s + pow(x), 0) / xs.length + 1e-20)).toFixed(1) : null);

const server = await serveSite(port, site) as { close: () => void };
const page = await openPage(port);
const file = `${out}/measure-${side}.json`;
const lines: any[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
try {
  for (const job of jobs) {
    const A = request(job.a), B = request(job.b);
    const pa: any = quiet(() => played(job.a).plan), pb: any = quiet(() => played(job.b).plan);
    // the record's own seam line (the playlist waits for it) and the hand's blend there (`handOver`)
    const seam = quiet(() => seamPlan(pa, blendAsked(pa), { boundaryBars: o.boundaryBars, notBefore: 0 }));
    const playA = job.listBpm ? (await import('../src/performance.ts')).listPull(pa.bpm, job.listBpm) ?? pa.bpm : pa.bpm;
    const hand = handSeamBars(o.handSeam, 240 / playA, o.harmonicCross, o.swapAfterBars);
    const s = seamFromHere(pa, seam.at, pb, { unit: 1, most: hand.blend });
    const recBar = 240 / playA;
    // the render's blend begins where the record's seam line is heard: its bar at the tempo played
    // the render opens ten record bars before the line (`entries`), so the rooms and the limiter are running at the window
    const entryBars = Math.max(0, s.bar - 10);
    const atGuess = (s.bar - entryBars) * recBar;
    const from = job.window?.[0] ?? atGuess - 6 * recBar;
    // (`tail`: seconds after the blend's guessed start, 40 by default; round loudness-place renders the arriving track's first phrase too)
    const to = job.window?.[1] ?? atGuess + (job.tail ?? 40);
    const VAR = (() => { const i = process.argv.indexOf('--variants'); return i >= 0 ? process.argv[i + 1].split(',') : null; })();
    const variants = VAR ?? ['full', 'from', 'to', 'fromVoices', 'toVoices', 'pulse'];
    const rate = 44100;
    const t0 = Date.now();
    const r = await page.page.evaluate(RENDER, { A, B, bar: s.bar, blend: s.bars, entry: entryBars * pa.barSeconds, listBpm: job.listBpm ?? null, rate, from, to, variants, wav: WAV });
    const seamR = r.full.seams[0];
    const at = seamR.at, swap = seamR.swapAt, end = seamR.end;
    const T = (i: number) => from + i * 0.1;
    const idx = (t: number) => Math.max(0, Math.round((t - from) / 0.1));
    const E = (v: string) => r[v].env as number[];
    // heard: the arriving voices against the record whole
    const firstWithin = (dB: number) => { for (let i = idx(at); i < idx(end); i++) if (E('toVoices')[i] > -60 && E('toVoices')[i] >= E('from')[i] - dB) return +(T(i) - swap).toFixed(1); return null; };
    // linger: the last instant after the swap where the record's voices are within 12 dB of the arriving theme
    let linger: number | null = null;
    for (let i = idx(swap); i < Math.min(idx(end + 4), E('full').length); i++) if (E('fromVoices')[i] > -60 && E('fromVoices')[i] >= E('to')[i] - 12) linger = +(T(i) - swap).toFixed(1);
    // the record's voices as heard: its voices' level against the full mix, a second after the swap and halfway to the end
    const rel = (v: string, t: number) => +(dbOf(E(v).slice(idx(t), idx(t + 1)))! - dbOf(E('full').slice(idx(t), idx(t + 1)))!).toFixed(1);
    const beat = recBar / 4;
    // pulse: the longest run of beat windows through the blend with no drum hit above -40 dBFS
    let gap = 0, run = 0;
    for (let t = at; t + beat <= end; t += beat) {
      const pk = Math.max(...r.pulse.peak.slice(idx(t), idx(t + beat)));
      run = pk < -40 ? run + beat : 0; gap = Math.max(gap, run);
    }
    // the limiter's share over a decibel through the blend
    const per = r.full.period, red: number[] = r.full.red;
    const blendRed = red.filter((_x: number, k: number) => k * per >= at && k * per < end);
    const shareIn = (t0: number, t1: number) => { const xs = red.filter((_x: number, k: number) => k * per >= t0 && k * per < t1); return xs.length ? +(xs.filter((x) => x > 1).length / xs.length).toFixed(3) : 0; };
    const line = {
      name: job.name, side, at: +at.toFixed(2), swap: +swap.toFixed(2), end: +end.toFixed(2), leadS: +(swap - at).toFixed(1), blendS: +(end - at).toFixed(1),
      window: [+from.toFixed(2), +to.toFixed(2)], seamBar: s.bar, blendBars: s.bars,
      heard: firstWithin(12), clear: firstWithin(6), linger,
      recordVoicesRel: { swapPlus1: rel('fromVoices', swap + 1), halfAfter: rel('fromVoices', swap + (end - swap) / 2) },
      arrivingVoicesRel: { lead: rel('toVoices', at + (swap - at) * 0.6) },
      level: {
        before: dbOf(E('full').slice(idx(at - 4 * recBar), idx(at))), lead: dbOf(E('full').slice(idx(at), idx(swap))),
        swapBar: dbOf(E('full').slice(idx(swap - 1), idx(swap + 2))), after: dbOf(E('full').slice(idx(swap), idx(end))),
        quietest1s: Math.min(...Array.from({ length: Math.max(1, Math.floor(end - at)) }, (_x, k) => dbOf(E('full').slice(idx(at + k), idx(at + k + 1)))!)),
      },
      limiter: { share: blendRed.length ? +(blendRed.filter((x) => x > 1).length / blendRed.length).toFixed(3) : 0, worst: +Math.max(0, ...blendRed).toFixed(2),
        before: shareIn(at - 4 * recBar, at), lead: shareIn(at, swap), after: shareIn(swap, end) },
      pulseGapS: +gap.toFixed(2), renderS: Math.round((Date.now() - t0) / 1000),
    };
    console.log(JSON.stringify(line));
    if (WAV) fs.writeFileSync(`${out}/${job.name}-${side}.wav`, wavFloat(Buffer.concat(r.full.chunks.map((c: string) => Buffer.from(c, 'base64'))), rate));
    fs.writeFileSync(`${out}/env-${job.name}-${side}.json`, JSON.stringify({ from, at, swap, end, env: Object.fromEntries(Object.keys(r).map((k) => [k, r[k].env])) }));
    const had = lines.findIndex((l) => l.name === job.name);
    if (had >= 0) lines[had] = line; else lines.push(line);
    fs.writeFileSync(file, JSON.stringify(lines, null, 1));
  }
} finally { await page.close(); server.close(); }
