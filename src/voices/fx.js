// The glue: a riser into a drop, a sweep falling out of one, and a low impact
// on the downbeat. All noise and one oscillator, nothing sampled.

import { noiseSource, percEnv, noteEnv, route, panner, startTime} from '../dsp.js';

export function riser(ctx, out, time, p = {}) {
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
  g.gain.exponentialRampToValueAtTime(0.0002, time + dur + 0.08);
  g.gain.linearRampToValueAtTime(0, time + dur + 0.12);

  const pan = panner(ctx, 0);
  src.connect(bp);
  bp.connect(g);
  g.connect(pan);
  route(ctx, pan, out, { dry: 1, reverb: 0.3, delay: 0.1 });
  return time + dur + 0.12;
}

export function sweepDown(ctx, out, time, p = {}) {
  time = startTime(ctx, time);
  const dur = p.dur ?? 2;
  const src = noiseSource(ctx, time, dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3.5;
  lp.frequency.setValueAtTime(p.top ?? 9000, time);
  lp.frequency.exponentialRampToValueAtTime(220, time + dur);
  const g = ctx.createGain();
  const end = percEnv(g, time, p.gain ?? 0.5, 0.01, dur);
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
export function swell(ctx, out, time, p = {}) {
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
  g.gain.linearRampToValueAtTime(0, time + 0.03);
  src.connect(bp);
  bp.connect(g);
  route(ctx, g, out, { dry: 0.6, reverb: 0.6 });
  return time + 0.03;
}

export function impact(ctx, out, time, p = {}) {
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
