// Tremolo: the level moving, and nothing else moving with it.
//
// Three shapes, because they are three different musical ideas and not three
// settings of one: a sine is a breath, a triangle is a pulse with a corner on
// it, and a square is a gate — the thing a house record does to a pad when it
// wants the pad to be rhythm. And a **stereo phase**, which is what turns a
// tremolo into an auto-pan when it is half a cycle: the two channels are
// modulated by two LFOs of the same shape and rate at a stated offset, so 0 is
// a tremolo, 0.5 is a pan, and everything between is the drift in between.
//
// The arithmetic is one line and it is what makes a depth of nought free:
//
//   gain = (1 - depth/2) + (depth/2)·lfo,   lfo in [-1, 1]
//
// At depth 0 that is a gain of exactly 1 with a modulation of exactly 0 in
// front of it, which is the input, to the sample. At depth 1 it runs from 0 to
// 1 and never leaves the arrangement's own headroom, because the wave is
// normalised and a square's ripple is inside it.

import { shell, lfo, knob, lfoWave } from './shell.ts';
import { resolveParams, beatsOrHz, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

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
  const sh = shell(ctx, { mix: p.mix, tail: 0 });
  const beat = p.beat;
  const hz = beatsOrHz(p.rateBeats, p.rateHz, beat);

  // Two channels, modulated separately. The input is pinned to two channels
  // before the splitter so that a mono source is a pair rather than one live
  // channel and one silent one — the kick bus's lesson in `master.ts`, which
  // pins its own count so a second channel cannot arrive part-way through a
  // beat and start a filter from rest.
  const pair = ctx.createGain();
  pair.channelCount = 2;
  pair.channelCountMode = 'explicit';
  pair.channelInterpretation = 'speakers';
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  sh.input.connect(pair);
  pair.connect(split);
  merge.connect(sh.wet);
  sh.nodes.push(pair, split, merge);

  const sides = [0, 1].map((ch: number) => {
    const g = ctx.createGain();
    const depth = ctx.createGain();
    const osc = lfo(ctx, hz, p.shape, ch === 0 ? 0 : p.phase);
    osc.connect(depth);
    depth.connect(g.gain);
    split.connect(g, ch);
    g.connect(merge, 0, ch);
    sh.sources.push(osc);
    sh.nodes.push(g, depth);
    return {
      osc,
      level: knob(ctx, g.gain, 1 - p.depth / 2),
      depth: knob(ctx, depth.gain, p.depth / 2),
      rate: knob(ctx, osc.frequency, hz),
      channel: ch,
    };
  });

  const setDepth = (v: number, at?: number, over?: number): void => {
    const d = Math.max(0, Math.min(1, v));
    for (const s of sides) { s.level(1 - d / 2, at, over); s.depth(d / 2, at, over); }
  };
  const setRate = (v: number, at?: number, over?: number): void => sides.forEach((s) => s.rate(Math.max(0.01, v), at, over));
  // The shape and the stereo phase are the wave itself, so they are written by
  // handing the oscillator another one. It is the one move in this folder that
  // is not a ramp: a periodic wave cannot be crossfaded, and a wave swapped at
  // the top of a cycle is inaudible where a gain stepping is not — which is why
  // the depth, and not the wave, is what a caller automates.
  let shape = p.shape;
  let phase = p.phase;
  const setWave = (): void => sides.forEach((s) => {
    s.osc.setPeriodicWave(lfoWave(ctx, shape, s.channel === 0 ? 0 : phase));
  });

  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      rateHz: (v, at, over) => { rateNow = v; setRate(v, at, over); },
      rateBeats: (v, at, over) => setRate(beatsOrHz(v, rateNow, beat), at, over),
      depth: setDepth,
      shape: (v) => { shape = Math.round(v); setWave(); },
      phase: (v) => { phase = v; setWave(); },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'tremolo',
  family: 'motion',
  scope: 'bus',
  // Anything held: the two harmonic families and the noise bed. A tremolo on a
  // kick is a kick with a hole in it.
  applies: ['keyboard', 'ensemble', 'noise', 'melodic', 'keys'],
  params: {
    rateHz: { unit: 'hz', min: 0.05, max: 24, default: 4, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 16, default: 0, rate: 'k' },
    depth: { unit: 'ratio', min: 0, max: 1, default: 0.55, rate: 'k' },
    // 0 sine, 1 triangle, 2 square.
    shape: { unit: 'index', min: 0, max: 2, default: 0, rate: 'k' },
    // In turns between the two channels: 0 is a tremolo, 0.5 is an auto-pan.
    phase: { unit: 'ratio', min: 0, max: 1, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'tremolo',
  // Nothing in it has a memory: a gain moving is the gain it is moving now.
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
