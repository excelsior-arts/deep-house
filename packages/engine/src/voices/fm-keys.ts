// The FM keyboard topology, and between its three rows the three things two
// operators can be.
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
//
// Round R2 made the three one topology and three rows
// (`sounds/keyboard/fmGlass.json`, `fmEp.json`, `fmPluck.json`): the second
// modulator and the tine are parameters a row carries or leaves `null`, and the
// note's default length and its two sends — which were three numbers in each
// of three functions — are the row's own. A pair of operators, a haze, a tine:
// a fourth FM key is a row.

import { midiToHz, adsrEnv, route, panner, startTime } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { insert } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, list, maybe, num, table, CENTS, HZ, LEVEL, RATIO, SECONDS, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  /** the modulator against the note, and how far it throws the carrier: `[at nought, per unit of velocity]` */
  ratio: RATIO,
  index: list(num(0, 64), 2),
  indexDecay: SECONDS,
  indexFloor: LEVEL,
  /**
   * a second modulator on the first, at a ratio of its own: partials at every
   * sum and difference of two inharmonic series, a haze where one modulator is
   * metal; `null` is none
   */
  modulator2: maybe(table({ ratio: RATIO, index: list(num(0, 64), 2), decay: SECONDS })),
  /** a short, high, inharmonic second pair in the middle, the hammer on the metal; `null` is none */
  tine: maybe(table({ ratio: RATIO, index: num(0, 64), level: LEVEL, decay: SECONDS })),
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  release: SECONDS,
  lpHz: HZ,
  hpHz: HZ,
  detuneCents: CENTS,
  spread: UNIT,
  trim: LEVEL,
  /** a note's length when it states none, and the shortest it is played */
  dur: SECONDS,
  minDur: SECONDS,
  /** the two sends a note that states none is played with */
  delay: SEND,
  reverb: SEND,
});

/** What a row of this topology carries, as its contract types it. */
export type FmKeyPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * An envelope, a lid, a floor, and the panning pair. `k` is the three knob
 * factors, and it is **1, 1, 1** for a row that declares none and for a note
 * nothing was asked of — so every line below is the line it always was, to
 * the bit.
 */
function carrierChain(
  ctx: BaseAudioContext,
  time: number,
  p: NoteParams,
  S: FmKeyPatch,
  dur: number,
  k: { attack: number; hold: number; bright: number },
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

function fmKey(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(S.minDur, p.dur ?? S.dur);
  const knobs = row.descriptor.knobs;
  const c = carrierChain(ctx, time, p, S, dur, {
    attack: knobScale(p, knobs, 'attack'),
    hold: knobScale(p, knobs, 'hold'),
    bright: knobScale(p, knobs, 'brightnessHz'),
  });
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);

  for (const side of [-1, 1]) {
    const one = pair(ctx, time, c.end, hz, S.ratio, S.index[0] + S.index[1] * c.vel, S.indexFloor, S.indexDecay);
    one.car.detune.value = side * S.detuneCents * 0.5;
    if (S.modulator2) {
      // The second modulator, on the first: two nodes, and the haze.
      const M = S.modulator2;
      const mod2 = ctx.createOscillator();
      mod2.type = 'sine';
      mod2.frequency.value = hz * S.ratio * M.ratio;
      const idx2 = ctx.createGain();
      idx2.gain.setValueAtTime(hz * S.ratio * (M.index[0] + M.index[1] * c.vel), time);
      idx2.gain.exponentialRampToValueAtTime(hz * S.ratio * S.indexFloor, time + M.decay);
      mod2.connect(idx2);
      idx2.connect(one.mod.frequency);
      mod2.start(time);
      mod2.stop(c.end + 0.02);
    }
    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    one.car.connect(lvl);
    lvl.connect(pan);
    pan.connect(c.hp);
  }

  if (S.tine) {
    // The tine: one operator pair, high and inharmonic, three hundredths of a
    // second long and in the middle. It is mono on purpose, because a hammer
    // is one place and a string is two.
    const T = S.tine;
    const tine = pair(ctx, time, time + T.decay * 3, hz, T.ratio, T.index * c.vel, 0.01, T.decay);
    const tineG = ctx.createGain();
    tineG.gain.setValueAtTime(T.level * c.vel, time);
    tineG.gain.exponentialRampToValueAtTime(0.0001, time + T.decay);
    tine.car.connect(tineG);
    tineG.connect(c.hp);
  }

  const tail = insert(ctx, p, c.g, time, c.end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? S.delay, reverb: p.reverb ?? S.reverb });
  return c.end;
}

/**
 * The FM keyboard topology. A row that declares knobs (`fmPluck`'s three)
 * has them move its attack, its hold and its lid; `hold` is in seconds —
 * the row's own release — because a sustain of 0.02 is a number that means
 * "gone", and the knob carries the decay and the sustain with it.
 */
export const FM_KEY: Topology = {
  id: 'fm-key',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { brightnessHz: 'lpHz', hold: 'release', attack: 'attack' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => fmKey(row, ctx, out, time, p, settings),
};

export default FM_KEY;
