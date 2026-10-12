// The harmonic bus's edge, in parallel (round SPARK-1): the bass drive's
// topology (`bass-drive.ts`, round B1) moved up to where the bed's grain is.
// The clean bus passes through nothing and a driven copy of it is summed in
// underneath, kept between a floor and a top so what it adds is the notes'
// own harmonics in 2-8 kHz and nothing at their register:
//
//   input -+------------------------------------------------------------------------------+-> out
//          +-> pre (high-pass) -> drive -> clip -> make-up -> floor (HP x2) -> tone (LP x2) -> blend -+
//
//   the clean path  the input straight to the output, through one gain at
//                   one. At a blend of nought nothing else is built at all
//                   (`master.ts` wires the bus as it always was).
//   the pre-filter  one high-pass under the clip at `preHz`, so the bed's
//                   body under it (the pad's 100-250 Hz, a melodic bass) does
//                   not own the clipper and the chords themselves are what is
//                   driven.
//   the floor       two Butterworth high-passes after the clip at `floorHz`
//                   (24 dB an octave): a clipper hands back the fundamentals it
//                   was fed and their low harmonics, and none of that may land
//                   on the notes' own band. Over a floor at 1.8 kHz the copy
//                   carries only the harmonics the clip made of the chord.
//   the top         two low-passes at `toneHz`: past it the copy is fizz.
//
// **The make-up is worked out off the curve at a stated level**, so the drive
// is a colour and the blend the level, as the bass drive's is: a sine at
// `REFERENCE_DBFS` through the curve at the drive asked for, its RMS brought
// back to the sine's own and lifted by what the floor takes (`EDGE_LIFT_DB`),
// so `blend` is the edge against the bus as it is heard, over its floor: one
// is an edge as loud as the bus, a tenth twenty decibels under it. The curve is the
// overdrive's asymmetric tanh, even harmonics with the odd, and it is
// oversampled twice: the clip is fed chords up to two kilohertz, whose
// harmonics past the Nyquist would fold back down as the fizz this stage is
// written not to make.
//
// Where it sits: `master.ts`, between the harmonic bus's seam gain and the
// bell, before the duck — so it takes the pads, the keys through their chorus
// and the leads, and never the kick, the sub, the drums or a send's return.
// Where it is heard: the composer's place table (`GRAIN` in the style's
// places), quiet at the house.

import { overdriveCurve } from './curves.ts';
import { line, type Line } from '../ramp.ts';
import type { HarmonicEdge } from '../voices/grain.ts';

/** How much gain the drive buys, in decibels: 0 is a wire into the curve, 1 is forty decibels. */
const DRIVE_DB = 40;
const driveGain = (drive: number): number => Math.pow(10, (Math.max(0, Math.min(1, drive)) * DRIVE_DB) / 20);
/** The curve: the overdrive's tanh, hardness 3, the negative half saturating at 0.7. */
const CURVE = { k: 3, bend: 0.3 };
/**
 * The level the bus's notes reach this stage at, in dBFS. An estimate stated
 * as one: the pads and keys sit 7.5 to 12 dB under the bus's unity with notes
 * at a quarter to a half of full scale, so a held chord reaches the stage near
 * -24 dBFS. The walk in `notes/rounds/spark-1.md` set the blend by the meter
 * against this, so it is the reference the blend is read at and no more.
 */
const REFERENCE_DBFS = -24;
const A_REF = Math.pow(10, REFERENCE_DBFS / 20);

/** The RMS of a sine of amplitude `amp` through the curve, its offset taken out. */
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

/**
 * What the floor takes off the copy, and what the copy is lifted by so that a
 * blend of one is an edge as loud as the bus, as the bass drive's blend is
 * against the bass. MEASURED (round SPARK-1, seeds 1 and 29 theme two, the
 * strings pad alone through the bus at drive 0.6): unlifted, at a blend of one
 * the copy over its floor stood 9.8 and 12.1 dB under the pad, and in 2-8 kHz
 * level with the pad's own presence. So a tenth is an edge twenty decibels
 * under the bus.
 */
const EDGE_LIFT_DB = 11;
const EDGE_LIFT = Math.pow(10, EDGE_LIFT_DB / 20);

/** The make-up at a drive: the reference sine's RMS over what the curve made of it, lifted. */
function makeupGain(curve: Float32Array, drive: number): number {
  return (EDGE_LIFT * (A_REF / Math.SQRT2)) / Math.max(1e-9, rmsThrough(curve, driveGain(drive) * A_REF));
}

/**
 * What `master.ts` wires: an input, an output, and the nodes to let go of —
 * and, for the desk (DESK-EDGE), the stage's numbers as the parameters they
 * are. `blend`, `preHz`, `floorHz` and `toneHz` are a gain and biquad corners,
 * each one value on every parameter named (the two floors share a corner, as
 * the two tops do), so the graph ramps them as it ramps any stage line. The
 * drive is two gains that move together, the drive into the curve and the
 * make-up worked out off it, so it is a setter: `drive(v)` ramps both.
 */
export interface HarmonicEdgeStage {
  input: GainNode;
  output: GainNode;
  /** the copy's level, the box's one reading */
  blend: GainNode;
  nodes: AudioNode[];
  /** the parameters each corner and the blend are, by the field's name */
  params: { blend: AudioParam[]; preHz: AudioParam[]; floorHz: AudioParam[]; toneHz: AudioParam[] };
  /** the drive and its make-up, ramped together to what `drive` asks of both, from `at` over `over` */
  drive(v: number, at: number, over: number): void;
  /** the drive the stage stands at: what a twin built later starts from */
  driveNow(): number;
}

/** Build the stage. The settings are admitted already (`admitGrain`). */
export function buildHarmonicEdge(ctx: BaseAudioContext, p: HarmonicEdge): HarmonicEdgeStage {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output);
  const hp = (hz: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.Q.value = -3.01;
    f.frequency.value = hz;
    return f;
  };
  const lp = (hz: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = -3.01;
    f.frequency.value = hz;
    return f;
  };
  const pre = hp(p.preHz);
  const drive = ctx.createGain();
  drive.gain.value = driveGain(p.drive);
  const shaper = ctx.createWaveShaper();
  const curve = overdriveCurve(CURVE.k, CURVE.bend);
  shaper.curve = curve;
  shaper.oversample = '2x';
  const makeup = ctx.createGain();
  makeup.gain.value = makeupGain(curve, p.drive);
  const floor1 = hp(p.floorHz), floor2 = hp(p.floorHz);
  const tone1 = lp(p.toneHz), tone2 = lp(p.toneHz);
  const blend = ctx.createGain();
  blend.gain.value = p.blend;
  input.connect(pre);
  pre.connect(drive);
  drive.connect(shaper);
  shaper.connect(makeup);
  makeup.connect(floor1);
  floor1.connect(floor2);
  floor2.connect(tone1);
  tone1.connect(tone2);
  tone2.connect(blend);
  blend.connect(output);
  // The drive's two gains get their lines on the first move and not before,
  // so a stage nobody moves is the stage it always was, node for node.
  let lines: { drive: Line; makeup: Line } | null = null;
  let driveNow = p.drive;
  return {
    input, output, blend,
    nodes: [input, output, pre, drive, shaper, makeup, floor1, floor2, tone1, tone2, blend],
    params: {
      blend: [blend.gain], preHz: [pre.frequency],
      floorHz: [floor1.frequency, floor2.frequency], toneHz: [tone1.frequency, tone2.frequency],
    },
    drive(v, at, over) {
      const d = Math.max(0, Math.min(1, v));
      lines ??= { drive: line(ctx, drive.gain, drive.gain.value), makeup: line(ctx, makeup.gain, makeup.gain.value) };
      lines.drive.to(driveGain(d), at, over);
      lines.makeup.to(makeupGain(curve, d), at, over);
      driveNow = d;
    },
    driveNow: () => driveNow,
  };
}
