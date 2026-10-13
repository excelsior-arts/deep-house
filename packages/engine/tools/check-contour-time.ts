// A held note's musical contours, started inside the note and on a grid that
// moves (liquid-fix, 10-07; the review of the liquid V port, section 3):
// the pair's curve read where the note was, value and slope; the dips moved by
// the time gone and the past ones dropped; the level and the path from there;
// and a tempo ride laying the bend, the level, the pair and the dips on the
// grid while the physical controls keep their seconds; and the part's paths
// (gain, pan, filters, a return's amount, a sung phrase's level, pitch,
// vibrato and breath) the same way, the copy a start inside a note sounds
// carrying its whole length (the deep review of 10-12, F2).
//
//   node --test tools/check-contour-time.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { beatAt, beatCurve, levelRate, BEAT_CONTROL_RATE } from '../src/voices/reese-motion.ts';
import { REESE } from '../src/voices/reese.ts';
import { asSound, soundDescriptor } from '../src/voices/sound.ts';
import { withOutputEnvelope } from '../src/voices/output-envelope.ts';
import { contourElapsed, contoursOnGrid, dipsFrom, pathFrom } from '../src/voices/contour-time.ts';
import { heldOnGrid, deckContextTime, spanning } from '../src/deck.ts';
import { withMotion, withReturns } from '../src/dsp.ts';
import { walkPath } from '../src/voices/formant-pad.ts';
import { makeSetClock } from '../src/set-clock.ts';
import { StandinContext } from './standin.ts';
import type { StandinNode } from './standin.ts';
import row from '../sounds/bass/reeseSub.json' with { type: 'json' };
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { Settings } from '../src/settings.ts';
import type { Deck } from '../src/deck.ts';
import type { ProgramEvent } from '../src/program.ts';

const AT = 0.123456;
const voice = soundDescriptor(asSound(row), REESE).render;
function play(p: NoteParams): StandinContext {
  const ctx = new StandinContext();
  voice(ctx as unknown as BaseAudioContext, { dry: ctx.destination as unknown as AudioNode }, AT, { midi: 28, ...p }, {} as Settings);
  return ctx;
}
// the pair's control buffers: its ratio and normalisation (the shorter, at `levelRate`) and the following body's (4 kHz)
type Buffered = StandinNode & { buffer: { numberOfChannels: number; length: number; getChannelData(n: number): Float32Array } };
const buffers = (ctx: StandinContext) => (ctx.nodes.filter((n) => (n as Buffered).buffer?.numberOfChannels === 2) as Buffered[]).map((n) => n.buffer).sort((a, b) => a.length - b.length);
const pairBuffer = (ctx: StandinContext) => buffers(ctx)[0];
const bodyOf = (ctx: StandinContext) => buffers(ctx)[1];
const close = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} where ${b}`);

test('a seek into a held note reads its pair curve where the note was, value and slope (the review\'s [0, 0, 1, 0.33] at 0.25 s)', () => {
  const curve = [0, 0, 1, 0.33];
  const [ratio, slope] = beatAt(curve, 0.25);
  close(ratio, 0.0515625, 1e-12, 'ratio at the seek');
  close(slope, 0.37125, 1e-12, 'its slope');
  const rate = levelRate(curve);
  const whole = pairBuffer(play({ dur: 1.1, subBeatCurve: curve }))!;
  const resumed = pairBuffer(play({ dur: 0.85, curveDuration: 1.1, subBeatCurve: curve }))!;
  assert.ok(whole && resumed, 'both notes build the moving pair');
  const r0 = resumed.getChannelData(0), w0 = whole.getChannelData(0), k = 0.25 * rate;
  close(r0[0], 0.0515625, 1e-7, 'the resumed pair starts at the ratio');
  close((r0[1] - r0[0]) * rate, 0.37125, 1e-3, 'and on its slope');
  close(r0[k], 0.165, 1e-7, '250 ms later');
  // the remainder is the whole note's from the seek: the ratio and its power normalisation, sample for sample
  for (const ch of [0, 1]) {
    const r = resumed.getChannelData(ch), w = whole.getChannelData(ch);
    for (let i = 0; i < r.length - 2; i++) assert.equal(r[i], w[i + k], `channel ${ch} sample ${i}`);
  }
  assert.ok(w0.length > r0.length);
  // the following body's H3 controls stay a 4 kHz buffer over what the note has left (its phase is the pair's, rounded per note)
  const wb = bodyOf(play({ dur: 1.1, subBeatCurve: curve }))!, rb = bodyOf(play({ dur: 0.85, curveDuration: 1.1, subBeatCurve: curve }))!;
  assert.ok(wb && rb, 'both notes build the moving body');
  assert.ok(Math.abs(wb.length - rb.length - 0.25 * BEAT_CONTROL_RATE) <= 1);
});

test('a seek drops the dips already past and moves the next ones by the time gone; a fresh note keeps its early dip', () => {
  const dips = [-0.012, -8, 0.6777, -8, 1.3673, -8, 2.057, -8];
  assert.deepEqual(dipsFrom(dips, 0), dips);
  const moved = dipsFrom(dips, 0.5);
  assert.equal(moved.length, 6);
  [0.1777, 1.3673 - 0.5, 2.057 - 0.5].forEach((t, i) => close(moved[2 * i], t, 1e-12, `dip ${i}`));
  const dipTimes = (ctx: StandinContext) => ctx.nodes.filter((n) => n.type === 'gain')
    .flatMap((n) => n.params.gain?.events ?? []).filter((e) => e[0] === 'lin' && Math.abs((e[1] as number) - 10 ** (-8 / 20)) < 1e-12).map((e) => (e[2] as number) - 0.008 - AT);
  const fresh = dipTimes(play({ dur: 2.582, dips }));
  [0, 0.6777, 1.3673, 2.057].forEach((t, i) => close(fresh[i], t, 1e-9, `fresh dip ${i}`));
  const resumed = dipTimes(play({ dur: 2.082, curveDuration: 2.582, dips }));
  assert.equal(resumed.length, 3, 'the early dip is not replayed at the seek');
  [0.1777, 0.8673, 1.557].forEach((t, i) => close(resumed[i], t, 1e-9, `resumed dip ${i}`));
});

test('a seek starts the path and the level where they were', () => {
  const bend = [0, 1.6886, 0.071, 0.7959, 0.256, -0.7009, 0.286, 10.4995, 2.582, -3];
  const hz = 440 * 2 ** ((28 - 69) / 12);
  // the pair's pitch signal (every oscillator of the body follows it)
  const first = (ctx: StandinContext) => ctx.nodes.find((n) => n.type === 'constant')!.params.offset.events[0];
  close(first(play({ dur: 2.582, bend }))[1] as number, hz * 2 ** (1.6886 / 12), 1e-9, 'a fresh path');
  const at = 0.1, u = (at - 0.071) / (0.256 - 0.071), semis = 0.7959 + u * (-0.7009 - 0.7959);
  close(first(play({ dur: 2.482, curveDuration: 2.582, bend }))[1] as number, hz * 2 ** (semis / 12), 1e-9, 'the resumed path');
  let heard: NoteParams | undefined;
  const level = withOutputEnvelope((_c, _o, _a, p) => { heard = p; return 3; });
  const ctx = new StandinContext();
  const curve = [0, 0.7428, 0.071, 0.7531, 0.241, 0.9771, 2.582, 1];
  level(ctx as unknown as BaseAudioContext, { dry: ctx.destination as unknown as AudioNode }, AT, { dur: 2.482, curveDuration: 2.582, directEnvelope: { kind: 'points', curve } }, {} as Settings);
  const events = ctx.nodes.find((n) => n.type === 'gain')!.params.gain.events;
  const v = 0.7531 + ((0.1 - 0.071) / (0.241 - 0.071)) * (0.9771 - 0.7531);
  close(events[0][1] as number, v, 1e-12, 'the level at the seek');
  assert.deepEqual(events.slice(1).map((e) => +((e[2] as number) - AT).toFixed(9)), [0.141, 2.482]);
  close(contourElapsed(heard!), 0.1, 1e-12, 'the voice under it starts as far in');
});

test('a pair curve is never dropped for outliving the note; a malformed one is refused out loud', () => {
  const bounds = row.descriptor.controls.subBeatLevel;
  assert.ok(beatCurve([0, 0, 1, 0.33, 3, 0.33], bounds, 1.2), 'knots past the lifetime are held, not refused');
  const warned: unknown[] = [], warn = console.warn;
  console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
  try { assert.equal(beatCurve([0, 0.3, 0.001, 0.2], bounds, 1.2), null); } finally { console.warn = warn; }
  assert.equal(warned.length, 1);
  assert.match(String(warned[0]), /pair curve was refused/);
});

test('a tempo ride lays the bend, the level, the pair and the dips on the grid; the physical controls keep their seconds', () => {
  const beat = 60 / 174, onset = 14, dur = 1.5, whole = 2.5;
  // the grid slows to 150 and then glides to 120 over eight beats from the theme's beat 40, inside the note
  const clock = makeSetClock(60 / 150);
  clock.glide(40, 60 / 120, 8);
  const deck = { clock, startBeat: 0, program: { beat } } as unknown as Deck;
  const sampled = { kind: 'samples', seconds: 0.5, values: [0.35, 1, 0.02] };
  const p = {
    midi: 28, dur, curveDuration: whole, release: 0.03, subEntryLevel: 0, subEntrySeconds: 0.18,
    bodyCurve: [0, 1, 0.25, 2, 0.5, 1, 2.5, 1],
    bend: [0, 1.7, 0.071, 0.8, 0.3, 10.5, 2.5, -3], subBeatCurve: [0, 0, 1.02, 0, 1.19, 0.33, 2.5, 0.33],
    dips: [-0.012, -8, 0.6777, -8, 1.3673, -8, 2.057, -8], directEnvelope: { kind: 'points', curve: [0, 0.74, 0.5, 1, 2.5, 1] },
  };
  const pe = { voice: 'reeseSub', t: onset, onset, lead: 0, p } as unknown as ProgramEvent;
  const got = heldOnGrid(deck, pe).p;
  const from = onset - (whole - dur), map = (s: number) => deckContextTime(deck, from + s) - deckContextTime(deck, from);
  close(got.dur, deckContextTime(deck, onset + dur) - deckContextTime(deck, onset), 1e-12, 'the length on the grid');
  close(got.curveDuration - got.dur, deckContextTime(deck, onset) - deckContextTime(deck, from), 1e-12, 'as far into its contours, on the grid');
  assert.ok(got.dur > dur * 1.1, 'the ride is slower');
  for (const key of ['bend', 'subBeatCurve', 'bodyCurve', 'dips'] as const)
    (p[key] as number[]).forEach((v, i) => close(got[key][i], i % 2 ? v : map(v), 1e-12, `${key} ${i}`));
  p.directEnvelope.curve.forEach((v, i) => close(got.directEnvelope.curve[i], i % 2 ? v : map(v), 1e-12, `level ${i}`));
  for (const key of ['release', 'subEntrySeconds', 'subEntryLevel', 'midi'] as const) assert.equal(got[key], p[key], `${key} keeps its seconds`);
  // a sampled envelope (a kick's contour) is physical
  const kick = heldOnGrid(deck, { ...pe, p: { ...p, directEnvelope: sampled } } as unknown as ProgramEvent).p;
  assert.equal(kick.directEnvelope, sampled);
  // the pair curve still reaches the voice whole: no fallback to the constant pair
  assert.ok(beatCurve(got.subBeatCurve, row.descriptor.controls.subBeatLevel, got.dur + 0.03));
  // on the theme's own grid nothing is copied
  const own = { clock: makeSetClock(beat), startBeat: 0, program: { beat } } as unknown as Deck;
  assert.equal(heldOnGrid(own, pe), pe);
});

test('a rate a note writes in the theme\'s hertz (`gridRates`) rides the grid by the note\'s whole length; an unnamed rate keeps its seconds', () => {
  const beat = 60 / 174, onset = 14, dur = 1.5, whole = 2.5;
  const clock = makeSetClock(60 / 150);
  clock.glide(40, 60 / 120, 8);
  const deck = { clock, startBeat: 0, program: { beat } } as unknown as Deck;
  const p = { midi: 28, dur, curveDuration: whole, subBeatHz: 5.8, subBeatPhase: 0.25, movementHz: 5.8, gridRates: ['subBeatHz'] };
  const pe = { voice: 'reeseSub', t: onset, onset, lead: 0, p } as unknown as ProgramEvent;
  const got = heldOnGrid(deck, pe).p;
  const from = onset - (whole - dur), span = deckContextTime(deck, from + whole) - deckContextTime(deck, from);
  close(got.subBeatHz, 5.8 * whole / span, 1e-12, 'the pair\'s rate over the note\'s whole length on the grid');
  assert.ok(got.subBeatHz < 5.8 * 0.95, 'slower on the slower grid');
  // the note spans the cycles it was written with
  close(got.subBeatHz * span, 5.8 * whole, 1e-9, 'its cycles');
  assert.equal(got.subBeatPhase, 0.25, 'its phase is written from theme time, which the grid keeps');
  assert.equal(got.movementHz, 5.8, 'a rate it does not name keeps its seconds');
  // a note that names none, and a note without a whole length, as before
  const plain = heldOnGrid(deck, { ...pe, p: { ...p, gridRates: undefined } } as unknown as ProgramEvent).p;
  assert.equal(plain.subBeatHz, 5.8);
  const fresh = heldOnGrid(deck, { ...pe, p: { ...p, curveDuration: undefined } } as unknown as ProgramEvent).p;
  close(fresh.subBeatHz, 5.8 * dur / (deckContextTime(deck, onset + dur) - deckContextTime(deck, onset)), 1e-12, 'a note from its start');
  // on the theme's own grid nothing is copied
  const own = { clock: makeSetClock(beat), startBeat: 0, program: { beat } } as unknown as Deck;
  assert.equal(heldOnGrid(own, pe), pe);
});

// What a walker laid on a parameter, as a value at an instant (the log's `set` and `lin`, in order).
function valueAt(events: ReadonlyArray<readonly unknown[]>, t: number): number {
  let v = NaN, at = -Infinity;
  for (const [op, x, when] of events as Array<[string, number, number]>) {
    if (t < when - 1e-12) return op === 'lin' && Number.isFinite(v) ? v + (x - v) * (t - at) / (when - at) : v;
    v = x; at = when;
  }
  return v;
}

test('a path read from inside the note stands where the whole one does, a step kept a step (`pathFrom`)', () => {
  const ramp = [0, 0.2, 1, 1, 2, 0.5, 2, 0.9, 3, 0];
  assert.equal(pathFrom(ramp, 0), ramp, 'at nought, the note\'s own');
  const lay = (path: number[], at: number) => { const p = new StandinContext().createGain().gain; walkPath(p as unknown as AudioParam, at, path, (v) => v); return p.events; };
  const whole = lay(ramp, 0);
  for (const e of [0.25, 1, 1.5, 1.99995, 2, 2.5, 3.5]) {
    const from = lay(pathFrom(ramp, e), e);
    for (const t of [e, e + 0.1, 1.5, 1.99, 2.0001, 2.4, 2.9, 4]) if (t >= e)
      close(valueAt(from, t), valueAt(whole, t), 1e-9, `from ${e}, at ${t}`);
  }
  // the step at 2 s is still a step from 1.5 s: held, then set, never ramped across
  const from = pathFrom(ramp, 1.5);
  assert.deepEqual(from.slice(0, 6), [0, 0.75, 0.5, 0.5, 0.5, 0.9]);
});

test('a start inside a note sounds a copy that carries its whole length; its part\'s paths go on from there', () => {
  const beat = 60 / 120, dur = 8;
  const gainPath = [0, 0.1, 4, 1, 6, 1, 8, 0], panPath = [0, -0.6, 8, 0.6];
  const returns = { 'field.hall': [0, 0.1, 3, 0.1, 3.05, 0.6], 'field.echo': 0.2 };
  const pitchCurve = [0, -200, 0.2, 0, 2, 0, 2.05, 300];
  const pe = { i: 7, voice: 'pad', t: 10, onset: 10, lead: 0, p: { midi: 60, dur, gainPath, panPath, returns, pitchCurve } } as unknown as ProgramEvent;
  const [copy] = spanning({ beat, events: [pe] } as unknown as Parameters<typeof spanning>[0], 13);
  assert.ok(copy, 'the pad spans the point');
  assert.equal(copy.p.dur, 5);
  assert.equal(copy.p.curveDuration, 8);
  close(contourElapsed(copy.p), 3, 1e-12, 'three seconds in');
  assert.equal(pe.p.curveDuration, undefined, 'the program is untouched');
  // a note that wrote its own whole length keeps it
  const own = spanning({ beat, events: [{ ...pe, p: { ...pe.p, dur: 6, curveDuration: 8 } }] } as unknown as Parameters<typeof spanning>[0], 13)[0];
  assert.equal(own.p.curveDuration, 8);
  close(contourElapsed(own.p), 5, 1e-12, 'its own start inside it, and the point after');
  // the motion: the level and the drift where the whole note stands at 3 s, the next knots on the note's clock
  const at = 0.5;
  const ctx = new StandinContext(), dest = ctx.destination as unknown as AudioNode;
  withMotion(ctx as unknown as BaseAudioContext, { dry: dest }, copy.p, at);
  const gain = ctx.nodes.find((n) => n.type === 'gain')!.params.gain.events, pan = ctx.nodes.find((n) => n.type === 'panner')!.params.pan.events;
  const fresh = new StandinContext();
  withMotion(fresh as unknown as BaseAudioContext, { dry: fresh.destination as unknown as AudioNode }, pe.p, at - 3);
  const g0 = fresh.nodes.find((n) => n.type === 'gain')!.params.gain.events, p0 = fresh.nodes.find((n) => n.type === 'panner')!.params.pan.events;
  close(gain[0][1] as number, 0.775, 1e-12, 'the bloom stands three quarters up');
  close(pan[0][1] as number, -0.15, 1e-12, 'the drift stands three eighths across');
  for (const t of [0.5, 1, 1.5, 2.5, 3.5, 4.9]) {
    close(valueAt(gain, t), valueAt(g0, t), 1e-9, `level at ${t}`);
    close(valueAt(pan, t), valueAt(p0, t), 1e-9, `pan at ${t}`);
  }
  // the return's path: the hall opened at 3.05 s of the note, 0.05 s into the copy; an amount stays an amount
  const sent = new StandinContext(), into = new Map<string, StandinNode>();
  withReturns(sent as unknown as BaseAudioContext, { dry: sent.destination as unknown as AudioNode }, copy.p, (k) => {
    const n = sent.createGain(); into.set(k, n); return n as unknown as AudioNode;
  }, at);
  const sends = sent.nodes.filter((n) => n.connections.some((c) => [...into.values()].includes(c as StandinNode)));
  const hall = sends.find((n) => n.connections.includes(into.get('field.hall')!))!.params.gain.events;
  close(valueAt(hall, at), 0.1, 1e-12, 'the hall at the point');
  close(valueAt(hall, at + 0.05), 0.6, 1e-12, 'opened where the note opens it');
  assert.equal(sends.find((n) => n.connections.includes(into.get('field.echo')!))!.params.gain.value, 0.2);
  // and on a grid that moves, the part's paths and the return's ride with the bend
  const mapped = contoursOnGrid(copy.p, (s) => 2 * s);
  assert.deepEqual(mapped.gainPath, [0, 0.1, 8, 1, 12, 1, 16, 0]);
  assert.deepEqual(mapped.pitchCurve, [0, -200, 0.4, 0, 4, 0, 4.1, 300]);
  assert.deepEqual((mapped.returns as Record<string, unknown>)['field.hall'], [0, 0.1, 6, 0.1, 6.1, 0.6]);
  assert.equal((mapped.returns as Record<string, unknown>)['field.echo'], 0.2);
});
