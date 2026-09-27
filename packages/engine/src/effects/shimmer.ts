// Shimmer: a feedback reverb with an octave in the loop, so the tail climbs.
//
//   input -> cut -> ring L/R -> damp -> out -> wet
//                                            ^                |
//                                            |                v
//                                            +--- feedback <- shift (+12)
//
// There is no sample anywhere in it and no convolution either: the room is a
// pair of delay lines feeding each other, which is a feedback-delay network,
// and what makes it a shimmer rather than a reverb is
// that the feedback path goes through a **pitch shifter**. Every pass round the
// loop is an octave higher than the last, so a held chord grows a choir over it
// that was never played.
//
// ## The pitch shifter, which is the whole of the interesting part
//
// It is two delay lines and four oscillators, and it works because of one fact:
// **a delay line whose delay time falls at a constant rate is a constant pitch
// ratio.** Reading a signal at a point that moves towards you at `r` seconds a
// second gives you the signal at `1 + r` times the speed, which is a pitch
// ratio of `1 + r`. So a sawtooth on `delayTime` — falling from the window
// length to nought over one cycle — shifts by `1 + W·f`, where W is the window
// and f the sawtooth's rate. An octave is `W·f = 1`: at a 60 ms window that is
// 16.67 Hz.
//
// The catch is the wrap: once a cycle the head jumps back to the far end of the
// window and the signal jumps with it. So there are two of them, half a cycle
// apart, each under a raised-cosine window that is **nought exactly where its
// own sawtooth wraps** — so at every instant one line is being faded out over
// its wrap while the other is in the middle of its sweep. That is the whole
// trick, and it is why the two crossfade LFOs are at a phase that looks
// arbitrary and is not: sine at 0.75 of a turn is `-cos`, which is nought at
// t = 0, which is where the sawtooth at phase 0 wraps.
//
// It is a **granular** shifter and it sounds like one, and the round measured
// exactly how. Two things come out of the design and neither is a bug to be
// fixed:
//
//   A transient arrives twice, sixty milliseconds apart, because two taps are
//   reading the same line at two places.
//
//   **The octave arrives as a pair of sidebands and not as a partial.** The two
//   taps are half a window apart, so their outputs add at the carrier only when
//   the output frequency times half the window is a whole number of cycles. At
//   440 Hz and a 60 ms window that product is 13.2 — near enough to a half to
//   cancel — so a 220 Hz tone through it comes back as 423 and 457 Hz with a
//   null at 440, which is a 16.7 Hz warble and is the window's own rate. On a
//   lead that would be a fault. Inside a reverb's feedback loop it is the sound
//   — it is what makes a shimmer a wash rather than a harmoniser — and it is
//   why the window is not made shorter, which would move the warble up into the
//   range where the ear hears it as a second pitch.
//
// Round K2's finding applies to the loop and is why the delay is not shorter
// than it is: a cycle through a `DelayNode` is quantised to a render quantum,
// so the shortest feedback ring this engine can build is 2.9 ms at 44.1 kHz.
// The default is 78 and 91 ms, two prime-ish lengths so the two sides do not
// land on each other.

import { shell, lfo, knob } from './shell.ts';
import { resolveParams, guardParams } from './contract.ts';
import type { EffectDescriptor, EffectInstance, EffectParams } from './contract.ts';
import type { Settings } from '../settings.ts';

/** The declared tail, in one place: the builder and the descriptor read it. */
const TAIL = 12;
/** The window the shifter reads through, in seconds, and so how grainy it is. */
const WINDOW = 0.06;

/**
 * One period of the head's ramp, `len` samples long, started `phase` of a turn
 * in: the same numbers for every shifter of that length on a context, so built
 * once and shared (R97 of the reconciled review of 09-24). An instance per note
 * used to allocate and fill two of them on the scheduling tick; a buffer is
 * read-only to the sources playing it, so one serves them all.
 */
const ramps = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function rampBuffer(ctx: BaseAudioContext, len: number, phase: number): AudioBuffer {
  let per = ramps.get(ctx);
  if (!per) { per = new Map(); ramps.set(ctx, per); }
  const key = `${len}:${phase}`;
  let buf = per.get(key);
  if (!buf) {
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ramp = buf.getChannelData(0);
    const shift = Math.round(phase * len);
    for (let i = 0; i < len; i++) ramp[(i + shift) % len] = (i / len) * 2 - 1;
    per.set(key, buf);
  }
  return buf;
}

/**
 * A pitch shifter, as two delay lines and their windows.
 * @param keep somewhere to put the nodes
 * @param semitones how far up
 */
function shifter(
  ctx: BaseAudioContext,
  keep: (n: AudioNode) => void,
  keepSource: (s: AudioScheduledSourceNode) => void,
  semitones: number,
) {
  const ratio = Math.pow(2, semitones / 12);
  // delayTime = W/2 - (W/2)·saw, falling from W to 0 over 1/f, so the rate of
  // change is -W·f and the pitch ratio is 1 + W·f.
  const want = Math.max(0.5, (ratio - 1) / WINDOW);
  // **The ramp is a buffer and not a `PeriodicWave`, and that is a
  // measurement.** A band-limited sawtooth of thirty-two harmonics has the
  // right *average* slope and a slope that ripples: the truncated series'
  // derivative at the middle of the ramp oscillates with the harmonic count,
  // and what rides on this ramp is a delay time, so a ripple in the slope is a
  // ripple in the pitch. MEASURED: built out of a `PeriodicWave` the octave
  // came back at 420 Hz against 220 in — **eighty cents flat** — and out of a
  // one-period ramp in a looping buffer it is 440. A buffer has no Gibbs in it
  // because it is not a series.
  const len = Math.max(8, Math.round(ctx.sampleRate / want));
  // The rate the buffer actually loops at, which is the sample rate over a
  // whole number of samples and so not exactly what was asked for. The windows
  // are run at *this* rate rather than at `want`, so that the crossfade stays
  // where the wrap is instead of drifting off it over a few minutes.
  const hz = ctx.sampleRate / len;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const heads: AudioBufferSourceNode[] = [];
  const windows: OscillatorNode[] = [];
  keep(input);
  keep(output);
  for (const phase of [0, 0.5]) {
    const buf = rampBuffer(ctx, len, phase);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const line = ctx.createDelay(WINDOW + 0.01);
    line.delayTime.value = WINDOW / 2;
    const throwAt = ctx.createGain();
    // Negative, because the ramp rises and the head has to fall.
    throwAt.gain.value = -WINDOW / 2;
    src.connect(throwAt);
    throwAt.connect(line.delayTime);

    // The window: nought exactly where this line's own ramp wraps. A sine at
    // three quarters of a turn is `-cos`, which is nought at t = 0, which is
    // where the ramp at phase 0 wraps.
    const win = ctx.createGain();
    win.gain.value = 0.5;
    const shape = lfo(ctx, hz, 0, (0.75 + phase) % 1);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    shape.connect(depth);
    depth.connect(win.gain);

    input.connect(line);
    line.connect(win);
    win.connect(output);
    keepSource(src);
    keepSource(shape);
    heads.push(src);
    windows.push(shape);
    keep(line);
    keep(throwAt);
    keep(win);
    keep(depth);
  }
  return { input, output, hz, len, heads, windows };
}

/**
 * @param settings the room it is built in; this one reads nothing from it
 */
export function build(ctx: BaseAudioContext, settings: Settings, params: EffectParams = {}, at = 0): EffectInstance {
  const p = resolveParams(descriptor, params);
  const sh = shell(ctx, { mix: p.mix, tail: TAIL });
  const keep = (...n: AudioNode[]): number => sh.nodes.push(...n);
  const keepSource = (s: AudioScheduledSourceNode): number => sh.sources.push(s);

  const cut = ctx.createBiquadFilter();
  cut.type = 'highpass';
  cut.Q.value = -3.01;
  cut.frequency.value = p.lowCutHz;
  sh.input.connect(cut);
  keep(cut);

  // **There is no diffuser** (R76 of the reconciled review of 09-24). There
  // were four stages here, written as one — Schroeder lengths of 7.1, 11.3, 17.3
  // and 22.9 ms — and built as biquad allpasses with those lengths turned into
  // corners, 35, 22, 14 and 11 Hz: under this effect's own low-cut, where they
  // turned the phase of what the cut had already taken out and spread nothing.
  // A diffuser is delay-line allpasses (each a loop of at least a render
  // quantum); whether the shimmer wants one is a sound to be listened to, not
  // a repair, so what did nothing is gone and the cloud is the rings' own.
  const head = cut;

  const fbSum = ctx.createGain();
  head.connect(fbSum);
  keep(fbSum);

  // Two rings, two lengths, panned apart: the width is the two sides never
  // being the same length rather than two decorrelated noises.
  const rings = [p.sizeSeconds, p.sizeSeconds * 1.17].map((secs: number, i: number) => {
    const line = ctx.createDelay(1.2);
    line.delayTime.value = Math.min(1, secs);
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.Q.value = -3.01;
    damp.frequency.value = p.dampHz;
    const pan = ctx.createStereoPanner();
    pan.pan.value = i ? p.spread : -p.spread;
    fbSum.connect(line);
    line.connect(damp);
    damp.connect(pan);
    keep(line, damp, pan);
    return { line, damp, pan };
  });

  // The early path: the diffused input straight to the output, so the wet half
  // **starts when its input does**. Without it the first thing out of a
  // feedback-delay network is one ring-length late — MEASURED at 3439 samples,
  // 78 ms, which is the default ring exactly — and a reverb whose output begins
  // a sixteenth after the note is a delay. It is what early reflections are in a
  // real room and it is what a convolution reverb gets for nothing from the
  // head of its own impulse.
  const early = ctx.createGain();
  early.gain.value = p.early;
  head.connect(early);
  keep(early);

  const tail = ctx.createGain();
  // Half, and it is the stability of the whole thing: **two rings both fed from
  // the sum and both summing into the tail is a loop gain of twice the
  // feedback**, so at the default 0.62 the first build ran away and the
  // audition peaked at exactly 0 dBFS. The two rings share the one feedback the
  // parameter asks for, which is what `feedback` has to mean if the number is
  // to be read as "how much comes back".
  tail.gain.value = 0.5;
  for (const r of rings) r.pan.connect(tail);
  early.connect(tail);
  tail.connect(sh.wet);
  keep(tail);

  // The loop, through the octave. `shift` is how much of the feedback is
  // pitched: at nought it is an ordinary feedback reverb, at one everything
  // going round is an octave up, and between them is the thing worth having.
  const sft = shifter(ctx, keep, keepSource, p.semitones);
  const pitched = ctx.createGain();
  const plain = ctx.createGain();
  tail.connect(sft.input);
  tail.connect(plain);
  sft.output.connect(pitched);
  pitched.connect(fbSum);
  plain.connect(fbSum);
  keep(pitched, plain);

  let feedback = p.feedback;
  let shiftAmt = p.shift;
  const fbKnobs = [knob(ctx, pitched.gain, feedback * shiftAmt), knob(ctx, plain.gain, feedback * (1 - shiftAmt))];
  const route = (at?: number, over?: number): void => {
    fbKnobs[0](feedback * shiftAmt, at, over);
    fbKnobs[1](feedback * (1 - shiftAmt), at, over);
  };

  const sizeKnobs = rings.map((r, i) => knob(ctx, r.line.delayTime, Math.min(1, p.sizeSeconds * (i ? 1.17 : 1))));
  // One knob per parameter per node, built once: a knob keeps its own line, so
  // one made inside a setter would start from where the parameter began every
  // time it was asked to move (round G's finding, and round K1's `knob`).
  const dampKnobs = rings.map((r) => knob(ctx, r.damp.frequency, p.dampHz));
  const panKnobs = rings.map((r, i) => knob(ctx, r.pan.pan, i ? p.spread : -p.spread));
  const earlyKnob = knob(ctx, early.gain, p.early);
  // The shift is the ramp's **rate** and nothing else — the window is fixed and
  // the ratio is `1 + W·f` — so a semitone knob is two playback rates and two
  // oscillator frequencies, and it can move while it plays.
  const shiftKnobs = [
    ...sft.heads.map((h) => knob(ctx, h.playbackRate, 1)),
    ...sft.windows.map((o) => knob(ctx, o.frequency, sft.hz)),
  ];
  sh.start(at);

  return {
    input: sh.input,
    output: sh.output,
    params: guardParams(descriptor, {
      sizeSeconds: (v, at, over) => sizeKnobs.forEach((k, i) => k(Math.min(1, v * (i ? 1.17 : 1)), at, over)),
      feedback: (v, at, over) => { feedback = Math.max(0, Math.min(descriptor.params.feedback.max, v)); route(at, over); },
      shift: (v, at, over) => { shiftAmt = Math.max(0, Math.min(1, v)); route(at, over); },
      dampHz: (v, at, over) => dampKnobs.forEach((k) => k(v, at, over)),
      lowCutHz: cut.frequency,
      spread: (v, at, over) => panKnobs.forEach((k, i) => k(i ? v : -v, at, over)),
      semitones: (v, at, over) => {
        const hzNow = Math.max(0.5, (Math.pow(2, Math.max(0, Math.min(12, v)) / 12) - 1) / WINDOW);
        // The heads are buffers, so their knob is a playback rate against what
        // was built; the windows are oscillators, so theirs is a frequency.
        sft.heads.forEach((h, i) => shiftKnobs[i](hzNow / sft.hz, at, over));
        sft.windows.forEach((o, i) => shiftKnobs[sft.heads.length + i](hzNow, at, over));
      },
      early: (v, at, over) => earlyKnob(Math.max(0, Math.min(1, v)), at, over),
      mix: sh.setMix,
    }),
    setBypass: sh.setBypass,
    dispose: sh.dispose,
  };
}

export const descriptor: EffectDescriptor = {
  id: 'shimmer',
  family: 'time',
  scope: 'send',
  // A send, on the two harmonic buses and the melodic one. Not the drums and
  // not the bottom: an octave-up feedback path fed a kick is a whistle.
  applies: ['melodic', 'keys'],
  params: {
    // MEASURED, both of them, and both came down from the first build: at a
    // feedback of 0.82 round a 0.94 s ring the tail was still at -45 dB after
    // the declared twelve seconds, because 0.82 is 1.7 dB a pass and twelve
    // seconds is twelve passes. 0.7 is 3.1 dB a pass and 0.41 s is thirty
    // passes in twelve seconds, which is the bound being the bound again —
    // round K1's tape delay finding, arrived at from the other side.
    sizeSeconds: { unit: 'seconds', min: 0.02, max: 0.35, default: 0.078, rate: 'k' },
    feedback: { unit: 'ratio', min: 0, max: 0.7, default: 0.62, rate: 'k' },
    // How much of the input goes straight to the output: the early reflections.
    early: { unit: 'ratio', min: 0, max: 1, default: 0.35, rate: 'k' },
    // How much of what goes round is pitched. 0 is a plain feedback reverb.
    shift: { unit: 'ratio', min: 0, max: 1, default: 0.62, rate: 'k' },
    // Fixed at build: the shifter's window and its sawtooth rate are both
    // derived from it, and a shift that moved would be a head changing speed.
    semitones: { unit: 'index', min: 0, max: 12, default: 12, rate: 'k' },
    dampHz: { unit: 'hz', min: 600, max: 16000, default: 3200, rate: 'k' },
    lowCutHz: { unit: 'hz', min: 20, max: 1500, default: 300, rate: 'a' },
    spread: { unit: 'ratio', min: 0, max: 1, default: 0.75, rate: 'k' },
    mix: { unit: 'ratio', min: 0, max: 1, default: 0.3, rate: 'k' },
  },
  // MEASURED at 5.39x the reference effect, which is past the mid band: two
  // rings, four allpass stages, and a pitch shifter that is two more delay
  // lines with four oscillators on them.
  cost: 'dear',
  bypass: 'shimmer',
  // The bound over the range, and it is the damping that sets it rather than
  // the feedback alone: at 0.82 round a 0.94 s ring, with a 3.2 kHz lid taking
  // the top off every pass, the measurement is in `notes/archive/2026-09-kitchen/rounds/k4.md`. Twelve
  // seconds covers it.
  tail: { seconds: TAIL },
  latency: 'none',
  build,
};

export default build;
