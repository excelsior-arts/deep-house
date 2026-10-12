// A shimmer: a held note's octaves fed round a loop with a pitch shifter in
// it, so what rings climbs, and all of it above 2 kHz.
//
// Round KV1 of the kitchen, for the top octave of the record, which nothing in
// the catalogue lives in: an immersed bell does not move 8 kHz. The kitchen
// already has a shimmer, as an **effect** (`effects/shimmer.ts`), and it is on
// the rota at a breakdown; an effect, though, shimmers whatever it is put on,
// and what is missing is an *instrument* that lives up there. So this is the
// effect's loop turned into one: its source is the note's own octaves and its
// home is the top of the record.
//
//   the source    a triangle an octave over the note and a sine two octaves
//                 over it, each a pair a few cents apart and panned apart: a
//                 soft, wide, high tone, rising in over half a second.
//   the loop      two rings of delay, 110 and 129 ms, feeding each other
//                 through the effect's own pitch shifter (`shifter`, +12): every
//                 pass is an octave higher than the last, damped by a low-pass
//                 at `brightnessHz` so the climb fades into air instead of
//                 whistling. `feedback` is how much comes round; `shift` is how
//                 much of what comes round is pitched, the rest going round as
//                 it was.
//   the floor     two high-passes at 1.8 kHz on the way out: the loop's own
//                 low end, and the source's octave under the lowest notes, are
//                 not this voice's to play.
//
// It ends when its loop has fallen sixty decibels, which is a number the voice
// works out from its own feedback and ring and returns, so a caller knows
// when the graph can go.
//
// Its constants are this module's own, not a settings block (the settings are
// hashed into the program lock), and nothing draws it at the house: it
// declares the `sustained` role, and house-v2 plays it only where a place
// table names it (`BY_PLACE`).

import { midiToHz, route, startTime, panner, MIN_RELEASE, GAIN_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale } from './descriptor.ts';
import { shifter } from '../effects/shimmer.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, Knobs, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, pos, CENTS, HZ, LEVEL, RATIO, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

/** How long a loop of this ring at this feedback takes to fall 60 dB, in seconds. */
export const ringOut = (feedback: number, ring: number, ratio: number): number =>
  Math.min(12, Math.max(0.2, (Math.log(1e-3) / Math.log(Math.max(0.01, feedback))) * ring * ratio));

function shimmerPad(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.2, p.dur ?? 3);
  const vel = p.vel ?? 0.7;
  const shift = Math.min(1, S.shift * knobScale(p, row.descriptor.knobs, 'shift'));
  const feedback = Math.min(0.7, S.feedback * knobScale(p, row.descriptor.knobs, 'feedback'));
  const damp = S.brightnessHz * knobScale(p, row.descriptor.knobs, 'brightnessHz');

  // The source's envelope: a slow rise, a hold, a release.
  const src = ctx.createGain();
  src.channelCount = 2;
  src.channelCountMode = 'explicit';
  const attack = Math.min(p.attack ?? S.attack, dur * 0.6);
  const release = p.release ?? S.release;
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim);
  const noteEnd = time + dur + release;
  src.gain.setValueAtTime(0, time);
  src.gain.linearRampToValueAtTime(peak, time + attack);
  src.gain.setValueAtTime(peak, Math.max(time + attack, time + dur));
  src.gain.linearRampToValueAtTime(0, noteEnd);
  const end = noteEnd + ringOut(feedback, S.ring, S.ringRatio) + MIN_RELEASE;

  const sources: AudioScheduledSourceNode[] = [];
  for (const [mul, level] of [[2, S.octaveLevel], [4, S.twoOctaveLevel]] as const) {
    for (const side of [-1, 1]) {
      const o = ctx.createOscillator();
      o.type = mul === 2 ? 'triangle' : 'sine';
      o.frequency.value = hz * mul;
      o.detune.value = side * S.detuneCents * 0.5;
      const lvl = ctx.createGain();
      lvl.gain.value = level * 0.5;
      const pan = panner(ctx, side * S.spread);
      o.connect(lvl);
      lvl.connect(pan);
      pan.connect(src);
      sources.push(o);
    }
  }

  // The output, and its floor.
  const outG = ctx.createGain();
  outG.channelCount = 2;
  outG.channelCountMode = 'explicit';
  outG.channelInterpretation = 'speakers';
  let floor: AudioNode = outG;
  for (let i = 0; i < 2; i++) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = S.floorHz;
    hp.Q.value = -3.01;
    hp.connect(floor);
    floor = hp;
  }
  const sum = ctx.createGain();
  sum.connect(floor);

  const early = ctx.createGain();
  early.gain.value = S.early;
  src.connect(early);
  early.connect(sum);

  // The loop: the source into both rings, the rings out through their damping
  // and panned apart, and what comes out fed round again — part through the
  // octave, part as it was. Each ring carries half, so the loop gain is the
  // feedback asked for (`effects/shimmer.ts` says what twice that did).
  const fb = ctx.createGain();
  src.connect(fb);
  const tail = ctx.createGain();
  tail.gain.value = 0.5;
  [S.ring, S.ring * S.ringRatio].forEach((secs, i) => {
    const line = ctx.createDelay(0.5);
    line.delayTime.value = secs;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = -3.01;
    lp.frequency.value = Math.min(16000, damp);
    const pan = panner(ctx, i ? S.spread : -S.spread);
    fb.connect(line);
    line.connect(lp);
    lp.connect(pan);
    pan.connect(tail);
  });
  tail.connect(sum);
  const keepSource = (s: AudioScheduledSourceNode): number => sources.push(s);
  const sft = shifter(ctx, () => {}, keepSource, 12);
  const pitched = ctx.createGain();
  pitched.gain.value = feedback * shift;
  const plain = ctx.createGain();
  plain.gain.value = feedback * (1 - shift);
  tail.connect(sft.input);
  sft.output.connect(pitched);
  pitched.connect(fb);
  tail.connect(plain);
  plain.connect(fb);

  for (const s of sources) {
    s.start(time);
    s.stop(end);
  }

  const out2 = insert(ctx, p, outG, time, end, settings);
  route(ctx, out2, out, { dry: 1, delay: p.delay ?? 0, reverb: p.reverb ?? 0.35 });
  return end;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  release: SECONDS,
  /** the two octaves of the source, and their levels */
  octaveLevel: LEVEL,
  twoOctaveLevel: LEVEL,
  /** the pairs' offset, in cents, and how far apart they are panned */
  detuneCents: CENTS,
  spread: UNIT,
  /** the two rings, in seconds: each is a delay line half a second long at most */
  ring: pos(0.5),
  ringRatio: RATIO,
  /** how much comes round the loop, and how much of that is pitched */
  feedback: UNIT,
  shift: UNIT,
  /** the loop's damping corner, in hertz */
  brightnessHz: HZ,
  /** how much of the source goes straight out, against the loop */
  early: LEVEL,
  /** the floor */
  floorHz: HZ,
}, (s) => (s.ring * s.ringRatio <= 0.5 ? [] : [`the second ring is ${s.ring * s.ringRatio} s, past the half second its delay line holds`]));

/** What a row of this topology carries, as its contract types it. */
export type ShimmerPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * The shimmer topology: a note into a pitch-shifted feedback ring
 * (`sounds/ensemble/shimmerPad.json` since round R2, its numbers the row's own
 * and no block of the settings table, as round KV1 wrote them).
 */
export const SHIMMER_PAD: Topology = {
  id: 'shimmer',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { shift: 'shift', feedback: 'feedback', brightnessHz: 'brightnessHz' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => shimmerPad(row, ctx, out, time, p, settings),
};
