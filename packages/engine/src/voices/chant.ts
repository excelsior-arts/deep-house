// A sung drone with no words in it: one long syllable that opens on *a*, rounds to *o* and closes to a hum.
//
// The formant pad (`formant-pad.ts`) is a voice because of three resonances that stay where they are while the pitch
// moves under them; the wordless vocal sings a syllable through the same body. This is the third thing that body can
// do, and the slowest: a single breath of 8-15 s on a low fundamental (about 100-130 Hz), the mouth walking from the
// open vowel to the round one and closing to the lips' hum, the three formants gliding the whole way:
//
//   the vowels    *a* and *o* are the room's own (`settings.formantPad.vowels`, the formant pad row's table, read as a
//                 room fact as the wordless vocal reads it); the hum is the row's: the first formant low, the upper two
//                 nearly gone, and the lid closing over all of it to a few hundred Hz. `roundAt` and `closeAt` are the
//                 shares of the note at which the *o* and the hum are reached.
//   no person     what makes a voice a person is speed and a wobble: syllables in a tenth of a second, a vibrato of
//                 five or six Hz, the breath and the jitter of one throat. Here the vowels take seconds, there is **no
//                 vibrato** (only a slow drift of a few cents), and it is a few throats a few cents apart and spread
//                 across the field (`throats`, at unequal levels, so their beating does not pump the body): a held
//                 chord of one pitch, closer to an organ's reed rank than to a singer.
//   the overtones `overtone` (a note's control, nought by default) lays a fourth formant over the body, very narrow
//                 (`overtoneQ`), standing on one harmonic of the fundamental at a time and gliding to the next every
//                 `harmonicSeconds`: the row's `harmonics` walk (5th to 12th). Under it the upper two formants step
//                 back, so the one harmonic sings out of the drone like a whistle. It goes round the lid, so the hum
//                 does not close it, and it is fed by the centre throat alone, whose drift stands still meanwhile:
//                 the whistle is steady.
//
// Its loudness is the gates' to measure and its cost `budget.ts`'s; it holds nothing but its notes.

import { midiToHz, adsrEnv, route, panner, phasedLfo, noiseSource, startTime, dbToGain } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { insert } from './treat.ts';
import { withControls } from './descriptor.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import { vocalPartials } from './formant-pad.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, int, list, num, CENTS, HZ, LEVEL, LFO_HZ, Q, SECONDS, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  /** the throats' levels, lowest-tuned first (the middle one is the centre throat), how far apart they stand in
   * all, and how far and how slowly each drifts */
  throats: list(LEVEL, 1, 5),
  detuneCents: CENTS,
  driftCents: num(0, 20),
  driftHz: LFO_HZ,
  /** the source's roll-off (`vocalPartials`) and the breath under it */
  sourceTilt: num(1, 3),
  breath: LEVEL,
  /** the closed hum: its three formant centres and levels, the lid over it, and its level against the open vowel */
  hum: list(HZ, 3),
  humLevel: list(LEVEL, 3),
  openHz: HZ,
  humHz: HZ,
  humDb: num(-24, 0),
  /** the shares of the note at which the *o* and then the hum are reached */
  roundAt: UNIT,
  closeAt: UNIT,
  attack: SECONDS,
  release: SECONDS,
  /** the overtone mode: how much of it a note that writes none plays, how narrow it is and how loud at one */
  overtone: UNIT,
  overtoneQ: Q,
  overtoneLevel: LEVEL,
  /** the harmonics it stands on in turn, how long on each, and the glide between */
  harmonics: list(int(2, 24), 1, 16),
  harmonicSeconds: SECONDS,
  glide: SECONDS,
  spread: UNIT,
  trim: LEVEL,
  dry: SEND,
  reverb: SEND,
  delay: SEND,
}, (c) => [
  ...(c.roundAt < c.closeAt ? [] : [`the hum (${c.closeAt}) comes before the o (${c.roundAt})`]),
  ...(c.humHz < c.openHz ? [] : ['the hum is not darker than the open vowel']),
]);

/** What a row of this topology carries, as its contract types it. */
export type ChantPatch = PatchOf<typeof PARAMETERS.fields>;

const waves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
/** The source's wave at a tilt, one per context and tilt. */
function wave(ctx: BaseAudioContext, tilt: number): PeriodicWave {
  let per = waves.get(ctx);
  if (!per) waves.set(ctx, (per = new Map()));
  let w = per.get(tilt);
  if (!w) {
    const imag = vocalPartials(tilt);
    w = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    if (per.size >= 8) per.delete(per.keys().next().value as number);
    per.set(tilt, w);
  }
  return w;
}

/** A frequency walked from `a` through `b` to `c`, arriving at `tb` and `tc`: exponential legs, as a mouth's are heard. */
function walk(param: AudioParam, t0: number, tb: number, tc: number, a: number, b: number, c: number): void {
  param.setValueAtTime(a, t0);
  param.exponentialRampToValueAtTime(b, tb);
  param.exponentialRampToValueAtTime(c, tc);
}

function chant(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, row.descriptor.controls ?? {});
  const C = patchOf(settings, row, PARAMETERS);
  const F = settings.formantPad;
  const time = startTime(ctx, at);
  const hz = midiToHz(p.midi);
  const dur = Math.max(2, p.dur ?? 10);
  const attack = Math.min(p.attack ?? C.attack, dur * 0.4);
  const overtone = Math.max(0, Math.min(1, p.overtone ?? C.overtone));
  const spread = (p.spread ?? C.spread) * (p.spreadMul ?? 1);
  const tR = time + Math.max(0.05, C.roundAt * dur);
  const tC = time + Math.max(0.1, C.closeAt * dur);

  const g = ctx.createGain();
  const end = adsrEnv(g, time, (p.vel ?? 0.8) * (p.gain ?? 1) * C.trim, {
    attack, decay: 0.05, sustain: 1, hold: Math.max(0, dur - attack - 0.05), release: p.release ?? C.release, fadeCurve: 1,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // the level across the syllable: whole on the vowels, `humDb` under it once the lips have closed
  const shape = ctx.createGain();
  shape.gain.setValueAtTime(1, time);
  shape.gain.setValueAtTime(1, tR);
  shape.gain.linearRampToValueAtTime(dbToGain(C.humDb), tC);
  shape.connect(g);
  // the lid: open on the vowels, closing to the hum
  const lid = ctx.createBiquadFilter();
  lid.type = 'lowpass';
  lid.Q.value = 0.6;
  walk(lid.frequency, time, tR, tC, C.openHz, Math.max(C.humHz, C.openHz * 0.8), C.humHz);
  lid.connect(shape);
  const floor = ctx.createBiquadFilter();
  floor.type = 'highpass';
  floor.frequency.value = Math.min(F.hpHz, hz * 0.7);
  floor.Q.value = 0.7;
  floor.connect(lid);

  // the source: the throats and the breath
  const src = ctx.createGain();
  src.gain.value = F.voiceLevel;
  const sources: AudioScheduledSourceNode[] = [];
  const drift = phasedLfo(ctx, C.driftHz, (p.midi % 7) * 0.9);
  drift.start(time);
  sources.push(drift);
  const n = C.throats.length;
  // throats at equal levels beat against each other into a pump of the whole body; unequal ones (the row's) beat
  // shallower. Their sum is held to one throat's power, so the row's level does not move with how many there are.
  const norm = 1 / Math.sqrt(C.throats.reduce((a, l) => a + l * l, 0) || 1);
  const centre = Math.floor((n - 1) / 2);
  let centreOut: GainNode | null = null;
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave(ctx, C.sourceTilt));
    o.frequency.value = hz;
    const place = n > 1 ? i / (n - 1) - 0.5 : 0;
    o.detune.value = place * C.detuneCents;
    // each throat drifts its own way: the one slow LFO, at a depth and a sign of its own. The centre throat stands
    // still while it carries the overtone: a whistle whose throat wanders is a vibrato, the one thing that is a person
    const parked = overtone > 0 && i === centre;
    if (!parked) {
      const depth = ctx.createGain();
      depth.gain.value = C.driftCents * (i % 2 ? -1 : 1) * (0.6 + 0.4 * ((i + 1) / n));
      drift.connect(depth);
      depth.connect(o.detune);
    }
    const lvl = ctx.createGain();
    lvl.gain.value = C.throats[i] * norm;
    if (i === centre) centreOut = lvl;
    const pan = panner(ctx, place * 2 * spread * 0.6);
    o.connect(lvl);
    lvl.connect(pan);
    pan.connect(src);
    o.start(time);
    sources.push(o);
  }
  const breath = noiseSource(ctx, time, end - time + 0.02);
  const bg = ctx.createGain();
  bg.gain.value = p.breath ?? C.breath;
  breath.connect(bg);
  bg.connect(src);
  sources.push(breath);

  // the three formants, walking a -> o -> hum; the upper two step back under the overtone
  // the room's open and round vowels, by name where its table has them, else the pair the pad itself walks between
  const vowels = F.vowels as Readonly<Record<string, readonly number[]>>;
  const ah = vowels.ah ?? vowels[F.vowel];
  const oh = vowels.oh ?? vowels[F.vowelTo];
  const pans = [-0.4, 0.1, 0.45];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = F.q[i];
    walk(bp.frequency, time, tR, tC, ah[i], oh[i], C.hum[i]);
    const lvl = ctx.createGain();
    const step = i === 0 ? 1 : 1 - 0.7 * overtone;
    lvl.gain.setValueAtTime(F.formantLevel[i] * step, time);
    lvl.gain.setValueAtTime(F.formantLevel[i] * step, tR);
    lvl.gain.linearRampToValueAtTime(Math.max(1e-4, C.humLevel[i] * step), tC);
    const pan = panner(ctx, pans[i] * spread);
    src.connect(bp);
    bp.connect(lvl);
    lvl.connect(pan);
    pan.connect(floor);
  }

  // the overtone mode: a narrow formant on one harmonic at a time, round the lid
  if (overtone > 0) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = C.overtoneQ;
    const list = C.harmonics;
    const first = time + attack * 0.5;
    bp.frequency.setValueAtTime(hz * list[0], time);
    for (let k = 1; time + attack * 0.5 + k * C.harmonicSeconds < time + dur; k++) {
      const t = first + k * C.harmonicSeconds;
      bp.frequency.setValueAtTime(hz * list[(k - 1) % list.length], t);
      bp.frequency.exponentialRampToValueAtTime(hz * list[k % list.length], t + C.glide);
    }
    const og = ctx.createGain();
    // from the centre throat alone: the others are a few cents off it, and two of them inside a band this narrow beat
    // at a few Hz, which is a flutter (10-13 dB at 2-9 Hz, measured when it took the whole source)
    og.gain.value = (overtone * C.overtoneLevel * F.voiceLevel) / Math.max(1e-6, C.throats[centre] * norm);
    centreOut!.connect(bp);
    bp.connect(og);
    og.connect(g);
  }

  for (const s of sources) s.stop(end + 0.05);
  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: p.dry ?? C.dry, reverb: p.reverb ?? C.reverb, delay: p.delay ?? C.delay });
  return end;
}

/**
 * The chant's topology (`sounds/vocal/chantOm.json`): one wordless syllable over the formant body, *a* to *o* to the
 * hum, with an overtone mode. Its one control, `overtone`, defaults to the row's.
 */
export const CHANT: Topology = {
  id: 'chant',
  cost: 'dear',
  parameters: PARAMETERS,
  controlOf: { overtone: 'overtone' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => chant(row, ctx, out, time, p, settings),
};

export default CHANT;
