// Two alternative kicks, and neither of them replaces the one this record is
// built on.
//
// Round K3 of PLAN-KITCHEN. `kick.ts` is a **measurement**: a click in the
// mid-50s Hz falling into the mid-40s by 40 ms and settling there, with an
// amplitude envelope given as its -6, -20 and -34 dB times, all of it read off
// two benchmark minutes of the genre. It is the record's floor and nothing
// here touches it, names it or is drawn instead of it. These two are the other
// two things a kick can be, built the same way the machines that made them
// built them, and they are here so that a strategy which is *not* deep house
// has a bottom of its own to reach for:
//
//   `kickLong`   the long drop. A sine from two octaves over the fundamental
//                falling onto it over sixty milliseconds, ringing for the best
//                part of a second, with a click so low it is felt rather than
//                heard. The drop is long enough to be a *pitch* — the ear
//                hears a note going down, which is what a sub kick is — and on
//                a system that cannot reproduce it there is nothing left but
//                the click, which is why the click is there at all.
//   `kickPunch`  the short one. A third of the drop over half the time, a
//                tenth of the ring, a real click in the 2-4 kHz a small
//                speaker lives in, and a touch of drive on the body. It is the
//                kick that cuts through a mix rather than the one that holds
//                it up.
//
// Two things are true of both and are not decoration. They are **mono**, and
// that is a promise about the whole voice: every source is one channel, the
// output is pinned, and the graph's own kick bus is pinned to one channel
// besides (`master.ts` — a second channel arriving at a filter whose state is
// per channel is the click Eugene heard in one earphone in Firefox). And the
// drive on the second one does **not** oversample, which is round G's finding
// carried over: an oversampled shaper is the one thing the two engines do not
// agree about — four decibels between them — and a declared loudness cannot be
// built on a number that changes with the browser.
//
// Registered and reachable by nothing: no candidate list of any style names
// either of them, `plays` is null so no arrangement gates them, and the level
// is the kick's own, which the table already has.

import { saturationCurve } from '../dsp.ts';
import { strike, warmDrums, drumNoise, filter, tuned, transient } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/** The settings block one alternative kick is made out of. */
type AltKickSettings = Settings['kickLong'] | Settings['kickPunch'];

function kickSpec(K: AltKickSettings): DrumSpec {
  return {
    key: 'hit',
    seconds: K.seconds,
    // One channel in the body, two out of the voice: the pin is what makes
    // `mono: true` a fact about the samples rather than about the intention.
    channels: 1,
    variants: K.variants,
    variantCents: K.variantCents,
    hz: K.hz,
    drop: K.drop,
    dropTime: K.dropTime,
    bodyLevel: K.bodyLevel,
    bodyLp: K.bodyLp,
    drive: K.drive,
    clickHz: K.clickHz,
    clickQ: K.clickQ,
    clickDecay: K.clickDecay,
    clickLevel: K.clickLevel,
    t10: K.t10,
    attack: K.attack,
    trim: K.trim,
    rateSpread: K.rateSpread,
    gainSpread: K.gainSpread,
    decaySpread: K.decaySpread,
    // A kick does not move about the stage. Nought, explicitly, and the width
    // gate is what holds it to that.
    panSpread: 0,
    velBright: K.velBright,
    velDecay: K.velDecay,
    pan: 0,
  };
}

/**
 * The k'th rendered tone. A kick's variants are the narrowest in the kitchen —
 * a few cents on the fundamental and a little on the click — because the one
 * thing four to the floor may not do is wander in pitch, and the ear reads a
 * bass drum's tuning far more exactly than a conga's.
 */
function kickVariant(spec: DrumSpec, k: number): DrumSpec {
  if (!k) return spec;
  return {
    ...spec,
    key: `hit#${k}`,
    hz: spec.hz * Math.pow(2, (spec.variantCents * k) / 1200),
    clickHz: spec.clickHz * (1 + 0.06 * k),
  };
}

function kickBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const lp = filter(ac, 'lowpass', spec.bodyLp, 0.6);
  lp.connect(dest);

  let head: AudioNode = lp;
  if (spec.drive > 0) {
    // Gain, then the shaper, then the lowpass above: the gain in front is what
    // "drive" means and what lets the amount be a number rather than a curve
    // rebuilt per hit. `oversample: 'none'` is deliberate and measured — see
    // the head of this file.
    const shaper = ac.createWaveShaper();
    shaper.curve = saturationCurve(spec.drive);
    shaper.oversample = 'none';
    shaper.connect(lp);
    head = shaper;
  }

  tuned(ac, { type: 'sine', hz: spec.hz, from: spec.drop, over: spec.dropTime, level: spec.bodyLevel }, head, at, spec.seconds);

  // The click. One channel, out of this file's own noise, because the shared
  // two-channel buffer is exactly what made a mono kick two channels wide for
  // the five milliseconds of its own click.
  if (spec.clickLevel > 0) {
    const band = filter(ac, 'bandpass', spec.clickHz, spec.clickQ);
    transient(ac, band, spec.clickDecay, dest, at, spec.clickLevel);
    const n = drumNoise(ac, spec.clickDecay * 8 + 0.01, 1009 + Math.round(spec.clickHz));
    n.connect(band);
    n.start(at);
    n.stop(at + spec.seconds);
  }
}

const LONG: DrumInstrument = { id: 'kickLong', seed: 157.3, spec: (p: NoteParams, s: Settings) => kickSpec(s.kickLong), variant: kickVariant, build: kickBody };
const PUNCH: DrumInstrument = { id: 'kickPunch', seed: 167.9, spec: (p: NoteParams, s: Settings) => kickSpec(s.kickPunch), variant: kickVariant, build: kickBody };

const INSTS = { kickLong: LONG, kickPunch: PUNCH };

export const prepareAltKicks = (ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[]): Promise<void> =>
  warmDrums(ctx, settings, events, INSTS);

export function kickLong(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number { return strike(ctx, out, time, p, LONG, settings, at); }
export function kickPunch(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number { return strike(ctx, out, time, p, PUNCH, settings, at); }

/** MEASURED, both, and written by `tools/test-drums.ts --bless`. */
export const ALT_KICK_MEASURED = {
  kickLong: { loudnessDb: -9.6, clickStep: 0.0006 },
  kickPunch: { loudnessDb: -13.4, clickStep: 0 },
};

/** What the two are worth to a meter. */
export const ALT_KICK_TIMBRES = {
  kickLong: { family: 'drum', struck: true, hold: 0.04, brightnessHz: 120, loudnessDb: ALT_KICK_MEASURED.kickLong.loudnessDb },
  kickPunch: { family: 'drum', struck: true, hold: 0, brightnessHz: 220, loudnessDb: ALT_KICK_MEASURED.kickPunch.loudnessDb },
};

/**
 * The two alternatives, on the kick's own bus, layer and level. `mono: true`
 * puts their layer in the suite's mono stem, which is where the measured kick
 * already is, so nothing moves — and the gate holds them to being mono to the
 * sample in both engines, which is the pin.
 */
export const descriptors: Descriptor[] = [
  {
    name: 'kickLong',
    cost: 'cheap',
    family: 'drum',
    roles: ['kick'],
    bus: 'kick',
    level: 'kick',
    layer: 'kick',
    plays: null,
    mono: true,
    treat: false,
    anticipates: null,
    prepare: prepareAltKicks,
    render: kickLong,
    timbres: { kickLong: ALT_KICK_TIMBRES.kickLong },
    dispatches: [],
    mood: [],
  },
  {
    name: 'kickPunch',
    cost: 'cheap',
    family: 'drum',
    roles: ['kick'],
    bus: 'kick',
    level: 'kick',
    layer: 'kick',
    plays: null,
    mono: true,
    treat: false,
    anticipates: null,
    prepare: prepareAltKicks,
    render: kickPunch,
    timbres: { kickPunch: ALT_KICK_TIMBRES.kickPunch },
    dispatches: [],
    mood: [],
  },
];
