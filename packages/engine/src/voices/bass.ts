// The bass riff, in two layers that never meet until the output.
//
//   the note   one sine at the fundamental, through nothing. No waveshaper
//              touches it, so whatever the rest of the chain does, the pitch
//              of this line is a clean tone.
//   the body   a little triangle and a quiet octave, saturated together, at a
//              level well under the note. This is where every harmonic in the
//              bass comes from, and it is one number to turn down.
//
// Eugene, twice: the bass was "mushy and kind of distorted" and then "still a
// bit overdriven". Both times the cause was a shaper across the *whole* voice.
// A sine driven through a tanh is a sine plus everything; a sine plus a
// separately driven body is a bass.
//
// The line is sustained: each note is held to the next pitch change and its
// release overlaps it, so the level between kicks never reaches zero and the
// sidechain does the moving a plucked envelope used to do.

import { midiToHz, adsrEnv, route, saturationCurve, evenCurve, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { knobScale, withControls } from './descriptor.ts';
import type { Controls, Descriptor, Knobs, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/**
 * **The sub's three ranges** (PLAN-MODULATION M1), every default straight off
 * `INSTRUMENTS.bass`.
 *
 * `brightnessHz` is the **body** filter and it is warmth and not brightness, as
 * the comment on `cutoff` has always said: the fundamental is a clean sine and
 * the corner decides how much of the saturated triangle and octave sits under
 * it. That is exactly what a bird asking for a brighter bottom should reach
 * for, and it is why the ceiling is 1.1 kHz and not the engine's — over that
 * the body stops being warmth and starts being a second instrument.
 *
 * `hold` is the sustain fraction the module already declares, and the knob
 * carries the decay and the release with it, because what makes this line hold
 * is all three together: *what makes it a note is that it falls a little after
 * it starts.*
 */
export const SUB_KNOBS: Knobs = {
  brightnessHz: { unit: 'hz', min: 140, default: 360, max: 1100, bird: 'zephyr', sense: 1, slopeDb: -0.000266 },
  hold: { unit: 'ratio', min: 0.18, default: 0.6, max: 0.95, bird: 'tide', sense: 1, slopeDb: 9.5 },
  attack: { unit: 'seconds', min: 0.002, default: 0.008, max: 0.05, bird: 'ember', sense: -1, slopeDb: -0.0987 },
  /**
   * **How much is under the note** — the sub's weight, which Root moves
   * (round S8 declared it; round S10 widened it, Eugene on S8: *"it seems the
   * same deep bass in both"* — the figure moved, the sound did not). 1 at the
   * house, where it is the identity. Two halves, each its own curve:
   *
   *   **thin** (0 to 1, t = 1 - m): the body closes to nothing. The triangle,
   *     the octave and what stays of them (`bodyFloor`), and the drive into
   *     their shaper, each x (1 - t); the lowpass corner x (1 - 0.6 t). At 0
   *     the sub is its sine alone, under a 144 Hz corner: a deep drone with
   *     nothing above 120 Hz.
   *   **heavy** (1 to 2, h = m - 1): the body opens and stays. The triangle x
   *     (1 + 2 h) and the octave toward its control's ceiling (0.3) by h, what
   *     stays of them toward its ceiling (0.6) by h, the drive x (1 + 1.5 h),
   *     the even shaper x (1 + h), and the lowpass corner x (1 + 1.5 h) — so
   *     the harmonics a phone plays are there for the length of the note.
   *
   * The sine's own level is never touched: the weight is in what is above it.
   */
  mass: { unit: 'ratio', min: 0, default: 1, max: 2, bird: 'root', sense: 1, slopeDb: 0.0075 },
};

export function sub(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, SUB_CONTROLS);
  time = startTime(ctx, time); // never in the past: a step if it is
  const B = settings.bass;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.18);
  const vel = p.vel ?? 1;
  const slideTime = p.slideTime ?? B.glide;
  // The three knobs, as factors against the block's own numbers: exactly 1 with
  // nothing asked for, and `x * 1 === x`.
  const kBright = knobScale(p, SUB_KNOBS, 'brightnessHz');
  const kHold = knobScale(p, SUB_KNOBS, 'hold');
  const kAttack = knobScale(p, SUB_KNOBS, 'attack');
  const attack = B.attack * kAttack;
  const kMass = knobScale(p, SUB_KNOBS, 'mass');
  const thin = Math.max(0, Math.min(1, 1 - kMass));
  const heavy = Math.max(0, Math.min(1, kMass - 1));
  const bodyGain = (1 - thin) * (1 + 2 * heavy);

  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  const o3 = ctx.createOscillator();
  o3.type = 'sine';

  const set = (osc: OscillatorNode, mult: number): void => {
    const f = hz * mult;
    if (p.slideFrom) {
      osc.frequency.setValueAtTime(midiToHz(p.slideFrom) * mult, time);
      osc.frequency.exponentialRampToValueAtTime(f, time + slideTime);
    } else {
      osc.frequency.setValueAtTime(f, time);
    }
  };
  set(o1, 1);
  set(o2, 1);
  set(o3, 2);

  // The body is a *transient*: the triangle and the octave colour the front of
  // the note and are gone in a tenth of a second. Held underneath the whole
  // note they were a fixed set of harmonics that never moved, which is the
  // definition of a buzz.
  const bd = Math.max(0.02, B.bodyDecay);
  const floor0 = p.bodyFloor ?? B.bodyFloor ?? 0;
  const floor = (floor0 + heavy * (SUB_CONTROLS.bodyFloor.max - floor0)) * (1 - thin);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(Math.max(GAIN_FLOOR, B.triangle * bodyGain), time);
  g2.gain.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, B.triangle * bodyGain * floor), time + bd);
  const g3 = ctx.createGain();
  const octave0 = p.bodyOctave ?? B.octave;
  const octave = (octave0 + heavy * Math.max(0, SUB_CONTROLS.bodyOctave.max - octave0)) * (1 - thin);
  g3.gain.setValueAtTime(Math.max(GAIN_FLOOR, octave), time);
  g3.gain.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, octave * floor), time + bd * 0.8);

  const sat = ctx.createWaveShaper();
  sat.curve = saturationCurve((p.drive ?? B.drive) * (1 - thin) * (1 + 1.5 * heavy));
  sat.oversample = '2x';

  // Warmth, not brightness — and a short lift on each new note so a pitch
  // change speaks without the line getting brighter.
  // `cutoffMul` is the development layer opening and closing the body under a
  // line that has been holding: the note itself is a clean sine and is never
  // touched, and the sub never takes a DJ treatment.
  const cutoff = (p.cutoff ?? B.cutoff) * kBright * (p.cutoffMul ?? 1) * (1 - 0.6 * thin) * (1 + 1.5 * heavy);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(1200, cutoff * B.openMult), time);
  lp.frequency.exponentialRampToValueAtTime(cutoff, time + B.openTime);
  lp.Q.value = 0.7;

  // Attack, a small fall, then a lower sustain — so each pitch change in the
  // held line is heard as a new note instead of the same tone changing pitch.
  const g = ctx.createGain();
  const decay = Math.min(B.decay * kHold, Math.max(0.04, dur * 0.5));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1), {
    attack,
    decay,
    // A sustain is a fraction and may not be talked past one: the ceiling is
    // where the knob stops, and at the default it is the block's own number
    // because `Math.min` of a number and something over it is that number.
    sustain: Math.min(0.98, B.sustain * kHold),
    hold: Math.max(0, dur - attack - decay),
    release: (p.release ?? 0.06) * kHold,
  });

  const even = ctx.createWaveShaper();
  even.curve = evenCurve((p.even ?? B.even) * (1 + heavy));
  even.oversample = '2x';

  // The note, clean, straight into the filter.
  o1.connect(lp);
  // The body, and only the body, goes through the shapers, underneath it.
  o2.connect(g2);
  g2.connect(sat);
  o3.connect(g3);
  g3.connect(sat);
  sat.connect(even);
  even.connect(lp);

  lp.connect(g);
  route(ctx, g, out, { dry: 1 }); // the sub never goes to a send

  o1.start(time);
  o2.start(time);
  o3.start(time);
  o1.stop(end + 0.02);
  o2.stop(end + 0.02);
  o3.stop(end + 0.02);
  return end;
}


/**
 * The held line under everything. `mono` because the low end is the record and
 * a stereo bottom is a bottom that moves; `treat` because the stage does move
 * this one — not with the DJ rota, which the sub never takes, but with its own
 * level and the body filter's contrast (`p.cutoffMul` in the composer's
 * `performance.ts`).
 */
/**
 * What a part may write on a sub note (the style's "full" and "defined"
 * bottoms): how much of the triangle and the octave is left under the note
 * once its attack has gone, and how loud the octave starts. Kept under the
 * point where the body is a buzz rather than a note (the bass block's own note
 * on the floor). Defaults are the bass block's.
 */
export const SUB_CONTROLS: Controls = {
  bodyFloor: { unit: 'ratio', min: 0, max: 0.6, default: 0.42 },
  bodyOctave: { unit: 'level', min: 0, max: 0.3, default: 0.04 },
};

export const descriptor: Descriptor = {
  name: 'sub',
  cost: 'dear',
  knobs: SUB_KNOBS,
  family: 'bass',
  roles: ['bassline'],
  bus: 'sub',
  level: 'sub',
  layer: 'bass',
  plays: 'bass',
  mono: true,
  treat: true,
  anticipates: null,
  prepare: null,
  render: sub,
  controls: SUB_CONTROLS,
  noteControls: Object.keys(SUB_CONTROLS),
  timbres: {},
  dispatches: [],
  mood: [],
};

export default sub;
