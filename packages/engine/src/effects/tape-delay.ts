// Tape delay: a delay line with a filter in the loop, a little wow and flutter
// on the head, and a switch that sends the repeats across the room instead of
// back where they came from.
//
//   input -> dL -------------------------> straight ----+
//              \-> hp -> lp -> same -> dL               |
//                          \-> cross -> dR              +-> wet
//   dR -> hp -> lp -> cross -> dL                       |
//   dL -> pan L, dR -> pan R -----------> ping-pong ----+
//
// Three things make it a tape delay rather than a delay:
//
//   **The filters are inside the loop.** A lowpass on the output darkens every
//   repeat equally; a lowpass in the loop darkens the second repeat once and
//   the sixth repeat six times, which is what tape does and what lets the
//   feedback go high without the repeats piling up as noise. The highpass is
//   the same argument at the other end: without it a delayed kick comes back
//   six times and the low end of the record is a queue.
//
//   **The head wanders.** Two LFOs on the delay time — a slow one and a fast
//   quiet one, wow and flutter — so the repeats detune slightly against the dry
//   and the line does not read as a copy.
//
//   **The time is in beats when there is a beat.** `timeBeats` of 0.75 is the
//   dotted eighth the record already uses (`sends.delayDotted` in the style),
//   resolved against whatever tempo the caller says it is playing at. With no
//   beat it is `timeSeconds` and the effect is the same effect.
//
// The ping-pong is a flag in the descriptor and a pair of crossfades in the
// build, so it can be switched while it plays: the repeats already in the line
// carry on to wherever they were going and the new ones go the other way.

import { shell, lfo, knob } from './shell.ts';
import { resolveParams, beatsOrSeconds, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** The slow wander and the fast one, in Hz, and how much of the depth each takes. */
const WOW = { hz: 0.63, share: 0.8 };
const FLUTTER = { hz: 6.3, share: 0.2 };
/** The deepest the head may wander, in seconds, at a wow of 1. */
const WANDER = 0.0035;

/**
 * How long a line of `longest` seconds rings at the hottest feedback before it
 * is 60 dB down: `ln(1e-3) / ln(feedback)` passes, and never under the
 * descriptor's own twenty seconds.
 */
export const tailFor = (longest: number): number =>
  Math.max(descriptor.tail === 'none' ? 0 : descriptor.tail.seconds,
    Math.ceil(longest * Math.log(1e-3) / Math.log(descriptor.params.feedback.max)));

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  const beat = p.beat;
  // The time the knobs stand at now, which a `timeBeats` of nought falls back
  // to: it fell back to the time this was *built* with, so a `timeSeconds`
  // moved after the build was undone by the next `timeBeats(0)` (R75).
  let secondsNow = p.timeSeconds;
  const seconds = beatsOrSeconds(p.timeBeats, p.timeSeconds, beat);

  // As long as the longest time this instance can be asked for: the seconds
  // knob's own maximum, or eight beats at the beat it was built on, whichever
  // is longer. It was the seconds maximum alone, so a valid `timeBeats: 8` at
  // 120 BPM asked for four seconds and got the 1.0135 the line was allocated
  // with — a `DelayNode` caps its delay at its allocation (the outside review, 09-19,
  // measured in Chromium: the impulse came back 1.0135 s later, not four).
  const MAX = Math.max(descriptor.params.timeSeconds.max, beat ? descriptor.params.timeBeats.max * beat : 0) + WANDER + 0.01;
  // **Its tail is the bound for the line it was built with** (R96 of the
  // reconciled review of 09-24): as many passes of the longest delay this
  // instance can be asked for as the hottest feedback takes to fall 60 dB. The
  // descriptor's twenty seconds is that bound for the seconds knob (a second at
  // 0.7 is 19.4 passes), and a beat makes the line longer than a second at any
  // tempo under 480 BPM for eight beats — at 40 BPM, 0.75 beats at 0.7 already
  // wants 22 s, and the shell cut a sounding echo at twenty.
  const sh = shell(ctx, { mix: p.mix, tail: tailFor(MAX) });
  const line = (side: number) => {
    const delay = ctx.createDelay(MAX);
    delay.delayTime.value = seconds;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = p.highpassHz;
    // DECIBELS on a highpass and a lowpass, not a linear Q (`master.ts` says
    // so about its own). MEASURED here as a tail that would not come down: at
    // +0.7 dB each, the two filters in the loop take a feedback of 0.7 to an
    // effective 0.82 at their corners, which is -38 dB after the declared
    // twenty seconds where the feedback alone says -62. Butterworth is
    // -3.01 dB and the bound is the bound again.
    hp.Q.value = -3.01;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.lowpassHz;
    lp.Q.value = -3.01;
    const same = ctx.createGain();
    const cross = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = side;
    delay.connect(hp);
    hp.connect(lp);
    lp.connect(same);
    lp.connect(cross);
    delay.connect(pan);
    sh.nodes.push(delay, hp, lp, same, cross, pan);
    return { delay, hp, lp, same, cross, pan };
  };

  const L = line(-1);
  const R = line(1);
  // The loop, both ways round. Which of the two is open is the flag.
  L.same.connect(L.delay);
  L.cross.connect(R.delay);
  R.same.connect(R.delay);
  R.cross.connect(L.delay);

  // The two ways out: one line straight through, keeping whatever stereo the
  // source had, or two lines hard apart.
  const straight = ctx.createGain();
  const pinged = ctx.createGain();
  L.delay.connect(straight);
  straight.connect(sh.wet);
  L.pan.connect(pinged);
  R.pan.connect(pinged);
  pinged.connect(sh.wet);
  sh.input.connect(L.delay);
  sh.nodes.push(straight, pinged);

  // The head's wander: two LFOs into one depth, into both delay times.
  const depth = ctx.createGain();
  for (const { hz, share } of [WOW, FLUTTER]) {
    const osc = lfo(ctx, hz, 0, hz === WOW.hz ? 0 : 0.25);
    const part = ctx.createGain();
    part.gain.value = share;
    osc.connect(part);
    part.connect(depth);
    sh.sources.push(osc);
    sh.nodes.push(part);
  }
  depth.connect(L.delay.delayTime);
  depth.connect(R.delay.delayTime);
  sh.nodes.push(depth);

  // Where the routing starts, written as values rather than as events: an
  // instance nobody touches carries no automation at all.
  let feedback = p.feedback;
  let ping = p.pingPong >= 0.5;
  const knobs = {
    time: [knob(ctx, L.delay.delayTime, seconds), knob(ctx, R.delay.delayTime, seconds)],
    hp: [knob(ctx, L.hp.frequency, p.highpassHz), knob(ctx, R.hp.frequency, p.highpassHz)],
    lp: [knob(ctx, L.lp.frequency, p.lowpassHz), knob(ctx, R.lp.frequency, p.lowpassHz)],
    same: [knob(ctx, L.same.gain, ping ? 0 : feedback), knob(ctx, R.same.gain, 0)],
    cross: [knob(ctx, L.cross.gain, ping ? feedback : 0), knob(ctx, R.cross.gain, ping ? feedback : 0)],
    out: [knob(ctx, straight.gain, ping ? 0 : 1), knob(ctx, pinged.gain, ping ? 1 : 0)],
    wander: knob(ctx, depth.gain, p.wow * WANDER),
  };
  const route = (at?: number, over?: number): void => {
    // Straight: the left line feeds itself and is the only one heard. Ping:
    // each line feeds the other and they are heard hard apart. The gains are
    // what change, so a switch mid-repeat is a crossfade and not a cut.
    knobs.same[0](ping ? 0 : feedback, at, over);
    knobs.same[1](0, at, over);
    knobs.cross[0](ping ? feedback : 0, at, over);
    knobs.cross[1](ping ? feedback : 0, at, over);
    knobs.out[0](ping ? 0 : 1, at, over);
    knobs.out[1](ping ? 1 : 0, at, over);
  };

  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      timeSeconds: (v, at, over) => { secondsNow = v; knobs.time.forEach((k) => k(v, at, over)); },
      timeBeats: (v, at, over) => knobs.time.forEach((k) => k(beatsOrSeconds(v, secondsNow, beat), at, over)),
      feedback: (v, at, over) => { feedback = Math.max(0, Math.min(descriptor.params.feedback.max, v)); route(at, over); },
      lowpassHz: (v, at, over) => knobs.lp.forEach((k) => k(v, at, over)),
      highpassHz: (v, at, over) => knobs.hp.forEach((k) => k(v, at, over)),
      wow: (v, at, over) => knobs.wander(Math.max(0, Math.min(1, v)) * WANDER, at, over),
      pingPong: (v, at, over) => { ping = v >= 0.5; route(at, over); },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'tapeDelay',
  family: 'time',
  scope: 'send',
  // A send, so what it applies to is buses: the harmonic buses a throw is made
  // of, and the drums, where a delayed hat is a groove of its own.
  applies: ['melodic', 'keys', 'drums'],
  params: {
    timeSeconds: { unit: 'seconds', min: 0.02, max: 1, default: 0.375, rate: 'k' },
    // The dotted eighth by default, which is what the record's own send is.
    timeBeats: { unit: 'beats', min: 0, max: 8, default: 0.75, rate: 'k' },
    feedback: { unit: 'ratio', min: 0, max: 0.7, default: 0.35, rate: 'k' },
    lowpassHz: { unit: 'hz', min: 500, max: 18000, default: 2400, rate: 'k' },
    highpassHz: { unit: 'hz', min: 20, max: 2000, default: 180, rate: 'k' },
    wow: { unit: 'ratio', min: 0, max: 1, default: 0.25, rate: 'k' },
    // 0 straight, 1 ping-pong.
    pingPong: { unit: 'index', min: 0, max: 1, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 0.3, rate: 'k' },
  },
  cost: 'mid',
  bypass: 'tapeDelay',
  // The bound over the range and not the reading at the defaults, which is what
  // a caller tearing a graph down needs: a second of delay at a feedback of 0.7
  // is 19.4 passes before -60 dB, so twenty seconds covers anything the seconds
  // knob can ask for. At the defaults it is two and a half. On a beat the line
  // can be longer than a second, and an instance built on one tells its shell
  // its own bound (`tailFor`).
  tail: { seconds: 20 },
  latency: 'none',
  build,
};

export default build;
