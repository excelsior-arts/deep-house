// Formant filter: three bandpasses parked where a mouth puts them.
//
//   input -+-> f1 -> g1 -+
//          +-> f2 -> g2 -+-> level -> wet
//          +-> f3 -> g3 -+
//
// Round K2 built this bank inside a voice (`formant-pad.ts`: two saws and a
// little noise through three parallel formants with a twenty-two second vowel
// drift). This is the same bank as an **effect**, so that anything can be put
// through a mouth — which is a different instrument from a pad that has one,
// because what a vowel does to a hat loop is not what it does to a chord.
//
// The five vowels are the measured ones and `vowel` walks **between** them
// rather than choosing one: a continuous index, so 1.5 is the sound halfway
// from E to I, which is what a mouth actually passes through and what a slow
// automation over eight bars wants. Whole numbers are the vowels themselves.
//
// **A bank of narrow bandpasses throws most of a signal away**, and round K2
// measured how much: the formant pad needed eleven decibels of extra source
// level to stand where the strings stand, which is the bank's insertion loss
// and not the voice being quiet. Here that has to be a knob rather than a trim,
// because what goes in is the caller's; `level` defaults to the make-up the
// bank costs at its default Q, measured, and `notes/archive/2026-09-kitchen/rounds/k4.md` has the
// reading it was set from.

import { shell, knob } from './shell.ts';
import type { Knob } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * The three centres of each vowel, in hertz, and the relative level of each
 * formant. Carried over from `formant-pad.ts`'s own table, which is the
 * textbook one: the first two formants are what tells one vowel from another
 * and the third is what makes it sound like a person rather than a filter.
 */
const VOWELS = [
  { id: 'a', hz: [730, 1090, 2440], db: [0, -6, -14] },
  { id: 'e', hz: [530, 1840, 2480], db: [0, -8, -15] },
  { id: 'i', hz: [270, 2290, 3010], db: [0, -13, -18] },
  { id: 'o', hz: [570, 840, 2410], db: [0, -5, -16] },
  { id: 'u', hz: [300, 870, 2240], db: [0, -10, -20] },
];

/** The three centres and levels at a continuous vowel index, interpolated. */
function at(index: number): { hz: number[]; db: number[] } {
  const x = Math.max(0, Math.min(VOWELS.length - 1, index));
  const a = VOWELS[Math.floor(x)];
  const b = VOWELS[Math.min(VOWELS.length - 1, Math.floor(x) + 1)];
  const u = x - Math.floor(x);
  return {
    // In **octaves**, not in hertz: a formant sliding linearly in hertz passes
    // through the wrong sounds on the way, because a vowel is a ratio.
    hz: a.hz.map((v: number, i: number) => v * Math.pow(b.hz[i] / v, u)),
    db: a.db.map((v: number, i: number) => v + (b.db[i] - v) * u),
  };
}

/** One formant of the bank: its bandpass and the gain that sets its level. */
interface Band {
  f: BiquadFilterNode;
  g: GainNode;
}

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  const sum = ctx.createGain();
  const level = ctx.createGain();
  level.gain.value = p.level;
  sum.connect(level);
  level.connect(sh.wet);
  sh.nodes.push(sum, level);

  const start = at(p.vowel);
  const bands: Band[] = start.hz.map((hz: number, i: number) => {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    // A bandpass's Q *is* a real Q — this is the type where the number means
    // what it says. A vowel's own bandwidth is about a tenth of its centre,
    // which is a Q near ten, and the knob scales all three together.
    f.Q.value = p.q;
    f.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = Math.pow(10, start.db[i] / 20);
    sh.input.connect(f);
    f.connect(g);
    g.connect(sum);
    sh.nodes.push(f, g);
    return { f, g };
  });

  const hzKnobs = bands.map((b: Band, i: number) => knob(ctx, b.f.frequency, start.hz[i]));
  const gKnobs = bands.map((b: Band, i: number) => knob(ctx, b.g.gain, Math.pow(10, start.db[i] / 20)));
  const qKnobs = bands.map((b: Band) => knob(ctx, b.f.Q, p.q));

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      // One number moves six: three centres and three levels, which is what a
      // vowel is. It is the shape a gesture wants — "open the mouth over four
      // bars" is one ramp on one knob.
      vowel: (v: number, when?: number, over?: number) => {
        const want = at(v);
        want.hz.forEach((hz: number, i: number) => hzKnobs[i](hz, when, over));
        want.db.forEach((db: number, i: number) => gKnobs[i](Math.pow(10, db / 20), when, over));
      },
      q: (v: number, when?: number, over?: number) => qKnobs.forEach((k: Knob) => k(Math.max(0.5, v), when, over)),
      level: level.gain,
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'formant',
  family: 'tone',
  scope: 'voice',
  applies: ['keyboard', 'ensemble', 'bass', 'noise', 'melodic', 'keys', 'drums'],
  params: {
    // 0 a, 1 e, 2 i, 3 o, 4 u — and everything between them.
    vowel: { unit: 'index', min: 0, max: 4, default: 0, rate: 'k' },
    q: { unit: 'ratio', min: 0.5, max: 30, default: 9, rate: 'k' },
    // MEASURED: what the bank costs at the default Q, so that an effect at its
    // defaults is about as loud as its own input.
    level: { unit: 'ratio', min: 0, max: 8, default: 3.2, rate: 'a' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  cost: 'cheap',
  bypass: 'formant',
  tail: 'none',
  latency: 'none',
  build,
};

export default build;
