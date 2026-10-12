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

import { noiseBuffer, route, panner, MIN_RELEASE, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import type { SoundRow, Topology } from './sound.ts';
import { provePatch, rowPatch } from './sound.ts';
import { bool, contract, either, list, maybe, num, word, CENTS, DB, HZ, Q, RATIO, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import { cached, bound, offline } from './render-cache.ts';
import { strikeDice, variantK } from './drumkit.ts';
import { airPath, beadNoise, makeUp, meanSquare, ringOf, tailFor, swapDb, swapShelf, tailRamps, topLadder, topLevel, SWAP_K } from './hat-grain.ts';

/**
 * Everything that is fixed about one hat: where it sits in the stream of dice,
 * the ladder it is built on, how much of it is oscillators rather than noise,
 * the four corners of its tone and its two sends.
 */
interface HatSpec {
  tag: string;
  seed: number;
  base: number;
  detune: number;
  metal: number;
  hp: number;
  peakHz: number;
  q: number;
  tilt: number;
  lidHz: number;
  room?: number;
  delay: number;
  /** the grain (round SPARK-2, `hat-grain.ts`): the upper ladder's share of the metal, the air past the lid and its floor, the tail, the beads; nought builds nothing */
  top: number;
  air: number;
  airHz: number;
  tail: number;
  beads: number;
}

/** One strike's own: a hat, with the ring this hit was given. */
interface HatHit extends HatSpec {
  t10: number;
}

// The classic inharmonic ladder. Nothing here is a whole-number multiple of
// anything else, which is the whole point.
const RATIOS = [1, 1.5, 2.08, 2.72, 3.4, 4.11];

function metallic(ctx: BaseAudioContext, time: number, dur: number, base: number, detune: number): GainNode {
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
function tone(ctx: BaseAudioContext, spec: HatSpec): { input: BiquadFilterNode; output: BiquadFilterNode } {
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
// ctx -> Map(key -> AudioBuffer | Promise)
const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer | Promise<AudioBuffer>>>();

const toneKey = (spec: HatSpec): string => `${spec.hp}:${spec.peakHz}:${spec.q}:${spec.tilt}:${spec.lidHz}`;
// The grain's part of a key: empty where there is none, so the record's keys are the record's.
const grainKey = (spec: HatSpec, which: 'metal' | 'noise'): string => (which === 'metal'
  ? (spec.top > 0 ? `:top${spec.top}` : '')
  : `${spec.top > 0 ? `:swap${spec.top}` : ''}${spec.air > 0 ? `:air${spec.air}@${spec.airHz}` : ''}${spec.beads > 0 ? `:beads${spec.beads}` : ''}`);


// The six squares through the tone, from phase zero, at the level the hat
// mixes them in at — so a hit needs no gain of its own.
function renderMetal(ctx: BaseAudioContext, spec: HatSpec): Promise<AudioBuffer> {
  return offline(ctx, 1, Math.ceil(METAL_SECONDS * ctx.sampleRate), (off) => {
    const t = tone(off, spec);
    const at = off.createGain();
    at.gain.value = spec.metal;
    metallic(off, 0, METAL_SECONDS, spec.base, spec.detune).connect(at);
    if (spec.top > 0) topLadder(off, RATIOS, spec.base, spec.detune, topLevel(spec.top, spec.metal, SWAP_K.ladder), at, 0, METAL_SECONDS);
    at.connect(t.input);
    t.output.connect(off.destination);
  });
}

// The two seconds of noise every hit reads a different stretch of, through
// the tone. A live hit's filters started from rest at the strike; these have
// the noise before the stretch in them, which is a few hundred microseconds
// of ringing under an attack that is still at -80 dB.
function renderNoise(ctx: BaseAudioContext, spec: HatSpec): Promise<AudioBuffer> {
  const src0 = spec.beads > 0 ? beadNoise(ctx, noiseBuffer(ctx), spec.beads) : noiseBuffer(ctx);
  return offline(ctx, 2, src0.length, (off) => {
    const buf = off.createBuffer(2, src0.length, ctx.sampleRate);
    buf.copyToChannel(src0.getChannelData(0), 0);
    buf.copyToChannel(src0.getChannelData(1), 1);
    const src = off.createBufferSource();
    src.buffer = buf;
    const t = tone(off, spec);
    const at = off.createGain();
    at.gain.value = 1 - spec.metal;
    src.connect(at);
    if (spec.top > 0) {
      const shelf = swapShelf(off, swapDb(spec.top));
      at.connect(shelf);
      shelf.connect(t.input);
    } else at.connect(t.input);
    t.output.connect(off.destination);
    if (spec.air > 0) {
      // the air's own noise: the same buffer read half a length on, looped
      const own = off.createBufferSource();
      own.buffer = buf;
      own.loop = true;
      const ownAt = off.createGain();
      ownAt.gain.value = 1 - spec.metal;
      own.connect(ownAt);
      airPath(off, ownAt, spec.airHz, spec.air, off.destination);
      own.start(0, buf.duration / 2);
    }
    src.start(0);
  });
}

// The shared render cache (`render-cache.ts`, R30 of the reconciled review of
// 09-24): a render that fails leaves its key empty for the next hit to try
// again, where the rejected promise used to stay under it for the life of the
// context and every later hit built itself live; and every render is a job,
// rationed with the piano's and the drums', and started off the tick when a
// hit (`defer`) rather than the preparation asked for it.
//
// And it is bounded (the performance review of 10-06): every distinct hat tone a
// set walks through — each place's rows, each spark's grain — kept its two
// seconds of metal and of noise for the life of the context, about a megabyte a
// tone. A read refreshes an entry's place, so the hats a theme strikes are never
// the oldest, and the drums' own pattern (`DRUM_BODIES`) trims the rest.
export const HAT_RENDERS = 16;
function rendered(ctx: BaseAudioContext, key: string, make: () => Promise<AudioBuffer>, defer: boolean): AudioBuffer | Promise<AudioBuffer> {
  let per = cache.get(ctx);
  if (!per) {
    per = new Map();
    cache.set(ctx, per);
  }
  const hit = per.get(key);
  if (hit !== undefined) {
    per.delete(key);
    per.set(key, hit);
    return hit;
  }
  const got = cached(per, ctx, key, make, defer);
  bound(per, HAT_RENDERS);
  return got;
}

/** The same hat without its grain: what the level of a grained hit is held to. */
const hasGrain = (spec: HatSpec): boolean => spec.top > 0 || spec.air > 0 || spec.tail > 0 || spec.beads > 0;
const plainOf = <T extends HatSpec>(spec: T): T => ({ ...spec, top: 0, air: 0, tail: 0, beads: 0 });

function buffersFor(ctx: BaseAudioContext, spec: HatSpec, defer = false) {
  const metal = rendered(ctx, `metal:${spec.base}:${spec.detune}:${spec.metal}:${toneKey(spec)}${grainKey(spec, 'metal')}`, () => renderMetal(ctx, spec), defer);
  const noise = rendered(ctx, `noise:${spec.metal}:${toneKey(spec)}${grainKey(spec, 'noise')}`, () => renderNoise(ctx, spec), defer);
  return { metal, noise };
}

// The three hats a theme can strike, rendered before the first one. Returns
// the promise so an offline render can wait for it.
export function prepareHats(ctx: BaseAudioContext, settings: Settings): Promise<void> {
  const waits: Promise<AudioBuffer>[] = [];
  const H = settings.hats;
  const n = Math.max(1, Math.round(H.variants ?? 1));
  for (const row of ROWS) {
    for (let i = 0; i < n; i++) {
      const spec = variantOf(specOf(row, H, settings.sends), i, H);
      for (const s of hasGrain(spec) ? [spec, plainOf(spec)] : [spec]) {
        const { metal, noise } = buffersFor(ctx, s);
        if (metal instanceof Promise) waits.push(metal);
        if (noise instanceof Promise) waits.push(noise);
      }
    }
  }
  return Promise.all(waits).then(() => undefined);
}

// --- what varies from hit to hit ------------------------------------------
//
// A hat played the same every time is monotone. A hat is a pre-rendered buffer,
// so nothing here may build a filter: the variation is which of two renders a
// hit reads, how fast it reads it, how loud it is and how long it rings. None
// of it can move a hit in time, change which hats play, or cost a node — the
// hit is the same eight nodes it was.
//
// The dice are the strike time itself, so the same bar of the same theme
// always varies the same way in the mix, in a render and in a slice of a
// render; nothing here reads a seed the plan does not already have. They are
// the drum kitchen's `strikeDice` and its `variantK`, which were this file's
// own copies until round (f) of the reconciled review of 09-24 (D13): the same
// hash, the same offsets, the same centred k.

// One of `variants` tones, the same spec with its band moved a few cents. Two
// renders is one extra pair of buffers per hat at prepare time and nothing at
// all per hit.
function variantOf<T extends HatSpec>(spec: T, i: number, H: Settings['hats']): T {
  const n = Math.max(1, Math.round(H.variants ?? 1));
  if (n < 2) return spec;
  const k = variantK(i, n);
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

function hat(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams, spec0: HatHit, settings: Settings, at?: number): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const H = settings.hats;
  const vel = p.vel ?? 1;

  // Four numbers off the strike time, and nothing else: the tone this hit
  // reads, how fast it reads it, its own level and its own ring.
  //
  // Each of the three is offset in that stream so an offbeat hat and the
  // sixteenth under it are not the same hit twice. The offset is a number in
  // the spec below — `seed`, beside `base` and `detune` — and not this
  // function comparing a tag against two of the three names it knows; the
  // numbers themselves are the ones it compared to.
  // Off the event's own time in its theme where the deck says it (R74), as
  // `strike` in drumkit.ts is: the same live, rendered and after a seek.
  const { variant: rVar, rate: rRate, gain: rGain, decay: rDecay } = strikeDice(at ?? time, spec0.seed ?? 0);

  const spec = variantOf(spec0, Math.floor(rVar * Math.max(1, Math.round(H.variants ?? 1))), H);

  // A louder hit is a brighter hit — on a real hat because the stick moves the
  // bell harder, here because the buffer is read faster — and every hit is a
  // few tens of cents off its neighbours.
  const rate = Math.max(0.5, Math.min(2,
    (1 + (H.rateSpread ?? 0) * (2 * rRate - 1)) * (1 + (H.velBright ?? 0) * (vel - 0.9))));

  const t10 = spec.t10 * (1 + (H.decaySpread ?? 0) * (2 * rDecay - 1));
  const tail = tailFor(spec.tail, spec.t10);
  const ring = ringOf(tail);
  const dur = t10 * ring + 0.02;

  const g = ctx.createGain();

  const { metal, noise } = buffersFor(ctx, spec, true);
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
    // that size. It was heard as high-pitched dits following the drum, as if
    // the beat were clipping, on the one hit
    // in ten whose offset landed near the end. The read now always fits.
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.playbackRate.value = rate;
    // The read is `dur` of output, which is `dur * rate` of buffer, so the
    // rate spread has to be inside the guard that keeps a hit off the join.
    const room = Math.max(0.001, noise.duration - dur * rate - 0.01);
    n.start(time, ((at ?? time) * 7.13) % room);
    n.stop(time + dur);
    n.connect(g);
  } else {
    const metalGain = ctx.createGain();
    metalGain.gain.value = spec.metal;
    metallic(ctx, time, dur, spec.base, spec.detune).connect(metalGain);
    if (spec.top > 0) topLadder(ctx, RATIOS, spec.base, spec.detune, topLevel(spec.top, spec.metal, SWAP_K.ladder), metalGain, time, dur + 0.02);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 1 - spec.metal;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    n.loop = true;
    n.loopStart = 0;
    n.loopEnd = n.buffer.duration;
    n.start(time, ((at ?? time) * 7.13) % n.buffer.duration);
    n.stop(time + dur);
    n.connect(noiseGain);
    const t = tone(ctx, spec);
    metalGain.connect(t.input);
    if (spec.top > 0) {
      const shelf = swapShelf(ctx, swapDb(spec.top));
      noiseGain.connect(shelf);
      shelf.connect(t.input);
    } else noiseGain.connect(t.input);
    t.output.connect(g);
    if (spec.air > 0) {
      const own = ctx.createBufferSource();
      own.buffer = n.buffer;
      own.loop = true;
      own.start(time, (((at ?? time) * 7.13) + n.buffer!.duration / 2) % n.buffer!.duration);
      own.stop(time + dur);
      const ownAt = ctx.createGain();
      ownAt.gain.value = 1 - spec.metal;
      own.connect(ownAt);
      airPath(ctx, ownAt, spec.airHz, spec.air, g);
    }
  }

  // The benchmark states hat decay as the time to fall 10 dB, so that is the
  // number the envelope takes: down 10 dB at t10, then a tail of the same
  // shape. 85 ms is the washy one, 21 ms the dry one.
  // `trimDb` is the one family trim, and it is here rather than in the level
  // table because every measured preset writes its own `levels.hatClosed` and
  // `levels.shaker` and would not have seen it there. `gainSpread` is this
  // hit's own: under a decibel, which is a drummer and not a fader.
  // A grained hit at its grainless energy (round SPARK-2, `hat-grain.ts`).
  let held = 1;
  if (ready && hasGrain(spec)) {
    const plain = buffersFor(ctx, plainOf(spec), true);
    if (!(plain.metal instanceof Promise) && !(plain.noise instanceof Promise))
      held = makeUp(meanSquare(plain.metal) + meanSquare(plain.noise), meanSquare(metal as AudioBuffer) + meanSquare(noise as AudioBuffer), t10, tail, 0.0025);
  }
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * held
    * Math.pow(10, (H.trimDb ?? 0) / 20)
    * (1 + (H.gainSpread ?? 0) * (2 * rGain - 1)));
  // A *linear* attack from true zero, the kick's contract. The old curve was
  // an exponential from a ten-thousandth reaching the peak in 1.2 ms: its last
  // fraction of a millisecond crossed 60 dB, which is a step, and the step was
  // the loudest sample of the hit. 2.5 ms of ramp, and the peak is the peak.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.0025);
  // -10 dB at t10, then the record's dive to the floor at 3.4 t10 — or, with a
  // `tail` (round SPARK-2), the same slope on to -20 dB before the dive.
  const floorAt = tailRamps(g.gain, time, peak, t10, tail, GAIN_FLOOR);
  g.gain.linearRampToValueAtTime(0, floorAt + MIN_RELEASE);
  const end = floorAt + MIN_RELEASE;

  // MEASURED: the hats are the most decorrelated transient layer in the mix
  // (side -3.4 dB, L/R correlation 0.37). A pan plus a few milliseconds of
  // delay on one side is what that sounds like.
  const pan = panner(ctx, p.pan ?? 0);
  const haas = ctx.createDelay(0.05);
  haas.delayTime.value = Math.abs(p.haas ?? 0);
  const S = settings.space;
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
  route(ctx, wide, out, { dry: p.dry ?? 1, room: p.room ?? spec.room ?? 0, delay: p.delay ?? spec.delay,
    ...(p.background !== undefined ? { background: p.background } : {}),
    ...(p.reverb !== undefined ? { reverb: p.reverb } : {}) });
  return end;
}

// --- the hats as rows ---------------------------------------------------------
//
// Round R2: the three hats are rows over this topology (`sounds/noise/
// hatClosed.json`, `hatOpen.json`, `shaker.json`), and what was a table of
// three functions here is their parameters. The numbers the room voices stay
// in the room's `hats` block — the base of the ladder, the metal share, the
// lid, the rings, the dice spreads — and a row names the field it reads where
// it reads one (`metal: "metalClosed"`, `t10: "openT10"`), so a room that
// writes `hats.metalClosed` still moves the closed hat and nothing else. What
// is the hat's own is a number: its ladder against the room's base, its
// detune, its tone, its sends.

/**
 * What a row of this topology carries: exactly these, each in its range
 * (`schema.ts`). Where a field is the room's — the metal, the lid, the ring —
 * the row names the field of the room's `hats` block that holds it, out of the
 * ones that block has.
 */
const PARAMETERS = contract({
  /** the ladder's base, as a ratio of the room's `hats.base` */
  base: RATIO,
  detune: CENTS,
  /** the share of the hat that is metal: a number, or the room's field that holds it */
  metal: either(UNIT, word('metalClosed', 'metalOpen')),
  hp: HZ,
  peakHz: HZ,
  q: Q,
  tilt: DB,
  /** the lid: a number, or the room's field that holds it */
  lidHz: either(HZ, word('lidHz')),
  /** the room send, as a share of the room's `sends.hatReverb`; null is none */
  room: maybe(SEND),
  delay: SEND,
  /** the room's field that holds this hat's ring, ten decibels down */
  t10: word('closedT10', 'openT10', 'shakerT10'),
  /** a harder hit rings longer: the ring times `ring[0] + ring[1] * vel`; null is a ring that velocity does not move */
  ring: maybe(list(num(0, 8), 2)),
  /** whether the ring breathes over about twenty-four bars (`driftSeconds`, `driftAmount`) */
  drift: bool(),
  // The grain (round SPARK-2, `hat-grain.ts`): each a number, or the room's
  // field that holds it, so a place voices the closed and open hats together
  // and the shaker on its own; nought in every row and every table.
  /** the share of the hat's power over 7.5 kHz that is the upper ladder's metal rather than noise */
  top: either(num(0, 0.9), word('top')),
  /** the air past the lid, against the noise */
  air: either(UNIT, word('air', 'shakerAir')),
  /** the air's floor: two high-passes */
  airHz: HZ,
  /** the tail after -10 dB: 0 the record's choke, 1 one slope to -20 dB */
  tail: either(UNIT, word('tail', 'shakerTail')),
  /** the share of the noise that is beads */
  beads: either(UNIT, word('shakerBeads')),
});

/** What a row of this topology carries, as its contract types it. */
export type HatPatch = PatchOf<typeof PARAMETERS.fields>;

/** The rows this topology has rendered, in the registry's order: `prepareHats` warms every one of them. */
const ROWS: SoundRow[] = [];

const field = (H: Settings['hats'], v: number | string): number =>
  (typeof v === 'number' ? v : (H as unknown as Record<string, number>)[v]);
/** A grain number as the voice takes it: nought where a room has none, and never past one. */
const clampUnit = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Everything fixed about one hat but its ring, off its row and the room. */
function specOf(row: SoundRow, H: Settings['hats'], sends: Settings['sends']): HatSpec {
  // through the desk's door (D1): the row's own numbers, or a copy with a hand's moves on them
  const P = rowPatch(row, PARAMETERS);
  return {
    tag: row.id,
    seed: row.dice as number,
    base: H.base * P.base,
    detune: P.detune,
    metal: field(H, P.metal),
    hp: P.hp,
    peakHz: P.peakHz,
    q: P.q,
    tilt: P.tilt,
    lidHz: field(H, P.lidHz),
    ...(P.room === null ? {} : { room: sends.hatReverb * P.room }),
    delay: P.delay,
    top: Math.min(0.9, clampUnit(field(H, P.top))),
    air: clampUnit(field(H, P.air)),
    airHz: P.airHz,
    tail: clampUnit(field(H, P.tail)),
    beads: clampUnit(field(H, P.beads)),
  };
}

function render(row: SoundRow): VoiceRenderer {
  ROWS.push(row);
  provePatch(row.parameters, PARAMETERS, row.id);
  return (ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings, at?: number): number => {
    const P = rowPatch(row, PARAMETERS);
    const H = settings.hats;
    let t10 = p.t10 ?? field(H, P.t10);
    if (P.ring) t10 *= P.ring[0] + P.ring[1] * (p.vel ?? 1);
    if (P.drift) {
      // The open hat is the one hit long enough for its ring to be a
      // character, so its ring is the one thing that moves slowly rather than
      // hit by hit: a sine about twenty-four bars long over the decay, phased
      // off the room's own hat numbers so two rooms do not breathe together.
      const period = Math.max(4, H.driftSeconds ?? 55);
      const phase = (H.base * 0.017 + field(H, P.t10) * 11) % (2 * Math.PI);
      t10 *= 1 + (H.driftAmount ?? 0) * Math.sin((2 * Math.PI * time) / period + phase);
    }
    return hat(ctx, out, time, p, { ...specOf(row, H, settings.sends), t10 }, settings, at);
  };
}

/**
 * The hat ladder topology: six inharmonic squares beating under a
 * band-passed noise bed, both pre-rendered per room and variant and read back
 * per hit. Every row shares `prepareHats`, which warms every row's beds, and
 * all of them are the `noise` family for the same reason.
 */
export const HAT_LADDER: Topology = {
  id: 'hat-ladder',
  cost: 'mid',
  parameters: PARAMETERS,
  render,
  prepare: (ctx, settings) => prepareHats(ctx, settings),
  check: (row) => (Number.isFinite(row.dice) ? [] : [`${row.id}: a hat carries its offset in the strike dice as \`dice\``]),
};

export default HAT_LADDER;
