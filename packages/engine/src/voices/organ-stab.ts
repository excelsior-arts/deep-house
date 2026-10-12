// A struck organ: drawbars — sines at whole multiples of the note — with a key
// click on the strike and a level that falls away like a stab, not like a
// held organ.
//
// Round KV1 of the kitchen. The catalogue's organ is a held sound (the keys'
// `organ` patch, the reed organ, the pad's dispatch of it) and a stab part that
// asks for an organ found nothing struck. This one is struck.
//
//   the drawbars six sines at 1, 2, 3, 4, 6 and 8 times the note — the 8', 4',
//                2 2/3', 2', 1 1/3' and 1' of a tonewheel organ with the 16'
//                left out, so the note reads as itself — at levels falling
//                from the fundamental, under a low-pass at `brightnessHz` that
//                is how far up the drawbars are pulled.
//   the click    four milliseconds of noise through a band-pass at 2.5 kHz on
//                the strike: the contact of a key on a busbar, which is most
//                of what makes an organ stab percussive rather than a pad with
//                a short note. `click` is its level against the drawbars.
//   the stab     up in two milliseconds, down to `hold` of the peak in a
//                tenth of a second, held there for the note, and gone in
//                sixty milliseconds.
//
// On the `keys` bus at the `keys` level (keys the table already has), where
// the shared chorus widens it; its constants are this module's own and not a
// settings block (the settings are hashed into the program lock). It declares
// the `figure` role in the `keyboard` family; house-v2 keeps it out of every
// list and plays it only where a place table names it (`BY_PLACE`).

import { midiToHz, route, startTime, noiseSource, MIN_RELEASE, GAIN_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, Knobs, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, list, num, HZ, LEVEL, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

function organStab(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.25);
  const vel = p.vel ?? 0.9;
  const corner = Math.min(14000, S.brightnessHz * knobScale(p, row.descriptor.knobs, 'brightnessHz') * (p.cutoffMul ?? 1));
  const click = S.click * knobScale(p, row.descriptor.knobs, 'click');
  const hold = Math.min(1, S.hold * knobScale(p, row.descriptor.knobs, 'hold'));
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim);

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const decay = Math.min(S.decay, Math.max(0.01, dur * 0.8));
  const release = p.release ?? S.release;
  const end = time + Math.max(dur, S.attack + decay) + release;
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + S.attack);
  g.gain.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, peak * hold), time + S.attack + decay);
  g.gain.setValueAtTime(Math.max(GAIN_FLOOR, peak * hold), Math.max(time + S.attack + decay, time + dur));
  g.gain.linearRampToValueAtTime(0, end);
  const stop = end + MIN_RELEASE;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = -3.01;
  lp.frequency.value = corner;
  lp.connect(g);

  let sum = 0;
  for (const [, level] of S.bars) sum += level;
  for (const [mul, level] of S.bars) {
    const f = hz * mul;
    if (f > 16000) continue;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const lvl = ctx.createGain();
    lvl.gain.value = level / sum;
    o.connect(lvl);
    lvl.connect(lp);
    o.start(time);
    o.stop(stop);
  }

  // The click: its own short envelope, on the strike, beside the drawbars —
  // not under their envelope, whose attack is the same two milliseconds and
  // would swallow it — at `click` of the stab's own peak.
  const both = ctx.createGain();
  both.channelCount = 2;
  both.channelCountMode = 'explicit';
  both.channelInterpretation = 'speakers';
  g.connect(both);
  if (click > 0) {
    const n = noiseSource(ctx, time, S.clickSeconds + 0.01);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = S.clickHz;
    bp.Q.value = 1.2;
    const cg = ctx.createGain();
    cg.gain.value = 0;
    cg.gain.setValueAtTime(0, time);
    cg.gain.linearRampToValueAtTime(click * peak, time + 0.0005);
    cg.gain.linearRampToValueAtTime(0, time + S.clickSeconds);
    n.connect(bp);
    bp.connect(cg);
    cg.connect(both);
  }

  const tail = insert(ctx, p, both, time, stop, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.1, reverb: p.reverb ?? 0.18 });
  return stop;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  decay: SECONDS,
  /** what the level falls to, as a fraction of the peak */
  hold: UNIT,
  release: SECONDS,
  /** the drawbars: multiples of the note and their levels, which are shared out by their sum */
  bars: list(list(num(0, 64), 2), 1, 16),
  /** the low-pass over them, in hertz */
  brightnessHz: HZ,
  /** the key click: its level, its centre and its length */
  click: LEVEL,
  clickHz: HZ,
  clickSeconds: SECONDS,
}, (o) => (o.bars.reduce((n, [, level]) => n + level, 0) > 0 ? [] : ['the drawbars\' levels add up to nothing, and they are shared out by their sum']));

/** What a row of this topology carries, as its contract types it. */
export type OrganStabPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * The drawbar organ topology, struck: additive bars with a key click
 * (`sounds/keyboard/organStab.json` since round R2, its numbers the row's own,
 * as round KV1 wrote them).
 */
export const ORGAN_STAB: Topology = {
  id: 'organ-stab',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { brightnessHz: 'brightnessHz', click: 'click', hold: 'hold' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => organStab(row, ctx, out, time, p, settings),
};
