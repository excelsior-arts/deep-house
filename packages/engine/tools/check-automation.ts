// The automation writer, against recording parameters: what a program line is
// turned into, command by command. No browser; `test.ts` renders the same line
// offline and reads the sample back.
//
//   node --test tools/check-automation.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleLine, relayLine, EXP_FLOOR, SHARED_PATHS } from '../src/master.ts';
import { StandinParam } from './standin.ts';
import type { AutomationLine } from '../src/program.ts';

const graphWith = (param: StandinParam) => ({ g: { gain: param } });
const exp = (points: Array<[number, number]>): AutomationLine =>
  ({ param: 'g.gain', curve: 'exponential', points: points.map(([t, value]) => ({ t, value })) }) as AutomationLine;

test('an exponential line to 0.25 ramps to 0.25, not to the old floor of 60 (R73)', () => {
  const p = new StandinParam('g', 1);
  scheduleLine(graphWith(p), exp([[0, 1], [2, 0.25]]));
  const ramps = p.events.filter((e) => e[0] === 'exp');
  assert.deepEqual(ramps, [['exp', 0.25, 2]]);
});

test('an exponential line to nought ends on the floor, which is read', () => {
  const p = new StandinParam('g', 1);
  scheduleLine(graphWith(p), exp([[0, 1], [1, 0]]));
  assert.equal(EXP_FLOOR, 1e-5);
  assert.deepEqual(p.events.filter((e) => e[0] === 'exp'), [['exp', EXP_FLOOR, 1]]);
});

test('a line joined inside a segment that starts at nought writes a number, never NaN', () => {
  const p = new StandinParam('g', 0);
  scheduleLine(graphWith(p), exp([[0, 0], [2, 1]]), 1);
  const set = p.events.find((e) => e[0] === 'set')!;
  assert.ok(Number.isFinite(set[1] as number) && (set[1] as number) > 0, `the join wrote ${set[1]}`);
  assert.deepEqual(p.events.filter((e) => e[0] === 'exp'), [['exp', 1, 2]]);
});

test('the record\'s own lines are written as they were: every point of a filter line over 60 Hz is its own value', () => {
  // The only exponential lines any strategy writes are the macro filter's, and
  // their lowest point is 700 Hz (measured over the golden themes of both), so
  // the floor moving from 60 to EXP_FLOOR writes the same commands for them.
  const pts: Array<[number, number]> = [[0, 18000], [8, 700], [16, 2400.5], [24, 18000]];
  for (const from of [0, 3, 8, 11.25]) {
    const p = new StandinParam('g', 18000);
    scheduleLine(graphWith(p), exp(pts), from);
    const old = new StandinParam('g', 18000);
    // The writer as it stood before R73, for values it could not floor.
    const i = pts.findIndex(([t]) => t > from);
    const [a, b] = [pts[i - 1], pts[i]];
    const k = (from - a[0]) / (b[0] - a[0]);
    old.cancelScheduledValues(0);
    old.setValueAtTime(a[1] * Math.pow(Math.max(1e-6, b[1] / a[1]), k), from);
    for (let j = i; j < pts.length; j++) old.exponentialRampToValueAtTime(Math.max(60, pts[j][1]), Math.max(from + 0.001, pts[j][0]));
    assert.deepEqual(p.events, old.events, `joined at ${from}`);
  }
});

test('a program line cannot name the master every deck shares (R92)', () => {
  for (const head of SHARED_PATHS) {
    const line = { param: `${head}.gain`, curve: 'linear', points: [{ t: 0, value: 1 }] } as AutomationLine;
    assert.throws(() => scheduleLine({ [head]: { gain: new StandinParam('x', 1) } }, line), /every deck shares/);
  }
});

test('a relay after a glide reads the same floored events: to 0.25, and from nought, a number (R73 in curveEvents)', () => {
  const p = new StandinParam('g', 1);
  const line = exp([[0, 1], [2, 0.25], [4, 0]]);
  scheduleLine(graphWith(p), line);
  const n = p.events.length;
  relayLine(graphWith(p), line, 0, [0, 2, 4], [0, 2.5, 5], 1);
  const relaid = p.events.slice(n);
  assert.ok(relaid.every((e) => e.slice(1).every((x) => Number.isFinite(x as number))), `a relay wrote ${JSON.stringify(relaid)}`);
  assert.deepEqual(relaid.filter((e) => e[0] === 'exp').slice(-2).map((e) => e[1]), [0.25, EXP_FLOOR]);
  const z = new StandinParam('g', 0);
  const up = exp([[0, 0], [2, 1]]);
  scheduleLine(graphWith(z), up);
  const m = z.events.length;
  relayLine(graphWith(z), up, 0, [0, 2], [0, 3], 1);
  assert.ok(z.events.slice(m).every((e) => e.slice(1).every((x) => Number.isFinite(x as number) && (x as number) >= 0)), `from nought: ${JSON.stringify(z.events.slice(m))}`);
});
