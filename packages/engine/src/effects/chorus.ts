// Chorus: two or three delayed copies of a sound, each wandering by a few
// milliseconds on its own slow LFO, panned apart and mixed back under the dry.
//
// It is the oldest trick in this file and the one the record already has in
// one place: `master.ts` builds two fixed chorus taps on the keys bus — 12 and
// 17.5 ms at 0.18 and 0.23 Hz, panned ±0.6, wet at 0.42 — because a stab wants
// width without every note carrying a delay line. That graph is untouched and
// this is the same idea as an **instance**: the taps, the rates and the spread
// are parameters, so a strategy can ask for a slow wide one on a pad and a
// fast narrow one on a key without a second graph being written.
//
// The three base delays are deliberately not multiples of each other. Two taps
// at 12 and 24 ms comb the same frequencies twice; 11, 17 and 23 ms put their
// nulls in three different places, which is the difference between a chorus
// and a flanger nobody asked for.

import { shell, lfo, knob } from './shell.ts';
import { resolveParams, beatsOrHz, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** The three taps: base delay in ms, LFO phase in turns, where it sits at full spread. */
const TAPS = [
  { ms: 11, phase: 0, pan: -1 },
  { ms: 17, phase: 1 / 3, pan: 1 },
  { ms: 23, phase: 2 / 3, pan: 0 },
];

// Each tap runs a little faster than the one before it. Three LFOs at exactly
// one rate is one LFO with three delays behind it, and the whole point is that
// they drift apart.
const DETUNE = [1, 1.07, 1.14];

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  // Where the rate knob stands now, which a beats knob of nought falls back to:
  // it fell back to the rate this was *built* with, so a rate moved after the
  // build was undone by the next `rateBeats(0)` (R75 of the reconciled review of
  // 09-24).
  let rateNow = p.rateHz;
  const sh = shell(ctx, { mix: p.mix, tail: 0.05 });
  const beat = p.beat;

  const taps = TAPS.map((tap, i) => {
    const hz = beatsOrHz(p.rateBeats, p.rateHz, beat) * DETUNE[i];
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = tap.ms / 1000;
    const osc = lfo(ctx, hz, 0, tap.phase);
    const depth = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const level = ctx.createGain();
    osc.connect(depth);
    depth.connect(delay.delayTime);
    sh.input.connect(delay);
    delay.connect(pan);
    pan.connect(level);
    level.connect(sh.wet);
    sh.sources.push(osc);
    sh.nodes.push(delay, depth, pan, level);
    return {
      rate: knob(ctx, osc.frequency, hz),
      depth: knob(ctx, depth.gain, p.depthMs / 1000),
      pan: knob(ctx, pan.pan, tap.pan * p.spread),
      level: knob(ctx, level.gain, 0),
      base: tap,
      detune: DETUNE[i],
    };
  });

  // How loud each tap is: the ones that are playing share the wet path evenly
  // and the third is simply at nought when only two were asked for. A count of
  // voices that can be changed while it plays is worth more than a count that
  // decides how many delay lines exist, and three delay lines are three delay
  // lines either way.
  const setVoices = (n: number, at?: number, over?: number): void => {
    const want = Math.max(2, Math.min(3, Math.round(n)));
    taps.forEach((t, i) => t.level(i < want ? 1 / want : 0, at, over));
  };
  setVoices(p.voices);

  const setRate = (hz: number, at?: number, over?: number): void => taps.forEach((t, i) => t.rate(Math.max(0.01, hz * DETUNE[i]), at, over));

  // Every source this effect owns, started in one place, and stopped in one
  // place by `dispose`. A caller never starts or stops anything of an effect's.
  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      rateHz: (v, at, over) => { rateNow = v; setRate(v, at, over); },
      // A rate in beats is a rate: the seconds of a beat are the caller's and
      // the conversion is the contract's, in one place.
      rateBeats: (v, at, over) => setRate(beatsOrHz(v, rateNow, beat), at, over),
      depthMs: (v, at, over) => taps.forEach((t) => t.depth(v / 1000, at, over)),
      spread: (v, at, over) => taps.forEach((t) => t.pan(t.base.pan * v, at, over)),
      voices: setVoices,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'chorus',
  family: 'time',
  scope: 'voice',
  // What it is for: the two harmonic families and the bottom octave's
  // second register. Not the drums — a chorus on a hat is a smear — and not by
  // any voice's name.
  applies: ['keyboard', 'ensemble', 'bass'],
  params: {
    rateHz: { unit: 'hz', min: 0.05, max: 8, default: 0.55, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 32, default: 0, rate: 'k' },
    depthMs: { unit: 'ms', min: 0, max: 12, default: 3.2, rate: 'k' },
    voices: { unit: 'index', min: 2, max: 3, default: 3, rate: 'k' },
    spread: { unit: 'ratio', min: 0, max: 1, default: 0.8, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 0.5, rate: 'k' },
  },
  cost: 'mid',
  bypass: 'chorus',
  // The longest delay plus the deepest modulation: 23 ms and 12 more. There is
  // no feedback anywhere in it, so nothing outlives one pass.
  tail: { seconds: 0.05 },
  latency: 'none',
  build,
};

export default build;
