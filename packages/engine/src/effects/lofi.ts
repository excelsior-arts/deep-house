// Lo-fi: a low-pass and a wandering tape head — the top taken off and the
// pitch never quite still.
//
//   input -> low-pass -> head (a short delay whose time wanders) -> wet
//
// Round KV1 of the kitchen: the worn-tape treatment a slow, dusty passage
// wants, which the kitchen had in two halves and never together — the tape
// delay's wow and flutter live inside a feedback loop, and the filters stand
// still. Here the two are the whole effect:
//
//   the low-pass  twelve decibels an octave at `cutoffHz`: the top a cassette
//                 never had.
//   the head      a delay line read a few milliseconds back, its time moved by
//                 two LFOs — **wow**, slow (0.55 Hz) and deep, and **flutter**,
//                 fast (7.1 Hz) and shallow. A delay time that moves is a pitch
//                 that moves, so this is the head's speed drifting: a sustained
//                 chord wavers by a few cents and a held note never sits dead
//                 on its pitch. The wet path is the delayed one alone, so there
//                 is no comb with the dry.
//
// Its output starts when its input does, a few milliseconds late: the head's
// own delay, declared as a bound over the range.

import { shell, lfo, knob } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** Where the head sits, in seconds, and the most each wander may move it. */
const HEAD = 0.006;
const WOW = { hz: 0.55, depth: 0.0018 };
const FLUTTER = { hz: 7.1, depth: 0.00022 };

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0.02 });

  const lp1 = ctx.createBiquadFilter();
  lp1.type = 'lowpass';
  lp1.Q.value = -3.01;
  lp1.frequency.value = p.cutoffHz;
  const head = ctx.createDelay(0.05);
  head.delayTime.value = HEAD;
  sh.input.connect(lp1);
  lp1.connect(head);
  head.connect(sh.wet);
  sh.nodes.push(lp1, head);

  const depths: Array<{ depth: GainNode; full: number }> = [];
  for (const [w, amount] of [[WOW, p.wow], [FLUTTER, p.flutter]] as const) {
    const osc = lfo(ctx, w.hz, 0, 0);
    const depth = ctx.createGain();
    depth.gain.value = w.depth * amount;
    osc.connect(depth);
    depth.connect(head.delayTime);
    sh.sources.push(osc);
    sh.nodes.push(depth);
    depths.push({ depth, full: w.depth });
  }
  const wowKnob = knob(ctx, depths[0].depth.gain, WOW.depth * p.wow);
  const flutterKnob = knob(ctx, depths[1].depth.gain, FLUTTER.depth * p.flutter);

  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      cutoffHz: lp1.frequency,
      wow: (v, at, over) => wowKnob(WOW.depth * Math.max(0, Math.min(1, v)), at, over),
      flutter: (v, at, over) => flutterKnob(FLUTTER.depth * Math.max(0, Math.min(1, v)), at, over),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'lofi',
  family: 'tone',
  scope: 'voice',
  // A note's insert on the two harmonic families and the two buses they land
  // on: a worn chord, a wavering key. Not the drums and not the bottom — a
  // bass whose pitch wanders is out of tune with the kick's.
  applies: ['keyboard', 'ensemble', 'melodic', 'keys'],
  params: {
    cutoffHz: { unit: 'hz', min: 800, max: 12000, default: 3200, rate: 'a' },
    wow: { unit: 'ratio', min: 0, max: 1, default: 0.5, rate: 'k' },
    flutter: { unit: 'ratio', min: 0, max: 1, default: 0.4, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'lofi',
  // The head's delay and its deepest wander: nothing outlives one pass.
  tail: { seconds: 0.02 },
  // The head, and both wanders at their deepest: a bound over the range.
  latency: { seconds: 0.0083 },
  build,
};

export default build;
