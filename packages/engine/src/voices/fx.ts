// The glue: a riser into a drop, a sweep falling out of one, a swell into the
// hit and a low impact on the downbeat. All noise and one oscillator, nothing
// sampled.
//
// Round R2: four topologies, each the shape of a gesture, and the four sounds
// are rows over them (`sounds/effect/riser.json`, `sweepDown.json`,
// `swell.json`, `impact.json`) — the corners, the lengths, the levels and the
// sends that were literals here. None is in the harmony and none is gated by
// an arrangement layer (`plays` null): the generator writes them off the
// section plan on the `fx` layer, so they are the one group the lane meters
// read off the events alone.

import { noiseSource, percEnv, noteEnv, route, panner, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import type { SoundRow, Topology } from './sound.ts';
import { rowPatch } from './sound.ts';
import { contract, pos, HZ, LEVEL, Q, SECONDS, SEND } from './schema.ts';
import type { Contract, Fields, PatchOf } from './schema.ts';

// A number a note may write, or the voice's own where it wrote none or wrote
// something that is not a finite number, held to what the voice can take.
const clampTo = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

/**
 * **What of a glue gesture's envelope a note may write** (round S2 of the
 * composer, house-v2's `glueFades`): the rise on the line (`attack`, seconds),
 * the fall after it (`release`, seconds) and where a falling filter starts
 * (`top`, hertz) — held to the gesture's own range in the voice, and absent
 * the envelope it always had. A topology declares it (`glue`); the registry
 * gathers it by sound as `GLUE_SHAPES`, which is what the composer asks,
 * never the voices' names. The thump has none.
 */
// What a row of each gesture carries: exactly these, each in its range
// (`schema.ts`). A level an exponential ramp ends on is above nought, and the
// rise is a share of the gesture's length.
const RISE = contract({
  dur: SECONDS, fromHz: HZ, topHz: HZ, q: Q, gain: pos(16), rise: pos(1), release: SECONDS, reverb: SEND, delay: SEND,
});
const FALL = contract({ dur: SECONDS, topHz: HZ, toHz: HZ, q: Q, gain: pos(16), attack: SECONDS, reverb: SEND, delay: SEND });
const SWELL = contract({ dur: SECONDS, bandHz: HZ, q: Q, gain: pos(16), release: SECONDS, dry: SEND, reverb: SEND });
const THUMPED = contract({
  fromHz: HZ, toHz: HZ, dropTime: SECONDS, gain: LEVEL, attack: SECONDS, hold: SECONDS, release: SECONDS, reverb: SEND,
});
/** A gesture's row, as its contract types it, once it has passed it — with the desk's moves on it where a hand has made any (D1). */
const P = <S extends Fields>(row: SoundRow, c: Contract<S>): PatchOf<S> => rowPatch(row, c);

export const NOISE_RISE: Topology = {
  id: 'noise-rise',
  cost: 'cheap',
  parameters: RISE,
  glue: { release: true },
  render: (row): VoiceRenderer => (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number => {
    const S = P(row, RISE);
    time = startTime(ctx, time);
    const dur = p.dur ?? S.dur;
    const src = noiseSource(ctx, time, dur + 0.2);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = S.q;
    bp.frequency.setValueAtTime(S.fromHz, time);
    bp.frequency.exponentialRampToValueAtTime(p.top ?? S.topHz, time + dur);

    // The one place an exponential attack is not a step: this swell rises over
    // `dur` seconds, so its last millisecond covers a hundredth of a dB. Every
    // hit in the kit ramps linearly from true zero instead.
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(p.gain ?? S.gain, time + dur * S.rise);
    // Its fall after the line: the row's unless the note says (`glue`).
    const release = clampTo(p.release, S.release, S.release, 4);
    g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + dur + release);
    g.gain.linearRampToValueAtTime(0, time + dur + release + 0.04);

    const pan = panner(ctx, 0);
    src.connect(bp);
    bp.connect(g);
    g.connect(pan);
    route(ctx, pan, out, { dry: 1, reverb: S.reverb, delay: S.delay });
    return time + dur + release + 0.04;
  },
};

export const NOISE_FALL: Topology = {
  id: 'noise-fall',
  cost: 'cheap',
  parameters: FALL,
  glue: { attack: true, top: true },
  render: (row): VoiceRenderer => (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number => {
    const S = P(row, FALL);
    time = startTime(ctx, time);
    const dur = p.dur ?? S.dur;
    const src = noiseSource(ctx, time, dur + 0.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = S.q;
    lp.frequency.setValueAtTime(p.top ?? S.topHz, time);
    lp.frequency.exponentialRampToValueAtTime(S.toHz, time + dur);
    const g = ctx.createGain();
    // Its rise on the line: the row's unless the note says (`glue`), never
    // more than half the fall.
    const end = percEnv(g, time, p.gain ?? S.gain, clampTo(p.attack, S.attack, 0.003, dur * 0.5), dur);
    src.connect(lp);
    lp.connect(g);
    route(ctx, g, out, { dry: 1, reverb: S.reverb, delay: S.delay });
    return end;
  },
};

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
//
// It is the one anticipatory gesture in the catalogue: the arrival is the
// event's time and the sound is `p.dur` long, so it begins that far before it,
// read once by the compiler into the program's `lead` and `onset`. The row's
// own length is what a note that states none anticipates by, and the two
// have to agree or the sound would start where nothing scheduled it.
export const REVERSE_SWELL: Topology = {
  id: 'reverse-swell',
  cost: 'cheap',
  parameters: SWELL,
  glue: { release: true },
  anticipatesOf: (row) => {
    const S = P(row, SWELL);
    return (p: NoteParams) => p?.dur ?? S.dur;
  },
  render: (row): VoiceRenderer => (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number => {
    const S = P(row, SWELL);
    const dur = p.dur ?? S.dur;
    const start = startTime(ctx, time);
    time = start + dur;
    const src = noiseSource(ctx, Math.max(0, start), dur + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = S.q;
    bp.frequency.value = S.bandHz;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, Math.max(0, start));
    g.gain.exponentialRampToValueAtTime(p.gain ?? S.gain, time);
    // Its fall after the arrival: the row's to silence unless the note says
    // (`glue`), and then a curve rather than a line.
    const release = clampTo(p.release, S.release, S.release, 4);
    if (release <= S.release) g.gain.linearRampToValueAtTime(0, time + S.release);
    else {
      g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + release);
      g.gain.linearRampToValueAtTime(0, time + release + 0.01);
    }
    src.connect(bp);
    bp.connect(g);
    route(ctx, g, out, { dry: S.dry, reverb: S.reverb });
    return time + (release <= S.release ? S.release : release + 0.01);
  },
};

export const THUMP: Topology = {
  id: 'thump',
  cost: 'cheap',
  parameters: THUMPED,
  render: (row): VoiceRenderer => (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}): number => {
    const S = P(row, THUMPED);
    time = startTime(ctx, time);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(S.fromHz, time);
    o.frequency.exponentialRampToValueAtTime(S.toHz, time + S.dropTime);
    const g = ctx.createGain();
    const end = noteEnv(g, time, p.gain ?? S.gain, S.attack, S.hold, S.release);
    o.connect(g);
    route(ctx, g, out, { dry: 1, reverb: S.reverb });
    o.start(time);
    o.stop(end + 0.02);
    return end;
  },
};
