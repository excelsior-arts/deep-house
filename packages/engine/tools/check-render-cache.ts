// The render cache every voice that renders ahead stands on (R30 of the
// reconciled review of 09-24): a failure is not a buffer, renders are rationed,
// and one asked for by a note being scheduled does not start inside that call.
//
//   node --test tools/check-render-cache.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { cached, job, bound, MAX_JOBS, renderJobs } from '../src/voices/render-cache.ts';

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

test('a bounded map lets its oldest buffers go and keeps what is still rendering', () => {
  const per = new Map<string, number | Promise<number>>();
  const pending = new Promise<number>(() => {});
  per.set('a', pending);
  for (let i = 0; i < 10; i++) per.set(`b${i}`, i);
  bound(per, 4);
  assert.deepEqual([...per.keys()], ['a', 'b7', 'b8', 'b9']);
});
