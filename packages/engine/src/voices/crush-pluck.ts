// A crushed metal pluck: a few inharmonic partials struck with a breath of noise and a fall onto the pitch, then
// sample-rate and bit reduced. Round dark-fronts (11-03): a front voice for the dark, bass-heavy places.
//
// **Arithmetic in a buffer, as the Karplus string is** (`karplus-pluck.ts`): a sample-and-hold has no node in Web
// Audio (a worklet would be the only way, at a worklet's cost on a phone), and a pluck is the same few thousand
// samples every time it plays a pitch. So the whole strike, the crush included, is computed once per pitch and per
// context and cached; a note at play is two buffer sources, a high-pass, a lid and an envelope.
//
//   the strike   `partials`, each `[ratio, decay, level]` (the ratios metal's, between the harmonics), all falling
//                `pitchCents` onto the note over `pitchTime`; a breath of noise (`noise`, darkened by `noiseTone`, gone
//                in `noiseTime`): the edge is the voice's own and at its own register.
//   the level    normalised on the ring (the tenth of a second after the strike, `ringLevel`), the strike allowed
//                `peakCeiling` over it, as the string is: a pluck read by its attack is a click.
//   the crush    held every `sampleRate / holdHz` samples (the reduced rate, its images the grit) and rounded to
//                `bits` bits, mixed over the clean strike at `crushMix`.
//   the play     the buffer twice, `detuneCents` apart, panned `spread` to the sides (in phase: two speeds of one
//                buffer, never an anti-phase pair); the lid at `lpHz`, opened by velocity (`veloOpen`), over a floor
//                at `hpHz`.
//
// **Ground by the note** (round dark-fronts' eighth pass, his ear 11-04: the marimba's clean tone "isn't a great fit"
// in the dark places, coloured instead by the birds, "bitcrusher or other processing events"): a note may carry the
// theme's colour and its own grind, and then the strike is computed twice, clean and ground, and played as two:
//
//   the colour   `p.colour` `{ bits, holdHz, drive, smear }` over the row's own: the crush's bits and held rate, a
//                tape's saturation in front of it (`drive`, a tanh, nought none) and the grains (`smear`: the ground
//                strike re-read as short overlapping grains from up to `smearTime` back, so its attack smears into its
//                tail); the ground strike set to the clean one's ring, so the grind moves the colour and not the level.
//   the grind    `p.grind`, one number or `[start, end]`: the ground strike's share over the clean one, walked across
//                the note (a processing event: the crush opening or closing over a phrase is the grind of its notes).
//
// A note with neither plays the one buffer it always did, `crushMix` mixed in it, sample for sample.
//
// Stereo, on the `keys` bus at the `keys` level. Named by no lane and held at nought in house-v2 by name (`AWAITING`):
// the round's sketches play it (`src/front-sketch.ts` in the app).

import { midiToHz, noteEnv, route, panner, startTime, lcg } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import type { NoteParams, PrepareOptions, VoiceRenderer } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, int, list, num, optional, pos, CENTS, HZ, LEVEL, SECONDS, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';

const PARAMETERS = contract({
  /** the strike's partials, each `[ratio, decay in seconds, level]` */
  partials: list(list(num(0.001, 64), 3), 1, 8),
  /** the fall onto the pitch at the strike, in cents, and how long it takes */
  pitchCents: num(0, 2400),
  pitchTime: SECONDS,
  /** the strike's breath: its level against the partials, its darkening (a one-pole's share) and its fall */
  noise: num(0, 4),
  noiseTone: UNIT,
  noiseTime: SECONDS,
  /** the crush: the held rate, the bits, and how much of it is mixed over the clean strike */
  holdHz: num(500, 48000),
  bits: int(2, 16),
  crushMix: UNIT,
  /** the buffer's length, and the level the ring is set to and the strike's ceiling over it */
  maxSeconds: pos(8),
  ringLevel: LEVEL,
  peakCeiling: LEVEL,
  /** the play */
  attack: SECONDS,
  release: SECONDS,
  lpHz: HZ,
  veloOpen: num(0, 8),
  hpHz: HZ,
  detuneCents: CENTS,
  spread: UNIT,
  cacheLimit: int(1, 512),
  /** the ground strike's tape (a tanh's drive, nought none), its grains (their share) and how far back a grain may read, and its length */
  drive: optional(UNIT),
  smear: optional(UNIT),
  smearTime: optional(SECONDS),
  grainTime: optional(SECONDS),
  trim: LEVEL,
  reverb: SEND,
  delay: SEND,
});

type CrushPluck = PatchOf<typeof PARAMETERS.fields>;

/** The rows of this topology, by event name, as the registry admitted them. */
const ROWS = new Map<string, SoundRow>();

const strikes = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** One crushed strike, as samples: deterministic, one channel, cached by pitch and by what it is computed from. */
export function crushBuffer(ctx: BaseAudioContext, midi: number, K: CrushPluck): AudioBuffer {
  let per = strikes.get(ctx);
  if (!per) { per = new Map(); strikes.set(ctx, per); }
  const drive = K.drive ?? 0, smear = K.smear ?? 0, smearTime = K.smearTime ?? 0.12, grainTime = K.grainTime ?? 0.04;
  const key = `${midi}:${JSON.stringify(K.partials)}:${K.pitchCents}:${K.pitchTime}:${K.noise}:${K.noiseTone}:${K.noiseTime}:${K.holdHz}:${K.bits}:${K.crushMix}:${K.maxSeconds}:${K.ringLevel}:${K.peakCeiling}:${ctx.sampleRate}`
    + (drive || smear ? `:${drive}:${smear}:${smearTime}:${grainTime}` : '');
  const had = per.get(key);
  if (had) return had;

  const sr = ctx.sampleRate;
  const hz = midiToHz(midi);
  const longest = Math.max(...K.partials.map((q) => q[1]));
  const len = Math.max(64, Math.ceil((Math.min(K.maxSeconds, longest * 7) + (smear > 0 ? smearTime : 0)) * sr));
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const parts = K.partials.filter((q) => q[0] * hz < sr * 0.45);
  const phase = new Float64Array(parts.length);
  const fall = parts.map((q) => Math.exp(-1 / (q[1] * sr)));
  const amp = parts.map((q) => q[2]);
  const noise = lcg(20261103);
  const nFall = Math.exp(-1 / (Math.max(1e-3, K.noiseTime) * sr));
  const pFall = Math.exp(-1 / (Math.max(1e-3, K.pitchTime) * sr));
  let nAmp = K.noise, low = 0, bend = K.pitchCents, peak = 0;
  for (let n = 0; n < len; n++) {
    const f = hz * Math.pow(2, bend / 1200);
    bend *= pFall;
    let y = 0;
    for (let k = 0; k < parts.length; k++) {
      phase[k] += (2 * Math.PI * parts[k][0] * f) / sr;
      y += amp[k] * Math.sin(phase[k]);
      amp[k] *= fall[k];
    }
    if (nAmp > 1e-5) {
      low += (1 - K.noiseTone) * (noise() - low);
      y += nAmp * low;
      nAmp *= nFall;
    }
    out[n] = y;
    if (Math.abs(y) > peak) peak = Math.abs(y);
  }
  // the ring sets the level; the strike may stand `peakCeiling` over it and no further
  const a0 = Math.min(len - 1, Math.round(0.02 * sr)), a1 = Math.min(len, Math.round(0.12 * sr));
  let sq = 0;
  for (let n = a0; n < a1; n++) sq += out[n] * out[n];
  const ring = Math.sqrt(sq / Math.max(1, a1 - a0));
  let scale = ring > 1e-6 ? K.ringLevel / ring : 0;
  if (peak * scale > K.peakCeiling) scale = K.peakCeiling / Math.max(1e-6, peak);
  // the crush: held at the reduced rate, rounded to the bits, over the clean strike; a tape's saturation in front of it
  const hold = Math.max(1, Math.round(sr / K.holdHz)), steps = 2 ** (K.bits - 1);
  const k = 1 + 6 * drive, tk = Math.tanh(k);
  let held = 0;
  const ground = smear > 0 ? new Float32Array(len) : null;
  for (let n = 0; n < len; n++) {
    const x = out[n] * scale;
    const s = drive > 0 ? Math.tanh(k * x) / tk : x;
    if (n % hold === 0) held = Math.round(Math.max(-1, Math.min(1, s)) * steps) / steps;
    if (ground) { ground[n] = held; out[n] = x; } else out[n] = (1 - K.crushMix) * x + K.crushMix * held;
  }
  // the grains: the ground strike re-read in short Hann grains, a third of a grain apart, each from a place up to
  // `smearTime` back (a fixed die), so the strike's attack recurs, fading, through its tail
  if (ground) {
    const G = Math.max(16, Math.round(grainTime * sr)), hop = Math.max(1, Math.round(G / 3)), back = Math.round(smearTime * sr);
    const die = lcg(20261104), grains = new Float32Array(len);
    const win = new Float32Array(G);
    for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / G);
    for (let c = 0; c < len; c += hop) {
      const from = Math.max(0, c - Math.round(((die() + 1) / 2) * back));
      for (let i = 0; i < G && c + i < len; i++) grains[c + i] += (win[i] * ground[Math.min(len - 1, from + i)]) / 1.5;
    }
    for (let n = 0; n < len; n++) out[n] = (1 - K.crushMix) * out[n] + K.crushMix * ((1 - smear) * ground[n] + smear * grains[n]);
  }
  // a coloured or wholly ground strike is set to its clean one's ring (the colour moves, not the level); a row's own
  // mix (`crushMix` under one, no colour) is the buffer it always was
  if (drive > 0 || smear > 0 || K.crushMix >= 1) {
    let q = 0;
    for (let n = a0; n < a1; n++) q += out[n] * out[n];
    const now = Math.sqrt(q / Math.max(1, a1 - a0)), want = ring * scale;
    if (now > 1e-6 && want > 1e-6) { const m = want / now; for (let n = 0; n < len; n++) out[n] *= m; }
  }
  if (per.size >= K.cacheLimit) per.delete(per.keys().next().value as string);
  per.set(key, buf);
  return buf;
}

/** The pre-render hook: the strikes this theme's notes want, before the first is due (a warm-up, never a requirement). */
export function prepareCrushPluck(ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[], opts: PrepareOptions = {}): Promise<void> {
  const from = opts.from ?? 0;
  const seen = new Set<string>();
  for (const e of events ?? []) {
    if (!e.p || e.p.midi == null || (e.t ?? 0) < from) continue;
    const row = ROWS.get(e.voice);
    const id = `${row?.id}:${e.p.midi}:${JSON.stringify(e.p.colour ?? null)}:${e.p.grind != null}`;
    if (!row || seen.has(id)) continue;
    seen.add(id);
    const K = patchOf(settings, row, PARAMETERS);
    for (const k of strikesOf(K, e.p)) crushBuffer(ctx, e.p.midi, k);
  }
  return Promise.resolve();
}

/** The colour a note asks over the row's own (`p.colour`), only the four fields it may move. */
interface Colour { bits?: number; holdHz?: number; drive?: number; smear?: number }
/**
 * The strikes a note plays: the row's one buffer where it carries no grind and no colour; else its clean strike (no
 * crush) and its ground one (wholly crushed, in the note's colour).
 */
function strikesOf(K: CrushPluck, p: NoteParams): CrushPluck[] {
  if (p.grind == null && !p.colour) return [K];
  const c = (p.colour ?? {}) as Colour;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
  return [
    { ...K, crushMix: 0, drive: 0, smear: 0 },
    { ...K, crushMix: 1, bits: Math.round(num(c.bits, 2, 16, K.bits)), holdHz: Math.round(num(c.holdHz, 500, 48000, K.holdHz)),
      drive: +num(c.drive, 0, 1, K.drive ?? 0).toFixed(2), smear: +num(c.smear, 0, 1, K.smear ?? 0).toFixed(2) },
  ];
}

function crushPluck(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  const time = startTime(ctx, at);
  const K = patchOf(settings, row, PARAMETERS);
  const vel = p.vel ?? 0.8;
  const dur = Math.max(0.04, p.dur ?? 0.3);
  const g = ctx.createGain();
  const end = noteEnv(g, time, vel * (p.gain ?? 1) * K.trim, K.attack, dur, p.release ?? K.release);
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(16000, K.lpHz * (1 + K.veloOpen * (vel - 0.5)) * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.Q.value = 0.7;
  hp.frequency.value = K.hpHz;
  hp.connect(lp);
  const spread = (p.spread ?? K.spread) * (p.spreadMul ?? 1);
  const strikes = strikesOf(K, p);
  if (strikes.length === 1) {
    const buf = crushBuffer(ctx, p.midi, K);
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (side * K.detuneCents * 0.5) / 1200);
      const pan = panner(ctx, side * spread);
      const lvl = ctx.createGain();
      lvl.gain.value = 0.5;
      src.connect(lvl);
      lvl.connect(pan);
      pan.connect(hp);
      src.start(time);
      src.stop(Math.min(end + 0.02, time + buf.duration / src.playbackRate.value));
    }
  } else {
    // the clean strike and the ground one, each a pair, the grind walked across the note between them
    const gr = Array.isArray(p.grind) ? p.grind : [p.grind ?? K.crushMix, p.grind ?? K.crushMix];
    const g0 = Math.max(0, Math.min(1, Number(gr[0]))), g1 = Math.max(0, Math.min(1, Number(gr[gr.length - 1])));
    strikes.forEach((k, j) => {
      const share = (x: number) => 0.5 * (j === 0 ? 1 - x : x);
      if (share(g0) < 1e-4 && share(g1) < 1e-4) return;
      const buf = crushBuffer(ctx, p.midi, k);
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(share(g0), time);
      if (g1 !== g0) bus.gain.linearRampToValueAtTime(share(g1), Math.max(time + 0.01, time + dur));
      bus.connect(hp);
      for (const side of [-1, 1]) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = Math.pow(2, (side * K.detuneCents * 0.5) / 1200);
        const pan = panner(ctx, side * spread);
        src.connect(pan);
        pan.connect(bus);
        src.start(time);
        src.stop(Math.min(end + 0.02, time + buf.duration / src.playbackRate.value));
      }
    });
  }
  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? K.delay, reverb: p.reverb ?? K.reverb });
  return end;
}

/** The crushed metal pluck (`sounds/keyboard/crushPluck.json`, round dark-fronts). */
export const CRUSH_PLUCK: Topology = {
  id: 'crush-pluck',
  cost: 'mid',
  parameters: PARAMETERS,
  prepare: prepareCrushPluck,
  rows: ROWS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => crushPluck(row, ctx, out, time, p, settings),
};
