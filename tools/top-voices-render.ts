// top-voices (11-02), scratch: the quiet top voices' sketches, rendered headless and silent (an OfflineAudioContext on
// the `out=silent` page). A copy of voice-homes' renderer, trimmed, with:
//   - `add`: notes laid over the program as written, each `{ voice, bar, step, p }` (a bar of the theme, a sixteenth of
//     it), timed as the program's own notes on that sixteenth are (its push), on the voice's own bus and layer;
//   - `solo`: only the added notes (the sketch alone in the theme's rooms and master);
//   - `only` / `drop`: a stem by layer or voice (the hat stem the levels are read against).
//
//   node tools/top-voices-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar, toBar, add?, solo?, only?, drop?, rate? }]

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
  const bs = program.barSeconds;
  // each sixteenth's push, read off the program's own notes on it (the offbeat's -6 ms)
  const push = {};
  for (const e of program.events) if (typeof e.step === 'number' && typeof e.bar === 'number' && (e.layer === 'hats' || e.layer === 'kick' || e.layer === 'shaker')) (push[e.step] ||= []).push(e.t - e.bar * bs - e.step * bs / 16);
  const pushOf = (s) => { const l = (push[s] || [0]).slice().sort((a, b) => a - b); return l[Math.floor(l.length / 2)]; };
  const voices = dh.voiceFacts ? dh.voiceFacts() : null;
  const added = (job.add || []).map((a, k) => {
    const d = voices?.[a.voice];
    const t0 = a.bar * bs + a.step * bs / 16 + (Number.isInteger(a.step) ? pushOf(a.step) : 0);
    return { i: program.events.length + k, voice: a.voice, layer: a.layer ?? d?.layer ?? 'fx', bus: a.bus ?? d?.bus ?? 'drums', level: null, bar: a.bar, step: Math.floor(a.step), t: t0, onset: t0, lead: 0, duck: false, gap: null, part: 'top-sketch', p: a.p };
  });
  let events = job.solo ? added : [...program.events, ...added];
  if (job.only) events = events.filter((e) => job.only.includes(e.layer) || job.only.includes(e.voice));
  if (job.drop) events = events.filter((e) => !(job.drop.includes(e.layer) || job.drop.includes(e.voice)));
  events = events.slice().sort((a, b) => a.onset - b.onset);
  program = { ...program, events };
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
  const hat = program.events.find((e) => e.voice === 'hatClosed' || e.layer === 'hats');
  return { chunks, bpm: program.bpm, barSeconds: bs, added: added.length, sections: t.arrangement.sections.map((s) => `${s.kind}@${s.startBar}+${s.bars}`).join(' '), hatGain: hat?.p?.gain ?? null };
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
    const r = await b.page.evaluate(RENDER, { ...base, add: job.add, solo: job.solo, only: job.only, drop: job.drop, fromBar: job.fromBar, toBar: job.toBar, rate: job.rate });
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), job.rate ?? 48000));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ name: job.name, link: job.link, fromBar: job.fromBar, toBar: job.toBar, bpm: r.bpm, barSeconds: r.barSeconds, sections: r.sections, added: r.added, hatGain: r.hatGain, solo: !!job.solo }));
    console.log(job.name, `${job.fromBar}-${job.toBar}`, `+${r.added}`);
  }
} finally { await b.close(); server.close(); }
