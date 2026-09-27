// How the machine's suites run their renders side by side (the suites' round of
// 09-24): a bounded number at once, their lines printed in the order a serial
// run prints them, and what a clock can see kept apart from what it cannot.
//
// Three things, each small:
//
//   `lanes(n)`   a pool: at most n of the jobs handed to it run at once, in the
//                order they were handed over. An offline render is a function
//                of its program and not of how many other renders the machine
//                is doing, so a pool changes when a reading arrives and never
//                what it is.
//   `captured`   the lines a stretch of async work prints, kept instead of
//                printed, so two engines can run at once and still be read one
//                after the other. It is `AsyncLocalStorage`, so every `ok` and
//                `FAIL` a suite writes lands in the stretch it was written from
//                without being handed a buffer.
//   `alone`      a job that measures time — a real deck against the clock, the
//                milliseconds an effect costs — waits until every job of the
//                pool has finished, and then runs with nothing else of this
//                process running beside it, one at a time.
//
// `--jobs N` is the pool's size and `--jobs 1` the serial suite.
//
// **Alone means alone on the machine, when a runner says so.** `tools/test-all.ts`
// runs `test.ts` and `test-effects-2.ts` at once, and a timed job in one must
// not share the machine with the other's renders. So the runner hands both a
// folder (`DEEP_HOUSE_LANES`) and the number of suites in it
// (`DEEP_HOUSE_LANES_OF`): a suite whose pool has emptied says so there, a
// timed job waits until every suite has, and the timed jobs of all of them take
// one lock, one at a time. A suite run on its own has no folder and its timed
// jobs wait for its own pool alone.

import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k: string): string | null => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? null : process.argv[i + 1];
};

/**
 * `--jobs N`, or `DEEP_HOUSE_JOBS=N` in the environment — which is the one that
 * survives `npm run` (`DEEP_HOUSE_JOBS=1 npm run test:engine` is the serial
 * suite; npm takes a bare `--jobs` for one of its own flags) — or the default
 * the suite measured for itself.
 */
export function jobsArg(fallback: number): number {
  const n = Math.floor(Number(arg('jobs') ?? process.env.DEEP_HOUSE_JOBS));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

// The runner's folder, when there is one: `<pid>.idle` is a suite whose pool
// has emptied for good, and `lock/` is held by whichever timed job is running.
const GROUP = process.env.DEEP_HOUSE_LANES || null;
const GROUP_OF = Number(process.env.DEEP_HOUSE_LANES_OF) || 1;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let saidIdle = false;
function sayIdle(): void {
  if (!GROUP || saidIdle) return;
  saidIdle = true;
  try { fs.writeFileSync(path.join(GROUP, `${process.pid}.idle`), ''); } catch { /* the runner has gone */ }
}
// A suite that stops early — a skip, a throw — has nothing left to render
// either, and the others must not wait for it.
if (GROUP) process.on('exit', sayIdle);
async function everyoneIdle(): Promise<void> {
  if (!GROUP) return;
  sayIdle();
  while (fs.readdirSync(GROUP).filter((f) => f.endsWith('.idle')).length < GROUP_OF) await pause(100);
}
async function lock(): Promise<() => void> {
  if (!GROUP) return () => {};
  const at = path.join(GROUP, 'lock');
  for (;;) {
    try { fs.mkdirSync(at); break; } catch { await pause(100); }
  }
  return () => { try { fs.rmdirSync(at); } catch { /* already gone */ } };
}

const sink = new AsyncLocalStorage<string[]>();

/** A line, to the stretch being captured or else to the terminal. */
export function say(line: string): void {
  const lines = sink.getStore();
  if (lines) lines.push(line);
  else console.log(line);
}

/** Run `fn` with every line it says kept, and hand the lines back with its value. */
export async function captured<T>(fn: () => Promise<T>): Promise<{ lines: string[]; value: T }> {
  const lines: string[] = [];
  const value = await sink.run(lines, fn);
  return { lines, value };
}

/** A pool of `n`, and the one question the timed jobs ask of it: is it idle? */
export interface Lanes {
  /** run `fn` when a lane is free; the promise is its result */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** no more jobs will be handed over by `who` (each participant says so once) */
  done(who: string): void;
  /** run `fn` once every participant is done, the pool is empty and no other timed job is running */
  alone<T>(fn: () => Promise<T>): Promise<T>;
}

export function lanes(n: number, participants: string[]): Lanes {
  let running = 0;
  const waiting: Array<() => void> = [];
  const open = new Set(participants);
  let idle: Array<() => void> = [];
  // What the pool has left, told to the runner once it is nothing.
  let turn: Promise<unknown> = Promise.resolve();
  const settle = () => {
    if (running === 0 && waiting.length === 0 && open.size === 0) {
      sayIdle();
      const wake = idle;
      idle = [];
      for (const w of wake) w();
    }
  };
  const next = () => {
    while (running < n && waiting.length) {
      running++;
      waiting.shift()!();
    }
    settle();
  };
  const quiet = () => new Promise<void>((resolve) => { idle.push(resolve); settle(); });
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      // Bound to the stretch that handed it over, so what it says is captured
      // there and not in whichever stretch's job happened to free the lane.
      const bound = AsyncLocalStorage.bind(fn);
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          bound().then(resolve, reject).finally(() => { running--; next(); });
        });
        next();
      });
    },
    done(who: string) {
      open.delete(who);
      settle();
    },
    alone<T>(fn: () => Promise<T>): Promise<T> {
      const mine = turn.then(() => quiet()).then(everyoneIdle).then(lock).then(async (release) => {
        try { return await fn(); } finally { release(); }
      });
      turn = mine.catch(() => {});
      return mine;
    },
  };
}
