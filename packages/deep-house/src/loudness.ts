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

import { TIMBRES, VOICE_KNOBS, levelKeyOfRole, voicePlaying } from '@deep-house/engine/voices';
import type { Style } from '@deep-house/engine/style';

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
  layer?: string | null;
  p?: Record<string, number>;
}

/** A planned theme, as the whole model reads one. */
export interface LoudnessTrack extends WindowTrack {
  bpm: number;
  density: string;
  barSeconds: number;
  timeline: LoudnessRow[];
  events: LoudnessEvent[];
  dice?: LoudnessDice;
  paramOverrides?: LoudnessOverrides;
  key?: { scaleName?: string } | null;
  progression?: { chords: unknown[] } | null;
  /** the music it was planned as; the three entry points default to it */
  style?: Style;
  /**
   * **What the spell asked of each drawn voice's own ranges** — the seasoning,
   * by event name (PLAN-MODULATION M1). Absent at the house and under the
   * record; where it is there, each setting moves that voice's declared
   * loudness by its own **measured** slope, which is what `knobDbOf` below
   * reads. A brighter or a longer instrument is a louder one, and a trim that
   * did not know it would take the difference out of the whole theme.
   */
  knobs?: Record<string, Record<string, number>>;
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
// enough takes the first rule.
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
function mainWindows(track: LoudnessTrack, bars: number): { from: number; bars: number }[] {
  const out: { from: number; bars: number }[] = [];
  for (const s of (track.arrangement && track.arrangement.sections) || []) {
    if (s.kind !== 'main' || s.bars < bars) continue;
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
  for (const w of mainWindows(track, bars)) {
    const f = featuresAt(track, style, w, index);
    const v = lufsOf(f, style);
    if (v > loudest) { loudest = v; best = { w, f }; }
  }
  if (best) return best;
  const w = loudnessWindow(track, bars);
  return { w, f: featuresAt(track, style, w, index) };
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

/** What the fit predicts for a features vector, in LUFS. */
function lufsOf(f: LoudnessFeatures, style: Style): number {
  const M = style.settings.loudness;
  let v = M.intercept;
  for (const k of Object.keys(M.coef)) {
    const col = LOUDNESS_COLUMNS[k];
    if (!col) continue;
    v += M.coef[k] * (col(f) - (M.centre[k] ?? 0));
  }
  return v;
}

/** The headroom a features vector allows, in dB, or null for a model with none. */
function headroomOf(f: LoudnessFeatures, style: Style): number | null {
  const H = style.settings.loudness.headroom;
  if (!H || !H.coef) return null;
  let v = H.intercept;
  for (const k of Object.keys(H.coef)) {
    const col = LOUDNESS_COLUMNS[k];
    if (col) v += H.coef[k] * (col(f) - (H.centre[k] ?? 0));
  }
  return v;
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

/** The features of one window, reading the events near it through `index`, or all of them without one. */
function featuresAt(track: LoudnessTrack, style: Style, w: { from: number; bars: number }, index: EventIndex | null): LoudnessFeatures {
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
  for (const ev of index ? eventsNear(track, index, w.from, w.bars) : track.events) {
    if (ev.t < t0 || ev.t >= t1) continue;
    const l = ev.layer;
    if (!l) continue;
    const a = EV[l] || (EV[l] = { n: 0, vel: 0, wet: 0, delay: 0, gainDb: 0, energy: 0 });
    a.n++;
    a.vel += ev.p?.vel ?? 1;
    a.wet += (ev.p?.reverb ?? 0) + (ev.p?.hall ?? 0);
    a.delay += ev.p?.delay ?? 0;
    const g = ev.p?.gain ?? 1;
    a.gainDb += 20 * Math.log10(Math.max(1e-4, g));
    a.energy += (g * (ev.p?.vel ?? 1)) ** 2 * Math.min(ev.p?.dur ?? 0.25, t1 - ev.t);
  }
  const rate = (l: string) => (EV[l] ? EV[l].n / k : 0);
  const mean = (l: string, f: 'vel' | 'wet' | 'delay' | 'gainDb') => (EV[l] && EV[l].n ? EV[l][f] / EV[l].n : 0);

  const d = track.dice || {};
  const over = track.paramOverrides || {};
  // The levels and the sidechain are read **by name** — `levelKeyOfRole` hands
  // one back, and a level key is whatever the style called it — so those two
  // merges are records of decibels. The kick's and the bass's are not: they are
  // the instruments' own blocks, nested in places, and only one number is taken
  // off each.
  const L: Record<string, number> = { ...BASE.levels, ...(over.levels || {}) };
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
  let hold = 0, bright = 0, struck = 0, weight = 0;
  for (const [role, die] of HARMONIC) {
    const s = share[role];
    if (!s) continue;
    // The word the die rolled. A theme that rolled none reads `undefined`,
    // which is what the guard on the next line has always been for; naming it
    // a name is all the cast does.
    const timbre = d[die] as string;
    const t = TIMBRES[timbre];
    if (!t) continue;
    const level = L[levelKeyOfRole(role, timbre)] ?? -12;
    // The instrument's declared loudness **plus what the spell did to it**: the
    // fit has always summed `loudnessDb` over what is sounding, and a knob adds
    // its measured slope times how far it was moved. At the house the term is
    // nought because there are no settings to read.
    const seasoned = voicePlaying(role, timbre);
    harmonicVoices.add(seasoned);
    parts.push(level + t.loudnessDb + knobDbOf(track.knobs, seasoned) + 10 * Math.log10(s));
    const filled = EV[role] ? EV[role].energy / Math.max(1e-9, t1 - t0) : 0;
    if (filled > 0) energyParts.push(level + t.loudnessDb + knobDbOf(track.knobs, seasoned) + 10 * Math.log10(filled));
    hold += s * t.hold;
    bright += s * Math.log2(t.brightnessHz);
    struck += s * (t.struck ? 1 : 0);
    weight += s;
  }
  let knobsElsewhere = 0;
  for (const voice of Object.keys(track.knobs || {})) {
    if (!harmonicVoices.has(voice)) knobsElsewhere += knobDbOf(track.knobs, voice);
  }
  const f: LoudnessFeatures = {
    density: track.density,
    bpm: track.bpm,
    themeBars: track.bars,
    scale: (track.key && track.key.scaleName) || 'minor',
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
    harmonicRoles: parts.length,
    harmonicEnergyDb: energyParts.length ? sumDb(energyParts) : -60,
    // Per layer: notes a bar, how hard they are hit, and how much of them is
    // going to the reverb and the delay.
    rateKeys: rate('keys'),
    ratePad: rate('pad'),
    rateBass: rate('bass'),
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
    from: w.from,
    windowBars: w.bars,
  };
  for (const n of LAYERS) f[`share_${n}`] = share[n];
  return f;
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
  rateKeys: (f) => f.rateKeys,
  ratePad: (f) => f.ratePad,
  rateBass: (f) => f.rateBass,
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
  // How much of the harmonic layer is going to the room, share-weighted: a
  // theme whose chords are drowned reads quieter than one whose chords are dry
  // at the same level, and the wetness die is a plan fact.
  wetHarmonic: (f) => (f.share_keys * f.wetKeys + f.share_pad * f.wetPad) / Math.max(1e-9, f.share_keys + f.share_pad),
  // Notes a bar across the harmonic layer, whichever role is holding it.
  rateHarmonic: (f) => f.rateKeys + f.ratePad,
};

// What the record is predicted to measure, in LUFS, before anything is built.
export function predictedLufs(track: LoudnessTrack, style: Style = track.style!, window?: { from: number; bars: number }): number {
  return lufsOf(loudnessFeatures(track, style, window), style);
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
  const M = style.settings.loudness;
  if (!M || !M.coef || !Object.keys(M.coef).length) return 0;
  // One window and one vector for both halves (R31): the prediction and the
  // headroom are read off the same features, found once.
  const { f } = chosenWindow(track, style);
  const need = M.targetLufs - lufsOf(f, style);
  // Two slopes, because a limiter is a one-sided thing: driving a theme *into*
  // the ceiling gives back less of the decibel than pulling it back out of the
  // ceiling does, and one number in the middle over-trims everything quiet and
  // under-trims everything loud.
  const s = (need >= 0 ? M.slopeUp : M.slopeDown) || 1;
  // ...and never past the headroom, where the style's model has one: no more
  // trim than the window it is fitted for can take before the limiter works
  // past what the model allows. A decibel of trim is a decibel of peak, so this is
  // in the trim's own units and is not divided by the slope.
  const room = headroomOf(f, style);
  const want = room == null ? need / s : Math.min(need / s, room - M.headroom!.marginDb);
  const db = +Math.max(-M.clampDb, Math.min(M.clampDb, want)).toFixed(3);
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
