// Phaser: a stack of allpass stages swept by a slow LFO.
//
//   input -> ap x N -> wet
//
// This one exists in the record already and round K1 §6 named it as the
// treatment that becomes an effect: `voices/treat.ts`'s `phaserInsert` is four
// to six allpass stages built **per note**, from a spec the composer's sound
// stage writes into every event of a layer it has decided to phase. That file
// is untouched. This is the same idea as an instance on a bus, where it costs
// one graph a theme instead of one a note, and where its rate can be given in
// beats.
//
// What an allpass stage does is pass every frequency and delay each by a
// different amount; summed with the dry, the frequencies whose delay is half a
// cycle cancel. **Where those notches are is what the LFO moves**, and how many
// there are is the number of stages: N stages give N/2 notches, which is why
// four is a phaser and twelve is a jet.
//
// Two numbers are decisions:
//
//   **The stages are spaced by a ratio and not evenly.** `treat.ts` uses 1.7
//   per stage and so does this: evenly spaced notches are a comb, which is a
//   flanger, and a phaser's character is that its notches are *not* harmonically
//   related — that is the whole difference between the two effects and it is
//   one line of arithmetic.
//
//   **There is no feedback, and that is an engine finding rather than taste.**
//   A resonant phaser is the stack fed back on itself, and a feedback path round
//   a chain of biquads is a *cycle with no delay in it* — which Web Audio does
//   not allow: the specification requires at least one `DelayNode` in every
//   cycle and an implementation mutes one that has none. The shortest delay this
//   engine can put there is a render quantum, 2.9 ms at 44.1 kHz (round K2's
//   Karplus wall, met for the third time in this kitchen), and 2.9 ms of
//   feedback round an allpass stack is not a resonant phaser, it is a flanger —
//   which is one folder over and already built. So the notches are sharpened by
//   the stages' own `width` instead, which is the allpass Q, and the stage's own
//   treatment in `treat.ts` has no feedback either, for what turns out to be the
//   same reason.

import { shell, lfo, lfoWave, knob } from './shell.ts';
import type { Knob } from './shell.ts';
import { resolveParams, beatsOrHz, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** How far apart the stages are, as a ratio. `treat.ts`'s own number. */
const SPACING = 1.7;
/**
 * The most stages this builds. Six, and it is a **measurement**: an allpass
 * whose frequency is moved by an audio-rate signal recomputes its coefficients
 * every sample, so a stage is a great deal dearer than a biquad sitting still,
 * and the first build made eight of them plus three gains each and rendered at
 * 13.4 times the kitchen's reference effect — the dearest thing in the kitchen
 * bar the reverb, for an effect `treat.ts` describes as *mild*. Six is what a
 * phaser is (`treat.ts`: four to six), and the crossfade gains are gone with
 * them: the stages that are asked for are the stages that are built.
 */
const MAX_STAGES = 6;

/** One stage of the stack: its allpass, the gain the LFO swings it by, and where it sits. */
interface Tap {
  ap: BiquadFilterNode;
  swing: GainNode;
  centre: number;
}

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
  const keep = (...n: AudioNode[]) => sh.nodes.push(...n);
  const hz = beatsOrHz(p.rateBeats, p.rateHz, p.beat);

  const head = ctx.createGain();
  sh.input.connect(head);
  keep(head);

  const osc = lfo(ctx, hz, 0, p.phase);
  sh.sources.push(osc);

  // The stages that were asked for are the stages that are built.
  const built = Math.max(2, Math.min(MAX_STAGES, Math.round(p.stages)));
  let node: AudioNode = head;
  const taps: Tap[] = [];
  for (let i = 0; i < built; i++) {
    const ap = ctx.createBiquadFilter();
    ap.type = 'allpass';
    // An allpass's Q is the width of the phase transition, and it is a real Q
    // on this type — narrow is a notch that moves through the spectrum, wide is
    // the whole spectrum turning over.
    ap.Q.value = p.width;
    const centre = p.centreHz * Math.pow(SPACING, i);
    ap.frequency.value = centre;
    const swing = ctx.createGain();
    swing.gain.value = centre * p.depth;
    osc.connect(swing);
    swing.connect(ap.frequency);
    node.connect(ap);
    keep(ap, swing);
    taps.push({ ap, swing, centre });
    node = ap;
  }
  node.connect(sh.wet);

  // Taking a stage out is parking it: its corner goes to the top of the band
  // and its swing to nought, so what is left of it is a phase shift above what
  // anything in this record has any energy at. It can only go **down** from
  // what was built, and that is deliberate — an allpass added to a running
  // chain is a reconnection, and a reconnection inside a signal is a click.
  let depth = p.depth;
  let active = built;
  const setStages = (n: number, at?: number, over?: number): void => {
    active = Math.max(2, Math.min(built, Math.round(n)));
    taps.forEach((t: Tap, i: number) => {
      knobs.centre[i](i < active ? t.centre : 20000, at, over);
      knobs.swing[i](i < active ? t.centre * depth : 0, at, over);
    });
  };
  const knobs = {
    centre: taps.map((t: Tap) => knob(ctx, t.ap.frequency, t.centre)),
    swing: taps.map((t: Tap) => knob(ctx, t.swing.gain, t.centre * p.depth)),
    q: taps.map((t: Tap) => knob(ctx, t.ap.Q, p.width)),
    rate: knob(ctx, osc.frequency, hz),
  };
  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      rateHz: (v: number, at?: number, over?: number) => { rateNow = v; knobs.rate(Math.max(0.005, v), at, over); },
      rateBeats: (v: number, at?: number, over?: number) => knobs.rate(beatsOrHz(v, rateNow, p.beat), at, over),
      // Both write back what they set (R75 of the reconciled review of 09-24):
      // the centre and the depth are read again by `stages` and by each other,
      // and a `centreHz` was reverted by the next `depth`, a `depth` by the
      // next `stages` (TODO's phaser item).
      centreHz: (v: number, at?: number, over?: number) => taps.forEach((t: Tap, i: number) => {
        t.centre = v * Math.pow(SPACING, i);
        if (i >= active) return; // a parked stage stays parked
        knobs.centre[i](t.centre, at, over);
        knobs.swing[i](t.centre * depth, at, over);
      }),
      depth: (v: number, at?: number, over?: number) => {
        depth = Math.max(0, Math.min(0.95, v));
        taps.forEach((t: Tap, i: number) => { if (i < active) knobs.swing[i](t.centre * depth, at, over); });
      },
      stages: setStages,
      // The phase is the wave itself and not a knob on a node, so it is
      // written by swapping the wave — `tremolo.ts`'s own answer, and it works
      // on a running oscillator because a `PeriodicWave` carries the phase in
      // its coefficients.
      phase: (v: number) => { osc.setPeriodicWave(lfoWave(ctx, 0, v)); },
      width: (v: number, at?: number, over?: number) => knobs.q.forEach((k: Knob) => k(Math.max(0.2, v), at, over)),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'phaser',
  family: 'motion',
  scope: 'voice',
  applies: ['keyboard', 'ensemble', 'noise', 'bass', 'melodic', 'keys', 'drums'],
  params: {
    rateHz: { unit: 'hz', min: 0.005, max: 8, default: 0.12, rate: 'k' },
    rateBeats: { unit: 'beats', min: 0, max: 64, default: 0, rate: 'k' },
    centreHz: { unit: 'hz', min: 80, max: 4000, default: 600, rate: 'k' },
    depth: { unit: 'ratio', min: 0, max: 0.95, default: 0.5, rate: 'k' },
    stages: { unit: 'index', min: 2, max: 6, default: 4, rate: 'k' },
    // Where in its cycle the sweep starts, in turns: two instances half a turn
    // apart on two layers move against each other instead of together.
    phase: { unit: 'ratio', min: 0, max: 1, default: 0, rate: 'k' },
    width: { unit: 'ratio', min: 0.2, max: 6, default: 0.7, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 0.45, rate: 'k' },
  },
  // MEASURED at 6.05x the reference effect with four stages, which is past the
  // mid band, and it is the **modulation** and not the count: an allpass whose
  // frequency is written by an audio-rate signal recomputes its coefficients
  // every sample, and four of those cost more than twenty-three nodes standing
  // still (the tape delay reads 2.8x with a delay line and two filters in a
  // feedback loop). It is why the stage count came down from eight to six.
  cost: 'dear',
  bypass: 'phaser',
  // Eight biquads in a row and nothing fed back into anything: what rings is
  // the filters' own settling, which at the lowest centre and the highest width
  // is a few tens of milliseconds. Fifty is the bound.
  tail: { seconds: 0.05 },
  latency: 'none',
  build,
};

export default build;
