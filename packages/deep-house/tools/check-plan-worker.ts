// **A plan made off the page's thread is the plan made on it, byte for byte**
// (the planning perf round, 10-12).
//
// The page asks the planner's worker (`src/plan-worker.ts`) for its themes and
// takes what comes back as its own (`src/plan-ask.ts`): the plan with its
// style put back, the composer's bass lane remembered, and — for a set's
// landing — the program the worker compiled. This holds that answer to the
// plan this thread makes for the same request, over the link digest's grid
// (every row, each theme of a set row) and a few rooms with a bypass:
//
//   - the plan, serialized as the structured clone serializes it (every key in
//     its order, every number as itself, every shared object shared), equals
//     this thread's, its style aside — and its style is this thread's object;
//   - the program the worker compiled equals the one this thread compiles, the
//     same way, and the theme's hash is the one the link digest holds;
//   - the seasoning a held bird gives the plan's notes (`seasonOf`, which reads
//     the remembered bass lane) is this thread's under three spells.
//
// The worker here is a node worker over the same modules (`answerAsk`), asked
// in the reverse order, so a plan that depended on what its thread had planned
// before it would differ. The browser's own worker is the same code, and
// `tools/plan-perf.ts --identity` asks it the same of a page.

import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { grid, played, themeHash, blessedLine } from './link-digest.ts';
import { askOf, adopt, planHere, styleOfAsk } from '../src/plan-ask.ts';
import { planTheme } from '../src/planning.ts';
import { programOf } from '../src/performance.ts';
import { readBypass } from '../src/set-plan.ts';
import { seasonOf } from '../src/generator.ts';
import type { PlanAsk, PlanAnswer } from '../src/plan-ask.ts';

const quiet = <T>(fn: () => T): T => { const say = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = say; console.warn = warn; } };

/** Every request of the grid: a theme of a row (each theme of a set row), and a few under a bypass. */
function requests() {
  const out: Array<{ name: string; seed: string; index: number; opts: any; bypass: any; hash: string | null }> = [];
  for (const row of grid()) {
    const { seed, request } = quiet(() => played(row.link));
    const L = quiet(() => played(row.link)).read.link;
    const themes = row.themes ?? 1;
    for (let k = 0; k < themes; k++) {
      const index = row.themes ? k : L.theme ?? 0;
      out.push({ name: `${row.link}${row.themes ? ` (set, theme ${k})` : ''}`, seed, index, opts: request, bypass: null, hash: row.themes ? null : blessedLine(row.link).hash });
    }
  }
  for (const search of ['?roles=classic', '?sub=-3&glue=0', '?all=0', '?bassdrive=0&roles=classic']) {
    for (const link of ['seed=1&v=2&spell=em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85', 'seed=27191&v=2&spell=em:0.14,gl:0,ve:0.34,sp:0,lo:0.81', 'seed=3&v=2']) {
      const { seed, request, read } = quiet(() => played(link));
      out.push({ name: `${link} under ${search}`, seed, index: read.link.theme ?? 0, opts: request, bypass: readBypass(search), hash: null });
    }
  }
  return out;
}

/** A node worker over the worker's own modules: an ask in, the answer out, as the page's worker answers. */
function startWorker(): { ask: (a: PlanAsk) => Promise<PlanAnswer>; stop: () => Promise<number> } {
  const src = `
    import { parentPort } from 'node:worker_threads';
    console.log = () => {}; console.warn = () => {};
    const { answerAsk } = await import(${JSON.stringify(new URL('../src/plan-ask.ts', import.meta.url).href)});
    parentPort.on('message', ({ id, ask }) => {
      try { parentPort.postMessage({ id, answer: answerAsk(ask) }); }
      catch (err) { parentPort.postMessage({ id, error: String(err && err.stack || err) }); }
    });`;
  const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(src)}`));
  const waiting = new Map<number, { resolve: (a: PlanAnswer) => void; reject: (e: unknown) => void }>();
  let id = 0;
  w.on('message', (m) => {
    const p = waiting.get(m.id)!;
    waiting.delete(m.id);
    if (m.error) p.reject(new Error(m.error)); else p.resolve(m.answer);
  });
  return {
    ask: (a) => new Promise((resolve, reject) => { waiting.set(++id, { resolve, reject }); w.postMessage({ id, ask: a }); }),
    stop: () => w.terminate(),
  };
}

/**
 * **A value written out whole**, so two are the same when the strings are:
 * every key in its order, every number as itself (a minus nought, a NaN, an
 * infinity), an absent field apart from one set to `undefined`, a hole in an
 * array as a hole, and every object reached twice named as the same object.
 * (`v8.serialize` is not this: it writes a whole number held as a double and
 * one held as a small integer differently, and a clone may hold either.)
 */
function bytes(v: unknown): string {
  const seen = new Map<object, number>();
  const out: string[] = [];
  const put = (x: unknown): void => {
    if (typeof x === 'number') { out.push(Object.is(x, -0) ? '-0' : String(x)); return; }
    if (typeof x === 'string') { out.push(JSON.stringify(x)); return; }
    if (x === null || typeof x !== 'object') { if (typeof x === 'function') throw new Error('a function in a plan'); out.push(String(x)); return; }
    const had = seen.get(x);
    if (had !== undefined) { out.push(`#${had}`); return; }
    seen.set(x, seen.size);
    const proto = Object.getPrototypeOf(x);
    if (Array.isArray(x)) {
      out.push(`[${x.length}:`);
      for (let i = 0; i < x.length; i++) { if (i in x) put(x[i]); else out.push('~'); out.push(','); }
      out.push(']');
      return;
    }
    out.push(proto === Object.prototype ? '{' : proto === null ? '{null:' : `{${proto?.constructor?.name}:`);
    for (const k of Object.keys(x)) { out.push(JSON.stringify(k), ':'); put((x as Record<string, unknown>)[k]); out.push(','); }
    out.push('}');
  };
  put(v);
  return out.join('');
}
const SPELLS = [null, { ember: 0.9, root: 0.2 }, { tide: 0.1, veil: 0.8, spark: 0.7 }];

test('a plan the worker makes is the plan this thread makes, byte for byte, with its program and its seasoning', async () => {
  const all = requests();
  const worker = startWorker();
  try {
    // the worker is asked in the reverse order, while this thread plans in the grid's
    const answers = new Map<number, Promise<PlanAnswer>>();
    for (let i = all.length - 1; i >= 0; i--) {
      const r = all[i];
      const ask = askOf(r.seed, r.index, r.opts, r.bypass, true);
      assert.ok(ask, `${r.name}: the page's request could not be asked of a worker`);
      answers.set(i, worker.ask(ask!));
    }
    let checked = 0;
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      const here = quiet(() => planHere(r.seed, r.index, r.opts, r.bypass));
      const there = adopt(await answers.get(i)!, styleOfAsk(r.opts));
      assert.equal(there.style, here.style, `${r.name}: the style put back is not this thread's`);
      assert.ok(bytes({ ...there, style: null }) === bytes({ ...here, style: null }), `${r.name}: the worker's plan differs from this thread's`);
      const program = programOf(there);
      assert.ok(bytes(program) === bytes(quiet(() => programOf(here))), `${r.name}: the worker's program differs from this thread's`);
      const hash = themeHash(there);
      assert.equal(hash, themeHash(here), `${r.name}: the theme's hash moved`);
      if (r.hash) assert.equal(hash, r.hash, `${r.name}: the theme's hash is not the link digest's`);
      for (const spell of SPELLS)
        assert.deepEqual(seasonOf(there, spell as any), seasonOf(here, spell as any), `${r.name}: a held bird seasons the worker's plan otherwise`);
      checked += 1;
    }
    assert.equal(checked, all.length);
    console.log(`plan worker: ${checked} plans and programs byte-identical to this thread's (${all.filter((r) => r.hash).length} of them the link digest's hashes, ${all.filter((r) => r.bypass).length} under a bypass)`);
  } finally {
    await worker.stop();
  }
});

test('a request the worker cannot take is refused before it is asked, and planned here', () => {
  const { seed, request } = quiet(() => played('seed=1&v=2'));
  // a stated style that is not its strategy's own (a bench's) stays on this thread
  assert.equal(askOf(seed, 0, { ...request, style: { ...styleOfAsk(request) } as any }), null);
  // an unknown mode throws here, as the plan would
  assert.equal(askOf(seed, 0, { ...request, development: 'nonsense' as any }), null);
  // and the page's destination never crosses
  const ask = askOf(seed, 0, { ...request, destination: {} as any, lookahead: 0.1 } as any)!;
  assert.ok(!('destination' in ask.opts) && !('style' in ask.opts));
});

// The control names a plan by its reach as a number (`reachOf`), so a stopped
// ring (the style's own, none) and a playing set (nought) share one plan: that
// holds only while the two plan alike, which this says over the grid.
test('the style\'s own reach and nought plan the same theme, byte for byte', () => {
  let n = 0;
  for (const row of grid()) {
    if (row.themes) continue;
    const { seed, request, read } = quiet(() => played(row.link));
    const i = read.link.theme ?? 0;
    const { reach: _r, ...own } = request as any;
    const a = quiet(() => planTheme(seed, i, own)), b = quiet(() => planTheme(seed, i, { ...own, reach: 0 }));
    assert.ok(bytes({ ...a, style: null }) === bytes({ ...b, style: null }), `${row.link}: the style's own reach plans otherwise than nought`);
    n += 1;
  }
  assert.ok(n > 100);
});
