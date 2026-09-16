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

import PARAMS from '../params.js';
import { midiToHz } from '../theory.js';
import { adsrEnv, route, saturationCurve, evenCurve, MIN_RELEASE, startTime} from '../dsp.js';

export function sub(ctx, out, time, p = {}) {
  time = startTime(ctx, time); // never in the past: a step if it is
  const B = PARAMS.bass;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.18);
  const vel = p.vel ?? 1;
  const slideTime = p.slideTime ?? B.glide;

  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  const o3 = ctx.createOscillator();
  o3.type = 'sine';

  const set = (osc, mult) => {
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
  const floor = B.bodyFloor ?? 0;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(Math.max(0.0002, B.triangle), time);
  g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, B.triangle * floor), time + bd);
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(Math.max(0.0002, B.octave), time);
  g3.gain.exponentialRampToValueAtTime(Math.max(0.0002, B.octave * floor), time + bd * 0.8);

  const sat = ctx.createWaveShaper();
  sat.curve = saturationCurve(p.drive ?? B.drive);
  sat.oversample = '2x';

  // Warmth, not brightness — and a short lift on each new note so a pitch
  // change speaks without the line getting brighter.
  // `cutoffMul` is the development layer opening and closing the body under a
  // line that has been holding: the note itself is a clean sine and is never
  // touched, and the sub never takes a DJ treatment.
  const cutoff = (p.cutoff ?? B.cutoff) * (p.cutoffMul ?? 1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(1200, cutoff * B.openMult), time);
  lp.frequency.exponentialRampToValueAtTime(cutoff, time + B.openTime);
  lp.Q.value = 0.7;

  // Attack, a small fall, then a lower sustain — so each pitch change in the
  // held line is heard as a new note instead of the same tone changing pitch.
  const g = ctx.createGain();
  const decay = Math.min(B.decay, Math.max(0.04, dur * 0.5));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1), {
    attack: B.attack,
    decay,
    sustain: B.sustain,
    hold: Math.max(0, dur - B.attack - decay),
    release: p.release ?? 0.06,
  });

  const even = ctx.createWaveShaper();
  even.curve = evenCurve(p.even ?? B.even);
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

export default sub;
