// The mix: an endless set rather than a track. Themes follow one another the
// way a DJ runs them together — one tempo all night, a seam on a phrase
// boundary, and one bar where the low end changes hands.
//
// Everything is derived from a master seed, so a set can be left, come back to
// and shared: theme n's seed is `${masterSeed}#${n}` and nothing else.
//
// MEASURED (49 well-formed transitions):
//   theme length   p10/p50/p90 = 79 / 145 / 247 bars — drawn, not fixed
//   transition     bimodal: ~70% short (8-16 bars, modal 8), ~30% long (32-64)
//   boundary       16 bars: 41% against 19% by chance, the strongest alignment
//   tempo          median change across a seam is exactly 0.00 BPM. One tempo
//                  for the mix, drifting ~0.1 BPM a minute, never in a seam
//   key            no harmonic mixing: Camelot compatibility is 20% against
//                  17% by chance and the interval histogram is flat. The next
//                  theme takes any root; the mode stays minor ~75% of the time
//   shape          the mix is built around a dip, not a crossfade: a -14 dB
//                  momentary dip while the average level holds within 2.3 dB
//                  of the flanks. So the seam sits in the outgoing theme's
//                  last breakdown and the incoming arrives as it empties —
//                  and in its last quarter, never before it: a theme has to
//                  play its own build, its drop and its closing groove alone
//                  before anything is mixed over them
//   kick           clean swap, never two; absent for part of the seam in two
//                  transitions out of three
//   sub            about 3 dB down through the seam in half of them
//   entry          no highpass-first: the highs lead in 47% of seams. A filter
//                  moves in about half of all mixes, direction a coin flip
//   effects        nothing dramatic: the flux peak is 1.7x the median

import { generate } from './generator.js';
import { buildGraph, buildMaster, prepareLimiter, scheduleDuck, scheduleMacro, scheduleMelodicGain, schedulePush } from './master.js';
import PARAMS, { applyParams, baseParams, mergeParams } from './params.js';
import { loudnessTrimDb } from './loudness.js';
import { VOICES, VOICE_BUS, VOICE_LEVEL, prepareVoices } from './voices/index.js';
import { dbToGain, lateInfo, noteTransportStart, renderHead, resolveStart } from './dsp.js';
import { develop } from './develop.js';
import { onsetOf } from './scheduler.js';
import Rng from './rng.js';
import { resolvePreset } from './presets.js';
// The tick, the look-ahead and the hidden stretch are the clock's: one clock
// for this mix and for the single-theme player alike.
import { TICK_MS, LOOKAHEAD, lookahead, startClock } from './clock.js';

// The earliest instant the transport may put a sound at.
//
// `ctx.currentTime` is not the render head. The renderer has already filled
// the device's buffer up to `outputLatency + baseLatency` past the clock the
// main thread can read, and `resolveStart` — rightly — refuses to schedule
// anything behind that head, moving it forward and counting it late. A start
// that mapped the position it was resuming from onto `currentTime + 0.15`
// therefore put it *behind* the head on any device whose buffer is deeper than
// 147 ms — and the 'playback' hint this page asks for is a request for a deep
// one. MEASURED: headless Chromium hands out 64 ms over a 21 ms block on an
// idle machine and 216 over 21 on a busy one, WebKit 22 ms idle and 160 busy,
// and `?latency=0.3` asks for 280 over 171. So the fault came and went with
// the load on the machine, which is why a minute played by the suite never
// showed it and a hand on the bench did: the first 87 ms of the resumed record
// were already behind the head, and whatever the theme had in that window —
// one or two notes at a pause, the whole downbeat stack of seven on a cold
// start — was pushed forward by `resolveStart` and written into the bench's
// log as a stumble. It was not a stumble: nothing was late, the transport had
// aimed behind the head.
//
// Everything the transport starts is aimed here instead: the head plus a
// stated lead, so the first events are scheduled ahead of the head exactly
// like every other event. The lead only has to cover the main thread between
// this instant being taken and the first pump reaching those events — a
// deck's graph built, its curves written, a blend rebuilt, the clock started,
// which MEASURED is 5 to 21 ms — and 120 ms is `LOOKAHEAD`, the scheduler's
// own reach, the same margin every other event gets. It is a *delay* before
// sound resumes, not a skip: the position resumed from is still the position
// that was paused at, and on a device with a small buffer the wait is 145 ms
// where it was 150.
export const START_LEAD = 0.12;
export const startAt = (ctx) => renderHead(ctx) + START_LEAD;

// A deck that has been torn down keeps its LFOs running unless they are
// stopped: a running source holds everything downstream of it alive, so the
// width and chorus chains of every retired theme were still being processed.
function silence(graph) {
  for (const n of graph.keepAlive || []) {
    if (typeof n.stop === 'function') {
      try { n.stop(); } catch (e) { /* already stopped */ }
    }
  }
}

export const MIX_DEFAULTS = {
  // MEASURED theme length, as percentiles in bars: p10 / p25 / p50 / p75 / p90.
  themeBarPercentiles: [79, 118, 145, 167, 247],
  themeBarsMin: 64,
  themeBarsMax: 256,
  // MEASURED: bimodal. 70% short blends around 8 bars, 30% long ones.
  shortBlendChance: 0.7,
  shortBlendBars: [{ v: 8, w: 5 }, { v: 16, w: 3 }, { v: 12, w: 2 }],
  longBlendBars: [{ v: 32, w: 3 }, { v: 48, w: 2 }, { v: 64, w: 1 }],
  // MEASURED: transitions land on a 16-bar line at twice chance.
  boundaryBars: 16,
  // A skip is a musical cut, not an instant one: nothing in 49 measured
  // transitions is shorter than 2-3 bars of blend. Four bars, not eight: at
  // eight the low end did not change hands for nine seconds and the readout
  // did not move for twenty, which is long enough that pressing skip reads as
  // pressing nothing.
  skipBars: 4,
  // MEASURED: a filter moves in about half of all mixes, direction a coin flip.
  filterMoveChance: 0.5,
  outgoingLpHz: 520,
  outgoingHpHz: 300,
  // MEASURED: the sub runs about 3 dB down through the seam in half of them.
  seamSubTrimDb: -3,
  // MEASURED: the average level across a seam is 2.3 dB below the flanks. It
  // is also the headroom two decks need to pass through one limiter.
  seamSumTrimDb: -2.5,
  // GENRE: only one bass is ever prominent, so the swap is a downbeat. It used
  // to be the *last* bar of the transition, which is right for an eight-bar
  // blend and wrong for a sixty-four-bar one: the incoming theme spent two and
  // a half minutes with no kick and no bass under it, and what a listener
  // heard at the end of a theme was the old one still going with some extra
  // instruments floating over it — "it doesn't look like we have a continuous
  // hours mode yet". The bottom now changes hands eight bars into the blend,
  // whatever its length, and the outgoing theme plays out its harmonic layer
  // over the incoming groove from there.
  swapAfterBars: 8,
  // A cut is not a blend and it is not a wait either: it begins on the *next
  // beat*, not the next bar, and the low end changes hands on the first bar
  // line after that, so the bottom still arrives on a downbeat. A press used
  // to be answered on the next bar and swap a bar after that — three seconds
  // at 105 BPM, and four when the press just missed a line — which is long
  // enough that pressing NEXT read as pressing nothing and the hand pressed
  // again. The cut's own beat is the unit here; the swap is a line and not a
  // count of bars, so there is nothing left to tune.
  // How long the set's grid takes to reach a new theme's own tempo once the
  // theme it replaced has gone. MEASURED: the change across a seam is exactly
  // zero, so the move happens after the seam and not in it — sixteen bars,
  // linear in BPM, which for a tenth of a BPM is a move no one can hear and
  // the seam before it is exact.
  tempoGlideBars: 16,
  // Optional and off: the references do not mix in key.
  harmonicMixing: false,
  // How far ahead the scheduler fills while the page is visible. The player
  // raises it for a device that hands out a large output buffer.
  lookahead: LOOKAHEAD,
};

// Only used when harmonicMixing is turned on, which it is not by default.
const KEY_STEPS = [
  { v: 0, w: 4 },
  { v: 7, w: 3 },
  { v: 5, w: 3 },
  { v: 3, w: 2 },
  { v: 9, w: 2 },
];

// What a stop sounds like: the decks come down over this ramp, and nothing is
// disconnected until it has been heard and the tail behind it — the limiter's
// look-ahead delay, the delay line, the reverb's own decay — has run out.
export const STOP_FADE = 0.06;
const STOP_SILENT_MS = 400;

// Sample a value from a p10/p25/p50/p75/p90 ladder.
function fromPercentiles(rng, p) {
  const q = rng.next();
  const xs = [0.1, 0.25, 0.5, 0.75, 0.9];
  if (q <= xs[0]) return p[0];
  if (q >= xs[xs.length - 1]) return p[p.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (q <= xs[i]) {
      const t = (q - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return p[i - 1] + t * (p[i] - p[i - 1]);
    }
  }
  return p[2];
}

// --- audio-only bypass switches -----------------------------------------
//
// Read off the page's query string so a listener can take one stage out of the
// chain and hear what it was doing. Every one of these is a *mixing* override:
// none of them touches a plan, so the notes are identical with the switch on
// or off and only the sound differs.
//
//   ?kickdrive=0  the kick's saturation        ?glue=0     the kick+bass glue
//   ?body=0       the bass's driven body       ?basscomp=0 the bass compressor
//   ?push=0       the push macro               ?duck=0     the sidechain
//   ?limiter=0    the master limiter           ?clip=0     the soft clipper
//   ?sub=-3       the sub's level, in dB       ?all=0      every one of them
//
const BYPASS = {
  kickdrive: { kick: { drive: 0 } },
  body: { bass: { drive: 0, even: 0, triangle: 0, octave: 0 } },
  push: { push: { satAmount: 0, bodyDb: 0, subDb: 0 } },
  limiter: { master: { limiter: { ceiling: 1 }, limiterFallbackDb: 0 } },
  clip: { master: { clipKnee: 0.999 } },
  glue: { master: { glue: { ratio: 1, drive: 0 } } },
  basscomp: { bass: { comp: { ratio: 1 } } },
  // Both depths: `depthDb` is the melodic duck and `lowDepthDb` is the bass's,
  // and a switch called `duck` that left the bass ducking 8 dB was not a
  // sidechain bypass, which made every A/B taken with it read wrong.
  duck: { sidechain: { depthDb: 0, lowDepthDb: 0 } },
};

export function readBypass(search) {
  const q = new URLSearchParams(
    search ?? (typeof location !== 'undefined' ? location.search : '')
  );
  const on = [];
  let params = null;
  const take = (name) => {
    params = mergeParams(params || {}, BYPASS[name]);
    on.push(name);
  };
  const off = (k) => q.has(k) && q.get(k) !== '1' && q.get(k) !== 'on';
  if (off('all')) Object.keys(BYPASS).forEach(take);
  else for (const k of Object.keys(BYPASS)) if (off(k)) take(k);
  // The sub is a trim in dB rather than a switch, and it is applied to
  // whatever level the preset ended up at, not to the base one.
  const subDb = q.has('sub') ? Number(q.get('sub')) : NaN;
  const trim = Number.isFinite(subDb) && subDb !== 0 ? subDb : 0;
  if (trim) on.push(`sub ${trim > 0 ? '+' : ''}${trim} dB`);
  if (!on.length) return null;
  return { params, subDb: trim, label: on.join(', ') };
}

// Fold the bypass into one theme's audio-level overrides. The plan is not
// touched: `paramOverrides` is exactly the part of a track the golden snapshot
// leaves out.
export function applyBypass(track, bypass) {
  if (!bypass) return track;
  if (bypass.params) track.paramOverrides = mergeParams(track.paramOverrides, bypass.params);
  if (bypass.subDb) {
    const level = mergeParams(baseParams(), track.paramOverrides || {}).levels.sub;
    track.paramOverrides = mergeParams(track.paramOverrides, { levels: { sub: level + bypass.subDb } });
  }
  return track;
}

export function themeSeed(masterSeed, n) {
  return `${masterSeed}#${n}`;
}

// Which room theme n of a set is in, without generating it: the preset die is
// the theme seed's own, so this is the same roll `generate` makes, and a set
// that names a preset gets that one whatever the die says.
export function presetOfTheme(masterSeed, n, asked = 'auto') {
  return resolvePreset(asked, new Rng(`${themeSeed(masterSeed, n)}::preset`));
}

// The whole plan of theme n, pure and cheap: no audio, no context.
export function planTheme(masterSeed, n, opts = {}) {
  const o = { ...MIX_DEFAULTS, ...opts };
  const r = new Rng(`${masterSeed}::mix:${n}`);
  const bars = o.themeBars
    ? o.themeBars
    : Math.max(
        o.themeBarsMin,
        Math.min(o.themeBarsMax, Math.round(fromPercentiles(r, o.themeBarPercentiles) / 16) * 16)
      );

  // One tempo for the whole set. Read the ranges off the *base* params rather
  // than the live ones, which a preset may have narrowed, so a theme's tempo
  // does not depend on which preset happened to be applied last.
  const BASE = baseParams();
  const tr = new Rng(`${masterSeed}::mix:tempo`);
  const T = BASE.tempo;
  const slow = tr.chance(T.slowChance);
  let bpm = slow
    ? Math.min(T.slowMax, Math.round(tr.float(T.slowMin, T.slowMax + 0.99)))
    : Math.min(T.fastMax, Math.round(tr.float(T.fastMin, T.fastMax + 0.99)));
  // MEASURED: the change across a seam is exactly zero. The drift belongs to
  // the session, not the seam — about 0.1 BPM a minute.
  //
  // Said plainly, because it is not the elapsed time of the set: it is the
  // time `n` themes would take at the *median* length of 145 bars. A theme's
  // real length is drawn, so a set of short themes drifts faster in this
  // number than in the room. It stays that way on purpose — every plan in the
  // golden snapshot is pinned to it, and the drift it produces is a tenth of a
  // BPM between one theme and the next either way. What it never does any more
  // is break a seam: the set plays on one grid (`makeSetClock`) and a theme's
  // BPM is the tempo it is heading for, not the rate it is played at while
  // another theme is still up.
  const medianThemeMinutes = (n * 145 * 4 * 60) / (bpm * 60 * 4);
  bpm = Math.round((bpm + medianThemeMinutes * (o.driftBpmPerMinute ?? 0.1)) * 10) / 10;

  // MEASURED: no harmonic mixing. The root moves anywhere; only the mode keeps
  // its bias. Key compatibility is available as a flag and off by default.
  const kr = new Rng(`${masterSeed}::mix:key:${n}`);
  let root;
  if (o.harmonicMixing && n > 0) {
    const prev = planRoot(masterSeed, n - 1, o);
    root = (prev + kr.weighted(KEY_STEPS)) % 12;
  } else {
    root = kr.int(0, 12);
  }
  const scaleName = kr.chance(BASE.key.minorChance) ? 'minor' : 'dorian';

  const track = generate({
    seed: themeSeed(masterSeed, n),
    preset: opts.preset || 'auto',
    bpm,
    root,
    scaleName,
    bars,
  });
  track.index = n;
  // MEASURED: bimodal blend length, and a filter moves in half of all mixes.
  track.blendBars = r.chance(o.shortBlendChance)
    ? r.weighted(o.shortBlendBars)
    : r.weighted(o.longBlendBars);
  track.filterMove = r.chance(o.filterMoveChance) ? (r.chance(0.5) ? 'close' : 'open') : null;
  // How far this theme is from the record's target loudness, worked out from
  // the plan and nothing else — no render, no meter, no audio. It is a number
  // *beside* the plan and not in it: the events, the sections and the dice are
  // untouched, which is why the golden snapshot does not see it. `makeDeck`,
  // `Player` and `renderTrack` all hand it to `buildGraph` as the theme's own
  // output gain, so the live decks, the offline mix and a single-track render
  // level the same way.
  track.trimDb = loudnessTrimDb(track);
  return track;
}

function planRoot(masterSeed, n, o) {
  const kr = new Rng(`${masterSeed}::mix:key:${n}`);
  if (!o.harmonicMixing || n === 0) return kr.int(0, 12);
  return (planRoot(masterSeed, n - 1, o) + kr.weighted(KEY_STEPS)) % 12;
}

// --- the set's clock ------------------------------------------------------
//
// MEASURED: the tempo change across a seam is exactly 0.00 BPM. The themes are
// still *drawn* a tenth of a BPM apart — that is the session's slow drift and
// the plans are not touched — so a theme's `bpm` is its target and not the rate
// it is played at while somebody else is still on the record.
//
// The set keeps one grid. It counts beats: a theme's events are beats of its
// own, and the clock says what a beat costs in seconds. While two decks are up
// they share the grid the outgoing theme brought, so the eighth bar of the
// incoming theme falls on the same instant as the eighth bar of the outgoing
// one and the downbeat the bass changes hands on is one downbeat rather than
// two 17 ms apart — which is the kick that used to be dropped, leaving the
// incoming theme's first 559 ms with no bottom at all. When the outgoing deck
// is gone the grid glides to the incoming theme's own tempo over sixteen bars,
// linear in BPM, the way a pitch fader moves. Nothing ever jumps.
export function makeSetClock(beatSeconds, atTime = 0) {
  // The grid, as segments in beat order. Each runs from beat `b0` at context
  // time `t0` for `beats` beats, its beat length going from `spb0` to `spb1`.
  let segs = [{ b0: 0, t0: atTime, spb0: beatSeconds, spb1: beatSeconds, beats: Infinity }];
  const bpmOf = (spb) => 60 / spb;
  const straight = (s) => !Number.isFinite(s.beats) || Math.abs(s.spb1 - s.spb0) < 1e-12;
  // Tempo linear in beat: bpm(b) = m0 + k(b - b0), so the time across the
  // segment is the integral of 60/bpm, and the beat at a time is its inverse.
  const rate = (s) => (bpmOf(s.spb1) - bpmOf(s.spb0)) / s.beats;

  function timeIn(s, beat) {
    const d = beat - s.b0;
    if (straight(s)) return s.t0 + d * s.spb0;
    const m0 = bpmOf(s.spb0);
    const k = rate(s);
    return s.t0 + (60 / k) * Math.log((m0 + k * d) / m0);
  }
  function beatIn(s, time) {
    const dt = time - s.t0;
    if (straight(s)) return s.b0 + dt / s.spb0;
    const m0 = bpmOf(s.spb0);
    const k = rate(s);
    return s.b0 + (m0 * Math.exp((k * dt) / 60) - m0) / k;
  }
  function spbIn(s, beat) {
    if (straight(s)) return s.spb0;
    return 60 / (bpmOf(s.spb0) + rate(s) * (beat - s.b0));
  }
  const byBeat = (beat) => {
    for (let i = segs.length - 1; i >= 0; i--) if (beat >= segs[i].b0 || i === 0) return segs[i];
    return segs[0];
  };
  const byTime = (time) => {
    for (let i = segs.length - 1; i >= 0; i--) if (time >= segs[i].t0 || i === 0) return segs[i];
    return segs[0];
  };

  const clock = {
    timeAt: (beat) => timeIn(byBeat(beat), beat),
    beatAt: (time) => beatIn(byTime(time), time),
    spbAt: (beat) => spbIn(byBeat(beat), beat),
    barSecondsAt: (beat) => spbIn(byBeat(beat), beat) * 4,
    // Hold the grid where it is from this beat on: nothing changes tempo while
    // two decks are up, so a seam beginning in the middle of a glide takes
    // whatever the glide had reached and keeps it.
    pin(beat) {
      const spb = clock.spbAt(beat);
      const t0 = clock.timeAt(beat);
      segs = segs.filter((s) => s.b0 < beat);
      const head = segs[segs.length - 1];
      if (head) head.beats = Math.min(head.beats, beat - head.b0);
      segs.push({ b0: beat, t0, spb0: spb, spb1: spb, beats: Infinity });
      if (segs.length > 16) segs = segs.slice(-16);
      return spb;
    },
    // From this beat, take sixteen bars to reach the theme's own tempo.
    glide(beat, toBeatSeconds, overBeats) {
      const spb = clock.pin(beat);
      if (!(overBeats > 0) || Math.abs(toBeatSeconds - spb) < 1e-9) return;
      const t0 = clock.timeAt(beat);
      segs[segs.length - 1] = { b0: beat, t0, spb0: spb, spb1: toBeatSeconds, beats: overBeats };
      segs.push({
        b0: beat + overBeats,
        t0: timeIn(segs[segs.length - 1], beat + overBeats),
        spb0: toBeatSeconds,
        spb1: toBeatSeconds,
        beats: Infinity,
      });
      if (segs.length > 16) segs = segs.slice(-16);
    },
    get segments() {
      return segs.map((s) => ({ ...s }));
    },
  };
  return clock;
}

// Where a theme time of one deck falls on the set's clock, and the other way
// about. A deck's events are its own theme's seconds; `startBeat` is the beat
// of the set its first bar sits on.
function deckContextTime(deck, themeTime) {
  return deck.clock.timeAt(deck.startBeat + themeTime / deck.track.beat);
}

function deckThemeTime(deck, contextTime) {
  return (deck.clock.beatAt(contextTime) - deck.startBeat) * deck.track.beat;
}

// The next line of a deck's own grid at or after `t`, in context time: `unit`
// is what a line is — a beat, a bar — in that theme's seconds. Both decks are
// on the set's one grid through a seam, so a line of one is a line of both.
function lineAfter(deck, t, unit) {
  const n = Math.max(0, Math.ceil(deckThemeTime(deck, t) / unit - 1e-9));
  return deckContextTime(deck, n * unit);
}

// --- one deck ------------------------------------------------------------

// Every synchronous phase that touches a deck — building it, starting it,
// scheduling the next stretch of its events — begins by putting that deck's
// own theme in the live params table.
//
// There used to be a marker here saying which deck was loaded, so the table
// was only rebuilt when the deck changed. The marker was private to this file
// and the table is not: a theme planned while the set played, a render, a
// preset change — any of them called `applyParams` and left the marker naming
// a theme whose values were no longer there, and the deck that was sounding
// went on scheduling kicks and hats out of somebody else's room. Correctness
// is worth a clone: it is one deep copy of the table per deck per tick.
function useDeckParams(deck) {
  applyParams(deck.track.paramOverrides);
}

// A deck is one theme's graph plus the three things a mixer channel has: a
// high-pass, a low-pass and a fader. It stops at the fader; the master that
// every deck shares is downstream of the sum, so two decks at a seam pass
// through one limiter rather than two.
function makeDeck(ctx, track, mixOut, master, clock, atTime = null) {
  // The graph is built under this theme's own params. What its voices want
  // rendered ahead was asked for when the theme was planned (`ready`).
  applyParams(track.paramOverrides);
  // The sound stage: which layer is in front of this theme bar by bar, and
  // what the desk is doing to the ones that are holding. Audio only — the plan
  // is what it was, which is why the golden snapshot never sees this — and
  // idempotent, so a deck rebuilt after a seam gets the same stage.
  develop(track);
  // The graph's tempo-synced parts — the dotted-eighth delay above all — are
  // built on the grid this deck will actually be played on, which through a
  // seam is the outgoing theme's and not this theme's target. The glide
  // afterwards moves the grid by a fifth of a percent, which is a third of a
  // millisecond on a dotted eighth: below what a delay line can show.
  const when = atTime == null ? ctx.currentTime : atTime;
  const bpm = clock ? 60 / clock.spbAt(clock.beatAt(when)) : track.bpm;
  const graph = buildGraph(ctx, { bpm, widthPhase: (track.index % 7) * 0.9, master, trimDb: track.trimDb });
  // Each deck gets its own filters and fader, so the transition can drive the
  // two independently without touching either theme's own automation.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 18;
  hp.Q.value = 0.707;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 20000;
  lp.Q.value = 0.707;
  const fader = ctx.createGain();
  fader.gain.value = 1;
  graph.out.connect(hp);
  hp.connect(lp);
  lp.connect(fader);
  fader.connect(mixOut);
  return { track, graph, hp, lp, fader, clock, index: 0, startBeat: 0, done: false };
}

// A deck can be on both sides of a seam at once — the theme arriving at one
// and leaving at the next — so the stretches with no kick and no bass are a
// list rather than one pair. They used to be one property, and in an offline
// render the outgoing seam's gap overwrote the incoming one: thirty-three
// kicks played under the theme that still owned the bottom.
function inGap(gaps, t) {
  if (!gaps) return false;
  for (const g of gaps) if (t >= g[0] && t < g[1]) return true;
  return false;
}

function addGap(deck, key, gap) {
  if (!deck[key]) deck[key] = [];
  deck[key].push(gap);
}

function fireDeckEvent(ctx, deck, ev) {
  const voice = VOICES[ev.voice];
  if (!voice) return;
  // A gap in the kick and a gap in the bass are cut out of the event list
  // rather than faded, which is how the swap stays clean instead of flamming.
  if (ev.voice === 'kick' && inGap(deck.kickGaps, ev.t)) return;
  if (ev.voice === 'sub' && inGap(deck.subGaps, ev.t)) return;
  const bus = deck.graph.buses[VOICE_BUS[ev.voice] || 'melodic'];
  const level = dbToGain(PARAMS.levels[VOICE_LEVEL[ev.voice]] ?? -12);
  // `onsetOf` is the arrival for everything but the anticipatory swell, and
  // the onset is resolved once so the duck moves with a kick the guard had to
  // push forward rather than staying where the kick was going to be.
  const when = resolveStart(ctx, deckContextTime(deck, onsetOf(ev)));
  voice(ctx, bus, when, { ...ev.p, gain: (ev.p?.gain ?? 1) * level });
  if (ev.voice === 'kick') scheduleDuck(deck.graph, when);
}

function startDeck(ctx, deck, when, fromTime = 0) {
  // The automation below is read off the live table — the push macro's
  // saturation and body baseline among it — so this deck's own params go in
  // before a curve is scheduled.
  useDeckParams(deck);
  // Where this theme's first bar sits on the set's grid. Everything of this
  // deck — its events, its curves, its gaps — is read off that.
  deck.startBeat = deck.clock.beatAt(when) - fromTime / deck.track.beat;
  deck.index = 0;
  const events = deck.track.events;
  while (deck.index < events.length && onsetOf(events[deck.index]) < fromTime) deck.index++;
  // The macro curves are laid out on the grid as it stands now. A glide after
  // the seam moves them by a fifth of a percent against the notes, which on a
  // filter that opens over an eight-bar phrase is a few milliseconds.
  const shift = (pts) => pts.map((p) => ({ t: deckContextTime(deck, p.t), value: p.value }));
  scheduleMacro(deck.graph, shift(deck.track.automation.macroFilter), when);
  if (deck.track.automation.melodicGain) {
    scheduleMelodicGain(deck.graph, shift(deck.track.automation.melodicGain), when);
  }
  if (deck.track.automation.push) {
    schedulePush(deck.graph, shift(deck.track.automation.push), when);
  }
}

function pumpDeck(ctx, deck, horizonTime) {
  // Each deck's params are applied immediately before its own events are
  // scheduled, so two themes with different presets can be alive at once —
  // and unconditionally, because nothing else in the page can be trusted to
  // have left the table where this deck last saw it.
  useDeckParams(deck);
  const events = deck.track.events;
  const horizon = deckThemeTime(deck, horizonTime);
  // How far this deck has been filled, in context time: a cut has to land
  // beyond it, or a kick already posted would play under the new theme.
  deck.pumpedTo = Math.max(deck.pumpedTo || 0, horizonTime);
  while (deck.index < events.length && onsetOf(events[deck.index]) <= horizon) {
    // One event that throws used to stall the deck for good: the index was
    // only advanced *after* the voice returned, so every following tick threw
    // at the same note, nothing else was ever scheduled, and what was left was
    // the pad and the piano ringing out over no drums — which is exactly what
    // "some instruments keep playing and no other theme mixes in" sounds like.
    // A bad note is now one dropped note.
    try {
      fireDeckEvent(ctx, deck, events[deck.index]);
    } catch (err) {
      deck.failed = (deck.failed || 0) + 1;
      if (deck.failed <= 3) console.error('deck event failed', events[deck.index], err);
    }
    deck.index++;
  }
}

// --- the transition ------------------------------------------------------
//
// MEASURED: the mix is built around a dip rather than a crossfade. The seam
// sits in the outgoing theme's last breakdown, so the level the listener hears
// dips while the incoming theme fills the hole; the average across the seam is
// only 2.3 dB below the flanks.
//
//   at                     the incoming starts, full band, fading up
//   at .. swapAt           both play; the outgoing's sub is 3 dB down and the
//                          incoming has no bass at all
//   swapAt (8 bars in)     the low end changes hands on a downbeat, with a bar
//                          of no kick on either side of it
//   swapAt .. end          the incoming is the record; the outgoing is a
//                          harmonic layer over it, easing away
//   end                    the outgoing is gone
//
// One automation line of a seam, as points rather than as calls. A seam's
// curves are functions of the time since it began, and a set resumed in the
// middle of one has to join them where they had reached: `from` is the instant
// they are written from — the seam's own start in ordinary play, and the
// present moment when a pause or a reload landed inside the blend. Everything
// before it is folded into a single value, interpolated along whichever
// segment `from` falls inside, so the line carries on rather than starting
// again or jumping.
function pointLine() {
  const pts = [];
  return {
    pts,
    set(v, t) { pts.push({ v, t, k: 'set' }); return this; },
    lin(v, t) { pts.push({ v, t, k: 'lin' }); return this; },
    exp(v, t) { pts.push({ v, t, k: 'exp' }); return this; },
  };
}

function writeLine(param, pts, from) {
  if (!param || !pts.length) return;
  let i = 0;
  while (i < pts.length && pts[i].t <= from) i++;
  if (i > 0) {
    const a = pts[i - 1];
    const b = pts[i];
    let value = a.v;
    if (b) {
      const span = b.t - a.t;
      const k = span > 0 ? Math.max(0, Math.min(1, (from - a.t) / span)) : 1;
      if (b.k === 'lin') value = a.v + (b.v - a.v) * k;
      else if (b.k === 'exp') value = Math.max(1e-9, a.v) * Math.pow(b.v / Math.max(1e-9, a.v), k);
    }
    param.setValueAtTime(value, Math.max(0, from));
  }
  for (; i < pts.length; i++) {
    const p = pts[i];
    if (p.k === 'lin') param.linearRampToValueAtTime(p.v, p.t);
    else if (p.k === 'exp') param.exponentialRampToValueAtTime(p.v, p.t);
    else param.setValueAtTime(p.v, p.t);
  }
}

function scheduleTransition(ctx, from, to, at, bars, barSeconds, opts, sum = null, cut = false, writeFrom = null) {
  const o = { ...MIX_DEFAULTS, ...opts };
  const end = at + bars * barSeconds;
  // A seam swaps a fixed number of bars in. A cut begins on a beat, so its
  // swap is a *line* rather than a count: the first bar line after the cut,
  // which is where a downbeat is and where a bass belongs.
  const swapAt = cut
    ? lineAfter(from, at + 1e-3, from.track.barSeconds)
    : at + Math.max(1, Math.min(o.swapAfterBars, Math.floor(bars / 2))) * barSeconds;
  // Where the curves are written from. `at` for a seam that is about to
  // happen; the present for one that is being picked up part-way through.
  const w = writeFrom == null ? at : writeFrom;

  // Two decks at full fader is +6 dB into one master, and what that sounds
  // like on a record whose peaks are the bass is an overdriven low end for the
  // whole length of the blend. The sum comes down while both are playing, and
  // MEASURED this is also what the references do: the average level across a
  // seam sits about 2.3 dB below the flanks.
  if (sum) {
    const sumTrim = Math.pow(10, o.seamSumTrimDb / 20);
    writeLine(sum.gain, pointLine()
      .set(sum.gain.value, at)
      .lin(sumTrim, at + barSeconds)
      .set(sumTrim, end - barSeconds)
      .lin(1, end).pts, w);
  }
  const trim = Math.pow(10, o.seamSubTrimDb / 20);

  // The incoming arrives full-band: the highs lead the sub in only 47% of
  // measured seams, so there is no highpass-first rule to apply.
  writeLine(to.fader.gain, pointLine()
    .set(0.0001, at)
    .exp(1, at + Math.min(4, bars / 3) * barSeconds).pts, w);

  // Only one bass is ever prominent. The incoming's sub is muted until the
  // swap bar, and its own events in that stretch are dropped so nothing has to
  // be faded out mid-note.
  writeLine(to.graph.buses.sub.dry.gain, pointLine()
    .set(0.0001, at)
    .set(0.0001, swapAt)
    .lin(1, swapAt + barSeconds * 0.25).pts, w);
  // In the arriving theme's own seconds — the two decks are on one grid, so
  // this is exactly its eighth bar. A hair is taken off the end so the
  // downbeat the bass changes hands on is not itself excluded.
  addGap(to, 'subGaps', [0, deckThemeTime(to, swapAt) - 1e-6]);

  writeLine(from.graph.buses.sub.dry.gain, pointLine()
    .set(1, at)
    .lin(trim, at + barSeconds)
    .set(trim, swapAt)
    .lin(0.0001, swapAt + barSeconds * 0.25).pts, w);

  // MEASURED: the kick plays through the whole transition in only a third of
  // them. A bar without one at the swap is normal, and it is also how two
  // kicks are guaranteed never to overlap.
  addGap(from, 'kickGaps', [deckThemeTime(from, swapAt) - from.track.barSeconds, Infinity]);
  addGap(to, 'kickGaps', [0, deckThemeTime(to, swapAt) - 1e-6]);

  // MEASURED: a filter moves in about half of all mixes, direction a coin
  // flip, and nothing at the seam is dramatic.
  if (to.track.filterMove === 'close') {
    writeLine(from.lp.frequency, pointLine()
      .set(20000, at)
      .exp(o.outgoingLpHz, end).pts, w);
  } else if (to.track.filterMove === 'open') {
    writeLine(to.hp.frequency, pointLine()
      .set(o.outgoingHpHz, at)
      .exp(18, at + Math.max(2, bars / 2) * barSeconds).pts, w);
  }

  // Once the bottom has changed hands the outgoing theme is a harmonic layer
  // over someone else's groove, so it eases away rather than standing at full
  // level until the last bar.
  const tailFrom = Math.max(at, end - 2 * barSeconds);
  const fromFader = pointLine();
  if (swapAt < tailFrom) fromFader.set(1, swapAt).lin(0.55, tailFrom);
  // The outgoing theme's last two bars close down to the same place. When the
  // seam itself is a closing filter, the ramp above is already on its way
  // there and there is nothing to add: what used to be added was the
  // parameter's *current* value written in as an event two bars from the end —
  // `.value` is where the filter is now, not where it will be — which flattened
  // the whole close into those two bars.
  if (to.track.filterMove !== 'close') {
    writeLine(from.lp.frequency, pointLine()
      .set(20000, tailFrom)
      .exp(o.outgoingLpHz, end).pts, w);
  }
  fromFader
    .set(swapAt < tailFrom ? 0.55 : 1, tailFrom)
    .exp(0.0002, end)
    .lin(0, end + 0.02);
  writeLine(from.fader.gain, fromFader.pts, w);

  return { at, end, swapAt, bars };
}

// Where a theme hands over, and over how many bars. One plan, used by the
// live set and by the offline render alike.
//
// MEASURED: the seam sits in the outgoing theme's last breakdown, and it lands
// on a 16-bar line in 41% of the references against 19% by chance — the
// strongest alignment there is. So every boundary here is a line, *after* the
// clamping as well as before it: rounding first and clamping to `bars - need`
// afterwards is what put seed 1's first two seams on bars 174 and 158, neither
// of them a line.
//
// MEASURED, and the floor every other rule here is measured against: a
// transition begins in the outgoing theme's **last quarter**. "The last
// breakdown past 55%" describes where a breakdown sits, not when a record is
// finished with: on a 240-bar theme whose late breakdown began at bar 136 it
// started the hand-over at bar 144 — 60% — and the theme's own build, its drop
// and the last four minutes of its main groove were never heard on their own.
// That is the seam Eugene marked at bar 146 of seed 15576, "a mix overlay but
// we are not at the end of the track". So 75% of the length is a floor, and
// the breakdown only decides *where* inside the last quarter the seam lands.
//
// The order is: the last breakdown at or after the floor that still leaves
// room for the whole blend; failing that, the first line at or after the floor
// that falls in the closing main groove — or in the outro, once the groove is
// over — with the blend shortened to whatever is left rather than the line
// moved back. A long blend is what gives way, never the floor.
//
// `notBefore` is the earliest this theme may hand over, in seconds into it. A
// blend that is still running owns the record: with a 64-bar blend the next
// theme's own mix point can fall while the previous seam is still going, and
// the live engine then reached it late and started 37 seconds off while the
// offline one scheduled two overlapping seams. The next seam waits for the
// previous blend to end and takes the first line after it; if that leaves less
// room than the blend wanted, the blend is what shortens, never the line.
export const SEAM_FLOOR = 0.75;

export function seamPlan(track, blendBars, { boundaryBars = 16, notBefore = 0 } = {}) {
  const bs = track.barSeconds;
  // A blend can never be more than half the theme, and a short theme mixes on
  // a 4-bar line because a 16-bar one would not fit inside it.
  const asked = blendBarsFor(track, blendBars);
  const need = asked + 2;
  // A short theme, or one with a long blend, mixes on a 4-bar line, because a
  // 16-bar one does not fit in the room the blend leaves it — and the line is
  // what everything else is measured against, so it is chosen against the room
  // rather than against the theme's length alone.
  const room = track.bars - need;
  const q = boundaryBars <= room ? boundaryBars : room >= 4 ? 4 : 1;
  // The floor as a line: the first boundary at or after three quarters.
  const floorBar = track.bars * SEAM_FLOOR;
  const floorLine = Math.ceil(floorBar / q) * q;
  // The highest line the whole blend still fits behind, the last line that
  // leaves a blend anything at all, and the line the theme ends on — a theme
  // that has been blended over for most of its length hands over when it runs
  // out rather than underneath the blend it is still in.
  const roomy = Math.max(0, Math.floor((track.bars - need) / q) * q);
  const latest = Math.max(0, Math.floor((track.bars - 2) / q) * q);
  const ends = Math.ceil(track.bars / q) * q;
  // The *last* breakdown, and only one that is inside the last quarter and
  // still leaves room for the whole blend.
  let candidate = null;
  for (const s of track.arrangement.sections) {
    if (s.kind !== 'breakdown') continue;
    if (s.startBar + need > track.bars) continue;
    if (s.startBar < floorBar) continue;
    candidate = s.startBar;
  }
  // On a line either way: never under the floor, and never so late that the
  // blend has nowhere to run. Where there is no breakdown in the last quarter
  // the seam takes the first line in the groove the theme plays out on, and
  // the blend shortens to what is left of the theme behind it.
  let bar = candidate != null
    ? Math.max(floorLine, Math.min(Math.round(candidate / q) * q, roomy))
    : closingLine(track, floorLine, latest, q);
  bar = Math.min(bar, Math.max(floorLine, latest));
  const after = Math.ceil(Math.max(0, notBefore) / bs / q) * q;
  if (after > bar) bar = Math.min(after, ends);
  const bars = Math.max(2, Math.min(asked, track.bars - bar - 2));
  return { at: bar * bs, bar, bars, boundary: q };
}

// The first line from `first` to `last` that lands inside a main groove, or
// failing that inside the outro: a hand-over belongs in the groove a theme
// plays out on and not in the middle of its build or its drop.
function closingLine(track, first, last, q) {
  const kindAt = (bar) => {
    let kind = null;
    for (const s of track.arrangement.sections) if (s.startBar <= bar) kind = s.kind;
    return kind;
  };
  for (const want of ['main', 'outro']) {
    for (let line = first; line <= last; line += q) if (kindAt(line) === want) return line;
  }
  return Math.min(first, last);
}

// Where the seam belongs, in seconds. The faces draw this; the engine asks for
// the whole plan.
export function mixPointSeconds(track, bars, boundaryBars = 16) {
  return seamPlan(track, bars, { boundaryBars }).at;
}

// The blend a theme actually gets, once its own length has had a say.
export function blendBarsFor(track, bars) {
  return Math.max(2, Math.min(bars, Math.floor(track.bars / 2)));
}

// --- the mix -------------------------------------------------------------

export function createMix(ctx, opts = {}) {
  const o = { ...MIX_DEFAULTS, ...opts };
  const masterSeed = String(opts.masterSeed ?? 1);
  const destination = opts.destination || ctx.destination;

  // A bypass is read once, announced once, and then lives in every theme's
  // audio overrides. The master is built after it is applied, so a bypassed
  // limiter or clipper is really bypassed.
  const bypass = opts.bypass !== undefined ? opts.bypass : readBypass();
  if (bypass && typeof console !== 'undefined') console.log('bypass: ' + bypass.label);

  // The master is the *set's* room, not a theme's: two decks pass through one
  // of these at a seam, so it can belong to neither. It used to be built on
  // whatever the last theme planned had left in the table, which made the
  // record's presence and air depend on the order things happened to be worked
  // out in. Said out loud instead: the set's own preset when it was asked for
  // one, and when it was asked for `auto` the preset theme zero of this seed
  // rolls — one room for the night, decided by the seed — with the bypass over
  // the top so a bypassed limiter or clipper really is bypassed.
  const masterPreset = presetOfTheme(masterSeed, 0, o.preset);
  applyParams(mergeParams(masterPreset.params || {}, (bypass && bypass.params) || {}));
  const master = buildMaster(ctx);
  master.out.connect(destination);
  const mixOut = ctx.createGain();
  mixOut.gain.value = 1;
  mixOut.connect(master.input);

  let n = 0;
  // The set's own grid. It is made when the first theme is known; until then
  // there is no tempo to keep.
  let clock = null;
  let current = null;
  let incoming = null;
  let retiring = null; // the theme that has handed over and is playing out
  let transition = null;
  let timer = null;
  let running = false;
  const listeners = new Set();
  let nextPlan = null;
  // A start is a chain of awaits — a context to resume, a theme's voices to
  // render — and a stop that lands inside one has to cancel it rather than let
  // it finish into a set nobody is holding. Every start takes a token; a stop,
  // or a second start, invalidates it, and the continuation after each await
  // asks whether it is still the one that was asked for.
  let startToken = 0;
  let dead = false;

  const emit = () => {
    if (!listeners.size) return;
    const s = state();
    for (const fn of listeners) fn(s);
  };

  // Planning is pure: `generate` puts the table back as it found it, and the
  // bypass is folded into the plan's own overrides rather than into the live
  // values, so working out a theme never changes what is playing.
  const plan = (i) => applyBypass(planTheme(masterSeed, i, o), bypass);

  // Everything a theme's voices want rendered ahead — the hats' three tones
  // under its preset, the piano's strings — at the live context's rate, asked
  // for as soon as the theme is planned: for the set's first theme before it
  // starts, for the next one while the current plays its first bars, so no
  // offline render is ever started near a seam or under a cut. Returns the
  // promise; the same plan asked for twice renders once.
  const readied = new WeakMap();
  function ready(track, from = 0) {
    if (!track) return Promise.resolve();
    let p = readied.get(track);
    if (!p) {
      applyParams(track.paramOverrides);
      // A window round where this deck is about to start, not the whole
      // theme: the piano's string cache holds about a minute of distinct
      // strings and a theme can need half as many again, so asking for the
      // whole thing evicted the front of the pass with the back of it.
      p = prepareVoices(ctx, track.events, { from }).catch(() => {});
      readied.set(track, p);
    }
    return p;
  }

  function state() {
    return {
      running,
      masterSeed,
      preset: o.preset || 'auto',
      themeIndex: n,
      theme: current ? info(current.track) : null,
      // While a seam runs, the theme that is arriving *is* the next one, so
      // the readout can name it instead of going blank halfway through the
      // only part of the set where a listener is wondering what is coming.
      next: incoming ? info(incoming.track) : nextPlan ? info(nextPlan) : null,
      incoming: incoming ? info(incoming.track) : null,
      elapsed: current ? Math.max(0, deckThemeTime(current, ctx.currentTime)) : 0,
      themeSeconds: current ? current.track.bars * current.track.barSeconds : 0,
      transition: transition
        ? Math.max(0, Math.min(1, (ctx.currentTime - transition.at) / (transition.end - transition.at)))
        : 0,
      // notes the scheduler reached after their time, and by how much the last
      // one was moved: a loaded page says so here
      late: lateInfo(),
    };
  }

  function info(t) {
    return {
      index: t.index,
      seed: t.seed,
      preset: t.preset,
      presetLabel: t.presetLabel,
      bpm: t.bpm,
      key: t.key.name,
      bars: t.bars,
      barSeconds: t.barSeconds,
      dice: t.dice,
      // The per-theme loudness trim, in dB, so a rating carries the level the
      // theme was actually played at and not the level its room usually lands.
      trimDb: t.trimDb ?? 0,
      // Mixing, not music: the harmonic layer's wetness as a word and a level,
      // for the ring to draw beside the dice.
      sound: t.sound || null,
      sections: t.arrangement.sections.map((s) => ({ label: s.label, bars: s.bars, startBar: s.startBar })),
    };
  }

  // Where a cut starts: the next beat of the record that is playing, past
  // whatever has already been filled in. A skip and a back are a hand asking
  // for something now, and a beat is the shortest unit a cut can land on and
  // still be in time — at 105 BPM it is 570 ms, where the next bar was two and
  // a quarter seconds away and the swap another two behind it.
  function cutAt() {
    const floor = Math.max(startAt(ctx), current.pumpedTo || 0);
    return lineAfter(current, floor, current.track.beat);
  }

  // Move through the set while it is silent. No audio to schedule, so this is
  // only the index, the plan the interface draws from, and a readout.
  function stepWhileStopped(by) {
    n = Math.max(0, n + by);
    nextPlan = plan(n + 1);
    emit();
    return { at: 0, end: 0, swapAt: 0, bars: 0, themeIndex: n, silent: true };
  }

  // `stage` is how far into the seam the set already is: zero for one that is
  // about to happen, and for a set resumed inside a blend the seconds that
  // have passed since it began — `at` is then the instant the seam *would*
  // have started, which is in the past. The same construction serves both: the
  // arriving deck comes in at its own offset rather than at its first bar, and
  // every curve is written from the value it had reached instead of from its
  // beginning, so nothing jumps and nothing is played twice.
  function beginTransition(bars, whenTime, cut = false, stage = 0) {
    if (incoming) return transition;
    const next = nextPlan || plan(n + 1);
    nextPlan = null;
    const at = whenTime;
    // MEASURED: nothing changes tempo across a seam. The grid is held where it
    // stands for the length of the blend — a seam that begins in the middle of
    // a glide keeps whatever the glide had reached — and the arriving theme is
    // played on it, so both decks count the same bars.
    const barSeconds = clock.pin(clock.beatAt(at + stage)) * 4;
    incoming = makeDeck(ctx, next, mixOut, master, clock, at + stage);
    startDeck(ctx, incoming, at + stage, stage);
    transition = scheduleTransition(ctx, current, incoming, at, bars, barSeconds, o, mixOut, cut, at + stage);
    emit();
    return transition;
  }

  // Where this theme's own hand-over falls, in its own seconds. A seam is a
  // function of the plan alone — the theme, the blend it rolled, the line it
  // lands on and the blend before it — so a position written down in the
  // middle of one can be put back inside it from the position alone, with no
  // record of the seam kept anywhere.
  function seamOf(track, notBefore = 0) {
    const p = seamPlan(track, track.blendBars || 8, { boundaryBars: o.boundaryBars, notBefore });
    return { at: p.at, bars: p.bars, seconds: p.bars * track.barSeconds };
  }

  // The set's own master, let go. Every mix builds one — a filter chain, a
  // limiter in a worklet, a clipper — and a stop used to leave all of it
  // connected to the destination: the worklet goes on being processed for as
  // long as the context lives whether anything feeds it or not, so three
  // starts and stops meant three limiters running on the audio thread with
  // nothing to limit. The processor is told to write out its tail and finish,
  // and the chain is taken apart behind it.
  function disposeMaster() {
    const nodes = [master.out, master.trim, master.clip, master.limiter, master.master,
      master.air, master.presence, master.mid, master.lowMid, master.dcBlock];
    if (master.limiterIsWorklet && master.limiter.port) {
      try { master.limiter.port.postMessage({ finish: true }); } catch (e) { /* gone */ }
      try { master.limiter.port.onmessage = null; } catch (e) { /* gone */ }
      setTimeout(() => { try { master.limiter.port.close(); } catch (e) { /* gone */ } }, 200);
    }
    for (const node of nodes) {
      if (!node) continue;
      try { node.disconnect(); } catch (e) { /* already gone */ }
    }
  }

  function teardown(deck) {
    if (!deck) return;
    try {
      deck.fader.disconnect();
      deck.graph.out.disconnect();
    } catch (e) {
      /* already gone */
    }
    silence(deck.graph);
  }

  // Fade a deck out and let it go: what stop and seek do to a deck that is
  // still sounding.
  // `at` is when the fade begins, which is now for a stop and, for the deck a
  // seek is replacing, the instant the fresh deck starts sounding: the two are
  // aimed at one moment so the jump is a cut and not a hole the length of the
  // device's buffer.
  function release(deck, seconds, at = null) {
    const now = Math.max(ctx.currentTime, at == null ? 0 : at);
    try {
      deck.fader.gain.cancelScheduledValues(ctx.currentTime);
      deck.fader.gain.setValueAtTime(deck.fader.gain.value, now);
      deck.fader.gain.linearRampToValueAtTime(0, now + seconds);
    } catch (e) {
      /* already gone */
    }
    setTimeout(() => teardown(deck), 300 + Math.max(0, now - ctx.currentTime) * 1000);
  }

  // Bring the sum back to where a single deck stands. The seam trims it by
  // 2.5 dB while two decks pass through one master; a seam that is abandoned
  // rather than finished has to hand that back, or the set plays on quiet.
  function resetSum() {
    const now = ctx.currentTime;
    try {
      mixOut.gain.cancelScheduledValues(now);
      mixOut.gain.setValueAtTime(mixOut.gain.value, now);
      mixOut.gain.linearRampToValueAtTime(1, now + 0.12);
    } catch (e) {
      /* already gone */
    }
  }

  // A deck a seam was still shaping becomes the record on its own terms:
  // everything the transition had scheduled for it — a fader on its way up, a
  // sub held at nothing until a swap that is not going to happen, a filter
  // opening — is cancelled and walked to where a deck that is playing stands.
  function claim(deck, seconds = 0.08) {
    if (!deck) return;
    const now = ctx.currentTime;
    const to = (param, value) => {
      try {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(value, now + seconds);
      } catch (e) {
        /* already gone */
      }
    };
    to(deck.fader.gain, 1);
    to(deck.graph.buses.sub.dry.gain, 1);
    to(deck.lp.frequency, 20000);
    to(deck.hp.frequency, 18);
    deck.kickGaps = null;
    deck.subGaps = null;
  }

  // Abandon a seam in flight. Its automation is written in clock times against
  // decks that are about to be thrown away — a fader ramping to zero, a kick
  // gap, a sum sitting in its dip — and none of it means anything once the
  // transport has been sent somewhere else, so every deck but the record goes
  // and the sum comes back. Without this a seek during a seam kept the old
  // hand-over alive: two and a half seconds later it promoted the theme that
  // was arriving and threw the listener back to the start of it.
  function dropSeam(seconds = 0.08) {
    if (!transition && !incoming && !retiring) return;
    if (incoming) release(incoming, seconds);
    if (retiring) release(retiring, seconds);
    incoming = null;
    retiring = null;
    transition = null;
    seamFreeAt = ctx.currentTime;
    glideToCurrent();
    resetSum();
    if (!nextPlan) {
      nextPlan = plan(n + 1);
      ready(nextPlan);
    }
    return true;
  }

  // A skip or a back landing inside a blend: the hand-over in flight lands at
  // once — the arriving theme is the record — and the seam that was shaping it
  // is dropped rather than left running underneath the new cut.
  function interruptSeam() {
    if (!transition && !incoming && !retiring) return;
    promote(); // a no-op if the swap has already happened
    claim(current);
    dropSeam();
  }

  // The moment the low end changes hands, the arriving theme *is* the record:
  // it becomes `current`, the index moves, and the readout names it. The theme
  // it replaced keeps playing out of `retiring` until the blend ends, which is
  // what a DJ leaves up. Splitting these two used to be one step, and that is
  // why the index did not move until the very end of a cut.
  function promote() {
    if (!incoming) return;
    if (retiring) teardown(retiring);
    retiring = current;
    current = incoming;
    incoming = null;
    current.kickGaps = null;
    current.subGaps = null;
    n = current.track.index != null ? current.track.index : n + 1;
    nextPlan = plan(n + 1);
    ready(nextPlan);
    emit();
  }

  function finishTransition() {
    promote(); // a no-op if the swap has already happened
    teardown(retiring);
    retiring = null;
    transition = null;
    seamFreeAt = ctx.currentTime;
    glideToCurrent();
    emit();
  }

  // The theme that is left is now the only one on the grid, so the grid goes
  // to its tempo — over sixteen bars, linear in BPM, beginning past everything
  // already scheduled. A set never jumps; it leans.
  function glideToCurrent() {
    if (!clock || !current) return;
    const from = clock.beatAt(ctx.currentTime + 0.5);
    clock.glide(from, current.track.beat, Math.max(1, (o.tempoGlideBars ?? 16) * 4));
  }

  function tick() {
    if (!running) return;
    try {
      step();
    } catch (err) {
      ticksFailed += 1;
      if (ticksFailed <= 3) console.error('mix tick failed', err);
    }
  }

  let ticksFailed = 0;
  // The clock time the last blend finished at. Nothing hands over under a
  // hand-over: the next seam is planned from here.
  let seamFreeAt = 0;

  function step() {
    const horizon = ctx.currentTime + lookahead(ctx, o.lookahead);
    if (current) pumpDeck(ctx, current, horizon);
    if (incoming) pumpDeck(ctx, incoming, horizon);
    // The theme that has handed over is still sounding, so it still needs its
    // events scheduled until the blend is over.
    if (retiring) pumpDeck(ctx, retiring, horizon);

    if (transition && incoming && ctx.currentTime >= transition.swapAt) promote();
    if (transition && ctx.currentTime >= transition.end) finishTransition();

    // MEASURED: schedule the seam where the outgoing theme has its last
    // breakdown, so the dip is structural rather than an effect applied over
    // the top of a track that is still going full.
    if (!transition && current) {
      // `seamAt` is set by a seek that landed past the point the arrangement
      // chose; without it the seam is where the plan puts it — on a line, and
      // never before the blend that has just ended.
      const planned = seamPlan(current.track, current.track.blendBars || 8, {
        boundaryBars: o.boundaryBars,
        notBefore: Math.max(0, deckThemeTime(current, seamFreeAt)),
      });
      const bars = current.seamBars || planned.bars;
      const at = current.seamAt ?? planned.at;
      const point = deckContextTime(current, at);
      // Armed as the horizon reaches the point, not the clock: with a long
      // look-ahead and a slow hidden-page tick, waiting for the clock would
      // start the incoming theme a second off the bar.
      if (horizon + 0.25 >= point) {
        beginTransition(bars, Math.max(startAt(ctx), point));
      }
    }
    emit();
  }

  return {
    get state() {
      return state();
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(state());
      return () => listeners.delete(fn);
    },
    // `fromSeconds` is where the set was left — a pause, a reload, a seek made
    // while it was stopped — and it is not always a position inside one theme
    // playing on its own. A set paused in the middle of a blend has two decks
    // up, so the seam the plan puts there is worked out first and the
    // hand-over is rebuilt at the stage it had reached: before it, one deck as
    // ever; inside it, both; past it, the theme that arrived is the record.
    async start(themeIndex = 0, fromSeconds = 0) {
      if (running || dead) return state();
      const token = ++startToken;
      const cancelled = () => dead || token !== startToken;
      if (ctx.state === 'suspended') await ctx.resume();
      if (cancelled()) return state();
      n = Math.max(0, themeIndex);
      let from = Math.max(0, Number(fromSeconds) || 0);
      let first = plan(n);
      let seam = seamOf(first);
      let stage = null;  // seconds since the seam began, when we are inside one
      let ended = 0;     // how long ago the blend before this theme finished
      for (let guard = 0; guard < 8; guard++) {
        if (from < seam.at) break;
        if (from < seam.at + seam.seconds) { stage = from - seam.at; break; }
        // The blend is over, so the theme that arrived at it is the record and
        // the position is its own: the readout and the star name that theme
        // rather than the one it replaced.
        from -= seam.at;
        ended = from - seam.seconds;
        n += 1;
        first = plan(n);
        seam = seamOf(first, seam.seconds);
      }
      nextPlan = plan(n + 1);
      // the first theme's strings and hats before a note is scheduled, the
      // next theme's on their way while the first plays — and when the set is
      // being picked up inside a blend, the arriving theme's before it is
      // built, because it is about to sound too.
      await ready(first, from);
      // Stopped while that was rendering: nothing is built, no clock is
      // started, and what a second gesture asked for is the set that plays.
      if (cancelled()) return state();
      if (stage != null) {
        await ready(nextPlan, stage);
        if (cancelled()) return state();
      } else {
        ready(nextPlan);
      }
      // One grid for the night, starting at the tempo the first theme was
      // drawn at.
      clock = makeSetClock(first.beat, ctx.currentTime);
      // Where the position being resumed from is put: the render head plus
      // the transport's lead, so the first bar of the record — and, inside a
      // blend, the first bar of both decks, since `beginTransition` lays the
      // arriving deck out from this same instant — is scheduled ahead of the
      // head rather than behind it. The set's clock is read from it, so the
      // pin and the glide are on the same grid as the notes.
      const at = startAt(ctx);
      // A blend that finished before the position we are resuming at still
      // owns the room it took: the next seam is planned from where it ended.
      seamFreeAt = ended > 0 ? at - ended : 0;
      current = makeDeck(ctx, first, mixOut, master, clock);
      startDeck(ctx, current, at, from);
      running = true;
      // The hand-over the position was inside, built again at the stage it had
      // reached: both decks at their own offsets, the grid pinned as it was,
      // and the fader, the filter and the kick and bass gaps joined where the
      // curves stood rather than started over.
      if (stage != null) beginTransition(seam.bars, at - stage, false, stage);
      timer = startClock(tick, TICK_MS);
      // The moment the page is hidden the horizon jumps out by a second and a
      // half, and that stretch has to be filled before the timers slow down.
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', tick);
      // A note the first pumps reach late is this start's fault and not the
      // machine's, and says so in the count, so the bench's log can tell a
      // stumble from a transport that aimed behind the head.
      noteTransportStart(ctx);
      tick();
      return state();
    },
    // A stop is a fade, and the fade and the letting go are one operation.
    // They used to be two: the mix scheduled its 60 ms ramp and the control
    // disconnected the mix's output in the same turn, which took the ramp
    // away and cut the record off wherever the waveform happened to be. The
    // wire out is pulled once the ramp has been heard and the chain behind it
    // has had time to run dry. Returns how long that is, in seconds, so
    // whoever asked can wait for silence rather than guess at it.
    stop() {
      dead = true;
      startToken += 1;
      running = false;
      if (timer) timer();
      timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', tick);
      for (const d of [current, incoming, retiring]) if (d) release(d, STOP_FADE);
      current = null;
      incoming = null;
      retiring = null;
      transition = null;
      emit();
      listeners.clear();
      setTimeout(() => {
        try { mixOut.disconnect(); } catch (e) { /* gone */ }
        disposeMaster();
      }, STOP_SILENT_MS);
      return STOP_SILENT_MS / 1000;
    },
    // A short DJ cut rather than a hard stop: the same bass-swap discipline in
    // a quarter of the bars.
    //
    // Stopped, there is no cut to make, but the set still moves: the index and
    // the plan step forward so the interface can redraw and pressing play
    // starts on the theme that is now showing. Returning null and changing
    // nothing is why this read as a dead control.
    // A tap during a seam used to be swallowed. Now the hand-over in flight
    // lands at once — the arriving theme becomes the record, the one it
    // replaced is left to play out — and the next cut starts from there, so a
    // second tap is a second cut rather than nothing.
    skip() {
      if (!running || !current) return stepWhileStopped(1);
      interruptSeam();
      const at = cutAt();
      return beginTransition(o.skipBars, at, true);
    },
    // Cheap because a theme is only a seed: go back one and blend into it.
    back() {
      if (!running || !current) return stepWhileStopped(-1);
      interruptSeam();
      const prev = Math.max(0, n - 1);
      nextPlan = plan(prev);
      ready(nextPlan);
      const at = cutAt();
      return beginTransition(o.skipBars, at, true);
    },
    // Seek inside the theme that is playing.
    seek(seconds) {
      if (!current) return null;
      // A seek is a move inside the record, so a seam in flight is over: the
      // theme that was arriving has not arrived, and one fresh deck plays.
      dropSeam();
      const deck = current;
      const now = ctx.currentTime;
      const fresh = makeDeck(ctx, deck.track, mixOut, master, clock);
      // The same lead as a start: a seek used to land its first events 70 ms
      // past the clock, which on a device with a large buffer is behind the
      // render head, so every jump wrote a late note of its own. The deck
      // being left goes out where this one comes in rather than at once.
      const at = startAt(ctx);
      release(deck, 0.04, at - 0.04);
      fresh.fader.gain.setValueAtTime(0.0001, now);
      fresh.fader.gain.exponentialRampToValueAtTime(1, at);
      startDeck(ctx, fresh, at, seconds);
      // A seek is a move inside the record, not an instruction to change it.
      // Landing past the seam the arrangement chose used to begin the
      // transition the instant the finger lifted, so where you clicked the rim
      // decided whether the track changed. Re-arm it on the next sixteen-bar
      // line instead, and if there is no room left for a full blend, shorten
      // the blend rather than cut.
      const bs = fresh.track.barSeconds;
      const full = blendBarsFor(fresh.track, fresh.track.blendBars || 8);
      const natural = mixPointSeconds(fresh.track, full, o.boundaryBars);
      if (seconds > natural - 0.25) {
        // The next sixteen-bar line if there is room for a handover on it, a
        // four-bar line if not, the next bar as a last resort — and the blend
        // shortened to whatever is left rather than run past the end.
        const here = seconds / bs;
        let line = null;
        for (const q of [o.boundaryBars || 16, 4, 1]) {
          const next = Math.ceil((here + 1) / q) * q;
          if (fresh.track.bars - next >= 3) {
            line = next;
            break;
          }
        }
        if (line != null) {
          fresh.seamAt = line * bs;
          fresh.seamBars = Math.max(2, Math.min(full, fresh.track.bars - line - 1));
        }
      }
      current = fresh;
      emit();
      return seconds;
    },
    // Changing the room does not cut the record: the theme that is playing
    // keeps the preset it started in and the next one is planned in the new
    // one, so the change arrives through a seam like everything else does.
    setPreset(name) {
      o.preset = name;
      if (running && !transition) ready((nextPlan = plan(n + 1)));
      emit();
      return o.preset;
    },
    get preset() {
      return o.preset || 'auto';
    },
    planTheme: (i) => info(plan(i)),
    mixOut,
    // The set's last node, after the shared master. A listening bench taps
    // this directly; going round through the sink's MediaStream would re-clock
    // the audio and put a glitch in the capture that is not in the music.
    out: master.out,
  };
}

// --- offline render of a mix ---------------------------------------------
//
// The same decks, the same transition function, everything scheduled up front.
// `themeBars` shortens the themes so a few seams fit into a test render.
export async function renderMix({
  masterSeed = 1,
  themes = 3,
  themeBars = null,
  tail = 4,
  maxSeconds = 0,
  sampleRate = 44100,
  OfflineCtx = null,
  opts = {},
} = {}) {
  const o = { ...MIX_DEFAULTS, ...opts };
  const plans = [];
  for (let i = 0; i < themes; i++) {
    plans.push(planTheme(String(masterSeed), i, { ...o, themeBars: themeBars || undefined }));
  }

  // Lay the themes out on the set's own grid, exactly as the live engine does:
  // each theme starts where the previous one's mix point falls, no seam begins
  // before the one before it has ended, the grid is held through a blend and
  // glides to the arriving theme's tempo once the theme it replaced has gone.
  const clock = makeSetClock(plans[0].beat, 0);
  const startBeats = [0];
  const starts = [0];
  const seams = [];
  let free = 0;
  for (let i = 0; i < plans.length - 1; i++) {
    const t = plans[i];
    const b0 = startBeats[i];
    const themeTimeAt = (time) => (clock.beatAt(time) - b0) * t.beat;
    const contextTimeAt = (themeTime) => clock.timeAt(b0 + themeTime / t.beat);
    const p = seamPlan(t, t.blendBars || 8, {
      boundaryBars: o.boundaryBars,
      notBefore: Math.max(0, themeTimeAt(free)),
    });
    const at = contextTimeAt(p.at);
    const barSeconds = clock.pin(clock.beatAt(at)) * 4;
    const end = at + p.bars * barSeconds;
    seams.push({ at, bars: p.bars, barSeconds, from: i, to: i + 1 });
    startBeats.push(clock.beatAt(at));
    starts.push(at);
    free = end;
    clock.glide(clock.beatAt(end), plans[i + 1].beat, Math.max(1, (o.tempoGlideBars ?? 16) * 4));
  }
  const last = plans[plans.length - 1];
  const lastEnd = clock.timeAt(startBeats[startBeats.length - 1] + (last.bars * 4));
  let duration = lastEnd + tail;
  // A cap, so the live chain can be measured over a minute or two without
  // rendering a whole set to get there.
  if (maxSeconds > 0) duration = Math.min(duration, maxSeconds);

  const Ctor = OfflineCtx || globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new Ctor(2, Math.ceil(duration * sampleRate), sampleRate);
  await prepareLimiter(ctx);
  // The same rule the live set follows: the shared master is the room of the
  // theme the render opens with, stated here rather than left to whichever
  // plan was made last.
  applyParams(plans[0].paramOverrides);
  const master = buildMaster(ctx);
  master.out.connect(ctx.destination);
  const mixOut = ctx.createGain();
  mixOut.gain.value = 1;
  mixOut.connect(master.input);

  const decks = plans.map((t, i) => makeDeck(ctx, t, mixOut, master, clock, starts[i]));
  decks.forEach((d, i) => startDeck(ctx, d, starts[i], 0));
  // What the graph is actually given, which is what gets reported: the swap
  // time used to be worked out a second time from the wrong end of the blend,
  // and named 140.8 seconds where the kick really changed hands at 87.7.
  const scheduled = seams.map((s) =>
    scheduleTransition(ctx, decks[s.from], decks[s.to], s.at, s.bars, s.barSeconds, o, mixOut)
  );
  // The very first deck has no one handing it the bass, so it keeps its own;
  // every other deck keeps both of its gaps, the one it arrives under and the
  // one it leaves under.

  for (const d of decks) {
    // After an await the table belongs to whoever ran last, so this deck's
    // params go back on before its voices are prepared and again before its
    // events are fired.
    useDeckParams(d);
    await prepareVoices(ctx, d.track.events, { all: true }); // offline: the whole timeline
    useDeckParams(d);
    for (const ev of d.track.events) fireDeckEvent(ctx, d, ev);
  }

  const buffer = await ctx.startRendering();
  return {
    buffer,
    duration,
    themes: plans.map((t, i) => ({
      index: i,
      seed: t.seed,
      bpm: t.bpm,
      key: t.key.name,
      bars: t.bars,
      preset: t.preset,
      startTime: starts[i],
      blendBars: t.blendBars,
      filterMove: t.filterMove,
    })),
    seams: scheduled.map((t) => ({ at: t.at, end: t.end, swapAt: t.swapAt, bars: t.bars })),
  };
}

export default createMix;
