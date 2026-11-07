// air-voices (11-02), a copy of voice-homes' renderer for the air sketches, headless and silent (an OfflineAudioContext
// on the `out=silent` page). Per job, over the link's own program:
//   - `add`: events written into the program, each `{ bar, voice, layer, bus, level, durBars?, p }` (`bar` may be a
//     fraction; `durBars` becomes `p.dur` in seconds at the theme's tempo);
//   - `settings`: a partial merged over the compiled settings (a voice's opened lid);
//   - `only` (layers) or `voices` (voice names): a stem;
//   - `facts` beside each WAV: the sections, the window, the added events in seconds.
//
//   node tools/air-voices-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar?, toBar?, rate?, add?, settings?, only?, voices?, again? }]

import fs from 'node:fs';
import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

const PLAN = (job) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  const program = dh.programOf(t);
  const kick = program.events.find((e) => e.layer === 'kick' && e.step === 0 && e.bar > 0);
  return {
    bpm: program.bpm, barSeconds: program.barSeconds, bars: t.bars,
    sections: t.arrangement.sections.map((s) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars })),
    clock: kick ? { bar: kick.bar, t: kick.t } : null,
  };
};

const RENDER = async (job) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  let program = dh.programOf(t);
  if (job.settings) { const m = (x, y) => { const o = { ...x }; for (const k of Object.keys(y)) o[k] = y[k] && typeof y[k] === 'object' && !Array.isArray(y[k]) ? m(x?.[k] ?? {}, y[k]) : y[k]; return o; }; program = { ...program, settings: m(program.settings, job.settings) }; }
  if (job.add?.length) {
    const ev = [...program.events, ...job.add.map((a, k) => ({ i: 0, voice: a.voice, layer: a.layer, bus: a.bus, level: a.level, bar: Math.floor(a.t / program.barSeconds), step: null, t: a.t, onset: a.t, lead: 0, duck: false, gap: null, p: a.p }))];
    ev.sort((x, y) => x.onset - y.onset);
    program = { ...program, events: ev.map((e, i) => ({ ...e, i })) };
  }
  if (job.only) program = { ...program, events: program.events.filter((e) => job.only.includes(e.layer)) };
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
  return { chunks };
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
    const base = { seed, theme: L.theme, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } };
    const facts = await b.page.evaluate(PLAN, base);
    const bs = facts.barSeconds;
    // `durBars` and any `<x>Bars` of a note (`attackBars`, `cycleBars`, `fallBars`) become seconds at the theme's tempo
    const secs = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => /^[a-z]+Bars$/.test(k) && typeof v === 'number' ? [k.slice(0, -4), +(v * bs).toFixed(4)] : [k, v]));
    const add = (job.add ?? []).map((a) => ({ ...a, t: a.bar * bs, p: secs({ ...a.p, ...(a.durBars != null ? { durBars: a.durBars } : {}) }) }));
    if (job.factsOnly) { console.log(JSON.stringify({ name: job.name, ...facts })); continue; }
    const from = job.fromBar ?? 0, to = Math.min(job.toBar ?? facts.bars, facts.bars);
    const r = await b.page.evaluate(RENDER, { ...base, add, settings: job.settings, only: job.only, voices: job.voices, fromBar: from, toBar: to, rate: job.rate });
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), job.rate ?? 48000));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ ...facts, name: job.name, link: job.link, fromBar: from, toBar: to, add, settings: job.settings ?? null }));
    console.log(job.name, `${from}-${to}`, add.length ? `+${add.length} events` : '');
  }
} finally { await b.close(); server.close(); }
