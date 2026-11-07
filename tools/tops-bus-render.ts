// tops-bus (11-02): renders of a link's theme for the tops bus's pairs and measures, headless and silent (an
// OfflineAudioContext on the `out=silent` page). piano-pool's renderer, trimmed, with:
//   - `tops`: 'strip' renders the program with the tops bus's lines taken off and its notes back on the drums' bus (the
//     moves undone in the same build); 'park' routes the top layers onto the bus with every stage parked (the bus at
//     rest: the proof that it moves no sample); absent, the program as the site planned it.
//   - `only` / `drop`: a stem by layer.
//   - `facts` beside each WAV: the sections, the window, the tops lines as rendered.
//
//   node tools/tops-bus-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar?, toBar?, rate?, tops?, only?, drop?, again? }]

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
  return {
    bpm: program.bpm, barSeconds: program.barSeconds, bars: t.bars,
    sections: t.arrangement.sections.map((s) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars })),
    kick: program.events.some((e) => e.layer === 'kick'),
    topsLines: program.automation.filter((l) => l.param.startsWith('tops.')),
    topsMoves: t.topsMoves ?? null,
    onTops: program.events.filter((e) => e.bus === 'tops').length,
  };
};

const RENDER = async (job) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  let program = dh.programOf(t);
  const TOP = new Set(['hats', 'shaker', 'perc']);
  if (job.tops === 'strip') program = { ...program, automation: program.automation.filter((l) => !l.param.startsWith('tops.')),
    events: program.events.map((e) => e.bus === 'tops' ? { ...e, bus: 'drums' } : e) };
  if (job.tops === 'park') program = { ...program,
    automation: [...program.automation.filter((l) => !l.param.startsWith('tops.')),
      { param: 'tops.lp.cutoffHz', curve: 'exponential', points: [{ t: 0, value: 20000 }] },
      { param: 'tops.lp.wet.gain', curve: 'linear', points: [{ t: 0, value: 0 }] },
      { param: 'tops.lp.dry.gain', curve: 'linear', points: [{ t: 0, value: 1 }] },
      { param: 'tops.shelf.gain', curve: 'linear', points: [{ t: 0, value: 0 }] },
      { param: 'tops.gate.gain', curve: 'linear', points: [{ t: 0, value: 1 }] }],
    events: program.events.map((e) => e.bus === 'drums' && TOP.has(e.layer) ? { ...e, bus: 'tops' } : e) };
  if (job.only || job.drop) program = { ...program, events: program.events.filter((e) => job.only ? job.only.includes(e.layer) : !job.drop.includes(e.layer)) };
  const bs = program.barSeconds;
  const from = job.fromBar ?? 0, to = job.toBar ?? t.bars;
  const tp = Math.max(0, from - 2) * bs, t0 = from * bs, t1 = to * bs;
  const rate = job.rate ?? 48000;
  const slice = dh.sliceProgram(program, { from: tp, to: t1, tail: 0 });
  const t0r = performance.now();
  const buf = await dh.renderProgram(slice, { sampleRate: rate });
  const ms = performance.now() - t0r;
  const a = Math.round((t0 - tp) * rate), b = Math.min(buf.length, Math.round((t1 - tp) * rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const f = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  const bytes = new Uint8Array(f.buffer);
  const chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let str = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) str += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(str)); }
  return { chunks, ms };
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
    const from = job.fromBar ?? 0, to = Math.min(job.toBar ?? facts.bars, facts.bars);
    const r = await b.page.evaluate(RENDER, { ...base, tops: job.tops, only: job.only, drop: job.drop, fromBar: from, toBar: to, rate: job.rate });
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), job.rate ?? 48000));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ ...facts, name: job.name, link: job.link, fromBar: from, toBar: to, tops: job.tops ?? null, renderMs: Math.round(r.ms) }));
    console.log(job.name, `${from}-${to}`, `${facts.topsLines.length} tops lines, ${facts.onTops} notes on the bus`, job.tops ?? 'as planned');
  }
} finally { await b.close(); server.close(); }
