// A saw lead: the plainest instrument in the set, and the one a melody above
// middle C is most likely to be played on.
//
// Round K2 of PLAN-KITCHEN, and the reason it is the first of the six is the
// measurement that opened the round: this record is a kick, a sub and a wash,
// and it has nothing that plays a line. Every harmonic voice in the catalogue
// is a *chord* instrument — an ensemble, a keyboard, a piano — and the two that
// can carry a figure (the keys' `pluck` and the piano) are struck and die
// inside the bar. A lead is held, it is bright, and it is one note at a time.
//
// The shape, and where each piece of it comes from:
//
//   the pair    two sawtooths twelve cents apart, panned to opposite sides. A
//               saw has every harmonic, which is what a filter needs something
//               to do to; twelve cents is about a fifth of a semitone, wide
//               enough to beat at a couple of Hertz up here and narrow enough
//               that the line still has one pitch.
//   the width   a comb: the pair, plus the same pair a fraction of its own
//               period later, subtracted. That *is* a pulse wave — a sawtooth
//               less the same sawtooth delayed by `w` periods is a rectangle of
//               duty `w` — so moving the delay is moving the pulse width, and
//               the delay is a fraction of the note's own period so the notches
//               track the pitch instead of standing still and turning into a
//               formant. The wander is a fifth of a Hertz: PWM, arrived at
//               from the direction a delay line makes cheap.
//   the filter  a resonant lowpass that starts `envMult` over its corner and
//               falls onto it in about a fifth of a second. This is the one
//               place the timbre study's "nothing closes a filter inside a
//               note" does not apply and says so: the study measured *held
//               chords* on the references, and a lead's envelope is most of
//               what makes it a lead.
//   the glide   optional, and a lead's own idiom: `p.glide` seconds from
//               `p.glideFrom` to the note. Nothing schedules it today.
//
// `mono: false`, and the two channels are genuinely different — the pair is
// panned apart and the comb is applied after the panning. The output gain is
// still pinned to two channels, which is round G's finding applied the other
// way round: whatever a voice's own width is, what leaves it should be two
// channels by construction rather than by an engine's up-mixing rule.

import { midiToHz, adsrEnv, route, panner, phasedLfo, startTime, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

export function sawLead(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const S = settings.sawLead;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.06, p.dur ?? 0.4);
  const vel = p.vel ?? 1;

  const g = ctx.createGain();
  const decay = Math.min(S.decay, Math.max(0.05, dur * 0.6));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: p.attack ?? S.attack,
    decay,
    sustain: S.sustain,
    hold: Math.max(0, dur - (p.attack ?? S.attack) - decay),
    release: p.release ?? S.release,
  });
  // Two channels leave this voice, explicitly: round G measured what becomes of
  // a stream of the wrong width inside the graph's mid/side stage, and the
  // answer was not the same in both engines.
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // The filter, and the pluck in it. Velocity opens the corner; the envelope
  // opens it further still and lets it fall.
  const cut = Math.min(9000, (p.cutoff ?? S.cutoff) * (1 + S.veloOpen * (vel - 0.5)) * (p.cutoffMul ?? 1));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.setValueAtTime(Math.min(12000, cut * S.envMult), time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(CUTOFF_FLOOR, cut), time + S.envTime);
  lp.connect(g);

  // Nothing of a lead belongs under the bass.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  // The comb: the pair, plus itself a fraction of a period later, subtracted.
  const width = Math.max(0.02, Math.min(0.9, p.pwmWidth ?? S.pwmWidth));
  const base = width / hz;
  const sum = ctx.createGain();
  sum.connect(hp);
  const mix = ctx.createGain();
  mix.connect(sum);
  const dl = ctx.createDelay(0.05);
  dl.delayTime.value = base;
  const inv = ctx.createGain();
  inv.gain.value = -(p.pwmMix ?? S.pwmMix);
  mix.connect(dl);
  dl.connect(inv);
  inv.connect(sum);

  // ...and the width wanders, which is the movement a PWM lead has. The phase
  // is the note's own, so a seeded figure moves the same way every time.
  const lfo = phasedLfo(ctx, S.pwmHz, (p.midi % 6) * 1.05);
  const depth = ctx.createGain();
  depth.gain.value = base * S.pwmDepth;
  lfo.connect(depth);
  depth.connect(dl.delayTime);
  lfo.start(time);
  lfo.stop(end + 0.05);

  // The pair. A glide is the lead's own idiom and is off unless a note asks:
  // `p.glide` seconds from `p.glideFrom`, which is a MIDI note and not a ratio,
  // so a figure states where it came from in the units it is written in.
  const from = p.glide > 0 && p.glideFrom != null ? midiToHz(p.glideFrom) : 0;
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    if (from > 0) {
      o.frequency.setValueAtTime(from, time);
      o.frequency.exponentialRampToValueAtTime(hz, time + Math.min(dur * 0.9, p.glide));
    } else {
      o.frequency.setValueAtTime(hz, time);
    }
    o.detune.value = side * S.detuneCents * 0.5;
    const pan = panner(ctx, side * spread * 0.5);
    o.connect(pan);
    pan.connect(mix);
    o.start(time);
    o.stop(end + 0.02);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.18, reverb: p.reverb ?? 0.16 });
  return end;
}

/**
 * What this instrument is worth to a meter, declared the way every other
 * family declares it. `loudnessDb` is **MEASURED** and written by the gate that
 * measures it, never typed: the voice alone through the real graph, eight bars
 * of its role's figure under `tools/fixture.ts`'s table, integrated, less the
 * level that table gave it (`tools/test-voices.ts --bless`). `hold` is the
 * envelope's own sustain fraction and `brightnessHz` its filter's corner, so
 * neither can drift from the sound.
 */
export const SAW_LEAD_TIMBRES = {
  sawLead: { family: 'harmonic', struck: false, hold: 0.55, brightnessHz: 1500, loudnessDb: -11.1 },
};

/**
 * The saw lead, as it describes itself.
 *
 * **Two roles and one lane.** `melody` and `figure` are both drawn by the rim's
 * S lane (`LANE_ROLES` in the composer's `control.ts`), so a voice claiming
 * both puts its layer in one lane and the gate that holds the lanes to covering
 * every event layer exactly once is satisfied. Round G's plucked mid bass could
 * not have two because its second role was in another lane; this one can, and
 * the difference is the lanes and not the instruments.
 *
 * `level: 'keys'` — a level of its own is a key in the settings' level table
 * and therefore a number in the program digest, which is a re-bless (round G's
 * first finding). `plays: null`: nothing in any arrangement gates it, and no
 * candidate list of any style names it, so no die can draw it.
 */
export const descriptor: Descriptor = {
  name: 'sawLead',
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
  render: sawLead,
  timbres: SAW_LEAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export default sawLead;
