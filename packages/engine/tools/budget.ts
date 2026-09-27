// What a strategy is about to ask a phone for, added up before it asks.
//
//   node tools/budget.ts                       measure everything, print the table
//   node tools/budget.ts --bless               write the measured class into each
//                                               voice's own descriptor
//   node tools/budget.ts --chain reverb,eq --voices kick,sub,keys,pad
//                                               one strategy's chain and cast,
//                                               against the ceiling
//   node tools/budget.ts --lanes 'kick/hatClosed,hatTight/clap,snare'
//                                               the same, as **lanes**: one
//                                               group per lane, and a lane is
//                                               priced at its dearest candidate
//   node tools/budget.ts --returns hall,immersed  and the lazy returns a
//                                               strategy's parts send to
//   node tools/budget.ts --only returns --bless-returns
//                                               measure the three returns and
//                                               write their classes into
//                                               master.ts's RETURN_COST
//   node tools/budget.ts --phone 8 --headroom 4  the two stated assumptions
//
// Round K4 of PLAN-KITCHEN, which asks for it by name: *`costOf` for effects
// exists; add the same for voices (nodes per note, prepare bytes, render-time
// ratio) into the descriptors as measured classes, and a `budget.ts` that sums
// a chain plus a set of voices against a stated ceiling.*
//
// ## What the unit is
//
// **One cheap effect**, which is a real thing and not a token: the overdrive —
// `effects/contract.ts`'s `COST_REFERENCE`, four nodes of the plainest kind —
// rendering one minute of audio. Everything in this file is divided by that, so
// a chain and a cast add up in the same currency, and the currency is time on
// the audio thread, which is the thing actually being rationed.
//
// A voice's reading is **a minute of it playing its own figure**, not a minute
// of one note: an instrument that plays sixteen notes a bar and one that plays
// three are not the same load and a per-note number would say they were. The
// figure is the fixture's own (`tools/audition-voices.ts` and its K4 twin), so
// what is measured is the instrument in the role it is for.
//
// ## What the ceiling is, and what in it is measured and what is assumed
//
// Three numbers, and the round is explicit about which is which:
//
//   MEASURED   how many units this machine can run in real time. A minute of
//              audio has to render in under sixty seconds to play at all, so
//              the machine's own ceiling is `60000 / R` units, where R is the
//              reference effect's milliseconds a minute.
//   ASSUMED    the phone factor. There is no phone here to measure, so it is a
//              stated divisor and not a reading, and it is a parameter for that
//              reason.
//   STATED     the headroom. Audio that renders in exactly real time does not
//              play: the thread has to finish every block long before the block
//              is due, and everything else on the page has to run too.
//
// So `ceiling = 60000 / R / phone / headroom` — and **the two assumptions are
// anchored on something that is known to work**, which is the only honest way
// to choose them. The tool prices v1's own cast every run: the nine voices the
// record is actually made of come to 215 units, and this machine runs 1357 in
// real time, so **v1 uses about a sixth of the real-time budget here**. A phone
// four times slower than this Mac is then at two thirds of real time with the
// record it already plays, which is where the defaults come from: `--phone 4`
// and `--headroom 1.5` put the ceiling a little over v1 and leave a strategy
// that doubles the cast outside it. Both are parameters because the day
// somebody profiles a real phone, the first of them stops being an assumption.
//
// The tool prints all four numbers and v1's own total rather than the answer
// alone, because a ceiling whose assumptions are not on the page is a number
// nobody can argue with.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from './harness.ts';
import * as FX from '../src/effects/index.ts';
import { REGISTRY, VOICE_COST_BANDS, VOICE_COST_UNITS, LAZY_RETURNS } from '../src/voices/index.ts';
import { RETURN_COST } from '../src/master.ts';
import { SCENES } from './audition-voices.ts';
import { SCENES_2 } from './audition-voices-2.ts';
import { DRUM_SCENES } from './audition-drums.ts';
import type { PlaywrightThing } from './harness.ts';
import type { VoiceCost } from '../src/voices/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };
// Beside the other gates', and never 6975, which is Eugene's.
const PORT = Number(process.env.ENGINE_BUDGET_PORT) || 7050;

// A `--name value` off the command line, or the default when it is not there.
// The default is a number for the three numeric switches and nothing for the
// rest, which is why both are in the type.
const arg = (k: string, d: string | number | null = null): string | number | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BLESS = process.argv.includes('--bless');
const BLESS_RETURNS = process.argv.includes('--bless-returns');
const VERBOSE = process.argv.includes('--verbose');
// The three that are asked for with a number of their own are never nothing.
const RATE = +arg('rate', 44100)!;
const PHONE = +arg('phone', 4)!;
const HEADROOM = +arg('headroom', 1.5)!;
const CHAIN = ((arg('chain') as string | null) || '').split(',').filter(Boolean);
const CAST = ((arg('voices') as string | null) || '').split(',').filter(Boolean);
const RETURNS = ((arg('returns') as string | null) || '').split(',').filter(Boolean);
/**
 * A strategy's cast as **lanes** rather than as a list.
 *
 * `--voices` is the right question for a fixed cast and the wrong one for a
 * strategy whose lists have alternatives in them: a lane plays **one** of its
 * candidates at a time, so a cast of one lane with eight voices in it is one
 * voice and not eight, and what a phone has to survive is the dearest of them.
 * Round K5a of PLAN-KITCHEN needs exactly that — house-v2's backbeat lane is a
 * clap, a snare and a rim — and it is the only honest way to price a widened
 * catalogue: priced as a flat list, a kitchen wired at weight nought would read
 * as five times the record it is byte-identical to.
 *
 * Groups are separated by `/` and the candidates inside one by `,`.
 */
const LANES = ((arg('lanes') as string | null) || '').split('/').map((g) => g.split(',').filter(Boolean)).filter((g) => g.length);
const ONLY = arg('only');

/**
 * The nine voices the record is actually made of. It is written down here and
 * nowhere else in the engine, and it is not a table anything plays from: it is
 * the anchor the ceiling's two assumptions are chosen against, because the one
 * load that is known to work on a phone is the one that already shipped.
 */
const V1_CAST = ['kick', 'hatClosed', 'hatOpen', 'shaker', 'clap', 'sub', 'keys', 'pad', 'piano'];

/**
 * What ordinary house-v2 plays beside the lanes: a hand player on the
 * sixteenth roles (the conga and the cabasa), the texture pulse (the FM bell)
 * and the two spaces the pulse and the hands send to. Like `V1_CAST` it is an
 * anchor written down here, not a table anything plays from.
 */
const V2_ADDS: { voices: string[]; returns: Array<'hall' | 'background' | 'immersed'> } = {
  voices: ['conga', 'cabasa', 'fmBell'],
  returns: ['background', 'immersed'],
};

/**
 * Every playable instrument, over every fixture table, with the builder that
 * plays it. It is `tools/tables.ts`'s list again with one column more: which
 * module to ask for the program, because the two harmonic tables and the drum
 * table each have their own.
 */
const ROWS = [
  ...SCENES.map((s) => ({ id: s.id, voice: s.voice, table: 'K2' })),
  ...DRUM_SCENES.filter((s) => !s.also).map((s) => ({ id: s.id, voice: s.voice, table: 'K3' })),
  ...SCENES_2.map((s) => ({ id: s.id, voice: s.voice, table: 'K4' })),
].filter((r) => !ONLY || r.id === ONLY || r.voice === ONLY);

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${PORT}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>budget</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise<void>((done) => server.listen(PORT, '127.0.0.1', () => done()));
const BASE = `http://127.0.0.1:${PORT}/`;

/**
 * What the page is asked for. The reference is the unit everything else is
 * divided by; a voice is one row of one fixture table, carrying the table it
 * came from because each of the three has its own module to ask for a program.
 */
type Job =
  | { kind: 'reference'; base: string; rate: number }
  | { kind: 'voice'; id: string; table: string; base: string; rate: number }
  | { kind: 'return'; id: string; base: string; rate: number };

/**
 * A factory on the context, as the counter reaches one. The thirteen have
 * thirteen different signatures and are wrapped by name, so what the table
 * holds is "any of them": what is being read is a count of the calls and never
 * of what they handed back, which is why the arguments are `any`. Twelve of
 * them make a node and the thirteenth makes a wave, so both are in the return.
 */
type NodeFactory = (...a: any[]) => AudioNode | PeriodicWave;

/**
 * One render of one fixture: how long it took, what it asked the context to
 * hold, and how many nodes the first note built.
 */
interface Reading { ms: number; bytes: number; first: number }

const RUN = async (job: Job) => {
  const S = job.base;
  const [G, MA, VO, SC, PL, AU, AU2, AD, FXR, DSP] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-voices.ts`),
    import(`${S}tools/audition-voices-2.ts`),
    import(`${S}tools/audition-drums.ts`),
    import(`${S}src/effects/index.ts`),
    import(`${S}src/dsp.ts`),
  ]);
  const rate = job.rate;
  const COUNTERS = ['createGain', 'createBiquadFilter', 'createOscillator', 'createWaveShaper',
    'createDelay', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner',
    'createChannelSplitter', 'createChannelMerger', 'createConstantSource', 'createBufferSource',
    'createPeriodicWave'];

  // The reference: the overdrive rendering a minute of looping noise, which is
  // the unit everything in this file is divided by. Fastest of three, because a
  // render time on a machine somebody is working on is a noisy thing.
  if (job.kind === 'reference') {
    const settings = AU.voiceAudition('kick').program.settings;
    const once = async (id: string | null) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(60 * rate), rate);
      const out = ctx.createGain();
      out.connect(ctx.destination);
      const src = DSP.noiseSource(ctx, 0, 60);
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(g);
      if (id) {
        const fx = FXR.makeEffect(id, ctx, settings, { beat: 0.5 });
        g.connect(fx.input);
        fx.output.connect(out);
      } else g.connect(out);
      const t0 = performance.now();
      await ctx.startRendering();
      return performance.now() - t0;
    };
    let wire = Infinity;
    let ref = Infinity;
    for (let i = 0; i < 3; i++) {
      wire = Math.min(wire, await once(null));
      ref = Math.min(ref, await once(FXR.COST_REFERENCE));
    }
    return { wire: +wire.toFixed(1), reference: +ref.toFixed(1), id: FXR.COST_REFERENCE };
  }

  // One voice, alone, on its own figure: the nodes one note builds, what its
  // prepare hook asks a context to hold, and how long a minute of it takes.
  //
  // **Everything is measured twice and subtracted**, and that is the whole
  // difficulty of costing a voice rather than an effect. An effect is rendered
  // into a bare wire; a voice cannot be, because what a voice *is* includes
  // where it is routed — the sends it feeds, the level its bus gives it, the
  // master it passes through. So the same fixture is rendered with its notes
  // and again with none of them, and the difference is the instrument. The
  // first reading of the kick without that subtraction said 28.7x and 689 kB,
  // which is the v1 graph's three convolvers and its limiter, measured once per
  // voice and blamed on whichever one was being asked about.
  if (job.kind === 'voice') {
    const aud = job.table === 'K3' ? AD.drumAudition(job.id)
      : job.table === 'K4' ? AU2.voiceAudition2(job.id)
        : AU.voiceAudition(job.id);
    const prog = aud.program;
    const settings = prog.settings;
    const seconds = prog.duration;
    const notes = prog.events.length;

    const once = async (withNotes: boolean) => {
      const events = withNotes ? prog.events : [];
      const program = { ...prog, events };
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      await MA.prepareLimiter(ctx, settings);
      let bytes = 0;
      const realBuffer = ctx.createBuffer.bind(ctx);
      ctx.createBuffer = (channels, length, r) => { bytes += channels * length * 4; return realBuffer(channels, length, r); };
      const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
      graph.out.connect(ctx.destination);
      await VO.prepareVoices(ctx, settings, events, { all: true });
      let nodes = 0;
      let first = 0;
      const real: Record<string, NodeFactory> = {};
      // The same context, reached by name: the wrapping is of its own methods
      // and the two names are one object.
      const counted = ctx as unknown as Record<string, NodeFactory>;
      for (const k of COUNTERS) { real[k] = counted[k].bind(ctx); counted[k] = (...a) => { nodes++; return real[k](...a); }; }
      PL.scheduleAutomation(graph, program, 0);
      for (const s of SC.schedule(program, SC.offsetGrid(0)).events) {
        PL.fireEvent(ctx, graph, program, s.pe, s.at);
        // Only the first note is counted: a voice builds the same graph for
        // every one of them, and a count of all of them would be a count of the
        // figure rather than of the instrument.
        if (!first) first = nodes;
      }
      for (const k of COUNTERS) counted[k] = real[k];
      ctx.createBuffer = realBuffer;
      const t0 = performance.now();
      await ctx.startRendering();
      const ms = performance.now() - t0;
      graph.dispose();
      return { ms, bytes, first };
    };

    // Fastest of two of each, for the reason the effects' own cost job gives: a
    // render time on a machine somebody is working on is a noisy thing.
    let played: Reading | null = null;
    let bare: Reading | null = null;
    for (let i = 0; i < 2; i++) {
      const a = await once(true);
      const b = await once(false);
      if (!played || a.ms < played.ms) played = a;
      if (!bare || b.ms < bare.ms) bare = b;
    }
    return {
      id: job.id,
      nodesPerNote: played!.first,
      prepareBytes: Math.max(0, played!.bytes - bare!.bytes),
      graphBytes: bare!.bytes,
      notes,
      seconds: +seconds.toFixed(2),
      // A minute of this instrument playing its own figure, less the minute the
      // graph would have cost with nothing in it.
      msPerMinute: +(((played!.ms - bare!.ms) * 60) / seconds).toFixed(1),
      graphMsPerMinute: +((bare!.ms * 60) / seconds).toFixed(1),
    };
  }

  // One lazy return — the piano's hall, the background and the immersed
  // space — fed a minute of noise beside the same noise going dry, less the
  // same graph with the dry noise alone. A return is not a voice: it is built
  // once per theme and then runs for as long as the theme does, whatever is
  // sent to it, which is why the minute is of the return and not of a figure.
  // `nodesPerNote` is what building it made and `buildMs` how long that took,
  // which is the time a deck now pays when it is made (src/scheduler.ts,
  // `prepareReturns`) and the first sending note used to pay inside
  // `fireEvent`.
  if (job.kind === 'return') {
    const settings = AU.voiceAudition('kick').program.settings;
    const once = async (withReturn: boolean) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(60 * rate), rate);
      await MA.prepareLimiter(ctx, settings);
      const graph = G.makeV1Graph(ctx, settings, { bpm: 120, trimDb: 0 });
      graph.out.connect(ctx.destination);
      const src = DSP.noiseSource(ctx, 0, 60);
      const g = ctx.createGain();
      g.gain.value = 0.1;
      src.connect(g);
      g.connect(graph.buses.melodic.dry);
      let nodes = 0;
      let bytes = 0;
      let buildMs = 0;
      if (withReturn) {
        const real: Record<string, NodeFactory> = {};
        const counted = ctx as unknown as Record<string, NodeFactory>;
        for (const k of COUNTERS) { real[k] = counted[k].bind(ctx); counted[k] = (...a) => { nodes++; return real[k](...a); }; }
        const realBuffer = ctx.createBuffer.bind(ctx);
        ctx.createBuffer = (channels, length, r) => { bytes += channels * length * 4; return realBuffer(channels, length, r); };
        const t0 = performance.now();
        const input = graph.buses.melodic[job.id as 'hall'];
        buildMs = performance.now() - t0;
        for (const k of COUNTERS) counted[k] = real[k];
        ctx.createBuffer = realBuffer;
        g.connect(input);
      }
      const t0 = performance.now();
      await ctx.startRendering();
      const ms = performance.now() - t0;
      graph.dispose();
      return { ms, nodes, bytes, buildMs };
    };
    let played: { ms: number; nodes: number; bytes: number; buildMs: number } | null = null;
    let bare: { ms: number } | null = null;
    let slowestBuild = 0;
    for (let i = 0; i < 2; i++) {
      const a = await once(true);
      const b = await once(false);
      slowestBuild = Math.max(slowestBuild, a.buildMs);
      if (!played || a.ms < played.ms) played = a;
      if (!bare || b.ms < bare.ms) bare = b;
    }
    return {
      id: job.id,
      nodesPerNote: played!.nodes,
      prepareBytes: played!.bytes,
      buildMs: +slowestBuild.toFixed(1),
      msPerMinute: +(played!.ms - bare!.ms).toFixed(1),
    };
  }

  // Every kind is answered above, so nothing the type allows reaches here;
  // it is what a job from somewhere else would be told.
  return { error: `no job called ${(job as Job).kind}` };
};

// --- measuring ---------------------------------------------------------------

const { pw, label } = await playwright();
console.log(`  ${label}`);
const browser: PlaywrightThing = await pw.chromium.launch(launchOptions('chromium'));
renice(browser);
const page: PlaywrightThing = await browser.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
/** The same job as the page's, less the two things the machine fills in. */
type Ask = { kind: 'reference' } | { kind: 'voice'; id: string; table: string } | { kind: 'return'; id: string };
const run = async (job: Ask) => {
  const out = await page.evaluate(RUN, { ...job, base: BASE, rate: RATE });
  if (VERBOSE) console.log(`        ${JSON.stringify(out)}`);
  return out;
};

const ref = await run({ kind: 'reference' });
console.log(`  the unit: ${ref.id} through a minute of noise in ${ref.reference} ms (a bare wire is ${ref.wire} ms), at ${RATE / 1000} kHz`);

/**
 * One measured instrument: the row it came from, the three readings, and the
 * class those readings put it in against what its descriptor declares.
 */
interface VoiceRow {
  id: string;
  voice: string;
  table: string;
  nodesPerNote: number;
  prepareBytes: number;
  graphBytes: number;
  notes: number;
  seconds: number;
  msPerMinute: number;
  graphMsPerMinute: number;
  relative: number;
  prepareKb: number;
  band: VoiceCost;
  declared: VoiceCost | null;
}

const rows: VoiceRow[] = [];
for (const r of ROWS) {
  const m = await run({ kind: 'voice', id: r.id, table: r.table });
  if (m.error) { console.log(`  ${r.id}: ${m.error}`); continue; }
  const relative = +(m.msPerMinute / ref.reference).toFixed(2);
  const prepareKb = +(m.prepareBytes / 1024).toFixed(1);
  // The first band it fits in on all three readings. A voice that is cheap in
  // nodes and dear in preparation is dear: what a phone runs out of first is
  // not something a class is allowed to average away.
  const band = (['cheap', 'mid', 'dear'] as const).find((c) => m.nodesPerNote <= VOICE_COST_BANDS[c].nodes
    && relative <= VOICE_COST_BANDS[c].relative
    && prepareKb <= VOICE_COST_BANDS[c].prepareKb) || 'dear';
  rows.push({ ...r, ...m, relative, prepareKb, band, declared: REGISTRY.find((d) => d.name === r.voice)!.cost || null });
}
/** One measured return, classed in the voices' own bands. */
interface ReturnRow { id: string; nodesPerNote: number; prepareKb: number; buildMs: number; relative: number; band: VoiceCost; declared: VoiceCost }
const returns: ReturnRow[] = [];
for (const id of !ONLY || ONLY === 'returns' ? LAZY_RETURNS : []) {
  const m = await run({ kind: 'return', id });
  if (m.error) { console.log(`  ${id}: ${m.error}`); continue; }
  const relative = +(m.msPerMinute / ref.reference).toFixed(2);
  const prepareKb = +(m.prepareBytes / 1024).toFixed(1);
  const band = (['cheap', 'mid', 'dear'] as const).find((c) => m.nodesPerNote <= VOICE_COST_BANDS[c].nodes
    && relative <= VOICE_COST_BANDS[c].relative
    && prepareKb <= VOICE_COST_BANDS[c].prepareKb) || 'dear';
  returns.push({ id, nodesPerNote: m.nodesPerNote, prepareKb, buildMs: m.buildMs, relative, band, declared: RETURN_COST[id] });
}
await browser.close();
server.close();

rows.sort((a, b) => a.relative - b.relative);
// **A voice is priced at its dearest instrument** — the bless below writes that
// — so a flag is a voice whose dearest instrument is not what it declares, and
// not an instrument cheaper than its voice's dearest. It flagged `pad:rhodes`
// (mid, beside `pad:strings` at dear) as a drift for as long as it existed, and
// that was one of the "seven classes drifting under load" (R80's round, 09-24):
// the rest were five voices declared through a factory call — `key('fmGlass',
// 'mid', …)`, `mallet('vibes', 'mid', …)` — which the bless could not find and
// so never wrote. They read dear in every run, loaded or not.
const ORDER = { cheap: 0, mid: 1, dear: 2 } as const;
const dearest = new Map<string, VoiceCost>();
for (const r of rows) {
  const had = dearest.get(r.voice);
  if (!had || ORDER[r.band] > ORDER[had]) dearest.set(r.voice, r.band);
}
console.log('');
for (const r of rows) {
  const flag = r.declared && r.declared !== dearest.get(r.voice) && r.band === dearest.get(r.voice) ? `  <- declares ${r.declared}` : '';
  console.log(`  ${r.id.padEnd(16)} ${String(r.nodesPerNote).padStart(3)} nodes/note  ${String(r.relative).padStart(6)}x  ${String(r.prepareKb).padStart(8)} kB prepared  ${r.band}${flag}`);
}

if (returns.length) {
  console.log('');
  for (const r of returns) {
    const flag = r.declared !== r.band ? `  <- declares ${r.declared}` : '';
    console.log(`  return ${r.id.padEnd(9)} ${String(r.nodesPerNote).padStart(3)} nodes  ${String(r.relative).padStart(6)}x  ${String(r.prepareKb).padStart(8)} kB of impulse  built in ${r.buildMs} ms  ${r.band}${flag}`);
  }
}

// --- the ceiling -------------------------------------------------------------

const machine = 60000 / ref.reference;
const ceiling = machine / PHONE / HEADROOM;
console.log('');
console.log(`  the ceiling: ${ceiling.toFixed(0)} units`);
console.log(`    MEASURED  this machine runs ${machine.toFixed(0)} units in real time (60000 ms / ${ref.reference} ms a unit)`);
console.log(`    ASSUMED   a phone is ${PHONE}x slower than it (--phone)`);
console.log(`    STATED    audio gets 1/${HEADROOM} of what that phone could give it (--headroom ${HEADROOM})`);
console.log(`  the whole effects kitchen is ${FX.costOf(FX.EFFECTS)} units; one voice of each class is ${Object.entries(VOICE_COST_UNITS).map(([k, v]) => `${k} ${v}`).join(', ')}`);

// v1's own cast, every run: the anchor the two assumptions are chosen against.
// A ceiling that the record already shipped does not fit under is a ceiling
// with something wrong in it, and this is where that would show.
{
  const seen = new Map<string, VoiceCost>();
  for (const r of rows) {
    const order = { cheap: 0, mid: 1, dear: 2 };
    if (!seen.has(r.voice) || order[r.band] > order[seen.get(r.voice)!]) seen.set(r.voice, r.band);
  }
  const priced = V1_CAST.filter((v) => seen.has(v));
  const units = priced.reduce((s2, v) => s2 + VOICE_COST_UNITS[seen.get(v)!], 0);
  if (priced.length === V1_CAST.length) {
    console.log(`  v1's own cast (${V1_CAST.join(', ')}) is ${units} units — ${((units / machine) * 100).toFixed(0)}% of this machine's real time, and ${units <= ceiling ? `${(ceiling - units).toFixed(0)} under the ceiling` : `${(units - ceiling).toFixed(0)} OVER it`}`);
    // ...and what ordinary house-v2 plays on top of it, which the composer's
    // lane-only ceiling does not count (the generation review of 09-22, #10):
    // the hand players, the texture pulse and the two spaces they send to.
    const adds = V2_ADDS.voices.filter((v) => seen.has(v));
    const addUnits = adds.reduce((s2, v) => s2 + VOICE_COST_UNITS[seen.get(v)!], 0)
      + V2_ADDS.returns.reduce((s2, r) => s2 + VOICE_COST_UNITS[returns.find((x) => x.id === r)?.band || RETURN_COST[r]], 0);
    if (adds.length === V2_ADDS.voices.length) {
      const all = units + addUnits;
      console.log(`  ordinary house-v2 adds ${V2_ADDS.voices.join(', ')} and the ${V2_ADDS.returns.join(' and ')} returns: ${addUnits} units more, ${all} in all — ${all <= ceiling ? `${(ceiling - all).toFixed(0)} under the ceiling` : `${(all - ceiling).toFixed(0)} OVER it`}`);
    }
  }
}

// --- one strategy, against it ------------------------------------------------

if (CHAIN.length || CAST.length || LANES.length || RETURNS.length) {
  const fxUnits = FX.costOf(CHAIN);
  // The voices are priced off what this run just measured, so a strategy can be
  // budgeted before anything has been blessed.
  const seen = new Map<string, VoiceCost>(rows.map((r): [string, VoiceCost] => [r.voice, r.band]));
  const missing: string[] = [];
  const priceOf = (v: string): number => {
    const band = seen.get(v) || (REGISTRY.find((d) => d.name === v) || {}).cost;
    if (!band) { missing.push(v); return 0; }
    return VOICE_COST_UNITS[band];
  };
  let voiceUnits = 0;
  for (const v of CAST) voiceUnits += priceOf(v);
  // ...and one lane is the dearest of its candidates, because a lane plays one
  // of them at a time and what a phone has to survive is the worst draw.
  const laneLines: string[] = [];
  for (const lane of LANES) {
    const prices = lane.map(priceOf);
    const worst = Math.max(...prices);
    voiceUnits += worst;
    laneLines.push(`${lane.join('|')} = ${worst}`);
  }
  // A return is priced like a voice of its class, once: it is one convolver
  // per theme whatever sends to it. Priced off this run's reading when there is
  // one, else off the declared class.
  let returnUnits = 0;
  const returnLines: string[] = [];
  for (const id of RETURNS) {
    const band = returns.find((r) => r.id === id)?.band || RETURN_COST[id as keyof typeof RETURN_COST];
    if (!band) { missing.push(`return ${id}`); continue; }
    returnUnits += VOICE_COST_UNITS[band];
    returnLines.push(`${id} = ${VOICE_COST_UNITS[band]}`);
  }
  const total = fxUnits + voiceUnits + returnUnits;
  console.log('');
  console.log(`  a strategy of ${CHAIN.length} effects, ${CAST.length} voices, ${LANES.length} lanes and ${RETURNS.length} returns:`);
  console.log(`    ${CHAIN.join(' + ') || '(no chain)'} = ${fxUnits} units`);
  if (CAST.length) console.log(`    ${CAST.join(' + ')} = ${voiceUnits - laneLines.reduce((a, l) => a + +l.split(' = ')[1], 0)} units`);
  for (const l of laneLines) console.log(`    lane ${l}`);
  for (const l of returnLines) console.log(`    return ${l}`);
  if (missing.length) console.log(`    NOT PRICED: ${missing.join(', ')} — a ceiling that prices what it cannot find at nothing passes everything`);
  console.log(`    ${total} units against a ceiling of ${ceiling.toFixed(0)}: ${total <= ceiling ? 'inside it' : `OVER by ${(total - ceiling).toFixed(0)}`}`);
  if (missing.length) process.exitCode = 1;
}

// --- writing the classes down ------------------------------------------------
//
// A declared number is written by the thing that measures it and never typed,
// which is the rule every round of this plan has kept. Here it is one word per
// voice, into the module that makes the sound, beside the name.

if (BLESS) {
  console.log('\nblessing');
  const byVoice = new Map<string, VoiceCost>();
  for (const r of rows) {
    // A voice with several playable instruments is priced at its **dearest**
    // one: what a phone has to survive is the worst case and not the average.
    const had = byVoice.get(r.voice);
    const order = { cheap: 0, mid: 1, dear: 2 };
    if (!had || order[r.band] > order[had]) byVoice.set(r.voice, r.band);
  }
  // The voice modules, by extension. They are `.ts` since the conversion of
  // 2026-09-19, and the one file in the engine that is still JavaScript — the
  // limiter's worklet — is not in this folder; the test reads both so a module
  // left behind in either language is still found and still blessed.
  const files = fs.readdirSync(path.join(SRC, 'voices')).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  let written = 0;
  for (const [voice, band] of byVoice) {
    let done = false;
    for (const f of files) {
      const file = path.join(SRC, 'voices', f);
      const text = fs.readFileSync(file, 'utf8');
      const re = new RegExp(`(\\n(\\s*)name: '${voice}',\\n)(\\2cost: '(?:cheap|mid|dear)',\\n)?`);
      const m = text.match(re);
      // ...or a descriptor made by a factory with the name and the class as its
      // first two arguments, `key('fmGlass', 'mid', …)`, which is how the FM
      // keys and the mallets are declared and why they were never blessed.
      const call = new RegExp(`(\\b\\w+\\('${voice}', )'(cheap|mid|dear)'`);
      const c = m ? null : text.match(call);
      if (!m && !c) continue;
      if (m) fs.writeFileSync(file, text.replace(re, `${m[1]}${m[2]}cost: '${band}',\n`));
      else fs.writeFileSync(file, text.replace(call, `$1'${band}'`));
      console.log(`  ${voice}: ${m ? (m[3] ? m[3].trim() : 'nothing') : `cost: '${c![2]}'`} -> cost: '${band}'  (${f})`);
      written++;
      done = true;
      break;
    }
    if (!done) console.log(`  ${voice}: no descriptor with a literal name in src/voices/ — declare it by hand`);
  }
  console.log(`\n  ${written} of ${byVoice.size} written; re-run without --bless to check them.`);
}
// The returns on their own switch as well, because a machine under load reads
// the voices near a band's edge on the other side of it and a bless of the
// returns should not re-class seven voices by the way.
if (BLESS || BLESS_RETURNS) {
  if (returns.length) {
    const file = path.join(SRC, 'master.ts');
    let text = fs.readFileSync(file, 'utf8');
    for (const r of returns) {
      const re = new RegExp(`(\n  ${r.id}: )'(?:cheap|mid|dear)'`);
      if (!re.test(text)) { console.log(`  return ${r.id}: no row in RETURN_COST — declare it by hand`); continue; }
      text = text.replace(re, `$1'${r.band}'`);
      console.log(`  return ${r.id}: ${r.declared} -> ${r.band}  (master.ts)`);
    }
    fs.writeFileSync(file, text);
  }
}
