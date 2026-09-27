// Three more FM voices, and between them the three things two operators can be.
//
// Round K2 put one FM voice in this engine and said what makes it work: *the
// whole of what makes it metal is one number — a ratio that is not a whole
// number.* These three are the corners of that statement.
//
//   `fmGlass`   **three operators and not two**, which is the one structural
//               difference in the file. A second modulator at a ratio of its
//               own, modulating the *first* modulator, makes partials at every
//               sum and difference of two inharmonic series instead of one — so
//               where the bell has a handful of clear inharmonic partials, this
//               has a haze of them and reads as glass rather than as metal. It
//               is also why its index has to fall faster: a haze that rings for
//               two seconds is noise.
//   `fmEp`      the ratio put back on a **whole number**, which is what makes
//               an electric piano rather than a bell: a modulator at 1x gives
//               odd and even harmonics of the note itself, so the result is
//               pitched and warm. What makes it an *electric* piano is the
//               second layer — a short, high, inharmonic tine at 14x, three
//               hundredths of a second long, which is the hammer on the metal.
//               The catalogue has an `ep` patch already, in `keys.ts`, and it
//               is one operator at a fixed index; this is the two-layer one.
//   `fmPluck`   the same two operators with the index gone in fifty
//               milliseconds and the carrier gone in two hundred, at a ratio of
//               7 — which is far enough out that the attack is a *click* with a
//               pitch in it rather than a note with a bright start.
//
// The index is velocity's in all three, for round K2's reason: a struck thing
// hit harder is brighter and not merely louder, and that is the whole of what
// separates FM from a filter envelope.

import { midiToHz, adsrEnv, route, panner, startTime } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { insert } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { Descriptor, Knobs, NoteParams, TimbreFacts, VoiceCost, VoiceRenderer, VoiceRole } from './descriptor.ts';

/** Whichever of the three blocks is playing: the half they share is the half this file reads. */
type FmKeySettings = Settings['fmGlass'] | Settings['fmEp'] | Settings['fmPluck'];

/**
 * **The pluck's three ranges** (PLAN-MODULATION M1), every default straight off
 * `INSTRUMENTS.fmPluck`. `hold` is in **seconds** — this voice's own release —
 * because what it measures its holding in is a tail and not a fraction: a
 * sustain of 0.02 is a number that means "gone", and scaling it is arithmetic
 * about nothing. The knob carries the decay and the sustain with it, so what
 * lengthens is the note and not one leg of it.
 *
 * The other two voices in this file declare none. They are dormant — no
 * candidate list of any style names `fmGlass` or `fmEp`, and neither is drawn
 * on any reference seed — and a knob measured on a voice nothing plays is a
 * measurement nobody can hear. M2 is where the rest of the catalogue declares.
 */
export const FM_PLUCK_KNOBS: Knobs = {
  brightnessHz: { unit: 'hz', min: 1200, default: 8500, max: 14000, bird: 'zephyr', sense: 1, slopeDb: -0.0000539 },
  hold: { unit: 'seconds', min: 0.03, default: 0.12, max: 0.9, bird: 'tide', sense: 1, slopeDb: 8.23 },
  attack: { unit: 'seconds', min: 0.0008, default: 0.002, max: 0.12, bird: 'ember', sense: -1, slopeDb: 28.3 },
};

/** A voice with no knobs, which is what the two dormant FM voices hand over. */
const NO_KNOBS = { attack: 1, hold: 1, bright: 1 };

/**
 * The half all three share: an envelope, a lid, a floor, and the panning pair.
 *
 * `k` is the three knob factors, and it is **1, 1, 1** for a voice that
 * declares none and for a note nothing was asked of — so every line below is
 * the line it always was, to the bit.
 */
function carrierChain(
  ctx: BaseAudioContext,
  time: number,
  p: NoteParams,
  S: FmKeySettings,
  dur: number,
  k: { attack: number; hold: number; bright: number } = NO_KNOBS,
) {
  const vel = p.vel ?? 1;
  const g = ctx.createGain();
  const attack = S.attack * k.attack;
  const decay = Math.min(S.decay * k.hold, Math.max(0.05, dur * 1.4));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack, decay, sustain: Math.min(0.98, S.sustain * k.hold),
    hold: Math.max(0, dur - attack - decay), release: (p.release ?? S.release) * k.hold,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(14000, (S.lpHz * k.bright) * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);
  return { g, hp, end, vel };
}

/** One operator pair: a modulator at `ratio`, throwing the carrier by `index`. */
function pair(
  ctx: BaseAudioContext,
  time: number,
  end: number,
  hz: number,
  ratio: number,
  index: number,
  floor: number,
  fall: number,
) {
  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.value = hz;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = hz * ratio;
  const idx = ctx.createGain();
  // In hertz of deviation: the carrier's own frequency times how far this note
  // is throwing it. Exponential to a floor and not to nought, because an
  // exponential ramp may not end on zero.
  idx.gain.setValueAtTime(hz * index, time);
  idx.gain.exponentialRampToValueAtTime(hz * floor, time + fall);
  mod.connect(idx);
  idx.connect(car.frequency);
  mod.start(time);
  mod.stop(end + 0.02);
  car.start(time);
  car.stop(end + 0.02);
  return { car, mod, idx };
}

export function fmGlass(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = settings.fmGlass;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.08, p.dur ?? 0.7);
  const c = carrierChain(ctx, time, p, S, dur);
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);

  for (const side of [-1, 1]) {
    const one = pair(ctx, time, c.end, hz, S.ratio, S.index[0] + S.index[1] * c.vel, S.indexFloor, S.indexDecay);
    one.car.detune.value = side * S.detuneCents * 0.5;
    // The second modulator, on the first: this is the whole structural
    // difference from `fm-bell.ts`, and it is two nodes.
    const mod2 = ctx.createOscillator();
    mod2.type = 'sine';
    mod2.frequency.value = hz * S.ratio * S.ratio2;
    const idx2 = ctx.createGain();
    idx2.gain.setValueAtTime(hz * S.ratio * (S.index2[0] + S.index2[1] * c.vel), time);
    idx2.gain.exponentialRampToValueAtTime(hz * S.ratio * S.indexFloor, time + S.index2Decay);
    mod2.connect(idx2);
    idx2.connect(one.mod.frequency);
    mod2.start(time);
    mod2.stop(c.end + 0.02);

    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    one.car.connect(lvl);
    lvl.connect(pan);
    pan.connect(c.hp);
  }

  const tail = insert(ctx, p, c.g, time, c.end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.28, reverb: p.reverb ?? 0.42 });
  return c.end;
}

export function fmEp(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = settings.fmEp;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.08, p.dur ?? 0.5);
  const c = carrierChain(ctx, time, p, S, dur);
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);

  for (const side of [-1, 1]) {
    const body = pair(ctx, time, c.end, hz, S.ratio, S.index[0] + S.index[1] * c.vel, S.indexFloor, S.indexDecay);
    body.car.detune.value = side * S.detuneCents * 0.5;
    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    body.car.connect(lvl);
    lvl.connect(pan);
    pan.connect(c.hp);
  }

  // The tine: one operator pair, high and inharmonic, three hundredths of a
  // second long and in the middle. It is what makes it electric — and it is
  // mono on purpose, because a hammer is one place and a string is two.
  const tine = pair(ctx, time, time + S.tineDecay * 3, hz, S.tineRatio, S.tineIndex * c.vel, 0.01, S.tineDecay);
  const tineG = ctx.createGain();
  tineG.gain.setValueAtTime(S.tineLevel * c.vel, time);
  tineG.gain.exponentialRampToValueAtTime(0.0001, time + S.tineDecay);
  tine.car.connect(tineG);
  tineG.connect(c.hp);

  const tail = insert(ctx, p, c.g, time, c.end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.18, reverb: p.reverb ?? 0.3 });
  return c.end;
}

export function fmPluck(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = settings.fmPluck;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.18);
  const c = carrierChain(ctx, time, p, S, dur, {
    attack: knobScale(p, FM_PLUCK_KNOBS, 'attack'),
    hold: knobScale(p, FM_PLUCK_KNOBS, 'hold'),
    bright: knobScale(p, FM_PLUCK_KNOBS, 'brightnessHz'),
  });
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);

  for (const side of [-1, 1]) {
    const one = pair(ctx, time, c.end, hz, S.ratio, S.index[0] + S.index[1] * c.vel, S.indexFloor, S.indexDecay);
    one.car.detune.value = side * S.detuneCents * 0.5;
    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    one.car.connect(lvl);
    lvl.connect(pan);
    pan.connect(c.hp);
  }

  const tail = insert(ctx, p, c.g, time, c.end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.3, reverb: p.reverb ?? 0.28 });
  return c.end;
}

/** MEASURED by `tools/test-voices-2.ts --bless`. */
export const FM_GLASS_TIMBRES = {
  fmGlass: { family: 'harmonic', struck: true, hold: 0.12, brightnessHz: 8000, loudnessDb: -12 },
};
export const FM_EP_TIMBRES = {
  fmEp: { family: 'harmonic', struck: true, hold: 0.2, brightnessHz: 5200, loudnessDb: -12.2 },
};
export const FM_PLUCK_TIMBRES = {
  fmPluck: { family: 'harmonic', struck: true, hold: 0.04, brightnessHz: 7000, loudnessDb: -12 },
};

const key = (
  name: string,
  cost: VoiceCost,
  render: VoiceRenderer,
  timbres: Record<string, TimbreFacts>,
  roles: VoiceRole[],
): Descriptor => ({
  name,
  cost,
  family: 'keyboard',
  roles,
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render,
  timbres,
  dispatches: [],
  mood: [],
});

export const fmGlassDescriptor = key('fmGlass', 'dear', fmGlass, FM_GLASS_TIMBRES, ['melody', 'figure']);
export const fmEpDescriptor = key('fmEp', 'dear', fmEp, FM_EP_TIMBRES, ['figure', 'melody']);
export const fmPluckDescriptor = { ...key('fmPluck', 'dear', fmPluck, FM_PLUCK_TIMBRES, ['figure', 'melody']), knobs: FM_PLUCK_KNOBS };

export const descriptors: Descriptor[] = [fmGlassDescriptor, fmEpDescriptor, fmPluckDescriptor];
export default descriptors;
