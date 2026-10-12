// What a voice renders ahead and reads back: a buffer per key per context, the
// promise of it while it is in the air, and the rule for how many may be in the
// air at once.
//
// Three voices do this — the piano's strings, the hats' two tones, the drum
// kitchen's bodies — and until the reconciled review of 09-24 (R30) each kept
// its own copy of the same few lines, and only the piano's copy had learned
// the two things the others had not:
//
// - **a render that failed is not a buffer.** The hats and the drums kept the
//   rejected promise under its key for the life of the context, so every later
//   hit found a failure, never rendered again, and built itself live for good;
// - **a render is a job, and jobs are rationed.** Each one is an
//   OfflineAudioContext with its oscillators in it, and nothing bounded how
//   many a chord of cold strings or a bar of cold drums started at the instant
//   the scheduler was trying to meet its next deadline. The piano's own pump
//   was bounded; the live miss beside it was not, and neither was anything the
//   drums or the hats started.
//
// So there is one helper. `cached` is the map with the first rule in it, and
// every render goes through `job`, at most `MAX_JOBS` running on a context at
// a time and the rest queued in the order they were asked for. A render asked
// for **from the play path** (`defer: true`) does not start inside the call
// that asked: it waits for the next task, so the scheduling tick builds its
// note live and returns, and the render happens beside the music rather than
// inside the tick that was meant to be placing it.
//
// **The permit is one OfflineAudioContext, and the cache is not a permit**
// (E01 and E02 of the outside review of 10-03). Until then `cached` took the
// permit for whatever its `make` did, and the drum kitchen's `make` was a
// bundle — every variant of an articulation, each its own OfflineAudioContext
// — so four admitted jobs were twelve contexts alive at once while the
// telemetry said four. Now a context is constructed in one place, `offline`
// below, under one permit each, and counted there; a cache entry is only the
// promise of what its renders make (a bundle awaits its variants, it holds no
// permit of its own, so nothing waits on a permit it is itself holding). And
// the map's cap is the map's: `bound` declares it, and it is held on
// fulfilment as well as on insertion, over the **completed** entries only —
// what is still rendering is in flight, owned by whoever is waiting for it and
// reported apart (`holding`), never counted against what the cache retains,
// and never evicted.

import { Offline } from '../dsp.ts';

/**
 * How many renders may run at once on one context, across every voice. The
 * piano's measurement: at most four OfflineAudioContexts alive at a time
 * instead of thirty-five, and none of them started by the tick. Since E01 of
 * 10-03 that is what it counts: one permit is one context (`offline`).
 */
export const MAX_JOBS = 4;

interface Jobs {
  running: number;
  queue: Array<() => void>;
  /** OfflineAudioContexts constructed by `offline` on this context and not yet rendered */
  contexts: number;
}
const jobs = new WeakMap<BaseAudioContext, Jobs>();
let peakJobs = 0;
let peakContexts = 0;

const jobsOf = (ctx: BaseAudioContext): Jobs => {
  let j = jobs.get(ctx);
  if (!j) { j = { running: 0, queue: [], contexts: 0 }; jobs.set(ctx, j); }
  return j;
};

function next(ctx: BaseAudioContext): void {
  const j = jobsOf(ctx);
  while (j.running < MAX_JOBS && j.queue.length) {
    j.running++;
    if (j.running > peakJobs) peakJobs = j.running;
    j.queue.shift()!();
  }
}

/**
 * One permit, rationed: `render` starts when fewer than `MAX_JOBS` are running
 * on this context, in the order asked. `defer` keeps it out of the calling task
 * altogether, which is what a render asked for by a note being scheduled wants.
 *
 * A job must construct **at most one** OfflineAudioContext, and through
 * `offline`, which is a job of its own: a job that awaits other jobs while it
 * holds its permit can wait for ever on permits it is itself holding.
 */
export function job<T>(ctx: BaseAudioContext, render: () => Promise<T>, defer = false): Promise<T> {
  const j = jobsOf(ctx);
  return new Promise<T>((resolve, reject) => {
    j.queue.push(() => {
      let p: Promise<T>;
      try { p = render(); } catch (e) { p = Promise.reject(e); }
      p.then(resolve, reject).finally(() => { j.running--; next(ctx); });
    });
    if (defer && typeof setTimeout === 'function') setTimeout(() => next(ctx), 0);
    else next(ctx);
  });
}

/**
 * One OfflineAudioContext of `channels` by `length` samples at `ctx`'s rate,
 * built by `build` and rendered, under one permit. **The one place a voice
 * constructs an offline context**, so the count of them (`renderJobs`) is
 * taken where they are made and not where a job is admitted.
 */
export function offline(
  ctx: BaseAudioContext,
  channels: number,
  length: number,
  build: (off: OfflineAudioContext) => void,
  defer = false,
): Promise<AudioBuffer> {
  return job(ctx, () => {
    const j = jobsOf(ctx);
    const off = new (Offline())(channels, length, ctx.sampleRate);
    j.contexts++;
    if (j.contexts > peakContexts) peakContexts = j.contexts;
    let done: Promise<AudioBuffer>;
    try {
      build(off);
      done = off.startRendering();
    } catch (e) {
      j.contexts--;
      throw e;
    }
    return done.finally(() => { j.contexts--; });
  }, defer);
}

/**
 * What the rationing has done, for a gate: the most permits ever running at
 * once and what is running and queued now, and the offline contexts — the
 * most ever alive at once on any context, and how many are alive on this one.
 */
export const renderJobs = (ctx?: BaseAudioContext) => ({
  peak: peakJobs,
  running: ctx ? jobsOf(ctx).running : 0,
  queued: ctx ? jobsOf(ctx).queue.length : 0,
  peakContexts,
  contexts: ctx ? jobsOf(ctx).contexts : 0,
});

/** A map's declared cap on its completed entries, set by `bound`. */
const caps = new WeakMap<Map<string, unknown>, number>();

/**
 * The buffer under `key`, or the promise of it while it renders, or — the first
 * time it is asked for — the promise `make` returns. A render that fails
 * leaves the key empty, so the next ask renders again; a render that succeeds
 * replaces its own promise and nothing else (a key cleared or replaced while it
 * rendered keeps what it now holds), and then the map's cap (`bound`) is held
 * again, over every completed entry but this one.
 *
 * `make` takes its own permits (`offline`): an entry is ownership, not a
 * render, so a bundle of renders is one entry and as many permits as it has
 * contexts. `defer` keeps `make` out of the calling task.
 */
export function cached<T>(
  per: Map<string, T | Promise<T>>,
  _ctx: BaseAudioContext,
  key: string,
  make: () => Promise<T>,
  defer = false,
): T | Promise<T> {
  const got = per.get(key);
  if (got !== undefined) return got;
  let started: Promise<T>;
  if (defer && typeof setTimeout === 'function') started = new Promise<void>((go) => setTimeout(go, 0)).then(make);
  else {
    try { started = make(); } catch (e) { started = Promise.reject(e); }
  }
  const p: Promise<T> = started.then((v) => {
    if (per.get(key) === p) {
      per.set(key, v);
      // The cap is held on fulfilment too (E02): entries let past it while
      // they were in the air are trimmed the moment they land. The one that
      // just landed is kept — its waiters are being handed it now — and in
      // any case a buffer a caller already holds is the caller's: eviction
      // only takes it out of the map.
      const cap = caps.get(per);
      if (cap !== undefined) trim(per, cap, key);
    }
    return v;
  }, (err: unknown) => {
    if (per.get(key) === p) per.delete(key);
    throw err;
  });
  // A promise nobody awaits must not surface as an unhandled rejection: the
  // play path asks for a buffer and takes the live build when there is none.
  p.catch(() => {});
  per.set(key, p);
  return p;
}

function trim<T>(per: Map<string, T | Promise<T>>, cap: number, keep?: string): void {
  let ready = 0;
  for (const v of per.values()) if (!(v instanceof Promise)) ready++;
  if (ready <= cap) return;
  for (const [k, v] of per) {
    if (ready <= cap) break;
    if (v instanceof Promise || k === keep) continue;
    per.delete(k);
    ready--;
  }
}

/**
 * Bound a map to `cap` **completed** entries, oldest first (a Map iterates in
 * insertion order), and declare the cap for the map, so `cached` holds it
 * again as each entry in flight lands. Entries still rendering are kept and
 * not counted: they are in flight, about to be read (`holding` reports them).
 */
export function bound<T>(per: Map<string, T | Promise<T>>, cap: number): void {
  caps.set(per, cap);
  trim(per, cap);
}

/** What a map holds: its completed entries, which its cap bounds, and the ones in flight. */
export function holding<T>(per: Map<string, T | Promise<T>> | undefined): { ready: number; flight: number } {
  let ready = 0, flight = 0;
  if (per) for (const v of per.values()) { if (v instanceof Promise) flight++; else ready++; }
  return { ready, flight };
}
