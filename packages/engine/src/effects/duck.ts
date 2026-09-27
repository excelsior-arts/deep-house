// The sidechain duck, as an instance.
//
//   input -> vca -> wet
//              ^
//              +-- one ramp per trigger
//
// This is the record's own duck taken out of the graph and made into an effect,
// which is what round K1 §6 said it would become: *a `dynamics` effect whose
// trigger is data on the program already.* `master.ts` builds two of these by
// hand — one on the melodic sum and one on the low end, each with its own
// depth — and `program.ts`'s `duckShape` works out the five points of the ramp
// once per theme from the room and the beat. None of that is touched here; the
// stage's `duck` becomes an instance in K5 and this is the instance it becomes.
//
// ## The trigger, and why it is a setter and not a second input
//
// PLAN-KITCHEN asks for a duck "with a trigger input". In a graph that would be
// a second `AudioNode` to connect a kick into, and a second input is a change
// to `EffectInstance` — every effect in the kitchen gains a field for the sake
// of one of them, and a caller would have to know which effects have two inputs
// and which have one. And it would be measuring the wrong thing anyway: **in
// this engine a kick is not a signal to be detected, it is an event that is
// already written down.** The program says where every kick lands and whether
// it posts a sidechain (`ProgramEvent.duck`), and the record's own duck is
// scheduled from exactly that rather than from listening for a thump.
//
// So the trigger is `params.trigger(depth, at)`: one ramp, at an instant, as
// deep as the caller says. It is the contract's own setter shape — a value, the
// instant it takes effect, the ramp it takes — and it means the same thing
// offline, where a whole theme is scheduled before a sample is computed, and
// live, where a kick is fired eighty milliseconds before it sounds. A caller
// that genuinely wants a detector puts a `compressor` on the bus instead; that
// is what that effect is for.
//
// ## The shape
//
// Five points, and they are `duckShape`'s own arithmetic rather than a new
// guess: down past the depth in the attack, back to the depth at the minimum,
// most of the way back by 45 % of a beat, and home by the end of it. The
// overshoot is the reason a sidechain sounds like one — a linear fall to the
// depth and a linear rise from it is a triangle, and a triangle is audible as a
// triangle. MEASURED numbers in `packages/deep-house/src/styles/deep-house.ts`;
// the defaults here are the shape and the *caller* brings the depth, because
// how far down a kick pushes a pad is a composition decision and not an
// effect's.

import { shell } from './shell.ts';
import { line } from '../ramp.ts';
import { resolveParams, beatsOrSeconds, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const vca = ctx.createGain();
  vca.gain.value = 1;
  sh.input.connect(vca);
  vca.connect(sh.wet);
  sh.nodes.push(vca);

  let depth = p.trigger;
  let attack = p.attackMs / 1000;
  let minimumAt = p.minimumMs / 1000;
  let recover = p.recoverBeats;
  const beat = () => beatsOrSeconds(1, p.beatSeconds, p.beat);

  /**
   * One duck, at an instant. `value` is how far down in decibels for this one
   * ramp; no argument (or `null`) is the instance's own declared depth, so
   * `trigger()` is "the usual one".
   *
   * **Nought is nought, not the default.** Zero is inside the declared range
   * and means what it says — no duck on this hit — so `trigger(0, t)` clears
   * whatever ramp was running and holds the VCA at unity from `t` (the outside
   * review of 09-19, its E04, read a -7 dB duck off it). A positive value is
   * a duck upward, which no duck is; it is read as nought.
   */
  // The VCA's line (`../ramp.ts`), so a trigger knows where the last one had
  // got to.
  const vcaLine = line(ctx, vca.gain, 1);
  const trigger = (value?: number | null, at?: number): void => {
    const db = value == null ? depth : Math.min(0, value);
    const g = Math.pow(10, db / 20);
    const t = at == null ? ctx.currentTime : at;
    const b = beat();
    // Anchored a hair before the ramp starts, which is what `duckShape`'s own
    // `dt: -0.001` is — **at where the last duck's recovery had got to**, the
    // graph's sidechain rule (`writeDuck` in master.ts). It was set to 1 there,
    // so a trigger landing on an unfinished recovery jumped the gain back to
    // unity and fell again: a click on whatever was ducked (R84 of the
    // reconciled review of 09-24, the E07 class). Idle, the line is at 1 and
    // the commands are the ones it always wrote.
    const t0 = Math.max(0, t - 0.001);
    vcaLine.set(vcaLine.moving(t0) ? vcaLine.at(t0) : 1, t0);
    if (g >= 1) {
      // No duck on this hit: back to unity over the attack, from wherever it was.
      if (vcaLine.at(t0) !== 1) vcaLine.then(1, t + attack);
      return;
    }
    vcaLine.then(g * 1.12, t + attack);
    vcaLine.then(g, t + minimumAt);
    vcaLine.then(g + (1 - g) * 0.6, t + b * 0.45);
    vcaLine.then(1, t + b * recover);
  };

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      // The one knob that is not a knob: a value and an instant, which is a
      // trigger written in the contract's own vocabulary. **It is the declared
      // parameter and there is no `depthDb` beside it**, because two names for
      // how far down a kick pushes a pad is one name too many: `trigger(-9, t)`
      // ducks nine decibels at `t` and `trigger(null, t)` ducks by the declared
      // default, which is what the parameter's own `default` is for.
      trigger,
      attackMs: (v: number) => { attack = Math.max(0.0005, v / 1000); },
      minimumMs: (v: number) => { minimumAt = Math.max(attack + 0.001, v / 1000); },
      recoverBeats: (v: number) => { recover = Math.max(0.1, v); },
      beatSeconds: (v: number) => { p.beatSeconds = Math.max(0.05, v); },
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'duck',
  family: 'dynamics',
  scope: 'bus',
  // Everything except the kick's own bus. A duck on the thing that triggers it
  // is the one wiring that cannot be right, and `master.ts` records the same
  // line: *melodic material goes through it; the kick does not.*
  applies: ['sub', 'drums', 'melodic', 'keys', 'bass', 'keyboard', 'ensemble', 'noise'],
  params: {
    // The trigger, and its default is the depth a bare `trigger()` uses.
    // MEASURED in the style and not here: 6-9 dB is what the reference sets do
    // and -7 is the middle of it.
    trigger: { unit: 'db', min: -24, max: 0, default: -7, rate: 'k' },
    attackMs: { unit: 'ms', min: 0.5, max: 60, default: 5, rate: 'k' },
    minimumMs: { unit: 'ms', min: 5, max: 250, default: 65, rate: 'k' },
    recoverBeats: { unit: 'beats', min: 0, max: 4, default: 0.9, rate: 'k' },
    // What a beat is, when the caller has not said. `beat` in the parameters is
    // the reserved key and is preferred; this is the fallback so the effect is
    // still a duck with no tempo in hand.
    beatSeconds: { unit: 'seconds', min: 0.05, max: 3, default: 0.5, rate: 'k' },
    // Not a knob a caller should move: a duck at half a mix is a duck half as
    // deep, which is what the trigger's own value is for. It is here because
    // the shell has it and the identity gate reads it.
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'duck',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
