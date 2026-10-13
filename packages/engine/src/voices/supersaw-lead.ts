// A supersaw lead: seven saws spread a fraction of a semitone apart and across
// the stereo field, held for as long as the note and never struck again, under
// a low-pass that opens slowly while it holds.
//
// Round KV1 of the kitchen. The catalogue's leads are all *struck* — the saw
// lead's filter falls onto its corner in a fifth of a second, and a lead part
// that asks for a sustained articulation found no keyboard that sustains
// (a non-struck keyboard was neither a struck figure nor a bed). This is that
// instrument: a lead line held, the way a long melody over a pad wants.
//
//   the seven    saws at -1, -2/3, -1/3, 0, 1/3, 2/3 and 1 of `detune` (a
//                fraction of a semitone), each panned by its offset: the outer
//                ones wide and beating fastest, the middle one on the note and
//                in the centre, so the line has one pitch and a width.
//   the hold     a short attack and then the level held, whole, until the
//                note ends: no decay leg, no second strike. What moves while a
//                note holds is the filter, never the level.
//   the opening  the low-pass (two stages, 24 dB an octave, which rounds the
//                seven saws' edges) starts at 0.3 of its corner and opens to it
//                over `open` seconds, a straight line in octaves: a long note
//                brightens as it holds, a short one stays dark, and that is
//                the articulation.
//
// Stereo, on the `melodic` bus at the `pad` level (a key the table already
// has), its constants this module's own and not a settings block (the settings
// are hashed into the program lock). It declares the `sustained` role in the
// `keyboard` family; house-v2 keeps it out of every list and plays it only
// where a place table names it (`BY_PLACE`).

import { midiToHz, route, startTime, panner, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, DB, HZ, LEVEL, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

/** The seven offsets, as fractions of `detune`. */
const OFFSETS = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
/** Where in its own cycle each of the seven starts, as a fraction of a period. */
const PHASES = [0, 0.37, 0.71, 0.13, 0.52, 0.89, 0.26];

function supersawLead(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.08, p.dur ?? 1);
  const vel = p.vel ?? 0.8;
  const detune = S.detune * knobScale(p, row.descriptor.knobs, 'detune');
  const corner = Math.min(14000, S.cutoffHz * knobScale(p, row.descriptor.knobs, 'brightnessHz') * (p.cutoffMul ?? 1));
  const open = S.open * knobScale(p, row.descriptor.knobs, 'open');

  // The level: an attack, then held whole to the note's end, then a release.
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const attack = Math.min(p.attack ?? S.attack, dur * 0.5);
  const release = p.release ?? S.release;
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim);
  const end = time + dur + release;
  // Nought from the start and not only from the note: the saws begin a
  // fraction of a period early (below), and a gain's own value before its
  // first event is one.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.setValueAtTime(peak, Math.max(time + attack, time + dur));
  g.gain.linearRampToValueAtTime(0, end);
  const stop = end + MIN_RELEASE;

  // Two stages, both opening together, the first resonant: twenty-four
  // decibels an octave rounds seven saws' edges, which at twelve arrive at
  // the next note's strike as single-sample steps the scenes' gate reads as
  // clicks (0.07 at 8.6x, measured with one stage at 4.5 kHz).
  const from = Math.max(CUTOFF_FLOOR, corner * S.closed);
  let lp: AudioNode = g;
  for (const q of [-3.01, S.resonanceDb - 3.01]) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, time);
    f.frequency.exponentialRampToValueAtTime(Math.max(from, corner), time + open);
    f.connect(lp);
    lp = f;
  }

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = -3.01;
  hp.connect(lp);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const level = 1 / Math.sqrt(OFFSETS.length);
  OFFSETS.forEach((k, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = k * detune * 100;
    const lvl = ctx.createGain();
    lvl.gain.value = level;
    const pan = panner(ctx, k * spread);
    o.connect(lvl);
    lvl.connect(pan);
    pan.connect(hp);
    // Each saw started a stated fraction of its own period early, under the
    // level's nought: seven saws started together are in phase, and seven
    // in-phase ramps drop together once a period — a click the scenes' gate
    // read at 0.07 on the strike. Live, where the early start may already be
    // past, a saw starts at once and only its phase differs.
    o.start(Math.max(0, time - PHASES[i] / hz));
    o.stop(stop);
  });

  const tail = insert(ctx, p, g, time, stop, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.14, reverb: p.reverb ?? 0.3 });
  return stop;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  release: SECONDS,
  /** the outermost saws' offset, as a fraction of a semitone */
  detune: num(0, 12),
  /** how far across the field the outermost pair is panned */
  spread: UNIT,
  /** the corner the filter opens to, in hertz */
  cutoffHz: HZ,
  /** where it starts, as a fraction of that corner */
  closed: UNIT,
  /** how long it takes to open, in seconds */
  open: SECONDS,
  /** decibels of resonance at the corner */
  resonanceDb: DB,
  /** nothing of a lead belongs under the bass */
  hpHz: HZ,
});

/** What a row of this topology carries, as its contract types it. */
export type SupersawLeadPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * The supersaw lead topology: seven saws at fixed offsets and phases under a
 * filter that opens (`sounds/keyboard/supersawLead.json` since round R2, its
 * numbers the row's own, as round KV1 wrote them).
 */
export const SUPERSAW_LEAD: Topology = {
  id: 'supersaw-lead',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { detune: 'detune', brightnessHz: 'cutoffHz', open: 'open' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => supersawLead(row, ctx, out, time, p, settings),
};
