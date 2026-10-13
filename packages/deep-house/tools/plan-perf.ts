// **What a pull costs the page's own thread**, measured in the three engines
// (the planning perf round, 10-12). A built site is served, each place is
// opened and started, and a bird is pulled twice while the set plays; the page
// says how long the pull's own call held the thread, the longest stretch a
// timer waited behind it (every engine has timers; only Chromium reports
// `longtask` entries, and where it does they are read too), how many themes it
// planned, and whether a note was reached late. The first note after a start
// is read off the set's own lead.
//
//   node tools/plan-perf.ts --site <dir> --port <n>
//   node tools/plan-perf.ts --site <dir> --port <n> --browsers webkit --pulls 4
//   node tools/plan-perf.ts --site <dir> --port <n> --profile   Chromium's profile of a pull, by function
//   node tools/plan-perf.ts --site <dir> --port <n> --marks     the start's own marks (`startMark`)
//   node tools/plan-perf.ts --site <dir> --port <n> --identity  the browser's worker held to its page, plan for plan
//
// `--identity` asks each engine's own planner worker for every request of the
// link digest's grid (each theme of a set row) and holds the plan and the
// program it answers to the ones the page makes on its own thread, written
// out whole (keys in order, every number as itself, every shared object
// shared) — `tools/check-plan-worker.ts` holds the same in node; this is the
// same code as the browsers bundle and run it, under the page's own address.
//
// It plays silently (`out=silent`), headless, and touches nothing on disk.

import { serve, siteDir, playwright, launchOptions, pageUrl, renice } from '@deep-house/engine/harness';
import { grid, played } from './link-digest.ts';

const arg = (k: string, d: string | null): string | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BROWSERS = (arg('browsers', 'chromium,webkit,firefox') as string).split(',').filter(Boolean);
const PULLS = Number(arg('pulls', '3'));
const PROFILE = process.argv.includes('--profile');
/** The three places of the round: the house, the ambient benchmark, and the Drum & Bass tile. */
const PLACES: Record<string, string> = {
  house: 'seed=1&v=2',
  ambient: 'seed=27191&v=2&spell=em:0.14,gl:0,ve:0.34,sp:0,lo:0.81',
  dnb: 'seed=1&v=2&spell=em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85',
};
const ONLY = arg('places', null);

// The start, in a call of its own, so a profile can be taken of the pulls alone.
const START = async () => {
  const w = window as any;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const P = w.__planPerf = { lt: [] as Array<{ phase: string; ms: number }>, phase: 'start', gap: 0, last: performance.now(), awake: 0 as any, timer: 0 as any, longtasks: false };
  P.awake = setInterval(() => console.log('plan-perf awake'), 1000);
  {
    const ctl = w.ring.control;
    const lt = P.lt;
    P.longtasks = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('longtask');
    if (P.longtasks) new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push({ phase: P.phase, ms: Math.round(e.duration) }); }).observe({ type: 'longtask' });
    // a timer every 4 ms: the longest it waits past its time is the longest the thread was held
    P.timer = setInterval(() => { const t = performance.now(); P.gap = Math.max(P.gap, t - P.last - 4); P.last = t; }, 4);
    const t0 = performance.now();
    const startCall = ctl.start();
    const syncStart = performance.now() - t0;
    await Promise.race([startCall, sleep(20000)]);
    const resolved = performance.now() - t0;
    // the first note is the lead's end: the moment the set's first instant is laid at
    let heard = null as number | null;
    for (let k = 0; k < 2000 && heard == null; k++) {
      const s = ctl.mix && ctl.mix.state;
      if (s && s.running && !s.leading && s.elapsed > 0) heard = performance.now() - t0;
      else await sleep(5);
    }
    const startGap = P.gap;
    await sleep(4000);
    // the start's own marks (`startMark`), from the call
    const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dh:') && m.startTime >= t0)
      .map((m) => `${m.name.slice(3)} ${Math.round(m.startTime - t0)}`).join(', ');
    return { sync: +syncStart.toFixed(1), resolved: +resolved.toFixed(1), heard: heard == null ? null : +heard.toFixed(1), gap: +startGap.toFixed(1), long: lt.filter((x) => x.phase === 'start').map((x) => x.ms), marks };
  }
};

const PULLS_BODY = async (pulls: number) => {
  const w = window as any;
  const P = w.__planPerf;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ctl = w.ring.control;
  try {
    const late0 = ctl.mix.state.late.count;
    const out: any[] = [];
    for (let k = 0; k < pulls; k++) {
      P.phase = `pull ${k + 1}`;
      P.gap = 0; P.last = performance.now();
      const lt0 = P.lt.length;
      const plans0 = ctl.plansMade;
      const a = performance.now();
      w.ring.pull(0, k % 2 ? 0.3 : 0.4);
      const sync = performance.now() - a;
      await sleep(3000);
      out.push({ sync: +sync.toFixed(1), gap: +P.gap.toFixed(1), long: P.lt.slice(lt0).map((x: any) => x.ms), plans: ctl.plansMade - plans0 });
    }
    const late = ctl.mix.state.late.count - late0;
    const tickWork = ctl.mix ? ctl.mix.tickWork : null;
    const planner = ctl.planner ?? null;
    ctl.stop();
    return { longtasks: P.longtasks, pulls: out, late, tickWork, planner };
  } finally {
    clearInterval(P.timer);
    clearInterval(P.awake);
  }
};

/** The grid's requests, as the page plans them: a link read and cast, each theme of a set row. */
function identityAsks() {
  const quiet = <T>(fn: () => T): T => { const say = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = say; console.warn = warn; } };
  const out: Array<{ name: string; seed: string; index: number; opts: any }> = [];
  for (const row of grid()) {
    const { seed, request, read } = quiet(() => played(row.link));
    for (let k = 0; k < (row.themes ?? 1); k++) out.push({ name: `${row.link}${row.themes ? ` #${k}` : ''}`, seed, index: row.themes ? k : read.link.theme ?? 0, opts: request });
  }
  return out;
}

/** In the page: each request planned here and in the planner's worker, written out whole and compared. */
const IDENTITY = async (asks: Array<{ name: string; seed: string; index: number; opts: any }>) => {
  const dh = (window as any).deepHouse;
  const bytes = (v: unknown): string => {
    const seen = new Map<object, number>();
    const out: string[] = [];
    const put = (x: any): void => {
      if (typeof x === 'number') { out.push(Object.is(x, -0) ? '-0' : String(x)); return; }
      if (typeof x === 'string') { out.push(JSON.stringify(x)); return; }
      if (x === null || typeof x !== 'object') { out.push(String(x)); return; }
      const had = seen.get(x);
      if (had !== undefined) { out.push(`#${had}`); return; }
      seen.set(x, seen.size);
      if (Array.isArray(x)) { out.push(`[${x.length}:`); for (let i = 0; i < x.length; i++) { if (i in x) put(x[i]); else out.push('~'); out.push(','); } out.push(']'); return; }
      out.push('{');
      for (const k of Object.keys(x)) { out.push(JSON.stringify(k), ':'); put(x[k]); out.push(','); }
      out.push('}');
    };
    put(v);
    return out.join('');
  };
  const bad: string[] = [];
  let same = 0, ms = 0;
  // asked all at once, as the page asks: the worker answers them in its own order
  const offers = asks.map((a) => dh.planOffThread(a.seed, a.index, a.opts, { program: true, priority: 'ahead' }));
  if (offers.some((o: unknown) => !o)) return { bad: ['the page has no planner worker'], same, ms };
  for (let i = 0; i < asks.length; i++) {
    const a = asks[i];
    const t0 = performance.now();
    const there = await offers[i];
    ms += performance.now() - t0;
    const here = dh.planHere(a.seed, a.index, a.opts, null);
    const ok = there.style === here.style && bytes({ ...there, style: null }) === bytes({ ...here, style: null })
      && bytes(dh.programOfPlan(there)) === bytes(dh.programOfPlan(here));
    if (ok) same += 1; else bad.push(a.name);
  }
  return { bad, same, ms: Math.round(ms) };
};

if (process.argv.includes('--identity')) {
  const site = siteDir();
  const server = await serve(site);
  const { pw, label } = await playwright();
  console.log(label);
  const asks = identityAsks();
  let failed = 0;
  try {
    for (const name of BROWSERS) {
      const opts: any = launchOptions(name);
      if (name === 'chromium') opts.channel = 'chrome';
      const browser = await pw[name].launch(opts);
      renice(browser);
      try {
        const page = await (await browser.newContext()).newPage();
        // under an address of its own: the worker's is its script's, and nothing it plans may read the page's
        await page.goto(pageUrl('seed=4&v=2&development=shaped&accompaniment=auto'), { waitUntil: 'load' });
        await page.waitForFunction(() => (window as any).deepHouse && (window as any).deepHouse.planOffThread, null, { timeout: 30000 });
        const r = await page.evaluate(IDENTITY, asks);
        if (r.bad.length) failed += 1;
        console.log(`${r.bad.length ? 'FAIL' : 'ok  '}  ${name.padEnd(8)} ${r.same} of ${asks.length} plans and programs from the worker byte-identical to the page's${r.bad.length ? `; differ: ${r.bad.slice(0, 6).join(', ')}` : ''}`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

const site = siteDir();
const server = await serve(site);
const { pw, label } = await playwright();
console.log(label);
try {
  for (const name of BROWSERS) {
    const opts: any = launchOptions(name);
    if (name === 'chromium') opts.channel = 'chrome';
    const browser = await pw[name].launch(opts);
    renice(browser);
    try {
      for (const [place, link] of Object.entries(PLACES)) {
        if (ONLY && !ONLY.split(',').includes(place)) continue;
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(pageUrl(link), { waitUntil: 'load' });
        await page.waitForFunction(() => (window as any).ring && (window as any).ring.control, null, { timeout: 30000 });
        await page.waitForTimeout(1500);
        const st = await page.evaluate(START);
        let cdp: any = null;
        if (PROFILE && name === 'chromium') {
          cdp = await context.newCDPSession(page);
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
          await cdp.send('Profiler.start');
        }
        const r = await page.evaluate(PULLS_BODY, PULLS);
        const pulls = r.pulls.map((p: any) => `${p.sync}/${p.gap}${p.long.length ? ` [${p.long.join(',')}]` : ''} (${p.plans} plans)`).join('  ');
        const pl = r.planner ? ` | worker: ${r.planner.running ? 'running' : r.planner.failed ? 'failed' : 'none'}, ${r.planner.answered} answered, ${r.planner.here} here, an answer taken in ${r.planner.takeMs} ms at most` : '';
        console.log(`${name.padEnd(8)} ${place.padEnd(7)} start: call ${st.sync} ms, resolved ${st.resolved}, first note ${st.heard} ms, held ${st.gap}${st.long.length ? ` [${st.long.join(',')}]` : ''}${process.argv.includes('--marks') ? ` (${st.marks})` : ''} | pulls (call/held ms [long tasks]): ${pulls} | late ${r.late}, tickWork ${r.tickWork}${pl}`);
        if (cdp) {
          const { profile } = await cdp.send('Profiler.stop');
          const self = new Map<string, number>();
          const dt = new Map<number, number>();
          const ids = profile.samples as number[];
          const deltas = profile.timeDeltas as number[];
          for (let i = 0; i < ids.length; i++) dt.set(ids[i], (dt.get(ids[i]) || 0) + (deltas[i] || 0) / 1000);
          const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
          for (const [id, ms] of dt) {
            const n = byId.get(id);
            const f = n.callFrame;
            const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
            self.set(key, (self.get(key) || 0) + ms);
          }
          // inclusive time by function name, over the parent links
          const parent = new Map<number, number>();
          for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
          const incl = new Map<string, number>();
          for (const [id, ms] of dt) {
            const seen = new Set<string>();
            for (let at: number | undefined = id; at != null; at = parent.get(at)) {
              const f = byId.get(at).callFrame;
              const key = f.functionName || '(anon)';
              if (seen.has(key)) continue;
              seen.add(key);
              incl.set(key, (incl.get(key) || 0) + ms);
            }
          }
          const top = (m: Map<string, number>, n: number) => [...m.entries()].filter(([k]) => !/^\((idle|program|garbage collector|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `    ${v.toFixed(1).padStart(8)} ms  ${k}`).join('\n');
          console.log('  self:\n' + top(self, 25));
          console.log('  inclusive:\n' + top(incl, 40));
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
