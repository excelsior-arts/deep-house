// dark-fronts (11-03): what each new front voice costs to play, against the piano and the marimba. In a headless,
// silent page (an OfflineAudioContext, nothing reaches an output), each voice plays the same notes through the engine's
// own voice function in his link's room: 32 notes, four a second, each a stab's length (a bell or a piano held a beat),
// into a context with a dry, a delay and a reverb input. Timed: building the notes' graphs on the page's thread (what a
// live deck does as it schedules them) and rendering them; counted: the nodes they made. The second of three runs is
// kept (the first warms a cached string or strike, reported apart). Medians of five.
//
//   node tools/dark-fronts-cost.ts <site> <port> <link>

import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';

const [site, port, link] = [process.argv[2], +process.argv[3], process.argv[4]];
const VOICES = [
  { voice: 'marimba', p: { preset: 'marimba', dur: 0.12 } },
  { voice: 'piano', p: { dur: 0.4 } },
  { voice: 'neuroStab', p: { dur: 0.2 } },
  { voice: 'formantCall', p: { dur: 0.4 } },
  { voice: 'crushPluck', p: { dur: 0.3 } },
  { voice: 'bellDark', p: { dur: 0.8 } },
  { voice: 'sawStabDark', p: { dur: 0.2 } },
  // the eighth pass: the marimba ground, as the rule plays it (his link's colour, a grind walked across the note, the lid)
  { voice: 'marimbaGrit', label: 'marimbaGrit (the row alone)', p: { dur: 0.12 } },
  { voice: 'marimbaGrit', label: 'marimbaGrit (coloured)', p: { dur: 0.12, colour: { bits: 5, holdHz: 5121, drive: 0.7, smear: 0.6 }, grind: [0.67, 0.7], lid: { hz: 1917 } } },
  { voice: 'crushPluck', label: 'crushPluck (coloured)', p: { dur: 0.3, colour: { bits: 5, holdHz: 5121, drive: 0.7, smear: 0.6 }, grind: [0.67, 0.7], lid: { hz: 1917 } } },
];

const RUN = async ({ job, voice, p, notes }) => {
  const dh = window.deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  const settings = dh.settingsOf(t);
  const fn = dh.voices[voice];
  const once = async () => {
    const sr = 48000, secs = notes / 4 + 2;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    let made = 0;
    for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
      if (!k.startsWith('create')) continue;
      const orig = ctx[k].bind(ctx);
      ctx[k] = (...a) => { made++; return orig(...a); };
    }
    const bus = (n) => { const g = ctx.createGain(); g.connect(ctx.destination); return g; };
    const out = { dry: bus(), delay: bus(), reverb: bus() };
    made = 0;
    const t0 = performance.now();
    for (let i = 0; i < notes; i++) fn(ctx, out, 0.1 + i * 0.25, { midi: 58 + [0, 3, 7, 10][i % 4], vel: 0.8, gain: 0.35, ...p }, settings);
    const build = performance.now() - t0;
    const t1 = performance.now();
    await ctx.startRendering();
    return { build, render: performance.now() - t1, nodes: made, secs };
  };
  const runs = [];
  for (let r = 0; r < 3; r++) runs.push(await once());
  return runs;
};

const server = await serveSite(port, site) as { close: () => void };
const b = await openPage(port);
const med = (xs: number[]) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
try {
  const read = linkRead(`?${link}`);
  const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  const job = { seed, theme: L.theme, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track } };
  // the empty context's own render, taken off each voice's
  const rows = [];
  for (const v of [{ voice: 'none' }, ...VOICES]) {
    const got = { build: [], render: [], first: [], nodes: 0, secs: 0 };
    for (let k = 0; k < 5; k++) {
      const runs = v.voice === 'none'
        ? await b.page.evaluate(async () => { const r = []; for (let i = 0; i < 3; i++) { const ctx = new OfflineAudioContext(2, 48000 * 10, 48000); const g = ctx.createGain(); g.connect(ctx.destination); const t1 = performance.now(); await ctx.startRendering(); r.push({ build: 0, render: performance.now() - t1, nodes: 0, secs: 10 }); } return r; })
        : await b.page.evaluate(RUN, { job, voice: v.voice, p: v.p, notes: 32 });
      got.first.push(runs[0].build); got.build.push(runs[1].build); got.render.push(runs[1].render); got.nodes = runs[1].nodes; got.secs = runs[1].secs;
    }
    rows.push({ voice: (v as { label?: string }).label ?? v.voice, build: med(got.build), first: med(got.first), render: med(got.render), nodes: got.nodes, secs: got.secs });
  }
  const empty = rows[0].render;
  console.log('voice | nodes a note | build a note (ms) | first run a note (ms) | render of 32 notes over 10 s, less the empty context (ms) | x real time');
  for (const r of rows.slice(1)) console.log(`${r.voice} | ${(r.nodes / 32).toFixed(1)} | ${(r.build / 32).toFixed(3)} | ${(r.first / 32).toFixed(3)} | ${Math.round(r.render - empty)} | ${((r.secs * 1000) / Math.max(1, r.render - empty)).toFixed(0)}`);
} finally { await b.close(); server.close(); }
