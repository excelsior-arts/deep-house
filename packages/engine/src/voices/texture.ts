// Three textures: a bed, a cloud of grains, and a riser that goes the other way.
//
// `fx.ts` is the record's own glue — a riser, a sweep down, a swell and an
// impact, four gestures that mark a seam — and it is untouched. These three are
// what a record needs between the gestures: something that is *always there*.
//
//   `vinylBed`      noise, filtered, slow, and nothing else: the air of a room
//                   and the surface of a record. It is the cheapest voice in
//                   the engine — one buffer source and three filters — and it
//                   is the one whose whole job is to be inaudible until it
//                   stops.
//   `grainPad`      a cloud: many short grains read out of one cached buffer at
//                   the pitches of a chord, each with its own window, its own
//                   place and its own moment. It has a `HoldRenderer` beside
//                   it, because a texture with a length is a gesture and a
//                   texture without one is a texture.
//   `sweepUp`       the second riser: `fx.ts`'s own rises in *pitch* and this
//                   one rises in **brightness** — a fixed noise band whose
//                   corner climbs — which is the other half of what a riser is
//                   and the half this record has not got.
//
// ## Why the grains are a buffer and not a hundred oscillators
//
// A grain is a few tens of milliseconds of something, windowed. Made out of an
// oscillator each, a cloud of thirty grains a second is thirty oscillators, an
// envelope and a panner a second — which is `hats.ts`'s measurement again, the
// one that put a hat into a rendered buffer in the first place: six oscillators
// and four filters a hit was 47 % of what the audio thread did. So the grain
// **source** is rendered once per context — a second of a harmonically rich
// waveform, computed as a sum of partials with a fixed seed so it is the same
// in the live take and in the render — and a grain is a `BufferSourceNode`
// reading a slice of it at a playback rate, which is four nodes and no
// arithmetic. The pitch of a grain is then a playback rate, which is exactly
// what a granular instrument is.

import { midiToHz, route, panner, startTime, noiseSource, phasedLfo, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { heldVoice } from './held.ts';
import { insert } from './treat.ts';
import type { Descriptor, NoteParams } from './descriptor.ts';
import type { HeldVoice } from './voice-contract.ts';
import type { Settings } from '../settings.ts';

// --- the bed ---------------------------------------------------------------

/**
 * The noise chain both the bed and the sweep are made of: a band, a lid, a
 * floor. It is one function because the two are the same three filters with
 * different numbers in them, which is `perc.ts`'s lesson about the small
 * percussion said again — four instruments that are each one filter.
 */
function band(ctx: BaseAudioContext, S: Settings['vinylBed'] | Settings['sweepUp']): { hp: BiquadFilterNode; lp: BiquadFilterNode } {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.Q.value = 0.7;
  hp.frequency.value = S.hpHz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.value = S.lpHz;
  hp.connect(lp);
  return { hp, lp };
}

export function vinylBed(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = settings.vinylBed;
  const dur = Math.max(0.2, p.dur ?? 4);
  const vel = p.vel ?? 0.7;
  const end = time + dur + S.release;

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const peak = vel * (p.gain ?? 1) * S.trim;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + S.attack);
  g.gain.setValueAtTime(peak, Math.max(time + S.attack, end - S.release));
  g.gain.linearRampToValueAtTime(0, end);

  const b = band(ctx, S);
  b.lp.connect(g);
  const src = noiseSource(ctx, time, dur + S.release + 0.05);
  src.connect(b.hp);

  // The one movement: the lid breathes, very slowly and very little. A bed that
  // does not move is a hiss, and a bed that moves is a room.
  // R74: a phase in radians off the note's own pitch, as its siblings' are — it was
  // a fraction of a turn off the context's clock, so 11 of 64 steps were reachable
  // and live, render and a seek each started it somewhere else.
  const lfo = phasedLfo(ctx, S.driftHz, ((p.midi ?? 0) % 5) * 1.2);
  const depth = ctx.createGain();
  depth.gain.value = S.lpHz * S.driftDepth;
  lfo.connect(depth);
  depth.connect(b.lp.frequency);
  lfo.start(time);
  lfo.stop(end + 0.05);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: 0, reverb: p.reverb ?? 0.3 });
  return end + MIN_RELEASE;
}

export function sweepUp(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = settings.sweepUp;
  const dur = Math.max(0.3, p.dur ?? 3);
  const vel = p.vel ?? 0.9;
  const end = time + dur + S.release;

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const peak = vel * (p.gain ?? 1) * S.trim;
  g.gain.setValueAtTime(0, time);
  // The level climbs with the brightness, which is what makes it a riser rather
  // than a filter sweep: both of them arrive at once.
  g.gain.linearRampToValueAtTime(peak, time + dur);
  g.gain.linearRampToValueAtTime(0, end);

  const b = band(ctx, S);
  b.lp.connect(g);
  // The corner climbs in **octaves**, which is what an exponential ramp on a
  // frequency is and is how a sweep sounds like it is moving evenly.
  b.lp.frequency.setValueAtTime(S.fromHz, time);
  b.lp.frequency.exponentialRampToValueAtTime(S.toHz, time + dur);
  // And so does the floor, a little behind it: a riser that only opens its lid
  // keeps its bottom, and a riser that takes its bottom with it is the one that
  // makes room for the drop.
  b.hp.frequency.setValueAtTime(S.hpHz, time);
  b.hp.frequency.exponentialRampToValueAtTime(S.hpToHz, time + dur);

  const src = noiseSource(ctx, time, dur + S.release + 0.05);
  src.connect(b.hp);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.2, reverb: p.reverb ?? 0.5 });
  return end + MIN_RELEASE;
}

// --- the grains ------------------------------------------------------------

// Per context *and per source spec*: a second room that asks for a longer or
// differently tuned source in the same context gets its own, not the first's
// (the outside review, 09-19: asked for two seconds at 440 Hz after the default, the cache
// answered the first second at the first tuning).
const grainCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/**
 * The source a grain is a slice of: one second of a rich waveform, computed
 * once per context. It is a sum of partials with a fixed seed, so what a grain
 * reads is the same in a live take and in a render — `noiseBuffer`'s own rule,
 * one folder down.
 */
export function grainBuffer(ctx: BaseAudioContext, S: Settings['grainPad']): AudioBuffer {
  let per = grainCache.get(ctx);
  if (!per) { per = new Map(); grainCache.set(ctx, per); }
  const key = `${S.sourceSeconds}:${S.sourceHz}:${S.sourcePartials}:${S.sourceStretch}:${S.sourceTilt}`;
  const had = per.get(key);
  if (had) return had;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * S.sourceSeconds);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  // The partials of the *source*, not of a note: what the grains are cut out of
  // wants to be harmonically rich and inharmonically detuned, so that two
  // grains from two places never line up.
  const base = S.sourceHz;
  let peak = 0;
  for (let k = 1; k <= S.sourcePartials; k++) {
    const f = base * k * (1 + S.sourceStretch * k);
    const a = 1 / Math.pow(k, S.sourceTilt);
    const phase = (k * 2.399963) % (Math.PI * 2);
    for (let i = 0; i < len; i++) d[i] += a * Math.sin((2 * Math.PI * f * i) / rate + phase);
  }
  for (let i = 0; i < len; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
  if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  per.set(key, buf);
  return buf;
}

/** What the cloud asks one grain for: its rate, its level, its place, its length and its lid. */
interface GrainSpec {
  rate: number;
  level: number;
  pan: number;
  length: number;
  tilt: number;
}

/**
 * One grain: a slice of the source, at a rate, under a window, in a place.
 */
function grain(
  ctx: BaseAudioContext,
  buf: AudioBuffer,
  at: number,
  into: AudioNode,
  { rate, level, pan, length, tilt }: GrainSpec,
  S: Settings['grainPad'],
): { src: AudioBufferSourceNode; env: GainNode; end: number } {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const env = ctx.createGain();
  // A raised-cosine window, as three ramps: a grain with a corner in it is a
  // click, and thirty clicks a second is a buzz at 30 Hz.
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + length * 0.5);
  env.gain.linearRampToValueAtTime(0, at + length);
  const pn = panner(ctx, pan);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = tilt;
  src.connect(env);
  env.connect(lp);
  lp.connect(pn);
  pn.connect(into);
  // Where in the source this grain is cut from. It walks rather than jumps, so
  // two grains in a row are two places in one sound and not two sounds.
  const offset = ((at * S.scanRate) % (buf.duration - length * rate - 0.01));
  src.start(at, Math.max(0, offset), length * rate + 0.02);
  // When it is over: the window has closed and the slice has run out. What a
  // ring of grains uses to know which of them it may let go of.
  return { src, env, end: at + length + 0.02 / rate + 0.05 };
}

/** One grain in flight: its source, and the instant it is over. */
interface Grain {
  src: AudioBufferSourceNode;
  end: number;
}

/**
 * The cloud both the one-shot and the held renderer build.
 *
 * Grains from `time` up to (not including) `until`, on a grid of `S.every`,
 * and `n0` is which grain of the chord cycle the first of them is: a held
 * cloud is laid in stretches and the stretch after this one starts where this
 * one stopped, on the same grid and at the next note of the chord, so a cloud
 * laid in ten pieces is the cloud laid in one. Hands back where the next
 * stretch begins.
 */
function cloud(
  ctx: BaseAudioContext,
  into: AudioNode,
  time: number,
  until: number,
  p: NoteParams,
  S: Settings['grainPad'],
  n0 = 0,
): { grains: Grain[]; next: number; n: number } {
  const buf = grainBuffer(ctx, S);
  const hz = midiToHz(p.midi ?? 60);
  const grains: Grain[] = [];
  // The dice are the **grain's own time**, which is `drumkit.ts`'s rule said
  // for a texture: nothing reads a seed the plan has not already got, so a
  // stretch of this cloud is the same cloud in a render, in a slice of one and
  // in the live take.
  let n = n0;
  let t = time;
  for (; t < until; t += S.every, n++) {
    const d1 = ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const d2 = ((Math.sin(t * 78.233) * 12345.6789) % 1 + 1) % 1;
    const d3 = ((Math.sin(t * 39.425) * 24634.6345) % 1 + 1) % 1;
    // Which note of the chord this grain is: the cloud is a chord and not a
    // note, which is what makes it a pad.
    const step = S.chord[n % S.chord.length];
    const rate = (hz * Math.pow(2, step / 12)) / S.sourceHz;
    const jitter = 1 + (d1 - 0.5) * S.rateSpread;
    const g = grain(ctx, buf, t + d2 * S.every * S.timeSpread, into, {
      rate: rate * jitter,
      level: S.grainLevel * (0.6 + 0.4 * d3),
      pan: (d3 * 2 - 1) * S.spread,
      length: S.grainSeconds * (0.7 + 0.6 * d1),
      tilt: Math.min(14000, S.tiltHz * (0.7 + 0.6 * d2)),
    }, S);
    grains.push({ src: g.src, end: g.end });
  }
  return { grains, next: t, n };
}

export function grainPad(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = settings.grainPad;
  const dur = Math.max(0.2, p.dur ?? 3.5);
  const vel = p.vel ?? 0.7;
  const end = time + dur + S.release;

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  const peak = vel * (p.gain ?? 1) * S.trim;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + (p.attack ?? S.attack));
  g.gain.setValueAtTime(peak, Math.max(time + (p.attack ?? S.attack), end - S.release));
  g.gain.linearRampToValueAtTime(0, end);

  cloud(ctx, g, time, time + dur, p, S);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? 0.1, reverb: p.reverb ?? 0.6 });
  return end + MIN_RELEASE;
}

/**
 * Live, how far ahead of the clock the cloud is laid, and how often it is
 * topped up. The window has to outlast the longest gap between two top-ups,
 * and the longest gap is not this timer's own: a hidden tab wakes a page's
 * timers once a second, so three seconds of grains ahead is two seconds of
 * margin over that, and a top-up every half second is four looks at the clock
 * per window while the page is visible.
 */
const LIVE_WINDOW = 3;
const LIVE_TICK_MS = 500;

/**
 * The same cloud, held. It is the one held voice in this engine whose sound is
 * **scheduled ahead** rather than sustained — a grain is a one-shot and a cloud
 * is a lot of them — and the two cases the contract serves want that done two
 * ways:
 *
 *   offline   there is a whole timeline to fill and no clock to come back on,
 *             so the grains are laid to `p.horizon` at once, and the render is
 *             told where its end is (the fixture does)
 *   live      there is a clock and no end, so the cloud is a **ring**: laid
 *             `LIVE_WINDOW` seconds ahead of the clock, topped up on a timer,
 *             and grains that are over are let go of — so a held cloud plays
 *             for as long as it is held, and what the audio thread carries is
 *             one window's worth of grains and not a horizon's
 *
 * Until 09-20 the live case took the offline path: 686 sources and 2 748 nodes
 * built at once for the default 24-second horizon, and silence from then on
 * while the handle still said `holding` (the outside review of 09-19, its
 * E03). MEASURED after, against the recording context: 86 sources and 348
 * nodes at the start, about 92 in flight at any instant, and grains still
 * being laid at ninety seconds.
 *
 * The ring is the *same* cloud: a stretch begins where the last one stopped,
 * on the same grid and at the next note of the chord, and every grain's dice
 * are its own instant, so nothing about a grain depends on which top-up laid
 * it. A pause does not stop the ring — the cloud is a place in time and a
 * pause is a silence over it, exactly as the two pads' oscillators keep
 * running under a gain at nothing — so a resume is instant and the cloud
 * comes back where it would have been.
 */
export function holdGrainPad(
  ctx: BaseAudioContext,
  out: VoiceOut,
  at: number,
  p: NoteParams = {},
  settings: Settings,
): HeldVoice {
  const S = settings.grainPad;
  const time = startTime(ctx, at);
  const level = (p.vel ?? 0.8) * (p.gain ?? 1) * S.trim;
  const attack = p.attack ?? S.attack;
  const tail = p.tail ?? S.release;
  const horizon = p.horizon ?? S.horizon;
  // A render has `startRendering`; a device has not. `effects/shell.ts` reads
  // the same line for the same reason.
  const live = typeof (ctx as Partial<OfflineAudioContext>).startRendering !== 'function';

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, level), time + Math.max(MIN_RELEASE, attack));

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = Math.min(14000, S.tiltHz);
  lp.connect(g);

  // The ring: what is in flight, and the one list `heldVoice` stops and lets
  // go of, kept in step with it. Where the next stretch begins and which note
  // of the chord it is are carried from stretch to stretch.
  const inFlight: Grain[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  let next = time;
  let n = 0;
  // Once a release is asked for, nothing is laid past the instant it is silent.
  let silentAt = Infinity;
  const lay = (until: number): void => {
    const made = cloud(ctx, lp, next, Math.min(until, silentAt), p, S, n);
    for (const grain of made.grains) {
      if (silentAt < Infinity) grain.src.stop(silentAt);
      inFlight.push(grain);
      sources.push(grain.src);
    }
    next = made.next;
    n = made.n;
  };
  const sweep = (): void => {
    const now = ctx.currentTime;
    let kept = 0;
    for (const grain of inFlight) if (grain.end >= now) inFlight[kept++] = grain;
    inFlight.length = kept;
    sources.length = 0;
    for (const grain of inFlight) sources.push(grain.src);
  };
  lay(time + (live ? LIVE_WINDOW : horizon));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pumping = live && typeof setTimeout === 'function';
  // **Two clocks call the top-up, and the first to arrive does it** (R94 of the
  // reconciled review of 09-24). The page's own timer is clamped in a hidden
  // tab — once a second, and far less often under a browser's intensive
  // throttling — which is why the scheduler's tick comes from a Worker; the
  // cloud's came from the page alone. Beside it, a silent source on the
  // context stops at the same instant and its `ended` is the other call: an
  // event the audio clock raises, not a timer the page's throttling reaches.
  // It adds exactly nought into the filter, through a gain of nought.
  let tick: ConstantSourceNode | null = null;
  const idle = live && typeof ctx.createConstantSource === 'function' ? ctx.createGain() : null;
  if (idle) { idle.gain.value = 0; idle.connect(lp); }
  // The timer is never a reason to keep a process alive: a page has no
  // `unref` and does not need one, and a node process holding a cloud it
  // forgot to dispose of should still be allowed to end.
  const arm = (): void => {
    timer = setTimeout(pump, LIVE_TICK_MS);
    (timer as unknown as { unref?: () => void }).unref?.();
    if (!idle) return;
    const s = ctx.createConstantSource();
    s.connect(idle);
    s.onended = () => { if (tick === s) pump(); };
    s.start();
    s.stop(ctx.currentTime + LIVE_TICK_MS / 1000);
    tick = s;
  };
  const unTick = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    if (tick) { tick.onended = null; try { tick.disconnect(); } catch (e) { /* gone */ } }
    tick = null;
  };
  function pump(): void {
    unTick();
    if (!pumping) return;
    sweep();
    lay(Math.max(next, ctx.currentTime + LIVE_WINDOW));
    if (next >= silentAt) { pumping = false; return; }
    arm();
  }
  const stopPumping = (): void => {
    pumping = false;
    unTick();
    if (idle) try { idle.disconnect(); } catch (e) { /* gone */ }
  };
  if (pumping) arm();

  route(ctx, g, out, { dry: 1, delay: p.delay ?? 0.08, reverb: p.reverb ?? 0.6 });

  const voice = heldVoice(ctx, {
    gain: g,
    tail,
    level,
    attack: { from: 0, to: Math.max(GAIN_FLOOR, level), t0: time, t1: time + Math.max(MIN_RELEASE, attack) },
    parked: [{ param: lp.frequency, value: lp.frequency.value }],
    controls: {
      gain: (v) => [[g.gain, Math.max(GAIN_FLOOR, v)]],
      brightness: (v) => [[lp.frequency, Math.max(CUTOFF_FLOOR, v)]],
    },
    sources,
    nodes: [lp, g],
  });

  // The handle is `heldVoice`'s with the ring's two ends on it: a release lays
  // grains up to the instant it is silent and no further, and a dispose stops
  // the timer with everything else. The getters are delegated by hand because
  // a spread reads a getter once.
  return {
    controls: voice.controls,
    tail: voice.tail,
    get state() { return voice.state; },
    get level() { return voice.level; },
    get releaseAt() { return voice.releaseAt; },
    setControl: (name, value, atTime, over) => voice.setControl(name, value, atTime, over),
    pause: (atTime) => voice.pause(atTime),
    resume: (atTime) => voice.resume(atTime),
    release(atTime) {
      const silent = voice.release(atTime);
      if (voice.state === 'released' && silent < silentAt) {
        silentAt = silent;
        if (pumping) pump();
      }
      return silent;
    },
    dispose() {
      stopPumping();
      voice.dispose();
    },
  };
}

/** MEASURED by `tools/test-voices-2.ts --bless`. */
export const VINYL_BED_TIMBRES = {
  vinylBed: { family: 'noise', struck: false, hold: 1, brightnessHz: 5200, loudnessDb: -12.9 },
};
export const GRAIN_PAD_TIMBRES = {
  grainPad: { family: 'sustained', struck: false, hold: 0.8, brightnessHz: 2600, loudnessDb: -11 },
};
export const SWEEP_UP_TIMBRES = {
  sweepUp: { family: 'noise', struck: false, hold: 0.9, brightnessHz: 6000, loudnessDb: -12.9 },
};

export const vinylBedDescriptor: Descriptor = {
  name: 'vinylBed',
  cost: 'mid',
  family: 'noise',
  roles: ['texture'],
  bus: 'melodic',
  level: 'fx',
  layer: 'fx',
  plays: null,
  mono: false,
  treat: false,
  anticipates: null,
  prepare: null,
  render: vinylBed,
  timbres: VINYL_BED_TIMBRES,
  dispatches: [],
  mood: [],
};

export const sweepUpDescriptor: Descriptor = {
  name: 'sweepUp',
  cost: 'cheap',
  family: 'effect',
  roles: ['texture'],
  bus: 'melodic',
  level: 'fx',
  layer: 'fx',
  plays: null,
  mono: false,
  treat: false,
  anticipates: null,
  prepare: null,
  render: sweepUp,
  timbres: SWEEP_UP_TIMBRES,
  dispatches: [],
  mood: [],
};

export const grainPadDescriptor: Descriptor = {
  name: 'grainPad',
  cost: 'dear',
  family: 'ensemble',
  roles: ['sustained'],
  bus: 'melodic',
  level: 'pad',
  layer: 'pad',
  plays: null,
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: grainPad,
  timbres: GRAIN_PAD_TIMBRES,
  dispatches: [],
  mood: [],
};

export const descriptors: Descriptor[] = [vinylBedDescriptor, grainPadDescriptor, sweepUpDescriptor];
export default descriptors;
