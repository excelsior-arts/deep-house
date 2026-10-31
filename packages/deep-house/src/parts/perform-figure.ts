// A requested pitched part: which instrument and phrase each part rolls, and
// how its statements are laid bar by bar. Split out of generator.ts in the
// composer fix round of 09-22 without moving an event.
import type { Style } from '@deep-house/engine/style';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import Rng from '../rng.ts';
import { PartRefused } from '../refused.ts';
import type { Seed } from '../rng.ts';
import { switchOn, layerOf } from '../lanes.ts';
import { develop, onsetsOf, placementOf, rollMotif, type MotifFamily } from '../motif.ts';
import { chordAtBar, foldTo, noteName, scaleNote, type Progression } from '../theory.ts';
import { figureCandidates, phraseArch, phrasePhase } from './figure.ts';
import type { MusicalParts } from './types.ts';
import type { SoundCharacters } from './sound.ts';
import type { PartPin } from '../composition-policy.ts';
import { placeInRegister } from '../motif-perform.ts';
import type { BarContext, EventMeta, FigureSource, PlanEvent } from '../generator.ts';
import type { MomentNote } from '../keys-moments.ts';

export interface FigureRoll {
  style: Style;
  parts: MusicalParts;
  forbids: readonly string[];
  silent: readonly string[];
  dice: (tag: string) => Rng;
  streamFor: (role: string) => string;
  originFor: (role: string) => string | undefined;
  characters: SoundCharacters | undefined;
  /** the birds' lean on a part's candidates (an ensemble's roles, `ensembleLean`), where there is one */
  lean?: (want: MusicalParts['struckFigures'][number], candidates: Array<{ timbre: string; w: number }>) => number[];
}

/** Each requested part's instrument, phrase and numbers, off the part's own stream. */
export function rollFigures({ style, parts, forbids, silent, dice, streamFor, originFor, characters, lean }: FigureRoll) {
const UPPERS = parts.struckFigures.map((want, part) => {
  const candidates = figureCandidates(want, style, forbids);
  const gate = style.lanes.find(l => l.role === 'figure')?.gate;
  if (!switchOn(style, 'motif') || !candidates.length || (gate && silent.includes(gate))) throw new PartRefused('recipe struck phrase has no enabled figure lane');
  const r = dice(part === 0 ? `${streamFor('figure')}-figure` : `${streamFor('figure')}-figure:${part}`);
  const leaned = lean ? lean(want, candidates) : null;
  const candidate = r.weighted(candidates.map((c, i) => ({ v: c, w: leaned ? leaned[i] : c.w })));
  const family: MotifFamily = { id: `${originFor('figure')}/figure${part ? `:${part}` : ''}`, name: 'struck part', register: 'mid', weight: 1, box: want.motif, note: 'A bounded musical family, not a transcription.' };
  const motif = rollMotif(family, r);
  if (!motif) throw new Error('recipe struck phrase cannot be rolled');
  return { ...candidate, motif, family, part, articulation: want.articulation, envelope: want.envelope, voicings: want.voicings, phrasing: want.phrasing, rests: want.rests, pedal: want.pedal, landing: want.landing, as: want.as, range: want.range, leaves: want.leaves, stays: want.stays, home: want.home,
    // its register drifted where the part asks (`PitchedFigure.drift`): scale steps in the key, one draw every drifting
    // part reads alike so their order holds, about seven steps to the octave
    lift: want.drift ? ((k: number) => dice('ensemble-drift').int(-k, k + 1))(Math.round(want.drift * 7 / 12)) : 0,
    // the notes this theme moves its path by (`PitchedFigure.vary`), drawn after every number above on the same stream
    // (a `shared` shift is drawn off one stream every part of the theme reads, so parts that share it move together
    // and keep their registers' order; the part's own stream is read the same either way, so nothing else moves)
    shift: want.vary ? ((own: number) => want.vary!.shared ? dice('figure-vary-shared').int(want.vary!.shift[0], want.vary!.shift[1] + 1) : own)(r.int(want.vary.shift[0], want.vary.shift[1] + 1)) : 0,
    invert: want.vary?.invert ? r.chance(want.vary.invert) : false, behavior: want.behavior ?? 'phrase', strength: r.float(...want.strength),
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
  /**
   * **The keys' moment** (keys-moments, `src/keys-moments.ts`): a bar of the solo the plan gave a part, its notes (each
   * at the keys' own level), or null; while it plays every other part of the figure rests.
   */
  moment?: (c: BarContext) => { part: RolledFigure; notes: readonly MomentNote[]; ringBeats: number } | null;
}

/** The figure source a figure lane reads while a requested pitched part plays. */
export function recipeFigureSource({ seed, UPPERS, FIGURE, streamFor, progression, at, beat, push, pinned,
  events, upperEvents, phraseParameters, characters, moment }: FigurePerformer): FigureSource {
  const playMoment = ({ part, notes, ringBeats }: NonNullable<ReturnType<NonNullable<FigurePerformer['moment']>>>, c: BarContext) => {
    const profile = part.phrasing ? characters!.phrases![part.phrasing.character] : undefined;
    const touch = profile?.touch;
    for (const n of notes) {
      const dur = n.beats * beat;
      n.midi.forEach((pitch, k) => {
        // struck at the keys' own level (`atKeysLevel`), the part's strength where none was read
        const vel = n.vel ?? part.strength * n.accent;
        const roll = k * (touch ? touch.rollMs : 12) / 1000;
        push(part.voice, Math.max(0, at(c.bar, n.step) + n.ms / 1000 + roll), {
          midi: pitch, dur, vel, preset: part.timbre, ...FIGURE!.sends,
          ...(part.envelope ? { attack: part.envelope.attack.beats * beat, release: part.envelope.release.beats * beat } : {}),
        }, { bar: c.bar, step: n.step, layer: layerOf(part.voice), note: noteName(pitch), articulation: 'struck' as const, ...(part.as ? { ensemble: part.as } : {}) });
        upperEvents.add(events[events.length - 1]);
        if (profile) {
          if (profile.treatment) events[events.length - 1].treatment = profile.treatment;
          // the phrase's sound at its middle; the pedal a line's, shorter than a chord's ring
          const params = Object.fromEntries(Object.entries(profile.params).map(([key, v]) => [key, phraseArch(v, 0.5)]));
          for (const [key, v] of Object.entries(profile.beats)) params[key] = phraseArch(v, 0.5) * beat;
          if (params.ring !== undefined) params.ring = Math.min(params.ring, ringBeats * beat);
          if (params.attack !== undefined) params.attack = Math.min(params.attack, dur * .5);
          phraseParameters.set(events[events.length - 1], params);
        }
      });
    }
  };
  return (_group, c) => {
    // **The keys' moment** (keys-moments): the part the plan gave a long breakdown's last phrase plays its solo alone,
    // a line over its own soft chords, struck as the part strikes (its voice, its sends, its phrase's touch and sound),
    // at its own level; every other part rests
    const m = moment?.(c);
    if (m) { playMoment(m, c); return; }
    const place = placementOf(c.section.kind);
    // **The colour stays** (`PitchedFigure.stays.thin`, 10-29): where a theme sits out (a breakdown, so its return is an
    // event), a part that carries the chords' colour stays: over the bed (the pad the breakdown's grammar gives the
    // room) a thinner statement of itself, and where no bed plays its whole statement, the harmony the section is left
    // with (as the piano's melody plays a breakdown alone or rests); every other part sits it out.
    const staysIn = (part: RolledFigure) => !place.plays && !!part.stays?.thin?.sections.includes(c.section.kind) ? part.stays!.thin! : null;
    if (!place.plays && !UPPERS.some(staysIn)) return;
    const inside = c.bar - c.section.startBar;
    for (const part of UPPERS) {
      if (part.leaves?.includes(c.section.kind)) continue;
      const stays = staysIn(part);
      if (!place.plays && !stays) continue;
      const thin = stays && c.padSection ? stays : null;
      const cycle = Math.floor(inside / part.returns);
      const r = new Rng(`${seed}::${streamFor('figure')}-figure-move${part.part ? `:${part.part}` : ''}:${c.section.index}:${cycle}`);
      const rolled = part.family.box.paths ? rollMotif(part.family, r) : null;
      // a path's notes moved as the theme drew (`vary`): mirrored about their middle, then shifted; the rhythm stays
      const middle = rolled && part.invert ? Math.round((Math.min(...rolled.degrees) + Math.max(...rolled.degrees)) / 2) : 0;
      const shaped = rolled ? (part.shift || part.invert || part.lift ? { ...rolled, degrees: rolled.degrees.map((d) => (part.invert ? 2 * middle - d : d) + part.shift + part.lift) } : rolled)
        : part.behavior === 'ostinato' ? (part.lift ? { ...part.motif, degrees: part.motif.degrees.map((d) => d + part.lift) } : part.motif)
        : stays ? part.motif
        : develop(part.motif, r.weighted([...place.moves]), { shift: chordAtBar(progression, c.bar + 1).degree - c.chord.degree });
      if (!shaped) continue;
      const onsets = onsetsOf(shaped.cell);
      const offset = (inside % part.spacing) * 16;
      const home = scaleNote(progression.root, progression.scale, c.chord.degree);
      const [low, high] = part.range ?? FIGURE!.register;
      let base = foldTo(home, ...(part.home ?? FIGURE!.home));
      if (FIGURE!.fold === 'statement') {
        // The whole statement in one octave (the generation review of 09-22,
        // #4): fold the statement's first chord into the home octave, then
        // keep re-rooting on each chord at the octave nearest that anchor,
        // instead of folding every bar afresh — which leapt a tenth or more
        // at 53 of 359 chord changes of a sixteen-bar path. The register
        // still bounds it: a phrase that would leave it moves a whole octave.
        const first = chordAtBar(progression, c.bar - (inside % part.spacing));
        const anchor = foldTo(scaleNote(progression.root, progression.scale, first.degree), ...(part.home ?? FIGURE!.home));
        base = home + 12 * Math.round((anchor - home) / 12);
        if (!part.voicings && !part.landing) {
          const placed = placeInRegister(base, shaped.degrees.map(degree =>
            scaleNote(progression.root, progression.scale, c.chord.degree + degree) - home), low, high);
          if (placed === null) throw new PartRefused('recipe struck phrase does not fit its register');
          base = placed;
        }
      }
      // the shape a note is struck with: a chord where a phrase lands (`landing`), else the voicings by index, else one note
      const voicingAt = (i: number): number[] => part.landing
        ? (part.phrasing && (i === shaped.degrees.length - 1 || part.phrasing.starts.includes(i + 1)) ? part.landing : [0])
        : part.voicings?.[i % part.voicings.length] ?? [0];
      if (part.voicings || part.landing) {
        // Place a voiced phrase as a whole, including its melody. An
        // inversion may fit in one key and cross the floor in the next;
        // folding individual notes would change its chord and contour.
        const intervals = shaped.degrees.flatMap((degree, i) =>
          [0, ...voicingAt(i)].map(interval =>
            scaleNote(progression.root, progression.scale, c.chord.degree + degree + interval) - home));
        const placed = placeInRegister(base, intervals, low, high);
        if (placed === null) throw new PartRefused('recipe voiced phrase does not fit its register');
        base = placed;
      }
      // The player's touch (the phrase character's `touch`), and what a chord's level reads of the statement: its single
      // notes' median accent and its strongest, worked out once a statement (pure; the touch's own die stays one a note, below)
      const touch = part.phrasing ? characters!.phrases![part.phrasing.character]?.touch : undefined;
      const singles = touch?.chordOverDb !== undefined
        ? shaped.accent.filter((_, j) => voicingAt(j).length === 1).map((a) => a ?? .8).sort((a, b) => a - b) : [];
      const singleMedian = singles.length ? singles[singles.length >> 1] : null;
      const topAccent = touch?.chordFloor !== undefined ? Math.max(...shaped.accent.map((a) => a ?? .8)) : 0;
      const cellSteps = shaped.cell.reduce((sum, n) => sum + n, 0);
      const repeats = part.behavior === 'ostinato' ? Math.max(1, 16 / cellSteps) : 1;
      // the thin statement's notes: where each phrase starts and lands (`ends`), or the ones struck as chords (`chords`)
      const kept = thin ? new Set(shaped.degrees.map((_, i) => i).filter((i) => thin.keep === 'chords' ? voicingAt(i).length > 1
        : i === 0 || i === shaped.degrees.length - 1 || !!part.phrasing?.starts.includes(i) || !!part.phrasing?.starts.includes(i + 1))) : null;
      // the bar's step of a note of the phrase on a repeat, or null where it does not play in this bar
      const stepOf = (i: number, repeat: number): number | null => {
        if (kept && !kept.has(i)) return null;
        const position = part.entry + repeat * cellSteps + onsets[i];
        if (position < offset || position >= offset + 16 || position >= part.spacing * 16) return null;
        const step = position - offset;
        if (part.rests) {
          const beatInCycle = ((part.rests.clock === 'section' ? inside : c.bar) % part.rests.bars) * 4 + step / 4;
          if (part.rests.beats.some(([from,to])=>beatInCycle>=from&&beatInCycle<to)) return null;
        }
        return step;
      };
      if (!part.voicings && !part.landing && FIGURE!.fold !== 'statement') {
        // A phrase folded bar by bar whose notes in this bar would leave the register moves a whole
        // octave, as the statement fold and a voiced phrase do, rather than throwing mid-theme (the
        // review of 10-08, A4: a row without paths is developed by moves that can carry it off the
        // register's edge). A bar that fits keeps the base it had, so nothing that played moves.
        const heard: number[] = [];
        for (let repeat = 0; repeat < repeats; repeat++) shaped.degrees.forEach((degree, i) => {
          if (stepOf(i, repeat) !== null) heard.push(scaleNote(progression.root, progression.scale, c.chord.degree + degree) - home);
        });
        if (heard.some((r) => base + r < low || base + r > high)) base = placeInRegister(base, heard, low, high) ?? base;
      }
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
          const step = stepOf(i, repeat);
          if (step === null) return;
          const position = part.entry + repeat * cellSteps + onsets[i];
          const midi = base + scaleNote(progression.root, progression.scale, c.chord.degree + degree) - home;
          if (midi < low || midi > high) throw new PartRefused('recipe struck phrase does not fit its register');
          const remaining = Math.min(shaped.cell[i], part.spacing * 16 - position, 16 - step);
          const noteDuration = shaped.holds?.[i] ?? part.duration;
          const short = FIGURE!.struck;
          const written = noteDuration === undefined ? Math.max(short.floor, Math.min(short.ceiling, remaining / 4 * beat * short.share))
            : Math.min(noteDuration, shaped.cell[i] / 4, (part.spacing * 16 - position) / 4) * beat;
          // The pedal (`PitchedFigure.pedal`): the note rings until the pedal lifts, inside the statement; a phrase's
          // last note rings its landing from the strike, as the pedal held through the close.
          const pedal = part.pedal;
          // a thin statement's every note rings as a landing: fewer chords, each held longer
          const lastOfPhrase = !!thin || (!!part.phrasing && (i === shaped.degrees.length - 1 || part.phrasing.starts.includes(i + 1)));
          const dur = !pedal ? written : Math.max(written,
            (Math.min((Math.floor(position / (pedal.beats * 4)) + 1) * pedal.beats * 4, part.spacing * 16) - position) / 4 * beat,
            lastOfPhrase && pedal.landingBeats ? pedal.landingBeats * beat : 0);
          const voicing = voicingAt(i);
          const phase = part.phrasing ? phrasePhase(part.phrasing.starts, shaped.degrees.length, i) : 0;
          const phraseLevel = part.phrasing ? phraseArch(part.phrasing.dynamics, phase) : 1;
          // The player's hand (the touch, above): off a stream of the note's own, so nothing else moves.
          const hand = touch ? new Rng(`${seed}::${streamFor('figure')}-figure-touch${part.part ? `:${part.part}` : ''}:${c.bar}:${step}`) : null;
          const early = touch ? hand!.float(-touch.timingMs, touch.timingMs) / 1000 : 0;
          let rolled = 0;
          voicing.forEach((interval, k) => {
            const pitch = midi + scaleNote(progression.root, progression.scale, c.chord.degree + degree + interval)
              - scaleNote(progression.root, progression.scale, c.chord.degree + degree);
            if (pitch < low || pitch > high) throw new PartRefused('recipe chord shape does not fit its register');
            if (touch && k > 0) rolled += touch.rollMs / 1000 * hand!.float(.7, 1);
            // A chord is one strike of the hand (the touch, 10-28). Where the phrase also plays single notes it reads
            // fuller, not louder (`chordOverDb`, his ear: "now chord is a bit too loud comparing to mix"): its tones
            // together land that many dB over the phrase's typical single note here (its median single accent, curved
            // as a single note is), a tone's power its velocity to the fourth. A phrase of chords alone keeps the floor
            // (`chordFloor`: at least that share of its strongest accent, the tones uncurved).
            const chord = !!touch && voicing.length > 1;
            const accent = chord && touch!.chordFloor !== undefined
              ? Math.max(shaped.accent[i] ?? .8, touch!.chordFloor * topAccent)
              : (shaped.accent[i] ?? .8);
            // a thin statement is softer: its strength at the part's `level`
            const strength = part.strength * (thin?.level ?? 1);
            const level = strength * accent * phraseLevel;
            const vel = chord && singleMedian !== null
              ? Math.pow(strength * singleMedian * phraseLevel, touch!.velocityCurve)
                * Math.pow(Math.pow(10, touch!.chordOverDb! / 10) / voicing.length, 1 / 4)
              : touch && !chord ? Math.pow(level, touch.velocityCurve) : level;
            push(part.voice, Math.max(0, at(c.bar, step) + early + rolled), {
              midi: pitch, dur, vel,
              preset: part.timbre, ...FIGURE!.sends,
              ...(part.envelope ? { attack: part.envelope.attack.beats * beat, release: part.envelope.release.beats * beat } : {}),
            }, { bar: c.bar, step, layer: layerOf(part.voice), note: noteName(pitch),
              ...(pinned?.role === 'figure' ? { part: pinned.id } : {}),
              ...(noteDuration !== undefined && part.articulation === 'struck' ? { articulation: 'struck' as const } : {}),
              ...(part.as ? { ensemble: part.as } : {}) });
            upperEvents.add(events[events.length-1]);
            if (part.phrasing) {
              const profile = characters!.phrases![part.phrasing.character];
              if (profile.treatment) events[events.length-1].treatment = profile.treatment;
              const params = Object.fromEntries(Object.entries(profile.params).map(([k,v])=>[k,phraseArch(v,phase)]));
              for (const [k,v] of Object.entries(profile.beats)) params[k] = phraseArch(v,phase)*beat;
              if (params.attack !== undefined) params.attack = Math.min(params.attack, dur*.5);
              phraseParameters.set(events[events.length-1],params);
            }
          });
        });
      }
    }
  };
}
