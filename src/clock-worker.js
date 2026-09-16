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

let timer = null;
if (inWorker) {
  onmessage = (e) => {
    const m = e.data || {};
    if (m.start) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => postMessage(0), m.start);
    } else if (m.stop) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export default null;
