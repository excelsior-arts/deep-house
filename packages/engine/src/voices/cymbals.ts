// A ride and a crash: the two cymbals, which are not two hats.
//
// Round K3 of PLAN-KITCHEN. A hat is a pair of small discs damped by a foot
// and everything about it is short. A cymbal is a large disc that is not
// damped at all, and the two things that follow from that are the whole of the
// difference:
//
//   it is long    a ride washes for a second and a half and a crash for
//                 three, so the body rendered for them is that long and the
//                 hit's envelope is what decides how much of it is heard. It
//                 is also why they are two variants and not three: a three
//                 second stereo body is a megabyte and the spread is carried
//                 by the rate, the gain, the decay and the pan besides.
//   it has a bell a ride's ratios are *lower* than a hat's and there is a
//                 tuned centre under them. `p.hit: 'bell'` is the same
//                 instrument struck a foot further in: the ping is up, the
//                 wash is down and the decay is longer, which is what a ride
//                 bell is. A sampler needs two files for that; here it is
//                 three numbers.
//
// The crash is the same builder with a wider ladder, more noise and no ping —
// and it is the kitchen's one `texture` instrument, because what a crash does
// in an arrangement is mark a section and not keep a rhythm. That puts it on
// the F lane, which is the lane the seam glue already lives on, and its level
// is the glue's own.
//
// Registered and reachable by nothing: no candidate list of any style names
// either of them and `plays` is null, so no arrangement gates them.

import { kitTopology, drumNoise, filter, tuned, transient, KIT } from './drumkit.ts';
import { contract, list, num, CENTS, DB, HZ, LEVEL, Q, RATIO, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { DrumSpec } from './drumkit.ts';
import type { NoteParams } from './descriptor.ts';

/** The settings block one cymbal is made out of: the ride's or the crash's. */
/**
 * What a row of this topology carries, each in its range (`schema.ts`). The
 * ratios' level is shared among them, so there is at least one; a ping is
 * built only where its level is above nought, and then it needs a pitch.
 */
const PARAMETERS = contract({
  ratios: list(RATIO, 1, 16),
  base: HZ, detune: CENTS, metal: UNIT, hp: HZ, peakHz: HZ, q: Q, tilt: DB, lidHz: HZ,
  pingHz: num(0, 24000), pingLevel: LEVEL, pingDecay: SECONDS,
  bellPing: LEVEL, bellWash: LEVEL, bellRing: RATIO,
  t10: KIT.t10, seconds: KIT.seconds, variants: KIT.variants, variantCents: KIT.variantCents, attack: KIT.attack,
  trim: KIT.trim, rateSpread: KIT.rateSpread, gainSpread: KIT.gainSpread, decaySpread: KIT.decaySpread,
  panSpread: KIT.panSpread, velBright: KIT.velBright, velDecay: KIT.velDecay, pan: KIT.pan, room: KIT.room,
}, (c) => ((c.pingLevel > 0 || c.pingLevel * c.bellPing > 0) && !(c.pingHz > 0) ? [`a ping at ${c.pingLevel} with no pitch (pingHz ${c.pingHz})`] : []));
type CymbalSettings = PatchOf<typeof PARAMETERS.fields>;

function cymbalSpec(C: CymbalSettings, p: NoteParams): DrumSpec {
  const bell = p.hit === 'bell';
  return {
    key: bell ? 'bell' : 'wash',
    seconds: C.seconds,
    channels: 1,
    variants: C.variants,
    variantCents: C.variantCents,
    ratios: C.ratios,
    base: C.base,
    detune: C.detune,
    metal: C.metal,
    hp: C.hp,
    peakHz: C.peakHz,
    q: C.q,
    tilt: C.tilt,
    lidHz: C.lidHz,
    // The ping: a tuned centre with a fast drop, gone while the wash carries
    // on. A crash declares none and the builder simply does not make one.
    pingHz: C.pingHz,
    pingLevel: bell ? C.pingLevel * C.bellPing : C.pingLevel,
    pingDecay: bell ? C.pingDecay * 2.2 : C.pingDecay,
    washLevel: bell ? C.bellWash : 1,
    t10: bell ? C.t10 * C.bellRing : C.t10,
    attack: C.attack,
    trim: C.trim,
    rateSpread: C.rateSpread,
    gainSpread: C.gainSpread,
    decaySpread: C.decaySpread,
    panSpread: C.panSpread,
    velBright: C.velBright,
    velDecay: C.velDecay,
    pan: C.pan,
    room: C.room,
  };
}

function cymbalVariant(spec: DrumSpec, k: number): DrumSpec {
  if (!k) return spec;
  const m = Math.pow(2, (spec.variantCents * k) / 1200);
  return {
    ...spec,
    key: `${spec.key}#${k}`,
    base: spec.base * m,
    peakHz: spec.peakHz * m,
    pingHz: spec.pingHz * (1 - 0.03 * k),
    detune: spec.detune * (1 + 0.4 * k),
  };
}

function cymbalBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const high = filter(ac, 'highpass', spec.hp, 0.8);
  const band = filter(ac, 'bandpass', spec.peakHz, spec.q);
  const tilt = filter(ac, 'highshelf', 9000, 0.707, spec.tilt);
  const lid = filter(ac, 'lowpass', spec.lidHz, 0.6);
  high.connect(band);
  band.connect(tilt);
  tilt.connect(lid);
  lid.connect(dest);

  const wash = ac.createGain();
  wash.gain.value = spec.washLevel;
  wash.connect(high);

  const metal = ac.createGain();
  metal.gain.value = spec.metal / spec.ratios.length;
  metal.connect(wash);
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
  hiss.connect(wash);
  const n = drumNoise(ac, spec.seconds + 0.05, 60013 + Math.round(spec.peakHz));
  n.connect(hiss);
  n.start(at);
  n.stop(at + spec.seconds);

  // The ping, past the ladder's own filters: a bell is a tone and the band
  // that makes the wash a wash would throw most of it away.
  if (spec.pingLevel > 0) {
    const ping = ac.createGain();
    ping.gain.value = 1;
    transient(ac, ping, spec.pingDecay, dest, at, spec.pingLevel);
    tuned(ac, { type: 'sine', hz: spec.pingHz, from: 1.02, over: 0.02, level: 0.7 }, ping, at, spec.seconds);
    tuned(ac, { type: 'triangle', hz: spec.pingHz * 2.41, level: 0.25 }, ping, at, spec.seconds);
  }
}

/**
 * The cymbal topology: the ladder with a ping and a bell, struck through the
 * kit (`sounds/noise/ride.json`, `crash.json` since round R2).
 */
export const CYMBAL = kitTopology({
  id: 'cymbal',
  cost: 'mid',
  parameters: PARAMETERS,
  spec: cymbalSpec,
  variant: cymbalVariant,
  build: cymbalBody,
});

export default CYMBAL;
