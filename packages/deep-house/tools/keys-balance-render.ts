// keys-balance (10-29): a featured track's stems for the keys' balance measure
// (tools/keys-balance.py). Renders a window of a link's theme, planned as the
// page plans it, as 32-bit float WAVs, one per stem, plus the plan facts the
// measure reads: the keys' strikes, the hats' strikes and the sections.
// Headless and silent (an OfflineAudioContext on the `out=silent` page).
//
//   node tools/keys-balance-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar?, toBar?, rate?, piano?: {..the room's piano numbers}, stems: { <stem>: 'all' | 'keys' | 'rest' | 'hats' | 'drums' | string[] | { voices: string[] } } }]
// `piano` is written over the plan's piano block (round piano-tone: `{ "string": null }` is the six-partial string).
// 'rest' is every layer but the keys; 'hats' the hats and the shaker.

import fs from 'node:fs';
import { serveSite, openPage } from './imprint/render.ts';
import { recipesFor } from '../src/mix.ts';
import { linkRead } from '../src/link.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

const HATS = ['hats', 'shaker'];

const PLAN = (job) => {
  const dh = window.deepHouse;
  const planned = dh.planTheme(job.seed, job.theme, job.opts);
  const t = job.piano ? { ...planned, paramOverrides: { ...planned.paramOverrides, piano: { ...(planned.paramOverrides?.piano ?? {}), ...job.piano } } } : planned;
  const program = dh.programOf(t);
  const bs = program.barSeconds;
  const facts = {
    bpm: program.bpm, barSeconds: bs, bars: t.bars,
    sections: t.arrangement.sections.map((s) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars })),
    layers: [...new Set(program.events.map((e) => e.layer))],
    keys: program.events.filter((e) => e.layer === 'keys').map((e) => ({ bar: e.bar, step: e.step, t: e.t, midi: e.p.midi, vel: e.p.vel, dur: e.p.dur, voice: e.voice })),
    hats: program.events.filter((e) => e.layer === 'hats' || e.layer === 'shaker').map((e) => ({ bar: e.bar, step: e.step, t: e.t, voice: e.voice, vel: e.p.vel })),
  };
  return facts;
};

const RENDER = async (job) => {
  const dh = window.deepHouse;
  const planned = dh.planTheme(job.seed, job.theme, job.opts);
  const t = job.piano ? { ...planned, paramOverrides: { ...planned.paramOverrides, piano: { ...(planned.paramOverrides?.piano ?? {}), ...job.piano } } } : planned;
  const program = dh.programOf(t);
  const bs = program.barSeconds;
  const from = job.fromBar ?? 0, to = job.toBar ?? t.bars;
  const tp = Math.max(0, from - 2) * bs, t0 = from * bs, t1 = to * bs;
  const rate = job.rate ?? 48000;
  const only = job.voices ? { ...program, events: program.events.filter((e) => job.voices.includes(e.voice)) } : program;
  const slice = dh.sliceProgram(only, { from: tp, to: t1, tail: 0, layers: job.layers });
  const buf = await dh.renderProgram(slice, { sampleRate: rate });
  const a = Math.round((t0 - tp) * rate), b = Math.min(buf.length, Math.round((t1 - tp) * rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer), chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let str = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) str += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(str)); }
  return { chunks, t0 };
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
    const base = { seed, theme: L.theme, piano: job.piano, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } };
    const facts = await b.page.evaluate(PLAN, base);
    const keysLayers = (spec) => spec === 'all' ? null : spec === 'keys' ? ['keys'] : spec === 'rest' ? facts.layers.filter((l) => l !== 'keys')
      : spec === 'hats' ? facts.layers.filter((l) => HATS.includes(l))
      : spec === 'drums' ? facts.layers.filter((l) => ['kick', 'clap', 'perc', ...HATS].includes(l))
      // the scene above the floor: every layer but the keys, the kick and the bass (the pad, the hats, the claps, the fx)
      : spec === 'top' ? facts.layers.filter((l) => !['keys', 'kick', 'bass'].includes(l)) : spec;
    for (const [stem, spec] of Object.entries(job.stems ?? { mix: 'all' })) {
      const voices = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec.voices : null;
      const layers = voices ? null : keysLayers(spec);
      if (layers && !layers.length) { console.log(job.name, stem, 'no such layers'); continue; }
      const r = await b.page.evaluate(RENDER, { ...base, fromBar: job.fromBar, toBar: job.toBar, layers, voices, rate: job.rate });
      fs.writeFileSync(`${out}/${job.name}-${stem}.wav`, wavFloat(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), job.rate ?? 48000));
      console.log(job.name, stem, voices ? voices.join(',') : layers ? layers.join(',') : 'all');
    }
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ ...facts, link: job.link, fromBar: job.fromBar ?? 0, toBar: job.toBar ?? facts.bars }));
  }
} finally { await b.close(); server.close(); }
