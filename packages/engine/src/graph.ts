// The v1 graph, wrapped.
//
// `buildGraph` and `buildMaster` in `src/master.ts` *are* the sound: a measured
// chain of nodes in a measured order, with the mid/side low split, the
// sidechain, the sends, the glue and the limiter in it. Round E of PLAN-V1-NEXT
// does not re-express any of that — the design review's sentence is *wrap the
// exact current graph; extract one stage at a time with before/after renders* —
// and neither does this file. What it does is give the runtime one door:
//
//   makeV1Graph(ctx, settings, opts)   one theme's graph, and what plays it
//   makeV1Master(ctx, settings)        the tail one set shares, and its disposal
//
// Behind the door is the graph as it was built before, node for node. In front
// of it is a handle with four things on it and nothing else: the buses a
// program's events land on, `param(path)` — the automation targets addressed by
// the same paths the program's own lines name — the sidechain shape this graph
// is running at, and `dispose()`. So a deck no longer reaches into node fields
// to find the bass's send or the LFOs to stop, and the day a second graph
// exists it has to offer those four things and nothing more.

import { buildGraph, buildMaster, paramOf } from './master.ts';
import { describeGraph, describeMaster } from './describe.ts';
import type { AutomationTarget, Buses, GraphOptions, MasterChain, ThemeGraph } from './master.ts';
import type { MachinePart } from './describe.ts';
import type { Settings } from './settings.ts';
import type { DuckPoint } from './program.ts';
import { isCleanSourceMix, makeSourceMixer } from './source-mix.ts';
import type { SourceMix } from './source-mix.ts';
import type { VoiceOut } from './dsp.ts';

/** One theme's graph, as everything outside this file may know about it. */
export interface V1Graph {
  sourceOutput(source: string, bus: string): VoiceOut;
  /**
   * The listening controls. True when this call put channels into the graph,
   * which is when notes already scheduled straight to their buses have to be
   * scheduled again to be heard through them.
   */
  setSourceMix(state: SourceMix): boolean;
  /** the node a deck's own filters and fader hang off */
  out: GainNode;
  /** the five buses, by the name a program's events carry */
  buses: Buses;
  /** the sidechain at the beat this graph is running on */
  duckShape: DuckPoint[];
  /** a beat, in seconds, on the grid this graph was built for */
  beat: number;
  /** one automation target by the path a program's line names */
  param(path: string): AutomationTarget | null;
  /** whether the piano's hall has been built; looking never builds one */
  hasHall(): boolean;
  hasBackground(): boolean;
  hasImmersed(): boolean;
  /**
   * The boxes and the wires of this graph, as it stands this instant
   * (`src/describe.ts`). It reads nodes and writes nothing, so a caller may ask
   * it in the middle of a render without moving a sample — which is what lets
   * the machine view draw the graph that is playing rather than a drawing of
   * one somebody keeps in step.
   */
  describe(): MachinePart;
  /** let it go: disconnected, and the LFOs that hold it alive stopped */
  dispose(): void;
  /** the graph itself. Nothing outside src/graph.ts and src/master.ts reads it */
  readonly nodes: ThemeGraph;
}

/**
 * The set's shared tail, and the one thing a session does to it. `input` and
 * `out` are the two ends and nothing else: a caller connects the mix into one
 * and the destination out of the other, the way it does with an effect.
 */
export interface V1Master {
  input: AudioNode;
  out: AudioNode;
  settings: Settings;
  limiterIsWorklet: boolean;
  param(path: string): AutomationTarget | null;
  /** the tail's own boxes and wires, read off the chain (`src/describe.ts`) */
  describe(): MachinePart;
  dispose(): void;
  /** the chain itself. Nothing outside src/graph.ts and src/master.ts reads it */
  readonly nodes: MasterChain;
}

/**
 * What this door takes: `buildGraph`'s own options, except that the master may
 * be named either as the chain or as the handle below — which is the one thing
 * this file does to them.
 */
export interface V1GraphOptions extends Omit<GraphOptions, 'master'> {
  master?: MasterChain | V1Master | null;
}

/**
 * One theme's graph. `opts` is what `buildGraph` has always taken — the beat the
 * theme is being played at, the width phase, the master to feed and the theme's
 * own loudness trim — and the graph it returns is that graph.
 */
export function makeV1Graph(ctx: BaseAudioContext, settings: Settings, opts: V1GraphOptions = {}): V1Graph {
  // A set hands its decks the master through this same door, so what arrives
  // here is a handle and what `buildGraph` has always been given is the chain
  // behind it. Asking whether it carries one is the whole of the test: a chain
  // has no `nodes` and a handle's is the chain.
  const handle = opts.master as { nodes?: MasterChain } | null | undefined;
  const graph = buildGraph(ctx, settings,
    handle && handle.nodes ? { ...opts, master: handle.nodes } : (opts as GraphOptions));
  // The listening controls' channels (src/source-mix.ts). None until a state
  // that changes something arrives; a state that changes nothing again ramps
  // the channels to unity and retires them — the notes already routed through
  // them play out at unity, the next note goes straight to its bus.
  //
  // **One mixer a graph, however often the controls come and go** (R87). A
  // retired mixer is taken back into service by the next state that changes
  // something, rather than a new one built beside it: every clean → dirty →
  // clean cycle used to leave a whole mixer's gains connected at unity until
  // the deck was disposed.
  let sources: ReturnType<typeof makeSourceMixer> | null = null;
  let retired: ReturnType<typeof makeSourceMixer> | null = null;
  const made: V1Graph = {
    sourceOutput: (source, bus) => sources ? sources.output(source, bus) : graph.buses[bus],
    setSourceMix(state) {
      if (isCleanSourceMix(state)) {
        if (sources) { sources.set(state); retired = sources; sources = null; }
        return false;
      }
      if (sources) { sources.set(state); return false; }
      if (retired) {
        sources = retired;
        retired = null;
        sources.set(state);
        return true;
      }
      sources = makeSourceMixer(ctx, graph.buses, state);
      return true;
    },
    out: graph.out,
    buses: graph.buses,
    duckShape: graph.duckShape,
    beat: graph.beat,
    param: (path) => paramOf(graph, path),
    hasHall: () => graph.hasHall(),
    hasBackground: () => graph.hasBackground(),
    hasImmersed: () => graph.hasImmersed(),
    describe: () => describeGraph(made, settings),
    // A graph that has been torn down keeps its LFOs running unless they are
    // stopped: a running source holds everything downstream of it alive, so the
    // width and chorus chains of every retired theme were still being
    // processed. Disconnecting and stopping are one operation, here, because
    // nobody who lets a deck go should have to remember the second half.
    dispose() {
      sources?.dispose();
      retired?.dispose();
      graph.disposeBackground();
      try { graph.out.disconnect(); } catch (e) { /* already gone */ }
      for (const n of graph.keepAlive || []) {
        // What is in `keepAlive` is whatever held the graph alive — an LFO and
        // the gain its depth is on — so each one is asked whether it stops
        // rather than assumed to be a source.
        const source = n as Partial<AudioScheduledSourceNode>;
        if (typeof source.stop === 'function') {
          try { source.stop(); } catch (e) { /* already stopped */ }
        }
      }
    },
    nodes: graph,
  };
  return made;
}

/**
 * The set's own room. Two decks pass through one of these at a seam, so it
 * belongs to neither theme and is built from settings resolved for the set.
 *
 * `dispose` is the other half of a stop. Every mix builds a master — a filter
 * chain, a limiter in a worklet, a clipper — and a stop used to leave all of it
 * connected to the destination: the worklet goes on being processed for as long
 * as the context lives whether anything feeds it or not, so three starts and
 * stops meant three limiters running on the audio thread with nothing to limit.
 * The processor is told to write out its tail and finish, and the chain is taken
 * apart behind it.
 */
export function makeV1Master(ctx: BaseAudioContext, settings: Settings): V1Master {
  const master = buildMaster(ctx, settings);
  const made: V1Master = {
    input: master.input,
    out: master.out,
    settings: master.settings,
    limiterIsWorklet: master.limiterIsWorklet,
    param: (path) => paramOf(master, path),
    describe: () => describeMaster(made),
    dispose() {
      // Every node of the chain, in the order the signal passes through them
      // backwards; the low shelf was missing from this list for three rounds,
      // which left one biquad of a stopped set wired to a stage that was gone.
      const nodes = [master.out, master.trim, master.clip, master.limiter, master.master,
        master.air, master.presence, master.mid, master.lowMid, master.lowShelf, master.dcBlock];
      const port = master.limiterPort;
      if (port) {
        try { port.postMessage({ finish: true }); } catch (e) { /* gone */ }
        try { port.onmessage = null; } catch (e) { /* gone */ }
        setTimeout(() => { try { port.close(); } catch (e) { /* gone */ } }, 200);
      }
      for (const node of nodes) {
        if (!node) continue;
        try { node.disconnect(); } catch (e) { /* already gone */ }
      }
    },
    nodes: master,
  };
  return made;
}
