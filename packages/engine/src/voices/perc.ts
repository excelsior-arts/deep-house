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

import { kit, kitTopology, drumNoise, filter, tuned, transient, KIT } from './drumkit.ts';
import { contract, list, num, CENTS, HZ, LEVEL, Q, RATIO, SECONDS } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { DrumSpec } from './drumkit.ts';

// What a row of each of the four carries, each in its range (`schema.ts`): the
// kit's shared fields and the instrument's own. A tambourine's jingles share
// one level among their ratios, so there is at least one.
const SHARED = {
  t10: KIT.t10, seconds: KIT.seconds, variants: KIT.variants, variantCents: KIT.variantCents, attack: KIT.attack,
  trim: KIT.trim, rateSpread: KIT.rateSpread, gainSpread: KIT.gainSpread, decaySpread: KIT.decaySpread,
  panSpread: KIT.panSpread, velBright: KIT.velBright, velDecay: KIT.velDecay, pan: KIT.pan, room: KIT.room,
} as const;
const CABASA = contract({ hp: HZ, peakHz: HZ, q: Q, gapSeconds: SECONDS, second: LEVEL, ...SHARED });
const TAMBOURINE = contract({
  hp: HZ, peakHz: HZ, q: Q, ratios: list(RATIO, 1, 16), jingleHz: HZ, jingleLevel: LEVEL, skinHz: HZ, skinLevel: LEVEL,
  skinDecay: SECONDS, ...SHARED,
});
const COWBELL = contract({ lowHz: HZ, highHz: HZ, detune: CENTS, hp: HZ, band: HZ, q: Q, ...SHARED });
/** a woodblock: two resonators rung by one burst, `boost` the first's gain and `second` the other's against it */
const WOODBLOCK = contract({ boost: num(0, 64), hz: HZ, secondHz: HZ, second: LEVEL, q: Q, strikeDecay: SECONDS, ...SHARED });

/** The four patches this module reads, as the one union `common` walks. */
type PercBlock = PatchOf<typeof CABASA.fields> | PatchOf<typeof TAMBOURINE.fields> | PatchOf<typeof COWBELL.fields> | PatchOf<typeof WOODBLOCK.fields>;

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

const cabasaSpec = (P: PatchOf<typeof CABASA.fields>): DrumSpec => ({ ...common(P), hz: P.peakHz, q: P.q, hp: P.hp, gapSeconds: P.gapSeconds, second: P.second });

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

const tambSpec = (P: PatchOf<typeof TAMBOURINE.fields>): DrumSpec => ({ ...common(P), hz: P.peakHz, q: P.q, hp: P.hp, ratios: P.ratios, jingleHz: P.jingleHz, jingleLevel: P.jingleLevel, skinHz: P.skinHz, skinLevel: P.skinLevel, skinDecay: P.skinDecay });

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

const bellSpec = (P: PatchOf<typeof COWBELL.fields>): DrumSpec => ({ ...common(P), lowHz: P.lowHz, highHz: P.highHz, detune: P.detune, band: P.band, q: P.q, hp: P.hp });

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

const blockSpec = (P: PatchOf<typeof WOODBLOCK.fields>): DrumSpec => ({ ...common(P), hz: P.hz, q: P.q, second: P.second, secondHz: P.secondHz, strikeDecay: P.strikeDecay, boost: P.boost });

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
//
// Four builds and four topologies (round R2: `sounds/noise/cabasa.json`,
// `tambourine.json`, `sounds/drum/cowbell.json`, `woodblock.json`), warmed in
// the one pass they always shared. All four play the sixteenth role on the
// shaker layer, which is the layer this record's own sixteenth already writes,
// so the H lane reads them and no layer lands in two lanes.

const PERC = kit();

export const SHAKEN = kitTopology({
  id: 'shaken', cost: 'mid', kit: PERC, spec: cabasaSpec, variant: shakerVariant, build: cabasaBody,
  parameters: CABASA,
});
export const JINGLE = kitTopology({
  id: 'jingle', cost: 'mid', kit: PERC, spec: tambSpec, variant: tambVariant, build: tambBody,
  parameters: TAMBOURINE,
});
export const BELL = kitTopology({
  id: 'bell', cost: 'mid', kit: PERC, spec: bellSpec, variant: bellVariant, build: bellBody,
  parameters: COWBELL,
});
export const BLOCK = kitTopology({
  id: 'block', cost: 'mid', kit: PERC, spec: blockSpec, variant: blockVariant, build: blockBody,
  parameters: WOODBLOCK,
});
