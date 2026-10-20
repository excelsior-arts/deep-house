// A string over a jawari bridge: `karplusPluck`'s loop with the bridge's buzz in it.
//
// A tanpura's strings do not end on a knife edge. They lie over a wide, gently curved bridge (the jawari), and a
// thread under each string sets where it leaves the curve; the string, swinging, rolls on and off that surface every
// period. Each touch clips the string's swing on one side and puts a corner in it, so energy moves up into the
// harmonics on every round trip and the loop's own damping takes it back down: a balance that keeps a bright, buzzing
// band alive for the whole of a note where a clean string fades to its fundamental. And it **blooms**: a soft pluck
// starts round and dark, and the buzz grows over the first second as the touches pile harmonics up.
//
// This is the clean string's arithmetic with five things changed, all in the loop, all computed once per pitch into
// a buffer and cached, as `karplus-pluck.ts` is (a cycle through a `DelayNode` is a render quantum long, and the
// low strings are an octave or two under where that would even matter, but the loop is arithmetic for the same
// reason: it is in tune in every engine):
//
//   the bridge    after the loop's damping, a one-sided barrier: the string's swing past `1 - buzz` of its recent
//                 height (a peak follower over `swing` seconds) is held at that height. Being a share of the swing, it
//                 touches as hard at -40 dB as at the pluck: the buzz lasts the note. The contact comes in after the
//                 pluck over `bloom` seconds, so the first moment is the finger and the buzz is what follows it. And
//                 the bridge **moves energy and does not burn it**: what the barrier took over the last period is
//                 handed back to the whole swing (a gain the energy before and after it set, never over `GIVE_BACK`
//                 a sample), so the buzz is a colour, not a damper: the string rings within 1.5 dB of the clean one to
//                 3 s, 1-2.5 dB under it to 5 s and 2-4 dB under it to the buffer's end. Without it the barrier ate
//                 10-14 dB of the first second.
//   the rest      a string has no rest position but the middle, and a barrier on one side pushes the swing off it;
//                 a DC blocker in the loop (`dcHz`) keeps it centred so the string keeps meeting the bridge. Its phase
//                 lead at the fundamental is put back as length.
//   the fraction  the loop's fractional length is read through a first-order allpass, not a straight line between
//                 two samples: a line is a lowpass on every round trip, and a string that loses its top that fast
//                 has no top for the bridge to buzz.
//   the decay     `decay` is the seconds the fundamental takes to fall 60 dB, one gain per round trip.
//   the top       the string's own loss in its top (`topLossDb`): a linear-phase FIR in the loop, flat under 2 kHz
//                 to the fourth order and steep over 6, so the buzz's highest partials die faster than its middle.
//
// **Why the top, and not the bridge's shape** (ambient-voices-2, 10-18). At `buzz` 0.9 the barrier stands at a tenth
// of the swing, so most of each period lies on the bridge, and the give-back, restoring the energy every period,
// squeezes the string's free swing into one narrow pulse a period (two twenty-fourths of it at B2 two seconds in).
// That pulse's narrowness is the harsh top: three quarters of the energy over 6 kHz lies in it, not at the corners
// where the string meets the bridge, and its width is set by nothing but the loop's loss a round trip, which is why
// the top stood about as high at every pitch where a clean string's falls with pitch. A curved bridge (a soft knee, or
// the barrier's push through a lowpass at 1-6 kHz) left the top within 1.5 dB; the aliases sat 65-85 dB under the
// 2-12 kHz band (no grit to take out). A loss in the loop's top widens the pulse at its source.
//
// **The pitch is read back.** The barrier takes a little from every swing, and a string that loses its tops reads
// flat: hardest just after the pluck, while the bloom comes in (the low Sa 13-24 cents at 0.1-0.35 s, 6-9 at
// 0.35-0.7), and a few cents in the steady ring (3.6 at 62 Hz, 1.0 at 185). The string is computed, its fundamental is
// read off the buffer over three windows (`READS`, a Goertzel scan over a stretch windowed once, to a tenth of a cent),
// and the buffer is played at a rate that runs through the three readings (held, two straight lines, held): within
// 3.2 cents over 0.1-0.5 s and 2 over the ring, at both rates (`tools/check-drone-voices.ts` holds 4 and 2). A clean
// string (`buzz` nought) reads nothing. The three readings cost 20-60 ms a string in node, where one scan of 2.9 s
// with its window worked out in every sample cost 70-175.
//
// **Its range.** `buzz` at most 0.95 (`BUZZ_MOST`: at one the barrier sits at the string's rest and the string is
// dead), kept by the cache to a twentieth (`buzzBucket`); made for MIDI 30-60; the buffer's last half second faded,
// so a note held past its seven seconds ends on silence.
//
// The pluck is a finger's: a few milliseconds of noise through a lowpass at `softHz`, its bottom taken out. The body
// outside the loop is the clean string's (a highpass and a lowpass velocity opens). The width is one buffer played
// twice a cent or so apart and panned apart, as the clean string's is.

import { midiToHz, noteEnv, route, panner, startTime, lcg } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import { withControls } from './descriptor.ts';
import type { NoteParams, PrepareOptions, VoiceRenderer } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, int, inUnit, num, pos, CENTS, HZ, LEVEL, SECONDS, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
/** The share of `buzz` the bridge may take: at one the barrier sits at the string's rest and the string is dead. */
export const BUZZ_MOST = 0.95;

const PARAMETERS = contract({
  /** the pluck: seconds of noise, and the finger's lowpass over it */
  burst: pos(0.1),
  softHz: HZ,
  /** the loop's damping: the weight on the newer of its two taps (nearer 1 loses less of the top) */
  damp: num(0.5, 0.999),
  /** seconds for the fundamental to fall 60 dB, and the longest buffer kept */
  decay: pos(30),
  maxSeconds: pos(10),
  /** the bridge: how deep it presses into the swing (nought is a clean string), how soon after the pluck it is all in, and the follower's memory */
  buzz: num(0, BUZZ_MOST),
  bloom: SECONDS,
  swing: SECONDS,
  /** the loop's DC blocker */
  dcHz: num(0.1, 20),
  /** the string's loss in its top: dB a round trip at 8 kHz, over the three passes of `topTaps` (nought: none) */
  topLossDb: inUnit(num(0, 12), 'db'),
  /** what the ring is normalised to, and how far over it the pluck may stand */
  ringLevel: LEVEL,
  peakCeiling: LEVEL,
  detuneCents: CENTS,
  spread: UNIT,
  attack: SECONDS,
  release: SECONDS,
  /** the body outside the loop */
  cutoff: HZ,
  veloOpen: num(0, 8),
  hpHz: HZ,
  cacheLimit: int(1, 64),
  trim: LEVEL,
  delay: SEND,
  reverb: SEND,
});

/** What a row of this topology carries, as its contract types it. */
export type JawariPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * The most the bridge's give-back may raise one sample: what keeps the loop's gain bounded while a period's energy
 * is being balanced (a sixth of a decibel a sample at most; in a steady string it sits a hair over one).
 */
const GIVE_BACK = 1.02;

/** Where `topLossDb` is read: the loss a round trip is stated at 8 kHz, so it means the same at 44.1 and 48 kHz. */
const TOP_AT_HZ = 8000;
/** How many passes of the five taps the top's loss is: three, so it is flat to 2 kHz and steep over 6. */
const TOP_PASSES = 3;

/**
 * **The string's loss in its top, as taps**: `TOP_PASSES` passes of the five taps 1 - g (1 - cos w)^2 (flat to the
 * fourth order at the bottom, linear phase, two samples late a pass), convolved into one kernel, g set so that the
 * round trip loses `db` at 8 kHz at this rate, and never past one half (where a pass's gain reaches nought at Nyquist).
 * None at nought: the loop is then the one before it, sample for sample.
 */
export function topTaps(sr: number, db: number): Float64Array | null {
  if (!(db > 0)) return null;
  const w = (2 * Math.PI * TOP_AT_HZ) / sr;
  const pass = Math.pow(10, -db / (20 * TOP_PASSES));
  const g = Math.min(0.5, (1 - pass) / Math.pow(1 - Math.cos(w), 2));
  const one = [-g / 4, g, 1 - 1.5 * g, g, -g / 4];
  let k: number[] = [1];
  for (let p = 0; p < TOP_PASSES; p++) {
    const n = new Array<number>(k.length + one.length - 1).fill(0);
    for (let i = 0; i < k.length; i++) for (let j = 0; j < one.length; j++) n[i + j] += k[i] * one[j];
    k = n;
  }
  return Float64Array.from(k);
}

/** The rows of this topology, by event name, as the registry admitted them. */
const ROWS = new Map<string, SoundRow>();

/** One context's strings: the buffer and the rate that puts it in tune. */
const strings = new WeakMap<BaseAudioContext, Map<string, { buf: AudioBuffer; bends: Bend[] }>>();

/** The Goertzel power at `f` of a stretch already windowed. */
function power(w: Float32Array, f: number, sr: number): number {
  const c = 2 * Math.cos((2 * Math.PI * f) / sr);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < w.length; i++) {
    const s0 = w[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

/**
 * **How many cents the string's fundamental stands from `hz`**, over `from`-`to` seconds of it: the stretch windowed
 * once (Hann), a scan two cents a step over -40 to +10 (the bridge only ever flattens, and hardest just after the
 * pluck), then thirds to a tenth of a cent.
 */
export function centsOff(x: Float32Array, hz: number, sr: number, from: number, to: number): number {
  const a = Math.round(from * sr);
  const b = Math.min(x.length, Math.round(to * sr));
  if (b - a < 64) return 0;
  const n = b - a;
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const at = (c: number): number => power(w, hz * Math.pow(2, c / 1200), sr);
  let best = 0;
  let top = -1;
  for (let c = -40; c <= 10; c += 2) {
    const p = at(c);
    if (p > top) { top = p; best = c; }
  }
  let lo = best - 2;
  let hi = best + 2;
  for (let k = 0; k < 10; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (at(m1) > at(m2)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}

/**
 * **Where the pitch is read back**, in seconds from the pluck: just after it (where the bridge flattens the string
 * hardest: the low Sa 20-24 cents at 0.1-0.35 s), while the bloom settles, and the steady ring. Each window's reading
 * is placed at its middle, and the rate the string is played at goes through them: held at the first before it,
 * straight lines between, held at the last after it.
 */
export const READS: ReadonlyArray<readonly [number, number]> = [[0.1, 0.35], [0.35, 0.7], [0.7, 2.2]];

/** One reading of the pitch: the instant it stands for (seconds from the pluck) and the cents it read there. */
export interface Bend { t: number; cents: number }

/** The cents a string reads at `t` by its bends: the first before them, a straight line between, the last after. */
export function bendAt(bends: readonly Bend[], t: number): number {
  if (!bends.length) return 0;
  if (t <= bends[0].t) return bends[0].cents;
  for (let i = 1; i < bends.length; i++) {
    const a = bends[i - 1], b = bends[i];
    if (t <= b.t) return a.cents + ((b.cents - a.cents) * (t - a.t)) / (b.t - a.t);
  }
  return bends[bends.length - 1].cents;
}

/** `buzz` as the cache keeps strings: to a twentieth, no deeper than `BUZZ_MOST` (as the clean string buckets velocity). */
export const buzzBucket = (buzz: number): number => Math.round(Math.max(0, Math.min(BUZZ_MOST, buzz)) * 20) / 20;

/** How long the end of a buffer is faded over, where the note outlasts it. */
const END_FADE = 0.5;

/**
 * **One string over the bridge, as samples**: deterministic from a fixed seed, one channel, the ring normalised as
 * the clean string's is, its last half second faded (a note held past the buffer ends on silence, not a cut).
 * `bends` are where its fundamental reads against `midi` over `READS` (none for a clean string); `cents` the last.
 */
export function jawariSamples(sr: number, midi: number, J: JawariPatch, buzzAsked = J.buzz): { samples: Float32Array; cents: number; bends: Bend[] } {
  const buzz = buzzBucket(buzzAsked);
  const hz = midiToHz(midi);
  const P = sr / hz;
  const b = J.damp;
  const R = Math.exp((-2 * Math.PI * J.dcHz) / sr);
  // the DC blocker leads the fundamental by atan(fc / f) of a cycle: put back as length
  const lead = (Math.atan2(J.dcHz, hz) / (2 * Math.PI)) * P;
  // the top's taps, linear phase: half their length late, at every frequency
  const taps = topTaps(sr, J.topLossDb ?? 0);
  const late = taps ? (taps.length - 1) / 2 : 0;
  const T = taps ? taps.length : 1;
  const hist = new Float64Array(T);
  let ti = 0;
  // the two-tap damping delays by 1 - b samples, the top's taps by `late`; the allpass reads the rest of the fraction
  const D = Math.max(2, P - (1 - b) + lead - late);
  const M = Math.max(1, Math.floor(D - 0.5));
  const frac = D - M;
  const eta = (1 - frac) / (1 + frac);
  const L = M + 2;
  const line = new Float32Array(L);
  const len = Math.max(64, Math.ceil(Math.min(J.maxSeconds, J.decay) * sr));
  const out = new Float32Array(len);
  const noise = lcg(20261018);
  const gs = Math.pow(10, -3 / (J.decay * hz));
  const burst = Math.max(2, Math.round(J.burst * sr));
  const soft = 1 - Math.exp((-2 * Math.PI * J.softHz) / sr);
  const rel = Math.exp(-1 / (Math.max(1e-3, J.swing) * sr));
  const bloom = Math.max(1e-3, J.bloom);
  let w = 0, prev = 0, lp = 0, low = 0, swing = 1e-9, u1 = 0, ap = 0, dcx = 0, dcy = 0, peak = 0, eIn = 0, eOut = 0;
  // the energy before and after the bridge, each a leaky sum over about one period
  const rho = Math.exp(-1 / P);
  for (let n = 0; n < len; n++) {
    let x = 0;
    if (n < burst) {
      // the finger: dark noise, its bottom taken out
      lp += soft * (noise() - lp);
      low += 0.02 * (lp - low);
      x = lp - low;
    }
    const u = line[(w + L - M) % L];
    const d = eta * u + u1 - eta * ap;
    u1 = u;
    ap = d;
    let y = b * d + (1 - b) * prev;
    prev = d;
    if (taps) {
      // the top's loss: the taps over the last `T` samples of the damped swing
      hist[ti] = y;
      let acc = 0;
      for (let k = 0, i = ti; k < T; k++, i = i === 0 ? T - 1 : i - 1) acc += taps[k] * hist[i];
      ti = ti + 1 === T ? 0 : ti + 1;
      y = acc;
    }
    const v = y - dcx + R * dcy;
    dcx = y;
    dcy = v;
    y = v;
    if (buzz > 0) {
      const a = Math.abs(y);
      swing = a > swing ? a : Math.max(1e-9, swing * rel);
      const h = swing * (1 - buzz * (1 - Math.exp(-n / sr / bloom)));
      eIn = eIn * rho + y * y;
      if (y > h) y = h;
      // the bridge moves energy and does not burn it: what the barrier took this period is handed back to the whole
      // swing, so the string decays at its own rate and the buzz is a change of colour, not a damper
      eOut = eOut * rho + y * y;
      y *= Math.min(GIVE_BACK, Math.sqrt(eIn / Math.max(1e-30, eOut)));
    }
    line[w] = x + gs * y;
    out[n] = y;
    if (Math.abs(y) > peak) peak = Math.abs(y);
    w = (w + 1) % L;
  }
  const bends: Bend[] = buzz > 0
    ? READS.filter(([a]) => a * sr < len).map(([a, b]) => ({ t: (a + Math.min(b, len / sr)) / 2, cents: centsOff(out, hz, sr, a, Math.min(b, len / sr)) }))
    : [];
  const cents = bends.length ? bends[bends.length - 1].cents : 0;
  // normalised on the ring and not on the pluck (`karplus-pluck.ts`'s measurement), the ceiling on the pluck after
  const a0 = Math.min(len - 1, Math.round(0.02 * sr));
  const a1 = Math.min(len, Math.round(0.4 * sr));
  let sq = 0;
  for (let n = a0; n < a1; n++) sq += out[n] * out[n];
  const ring = Math.sqrt(sq / Math.max(1, a1 - a0));
  let scale = ring > 1e-9 ? J.ringLevel / ring : 0;
  if (peak * scale > J.peakCeiling) scale = J.peakCeiling / Math.max(1e-9, peak);
  for (let n = 0; n < len; n++) out[n] *= scale;
  // the buffer's end, faded: a raised cosine over its last half second
  const f0 = Math.max(0, len - Math.round(END_FADE * sr));
  for (let n = f0; n < len; n++) out[n] *= 0.5 + 0.5 * Math.cos((Math.PI * (n - f0)) / Math.max(1, len - 1 - f0));
  return { samples: out, cents, bends };
}

/** One string for this context, from the cache or computed: the buffer and the bends that put it in tune. */
function jawariString(ctx: BaseAudioContext, midi: number, J: JawariPatch, buzz: number): { buf: AudioBuffer; bends: Bend[] } {
  let per = strings.get(ctx);
  if (!per) strings.set(ctx, (per = new Map()));
  const key = `${midi}:${buzzBucket(buzz)}:${J.burst}:${J.softHz}:${J.damp}:${J.decay}:${J.maxSeconds}:${J.bloom}:${J.swing}:${J.dcHz}:${J.topLossDb}:${J.ringLevel}:${J.peakCeiling}:${ctx.sampleRate}`;
  const had = per.get(key);
  if (had) return had;
  const { samples, bends } = jawariSamples(ctx.sampleRate, midi, J, buzz);
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  const made = { buf, bends };
  if (per.size >= J.cacheLimit) per.delete(per.keys().next().value as string);
  per.set(key, made);
  return made;
}

/** How many strings a context is holding. */
export const jawariCacheSize = (ctx: BaseAudioContext): number => strings.get(ctx)?.size ?? 0;

/** The buzz a note plays: its own control where it writes one, clamped, else the row's. */
const buzzOf = (row: SoundRow, p: NoteParams, J: JawariPatch): number =>
  withControls(p, row.descriptor.controls ?? {}).buzz ?? J.buzz;

/**
 * The pre-render hook: the strings this theme's notes want, before the first of them is due. A warm-up, never a
 * requirement; a theme with none of these events pays nothing.
 */
export function prepareJawari(ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[], opts: PrepareOptions = {}): Promise<void> {
  if (!events || !events.length) return Promise.resolve();
  const from = opts.from ?? 0;
  const seen = new Set<string>();
  for (const e of events) {
    if (!e.p || e.p.midi == null || (e.t ?? 0) < from) continue;
    const row = ROWS.get(e.voice);
    if (!row) continue;
    const J = patchOf(settings, row, PARAMETERS);
    const buzz = buzzOf(row, e.p, J);
    const k = `${row.id}:${e.p.midi}:${buzzBucket(buzz)}`;
    if (seen.has(k) || seen.size >= J.cacheLimit) continue;
    seen.add(k);
    jawariString(ctx, e.p.midi, J, buzz);
  }
  return Promise.resolve();
}

function jawari(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const J = patchOf(settings, row, PARAMETERS);
  const vel = p.vel ?? 1;
  const dur = Math.max(0.05, p.dur ?? 4);
  const g = ctx.createGain();
  const end = noteEnv(g, time, vel * (p.gain ?? 1) * J.trim, J.attack, dur, p.release ?? J.release);
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(16000, (p.cutoff ?? J.cutoff) * (1 + J.veloOpen * (vel - 0.5)) * (p.cutoffMul ?? 1));
  lp.connect(g);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = J.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  const { buf, bends } = jawariString(ctx, p.midi, J, buzzOf(row, p, J));
  const spread = (p.spread ?? J.spread) * (p.spreadMul ?? 1);
  const rateOf = (cents: number, side: number): number => Math.pow(2, (-cents + side * J.detuneCents * 0.5) / 1200);
  for (const side of [-1, 1]) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // the pitch read back: the first reading held to its instant, straight lines through the next, the last held
    src.playbackRate.value = rateOf(bends[0]?.cents ?? 0, side);
    if (bends.length > 1) {
      src.playbackRate.setValueAtTime(rateOf(bends[0].cents, side), time + bends[0].t);
      for (const b of bends.slice(1)) src.playbackRate.linearRampToValueAtTime(rateOf(b.cents, side), time + b.t);
    }
    const pan = panner(ctx, side * spread * 0.5);
    const lvl = ctx.createGain();
    lvl.gain.value = 0.5;
    src.connect(lvl);
    lvl.connect(pan);
    pan.connect(hp);
    src.start(time);
    // the buffer's own end is faded, so a note held past it ends on silence; the rate stands within a few cents of one
    src.stop(Math.min(end + 0.02, time + buf.duration / rateOf(bends[bends.length - 1]?.cents ?? 0, side)));
  }

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? J.delay, reverb: p.reverb ?? J.reverb });
  return end;
}

/**
 * The jawari string's topology (`sounds/keyboard/tanpura.json`): the clean string's loop with a bridge that buzzes,
 * computed once per pitch and held in its own cache. Its one control, `buzz`, defaults to the row's.
 */
export const JAWARI: Topology = {
  id: 'jawari',
  cost: 'dear',
  parameters: PARAMETERS,
  controlOf: { buzz: 'buzz' },
  prepare: prepareJawari,
  rows: ROWS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => jawari(row, ctx, out, time, p, settings),
};

export default JAWARI;
