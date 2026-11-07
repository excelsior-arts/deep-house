// **The voices' tops, measured** (round hat-floor, 11-03): a lab tool. Every voice that can play in a groove (the kit's
// pieces, the snares and claps, the basses, the keys and leads, the pads, the top's quiet voices, the effects), each
// alone, rendered note by note across its register (the pitches it plays at in the sample, `tools/hat-floor-gather.ts`)
// and a few lengths and velocities, under the rooms of seven spells: the house's own and Spark, Gleam and Zephyr each at
// nought and at one (the birds that move a voice's top: Spark's edge and noise, Gleam's brightness, Zephyr's air). Each
// note is read K-weighted and above 3 kHz (and above 6 kHz), as energy, at unit gain, the room's table level and the
// theme's trim taken off: the units the plan's read of the highs adds up (`src/tops-read.ts`). Rendered in headless
// Chromium, muted, one page at a time.
//
//   node tools/hat-floor-gather.ts --featured --grid 1-2 --house 1-30 --out <gather.json>
//   node tools/hat-floor-table.ts --site <built site> --port 7431 --gather <gather.json> --out <rows.jsonl> [--only voice,...]
//   node tools/hat-floor-table.ts --fit <rows.jsonl> --write      (the table: packages/engine/src/voices/tops.json)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';
import { BY_NAME, VOICE_LEVEL } from '@deep-house/engine/voices';
import { settingsOf } from '@deep-house/engine/settings';
import { planOf, coordinateOf } from './like/features.ts';
import { laneLevelDb } from '../src/lane-level.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

/** The rooms the voices are probed in: the house's own spell, and Spark, Gleam and Zephyr each at its ends. */
export const POINTS: Array<{ id: string; spell: string | null }> = [
  { id: 'house', spell: null },
  { id: 'sp0', spell: 'sp:0.00' }, { id: 'sp1', spell: 'sp:1.00' },
  { id: 'gl0', spell: 'gl:0.00' }, { id: 'gl1', spell: 'gl:1.00' },
  { id: 'ze0', spell: 'ze:0.00' }, { id: 'ze1', spell: 'ze:1.00' },
];
const BASE_SEED = '1';
export const linkOfPoint = (p: { spell: string | null }) => `seed=${BASE_SEED}&v=2${p.spell ? `&spell=${p.spell}` : ''}`;

type Probe = { midi: number | null; dur: number | null; vel: number; tag: string; knobs?: Record<string, number> };
type Key = { key: string; voice: string; layer: string; kit: boolean; p: Record<string, unknown>; probes: Probe[] };

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** The notes a voice is probed with: its register (the sample's low, middle and high, and an octave either side of the middle where the register reaches), a short and a long note, a soft and a hard one. */
export function probesOf(g: { midi: number[] | null; dur: number[] | null; vel: number[] } | null, tonal: boolean): Probe[] {
  const vel = clamp(g?.vel?.[1] ?? 0.8, 0.2, 1);
  const out: Probe[] = [];
  if (!tonal) {
    for (const v of [0.35, 0.7, 1]) out.push({ midi: null, dur: g?.dur ? clamp(g.dur[1], 0.05, 4) : null, vel: v, tag: `vel ${v}` });
    return out;
  }
  const [lo, mid, hi] = g?.midi ?? [36, 60, 84];
  const dur = clamp(g?.dur?.[1] ?? 0.5, 0.08, 4);
  const pitches = new Set<number>([lo, mid, hi]);
  for (const d of [-24, -12, 12, 24]) if (mid + d >= lo - 6 && mid + d <= hi + 6) pitches.add(mid + d);
  for (const m of [...pitches].sort((a, b) => a - b)) out.push({ midi: m, dur, vel, tag: 'register' });
  const dShort = clamp(g?.dur?.[0] ?? dur / 3, 0.06, 4), dLong = clamp(Math.max(g?.dur?.[2] ?? dur * 3, dur * 2), 0.2, 4);
  out.push({ midi: mid, dur: dShort, vel, tag: 'short' }, { midi: mid, dur: dLong, vel, tag: 'long' });
  out.push({ midi: mid, dur, vel: clamp(vel * 0.5, 0.1, 1), tag: 'soft' }, { midi: mid, dur, vel: 1, tag: 'hard' });
  return out;
}

/** Every voice to table: what the sample plays in its grooves, and every other voice of the registry at its defaults. */
export function keysOf(gather: Record<string, any>): Key[] {
  const out: Key[] = [];
  const seen = new Set<string>();
  const tonalOf = (v: string, g: any) => !!g?.midi || !['drums', 'kick'].includes(String(BY_NAME[v]?.bus)) && BY_NAME[v]?.family !== 'effect';
  for (const [key, g] of Object.entries(gather)) {
    seen.add(g.voice);
    const tonal = !!g.midi;
    // the note's own voice and room, never its moment: no length, velocity or gain, no swell, gain path, bend or pan path
    const p = { ...(g.p ?? {}) };
    for (const x of ['midi', 'notes', 'dur', 'vel', 'gain', 'swell', 'gainPath', 'bend', 'bendSeconds', 'panPath', 'pumpBeat', 'pumpDb', 'knobs']) delete p[x];
    out.push({ key, voice: g.voice, layer: g.layer, kit: !!g.kit, p, probes: probesOf(g, tonal) });
  }
  for (const [v, d] of Object.entries(BY_NAME) as Array<[string, any]>) {
    if (seen.has(v)) continue;
    const layer = String(d.layer ?? 'keys');
    const tonal = tonalOf(v, null);
    out.push({ key: v, voice: v, layer, kit: /^hat/.test(v) || v === 'ride', p: {}, probes: probesOf(null, tonal) });
  }
  return out;
}

/** Runs in the page: one room's base theme, every key's probes laid at its longest main, each key rendered alone. */
const RENDER = async (job: { search: string; keys: Key[] }) => {
  const D = (window as any).deepHouse;
  const q = new URLSearchParams(job.search.slice(1));
  const seed = q.get('seed')!;
  const cast = D.recipesFor({ masterSeed: seed, strategy: 'house-v2', search: job.search });
  const base = D.planTheme(seed, 0, { strategy: 'house-v2', search: job.search, spell: cast.spell, recipe: cast.track });
  const sr = 48000, bs = base.barSeconds;
  const main = base.arrangement.sections.filter((s: any) => s.kind === 'main').sort((a: any, b: any) => b.bars - a.bars)[0] ?? base.arrangement.sections[0];
  const T0 = main.startBar * bs;
  const K = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]];
  const hp = (hz: number) => { const w0 = 2 * Math.PI * hz / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0), a0 = 1 + al; return [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0, (-2 * cw) / a0, (1 - al) / a0]; };
  const HP3 = hp(3000), HP6 = hp(6000);
  const biquad = (x: Float32Array, c: number[]) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const filters: Array<[string, (x: Float32Array) => Float32Array]> = [['k', (x) => biquad(biquad(x, K[0]), K[1])], ['hi', (x) => biquad(biquad(x, HP3), HP3)], ['hi6', (x) => biquad(biquad(x, HP6), HP6)]];
  const out: any[] = [];
  for (const k of job.keys) {
    // each probe a render of its own, at the start of the longest main (the room's lines as a main plays them), long
    // enough for the note, its release and a room's tail
    const probes: any[] = [];
    let error: string | null = null, compiled: number | null = null;
    for (const pr of k.probes) {
      const len = Math.min(9, Math.max(2.5, (pr.dur ?? 0.3) + 3));
      const p0: Record<string, unknown> = { ...k.p, vel: pr.vel, gain: 1 };
      if (pr.midi != null) p0.midi = pr.midi;
      if (pr.dur != null) p0.dur = pr.dur;
      const track = { ...base, events: [{ t: T0 + 0.05, voice: k.voice, layer: k.layer, p: p0, bar: main.startBar, step: 0 }], automation: { ...base.automation, floors: [] }, trimDb: 0, ...(pr.knobs ? { knobs: { ...(base.knobs ?? {}), [k.voice]: pr.knobs } } : {}) };
      let program: any;
      try { program = D.programOf(track); } catch (e) { error = `compile: ${String((e as Error).message || e).slice(0, 200)}`; break; }
      let p = D.sliceProgram(program, { from: T0, to: Math.min(program.duration, T0 + len), tail: 0.01 });
      p = { ...p, trimDb: 0, duck: [] };
      if (!p.events.length) { error = 'no events after compile'; break; }
      compiled = Number(p.events[0].p?.gain ?? 1);
      let buf: AudioBuffer;
      try { buf = await D.renderProgram(p, { sampleRate: sr }); } catch (e) { error = `render: ${String((e as Error).message || e).slice(0, 200)}`; break; }
      const chs = [buf.getChannelData(0), buf.getChannelData(1)];
      const read: Record<string, number> = {};
      for (const [name, f] of filters) {
        let e = 0; for (const c of chs) { const y = f(c); for (let i = 0; i < y.length; i++) e += y[i] * y[i]; }
        read[name] = e > 0 ? +(10 * Math.log10(e / sr)).toFixed(2) : -150;
      }
      probes.push({ ...pr, ...read });
    }
    if (error) { out.push({ key: k.key, voice: k.voice, error }); continue; }
    // the gain the compiler set the probe's note to, against the plan's unit gain (the room's lane level)
    out.push({ key: k.key, voice: k.voice, layer: k.layer, kit: k.kit, compiledGain: compiled, probes });
  }
  return { bpm: base.bpm, mainBar: main.startBar, rows: out };
};

/** The table out of the probes: per voice, its register at the house's room, its length and velocity steps, and the birds' moves (each against the house's, at nought and at one). Energies with the compiler's gain taken off (the room's lane level). */
const EDGE = { house: 0.25, sp1: 0.625 };
export function fitTable(rows: any[], knobbed: Record<string, Record<string, Record<string, number>>> = {}) {
  const by = new Map<string, Map<string, any>>();
  const knobRows = new Map<string, any>();
  for (const r of rows) {
    if (r.error || !r.probes) continue;
    if (r.key.endsWith('#knobs')) { if (r.point === 'house') knobRows.set(r.key.replace(/#knobs$/, ''), r); continue; }
    (by.get(r.key) ?? by.set(r.key, new Map()).get(r.key)!).set(r.point, r);
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const net = (r: any) => r.probes.map((p: any) => { const g = 20 * Math.log10(Math.max(1e-9, r.compiledGain)); return { ...p, k: p.k - g, hi: p.hi - g, hi6: p.hi6 - g }; });
  const voices: Record<string, any> = {};
  const skipped: string[] = [];
  for (const [key, pts] of by) {
    const H = pts.get('house');
    if (!H) { skipped.push(key); continue; }
    const P = net(H);
    if (P.every((p: any) => p.k < -140)) { skipped.push(key); continue; }
    const reg = P.filter((p: any) => p.tag === 'register' || p.tag.startsWith('vel'));
    const tonal = P.some((p: any) => p.tag === 'register');
    const ref = tonal ? P.find((p: any) => p.tag === 'short') : P.find((p: any) => p.tag === 'vel 0.7');
    const refMidi = tonal ? ref.midi : null, refVel = tonal ? reg[0].vel : 0.7;
    const at = (f: (p: any) => boolean) => P.find(f);
    const mid = tonal ? at((p: any) => p.tag === 'register' && p.midi === refMidi) : at((p: any) => p.tag === 'vel 0.7');
    const refDur = mid?.dur ?? null;
    const e: any = { ref: { midi: refMidi, dur: refDur == null ? null : r2(refDur), vel: r2(refVel) } };
    e.reg = tonal ? reg.map((p: any) => [p.midi, r2(p.k), r2(p.hi)]) : [[null, r2(mid.k), r2(mid.hi)]];
    // how much of the top lies over 6 kHz (power share, over the register), for what a low-pass over the band takes
    { const xs = reg.filter((p: any) => p.hi > -140).map((p: any) => Math.pow(10, (p.hi6 - p.hi) / 10)); if (xs.length) e.over6 = r2(xs.reduce((a: number, x: number) => a + x, 0) / xs.length); }
    if (tonal) {
      const sh = at((p: any) => p.tag === 'short'), lo = at((p: any) => p.tag === 'long');
      const d = [[sh.dur, sh.k - mid.k, sh.hi - mid.hi], [mid.dur, 0, 0], [lo.dur, lo.k - mid.k, lo.hi - mid.hi]].sort((a, b) => a[0] - b[0]);
      e.dur = d.filter((x, i) => i === 0 || x[0] > d[i - 1][0] + 1e-6).map((x) => [r2(x[0]), r2(x[1]), r2(x[2])]);
      const so = at((p: any) => p.tag === 'soft'), ha = at((p: any) => p.tag === 'hard');
      const v = [[so.vel, so.k - mid.k, so.hi - mid.hi], [mid.vel, 0, 0], [ha.vel, ha.k - mid.k, ha.hi - mid.hi]].sort((a, b) => a[0] - b[0]);
      e.vel = v.filter((x, i) => i === 0 || x[0] > v[i - 1][0] + 1e-6).map((x) => [r2(x[0]), r2(x[1]), r2(x[2])]);
    } else {
      e.vel = P.filter((p: any) => p.tag.startsWith('vel')).map((p: any) => [r2(p.vel), r2(p.k - mid.k), r2(p.hi - mid.hi)]);
    }
    const birds: Record<string, any> = {};
    for (const [bird, b] of [['spark', 'sp'], ['gleam', 'gl'], ['zephyr', 'ze']] as const) {
      const ends = [0, 1].map((x) => {
        const R = pts.get(`${b}${x}`);
        if (!R) return [0, 0];
        // a room whose own theme seasons this voice (a knob): the knob's step (its own probes) is taken off the room's
        const kn = knobbed[`${b}${x}`]?.[H.voice];
        let ok = 0, oh = 0;
        if (kn) {
          const KR0 = knobRows.get(key), specs = (BY_NAME as any)[H.voice]?.knobs ?? {};
          const d0 = KR0?.probes.find((p: any) => p.tag === 'knob default');
          for (const [n, v] of Object.entries(kn) as Array<[string, number]>) {
            const ends = KR0?.probes.filter((p: any) => p.tag === `knob ${n}`) ?? [];
            const spec = specs[n];
            if (!d0 || ends.length < 2 || !spec) continue;
            const rows = [[spec.min, ends[0].k - d0.k, ends[0].hi - d0.hi], [spec.default, 0, 0], [spec.max, ends[1].k - d0.k, ends[1].hi - d0.hi]].sort((a, b) => a[0] - b[0]);
            const at = (j: number) => { if (v <= rows[0][0]) return rows[0][j]; for (let i = 1; i < rows.length; i++) if (v <= rows[i][0]) { const u = (v - rows[i - 1][0]) / Math.max(1e-9, rows[i][0] - rows[i - 1][0]); return rows[i - 1][j] + u * (rows[i][j] - rows[i - 1][j]); } return rows[rows.length - 1][j]; };
            ok += at(1); oh += at(2);
          }
        }
        const Q = net(R);
        const n = Math.min(Q.length, P.length);
        let dk = 0, dh = 0, c = 0;
        for (let i = 0; i < n; i++) { if (P[i].k < -140 || Q[i].k < -140) continue; dk += Q[i].k - P[i].k; dh += Q[i].hi - P[i].hi; c++; }
        return c ? [r2(dk / c - ok), r2(dh / c - oh)] : [0, 0];
      });
      if (ends.some((x) => x[0] || x[1])) birds[bird] = ends;
    }
    // the harmonic bus's edge (Spark's, round HF-NOISE): on the melodic and keys buses Spark's move is the edge's blend,
    // read by the note's own blend (`edge`: nought where the room has none or names the note clean, the house's 0.25,
    // the bright room's 0.625), never the bird's number
    if (birds.spark && ['melodic', 'keys'].includes(String((BY_NAME as any)[H.voice]?.bus))) {
      e.edge = [[0, birds.spark[0][0], birds.spark[0][1]], [EDGE.house, 0, 0], [EDGE.sp1, birds.spark[1][0], birds.spark[1][1]]];
      delete birds.spark;
    }
    if (Object.keys(birds).length) e.birds = birds;
    const KR = knobRows.get(key);
    if (KR) {
      const g = 20 * Math.log10(Math.max(1e-9, KR.compiledGain));
      const d0 = KR.probes.find((p: any) => p.tag === 'knob default');
      const specs = (BY_NAME as any)[H.voice]?.knobs ?? {};
      const knobs: Record<string, number[][]> = {};
      for (const [n, spec] of Object.entries(specs) as Array<[string, any]>) {
        const ends = KR.probes.filter((p: any) => p.tag === `knob ${n}`);
        if (!d0 || ends.length < 2 || d0.k < -140) continue;
        const pts2 = [[spec.min, ends[0].k - d0.k, ends[0].hi - d0.hi], [spec.default, 0, 0], [spec.max, ends[1].k - d0.k, ends[1].hi - d0.hi]].sort((a, b) => a[0] - b[0]);
        if (pts2.every((x) => Math.abs(x[1]) < 0.1 && Math.abs(x[2]) < 0.1)) continue;
        knobs[n] = pts2.map((x) => [+Number(x[0]).toPrecision(4), r2(x[1]), r2(x[2])]);
      }
      void g;
      if (Object.keys(knobs).length) e.knobs = knobs;
    }
    e.layer = H.layer;
    voices[key] = e;
  }
  return { voices, skipped };
}

async function render() {
  const site = path.resolve(arg('site')!), port = +arg('port', '7431')!;
  const gather = JSON.parse(fs.readFileSync(arg('gather')!, 'utf8')).keys;
  let keys = keysOf(gather);
  if (arg('only')) { const o = arg('only')!.split(','); keys = keys.filter((k) => o.includes(k.key) || o.includes(k.voice)); }
  const outFile = path.resolve(arg('out')!);
  const done = new Set<string>();
  if (fs.existsSync(outFile)) for (const l of fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); done.add(`${r.point}|${r.key}`); }
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${port}`).pathname);
    const file = path.join(site, name === '/' ? '/index.html' : name);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : /\.(m?js|ts)$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' });
    res.end(bodyOf(file));
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
  const { pw } = await playwright();
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu', '--mute-audio'] });
  renice(browser);
  // (--knobs) the theme's seasoning a voice's row declares (its brightness, its grain, its hold...), each at its two ends,
  // at the middle of the register, in the house's room
  if (process.argv.includes('--knobs')) {
    const gathered = new Set(Object.keys(gather));
    keys = keys.filter((k) => gathered.has(k.key) && Object.keys((BY_NAME as any)[k.voice]?.knobs ?? {}).length).map((k) => {
      const ref = k.probes.find((p) => p.tag === 'short' || p.tag === 'vel 0.7') ?? k.probes[0];
      const mid = k.probes.find((p) => p.tag === 'register' && p.midi === (gather[k.key]?.midi?.[1] ?? null)) ?? ref;
      const probes: Probe[] = [{ ...mid, tag: 'knob default' }];
      for (const [n, spec] of Object.entries((BY_NAME as any)[k.voice].knobs) as Array<[string, any]>) for (const v of [spec.min, spec.max]) probes.push({ ...mid, tag: `knob ${n}`, knobs: { [n]: v } });
      return { ...k, key: `${k.key}#knobs`, probes };
    });
  }
  const points = arg('points') ? POINTS.filter((p) => arg('points')!.split(',').includes(p.id)) : POINTS;
  for (const pt of points) {
    // the room's levels as the base theme plays them, for each voice's table level (taken off, as the hat read does)
    const { track } = planOf(coordinateOf(linkOfPoint(pt))) as any;
    const set = settingsOf(track) as any;
    // (the birds' rooms) the register alone: a bird's move is read as the mean over the probes, which the register carries
    const gathered = new Set(Object.keys(gather));
    const todo = keys.filter((k) => !done.has(`${pt.id}|${k.key}`) && (pt.id === 'house' || gathered.has(k.key.replace(/#knobs$/, ''))))
      .map((k) => (pt.id === 'house' ? k : { ...k, probes: k.probes.filter((p) => p.tag === 'register' || p.tag.startsWith('vel')) }));
    for (let i = 0; i < todo.length; i += 6) {
      const batch = todo.slice(i, i + 6);
      const page = await browser.newPage();
      try {
        await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
        await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
        renice(browser);
        const r = await page.evaluate(RENDER, { search: `?${linkOfPoint(pt)}`, keys: batch });
        for (const row of r.rows) {
          const lk = VOICE_LEVEL[row.voice ?? ''];
          const tableDb = row.voice ? laneLevelDb(track.style, set.levels, row.voice, lk) ?? -12 : null;
          fs.appendFileSync(outFile, JSON.stringify({ point: pt.id, bpm: r.bpm, tableDb, ...row }) + '\n');
          if (row.error) console.log(`${pt.id} ${row.key}: ${row.error}`);
        }
        console.log(`${pt.id}: ${Math.min(todo.length, i + 6)} of ${todo.length}`);
      } catch (e) { console.log(`${pt.id} batch ${i}: FAILED ${String((e as Error).message || e).slice(0, 300)}`); }
      await page.close();
    }
  }
  await browser.close();
  server.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (arg('site')) await render();
  if (arg('fit')) {
    const rows = fs.readFileSync(arg('fit')!, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const knobbed: Record<string, Record<string, Record<string, number>>> = {};
    for (const pt of POINTS) {
      const { track } = planOf(coordinateOf(linkOfPoint(pt))) as any;
      knobbed[pt.id] = track.knobs ?? {};
      const b = Number((settingsOf(track) as any).harmonicEdge?.blend ?? 0);
      if (pt.id === 'house' && Math.abs(b - EDGE.house) > 1e-6) throw new Error(`the house room's edge is ${b}, the table reads ${EDGE.house}`);
      if (pt.id === 'sp1' && Math.abs(b - EDGE.sp1) > 1e-6) throw new Error(`the bright room's edge is ${b}, the table reads ${EDGE.sp1}`);
      if (pt.id === 'sp0' && b !== 0) throw new Error(`the dark room's edge is ${b}, the table reads nought`);
    }
    const { voices, skipped } = fitTable(rows, knobbed);
    const doc = {
      schema: 1, kind: 'voiceTops',
      note: "MEASURED (round hat-floor, 11-03). What every voice that can play in a groove puts above 3 kHz against its broadband level, each alone, note by note: the energy of one note (dB, full scale squared seconds) K-weighted (`k`) and above 3 kHz (`hi`, two 2nd-order high-passes), at unit gain, with the room's lane level the compiler sets it to taken off and no trim. `reg` is the voice across its register (midi, k, hi) at `ref`'s length and velocity in the house's own room; `over6` the share of the top's power over 6 kHz; `dur` and `vel` the steps a note's length and velocity take (k and hi, against `ref`); `knobs` the steps the theme's seasoning of the voice takes (the knob's value, k, hi: its ends and its default, at the middle of the register); `edge` the move the harmonic bus's edge makes on a note of the melodic and keys buses by its blend (blend, k, hi: none, the house's 0.25, Spark's bright room's 0.625); `birds` the move Spark (elsewhere), Gleam and Zephyr each make at nought and at one against the house's room (k and hi, the mean over the probes, a knob's own step taken off). A key is a voice, or a voice and the timbre or preset its note names. The plan's read of the highs (`packages/deep-house/src/tops-read.ts`) adds these up. Rebuilt by `node packages/deep-house/tools/hat-floor-table.ts` (see its head).",
      measured: { date: new Date().toISOString().slice(0, 10), rate: 48000, room: `the longest main of ${linkOfPoint(POINTS[0])}, its floors off, no duck`, points: POINTS.map((p) => `${p.id}: ${linkOfPoint(p)}`), house: { spark: 0.275, gleam: 0.359, zephyr: 0.377 } },
      voices,
    };
    console.log(`${Object.keys(voices).length} voices tabled; skipped (silent or unrendered): ${skipped.join(', ') || 'none'}`);
    if (process.argv.includes('--write')) {
      const file = path.join(HERE, '..', '..', 'engine', 'src', 'voices', 'tops.json');
      fs.writeFileSync(file, JSON.stringify(doc, null, 0).replace(/\],"/g, '],\n"').replace(/\},"/g, '},\n"') + '\n');
      console.log(`wrote ${file}`);
    } else console.log(JSON.stringify(doc).slice(0, 2000));
  }
}
