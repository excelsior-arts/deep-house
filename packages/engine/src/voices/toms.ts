// Toms: one instrument, three sizes, and a pitch drop that is the whole sound.
//
// Round K3 of PLAN-KITCHEN. A tom is the conga's arithmetic with the hand
// taken off it and the drop made twice as deep: no slap, a much darker lid, a
// head that falls most of an octave in eighty milliseconds, and a second mode
// close enough to the fundamental to thicken it rather than ring over it.
// Three sizes — `p.size` is `'high'`, `'mid'` or `'low'` — because a fill is
// three drums and a tom on its own is a sound effect.
//
// The declared numbers are measured on the middle size, the way the FM bell's
// are measured on its default tone: it is the one a fill starts on and the
// other two are a fifth either side of it.
//
// Registered and reachable by nothing.

import { strike, warmDrums, drumNoise, filter, tuned, transient } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

function tomSpec(T: Settings['tom'], p: NoteParams): DrumSpec {
  const size = p.size === 'high' || p.size === 'low' ? p.size : 'mid';
  const hz = T.hz[size as keyof typeof T.hz];
  return {
    key: size,
    seconds: T.seconds,
    channels: 1,
    variants: T.variants,
    variantCents: T.variantCents,
    hz,
    mode: T.mode,
    modeLevel: T.modeLevel,
    modeDecay: T.modeDecay,
    drop: T.drop,
    dropTime: T.dropTime,
    bodyLevel: T.bodyLevel,
    bodyLp: T.bodyLp,
    stickHz: T.stickHz,
    stickQ: T.stickQ,
    stickDecay: T.stickDecay,
    stickLevel: T.stickLevel,
    // A bigger drum rings longer, and it is arithmetic off the tuning rather
    // than three numbers somebody keeps in step: the ratio to the middle size,
    // to the power the measurement of a membrane gives.
    t10: T.t10 * Math.pow(T.hz.mid / hz, T.ringPower),
    attack: T.attack,
    trim: T.trim,
    rateSpread: T.rateSpread,
    gainSpread: T.gainSpread,
    decaySpread: T.decaySpread,
    panSpread: T.panSpread,
    velBright: T.velBright,
    velDecay: T.velDecay,
    // The three stand where a kit puts them: the high one to the right of the
    // player, the floor tom to the left.
    pan: size === 'high' ? T.pan : size === 'low' ? -T.pan : T.pan * 0.3,
    room: T.room,
  };
}

function tomVariant(spec: DrumSpec, k: number): DrumSpec {
  if (!k) return spec;
  const m = Math.pow(2, (spec.variantCents * k) / 1200);
  return {
    ...spec,
    key: `${spec.key}#${k}`,
    hz: spec.hz * m,
    mode: spec.mode * (1 - 0.03 * k),
    stickHz: spec.stickHz * (1 + 0.08 * k),
  };
}

function tomBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const lp = filter(ac, 'lowpass', spec.bodyLp, 0.6);
  lp.connect(dest);

  tuned(ac, { type: 'sine', hz: spec.hz, from: spec.drop, over: spec.dropTime, level: spec.bodyLevel }, lp, at, spec.seconds);

  const mode = tuned(ac, {
    type: 'sine', hz: spec.hz * spec.mode, from: spec.drop * 1.1, over: spec.dropTime * 0.7, level: 1,
  }, ac.createGain(), at, spec.seconds);
  transient(ac, mode, spec.modeDecay, lp, at, spec.modeLevel);

  // The stick, and it is quiet: a tom struck with a felt beater is nearly all
  // head, and a tom whose attack reads over the kit is a rototom.
  const band = filter(ac, 'bandpass', spec.stickHz, spec.stickQ);
  transient(ac, band, spec.stickDecay, dest, at, spec.stickLevel);
  const n = drumNoise(ac, spec.stickDecay * 8 + 0.02, 1231 + Math.round(spec.hz));
  n.connect(band);
  n.start(at);
  n.stop(at + spec.seconds);
}

const TOM: DrumInstrument = {
  id: 'tom',
  seed: 103.1,
  spec: (p: NoteParams, settings: Settings) => tomSpec(settings.tom, p),
  variant: tomVariant,
  build: tomBody,
};

export const prepareToms = (ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[]): Promise<void> =>
  warmDrums(ctx, settings, events, { tom: TOM });

export function tom(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, TOM, settings, at);
}

/** MEASURED, on each size, and written by `tools/test-drums.ts --bless`. */
export const TOM_MEASURED = {
  tom: { loudnessDb: -13, clickStep: 0.0008 },
  tomHigh: { loudnessDb: -12.5, clickStep: 0.0006 },
  tomLow: { loudnessDb: -11.6, clickStep: 0.0012 },
};

/** What it is worth to a meter, on the middle size. */
export const TOM_TIMBRES = {
  tom: { family: 'drum', struck: true, hold: 0.03, brightnessHz: 1400, loudnessDb: TOM_MEASURED.tom.loudnessDb },
};

export const descriptor: Descriptor = {
  name: 'tom',
  cost: 'cheap',
  family: 'drum',
  roles: ['sixteenth'],
  bus: 'drums',
  level: 'shaker',
  layer: 'shaker',
  plays: null,
  mono: false,
  treat: false,
  anticipates: null,
  prepare: prepareToms,
  render: tom,
  timbres: TOM_TIMBRES,
  dispatches: [],
  mood: [],
};

export default tom;
