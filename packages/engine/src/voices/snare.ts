// A snare, and the rim beside it — the backbeat this record has never had.
//
// Round K3 of PLAN-KITCHEN. The catalogue's backbeat is a **clap**: three
// noise bursts a few milliseconds apart in a short bright room, which is a
// room of hands and not a drum. A snare is the other thing entirely, and the
// difference is the one piece a clap has no way to make — a **tuned shell**
// under the noise. Two sines a fifth apart, dropping a little as the head lets
// go, is why a snare has a note in it and a clap does not; the wires under the
// head are the noise, and they ring on after the shell has stopped.
//
// The shape:
//
//   the shell   two sines, 180 and 270 Hz, with a small drop over twenty
//               milliseconds. They are a transient inside the body: the shell
//               is gone in a tenth of a second and the wires are not, which is
//               a snare's whole envelope in one sentence.
//   the wires   noise through a highpass — a snare with its bottom left in is
//               a box — and a broad bandpass about 1.9 kHz, at a constant
//               level, so the overall decay can be the hit's and velocity's.
//   the crack   a second, much narrower and much brighter burst where the
//               stick meets the head, gone in twelve milliseconds. It is what
//               makes a snare audible over a kick, and it is the reason the
//               declared click bound of this instrument is the largest in the
//               kitchen.
//
// The rim is the same builder with three numbers changed and it is a
// different instrument: a stick on the hoop is nearly all crack and a twentieth
// of the shell, so it reads as a *click with a pitch* — a cross-stick, the
// quiet backbeat a house record uses when a snare would be too much.
//
// Registered and reachable by nothing: no candidate list of any style names
// either, `plays` is null, and the level is the clap's own, which the table
// already has.

import { strike, warmDrums, drumNoise, filter, tuned, transient } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/**
 * The two blocks this builder is given. They are one shape with different
 * numbers in it, which is the module's own sentence about the rim: the same
 * builder, three numbers changed, and a different instrument out of it.
 */
type SnareSettings = Settings['snare'] | Settings['rimshot'];

function snareSpec(S: SnareSettings, p: NoteParams): DrumSpec {
  const soft = p.hit === 'ghost';
  return {
    key: soft ? 'ghost' : 'hit',
    seconds: S.seconds,
    channels: 1,
    variants: S.variants,
    variantCents: S.variantCents,
    shellHz: S.shellHz,
    shellFifth: S.shellFifth,
    shellLevel: soft ? S.shellLevel * 0.6 : S.shellLevel,
    shellDecay: S.shellDecay,
    drop: S.drop,
    dropTime: S.dropTime,
    wireHz: S.wireHz,
    wireQ: S.wireQ,
    wireHp: S.wireHp,
    wireLevel: S.wireLevel,
    crackHz: S.crackHz,
    crackQ: S.crackQ,
    crackDecay: S.crackDecay,
    crackLevel: soft ? S.crackLevel * 0.5 : S.crackLevel,
    lidHz: S.lidHz,
    t10: soft ? S.t10 * 0.45 : S.t10,
    attack: S.attack,
    trim: S.trim,
    rateSpread: S.rateSpread,
    gainSpread: S.gainSpread,
    decaySpread: S.decaySpread,
    panSpread: S.panSpread,
    velBright: S.velBright,
    velDecay: S.velDecay,
    pan: S.pan,
    room: S.room,
  };
}

function snareVariant(spec: DrumSpec, k: number): DrumSpec {
  if (!k) return spec;
  const m = Math.pow(2, (spec.variantCents * k) / 1200);
  return {
    ...spec,
    key: `${spec.key}#${k}`,
    shellHz: spec.shellHz * m,
    // The fifth moves the other way, so the two partials of one variant beat
    // against each other differently from the next one's. A shell detuned as a
    // whole is the same drum played back at another speed, which the per-hit
    // rate spread is already doing.
    shellFifth: spec.shellFifth * (1 - 0.02 * k),
    wireHz: spec.wireHz * (1 + 0.07 * k),
    crackHz: spec.crackHz * (1 + 0.05 * k),
  };
}

function snareBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const lid = filter(ac, 'lowpass', spec.lidHz, 0.6);
  lid.connect(dest);

  // The shell, and it is a transient: gone in a tenth of a second under wires
  // that are not.
  const shell = ac.createGain();
  shell.gain.value = 1;
  transient(ac, shell, spec.shellDecay, lid, at, spec.shellLevel);
  tuned(ac, { type: 'sine', hz: spec.shellHz, from: spec.drop, over: spec.dropTime, level: 0.7 }, shell, at, spec.seconds);
  tuned(ac, { type: 'sine', hz: spec.shellHz * spec.shellFifth, from: spec.drop, over: spec.dropTime * 0.8, level: 0.4 }, shell, at, spec.seconds);

  // The wires: a broad band with its bottom taken out, at a constant level.
  const hp = filter(ac, 'highpass', spec.wireHp, 0.707);
  const band = filter(ac, 'bandpass', spec.wireHz, spec.wireQ);
  const wires = ac.createGain();
  wires.gain.value = spec.wireLevel;
  hp.connect(band);
  band.connect(wires);
  wires.connect(lid);

  // The crack, where the stick lands.
  const crack = filter(ac, 'bandpass', spec.crackHz, spec.crackQ);
  transient(ac, crack, spec.crackDecay, lid, at, spec.crackLevel);

  const n = drumNoise(ac, spec.seconds + 0.05, 7919 + Math.round(spec.wireHz));
  n.connect(hp);
  n.connect(crack);
  n.start(at);
  n.stop(at + spec.seconds);
}

const SNARE: DrumInstrument = {
  id: 'snare',
  seed: 37.1,
  spec: (p, settings) => snareSpec(settings.snare, p),
  variant: snareVariant,
  build: snareBody,
};

const RIM: DrumInstrument = {
  id: 'rimshot',
  seed: 43.7,
  spec: (p, settings) => snareSpec(settings.rimshot, p),
  variant: snareVariant,
  build: snareBody,
};

const INSTS = { snare: SNARE, rimshot: RIM };

export const prepareSnare = (
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
): Promise<void> => warmDrums(ctx, settings, events, INSTS);

export function snare(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
  at?: number,
): number {
  return strike(ctx, out, time, p, SNARE, settings, at);
}

export function rimshot(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
  at?: number,
): number {
  return strike(ctx, out, time, p, RIM, settings, at);
}

/** MEASURED, both of them, and written by `tools/test-drums.ts --bless`. */
export const SNARE_MEASURED = {
  snare: { loudnessDb: -21.4, clickStep: 0 },
  snareGhost: { loudnessDb: -23.8, clickStep: 0.0001 },
  rimshot: { loudnessDb: -26, clickStep: 0 },
};

/** What the two are worth to a meter, as the descriptor's contract states it. */
export const SNARE_TIMBRES = {
  snare: { family: 'drum', struck: true, hold: 0.01, brightnessHz: 1900, loudnessDb: SNARE_MEASURED.snare.loudnessDb },
  rimshot: { family: 'drum', struck: true, hold: 0, brightnessHz: 2400, loudnessDb: SNARE_MEASURED.rimshot.loudnessDb },
};

/**
 * The backbeat, twice over. `roles: ['backbeat']` and `layer: 'clap'` are one
 * decision and not two: the rim's C lane is the backbeat's lane and it reads
 * the clap layer, so a backbeat instrument on any other layer would put that
 * layer in two lanes and *the lanes do not cover every event layer exactly
 * once* fails by name. It is round G's one-role finding met from the side a
 * drum meets it from.
 */
export const descriptors: Descriptor[] = [
  {
    name: 'snare',
    cost: 'cheap',
    family: 'drum',
    roles: ['backbeat'],
    bus: 'drums',
    level: 'clap',
    layer: 'clap',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: prepareSnare,
    render: snare,
    timbres: { snare: SNARE_TIMBRES.snare },
    dispatches: [],
    mood: [],
  },
  {
    name: 'rimshot',
    cost: 'cheap',
    family: 'drum',
    roles: ['backbeat'],
    bus: 'drums',
    level: 'clap',
    layer: 'clap',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: prepareSnare,
    render: rimshot,
    timbres: { rimshot: SNARE_TIMBRES.rimshot },
    dispatches: [],
    mood: [],
  },
];
