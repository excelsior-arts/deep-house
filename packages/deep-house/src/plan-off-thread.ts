// **Planning off the page's thread**: the page's side of the planner's worker
// (`src/plan-worker.ts`; the planning perf round, 10-12).
//
// `planOffThread` hands a request to the worker and answers with a promise of
// the plan — `planTheme` with the room's bypass folded in, and its program
// where one is asked for — which is the plan made here byte for byte
// (`src/plan-ask.ts`, held by `tools/check-plan-worker.ts`). It answers `null`
// at once where the worker cannot take the request — no worker in this
// environment (node, the tools), one that failed to load, a stated style, a
// request that does not clone — and the caller plans on its own thread as it
// always did, so nothing depends on the worker being there.
//
// A plan the worker could not make is made again here: where it throws, it
// throws what it would have thrown; where it does not, the worker is the
// fault, it is let go, and every later plan is made here.

import { adopt, askOf, planHere as planOnThisThread, styleOfAsk } from './plan-ask.ts';
import type { PlanAnswer } from './plan-ask.ts';
import type { Bypass, MixOptions, SetTrack } from './set-plan.ts';
import type { Style } from '@deep-house/engine/style';

/** How soon an ask is wanted: a hand is waiting on it (`now`), or it is made ahead (`ahead`). */
export interface OffThreadHow {
  priority?: 'now' | 'ahead';
  /** an ask with the same tag that has not begun is replaced by this one */
  tag?: string | null;
  /** the room's bypass the plan is played under, folded in as `applyBypass` folds it */
  bypass?: Bypass | null;
  /** the plan's program too, compiled in the worker and taken as the plan's (`adoptProgram`) */
  program?: boolean;
}

/** What a replaced ask is rejected with: nobody wants that plan any more. */
export class PlanDropped extends Error {
  constructor() { super('a later ask with the same tag took this one\'s place'); this.name = 'PlanDropped'; }
}

interface Waiting {
  resolve: (t: SetTrack) => void;
  reject: (e: unknown) => void;
  seed: string | number;
  index: number;
  opts: Partial<MixOptions>;
  bypass: Bypass | null;
  style: Style;
}

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, Waiting>();
/**
 * asks answered by the worker, and plans made here after it could not; and the
 * longest an answer held this thread while it was taken (the clone read and
 * the program frozen): a bench reading
 */
const counts = { asked: 0, answered: 0, dropped: 0, here: 0, takeMs: 0 };

/** The plan made on this thread instead, for an ask the worker did not answer. */
function planHere(w: Waiting): void {
  counts.here += 1;
  let track: SetTrack;
  try {
    track = planOnThisThread(w.seed, w.index, w.opts, w.bypass);
  } catch (err) {
    w.reject(err);
    return;
  }
  w.resolve(track);
}

/** The worker is let go: whatever it still owed is made here, a task at a time. */
function giveUp(why: unknown): void {
  if (failed) return;
  failed = true;
  if (typeof console !== 'undefined') console.warn('deep-house: the planner\'s worker is gone; themes are planned on the page\'s thread', why);
  try { worker?.terminate(); } catch (e) { /* gone */ }
  worker = null;
  const owed = [...waiting.values()];
  waiting.clear();
  for (const w of owed) setTimeout(() => planHere(w), 0);
}

function answered(e: MessageEvent<{ id: number; answer?: PlanAnswer; dropped?: boolean; error?: string }>): void {
  const t0 = performance.now();
  try { take(e); } finally { counts.takeMs = Math.max(counts.takeMs, +(performance.now() - t0).toFixed(1)); }
}
function take(e: MessageEvent<{ id: number; answer?: PlanAnswer; dropped?: boolean; error?: string }>): void {
  const m = e.data;
  const w = waiting.get(m.id);
  if (!w) return;
  waiting.delete(m.id);
  if (m.dropped) { counts.dropped += 1; w.reject(new PlanDropped()); return; }
  if (m.answer) { counts.answered += 1; w.resolve(adopt(m.answer, w.style)); return; }
  // The worker threw. Made here, the plan throws the same, or the worker was at fault.
  let track: SetTrack;
  try {
    track = planOnThisThread(w.seed, w.index, w.opts, w.bypass);
  } catch (err) {
    w.reject(err);
    return;
  }
  counts.here += 1;
  w.resolve(track);
  giveUp(m.error);
}

/**
 * **The worker, started** — in an idle slot after the page has drawn, so it
 * has loaded by the time a hand asks anything of it. True when there is one.
 */
export function startPlanner(): boolean {
  if (worker) return true;
  if (failed || typeof Worker === 'undefined') return false;
  try {
    worker = new Worker(new URL('./plan-worker.ts', import.meta.url), { type: 'module', name: 'deep-house planner' });
  } catch (err) {
    giveUp(err);
    return false;
  }
  worker.onmessage = answered;
  worker.onerror = (e) => { e.preventDefault?.(); giveUp(e.message || 'the worker failed to load'); };
  worker.onmessageerror = () => giveUp('an answer that would not clone');
  return true;
}

/**
 * **Theme `index` of `seed` under `opts`, planned in the worker**: the plan
 * `planTheme(seed, index, opts)` makes here, as a promise — or `null` at once
 * where the worker cannot take it, and the caller plans here.
 */
export function planOffThread(seed: string | number, index: number, opts: Partial<MixOptions>, how: OffThreadHow = {}): Promise<SetTrack> | null {
  if (!startPlanner()) return null;
  const bypass = how.bypass ?? null;
  const ask = askOf(seed, index, opts, bypass, !!how.program);
  if (!ask) return null;
  const id = nextId++;
  try {
    worker!.postMessage({ id, ask, pri: how.priority === 'ahead' ? 0 : 1, tag: how.tag ?? null });
  } catch (err) {
    // a request that does not clone is this thread's to plan
    return null;
  }
  counts.asked += 1;
  return new Promise<SetTrack>((resolve, reject) => {
    waiting.set(id, { resolve, reject, seed, index, opts, bypass, style: styleOfAsk(opts) });
  });
}

/** Whether a worker is planning, and what it has been asked: a bench reading. */
export const plannerState = () => ({ running: !!worker, failed, waiting: waiting.size, ...counts });
