// trance-drawn (11-04): the round's renderer, headless and silent (an OfflineAudioContext on the `out=silent` page of a
// build of the branch). Per job, the link's own plan, planned on the page with the round's private option:
//   - `trance`: absent, the house's draw (the rule as it plays); `off`, today (the theme as the place lays it); a list,
//     the techniques named outright (a sketch: `["phrase-hook:pianoFelt", "dark-bed", "strip-breakdown"]`);
//   - `windows`: [[fromBar, toBar], ...], rendered one by one and joined with a short crossfade; or `fromBar`/`toBar`;
//   - `only` / `except` (layers), `parts` (the round's parts: `trance:front`, …): a stem;
//   - `events`: a tool's own events for the window (the saw's solo loops).
// Beside each WAV, its facts: the sections, the draw, the voices, the events in the windows by part.
//   node tools/trance-drawn-render.ts <site> <port> <out> <jobs.json>
import fs from 'node:fs';
import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { grooveSketch } from '../packages/deep-house/src/groove-sketch.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
const RATE = 48000;

const RENDER = async (job) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  if (job.events) t.events = job.events;
  let program = dh.programOf(t);
  const keep = (e) => (!job.only || job.only.includes(e.layer)) && (!job.except || !job.except.includes(e.layer)) && (!job.parts || job.parts.includes(e.part ?? '')) && (!job.exceptParts || !job.exceptParts.includes(e.part ?? ''));
  program = { ...program, events: program.events.filter(keep) };
  const bs = program.barSeconds;
  const from = job.fromBar, to = job.toBar;
  const tp = Math.max(0, from - 2) * bs, t0 = from * bs, t1 = to * bs + (job.tail ?? 0);
  const slice = dh.sliceProgram(program, { from: tp, to: t1, tail: 0 });
  const buf = await dh.renderProgram(slice, { sampleRate: job.rate });
  const a = Math.round((t0 - tp) * job.rate), b = Math.min(buf.length, Math.round((t1 - tp) * job.rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer);
  const chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let str = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) str += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(str)); }
  return { chunks, bpm: program.bpm, barSeconds: bs };
};

export function wav(f: Float32Array, rate: number) {
  const buf = Buffer.from(f.buffer, f.byteOffset, f.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}
const floats = (chunks: string[]) => { const b = Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64'))); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
function join(parts: Float32Array[], fadeFrames: number): Float32Array {
  const total = parts.reduce((n, p) => n + p.length / 2, 0) - fadeFrames * (parts.length - 1);
  const o = new Float32Array(total * 2);
  let at = 0;
  parts.forEach((p, k) => {
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = at + i, x = k > 0 && i < fadeFrames ? i / fadeFrames : 1;
      o[2 * j] = o[2 * j] * (1 - x) + p[2 * i] * x;
      o[2 * j + 1] = o[2 * j + 1] * (1 - x) + p[2 * i + 1] * x;
    }
    at += n - fadeFrames;
  });
  return o;
}

export const optsOf = (link: string) => {
  const read = linkRead(`?${link}`);
  const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  return { seed, theme: L.theme, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } };
};

const server = await serveSite(port, site) as { close: () => void };
const b = await openPage(port);
try {
  for (const job of jobs) {
    const file = `${out}/${job.name}.wav`;
    if (fs.existsSync(file) && !job.again) { console.log(job.name, 'kept'); continue; }
    const { seed, theme, opts } = optsOf(job.link);
    const o = { ...opts, ...(job.trance ? { trance: job.trance } : {}), ...(job.rolls ? { rolls: job.rolls } : {}) };
    const plan = planTheme(seed, theme, o as never) as any;
    // a groove sketch (`groove=`): the page's own bypass, applied here and the events handed to the page
    if (job.groove) job.events = grooveSketch(plan, job.groove).events;
    // `section`: a kind, its nth (`drop:1`, `drop:last`), optionally its own bars (`drop:last:8` its last eight)
    const secWin = (q: string): [number, number] => {
      const [kind, nth, n, m] = q.split(':');
      const list = plan.arrangement.sections.filter((s) => s.kind === kind);
      const s = nth === 'last' ? list[list.length - 1] : list[Number(nth ?? 0)];
      if (!s) throw new Error(`${job.name}: no ${q}`);
      if (m != null) return [s.startBar + Number(n), s.startBar + Number(m)];
      return n ? (Number(n) > 0 ? [s.startBar, s.startBar + Number(n)] : [s.startBar + s.bars + Number(n), s.startBar + s.bars]) : [s.startBar, s.startBar + s.bars];
    };
    const windows: [number, number][] = job.windows ? job.windows.map((w) => typeof w === 'string' ? secWin(w) : w) : job.section ? [secWin(job.section)] : [[job.fromBar ?? 0, job.toBar ?? plan.bars]];
    const parts: Float32Array[] = [];
    let r = null;
    const inWin: Record<string, number> = {};
    for (const [from, to] of windows) {
      r = await b.page.evaluate(RENDER, { seed, theme, opts: o, events: job.events ?? null, only: job.only, except: job.except, parts: job.parts, exceptParts: job.exceptParts, fromBar: from, toBar: to, rate: RATE, tail: job.tail ?? 0 });
      parts.push(floats(r.chunks));
      for (const e of (job.events ?? plan.events)) if (e.bar >= from && e.bar < to) { const k = `${e.part ?? e.layer}:${e.voice}`; inWin[k] = (inWin[k] ?? 0) + 1; }
    }
    const all = parts.length > 1 ? join(parts, Math.round((r.barSeconds / 8) * RATE)) : parts[0];
    fs.writeFileSync(file, wav(all, RATE));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ name: job.name, link: job.link, trance: job.trance ?? null, windows, bpm: r.bpm, barSeconds: r.barSeconds,
      sections: plan.arrangement.sections.map((s) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars })), draw: plan.tranceDrawn ?? null, events: inWin }));
    console.log(job.name, JSON.stringify(windows), `${(all.length / 2 / RATE).toFixed(1)} s`, plan.tranceDrawn ? JSON.stringify(plan.tranceDrawn) : 'today');
  }
} finally { await b.close(); server.close(); }
