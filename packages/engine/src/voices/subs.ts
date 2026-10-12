// The bottom topology: a soft square and a triangle, and anything between.
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
// pinned besides (round G, and `kit-kick.ts` says it again): a one-channel
// stream through the mid/side width stage is mono to the sample in Chromium and
// 0.0266 apart in Firefox.
//
// **The attack is linear from true zero.** An exponential from a ten-thousandth
// is a click at 40 Hz, where one cycle is twenty-five milliseconds and the ear
// hears the envelope and not the note.
//
// **The stack is the row's** (round R2: `sounds/bass/subSoft.json`,
// `subTri.json`). Four sources under one lid — a square, a sine at the
// fundamental, a triangle, a sine an octave below where the note is high
// enough for it — each built only where the row gives it a level, in that
// order, so a row is the bottom it says and the two that were two functions
// are two rows.


import { midiToHz, route, startTime, MIN_RELEASE } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import { liveOf } from './live.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, maybe, num, pos, DB, HZ, LEVEL, SECONDS } from './schema.ts';
import type { PatchOf } from './schema.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  attack: SECONDS,
  release: SECONDS,
  /** the four sources' levels, each built only where it is above nought */
  squareLevel: LEVEL,
  sineLevel: LEVEL,
  triLevel: LEVEL,
  octaveLevel: LEVEL,
  /** under this the octave below is not built: an octave below 55 Hz is a rumble nothing can reproduce; null where there is no octave */
  octaveAboveHz: maybe(HZ),
  /** the lid, in harmonics and not in hertz: what makes a bottom a bottom is how many harmonics it has and not where they are */
  harmonics: pos(64),
  veloOpen: num(0, 8),
  q: DB,
  trim: LEVEL,
});

/** What a row of this topology carries, as its contract types it. */
export type BottomPatch = PatchOf<typeof PARAMETERS.fields>;

/** The shared half: an envelope, a lid, and a mono pin. */
function bottom(ctx: BaseAudioContext, time: number, p: NoteParams, S: BottomPatch) {
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
  // is a different instrument at the top of the range from at the bottom.
  // Velocity opens it, which is the only brightness a bottom has.
  lp.frequency.value = Math.min(4000, hz * S.harmonics * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  lp.connect(g);
  return { g, lp, end: end + MIN_RELEASE, hz, vel };
}

/** One source of the stack, into the lid; its level's gain, for a hand on it. */
function source(ctx: BaseAudioContext, type: OscillatorType, hz: number, level: number, lid: AudioNode, time: number, end: number): GainNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.value = level;
  o.connect(g);
  g.connect(lid);
  o.start(time);
  o.stop(end);
  return g;
}

function render(row: SoundRow): VoiceRenderer {
  return (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number => {
    time = startTime(ctx, time);
    const S = patchOf(settings, row, PARAMETERS);
    const b = bottom(ctx, time, p, S);
    // A square's corners taken off by the lid; a sine at the fundamental under
    // it, because a square's own fundamental is only 4/π of its peak and what
    // is wanted at 40 Hz is all of it; a triangle, whose odd harmonics fall at
    // 1/n²; and the octave *below*, only where there is room for it.
    const levels: Array<[keyof BottomPatch, GainNode]> = [];
    if (S.squareLevel > 0) levels.push(['squareLevel', source(ctx, 'square', b.hz, S.squareLevel, b.lp, time, b.end)]);
    if (S.sineLevel > 0) levels.push(['sineLevel', source(ctx, 'sine', b.hz, S.sineLevel, b.lp, time, b.end)]);
    if (S.triLevel > 0) levels.push(['triLevel', source(ctx, 'triangle', b.hz, S.triLevel, b.lp, time, b.end)]);
    if (S.octaveLevel > 0 && S.octaveAboveHz !== null && b.hz >= S.octaveAboveHz) levels.push(['octaveLevel', source(ctx, 'sine', b.hz / 2, S.octaveLevel, b.lp, time, b.end)]);
    // **What this note can still take** (PLAN-DESK D1b): the lid — its
    // harmonics, its opening by velocity and its resonance — and the level of
    // each source it built, against the trim it was built at. A source the
    // row leaves at nought is not built and waits for the next note; the
    // envelope is the build's.
    const live = liveOf(ctx);
    if (live) {
      const cur = { harmonics: S.harmonics, veloOpen: S.veloOpen, trim: S.trim, ...Object.fromEntries(levels.map(([k]) => [k, S[k] as number])) } as Record<string, number>;
      const lid = (): Array<[AudioParam, number]> => [[b.lp.frequency, Math.min(4000, b.hz * cur.harmonics * (1 + cur.veloOpen * b.vel) * (p.cutoffMul ?? 1))]];
      const scaled = (): Array<[AudioParam, number]> => levels.map(([k, gn]) => [gn.gain, cur[k] * (S.trim > 0 ? cur.trim / S.trim : 1)]);
      live
        .on('harmonics', (v) => { cur.harmonics = v; return lid(); })
        .on('veloOpen', (v) => { cur.veloOpen = v; return lid(); })
        .on('q', (v) => [[b.lp.Q, v]])
        .on('trim', (v) => { if (!(S.trim > 0)) return []; cur.trim = v; return scaled(); });
      for (const [k] of levels) live.on(k, (v) => { cur[k] = v; return scaled(); });
      live.keep(row.id, row, settings, b.end);
    }
    const tail = insert(ctx, p, b.g, time, b.end, settings);
    route(ctx, tail, out, { dry: 1, delay: 0, reverb: 0 });
    return b.end;
  };
}

export const BOTTOM: Topology = {
  id: 'bottom',
  cost: 'mid',
  parameters: PARAMETERS,
  // D1b: the lid and the levels of the sources a note built; the envelope and which sources are built are the build's
  live: { harmonics: 'x', veloOpen: 'x', q: 'db', trim: 'level', squareLevel: 'level', sineLevel: 'level', triLevel: 'level', octaveLevel: 'level' },
  render,
};

export default BOTTOM;
