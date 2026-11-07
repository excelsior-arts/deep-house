// A supersaw played short: seven saws on the uneven detune curve, struck and gone, under a filter that falls onto its
// corner on every strike — and gritty by nature. Round trance-1 (10-28).
//
// The held supersaw (`supersaw-lead.ts`) opens slowly while it holds and never strikes again, and the pad
// (`supersaw-pad.ts`) is slower still. Neither can play a riff in sixteenths or a held chord chopped by a gate: this
// is that instrument.
//
//   the stack    seven saws at the classic uneven offsets (the outer pair furthest and beating fastest, the inner ones
//                close to the note), the outer four panned by `spread`, the centre three in the middle and a step
//                louder than the sides, so the line has one pitch and a width. Each starts a stated fraction of its
//                own period early under the level's nought, as the held supersaw's do (seven ramps in phase drop
//                together once a period: a click on the strike).
//   the strike   a short attack, a decay to `sustain`, a short release; the low-pass two stages deep, starting
//                `envMult` over its corner and falling onto it over `envTime` — a filter envelope per note.
//   the grit     its nature, and never a closed filter (his ear, 10-28: a trance supersaw anyone recognises, loud and
//                bright with dirt on it): a drive into a tanh, a crush (a staircase of 2^`crushBits` levels, mixed in at
//                `crushMix`), a breath of noise; the corner open in the kilohertz and the top past 7 kHz.
//   the light    `p.light` (0..1, the composer's: Gleam's upper part) pulls it clean: the crush leaves, the drive eases, the corner and
//                the top open, the band widens downward, the noise thins and the stack spreads a little wider.
//   the edge     `p.edge` (0..1, the composer's: Spark) is its edge: more drive, a sharper strike, and one saw an
//                octave over the note at a low blend — a parallel harmonic stage, never the note moved up.
//   the grit     `p.grit` (0..1, the composer's: round dark-fronts' tenth pass, his ear 11-04 on a dark front's
//                "modulation effects that make it cartoonish"): movement by grit and density, never by pitch. The
//                stack pulls tight (the detune down to a fifth of itself: no chorus beating), the strike's filter
//                fall flattens and its resonance goes (no zap), the crush deepens, the drive and the breath come up;
//                under `p.open` the crush rises across the hold, so a held chord thickens instead of sweeping.
//   the swell    `p.open` (seconds) plays a held chord that swells in and opens `p.openMul` over its corner, held at
//                `p.sustain` (round dark-fronts' second pass); absent, the strike as ever.
//   the gate     `p.gate` chops one held note into steps (`steps`, a level a step, nought shut; `stepS` seconds a step;
//                `open` the fraction of a step that sounds): each open step a fresh strike of the level and the filter,
//                so a chord held for two bars is two bars of sixteenths at the price of one note; `lift` is the gate's
//                level over the note's velocity (the composer writes a gated note's velocity as its energy); `lens` lets
//                a slice span steps (a sixteenth, a sixteenth, an eighth) and `gap` shuts every slice a fixed share of a
//                step before its end.
//
// Stereo, on the `melodic` bus at the `keys` level. It declares the `figure` and `melody` roles in the `keyboard`
// family and no lane names it: the composer plays it where its hook table says (`src/hook.ts`).

import { midiToHz, route, startTime, panner, curveOf, noiseSource, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, int, DB, HZ, LEVEL, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

/** The seven offsets, as fractions of `detune`: the classic uneven curve, wider at the outer voices. */
const OFFSETS = [-1, -0.572, -0.177, 0, 0.181, 0.565, 0.977];
/** Where in its own cycle each starts, as a fraction of a period. */
const PHASES = [0, 0.37, 0.71, 0.13, 0.52, 0.89, 0.26];
/** The outer four go to the sides; the middle three stay in the centre. */
const SIDE = [-1, -1, 0, 0, 0, 1, 1];

const clamp01 = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** A tanh normalised to its own ceiling, by its drive rounded to a tenth (so a theme shares a handful of curves). */
const driveCurve = (k: number) => {
  const d = Math.max(0.1, Math.round(k * 10) / 10);
  return curveOf(`supersaw-grit:drive:${d}`, () => {
    const n = 2048, c = new Float32Array(n), top = Math.tanh(d);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(d * x) / top; }
    return c;
  });
};
/** A staircase of 2^bits levels across the swing. */
const crushCurve = (bits: number) => curveOf(`supersaw-grit:crush:${bits}`, () => {
  const n = 4096, c = new Float32Array(n), half = 2 ** (bits - 1);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * half) / half; }
  return c;
});

/**
 * `lift`: the gate's own level over the note's velocity (the composer writes a gated note's velocity as the energy it sounds
 * over its length). `lens`: a slice's length in steps, by the step it starts on (one where none is given; the steps it
 * covers are not struck). `gap`: where given, every slice shuts this share of a step before its end, whatever its length
 * (round trance-2: the reference's chop shuts a constant ~50 ms before the next slice, a sixteenth or an eighth), in place
 * of `open`'s share of the slice.
 */
interface Gate { steps: number[]; stepS: number; open?: number; lift?: number; lens?: number[]; gap?: number;
  /** the chop's depth: the level a shut slice keeps, a share of the slice's (nought: shut; round trance-2, source 10's
   * chop measured from ~4 dB deep in its tease to ~20 dB at its peak) */
  floor?: number }
const gateOf = (g: unknown): Gate | null => {
  const x = g as Gate | null | undefined;
  return x && Array.isArray(x.steps) && x.steps.length && Number.isFinite(x.stepS) && x.stepS > 0.02 ? x : null;
};

function supersawGrit(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.03, p.dur ?? 0.25);
  const vel = p.vel ?? 0.8;
  const light = clamp01(p.light), edge = clamp01(p.edge), grit = clamp01(p.grit);
  const gate = gateOf(p.gate);

  const corner = Math.min(15000, S.cutoffHz * (1 + (S.lightOpen - 1) * light) * (p.cutoffMul ?? 1));
  const envFrom = Math.min(16000, corner * (1 + (S.envMult - 1) * (1 - 0.85 * grit)) * (1 + 0.5 * edge));
  const envTime = S.envTime * (1 - 0.35 * edge);
  const attack = Math.max(0.0015, Math.min(p.attack ?? S.attack * (1 - 0.5 * edge), dur * 0.5));
  const release = Math.max(MIN_RELEASE, (p.release ?? S.release) * (1 - 0.4 * edge));
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim * (1 + (S.lightLevel - 1) * light));
  const end = time + dur + release;
  const stop = end + MIN_RELEASE;

  // The level: a strike and a decay to the sustain; or, under a gate, a strike on every open step.
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);

  // Two low-pass stages, both moving together, the second resonant.
  const lps: BiquadFilterNode[] = [S.resonanceDb * (1 - grit) - 3.01, -3.01].map((q) => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.value = Math.max(CUTOFF_FLOOR, envFrom);
    return f;
  });
  const strikeFilter = (t: number, over: number, lift: number) => {
    const from = Math.max(CUTOFF_FLOOR, corner + (envFrom - corner) * lift);
    for (const f of lps) {
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(CUTOFF_FLOOR, corner), t + Math.max(0.01, over));
    }
  };

  if (gate) {
    const open = Math.max(0.2, Math.min(1, (gate.open ?? 0.7) * (1 - 0.1 * edge)));
    const stepAttack = Math.min(attack, gate.stepS * 0.3);
    const close = Math.max(0.003, Math.min(0.012, gate.stepS * 0.15) * (1 - 0.4 * edge));
    let last = time, covered = 0, low = 0;
    const floor = Math.max(0, Math.min(0.9, gate.floor ?? 0));
    for (let k = 0; k < gate.steps.length; k++) {
      if (k < covered) continue;
      const len = Math.max(1, Math.round(gate.lens?.[k] ?? 1)), span = len * gate.stepS;
      covered = k + len;
      const t0 = time + k * gate.stepS;
      if (t0 >= time + dur - 0.005) break;
      const a = clamp01(gate.steps[k]);
      if (a <= 0) continue;
      const lvl = Math.max(GAIN_FLOOR, peak * a * Math.max(1, Math.min(8, gate.lift ?? 1)));
      // each open slice strikes the level and the filter again, and shuts before the next one: `open`'s share of the
      // slice, or a fixed `gap` (a share of a step, the edge widening it) before its end
      const shut = gate.gap != null ? span - Math.min(0.9, gate.gap * (1 + 0.2 * edge)) * gate.stepS : open * span;
      const tOpen = t0 + Math.max(stepAttack + 0.002, shut - close);
      const shutAt = Math.min(time + dur, tOpen + close);
      g.gain.setValueAtTime(low, Math.max(last, t0));
      g.gain.linearRampToValueAtTime(lvl, t0 + stepAttack);
      g.gain.linearRampToValueAtTime(lvl * (0.75 + 0.25 * S.sustain), Math.min(tOpen, shutAt - 0.001));
      low = lvl * floor;
      g.gain.linearRampToValueAtTime(low, shutAt);
      last = shutAt;
      strikeFilter(t0, Math.min(envTime, span * 0.9), 0.35 + 0.65 * a);
    }
    if (low > 0) { g.gain.setValueAtTime(low, Math.max(last, time + dur)); g.gain.linearRampToValueAtTime(0, Math.max(last, time + dur) + close); }
    else g.gain.setValueAtTime(0, Math.max(last, time + dur));
  } else if (typeof p.open === 'number' && p.open > 0) {
    // a held chord that swells (round dark-fronts' second pass): the level rises over the attack and holds, the filter
    // opens from its corner by `openMul` over `open` seconds instead of falling onto it; only a note that asks plays it
    const hold = Math.max(0.05, Math.min(1, typeof p.sustain === 'number' ? p.sustain : 0.9));
    g.gain.linearRampToValueAtTime(peak, time + attack);
    g.gain.setValueAtTime(peak, time + attack);
    g.gain.linearRampToValueAtTime(peak * hold, time + dur);
    g.gain.linearRampToValueAtTime(0, end);
    // (a filter that closes rather than opens, `openMul` under one: the dark front's movement, round dark-fronts)
    const to = Math.min(16000, corner * Math.max(0.2, Math.min(12, typeof p.openMul === 'number' ? p.openMul : 4)));
    for (const f of lps) {
      f.frequency.setValueAtTime(Math.max(CUTOFF_FLOOR, corner), time);
      f.frequency.exponentialRampToValueAtTime(Math.max(CUTOFF_FLOOR, to), time + Math.min(dur, p.open));
    }
  } else {
    const decayEnd = time + attack + S.decay;
    g.gain.linearRampToValueAtTime(peak, time + attack);
    if (decayEnd < time + dur) {
      g.gain.linearRampToValueAtTime(peak * S.sustain, decayEnd);
      g.gain.setValueAtTime(peak * S.sustain, time + dur);
    } else {
      g.gain.linearRampToValueAtTime(peak * (1 - (1 - S.sustain) * (dur - attack) / Math.max(1e-3, S.decay)), time + dur);
    }
    g.gain.linearRampToValueAtTime(0, end);
    strikeFilter(time, envTime, 1);
  }

  // The narrow band's top, after the grit: what keeps the crush's steps from turning into fizz.
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.Q.value = -3.01;
  top.frequency.value = Math.min(16000, S.topHz * (1 + (S.lightTop - 1) * light));
  top.connect(g);

  // The crush, mixed in, leaving as the light comes up; deeper with the grit, and under a held chord rising across the
  // hold (the chord thickens where it would have swept).
  const crushMix = Math.min(0.9, S.crushMix * (1 - light) + 0.45 * grit);
  const crushFrom = typeof p.open === 'number' && p.open > 0 && grit > 0.01 ? Math.min(0.9, S.crushMix * (1 - light)) : crushMix;
  const sum = ctx.createGain();
  sum.connect(top);
  const dry = ctx.createGain();
  dry.gain.value = 1 - crushFrom;
  dry.connect(sum);
  const driven = ctx.createWaveShaper();
  driven.curve = driveCurve(S.drive * (1 + (S.lightDrive - 1) * light) * (1 + S.edgeDrive * edge) * (1 + 1.5 * grit));
  driven.oversample = 'none';
  driven.connect(dry);
  if (crushMix > 0.01) {
    const crush = ctx.createWaveShaper();
    crush.curve = crushCurve(S.crushBits);
    crush.oversample = 'none';
    const wet = ctx.createGain();
    wet.gain.value = crushFrom;
    if (crushFrom !== crushMix) {
      const over = Math.min(dur, p.open as number);
      wet.gain.setValueAtTime(crushFrom, time);
      wet.gain.linearRampToValueAtTime(crushMix, time + over);
      dry.gain.setValueAtTime(1 - crushFrom, time);
      dry.gain.linearRampToValueAtTime(1 - crushMix, time + over);
    }
    driven.connect(crush);
    crush.connect(wet);
    wet.connect(sum);
  }
  lps[1].connect(driven);
  lps[0].connect(lps[1]);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = Math.max(40, S.hpHz * (1 - 0.4 * light));
  hp.Q.value = -3.01;
  hp.connect(lps[0]);

  // The stack: the outer four through two panners, the middle three in the centre and a step louder.
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const detune = S.detune * (1 + (S.lightDetune - 1) * light) * (1 - 0.8 * grit);
  const sideLevel = 1 / Math.sqrt(OFFSETS.length);
  const groups = new Map<number, AudioNode>();
  const groupOf = (side: number): AudioNode => {
    let n = groups.get(side);
    if (n) return n;
    const lvl = ctx.createGain();
    lvl.gain.value = side === 0 ? sideLevel * S.centre : sideLevel;
    if (side === 0) lvl.connect(hp);
    else { const pan = panner(ctx, side * spread); lvl.connect(pan); pan.connect(hp); }
    groups.set(side, lvl);
    return lvl;
  };
  OFFSETS.forEach((k, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = k * detune * 100;
    o.connect(groupOf(SIDE[i]));
    o.start(Math.max(0, time - PHASES[i] / hz));
    o.stop(stop);
  });
  // ...the edge's octave, one saw over the note at a low blend, in the centre
  const octave = S.octaveMix * edge;
  if (octave > 0.01) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz * 2;
    o.detune.value = 4;
    const lvl = ctx.createGain();
    lvl.gain.value = octave * sideLevel;
    o.connect(lvl);
    lvl.connect(hp);
    o.start(Math.max(0, time - 0.61 / (hz * 2)));
    o.stop(stop);
  }
  // ...and the breath, through the same filters, thinning as the light comes up
  const breath = S.noise * (1 - 0.6 * light) * (1 + grit);
  if (breath > 0.001) {
    const n = noiseSource(ctx, time, stop - time);
    const lvl = ctx.createGain();
    lvl.gain.value = breath;
    n.connect(lvl);
    lvl.connect(hp);
  }

  const tail = insert(ctx, p, g, time, stop, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.12, reverb: p.reverb ?? 0.22, sendLowHz: p.sendLowHz as number | undefined });
  return stop;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  release: SECONDS,
  /** the outermost saws' offset, as a fraction of a semitone */
  detune: num(0, 2),
  /** the detune's factor at a full light (round trance-2: the dark end source 10's ±24 cents, the bright end wider) */
  lightDetune: num(1, 3),
  /** the centre three's level over the sides' */
  centre: num(0.5, 2),
  /** how far across the field the outer four are panned */
  spread: UNIT,
  /** the corner the filter falls onto, in hertz */
  cutoffHz: HZ,
  /** where the strike starts, as a multiple of the corner */
  envMult: num(1, 12),
  /** how long the fall onto the corner takes */
  envTime: SECONDS,
  /** decibels of resonance at the corner */
  resonanceDb: DB,
  /** the band's floor: nothing of this belongs under the bass */
  hpHz: HZ,
  /** the band's top, after the grit */
  topHz: HZ,
  /** the drive into the tanh */
  drive: num(0.1, 8),
  /** the crush's depth, in bits */
  crushBits: int(3, 12),
  /** how much of the crush is mixed in */
  crushMix: UNIT,
  /** the breath of noise, as a level against the stack */
  noise: num(0, 0.5),
  /** the corner's factor at a full light (the bright end opens past the dark one's corner) */
  lightOpen: num(1, 4),
  /** the top's factor at a full light */
  lightTop: num(1, 4),
  /** the level's factor at a full light: the clean end's tanh drives less, so it is given its loudness back */
  lightLevel: num(1, 3),
  /** the drive's factor at a full light: the bright end is cleaner */
  lightDrive: num(0.1, 1),
  /** how much a full edge adds to the drive, as a share of it */
  edgeDrive: num(0, 3),
  /** the edge's octave layer at a full Spark */
  octaveMix: UNIT,
});

/** What a row of this topology carries, as its contract types it. */
export type SupersawGritPatch = PatchOf<typeof PARAMETERS.fields>;

/** The struck, gritty supersaw (`sounds/keyboard/supersawGrit.json`, round trance-1). */
export const SUPERSAW_GRIT: Topology = {
  id: 'supersaw-grit',
  cost: 'dear',
  parameters: PARAMETERS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => supersawGrit(row, ctx, out, time, p, settings),
};
