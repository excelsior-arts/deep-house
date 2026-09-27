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

import { strike, warmDrums, drumNoise, filter } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams, VoiceCost } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/** The three of them, as the settings name them and as they are named here. */
type HatName = 'hatTight' | 'hatLoose' | 'hatSizzle';

/** One hat's own block: three sets of the same numbers, which is the shelf. */
type HatSettings = Settings[HatName];

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
  hiss.connect(high);
  const n = drumNoise(ac, spec.seconds + 0.05, 31337 + Math.round(spec.peakHz));
  n.connect(hiss);
  n.start(at);
  n.stop(at + spec.seconds);
}

const inst = (id: string, seed: number, block: HatName): DrumInstrument => ({
  id,
  seed,
  spec: (p: NoteParams, settings: Settings) => hatSpec(settings[block]),
  variant: hatVariant,
  build: hatBody,
});

const TIGHT = inst('hatTight', 53.3, 'hatTight');
const LOOSE = inst('hatLoose', 67.9, 'hatLoose');
const SIZZLE = inst('hatSizzle', 71.1, 'hatSizzle');
const INSTS = { hatTight: TIGHT, hatLoose: LOOSE, hatSizzle: SIZZLE };

export const prepareHatsKit = (
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
): Promise<void> => warmDrums(ctx, settings, events, INSTS);

export function hatTight(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
  at?: number,
): number {
  return strike(ctx, out, time, p, TIGHT, settings, at);
}
export function hatLoose(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
  at?: number,
): number {
  return strike(ctx, out, time, p, LOOSE, settings, at);
}
export function hatSizzle(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
  at?: number,
): number {
  return strike(ctx, out, time, p, SIZZLE, settings, at);
}

/** MEASURED, all three, and written by `tools/test-drums.ts --bless`. */
export const HATS_KIT_MEASURED = {
  hatTight: { loudnessDb: -22.9, clickStep: 0 },
  hatLoose: { loudnessDb: -12.9, clickStep: 0.0049 },
  hatSizzle: { loudnessDb: -20.1, clickStep: 0 },
};

/** What they are worth to a meter. `hold` is nought: a hat is gone by the beat. */
export const HATS_KIT_TIMBRES = {
  hatTight: { family: 'noise', struck: true, hold: 0, brightnessHz: 8200, loudnessDb: HATS_KIT_MEASURED.hatTight.loudnessDb },
  hatLoose: { family: 'noise', struck: true, hold: 0.02, brightnessHz: 6600, loudnessDb: HATS_KIT_MEASURED.hatLoose.loudnessDb },
  hatSizzle: { family: 'noise', struck: true, hold: 0.01, brightnessHz: 9500, loudnessDb: HATS_KIT_MEASURED.hatSizzle.loudnessDb },
};

/**
 * The three, in the order they are heard from shortest to longest. All of them
 * are the `noise` family for `hats.ts`'s reason — six inharmonic squares under
 * a band-passed noise bed is what every hat in this engine is — and all of
 * them play the H lane's `offbeat`, which is the lane that already reads the
 * hats layer.
 */
/**
 * MEASURED by `tools/budget.ts`. The three are built from one list, so their
 * cost is a small table beside the list rather than a word inside it — which is
 * how `HATS_KIT_TIMBRES` above already works, and for the same reason: a number
 * measured per instrument belongs per instrument.
 */
export const HATS_KIT_COST: Record<HatName, VoiceCost> = { hatTight: 'cheap', hatLoose: 'mid', hatSizzle: 'cheap' };

export const descriptors: Descriptor[] = (['hatTight', 'hatLoose', 'hatSizzle'] as const).map((name): Descriptor => ({
  name,
  cost: HATS_KIT_COST[name],
  family: 'noise',
  roles: ['offbeat'],
  bus: 'drums',
  level: name === 'hatLoose' ? 'hatOpen' : 'hatClosed',
  layer: 'hats',
  plays: null,
  mono: false,
  treat: false,
  anticipates: null,
  prepare: prepareHatsKit,
  render: { hatTight, hatLoose, hatSizzle }[name],
  timbres: { [name]: HATS_KIT_TIMBRES[name] },
  dispatches: [],
  mood: [],
}));
