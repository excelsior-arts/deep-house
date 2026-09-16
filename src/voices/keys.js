// The keyboard voices: the rhythmic role's stab, and — with `p.sustain` —
// the same instruments held under a whole chord for the sustained role.
//
// MEASURED (timbres.md, 52 tracks, harmonic layer isolated with HPSS):
// **nothing closes a filter inside a note.** Not one track drops its
// within-note centroid by more than 10% and 21% brighten. Every filter here is
// therefore static, and the brightness a note loses it loses because its
// partials die, not because a cutoff moved.
//
//   ep     — the electric piano, 35% of tracks and the commonest thing in the
//            genre: a sine carrier, a 1:1 modulator for the body and a 1:14
//            one for the tine whose index is gone in 120 ms, a fixed lowpass
//            with a resonant lift at the measured 3.6 kHz formant, attack
//            24 ms, 8.7 dB down at 300 ms and still only 7.7 dB down at the
//            bar line, and a 5.2 Hz tremolo that pans as well as swells.
//   rhodes — the older, plainer tine: one modulator at 2x, index away in
//            200 ms. The study's "keys blend" sits here.
//   glass  — modulator at 3.5x with a slower index decay: the same instrument
//            with the treble up.
//   organ  — drawbars. Four sines at 1, 2, 3 and 4, attack 9 ms, near
//            rectangular, release 60 ms, and a rotary that moves the level and
//            the image together at 5.5 Hz. MEASURED: this family is defined by
//            holding — 5.5 dB down at the bar line against the pad's 8.8.
//   pluck  — one saw and a square under it through a static lowpass, gone to
//            -26 dB by 300 ms. The only family that really dies inside the
//            bar, and the driest of them all.

import PARAMS from '../params.js';
import { midiToHz } from '../theory.js';
import { adsrEnv, route, panner, phasedLfo, startTime} from '../dsp.js';
import { insert, pair, rampFrequency } from './treat.js';

const PRESETS = {
  // attack / decay / sustain fraction: the measured level at 300 ms and at the
  // bar line, turned into an envelope.
  rhodes: {
    ratio: 2, index: [1.4, 1.8], indexDecay: 0.2, cutoff: 1900, det: 5,
    attack: 0.03, decay: 0.42, sustain: 0.3, formant: [2600, 4.0],
  },
  glass: {
    ratio: 3.5, index: [2.0, 2.6], indexDecay: 0.42, cutoff: 2600, det: 9,
    attack: 0.022, decay: 0.4, sustain: 0.32, formant: [3300, 4.5],
  },
  ep: {
    ratio: 1, tine: 14, index: [0.9, 1.1], tineIndex: [2.2, 3.4], tineDecay: 0.12,
    indexDecay: 0.5, cutoff: 1800, det: 6,
    attack: 0.024, decay: 0.3, sustain: 0.37, formant: [3612, 7.2], tremolo: true,
  },
  organ: {
    organ: true, cutoff: 2500, det: 3,
    attack: 0.009, decay: 0.25, sustain: 0.72, formant: [2444, 3.0], rotary: true,
  },
  pluck: {
    pluck: true, cutoff: 2000, det: 12,
    attack: 0.011, decay: 0.3, sustain: 0.048, formant: [3100, 5.0],
  },
};

// What each of these families is worth to a meter, declared by the voice that
// makes it rather than named in a fit. Three of the four numbers are read
// straight off the preset above, so they cannot drift from the sound: `hold` is
// its sustain fraction, `brightnessHz` its lowpass corner, `struck` whether the
// note has an attack a listener hears as a hit. The fourth, `loudnessDb`, is
// MEASURED — 2026-09-17, tools/loudness-fit.mjs --timbres: this family alone in
// an eight-bar main groove, metered, minus the level its room's table gave it,
// median over the themes that rolled it. It belongs to the instrument and not
// to the room, so moving a preset's `keys` level moves the prediction by the
// same decibel without this number changing.
//
// A new family is a new entry here and nothing else: the loudness fit sums over
// what is sounding and has no coefficient of its own for any instrument.
const TIMBRE_LOUDNESS_DB = {
  rhodes: -7.3, glass: -4.6, ep: -8.5, organ: -4.7, pluck: -12.6,
};
export const KEYS_TIMBRES = Object.fromEntries(
  Object.entries(PRESETS).map(([name, q]) => [name, {
    family: 'harmonic',
    struck: !q.organ,
    hold: q.sustain ?? 0.5,
    brightnessHz: q.cutoff,
    loudnessDb: TIMBRE_LOUDNESS_DB[name],
  }])
);

export function keys(ctx, out, time, p = {}) {
  time = startTime(ctx, time); // never in the past: a step if it is
  const preset = PRESETS[p.preset] || PRESETS.rhodes;
  const hz = midiToHz(p.midi);
  const sustain = !!p.sustain;
  const dur = Math.max(0.08, p.dur ?? 0.3);
  const vel = p.vel ?? 1;

  // Held, the note is the chord and it takes the whole span; struck, it is a
  // stab and the decay is most of what a listener hears.
  const attack = sustain ? (p.attack ?? Math.max(preset.attack, 0.02)) : preset.attack;
  const decay = Math.min(preset.decay, Math.max(0.05, dur * (sustain ? 0.5 : 0.9)));
  const hold = sustain ? Math.max(0, dur - attack - decay) : 0;
  const release = sustain
    ? (p.release ?? Math.min(1.6, Math.max(0.25, dur * 0.35)))
    : preset.pluck
      ? Math.max(0.16, dur * 0.4)
      : Math.max(0.3, dur * 0.8);

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1), {
    attack,
    decay,
    sustain: preset.sustain,
    hold,
    release,
  });

  // Static, both of them. Velocity opens the cutoff a little — a hard note is
  // brighter than a soft one — but nothing moves once the note has started.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  const cut = Math.min(9000, (p.open ?? preset.cutoff) * (0.75 + 0.5 * vel));
  const lpMul = pair(p.lpMul);
  rampFrequency(lp.frequency, cut * lpMul[0], cut * lpMul[1], time, end);

  // The tine's bell, the drawbar's chiff, the pluck's body: one peaking filter
  // at the formant the study measured for this family.
  const form = ctx.createBiquadFilter();
  form.type = 'peaking';
  form.frequency.value = preset.formant[0];
  form.gain.value = preset.formant[1];
  form.Q.value = 1.6;

  // The DJ filter, when the development layer hands one down; otherwise the
  // same fixed corner it has always had, low enough to fill 120-250 Hz.
  const hpMul = pair(p.hpMul);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  rampFrequency(hp.frequency, PARAMS.keys.hpHz * hpMul[0], PARAMS.keys.hpHz * hpMul[1], time, end);

  lp.connect(form);
  form.connect(hp);
  hp.connect(g);

  // The electric piano's tremolo and the organ's rotary are the same idea: the
  // amplifier, not the note. MEASURED at 5.2 and 5.0 Hz respectively, and this
  // family carries the highest AM prominence in the study.
  let tail = g;
  if ((preset.tremolo && p.tremolo) || preset.rotary) {
    const K = PARAMS.keys;
    const rate = preset.rotary ? K.rotaryHz : K.tremoloHz;
    const depth = preset.rotary ? K.rotaryDepth : K.tremoloDepth;
    const trem = ctx.createGain();
    trem.gain.value = 1 - depth;
    const lfo = phasedLfo(ctx, rate, (p.midi % 4) * 1.4);
    const amt = ctx.createGain();
    amt.gain.value = depth;
    lfo.connect(amt);
    amt.connect(trem.gain);
    lfo.start(time);
    lfo.stop(end + 0.02);
    g.connect(trem);
    // It pans as well as swells: the same LFO, a quarter turn behind.
    const pn = panner(ctx, 0);
    const panAmt = ctx.createGain();
    panAmt.gain.value = K.tremoloPan;
    const panLfo = phasedLfo(ctx, rate, (p.midi % 4) * 1.4 + Math.PI / 2);
    panLfo.connect(panAmt);
    panAmt.connect(pn.pan);
    panLfo.start(time);
    panLfo.stop(end + 0.02);
    trem.connect(pn);
    tail = pn;
  }

  if (preset.organ) {
    [[1, 0.5], [2, 0.26], [3, 0.16], [4, 0.09]].forEach(([mult, amp], i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * mult;
      o.detune.value = preset.det * (i % 2 ? 1 : -1);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(lp);
      o.start(time);
      o.stop(end + 0.02);
    });
  } else if (preset.pluck) {
    [0, preset.det].forEach((cents, i) => {
      const o = ctx.createOscillator();
      o.type = i ? 'square' : 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = cents * (i ? 1 : -1);
      const og = ctx.createGain();
      og.gain.value = i ? 0.18 : 0.4;
      o.connect(og);
      og.connect(lp);
      o.start(time);
      o.stop(end + 0.02);
    });
  } else {
    [0, preset.det].forEach((cents, i) => {
      const car = ctx.createOscillator();
      car.type = 'sine';
      car.frequency.value = hz;
      car.detune.value = cents * (i ? 1 : -1);

      // The body: a modulator at the carrier's own frequency, which thickens
      // the note without giving it a pitch of its own.
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = hz * preset.ratio;
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(hz * (preset.index[0] + preset.index[1] * vel), time);
      modGain.gain.exponentialRampToValueAtTime(hz * 0.1, time + preset.indexDecay);
      mod.connect(modGain);
      modGain.connect(car.frequency);
      mod.start(time);
      mod.stop(end + 0.02);

      // The tine: a high ratio whose index is gone in 120 ms, so the clang is
      // the attack and not the note.
      if (preset.tine) {
        const tin = ctx.createOscillator();
        tin.type = 'sine';
        tin.frequency.value = hz * preset.tine;
        const tinGain = ctx.createGain();
        tinGain.gain.setValueAtTime(hz * (preset.tineIndex[0] + preset.tineIndex[1] * vel), time);
        tinGain.gain.exponentialRampToValueAtTime(hz * 0.02, time + preset.tineDecay);
        tin.connect(tinGain);
        tinGain.connect(car.frequency);
        tin.start(time);
        tin.stop(end + 0.02);
      }

      const cg = ctx.createGain();
      cg.gain.value = i ? 0.35 : 0.55;
      car.connect(cg);
      cg.connect(lp);

      car.start(time);
      car.stop(end + 0.02);
    });
  }

  // Register, not harmony: `doubleTop` puts the same note an octave up under
  // the note, the way a drawbar or a second stop does. No new pitch class, no
  // change to the plan.
  if (p.doubleTop) {
    const up = ctx.createOscillator();
    up.type = 'sine';
    up.frequency.value = hz * 2;
    up.detune.value = preset.det * 0.5;
    const ug = ctx.createGain();
    ug.gain.value = 0.22 * p.doubleTop;
    up.connect(ug);
    ug.connect(lp);
    up.start(time);
    up.stop(end + 0.02);
  }

  route(ctx, insert(ctx, p, tail, time, end), out, { dry: 1, delay: p.delay ?? 0.28, reverb: p.reverb ?? 0.22 });
  return end;
}

export default keys;
