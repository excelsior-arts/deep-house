// The clock's worker is one body (R93 of the reconciled review of 09-24, landed
// in round (f)): `clockBody` in `src/clock-worker.ts`, which the build inlines
// as the worker and which `src/clock.ts` writes into its blob with
// `toString()` when there is no build. There is no second copy left to hold to
// the first, so this holds the one body to its behaviour — a start ticks at its
// period, a second start replaces the first, a stop stops it, and a stop before
// any start is harmless — and `clock.ts` to making its blob from that body and
// no text of its own.
//
//   node --test tools/check-clock-worker.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

type Worker = (msg: unknown) => void;
const SRC = new URL('../src/', import.meta.url);

// The body's text, run in a scope of its own that stands in for a worker's: its
// posts are counted, its intervals are the real ones.
function load(text: string): { send: Worker; posts: () => number } {
  let posts = 0;
  const scope: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: () => void } = {
    onmessage: null,
    postMessage: () => { posts++; },
  };
  new Function('scope', text)(scope);
  return { send: (m) => scope.onmessage!({ data: m }), posts: () => posts };
}

// The bundled worker runs `clockBody` on its scope, and the blob is
// `clockBody`'s own text: the gate runs the text the blob is made of.
const { clockBody } = await import('../src/clock-worker.ts');
const blob = `(${clockBody.toString()})(scope);`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('the one clock body: ticks, restarts, stops, and survives a stop before a start', async () => {
  const w = load(stripTypeScriptTypes(blob, { mode: 'strip' }));
  // **Held to the clock it actually had, and never left running** (the suites'
  // round of 09-24). It waited 105 ms and wanted six to twelve ticks, which a
  // machine rendering in eight browsers does not give a niced process: five
  // ticks came, the assertion threw with the interval still running, and the
  // interval kept the test's process alive for as long as anybody waited. So
  // the ticks are waited for — six of them, a second at the most — and what is
  // held is the rule itself: one interval, so never more ticks than the time
  // that passed has room for at 10 ms. Two intervals are twice that.
  try {
    w.send({ stop: true });
    w.send({ start: 10 });
    w.send({ start: 10 });
    const began = performance.now();
    while (w.posts() < 6 && performance.now() - began < 1000) await wait(5);
    const ticked = w.posts();
    const room = Math.floor((performance.now() - began) / 10) + 1;
    assert.ok(ticked >= 6 && ticked <= room, `${ticked} ticks where ${Math.round(performance.now() - began)} ms at 10 ms has room for ${room} (two starts must be one interval)`);
    w.send({ stop: true });
    const stopped = w.posts();
    await wait(50);
    assert.equal(w.posts(), stopped, 'it ticked after a stop');
  } finally {
    w.send({ stop: true });
  }
});

test('clock.ts makes its blob from that body and no other text', () => {
  const clock = fs.readFileSync(new URL('clock.ts', SRC), 'utf8');
  assert.match(clock, /clockBody\.toString\(\)/);
  assert.doesNotMatch(clock, /setInterval\(\(\) ?=> ?postMessage/);
});
