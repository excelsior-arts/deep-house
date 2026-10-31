// **The endings' pairs** (round chillstep-ends, 10-29): a track's last bars into what follows it, rendered offline
// through the set's own graph (`renderMix`, stated plans and a stated seam), before and after, at the same gain.
// Headless and silent (an OfflineAudioContext on the `out=silent` page).
//
//   node tools/ends-pairs.ts <site> <port> <out> <jobs.json> [before|after]
//
// A side named renders that side alone (the before off one build, the after off another: a form that moved is
// planned by its own build); the window is the same either way.
//
// jobs.json: [{ name, a: <link>, b: <link> | null, listBpm?: number | null, window?: 32,
//               before: { bar }, after: { bar }, blend?: number }]
// `b` null is the set's own next theme (the seed's theme after `a`'s). The blend is the hand's where a playlist asks
// (`listBpm` given): its swap is fourteen seconds at the tempo played, the blend twice that, no longer than the
// outgoing plan's own blend allows (`seamFromHere`); alone it is the plan's own (`seamPlan`). The window is the
// `window` bars (32) of the outgoing theme that end where the after's blend ends, the same seconds in both files.
// A float WAV per side and a line of facts (the RMS of each, the seam and the blend).

import fs from 'node:fs';
import { serveSite, openPage } from './imprint/render.ts';
import { recipesFor } from '../src/mix.ts';
import { linkRead } from '../src/link.ts';
import { played } from './link-digest.ts';
import { blendBarsFor, blendAsked, listPull } from '../src/performance.ts';

const [site, port, out, jobsFile, only] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5], process.argv[6]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const request = (link: string, themeOverride?: number) => {
  const read = linkRead(`?${link}`);
  const L = read.link, seed = L.seed ?? '1';
  const cast = quiet(() => recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` }));
  return { seed, theme: themeOverride ?? L.theme, spell: cast.spell ?? null, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } };
};

const RENDER = async (job: any) => {
  const dh = (window as any).deepHouse;
  const pa = dh.planTheme(job.A.seed, job.A.theme, job.A.opts);
  const pb = dh.planTheme(job.B.seed, job.B.theme, job.B.opts);
  const r = await dh.renderMix({ plans: [pa, pb], seams: [{ bar: job.bar, bars: job.blend }], listBpm: job.listBpm, spells: [job.A.spell, job.B.spell],
    opts: { strategy: 'house-v2' }, sampleRate: job.rate, maxSeconds: job.to + 2, tail: 0 });
  const buf = r.buffer;
  const a = Math.round(job.from * job.rate), b = Math.min(buf.length, Math.round(job.to * job.rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer), chunks: string[] = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  return { chunks, seams: r.seams };
};

function wavFloat(buf: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}
const rmsDb = (buf: Buffer) => { const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4); let s = 0; for (const x of f) s += x * x; return 10 * Math.log10(s / f.length + 1e-20); };

const server = await serveSite(port, site) as { close: () => void };
const page = await openPage(port);
const factsFile = `${out}/facts.json`;
const facts: any[] = fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : [];
try {
  for (const job of jobs) {
    const A = request(job.a);
    const B = job.b ? request(job.b) : { ...A, theme: A.theme + 1 };
    const pa: any = quiet(() => played(job.a).plan);
    const pb: any = quiet(() => (job.b ? played(job.b) : played(job.a, A.theme + 1)).plan);
    const rate = job.rate ?? 48000;
    const playBpm = job.listBpm ? (listPull(pa.bpm, job.listBpm) ?? pa.bpm) : pa.bpm;
    const bs = 240 / playBpm;
    // the hand's blend in a playlist (`handOver`): twice its swap of fourteen seconds, capped as `seamFromHere` caps it
    const hand = job.listBpm ? 2 * Math.max(1, Math.round(14 / bs)) : Infinity;
    const blendOf = (bar: number) => job.blend ?? (job.listBpm
      ? Math.max(2, Math.min(Math.min(hand, blendBarsFor(pb, blendBarsFor(pa, blendAsked(pa)))), Math.max(2, pa.bars - bar - 1)))
      : Math.max(2, Math.min(blendBarsFor(pa, blendAsked(pa)), pa.bars - bar - 2)));
    const W = job.window ?? 32;
    const endBar = job.after.bar + blendOf(job.after.bar);
    const from = Math.max(0, endBar - W) * bs, to = endBar * bs;
    const line: any = { name: job.name, playBpm: +playBpm.toFixed(1), window: [Math.max(0, endBar - W), endBar], seconds: [+from.toFixed(1), +to.toFixed(1)] };
    for (const side of (only ? [only] : ['before', 'after']) as Array<'before' | 'after'>) {
      const bar = job[side].bar, blend = blendOf(bar);
      const r = await page.page.evaluate(RENDER, { A, B, bar, blend, listBpm: job.listBpm ?? null, rate, from, to });
      const pcm = Buffer.concat(r.chunks.map((c: string) => Buffer.from(c, 'base64')));
      fs.writeFileSync(`${out}/${job.name}-${side}.wav`, wavFloat(pcm, rate));
      line[side] = { bar, blend, at: +(r.seams[0]?.at ?? 0).toFixed(2), rmsDb: +rmsDb(pcm).toFixed(2) };
      console.log(job.name, side, JSON.stringify(line[side]));
    }
    const had = facts.find((f: any) => f.name === job.name);
    if (had) Object.assign(had, line); else facts.push(line);
    fs.writeFileSync(factsFile, JSON.stringify(facts, null, 1));
  }
} finally { await page.close(); server.close(); }
