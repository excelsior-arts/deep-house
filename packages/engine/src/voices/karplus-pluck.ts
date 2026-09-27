// A Karplus-Strong string: a few milliseconds of noise into a delay line one
// period long, with a lowpass in the loop.
//
// Round K2 of PLAN-KITCHEN. It is the oldest cheap string there is — a
// multiply and an add per sample — and it is still the most convincing one,
// because what it models is what a string does: an excitation, a round trip,
// and a little more of the top lost on every round trip than of the bottom.
//
// **It is arithmetic in a buffer and not a graph of nodes, and that is a
// measurement about this engine rather than a preference.** A cycle through a
// `DelayNode` is quantised to a render quantum by the specification — 128
// samples, 2.9 ms at 44.1 kHz — so the shortest feedback delay this engine can
// build is 2.9 ms and a string tuned by one cannot play a note above about
// 345 Hz. This instrument exists for the octaves *above* middle C (262 Hz), so
// a node graph could reach a fifth of its range and be out of tune across the
// rest of it. The loop is therefore computed: a few thousand multiplies per
// pitch, done once and cached per context the way round G's pick and the
// piano's strings are, and the result is a string that is in tune to well under
// a cent in every engine, because nothing about it is an engine's arithmetic.
//
// Three things the loop gets right that a delay line on its own does not:
//
//   the tuning     the loop is `sampleRate / hz` samples long and that is
//                  almost never a whole number, so the delay line is read at a
//                  fractional position and interpolated, and the loop filter's
//                  own phase delay — exactly `1 - damp` samples for a two-tap
//                  weighted average — is taken off the length. Without both,
//                  a note at 440 Hz reads eight cents sharp.
//   the damping    the two taps are weighted rather than averaged: `damp`
//                  nearer 1 loses less of the top per round trip, which is a
//                  string plucked nearer the bridge. It is velocity's, which
//                  is what a harder pluck does.
//   the decay      one gain per sample, `10^(-3/(decay x rate))`, so the
//                  string falls 60 dB in its stated decay whatever it is
//                  playing. A per-loop gain would make every octave decay at a
//                  different speed, which is a bug people mistake for realism.
//
// The buffer is normalised **on the ring and not on the burst**, and that is a
// measurement rather than a detail. A string's excitation energy is fixed and
// its loop length is not, so an unnormalised Karplus is several decibels louder
// at the bottom of its range than at the top; but normalising on the peak is
// worse, because the peak is the six milliseconds of noise going in and the
// ring that follows it is eighteen decibels under that. MEASURED: normalised to
// a peak of one, this instrument read **-30.2 LUFS** against the level table's
// `keys`, where the keyboard family it stands beside reads -4.6 to -12.6 —
// seventeen decibels of "a level table is only a level table if they all peak
// at about the gain they are handed", caused entirely by scaling a note by its
// own attack transient. Normalised to the RMS of the first tenth of a second
// instead, with a ceiling on what the burst is then allowed to reach, it lands
// where the rest of the catalogue does.
//
// The width is one buffer played twice at two playback rates a few cents apart
// and panned to opposite sides: a doubled string, for the price of a multiply
// rather than of a second string.

import { midiToHz, noteEnv, route, panner, startTime, lcg } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import type { Descriptor, NoteParams, PrepareOptions } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/** The settings' own `karplusPluck` block: what one string is made of. */
type Karplus = Settings['karplusPluck'];

const strings = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Velocity, in four buckets: the cache holds a string per pitch, not per note. */
const velBucket = (vel: number | undefined): number => Math.max(0, Math.min(3, Math.round((vel ?? 1) * 3)));

/**
 * One plucked string, as samples. Deterministic from a fixed seed, one channel,
 * normalised to a peak of one.
 *
 * @param K the settings' `karplusPluck` block
 */
export function stringBuffer(ctx: BaseAudioContext, midi: number, vel: number, K: Karplus): AudioBuffer {
  let per = strings.get(ctx);
  if (!per) {
    per = new Map();
    strings.set(ctx, per);
  }
  const vq = velBucket(vel);
  // `maxSeconds` is in the key since 09-19: it bounds the buffer's length, and
  // a string prepared at a tenth of a second answered a note asked for at
  // 1.7 s with the same tenth (the outside review).
  const key = `${midi}:${vq}:${K.damp}:${K.dampVel}:${K.decay}:${K.maxSeconds}:${K.burst}:${K.ringLevel}:${K.peakCeiling}:${ctx.sampleRate}`;
  const had = per.get(key);
  if (had) {
    return had;
  }

  const sr = ctx.sampleRate;
  const hz = midiToHz(midi);
  // The two-tap loop filter, and what it costs in length. `damp` is the weight
  // on the newer tap; its phase delay is `1 - damp` samples, flat enough across
  // the band that taking it off the loop length tunes the string.
  const b = Math.max(0.5, Math.min(0.97, K.damp + K.dampVel * (vq / 3)));
  const D = Math.max(2, sr / hz - (1 - b));
  const L = Math.ceil(D) + 2;
  const line = new Float32Array(L);
  const len = Math.max(64, Math.ceil(Math.min(K.maxSeconds, K.decay) * sr));
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);

  // The excitation: white noise with its bottom taken out, so the string is
  // plucked and the record is not thumped. The seed is fixed, so the live take
  // and the rendered file are the same string.
  const burst = Math.max(2, Math.round(K.burst * sr));
  const noise = lcg(20260918);
  let low = 0;
  // One gain per sample: 60 dB in the stated decay, whatever the pitch.
  const gs = Math.pow(10, -3 / (K.decay * sr));
  let w = 0;
  let prev = 0;
  let peak = 0;
  for (let n = 0; n < len; n++) {
    let x = 0;
    if (n < burst) {
      const white = noise();
      low += 0.35 * (white - low);
      x = white - low;
    }
    // The delay line, read a fractional number of samples back.
    const rd = w - D + L;
    const i0 = Math.floor(rd) % L;
    const i1 = (i0 + 1) % L;
    const f = rd - Math.floor(rd);
    const d = line[i0] * (1 - f) + line[i1] * f;
    const y = b * d + (1 - b) * prev;
    prev = d;
    line[w] = x + gs * y;
    out[n] = y;
    if (Math.abs(y) > peak) peak = Math.abs(y);
    w = (w + 1) % L;
  }
  // The ring, over the tenth of a second after the burst has gone: what this
  // string is worth as a sound, rather than what its attack is worth as a
  // sample. The burst is then allowed to stand `peakCeiling` over it and no
  // further, which is what stops a very short string being a click.
  const a0 = Math.min(len - 1, Math.round(0.02 * sr));
  const a1 = Math.min(len, Math.round(0.12 * sr));
  let sq = 0;
  for (let n = a0; n < a1; n++) sq += out[n] * out[n];
  const ring = Math.sqrt(sq / Math.max(1, a1 - a0));
  let scale = ring > 1e-6 ? K.ringLevel / ring : 0;
  if (peak * scale > K.peakCeiling) scale = K.peakCeiling / Math.max(1e-6, peak);
  if (scale > 0) for (let n = 0; n < len; n++) out[n] *= scale;

  // A bound, and it is the honest kind: the strings a theme actually plays,
  // not every string there could be. The oldest goes when the ceiling is
  // reached, which on a Map is the first key it hands back.
  if (per.size >= K.cacheLimit) per.delete(per.keys().next().value as string);
  per.set(key, buf);
  return buf;
}

/** How many strings a context is holding. The ownership test reads it. */
export const stringCacheSize = (ctx: BaseAudioContext): number => (strings.get(ctx) ? strings.get(ctx)!.size : 0);

/**
 * The pre-render hook: the strings this theme's notes want, before the first of
 * them is due. It is a warm-up and never a requirement — `karplusPluck` asks
 * for the same buffer and gets it whether this ran or not — and a theme with
 * none of these events pays nothing at all, which is every v1 theme.
 *
 * @param events this voice's own events, handed over by `prepareVoices`
 */
export function prepareKarplus(
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
  opts: PrepareOptions = {},
): Promise<void> {
  if (!events || !events.length) return Promise.resolve();
  const K = settings.karplusPluck;
  const from = opts.from ?? 0;
  const seen = new Set<string>();
  for (const e of events) {
    if (!e.p || e.p.midi == null || (e.t ?? 0) < from) continue;
    const k = `${e.p.midi}:${velBucket(e.p.vel)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (seen.size > K.cacheLimit) break;
    stringBuffer(ctx, e.p.midi, e.p.vel ?? 1, K);
  }
  return Promise.resolve();
}

export function karplusPluck(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const K = settings.karplusPluck;
  const vel = p.vel ?? 1;
  const dur = Math.max(0.05, p.dur ?? 0.4);

  // The envelope is a gate and not a shape: the string's own decay is the
  // shape, and what the note says is how long it is held before it is damped.
  const g = ctx.createGain();
  const end = noteEnv(g, time, vel * (p.gain ?? 1) * K.trim, K.attack, dur, p.release ?? K.release);
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // The body, outside the loop: velocity opens this, so a hard note is brighter
  // without the cache needing a second copy of every pitch.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  lp.frequency.value = Math.min(12000, (p.cutoff ?? K.cutoff) * (1 + K.veloOpen * (vel - 0.5)) * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = K.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  const buf = stringBuffer(ctx, p.midi, vel, K);
  const spread = (p.spread ?? K.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // The pair, a couple of cents apart: the same string at two speeds.
    src.playbackRate.value = Math.pow(2, (side * K.detuneCents * 0.5) / 1200);
    const pan = panner(ctx, side * spread * 0.5);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    src.connect(lvl);
    lvl.connect(pan);
    pan.connect(hp);
    src.start(time);
    src.stop(Math.min(end + 0.02, time + buf.duration / src.playbackRate.value));
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.22, reverb: p.reverb ?? 0.24 });
  return end;
}

/**
 * MEASURED by the gate (`tools/test-voices.ts --bless`). `hold` is what is
 * left of the string at the bar line at this decay — a string is not an
 * envelope's sustain fraction, so this one is read off the decay the loop is
 * given rather than copied out of a table — and `brightnessHz` is the body
 * filter's corner.
 */
export const KARPLUS_TIMBRES = {
  karplusPluck: { family: 'harmonic', struck: true, hold: 0.22, brightnessHz: 3200, loudnessDb: -13.2 },
};

export const descriptor: Descriptor = {
  name: 'karplusPluck',
  cost: 'dear',
  family: 'keyboard',
  roles: ['figure', 'melody'],
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: prepareKarplus,
  render: karplusPluck,
  timbres: KARPLUS_TIMBRES,
  dispatches: [],
  mood: [],
};

export default karplusPluck;
