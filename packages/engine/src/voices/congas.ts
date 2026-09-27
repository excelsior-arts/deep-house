// Congas and bongos: a tuned head, struck open or slapped.
//
// Round K3 of PLAN-KITCHEN, and the first of the kitchen's hand percussion.
// The record has a kick, a clap and a hat line and nothing that is *played* —
// everything above the bottom arrives on a grid, at one level, on a sixteenth.
// A conga is the opposite of that: two tunings, two articulations, and a
// player who never hits the same spot twice.
//
// The shape, and where each piece of it comes from:
//
//   the head    one sine at the tuning with a pitch drop of about four
//               semitones over forty-five milliseconds. The drop is the
//               instrument: a struck head is tightest at the instant it is hit
//               and the pitch falls as the skin lets go, and a tuned drum
//               without one is an organ pipe with an envelope on it.
//   the mode    a second partial a sixth above the fundamental — 1.62, which
//               is near enough the first circular membrane mode and far enough
//               from 1.5 that the two do not lock into a fifth — decaying much
//               faster than the head under it. That relative decay is baked
//               into the body and the overall decay is not, which is the
//               kitchen's own split (`drumkit.ts`).
//   the slap    a short burst of band-passed noise where the hand lands. It is
//               the whole difference between the two articulations: an open
//               tone is nearly all head and rings for a sixth of a second, a
//               slap is nearly all hand and is gone in a twentieth.
//   the spread  three rendered tones a few cents apart whose modes beat
//               differently, and a rate, gain, decay and pan off the strike
//               time. A conga line played from one buffer is a machine gun,
//               and a listener hears that before they hear the pitch.
//
// **Two instruments and one sound.** The bongo is the same builder against its
// own settings block: smaller heads, higher, drier, a harder slap. `p.tuning`
// is `'high'` or `'low'` — a pair is two drums and a player has both hands —
// and `p.hit` is `'open'` or `'slap'`.
//
// Style lane palettes decide when these players are reachable. Their shared
// level belongs to the percussion layer; a voice never chooses its own groove.

import { strike, warmDrums, drumNoise, filter, tuned, transient } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import type { VoiceOut } from '../dsp.ts';
import { noteControl } from './descriptor.ts';
import type { Controls, Descriptor, NoteParams } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/** The settings block one membrane drum is made out of: the conga's or the bongo's. */
type MembraneSettings = Settings['conga'] | Settings['bongo'];

// Optional note controls, shared by both membrane players. Named colours live
// in the style, not in this renderer, and so do their levels: the style trims
// each colour with its own measured `gainDb`. Omitting them preserves the
// original body. None has one default — every one is the drum's, the tuning's
// and the stroke's own number (`membraneSpec`) until a note sets it.
const range = (unit: 'hz' | 'seconds' | 'ratio' | 'level', min: number, max: number) => ({ unit, min, max, default: null });
export const MEMBRANE_CONTROLS: Controls = {
  headHz: range('hz', 100, 500), bend: range('ratio', 1, 1.4), bendSeconds: range('seconds', .004, .08),
  headCutoff: range('hz', 700, 6000), headLevel: range('level', .1, .8),
  modeRatio: range('ratio', 1.3, 1.9), modeLevel: range('level', 0, .65), modeDecay: range('seconds', .015, .35),
  skin: range('level', 0, 1), handLevel: range('level', 0, 1.5), handHz: range('hz', 700, 6000),
  handDecay: range('seconds', .004, .06), damping: range('seconds', .035, .28),
};

/** The controls a note sets, each taken into its range; one that is not a number is left out. */
export function membraneControls(p: NoteParams): Record<string, number> {
  const controls: Record<string, number> = {};
  for (const key of Object.keys(MEMBRANE_CONTROLS)) {
    const v = noteControl(p, MEMBRANE_CONTROLS, key);
    if (v !== undefined) controls[key] = v;
  }
  return controls;
}

/** Everything fixed about one hit of a membrane drum, out of its own block. */
export function membraneSpec(C: MembraneSettings, p: NoteParams): DrumSpec {
  const low = (p.tuning ?? p.size) === 'low';
  const slap = p.hit === 'slap';
  const spec: DrumSpec = {
    key: `${low ? 'low' : 'high'}:${slap ? 'slap' : 'open'}`,
    seconds: C.seconds,
    channels: 1,
    variants: C.variants,
    variantCents: C.variantCents,
    hz: low ? C.lowHz : C.highHz,
    mode: C.mode,
    modeLevel: slap ? C.modeLevel * 1.4 : C.modeLevel,
    modeDecay: C.modeDecay,
    drop: C.drop,
    dropTime: C.dropTime,
    bodyLevel: slap ? C.bodyLevel * C.slapBody : C.bodyLevel,
    bodyLp: C.bodyLp,
    slapHz: slap ? C.slapHzHard : C.slapHz,
    slapQ: C.slapQ,
    slapDecay: slap ? C.slapDecay * 1.6 : C.slapDecay,
    slapLevel: slap ? C.slapHard : C.slapOpen,
    t10: (slap ? C.t10Slap : C.t10Open) * (low ? C.lowRing : 1),
    attack: C.attack,
    trim: C.trim,
    rateSpread: C.rateSpread,
    gainSpread: C.gainSpread,
    decaySpread: C.decaySpread,
    panSpread: C.panSpread,
    velBright: C.velBright,
    velDecay: C.velDecay,
    pan: low ? -C.pan : C.pan,
    room: C.room,
  };
  const controls = membraneControls(p);
  if (!Object.keys(controls).length) return spec;
  const fields: Record<string, string> = { headHz:'hz', bend:'drop', bendSeconds:'dropTime',
    headCutoff:'bodyLp', headLevel:'bodyLevel', modeRatio:'mode', modeLevel:'modeLevel',
    modeDecay:'modeDecay', skin:'skin', handLevel:'slapLevel', handHz:'slapHz',
    handDecay:'slapDecay', damping:'t10' };
  for (const [key, value] of Object.entries(controls)) spec[fields[key]] = value;
  // Include every resolved field: two colours (or settings tables) in one
  // context must never borrow each other's cached body. Bound the longest tail.
  spec.seconds = Math.max(spec.seconds, spec.t10 * 5);
  spec.key += `:${JSON.stringify(spec)}`;
  return spec;
}

/**
 * The k'th rendered tone. A variant is not the same drum a little detuned: the
 * head moves by a few cents and the mode moves the other way, so the two beat
 * against each other differently — which is what a second drum in a pair
 * actually is.
 */
function membraneVariant(spec: DrumSpec, k: number): DrumSpec {
  if (!k) return spec;
  const m = Math.pow(2, (spec.variantCents * k) / 1200);
  return {
    ...spec,
    key: `${spec.key}#${k}`,
    hz: spec.hz * m,
    mode: spec.mode * (1 - 0.035 * k),
    slapHz: spec.slapHz * (1 + 0.06 * k),
  };
}

/** The body: the head, the mode over it, the hand on top. Constant overall level. */
function membraneBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const lp = filter(ac, 'lowpass', spec.bodyLp, 0.6);
  lp.connect(dest);

  tuned(ac, { type: 'sine', hz: spec.hz, from: spec.drop, over: spec.dropTime, level: spec.bodyLevel }, lp, at, spec.seconds);

  // The mode dies away under a head that is still ringing, so it is a
  // transient inside the body rather than a second voice beside it.
  const mode = tuned(ac, {
    type: spec.skin ? 'sine' : 'triangle', hz: spec.hz * spec.mode,
    from: spec.skin ? spec.drop : spec.drop * 1.06, over: spec.dropTime * 1.4, level: 1,
  }, ac.createGain(), at, spec.seconds);
  transient(ac, mode, spec.modeDecay, lp, at, spec.modeLevel);

  // Additional, rapidly damped modes give the optional skin colours a less
  // pure pitched body. These are authored synthesis colours, not fitted drums.
  if (spec.skin) for (const [ratio, level, decay] of [[2.14,.23,.65],[2.65,.13,.4]]) {
    const overtone = tuned(ac, { type:'sine', hz:spec.hz*ratio,
      from:1+(spec.drop-1)*.4, over:spec.dropTime, level:1 }, ac.createGain(), at, spec.seconds);
    transient(ac, overtone, spec.modeDecay*decay, lp, at, spec.skin*level);
  }

  // The hand. A bandpass, whose `Q` really is a quality factor, and a burst
  // that is gone before the head has finished falling.
  const band = filter(ac, 'bandpass', spec.slapHz, spec.slapQ);
  transient(ac, band, spec.slapDecay, dest, at, spec.slapLevel);
  const n = drumNoise(ac, spec.slapDecay * 6 + 0.02, 5150 + Math.round(spec.slapHz));
  n.connect(band);
  n.start(at);
  n.stop(at + spec.seconds);
}

const CONGA: DrumInstrument = {
  id: 'conga',
  seed: 11.3,
  spec: (p: NoteParams, settings: Settings) => membraneSpec(settings.conga, p),
  variant: membraneVariant,
  build: membraneBody,
};

const BONGO: DrumInstrument = {
  id: 'bongo',
  seed: 23.9,
  spec: (p: NoteParams, settings: Settings) => membraneSpec(settings.bongo, p),
  variant: membraneVariant,
  build: membraneBody,
};

const INSTS = { conga: CONGA, bongo: BONGO };

export const prepareCongas = (ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[]): Promise<void> =>
  warmDrums(ctx, settings, events, INSTS);

export function conga(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, CONGA, settings, at);
}

export function bongo(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, BONGO, settings, at);
}

/**
 * The two numbers every playable articulation declares about itself, both
 * **MEASURED** and both written by the gate that measures them, never typed
 * (`tools/test-drums.ts --bless`).
 *
 * `loudnessDb` is the instrument alone through the real graph, eight bars of
 * its role's own groove under `tools/fixture.ts`'s table, integrated, less the
 * level that table gave it. `clickStep` is the largest one-sample move a lone
 * hit of it makes: a drum is allowed its own transient — that is what a drum
 * is, and the scenes' click gate is a step *and* a neighbour ratio — so the
 * bound is per instrument, and what the gate holds is that the transient does
 * not grow.
 */
export const CONGA_MEASURED = {
  conga: { loudnessDb: -16, clickStep: 0.0024 },
  congaLow: { loudnessDb: -15.2, clickStep: 0.0018 },
  congaSlap: { loudnessDb: -22.4, clickStep: 0.0001 },
  bongo: { loudnessDb: -18.3, clickStep: 0.0006 },
  bongoSlap: { loudnessDb: -22.9, clickStep: 0 },
};

/**
 * What the two are worth to a meter, as the descriptor's own contract states
 * it. The loudness is the measured table's and not a second copy of it; `hold`
 * is what is still sounding at the bar line and `brightnessHz` is the body's
 * own corner, so neither can drift from the sound.
 */
export const CONGA_TIMBRES = {
  conga: { family: 'drum', struck: true, hold: 0.02, brightnessHz: 2600, loudnessDb: CONGA_MEASURED.conga.loudnessDb },
  bongo: { family: 'drum', struck: true, hold: 0.01, brightnessHz: 3400, loudnessDb: CONGA_MEASURED.bongo.loudnessDb },
};

export const descriptors: Descriptor[] = [
  {
    name: 'conga',
    cost: 'mid',
    family: 'drum',
    roles: ['sixteenth'],
    bus: 'drums',
    level: 'shaker',
    layer: 'shaker',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: prepareCongas,
    render: conga,
    timbres: { conga: CONGA_TIMBRES.conga },
    controls: MEMBRANE_CONTROLS,
    noteControls: Object.keys(MEMBRANE_CONTROLS),
    dispatches: [],
    mood: [],
  },
  {
    name: 'bongo',
    cost: 'mid',
    family: 'drum',
    roles: ['sixteenth'],
    bus: 'drums',
    level: 'shaker',
    layer: 'shaker',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: prepareCongas,
    render: bongo,
    timbres: { bongo: CONGA_TIMBRES.bongo },
    controls: MEMBRANE_CONTROLS,
    noteControls: Object.keys(MEMBRANE_CONTROLS),
    dispatches: [],
    mood: [],
  },
];
