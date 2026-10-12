// Two more keyboards: a bright piano register, and a reed organ.
//
// **`brightPiano`** is the second register the brief asks for, and it is a
// module of its own rather than a setting on `piano.ts` for a stated reason.
// That voice pre-renders a whole string per pitch and caches it — a hundred and
// seventy milliseconds of additive partials with an inharmonicity constant, per
// note, per context — and a second register through the same cache is a second
// cache, which doubles the preparation a theme pays for whether or not anything
// plays it. This is the same *physics* written cheaply: the partials are
// oscillators rather than a rendered buffer, there are six of them rather than
// twenty, and what makes it the upper register is that the top three carry more
// than they do down the keyboard. It is a bright, short, close-mic'd piano for
// figures above middle C and it is not a substitute for the one the record has.
//
// The inharmonicity is the number worth keeping: a real string is stiff, so its
// nth partial is at `n·f·sqrt(1 + B·n²)` and not at `n·f`. B is about 0.0004 in
// the middle of a piano and rises fast towards the top, which is why the top
// octave of a piano is tuned sharp and why a piano tuned to equal temperament
// by a machine sounds wrong. A tenth of a per cent at the sixth partial is
// audible as *piano* rather than as *organ*, and it is one multiplication.
//
// **`reedOrgan`** is the catalogue's organ with the one thing it has not: a
// reed. `keys.ts`'s organ patch is drawbars — sines at whole multiples, which
// is a pipe organ or a tonewheel — and a harmonium, a melodica or an accordion
// is a *sawtooth* through a narrow resonance, because what is vibrating is a
// metal tongue and not a column of air. So this is two saws a beat apart
// through a fixed formant-ish peak, with a puff of breath noise at the start
// that is the air arriving, and the slow, shallow wobble a bellows has. It is
// the reediest thing in the catalogue and the only voice in it with a bellows.

import { midiToHz, adsrEnv, route, panner, startTime, phasedLfo, noiseSource, MIN_RELEASE } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { Descriptor, Knobs, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, int, num, pos, DB, HZ, LEVEL, LFO_HZ, Q, SECONDS, UNIT, CENTS } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

function brightPiano(
  row: SoundRow,
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, BRIGHT);
  const hz = midiToHz(p.midi);
  const vel = p.vel ?? 1;
  const dur = Math.max(0.05, p.dur ?? 0.3);
  const peak = vel * (p.gain ?? 1) * S.trim;
  // The three knobs, as factors against the block's own numbers: exactly 1 with
  // nothing asked for, and `x * 1 === x` for every finite double.
  const kBright = knobScale(p, row.descriptor.knobs, 'brightnessHz');
  const kHold = knobScale(p, row.descriptor.knobs, 'hold');
  const attack = S.attack * knobScale(p, row.descriptor.knobs, 'attack');
  const release = S.release * kHold;
  const end = time + Math.max(dur, 0.12) + release;

  const g = ctx.createGain();
  g.gain.value = 1;
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(16000, (S.lpHz * kBright) * (1 + S.veloOpen * vel) * (p.cutoffMul ?? 1));
  lp.connect(g);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (let n = 1; n <= S.partials; n++) {
    // Stiffness: the nth partial of a real string is sharp of the nth harmonic
    // by sqrt(1 + B·n²), and it is what tells a piano from an organ.
    const f = hz * n * Math.sqrt(1 + S.inharmonicity * n * n);
    if (f > 18000) break;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const env = ctx.createGain();
    // The upper partials die first and the fundamental holds: that ratio *is*
    // the decay of a piano, and `S.partialDecay` is how much faster each one
    // goes than the one below it.
    const decay = Math.min(dur + release, (S.decay * kHold) * Math.pow(S.partialDecay, n - 1));
    const level = (Math.pow(S.tilt, n - 1) + (n >= 4 ? S.upper * vel : 0)) * peak;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(1e-5, level * 0.001), time + attack + decay);
    env.gain.linearRampToValueAtTime(0, time + attack + decay + MIN_RELEASE);
    const pan = panner(ctx, (n % 2 ? 1 : -1) * spread * (n / S.partials));
    o.connect(env);
    env.connect(pan);
    pan.connect(lp);
    o.start(time);
    o.stop(Math.min(end, time + attack + decay + 0.01));
  }

  // The hammer: a very short band of noise where the felt lands. It is what a
  // listener hears before the pitch and it is four milliseconds long.
  const noise = noiseSource(ctx, time, S.hammerTime + 0.01);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(9000, S.hammerHz);
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, time);
  ng.gain.linearRampToValueAtTime(peak * S.hammerLevel * vel, time + 0.0008);
  ng.gain.exponentialRampToValueAtTime(0.0001, time + S.hammerTime);
  ng.gain.linearRampToValueAtTime(0, time + S.hammerTime + MIN_RELEASE);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(lp);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.1, reverb: p.reverb ?? 0.2, hall: p.hall ?? 0.3 });
  return end;
}

function reedOrgan(
  row: SoundRow,
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, REED);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.08, p.dur ?? 1.2);
  const vel = p.vel ?? 0.8;

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * S.trim, {
    attack: S.attack, decay: S.decay, sustain: S.sustain,
    hold: Math.max(0, dur - S.attack - S.decay), release: p.release ?? S.release,
  });
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(12000, S.lpHz * (p.cutoffMul ?? 1));
  lp.connect(g);
  // The reed's own resonance: a fixed peak, in hertz and not in harmonics,
  // because a metal tongue's body does not move with the note. It is what makes
  // the bottom of this instrument dark and the top of it nasal, which is what a
  // harmonium does.
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  // A peaking filter's Q *is* a real Q, unlike every lowpass in this engine.
  peak.frequency.value = S.formantHz;
  peak.Q.value = S.formantQ;
  peak.gain.value = S.formantDb;
  peak.connect(lp);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.Q.value = 0.7;
  hp.connect(peak);

  // The bellows: slow, shallow, on the level and not on the pitch — a pump
  // organ's unevenness is somebody's arm and not a vibrato.
  // R74: a phase in radians off the note's own pitch, as its siblings' are — it was
  // a fraction of a turn off the context's clock, so 11 of 64 steps were reachable
  // and live, render and a seek each started it somewhere else.
  const bellows = phasedLfo(ctx, S.bellowsHz, ((p.midi ?? 60) % 5) * 1.3);
  const bellowsDepth = ctx.createGain();
  bellowsDepth.gain.value = S.bellowsDepth;
  bellows.connect(bellowsDepth);
  const wobble = ctx.createGain();
  wobble.gain.value = 1;
  bellowsDepth.connect(wobble.gain);
  wobble.connect(hp);
  bellows.start(time);
  bellows.stop(end + 0.05);

  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = side * S.beatCents * 0.5;
    const pan = panner(ctx, side * spread);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    o.connect(lvl);
    lvl.connect(pan);
    pan.connect(wobble);
    o.start(time);
    o.stop(end + 0.05);
  }

  // The air arriving: a short breath, which is the one thing a drawbar organ
  // has not got and a blown one always has.
  const air = noiseSource(ctx, time, S.breathTime + 0.02);
  const abp = ctx.createBiquadFilter();
  abp.type = 'bandpass';
  abp.frequency.value = Math.min(9000, hz * 6);
  abp.Q.value = 0.8;
  const ag = ctx.createGain();
  ag.gain.setValueAtTime(0, time);
  ag.gain.linearRampToValueAtTime(S.breathLevel * vel, time + 0.006);
  ag.gain.exponentialRampToValueAtTime(0.0001, time + S.breathTime);
  ag.gain.linearRampToValueAtTime(0, time + S.breathTime + MIN_RELEASE);
  air.connect(abp);
  abp.connect(ag);
  ag.connect(wobble);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.1, reverb: p.reverb ?? 0.44 });
  return end;
}

/** What a bright piano row carries: exactly these, each in its range (`schema.ts`). */
const BRIGHT = contract({
  /** how many partials, each an oscillator: a bounded bank */
  partials: int(1, 32),
  inharmonicity: num(0, 0.1),
  attack: SECONDS,
  decay: SECONDS,
  /** how much faster each partial falls than the one under it: a factor per partial */
  partialDecay: pos(2),
  /** each partial's level against the one under it */
  tilt: num(0, 2),
  upper: LEVEL,
  release: SECONDS,
  lpHz: HZ,
  veloOpen: num(0, 8),
  hammerHz: HZ,
  hammerLevel: LEVEL,
  hammerTime: SECONDS,
  spread: UNIT,
  trim: LEVEL,
});

/**
 * The bright piano topology: six stiff partials with the inharmonicity that
 * tells a piano from an organ (`sounds/keyboard/brightPiano.json` since round
 * R2). `hold` is in seconds — the fundamental's own decay — because this voice
 * has no sustain: the knob scales the decay and the release together, so the
 * ratio between the partials is untouched.
 */
export const BRIGHT_PIANO: Topology = {
  id: 'bright-piano',
  cost: 'dear',
  parameters: BRIGHT,
  knobOf: { brightnessHz: 'lpHz', hold: 'decay', attack: 'attack' },
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => brightPiano(row, ctx, out, time, p, settings),
};

/** What a reed organ row carries: exactly these, each in its range (`schema.ts`). */
const REED = contract({
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  release: SECONDS,
  beatCents: CENTS,
  formantHz: HZ,
  formantQ: Q,
  formantDb: DB,
  lpHz: HZ,
  hpHz: HZ,
  bellowsHz: LFO_HZ,
  bellowsDepth: UNIT,
  breathLevel: LEVEL,
  breathTime: SECONDS,
  spread: UNIT,
  trim: LEVEL,
});

/**
 * The reed organ topology: beating reeds through a formant, with the
 * bellows breathing under them (`sounds/keyboard/reedOrgan.json` since round
 * R2).
 */
export const REED_ORGAN: Topology = {
  id: 'reed-organ',
  cost: 'dear',
  parameters: REED,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => reedOrgan(row, ctx, out, time, p, settings),
};
