// The machine, on its own.
//
//   npm test -w @deep-house/engine     this, beside the node checks and the
//                                      effects (tools/test-all.ts)
//   node tools/test.ts                 this alone, six renders at a time
//   node tools/test.ts --jobs 1        this alone, one at a time
//
// Everything here runs with no composer installed: no dice, no corpus, no
// style, no deep house. What it proves is the claim the package makes — that
// `packages/engine` resolves a room out of a table, builds the graph and makes
// a sound out of a program, and that the only thing it wants from a composer is
// values of the shapes in `src/program.ts`.
//
// Five parts, cheapest first:
//
//   1. the meter, against the seventeen signals whose answer is arithmetic
//   2. node: the resolver, the sidechain and the one scheduling contract over a
//      hand-written program — no browser, because none of it needs one
//   3. a browser: a voice through the graph, rendered offline and metered
//   4. the two auditions of round G, in every engine that is installed: the
//      plucked mid bass alone against its own declared numbers, and the
//      drumless sustained piece — offline, and then live through a real deck
//   5. what a start and a stop leave behind, over ten cycles, and what a
//      superseded start leaves: nothing
//
// The browser is headless and the render reaches no device by construction; the
// modules are served off this package's own `src/` and `tools/` with node
// stripping the types out of the `.ts` ones on the way past, so what the page
// loads is the source itself and not a build of it. Every browser is reniced to
// the bottom of the queue: this runs on somebody's working machine. The two
// engines run at once, and inside each the offline jobs share a pool of
// `--jobs` pages (`lanes.ts`); the two jobs that read a clock — the live deck
// and the kitchen's cost — run alone once the pool is empty.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice, finish, listenOn } from './harness.ts';
import type { PlaywrightThing } from './harness.ts';
import { lanes, captured, say, jobsArg } from './lanes.ts';
import { resolveSettings } from '../src/settings.ts';
import type { Settings } from '../src/settings.ts';
import { duckShape, duckAt, type Program } from '../src/program.ts';
import { schedule, firstEvent, offsetGrid, type Scheduled } from '../src/schedule.ts';
import { REGISTRY, VOICE_BUS, VOICE_LEVEL, VOICES, holdGrainPad, controlFaultsOfAll, noteControl, withControls } from '../src/voices/index.ts';
import { BUSES, FAMILIES } from '../src/voices/descriptor.ts';
import { heldVoice } from '../src/voices/held.ts';
import { knob } from '../src/effects/shell.ts';
import { MIN_RELEASE } from '../src/dsp.ts';
import * as FX from '../src/effects/index.ts';
import { K1, uncoveredEffects } from './audition-effects.ts';
import { table } from './fixture.ts';
import { standin } from './standin.ts';
import type { StandinParam } from './standin.ts';
// Types only, and every one of them erased before this file runs: the fixtures
// this suite plays are `tools/audition.ts`'s and the drones they hold are the
// voices' own held handle, so the shapes are named from where they are written
// rather than described again here.
import type { Audition } from './audition.ts';
import type { HeldState, HeldVoice } from '../src/voices/voice-contract.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };

let failed = 0;
const skipped: string[] = [];
const VERBOSE = process.argv.includes('--verbose');
// How many offline renders run at once, over both engines (`lanes.ts`); the
// default is measured (notes/reviews/suites-2026-09-24.md) and `--jobs 1` is
// the serial suite.
const JOBS = jobsArg(6);
const round = (v: number, n = 2): number => +Number(v).toFixed(n);
const ok = (what: string): void => say(`  ok    ${what}`);
const bad = (what: string): void => { failed++; say(`  FAIL  ${what}`); };
const must = (cond: boolean, why: string, what: string): void => (cond ? ok(what) : bad(why));

// --- 1. the meter -----------------------------------------------------------
console.log('the meter');
try {
  const out = execFileSync(process.execPath, [path.join(HERE, 'meter.ts'), '--selftest'], { encoding: 'utf8' });
  ok(out.trim().split('\n').pop()!);
} catch (e) {
  bad(`the meter: ${((e as { stdout?: Buffer }).stdout || (e as Error).message).toString().trim().split('\n').filter((l: string) => l.includes('FAIL')).join(' | ')}`);
}

// --- 2. node: a room, a sidechain and a schedule ----------------------------
console.log('the contract, without a composer');

const settings = resolveSettings({ base: table, room: { levels: { sub: table.levels.sub - 2 } } });
must(
  Object.isFrozen(settings) && Object.isFrozen(settings.master.limiter) &&
    settings.levels.sub === table.levels.sub - 2 && (settings.kick as Record<string, number>).decay === (table.kick as Record<string, number>).decay,
  'the resolver did not merge a room over the table, or did not freeze what it handed back',
  `a room resolved out of a table that is nobody's music: ${Object.keys(settings).length} groups, frozen through, the room's own sub at ${settings.levels.sub} dB`
);

const shape = duckShape(settings, 0.5);
const at = duckAt(shape, 0.0005);
must(
  shape.length === 10 && shape.every((d) => Number.isFinite(d.v) && Number.isFinite(d.dt)) &&
    at.every((d) => d.t >= 0) && at[0].t === 0,
  'the sidechain is not a finite shape, or a point of it fell before the start of the timeline',
  `the sidechain shape reads off the room alone: ${shape.length} points over two paths, and a kick at half a millisecond clamps its first set to 0`
);

// One theme, written out by hand: two kicks, a sub between them, and a voice
// that arrives later than it starts. Nothing composed it.
const program: Program = Object.freeze<Program>({
  seed: 'fixture', index: 0, preset: 'none', bpm: 120, beat: 0.5, barSeconds: 2,
  bars: 1, duration: 2, settings, trimDb: 0, themeGain: 1, seam: null,
  blendBars: null, filterMove: null, routing: {}, levels: {},
  events: [
    { i: 0, voice: 'kick', layer: 'kick', bus: 'kick', level: 'kick', bar: 0, step: 0, t: 0, onset: 0, lead: 0, duck: true, gap: 'kick', p: {} },
    { i: 1, voice: 'sub', layer: 'bass', bus: 'sub', level: 'sub', bar: 0, step: 4, t: 0.5, onset: 0.5, lead: 0, duck: false, gap: 'sub', p: { midi: 31, dur: 0.45 } },
    { i: 2, voice: 'hatClosed', layer: 'hats', bus: VOICE_BUS.hatClosed, level: VOICE_LEVEL.hatClosed, bar: 0, step: 4, t: 0.75, onset: 0.75, lead: 0, duck: false, gap: null, p: { vel: 0.8 } },
    { i: 3, voice: 'kick', layer: 'kick', bus: 'kick', level: 'kick', bar: 0, step: 8, t: 1, onset: 1, lead: 0, duck: true, gap: 'kick', p: {} },
  ],
  automation: [], duckShape: shape, duck: [], development: [],
});

const whole = schedule(program, offsetGrid(0));
const windows: Scheduled[] = [];
let cursor = firstEvent(program, 0);
for (let to = 0.25; to <= 2.25; to += 0.25) {
  const run = schedule(program, offsetGrid(0), cursor, to);
  windows.push(...run.events);
  cursor = run.next;
}
must(
  whole.events.length === 4 && windows.length === 4 &&
    whole.events.every((s, i) => s.pe === windows[i].pe && s.at === windows[i].at),
  'a theme filled a window at a time is not the theme scheduled whole',
  `the one scheduling contract over a hand-written program: 4 events, the same 4 in the same order at the same instants filled ${windows.length && 9} windows at a time`
);

const holed = schedule(program, { ...offsetGrid(0), gaps: { kick: [[0.9, 1.1]] } }, 0, Infinity);
must(
  holed.events.length === 3 && !holed.events.some((s) => s.pe.i === 3),
  'a hole in the kick hand-over did not drop exactly the kick inside it',
  'a hole cut in the kick hand-over drops the one kick inside it and nothing else'
);

must(
  Object.keys(VOICES).length === REGISTRY.length && REGISTRY.every((d) => VOICES[d.name] === d.render),
  'the registry and the voice table disagree',
  `${REGISTRY.length} voice descriptors, every one of them the function its own module registered in the table the schedule fires through`
);

// The note controls, as declared: a range each, the names a part asks for the
// same as the ranges, and every value taken into its range at the voice rather
// than refused on the tick (the engine review of 09-22, finding 4). What each
// end sounds like is `tools/test-voices.ts --controls`.
{
  const faults = controlFaultsOfAll();
  const spec = { hz: { unit: 'hz', min: 100, max: 200, default: 150 }, on: { unit: 'switch', min: 0, max: 1, default: 0 } } as const;
  const read = [noteControl({ hz: 50 }, spec, 'hz'), noteControl({ hz: 250 }, spec, 'hz'), noteControl({ hz: NaN }, spec, 'hz'),
    noteControl({ hz: 'x' }, spec, 'hz'), noteControl({}, spec, 'hz'), noteControl({ on: 0.7 }, spec, 'on')];
  const inside = { hz: 120, vel: 0.5 };
  must(
    !faults.length && read.join() === '100,200,,,,1' && withControls(inside, spec) === inside &&
      !('hz' in withControls({ hz: NaN }, spec)) && withControls({ hz: 900 }, spec).hz === 200,
    `the note controls: ${faults.join('; ') || `a range read ${read.join()}`}`,
    `${REGISTRY.filter((d) => d.controls).reduce((n, d) => n + Object.keys(d.controls!).length, 0)} note controls on ${REGISTRY.filter((d) => d.controls).length} voices are ranges, named as parts ask for them; a value past an end plays the end, one that is not a number plays the voice's own, and a note inside its ranges is handed on as the same object`
  );
}

// --- 2b. the effects kitchen, on paper --------------------------------------
//
// The completeness gate PLAN-KITCHEN's K1 asks for, and it needs no browser
// because none of it is about sound: every descriptor complete and typed, every
// `applies` a bus or a family somebody actually declares, every cost a class,
// and every derived table the registry in the registry's order. It is the
// voices' own catalogue gate, one folder over.
console.log('the effects kitchen, on paper');
{
  const faults = FX.REGISTRY.flatMap((d) => FX.faultsOf(d));
  const ids = FX.REGISTRY.map((d) => d.id);
  const params = FX.REGISTRY.reduce((n, d) => n + Object.keys(d.params).length, 0);
  const targets = new Set(FX.REGISTRY.flatMap((d) => d.applies));
  must(
    !faults.length && new Set(ids).size === ids.length,
    faults.length ? `${faults.length} faults in the descriptors: ${faults.slice(0, 3).join('; ')}` : `two effects share an id: ${ids.join(', ')}`,
    `${FX.REGISTRY.length} effect descriptors complete and typed, ${params} parameters with a unit, a range, a default and a rate between them, every one of ${[...targets].length} things they apply to a real bus or family, every cost a class`
  );
  const known: string[] = [...BUSES, ...FAMILIES];
  must(
    [...targets].every((t) => known.includes(t)) &&
      FX.EFFECTS.join(' ') === FX.REGISTRY.map((d) => d.id).join(' ') &&
      Object.keys(FX.BUILD).join(' ') === FX.EFFECTS.join(' ') &&
      FX.REGISTRY.every((d) => FX.BY_ID[d.id] === d && FX.BUILD[d.id] === d.build && FX.EFFECT_COST[d.id] === d.cost),
    'a derived table is not the registry, in the registry\'s order',
    `every derived table off the one list and in its order: ${FX.EFFECTS.join(', ')}`
  );
  // And every registered effect is measured by one of the two effect gates.
  // Round K4's own lesson about fixture tables, asked one folder over: this
  // file measures K1's six and `tools/test-effects-2.ts` measures K4's twenty,
  // and an effect in neither table has no gate at all.
  must(
    !uncoveredEffects().length,
    `the effect gates and the registry disagree: ${uncoveredEffects().join(', ')}`,
    `every registered effect is measured by one of the two gates: ${FX.EFFECTS.length} effects, 6 here and ${FX.EFFECTS.length - 6} in tools/test-effects-2.ts`
  );
  // The ceiling's arithmetic. A chain of names is a number, and a name nobody
  // registered is a fault rather than a nought — a ceiling that silently prices
  // what it does not know at zero is a ceiling that passes everything.
  let refused = false;
  // A name nobody registered — and it has to be a name nobody will ever
  // register, because round K4 built the `reverb` this line used to name and
  // turned the assertion into a tautology that passed for the wrong reason.
  try { FX.costOf(['chorus', 'aThingNobodyBuilt']); } catch (e) { refused = true; }
  const chain = ['chorus', 'tapeDelay', 'overdrive'];
  must(
    FX.costOf([]) === 0 && FX.costOf(chain) === FX.COST_UNITS.mid * 2 + FX.COST_UNITS.cheap && refused,
    `costOf does not add up: ${FX.costOf(chain)} for ${chain.join(' + ')}${refused ? '' : ', and an effect nobody registered was priced at nothing'}`,
    `costOf sums a chain in units of one cheap effect — ${chain.join(' + ')} is ${FX.costOf(chain)}, the whole kitchen is ${FX.costOf(FX.EFFECTS)} — and refuses a name nobody registered`
  );
}

// --- 2c. the held cloud, live, on paper --------------------------------------
//
// The one held voice whose sound is scheduled ahead rather than sustained, in
// the case the fixture cannot render: a device, with a clock and no end. Until
// 09-20 it laid its whole horizon at once — 686 sources and 2 748 nodes for the
// default twenty-four seconds — and was silent from then on while its handle
// still said `holding` (the outside review of 09-19, its E03). It is a ring
// now, and this is the ring's gate: what it builds at the start is a window's
// worth and not a horizon's, it is still laying grains ninety seconds in, what
// it holds ahead of the clock stays bounded, a release ends the laying at the
// instant the voice is silent, and a dispose stops the timer. The clock is the
// recording context's, moved by hand; the pump's own timer is real, so ninety
// seconds of the cloud take three of the suite's.
console.log('the held cloud, live');
{
  const ctx = standin(48000);
  const cloud = holdGrainPad(ctx, { dry: ctx.node('out') } as unknown as Parameters<typeof holdGrainPad>[1], 0.1, {}, settings);
  const grains = () => ctx.of('buffer');
  const laidTo = () => Math.max(...grains().map((n) => n.starts[0][0] as number));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const atStart = { sources: grains().length, nodes: ctx.nodes.length, laidTo: laidTo() };
  const ahead: number[] = [];
  for (let t = 15; t <= 90; t += 15) {
    ctx.currentTime = t;
    await sleep(560);
    ahead.push(grains().filter((n) => (n.starts[0][0] as number) >= t).length);
  }
  const at90 = { laidTo: laidTo(), state: cloud.state, made: grains().length };
  // A hidden tab's page timer may not come for a minute (R94): the audio
  // clock's own tick — the silent source's `ended` — tops the ring up alone.
  ctx.currentTime = 90.4;
  const ticks = ctx.of('constant') as unknown as Array<{ onended: (() => void) | null }>;
  const beforeTick = laidTo();
  ticks[ticks.length - 1]?.onended?.();
  const byAudioClock = { ticks: ticks.length, from: beforeTick, to: laidTo() };
  const silent = cloud.release(91);
  await sleep(560);
  // A grain that would start after the voice is silent is either stopped at
  // that instant — the release stops everything in flight, and what was laid
  // ahead of the clock is in flight — or was never laid.
  const pastSilent = grains().filter((n) => (n.starts[0][0] as number) > silent && !n.stops.some((t) => (t as number) <= silent)).length;
  cloud.dispose();
  const stopped = grains().length;
  await sleep(560);
  must(
    atStart.sources < 200 && atStart.nodes < 800 && at90.laidTo >= 92 && at90.state === 'holding' &&
      byAudioClock.ticks > 0 && byAudioClock.to >= 93 && byAudioClock.to > byAudioClock.from &&
      Math.max(...ahead) <= 120 && Math.min(...ahead) >= 40 && pastSilent === 0 && cloud.state === 'gone' && grains().length === stopped,
    `the held cloud, live: the audio clock's tick (${byAudioClock.ticks} made) laid it from ${round(byAudioClock.from)} to ${round(byAudioClock.to)} s; ${atStart.sources} sources and ${atStart.nodes} nodes at the start laid to ${round(atStart.laidTo)} s; at ninety seconds laid to ${round(at90.laidTo)} s and ${at90.state}, holding ${ahead.join('/')} grains ahead of the clock; ${pastSilent} grains laid past the release's silence; ${cloud.state} after dispose with ${grains().length - stopped} laid since`,
    `the held cloud, live: ${atStart.sources} sources and ${atStart.nodes} nodes at the start (a window's worth, laid to ${round(atStart.laidTo)} s), ${at90.made} grains by ninety seconds and still laying (to ${round(at90.laidTo)} s, ${at90.state}) with ${Math.min(...ahead)}-${Math.max(...ahead)} ahead of the clock at any instant, topped up by the audio clock's own tick where the page's timer is late (to ${round(byAudioClock.to)} s at 90.4), nothing laid past the instant a release is silent, and nothing laid after a dispose`
  );
}

// --- 2d. a line remembers everything its parameter holds ---------------------
//
// The outside review of 09-19 (its E07): the knob helper and the held voice
// each remembered the last ramp written, so a nearer command landing under an
// earlier, longer ramp read the parameter where the later command started and
// not where the earlier ramp had got to; and a held voice turned `released`
// the instant a release was *asked for*, refusing a control aimed before the
// release was to begin. Both stand on `src/ramp.ts` now, and this is its
// gate, against the recording context: the review's own three commands, and
// the review's own release.
console.log('the line under a knob and a held voice');
{
  const ctx = standin(48000);
  const p = ctx.createGain().gain;
  const k = knob(ctx, p, 0);
  k(1, 0, 10);
  k(0.2, 20, 1);
  const remembered = k.at(5);
  k(0.8, 5, 1);
  const events = (p as unknown as StandinParam).events;
  // The recorder keeps what was cancelled as well as the cancel, so what is
  // asserted is the order: the queued ramp to 0.2 at 21, then the cancel at 5
  // that takes it off the parameter, then the ramp to 0.5 ending at 5 — the
  // ten-second leg the cancel erased, written back up to where it had got to
  // (the engine review of 09-22: a set there left the parameter at nought
  // until five and then jumped).
  const queued = events.findIndex((e) => e[0] === 'lin' && e[1] === 0.2 && e[2] === 21);
  const cancel = events.findIndex((e, i) => i > queued && e[0] === 'cancel' && e[1] === 5);
  const leg = cancel >= 0 ? events[cancel + 1] : null;
  must(
    remembered === 0.5 && queued >= 0 && cancel > queued && !!leg && leg[0] === 'lin' && leg[1] === 0.5 && leg[2] === 5 &&
      Math.abs(k.at(5.5) - 0.65) < 1e-9 && k.at(30) === 0.8,
    `the knob: at five it remembered ${remembered} and wrote ${leg ? JSON.stringify(leg) : 'nothing'} (a ramp to 0.5 ending at 5 wanted), the queued ramp at ${queued} and its cancel at ${cancel}, ${k.at(5.5)} at 5.5 and ${k.at(30)} at 30`,
    'the knob: a ramp from nought to one over ten seconds, a command queued at twenty, and a nearer command at five reads 0.5 at five, cancels the queued command, writes the interrupted leg back up to 0.5 at five, and reads 0.65 at 5.5 and 0.8 from six on'
  );
  const g = ctx.createGain();
  const v = heldVoice(ctx, { gain: g, tail: 1, level: 1, attack: { from: 1, to: 1, t0: 0, t1: 0 }, controls: { gain: (n) => [[g.gain, n]] } });
  const silent = v.release(10);
  const taken = v.setControl('gain', 0.2, 5, 1);
  const refused = v.setControl('gain', 0.5, 10.5, 1);
  const gEvents = (g.gain as unknown as StandinParam).events;
  const last = gEvents[gEvents.length - 1];
  const releaseSet = gEvents.filter((e) => e[0] === 'set' && e[2] === 10).pop();
  must(
    taken && !refused && v.state === 'released' && v.releaseAt === 10 && Math.abs(silent - (11 + MIN_RELEASE)) < 1e-9 &&
      !!last && last[0] === 'lin' && last[1] === 0 && last[2] === silent && !!releaseSet && (releaseSet[1] as number) === 0.2,
    `the held voice: a control at five under a release at ten was ${taken ? 'taken' : 'refused'} and one at 10.5 was ${refused ? 'taken' : 'refused'}; it says ${v.state} from ${v.releaseAt}; the last thing written is ${JSON.stringify(last)} and the release restarts from ${releaseSet ? releaseSet[1] : 'nothing'}`,
    `the held voice: released at ten and silent at ${silent}, a control at five is taken and one at 10.5 refused, and the release is written again behind the control so it starts from 0.2 and still ends at nought at ${silent}`
  );
}

// --- 3. a browser: a voice through the graph --------------------------------
console.log('a voice through the graph');

// The package's own source, served as it is written. `.ts` is stripped on the
// way past — node does it natively — so the browser is handed the same modules
// node runs, and there is no build step between this test and the code.
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, 'http://127.0.0.1').pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>engine</title>'); return; }
  // Two roots and nothing else: the package's own source and the package's own
  // tools, each served under the name the modules import each other by, so a
  // specifier that climbed out of the package would 404 here as well as failing
  // the boundary gate.
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
// A free port of its own, unless ENGINE_TEST_PORT names one (never 6975,
// which is Eugene's): so this suite, the effects suite, `npm test` and a second
// worktree's run can all go at once (`listenOn`, harness.ts).
const PORT = await listenOn(server, Number(process.env.ENGINE_TEST_PORT) || 0);

let pw;
try {
  pw = await playwright();
  ok(pw.label);
} catch (e) {
  skipped.push(`a voice through the graph: ${(e as Error).message.split('\n')[0]}`);
}

if (pw) {
  const browser = await pw.pw.chromium.launch(launchOptions('chromium'));
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  // The modules are named through `src`, a base handed in rather than written
  // here as a literal: a specifier in this file that pointed out of the package
  // is exactly what the boundary gate looks for, and a URL is a specifier.
  const read = await page.evaluate(async ({ program, src }: { program: Program; src: string }) => {
    const { makeV1Graph, makeV1Master } = await import(`${src}graph.ts`);
    const { prepareLimiter, writeDuck } = await import(`${src}master.ts`);
    const { VOICES, prepareVoices } = await import(`${src}voices/index.ts`);
    const { schedule, offsetGrid } = await import(`${src}schedule.ts`);
    const rate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate) + rate, rate);
    await prepareLimiter(ctx, program.settings);
    const master = makeV1Master(ctx, program.settings);
    master.out.connect(ctx.destination);
    const graph = makeV1Graph(ctx, program.settings, { bpm: program.bpm, master, trimDb: 0 });
    // The same chain a deck is in: one theme's graph into the sum, the sum
    // into the master every deck shares, the master into the destination.
    graph.out.connect(master.input);
    await prepareVoices(ctx, program.settings, program.events, { all: true });
    const fired = [];
    for (const s of schedule(program, offsetGrid(0)).events) {
      VOICES[s.pe.voice](ctx, graph.buses[s.pe.bus], s.at, s.pe.p, program.settings);
      if (s.pe.duck) writeDuck(graph, graph.duckShape, s.at);
      fired.push(`${s.pe.voice}@${s.at.toFixed(3)}`);
    }
    const buf = await ctx.startRendering();
    let peak = 0, sum = 0, bad = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        if (!Number.isFinite(d[i])) bad++;
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += a;
      }
    }
    graph.dispose();
    master.dispose();
    return { fired, peak, mean: sum / (buf.length * buf.numberOfChannels), bad };
  }, { program, src: `http://127.0.0.1:${PORT}/src/` });
  const continuity = await page.evaluate(async ({settings,tools}: {settings: Settings;tools:string}) => {
    const {pianoContinuity}=await import(`${tools}piano-continuity.ts`);
    return pianoContinuity(settings);
  }, {settings,tools:`http://127.0.0.1:${PORT}/tools/`});
  must(continuity.every((r:{peak:number;step:number;drop:number})=>Number.isFinite(r.peak)&&r.peak>.01&&r.step<.02&&r.drop<5),
    `piano filter reset or pan-law step at hammer stop: ${JSON.stringify(continuity)}`,
    `cached and live piano strings at three pitches remain continuous when the stereo hammer ends: worst step ${Math.max(...continuity.map((r:{step:number})=>r.step)).toFixed(4)}, and the level across it falls ${Math.min(...continuity.map((r:{drop:number})=>r.drop))}-${Math.max(...continuity.map((r:{drop:number})=>r.drop))} dB, the string's own decay (a pan-law flip is 6 or more)`);
  const ducks = await page.evaluate(async ({settings,tools}: {settings: Settings;tools:string}) => {
    const {duckContinuity}=await import(`${tools}duck-continuity.ts`);
    return duckContinuity(settings);
  }, {settings,tools:`http://127.0.0.1:${PORT}/tools/`});
  must(ducks.every((r:{error:number;step:number;final:number})=>r.error<.002&&r.step<.004&&r.final===1),
    `sidechain retrigger discontinuity: ${JSON.stringify(ducks)}`,
    'close and coincident kicks retrigger both sidechains continuously at 44.1 and 48 kHz');
  const cacheRun = await page.evaluate(async ({settings,tools}: {settings: Settings;tools:string}) => {
    const {pianoCache}=await import(`${tools}piano-cache.ts`);
    return pianoCache(settings);
  }, {settings,tools:`http://127.0.0.1:${PORT}/tools/`});
  must(cacheRun.missA===0&&cacheRun.missB===0&&cacheRun.peakMiB<=cacheRun.budgetMiB,
    `the piano's cache across a hand-over: ${JSON.stringify(cacheRun)}`,
    `the piano's cache across a hand-over: the playing theme keeps its strings while the next is prepared, 0 notes of either built on the tick, and the cache peaks at ${cacheRun.peakMiB} MiB of its ${cacheRun.budgetMiB} (${cacheRun.renders} renders for 48 strings)`);
  // R29 and R95 of the reconciled review of 09-24: a seek replaces its own
  // program's holder (it evicted the next theme's: 24 of its notes built on
  // the tick), and a note the deck drops lets its string go (8 of the next
  // theme's were built on the tick behind the pins nobody freed).
  const holds = await page.evaluate(async ({settings,tools}: {settings: Settings;tools:string}) => {
    const {pianoSeeks,pianoDropped}=await import(`${tools}piano-cache.ts`);
    return {seeks:await pianoSeeks(settings),dropped:await pianoDropped(settings)};
  }, {settings,tools:`http://127.0.0.1:${PORT}/tools/`});
  must(holds.seeks.missA===0&&holds.seeks.missB===0&&holds.seeks.renders===48,
    `the piano's holders across two seeks: ${JSON.stringify(holds.seeks)}`,
    `the piano's holders across two seeks in the playing theme: each replaces its own program's holder, and neither theme builds a note on the tick (${holds.seeks.renders} renders for 48 strings)`);
  must(holds.dropped.missA===0&&holds.dropped.missB===0,
    `the piano's holders past dropped notes: ${JSON.stringify(holds.dropped)}`,
    `the piano's holders past sixteen dropped notes: their strings are let go when a later note plays, and the next theme's queue gets the room (0 of its notes built on the tick, ${holds.dropped.renders} renders)`);
  const expRead = await page.evaluate(async ({tools}: {tools:string}) => {
    const {expLine}=await import(`${tools}exp-line.ts`);
    return expLine();
  }, {tools:`http://127.0.0.1:${PORT}/tools/`});
  must(Math.abs(expRead.end-.25)<1e-4&&Math.abs(expRead.half-.5)<1e-3,
    `an exponential program line to 0.25 read back ${JSON.stringify(expRead)}`,
    `an exponential program line from 1 to 0.25, rendered offline, reads ${expRead.half.toFixed(4)} half-way and ${expRead.end.toFixed(4)} at its end (the writer floored it at 60 until R73)`);
  const returns = await page.evaluate(async ({settings,tools}: {settings: Settings;tools:string}) => {
    const {returnsAtBuild}=await import(`${tools}returns-at-build.ts`);
    return returnsAtBuild(settings);
  }, {settings,tools:`http://127.0.0.1:${PORT}/tools/`});
  must(returns.built.hall&&returns.built.immersed&&!returns.built.background&&returns.convolvers===0,
    `the returns at deck build: ${JSON.stringify(returns)}`,
    'a program\'s returns are built with its graph (the hall for a piano, the immersed space for a bell that asks) and not one more, and firing its notes builds no convolver');
  const ramps = await page.evaluate(async ({tools}: {tools:string}) => {
    const {rampContinuity}=await import(`${tools}ramp-continuity.ts`);
    return rampContinuity();
  }, {tools:`http://127.0.0.1:${PORT}/tools/`});
  must(ramps.every((r:{quarter:number;step:number;final:number})=>Math.abs(r.quarter-.25)<.001&&r.step<.001&&Math.abs(r.final-.2)<1e-6),
    `an interrupted ramp, offline: ${JSON.stringify(ramps)}`,
    `a line interrupted half-way up a ramp keeps the half that played, offline at 44.1 and 48 kHz: ${ramps.map((r:{quarter:number;step:number})=>`${r.quarter.toFixed(3)} at a quarter, worst step ${r.step.toFixed(5)}`).join('; ')}`);
  await browser.close();
  must(
    read.fired.length === 4 && read.bad === 0 && read.peak > 0.005 && read.peak <= 1 && read.mean > 1e-6,
    `the render came back ${read.bad ? `with ${read.bad} samples that are not numbers` : `at a peak of ${read.peak}`}`,
    `four events of a hand-written program through the v1 graph in headless chromium: ${read.fired.join(', ')}, rendered offline to a peak of ${read.peak.toFixed(3)} with no sample that is not a number`
  );
}

// --- 4. the two auditions of round G ----------------------------------------
//
// `tools/audition.ts` writes out two pieces by hand — the new instrument alone,
// and a drumless sustained piece with long tails — and this plays them through
// the machine's own graph, deck, schedule and clock and measures what comes
// back. Nothing in either of them is composed, nothing in either of them is on
// the page, and the released randomiser can reach neither: the voice they share
// is named by no candidate list of any style.
//
// The gates are the ones the nine scenes are held to, because a fixture that
// was allowed to be louder or clickier than the record would prove nothing: a
// true peak at or under -1 dBTP, a sample peak at or under -1 dBFS, and a hit
// that moves more than 0.05 in one sample *and* stands eight times over its own
// neighbours is a click. The one number of its own is the instrument's declared
// loudness, and the band round it is a decibel.
const BASE = `http://127.0.0.1:${PORT}/`;
const GATES = {
  truePeakDbTP: -1,
  samplePeakDbFS: -1,
  clickStep: 0.05,
  clickRatio: 8,
  monoTolerance: 0.0002,
  loudnessBandDb: 1.0,
};

// Round K1's own gates, over and above the ones the scenes are held to.
const KITCHEN = {
  // What is left a declared tail after the input stopped, against what the
  // piece itself was doing.
  tailFloorDb: -60,
  // A bypass and a mix of nought are the input, to **one float32 ULP** — and
  // the number is 2^-23 because that is what a gain of 1 costs in Chromium,
  // MEASURED with no effect anywhere near it: three oscillators summed into a
  // destination, and the same three summed into a unity gain that is connected
  // to it, come out 1.19e-7 apart in Chromium and identical in Firefox (two
  // unity gains in a row are identical again, so it is the mixing and not the
  // multiply). Every render below therefore carries its own control — the same
  // fixture through a bare wire — and what is actually asserted is that the
  // bypassed effect is **no further from the dry than that wire is**, which is
  // the sentence the contract can honestly make: the arithmetic is exact and
  // the engine's own summing is what it is.
  identity: 1.1920928955078125e-7,
  // What `latency: 'none'` means: under a sixth of a millisecond, which at
  // 44.1 kHz is under seven samples. It is not nought, because a filter has a
  // group delay of its own and a group delay is not a latency — a second-order
  // Butterworth lowpass at 4.2 kHz delays what passes through it by
  // sqrt(2)/(2*pi*4200) = 54 microseconds, which is 2.4 samples, and the
  // overdrive's tone control measures exactly that. What the field is for is
  // the other kind: an up-sampler that hands back 128 samples in one engine and
  // 8 in another, which is 2.9 ms and would comb a dry path summed with it.
  latencyMs: 0.16,
  // Letting an effect go at the instant its input stops must not shorten the
  // tail by more than this.
  disposeDb: 0.75,
  // The two engines, at the declared oversample setting.
  engineAgreeDb: 0.5,
};

// What a job asks the page for. `kind` picks the branch below and the rest is
// that branch's own, which is why this is a union and not one record with
// everything optional: a job naming `cycles` at a kind that counts no cycles
// would be a job nobody wrote.
type Job =
  | { kind: 'pluck'; rate?: number }
  | { kind: 'drone'; rate?: number }
  | { kind: 'held'; rate?: number }
  | { kind: 'ownership'; cycles: number; rate?: number }
  | { kind: 'superseded'; rate?: number }
  | { kind: 'live'; seconds: number; rate?: number }
  | { kind: 'effect'; id: string; rate?: number }
  | { kind: 'oversample'; drive: number; low: number; high: number; rate?: number }
  | { kind: 'cost'; ids?: readonly string[]; rate?: number };

/** The same job, once the runner has added the base every import in the page is named off. */
type PageJob = Job & { base: string };

/**
 * A context reached by the *name* of one of its factory methods. Counting what
 * a render or a cycle builds means replacing `createGain` and its neighbours
 * by name and handing back whatever they hand back, which is a reflection a
 * typed `AudioContext` has no word for: the names are a list at run time and
 * each of them makes a different kind of node. Nothing is ever read off what
 * comes back — it is counted and passed straight on — so `unknown` is the
 * whole of what this file needs to know about it.
 */
type NodeFactories = Record<string, (...args: unknown[]) => unknown>;

/**
 * The three fields of a click reading that a gate is about. It is not
 * `meter.ts`'s own `Click`, because the seed of the reduce that finds the worst
 * of them is not one: nothing has been measured yet, so there is no place to
 * name.
 */
interface WorstClick {
  t: number;
  step: number;
  ratio: number;
}

/**
 * What a render leaves behind beside the buffer: how many events fired, what
 * the drones were doing, and where the graph's own knobs were left. `disposed`
 * is the states read a second time, after everything has been let go, which is
 * why it is the one field that is not there when the record is made.
 */
interface PlayFacts {
  fired: number;
  tails: number[];
  states: HeldState[];
  controls: string[][];
  duck: number;
  duckLow: number;
  melodic: number;
  macro: number;
  disposed?: HeldState[];
}

/**
 * How one render of an effect is made: the parameters it is built with, and
 * whatever is done to the instance once it is built — bypassing it, or letting
 * it go at the instant its input stops.
 */
interface How {
  params?: Record<string, number>;
  then?: (fx: FX.EffectInstance) => void;
}

/** How far two renders are apart at their worst, and where that was, in seconds. */
interface Apart {
  worst: number;
  at: number;
}

/** What one start-and-stop cycle built, counted as it built it. */
interface Cycle {
  nodes: number;
  buffers: number;
  oscillators: number;
  convolvers: number;
  worklets: number;
  fired: number;
}

/** One level reading of the live take: the second it was taken at, and the dB. */
type Mark = [number, number];

/** One line of the cost table: what one effect cost, three ways. */
interface CostRow {
  id: string;
  cost: FX.EffectCost;
  nodes: number;
  /** the fastest of three renders, in milliseconds */
  ms: number;
  /** against the dry chain */
  ratio: number;
  /**
   * against `COST_REFERENCE`, which is written in a second pass once every row
   * is in — so it is the one field a row does not have when it is made.
   */
  relative?: number;
}

/** One reading of one curve at one oversample setting. */
interface OversampleReading {
  /** the 2nd to the 8th harmonic against the fundamental, in dB */
  harmonics: number[];
  /** everything that folded back past Nyquist, against the tone it came from */
  aliasDb: number;
  /** how many partials that was */
  folds: number;
  rmsDb: number;
  /** what the up-sampler cost, in samples */
  latency: number;
}

/** The whole shaper measurement, one engine's worth. */
interface OversampleRun {
  rate: number;
  ms: number;
  drive: number;
  low: number;
  high: number;
  out: Record<string, OversampleReading>;
}

// Everything below runs in the page. It is one function because that is how a
// job crosses into a browser: it is serialised, so it may close over nothing
// and has to import what it needs by URL, from the two roots this file serves.
// Which is also what everything it imports is worth to the compiler: a
// specifier built at run time resolves to nothing here, so `G`, `VO`, `ME` and
// the rest are untyped inside this function and the shapes that outlive it are
// the ones written down above.
const RUN = async (job: PageJob) => {
  const S = job.base;
  const [G, MA, VO, SC, PL, DK, CK, CL, DSP, AU, ME, FXR, CV] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}src/deck.ts`),
    import(`${S}src/set-clock.ts`),
    import(`${S}src/clock.ts`),
    import(`${S}src/dsp.ts`),
    import(`${S}tools/audition.ts`),
    import(`${S}tools/meter.ts`),
    import(`${S}src/effects/index.ts`),
    import(`${S}src/effects/curves.ts`),
  ]);
  const rate = job.rate || 44100;
  const began = performance.now();
  const round = (v: number, n = 2): number => +v.toFixed(n);
  const db = (v: number): number => round(20 * Math.log10(v + 1e-30));

  const channels = (buf: AudioBuffer, from = 0, to: number | null = null): Float32Array[] => {
    const a = Math.max(0, Math.round(from * buf.sampleRate));
    const b = Math.min(buf.length, Math.round((to == null ? buf.duration : to) * buf.sampleRate));
    return [buf.getChannelData(0).slice(a, b), buf.getChannelData(1).slice(a, b)];
  };
  const rms = ([L, R]: Float32Array[]): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / Math.max(1, 2 * L.length));
  };
  const notNumbers = ([L, R]: Float32Array[]): number => {
    let n = 0;
    for (let i = 0; i < L.length; i++) { if (!Number.isFinite(L[i])) n++; if (!Number.isFinite(R[i])) n++; }
    return n;
  };
  const monoGap = ([L, R]: Float32Array[]): number => {
    let g = 0;
    for (let i = 0; i < L.length; i++) { const d = Math.abs(L[i] - R[i]); if (d > g) g = d; }
    return round(g, 6);
  };
  const worstOf = (list: WorstClick[]): WorstClick => list.reduce((a, c) => (c.step > a.step ? c : a), { step: 0, ratio: 0, t: 0 });
  // The top of the spectrum against the middle of it: a filter that opened
  // reads here whatever an AudioParam says about itself afterwards.
  const tilt = (buf: AudioBuffer, from: number, to: number): number => {
    const [L, R] = channels(buf, from, to);
    const bands = ME.thirdOctaves(L, R, rate);
    const mean = (a: number, b: number): number => bands.slice(a, b).reduce((x: number, y: number) => x + y, 0) / (b - a);
    return round(mean(23, 26) - mean(12, 16)); // 6.3-10 kHz against 500 Hz-1.25 kHz
  };

  // The fixture's own runner: the program through `schedule()` into the v1
  // graph, and the drones held beside it on the same graph. No composer, no
  // plan, no style — a program and a list of drones is all either of them is.
  const play = async (aud: Audition, { seconds = null, at = 0 }: { seconds?: number | null; at?: number } = {}) => {
    const program = aud.program;
    const settings = program.settings;
    const secs = seconds == null ? program.duration : seconds;
    const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
    graph.out.connect(ctx.destination);
    await VO.prepareVoices(ctx, settings, program.events, { all: true });
    PL.scheduleAutomation(graph, program, at);
    let fired = 0;
    for (const s of SC.schedule(program, SC.offsetGrid(at)).events) { PL.fireEvent(ctx, graph, program, s.pe, s.at); fired++; }
    const held: HeldVoice[] = AU.startDrones(ctx, graph, aud, at);
    const buf = await ctx.startRendering();
    const facts: PlayFacts = {
      fired,
      tails: held.map((h) => h.tail),
      states: held.map((h) => h.state),
      controls: held.map((h) => [...h.controls]),
      // What the sidechain and the melodic bus were left at. Nothing in either
      // audition posts a duck, so anything but 1 means something wrote one.
      duck: graph.param('duck.gain').value,
      duckLow: graph.param('duckLow.gain').value,
      melodic: graph.param('melodic.gain').value,
      macro: round(graph.param('macro.frequency').value, 1),
    };
    for (const h of held) h.dispose();
    facts.disposed = held.map((h) => h.state);
    graph.dispose();
    return { buf, facts };
  };

  if (job.kind === 'pluck') {
    const aud: Audition = AU.pluckAudition();
    const { buf, facts } = await play(aud);
    // `levels` is a closed table of named fields and a voice's `level` is a
    // key looked up in it, which is how `buildMaster` reads it too; the cast
    // says that in one place rather than at each use.
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL.pluckBass];
    const win = channels(buf, aud.window.from, aud.window.to);
    const withTail = channels(buf, aud.window.from);
    const onsets = aud.program.events.filter((e) => e.t >= aud.window.from).map((e) => e.t - aud.window.from);
    const lufs = ME.integratedLoudness(win, rate);
    return {
      rate, ms: Math.round(performance.now() - began), notes: facts.fired,
      hits: onsets.length,
      lufs, level, loudnessDb: round(lufs - level),
      declared: VO.TIMBRES.pluckBass.loudnessDb,
      truePeak: ME.truePeak(withTail),
      peak: db(ME.samplePeak(withTail)),
      rms: db(rms(win)),
      mono: monoGap(withTail),
      bad: notNumbers(withTail),
      click: worstOf(ME.clicks(withTail, rate, onsets)),
      duck: facts.duck,
    };
  }

  if (job.kind === 'drone') {
    const aud: Audition = AU.droneAudition();
    const program = aud.program;
    const { buf, facts } = await play(aud);
    const all = channels(buf);
    const last = Math.max(
      ...program.events.map((e) => e.t + (e.p.dur || 0)),
      ...aud.drones.map((d) => d.release),
    );
    const onsets = program.events.map((e) => e.t);
    // The envelope, a tenth of a second at a time through the middle of the
    // piece: what a record that pumps would show and this one may not.
    const env: number[] = [];
    for (let t = 30; t < 60; t += 0.1) env.push(rms(channels(buf, t, t + 0.1)));
    const mean = env.reduce((a, b) => a + b, 0) / env.length;
    const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) * (b - mean), 0) / env.length);
    return {
      rate, ms: Math.round(performance.now() - began), notes: facts.fired,
      duration: round(buf.duration),
      lastNote: round(last),
      voices: [...new Set(program.events.map((e) => e.voice))],
      drones: aud.drones.length,
      tails: facts.tails, states: facts.states, disposed: facts.disposed, controls: facts.controls[0],
      duckPoints: program.duck.length,
      duckingEvents: program.events.filter((e) => e.duck).length,
      duck: facts.duck, duckLow: facts.duckLow, melodic: facts.melodic, macro: facts.macro,
      automation: program.automation.map((a) => a.param),
      truePeak: ME.truePeak(all),
      peak: db(ME.samplePeak(all)),
      bad: notNumbers(all),
      body: db(rms(channels(buf, 30, 60))),
      afterLast: db(rms(channels(buf, last + 1, last + 2))),
      tail5: db(rms(channels(buf, buf.duration - 5, buf.duration))),
      tiltEarly: tilt(buf, 6, 16),
      tiltLate: tilt(buf, 66, 76),
      envCv: round(sd / (mean + 1e-30), 3),
      click: worstOf(ME.clicks(all, rate, onsets)),
    };
  }

  if (job.kind === 'held') {
    const aud: Audition = AU.heldAudition();
    const d = aud.drones[0];
    const { buf, facts } = await play(aud);
    const level = (from: number, to: number): number => db(rms(channels(buf, from, to)));
    const silent = d.release + facts.tails[0];
    return {
      rate, ms: Math.round(performance.now() - began),
      tail: facts.tails[0], controls: facts.controls[0],
      state: facts.states[0], disposed: facts.disposed![0],
      at: d.at, pause: d.pause, resume: d.resume, release: d.release, silentAt: round(silent, 3),
      // Four seconds a window, and that is a measurement too: the held
      // ensemble's two chorus taps wander at 0.21 and 0.29 Hz, so its own level
      // swings eight decibels between one second and the next and a short
      // window would be reading the comb rather than the drone. Over four
      // seconds the same stretch reads to within a fifth of a decibel of
      // itself in both engines, which is what makes "it came back at the level
      // it was holding at" a number and not an impression.
      holding: level(3, 7),
      paused: level(10.5, 11.5),
      resumed: level(13, 17),
      releasing: level(d.release, silent),
      afterTail: level(silent + 0.2, buf.duration),
      bad: notNumbers(channels(buf)),
      peak: db(ME.samplePeak(channels(buf))),
    };
  }

  // --- 5. what a start and a stop leave behind -------------------------------
  //
  // Ten cycles of the whole fixture on **one** live context, counting every
  // node, worklet and buffer each cycle makes. A cache that grows, a graph that
  // is never let go or a worklet left running shows up as a cycle that costs
  // more than the one before it; the first cycle costs more than the rest by
  // design, because that is when the noise, the rooms and the pick are rendered
  // into the buffers every cycle after it reuses.
  if (job.kind === 'ownership') {
    const aud: Audition = AU.droneAudition();
    const program = aud.program;
    const settings = program.settings;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    await MA.prepareLimiter(ctx, settings);

    const MADE = ['createGain', 'createBiquadFilter', 'createOscillator', 'createWaveShaper',
      'createDelay', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner',
      'createChannelSplitter', 'createChannelMerger', 'createBufferSource', 'createBuffer'];
    const made: Record<string, number> = {};
    const factories = ctx as unknown as NodeFactories;
    for (const k of MADE) {
      const real = factories[k].bind(ctx);
      made[k] = 0;
      factories[k] = (...a) => { made[k]++; return real(...a); };
    }
    let worklets = 0;
    const Worklet = window.AudioWorkletNode;
    if (Worklet) {
      window.AudioWorkletNode = class extends Worklet {
        constructor(...a: ConstructorParameters<typeof AudioWorkletNode>) { super(...a); worklets++; }
      };
    }
    const reset = () => { for (const k of MADE) made[k] = 0; worklets = 0; };

    const cycles: Cycle[] = [];
    for (let c = 0; c < job.cycles; c++) {
      reset();
      const master = G.makeV1Master(ctx, settings);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      master.out.connect(sink);
      sink.connect(ctx.destination);
      const sum = ctx.createGain();
      sum.connect(master.input);
      const clock = CK.makeSetClock(program.beat, ctx.currentTime);
      const track = { beat: program.beat, bpm: program.bpm, index: 0, trimDb: 0 };
      const deck = DK.makeDeck(ctx, track, program, sum, master, clock);
      await VO.prepareVoices(ctx, settings, program.events, { from: 0 });
      DK.startDeck(ctx, deck, ctx.currentTime + 0.05, 0);
      const held: HeldVoice[] = AU.startDrones(ctx, deck.graph, aud, deck.grid.at(0));
      // Eight seconds of it, scheduled: notes fired, drones holding, curves
      // written — and then the whole of it let go.
      DK.pumpDeck(ctx, deck, ctx.currentTime + 8);
      for (const h of held) h.dispose();
      DK.teardown(deck);
      master.dispose();
      try { sink.disconnect(); } catch (e) { /* already gone */ }
      cycles.push({
        nodes: MADE.reduce((n, k) => n + made[k], 0),
        buffers: made.createBuffer,
        oscillators: made.createOscillator,
        convolvers: made.createConvolver,
        worklets,
        fired: deck.index,
      });
    }
    if (Worklet) window.AudioWorkletNode = Worklet;
    const picks = VO.pickCacheSize(ctx);
    await ctx.close();
    return { rate: ctx.sampleRate, ms: Math.round(performance.now() - began), cycles, picks };
  }

  // A start that was superseded while it was still preparing: the graph is let
  // go before the preparation comes back, and the start goes on to fire its
  // events into it anyway. What has to be true is that not one sample of it
  // reaches the output — a superseded start leaves no live graph, whatever it
  // does next.
  if (job.kind === 'superseded') {
    const aud: Audition = AU.droneAudition();
    const program = aud.program;
    const settings = program.settings;
    const seconds = 8;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
    graph.out.connect(ctx.destination);
    const preparing = VO.prepareVoices(ctx, settings, program.events, { all: true });
    graph.dispose(); // superseded, while the preparation is still in the air
    await preparing;
    PL.scheduleAutomation(graph, program, 0);
    let fired = 0;
    for (const s of SC.schedule(program, SC.offsetGrid(0), 0, seconds).events) { PL.fireEvent(ctx, graph, program, s.pe, s.at); fired++; }
    const held: HeldVoice[] = AU.startDrones(ctx, graph, aud, 0);
    const buf = await ctx.startRendering();
    for (const h of held) h.dispose();
    const all = channels(buf);
    return {
      rate, ms: Math.round(performance.now() - began), fired, drones: held.length,
      peak: ME.samplePeak(all), bad: notNumbers(all),
      running: graph.nodes.keepAlive.length,
    };
  }

  // The live one: the drumless piece on a real deck, on the set's own clock,
  // pumped by the machine's own look-ahead — and the whole of it into a gain of
  // nought. The page is opened for this job alone, so the late count it reads
  // is this deck's and nobody else's: an offline render's clock starts at zero
  // and anything written at zero is behind its render head by construction.
  if (job.kind === 'live') {
    const aud: Audition = AU.droneAudition();
    const program = aud.program;
    const settings = program.settings;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    await MA.prepareLimiter(ctx, settings);
    const master = G.makeV1Master(ctx, settings);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    master.out.connect(sink);
    sink.connect(ctx.destination);
    const sum = ctx.createGain();
    sum.connect(master.input);
    const probe = ctx.createAnalyser();
    probe.fftSize = 2048;
    sum.connect(probe);
    // **Prepare first, and take the origin afterwards.** The clock's zero used
    // to be read before `prepareVoices` was awaited, so the first notes of the
    // set were scheduled against an instant that had already gone by the time
    // anything could play them — which is a fixture that only passes while the
    // preparation is fast enough. Round K4 made it show: with fifty-two voices
    // and twenty-six effects to parse and prepare, one to three notes came out
    // three to fourteen milliseconds late every run, on a suite that had been
    // green for two rounds. The lateness was real and the cause was this
    // ordering, not the instruments — nothing K4 added has a preparation hook
    // at all. A live set takes its origin after everything that can take time,
    // and so does this.
    await VO.prepareVoices(ctx, settings, program.events, { from: 0 });
    // **One instant, read once, and read after the preparation.** The clock's
    // origin and the deck's start used to be two different readings of
    // `currentTime` taken either side of an `await` — the grid began 150 ms
    // after one of them and the deck 200 ms after the other — so the first
    // notes of the set were scheduled against a moment that had partly gone by.
    // It only passed while the preparation was fast: round K4 made it show, with
    // one to four notes three to fourteen milliseconds late on a suite that had
    // been green for two rounds, and nothing this round added has a preparation
    // hook at all. A live set takes its origin once, after everything that can
    // take time, and hands the same number to the grid and to the deck.
    const origin = ctx.currentTime + 0.35;
    const clock = CK.makeSetClock(program.beat, origin);
    const track = { beat: program.beat, bpm: program.bpm, index: 0, trimDb: 0 };
    const deck = DK.makeDeck(ctx, track, program, sum, master, clock);
    DSP.noteTransportStart(ctx);
    DK.startDeck(ctx, deck, origin, 0);
    const held: HeldVoice[] = AU.startDrones(ctx, deck.graph, aud, deck.grid.at(0));
    const tick = () => DK.pumpDeck(ctx, deck, ctx.currentTime + CL.lookahead(ctx, 0));
    tick();
    const stop = CL.startClock(tick, CL.TICK_MS);
    const level = () => {
      const d = new Float32Array(probe.fftSize);
      probe.getFloatTimeDomainData(d);
      let s = 0;
      for (const v of d) s += v * v;
      return db(Math.sqrt(s / d.length));
    };
    const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
    const marks: Mark[] = [];
    for (const at of [4, 10, job.seconds - 1]) {
      await wait(at - (marks.length ? marks[marks.length - 1][0] : 0));
      marks.push([at, level()]);
    }
    stop();
    const out = {
      rate: ctx.sampleRate, ms: Math.round(performance.now() - began),
      seconds: job.seconds,
      late: DSP.lateInfo(),
      failed: deck.failed || 0,
      fired: deck.index,
      events: program.events.length,
      drones: held.length,
      states: held.map((h) => h.state),
      clock: CL.clockSource(),
      marks,
      sink: { gain: sink.gain.value, isGain: typeof GainNode === 'function' && sink instanceof GainNode },
      segments: clock.segments.length,
      themeSeconds: round(DK.deckThemeTime(deck, ctx.currentTime)),
    };
    for (const h of held) h.dispose();
    DK.teardown(deck);
    master.dispose();
    await ctx.close();
    return out;
  }
  // --- 6. the effects kitchen (round K1) ------------------------------------
  //
  // One effect, rendered against its own dry. Everything below is a comparison
  // and not an opinion: the same fixture played into a wire and into the effect,
  // in the same context at the same rate, so what a reading says is what the
  // effect did and not what the fixture is.
  //
  // The fixture is `tools/audition.ts`'s `effectAudition` — the sustained
  // ensemble for everything that colours or repeats a sound, the plucked line
  // for the drive family, which is where a shaper can be *heard* doing what it
  // does. There is no master in the chain on purpose: a limiter in front of a
  // measurement is a limiter measuring itself.
  if (job.kind === 'effect') {
    const d = FXR.BY_ID[job.id];
    const drive = d.family === 'drive';
    const aud: Audition = AU.effectAudition({ source: drive ? 'pluck' : 'strings' });
    const prog = aud.program;
    const settings = prog.settings;
    const beat = 60 / prog.bpm;
    const stop = aud.window.to;
    const declared = d.tail === 'none' ? 0 : d.tail.seconds;
    // Long enough for the tail at the defaults; the declared bound over the
    // whole range is proved by its own render below.
    const seconds = stop + Math.min(declared, 4) + 1;
    const onsets = prog.events.map((e) => e.t);

    const render = async (how: How | null = null, secs = seconds) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      let fx: FX.EffectInstance | null = null;
      let nodes = 0;
      if (how) {
        const counters = ['createGain', 'createBiquadFilter', 'createOscillator', 'createWaveShaper',
          'createDelay', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner',
          'createChannelSplitter', 'createChannelMerger', 'createBufferSource'];
        const real: NodeFactories = {};
        const factories = ctx as unknown as NodeFactories;
        for (const k of counters) {
          real[k] = factories[k].bind(ctx);
          factories[k] = (...a) => { nodes++; return real[k](...a); };
        }
        fx = FXR.makeEffect(job.id, ctx, settings, { beat, ...(how.params || {}) }) as FX.EffectInstance;
        for (const k of counters) factories[k] = real[k];
        fx.output.connect(out);
        if (how.then) how.then(fx);
      }
      AU.playAudition(ctx, aud, { dry: fx ? fx.input : out });
      const buf = await ctx.startRendering();
      return { buf, nodes, fx };
    };

    // Four renders of the same music: a wire, the effect at its defaults, the
    // effect bypassed, and the effect with its mix at nought.
    const dry = await render(null);
    const wet = await render({});
    const off = await render({ then: (fx) => fx.setBypass(true, 0) });
    const zero = await render({ params: { mix: 0 } });
    // The control: the same fixture through one unity gain and nothing else.
    // Whatever this reads is what a wire costs in this engine, and it is what
    // the two identities are held to rather than to a nought this machine's
    // floating point cannot promise.
    const wire = await (async () => {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      const through = ctx.createGain();
      through.gain.value = 1;
      through.connect(out);
      AU.playAudition(ctx, aud, { dry: through });
      return ctx.startRendering();
    })();

    const apart = (a: AudioBuffer, b: AudioBuffer, from = 0): Apart => {
      const i0 = Math.round(from * rate);
      let worst = 0;
      let at = 0;
      for (let c = 0; c < 2; c++) {
        const A = a.getChannelData(c);
        const B = b.getChannelData(c);
        for (let i = i0; i < A.length; i++) {
          const dd = Math.abs(A[i] - B[i]);
          if (dd > worst) { worst = dd; at = i / rate; }
        }
      }
      return { worst, at: round(at, 3) };
    };
    // Where the wet sits against the dry, in samples: positive is later. A
    // memoryless shaper is at nought and an up-sampler is not, which is the
    // whole reason `latency` is a declared field.
    const lagOf = (a: AudioBuffer, b: AudioBuffer, from: number, span: number, max = 320): number => {
      const A = a.getChannelData(0);
      const B = b.getChannelData(0);
      const i0 = Math.round(from * rate);
      const n = Math.min(Math.round(span * rate), A.length - i0 - max - 1);
      let best = 0;
      let top = -Infinity;
      for (let l = -max; l <= max; l++) {
        let acc = 0;
        for (let i = 0; i < n; i++) acc += A[i0 + i] * B[i0 + i + l];
        if (acc > top) { top = acc; best = l; }
      }
      return best;
    };

    const body = db(rms(channels(wet.buf, Math.max(0, stop - 4), stop)));
    const all = channels(wet.buf);
    // The tail at the defaults: what is left a declared tail after the input
    // stopped, against what the piece itself was doing.
    const afterTail = db(rms(channels(wet.buf, Math.min(seconds - 0.3, stop + Math.min(declared, 4)), seconds)));

    // The declared bound, over the whole range: the same effect with its
    // feedback wide open, rendered for its whole stated tail.
    let worstCase = null;
    if ('feedback' in d.params) {
      const hot: Record<string, number> = { feedback: d.params.feedback.max };
      if ('timeSeconds' in d.params) hot.timeSeconds = d.params.timeSeconds.max;
      if ('timeBeats' in d.params) hot.timeBeats = 0;
      const secs = stop + declared + 1;
      const r = await render({ params: hot }, secs);
      worstCase = {
        params: hot,
        after: db(rms(channels(r.buf, stop + declared, secs))),
        halfWay: db(rms(channels(r.buf, stop + declared / 2, stop + declared / 2 + 0.5))),
        body: db(rms(channels(r.buf, Math.max(0, stop - 4), stop))),
        bad: notNumbers(channels(r.buf)),
        peak: db(ME.samplePeak(channels(r.buf))),
      };
    }

    // Letting it go **at the moment its input stops**: the tail has to finish
    // anyway. Same render, same numbers, or the policy is a sentence and not a
    // behaviour.
    const let_go = await render({ then: (fx) => fx.dispose(stop) });

    return {
      rate, ms: Math.round(performance.now() - began),
      id: job.id, source: drive ? 'pluck' : 'strings', notes: prog.events.length,
      nodes: wet.nodes,
      declaredCost: d.cost, declaredTail: declared, declaredLatency: d.latency,
      oversample: d.oversample || null,
      params: Object.keys(FXR.BY_ID[job.id].params),
      exposed: Object.keys(wet.fx!.params),
      kinds: Object.entries(wet.fx!.params).map(([k, v]) => `${k}:${typeof v === 'function' ? 'setter' : 'param'}`),
      bad: notNumbers(all),
      dryPeak: db(ME.samplePeak(channels(dry.buf))),
      peak: db(ME.samplePeak(all)),
      truePeak: ME.truePeak(all),
      body,
      afterTail,
      tailFloor: round(afterTail - body),
      click: worstOf(ME.clicks(all, rate, onsets)),
      dryClick: worstOf(ME.clicks(channels(dry.buf), rate, onsets)),
      // The two identities, both to the sample. The bypass is read from a
      // fiftieth of a second in, because a bypass is a crossfade of the
      // engine's own minimum length and the first four milliseconds of it are
      // the crossfade.
      bypassApart: apart(dry.buf, off.buf, 0.05),
      mixZeroApart: apart(dry.buf, zero.buf, 0),
      wireApart: apart(dry.buf, wire, 0),
      lag: lagOf(dry.buf, wet.buf, Math.max(0.5, stop / 3), 0.5),
      disposed: {
        tail: db(rms(channels(let_go.buf, stop, seconds))),
        against: db(rms(channels(wet.buf, stop, seconds))),
        bad: notNumbers(channels(let_go.buf)),
      },
      worstCase,
    };
  }

  // --- the drive family's harmonics, and what an up-sampler does to them ----
  //
  // Round G's finding, asked of the kitchen's own two curves: *an oversampled
  // shaper is the one thing in this voice the two browsers do not agree about.*
  // So both curves are measured at all three settings in both engines, on three
  // signals — a low sine for the harmonic series, a high one for what folds back
  // when the harmonics run past Nyquist, and noise for the latency the
  // up-sampler costs.
  if (job.kind === 'oversample') {
    // One magnitude at one frequency, windowed. Blackman-Harris, because the
    // numbers being read are sixty decibels down and a Hann's sidelobes are
    // not.
    const magAt = (x: Float32Array, f: number, from: number, n: number): number => {
      const i0 = Math.round(from * rate);
      let re = 0;
      let im = 0;
      let norm = 0;
      for (let i = 0; i < n; i++) {
        const t = (2 * Math.PI * i) / (n - 1);
        const w = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
        const a = (2 * Math.PI * f * i) / rate;
        re += x[i0 + i] * w * Math.cos(a);
        im -= x[i0 + i] * w * Math.sin(a);
        norm += w;
      }
      return (2 * Math.sqrt(re * re + im * im)) / norm;
    };
    const run = async (curve: string, over: OverSampleType, kind: number | 'noise'): Promise<Float32Array> => {
      const secs = 1;
      const ctx = new OfflineAudioContext(1, Math.ceil(secs * rate), rate);
      const shaper = ctx.createWaveShaper();
      shaper.curve = curve === 'overdrive' ? CV.overdriveCurve(3, 0.3) : CV.distortionCurve(0.2, 0.25);
      shaper.oversample = over;
      const gain = ctx.createGain();
      gain.gain.value = job.drive;
      gain.connect(shaper);
      shaper.connect(ctx.destination);
      let src;
      if (kind === 'noise') {
        src = DSP.noiseSource(ctx, 0, secs);
        gain.gain.value = 0.2; // under the knee: what is being read is time, not shape
      } else {
        src = ctx.createOscillator();
        src.type = 'sine';
        src.frequency.value = kind;
        src.start(0);
        src.stop(secs);
      }
      src.connect(gain);
      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    };
    const dryRef: Record<string, Float32Array> = {};
    for (const kind of ['noise']) {
      const ctx = new OfflineAudioContext(1, Math.ceil(1 * rate), rate);
      const g = ctx.createGain();
      g.gain.value = 0.2;
      DSP.noiseSource(ctx, 0, 1).connect(g);
      g.connect(ctx.destination);
      dryRef[kind] = (await ctx.startRendering()).getChannelData(0);
    }
    const lagOf1 = (A: Float32Array, B: Float32Array, from: number, span: number, max = 512): number => {
      const i0 = Math.round(from * rate);
      const n = Math.round(span * rate);
      let best = 0;
      let top = -Infinity;
      for (let l = -max; l <= max; l++) {
        let acc = 0;
        for (let i = 0; i < n; i++) acc += A[i0 + i] * B[i0 + i + l];
        if (acc > top) { top = acc; best = l; }
      }
      return best;
    };
    const N = 1 << 14;
    const out: Record<string, OversampleReading> = {};
    for (const curve of ['overdrive', 'distortion']) {
      for (const over of ['none', '2x', '4x'] as const) {
        const low = await run(curve, over, job.low);
        const high = await run(curve, over, job.high);
        const noise = await run(curve, over, 'noise');
        const h = [];
        const f1 = magAt(low, job.low, 0.2, N);
        for (let k = 2; k <= 8; k++) h.push(round(20 * Math.log10(magAt(low, job.low * k, 0.2, N) / (f1 + 1e-30))));
        // What folds back: every harmonic of the high sine that runs past
        // Nyquist, reflected, and measured where it lands.
        const folds = [];
        for (let k = 2; k * job.high < rate * 2.5; k++) {
          let f = k * job.high;
          while (f > rate / 2) f = Math.abs(rate - f);
          if (k * job.high > rate / 2 && f > 100 && f < rate / 2 - 100) folds.push(f);
        }
        const hi1 = magAt(high, job.high, 0.2, N);
        const alias = folds.reduce((a, f) => a + magAt(high, f, 0.2, N) ** 2, 0);
        let sum = 0;
        for (let i = 0; i < low.length; i++) sum += low[i] * low[i];
        out[`${curve}:${over}`] = {
          harmonics: h,
          aliasDb: round(10 * Math.log10(alias / (hi1 * hi1 + 1e-30))),
          folds: folds.length,
          rmsDb: round(20 * Math.log10(Math.sqrt(sum / low.length) + 1e-30)),
          latency: lagOf1(dryRef.noise, noise, 0.3, 0.3),
        };
      }
    }
    return { rate, ms: Math.round(performance.now() - began), drive: job.drive, low: job.low, high: job.high, out };
  }

  // --- what each of them costs ----------------------------------------------
  //
  // Not guessed: the same fixture rendered through a wire and through each
  // effect, three times each, fastest taken — a render time is a noisy thing on
  // a machine somebody is working on, and the fastest of three is the one with
  // the least of somebody else's work in it.
  if (job.kind === 'cost') {
    // The source is **one node**: twenty seconds of the engine's own noise
    // buffer, looping. The first attempt at this measured the effects against
    // the voice fixture and every one of them came out at 1.0x — because what
    // that renders is eight ensemble notes building a hundred nodes between
    // them, and an effect is a rounding error beside it. A cost class is about
    // what the effect costs, so the thing it is measured against has to be as
    // close to nothing as a source can be.
    const settings = AU.effectAudition().program.settings;
    const beat = 0.5;
    // A minute of it, because a render this cheap is otherwise measured
    // against a clock: Firefox reports whole milliseconds and twenty seconds of
    // noise through a wire took one of them, which makes every ratio a division
    // by the timer's own resolution.
    const secs = 60;
    const once = async (id: string | null) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      let nodes = 0;
      let fx: FX.EffectInstance | null = null;
      if (id) {
        const counters = ['createGain', 'createBiquadFilter', 'createOscillator', 'createWaveShaper',
          'createDelay', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner',
          'createChannelSplitter', 'createChannelMerger', 'createBufferSource'];
        const real: NodeFactories = {};
        const factories = ctx as unknown as NodeFactories;
        for (const k of counters) {
          real[k] = factories[k].bind(ctx);
          factories[k] = (...a) => { nodes++; return real[k](...a); };
        }
        fx = FXR.makeEffect(id, ctx, settings, { beat }) as FX.EffectInstance;
        for (const k of counters) factories[k] = real[k];
        fx.output.connect(out);
      }
      const src = DSP.noiseSource(ctx, 0, secs);
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(g);
      g.connect(fx ? fx.input : out);
      const t0 = performance.now();
      await ctx.startRendering();
      return { ms: performance.now() - t0, nodes };
    };
    const fastest = async (id: string | null) => {
      let best = Infinity;
      let nodes = 0;
      for (let i = 0; i < 3; i++) {
        const r = await once(id);
        best = Math.min(best, r.ms);
        nodes = r.nodes;
      }
      return { ms: best, nodes };
    };
    const wire = await fastest(null);
    const rows: CostRow[] = [];
    for (const id of (job.ids || FXR.EFFECTS)) {
      const r = await fastest(id);
      rows.push({
        id,
        cost: FXR.EFFECT_COST[id],
        nodes: r.nodes,
        ms: round(r.ms, 1),
        // Against the dry chain, which is what PLAN-KITCHEN asks for...
        ratio: round(r.ms / wire.ms, 2),
      });
    }
    // ...and against **one named effect**, which is what the class is read off,
    // because the dry chain's own cost is three times as much in one engine as
    // in the other and the class is meant to be about the effect. Round K1
    // divided by the cheapest of the six; round K4 found that a denominator
    // which moves when the kitchen grows re-classifies effects nobody touched,
    // so it is `COST_REFERENCE` — the overdrive, which was that cheapest and
    // still reads 1.00.
    const ref = rows.find((x) => x.id === FXR.COST_REFERENCE) || { ms: Math.min(...rows.map((x) => x.ms)) };
    for (const row of rows) row.relative = round(row.ms / ref.ms, 2);
    return { rate, ms: Math.round(performance.now() - began), seconds: round(secs), wireNodes: wire.nodes, wire: round(wire.ms, 1), rows };
  }

  return { error: `no job called ${(job as Job).kind}` };
};

/**
 * What each engine said about the kitchen, so the two can be held to each
 * other once both have run. Only what outlives an engine's own loop is written
 * down: the three distances the identity is read in, and the shaper's whole
 * table. Everything else a job hands back is asserted where it is read.
 */
interface KitchenReadings {
  effects: Record<string, { bypassApart: Apart; mixZeroApart: Apart; wireApart: Apart }>;
  /** kept for the record and read by nothing */
  cost: unknown;
  oversample: OversampleRun | null;
}
const kitchen: Record<string, KitchenReadings> = {};

if (pw) {
  // Both engines at once, each in a browser of its own, and inside each the
  // offline jobs handed to one pool the moment the engine starts; the timed
  // ones — the live deck and the kitchen's cost — wait for the pool to empty
  // and run one at a time (`lanes.ts`). Each engine's lines are kept and
  // printed whole, chromium's first, which is the order `--jobs 1` prints.
  const browsers: Record<string, PlaywrightThing> = {};
  for (const engine of ['chromium', 'firefox']) {
    if (!pw.pw[engine]) { skipped.push(`the auditions in ${engine}: playwright does not know it`); continue; }
    try {
      browsers[engine] = await pw.pw[engine].launch(launchOptions(engine));
    } catch (e) {
      skipped.push(`the auditions in ${engine}: it is not installed (${(e as Error).message.split('\n')[0].slice(0, 60)})`);
      continue;
    }
    renice(browsers[engine]);
  }
  const pool = lanes(JOBS, Object.keys(browsers));
  const inEngine = async (engine: string): Promise<void> => {
    const browser = browsers[engine];
    say(`  ${engine}`);
    const run = async (job: Job) => {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(e.message));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      const out = await page.evaluate(RUN, { ...job, base: BASE });
      await page.close();
      // `--verbose` prints the whole reading. A gate says pass or fail and a
      // reading says what the number actually was, which is what a round's
      // write-up is made of and what re-blessing a declared number needs.
      if (VERBOSE) say(`        ${job.kind}${job.rate ? `@${job.rate}` : ''} ${JSON.stringify(out)}`);
      if (errors.length) bad(`${job.kind} in ${engine}: the page threw: ${errors.join(' | ')}`);
      return out;
    };

    // Every offline job this engine will ask for, handed to the pool now, so
    // the assertions below read them in their own order whatever order they
    // finish in. The two timed ones are not here: they run `alone`.
    const OFFLINE: Job[] = [
      { kind: 'pluck', rate: 44100 }, { kind: 'pluck', rate: 48000 }, { kind: 'drone' }, { kind: 'held' },
      { kind: 'ownership', cycles: 10 }, { kind: 'superseded' },
      ...FX.REGISTRY.filter((x) => K1.includes(x.id)).map((d) => ({ kind: 'effect', id: d.id }) as Job),
      { kind: 'oversample', drive: 4, low: 220, high: 4186 },
    ];
    const ahead = new Map<string, Promise<any>>();
    for (const job of OFFLINE) ahead.set(JSON.stringify(job), pool.run(() => run(job)));
    pool.done(engine);
    const offline = (job: Job) => {
      const got = ahead.get(JSON.stringify(job));
      if (!got) throw new Error(`${job.kind} was not handed to the pool`);
      return got;
    };
    const timed = (job: Job) => pool.alone(() => run(job));

    // G1: the new instrument, alone, at both rates.
    for (const rate of [44100, 48000]) {
      const r = await offline({ kind: 'pluck', rate });
      const off = Math.abs(r.loudnessDb - r.declared);
      must(
        r.bad === 0 && r.notes === r.hits + 10 && off <= GATES.loudnessBandDb &&
          r.mono <= GATES.monoTolerance && r.truePeak <= GATES.truePeakDbTP && r.peak <= GATES.samplePeakDbFS &&
          !(r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio) && r.duck === 1,
        `the plucked mid bass at ${rate}: ${r.bad ? `${r.bad} samples that are not numbers` : ''}${off > GATES.loudnessBandDb ? `${r.loudnessDb} dB against the declared ${r.declared}` : ''}${r.mono > GATES.monoTolerance ? `the channels differ by ${r.mono}` : ''}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS` : ''}${r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s` : ''}`,
        `the plucked mid bass alone at ${rate / 1000} kHz: ${r.hits} notes over eight bars at ${r.loudnessDb} dB (declared ${r.declared}, ${off.toFixed(2)} off), mono to ${r.mono}, ${r.truePeak} dBTP / ${r.peak} dBFS, worst click ${r.click.step} at ${r.click.ratio}x, no sidechain written (${r.ms} ms)`
      );
    }

    // G2a: the drumless piece, offline.
    {
      const r = await offline({ kind: 'drone' });
      const drums = r.voices.filter((v: string) => ['kick', 'hatClosed', 'hatOpen', 'shaker', 'clap'].includes(v));
      const flat = r.duck === 1 && r.duckLow === 1 && r.melodic === 1 && r.duckPoints === 0 && r.duckingEvents === 0;
      const opened = r.tiltLate > r.tiltEarly + 6;
      must(
        r.bad === 0 && !drums.length && flat && opened && r.truePeak <= GATES.truePeakDbTP &&
          r.peak <= GATES.samplePeakDbFS && r.tail5 > -70 && r.tail5 < r.body &&
          !(r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio) &&
          r.states.every((s: string) => s === 'released') && r.disposed.every((s: string) => s === 'gone'),
        `the drumless audition: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${drums.length ? `it plays ${drums.join(', ')}; ` : ''}${flat ? '' : `the sidechain moved (duck ${r.duck}, duckLow ${r.duckLow}, melodic ${r.melodic}, ${r.duckPoints} duck points, ${r.duckingEvents} events posting one); `}${opened ? '' : `the filter did not open (${r.tiltEarly} dB of top early against ${r.tiltLate} late); `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.tail5 > -70 ? '' : `nothing is left in the last five seconds (${r.tail5} dB); `}${r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio ? `a click of ${r.click.step} at ${r.click.ratio}x at ${r.click.t} s` : ''}`,
        `a drumless sustained piece, ${r.duration} s of it: ${r.notes} notes of ${r.voices.join(' and ')} and ${r.drones} held ensembles (tails ${r.tails.join(', ')} s), no kick and no sidechain anywhere (${r.duckPoints} duck points, the duck at ${r.duck} and the melodic bus at ${r.melodic}), ${r.automation.join(', ')} opened the record from ${r.tiltEarly} to ${r.tiltLate} dB of top, ${r.truePeak} dBTP / ${r.peak} dBFS, the envelope steady to ${r.envCv} cv, and ${r.tail5} dB still in the room five seconds after the last note at ${r.lastNote} s (${r.ms} ms)`
      );
    }

    // G3: a held voice paused, resumed and released over its stated tail.
    {
      const r = await offline({ kind: 'held' });
      const back = Math.abs(r.resumed - r.holding);
      must(
        r.bad === 0 && r.paused < r.holding - 40 && back <= 0.5 && r.afterTail < -80 &&
          r.state === 'released' && r.disposed === 'gone' && r.controls.length === 2,
        `the held voice: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${r.paused < r.holding - 40 ? '' : `a pause left ${r.paused} dB where it was holding at ${r.holding}; `}${back <= 0.5 ? '' : `it came back at ${r.resumed} dB where it was holding at ${r.holding}; `}${r.afterTail < -80 ? '' : `${r.afterTail} dB is still sounding after its stated tail; `}${r.state === 'released' ? '' : `it says it is ${r.state}`}`,
        `a drone held, paused and brought back: ${r.holding} dB holding, ${r.paused} dB paused at ${r.pause} s, ${r.resumed} dB after ${r.resume} s (${back.toFixed(2)} dB of it), released at ${r.release} s over its stated ${r.tail} s tail and silent at ${r.silentAt} s (${r.afterTail} dB after it), then disposed (${r.ms} ms)`
      );
    }

    // G4: ten cycles, and a superseded start.
    {
      const r = await offline({ kind: 'ownership', cycles: 10 });
      const settled = r.cycles.slice(1);
      const same = (k: keyof Cycle) => settled.every((c: Cycle) => c[k] === settled[0][k]);
      // What is asserted is the *plateau*, not a particular number: a cycle
      // costs what the cycle before it cost, the caches fill once and are never
      // filled again, and the pick is still one buffer at the tenth. The
      // worklet is counted and held to being the same every cycle rather than
      // to being one, because a context that could not load it builds a gain
      // instead and that is a fallback and not a leak.
      must(
        same('nodes') && same('worklets') && same('buffers') && same('fired') &&
          settled[0].buffers === 0 && r.cycles[0].buffers > 0 && r.picks === 1,
        `ten cycles do not plateau: nodes ${r.cycles.map((c: Cycle) => c.nodes).join(', ')}; buffers ${r.cycles.map((c: Cycle) => c.buffers).join(', ')}; worklets ${r.cycles.map((c: Cycle) => c.worklets).join(', ')}; ${r.picks} pick buffers held`,
        `ten starts and stops of the fixture on one context: ${r.cycles[0].nodes} nodes and ${r.cycles[0].buffers} buffers the first time, then ${settled[0].nodes} nodes and ${settled[0].buffers} buffers every time after it — ${settled[0].worklets} worklet a cycle, ${settled[0].fired} events a cycle, and the pick still one buffer at the tenth (${r.ms} ms)`
      );
    }
    {
      const r = await offline({ kind: 'superseded' });
      must(
        r.peak === 0 && r.bad === 0 && r.fired > 0 && r.drones > 0,
        `a superseded start reached the output: ${r.fired} events and ${r.drones} drones rendered to a peak of ${r.peak}`,
        `a start superseded while it was still preparing: its ${r.fired} events and ${r.drones} drones were fired into the graph it had been given and the render is digital silence, to the sample`
      );
    }

    // G2b: the same piece, live, through a real deck on the set's own clock.
    {
      const seconds = 20;
      const r = await timed({ kind: 'live', seconds });
      const sounding = r.marks.every(([, level]: Mark) => level > -60);
      must(
        r.late.count === 0 && !r.failed && r.fired > 0 && sounding &&
          r.sink.gain === 0 && r.sink.isGain && r.states.every((s: string) => s === 'released' || s === 'holding'),
        `the live audition in ${engine}: ${r.late.count} notes late (last ${r.late.last} s, ${r.late.cause || 'no cause'}), ${r.failed} events failed, ${r.fired} of ${r.events} fired, levels ${r.marks.map((m: Mark) => m.join('@')).join(' ')}`,
        `${seconds} s of the drumless piece live in ${engine}, on a real deck on the set's clock into a gain of nought: ${r.fired} of ${r.events} events fired and ${r.drones} drones holding, the late counter at ${r.late.count}, the mix at ${r.marks.map(([t, l]: Mark) => `${l} dB at ${t} s`).join(', ')}, the clock on the ${r.clock} (${r.ms} ms)`
      );
    }

    // K1: the six effects, each against its own dry. **Six and not all of
    // them**: round K4 built the other twenty and they have a gate of their own
    // (`tools/test-effects-2.ts`) with exactly these assertions in it, and the
    // two are held to covering the registry between them a few lines above.
    // This file is the machine's whole suite and a round's twenty modules do
    // not belong inside it — round K2 drew that line for voices and this is the
    // same one.
    kitchen[engine] = { effects: {}, cost: null, oversample: null };
    for (const d of FX.REGISTRY.filter((x) => K1.includes(x.id))) {
      const r = await offline({ kind: 'effect', id: d.id });
      kitchen[engine].effects[d.id] = r;
      const wantLag = r.declaredLatency === 'none' ? 0 : Math.round(r.declaredLatency.seconds * r.rate);
      const lagOff = (Math.abs(r.lag - wantLag) / r.rate) * 1000;
      const clicked = r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio;
      const tailOk = r.tailFloor <= KITCHEN.tailFloorDb;
      const worstOk = !r.worstCase || r.worstCase.after - r.worstCase.body <= KITCHEN.tailFloorDb;
      const keptTail = Math.abs(r.disposed.tail - r.disposed.against) <= KITCHEN.disposeDb;
      const declaredNodes = FX.COST_BANDS[r.declaredCost as FX.EffectCost].nodes;
      const exposed = r.exposed.slice().sort().join(' ') === r.params.slice().sort().join(' ');
      must(
        r.bad === 0 && exposed && r.truePeak <= GATES.truePeakDbTP && r.peak <= GATES.samplePeakDbFS &&
          !clicked && r.bypassApart.worst <= KITCHEN.identity && r.mixZeroApart.worst <= KITCHEN.identity &&
          lagOff <= KITCHEN.latencyMs && tailOk && worstOk && keptTail && r.nodes <= declaredNodes,
        `${r.id}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${exposed ? '' : `it declares ${r.params.join(', ')} and exposes ${r.exposed.join(', ')}; `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS; ` : ''}${clicked ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s; ` : ''}${r.bypassApart.worst > KITCHEN.identity ? `bypassed it is ${r.bypassApart.worst} away from its own input at ${r.bypassApart.at} s, where a bare wire is ${r.wireApart.worst} away; ` : ''}${r.mixZeroApart.worst > KITCHEN.identity ? `at a mix of nought it is ${r.mixZeroApart.worst} away from its own input at ${r.mixZeroApart.at} s; ` : ''}${lagOff > KITCHEN.latencyMs ? `it declares ${JSON.stringify(r.declaredLatency)} of latency and measures ${r.lag} samples, which is ${round(lagOff, 3)} ms; ` : ''}${tailOk ? '' : `${r.tailFloor} dB is still sounding a declared tail (${r.declaredTail} s) after the input stopped; `}${worstOk ? '' : `at ${JSON.stringify(r.worstCase && r.worstCase.params)} the tail is still at ${r.worstCase && round(r.worstCase.after - r.worstCase.body)} dB after its declared ${r.declaredTail} s; `}${keptTail ? '' : `let go at the instant its input stopped, its tail lost ${round(r.disposed.against - r.disposed.tail)} dB; `}${r.nodes > declaredNodes ? `it declares ${r.declaredCost} and makes ${r.nodes} nodes` : ''}`,
        `${r.id} through ${r.notes} notes of the ${r.source} fixture: ${r.nodes} nodes, ${r.exposed.length} knobs (${r.kinds.join(', ')}), ${r.peak} dBFS / ${r.truePeak} dBTP against the dry's ${r.dryPeak}, worst click ${r.click.step} at ${r.click.ratio}x (the dry's own is ${r.dryClick.step}), **bypassed and at a mix of nought it is its own input** (${r.bypassApart.worst} and ${r.mixZeroApart.worst} apart, where a bare wire in this engine is ${r.wireApart.worst}), ${r.lag} samples of lag against a declared ${JSON.stringify(r.declaredLatency)}, ${r.tailFloor} dB left ${r.declaredTail ? `${r.declaredTail} s` : 'the moment'} after the input stopped${r.worstCase ? `, ${round(r.worstCase.after - r.worstCase.body)} dB after the declared tail at its hottest (${JSON.stringify(r.worstCase.params)})` : ''}, and letting it go at that instant kept it within ${round(Math.abs(r.disposed.tail - r.disposed.against), 2)} dB (${r.ms} ms)`
      );
    }

    // What each of them costs, measured against a wire.
    {
      const r = await timed({ kind: 'cost', ids: K1 });
      kitchen[engine].cost = r;
      const over = r.rows.filter((row: Required<CostRow>) => row.relative > FX.COST_BANDS[row.cost].relative || row.nodes > FX.COST_BANDS[row.cost].nodes);
      must(
        !over.length,
        `${over.length} effects cost more than the class they declare: ${over.map((x: Required<CostRow>) => `${x.id} is ${x.cost} and renders at ${x.relative}x the cheapest of them in ${x.nodes} nodes`).join('; ')}`,
        `what the kitchen costs, ${r.seconds} s of looping noise through a wire in ${r.wire} ms: ${r.rows.map((x: Required<CostRow>) => `${x.id} ${x.ms} ms — ${x.ratio}x the wire, ${x.relative}x the cheapest — in ${x.nodes} nodes (${x.cost})`).join(', ')} — ${r.ms} ms in all`
      );
    }

    // The drive family's harmonics, and what each engine's up-sampler does.
    {
      const r = await offline({ kind: 'oversample', drive: 4, low: 220, high: 4186 });
      kitchen[engine].oversample = r;
      const rows = Object.entries<OversampleReading>(r.out);
      const declared = FX.REGISTRY.filter((d) => d.oversample).map((d) => `${d.id}:${d.oversample}`);
      const finite = rows.every(([, v]) => v.harmonics.every(Number.isFinite) && Number.isFinite(v.aliasDb));
      const none = rows.filter(([k]) => k.endsWith(':none'));
      must(
        finite && none.every(([, v]) => (Math.abs(v.latency) / r.rate) * 1000 <= KITCHEN.latencyMs),
        `the shaper measurement came back ${finite ? `with ${none.map(([k, v]) => `${k} at ${v.latency} samples`).join(', ')}` : 'with readings that are not numbers'}`,
        `the two curves at a drive of ${r.drive}, on a ${r.low} Hz sine and a ${r.high} Hz one: ${rows.map(([k, v]) => `${k} — 2nd to 8th at ${v.harmonics.slice(0, 3).join('/')}… dB, fold-back ${v.aliasDb} dB over ${v.folds} partials, ${v.rmsDb} dB, ${v.latency} samples`).join('; ')} (declared ${declared.join(', ')})`
      );
    }
  };
  const engines = await Promise.all(Object.keys(browsers).map((engine) => captured(() => inEngine(engine))));
  for (const { lines } of engines) for (const line of lines) console.log(line);
  for (const browser of Object.values(browsers)) await browser.close();
}

// What the two engines say about the same shaper, which is round G's finding
// asked again of the kitchen's own curves: at `none` they agree to a fraction
// of a decibel, and an up-sampler is where they part company. The declared
// setting is chosen off this table, and the numbers are in notes/archive/2026-09-kitchen/rounds/k1.md.
if (kitchen.chromium && kitchen.firefox && kitchen.chromium.oversample && kitchen.firefox.oversample) {
  const C = kitchen.chromium.oversample.out;
  const F = kitchen.firefox.oversample.out;
  const gap = (k: string): number => +Math.abs(C[k].rmsDb - F[k].rmsDb).toFixed(2);
  const keys = Object.keys(C);
  const atNone = keys.filter((k) => k.endsWith(':none'));
  const worstNone = Math.max(...atNone.map(gap));
  const table = keys.map((k) => `${k} ${C[k].rmsDb}/${F[k].rmsDb} dB (${gap(k)} apart, ${C[k].latency}/${F[k].latency} samples)`);
  must(
    worstNone <= KITCHEN.engineAgreeDb,
    `the two engines are ${worstNone} dB apart on a shaper that does not oversample: ${table.join('; ')}`,
    `the same two curves in both engines: at the declared setting they are ${worstNone} dB apart, and the up-samplers are where they part — ${table.join('; ')}`
  );
  // The identity is the identity in both of them, and that is worth saying
  // once for the whole kitchen rather than six times per engine.
  const ids = Object.keys(kitchen.chromium.effects);
  const worstApart = Math.max(...ids.flatMap((id) => [
    kitchen.chromium.effects[id].bypassApart.worst, kitchen.firefox.effects[id].bypassApart.worst,
    kitchen.chromium.effects[id].mixZeroApart.worst, kitchen.firefox.effects[id].mixZeroApart.worst,
  ]));
  must(
    worstApart <= KITCHEN.identity,
    `an effect is ${worstApart} away from its own input where it promised to be it`,
    `${ids.length} effects bypassed and at a mix of nought, in two engines: every one of the ${ids.length * 4} renders is its own dry to within what a bare unity gain costs there — ${Math.max(...ids.map((id) => kitchen.firefox.effects[id].bypassApart.worst))} in firefox, ${Math.max(...ids.map((id) => kitchen.chromium.effects[id].bypassApart.worst))} in chromium, against the ${Math.max(...ids.map((id) => kitchen.chromium.effects[id].wireApart.worst))} a wire costs there`
  );
}

server.close();

finish({ failed, skipped });
