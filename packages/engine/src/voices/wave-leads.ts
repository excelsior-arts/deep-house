// Two more lines above middle C: a narrow pulse and a triangle.
//
// Round K2 put a saw lead in this engine and it is the only thing in the
// catalogue that plays a melody. Two is not a choice either; these are the two
// other shapes a subtractive lead is made of, and they are at opposite ends of
// what a single oscillator can be.
//
// **`pulseLead`** is the same comb trick `saw-lead.ts` uses and a different
// instrument, because the number it is set to is different. A sawtooth minus
// the same sawtooth `w` periods later is a rectangle of duty `w`, so the comb's
// delay *is* the pulse width; at `saw-lead.ts`'s 0.42 that is nearly a square,
// which is hollow, and at 0.16 it is a narrow pulse, which is **nasal** — the
// odd harmonics are still all there but the even ones come up and the first
// formant-like hump lands four or five harmonics up instead of one. That is a
// different sound to the ear and not a setting of the same one. Under it sits a
// square an octave down at a third of the level, which is what a lead in this
// register needs to have any weight at all, and over it a filter that opens
// harder and closes faster than the saw's.
//
// **`triLead`** is the other end: a triangle has only odd harmonics and they
// fall at 1/n², so the fifth partial is 28 dB down where a square's is 14. It
// is nearly a sine with an edge on it, and what makes it an instrument rather
// than a test tone is the two things over it — a **fold**, which is a shaper
// that turns the peaks back on themselves and puts the harmonics back in when
// a note is played hard, and a vibrato that arrives rather than starting, which
// is what a player does. It is the quietest, roundest voice in the catalogue
// and it exists for the register above the saw lead, where a saw is a whistle.

import { midiToHz, adsrEnv, route, panner, startTime, phasedLfo } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/**
 * The pulse: a sawtooth pair through a comb whose delay is a fraction of the
 * note's own period, so the notch tracks the pitch rather than standing still
 * as a formant. `saw-lead.ts` carries the arithmetic in full.
 */
export function pulseLead(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = settings.pulseLead;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.3);
  const vel = p.vel ?? 1;
  const period = 1 / hz;

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: S.attack, decay: S.decay, sustain: S.sustain,
    hold: Math.max(0, dur - S.attack - S.decay), release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  const corner = Math.min(14000, S.cutoff * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  lp.frequency.setValueAtTime(Math.min(16000, corner * S.envMult), time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(80, corner), time + S.envTime);
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  // The width wanders, which is what makes it a PWM lead rather than a pulse.
  // R74: a phase in radians off the note's own pitch, as its siblings' are — it was
  // a fraction of a turn off the context's clock, so 11 of 64 steps were reachable
  // and live, render and a seek each started it somewhere else.
  const pwm = phasedLfo(ctx, S.pwmHz, ((p.midi ?? 60) % 6) * 1.05);
  const pwmDepth = ctx.createGain();
  pwmDepth.gain.value = period * S.pwmWidth * S.pwmDepth;
  pwm.connect(pwmDepth);
  pwm.start(time);
  pwm.stop(end + 0.02);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = hz;
    saw.detune.value = side * S.detuneCents * 0.5;
    const line = ctx.createDelay(0.05);
    line.delayTime.value = period * S.pwmWidth;
    pwmDepth.connect(line.delayTime);
    const minus = ctx.createGain();
    minus.gain.value = -1;
    saw.connect(line);
    line.connect(minus);
    const sum = ctx.createGain();
    sum.gain.value = S.pwmMix;
    saw.connect(sum);
    minus.connect(sum);
    const pan = panner(ctx, side * spread);
    sum.connect(pan);
    pan.connect(hp);
    saw.start(time);
    saw.stop(end + 0.02);
  }

  // The octave below, as a plain square: weight, and nothing else. It is mono
  // and in the middle on purpose — a lead's body is not a stereo event.
  const sub = ctx.createOscillator();
  sub.type = 'square';
  sub.frequency.value = hz / 2;
  const subG = ctx.createGain();
  subG.gain.value = S.subLevel;
  sub.connect(subG);
  subG.connect(hp);
  sub.start(time);
  sub.stop(end + 0.02);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.22, reverb: p.reverb ?? 0.26 });
  return end;
}

/**
 * The triangle: odd harmonics at 1/n², a fold that puts some back when a note
 * is played hard, and a vibrato that arrives.
 */
export function triLead(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = settings.triLead;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.4);
  const vel = p.vel ?? 1;

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: S.attack, decay: S.decay, sustain: S.sustain,
    hold: Math.max(0, dur - S.attack - S.decay), release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.value = Math.min(14000, S.cutoff * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  lp.connect(g);

  // The fold, as a shaper. A triangle driven into it grows the harmonics a
  // triangle has not; at a velocity of nothing the drive is under the knee and
  // the curve is a straight line, so a quiet note is a triangle and a loud one
  // is an instrument. It is `dsp.ts`'s own soft clipper and not the kitchen's,
  // because what is wanted here is the safety curve's straight section.
  const drive = ctx.createGain();
  drive.gain.value = 1 + S.fold * vel;
  const shaper = ctx.createWaveShaper();
  shaper.curve = foldCurve();
  shaper.oversample = 'none';
  drive.connect(shaper);
  shaper.connect(lp);

  // The vibrato **arrives**: nothing for `vibDelay`, then a ramp into it. A
  // vibrato that is there from the first sample is a synthesiser and a vibrato
  // that grows is a player.
  // R74: a phase in radians off the note's own pitch, as its siblings' are — it was
  // a fraction of a turn off the context's clock, so 11 of 64 steps were reachable
  // and live, render and a seek each started it somewhere else.
  const vib = phasedLfo(ctx, S.vibHz, ((p.midi ?? 60) % 4) * 1.4);
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, time);
  vibDepth.gain.setValueAtTime(0, time + S.vibDelay);
  vibDepth.gain.linearRampToValueAtTime(S.vibCents, time + S.vibDelay + S.vibRise);
  vib.connect(vibDepth);
  vib.start(time);
  vib.stop(end + 0.02);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz;
    o.detune.value = side * S.detuneCents * 0.5;
    vibDepth.connect(o.detune);
    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    o.connect(lvl);
    lvl.connect(pan);
    pan.connect(drive);
    o.start(time);
    o.stop(end + 0.02);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.2, reverb: p.reverb ?? 0.34 });
  return end;
}

/**
 * A wave folder: a straight line to the knee and then back down, so a peak that
 * goes past it is reflected rather than flattened. It is what a triangle wants
 * and a clipper is not — clipping a triangle gives it a square's spectrum and
 * folding gives it a bell's.
 */
let folded: Float32Array<ArrayBuffer> | null = null;
function foldCurve(n = 4096): Float32Array<ArrayBuffer> {
  if (folded) return folded;
  const c = new Float32Array(n);
  const knee = 0.6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const v = a <= knee ? a : Math.max(-1, 2 * knee - a);
    c[i] = Math.sign(x) * v;
  }
  folded = c;
  return c;
}

/** MEASURED by `tools/test-voices-2.ts --bless`. */
export const PULSE_LEAD_TIMBRES = {
  pulseLead: { family: 'harmonic', struck: false, hold: 0.5, brightnessHz: 1800, loudnessDb: -12 },
};
export const TRI_LEAD_TIMBRES = {
  triLead: { family: 'harmonic', struck: false, hold: 0.6, brightnessHz: 2400, loudnessDb: -12 },
};

export const pulseLeadDescriptor: Descriptor = {
  name: 'pulseLead',
  cost: 'dear',
  family: 'keyboard',
  roles: ['melody', 'figure'],
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: pulseLead,
  timbres: PULSE_LEAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export const triLeadDescriptor: Descriptor = {
  name: 'triLead',
  cost: 'mid',
  family: 'keyboard',
  roles: ['melody', 'figure'],
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: triLead,
  timbres: TRI_LEAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export const descriptors: Descriptor[] = [pulseLeadDescriptor, triLeadDescriptor];
export default descriptors;
