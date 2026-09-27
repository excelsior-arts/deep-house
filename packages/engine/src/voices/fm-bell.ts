// A two-operator FM bell: one sine modulating another at a ratio that is not a
// whole number.
//
// Round K2 of PLAN-KITCHEN. It is in the set because of what the catalogue has
// none of rather than because bells are deep house: every harmonic voice here
// is harmonic in the arithmetic sense too — a saw, a square, an organ's
// drawbars, an electric piano whose modulator sits at 1x or 2x — and all of
// them make partials at whole multiples of the note. A struck bar or a glass
// does not, and the whole of the difference is one number: the ratio between
// the two operators. At 3.51 the partials land between the harmonics and the
// ear hears metal.
//
//   the ratio   a table, and `p.tone` names a row of it. `bell` is the default
//               and is what the declared loudness is measured on; the round's
//               write-up carries what each of the others measures, because a
//               declared number is a measurement of one thing and not a claim
//               about four.
//   the index   how far the modulator throws the carrier, in units of the
//               carrier's own frequency — and it is **velocity's**, because a
//               bell hit harder is brighter and not merely louder. It falls
//               from its peak to almost nothing inside a second, so the clang
//               is the attack and what rings on is nearly a sine.
//   the tail    a decay of a second and a half and a release of nearly one.
//               Nothing else in this engine rings for two seconds after its
//               note, and that is the point of having it: a figure played on
//               this instrument overlaps itself.
//
// Two carriers four cents apart and panned to opposite sides, so the tail
// spreads rather than standing in the middle of the record.
//
// **One role short of what the brief asked for.** The round asked for `melody`,
// `figure` *and* `texture`, and it may not have the third: `texture` is drawn
// by the rim's F lane and the other two by its S lane, so a voice claiming all
// three puts the `keys` layer in two lanes at once and the gate that holds the
// lanes to covering every event layer exactly once fails by name. It is round
// G's finding about the plucked mid bass, met again from the other side, and
// the fix is the same one: a role is an allocation and not a property of an
// instrument, which is the part/role split the design review describes.

import { midiToHz, adsrEnv, route, panner, startTime } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import { SEND_CONTROL, withControls } from './descriptor.ts';
import type { Controls, Descriptor, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

export function fmBell(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, FM_BELL_CONTROLS);
  time = startTime(ctx, time); // never in the past: a step if it is
  const S = settings.fmBell;
  const ratio = S.ratios[p.tone as keyof typeof S.ratios] ?? S.ratios[S.tone as keyof typeof S.ratios];
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.08, p.dur ?? 0.6);
  const vel = p.vel ?? 1;

  const g = ctx.createGain();
  const decay = Math.min(S.decay, Math.max(0.12, dur * 1.4));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: S.attack,
    decay,
    sustain: S.sustain,
    hold: Math.max(0, dur - S.attack - decay),
    release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // A lid, because FM at a high index makes partials all the way up and this
  // one is going into a record with hats in it; and a floor, because a bell's
  // fundamental is the only thing it owns down there.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(12000, S.lpHz * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = hz;
    car.detune.value = side * S.detuneCents * 0.5;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = hz * ratio;
    const idx = ctx.createGain();
    // The index, in Hz of deviation: the carrier's own frequency times how far
    // this note is throwing it. Exponential down to a floor rather than to
    // nought, because an exponential ramp may not end on zero.
    const indexMul = p.indexMul ?? 1;
    idx.gain.setValueAtTime(hz * (S.index[0] + S.index[1] * vel) * indexMul, time);
    idx.gain.exponentialRampToValueAtTime(hz * S.indexFloor * indexMul, time + S.indexDecay);
    mod.connect(idx);
    idx.connect(car.frequency);

    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    car.connect(lvl);
    lvl.connect(pan);
    pan.connect(hp);

    mod.start(time);
    mod.stop(end + 0.02);
    car.start(time);
    car.stop(end + 0.02);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: p.dry ?? 1, delay: p.delay ?? 0.3, reverb: p.reverb ?? 0.34,
    ...(p.background !== undefined ? { background: p.background } : {}),
    ...(p.immersed !== undefined ? { immersed: p.immersed } : {}) });
  return end;
}

/**
 * MEASURED by the gate, on the default tone. See `tools/test-voices.ts
 * --bless`; `hold` is the envelope's own sustain fraction and `brightnessHz`
 * the lid the voice puts on itself.
 */
export const FM_BELL_TIMBRES = {
  fmBell: { family: 'harmonic', struck: true, hold: 0.07, brightnessHz: 6200, loudnessDb: -12 },
};

/**
 * What a part may write on a bell note (the texture pulse): the two quiet
 * spaces it may be sent to, and how far the note throws its modulator — the
 * index's fraction, 1 the full struck bell and the floor a near sine.
 */
export const FM_BELL_CONTROLS: Controls = {
  background: { ...SEND_CONTROL, default: 0 },
  immersed: { ...SEND_CONTROL, default: 0 },
  indexMul: { unit: 'ratio', min: 0.02, max: 1, default: 1 },
};

export const descriptor: Descriptor = {
  name: 'fmBell',
  cost: 'dear',
  family: 'keyboard',
  roles: ['melody', 'figure'],
  bus: 'keys',
  level: 'keys',
  layer: 'keys',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: fmBell,
  controls: FM_BELL_CONTROLS,
  noteControls: Object.keys(FM_BELL_CONTROLS),
  timbres: FM_BELL_TIMBRES,
  dispatches: [],
  mood: [],
};

export default fmBell;
