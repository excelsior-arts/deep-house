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
//
// **A topology since round SOUNDS-R3.** The five patches are rows
// (`sounds/keyboard/keysRhodes.json`, `keysGlass`, `keysEp`, `keysOrgan`,
// `keysPluck`), which the rhythmic role's dispatcher (`keys`, by `p.preset`)
// and the sustained role's (`pad`, held) render through. Each row carries one
// patch — what was `KEYBOARD_PRESETS` in `keys-patches.ts`: its tone, its
// envelope and its family's switches — and the amplifier it plays through —
// what this file read of the settings' `keys` block: the high-pass, the
// tremolo and the rotary, and the edge a place writes. The amplifier is the
// room's word on all five (`voicedBy: ["keys", …]`); a style's voicing of one
// patch's tone (`keyboardPatches.<name>`, house-v2's quieter electric piano) is
// that row's own (`…, "keyboardPatches.ep"]`). A patch's family and envelope
// are its own and no room reaches them: a style cannot switch a keyboard's
// synthesis family. The measured prose of each patch, its timbre facts and the
// five patches' median knobs are the rows', beside the numbers.

import { midiToHz, adsrEnv, route, panner, phasedLfo, startTime, noiseSource, GAIN_FLOOR, MIN_RELEASE } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert, pair, rampFrequency } from './treat.ts';
import { knobScale } from './descriptor.ts';
import type { Knobs, NoteParams, VoiceRenderer } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import { centsOf, liveOf } from './live.ts';
import type { SoundRow, Topology } from './sound.ts';
import type { PatchOf } from './schema.ts';
import { bool, contract, inUnit, list, maybe, num, table, CENTS, HZ, LFO_HZ, SECONDS, UNIT } from './schema.ts';

/** A field of the edge a place writes, in the range `grain.ts` admits it. */
const edgeField = (lo: number, hi: number, unit?: 'hz' | 'seconds' | 'level' | 'ratio' | 'x') => (unit ? inUnit(num(lo, hi), unit) : num(lo, hi));

/**
 * What a keys row carries (`schema.ts`): one patch — its tone, its envelope,
 * its family — and the amplifier it plays through. The FM parts are `null` on
 * the organ and the pluck, which build none, and the tine on every patch but
 * the electric piano.
 */
const PARAMETERS = contract({
  cutoff: HZ,
  /** the two oscillators' spread, in cents */
  det: inUnit(num(0, 100), 'cents'),
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  /** the formant's peak: its centre in Hz and its gain in dB */
  formant: list(num(-24, 20000), 2),
  ratio: maybe(inUnit(num(0.01, 32), 'x')),
  /** the body's modulation index: at nought velocity, and what a full one adds */
  index: maybe(list(num(0, 32), 2)),
  indexDecay: maybe(inUnit(num(0.001, 8), 'seconds')),
  tine: maybe(inUnit(num(0, 32), 'x')),
  tineIndex: maybe(list(num(0, 32), 2)),
  tineDecay: maybe(inUnit(num(0.001, 8), 'seconds')),
  tremolo: bool(),
  rotary: bool(),
  organ: bool(),
  pluck: bool(),
  hpHz: HZ,
  tremoloHz: LFO_HZ,
  tremoloDepth: UNIT,
  tremoloPan: inUnit(num(-1, 1), 'ratio'),
  rotaryHz: LFO_HZ,
  rotaryDepth: UNIT,
  /** the edge and the strike a place writes (round SPARK-1, `grain.ts`): a level and a strike of nought build nothing */
  edge: table({
    level: edgeField(0, 1, 'level'), hz: edgeField(800, 12000, 'hz'), decay: edgeField(0.005, 2, 'seconds'), tine: edgeField(0.25, 8, 'x'),
    hold: edgeField(0, 1, 'ratio'), chiff: edgeField(0, 1, 'level'), chiffHz: edgeField(1000, 12000, 'hz'), chiffDecay: edgeField(0.002, 0.1, 'seconds'),
  }),
}, (f) => {
  const bad: string[] = [];
  if (f.organ && f.pluck) bad.push('it is an organ and a pluck: one family a patch');
  if (!(f.formant[0] >= 20 && f.formant[0] <= 20000 && f.formant[1] >= -24 && f.formant[1] <= 24)) bad.push(`the formant ${JSON.stringify(f.formant)} is not a centre of 20 Hz to 20 kHz and a gain of -24 to 24 dB`);
  const fm = !f.organ && !f.pluck;
  if (fm && (f.ratio === null || f.index === null || f.indexDecay === null)) bad.push('an FM patch with no modulator: its ratio, index and index decay are wanted');
  if (!fm && [f.ratio, f.index, f.indexDecay, f.tine, f.tineIndex, f.tineDecay].some((x) => x !== null)) bad.push('an organ or a pluck builds no modulator, so its FM parts are null');
  if (f.index && !(f.index[0] >= 0.001)) bad.push(`the index ${JSON.stringify(f.index)} starts at nothing`);
  if (f.tine && (f.tineIndex === null || f.tineDecay === null)) bad.push('a tine with no index or no decay');
  if (f.tineIndex && !(f.tineIndex[0] >= 0.001)) bad.push(`the tine's index ${JSON.stringify(f.tineIndex)} starts at nothing`);
  return bad;
});

/** A keys row's numbers, as the room voices them. */
type KeysPatch = PatchOf<typeof PARAMETERS.fields>;

/** What a style may write over one patch's tone (`keyboardPatches.<name>`): never its family or its envelope. */
export const KEYBOARD_VOICED = ['cutoff', 'det', 'formant', 'ratio', 'index', 'indexDecay', 'tine', 'tineIndex', 'tineDecay', 'tremolo'] as const;
/** What the room writes of the amplifier (`keys`). */
const AMP_VOICED = ['hpHz', 'tremoloHz', 'tremoloDepth', 'tremoloPan', 'rotaryHz', 'rotaryDepth', 'edge'] as const;

function keys(
  row: SoundRow,
  preset: KeysPatch,
  K: Knobs,
  ctx: BaseAudioContext,
  out: VoiceOut,
  time: number,
  p: NoteParams = {},
  settings: Settings,
): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const hz = midiToHz(p.midi);
  const sustain = !!p.sustain;
  const dur = Math.max(0.08, p.dur ?? 0.3);
  const vel = p.vel ?? 1;

  // The three knobs, as factors against this patch's own numbers: exactly 1
  // with nothing asked for, and `x * 1 === x` for every finite double.
  const kBright = knobScale(p, K, 'brightnessHz');
  const kHold = knobScale(p, K, 'hold');
  const kAttack = knobScale(p, K, 'attack');
  // The edge and the strike (round SPARK-1), where a place wrote them, by the
  // grain knob; at rest the row's edge and strike are nought, nothing below is
  // built and the graph is the one the record always played.
  const E = preset.edge;
  const kGrain = knobScale(p, K, 'grain');
  const edgeLevel = E.level * kGrain;
  const chiffLevel = E.chiff * kGrain;

  // Held, the note is the chord and it takes the whole span; struck, it is a
  // stab and the decay is most of what a listener hears.
  const patchAttack = preset.attack * kAttack;
  const attack = sustain ? (p.attack ?? Math.max(patchAttack, 0.02)) : patchAttack;
  const decay = Math.min(preset.decay * kHold, Math.max(0.05, dur * (sustain ? 0.5 : 0.9)));
  const hold = sustain ? Math.max(0, dur - attack - decay) : 0;
  // The tail the knob lengthens is the whole of it: the release the note was
  // going to take, times the factor. A sustain is a fraction and stops at one.
  const release = (sustain
    ? (p.release ?? Math.min(1.6, Math.max(0.25, dur * 0.35)))
    : preset.pluck
      ? Math.max(0.16, dur * 0.4)
      : Math.max(0.3, dur * 0.8)) * kHold;

  const g = ctx.createGain();
  const end = adsrEnv(g, time, vel * (p.gain ?? 1), {
    attack,
    decay,
    sustain: Math.min(0.98, preset.sustain * kHold),
    hold,
    release,
    fadeCurve: p.fadeCurve,
  });

  // Static, both of them. Velocity opens the cutoff a little — a hard note is
  // brighter than a soft one — but nothing moves once the note has started.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  const cut = Math.min(9000, ((p.open ?? preset.cutoff) * kBright) * (0.75 + 0.5 * vel));
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
  rampFrequency(hp.frequency, preset.hpHz * hpMul[0], preset.hpHz * hpMul[1], time, end);

  lp.connect(form);
  form.connect(hp);
  hp.connect(g);

  // **The edge** (round SPARK-1): the note's own oscillators, before the
  // lowpass, high-passed at the place's corner and summed back in after it —
  // through the formant's peak, the DJ filter and the envelope like the rest
  // of the note — at a level that falls from the strike to a fraction of
  // itself. The lowpass path is untouched, so the note keeps its octave and
  // its tone and the grain comes through beside it: on the electric piano it
  // is the tine's own clang, on the pluck the saw's top, on the organ the
  // drawbars' few partials over the corner. The high-passes put the note's
  // fundamental sixty decibels and more under the copy's band.
  let into: AudioNode = lp;
  if (edgeLevel > 0) {
    const sum = ctx.createGain();
    sum.connect(lp);
    const eh1 = ctx.createBiquadFilter();
    eh1.type = 'highpass';
    eh1.Q.value = -3.01;
    eh1.frequency.value = E.hz;
    const eh2 = ctx.createBiquadFilter();
    eh2.type = 'highpass';
    eh2.Q.value = -3.01;
    eh2.frequency.value = E.hz;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0, time);
    eg.gain.linearRampToValueAtTime(edgeLevel, time + 0.002);
    eg.gain.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, edgeLevel * E.hold), time + 0.002 + E.decay);
    sum.connect(eh1);
    eh1.connect(eh2);
    eh2.connect(eg);
    eg.connect(form);
    into = sum;
  }

  // The electric piano's tremolo and the organ's rotary are the same idea: the
  // amplifier, not the note. MEASURED at 5.2 and 5.0 Hz respectively, and this
  // family carries the highest AM prominence in the study.
  // the oscillators a spread in cents reaches, each with its side; the FM's modulators and tines by their ratio
  const spreadBy: Array<[OscillatorNode, number]> = [];
  const mods: OscillatorNode[] = [];
  const tines: OscillatorNode[] = [];
  let wobble: { trem: GainNode; amt: GainNode; lfo: OscillatorNode; panLfo: OscillatorNode; panAmt: GainNode } | null = null;
  let tail: AudioNode = g;
  if ((preset.tremolo && p.tremolo) || preset.rotary) {
    const rate = preset.rotary ? preset.rotaryHz : preset.tremoloHz;
    const depth = preset.rotary ? preset.rotaryDepth : preset.tremoloDepth;
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
    panAmt.gain.value = preset.tremoloPan;
    const panLfo = phasedLfo(ctx, rate, (p.midi % 4) * 1.4 + Math.PI / 2);
    panLfo.connect(panAmt);
    panAmt.connect(pn.pan);
    panLfo.start(time);
    panLfo.stop(end + 0.02);
    trem.connect(pn);
    tail = pn;
    wobble = { trem, amt, lfo, panLfo, panAmt };
  }

  if (preset.organ) {
    [[1, 0.5], [2, 0.26], [3, 0.16], [4, 0.09]].forEach(([mult, amp], i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * mult;
      o.detune.value = preset.det * (i % 2 ? 1 : -1);
      spreadBy.push([o, i % 2 ? 1 : -1]);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(into);
      o.start(time);
      o.stop(end + 0.02);
    });
  } else if (preset.pluck) {
    [0, preset.det].forEach((cents, i) => {
      const o = ctx.createOscillator();
      o.type = i ? 'square' : 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = cents * (i ? 1 : -1);
      if (i) spreadBy.push([o, 1]);
      const og = ctx.createGain();
      og.gain.value = i ? 0.18 : 0.4;
      o.connect(og);
      og.connect(into);
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
      mod.frequency.value = hz * preset.ratio!;
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(hz * (preset.index![0] + preset.index![1] * vel), time);
      modGain.gain.exponentialRampToValueAtTime(hz * 0.1, time + preset.indexDecay!);
      mod.connect(modGain);
      modGain.connect(car.frequency);
      mods.push(mod);
      mod.start(time);
      mod.stop(end + 0.02);

      // The tine: a high ratio whose index is gone in 120 ms, so the clang is
      // the attack and not the note.
      if (preset.tine) {
        const tin = ctx.createOscillator();
        tin.type = 'sine';
        tin.frequency.value = hz * preset.tine;
        const tinGain = ctx.createGain();
        // The edge's factor on the clang (round SPARK-1), where a place asks.
        const tineK = edgeLevel > 0 ? E.tine : 1;
        tinGain.gain.setValueAtTime(hz * (preset.tineIndex![0] + preset.tineIndex![1] * vel) * tineK, time);
        tinGain.gain.exponentialRampToValueAtTime(hz * 0.02, time + preset.tineDecay!);
        tin.connect(tinGain);
        tinGain.connect(car.frequency);
        tines.push(tin);
        tin.start(time);
        tin.stop(end + 0.02);
      }

      const cg = ctx.createGain();
      cg.gain.value = i ? 0.35 : 0.55;
      car.connect(cg);
      cg.connect(into);

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
    spreadBy.push([up, 0.5]);
    const ug = ctx.createGain();
    ug.gain.value = 0.22 * p.doubleTop;
    up.connect(ug);
    ug.connect(into);
    up.start(time);
    up.stop(end + 0.02);
  }

  // **The strike** (round SPARK-1): a few milliseconds of band-passed noise
  // on the note's onset, after the envelope so the patch's own attack does not
  // swallow it, at the note's velocity and gain. Built where a place asks.
  if (chiffLevel > 0) {
    const sum = ctx.createGain();
    tail.connect(sum);
    const dur = E.chiffDecay * 6;
    const n = noiseSource(ctx, time, dur + MIN_RELEASE + 0.01);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = E.chiffHz;
    bp.Q.value = 1.2;
    // Mono, as the note is: a stereo strike would turn the whole note stereo
    // at the sum, and the keys' chorus pans a mono note and a stereo one by
    // different laws (0.9 dB louder, MEASURED on seed 1 theme two).
    bp.channelCount = 1;
    bp.channelCountMode = 'explicit';
    const cgn = ctx.createGain();
    const peak = Math.max(GAIN_FLOOR, chiffLevel * vel * (p.gain ?? 1));
    cgn.gain.setValueAtTime(0, time);
    cgn.gain.linearRampToValueAtTime(peak, time + 0.0015);
    cgn.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + 0.0015 + dur);
    cgn.gain.linearRampToValueAtTime(0, time + 0.0015 + dur + MIN_RELEASE);
    n.connect(bp);
    bp.connect(cgn);
    cgn.connect(sum);
    tail = sum;
  }

  // The stage's colour is on this voice's own filters, above (`own`).
  // **What this note can still take** (PLAN-DESK D1b): the corner and the
  // floor as a `detune` on their filters (the stage's walk kept), the spread
  // between the oscillators, the FM's ratios, and the amplifier's tremolo or
  // rotary — its rate, depth and side — where this patch built one. The
  // envelope, the index's fall, the edge's strike and the family are the
  // build's.
  const live = liveOf(ctx);
  if (live) {
    const lid = (v: number) => Math.min(9000, (v * kBright) * (0.75 + 0.5 * vel));
    const spin = !!preset.rotary;
    const w = wobble;
    live
      .on('cutoff', (v) => (p.open != null ? [] : [[lp.detune, centsOf(lid(v), cut)]]))
      .on('hpHz', (v) => [[hp.detune, centsOf(v, preset.hpHz)]])
      .on('det', (v) => spreadBy.map(([o, side]) => [o.detune, v * side] as [AudioParam, number]));
    if (mods.length) live.on('ratio', (v) => mods.map((m) => [m.frequency, hz * v] as [AudioParam, number]));
    if (tines.length) live.on('tine', (v) => tines.map((t) => [t.frequency, hz * v] as [AudioParam, number]));
    if (w) {
      const rate = (v: number): Array<[AudioParam, number]> => [[w.lfo.frequency, v], [w.panLfo.frequency, v]];
      const depth = (v: number): Array<[AudioParam, number]> => [[w.trem.gain, 1 - v], [w.amt.gain, v]];
      live
        .on(spin ? 'rotaryHz' : 'tremoloHz', rate)
        .on(spin ? 'rotaryDepth' : 'tremoloDepth', depth)
        .on('tremoloPan', (v) => [[w.panAmt.gain, v]]);
    }
    live.keep(row.id, row, settings, end + 0.02);
  }

  route(ctx, insert(ctx, p, tail, time, end, settings, { stage: true }), out, { dry: 1, delay: p.delay ?? 0.28, reverb: p.reverb ?? 0.22 });
  return end;
}


/**
 * The keys topology (`sounds/keyboard/keys*.json` since round SOUNDS-R3): one
 * keyboard patch through its amplifier, its numbers the row's with the room's
 * `keys` block and the style's voicing of that patch over them. Not an event
 * name of its own: the two dispatchers (`keys` struck, `pad` held) render
 * through it.
 */
export const KEYS: Topology = {
  id: 'keys',
  cost: 'dear',
  parameters: PARAMETERS,
  voiced: [...KEYBOARD_VOICED, ...AMP_VOICED],
  render: (row): VoiceRenderer => {
    const K = row.descriptor.knobs ?? {};
    return (ctx, out, time, p = {}, settings) => keys(row, patchOf(settings, row, PARAMETERS), K, ctx, out, time, p, settings);
  },
  // D1b: what a sounding key can still take; its envelope, its index's fall, the edge's strike and its family are the build's
  live: {
    cutoff: 'hz', hpHz: 'hz', det: 'cents', ratio: 'x', tine: 'x',
    tremoloHz: 'hz', tremoloDepth: 'ratio', tremoloPan: 'pan', rotaryHz: 'hz', rotaryDepth: 'ratio',
  },
  // Three of a patch's timbre facts are read off the patch, so they cannot
  // drift from the sound: whether it is struck (it is not an organ), what of
  // it still sounds at the bar line (its sustain) and its corner. The fourth,
  // the loudness, is MEASURED (`tools/loudness-fit.ts --timbres`).
  check: (row: SoundRow) => {
    const q = row.parameters as KeysPatch;
    return Object.entries(row.descriptor.timbres).flatMap(([t, f]) => [
      ...(f.struck === !q.organ ? [] : [`${row.id}: the timbre ${t} says struck ${f.struck} and the patch is ${q.organ ? '' : 'not '}an organ`]),
      ...(f.hold === q.sustain ? [] : [`${row.id}: the timbre ${t} holds ${f.hold} and the patch's sustain is ${q.sustain}`]),
      ...(f.brightnessHz === q.cutoff ? [] : [`${row.id}: the timbre ${t} is bright to ${f.brightnessHz} Hz and the patch's corner is ${q.cutoff}`]),
    ]);
  },
};
