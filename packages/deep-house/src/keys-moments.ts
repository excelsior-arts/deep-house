// **The keys' moments** (round keys-moments, 10-29; his idea: *"piano solo moment, or some motif that not necessary
// following the same phrase across the track, as even that gets repetitive"*; his ear on the sketches: *"color in
// breakdown - great"*, *"either solo or second riff both sound good"*). Two moments the keys may take,
// each where the form makes room for it and only in a share of those themes (neither is a must, or the moment becomes
// the next repetition):
//
//   the solo   a long breakdown's last phrase goes to the keys alone: a free line made of the keys' own notes (the
//              phrase's, or the hook's where a hook is the keys, never the hook itself, so its return is still an event),
//              two calls and two answers over the keys' own soft chords, late into each phrase and later at the cadence,
//              landing on the chord and stepping back for the section after
//   the riff   in a long stretch of one hook (a long main or drop), eight bars of the hook's notes over the same chords
//              on a new two-bar rhythm, its top reaching the chord's tones over the hook, then the hook again
//
// Every musical choice is the row's (`recipes/arrangement/keys-moments.json`): the shares and their leans, the lengths,
// the cells, the contours, the levels. This file is the mechanism: it reads the form and the keys it is handed, names no
// place, genre, seed or track, and draws off streams of its own (`<seed>::keys-solo`, `<seed>::keys-riff`,
// `<seed>::keys-solo-line`), so no other draw of a theme moves. Pure: no DOM, no engine.
import Rng from './rng.ts';
import type { Seed } from './rng.ts';
import { leaned } from './lean.ts';
import ROW_FILE from '../recipes/arrangement/keys-moments.json' with { type: 'json' };

/** A cell's note: [sixteenth of the two-bar cell, beats held, accent, ms late, mark]. */
export type SoloCellNote = readonly [number, number, number, number, 's' | 'p' | 'L' | 'C'];
/** A riff's note: [bar of the four-bar cell, sixteenth, `h<i>` or `c<k>`, beats held, accent]. */
export type RiffCellNote = readonly [number, number, string, number, number];

export interface KeysMomentsRow {
  leans: Record<string, unknown>;
  solo: {
    chance: number; least: number; bars: number; into: readonly string[]; span: number; over: number;
    level: number; chordLevel: number; ringBeats: number; order: readonly string[];
    cells: Readonly<Record<string, readonly SoloCellNote[]>>; shapes: Readonly<Record<string, readonly number[]>>;
  };
  riff: { chance: number; least: number; bars: number; after: number; before: number; in: readonly string[]; level: number; cell: { notes: readonly RiffCellNote[] } };
}

/** The row's problems, or none. */
export function keysMomentsProblems(row: any): string[] {
  const bad: string[] = [];
  const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  if (!row) bad.push('no row');
  const S = row?.solo, R = row?.riff;
  if (!S || !num(S.chance, 0, 1) || !num(S.least, 8, 64) || !num(S.bars, 4, 16) || S.bars % 2 || !Array.isArray(S.into) || !num(S.span, 7, 24)
    || !num(S.over, 0, 12) || !num(S.level, 0.1, 2) || !num(S.chordLevel, 0, 1) || !num(S.ringBeats, 0, 8)) bad.push('solo: a chance, a least and a length in bars, the sections it leads into, its register and its levels');
  else {
    if (!Array.isArray(S.order) || S.order.length * 2 !== S.bars || S.order.some((k: string) => !S.cells?.[k] || !S.shapes?.[k])) bad.push('solo.order: a two-bar cell and a shape for every two bars');
    for (const [k, cell] of Object.entries(S.cells ?? {})) if (k !== 'says' && (!Array.isArray(cell) || !cell.length || (cell as any[]).some((n) => !Array.isArray(n) || n.length !== 5
      || !num(n[0], 0, 31) || !num(n[1], 0.25, 8) || !num(n[2], 0, 1) || !num(n[3], -100, 150) || !['s', 'p', 'L', 'C'].includes(n[4])))) bad.push(`solo.cells.${k}: [sixteenth, beats, accent, ms, mark]`);
    for (const [k, sh] of Object.entries(S.shapes ?? {})) if (k !== 'says' && (!Array.isArray(sh) || sh.length < 2 || (sh as any[]).some((h) => !num(h, 0, 1)))) bad.push(`solo.shapes.${k}: heights from 0 to 1`);
  }
  if (!R || !num(R.chance, 0, 1) || !num(R.least, 16, 128) || !num(R.bars, 4, 16) || R.bars % 4 || !num(R.after, 0, 64) || !num(R.before, 0, 64)
    || !Array.isArray(R.in) || !num(R.level, 0.1, 2) || !Array.isArray(R.cell?.notes) || !R.cell.notes.length
    || R.cell.notes.some((n: any) => !Array.isArray(n) || n.length !== 5 || !num(n[0], 0, 3) || !num(n[1], 0, 15) || !/^[hc]\d$/.test(n[2]) || !num(n[3], 0.25, 8) || !num(n[4], 0, 1)))
    bad.push('riff: a chance, its lengths, the sections it plays in, a level and a four-bar cell of [bar, sixteenth, h<i> or c<k>, beats, accent]');
  return bad;
}

export const KEYS_MOMENTS: KeysMomentsRow = (() => {
  const problems = keysMomentsProblems(ROW_FILE);
  if (problems.length) throw new Error(`recipes/arrangement/keys-moments.json: ${problems.join('; ')}`);
  return ROW_FILE as unknown as KeysMomentsRow;
})();

export interface Span { from: number; to: number }
/** What the moments' plan drew for a theme: each moment's span or null, and why. */
export interface KeysMomentsPlan {
  solo: Span | null;
  riff: Span | null;
  /** the chance each fitting moment had and the words for what happened */
  said: string[];
}

interface Section { kind: string; startBar: number; bars: number }

/**
 * **Where the moments go, and whether they play.** The solo: the last breakdown run of `least` bars or more that a
 * section the keys state follows (a build, a main, a drop), its last `bars`. The riff: the first main or drop of
 * `least` bars or more, an eight-bar line at least `after` bars in and `before` from its end that `free` lets play.
 * Each that fits plays on its own chance, leaned by the birds; one that does not fit draws nothing.
 */
export function planKeysMoments(seed: Seed, sections: readonly Section[], spell: Readonly<Record<string, number>>,
  fits: { solo: boolean; riff: boolean; free?: (span: Span) => boolean }, row: KeysMomentsRow = KEYS_MOMENTS): KeysMomentsPlan {
  const out: KeysMomentsPlan = { solo: null, riff: null, said: [] };
  const S = row.solo, R = row.riff;
  if (fits.solo) {
    let pick: Span | null = null;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].kind !== 'breakdown' || sections[i - 1]?.kind === 'breakdown') continue;
      let j = i; while (sections[j + 1]?.kind === 'breakdown') j++;
      const from = sections[i].startBar, to = sections[j].startBar + sections[j].bars;
      if (to - from >= S.least && S.into.includes(sections[j + 1]?.kind ?? '')) pick = { from: to - S.bars, to };
    }
    if (pick) {
      const p = Math.min(1, leaned(S.chance, 'solo', row.leans, spell));
      if (new Rng(`${seed}::keys-solo`).chance(p)) { out.solo = pick; out.said.push(`the solo ${pick.from}-${pick.to - 1} (its chance ${p.toFixed(2)})`); }
      else out.said.push(`no solo: the breakdown ${pick.from}-${pick.to - 1} kept its own (its chance ${p.toFixed(2)})`);
    }
  }
  if (fits.riff) {
    const long = sections.filter((s) => R.in.includes(s.kind) && s.bars >= R.least);
    const lines = long.flatMap((s) => {
      const out: Span[] = [];
      for (let b = s.startBar + R.after; b + R.bars <= s.startBar + s.bars - R.before; b += 8) out.push({ from: b, to: b + R.bars });
      return out;
    }).filter((x) => !fits.free || fits.free(x));
    if (lines.length) {
      const p = Math.min(1, leaned(R.chance, 'riff', row.leans, spell));
      if (new Rng(`${seed}::keys-riff`).chance(p)) { out.riff = lines[0]; out.said.push(`the second riff ${lines[0].from}-${lines[0].to - 1} (its chance ${p.toFixed(2)})`); }
      else out.said.push(`no second riff: the hook kept its stretch (its chance ${p.toFixed(2)})`);
    }
  }
  return out;
}

/** A note of a moment: its bar, its sixteenth, its pitches (a chord's low to high), its length in beats, its accent, how late. */
export interface MomentNote { bar: number; step: number; midi: number[]; beats: number; accent: number; ms: number; chord: boolean; vel?: number }

/**
 * **A moment at the keys' own level.** The keys' laid notes before it (`laid`: each note's time and velocity) give the
 * level a strike of theirs has: the median velocity, lifted by the strikes' voices as a chord sums (a tone's power its
 * velocity to the fourth, so n tones at v sound as one at v·n^¼). Each of the moment's notes is struck at that level
 * times the row's `level` and its accent over the cell's median accent; a chord's tones share their strike.
 */
export function atKeysLevel(notes: readonly MomentNote[], laid: ReadonlyArray<{ t: number; vel: number }>, level: number): MomentNote[] {
  if (!laid.length) return [...notes];
  const vels = laid.map((e) => e.vel).sort((a, b) => a - b), median = vels[vels.length >> 1];
  const times = [...laid].sort((a, b) => a.t - b.t);
  let strikes = 0;
  for (let i = 0; i < times.length; i++) if (i === 0 || times[i].t - times[i - 1].t > 0.04) strikes++;
  const base = median * Math.pow(times.length / Math.max(1, strikes), 1 / 4);
  const acc = notes.filter((n) => !n.chord).map((n) => n.accent).sort((a, b) => a - b), mid = acc[acc.length >> 1] ?? 1;
  return notes.map((n) => ({ ...n, vel: Math.min(1, base * level * n.accent / mid / (n.chord ? Math.pow(n.midi.length, 1 / 4) : 1)) }));
}

/** A bar's harmony as a moment needs it: the chord's tones (pitch classes, root first) and the key's scale (pitch classes). */
export interface MomentHarmony { tones: readonly number[]; scale: readonly number[] }

const pcOf = (m: number) => ((m % 12) + 12) % 12;

/**
 * **The solo's line.** `pool` is the keys' own notes (MIDI): the line's ceiling sits `over` semitones over their
 * highest and its floor `span` under that, inside the voice's [low, high]. Each two bars is a cell of the row in its
 * order (a call, its answer, the call again, the cadence), shaped by its contour: a strong place takes the chord's tone
 * nearest the contour (one of the keys' own notes where one is as near), a passing note steps by the scale toward the
 * next, a landing holds a chord tone, the cadence lands on the chord's root with the chord under it. Under the line, the
 * keys' own soft chord at the solo's start and each two bars (the chord's tones closed under the line's floor).
 */
export function soloLine(seed: Seed, from: number, harmonyAt: (bar: number) => MomentHarmony, pool: readonly number[],
  low: number, high: number, row: KeysMomentsRow = KEYS_MOMENTS): MomentNote[] {
  const S = row.solo;
  if (!pool.length) return [];
  const hi = Math.min(high, Math.max(...pool) + S.over), lo = Math.max(low, hi - S.span);
  if (hi - lo < 7) return [];
  const own = new Set(pool.map(pcOf));
  const r = new Rng(`${seed}::keys-solo-line`);
  const out: MomentNote[] = [];
  let prev: number | null = null;
  S.order.forEach((name, u) => {
    const cell = S.cells[name], shape = S.shapes[name];
    const unitBar = from + 2 * u;
    // the chord under the line: at the unit's start, closed under its floor
    const H0 = harmonyAt(unitBar);
    // the chord under the line: a closed stack of its third, fifth and seventh (its root, third and fifth where that
    // will not fit the voice's floor), its top at or under `top`, the stack moved up an octave where it would pass the floor
    const chordUnder = (H: MomentHarmony, top: number) => {
      for (const shape of [[1, 2, 3], [0, 1, 2]]) {
        const pcs = shape.map((k) => H.tones[k]).filter((p) => p !== undefined);
        if (pcs.length < 3) continue;
        let m = top; while (pcOf(m) !== pcs[2]) m--;
        const out = [m];
        for (let k = 1; k >= 0; k--) { let x = out[0] - 1; while (pcOf(x) !== pcs[k]) x--; out.unshift(x); }
        while (out[0] < low) out.forEach((_, i) => (out[i] += 12));
        if (out[2] <= top + 12) return out;
      }
      return [];
    };
    const under = chordUnder(H0, lo + 2);
    if (under.length >= 2 && !cell.some((n) => n[4] === 'C' && n[0] === 0)) out.push({ bar: unitBar, step: 0, midi: under, beats: 8, accent: S.chordLevel, ms: u ? 10 : 0, chord: true });
    cell.forEach(([step, beats, accent, ms, mark], i) => {
      const bar = unitBar + (step >> 4), s = step % 16;
      const H = harmonyAt(bar);
      const h = shape.length === 1 ? shape[0] : (() => { const x = (i / Math.max(1, cell.length - 1)) * (shape.length - 1), k = Math.min(shape.length - 2, Math.floor(x)); return shape[k] + (shape[k + 1] - shape[k]) * (x - k); })();
      const target = lo + h * (hi - lo);
      const inRange = (pcs: readonly number[]) => { const out: number[] = []; for (let m = lo; m <= hi; m++) if (pcs.includes(pcOf(m))) out.push(m); return out; };
      let note: number;
      if (mark === 'p' && prev !== null) {
        // a passing note: a step of the scale from the last note, toward the contour, never the same note
        const scale = inRange(H.scale);
        const at = scale.indexOf(prev) >= 0 ? scale.indexOf(prev) : scale.findIndex((m) => m >= prev!);
        const steps = [at - 1, at + 1, at - 2, at + 2].filter((k) => k >= 0 && k < scale.length).map((k) => scale[k]);
        note = steps.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] ?? prev;
      } else {
        // a chord tone: the cadence on the root, else the tone nearest the contour (the keys' own where as near)
        const tones = mark === 'C' ? inRange([H.tones[0]]) : inRange(H.tones);
        const near = [...tones].sort((a, b) => (Math.abs(a - target) - (own.has(pcOf(a)) ? 1.5 : 0)) - (Math.abs(b - target) - (own.has(pcOf(b)) ? 1.5 : 0)));
        note = mark === 's' && near.length > 1 && near[0] === prev ? near[1] : mark === 's' && near.length > 1 && r.chance(0.2) ? near[1] : near[0] ?? Math.round(target);
      }
      if (mark === 'C') {
        const chord = chordUnder(H, note - 1);
        out.push({ bar, step: s, midi: [...chord.filter((m) => m < note), note], beats, accent, ms, chord: true });
      } else out.push({ bar, step: s, midi: [note], beats, accent, ms, chord: false });
      prev = note;
    });
  });
  // a chord struck with a line note leaves that note's pitch class to the line (one strike, never a tone twice)
  for (const c of out) if (c.chord) {
    const with_ = out.filter((n) => !n.chord && n.bar === c.bar && n.step === c.step);
    if (with_.length) c.midi = c.midi.filter((m) => !with_.some((n) => pcOf(n.midi[0]) === pcOf(m)));
  }
  return out.filter((n) => n.midi.length).sort((a, b) => a.bar - b.bar || a.step - b.step);
}

/**
 * **The second riff.** `hook` is the hook's notes in its order (MIDI, as it plays them); each bar of the row's four-bar
 * cell, cycled over the riff's bars, plays the hook's i-th note (`h<i>`) or the bar's chord's k-th tone over the hook's
 * highest note (`c<k>`), an octave down where it would pass `high`.
 */
export function riffLine(from: number, bars: number, harmonyAt: (bar: number) => MomentHarmony, hook: readonly number[], high: number,
  row: KeysMomentsRow = KEYS_MOMENTS): MomentNote[] {
  if (!hook.length) return [];
  const top = Math.max(...hook);
  const out: MomentNote[] = [];
  for (let b = 0; b < bars; b++) {
    const bar = from + b, H = harmonyAt(bar);
    for (const [cb, step, which, beats, accent] of row.riff.cell.notes) {
      if (cb !== b % 4) continue;
      const k = +which.slice(1);
      let m: number;
      if (which[0] === 'h') m = hook[k % hook.length];
      else {
        const above: number[] = [];
        for (let x = top + 1; above.length < k && x < top + 24; x++) if (H.tones.includes(pcOf(x))) above.push(x);
        m = above[k - 1] ?? top;
        while (m > high) m -= 12;
      }
      out.push({ bar, step, midi: [m], beats, accent, ms: 0, chord: false });
    }
  }
  return out;
}
