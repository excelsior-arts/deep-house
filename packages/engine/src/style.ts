// What a style is: the contract, and nothing else.
//
// A **style** is everything about a record that is *this music* rather than the
// machine that plays it — the tempo family, the key and register, the density,
// groove and harmony tables, the section grammar, the rooms, the sound stage's
// rules, the seam arithmetic, the loudness model's coefficients, and the frozen
// candidate lists every die draws from. Round F of PLAN-V1-NEXT gathered all of
// it into one file per style; this is the shape that file has.
//
// **No engine module imports a style**, and since round W of PLAN-V1-NEXT that
// is true of the types as well. It used to be one file short of true: `Table`
// was a `typeof` of the deep house module's own base table, the machine's
// contract taking its shape off one composer's file — erased at build time,
// carrying no value, and still a line drawn from the engine to the music. The
// gate had to state it as an exemption, and an exemption is a hole. So the table
// is **written out here**, and the deep house module *satisfies* it: a field
// the style has and the contract does not is a type error in the style, and a
// field the contract has and the style does not is the same error. The
// instruments are the exception and stay a `typeof`, because `src/params.ts` is
// the engine's own — the kick's envelope and the hats' ladder are what a second
// style would still play — so a voice reading `settings.strings.swellAttack` is
// checked against the number that is really there, which is how round C caught
// `kick.startHzSlow`.
//
// A second style is a second module of this shape. The day its table is not
// this shape, the difference is a compiler error in that module and a decision
// to make here, which is the moment the machine finds out what it really
// requires of a style.

import type { BackgroundSpaceSettings } from './background-space.ts';
import type { Settings } from './settings.ts';
import type { KeyboardPatches } from './voices/keys-patches.ts';
export type { KeyboardPatches } from './voices/keys-patches.ts';

/** A weighted entry, the shape `Rng.weighted` reads. */
export interface Weighted<T> { v: T; w: number; }

/** A number per density word: what a minimal, a medium and a busy room get. */
export interface PerDensity<T> { minimal: T; medium: T; busy: T; }

/**
 * The instruments: `src/params.ts`, which is the engine's own half of the
 * table — the kick's envelope, the hats' ladder, the clap, the bass, the level
 * table and the three harmonic patches. A style spreads them into its table in
 * the position they have always had, and it is a `typeof` rather than an
 * interface because they are *this* module's neighbours and not anybody's music.
 */
export type Instruments = typeof import('./params.ts').INSTRUMENTS;

/**
 * Everything in the table that is not an instrument: what a style has to state
 * for the machine to resolve a room out of it. Written out so that the engine
 * requires a shape rather than reading one off whichever style happens to exist.
 */
export interface StyleTable {
  /** Optional keyboard voicing. Absent on legacy programs; defaults stay intact. */
  keyboardPatches?: KeyboardPatches;
  /** Optional independent returns. Absent only on legacy compiled programs. */
  backgroundSpaces?: { background: BackgroundSpaceSettings; immersed: BackgroundSpaceSettings };
  /** the tempo family, and the die that chooses between its two halves */
  tempo: { def: number; slowMin: number; slowMax: number; fastMin: number; fastMax: number; slowChance: number };
  /** the offbeat eighth as a fraction of the beat, and the hats' own lead, in seconds */
  swing: number;
  hatNudge: number;
  key: { roots: number[]; minorChance: number };
  /** the windows every part is written inside, in MIDI numbers */
  register: {
    subLow: number; subCenter: number; subHigh: number; subCeiling: number;
    chordLow: number; chordHigh: number;
    padLow: number; padOctaveBelow: number; padHigh: number;
  };
  /** the stereo picture: the low end's mono fold, the width, the pans */
  space: {
    sideHpHz: number; sideHpQdB: number;
    widthBase: number; widthDepth: number; widthRateHz: number;
    padDriftHz: number; padDriftCents: number;
    hatPan: number; hatHaas: number; hatHaasPan: number; hatHaasLevel: number;
    clapPan: number;
  };
  /** the three spaces and what goes to them */
  sends: {
    delayFeedback: number; delayDotted: number; delayLevel: number;
    reverbSeconds: number; reverbLevel: number; reverbToneHz: number; reverbCorr: number; reverbLowHz: number;
    roomSeconds: number; roomPreDelay: number; roomLowHz: number; roomHighHz: number; roomLevel: number; roomCorr: number;
    clapReverb: number; hatReverb: number;
    hallSeconds: number; hallDecay: number; hallToneHz: number; hallLowHz: number;
    hallPreDelay: number; hallLevel: number; hallCorr: number;
  };
  /** the one gesture a build and a drop are made of */
  push: {
    satAmount: number; satDrive: number; bodyDb: number; subDb: number;
    buildBars: number; dropBars: number; dropLevel: number; buildLevel: number; markLevel: number;
  };
  /** the sidechain, as `duckShape` reads it */
  sidechain: { depthDb: number; lowDepthDb: number; attack: number; minimumAt: number; recoverBy: number };
  /** the master chain, end to end */
  master: {
    gain: number;
    /**
     * The ceiling is an amplitude between 0.02 and 1 and never a decibel — it
     * is the worklet's own `ceiling` parameter, which clamps — and 1 or more
     * means the limiter is not built at all. Round G found the engine's own
     * fixture table declaring -1 here, where the clamp turned every render it
     * made into a -34 dBFS one; a unit that is not written down is a unit
     * somebody will get wrong.
     */
    limiter: { ceiling: number; lookaheadMs: number; holdMs: number; releaseMs: number };
    limiterFallbackDb: number;
    trim: number;
    /**
     * **Read by nothing** (R80 of the reconciled review of 09-24): the level
     * the live mix aims at is `loudness.targetLufs`. It stays in the table
     * because the table is hashed into house-v2's program lock, and a field
     * taken out of it is a re-bless for a comment's sake.
     */
    targetLufs: number;
    dcHz: number; dcQ: number;
    /** the waveshaper's own word, and one of the three a browser knows */
    oversample: OverSampleType;
    clipKnee: number; clipDrive: number;
    filterOpen: number; filterClosed: number;
    glue: { threshold: number; knee: number; ratio: number; attack: number; release: number; drive: number };
    airHz: number; airDb: number;
    presenceHz: number; presenceDb: number; presenceQ: number;
    lowMidHz: number; lowMidDb: number; lowMidQ: number;
    lowShelfHz: number; lowShelfDb: number;
    midHz: number; midDb: number; midQ: number;
    breakdownLiftDb: number;
  };
  /** how much is playing at once, by the word the density die draws */
  density: {
    weights: Weighted<string>[];
    bassNotes: PerDensity<number>;
    maxStabs: PerDensity<number>;
    bothHarmonicChance: PerDensity<number>;
    fxEveryBars: PerDensity<number>;
    sixteenthHats: PerDensity<boolean>;
  };
  /** the loudness model, fitted on this style's own material */
  loudness: {
    targetLufs: number; clampDb: number; slopeUp: number; slopeDown: number;
    intercept: number;
    coef: Record<string, number>;
    centre: Record<string, number>;
    /**
     * which passage the trim is fitted for: the first long main (absent, the
     * record's rule) or the loudest main window the fit reads
     */
    window?: 'first' | 'loudest';
    /**
     * how far a theme may be trimmed before its master limiter works past the
     * stated share and depth, predicted off the same columns; absent, no cap
     */
    headroom?: {
      activeMax: number; deepestMax: number; marginDb: number;
      intercept: number;
      coef: Record<string, number>;
      centre: Record<string, number>;
    };
  };
  /** the chances that make a groove this groove */
  groove: {
    openHatChance: number; sixteenthHatChance: number; sixteenthHatLevel: number;
    hatVelocityCv: number; ghostClapChance: number;
    bassFifthChance: number; bassOctaveChance: number;
    stabChance: number; kickDropoutChance: number;
  };
  /** which degrees, how long a chord lasts, how long the loop is */
  harmony: {
    degreeWeights: Record<string, number>;
    chordBarsWeights: Weighted<number>[];
    loopBarsWeights: Weighted<number>[];
    ninthChance: number; eleventhChance: number;
  };
  /** the shape of a track: how often it breaks down, how much kick it keeps */
  arrangement: { breakdownBars: number; breakdownEvery: number; kickPresentTarget: number; riserChance: number };
}

/**
 * The settings table a room is resolved against: a style's own numbers with
 * `src/params.ts`'s instruments spread into it, in the order the one table was
 * always written in.
 */
export type Table = StyleTable & Instruments;

/**
 * One frozen candidate list, as the completeness gate walks it. The lists
 * themselves are the style's; what a row of them looks like is stated here, so
 * the gate has a shape to walk and the catalogue a shape to satisfy.
 */
export interface CandidateList {
  /** what the style calls it */
  id: string;
  /** the stream tag that draws it, or how it is used when it is a test */
  die: string;
  /** the file the list is written in */
  where: string;
  /**
   * What a candidate has to resolve to. `room` a room the style declares,
   * `timbre` an entry in the registry's TIMBRES, `mask` a mined table row,
   * `voice` a name in the voice registry, `effect` something the effect
   * registry or the style's own treatment table knows, and `own` a word that is
   * nothing but itself.
   *
   * The last two arrived with round K5a of PLAN-KITCHEN, where a strategy grew
   * lists that name instruments and treatments rather than timbres. They are
   * the machine's vocabulary and not one composer's: what a candidate has to
   * resolve to is a question about the registries, which are the engine's.
   */
  of: 'room' | 'timbre' | 'mask' | 'voice' | 'effect' | 'own';
  /** the list itself, read when it is walked, so a reference cannot go stale */
  list: () => any[];
}

/**
 * **One lane: a part the style plays, and who may play it.**
 *
 * Round K6, and Eugene's decision of 09-18 in one shape: *a style declares its
 * own lanes, and their number is the style's* — "we could have up to 12, and
 * for some styles it could be only 2, like ambient". Before it the number of
 * parts was a constant of the composer: `patterns.ts` wrote `hatClosed` and
 * `shaker` and `generator.ts` wrote `clap`, so a kitchen of sixteen drums could
 * carry a weight that no die could read.
 *
 * A lane says five things and the machine states all five because all five are
 * about the machine's own vocabularies:
 *
 *   **`role`** is what the part does, out of the closed list in
 *   `voices/descriptor.ts`, which is the same word an instrument declares about
 *   itself and the same word a recipe asks for.
 *
 *   **`voices`** is who may play it — a weighted candidate list, in the shape
 *   every other list of a style is in, so a widened lane is widened by the same
 *   rule and `Rng.pickWeighted` draws it the same way. `null` where a *timbre*
 *   decides instead and `timbre` names the die that draws it, because the two
 *   harmonic lanes are chosen by what they play and not by who plays it.
 *
 *   **`figure`** is where its notes come from — a word out of the composer's own
 *   vocabulary of figure sources, because what a mask is and where one is mined
 *   from is music. `slot` is which part of that figure this lane takes, for the
 *   sources that feed more than one lane.
 *
 *   **`bus`** is where it lands, or `null` for a lane whose voice decides.
 *
 *   **`gate`** is the section grammar's own key: the arrangement layer that
 *   switches this lane on, phrase by phrase. `null` for a lane the grammar does
 *   not gate bar by bar — the section glue, which fires at a boundary.
 *
 * `list` is the catalogue row the lane's candidates came from, so the layer
 * above the dice can find the same list's weights; `incumbent` is this lane's
 * own answer where several lanes share one list, and the rows of that list
 * belonging to the *other* lanes are at nought for this one.
 */
export interface Lane {
  id: string;
  role: string;
  /**
   * The candidates, weighted. `opened` and `dropped` are what a strategy's
   * rules did to a newcomer; `trimDb` is a level trim the composer writes onto
   * a candidate's events as a gain, measured against the lane's incumbent on
   * the same figure and absent on the incumbent itself. `mid` is the per cent
   * of a candidate's energy in 400 Hz-2 kHz, read off the same render, where a
   * lane's `presence` asks for it.
   */
  voices: ReadonlyArray<Weighted<string> & { opened?: number; dropped?: unknown; trimDb?: number; mid?: number }> | null;
  timbre?: string | null;
  figure: string;
  slot?: string | null;
  bus: string | null;
  gate: string | null;
  list?: string | null;
  incumbent?: string | null;
  /**
   * Families of candidate this lane puts to the composer's question under a
   * named scene of the composition — whether the candidate, at the lane's
   * pace, stands beside the drone (the composer says what a scene is; the
   * machine only carries the word). A family, never an instrument.
   */
  withdraw?: ReadonlyArray<{ scene: string; families: readonly string[] }>;
  /**
   * A level this lane's candidates take under a named scene, by what they
   * were measured to be: a candidate with at least `midFrom` per cent of its
   * energy in the mid band (`mid` on its entry) is written `db` under its
   * trim. A measured property, never an instrument; the machine only carries
   * the word for the scene.
   */
  presence?: ReadonlyArray<{ scene: string; midFrom: number; db: number }>;
}

/** A room: a set of overrides on the table, plus the figures it was measured with. */
export interface Room {
  id: string;
  label: string;
  note?: string;
  /** the benchmark minute it was measured off; a room without one is not a room */
  bench?: string;
  params?: any;
  /** the masks, the voicing, the degree bias and the sweep it was measured with */
  shape?: any;
}

/** One kind of section: which layers each of its phrases carries, and its filter. */
export interface SectionKind {
  label: string;
  layers: (i: number, n: number) => Record<string, boolean>;
  /** where the macro filter starts and ends across it */
  filter: number[];
  sweepFirst?: boolean;
  impactFirst?: boolean;
  riserLast?: number;
  lift?: boolean;
}

/**
 * How a set is laid out and where a theme hands over: every number
 * `setLayout`, `seamCurves` and `seamPlan` read. MEASURED over 49 well-formed
 * transitions; the measurements are written beside them in the style.
 */
export interface SetRules {
  themeBarPercentiles: number[];
  themeBarsMin: number;
  themeBarsMax: number;
  /**
   * A cut of the drawn length, taken off the mains first (S19): the theme is
   * drawn as the table says, then shortened to this share of it, on the
   * four-bar grid and inside `themeTrimBars`. Absent is no cut.
   */
  themeTrim?: number;
  themeTrimBars?: [number, number];
  shortBlendChance: number;
  shortBlendBars: Weighted<number>[];
  longBlendBars: Weighted<number>[];
  boundaryBars: number;
  skipBars: number;
  filterMoveChance: number;
  outgoingLpHz: number;
  outgoingHpHz: number;
  seamSubTrimDb: number;
  seamSumTrimDb: number;
  swapAfterBars: number;
  tempoGlideBars: number;
  harmonicMixing: boolean;
  /** the two hand-over groups a seam cuts holes in */
  swapGroup: string;
  bassGroup: string;
  /** only read when `harmonicMixing` is on, which it is not */
  keySteps: Weighted<number>[];
  /** the earliest a theme may hand over, as a fraction of its own length */
  seamFloor: number;
  /**
   * Whether a floor that falls past the last line with room for the blend on
   * the set's grid takes a finer line (a phrase, and then four bars) rather
   * than stepping back before the floor. house-v2's since round S4; the record
   * has no field and steps back, as it always did.
   */
  seamLineInside?: boolean;
}

/** A treatment's own numbers: what it multiplies, and over how many bars. */
export type TreatmentRules = Record<string, Record<string, number>>;

/**
 * Every number the sound stage applies. The arithmetic that reads them is the
 * composer's, in `packages/deep-house/src/performance.ts`.
 */
export interface StageRules {
  /** the grid the foreground is assigned on, and how far back a figure is remembered */
  block: number;
  window: number;
  staleBars: number;
  /** what tells a drone from a figure, and a touch from a busy one */
  holdBar: number;
  touchOnsets: number;
  /** which rooms lift a lone drone, and which puts one at the back from bar one */
  liftDensity: string[];
  openAtBackDensity: string;
  /** the bell that makes room for the tune, and the level that pays for it */
  dipDb: number;
  dipQ: number;
  dipMakeupDb: number;
  /** how far each lane moves, and how fast */
  level: Record<string, { front: number; back: number }>;
  backMidShare: number;
  risePerBar: number;
  fallPerBar: number;
  /** the colour of the front and of the back */
  frontWet: number;
  frontLp: number;
  backWet: number;
  backLp: number;
  /** the bar the background is let back up on, and how far */
  letUpEvery: number;
  letUpTo: number;
  /** the treatments, the lanes that may carry each, and how they are rolled */
  treatments: string[];
  padOnlyTreatments: string[];
  rota: Record<string, any>;
  releaseAt: number;
  releaseOver: number;
  treatment: TreatmentRules;
  /** the bass's own contrast */
  bassOpen: number[];
  bassRunBars: number;
  bassChangeOpen: number;
  bassFrontOpen: number;
  /**
   * The bass bus's own level, in dB, over the stage's lane levels: a plain
   * gain on each sub note's output, after its shapers, so the harmonics a phone
   * hears and the depth a sub reaches are the note's either way. Absent is 0.
   */
  bassBusDb?: number;
  /** how far the pad's octave doubling opens, per timbre */
  wideDouble: string[];
  doubleTop: { wide: number; narrow: number };
  /** the per-phrase colour, keyed by the voice that has one */
  phraseColour: Record<string, any>;
}

/** Everything that is this music and not the machine that plays it. */
export interface Style {
  /** the style's own name. No engine module may contain this string. */
  id: string;
  label: string;
  /** the table `resolveSettings` starts from */
  base: Table;
  /** that table resolved once: no room, no overrides, no bypass */
  settings: Settings;
  /** the mined sequences this style speaks in */
  corpus: any;
  /** the rooms it declares; the pool is `catalogue.rooms` and not this */
  rooms: Record<string, Room>;
  /** the section grammar `makeArrangement` reads */
  sections: { kinds: Record<string, SectionKind>; labelToKind: Record<string, string> };
  /**
   * **The parts this style plays, in the order they are written.** Their number
   * is the style's own and nothing may assume it: the deep house record has
   * twelve, an ambient style could have two. The order is the order a bar is
   * written in, so it is a decision and not a set.
   */
  lanes: ReadonlyArray<Lane>;
  /** the sound stage's rules: what the desk does with a plan */
  stage: StageRules;
  /** the set's own numbers: theme lengths, blends, the seam and its floor */
  set: SetRules;
  /** the timbre decisions that used to be name comparisons in the generator */
  figures: { padUnder: string[]; tremolo: Record<string, number>; slowAttack: string[]; ownFigure: string[] };
  /** the loudness model's window rule; its coefficients are in `base.loudness` */
  loudness: { windowBars: number };
  /** every ordered list a die draws from */
  catalogue: any;
  /** one row per list, for the completeness gate */
  candidates: CandidateList[];
  /** the lists that draw zero in the released catalogue, as a fact */
  unreachable: string[];
  /**
   * What this music measured as, where somebody has measured it: the table the
   * composer's own layer above the dice reads, one row per candidate of every
   * list above. The machine states that a style **may carry one** and states
   * nothing about what is in it — the axes it is written in are the composer's
   * and naming them here would be the engine knowing the music again. A style
   * without one is a style nobody has rendered a hundred themes of yet, and
   * everything above the dice is then the identity.
   */
  signatures?: unknown;
}

// A type and not a value, said in syntax that is erased rather than inferred:
// `export default Style` leaves a reference to a binding that is not there once
// the types are stripped, which node finds out at run time and a bundler never
// does. It is on the package's exports map now, so it has to survive stripping.
export type { Style as default };
