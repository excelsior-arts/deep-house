// The transport's time and its supersede paths, in node.
//
// The live transport has faults no render can show and no digest can see: a
// render pours a whole theme at once and a digest hashes values, and what goes
// wrong on a page is *when* — a swell reached after its onset, a filter laid on
// a grid the tempo has since left, a move that a second move overtook and left
// half done. The reconciled review of 09-24 (`notes/reviews/RECONCILED-2026-
// 09-24.md`, round (a)) found them by probe, and each probe is a test here.
//
// The set is played on the engine's live stand-in (`@deep-house/engine/
// standin`): a context that records what every parameter is told and renders
// nothing, with a clock this file moves. The mix's own tick is taken off the
// timer it would run on and called here, a tick per 25 ms of the context's
// clock, so a minute of a set is a second of node and nothing depends on how
// busy the machine is.

import test from 'node:test';
import assert from 'node:assert/strict';
import { liveStandin } from '@deep-house/engine/standin';
import { schedule, firstEvent, offsetGrid, visitAt } from '@deep-house/engine/schedule';
import { makeSetClock } from '@deep-house/engine/set-clock';
import { TICK_MS } from '@deep-house/engine/clock';
import { planTheme, programOf, createMix } from '../src/mix.ts';
import { VOICES } from '@deep-house/engine/voices';
import { makeDeck, pourDeck, deckContextTime, holdsOnGrid } from '@deep-house/engine/deck';
import { makeV1Master } from '@deep-house/engine/graph';
import { layOut } from '../src/set-plan.ts';
import { seamTempo, playsKick, sameFormTime } from '../src/performance.ts';
import { seamCurves, setOptions } from '../src/set-plan.ts';
import { STRATEGIES } from '../src/strategies/index.ts';
import { outputClipWriter, lines as ledgerLines, isReported, CLIP_EPISODE_MS } from '../src/ledger.ts';

// --- a set, played by hand --------------------------------------------------

// The mix's tick runs on `setInterval` where there is no Worker, which is here.
// Every interval at the tick's period is held instead of started, and `play`
// calls it; any other interval is the platform's.
const ticks = new Set<() => void>();
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
(globalThis as any).setInterval = (fn: () => void, ms?: number, ...rest: unknown[]) => {
  if (ms === TICK_MS) { ticks.add(fn); return { tick: fn }; }
  return realSetInterval(fn as any, ms, ...rest);
};
(globalThis as any).clearInterval = (h: any) => {
  if (h && typeof h.tick === 'function') ticks.delete(h.tick);
  else realClearInterval(h);
};

const turn = () => new Promise<void>((r) => setImmediate(r));

/** Move a live context's clock on by `seconds`, a tick at a time. */
async function play(ctx: { currentTime: number }, seconds: number): Promise<void> {
  const end = ctx.currentTime + seconds;
  while (ctx.currentTime < end - 1e-9) {
    ctx.currentTime = Math.min(end, ctx.currentTime + TICK_MS / 1000);
    for (const fn of [...ticks]) fn();
    await turn();
  }
}

/** Until something is so, a tick at a time, for at most `seconds` of the set. */
async function until(ctx: { currentTime: number }, ok: () => boolean, seconds: number): Promise<boolean> {
  const end = ctx.currentTime + seconds;
  while (ctx.currentTime < end) { if (ok()) return true; await play(ctx, TICK_MS / 1000); }
  return ok();
}

// The page's lines are the page's; a gate prints its own.
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};

async function aSet(seed = '1', strategy = 'house-v2', opts: Record<string, unknown> = {}) {
  const ctx = liveStandin();
  const mix = quiet(() => createMix(ctx, { masterSeed: seed, strategy, destination: ctx.destination as any, bypass: null, ...opts } as any));
  const log = console.log; console.log = () => {};
  try { await mix.start(0, 0); } finally { console.log = log; }
  await play(ctx, 1);
  return { ctx, mix };
}

// --- R1: the swell ------------------------------------------------------------

test('every anticipatory event is reached by the live pump at or before its onset, over 48 themes', () => {
  // Seeds 1-12, their first two themes, both strategies: the reconciler's probe,
  // which found all 22 swells in them reached 1.5 to 1.8 s after their onset.
  let n = 0, worst = -Infinity;
  const by: Record<string, number> = {};
  for (const strategy of ['house-v1', 'house-v2']) {
    for (let seed = 1; seed <= 12; seed++) for (const i of [0, 1]) {
      const program = quiet(() => programOf(planTheme(seed, i, { strategy })));
      let cursor = 0;
      for (let now = 0; cursor < program.events.length; now += TICK_MS / 1000) {
        const run = schedule(program, offsetGrid(0), cursor, now + 0.12);
        for (const s of run.events) if (s.pe.lead > 0) { n++; by[strategy] = (by[strategy] ?? 0) + 1; worst = Math.max(worst, now - s.pe.onset); }
        cursor = run.next;
      }
      // and a start at the onset begins with it
      for (const e of program.events) if (e.lead > 0) {
        const k = firstEvent(program, e.onset);
        assert.ok(schedule(program, offsetGrid(0), k, e.onset).events.some((s) => s.pe === e),
          `a start at ${e.onset} misses the swell that begins there (${seed}#${i}, ${strategy})`);
        assert.ok(visitAt(program, k).onset >= e.onset);
      }
    }
  }
  // The reconciler counted 22, twelve of them house-v1's. House-v2's lead-ins
  // (round (g), R34) put a swell on returns the one shared spacing used to
  // refuse, so its ten became thirteen; since the palette only biases the
  // lead-in, one dry return of them rises instead and they are twelve. The
  // record's twelve do not move. Round S4 made house-v2's themes a fifth
  // shorter, so fewer returns and fewer swells: eight.
  // Round S14 took the house's noise glue off its dark casts, the swell among
  // it, so house-v2 carries one; the pump the rule is about is one pump, and
  // the record's twelve still hold it.
  assert.deepEqual(by, { 'house-v1': 12, 'house-v2': 1 }, `the 48 themes carry ${JSON.stringify(by)} anticipatory events`);
  assert.equal(n, 13);
  assert.ok(worst <= 1e-9, `an anticipatory event was reached ${worst.toFixed(3)} s after its onset`);
});

// --- R32: the set clock keeps the night ----------------------------------------

test('the set clock answers for the whole night after 40 hand-overs, gliding as far as 104 to 169 BPM', () => {
  // A set's clock across forty seams: pinned for a blend, then gliding to the
  // arriving theme's tempo over sixteen bars, the pin always after the last
  // glide is done. Every beat's instant is written down while it is recent and
  // asked again at the end: nothing that has been played may move, and nothing
  // may be NaN. With sixteen segments kept, `timeAt(32)` was NaN after twenty.
  const tempi = [104, 169.1, 122, 54.3, 124, 118, 169.1, 104];
  const clock = makeSetClock(60 / 104, 0);
  const seen: Array<[number, number]> = [];
  let beat = 0;
  for (let k = 0; k < 40; k++) {
    beat += 96;                      // a theme's worth of beats after the glide
    clock.pin(beat);                 // the blend
    beat += 32;
    clock.glide(beat, 60 / tempi[k % tempi.length], 64);
    for (let b = beat - 128; b <= beat; b += 16) seen.push([b, clock.timeAt(b)]);
  }
  for (const [b, t] of seen) {
    const now = clock.timeAt(b);
    assert.ok(Number.isFinite(now), `timeAt(${b}) is ${now}`);
    assert.ok(Math.abs(now - t) < 1e-6, `beat ${b} was at ${t.toFixed(4)} s and is now at ${now.toFixed(4)} s`);
    assert.ok(Math.abs(clock.beatAt(now) - b) < 1e-6, `beatAt(timeAt(${b})) is ${clock.beatAt(now)}`);
  }
  assert.ok(Math.abs(clock.timeAt(32) - 32 * 60 / 104) < 1e-9, `the night's first bars moved: timeAt(32) is ${clock.timeAt(32)}`);
});

// --- R136, R83: the seam's fades start from where they are --------------------

/** A set picked up a little before its first theme's own seam, and played into the blend. */
async function inABlend(into = 1, seed = '1', strategy = 'house-v2') {
  const ctx = liveStandin();
  const mix = quiet(() => createMix(ctx, { masterSeed: seed, strategy, destination: ctx.destination as any, bypass: null } as any));
  const first = quiet(() => planTheme(seed, 0, { strategy }));
  const { seamPlan } = await import('../src/performance.ts');
  const seam = seamPlan(first, first.blendBars || 8, {});
  const log = console.log; console.log = () => {};
  try { await mix.start(0, seam.at - 2); } finally { console.log = log; }
  const began = await until(ctx, () => mix.state.transition > 0, 6);
  assert.ok(began, 'the seam never began');
  await play(ctx, into);
  return { ctx, mix, seam, first };
}

// The last command after the last cancel a parameter was given, and where.
const afterCancel = (p: any) => {
  const ev = p.events as any[];
  let i = ev.length - 1;
  while (i >= 0 && ev[i][0] !== 'cancel') i--;
  return i < 0 ? null : { at: ev[i][1], next: ev[i + 1] };
};

test('a skip inside a blend holds the arriving fader and the sum where their ramps had got to, not at param.value', async () => {
  const { ctx, mix } = await inABlend(1.2);
  const arriving = mix.state.incoming;
  assert.ok(arriving, 'no theme was arriving');
  const skipped = mix.skip();
  // The skip lands the arriving theme at once and claims it: its fader was on
  // its way up from 0.0001, and the claim has to begin where that fade is.
  const record = mix.record!;
  const fader = afterCancel(record.fader.gain);
  assert.ok(fader, 'the arriving fader was never claimed');
  const [op, v, t] = fader.next;
  assert.ok((op === 'exp' || op === 'lin') && t === fader.at,
    `the claim stamped ${op} ${v} at ${t} where the fade it cut short should have been written back to ${fader.at}`);
  // An exponential fade from 0.0001 is still low a second in; what matters is
  // that it is neither where it began nor the 1 `param.value` reads.
  assert.ok(v > 0.00011 && v < 0.999, `the fade was held at ${v}, which is where it began or ended and not where it was`);
  const sum = afterCancel(mix.mixOut.gain);
  assert.ok(sum, 'the sum was never brought back');
  assert.ok(sum.next[0] === 'lin' && sum.next[2] === sum.at && sum.next[1] < 1 && sum.next[1] > 0.5,
    `the sum was held at ${sum.next[1]} by a ${sum.next[0]} at ${sum.next[2]}, not where its dip had got to at ${sum.at}`);
  await skipped;
  mix.stop();
});

test('a seek inside a blend lets the record go of the seam, so a skip that overtakes the seek cuts from a clean deck', async () => {
  const { ctx, mix } = await inABlend(1);
  const outgoing = mix.record!;
  assert.ok(outgoing.gaps, 'the outgoing deck had no hole cut in it by the seam');
  const seeking = mix.seek(20);
  assert.equal(outgoing.gaps, null, 'the deck the seek is leaving still has the seam\'s holes in it while the landing is built');
  const skipping = mix.skip();
  await seeking; await skipping;
  await play(ctx, 0.2);
  mix.stop();
});

// --- R2, R82: the curves follow the grid through a glide -------------------------

// What a parameter has been left holding: its log with every cancel applied.
const timeline = (p: any) => {
  let out: any[] = [];
  for (const e of p.events as any[]) {
    if (e[0] === 'cancel') out = out.filter((x) => x[2] < e[1]);
    else out.push(e);
  }
  return out;
};

// Every curve point of a deck laid past `after` is where the grid now puts it.
function curvesOnGrid(deck: any, after: number): { worst: number; points: number } {
  let worst = 0, points = 0;
  for (const line of deck.program.automation) {
    const param = deck.param(line.param) as any;
    const want = line.points.map((p: any) => ({ t: deck.grid.at(p.t), v: p.value })).filter((p: any) => p.t > after).sort((a: any, b: any) => a.t - b.t);
    const got = timeline(param).filter((e: any) => e[0] !== 'set' && e[2] > after).sort((a: any, b: any) => a[2] - b[2]);
    assert.equal(got.length, want.length, `${line.param}: ${got.length} points on the parameter past ${after.toFixed(2)} s where the curve has ${want.length}`);
    for (let i = 0; i < want.length; i++) { worst = Math.max(worst, Math.abs(got[i][2] - want[i].t)); points++; }
  }
  return { worst, points };
}

test('a cast from 96 to 104 BPM glides after the blend, and the filter, the melodic gain, the push and the echoes follow the glide (R2)', async () => {
  // A near move (8 %): blended on the outgoing grid, then glided after the
  // blend — the one kind of seam whose glide runs under the arriving deck.
  const { ctx, mix } = await aSet('19', 'house-v2');
  const bpm0 = 60 / mix.state.beatSeconds;
  const asked = await mix.cast('1');
  assert.ok(asked, 'the cast armed no hand-over');
  await until(ctx, () => mix.state.transition > 0, 30);
  await until(ctx, () => mix.state.transition === 0, 90);
  const record = mix.record!;
  const glideFrom = ctx.currentTime;
  await play(ctx, 2);
  const { worst, points } = curvesOnGrid(record, glideFrom + 1);
  const bpm1 = 60 / record.program.beat;
  assert.ok(bpm1 - bpm0 > 7, `the cast went from ${bpm0.toFixed(1)} to ${bpm1.toFixed(1)} BPM, not the near move this is about`);
  assert.ok(points > 10, `only ${points} curve points to compare`);
  assert.ok(worst < 1e-6, `a curve point is ${worst.toFixed(3)} s off the grid the notes are on`);
  const echo = timeline(record.param('echo.time'));
  const last = echo[echo.length - 1];
  const dotted = record.settings.sends.delayDotted;
  assert.ok(last && Math.abs(last[1] - dotted * record.program.beat) < 1e-9,
    `the delay is left at ${last ? last[1] : 'its build'} s where a dotted eighth at ${bpm1.toFixed(1)} BPM is ${(dotted * record.program.beat).toFixed(4)} s`);
  assert.ok(Math.abs(record.graph.beat - record.program.beat) < 1e-9, 'the graph still reports the beat it was built on');
  mix.stop();
});

test('a pull from 104 to 169 BPM rides the record to 169 before the blend, its curves and echoes with it, and the arriving theme is built at its own tempo (R2, the seam\'s tempo rule)', async () => {
  const { ctx, mix } = await aSet('1', 'house-v2');
  const bpm0 = 60 / mix.state.beatSeconds;
  const outgoing = mix.record!;
  const asked = await mix.setSpell({ ember: 1 });
  assert.ok(asked, 'the pull armed no hand-over');
  // the ride: the glide on the clock that begins at the line and ends where the blend begins
  const ride = outgoing.clock.segments.find((g) => Number.isFinite(g.beats) && Math.abs(g.spb1 - g.spb0) > 1e-12 && g.t0 >= ctx.currentTime - 1e-6);
  assert.ok(ride && Math.abs(outgoing.clock.timeAt(ride.b0 + ride.beats) - asked.at) < 1e-6, 'the grid is not ridden to the blend\'s start');
  await play(ctx, 1);
  // the record's own curves, re-laid for the ride from its first instant
  const { worst, points } = curvesOnGrid(outgoing, ride!.t0 + 1e-3);
  assert.ok(points > 10, `only ${points} curve points to compare`);
  assert.ok(worst < 1e-6, `a curve point of the record is ${worst.toFixed(3)} s off the grid it is riding`);
  // through the swap: the arriving theme is the record, at its own tempo
  await until(ctx, () => mix.record !== outgoing, 120);
  const record = mix.record!;
  const bpm1 = 60 / record.program.beat;
  assert.ok(bpm1 - bpm0 > 50, `the pull went from ${bpm0.toFixed(1)} to ${bpm1.toFixed(1)} BPM, not across the range this is about`);
  const echo = timeline(outgoing.param('echo.time'));
  const last = echo[echo.length - 1];
  const dotted = outgoing.settings.sends.delayDotted;
  assert.ok(last && Math.abs(last[1] - dotted * record.program.beat) < 1e-9,
    `the record's delay is left at ${last ? last[1] : 'its build'} s where a dotted eighth at ${bpm1.toFixed(1)} BPM is ${(dotted * record.program.beat).toFixed(4)} s`);
  assert.ok(Math.abs(record.graph.beat - record.program.beat) < 1e-9,
    `the arriving theme was built on a beat of ${record.graph.beat} s, not its own ${record.program.beat}`);
  mix.stop();
});

// --- the seam's tempo rule: near, half and double, far ---------------------------

test('the seam\'s tempo rule: a drift glides sixteen bars, a near move a bar a percent, a half or double one is counted two to one, a far one is ridden first', () => {
  const o = { tempoGlideBars: 16 };
  const at = (a: number, b: number) => seamTempo(a, b, o);
  // drift: the set's own, at every tempo family (a tenth of a BPM a minute over a 145-bar theme)
  for (const bpm of [49.3, 54.3, 104.1, 126.1, 169.1]) {
    const step = Math.ceil(145 * 0.1 * 10 / bpm) / 10 + 0.1;
    assert.deepEqual(at(bpm, bpm + step), { kind: 'drift', ratio: (bpm + step) / bpm, perBeat: 1, ride: 0, glide: 16 }, `${bpm} → ${bpm + step}`);
  }
  // near: a bar a percent, never past sixteen, and no ride
  assert.equal(at(104, 108.16).glide, 4, 'a 4 % nudge glides four bars');
  assert.equal(at(104, 112).glide, 8, '104 → 112 glides eight');
  assert.equal(at(104, 122).glide, 16, '104 → 122 (17 %) glides sixteen, the most');
  for (const [a, b] of [[104, 112], [112, 104], [104, 88.5], [104, 122.5]]) {
    const r = at(a, b);
    assert.equal(r.kind, 'near', `${a} → ${b}`);
    assert.equal(r.ride, 0); assert.equal(r.perBeat, 1);
  }
  // half and double: the doubled or halved ratio within 8 %, what is left a near glide
  assert.deepEqual(at(104, 208), { kind: 'double', ratio: 2, perBeat: 2, ride: 0, glide: 16 });
  assert.deepEqual(at(104, 52), { kind: 'half', ratio: 0.5, perBeat: 0.5, ride: 0, glide: 16 });
  assert.equal(at(54.3, 104.1).kind, 'double');
  assert.equal(at(54.3, 104.1).glide, 5, '54.3 → 104.1 leaves 4.1 % to glide');
  assert.equal(at(104.1, 54.3).kind, 'half');
  // far: ridden first, eight bars an octave, four at least, sixteen at most
  for (const [a, b, ride] of [[49.3, 126.1, 11], [126.1, 49.3, 11], [104.1, 169.1, 6], [104, 124, 4], [101.1, 126.1, 4], [49, 300, 16]]) {
    const r = at(a, b);
    assert.equal(r.kind, 'far', `${a} → ${b} is ${r.kind}`);
    assert.equal(r.ride, ride, `${a} → ${b} rides ${r.ride} bars`);
    assert.equal(r.glide, 0); assert.equal(r.perBeat, 1);
  }
  // the bands meet: every ratio is exactly one of them, and the glide never grows past its ceiling
  for (let r = 0.3; r < 3.5; r += 0.001) {
    const x = at(100, 100 * r);
    assert.ok(x.glide <= 16 && x.ride <= 16 && (x.ride === 0 || x.glide === 0), `${r.toFixed(3)}: ${JSON.stringify(x)}`);
  }
});

/** A pull or a cast measured on the stand-in: when the blend begins, what the arriving theme is heard at there, and when it is on its tempo. */
async function tempoSeam(seed: string, spell: any, move: (mix: any) => Promise<any>) {
  const { ctx, mix } = await aSet(seed, 'house-v2', spell ? { spell } : {});
  await play(ctx, 18);
  const first = mix.record!;
  const t0 = ctx.currentTime;
  const p = await move(mix);
  assert.ok(p && p.at, 'the move armed no hand-over');
  const said = t0 + mix.state.settleIn;
  const clock = first.clock;
  const heard = (t: number, per = 1) => (60 / clock.spbAt(clock.beatAt(t))) * per;
  const at0 = heard(t0 + 0.01, first.perBeat ?? 1);
  await until(ctx, () => mix.record !== first, 200);
  const record = mix.record!;
  const own = 60 / record.program.beat;
  const firstNote = heard(p.at + 1e-3, record.perBeat ?? 1);
  let reached = -1;
  await until(ctx, () => {
    if (Math.abs(60 / mix.state.beatSeconds - own) < 0.05) { reached = ctx.currentTime; return true; }
    return false;
  }, 200);
  mix.stop();
  return { from: at0, own, firstNote, perBeat: record.perBeat ?? 1, blendIn: p.at - t0, blend: p.end - p.at, swap: p.swapAt, said, reached, t0 };
}

test('a far jump is ridden before the blend: 49 → 126 BPM and back, the arriving theme sounds at its own tempo from its first note, and settleIn says when', async () => {
  for (const [spell, to] of [[{ ember: 0 }, { ember: 0.7 }], [{ ember: 0.7 }, { ember: 0 }]]) {
    const r = await tempoSeam('27191', spell, (m) => m.setSpell(to));
    assert.ok(Math.abs(r.firstNote - r.own) < 1e-6, `${r.from.toFixed(1)} → ${r.own.toFixed(1)}: the arriving theme's first note is at ${r.firstNote.toFixed(2)} BPM`);
    assert.ok(Math.abs(r.reached - r.swap) < 0.1, `the tempo read is the target at ${r.reached - r.t0} s, the swap at ${r.swap - r.t0} s`);
    assert.ok(Math.abs(r.said - r.reached) < 0.5, `settleIn said ${(r.said - r.t0).toFixed(1)} s and the tempo was heard at ${(r.reached - r.t0).toFixed(1)} s`);
  }
});

test('a near move blends beat-matched on the outgoing grid and glides a bar a percent after: 96 → 104 BPM in nine bars, and settleIn says when', async () => {
  const r = await tempoSeam('19', null, (m) => m.cast('1'));
  assert.ok(Math.abs(r.firstNote - r.from) < 0.05, `the arriving theme's first note is at ${r.firstNote.toFixed(2)} BPM, not the outgoing ${r.from.toFixed(2)}`);
  const bars = seamTempo(r.from, r.own).glide;
  assert.equal(bars, 9);
  const barS = 240 / ((r.from + r.own) / 2);
  const glideS = r.reached - (r.t0 + r.blendIn + r.blend);
  assert.ok(Math.abs(glideS - bars * barS) < 2, `the glide took ${glideS.toFixed(1)} s where ${bars} bars at about ${((r.from + r.own) / 2).toFixed(1)} BPM is ${(bars * barS).toFixed(1)} s`);
  assert.ok(Math.abs(r.said - r.reached) < 1, `settleIn said ${(r.said - r.t0).toFixed(1)} s and the tempo was heard at ${(r.reached - r.t0).toFixed(1)} s`);
});

test('a half or double move is counted two to one on the shared grid: 104 → 54 and 54 → 104 BPM, no glide in the blend and what is left glided after', async () => {
  for (const [spell, to, per] of [[{ ember: 0.5 }, { ember: 0 }, 0.5], [{ ember: 0 }, { ember: 0.5 }, 2]] as const) {
    const r = await tempoSeam('1', spell, (m) => m.setSpell(to));
    assert.equal(r.perBeat, per, `${r.from.toFixed(1)} → ${r.own.toFixed(1)} counted ${r.perBeat}:1`);
    assert.ok(Math.abs(r.firstNote - r.from * per) < 0.05, `the arriving theme's first note is at ${r.firstNote.toFixed(2)} BPM, not ${per} × ${r.from.toFixed(2)}`);
    assert.ok(Math.abs(r.said - r.reached) < 1.5, `settleIn said ${(r.said - r.t0).toFixed(1)} s and the tempo was heard at ${(r.reached - r.t0).toFixed(1)} s`);
  }
});

test('a drummed theme after a drone enters on its kick, and a drone after a drummed theme leaves it its kick to the end: the kick is holed only where two would overlap', () => {
  const drone = planTheme('27191', 1, { strategy: 'house-v2', spell: { ember: 0 } } as any);
  const drums = planTheme('27191', 1, { strategy: 'house-v2', spell: { ember: 0.7 } } as any);
  const kicks = { drone: playsKick(programOf(drone)), drums: playsKick(programOf(drums)) };
  assert.deepEqual(kicks, { drone: false, drums: true });
  const style = STRATEGIES['house-v2'].style;
  const o = setOptions(style, {});
  const m = { at: 0, bars: 8, barSeconds: 2, swapAt: 16, filterMove: null, outgoingBar: 2, swapInFrom: 16, swapInTo: 16, sumGain: null };
  const kickHoles = (fromKick?: boolean, toKick?: boolean) => seamCurves({ ...m, fromKick, toKick }, o).holes
    .filter((h) => h.group === o.swapGroup).map((h) => h.deck).sort().join(',');
  assert.equal(kickHoles(), 'from,to', 'a seam inside one set holes both');
  assert.equal(kickHoles(true, true), 'from,to');
  assert.equal(kickHoles(false, false), 'from,to', 'two drones hole as they did (the benchmark)');
  assert.equal(kickHoles(false, true), 'from', 'a drummed theme after a drone keeps its kick from its first bar');
  assert.equal(kickHoles(true, false), 'to', 'a drummed theme before a drone keeps its kick to the end');
});
// --- a held note through a ride ------------------------------------------------

test('a held note ends on its beat of the grid through a far ride: 126 → 49 on 27191\'s spell, the breakdown\'s pad covers bars 20 to 24 as the plan wrote it', () => {
  // The fault pass of 09-24: the ride slows the outgoing theme from 126 to 49
  // through its breakdown, and a note's length was a count of seconds fixed at
  // its onset — the pad at bar 20, four bars at 126 (7.61 s), covered two of
  // the stretched bars and left the breakdown silent before the drone entered.
  const BENCH = { ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const style = STRATEGIES['house-v2'].style;
  const o = { strategy: 'house-v2', themeBars: 32 } as any;
  const A = quiet(() => planTheme('27191', 1, { ...o, spell: { ...BENCH, ember: 0.7 } }));
  const B = quiet(() => planTheme('27191', 2, { ...o, spell: BENCH }));
  const L = layOut([A, B], { ...setOptions(style, {}), style });
  assert.ok(seamTempo(A.bpm, B.bpm).kind === 'far', `${A.bpm} → ${B.bpm} is not a far move`);
  const ctx: any = liveStandin();
  const program = programOf(A);
  const fired: { voice: string; time: number; dur: number; onset: number }[] = [];
  const real: Record<string, any> = {};
  for (const name of Object.keys(VOICES)) {
    real[name] = (VOICES as any)[name];
    (VOICES as any)[name] = (c: any, out: any, time: number, p: any, st: any, at?: number) => {
      if (typeof p?.dur === 'number') fired.push({ voice: name, time, dur: p.dur, onset: at ?? NaN });
      return real[name](c, out, time, p, st, at);
    };
  }
  try {
    const master = makeV1Master(ctx, program.settings);
    const deck = makeDeck(ctx, A, program, master.input, master, L.clock, L.starts[0], L.perBeats[0]);
    deck.startBeat = L.startBeats[0];
    pourDeck(ctx, deck, L.seams[0].at);
    const bs = program.barSeconds;
    const at = (bar: number) => deckContextTime(deck, bar * bs);
    const pads = program.events.filter((e) => e.voice === 'pad' && Math.abs(e.onset - 20 * bs) < 1e-6);
    assert.ok(pads.length > 0, 'the breakdown has no pad at bar 20');
    const heard = fired.filter((f) => f.voice === 'pad' && Math.abs(f.time - at(20)) < 1e-3);
    assert.equal(heard.length, pads.length, `${heard.length} pad notes fired at bar 20 where the plan has ${pads.length}`);
    for (const f of heard) {
      const planned = deckContextTime(deck, 20 * bs + pads[0].p.dur);
      assert.ok(Math.abs(f.time + f.dur - planned) < 1e-6, `a pad at bar 20 ends at ${(f.time + f.dur).toFixed(2)} s where the grid puts its bar ${(20 + pads[0].p.dur / bs).toFixed(2)} at ${planned.toFixed(2)} s`);
      assert.ok(f.dur > pads[0].p.dur * 1.3, `the ride stretched nothing: ${f.dur.toFixed(2)} s against the plan's ${pads[0].p.dur.toFixed(2)}`);
    }
    // and every held note of the deck ends where the grid puts its theme end; a hit keeps its seconds
    let held = 0, kept = 0;
    for (const f of fired) {
      const e = program.events.find((x) => x.voice === f.voice && Math.abs(deckContextTime(deck, x.onset) - f.time) < 1e-6 && typeof x.p.dur === 'number');
      if (!e) continue;
      if (holdsOnGrid(f.voice)) { held++; assert.ok(Math.abs(f.time + f.dur - deckContextTime(deck, e.onset + e.p.dur)) < 1e-6, `${f.voice} at ${f.time.toFixed(2)} s ends off the grid`); }
      else { kept++; assert.equal(f.dur, e.p.dur, `${f.voice}, a voice with its own envelope, had its seconds changed`); }
    }
    assert.ok(held > 20, `only ${held} held notes seen`);
  } finally {
    for (const name of Object.keys(real)) (VOICES as any)[name] = real[name];
  }
});

// --- a bird move keeps the place ------------------------------------------------

/** Where a deck's own bar is at a context instant. */
const barOf = (d: any, t: number) => (d.clock.beatAt(t) - d.startBeat) * (d.perBeat ?? 1) / 4;

test('a bird move keeps the place: the same theme under the asked spell enters at the bar the record is at, on the phrase line, and the form goes on (Eugene, 09-24)', async () => {
  for (const [seed, spell, move] of [
    ['51757', { ember: 0.16, tide: 1, root: 0.81, loom: 1 }, { root: 0.43 }],
    ['1', null, { zephyr: 0.19 }],
    ['1', null, { ember: 0.7 }],
  ] as const) {
    const { ctx, mix } = await aSet(seed, 'house-v2', spell ? { spell } : {});
    await play(ctx, 40);
    const out = mix.record!;
    const p = await mix.setSpell({ ...mix.spell, ...move });
    assert.ok(p && p.at, `${seed} ${JSON.stringify(move)}: no hand-over`);
    await until(ctx, () => mix.record !== out, 200);
    const inn = mix.record!;
    const at = p.at;
    assert.equal(inn.track.index, out.track.index, `${seed} ${JSON.stringify(move)}: the move brought theme ${inn.track.index + 1}, not the one playing (${out.track.index + 1})`);
    const barOut = barOf(out, at), barIn = barOf(inn, at);
    const want = sameFormTime(out.track, inn.track, barOut * out.track.barSeconds) / inn.track.barSeconds;
    assert.ok(Math.abs(barIn - want) < 1e-6, `${seed} ${JSON.stringify(move)}: the arriving plan entered at bar ${barIn.toFixed(3)} where the record was at ${barOut.toFixed(3)}`);
    assert.ok(barIn > 4 && Math.abs(barIn - Math.round(barIn)) < 1e-6, `${seed} ${JSON.stringify(move)}: the entry is bar ${barIn}, not a bar line past the intro`);
    // at the swap the record is the arriving plan at the same bar of the form
    const swapBarOut = barOf(out, p.swapAt), swapBarIn = barOf(inn, p.swapAt);
    const kind = (t: any, b: number) => t.arrangement.sections.filter((x: any) => x.startBar <= b).pop().kind;
    assert.equal(kind(inn.track, swapBarIn), kind(out.track, swapBarOut), `${seed}: the section at the swap is ${kind(inn.track, swapBarIn)} where the record was in ${kind(out.track, swapBarOut)}`);
    assert.ok(Math.abs(mix.state.elapsed - barOf(inn, ctx.currentTime) * inn.track.barSeconds) < 1e-6);
    mix.stop();
  }
});

test('a cast, a skip and an engine switch still start the theme they bring from its first bar', async () => {
  for (const go of [(m: any) => m.cast('33'), (m: any) => m.skip(), (m: any) => m.setStrategy ? m.setStrategy('house-v1') : m.skip()]) {
    const { ctx, mix } = await aSet('1');
    await play(ctx, 40);
    const out = mix.record!;
    const p = await go(mix);
    assert.ok(p && p.at, 'the move armed no hand-over');
    await until(ctx, () => mix.record !== out, 200);
    const inn = mix.record!;
    assert.ok(Math.abs(barOf(inn, p.at)) < 1e-6, `the move entered its theme at bar ${barOf(inn, p.at).toFixed(3)}, not its first`);
    mix.stop();
  }
});

// --- a pull pending at a stop ------------------------------------------------------

test('a pull on its way names where it is taking the set until it lands, from the ask through the blend, and a cast names nothing (the pending landing a stop keeps)', async () => {
  const spell = { ember: 0.16, tide: 1, root: 0.81, loom: 1 };
  const { ctx, mix } = await aSet('51757', 'house-v2', { spell });
  await play(ctx, 3);
  assert.equal(mix.pendingLanding, null, 'a set nobody has asked anything of names a landing');
  const t = mix.setSpell({ ...mix.spell, zephyr: 0.19 });
  // a bird move keeps the place: the landing is this theme, at the second the record is at
  const asked = mix.pendingLanding;
  assert.ok(asked && asked.index === 0 && Math.abs((asked.spell as any).zephyr - 0.19) < 1e-9 && Math.abs(asked.from - mix.state.elapsed) < 1e-6,
    `at the ask the pull names ${JSON.stringify(asked)}, not theme 1 under zephyr 0.19 at the record's ${mix.state.elapsed.toFixed(2)} s`);
  const p = await t;
  assert.ok(p && p.at, 'the pull armed no hand-over');
  await until(ctx, () => mix.state.transition > 0, 60);
  await play(ctx, 2);
  const inBlend = mix.pendingLanding;
  assert.ok(inBlend && inBlend.index === 0 && Math.abs(inBlend.from - mix.state.elapsed) < 0.05,
    `inside the blend the landing is ${JSON.stringify(inBlend)}, not theme 1 at the record's ${mix.state.elapsed.toFixed(2)} s`);
  const out = mix.record;
  await until(ctx, () => mix.record !== out, 120);
  assert.equal(mix.pendingLanding, null, 'a pull that has landed still names a landing');
  mix.stop();
  const cast = await aSet('1');
  await cast.mix.cast('33');
  assert.equal(cast.mix.pendingLanding, null, 'a cast in flight names a landing a stop would keep');
  cast.mix.stop();
});

// --- a second ask inside a ride ------------------------------------------------------

/**
 * A far move and a second ask while its ride is running, played on the
 * stand-in: every quarter second from the first ask to past the swap, the
 * loudest fader of the decks up (the record, the one arriving, the one playing
 * out) — the hole Eugene heard is every one of them near nought — and then
 * the tempo at the swap, the plan playing, and what settleIn said at the
 * second ask against when the tempo was heard.
 */
async function rideAndAsk(seed: string, spell: Record<string, number>, first: Record<string, number>, second: Record<string, number>) {
  const { ctx, mix } = await aSet(seed, 'house-v2', { spell });
  await play(ctx, 6);
  const outgoing = mix.record!;
  const t0 = ctx.currentTime;
  const faders = new Set<any>([outgoing]);
  const sample: { t: number; up: number; bpm: number }[] = [];
  const look = () => {
    for (const d of [mix.record, mix.playingOut, (mix as any).arriving]) if (d) faders.add(d);
    let up = 0;
    for (const d of faders) { const l = d.lineOf && d.lineOf('fader.gain'); if (l && !d.graph.disposed) up = Math.max(up, l.at(ctx.currentTime)); }
    sample.push({ t: ctx.currentTime - t0, up, bpm: 60 / (mix.record!.clock.spbAt(mix.record!.clock.beatAt(ctx.currentTime))) });
  };
  const p1 = mix.setSpell({ ...mix.spell, ...first });
  const a = await p1;
  assert.ok(a && a.at, 'the first ask armed no hand-over');
  // once the ride is under way: the grid has left the tempo it started at by a percent
  const bpm0 = 60 / mix.state.beatSeconds;
  for (let k = 0; k < 800 && Math.abs(60 / mix.state.beatSeconds - bpm0) < bpm0 * 0.01; k++) { await play(ctx, 0.25); look(); }
  assert.ok(mix.state.transition === 0 && Math.abs(60 / mix.state.beatSeconds - bpm0) >= bpm0 * 0.01, 'the ride never got under way before its blend');
  const asked = { ...mix.spell, ...first, ...second };
  const p2 = mix.setSpell(asked);
  await play(ctx, 0.05);
  const said = ctx.currentTime + mix.state.settleIn;
  const b = await p2;
  let reached = -1, landed: any = null;
  const until2 = ctx.currentTime + 400;
  while (ctx.currentTime < until2) {
    await play(ctx, 0.25); look();
    const r = mix.record!;
    if (r !== outgoing && !landed) landed = { t: ctx.currentTime, track: r.track };
    if (landed && sameAsked(mix.spell, asked) && Math.abs(60 / mix.state.beatSeconds - 60 / r.program.beat) < 0.05) { reached = ctx.currentTime; break; }
  }
  for (let k = 0; k < 8; k++) { await play(ctx, 0.25); look(); }
  const r = mix.record!;
  const want = planTheme(seed, r.track.index, { strategy: 'house-v2', spell: asked } as any);
  const out = { sample, secondAt: said - mix.state.settleIn, second: b, said, reached, landedPlan: r.track, want, bpmNow: 60 / mix.state.beatSeconds, own: 60 / r.program.beat, t0 };
  mix.stop();
  return out;
}
const sameAsked = (x: any, y: any) => !!x && Object.keys(y).every((k) => Math.abs((x[k] ?? 0) - y[k]) < 1e-9);
const sig = (t: any) => JSON.stringify(t.dice) + '|' + t.bars + '|' + t.bpm + '|' + t.events.length;

test('a second ask inside a far ride keeps the ride: 43 → 101 BPM with Loom asked mid-ride, the record never falls silent, the swap is at the target, and the plan is both values', async () => {
  const r = await rideAndAsk('51757', { ember: 0.16, tide: 1, root: 0.81, loom: 0.578 }, { ember: 0.55 }, { loom: 1 });
  const hole = r.sample.filter((x) => x.up < 0.3);
  assert.equal(hole.length, 0, `the loudest fader fell under 0.3 at ${hole.slice(0, 5).map((x) => `${x.t.toFixed(2)} s (${x.up.toFixed(3)})`).join(', ')}`);
  assert.ok(r.reached > 0, 'the tempo never reached the landing');
  // the grid goes on from where the ride had reached: it never leans back down on the way up
  const grid = r.sample.map((x) => x.bpm);
  const back = grid.findIndex((v, k) => k > 0 && v < grid[k - 1] - 1e-6);
  assert.equal(back, -1, `the grid leaned back from ${grid[back - 1]?.toFixed(2)} to ${grid[back]?.toFixed(2)} BPM at ${r.sample[back]?.t.toFixed(2)} s`);
  assert.equal(sig(r.landedPlan), sig(r.want), 'the plan playing after the swap is not the one for both values');
  assert.ok(Math.abs(r.said - r.reached) < 1, `settleIn at the second ask said ${(r.said - r.t0).toFixed(1)} s and the tempo was heard at ${(r.reached - r.t0).toFixed(1)} s`);
});

test('a second ask inside a far ride down keeps it too, and a second Ember re-aims the ride from the tempo it has reached', async () => {
  const down = await rideAndAsk('51757', { ember: 0.55, tide: 1, root: 0.81, loom: 0.578 }, { ember: 0.16 }, { loom: 1 });
  assert.equal(down.sample.filter((x) => x.up < 0.3).length, 0, 'a hole in the ride down');
  assert.equal(sig(down.landedPlan), sig(down.want), 'the ride down landed another plan than both values');
  assert.ok(Math.abs(down.said - down.reached) < 1, `down: settleIn said ${(down.said - down.t0).toFixed(1)} s, heard at ${(down.reached - down.t0).toFixed(1)} s`);
  const reaim = await rideAndAsk('51757', { ember: 0.16, tide: 1, root: 0.81, loom: 0.578 }, { ember: 0.55 }, { ember: 0.75 });
  assert.equal(reaim.sample.filter((x) => x.up < 0.3).length, 0, 'a hole in the re-aimed ride');
  assert.equal(sig(reaim.landedPlan), sig(reaim.want), 'the re-aimed ride landed another plan than the second Ember');
  assert.ok(Math.abs(reaim.own - reaim.want.bpm) < 1e-9 && Math.abs(reaim.bpmNow - reaim.own) < 0.05, `the re-aimed ride landed at ${reaim.bpmNow.toFixed(1)} BPM for ${reaim.want.bpm}`);
  assert.ok(Math.abs(reaim.said - reaim.reached) < 1, `re-aim: settleIn said ${(reaim.said - reaim.t0).toFixed(1)} s, heard at ${(reaim.reached - reaim.t0).toFixed(1)} s`);
});

// --- a modulation source is never summed into a note ---------------------------------

test('the ambient spell\'s last forty bars on 27191 (theme 11 into the seam to 12 until round S19, theme 7 since) build no LFO into a pad: every lfoParam insert is a wire, every other insert still built', async () => {
  // Eugene on 96f81df: "melodic reached full scale — peak 3.1, gr 6.29" at
  // bars 229–231, the mix into theme 12. The live meters put the pad bus at
  // +10 dBFS from bar 221, before the blend: the rota's lfoParam on the pads,
  // a modulation source whose output was summed into each note at the depth
  // the rota writes for every effect.
  const { insert } = await import('../../engine/src/voices/treat.ts');
  const spell = { ember: 0.10, tide: 0.85, zephyr: 0.01, root: 0.50, veil: 0.30, spark: 0.00, loom: 0.80 };
  const t = quiet(() => planTheme('27191', 6, { strategy: 'house-v2', spell } as any));
  const p = programOf(t);
  const bs = p.barSeconds;
  // Bars 216-238 of a 240-bar theme until round S4 made house-v2's themes a
  // fifth shorter: it is 192 bars now and its lfoParam notes are at 160-164,
  // in its build before the seam at 176. Since round S19 cut the mains its rota
  // draws no lfoParam at all (164 bars), and theme 7, 56 bars, has eighteen in
  // its last forty. The window is the theme's last forty.
  const evs = p.events.filter((e) => e.t / bs >= t.bars - 40 && e.t / bs < t.bars && e.p && e.p.fx);
  const lfo = evs.filter((e) => e.p.fx.id === 'lfoParam');
  const other = evs.filter((e) => e.p.fx.id !== 'lfoParam');
  assert.ok(lfo.length >= 10, `only ${lfo.length} lfoParam notes in the last forty bars`);
  const ctx: any = liveStandin();
  const made: string[] = [];
  const real = ctx.createConstantSource.bind(ctx);
  ctx.createConstantSource = () => { made.push('constant'); return real(); };
  for (const e of lfo) insert(ctx, e.p, ctx.createGain(), e.onset, e.onset + (e.p.dur ?? 1), p.settings);
  assert.equal(made.length, 0, `${made.length} LFO offsets were built into ${lfo.length} pad notes`);
  const before = made.length;
  let built = 0;
  for (const e of other) { const tail = ctx.createGain(); if (insert(ctx, e.p, tail, e.onset, e.onset + (e.p.dur ?? 1), p.settings) !== tail) built++; }
  assert.equal(made.length, before);
  assert.ok(other.length === 0 || built > 0, 'no other effect insert was built');
});

// --- the supersede paths: one move, named in full ---------------------------------

test('a spell set during a cast plays the seed it reports (R9)', async () => {
  const { ctx, mix } = await aSet('1');
  const cast = mix.cast('33');
  const pull = mix.setSpell({ ember: 0.2 });
  await cast;
  const t = await pull;
  assert.ok(t, 'the pull armed no hand-over');
  await until(ctx, () => mix.state.transition > 0 && mix.state.masterSeed === '33', 60);
  await until(ctx, () => mix.record!.track.seed === '33#1' || mix.state.transition === 0, 60);
  await until(ctx, () => mix.state.transition === 0, 60);
  const seed = String(mix.record!.track.seed).split('#')[0];
  assert.equal(mix.state.masterSeed, '33');
  assert.equal(seed, mix.state.masterSeed, `the transport reports seed ${mix.state.masterSeed} and the record is ${mix.record!.track.seed}`);
  assert.deepEqual(mix.spell, { ember: 0.2 });
  mix.stop();
});

test('a seek overtaken by a skip leaves the elapsed time running (R21)', async () => {
  const { ctx, mix } = await aSet('1');
  const seeking = mix.seek(20);
  const skipping = mix.skip();
  await seeking; await skipping;
  // past the skip's own swap, so the second measured is one theme's
  await until(ctx, () => mix.state.themeIndex === 1, 10);
  await play(ctx, 1);
  const a = mix.state.elapsed;
  await play(ctx, 1);
  const b = mix.state.elapsed;
  assert.ok(Math.abs(b - a - 1) < 0.05, `the elapsed time went from ${a} to ${b} over a second`);
  assert.notEqual(a, 20);
  mix.stop();
});

test('a seek inside a cast abandons it completely: nothing casting, and the same cast can be asked again (R20)', async () => {
  const { ctx, mix } = await aSet('1');
  await mix.cast('33');
  assert.equal(mix.state.casting, true);
  await mix.seek(10);
  assert.equal(mix.state.casting, false, 'a cast the seek abandoned still says it is casting');
  assert.equal(mix.strategyAsked, 'house-v2');
  const again = await mix.cast('33');
  assert.ok(again, 'casting the abandoned seed again was ignored');
  await until(ctx, () => mix.state.masterSeed === '33', 60);
  assert.equal(mix.state.masterSeed, '33');
  mix.stop();
});

test('an engine switch taken back while it is preparing plays the engine the hand turned back to (R22)', async () => {
  const { ctx, mix } = await aSet('1', 'house-v2');
  const a = mix.setStrategy('house-v1');
  assert.equal(mix.strategyAsked, 'house-v1', 'the ask is not taken at the ask');
  const b = mix.setStrategy('house-v2');
  assert.equal(mix.strategyAsked, 'house-v2');
  await a; await b;
  await play(ctx, 90);
  assert.equal(mix.strategy, 'house-v2', `the set plays ${mix.strategy}`);
  mix.stop();
});

test('a pull overtaken by a skip is carried by the skip, and one overtaken by a seek by the next seam (R10)', async () => {
  {
    const { ctx, mix } = await aSet('1');
    const pull = mix.setSpell({ ember: 0.9 });
    const skip = mix.skip();
    await pull; await skip;
    await until(ctx, () => mix.state.themeIndex === 1 && mix.state.transition === 0, 30);
    assert.deepEqual(mix.spell, { ember: 0.9 }, `after the skip the set plays ${JSON.stringify(mix.spell)}`);
    assert.deepEqual(mix.spellAsked, { ember: 0.9 });
    mix.stop();
  }
  {
    const { ctx, mix } = await aSet('1');
    const pull = mix.setSpell({ ember: 0.9 });
    const seek = mix.seek(30);
    await pull; await seek;
    assert.deepEqual(mix.spellAsked, { ember: 0.9 }, 'the pull was forgotten');
    const t = await mix.skip();   // the next seam, asked for now rather than waited for
    assert.ok(t);
    await until(ctx, () => mix.state.themeIndex === 1 && mix.state.transition === 0, 30);
    assert.deepEqual(mix.spell, { ember: 0.9 });
    mix.stop();
  }
});

test('a seek after a pull keeps the pull\'s seasoning on the fresh deck (R11)', async () => {
  const { ctx, mix } = await aSet('1');
  mix.setSpell({ zephyr: 1, ember: 0.9 });
  const had = Object.keys(mix.seasoning!.knobs).sort().join(',');
  assert.ok(had, 'the pull seasoned nothing');
  await mix.seek(30);
  const got = Object.keys(mix.seasoning!.knobs).sort().join(',');
  assert.equal(got, had, `the fresh deck is seasoned ${got || 'with nothing'} where the deck it replaced was ${had}`);
  mix.stop();
});

test('a next pressed while a cast is being built goes on into the cast\'s set, and nothing stops (R7)', async () => {
  const { ctx, mix } = await aSet('1');
  const cast = mix.cast('33');
  const next = mix.skip();
  assert.equal(await cast, null, 'the cast was not overtaken');
  const t = await next;
  assert.ok(t, 'the next armed nothing');
  assert.equal(mix.state.running, true);
  await until(ctx, () => mix.state.masterSeed === '33' && mix.state.transition === 0, 30);
  assert.equal(mix.state.masterSeed, '33');
  assert.equal(mix.record!.track.seed, '33#1', `the next landed on ${mix.record!.track.seed}`);
  mix.stop();
});

test('a next pressed inside a seam goes to the theme after the one arriving, never to theme null', async () => {
  const { ctx, mix } = await inABlend(1);
  assert.equal(mix.state.incoming?.index, 1);
  await mix.skip();
  await until(ctx, () => mix.state.themeIndex !== 1, 30);
  assert.equal(mix.record!.track.seed, '1#2', `the skip landed on ${mix.record!.track.seed}`);
  assert.equal(mix.state.themeIndex, 2);
  mix.stop();
});

// --- the journal: presses add up, and the far end is the one that goes -----------

test('two backs inside one landing walk two entries, and two forwards two (R60)', async () => {
  const { createJournal } = await import('../src/journal.ts');
  const j = createJournal({ store: null });
  const place = (seed: string) => ({ seed, theme: 0, strategy: 'house-v2', spell: null });
  for (const s of ['a', 'b', 'c', 'd', 'e']) j.arrived(place(s));
  assert.equal(j.at, 4);
  const one = j.back();
  const two = j.back();
  assert.ok(one.kind === 'entry' && two.kind === 'entry');
  assert.equal((one as any).index, 3);
  assert.equal((two as any).index, 2, 'the second back asked for the same entry as the first');
  assert.equal(j.arrived(place('c')), 'walked');
  assert.equal(j.at, 2);
  const f1 = j.forward(); const f2 = j.forward();
  assert.equal((f1 as any).index, 3);
  assert.equal((f2 as any).index, 4);
});

test('a full journal loses its oldest entry and never its newest, at the pointer\'s front (R124)', async () => {
  const { createJournal, CAP } = await import('../src/journal.ts');
  const j = createJournal({ store: null });
  for (let i = 0; i < CAP; i++) j.arrived({ seed: String(i), theme: 0, strategy: 'house-v2', spell: null });
  // walk to the front and press back past it: a new entry in front of the first
  for (let i = CAP - 1; i > 0; i--) { j.back(); j.arrived({ seed: String(i - 1), theme: 0, strategy: 'house-v2', spell: null }); }
  assert.equal(j.at, 0);
  j.back();
  j.arrived({ seed: 'before', theme: 0, strategy: 'house-v2', spell: null });
  assert.equal(j.entries.length, CAP);
  assert.equal(j.entries[0].seed, 'before');
  assert.equal(j.entries[CAP - 1].seed, String(CAP - 1), `the newest entry went: the last is ${j.entries[CAP - 1].seed}`);
  // and a place is its spell as well
  const k = createJournal({ store: null });
  k.arrived({ seed: '1', theme: 0, strategy: 'house-v2', spell: null });
  assert.equal(k.arrived({ seed: '1', theme: 0, strategy: 'house-v2', spell: { ember: 0.7 } }), 'written');
});

// --- the listening mixer -----------------------------------------------------------

test('the listening mixer reaches the theme playing out, and a graph keeps one mixer however often it comes and goes (R51, R87)', async () => {
  const { ctx, mix } = await inABlend(1);
  await until(ctx, () => !mix.state.incoming, 30);   // past the swap: one theme playing out
  const retiring = mix.playingOut!;
  assert.ok(retiring, 'no theme was playing out');
  const solo = { mute: [], solo: ['kick'], dry: [] };
  const clean = { mute: [], solo: [], dry: [] };
  const made = () => (ctx as any).nodes.length;
  mix.setSourceMix(solo);
  const bus = retiring.graph.buses.melodic;
  assert.notEqual(retiring.graph.sourceOutput('pad', 'melodic'), bus, 'the theme playing out was not handed the solo');
  // a note routed through it is what makes a channel's gains
  const touch = () => (mix.record!.graph.sourceOutput('pad', 'melodic') as any).dry;
  touch();
  const a = made();
  for (let i = 0; i < 5; i++) { mix.setSourceMix(clean); mix.setSourceMix(solo); touch(); }
  assert.equal(made(), a, `five clean/solo cycles built ${made() - a} nodes where the mixer already there would do`);
  mix.stop();
});

// --- R12: the tick only consumes ----------------------------------------------

test('the swap plans, compiles and prepares nothing on the tick, through ten seams and five skips (R12)', async (t) => {
  // The swap used to plan the theme after the one arriving, compile it and
  // start its preparation inside the tick that hands the low end over: 4.7 ms
  // at the median and 10 at worst on thirty-two-bar themes here, a whole
  // house-v2 plan (9 ms, 30 at worst) on a real theme, four times that on a
  // phone, against a look-ahead of 0.12 s. The theme after the arriving one is
  // planned in an idle slot during the blend now; a plan or a compile the
  // tick has to make for itself is counted, and none may be.
  const ctx = liveStandin();
  const mix = quiet(() => createMix(ctx, { masterSeed: '1', strategy: 'house-v2', destination: ctx.destination as any, bypass: null, themeBars: 32 } as any));
  const log = console.log; console.log = () => {};
  try { await mix.start(0, 0); } finally { console.log = log; }
  let idx = mix.state.themeIndex, swaps = 0, worst = 0;
  const watch = async (seconds: number) => {
    const end = ctx.currentTime + seconds;
    while (ctx.currentTime < end - 1e-9) {
      ctx.currentTime += TICK_MS / 1000;
      const t0 = performance.now();
      for (const fn of [...ticks]) fn();
      const ms = performance.now() - t0;
      if (mix.state.themeIndex !== idx) { idx = mix.state.themeIndex; swaps++; worst = Math.max(worst, ms); }
      await turn();
    }
  };
  // Six minutes and not four since round S4: house-v2's seam floor is 0.82,
  // so a thirty-two-bar theme is on its own for longer before it hands over.
  await quiet(() => watch(360));
  for (let k = 0; k < 5; k++) { quiet(() => mix.skip()); await quiet(() => watch(8)); }
  t.diagnostic(`${swaps} swaps, the dearest swap tick ${worst.toFixed(2)} ms`);
  assert.ok(swaps >= 10, `only ${swaps} swaps in six minutes of thirty-two-bar themes and five skips`);
  assert.equal((mix as any).tickWork, 0, `the tick planned or compiled ${(mix as any).tickWork} themes for itself`);
  mix.stop();
});

// --- R17: a pin inside a glide leaves the beats already played where they were ----

test('a pin inside a glide moves no beat before it, at 122 to 124, 118 to 124 and 104 to 169 BPM (R17)', () => {
  for (const [a, b] of [[122, 124], [118, 124], [104, 169.1]]) {
    const clock = makeSetClock(60 / a, 0);
    clock.glide(64, 60 / b, 64);
    for (const pinAt of [72, 96, 120]) {
      const c = makeSetClock(60 / a, 0);
      c.glide(64, 60 / b, 64);
      const beats = [66, 70, 80, 90, 100, 110].filter((x) => x < pinAt);
      const before = beats.map((x) => c.timeAt(x));
      c.pin(pinAt);
      for (let i = 0; i < beats.length; i++) {
        const moved = Math.abs(c.timeAt(beats[i]) - before[i]);
        assert.ok(moved < 1e-9, `${a}→${b} BPM pinned at beat ${pinAt}: beat ${beats[i]} moved ${(moved * 1000).toFixed(1)} ms`);
      }
    }
  }
});

// --- R23: a cast brings the arriving seed's master room ------------------------------

test('a cast brings the arriving seed\'s master room: seed 20 reached by a cast plays the air seed 20 plays fresh (R23)', async () => {
  const air = async (seed: string, cast?: string) => {
    const { ctx, mix } = await aSet(seed);
    if (cast) { await mix.cast(cast); await until(ctx, () => mix.state.masterSeed === cast, 60); await play(ctx, 20); }
    const e = (mix.master.param('air.gain') as any).events;
    const v = e.length ? e[e.length - 1][1] : (mix.master.param('air.gain') as any).value;
    mix.stop();
    return v;
  };
  const fresh = await air('20');
  const reached = await air('1', '20');
  assert.equal(reached, fresh, `seed 20 plays ${fresh} dB of master air fresh and ${reached} dB reached by a cast`);
});

// Round S16: the output at full scale is heard by the limiter's processor on
// every sample, and the ledger's clip line is written from what it posts, with
// no view open and no tap anywhere. The processor is run here on a tone past
// its ceiling: under the chain as shipped (the clipper and a trim of 1) the
// limiter holds and nothing is posted; with a trim of 1.4 after it the output
// reaches full scale, and it says so at most once a second with the peak and
// the frames over; the writer turns the first post of a loud passage into one
// clip line the reports carry, and a post a second later into none.
test('S16: a tone past the ceiling reaches full scale only past a hot trim, the processor posts it at most once a second, and the ledger writes one reported clip line with the view closed', async () => {
  const g = globalThis as any;
  let Proc: any = null;
  const hadProc = g.AudioWorkletProcessor, hadReg = g.registerProcessor, hadRate = g.sampleRate;
  g.AudioWorkletProcessor = class { port: any = { posted: [] as unknown[], postMessage(m: unknown) { this.posted.push(m); } }; };
  g.registerProcessor = (_n: string, c: unknown) => { Proc = c; };
  g.sampleRate = 48000;
  try {
    await import(new URL('../../engine/src/limiter-worklet.js', import.meta.url).href + '?s16');
    const run = (post: Record<string, number>, seconds: number) => {
      const p = new Proc({ processorOptions: { lookaheadMs: 5, holdMs: 25, releaseMs: 200, post } });
      const n = 128, L = new Float32Array(n), R = new Float32Array(n), oL = new Float32Array(n), oR = new Float32Array(n);
      const at: number[] = [];
      let frame = 0;
      for (let b = 0; b < Math.ceil((seconds * 48000) / n); b++) {
        for (let i = 0; i < n; i++) { const v = 1.6 * Math.sin((2 * Math.PI * 220 * (frame + i)) / 48000); L[i] = v; R[i] = v; }
        const before = p.port.posted.length;
        p.process([[L, R]], [[oL, oR]], { ceiling: new Float32Array([0.75]) });
        frame += n;
        for (let k = before; k < p.port.posted.length; k++) if ((p.port.posted[k] as any).clip) at.push(frame);
      }
      return { clips: p.port.posted.filter((m: any) => m.clip).map((m: any) => m.clip), at };
    };
    const shipped = run({ gain: 1, knee: 0.8, drive: 2.2 }, 2.5);
    assert.equal(shipped.clips.length, 0, `the limiter held and the output still posted ${JSON.stringify(shipped.clips[0])}`);
    const hot = run({ gain: 1.4, knee: 0.8, drive: 2.2 }, 2.5);
    assert.equal(hot.clips.length, 2, `${hot.clips.length} posts over 2.5 s of a clipping output`);
    for (let i = 1; i < hot.at.length; i++) assert.ok(hot.at[i] - hot.at[i - 1] >= 48000, 'two posts inside a second');
    const c = hot.clips[0];
    // the held output is at the ceiling, .75, which the clipper passes (under its knee) and the trim takes to 1.05
    assert.ok(Math.abs(c.peakDb - 20 * Math.log10(0.75 * 1.4)) < 0.05, `the post says the output peaked at ${c.peakDb} dBFS`);
    assert.ok(c.over > 1000 && c.over < 48000, `${c.over} frames over full scale in a second of a 220 Hz tone`);
    assert.equal(c.overshootDb, 0, 'the limiter\'s own output stood over its ceiling');
    assert.ok(c.gr > 6, `a tone at 1.6 against a ceiling of .75 took ${c.gr} dB of reduction`);
    // the writer: one line for the loud passage, reported; a post a second later is the same passage
    let t = 0;
    const write = outputClipWriter(() => t);
    const first = write({ clip: c });
    t += 1000;
    const second = write({ clip: hot.clips[1] });
    t += CLIP_EPISODE_MS + 1000;
    const third = write({ clip: c });
    assert.ok(first && first.kind === 'clip' && first.what === 'out reached full scale' && isReported(first), `the first post wrote ${JSON.stringify(first)}`);
    assert.equal(second, null, 'a post inside the same loud passage wrote a second line');
    assert.ok(third && third.kind === 'clip', 'a new loud passage wrote no line');
    assert.ok(ledgerLines().includes(first!), 'the line is not in the ledger');
    assert.equal(first!.fields.peak, c.peakDb);
    assert.equal(first!.fields.over, c.over);
    assert.equal(write({ reduction: 3 }), null, 'the meter\'s eight posts a second wrote a clip line');
  } finally {
    g.AudioWorkletProcessor = hadProc; g.registerProcessor = hadReg; g.sampleRate = hadRate;
  }
});
