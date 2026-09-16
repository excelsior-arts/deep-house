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

import { midiToHz } from '../theory.js';
import PARAMS from '../params.js';
import { route, panner, noiseSource, MIN_RELEASE, startTime} from '../dsp.js';
import { pair, rampFrequency } from './treat.js';

// Roughly a grand's partial balance: the fundamental dominates, the third and
// fifth carry the ring, and nothing above the sixth is worth a node.
const PARTIALS = [1, 0.42, 0.26, 0.15, 0.09, 0.055];

// The strings of one note, as oscillators into `into`, from `time`.
function strings(ctx, into, time, hz, vel, life, P) {
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
      const level = PARTIALS[n - 1] * amp * (n === 1 ? 1 : 0.35 + 0.65 * vel) * P.partialLevel;
      // Upper partials go first. This is the whole reason the note darkens.
      const pl = Math.max(0.12, life / (1 + P.partialDecay * (n - 1)));
      og.gain.setValueAtTime(Math.max(0.0002, level), time);
      og.gain.exponentialRampToValueAtTime(0.0002, time + a + pl);
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
const cache = new WeakMap(); // ctx -> Map(key -> AudioBuffer | Promise)
const held = new WeakMap(); // ctx -> bytes of rendered strings in the cache
// Keys the next stretch of music is going to ask for. Nothing in this set is
// evicted, because evicting what is about to play to make room for what is
// about to play is the cache doing the opposite of its job: MEASURED on seed
// `981#0` at 48 kHz, one theme needs 35 variants and 14.79 MiB against a
// 12 MiB budget, so preparing it a second time re-rendered seven strings it
// had just thrown away, and a third time seven more.
const pinned = new WeakMap(); // ctx -> Set(key)
let missCount = 0;
let renderCount = 0;
let peakJobs = 0;
let liveJobs = 0;
// What the cache had to do, so a bench can ask instead of guessing.
export const pianoCacheStats = () => ({
  misses: missCount,
  renders: renderCount,
  peakConcurrentRenders: peakJobs,
});
export const resetPianoCacheStats = () => { missCount = 0; renderCount = 0; peakJobs = 0; };

// How many strings may be rendering at once. Each one is an OfflineAudioContext
// with a dozen oscillators in it, and firing thirty-five of them at the instant
// a deck is built is work competing with the scheduler that needs to meet its
// next deadline.
const MAX_JOBS = 4;

function trim(ctx, per, need) {
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

function renderStrings(ctx, hz, vel, life, P) {
  const Ctor = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const rate = ctx.sampleRate;
  const seconds = P.attack + life + MIN_RELEASE + 0.05;
  const off = new Ctor(1, Math.ceil(seconds * rate), rate);
  strings(off, off.destination, 0, hz, vel, life, P);
  return off.startRendering();
}

function stringBuffer(ctx, midi, vel, life, P, promise = false) {
  let per = cache.get(ctx);
  if (!per) {
    per = new Map();
    cache.set(ctx, per);
  }
  // Every parameter `renderStrings` actually reads is in the key. `attack` and
  // `unisonLevel` were not, so two themes whose piano differed only in those
  // shared one buffer and an override of either changed nothing you could
  // hear — which quietly invalidates any A/B taken with them.
  const key = `${midi}:${vel}:${life}:${P.unisonCents}:${P.unisonLevel}:${P.attack}:${P.stretchCents}:${P.partialDecay}:${P.partialLevel}`;
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
    liveJobs += 1;
    if (liveJobs > peakJobs) peakJobs = liveJobs;
    got = renderStrings(ctx, midiToHz(midi), vel, life, P).then((buf) => {
      liveJobs -= 1;
      if (per.get(key) === got) {
        const bytes = buf.length * buf.numberOfChannels * 4;
        trim(ctx, per, bytes);
        per.set(key, buf);
        held.set(ctx, (held.get(ctx) || 0) + bytes);
      }
      return buf;
    });
    per.set(key, got);
  }
  if (promise) return got;
  return got instanceof Promise ? null : got;
}

// What a note's strings are keyed by: the pitch, the velocity to a tenth
// and the ring to a quarter second.
function shape(p, P) {
  const dur = Math.max(0.15, p.dur ?? 0.6);
  const vel = Math.max(0.05, Math.min(1, p.vel ?? 0.7));
  const life = Math.min(P.decaySlow, dur + (p.ring ?? P.ring));
  return { vel, life, velQ: Math.round(vel * 10) / 10, lifeQ: Math.round(life * 4) / 4 };
}

// What a live prewarm is allowed to ask for, as a share of the budget. A whole
// theme's worth of distinct strings does not fit and never did — MEASURED,
// seed `981#0` needs 14.79 MiB against 12 — so asking for all of it guaranteed
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
// MEASURED the way keys.js describes it, against `levels.piano` rather than
// `levels.keys`, because that is the level this voice is actually played at.
export const PIANO_TIMBRES = {
  piano: { family: 'harmonic', struck: true, hold: 0.26, brightnessHz: 3450, loudnessDb: -16.9 },
};

export function preparePiano(ctx, events, opts = {}) {
  const P = PARAMS.piano;
  const all = opts.all === true;
  const from = opts.from ?? 0;
  const budget = all ? Infinity : KEEP_BYTES * WARM_SHARE;
  const rate = ctx.sampleRate;
  const want = [];
  const seen = new Set();
  const keys = new Set();
  let planned = 0;
  const inOrder = (events || []).filter((e) => e.voice === 'piano' && e.p);
  if (!all) inOrder.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  for (const ev of inOrder) {
    if (ev.t < from) continue;
    const { velQ, lifeQ } = shape(ev.p, P);
    const k = `${ev.p.midi}:${velQ}:${lifeQ}`;
    if (seen.has(k)) continue;
    // What this string will cost, from the same arithmetic renderStrings uses.
    const bytes = Math.ceil((P.attack + lifeQ + MIN_RELEASE + 0.05) * rate) * 4;
    if (planned + bytes > budget) break;
    planned += bytes;
    seen.add(k);
    want.push([ev.p.midi, velQ, lifeQ]);
    keys.add(`${ev.p.midi}:${velQ}:${lifeQ}:${P.unisonCents}:${P.unisonLevel}:${P.attack}:${P.stretchCents}:${P.partialDecay}:${P.partialLevel}`);
  }
  // Pin this window before rendering any of it, so a string prepared early in
  // the pass survives the ones prepared after it.
  let keep = pinned.get(ctx);
  if (!keep) { keep = new Set(); pinned.set(ctx, keep); }
  const added = [];
  for (const k of keys) if (!keep.has(k)) { keep.add(k); added.push(k); }

  let i = 0;
  const worker = async () => {
    while (i < want.length) {
      const [midi, velQ, lifeQ] = want[i++];
      const got = stringBuffer(ctx, midi, velQ, lifeQ, P, true);
      if (got instanceof Promise) await got.catch(() => {});
    }
  };
  const lanes = Math.max(1, Math.min(MAX_JOBS, want.length));
  return Promise.all(Array.from({ length: lanes }, worker)).then(() => {
    // The pin was for the preparation, not for ever: once the window is in the
    // cache the ordinary LRU decides what goes, or two themes in a row would
    // pin more than the budget between them and nothing could be evicted.
    for (const k of added) keep.delete(k);
  });
}

export function piano(ctx, out, time, p = {}) {
  time = startTime(ctx, time); // never in the past: a step if it is
  const P = PARAMS.piano;
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
  gg.linearRampToValueAtTime(Math.max(0.0002, peak), time + a);
  // Two stages: the fast fall that makes it a struck string, then the tail.
  gg.exponentialRampToValueAtTime(Math.max(0.0002, peak * P.sustainLevel), time + a + P.decayFast);
  gg.exponentialRampToValueAtTime(0.0002, time + a + life);
  gg.linearRampToValueAtTime(0, end);

  // Static: velocity picks the cutoff, nothing moves it afterwards.
  const lp = ctx.createBiquadFilter();
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
  hg.linearRampToValueAtTime(Math.max(0.0002, P.hammerLevel * vel), time + 0.004);
  hg.exponentialRampToValueAtTime(0.0002, time + hamDur);
  hg.linearRampToValueAtTime(0, time + hamDur + MIN_RELEASE);
  ham.connect(hamBp);
  hamBp.connect(hamG);
  hamG.connect(lp);

  // The strings: two per note a few cents apart, six stretched partials each,
  // every partial on its own decay — rendered once per pitch, velocity tenth
  // and quarter second of ring, and read back; built live until they are.
  const buf = stringBuffer(ctx, p.midi, velQ, lifeQ, P);
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

export default piano;
