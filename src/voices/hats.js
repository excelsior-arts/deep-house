// Hats built the way a drum machine builds them: six square oscillators at
// inharmonic ratios, which beat against each other into something metallic,
// mixed with filtered noise for the sizzle and then band-passed hard. Plain
// white noise reads as a hiss; this reads as a cymbal, and it is what puts
// energy in 2-11 kHz where the reference sets have it.
//
// What a hit builds, though, is not six oscillators and four filters. The
// six squares are the same six squares every hit — same base, same detune,
// phase zero at the strike — and the four filters are static per hat and
// linear, so both sources are rendered through them once per context and a
// hit is two buffer sources, an envelope and a pan. MEASURED
// (measured before this change): the hats and the shaker were 47% of everything the
// audio thread did, three hits a second at 22 nodes each; a hit is now 8
// nodes and none of them a filter. The rendered WAV differs from the built
// one by -55 dB (the strike lands between two samples, and a buffer starts
// there while an oscillator starts on the frame), which no band can hear.
//
// The live chain stays as the fallback for a hit that lands before its
// buffers exist; `prepareHats` is awaited by the mix and the render paths, so
// that is only the first hits of a classic-page start.

import PARAMS from '../params.js';
import { noiseBuffer, percEnv, route, panner, MIN_RELEASE, startTime} from '../dsp.js';

// The classic inharmonic ladder. Nothing here is a whole-number multiple of
// anything else, which is the whole point.
const RATIOS = [1, 1.5, 2.08, 2.72, 3.4, 4.11];

function metallic(ctx, time, dur, base, detune) {
  const bus = ctx.createGain();
  bus.gain.value = 1 / RATIOS.length;
  for (let i = 0; i < RATIOS.length; i++) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * RATIOS[i];
    o.detune.value = detune * (i % 2 ? 1 : -1);
    o.connect(bus);
    o.start(time);
    o.stop(time + dur + 0.02);
  }
  return bus;
}

// The hat's tone: a highpass, the band it peaks in, a shelf, and a lid on
// the whole family — real hats in this music are duller than a synthesised
// one wants to be. Built the same way for a live hit and for the offline pass.
function tone(ctx, spec) {
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = spec.hp;
  high.Q.value = 0.8;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = spec.peakHz;
  band.Q.value = spec.q;

  const tilt = ctx.createBiquadFilter();
  tilt.type = 'highshelf';
  tilt.frequency.value = 9000;
  tilt.gain.value = spec.tilt;

  const lid = ctx.createBiquadFilter();
  lid.type = 'lowpass';
  lid.frequency.value = spec.lidHz;
  lid.Q.value = 0.6;

  high.connect(band);
  band.connect(tilt);
  tilt.connect(lid);
  return { input: high, output: lid };
}

// --- the rendered sources ------------------------------------------------

const METAL_SECONDS = 2; // longer than any hat: the open hat rings 0.6 s
const cache = new WeakMap(); // ctx -> Map(key -> AudioBuffer | Promise)

const toneKey = (spec) => `${spec.hp}:${spec.peakHz}:${spec.q}:${spec.tilt}:${spec.lidHz}`;

function Offline() {
  return globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
}

// The six squares through the tone, from phase zero, at the level the hat
// mixes them in at — so a hit needs no gain of its own.
function renderMetal(ctx, spec) {
  const rate = ctx.sampleRate;
  const off = new (Offline())(1, Math.ceil(METAL_SECONDS * rate), rate);
  const t = tone(off, spec);
  const at = off.createGain();
  at.gain.value = spec.metal;
  metallic(off, 0, METAL_SECONDS, spec.base, spec.detune).connect(at);
  at.connect(t.input);
  t.output.connect(off.destination);
  return off.startRendering();
}

// The two seconds of noise every hit reads a different stretch of, through
// the tone. A live hit's filters started from rest at the strike; these have
// the noise before the stretch in them, which is a few hundred microseconds
// of ringing under an attack that is still at -80 dB.
function renderNoise(ctx, spec) {
  const src0 = noiseBuffer(ctx);
  const off = new (Offline())(2, src0.length, ctx.sampleRate);
  const buf = off.createBuffer(2, src0.length, ctx.sampleRate);
  buf.copyToChannel(src0.getChannelData(0), 0);
  buf.copyToChannel(src0.getChannelData(1), 1);
  const src = off.createBufferSource();
  src.buffer = buf;
  const t = tone(off, spec);
  const at = off.createGain();
  at.gain.value = 1 - spec.metal;
  src.connect(at);
  at.connect(t.input);
  t.output.connect(off.destination);
  src.start(0);
  return off.startRendering();
}

function rendered(ctx, key, make) {
  let per = cache.get(ctx);
  if (!per) {
    per = new Map();
    cache.set(ctx, per);
  }
  let got = per.get(key);
  if (got === undefined) {
    got = make().then((buf) => {
      per.set(key, buf);
      return buf;
    });
    per.set(key, got);
  }
  return got;
}

function buffersFor(ctx, spec) {
  const metal = rendered(ctx, `metal:${spec.base}:${spec.detune}:${spec.metal}:${toneKey(spec)}`, () => renderMetal(ctx, spec));
  const noise = rendered(ctx, `noise:${spec.metal}:${toneKey(spec)}`, () => renderNoise(ctx, spec));
  return { metal, noise };
}

// The three hats a theme can strike, rendered before the first one. Returns
// the promise so an offline render can wait for it.
export const __hatCache = (ctx) => cache.get(ctx) || new Map();

export function prepareHats(ctx) {
  const waits = [];
  const n = Math.max(1, Math.round(PARAMS.hats.variants ?? 1));
  for (const make of Object.values(SPECS)) {
    for (let i = 0; i < n; i++) {
      const { metal, noise } = buffersFor(ctx, variantOf(make(PARAMS.hats), i));
      if (metal instanceof Promise) waits.push(metal);
      if (noise instanceof Promise) waits.push(noise);
    }
  }
  return Promise.all(waits).then(() => undefined);
}

// --- what varies from hit to hit ------------------------------------------
//
// Eugene: "a fairly monotone flavour to them". A hat is a pre-rendered buffer,
// so nothing here may build a filter: the variation is which of two renders a
// hit reads, how fast it reads it, how loud it is and how long it rings. None
// of it can move a hit in time, change which hats play, or cost a node — the
// hit is the same eight nodes it was.
//
// The dice are the strike time itself, so the same bar of the same theme
// always varies the same way in the mix, in a render and in a slice of a
// render; nothing here reads a seed the plan does not already have.
function hash(x) {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// One of `variants` tones, the same spec with its band moved a few cents. Two
// renders is one extra pair of buffers per hat at prepare time and nothing at
// all per hit.
function variantOf(spec, i) {
  const H = PARAMS.hats;
  const n = Math.max(1, Math.round(H.variants ?? 1));
  if (n < 2) return spec;
  const k = (i % n) - (n - 1) / 2;
  const cents = (H.variantCents ?? 0) * k;
  const m = Math.pow(2, cents / 1200);
  return {
    ...spec,
    base: spec.base * m,
    peakHz: spec.peakHz * m,
    hp: spec.hp * Math.pow(m, 0.5),
    // The two renders are not the same cymbal a little detuned: their partials
    // beat against each other differently, which is what a second hi-hat in a
    // drum machine actually is.
    detune: spec.detune * (1 + 0.35 * k),
  };
}

// --- one hit ---------------------------------------------------------------

function hat(ctx, out, time, p, spec0) {
  time = startTime(ctx, time); // never in the past: a step if it is
  const H = PARAMS.hats;
  const vel = p.vel ?? 1;

  // Four numbers off the strike time, and nothing else: the tone this hit
  // reads, how fast it reads it, its own level and its own ring.
  const seed = time * 1000 + (spec0.tag === 'open' ? 31.7 : spec0.tag === 'shaker' ? 61.3 : 0);
  const rVar = hash(seed);
  const rRate = hash(seed + 7.77);
  const rGain = hash(seed + 19.19);
  const rDecay = hash(seed + 41.41);

  const spec = variantOf(spec0, Math.floor(rVar * Math.max(1, Math.round(H.variants ?? 1))));

  // A louder hit is a brighter hit — on a real hat because the stick moves the
  // bell harder, here because the buffer is read faster — and every hit is a
  // few tens of cents off its neighbours.
  const rate = Math.max(0.5, Math.min(2,
    (1 + (H.rateSpread ?? 0) * (2 * rRate - 1)) * (1 + (H.velBright ?? 0) * (vel - 0.9))));

  const t10 = spec.t10 * (1 + (H.decaySpread ?? 0) * (2 * rDecay - 1));
  const dur = t10 * 3.4 + 0.02;

  const g = ctx.createGain();

  const { metal, noise } = buffersFor(ctx, spec);
  const ready = !(metal instanceof Promise) && !(noise instanceof Promise) && dur * rate + 0.02 <= METAL_SECONDS;
  if (ready) {
    // Both sources already carry their mix level and the tone: straight into
    // the envelope.
    const m = ctx.createBufferSource();
    m.buffer = metal;
    m.playbackRate.value = rate;
    m.start(time);
    m.stop(time + dur + 0.02);
    m.connect(g);
    // Start at a different point each time so repeated hats are not identical
    // — but never near enough to the end to wrap.
    //
    // This buffer is band-passed and lidded at 8.5 kHz, so it steps by very
    // little from one sample to the next; its two ends do not match, and a hit
    // that looped over the join put a broadband edge into an otherwise smooth
    // signal. Unfiltered white noise, which is what this was before it was
    // pre-rendered, has no such join to hear — every sample is already a step
    // that size. Eugene heard the result as "high-pitch dits-dits following
    // the drum, so it sounds like the drum beat is clipping", on the one hit
    // in ten whose offset landed near the end. The read now always fits.
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.playbackRate.value = rate;
    // The read is `dur` of output, which is `dur * rate` of buffer, so the
    // rate spread has to be inside the guard that keeps a hit off the join.
    const room = Math.max(0.001, noise.duration - dur * rate - 0.01);
    n.start(time, (time * 7.13) % room);
    n.stop(time + dur);
    n.connect(g);
  } else {
    const metalGain = ctx.createGain();
    metalGain.gain.value = spec.metal;
    metallic(ctx, time, dur, spec.base, spec.detune).connect(metalGain);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 1 - spec.metal;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    n.loop = true;
    n.loopStart = 0;
    n.loopEnd = n.buffer.duration;
    n.start(time, (time * 7.13) % n.buffer.duration);
    n.stop(time + dur);
    n.connect(noiseGain);
    const t = tone(ctx, spec);
    metalGain.connect(t.input);
    noiseGain.connect(t.input);
    t.output.connect(g);
  }

  // The benchmark states hat decay as the time to fall 10 dB, so that is the
  // number the envelope takes: down 10 dB at t10, then a tail of the same
  // shape. 85 ms is the washy one, 21 ms the dry one.
  // `trimDb` is the one family trim, and it is here rather than in the level
  // table because every measured preset writes its own `levels.hatClosed` and
  // `levels.shaker` and would not have seen it there. `gainSpread` is this
  // hit's own: under a decibel, which is a drummer and not a fader.
  const peak = Math.max(0.0002, vel * (p.gain ?? 1)
    * Math.pow(10, (H.trimDb ?? 0) / 20)
    * (1 + (H.gainSpread ?? 0) * (2 * rGain - 1)));
  // A *linear* attack from true zero, the kick's contract. The old curve was
  // an exponential from a ten-thousandth reaching the peak in 1.2 ms: its last
  // fraction of a millisecond crossed 60 dB, which is a step, and the step was
  // the loudest sample of the hit. 2.5 ms of ramp, and the peak is the peak.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.0025);
  g.gain.exponentialRampToValueAtTime(peak * 0.3162, time + t10);
  g.gain.exponentialRampToValueAtTime(0.0002, time + t10 * 3.4);
  g.gain.linearRampToValueAtTime(0, time + t10 * 3.4 + MIN_RELEASE);
  const end = time + t10 * 3.4 + MIN_RELEASE;

  // MEASURED: the hats are the most decorrelated transient layer in the mix
  // (side -3.4 dB, L/R correlation 0.37). A pan plus a few milliseconds of
  // delay on one side is what that sounds like.
  const pan = panner(ctx, p.pan ?? 0);
  const haas = ctx.createDelay(0.05);
  haas.delayTime.value = Math.abs(p.haas ?? 0);
  const S = PARAMS.space;
  const haasPan = panner(ctx, (p.pan ?? 0) > 0 ? -S.hatHaasPan : S.hatHaasPan);
  const haasGain = ctx.createGain();
  haasGain.gain.value = S.hatHaasLevel;

  g.connect(pan);
  g.connect(haas);
  haas.connect(haasPan);
  haasPan.connect(haasGain);
  const wide = ctx.createGain();
  wide.gain.value = 1;
  pan.connect(wide);
  haasGain.connect(wide);
  route(ctx, wide, out, { dry: 1, room: spec.room ?? 0, delay: spec.delay });
  return end;
}

// The three hats, as what is fixed about each: everything but the decay,
// which a hit sets from its velocity.
const SPECS = {
  closed: (H) => ({
    tag: 'closed',
    base: H.base,
    detune: 8,
    metal: H.metalClosed,
    hp: 3800,
    peakHz: 7200,
    q: 0.3,
    tilt: 2,
    lidHz: H.lidHz,
    // No `room`, so this hat has no reverb send. It used to declare
    // `reverb: 0.05`, which `hat()` never read — it routes `room` — so the
    // number was a comment that looked like a control. Routing it now would
    // put a send on the closed hat that the band balance was never measured
    // with; if the hats should have a room it is a `room:` here and a
    // measurement to set it, not a key that was already there.
    delay: 0,
  }),
  // MEASURED nothing here; GENRE: an open hat rings 200-400 ms, and that ring
  // is most of what makes a house loop breathe.
  open: (H) => ({
    tag: 'open',
    base: H.base * 0.97,
    detune: 14,
    metal: H.metalOpen,
    hp: 3400,
    peakHz: 6600,
    q: 0.3,
    tilt: 2,
    lidHz: H.lidHz,
    // As above: declared a reverb this voice does not route. The open hat's
    // length is its character here, and the delay send below is real.
    delay: 0.07,
  }),
  // The sixteenth layer: a shaker, so it is a different timbre from the hat
  // rather than a quieter copy of it.
  shaker: (H) => ({
    tag: 'shaker',
    base: H.base * 1.31,
    detune: 20,
    metal: 0.18,
    hp: 3200,
    peakHz: 5800,
    q: 0.3,
    tilt: 2,
    lidHz: H.lidHz,
    room: PARAMS.sends.hatReverb * 0.7,
    delay: 0,
  }),
};

export function hatClosed(ctx, out, time, p = {}) {
  const H = PARAMS.hats;
  return hat(ctx, out, time, p, {
    ...SPECS.closed(H),
    t10: (p.t10 ?? H.closedT10) * (0.82 + 0.36 * (p.vel ?? 1)),
  });
}

// The open hat is the one hit long enough for its ring to be a character, so
// its ring is the one thing that moves slowly rather than hit by hit: a sine
// about twenty-four bars long over the decay, phased off the preset's own hat
// numbers so two presets do not breathe together. Sixteen bars of a loop are
// still sixteen bars of the same loop; this is what keeps them from being
// sixteen bars of the same *sample*.
export function hatOpen(ctx, out, time, p = {}) {
  const H = PARAMS.hats;
  const period = Math.max(4, H.driftSeconds ?? 55);
  const phase = (H.base * 0.017 + H.openT10 * 11) % (2 * Math.PI);
  const drift = 1 + (H.driftAmount ?? 0) * Math.sin((2 * Math.PI * time) / period + phase);
  return hat(ctx, out, time, p, { ...SPECS.open(H), t10: (p.t10 ?? H.openT10) * drift });
}

export function shaker(ctx, out, time, p = {}) {
  const H = PARAMS.hats;
  return hat(ctx, out, time, p, { ...SPECS.shaker(H), t10: p.t10 ?? H.shakerT10 });
}
