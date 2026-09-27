// The musical contract. Neither its inputs nor outputs belong to recipes.
import type { MotifBox } from '../motif.ts';
import type { Ambience, Presence, StruckFigure } from './figure.ts';
import type { RhythmPart, RhythmLane, RHYTHM_ROLES } from './rhythm.ts';
import type { PulseTexture, Tone } from './texture.ts';

export interface PartRequest {
  bassMotif?: MotifBox;
  heldBass?: boolean;
  struckFigures?: StruckFigure[];
  texture?: PulseTexture;
  rhythm?: Partial<Record<typeof RHYTHM_ROLES[number], RhythmPart[]>>;
  tone?: Tone;
  ambience?: Ambience;
  presence?: Presence;
  pedalHarmony?: boolean;
}

export interface MusicalParts {
  bassMotif: MotifBox | null;
  heldBass: boolean;
  struckFigures: StruckFigure[];
  texture: PulseTexture | null;
  rhythm: RhythmLane[];
  tone: Tone;
  ambience: Ambience;
  presence: Presence;
  pedalHarmony: boolean;
}

export const emptyParts = (): MusicalParts => ({
  bassMotif: null, heldBass: false, struckFigures: [], texture: null,
  rhythm: [], tone: {}, ambience: {}, presence: {},
  pedalHarmony: false,
});
