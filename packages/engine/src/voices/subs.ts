// Two more bottoms: a soft square and a triangle.
//
// `bass.ts` is the record's own sub and it is a measurement — a sine, a
// triangle and an octave, a tanh and an asymmetric shaper, a lowpass, all of it
// read off two benchmark minutes of the genre — and it is untouched. These two
// are what a *different* record's bottom is made of, and the difference between
// them is the one thing that matters down there: **how many harmonics there
// are, and how low the first one that matters is.**
//
//   `subSoft`  a square, lowpassed hard: the odd harmonics at 1/n, of which the
//              third is the one a phone hears. A soft square is a square whose
//              corners have been taken off — here by a lowpass at four times
//              the fundamental rather than by a shaper, so the harmonics fall
//              away instead of stopping — and it is the bottom a bass *line*
//              wants, because a line has to be audible on something with no
//              bottom at all.
//   `subTri`   a triangle, which has the same odd harmonics at 1/n² — the third
//              is 19 dB down where a square's is 9.5 — with a sine an octave
//              *below* underneath it. It is the bottom a held root wants: felt
//              and not heard, and nearly nothing above 200 Hz.
//
// Three things are true of both and each is a rule from somewhere else:
//
// **They are mono, and it is a pin and not a hope.** Every source is one
// channel, the output gain is pinned to one, and the graph's own kick bus is
// pinned besides (round G, and `kicks-alt.ts` says it again): a one-channel
// stream through the mid/side width stage is mono to the sample in Chromium and
// 0.0266 apart in Firefox.
//
// **The attack is linear from true zero.** An exponential from a ten-thousandth
// is a click at 40 Hz, where one cycle is twenty-five milliseconds and the ear
// hears the envelope and not the note.
//
// **Neither of them is drawn by anything.** They are on the `sub` bus at the
// `sub` level, which is a key the table already has, and no candidate list of
// any style names them.

import { midiToHz, route, startTime, MIN_RELEASE } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/** The settings block one of the two bottoms is made out of. */
type BottomSettings = Settings['subSoft'] | Settings['subTri'];

/**
 * The shared half: an envelope, a lid, and a mono pin.
 */
function bottom(ctx: BaseAudioContext, time: number, p: NoteParams, S: BottomSettings) {
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.05, p.dur ?? 0.22);
  const vel = p.vel ?? 1;
  const peak = vel * (p.gain ?? 1) * S.trim;

  const g = ctx.createGain();
  // One channel, explicitly, all the way to the bus.
  g.channelCount = 1;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'discrete';
  const attack = S.attack;
  const release = p.release ?? S.release;
  const end = time + Math.max(dur, attack + 0.02) + release;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.setValueAtTime(peak, Math.max(time + attack, time + dur - release));
  g.gain.linearRampToValueAtTime(0, end);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  // The lid follows the note, in harmonics rather than in hertz: a fixed corner
  // is a different instrument at the top of the range from at the bottom, and
  // what makes a bottom a bottom is how many harmonics it has, not where they
  // are. Velocity opens it, which is the only brightness these two have.
  lp.frequency.value = Math.min(4000, hz * S.harmonics * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  lp.connect(g);
  return { g, lp, end: end + MIN_RELEASE, hz, vel };
}

export function subSoft(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = settings.subSoft;
  const b = bottom(ctx, time, p, S);

  const sq = ctx.createOscillator();
  sq.type = 'square';
  sq.frequency.value = b.hz;
  const sqG = ctx.createGain();
  sqG.gain.value = S.squareLevel;
  sq.connect(sqG);
  sqG.connect(b.lp);
  sq.start(time);
  sq.stop(b.end);

  // A sine at the fundamental under it, because a square's own fundamental is
  // only 4/π of its peak and what is wanted at 40 Hz is all of it.
  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.value = b.hz;
  const sineG = ctx.createGain();
  sineG.gain.value = S.sineLevel;
  sine.connect(sineG);
  sineG.connect(b.lp);
  sine.start(time);
  sine.stop(b.end);

  const tail = insert(ctx, p, b.g, time, b.end, settings);
  route(ctx, tail, out, { dry: 1, delay: 0, reverb: 0 });
  return b.end;
}

export function subTri(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = settings.subTri;
  const b = bottom(ctx, time, p, S);

  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.value = b.hz;
  const triG = ctx.createGain();
  triG.gain.value = S.triLevel;
  tri.connect(triG);
  triG.connect(b.lp);
  tri.start(time);
  tri.stop(b.end);

  // The octave *below*, at a low level and only where there is room for it: a
  // sub-octave under a note in the top of the range is weight, and under a note
  // at the bottom of it is a rumble nothing can reproduce.
  if (b.hz >= S.octaveAboveHz) {
    const oct = ctx.createOscillator();
    oct.type = 'sine';
    oct.frequency.value = b.hz / 2;
    const octG = ctx.createGain();
    octG.gain.value = S.octaveLevel;
    oct.connect(octG);
    octG.connect(b.lp);
    oct.start(time);
    oct.stop(b.end);
  }

  const tail = insert(ctx, p, b.g, time, b.end, settings);
  route(ctx, tail, out, { dry: 1, delay: 0, reverb: 0 });
  return b.end;
}

/** MEASURED by `tools/test-voices-2.ts --bless`. */
export const SUB_SOFT_TIMBRES = {
  subSoft: { family: 'bass', struck: false, hold: 0.25, brightnessHz: 400, loudnessDb: -11.4 },
};
export const SUB_TRI_TIMBRES = {
  subTri: { family: 'bass', struck: false, hold: 0.3, brightnessHz: 260, loudnessDb: -11.9 },
};

export const subSoftDescriptor: Descriptor = {
  name: 'subSoft',
  cost: 'mid',
  family: 'bass',
  roles: ['bassline'],
  bus: 'sub',
  level: 'sub',
  layer: 'bass',
  plays: null,
  mono: true,
  treat: true,
  anticipates: null,
  prepare: null,
  render: subSoft,
  timbres: SUB_SOFT_TIMBRES,
  dispatches: [],
  mood: [],
};

export const subTriDescriptor: Descriptor = {
  name: 'subTri',
  cost: 'cheap',
  family: 'bass',
  roles: ['bassline'],
  bus: 'sub',
  level: 'sub',
  layer: 'bass',
  plays: null,
  mono: true,
  treat: true,
  anticipates: null,
  prepare: null,
  render: subTri,
  timbres: SUB_TRI_TIMBRES,
  dispatches: [],
  mood: [],
};

export const descriptors: Descriptor[] = [subSoftDescriptor, subTriDescriptor];
export default descriptors;
