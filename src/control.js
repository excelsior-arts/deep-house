// The machine, with no page attached to it.
//
// Under it is src/mix.js: an endless set, one theme running into the next.
// Everything the interface needs to know is a readout pushed to subscribers;
// everything it can do is a method here. Two faces (the bench and the
// ring) drive the same object, and a headless check can drive it with a fake
// clock and never open an audio context at all.

import { createMix, planTheme, mixPointSeconds, blendBarsFor } from './mix.js';
import { prepareLimiter } from './master.js';
import { renderTrack } from './scheduler.js';
import { encodeWav } from './wav.js';
import { chordAtBar, noteName } from './theory.js';

export const PRESETS_CYCLE = ['auto', 'sub', 'growl'];
export const LENGTHS_CYCLE = [1, 2, 4];

export const LAYER_ORDER = [
  'kick', 'hatClosed', 'hatOpen', 'sixteenths', 'clap', 'bass', 'keys', 'pad',
];

export const LAYER_LABEL = {
  kick: 'kick',
  hatClosed: 'hats',
  hatOpen: 'open hat',
  sixteenths: '16ths',
  clap: 'clap',
  bass: 'bass',
  keys: 'keys',
  pad: 'pad',
};

// The seven lanes the rim draws: one per thing you can hear. `layers` are the
// arrangement's names (is this allowed to play this bar), `events` the event
// list's names (how much of it actually happens).
export const LANES = [
  { id: 'kick', initial: 'K', layers: ['kick'], events: ['kick'] },
  { id: 'bass', initial: 'B', layers: ['bass'], events: ['bass'] },
  { id: 'hats', initial: 'H', layers: ['hatClosed'], events: ['hats', 'shaker'] },
  { id: 'clap', initial: 'C', layers: ['clap'], events: ['clap'] },
  { id: 'keys', initial: 'S', layers: ['keys'], events: ['keys'] },
  { id: 'pad', initial: 'P', layers: ['pad'], events: ['pad'] },
  { id: 'fx', initial: 'F', layers: [], events: ['fx'] },
];

// Per bar, per lane: 0 = silent, 1..3 = how thick the part is. Computed once
// per theme and hung off it, so the rim can be redrawn for free.
export function lanesOf(track) {
  if (!track) return null;
  if (track._lanes) return track._lanes;
  const bars = track.bars;
  const counts = {};
  const level = {};
  for (const L of LANES) {
    counts[L.id] = new Float32Array(bars);
    level[L.id] = new Uint8Array(bars);
  }
  const of = {};
  for (const L of LANES) for (const e of L.events) of[e] = L.id;
  for (const ev of track.events) {
    const id = of[ev.layer];
    if (!id) continue;
    const b = ev.bar == null ? Math.floor(ev.t / track.barSeconds) : ev.bar;
    if (b >= 0 && b < bars) counts[id][b] += 1;
  }
  for (const L of LANES) {
    let max = 0;
    for (let b = 0; b < bars; b++) max = Math.max(max, counts[L.id][b]);
    for (let b = 0; b < bars; b++) {
      const row = track.timeline[b];
      const allowed = L.layers.length
        ? L.layers.some((k) => row && row.layers.includes(k))
        : counts[L.id][b] > 0;
      if (!allowed) continue;
      const d = max ? counts[L.id][b] / max : 0;
      level[L.id][b] = counts[L.id][b] === 0 ? 1 : d < 0.34 ? 1 : d < 0.72 ? 2 : 3;
    }
  }
  track._lanes = { order: LANES.map((l) => l.id), level, bars };
  return track._lanes;
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Where the listener left the set. Storage can be absent or refuse to write;
// the player works either way.
const STORE = 'deep-house.player';
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
}
function writeStore(v) {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* full or blocked */ }
}
function clearStore() {
  try { localStorage.removeItem(STORE); } catch (e) { /* blocked */ }
}
// Which way the set leaves the page. The element path is what a phone needs
// for a lock-screen card; the direct path is the shortest wire there is, for
// telling our own artefacts from the ones the platform adds.
// Only one platform is paid for the element path. iOS and iPadOS keep a
// page's audio session alive through a screen lock for a playing media
// element and nowhere else, and hang their lock-screen card on it. Everywhere
// else the element is a second clock — another buffer, sometimes another
// sample rate — between the mix and the speakers, so the set goes straight
// out. ?out=element|direct overrides either way.
// There is a third road, and it exists for the checks: ?out=silent ends the
// set in a gain of zero connected to the destination. The context is real, the
// clock is real, the scheduler fills its horizon and the capture tap — which
// reads the mix's own last node — reads exactly what it always reads; the one
// thing that changes is that nothing leaves the machine. A suite that plays a
// minute of a set must not play it at whoever is sitting in front of it.
function isApplePhone() {
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS reports itself as a Mac; a Mac has no touch screen
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  } catch (e) { return false; }
}

function outMode() {
  let asked = null;
  try { asked = new URLSearchParams(location.search).get('out'); } catch (e) { asked = null; }
  if (asked === 'direct' || asked === 'element' || asked === 'silent') return asked;
  return isApplePhone() ? 'element' : 'direct';
}
const OUT = outMode();

// A player has no reason to ask for the smallest possible output buffer. The
// 'playback' hint asks the browser for a larger one, which rides through a
// missed deadline instead of letting the card run dry — the clicks that come
// of a 4096-frame period on a busy machine. ?latency= overrides it for a test:
// interactive, balanced, playback, or a number of seconds.
function latencyHint() {
  try {
    const v = new URLSearchParams(location.search).get('latency');
    if (!v) return 'playback';
    if (['interactive', 'balanced', 'playback'].includes(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 'playback';
  } catch (e) { return 'playback'; }
}
const LATENCY = latencyHint();

// The scheduler fills 120 ms ahead while the page is visible. A device that
// hands out a large output buffer needs more reach than that, or a note could
// be written after the card had already asked for it: four buffers plus a
// margin, never less than the 120 ms the mix defaults to.
const VISIBLE_LOOKAHEAD = 0.12;
const lookaheadFor = (base) => Math.max(VISIBLE_LOOKAHEAD, (base || 0) * 4 + 0.06);

function urlSeed() {
  try {
    const v = new URLSearchParams(location.search).get('seed');
    return v && v.trim() ? v.trim() : null;
  } catch (e) { return null; }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const roman = (n) => ROMAN[n] || String(n);

// What the phone shows while the screen is dark: the theme, the set it came
// from, and the sigil for a cover. Everything is guarded — a browser without
// a media session simply gets none of it.
// Where the lock-screen pictures live: beside the page. They are kept in
// public/, which the dev server serves at its root and the build copies next
// to index.html, so the same relative address is right in both places.
const ARTWORK_DIR = './';

function artwork() {
  const base = new URL(ARTWORK_DIR, location.href).href;
  return [
    { src: `${base}artwork-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}artwork-256.png`, sizes: '256x256', type: 'image/png' },
    { src: `${base}card-square.png`, sizes: '1200x1200', type: 'image/png' },
  ];
}

// Half a second of 8 kHz mono silence as a WAV data URL: 4 KB, no file.
export function createControl({ seed = 1, preset = 'auto', minutes = null } = {}) {
  const state = {
    seed: String(seed),      // the master seed: the whole set comes from it
    preset,
    minutes,                 // nothing pins a theme length today; kept for a bench that may
    themeBars: null,
    playing: false,
    themeIndex: 0,
    position: 0,             // seconds into the theme playing now
    transition: 0,           // 0..1 through the seam into the next theme
    previewIndex: null,      // the theme being mixed in, when it is not n+1
    cut: null,               // a skip or back that the music has not reached yet
    resumeAfterCast: false,  // the set was playing when a new seed was cast
    starting: false,         // a start is under way; exactly one may be
    lookahead: 0,            // how far the scheduler reaches, for this device
    scrubbing: false,        // a hand is dragging the cursor along the band
    // Audio starts from a hand in this page, and from nothing else. A restored
    // tab, a page coming back to the front, a system telling us to play — none
    // of them may make a sound until someone in this session has asked for one.
    userStarted: false,
    track: null,             // the full plan of the current theme
    nextTrack: null,         // and of the one after it
    mix: null,
    ctx: null,
    sink: null,              // the mix's own stream, which the element plays
    raf: 0,
    fake: false,
    render: { busy: false, note: '', ok: null },
    change: { n: 0, reason: 'init' },
  };

  const listeners = new Set();
  const planCache = new Map();

  // --- where we were ------------------------------------------------------
  let savedAt = 0;
  let scrubFrom = 0; // the position a drag along the band started from

  function remember() {
    // What is written down is where the set is, not where the last frame that
    // happened to be drawn said it was.
    syncFromMix();
    savedAt = Date.now();
    writeStore({
      seed: state.seed,
      themeIndex: state.themeIndex,
      seconds: +state.position.toFixed(2),
      bar: state.track ? Math.floor(state.position / state.track.barSeconds) : 0,
      preset: state.preset,
      at: new Date().toISOString(),
    });
  }

  function restore() {
    const url = urlSeed();
    const was = readStore();
    if (url) {
      state.seed = url;
      state.themeIndex = 0;
      state.position = 0;
      return 'url';
    }
    if (!was || !was.seed) return 'fresh';
    state.seed = String(was.seed);
    state.themeIndex = Math.max(0, Number(was.themeIndex) || 0);
    state.preset = PRESETS_CYCLE.includes(was.preset) ? was.preset : state.preset;
    state.position = Math.max(0, Number(was.seconds) || 0);
    return 'restored';
  }

  function ctx() {
    if (!state.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      state.ctx = new Ctor({ latencyHint: LATENCY });
      const base = state.ctx.baseLatency || 0;
      state.lookahead = lookaheadFor(base);
      if (state.lookahead > VISIBLE_LOOKAHEAD) {
        console.info(`deep-house: look-ahead raised to ${Math.round(state.lookahead * 1000)} ms ` +
          `for a ${(base * 1000).toFixed(1)} ms buffer.`);
      }
      // A phone call, another app's audio or a locked screen leaves the
      // context 'interrupted' or 'suspended'; nothing resumes it but us.
      state.ctx.addEventListener('statechange', wake);
    }
    return state.ctx;
  }

  // Bring the context back whenever the set should be sounding and is not.
  // Bring a context back that a hand had already started and an interruption
  // took away. It never creates a mix and it never calls start().
  function wake() {
    const c = state.ctx;
    if (!c || !state.userStarted || !state.mix || !state.playing) return;
    if (document.hidden) return;
    if (c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {});
  }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);

  // The set leaves through a media element rather than straight out of the
  // context. iOS keeps a page's audio session alive through a screen lock only
  // for a playing element, and it is the element — not the graph — that the
  // system hangs its Now Playing card and its lock-screen controls on. So the
  // mix is rendered into a stream and the element plays that stream.
  let keep = null;
  function sink() {
    if (OUT === 'direct') return null;
    if (!state.sink) {
      const c = ctx();
      if (OUT === 'silent') {
        // The whole of the silence: the set's destination is a gain of zero
        // that is itself connected to the context's destination, so the graph
        // is built, pulled and torn down exactly as it is on the page and the
        // last node before the card multiplies by nothing.
        const g = c.createGain();
        g.gain.value = 0;
        g.connect(c.destination);
        state.sink = g;
        return state.sink;
      }
      if (!c.createMediaStreamDestination) return null;
      state.sink = c.createMediaStreamDestination();
    }
    return state.sink;
  }

  function keepAlive(on) {
    // Only the element path has anything to keep alive: the direct one has no
    // element and the silent one has a gain node, which needs no play().
    if (OUT !== 'element') return;
    if (on) {
      const d = sink();
      if (!keep) {
        keep = document.getElementById('sound') || new Audio();
        keep.setAttribute('playsinline', '');
        keep.autoplay = false;
        keep.loop = false;
        keep.muted = false;
        keep.volume = 1;
        // A pause from the lock screen must stop the set, not leave the music
        // running under a control that says it is paused. There is no matching
        // 'play' listener: we are the ones who call play() on the element, and
        // its event would land before the mix exists and start a second one.
        // The lock screen's play arrives through the media session instead.
        keep.addEventListener('pause', () => { if (state.playing && !state.starting) stop(); });
      }
      if (d && keep.srcObject !== d.stream) keep.srcObject = d.stream;
      keep.play().catch(() => {});
    } else if (keep) {
      keep.pause();
    }
  }

  function mixOpts() {
    const o = { masterSeed: state.seed, preset: state.preset };
    if (state.lookahead) o.lookahead = state.lookahead;
    if (state.themeBars) o.themeBars = state.themeBars;
    return o;
  }

  // planTheme is pure and cheap, and it hands back the whole track — the
  // timeline, the events, the arrangement — which is what the lanes are made
  // of. The mix's own planTheme() only summarises, so this is the one to use.
  function planned(i) {
    const key = `${state.seed}|${i}|${state.preset}|${state.themeBars || 0}`;
    if (planCache.has(key)) return planCache.get(key);
    const t = planTheme(state.seed, i, mixOpts());
    lanesOf(t);
    if (planCache.size > 8) planCache.clear();
    planCache.set(key, t);
    return t;
  }

  function replan(reason) {
    state.track = planned(state.themeIndex);
    // Which theme is coming: the one after this, unless a back() is under way.
    const ahead = state.previewIndex != null ? state.previewIndex : state.themeIndex + 1;
    state.nextTrack = planned(Math.max(0, ahead));
    if (reason) state.change = { n: state.change.n + 1, reason };
  }

  const playable = () => (state.track ? state.track.bars * state.track.barSeconds : 0);

  function chordNotes(bar) {
    const t = state.track;
    if (!t) return [];
    const chord = chordAtBar(t.progression, clamp(bar, 0, t.bars - 1));
    const seen = [];
    for (const m of chord.voicing || []) {
      const n = noteName(m).replace(/-?\d+$/, '');
      if (!seen.includes(n)) seen.push(n);
    }
    return seen;
  }

  // Where this theme hands over, and how close we are to it.
  function seamSeconds() {
    const t = state.track;
    if (!t) return 0;
    try {
      return mixPointSeconds(t, blendBarsFor(t, t.blendBars || 8), 16);
    } catch (e) {
      return t.bars * t.barSeconds;
    }
  }

  function seamApproach(pos) {
    const t = state.track;
    if (!t) return 0;
    const seam = seamSeconds();
    const window = 32 * t.barSeconds;
    return clamp((pos - (seam - window)) / window, 0, 1);
  }

  // How long until a tapped cut changes hands, in seconds off the set's own
  // clock. mix.js hands back the moment — swapAt, where the low end goes over
  // and the theme index turns with it — so a face can draw the wait as it runs
  // instead of guessing at its length.
  function cutInSeconds() {
    if (!state.cut || !state.ctx) return 0;
    return Math.max(0, state.cut.swapAt - state.ctx.currentTime);
  }

  // How many bars until a tapped cut actually happens, so the ring can say so.
  function cutInBars() {
    if (!state.cut || !state.ctx || !state.track) return 0;
    const left = state.cut.at - state.ctx.currentTime;
    if (left <= 0) return 0;
    return Math.max(1, Math.ceil(left / state.track.barSeconds));
  }

  function nextInfo() {
    const t = state.nextTrack;
    if (!t) return null;
    return {
      index: (state.previewIndex != null ? state.previewIndex : state.themeIndex + 1) + 1,
      seed: t.seed,
      key: t.key.name,
      bpm: t.bpm,
      bars: t.bars,
      duration: t.bars * t.barSeconds,
      durationLabel: formatTime(t.bars * t.barSeconds),
      lanes: lanesOf(t),
      plan: t.arrangement.sections.map((s) => ({ label: s.label, kind: s.kind, startBar: s.startBar, bars: s.bars, index: s.index })),
    };
  }

  // One object with everything a face could want to draw.
  function readout() {
    // The transport's own time, taken here rather than at the last animation
    // frame: everything downstream of a readout — the lock screen's position,
    // a rating's window, what a face draws — is then the set as it is.
    syncFromMix();
    const t = state.track;
    if (!t) return null;
    const pos = clamp(state.position, 0, playable());
    const bar = clamp(Math.floor(pos / t.barSeconds), 0, t.bars - 1);
    const row = t.timeline[bar] || { section: '', sectionIndex: 0, chord: '', layers: [] };
    const layers = row.layers || [];
    const active = {};
    for (const k of LAYER_ORDER) active[k] = layers.includes(k);

    return {
      seed: state.seed,
      preset: state.preset,
      presetName: t.presetLabel,
      minutes: state.minutes,
      playing: state.playing,
      bpm: t.bpm,
      beat: t.beat,
      barSeconds: t.barSeconds,
      key: t.key.name,
      bars: t.bars,
      bar,
      barLabel: `${bar + 1}/${t.bars}`,
      section: row.section,
      sectionIndex: row.sectionIndex,
      chord: row.chord,
      chordNotes: chordNotes(bar),
      kickIn: layers.includes('kick'),
      layers,
      active,
      seconds: pos,
      time: formatTime(pos),
      duration: playable(),
      durationLabel: formatTime(playable()),
      progress: playable() ? pos / playable() : 0,
      lanes: lanesOf(t),
      beatInBar: Math.floor((pos / t.beat) % 4),
      beatPhase: (pos / t.beat) % 1,
      barPhase: (pos / t.barSeconds) % 1,
      plan: t.arrangement.sections.map((s) => ({
        label: s.label, kind: s.kind, startBar: s.startBar, bars: s.bars, index: s.index,
      })),
      dice: t.dice,
      change: state.change,
      mix: {
        themeIndex: state.themeIndex + 1,
        transition: state.transition,
        // how near the seam is: the next theme starts showing through over the
        // thirty-two bars before the mix point
        approach: seamApproach(pos),
        seamAt: seamSeconds(),
        cutInBars: cutInBars(),
        cutIn: cutInSeconds(),
        cutting: !!state.cut,
        next: nextInfo(),
      },
      track: t,
      render: { ...state.render },
    };
  }

  // --- what the lock screen is told ---------------------------------------
  let mediaFor = '';
  let posAt = 0;

  function media(r) {
    // Nothing is published until a hand has started the set: a restored tab
    // must not even advertise itself as something the system can play.
    if (!state.userStarted) return;
    const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
    if (!ms) return;
    const key = `${r.mix.themeIndex}|${r.key}|${r.bpm}|${r.seed}`;
    if (key !== mediaFor && window.MediaMetadata) {
      mediaFor = key;
      try {
        ms.metadata = new window.MediaMetadata({
          title: `Theme ${roman(r.mix.themeIndex)} · ${r.key} · ${r.bpm}`,
          artist: 'Deep House',
          album: `seed ${r.seed}`,
          artwork: artwork(),
        });
      } catch (e) { /* older shapes */ }
    }
    ms.playbackState = r.playing ? 'playing' : 'paused';
    const now = Date.now();
    if (now - posAt > 1000 && ms.setPositionState) {
      posAt = now;
      try {
        ms.setPositionState({
          duration: Math.max(1, r.duration),
          position: clamp(r.seconds, 0, Math.max(1, r.duration)),
          playbackRate: 1,
        });
      } catch (e) { /* a position the browser dislikes */ }
    }
  }

  // Registered only once a hand in this page has started the set. A tab that
  // Safari restores has no handlers, so the system cannot tell it to play.
  let handlersOn = false;

  function mediaHandlers() {
    if (handlersOn) return;
    const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
    if (!ms || !ms.setActionHandler) return;
    handlersOn = true;
    const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch (e) { /* unsupported */ } };
    set('play', () => start());
    set('pause', () => stop());
    set('nexttrack', () => control.skip());
    set('previoustrack', () => control.back());
    set('stop', () => stop());
    set('seekto', (d) => { if (d && d.seekTime != null && playable()) control.seekTo(d.seekTime / playable(), true); });
  }

  function emit() {
    const r = readout();
    if (!r) return;
    media(r);
    for (const fn of listeners) {
      try { fn(r); } catch (err) { console.error(err); }
    }
  }

  // Where the set is, asked of the mix itself. This used to live inside the
  // animation loop, which made the audio's own state a thing that only existed
  // while something was being drawn: a page in the background goes on playing
  // while its frames stop, so a pause, a saved position, a rating or a
  // lock-screen update taken then described a moment nobody had heard. Frames
  // present this; they do not own it.
  function syncFromMix() {
    const m = state.mix;
    if (!m || state.fake) return null;
    const s = m.state;
    // The deck that is playing knows which theme it is; mix.state.themeIndex
    // is already counting forward in the middle of a back().
    const idx = s.theme && s.theme.index != null ? s.theme.index : s.themeIndex;
    if (idx !== state.themeIndex && idx >= 0) {
      state.themeIndex = idx;
      state.previewIndex = null;
      replan('theme');
    }
    // While a hand is on the band the position belongs to the hand.
    if (!state.scrubbing) state.position = s.elapsed;
    state.transition = s.transition;
    if (!s.running && state.playing) {
      state.playing = false;
      state.mix = null;
    }
    return s;
  }

  // While the mix runs, the clock is the audio context's, read once a frame.
  function loop() {
    if (!state.mix) return;
    syncFromMix();
    if (Date.now() - savedAt > 5000) remember();
    if (state.cut && state.ctx && state.ctx.currentTime > state.cut.end) state.cut = null;
    emit();
    if (state.mix) state.raf = requestAnimationFrame(loop);
  }

  // A start is asynchronous, so it can be overtaken: by a stop, by a second
  // tap, by a cast. Each one takes the next number, and a startup whose number
  // has moved on stops at its next await and lets go of everything it built.
  // Without this a stop could report itself while a mix it could no longer
  // reach went on to start playing — the set that kept going after pause.
  let generation = 0;
  let pending = null; // a mix that has been built but not yet handed over

  function cancelStartup() {
    generation += 1;
    state.starting = false;
    const m = pending;
    pending = null;
    if (m) {
      try { m.stop(); } catch (e) { console.error(e); }
      console.warn('deep-house: cancelled a mix that was still starting');
    }
  }

  // Let go of the mix. The fade and everything downstream of it belong to the
  // mix, not here: this used to pull the mix's output in the same turn as the
  // stop, so the ramp the mix had just scheduled shaped nothing and the record
  // was cut off wherever its waveform stood. Returns the seconds until the set
  // is silent, so whoever asked can wait for it rather than guess.
  function disposeMix(why) {
    const m = state.mix;
    if (!m) return 0;
    state.mix = null;
    let quiet = 0;
    try { quiet = m.stop() || 0; } catch (e) { console.error(e); }
    if (why) console.warn(`deep-house: disposed a live mix (${why})`);
    return quiet;
  }

  function stop() {
    cancelStartup();
    // Where the set had actually reached, before the mix that knows it is let
    // go: this is the position that is remembered and resumed from.
    syncFromMix();
    const quiet = disposeMix();
    state.playing = false;
    // On the element path the element is the last thing out, so pausing it is
    // another way of cutting the fade off: it waits for the mix to be silent.
    if (quiet > 0) setTimeout(() => { if (!state.mix) keepAlive(false); }, quiet * 1000);
    else keepAlive(false);
    state.fake = false;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.transition = 0;
    state.cut = null;
    state.scrubbing = false;
    // Say "paused" to the system while it is still being listened to: nothing
    // is published once the activation flag is down, so clearing it first left
    // a lock screen holding a card that said the set was playing.
    const paused = readout();
    if (paused) media(paused);
    state.userStarted = false;
    remember();
    emit();
  }

  // The only door into sound. Everything that calls it is a hand: a tap on the
  // ring, a key, or the lock screen's own play button — which a person presses.
  async function start() {
    if (state.mix) return;
    state.userStarted = true;
    mediaHandlers();
    // A start still in flight is superseded by this one rather than racing it.
    cancelStartup();
    const gen = generation;
    const stale = () => gen !== generation;
    state.starting = true;
    let mine = null;
    try {
      const c = ctx();
      keepAlive(true); // before the first await: it has to happen inside the tap
      if (c.state !== 'running') await c.resume();
      if (stale()) return;
      // The ceiling's worklet, once per context, before any master is built.
      await prepareLimiter(c);
      if (stale()) return;
      // Where the cursor was left: a seek made while stopped, or where a pause
      // happened. The set picks up there rather than at the theme's first bar.
      const from = clamp(state.position, 0, Math.max(0, playable() - 0.5));
      disposeMix('one was still alive when another was asked for');
      const d = sink();
      mine = createMix(c, { ...mixOpts(), destination: d ? d : c.destination });
      pending = mine;
      // Where the set was left goes into the start itself rather than into a
      // seek taken after it. A seek is a move inside one theme: it drops the
      // hand-over in flight and re-arms it on the next sixteen-bar line, so a
      // pause and a play inside a blend threw the mix away and brought it back
      // a dozen bars later — "the track cleared up to a simpler sound". The
      // mix works out from the position alone whether it falls inside a blend
      // and builds that blend again at the stage it had reached.
      await mine.start(state.themeIndex, from);
      if (stale()) return;
      pending = null;
      state.mix = mine;
      mine = null;
      state.playing = true;
      state.position = from;
      // A position past the end of a blend belongs to the theme that arrived
      // at it, so what is drawn and what is written down are the mix's own
      // theme and position rather than the ones that were asked for.
      syncFromMix();
      remember();
      emit();
      loop();
    } finally {
      // A startup that was overtaken, or one that threw, owns nothing: what it
      // built is stopped here, so a mix is never left running with no one
      // holding it. A stop that happened while this was waiting stands.
      if (mine) {
        if (pending === mine) pending = null;
        try { mine.stop(); } catch (e) { console.error(e); }
      }
      if (!stale()) state.starting = false;
      if (!state.mix) keepAlive(false);
    }
  }

  // A new master seed is a different set. The music stops while the old sigil
  // collapses; if it was playing, the ring starts it again once the new one is
  // drawn, which is what `resumeAfterCast` is for.
  function recast(reason) {
    // A set that is still starting counts as one that was playing: the cast
    // has to cancel it, and it is what the listener asked to hear.
    const was = state.playing || state.starting;
    if (state.mix || state.starting) stop();
    if (reason === 'seed') state.resumeAfterCast = was;
    state.position = 0;
    state.transition = 0;
    planCache.clear();
    replan(reason);
    emit();
    return was;
  }

  const control = {
    get state() { return state; },
    get track() { return state.track; },
    get playing() { return state.playing; },
    get mix() { return state.mix; },
    LAYER_ORDER,
    LAYER_LABEL,
    LANES,

    subscribe(fn) {
      listeners.add(fn);
      const r = readout();
      if (r) fn(r);
      return () => listeners.delete(fn);
    },

    emit,
    readout,
    planned,
    start,
    stop,
    toggle() { return state.mix ? stop() : start(); },

    setSeed(seed) {
      const next = String(seed).trim() || '1';
      if (next === state.seed) return;
      state.seed = next;
      state.themeIndex = 0;
      recast('seed');
    },

    newSeed() {
      state.seed = String(Math.floor(Math.random() * 100000));
      state.themeIndex = 0;
      recast('seed');
      return state.seed;
    },

    // mix.js takes its preset when the set is created, so changing it means a
    // new set from the same seed, resumed at the theme you were on.
    setPreset(p) {
      if (!PRESETS_CYCLE.includes(p) || p === state.preset) return;
      state.preset = p;
      const was = recast('preset');
      if (was) start();
    },

    cyclePreset(step = 1) {
      const i = PRESETS_CYCLE.indexOf(state.preset);
      const next = PRESETS_CYCLE[(i + step + PRESETS_CYCLE.length) % PRESETS_CYCLE.length];
      control.setPreset(next);
      return next;
    },

    // Nothing pins a theme length today; the mix draws its own.
    setMinutes(m) {
      const n = Number(m);
      if (!(n >= 1 && n <= 8) || n === state.minutes) return;
      state.minutes = n;
      const bs = state.track ? state.track.barSeconds : 2.3;
      state.themeBars = Math.max(16, Math.round((n * 60) / bs / 16) * 16);
      const was = recast('minutes');
      if (was) start();
    },

    cycleMinutes(step = 1) {
      const i = LENGTHS_CYCLE.indexOf(state.minutes);
      const next = LENGTHS_CYCLE[(i + step + LENGTHS_CYCLE.length) % LENGTHS_CYCLE.length];
      control.setMinutes(next);
      return next;
    },

    // 0..1 along the theme. `commit` false only paints the readout, which is
    // what a drag wants until the finger lifts.
    seekTo(fraction, commit = true) {
      if (!state.track) return 0;
      const to = clamp(fraction, 0, 1) * playable();
      // Where the drag began, so a gesture that asks for nothing — a flick, a
      // cancellation — can put it back even with no set playing.
      if (!commit && !state.scrubbing) scrubFrom = state.position;
      state.position = to;
      // While a scrub is under way the position belongs to the hand; the
      // playhead must not write over it between two moves.
      state.scrubbing = !commit;
      if (commit && state.mix) {
        state.mix.seek(to);
        // The seek dropped whatever seam was running, so a cut the face is
        // still counting down to is not going to happen.
        state.cut = null;
      }
      if (commit) remember();
      emit();
      return to;
    },

    // Every gesture along the band ends here, exactly once, whatever ended
    // it: a lift, a flick, a cancelled drag, a pointer capture the system took
    // away. A lift commits where the hand left the cursor; a flick or a
    // cancellation gives the position back to the transport, because nothing
    // was asked for. `scrubbing` is what stops the playhead writing over the
    // hand, so leaving it set froze the cursor, the elapsed time, the
    // remembered position and the rating window while the set played on.
    endScrub({ commit = false, fraction = null } = {}) {
      const was = state.scrubbing;
      state.scrubbing = false;
      if (commit) {
        const f = fraction == null ? (playable() ? state.position / playable() : 0) : fraction;
        return control.seekTo(f, true);
      }
      if (state.mix) state.position = state.mix.state.elapsed;
      else if (was) state.position = clamp(scrubFrom, 0, playable());
      if (was) emit();
      return state.position;
    },

    seekToBar(bar) {
      if (!state.track) return 0;
      return control.seekTo(clamp(bar, 0, state.track.bars - 1) / state.track.bars);
    },

    // --- the set ---------------------------------------------------------
    // Forward is a DJ cut over eight bars, not a jump.
    // Forward is a DJ cut: mix.js starts it on the next bar and blends over
    // eight, so the theme index only turns over at the end of it. The cut is
    // remembered here so a face can say that the tap was taken.
    skip() {
      if (state.mix) {
        const t = state.mix.skip();
        if (t && t.at) state.cut = { at: t.at, end: t.end, swapAt: t.swapAt || t.end, kind: 'skip' };
        remember();
        emit();
        return state.themeIndex + 1;
      }
      // Stopped: step the plan only. Nothing sounds until play is pressed,
      // and then it starts at this theme's first bar.
      state.themeIndex += 1;
      state.position = 0;
      state.previewIndex = null;
      replan('theme');
      remember();
      emit();
      return state.themeIndex;
    },

    back() {
      if (state.themeIndex <= 0) {
        state.change = { n: state.change.n + 1, reason: 'refused' };
        emit();
        return false;
      }
      if (state.mix) {
        state.previewIndex = state.themeIndex - 1;
        replan(null);
        const t = state.mix.back();
        if (t && t.at) state.cut = { at: t.at, end: t.end, swapAt: t.swapAt || t.end, kind: 'back' };
        remember();
        emit();
        return true;
      }
      state.themeIndex -= 1;
      state.position = 0;
      state.previewIndex = null;
      replan('theme');
      remember();
      emit();
      return true;
    },

    // Back to the beginning: seed one, first theme, first bar, and nothing
    // remembered. The ring casts onto it as it would any other seed.
    resetToStart() {
      clearStore();
      state.seed = '1';
      state.themeIndex = 0;
      state.previewIndex = null;
      planCache.clear();
      recast('seed');
      remember();
      return state.seed;
    },

    remember,
    out: OUT,
    latencyHint: LATENCY,

    // what the browser actually gave us, for the bench to show
    timing() {
      const c = state.ctx;
      if (!c) return { hint: LATENCY, rate: null, base: null, output: null };
      return {
        hint: LATENCY,
        rate: c.sampleRate,
        base: c.baseLatency == null ? null : +(c.baseLatency * 1000).toFixed(1),
        output: c.outputLatency == null ? null : +(c.outputLatency * 1000).toFixed(1),
        lookahead: Math.round((state.lookahead || VISIBLE_LOOKAHEAD) * 1000),
      };
    },

    // Called inside the tap that casts, so the context is awake when the new
    // set starts a second and a half later, outside any gesture.
    resumeContext() {
      const c = ctx();
      if (c.state === 'suspended') c.resume().catch(() => {});
      return c.state;
    },

    // The ring calls this when the new sigil is finished.
    resumeIfCast() {
      if (!state.resumeAfterCast) return false;
      state.resumeAfterCast = false;
      start();
      return true;
    },

    // For drawing a crossing before the mix engine is driving one.
    setTransition(p) {
      state.transition = clamp(Number(p) || 0, 0, 1);
      emit();
    },

    prepareNext(i) {
      state.nextTrack = planned(i == null ? state.themeIndex + 1 : i);
      emit();
      return nextInfo();
    },

    // The figure dice come out of the theme seed inside the generator, so
    // there is no cheap way to spin one on its own.
    canRerollDie: false,

    async renderWav({ download = true } = {}) {
      if (state.render.busy) return null;
      state.render = { busy: true, note: 'rendering', ok: null };
      emit();
      try {
        const track = planned(state.themeIndex);
        const buffer = await renderTrack(track);
        const blob = encodeWav(buffer);
        if (download) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `deep-house-${state.seed}-theme-${state.themeIndex + 1}.wav`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
        const note = `${formatTime(buffer.duration)} · ${(blob.size / 1048576).toFixed(1)} MB`;
        state.render = { busy: false, note, ok: true };
        emit();
        return { blob, buffer, note };
      } catch (err) {
        state.render = { busy: false, note: `failed: ${err.message}`, ok: false };
        emit();
        console.error(err);
        return null;
      }
    },

    // A clock that is not an audio context: the ring can be drawn mid-theme
    // without a gesture, which is how the headless screenshots are taken.
    mock({ playing = true, seconds = 0, transition = null, themeIndex = null } = {}) {
      if (themeIndex != null && themeIndex !== state.themeIndex) {
        state.themeIndex = themeIndex;
        replan('theme');
      }
      state.fake = true;
      state.playing = playing;
      state.position = clamp(seconds, 0, playable());
      if (transition != null) state.transition = clamp(transition, 0, 1);
      emit();
      return readout();
    },
  };

  console.info(OUT === 'silent'
    ? 'deep-house: output silent — the set ends in a gain of zero into the destination, so ' +
      'the clock, the scheduling and the capture tap are what they always are and nothing is heard.'
    : OUT === 'direct'
    ? 'deep-house: output direct — the mix goes straight to the context. No media element, ' +
      'so no lock-screen card and no background play; use ?out=element to get them back.'
    : 'deep-house: output through a media element — a lock-screen card and background play, ' +
      'at the cost of a second buffer. Use ?out=direct to hear the graph itself.');
  // A restored session is always a stopped one: the seed, the theme and the
  // bar come back, the sound does not.
  const how = restore();
  if (minutes) control.setMinutes(minutes);
  else replan(null);
  if (how !== 'fresh') { state.position = clamp(state.position, 0, Math.max(0, playable() - 0.5)); remember(); }
  // the page going away is the last chance to write down where we were
  const leave = () => { if (state.track) remember(); };
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  return control;
}

export default createControl;
