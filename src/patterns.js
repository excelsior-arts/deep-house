// The musical rules. The vocabulary is no longer hand-written: bass, stab and
// hat figures are drawn from masks mined out of the reference sets (see
// src/corpus.js), weighted by how often they actually occur. What stays
// hand-written is how a figure is varied across a phrase and how a contour
// becomes a note under the chord that is sounding.
//
// The grid is 16 steps to the bar. Swing bends the second half of each beat;
// measured at 49.8% it is straight, but the dial is still here.

import PARAMS from './params.js';
import { foldTo, scaleNote } from './theory.js';

export const STEPS_PER_BAR = 16;

export function stepToBeats(step, swing = PARAMS.swing) {
  const beat = Math.floor(step / 4);
  const sub = step % 4;
  const f = [0, swing / 2, swing, swing + (1 - swing) / 2][sub];
  return beat + f;
}

export function maskSteps(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] === 'x') out.push(i);
  return out;
}

// Draw by count, but flattened: the corpus is very top-heavy (one stab mask is
// 434 of 2966 bars) and a generator that always picks the mode is a generator
// with one idea. The exponent keeps the ranking and widens the tail.
function draw(rng, list, power = 0.6) {
  return rng.weighted(list.map((t) => ({ v: t, w: Math.pow(t.c, power) })));
}

// ---------------------------------------------------------------- drums ---

// MEASURED: four on the floor, all four slots within 1% of each other.
export function kickPattern(rng, { fill, sparse }) {
  const hits = [];
  for (let step = 0; step < 16; step += 4) {
    if (sparse && step !== 0 && step !== 8) continue;
    hits.push({ step, vel: step === 0 ? 1 : 0.98 + rng.float(-0.01, 0.01) });
  }
  if (fill && rng.chance(0.25)) hits.push({ step: 14, vel: 0.8 });
  return hits;
}

// A hat figure is one of the mined masks, drawn once per track. The mask
// carries a level per step, so the velocity shape is the corpus's, not mine.
// The offbeat eighths are hats; anything between them is the shaker layer.
export function pickHatMask(rng, corpus) {
  const usable = corpus.hats.filter((h) => h.m.includes('x'));
  return draw(rng, usable);
}

export function hatPattern(rng, template, { openHat, sixteenths, corpus }) {
  const hits = [];
  const cv = PARAMS.groove.hatVelocityCv;
  const steps = maskSteps(template.m);
  const levels = template.v || [];

  for (const step of steps) {
    // MEASURED: the on-beat energy in the hat bands is the kick leaking, not a
    // part. Nothing of ours fires on the beat.
    if (step % 4 === 0) continue;
    const offbeat = step % 4 === 2;
    if (!offbeat && !sixteenths) continue;
    const base = levels[step] ?? (offbeat ? 0.9 : 0.3);
    const vel = Math.max(0.2, Math.min(1, base * (1 + rng.float(-cv, cv))));
    hits.push({ step, voice: offbeat ? 'hatClosed' : 'shaker', vel });
  }

  // MEASURED: 43% of detected open hats sit on an offbeat eighth. The open hat
  // takes over whichever one the corpus is most likely to open.
  if (openHat) {
    const candidates = hits.filter((h) => h.step % 4 === 2);
    if (candidates.length) {
      const chosen = rng.weighted(
        candidates.map((h) => ({ v: h, w: (corpus.openHatByStep[h.step] ?? 100) }))
      );
      chosen.voice = 'hatOpen';
      chosen.vel = Math.min(1, chosen.vel * 1.05);
    }
  }
  return hits;
}

// MEASURED: clap on 2 and 4, soft — only 1.13x the downbeat energy.
export function clapPattern(rng, { ghost }) {
  const hits = [{ step: 4, vel: 0.95 }, { step: 12, vel: 1 }];
  if (ghost && rng.chance(PARAMS.groove.ghostClapChance)) {
    hits.push({ step: rng.pick([11, 15, 7]), vel: 0.35 });
  }
  return hits;
}

// ----------------------------------------------------------------- bass ---
//
// MEASURED: the bass is not an offbeat stab. Its energy never falls to zero
// between kicks; what moves on the offbeat is the pitch. The corpus stores
// where those pitch changes land, and what interval above the chord root each
// one takes — `.x..............` (one note, then held) is the single commonest
// bar in 2966, and `.xx..xx..xx..xx.` is the second.

const CONTOUR = { R: 0, '9': 2, m3: 3, '4': 5, '5': 7, b7: 10, x: 0 };

export function countSteps(mask) {
  let n = 0;
  for (const c of mask) if (c === 'x') n++;
  return n;
}

// Deep house is minimal: two to four note changes in a bar, the note held in
// between, and space where a busier genre would put another note.
//
// The corpus disagrees — its second most common mask has eight note starts —
// but the analyst rated bass-mask confidence low-medium for exactly the reason
// that matters here: with the kick and the bass in the same band, the detector
// counts the sidechain pumping and the kick bleeding as note starts. So the
// corpus overstates density, and the cap is a correction to a known bias
// rather than a preference.
export function pickBassTemplate(rng, corpus, maxNotes = 4) {
  const pool = corpus.bass16.filter((t) => {
    const n = countSteps(t.m);
    return n >= 1 && n <= maxNotes;
  });
  const usable = pool.length ? pool : corpus.bass16;
  // Weighted by how often it occurs, and then again toward the sparse end.
  return rng.weighted(
    usable.map((t) => ({ v: t, w: Math.pow(t.c, 0.6) / Math.max(1, countSteps(t.m) - 1) }))
  );
}

// If a preset or the corpus hands over something denser than the budget, thin
// it: keep the first change of each beat, drop the rest from the back.
export function thinMask(template, maxNotes) {
  const steps = maskSteps(template.m);
  if (steps.length <= maxNotes) return template;
  const keep = [];
  const seenBeat = new Set();
  for (const st of steps) {
    const beat = Math.floor(st / 4);
    if (!seenBeat.has(beat)) {
      seenBeat.add(beat);
      keep.push(st);
    }
  }
  const trimmed = keep.slice(0, maxNotes);
  const m = Array.from({ length: 16 }, (_, i) => (trimmed.includes(i) ? 'x' : '.')).join('');
  const k = template.k ? trimmed.map((st) => template.k[steps.indexOf(st)] ?? 'R') : undefined;
  return { ...template, m, k };
}

// A template becomes a list of {step, interval}.
export function bassChanges(template, { chordChanged }) {
  const steps = maskSteps(template.m);
  const k = template.k || [];
  const changes = steps.map((step, i) => ({
    step,
    interval: CONTOUR[k[i]] ?? 0,
  }));
  // The root moves with the chord; that is harmony, not groove, so it lands on
  // the downbeat even though measured changes never do.
  if (chordChanged && !changes.some((c) => c.step === 0)) {
    changes.unshift({ step: 0, interval: 0 });
  }
  if (!changes.length) changes.push({ step: 0, interval: 0 });
  return changes.sort((a, b) => a.step - b.step);
}

// One transformation per variation point: drop a note, add a pickup into the
// next bar, or throw one an octave up.
export function varyBass(rng, changes, strength) {
  let out = changes.map((c) => ({ ...c }));
  const moves = strength === 'big' ? 2 : 1;
  for (let i = 0; i < moves; i++) {
    const what = rng.weighted([
      { v: 'drop', w: out.length > 1 ? 2 : 0 },
      { v: 'pickup', w: 2.5 },
      { v: 'octave', w: 2 },
      { v: 'shift', w: 1.5 },
    ]);
    if (what === 'drop' && out.length > 1) {
      const idx = 1 + rng.int(0, out.length - 1);
      out.splice(Math.min(idx, out.length - 1), 1);
    } else if (what === 'pickup') {
      const step = rng.pick([14, 15]);
      if (!out.some((c) => c.step === step)) {
        out.push({ step, interval: rng.pick([0, 7, 10]), pickup: true });
      }
    } else if (what === 'octave') {
      const c = out[rng.int(0, out.length)];
      if (c) c.octave = !c.octave;
    } else {
      const c = out[rng.int(0, out.length)];
      if (c && c.step > 0) {
        const step = Math.max(1, Math.min(15, c.step + rng.pick([-1, 1])));
        if (!out.some((m) => m.step === step)) c.step = step;
      }
    }
  }
  return out.sort((a, b) => a.step - b.step);
}

// The budget applies after the variations too, or a "small change every four
// bars" quietly turns three notes into six.
export function capChanges(changes, budget) {
  if (changes.length <= budget) return changes;
  const kept = [];
  const seenBeat = new Set();
  for (const c of changes) {
    const beat = Math.floor(c.step / 4);
    if (c.step === 0 || !seenBeat.has(beat)) {
      seenBeat.add(beat);
      kept.push(c);
    }
    if (kept.length >= budget) break;
  }
  return kept.length ? kept : changes.slice(0, budget);
}

// Turn a contour interval into a MIDI note under the chord that is sounding.
// MEASURED: MIDI 29-41, never above 45.
// How much a note gives back for being low. Notes under the reference are
// trimmed per octave, so a track in a low key is as loud as one in a high key
// rather than louder — the kick body and the sub stop stacking.
export function bassLowTrim(midi) {
  const B = PARAMS.bass;
  const hz = 440 * Math.pow(2, (midi - 69) / 12);
  if (hz >= B.tiltRefHz) return 1;
  return Math.pow(10, (-B.lowTiltDb * Math.log2(B.tiltRefHz / hz)) / 20);
}

export function bassNote(chord, change) {
  const R = PARAMS.register;
  // Fold toward the register's centre, not up off its floor: folding up from a
  // floor puts every root in the top of the window, which is how a bass ends
  // up an octave above where the benchmarks put theirs.
  const pc = ((chord.rootMidi + (change.interval ?? 0)) % 12 + 12) % 12;
  let m = pc + 12 * Math.round((R.subCenter - pc) / 12);
  while (m < R.subLow) m += 12;
  while (m > R.subHigh) m -= 12;
  if (change.octave && m + 12 <= R.subCeiling) return m + 12;
  return m;
}

// ----------------------------------------------------------------- keys ---
//
// MEASURED: 434 of 2966 bars put a chord on every beat, which is the single
// commonest stab figure by a distance; the rest of the table is where the
// variety lives.

export function pickStabMask(rng, corpus) {
  const usable = corpus.stabs.filter((t) => t.m.includes('x'));
  return draw(rng, usable);
}

export function stabsFromMask(rng, template) {
  return maskSteps(template.m).map((step) => ({
    step,
    vel: 0.62 + rng.float(-0.12, 0.18),
    len: rng.weighted([{ v: 1, w: 2 }, { v: 2, w: 3 }, { v: 4, w: 2 }]),
    // Roll the voicing a little, like a hand not quite together.
    spread: rng.float(0.004, 0.016),
    // Sometimes only the top of the chord speaks.
    top: rng.chance(0.3),
  }));
}

export function varyStabs(rng, motif) {
  const out = motif.map((n) => ({ ...n }));
  if (rng.chance(0.45) && out.length > 1) out.splice(rng.int(0, out.length), 1);
  if (rng.chance(0.55)) {
    const step = rng.pick([2, 3, 6, 7, 10, 11, 14, 15]);
    if (!out.some((n) => n.step === step)) {
      out.push({ step, vel: 0.6, len: 2, spread: 0.01, top: rng.chance(0.4) });
    }
  }
  return out.sort((a, b) => a.step - b.step);
}

// ---------------------------------------------------------------- piano ---
//
// Two roles, and a die picks which one a theme gets. Both are minimal on
// purpose: the deep house piano is a few notes a bar a long way back in a
// room, and the silence between them is as much of the part as the notes.

// The pool an arpeggio draws from: the chord's own tones plus the ninth, every
// octave of them inside the piano's register.
export function pianoPool(chord, progression, low = 55, high = 84) {
  const pcs = new Set(chord.notes.map((n) => ((n % 12) + 12) % 12));
  const ninth = scaleNote(progression.root, progression.scale, chord.degree + 8);
  pcs.add(((ninth % 12) + 12) % 12);
  const out = [];
  for (let m = low; m <= high; m++) if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

// Where in the bar an arpeggio may fire. Never more than four, usually two or
// three, and never a run of sixteenths.
const ARP_SLOTS = [
  { v: [0, 6, 12], w: 3 },
  { v: [0, 8], w: 3 },
  { v: [6, 12], w: 2 },
  { v: [2, 8, 14], w: 2 },
  { v: [0, 4, 10, 14], w: 1.5 },
  { v: [0, 6, 10, 14], w: 1 },
];

export const ARP_CONTOURS = ['up', 'down', 'upHold', 'broken'];

// (a) The minimal arpeggio: chord tones with the ninth, one at a time, two to
// four in a bar. The contour is held for a phrase so the figure is a figure.
export function pianoArp(rng, pool, { maxNotes = 3, contour = 'up', base = null } = {}) {
  if (!pool.length) return [];
  let slots = rng.weighted(ARP_SLOTS);
  if (slots.length > maxNotes) slots = slots.slice(0, maxNotes);
  const n = slots.length;
  const start = Math.max(0, Math.min(pool.length - n, base == null ? Math.floor(pool.length / 2) - 1 : base));
  const order = {
    up: (i) => i,
    down: (i) => n - 1 - i,
    upHold: (i) => Math.min(i, Math.max(0, n - 2)),
    broken: (i) => [0, 2, 1, 3][i % 4],
  }[contour] || ((i) => i);
  const top = pool[pool.length - 1];
  return slots.map((step, i) => {
    const idx = Math.max(0, Math.min(pool.length - 1, start + order(i)));
    let midi = pool[idx];
    // An octave shift now and then, so the figure is not a ladder.
    if (rng.chance(0.12) && midi + 12 <= top) midi += 12;
    return { step, midi, vel: (step === 0 ? 0.78 : 0.64) + rng.float(-0.07, 0.1) };
  });
}

// Where a melody note may land: the strong positions plus a few weak ones.
// Nothing on a sixteenth that is not the last one of a beat.
const MEL_POSITIONS = [0, 4, 6, 8, 12, 14];
const MEL_MOVES = [
  { v: 1, w: 4 }, { v: -1, w: 4 }, { v: 2, w: 2.5 }, { v: -2, w: 2.5 },
  { v: 3, w: 1 }, { v: -3, w: 1 }, { v: 0, w: 1 },
];

// (b) The simple melody: a two or four bar phrase of three to six scale notes,
// steps and small leaps, the strong positions left for the chord to claim.
export function makeMelody(rng, scalePool, { bars = 2, center = 69 } = {}) {
  if (!scalePool.length) return [];
  const n = rng.int(3, 7); // 3-6 notes
  const positions = [];
  for (let b = 0; b < bars; b++) for (const st of MEL_POSITIONS) positions.push(b * 16 + st);
  const chosen = new Set([rng.chance(0.7) ? 0 : 8]);
  let guard = 0;
  while (chosen.size < n && guard++ < 60) chosen.add(rng.pick(positions));
  const steps = [...chosen].sort((a, b) => a - b);

  let idx = scalePool.findIndex((m) => m >= center);
  if (idx < 0) idx = Math.floor(scalePool.length / 2);
  return steps.map((abs, i) => {
    if (i > 0) idx = Math.max(0, Math.min(scalePool.length - 1, idx + rng.weighted(MEL_MOVES)));
    const step = abs % 16;
    return {
      bar: Math.floor(abs / 16),
      step,
      midi: scalePool[idx],
      vel: 0.68 + rng.float(-0.08, 0.12),
      strong: step === 0 || step === 8,
    };
  });
}

// One small change, once, across the eight-bar loop: a note moves, a note
// goes, one is thrown an octave, or one is added. A phrase that repeats
// identically for eight bars is a loop; a phrase with one change is a part.
export function varyMelody(rng, phrase, scalePool) {
  const out = phrase.map((n) => ({ ...n }));
  if (!out.length) return out;
  const what = rng.weighted([
    { v: 'move', w: 3 },
    { v: 'drop', w: out.length > 3 ? 2 : 0 },
    { v: 'octave', w: 1 },
    { v: 'add', w: 1.5 },
  ]);
  const i = rng.int(0, out.length);
  if (what === 'move') {
    const at = scalePool.indexOf(out[i].midi);
    if (at >= 0) out[i].midi = scalePool[Math.max(0, Math.min(scalePool.length - 1, at + rng.pick([-1, 1, 2, -2])))];
  } else if (what === 'drop') {
    out.splice(i, 1);
  } else if (what === 'octave') {
    const up = out[i].midi + 12;
    if (scalePool.includes(up)) out[i].midi = up;
  } else {
    const last = out[out.length - 1];
    const step = rng.pick([6, 14]);
    if (!out.some((n) => n.bar === last.bar && n.step === step)) {
      const at = Math.max(0, scalePool.indexOf(last.midi));
      out.push({
        bar: last.bar,
        step,
        midi: scalePool[Math.max(0, Math.min(scalePool.length - 1, at + rng.pick([-1, 1])))],
        vel: 0.6,
        strong: false,
      });
    }
  }
  return out.sort((a, b) => a.bar * 16 + a.step - (b.bar * 16 + b.step));
}

// A strong position belongs to the chord. If the phrase's note is not in it,
// move to the nearest tone that is.
export function snapToChord(midi, chord) {
  const pcs = new Set(chord.notes.map((n) => ((n % 12) + 12) % 12));
  if (pcs.has(((midi % 12) + 12) % 12)) return midi;
  for (let d = 1; d <= 6; d++) {
    if (pcs.has((((midi + d) % 12) + 12) % 12)) return midi + d;
    if (pcs.has((((midi - d) % 12) + 12) % 12)) return midi - d;
  }
  return midi;
}

export default {
  stepToBeats,
  maskSteps,
  kickPattern,
  pickHatMask,
  hatPattern,
  clapPattern,
  pickBassTemplate,
  thinMask,
  countSteps,
  bassChanges,
  varyBass,
  capChanges,
  bassNote,
  bassLowTrim,
  pickStabMask,
  stabsFromMask,
  varyStabs,
  pianoPool,
  pianoArp,
  makeMelody,
  varyMelody,
  snapToChord,
};
