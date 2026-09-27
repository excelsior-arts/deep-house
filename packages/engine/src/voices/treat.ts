// The DJ treatments, as node builders. The composer's
// `packages/deep-house/src/performance.ts` decides *which* treatment a layer
// carries and *when*; this file only knows how to build one.
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
//   p.fx        { id, params } — one registered effect out of
//               `src/effects/`, built as an insert on this note. Round K5b:
//               the composer's rota may put a kitchen instance on a lane the
//               way it has always put a phaser on one, and this is where that
//               becomes audio. The id is looked up in the registry and nothing
//               here knows any effect's name
//   p.swell     { db, oct, over } — a sustained layer's entrance as a swell
//               and not a step (house-v2's `swellIn`): the note starts `db`
//               under its level and `oct` octaves darker, and reaches its own
//               level and its own tone `over` seconds after it starts, the
//               level in a straight line in decibels and the tone in octaves.
//               The notes of one entrance each carry where on the one line
//               they start, so the swell runs on across them unbroken
//   p.dip       { hz, db, q } — one gentle bell, cut only, where something
//               else is playing the tune. A level takes a layer down
//               everywhere; this takes it down in the one octave it is in the
//               way, which is the only move that buys separation without
//               buying a hole in the middle of the record
//
// A ±0.5 octave move is a multiplier of 2^±0.5, so the numbers below read in
// octaves wherever they can.

import { phasedLfo, midiToHz } from '../dsp.ts';
import { makeEffect, BY_ID } from '../effects/index.ts';
import type { EffectInstance, EffectParams } from '../effects/index.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/**
 * A knob the stage may either park or walk across the note: one number holds
 * still, two are the start and the end. It is what the composer writes into
 * `p.lpMul` and `p.hpMul`.
 */
export type Ramped = number | number[];

/**
 * The phaser the composer's `treatAt` writes, every field of it optional here
 * because this module's job is to have an answer when one is missing. `q` is
 * the one nothing upstream writes yet.
 */
export interface PhaserSpec {
  stages?: number;
  rate?: number;
  depth?: number;
  mix?: number;
  phase?: number;
  center?: number;
  q?: number;
}

/** The two ends of a built phaser: the source connects into one and on out of the other. */
export interface PhaserInsert {
  in: GainNode;
  out: GainNode;
}

/** The bell `p.dip` asks for: where it is, how deep it is cut and how wide. */
export interface DipSpec {
  hz?: number;
  db?: number;
  q?: number;
}

/** A note's place on its layer's entrance swell: how far under, how dark, and how long to go. */
export interface SwellSpec {
  db?: number;
  oct?: number;
  over?: number;
}

/**
 * The entrance swell: a gain walked from `db` under the note's level to its
 * level, and — where it starts darker — a lowpass walked open from the stage's
 * corner `oct` octaves down to the top of the band, both over `over` seconds
 * and held there for the rest of the note. The corner is the one the stage's
 * own colour uses (`STAGE_TONE`), so a voice sounds the same as it would with
 * no swell once the swell has arrived: the gain is at one and the lowpass is
 * past anything a pad plays. Null where there is nothing to do.
 */
export function swellInsert(ctx: BaseAudioContext, p: NoteParams, time: number): { in: AudioNode; out: AudioNode } | null {
  const spec: SwellSpec | undefined = p.swell;
  if (!spec) return null;
  const db = Math.min(0, Number.isFinite(spec.db) ? spec.db! : 0);
  const oct = Math.max(0, Number.isFinite(spec.oct) ? spec.oct! : 0);
  const over = Math.max(0.05, Number.isFinite(spec.over) ? spec.over! : 0);
  if (db > -0.05 && oct < 0.01) return null;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.pow(10, db / 20), time);
  g.gain.exponentialRampToValueAtTime(1, time + over);
  if (oct < 0.01) return { in: g, out: g };
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = -3.01;
  const open = Math.max(STAGE_TONE.minHz, Math.min(STAGE_TONE.maxHz, midiToHz(p.midi ?? 60) * STAGE_TONE.harmonics));
  f.frequency.setValueAtTime(open * Math.pow(2, -oct), time);
  f.frequency.exponentialRampToValueAtTime(20000, time + over);
  g.connect(f);
  return { in: g, out: f };
}

/** One kitchen instance the rota put on this lane: the registered id, and its knobs. */
export interface FxSpec {
  id: string;
  params?: EffectParams;
}

// A [from, to] pair out of whatever the plan wrote: a scalar holds still.
export function pair(v: Ramped | null | undefined, fallback = 1): [number, number] {
  if (v == null) return [fallback, fallback];
  if (Array.isArray(v)) return [v[0] ?? fallback, v[1] ?? v[0] ?? fallback];
  return [v, v];
}

// Park a filter frequency, or walk it from one value to another across the
// note. The walk is linear in log frequency, which is how a filter sounds like
// it is moving evenly.
export function rampFrequency(param: AudioParam, from: number, to: number, time: number, end: number): void {
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
export function phaserInsert(ctx: BaseAudioContext, spec: PhaserSpec, time: number, end: number): PhaserInsert {
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
  let node: AudioNode = input;
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
export function dipInsert(ctx: BaseAudioContext, spec: DipSpec): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'peaking';
  f.frequency.value = Math.max(40, Math.min(12000, spec.hz ?? 700));
  f.Q.value = Math.max(0.3, Math.min(4, spec.q ?? 1.2));
  f.gain.value = Math.max(-6, Math.min(0, spec.db ?? 0));
  return f;
}

/**
 * One registered effect, built as an insert on this note and let go when the
 * note is.
 *
 * **It is built per note, which is the pattern this engine already has.** The
 * phaser above is a per-note insert and has been since v1, and an effect
 * instance out of the kitchen is the same shape with its DSP in a module of its
 * own. What a per-note insert costs is what `packages/engine/tools/budget.ts`
 * prices and what round K5b's ceiling rule rations: one instance per treated
 * lane at a time, because the rota draws one kind per lane per segment.
 *
 * **It begins at the note** (R28 of the reconciled review of 09-24): its
 * sources are started at `time`, so a tremolo's phase is the phase on the
 * downbeat it was drawn for, live and rendered alike, where they started at
 * nought — whatever the look-ahead left live, and the head of the render
 * offline, running every LFO from sample 0 to its note.
 *
 * `dispose` is given the end of the note, and the shell waits out the tail the
 * effect declared — its own number, over its whole parameter range, not a
 * guess — so a delay let go at the end of a chord rings out instead of being
 * cut off. The tail used to be added here as well as in the shell, so every
 * instance lived twice its tail past its note: a tape delay forty seconds, with
 * its LFOs running and a timer each. Offline there is no clock to wait on and
 * the render ends with the graph, which is what `dispose` already knows.
 */
function effectInsert(
  ctx: BaseAudioContext,
  settings: Settings,
  spec: FxSpec,
  time: number,
  end: number,
): EffectInstance | null {
  if (!BY_ID[spec.id]) return null;
  // **A modulation source is not an insert** (the fault pass of 09-25, Eugene
  // on 96f81df: the melodic bus at +10 dBFS and the limiter taking six
  // decibels through the ambient spell's outros). `lfoParam`'s output is a
  // signal meant for an AudioParam; in a note's chain it was summed into the
  // sound, at the depth the rota wrote for every effect — half a unit, a 0.16 Hz
  // swing of ±0.49 per pad note, six notes to a chord. With nothing for it to
  // move here, the note plays as it would with no insert, which is what the
  // effect's own header says an insert of it is: a wire. The program is not
  // touched; whether the rota should draw it at all is R33, the rules pass's.
  if (BY_ID[spec.id].output === 'signal') return null;
  const fx = makeEffect(spec.id, ctx, settings, spec.params || {}, time);
  fx.dispose(end);
  return fx;
}

/**
 * **The stage's colour, for a voice that has no filter of its own to put it on**
 * (R3 of the reconciled review of 09-24; Eugene's question 5). The stage writes
 * `lpMul` and `hpMul` onto every event of a treated lane — the back-of-stage
 * darkening, the filter close, the high-pass rise — and three voices read them
 * (`keys`, `piano`, and `pad` through `strings`/`keys`); the other treated
 * voices ignored them, so a lane the machine view showed darkening did not.
 * Here the colour is a pair of Butterworth filters of the stage's own, built
 * only when the note carries a colour that is not 1:
 *
 *   lowpass   open at 24 harmonics of the note, held between 2.5 and 9 kHz
 *             (the keys' own ceiling), times `lpMul`, walked across the note in
 *             octaves as the voices that have one walk theirs
 *   highpass  at 40 Hz times `hpMul`
 *
 * A voice that puts the colour on its own filter says so (`own`), and gets
 * none of this: the three above sound exactly as they did.
 */
export const STAGE_TONE = { harmonics: 24, minHz: 2500, maxHz: 9000, hpHz: 40 };
export function stageTone(ctx: BaseAudioContext, p: NoteParams, tail: AudioNode, time: number, end: number): AudioNode {
  const lp = pair(p.lpMul);
  const hp = pair(p.hpMul);
  let node = tail;
  if (lp[0] !== 1 || lp[1] !== 1) {
    const open = Math.max(STAGE_TONE.minHz, Math.min(STAGE_TONE.maxHz, midiToHz(p.midi ?? 60) * STAGE_TONE.harmonics));
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = -3.01;
    rampFrequency(f.frequency, Math.min(20000, open * lp[0]), Math.min(20000, open * lp[1]), time, end);
    node.connect(f);
    node = f;
  }
  if (hp[0] !== 1 || hp[1] !== 1) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.Q.value = -3.01;
    rampFrequency(f.frequency, STAGE_TONE.hpHz * hp[0], STAGE_TONE.hpHz * hp[1], time, end);
    node.connect(f);
    node = f;
  }
  return node;
}

// The one call a voice makes: hand it the tail of its chain and it hands back
// the new tail, having inserted whatever the plan asked for.
//
// `settings` is the room the note is being played in, which every voice already
// has and which an effect's builder is handed the way a voice's is. Nothing in
// the kitchen reads it today; it is in the signature so the day one does there
// is no signature to change, which is the line the effect contract is written
// on.
export function insert(
  ctx: BaseAudioContext,
  p: NoteParams | null | undefined,
  tail: AudioNode,
  time: number,
  end: number,
  settings: Settings,
  own: { stage?: boolean } = {},
): AudioNode {
  if (!p) return tail;
  let node: AudioNode = own.stage ? tail : stageTone(ctx, p, tail, time, end);
  if (p.dip && (p.dip.db ?? 0) < -0.05) {
    const d = dipInsert(ctx, p.dip);
    node.connect(d);
    node = d;
  }
  if (p.fx) {
    const fx = effectInsert(ctx, settings, p.fx, time, end);
    if (fx) {
      node.connect(fx.input);
      node = fx.output;
    }
  }
  if (p.phaser) {
    const ph = phaserInsert(ctx, p.phaser, time, end);
    node.connect(ph.in);
    node = ph.out;
  }
  const sw = swellInsert(ctx, p, time);
  if (!sw) return node;
  node.connect(sw.in);
  return sw.out;
}

export default insert;
