// Strings: an ensemble, not a saw pad — and, MEASURED (timbres.md, 16 of 52
// tracks), not a slow swell either. What reads as strings on these records is
// a **fast-attack chord held long and drowned in reverb**: attack 25 ms
// (median of the family; only 21% of all 52 tracks attack slower than 30 ms),
// still only 8.8 dB down at the bar line, and a reverb tail that sits within
// 1.5 dB of the head — the wettest family in the study.
//
//   voices    five sawtooths at +-10 cents (MEASURED: the family beats at
//             0.3 Hz, which a detune of that order produces), plus one an
//             octave up at low level.
//   filter    24 dB/oct — two lowpasses in series — parked at 1.2 kHz and
//             never moved. MEASURED: not one track in 52 closes a filter
//             inside a note, and 21% brighten. The target is a centroid at
//             620 Hz and an 85% rolloff at 851 Hz.
//   ensemble  two delays of 15-30 ms wandering at 0.2-0.3 Hz, returned to
//             opposite sides: what turns five oscillators into a section.
//   vibrato   a few cents at 5 Hz that only arrives after the attack, because
//             a player leans into a long note and a synthesiser shakes it from
//             the first millisecond.
//
// The `swell` variant keeps the same body and takes the slow attack back: it
// is the study's 4% "synth swell" family, and the generator rolls it rarely.

import { midiToHz, adsrEnv, route, panner, phasedLfo, startTime, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert, pair, rampFrequency } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { Knobs, NoteParams } from './descriptor.ts';
import type { HeldState, HeldVoice } from './voice-contract.ts';
import type { Settings } from '../settings.ts';
import { line } from '../ramp.ts';
import type { Line } from '../ramp.ts';

// The two sustained families this file makes, as they describe themselves. The
// shape numbers mirror the settings' `strings` block (attack 25 ms and a
// sustain of 0.52,
// the swell 0.55 s and 0.32, both parked at 1.2 kHz); `loudnessDb` is MEASURED
// the way keys.ts describes — the family alone in an eight-bar main groove,
// less the level its room gave it.
export const STRINGS_TIMBRES = {
  strings: { family: 'harmonic', struck: false, hold: 0.52, brightnessHz: 1200, loudnessDb: -8.0 },
  swell: { family: 'harmonic', struck: false, hold: 0.32, brightnessHz: 1200, loudnessDb: -10.7 },
};

// And what the two do differently, as a table rather than as a name asked
// twice inside the function: which pair of envelope numbers each family reads
// out of the room, and whether its filter opens into the note. Until round E
// this was `const swell = p.timbre === 'swell'` and three branches on it — one
// instrument's name deciding another's envelope. A third family added here
// needs a row and no branch.
const SHAPES: Record<string, { attack: 'attack' | 'swellAttack'; sustain: 'sustain' | 'swellSustain'; opens: boolean }> = {
  strings: { attack: 'attack', sustain: 'sustain', opens: false },
  swell: { attack: 'swellAttack', sustain: 'swellSustain', opens: true },
};

/**
 * How long a strings-family timbre's own entrance is, in seconds, out of the
 * room it is played in: the attack its row of `SHAPES` reads. The composer asks
 * it of a drawn pad before it lays a swell over one (house-v2's `swellIn`),
 * because a voice whose own envelope already swells needs less of one.
 */
export const stringsAttack = (timbre: string, S: Record<string, unknown>): number => {
  const v = S[(SHAPES[timbre] ?? SHAPES.strings).attack];
  return typeof v === 'number' ? v : 0;
};

/**
 * **The sustained role's three ranges** (PLAN-MODULATION M1), declared here
 * because this is the module that makes the family and re-exported by `pad.ts`,
 * which is the voice the registry knows.
 *
 * Every default is the strings family's own measured number — the 25 ms median
 * attack, the 0.52 still sounding at the bar line, the 1.2 kHz corner that
 * lands the centroid at 620 Hz — and what the knob moves is a **factor** on
 * whichever of the four sustained timbres is holding, including the two `pad`
 * hands to `keys.ts`. A swell's own 0.55 s attack is a swell's; the knob makes
 * it half again or a tenth of itself, and it is still a swell.
 *
 * The ceiling on `brightnessHz` is well under the family's engine limit for a
 * measured reason: *not one track in 52 closes a filter inside a note and 21%
 * brighten*, and five saws at a 6 kHz corner is a saw pad, which is the thing
 * this instrument is written not to be.
 */
export const STRINGS_KNOBS: Knobs = {
  brightnessHz: { unit: 'hz', min: 650, default: 1200, max: 3600, bird: 'zephyr', sense: 1, slopeDb: -0.00000662 },
  hold: { unit: 'ratio', min: 0.12, default: 0.52, max: 0.95, bird: 'tide', sense: 1, slopeDb: 14.1 },
  attack: { unit: 'seconds', min: 0.004, default: 0.025, max: 0.5, bird: 'ember', sense: -1, slopeDb: -0.88 },
};

export function strings(
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const S = settings.strings;
  const shape = SHAPES[p.timbre] || SHAPES.strings;
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.5, p.dur ?? 2);
  const vel = p.vel ?? 0.8;
  // The three knobs, as factors against this family's own numbers: exactly 1
  // with nothing asked for, and `x * 1 === x` for every finite double.
  const kBright = knobScale(p, STRINGS_KNOBS, 'brightnessHz');
  const kHold = knobScale(p, STRINGS_KNOBS, 'hold');
  const kAttack = knobScale(p, STRINGS_KNOBS, 'attack');
  const attack = Math.min(p.attack ?? S[shape.attack] * kAttack, dur * 0.5);
  const release = (p.release ?? S.release) * kHold;
  const decay = Math.min(S.decay * kHold, Math.max(0.2, dur - attack));

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1), {
    attack,
    decay,
    // A sustain is a fraction and stops at one; at the default `Math.min` of a
    // number and something over it is that number.
    sustain: Math.min(0.98, S[shape.sustain] * kHold),
    hold: Math.max(0, dur - attack - decay),
    release,
    fadeCurve: p.fadeCurve,
  });

  // Everything under here belongs to the bass; a chord that reaches into it
  // only makes the bottom muddier.
  // The highpass is the DJ filter when the development layer hands one down —
  // the desk reaching for the knob over a loop that is holding, not the
  // instrument shaping its own note. A multiplier of 1 is where it has always
  // sat, and that is what every note gets unless the stage says otherwise.
  const hpMul = pair(p.hpMul);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  rampFrequency(hp.frequency, S.hpHz * hpMul[0], S.hpHz * hpMul[1], time, end);
  hp.connect(g);

  // The ensemble: the dry section plus two delay lines whose times wander at a
  // fifth of a Hertz, returned to opposite sides. Width is a per-theme roll
  // (MEASURED spread: -5.8 to -1.4 dB side/mid across the family).
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const dryG = ctx.createGain();
  dryG.gain.value = S.ensembleDry;
  dryG.connect(hp);
  const ensIn: AudioNode[] = []; // what the section feeds: the dry gain and the two delays
  if (S.ensembleWet > 0) S.chorus.forEach(([ms, rate, pan]: number[], i: number) => {
    const dl = ctx.createDelay(0.1);
    dl.delayTime.value = ms / 1000;
    const lfo = phasedLfo(ctx, rate, i * 1.9 + (p.midi % 5) * 0.4);
    const depth = ctx.createGain();
    depth.gain.value = (ms / 1000) * 0.3;
    lfo.connect(depth);
    depth.connect(dl.delayTime);
    lfo.start(time);
    lfo.stop(end + 0.05);
    // MEASURED: everything under 300 Hz is close to mono, so the low voices of
    // a chord keep their spread to themselves.
    const pn = panner(ctx, pan * spread * (hz > 300 ? 1 : 0.35));
    const wet = ctx.createGain();
    wet.gain.value = S.ensembleWet;
    ensIn.push(dl);
    dl.connect(pn);
    pn.connect(wet);
    wet.connect(hp);
  });
  ensIn.push(dryG);

  // 24 dB/oct and static. The swell variant is the one exception the study
  // allows: it brightens *into* the note, which is an opening filter.
  const lpA = ctx.createBiquadFilter();
  lpA.type = 'lowpass';
  lpA.Q.value = S.q;
  const lpB = ctx.createBiquadFilter();
  lpB.type = 'lowpass';
  lpB.Q.value = 0.6;
  // Static within a note whenever nothing is asking otherwise (MEASURED: not
  // one track in 52 closes a filter inside a note, so the instrument never
  // does this to itself). `lpMul` is the development layer's DJ filter, which
  // is the desk and not the instrument, and it moves over eight to sixteen
  // bars — a fraction of an octave inside any one held chord.
  const open = (p.open ?? S.cutoffHz) * kBright;
  const lpMul = pair(p.lpMul);
  if (shape.opens) {
    lpA.frequency.setValueAtTime(open * 0.45 * lpMul[0], time);
    lpA.frequency.linearRampToValueAtTime(open * 1.35 * lpMul[1], time + Math.min(dur, attack + 1.2));
    lpB.frequency.value = open * 1.4 * lpMul[1];
  } else {
    rampFrequency(lpA.frequency, open * lpMul[0], open * lpMul[1], time, end);
    rampFrequency(lpB.frequency, open * 1.1 * lpMul[0], open * 1.1 * lpMul[1], time, end);
  }
  lpA.connect(lpB);
  for (const n of ensIn) lpB.connect(n);

  // Vibrato that builds: nothing for the length of the attack, then a few
  // cents at about 5 Hz faded in over half a second.
  const vibStart = time + Math.max(attack, S.vibratoHold);
  const vib = phasedLfo(ctx, S.vibratoHz, (p.midi % 7) * 0.8);
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, time);
  vibDepth.gain.setValueAtTime(0, vibStart);
  vibDepth.gain.linearRampToValueAtTime(S.vibratoCents, vibStart + S.vibratoRise);
  vib.connect(vibDepth);
  vib.start(time);
  vib.stop(end + 0.05);

  // The outer voices drift slowly apart and back, so the width moves instead
  // of sitting where it was put.
  const SP = settings.space;
  const drift = phasedLfo(ctx, SP.padDriftHz, (p.midi % 7) * 0.9);
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = SP.padDriftCents;
  drift.connect(driftDepth);
  drift.start(time);
  drift.stop(end + 0.05);

  // The drift, and the same drift turned over for the voices on the other
  // side; the five voices share one level after their pans, since a gain and
  // a pan commute. Five gains fewer and four fewer, and the same samples.
  const driftNeg = ctx.createGain();
  driftNeg.gain.value = -1;
  driftDepth.connect(driftNeg);
  const level = ctx.createGain();
  level.gain.value = S.voiceLevel;
  level.connect(lpA);

  const n = S.voices;
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i - mid) / mid; // -1 .. 1 across the section
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = k * S.detuneCents;
    vibDepth.connect(o.detune);
    if (i !== mid) (k < 0 ? driftNeg : driftDepth).connect(o.detune);
    const pan = panner(ctx, k * spread * 0.6 * (hz > 300 ? 1 : 0.3));
    o.connect(pan);
    pan.connect(level);
    o.start(time);
    o.stop(end + 0.05);
  }

  // The octave: the desk above, quiet enough to be brightness rather than a
  // second chord.
  const oct = ctx.createOscillator();
  oct.type = 'sawtooth';
  oct.frequency.value = hz * 2;
  oct.detune.value = -4;
  vibDepth.connect(oct.detune);
  const octG = ctx.createGain();
  // The desk above. `doubleTop` is the development layer's register
  // alternation: the same chord played from a higher part of the instrument.
  octG.gain.value = S.voiceLevel * S.octaveLevel * (1 + (p.doubleTop ?? 0) * 1.8);
  oct.connect(octG);
  octG.connect(lpA);
  oct.start(time);
  oct.stop(end + 0.05);

  // The stage's colour is on this voice's own filters, above (`own`).
  const tail = insert(ctx, p, g, time, end, settings, { stage: true });
  route(ctx, tail, out, { dry: 1, reverb: p.reverb ?? 0.6, delay: p.delay ?? 0.1 });
  return end;
}

// --- the same ensemble, held ------------------------------------------------
//
// `strings` above is a note: it is handed a length, it schedules its own end
// and it hands that instant back. `holdStrings` is the same body with nothing
// scheduled to stop it — round G of PLAN-V1-NEXT, against the contract in
// `voice-contract.ts` and the design review's §9, which is where the sentence
// *a fixed-duration one-shot is insufficient for indefinite hold, live control,
// pause/resume and controlled release* comes from.
//
// **The one-shot is untouched.** Not one line of it moved for this: a v1 record
// is made of notes and a note that changed would be a sound change. What is
// shared between them is the settings block and the description of the sound,
// and what is not shared is the one thing that differs — when it ends.
//
// What is left out, deliberately, is everything the desk does to a *note*: the
// vibrato that builds after the attack, the octave above, the stage's `lpMul`
// and `hpMul` walks across a note's own length. A drone has no length to walk
// across, and its brightness is a control somebody moves rather than a ramp
// written when it starts.
//
//   controls   `gain` — the level it holds at, in the voice's own units
//              `brightness` — the corner of the 24 dB/oct lowpass, in Hz
//   tail       `settings.strings.release`: what `release` takes, stated by the
//              voice before anybody asks for it. A caller tearing a graph down
//              reads this instead of waiting to see.
export function holdStrings(
  ctx: BaseAudioContext,
  out: VoiceOut,
  at: number,
  p: NoteParams = {},
  settings: Settings,
): HeldVoice {
  const S = settings.strings;
  const time = startTime(ctx, at);
  const hz = midiToHz(p.midi);
  const attack = p.attack ?? S.attack;
  const tail = p.tail ?? S.release;
  let level = (p.vel ?? 0.8) * (p.gain ?? 1);
  let state: HeldState = 'holding';
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];

  // The output gain. It rises to the held level and stays there: no decay, no
  // sustain fraction, no scheduled end.
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, level), time + Math.max(MIN_RELEASE, attack));
  nodes.push(g);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = S.hpHz;
  hp.connect(g);
  nodes.push(hp);

  // The ensemble, as the note builds it: the dry section and two delay lines
  // wandering at a fifth of a Hertz, returned to opposite sides.
  const spread = (p.spread ?? S.spread) * (p.spreadMul ?? 1);
  const dryG = ctx.createGain();
  dryG.gain.value = S.ensembleDry;
  dryG.connect(hp);
  const ensIn: AudioNode[] = [];
  S.chorus.forEach(([ms, rate, pan]: number[], i: number) => {
    const dl = ctx.createDelay(0.1);
    dl.delayTime.value = ms / 1000;
    const lfo = phasedLfo(ctx, rate, i * 1.9 + (p.midi % 5) * 0.4);
    const depth = ctx.createGain();
    depth.gain.value = (ms / 1000) * 0.3;
    lfo.connect(depth);
    depth.connect(dl.delayTime);
    lfo.start(time);
    const pn = panner(ctx, pan * spread * (hz > 300 ? 1 : 0.35));
    const wet = ctx.createGain();
    wet.gain.value = S.ensembleWet;
    ensIn.push(dl);
    dl.connect(pn);
    pn.connect(wet);
    wet.connect(hp);
    sources.push(lfo);
    nodes.push(dl, depth, pn, wet);
  });
  ensIn.push(dryG);

  // 24 dB/oct, and the one control that moves it.
  const open = p.open ?? S.cutoffHz;
  const lpA = ctx.createBiquadFilter();
  lpA.type = 'lowpass';
  lpA.Q.value = S.q;
  lpA.frequency.value = open;
  const lpB = ctx.createBiquadFilter();
  lpB.type = 'lowpass';
  lpB.Q.value = 0.6;
  lpB.frequency.value = open * 1.1;
  lpA.connect(lpB);
  for (const n of ensIn) lpB.connect(n);
  nodes.push(lpA, lpB);

  // The section: the same five voices, detuned across the stereo picture, and
  // the slow drift that keeps the width moving.
  const SP = settings.space;
  const drift = phasedLfo(ctx, SP.padDriftHz, (p.midi % 7) * 0.9);
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = SP.padDriftCents;
  drift.connect(driftDepth);
  drift.start(time);
  sources.push(drift);
  const driftNeg = ctx.createGain();
  driftNeg.gain.value = -1;
  driftDepth.connect(driftNeg);
  const voiceLevel = ctx.createGain();
  voiceLevel.gain.value = S.voiceLevel;
  voiceLevel.connect(lpA);
  nodes.push(driftDepth, driftNeg, voiceLevel);

  const n = S.voices;
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i - mid) / mid;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = k * S.detuneCents;
    if (i !== mid) (k < 0 ? driftNeg : driftDepth).connect(o.detune);
    const pan = panner(ctx, k * spread * 0.6 * (hz > 300 ? 1 : 0.3));
    o.connect(pan);
    pan.connect(voiceLevel);
    o.start(time);
    sources.push(o);
    nodes.push(pan);
  }

  route(ctx, g, out, { dry: 1, reverb: p.reverb ?? 0.6, delay: p.delay ?? 0.1 });

  const when = (t?: number): number => (t == null ? ctx.currentTime : Math.max(0, t));

  // What each moving parameter is doing, so that a change part-way through a
  // ramp starts from where that ramp had actually got to: `../ramp.ts`'s line,
  // the one copy every other held voice and knob stands on.
  //
  // **This voice kept a copy of its own until R84 of the reconciled review of
  // 09-24**, which remembered one ramp per parameter and, on a command landing
  // under a ramp still under way, cancelled that ramp's end and set the
  // parameter where the ramp had got to — so the part of the leg that had
  // played was cancelled with it, and an offline render stepped (the E07 class
  // the line fixes by writing the leg back). A command landing after the last
  // ramp has ended writes exactly what the copy wrote — a cancel, a set, a
  // ramp — which is every command the blessed measurements of this voice make;
  // `tools/check-envelopes.ts` holds the two to the same commands there.
  const lines = new Map<AudioParam, Line>([
    [g.gain, line(ctx, g.gain, { from: 0, to: Math.max(GAIN_FLOOR, level), start: time, end: time + Math.max(MIN_RELEASE, attack) })],
    [lpA.frequency, line(ctx, lpA.frequency, { from: open, to: open, start: time, end: time })],
    [lpB.frequency, line(ctx, lpB.frequency, { from: open * 1.1, to: open * 1.1, start: time, end: time })],
  ]);
  const rampTo = (param: AudioParam, value: number, atTime?: number, over?: number): number =>
    lines.get(param)!.to(value, when(atTime), over || 0);

  let releaseAt: number | null = null;
  const held: HeldVoice = {
    controls: ['gain', 'brightness'],
    tail,
    get state() { return state; },
    get level() { return level; },
    // Stated, and the rest of `held.ts`'s answer to the outside review's E07
    // deliberately not copied here: this handle refuses a control from the
    // instant a release is asked for, and remembers one ramp per parameter,
    // because its numbers are blessed (the note at the top of `held.ts`).
    get releaseAt() { return releaseAt; },
    setControl(name, value, atTime, over = 0) {
      if (state === 'gone' || state === 'released') return false;
      if (name === 'gain') {
        level = value;
        // A paused drone remembers the level it is to come back at and does
        // not come back early because somebody moved it while it was away.
        if (state !== 'paused') rampTo(g.gain, Math.max(GAIN_FLOOR, value), atTime, over);
        return true;
      }
      if (name === 'brightness') {
        rampTo(lpA.frequency, Math.max(CUTOFF_FLOOR, value), atTime, over);
        rampTo(lpB.frequency, Math.max(CUTOFF_FLOOR, value * 1.1), atTime, over);
        return true;
      }
      return false;
    },
    pause(atTime) {
      if (state !== 'holding') return;
      state = 'paused';
      rampTo(g.gain, GAIN_FLOOR, atTime, MIN_RELEASE);
    },
    resume(atTime) {
      if (state !== 'paused') return;
      state = 'holding';
      rampTo(g.gain, Math.max(GAIN_FLOOR, level), atTime, MIN_RELEASE);
    },
    release(atTime) {
      const t = when(atTime);
      if (state === 'released' || state === 'gone') return t;
      state = 'released';
      releaseAt = t;
      // The stated tail, and then the floor every gain in this engine ends on.
      rampTo(g.gain, GAIN_FLOOR, t, tail);
      const silent = t + tail + MIN_RELEASE;
      g.gain.linearRampToValueAtTime(0, silent);
      for (const s of sources) {
        try { s.stop(silent); } catch (e) { /* already stopped */ }
      }
      return silent;
    },
    dispose() {
      state = 'gone';
      for (const s of sources) {
        try { s.stop(); } catch (e) { /* already stopped, or never started */ }
      }
      for (const node of [...nodes, ...sources]) {
        try { node.disconnect(); } catch (e) { /* already gone */ }
      }
    },
  };
  return held;
}

export default strings;
