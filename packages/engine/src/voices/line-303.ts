// The 303 line topology: one oscillator through a resonant low-pass that the
// note's own envelope throws open and lets fall, with an accent and a glide
// between tied notes. The sound of a TB-303, from the arithmetic of one.
//
// Round KV1 of the kitchen: a resonant, swept filter and a glide on a bass
// voice, which nothing in the catalogue had; round R1 made its numbers a row
// (`sounds/bass/line303.json`) and left the arithmetic here. Four things make
// a 303 line what it is, and each is one decision:
//
//   the filter    two low-passes in a row, the first resonant: twenty-four
//                 decibels an octave, which is the slope of the real one's
//                 ladder, and a peak at the corner (`resonanceDb`) that sings
//                 when it is swept. The resonance is in decibels over the
//                 passband, which is what Web Audio's `Q` is on a low-pass.
//   the envelope  on the corner, not on the level: every note throws the
//                 corner (`cutoffHz`) up by `envAmount` of itself and lets it
//                 fall back over `decay` seconds. That fall *is* the squelch; a
//                 303 with its envelope at nought is a buzzing bass.
//   the accent    a note marked `accent` is louder (`accentGain`), throws the
//                 corner further (`accentEnv`) and falls faster
//                 (`accentDecay`) — three numbers moved together, which is
//                 what the accent knob on the real one did.
//   the glide     a note with `glideFrom` slides into its pitch from that note
//                 over `glide` seconds, and does **not** strike again: its
//                 level arrives at once and its corner is not thrown, because
//                 a slid note on the real one is a legato note, one envelope
//                 held across two pitches. A line writes the tie; this plays it.
//
// **It is a line voice and never the bass solo's.** The house's bass solo is
// the theme's own figure ornamented with struck octave pops and it never
// glides (rounds S5-S17, `packages/deep-house/src/solo.ts`); the glide here is
// this line's own idiom and belongs to the parts that write a tie.
//
// Saw by default and a square by the note's `square` switch (`squareLevel`
// is its level against the saw, since it is louder for the same peak): the
// square's hollow, odd-harmonic buzz is the other half of the 303's sound.
//
// Mono by a pin, on the `sub` bus at the `sub` level; a row's numbers are its
// own and not a settings block (the settings are hashed into the program
// lock). Nothing draws it at the house: it declares the `bassline` role, and
// house-v2 plays it only where a place table names it (`BY_PLACE`).

import { midiToHz, route, startTime, MIN_RELEASE, CUTOFF_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale, withControls } from './descriptor.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import { patchOf } from './sound.ts';
import { centsOf, liveOf } from './live.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, DB, HZ, LEVEL, RATIO, SECONDS, WAIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  release: SECONDS,
  /** the corner the envelope falls back to, in hertz */
  cutoffHz: HZ,
  /** decibels of peak at the corner of the first stage */
  resonanceDb: DB,
  /** how far a note throws the corner, as multiples of it over it */
  envAmount: num(0, 64),
  /** how long the corner takes to fall back, in seconds (to a sixtieth) */
  decay: SECONDS,
  /** a tied note's slide, in seconds */
  glide: WAIT,
  /** the accent: this much louder, this much further thrown, this much faster */
  accentGain: LEVEL,
  accentEnv: RATIO,
  accentDecay: RATIO,
  /** the square, against the saw: its level, since it is louder for the same peak */
  squareLevel: LEVEL,
  /** the floor: nothing under it is the line's */
  hpHz: HZ,
});

/** What a row of this topology carries, as its contract types it. */
export type Line303Patch = PatchOf<typeof PARAMETERS.fields>;

function render(row: SoundRow): VoiceRenderer {
  const knobs = row.descriptor.knobs;
  const controls = row.descriptor.controls;
  return function line303(ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
    if (controls) p = withControls(p, controls);
    const time = startTime(ctx, at);
    const S = patchOf(settings, row, PARAMETERS);
    const hz = midiToHz(p.midi);
    const dur = Math.max(0.03, p.dur ?? 0.12);
    const vel = p.vel ?? 1;
    const accent = p.accent === 1;
    const slid = typeof p.glideFrom === 'number' && Number.isFinite(p.glideFrom);

    const cutoff = S.cutoffHz * knobScale(p, knobs, 'brightnessHz');
    const resonanceDb = S.resonanceDb * knobScale(p, knobs, 'resonanceDb');
    const envAmount = S.envAmount * knobScale(p, knobs, 'envAmount') * (accent ? S.accentEnv : 1);
    const decay = S.decay * knobScale(p, knobs, 'decay') * (accent ? S.accentDecay : 1);
    const glide = S.glide * knobScale(p, knobs, 'glide');
    const peak = vel * (p.gain ?? 1) * S.trim * (accent ? S.accentGain : 1);

    // The level: struck from true zero, or — a slid note — arriving over the
    // engine's shortest ramp, so the tie sounds as one note and not two.
    const g = ctx.createGain();
    g.channelCount = 1;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'discrete';
    const attack = slid ? MIN_RELEASE : S.attack;
    const release = p.release ?? S.release;
    const end = time + Math.max(dur, attack + 0.01) + release;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + attack);
    g.gain.setValueAtTime(peak, Math.max(time + attack, time + dur));
    g.gain.linearRampToValueAtTime(0, end);
    const stop = end + MIN_RELEASE;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = S.hpHz;
    hp.Q.value = -3.01;
    hp.connect(g);

    // The two stages: the resonant one first, so the peak is the second's to
    // round and not to pass whole.
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.Q.value = -3.01;
    lp2.connect(hp);
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.Q.value = resonanceDb - 3.01;
    lp1.connect(lp2);

    // The corner's envelope, on both stages: thrown up and falling back on an
    // exponential, which is a straight line in octaves. A slid note is not
    // thrown; it carries the corner where the tie left it, which is the base.
    const base = Math.min(12000, Math.max(CUTOFF_FLOOR, cutoff));
    const top = Math.min(14000, base * (1 + (slid ? 0 : envAmount * (0.4 + 0.6 * vel))));
    for (const f of [lp1, lp2]) {
      f.frequency.setValueAtTime(top, time);
      if (top > base) f.frequency.setTargetAtTime(base, time + attack, decay / 4);
    }

    const o = ctx.createOscillator();
    o.type = p.square === 1 ? 'square' : 'sawtooth';
    if (slid) {
      o.frequency.setValueAtTime(midiToHz(p.glideFrom), time);
      o.frequency.exponentialRampToValueAtTime(hz, time + Math.min(glide, dur * 0.9));
    } else {
      o.frequency.setValueAtTime(hz, time);
    }
    const lvl = ctx.createGain();
    lvl.gain.value = p.square === 1 ? S.squareLevel : 1;
    o.connect(lvl);
    lvl.connect(lp1);
    o.start(time);
    o.stop(stop);

    // **What this note can still take** (PLAN-DESK D1b): the corner the
    // envelope falls back to, as a `detune` on both stages (the throw and its
    // fall kept, scaled as the note scales them), the resonance, the floor,
    // and the level against the trim it was built at. How far a note throws
    // the corner and how fast it falls are legs already scheduled: the next
    // note's.
    const live = liveOf(ctx);
    if (live) {
      const kBright = knobScale(p, knobs, 'brightnessHz');
      const kRes = knobScale(p, knobs, 'resonanceDb');
      const corner = (x: number) => Math.min(12000, Math.max(CUTOFF_FLOOR, x));
      const square = p.square === 1;
      const cur = { trim: S.trim, square: S.squareLevel };
      const amp = (): [AudioParam, number] => [lvl.gain, (square ? cur.square : 1) * (S.trim > 0 ? cur.trim / S.trim : 1)];
      live
        .on('cutoffHz', (v) => [lp1, lp2].map((f) => [f.detune, centsOf(corner(v * kBright), base)] as [AudioParam, number]))
        .on('resonanceDb', (v) => [[lp1.Q, v * kRes - 3.01]])
        .on('hpHz', (v) => [[hp.frequency, v]])
        .on('trim', (v) => { if (!(S.trim > 0)) return []; cur.trim = v; return [amp()]; })
        .on('squareLevel', (v) => { if (!square) return []; cur.square = v; return [amp()]; })
        .keep(row.id, row, settings, stop);
    }

    const tail = insert(ctx, p, g, time, stop, settings);
    route(ctx, tail, out, { dry: 1, delay: 0, reverb: 0 });
    return stop;
  };
}

/**
 * The five ranges a row may declare, as PLAN-MODULATION declares them, each
 * defaulting from the row's own number; the two switches a line may write on a
 * note (`accent`, `square`) are the row's controls.
 */
export const LINE_303: Topology = {
  id: 'line303',
  cost: 'mid',
  parameters: PARAMETERS,
  knobOf: { brightnessHz: 'cutoffHz', resonanceDb: 'resonanceDb', envAmount: 'envAmount', decay: 'decay', glide: 'glide' },
  // D1b: the corner, the resonance, the floor and the level; the envelope's throw and fall are legs already scheduled
  live: { cutoffHz: 'hz', resonanceDb: 'db', hpHz: 'hz', trim: 'level', squareLevel: 'level' },
  render,
};

export default LINE_303;
