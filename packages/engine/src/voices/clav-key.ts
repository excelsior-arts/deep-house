// A clavinet-ish key: a narrow pulse, a comb tuned to the note, a bright
// resonant lowpass, and an envelope that is nearly all attack.
//
// Round K2 of PLAN-KITCHEN. It is the figure and the stab voice of the six —
// the one that can play sixteenths without filling the octave a vocal or a lead
// sits in, because a narrow pulse has a thin fundamental and its energy is in
// the harmonics. The keys' own `pluck` preset is the nearest thing the
// catalogue has and it is a saw and a square through a static lowpass; what
// makes a clavinet a clavinet is the pickup under a plucked string: a comb, and
// a little drive on it.
//
//   the pulse   a sawtooth less the same sawtooth a quarter of a period later,
//               which is a rectangle of that duty. The width wanders a little,
//               and it is a fraction of the note's own period, so the notches
//               track the pitch instead of turning into a formant.
//   the comb    the same trick again at half a period, mixed rather than
//               subtracted: the notches of a pickup. It is **feed-forward**,
//               and that is the same finding the Karplus string is built on —
//               a cycle through a `DelayNode` is quantised to a render
//               quantum, 128 samples, and half a period at 500 Hz is one
//               millisecond. A feed-forward comb has the notches and not the
//               ring, which on a plucked key is what is wanted anyway.
//   the drive   a saturation on the pickup, which is what a clavinet's output
//               stage does. MEASURED per engine at `none`, `2x` and `4x`
//               (`tools/test-voices.ts --ab`): the numbers are in
//               notes/archive/2026-09-kitchen/rounds/k2.md and the declared setting is the one the two
//               engines agree on.
//   the body    one peaking bell where a clavinet speaks, then a resonant
//               lowpass that opens a little over its corner and falls back in
//               forty-five milliseconds. Velocity opens the corner: a harder
//               note is brighter.

import { midiToHz, adsrEnv, route, panner, phasedLfo, saturationCurve, startTime } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

export function clavKey(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const C = settings.clavKey;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.2);
  const vel = p.vel ?? 1;

  const g = ctx.createGain();
  const decay = Math.min(C.decay, Math.max(0.04, dur * 0.8));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * C.trim, {
    attack: C.attack,
    decay,
    sustain: C.sustain,
    hold: Math.max(0, dur - C.attack - decay),
    release: p.release ?? C.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const cut = Math.min(11000, (p.cutoff ?? C.cutoff) * (1 + C.veloOpen * (vel - 0.5)) * (p.cutoffMul ?? 1));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = C.q;
  lp.frequency.setValueAtTime(Math.min(14000, cut * C.envMult), time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(80, cut), time + C.envTime);
  lp.connect(g);

  // The body's own bell, parked: a filter that moves inside a note is the one
  // thing the timbre study says no instrument does to itself, and this is a
  // resonance and not a gesture.
  const bell = ctx.createBiquadFilter();
  bell.type = 'peaking';
  bell.frequency.value = C.peakHz;
  bell.gain.value = C.peakDb;
  bell.Q.value = C.peakQ;
  bell.connect(lp);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = C.hpHz;
  hp.Q.value = 0.7;
  hp.connect(bell);

  // The pickup, driven. The shaped signal is a narrow pulse that is already
  // mostly harmonics, going straight into a lowpass three and a half kHz down:
  // there is very little here to alias, which is what the A/B measured and why
  // the declared oversample is what it is.
  const sat = ctx.createWaveShaper();
  sat.curve = saturationCurve(p.drive ?? C.drive);
  sat.oversample = C.oversample;
  sat.connect(hp);

  // The comb: the signal plus itself half a period later.
  const sum = ctx.createGain();
  sum.connect(sat);
  const comb = ctx.createDelay(0.05);
  comb.delayTime.value = Math.min(0.049, C.combRatio / hz);
  const combG = ctx.createGain();
  combG.gain.value = C.combMix;
  comb.connect(combG);
  combG.connect(sum);

  // The pulse: the pair of saws, panned apart, less themselves a quarter of a
  // period later.
  const width = Math.max(0.05, Math.min(0.9, p.pwmWidth ?? C.pwmWidth));
  const base = width / hz;
  const mix = ctx.createGain();
  mix.connect(sum);
  mix.connect(comb);
  const dl = ctx.createDelay(0.05);
  dl.delayTime.value = base;
  const inv = ctx.createGain();
  inv.gain.value = -C.pwmMix;
  mix.connect(dl);
  dl.connect(inv);
  inv.connect(sum);
  inv.connect(comb);

  const lfo = phasedLfo(ctx, C.pwmHz, (p.midi % 4) * 1.6);
  const depth = ctx.createGain();
  depth.gain.value = base * C.pwmDepth;
  lfo.connect(depth);
  depth.connect(dl.delayTime);
  lfo.start(time);
  lfo.stop(end + 0.05);

  const spread = (p.spread ?? C.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = side * 4;
    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    o.connect(lvl);
    lvl.connect(pan);
    pan.connect(mix);
    o.start(time);
    o.stop(end + 0.02);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.24, reverb: p.reverb ?? 0.18 });
  return end;
}

/**
 * MEASURED by the gate (`tools/test-voices.ts --bless`). `hold` is the
 * envelope's own sustain fraction and `brightnessHz` its lowpass corner.
 */
export const CLAV_KEY_TIMBRES = {
  clavKey: { family: 'harmonic', struck: true, hold: 0.1, brightnessHz: 3400, loudnessDb: -13.2 },
};

/**
 * The clavinet, as it describes itself.
 *
 * **One role, and the brief asked for two.** It was to be `figure` and `stab`,
 * and `stab` is not a word in this engine's vocabulary: `ROLES` in
 * `descriptor.ts` is closed, a stab *is* a figure played short, and adding a
 * word nobody agreed to is what that list exists to prevent. What a recipe
 * means by a stab is a figure with a short hold, and `hold` is already on the
 * table above.
 */
export const descriptor: Descriptor = {
  name: 'clavKey',
  cost: 'dear',
  family: 'keyboard',
  roles: ['figure'],
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: clavKey,
  timbres: CLAV_KEY_TIMBRES,
  dispatches: [],
  mood: [],
};

export default clavKey;
