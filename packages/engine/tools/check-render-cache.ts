// The render cache every voice that renders ahead stands on (R30 of the
// reconciled review of 09-24): a failure is not a buffer, renders are rationed,
// and one asked for by a note being scheduled does not start inside that call.
// Since the outside review of 10-03 (E01, E02): a permit is one offline context,
// counted where it is made, and a map's cap holds when its entries land.
//
//   node --test tools/check-render-cache.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { cached, job, bound, holding, MAX_JOBS, renderJobs } from '../src/voices/render-cache.ts';
import { bodiesFor, drumBodies } from '../src/voices/drumkit.ts';
import type { DrumInstrument } from '../src/voices/drumkit.ts';

const later = <T>(v: T, fail = false) => new Promise<T>((ok, no) => setTimeout(() => (fail ? no(new Error('no')) : ok(v)), 5));

test('a render that fails leaves its key empty, and the next ask renders again', async () => {
  const ctx = {} as BaseAudioContext;
  const per = new Map<string, number | Promise<number>>();
  let made = 0;
  const first = cached(per, ctx, 'k', () => { made++; return later(1, true); });
  await assert.rejects(first as Promise<number>);
  assert.equal(per.has('k'), false, 'the rejected promise stayed under its key');
  const second = cached(per, ctx, 'k', () => { made++; return later(2); });
  assert.equal(await second, 2);
  assert.equal(per.get('k'), 2);
  assert.equal(made, 2);
});

test(`no more than ${MAX_JOBS} renders run at once on a context, and the rest run in the order asked`, async () => {
  const ctx = {} as BaseAudioContext;
  let running = 0, most = 0;
  const order: number[] = [];
  const all = Array.from({ length: 11 }, (_, i) => job(ctx, async () => {
    running++; most = Math.max(most, running); order.push(i);
    await later(0); running--; return i;
  }));
  assert.deepEqual(await Promise.all(all), [...Array(11).keys()]);
  assert.equal(most, MAX_JOBS);
  assert.deepEqual(order, [...Array(11).keys()]);
  assert.deepEqual({ running: renderJobs(ctx).running, queued: renderJobs(ctx).queued }, { running: 0, queued: 0 });
});

test('a render asked for from the play path does not start inside the call that asked', async () => {
  const ctx = {} as BaseAudioContext;
  const per = new Map<string, number | Promise<number>>();
  let started = false;
  const got = cached(per, ctx, 'k', () => { started = true; return later(3); }, true);
  assert.equal(started, false, 'the render started on the tick');
  assert.ok(got instanceof Promise);
  assert.equal(await got, 3);
  assert.equal(started, true);
});

test('a bounded map lets its oldest buffers go and keeps what is still rendering, outside the cap', () => {
  const per = new Map<string, number | Promise<number>>();
  const pending = new Promise<number>(() => {});
  per.set('a', pending);
  for (let i = 0; i < 10; i++) per.set(`b${i}`, i);
  bound(per, 4);
  // The cap is on completed entries (E02 of 10-03): the one in flight is
  // owned by whoever waits for it, and is neither evicted nor counted.
  assert.deepEqual([...per.keys()], ['a', 'b6', 'b7', 'b8', 'b9']);
  assert.deepEqual(holding(per), { ready: 4, flight: 1 });
});

// E02 of the outside review of 10-03, its own counterexample: eight entries
// asked for under a cap of four, all in the air at once, then all landing.
// The map used to settle at eight completed entries.
test('a bounded map is held to its cap when what was in flight lands, keeping what just landed', async () => {
  const ctx = {} as BaseAudioContext;
  const per = new Map<string, number | Promise<number>>();
  const land: Array<() => void> = [];
  const asks: Array<number | Promise<number>> = [];
  for (let i = 0; i < 8; i++) {
    asks.push(cached(per, ctx, `${i}`, () => new Promise<number>((ok) => land.push(() => ok(i)))));
    bound(per, 4);
  }
  assert.deepEqual(holding(per), { ready: 0, flight: 8 });
  // the last to land is the first: it must survive its own landing even
  // though it is the oldest entry in the map
  land.reverse();
  for (const go of land) { go(); await new Promise((r) => setImmediate(r)); }
  assert.deepEqual(await Promise.all(asks), [...Array(8).keys()], 'every waiter was handed its own value');
  assert.deepEqual(holding(per), { ready: 4, flight: 0 });
  assert.equal(per.get('0'), 0, 'the entry that just landed was evicted by its own landing');
});

// E01 of the outside review of 10-03, its own counterexample: four drum
// articulations of three variants each, asked for at once. The permit was a
// job around the bundle, so four permits were twelve OfflineAudioContexts
// alive; a permit is one context now, counted where it is constructed.
test(`four three-variant drum articulations never have more than ${MAX_JOBS} offline contexts alive, and a bundle wider than the permits still finishes`, async () => {
  const was = globalThis.OfflineAudioContext;
  let alive = 0, most = 0, made = 0;
  const finish: Array<() => void> = [];
  class Recorder {
    destination = {};
    length: number;
    sampleRate: number;
    constructor(_channels: number, length: number, sampleRate: number) {
      this.length = length; this.sampleRate = sampleRate;
      alive++; made++; most = Math.max(most, alive);
    }
    startRendering() {
      return new Promise((ok) => finish.push(() => { alive--; ok({ duration: this.length / this.sampleRate }); }));
    }
  }
  globalThis.OfflineAudioContext = Recorder as unknown as typeof OfflineAudioContext;
  try {
    const ctx = { sampleRate: 4000 } as BaseAudioContext;
    const inst: DrumInstrument = { id: 'checkDrum', seed: 0, spec: () => ({ key: 'x', seconds: 0.01, t10: 0.1 }), variant: (s) => s, build: () => {} };
    // one bundle of six variants, more than the permits: it must not wait on
    // permits it is itself holding
    const asks = [0, 1, 2, 3].map((i) => bodiesFor(ctx, inst, { key: `v${i}`, seconds: 0.01, t10: 0.1, variants: 3 }));
    asks.push(bodiesFor(ctx, inst, { key: 'wide', seconds: 0.01, t10: 0.1, variants: 6 }));
    assert.equal(alive, MAX_JOBS, 'the first permits were not all taken');
    assert.equal(renderJobs(ctx).contexts, alive, 'the telemetry did not count the contexts constructed');
    let done = false;
    const all = Promise.all(asks).then(() => { done = true; });
    while (!done) {
      assert.ok(alive <= MAX_JOBS, `${alive} offline contexts alive at once`);
      finish.splice(0).forEach((f) => f());
      await new Promise((r) => setImmediate(r));
    }
    await all;
    assert.equal(made, 18);
    assert.equal(most, MAX_JOBS);
    assert.equal(renderJobs(ctx).contexts, 0);
    assert.deepEqual(drumBodies(ctx), { ready: 5, flight: 0 });
    for (const k of ['v0', 'v1', 'v2', 'v3']) assert.ok(Array.isArray(bodiesFor(ctx, inst, { key: k, seconds: 0.01, t10: 0.1, variants: 3 })), `${k} is not read back ready`);
  } finally {
    globalThis.OfflineAudioContext = was;
  }
});
