// The slowdown watch (round audio-slack, `src/slowdown.ts`), driven by clocks
// made here: a render clock that moves in whole buffers, as a context's does,
// at a rate the case sets, and a tick with jitter. Each case says what the
// watch must find: nothing in plain play at any buffer, nothing across a
// suspend, a frozen page or a start, and a slowdown of the right length
// wherever the render was made to lose time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slowDetector, slowThrottle, SLOW } from '../src/slowdown.ts';
import { REPORT_CAPS, REPORTED_KINDS, isReported } from '../src/ledger.ts';
import type { Entry } from '../src/ledger.ts';
import type { Slowdown } from '../src/slowdown.ts';

interface Case {
  seconds: number;
  /** the render's rate at a wall second */
  rate?: (t: number) => number;
  /** the clock's step, in ms (a buffer) */
  step?: number;
  /** the context running at a wall second */
  running?: (t: number) => boolean;
  /** a stretch with no ticks at all, [from, to) in seconds */
  gap?: [number, number];
  /** the render catching up after it fell behind (Chromium's muted sink did) */
  catchUp?: boolean;
  /** rests (a start), at these seconds */
  settles?: number[];
  tickMs?: number;
}

/** A tiny seeded generator, so a case is the same every run. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function run(c: Case, seed = 1): Slowdown[] {
  const found: Slowdown[] = [];
  let wall = 1000;
  const det = slowDetector({ out: 'element', now: () => wall, hidden: () => false, found: (s) => found.push(s) });
  const rand = rng(seed);
  const step = (c.step ?? 21.33) / 1000;
  const tick = c.tickMs ?? 25;
  let render = 0;       // the render's own time, seconds
  let owed = 0;         // what it fell behind, for a catch-up
  let last = 0;
  const settles = [...(c.settles ?? [])];
  det.settle();
  while (wall - 1000 < c.seconds * 1000) {
    const dt = tick + (rand() - 0.5) * 10;
    const t0 = (wall - 1000) / 1000;
    wall += dt;
    const t = (wall - 1000) / 1000;
    const running = c.running ? c.running(t) : true;
    if (running) {
      const r = c.rate ? c.rate(t) : 1;
      render += (dt / 1000) * r;
      owed += (dt / 1000) * (1 - r);
      if (c.catchUp && r >= 1 && owed > 0) { const back = Math.min(owed, dt / 1000 * 4); render += back; owed -= back; }
    }
    if (c.gap && t >= c.gap[0] && t < c.gap[1]) continue;
    while (settles.length && settles[0] <= t && settles[0] > t0 - 1) { settles.shift(); det.settle(); }
    // the clock as a page reads it: the last whole buffer rendered, with a wobble of when the buffer landed
    const seen = Math.floor(render / step) * step;
    det.sample(seen, running);
    last = t;
  }
  det.flush();
  void last;
  return found;
}

const between = (from: number, to: number, r: number) => (t: number) => (t >= from && t < to ? r : 1);

test('plain play at every buffer: no slowdown in five minutes', () => {
  for (const step of [2.67, 5.33, 10.67, 21.33, 42.67, 85.33]) {
    for (const seed of [1, 2, 3]) {
      const f = run({ seconds: 300, step }, seed);
      assert.equal(f.length, 0, `a ${step} ms buffer, seed ${seed}: ${JSON.stringify(f)}`);
    }
  }
});

test('plain play with a slow tick (a hidden page woken once a second): none', () => {
  for (const tickMs of [250, 1000]) {
    const f = run({ seconds: 300, tickMs, step: 21.33 });
    assert.equal(f.length, 0, `${tickMs} ms ticks: ${JSON.stringify(f)}`);
  }
});

test('a render held to half time for two seconds: one slowdown, two seconds long', () => {
  for (const step of [2.67, 21.33, 42.67]) {
    const f = run({ seconds: 20, step, rate: between(8, 10, 0.5) });
    assert.equal(f.length, 1, `${step} ms: ${JSON.stringify(f)}`);
    assert.ok(Math.abs(f[0].ms - 2000) <= 150, `${step} ms: ${f[0].ms} ms`);
    assert.ok(f[0].low >= 0.4 && f[0].low <= 0.56, `${step} ms: low ${f[0].low}`);
    assert.ok(Math.abs(f[0].lostMs - 1000) <= 60, `${step} ms: lost ${f[0].lostMs}`);
  }
});

test('and the same with the render catching up after (no second slowdown out of the catch-up)', () => {
  const f = run({ seconds: 20, step: 2.67, rate: between(8, 10, 0.45), catchUp: true });
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.ok(Math.abs(f[0].ms - 2000) <= 150, `${f[0].ms} ms`);
});

test('a mild slowdown is found, and its length is near', () => {
  const ten = run({ seconds: 20, rate: between(6, 7, 0.9) });
  assert.equal(ten.length, 1, JSON.stringify(ten));
  assert.ok(Math.abs(ten[0].ms - 1000) <= 200, `0.9 for 1 s: ${ten[0].ms} ms`);
  const three = run({ seconds: 20, rate: between(6, 10, 0.97) });
  assert.equal(three.length, 1, JSON.stringify(three));
  assert.ok(Math.abs(three[0].ms - 4000) <= 600, `0.97 for 4 s: ${three[0].ms} ms`);
});

test('below what can be told from a buffer\'s wobble: nothing', () => {
  assert.equal(run({ seconds: 20, rate: between(6, 9, 0.99) }).length, 0, '0.99 for 3 s (30 ms lost)');
  // a stall this short is a click and not a wow; one of 150-300 ms is sized
  // coarsely on a 21 ms buffer (a few ticks of rise: 250-430 ms read for 150)
  assert.equal(run({ seconds: 20, rate: between(6, 6.1, 0.5) }).length, 0, 'half time for 100 ms (50 ms lost, too short)');
});

test('two slowdowns three seconds apart, on a render that never catches up: two', () => {
  const f = run({ seconds: 30, rate: (t) => (t >= 6 && t < 8) || (t >= 11 && t < 12) ? 0.7 : 1 });
  assert.equal(f.length, 2, JSON.stringify(f));
  assert.ok(Math.abs(f[0].ms - 2000) <= 200 && Math.abs(f[1].ms - 1000) <= 200, JSON.stringify(f.map((s) => s.ms)));
});

test('a suspended context, a frozen page and a start: none', () => {
  assert.equal(run({ seconds: 30, running: (t) => !(t >= 5 && t < 12) }).length, 0, 'suspended for 7 s');
  // the render stopped with the page (a phone that froze the app): no ticks, then a jump
  assert.equal(run({ seconds: 30, gap: [5, 12], rate: between(5, 12, 0) }).length, 0, 'a page frozen for 7 s');
  // a start's own stumble in its first second is not judged
  assert.equal(run({ seconds: 20, settles: [10], rate: between(10.1, 10.6, 0.3) }).length, 0, 'the first second after a start');
  // ...but the same stumble later is
  assert.equal(run({ seconds: 20, settles: [10], rate: between(12, 12.6, 0.3) }).length, 1, 'two seconds after a start');
});

test('the thresholds are the ones the round measured', () => {
  assert.deepEqual({ ...SLOW }, { RATE: 0.98, MIN_MS: 250, LOST_MS: 40, NOISE_MS: 15, EDGE_MS: 150, BASE_MS: 3000, RISE_MS: 5, HOLD_MS: 500, RATE_MS: 500, SETTLE_MS: 1000, GAP_MS: 2500 });
});

test('the reports: the first slowdown of a session, then one each ten minutes with the count and the longest since', () => {
  assert.equal(REPORT_CAPS.slowEveryMs, 10 * 60 * 1000);
  const gate = slowThrottle();
  const min = 60_000;
  assert.deepEqual(gate(400, 1 * min), { count: 1, longest: 400 }, 'the first is sent');
  assert.equal(gate(900, 2 * min), null);
  assert.equal(gate(300, 9 * min), null);
  assert.deepEqual(gate(500, 11.5 * min), { count: 3, longest: 900 }, 'ten minutes on: the three since, the longest of them');
  assert.equal(gate(2000, 12 * min), null);
  assert.deepEqual(gate(100, 40 * min), { count: 2, longest: 2000 });
  // and a slowdown line is one the reports carry
  const line = { n: 1, at: 0, clock: null, seed: '1', theme: 1, bar: 3, kind: 'slow', what: 'the sound slowed for 900 ms', fields: { ms: 900 } } as Entry;
  assert.ok(isReported(line));
  assert.ok(REPORTED_KINDS.some((r) => r.kind === 'slow'));
});
