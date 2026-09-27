// Marimba and vibes: a click, and a tuned thing that rings after it.
//
// The kitchen has percussion that is struck (round K3) and keyboards that are
// pitched (rounds K2 and this one), and a mallet is the one instrument that is
// both — which is why it is built out of `drumkit.ts`'s idea and `keys.ts`'s
// arithmetic at once.
//
// **What makes a bar a bar is where its partials are.** A string's partials are
// at whole multiples of its fundamental; a struck *bar* free at both ends has
// them at 1, 2.76, 5.40 and 8.93 — which is why a marimba reads as pitched and
// inharmonic at the same time. The marimba's maker then tunes the second
// partial down to exactly 4 by carving an arch out of the underside of the bar,
// which is the whole difference between a marimba and a glockenspiel, so this
// module's table is 1, 4, 9.2 for the wooden bars and the untuned 1, 2.76, 5.4
// for the metal ones.
//
//   `marimba`  wooden bars: the partials die fast (a tenth of a second for the
//              upper two) and the resonator under the bar rings the fundamental
//              for about a second. A hard mallet head is a band of noise at
//              2 kHz lasting four milliseconds, and it is most of what tells a
//              listener the instrument was hit rather than blown.
//   `vibes`    metal bars: the same builder with the partials untuned, the
//              decay six times as long, and the one thing a vibraphone has that
//              nothing else does — **a tremolo that is not a tremolo**. The
//              discs in the resonator tubes rotate, so what is modulated is how
//              much of the bar the tube is coupled to, which is a gain on the
//              *resonator* and not on the note; the attack goes through
//              untouched and only the ring pulses. One line of routing, and it
//              is the sound.

import { midiToHz, route, panner, startTime, noiseSource, MIN_RELEASE } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams, TimbreFacts, VoiceCost, VoiceRenderer } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/**
 * The settings block one mallet is made out of. The two tremolo numbers are the
 * vibraphone's alone — a marimba has no discs under its bars — so they are the
 * optional half of it.
 */
type MalletSettings = Settings['marimba'] & Partial<Settings['vibes']>;

/**
 * One struck bar: the partials, the mallet, and the resonator.
 * @param metal whether the ring is pulsed by the resonator's discs
 */
function bar(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams,
  S: MalletSettings,
  metal: boolean,
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const hz = midiToHz(p.midi);
  const vel = p.vel ?? 1;
  const peak = vel * (p.gain ?? 1) * S.trim;
  // Velocity shortens nothing and brightens everything: a bar hit harder rings
  // the same length and puts more into its upper partials, which is the
  // opposite of a drum (`drumkit.ts`, where velocity reaches the playback rate)
  // and is what a bar physically does.
  const end = time + S.partials[0][1] * (1 + 0.2 * vel) + S.release;

  const g = ctx.createGain();
  g.gain.value = 1;
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // The resonator: what the tube under the bar does, which is to hold the
  // fundamental on long after the bar itself has stopped. It is a gain and not
  // a filter because what it changes is the *length* and not the spectrum.
  const ring = ctx.createGain();
  ring.gain.value = S.ringLevel;
  ring.connect(g);
  const dry = ctx.createGain();
  dry.gain.value = 1;
  dry.connect(g);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  S.partials.forEach(([ratio, decay, level]: number[], i: number) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz * ratio;
    const env = ctx.createGain();
    // Linear from true zero for two milliseconds — `dsp.ts`'s own note about
    // why an exponential attack from a ten-thousandth is a click — then an
    // exponential fall, which is what a struck thing does.
    const amp = peak * level * (i === 0 ? 1 : 0.4 + 0.6 * vel);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(amp, time + S.attack);
    env.gain.exponentialRampToValueAtTime(Math.max(1e-5, amp * 0.001), time + S.attack + decay);
    env.gain.linearRampToValueAtTime(0, time + S.attack + decay + MIN_RELEASE);
    o.connect(env);
    // The fundamental goes through the resonator as well as straight out; the
    // upper partials do not, because a tube tuned to the fundamental does not
    // hold a partial five octaves over it.
    const pan = panner(ctx, (i === 0 ? 0 : (i % 2 ? 1 : -1)) * spread);
    env.connect(pan);
    pan.connect(i === 0 ? ring : dry);
    if (i === 0) pan.connect(dry);
    o.start(time);
    o.stop(end);
  });

  // The mallet: a short band of noise where the head lands. A hard head is high
  // and a soft one is low, and `S.malletHz` is the whole of the difference.
  const noise = noiseSource(ctx, time, S.malletTime + 0.01);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = S.malletHz;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, time);
  ng.gain.linearRampToValueAtTime(peak * S.malletLevel * vel, time + 0.0008);
  ng.gain.exponentialRampToValueAtTime(0.0001, time + S.malletTime);
  ng.gain.linearRampToValueAtTime(0, time + S.malletTime + MIN_RELEASE);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(dry);

  if (metal) {
    // The discs. **On the resonator and not on the note**: the attack is not
    // pulsed, only what the tube is holding, which is what a vibraphone's motor
    // actually does. A cosine from full, so the first stroke is not a dip.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = S.tremoloHz!;
    const depth = ctx.createGain();
    depth.gain.value = S.ringLevel * S.tremoloDepth!;
    lfo.connect(depth);
    depth.connect(ring.gain);
    lfo.start(time);
    lfo.stop(end);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.14, reverb: p.reverb ?? (metal ? 0.42 : 0.24) });
  return end;
}

export function marimba(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  return bar(ctx, out, time, p, settings.marimba, false, settings);
}

export function vibes(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  return bar(ctx, out, time, p, settings.vibes, true, settings);
}

/** MEASURED by `tools/test-voices-2.ts --bless`. */
export const MARIMBA_TIMBRES = {
  marimba: { family: 'harmonic', struck: true, hold: 0.05, brightnessHz: 3000, loudnessDb: -12 },
};
export const VIBES_TIMBRES = {
  vibes: { family: 'harmonic', struck: true, hold: 0.35, brightnessHz: 4200, loudnessDb: -11.4 },
};

const mallet = (
  name: string,
  cost: VoiceCost,
  render: VoiceRenderer,
  timbres: Record<string, TimbreFacts>,
): Descriptor => ({
  name,
  cost,
  family: 'keyboard',
  roles: ['figure', 'melody'],
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render,
  timbres,
  dispatches: [],
  mood: [],
});

export const marimbaDescriptor = mallet('marimba', 'dear', marimba, MARIMBA_TIMBRES);
export const vibesDescriptor = mallet('vibes', 'dear', vibes, VIBES_TIMBRES);

export const descriptors: Descriptor[] = [marimbaDescriptor, vibesDescriptor];
export default descriptors;
