// stereo-motion (10-31): renders of a link's theme for the stereo plan's sketches and pairs, headless and silent (an
// OfflineAudioContext on the `out=silent` page). A scratch copy of the stereo audit's renderer, trimmed, with:
//   - `plan`: the sketch's stereo plan. `'off'` writes no width line (the room's own numbers); an object is a partial of
//     the plan's row (`src/stereo-plan.ts`) merged over it, and its lines replace the program's own width lines;
//     absent, the program renders as the site planned it.
//   - `facts` beside each WAV: the sections, the window, the width lines as rendered.
//
//   node tools/stereo-motion-render.ts <site> <port> <out> <jobs.json>
//
// jobs.json: [{ name, link, fromBar?, toBar?, rate?, bits?, plan?, again? }]

import fs from 'node:fs';
import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { stereoPlanOf, stereoLines, returnFormPoints, STEREO_PLAN_ROW } from '../packages/deep-house/src/stereo-plan.ts';

const [site, port, out, jobsFile] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

const PLAN = (job) => {
  const dh = window.deepHouse;
  window.__seatSketch = job.seat || 0;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  const program = dh.programOf(t);
  const settings = dh.settingsOf(t);
  return {
    bpm: program.bpm, barSeconds: program.barSeconds, bars: t.bars,
    sections: t.arrangement.sections.map((s) => ({ kind: s.kind, startBar: s.startBar, bars: s.bars })),
    kick: program.events.some((e) => e.layer === 'kick'),
    space: { widthBase: settings.space.widthBase, widthDepth: settings.space.widthDepth, widthRateHz: settings.space.widthRateHz, returnSide: settings.space.returnSide },
    labels: t.events.filter((e) => e.part === 'study-soloist').map((e) => `${e.bar}:${String(e.label).split(' ')[0]}${e.p.panPath ? (e.p.panPath < 0 ? 'L' : 'R') : ''}`).join(' '),
    parts: Object.entries(program.events.filter((e) => e.part).reduce((o, e) => { const k = `${e.part}|${e.voice}`; (o[k] ||= []).push(`${e.bar}${e.label ? ':' + String(e.label).split(' ')[0] : ''}`); return o; }, {})).map(([k, v]) => `${k}: ${v.slice(0, 40).join(' ')}`),
    keys: program.events.filter((e) => e.role === 'sparse-keys').map((e) => [e.bar, e.step, e.voice, e.p.panPath ?? 0]),
    widthLines: program.automation.filter((l) => l.param === 'width.gain' || l.param === 'widthForm.gain' || l.param === 'widthDepth.gain'),
  };
};

const RENDER = async (job) => {
  const dh = window.deepHouse;
  window.__seatSketch = job.seat || 0;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  const compiled = dh.programOf(t);
  let program = job.lines ? { ...compiled, automation: [...compiled.automation.filter((l) => l.param !== 'width.gain' && l.param !== 'widthForm.gain' && l.param !== 'widthDepth.gain' && l.param !== 'returnForm.offset'), ...job.lines] } : compiled;
  // a sketch's settings over the compiled ones (round kit-tight): `{ space: { kitAir: 0.4 } }`
  if (job.settings) { const m = (x, y) => { const o = { ...x }; for (const k of Object.keys(y)) o[k] = y[k] && typeof y[k] === 'object' && !Array.isArray(y[k]) ? m(x?.[k] ?? {}, y[k]) : y[k]; return o; }; program = { ...program, settings: m(program.settings, job.settings) }; }
  // a stem (round kit-tight): only these layers, or all but these (`only`, `drop`)
  if (job.only || job.drop) program = { ...program, events: program.events.filter((e) => job.only ? job.only.includes(e.layer) : !job.drop.includes(e.layer)) };
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

const merge = (a, b) => {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const o = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const k of Object.keys(b)) o[k] = merge(o[k], b[k]);
  return o;
};

const server = await serveSite(port, site) as { close: () => void };
const b = await openPage(port);
try {
  for (const job of jobs) {
    const file = `${out}/${job.name}.wav`;
    if (fs.existsSync(file) && !job.again) { console.log(job.name, 'kept'); continue; }
    const read = linkRead(`?${job.link}`);
    const L = read.link, seed = L.seed ?? '1';
    const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
    const base = { seed, theme: L.theme, seat: job.seat, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } };
    const facts = await b.page.evaluate(PLAN, base);
    if (job.factsOnly) { console.log(JSON.stringify({ name: job.name, tide: cast.spell?.tide, bpm: facts.bpm, bars: facts.bars, kick: facts.kick, space: facts.space, sections: facts.sections.map((s) => `${s.kind}@${s.startBar}+${s.bars}`).join(' '), widthLines: facts.widthLines.length, labels: facts.labels, keys: facts.keys.map((k) => `${k[0]}.${k[1]}${k[3] ? (k[3] < 0 ? "L" : "R") : ""}`).join(" ") })); continue; }
    let lines = null;
    if (job.plan === 'off') lines = [];
    else if (job.plan && typeof job.plan === 'object') {
      const row = merge(STEREO_PLAN_ROW, job.plan);
      const p = stereoPlanOf({ sections: facts.sections, barSeconds: facts.barSeconds, tide: cast.spell?.tide ?? 0.558, kick: facts.kick }, row);
      lines = p ? stereoLines(p, facts.space.widthDepth) : [];
      // the return width joined to the form, as performance.ts writes it
      const rs = facts.space.returnSide;
      if (p && p.width.length > 1 && rs !== undefined && rs !== 1) lines.push({ param: 'returnForm.offset', curve: 'linear', points: returnFormPoints(p).map((q) => ({ t: q.t, value: +(q.value * rs).toFixed(5) })) });
    }
    const from = job.fromBar ?? 0, to = Math.min(job.toBar ?? facts.bars, facts.bars);
    const r = await b.page.evaluate(RENDER, { ...base, lines, settings: job.settings, only: job.only, drop: job.drop, fromBar: from, toBar: to, rate: job.rate });
    fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), job.rate ?? 48000));
    fs.writeFileSync(`${out}/${job.name}.json`, JSON.stringify({ ...facts, name: job.name, link: job.link, tide: cast.spell?.tide, fromBar: from, toBar: to, plan: job.plan ?? null, lines }));
    console.log(job.name, `${from}-${to}`, lines ? `${lines.length} lines` : 'as planned');
  }
} finally { await b.close(); server.close(); }
