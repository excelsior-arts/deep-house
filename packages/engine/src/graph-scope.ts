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
      if (into && node instanceof AudioNode) into.push(node);
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
  list.length = 0;
}
