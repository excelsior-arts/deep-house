// ep-noise (11-05): renders of a link's window for the FM electric piano's noise, headless and silent (an
// OfflineAudioContext on the `out=silent` page). A trimmed copy of voice-homes' renderer, with:
//   - `voices`: a regex; only the events whose voice matches render (the voice alone through the whole graph: its
//     bus, its edge, its sends), where `drop` renders everything but them;
//   - `settings`: a partial merged over the program's settings (`{ cleanKeys: ['fmEpSoft'] }`);
//   - `notes`: a partial merged into the matching events' parameters (`{ voice: '^fmEp', p: { vel: 0.5 } }`);
//   - `search`: extra query words passed as the plan's search (`&recipe=auto`).
// The round's four options were renders of one build with a theme setting the row's `edgeShare` replaced; the
// soft FM EP's quarter now comes from its row, and a render of `local` before it is today's.
//
//   node tools/ep-noise-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar?, toBar?, voices?, drop?, settings?, notes?, again? }]

import fs from 'node:fs';
import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

const RENDER = async (job) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  let program = dh.programOf(t);
  const m = (x, y) => { const o = { ...x }; for (const k of Object.keys(y)) o[k] = y[k] && typeof y[k] === 'object' && !Array.isArray(y[k]) ? m(x?.[k] ?? {}, y[k]) : y[k]; return o; };
  if (job.settings) program = { ...program, settings: m(program.settings, job.settings) };
  if (job.notes) { const re = new RegExp(job.notes.voice); program = { ...program, events: program.events.map((e) => re.test(e.voice) ? { ...e, p: { ...e.p, ...job.notes.p } } : e) }; }
  if (job.voices) { const re = new RegExp(job.voices); program = { ...program, events: program.events.filter((e) => re.test(e.voice)) }; }
  if (job.drop) { const re = new RegExp(job.drop); program = { ...program, events: program.events.filter((e) => !re.test(e.voice)) }; }
  const bs = program.barSeconds;
  const from = job.fromBar ?? 0, to = job.toBar ?? t.bars;
  const tp = Math.max(0, from - 2) * bs, t0 = from * bs, t1 = to * bs;
  const rate = 48000;
  const slice = dh.sliceProgram(program, { from: tp, to: t1, tail: 0 });
  const buf = await dh.renderProgram(slice, { sampleRate: rate });
  const a = Math.round((t0 - tp) * rate), b = Math.min(buf.length, Math.round((t1 - tp) * rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer);
  const chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let str = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) str += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(str)); }
  return { chunks, bars: t.bars, barSeconds: bs, edge: program.settings.harmonicEdge ?? null, cleanKeys: program.settings.cleanKeys ?? null };
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
    const search = `?${read.search}${job.search ?? ''}`;
    const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search });
    const opts = { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development, search };
    const r = await b.page.evaluate(RENDER, { seed, theme: L.theme, opts, settings: job.settings, notes: job.notes, voices: job.voices, drop: job.drop, fromBar: job.fromBar, toBar: job.toBar });
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), 48000));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ name: job.name, link: job.link, fromBar: job.fromBar, toBar: job.toBar, bars: r.bars, barSeconds: r.barSeconds, edge: r.edge, cleanKeys: r.cleanKeys }));
    console.log(job.name, JSON.stringify({ edge: r.edge, cleanKeys: r.cleanKeys }));
  }
} finally { await b.close(); server.close(); }
