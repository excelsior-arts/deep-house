// A requested pitched part: which instrument and phrase each part rolls, and
// how its statements are laid bar by bar. Split out of generator.ts in the
// composer fix round of 09-22 without moving an event.
import type { Style } from '@deep-house/engine/style';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import Rng from '../rng.ts';
import type { Seed } from '../rng.ts';
import { switchOn, layerOf } from '../lanes.ts';
import { develop, onsetsOf, placementOf, rollMotif, type MotifFamily } from '../motif.ts';
import { chordAtBar, foldTo, noteName, scaleNote, type Progression } from '../theory.ts';
import { figureCandidates, phraseArch, phrasePhase } from './figure.ts';
import type { MusicalParts } from './types.ts';
import type { SoundCharacters } from './sound.ts';
import type { PartPin } from '../composition-policy.ts';
import { placeInRegister } from '../motif-perform.ts';
import type { EventMeta, FigureSource, PlanEvent } from '../generator.ts';

export interface FigureRoll {
  style: Style;
  parts: MusicalParts;
  forbids: readonly string[];
  silent: readonly string[];
  dice: (tag: string) => Rng;
  streamFor: (role: string) => string;
  originFor: (role: string) => string | undefined;
  characters: SoundCharacters | undefined;
}

/** Each requested part's instrument, phrase and numbers, off the part's own stream. */
export function rollFigures({ style, parts, forbids, silent, dice, streamFor, originFor, characters }: FigureRoll) {
const UPPERS = parts.struckFigures.map((want, part) => {
  const candidates = figureCandidates(want, style, forbids);
  const gate = style.lanes.find(l => l.role === 'figure')?.gate;
  if (!switchOn(style, 'motif') || !candidates.length || (gate && silent.includes(gate))) throw new Error('recipe struck phrase has no enabled figure lane');
  const r = dice(part === 0 ? `${streamFor('figure')}-figure` : `${streamFor('figure')}-figure:${part}`);
  const candidate = r.weighted(candidates.map(c => ({ v: c, w: c.w })));
  const family: MotifFamily = { id: `${originFor('figure')}/figure${part ? `:${part}` : ''}`, name: 'struck part', register: 'mid', weight: 1, box: want.motif, note: 'A bounded musical family, not a transcription.' };
  const motif = rollMotif(family, r);
  if (!motif) throw new Error('recipe struck phrase cannot be rolled');
  return { ...candidate, motif, family, part, articulation: want.articulation, envelope: want.envelope, voicings: want.voicings, phrasing: want.phrasing, rests: want.rests, behavior: want.behavior ?? 'phrase', strength: r.float(...want.strength),
    entry: Math.round(r.float(...want.entry.beats) * 4),
    spacing: Math.round(r.float(...want.spacing.bars)),
    returns: Math.max(1, Math.round(r.float(...want.motif.returns.bars))),
    duration: want.duration ? r.float(...want.duration.beats) : undefined };
});
// How the style places and sounds a requested pitched part.
const FIGURE = UPPERS.length ? characters?.figure : null;
if (UPPERS.length && !FIGURE) throw new Error('recipe struck phrase: this style declares no figure character');
  return { UPPERS, FIGURE };
}
export type RolledFigure = ReturnType<typeof rollFigures>['UPPERS'][number];

export interface FigurePerformer {
  seed: Seed;
  UPPERS: readonly RolledFigure[];
  FIGURE: SoundCharacters['figure'] | null | undefined;
  streamFor: (role: string) => string;
  progression: Progression;
  at: (bar: number, step: number) => number;
  beat: number;
  push: (voice: string, t: number, p: NoteParams, meta: EventMeta) => void;
  pinned: PartPin | null;
  events: PlanEvent[];
  upperEvents: Set<PlanEvent>;
  phraseParameters: Map<PlanEvent, NoteParams>;
  characters: SoundCharacters | undefined;
}

/** The figure source a figure lane reads while a requested pitched part plays. */
export function recipeFigureSource({ seed, UPPERS, FIGURE, streamFor, progression, at, beat, push, pinned,
  events, upperEvents, phraseParameters, characters }: FigurePerformer): FigureSource {
  return (_group, c) => {
    const place = placementOf(c.section.kind);
    if (!place.plays) return;
    const inside = c.bar - c.section.startBar;
    for (const part of UPPERS) {
      const cycle = Math.floor(inside / part.returns);
      const r = new Rng(`${seed}::${streamFor('figure')}-figure-move${part.part ? `:${part.part}` : ''}:${c.section.index}:${cycle}`);
      const shaped = part.family.box.paths ? rollMotif(part.family, r)
        : part.behavior === 'ostinato' ? part.motif
        : develop(part.motif, r.weighted([...place.moves]), { shift: chordAtBar(progression, c.bar + 1).degree - c.chord.degree });
      if (!shaped) continue;
      const onsets = onsetsOf(shaped.cell);
      const offset = (inside % part.spacing) * 16;
      const home = scaleNote(progression.root, progression.scale, c.chord.degree);
      const [low, high] = FIGURE!.register;
      let base = foldTo(home, ...FIGURE!.home);
      if (FIGURE!.fold === 'statement') {
        // The whole statement in one octave (the generation review of 09-22,
        // #4): fold the statement's first chord into the home octave, then
        // keep re-rooting on each chord at the octave nearest that anchor,
        // instead of folding every bar afresh — which leapt a tenth or more
        // at 53 of 359 chord changes of a sixteen-bar path. The register
        // still bounds it: a phrase that would leave it moves a whole octave.
        const first = chordAtBar(progression, c.bar - (inside % part.spacing));
        const anchor = foldTo(scaleNote(progression.root, progression.scale, first.degree), ...FIGURE!.home);
        base = home + 12 * Math.round((anchor - home) / 12);
        if (!part.voicings) {
          const placed = placeInRegister(base, shaped.degrees.map(degree =>
            scaleNote(progression.root, progression.scale, c.chord.degree + degree) - home), low, high);
          if (placed === null) throw new Error('recipe struck phrase does not fit its register');
          base = placed;
        }
      }
      if (part.voicings) {
        // Place a voiced phrase as a whole, including its melody. An
        // inversion may fit in one key and cross the floor in the next;
        // folding individual notes would change its chord and contour.
        const intervals = shaped.degrees.flatMap((degree, i) =>
          [0, ...part.voicings![i % part.voicings!.length]].map(interval =>
            scaleNote(progression.root, progression.scale, c.chord.degree + degree + interval) - home));
        const placed = placeInRegister(base, intervals, low, high);
        if (placed === null) throw new Error('recipe voiced phrase does not fit its register');
        base = placed;
      }
      const cellSteps = shaped.cell.reduce((sum, n) => sum + n, 0);
      const repeats = part.behavior === 'ostinato' ? Math.max(1, 16 / cellSteps) : 1;
      // Once for the group and not once per lane of it (the fault pass of
      // 09-24). The phrase is the part's own: its instrument is the one the
      // part drew off the palette (`part.voice`; a figure lane has no list,
      // and `voiceOf` answers the first part's for it while a part plays),
      // so a lane has no voice of its own to give it and no second note to
      // add. The lanes are
      // the phrase's gate, and the generator asks this source only when one
      // of them is on. Until now the phrase sat inside a loop over the
      // group's sounding lanes that never read its lane, which pushed every
      // note once per lane on: the same note twice, on the same voice at the
      // same time, the day a style gave the figure role two lanes. No plan
      // moves: MEASURED over seeds 1-200 x 4 of both strategies, 188 themes
      // with a struck part (all house-v2) and 25388 bars asked, never two
      // lanes on; both styles have one figure lane.
      for (let repeat = 0; repeat < repeats; repeat++) {
        shaped.degrees.forEach((degree, i) => {
          const position = part.entry + repeat * cellSteps + onsets[i];
          if (position < offset || position >= offset + 16 || position >= part.spacing * 16) return;
          const step = position - offset;
          if (part.rests) {
            const beatInCycle = (c.bar % part.rests.bars) * 4 + step / 4;
            if (part.rests.beats.some(([from,to])=>beatInCycle>=from&&beatInCycle<to)) return;
          }
          const midi = base + scaleNote(progression.root, progression.scale, c.chord.degree + degree) - home;
          if (midi < low || midi > high) throw new Error('recipe struck phrase does not fit its register');
          const remaining = Math.min(shaped.cell[i], part.spacing * 16 - position, 16 - step);
          const noteDuration = shaped.holds?.[i] ?? part.duration;
          const short = FIGURE!.struck;
          const dur = noteDuration === undefined ? Math.max(short.floor, Math.min(short.ceiling, remaining / 4 * beat * short.share))
            : Math.min(noteDuration, shaped.cell[i] / 4, (part.spacing * 16 - position) / 4) * beat;
          const voicing = part.voicings?.[i % part.voicings.length] ?? [0];
          const phase = part.phrasing ? phrasePhase(part.phrasing.starts, shaped.degrees.length, i) : 0;
          const phraseLevel = part.phrasing ? phraseArch(part.phrasing.dynamics, phase) : 1;
          for (const interval of voicing) {
            const pitch = midi + scaleNote(progression.root, progression.scale, c.chord.degree + degree + interval)
              - scaleNote(progression.root, progression.scale, c.chord.degree + degree);
            if (pitch < low || pitch > high) throw new Error('recipe chord shape does not fit its register');
            push(part.voice, at(c.bar, step), {
              midi: pitch, dur, vel: part.strength * (shaped.accent[i] ?? .8) * phraseLevel,
              preset: part.timbre, ...FIGURE!.sends,
              ...(part.envelope ? { attack: part.envelope.attack.beats * beat, release: part.envelope.release.beats * beat } : {}),
            }, { bar: c.bar, step, layer: layerOf(part.voice), note: noteName(pitch),
              ...(pinned?.role === 'figure' ? { part: pinned.id } : {}),
              ...(noteDuration !== undefined && part.articulation === 'struck' ? { articulation: 'struck' as const } : {}) });
            upperEvents.add(events[events.length-1]);
            if (part.phrasing) {
              const profile = characters!.phrases![part.phrasing.character];
              if (profile.treatment) events[events.length-1].treatment = profile.treatment;
              const params = Object.fromEntries(Object.entries(profile.params).map(([k,v])=>[k,phraseArch(v,phase)]));
              for (const [k,v] of Object.entries(profile.beats)) params[k] = phraseArch(v,phase)*beat;
              if (params.attack !== undefined) params.attack = Math.min(params.attack, dur*.5);
              phraseParameters.set(events[events.length-1],params);
            }
          }
        });
      }
    }
  };
}
