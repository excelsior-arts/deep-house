// Small Web Audio helpers shared by every voice. Everything is built from
// oscillators, generated noise and curves: no sample files anywhere.

const noiseCache = new WeakMap();
const irCache = new WeakMap();
const curveCache = new Map();

export const MIN_RELEASE = 0.004; // never let a gain jump; 4 ms is inaudible

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
export const renderHead = (ctx) => ctx.currentTime + (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
let lateStarts = 0;
let lateLogged = 0;
let lateLast = 0; // seconds the last late note was moved by
let lateAt = 0; // when, on the context's clock
let lateCause = null; // 'resume' when the last one was attributed to a start
// When the transport last put a record on, on the context's clock. A start
// that lands its first notes behind the render head is a fault in the
// transport and not a stumble on the machine, and the two read identically in
// a count — so a late note inside this window of a start says which it was,
// and a log kept a month from now can tell them apart. With the transport's
// own lead (`START_LEAD` in mix.js) it should never be written at all.
let startedAt = -Infinity;
const RESUME_WINDOW = 0.2;
export function noteTransportStart(ctx) {
  startedAt = ctx.currentTime;
}
export const lateLeads = [];
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
export function resolveStart(ctx, time) {
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

export function startTime(ctx, time) {
  if (lateLeads.length < 4096) lateLeads.push(+(time - ctx.currentTime).toFixed(5));
  return resolveStart(ctx, time);
}
export const lateCount = () => lateStarts;
// How many, and the last one: what a bench or a subscriber is shown.
export const lateInfo = () => ({ count: lateStarts, last: +lateLast.toFixed(4), at: +lateAt.toFixed(2), cause: lateCause });
// What the scheduler actually managed, so a loaded page can be asked.
export function leadStats() {
  const v = lateLeads.slice().sort((a, b) => a - b);
  const q = (f) => (v.length ? v[Math.min(v.length - 1, Math.floor(f * v.length))] : NaN);
  return { notes: v.length, late: lateStarts, min: q(0), p05: q(0.05), p50: q(0.5), max: q(0.999) };
}

// How much of the noise buffer's right channel is its left one. Read here
// rather than from PARAMS because the buffer is built once per context and
// must not change under a preset.
const NOISE_CORR = 0.62;

export function dbToGain(db) {
  return Math.pow(10, db / 20);
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
export function noiseBuffer(ctx) {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 2);
  buf = ctx.createBuffer(2, len, ctx.sampleRate);
  // Deterministic noise, so the live take and the rendered WAV match sample
  // for sample as closely as the two contexts allow.
  let s = 22222;
  const c = NOISE_CORR;
  const k = Math.sqrt(1 - c * c);
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    left[i] = s / 2147483648 - 1;
  }
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    right[i] = c * left[i] + k * (s / 2147483648 - 1);
  }
  noiseCache.set(ctx, buf);
  return buf;
}

export function noiseSource(ctx, when, duration) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  // Start at a different point each time so repeated hats are not identical.
  src.loopStart = 0;
  src.loopEnd = src.buffer.duration;
  const offset = (when * 7.13) % src.buffer.duration;
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
export function impulseResponse(ctx, seconds = 2.4, decay = 3.2, tag = 'hall', corr = 0) {
  let per = irCache.get(ctx);
  if (!per) {
    per = new Map();
    irCache.set(ctx, per);
  }
  const key = `${tag}:${seconds}:${decay}:${corr}`;
  if (per.has(key)) return per.get(key);
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
export function softClipCurve(drive = 1.4, knee = 0.8, n = 4096) {
  const key = `clip:${drive}:${knee}:${n}`;
  if (curveCache.has(key)) return curveCache.get(key);
  const curve = new Float32Array(n);
  const head = 1 - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    // Slope exactly 1 at the knee, so there is no seam, and a ceiling of
    // knee + head/drive however hard it is hit.
    curve[i] = a <= knee ? x : Math.sign(x) * (knee + (head / drive) * Math.tanh((drive * (a - knee)) / head));
  }
  curveCache.set(key, curve);
  return curve;
}

// Gentle asymmetric saturation for the sub, so it has a little grit on a
// laptop speaker without losing the fundamental.
export function saturationCurve(amount = 0.35, n = 2048) {
  const key = `sat:${amount}:${n}`;
  if (curveCache.has(key)) return curveCache.get(key);
  const curve = new Float32Array(n);
  const k = amount * 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  curveCache.set(key, curve);
  return curve;
}

// Asymmetric shaping. A tanh is odd-symmetric, so it only ever grows the 3rd,
// 5th, 7th harmonic — which is why a driven sine gets reedy but never gains a
// 2nd harmonic. Bending the curve's two halves differently is what puts the
// octave-above partial in, and the benchmarks have a lot of it.
export function evenCurve(amount = 0.2, n = 2048) {
  const key = `even:${amount}:${n}`;
  if (curveCache.has(key)) return curveCache.get(key);
  const curve = new Float32Array(n);
  const a = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = (x + a * x * x) / (1 + a);
  }
  curveCache.set(key, curve);
  return curve;
}

// A percussive envelope: silence -> peak over `attack`, then an exponential
// fall, then a short linear ramp to true zero so nothing ever cuts.
export function percEnv(gain, when, peak, attack, decay) {
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
  g.linearRampToValueAtTime(Math.max(0.0002, peak), when + a);
  g.exponentialRampToValueAtTime(0.0001, when + a + d);
  g.linearRampToValueAtTime(0, when + a + d + MIN_RELEASE);
  return when + a + d + MIN_RELEASE;
}

// A sustained envelope for notes with a length: attack, hold, release.
export function noteEnv(gain, when, peak, attack, hold, release) {
  const g = gain.gain;
  // Silent until its first scheduled event, whenever that turns out to be.
  g.value = 0;
  const a = Math.max(0.003, attack);
  const r = Math.max(MIN_RELEASE, release);
  const h = Math.max(0.01, hold);
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(Math.max(0.0002, peak), when + a);
  g.setValueAtTime(Math.max(0.0002, peak), when + a + h);
  g.exponentialRampToValueAtTime(0.0002, when + a + h + r);
  g.linearRampToValueAtTime(0, when + a + h + r + MIN_RELEASE);
  return when + a + h + r + MIN_RELEASE;
}

// An attack, a fall to a sustain fraction, a hold and a release. Most
// instruments have a decay leg; `noteEnv` has none, and a chord layer held at
// its attack level for two bars is the most obviously synthetic thing a
// generator can do.
export function adsrEnv(gain, when, peak, { attack, decay, sustain, hold, release }) {
  const g = gain.gain;
  // Silent until its first scheduled event, whenever that turns out to be.
  g.value = 0;
  const a = Math.max(0.003, attack);
  const d = Math.max(0.005, decay);
  const r = Math.max(MIN_RELEASE, release);
  const h = Math.max(0, hold);
  const p = Math.max(0.0002, peak);
  const s = Math.max(0.0002, peak * sustain);
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(p, when + a);
  g.exponentialRampToValueAtTime(s, when + a + d);
  if (h > 0) g.setValueAtTime(s, when + a + d + h);
  g.exponentialRampToValueAtTime(0.0002, when + a + d + h + r);
  g.linearRampToValueAtTime(0, when + a + d + h + r + MIN_RELEASE);
  return when + a + d + h + r + MIN_RELEASE;
}

// Connect a source to the dry bus and to the sends at the given amounts.
//
// A dry level of exactly 1 is a wire: the note goes straight to the bus. A
// unity gain is a node the audio thread visits every quantum for nothing, and
// every note used to carry one.
export function route(ctx, node, out, { dry = 1, delay = 0, reverb = 0, room = 0, hall = 0 } = {}) {
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
}

// An LFO whose phase is set, so a seeded track starts its movement in the same
// place every time instead of wherever the oscillator happens to begin.
//
// The wave is cached, quantised to a sixty-fourth of a turn. Building a
// PeriodicWave means allocating and normalising a wavetable, and the strings
// alone ask for four per note: on a live page that was enough to starve the
// scheduler, and a starved scheduler is a mix that never reaches its next
// theme.
const lfoWaves = new WeakMap();
const LFO_STEPS = 64;
export function phasedLfo(ctx, hz, phase = 0) {
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

export function panner(ctx, pan) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  return p;
}
