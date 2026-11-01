// The theme's own loudness, decided before a node is built.
//
// The make-up gain is one number for the whole record and the limiter does the
// levelling, so before this a main groove landed anywhere between about -15.6
// and -11.2 LUFS depending on the room the preset die rolled and how much was
// playing. Four decibels is not a mix: it is one theme quieter than the next,
// and a listener hears it as a fault in the record rather than as a property of
// the seed.
//
// The fix is not a compressor and not a meter. A theme's loudness turns out to
// be largely a function of things the plan already knows — the levels the room
// declares, what the density die said, which layers are sounding, how thick the
// mined masks are, and what the instruments holding the chords say about
// themselves — so it is *predicted* at plan time and the error is handed to the
// theme's own output gain in `buildGraph`. The trim therefore sits under
// everything the theme does to itself and above the master every deck shares:
// the sound stage, the width and the macro filter are upstream of it; the
// limiter, the make-up and the ceiling are downstream; and two decks at a seam
// each carry their own while one fader crossfades between them.
//
// It costs nothing at runtime. There is no render, no analysis and no envelope
// follower: one pass over eight rows of the timeline and about twenty
// multiplications, worked out once when a theme is planned.
//
// ## Nothing here names an instrument, or a room
//
// That is the point of the file, and it is the same argument `hatEnergy` makes
// in params.ts: a fit with a coefficient for `piano` and another for `organ` is
// a fit somebody has to run again every time a voice is written, and this
// catalogue is meant to grow. So:
//
//   a room is read as the levels and the sidechain it declares, never as its
//   name, so a preset written tomorrow gets a sensible answer with no case
//   added to any switch;
//
//   an instrument is read as the four numbers it declares about itself in
//   `TIMBRES` (packages/engine/src/voices/index.ts, filled by the voice modules): its family,
//   whether it is struck, how much of the note is still there at the bar line,
//   its own filter corner, and how loud it is alone at its table level. Adding
//   a family is adding its module and its numbers. The fit sums over whatever
//   is sounding and gains no coefficient.
//
// The coefficients themselves live in the `loudness` block of the style's own
// table (`src/styles/deep-house.ts`), with the date, the seed range and the
// residual beside them, and the window's eight bars beside those. This file is
// the model: how a window is chosen, what the columns are, how a prediction
// becomes a trim. Since round F it is handed a **style** rather than a settings
// value, because those two — the coefficients and the base table they were
// fitted against — are the same object's and have to arrive together.
//
// ## The base table, said out loud
//
// Every number this file reads is the *base* one, never a room's: the model
// was fitted that way and a theme's own room reaches it through
// `track.paramOverrides`, which is a plan fact. Since round C that is an
// argument rather than an assumption — `settings` defaults to the frozen base
// value and every caller inside the machine passes it — so the day a style
// wants the model fitted against something else, the seam is already cut.
//
// One thing the base value deliberately does *not* carry here: the sub
// ceiling. `L.sub` below is the level the room asked for and not the level the
// graph will play, because that is what the fit was measured against. The
// overrides are spread over the base table by hand for exactly that reason.

import { BY_NAME, TIMBRES, VOICE_KNOBS, levelKeyOfRole, voicePlaying } from '@deep-house/engine/voices';
import type { Style } from '@deep-house/engine/style';
import { beatOf, type BeatLed } from './beat-reading.ts';

// --- as much of a plan as the model reads -----------------------------------
//
// Not the plan's own type: what the fit is *allowed* to look at, written out.
// The list is the argument at the head of this file said in the type system —
// a column may come off the arrangement, off the numbers a room declares, or
// off what an instrument says about itself, and off nothing else — so a field
// that is not here is a field the model cannot reach for.

/** One section of the arrangement, as the window rule reads one. */
export interface LoudnessSection {
  kind: string;
  bars: number;
  startBar: number;
}

/** A theme, as `loudnessWindow` reads one: its length and its sections. */
export interface WindowTrack {
  bars: number;
  arrangement?: { sections?: LoudnessSection[] } | null;
}

/**
 * The dice the model reads. Every one of them is a plan fact and not an
 * instrument's: the two timbre dice are read for the numbers `TIMBRES` holds
 * against the name, never for the name.
 */
export interface LoudnessDice {
  voicingStyle?: string;
  loopBars?: number;
  bassMask?: string;
  stabMask?: string;
  hatMask?: string;
  stabTimbre?: string;
  padTimbre?: string;
  /** the timbre a redrawn keys front's figure was levelled for (the far-apart rule, `generator.ts`) */
  keysLevelledAs?: string;
}

/**
 * A room's overrides, as the four blocks this file merges over the base table.
 * Every value in them is a decibel, a drive or a corner — a number — which is
 * why they are read as records rather than as the instruments' own shapes.
 */
export interface LoudnessOverrides {
  levels?: Record<string, number>;
  sidechain?: Record<string, number>;
  kick?: Record<string, number>;
  bass?: Record<string, number>;
  hats?: { trimDb?: number };
  /** the presence bell on the harmonic bus (round EQ-2), its most in dB */
  harmonicBell?: { db?: number };
}

/** One bar of the timeline: which layers are sounding in it. */
export interface LoudnessRow {
  layers: string[];
}

/**
 * One event, as the fit reads one: when it fires, which layer fired it, and
 * the three of its own parameters that are about level and about wetness. `p`
 * is the voice's own object and the engine's `ProgramEvent` declares it open;
 * what is named here is only the part the model may read.
 */
export interface LoudnessEvent {
  t: number;
  /** the voice that plays it (the seasoning as the window hears it, `knobHeardDb`, and the harmonic sum's own) */
  voice?: string;
  layer?: string | null;
  role?: string | null;
  p?: Record<string, number>;
  /** the decibels the front rule took off the note (`generator.ts`, `catalogue.front`) */
  frontDb?: number;
  /** the level its band bell took off the note, the gain unmoved (`catalogue.front.bands`) */
  bandDb?: number;
}

/** A planned theme, as the whole model reads one. */
export interface LoudnessTrack extends WindowTrack {
  /** the theme's clock: a free one (bells, bowls, waves) reads no beat (`beat-reading.ts`) */
  clock?: string;
  /** the arrangement's phrases (PLAN-UNIFY U2, `track.phrasing`): their spans are not the groove a trim is fitted for */
  phrasing?: { segments?: ReadonlyArray<{ from: number; to: number }>; outs?: ReadonlyArray<{ from: number; to: number }>; cooldowns?: ReadonlyArray<{ from: number; to: number }> } | null;
  bpm: number;
  density: string;
  barSeconds: number;
  timeline: LoudnessRow[];
  events: LoudnessEvent[];
  dice?: LoudnessDice;
  paramOverrides?: LoudnessOverrides;
  /** `keyScale`: the key die's own mode where a place drew another (PLAN-AMBIENT Phase 6), the word the model was fitted on */
  key?: { scaleName?: string; keyScale?: string } | null;
  progression?: { chords: unknown[] } | null;
  /** the music it was planned as; the three entry points default to it */
  style?: Style;
  /** what the place said of the theme's sound (round DNB-4 reads its `targetLufs` and `measuredLufs`; the sea its `levelDb`) */
  sound?: { targetLufs?: number; measuredLufs?: number; levelDb?: number } | null;
  /**
   * **What the spell asked of each drawn voice's own ranges** — the seasoning,
   * by event name (PLAN-MODULATION M1). Absent at the house and under the
   * record; where it is there, each setting moves that voice's declared
   * loudness by its own **measured** slope, which is what `knobDbOf` below
   * reads. A brighter or a longer instrument is a louder one, and a trim that
   * did not know it would take the difference out of the whole theme.
   */
  knobs?: Record<string, Record<string, number>>;
  /** the plan's curves, of which the model reads one: the bell's gain section by section (round EQ-5) */
  automation?: { bell?: { t: number; value: number }[]; floors?: { t: number; keys?: number; pad?: number; piano?: number }[] } | null;
}

/**
 * **How much louder the seasoning made one voice**, in decibels.
 *
 * `slopeDb` is written by `tools/test-voices.ts --knobs --bless`, which renders
 * the instrument alone at each knob's min, default and max and fits the line —
 * so this is a measurement summed, and never a guess. A knob whose slope is
 * not a number contributes nothing, and cannot: the engine's own contract gate
 * refuses to ship one.
 *
 * At the house there are no settings at all, so this is nought by having
 * nothing to add rather than by arithmetic that cancels.
 */
export function knobDbOf(knobs: Record<string, Record<string, number>> | undefined, voice: string): number {
  const row = knobs && knobs[voice];
  if (!row) return 0;
  const table = VOICE_KNOBS[voice] || {};
  let db = 0;
  for (const [name, set] of Object.entries(row)) {
    const spec = table[name];
    if (spec && Number.isFinite(spec.slopeDb) && Number.isFinite(set)) db += spec.slopeDb * (set - spec.default);
  }
  return db;
}

/**
 * **The features vector, by name.** Every field is one number the plan already
 * knows, and the `share_<layer>` keys are the style's own gated lanes — a
 * pattern rather than a list, because how many parts a piece of music has is a
 * property of the music and this file may not know their names.
 */
export interface LoudnessFeatures {
  density: string;
  bpm: number;
  themeBars: number;
  scale: string;
  voicingStyle: string | undefined;
  loopBars: number;
  chords: number;
  layers: number;
  bassMask: number;
  stabMask: number;
  hatMask: number;
  lvSub: number;
  lvKeys: number;
  lvPad: number;
  lvPiano: number;
  /** the steps keyed to the bed (keys by the hats or the body) over the window, in dB, apart from the room's levels */
  floorKeysDb: number;
  floorPadDb: number;
  floorPianoDb: number;
  lvHat: number;
  lvShaker: number;
  lvClap: number;
  sidechainDb: number;
  sidechainLowDb: number;
  kickDrive: number;
  bassDrive: number;
  hatTrimDb: number;
  harmonicDb: number;
  harmonicHold: number;
  harmonicBright: number;
  harmonicStruck: number;
  harmonicRoles: number;
  /** the harmonic roles as the notes written for them fill the window, in dB */
  harmonicEnergyDb: number;
  /** what the spell's seasoning is worth, in dB, on the voices the harmonic sum does not hold */
  knobDb: number;
  /**
   * the spell's seasoning as the window hears it, in dB (round loudness-v24): each voice sounding in the window at its
   * knobs' measured worth, weighted by its share of the window's power (its notes' energy at its lane's level); a voice
   * that does not sound there seasons nothing
   */
  knobHeardDb: number;
  /** the presence bell on the harmonic bus over the window, in dB (round EQ-5): nought where there is none */
  bellDb: number;
  rateKick: number;
  rateKeys: number;
  ratePad: number;
  rateBass: number;
  rateHats: number;
  rateShaker: number;
  rateFx: number;
  velKeys: number;
  velPad: number;
  velBass: number;
  velHats: number;
  wetKeys: number;
  wetPad: number;
  delayKeys: number;
  delayPad: number;
  /** the mean gain the layer's notes are written at, in dB */
  gainKeys: number;
  gainPad: number;
  gainBass: number;
  gainHats: number;
  from: number;
  windowBars: number;
  /** the kind of the section the window opens in ('main', 'drop', …) */
  windowKind: string;
  /**
   * the level the theme's place asks its windows be trimmed to, in LUFS, or
   * not a number where the place asks none (round DNB-4, `DrumsEntry.targetLufs`)
   */
  placeTargetLufs: number;
  /**
   * what the place's windows measure at a trim of nought, in LUFS, where its
   * row says (round DNB-4, `DrumsEntry.measuredLufs`), else not a number
   */
  placeMeasuredLufs: number;
  /**
   * how far the theme's own windows measure from the place's at a trim of nought, in dB, where the place's row leans it
   * (ambient-waves-4, the sea's `measuredDb`: what Tide and Veil take from the sea), else nought; the trim gives it back
   * one for one (`trimAt`)
   */
  placeLevelDb: number;
  /** what the front rule took out of the window, in dB before the master (`catalogue.front.makeup`, `lufsAfter`) */
  frontLossDb: number;
  /** what the front rule took off the window's peaks, in dB ahead of the limiter (`catalogue.front.peak`, `headroomOf`) */
  frontPeakDb: number;
  /**
   * what that is read from: the kick's, the bass's, the pad's and the keys' amplitude in the window as the plan wrote
   * it (dB, before the rule, the room's lane levels on, `catalogue.front.peak`'s offsets not), and the share of the
   * keys' and the pad's amplitude the rule kept. Plain numbers, so a window read through the bars and by the walk
   * compare field by field
   */
  frontPeakKick: number;
  frontPeakBass: number;
  frontPeakPad: number;
  frontPeakKeys: number;
  frontKeysKept: number;
  frontPadKept: number;
  /**
   * what limits a window, as the plan writes it once the front rule has played (round saw-bed, the headroom refit):
   * the bed's and the keys' notes over the window at the level they play, their lanes on, and the clap's, in dB on the
   * kick's footing (`frontPeakKick`); `SILENT_DB` where a part has no notes
   */
  padNowDb: number;
  keysNowDb: number;
  clapDb: number;
  /**
   * the theme's sum clip (round drum-clip, `catalogue.front.clip`): the trim the clip is set for (its curve's top on
   * the depth line at that trim), and how deep the loudest block would stand without it, as the saw-bed's depth line
   * read it (the room it leaves, dB of trim); both nought where no clip is planned (`clipOn` 0)
   */
  clipOn: number;
  clipRoomDb: number;
  clipDepthDb: number;
  /**
   * **What kind of place the theme is** (round loudness-place): the share of its grooves' bars with a kick or a drum
   * strike, the tempo's share (nought at 112 BPM felt, one at 128), and their product, the handovers' `beatLed`
   * (`beat-reading.ts`), read apart. The theme's, not the window's: one number per theme, read at its own tempo, so a
   * track alone is aimed where its link always aims it. They set the aim, the limiter's allowance and the density
   * (`targetOf`, `allowanceOf`, `densityOf`), and the fits may read them as columns.
   */
  drumsShare: number;
  tempoShare: number;
  beatLed: number;
  /** the least headroom the window walk found in the theme's other passages, in dB on the trim's footing (`walked`), or not a number */
  walkRoomDb: number;
  /**
   * **The density by place** (round loudness-place, round 2): nought on the ambient, about 0.55-0.65 on the deep groove
   * (sliding in the felt tempo between its slow and its fast end), one on the beat-led (`densityAmountOf`). The theme's.
   */
  densityAmount: number;
  /** the kick's and the clap's level set down on the plan, in dB (round 2, `clipPlan`: the loudest hit, not the body, held the trim); nought where none */
  hitDb: number;
  /** the pad's share of the window where the pad's role is played by a struck voice (a Rhodes, an organ: round 2), else nought */
  padStruck: number;
  /** a theme with few drums: the power mean of the model's reading over every window the walk reads (round 2, `walked`), in LUFS, or not a number */
  walkLufs: number;
  /** one per gated lane, in the lane table's own words */
  [share: `share_${string}`]: number;
}

/** A column of the fit: one number read off the features vector. */
export type LoudnessColumn = (f: LoudnessFeatures) => number;

// The eight bars a theme is measured by, and the same eight bars the fit is
// evaluated on: the middle of the first main section that starts past bar 16,
// so the sound stage has a history behind it. This rule is the measurement's
// own — tools/loudness-fit.ts renders exactly this window — and the floor of
// two bars is there because the measurement renders two bars of pre-roll into
// it. A theme too short to hold one (a set built out of sixteen-bar themes, as
// the seam scene is) falls back to its longest main, and then to its opening.
export function loudnessWindow(track: WindowTrack, bars: number): { from: number; bars: number } {
  const secs = (track.arrangement && track.arrangement.sections) || [];
  const mains = secs.filter((s) => s.kind === 'main');
  const long = mains.filter((s) => s.bars >= bars);
  let pick: LoudnessSection | null | undefined = long.find((s) => s.startBar >= 16) || long[long.length - 1];
  if (!pick) pick = mains.reduce<LoudnessSection | null>((a, s) => (!a || s.bars > a.bars ? s : a), null);
  const n = Math.max(1, Math.min(bars, pick ? pick.bars : track.bars, track.bars));
  const start = pick ? pick.startBar + Math.floor((pick.bars - n) / 2) : 0;
  return { from: Math.max(0, Math.min(track.bars - n, Math.max(2, start))), bars: n };
}

// **The passage a trim is fitted for, which for a style that asks for it is the
// loudest main and not the first.** `loudnessWindow` above is the window the
// record's fit was *measured* on, the first main that starts past bar 16. That
// is a fair sample of a theme and a poor passage to level one by: a trim is one
// number for the whole theme, the master's limiter is what pays for it, and the
// limiter only pays where the theme is loudest. house-v2's arrangement switches
// its harmonic gates section by section, so its first long main can be the one
// with the pad gated off — seed 20 theme 0 (09-22): bars 82-90 hold the keys
// alone, the fit read `share_pad` 0 and `harmonicDb` -21.5, predicted -14.83
// against -13 and handed the theme +2.90 dB, and where the swell pad and the
// glass stabs sound together in the first main that drove the limiter 10.8 dB
// deep in 22 % of its 10 ms blocks. Eugene heard it as the pads going "into
// overload clipping territory".
//
// So under `window: 'loudest'` every eight-bar window inside a main section is
// read by the fit's own columns — the gates that are on in it, what the
// harmonic roles sounding in it declare about themselves, the notes written in
// it, the hand rows among them — and the trim is fitted for the one the fit
// reads loudest. A positive trim is then only handed to a theme whose loudest
// main is itself under the target, and a theme with a quieter main somewhere
// is left quieter there, which is a record breathing and not a record pumping.
// The windows start past bar 2 for the measurement's pre-roll, as the first
// rule's do, and ties go to the earlier window. A theme with no main long
// enough reads its drops the same way, and one with neither takes the first
// rule.
//
// What no column can see is what the sound stage puts on a note after the plan
// is written. Its overdrive treatment on the pad (house-v2's rota) raises the
// pad eight LU and the whole mix three and a half: seed 20's bars 8-16 measure
// -14.0 LUFS without it and -10.6 with it, the limiter in 16 % of blocks
// against 54 %. That is the stage's to level, and is open (the round note).
//
// The rule is the model block's (`settings.loudness.window`), not the window
// table's: house-v1's block names none and reads `loudnessWindow` exactly as it
// always has, so its trims do not move by a bit.
//
// **A theme with no main** (round LOUD-1) takes the same reading over its
// drops. The Dubstep place's forms are intro, build, drop, breakdown and outro
// with no main at all, and under the first rule's fallback its trim was fitted
// at bars 2-10: an intro of kick and hats, which the fit (taught on mains)
// read at -9.76 LUFS, louder than its drops, and trimmed the whole theme to the
// -6 dB clamp. A drop is where such a form stands at its fullest, the part a
// main is in a house form, so its loudest drop is the passage the one number is
// right for. A theme with neither falls back to the first rule as before.
//
// **A phrase event is not the main's level** (PLAN-UNIFY U2): a window holding
// one of the arrangement's phrases (`track.phrasing`: a sub-segment, the bass
// out before an anchor, a cooldown) is the main stepping aside for a bar or a
// few, and the fit reads such a window as no main it was taught on (seed 1's
// cooldown, the bass out across four bars, read 0.7 dB over its steadiest
// main and pulled the whole theme down by that). The trim is fitted for the
// windows of the steady groove, and reads one with a phrase in it only where
// every window of the kind holds one.
const WINDOW_KINDS = ['main', 'drop'] as const;

function mainWindows(track: LoudnessTrack, bars: number, kind: string = 'main'): { from: number; bars: number }[] {
  const out: { from: number; bars: number }[] = [];
  for (const s of (track.arrangement && track.arrangement.sections) || []) {
    if (s.kind !== kind || s.bars < bars) continue;
    for (let from = Math.max(2, s.startBar); from + bars <= Math.min(track.bars, s.startBar + s.bars); from++) out.push({ from, bars });
  }
  return out;
}

export function trimWindow(track: LoudnessTrack, style: Style = track.style!): { from: number; bars: number } {
  return chosenWindow(track, style).w;
}

/**
 * **The window the trim is fitted for, and what the fit reads in it, worked out
 * once.** A plan asks for its trim and its headroom at the same window, and
 * both used to find that window afresh — every eight-bar window of every main
 * read by the whole fit, twice a plan — and each window walked every event of
 * the theme to find the few hundred inside it: seed 1's first theme walked
 * 4508 events 266 times (the reconciled review of 09-24, R31). The events are
 * put in bars once (`indexEvents`), a window reads the bars it covers, and the
 * features of the window chosen are handed back beside it, so the trim and
 * the headroom read one vector. Nothing in the arithmetic moves: a window
 * reads the same events in the same order as the walk did, so every sum is
 * the same sum to the bit, and the digests hold every trim.
 */
function chosenWindow(track: LoudnessTrack, style: Style): { w: { from: number; bars: number }; f: LoudnessFeatures } {
  const bars = style.loudness.windowBars;
  if (style.settings.loudness.window !== 'loudest') {
    const w = loudnessWindow(track, bars);
    return { w, f: featuresAt(track, style, w, null) };
  }
  const index = indexEvents(track);
  let best: { w: { from: number; bars: number }; f: LoudnessFeatures } | null = null;
  let loudest = -Infinity;
  const phrased = [...(track.phrasing?.segments ?? []), ...(track.phrasing?.outs ?? []), ...(track.phrasing?.cooldowns ?? [])];
  const steady = (w: { from: number; bars: number }) => !phrased.some((x) => x.from < w.from + w.bars && x.to > w.from);
  for (const kind of WINDOW_KINDS) {
    const all = mainWindows(track, bars, kind), calm = all.filter(steady);
    for (const w of calm.length ? calm : all) {
      const f = featuresAt(track, style, w, index);
      const v = lufsAfter(f, style);
      if (v > loudest) { loudest = v; best = { w, f }; }
    }
    if (best) return walked(track, style, best, index, steady);
  }
  const w = loudnessWindow(track, bars);
  return walked(track, style, { w, f: featuresAt(track, style, w, index) }, index, steady);
}

/**
 * **The trim never past the room of any passage it plays** (round loudness-place, the window walk). The trim is fitted
 * at the loudest main (or drop), and a breakdown whose pads lift past that main ran into the ceiling: Drive - Comet
 * Tail's at −10.5 with the limiter 69 % of the time against mains at −13.2, Vibe - Undertow's 63 %, Ambient - Deep
 * Field's swells 45 %; over the grid's whole themes the breakdown stood 2-3 dB over its groove in five places of ten.
 * So the walk reads every window of the theme's drops and breakdowns too (and of every section of a theme with few
 * drums, whose swells may be anywhere), each by its own family's headroom at the theme's allowance, and the trim takes
 * the least room any of them leaves (`walkRoomDb`, read by `trimAt`). The level is still the loudest main's: the walk
 * bounds the trim, so a swell stays off the ceiling and the main lands under its aim only where a swell would not.
 * Every second bar, from bar 2 (the measurement's pre-roll), in sections at least a window long.
 */
const WALK_KINDS = ['main', 'drop', 'breakdown'] as const;
function walked(track: LoudnessTrack, style: Style, best: { w: { from: number; bars: number }; f: LoudnessFeatures }, index: EventIndex, steady: (w: { from: number; bars: number }) => boolean): { w: { from: number; bars: number }; f: LoudnessFeatures } {
  const M = style.settings.loudness;
  if (!M.allowance || !M.headroom) return best;
  const bars = style.loudness.windowBars;
  const all = (best.f.drumsShare ?? 1) < 0.5;
  // **A groove's breakdown is read by the house's share line** (round loudness-place): the drumless family's model was
  // fitted on drones and read the featured grooves' breakdowns 1-6 dB off (median 0 once shifted, p10 -5); the share line
  // reads them 0.4 dB short at the median (129 windows, rms 3.5), and the depth there is the theme's sum clip's, which
  // rounds any hit over its top wherever it falls. A theme with no clip planned (no lines) reads its family's.
  const grooveBreak = !all && best.f.clipOn ? (style as { catalogue?: { front?: { headroom?: FrontHeadroom } } }).catalogue?.front?.headroom ?? null : null;
  let least = Infinity;
  // **A drone is levelled by the whole of it** (round 2): its loudest window by the model is the one the model over-reads
  // most, since a drone's windows differ less than the model errs on them (the featured drones' chosen windows read up to
  // 6 dB over their render: Ambient - Event Horizon −11.2 against −17.1, Ambient - Nebula Breath −10.3 against −15.6, and
  // the trims cut Ambient - Mirage and Ambient - Event Horizon 2 dB past the aim whole). Over every window the walk reads
  // the model's power mean errs −1.4 to +0.6 dB on them; so a theme with few drums is aimed by that mean, the way the
  // world's figures are measured, integrated over the track (`trimAt`).
  let power = 0, counted = 0;
  if (all && loudnessFamily(best.f) === 'drumless') { power += 10 ** (lufsAfter(best.f, style) / 10); counted++; }
  for (const s of (track.arrangement && track.arrangement.sections) || []) {
    if (s.bars < bars || (!all && !(WALK_KINDS as readonly string[]).includes(s.kind))) continue;
    for (let from = Math.max(2, s.startBar); from + bars <= Math.min(track.bars, s.startBar + s.bars); from += 2) {
      const w = { from, bars };
      if (!steady(w) || from === best.w.from) continue;
      // (a drop in a form with mains is the groove at its fullest, read as its mains are: the drop family's model was
      // fitted on the drops of forms with no main, and read the house's drops 2.5-3.4 dB short of their room)
      const fw = featuresAt(track, style, w, index, false, s.kind === 'drop' && best.f.windowKind === 'main' ? 'main' : undefined);
      // (the hits are set down once for the theme, at its trim's window: every passage reads that one figure)
      fw.hitDb = best.f.hitDb;
      const room = grooveBreak && loudnessFamily(fw) === 'drumless' ? valueOf(grooveBreak.share, fw) - shareMarginOf(grooveBreak, fw) + M.headroom.marginDb : headroomOf(fw, style);
      if (room != null && room < least) least = room;
      if (all && loudnessFamily(fw) === 'drumless') { power += 10 ** (lufsAfter(fw, style) / 10); counted++; }
    }
  }
  if (Number.isFinite(least)) best.f.walkRoomDb = +least.toFixed(4);
  if (counted >= 4 && style.settings.loudness.density) best.f.walkLufs = +(10 * Math.log10(power / counted)).toFixed(4);
  return best;
}

/** A theme's layered events by the bar they fall in: their places in `track.events`, in order. */
interface EventIndex {
  bars: number[][];
  /** an onset no bar holds (not a number): the walk's test lets it into every window */
  anywhere: number[];
}

function indexEvents(track: LoudnessTrack): EventIndex {
  const bs = track.barSeconds;
  const n = Math.max(1, track.bars + 2);
  const bars: number[][] = Array.from({ length: n }, () => []);
  const anywhere: number[] = [];
  const evs = track.events;
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    if (!ev.layer) continue;
    const b = Math.floor(ev.t / bs);
    if (Number.isNaN(b)) { anywhere.push(i); continue; }
    bars[Math.max(0, Math.min(n - 1, b))].push(i);
  }
  return { bars, anywhere };
}

/**
 * The layered events a window may hold, in the events' own order: the bars it
 * covers and one either side, since a bar's edge in seconds and a bar number
 * worked out by division can disagree in the last bit. The walk's own test is
 * still applied to every one of them by the caller.
 */
function eventsNear(track: LoudnessTrack, index: EventIndex, from: number, bars: number): LoudnessEvent[] {
  const at: number[] = [...index.anywhere];
  const lo = Math.max(0, from - 1);
  const hi = Math.min(index.bars.length - 1, from + bars);
  for (let b = lo; b <= hi; b++) for (const i of index.bars[b]) at.push(i);
  let sorted = true;
  for (let i = 1; i < at.length && sorted; i++) if (at[i] < at[i - 1]) sorted = false;
  if (!sorted) at.sort((x, y) => x - y);
  const evs = track.events;
  return at.map((i) => evs[i]);
}

// **Which model reads a window** (round LOUD-1). The house's block is fitted
// on house mains, every one of them with a kick under it, and read anything
// else from outside what it was taught: the held drone (no kick) and the
// Dubstep place's drops (a form with no main) came back up to 3 LU off and on
// the clamps (round EQ-6 §3). A style may carry a model of its own for each,
// fitted on that family's own measured windows (`families` in the block,
// written by `tools/loudness-fit.ts --with`): a window with no kick in it is
// read by `drumless`, the drop a form with no main is levelled at by `drop`,
// and every other window by the house's. The slopes, the clamps and the margin
// are the block's for all three, so a decibel of trim is the same decibel
// whichever model asked for it.
//
// **The target is the block's unless the family names its own** (round LOUD-2,
// 10-04). Eugene's three records measured whole: the house at -14.95 LUFS, the
// ambient at -12.28, the Oct 2 dubstep at -10.56 -- and the refit dubstep at
// -13.51, which through the phone filter (`tools/mastering.py` `phone()`) loses
// 11 LU where the house loses 7, half its energy being sub: on a phone it
// became the quietest of the three (*"the previous one didn't clip ... sub was
// boomy and this is what I wanted to trim, but now the whole thing is just
// quieter"*). So `families.drop.targetLufs` is -11.5, by hand in the JSON. It
// is a level asked for and not a fit, and nothing else of the trim moves: the
// slopes, the clamps, the margin and the headroom gate stay the block's, so a
// hotter target is still capped by the limiter's share.
//
// **A place that names its own level** (round DNB-4): where the theme's place
// asks a target of its own (`DrumsEntry.targetLufs`, carried on the plan's
// `sound`), its windows are the `placed` family — read at the level the place's
// own windows measure at nought (`DrumsEntry.measuredLufs`, written off
// `tools/loudness-fit.ts --spell … --measure` and its `--fit --with`, which
// fits the family) and trimmed to the place's number. The place lifts its
// drums and its bass on the events and clips them on the buses, and the
// house's model, which never heard either, read those themes eight decibels
// thin. The model is the place's and not the style's block, so a place that
// measures itself moves no other theme's settings; a family the block does
// fit (`families.placed`) is read where the row names no measurement.
export function loudnessFamily(f: LoudnessFeatures): 'house' | 'drumless' | 'drop' | 'placed' {
  if ((f.share_kick ?? 1) === 0) return 'drumless';
  // (a place that measured its own windows is read by its measurement, its aim the place function's; round
  // loudness-place: the liquid place names no target of its own since it took the beat-led line)
  if (Number.isFinite(f.placeTargetLufs) || Number.isFinite(f.placeMeasuredLufs)) return 'placed';
  if (f.windowKind === 'drop') return 'drop';
  return 'house';
}

type LoudnessModel = { intercept: number; coef: Record<string, number>; centre: Record<string, number> };

// **The aim is the place function's** (round loudness-place, `targetOf`): one line in the drums' and the tempo's shares
// for every family, where it was five numbers in four places of the code (the block's −13, the drop's −11.5 by hand,
// the liquid place's −9). A place that names its own level keeps it (the bells, the bowls, the waves and the journey,
// by his ear, under the ambient aim: his to retire one by one); a style without aims (house-v1) its block's target.
function modelOf(f: LoudnessFeatures, style: Style): { model: LoudnessModel; headroom: (LoudnessModel & { shift?: Partial<ByPlace> }) | null; targetLufs: number; slopeUp?: number; slopeDown?: number; house?: boolean } {
  const M = style.settings.loudness;
  const fam = M.families && M.families[loudnessFamily(f)];
  const own = Number.isFinite(f.placeTargetLufs) ? f.placeTargetLufs : undefined;
  const target = own ?? (M.aims ? targetOf(f, style) : (fam?.targetLufs ?? M.targetLufs));
  if (Number.isFinite(f.placeMeasuredLufs))
    return { model: { intercept: f.placeMeasuredLufs, coef: {}, centre: {} }, headroom: null, targetLufs: target };
  if (fam) return { model: fam, headroom: fam.headroom ?? null, targetLufs: target, slopeUp: fam.slopeUp, slopeDown: fam.slopeDown };
  return { model: M, headroom: M.headroom && M.headroom.coef ? M.headroom : null, targetLufs: target, house: true };
}

/**
 * **What a decibel of trim gives back** for a window, the way `need` asks (a lift or a cut): its family's slopes, else
 * the block's. A house window's cut reads the house's own measured slope where the style holds one (`houseSlopeDown`,
 * round loudness-v24: 0.61 measured on the windows the app plays, where the block's 0.50 sent every cut a fifth past
 * its target); the front rule's loss (`lufsAfter`) and the other families keep the block's, as they were fitted.
 */
// **By band** (round loudness-place, `--slopes` on the fast windows apart): a lift's slope was measured where a lift ran
// into the limiter, and a beat-led window that never meets it gives back more of the decibel; the house's slopes slide
// to the beat-led ones with the reading (`slopeUpBeat`, `houseSlopeDownBeat`), where the block holds them.
export function trimSlope(f: LoudnessFeatures, style: Style, need: number): number {
  const M = style.settings.loudness, mo = modelOf(f, style);
  const b = f.beatLed ?? 0;
  const slide = (g: number | undefined, beat: number | undefined) => (g != null && beat != null ? g + (beat - g) * b : g);
  if (need >= 0) return (mo.slopeUp ?? (mo.house ? slide(M.slopeUp, M.slopeUpBeat) : undefined) ?? M.slopeUp) || 1;
  return (mo.slopeDown ?? (mo.house ? slide(M.houseSlopeDown, M.houseSlopeDownBeat) : undefined) ?? M.slopeDown) || 1;
}

/** The level a theme's trim aims its window at, in LUFS: its family's own target, else the block's. */
export function trimTargetLufs(track: LoudnessTrack, style: Style = track.style!): number {
  return modelOf(chosenWindow(track, style).f, style).targetLufs;
}

/** What the fit predicts for a features vector, in LUFS. */
function lufsOf(f: LoudnessFeatures, style: Style): number {
  const M = modelOf(f, style).model;
  let v = M.intercept;
  for (const k of Object.keys(M.coef)) {
    const col = LOUDNESS_COLUMNS[k];
    if (!col) continue;
    v += M.coef[k] * (col(f) - (M.centre[k] ?? 0));
  }
  return v;
}

/**
 * **What the fit predicts once the front rule has played** (`catalogue.front`, the front-level round). The fit reads a
 * note at the gain it was written at before the rule (`featuresAt`), since the model weighs a keys note's gain at a
 * fraction of a decibel a decibel and would leave a theme whose front went 9 dB down 1-2 LU under its target. What the
 * rule took out of the window (`frontLossDb`, in dB before the master) is then taken off through the master's slope
 * coming out of the limiter. A window the rule never touched reads exactly what it always read.
 */
function lufsAfter(f: LoudnessFeatures, style: Style): number {
  const v = lufsOf(f, style);
  if (!f.frontLossDb) return v;
  const mo = modelOf(f, style);
  return v - f.frontLossDb * (mo.slopeDown ?? style.settings.loudness.slopeDown ?? 1);
}

const valueOf = (m: LoudnessModel, f: LoudnessFeatures): number => {
  let v = m.intercept;
  for (const k of Object.keys(m.coef)) {
    const col = LOUDNESS_COLUMNS[k];
    if (col) v += m.coef[k] * (col(f) - (m.centre[k] ?? 0));
  }
  return v;
};

/** The headroom a features vector allows, in dB, or null for a model with none. */
function headroomOf(f: LoudnessFeatures, style: Style): number | null {
  const M = style.settings.loudness;
  if (!M.headroom) return null;
  // **Every house window reads the two lines, at its place's allowance** (round loudness-place). The lines were fitted
  // on the windows the front rule moved and the base model on 120 slow house mains of October, and the two together
  // read the fast grooves 1-6 dB short of the room they have (Drive - Static Charge 5.7 dB, Drive - Tailwind 4.4). So
  // the lines are refitted on every house window the app plays, the fast ones in, the share line's room read at each
  // window's own allowance (`allowanceOf`: the share of blocks its place lets reach the ceiling) and the depth line's
  // moved by the allowance's depth over the 8 dB it was fitted at; the trim may use the lower, as before.
  const L = frontHeadroomOf(f, style);
  if (L && M.allowance) {
    const A = allowanceOf(f, style);
    const share = valueOf(L.share, f) - shareMarginOf(L, f);
    // (round 2: where the theme's sum clip is planned at its top by place, the loudest block is the clip's, and the
    // depth the trim may take is the clip's shave: the saw-bed depth line without the clip, its most, and the hits set
    // down, `clipPlan`; the depth line fitted with the clip at the place's deepest no longer reads a clip set lower)
    const depth = f.clipOn && M.density?.clipTopDb ? f.clipDepthDb + clipMostOf(f, style) + (f.hitDb ?? 0)
      : valueOf(L.depth, f) + (A.deepest - M.headroom.deepestMax) - L.depth.marginDb;
    return Math.min(share, depth) + M.headroom.marginDb;
  }
  const H = modelOf(f, style).headroom;
  if (!H || !H.coef) return null;
  // ...read, like the loudness, off the notes as written before the front rule: what the rule took off the window's
  // peaks is that much less going into the limiter, so it is that much more trim the window can take. The peaks and
  // not the loudness (round saw-bed): a quieter bed under a kick takes less off the peak than off the loudness, and
  // crediting the loudness drove golden 38's kick into the limiter in 27 % of its blocks (`frontPeakDb`). The house's
  // windows only: the peak credit was fitted on them, and a family with a model of its own (the drop's) carries the
  // loss as it read it before in both fields (`featuresAt`), so its trims stand where they stood.
  // (a family's own model was fitted at the block's pair, 15 % and 8 dB; at another allowance it reads the measured
  // shift, `headroom.shift`, by the same line in the readings as the aim)
  const S = H.shift && M.allowance ? byPlace({ ambient: H.shift.ambient ?? 0, groove: H.shift.groove ?? 0, beat: H.shift.beat ?? 0 }, f.drumsShare ?? 1, f.beatLed ?? 0) : 0;
  const base = valueOf(H, f) + (f.frontPeakDb || 0) + S;
  // **A window the front rule moved reads the limiter its own way** (round saw-bed, the refit). The base model was
  // fitted on 120 windows of the house before the rule existed, and read the grid's moved mains 3 dB off either way
  // (rms, against its own 1.3 held out). It folds two limits into one number: the level 15 % of the 10 ms blocks
  // reach (the kick and the bed under it, the share a limiter pumps on) and the loudest block (the clap's hit, more
  // often than anything else's), which have little to do with each other. So `front` holds the two apart, each fitted
  // on the grid's moved mains rendered at nought, each with its own margin for its own error, and the trim may use
  // the lower. A window the rule never touched reads the base exactly as it did (golden 34), and one it touched by
  // less than `blendDb` is read on a line between the two, so a theme the rule fades into over the slow side's tempo
  // ramp crosses no cliff. Returned on the base's footing (its `marginDb` added back), so the trim takes it as before.
  const F = frontHeadroomOf(f, style);
  if (!F || !(f.frontLossDb > 0)) return base;
  const margin = style.settings.loudness.headroom!.marginDb;
  const front = Math.min(valueOf(F.share, f) - F.share.marginDb, valueOf(F.depth, f) - F.depth.marginDb) + margin;
  const w = Math.min(1, f.frontLossDb / F.blendDb);
  return w >= 1 ? front : base + w * (front - base);
}

/** The moved windows' headroom, where the style's front rule carries one (`catalogue.front.headroom`), for the house's windows only: a family with a model of its own reads its own. */
function frontHeadroomOf(f: LoudnessFeatures, style: Style): FrontHeadroom | null {
  if (loudnessFamily(f) !== 'house') return null;
  return (style as { catalogue?: { front?: { headroom?: FrontHeadroom } } }).catalogue?.front?.headroom ?? null;
}

/**
 * **The theme's sum clip** (round drum-clip, `catalogue.front.clip`; the engine's `master.sumClip`). The saw-bed refit
 * found the loudest block of most moved house mains to be the kick and the clap landing on one backbeat: the depth
 * line held 688 of 971 of them, and the trim could give their loudness back only by driving that hit 10-20 dB into
 * the limiter, which ducks the whole mix for a beat after it. A clip ahead of the limiter takes the top of that hit
 * off where it stands and moves nothing after it. Its rule, from the headroom reading and never a coin:
 *
 * - the trim the window wants: what its loudness asks, no more than the share line (the kick and the bed under it,
 *   which the clip never reaches) less its margin, the trim the share allows, so the clip takes no more than the trim
 *   played asks; and no more than `mostDb` past where the saw-bed's depth line (`depth`, fitted on the windows without
 *   a clip and kept as it was fitted) reads the hit reaching the 8 dB line: the clip's planned shave is at most
 *   `mostDb`;
 * - the clip's top on the 8 dB line at that trim (`overDb`: the depth line less the trim, over the limiter's ceiling at
 *   its input, at a trim of nought). A hit under it passes as it came; one over it is rounded to it.
 *
 * Planned on every house window the front rule moved (the windows the share and depth lines read), with or without a
 * shave in view: where the depth line reads the hit under the top, the clip is a wire unless the line misread it. A
 * window the rule never touched, and every family with a model of its own, plays as before.
 */
export interface FrontClip {
  /** the most dB past the saw-bed depth line's reading the clip is set to take off the loudest block */
  mostDb: number;
  /** ...on a beat-led window (round loudness-place: the density upstream, 4 → 6), sliding with the reading; absent, `mostDb` */
  mostDbBeat?: number;
  knee: number;
  curve: number;
  /** **the curve's ceiling over the top the plan reads** (round hat-crackle), in dB: the top stays where the plan sets it
   * and the trims read it; the curve's own asymptote stands this much over it, so a peak past the top is rounded and
   * never flattened. Absent, nought: the curve's ceiling is the top. */
  ceilingDb?: number;
  /** the saw-bed's depth line, as fitted without the clip: the room the loudest block leaves, in dB of trim */
  depth: LoudnessModel;
}

function frontClipOf(style: Style): FrontClip | null {
  return (style as { catalogue?: { front?: { clip?: FrontClip } } }).catalogue?.front?.clip ?? null;
}

/** The clip's most past the depth line, by band (`FrontClip.mostDb`, `mostDbBeat`). */
function clipMostOf(f: LoudnessFeatures, style: Style): number {
  const C = frontClipOf(style);
  return C ? C.mostDb + ((C.mostDbBeat ?? C.mostDb) - C.mostDb) * (f.beatLed ?? 0) : 0;
}

/** The clip a features vector plans, or null: the trim its top is set for and the room the depth line read without it. */
// **On every house window** (round loudness-place, his word 10-30 taking the design's 3b): a hit is rounded on every
// deep groove, so one clap never holds a whole track quiet (Vibe - Night Side at −19 whole, its clap 8 dB over the
// ceiling), where the clip was planned only where the front rule moved the window. A style without aims keeps the rule.
// **The hit follows the body** (round loudness-place, round 2, his word 10-30: *"the clap … softer, still clearly a clap"*).
// Measured on the deep grooves the trim held under their aim (Vibe - Night Side, Vibe - Aurora, Vibe - Sunrise), the
// loudest hit is the kick, the clap on it at the backbeat: the kick alone lost 5.3-6.3 dB through the limiter at the
// trim, the clap alone 2-3, the bed nothing. Their trims were 4.4-5.2 dB where the grooves that land (Vibe - Pure Gold,
// Vibe - Deep Dive, Vibe - Saturn Rings) take 0-2: a trim that large says the body is thin under the hits, and lifts the
// hits with it. So where the trim the loudness and the share line ask passes `density.hit.fromDb`, the kick and the clap
// are set down on the plan by the excess (`hitDb`, at most `mostDb`): they stay where they were played as the body
// rises, the trim takes that room back (the clamp and the depth bound move by it), and the backbeat is still the clap.
// Sliding to nothing on the beat-led, whose drive is the clip's (`clipTopOf`). The bed, the bass and the hats keep
// their levels; the sub keeps his numbers.
function clipPlan(f: LoudnessFeatures, style: Style): { roomDb: number; depthDb: number; hitDb: number; boundDb: number } | null {
  const F = frontHeadroomOf(f, style), C = frontClipOf(style);
  const H = style.settings.loudness.headroom;
  if (!F || !C || !H || !(f.frontLossDb > 0 || style.settings.loudness.allowance)) return null;
  const mo = modelOf(f, style);
  const M = style.settings.loudness;
  const need = mo.targetLufs - lufsAfter(f, style);
  const s = trimSlope(f, style, need);
  const depthDb = valueOf(C.depth, f);
  const most = C.mostDb + ((C.mostDbBeat ?? C.mostDb) - C.mostDb) * (f.beatLed ?? 0);
  const share = valueOf(F.share, f) - shareMarginOf(F, f);
  const HIT = M.density?.hit;
  // (the trim the theme will be given with the hits at their most down: the loudness, the share, the depth and the clamp)
  const granted = HIT ? Math.min(need / s, share, depthDb + most + HIT.mostDb, clampUpOf(f, style) + HIT.mostDb) : 0;
  const hitDb = HIT && f.beatLed < 1 ? +Math.max(0, Math.min(HIT.mostDb, granted - HIT.fromDb) * (1 - (f.beatLed ?? 0)) * (f.drumsShare ?? 1)).toFixed(3) : 0;
  const want = Math.min(need / s, share, depthDb + most + hitDb);
  return { roomDb: Math.max(-M.clampDb, Math.min(clampUpOf(f, style) + hitDb, want)), depthDb, hitDb, boundDb: depthDb + most + hitDb };
}

/**
 * **The clip's top by place** (round 2), in dB over the limiter's ceiling at the trim the theme plays: 8 with no
 * density (where round drum-clip set it), 2 at the full (the beat-led), sliding with the density's amount (the deep
 * groove about 4, the slow end about 4.7). Measured on Drive - Static Charge and Drive - Tailwind: their harmonic beds are
 * struck (a Rhodes in the pad's role, an organ stab) and stood 10 dB over the ceiling at the trim, the kick 5.5; the kick
 * and the sub set 4-6 dB lower bought 0.3 LU, the music 4 dB up 0.5, a clip's top at 2 dB 3.3 LU at the same limiter
 * share. A clip has no memory; a limiter pulls the whole mix down for a beat after each hit. Absent the block, the
 * place's deepest allowance as before.
 */
function clipTopOf(f: LoudnessFeatures, style: Style): number {
  const T = style.settings.loudness.density?.clipTopDb;
  if (!T) return allowanceOf(f, style).deepest;
  return +(T.none + (T.full - T.none) * (f.densityAmount ?? 0)).toFixed(3);
}

/** The engine's `master.sumClip` (round drum-clip). */
export interface SumClip { overDb: number; knee: number; curve: number }

/** The sum clip a window's features plan, or null where they plan none. */
function sumClipAt(f: LoudnessFeatures, C: FrontClip, style: Style): SumClip | null {
  if (!f.clipOn) return null;
  // (its top on the place's own depth line: 8 dB over on a groove, 10 on a beat-led one, round loudness-place; the
  // curve's ceiling `ceilingDb` over it, round hat-crackle)
  return { overDb: +(clipTopOf(f, style) - f.clipRoomDb + (C.ceilingDb ?? 0)).toFixed(3), knee: C.knee, curve: C.curve };
}

/** The engine's `master.sumClip` a theme's plan asks for (round drum-clip), or null where it plans none. */
export function sumClipOf(track: LoudnessTrack, style: Style = track.style!): SumClip | null {
  const C = frontClipOf(style);
  return C ? sumClipAt(chosenWindow(track, style).f, C, style) : null;
}

/**
 * **The share line's margin by band** (round loudness-place): the margin is the line's own error, and it is a decision
 * where it is spent. A beat-led window's allowance (25 %) is already the generous side and its never-happen line (35 %)
 * stands ten points over it, so the margin there slides to `marginBeatDb`; the deep groove's stays.
 */
const shareMarginOf = (F: FrontHeadroom, f: LoudnessFeatures): number =>
  F.share.marginDb + ((F.share.marginBeatDb ?? F.share.marginDb) - F.share.marginDb) * (f.beatLed ?? 0);

/** The moved windows' headroom (`headroomOf`): the share's and the depth's models, each with the margin it carries. */
export interface FrontHeadroom {
  blendDb: number;
  share: LoudnessModel & { marginDb: number; marginBeatDb?: number };
  depth: LoudnessModel & { marginDb: number };
}

/** Which of the headroom's limits holds a window's trim, where one does: `share` (the kick and the bed), `depth` (the loudest block), or `base` (a window the rule never moved, or the blend). */
export function headroomLimit(track: LoudnessTrack, style: Style = track.style!): 'share' | 'depth' | 'base' | null {
  const f = loudnessFeatures(track, style);
  const H = style.settings.loudness.headroom ? modelOf(f, style).headroom : null;
  if (!H || !H.coef) return null;
  const F = frontHeadroomOf(f, style);
  if (!F || !(f.frontLossDb >= F.blendDb || style.settings.loudness.allowance)) return 'base';
  const deeper = style.settings.loudness.allowance ? allowanceOf(f, style).deepest - style.settings.loudness.headroom!.deepestMax : 0;
  // (round 2: a window whose clip is set at its top by place reads its depth as the clip's shave, as `headroomOf` does)
  const depth = f.clipOn && style.settings.loudness.density?.clipTopDb ? f.clipDepthDb + clipMostOf(f, style) + (f.hitDb ?? 0) : valueOf(F.depth, f) + deeper - F.depth.marginDb;
  return valueOf(F.share, f) - shareMarginOf(F, f) <= depth ? 'share' : 'depth';
}

// **How far a theme may be trimmed before its limiter pumps**, in dB, or null
// for a style whose model has no `headroom` block (house-v1).
//
// Levelling by loudness is not enough on its own, and seed 20 is why: at
// nought, bars 25-33 of its first main measure -14.3 LUFS, under the target,
// and the limiter already works in 13 % of their blocks and 8 dB deep, because
// glass stabs and a swell pad in a room that sets the keys and the pad five
// decibels hotter than the other make a passage whose peaks stand far above
// its loudness. Every decibel the loudness asks for on top of that is a
// decibel more of limiter.
//
// A trim moves every peak ahead of the limiter by itself, decibel for decibel,
// so what the limiter will do at a given trim is a fact about the theme at
// nought — its block peaks against the ceiling — and the headroom is the most
// trim those allow: the level `activeMax` per cent of the 10 ms blocks reach
// kept under the ceiling, and the loudest block within `deepestMax` of it,
// whichever binds first. It is fitted off the same columns as the loudness, on
// the same renders of the same window (`tools/loudness-fit.ts`), and read here
// at the window the trim is fitted for. `marginDb` comes off it for the model's
// own error, since a peak is harder to predict from a plan than a loudness is.
export function headroomDb(track: LoudnessTrack, style: Style = track.style!): number | null {
  const H = style.settings.loudness.headroom;
  if (!H || !H.coef) return null;
  return headroomOf(loudnessFeatures(track, style), style);
}

/** The headroom at a window of the theme (the window walk's reading, `walked`), in dB on the trim's footing, or null. */
export function headroomAt(track: LoudnessTrack, style: Style, window: { from: number; bars: number }): number | null {
  const kind = (track.arrangement?.sections ?? []).find((s) => s.startBar <= window.from && window.from < s.startBar + s.bars)?.kind;
  const main = (track.arrangement?.sections ?? []).some((s) => s.kind === 'main');
  return headroomOf(featuresAt(track, style, window, null, false, kind === 'drop' && main ? 'main' : undefined), style);
}

// The layers the fit takes a share of: **the lanes the style's own section
// grammar gates**, in the lane table's order. A layer is a *role* and never an
// instrument — that is the whole argument this file is built on — so what the
// table supplies here is the vocabulary and not a coefficient, and a style with
// two lanes has two shares rather than eight zeroes.
//
// It was `ARRANGEMENT_LAYERS` — the `plays` field of every registered voice, in
// the registry's order — until round K6 gave a style its own lane table, and for
// deep house the eight words are the same eight in the same order, which is why
// the coefficients did not move. What changed is which table says so: how many
// parts a piece of music has is a property of the music.
//
// **Once per gate, however many lanes share it.** The share is of the bars a
// gate is switched on in, and a gate two lanes stand behind — the twelve-lane
// fixture's three sixteenth lanes, a layered clap and snare — is one gate and
// one share; read off the lane rows as they stand it was counted once and
// divided by the window once per lane that named it, so a shared gate that was
// on in every bar read 1/8 or 1/64, and a second drone lane put house-v2's
// `share_pad` at an eighth and the prediction 1.36 LU out (the outside review, 09-19). Both
// shipped strategies name every gate once, which is why neither digest moves.
const layersOf = (style: Style): string[] => [...new Set(style.lanes.filter((l) => l.gate).map((l) => l.gate!))];
const HARMONIC = [['keys', 'stabTimbre'], ['pad', 'padTimbre']] as const;

const maskDensity = (m: unknown): number => {
  if (typeof m !== 'string' || !m.length) return 0;
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] !== '.') n++;
  return n / m.length;
};

/** The level a part with no notes reads, in dB: finite, so a features vector never holds an infinity. */
const SILENT_DB = -120;

// Add loudnesses the way loudnesses add: in power, not in decibels.
const sumDb = (parts: number[]): number => {
  let p = 0;
  for (const db of parts) p += Math.pow(10, db / 10);
  return p > 0 ? 10 * Math.log10(p) : -120;
};

// Everything the fit is allowed to read, all of it on the plan. The tool that
// measured the record imports this, so what was fitted and what is evaluated
// are the same arithmetic and cannot drift apart.
/**
 * @param style the music it was planned as: its base table is what the room's
 *   own overrides are read against — the base one, which is what the fit was
 *   measured on — and its `loudness.windowBars` is the window's length
 * @param window the bars to read; by default the ones the trim is fitted for
 *   (`trimWindow`), and a measured row passes the bars it was rendered at
 */
export function loudnessFeatures(track: LoudnessTrack, style: Style = track.style!, window?: { from: number; bars: number }): LoudnessFeatures {
  return window ? featuresAt(track, style, window, null) : chosenWindow(track, style).f;
}

/**
 * **The bed as the arrangement reads it** (`generator.ts`, the floors and the bell keyed to the bed, rounds EQ-5 and
 * EQ-6): the harmonic layer's energy off the registry's facts and the timbre's own voice, as those steps were tuned on.
 * The loudness model's own readings (round loudness-v24: the piano and the saw as house-v2 plays them, the seasoning
 * keyed by the voice the lane sounds with) are the trim's; the arrangement keeps the bed it was tuned to, so a refit of
 * the trim moves no note's level.
 */
export function bedEnergyDb(track: LoudnessTrack, style: Style, window: { from: number; bars: number }): number {
  return featuresAt(track, style, window, null, true).harmonicEnergyDb;
}

/** The theme's beat reading off its plan (`beat-reading.ts`), once per plan: every window of a theme reads the same. */
const beats = new WeakMap<object, BeatLed>();
export function beatOfTrack(track: LoudnessTrack): BeatLed {
  let b = beats.get(track);
  if (!b) { b = beatOf(track, track.events, track.bpm); beats.set(track, b); }
  return b;
}

/**
 * **A number by the kind of place** (round loudness-place): three anchors — the ambient (no drums), the deep groove
 * (drums, under 112 BPM felt) and the beat-led (drums at 128 and over) — and a straight line in the two readings
 * between them, `ambient + (groove − ambient)·d + (beat − groove)·b`. Nothing names a genre or a place: a new place
 * gets its numbers from what it plays.
 */
export type ByPlace = { ambient: number; groove: number; beat: number };
export const byPlace = (x: ByPlace, d: number, b: number): number => x.ambient + (x.groove - x.ambient) * d + (x.beat - x.groove) * b;

/**
 * **The aim**, in LUFS: the level the trim lands a theme's loudest passage at (round loudness-place, his word 10-30:
 * *"for drive playlist … more loud, more compressed … for deep house and ambient … the dynamic of the track is more
 * important"*). Ambient −16, the deep groove −13 (where the house has lived), the beat-led −10.5, sliding between: dub
 * techno at 125 BPM lands about −11. A style with no aims (house-v1) keeps its one target.
 */
export function targetOf(f: Pick<LoudnessFeatures, 'drumsShare' | 'beatLed'>, style: Style): number {
  const M = style.settings.loudness;
  return M.aims ? +byPlace(M.aims, f.drumsShare ?? 1, f.beatLed ?? 0).toFixed(3) : M.targetLufs;
}

/**
 * **How much the ceiling may work**, by the kind of place (round loudness-place): the share of 10 ms blocks the
 * headroom reading lets reach the limiter (ambient 5 %, the deep groove 15 %, the beat-led 25 %) and the deepest block
 * over it (3 dB on an ambient swell, 8 on a groove, 10 on a beat-led one). An allowance the trim may *use*, never a
 * level to *reach*. A style with none reads its headroom block's one pair.
 */
export function allowanceOf(f: Pick<LoudnessFeatures, 'drumsShare' | 'beatLed'>, style: Style): { share: number; deepest: number } {
  const M = style.settings.loudness, A = M.allowance;
  if (!A) return { share: M.headroom?.activeMax ?? 15, deepest: M.headroom?.deepestMax ?? 8 };
  return { share: +byPlace(A.share, f.drumsShare ?? 1, f.beatLed ?? 0).toFixed(3), deepest: +byPlace(A.deepest, f.drumsShare ?? 1, f.beatLed ?? 0).toFixed(3) };
}

/** The features of one window, reading the events near it through `index`, or all of them without one. */
function featuresAt(track: LoudnessTrack, style: Style, w: { from: number; bars: number }, index: EventIndex | null, asTuned = false, asKind?: string): LoudnessFeatures {
  const BASE = style.settings;
  const rows = track.timeline.slice(w.from, w.from + w.bars);
  const k = rows.length || 1;
  const LAYERS = layersOf(style);
  const share: Record<string, number> = {};
  for (const n of LAYERS) share[n] = 0;
  let layers = 0;
  for (const r of rows) {
    layers += r.layers.length;
    for (const n of r.layers) if (n in share) share[n]++;
  }
  for (const n of LAYERS) share[n] /= k;

  // What is actually written in those bars, as the plan wrote it: how often
  // each layer fires, how hard, and how much of it is going to the sends. All
  // of it is on `ev.p` before a node exists, and all of it is a property of a
  // *layer* — a role — and never of the instrument filling it.
  const bs = track.barSeconds;
  const t0 = w.from * bs;
  const t1 = (w.from + w.bars) * bs;
  //
  // Two more since 09-22, both off the same notes: the gain each one is written
  // at, and how much of the window it is sounding for at that gain and velocity
  // (`energy`, in note-seconds of full level per second of window). A pad the
  // arrangement sets nine decibels under a piano and a pad at its room's level
  // are one gate and one timbre, and only the notes say which one is playing.
  const EV: Record<string, { n: number; vel: number; wet: number; delay: number; gainDb: number; energy: number }> = {};
  // ...and each voice's energy there, for the seasoning as the window hears it (`knobHeardDb`)
  const byVoice: Record<string, number> = {};
  // ...and by harmonic lane, which voice sounds there (`harmonicVoices`)
  const laneVoice: Record<string, Record<string, number>> = {};
  // ...and what the front rule kept of the keys' and the pad's energy there (`lufsAfter`)
  const was: Record<string, number> = { keys: 0, pad: 0 }, now: Record<string, number> = { keys: 0, pad: 0 };
  // ...and the same without the band bell, which a family with a model of its own does not read (below)
  const stepped: Record<string, number> = { keys: 0, pad: 0 };
  // ...and of their amplitude, which is what a peak is made of (`headroomOf`)
  const nowAmp: Record<string, number> = { keys: 0, pad: 0 };
  for (const ev of index ? eventsNear(track, index, w.from, w.bars) : track.events) {
    if (ev.t < t0 || ev.t >= t1) continue;
    const l = ev.layer;
    if (!l) continue;
    const a = EV[l] || (EV[l] = { n: 0, vel: 0, wet: 0, delay: 0, gainDb: 0, energy: 0 });
    a.n++;
    a.vel += ev.p?.vel ?? 1;
    a.wet += (ev.p?.reverb ?? 0) + (ev.p?.hall ?? 0);
    a.delay += ev.p?.delay ?? 0;
    // the gain the note was written at, before the front rule took its `frontDb` off (`lufsAfter`)
    const g = (ev.p?.gain ?? 1) / 10 ** ((ev.frontDb ?? 0) / 20);
    a.gainDb += 20 * Math.log10(Math.max(1e-4, g));
    const x = (g * (ev.p?.vel ?? 1)) ** 2 * Math.min(ev.p?.dur ?? 0.25, t1 - ev.t);
    a.energy += x;
    if (ev.voice) {
      byVoice[ev.voice] = (byVoice[ev.voice] ?? 0) + x;
      // ...and the voice each harmonic lane sounds with (keys moments, which carry a role, are not the lane's own)
      if ((l === 'keys' && !ev.role) || l === 'pad') (laneVoice[l] ??= {})[ev.voice] = (laneVoice[l]?.[ev.voice] ?? 0) + x;
    }
    // ...and what it kept of them, the band bell's level beside the gain the rule took (`bandDb`)
    if ((l === 'keys' && !ev.role) || l === 'pad') { const kept = (ev.frontDb ?? 0) + (ev.bandDb ?? 0); was[l] += x; now[l] += x * 10 ** (kept / 10); stepped[l] += x * 10 ** ((ev.frontDb ?? 0) / 10); nowAmp[l] += x * 10 ** (kept / 20); }
  }
  const front = (style as { catalogue?: { front?: { makeup?: { keys: number; pad: number } } } }).catalogue?.front?.makeup;
  const lossOf = (n: Record<string, number>) => {
    const kept = (l: string) => (was[l] > 0 ? n[l] / was[l] : 1);
    const left = front ? 1 - front.keys * (1 - kept('keys')) - front.pad * (1 - kept('pad')) : 1;
    return left < 1 ? -10 * Math.log10(Math.max(0.05, left)) : 0;
  };
  const frontLossDb = lossOf(now);
  const rate = (l: string) => (EV[l] ? EV[l].n / k : 0);
  const mean = (l: string, f: 'vel' | 'wet' | 'delay' | 'gainDb') => (EV[l] && EV[l].n ? EV[l][f] / EV[l].n : 0);

  const d = track.dice || {};
  const over = track.paramOverrides || {};
  const beat = beatOfTrack(track);
  // The levels and the sidechain are read **by name** — `levelKeyOfRole` hands
  // one back, and a level key is whatever the style called it — so those two
  // merges are records of decibels. The kick's and the bass's are not: they are
  // the instruments' own blocks, nested in places, and only one number is taken
  // off each.
  const L: Record<string, number> = { ...BASE.levels, ...(over.levels || {}) };
  // The floors keyed to the bed (round EQ-6): a role a section plays under the
  // room's most is read at the window's own level, the mean of its bars' steps.
  const floors = track.automation?.floors;
  // ...and the steps themselves, apart from the room's own levels (round loudness-v24): the room's levels are a few
  // numbers a room is known by, and a fit reads them as which room it is; a step the keys take under the hats or the
  // body is a level, and read inside the room's number it read as the room
  const floorDb = { keys: 0, pad: 0, piano: 0 };
  if (floors && floors.length) {
    for (const key of ['keys', 'pad', 'piano'] as const) {
      let sum = 0;
      for (let b = w.from; b < w.from + w.bars; b++) {
        let at: (typeof floors)[number] | null = null;
        for (const st of floors) { if (st.t <= (b + 0.5) * bs) at = st; else break; }
        sum += at?.[key] ?? 0;
      }
      if (sum) L[key] += sum / Math.max(1, w.bars);
      floorDb[key] = sum / Math.max(1, w.bars);
    }
  }
  const SC: Record<string, number> = { ...BASE.sidechain, ...(over.sidechain || {}) };
  const KI = { ...BASE.kick, ...(over.kick || {}) };
  const BA = { ...BASE.bass, ...(over.bass || {}) };
  const H = over.hats || {};

  // What the harmonic layer is worth, from what the instruments holding it say
  // about themselves and the level the room gives that role. No name is read.
  const parts: number[] = [];
  // ...and the same roles again as the notes written for them: the level, the
  // instrument's own loudness and the seasoning as above, plus how much of the
  // window the role's notes actually fill at the gain and velocity they carry.
  const energyParts: number[] = [];
  // Which voices the harmonic sum above has already counted the seasoning of,
  // so the column below is the rest of the cast and never the same knob twice.
  const harmonicVoices = new Set<string>();
  let hold = 0, bright = 0, struck = 0, weight = 0, padStruck = 0;
  for (const [role, die] of HARMONIC) {
    const s = share[role];
    if (!s) continue;
    // The word the die rolled. A theme that rolled none reads `undefined`,
    // which is what the guard on the next line has always been for; naming it
    // a name is all the cast does.
    // A keys front the far-apart rule redrew is read as the timbre its figure was levelled for (`keysLevelledAs`).
    const timbre = (role === 'keys' && d.keysLevelledAs ? d.keysLevelledAs : d[die]) as string;
    // **The model's own reading of a voice where it holds one** (round loudness-v24): the registry's facts are the
    // voice's, read by the draw too; a voice the style plays otherwise than the registry measured it is read at the
    // loudness measured as this style plays it, and nothing else moves (`loudness.timbres`, written beside the
    // coefficients it was fitted with, where the fit took them).
    const own = asTuned ? undefined : BASE.loudness?.timbres?.[timbre];
    const t = own && TIMBRES[timbre] ? { ...TIMBRES[timbre], ...own } : TIMBRES[timbre];
    if (!t) continue;
    const level = L[levelKeyOfRole(role, timbre)] ?? -12;
    // The instrument's declared loudness **plus what the spell did to it**: the
    // fit has always summed `loudnessDb` over what is sounding, and a knob adds
    // its measured slope times how far it was moved. At the house the term is
    // nought because there are no settings to read.
    // **The voice the lane sounds with** (round loudness-v24): the seasoning is keyed by the voice the notes name, and
    // the timbre's guess at it (`voicePlaying`) is not always that voice (a marimba the generic keys voice plays, whose
    // knobs sit under `keys`): the window's notes say which, the loudest there; a lane silent in the window, the guess.
    const heard = asTuned || !laneVoice[role] ? undefined : Object.entries(laneVoice[role]).sort((a, b) => b[1] - a[1])[0]?.[0];
    const seasoned = heard ?? voicePlaying(role, timbre);
    harmonicVoices.add(seasoned);
    parts.push(level + t.loudnessDb + knobDbOf(track.knobs, seasoned) + 10 * Math.log10(s));
    const filled = EV[role] ? EV[role].energy / Math.max(1e-9, t1 - t0) : 0;
    if (filled > 0) energyParts.push(level + t.loudnessDb + knobDbOf(track.knobs, seasoned) + 10 * Math.log10(filled));
    hold += s * t.hold;
    bright += s * Math.log2(t.brightnessHz);
    struck += s * (t.struck ? 1 : 0);
    if (role === 'pad' && t.struck) padStruck = s;
    weight += s;
  }
  let knobsElsewhere = 0;
  for (const voice of Object.keys(track.knobs || {})) {
    if (!harmonicVoices.has(voice)) knobsElsewhere += knobDbOf(track.knobs, voice);
  }
  // **The seasoning as the window hears it** (round loudness-v24). `knobDb` adds every seasoned voice's worth in
  // decibels, sounding in the window or not, so a spell that seasons the kick, the sub, the bed and the keys at once
  // reads 14 dB and the fit's line through it reads the mix 2.5 LU over what it measures (Vibe - Deep Dive's second
  // theme, Vibe - Drizzle's first). Loudnesses add in power: each voice's worth counts by its share of the window's
  // power, its notes' energy at its lane's level, and a voice silent there counts nothing. A voice whose seasoning the
  // harmonic sum already holds counts in the power and not again in the seasoning (it reads as unseasoned here): the
  // pad's hold at its most read twice was 2.9 LU on every window of a full Tide.
  let heardP = 0, heardW = 0;
  for (const [voice, e] of Object.entries(byVoice)) {
    const key = BY_NAME[voice]?.level as string | undefined;
    const w = e * 10 ** (((key && Number.isFinite(L[key]) ? L[key] : -12)) / 10);
    if (!(w > 0)) continue;
    heardW += w;
    heardP += w * 10 ** ((harmonicVoices.has(voice) ? 0 : knobDbOf(track.knobs, voice)) / 10);
  }
  const knobHeardDb = heardW > 0 ? 10 * Math.log10(heardP / heardW) : 0;
  // **What the front rule took off the peaks** (round saw-bed, his ear 10-16 on golden 38's second main: "still a bit
  // too loud"). The headroom guards the limiter, and a limiter works on peaks, not on loudness. A peak in a house main
  // is a kick hit with the bass, the bed and the keys sounding under it, so what a quieter bed takes off it is the
  // bed's share of that sum: each part's amplitude as the plan wrote it (its notes' energy over the window, its lane
  // on), less what the rule kept of the keys' and the pad's (`catalogue.front.peak`, offsets fitted on renders).
  // A part with no notes in the window reads `SILENT_DB` (-120, as `sumDb` does), a finite number a fit or a readout can
  // hold, and adds nothing to the sum below.
  const rateDb = (e: number, lane = 0) => (e > 0 ? Math.max(SILENT_DB, 10 * Math.log10(e / Math.max(1e-9, t1 - t0)) + lane) : SILENT_DB);
  const frontPeakParts = {
    kick: rateDb(EV.kick?.energy ?? 0),
    bass: rateDb(EV.bass?.energy ?? 0, L.sub ?? 0),
    pad: rateDb(was.pad, L.pad ?? 0),
    keys: rateDb(was.keys, L.keys ?? 0),
    keysKept: was.keys > 0 ? nowAmp.keys / was.keys : 1,
    padKept: was.pad > 0 ? nowAmp.pad / was.pad : 1,
  };
  const peakAt = (style as { catalogue?: { front?: { peak?: { keys: number; pad: number; bass: number } } } }).catalogue?.front?.peak;
  let frontPeakDb = frontLossDb;
  if (peakAt && frontLossDb) {
    const P = frontPeakParts;
    const amp = (db: number, offset = 0) => (db > SILENT_DB ? 10 ** ((db + offset) / 20) : 0);
    const a = { kick: amp(P.kick), bass: amp(P.bass, peakAt.bass), pad: amp(P.pad, peakAt.pad), keys: amp(P.keys, peakAt.keys) };
    const sum = a.kick + a.bass + a.pad + a.keys;
    const kept = sum > 0 ? 1 - (a.keys / sum) * (1 - P.keysKept) - (a.pad / sum) * (1 - P.padKept) : 1;
    frontPeakDb = kept < 1 ? -20 * Math.log10(Math.max(0.05, kept)) : 0;
  }

  const f: LoudnessFeatures = {
    density: track.density,
    bpm: track.bpm,
    themeBars: track.bars,
    scale: (track.key && (track.key.keyScale ?? track.key.scaleName)) || 'minor',
    voicingStyle: d.voicingStyle,
    loopBars: d.loopBars || 0,
    chords: (track.progression && track.progression.chords.length) || 0,
    layers: layers / k,
    bassMask: maskDensity(d.bassMask),
    stabMask: maskDensity(d.stabMask),
    hatMask: maskDensity(d.hatMask),
    // The room, as the numbers it declares and never as its name.
    lvSub: L.sub,
    lvKeys: L.keys,
    lvPad: L.pad,
    lvPiano: L.piano,
    floorKeysDb: floorDb.keys,
    floorPadDb: floorDb.pad,
    floorPianoDb: floorDb.piano,
    lvHat: L.hatClosed,
    lvShaker: L.shaker,
    lvClap: L.clap,
    sidechainDb: SC.depthDb,
    sidechainLowDb: SC.lowDepthDb ?? SC.depthDb,
    kickDrive: KI.drive,
    bassDrive: BA.drive,
    hatTrimDb: H.trimDb ?? 0,
    // The instruments, as the properties they declare and never as their names.
    harmonicDb: parts.length ? sumDb(parts) : -60,
    harmonicHold: weight ? hold / weight : 0,
    harmonicBright: weight ? bright / weight : 0,
    harmonicStruck: weight ? struck / weight : 0,
    padStruck,
    harmonicRoles: parts.length,
    harmonicEnergyDb: energyParts.length ? sumDb(energyParts) : -60,
    // Per layer: notes a bar, how hard they are hit, and how much of them is
    // going to the reverb and the delay.
    rateKeys: rate('keys'),
    ratePad: rate('pad'),
    rateBass: rate('bass'),
    rateKick: rate('kick'),
    rateHats: rate('hats'),
    rateShaker: rate('shaker'),
    rateFx: rate('fx'),
    velKeys: mean('keys', 'vel'),
    velPad: mean('pad', 'vel'),
    velBass: mean('bass', 'vel'),
    velHats: mean('hats', 'vel'),
    wetKeys: mean('keys', 'wet'),
    wetPad: mean('pad', 'wet'),
    delayKeys: mean('keys', 'delay'),
    delayPad: mean('pad', 'delay'),
    gainKeys: mean('keys', 'gainDb'),
    gainPad: mean('pad', 'gainDb'),
    gainBass: mean('bass', 'gainDb'),
    gainHats: mean('hats', 'gainDb'),
    // The seasoning of everything the harmonic sum does not hold — the kick and
    // the bottom — as one decibel figure. It is a **column with no coefficient
    // in either shipped model**: the fit is refitted in M2 and a number pushed
    // into the trim before the refit would be a coefficient nobody measured.
    // `LOUDNESS_COLUMNS`' own rule says it: adding a column here does not change
    // the record, only `loudness.coef` decides what is read.
    knobDb: knobsElsewhere,
    knobHeardDb,
    bellDb: bellOver(track, w),
    from: w.from,
    windowBars: w.bars,
    windowKind: asKind ?? ((track.arrangement && track.arrangement.sections) || []).find((s) => s.startBar <= w.from && w.from < s.startBar + s.bars)?.kind ?? '',
    placeTargetLufs: Number.isFinite(track.sound?.targetLufs) ? track.sound!.targetLufs! : NaN,
    placeMeasuredLufs: Number.isFinite(track.sound?.measuredLufs) ? track.sound!.measuredLufs! : NaN,
    placeLevelDb: Number.isFinite(track.sound?.levelDb) ? track.sound!.levelDb! : 0,
    frontLossDb,
    frontPeakDb,
    frontPeakKick: frontPeakParts.kick,
    frontPeakBass: frontPeakParts.bass,
    frontPeakPad: frontPeakParts.pad,
    frontPeakKeys: frontPeakParts.keys,
    frontKeysKept: frontPeakParts.keysKept,
    frontPadKept: frontPeakParts.padKept,
    padNowDb: rateDb(now.pad, L.pad ?? 0),
    keysNowDb: rateDb(now.keys, L.keys ?? 0),
    clapDb: rateDb(EV.clap?.energy ?? 0, L.clap ?? 0),
    clipOn: 0,
    clipRoomDb: 0,
    clipDepthDb: 0,
    drumsShare: beat.drums,
    tempoShare: beat.tempo,
    beatLed: beat.value,
    walkRoomDb: NaN,
    densityAmount: densityAmountOf(beat, style),
    hitDb: 0,
    walkLufs: NaN,
  };
  for (const n of LAYERS) f[`share_${n}`] = share[n];
  // **A family with a model of its own reads the rule as it did before this round** (round saw-bed): the band bell
  // and the peak credit were measured on the house's windows, and the drop's trims stand where they stood. Its bed's
  // bell sounds there as it does in the house; its level is not read.
  if (loudnessFamily(f) !== 'house') f.frontPeakDb = f.frontLossDb = lossOf(stepped);
  const clip = clipPlan(f, style);
  f.clipOn = clip ? 1 : 0;
  f.clipRoomDb = clip ? clip.roomDb : 0;
  f.clipDepthDb = clip ? clip.depthDb : 0;
  f.hitDb = clip ? clip.hitDb : 0;
  return f;
}

// **The bell over a window** (round EQ-5): the presence bell's gain on the
// harmonic bus, the mean over the window's bars at each bar's middle, off the
// plan's own curve where the bell moves section by section and off the room's
// one number where it does not. A number the plan declares, like a level.
function bellOver(track: LoudnessTrack, w: { from: number; bars: number }): number {
  const most = track.paramOverrides?.harmonicBell?.db ?? 0;
  const pts = track.automation?.bell;
  if (!most || !pts || pts.length < 2) return most;
  let sum = 0;
  for (let b = w.from; b < w.from + w.bars; b++) {
    const t = (b + 0.5) * track.barSeconds;
    let i = 0;
    while (i < pts.length && pts[i].t <= t) i++;
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i)];
    sum += i === 0 ? pts[0].value : i >= pts.length || c.t === a.t ? a.value : a.value + (c.value - a.value) * (t - a.t) / (c.t - a.t);
  }
  return sum / Math.max(1, w.bars);
}

// The columns a fit may draw on, by name. Every one is either a structural
// property of the plan, a number the room declares, or a sum over what the
// instruments declare — so the list does not grow when the catalogue does.
// Adding a column here does not change the record: only the table's `loudness.coef`
// decides what is read.
export const LOUDNESS_COLUMNS: Record<string, LoudnessColumn> = {
  densityMedium: (f) => (f.density === 'medium' ? 1 : 0),
  densityBusy: (f) => (f.density === 'busy' ? 1 : 0),
  layers: (f) => f.layers,
  bassMask: (f) => f.bassMask,
  stabMask: (f) => f.stabMask,
  hatMask: (f) => f.hatMask,
  bpm: (f) => f.bpm,
  themeBars: (f) => f.themeBars,
  loopBars: (f) => f.loopBars,
  chords: (f) => f.chords,
  voicingElevenths: (f) => (f.voicingStyle === 'elevenths' ? 1 : 0),
  minor: (f) => (f.scale === 'minor' ? 1 : 0),
  shareKick: (f) => f.share_kick,
  shareBass: (f) => f.share_bass,
  shareKeys: (f) => f.share_keys,
  sharePad: (f) => f.share_pad,
  shareOpen: (f) => f.share_hatOpen,
  shareSixteenths: (f) => f.share_sixteenths,
  shareClap: (f) => f.share_clap,
  lvSub: (f) => f.lvSub,
  lvKeys: (f) => f.lvKeys,
  // the room's own levels without the steps keyed to the bed, and the steps (round loudness-v24)
  lvKeysRoom: (f) => f.lvKeys - (f.floorKeysDb ?? 0),
  lvPadRoom: (f) => f.lvPad - (f.floorPadDb ?? 0),
  floorKeys: (f) => f.floorKeysDb ?? 0,
  floorPad: (f) => f.floorPadDb ?? 0,
  floorPiano: (f) => f.floorPianoDb ?? 0,
  lvPad: (f) => f.lvPad,
  lvHat: (f) => f.lvHat,
  lvShaker: (f) => f.lvShaker,
  lvClap: (f) => f.lvClap,
  sidechainDb: (f) => f.sidechainDb,
  sidechainLowDb: (f) => f.sidechainLowDb,
  kickDrive: (f) => f.kickDrive,
  bassDrive: (f) => f.bassDrive,
  hatTrimDb: (f) => f.hatTrimDb,
  harmonicDb: (f) => f.harmonicDb,
  harmonicHold: (f) => f.harmonicHold,
  harmonicBright: (f) => f.harmonicBright,
  harmonicStruck: (f) => f.harmonicStruck,
  harmonicRoles: (f) => f.harmonicRoles,
  harmonicEnergyDb: (f) => f.harmonicEnergyDb,
  knobDb: (f) => f.knobDb,
  knobHeard: (f) => f.knobHeardDb,
  bellDb: (f) => f.bellDb,
  rateKeys: (f) => f.rateKeys,
  ratePad: (f) => f.ratePad,
  rateBass: (f) => f.rateBass,
  // the kick's hits a bar (round loudness-v24): a one-drop or a minimal groove's window is quieter than its harmonic
  // layer says
  rateKick: (f) => f.rateKick,
  rateHats: (f) => f.rateHats,
  rateShaker: (f) => f.rateShaker,
  rateFx: (f) => f.rateFx,
  velKeys: (f) => f.velKeys,
  velPad: (f) => f.velPad,
  velBass: (f) => f.velBass,
  velHats: (f) => f.velHats,
  wetKeys: (f) => f.wetKeys,
  wetPad: (f) => f.wetPad,
  delayKeys: (f) => f.delayKeys,
  delayPad: (f) => f.delayPad,
  gainKeys: (f) => f.gainKeys,
  gainPad: (f) => f.gainPad,
  gainBass: (f) => f.gainBass,
  gainHats: (f) => f.gainHats,
  // What limits a window once the front rule has played (round saw-bed): the kick, the bed and the keys over it at the
  // level they play, and the clap, whose hit is a window's loudest block more often than anything else's. A part with
  // no notes reads `SILENT_DB` (-120) and a column reads it as forty decibels under the kick, which is silent enough for
  // a sum and not so far that a line through it is thrown.
  peakKick: (f) => f.frontPeakKick,
  peakBed: (f) => Math.max(f.frontPeakKick - 40, f.padNowDb),
  peakKeys: (f) => Math.max(f.frontPeakKick - 40, f.keysNowDb),
  peakClap: (f) => Math.max(f.frontPeakKick - 40, f.clapDb),
  bedOverKick: (f) => Math.max(-40, f.padNowDb - f.frontPeakKick),
  // The theme's sum clip (round drum-clip): the trim its top is set on the depth line for, and the room the loudest
  // block leaves with it, read as the larger of that and what the saw-bed's depth line read without it (a clip only
  // ever takes a peak down, so a window whose hit stands under its top keeps the room it had).
  // what kind of place (round loudness-place): the drums' share, the tempo's, and the handovers' product
  drums: (f) => f.drumsShare,
  tempoShare: (f) => f.tempoShare,
  beatLed: (f) => f.beatLed,
  // the density by place's amount (round 2, `densityAmountOf`): the drummed windows louder at nought by their share of it
  densityAmount: (f) => f.densityAmount ?? 0,
  // a struck voice in the pad's role (round 2): it decays under its long notes, and the timbre's loudness, measured on
  // short ones, reads it louder than it plays (Drive - Static Charge, Drive - Tailwind: a Rhodes bed, 2-4 LU over-read)
  padStruck: (f) => f.padStruck ?? 0,
  // ...on a beat-led groove, where the next hit comes before it has spoken (round 2: the model's reading)
  padStruckBeat: (f) => (f.padStruck ?? 0) * (f.beatLed ?? 0),
  clipRoom: (f) => f.clipRoomDb,
  clipHeld: (f) => Math.max(f.clipRoomDb, f.clipDepthDb),
  // How much of the harmonic layer is going to the room, share-weighted: a
  // theme whose chords are drowned reads quieter than one whose chords are dry
  // at the same level, and the wetness die is a plan fact.
  wetHarmonic: (f) => (f.share_keys * f.wetKeys + f.share_pad * f.wetPad) / Math.max(1e-9, f.share_keys + f.share_pad),
  // Notes a bar across the harmonic layer, whichever role is holding it.
  rateHarmonic: (f) => f.rateKeys + f.ratePad,
};

// What the record is predicted to measure, in LUFS, before anything is built.
export function predictedLufs(track: LoudnessTrack, style: Style = track.style!, window?: { from: number; bars: number }): number {
  return lufsAfter(loudnessFeatures(track, style, window), style);
}

// The theme's trim, in dB: how far the fit says it is from the target, divided
// by how much of a decibel survives the master, and clamped.
//
// That division is the one thing this could not be got right without measuring
// it twice. The trim sits in front of the shared master, and this record lives
// on its limiter — the reference eight bars spend forty-five per cent of their
// length more than a decibel down — so a decibel put in here does not come out
// the other side as a decibel. MEASURED over the same 120 themes rendered a
// second time with the trim in the graph: so many decibels out per decibel in,
// through the low shelf, the bells, the make-up, the limiter and the clipper.
//
// Two numbers and not one, because a limiter is one-sided. Driving a theme up
// into the ceiling gives back 0.667 of the decibel; pulling one back out of it
// gives back 0.766. A single slope in the middle over-trims everything quiet
// and under-trims everything loud, and it is what put one theme of a montage
// a decibel and a half under its neighbours. Within each direction it is a
// straight line through the origin — residual 0.065 and 0.099 LU — and the
// level of the theme adds nothing to it (0.019 dB of slope per LU going up,
// nothing coming down), so two numbers is the whole of it.
//
// Read off the base table and not off a room's, the way `hatEnergy` is, so
// planning a theme never depends on any other theme.
export function loudnessTrimDb(track: LoudnessTrack, style: Style = track.style!): number {
  // One window and one vector for both halves (R31): the prediction and the
  // headroom are read off the same features, found once.
  return fitted(style) ? trimAt(chosenWindow(track, style).f, style) : 0;
}

/**
 * **The trim and the sum clip off one read of the window** (the review of drum-clip): the plan asks for both at the
 * window its trim is fitted for, and `chosenWindow` walks every main window of the theme to find it, so the planner
 * reads it once and hands the one vector to both. The same features, so the same trim and the same clip as
 * `loudnessTrimDb` and `sumClipOf` give apart.
 */
export function loudnessPlanOf(track: LoudnessTrack, style: Style = track.style!): { trimDb: number; sumClip: SumClip | null; aimLufs: number | null; hitDb: number } {
  const C = frontClipOf(style), fit = fitted(style);
  if (!fit && !C) return { trimDb: 0, sumClip: null, aimLufs: null, hitDb: 0 };
  const { f } = chosenWindow(track, style);
  return { trimDb: fit ? trimAt(f, style) : 0, sumClip: C ? sumClipAt(f, C, style) : null, aimLufs: fit && style.settings.loudness.aims ? modelOf(f, style).targetLufs : null, hitDb: C && f.clipOn ? f.hitDb : 0 };
}

/**
 * **The density a theme's place asks** (round loudness-place, the design's sixth decision: *drive is made upstream, and
 * the limiter catches peaks*): the style's beat-led knobs (`loudness.density`) at the theme's beat-led strength `b`,
 * sliding to nothing at the deep groove and the ambient — the drums' and the kick's soft clip, a gentle glue on the
 * theme's sum after its trim, the limiter's release — as the theme's own master settings, beside the plan as its trim
 * is. A knob the place's own row already sets (the liquid place's glue, clips and release) is the place's. Null where
 * there is nothing to add.
 */
export function densityOf(track: LoudnessTrack & { paramOverrides?: { master?: Record<string, unknown> }; trimDb?: number }, style: Style = track.style!): Record<string, unknown> | null {
  const D = style.settings.loudness.density;
  if (!D) return null;
  // (round 2: at the place's amount, `densityAmountOf`; the beat-led strength where the block names none)
  const b = densityAmountOf(beatOfTrack(track), style);
  if (!(b > 0)) return null;
  const own = track.paramOverrides?.master ?? {};
  const out: Record<string, unknown> = {};
  const drive = +(D.drumClipDb * b).toFixed(3);
  if (own.drumClip == null && drive > 0) out.drumClip = { driveDb: drive, knee: D.knee, curve: D.curve };
  const ratio = +(1 + (D.glue.ratio - 1) * b).toFixed(3);
  // (its threshold moves with the theme's trim, so it works on the theme as the theme is at nought whatever the trim:
  // the engine's glue sits after the trim, and at a fixed threshold a beat-led theme lifted 5 dB gave half its lift
  // back to the glue, Drive - Static Charge 1.5 LU out of a 4.8 dB trim)
  // (`followsTrim`: the trim it follows, so a render at another trim can put the glue where the app plays it; the engine
  // reads no such field)
  if (own.busComp == null && ratio > 1) out.busComp = { ...D.glue, ratio, threshold: +(D.glue.threshold + (track.trimDb ?? 0)).toFixed(3), followsTrim: +(track.trimDb ?? 0).toFixed(3) };
  const base = style.settings.master.limiter.releaseMs;
  if ((own.limiter as { releaseMs?: number } | undefined)?.releaseMs == null && D.releaseMs < base) out.limiter = { releaseMs: +(base + (D.releaseMs - base) * b).toFixed(1) };
  return Object.keys(out).length ? out : null;
}

/**
 * **How much density a place takes** (round loudness-place, round 2, his word 10-30: *"technically deep house should be
 * on 60-70% toward full drive at 100%, downtempo more on line 50-60%"*): nought on the ambient, the deep groove's
 * amount at its tempo (`slow` at `slowBpm[0]` felt and under, `groove` at `slowBpm[1]` and over: the deep groove's
 * readings put the house's downtempo and its deep house at one anchor, drums full and the tempo's share nought, so
 * the felt tempo between them is what parts them), one on the beat-led, by the same line in the drums' share and the
 * beat-led reading as the aim. The beat-led reading itself where the block names no amount.
 */
export function densityAmountOf(beat: BeatLed, style: Style): number {
  const A = style.settings.loudness.density?.amount;
  if (!A) return beat.value;
  const [lo, hi] = A.slowBpm;
  const s = Math.max(0, Math.min(1, (beat.felt - lo) / (hi - lo)));
  return +Math.max(0, byPlace({ ambient: A.ambient, groove: A.slow + (A.groove - A.slow) * s, beat: A.beat }, beat.drums, beat.value)).toFixed(3);
}

/** A style whose loudness block holds a fitted model (a trim to read); one without trims every theme by nought. */
const fitted = (style: Style): boolean => {
  const M = style.settings.loudness;
  return !!(M && M.coef && Object.keys(M.coef).length);
};

/**
 * **The most a window is lifted**, in dB: the block's clamp, and up to `clampUpBeatDb` on a beat-led window whose
 * headroom reading bounds it (round loudness-place: the clamp is a tripwire for a model gone wrong, and a model taught
 * on the fast places is not wrong by 6 dB there). A window with no headroom reading keeps the one clamp.
 */
function clampUpOf(f: LoudnessFeatures, style: Style): number {
  const M = style.settings.loudness;
  if (M.clampUpBeatDb == null || modelOf(f, style).headroom == null && !frontHeadroomOf(f, style)) return M.clampDb;
  return M.clampDb + (M.clampUpBeatDb - M.clampDb) * (f.beatLed ?? 0);
}

/** The trim a window's features ask for (`loudnessTrimDb`). */
function trimAt(f: LoudnessFeatures, style: Style): number {
  const M = style.settings.loudness;
  const mo = modelOf(f, style);
  // (a theme with few drums by its walked mean, `walked`; every other by its loudest window)
  const need = mo.targetLufs - (loudnessFamily(f) === 'drumless' && Number.isFinite(f.walkLufs) ? f.walkLufs : lufsAfter(f, style));
  // Two slopes, because a limiter is a one-sided thing: driving a theme *into*
  // the ceiling gives back less of the decibel than pulling it back out of the
  // ceiling does, and one number in the middle over-trims everything quiet and
  // under-trims everything loud.
  const s = trimSlope(f, style, need);
  // ...and never past the headroom, where the style's model has one: no more
  // trim than the window it is fitted for can take before the limiter works
  // past what the model allows. A decibel of trim is a decibel of peak, so this is
  // in the trim's own units and is not divided by the slope.
  // **A place's own lean** (ambient-waves-4, the review of 10-19): where the place's row says how far a theme's windows
  // stand from the place's own at nought (`placeLevelDb`, the sea's `measuredDb`), the trim gives that back one for one.
  // It is not divided by the slope: the place's need is (its windows into the model's limiter), the lean is in measured
  // decibels about the place, and the sea's windows sit under the limiter (its deepest 2.4 dB, 0.15 % of blocks at the
  // place), so a decibel of trim there is a decibel out. Read through the slope, a measured +0.66 dB moved the trim by
  // 1.07 and the loud corners landed 0.6 dB under the place.
  const own = headroomOf(f, style);
  // ...and never past the least room the window walk found in the theme's drops, breakdowns and swells (`walked`)
  const room = own == null ? null : Number.isFinite(f.walkRoomDb) ? Math.min(own, f.walkRoomDb) : own;
  // **A drone's cut, off the ceiling and past it** (round loudness-place): the family's slope down (0.5) was read where
  // a cut came off the limiter, and a drone the place's aim cuts 6-9 dB is off the ceiling after its first decibels,
  // where a decibel of cut gives back a decibel (`slopeOff`: 1.0, measured on the featured drones the round cut, 0.98 to
  // 1.0 LU a dB whole where the limiter was idle; Ambient - Deep Field, its swells on the ceiling, 0.74). So a drumless
  // window's cut reads its slope down as far as its own room (the decibels the model reads it past its allowance, the
  // margin left to the bound), and `slopeOff` after; one with room to spare reads `slopeOff` from the start. Nought
  // where the block holds no `slopeOff`.
  let lean = (need / s) - (f.placeLevelDb ?? 0);
  if (need < 0 && M.slopeOff && loudnessFamily(f) === 'drumless' && room != null) {
    const past = Math.min(0, room);
    lean = need >= past * s ? need / s : past + (need - past * s) / M.slopeOff;
    lean -= f.placeLevelDb ?? 0;
  }
  const want = room == null ? lean : Math.min(lean, room - M.headroom!.marginDb);
  // A window with no kick in it (the held drone) is lifted no further than the
  // style's `clampUpNoKickDb`, where it names one (round LOUD-1): the style
  // says why.
  // (round 2: the hits set down leave the clamp that much further up, `clipPlan`: they stay where they were)
  const up = (f.share_kick ?? 1) > 0 || M.clampUpNoKickDb == null ? clampUpOf(f, style) + (f.hitDb ?? 0) : Math.min(M.clampDb, M.clampUpNoKickDb);
  // **A house window is cut 3 dB at most where the style says so** (`clampDownDb`, round loudness-v24): the model's
  // worst readings are over-readings of a window it has not heard the like of (a full Tide's seasoning, a minimal
  // groove), and a cut through the master's slope down (0.5) turns a 2.5 LU over-read into 5 dB of trim. A lift keeps
  // the whole clamp (6 dB): the headroom already bounds it. The other families keep the one clamp.
  // ...and a theme with no drums is cut as far as `clampDownAmbientDb` (round loudness-place): its aim is 3 dB under the
  // house's, and a drone the house's −13 left on the ceiling (Ambient - Deep Field's swells 45 % of the time at a trim
  // of −5.4) needs −9 to come off it; sliding back to the one clamp with the drums' share
  const down = loudnessFamily(f) === 'house' && M.clampDownDb != null ? Math.min(M.clampDb, M.clampDownDb)
    : loudnessFamily(f) === 'drumless' && M.clampDownAmbientDb != null ? M.clampDb + (M.clampDownAmbientDb - M.clampDb) * (1 - (f.drumsShare ?? 1)) : M.clampDb;
  const db = +Math.max(-down, Math.min(up, want)).toFixed(3);
  // `+ 0` and not a comment about it: a trim that rounds to a negative
  // thousandth of a decibel is **-0**, which is a real double, is not the same
  // double as 0, and which JSON writes as `0` — so a digest blessed from one
  // and checked against the other would disagree with a file that says exactly
  // what it disagrees with. `-0 + 0` is `0` and every other value is itself.
  // house-v1 never produced one; house-v2's fourth theme of master 92970 does,
  // which is what a widened catalogue landing a theme on the target looks like.
  return db + 0;
}

export default loudnessTrimDb;
