// **The planner's worker** (the planning perf round, 10-12): themes planned
// off the page's thread. A pull planned its theme on the page's own thread —
// 50 to 130 ms for the Drum & Bass tile, in one task, while the scheduler
// pumps notes from that thread — and the ring planned again under a drag, and
// the die's twelve candidates in idle slots that were long tasks of their own.
//
// It is the very call the page makes (`answerAsk`, `src/plan-ask.ts`): the
// same modules, loaded again here, the same request, and an answer that is
// the page's plan byte for byte (`tools/check-plan-worker.ts`). No DOM, no
// audio: a plan needs neither.
//
// One plan at a time, the asks a hand is waiting on first (`pri` 1) and the
// ones made ahead after (`pri` 0), oldest first within each; an ask with a
// `tag` replaces one with the same tag that has not begun (the ring's promise
// under a moving hand wants only the latest value), and the replaced one is
// answered `dropped`. The last few answers are kept, so the same theme asked
// twice — the mix's landing and the ring's coming card are the same plan — is
// planned once — and compiled once, where the program is asked for too (a
// set's landing wants it; the ring's readings do not).

import { answerOf, askKey, planAsked } from './plan-ask.ts';
import type { PlanAsk, Planned } from './plan-ask.ts';

interface Job { id: number; ask: PlanAsk; pri: number; tag: string | null }

const scope = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent<Job>) => void) | null };
const queue: Job[] = [];
const memo = new Map<string, Planned>();
const MEMO = 6;
let queued = false;

scope.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  if (job.tag != null) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].tag !== job.tag) continue;
      scope.postMessage({ id: queue[i].id, dropped: true });
      queue.splice(i, 1);
    }
  }
  queue.push(job);
  soon();
};

// Each plan is a task of its own, so an ask that arrives while one is being
// made is in the queue before the next is chosen.
function soon(): void {
  if (queued || !queue.length) return;
  queued = true;
  setTimeout(next, 0);
}

function next(): void {
  queued = false;
  if (!queue.length) return;
  let best = 0;
  for (let i = 1; i < queue.length; i++) if (queue[i].pri > queue[best].pri) best = i;
  const job = queue.splice(best, 1)[0];
  try {
    const key = askKey(job.ask);
    let made = memo.get(key);
    if (made) memo.delete(key);
    else made = planAsked(job.ask);
    memo.set(key, made);
    if (memo.size > MEMO) memo.delete(memo.keys().next().value!);
    scope.postMessage({ id: job.id, answer: answerOf(made, job.ask.program) });
  } catch (err) {
    // the page plans it again on its own thread, where it throws what it throws
    scope.postMessage({ id: job.id, error: String((err as Error)?.message ?? err) });
  }
  soon();
}
