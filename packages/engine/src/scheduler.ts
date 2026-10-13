// One event of a program into a graph, the automation that goes with it, and a
// program poured into an OfflineAudioContext for the render. One code path
// decides what a sound is, wherever it is being made.
//
// Which events sound between here and there is not decided here: since round E
// of PLAN-V1-NEXT it is `schedule(program, grid, from, to)` in src/schedule.ts,
// the same call the set's decks make, over a grid that for one theme on its own
// is an offset and nothing else. So the render below and a deck in a set cannot
// drift apart about what is in a window.
//
// This was *a look-ahead scheduler for one theme* as well until round K6 took
// `Player` out; the note where it stood says why and where it is.

import { VOICES, edgeReads, prepareVoices, returnsOf, strikes } from './voices/index.ts';
import { scheduleLine, writeDuck, prepareLimiter } from './master.ts';
import { makeV1Graph } from './graph.ts';
import { resolveStart, Offline, withEcho, withPartSpace, withReturns, withMotion } from './dsp.ts';
import { noteDoor, playScoped } from './note-scope.ts';
import { schedule, offsetGrid } from './schedule.ts';
import type { V1Graph } from './graph.ts';
import type { Program, ProgramEvent } from './program.ts';
import { duckFor } from './program.ts';
import type { SourceMix } from './source-mix.ts';

// One event of a program, into a graph. Everything that used to be worked out
// here — the bus, the level table's say on the gain, whether this is a voice
// that posts a sidechain — was worked out by the compiler, so what is left is
// the one thing that belongs to the moment: where the onset lands on this
// context's clock.
//
// `p` is the program's own object and is frozen. Nothing a voice does writes
// to it, which is why it can be handed over rather than copied for every note.
/**
 * @param at where the schedule put this event's onset, in context time
 */
export function fireEvent(ctx: BaseAudioContext, graph: V1Graph, program: Program, pe: ProgramEvent, at: number): void {
  const voice = VOICES[pe.voice];
  // A program event naming no registered voice used to be a silent skip: the
  // lane simply did not sound, `deck.failed` did not move, and a strategy or
  // registry skew dropped a part with no line anywhere. The pump
  // counts a throw and says so three times; a render of such a program fails.
  if (!voice) throw new Error(`no registered voice called ${pe.voice} (event ${pe.i})`);
  // One resolution of the onset, used for the sound and for the automation
  // that belongs to it. The voice's own guard sees a time that is already at
  // or past the render head and leaves it alone, so after a stall the duck
  // moves with its kick instead of ducking the bar before it.
  const when = resolveStart(ctx, at);
  // The event's own theme time, for a voice whose dice are off the strike
  // (R74): the context's clock differs live, rendered and sliced, and a seek
  // moves it; the theme's does not.
  // A struck note takes its bus's struck door, and so the shallow duck (round
  // PIANO-2); the descriptor says which notes are struck (`strikes`). A note
  // the bus's edge may not read takes that path's clean door (round HF-NOISE,
  // `edgeReads`), where the graph built an edge.
  // On a playing context the note is handed doors of its own into the buses, let go when it has finished
  // (`note-scope.ts`); a render is handed the buses themselves.
  playScoped(ctx, graph.sourceOutput(pe.voice, pe.bus, strikes(pe.voice, pe.p), !edgeReads(pe.voice)), !!pe.p?.fx,
    (out) => voice(ctx, withMotion(ctx, withReturns(ctx, withEcho(ctx, withPartSpace(ctx, out, pe.p), pe.p), pe.p, returnDoorOf(ctx, graph), when), pe.p, when), when, pe.p, program.settings, pe.t), graph);
  if (pe.duck) writeDuck(graph, duckFor(graph.duckShape, pe.p), when, ctx);
}

// A note's way into a shared return (`withReturns`): through a door of its own on a playing context
// (`noteDoor`, let go with the note), the return's input itself on a render.
const returnDoorOf = (ctx: BaseAudioContext, graph: V1Graph) => (key: string): AudioNode | null => {
  const into = graph.returnDoor(key);
  return into && noteDoor(ctx, into);
};

/**
 * Build the lazy returns a program will send to, now rather than on the first
 * note that sends. A return's impulse response is computed when it is built —
 * the engine review of 09-22 read 6.4-13.7 ms for the immersed space, 5.7-6.3
 * for the background and 4.3-5.8 for the hall on this Mac, niced — and the
 * first note used to pay that inside `fireEvent`, on the tick that was meant
 * to be scheduling it. A deck calls this when it is made and a render before
 * its first note, so the returns a program does not use are still never built.
 */
export function prepareReturns(graph: V1Graph, program: Program): void {
  // The struck notes go in at their bus's struck door (round PIANO-2), whose
  // hall is a hall of its own; the background, the immersed space and the echo
  // are one each whichever door asks. The struck path itself is built here for
  // a program with a struck note: a harmonic path is a dozen nodes, and it has
  // to be standing before the first automation line is laid so the lines are
  // written on it as well.
  const struck = program.events.filter((e) => strikes(e.voice, e.p));
  const held = struck.length ? program.events.filter((e) => !strikes(e.voice, e.p)) : program.events;
  for (const r of returnsOf(held)) void graph.buses.melodic[r];
  if (struck.length) {
    const door = graph.struckBus('melodic')!;
    for (const r of returnsOf(struck)) void door[r];
  }
  // The clean doors (round HF-NOISE), for a program with a note the edge may
  // not read: built here for the same reason the struck path is, so the lines
  // laid next are written on their gains as well. Their sends are the bus's.
  for (const e of program.events) if (!edgeReads(e.voice)) graph.cleanBus(e.bus, strikes(e.voice, e.p));
  // A part's own space (`settings.partSpace`): one for the graph, built here where a note asks for it.
  if (program.events.some((e) => typeof e.p?.partSpace === 'number' && e.p.partSpace > 0)) void graph.buses.melodic.partSpace;
  // The shared returns a note names (`p.returns`, `settings.returns`): each built here, once.
  const named = new Set<string>();
  for (const e of program.events) if (e.p?.returns && typeof e.p.returns === 'object') for (const k of Object.keys(e.p.returns)) named.add(k);
  for (const k of named) graph.returnDoor(k);
}

// A program's curves, every line of them, written onto a graph: the one place
// they are laid out, for a render and for a deck alike. `place` puts a theme's
// seconds onto the context's clock — a plain `offset` for a render, whose
// clock is the theme's own shifted, or a function for a deck, whose theme sits
// on a set's grid that may glide — and `from` is the context time we are
// actually starting at, which after a seek is not the start of the track. A
// deck laid this way was a loop of its own in `startDeck` until round (f) of
// the reconciled review of 09-24 (D3).
export function scheduleAutomation(
  graph: V1Graph,
  program: Program,
  place: number | ((t: number) => number),
  from: number | null = null,
): void {
  const offset = typeof place === 'number' ? place : 0;
  const at = from == null ? Math.max(0, offset) : from;
  const mapTime = typeof place === 'number' ? (t: number) => t + place : place;
  for (const line of program.automation) scheduleLine(graph, line, at, mapTime);
}

// **The single-theme player was here, and it is gone** (round K6). `Player` was
// the look-ahead pump for one theme on its own — the debug page's transport
// before that page was removed on 2026-09-16 — and from then until now it was
// the one export of this engine with nothing on the other end of it: no module
// of either package imported it, no tool did, and no test did. Kept as *the*
// contract for a while and then kept out of habit, which is how an export
// becomes a shape somebody maintains for nobody.
//
// What it is not: the live transport, which is `packages/deep-house/src/mix.ts`
// over `deck.ts` and has been since round E, and the look-ahead arithmetic,
// which is `schedule(program, grid, from, to)` and is asked by the live pump
// and by the render below alike. Nothing that plays used this.
//
// It is in git at 45bc73c and its parent, whole, with its seek and its
// visibility handler; restoring it is one `git show`.

/**
 * The doors a note walks into a graph through: every bus's own input and every
 * send it offers, and the returns that are already built. A return behind a
 * getter is read only when the graph says it exists, because reading
 * `bus.hall` is what builds the hall (`hasHall` in `master.ts`).
 */
export function doorsOf(graph: V1Graph): AudioNode[] {
  const doors = new Set<AudioNode>();
  for (const bus of Object.values(graph.buses)) {
    doors.add(bus.dry).add(bus.delay).add(bus.reverb).add(bus.room);
    if (graph.hasHall('held')) doors.add(bus.hall);
    if (graph.hasBackground()) doors.add(bus.background);
    if (graph.hasImmersed()) doors.add(bus.immersed);
    if (graph.hasEcho()) doors.add(bus.echo);
    if (graph.hasPartSpace()) doors.add(bus.partSpace!);
  }
  // the shared returns' inputs and send doors, where built
  for (const id of graph.builtReturns()) {
    const input = graph.returnDoor(id);
    if (input) doors.add(input);
  }
  if (graph.hasStruck()) {
    for (const name of ['melodic', 'keys']) doors.add(graph.struckBus(name)!.dry);
    if (graph.hasHall('struck')) doors.add(graph.struckBus('melodic')!.hall);
  }
  for (const name of ['melodic', 'keys']) for (const d of graph.cleanDoors(name)) doors.add(d);
  return [...doors];
}

/**
 * **An offline render holds its graph open**, so that it is the same render
 * however busy the machine is (the suites' round of 09-24).
 *
 * Chromium stops processing a node once every input it has has finished — a
 * voice's sources stop, their chain goes quiet, and the bus they fed is
 * *disabled* until the next note connects — and the instant it notices is not
 * the render's: it is when the page's main thread gets round to letting go of
 * the finished sources. A shared node that was disabled and enabled again does
 * not carry on where it was (a compressor's envelope, a filter's memory, a
 * delay line), so the same program rendered twice came back different
 * wherever a bus fell quiet between two notes, by as much as 0.58 on a kick
 * with the page's main thread kept busy, and by 2e-4 to 1e-3 in a release tail
 * about one render in ten with it idle — which is what made the view's taps
 * gate a coin. Firefox never disables a node, and renders a program twice to
 * the sample.
 *
 * So every door is fed, from the first sample to the last, by one source of
 * exact nought. A node with a live input is never disabled; adding nought to a
 * sum is exact in floating point, so what a deterministic engine renders does
 * not move by a bit (Firefox, measured byte for byte), and what Chromium
 * renders is the render it gave on an idle machine, every time. It is for an
 * offline render only: a live context plays through a deck whose buses are
 * never quiet for long, and nothing here is on its path.
 */
export function holdOpen(ctx: BaseAudioContext, doors: Iterable<AudioNode>): ConstantSourceNode | null {
  if (typeof ctx.createConstantSource !== 'function') return null;
  const nought = ctx.createConstantSource();
  nought.offset.value = 0;
  for (const door of doors) nought.connect(door);
  nought.start(0);
  return nought;
}

/** What a render may be told: how fine, and what to build the context with. */
export interface RenderOptions {
  /** Diagnostic isolation; all events still drive their original sidechain. */
  sourceMix?: SourceMix;
  sampleRate?: number;
  /**
   * The constructor to render in. A page has one under its own name and Safari
   * has one under its prefix; a tool running outside a browser injects the one
   * it brought with it, which is the only reason this is an argument at all.
   */
  OfflineCtx?: typeof OfflineAudioContext;
  /**
   * Handed the graph the moment it is built and before a note is poured into
   * it. It exists for exactly one caller: the gate that proves the machine
   * view's meters are not in the record (`tools/test.ts`, *a scene with the
   * view's taps attached*), which renders a window twice — once plain, once
   * with `attachTaps` hung on the graph through here — and holds the two
   * buffers to being byte for byte the same. Nothing on a playing path passes
   * it, and anything that does may only read.
   */
  onGraph?: (graph: V1Graph) => void;
}

// The offline render: identical graph, every event scheduled up front.
//
// It takes a program, because a program is what a render is *of*: the whole of
// a theme, or one window of it that `sliceProgram` cut out, and in both cases
// a value that was compiled once and cannot have been compiled differently.
export async function renderProgram(program: Program, { sampleRate = 44100, OfflineCtx, onGraph, sourceMix }: RenderOptions = {}): Promise<AudioBuffer> {
  const Ctor = OfflineCtx || Offline();
  const settings = program.settings;
  const frames = Math.ceil(program.duration * sampleRate);
  const ctx = new Ctor(2, frames, sampleRate);
  // The limiter's module before the master that wants it: `buildMaster` is
  // synchronous and `addModule` is not.
  await prepareLimiter(ctx, settings);
  const graph = makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
  if (sourceMix) graph.setSourceMix(sourceMix);
  graph.out.connect(ctx.destination);
  prepareReturns(graph, program);
  holdOpen(ctx, doorsOf(graph));
  if (onGraph) onGraph(graph);
  await prepareVoices(ctx, settings, program.events, { all: true }); // offline: the whole timeline, no deadline to miss
  scheduleAutomation(graph, program, 0);
  // The same contract the live pump asks, over the whole of the program rather
  // than a window of it: a render is a schedule with no horizon.
  for (const s of schedule(program, offsetGrid(0)).events) fireEvent(ctx, graph, program, s.pe, s.at);
  return ctx.startRendering();
}

// `renderTrack` — the same render from a *plan*, its room resolved and its
// performance compiled first — is `renderTrack` in the composer's
// `packages/deep-house/src/mix.ts` since round W of PLAN-V1-NEXT. It was four
// lines and two of them were the compiler's.

export default renderProgram;
