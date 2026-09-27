// Auto-wah: a filter whose corner is how loud the thing playing through it is.
//
//   input ----------------> filter -> level -> wet
//     |                       ^
//     +-> follower -> sens ---+ (added to the corner, in hertz)
//
// It is the third thing the kitchen does with `detector.ts` and the one where
// what the follower drives is not a gain. A `BiquadFilter`'s `frequency` is an
// a-rate AudioParam, so an audio signal connected to it is **added to its
// value, sample by sample** — which means an envelope follower plugged straight
// into it is an envelope filter with no arithmetic in between at all. That is
// the whole effect, and everything else here is range and taste.
//
// Three decisions:
//
//   **The sensitivity is in hertz and not in a ratio**, because that is what
//   the parameter physically is: the follower reads roughly nought to one, so
//   `rangeHz` is exactly how far the corner travels between silence and full
//   scale. A knob in per cent would be a knob whose meaning depended on the
//   base.
//
//   **The travel is linear in hertz and the ear is not**, and that is left
//   alone rather than corrected. A wah *is* a resonance sliding linearly — the
//   pedal is a potentiometer — and a filter whose corner moves in octaves with
//   the envelope is a different, smoother effect that does not sound like one.
//
//   **`down: 1` inverts it**, which is the one control an auto-wah needs that
//   is not obvious: a filter that opens when a note is struck is a wah, and one
//   that *closes* when a note is struck and opens as it dies is the sound a
//   whole genre is built on. It is a gain of -1 on the sensitivity and the base
//   raised by the same amount, so the two directions cover the same ground.

import { shell, knob } from './shell.ts';
import { follower } from './detector.ts';
import { qFor } from './filter.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

const TYPES: BiquadFilterType[] = ['lowpass', 'bandpass', 'highpass'];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);

  let mode = Math.max(0, Math.min(2, Math.round(p.mode)));
  const f = ctx.createBiquadFilter();
  f.type = TYPES[mode];
  f.Q.value = qFor(TYPES[mode], p.resonanceDb);
  const level = ctx.createGain();
  level.gain.value = p.level;

  sh.input.connect(f);
  f.connect(level);
  level.connect(sh.wet);
  keep(f, level);

  const det = follower(ctx, { ms: p.attackMs, rms: true, poles: 2 }, keep);
  sh.input.connect(det.input);
  // The release, as a second smoother behind the detector: `detector.ts`
  // carries why the asymmetry has to be here and what it costs.
  const smooth = ctx.createBiquadFilter();
  smooth.type = 'lowpass';
  smooth.Q.value = -3.01;
  smooth.frequency.value = 2.3 / (2 * Math.PI * (p.releaseMs / 1000));
  det.output.connect(smooth);
  const sens = ctx.createGain();
  keep(smooth, sens);

  let down = p.down >= 0.5;
  const base = () => (down ? p.baseHz + p.rangeHz : p.baseHz);
  sens.gain.value = down ? -p.rangeHz : p.rangeHz;
  f.frequency.value = base();
  smooth.connect(sens);
  sens.connect(f.frequency);

  const sensKnob = knob(ctx, sens.gain, sens.gain.value);
  const baseKnob = knob(ctx, f.frequency, base());
  const qKnob = knob(ctx, f.Q, qFor(TYPES[mode], p.resonanceDb));
  const relKnob = knob(ctx, smooth.frequency, smooth.frequency.value);
  let resonanceDb = p.resonanceDb;

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      baseHz: (v: number, at?: number, over?: number) => { p.baseHz = v; baseKnob(base(), at, over); },
      rangeHz: (v: number, at?: number, over?: number) => { p.rangeHz = v; sensKnob(down ? -v : v, at, over); baseKnob(base(), at, over); },
      down: (v: number, at?: number, over?: number) => { down = v >= 0.5; sensKnob(down ? -p.rangeHz : p.rangeHz, at, over); baseKnob(base(), at, over); },
      resonanceDb: (v: number, at?: number, over?: number) => { resonanceDb = v; qKnob(qFor(TYPES[mode], v), at, over); },
      mode: (v: number) => {
        mode = Math.max(0, Math.min(2, Math.round(v)));
        f.type = TYPES[mode];
        qKnob(qFor(TYPES[mode], resonanceDb), null, 0);
      },
      attackMs: (v: number, at?: number, over?: number) => det.setMs(v, at, over),
      releaseMs: (v: number, at?: number, over?: number) => relKnob(2.3 / (2 * Math.PI * (Math.max(1, v) / 1000)), at, over),
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'autoWah',
  family: 'tone',
  scope: 'voice',
  applies: ['bass', 'keyboard', 'ensemble', 'drum', 'melodic', 'keys'],
  params: {
    // 0 lowpass, 1 bandpass, 2 highpass.
    mode: { unit: 'index', min: 0, max: 2, default: 1, rate: 'k' },
    baseHz: { unit: 'hz', min: 60, max: 6000, default: 320, rate: 'a' },
    // How far the corner travels between silence and full scale.
    rangeHz: { unit: 'hz', min: 0, max: 12000, default: 2600, rate: 'a' },
    resonanceDb: { unit: 'db', min: 0, max: 24, default: 10, rate: 'a' },
    // 0 opens on a hit, 1 closes on one.
    down: { unit: 'index', min: 0, max: 1, default: 0, rate: 'k' },
    attackMs: { unit: 'ms', min: 0.5, max: 200, default: 12, rate: 'k' },
    releaseMs: { unit: 'ms', min: 10, max: 2000, default: 140, rate: 'k' },
    level: { unit: 'ratio', min: 0, max: 2, default: 1, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  // MEASURED at 3.1x the reference effect: a detector, a second smoother, and
  // a resonant biquad whose corner is moved by an audio-rate signal, which is
  // a filter recomputing its coefficients every sample.
  cost: 'mid',
  bypass: 'autoWah',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
