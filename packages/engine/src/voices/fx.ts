// The glue: a riser into a drop, a sweep falling out of one, and a low impact
// on the downbeat. All noise and one oscillator, nothing sampled.

import { noiseSource, percEnv, noteEnv, route, panner, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';

// A number a note may write, or the voice's own where it wrote none or wrote
// something that is not a finite number, held to what the voice can take.
const clampTo = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

/**
 * **What of each glue voice's envelope a note may write** (round S2 of the
 * composer, house-v2's `glueFades`): the rise on the line (`attack`, seconds),
 * the fall after it (`release`, seconds) and where a falling filter starts
 * (`top`, hertz). Read as `p.top` always was, held to the voice's own range in
 * the voice, and absent means the envelope it always had — so a note that
 * writes none of them is the note it was, to the sample. `impact` is a sine
 * thump and has none. The composer asks this table, not the voices' names.
 */
export const GLUE_SHAPES: Record<string, { attack?: true; release?: true; top?: true }> = {
  riser: { release: true },
  sweepDown: { attack: true, top: true },
  swell: { release: true },
};

export function riser(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number {
  time = startTime(ctx, time);
  const dur = p.dur ?? 4;
  const src = noiseSource(ctx, time, dur + 0.2);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(320, time);
  bp.frequency.exponentialRampToValueAtTime(p.top ?? 7000, time + dur);

  // The one place an exponential attack is not a step: this swell rises over
  // `dur` seconds, so its last millisecond covers a hundredth of a dB. Every
  // hit in the kit ramps linearly from true zero instead.
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(p.gain ?? 0.7, time + dur * 0.92);
  // Its fall after the line: 80 ms unless the note says (`GLUE_SHAPES`).
  const release = clampTo(p.release, 0.08, 0.08, 4);
  g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + dur + release);
  g.gain.linearRampToValueAtTime(0, time + dur + release + 0.04);

  const pan = panner(ctx, 0);
  src.connect(bp);
  bp.connect(g);
  g.connect(pan);
  route(ctx, pan, out, { dry: 1, reverb: 0.3, delay: 0.1 });
  return time + dur + release + 0.04;
}

export function sweepDown(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number {
  time = startTime(ctx, time);
  const dur = p.dur ?? 2;
  const src = noiseSource(ctx, time, dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3.5;
  lp.frequency.setValueAtTime(p.top ?? 9000, time);
  lp.frequency.exponentialRampToValueAtTime(220, time + dur);
  const g = ctx.createGain();
  // Its rise on the line: 10 ms unless the note says (`GLUE_SHAPES`), never
  // more than half the fall.
  const end = percEnv(g, time, p.gain ?? 0.5, clampTo(p.attack, 0.01, 0.003, dur * 0.5), dur);
  src.connect(lp);
  lp.connect(g);
  route(ctx, g, out, { dry: 1, reverb: 0.4, delay: 0.12 });
  return end;
}

// A reverse-ish swell: noise through a narrow band, rising into the hit.
//
// `time` is the swell's **onset** and `p.dur` is how long it takes to arrive,
// so the arrival is `time + dur`. It used to be the other way round — the
// event carried the arrival and this function subtracted the duration — and
// that cannot work live: the scheduler only sees an event when its own time
// enters a lookahead window of about 150 ms, so a swell whose arrival was
// 120 ms away started its source 1.68 seconds *in the past* and the browser
// played whatever was left of the envelope. Offline rendering schedules
// everything at once and so produced the swell the live page never could.
//
// With the onset as the event's time the scheduler visits it a whole duration
// early, and when it is late the guard moves the *whole* gesture — onset and
// arrival together — instead of validating the arrival and then scheduling
// before it.
export function swell(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number {
  const dur = p.dur ?? 1.6;
  const start = startTime(ctx, time);
  time = start + dur;
  const src = noiseSource(ctx, Math.max(0, start), dur + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, Math.max(0, start));
  g.gain.exponentialRampToValueAtTime(p.gain ?? 0.4, time);
  // Its fall after the arrival: 30 ms to silence unless the note says
  // (`GLUE_SHAPES`), and then a curve rather than a line.
  const release = clampTo(p.release, 0.03, 0.03, 4);
  if (release <= 0.03) g.gain.linearRampToValueAtTime(0, time + 0.03);
  else {
    g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + release);
    g.gain.linearRampToValueAtTime(0, time + release + 0.01);
  }
  src.connect(bp);
  bp.connect(g);
  route(ctx, g, out, { dry: 0.6, reverb: 0.6 });
  return time + (release <= 0.03 ? 0.03 : release + 0.01);
}

export function impact(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number {
  time = startTime(ctx, time);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, time);
  o.frequency.exponentialRampToValueAtTime(34, time + 0.5);
  const g = ctx.createGain();
  const end = noteEnv(g, time, p.gain ?? 0.6, 0.004, 0.1, 0.7);
  o.connect(g);
  route(ctx, g, out, { dry: 1, reverb: 0.25 });
  o.start(time);
  o.stop(end + 0.02);
  return end;
}

// The glue. None of them is in the harmony and none of them is gated by an
// arrangement layer — `plays` is null because the generator writes them off
// the section plan directly, on the `fx` layer — so they are the one group the
// lane meters read off the events alone.
//
// `swell` is the one anticipatory voice in the catalogue: its event time is
// the *arrival* and the sound has to start `p.dur` before it, because the
// swell is a reversed sound and what it arrives *on* is its own end. That is
// what `anticipates` says here — the instrument's own property, read once by
// the compiler into the program's `lead` and `onset`, so no scheduler and no
// check ever compares a voice against the word `swell` again. Until round E it
// was a line in performance.ts doing exactly that.
export const descriptors: Descriptor[] = [
  {
    name: 'riser',
    cost: 'cheap',
    family: 'effect',
    roles: ['texture'],
    bus: 'melodic',
    level: 'fx',
    layer: 'fx',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: null,
    render: riser,
    timbres: {},
    dispatches: [],
    mood: [],
  },
  {
    name: 'sweepDown',
    cost: 'cheap',
    family: 'effect',
    roles: ['texture'],
    bus: 'melodic',
    level: 'fx',
    layer: 'fx',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: null,
    render: sweepDown,
    timbres: {},
    dispatches: [],
    mood: [],
  },
  {
    name: 'swell',
    cost: 'cheap',
    family: 'effect',
    roles: ['texture'],
    bus: 'melodic',
    level: 'fx',
    layer: 'fx',
    plays: null,
    mono: false,
    treat: false,
    // The arrival is the event's time and the sound is `p.dur` long, so it
    // begins that far before it. 1.6 s is what `swell()` itself defaults a
    // missing duration to, and the two have to agree or the sound would start
    // where nothing scheduled it.
    anticipates: (p: NoteParams) => p?.dur ?? 1.6,
    prepare: null,
    render: swell,
    timbres: {},
    dispatches: [],
    mood: [],
  },
  {
    name: 'impact',
    cost: 'cheap',
    family: 'effect',
    roles: ['texture'],
    bus: 'melodic',
    level: 'fx',
    layer: 'fx',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: null,
    render: impact,
    timbres: {},
    dispatches: [],
    mood: [],
  },
];
