// dark-fronts (11-03): the sketch renderer, air-voices' copy, headless and silent (an OfflineAudioContext on the
// `out=silent` page). Per job, over the link's own plan:
//   - `front`: `{ voice, ways?, loom, parts? }` (the sketches; the rule's themes plan their own front), the front lane written by `frontSketch` (`src/front-sketch.ts`, the function
//     `front=` runs on the page): planned here under the page's own options, its `keys` notes handed to the page, which
//     puts them in its plan in place of the theme's before compiling it;
//   - `only` / `except` (layers) or `voices` (names): a stem;
//   - beside each WAV, its facts: the sections, the window, the front's notes in the window.
//
//   node tools/dark-fronts-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar?, toBar?, rate?, front?, only?, except?, voices?, again? }]

import fs from 'node:fs';
import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { frontSketch } from '../packages/deep-house/src/front-sketch.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

const RENDER = async (job) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  if (job.keys) t.events = [...t.events.filter((e) => e.layer !== 'keys'), ...job.keys].sort((x, y) => x.t - y.t);
  let program = dh.programOf(t);
  if (job.only) program = { ...program, events: program.events.filter((e) => job.only.includes(e.layer)) };
  if (job.except) program = { ...program, events: program.events.filter((e) => !job.except.includes(e.layer)) };
  if (job.voices) program = { ...program, events: program.events.filter((e) => job.voices.includes(e.voice)) };
  const bs = program.barSeconds;
  const from = job.fromBar ?? 0, to = job.toBar ?? t.bars;
  const tp = Math.max(0, from - 2) * bs, t0 = from * bs, t1 = to * bs;
  const rate = job.rate ?? 48000;
  const slice = dh.sliceProgram(program, { from: tp, to: t1, tail: 0 });
  const buf = await dh.renderProgram(slice, { sampleRate: rate });
  const a = Math.round((t0 - tp) * rate), b = Math.min(buf.length, Math.round((t1 - tp) * rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer);
  const chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let str = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) str += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(str)); }
  return { chunks, bpm: program.bpm, barSeconds: bs, bars: t.bars, sections: t.arrangement.sections.map((s) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars })),
    keysVoices: [...new Set(program.events.filter((e) => e.layer === 'keys').map((e) => e.voice))] };
};

function wav(buf: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}

const server = await serveSite(port, site) as { close: () => void };
const b = await openPage(port);
try {
  for (const job of jobs) {
    const file = `${out}/${job.name}.wav`;
    if (fs.existsSync(file) && !job.again) { console.log(job.name, 'kept'); continue; }
    const read = linkRead(`?${job.link}`);
    const L = read.link, seed = L.seed ?? '1';
    const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
    const opts = { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development };
    let keys = null;
    if (job.front) {
      const t = frontSketch(planTheme(seed, L.theme, opts), job.front);
      keys = t.events.filter((e) => e.layer === 'keys');
    }
    const from = job.fromBar ?? 0;
    const r = await b.page.evaluate(RENDER, { seed, theme: L.theme, opts, keys, only: job.only, except: job.except, voices: job.voices, fromBar: from, toBar: job.toBar, rate: job.rate });
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), job.rate ?? 48000));
    const to = job.toBar ?? r.bars;
    const inWindow = (keys ?? []).filter((e) => e.bar >= from && e.bar < to).map((e) => ({ bar: e.bar, step: e.step, note: e.note, t: +(e.t - from * r.barSeconds).toFixed(3), dur: +e.p.dur.toFixed(3), throw: (e.p.reverb ?? 0) > 1 }));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ name: job.name, link: job.link, front: job.front ?? null, fromBar: from, toBar: to, bpm: r.bpm, barSeconds: r.barSeconds, sections: r.sections, keysVoices: r.keysVoices, frontNotes: inWindow }));
    console.log(job.name, `${from}-${to}`, r.keysVoices.join(','), job.front ? `${inWindow.length} front notes` : '');
  }
} finally { await b.close(); server.close(); }
