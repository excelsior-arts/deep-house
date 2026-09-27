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

import { strike, warmDrums, drumNoise, filter, tuned, transient } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/** The settings block one cymbal is made out of: the ride's or the crash's. */
type CymbalSettings = Settings['ride'] | Settings['crash'];

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

const RIDE: DrumInstrument = {
  id: 'ride',
  seed: 83.5,
  spec: (p: NoteParams, settings: Settings) => cymbalSpec(settings.ride, p),
  variant: cymbalVariant,
  build: cymbalBody,
};

const CRASH: DrumInstrument = {
  id: 'crash',
  seed: 97.7,
  spec: (p: NoteParams, settings: Settings) => cymbalSpec(settings.crash, p),
  variant: cymbalVariant,
  build: cymbalBody,
};

const INSTS = { ride: RIDE, crash: CRASH };

export const prepareCymbals = (ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[]): Promise<void> =>
  warmDrums(ctx, settings, events, INSTS);

export function ride(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, RIDE, settings, at);
}

export function crash(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, CRASH, settings, at);
}

/** MEASURED, both, and written by `tools/test-drums.ts --bless`. */
export const CYMBAL_MEASURED = {
  ride: { loudnessDb: -10, clickStep: 0.2145 },
  rideBell: { loudnessDb: -13, clickStep: 0.1568 },
  crash: { loudnessDb: -10.9, clickStep: 0 },
};

/** What they are worth to a meter. A cymbal is the one struck thing that holds. */
export const CYMBAL_TIMBRES = {
  ride: { family: 'noise', struck: true, hold: 0.08, brightnessHz: 5200, loudnessDb: CYMBAL_MEASURED.ride.loudnessDb },
  crash: { family: 'noise', struck: true, hold: 0.22, brightnessHz: 7000, loudnessDb: CYMBAL_MEASURED.crash.loudnessDb },
};

export const descriptors: Descriptor[] = [
  {
    name: 'ride',
    cost: 'mid',
    family: 'noise',
    roles: ['offbeat'],
    bus: 'drums',
    level: 'hatOpen',
    layer: 'hats',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: prepareCymbals,
    render: ride,
    timbres: { ride: CYMBAL_TIMBRES.ride },
    dispatches: [],
    mood: [],
  },
  {
    // The one `texture` instrument of the kitchen, and the role is the reason
    // its layer and its level are the seam glue's: what a crash does is mark a
    // section, which is the F lane's own job, and the F lane reads the fx
    // layer. A crash on the hats layer would put that layer in two lanes.
    name: 'crash',
    cost: 'cheap',
    family: 'noise',
    roles: ['texture'],
    bus: 'drums',
    level: 'fx',
    layer: 'fx',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: prepareCymbals,
    render: crash,
    timbres: { crash: CYMBAL_TIMBRES.crash },
    dispatches: [],
    mood: [],
  },
];
