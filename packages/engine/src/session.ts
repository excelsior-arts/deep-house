// What a set says about itself.
//
// `createMix` is the facade the interface holds — start, stop, skip, back,
// seek, planTheme, subscribe, state — and this is the shape of the two values
// it hands back: one theme, as a readout, and the whole transport at an
// instant. Both are values a page draws and a bench writes down; neither is a
// deck, a node or a plan.
//
// It is a module of its own since round E of PLAN-V1-NEXT because the readout
// is a pure function of a plan, and `createMix` was the last place that fact
// was hidden inside a closure.
//
// Nothing here is imported from anywhere. `themeInfo` reads the fields of a
// planned theme and names none of the music in it, which is why round W of
// PLAN-V1-NEXT could leave the shape of a readout with the machine: the one
// edge this module had was a re-export of `SetSeam` that no caller ever asked
// for, and it went with the split.

/** One section of a theme, as a readout names it. */
export interface SectionInfo {
  label: string;
  bars: number;
  startBar: number;
}

/** One theme, as the interface draws it. */
export interface ThemeInfo {
  index: number;
  seed: string | number;
  preset: string;
  presetLabel: string;
  bpm: number;
  key: string;
  bars: number;
  barSeconds: number;
  /**
   * What the dice drew. `unknown` because it is the composer's own record of
   * its own decisions — which dice a style has is the style's — and this
   * readout carries it to the page without reading a field of it.
   */
  dice: unknown;
  /** the per-theme loudness trim, in dB, so a rating carries the level it played at */
  trimDb: number;
  /** mixing, not music: the harmonic layer's wetness as a word and a level */
  sound: unknown;
  sections: SectionInfo[];
}

/** The transport at an instant: everything a subscriber is given. */
export interface MixState {
  running: boolean;
  masterSeed: string;
  /**
   * The composition strategy this set is planned under, by its id. The machine
   * states that a set has one and states nothing about what the ids are: which
   * strategies exist is the composer's table (round K5a of PLAN-KITCHEN), and a
   * session that was made before there were any simply does not carry it.
   */
  strategy?: string;
  preset: string;
  themeIndex: number;
  theme: ThemeInfo | null;
  /** while a seam runs, the theme that is arriving *is* the next one */
  next: ThemeInfo | null;
  incoming: ThemeInfo | null;
  elapsed: number;
  themeSeconds: number;
  /**
   * **What a beat costs on the set's own grid, now**, in seconds.
   *
   * A set keeps one grid: through a seam the two decks share the outgoing
   * theme's tempo, and when the outgoing deck is gone the grid glides to the
   * incoming theme's own over sixteen bars. So a theme's `bpm` is its *target*
   * and, for those bars, not the rate it is being played at — and a face that
   * draws a beat is drawing this and not that. A session made before the clock
   * said so does not carry it.
   */
  beatSeconds?: number;
  /**
   * **How long until the grid counts at the tempo the set is heading for**, in
   * seconds: the rest of a hand-over in flight and the glide it will begin
   * with, or the rest of a glide in flight; nought when the grid is at its
   * theme's own tempo. Read off the clock's pins and glides, so a face can
   * draw the whole of a tempo's arrival and not only the seam (round K12c).
   */
  settleIn?: number;
  /** how far through a hand-over, nought to one, and nought when there is none */
  transition: number;
  /**
   * A hand-over into **another set** is up: since 09-19 a cast is a mix from
   * where the record is into the first theme of a new one rather than a stop
   * and a start, so for the length of that blend the seed above is still the
   * set that is playing and becomes the arriving one at the swap.
   */
  casting?: boolean;
  /** notes the scheduler reached after their time, and by how much */
  late: { count: number; last: number; at: number; cause: string | null };
}

/** What a skip, a back or an arriving seam answers with. */
export interface TransportPoint {
  at: number;
  end: number;
  swapAt: number;
  bars: number;
  themeIndex?: number;
  silent?: boolean;
}

/**
 * What a readout is made of: the fields of a planned theme `themeInfo` reads,
 * and not one more. It is **not** a plan — the machine does not know what one
 * is, and `packages/deep-house` is where that is written down — it is the list
 * of what a plan has to carry for a page to be able to draw it, which is why it
 * is stated here rather than imported from somebody's music.
 */
export interface PlannedTheme {
  index: number;
  seed: string | number;
  preset: string;
  presetLabel: string;
  bpm: number;
  /** the key, which the readout takes the name of */
  key: { name: string };
  bars: number;
  barSeconds: number;
  dice: unknown;
  trimDb?: number;
  sound?: unknown;
  arrangement: { sections: SectionInfo[] };
}

/** A planned theme, as the readout of it. Pure: it reads a plan and nothing else. */
export function themeInfo(t: PlannedTheme): ThemeInfo {
  return {
    index: t.index,
    seed: t.seed,
    preset: t.preset,
    presetLabel: t.presetLabel,
    bpm: t.bpm,
    key: t.key.name,
    bars: t.bars,
    barSeconds: t.barSeconds,
    dice: t.dice,
    trimDb: t.trimDb ?? 0,
    sound: t.sound || null,
    sections: t.arrangement.sections.map((s: SectionInfo) => ({ label: s.label, bars: s.bars, startBar: s.startBar })),
  };
}
