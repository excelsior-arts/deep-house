// A parameter's line against the parameter it writes (`src/ramp.ts`): whatever
// the line says the parameter will be at an instant is what the parameter's
// own automation makes of the calls it was handed. No browser: the calls are
// recorded and played back through the Web Audio timeline's rules, written out
// below (`timeline`); `tools/ramp-continuity.ts` renders the same cases in an
// OfflineAudioContext in the browser suite.
//
//   node --test tools/check-ramp.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { line } from '../src/ramp.ts';
import type { Line } from '../src/ramp.ts';
import { StandinParam } from './standin.ts';

type Ev = { k: 'set' | 'lin' | 'exp'; v: number; t: number };

/**
 * The value a recorded parameter takes at `t`, by the Web Audio timeline: an
 * event joins the list after any at the same instant, a cancel at `c` removes
 * every event at or after `c`, a set holds from its instant, and a ramp runs
 * from the event before it to its own value at its own instant.
 */
function timeline(param: StandinParam, initial: number): (t: number) => number {
  const evs: Ev[] = [];
  for (const e of param.events) {
    if (e[0] === 'cancel') {
      const c = e[1] as number;
      for (let i = evs.length - 1; i >= 0; i--) if (evs[i].t >= c) evs.splice(i, 1);
    } else if (e[0] === 'set' || e[0] === 'lin' || e[0] === 'exp') {
      const ev: Ev = { k: e[0], v: e[1] as number, t: e[2] as number };
      let at = evs.length;
      while (at > 0 && evs[at - 1].t > ev.t) at--;
      evs.splice(at, 0, ev);
    }
  }
  return (t: number) => {
    let v = initial, t0 = 0;
    for (const e of evs) {
      if (e.t <= t) { v = e.v; t0 = e.t; continue; }
      if (e.k === 'set') return v;
      const k = (t - t0) / (e.t - t0);
      if (e.k === 'exp' && v > 0 && e.v > 0) return v * Math.pow(e.v / v, k);
      return v + (e.v - v) * k;
    }
    return v;
  };
}

const agree = (l: Line, param: StandinParam, initial: number, from: number, to: number, what: string) => {
  const real = timeline(param, initial);
  for (let t = from; t <= to + 1e-9; t += 0.05) {
    assert.ok(Math.abs(l.at(t) - real(t)) < 1e-9, `${what}: at ${t.toFixed(2)} the line reads ${l.at(t)} and the parameter is at ${real(t)}`);
  }
};

// E03 of the outside review of 10-03, its own counterexample: a curve written
// from inside a longer ramp. The write cancelled nothing and kept the crossing
// ramp in the history, so the line read .55 at 5.5 where the parameter was at
// .25, and the old ramp's endpoint at ten was still scheduled after the curve.
test('a curve written from inside a longer ramp replaces it: the parameter and its line agree at every instant', () => {
  const p = new StandinParam('overlap', 0);
  const l = line({ currentTime: 0 }, p, 0);
  l.to(1, 0, 10);
  l.write([{ v: 0.2, t: 5, k: 'set' }, { v: 0.3, t: 6, k: 'lin' }], 5);
  assert.ok(Math.abs(l.at(4) - 0.4) < 1e-12, 'the part of the ramp that played before the write is kept');
  assert.equal(l.at(5.5), 0.25);
  assert.equal(l.at(7), 0.3, 'the old ramp\'s endpoint outlived the curve that replaced it');
  agree(l, p, 0, 0, 12, 'a curve over a ramp');
  // and the next command starts from where both of them are
  l.to(0, 6.5, 0.5);
  agree(l, p, 0, 0, 12, 'a ramp after the curve');
});

test('a curve whose first point is after the instant it is written from carries on from where the line had got to', () => {
  const p = new StandinParam('later', 0);
  const l = line({ currentTime: 0 }, p, 0);
  l.to(1, 0, 10);
  l.write([{ v: 20, t: 6, k: 'set' }, { v: 2, t: 8, k: 'exp' }], 4);
  assert.ok(Math.abs(l.at(5) - 0.4) < 1e-12, 'the ramp under way was not held where it was cut');
  agree(l, p, 0, 0, 12, 'a curve beginning later');
});

test('a curve written over an exponential leg, then claimed part-way, agrees with its parameter throughout', () => {
  const p = new StandinParam('exp', 20000);
  const l = line({ currentTime: 0 }, p, 20000);
  l.write([{ v: 20000, t: 0, k: 'set' }, { v: 700, t: 16, k: 'exp' }], 0);
  // a hand-over written again from inside it, with another curve: the record's
  // filter that was closing now stands open until two bars from the end
  l.write([{ v: 20000, t: 12, k: 'set' }, { v: 700, t: 16, k: 'exp' }], 6);
  agree(l, p, 20000, 0, 18, 'a seam written again');
  // and a hand-over abandoned: the claim opens it from where it stands
  l.to(20000, 9, 0.08);
  agree(l, p, 20000, 0, 18, 'a seam claimed');
});

test('a curve written twice from the same instant is the second curve, not both', () => {
  const p = new StandinParam('twice', 1);
  const l = line({ currentTime: 0 }, p, 1);
  l.write([{ v: 1, t: 2, k: 'set' }, { v: 0, t: 4, k: 'lin' }], 2);
  l.write([{ v: 1, t: 2, k: 'set' }, { v: 0.5, t: 3, k: 'lin' }], 2);
  assert.equal(l.at(3.5), 0.5);
  agree(l, p, 1, 0, 6, 'a curve written again');
});
