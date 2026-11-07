// **A theme's graph lets go of every node it built** (the phone review of
// 10-12: on an iPhone the page was killed after a while of Drum & Bass).
//
// A deck's teardown has always disconnected the deck's fader and the graph's
// out, stopped its LFOs and let go of its notes and its lazy spaces. Everything
// else the graph built — the buses, the sends, the reverb and the clap room
// (each a ConvolverNode with seconds of impulse), the hall, the dotted-eighth
// echo, the sweeps — stayed wired to each other behind the cut. Chromium does
// not mind: an island no destination pulls is collected with the page's
// references to it. WebKit frees a node only when its wrapper has been
// collected and nothing is connected into it, so an island like that lives
// until a full collection reaches it, and one with a loop in it (the echo's
// delay and its feedback gain feed each other) may never go. Headless WebKit
// measured what that costs: a six-second stereo ConvolverNode is about 37 MB
// of footprint there, a theme builds four or five, and each seam of the Drum &
// Bass tile left 70-90 MB behind (473 to 952 MB over seven seams). With the
// impulses cut to 256 frames the footprint stayed flat, so the rooms were it.
//
// So the graph keeps a list of the nodes it builds — while `buildGraph` runs,
// and while each of its lazy builders (the hall, the spaces, the echo, the
// sweep, the struck and clean paths, the shared returns) runs on a later note
// — and its `dispose` disconnects every one of them, and hands each convolver
// one frame of silence in place of its impulse (`letGoOfAll`), which WebKit
// frees at once where a disconnect waits for the collector. Over seven seams
// the footprint then went from 537 to 375 MB. The deck is off the sum before
// any of this happens, so nothing that is heard changes; and a render, or the
// node stand-in, collects nothing and is exactly what it was.

/** The list the nodes built now go into, if a graph is building. */
let into: AudioNode[] | null = null;
/** ...and, when no graph is building, the note being built on this context (`noteNodes`, `note-scope.ts`). */
let noteInto: { ctx: BaseAudioContext; list: AudioNode[] } | null = null;
let patched = false;

/** Is this a context whose graphs collect: a playing context in a browser (a render never tears a graph down). */
const collects = (ctx: BaseAudioContext): boolean =>
  typeof AudioNode !== 'undefined' && typeof (ctx as Partial<OfflineAudioContext>).startRendering !== 'function';

function patchCreates(): void {
  if (patched) return;
  patched = true;
  const proto = BaseAudioContext.prototype as unknown as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!name.startsWith('create') || name === 'createBuffer' || name === 'createPeriodicWave') continue;
    const make = proto[name];
    if (typeof make !== 'function') continue;
    proto[name] = function (this: BaseAudioContext, ...args: unknown[]) {
      const node = (make as (...a: unknown[]) => unknown).apply(this, args);
      if (node instanceof AudioNode) {
        if (into) into.push(node);
        // a node an offline render makes inside a note (a string, a drum body) is that render's, never the note's
        else if (noteInto && node.context === noteInto.ctx) noteInto.list.push(node);
      }
      return node;
    };
  }
}

/** Run `build`, every node it makes on `ctx` going into `list`. */
export function owning<T>(ctx: BaseAudioContext, list: AudioNode[], build: () => T): T {
  if (!collects(ctx)) return build();
  patchCreates();
  const outer = into;
  into = list;
  try {
    return build();
  } finally {
    into = outer;
  }
}

/**
 * Run `build`, the nodes it makes on `ctx` outside any graph's builder going into `list`: a note's own chain (its
 * sources, envelopes, filters, panners, its LFOs and their depths), which the note lets go of whole when it has
 * finished (`note-scope.ts`). A lazy return the note happens to build first is the graph's (`owning` inside it).
 */
export function noteNodes<T>(ctx: BaseAudioContext, list: AudioNode[], build: () => T): T {
  if (!collects(ctx)) return build();
  patchCreates();
  const outer = noteInto;
  noteInto = { ctx, list };
  try {
    return build();
  } finally {
    noteInto = outer;
  }
}

/** A lazy builder of a graph, whose nodes go into the graph's `list` whenever it runs. A render's is the builder itself. */
export function ownedBy<A extends unknown[], R>(ctx: BaseAudioContext, list: AudioNode[], build: (...args: A) => R): (...args: A) => R {
  if (!collects(ctx)) return build;
  return (...args: A): R => owning(ctx, list, () => build(...args));
}

/** One frame of silence a context's convolvers are handed back, by channel count. */
const blanks = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
function blankFor(node: ConvolverNode, channels: number): AudioBuffer {
  let per = blanks.get(node.context);
  if (!per) blanks.set(node.context, (per = new Map()));
  let b = per.get(channels);
  if (!b) per.set(channels, (b = node.context.createBuffer(channels, 1, node.context.sampleRate)));
  return b;
}

/**
 * Disconnect every node in `list`, once, and forget them. A convolver gives
 * its impulse back too: WebKit frees a node only when its wrapper has been
 * collected, and JavaScriptCore does not know that a ConvolverNode carries its
 * impulse partitioned many times over (about 37 MB for six seconds of stereo,
 * measured headless), so a disconnected room waited for a full collection that
 * a steady page seldom runs. Setting `buffer` to null does not free it in
 * WebKit; handing it one frame of silence does, at once.
 */
export function letGoOfAll(list: AudioNode[]): void {
  for (const node of list) {
    try { node.disconnect(); } catch (e) { /* already gone */ }
    if (typeof ConvolverNode !== 'undefined' && node instanceof ConvolverNode && node.buffer && node.buffer.length > 1) {
      try { node.buffer = blankFor(node, node.buffer.numberOfChannels); } catch (e) { /* a browser that will not take it */ }
    }
  }
  holdAWhile(list.slice());
  list.length = 0;
}

// **A node let go is held a while after its last wire is cut** (round crash-resume, 11-03). His Mac app's WebKit
// content process aborted twice in five minutes of Vibe, on its audio thread: `AudioSummingJunction::
// updateRenderingState` from `handleDirtyAudioSummingJunctions`, before and after a render quantum, a pure virtual
// call: a node's input or AudioParam was on the context's list of junctions whose wiring changed, and was being
// destroyed while the render thread read it. The same abort is in his app on 10-27 and in Safari on 10-28.
//
// A junction goes on that list when a wire into it is made or cut, and comes off it at the next render quantum
// (a few milliseconds). WebKit destroys a node only once nothing holds it: its wrapper collected, and nothing wired
// into it. So two things feed the race:
//
// - **a cut, and the node's end, close together**: an AudioParam whose own node is gone lives on only in the wire
//   into it (an LFO's depth into a filter's frequency), so cutting that wire dirties the param and frees it in one
//   step; any node whose last holder goes in the same few milliseconds as its last wire is the same shape;
// - **a node let go still wired**: the collector takes a note's chain whole, and WebKit cuts its wires one node at
//   a time as it frees them, each cut dirtying a neighbour that is being freed beside it. Measured headless in
//   Chromium before this round: on Vibe - Solar Wind 88 nodes a second were collected still wired.
//
// So every node the engine lets go of is first cut from everything (`disconnect()`, each one, the whole chain and
// not only its door), and then held here for `HOLD_AFTER_CUT_MS` — hundreds of render quanta — before the page drops
// it. By the time WebKit can destroy it, the render thread has long read every junction the cuts dirtied, and the
// node has no wire left for its own end to cut. Nothing heard changes: what is cut is already silent and off the
// sum (a note's chain after its tail and margin, a deck after its fade, a grain after its window).
//
// What it holds is bounded by the rate things are let go: every node let go in the last two seconds, a few hundred
// on a busy theme (`heldAfterCut`), and a deck's graph for two seconds after its seam.

/** How long a node let go is held after its wires are cut, in milliseconds. */
export const HOLD_AFTER_CUT_MS = 2000;
const holding = new Set<unknown[]>();
let heldNow = 0;
let heldMost = 0;

/** Hold `nodes`, already cut, for `HOLD_AFTER_CUT_MS`, then let the page drop them. `nodes` is the caller's to give. */
export function holdAWhile(nodes: unknown[]): void {
  if (!nodes.length || typeof setTimeout !== 'function') return;
  holding.add(nodes);
  heldNow += nodes.length;
  if (heldNow > heldMost) heldMost = heldNow;
  const t = setTimeout(() => {
    holding.delete(nodes);
    heldNow -= nodes.length;
    nodes.length = 0;
  }, HOLD_AFTER_CUT_MS);
  // never a reason for a node process to stay up
  (t as unknown as { unref?: () => void }).unref?.();
}

/** Cut every wire of each of `nodes`, then hold them a while (`holdAWhile`). */
export function cutAndHold(nodes: Iterable<unknown>): void {
  const held: unknown[] = [];
  for (const n of nodes) {
    if (!n) continue;
    try { (n as { disconnect: () => void }).disconnect(); } catch (e) { /* already gone, or not a node */ }
    held.push(n);
  }
  holdAWhile(held);
}

/** What is held now and the most ever held at once, in nodes (a gate's and the churn tool's reading). */
export const heldAfterCut = (): { now: number; most: number } => ({ now: heldNow, most: heldMost });
