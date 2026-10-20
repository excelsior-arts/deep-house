// **The load row** (round apple-1, Eugene 10-19: "before the App Store
// release", a line in the machine view's readings): what playing costs, measured
// by the page itself so it reads the same in every browser and in the app.
//
// The page's own three, taken over each second while the view is open:
//
// - **main**, the share of the second the main thread spent on frames: from
//   each frame's own timestamp (where the browser began it, which a task that
//   ran into the frame has already delayed) to a message posted from the
//   frame, which runs once the frame's script, style, layout and paint are
//   done. A task that held the thread past a frame is in the next frame's
//   share; work between two frames that delays neither is not counted.
// - **frame**, the mean time between two frames, and the longest.
// - **headroom**, of every note the scheduler placed in the second, the one
//   asked for closest to the render head: how far ahead of it, in ms
//   (`headroomSince`, the engine). Below nought a note was late, and the late
//   count says how many.
//
// No device figures (Eugene, 10-19, on the app's cpu, memory, thermal and gpu
// cells: "we don't need to show useless stats if it's just a copy of the
// system … only if possible to understand how much the app itself consumes").
// The device's figures are the whole system's, and what the app itself costs
// is in WebKit's processes, which an app cannot read; so the row is the
// page's own figures alone, everywhere.
//
// It costs one frame callback and one message a frame while the view is open,
// and nothing while it is closed. The reading changes once a second.
//
// (The engine's `headroomSince` is the one change outside this file and the
// view: two numbers kept beside the late count, and no onset moved.)

import { headroomSince, lateInfo } from '@deep-house/engine/dsp';

export interface LoadReading {
  /** the main thread's share of the second spent on frames, 0..100 */
  main: number;
  /** the mean and the longest time between two frames, in ms */
  frameMs: number;
  worstMs: number;
  /** the closest note to the render head in the second, in ms ahead of it; null with nothing scheduled */
  headroomMs: number | null;
  /** notes that reached late in the second */
  late: number;
}

const WINDOW_MS = 1000;

let reading: LoadReading | null = null;
let on = false;
let raf = 0;
let channel: MessageChannel | null = null;
let lastTs = 0;
let since = 0;
let frames = 0;
let gaps = 0;
let worst = 0;
let work = 0;
let lateAt = 0;
/** the timestamps of the frames whose message has not come back yet */
const open: number[] = [];

function frame(ts: number): void {
  if (!on) return;
  raf = requestAnimationFrame(frame);
  if (lastTs) {
    const gap = ts - lastTs;
    gaps += gap;
    worst = Math.max(worst, gap);
    frames += 1;
  }
  lastTs = ts;
  open.push(ts);
  if (channel) channel.port2.postMessage(0);
  if (ts - since >= WINDOW_MS) close(ts);
}

function done(): void {
  const ts = open.shift();
  if (ts != null) work += Math.max(0, performance.now() - ts);
}

function close(ts: number): void {
  const span = ts - since;
  const head = headroomSince();
  const late = lateInfo().count;
  reading = {
    main: Math.min(100, Math.round((work / span) * 100)),
    frameMs: frames ? +(gaps / frames).toFixed(1) : 0,
    worstMs: Math.round(worst),
    headroomMs: head.low == null ? null : Math.round(head.low * 1000),
    late: Math.max(0, late - lateAt),
  };
  lateAt = late;
  since = ts;
  frames = 0;
  gaps = 0;
  worst = 0;
  work = 0;
}

/** Begin measuring: the machine view has opened. */
export function startLoad(): void {
  if (on || typeof requestAnimationFrame === 'undefined') return;
  on = true;
  reading = null;
  channel = new MessageChannel();
  channel.port1.onmessage = done;
  lastTs = 0;
  since = performance.now();
  frames = 0;
  gaps = 0;
  worst = 0;
  work = 0;
  open.length = 0;
  lateAt = lateInfo().count;
  headroomSince();
  raf = requestAnimationFrame(frame);
}

/** Stop: the view has closed, and nothing is measured. */
export function stopLoad(): void {
  on = false;
  cancelAnimationFrame(raf);
  raf = 0;
  if (channel) { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close(); }
  channel = null;
  open.length = 0;
  reading = null;
}

/** The last whole second's reading, or null before there is one. */
export function loadNow(): LoadReading | null {
  return reading;
}

/** One cell of the load row: its short name, its value, and its tone. */
export interface LoadCell { k: string; v: string; tone?: 'warn' | 'bad' }

/**
 * **The load row's cells** (`view.tsx`), always the same cells for the same
 * place, so the row never changes its height as figures come and go: the
 * page's own four, everywhere — `main` (%), `frame` and `longest` (ms),
 * `headroom` (ms). A figure not measured yet reads `—`, as every reading in
 * the view does.
 *
 * Tones: notes late in the second, or a headroom below nought, are a fault; a
 * headroom under 20 ms a warning.
 */
export function loadCells(r: LoadReading | null): LoadCell[] {
  const dash = '\u2014';
  const head = r && r.headroomMs != null ? r.headroomMs : null;
  const cells: LoadCell[] = [
    { k: 'main', v: r ? `${r.main} %` : dash },
    { k: 'frame', v: r && r.frameMs ? `${r.frameMs.toFixed(1)} ms` : dash },
    { k: 'longest', v: r && r.worstMs ? `${r.worstMs} ms` : dash },
    {
      k: 'headroom', v: head == null ? dash : `${head} ms${r && r.late ? ` \u00b7 ${r.late} late` : ''}`,
      tone: r && (r.late || (head != null && head < 0)) ? 'bad' : head != null && head < 20 ? 'warn' : undefined,
    },
  ];
  return cells;
}

/** The row as one line of words, for a log or a check: `main 12 % · frame 16.7 ms · …`. */
export function loadWords(r: LoadReading | null): string {
  return loadCells(r).map((c) => `${c.k} ${c.v}`).join(' \u00b7 ');
}
