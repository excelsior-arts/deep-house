// Piano, synthesised. Not a sample and not trying to be a concert grand: the
// deep house piano is a few notes a bar a long way back in a room, so what has
// to be right is the *shape* of a note — a hammer, a fast first fall, a long
// quiet tail — and not the last 5% of the timbre.
//
//   partials   six sines at 1..6, each a little sharper than an exact
//              multiple. Real strings are stiff and their partials run sharp;
//              a stack of exact integers reads as an organ, not a piano.
//   unison     a second string a few cents flat, which is the slow beating
//              that makes a piano note breathe while it decays.
//   hammer     a few milliseconds of band-passed noise, which is the felt
//              hitting the string. Without it every note starts as a swell.
//   decay      two stages on the note — most of it gone in a third of a
//              second, the rest ringing for seconds — and a *shorter* decay
//              the higher the partial, which is how a struck string loses its
//              brightness. MEASURED (timbres.md): no track in 52 closes a
//              filter inside a note, so there is no filter envelope here; the
//              note gets darker because its partials die, which is the truth
//              about a piano and not a synthesiser's shortcut to it.
//   velocity   sets the brightness and the level, so a soft note is not a
//              loud note turned down.
//
// The strings — twelve sines and their twelve decays — are the same strings
// every time this pitch is struck this hard for this long, so they are
// rendered once and kept: a note is one buffer source into its own filter,
// pan and envelope, with the hammer live. Velocity is kept to tenths and the
// ring to quarter seconds for the strings' decays only; the level, the
// brightness and the hammer take the exact values. MEASURED (perf): twelve
// oscillators a note were a quarter of a piano theme's audio thread. A pitch
// that has not been rendered yet is built from oscillators as before.

import { midiToHz, route, panner, noiseSource, MIN_RELEASE, startTime, Offline, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { pair, rampFrequency } from './treat.ts';
import { withControls } from './descriptor.ts';
import { INSTRUMENTS } from '../params.ts';
import { job, MAX_JOBS } from './render-cache.ts';
import type { Controls, Descriptor, NoteParams, PrepareOptions } from './descriptor.ts';

/** The settings' own `piano` block: every number a string, a hammer and a note is made of. */
type PianoSettings = Settings['piano'] & { harmonicBody?: number };

// Per-note sound controls let a sustained piano phrase and short chord stabs
// share this instrument without revoicing the entire theme. Omission retains
// the original settings object and synthesis arithmetic. The defaults are the
// piano block's (`params.ts`), read from it rather than written twice (round
// (f) of the reconciled review of 09-24, D44); `harmonicBody` 0 is no body,
// which is what an absent one is. `ring` is how far past its written length
// the note rings.
const P0 = INSTRUMENTS.piano;
export const PIANO_CONTROLS: Controls = {
  sustainLevel: { unit: 'ratio', min: 0.05, max: 1, default: P0.sustainLevel },
  decayFast: { unit: 'seconds', min: 0.04, max: 2, default: P0.decayFast },
  partialDecay: { unit: 'ratio', min: 0.05, max: 2, default: P0.partialDecay },
  unisonCents: { unit: 'cents', min: 0, max: 12, default: P0.unisonCents },
  hammerLevel: { unit: 'level', min: 0, max: 1, default: P0.hammerLevel },
  harmonicBody: { unit: 'level', min: 0, max: 1, default: 0 },
  ring: { unit: 'seconds', min: 0, max: 4.5, default: P0.ring },
};
/** The ones that are the piano block's own numbers, overridden per note. */
const SETTINGS_CONTROLS = ['sustainLevel', 'decayFast', 'partialDecay', 'unisonCents', 'hammerLevel', 'harmonicBody'];
export function pianoNoteSettings(p: NoteParams, base: Settings['piano']): PianoSettings {
  const q = withControls(p, PIANO_CONTROLS);
  const entries = SETTINGS_CONTROLS.filter((key) => q[key] !== undefined);
  if (!entries.length) return base;
  const overrides: Record<string, number> = {};
  for (const key of entries) overrides[key] = q[key];
  return { ...base, ...overrides };
}

/** Every input read by the rendered string body, shared by prewarm and play. */
export function pianoStringKey(midi: number, vel: number, life: number, P: PianoSettings): string {
  const legacy = `${midi}:${vel}:${life}:${P.unisonCents}:${P.unisonLevel}:${P.attack}:${P.stretchCents}:${P.partialDecay}:${P.partialLevel}`;
  return P.harmonicBody ? `${legacy}:body:${P.harmonicBody}` : legacy;
}

/** One context's rendered strings, or the promise of one while it is in the air. */
type StringCache = Map<string, AudioBuffer | Promise<AudioBuffer>>;

// Roughly a grand's partial balance: the fundamental dominates, the third and
// fifth carry the ring, and nothing above the sixth is worth a node.
const PARTIALS = [1, 0.42, 0.26, 0.15, 0.09, 0.055];

// The strings of one note, as oscillators into `into`, from `time`.
function strings(
  ctx: BaseAudioContext,
  into: AudioNode,
  time: number,
  hz: number,
  vel: number,
  life: number,
  P: PianoSettings,
): number {
  const a = P.attack;
  const end = time + a + life + MIN_RELEASE;
  for (const [cents, amp] of [[0, 1], [-P.unisonCents, P.unisonLevel]]) {
    for (let n = 1; n <= PARTIALS.length; n++) {
      const f = hz * n;
      if (f > 15000) break;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      // Inharmonic stretch: a couple of cents on the second partial, growing
      // quadratically the way string stiffness does.
      o.detune.value = cents + P.stretchCents * (n - 1) * (n - 1) * 0.35;
      const og = ctx.createGain();
      og.gain.value = 0;
      const body = P.harmonicBody && (n === 2 || n === 3) ? 1 + P.harmonicBody * (n === 2 ? 1 : .75) : 1;
      const level = PARTIALS[n - 1] * amp * (n === 1 ? 1 : 0.35 + 0.65 * vel) * P.partialLevel * body;
      // Upper partials go first. This is the whole reason the note darkens.
      const pl = Math.max(0.12, life / (1 + P.partialDecay * (n - 1)));
      og.gain.setValueAtTime(Math.max(GAIN_FLOOR, level), time);
      og.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + a + pl);
      og.gain.linearRampToValueAtTime(0, time + a + pl + MIN_RELEASE);
      o.connect(og);
      og.connect(into);
      o.start(time);
      o.stop(end + 0.02);
    }
  }
  return end;
}

// --- rendered strings ------------------------------------------------------

// The cache is bounded in bytes, not buffers. The old figure — "about thirty
// strings of 0.4 MB, so twelve megabytes holds a theme and the one arriving" —
// was an estimate, and MEASURED it is wrong in the direction that matters: one
// theme of master seed 981 at 48 kHz needs **35 distinct strings and
// 14.79 MiB**, so twelve never held a theme at all, let alone two. The budget
// is the measurement plus a little, and what it buys is in the probe below.
// The oldest string goes first, and one still being rendered is not counted
// until it is.
const KEEP_BYTES = 18 * 1024 * 1024;
const cache = new WeakMap<BaseAudioContext, StringCache>(); // ctx -> Map(key -> AudioBuffer | Promise)
const held = new WeakMap<BaseAudioContext, number>(); // ctx -> bytes of rendered strings in the cache
// Keys the next stretch of music is going to ask for, each with how many
// preparations are holding it. Nothing held is evicted, because evicting what
// is about to play to make room for what is about to play is the cache doing
// the opposite of its job: MEASURED on seed `981#0` at 48 kHz, one theme needs
// 35 variants and 14.79 MiB against the 12 MiB budget it had then (18 now), so preparing it a second
// time re-rendered seven strings it had just thrown away, and a third time
// seven more.
const pinned = new WeakMap<BaseAudioContext, Map<string, number>>(); // ctx -> key -> holders
const pinnedOf = (ctx: BaseAudioContext): Map<string, number> => {
  let m = pinned.get(ctx);
  if (!m) { m = new Map(); pinned.set(ctx, m); }
  return m;
};
const pin = (ctx: BaseAudioContext, key: string): void => {
  const m = pinnedOf(ctx);
  m.set(key, (m.get(key) || 0) + 1);
};
const unpin = (ctx: BaseAudioContext, key: string): void => {
  const m = pinnedOf(ctx);
  const n = (m.get(key) || 0) - 1;
  if (n > 0) m.set(key, n); else m.delete(key);
};
let missCount = 0;
let renderCount = 0;
let peakJobs = 0;
let liveJobs = 0;
// A string this cache had to build **while a note was being scheduled**, which
// is the one thing the prewarm exists to prevent: `prepare` asks for a promise
// and waits for it, and the play path asks for a buffer and takes silence-
// shaped oscillators if there is none. So a miss with no promise asked for is
// a miss under the scheduler, and counting them separately is what lets a
// scenario say that a skip, a back, a seek or a cast built nothing on the tick
// (`notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md` step 1).
let liveMisses = 0;
// What the cache had to do, so a bench can ask instead of guessing.
export const pianoCacheStats = () => ({
  misses: missCount,
  renders: renderCount,
  live: liveMisses,
  peakConcurrentRenders: peakJobs,
});
export const resetPianoCacheStats = () => { missCount = 0; renderCount = 0; liveMisses = 0; peakJobs = 0; };
/** How many bytes of rendered strings one context holds, for a gate that the cache stays bounded. */
export const pianoCacheBytes = (ctx: BaseAudioContext): number => held.get(ctx) || 0;
/** The budget those bytes are held to. */
export const PIANO_CACHE_BYTES = KEEP_BYTES;

// How many strings may be rendering at once is `render-cache.ts`'s `MAX_JOBS`,
// shared with every voice that renders ahead. Each one is an
// OfflineAudioContext with a dozen oscillators in it, and firing thirty-five of
// them at the instant a deck is built is work competing with the scheduler that
// needs to meet its next deadline.

function trim(ctx: BaseAudioContext, per: StringCache, need: number): void {
  let bytes = held.get(ctx) || 0;
  const keep = pinned.get(ctx);
  for (const [k, v] of per) {
    if (bytes + need <= KEEP_BYTES) break;
    if (v instanceof Promise) continue;
    if (keep && keep.has(k)) continue; // imminent: not evicted for a distant one
    per.delete(k);
    bytes -= v.length * v.numberOfChannels * 4;
  }
  held.set(ctx, Math.max(0, bytes));
}

function renderStrings(ctx: BaseAudioContext, hz: number, vel: number, life: number, P: PianoSettings): Promise<AudioBuffer> {
  const Ctor = Offline();
  const rate = ctx.sampleRate;
  const seconds = P.attack + life + MIN_RELEASE + 0.05;
  const off = new Ctor(1, Math.ceil(seconds * rate), rate);
  strings(off, off.destination, 0, hz, vel, life, P);
  return off.startRendering();
}

function stringBuffer(ctx: BaseAudioContext, midi: number, vel: number, life: number, P: PianoSettings, promise: true): AudioBuffer | Promise<AudioBuffer>;
function stringBuffer(ctx: BaseAudioContext, midi: number, vel: number, life: number, P: PianoSettings, promise?: false): AudioBuffer | null;
function stringBuffer(
  ctx: BaseAudioContext,
  midi: number,
  vel: number,
  life: number,
  P: PianoSettings,
  promise = false,
): AudioBuffer | Promise<AudioBuffer> | null {
  let per = cache.get(ctx);
  if (!per) {
    per = new Map();
    cache.set(ctx, per);
  }
  // Every parameter `renderStrings` actually reads is in the key. `attack` and
  // `unisonLevel` were not, so two themes whose piano differed only in those
  // shared one buffer and an override of either changed nothing you could
  // hear — which quietly invalidates any A/B taken with them.
  const key = pianoStringKey(midi, vel, life, P);
  let got = per.get(key);
  if (got !== undefined) {
    // An LRU only works if a hit refreshes the order. A Map iterates in
    // insertion order and `trim` evicts from the front, so re-inserting a key
    // that was just used moves it to the back of the queue.
    per.delete(key);
    per.set(key, got);
  }
  if (got === undefined) {
    missCount += 1;
    renderCount += 1;
    if (!promise) liveMisses += 1;
    // Every render is a job (`render-cache.ts`): at most `MAX_JOBS` on this
    // context at once, whoever asked. A miss **on the play path** — a note
    // being scheduled that found no string — used to start its
    // OfflineAudioContext inside the scheduling tick, one per string of a cold
    // chord, outside every cap (R30). It is queued for the next task now: this
    // note builds its strings live, as it always did, and the render lands
    // beside the music for the next note that wants it.
    const render = (): Promise<AudioBuffer> => {
      liveJobs += 1;
      if (liveJobs > peakJobs) peakJobs = liveJobs;
      return renderStrings(ctx, midiToHz(midi), vel, life, P).finally(() => { liveJobs -= 1; });
    };
    got = job(ctx, render, !promise).then((buf) => {
      if (per.get(key) === got) {
        const bytes = buf.length * buf.numberOfChannels * 4;
        trim(ctx, per, bytes);
        per.set(key, buf);
        held.set(ctx, (held.get(ctx) || 0) + bytes);
      }
      return buf;
    }, (err: unknown) => {
      // A render that failed is not a string: the cache used to keep the
      // rejected promise under the key for the life of the context, so every
      // later ask for that note found a failure and never rendered again, and
      // the job count never came down (the outside review, 09-19).
      if (per.get(key) === got) per.delete(key);
      throw err;
    });
    // The play path asks for a buffer and never awaits the promise, so a
    // failure there must not surface as an unhandled rejection.
    got.catch(() => {});
    per.set(key, got);
  }
  if (promise) return got;
  return got instanceof Promise ? null : got;
}

// What a note's strings are keyed by: the pitch, the velocity to a tenth
// and the ring to a quarter second.
function shape(p: NoteParams, P: PianoSettings) {
  const dur = Math.max(0.15, p.dur ?? 0.6);
  const vel = Math.max(0.05, Math.min(1, p.vel ?? 0.7));
  const ring = withControls(p, PIANO_CONTROLS).ring;
  const life = Math.min(P.decaySlow, dur + (ring ?? P.ring));
  return { vel, life, velQ: Math.round(vel * 10) / 10, lifeQ: Math.round(life * 4) / 4 };
}

// What a live prewarm is allowed to ask for, as a share of the budget. A whole
// theme's worth of distinct strings does not fit and never did — MEASURED,
// seed `981#0` needs 14.79 MiB against the 12 it had then (18 now) — so asking for all of it guaranteed
// that the end of the pass evicted the start of it and the next pass
// re-rendered what it had just thrown away. The pass now walks the events in
// time order, adds up what each string will cost before rendering it, and
// stops when the window would not fit. What is left over falls back to live
// oscillators, which is what it did anyway; the difference is that it no
// longer takes a prepared string down with it.
//
// MEASURED on master seed 981 theme 0 at 48 kHz, counting every
// OfflineAudioContext the piano creates — three preparations of the same
// unchanged theme, then a pass over all 392 of its piano notes:
//
//                     prepare 1   prepare 2   prepare 3   during playback
//   before               35           7           7             7
//   after                35           0           0             0
//
// — the same 35 strings, rendered once each instead of forty-two times, none
// of them re-rendered while the scheduler is trying to meet a deadline, and
// at most four OfflineAudioContexts alive at a time instead of thirty-five.
const WARM_SHARE = 0.85;

// Every string the next stretch of a list of events will need, rendered ahead.
// The offline renders pass `{ all: true }` and await the lot, because an
// offline render has the whole timeline in hand and no deadline to miss; the
// live mix takes the window, starts it and leaves it to finish.
//
// Three rules, all of them from the same measurement: prewarm a bounded
// window rather than a whole theme, render at most a few at a time, and do
// not let the tail of the pass evict its own head.
// The piano as it describes itself, for the loudness fit: a struck string whose
// sustain level is 0.26 of its attack and whose brightness runs from 1.5 to
// 5.4 kHz on velocity — the middle of that is what stands here. `loudnessDb` is
// MEASURED the way keys.ts describes it, against `levels.piano` rather than
// `levels.keys`, because that is the level this voice is actually played at.
//
// **It is the fit's input and it is left where the fit was blessed.** The
// channel pin on the lowpass below (the click repair of 09-22) holds
// the StereoPanner on its stereo law for the whole note, so the tail no longer
// drops 3 dB when the hammer stops, and the piano plays 0.7-1.0 dB louder on
// its fixture (the scene gate below) and 0.9 dB louder in the golden `1:0`
// window (the engine review of 09-22). Measured by the definition this number
// was taken on it would read about -16.0; but the loudness model reads it for
// every v1 theme whose keys die rolled the piano, so writing it moves those
// themes' trims and with them v1's program lock, which is not moved for a
// repair. It moves with the next refit of the loudness model, which re-measures
// every timbre at once. What the piano sounds like now is held by the gate in
// `PIANO_MEASURED`.
export const PIANO_TIMBRES = {
  piano: { family: 'harmonic', struck: true, hold: 0.26, brightnessHz: 3450, loudnessDb: -16.9 },
};

/**
 * The piano alone on its own fixture through the real graph, eight bars of its
 * figure, integrated, less the level its table gave it: the scene every
 * kitchen voice is held to (`tools/test-voices.ts`), in both engines at both
 * rates, within a decibel. MEASURED and written by that gate's `--bless`,
 * never typed. Before the channel pin the same scene read -21.2 in Chromium
 * and -21.5 in Firefox; with it, -20.5 in both.
 */
export const PIANO_MEASURED = {
  piano: { sceneDb: -20.5 },
};

export function preparePiano(
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
  opts: PrepareOptions = {},
): Promise<void> {
  const all = opts.all === true;
  const from = opts.from ?? 0;
  const budget = all ? Infinity : KEEP_BYTES * WARM_SHARE;
  const rate = ctx.sampleRate;
  const want: [number, number, number, PianoSettings][] = [];
  const seen = new Set<string>();
  const keys = new Set<string>();
  let planned = 0;
  // The events are this voice's own — `prepareVoices` hands each hook the
  // events of the voices that declared it — so what is left to drop is the
  // one without parameters. It used to filter a whole theme by name.
  const inOrder = (events || []).filter((e) => e.p);
  if (!all) inOrder.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  for (const ev of inOrder) {
    if (ev.t < from) continue;
    const P = pianoNoteSettings(ev.p, settings.piano);
    const { velQ, lifeQ } = shape(ev.p, P);
    const k = pianoStringKey(ev.p.midi, velQ, lifeQ, P);
    if (seen.has(k)) continue;
    // What this string will cost, from the same arithmetic renderStrings uses.
    const bytes = Math.ceil((P.attack + lifeQ + MIN_RELEASE + 0.05) * rate) * 4;
    if (planned + bytes > budget) break;
    planned += bytes;
    seen.add(k);
    want.push([ev.p.midi, velQ, lifeQ, P]);
    keys.add(k);
  }
  if (all) {
    // An offline render: the whole timeline, awaited before a note is poured
    // in. Pin the pass so its tail does not evict its head, and let it go once
    // it is in: every note is played from the cache straight after.
    for (const k of keys) pin(ctx, k);
    let i = 0;
    const worker = async (): Promise<void> => {
      while (i < want.length) {
        const [midi, velQ, lifeQ, P] = want[i++];
        const got = stringBuffer(ctx, midi, velQ, lifeQ, P, true);
        if (got instanceof Promise) await got.catch(() => {});
      }
    };
    const lanes = Math.max(1, Math.min(MAX_JOBS, want.length));
    return Promise.all(Array.from({ length: lanes }, worker)).then(() => {
      for (const k of keys) unpin(ctx, k);
    });
  }
  return holdWindow(ctx, opts.id ?? events, inOrder, from, want, rate, settings.piano);
}

// --- what the live preparations hold, and until when ------------------------
//
// **A string is held until the notes that wanted it have played.** Until the
// engine review of 09-22 a live preparation pinned its window only while it
// was rendering it and let go as soon as it had, so the ordinary LRU decided
// what went. That is right for one theme on its own and wrong for the set: the
// next theme is prepared while the current one plays its first bars, and its
// pass evicted the current theme's strings that had not played yet — 16 notes
// rendered on the scheduling tick for v1 `92970:1` with `1:0` prepared twenty
// seconds in, 15 for `21323:2`, and none with no next theme (the review's
// harness, which reproduces the handoff's "16-18 shortly after startup").
//
// So a live preparation is a **holder**, one per program (`opts.id`, which
// `prepareVoices` fills with the program's own `events` array), and it holds each string of its window until the last note
// of that window that wants it has been played — `piano()` tells it. The
// strings held by every holder together never pass `KEEP_BYTES`: a pass takes
// what fits beside what is already held, in time order, and the rest waits in
// its queue and is rendered as the other theme's notes play and free their
// strings. So the next theme's first bars are rendered at once, the rest of
// its window arrives while the current theme plays out, and the cache is as
// bounded as it was. Two holders at most: a third preparation means the
// oldest theme is gone, and a second pass for the same program (a seek) replaces
// that program's first.
//
// **The identity is the program's, not the array this hook is handed** (R29 of
// the reconciled review of 09-24). The hook is handed its own voice's events,
// which `prepareVoices` filters out of the program afresh on every call, and
// the holder used to be keyed on that fresh array — so a seek never matched its
// own program, the two holders were a first-in-first-out queue, and a second
// seek in the playing theme released the *next* theme's strings, which `ready()`
// had already marked done: they rendered on the tick at the seam (the outside
// review measured nine). `PrepareOptions.id` carries the program's unfiltered events.
//
// **A note that never plays lets its string go too** (R95). The holder waited
// for `piano()` to say a note had played, and a note the deck dropped as stale
// (a stall of more than a bar) never says so: its string stayed pinned against
// `KEEP_BYTES` until two more themes had been prepared, and the next theme's
// queue waited on a budget nobody was going to free. A holder's notes are in
// time order, and the deck plays a program in time order, so a note of this
// holder played at `t` means every note of it before `t` that is still waiting
// was passed over: they are let go with it, and the queue moves.
interface Want { midi: number; velQ: number; lifeQ: number; P: PianoSettings; key: string; bytes: number }
interface Holder {
  id: object;
  /** notes of the window not yet played, by their own parameter object */
  notes: Map<NoteParams, string>;
  /** the same notes with their times, earliest first, and how far played has read */
  order: Array<{ t: number; p: NoteParams }>;
  passed: number;
  /** how many of those notes want each string */
  refs: Map<string, number>;
  /** the strings this holder has pinned, and what each weighs */
  held: Map<string, number>;
  /** what it has not rendered yet, earliest first */
  queue: Want[];
  inflight: number;
  settled: Array<() => void>;
}
const holders = new WeakMap<BaseAudioContext, Holder[]>();
const MAX_HOLDERS = 2;

/** What every holder together has pinned, in bytes. */
function heldBytes(ctx: BaseAudioContext): number {
  const seen = new Map<string, number>();
  for (const h of holders.get(ctx) || []) for (const [k, b] of h.held) seen.set(k, b);
  let sum = 0;
  for (const b of seen.values()) sum += b;
  return sum;
}

function release(ctx: BaseAudioContext, h: Holder): void {
  for (const k of h.held.keys()) unpin(ctx, k);
  h.held.clear();
  h.queue.length = 0;
  h.notes.clear();
  h.order.length = 0;
  h.refs.clear();
  const list = holders.get(ctx) || [];
  const i = list.indexOf(h);
  if (i >= 0) list.splice(i, 1);
  settle(h);
}

// A holder's pass is done when nothing of it is rendering and its queue is
// either empty or waiting for room.
function settle(h: Holder): void {
  if (h.inflight > 0) return;
  const done = h.settled.splice(0);
  for (const f of done) f();
}

// Start whatever fits, oldest holder first, at most `MAX_JOBS` renders at once
// on this context.
function pump(ctx: BaseAudioContext): void {
  const list = holders.get(ctx) || [];
  let running = list.reduce((n, h) => n + h.inflight, 0);
  for (const h of list) {
    while (h.queue.length && running < MAX_JOBS) {
      const w = h.queue[0];
      // A string another holder already holds weighs nothing more.
      const extra = pinnedOf(ctx).has(w.key) ? 0 : w.bytes;
      if (heldBytes(ctx) + extra > KEEP_BYTES) break;
      h.queue.shift();
      h.held.set(w.key, w.bytes);
      pin(ctx, w.key);
      const got = stringBuffer(ctx, w.midi, w.velQ, w.lifeQ, w.P, true);
      if (got instanceof Promise) {
        h.inflight++;
        running++;
        got.catch(() => {}).then(() => { h.inflight--; pump(ctx); settle(h); });
      }
    }
    settle(h);
  }
}

function holdWindow(ctx: BaseAudioContext, id: object, inOrder: ProgramEvent[], from: number,
  want: [number, number, number, PianoSettings][], rate: number, room: Settings['piano']): Promise<void> {
  let list = holders.get(ctx);
  if (!list) { list = []; holders.set(ctx, list); }
  // A second pass for the same program takes its first's place in the line
  // and its pins with it, and only then lets the first go: released first, the
  // strings it held were unpinned while the other theme's queue stood ahead of
  // them, that queue took the room, and the playing theme's own strings were
  // evicted under it (measured: 16 of its notes built on the tick after two
  // seeks, once the identity above matched at all).
  const prior = list.find((x) => x.id === id) ?? null;
  if (!prior) while (list.length >= MAX_HOLDERS) release(ctx, list[0]);
  const h: Holder = { id, notes: new Map(), order: [], passed: 0, refs: new Map(), held: new Map(), queue: [], inflight: 0, settled: [] };
  const inWindow = new Map<string, Want>();
  for (const [midi, velQ, lifeQ, P] of want) {
    const key = pianoStringKey(midi, velQ, lifeQ, P);
    const w = { midi, velQ, lifeQ, P, key, bytes: Math.ceil((P.attack + lifeQ + MIN_RELEASE + 0.05) * rate) * 4 };
    inWindow.set(key, w);
    h.queue.push(w);
  }
  for (const ev of inOrder) {
    if (ev.t < from) continue;
    const P = pianoNoteSettings(ev.p, room);
    const { velQ, lifeQ } = shape(ev.p, P);
    const key = pianoStringKey(ev.p.midi, velQ, lifeQ, P);
    if (!inWindow.has(key)) continue;
    h.notes.set(ev.p, key);
    h.order.push({ t: ev.t ?? 0, p: ev.p });
    h.refs.set(key, (h.refs.get(key) || 0) + 1);
  }
  if (prior) list[list.indexOf(prior)] = h;
  else list.push(h);
  return new Promise<void>((done) => {
    h.settled.push(done);
    pump(ctx);
    if (prior) { release(ctx, prior); pump(ctx); }
  });
}

// A note has been played: the holders that were waiting for it let its string
// go once nothing else in their window wants it, and whatever was waiting for
// room is rendered in its place.
function played(ctx: BaseAudioContext, p: NoteParams): void {
  const list = holders.get(ctx);
  if (!list) return;
  let freed = false;
  for (const h of list) {
    if (!h.notes.has(p)) continue;
    // Every note of this holder earlier than this one that is still waiting
    // was passed over by the deck (R95): let it go as if it had played. `order`
    // is in time order, so the walk resumes where the last one stopped. Two
    // notes at one instant (a chord) are not earlier than each other.
    const t = h.order.find((o) => o.p === p)?.t ?? -Infinity;
    while (h.passed < h.order.length && h.order[h.passed].t < t) {
      const o = h.order[h.passed++];
      if (h.notes.has(o.p) && letGo(ctx, h, o.p)) freed = true;
    }
    if (letGo(ctx, h, p)) freed = true;
  }
  if (freed) pump(ctx);
}

// One note of a holder is done with: its string goes when nothing else in the
// window wants it. True when a pinned string was freed.
function letGo(ctx: BaseAudioContext, h: Holder, p: NoteParams): boolean {
  const key = h.notes.get(p);
  if (key === undefined) return false;
  h.notes.delete(p);
  const n = (h.refs.get(key) || 0) - 1;
  if (n > 0) { h.refs.set(key, n); return false; }
  h.refs.delete(key);
  if (h.held.delete(key)) { unpin(ctx, key); return true; }
  h.queue = h.queue.filter((w) => w.key !== key);
  return false;
}

export function piano(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const P = pianoNoteSettings(p, settings.piano);
  const hz = midiToHz(p.midi);
  const { vel, life, velQ, lifeQ } = shape(p, P);
  const peak = vel * vel * (p.gain ?? 1); // velocity to level, not just to tone

  // How long the string is left to ring. A piano note outlives its own bar,
  // and the pedal is what the reverb is doing.
  const a = P.attack;
  const end = time + a + life + MIN_RELEASE;

  const g = ctx.createGain();
  const gg = g.gain;
  gg.value = 0;
  gg.setValueAtTime(0, time);
  // Linear from true zero: an exponential from a ten-thousandth is a step
  // dressed as a ramp. The two falls below stay exponential.
  gg.linearRampToValueAtTime(Math.max(GAIN_FLOOR, peak), time + a);
  // Two stages: the fast fall that makes it a struck string, then the tail.
  // The fast fall never outlasts the note. An identity test on the settings
  // object used to skip this whenever no override was present, so an unrelated
  // override (`hammerLevel`) changed the envelope's arithmetic; no golden note
  // has `life < decayFast` (0 of 1690 in v1, 0 of 896 in v2), so the plain
  // minimum is the same samples for all of them.
  const settle = Math.min(P.decayFast, life);
  gg.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, peak * P.sustainLevel), time + a + settle);
  gg.exponentialRampToValueAtTime(GAIN_FLOOR, time + a + life);
  gg.linearRampToValueAtTime(0, end);

  // Static: velocity picks the cutoff, nothing moves it afterwards.
  const lp = ctx.createBiquadFilter();
  // The stereo hammer ends before the mono strings. Keep the filter's
  // channel layout stable when that input disappears: Chromium otherwise
  // changes its channel count and resets the ringing filter state audibly.
  lp.channelCount = 2;
  lp.channelCountMode = 'explicit';
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  const bright = Math.min(15000, P.brightMin + (P.brightMax - P.brightMin) * Math.pow(vel, 1.4));
  const lpMul = pair(p.lpMul);
  rampFrequency(lp.frequency, bright * lpMul[0], bright * lpMul[1], time, end);

  const hpMul = pair(p.hpMul);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  rampFrequency(hp.frequency, P.hpHz * hpMul[0], P.hpHz * hpMul[1], time, end);

  // A light spread by register: the left hand near the middle, the right hand
  // out to the side, the way a piano sits in front of a listener.
  const pan = panner(ctx, Math.max(-1, Math.min(1, ((p.midi - 67) / 14) * P.spread)));

  lp.connect(hp);
  hp.connect(pan);
  pan.connect(g);

  // The hammer.
  const hamDur = 0.045;
  const ham = noiseSource(ctx, time, hamDur + 0.02);
  const hamBp = ctx.createBiquadFilter();
  hamBp.type = 'bandpass';
  hamBp.frequency.value = Math.min(6000, P.hammerHz + hz * 2);
  hamBp.Q.value = 0.8;
  const hamG = ctx.createGain();
  const hg = hamG.gain;
  hg.value = 0;
  hg.setValueAtTime(0, time);
  hg.linearRampToValueAtTime(Math.max(GAIN_FLOOR, P.hammerLevel * vel), time + 0.004);
  hg.exponentialRampToValueAtTime(GAIN_FLOOR, time + hamDur);
  hg.linearRampToValueAtTime(0, time + hamDur + MIN_RELEASE);
  ham.connect(hamBp);
  hamBp.connect(hamG);
  hamG.connect(lp);

  // The strings: two per note a few cents apart, six stretched partials each,
  // every partial on its own decay — rendered once per pitch, velocity tenth
  // and quarter second of ring, and read back; built live until they are.
  const buf = stringBuffer(ctx, p.midi, velQ, lifeQ, P);
  played(ctx, p);
  if (buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(lp);
    src.start(time);
    src.stop(time + a + lifeQ + MIN_RELEASE + 0.02);
  } else {
    strings(ctx, lp, time, hz, vel, life, P);
  }

  // The hall is the instrument here as much as the strings are: the dry note
  // is quiet and most of what a listener hears is the room it is in.
  route(ctx, g, out, {
    dry: P.dryLevel,
    hall: p.hall ?? 0.7,
    delay: p.delay ?? 0.12,
  });
  return end;
}


/**
 * Struck strings, pre-rendered per pitch and cached, so it is the one voice
 * with a `prepare` that matters to a deadline. It plays a figure or a melody —
 * the `pianorole` die decides — at a level of its own.
 */
export const descriptor: Descriptor = {
  name: 'piano',
  cost: 'dear',
  family: 'keyboard',
  roles: ['figure', 'melody'],
  bus: 'melodic',
  level: 'piano',
  layer: 'keys',
  plays: 'keys',
  mono: false,
  treat: true,
  anticipates: null,
  prepare: preparePiano,
  render: piano,
  timbres: PIANO_TIMBRES,
  dispatches: [],
  mood: [],
  controls: PIANO_CONTROLS,
  noteControls: Object.keys(PIANO_CONTROLS),
  returns: ['hall'],
};

export default piano;
