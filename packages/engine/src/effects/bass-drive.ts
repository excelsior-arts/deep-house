// Bass drive, in parallel: the clean bass passes untouched and a driven copy
// of it is summed in underneath, high-passed on both sides of the clip so the
// sub stays the clean one's and low-passed after it so the edge sits in the
// low mids.
//
//   input -+---------------------------------------------------------------------------------+-> wet
//          +-> pre (high-pass) -> drive -> clip -> make-up -> floor (high-pass x2) -> tone (low-pass) -> blend -+
//
// The tone sits where the bass is: at a fixed 1.4 kHz Eugene heard the edge
// "a bit too mid-frequency" on the deep four (10-02), and the band a low,
// dark track wants is an octave under a bright one's. So the composer sets
// the corner off the theme's own bass register — the place's harmonic of the
// bass part's lowest notes — and Gleam moves it from three quarters of that
// to twice it (`knobs` below).
//
// Round B1 of the bass (Eugene, 09-29: *"the bass drive in parallel: the
// original bass plus a driven copy, so it keeps its weight with the lo-fi
// edge; distorted alone it loses it"*). Every drive in this kitchen is an
// insert — what goes in comes out changed — and a bass through one of them
// comes out lighter, because a clipper takes the peaks off the fundamental and
// the fundamental *is* the weight. So this one is not an insert on the bass:
// it is a second bass beside the first, made of the first, and the first is
// never touched. Three things make that true rather than claimed:
//
//   the clean path    the input straight to the wet, through nothing. At a
//                     blend of nought the output is the input through one gain
//                     at one.
//   the floor         two Butterworth high-passes after the clip, at `floorHz`
//                     (24 dB an octave). A clipper regenerates the fundamental
//                     it was fed — a tanh of a sine is a squarer sine at the
//                     same pitch — and its even harmonics leave a standing
//                     offset; both would land on the sub band and move it, so
//                     neither leaves this path. MEASURED on the round's four
//                     themes (`notes/rounds/bass-b1.md`): with the copy summed
//                     in at the table's blend the band under 100 Hz moves by
//                     0.13 dB at most, and the copy's own share of it stands
//                     25-34 dB under the mix's.
//   the pre-filter    one high-pass at `preHz` before the drive, under the
//                     bass's own register: it takes the record's lowest octave
//                     and the body's offset off the clipper's input so the
//                     deepest note does not own it, and leaves the note itself
//                     to be driven — a sub is a sine, and the only edge a sine
//                     has is the harmonics a clip makes of it.
//
// The curve is the overdrive's (`curves.ts`, asymmetric, normalised to full
// scale): even harmonics as well as odd, which is the warm half of the word.
// **The make-up is computed off the curve at a stated input level**, so the
// drive is a colour and the blend is the level, as every drive in this
// kitchen has it — only here the table is not measured through a browser but
// worked out from the curve itself: a sine at `REFERENCE_DBFS`, the level the
// bass's fundamental reaches this insert at (MEASURED, round B1: a note gain
// of 0.19 under a bus level of -12.5 dB is -27 dBFS at the bus, and the
// pre-filter takes three off a note in the bass's register), is put through
// the curve at the drive asked for and its RMS read; the make-up brings that
// back to the sine's own RMS, lifted by `EDGE_LIFT_DB`. The lift is what the
// floor takes: the fundamental, which is most of a squared copy, so that **a
// blend of one is an edge as loud as the bass** — MEASURED on the round's
// themes: the copy's loudest third stands 2.4 dB under the fundamental's at
// one, and 9 under it at the table's 0.4 — a half an edge six decibels under
// the bass, a quarter twelve. `blend` is against the bass
// and never against full scale. What was tried first and why not
// (`notes/rounds/bass-b1.md`): bounded by its blend in full scale, a copy at
// -12 dBFS met a bass at -27 and the band 100-300 Hz rose 2.4-8.2 dB at a
// quarter while the sub lost up to 1.4 dB to the compressor and the glue
// behind it; at one over the drive alone, the level followed the drive by ten
// decibels between a half and one, which is the fault a make-up table exists
// to remove. The weight is the clean path's and stays whatever the room gave
// it.
//
// It is a bus insert on the bass bus (`master.ts` builds it between the bus
// and the body filter when a theme's settings ask for it, `bass.parallel`),
// never a rota draw: the rota treats the harmonic lanes and the sub never
// takes a treatment. Where it is heard is the composer's table
// (`styles/deep-house-places.ts`, `BASS_DRIVE`): the fast, bass-forward
// side, where a held wobble and a rolling reese want grit — not the slow
// side, where Eugene heard it out of place (10-02).

import { shell, knob } from './shell.ts';
import { build as lfoParam } from './lfo-param.ts';
import { overdriveCurve } from './curves.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/**
 * How much gain the drive parameter buys, **in decibels and not as a gain**:
 * 0 is a wire into the curve and 1 is forty decibels. MEASURED (round B1, the
 * round's first spell, three themes): the bass reaches its bus near -27 dBFS — a note
 * gain of 0.19 under a bus level of -12.5 dB — and the pre-filter takes its
 * fundamental further down, so a drive of eighteen decibels (the bus drive's
 * range) left the copy a quieter clean bass: the band under 300 Hz moved by a
 * tenth of a decibel at any blend. Forty decibels is what puts a sub into a
 * tanh, and a knob in decibels is one whose lower half does something.
 */
const DRIVE_DB = 40;
const driveGain = (drive: number): number => Math.pow(10, (Math.max(0, Math.min(1, drive)) * DRIVE_DB) / 20);
/** The curve: the overdrive's tanh, hardness 3, the negative half saturating at 0.7. */
const CURVE = { k: 3, bend: 0.3 };
/** The level the bass's fundamental reaches this insert at, in dBFS: MEASURED (above). */
const REFERENCE_DBFS = -30;
const A_REF = Math.pow(10, REFERENCE_DBFS / 20);
/**
 * What the floor takes off a squared copy, and what the edge is then lifted
 * by so a blend of one is an edge as loud as the bass: MEASURED (the round's
 * themes, the copy's loudest third against the bass's fundamental's third).
 */
const EDGE_LIFT_DB = 19;
const EDGE_LIFT = Math.pow(10, EDGE_LIFT_DB / 20);

/**
 * The RMS of a sine of amplitude `amp` through the curve, its offset taken
 * out (the floor takes the offset, so it is not level). The shaper clamps its
 * input to the table's ends, and so does this.
 */
function rmsThrough(curve: Float32Array, amp: number): number {
  const n = 1024;
  const ys = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, amp * Math.sin((2 * Math.PI * i) / n)));
    const u = ((x + 1) / 2) * (curve.length - 1);
    const j = Math.floor(u);
    const t = u - j;
    const y = curve[j] + (curve[Math.min(curve.length - 1, j + 1)] - curve[j]) * t;
    ys[i] = y;
    mean += y / n;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (ys[i] - mean) ** 2;
  return Math.sqrt(sum / n);
}

/** The make-up at a drive: the reference sine's RMS over what the curve made of it, lifted. */
function makeupGain(curve: Float32Array, drive: number): number {
  const out = rmsThrough(curve, driveGain(drive) * A_REF);
  return (EDGE_LIFT * (A_REF / Math.SQRT2)) / Math.max(1e-9, out);
}

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: 0 });

  // The clean bass, through nothing, to the wet: the shell's wet gain is the
  // one node it passes, and at the shell's mix of one that gain is one.
  sh.input.connect(sh.wet);

  const pre = ctx.createBiquadFilter();
  pre.type = 'highpass';
  pre.Q.value = -3.01;
  pre.frequency.value = p.preHz;
  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const curve = overdriveCurve(CURVE.k, CURVE.bend);
  shaper.curve = curve;
  shaper.oversample = descriptor.oversample || 'none';
  const floor1 = ctx.createBiquadFilter();
  floor1.type = 'highpass';
  floor1.Q.value = -3.01;
  floor1.frequency.value = p.floorHz;
  const floor2 = ctx.createBiquadFilter();
  floor2.type = 'highpass';
  floor2.Q.value = -3.01;
  floor2.frequency.value = p.floorHz;
  // Two stages, 24 dB an octave, so the band has a top and not a slope: at
  // one stage a corner at 460 Hz still let the ninth harmonic through at
  // -9 dB, which is the mid-range Eugene heard.
  const tone1 = ctx.createBiquadFilter();
  tone1.type = 'lowpass';
  tone1.Q.value = -3.01;
  tone1.frequency.value = p.toneHz;
  const tone2 = ctx.createBiquadFilter();
  tone2.type = 'lowpass';
  tone2.Q.value = -3.01;
  tone2.frequency.value = p.toneHz;
  const makeup = ctx.createGain();
  const blend = ctx.createGain();

  // **The side door** (round DUB-4): a second way into the copy that does not
  // pass the clean path, for a part a place sends to the drive alone (the
  // reese's ride notes, `voices/reese.ts`). With `side` at one the bus feeds
  // only the clean path and the copy hears the side door alone, so the part on
  // the bus is never driven and the part at the door is never heard clean; at
  // nought, every theme so far, the bus feeds both and the door is a gain
  // nothing plays into.
  const side = ctx.createGain();
  side.connect(pre);
  if (!p.side) sh.input.connect(pre);
  pre.connect(drive);
  drive.connect(shaper);
  shaper.connect(makeup);
  makeup.connect(floor1);
  floor1.connect(floor2);
  floor2.connect(tone1);
  tone1.connect(tone2);
  tone2.connect(blend);
  blend.connect(sh.wet);
  sh.nodes.push(side, pre, drive, shaper, makeup, floor1, floor2, tone1, tone2, blend);

  // **The wobble** (round B1, Eugene: the edge was "repetitive as hell"): the
  // corner ridden by `lfoParam` — the kitchen's own modulator, its output a
  // signal summed into an AudioParam — at `wobbleBeats` a cycle on the grid
  // the graph was built on, `wobbleDepth` of the corner either side of it,
  // started at `at`, which the deck makes the theme's first bar line, so the
  // phase is the bar's: at 0.75 of a turn the corner is shut on the line and
  // opens into the bar, dubstep's own gesture. A depth or a period of nought
  // builds nothing, and the house asks for nothing.
  let wobble: EffectInstance | null = null;
  if (p.wobbleDepth > 0 && p.wobbleBeats > 0 && p.beat) {
    wobble = lfoParam(ctx, settings, {
      rateBeats: p.wobbleBeats, depth: p.wobbleDepth * p.toneHz, offset: 0, shape: 0, phase: p.wobblePhase, beat: p.beat,
    }, at);
    wobble.output.connect(tone1.frequency);
    wobble.output.connect(tone2.frequency);
  }

  const driveKnob = knob(ctx, drive.gain, driveGain(p.drive));
  const makeupKnob = knob(ctx, makeup.gain, makeupGain(curve, p.drive));
  const blendKnob = knob(ctx, blend.gain, p.blend);
  const floorKnobs = [knob(ctx, floor1.frequency, p.floorHz), knob(ctx, floor2.frequency, p.floorHz)];
  const toneKnobs = [knob(ctx, tone1.frequency, p.toneHz), knob(ctx, tone2.frequency, p.toneHz)];

  return {
    input: sh.input,
    output: sh.output,
    side,
    params: guardParams(descriptor, {
      blend: (v, at, over) => blendKnob(Math.max(0, Math.min(1, v)), at, over),
      drive: (v, at, over) => {
        driveKnob(driveGain(v), at, over);
        makeupKnob(makeupGain(curve, v), at, over);
      },
      preHz: pre.frequency,
      // The two floor stages share one corner: a setter, so one write moves both.
      floorHz: (v, at, over) => { for (const k of floorKnobs) k(v, at, over); },
      toneHz: (v, at, over) => {
        for (const k of toneKnobs) k(v, at, over);
        if (wobble) (wobble.params.depth as (v: number, at?: number, over?: number) => void)(p.wobbleDepth * v, at, over);
      },
      wobbleBeats: (v, at, over) => { if (wobble) (wobble.params.rateBeats as (v: number, at?: number, over?: number) => void)(v, at, over); },
      wobbleDepth: (v, at, over) => { p.wobbleDepth = v; if (wobble) (wobble.params.depth as (v: number, at?: number, over?: number) => void)(v * p.toneHz, at, over); },
      wobblePhase: (v) => { if (wobble) (wobble.params.phase as (v: number) => void)(v); },
      // where the copy is fed is the graph's shape, set once when it is built
      side: () => {},
      mix: sh.setMix,
    }),
    setBypass: (on, at, over) => { sh.setBypass(on, at, over); wobble?.setBypass(on, at, over); },
    dispose: (at) => { sh.dispose(at); wobble?.dispose(at); },
  };
}

export const descriptor: EffectDescriptor = {
  id: 'bassDrive',
  family: 'drive',
  scope: 'bus',
  // The bass bus, and the family a part's own insert would carry it on.
  // Nothing else: a parallel copy with its floor at 150 Hz is a bass tool, and
  // on a kit or a chord it is a different effect with the same name.
  applies: ['sub', 'bass'],
  params: {
    /** the edge's level against the clean bass: 0 is off, 1 is an edge as loud as the bass, a half is six decibels under it */
    blend: { unit: 'ratio', min: 0, max: 1, default: 0.4, rate: 'a' },
    /** 0 to 1 over forty decibels into the clip; 0.75 is thirty, which squares a sub at the bus's level */
    drive: { unit: 'ratio', min: 0, max: 1, default: 0.75, rate: 'a' },
    /** the high-pass before the clip: what the drive is fed */
    preHz: { unit: 'hz', min: 30, max: 400, default: 60, rate: 'a' },
    /** the two high-passes after it: under this the copy carries nothing */
    floorHz: { unit: 'hz', min: 80, max: 400, default: 150, rate: 'a' },
    /** the two low-passes after that: over this the edge is fizz. The place sets it off the theme's bass register */
    toneHz: { unit: 'hz', min: 250, max: 8000, default: 600, rate: 'a' },
    /** the wobble's period in beats on the grid: 0 is none, 2 a half-note wobble, 0.5 an eighth */
    wobbleBeats: { unit: 'beats', min: 0, max: 16, default: 0, rate: 'k' },
    /** how far the corner swings either side of itself, as a fraction of it */
    wobbleDepth: { unit: 'ratio', min: 0, max: 0.9, default: 0, rate: 'a' },
    /** where in its turn the wobble stands on the bar line: 0.75 is shut, opening */
    wobblePhase: { unit: 'ratio', min: 0, max: 1, default: 0.75, rate: 'k' },
    /** what the copy is fed (round DUB-4): 0 the bus it stands on, 1 the side door alone (`side` on the instance) */
    side: { unit: 'index', min: 0, max: 1, default: 0, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 1, rate: 'k' },
  },
  // Fourteen nodes with the shell's four: four gains (the side door's since
  // DUB-4), a shaper and six filters; the wobble, where a place asks for one,
  // is an lfoParam beside it (cheap). MEASURED by the kitchen's cost gate
  // (`tools/test-effects-2.ts`, a minute of noise, the fastest of three):
  // 2.35-2.63x the overdrive over four runs in Chromium and Firefox, over cheap's 2x and well
  // inside mid's 5x — six biquads are what an insert of one or two is not.
  // B1 declared it cheap off its node count and never rendered it.
  cost: 'mid',
  // **What the birds move** (round B1, Eugene: the edge's band should sit
  // where the track is). The default of each is the place's number: the
  // corner is set off the theme's own bass register (`src/places.ts`,
  // `bassDriveFor`: the row's harmonic of the bass part's lowest notes), and
  // Gleam moves it from three quarters of that, dark, to twice it, light;
  // Root moves the drive between half and all of its range, more root more
  // grit. The blend has no bird: it is the place's alone.
  knobs: {
    toneHz: { bird: 'gleam', of: 'multiplier', min: 0.75, max: 2, sense: 1 },
    drive: { bird: 'root', of: 'value', min: 0.5, max: 1, sense: 1 },
  },
  bypass: 'bassdrive',
  // Filters ring and nothing else is here: nothing outlives the block.
  tail: 'none',
  // No delay line and no oversampling: the copy is summed with its own input
  // at the sample, which is what lets the clean path stay the sub.
  latency: 'none',
  oversample: 'none',
  build,
};

export default build;
