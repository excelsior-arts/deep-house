// A supersaw pad: seven sawtooths spread across a fifth of a semitone and
// across the stereo picture, under a lowpass that opens over the first seconds
// of the note.
//
// Round K2 of PLAN-KITCHEN. The catalogue's ensemble is five saws at ±10 cents
// with two wandering delay taps on it, and what makes it an *ensemble* is the
// chorus: two copies of one thing, moving. A supersaw is not that. It is one
// instrument with seven oscillators in it, detuned **evenly** end to end and
// panned end to end with them, and its character is that the beats between
// adjacent voices are dense enough to be a texture rather than a wobble. At
// twenty-two cents across seven voices the neighbours beat at three to four
// Hertz in this register and the stack beats at fifteen, which is the sound.
//
// The other half of it is the sweep. Every filter in the harmonic catalogue is
// static, because the timbre study measured fifty-two records and not one of
// them closes a filter inside a note — but the study measured *notes*, and this
// is a pad whose note is four bars long. Opening from 850 Hz to 2.5 kHz over
// four and a half seconds is an arrangement and not an envelope, and it is the
// one thing a pad can do that a chord cannot.
//
// It holds as well as it plays a note: `holdSupersawPad` is the same stack
// against the contract in `voice-contract.ts`, with the corner as a control
// somebody moves rather than a sweep written when the note starts. The
// arithmetic of holding is `held.ts`'s and is not written twice.
//
// It is the most expensive voice in the engine — seven oscillators, seven
// panners and a gain each — and it is declared so: a pad plays two or three
// notes a bar at most, and a phone can carry that where it could not carry a
// sixteenth figure of them.

import { midiToHz, adsrEnv, route, panner, phasedLfo, startTime, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { insert } from './treat.ts';
import { heldVoice } from './held.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { HeldVoice } from './voice-contract.ts';

/**
 * The stack: seven saws, evenly detuned, evenly panned, with the outer voices
 * drifting. Everything but the filter and the envelope, which differ between a
 * note and a drone.
 *
 * @param into what the stack feeds: the lowpass
 * @param S the settings' `supersawPad` block
 */
function stack(ctx: BaseAudioContext, into: AudioNode, time: number, p: NoteParams, S: Settings['supersawPad']) {
  const hz = midiToHz(p.midi);
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const n = Math.max(1, Math.round(S.voices));
  const mid = (n - 1) / 2;
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];

  // The drift: the outer voices wander a few cents at a fourteenth of a Hertz,
  // one side against the other, so the width breathes instead of standing
  // still. One LFO and its negative, as the ensemble does it.
  const drift = phasedLfo(ctx, S.driftHz, (p.midi % 7) * 0.9);
  const depth = ctx.createGain();
  depth.gain.value = S.driftCents;
  drift.connect(depth);
  drift.start(time);
  const neg = ctx.createGain();
  neg.gain.value = -1;
  depth.connect(neg);
  sources.push(drift);
  nodes.push(depth, neg);

  const level = ctx.createGain();
  level.gain.value = S.voiceLevel;
  level.connect(into);
  nodes.push(level);

  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i - mid) / mid; // -1..1 across the stack
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = k * S.detuneCents * 0.5;
    if (i !== mid) (k < 0 ? neg : depth).connect(o.detune);
    // MEASURED elsewhere in this engine and true here: everything under
    // 300 Hz is close to mono on these records, so the low voices of a stack
    // keep their spread to themselves.
    const pan = panner(ctx, k * spread * (hz > 300 ? 1 : 0.3));
    o.connect(pan);
    pan.connect(level);
    o.start(time);
    sources.push(o);
    nodes.push(pan);
  }
  return { sources, nodes };
}

export function supersawPad(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const S = settings.supersawPad;
  const dur = Math.max(0.3, p.dur ?? 2);
  const vel = p.vel ?? 0.8;
  const attack = Math.min(p.attack ?? S.attack, dur * 0.5);
  const decay = Math.min(S.decay, Math.max(0.2, dur - attack));

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack,
    decay,
    sustain: S.sustain,
    hold: Math.max(0, dur - attack - decay),
    release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(g);

  // The sweep, in seconds and not milliseconds. Exponential, because a filter
  // opening evenly opens evenly in octaves.
  const open = (p.open ?? S.cutoff) * (p.cutoffMul ?? 1);
  const to = Math.min(12000, (p.sweepTo ?? S.sweepTo) * (p.cutoffMul ?? 1));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.setValueAtTime(Math.max(CUTOFF_FLOOR, open), time);
  lp.frequency.exponentialRampToValueAtTime(to, time + Math.min(S.sweepTime, Math.max(0.2, dur)));
  lp.connect(hp);

  const built = stack(ctx, lp, time, p, S);
  for (const s of built.sources) s.stop(end + 0.05);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, reverb: p.reverb ?? 0.5, delay: p.delay ?? 0.1 });
  return end;
}

/**
 * The same stack, held.
 *
 *   controls  `gain` — the level it holds at, in the voice's own units
 *             `brightness` — the corner of the lowpass, in Hz. A drone's sweep
 *                            is a hand on this and not a ramp written at the
 *                            start, which is the whole difference between a
 *                            long note and a held voice.
 *   tail      `settings.supersawPad.release`, stated before anybody asks.
 */
export function holdSupersawPad(ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): HeldVoice {
  const S = settings.supersawPad;
  const time = startTime(ctx, at);
  const level = (p.vel ?? 0.8) * (p.gain ?? 1) * S.trim;
  const attack = p.attack ?? S.attack;
  const tail = p.tail ?? S.release;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, level), time + Math.max(MIN_RELEASE, attack));
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(g);

  const open = (p.open ?? S.cutoff) * (p.cutoffMul ?? 1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.value = Math.max(CUTOFF_FLOOR, open);
  lp.connect(hp);

  const built = stack(ctx, lp, time, p, S);
  built.nodes.push(lp, hp, g);

  route(ctx, g, out, { dry: 1, reverb: p.reverb ?? 0.5, delay: p.delay ?? 0.1 });

  return heldVoice(ctx, {
    gain: g,
    tail,
    level,
    attack: { from: 0, to: Math.max(GAIN_FLOOR, level), t0: time, t1: time + Math.max(MIN_RELEASE, attack) },
    parked: [{ param: lp.frequency, value: Math.max(CUTOFF_FLOOR, open) }],
    controls: {
      gain: (v) => [[g.gain, Math.max(GAIN_FLOOR, v)]],
      brightness: (v) => [[lp.frequency, Math.max(CUTOFF_FLOOR, v)]],
    },
    sources: built.sources,
    nodes: built.nodes,
  });
}

/** MEASURED by the gate (`tools/test-voices.ts --bless`). */
export const SUPERSAW_PAD_TIMBRES = {
  supersawPad: { family: 'harmonic', struck: false, hold: 0.7, brightnessHz: 2500, loudnessDb: -10.7 },
};

export const descriptor: Descriptor = {
  name: 'supersawPad',
  cost: 'dear',
  family: 'ensemble',
  roles: ['sustained'],
  bus: 'melodic',
  level: 'pad',
  layer: 'pad',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: supersawPad,
  timbres: SUPERSAW_PAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export default supersawPad;
