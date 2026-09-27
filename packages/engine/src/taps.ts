// The meters, and the promise that they are not in the record.
//
// A tap is an `AnalyserNode` hung off a bus and nothing else: a node is
// connected *to* it, it is connected to nothing, and the specification pulls it
// for its own sake. So the sum that reaches the destination is the sum that
// reached it before — which is a claim and not a hope, and
// `tools/test.ts`'s *a scene with the view's taps attached* renders a window of
// music with every tap of this file on it and holds the PCM to being byte for
// byte the window rendered without them.
//
// The ceiling's own meter is not a tap at all. The limiter's processor has
// posted the worst gain reduction it saw eight times a second since it was
// written — the scene gate reads those posts, and so does the bench — so this
// listens to traffic that is already going past rather than asking the audio
// thread for more. `master.limiterPort` carries it, and a listener added with
// `addEventListener` needs no more than that: `master.ts` starts the port
// when it builds the limiter.
//
// **Made when the view opens, taken all the way out when it closes.** Round K6
// learned what a tap left connected costs: a `ScriptProcessorNode` still wired
// to the destination goes on being called for the life of the context, on the
// main thread, whether it still has a handler or not, and two of them left
// behind is how a later scenario finds a browser that has stopped answering
// (`notes/archive/2026-09-v2-day-chain/rounds/never-stops.md` §6). `dispose()` disconnects every analyser,
// drops the port listener and empties the table, and the view's own close
// calls it before it removes a single box.

import { gainToDb } from './dsp.ts';
import type { V1Graph, V1Master } from './graph.ts';

/** One meter, in the units a meter is read in. */
export interface MeterReading {
  /** RMS over the window, dBFS */
  rms: number;
  /** the loudest sample in the window, dBFS */
  peak: number;
  /** the loudest sample of the last second, dBFS: the peak hold a desk has */
  hold: number;
}

/** What the ceiling had to do: the last post, and the worst since the last read. */
export interface Reduction {
  now: number;
  worst: number;
  /** whether anything is posting at all — a master with no worklet posts nothing */
  posting: boolean;
}

/** One frame of every meter, taken in one breath. */
export interface MeterFrame {
  /** the context's own clock when the frame was taken */
  at: number;
  buses: Record<string, MeterReading>;
  out: MeterReading;
  reduction: Reduction;
  /** the meters whose peak reached the ceiling since the frame before */
  clipped: string[];
  /** the meters at or over −1 dBFS: hot, but not yet clipping */
  hot: string[];
  /** the limiter's own ceiling, dBFS — a reading of the master and not a gate */
  ceilingDb: number;
}

/**
 * **What counts as a clip, and what the ceiling is.**
 *
 * The limiter's ceiling is a real number and is reported as one, but it is not
 * the clip threshold and a first pass that used it lit every LED in the rack:
 * the ceiling is 0.75 — about −2.5 dBFS — and it applies *after* the master
 * gain, so a bus running at −2.1 dBFS is a bus doing exactly what it should.
 *
 * What a meter is held to instead is the two numbers this project already
 * states about its own output: **−1 dBFS is the ceiling every scene is metered
 * against** (`tools/test.ts`: true peak and sample peak at or under −1 dB), so
 * a meter at or over it is hot and reads amber; and **0 dBFS is full scale**, so
 * a meter at or over that is clipping and reads red. They are the same two
 * numbers on a bus and on the output, because a bus at full scale is a bus that
 * would clip if it were the output.
 */
export const HOT_DB = -1;
export const CLIP_DB = 0;

/** The taps, while the view is open. */
export interface Taps {
  /** every meter, now. Cheap: one `getFloatTimeDomainData` per analyser */
  read(): MeterFrame;
  /** how many analysers are attached — the number the inert gate states */
  readonly count: number;
  /** disconnect every one of them and stop listening to the port */
  dispose(): void;
}

const FLOOR = -120;
const toDb = (x: number): number => (x <= 1e-6 ? FLOOR : +gainToDb(x).toFixed(1));

/**
 * The window each meter reads, when the reader does not say how often it reads.
 * 4096 samples is 85 ms at 48 kHz.
 */
const WINDOW = 4096;
/** The most an analyser holds. */
const WINDOW_MAX = 32768;
/**
 * **The window is the gap between two readings, and more** (the reconciled
 * review, R55). 4096 samples is 85 ms at 48 kHz, which is shorter than the gap
 * at six readings a second (167 ms) and no longer than it at twelve once a
 * timer's lateness and the publish itself are in it — so a peak could fall
 * between two readings and never light the LED. A reader that says its period
 * gets the power of two that covers it half as long again: 8192 at twelve a
 * second, 16384 at six, at 48 kHz.
 */
export function windowFor(periodMs: number | null | undefined, sampleRate: number): number {
  if (!periodMs || !(periodMs > 0)) return WINDOW;
  const need = (periodMs / 1000) * sampleRate * 1.5;
  let n = WINDOW;
  while (n < need && n < WINDOW_MAX) n *= 2;
  return n;
}

interface Tap {
  name: string;
  analyser: AnalyserNode;
  from: AudioNode;
  buf: Float32Array;
  /** the last second of peaks, so the hold is a second and not a frame */
  recent: number[];
}

function makeTap(ctx: BaseAudioContext, name: string, from: AudioNode, size: number): Tap {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = size;
  // Nothing is smoothed: a meter that smooths is a meter that lies about a
  // peak, and the peak is the reading a red LED is for.
  analyser.smoothingTimeConstant = 0;
  from.connect(analyser);
  return { name, analyser, from, buf: new Float32Array(size), recent: [] };
}

/**
 * How many readings a second of hold is. It is stated in *frames* rather than
 * in seconds because a frame is what a reader has: the view draws at twelve a
 * second and at six on a coarse pointer, so twelve is a second at the one and
 * two at the other, and both are a hold a hand can catch.
 */
const HOLD_FRAMES = 12;

// A reading, and its peak as the amplitude it was: clip and hot are judged on
// that and never on the decibels written for the eye, which are rounded to a
// tenth — 0.9943 (-0.0496 dBFS) wrote `-0`, and `-0 >= 0` lit the clip LED on
// a peak that did not clip (R85 of the reconciled review of 09-24).
function readTap(tap: Tap): [MeterReading, number] {
  // `getFloatTimeDomainData` takes a `Float32Array<ArrayBuffer>`; the buffer
  // here is exactly that and is reused, so a frame allocates nothing.
  tap.analyser.getFloatTimeDomainData(tap.buf as Float32Array<ArrayBuffer>);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < tap.buf.length; i++) {
    const v = tap.buf[i];
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  tap.recent.push(peak);
  if (tap.recent.length > HOLD_FRAMES) tap.recent.shift();
  let hold = 0;
  for (const v of tap.recent) if (v > hold) hold = v;
  return [{ rms: toDb(Math.sqrt(sum / tap.buf.length)), peak: toDb(peak), hold: toDb(hold) }, peak];
}
const CLIP_AT = Math.pow(10, CLIP_DB / 20);
const HOT_AT = Math.pow(10, HOT_DB / 20);

/**
 * Hang a meter on every bus of a theme's graph and on the last node of the set,
 * and listen to what the ceiling is already saying.
 *
 * @param graph the theme's graph — its five buses are the five meters
 * @param master the set's tail; its `out` is the output meter and its limiter's
 *   port is the gain reduction. A render of one theme builds its own master and
 *   passes none, and then the output meter is the graph's own last node.
 * @param periodMs how often the reader reads, so the window covers the gap
 */
export function attachTaps(graph: V1Graph, master: V1Master | null = null, { periodMs = null }: { periodMs?: number | null } = {}): Taps {
  const ctx = graph.out.context;
  const size = windowFor(periodMs, ctx.sampleRate);
  // Everything that can throw is read before anything is connected, and a
  // throw while the analysers are being hung lets go of the ones already hung
  // (R86 of the reconciled review of 09-24): the view retries a failed attach
  // every frame, and the ceiling used to be read after five analysers were
  // connected, so each failure left five more on the graph for good.
  const ceiling = (master ? master.settings : graph.nodes.chain.settings).master.limiter.ceiling;
  const outNode: AudioNode = master ? master.out : graph.nodes.chain.out;
  const port: MessagePort | null = master ? master.nodes.limiterPort : graph.nodes.chain.limiterPort;
  const taps: Tap[] = [];
  let out: Tap;
  try {
    for (const name of Object.keys(graph.buses)) taps.push(makeTap(ctx, name, graph.buses[name].dry, size));
    out = makeTap(ctx, 'out', outNode, size);
  } catch (e) {
    for (const tap of taps) {
      try { tap.from.disconnect(tap.analyser); } catch (err) { /* never connected */ }
    }
    throw e;
  }

  // The ceiling. `limiterPort` is null where the worklet could not load, and
  // then `posting` is false and the view says so rather than drawing nought
  // decibels of reduction on a master that has no limiter in it.
  let now = 0;
  let worst = 0;
  let posting = false;
  const onMessage = (e: MessageEvent) => {
    const r = e.data && (e.data as { reduction?: unknown }).reduction;
    if (typeof r !== 'number') return;
    posting = true;
    now = r;
    if (r > worst) worst = r;
  };
  if (port) port.addEventListener('message', onMessage);

  const ceilingDb = toDb(ceiling);
  let gone = false;

  return {
    get count() {
      return gone ? 0 : taps.length + 1;
    },
    read(): MeterFrame {
      const buses: Record<string, MeterReading> = {};
      const clipped: string[] = [];
      const hot: string[] = [];
      const judge = (name: string, peak: number) => {
        if (peak >= CLIP_AT) clipped.push(name);
        else if (peak >= HOT_AT) hot.push(name);
      };
      for (const tap of taps) {
        const [r, peak] = readTap(tap);
        buses[tap.name] = r;
        judge(tap.name, peak);
      }
      const [o, outPeak] = readTap(out);
      judge('out', outPeak);
      const frame: MeterFrame = {
        at: +ctx.currentTime.toFixed(3),
        buses,
        out: o,
        reduction: { now: +now.toFixed(2), worst: +worst.toFixed(2), posting },
        clipped,
        hot,
        ceilingDb,
      };
      worst = 0;
      return frame;
    },
    dispose() {
      if (gone) return;
      gone = true;
      for (const tap of taps) {
        try { tap.from.disconnect(tap.analyser); } catch (e) { /* the graph went first */ }
        try { tap.analyser.disconnect(); } catch (e) { /* never connected onward */ }
      }
      try { outNode.disconnect(out.analyser); } catch (e) { /* gone */ }
      try { out.analyser.disconnect(); } catch (e) { /* gone */ }
      taps.length = 0;
      if (port) {
        try { port.removeEventListener('message', onMessage); } catch (e) { /* gone */ }
      }
    },
  };
}

export default attachTaps;
