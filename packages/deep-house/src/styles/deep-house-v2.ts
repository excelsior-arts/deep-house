// House-v2 shares the original house's base tables by reference and owns the
// extensions that make it a different generator: catalogue, switches, palette,
// lane trims and fitted loudness, plus declarative components and characters.
//
// deep-house-parts.ts owns component families, compatibility, arrangement
// limits and authored bird responses. composition.ts draws them without
// musical policy branches; spell.ts evaluates their bird responses.
// deep-house-characters.ts owns articulation and spatial treatment settings.
// Recipes and ordinary rolls reach the same parts resolver and players.
//
// These extensions deliberately change ordinary v2 seeds. The v1 style and
// its plan/program locks remain unchanged. See notes/HANDOFF.md, *Composition
// contracts*, for preservation and calibration revision boundaries.

import {
  base, rooms as roomsV1, sections, lanes as lanesV1, stage as stageV1, set as setV1, figures, loudness, style as houseV1,
} from './deep-house.ts';
import { development } from './deep-house-development.ts';
import type { DevelopmentPolicy } from '../development.ts';
import {
  ROOMS, VOICING_STYLES, FX_PALETTES, DENSITY_LABEL, MASK_TABLES, SIXTEENTH_MASKS,
  leadTimbresV2, sustainedLeadsV2, padPartnersV2, stabPartnersV2,
  BACKBEAT_VOICES, OFFBEAT_VOICES, SIXTEENTH_VOICES, TEXTURE_VOICES,
  BREAK_MASKS, BREAKS_BACKBEAT_VOICES,
  TREATMENT_ROTA, FLAGGED, liveOf, candidateListsV2, layerTable,
} from '../catalogue-v2.ts';
import { REGISTRY as EFFECTS } from '@deep-house/engine/effects';
import layerSignatures from '@deep-house/engine/voices/signatures' with { type: 'json' };
import loudnessFit from './deep-house-v2-loudness.json' with { type: 'json' };
import laneTrims from './deep-house-v2-lane-trims.json' with { type: 'json' };
import { resolveSettings } from '@deep-house/engine/settings';
import type { Lane, Room, Style } from '@deep-house/engine/style';
import { MOTIF_RECIPES } from '../recipe.ts';
import type { LayerTable } from '../spell.ts';
import { controls, composition } from './deep-house-parts.ts';
import type { BirdResponse } from '../composition-policy.ts';
import { characters, keyboardPatches } from './deep-house-characters.ts';
import type { SoundCharacters } from '../parts/sound.ts';
import type { CompositionPolicy } from '../composition-policy.ts';

/**
 * A style with strategy-owned composition and selection data. The machine's `Style` is
 * the record; these are what a *strategy* adds to one and the engine states
 * nothing about them, so they are declared here rather than in the contract —
 * the same line `signatures` is on, drawn one file further out.
 */
export type StrategyStyle = Style & {
  development?: DevelopmentPolicy;
  switches: typeof switches;
  palette: typeof palette;
  flagged: typeof FLAGGED;
  layers: LayerTable;
  composition: Readonly<CompositionPolicy>;
  characters: SoundCharacters;
  controls: Record<string, BirdResponse>;
  /** round S6: each offbeat hat's measured ring, ms to -20 dB, read by `hatRing` */
  ringMs: Readonly<Record<string, number>>;
  /** round S14: each offbeat hat's measured centroid, read by `glueGates` */
  hatCentroid: Readonly<Record<string, number>>;
};

// --- the switches ------------------------------------------------------------
//
// The four reachability facts at the head of `deep-house.ts` are not faults and
// are not to be "fixed": each of them is a die that draws zero because the
// record short-circuits it, and making one reachable is a composition change.
// house-v2 is where they *become* switchable, K5a is where they were wired and
// left off, and **K5b is the composition change**: all four are on. Derive-lite
// adds a fifth of a different kind — `derived` opens a door the record does not
// have rather than a die it short-circuits — and it is on the same list because
// it is the same sentence: a composition decision a strategy carries, read by
// `switchOn`, false for a style that has none.
//
// They are flags that really reach the dice rather than fields nobody reads.
// `roomsUnder` below takes a room's own answer away when the switch that owns
// it is on, and the die the room was short-circuiting starts drawing. Three of
// the four work that way — a voicing, three masks and three sidechain numbers
// leave the rooms and the base table's own values and the mined tables reach a
// theme. The fourth has nothing to take off a room: `avoidOrgan` is handed to
// `generate` by `src/set-plan.ts`, which is the only place that knows what the
// *previous* theme was, so the rule is "not twice running" and not "never".

/**
 * house-v2's switches. **The first four are on since K5b**, which is the round
 * the golden opens, and the fifth since derive-lite; each of them carries the
 * one line that says what turning it on buys, and each of the first four was off
 * in K5a with the same wiring underneath.
 */
export const switches = Object.freeze({
  /** `dice('voicing')`: the chord stacking is drawn instead of being the room's
   * one answer — ON because a room that always stacks in elevenths is a room
   * with one harmony in it, and three voicings is the cheapest variety the
   * catalogue holds. */
  voicingDie: true,
  /** `dice('bass')`, `dice('stab')`, `dice('hat')`: the mined mask tables are
   * drawn instead of each room's one figure — ON because the masks are a
   * measurement of the reference sets that has never reached a theme, and two
   * fixed figures per room is half of what the cookbook review called three
   * ingredients. */
  maskDice: true,
  /** the base table's three sidechain numbers reach a theme instead of being
   * overridden by every room — ON because a duck that is the same depth, the
   * same floor and the same recovery in every theme of every room is a pump
   * nobody can hear as a decision. */
  sidechainPerRoom: true,
  /** `dice('timbre:again')`: a second organ theme running is refused — ON
   * because the organ is the record's rare colour, about one theme in ten, and
   * two of them back to back is the one place a set sounds like it is repeating
   * itself. */
  avoidOrgan: true,
  /**
   * **`derive()` reaches the composer** — derive-lite, 09-19, and the switch
   * that answers the one argument the three outside reviews agreed on: seven of
   * the eight birds moved the record by one sixteen-bit step because nothing
   * read the derived state at all — one review's hundred-seed probe of
   * `drumsOn`, `tempoFamily` and `kit` came back all zeros (`ROADMAP` 09-19).
   *
   * On, three things reach a plan and nothing else does:
   *
   *   **`drumsOn`** false gates every percussion lane of the style in the
   *   arrangement itself — the four roles a drum grid is made of, by role and
   *   never by name (`src/lanes.ts`, `percussionGates`).
   *   **`tempoFamily`** carries the room's own tempo into the band the pulse
   *   landed in, at the same position in it (`src/spell.ts`, `tempoInFamily`).
   *   **`kit`** at `breaks` puts the kick on an authored break's own steps and
   *   the snare on the backbeat lane (`catalogue.breakMasks`).
   *
   * **At the house all three are the identity** and that is arithmetic and not
   * a branch: `derive(HOUSE)` is drums on, the house band and a four-floor kit,
   * so the gate list is empty, the band is mapped onto itself and the kick
   * figure is the one it always was. Both of house-v2's digests are what check
   * it, and house-v1 carries no switches at all, so the record never asks.
   */
  derived: true,
  /**
   * **A bird seasons the voice it drew** — modulation M1, 09-19, and the second
   * half of the same argument `derived` answers. Until now a bird changed
   * *which* instrument played and nothing about *how* it sounded, so a spell
   * asking for a longer tail could only reach for a longer *instrument*, and
   * once the list was exhausted the sound could not follow the pull any
   * further. Fifty-two fixed flavours is more than nine and it is still a fixed
   * set, which is Eugene's own words on it (09-19): *otherwise we are back to
   * v1, using recipes to cook different dishes with a bit more but still a
   * limited set of ingredients with fixed flavours.*
   *
   * On, the spell reaches every declared range of every voice a theme drew,
   * through the one mapping in `src/spell.ts` — the house value to the knob's
   * measured default, 0 and 1 to the ends a gate proved clean — and the
   * settings are written onto the notes by the performance compiler, per theme,
   * at the boundary, exactly as a treatment's settings are.
   *
   * **At the house every knob is at its default and nothing is written at
   * all.** Not a table of defaults: an empty table, left off the plan, so the
   * object the record has always hashed is the object it hashes. Both of
   * house-v2's digests are what check it, and house-v1 carries no switches, so
   * the record never asks.
   */
  knobs: true,
  /**
   * **A track has a theme you could hum** — PLAN-MOTIF T1, 09-20, and Eugene's
   * own question of 09-19: *"most of our house tracks were two-chord
   * progressions with touch-up notes here and there… I'm not sure we ever
   * encoded that part."* We never did. The composer had harmony, figures and
   * timbre and no word for an **object** — a shape stated once, developed by a
   * grammar and brought back.
   *
   * On, a theme draws off `<seed>::motif`, a stream of its own: whether it has
   * a theme at all, which register states it (the lead or the bass, by a die),
   * and which family it is (`catalogue.motifFamilies`, the library's `motif`
   * rows). The concrete theme is rolled inside that family's box, and the lane
   * of that register plays it instead of its mined mask for as long as the
   * section grammar says — **stated in the groove, fragmented in the build,
   * whole in the drop, absent in the breakdown, echoed in the outro.**
   *
   * A lane's figure is data, so this is one more figure source beside the
   * masks and not a branch inside one: the theme's own draw says which lane
   * reads `motif` this time, and every other lane is untouched.
   *
   * **house-v1 carries no switches, so the record never asks**, and a theme
   * that draws no theme takes one number off a stream nothing else reads. What
   * moves is house-v2, deliberately, and the commit that turned it on says by
   * how much.
   */
  motif: true,
  /**
   * **A groove is never pad-alone for long** — `notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1, the first of
   * its five and the one it says to build first, and the generator-side answer
   * to the mids hole the music review measured.
   *
   * The harmonic roles are drawn **once per section**: `bothHarmonicChance` and
   * then, when only one plays, which one. A 48-bar groove that rolls pad-alone
   * is a hundred and ten seconds of one chord loop with nothing over it, and
   * that is not an edge case — it is where the record's 300 Hz-2 kHz share sits
   * at **-18.8 dB** against the three reference sets' -8.5 to -12
   * (the music adequacy review of 09-19, §4.3). Two harmonic layers run in 40 % of
   * tracks and a pluck always gets its pad; the **inverse** rule was missing.
   *
   * On, a section that has been pad-alone for `catalogue.leadEntryBars` opens
   * the figure role for the rest of itself: the pad keeps playing and the lead —
   * or, where the track has one, **the theme** — enters. It is one line and no
   * new die: the roll that was made is kept and a floor is put under it.
   *
   * house-v1 carries no switches and the record never asks.
   */
  leadEntry: true,
  /**
   * **A section's edges are the section's** — the reconciled review of 09-24,
   * R16 and R111. The kick dropout is laid on the global eight-bar line and a
   * section may begin four bars into one, so a dropout took a section's first
   * bar 31 times in 600 themes, a drop's downbeat 10 of them; and a drop that
   * runs straight into a breakdown wrote its drive's zero on the breakdown's
   * first bar and cut the mark in front of it.
   *
   * On, a dropout stops at the first bar of the next section, and a drop's
   * drive ends where the breakdown's hand-off begins. No die moves: the same
   * dropouts are drawn and only the bars past a section line keep their kick.
   * Where the phrases are counted from is `sectionPhrases`, below.
   *
   * house-v1 carries no switches and the record never asks.
   */
  sectionEdges: true,
  /**
   * **A phrase is counted from its section's first bar** — R16 and R38 of the
   * reconciled review of 09-24, Eugene's answer to question 4. Sections start
   * on a four-bar line and every phrase device counted the set's eight: only
   * a fifth of the fills landed on a section's last bar, a dropout could open
   * a drop, and a seam could land in the build or the drop of a theme too
   * short for an outro.
   *
   * On, a theme with a grid counts its phrases from each section's start — the
   * fill on a phrase's last bar, a dropout at a phrase's end and never across
   * a section line, the bass and stab variations, the arpeggio's opening bar
   * and contour, the melody's answering half, and the stage's per-phrase
   * moves (`phraseGrid`, `src/arrangement.ts`) — and its seam keeps out of the
   * build and the drop: a short theme ends on an eight-bar outro, and a seam
   * inside a breakdown stays inside it. A span that sits on the set's line
   * keys its streams as it always did, so a theme whose sections all start on
   * it moves nothing. A theme with no drums has no grid to count on and keeps
   * the set's line, the ambient benchmark among them.
   *
   * house-v1 carries no switches and the record never asks.
   */
  sectionPhrases: true,
  /**
   * **The lead-ins are scheduled by rules and not by a coin** — R34 of the
   * reconciled review of 09-24, Eugene's answer to question 11. The record
   * rolls the riser at a breakdown's end at `riserChance` and spends one glue
   * spacing on the breakdown's opening sweep, so it rose once in 272
   * breakdowns. On, a return that brings the kick back is led in by what it
   * returns to: a full return rises, a partial one opens the filter only, a
   * drone in front never takes the noise, the lead-ins alternate, the length
   * follows the tempo, and a section's two moments do not spend each other's
   * spacing (the rules are written at `leadIns` in `src/generator.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  leadIns: true,
  /**
   * **A held layer that enters a quiet passage swells in** — round S1 of the
   * composer, Eugene's ask of 09-25 on the benchmark (*"the pad kicks in hard
   * at 16:00 ... too coarse"*). On, a sustained layer entering after a phrase
   * without it rises to its written level over a span the spell, the cast and
   * the section decide — eight bars on the slow side, two on a steady four, a
   * step at a drop, under a driving or broken beat, and where the drawn voice's
   * own attack already swells — with its tone opening as it rises. No note
   * moves and no die is drawn (the rules are written at the head of
   * `src/swell.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  swellIn: true,
  /**
   * **The melodic bus's filter, moved by the section** — round S2 of the
   * composer, Eugene's ask of 09-25 for high-pass and low-pass sweeps as a
   * track insert. On, the kitchen filter's core (its biquad and resonance,
   * without its drive, which changes the level of what it sweeps) sits on the
   * melodic bus as a high-pass and a low-pass stage, engaged only while a move
   * runs: a high-pass opening down into a section, a low-pass closing into a
   * breakdown, a slow low-pass breathing under a long passage with no kick —
   * each by the spell, the cast, the section and the seam, one at a time, never
   * on the drums (the rules are written at the head of `src/sweep.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  busSweeps: true,
  /**
   * **A noise at a section line fades in by a curve and never cuts** — round
   * S2, Eugene's ear of 09-25 on 21323's ambient breakdown (*"that noise/wind
   * segue sounds trashy"*). On, the glue's falling sweep rises over a beat on
   * the slow side and an eighth on a steady four instead of 10 ms, the swell
   * and the riser fall away over the same instead of cutting, and on a sparse
   * slow line the sweep starts an octave lower and 6 dB down; a driving or
   * broken beat keeps its edges (the rules are in `src/sweep.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  glueFades: true,
  /**
   * **The whistle comes up a little where it is alone with the bass** — round
   * S3, Eugene's ear on the benchmark's bass-and-whistle passages. On, the
   * texture part's note, on the slow side of the spell and in a passage with
   * nothing sustained, no drums and at most one quiet layer besides the bass,
   * is sent 4 dB harder into its space and struck with half again its FM index
   * (the rules are in `src/solo.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  sparseTexture: true,
  /**
   * **The bass takes a solo at the theme's arc** — round S3, an experiment on
   * Eugene's word (*"if it is silly we drop the idea"*). Written **off**: on, a
   * long calm theme with no drums lets its bass, in the last bars of the one
   * sparse main section nearest the golden point, go up an octave, hold its
   * notes, take passing tones and an anticipation, with a rest before it and
   * the other layers 4 dB down (`src/solo.ts`). Rounds S5, S7, S11 and S15
   * made it the theme's own figure ornamented with struck octave pops, never a
   * glide, and it is **on** since S17, on Eugene's ear of S15: *"bass solos are
   * good, unassuming but noticeable — commit it."*
   *
   * house-v1 carries no switches and the record never asks.
   */
  bassSolo: true,
  /**
   * **An offbeat hat's ring must clear the grid** — round S6, the hat analysis
   * of 26925 (Eugene: "hats too metallic"). On, a hat whose measured ring
   * (`HAT_RING_MS`) runs past 0.6 of an eighth at the theme's tempo is never
   * made likelier than the record made it by any bird's lean (`laneWeight`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  hatRing: true,
  /**
   * **The offbeat hat follows its section** — round S6: hats played four a
   * bar through every intro, breakdown and outro, by the record's grammar,
   * which keeps the closed hat on in all of them. On, a breakdown's first
   * phrase leaves the hat out and its later phrases keep the offbeats of beats
   * one and three only; an intro's first phrase and an outro's last keep the
   * same two (`src/hats.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  hatSections: true,
  /**
   * **A theme never opens silent** — round S13, Eugene on
   * `?seed=26925&v=2&theme=4&spell=em:0.10,ti:1.00,ze:0.00,ro:1.00,gl:0.00,ve:0.00`:
   * 19.6 s of digital silence. On, the one-harmonic-layer roll plays the layer
   * a section allows where it allows only one (it picked the keys in an intro
   * that allows only the pad), and a theme's first phrase that the grammar
   * leaves empty takes the section's own held layer (`src/generator.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  openingSound: true,
  /**
   * **The glue's noises belong to a bright, driving theme** — round S14,
   * Eugene on 26925 theme 4's break: *"that sound would suit higher-frequency
   * synths and stones on loud open-hat drums"*. On, the falling sweep, the
   * riser, the swell, the rising sweep and the crash play only where the spell
   * admits them (a driving or fast kick, a broken beat, a lifted light) or, at
   * the house, where the cast is bright synths on bright drums; elsewhere a
   * theme has no noise glue (`src/glue.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  glueGates: true,
  /**
   * **A room's "off" is about its own voice** — round S18, the recipes'
   * audit: the sub room's clap at -60 silenced a broken kit's snare, and the
   * growl room's shaker at -60 the cabasa, the congas, the tom and the rest of
   * the sixteenth lane, since they read the same level word. On, a voice that
   * is not the one the room turned off reads the style's base level for the
   * word (`src/lane-level.ts`); the room's own clap and shaker stay off.
   *
   * house-v1 carries no switches and the record never asks.
   */
  laneFloors: true,
  /**
   * **Nothing in the middle of a theme is ever fully silent** — round S21,
   * Eugene on `?seed=41475&v=2&theme=3&t=88`: a breakdown's first phrase left
   * empty by the density die, the motif's rest and S6's hat rest together. On,
   * a run of two silent bars or more past the intro's first phrase and before
   * the outro's last eight takes the theme's own bed at the same point of its
   * progression (`src/silence.ts`).
   *
   * house-v1 carries no switches and the record never asks.
   */
  neverSilent: true,
});

/**
 * What each switch takes off a room when it is on: the room's own answer, so
 * that the die it was short-circuiting has something to do. Written as paths
 * into the room rather than as code, because the fact at the head of
 * `deep-house.ts` is written as a list of fields and this is that list.
 */
const UNLOCKS: Readonly<Record<string, { shape?: string[]; params?: string[] }>> = Object.freeze({
  voicingDie: { shape: ['voicingStyle'] },
  maskDice: { shape: ['bassMask', 'stabMask', 'hatMask'] },
  sidechainPerRoom: { params: ['sidechain.depthDb', 'sidechain.minimumAt', 'sidechain.recoverBy'] },
});

/** A shallow copy of an object with some of its own keys left out. */
function without(obj: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!obj) return obj;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) if (!keys.includes(k)) out[k] = obj[k];
  return out;
}

/** The same, one level deeper, for a path like `sidechain.depthDb`. */
function withoutPaths(obj: Record<string, unknown> | null | undefined, paths: string[]) {
  if (!obj || !paths.length) return obj;
  const out: Record<string, unknown> = { ...obj };
  for (const p of paths) {
    const [head, tail] = p.split('.');
    if (!out[head]) continue;
    out[head] = without(out[head] as Record<string, unknown>, [tail]);
  }
  return out;
}

/**
 * The rooms this strategy hands the dice. Written without a branch on "is
 * anything switched on", so the path the record takes is the path a switched-on
 * strategy takes and the identity is the data rather than a short circuit —
 * which is the rule phase 0 wrote for the spell layer and is the same rule
 * here. With every switch off, every field survives and the rooms are v1's own
 * numbers; the program digest is the proof, on fourteen themes.
 */
function roomsUnder(source: Record<string, Room>, flags: Record<string, boolean>): Record<string, Room> {
  const shapeOff: string[] = [];
  const paramPaths: string[] = [];
  for (const [flag, takes] of Object.entries(UNLOCKS)) {
    if (!flags[flag]) continue;
    if (takes.shape) shapeOff.push(...takes.shape);
    if (takes.params) paramPaths.push(...takes.params);
  }
  const out: Record<string, Room> = {};
  for (const [id, room] of Object.entries(source)) {
    out[id] = { ...room, shape: without(room.shape, shapeOff), params: withoutPaths(room.params, paramPaths) };
  }
  return out;
}

export const rooms = roomsUnder(roomsV1, switches);

// --- the lanes ---------------------------------------------------------------
//
// **house-v1's lane table with the kitchen behind four of its rows**, and the
// sixteenth lane's figure taken off the hat mask and given a table of its own.
// Round K6, and Eugene's decision of 09-18 answering K5b's shaker finding:
// *a style declares its own lanes, and their number is the style's* — and the
// first lane to convert is the one whose part was defined by the absence of
// another one.
//
// It is `lanesV1.map(...)` and not a second table for the same reason every
// other block of this file is held by reference: a transcription is a copy that
// drifts. What is house-v2's own is the four candidate lists — exactly K5b's,
// at exactly K5b's weights, with no number touched — and one word of one row.
//
// **The glue's four lanes share one list.** K5b weighted `textureVoices` as one
// list because `texture` is one role, and it is; but the record's answer at a
// section boundary is not its answer to the last bars of a build. So each of
// the four keeps its own incumbent — `incumbent` on the row — and the other
// three lanes' incumbents sit at nought for it, where `Rng.pickWeighted` drops
// them before it draws. One list, one lean off the layer table, four moments.
//
// The kick and the bassline are deliberately **not** lists, which is K5a's own
// line: a kick is not drawn in this record — every theme has the one — and
// making it a draw is a composition change of its own rather than a wider list.
// The two harmonic lanes carry no list either, and for the reason they never
// did: they are chosen by what they play, and `voicePlaying` answers who plays
// it.

// --- the level a kitchen drum arrives at on a lane ---------------------------
//
// A `ride` declares `level: 'hatOpen'` and a `hatSizzle` `level: 'hatClosed'`,
// so on the lane each is trimmed to the room's number for the instrument it is
// standing in for — a number measured for that instrument and not for it.
// Eugene's ear said what that costs on six of thirteen cards (09-19: "very
// metallic hi-hat", "out of balance", "too pronounced"), so every candidate of
// the four percussion lanes was rendered **alone on the lane, on the record's
// own figure**, against the lane's incumbent on the same window, and
// `deep-house-v2-lane-trims.json` is the decibels that bring each to the
// incumbent's integrated loudness (`tools/imprint/lane-trim.ts --bless`). The
// composer writes it onto the candidate's events as a gain; the incumbent
// carries none, so the record's events are the objects they always were.
type LaneTrims = { lanes: Record<string, { trims?: Record<string, number>; shape?: Record<string, Record<string, { mid: number }>> }> };
const TRIMS = (laneTrims as LaneTrims).lanes;
function withTrims<T extends { v: string }>(list: readonly T[], laneId: string): readonly (T & { trimDb?: number })[] {
  const t = (TRIMS[laneId] && TRIMS[laneId].trims) || {};
  return Object.freeze(list.map((e) => (Number.isFinite(t[e.v]) && t[e.v] !== 0 ? Object.freeze({ ...e, trimDb: t[e.v] }) : e)));
}

/**
 * The same file's second reading onto a lane's entries: the per cent of each
 * candidate's energy in 400 Hz-2 kHz, the mean over the windows it was read
 * on. Only a lane whose `presence` asks for it carries it.
 */
function withMid<T extends { v: string }>(list: readonly T[], laneId: string): readonly (T & { mid?: number })[] {
  const shape = (TRIMS[laneId] && TRIMS[laneId].shape) || {};
  return Object.freeze(list.map((e) => {
    const reads = Object.values(shape[e.v] || {}).map((w) => w.mid).filter(Number.isFinite);
    return reads.length ? Object.freeze({ ...e, mid: +(reads.reduce((a, b) => a + b, 0) / reads.length).toFixed(2) }) : e;
  }));
}

// **The kitchen's presence follows the scene** (Eugene, 09-23, of seed 33,
// body + chords with the drone behind: "the woodblock is still a bit too
// pronounced compared to the rest of the mix; when in machine view I set the
// woodblock to 20 % volume it got back into the mix. 33 is so
// background-driven — deep bass, deep pads, closed hi-hat — the woodblock
// becomes the predominant instrument if not tamed"). The lane trim brought
// every sixteenth to the shaker's integrated loudness, and a shaker's energy
// is 4-12.5 kHz: a tuned voice whose energy sits in 400 Hz-2 kHz (the
// woodblock 89 %, the bongo 100 %, the cowbell 63 %, against the shaker's 3
// and the conga's 2) matched to it owns a band nothing else in a drone-behind
// mix is in. Behind the drone it is written 14 dB under its trim: his 20 %,
// which on seed 33's first main (bars 24-32, each layer rendered alone) takes
// the woodblock from 2.2 LU over the hats layer to 10.6 under it (12.8 dB, not
// 14: alone, its 26 dB crest had the limiter holding it). The other two
// drone-behind themes of 1-200 with a tuned sixteenth, 79 and 142 (the
// bongo), land 10.4 and 13.7 under; `tools/imprint/kitchen-presence.ts`
// renders the sweep and holds each 6 LU under. On air the lane is what it
// was; with the drone in front it is held off anyway.
const SIXTEENTH_PRESENCE = Object.freeze([{ scene: 'drone-back', midFrom: 50, db: -14 }]);

const LANE_KITCHEN: Readonly<Record<string, Partial<Lane>>> = Object.freeze({
  offbeat: { list: 'offbeatVoices', voices: withTrims(OFFBEAT_VOICES, 'offbeat'), incumbent: 'hatClosed' },
  offbeatOpen: { list: 'offbeatVoices', voices: withTrims(OFFBEAT_VOICES, 'offbeatOpen'), incumbent: 'hatOpen' },
  // The one row whose **figure** moves as well as its candidates: a sixteenth
  // lane that took the hat mask's leftovers was silent in 173 of 200 rolled
  // themes (`notes/archive/2026-09-kitchen/rounds/k5b.md` §8), because a mined mask whose hits all land
  // on offbeats leaves nothing between them. `catalogue.sixteenthMasks` is the
  // same mined measurement read for this lane instead of for the hats.
  // And the one row with a scene rule (Eugene, 09-22): with the drone in
  // front, the kitchen of both families — the membranes and the woodblock
  // (`drum`), the shaker and the cabasa (`noise`: "It's a shaker, so
  // percussion") — is put to the scene's question at the lane's own pace, and
  // at a sixteenth mask's pace every one of them is withdrawn, so the lane is
  // held off. Behind the drone, or on air, it draws as it always did.
  sixteenth: { list: 'sixteenthVoices', voices: withMid(withTrims(SIXTEENTH_VOICES, 'sixteenth'), 'sixteenth'), figure: 'sixteenthMask',
    withdraw: [{ scene: 'drone-forward', families: ['drum', 'noise'] }], presence: SIXTEENTH_PRESENCE },
  backbeat: { list: 'backbeatVoices', voices: withTrims(BACKBEAT_VOICES, 'backbeat') },
  glueImpact: { list: 'textureVoices', voices: TEXTURE_VOICES, incumbent: 'impact' },
  glueSwell: { list: 'textureVoices', voices: TEXTURE_VOICES, incumbent: 'swell' },
  glueSweep: { list: 'textureVoices', voices: TEXTURE_VOICES, incumbent: 'sweepDown' },
  glueRiser: { list: 'textureVoices', voices: TEXTURE_VOICES, incumbent: 'riser' },
});

export const lanes: Lane[] = lanesV1.map((l) => (LANE_KITCHEN[l.id] ? { ...l, ...LANE_KITCHEN[l.id] } : l));

/** The blessed trims, as read, for the gate that holds the lanes to them. */
export const LANE_TRIMS = laneTrims as LaneTrims & { measuredAt: string | null; strategy: string };

// --- the palette: which treatment belongs on which lane, and when ------------
//
// The stage runs six treatments today and rolls them uniformly over two lanes.
// The kitchen has twenty-six effects, and the question the cookbook review left
// open is not *which of them work* — Eugene answered that, and the answer is
// almost all of them — but *where they go*. His own words on the review form:
// "an overdrive can go on drums and keys and anything". Placement of an effect
// is therefore **ours to decide**, from the conventions of the genre, and this
// table is that decision written down where it can be argued with.
//
// It is production convention plus his notes from `notes/reviews/kitchen.json`,
// and it is to be re-weighted by what listeners' recipes ask for. Where his fit
// answer and the convention disagree the convention is written and **his answer
// is kept as a remark**, because a placement he called a guess is a remark and
// a placement nobody has heard is a hypothesis; neither is evidence.
//
// `lanes` are the event layers the stage can reach plus the buses a chain can
// sit on (`bus:` prefixed) and the master. `moments` are the style's own
// section kinds plus `seam`, which is the one moment that is not a section.
// `groove` in the brief is this record's `main`.
//
// **Since K5b the rota reads this table**, and reads it as two filters and a
// weight: the entries a lane may draw are those placed on that lane, and the
// entries a *segment* may draw are those of them placed at the section the
// segment begins in. A lane and a moment nothing is placed at is a segment with
// no treatment on it at all — which is not a hole in the table, it is the desk
// left alone in a moment nobody wrote a move for, and the intro is exactly
// that. The two filters are why `lanes` and `moments` have to be closed
// vocabularies and why the gate refuses a row outside either.

/** Every moment a treatment may be asked for: the section kinds, and the seam. */
export const MOMENTS = Object.freeze(['intro', 'build', 'main', 'breakdown', 'drop', 'outro', 'seam']);

/** Every lane: the event layers the stage can reach, the four buses, the master. */
export const PALETTE_LANES = Object.freeze([
  'kick', 'hats', 'shaker', 'clap', 'bass', 'keys', 'pad', 'fx',
  'bus:drums', 'bus:sub', 'bus:melodic', 'bus:keys', 'master',
]);

/**
 * Where each treatment belongs, and when. One row per rota entry.
 *
 * The six gestures first, at the placement the stage already gives them: both
 * harmonic lanes, and the pad alone for the hole — which is `stage.treatments`
 * and `stage.padOnlyTreatments` said as a row rather than as two lists, and is
 * asserted against them.
 *
 * Then one row per registered effect, by family, in the registry's order:
 *
 *   **drive** on drums, keys and the bass's push moments, rarely on the pad;
 *   the fuzz and the crusher are drop and breakdown colour and nothing else.
 *   **modulation** on keys and pads, the phaser staying the pad's signature,
 *   the auto-pan on pads and open hats.
 *   **time** — the tape delay on keys, leads and drops; the reverbs on pads,
 *   keys and the clap's room; the shimmer a breakdown colour.
 *   **dynamics** as bus tools: the compressor on the drum bus, the transient
 *   shaper on the kick and the snare, the gate on sends, the duck as it is.
 *   **tone** as the stage's own sweeps, with the wah as a keys colour.
 *   **space**: width on pads, Haas on leads, the mono-maker on the low end.
 */
const PLACEMENT: Readonly<Record<string, { lanes?: string[]; moments?: string[]; note?: string }>> = Object.freeze({
  // the six the stage runs today
  hpRise: { lanes: ['pad', 'keys'], moments: ['main', 'build', 'breakdown'] },
  lpClose: { lanes: ['pad', 'keys'], moments: ['main', 'breakdown', 'outro'] },
  phaser: { lanes: ['pad', 'keys'], moments: ['main', 'breakdown'] },
  breath: { lanes: ['pad', 'keys'], moments: ['main', 'breakdown'] },
  throw: { lanes: ['pad', 'keys'], moments: ['main', 'build', 'drop'] },
  hole: { lanes: ['pad'], moments: ['main', 'breakdown'] },

  // time
  'fx:chorus': { lanes: ['keys', 'pad'], moments: ['main', 'breakdown'], note: 'his: keys, amount less — "subtle… sounds a bit like phaser, but I think it\'s okay"' },
  'fx:tremolo': { lanes: ['keys', 'pad'], moments: ['main', 'seam'], note: 'his: keys, seam, amount right. The electric piano is where nearly all of the record\'s own tremolo already lives (`figures.tremolo`)' },
  'fx:tapeDelay': { lanes: ['keys', 'bus:melodic'], moments: ['main', 'drop', 'seam'], note: 'his: keys, drums, pads, amount right' },
  'fx:flanger': { lanes: ['keys', 'pad'], moments: ['build', 'drop'], note: 'his: keys' },
  'fx:reverb': { lanes: ['pad', 'keys', 'clap'], moments: ['main', 'breakdown', 'drop'], note: 'his: pads, keys, drums, drop, amount less' },
  'fx:shimmer': { lanes: ['pad', 'keys'], moments: ['breakdown', 'seam'], note: 'his: keys, seam, amount less' },

  // dynamics
  'fx:compressor': { lanes: ['bus:drums'], moments: ['main', 'drop'], note: 'his: drums, breakdown, amount less' },
  'fx:transient': { lanes: ['kick', 'clap'], moments: ['main', 'drop'], note: 'his: nowhere — "I couldn\'t detect it by ear", which is what a transient shaper on a fixture sounds like' },
  'fx:gate': { lanes: ['bus:melodic', 'bus:keys'], moments: ['main', 'build'], note: 'his: nowhere — "I don\'t know what it could be used for, drums?"' },
  'fx:duck': { lanes: ['bus:sub', 'bus:drums', 'bus:melodic', 'bus:keys'], moments: ['intro', 'build', 'main', 'breakdown', 'drop', 'outro'], note: 'his: nowhere; it is the one already under every kick, so it goes where it already is' },

  // drive
  'fx:overdrive': { lanes: ['bus:drums', 'keys', 'bass', 'pad'], moments: ['main', 'build', 'drop', 'breakdown'], note: 'his: drums, pads, keys, breakdown, amount less. The pad is the rare one' },
  'fx:distortion': { lanes: ['bus:drums', 'bass', 'keys'], moments: ['drop'], note: 'his: drop, amount less' },
  'fx:fuzz': { lanes: ['keys', 'bass', 'bus:drums'], moments: ['drop', 'breakdown'], note: 'his: drums, keys, pads, seam. Convention keeps it to the drop and the break' },
  'fx:crush': { lanes: ['keys', 'pad', 'bus:drums'], moments: ['drop', 'breakdown'], note: 'his: breakdown, pads, drop' },

  // tone
  'fx:filter': { lanes: ['pad', 'keys', 'bus:drums'], moments: ['main', 'build', 'breakdown', 'seam'], note: 'his: nowhere, artefacts some, amount more. It is the stage\'s own sweep and the amount is the stage\'s to set' },
  'fx:ladder': { lanes: ['bass', 'keys'], moments: ['main'], note: 'his artefacts *bad*, amount *more* — which was -23 dBFS of DC riding the envelope, found and fixed in bb83f04. **Re-listen after bb83f04** before K5b\'s weight is kept' },
  'fx:eq': { lanes: ['bus:drums', 'bus:melodic', 'bus:keys', 'master'], moments: ['main'], note: 'his: nowhere, amount less. The master\'s own bells are instances of this one' },
  'fx:autoWah': { lanes: ['keys'], moments: ['main', 'build'], note: 'his: nowhere, amount less. A keys colour' },
  'fx:formant': { lanes: ['pad', 'keys'], moments: ['breakdown', 'main'], note: 'his: nowhere, amount right' },

  // motion
  'fx:phaser': { lanes: ['pad'], moments: ['main', 'breakdown'], note: 'his: breakdown, amount right. The pad\'s signature treatment, which is what the gesture of the same name already is' },
  'fx:autoPan': { lanes: ['pad', 'hats'], moments: ['main', 'breakdown'], note: 'his: breakdown. Pads and open hats' },
  'fx:lfoParam': { lanes: ['pad', 'keys', 'bus:drums'], moments: ['build', 'breakdown'], note: 'his: nowhere, amount right. It is the thing a gesture is made of' },
  'fx:ringMod': { lanes: ['keys'], moments: ['drop', 'breakdown'] },

  // space
  'fx:width': { lanes: ['pad'], moments: ['main', 'breakdown'] },
  'fx:haas': { lanes: ['keys'], moments: ['main', 'drop'] },
  'fx:mono': { lanes: ['bus:sub', 'kick'], moments: ['intro', 'build', 'main', 'breakdown', 'drop', 'outro', 'seam'] },
});

const FAMILY_OF = Object.fromEntries(EFFECTS.map((d) => [`fx:${d.id}`, d.family]));

/**
 * One row of the rota, as the palette reads it: the three fields every entry
 * carries, and the four only an effect instance does — a gesture has no family
 * of its own, was never opened by a rule and was never dropped by one.
 */
interface RotaRow {
  v: string;
  w: number;
  kind: string;
  family?: string;
  opened?: number | null;
  dropped?: unknown;
  over?: string[] | null;
}

/**
 * The palette itself: the rota's weights joined to the placement above, one row
 * per entry, in the rota's order. There is one weight in this style and it is
 * the rota's — a table with a second copy of a number is a table that will one
 * day disagree with itself.
 */
export const palette = Object.freeze(TREATMENT_ROTA.map((e: RotaRow) => Object.freeze({
  id: e.v,
  kind: e.kind,
  family: e.family || FAMILY_OF[e.v] || 'gesture',
  w: e.w,
  /** what rule 2 opened it at, which stays readable after rule 4 took it away */
  opened: e.opened ?? null,
  /** which rule took the weight away, and what it costs. `null` is "nothing did" */
  dropped: e.dropped || null,
  lanes: Object.freeze((PLACEMENT[e.v] || {}).lanes || []),
  moments: Object.freeze((PLACEMENT[e.v] || {}).moments || []),
  note: (PLACEMENT[e.v] || {}).note || null,
  over: e.over || null,
})));

/**
 * The stage, with the rota it is allowed to draw from taken off the palette
 * rather than written twice. `liveOf` is every entry at a weight above nought,
 * in the list's order: v1's six gestures, and behind them the seventeen effect
 * instances rule 4 admitted.
 *
 * `palette` goes onto the stage as well, because the stage is the only thing
 * the composer hands `src/performance.ts`, and since K5b the rota needs three
 * things off a row and not one — the weight, the lanes and the moments. There
 * is still exactly one weight in this style and it is the rota's; `treatments`
 * is the same list with everything but the name taken off it, kept because the
 * seam, the check and the program all read a plain list of names.
 *
 * No branch: the stage is rebuilt every time, and what makes it a stage at all
 * is that the data is the data.
 */
export const stage = Object.freeze({
  ...stageV1,
  // **The bass bus two decibels down** (round S12, Eugene: "we got overboard on
  // the bass level ... calm it down a hint while not reducing range"). The
  // mastering research reads the house as a tilt: 2-5 dB too much at 31-50 Hz
  // against the reference catalogue and short from 80 Hz up. Its first lever is
  // this one, the level of the line with its harmonics intact, and the trim was
  // chosen off a grid of 0, -1, -1.5 and -2 dB over 14 golden themes and the
  // benchmark's three: at -2 the house's share under 100 Hz falls a median 3.4
  // points (77.6 % towards the catalogue's 67), the low band 1 dB in absolute
  // terms, the mid range moves 0.04 dB, and the limiter works a little less.
  // Every one of those is under half the trim, so -2 is the hint and not -1.
  bassBusDb: -2,
  treatments: liveOf(TREATMENT_ROTA),
  palette,
});

// --- the loudness model, fitted on this palette ------------------------------
//
// **A loudness model is fitted on a palette, and a strategy is a palette.**
// house-v2 read house-v1's coefficients until round K6, and K6 §0 measured what
// that cost: the v1 model reads house-v2 **2.5 to 3.5 LU quieter than it is** on
// every seed it was pointed at, clamped or not, so an unclamped v2 theme was
// being driven two to three decibels past the target as reliably as a clamped
// one was. The cause is visible in the features — `harmonicDb` is a sum over
// what the instruments holding the chords declare about themselves, and the
// kitchen's declared levels are on a footing the v1 fit never saw: a reed organ
// takes one theme's `harmonicDb` from -16.8 to -26.5 while the record it makes
// is 1.45 LU quieter.
//
// So the coefficients are house-v2's own, and **every number in them was written
// by a gate**: `tools/loudness-fit.ts --strategy house-v2 --measure --fit
// --bless` rendered 120 themes of this palette with the trim at nought, metered
// them, chose its features by forward selection on the cross-validated residual
// and wrote the file. It is JSON beside the style for the reason
// `deep-house-signatures.json` is: nothing in it was reasoned.
//
// **The target and the clamp are the record's** — -13.0 LUFS and ±4 dB — because
// levelling a palette against itself and moving where a record sits are two
// decisions and only the first one is this round's.
//
// This, keyboard character and the saw-lead defaults are v2's own blocks.
// Every other base field still shares v1's data; its record remains untouched.
//
// **And the trim is fitted for the loudest main, not the first, and never past
// the headroom that window has** (09-22, seed 20). The window rule is this
// block's `window`, reasoned and not measured, which is why it is written here
// and not in the JSON; the headroom model is measured, and is the JSON's, beside
// the coefficients it was fitted with. `src/loudness.ts` (`trimWindow`,
// `headroomDb`) says why each is there.
const { targetLufs, clampDb, slopeUp, slopeDown, intercept, coef, centre, headroom: h } = loudnessFit as typeof loudnessFit & {
  headroom?: { activeMax: number; deepestMax: number; marginDb: number; intercept: number; coef: Record<string, number>; centre: Record<string, number> };
};
const headroom = h && Object.freeze({ activeMax: h.activeMax, deepestMax: h.deepestMax, marginDb: h.marginDb, intercept: h.intercept, coef: h.coef, centre: h.centre });
const loudnessV2 = Object.freeze({ targetLufs, clampDb, slopeUp, slopeDown, intercept, coef, centre, window: 'loudest' as const, ...(headroom ? { headroom } : {}) });

// Ordinary-roll feedback, 09-21: the filter's pronounced opening and resonant
// peak make chord stabs too assertive at home. This is a style voicing of the
// existing instrument, not a new oscillator or per-seed exception. The values
// are authored for the next listen, not inferred from an acoustic score.
const smoothSaw = Object.freeze({ ...base.sawLead,
  attack: .018, cutoff: 1200, envMult: 1.6, q: 1.5, pwmDepth: .12, trim: .25,
});

/** Shared foundation with v2's loudness and authored instrument characters. */
export const baseV2 = Object.freeze({ ...base, loudness: loudnessV2, sawLead: smoothSaw, keyboardPatches });

/** That table resolved once, the way every style resolves its own. */
export const settings = resolveSettings({ base: baseV2 });

// --- the catalogue -----------------------------------------------------------

export const catalogue = {
  /** the rooms the preset die draws from. Two, and a third slot that is empty:
   * a third room is a benchmark minute nobody has measured yet, and a name in
   * here with no room behind it would be a die that can draw nothing. The slot
   * is `roomSlots` below — declared, weightless, and K5b's to fill. */
  rooms: ROOMS,
  /** how many rooms this strategy is built for, against the two it has. The
   * empty slot, said as a number rather than as a placeholder nothing resolves. */
  roomSlots: 3,
  voicingStyles: VOICING_STYLES,
  fxPalettes: FX_PALETTES,
  densityLabel: DENSITY_LABEL,
  masks: MASK_TABLES,
  /** the sixteenth lane's own mined figures — `dice('sixteenth')`, one draw.
   * Derived in `src/catalogue.ts` out of the same hat masks, read for what the
   * reference sets put between the offbeats. house-v1 has no such list and its
   * sixteenth lane takes the hat mask's leftovers, which is the record. */
  sixteenthMasks: SIXTEENTH_MASKS,
  /** the harmonic lists, widened: v1's mined weights at the head, the kitchen
   * behind them at a third of the mean each list already carried */
  leadTimbres: leadTimbresV2(base.timbre.lead),
  // Explicit musical parts may request this prototype. It is absent from the
  // ordinary lead/pad dice and their measured signature population.
  partTimbres: [{ v: 'wordlessVocal', w: 1 }],
  sustainedLeads: sustainedLeadsV2(base.timbre.sustained),
  padPartners: padPartnersV2(base.timbre.padPartner),
  stabPartners: stabPartnersV2(base.timbre.stabPartner),
  densities: base.density.weights,
  keyRoots: base.key.roots,
  melodyBars: base.piano.melodyBars,
  /** the four percussion lanes: the incumbent at its weight, the kitchen behind
   * it at a third. **No die reads these four yet** — a lane that draws its own
   * voice is a composition change of its own and is not this round's, and
   * `unreachable` below says so rather than leaving it to be noticed. What K5b
   * gives them is a weight and, through `layers`, something to lean on. */
  backbeatVoices: BACKBEAT_VOICES,
  offbeatVoices: OFFBEAT_VOICES,
  sixteenthVoices: SIXTEENTH_VOICES,
  textureVoices: TEXTURE_VOICES,
  /** the stage's rota: v1's six gestures and the effect instances the ceiling
   * admitted, drawn per lane and per moment off `palette` */
  treatmentRota: TREATMENT_ROTA,
  /** derive-lite's two, read only where `derive().kit` is `breaks`: five
   * authored break figures — `dice('break')`, one draw — and the one voice that
   * plays their backbeat. Authored and not mined, because deep house is the
   * only region with a corpus (`src/catalogue-v2.ts`, rule 3 of PLAN-MAGIC-V2). */
  breakMasks: BREAK_MASKS,
  breaksBackbeatVoices: BREAKS_BACKBEAT_VOICES,
  /**
   * PLAN-MOTIF T1's three. **Which register states the theme is a die**, which
   * is the plan's own answer to its open question 2 — *does the bass carry the
   * theme in house (the pump) or the lead (the lick)?* — and the lead is
   * weighted over the bass because the mids hole is the lead's: the record has
   * no part above middle C with a shape of its own, and the 300 Hz-2 kHz share
   * of seed 1 sits at -18.8 dB against the three reference sets' -8.5 to -12.
   *
   * The families are the library's own `motif` rows, named here by id and at
   * the weight each row carries, so the composer draws a **recipe** and not a
   * table in code (`src/motif.ts` holds the boxes, `recipes/motif-*.json` the
   * rows, and `npm run check` proves the two are the same thing).
   *
   * `motifChance` is the share of themes that have one at all. Half: a theme
   * you could hum is a thing a set should have more often than not and less
   * often than always, and it is the one number here a listen can move.
   */
  /**
   * **How long a section may be pad-alone before the figure enters**
   * (`notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1, the `leadEntry` switch). Sixteen bars: two phrases, and
   * the plan's own shape — *"re-roll the harmonic roles at every 32-bar phrase,
   * and force `keysSection` true for the second 16 bars of any 32 in which the
   * rhythmic role has not sounded."* A measured groove runs a median 38 bars,
   * so sixteen is where a listener stops counting and not where a section ends.
   */
  leadEntryBars: 16,
  motifRegisters: Object.freeze([{ v: 'lead', w: 3 }, { v: 'bass', w: 2 }]),
  motifFamilies: Object.freeze(MOTIF_RECIPES.map((r) => ({ v: r.id, w: r.weight as number }))),
  motifChance: 0.5,
  /**
   * **The harmonic lists lean by `hold` in a sparse room** (the music review of
   * 09-19). Rule 2 opened the kitchen's held voices — a reed organ, a grain
   * pad, a saw pad, a formant pad — into the lead and pad lists at the same
   * third as its struck ones, and measured over 400 rolled themes that put a
   * held voice in the lead of 45 % of minimal themes where the record holds one
   * in 22 %, and a held kitchen stab in 20 % where the record's stab is struck
   * in every theme. Eugene's two *worse* random cards (`notes/reviews/k6.json`)
   * are both minimal rooms: 15819 a reed organ leading, 47814 a grain pad
   * holding under a piano — "ominous trembling keys", "incoherent voice
   * sounds" — where the record's own struck ep and rhodes carried the groove.
   * So under the density named here a newcomer's weight is scaled by one minus
   * its declared `hold` (the descriptor's own number, `TIMBRES`): a reed organ
   * at 0.8 keeps a fifth of its opening, an fm pluck at 0.04 nearly all of it,
   * and the record's own instruments are never leaned. `generator.ts`,
   * `holdLeanFor`; house-v1 carries no block and hands every list through.
   */
  holdLean: { densities: ['minimal'], lists: ['leadTimbres', 'padPartners', 'stabPartners'] },
};

const candidates = candidateListsV2(catalogue);

/**
 * What every timbre this catalogue can name reads as when it is played
 * **alone** — the per-layer imprint rounds K2 and K4 measured, joined to the
 * names the lists use.
 *
 * This is the answer to phase 1's finding, and it is why house-v2 can have a
 * lead list of twenty-six where house-v1 has seven and still lean it. Over a
 * whole mix no bird separated the seven at all; read alone they separate on
 * six of the eight, and the four the record's own dice could not tell apart —
 * `ep`, `rhodes`, `organ` and `swell` — sit a third of the table's own spread
 * from each other on Ember, Root and Loom.
 *
 * house-v1 does **not** carry this and must not: its weights are a measurement
 * of the record taken on the whole-mix scale, and a row measured on one scale
 * may never be compared with a row measured on the other. The two tables live
 * side by side and `src/spell.ts` chooses between them by the *kind* of list.
 *
 * **The four percussion lanes are in the population since K5b**, which is what
 * the drum fixture table was measured for. Two consequences, and both are
 * deliberate. A lane leans: the bias reads the same kernel over readings taken
 * alone, so pulling a bird moves the weights of the snare against the rim and
 * of the conga against the cowbell, and the day a die reads one of those lists
 * it reads a leaning list rather than a flat one. And the kernel's **width**
 * moves with the population, because the width is the population's own spread
 * and the population is every instrument this catalogue can name — sixteen
 * drums included. That softens the harmonic lean a little and it is the honest
 * arithmetic: a bird whose readings are spread wide over everything the kitchen
 * holds is a bird that separates less, and a width that only ever saw the
 * harmonic half would be a width measured on a population that is not the one
 * being drawn from.
 */
export const layersMeasured = layerTable(layerSignatures, [
  ...catalogue.leadTimbres.map((o: { v: string }) => o.v),
  ...catalogue.sustainedLeads,
  ...catalogue.padPartners.map((o: { v: string }) => o.v),
  ...catalogue.stabPartners.map((o: { v: string }) => o.v),
  ...catalogue.backbeatVoices.map((o: { v: string }) => o.v),
  ...catalogue.offbeatVoices.map((o: { v: string }) => o.v),
  ...catalogue.sixteenthVoices.map((o: { v: string }) => o.v),
  ...catalogue.textureVoices.map((o: { v: string }) => o.v),
]);

/**
 * **The offbeat hats, as a hat is heard** — round S6, the hat analysis of
 * `?seed=26925&v=2&theme=3&spell=ember:0.49,gleam:1.00,spark:1.00`. Each hat
 * struck once alone through the real graph (26925 theme 3's room, 2 ms
 * windows, round S6's note): how long its ring takes to fall 20 dB under its
 * peak, and its spectral centroid over that ring.
 *
 *   hatTight  24 ms   6.3 kHz        hatSizzle  80 ms  8.6 kHz (weight 0)
 *   hatClosed 26 ms   4.9 kHz        hatLoose  212 ms  5.3 kHz
 *   hatOpen  220 ms   3.3 kHz        ride      382 ms  4.8 kHz (weight 0)
 *
 * (The analysis's own reading, over a mix and to a different floor, put
 * hatClosed at 122 ms and hatLoose at 253: the order is the same.)
 */
export const HAT_RING_MS: Readonly<Record<string, number>> = Object.freeze({
  hatTight: 24, hatClosed: 26, hatSizzle: 80, hatLoose: 212, hatOpen: 220, ride: 382,
});
export const HAT_CENTROID_HZ: Readonly<Record<string, number>> = Object.freeze({
  hatTight: 6331, hatClosed: 4919, hatSizzle: 8582, hatLoose: 5301, hatOpen: 3320, ride: 4772,
});

/**
 * **What "bright" is for a hat: short and high.** The per-layer table read
 * each hat's Gleam alone, as it reads a lead's, and for a hat that reading is
 * not its brightness: it put the crispest hat (hatTight) lowest of the six and
 * the ringing ones (hatLoose, the ride) over it, so Gleam's bright end, with
 * the sizzle and the ride at weight nought, promoted hatLoose — the longest
 * and most metallic hat left — to 45 % of the closed lane on 26925. Here each
 * hat's Gleam reading is re-stated from the measure above:
 *
 *   brightness = centroid x exp(-ring / 100 ms)
 *
 * placed into the span the six readings already had (0.258 to 0.375), so the
 * kernel's width, which is the whole table's spread, does not move, and no
 * other list or bird is touched. The order becomes hatTight, hatClosed,
 * hatSizzle, hatLoose, hatOpen, ride: the bright lean lands on the crisp hats
 * and never on a ring. At the house every weight is still exactly 1.
 */
const hatBrightness = (v: string): number => HAT_CENTROID_HZ[v] * Math.exp(-HAT_RING_MS[v] / 100);
export const layers: LayerTable = (() => {
  const hats = Object.keys(HAT_RING_MS).filter((v) => layersMeasured.rows[v]);
  const read = hats.map((v) => layersMeasured.rows[v].mean.gleam);
  const lo = Math.min(...read), hi = Math.max(...read);
  const b = hats.map(hatBrightness);
  const bLo = Math.min(...b), bHi = Math.max(...b);
  const rows = { ...layersMeasured.rows };
  hats.forEach((v, i) => {
    rows[v] = { ...rows[v], mean: { ...rows[v].mean, gleam: lo + ((b[i] - bLo) / (bHi - bLo)) * (hi - lo) } };
  });
  return { ...layersMeasured, rows };
})();

/**
 * The lists that draw zero in this catalogue.
 *
 * **It is empty, and no strategy's has been before.** house-v1's note is four
 * names and K5a's was nine. K5b took five off this one by switching the voicing
 * die, the three mask dice and the rota on, and left four — the percussion
 * lanes, which were unreachable for a reason that was not a switch: *nothing in
 * this engine drew a lane's own voice*, because `src/patterns.ts` wrote
 * `hatClosed` and `shaker` and `src/generator.ts` wrote `clap`.
 *
 * Round K6 is that reason gone. A lane is a row of `lanes` above, the composer
 * asks each row who is playing it off a stream named for the lane, and all four
 * lists are drawn — the glue's four moments sharing one of them.
 * `sixteenthMasks` arrives already drawn, by the die its own lane reads.
 *
 * The field stays, empty. A mechanism with nothing in it is what a mechanism
 * looks like once it has been answered, and the day a strategy grows a list
 * ahead of the die that reads it, this is where it is written down rather than
 * left to be found.
 */
const unreachable: string[] = [];

/**
 * **House-v2's own set table: shorter themes, and the mix later** — round S4,
 * Eugene of 09-25: *"our songs are rather long, and given the lack of texture
 * they tend to be repetitive; the ambient track is 19 minutes. Trim the formula
 * for track length by about 20 %, and reduce the mixing gap so the mix starts a
 * bit later ... Later we can raise it again if more recipes and effects
 * justify 5."* v1's `set` is the record's and is not touched; this is a copy
 * with three lengths and the floor changed.
 *
 *   `themeBarPercentiles`: the measured [79, 118, 145, 167, 247] times 0.8,
 *     each on the four-bar grid — [64, 96, 116, 132, 196]. The draw still
 *     rounds to sixteen bars, so a theme is one of the lines the record's
 *     are, a fifth shorter.
 *   `themeBarsMin` 64 to 52 and `themeBarsMax` 256 to 208, the same fifth.
 *     The ceiling does work: the percentiles' top tail alone reaches 240.
 *   `seamFloor` 0.75 to 0.82, and `seamLineInside`: a floor past the last
 *     sixteen-bar line with room for the blend takes an eight- or four-bar
 *     line at or after it, so a short theme's mix starts after its floor with
 *     its blend whole, where it used to step back to the line before.
 */
const set = Object.freeze({
  ...setV1,
  themeBarPercentiles: [64, 96, 116, 132, 196],
  themeBarsMin: 52,
  themeBarsMax: 208,
  seamFloor: 0.82,
  seamLineInside: true,
  // **Another 15 % off, and off the mains** (round S19, Eugene: *"tracks are
  // still a bit long ... trim another 15 % on average, and if possible bias
  // the trimming toward the longer segments and away from the breaks and
  // bridges"*): a theme is drawn at the table's length and its arrangement is
  // cut to 0.85 of it on the four-bar grid, inside 44 and 176 bars (the floor
  // and the ceiling above, times 0.85), the mains giving their bars first
  // (`cutMainsFirst`, `src/arrangement.ts`).
  themeTrim: 0.85,
  themeTrimBars: [44, 176] as [number, number],
});

export const style = {
  id: 'deep-house-v2',
  label: 'deep house (v2)',
  base: baseV2,
  settings,
  corpus: houseV1.corpus,
  rooms,
  sections,
  development,
  lanes,
  stage,
  set,
  figures,
  loudness,
  catalogue,
  candidates,
  unreachable,
  signatures: houseV1.signatures,
  // round S6's measured hat rings, read by `hatRing`
  ringMs: HAT_RING_MS,
  hatCentroid: HAT_CENTROID_HZ,
  // house-v2's own, which v1 has no field for and does not need.
  switches,
  palette,
  flagged: FLAGGED,
  layers,
  // Learned parts become ordinary draws after the eighth listening comparison.
  // These are independent chances, not weights over whole reference recipes.
  characters,
  composition, controls,
} satisfies StrategyStyle;

export default style;
