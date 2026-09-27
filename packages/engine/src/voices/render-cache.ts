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

/**
 * How many renders may run at once on one context, across every voice. The
 * piano's measurement: at most four OfflineAudioContexts alive at a time
 * instead of thirty-five, and none of them started by the tick.
 */
export const MAX_JOBS = 4;

interface Jobs {
  running: number;
  queue: Array<() => void>;
}
const jobs = new WeakMap<BaseAudioContext, Jobs>();
let peakJobs = 0;

const jobsOf = (ctx: BaseAudioContext): Jobs => {
  let j = jobs.get(ctx);
  if (!j) { j = { running: 0, queue: [] }; jobs.set(ctx, j); }
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
 * One render, rationed: it starts when fewer than `MAX_JOBS` are running on
 * this context, in the order asked. `defer` keeps it out of the calling task
 * altogether, which is what a render asked for by a note being scheduled wants.
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

/** What the rationing has done, for a gate: the most renders ever running at once, and what is running and queued now. */
export const renderJobs = (ctx?: BaseAudioContext) => ({
  peak: peakJobs,
  running: ctx ? jobsOf(ctx).running : 0,
  queued: ctx ? jobsOf(ctx).queue.length : 0,
});

/**
 * The buffer under `key`, or the promise of it while it renders, or — the first
 * time it is asked for — a render started through `job`. A render that fails
 * leaves the key empty, so the next ask renders again; a render that succeeds
 * replaces its own promise and nothing else (a key cleared or replaced while it
 * rendered keeps what it now holds).
 */
export function cached<T>(
  per: Map<string, T | Promise<T>>,
  ctx: BaseAudioContext,
  key: string,
  make: () => Promise<T>,
  defer = false,
): T | Promise<T> {
  const got = per.get(key);
  if (got !== undefined) return got;
  const p: Promise<T> = job(ctx, make, defer).then((v) => {
    if (per.get(key) === p) per.set(key, v);
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

/**
 * Bound a map to `cap` entries, oldest first (a Map iterates in insertion
 * order). Entries still rendering are kept: they are about to be read.
 */
export function bound<T>(per: Map<string, T | Promise<T>>, cap: number): void {
  if (per.size <= cap) return;
  for (const [k, v] of per) {
    if (per.size <= cap) break;
    if (v instanceof Promise) continue;
    per.delete(k);
  }
}
