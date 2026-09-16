// A look-ahead scheduler for one theme, and the same event list poured into
// an OfflineAudioContext for the WAV export. One code path decides what a
// sound is; only the clock differs — and the clock is the mix's clock
// (src/clock.js): the same Worker tick, the same reach, the same stretch when
// the page is hidden.

import { VOICES, VOICE_BUS, VOICE_LEVEL, prepareVoices } from './voices/index.js';
import { buildGraph, scheduleDuck, scheduleMacro, scheduleMelodicGain, schedulePush, prepareLimiter } from './master.js';
import PARAMS, { applyParams } from './params.js';
import { develop } from './develop.js';
import { dbToGain, resolveStart } from './dsp.js';
import { TICK_MS, lookahead, startClock } from './clock.js';

// An anticipatory voice arrives on its event's time and has to *start* before
// it. `t` is the arrival; this is how long before that the sound begins.
//
// The swell is the only one, and it is 1.8 seconds long. A look-ahead
// scheduler visits an event when its own time enters a window of about 150 ms,
// so firing the swell on its arrival meant asking the browser to start a
// source 1.68 seconds in the past: `startTime()` checked the arrival, the
// voice subtracted the duration afterwards, and most of the envelope had
// already gone by. Offline rendering schedules the whole list at once, so the
// bug only ever existed on the page — which is why no render ever showed it.
//
// Both times stay in one event, so the plan and its frozen order are
// untouched: the arrival is `t`, the lead is `p.dur`, and it is the scheduler
// that decides which one it fires on.
export function leadOf(ev) {
  return ev.voice === 'swell' ? (ev.p?.dur ?? 1.6) : 0;
}

// When an event has to be visited, in track time: its onset, not its arrival.
export const onsetOf = (ev) => ev.t - leadOf(ev);

export function fireEvent(ctx, graph, ev, offset) {
  const voice = VOICES[ev.voice];
  if (!voice) return;
  const bus = graph.buses[VOICE_BUS[ev.voice] || 'melodic'];
  const level = dbToGain(PARAMS.levels[VOICE_LEVEL[ev.voice]] ?? -12);
  const p = { ...ev.p, gain: (ev.p?.gain ?? 1) * level };
  // One resolution of the onset, used for the sound and for the automation
  // that belongs to it. The voice's own guard sees a time that is already at
  // or past the render head and leaves it alone, so after a stall the duck
  // moves with its kick instead of ducking the bar before it.
  const when = resolveStart(ctx, onsetOf(ev) + offset);
  voice(ctx, bus, when, p);
  if (ev.voice === 'kick') scheduleDuck(graph, when);
}

// `offset` maps track time onto context time; `from` is the context time we
// are actually starting at, which after a seek is not the start of the track.
export function scheduleAutomation(graph, track, offset, from = null) {
  const at = from == null ? Math.max(0, offset) : from;
  scheduleMacro(
    graph,
    track.automation.macroFilter.map((p) => ({ t: p.t + offset, value: p.value })),
    at
  );
  if (track.automation.melodicGain) {
    scheduleMelodicGain(
      graph,
      track.automation.melodicGain.map((p) => ({ t: p.t + offset, value: p.value })),
      at
    );
  }
  if (track.automation.push) {
    schedulePush(graph, track.automation.push.map((p) => ({ t: p.t + offset, value: p.value })), at);
  }
}

// Disconnect a graph and stop the LFOs that would otherwise keep its width
// and chorus chains processing for as long as the context lives.
function letGo(graph) {
  try { graph.out.disconnect(); } catch (e) { /* already gone */ }
  for (const n of graph.keepAlive || []) {
    if (typeof n.stop === 'function') {
      try { n.stop(); } catch (e) { /* already stopped */ }
    }
  }
}

export class Player {
  constructor(ctx, track, opts = {}) {
    this.ctx = ctx;
    this.track = track;
    this.destination = opts.destination || ctx.destination;
    // `track.trimDb` is the per-theme loudness trim `planTheme` worked out; a
    // track straight from `generate()` has none and plays at unity, as it did.
    this.graph = buildGraph(ctx, { bpm: track.bpm, trimDb: track.trimDb });
    this.graph.out.connect(this.destination);
    this.index = 0;
    this.timer = null;
    this.startTime = 0;
    this.lookahead = opts.lookahead || 0; // what the page wants while visible
    this.onTick = opts.onTick || null;
    this.onEnd = opts.onEnd || null;
    this.stopped = false;
  }

  // `fromTime` is a position inside the track, in seconds. startTime is set so
  // that track time `fromTime` lands at context time `when`, which means every
  // event's `t + startTime` stays correct without touching the event list.
  start(when, fromTime = 0) {
    applyParams(this.track.paramOverrides);
    // The development layer: audio only, derived from the plan, and idempotent
    // so a seek re-running it changes nothing.
    develop(this.track);
    prepareVoices(this.ctx, this.track.events).catch(() => {}); // not awaited: the first hits fall back to live oscillators
    const at = when ?? this.ctx.currentTime + 0.12;
    this.startTime = at - fromTime;
    this.index = 0;
    const events = this.track.events;
    while (this.index < events.length && events[this.index].t < fromTime) this.index++;
    scheduleAutomation(this.graph, this.track, this.startTime, at);
    this.tick();
    if (!this.timer) {
      this.timer = startClock(() => this.tick(), TICK_MS);
      // The moment the page is hidden the horizon jumps out by a second and a
      // half, and that stretch has to be filled before the timers slow down.
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility = () => this.tick());
    }
    return this.startTime;
  }

  // Jump to a bar. Anything already scheduled after `now` is thrown away by
  // rebuilding the graph, which is the only reliable way to drop notes that
  // Web Audio has already been told about.
  seek(fromTime) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const old = this.graph;
    // Fade the old graph out over 40 ms so the jump is a cut, not a click.
    try {
      old.out.gain.cancelScheduledValues(now);
      old.out.gain.setValueAtTime(old.out.gain.value, now);
      old.out.gain.linearRampToValueAtTime(0, now + 0.04);
      setTimeout(() => letGo(old), 300);
    } catch (e) {
      /* already gone */
    }
    this.graph = buildGraph(ctx, { bpm: this.track.bpm, trimDb: this.track.trimDb });
    this.graph.out.connect(this.destination);
    this.graph.out.gain.setValueAtTime(0.0001, now);
    this.graph.out.gain.exponentialRampToValueAtTime(1, now + 0.05);
    this.start(now + 0.06, fromTime);
    return fromTime;
  }

  tick() {
    if (this.stopped) return;
    const horizon = this.ctx.currentTime - this.startTime + lookahead(this.ctx, this.lookahead);
    const events = this.track.events;
    // Anything scheduled below is built out of the live table, so this
    // track's params go on first — a theme planned in the page while this
    // one plays has left its own room in there.
    if (this.index < events.length && onsetOf(events[this.index]) <= horizon) applyParams(this.track.paramOverrides);
    while (this.index < events.length && onsetOf(events[this.index]) <= horizon) {
      // A note that throws must not stop the ones behind it: the index moves
      // whether the voice built or not.
      try {
        fireEvent(this.ctx, this.graph, events[this.index], this.startTime);
      } catch (err) {
        this.failed = (this.failed || 0) + 1;
        if (this.failed <= 3) console.error('event failed', events[this.index], err);
      }
      this.index++;
    }
    const elapsed = this.ctx.currentTime - this.startTime;
    if (this.onTick) this.onTick(elapsed);
    if (elapsed >= this.track.duration) {
      this.stop();
      if (this.onEnd) this.onEnd();
    }
  }

  get elapsed() {
    return Math.max(0, this.ctx.currentTime - this.startTime);
  }

  stop() {
    this.stopped = true;
    if (this.timer) this.timer();
    this.timer = null;
    if (this.onVisibility && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    try {
      this.graph.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.graph.out.gain.setValueAtTime(this.graph.out.gain.value, this.ctx.currentTime);
      this.graph.out.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
      setTimeout(() => letGo(this.graph), 200);
    } catch (e) {
      /* already gone */
    }
  }
}

// The offline render: identical graph, every event scheduled up front.
export async function renderTrack(track, { sampleRate = 44100, OfflineCtx } = {}) {
  const Ctor = OfflineCtx || globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  applyParams(track.paramOverrides);
  develop(track);
  const frames = Math.ceil(track.duration * sampleRate);
  const ctx = new Ctor(2, frames, sampleRate);
  // The limiter's module before the master that wants it: `buildMaster` is
  // synchronous and `addModule` is not.
  await prepareLimiter(ctx);
  // The table is shared and this render has just waited on something: another
  // render or the live set may own it now, so this track's params go back on
  // before the graph is built and again before its events are scheduled.
  applyParams(track.paramOverrides);
  const graph = buildGraph(ctx, { bpm: track.bpm, trimDb: track.trimDb });
  graph.out.connect(ctx.destination);
  await prepareVoices(ctx, track.events, { all: true }); // offline: the whole timeline, no deadline to miss
  applyParams(track.paramOverrides);
  scheduleAutomation(graph, track, 0);
  for (const ev of track.events) fireEvent(ctx, graph, ev, 0);
  return ctx.startRendering();
}

export default Player;
