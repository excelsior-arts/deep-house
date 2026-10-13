// A second saw pad, and it is the supersaw's opposite.
//
// Round K2's `supersaw-pad.ts` is seven saws detuned **evenly** across
// twenty-two cents and panned evenly with them, under a filter that opens over
// four and a half seconds: wide, bright, and the furthest thing in the
// catalogue from anything else in it. This is three saws, two of them an octave
// apart, detuned **unevenly** and narrowly, under a filter that *closes*.
//
// Three decisions and each is the difference from the voice it stands beside:
//
//   **Three and not seven.** A stack's beating is the sum of every pair, so
//   seven voices beat at twenty-one rates and the result is a texture with no
//   rate in it. Three beat at three, and a listener hears them: this pad has a
//   slow wobble where the supersaw has a wash.
//
//   **An octave in the stack and not a wider detune.** The second saw is at the
//   octave rather than a few cents away, so what the pad is is two registers
//   and not one thick one — which is what a string section or an organ actually
//   is, and what makes this one sit *under* a lead rather than across it.
//
//   **The filter closes.** The supersaw opens from 850 Hz to 2.5 kHz over four
//   and a half seconds, which is an arrangement; this one opens fast and falls
//   back over two, which is a **swell** — the note arrives bright and settles,
//   which is what a bowed or blown pad does and what nothing else in this
//   catalogue does. The timbre study's *nothing closes a filter inside a note*
//   is a measurement of held chords in a *mix*; a pad whose note is four bars
//   long is the one case it was never about.

import { midiToHz, adsrEnv, route, panner, startTime, phasedLfo } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import { centsOf, liveOf, side } from './live.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, CENTS, DB, HZ, LEVEL, LFO_HZ, SECONDS, UNIT } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

/** The stack: [octave, cents, level, pan]. Unevenly spaced on purpose. */
const STACK: number[][] = [
  [0, -7, 1, -0.7],
  [0, 5, 0.9, 0.7],
  [1, 2, 0.45, 0],
];

function sawPad(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.3, p.dur ?? 3.5);
  const vel = p.vel ?? 0.7;

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: p.attack ?? S.attack, decay: S.decay, sustain: S.sustain,
    hold: Math.max(0, dur - (p.attack ?? S.attack) - S.decay), release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  const open = Math.min(9000, S.openTo * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  const settle = Math.max(120, S.cutoff * (p.cutoffMul ?? 1));
  lp.frequency.setValueAtTime(settle, time);
  lp.frequency.exponentialRampToValueAtTime(open, time + S.swellTime);
  lp.frequency.exponentialRampToValueAtTime(settle, time + S.swellTime + S.settleTime);
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  // The three beat at three rates, and a slow drift on the outer two keeps
  // those rates from being three constants.
  // R74: a phase in radians off the note's own pitch, as its siblings' are — it was
  // a fraction of a turn off the context's clock, so 11 of 64 steps were reachable
  // and live, render and a seek each started it somewhere else.
  const drift = phasedLfo(ctx, S.driftHz, ((p.midi ?? 60) % 7) * 0.9);
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = S.driftCents;
  drift.connect(driftDepth);
  drift.start(time);
  drift.stop(end + 0.05);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const layers: Array<{ lvl: GainNode; pn: StereoPannerNode; level: number; pan: number }> = [];
  STACK.forEach(([octave, cents, level, pan]: number[], i: number) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz * Math.pow(2, octave);
    o.detune.value = cents;
    if (i < 2) driftDepth.connect(o.detune);
    const lvl = ctx.createGain();
    lvl.gain.value = level * S.voiceLevel;
    const pn = panner(ctx, pan * spread);
    o.connect(lvl);
    lvl.connect(pn);
    pn.connect(hp);
    o.start(time);
    o.stop(end + 0.05);
    layers.push({ lvl, pn, level, pan });
  });

  // **What this chord can still take** (PLAN-DESK D1b): the corner it
  // settles at, as a `detune` on the filter (the swell under way kept, scaled
  // as the note scales it), the Q, the floor, the drift, the spread and the
  // level against the trim it was built at. How far the swell opens and when,
  // and the envelope, are the build's.
  const live = liveOf(ctx);
  if (live) {
    const cur = { voiceLevel: S.voiceLevel, trim: S.trim };
    const lvls = () => layers.map(({ lvl, level }) => [lvl.gain, level * cur.voiceLevel * (S.trim > 0 ? cur.trim / S.trim : 1)] as [AudioParam, number]);
    live
      .on('cutoff', (v) => [[lp.detune, centsOf(Math.max(120, v * (p.cutoffMul ?? 1)), settle)]])
      .on('q', (v) => [[lp.Q, v]])
      .on('hpHz', (v) => [[hp.frequency, v]])
      .on('driftHz', (v) => [[drift.frequency, v]])
      .on('driftCents', (v) => [[driftDepth.gain, v]])
      .on('spread', (v) => (p.spread != null ? [] : layers.map(({ pn, pan }) => [pn.pan, side(pan * v * (p.spreadMul ?? 1))] as [AudioParam, number])))
      .on('voiceLevel', (v) => { cur.voiceLevel = v; return lvls(); })
      .on('trim', (v) => { if (!(S.trim > 0)) return []; cur.trim = v; return lvls(); })
      .keep(row.id, row, settings, end + 0.05);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.1, reverb: p.reverb ?? 0.6 });
  return end;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  voiceLevel: LEVEL,
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  release: SECONDS,
  cutoff: HZ,
  openTo: HZ,
  swellTime: SECONDS,
  settleTime: SECONDS,
  q: DB,
  veloOpen: num(0, 8),
  hpHz: HZ,
  driftHz: LFO_HZ,
  driftCents: CENTS,
  spread: UNIT,
  trim: LEVEL,
});

/**
 * The saw pad topology: detuned saws under a filter that swells open and
 * settles (`sounds/ensemble/sawPad.json` since round R2).
 */
export const SAW_PAD: Topology = {
  id: 'saw-pad',
  cost: 'mid',
  parameters: PARAMETERS,
  // D1b: the corner it settles at, the Q, the floor, the drift, the spread and the level; the swell's opening and times and the envelope are the build's
  live: { cutoff: 'hz', q: 'db', hpHz: 'hz', driftHz: 'hz', driftCents: 'cents', spread: 'ratio', voiceLevel: 'level', trim: 'level' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => sawPad(row, ctx, out, time, p, settings),
};
