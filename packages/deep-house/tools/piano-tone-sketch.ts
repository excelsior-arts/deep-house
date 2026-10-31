// The piano's tone (keys-balance's add-on and round piano-tone, 10-29): renders a featured track's window, or a short
// solo phrase in that track's room, with any of the room's piano numbers set over what the plan carries. Nothing else
// of the plan moves. `piano: { "string": null }` plays the six-partial string every piano played before round
// piano-tone (house-v2 writes the row's string into every room that sounds the piano); `piano: { "string": {..} }` a
// string of other numbers. Headless and silent (an OfflineAudioContext on the `out=silent` page). 32-bit float WAVs,
// plus the window's keys strikes.
//
//   node tools/piano-tone-sketch.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, ts?, bars?, solo?: true, piano?: {..block numbers}, note?: {..a solo note's own}, layers?: 'keys'|'rest'|null, gainDb? }]
// A solo plays the phrase below on the track's own piano events' room (gain, sends), every other event taken out.

import fs from 'node:fs';
import { serveSite, openPage } from './imprint/render.ts';
import { recipesFor } from '../src/mix.ts';
import { linkRead } from '../src/link.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

// the solo: one plain note, a short phrase, a rolled chord landing, one low note (seconds, midi, velocity, length)
const SOLO: Array<[number, number, number, number]> = [
  [0.0, 57, 0.6, 2.6],
  [3.0, 64, 0.55, 0.55], [3.6, 67, 0.5, 0.55], [4.2, 69, 0.62, 0.9], [5.1, 67, 0.48, 0.5],
  [5.8, 57, 0.5, 2.8], [5.814, 60, 0.5, 2.8], [5.828, 64, 0.52, 2.8],
  [9.2, 45, 0.55, 2.2],
];

const JOB = async (job) => {
  const dh = window.deepHouse;
  const t0plan = dh.planTheme(job.seed, job.theme, job.opts);
  const piano = { ...(t0plan.paramOverrides?.piano ?? {}), ...(job.piano ?? {}) };
  const t = { ...t0plan, paramOverrides: { ...t0plan.paramOverrides, piano } };
  const program = dh.programOf(t);
  const bs = program.barSeconds;
  const g = Math.pow(10, (job.gainDb ?? 0) / 20);
  let events = program.events;
  let tp, t0, t1;
  if (job.solo) {
    const tmpl = program.events.find((e) => e.layer === 'keys' && e.voice === 'piano');
    if (!tmpl) throw new Error('no piano in ' + job.name);
    const lead = tmpl.t - tmpl.onset;
    events = job.soloNotes.map(([s, midi, vel, dur], i) => ({ ...tmpl, i, t: 1 + s, onset: 1 + s - lead, bar: 0, step: 0,
      p: { ...tmpl.p, ...(job.note ?? {}), midi, vel, dur, gain: (tmpl.p.gain ?? 1) * g } }));
    tp = 0; t0 = 1; t1 = 13.5;
  } else {
    const from = Math.floor(job.ts / bs);
    tp = Math.max(0, from - 2) * bs; t0 = from * bs; t1 = (from + (job.bars ?? 8)) * bs;
    if (g !== 1) events = events.map((e) => (e.layer === 'keys' ? { ...e, p: { ...e.p, gain: (e.p.gain ?? 1) * g } } : e));
  }
  const all = [...new Set(events.map((e) => e.layer))];
  const layers = job.layers === 'keys' ? ['keys'] : job.layers === 'rest' ? all.filter((l) => l !== 'keys') : null;
  const started = performance.now();
  const slice = dh.sliceProgram({ ...program, events }, { from: tp, to: t1, tail: job.solo ? 2 : 0, layers });
  const buf = await dh.renderProgram(slice, { sampleRate: 48000 });
  const ms = performance.now() - started;
  const a = Math.round((t0 - tp) * 48000), b = Math.min(buf.length, Math.round((t1 - tp + (job.solo ? 2 : 0)) * 48000));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer), chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let str = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) str += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(str)); }
  const keys = events.filter((e) => e.layer === 'keys' && e.t >= t0 && e.t < t1).map((e) => ({ bar: e.bar, step: e.step, t: e.t, midi: e.p.midi, vel: e.p.vel }));
  return { chunks, t0: job.solo ? 1 : t0, keys, ms, string: piano.string ? 'the row\'s or the job\'s' : 'six partials', grain: piano.grain ?? null };
};

function wavFloat(buf: Buffer, rate: number) {
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
    const read = linkRead(`?${job.link}`);
    const L = read.link, seed = L.seed ?? '1';
    const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
    const r = await b.page.evaluate(JOB, { ...job, soloNotes: SOLO, seed, theme: L.theme,
      opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } });
    fs.writeFileSync(`${out}/${job.name}.wav`, wavFloat(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), 48000));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ t0: r.t0, keys: r.keys, ms: r.ms, string: r.string, grain: r.grain }));
    console.log(job.name, 'string', r.string, 'grain', JSON.stringify(r.grain), 'render', Math.round(r.ms), 'ms');
  }
} finally { await b.close(); server.close(); }
