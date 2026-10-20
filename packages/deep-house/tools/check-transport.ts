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
  // the record's twelve still hold it. PLAN-UNIFY U2's answers put a reverse
  // swell into a structural arrival the drums play into, where the cast admits
  // the glue's noises and no gesture already arrives there (never out of the
  // intro): one more, two.
  assert.deepEqual(by, { 'house-v1': 12, 'house-v2': 2 }, `the 48 themes carry ${JSON.stringify(by)} anticipatory events`);
  assert.equal(n, 14);
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

// Since GA5 Ember is a curve (`TEMPO_CURVE`): 0.40 is 104 and 0.14 is 54 on seed 1,
// the pair the rule was written on (a half with four percent left to glide).
test('a half or double move is counted two to one on the shared grid: 104 → 54 and 54 → 104 BPM, no glide in the blend and what is left glided after', async () => {
  for (const [spell, to, per] of [[{ ember: 0.4 }, { ember: 0.14 }, 0.5], [{ ember: 0.14 }, { ember: 0.4 }, 2]] as const) {
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
  // the composer's own themes (the library's turn held out of reach, GA5): 27191's theme 2 is a turn
  // ...and the house's own form (GA6's place tables off): the breakdown's pad is the house form's
  const houseForm = { ...style, switches: { ...(style.switches as Record<string, boolean>), placeTables: false } };
  const A = quiet(() => planTheme('27191', 1, { themeBars: 32, style: houseForm, preset: 'auto', spell: { ...BENCH, ember: 0.7 }, library: [] } as any));
  const B = quiet(() => planTheme('27191', 2, { themeBars: 32, style: houseForm, preset: 'auto', spell: BENCH, library: [] } as any));
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
    // Since GA6 a bird move can cross into another place's form (its section
    // orders): the bar is kept (above), and the section kind is the same
    // wherever the two plans share their form.
    const order = (t: any) => t.arrangement.sections.map((x: any) => `${x.kind}:${x.startBar}`).join(' ');
    if (order(inn.track) === order(out.track))
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

// Since GA5 Ember is a curve: 0.30 is 88 and 0.55 is 111 on 51757, a far move (1.26, neither near nor double).
test('a second ask inside a far ride keeps the ride: 88 → 111 BPM with Loom asked mid-ride, the record never falls silent, the swap is at the target, and the plan is both values', async () => {
  const r = await rideAndAsk('51757', { ember: 0.3, tide: 1, root: 0.81, loom: 0.578 }, { ember: 0.55 }, { loom: 1 });
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
  const down = await rideAndAsk('51757', { ember: 0.55, tide: 1, root: 0.81, loom: 0.578 }, { ember: 0.3 }, { loom: 1 });
  assert.equal(down.sample.filter((x) => x.up < 0.3).length, 0, 'a hole in the ride down');
  assert.equal(sig(down.landedPlan), sig(down.want), 'the ride down landed another plan than both values');
  assert.ok(Math.abs(down.said - down.reached) < 1, `down: settleIn said ${(down.said - down.t0).toFixed(1)} s, heard at ${(down.reached - down.t0).toFixed(1)} s`);
  const reaim = await rideAndAsk('51757', { ember: 0.3, tide: 1, root: 0.81, loom: 0.578 }, { ember: 0.55 }, { ember: 0.75 });
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
  // Restated in round L3: the form counted in time moves which theme's rota
  // draws the lfoParam, so the case is the first of 27191's twelve whose last
  // forty bars carry ten of them (theme 7 until L3).
  const lfoIn = (t: any) => { const q = programOf(t), b = q.barSeconds; return q.events.filter((e: any) => e.t / b >= t.bars - 40 && e.t / b < t.bars && e.p && e.p.fx && e.p.fx.id === 'lfoParam').length; };
  // Restated in the 10-02 batch: house-v2 draws the next key on the wheel,
  // which moved 27191's rotas so none of its twelve carries ten in its last
  // forty any more; the claim is the engine's (a wire, never a source), so
  // the case is the first theme under this spell that does — 27191's first,
  // then seeds 1–60.
  const cases = function* () { for (let n = 0; n < 12; n++) yield ['27191', n] as const; for (let s = 1; s <= 60; s++) for (let n = 0; n < 3; n++) yield [String(s), n] as const; };
  const t = quiet(() => { for (const [s, n] of cases()) { const x = planTheme(s, n, { strategy: 'house-v2', spell } as any); if (lfoIn(x) >= 10) return x; } return planTheme('27191', 6, { strategy: 'house-v2', spell } as any); });
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
  // Built from the window's own first onset: the stand-in's clock runs in
  // real time, so a case late in the set (theme 11 since L3) would otherwise
  // hold the process open for its whole onset.
  const base = Math.min(...evs.map((e) => e.onset));
  for (const e of lfo) insert(ctx, e.p, ctx.createGain(), e.onset - base, e.onset - base + (e.p.dur ?? 1), p.settings);
  assert.equal(made.length, 0, `${made.length} LFO offsets were built into ${lfo.length} pad notes`);
  const before = made.length;
  let built = 0;
  for (const e of other) { const tail = ctx.createGain(); if (insert(ctx, e.p, tail, e.onset - base, e.onset - base + (e.p.dur ?? 1), p.settings) !== tail) built++; }
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

// --- the deep review of 10-08: a hand on the band while a hand-over is in flight ----

/**
 * Every offline render held `ms` of the wall clock, so a landing that prepares
 * a voice — a window of the piano's strings, a new set's hat beds — takes that
 * long, and the set's own clock runs on under it as it does on a slow phone.
 * Hands back how many renders were held and how to let go.
 */
function slowRenders(ms: number): { count: () => number; done: () => void } {
  const P = (globalThis as any).OfflineAudioContext.prototype;
  const was = P.startRendering;
  let n = 0;
  P.startRendering = function (this: unknown, ...a: unknown[]) { n++; return new Promise((r) => setTimeout(r, ms)).then(() => was.apply(this, a)); };
  return { count: () => n, done: () => { P.startRendering = was; } };
}

/** A set picked up `before` seconds ahead of its first theme's own seam, not yet in it. */
async function nearItsSeam(seed: string, before: number, opts: Record<string, unknown> = {}) {
  const ctx = liveStandin();
  const mix = quiet(() => createMix(ctx, { masterSeed: seed, strategy: 'house-v2', destination: ctx.destination as any, bypass: null, ...opts } as any));
  const first = mix.record ? null : quiet(() => planTheme(seed, 0, { strategy: 'house-v2', ...opts } as any));
  const { seamPlan, blendAsked } = await import('../src/performance.ts');
  const seam = seamPlan(first!, blendAsked(first!), { boundaryBars: 16 });
  const log = console.log; console.log = () => {};
  try { await mix.start(0, seam.at - before); } finally { console.log = log; }
  await play(ctx, 0.2);
  return { ctx, mix, seam, first: first! };
}

test('a seek whose landing is still being built when the record reaches its own seam is not raced by it: the sought deck plays on and nothing hands over under it (the deep review of 10-08, F1)', async () => {
  const { ctx, mix, seam } = await nearItsSeam('7', 2.5);
  assert.equal(mix.arriving, null, 'the set was already in its seam');
  const slow = slowRenders(500);
  const target = seam.at - 45;
  let raced = false, landed: number | null = null, renders = 0;
  try {
    const seeking = mix.seek(target);
    await play(ctx, 4);   // past the seam's own point while the landing is built
    raced = !!mix.arriving;
    renders = slow.count();
    landed = await seeking;
  } finally { slow.done(); }
  assert.ok(renders > 0, 'the landing prepared nothing, so nothing raced it');
  assert.equal(raced, false, 'the record\'s own seam was laid on the deck the seek is replacing');
  assert.equal(landed, target);
  await play(ctx, 3);
  const at = { index: mix.state.themeIndex, out: !!mix.playingOut, elapsed: mix.state.elapsed };
  mix.stop();
  assert.equal(at.index, 0, `the sought theme was handed over: the set is on theme ${at.index + 1}`);
  assert.equal(at.out, false, 'the sought deck is playing out');
  assert.ok(Math.abs(at.elapsed - target - 3) < 0.5, `three seconds after the landing the record is at ${at.elapsed.toFixed(2)} s, not ${(target + 3).toFixed(2)}`);
});

test('a seek inside a bird\'s hand-over lays the ask again from where it landed, and the pull lands in place on the theme the hand is on (the deep review of 10-08)', async () => {
  const { ctx, mix } = await aSet('1');
  const asked = { ember: 0.95 };
  await mix.setSpell(asked);
  await until(ctx, () => !!mix.arriving && !!mix.state.wait?.laid, 60);
  assert.ok(mix.arriving, 'the pull laid no hand-over');
  const target = mix.state.elapsed + 20;
  await mix.seek(target);
  await turn();
  const w = mix.state.wait;
  assert.ok(w && w.kind === 'spell', `after the seek the set waits for ${JSON.stringify(w)}: the hand's ask was not laid again`);
  const ok = await until(ctx, () => sameAsked(mix.spell, asked), 120);
  assert.ok(ok, `two minutes after the seek the set still plays ${JSON.stringify(mix.spell)}`);
  assert.equal(mix.state.themeIndex, 0, `the pull landed on theme ${mix.state.themeIndex + 1}, not in place`);
  assert.ok(mix.state.elapsed > target, `the pull landed at ${mix.state.elapsed.toFixed(1)} s, before the place the hand sought`);
  mix.stop();
  // and an engine switch takes its own door again: into the next theme, under the engine asked
  const e = await aSet('1');
  await e.mix.setStrategy('house-v1');
  await e.mix.seek(30);
  await turn();
  assert.ok(e.mix.state.wait && e.mix.state.wait.kind === 'engine', `after the seek the engine switch waits for ${JSON.stringify(e.mix.state.wait)}`);
  e.mix.stop();
});

test('a seek out of a far ride lands at the theme\'s own tempo at once: 104 ridden toward 169 BPM, scrubbed, and the grid is the record\'s from the landing on (the deep review of 10-08, B12)', async () => {
  const { ctx, mix } = await aSet('1', 'house-v2');
  const own = mix.record!.program.beat;
  await mix.setSpell({ ember: 1 });
  // into the ride, far enough that the grid has left the record's tempo by a tenth
  const rode = await until(ctx, () => mix.state.beatSeconds < own * 0.9, 240);
  assert.ok(rode, `the ride never took the grid a tenth off ${(60 / own).toFixed(1)} BPM`);
  const riding = 60 / mix.state.beatSeconds;
  const target = Math.max(10, mix.state.elapsed - 30);
  const landed = await mix.seek(target);
  assert.equal(landed, target);
  await play(ctx, 0.5);
  const record = mix.record!;
  const grid = record.clock.spbAt(record.clock.beatAt(ctx.currentTime)) / (record.perBeat ?? 1);
  const later = record.clock.spbAt(record.clock.beatAt(ctx.currentTime + 4)) / (record.perBeat ?? 1);
  mix.stop();
  assert.ok(Math.abs(grid - record.program.beat) < 1e-9,
    `half a second after the seek the grid runs at ${(60 / grid).toFixed(2)} BPM (the ride had reached ${riding.toFixed(1)}), not the theme's own ${(60 / record.program.beat).toFixed(2)}`);
  assert.ok(Math.abs(later - record.program.beat) < 1e-9, `four seconds on the grid is at ${(60 / later).toFixed(2)} BPM: it is still gliding home`);
});

test('a pull or a cast overtaken by a seek inside its preparation leaves no plan and no wait behind: the record\'s own seam brings its own next theme (the deep review of 10-08, F2, F7)', async () => {
  // a cast, abandoned by the seek: the seam that follows is the set's own
  {
    const { ctx, mix } = await nearItsSeam('1', 30);
    const slow = slowRenders(300);
    try {
      const cast = mix.cast('77', { spell: { ember: 0.95, spark: 0.85, zephyr: 0.6, root: 0.75, veil: 0.6, tide: 0.45 } });
      await play(ctx, 0.1);
      const seeking = mix.seek(mix.state.elapsed + 5);
      assert.equal(await cast, null, 'the cast was not overtaken');
      await seeking;
    } finally { slow.done(); }
    assert.equal(mix.state.casting, false);
    assert.equal(mix.state.wait, null, `the abandoned cast's wait is still drawn: ${JSON.stringify(mix.state.wait)}`);
    assert.ok(await until(ctx, () => !!mix.arriving, 60), 'the record\'s own seam never began');
    assert.equal(String(mix.arriving!.track.seed), '1#1', `the record's own seam brought ${mix.arriving!.track.seed}`);
    mix.stop();
  }
  // a pull put back inside its own preparation: nothing is coming, so nothing is waited for
  {
    const { ctx, mix } = await aSet('1');
    const slow = slowRenders(300);
    try {
      const a = mix.setSpell({ ember: 0.95 });
      await play(ctx, 0.1);
      const b = mix.setSpell(null);
      await a; await b;
    } finally { slow.done(); }
    assert.equal(mix.state.wait, null, `a pull taken back leaves a wait: ${JSON.stringify(mix.state.wait)}`);
    assert.equal(mix.state.next?.index, 1, `the next theme named is ${JSON.stringify(mix.state.next?.index)}`);
    mix.stop();
  }
});

test('nothing asked of a deck is nothing written to it: through a swap and a seek the live notes are the locked program\'s, and a real pull seasons them with the plan\'s whole chain, each note\'s own knobs kept (the deep review of 10-08)', async () => {
  const { seasonOf, knobTablesOf } = await import('../src/generator.ts');
  const { knobsFor } = await import('../src/spell.ts');
  const { noteKnobs } = await import('../src/performance.ts');
  const k = (x: unknown) => JSON.stringify(x ?? null);
  /** notes past the cursor whose knobs are not `want`'s; the locked program's when none is named */
  const off = (d: any, want: ((ev: any) => unknown) | null = null): number => {
    const locked = programOf(d.track);
    let n = 0;
    for (let c = Math.max(0, d.index); c < d.program.events.length; c++) {
      const ev = visitAt(d.program, c);
      if (k(ev.p?.knobs) !== k(want ? want(ev) : visitAt(locked, c).p?.knobs)) n++;
    }
    return n;
  };
  // the link row seed=1&v=2&spell=em:0.90, into its theme 2 by its own seam, then a seek
  const spell = { ember: 0.9 };
  const { ctx, mix } = await nearItsSeam('1', 2, { spell });
  assert.ok(await until(ctx, () => mix.state.themeIndex === 1 && !mix.playingOut, 60), 'the set never reached its theme 2');
  const theme2 = mix.record!;
  assert.ok(theme2.track.knobs, 'theme 2 under Ember 0.90 carries no seasoning, so there is nothing to keep');
  assert.equal(off(theme2), 0, `${off(theme2)} notes of theme 2 left the locked program at the swap`);
  await mix.seek(40);
  assert.equal(off(mix.record!), 0, `${off(mix.record!)} notes left the locked program at a seek`);
  assert.equal(mix.record!.program, programOf(mix.record!.track), 'a seek with nothing asked copied the program');
  // a real pull: the plan's whole chain on the voices the theme drew, the tempo's lean on the bass among it
  const asked = { ember: 0.95, spark: 0.85, zephyr: 0.6, root: 0.75, veil: 0.6, tide: 0.45 };
  void mix.setSpell(asked);
  const d = mix.record!;
  const chain = seasonOf(d.track, asked);
  const plan = d.track.events as any[];
  assert.equal(off(d, (ev) => noteKnobs(chain[ev.voice], plan[ev.i]?.p?.knobs)), 0, 'the pull did not season the notes with the plan\'s chain');
  const bare = knobsFor(asked, knobTablesOf(d.track));
  const leaned = Object.keys(chain).filter((v) => k(chain[v]) !== k(bare[v]));
  assert.ok(leaned.length, 'the chain is the spell\'s knobs alone: nothing of the tempo\'s lean or the place\'s bass reached it');
  // and let go: the program's own again
  void mix.setSpell(spell);
  assert.equal(off(d), 0, `${off(d)} notes kept the pull's seasoning after it was let go`);
  mix.stop();
});

test('live play is the locked program through a swap and a seek on five link rows: a far pull, a slow one, two of several birds and the benchmark (the deep review of 10-08)', async () => {
  const rows: Array<[string, Record<string, number>]> = [
    ['1', { ember: 0.9 }],
    ['1', { ember: 0.1 }],
    ['1', { ember: 0.85, root: 0.3, glow: 0.75, spark: 0.9 }],
    ['1', { ember: 0.2, tide: 0.8, veil: 0.7 }],
    ['27191', { ember: 0.14, glow: 0, veil: 0.34, spark: 0, loom: 0.81 }],
  ];
  const k = (x: unknown) => JSON.stringify(x ?? null);
  const off = (d: any): number => {
    const locked = programOf(d.track);
    let n = 0;
    for (let c = Math.max(0, d.index); c < d.program.events.length; c++) if (k(visitAt(d.program, c).p?.knobs) !== k(visitAt(locked, c).p?.knobs)) n++;
    return n;
  };
  const seen: string[] = [];
  let left = 0;
  for (const [seed, spell] of rows) {
    const { ctx, mix } = await nearItsSeam(seed, 2, { spell });
    assert.ok(await until(ctx, () => mix.state.themeIndex === 1 && !mix.playingOut, 90), `${seed} ${k(spell)} never reached its theme 2`);
    const swapped = off(mix.record!);
    await mix.seek(30);
    const sought = off(mix.record!);
    seen.push(`seed ${seed} ${k(spell)}: ${swapped} at the swap, ${sought} at a seek`);
    left += swapped + sought;
    mix.stop();
  }
  assert.equal(left, 0, `notes left the locked program: ${seen.join('; ')}`);
});

// --- the second clock (PLAN-AMBIENT §4, P5: C1-C3) --------------------------------
//
// No shipped place says `clock: 'free'` in this round, so the lab place does (`tools/second-clock-fixture.ts`: the
// Ambient tile's place, free, ahead of house-v2's time table). A free theme plans at the nominal 60 BPM and its deck
// maps its seconds onto the context by offset (`deck.ts` `zeroAt`); a seam with a free side neither rides nor glides
// (`seamTempo`'s `free`): into a free theme the grid is pinned and holds, out of one it jumps to the arriving metered
// theme's own tempo where the blend begins. Between two metered themes nothing of it is read.

/** One sample at 48 kHz: how close a free onset must land to its own second. */
const SAMPLE_S = 1 / 48000;

test('the second clock, laid out: free → house → free on the lab place rides and glides nothing, the house keeps its own grid from its first downbeat, every free onset lands on its own second, and metered seams still change tempo by 0.00 BPM (PLAN-AMBIENT §4, C1-C3)', async () => {
  const { freeStyle, freeHouseFree } = await import('./second-clock-fixture.ts');
  const { setLayout } = await import('../src/set-plan.ts');
  const { startDeck, freeDeck, deckThemeTime } = await import('@deep-house/engine/deck');
  const style = freeStyle();
  const plans = freeHouseFree('1', style);
  // C1: the word, and the nominal tempo
  assert.deepEqual(plans.map((p) => p.clock ?? 'bars'), ['free', 'bars', 'free']);
  assert.deepEqual([plans[0].bpm, plans[2].bpm, plans[0].beat, plans[0].barSeconds], [60, 60, 1, 4]);
  assert.ok(plans[1].bpm > 115 && plans[1].bpm < 125, `the house theme is at ${plans[1].bpm} BPM, not near 120`);
  assert.equal(programOf(plans[0]).clock, 'free', 'the free plan\'s program does not say so');
  assert.ok(!('clock' in programOf(plans[1])), 'a metered program carries the clock\'s word');
  // the free theme's blend is its tail in seconds, Loom's presence and Tide's ring (the tile, Loom 0.80 and Tide 0.85:
  // 26.1 + 7.6 = 33.75 s, nine four-second bars rounded up, the seconds beside them)
  assert.equal(plans[0].blendBars, 9);
  assert.ok(Math.abs(plans[0].blendSeconds! - 33.75) < 0.01 && Math.abs(plans[0].ringSeconds! - 7.63) < 0.01, `the tile's tail is ${plans[0].blendSeconds} s with a ${plans[0].ringSeconds} s ring`);
  const L = layOut(plans as any, { ...setOptions(style, {}), style });
  // C2: the grid rides and glides nothing; the house's tempo is its own from its first downbeat to its last bar
  for (const g of L.clock.segments) assert.ok(Math.abs(g.spb1 - g.spb0) < 1e-12, `the grid leans from ${(60 / g.spb0).toFixed(2)} to ${(60 / g.spb1).toFixed(2)} BPM at ${g.t0.toFixed(1)} s`);
  const houseEnd = L.startBeats[1] + (plans[1].bars * 4);
  for (let b = L.startBeats[1]; b <= houseEnd; b += 1) assert.equal(L.clock.spbAt(b), plans[1].beat, `beat ${b.toFixed(0)} of the house is off its own tempo`);
  assert.deepEqual(L.perBeats, [1, 1, 1]);
  // C3: out of the free theme its 33.75 s on the house's bars; into the second, the house's own blend on its own grid
  const [out, into] = L.seams;
  assert.ok(Math.abs(out.end - out.at - plans[0].blendSeconds!) < plans[1].barSeconds / 2 + 1e-9, `the blend out of the free theme is ${(out.end - out.at).toFixed(1)} s, not its 33.75 s`);
  assert.equal(out.barSeconds, plans[1].barSeconds);
  assert.equal(into.barSeconds, plans[1].barSeconds);
  // every onset of a free deck on its own second through both seams, and its tempo never moving: the decks a render
  // makes, built again on a grid that leans and jumps wherever it can (a deck that read the grid anywhere would move
  // with it), spaced as their program spaces them, the first free theme's first second at the set's nought and the
  // second's where the blend into it begins (the layout's seam, not the deck's own start)
  const ctx: any = liveStandin();
  const master = makeV1Master(ctx, programOf(plans[0]).settings);
  const decks = plans.map((t, i) => { const d = makeDeck(ctx, t, programOf(t), master.input, master, L.clock, L.starts[i], L.perBeats[i]); startDeck(ctx, d, L.starts[i], 0); return d; });
  const wild = makeSetClock(plans[1].beat, 0);
  wild.glide(8, 0.31, 40); wild.jump(120, 0.83); wild.glide(400, 0.4, 64); wild.jump(900, 1.7); wild.glide(1400, 0.55, 30);
  const elsewhere = [0, 2].map((i) => { const d = makeDeck(ctx, plans[i], programOf(plans[i]), master.input, master, wild, L.starts[i], L.perBeats[i]); startDeck(ctx, d, L.starts[i], 0); return d; });
  assert.ok(Math.abs(deckContextTime(decks[0], 0)) < 1e-12 && Math.abs(deckContextTime(decks[2], 0) - into.at) < 1e-9, `the free themes begin at ${deckContextTime(decks[0], 0)} s and ${deckContextTime(decks[2], 0).toFixed(3)} s, not 0 and the blend into the second at ${into.at.toFixed(3)} s`);
  let worst = 0, n = 0, inBlends = 0;
  for (const [k, i] of [[0, 0], [1, 2]]) {
    const d = decks[i];
    assert.ok(freeDeck(d), `deck ${i} is not free`);
    assert.ok(Math.abs(d.graph.beat - 1) < 1e-12, `the free deck's graph is built on a beat of ${d.graph.beat} s`);
    const own = schedule(d.program, d.grid, 0, Infinity).events;
    const moved = schedule(elsewhere[k].program, elsewhere[k].grid, 0, Infinity).events;
    assert.equal(moved.length, own.length);
    for (let j = 0; j < own.length; j++) {
      const s = own[j];
      // the same instant whatever the grid does, and the time from the theme's first onset its own
      worst = Math.max(worst, Math.abs(moved[j].at - s.at), Math.abs((s.at - own[0].at) - (s.pe.onset - own[0].pe.onset)));
      n++;
      if (L.seams.some((m) => s.at >= m.at && s.at < m.end)) inBlends++;
    }
    for (let x = 0; x < d.program.bars * 4; x += 7) {
      assert.ok(Math.abs(deckContextTime(d, x + 1) - deckContextTime(d, x) - 1) < 1e-9, `a second of the free theme at ${x} s is not a second of the context`);
      assert.ok(Math.abs(deckThemeTime(d, deckContextTime(d, x)) - x) < 1e-9);
    }
  }
  assert.ok(n > 200 && inBlends > 5, `only ${n} free onsets, ${inBlends} of them in the blends`);
  assert.ok(worst < SAMPLE_S, `a free onset lands ${(worst * 1e6).toFixed(2)} µs off its own second`);
  // the house deck is on the grid at its own tempo, its first bar where the blend begins
  assert.ok(Math.abs(deckContextTime(decks[1], 0) - out.at) < 1e-9);
  // between two metered themes: every blend on a pinned grid, 0.00 BPM across it, and the lab place moves nothing it does not reach
  const dump = (S: any) => JSON.stringify({ s: S.starts, b: S.startBeats, p: S.perBeats, m: S.seams.map((x: any) => [x.at, x.swapAt, x.end, x.bars, x.barSeconds]), g: S.clock.segments });
  const v2 = STRATEGIES['house-v2'].style;
  let seams = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const S = quiet(() => setLayout(String(seed), 4, { style: v2 }));
    for (const m of S.seams) {
      const spb = S.clock.spbAt(S.clock.beatAt(m.at));
      for (let k = 0; k <= 16; k++) assert.equal(S.clock.spbAt(S.clock.beatAt(m.at + (k / 16) * (m.end - m.at) - (k === 16 ? 1e-6 : 0))), spb, `seed ${seed}: the tempo moves inside the blend at ${m.at.toFixed(1)} s`);
      seams++;
    }
    assert.equal(dump(quiet(() => setLayout(String(seed), 4, { style }))), dump(S), `seed ${seed} at the house: the lab place moved its set`);
  }
  assert.equal(seams, 18);
});

test('the seam\'s tempo rule with a free side is free whatever the ratio, and between two metered themes it is the four bands to the bit (PLAN-AMBIENT §4.3)', () => {
  for (let r = 0.3; r < 3.5; r += 0.01) {
    for (const sides of [{ from: true }, { to: true }, { from: true, to: true }]) {
      assert.deepEqual(seamTempo(100, 100 * r, {}, sides), { kind: 'free', ratio: (100 * r) / 100, perBeat: 1, ride: 0, glide: 0 });
    }
    assert.deepEqual(seamTempo(100, 100 * r, { tempoGlideBars: 16 }, { from: false, to: false }), seamTempo(100, 100 * r, { tempoGlideBars: 16 }));
  }
});

test('the second clock, played: the lab place free → free by its own seam, free → house and house → free by two pulls; every free note lands on its own second, a free record\'s beat never moves, and the house is never ridden toward 60 and sounds at its own tempo from its first note (PLAN-AMBIENT §4, C2-C3)', async () => {
  const { freeStyle, TILE, HOUSE_120 } = await import('./second-clock-fixture.ts');
  const { freeDeck } = await import('@deep-house/engine/deck');
  const { seamPlan, blendAsked } = await import('../src/performance.ts');
  const style = freeStyle();
  // every note fired, by its parameters, so a free deck's own event is found again
  const fired: { time: number; p: unknown }[] = [];
  const real: Record<string, any> = {};
  for (const name of Object.keys(VOICES)) {
    real[name] = (VOICES as any)[name];
    (VOICES as any)[name] = (c: any, out: any, time: number, p: any, st: any, at?: number) => {
      fired.push({ time, p });
      return real[name](c, out, time, p, st, at);
    };
  }
  // a pull back into a theme already planned plays the same program on a fresh deck: a note is either deck's
  const own = new Map<unknown, { decks: any[]; onset: number }>();
  const decks = new Set<any>();
  const ctx = liveStandin();
  const mix = quiet(() => createMix(ctx, { masterSeed: '1', strategy: 'house-v2', style, spell: TILE, destination: ctx.destination as any, bypass: null } as any));
  const beats: number[] = [];
  const watch = () => {
    for (const d of [mix.record, mix.arriving] as any[]) {
      if (!d || !freeDeck(d) || decks.has(d)) continue;
      decks.add(d);
      for (const e of d.program.events) { const had = own.get(e.p); if (had) had.decks.push(d); else own.set(e.p, { decks: [d], onset: e.onset }); }
    }
  };
  const step = async (ok: () => boolean, seconds: number, free: boolean) => {
    const end = ctx.currentTime + seconds;
    while (ctx.currentTime < end && !ok()) {
      await play(ctx, 0.5);
      watch();
      if (free && mix.record && freeDeck(mix.record as any)) beats.push(mix.state.beatSeconds);
    }
    return ok();
  };
  try {
    const first = quiet(() => planTheme('1', 0, { style, spell: TILE } as any));
    assert.equal(first.clock, 'free');
    const seam = seamPlan(first, blendAsked(first), { boundaryBars: 16 });
    const log = console.log; console.log = () => {};
    try { await mix.start(0, seam.at - 3); } finally { console.log = log; }
    watch();
    const t0 = mix.record as any;
    // free → free, the record's own seam: two free decks, the grid nobody's
    assert.ok(await step(() => mix.state.themeIndex === 1 && !mix.playingOut, 200, true), 'the free theme never handed over to the next by its own seam');
    const t1 = mix.record as any;
    assert.ok(freeDeck(t1), 'the second theme of the lab set is not free');
    // the theme the record's own seam brought begins where that seam's blend began, in the first theme's own seconds
    assert.ok(Math.abs(t1.zeroAt - (t0.zeroAt + seam.at)) < SAMPLE_S, `the second free theme's first second falls ${((t1.zeroAt - t0.zeroAt - seam.at) * 1e3).toFixed(3)} ms off the blend's beginning`);
    // free → house, a pull: the grid jumps to the house's own tempo where the blend begins
    await play(ctx, 20);
    const p = await mix.setSpell(HOUSE_120);
    assert.ok(p && p.at, 'the pull to the house armed no hand-over');
    assert.ok(await step(() => mix.record !== t1 && !mix.playingOut, 300, true), 'the pull never landed the house');
    const house = mix.record as any;
    assert.ok(!freeDeck(house) && house.program.bpm > 115, `the record is ${house.program.bpm} BPM, ${house.program.clock ?? 'metered'}`);
    const clock = house.clock;
    const heard = (t: number) => (60 / clock.spbAt(clock.beatAt(t))) * (house.perBeat ?? 1);
    assert.ok(Math.abs(heard(p!.at + 1e-3) - house.program.bpm) < 1e-6, `the house's first note sounds at ${heard(p!.at + 1e-3).toFixed(2)} BPM, not its own ${house.program.bpm}`);
    assert.equal(house.perBeat ?? 1, 1);
    // house → free, a pull: the house is never ridden toward 60, the grid pinned through the blend
    await play(ctx, 30);
    const from = ctx.currentTime;
    const p2 = await mix.setSpell(TILE);
    assert.ok(p2 && p2.at, 'the pull back to the tile armed no hand-over');
    for (let k = 0; k <= 32; k++) {
      const t = from + (k / 32) * (p2!.end - from);
      assert.ok(Math.abs(heard(t) - house.program.bpm) < 1e-9, `the house is heard at ${heard(t).toFixed(3)} BPM at ${(t - from).toFixed(1)} s, ridden toward the free theme`);
    }
    assert.ok(await step(() => mix.record !== house && !mix.playingOut, 300, true), 'the pull back never landed the free theme');
    assert.ok(freeDeck(mix.record as any), 'the record after the pull back is not free');
    await step(() => false, 10, true);
  } finally {
    for (const name of Object.keys(real)) (VOICES as any)[name] = real[name];
    mix.stop();
  }
  // every note a free deck fired, on its own second: the instant handed to the voice less the note's onset is the
  // instant its theme's second nought fell on, one instant for every note of a deck through every seam, so the notes
  // fall into as many such instants as there were decks of their theme (a note a seam re-timed, a deck the grid
  // moved, a second nought that slid, would each make one of its own); and each is where its deck was put
  let n = 0, worst = 0;
  const noughts = new Map<unknown, number[]>();
  for (const f of fired) {
    const e = own.get(f.p);
    if (!e) continue;
    n++;
    const key = e.decks[0].track;
    const at = f.time - e.onset;
    const had = noughts.get(key) ?? [];
    const near = had.find((x) => Math.abs(x - at) < 0.5);
    if (near == null) had.push(at); else worst = Math.max(worst, Math.abs(near - at));
    noughts.set(key, had);
  }
  assert.ok(n > 100 && decks.size >= 3, `only ${n} free notes heard, from ${decks.size} free decks`);
  assert.ok(worst < SAMPLE_S, `a free note sounded ${(worst * 1e6).toFixed(2)} µs off the second nought of its deck`);
  for (const [track, at] of noughts) {
    const of = [...decks].filter((d) => d.track === track);
    assert.ok(at.length <= of.length, `the notes of one free theme fell on ${at.length} second noughts, from ${of.length} decks`);
    for (const x of at) assert.ok(of.some((d) => Math.abs(d.zeroAt - x) < SAMPLE_S), `a free deck's notes fall on a second nought at ${x.toFixed(4)} s, where no deck of theirs was put`);
  }
  // and the beat a free record reports is its own second, through every seam
  assert.ok(beats.length > 50 && beats.every((b) => b === 1), `a free record reported a beat of ${beats.find((b) => b !== 1)} s`);
});

// --- the second clock's edges (the review of 10-18) ---------------------------
//
// The review played the lab place's edges on this stand-in and found two
// faults: a pull out of a free record jumped the grid under the metered tail
// still playing out under it (S1), and a bird moved inside a free record's
// blend toward a metered plan cut the record in 80 ms (S5). Each test below
// failed on the code before the fix (the round note says by how much).

/** A set under the lab place, every note fired kept with its parameters. */
async function freeScene(spell: Record<string, number>, style?: any) {
  const { freeStyle } = await import('./second-clock-fixture.ts');
  const fired: { time: number; p: unknown }[] = [];
  const real: Record<string, any> = {};
  for (const name of Object.keys(VOICES)) {
    real[name] = (VOICES as any)[name];
    (VOICES as any)[name] = (c: any, out: any, time: number, p: any, st: any, at?: number) => { fired.push({ time, p }); return real[name](c, out, time, p, st, at); };
  }
  const ctx = liveStandin();
  const mix: any = quiet(() => createMix(ctx, { masterSeed: '1', strategy: 'house-v2', style: style ?? freeStyle(), spell, destination: ctx.destination as any, bypass: null } as any));
  const done = () => { for (const name of Object.keys(real)) (VOICES as any)[name] = real[name]; mix.stop(); };
  return { ctx, mix, fired, done };
}
const muted = async <T>(fn: () => Promise<T>): Promise<T> => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return await fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
/** The tempo a metered deck is heard at, at a context instant. */
const heardOn = (d: any) => (t: number) => (60 / d.clock.spbAt(d.clock.beatAt(t))) * (d.perBeat ?? 1);
/**
 * A deck's notes fired from `since` on, in time order, against its program: how many, and the worst slip, the time
 * between two notes against the time between their onsets (a metered deck at its own tempo and a free one alike
 * play a program's seconds as they are written).
 */
function slipOf(fired: { time: number; p: unknown }[], d: any, since = -Infinity) {
  const onset = new Map<unknown, number>();
  for (const e of d.program.events) if (!onset.has(e.p)) onset.set(e.p, e.onset);
  const run = fired.filter((f) => f.time >= since && onset.has(f.p)).map((f) => [f.time, onset.get(f.p)!] as const).sort((a, b) => a[0] - b[0]);
  let worst = 0;
  for (let i = 1; i < run.length; i++) worst = Math.max(worst, Math.abs((run[i][0] - run[0][0]) - (run[i][1] - run[0][1])));
  return { n: run.length, worst, last: run.length ? run[run.length - 1][0] : -Infinity };
}

test('a pull out of a free record while the metered theme it replaced still plays out its tail waits for the tail, which is never re-gridded (the review of 10-18, S1)', async () => {
  const { TILE, HOUSE_120 } = await import('./second-clock-fixture.ts');
  const { freeDeck } = await import('@deep-house/engine/deck');
  const s = await freeScene(HOUSE_120);
  try {
    await muted(() => s.mix.start(0, 0));
    await play(s.ctx, 30);
    const house = s.mix.record;
    assert.ok(!freeDeck(house) && house.program.bpm > 115);
    const p1 = await muted(() => s.mix.setSpell(TILE));
    assert.ok(await until(s.ctx, () => s.ctx.currentTime > p1.swapAt + 0.5, 300));
    assert.ok(s.mix.playingOut === house, 'the house is not playing out its tail after the swap');
    assert.ok(freeDeck(s.mix.record), 'the record after the swap is not free');
    const asked = s.ctx.currentTime;
    const p2 = await muted(() => s.mix.setSpell({ ember: 1 }));
    assert.ok(p2 && p2.at >= p1.end - 1e-6, `the hand-over out of the free record begins at ${p2?.at.toFixed(2)} s, under the house's tail (to ${p1.end.toFixed(2)} s)`);
    const heard = heardOn(house);
    let worst = 0;
    await until(s.ctx, () => {
      if (s.mix.playingOut === house) worst = Math.max(worst, Math.abs(heard(s.ctx.currentTime) - house.program.bpm));
      return s.mix.playingOut !== house && s.ctx.currentTime > p2!.at + 1;
    }, 300);
    assert.ok(worst < 1e-9, `the grid under the house's tail moved by ${worst.toFixed(2)} BPM`);
    const tail = slipOf(s.fired, house, asked);
    assert.ok(tail.n > 10, `only ${tail.n} notes of the tail after the second pull`);
    assert.ok(tail.worst < 1e-6, `the tail's notes slipped ${(tail.worst * 1e3).toFixed(1)} ms off their program`);
    // and the theme the second pull brought is heard at its own tempo from its first note
    assert.ok(await until(s.ctx, () => !!s.mix.record && !freeDeck(s.mix.record), 120), 'the second pull never landed');
    const fast = s.mix.record, h = heardOn(fast);
    assert.ok(fast.program.bpm > house.program.bpm + 20, `the second pull landed at ${fast.program.bpm} BPM`);
    for (let k = 0; k <= 16; k++) assert.ok(Math.abs(h(p2!.at + 1e-3 + (k / 16) * (p2!.end - p2!.at)) - fast.program.bpm) < 1e-9);
  } finally { s.done(); }
});

/** A free record's blend toward the house, and something asked 3 s into it (`ask`): what the set does then. */
async function askInsideFreeBlend(ask: (mix: any) => Promise<any>, seek = false) {
  const { TILE, HOUSE_120 } = await import('./second-clock-fixture.ts');
  const { freeDeck, deckThemeTime } = await import('@deep-house/engine/deck');
  const s = await freeScene(TILE);
  try {
    await muted(() => s.mix.start(0, 0));
    await play(s.ctx, 20);
    let free0 = s.mix.record;
    assert.ok(freeDeck(free0));
    let p = await muted(() => s.mix.setSpell(HOUSE_120));
    assert.ok(p && p.at, 'the pull to the house armed no hand-over');
    if (seek) {
      // a seek inside the blend: it lands on the free record, on its own second, and lays the pull again from there
      assert.ok(await until(s.ctx, () => s.ctx.currentTime > p.at + 3, 120));
      const at = s.ctx.currentTime;
      const landed = await muted(() => s.mix.seek(300));
      assert.equal(landed, 300);
      free0 = s.mix.record;
      assert.ok(freeDeck(free0), 'the seek did not land on the free record');
      const landing = free0.zeroAt + 300;
      assert.ok(landing >= at && landing <= at + 0.5, `the sought free record's second 300 falls ${(landing - at).toFixed(3)} s after the seek`);
      assert.ok(await until(s.ctx, () => !!s.mix.arriving && !freeDeck(s.mix.arriving) && s.mix.state.transition > 0.02, 120), 'the pull laid again by the seek never began its blend');
      // where that blend begins and ends, off the transport's own progress through it, and where it swaps
      const t1 = s.ctx.currentTime, f1 = s.mix.state.transition;
      await play(s.ctx, 1);
      const t2 = s.ctx.currentTime, f2 = s.mix.state.transition;
      const span = (t2 - t1) / (f2 - f1), begun = t1 - f1 * span;
      p = { at: begun, end: begun + span, swapAt: s.mix.state.wait.swapAt } as any;
      const since = slipOf(s.fired, free0, landing + 0.5);
      assert.ok(since.n > 3 && since.worst < SAMPLE_S, `the sought free record's ${since.n} notes slipped ${(since.worst * 1e6).toFixed(2)} µs`);
    }
    assert.ok(await until(s.ctx, () => s.ctx.currentTime > (p as any).at + 3, 120));
    const was = s.mix.arriving;
    assert.ok(was && !freeDeck(was), 'nothing metered is arriving inside the blend');
    const asked = s.ctx.currentTime;
    const p2 = await muted(() => ask(s.mix));
    assert.ok(p2, 'the second ask armed nothing');
    assert.ok(s.mix.record === free0, 'the free record was cut for the second ask (the arriving theme promoted at once)');
    const near = seek ? 1e-3 : 1e-6;
    assert.ok(Math.abs(p2.swapAt - (p as any).swapAt) < near && Math.abs(p2.end - (p as any).end) < near, `the second ask moved the hand-over: swap ${(p as any).swapAt.toFixed(2)} → ${p2.swapAt.toFixed(2)}, end ${(p as any).end.toFixed(2)} → ${p2.end.toFixed(2)}`);
    const fresh = s.mix.arriving;
    assert.ok(fresh && fresh !== was && !freeDeck(fresh), 'the second ask brought no fresh metered deck into the blend');
    // the free record plays to the swap and out to the blend's laid end, on its own seconds
    let held = true;
    assert.ok(await until(s.ctx, () => { if (s.ctx.currentTime < p2.swapAt - 0.05 && s.mix.record !== free0) held = false; return s.ctx.currentTime >= p2.swapAt + 0.1; }, 200));
    assert.ok(held, 'the free record was let go before the swap');
    assert.ok(s.mix.playingOut === free0, 'the free record is not playing out its tail after the swap');
    assert.ok(await until(s.ctx, () => s.ctx.currentTime >= p2.end + 0.5, 200));
    const tail = slipOf(s.fired, free0, asked);
    assert.ok(tail.n > 3 && tail.last > p2.swapAt, `the free record sounded ${tail.n} notes after the second ask, the last at ${(tail.last - p2.swapAt).toFixed(1)} s from the swap`);
    assert.ok(tail.worst < SAMPLE_S, `the free record's notes slipped ${(tail.worst * 1e6).toFixed(2)} µs`);
    // the deck the second ask brought is heard at its own tempo from where it came in, its bar lines the blend's
    const h = heardOn(fresh);
    for (let k = 0; k <= 16; k++) { const t = asked + 0.5 + (k / 16) * (p2.end - asked - 0.5); assert.ok(Math.abs(h(t) - fresh.program.bpm) < 1e-9, `the fresh deck heard at ${h(t).toFixed(2)} BPM ${(t - asked).toFixed(1)} s after the ask`); }
    return { p: p as any, p2, fresh, was, deckThemeTime };
  } finally { s.done(); }
}

test('a bird moved inside a free record\'s blend toward a metered plan joins it: the record plays to the blend\'s laid end, and the plan asked comes in at its own tempo under the same swap and end (the review of 10-18, S5)', async () => {
  const r = await askInsideFreeBlend((mix) => mix.setSpell({ ember: 0.7 }));
  assert.ok(r.fresh.program.bpm > r.was.program.bpm + 5, `the plan asked is at ${r.fresh.program.bpm} BPM`);
});

test('dice thrown inside a free record\'s blend toward the house join it: the cast\'s theme comes in at the second the blend is on, at its own tempo, and the record plays out (the review of 10-18, S5 by a cast)', async () => {
  const r = await askInsideFreeBlend((mix) => mix.cast('7'));
  // a theme from its first bar at the blend's beginning: its own time is the blend's seconds
  const t = r.p2.at + 0.5 * (r.p2.end - r.p2.at);
  assert.ok(Math.abs(r.deckThemeTime(r.fresh, t) - (t - r.p2.at)) < 1e-6, `the cast's theme is at ${r.deckThemeTime(r.fresh, t).toFixed(3)} s of its own at ${(t - r.p2.at).toFixed(3)} s into the blend`);
});

test('a seek inside a free record\'s blend lands on its own second and lays the pull again; a bird moved inside that blend joins it (the review of 10-18, a seek)', async () => {
  await askInsideFreeBlend((mix) => mix.setSpell({ ember: 0.7 }), true);
});

test('a start inside a free record\'s blend reads the blend as it is laid, its seconds on the arriving theme\'s bars (the review of 10-18, fix 4)', async () => {
  const { FREE_AT_THE_TILE, TILE } = await import('./second-clock-fixture.ts');
  const { freeDeck } = await import('@deep-house/engine/deck');
  // a lab place free at the tile's first theme (51.0 BPM drawn) and not at its second (51.3, metered), so the set's
  // own seam is free → metered; at Loom 0.9 its tail is 28.0 + 7.6 = 35.6 s, nine bars at four seconds (36 s), laid as
  // eight of the metered theme's 4.678 s bars, 37.4 s
  const base: any = STRATEGIES['house-v2'].style;
  const style = { ...base, places: { ...base.places, time: [{ ...FREE_AT_THE_TILE, id: 'lab-free-windowed', place: { birds: TILE, tempo: [40, 51.05] } }, ...base.places.time] } };
  const spell = { ...TILE, loom: 0.9 };
  const plans = [0, 1].map((i) => quiet(() => planTheme('1', i, { style, spell } as any)));
  assert.deepEqual(plans.map((p: any) => p.clock ?? 'bars'), ['free', 'bars']);
  const L = layOut(plans as any, { ...setOptions(style, {}), style });
  const seam = L.seams[0];
  const laid = seam.end - seam.at;
  const { seamPlan, blendAsked } = await import('../src/performance.ts');
  const own = seamPlan(plans[0] as any, blendAsked(plans[0] as any), { boundaryBars: 16 }).bars * plans[0].barSeconds;
  assert.ok(laid > own + 1, `the blend is laid as ${laid.toFixed(2)} s, not past its own ${own} s at four-second bars`);
  const s = await freeScene(spell, style);
  try {
    // a second before the laid blend's end: past its own bars at four seconds, inside the blend as laid
    const from = seam.at + laid - 1;
    await muted(() => s.mix.start(0, from));
    await play(s.ctx, 0.1);
    assert.ok(s.mix.record && !freeDeck(s.mix.record), 'the metered theme is not the record past the swap');
    const tail = s.mix.playingOut;
    assert.ok(tail && freeDeck(tail), 'a start inside the laid blend lost the free record\'s tail: the blend was read as over');
    // the blend rebuilt ends where it was laid: about 0.9 s from now (the start's lead aside), its progress read off the transport
    const f = s.mix.state.transition;
    assert.ok(f > 0.9 && f < 1, `the blend rebuilt is ${(f * 100).toFixed(1)} % through, not a second from its end`);
    const h = heardOn(s.mix.record);
    assert.ok(Math.abs(h(s.ctx.currentTime + 0.5) - s.mix.record.program.bpm) < 1e-9);
  } finally { s.done(); }
});

// --- the free tail (his ear 10-18: the 77 s tail "too long ... use birds and we can reduce it in half at least") ---
//
// A free side's tail is Loom's presence and Tide's ring (`freeBlendSeconds`), laid on the arriving theme's bars, and
// it leaves as a change (`FREE_TAIL_CURVES`): the top from the blend's start, the low end at the swap, then the level
// falling in decibels and its voices leaving one by one, the drums at the swap, the calls halfway, every new note at
// the ring. Nothing of it is written on a seam out of a metered theme.

/** The lab place on the spell asked, so it is the nearest place wherever the spell goes; house-v2 everywhere else. */
async function freeAtSpell(spell: Record<string, number>) {
  const { FREE_AT_THE_TILE } = await import('./second-clock-fixture.ts');
  const base: any = STRATEGIES['house-v2'].style;
  return { ...base, places: { ...base.places, time: [{ ...FREE_AT_THE_TILE, id: 'lab-free-here', place: { birds: spell, tempo: [20, 220] } }, ...base.places.time] } };
}

test('the free tail: Loom the presence and Tide the ring, 18-39 s at every arrival tempo from 90 to 174 BPM, and it leaves as a change, never a hold or a cut (his ear 10-18)', async () => {
  const { TILE } = await import('./second-clock-fixture.ts');
  const { freeBlendSeconds, freePresenceSeconds, freeRingSeconds } = await import('../src/musical-time.ts');
  const { FREE_TAIL_CURVES, swapAfterBars } = await import('../src/set-plan.ts');
  // the law: each bird one part, the corners and the tile
  assert.ok(Math.abs(freeBlendSeconds(0, 0) - 18) < 1e-9 && Math.abs(freeBlendSeconds(1, 1) - 39) < 1e-9, 'the corners are not 18 and 39 s');
  assert.ok(Math.abs(freeBlendSeconds(TILE.loom, TILE.tide) - 33.75) < 0.01, `the tile's tail is ${freeBlendSeconds(TILE.loom, TILE.tide)} s`);
  for (const v of [0, 0.3, 0.7, 1]) {
    assert.ok(Math.abs(freeBlendSeconds(v, 0.2) - freeRingSeconds(0.2) - freePresenceSeconds(v)) < 1e-9, 'Tide reached the presence');
    assert.ok(Math.abs(freeBlendSeconds(0.2, v) - freePresenceSeconds(0.2) - freeRingSeconds(v)) < 1e-9, 'Loom reached the ring');
  }
  const base: any = STRATEGIES['house-v2'].style;
  const o: any = setOptions(base, {});
  const db = (g: number) => 20 * Math.log10(g);
  let laidSome = 0;
  for (const birds of [TILE, { ...TILE, loom: 0, tide: 0 }, { ...TILE, loom: 1, tide: 1 }]) {
    const style = await freeAtSpell(birds);
    const free = quiet(() => planTheme('1', 0, { style, spell: birds, preset: 'auto' } as any));
    assert.equal(free.clock, 'free');
    for (const tempo of [90, 120, 140, 174]) {
      const house = quiet(() => planTheme('1', 1, { style: base, spell: { ember: 0.6 }, preset: 'auto', tempo } as any));
      assert.equal(house.bpm, tempo);
      const L = layOut([free, house] as any, { ...o, style: base });
      const s = L.seams[0];
      const at = `Loom ${birds.loom} Tide ${birds.tide} into ${tempo} BPM`;
      // the same seconds at every arrival tempo, within half the arriving bar
      assert.ok(Math.abs(s.end - s.at - free.blendSeconds!) <= house.barSeconds / 2 + 1e-9, `${at}: the tail is ${(s.end - s.at).toFixed(2)} s, not its ${free.blendSeconds!.toFixed(2)} s`);
      assert.equal(s.barSeconds, house.barSeconds);
      assert.ok(Math.abs(s.swapAt - s.at - swapAfterBars(s.bars, o) * house.barSeconds) < 1e-9, `${at}: the swap is not the house's eighth bar or the blend's half`);
      const m: any = { at: s.at, bars: s.bars, barSeconds: s.barSeconds, swapAt: s.swapAt, filterMove: 'close', outgoingBar: free.barSeconds, swapInFrom: s.swapAt - L.starts[0], swapInTo: s.swapAt - s.at, sumGain: 1 };
      const plain = seamCurves(m, o);
      const w = seamCurves({ ...m, freeTail: { ringS: free.ringSeconds! } }, o);
      // the arriving side and the sum are what they always were: the tail is the free side's alone
      const others = (x: any) => JSON.stringify([x.lines.filter((l: any) => l.deck !== 'from'), x.holes.filter((h: any) => h.deck !== 'from')]);
      assert.equal(others(w), others(plain), `${at}: the free tail moved the arriving side`);
      assert.ok(!plain.holes.some((h: any) => h.group === '*' || h.group.startsWith('bus:')), 'a metered seam holes a voice');
      // the free side: one fader line and one top line, both only ever falling, the level -24 dB where its last note may
      // start and gone at the end, never a step: the steepest fall before the ring under 6 dB a second
      const fromLines = w.lines.filter((l: any) => l.deck === 'from');
      const fader = fromLines.filter((l: any) => l.param === 'fader.gain'), top = fromLines.filter((l: any) => l.param === 'lp.frequency');
      assert.equal(fader.length, 1); assert.equal(top.length, 1);
      for (const l of [fader[0], top[0]]) for (let i = 1; i < l.points.length; i++) assert.ok(l.points[i].v <= l.points[i - 1].v && l.points[i].t >= l.points[i - 1].t, `${at}: ${l.param} rises`);
      const ring = Math.min(free.ringSeconds!, (s.end - s.swapAt) / 2), last = s.end - ring;
      const fp = fader[0].points;
      assert.deepEqual(fp.map((p: any) => p.k), ['set', 'exp', 'exp', 'lin']);
      assert.ok(fp[0].t === s.swapAt && fp[0].v === 1 && Math.abs(fp[1].t - last) < 1e-9 && Math.abs(db(fp[1].v) - FREE_TAIL_CURVES.lastDb) < 1e-9 && Math.abs(fp[2].t - s.end) < 1e-9, `${at}: the fader is not 1 at the swap, ${FREE_TAIL_CURVES.lastDb} dB at the last note and gone at the end`);
      const slope = -FREE_TAIL_CURVES.lastDb / (last - s.swapAt);
      assert.ok(slope < 6 && last - s.swapAt >= 5, `${at}: the fall is ${slope.toFixed(1)} dB a second over ${(last - s.swapAt).toFixed(1)} s, a cut`);
      assert.ok(s.end - s.at >= 16, `${at}: the shortest tail is ${(s.end - s.at).toFixed(1)} s`);
      // the voices leave one by one, in the free theme's own seconds: the drums at the swap, the calls halfway, every
      // note at the ring
      const own = (t: number) => t - L.starts[0];
      const hole = (g: string) => w.holes.find((h: any) => h.deck === 'from' && h.group === g)!.gap;
      assert.ok(Math.abs(hole('bus:drums')[0] - own(s.swapAt)) < 1e-9 && Math.abs(hole('bus:keys')[0] - own((s.swapAt + last) / 2)) < 1e-9 && Math.abs(hole('*')[0] - own(last)) < 1e-9, `${at}: the voices do not leave at the swap, halfway and the ring`);
      laidSome++;
    }
  }
  assert.equal(laidSome, 12);
});

test('the free tail, played: a pull out of the free tile into the house; its drums play no note past the swap, its calls none past halfway, nothing starts in the ring, and its calls play on until then (his ear 10-18)', async () => {
  const { TILE, HOUSE_120 } = await import('./second-clock-fixture.ts');
  const { freeDeck } = await import('@deep-house/engine/deck');
  const s = await freeScene(TILE);
  try {
    await muted(() => s.mix.start(0, 40));
    await play(s.ctx, 2);
    const t0: any = s.mix.record;
    assert.ok(freeDeck(t0), 'the tile is not free');
    const p: any = await muted(() => s.mix.setSpell(HOUSE_120));
    assert.ok(p && p.at && p.swapAt && p.end, 'the pull armed no hand-over');
    while (s.ctx.currentTime < p.end + 3) await play(s.ctx, 0.5);
    const ring = Math.min(t0.track.ringSeconds, (p.end - p.swapAt) / 2), last = p.end - ring, half = (p.swapAt + last) / 2;
    const ev = new Map<unknown, any>();
    for (const e of t0.program.events) ev.set(e.p, e);
    const heard = s.fired.filter((f) => ev.has(f.p)).map((f) => { const e = ev.get(f.p); return { at: t0.zeroAt + e.t, bus: e.bus }; });
    const late = (bus: string | null, from: number) => heard.filter((h) => (bus == null || h.bus === bus) && h.at >= from + 1e-6);
    assert.equal(late('drums', p.swapAt).length, 0, 'the free side\'s drums played past the swap');
    assert.equal(late('keys', half).length, 0, `the free side's calls played past halfway (${half.toFixed(1)} s)`);
    assert.equal(late(null, last).length, 0, `a free note started in the ring (past ${last.toFixed(1)} s)`);
    const calls = heard.filter((h) => h.bus === 'keys' && h.at >= p.at && h.at < half).length;
    assert.ok(calls > 5, `only ${calls} calls between the blend's start and halfway: the tail did not keep the free side present`);
  } finally { s.done(); }
});
