// The kit kick topology: a sine drop with a click, rendered once per variant
// and struck through the drum kit's dice.
//
// Round K3 of PLAN-KITCHEN wrote it as two instruments in one module
// (`kicks-alt.ts`, the long drop and the short punch), built the way the
// machines that made them built them; round R1 made the two rows
// (`sounds/drum/kickLong.json`, `kickPunch.json`) and left the build here.
// `kick.ts` is the record's own topology — a **measurement**, read off two
// benchmark minutes — and nothing here touches it, names it or is drawn
// instead of it. A row of this one is what a strategy that is *not* deep house
// has a bottom of its own to reach for: a sine from `drop` times the
// fundamental falling onto it over `dropTime`, ringing for `t10` x 3.4, with a
// click at `clickHz` (not built at a level of nought) and `drive` on the body.
//
// Two things are true of every row and are not decoration. They are **mono**,
// and that is a promise about the whole voice: every source is one channel,
// the output is pinned, and the graph's own kick bus is pinned to one channel
// besides (`master.ts` — a second channel arriving at a filter whose state is
// per channel is the click heard in one earphone in Firefox). And the
// drive does **not** oversample, which is round G's finding carried over: an
// oversampled shaper is the one thing the two engines do not agree about —
// four decibels between them — and a declared loudness cannot be built on a
// number that changes with the browser.
//
// A row of this topology carries `dice`: its own offset in the strike-time
// dice, so two kicks struck on the same sixteenth are not the same hit twice.
// It stands outside the patch because no room voices it (a row with a `block`
// is voiced through the room's copy of the block, and the block is what the
// settings hash carries).

import { saturationCurve, harmonicWave } from '../dsp.ts';
import { kitTopology, drumNoise, filter, tuned, transient, KIT } from './drumkit.ts';
import { maybe, list, contract, num, HZ, LEVEL, Q, RATIO, SECONDS } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { DrumSpec } from './drumkit.ts';
import type { Topology } from './sound.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). A kick does not move about the stage, so it carries no pan. */
const PARAMETERS = contract({
  hz: HZ,
  drop: RATIO,
  dropTime: SECONDS,
  bodyLevel: LEVEL,
  bodyLp: HZ,
  /** the saturation's amount: nought is clean */
  drive: num(0, 8),
  clickHz: HZ,
  clickQ: Q,
  clickDecay: SECONDS,
  clickLevel: LEVEL,
  /** the skin: a tonal ring over the body (10-06, hands-on: a kick's middle is its head ringing, not noise), two modes at 1 and 1.59 */
  skinHz: maybe(HZ),
  skinLevel: maybe(LEVEL),
  skinDecay: maybe(SECONDS),
  /** the head held and damped (10-06, hands-on: source 8's kick holds near full ~110 ms then is cut, where a decaying sine is a bouncing ball) */
  holdS: maybe(SECONDS),
  releaseS: maybe(SECONDS),
  /** the head's pitch unsteady by this many cents, a new value every 18 ms (about a cycle), so the body is a drum and not a tone */
  wobbleCents: maybe(num(0, 800)),
  /** the head's harmonics over its fundamental, the 2nd up, as levels (10-06, hands-on: source 8's kick body reads h2 -17, h3 -29, h4 -35 dB; a sine through a symmetric drive is all odd harmonics, a hollow bouncing ball) */
  harmonics: maybe(list(LEVEL, 1, 16)),
  t10: KIT.t10, seconds: KIT.seconds, variants: KIT.variants, variantCents: KIT.variantCents, attack: KIT.attack,
  trim: KIT.trim, rateSpread: KIT.rateSpread, gainSpread: KIT.gainSpread, decaySpread: KIT.decaySpread,
  velBright: KIT.velBright, velDecay: KIT.velDecay,
});

/** What a row of this topology carries, as its contract types it. */
export type KitKickPatch = PatchOf<typeof PARAMETERS.fields>;

function kickSpec(K: KitKickPatch): DrumSpec {
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
    skinHz: K.skinHz ?? 0,
    skinLevel: K.skinLevel ?? 0,
    skinDecay: K.skinDecay ?? 0,
    holdS: K.holdS ?? 0,
    releaseS: K.releaseS ?? 0,
    wobbleCents: K.wobbleCents ?? 0,
    harmonics: K.harmonics ?? null,
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

  if ((spec.holdS ?? 0) > 0 || spec.harmonics) {
    // the held head: full for `holdS`, then damped over `releaseS`; its pitch steps down and wobbles
    const o = ac.createOscillator();
    if (spec.harmonics) {
      o.setPeriodicWave(harmonicWave(ac, spec.harmonics as number[]));
    }
    o.frequency.setValueAtTime(spec.hz * spec.drop, at);
    o.frequency.exponentialRampToValueAtTime(spec.hz, at + Math.max(0.002, spec.dropTime));
    if ((spec.wobbleCents ?? 0) > 0) {
      const n = Math.max(2, Math.ceil(spec.seconds / 0.018));
      const curve = new Float32Array(n);
      let r = (Math.round(spec.hz * 1000) % 2147483647) || 1;
      for (let i = 0; i < n; i++) { r = (r * 48271) % 2147483647; curve[i] = ((r / 2147483647) * 2 - 1) * spec.wobbleCents; }
      o.detune.setValueCurveAtTime(curve, at + Math.max(0.002, spec.dropTime), Math.max(0.01, spec.seconds - spec.dropTime - 0.005));
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(spec.bodyLevel, at);
    if ((spec.holdS ?? 0) > 0) {
      g.gain.setValueAtTime(spec.bodyLevel, at + spec.holdS);
      g.gain.exponentialRampToValueAtTime(spec.bodyLevel * 0.001, at + spec.holdS + Math.max(0.005, spec.releaseS ?? 0.04));
    }
    o.connect(g);
    g.connect(head);
    o.start(at);
    o.stop(at + spec.seconds);
  } else {
    tuned(ac, { type: 'sine', hz: spec.hz, from: spec.drop, over: spec.dropTime, level: spec.bodyLevel }, head, at, spec.seconds);
  }

  // The skin: two modes of the head, ringing and falling a little in pitch with the body, each dying on its own.
  if ((spec.skinLevel ?? 0) > 0 && (spec.skinHz ?? 0) > 0) {
    for (const [ratio, lvl] of [[1, 1], [1.59, 0.45]] as const) {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(spec.skinHz * ratio * 1.03, at);
      o.frequency.exponentialRampToValueAtTime(spec.skinHz * ratio, at + Math.max(0.005, spec.dropTime));
      transient(ac, o, spec.skinDecay / ratio, dest, at, spec.skinLevel * lvl);
      o.start(at);
      o.stop(at + spec.seconds);
    }
  }

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

export const KIT_KICK: Topology = kitTopology({
  id: 'kit-kick',
  cost: 'cheap',
  parameters: PARAMETERS,
  spec: (K) => kickSpec(K),
  variant: kickVariant,
  build: kickBody,
});

export default KIT_KICK;
