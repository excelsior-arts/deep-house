// The theme, where a track has one (PLAN-MOTIF T1): which family states it and
// in which register, and how a statement is performed bar by bar. Split out of
// generator.ts in the composer fix round of 09-22 without moving an event.
import type { Style } from '@deep-house/engine/style';
import type { Lane } from '@deep-house/engine/style';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import type { Settings } from '@deep-house/engine/settings';
import Rng from './rng.ts';
import type { Seed } from './rng.ts';
import { scaleWeighted, type Bias } from './spell.ts';
import { switchOn, layerOf, type FigureGroup } from './lanes.ts';
import { STEPS_PER_BAR, cellBeats, develop, familyById, familyOf, onsetsOf, placementOf, rollMotif } from './motif.ts';
import type { Motif, MotifFamily, Register } from './motif.ts';
import { recipeById } from './recipes.ts';
import type { Recipe } from './recipe.ts';
import type { MusicalParts } from './parts/types.ts';
import type { recipeRequest } from './recipe-request.ts';
import { chordAtBar, foldTo, noteName, scaleNote, type Progression } from './theory.ts';
import { layersAtBar, type makeArrangement } from './arrangement.ts';
import { variationSpan, type ShapePolicy } from './development-shape.ts';
import * as P from './patterns.ts';
import type { BarContext, EventMeta } from './generator.ts';

export type PlayedMotif = { family: MotifFamily; motif: Motif; register: Register; returns: number; bars: number };

/**
 * The lowest base at which every interval of a phrase fits inside [lo, hi],
 * moved from `base` by whole octaves, or null where no octave fits: a phrase is
 * placed as a whole, never folded note by note.
 */
export function placeInRegister(base: number, intervals: readonly number[], lo: number, hi: number): number | null {
  const low = Math.min(...intervals), high = Math.max(...intervals);
  while (base + low < lo) base += 12;
  while (base + high > hi) base -= 12;
  return base + low < lo || base + high > hi ? null : base;
}

export interface MotifRoll {
  style: Style;
  CAT: any;
  parts: MusicalParts;
  request: ReturnType<typeof recipeRequest>;
  recipe: Recipe | null;
  forceMotif: { family?: string; register?: Register; off?: boolean } | null;
  silent: readonly string[];
  wantedSilent: readonly string[];
  bias: Bias;
  dice: (tag: string) => Rng;
  originFor: (role: string) => string | undefined;
  streamFor: (role: string) => string;
  partOrigin: string | undefined;
}

/**
 * **The theme, where this strategy has one.** One draw off `<seed>::motif`: a
 * theme at all, its register, its family and the concrete theme rolled inside
 * the family's box; or the requested bass family off its own stream. A pinned
 * lead and an ordinary bass phrase can coexist; legacy requests keep one motif.
 */
export function rollMotifs({ style, CAT, parts, request, recipe, forceMotif, silent, wantedSilent, bias, dice, originFor, streamFor, partOrigin }: MotifRoll):
  { MOTIF: PlayedMotif | null; ACCOMPANIMENT_BASS: PlayedMotif | null } {
/** A family by id: the authored table's, or a library row somebody adopted. */
const resolveFamily = (id: string): MotifFamily | null => familyById(id) || familyOf(recipeById(id));

const rollBassPart = (): PlayedMotif | null => {
  if (parts.bassMotif) {
    const bassLanes = style.lanes.filter(l => l.role === 'bassline');
    if (!switchOn(style, 'motif') || !bassLanes.length || bassLanes.every(l => l.gate && silent.includes(l.gate))) {
      throw new Error('recipe bass family has no enabled bass motif lane');
    }
    const family: MotifFamily = { id: `${originFor('bassline')}/bass`, name: 'bass phrase family', register: 'bass', weight: 1, box: parts.bassMotif, note: 'Generated from a musical family, not a transcribed score.' };
    const r = dice(`${streamFor('bassline')}-bass`);
    const motif = rollMotif(family, r);
    if (!motif) throw new Error(`bass family cannot be rolled: ${partOrigin}`);
    const returns = Math.max(1, Math.round(r.float(family.box.returns.bars[0], family.box.returns.bars[1])));
    return { family, motif, register: 'bass', returns, bars: Math.max(1, Math.ceil(cellBeats(motif.cell) / 4)) };
  }
  return null;
};
const MOTIF: PlayedMotif | null = (() => {
  if (parts.bassMotif && !request.motif) return rollBassPart();
  if (forceMotif && forceMotif.off) return null;
  if (!switchOn(style, 'motif') && !forceMotif) return null;
  const list = (CAT as any).motifFamilies as ReadonlyArray<{ v: string; w: number }> | undefined;
  if (!list || !list.length) return null;
  const mo = dice('motif');
  // A tool's hand takes the place of the two draws and of nothing else: the
  // theme itself is still rolled inside the family's box off this seed's own
  // stream, so what a pinned card holds still is which family and which
  // register, which is exactly the question such a card asks.
  // A family is the authored table's, or — for a row somebody adopted and
  // then named in this strategy's own list — the library row itself. The
  // three that ship are both, and `npm run check` proves the two agree.
  const named = request.motif ?? (forceMotif && forceMotif.family ? resolveFamily(forceMotif.family) : null);
  if (!mo.chance((CAT as any).motifChance ?? 0) && !forceMotif && !request.motif) return null;
  const register = (named ? named.register : forceMotif && forceMotif.register ? forceMotif.register : String(mo.weighted(
    scaleWeighted([...((CAT as any).motifRegisters as Array<{ v: string; w: number }>)], bias, 'motifRegisters')
  ))) as Register;
  // A held harmonic bass has no room for a second bass figure. Do not report
  // a motif that the recipe's figure would replace without ever playing it.
  if (parts.heldBass && register === 'bass') return null;
  if (parts.struckFigures.length && register !== 'bass') return null;
  const motifLanes = style.lanes.filter(l => l.role === (register === 'bass' ? 'bassline' : 'figure'));
  if (request.motif && (!motifLanes.length || motifLanes.every(l => l.gate && silent.includes(l.gate)))) {
    throw new Error(`Recipe ${recipe!.id}: the requested motif lane is disabled by this arrangement`);
  }
  if (style.lanes.some(l => l.role === (register === 'bass' ? 'bassline' : 'figure') && l.gate && wantedSilent.includes(l.gate))) return null;
  const pool = (named ? [{ family: named, w: 1 }] : list
    .map((e) => ({ family: resolveFamily(e.v), w: e.w })))
    .filter((e): e is { family: MotifFamily; w: number } => !!e.family && e.family.register === register);
  // A register the library has no family for is a register with no theme:
  // the draw is spent and the track is the track it always was, rather than
  // a second draw quietly looking for something that will do.
  if (!pool.length) return null;
  const family = mo.weighted(pool.map((e) => ({ v: e.family, w: e.w })));
  // A box nobody can roll inside is a track with no theme, which is the
  // honest answer and not a motif somebody would hear as one. It costs the
  // draws it took to find out and nothing else.
  const motif = rollMotif(family, mo);
  if (!motif && request.motif) throw new Error(`Recipe ${recipe!.id}: no phrase can be rolled inside its motif box`);
  if (!motif) return null;
  const returns = Math.max(1, Math.round(mo.float(family.box.returns.bars[0], family.box.returns.bars[1])));
  // How many bars the cell itself spans, for a readout and for whoever comes
  // to ask; the figure source tiles the cell rather than reading this, so it
  // is a fact about the theme and not a length anybody plays to.
  return { family, motif, register, returns, bars: Math.max(1, Math.ceil(cellBeats(motif.cell) / 4)) };
})();
// A pinned lead and an ordinary bass phrase can coexist. Legacy requests
// still use one motif and keep their exact streams and source ordering.
const ACCOMPANIMENT_BASS = request.motif?.register === 'lead' && parts.bassMotif ? rollBassPart() : null;
  return { MOTIF, ACCOMPANIMENT_BASS };
}

export interface MotifPerformer {
  seed: Seed;
  S: Settings;
  progression: Progression;
  bassDevelopment: ShapePolicy['bass'] | null;
  parts: MusicalParts;
  arrangement: ReturnType<typeof makeArrangement>;
  bars: number;
  beat: number;
  barSeconds: number;
  at: (bar: number, step: number) => number;
  laneOn: (lane: Lane, layers: Record<string, boolean | undefined>) => boolean;
  voiceOf: (lane: Lane) => string;
  push: (voice: string, t: number, p: NoteParams, meta: EventMeta) => void;
  bassChanges: (lane: Lane, c: BarContext, changes: P.BassChange[], accent?: number[] | null, heldSeconds?: number | null, phrase?: { midis: number[]; seconds: number[] }) => void;
  ownFigure: boolean;
  pianoHall: number;
  pianoDelay: number;
  stabTimbre: string;
  tremolo: boolean;
  fx: { delay: number };
  stabWet: number;
}

/** One bar of a theme's statement, on the lanes of the register that states it. */
export function performMotif(ctx: MotifPerformer, MOTIF: PlayedMotif, g: FigureGroup, c: BarContext): void {
  const { seed, S, progression, bassDevelopment, parts, arrangement, bars, beat, barSeconds, at, laneOn, voiceOf, push,
    bassChanges, ownFigure, pianoHall, pianoDelay, stabTimbre, tremolo, fx, stabWet } = ctx;
  const PI = S.piano;
    if (!MOTIF) return;
    const place = placementOf(c.section.kind);
    if (!place.plays) return;
    // The lead lane keeps the gate it always had: a theme over a harmonic
    // role that is not sounding this section is a theme nobody is playing.
    if (MOTIF.register !== 'bass' && !c.keysSection) return;
    const inSection = c.bar - c.section.startBar;
    // **Which statement this is.** The theme comes back every `returns` bars
    // — the number drawn out of the family's own box, which is PLAN-MOTIF's
    // "how many bars before a return" — and *coming back* means the grammar
    // is asked again, not that the part stops: a bass that goes away for six
    // bars in seven is not a pump, it is a hole. What makes the return an
    // event is the section grammar, which takes the theme out of the
    // breakdown altogether.
    const cycle = Math.floor(inSection / MOTIF.returns);
    const next = chordAtBar(progression, c.bar + Math.max(1, c.chord.bars));
    const moves = bassDevelopment && MOTIF.register === 'bass' ? bassDevelopment.moves : place.moves;
    const variation = bassDevelopment && MOTIF.register === 'bass'
      ? Math.floor(inSection / variationSpan(MOTIF.returns,bassDevelopment.variationBars)) : cycle;
    const move = new Rng(`${seed}::motifmove:${c.section.index}:${variation}`).weighted([...moves]);
    const shaped = MOTIF.family.box.paths
      ? rollMotif(MOTIF.family, new Rng(`${seed}::motifpath:${c.section.index}:${variation}`))
      : develop(MOTIF.motif, move, { shift: next.degree - c.chord.degree });
    if (!shaped) return;
    // The cell tiles from the start of this statement, so a cell shorter than
    // a bar says its figure twice and a cell longer than one runs across the
    // bar line. That is the arithmetic the family's own `density` is written
    // in — notes a bar, for a cell measured in beats — so a theme that did
    // not tile would play at a fraction of the density its box states.
    const total = shaped.cell.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return;
    const from = (inSection - cycle * MOTIF.returns) * STEPS_PER_BAR;
    const to = from + STEPS_PER_BAR;
    const on = onsetsOf(shaped.cell);
    // The chord's own note, and every degree of the theme measured from it,
    // so the shape survives being folded into a register: folding each note
    // on its own would fold the line flat.
    const home = scaleNote(progression.root, progression.scale, c.chord.degree);
    const notes: Array<{ step: number; semitones: number; len: number; accent: number }> = [];
    shaped.degrees.forEach((d, i) => {
      const semitones = scaleNote(progression.root, progression.scale, c.chord.degree + d) - home;
      for (let k = Math.max(0, Math.floor((from - on[i]) / total)); on[i] + k * total < to; k++) {
        const abs = on[i] + k * total;
        if (abs < from) continue;
        notes.push({ step: abs - from, semitones, len: shaped.holds ? shaped.holds[i] * 4 : shaped.cell[i], accent: shaped.accent[i] ?? 0.8 });
      }
    });
    notes.sort((a, b) => a.step - b.step);
    if (!notes.length) return;
    if (MOTIF.register === 'bass') {
      // The bass plays it as its own line: a change every note, the interval
      // above the chord's root, through the same register arithmetic and the
      // same legato every other bass bar goes through.
      for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) {
        let phrase: { midis: number[]; seconds: number[] } | undefined;
        if (parts.bassMotif) {
          // Place the entire phrase together. Folding each pitch separately
          // turns a neighbour above the register ceiling into an octave drop.
          const intervals = shaped.degrees.map(d => scaleNote(progression.root, progression.scale, c.chord.degree + d) - home);
          const base = placeInRegister(P.bassNote(c.chord, { step: 0, interval: 0 }, S), intervals, S.register.subLow, S.register.subCeiling);
          if (base === null) throw new Error('recipe bass family does not fit the bass register');
          phrase = { midis: notes.map(n => base + n.semitones), seconds: notes.map(n => {
            const start = at(c.bar, n.step);
            // Sounding lengths are continuous musical durations, not onset
            // grid positions. Only the onset is displaced by swing.
            const noteEnd = shaped.holds ? start + n.len / 4 * beat
              : at(c.bar + Math.floor((n.step + n.len) / 16), (n.step + n.len) % 16);
            let end = Math.min(bars * barSeconds, noteEnd);
            // The sounding note stops when this role's arrangement gate closes.
            for (let b = c.bar + 1; b * barSeconds < end; b++) {
              if (!laneOn(lane, layersAtBar(arrangement, b).layers)) { end = b * barSeconds; break; }
            }
            return Math.max(0.01, end - start);
          }) };
        }
        bassChanges(
          lane,
          c,
          notes.map((n) => ({ step: n.step, interval: n.semitones })),
          notes.map((n) => n.accent), null, phrase
        );
      }
      return;
    }
    for (const lane of g.lanes.filter((l) => laneOn(l, c.layers))) {
      const voice = voiceOf(lane);
      const base = foldTo(home, PI.low, Math.max(PI.low, PI.high - 12));
      // A note the piano's register would clamp onto a pitch outside the key
      // is folded into it by octaves instead (R15 of the review of 09-24):
      // every degree under G3 was written as G3 whatever the key — 897 notes
      // on 14 of 43 lead themes, G natural in G-flat minor. Where the clamp
      // lands on a note of the key it stays as it was heard, the benchmark's
      // marimba on G3 among them (27191, theme four), so the only notes that
      // move are the ones that were out of the key.
      const inKey = (m: number) => progression.scale.includes(((m - progression.root) % 12 + 12) % 12);
      for (const n of notes) {
        const asked = base + n.semitones;
        const clamped = Math.max(PI.low, Math.min(PI.high, asked));
        const midi = clamped === asked || inKey(clamped) ? clamped : foldTo(asked, PI.low, PI.high);
        const dur = Math.max(0.12, (n.len / 4) * beat);
        push(
          voice,
          at(c.bar, n.step),
          ownFigure
            ? { midi, dur, vel: 0.62 + 0.24 * n.accent, hall: pianoHall, delay: pianoDelay }
            : { midi, dur, vel: 0.58 + 0.28 * n.accent, preset: stabTimbre, tremolo, delay: 0.28 * fx.delay, reverb: stabWet },
          { bar: c.bar, step: n.step, layer: layerOf(voice), note: noteName(midi) }
        );
      }
    }
}
