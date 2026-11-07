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

import { midiToHz, route, panner, startTime, noiseSource, phasedLfo, lcg, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR, fanned } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { heldVoice } from './held.ts';
import { insert } from './treat.ts';
import type { NoteParams } from './descriptor.ts';
import type { HeldVoice } from './voice-contract.ts';
import type { Settings } from '../settings.ts';
import { patchOf, provePatch, withDesk } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { bool, contract, int, list, num, pos, word, DB, HZ, LEVEL, LFO_HZ, Q, SECONDS, SEND, SPREAD, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';
import { cutAndHold } from '../graph-scope.ts';

// --- the bed ---------------------------------------------------------------

/**
 * The noise chain both the bed and the sweep are made of: a band, a lid, a
 * floor. It is one function because the two are the same three filters with
 * different numbers in them, which is `perc.ts`'s lesson about the small
 * percussion said again — four instruments that are each one filter.
 */
function band(ctx: BaseAudioContext, S: { readonly hpHz: number; readonly lpHz: number; readonly q: number }): { hp: BiquadFilterNode; lp: BiquadFilterNode } {
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

function vinylBed(
  row: SoundRow,
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S0 = patchOf(settings, row, VINYL_FIELDS);
  // A note may open the lid (`lidHz`): the same bed with more air above it, brought forward in a
  // passage where it is the foreground; absent, the row's own corner.
  const S = typeof p.lidHz === 'number' && Number.isFinite(p.lidHz) ? { ...S0, lpHz: Math.max(S0.hpHz * 2, Math.min(16000, p.lidHz)) } : S0;
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

function sweepUp(
  row: SoundRow,
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, SWEEP_FIELDS);
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
  // How far it climbs (round wind): a note may say, in octaves of the lid (`p.rise`), and then both ends arrive where
  // the row's do and start that far under them — the floor by the same share of its own climb — so a short wind is
  // the top of the long one and the pace per beat stays the planner's. Absent, the row's whole climb.
  const rise = typeof p.rise === 'number' && p.rise > 0 ? Math.min(p.rise, Math.log2(S.toHz / S.fromHz)) : null;
  const share = rise == null ? 1 : rise / Math.log2(S.toHz / S.fromHz);
  const fromHz = rise == null ? S.fromHz : S.toHz / Math.pow(2, rise);
  const hpHz = rise == null ? S.hpHz : S.hpToHz / Math.pow(S.hpToHz / S.hpHz, share);
  // The corner climbs in **octaves**, which is what an exponential ramp on a
  // frequency is and is how a sweep sounds like it is moving evenly.
  b.lp.frequency.setValueAtTime(fromHz, time);
  b.lp.frequency.exponentialRampToValueAtTime(S.toHz, time + dur);
  // And so does the floor, a little behind it: a riser that only opens its lid
  // keeps its bottom, and a riser that takes its bottom with it is the one that
  // makes room for the drop.
  b.hp.frequency.setValueAtTime(hpHz, time);
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
export function grainBuffer(ctx: BaseAudioContext, S: GrainPatch): AudioBuffer {
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
  S: GrainPatch,
): { src: AudioBufferSourceNode; env: GainNode; out: AudioNode; end: number; nodes: AudioNode[] } {
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
  return { src, env, out: pn, end: at + length + 0.02 / rate + 0.05, nodes: [src, env, lp, pn] };
}

/** One grain in flight: its source, the node it ends on, and the instant it is over. */
interface Grain {
  src: AudioBufferSourceNode;
  out: AudioNode;
  end: number;
  /** the grain's whole chain, cut and held a while once it is over (round crash-resume, `graph-scope.ts`) */
  nodes: AudioNode[];
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
  S: GrainPatch,
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
      pan: (d3 * 2 - 1) * fanned(S.spread, true),
      length: S.grainSeconds * (0.7 + 0.6 * d1),
      tilt: Math.min(14000, S.tiltHz * (0.7 + 0.6 * d2)),
    }, S);
    grains.push({ src: g.src, out: g.out, end: g.end, nodes: g.nodes });
  }
  return { grains, next: t, n };
}

function grainPad(
  row: SoundRow,
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, GRAIN_FIELDS);
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
  // the held cloud is the record's own `grainPad`, the room's copy of its row
  const S = withDesk('grainPad', provePatch(settings.grainPad, GRAIN_FIELDS, 'the settings\' grainPad block', true), GRAIN_FIELDS, 'the settings\' grainPad block', true);
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
    // a grain that is over lets go of the cloud's filter, so its chain leaves the graph (the performance
    // review of 10-06: the list was compacted and every grain since the cloud began stayed wired in); its whole
    // chain is cut and held a while, never collected still wired (round crash-resume, `graph-scope.ts`)
    for (const grain of inFlight) if (grain.end >= now) inFlight[kept++] = grain; else cutAndHold(grain.nodes);
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
    if (tick) { tick.onended = null; cutAndHold([tick]); }
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
    if (idle) cutAndHold([idle]);
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
      // the grains still in flight, whole (their sources the voice has stopped)
      for (const grain of inFlight) cutAndHold(grain.nodes);
      inFlight.length = 0;
    },
  };
}

/** What a vinyl bed row carries: exactly these, each in its range (`schema.ts`). */
const VINYL_FIELDS = contract({
  attack: SECONDS,
  release: SECONDS,
  hpHz: HZ,
  lpHz: HZ,
  q: DB,
  driftHz: LFO_HZ,
  driftDepth: UNIT,
  trim: LEVEL,
});

/**
 * The vinyl bed topology: band-passed noise whose lid breathes
 * (`sounds/noise/vinylBed.json` since round R2).
 */
export const VINYL: Topology = {
  id: 'vinyl',
  cost: 'mid',
  parameters: VINYL_FIELDS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => vinylBed(row, ctx, out, time, p, settings),
};

/** What a grain cloud row carries: exactly these, each in its range (`schema.ts`). */
const GRAIN_FIELDS = contract({
  /** the source the grains are cut from: its length, its tuning, how many partials it is summed of (each a pass over the buffer), how far they stretch and fall */
  sourceSeconds: pos(4),
  sourceHz: HZ,
  sourcePartials: int(1, 64),
  sourceStretch: num(0, 0.1),
  sourceTilt: num(0, 4),
  /** a grain on this grid, in seconds: the grid bounds how many grains a second is made of */
  every: num(0.005, 10),
  grainSeconds: pos(2),
  grainLevel: LEVEL,
  timeSpread: UNIT,
  rateSpread: SPREAD,
  tiltHz: HZ,
  spread: UNIT,
  scanRate: num(0, 10),
  /** the steps, in semitones, the grains walk through */
  chord: list(num(-48, 48), 1, 16),
  attack: SECONDS,
  release: SECONDS,
  /** how far ahead a held cloud lays its grains, in seconds */
  horizon: SECONDS,
  trim: LEVEL,
});

/** What a row of this topology carries, as its contract types it. */
export type GrainPatch = PatchOf<typeof GRAIN_FIELDS.fields>;

/**
 * The grain cloud topology: one-shot grains of a rendered source laid over
 * a chord (`sounds/ensemble/grainPad.json` since round R2). Its held entry,
 * `holdGrainPad`, reads the same block.
 */
export const GRAIN_CLOUD: Topology = {
  id: 'grain-cloud',
  cost: 'dear',
  parameters: GRAIN_FIELDS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => grainPad(row, ctx, out, time, p, settings),
};

/** What a noise sweep row carries: exactly these, each in its range (`schema.ts`). */
const SWEEP_FIELDS = contract({
  release: SECONDS,
  fromHz: HZ,
  toHz: HZ,
  hpHz: HZ,
  hpToHz: HZ,
  lpHz: HZ,
  q: DB,
  trim: LEVEL,
});

/**
 * The noise sweep topology: a band of noise whose lid and floor climb in
 * octaves while the level climbs with them (`sounds/effect/sweepUp.json` since
 * round R2).
 */
export const NOISE_SWEEP: Topology = {
  id: 'noise-sweep',
  cost: 'cheap',
  parameters: SWEEP_FIELDS,
  // (round wind) a note that says `arrive` is laid at its arrival, as the reverse swell's is: it starts its own length
  // before its time and lands on it. Any other note starts at its time, as it always has.
  anticipates: (p: NoteParams) => (p?.arrive ? Math.max(0.3, Number(p.dur ?? 3)) : 0),
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => sweepUp(row, ctx, out, time, p, settings),
};

// --- the air (round air-voices, 11-02) ---------------------------------------
//
// One noise voice for everything that lives above 5 kHz and is not a hit: the bed that comes and goes, the riser
// that lives only in the air, the breath at a phrase line, the arcs of a beatless stretch, a bow's breath. The vinyl
// bed is the topology it grew from (a band, a lid that drifts), with what that one cannot do: two streams of pink or
// white noise, as wide as the row says (`corr`), and three shapes a note asks for by name.
//
//   `bed`    up over `attack` (or the note's own), held, down over `release`; the lid drifts. A note that asks to
//            breathe (`cycle`, `fall`, `lowHz`, `dipDb`) closes the lid toward `lowHz` over `fall` seconds of each
//            `cycle` and lets the level dip by `dipDb` with it, then opens again.
//   `rise`   the level on a power curve (`curve`) over the note, from nothing to its peak, and cut dead on the end
//            (`release` a few milliseconds). A note with `flat` holds it level instead (the held hiss over a break's
//            last bars), with `attack` in.
//   `swell`  a band-pass whose centre glides `bandHz[0]` -> `bandHz[1]` at the note's `peak` share and back, the
//            level up and down with it on a raised cosine: the breath, the arc, the bow's breath (a short note).
//
// Why a topology of its own: `vinyl` renders one shape from one mono stream, and its contract is every bed's (the
// vinyl, the air and the weather rows), so a new field there moves them all; `noise-rise` climbs a band from 320 Hz
// on an exponential gain and cannot sit flat or stay above 9 kHz. The pink is the bed's colour the miners measured
// (a white band 5-14 kHz is 4.5 dB brighter at its top than theirs).

/** Two streams of noise, pink or white, the right `corr` of the left: rendered once a context per kind. */
const airCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function airBuffer(ctx: BaseAudioContext, pink: boolean, corr: number): AudioBuffer {
  let per = airCache.get(ctx);
  if (!per) { per = new Map(); airCache.set(ctx, per); }
  const c = Math.max(0, Math.min(1, corr)), key = `${pink ? 'p' : 'w'}:${c}`;
  const had = per.get(key);
  if (had) return had;
  const len = Math.floor(ctx.sampleRate * 4);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const k = Math.sqrt(1 - c * c);
  const draw = (seed: number): Float32Array => {
    const w = lcg(seed), d = new Float32Array(len);
    if (!pink) { for (let i = 0; i < len; i++) d[i] = w(); return d; }
    // the usual three-pole pink filter, scaled back to about the white stream's level
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const x = w();
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
    }
    return d;
  };
  const a = draw(31337), b = draw(31337 + 4099);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < len; i++) { L[i] = a[i]; R[i] = c * a[i] + k * b[i]; }
  per.set(key, buf);
  return buf;
}

/** A raised-cosine swell, or a power curve, as points for `setValueCurveAtTime`. */
function airCurve(n: number, f: (x: number) => number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.max(0, f(i / (n - 1)));
  return c;
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function airNote(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const S = patchOf(settings, row, AIR_FIELDS);
  const shape = p.shape === 'bed' || p.shape === 'rise' || p.shape === 'swell' ? p.shape : S.shape;
  const dur = Math.max(0.02, p.dur ?? 4);
  const peak = (p.vel ?? 1) * (p.gain ?? 1) * S.trim;
  const release = fin(p.release) ? Math.max(0.003, p.release) : S.release;
  const end = time + dur + (shape === 'swell' ? 0 : release);

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // the band: a high-pass of one or two stages under a lid
  const hpHz = fin(p.hpHz) ? p.hpHz : S.hpHz;
  const lidHz = Math.min(18000, fin(p.lidHz) ? p.lidHz : S.lpHz);
  const src = ctx.createBufferSource();
  src.buffer = airBuffer(ctx, S.pink, S.corr);
  src.loop = true;
  src.start(time, (time * 7.13) % src.buffer.duration);
  src.stop(end + 0.05);
  let at: AudioNode = src;
  for (let i = 0; i < S.poles; i++) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 0.7;
    hp.frequency.value = hpHz;
    at.connect(hp);
    at = hp;
  }
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = S.q;
  lp.frequency.value = lidHz;
  at.connect(lp);
  at = lp;

  if (shape === 'swell') {
    const [f0, f1] = Array.isArray(p.bandHz) && p.bandHz.length === 2 && p.bandHz.every(fin) ? p.bandHz as [number, number] : S.bandHz;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = fin(p.bandQ) ? p.bandQ : S.bandQ;
    const top = Math.max(0.05, Math.min(0.95, fin(p.peak) ? p.peak : S.peak));
    bp.frequency.setValueAtTime(f0, time);
    bp.frequency.exponentialRampToValueAtTime(f1, time + dur * top);
    bp.frequency.exponentialRampToValueAtTime(f0, time + dur);
    at.connect(bp);
    at = bp;
    // up on a half cosine to the peak, down on one after it
    g.gain.setValueAtTime(0, time);
    g.gain.setValueCurveAtTime(airCurve(64, (x) => peak * (x <= top ? 0.5 - 0.5 * Math.cos(Math.PI * x / top) : 0.5 + 0.5 * Math.cos(Math.PI * (x - top) / (1 - top)))), time, dur);
  } else if (shape === 'rise') {
    const k = fin(p.curve) ? Math.max(0, p.curve) : S.curve;
    if (p.flat) {
      const a = Math.min(dur * 0.5, fin(p.attack) ? p.attack : S.attack);
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(peak, time + a);
      g.gain.setValueAtTime(peak, time + dur);
    } else {
      g.gain.setValueAtTime(0, time);
      g.gain.setValueCurveAtTime(airCurve(128, (x) => peak * Math.pow(x, k)), time, dur);
    }
    // cut dead on the line
    g.gain.linearRampToValueAtTime(0, time + dur + release);
  } else {
    const a = Math.min(dur, fin(p.attack) ? p.attack : S.attack);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + a);
    g.gain.setValueAtTime(peak, time + dur);
    g.gain.linearRampToValueAtTime(0, time + dur + release);
    // a bed that breathes: the lid closes over `fall` of each `cycle` and opens again, the level dipping with it
    if (fin(p.cycle) && p.cycle > 0.5 && fin(p.fall) && fin(p.lowHz)) {
      const fall = Math.min(p.cycle - 0.1, Math.max(0.1, p.fall)), low = Math.max(CUTOFF_FLOOR, Math.min(lidHz, p.lowHz));
      const dip = Math.pow(10, -(fin(p.dipDb) ? Math.max(0, p.dipDb) : 0) / 20);
      const breath = ctx.createGain();
      breath.gain.setValueAtTime(1, time);
      lp.frequency.setValueAtTime(lidHz, time);
      for (let t = time; t < time + dur; t += p.cycle) {
        lp.frequency.setValueAtTime(lidHz, t);
        lp.frequency.exponentialRampToValueAtTime(low, t + fall);
        lp.frequency.exponentialRampToValueAtTime(lidHz, Math.min(t + p.cycle, time + dur + release));
        breath.gain.setValueAtTime(1, t);
        breath.gain.linearRampToValueAtTime(dip, t + fall);
        breath.gain.linearRampToValueAtTime(1, Math.min(t + p.cycle, time + dur + release));
      }
      at.connect(breath);
      at = breath;
    } else if (S.driftDepth > 0) {
      const lfo = phasedLfo(ctx, S.driftHz, ((p.midi ?? 0) % 5) * 1.2);
      const depth = ctx.createGain();
      depth.gain.value = lidHz * S.driftDepth;
      lfo.connect(depth);
      depth.connect(lp.frequency);
      lfo.start(time);
      lfo.stop(end + 0.05);
    }
  }
  // (round top-voices-2) a bed that moves with the groove: ducked on each beat a note names (`pumpBeat`, seconds; the
  // kick's), down `pumpDb` in a few milliseconds and swelling back over the beat. Absent (every note before it), nothing
  // is built.
  if (shape === 'bed' && fin(p.pumpBeat) && p.pumpBeat > 0.2 && fin(p.pumpDb) && p.pumpDb > 0) {
    const dip = Math.pow(10, -Math.min(12, p.pumpDb) / 20), beat = p.pumpBeat;
    const pump = ctx.createGain();
    pump.gain.setValueAtTime(1, time);
    for (let t = time; t < time + dur + release; t += beat) {
      pump.gain.setValueAtTime(1, t);
      pump.gain.linearRampToValueAtTime(dip, t + 0.012);
      pump.gain.setTargetAtTime(1, t + 0.012, beat * 0.28);
    }
    at.connect(pump);
    at = pump;
  }
  at.connect(g);

  // a slow sway across the field, as wide as the note asks (`sway`, a share of the edge)
  let tail: AudioNode = g;
  const sway = fin(p.sway) ? Math.max(0, Math.min(0.5, p.sway)) : S.sway;
  if (sway > 0) {
    const pn = ctx.createStereoPanner();
    pn.pan.setValueAtTime(0, time);
    pn.pan.setValueCurveAtTime(airCurve(32, (x) => 0.5 + 0.5 * Math.sin(2 * Math.PI * x)).map((v) => (v - 0.5) * 2 * sway) as Float32Array<ArrayBuffer>, time, Math.max(0.05, dur));
    g.connect(pn);
    tail = pn;
  }
  route(ctx, insert(ctx, p, tail, time, end, settings), out, { dry: 1, delay: p.delay ?? S.delay, reverb: p.reverb ?? S.reverb });
  return end + MIN_RELEASE;
}

/** What an air row carries: exactly these, each in its range (`schema.ts`). */
const AIR_FIELDS = contract({
  /** the shape a note plays when it names none */
  shape: word('bed', 'rise', 'swell'),
  /** pink or white, and how much of the left stream the right one is (nought: two sources) */
  pink: bool(),
  corr: UNIT,
  /** the band: a floor of one or two stages (12 or 24 dB an octave), a lid */
  hpHz: HZ,
  poles: int(1, 2),
  lpHz: HZ,
  q: Q,
  /** the lid's slow drift on a bed */
  driftHz: LFO_HZ,
  driftDepth: UNIT,
  /** a bed's fade in and out; a rise's cut */
  attack: SECONDS,
  release: SECONDS,
  /** a rise's power */
  curve: num(0, 8),
  /** a swell's glide: from, to at its peak, the band's Q, where in the note the peak is */
  bandHz: list(HZ, 2),
  bandQ: Q,
  peak: UNIT,
  /** a slow sway across the field, a share of the edge */
  sway: num(0, 0.5),
  reverb: SEND,
  delay: SEND,
  trim: LEVEL,
});

/** The air topology (round air-voices): two streams of noise above 5 kHz in three shapes, a bed, a rise, a swell. */
export const AIR: Topology = {
  id: 'air',
  cost: 'cheap',
  parameters: AIR_FIELDS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => airNote(row, ctx, out, time, p, settings),
};
