// A formant pad: breathy, vocal-ish, and the sustained role for music that is
// not made of chords on a keyboard.
//
// Round K2 of PLAN-KITCHEN. The catalogue's two sustained families are an
// ensemble of detuned saws and an organ's drawbars, and both of them are
// *spectra*: a fixed set of partials under a fixed lid. What makes a voice
// sound like a voice is neither — it is three resonances at fixed frequencies
// that the partials move under, so the note changes pitch and the formants do
// not. That is one bandpass per formant and nothing else, and it is why this
// is the cheapest convincing new colour in the set.
//
//   the source    two sawtooths nine cents apart and a little noise. The noise
//                 is the breath: without it the formants ring on a spectrum
//                 that has gaps in it and the result is an organ with a cold.
//   the formants  three parallel bandpasses at a vowel's own measured centres,
//                 at the Qs a vowel has (sharper as they go up) and at falling
//                 levels, each returned to its own place in the picture so the
//                 voice has width of its own.
//   the drift     one slow LFO walks all three from one vowel to another and
//                 back, at a twentieth of a Hertz — twenty seconds a round
//                 trip, which is slower than anything else in this engine
//                 moves and is what stops a held chord being a drone.
//
// It holds as well as it plays a note: `holdFormantPad` is the same body
// against the contract in `voice-contract.ts`, with the vowel as a control
// somebody moves rather than a walk written when the note starts. The
// arithmetic of holding is `held.ts`'s and is not written twice.

import { midiToHz, adsrEnv, route, panner, phasedLfo, noiseSource, noiseBuffer, startTime, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { insert } from './treat.ts';
import { heldVoice } from './held.ts';
import { withControls } from './descriptor.ts';
import type { Controls, Descriptor, NoteParams } from './descriptor.ts';
import type { HeldVoice } from './voice-contract.ts';

/** The settings' own `formantPad` block, which is the table of vowels and the body's numbers. */
type FormantSettings = Settings['formantPad'];
/** One vowel: the three formant centres, in Hz. */
type Vowel = number[];
/** A vowel's name, as the table holds them. */
type VowelName = keyof FormantSettings['vowels'];

/** A smooth, harmonically rich excitation, with a steeper roll-off than a saw. */
export function vocalPartials(tilt: number): Float32Array {
  if (!Number.isFinite(tilt) || tilt < 1 || tilt > 3) throw new Error('sourceTilt must be in 1..3');
  const partials = new Float32Array(65);
  for (let n=1;n<partials.length;n++) partials[n] = (n%2 ? 1 : -1) / Math.pow(n,tilt);
  return partials;
}
const vocalWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
function vocalWave(ctx: BaseAudioContext, tilt: number): PeriodicWave {
  let cache=vocalWaves.get(ctx);
  if (!cache) { cache=new Map(); vocalWaves.set(ctx,cache); }
  let wave=cache.get(tilt);
  if (!wave) {
    const imag=vocalPartials(tilt);
    wave=ctx.createPeriodicWave(new Float32Array(imag.length),imag);
    if (cache.size>=16) cache.delete(cache.keys().next().value!);
    cache.set(tilt,wave);
  }
  return wave;
}

/** The two vowels a pad is sitting between, and the walk from one to the other. */
const vowelPair = (F: FormantSettings, p: NoteParams): [Vowel, Vowel] => {
  // A note may name a vowel the table does not have — which is what the
  // fallback to the table's own pair is for — so neither lookup is promised a
  // name and both are asked as if they were.
  const a = F.vowels[p.vowel as VowelName] || F.vowels[F.vowel as VowelName];
  const b = F.vowels[p.vowelTo as VowelName] || F.vowels[F.vowelTo as VowelName];
  return [a, b];
};

/**
 * The body every formant pad is made of: the source, the three formants and
 * the lid, built into whatever gain the caller is going to shape.
 *
 * @param g the output gain — a note's envelope, or a drone's level
 * @param F the settings' `formantPad` block
 * @param space the settings' `space` block, for the width
 * @param driftScale how far the vowel walks on its own: all of it for
 *   a note, a quarter of it for a drone, whose vowel is a control instead
 */
export function formantBody(
  ctx: BaseAudioContext,
  g: GainNode,
  time: number,
  p: NoteParams,
  F: FormantSettings,
  space: Settings['space'],
  driftScale: number,
) {
  const hz = midiToHz(p.midi);
  const spread = (p.spread ?? F.spread) * (p.spreadMul ?? 1);
  const [va, vb] = vowelPair(F, p);
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(12000, (p.open ?? F.lpHz) * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = F.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);
  nodes.push(lp, hp);

  // One LFO for all three formants, so the vowel morphs coherently instead of
  // three resonances wandering past each other.
  const gesture = p.vowelSeconds !== undefined;
  const lfo = gesture ? null : phasedLfo(ctx, F.driftHz, (p.midi % 5) * 1.2);
  if (lfo) { lfo.start(time); sources.push(lfo); }

  const src = ctx.createGain();
  src.gain.value = F.voiceLevel;
  nodes.push(src);

  const bands: { bp: BiquadFilterNode; from: number; to: number }[] = [];
  const pans = [-0.55, 0.1, 0.5];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = F.q[i];
    const mid = (va[i] + vb[i]) / 2;
    bp.frequency.value = mid;
    const depth = ctx.createGain();
    depth.gain.value = ((vb[i] - va[i]) / 2) * driftScale;
    if (lfo) { lfo.connect(depth); depth.connect(bp.frequency); }
    if (gesture) {
      const from = Math.max(0,Math.min(1,p.vowelFrom ?? 0));
      const to = Math.max(0,Math.min(1,p.vowelTo ?? 1));
      const seconds = Math.max(.01,Math.min(p.vowelSeconds,p.dur ?? 2));
      bp.frequency.setValueAtTime(va[i]+(vb[i]-va[i])*from,time);
      bp.frequency.exponentialRampToValueAtTime(va[i]+(vb[i]-va[i])*to,time+seconds);
    }
    const lvl = ctx.createGain();
    lvl.gain.value = F.formantLevel[i];
    const pan = panner(ctx, pans[i] * spread);
    src.connect(bp);
    bp.connect(lvl);
    lvl.connect(pan);
    pan.connect(hp);
    nodes.push(bp, depth, lvl, pan);
    bands.push({ bp, from: va[i], to: vb[i] });
  }

  // Optional delayed pitch motion belongs to the note, leaving the old pad's
  // oscillators and vowel drift unchanged when no gesture was requested.
  let vibrato: GainNode | null = null;
  if (p.vibratoCents > 0) {
    const osc = ctx.createOscillator();
    osc.frequency.value = Math.max(1,Math.min(8,p.vibratoHz ?? 4.5));
    vibrato = ctx.createGain();
    const delay = Math.max(0,Math.min(p.vibratoDelay ?? .2,(p.dur ?? 2)*.75));
    vibrato.gain.setValueAtTime(0,time);
    vibrato.gain.setValueAtTime(0,time+delay);
    vibrato.gain.linearRampToValueAtTime(Math.min(20,p.vibratoCents),time+delay+.12);
    osc.connect(vibrato);osc.start(time);sources.push(osc);nodes.push(vibrato);
  }
  // Two saws, and the breath under them.
  for (const side of [-1, 1]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    // Taken into the range the table is built for, at the voice: a tilt
    // outside 1..3 threw out of `vocalPartials` on the scheduling tick (R77 of
    // the reconciled review of 09-24), and one that is not a number is the saw.
    if (Number.isFinite(p.sourceTilt)) o.setPeriodicWave(vocalWave(ctx,Math.max(1,Math.min(3,p.sourceTilt))));
    o.frequency.value = hz;
    o.detune.value = side * F.detuneCents * 0.5;
    if (vibrato) vibrato.connect(o.detune);
    // The outer voices wander, so the width breathes: the same drift the
    // ensemble has, at the space table's own rate.
    o.connect(src);
    o.start(time);
    sources.push(o);
  }

  return { lp, hp, src, bands, nodes, sources };
}

export function formantPad(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, FORMANT_PAD_CONTROLS);
  time = startTime(ctx, time); // never in the past: a step if it is
  const F = settings.formantPad;
  const dur = Math.max(0.3, p.dur ?? 2);
  const vel = p.vel ?? 0.8;
  const attack = Math.min(p.attack ?? F.attack, dur * 0.5);
  const decay = Math.min(F.decay, Math.max(0.2, dur - attack));

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * F.trim, {
    attack,
    decay,
    sustain: F.sustain,
    hold: Math.max(0, dur - attack - decay),
    release: p.release ?? F.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const built = formantBody(ctx, g, time, p, F, settings.space, 1);
  // The breath, as a note: a window of the shared noise bed, band-limited by
  // the formants like everything else.
  const noise = noiseSource(ctx, time, end - time + 0.02);
  const ng = ctx.createGain();
  ng.gain.value = F.noise;
  noise.connect(ng);
  ng.connect(built.src);
  for (const s of built.sources) {
    if (typeof s.stop === 'function') s.stop(end + 0.05);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, reverb: p.reverb ?? 0.55, delay: p.delay ?? 0.12 });
  return end;
}

/**
 * The same voice, held: no length, no scheduled end, and the vowel as a control
 * rather than a walk.
 *
 *   controls  `gain` — the level it holds at, in the voice's own units
 *             `brightness` — the lid's corner, in Hz
 *             `vowel` — 0 is the first vowel, 1 the second, and anything
 *                       between is between them. It moves the three formants
 *                       together, which is the one thing about this voice that
 *                       is worth a hand on it.
 *   tail      `settings.formantPad.release`, stated before anybody asks.
 */
export function holdFormantPad(ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): HeldVoice {
  const F = settings.formantPad;
  const time = startTime(ctx, at);
  const level = (p.vel ?? 0.8) * (p.gain ?? 1) * F.trim;
  const attack = p.attack ?? F.attack;
  const tail = p.tail ?? F.release;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, level), time + Math.max(MIN_RELEASE, attack));
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // A quarter of the walk: a drone's vowel is a hand on it, and a drift that
  // was still doing all of its own work would be arguing with that hand.
  const built = formantBody(ctx, g, time, p, F, settings.space, 0.25);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const ng = ctx.createGain();
  ng.gain.value = F.noise;
  noise.connect(ng);
  ng.connect(built.src);
  noise.start(time);
  built.sources.push(noise);
  built.nodes.push(ng, g);

  route(ctx, g, out, { dry: 1, reverb: p.reverb ?? 0.55, delay: p.delay ?? 0.12 });

  return heldVoice(ctx, {
    gain: g,
    tail,
    level,
    attack: { from: 0, to: Math.max(GAIN_FLOOR, level), t0: time, t1: time + Math.max(MIN_RELEASE, attack) },
    parked: [
      { param: built.lp.frequency, value: built.lp.frequency.value },
      ...built.bands.map((b) => ({ param: b.bp.frequency, value: b.bp.frequency.value })),
    ],
    controls: {
      gain: (v) => [[g.gain, Math.max(GAIN_FLOOR, v)]],
      brightness: (v) => [[built.lp.frequency, Math.max(CUTOFF_FLOOR, v)]],
      vowel: (v) => built.bands.map((b) => [
        b.bp.frequency, b.from + (b.to - b.from) * Math.max(0, Math.min(1, v)),
      ]),
    },
    sources: built.sources,
    nodes: built.nodes,
  });
}

/** MEASURED by the gate (`tools/test-voices.ts --bless`). */
export const FORMANT_PAD_TIMBRES = {
  formantPad: { family: 'harmonic', struck: false, hold: 0.74, brightnessHz: 4600, loudnessDb: -11.2 },
};

/** What a part may write on a formant pad note: its entrance and its tail. The defaults are the formant pad block's. */
export const FORMANT_PAD_CONTROLS: Controls = {
  attack: { unit: 'seconds', min: 0.003, max: 3, default: 0.85 },
  release: { unit: 'seconds', min: 0.03, max: 3, default: 0.8 },
};

export const descriptor: Descriptor = {
  name: 'formantPad',
  cost: 'dear',
  family: 'ensemble',
  controls: FORMANT_PAD_CONTROLS,
  noteControls: Object.keys(FORMANT_PAD_CONTROLS),
  roles: ['sustained'],
  bus: 'melodic',
  level: 'pad',
  layer: 'pad',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: formantPad,
  timbres: FORMANT_PAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export default formantPad;
