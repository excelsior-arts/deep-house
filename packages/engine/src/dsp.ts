// Small Web Audio helpers shared by every voice. Everything is built from
// oscillators, generated noise and curves: no sample files anywhere.
import { contourElapsed, pathFrom } from './voices/contour-time.ts';

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const irCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const curveCache = new Map<string, Float32Array<ArrayBuffer>>();
/**
 * A shaper's table, made once per key for the life of the page and shared by
 * every context: a curve is a function of its numbers and of nothing a context
 * owns. The curves here, the kitchen's (`effects/curves.ts`) and the
 * detector's all keep theirs in this one map, each under a key that starts
 * with its own name (round (f) of the reconciled review of 09-24, D15: it was
 * three maps and nine copies of the same four lines). The gate's curves are
 * the exception, because they are bounded (`effects/gate.ts`).
 */
export function curveOf(key: string, make: () => Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let curve = curveCache.get(key);
  if (!curve) {
    curve = make();
    curveCache.set(key, curve);
  }
  return curve;
}

export const MIN_RELEASE = 0.004; // never let a gain jump; 4 ms is inaudible
/**
 * **The floors a voice writes under**, named once (round (f) of the reconciled
 * review of 09-24, D5: they were some sixty literals across the voices). A gain
 * a voice ramps exponentially never reaches true nought, which an exponential
 * ramp cannot reach, so it stops at `GAIN_FLOOR` (-74 dB, inaudible); a filter
 * corner a voice moves never goes under `CUTOFF_FLOOR` Hz. The program line's
 * own floor is `EXP_FLOOR` in `master.ts`, beside the writer it guards; the
 * ramp fold's 1e-9 (`ramp.ts`) and a walked corner's 10 Hz (`treat.ts`
 * `rampFrequency`) are guards of their own arithmetic and stay with it.
 */
export const GAIN_FLOOR = 0.0002;
export const CUTOFF_FLOOR = 60;

// A MIDI note as a frequency. It sat in the composer's `theory.ts` with the
// scales and the voice leading until round W of PLAN-V1-NEXT, and four voices
// imported it from there — the one thing the machine asked of the music. It is
// not music: it is the equal-tempered tuning every oscillator in this file's
// neighbourhood is built on, and A4 = 440 Hz is the only number in it.
export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// A note must never be scheduled in the past.
//
// If the scheduler runs late — a busy main thread, a phone, a page coming back
// to the foreground — a voice is built with a `time` that has already gone by.
// An oscillator asked to start then starts *now*, snapped to the next render
// quantum, but its gain automation is still read from the original `time`, so
// the note begins part-way down its own envelope at whatever value the curve
// had reached: a step, and one whose height depends on how late it was.
// MEASURED in Eugene's captures: the waveform jumped from -0.04 to -0.60
// inside two samples at the kick, where a 56 Hz sine moves 0.007 a sample, and
// the loudest sample of the hit was its first rather than the envelope's peak.
// On an unloaded machine nothing is ever late, which is why no render here
// ever showed it.
//
// A late note is now a slightly late note. The whole envelope shifts with it.
// `ctx.currentTime` is not the render head. On a device that hands the browser
// 4096 frames at a time, the renderer has already filled up to a whole block
// past the clock the main thread can read, so `currentTime + 3 ms` can still be
// behind it — and a note scheduled there is snapped to the start of the next
// block, which is why Eugene's kicks land on exact multiples of 4096 frames
// while the beat at 100.6 BPM is 28628. The floor has to clear the output
// latency, not the clock.
const LATE_LEAD = 0.003;
/**
 * A context that may be a live one. The two latencies belong to `AudioContext`
 * and an `OfflineAudioContext` has neither, so they are read as optional and
 * the render's nought is the same nought the arithmetic already fell back to.
 */
export type LatencyContext = BaseAudioContext & Partial<Pick<AudioContext, 'outputLatency' | 'baseLatency'>>;
/**
 * The two latencies, read the one way: nought where the context has none. The
 * render head below, the clock's look-ahead and the transport's anchored head
 * (`mix.ts`) all read them here.
 */
export const latencies = (ctx: LatencyContext): { out: number; base: number } =>
  ({ out: ctx.outputLatency || 0, base: ctx.baseLatency || 0 });
export const renderHead = (ctx: LatencyContext): number => {
  const { out, base } = latencies(ctx);
  return ctx.currentTime + out + base;
};

/**
 * The constructor of an offline context, wherever this engine is running: the
 * one lookup a render, a voice's pre-render and the composer's `renderMix` all
 * ask (it was three copies of one line until round (f) of the reconciled review
 * of 09-24, D12).
 */
export function Offline(): typeof OfflineAudioContext {
  return globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
}
let lateStarts = 0;
let lateLogged = 0;
let lateLast = 0; // seconds the last late note was moved by
let lateAt = 0; // when, on the context's clock
/** Why the last late note was late, as far as this module can tell. */
export type LateCause = 'resume' | null;
let lateCause: LateCause = null; // 'resume' when the last one was attributed to a start
// When the transport last put a record on, on the context's clock. A start
// that lands its first notes behind the render head is a fault in the
// transport and not a stumble on the machine, and the two read identically in
// a count — so a late note inside this window of a start says which it was,
// and a log kept a month from now can tell them apart. With the transport's
// own lead (`START_LEAD` in mix.ts) it should never be written at all.
let startedAt = -Infinity;
const RESUME_WINDOW = 0.2;
export function noteTransportStart(ctx: BaseAudioContext): void {
  startedAt = ctx.currentTime;
}
/**
 * The last 4096 leads the scheduler managed, in seconds: a ring, so a session
 * of hours is described by its last few minutes rather than its first (R91).
 * It used to stop filling at 4096 and round every lead through a string.
 */
const LEADS = 4096;
const leadRing = new Float64Array(LEADS);
let leadsHeld = 0;
let leadNext = 0;
// The effective onset of a sound, which is the time it will actually start at
// rather than the time it was asked for. The scheduler resolves this *once*
// per event and hands the answer to the voice and to the automation coupled to
// it, because a kick that was moved forward and a duck that was not is gain
// reduction arriving before its own kick. A voice may still call it for
// itself — the harness and the probes do — and calling it twice on an already
// resolved time is a no-op.
//
// The late count lives here rather than in `startTime` so that the scheduler's
// one resolution is the one that counts; `startTime` adds the lead statistic,
// which is per call and belongs to whoever asked for the sound.
export function resolveStart(ctx: LatencyContext, time: number): number {
  const floor = renderHead(ctx) + LATE_LEAD;
  if (!(time < floor)) return time;
  lateStarts += 1;
  lateLast = floor - time;
  lateAt = ctx.currentTime;
  // Only forward: an offline render's clock starts at nought and would
  // otherwise read as a fifth of a second after every start the page ever made.
  const since = ctx.currentTime - startedAt;
  lateCause = since >= 0 && since <= RESUME_WINDOW ? 'resume' : null;
  // Once a minute at most, so a loaded page says so without filling the log.
  const now = Date.now();
  if (now - lateLogged > 60000) {
    lateLogged = now;
    if (typeof console !== 'undefined') console.warn(`deep-house: ${lateStarts} notes scheduled late`);
  }
  return floor;
}

export function startTime(ctx: LatencyContext, time: number): number {
  leadRing[leadNext] = time - ctx.currentTime;
  leadNext = (leadNext + 1) % LEADS;
  if (leadsHeld < LEADS) leadsHeld += 1;
  return resolveStart(ctx, time);
}
/** What `lateInfo` hands back. */
export interface LateInfo {
  count: number;
  last: number;
  at: number;
  cause: LateCause;
}
// How many, and the last one: what a bench or a subscriber is shown.
export const lateInfo = (): LateInfo => ({ count: lateStarts, last: +lateLast.toFixed(4), at: +lateAt.toFixed(2), cause: lateCause });
/** What `leadStats` hands back: the spread of the leads, in seconds. */
export interface LeadStats {
  notes: number;
  late: number;
  min: number;
  p05: number;
  p50: number;
  max: number;
}
// What the scheduler actually managed, so a loaded page can be asked.
export function leadStats(): LeadStats {
  const v = Array.from(leadRing.subarray(0, leadsHeld), (x) => +x.toFixed(5)).sort((a, b) => a - b);
  const q = (f: number): number => (v.length ? v[Math.min(v.length - 1, Math.floor(f * v.length))] : NaN);
  return { notes: v.length, late: lateStarts, min: q(0), p05: q(0.05), p50: q(0.5), max: q(0.999) };
}

// How much of the noise buffer's right channel is its left one. Read here
// rather than from the settings because the buffer is built once per context and
// must not change under a preset.
const NOISE_CORR = 0.62;

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * And back: a gain as decibels, with no floor and no rounding — a reader
 * floors and rounds it for what it prints (the taps to a tenth, the machine's
 * description to a hundredth). One expression where there were two (round (f)
 * of the reconciled review of 09-24, D38).
 */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(gain);
}

// Two seconds of white noise per context, reused by every hat, clap, hammer
// and riser.
//
// The two channels are *correlated*, and that is the whole point of this
// function's second half. Independent noise left and right is as wide as a
// sound can be — an L/R correlation of zero — and with a hat on every offbeat
// that made 4-16 kHz the widest band in the render at a side/mid of 0.87,
// where the references measure 0.42 with a correlation of 0.70. The hats are
// still the most decorrelated thing in the mix; they are just not a wall.
/**
 * White noise, deterministic: the one linear congruential generator every
 * noise this engine renders is drawn from (the hats' two channels here, a drum
 * body, the plucked string's burst, the bass's pick), each from its own fixed
 * seed. Each call gives the next sample, from -1 to just under 1. It was four
 * copies of the same two lines until round (f) of the reconciled review of
 * 09-24 (D15).
 */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 2);
  buf = ctx.createBuffer(2, len, ctx.sampleRate);
  // Deterministic noise, so the live take and the rendered WAV match sample
  // for sample as closely as the two contexts allow.
  const white = lcg(22222);
  const c = NOISE_CORR;
  const k = Math.sqrt(1 - c * c);
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);
  for (let i = 0; i < len; i++) left[i] = white();
  for (let i = 0; i < len; i++) right[i] = c * left[i] + k * white();
  noiseCache.set(ctx, buf);
  return buf;
}

export function noiseSource(ctx: BaseAudioContext, when: number, duration: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  // Start at a different point each time so repeated hats are not identical.
  src.loopStart = 0;
  src.loopEnd = src.buffer!.duration;
  const offset = (when * 7.13) % src.buffer!.duration;
  src.start(when, offset);
  src.stop(when + duration);
  return src;
}

// A reverb impulse: decaying noise with a short build, slightly different per
// channel so the tail is wide.
// `corr` is how much of the right channel is the left one: 0 gives two
// independent tails, which is as wide as a reverb can be and wider than these
// records are, and 1 gives a mono room. MEASURED (space.md): 4-16 kHz sits at
// a side/mid of 0.42 and an L/R correlation of 0.70 — the top of the mix is
// *narrower* than the chord band, and a fully decorrelated short room behind
// the hats and the clap is what was pushing it to 0.87.
export function impulseResponse(ctx: BaseAudioContext, seconds = 2.4, decay = 3.2, tag = 'hall', corr = 0): AudioBuffer {
  let per = irCache.get(ctx);
  if (!per) {
    per = new Map();
    irCache.set(ctx, per);
  }
  const key = `${tag}:${seconds}:${decay}:${corr}`;
  if (per.has(key)) return per.get(key)!;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  let s = tag === 'room' ? 424243 : 99991;
  const c = Math.max(0, Math.min(1, corr));
  const k = Math.sqrt(1 - c * c);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const other = ch === 1 ? buf.getChannelData(0) : null;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const n = (s / 2147483648) - 1;
      const t = i / len;
      // Short fade-in stops the tail from starting as a click.
      const build = Math.min(1, i / (rate * 0.01));
      const v = n * build * Math.pow(1 - t, decay);
      d[i] = other ? c * other[i] + k * v : v;
    }
  }
  per.set(key, buf);
  return buf;
}

// A safety clipper, not a saturator. Below `knee` it is a straight line, so a
// mix peaking at -3 dBFS passes through it completely untouched; above it the
// remaining headroom is rounded off with a tanh. The plain normalised tanh
// this replaced shaped *every* sample, and on a record whose peaks are the
// bass that is broadband distortion under another name — which is exactly what
// a listener means by "the bass is clipping".
export function softClipCurve(drive = 1.4, knee = 0.8, n = 4096): Float32Array<ArrayBuffer> {
  return curveOf(`clip:${drive}:${knee}:${n}`, () => {
    const curve = new Float32Array(n);
    const head = 1 - knee;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      // Slope exactly 1 at the knee, so there is no seam, and a ceiling of
      // knee + head/drive however hard it is hit.
      curve[i] = a <= knee ? x : Math.sign(x) * (knee + (head / drive) * Math.tanh((drive * (a - knee)) / head));
    }
    return curve;
  });
}

// Gentle asymmetric saturation for the sub, so it has a little grit on a
// laptop speaker without losing the fundamental.
export function saturationCurve(amount = 0.35, n = 2048): Float32Array<ArrayBuffer> {
  return curveOf(`sat:${amount}:${n}`, () => {
    const curve = new Float32Array(n);
    const k = amount * 8;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  });
}

// Asymmetric shaping. A tanh is odd-symmetric, so it only ever grows the 3rd,
// 5th, 7th harmonic — which is why a driven sine gets reedy but never gains a
// 2nd harmonic. Bending the curve's two halves differently is what puts the
// octave-above partial in, and the benchmarks have a lot of it.
export function evenCurve(amount = 0.2, n = 2048): Float32Array<ArrayBuffer> {
  return curveOf(`even:${amount}:${n}`, () => {
    const curve = new Float32Array(n);
    const a = amount;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = (x + a * x * x) / (1 + a);
    }
    return curve;
  });
}

// A percussive envelope: silence -> peak over `attack`, then an exponential
// fall, then a short linear ramp to true zero so nothing ever cuts.
export function percEnv(gain: GainNode, when: number, peak: number, attack: number, decay: number): number {
  const g = gain.gain;
  // Silent until its first scheduled event, whenever that turns out to be.
  g.value = 0;
  const a = Math.max(0.0015, attack);
  const d = Math.max(0.01, decay);
  // A *linear* attack from true zero. An exponential from a ten-thousandth
  // takes a single-sample gain step 6.6x larger than a linear ramp of the same
  // length at the top of its rise, and on a low voice that corner is the
  // loudest sample of the hit. The decay stays exponential: a fall is a fall.
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(Math.max(GAIN_FLOOR, peak), when + a);
  g.exponentialRampToValueAtTime(0.0001, when + a + d);
  g.linearRampToValueAtTime(0, when + a + d + MIN_RELEASE);
  return when + a + d + MIN_RELEASE;
}

// A sustained envelope for notes with a length: attack, hold, release.
export function noteEnv(gain: GainNode, when: number, peak: number, attack: number, hold: number, release: number): number {
  const g = gain.gain;
  // Silent until its first scheduled event, whenever that turns out to be.
  g.value = 0;
  const a = Math.max(0.003, attack);
  const r = Math.max(MIN_RELEASE, release);
  const h = Math.max(0.01, hold);
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(Math.max(GAIN_FLOOR, peak), when + a);
  g.setValueAtTime(Math.max(GAIN_FLOOR, peak), when + a + h);
  g.exponentialRampToValueAtTime(GAIN_FLOOR, when + a + h + r);
  g.linearRampToValueAtTime(0, when + a + h + r + MIN_RELEASE);
  return when + a + h + r + MIN_RELEASE;
}

/**
 * The five legs of `adsrEnv`, all of them stated: `sustain` is a fraction of
 * the peak and the other four are seconds. Every caller writes all five, and a
 * leg left out would be an arithmetic NaN rather than a default.
 */
export interface Adsr {
  attack: number;
  decay: number;
  /** a fraction of the peak, not a level */
  sustain: number;
  hold: number;
  release: number;
  /** Opt-in raised-cosine attack and release; omission keeps the legacy envelope. */
  fadeCurve?: number;
}

// An attack, a fall to a sustain fraction, a hold and a release. Most
// instruments have a decay leg; `noteEnv` has none, and a chord layer held at
// its attack level for two bars is the most obviously synthetic thing a
// generator can do.
export function adsrEnv(gain: GainNode, when: number, peak: number, { attack, decay, sustain, hold, release, fadeCurve }: Adsr): number {
  // A switch: 1 is the raised-cosine fade and anything else the legacy
  // envelope. It used to throw on any other value, on the scheduling tick.
  fadeCurve = fadeCurve === 1 ? 1 : 0;
  const g = gain.gain;
  // Silent until its first scheduled event, whenever that turns out to be.
  g.value = 0;
  const a = Math.max(0.003, attack);
  const d = Math.max(0.005, decay);
  const r = Math.max(MIN_RELEASE, release);
  const h = Math.max(0, hold);
  const p = Math.max(GAIN_FLOOR, peak);
  const s = Math.max(GAIN_FLOOR, peak * sustain);
  if (fadeCurve === 1) {
    // Zero slope at both ends: the fade eases in and out rather than
    // introducing another periodic motion. Reach true zero on the release.
    const rise = new Float32Array(65), fall = new Float32Array(65);
    for (let i = 0; i < rise.length; i++) {
      const u = .5 - .5 * Math.cos(Math.PI * i / (rise.length - 1));
      rise[i] = p * u; fall[i] = s * (1 - u);
    }
    g.setValueCurveAtTime(rise, when, a);
    g.setValueAtTime(p, when + a);
    g.exponentialRampToValueAtTime(s, when + a + d);
    g.setValueCurveAtTime(fall, when + a + d + h, r);
    g.setValueAtTime(0, when + a + d + h + r + MIN_RELEASE);
    return when + a + d + h + r + MIN_RELEASE;
  }
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(p, when + a);
  g.exponentialRampToValueAtTime(s, when + a + d);
  if (h > 0) g.setValueAtTime(s, when + a + d + h);
  g.exponentialRampToValueAtTime(GAIN_FLOOR, when + a + d + h + r);
  g.linearRampToValueAtTime(0, when + a + d + h + r + MIN_RELEASE);
  return when + a + d + h + r + MIN_RELEASE;
}

/**
 * The sends a voice is given: the dry bus it plays into and the three spaces,
 * each of them there or not. A graph that never built its hall hands over an
 * `out` with no `hall` on it, and a voice that asks for one is simply not sent
 * there — which is why every member is optional and the function checks.
 */
/**
 * The sends a voice's output may reach, by name: the dry bus itself and the
 * six spaces behind it. One list for the type below and the source mix's
 * per-send gains (`source-mix.ts`), which kept its own copy until round (f)
 * of the reconciled review of 09-24 (D37); a bus (`master.ts` `Bus`) has a
 * node under each of these names.
 */
export const SEND_NAMES = ['dry', 'delay', 'reverb', 'room', 'hall', 'background', 'immersed', 'echo', 'partSpace'] as const;
export type SendName = typeof SEND_NAMES[number];
export type VoiceOut = { [K in SendName]?: AudioNode };

/**
 * How much of a voice goes to each of them, as a gain. What is left out is
 * nought — no send — except `dry`, which is a wire at 1.
 */
export interface SendAmounts {
  dry?: number;
  delay?: number;
  reverb?: number;
  room?: number;
  hall?: number;
  background?: number;
  immersed?: number;
  /** the echo: a tape delay a note is sent into for its own repeats (`ECHO_SEND` in master.ts) */
  echo?: number;
  /** the part's own space (`withPartSpace`): read there and never by `route`, which leaves it alone */
  partSpace?: number;
}

/** The most any send may be: a gain, 6 dB over unity. */
export const SEND_MAX = 2;
const send = (v: number | undefined, otherwise: number): number =>
  v === undefined ? otherwise : Number.isFinite(v) ? Math.min(SEND_MAX, Math.max(0, v)) : otherwise;

// Connect a source to the dry bus and to the sends at the given amounts.
//
// A dry level of exactly 1 is a wire: the note goes straight to the bus. A
// unity gain is a node the audio thread visits every quantum for nothing, and
// every note used to carry one.
//
// Every amount is taken into the one range a send has (`SEND_MAX`), and one that
// is not a finite number is no send — `dry` the wire — rather than a throw when
// it reaches an AudioParam: the sends are note parameters a part writes (the
// ambience of a role puts `room`, `reverb`, `delay` and `background` on every
// note of it), so this is the voice's door for all of them.
export function route(ctx: BaseAudioContext, node: AudioNode, out: VoiceOut, amounts: SendAmounts = {}): void {
  const dry = send(amounts.dry, 1);
  const delay = send(amounts.delay, 0);
  const reverb = send(amounts.reverb, 0);
  const room = send(amounts.room, 0);
  const hall = send(amounts.hall, 0);
  const background = send(amounts.background, 0);
  const immersed = send(amounts.immersed, 0);
  const echo = send(amounts.echo, 0);
  if (dry === 1 && out.dry) {
    node.connect(out.dry);
  } else if (dry > 0 && out.dry) {
    const g = ctx.createGain();
    g.gain.value = dry;
    node.connect(g);
    g.connect(out.dry);
  }
  if (delay > 0 && out.delay) {
    const g = ctx.createGain();
    g.gain.value = delay;
    node.connect(g);
    g.connect(out.delay);
  }
  if (reverb > 0 && out.reverb) {
    const g = ctx.createGain();
    g.gain.value = reverb;
    node.connect(g);
    g.connect(out.reverb);
  }
  if (room > 0 && out.room) {
    const g = ctx.createGain();
    g.gain.value = room;
    node.connect(g);
    g.connect(out.room);
  }
  // The hall is built the first time something asks for it, so a track with
  // no piano in it never pays for a four-second convolver.
  if (hall > 0 && out.hall) {
    const g = ctx.createGain();
    g.gain.value = hall;
    node.connect(g);
    g.connect(out.hall);
  }
  if (background > 0 && out.background) {
    const g = ctx.createGain();
    g.gain.value = background;
    node.connect(g);
    g.connect(out.background);
  }
  if (immersed > 0 && out.immersed) {
    const g = ctx.createGain();
    g.gain.value = immersed;
    node.connect(g);
    g.connect(out.immersed);
  }
  // The echo is built the first time something asks for it, like the hall.
  if (echo > 0 && out.echo) {
    const g = ctx.createGain();
    g.gain.value = echo;
    node.connect(g);
    g.connect(out.echo);
  }
}

/**
 * **A note's echo, whatever the voice** (round KV1). The echo is a send a
 * *part* asks for — `p.echo`, an amount like any send's — and not one an
 * instrument chooses, so it is not left to each voice's own `route()` call to
 * remember it: a note that asks has its dry path tapped here, on the way in,
 * and the tap sends `echo` of what goes dry into the bus's echo return. A note
 * that does not ask is handed the very `out` it always was, so every program
 * that never names an echo plays through the graph it always did.
 *
 * The other sends are handed through as getters, so a lazy return stays lazy.
 */
export function withEcho(ctx: BaseAudioContext, out: VoiceOut, p: { echo?: unknown } | null | undefined): VoiceOut {
  const amount = p && typeof p.echo === 'number' && Number.isFinite(p.echo) ? Math.min(SEND_MAX, Math.max(0, p.echo)) : 0;
  if (!(amount > 0) || !out.dry) return out;
  const echoOut = out.echo;
  if (!echoOut) return out;
  const tap = ctx.createGain();
  tap.connect(out.dry);
  const send = ctx.createGain();
  send.gain.value = amount;
  tap.connect(send);
  send.connect(echoOut);
  const tapped: VoiceOut = {};
  for (const name of SEND_NAMES) {
    if (name === 'dry') { tapped.dry = tap; continue; }
    Object.defineProperty(tapped, name, { get: () => out[name], enumerable: true });
  }
  return tapped;
}

/**
 * **A note into its part's own space** (liquid-space round 1). A part that
 * plays through a space of its own — the sparse keys' far grand into the deep
 * hall — asks for it by amount, `p.partSpace`, and its whole dry path goes there
 * instead of to the bus: the space carries its own dry beside its sends
 * (`effects/space.ts`), so the note is heard once, through the room it was
 * chosen with. One space per theme's graph, built from the theme's settings
 * (`partSpace`, a space row), so every note of the part shares one return and
 * no note builds a reverb of its own. The other sends pass through as getters,
 * so a lazy return stays lazy; a note that does not ask, or a graph whose theme
 * names no space, is handed the very `out` it always was.
 */
export function withPartSpace(ctx: BaseAudioContext, out: VoiceOut, p: { partSpace?: unknown } | null | undefined): VoiceOut {
  const amount = p && typeof p.partSpace === 'number' && Number.isFinite(p.partSpace) ? Math.min(SEND_MAX, Math.max(0, p.partSpace)) : 0;
  if (!(amount > 0)) return out;
  const door = out.partSpace;
  if (!door) return out;
  const into = ctx.createGain();
  into.gain.value = amount;
  into.connect(door);
  const moved: VoiceOut = {};
  for (const name of SEND_NAMES) {
    if (name === 'dry') { moved.dry = into; continue; }
    Object.defineProperty(moved, name, { get: () => out[name], enumerable: true });
  }
  return moved;
}

/**
 * **A note into the theme's shared returns** (`settings.returns`; the written passage's hall and echoes): a part may send a
 * note into one or more named returns — a hall and an echo a theme builds once and every note that asks
 * shares — each by amount, `p.returns`, keyed `<return>` (its input, through the row's own send levels)
 * or `<return>.<send>` (straight into that send, past its level). The amounts are taken off the note's
 * own dry output before `p.direct`, the note's direct level (1 where it is not written), so a note can be
 * mostly return and a little direct. Each note has its own send gains: opening the echo for one note and
 * not the next is a *throw*, and the shared return's feedback rings on after the note is gone. A key
 * the graph cannot resolve is no send; a note that writes neither field is handed the very `out` it was. An amount may
 * be a path over the note (pairs of seconds from its start and an amount), from `when`, the note's start;
 * a note started inside itself reads it from there (`contourElapsed`, `contour-time.ts`).
 * The other sends pass through as getters, so a lazy return stays lazy.
 */
export function withReturns(ctx: BaseAudioContext, out: VoiceOut,
  p: { returns?: unknown; direct?: unknown; dur?: unknown; curveDuration?: unknown } | null | undefined,
  door: (key: string) => AudioNode | null | undefined, when = 0): VoiceOut {
  const asks = p && p.returns && typeof p.returns === 'object' ? Object.entries(p.returns as Record<string, unknown>) : [];
  const direct = p && typeof p.direct === 'number' && Number.isFinite(p.direct) ? Math.min(SEND_MAX, Math.max(0, p.direct)) : 1;
  if ((!asks.length && direct === 1) || !out.dry) return out;
  const tap = ctx.createGain();
  if (direct === 1) tap.connect(out.dry);
  else if (direct > 0) { const d = ctx.createGain(); d.gain.value = direct; tap.connect(d); d.connect(out.dry); }
  const clamp = (v: number) => Math.min(SEND_MAX, Math.max(0, v));
  const elapsed = contourElapsed(p as Record<string, unknown>);
  for (const [key, v] of asks) {
    // an amount, or the send's path over the note (pairs of seconds from its start and an amount): a note's run-up
    // sent lightly and its destination fully, without a second event
    const path = Array.isArray(v) && v.length >= 2 && v.length % 2 === 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? pathFrom(v as number[], elapsed) : null;
    const amount = path ? Math.max(...path.filter((_, i) => i % 2 === 1)) : typeof v === 'number' && Number.isFinite(v) ? clamp(v) : 0;
    const into = amount > 0 ? door(key) : null;
    if (!into) continue;
    const g = ctx.createGain();
    if (path) {
      g.gain.setValueAtTime(clamp(path[1]), when);
      let last = when;
      for (let i = 2; i < path.length; i += 2) {
        const t = when + Math.max(0, path[i]);
        if (t > last + 1e-4) g.gain.linearRampToValueAtTime(clamp(path[i + 1]), t); else g.gain.setValueAtTime(clamp(path[i + 1]), t);
        last = Math.max(last, t);
      }
    } else g.gain.value = amount;
    tap.connect(g);
    g.connect(into);
  }
  const tapped: VoiceOut = {};
  for (const name of SEND_NAMES) {
    if (name === 'dry') { tapped.dry = tap; continue; }
    Object.defineProperty(tapped, name, { get: () => out[name], enumerable: true });
  }
  return tapped;
}

/**
 * **A note's own motion**: a part may move one note across the field and through a filter
 * without a new voice or a bus of its own — `p.panPath` (pairs of seconds from the note's start and a pan,
 * -1 to 1), `p.lpPath` and `p.hpPath` (pairs of seconds and a corner in Hz), each a path over the note or a
 * single number held for it. A slow pan across a long texture, a high-pass falling over a run of short hits
 * (each hit its own corner), a top closing through a low-pass: the composer writes the numbers, the voice
 * stays what it is. It sits before the returns' tap, so what the note sends moves with what plays direct;
 * the other sends pass through as getters. A note that writes none of them is handed the very `out` it was.
 *
 * `p.gainPath`: pairs of seconds and a gain (0 to 4) over the note, a level the composer rides
 * after the voice's own envelope — a held chord faded over its last bars so it is never heard to stop, a pad
 * rising toward an entry, a texture gated at sixteenths. Its sends ride with it.
 *
 * A note started inside itself (a seek, a pause and a play: `curveDuration`, `contour-time.ts`) reads each path
 * from where the note stands, so a bloom's rise and a drift across the field go on rather than start again.
 */
export function withMotion(ctx: BaseAudioContext, out: VoiceOut,
  p: { panPath?: unknown; lpPath?: unknown; hpPath?: unknown; gainPath?: unknown; dur?: unknown; curveDuration?: unknown } | null | undefined, when = 0): VoiceOut {
  if (!p || !out.dry) return out;
  const elapsed = contourElapsed(p as Record<string, unknown>);
  const pathOf = (v: unknown): number[] | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return [0, v];
    return Array.isArray(v) && v.length >= 2 && v.length % 2 === 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? pathFrom(v as number[], elapsed) : null;
  };
  const hp = pathOf(p.hpPath), lp = pathOf(p.lpPath), pan = pathOf(p.panPath), level = pathOf(p.gainPath);
  if (!hp && !lp && !pan && !level) return out;
  const walk = (param: AudioParam, path: number[], f: (v: number) => number) => {
    param.setValueAtTime(f(path[1]), when);
    let last = when;
    for (let i = 2; i < path.length; i += 2) {
      const t = when + Math.max(0, path[i]);
      if (t > last + 1e-4) param.linearRampToValueAtTime(f(path[i + 1]), t); else param.setValueAtTime(f(path[i + 1]), t);
      last = Math.max(last, t);
    }
  };
  const hz = (v: number) => Math.max(20, Math.min(20000, v));
  const chain: AudioNode[] = [];
  if (level) {
    const g = ctx.createGain();
    walk(g.gain, level, (v) => Math.max(0, Math.min(4, v)));
    chain.push(g);
  }
  for (const [path, type] of [[hp, 'highpass'], [lp, 'lowpass']] as const) {
    if (!path) continue;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = 0.7;
    walk(f.frequency, path, hz);
    chain.push(f);
  }
  if (pan) {
    const s = ctx.createStereoPanner();
    walk(s.pan, pan, (v) => Math.max(-1, Math.min(1, v)));
    chain.push(s);
  }
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  chain[chain.length - 1].connect(out.dry);
  const moved: VoiceOut = {};
  for (const name of SEND_NAMES) {
    if (name === 'dry') { moved.dry = chain[0]; continue; }
    Object.defineProperty(moved, name, { get: () => out[name], enumerable: true });
  }
  return moved;
}

/**
 * **A sine with harmonics, as one wave per context** (the performance review of
 * 10-06): the liquid kick's head and the clean sine line's sub carry a row's
 * harmonic levels, and every hit built its own PeriodicWave — WebKit builds all
 * of a wave's band-limited tables when it is made, about thirty-six inverse
 * FFTs on the main thread, so two or three hits a second were megabytes a
 * second of garbage on a phone. The same levels are the same wave: built once
 * per context by its numbers, as `phasedLfo`'s are.
 */
const harmonicWaves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
export function harmonicWave(ctx: BaseAudioContext, harmonics: readonly number[]): PeriodicWave {
  let per = harmonicWaves.get(ctx);
  if (!per) harmonicWaves.set(ctx, (per = new Map()));
  const key = harmonics.join(',');
  let wave = per.get(key);
  if (!wave) {
    const hs = [0, 1, ...harmonics];
    wave = ctx.createPeriodicWave(new Float32Array(hs.length), Float32Array.from(hs), { disableNormalization: true });
    per.set(key, wave);
  }
  return wave;
}

// An LFO whose phase is set, so a seeded track starts its movement in the same
// place every time instead of wherever the oscillator happens to begin.
//
// The wave is cached, quantised to a sixty-fourth of a turn. Building a
// PeriodicWave means allocating and normalising a wavetable, and the strings
// alone ask for four per note: on a live page that was enough to starve the
// scheduler, and a starved scheduler is a mix that never reaches its next
// theme.
const lfoWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
const LFO_STEPS = 64;
export function phasedLfo(ctx: BaseAudioContext, hz: number, phase = 0): OscillatorNode {
  let per = lfoWaves.get(ctx);
  if (!per) {
    per = new Map();
    lfoWaves.set(ctx, per);
  }
  const turn = Math.PI * 2;
  const key = Math.round((((phase % turn) + turn) % turn) * (LFO_STEPS / turn)) % LFO_STEPS;
  let wave = per.get(key);
  if (!wave) {
    const a = (key * turn) / LFO_STEPS;
    wave = ctx.createPeriodicWave(
      new Float32Array([0, Math.cos(a)]),
      new Float32Array([0, Math.sin(a)]),
      { disableNormalization: true }
    );
    per.set(key, wave);
  }
  const o = ctx.createOscillator();
  o.setPeriodicWave(wave);
  o.frequency.value = hz;
  return o;
}

export function panner(ctx: BaseAudioContext, pan: number): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  return p;
}
