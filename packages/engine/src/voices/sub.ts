// The sub topology: the bass riff, in two layers that never meet until the
// output.
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
//
// **The record's row** is `sounds/bass/sub.json` (round R1 moved its numbers
// out of `params.ts`'s `bass` block; the measurements and the ear behind
// them, kept here because they are about this topology's numbers): clean by
// default — the shaper is warmth and nothing else, the 2nd harmonic about
// 18 dB under the fundamental rather than 12, the grit that used to be
// permanent being the arrangement's `push` macro — so `drive` 0.3 is how hard
// a quiet triangle and octave are pushed, not how hard the bass is; `cutoff`
// 360 is warmth, not brightness; `even` 0.12 is where the 2nd harmonic comes
// from, which at a 45 Hz fundamental lands at 90 Hz — most of the "meat" a
// listener means; `attack` 5-10 ms; a note and not a tone — Eugene: *"it
// sounds like a 60 Hz buzz, like somebody didn't plug an electric guitar into
// the jack all the way"* — so `decay` 0.22 into a `sustain` of 0.6 (-4.4 dB,
// so a pitch change is an event), the triangle and the octave mostly a
// transient (`bodyDecay` 0.1) with a floor of 0.42 left behind so a phone
// speaker, which cannot reproduce 46 Hz at all, still hears the note, kept
// low enough that the 2nd harmonic sits 20-24 dB under the fundamental and the
// 3rd under -34; `glide` 0.03, legato; and a short lowpass lift on each new
// note (`openMult` 2.4 over `openTime` 0.08) so a change speaks without the
// line getting brighter. The row is voiced through the room's `bass` block —
// the rooms write `drive`, `cutoff`, `triangle`, `octave` and `even` of their
// own, and the bus's half of that block (the compressor, the body EQ, the tilt,
// the floor, the parallel drive) is `master.ts`'s and stays in `params.ts`.
//
// The four knobs (PLAN-MODULATION M1, rounds S8 and S10 for `mass`) are the
// row's. `brightnessHz` is the **body** filter and it is warmth and not
// brightness: the fundamental is a clean sine and the corner decides how much
// of the saturated triangle and octave sits under it, which is why the ceiling
// is 1.1 kHz and not the engine's. `hold` is the sustain fraction and carries
// the decay and the release with it. `mass` is **how much is under the note**,
// which Root moves, 1 at the house: thin (0 to 1) closes the body to nothing
// — the triangle, the octave and what stays of them, and the drive into their
// shaper, each x (1 - t), the corner x (1 - 0.6 t), so at 0 the sub is its
// sine alone under a 144 Hz corner; heavy (1 to 2) opens the body and keeps it
// — the triangle x (1 + 2 h), the octave toward its control's ceiling by h,
// what stays toward its ceiling by h, the drive x (1 + 1.5 h), the even shaper
// x (1 + h), the corner x (1 + 1.5 h). The sine's own level is never touched.
// The two controls a part may write are the body's floor and the octave's
// level, kept under the point where the body is a buzz rather than a note.

import { midiToHz, adsrEnv, route, saturationCurve, evenCurve, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { knobScale, withControls } from './descriptor.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import { patchOf } from './sound.ts';
import { centsOf, liveOf } from './live.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, HZ, LEVEL, RATIO, SECONDS, UNIT, WAIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { Settings } from '../settings.ts';

/** What a row of this topology carries: exactly these (the voice's half of the `bass` block), each in its range (`schema.ts`). */
const PARAMETERS = contract({
  /** the saturation's amount (`saturationCurve`): nought is clean */
  drive: num(0, 8),
  cutoff: HZ,
  triangle: LEVEL,
  octave: LEVEL,
  /** the even shaper's bend (`evenCurve`): past a half either way the curve folds back on itself */
  even: num(-0.5, 0.5),
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  bodyDecay: SECONDS,
  bodyFloor: UNIT,
  glide: WAIT,
  openMult: RATIO,
  openTime: SECONDS,
});

/** What a row of this topology carries, as its contract types it. */
export type SubPatch = PatchOf<typeof PARAMETERS.fields>;

function render(row: SoundRow): VoiceRenderer {
  const knobs = row.descriptor.knobs;
  const controls = row.descriptor.controls!;
  return function sub(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
    p = withControls(p, controls);
    time = startTime(ctx, time); // never in the past: a step if it is
    const B = patchOf(settings, row, PARAMETERS);
    const hz = midiToHz(p.midi);
    const dur = Math.max(0.05, p.dur ?? 0.18);
    const vel = p.vel ?? 1;
    const slideTime = p.slideTime ?? B.glide;
    // The three knobs, as factors against the block's own numbers: exactly 1 with
    // nothing asked for, and `x * 1 === x`.
    const kBright = knobScale(p, knobs, 'brightnessHz');
    const kHold = knobScale(p, knobs, 'hold');
    const kAttack = knobScale(p, knobs, 'attack');
    const attack = B.attack * kAttack;
    const kMass = knobScale(p, knobs, 'mass');
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
    const floor = (floor0 + heavy * (controls.bodyFloor.max - floor0)) * (1 - thin);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(Math.max(GAIN_FLOOR, B.triangle * bodyGain), time);
    g2.gain.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, B.triangle * bodyGain * floor), time + bd);
    const g3 = ctx.createGain();
    const octave0 = p.bodyOctave ?? B.octave;
    const octave = (octave0 + heavy * Math.max(0, controls.bodyOctave.max - octave0)) * (1 - thin);
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

    // **What this note can still take** (PLAN-DESK D1b): the body's corner, as
    // a `detune` on its filter so the lift on each new note is kept. The body's
    // shapers, its transient and its envelope are the build's.
    const live = liveOf(ctx);
    if (live && p.cutoff == null) live.on('cutoff', (v) => [[lp.detune, centsOf(v, B.cutoff)]]).keep(row.id, row, settings, end + 0.02);

    o1.start(time);
    o2.start(time);
    o3.start(time);
    o1.stop(end + 0.02);
    o2.stop(end + 0.02);
    o3.stop(end + 0.02);
    return end;
  };
}

/**
 * The held line under everything. A row of it says `mono` because the low end
 * is the record and a stereo bottom is a bottom that moves, and `treat`
 * because the stage does move this one — not with the DJ rota, which the sub
 * never takes, but with its own level and the body filter's contrast
 * (`p.cutoffMul` in the composer's `performance.ts`). The body's two controls
 * are read by their ceilings as well as their values, so a row must declare
 * both.
 */
export const SUB: Topology = {
  id: 'sub',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { brightnessHz: 'cutoff', hold: 'sustain', attack: 'attack' },
  controlOf: { bodyFloor: 'bodyFloor', bodyOctave: 'octave' },
  // D1b: the body's corner; its shapers' curves, its transient and its envelope are the build's
  live: { cutoff: 'hz' },
  render,
  check: (row) => ['bodyFloor', 'bodyOctave'].filter((c) => !row.descriptor.controls?.[c]).map((c) => `${row.id}: a sub declares the ${c} control, whose ceiling the body reads`),
};

export default SUB;
