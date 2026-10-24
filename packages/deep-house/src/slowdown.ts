// **The render clock falling behind the wall clock** (round audio-slack,
// Eugene 10-23: "once in a while on iPhone the music gets slowdown, which is
// cute, aka analogue tape delay, when the phone is operating something else").
//
// When the audio render thread cannot keep up, the context's clock
// (`ctx.currentTime`) advances slower than real time. On an Apple phone the set
// leaves through a media element (`OUT = 'element'`, control.ts), whose stream
// converter stretches what it is handed rather than dropping out: the tape
// wow. On the direct path the same stall is a click. Either way it is the
// render clock losing time against `performance.now()`, and that is what this
// watches: nothing about the music, two clock reads on the transport's tick.
//
// **The signal is the lag**, the wall clock minus the render clock, in
// seconds. While the render keeps up the lag only wobbles inside a band as
// wide as the clock's own steps (a context's clock moves by whole buffers:
// MEASURED ±12 ms in headless Chromium, `notes/rounds/audio-slack.md`). A
// slowdown is the lag climbing out of that band:
//
// - **Opened** when the lag stands `LOST_MS` above the lowest it read over the
//   last `BASE_MS`. Its start is the last tick the lag was still inside the
//   band (`NOISE_MS` over that floor).
// - **Closed** once the lag has made no new high for `HOLD_MS`. Its end is the
//   tick of that high, so its length is the stretch the render was losing time.
// - **Kept** only when it lasted `MIN_MS` or more and lost time at a mean rate
//   below `RATE`. Its lowest rate is the slowest `RATE_MS` stretch inside it.
//
// **Never a slowdown where nothing slowed.** The watch rests (its window
// emptied, and nothing judged for `SETTLE_MS`) at a start, on any change of the
// context's state (a suspend, an interruption, a resume), on the page being
// hidden or shown (a phone lock), and after a gap of `GAP_MS` between two ticks
// (a page the system froze). A context that is not running is never judged.
// A pause, a seek or a skip moves neither clock, so they need nothing.
//
// It costs two clock reads and a walk of a fixed ring of numbers a tick, and
// allocates nothing until a slowdown is kept.

import { note, REPORT_CAPS } from './ledger.ts';

/** The thresholds, MEASURED in round audio-slack (`notes/rounds/audio-slack.md`). */
export const SLOW = Object.freeze({
  /** a kept slowdown's mean rate is below this */
  RATE: 0.98,
  /** and it lasted at least this long */
  MIN_MS: 250,
  /** the lag's low edge above its recent floor that opens one */
  LOST_MS: 40,
  /** the band the lag's low edge wobbles in while the render keeps up */
  NOISE_MS: 15,
  /** the stretch the lag's low edge is read over: wider than a buffer and a tick */
  EDGE_MS: 150,
  /** how far back the floor is read */
  BASE_MS: 3000,
  /** a new high is at least this much higher, and an edge this near the floor or the high is on it: the edge's own wobble */
  RISE_MS: 5,
  /** no new high for this long closes one */
  HOLD_MS: 500,
  /** the stretch the lowest rate is read over */
  RATE_MS: 500,
  /** nothing is judged for this long after a rest */
  SETTLE_MS: 1000,
  /** a gap between two ticks this long is a frozen page: the watch rests */
  GAP_MS: 2500,
});

/** One slowdown, as the ledger and the machine view say it. */
export interface Slowdown {
  /** when it began, in `performance.now()` milliseconds */
  at: number;
  /** how long it lasted */
  ms: number;
  /** the time the render lost over it */
  lostMs: number;
  /** the slowest stretch's rate (1 is real time) */
  low: number;
  /** whether the page was hidden when it began */
  hidden: boolean;
  /** the output path: `element`, `direct` or `silent` */
  out: string;
}

export interface SlowOptions {
  out: string;
  now?: () => number;
  hidden?: () => boolean;
  found?: (s: Slowdown) => void;
}

/** A tick's clocks are kept for this many ticks: 6.4 s at the 25 ms tick. */
const RING = 256;

/**
 * **The detector**, with its clocks handed in so a check can drive it. `sample`
 * is the tick: the render clock in seconds and whether the context is running.
 * `settle` is a rest. `flush` closes a slowdown still open (a stop).
 *
 * The render clock moves in whole buffers, so the lag read on a tick is a saw
 * as tall as a buffer over the true lag, touching it as each buffer lands. Its
 * **low edge**, the lowest lag over the last `EDGE_MS`, is the true lag within
 * a tick's jitter whatever the buffer, and that is what is judged. On a page
 * whose ticks are sparser than that (a hidden page a system wakes once a
 * second) the edge is one tick, and the bar is raised by the clock's step as
 * the watch last saw it.
 */
export function slowDetector(o: SlowOptions) {
  const now = o.now ?? (() => performance.now());
  const hidden = o.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
  const wall = new Float64Array(RING);
  const lag = new Float64Array(RING);
  const edge = new Float64Array(RING);
  /** when the tick the edge was read off was taken: a buffer landing, where the lag read is the true one */
  const edgeAt = new Float64Array(RING);
  let head = 0;   // the next slot
  let size = 0;
  let armAt = 0;
  /** the clock's step as last seen, in ms: the largest move between two close ticks, slowly forgotten */
  let step = 0;
  // the slowdown open, in plain fields so a tick allocates nothing
  let open = false;
  let startWall = 0, floorLag = 0, peakWall = 0, peakEdge = 0, low = 1, openHidden = false;

  const at = (back: number) => (head - 1 - back + RING) % RING;   // 0 is the newest
  /** resting: the window is emptied again when the rest is over, so nothing in it is judged */
  let resting = false;
  const rest = (t: number) => { if (open) close(); size = 0; armAt = t + SLOW.SETTLE_MS; resting = true; };

  /**
   * Closed: its length is read off the rise itself. The edge's points between
   * the floor and the level it was left at (each a buffer landing, true within
   * the edge's wobble) give the rise's slope; the length is the lag lost over
   * that slope, and it began where the slope leaves the floor.
   */
  function close(): void {
    open = false;
    // the level it was left at: the lowest edge since the last new high, or
    // the high itself where the render caught up after (Chromium's does)
    const band = SLOW.RISE_MS / 1000;
    let level = peakEdge;
    for (let i = 0; i < size; i++) {
      const k = at(i);
      if (wall[k] < peakWall) break;
      if (edge[k] < level) level = edge[k];
    }
    if (level < peakEdge - 2 * band) level = peakEdge;
    const lost = level - floorLag;
    // the rise's last point a fifth under the level and its first a fifth over the floor
    const inset = Math.max(band, lost / 5);
    let tE = -1, vE = 0, tS = -1, vS = 0;
    for (let i = 0; i < size; i++) {
      const k = at(i);
      if (edgeAt[k] < startWall) break;
      if (tE < 0 && edge[k] <= level - inset) { tE = edgeAt[k]; vE = edge[k]; }
      if (tE >= 0 && edge[k] >= floorLag + inset) { tS = edgeAt[k]; vS = edge[k]; }
    }
    let ms = peakWall - startWall, from = startWall;
    if (tS >= 0 && tE > tS && vE > vS) {
      const slope = (vE - vS) / ((tE - tS) / 1000);   // lag gained a second
      // never wider than the ticks that saw it: a rise barely over the bar has
      // too few points for a slope, and the last tick on the floor and the
      // last new high bound it
      from = Math.max(startWall, tS - ((vS - floorLag) / slope) * 1000);
      ms = Math.min((lost / slope) * 1000, peakWall - from);
    }
    const lostMs = lost * 1000;
    const mean = ms > 0 ? 1 - lostMs / ms : 1;
    if (ms >= SLOW.MIN_MS && mean < SLOW.RATE && o.found) {
      o.found({ at: from, ms: Math.round(ms), lostMs: Math.round(lostMs), low: +Math.max(0, Math.min(low, mean)).toFixed(3), hidden: openHidden, out: o.out });
    }
  }

  function sample(ctxTime: number, running: boolean): void {
    const t = now();
    if (!running) { rest(t); return; }
    if (size && t - wall[at(0)] > SLOW.GAP_MS) rest(t);
    const L = t / 1000 - ctxTime;
    if (size) {
      const dw = t - wall[at(0)];
      // the clock's move between two close ticks: a buffer, or the ticks' own spacing
      if (dw <= 60) step = Math.max(step * 0.9995, dw - (L - lag[at(0)]) * 1000);
    }
    wall[head] = t;
    lag[head] = L;
    // the low edge, and how many ticks it was read over
    let e = L, eAt = t, n = 1;
    for (let i = 0; i < size; i++) {
      const k = at(i);
      if (t - wall[k] > SLOW.EDGE_MS) break;
      if (lag[k] < e) { e = lag[k]; eAt = wall[k]; }
      n += 1;
    }
    edge[head] = e;
    edgeAt[head] = eAt;
    head = (head + 1) % RING;
    if (size < RING) size += 1;
    if (t < armAt) return;
    if (resting) {
      // the rest is over: the floor is read from here on
      resting = false;
      wall[0] = t; lag[0] = L; edge[0] = e; edgeAt[0] = t; head = 1; size = 1;
      return;
    }
    if (open) {
      if (e > peakEdge + SLOW.RISE_MS / 1000) { peakEdge = e; peakWall = t; }
      // the slowest stretch inside it, read on the edge
      for (let i = 1; i < size; i++) {
        const k = at(i);
        if (wall[k] < startWall) break;
        if (t - wall[k] >= SLOW.RATE_MS) {
          const r = 1 - (e - edge[k]) / ((t - wall[k]) / 1000);
          if (r < low) low = r;
          break;
        }
      }
      if (t - peakWall >= SLOW.HOLD_MS) {
        close();
        // the lag the render was left at is the new floor (an element never catches up)
        wall[0] = t; lag[0] = L; edge[0] = e; edgeAt[0] = t; head = 1; size = 1;
      }
      return;
    }
    let floor = L;
    for (let i = 1; i < size; i++) {
      const k = at(i);
      if (t - wall[k] > SLOW.BASE_MS) break;
      if (lag[k] < floor) floor = lag[k];
    }
    const bar = n >= 3 ? SLOW.LOST_MS : Math.max(SLOW.LOST_MS, step + SLOW.NOISE_MS);
    if ((e - floor) * 1000 < bar) return;
    // the last edge still on the floor is where it began
    let s = at(size - 1);
    for (let i = 1; i < size; i++) {
      const k = at(i);
      if ((edge[k] - floor) * 1000 <= SLOW.RISE_MS) { s = k; break; }
    }
    open = true;
    startWall = edgeAt[s]; floorLag = floor;
    peakWall = t; peakEdge = e;
    low = 1 - (e - edge[s]) / Math.max(1e-3, (t - startWall) / 1000);
    openHidden = hidden();
  }

  return {
    sample,
    settle: () => rest(now()),
    flush: () => { if (open) close(); },
  };
}

// ---------------------------------------------------------------------------
// The page's one watch: the context control.ts makes, and what it found.

const found: Slowdown[] = [];
let count = 0;
let longest = 0;
let last: Slowdown | null = null;
let watch: ReturnType<typeof slowDetector> | null = null;

/** The slowdowns since the page loaded: how many, the longest, and the last. */
export interface SlowSummary { count: number; longestMs: number; last: Slowdown | null }
export const slowSummary = (): SlowSummary => ({ count, longestMs: longest, last });
/** Every slowdown kept, oldest first (a check reads it; the page keeps the last 32). */
export const slowdowns = (): Slowdown[] => found.slice();

function keep(s: Slowdown): void {
  count += 1;
  if (s.ms > longest) longest = s.ms;
  last = s;
  found.push(s);
  if (found.length > 32) found.shift();
  note('slow', `the sound slowed for ${s.ms} ms`, {
    ms: s.ms, low: s.low, lost: s.lostMs, hidden: s.hidden, out: s.out,
  });
}

/**
 * **Watch this context** (control.ts, where the context is made). Hands back
 * the tick, which the transport calls on each of its own (`onTick`). Rests on
 * every change of the context's state and of the page's visibility.
 */
export function watchSlowdowns(ctx: BaseAudioContext, out: string): () => void {
  const w = slowDetector({ out, found: keep });
  watch = w;
  ctx.addEventListener('statechange', w.settle);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', w.settle);
  return () => w.sample(ctx.currentTime, ctx.state === 'running');
}

/** A set starting or stopping: nothing judged for the next second, and an open slowdown closed. */
export function settleSlowdowns(): void {
  if (watch) watch.settle();
}

/**
 * **The slowdowns' own throttle** (round audio-slack): the first of a session
 * is sent, and after it at most one each `REPORT_CAPS.slowEveryMs`, carrying
 * how many there were and the longest since the last one sent (itself
 * included). Outside the six: a slowdown is the device's, and a session on a
 * busy phone would spend them on one cause.
 */
export function slowThrottle(every: number = REPORT_CAPS.slowEveryMs) {
  let sentAt = -Infinity;
  let since = 0;
  let longest = 0;
  return (ms: number, at: number): { count: number; longest: number } | null => {
    since += 1;
    if (ms > longest) longest = ms;
    if (at - sentAt < every) return null;
    const out = { count: since, longest };
    sentAt = at;
    since = 0;
    longest = 0;
    return out;
  };
}
