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
import type { SpaceRow } from './effects/space.ts';
import type { Settings } from './settings.ts';
import type { KeyboardPatches } from './voices/keys-patches.ts';
import type { KeysEdge, StringsBreath, PianoGrain, HarmonicEdge, MalletStrike } from './voices/grain.ts';
export type { KeyboardPatches } from './voices/keys-patches.ts';
export type { KeysEdge, StringsBreath, PianoGrain, HarmonicEdge, MalletStrike } from './voices/grain.ts';

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
  /**
   * **A part's own space** (liquid-space round 1): a space row (`effects/space.ts`)
   * a theme's part plays through wholly — its notes ask with `p.partSpace` — built
   * once per theme's graph, the first time a note asks. The composer writes it
   * into a theme's overrides where a part asks for one; absent, nothing is built.
   */
  partSpace?: SpaceRow;
  /**
   * **The theme's shared returns**: space rows by id, each a return any note may be
   * sent into by amount (`p.returns`, `withReturns` in dsp.ts) — a hall and an echo with an identity of
   * their own, beside a part's own space — built once per theme's graph, the first time a note or a line
   * names it. The composer writes them into a theme's overrides; absent, nothing is built.
   */
  returns?: Record<string, SpaceRow>;
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
  sidechain: {
    depthDb: number; lowDepthDb: number; attack: number; minimumAt: number; recoverBy: number;
    /**
     * Where the first leg of the way back ends, in beats (60 % of the way up):
     * absent, 0.45, which is every room's. A short duck (round DNB-1: the fast
     * broken beat's sub is back within an eighth note) writes a smaller one
     * and a `recoverBy` over it.
     */
    firstLeg?: number;
    /**
     * The struck voices' depth (round PIANO-2, `struckDuckShape` in
     * `program.ts`): the piano, the plucks, the stabs, any voice whose timbre
     * its descriptor declares struck, duck this far and no further, after the
     * strike. Absent, they take the pads' `depthDb` and shape, as everything
     * melodic did before the round.
     */
    struckDepthDb?: number;
    /** how long the struck voices' dip holds off after the kick, in seconds (absent, `STRUCK_AFTER`) */
    struckAfter?: number;
  };
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
    /**
     * The drums' clip (round DNB-4): the drums' bus and the kick's each through
     * a soft clipper — `driveDb` into the curve and back out of it, so a signal
     * under `knee` (of full scale, after the drive) passes untouched; `curve`
     * is the curve's own drive past the knee. `low`, where given, clips the
     * kick and the bass together where they sum, at its own numbers, in place
     * of the kick alone. Absent or a drive of nought, nothing is built.
     */
    drumClip?: { driveDb: number; knee?: number; curve?: number; low?: { driveDb: number; knee?: number; curve?: number } };
    /** The theme's own sum through a soft clipper after its trim (round DNB-4), as `drumClip`'s numbers; absent, nothing is built. */
    mixClip?: { driveDb: number; knee?: number; curve?: number; makeupDb?: number };
    /**
     * A gentle compressor on the theme's own sum after its trim (round DNB-5),
     * before any `mixClip` and the master every deck shares: the level from
     * the balance and a decibel or two of glue, where a clip took it before.
     * Absent, or a ratio of one, nothing is built.
     */
    busComp?: { threshold: number; knee: number; ratio: number; attack: number; release: number };
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
    /**
     * the most a theme whose trim window has no kick is lifted, in dB, where
     * it is under `clampDb`; absent, the one clamp both ways
     */
    clampUpNoKickDb?: number;
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
    /**
     * the model's reach: a model of its own, fitted on its own windows, for a
     * window the house's sample never held (`drumless`: no kick in it; `drop`:
     * the loudest drop of a form with no main); the slopes, the target, the
     * clamps and the margin stay the block's, and so does the target, unless
     * the family names its own (`targetLufs`, round LOUD-2: set by hand, a
     * level for the family's windows and not a fit)
     */
    families?: Record<string, {
      targetLufs?: number;
      /** what a decibel of trim gives back in this family's windows, each way, where it is not the block's (round DNB-4: a place's clips) */
      slopeUp?: number;
      slopeDown?: number;
      intercept: number;
      coef: Record<string, number>;
      centre: Record<string, number>;
      headroom?: { intercept: number; coef: Record<string, number>; centre: Record<string, number> };
    }>;
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
/**
 * **The bass bus's parallel drive** (round B1, `effects/bass-drive.ts`): the
 * knobs of that effect, which `buildGraph` builds between the bass bus and
 * the body filter when they are there and `blend` is above nought. It is
 * never in a table — no base carries it and no room — only in a theme's own
 * `paramOverrides`, written by the composer's place table for the themes
 * that ask; so a theme at the house resolves to the settings it always had,
 * to the byte, and the hash over them stands.
 */
export interface BassParallel {
  blend: number;
  drive?: number;
  preHz?: number;
  floorHz?: number;
  toneHz?: number;
  /** the wobble on the copy's corner: its period in beats (0 is none), its depth as a fraction of the corner, its phase in turns at the bar line */
  wobbleBeats?: number;
  wobbleDepth?: number;
  wobblePhase?: number;
  /** what the copy is fed (round DUB-4): 0 or absent the bus, 1 the side door alone, which the reese's ride notes play into */
  side?: number;
}

/**
 * **The presence bell on the harmonic bus** (round EQ-2): a peaking filter on
 * the melodic sum — the pads, the keys through their chorus and the leads,
 * never the kick, the sub or the drums — between its seam gain and the duck,
 * so it lifts the notes themselves and not the rooms their sends return
 * from. Like `BassParallel`, never in a table: only in a theme's own
 * `paramOverrides`, written by the composer's place table where `db` is not
 * nought, so a theme the table leaves alone builds the graph it always did.
 */
export interface HarmonicBell {
  hz: number;
  /** Web Audio's peaking Q (linear, the bell's width) */
  q: number;
  db: number;
}

/**
 * **The grain** (round SPARK-1, `voices/grain.ts`): the keyboard's edge, the
 * ensemble's breath, the piano's hammer and body, and the parallel stage on
 * the harmonic bus. Like `BassParallel`, never in a table: only in a theme's
 * own `paramOverrides`, written by the composer's place table, so a theme the
 * table leaves alone resolves to the settings it always had.
 */
export type Table = StyleTable & Instruments & {
  bass: { parallel?: BassParallel };
  harmonicBell?: HarmonicBell;
  keys: { edge?: KeysEdge };
  strings: { breath?: StringsBreath };
  piano: { grain?: PianoGrain };
  harmonicEdge?: HarmonicEdge;
  malletStrike?: MalletStrike;
  /**
   * **The clean keys** (round KEYS-NOISE 2, `voices/grain.ts`): the keyboard
   * rows, by id, whose notes play clean in this theme — no strike noise on
   * the note (`keys.edge.chiff` read as nought for them) and past the harmonic
   * bus's edge (its clean door, as a row's `edge: false` is). Never in a
   * table: written by the composer only into a theme that sounds one of them.
   */
  cleanKeys?: readonly string[];
};

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
  /**
   * The families a lane does not draw: under a named scene (the drone in
   * front), or in a tempo band (`tempoFrom`, inclusive, in BPM — a hand drum
   * on sixteenths at a half-time's pace is a rattle, 10-02), or both. Beside
   * the band an entry may ask the theme's kit (`kits`, the composer's words)
   * and its harmonic bed (`bed`: the bed's own declared facts, a bed that is
   * not struck and holds at least `holdFrom` of the bar — a continuous bed,
   * 10-13); an entry with no scene asks every condition it carries.
   */
  withdraw?: ReadonlyArray<{ scene?: string; tempoFrom?: number; tempoTo?: number; controls?: Readonly<Record<string, { min?: number; max?: number }>>;
    kits?: readonly string[]; bed?: { holdFrom: number }; families: readonly string[] }>;
  /**
   * A level this lane's candidates take under a named scene, by what they
   * were measured to be: a candidate with at least `midFrom` per cent of its
   * energy in the mid band (`mid` on its entry) is written `db` under its
   * trim. A measured property, never an instrument; the machine only carries
   * the word for the scene.
   */
  presence?: ReadonlyArray<{ scene: string; midFrom: number; db: number }>;
  /**
   * What this lane plays where the composition says the drone in front stands
   * on a floor (a soft grid under it, the composer's `floor`): `db` under its
   * level, `knobs` set on each of its notes (in the voice's own declared
   * units), only the candidates whose measured ring reaches `ringFrom`
   * milliseconds (the style's ring table; where none of the lane's live
   * candidates does, the lane draws as it would), `mask`, the sixteen-step
   * figure its source plays in place of the one it drew (on the source's
   * first lane), or `off`, held off in the plan. Measured properties, levels
   * and a figure, never an instrument.
   */
  floor?: Readonly<{ db?: number; knobs?: Readonly<Record<string, number>>; ringFrom?: number; mask?: string; off?: boolean }>;
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
  /**
   * A theme's length is minutes from the derived state, not bars (round L1,
   * `packages/deep-house/src/length.ts`): the seed's place on
   * `themeBarPercentiles` says where in the band, and the bars follow from the
   * tempo. Absent is the bar table, which is the record's.
   */
  themeMinutes?: boolean;
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
  /**
   * How far the set's slow drift may take its tempo, as a share of the tempo
   * the set drew (house-v2's since the deep review of 10-08, B15): the drift
   * climbs as it always has and stops there. Absent is the record's, which
   * climbs for as long as the set runs.
   */
  driftMost?: number;
  /** whether the next theme's key is drawn as a step from the last (house-v2 since round MIX-X2); off is the record's any root */
  harmonicMixing: boolean;
  /** the two hand-over groups a seam cuts holes in */
  swapGroup: string;
  bassGroup: string;
  /** only read when `harmonicMixing` is on: the steps round the wheel, in semitones of the minor root that sounds the key's notes (`planKey`) */
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
  /**
   * **The harmonic cross is short, the rhythmic cross is long** (round MIX-X2).
   * Where two themes' keys share fewer than `related` notes of seven, the
   * outgoing theme's pads and keys fade out over the `fadeBars` before the low
   * end changes hands and the arriving ones fade in over the `crossBars` before
   * it, so two harmonies are never stacked for more than that; the drums, the
   * hats and the bass hole cross over the whole blend as they always have.
   * The outgoing harmony is filtered as it fades (round MIX-X4): its low-pass
   * closes from open at the fade's start to `lpHz` at the swap. Related keys
   * keep the blend as it is. Absent is the record: every layer crosses on the
   * deck's one fader.
   */
  harmonicCross?: { fadeBars: number; crossBars: number; related: number; lpHz: number };
  /**
   * **The hand's hand-over is a budget in seconds** (round MIX-X3): a seam a
   * hand asked for — a bird moved, an engine switched, a cast — changes the low
   * end about `swapSeconds` in, fades the outgoing harmony over the
   * `fadeSeconds` before that and brings the arriving one in over the
   * `crossSeconds` before it, each converted to bars at the tempo the blend
   * is played at and rounded to the bar (`handSeamBars`), the blend twice the
   * swap. A planned seam keeps `swapAfterBars`, `harmonicCross` and the
   * record's blend, in bars. Absent, the hand's seam is the planned one's.
   */
  handSeam?: { swapSeconds: number; fadeSeconds: number; crossSeconds: number };
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
