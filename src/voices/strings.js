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

import { midiToHz } from '../theory.js';
import PARAMS from '../params.js';
import { adsrEnv, route, panner, phasedLfo, startTime} from '../dsp.js';
import { insert, pair, rampFrequency } from './treat.js';

// The two sustained families this file makes, as they describe themselves. The
// shape numbers mirror `PARAMS.strings` (attack 25 ms and a sustain of 0.52,
// the swell 0.55 s and 0.32, both parked at 1.2 kHz); `loudnessDb` is MEASURED
// the way keys.js describes — the family alone in an eight-bar main groove,
// less the level its room gave it.
export const STRINGS_TIMBRES = {
  strings: { family: 'harmonic', struck: false, hold: 0.52, brightnessHz: 1200, loudnessDb: -8.0 },
  swell: { family: 'harmonic', struck: false, hold: 0.32, brightnessHz: 1200, loudnessDb: -10.7 },
};

export function strings(ctx, out, time, p = {}) {
  time = startTime(ctx, time); // never in the past: a step if it is
  const S = PARAMS.strings;
  const swell = p.timbre === 'swell';
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.5, p.dur ?? 2);
  const vel = p.vel ?? 0.8;
  const attack = Math.min(p.attack ?? (swell ? S.swellAttack : S.attack), dur * 0.5);
  const release = p.release ?? S.release;
  const decay = Math.min(S.decay, Math.max(0.2, dur - attack));

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1), {
    attack,
    decay,
    sustain: swell ? S.swellSustain : S.sustain,
    hold: Math.max(0, dur - attack - decay),
    release,
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
  const ensIn = []; // what the section feeds: the dry gain and the two delays
  S.chorus.forEach(([ms, rate, pan], i) => {
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
  const open = p.open ?? S.cutoffHz;
  const lpMul = pair(p.lpMul);
  if (swell) {
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
  const SP = PARAMS.space;
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

  const tail = insert(ctx, p, g, time, end);
  route(ctx, tail, out, { dry: 1, reverb: p.reverb ?? 0.6, delay: p.delay ?? 0.1 });
  return end;
}

export default strings;
