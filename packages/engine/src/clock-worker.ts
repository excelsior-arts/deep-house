// The clock's other half: a Worker that posts a tick every `ms`. A hidden
// page's own timers are clamped to once a second; a Worker's are not.
//
// The build inlines this file into the bundle as a worker, so the published
// site is one script and the tick costs no second request. Served straight off
// a folder with no build, the same file is pulled in as an ordinary module
// instead, where it must do nothing at all — hence the guard, and the default
// export the import asks for; the clock falls back to its own blob there.
const inWorker =
  typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;

/** What the clock sends: a period to start ticking at, or a word to stop. */
interface ClockMessage {
  start?: number;
  stop?: boolean;
}

/**
 * The worker's whole body, as one self-contained function: it closes over
 * nothing, so `src/clock.ts` can write it into a blob with `toString()` when
 * there is no build, and the two clocks are one text (R93 of the reconciled
 * review of 09-24 found the blob a second copy, written into a string).
 */
export function clockBody(scope: { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void }): void {
  let timer: ReturnType<typeof setInterval> | null = null;
  scope.onmessage = (e: MessageEvent) => {
    const m = (e.data || {}) as ClockMessage;
    if (m.start) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => scope.postMessage(0), m.start);
    } else if (m.stop) {
      // `timer` is null here if a stop arrives before a start, and
      // `clearInterval(null)` is the no-op it has always been.
      clearInterval(timer!);
      timer = null;
    }
  };
}
if (inWorker) clockBody(self as unknown as Parameters<typeof clockBody>[0]);

export default null;
