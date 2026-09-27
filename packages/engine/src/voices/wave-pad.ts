// A pad that morphs between two spectra over a held note.
//
// Every harmonic voice in this engine has a spectrum it keeps: a saw is a saw
// for the whole of a note and what changes is the filter over it. This is the
// other kind of instrument — the one where the **waveform itself** moves — and
// it is what a wavetable synthesiser is.
//
// It is two `PeriodicWave`s and a crossfade, and the reason it is a crossfade
// rather than a table of sixty-four frames is worth writing down. Web Audio has
// no way to sweep a wave: `setPeriodicWave` swaps one for another between two
// samples, which is a step in the waveform and therefore a click, and a table
// stepped through at any useful rate is a table of clicks. Two oscillators at
// the same frequency and phase, crossfaded, gives the **linear interpolation
// between two frames** — which is what a wavetable synthesiser actually
// computes, and it is continuous, a-rate, and two nodes.
//
// So the morph is real and the number of frames is two. The two spectra are
// chosen to be as far apart as a harmonic series can be while still being the
// same note:
//
//   `from`  the odd harmonics at 1/n with a hollow middle — near a square, but
//           with the third and fifth pulled down, which is the spectrum a
//           closed pipe has and reads as dark and woody
//   `to`    every harmonic at 1/sqrt(n) with a **formant hump** five partials
//           up — bright, vocal, and nothing like the first
//
// **The two oscillators must be phase-locked or the crossfade is a flanger.**
// They are started at the same instant with waves built from the same phase
// convention, which in Web Audio is enough: two `OscillatorNode`s at the same
// frequency started at the same time are in phase. Detuning them would be the
// obvious way to widen the pad and it is exactly the thing that cannot be done,
// so the width comes from a second *pair* an octave up and panned, which is two
// more nodes and does not touch the morph.

import { midiToHz, adsrEnv, route, panner, startTime, phasedLfo, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { heldVoice } from './held.ts';
import { insert } from './treat.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { HeldVoice } from './voice-contract.ts';
import type { Settings } from '../settings.ts';

/** The two frames a morph runs between. */
interface Frames {
  from: PeriodicWave;
  to: PeriodicWave;
}

// Per context *and per spec*: the partial count, the hollowing and the hump
// are the frames, and a second room asking for other frames in the same
// context got the first pair (the outside review, 09-19: four partials asked for after the
// default's twenty came back as the same twenty).
const waveCache = new WeakMap<BaseAudioContext, Map<string, Frames>>();

/**
 * The two frames, as `PeriodicWave`s, cached per context and spec.
 */
export function frames(ctx: BaseAudioContext, S: Settings['wavePad']): Frames {
  let per = waveCache.get(ctx);
  if (!per) { per = new Map(); waveCache.set(ctx, per); }
  const key = `${S.partials}:${S.hollow}:${S.humpDb}:${S.humpAt}:${S.humpWidth}`;
  const had = per.get(key);
  if (had) return had;
  const n = S.partials + 1;
  const make = (amp: (k: number) => number): PeriodicWave => {
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = amp(k);
    return ctx.createPeriodicWave(real, imag);
  };
  const from = make((k: number) => (k % 2 === 1 ? (1 / k) * (k === 3 || k === 5 ? S.hollow : 1) : 0));
  const to = make((k: number) => {
    const tilt = 1 / Math.sqrt(k);
    // The hump: a raised band a few partials up, which is what makes a spectrum
    // read as a mouth rather than as a filter.
    // **`humpDb` is not decibels.** It is read here as a linear factor over
    // one: 1.8 lifts the hump's middle partial 2.8 times, +8.9 dB, where the
    // name says +1.8 (R80 of the reconciled review of 09-24). The sound is the
    // one that was listened to and the settings are hashed into house-v2's
    // program lock, so the number and its name stay; this is what it means.
    const hump = 1 + S.humpDb * Math.exp(-((k - S.humpAt) ** 2) / (2 * S.humpWidth ** 2));
    return tilt * hump;
  });
  const out: Frames = { from, to };
  per.set(key, out);
  return out;
}

/**
 * The pair of oscillators and the crossfade between them, plus the octave over
 * it that carries the width.
 */
function stack(
  ctx: BaseAudioContext,
  into: AudioNode,
  time: number,
  end: number | null,
  hz: number,
  S: Settings['wavePad'],
  spread: number,
) {
  const w = frames(ctx, S);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const a = ctx.createGain();
  const b = ctx.createGain();
  nodes.push(a, b);
  for (const [octave, level, pan] of S.layers) {
    for (const [wave, gainNode] of [[w.from, a], [w.to, b]] as [PeriodicWave, GainNode][]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = hz * Math.pow(2, octave);
      const lvl = ctx.createGain();
      lvl.gain.value = level;
      const pn = panner(ctx, pan * spread);
      o.connect(lvl);
      lvl.connect(pn);
      pn.connect(gainNode);
      o.start(time);
      if (end != null) o.stop(end);
      sources.push(o);
      nodes.push(lvl, pn);
    }
  }
  a.connect(into);
  b.connect(into);
  return { a, b, sources, nodes };
}

export function wavePad(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = settings.wavePad;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.3, p.dur ?? 3.5);
  const vel = p.vel ?? 0.7;

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: p.attack ?? S.attack, decay: S.decay, sustain: S.sustain,
    hold: Math.max(0, dur - (p.attack ?? S.attack) - S.decay), release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.value = Math.min(12000, S.cutoff * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  lp.connect(g);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const st = stack(ctx, lp, time, end + 0.05, hz, S, spread);

  // The morph: a straight line from one spectrum to the other over the note,
  // and then back if it is long enough. `p.morph` pins it where a caller wants
  // it, which is what makes this playable as a static timbre as well.
  const where = p.morph;
  if (where != null) {
    const x = Math.max(0, Math.min(1, where));
    st.a.gain.value = 1 - x;
    st.b.gain.value = x;
  } else {
    const travel = Math.min(S.morphTime, Math.max(0.2, dur * 0.8));
    st.a.gain.setValueAtTime(1 - S.morphFrom, time);
    st.b.gain.setValueAtTime(S.morphFrom, time);
    st.a.gain.linearRampToValueAtTime(1 - S.morphTo, time + travel);
    st.b.gain.linearRampToValueAtTime(S.morphTo, time + travel);
  }

  // A drift on the lid, because a pad whose only movement is its spectrum is a
  // pad that moves once.
  // R74: a phase in radians off the note's own pitch, as its siblings' are — it was
  // a fraction of a turn off the context's clock, so 11 of 64 steps were reachable
  // and live, render and a seek each started it somewhere else.
  const drift = phasedLfo(ctx, S.driftHz, ((p.midi ?? 60) % 7) * 0.9);
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = lp.frequency.value * S.driftDepth;
  drift.connect(driftDepth);
  driftDepth.connect(lp.frequency);
  drift.start(time);
  drift.stop(end + 0.05);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.08, reverb: p.reverb ?? 0.55 });
  return end;
}

/**
 * The same stack, held, with the morph as a **control**. This is the voice the
 * held contract exists for: nothing about the sound is scheduled to stop, and
 * the one thing a listener would reach for — where between the two spectra it
 * is — is a named control that can be moved at an instant over a ramp.
 */
export function holdWavePad(
  ctx: BaseAudioContext,
  out: VoiceOut,
  at: number,
  p: NoteParams = {},
  settings: Settings,
): HeldVoice {
  const S = settings.wavePad;
  const time = startTime(ctx, at);
  const hz = midiToHz(p.midi ?? 57);
  const level = (p.vel ?? 0.8) * (p.gain ?? 1) * S.trim;
  const attack = p.attack ?? S.attack;
  const tail = p.tail ?? S.release;

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, level), time + Math.max(MIN_RELEASE, attack));

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.value = Math.min(12000, S.cutoff * (p.cutoffMul ?? 1));
  lp.connect(g);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const st = stack(ctx, lp, time, null, hz, S, spread);
  const start = p.morph ?? S.morphFrom;
  st.a.gain.value = 1 - start;
  st.b.gain.value = start;

  route(ctx, g, out, { dry: 1, delay: p.delay ?? 0.06, reverb: p.reverb ?? 0.55 });

  return heldVoice(ctx, {
    gain: g,
    tail,
    level,
    attack: { from: 0, to: Math.max(GAIN_FLOOR, level), t0: time, t1: time + Math.max(MIN_RELEASE, attack) },
    parked: [
      { param: lp.frequency, value: lp.frequency.value },
      { param: st.a.gain, value: 1 - start },
      { param: st.b.gain, value: start },
    ],
    controls: {
      gain: (v) => [[g.gain, Math.max(GAIN_FLOOR, v)]],
      brightness: (v) => [[lp.frequency, Math.max(CUTOFF_FLOOR, v)]],
      // One number moves two gains, in opposite directions: the crossfade *is*
      // the wavetable's position, which is the whole point of the voice.
      morph: (v) => {
        const x = Math.max(0, Math.min(1, v));
        return [[st.a.gain, 1 - x], [st.b.gain, x]];
      },
    },
    sources: st.sources,
    nodes: [...st.nodes, lp, g],
  });
}

/** MEASURED by `tools/test-voices-2.ts --bless`. */
export const WAVE_PAD_TIMBRES = {
  wavePad: { family: 'sustained', struck: false, hold: 0.9, brightnessHz: 2200, loudnessDb: -11 },
};

export const descriptor: Descriptor = {
  name: 'wavePad',
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
  render: wavePad,
  timbres: WAVE_PAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export default wavePad;
