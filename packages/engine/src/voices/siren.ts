// A siren: a tone that glides from its note to another over a stated share
// of its own length, and holds there.
//
// Round KV1 of the kitchen. Every pitched voice in the catalogue lands on its
// note and stays; the only thing that bends is the 303 line's short slide into
// a tied note. This one is *all* bend: the portamento is the sound.
//
//   the tone     a sine with a saw under it at a third of its level, a pair a
//                few cents apart and panned apart: the sine is the siren, the
//                saw is what a low-pass at `brightnessHz` has to work on, so the
//                corner is a real colour and not a volume.
//   the glide    from the note to `span` times it — 2 is an octave up — over
//                `glide` of the note's own length, a straight line in octaves,
//                and then held. A note written for two beats with `glide` at
//                a half glides over one beat: the span in beats is the part's
//                to write, as the note's length, and the voice's to keep.
//   the fall     a note with `down: 1` glides the other way, to the note over
//                `span` — the dive.
//
// Stereo, on the `melodic` bus at the `fx` level (a key the table already
// has); its constants are this module's own and not a settings block (the
// settings are hashed into the program lock). It is an `effect` in family and
// plays the `melody` role on the `keys` layer: a pitched thing a part writes as
// a note, not the section glue the `texture` role is (whose lanes are every
// voice that declares it, so a siren there would be drawn at a boundary).
// No list widens into an effect's melody, and house-v2's awaiting list names it.

import { midiToHz, route, startTime, panner, MIN_RELEASE, GAIN_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale, withControls } from './descriptor.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, CENTS, HZ, LEVEL, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

function siren(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, row.descriptor.controls ?? {});
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.1, p.dur ?? 1);
  const vel = p.vel ?? 0.8;
  const span = Math.max(1, S.span * knobScale(p, row.descriptor.knobs, 'span'));
  const glide = Math.min(1, S.glide * knobScale(p, row.descriptor.knobs, 'glide'));
  const corner = S.brightnessHz * knobScale(p, row.descriptor.knobs, 'brightnessHz');
  const to = p.down === 1 ? hz / span : hz * span;

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const release = p.release ?? S.release;
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim);
  const end = time + dur + release;
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + S.attack);
  g.gain.setValueAtTime(peak, Math.max(time + S.attack, time + dur));
  g.gain.linearRampToValueAtTime(0, end);
  const stop = end + MIN_RELEASE;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = -3.01;
  hp.connect(g);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = -3.01;
  lp.frequency.value = Math.min(14000, corner);
  lp.connect(hp);

  const glideEnd = time + Math.max(0.02, dur * glide);
  for (const side of [-1, 1]) {
    const pan = panner(ctx, side * S.spread);
    pan.connect(lp);
    for (const [type, level] of [['sine', 0.5], ['sawtooth', 0.5 * S.edge]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = side * S.detuneCents * 0.5;
      o.frequency.setValueAtTime(hz, time);
      o.frequency.exponentialRampToValueAtTime(to, glideEnd);
      const lvl = ctx.createGain();
      lvl.gain.value = level;
      o.connect(lvl);
      lvl.connect(pan);
      o.start(time);
      o.stop(stop);
    }
  }

  const tail = insert(ctx, p, g, time, stop, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.12, reverb: p.reverb ?? 0.25 });
  return stop;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  release: SECONDS,
  /** the interval glided, as a ratio of frequencies: 2 is an octave */
  span: num(1, 16),
  /** the share of the note the glide takes */
  glide: UNIT,
  /** the low-pass over the saw, in hertz */
  brightnessHz: HZ,
  /** the saw's level under the sine */
  edge: LEVEL,
  /** the pair's offset in cents, and how far apart it is panned */
  detuneCents: CENTS,
  spread: UNIT,
  /** nothing under it is the siren's */
  hpHz: HZ,
});

/** What a row of this topology carries, as its contract types it. */
export type SirenPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * The siren topology: a swept tone (`sounds/effect/siren.json` since round
 * R2, its numbers the row's own, as round KV1 wrote them). Its control `down`
 * says which way a note glides.
 */
export const SIREN: Topology = {
  id: 'siren',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { span: 'span', glide: 'glide', brightnessHz: 'brightnessHz' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => siren(row, ctx, out, time, p, settings),
};
