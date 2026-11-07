// An FM growl: one sine throwing another at a whole-number ratio, driven, through a moving pair of formants and a
// short comb. Round dark-fronts (11-03): the front voices for the dark, bass-heavy places, where the bass leads and a
// front voice punctuates it.
//
// The catalogue's FM voices are bells and electric pianos: an index that falls inside a second and leaves a near-sine
// ringing. A neuro stab is the other way round: the index is the sound, and it moves. This is that instrument, short,
// and its slower cousin, a low formant call.
//
//   the operator   one modulator at `ratio` times the note, thrown at `index` (at nought and per unit of velocity, in
//                  units of the carrier's frequency), struck `indexPeak` times higher and falling onto it over
//                  `indexTime`; a wobble (`wobbleHz`, `wobbleDepth`) moves the index under the note, which is the
//                  growl. Two carriers `detuneCents` apart, panned `spread` to the sides: in phase, the width a pair
//                  of detuned oscillators makes and never an anti-phase trick.
//   the attack     the pitch falls `pitchDropCents` onto the note over `pitchTime` (the "yoi" of the stab), and a
//                  breath of noise (`noise`, band-passed at `noiseHz`, gone in `noiseTime`) goes into the drive with
//                  it, so the grit has an edge at the note's own register and never an octave over it.
//   the drive      a tanh at `drive`, before the mouth: the operator's partials folded into a denser band.
//   the mouth      two band-passes walking from `vowelFrom` to `vowelTo` (each a pair of hertz) over `vowelTime`, at
//                  `formantQ`, mixed over the driven line at `formantMix`.
//   the comb       a feedback delay `combMs` long (at least a render quantum, so 3 ms and up) at `combFeedback`, mixed
//                  in at `combMix`: a metallic ring under the growl.
//   the end        a fall of `bendCents` over the note's last `bendTime` (the call's drop); nought, none.
//   a note's own   `attack`, `vowelTime`, `wobbleDepth`, `bendCents`, `bendTime` over the row's, and a glide in
//                  (`slideCents` from the note before, over `slideTime`) in place of the strike's fall: a long curve.
//   the band       a high-pass at `hpHz` (nothing of it under the bass) and a lid at `lpHz`, which `p.edge` (Spark)
//                  opens by up to `edgeOpen` times, with more noise and drive; `p.light` is not read.
//
// Stereo, on the `keys` bus at the `keys` level. Named by no lane (`plays: null`) and held at nought in house-v2 by
// name (`AWAITING`): the round's sketches play it (`src/front-sketch.ts` in the app) and nothing else does.

import { midiToHz, adsrEnv, route, panner, startTime, curveOf, noiseSource, CUTOFF_FLOOR, GAIN_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, list, num, CENTS, HZ, LEVEL, LFO_HZ, RATIO, SECONDS, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';

const clamp01 = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** A tanh normalised to its own ceiling, by its drive rounded to a tenth (a theme shares a handful of curves). */
const driveCurve = (k: number) => {
  const d = Math.max(0.1, Math.round(k * 10) / 10);
  return curveOf(`fm-growl:drive:${d}`, () => {
    const n = 2048, c = new Float32Array(n), top = Math.tanh(d);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(d * x) / top; }
    return c;
  });
};

function fmGrowl(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const S = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.04, p.dur ?? 0.25);
  const vel = p.vel ?? 0.8;
  const edge = clamp01(p.edge);

  // The level: a strike, a decay to the sustain, held to the note's end and released.
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  // a note may ask its own attack, vowel walk, wobble, glide in and fall (the long curve: round dark-fronts' second pass)
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const attack = Math.min(num(p.attack, S.attack), dur * 0.5);
  const vowelTime = num(p.vowelTime, S.vowelTime), wobbleDepth = num(p.wobbleDepth, S.wobbleDepth);
  const bendCents = Math.min(0, num(p.bendCents, S.bendCents)), bendTime = Math.max(0, num(p.bendTime, S.bendTime));
  const slideCents = num(p.slideCents, 0), slideTime = Math.max(0.005, num(p.slideTime, 0.1));
  const decay = Math.min(S.decay, Math.max(0.01, dur - attack));
  const end = adsrEnv(g, time, Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * S.trim), {
    attack, decay, sustain: S.sustain, hold: Math.max(0, dur - attack - decay), release: p.release ?? S.release,
  });
  const stop = end + 0.02;

  // The band: the floor, then the lid the edge opens.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(16000, S.lpHz * (1 + (S.edgeOpen - 1) * edge) * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.Q.value = 0.7;
  hp.frequency.value = S.hpHz;
  hp.connect(lp);

  // The comb, beside the dry line into the band.
  const mouthOut = ctx.createGain();
  mouthOut.connect(hp);
  if (S.combMix > 0.001 && S.combFeedback > 0) {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = Math.max(0.003, S.combMs / 1000);
    const fb = ctx.createGain();
    fb.gain.value = S.combFeedback;
    const wet = ctx.createGain();
    wet.gain.value = S.combMix;
    mouthOut.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(wet);
    wet.connect(hp);
  }

  // The mouth: two band-passes walking from one vowel to the other, over the driven line.
  const driven = ctx.createWaveShaper();
  driven.curve = driveCurve(S.drive * (1 + 0.5 * edge));
  driven.oversample = 'none';
  const dry = ctx.createGain();
  dry.gain.value = 1 - S.formantMix;
  driven.connect(dry);
  dry.connect(mouthOut);
  if (S.formantMix > 0.001) {
    const walk = Math.max(0.01, Math.min(vowelTime, dur + 0.2));
    for (let k = 0; k < 2; k++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = S.formantQ;
      bp.frequency.setValueAtTime(Math.max(CUTOFF_FLOOR, S.vowelFrom[k]), time);
      bp.frequency.exponentialRampToValueAtTime(Math.max(CUTOFF_FLOOR, S.vowelTo[k]), time + walk);
      const lvl = ctx.createGain();
      // the formant band's own level: a narrow band passes a fraction of the line, so it is lifted by its Q
      lvl.gain.value = S.formantMix * Math.sqrt(S.formantQ) * (k === 0 ? 1 : 0.7);
      driven.connect(bp);
      bp.connect(lvl);
      lvl.connect(mouthOut);
    }
  }

  // The operator: one modulator, its index struck high and falling, the wobble moving it; two carriers.
  const ratio = S.ratio;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = hz * ratio;
  const idx = ctx.createGain();
  const base = hz * (S.index[0] + S.index[1] * vel);
  idx.gain.setValueAtTime(base * S.indexPeak, time);
  idx.gain.exponentialRampToValueAtTime(Math.max(1e-3, base), time + Math.max(0.005, S.indexTime));
  mod.connect(idx);
  if (wobbleDepth > 0.001 && S.wobbleHz > 0) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = S.wobbleHz;
    const depth = ctx.createGain();
    depth.gain.value = base * wobbleDepth;
    lfo.connect(depth);
    depth.connect(idx.gain);
    lfo.start(time);
    lfo.stop(stop);
  }
  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  sum.connect(driven);
  // the breath into the drive with the operator, so the grit is shared and sits at the note's register
  const breath = S.noise * (1 + 0.6 * edge);
  if (breath > 0.001) {
    const n = noiseSource(ctx, time, Math.min(stop - time, S.noiseTime * 4 + 0.02));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.value = S.noiseHz;
    const lvl = ctx.createGain();
    lvl.gain.setValueAtTime(breath * vel, time);
    lvl.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + Math.max(0.005, S.noiseTime));
    n.connect(bp);
    bp.connect(lvl);
    lvl.connect(sum);
  }
  // the pitch: the strike's fall onto the note, and the end's fall off it
  const pitch = (param: AudioParam) => {
    if (Math.abs(slideCents) > 1) {
      // a glide in from the note before: the pitch starts where that note was and slides onto this one
      param.setValueAtTime(slideCents, time);
      param.linearRampToValueAtTime(0, time + slideTime);
    } else {
      param.setValueAtTime(S.pitchDropCents, time);
      param.exponentialRampToValueAtTime(0.01, time + Math.max(0.005, S.pitchTime));
    }
    if (bendCents < -1 && bendTime > 0) {
      const from = Math.max(time + Math.max(S.pitchTime, Math.abs(slideCents) > 1 ? slideTime : 0), time + dur - bendTime);
      param.setValueAtTime(0, from);
      param.linearRampToValueAtTime(bendCents, time + dur);
    }
  };
  pitch(mod.detune);
  mod.start(time);
  mod.stop(stop);
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  for (const side of [-1, 1]) {
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = hz;
    // the pair's detune is a fixed offset the pitch envelope rides on (an offset node, so the two stay apart)
    const off = ctx.createConstantSource();
    off.offset.value = side * S.detuneCents * 0.5;
    off.connect(car.detune);
    off.start(time);
    off.stop(stop);
    pitch(car.detune);
    idx.connect(car.frequency);
    const pan = panner(ctx, side * spread);
    car.connect(pan);
    pan.connect(sum);
    car.start(time);
    car.stop(stop);
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? S.delay, reverb: p.reverb ?? S.reverb });
  return end;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  trim: LEVEL,
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  release: SECONDS,
  /** the modulator's ratio to the note: whole numbers keep the growl harmonic */
  ratio: RATIO,
  /** how far the modulator throws the carrier: at nought and per unit of velocity, in units of the note */
  index: list(num(0, 32), 2),
  /** the strike's index over the held one */
  indexPeak: num(1, 8),
  /** how long the strike's index takes to fall onto the held one */
  indexTime: SECONDS,
  /** the growl: a wobble on the index, its rate and its depth as a share of the held index */
  wobbleHz: LFO_HZ,
  wobbleDepth: UNIT,
  /** the strike's fall onto the note, in cents, and how long it takes */
  pitchDropCents: num(0.01, 2400),
  pitchTime: SECONDS,
  /** the end's fall off the note (nought or above: none), over the note's last `bendTime` */
  bendCents: num(-1200, 0),
  bendTime: num(0, 2),
  /** the tanh's drive */
  drive: num(0.1, 8),
  /** the mouth: two formants walking from one vowel to the other */
  vowelFrom: list(HZ, 2),
  vowelTo: list(HZ, 2),
  vowelTime: SECONDS,
  formantQ: num(0.5, 30),
  formantMix: UNIT,
  /** the comb: a feedback delay at least a render quantum long */
  combMs: num(3, 30),
  combFeedback: num(0, 0.9),
  combMix: UNIT,
  /** the strike's breath: its level against the operator, its band and its fall */
  noise: num(0, 2),
  noiseHz: HZ,
  noiseTime: SECONDS,
  /** the band: the lid, the floor, and how far a full edge opens the lid */
  lpHz: HZ,
  hpHz: HZ,
  edgeOpen: num(1, 4),
  detuneCents: CENTS,
  spread: UNIT,
  reverb: SEND,
  delay: SEND,
});

/** What a row of this topology carries, as its contract types it. */
export type FmGrowlPatch = PatchOf<typeof PARAMETERS.fields>;

/** The FM growl (`sounds/keyboard/neuroStab.json`, `formantCall.json`; round dark-fronts). */
export const FM_GROWL: Topology = {
  id: 'fm-growl',
  cost: 'dear',
  parameters: PARAMETERS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => fmGrowl(row, ctx, out, time, p, settings),
};
