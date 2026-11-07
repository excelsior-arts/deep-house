// A smooth supersaw: the held wall of a peak, soft at the edges. Round trance-drawn (11-04).
//
// His ear, 11-04: *"need to get that super saw sound as in [the trance classics' peak] … perhaps adjusting our current
// super saw that doesn't sound that smooth."* Why ours is not smooth, read off the two rows that play it today:
//
//   - the held one (`supersaw-lead.ts`) spaces its seven saws evenly (-1, -2/3 … 1 of the detune): every neighbouring
//     pair beats at the same rate, so the stack pulses at one clear "wah" a fraction of a second long, the same on every
//     note (the start phases are fixed too);
//   - the struck one (`supersaw-grit.ts`) is gritty by design (a drive, a crush, a breath of noise, a filter envelope on
//     every strike) and chopped: a riff voice, never a held wall.
//
// What makes a peak saw smooth, and this voice:
//
//   the stack    nine saws on an uneven curve (no two neighbouring pairs beat at the same rate, and no rate is a simple
//                multiple of another), the centre one on the note and a step louder than the sides;
//   the drift    each saw's pitch wanders a few cents on a slow sine of its own (0.07-0.4 Hz): the beating never settles
//                into a pattern, which is what an ensemble of real oscillators does, and what a chorus fakes;
//   the phases   each note's saws start at phases drawn from the note itself (its pitch and its time), so two strikes
//                of one chord are two different walls, not the same one twice;
//   the width    the saws panned by their offset at `spread` (well inside the field), never a delay between the
//                sides: the stereo is level only, so the mono fold keeps every saw (no anti-phase width);
//   the top      a gentle low-pass (two stages at a low Q, opening from `closed` to its corner over `open` seconds, so a
//                held chord blooms) and a high shelf `topDb` down from `topHz`: the fizz rolled off, the body kept;
//   the bottom   a high-pass at `hpHz`: nothing of a peak saw belongs under the bass;
//   the level    an attack, held whole to the note's end, a long release: a wall that swells in and rings out.
//
// Stereo, on the `melodic` bus at the `keys` level. It declares the `sustained` role in the `keyboard` family and no
// lane names it (`plays: null`): the trance corner's techniques play it as a peak voice (`src/trance-drawn.ts`).

import { midiToHz, route, startTime, panner, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, DB, HZ, LEVEL, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

/** The nine offsets, as fractions of `detune`: uneven, so the neighbouring pairs beat at rates no simple ratio apart. */
const OFFSETS = [-1, -0.71, -0.46, -0.23, 0, 0.21, 0.44, 0.69, 0.97];
/** Each saw's drift rate, hertz: slow, and no two alike. */
const DRIFT_HZ = [0.071, 0.113, 0.157, 0.203, 0.0, 0.181, 0.137, 0.097, 0.389];
/** The centre saw a little over the sides (the stack has one pitch), the outer pair a step under: no pair loud enough to beat alone. */
const LEVELS = [0.7, 0.82, 0.9, 0.95, 1.05, 0.95, 0.9, 0.82, 0.7];

/** A small hash of the note, for its phases: the same note at the same time is the same wall (a render is repeatable). */
function phasesOf(midi: number, at: number): number[] {
  let h = (Math.round(midi * 7919) ^ Math.round(at * 1000003)) >>> 0;
  return OFFSETS.map(() => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (h % 10000) / 10000; });
}

function supersawSmooth(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const midi = p.midi ?? 60;
  const hz = midiToHz(midi);
  const dur = Math.max(0.08, p.dur ?? 1);
  const vel = p.vel ?? 0.8;
  const detune = S.detune * ((p as { detuneMul?: number }).detuneMul ?? 1);
  const corner = Math.min(16000, S.cutoffHz * (p.cutoffMul ?? 1));

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const attack = Math.min(p.attack ?? S.attack, dur * 0.6);
  const release = p.release ?? S.release;
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim);
  const end = time + dur + release;
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.setValueAtTime(peak, Math.max(time + attack, time + dur));
  // a release that rings out (an exponential-like fall by a target), never a straight line cut short
  g.gain.setTargetAtTime(0, Math.max(time + attack, time + dur), release / 3.5);
  const stop = end + MIN_RELEASE + release;

  // the top: a shelf down from `topHz`, then two gentle low-pass stages opening over `open`
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = S.topHz;
  shelf.gain.value = S.topDb;
  shelf.connect(g);
  const from = Math.max(CUTOFF_FLOOR, corner * S.closed);
  let lp: AudioNode = shelf;
  for (const q of [0.5, 0.62]) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, time);
    f.frequency.exponentialRampToValueAtTime(Math.max(from, corner), time + Math.max(0.05, S.open));
    f.connect(lp);
    lp = f;
  }
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.6;
  hp.connect(lp);

  const spread = Math.max(0, Math.min(1, (p.spread ?? S.spread) * (p.spreadMul ?? 1)));
  const norm = 1 / Math.sqrt(LEVELS.reduce((s, x) => s + x * x, 0));
  const phases = phasesOf(midi, time);
  OFFSETS.forEach((k, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = k * detune * 100;
    if (DRIFT_HZ[i] > 0 && S.driftCents > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = DRIFT_HZ[i];
      const depth = ctx.createGain();
      depth.gain.value = S.driftCents * (0.6 + 0.4 * Math.abs(k));
      lfo.connect(depth);
      depth.connect(o.detune);
      lfo.start(Math.max(0, time - phases[i] / Math.max(0.05, DRIFT_HZ[i])));
      lfo.stop(stop);
    }
    const lvl = ctx.createGain();
    lvl.gain.value = LEVELS[i] * norm;
    const pan = panner(ctx, k * spread);
    o.connect(lvl);
    lvl.connect(pan);
    pan.connect(hp);
    o.start(Math.max(0, time - phases[i] / hz));
    o.stop(stop);
  });

  const tail = insert(ctx, p, g, time, stop, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.12, reverb: p.reverb ?? 0.45 });
  return stop;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  release: SECONDS,
  /** the outermost saws' offset, as a fraction of a semitone */
  detune: num(0, 2),
  /** each saw's slow wander, cents (the outer ones a little more) */
  driftCents: num(0, 30),
  /** how far across the field the outermost pair is panned (level only, no delay between the sides) */
  spread: UNIT,
  /** the corner the low-pass opens to, hertz */
  cutoffHz: HZ,
  /** where it starts, as a fraction of that corner */
  closed: UNIT,
  /** how long it takes to open, seconds */
  open: SECONDS,
  /** the shelf that rolls the fizz off: from here up */
  topHz: HZ,
  /** ...by this much */
  topDb: DB,
  /** nothing of a peak saw under the bass */
  hpHz: HZ,
});

/** What a row of this topology carries, as its contract types it. */
export type SupersawSmoothPatch = PatchOf<typeof PARAMETERS.fields>;

/** The smooth supersaw topology (`sounds/keyboard/supersawSmooth.json`). */
export const SUPERSAW_SMOOTH: Topology = {
  id: 'supersaw-smooth',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: {},
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => supersawSmooth(row, ctx, out, time, p, settings),
};
