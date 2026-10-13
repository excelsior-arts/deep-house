// Three more hats: tight, loose, and the metallic one.
//
// Round K3 of PLAN-KITCHEN. The record has two — a closed hat and an open one
// off the same six-oscillator ladder — and `hats.ts` says what they are: six
// squares at inharmonic ratios beating against each other under a band-passed
// noise bed. These three are the same idea with the three things that actually
// separate one hat from another moved, and nothing else:
//
//   the tight one   a fortieth of a second. Shorter than the closed hat by
//                   half, with the lid down and the band up: a hat closed hard
//                   under the foot, which is the sixteenth a house record puts
//                   between its offbeats.
//   the loose one   a fifth of a second, the lid open, the noise share up. A
//                   hat left loose rings and *breathes*, and most of what
//                   makes it breathe is that the noise outlasts the metal.
//   the metallic    a different ladder, and that is the whole instrument. The
//                   record's six ratios are spread from 1 to 4.11, which reads
//                   as a cymbal; six ratios packed between 2 and 3.5 through a
//                   highpass well above all of them reads as the drum machine
//                   it came out of — a sizzle whose partials are close enough
//                   together to beat into a buzz rather than a chime.
//
// All three are pre-rendered per variant like everything in the kitchen, and
// like the record's own hats: six oscillators and four filters a hit was 47 %
// of what this engine's audio thread did, and nothing here builds a filter.
//
// Registered and reachable by nothing: no candidate list of any style names
// one, `plays` is null so no arrangement gates them, and the levels are the
// two the hat family already has.

import { kitTopology, drumNoise, filter, KIT } from './drumkit.ts';
import { contract, list, num, CENTS, DB, HZ, Q, RATIO, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { DrumSpec } from './drumkit.ts';
import { airPath, swapDb, swapShelf, topLadder, topLevel, SWAP_K } from './hat-grain.ts';

/** What a row of this topology carries, each in its range (`schema.ts`): one hat's own numbers, three sets of which are the shelf. */
const PARAMETERS = contract({
  ratios: list(RATIO, 1, 16),
  base: HZ, detune: CENTS, metal: UNIT, hp: HZ, peakHz: HZ, q: Q, tilt: DB, lidHz: HZ,
  t10: KIT.t10, seconds: KIT.seconds, variants: KIT.variants, variantCents: KIT.variantCents, attack: KIT.attack,
  trim: KIT.trim, rateSpread: KIT.rateSpread, gainSpread: KIT.gainSpread, decaySpread: KIT.decaySpread,
  panSpread: KIT.panSpread, velBright: KIT.velBright, velDecay: KIT.velDecay, pan: KIT.pan, room: KIT.room, delay: KIT.delay,
  // The grain (round SPARK-2, `hat-grain.ts`): the upper ladder's share of the
  // metal, the air past the lid from `airHz`, the tail after -10 dB. Nought in
  // every row, which builds nothing; a place voices the block.
  top: num(0, 0.9), air: UNIT, airHz: HZ, tail: UNIT,
});

/** One hat's own patch. */
type HatSettings = PatchOf<typeof PARAMETERS.fields>;

/** Everything fixed about one hat of this shelf, out of its own block. */
function hatSpec(H: HatSettings): DrumSpec {
  return {
    key: 'hit',
    seconds: H.seconds,
    channels: 1,
    variants: H.variants,
    variantCents: H.variantCents,
    ratios: H.ratios,
    base: H.base,
    detune: H.detune,
    metal: H.metal,
    hp: H.hp,
    peakHz: H.peakHz,
    q: H.q,
    tilt: H.tilt,
    lidHz: H.lidHz,
    t10: H.t10,
    attack: H.attack,
    trim: H.trim,
    rateSpread: H.rateSpread,
    gainSpread: H.gainSpread,
    decaySpread: H.decaySpread,
    panSpread: H.panSpread,
    velBright: H.velBright,
    velDecay: H.velDecay,
    pan: H.pan,
    room: H.room,
    delay: H.delay,
    top: H.top,
    air: H.air,
    airHz: H.airHz,
    tail: H.tail,
  };
}

/**
 * The k'th rendered tone. The band moves a few cents and the detune widens
 * with it: two renders of a hat are not one cymbal at two pitches, they are
 * two cymbals, and that is `hats.ts`'s own finding carried over.
 */
function hatVariant(spec: DrumSpec, k: number): DrumSpec {
  if (!k) return spec;
  const m = Math.pow(2, (spec.variantCents * k) / 1200);
  return {
    ...spec,
    key: `hit#${k}`,
    base: spec.base * m,
    peakHz: spec.peakHz * m,
    hp: spec.hp * Math.pow(m, 0.5),
    detune: spec.detune * (1 + 0.35 * k),
  };
}

/** The metal and the noise under it, through the tone, at a constant level. */
function hatBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const high = filter(ac, 'highpass', spec.hp, 0.8);
  const band = filter(ac, 'bandpass', spec.peakHz, spec.q);
  const tilt = filter(ac, 'highshelf', 9000, 0.707, spec.tilt);
  const lid = filter(ac, 'lowpass', spec.lidHz, 0.6);
  high.connect(band);
  band.connect(tilt);
  tilt.connect(lid);
  lid.connect(dest);

  const metal = ac.createGain();
  metal.gain.value = spec.metal / spec.ratios.length;
  metal.connect(high);
  if (spec.top > 0) topLadder(ac, spec.ratios, spec.base, spec.detune, topLevel(spec.top, spec.metal, SWAP_K.kit) * spec.ratios.length, metal, at, spec.seconds);
  for (let i = 0; i < spec.ratios.length; i++) {
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = spec.base * spec.ratios[i];
    o.detune.value = spec.detune * (i % 2 ? 1 : -1);
    o.connect(metal);
    o.start(at);
    o.stop(at + spec.seconds);
  }

  const hiss = ac.createGain();
  hiss.gain.value = 1 - spec.metal;
  if (spec.top > 0) {
    const shelf = swapShelf(ac, swapDb(spec.top));
    hiss.connect(shelf);
    shelf.connect(high);
  } else hiss.connect(high);

  const n = drumNoise(ac, spec.seconds + 0.05, 31337 + Math.round(spec.peakHz));
  n.connect(hiss);
  n.start(at);
  n.stop(at + spec.seconds);
  if (spec.air > 0) {
    // the air's own noise, never the hiss's (`hat-grain.ts` says why)
    const own = drumNoise(ac, spec.seconds + 0.05, 7919 + Math.round(spec.peakHz));
    const ownAt = ac.createGain();
    ownAt.gain.value = 1 - spec.metal;
    own.connect(ownAt);
    airPath(ac, ownAt, spec.airHz, spec.air, dest);
    own.start(at);
    own.stop(at + spec.seconds);
  }
}

/**
 * The kit hat topology: a ladder of six squares under a noise bed, struck
 * through the kit (`sounds/noise/hatTight.json`, `hatLoose.json`,
 * `hatSizzle.json` since round R2). All three are the `noise` family for
 * `hats.ts`'s reason and play the H lane's `offbeat`, the lane that already
 * reads the hats layer; the loose one is trimmed at the open hat's level.
 */
export const KIT_HAT = kitTopology({
  id: 'kit-hat',
  cost: 'cheap',
  parameters: PARAMETERS,
  spec: (H) => hatSpec(H),
  variant: hatVariant,
  build: hatBody,
});

export default KIT_HAT;
