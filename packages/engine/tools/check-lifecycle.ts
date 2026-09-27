// What the engine's instruments and effects hold, start, let go of and clamp,
// against the recording context: the resource and lifecycle findings of the
// reconciled review of 09-24's round (d) that a recording can see, one test
// each. What needs samples (the piano's holders, the exponential line read back,
// the grain cloud's audio-clock tick) is in `test.ts`.
//
//   node --test tools/check-lifecycle.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSettings } from '../src/settings.ts';
import { makeEffect, BY_ID } from '../src/effects/index.ts';
import { insert } from '../src/voices/treat.ts';
import { holdStrings } from '../src/voices/strings.ts';
import { formantPad } from '../src/voices/formant-pad.ts';
import { knobScale } from '../src/voices/descriptor.ts';
import { tailFor } from '../src/effects/tape-delay.ts';
import { gateCurve, gateCurves } from '../src/effects/gate.ts';
import { attachTaps } from '../src/taps.ts';
import { standin, StandinContext } from './standin.ts';
import type { StandinNode } from './standin.ts';
import { table } from './fixture.ts';

const settings = resolveSettings({ base: table, room: {} });
// The recording context is a live one to the shell (it has no
// `startRendering`), so a disposed effect waits out its tail on a timer; none of
// them is a reason to keep this process alive.
const setTimer = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void, ms?: number) => {
  const t = setTimer(fn, ms);
  (t as unknown as { unref?: () => void }).unref?.();
  return t;
}) as typeof setTimeout;
const SOURCES = new Set(['osc', 'constant', 'buffer']);
const sourcesOf = (ctx: StandinContext): StandinNode[] => ctx.nodes.filter((n) => SOURCES.has(n.type) || n.starts.length > 0);

test('a per-note effect starts its sources at the note, and lets them go one declared tail after it (R28)', () => {
  for (const id of ['tremolo', 'chorus', 'flanger', 'autoPan', 'width']) {
    const ctx = standin();
    const dry = ctx.createGain();
    insert(ctx as unknown as BaseAudioContext, { fx: { id, params: {} } }, dry as unknown as AudioNode, 7.5, 9, settings);
    const src = sourcesOf(ctx);
    assert.ok(src.length > 0, `${id} made no source`);
    const d = BY_ID[id];
    const tail = d.tail === 'none' ? 0 : d.tail.seconds;
    for (const s of src) {
      assert.equal(s.starts[0][0], 7.5, `${id} started a source at ${s.starts[0][0]}, not at its note`);
      assert.equal(s.stops[0], 9 + tail, `${id} stopped a source at ${s.stops[0]}, not at the note's end and one tail (${9 + tail})`);
    }
  }
});

test('a bus instance with no instant starts at nought, as it always did', () => {
  const ctx = standin();
  makeEffect('tremolo', ctx as unknown as BaseAudioContext, settings, {});
  for (const s of sourcesOf(ctx)) assert.equal(s.starts[0][0], 0);
});

test('shimmer instances share their shifter ramps, and build no allpass that is not one (R97, R76)', () => {
  const ctx = standin();
  let made = 0;
  const cb = ctx.createBuffer.bind(ctx);
  (ctx as unknown as { createBuffer: typeof cb }).createBuffer = (...a: Parameters<typeof cb>) => { made++; return cb(...a); };
  for (let i = 0; i < 5; i++) makeEffect('shimmer', ctx as unknown as BaseAudioContext, settings, {}, i);
  assert.equal(made, 2, `five shimmers allocated ${made} ramp buffers`);
  assert.equal(ctx.nodes.filter((n) => n.type === 'allpass').length, 0);
});

test('a setter writes back what it set, so the next one does not undo it (R75)', () => {
  // The phaser: a centre, then a depth.
  {
    const ctx = standin();
    const fx = makeEffect('phaser', ctx as unknown as BaseAudioContext, settings, { stages: 4 });
    const aps = ctx.nodes.filter((n) => n.type === 'allpass');
    (fx.params.centreHz as (v: number, at?: number, over?: number) => void)(900, 1, 0.1);
    (fx.params.depth as (v: number, at?: number, over?: number) => void)(0.5, 2, 0.1);
    const last = aps[0].frequency.events.filter((e) => e[0] === 'lin').pop()!;
    assert.equal(last[1], 900, `the first stage's corner is ${last[1]} after a depth, not the 900 it was set to`);
    (fx.params.stages as (v: number, at?: number, over?: number) => void)(4, 3, 0.1);
    assert.equal(aps[0].frequency.events.filter((e) => e[0] === 'lin').pop()![1], 900);
  }
  // A rate in beats of nought falls back to the rate the knob stands at now.
  {
    const ctx = standin();
    const fx = makeEffect('tremolo', ctx as unknown as BaseAudioContext, settings, { beat: 0.5 });
    const osc = ctx.nodes.find((n) => n.type === 'osc')!;
    (fx.params.rateHz as (v: number, at?: number, over?: number) => void)(2, 1, 0.1);
    (fx.params.rateBeats as (v: number, at?: number, over?: number) => void)(0, 2, 0.1);
    assert.equal(osc.frequency.events.filter((e) => e[0] === 'lin').pop()![1], 2);
  }
  // And a delay in beats of nought falls back to the seconds it stands at now.
  {
    const ctx = standin();
    const fx = makeEffect('tapeDelay', ctx as unknown as BaseAudioContext, settings, { beat: 0.5, timeBeats: 0.75 });
    const line = ctx.nodes.find((n) => n.type === 'delay')!;
    (fx.params.timeSeconds as (v: number, at?: number, over?: number) => void)(0.6, 1, 0.1);
    (fx.params.timeBeats as (v: number, at?: number, over?: number) => void)(0, 2, 0.1);
    assert.equal(line.delayTime.events.filter((e) => e[0] === 'lin').pop()![1], 0.6);
  }
});

test('the tape delay\'s tail is its line\'s bound, not twenty seconds at any tempo (R96)', () => {
  assert.equal(tailFor(1.0135), 20);
  // Eight beats at 40 BPM, fed back at 0.7: 12 s a pass, 19.4 passes.
  assert.equal(tailFor(12.0135), Math.ceil(12.0135 * Math.log(1e-3) / Math.log(0.7)));
  const ctx = standin();
  const fx = makeEffect('tapeDelay', ctx as unknown as BaseAudioContext, settings, { beat: 1.5, timeBeats: 0.75 });
  fx.dispose(10);
  const stops = sourcesOf(ctx).map((s) => s.stops[0] as number);
  assert.ok(stops.length && stops.every((t) => t >= 10 + 22), `a 40 BPM tape delay let go at ${Math.min(...stops) - 10} s`);
});

test('the gate keeps a bounded number of curves however far a knob is dragged (R79)', () => {
  for (let i = 0; i < 200; i++) gateCurve(-40 + i * 0.1, 6, 0.01);
  assert.ok(gateCurves() <= 32, `${gateCurves()} curves held`);
});

test('a formant pad note with a tilt outside its table plays, and does not throw on the tick (R77)', () => {
  for (const tilt of [5, 0, -1, NaN, null]) {
    const ctx = standin();
    const out = { dry: ctx.createGain(), delay: ctx.createGain(), reverb: ctx.createGain(), room: ctx.createGain() };
    assert.doesNotThrow(() => formantPad(ctx as unknown as BaseAudioContext, out as never, 0.1, { midi: 60, dur: 1, sourceTilt: tilt }, settings));
  }
});

test('a knob asked past its end plays its end (R78)', () => {
  const knobs = { cutoffHz: { unit: 'hz', min: 400, max: 4000, default: 1000, bird: 'gleam', sense: 1, slopeDb: 1 } } as never;
  assert.equal(knobScale({ knobs: { cutoffHz: 9000 } }, knobs, 'cutoffHz'), 4);
  assert.equal(knobScale({ knobs: { cutoffHz: 10 } }, knobs, 'cutoffHz'), 0.4);
  assert.equal(knobScale({ knobs: { cutoffHz: 1000 } }, knobs, 'cutoffHz'), 1);
});

test('the held strings: a control after the attack writes what it always wrote, and one inside it keeps the leg that played (R84)', () => {
  const ctx = standin();
  const out = { dry: ctx.createGain(), delay: ctx.createGain(), reverb: ctx.createGain(), room: ctx.createGain() };
  const v = holdStrings(ctx as unknown as BaseAudioContext, out as never, 1, { midi: 60, vel: 0.8, attack: 2 }, settings);
  const g = ctx.nodes.find((n) => n.type === 'gain' && n.gain.events.some((e) => e[0] === 'lin' && e[1] === 0.8 && e[2] === 3))!;
  const before = g.gain.events.length;
  v.setControl('gain', 0.4, 2, 1); // inside the attack: at 2 the ramp stands at 0.4
  const inside = g.gain.events.slice(before);
  assert.deepEqual(inside, [['cancel', 2], ['lin', 0.4, 2], ['lin', 0.4, 3]], 'a control inside the attack stepped');
  const after = g.gain.events.length;
  v.setControl('gain', 0.6, 5, 1); // after everything has landed
  assert.deepEqual(g.gain.events.slice(after), [['cancel', 5], ['set', 0.4, 5], ['lin', 0.6, 6]]);
});

test('the duck effect: a trigger on an unfinished recovery starts from where it had got to (R84)', () => {
  const ctx = standin();
  const fx = makeEffect('duck', ctx as unknown as BaseAudioContext, settings, { beatSeconds: 0.5 });
  const trigger = fx.params.trigger as (v?: number | null, at?: number) => void;
  trigger(-9, 1);
  const vcaParam = ctx.nodes.map((n) => n.gain).find((p) => p.events.some((e) => e[0] === 'set' && e[2] === 0.999))!;
  assert.ok(vcaParam, 'no duck was written');
  const n = vcaParam.events.length;
  trigger(-9, 1.15); // inside the first recovery
  const sets = vcaParam.events.slice(n).filter((e) => e[0] === 'set');
  assert.ok(sets.every((e) => (e[1] as number) < 1), `the second trigger jumped to ${JSON.stringify(sets)}`);
});

test('the limiter holds for at least as long as it looks ahead (R90)', async () => {
  let Proc: new (o: unknown) => { look: number; hold: number } = null as never;
  const g = globalThis as Record<string, unknown>;
  g.AudioWorkletProcessor = class { port = {}; };
  g.registerProcessor = (_n: string, c: typeof Proc) => { Proc = c; };
  g.sampleRate = 48000;
  await import(new URL('../src/limiter-worklet.js', import.meta.url).href);
  const short = new Proc({ processorOptions: { lookaheadMs: 5, holdMs: 1 } });
  assert.ok(short.hold >= short.look, `hold ${short.hold} under look ${short.look}`);
  const usual = new Proc({ processorOptions: { lookaheadMs: 5, holdMs: 25 } });
  assert.equal(usual.hold, 1200);
});

// A tap's graph, by hand: the buses and the chain are nodes that remember what
// was connected to them, and an analyser reads back whatever it is told to.
function tapsGraph(level: number, settings: unknown) {
  const connected = new Set<object>();
  const node = () => ({
    connect(a: object) { connected.add(a); },
    disconnect(a?: object) { if (a) connected.delete(a); },
  });
  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    createAnalyser: () => ({
      fftSize: 0, smoothingTimeConstant: 0,
      getFloatTimeDomainData(b: Float32Array) { b.fill(level); },
      disconnect() {},
    }),
  };
  const out = { ...node(), context: ctx };
  const buses = Object.fromEntries(['kick', 'sub', 'drums', 'melodic', 'keys'].map((k) => [k, { dry: node() }]));
  const graph = { out, buses, nodes: { chain: { out: node(), limiterPort: null, settings } } };
  return { graph, connected };
}

test('clip is judged on the peak and not on its rounded decibels (R85)', () => {
  const { graph } = tapsGraph(0.9943, { master: { limiter: { ceiling: 0.75 } } });
  const frame = attachTaps(graph as never).read();
  assert.equal(frame.out.peak, -0);
  assert.deepEqual(frame.clipped, [], '-0.05 dBFS lit the clip LED');
  assert.ok(frame.hot.includes('out'));
  const full = tapsGraph(1, { master: { limiter: { ceiling: 0.75 } } });
  assert.ok(attachTaps(full.graph as never).read().clipped.includes('out'));
});

test('a failed attach leaves no analyser hung on the graph (R86)', () => {
  const { graph, connected } = tapsGraph(0.5, undefined);
  assert.throws(() => attachTaps(graph as never));
  assert.equal(connected.size, 0, `${connected.size} analysers left connected`);
});

