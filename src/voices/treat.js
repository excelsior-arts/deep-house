// The DJ treatments, as node builders. `src/develop.js` decides *which*
// treatment a layer carries and *when*; this file only knows how to build one.
//
// Everything here is audio: a voice takes the same notes it always took and
// sounds different because the desk is doing something to it. Nothing in this
// file can change a pitch, a time or a length.
//
// The contract a voice opts into, all optional and all no-ops when absent:
//
//   p.gain      level multiplier (already the house convention)
//   p.lpMul     [start, end] multiplier on the voice's own lowpass, ramped
//               across the note; a scalar means "hold it there"
//   p.hpMul     the same for the voice's own highpass — the classic DJ filter
//   p.spreadMul multiplier on whatever width the voice was given
//   p.phaser    { stages, rate, depth, mix, phase, center } — an allpass comb
//               swept by a very slow LFO, which is a texture and not a pitch
//   p.dip       { hz, db, q } — one gentle bell, cut only, where something
//               else is playing the tune. A level takes a layer down
//               everywhere; this takes it down in the one octave it is in the
//               way, which is the only move that buys separation without
//               buying a hole in the middle of the record
//
// A ±0.5 octave move is a multiplier of 2^±0.5, so the numbers below read in
// octaves wherever they can.

import { phasedLfo } from '../dsp.js';

// A [from, to] pair out of whatever the plan wrote: a scalar holds still.
export function pair(v, fallback = 1) {
  if (v == null) return [fallback, fallback];
  if (Array.isArray(v)) return [v[0] ?? fallback, v[1] ?? v[0] ?? fallback];
  return [v, v];
}

// Park a filter frequency, or walk it from one value to another across the
// note. The walk is linear in log frequency, which is how a filter sounds like
// it is moving evenly.
export function rampFrequency(param, from, to, time, end) {
  if (!(Math.abs(Math.log2(Math.max(1e-6, to / from))) > 0.01)) {
    param.value = from;
    return;
  }
  const span = Math.max(0.05, end - time);
  param.setValueAtTime(from, time);
  // A handful of steps: exponentialRamp on a frequency is exactly the straight
  // line in octaves we want, and one call does it.
  param.exponentialRampToValueAtTime(Math.max(10, to), time + span);
}

// Four to six allpass stages with a very slow LFO across them, mixed against
// the dry. Mild: this is a background layer keeping itself interesting, not an
// effect anybody is meant to name.
export function phaserInsert(ctx, spec, time, end) {
  const stages = Math.max(2, Math.min(8, Math.round(spec.stages ?? 4)));
  const center = spec.center ?? 600;
  const depth = Math.max(0, Math.min(0.9, spec.depth ?? 0.5));
  const mix = Math.max(0, Math.min(0.6, spec.mix ?? 0.45));

  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix;
  input.connect(dry);
  dry.connect(output);

  const lfo = phasedLfo(ctx, Math.max(0.02, Math.min(0.4, spec.rate ?? 0.1)), spec.phase ?? 0);
  let node = input;
  for (let i = 0; i < stages; i++) {
    const ap = ctx.createBiquadFilter();
    ap.type = 'allpass';
    ap.Q.value = spec.q ?? 0.7;
    const f = center * Math.pow(1.7, i);
    ap.frequency.value = f;
    const amt = ctx.createGain();
    amt.gain.value = f * depth;
    lfo.connect(amt);
    amt.connect(ap.frequency);
    node.connect(ap);
    node = ap;
  }
  const wet = ctx.createGain();
  wet.gain.value = mix;
  node.connect(wet);
  wet.connect(output);

  lfo.start(time);
  lfo.stop(end + 0.05);
  return { in: input, out: output };
}

// One peaking bell, cut only, parked for the life of the note. It is not
// automated and it is not swept: a filter that moves inside a note is the one
// thing the timbre study said no voice does, and this is a hole for somebody
// else to play in and not a gesture of its own.
export function dipInsert(ctx, spec) {
  const f = ctx.createBiquadFilter();
  f.type = 'peaking';
  f.frequency.value = Math.max(40, Math.min(12000, spec.hz ?? 700));
  f.Q.value = Math.max(0.3, Math.min(4, spec.q ?? 1.2));
  f.gain.value = Math.max(-6, Math.min(0, spec.db ?? 0));
  return f;
}

// The one call a voice makes: hand it the tail of its chain and it hands back
// the new tail, having inserted whatever the plan asked for.
export function insert(ctx, p, tail, time, end) {
  if (!p) return tail;
  let node = tail;
  if (p.dip && (p.dip.db ?? 0) < -0.05) {
    const d = dipInsert(ctx, p.dip);
    node.connect(d);
    node = d;
  }
  if (!p.phaser) return node;
  const ph = phaserInsert(ctx, p.phaser, time, end);
  node.connect(ph.in);
  return ph.out;
}

export default insert;
