// Every die of a theme, written down, so a listener can see why two seeds
// differ: the readout a plan carries as `dice`. Split out of generator.ts in
// the composer fix round of 09-22 without moving a key: the golden digest
// hashes this object, so its keys and their order are the record's.
import type { Derived } from './spell.ts';
import type { Development, DevelopmentPolicy } from './development.ts';
import type { ShapePolicy, ShapeTrace } from './development-shape.ts';
import type { RhythmDevelopmentPolicy, prepareRhythmDevelopment } from './development-rhythm.ts';
import type { Composition } from './composition.ts';
import type { MusicalParts } from './parts/types.ts';
import type { RhythmLane } from './parts/rhythm.ts';
import type { RolledFigure } from './parts/perform-figure.ts';
import type { PlayedMotif } from './motif-perform.ts';
import { noteName, type Progression } from './theory.ts';
import type * as P from './patterns.ts';
import type { ThemeDice } from './generator.ts';

/**
 * What `readout` writes the dice from: the theme's draws, as `compose` holds
 * them. It was a second exported `Readout` beside the control's (the ring's
 * reading of a playing theme), two types of one name for two things (D47 of
 * the reconciled review of 09-24); this one is the readout's arguments.
 */
interface ReadoutInputs {
  form: DevelopmentPolicy | null;
  development: Development;
  refused: boolean;
  bars: number;
  shaped: { trace: ShapeTrace } | null;
  bassDevelopment: ShapePolicy['bass'] | null;
  composition: Composition | null;
  preset: string;
  density: string;
  slow: boolean;
  chordRoot: number;
  scaleName: string;
  voicingStyle: string;
  CAT: any;
  leadTimbre: string;
  padTimbre: string;
  stabTimbre: string;
  UPPER: RolledFigure | null;
  UPPERS: readonly RolledFigure[];
  DERIVED: Derived | null;
  breakRow: P.BreakRow | null;
  MOTIF: PlayedMotif | null;
  ACCOMPANIMENT_BASS: PlayedMotif | null;
  ownFigure: boolean;
  pianoRole: string;
  fx: { name: string };
  bassTemplate: { m: string };
  parts: MusicalParts;
  rhythm: readonly RhythmLane[];
  rhythmMotion: ReturnType<typeof prepareRhythmDevelopment> | null;
  rhythmPolicy: RhythmDevelopmentPolicy | null;
  /** the percussion development's palette, withdrawn by the drone in front */
  rhythmWithheld: boolean;
  stabTemplate: { m: string };
  hatTemplate: { m: string };
  progression: Progression;
}

export function readout({ form, development, refused, bars, shaped, bassDevelopment, composition, preset, density, slow, chordRoot,
  scaleName, voicingStyle, CAT, leadTimbre, padTimbre, stabTimbre, UPPER, UPPERS, DERIVED, breakRow, MOTIF, ACCOMPANIMENT_BASS,
  ownFigure, pianoRole, fx, bassTemplate, parts, rhythm, rhythmMotion, rhythmPolicy, rhythmWithheld, stabTemplate, hatTemplate, progression }: ReadoutInputs): ThemeDice {
  return {
    ...(form ? { development, developmentBars: bars, developmentLimit: form.maxSectionBars } : {}),
    ...(refused ? { developmentRefused: development } : {}),
    ...(shaped ? {developmentShape:JSON.stringify(shaped.trace), ...(bassDevelopment ? {bassDevelopment:JSON.stringify(bassDevelopment)} : {})} : {}),
    ...(composition ? {composition:JSON.stringify(composition.trace)} : {}),
    // Air or sustain, and what holds (composition.ts `textureOf`); and the
    // theme's one foreground, which is why a hand row, a struck sixteenth or a
    // glass stab was or was not drawn beside the drone.
    ...(composition?.trace.texture ? { texture: `${composition.trace.texture.is}${composition.trace.texture.held.length ? ` (${composition.trace.texture.held.join(', ')})` : ''}` } : {}),
    ...(composition?.trace.scene ? { scene: composition.trace.scene } : {}),
    preset,
    density,
    // **Two words named alike** (R101 and D27 of the reconciled review of
    // 09-24). This is the style's own coin, `rollTempo`'s: `slow` is the
    // style's name for its *upper* family (100-105 BPM), so it reads `upper`.
    // It is not the spell's derived band, which is `band` below and
    // `derive().tempoFamily` in `spell.ts`. And in a set it is the theme's own
    // coin, which the set overrides: a set rolls one tempo for every theme
    // (`set-plan.ts`) and plays that, so here it says what the theme would
    // have drawn alone. The key is hashed with the plan in both locks, which
    // is why it keeps its name.
    tempoFamily: slow ? 'upper' : 'lower',
    key: noteName(chordRoot).replace(/-?\d+$/, '') + ' ' + scaleName,
    voicingStyle,
    // A readout of the density roll for the ring, in the `{ value, label }`
    // shape: the value is what was rolled, the label is what a listener
    // would call it. Not a new die — the roll already existed.
    densityDie: { value: density, label: CAT.densityLabel[density] || density },
    leadTimbre,
    padTimbre,
    stabTimbre: composition && UPPER ? UPPER.timbre : stabTimbre,
    // Derive-lite's two, present only where the derived state really moved
    // this theme: a spread of nothing is the object the record has always
    // hashed, which is why the house's own digests do not see them.
    ...(DERIVED && DERIVED.tempoFamily !== 'house' ? { band: DERIVED.tempoFamily } : {}),
    ...(breakRow ? { breakMask: breakRow.name } : {}),
    // The theme, where this track has one. Absent on every track that does
    // not, so the object the record has always hashed is the one it hashes.
    ...(MOTIF ? {
      motif: MOTIF.family.id,
      motifRegister: MOTIF.register,
      motifDegrees: MOTIF.motif.degrees.join(' '),
      motifCell: MOTIF.motif.cell.join(' '),
      motifReturns: MOTIF.returns,
    } : {}),
    ...(ACCOMPANIMENT_BASS ? { accompanimentBass: ACCOMPANIMENT_BASS.family.id } : {}),
    pianoRole: ownFigure ? pianoRole : null,
    // The ring's timbre glyph reads this; it is the instrument playing the
    // figure, which is the one a listener names.
    keysPreset: stabTimbre,
    fxPalette: fx.name,
    bassMask: bassTemplate.m,
    ...(parts.heldBass ? { bassFigure: 'held-harmony' } : {}),
    ...(UPPER ? { struckFigure: UPPER.family.id, struckFigureVoice: UPPER.voice, struckFigureDegrees: UPPER.motif.degrees.join(' '), struckFigureCell: UPPER.motif.cell.join(' '), struckFigureSpacing: UPPER.spacing, struckFigureEntry: UPPER.entry } : {}),
    ...(UPPERS.length > 1 || UPPER?.behavior === 'ostinato' ? { struckFigureParts: JSON.stringify(UPPERS.map(p => ({ voice: p.voice, behavior: p.behavior, degrees: p.motif.degrees, cell: p.motif.cell, spacing: p.spacing, entry: p.entry }))) } : {}),
    ...(parts.pedalHarmony ? { harmonyMovement: 'pedal' } : {}),
    ...(rhythm.length ? { rhythmParts: rhythm.length } : {}),
    ...(rhythmMotion ? {rhythmDevelopment:JSON.stringify({role:rhythmPolicy!.role,parts:rhythmPolicy!.parts.map(p=>p.id)})} : {}),
    ...(rhythmWithheld ? { rhythmDevelopmentWithheld: 'scene' } : {}),
    stabMask: stabTemplate.m,
    hatMask: hatTemplate.m,
    loopBars: progression.loopBars,
    progression: progression.chords.map((c) => c.roman).join('-'),
  };
}
