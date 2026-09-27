// Declarative composition, separate from the sampler and recipe schema.
import type { PartRequest } from './parts/types.ts';
import type { RecipeSource } from './recipe-placement.ts';
import type { Bird } from './spell.ts';

/** Authored responses are estimates, not the audio encoder's calibration. */
export interface BirdResponse {
  home: number;
  slopes: Partial<Record<Bird, number>>;
  bounds: [number, number];
}
export interface Conditions {
  /** Actual planned tempo. Exclusive lower bound, inclusive upper bound. */
  bpm?: { above?: number; atMost?: number };
  drums?: boolean;
  kits?: string[];
  densities?: string[];
  controls?: Record<string, { min?: number; max?: number }>;
}
/**
 * **Air or sustain** — Eugene, 09-22: struck and tuned percussion adds
 * dynamic to a sparse, interrupted track that has room in it, and does not
 * match a track whose bass, bed and chords hold ("it's not about the woodblock
 * per se, it's about composition rules").
 */
export const TEXTURES = ['air', 'sustained'] as const;
export type Texture = typeof TEXTURES[number];
/**
 * What makes a composition sustained, as a count of the things in it that
 * hold. Each word below is one of them; the thresholds are the style's.
 *
 *   drone    the bass motif's contour is one of `droneContours`, or the bass
 *            is a held line
 *   body     the bassline's tone is one of `heldBodies` (a body held under
 *            the whole note rather than a transient)
 *   bed      the pad timbre is still sounding at the bar line: its declared
 *            `hold` is at least `bedHold`
 *   lead     the lead holds the chord rather than striking it
 *   chords   a struck figure's notes last `heldBeats` beats or longer
 *
 * `sustainedFrom` of them make the texture sustained; fewer leave it air.
 */
export interface TexturePolicy {
  sustainedFrom: number;
  bedHold: number;
  heldBeats: number;
  droneContours: string[];
  heldBodies: string[];
}
/**
 * **One foreground** — Eugene, 09-22, after seeds 5, 12, 13, 20 and 50: "for
 * tracks where drone pads are in the foreground we don't want to deal with
 * percussion and other glass-like sounds, staccato keys; but drones in muted
 * background places go along not so bad, as they give a mood for percussion
 * and other realistic sounds — a scene foundation — and they don't compete for
 * lead."
 *
 * A sustained theme has a scene: the drone in front (`drone-forward`), with
 * nothing of the real-world class beside it, or the drone behind
 * (`drone-back`), at the background presence, with everything an airy theme
 * would carry. An airy theme's scene is `air`: its pad is no drone.
 */
export const SCENES = ['air', 'drone-back', 'drone-forward'] as const;
export type Scene = typeof SCENES[number];
/**
 * How a sustained theme's scene is drawn, and what the drone in front does
 * not stand beside.
 *
 *   forward    the chance the drone takes the foreground: a control the birds
 *              move, or a number. Clamped inside (0, 1) by the control's own
 *              bounds, so both scenes stay reachable at every spell
 *   realWorld  the class the drone in front withdraws: a pace, out of
 *              descriptor properties and the plan, never names. A part that
 *              arrives as a hit (`struck`), is gone before `holdBelow` of the
 *              bar, comes round more often than every `sparseSeconds`, and
 *              holds each note for less than `ringCovers` of the gap to the
 *              next (`realWorld` in composition.ts)
 *   always     the held sets that are the drone in front whatever the coin
 *              says: a texture holding every word of one of them has no
 *              choice to draw and no bird to lean it. A pin still puts the
 *              drone behind it, and with no grid it is in front anyway
 */
export interface ScenePolicy {
  forward: ControlValue;
  always?: ReadonlyArray<readonly string[]>;
  realWorld: { holdBelow: number; sparseSeconds: number; ringCovers: number };
}
/** What the timbre dice say about the harmonic layer, as properties, never names. */
export interface TextureBed {
  /** the pad timbre's declared hold: the fraction still sounding at the bar line */
  bedHold: number;
  /** whether the lead is one that holds the chord */
  leadHolds: boolean;
}
export type ControlValue = number | string;
/** One explicit musical part; its identity is independent of its instrument. */
export interface PartPin {
  id: string;
  role: string;
  request: PartRequest;
  /** A motif player outside PartRequest still occupies arrangement space. */
  usage?: Partial<PartUsage>;
  source?: RecipeSource;
}
export interface PartVariant {
  id: string;
  weight: ControlValue;
  when?: Conditions;
  request: PartRequest;
  /** Versioned recipe claims; the arranger must retain the selected score. */
  source?: RecipeSource;
}
export interface PartFamily {
  id: string;
  chance: ControlValue;
  when?: Conditions;
  requires?: string[];
  excludes?: string[];
  variants: PartVariant[];
}
export interface PartUsage {
  upperParts: number;
  sparseUpper: number;
  rhythmParts: number;
  spatialReturns: number;
}
export interface CompositionPolicy {
  /** Stable random-stream namespace. Data/revision changes have a generation fingerprint. */
  version: string;
  /** The currently supported placement grammar, not a genre classification. */
  placement?: { grammar: string; beatsPerBar: number; pinWhen?: Conditions;
    /** Silence before a reserved phrase, including the dry release. */
    sustainedClearanceBeats?: number };
  provenance: { basis: 'authored' | 'measured'; reference: string; note: string };
  limits: PartUsage;
  /**
   * How many times its palette weight a candidate inside a part's preferred
   * profile draws (`prefer` on a rhythm or pitched part). 1, or absent, is no
   * lean at all.
   */
  prefer?: number;
  /** How the composition's texture is read; required by `scene`. */
  texture?: TexturePolicy;
  /** How a sustained theme's scene is drawn (`ScenePolicy`). */
  scene?: ScenePolicy;
  families: PartFamily[];
}
