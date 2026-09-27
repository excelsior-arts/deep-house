// One oscillator, shaped by the numbers the benchmark states directly: a click
// in the mid-50s Hz falling into the mid-40s within 40 ms and settling there,
// with an amplitude envelope given as its -6, -20 and -34 dB times. A little
// saturation puts harmonics in 120-250 Hz, where a small speaker can find the
// beat even though it cannot reproduce a note of the fundamental.

import { noiseSource, route, saturationCurve, MIN_RELEASE, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { knobScale, withControls } from './descriptor.ts';
import type { Controls, Descriptor, Knobs, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/**
 * **The kick's two ranges** (PLAN-MODULATION M1). The defaults are the
 * benchmark's own numbers, straight off `INSTRUMENTS.kick`.
 *
 * It declares **no `brightnessHz`**, and that is a statement about the
 * instrument rather than an omission: the only corner this voice has is
 * `bodyLp` at 140 Hz, and the measurement that put it there is the one that
 * says a deep house kick is 40-63 Hz with very little above 100 — *a rock drum,
 * in Eugene's words*, was what 300 Hz sounded like. Moving that lid is not a
 * brighter kick, it is a tom, so it is a different instrument and not a knob.
 *
 * `hold` is in **seconds** and not in the ratio the harmonic voices use: a
 * kick's fraction still sounding at the bar line is nought by construction, so
 * there is no ratio to scale, and its tail is the -34 dB time the benchmark
 * states. What the knob scales is all three legs together, so the shape of the
 * fall — the thing the measurement actually pinned — is the shape it was.
 */
export const KICK_KNOBS: Knobs = {
  hold: { unit: 'seconds', min: 0.07, default: 0.17, max: 0.42, bird: 'tide', sense: 1, slopeDb: 18.4 },
  attack: { unit: 'seconds', min: 0.0012, default: 0.004, max: 0.018, bird: 'ember', sense: -1, slopeDb: -12.7 },
};

export function kick(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, KICK_CONTROLS);
  time = startTime(ctx, time); // never in the past: a step if it is
  const K = settings.kick;
  const vel = p.vel ?? 1;
  const startHz = p.startHz ?? K.startHz;
  const endHz = p.endHz ?? K.endHz;
  // The two knobs, as factors against the numbers above: exactly 1 with nothing
  // asked for, so every line below is the line it always was to the bit.
  const kHold = knobScale(p, KICK_KNOBS, 'hold');
  const kAttack = knobScale(p, KICK_KNOBS, 'attack');
  const attack = K.attack * kAttack;
  // Each leg stays after the one before it, whatever the two knobs are asked
  // for together: an exponential ramp that ends before the one it starts from
  // is not a shorter decay, it is a throw. At the defaults each of these is the
  // benchmark's own number, because `Math.max` of a number and something under
  // it is that number.
  const t6 = Math.max(attack + MIN_RELEASE, K.t6 * kHold);
  const t20 = Math.max(t6 + MIN_RELEASE, K.t20 * kHold);
  const t34 = Math.max(t20 + MIN_RELEASE, K.t34 * kHold);

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
  const peak = Math.max(GAIN_FLOOR, vel);
  // A *linear* ramp from true zero. An exponential from 0.0001 spends its
  // last tenth of a millisecond crossing 60 dB, which is a step in all but
  // name and is the loudest sample of the hit; this reaches the peak over four
  // milliseconds and the loudest sample is the peak, where it belongs.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.exponentialRampToValueAtTime(peak * 0.5012, time + t6); // -6 dB
  g.gain.exponentialRampToValueAtTime(peak * 0.1, time + t20); // -20 dB
  g.gain.exponentialRampToValueAtTime(peak * 0.02, time + t34); // -34 dB
  g.gain.linearRampToValueAtTime(0, time + t34 + MIN_RELEASE);
  const end = time + t34 + MIN_RELEASE;

  // The kick is meant to be felt rather than heard: a lowpass right above the
  // fundamental keeps the saturation's harmonics as weight and throws away the
  // part that makes a kick sound like a tom.
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = p.bodyLp ?? K.bodyLp;
  body.Q.value = 0.6;

  // The body partial: a second, shorter sine an octave or two up, which is the
  // part of a kick a small speaker can actually reproduce. It is a *drum*
  // sound — it decays with the hit — where the click was an attack transient.
  const partialLevel = p.partialLevel ?? K.partialLevel;
  if (partialLevel > 0) {
    const po = ctx.createOscillator();
    po.type = 'sine';
    po.frequency.setValueAtTime(K.partialHz * 1.35, time);
    po.frequency.exponentialRampToValueAtTime(K.partialHz, time + K.pitchTime * 1.6);
    const pg = ctx.createGain();
    pg.gain.value = 0;
    pg.gain.setValueAtTime(0, time);
    const partialDecay = Math.max(attack + MIN_RELEASE, K.partialDecay * kHold);
    pg.gain.linearRampToValueAtTime(partialLevel * vel, time + attack);
    pg.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + partialDecay);
    pg.gain.linearRampToValueAtTime(0, time + partialDecay + MIN_RELEASE);
    po.connect(pg);
    pg.connect(sum);
    po.start(time);
    po.stop(time + partialDecay + 0.02);
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
    const cpeak = Math.max(GAIN_FLOOR, K.clickLevel * vel);
    cg.gain.value = 0;
    cg.gain.setValueAtTime(0, time);
    cg.gain.linearRampToValueAtTime(cpeak, time + K.clickAttack);
    // The click keeps the length it had: a longer ramp in front of the same
    // decay would be a louder click, and its band is 380 Hz - 3 kHz.
    cg.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + 0.005);
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


/**
 * The four-to-the-floor, and the only voice that owns a bus of its own: it and
 * the sub are the record's bottom, so the mono gate holds both and the sound
 * stage moves neither.
 */
/**
 * What a part may write on a kick note (the style's "rounded" kick). The body's
 * lowpass is the kick's one corner and it is kept in the kick's own register:
 * 300 Hz is where a deep house kick turns into a tom (the modulation round's
 * measurement), so the range stops short of it. Defaults are the kick block's.
 */
export const KICK_CONTROLS: Controls = {
  bodyLp: { unit: 'hz', min: 80, max: 240, default: 140 },
  partialLevel: { unit: 'level', min: 0, max: 0.3, default: 0.09 },
};

export const descriptor: Descriptor = {
  name: 'kick',
  cost: 'cheap',
  knobs: KICK_KNOBS,
  family: 'drum',
  roles: ['kick'],
  bus: 'kick',
  level: 'kick',
  layer: 'kick',
  plays: 'kick',
  mono: true,
  treat: false,
  anticipates: null,
  prepare: null,
  render: kick,
  controls: KICK_CONTROLS,
  noteControls: Object.keys(KICK_CONTROLS),
  timbres: {},
  dispatches: [],
  mood: [],
};

export default kick;
