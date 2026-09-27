// The small percussion: a cabasa, a tambourine, a cowbell and a woodblock.
//
// Round K3 of PLAN-KITCHEN. Four instruments that are each one idea, and they
// are in one module because the idea in each case is a *filter* and not a
// synthesiser — what separates them is where the energy is and how long it
// stays there, which is four numbers and not four architectures.
//
//   the cabasa      two bursts of high noise five milliseconds apart, through
//                   a broad band at 6 kHz. The double burst is the instrument:
//                   the beads land on the way out and again on the way back,
//                   and a single burst is a hat with the metal taken out.
//   the tambourine  the same burst under a **jingle band** — five inharmonic
//                   squares between 6 and 11 kHz — with a shimmer that
//                   outlasts the strike by a quarter of a second. The jingles
//                   are what makes it a tambourine and not a bright shaker,
//                   and they are inharmonic for the hat's reason: nothing here
//                   is a whole-number multiple of anything else.
//   the cowbell     two detuned squares at 540 and 800 Hz through a bandpass.
//                   It is the oldest trick in this file and the most exact:
//                   the two are a minor sixth and a half apart, so they beat
//                   into something with no pitch at all, which is why a cowbell
//                   sits in a key it was never tuned to.
//   the woodblock   a short resonant click: one bandpass at 1.4 kHz with a
//                   real quality factor of twelve, struck with noise. A
//                   resonator rung by a burst *is* a woodblock, and the Q is
//                   the block's own hardness.
//
// All four are the kitchen's ordinary shape — pre-rendered per variant,
// velocity on the rate and the decay, five dice off the strike time — and none
// of them is reachable by any die.

import { strike, warmDrums, drumNoise, filter, tuned, transient } from './drumkit.ts';
import type { DrumInstrument, DrumSpec } from './drumkit.ts';
import { GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';

/** The four settings blocks this module reads, as the one union `common` walks. */
type PercBlock = Settings['cabasa'] | Settings['tambourine'] | Settings['cowbell'] | Settings['woodblock'];

/** The knobs every one of the four shares, off its own block. */
const common = (P: PercBlock) => ({
  key: 'hit',
  seconds: P.seconds,
  channels: 1,
  variants: P.variants,
  variantCents: P.variantCents,
  t10: P.t10,
  attack: P.attack,
  trim: P.trim,
  rateSpread: P.rateSpread,
  gainSpread: P.gainSpread,
  decaySpread: P.decaySpread,
  panSpread: P.panSpread,
  velBright: P.velBright,
  velDecay: P.velDecay,
  pan: P.pan,
  room: P.room ?? 0,
});

// --- the cabasa -------------------------------------------------------------

const cabasaSpec = (P: Settings['cabasa']): DrumSpec => ({ ...common(P), hz: P.peakHz, q: P.q, hp: P.hp, gapSeconds: P.gapSeconds, second: P.second });

const shakerVariant = (spec: DrumSpec, k: number): DrumSpec => (k ? {
  ...spec,
  key: `hit#${k}`,
  hz: spec.hz * Math.pow(2, (spec.variantCents * k) / 1200),
  gapSeconds: spec.gapSeconds * (1 + 0.25 * k),
} : spec);

function cabasaBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const hp = filter(ac, 'highpass', spec.hp, 0.707);
  const band = filter(ac, 'bandpass', spec.hz, spec.q);
  hp.connect(band);
  band.connect(dest);
  for (const [off, level] of [[0, 1], [spec.gapSeconds, spec.second]]) {
    const n = drumNoise(ac, spec.seconds, 8191 + Math.round(off * 1e5));
    const g = ac.createGain();
    g.gain.value = level;
    n.connect(g);
    g.connect(hp);
    n.start(at + off);
    n.stop(at + spec.seconds);
  }
}

// --- the tambourine ---------------------------------------------------------

const tambSpec = (P: Settings['tambourine']): DrumSpec => ({ ...common(P), hz: P.peakHz, q: P.q, hp: P.hp, ratios: P.ratios, jingleHz: P.jingleHz, jingleLevel: P.jingleLevel, skinHz: P.skinHz, skinLevel: P.skinLevel, skinDecay: P.skinDecay });

const tambVariant = (spec: DrumSpec, k: number): DrumSpec => (k ? {
  ...spec,
  key: `hit#${k}`,
  jingleHz: spec.jingleHz * Math.pow(2, (spec.variantCents * k) / 1200),
  hz: spec.hz * (1 + 0.04 * k),
} : spec);

function tambBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const hp = filter(ac, 'highpass', spec.hp, 0.707);
  const band = filter(ac, 'bandpass', spec.hz, spec.q);
  hp.connect(band);
  band.connect(dest);

  const n = drumNoise(ac, spec.seconds, 4093);
  n.connect(hp);
  n.start(at);
  n.stop(at + spec.seconds);

  // The jingles: five inharmonic pairs, each detuned against itself, so what
  // rings on is a shimmer and not a chord.
  const jingles = ac.createGain();
  jingles.gain.value = spec.jingleLevel / spec.ratios.length;
  jingles.connect(dest);
  for (let i = 0; i < spec.ratios.length; i++) {
    for (const side of [-1, 1]) {
      const o = ac.createOscillator();
      o.type = 'square';
      o.frequency.value = spec.jingleHz * spec.ratios[i];
      o.detune.value = side * 9;
      const g = ac.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(jingles);
      o.start(at);
      o.stop(at + spec.seconds);
    }
  }

  // The skin, which is the one thing a tambourine has that a jingle stick does
  // not: a low thud where the hand lands, gone in twenty milliseconds.
  const skin = filter(ac, 'bandpass', spec.skinHz, 1.2);
  transient(ac, skin, spec.skinDecay, dest, at, spec.skinLevel);
  const s = drumNoise(ac, spec.skinDecay * 8 + 0.02, 2053);
  s.connect(skin);
  s.start(at);
  s.stop(at + spec.seconds);
}

// --- the cowbell ------------------------------------------------------------

const bellSpec = (P: Settings['cowbell']): DrumSpec => ({ ...common(P), lowHz: P.lowHz, highHz: P.highHz, detune: P.detune, band: P.band, q: P.q, hp: P.hp });

const bellVariant = (spec: DrumSpec, k: number): DrumSpec => (k ? {
  ...spec,
  key: `hit#${k}`,
  lowHz: spec.lowHz * Math.pow(2, (spec.variantCents * k) / 1200),
  highHz: spec.highHz * Math.pow(2, (-spec.variantCents * k) / 1200),
  detune: spec.detune * (1 + 0.4 * k),
} : spec);

function bellBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  const hp = filter(ac, 'highpass', spec.hp, 0.707);
  const band = filter(ac, 'bandpass', spec.band, spec.q);
  hp.connect(band);
  band.connect(dest);
  for (const [hz, level] of [[spec.lowHz, 0.6], [spec.highHz, 0.5]]) {
    tuned(ac, { type: 'square', hz, level, detune: spec.detune }, hp, at, spec.seconds);
  }
}

// --- the woodblock ----------------------------------------------------------

const blockSpec = (P: Settings['woodblock']): DrumSpec => ({ ...common(P), hz: P.hz, q: P.q, second: P.second, secondHz: P.secondHz, strikeDecay: P.strikeDecay, boost: P.boost });

const blockVariant = (spec: DrumSpec, k: number): DrumSpec => (k ? {
  ...spec,
  key: `hit#${k}`,
  hz: spec.hz * Math.pow(2, (spec.variantCents * k) / 1200),
  secondHz: spec.secondHz * (1 - 0.04 * k),
} : spec);

function blockBody(ac: BaseAudioContext, spec: DrumSpec, dest: AudioNode, at: number): void {
  // Two resonators rung by one burst. A real quality factor of twelve on a
  // bandpass is a body that rings for about as many cycles, which at 1.4 kHz
  // is the ten milliseconds a block is.
  const n = drumNoise(ac, spec.strikeDecay * 10 + 0.02, 6151);
  const burst = ac.createGain();
  burst.gain.setValueAtTime(1, at);
  burst.gain.exponentialRampToValueAtTime(0.0001, at + spec.strikeDecay);
  n.connect(burst);
  n.start(at);
  n.stop(at + spec.seconds);
  for (const [hz, level] of [[spec.hz, spec.boost], [spec.secondHz, spec.boost * spec.second]]) {
    const band = filter(ac, 'bandpass', hz, spec.q);
    const g = ac.createGain();
    g.gain.value = level;
    burst.connect(band);
    band.connect(g);
    g.connect(dest);
  }
}

// --- the four ---------------------------------------------------------------

const CABASA: DrumInstrument = { id: 'cabasa', seed: 113.9, spec: (p, s) => cabasaSpec(s.cabasa), variant: shakerVariant, build: cabasaBody };
const TAMB: DrumInstrument = { id: 'tambourine', seed: 127.3, spec: (p, s) => tambSpec(s.tambourine), variant: tambVariant, build: tambBody };
const COWBELL: DrumInstrument = { id: 'cowbell', seed: 139.7, spec: (p, s) => bellSpec(s.cowbell), variant: bellVariant, build: bellBody };
const BLOCK: DrumInstrument = { id: 'woodblock', seed: 149.1, spec: (p, s) => blockSpec(s.woodblock), variant: blockVariant, build: blockBody };

const INSTS = { cabasa: CABASA, tambourine: TAMB, cowbell: COWBELL, woodblock: BLOCK };

export const preparePerc = (ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[]): Promise<void> =>
  warmDrums(ctx, settings, events, INSTS);

export function cabasa(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, CABASA, settings, at);
}
export function tambourine(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, TAMB, settings, at);
}
export function cowbell(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, COWBELL, settings, at);
}
export function woodblock(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number {
  return strike(ctx, out, time, p, BLOCK, settings, at);
}

/** MEASURED, all four, and written by `tools/test-drums.ts --bless`. */
export const PERC_MEASURED = {
  cabasa: { loudnessDb: -18.6, clickStep: 0 },
  tambourine: { loudnessDb: -19, clickStep: 0 },
  cowbell: { loudnessDb: -19.3, clickStep: GAIN_FLOOR },
  woodblock: { loudnessDb: -30.1, clickStep: 0 },
};

/** What the four are worth to a meter. */
export const PERC_TIMBRES = {
  cabasa: { family: 'noise', struck: true, hold: 0, brightnessHz: 6000, loudnessDb: PERC_MEASURED.cabasa.loudnessDb },
  tambourine: { family: 'noise', struck: true, hold: 0.03, brightnessHz: 7500, loudnessDb: PERC_MEASURED.tambourine.loudnessDb },
  cowbell: { family: 'drum', struck: true, hold: 0.01, brightnessHz: 2600, loudnessDb: PERC_MEASURED.cowbell.loudnessDb },
  woodblock: { family: 'drum', struck: true, hold: 0, brightnessHz: 1400, loudnessDb: PERC_MEASURED.woodblock.loudnessDb },
};

/**
 * The four, on the sixteenth role and the shaker layer — which is the layer
 * this record's own sixteenth already writes, so the H lane reads them and no
 * layer lands in two lanes.
 */
export const descriptors: Descriptor[] = [
  {
    name: 'cabasa',
    cost: 'mid',
    family: 'noise',
    roles: ['sixteenth'],
    bus: 'drums',
    level: 'shaker',
    layer: 'shaker',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: preparePerc,
    render: cabasa,
    timbres: { cabasa: PERC_TIMBRES.cabasa },
    dispatches: [],
    mood: [],
  },
  {
    name: 'tambourine',
    cost: 'mid',
    family: 'noise',
    roles: ['sixteenth'],
    bus: 'drums',
    level: 'shaker',
    layer: 'shaker',
    plays: null,
    mono: false,
    treat: false,
    anticipates: null,
    prepare: preparePerc,
    render: tambourine,
    timbres: { tambourine: PERC_TIMBRES.tambourine },
    dispatches: [],
    mood: [],
  },
  {
    name: 'cowbell',
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
    prepare: preparePerc,
    render: cowbell,
    timbres: { cowbell: PERC_TIMBRES.cowbell },
    dispatches: [],
    mood: [],
  },
  {
    name: 'woodblock',
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
    prepare: preparePerc,
    render: woodblock,
    timbres: { woodblock: PERC_TIMBRES.woodblock },
    dispatches: [],
    mood: [],
  },
];
