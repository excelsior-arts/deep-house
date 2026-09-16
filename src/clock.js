// The one clock both schedulers keep time by: how often to look, how far to
// look, and where the tick comes from.
//
// A scheduler here fills a stretch of future and comes back for more. How far
// it fills depends on where the page is: short while it is visible, so a skip
// or a seek can still change what has not been fired; long while it is
// hidden, because a browser wakes a hidden page's timers once a second at
// best, and 120 ms of music a second is the stutter Eugene heard in the car.

export const TICK_MS = 25;
export const LOOKAHEAD = 0.12;
export const LOOKAHEAD_HIDDEN = 1.6;

export const isHidden = () => typeof document !== 'undefined' && document.hidden;

// A look-ahead has to clear the device's own block twice over: once because
// `ctx.currentTime` already lags the render head by a block, and once because
// the next tick may not come for another block's worth of main-thread jitter.
// On a 4096-frame device at 48 kHz that is 85 ms a piece, so 120 ms of
// look-ahead left about ten milliseconds of margin and any hitch spent it.
// This is a player, not a synthesiser being played: it can afford to be early.
// `visible` is what the caller wants while the page is visible; the player
// raises it for a device that hands out a large output buffer.
export function liveLookahead(ctx, visible) {
  const out = ctx.outputLatency || 0;
  const base = ctx.baseLatency || 0;
  return Math.max(visible || LOOKAHEAD, 2 * out + base + TICK_MS / 1000 + 0.05);
}

export function lookahead(ctx, visible) {
  return isHidden() ? LOOKAHEAD_HIDDEN : liveLookahead(ctx, visible);
}

// Where the last clock got its ticks from, for the bench: 'worker',
// 'blob-worker', or 'interval' when no Worker could be had.
let source = null;
export const clockSource = () => source;
let warned = false;
const warn = (why) => {
  if (warned || typeof console === 'undefined') return;
  warned = true;
  console.warn(`deep-house: the clock runs on the page's own timer (${why}); a hidden tab will stutter`);
};

// The worker, inlined into the bundle by the build; without one the import is
// the plain module beside this file, whose default is not a constructor.
import ClockWorker from './clock-worker.js?worker&inline';

// The tick comes from a Worker: a hidden tab clamps the page's own timers to
// once a second and a Worker's are left alone. The build hands this file the
// worker inlined in the bundle, so nothing extra is fetched; without a build
// the import above is an ordinary module and no constructor comes back, and
// the same script is made into a blob here. Where there is no Worker at all,
// or the Worker dies, the page's own setInterval takes over with one warning
// in the console. Returns a function that stops the clock.
export function startClock(fn, ms = TICK_MS) {
  if (typeof Worker === 'undefined') {
    warn('no Worker');
    return interval(fn, ms);
  }
  let stop = null;
  let fell = false;
  const fallBack = (why) => {
    if (fell) return;
    fell = true;
    warn(why);
    if (stop) stop();
    stop = interval(fn, ms);
  };
  const attach = (worker, blobUrl) => {
    source = blobUrl ? 'blob-worker' : 'worker';
    worker.onmessage = () => { if (!fell) fn(); };
    worker.onerror = (e) => {
      // a file that could not be fetched, or a script that threw: try the blob
      // once, then the page's timer
      if (e && e.preventDefault) e.preventDefault();
      if (!blobUrl && !fell) {
        worker.terminate();
        try {
          startBlob();
          return;
        } catch (err) { /* falls through */ }
      }
      fallBack('the Worker failed');
    };
    worker.postMessage({ start: ms });
    stop = () => {
      try { worker.postMessage({ stop: true }); } catch (e) { /* gone */ }
      worker.terminate();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  };
  const startBlob = () => {
    const src = `let t=null;onmessage=(e)=>{const m=e.data||{};if(m.start){if(t)clearInterval(t);t=setInterval(()=>postMessage(0),m.start);}else if(m.stop){clearInterval(t);t=null;}};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    try {
      attach(new Worker(url, { type: 'module' }), url);
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  };
  try {
    // The bundled worker: a real Worker, delivered as a blob by the build, so
    // it is the page's clock and not a fallback and is reported as `worker`.
    if (typeof ClockWorker === 'function') attach(new ClockWorker(), null);
    else startBlob();
  } catch (e) {
    try {
      startBlob();
    } catch (err) {
      fallBack('no Worker could be made');
    }
  }
  return () => { if (stop) stop(); };
}

function interval(fn, ms) {
  source = 'interval';
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}
