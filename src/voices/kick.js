// One oscillator, shaped by the numbers the benchmark states directly: a click
// in the mid-50s Hz falling into the mid-40s within 40 ms and settling there,
// with an amplitude envelope given as its -6, -20 and -34 dB times. A little
// saturation puts harmonics in 120-250 Hz, where a small speaker can find the
// beat even though it cannot reproduce a note of the fundamental.

import PARAMS from '../params.js';
import { noiseSource, route, saturationCurve, MIN_RELEASE, startTime} from '../dsp.js';

export function kick(ctx, out, time, p = {}) {
  time = startTime(ctx, time); // never in the past: a step if it is
  const K = PARAMS.kick;
  const vel = p.vel ?? 1;
  const startHz = p.startHz ?? K.startHz;
  const endHz = p.endHz ?? K.endHz;

  const sum = ctx.createGain();
  sum.gain.value = p.gain ?? 1;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startHz, time);
  osc.frequency.exponentialRampToValueAtTime(endHz, time + K.pitchTime);

  const drive = ctx.createWaveShaper();
  drive.curve = saturationCurve(K.drive);
  drive.oversample = '2x';

  // The envelope, leg by leg, straight off the measured times.
  const g = ctx.createGain();
  const peak = Math.max(0.0002, vel);
  // A *linear* ramp from true zero. An exponential from 0.0001 spends its
  // last tenth of a millisecond crossing 60 dB, which is a step in all but
  // name and is the loudest sample of the hit; this reaches the peak over four
  // milliseconds and the loudest sample is the peak, where it belongs.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + K.attack);
  g.gain.exponentialRampToValueAtTime(peak * 0.5012, time + K.t6); // -6 dB
  g.gain.exponentialRampToValueAtTime(peak * 0.1, time + K.t20); // -20 dB
  g.gain.exponentialRampToValueAtTime(peak * 0.02, time + K.t34); // -34 dB
  g.gain.linearRampToValueAtTime(0, time + K.t34 + MIN_RELEASE);
  const end = time + K.t34 + MIN_RELEASE;

  // The kick is meant to be felt rather than heard: a lowpass right above the
  // fundamental keeps the saturation's harmonics as weight and throws away the
  // part that makes a kick sound like a tom.
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = K.bodyLp;
  body.Q.value = 0.6;

  // The body partial: a second, shorter sine an octave or two up, which is the
  // part of a kick a small speaker can actually reproduce. It is a *drum*
  // sound — it decays with the hit — where the click was an attack transient.
  if (K.partialLevel > 0) {
    const po = ctx.createOscillator();
    po.type = 'sine';
    po.frequency.setValueAtTime(K.partialHz * 1.35, time);
    po.frequency.exponentialRampToValueAtTime(K.partialHz, time + K.pitchTime * 1.6);
    const pg = ctx.createGain();
    pg.gain.value = 0;
    pg.gain.setValueAtTime(0, time);
    pg.gain.linearRampToValueAtTime(K.partialLevel * vel, time + K.attack);
    pg.gain.exponentialRampToValueAtTime(0.0002, time + K.partialDecay);
    pg.gain.linearRampToValueAtTime(0, time + K.partialDecay + MIN_RELEASE);
    po.connect(pg);
    pg.connect(sum);
    po.start(time);
    po.stop(time + K.partialDecay + 0.02);
  }

  osc.connect(drive);
  drive.connect(body);
  body.connect(g);
  g.connect(sum);

  // A soft low-mid transient, not a tick. It was raised 8 dB and opened to
  // 3 kHz in the balance round to give a phone something to hear, and that was
  // the wrong lever: MEASURED, the benchmark kick slots have nothing above
  // about 2 kHz, and a 380 Hz - 3 kHz burst on every beat with an empty band
  // between beats reads as a click and not as a drum. The phone gets its
  // presence from the body partial below instead.
  //
  // A level of zero means the click is not built. Every envelope in this file
  // has a floor of 0.0002 under it, because a gain must never reach true zero
  // on the way down -- but a floor under a peak of nothing is a burst at
  // -74 dB that still runs a noise source and two filters on every beat. The
  // noise buffer is *stereo*, so that inaudible burst was also the one thing
  // making a mono voice two channels wide; `buildGraph` now pins the bus to
  // one channel as well, and between them the kick is mono in the graph and
  // mono in the node count.
  if (K.clickLevel > 0) {
    const click = noiseSource(ctx, time, 0.02);
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = K.clickHp;
    // Nothing on the kick above a couple of kHz: the click is a knock, not a
    // tick, and in the benchmarks the top of a kick slot is nearly empty.
    const ct = ctx.createBiquadFilter();
    ct.type = 'lowpass';
    ct.frequency.value = K.clickLp;
    ct.Q.value = 0.6;
    const cg = ctx.createGain();
    const cpeak = Math.max(0.0002, K.clickLevel * vel);
    cg.gain.value = 0;
    cg.gain.setValueAtTime(0, time);
    cg.gain.linearRampToValueAtTime(cpeak, time + K.clickAttack);
    // The click keeps the length it had: a longer ramp in front of the same
    // decay would be a louder click, and its band is 380 Hz - 3 kHz.
    cg.gain.exponentialRampToValueAtTime(0.0002, time + 0.005);
    cg.gain.linearRampToValueAtTime(0, time + 0.005 + MIN_RELEASE);
    click.connect(cf);
    cf.connect(ct);
    ct.connect(cg);
    cg.connect(sum);
  }

  // MEASURED: the kick has no reverb. The 100-300 Hz band isolates in 2 of 15
  // windows and has nothing to decay; whatever room exists is high-passed well
  // above it.
  route(ctx, sum, out, { dry: 1 });

  osc.start(time);
  osc.stop(end + 0.02);
  return end;
}

export default kick;
