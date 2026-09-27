// The spell: eight birds over the dice, and the bias they become.
//
// This is phase 0 of `notes/plans/PLAN-MAGIC-V2.md`, the composer's side of it.
// A **spell** is eight numbers 0..1 and nothing else — no BPM, no reverb, no
// instrument — and this file is the only place that knows what they mean. What
// leaves it is a **bias**: a weight on every entry of every candidate list the
// style exposes, and a multiplier on every continuous range the dice draw
// inside. The dice themselves do not change, and nothing below them learns a
// bird's name.
//
// **At `HOUSE` the bias is exactly the identity.** Every weight is 1 and every
// multiplier is 1, so `planTheme(seed, n, { spell: HOUSE })` and
// `planTheme(seed, n)` are the same call, bit for bit — `x * 1 === x` for every
// finite double, and `Rng.pickWeighted` at an equal weight *is* `pick` (round A
// of PLAN-V1-NEXT enumerated every boundary value). That identity is not
// asserted here. There is no `if (house) do it the old way` below; there is one
// `if (isHouse(spell))` in `biasFor`, which hands back the identity it has
// already worked out, once per style, instead of doing the sums again — a
// saving and not the claim. So the digests, which plan the house, go round the
// arithmetic, and `tools/check.ts` runs the arithmetic itself at the house for
// every strategy's style and requires every weight and range to come out at
// exactly 1 (the reconciled review of 09-24, R100).
//
// **Where the mapping comes from.** Phase 0 carried one stated shape — a pull
// on Root leans the room die — as proof that the plumbing reached the dice at
// all, and refused to invent the rest. Phase 1 does not invent them either: it
// measures them. `tools/imprint/signatures.ts` plans a sweep of themes with no
// spell on them, renders each one's main groove offline, imprints it, and asks
// of every candidate of every list a die draws from: *what did the themes that
// rolled this one read as?* That mean and spread over the eight birds is the
// candidate's **signature**, and the style carries the whole table as
// `style.signatures` (`src/styles/deep-house-signatures.json`, committed, with
// the date, the seeds, the anchors and the count behind every row on it).
//
// A weight is then a Gaussian kernel over the birds that list's candidates
// actually separate, divided by the same kernel at the house — which is what
// makes every weight **exactly 1** at `HOUSE`, by arithmetic and not by a
// branch: the two exponents are the same double and their difference is nought.
//
// Component controls are a separate, explicitly authored response table on
// the style. This file evaluates those curves around HOUSE; the sampler sees
// only named musical controls. They are listening hypotheses, not signatures
// or a substitute for the measured die-to-reading calibration.

import { linkRaw, linkValue } from './link-table.ts';
import type { BirdResponse } from './composition-policy.ts';
import type { Style } from '@deep-house/engine/style';
import type { KnobSpec, Knobs } from '@deep-house/engine/voices/descriptor';

/** The eight, in the order every reading, row and readout writes them. */
export type Bird = 'ember' | 'tide' | 'zephyr' | 'root' | 'gleam' | 'veil' | 'spark' | 'loom';

/** @type {readonly Bird[]} */
export const BIRDS: readonly Bird[] = Object.freeze([
  'ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom',
] as const);

/**
 * **Each bird's two letters in a link** (round K29, Eugene: *"we could shorten
 * our URLs by using two-char names for the birds, like in the machine view;
 * support the full names for backward compatibility, but switch the app to use
 * two chars by default"*). The machine view's spell tile prints a bird as its
 * first two letters, and those are unique over the eight, so they are the
 * code: one table, which the writer writes and the reader reads beside the
 * full names (`spellQuery`, `parseSpell`).
 */
export const BIRD_CODE: Readonly<Record<Bird, string>> = Object.freeze(
  Object.fromEntries(BIRDS.map((b) => [b, b.slice(0, 2)])) as Record<Bird, string>,
);
const BIRD_OF_NAME: Readonly<Record<string, Bird>> = Object.freeze(
  Object.fromEntries(BIRDS.flatMap((b) => [[b, b], [BIRD_CODE[b], b]])) as Record<string, Bird>,
);
/** A bird named in a link, by its full name or by its code; anything else is null. */
export const birdOfName = (name: string): Bird | null => BIRD_OF_NAME[String(name).toLowerCase()] ?? null;

/** What the ring sends, and all it sends: eight numbers in 0..1. */
export type Spell = Record<Bird, number>;

/** Which birds a hand is holding, when one is. Read in phase 1, not here. */
export type Held = Partial<Record<Bird, boolean>>;

/**
 * **When two spells are the same** (M14, the review of 09-26: five tolerances answered it
 * five ways, and Ember held at 96 % still lit Deep House): within half the
 * hundredth a link carries, bird by bird. The machine view's lamps and genre
 * keys read it; the ring's own tolerances adopt it in K30.
 */
export const SPELL_SAME = 0.005 + 1e-9;

/**
 * The house vector, **measured**: the median of the fourteen golden themes on
 * the scale `notes/analysis/imprint-calibration.md` calibrated
 * (`anchors.json@1e899ba4`), not the illustrative vector PLAN-MAGIC-V2 was
 * drafted with. The largest gap between the two is 0.039 and five of the eight
 * are inside 0.01, which is the plan's claim — an untouched ring is deep house —
 * met by a measurement rather than by luck.
 */
export const HOUSE: Readonly<Spell> = Object.freeze({
  ember: 0.394, tide: 0.558, zephyr: 0.377, root: 0.717,
  gleam: 0.359, veil: 0.473, spark: 0.275, loom: 0.578,
});

/**
 * The house box: **half the interquartile range of the golden themes**, per
 * bird. The decision on record (09-18) is that the box is the golden's own
 * spread and not the references' — the record is the thing being described.
 *
 * It is much tighter than PLAN-MAGIC-V2's illustrative ±0.12: the middle half
 * of the catalogue is inside ±0.13 on every axis and inside ±0.05 on four of
 * them. `HOUSE_OUTER` beside it is half the full range of the same fourteen,
 * which is the outer box the ±0.12 was really about; nothing reads it yet and
 * it is here so the two are not confused later.
 *
 * One thing the calibration found that neither number says: the fourteen are
 * **two clusters split by the room**, with Tide, Zephyr, Veil and Spark
 * separating sub from growl with no overlap at all. So a roll in the middle of
 * this box is a roll *between* two rooms rather than inside either, and the
 * library's first two recipes are the two rooms.
 */
export const HOUSE_BOX: Readonly<Spell> = Object.freeze({
  ember: 0.029, tide: 0.106, zephyr: 0.072, root: 0.031,
  gleam: 0.050, veil: 0.069, spark: 0.125, loom: 0.021,
});

/** Half the full measured range of the same fourteen themes. Recorded, unread. */
export const HOUSE_OUTER: Readonly<Spell> = Object.freeze({
  ember: 0.168, tide: 0.348, zephyr: 0.225, root: 0.102,
  gleam: 0.104, veil: 0.171, spark: 0.195, loom: 0.063,
});

// --- what the composer reads -------------------------------------------------

/** The tempo families a pulse lands in. Tempo is derived, never a bird. */
export type TempoFamily = 'unmetered' | 'house' | 'techno' | 'drumAndBass';

/** The drum kit a fracture asks for. */
export type Kit = 'fourFloor' | 'breaks';

/**
 * What `derive` works out once per theme, before the dice. Every field is a
 * number or a word the composer understands, and none of them is a bird's name:
 * that is the whole point of the layer.
 *
 * Three of these are arithmetic over two birds — `pulse`, and the `tempoFamily`
 * and `kit` that fall out of it — and the rest are one bird under the name the
 * composer uses for it. That is deliberate and it is phase 0's honest position:
 * the shapes of the other maps are phase 1's, measured or Eugene's, and a curve
 * invented here would be a number nobody measured wearing a derivation's
 * clothes.
 */
export interface Derived {
  /** how much of the sound arrives as a hit: `ember x (0.80 + 0.20 x spark)` */
  pulse: number;
  /** which band of tempi that pulse belongs in, and the band itself in BPM */
  tempoFamily: TempoFamily;
  tempoRange: readonly [number, number];
  /** whether there is a drum grid at all, and which one */
  drumsOn: boolean;
  kit: Kit;
  /** how wet and how held (Tide) */
  wet: number;
  /** where the spectrum sits (Zephyr) */
  brightness: number;
  /** how much mass is under it (Root) */
  mass: number;
  /** how far the harmony leans off minor (Gleam) */
  modeBias: number;
  /** how fast it changes from bar to bar (Veil) */
  changeRate: number;
  /** how much of the rhythm falls off the beat (Spark) */
  fracture: number;
  /** how long a form it wants (Loom) */
  formLength: number;
}

/** The four bands, and what each is in BPM. PLAN-MAGIC-V2 §2's table. */
const TEMPO_BANDS: ReadonlyArray<{ upTo: number; family: TempoFamily; bpm: readonly [number, number] }> =
  Object.freeze([
    { upTo: 0.15, family: 'unmetered', bpm: Object.freeze([40, 70] as const) },
    { upTo: 0.55, family: 'house', bpm: Object.freeze([95, 115] as const) },
    { upTo: 0.80, family: 'techno', bpm: Object.freeze([120, 140] as const) },
    { upTo: Infinity, family: 'drumAndBass', bpm: Object.freeze([160, 180] as const) },
  ]);

/** Drums are on above this much transient energy; the kit breaks above this much fracture. */
export const DRUMS_ON_ABOVE = 0.18;
const BREAKS_ABOVE = 0.45;

/**
 * **The pulse, and the one number of this file that moved in derive-lite.**
 *
 * PLAN-MAGIC-V2 §2 wrote `ember x (0.35 + 0.65 x spark)`, which ties a high
 * tempo to a broken grid and so, in one outside review's words, *excludes
 * fast straight music*. `notes/diagrams/landscape.md` §2 is where that was measured against
 * the seven authored regions: a four-floor techno needs a pulse in the techno
 * band with spark under `BREAKS_ABOVE`, and under the old weights that took
 * ember >= 0.87, the top of the scale, with nothing left above it for drum and
 * bass. Every authored region but ambient and DnB landed in the *house* band.
 *
 * `0.80 + 0.20 x spark` keeps every threshold and every band exactly where they
 * are, keeps the house in the house band (0.337 against 0.208, both inside
 * 0.15..0.55), and makes the tempo family and the kit **independent**: techno
 * reaches 120-140 four-floor and breaks/garage reaches 120-140 broken. Tempo is
 * energy far more than it is fracture.
 *
 * It is Eugene's to confirm or revert (09-19): until derive-lite nothing
 * shipped read `derive()` at all, so the old weights were never heard, and the
 * check below states what the seven regions derive to under these.
 */
const PULSE_FROM_EMBER = 0.80;
const PULSE_FROM_SPARK = 0.20;

/**
 * **Where Ember's own word turns from steady to driving**, as its value with
 * the other birds at the house (K30): the pulse's house band ends at 0.55, and
 * the pulse is Ember times `0.80 + 0.20 x spark`. The glyph's middle level ends
 * here (`bird-glyph.ts`), so the blaze and DRIVING turn at one value.
 */
export const EMBER_DRIVING_AT: number = TEMPO_BANDS.find((b) => b.family === 'house')!.upTo / (PULSE_FROM_EMBER + PULSE_FROM_SPARK * HOUSE.spark);

/** Once per theme, before the dice. Pure, and it reads nothing but the spell. */
export function derive(spell: Spell): Derived {
  const s = asSpell(spell);
  const pulse = s.ember * (PULSE_FROM_EMBER + PULSE_FROM_SPARK * s.spark);
  const band = TEMPO_BANDS.find((b) => pulse < b.upTo) ?? TEMPO_BANDS[TEMPO_BANDS.length - 1];
  return {
    pulse,
    tempoFamily: band.family,
    tempoRange: band.bpm,
    drumsOn: s.ember > DRUMS_ON_ABOVE,
    kit: s.spark < BREAKS_ABOVE ? 'fourFloor' : 'breaks',
    wet: s.tide,
    brightness: s.zephyr,
    mass: s.root,
    modeBias: s.gleam,
    changeRate: s.veil,
    fracture: s.spark,
    formLength: s.loom,
  };
}

/** What the house itself derives to. Recorded so a change to the table shows. */
export const HOUSE_DERIVED: Readonly<Derived> = Object.freeze(derive(HOUSE as Spell));

/**
 * **A tempo in the family the spell derived**, which is the composer's one
 * question about `tempoFamily`: the room drew a tempo out of its own measured
 * window, and this is where in another family's band that same tempo sits.
 *
 * It is the room's **position in its own band** carried over, not a new draw:
 * the record's 95..105 sits in the low half of the house band's 95..115, so a
 * theme that rolled 103 lands at 128 in techno and 168 in drum and bass rather
 * than at the middle of either. Which band the room's own is, is the band the
 * *house* derives to — `HOUSE_DERIVED.tempoRange` — so this reads a value and
 * never a word.
 *
 * **At the house family it is the identity, as arithmetic and not as a branch.**
 * The two bands are the same pair of numbers, `(hi - lo) / (hi - lo)` is 1 for
 * every band in the table, and `lo + (bpm - lo) * 1` is `bpm` to the bit for the
 * integer the tempo die hands over. Both digests are what check it.
 */
export function tempoInFamily(bpm: number, derived: Derived): number {
  const [lo0, hi0] = HOUSE_DERIVED.tempoRange;
  const [lo1, hi1] = derived.tempoRange;
  const span = hi0 - lo0;
  if (!(span > 0)) return bpm;
  return Math.round(lo1 + ((bpm - lo0) * (hi1 - lo1)) / span);
}

// --- the knobs: a bird moves a voice's own range ------------------------------
//
// PLAN-MODULATION M1. Selection by property was the first step — a bird leans
// the list a die draws a voice out of — and this is the second, over the same
// declared numbers: **the drawn voice is set inside the range it declares.**
// Everything about a knob but this mapping lives in the engine, beside the
// sound it changes (`voices/descriptor.ts`); what lives here is the one curve,
// because the house vector is the composer's and a knob may not know it.

/** One voice's settings, by the property each is a range of. */
export type VoiceKnobs = Record<string, number>;
/** Every seasoned voice of a theme, by the event name the program carries. */
export type KnobSettings = Record<string, VoiceKnobs>;

/**
 * **The one mapping, and it is the same curve on every instrument.**
 *
 *   the house value -> the knob's `default`
 *   0               -> the end the bird's low side asks for
 *   1               -> the end its high side asks for
 *
 * piecewise linear about the house, so a pull reads the same *distance* on
 * every voice however far its own ends happen to sit, and `sense` is which way
 * round the two ends go — Ember pulled up makes an attack shorter, so attack
 * carries `sense: -1` and nothing else in the machine has to know that.
 *
 * **At the house it is the default, exactly.** Both arms are a fraction of
 * nought times a span, and `x + 0 * y` is `x` for every finite double; the
 * branch below is the shape of the curve and not a short circuit round it.
 *
 * The house is not at the middle of 0..1 on any bird — it is the median of the
 * fourteen golden themes — so the two sides are different lengths, which is the
 * point: the record is where it is and not where a scale's midpoint is.
 */
export function knobSetting(spec: KnobSpec, spell: Spell): number {
  const v = spell[spec.bird];
  const house = HOUSE[spec.bird];
  if (!Number.isFinite(v)) return spec.default;
  const far = spec.sense > 0 ? spec.max : spec.min;
  const near = spec.sense > 0 ? spec.min : spec.max;
  if (v >= house) {
    const span = 1 - house;
    return span > 0 ? spec.default + ((v - house) / span) * (far - spec.default) : spec.default;
  }
  const span = house;
  return span > 0 ? spec.default - ((house - v) / span) * (spec.default - near) : spec.default;
}

/**
 * **What taste, rather than the gate, allows** — `notes/diagrams/landscape.md`
 * §4, as fractions of each knob's engine range (0 is `min`, 1 is `max`).
 *
 * Two limits and they are different things: the **engine** range is the ends a
 * gate proved artefact-free and it is the voice's own declaration; the
 * **region** range is narrower and is a judgement about what that music sounds
 * like. A hand may only ever narrow.
 *
 * Deep house is `[0, 1]` on every knob — *the default plus or minus the box* —
 * which is the identity, so **nothing in this table is selected by region yet**
 * and the engine range is what a spell reaches. It is recorded and gated here
 * so the day the ring's centre names a region (`PLAN-MAGIC-V2` phase 2) the
 * numbers are already the sheet's and not a second copy of them.
 */
export const KNOB_TASTE: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>> = Object.freeze({
  ambient: Object.freeze({ hold: [0.70, 1.00] as const, brightnessHz: [0.20, 0.50] as const, attack: [0.50, 1.00] as const }),
  'dub techno': Object.freeze({ hold: [0.60, 0.90] as const, brightnessHz: [0.30, 0.60] as const, attack: [0.20, 0.50] as const }),
  minimal: Object.freeze({ hold: [0.20, 0.50] as const, brightnessHz: [0.30, 0.60] as const, attack: [0.10, 0.30] as const }),
  'deep house': Object.freeze({ hold: [0, 1] as const, brightnessHz: [0, 1] as const, attack: [0, 1] as const }),
  techno: Object.freeze({ hold: [0.20, 0.50] as const, brightnessHz: [0.50, 0.80] as const, attack: [0.00, 0.20] as const }),
  'breaks / garage': Object.freeze({ hold: [0.20, 0.50] as const, brightnessHz: [0.50, 0.80] as const, attack: [0.00, 0.20] as const }),
  'drum and bass': Object.freeze({ hold: [0.10, 0.40] as const, brightnessHz: [0.60, 0.90] as const, attack: [0.00, 0.15] as const }),
});

/** The region a spell is read in until the ring's centre names one. */
export const HOUSE_REGION = 'deep house';

/**
 * One knob narrowed to a region's taste, as a fraction of its own engine range.
 *
 * At `[0, 1]` — which is deep house on all three, and so every knob this round
 * reaches — it hands back **the spec it was given, the same object**, so the
 * mapping above runs on the engine's own numbers and not on a copy of them a
 * tenth of a hertz away. Elsewhere it narrows, never widens, and the default
 * is carried into the narrowed band so a region's own centre is still a number
 * the voice can reach.
 */
export function knobInRegion(name: string, spec: KnobSpec, region: string = HOUSE_REGION): KnobSpec {
  const band = KNOB_TASTE[region] && KNOB_TASTE[region][name];
  if (!band || (band[0] <= 0 && band[1] >= 1)) return spec;
  const span = spec.max - spec.min;
  const min = spec.min + band[0] * span;
  const max = spec.min + band[1] * span;
  return { ...spec, min, max, default: clamp(spec.default, min, max) };
}

// --- the first cross-term: faster drums, lighter bass -------------------------
//
// Eugene, 09-20, on the ember-high card of `notes/reviews/knobs.json`: *"speed-up
// sounds fine; we need a correlation between bass, sub bass and the drums' speed:
// when the drums speed up the bass should get lighter, otherwise it gets muddier
// on faster progressions."*
//
// Everything above this line is a bird moving a knob. This is the first thing
// **the derived state** moves — `derive()` works out a tempo family before the
// dice, and the family leans the bass lane's own knobs down after them — and it
// is why the layer exists at all: the composer asks for a family and a kit and
// never for a bird's name, and a knob is set by a property and never by a name
// a recipe wrote. A cross-term is those two meeting, and it meets them in the
// one place that already owns a knob's value.
//
// The physics is his sentence: `hold` is the fraction of its own note a bass
// sustains, so it already scales with the bar — and that is exactly the problem,
// because at 169 BPM the notes are closer together and the same *fraction* of
// each is more overlap between them. Lighter is shorter.

/**
 * Which region of `notes/diagrams/landscape.md` a derived tempo family leans
 * toward. `unmetered` has no drums to speed up, and the house is the house.
 */
const FAMILY_REGION: Readonly<Record<TempoFamily, string>> = Object.freeze({
  unmetered: 'deep house',
  house: 'deep house',
  techno: 'techno',
  drumAndBass: 'drum and bass',
});

/**
 * **The knobs a tempo family leans, by name.** `hold` is declared by every
 * voice this round reaches; `mass` is M2's and is named here so the rule is
 * whole the day a voice declares one, rather than being half a rule somebody
 * has to remember to finish.
 *
 * A name and not a bird, because the rule is about what the knob *does* — how
 * long the note rings and how much is under it — and those two are what
 * "lighter" means. Nothing else on a bass lane is touched.
 */
export const TEMPO_BASS_KNOBS: readonly string[] = Object.freeze(['hold', 'mass']);

/**
 * **How far a family leans, and it is not a number anybody typed.** It is read
 * off the landscape sheet's own §4 `hold` column, as the distance that column
 * has already travelled from deep house: the sheet puts deep house's hold at
 * `[0, 1]` of the engine range — the identity, the whole range a gate proved
 * clean — techno's ceiling at 0.50 and drum and bass's at 0.40, so the lean is
 * **0 at the house, 0.50 at techno and 0.60 at drum and bass**, and the day
 * somebody narrows a row of that table this follows it.
 *
 * At the house family the two ceilings are the same number and the lean is
 * exactly nought, which is the identity the digests prove.
 */
export function tempoBassLean(derived: Derived | null | undefined): number {
  if (!derived) return 0;
  const here = KNOB_TASTE[FAMILY_REGION[derived.tempoFamily]];
  const home = KNOB_TASTE[HOUSE_REGION];
  if (!here || !home || !here.hold || !home.hold) return 0;
  return clamp(home.hold[1] - here.hold[1], 0, 1);
}

/**
 * One knob's setting, leaned toward its light end.
 *
 * `sense` already says which of a knob's two ends the bird's high side is, so
 * the *light* end is the other one — the short hold, the small mass — and a
 * lean is a fraction of the way from wherever the spell put the setting to
 * there. So a pull on Tide still lengthens the bass at any tempo; what the
 * family changes is where lengthening starts from.
 *
 * **It is the lean that is clamped and not the result**, which is the one thing
 * worth reading twice. A fraction between nought and one puts the answer on the
 * segment between the setting and one of the knob's own declared ends, so it
 * cannot leave the range by any more than the setting already had — and the
 * setting is `knobSetting`'s, which lands a hair *outside* an end at the far
 * wall on some knobs (kick/attack reads 0.0011999999999999997 against a minimum
 * of 0.0012, which is a double and not a fault). Clamping the result would
 * quietly move that hair, and then this would not be the identity at nought.
 *
 * **At the house family this is the identity as arithmetic and not as a
 * branch**: the lean is nought, `set + 0 * (light - set)` is `set` for every
 * finite double, and there is nothing here to short-circuit past.
 */
export function tempoBassSetting(spec: KnobSpec, set: number, lean: number): number {
  const light = spec.sense > 0 ? spec.min : spec.max;
  return set + clamp(lean, 0, 1) * (light - set);
}

/**
 * **The settings a spell asks of the voices a theme actually drew**, by event
 * name — what `generate` puts on the plan and the performance compiler writes
 * onto the notes.
 *
 * A knob at its default is **left out**, and a voice with nothing to say is
 * left out with it. That is what makes the house the record to the byte: at
 * `HOUSE` every bird is at the value every default was measured at, every
 * setting equals its own default, the table is empty, and an empty table is
 * not written at all — so a program compiled with the knobs switched on is the
 * object the record has always hashed. It is the same arithmetic `spellQuery`
 * does when it hands back `null` for the house.
 *
 * `tables` is the knob table of each voice that plays, handed in rather than
 * imported, so this file still knows nothing about the registry.
 */
export function knobsFor(
  spell: Partial<Spell> | null | undefined,
  tables: Record<string, Knobs>,
  region: string = HOUSE_REGION,
  /**
   * The derived state and who is on the bass lane, for the one cross-term above.
   * Absent — which is every caller that is not the composer — nothing leans, and
   * at the house family it leans by nought anyway.
   */
  tempo?: { derived: Derived | null; bass: ReadonlySet<string> } | null,
): KnobSettings {
  const s = asSpell(spell);
  const lean = tempo ? tempoBassLean(tempo.derived) : 0;
  const out: KnobSettings = {};
  for (const [voice, knobs] of Object.entries(tables)) {
    const leans = !!tempo && tempo.bass.has(voice);
    const row: VoiceKnobs = {};
    for (const [name, spec] of Object.entries(knobs)) {
      const narrowed = knobInRegion(name, spec, region);
      const asked = knobSetting(narrowed, s);
      const set = leans && TEMPO_BASS_KNOBS.includes(name)
        ? tempoBassSetting(narrowed, asked, lean)
        : asked;
      if (set !== spec.default && Number.isFinite(set)) row[name] = set;
    }
    if (Object.keys(row).length) out[voice] = row;
  }
  return out;
}

// --- a spell as a value ------------------------------------------------------

/** Fill a partial spell from the house and clamp it into 0..1. */
export function asSpell(partial: Partial<Spell> | null | undefined): Spell {
  const out = /** @type {Spell} */ ({} as Spell);
  for (const b of BIRDS) {
    const v = partial ? partial[b] : undefined;
    out[b] = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : HOUSE[b];
  }
  return out;
}

/**
 * Is this the house vector? By **value**, never by identity: a spell that came
 * off a URL, out of a recipe or over a wire is the house if its eight numbers
 * are the house's eight numbers, and it then costs the identity bias and no
 * arithmetic.
 */
export function isHouse(spell: Partial<Spell> | null | undefined): boolean {
  if (!spell) return true;
  for (const b of BIRDS) if ((spell[b] ?? HOUSE[b]) !== HOUSE[b]) return false;
  return true;
}

/**
 * Are these the same spell? By **value**, like `isHouse`, and with the same
 * reading of what is missing: a bird a spell does not name is at the house, so
 * `null`, `{}` and the house vector written out in full are one spell.
 *
 * It is the identity a hand-over is refused on (`mix.setSpell`): setting the
 * spell a set is already cast under plans nothing, which is what lets a face
 * call it on every release of a cell without keeping a copy to compare against.
 */
export function sameSpell(a: Partial<Spell> | null | undefined, b: Partial<Spell> | null | undefined): boolean {
  for (const bird of BIRDS) if ((a?.[bird] ?? HOUSE[bird]) !== (b?.[bird] ?? HOUSE[bird])) return false;
  return true;
}

/**
 * A spell as a URL asks for one: the birds that are not at the house, in the
 * compass order, each by its two letters since K29, `em:1.00,ti:0.30`. The house itself is `null` — there is
 * nothing to ask for — so a bare address is what a set at the house carries and
 * what releasing every bird puts back (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §4).
 *
 * **Two decimals, and the zeros kept.** A cell is pulled to a hundredth, so a
 * value a hand asked for is written the way a hand would write it — `1.00` and
 * not `1`, `0.30` and not `0.3` — and eight of them line up in a link where a
 * reader can compare them. A value that is *not* a hand's is a value a spell was
 * rolled to, and it goes out in full rather than being quantised: a link is the
 * record, and a record that rounded the music on its way into the address bar
 * would play something else when it was opened.
 *
 * It is `parseSpell`'s other half and round-trips through it exactly.
 */
export function spellQuery(spell: Partial<Spell> | null | undefined): string | null {
  const out: string[] = [];
  for (const bird of BIRDS) {
    const v = spell?.[bird];
    if (typeof v !== 'number' || !Number.isFinite(v) || v === HOUSE[bird]) continue;
    out.push(`${BIRD_CODE[bird]}:${spellNumber(v)}`);
  }
  return out.length ? out.join(',') : null;
}

/**
 * **How a bird's value is written, in one place.** Clamped into 0..1; a
 * hundredth as two decimals with the zeros kept; anything else in full — the
 * shortest decimal that reads back as the same double — and **always in
 * positional notation**, never an exponent. `String(3e-7)` is `"3e-7"`, which
 * `parseSpell` refuses, so a rolled value under a millionth used to write a
 * spell that read back as the house (the reconciled review of 09-24, R104).
 * Nothing is rounded: the digits of the shortest form are moved past the point,
 * so the value that reads back is the value that was written, to the bit.
 */
export function spellNumber(v: number): string {
  const clamped = Math.min(1, Math.max(0, v)) + 0;
  const two = clamped.toFixed(2);
  if (Number(two) === clamped) return two;
  const text = String(clamped);
  const e = /^(\d)(?:\.(\d+))?e-(\d+)$/.exec(text);
  if (!e) return text;
  return `0.${'0'.repeat(Number(e[3]) - 1)}${e[1]}${e[2] ?? ''}`;
}

// --- the bias ----------------------------------------------------------------

/**
 * The multipliers on the draws that are not a list: a chance, a window of BPM,
 * a blend's length, a section's length. Every one of them is **1** at the house
 * and is applied as a multiplication, so the identity is the arithmetic and not
 * a branch.
 */
export interface Ranges {
  /** the chance a theme takes the slower half of the tempo family */
  tempoSlowChance: number;
  /** both ends of whichever half it took */
  tempoBpm: number;
  /** the chance a hand-over is a short blend rather than a long one */
  shortBlendChance: number;
  /** the blend's length in bars, once drawn */
  blendBars: number;
  /** the p25/p75 a section's length is drawn between */
  sectionBars: number;
}

/** What the dice read. One weight per entry of every list the style exposes. */
export interface Bias {
  /** Named authored musical responses; separate from measured candidate weights. */
  controls?: Record<string, number>;
  /** by the style's own list id, parallel to that list, one weight per entry */
  weights: Record<string, number[]>;
  ranges: Ranges;
  /** the spell it was made from, and what that spell derived to */
  spell: Spell;
  derived: Derived;
  /** true when this is the identity: every weight 1, every range 1 */
  house: boolean;
}

const IDENTITY_RANGES: Readonly<Ranges> = Object.freeze({
  tempoSlowChance: 1, tempoBpm: 1, shortBlendChance: 1, blendBars: 1, sectionBars: 1,
});

const ones = (n: number): number[] => new Array(n).fill(1);

function identityWeights(style: Style): Record<string, number[]> {
  const weights: Record<string, number[]> = {};
  for (const row of style.candidates) weights[row.id] = ones(row.list().length);
  return weights;
}

const IDENTITY_CACHE = new WeakMap<Style, Bias>();

/**
 * The signature table a style carries: what the record measured as, list by
 * list and candidate by candidate. `src/styles/deep-house-signatures.json` is
 * the deep house one and `tools/imprint/signatures.ts` rebuilds it.
 */
export interface CandidateSignature {
  /** how many measured themes rolled this candidate */
  n: number;
  /** the mean of the eight birds over those themes, and their spread */
  mean: Spell | null;
  sd: Spell | null;
}

export interface ListSignature {
  die: string;
  /** how many candidates of the list the sweep drew */
  drawn: number;
  /**
   * how many themes the sweep drew them over. On the table on disk, which is
   * a sweep; absent on a signature built out of the per-layer table, which is
   * instruments read alone and not themes at all.
   */
  draws?: number;
  /** the birds whose spread across this list's candidates is at least their
   * spread within them: the only ones that carry any weight here */
  drives: Bird[];
  /** the rest, measured and carrying nothing, which is a result and not a gap */
  silent: Bird[];
  spreads: Record<string, { between: number; within: number; error: number }>;
  candidates: Record<string, CandidateSignature>;
}

export interface RangeFit {
  /** the field of `Derived` this multiplier is a function of */
  derived: 'pulse' | 'wet' | 'brightness' | 'mass' | 'modeBias' | 'changeRate' | 'fracture' | 'formLength';
  /** the bird the measurement stood the derived value up as */
  bird: string;
  /** the outcome's move per unit of that value, by ordinary least squares */
  slope: number;
  r: number;
  n: number;
  meanBird: number;
  meanOutcome: number;
  /** the chance the multiplier multiplies, where the draw is a chance */
  base: number | null;
  /** false where the measurement does not support a slope, and `note` says why */
  wired: boolean;
  note: string | null;
}

export interface Signatures {
  schema: number;
  kind: 'signatures';
  style: string;
  provenance: Record<string, any>;
  centre: Spell;
  /** the kernel's width, per bird: how much that bird varies over the record */
  spread: Spell;
  confidence: Record<string, number>;
  lists: Record<string, ListSignature>;
  ranges: Record<string, RangeFit>;
}

/**
 * How far a weight may travel. **Nothing leaves the pool and nothing owns it**:
 * a candidate at the floor is still drawn one time in a few hundred and a
 * candidate at the ceiling still loses to the rest of a long list. Round A's
 * `pickWeighted` makes a weight of 0 free, and this deliberately never asks for
 * one — a bird is a lean and not a gate, and a phase that empties the catalogue
 * has broken something rather than biased it.
 */
export const WEIGHT_FLOOR = 0.05;
export const WEIGHT_CEILING = 20;

/**
 * How many measured themes a candidate needs before its signature is allowed to
 * move a weight. Under it the candidate draws at 1 — which is `pick` — because
 * a mean of two themes is a rumour. It is the sweep's own floor: the narrowest
 * pool in the catalogue has two entries and a hundred and thirty themes behind
 * it, and the candidates that fall under this are the ones a die reaches twice.
 */
export const MIN_SIGNATURE = 4;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * One candidate's **exponent**: minus half the squared distance from the spell
 * to its measured centre, in units of the kernel's own width, over the birds
 * this list's candidates separate — with the same quantity at the house taken
 * off it.
 *
 *   log w = (1/2) x sum( ((H - mu)/h)^2 - ((s - mu)/h)^2 )
 *
 * which is the Gaussian kernel at the spell over the Gaussian kernel at the
 * house, written as one number so that **at `HOUSE` it is exactly nought**: `s`
 * is `H`, the two squares are the same double, and their difference is nought
 * to the bit. That is the phase-0 property kept — the identity is arithmetic
 * and not a short circuit — and `npm run check` proves it on every candidate of
 * every list by running this path with the house vector in it rather than round
 * it.
 */
function exponentOf(s: Spell, list: ListSignature, key: string, width: Spell): number | null {
  const c = list.candidates[key];
  if (!c || !c.mean || c.n < MIN_SIGNATURE || !list.drives.length) return null;
  let exponent = 0;
  for (const b of list.drives) {
    const h = width[b];
    if (!(h > 0)) continue;
    const dx = (s[b] - c.mean[b]) / h;
    const dh = (HOUSE[b] - c.mean[b]) / h;
    exponent += dh * dh - dx * dx;
  }
  return exponent / 2;
}

/**
 * One list's weights: every candidate's exponent, **centred on the list's own
 * average** and then exponentiated and clamped.
 *
 * The centring is not a renormalisation of the draw — `pickWeighted` reads
 * relative weights and multiplying a whole list by a constant changes nothing
 * it does — and it is what makes the clamp mean what it says. Without it a
 * spell far from every candidate of a list sends every weight of that list to
 * the floor together, the ratios between them are lost in the clamp, and a bird
 * pulled hard stops leaning instead of leaning harder: measured, and it is how
 * this was found. Centred, the clamp limits the **spread** — no candidate more
 * than four hundred times another — which is what "nothing leaves the pool and
 * none dominates" was always about.
 *
 * The centre is weighted by how many themes stand behind each candidate, so a
 * candidate the die reaches twice does not move the list's own average, and a
 * candidate the sweep has too little of draws at that average, which is 1.
 */
function listWeights(s: Spell, list: ListSignature, entries: string[], width: Spell): number[] {
  const exponents = entries.map((k) => exponentOf(s, list, k, width));
  let mass = 0;
  let centre = 0;
  entries.forEach((k, i) => {
    if (exponents[i] === null) return;
    const n = list.candidates[k].n;
    mass += n;
    centre += n * (exponents[i] as number);
  });
  if (!mass) return entries.map(() => 1);
  centre /= mass;
  return exponents.map((e) => (e === null ? 1 : clamp(Math.exp((e as number) - centre), WEIGHT_FLOOR, WEIGHT_CEILING)));
}

// --- the per-layer table, and why a timbre list needs one --------------------
//
// Phase 1's honest finding was that **an imprint taken over a whole mix
// separates the two rooms and nothing else**: Veil and Spark tell sub from
// growl, and no bird separates the lead, pad or stab timbres. That is not a
// gap in the method, it is the method being asked the wrong question — a bird
// is energy over a window and a mix is mostly its drums, so a lead read under
// one is a lead nobody measured.
//
// Rounds K2 and K4 measured the other thing: every playable instrument rendered
// **alone** through the real graph, on a scale of its own
// (`packages/engine/src/voices/signatures.json`, anchors-layer). A strategy
// that carries that table — house-v2 does; house-v1 keeps the whole-mix
// signatures it was measured with, because its record is what those were taken
// off — gets its **timbre** lists weighted off it instead.
//
// The formula is the same formula, which is the point. One candidate's exponent
// is still
//
//   log w = (1/2) x sum over the driving birds of ( ((H - mu)/h)^2 - ((s - mu)/h)^2 )
//
// centred on the list's own average and clamped, with exactly three things read
// from the layer table rather than from the whole-mix one:
//
//   **mu**, the candidate's centre, is the instrument read alone rather than
//   the mean of the themes that happened to roll it.
//   **h**, the kernel's width, is the spread of the whole layer table on that
//   bird — the population's own spread, which is phase 1's measured lesson
//   carried over: a kernel as narrow as one candidate's own reading is a switch
//   and not a lean.
//   **the driving birds** are the ones whose spread *across* this list's
//   candidates is at least their spread *within* them, worked out per list from
//   the rows themselves, exactly as `signatures.ts` works them out from a
//   sweep.
//
// And because it is the same formula, the identity survives it untouched: at
// `HOUSE` every exponent is `dh*dh - dx*dx` with `s` equal to `H`, which is
// nought to the bit whichever table `mu` came out of. The golden proves it.

/** One instrument, read alone, as the composer's side of the engine's table. */
export interface LayerRow {
  instrument: string;
  mean: Spell;
  sd: Spell;
  confidence: Spell;
  /** how many registers it was read in. **Not** a count of themes: see below */
  n: number;
  direct: true;
}

/** The layer table as a style carries it: the rows, and the kernel's width. */
export interface LayerTable {
  kind: 'layer';
  provenance: Record<string, any>;
  spread: Spell;
  rows: Record<string, LayerRow>;
}

/**
 * One list's signature, built out of the layer table rather than out of a
 * sweep. `drives` is worked out here and nowhere else: a bird drives a list
 * when the spread of the candidates' own centres is at least the mean spread
 * inside them, which is the same test `tools/imprint/signatures.ts` applies to
 * a hundred and thirty-one themes, applied instead to readings taken alone.
 */
function layerListSignature(table: LayerTable, entries: string[], die: string): ListSignature | null {
  const rows = entries.map((k) => table.rows[k]).filter(Boolean);
  if (rows.length < 2) return null;
  const drives: Bird[] = [];
  const silent: Bird[] = [];
  const spreads: Record<string, { between: number; within: number; error: number }> = {};
  for (const b of BIRDS) {
    const means = rows.map((r) => r.mean[b]);
    const mean = means.reduce((a, x) => a + x, 0) / means.length;
    const between = Math.sqrt(means.reduce((a, x) => a + (x - mean) * (x - mean), 0) / means.length);
    const within = rows.reduce((a, r) => a + r.sd[b], 0) / rows.length;
    spreads[b] = { between: +between.toFixed(4), within: +within.toFixed(4), error: +within.toFixed(4) };
    (between >= within && between > 0 ? drives : silent).push(b);
  }
  const candidates: Record<string, CandidateSignature> = {};
  for (const k of entries) {
    const r = table.rows[k];
    if (r) candidates[k] = { n: r.n, mean: r.mean, sd: r.sd };
  }
  return { die, drawn: rows.length, drives, silent, spreads, candidates };
}

/**
 * A layer signature is not a sample, so the "a mean of two themes is a rumour"
 * floor does not apply to it: an instrument rendered alone in two registers is
 * the instrument, not two draws of it. `exponentOf` reads `MIN_SIGNATURE`, so
 * the rows are handed to it with an `n` that clears the floor and the real
 * count stays on the row the table keeps. It is stated here rather than
 * branched inside the kernel, because the kernel is the thing that must not
 * grow a special case.
 */
const asSample = (list: ListSignature): ListSignature => ({
  ...list,
  candidates: Object.fromEntries(Object.entries(list.candidates).map(([k, c]) => [k, { ...c, n: Math.max(c.n, MIN_SIGNATURE) }])),
});

/** Built once per style and list, because a table does not change under a page. */
const LAYER_CACHE = new WeakMap<object, Map<string, ListSignature | null>>();

function layerSignature(table: LayerTable, row: { id: string; die: string; list: () => any[] }): ListSignature | null {
  let byList = LAYER_CACHE.get(table);
  if (!byList) { byList = new Map(); LAYER_CACHE.set(table, byList); }
  if (byList.has(row.id)) return byList.get(row.id) as ListSignature | null;
  const built = layerListSignature(table, row.list().map(String), row.die);
  const out = built ? asSample(built) : null;
  byList.set(row.id, out);
  return out;
}

/**
 * The weights the dice read, for every list the style exposes. A list the
 * signatures have nothing to say about — no table, no candidate separated by
 * any bird, or a style with no measurement at all — is every weight 1, which is
 * `pick`, and never an error: a style may grow a list before anybody has
 * rendered a hundred themes of it.
 *
 * A **timbre** or **voice** list of a style that carries a layer table is
 * weighted off that instead: it is the same kernel over a better measurement,
 * and it is the only place the two tables are chosen between. Everything else —
 * the rooms, the densities, the palettes, the roots — stays on the whole-mix
 * signatures, because a room *is* a whole mix and that is what separated them.
 *
 * `voice` joined `timbre` in round K5b, when the drum fixture table gave the
 * four percussion lanes a reading of their own. It is the same sentence twice:
 * a list whose candidates are instruments is a list the per-layer table has a
 * row for, and a list of instruments read *inside a mix* is the measurement
 * phase 1 found says nothing. Which kinds those are is `row.of`, which the
 * catalogue already declares for the gate, so this reads a fact rather than a
 * second list of list names.
 */
const LEANS_ON_LAYERS = new Set(['timbre', 'voice']);

export function measuredWeights(spell: Spell, style: Style): Record<string, number[]> {
  const weights = identityWeights(style);
  const sig: Signatures | undefined = (style as any).signatures;
  const layers: LayerTable | undefined = (style as any).layers;
  if (!sig && !layers) return weights;
  for (const row of style.candidates) {
    if (layers && LEANS_ON_LAYERS.has(row.of)) {
      const built = layerSignature(layers, row);
      if (built) {
        weights[row.id] = listWeights(spell, built, row.list().map(String), layers.spread);
        continue;
      }
    }
    const list = sig && sig.lists[row.id];
    if (!list) continue;
    weights[row.id] = listWeights(spell, list, row.list().map(String), sig!.spread);
  }
  return weights;
}

/**
 * **Which birds lean each list**, by the style's own list id: the birds the
 * weights above are a kernel over, read by the same choice `measuredWeights`
 * makes (the per-layer table for a timbre or voice list, the whole-mix
 * signatures otherwise). It computes nothing a plan reads: the ring draws its
 * influence lines from it (`bird-influence.ts`, round K13).
 */
export function listDrives(style: Style): Record<string, Bird[]> {
  const out: Record<string, Bird[]> = {};
  const sig: Signatures | undefined = (style as any).signatures;
  const layers: LayerTable | undefined = (style as any).layers;
  for (const row of style.candidates) {
    if (layers && LEANS_ON_LAYERS.has(row.of)) {
      const built = layerSignature(layers, row);
      if (built) { out[row.id] = [...built.drives]; continue; }
    }
    const list = sig && sig.lists[row.id];
    out[row.id] = list ? [...list.drives] : [];
  }
  return out;
}

/**
 * How far a multiplier on a continuous draw may travel. A chance is clamped by
 * its own base so the product stays a probability; the tempo is held inside its
 * family, because leaving one is what a derived tempo family is for and is
 * phase 3's; a blend may be a quarter of itself or four times it.
 */
const RANGE_CLAMP: Record<string, readonly [number, number]> = {
  tempoBpm: [0.8, 1.25],
  blendBars: [0.25, 4],
  sectionBars: [0.25, 4],
};

/** The value of `Derived` a range's slope was fitted against. */
const derivedValue = (d: Derived, field: RangeFit['derived']): number => d[field];

/**
 * The multipliers, from the fitted slopes. Each is
 *
 *   1 + slope x (derived - derived at the house) / the outcome's own scale
 *
 * so it is **exactly 1 at the house**, where the bracket is nought and
 * `1 + slope * 0 / x` is `1` for every finite slope. A fit the measurement does
 * not support is not shipped as a small number: `wired` is false on the row,
 * the row says why, and the multiplier stays at 1.
 */
export function measuredRanges(spell: Spell, style: Style): Ranges {
  const sig: Signatures | undefined = (style as any).signatures;
  if (!sig) return IDENTITY_RANGES;
  const d = derive(spell);
  const out: Ranges = { ...IDENTITY_RANGES };
  for (const key of Object.keys(IDENTITY_RANGES) as Array<keyof Ranges>) {
    const fit = sig.ranges[key];
    if (!fit || !fit.wired || !fit.slope) continue;
    const here = derivedValue(d, fit.derived);
    const there = derivedValue(HOUSE_DERIVED as Derived, fit.derived);
    if (!Number.isFinite(here) || !Number.isFinite(there)) continue;
    const delta = here - there;
    // A chance is scaled by the chance itself, so the product stays in 0..1; a
    // window and a length by their own measured mean, so the multiplier is a
    // proportion of what the draw already makes.
    const scale = fit.base != null ? fit.base : fit.meanOutcome;
    if (!(scale > 0)) continue;
    const [lo, hi] = RANGE_CLAMP[key] ?? [0, 1 / (fit.base || 1)];
    const mul = clamp(1 + (fit.slope * delta) / scale, lo, hi);
    if (Number.isFinite(mul)) out[key] = mul;
  }
  return out;
}

/** Evaluate style-declared responses here, the one interpreter of bird names.
 * These authored curves carry no claim about encoded audio readings. */
export function musicalControls(spell: Spell, style: Style): Record<string, number> | undefined {
  const rules = (style as Style & { controls?: Record<string, BirdResponse> }).controls;
  if (!rules) return undefined;
  return Object.fromEntries(Object.entries(rules).map(([name, rule]) => {
    let value = rule.home;
    if (!Number.isFinite(value) || rule.bounds.some(v => !Number.isFinite(v)) || rule.bounds[0] > rule.bounds[1]) throw new Error(`invalid musical response: ${name}`);
    for (const [key, slope] of Object.entries(rule.slopes)) {
      if (!BIRDS.includes(key as Bird) || !Number.isFinite(slope)) throw new Error(`invalid bird response: ${name}.${key}`);
      value += slope * (spell[key as Bird] - HOUSE[key as Bird]);
    }
    return [name, Math.max(rule.bounds[0], Math.min(rule.bounds[1], value))];
  }));
}

/**
 * The bias the dice read.
 *
 * At the house it is the identity — every weight 1, every range 1 — and that is
 * what makes the golden survive a layer above the dice. Off the house every
 * list whose candidates a bird separates leans, by how far the spell sits from
 * each candidate's measured centre, and the five continuous draws shift by
 * their fitted slopes. The separate named component controls come from the
 * style's explicitly authored response table.
 */
export function biasFor(spell: Partial<Spell> | null | undefined, style: Style): Bias {
  if (isHouse(spell)) {
    let cached = IDENTITY_CACHE.get(style);
    if (!cached) {
      const controls = musicalControls(asSpell(HOUSE), style);
      cached = Object.freeze({
        weights: identityWeights(style),
        ranges: IDENTITY_RANGES,
        spell: asSpell(HOUSE),
        derived: HOUSE_DERIVED as Derived,
        house: true,
        ...(controls ? { controls } : {}),
      }) as Bias;
      IDENTITY_CACHE.set(style, cached);
    }
    return cached;
  }

  const s = asSpell(spell);
  const controls = musicalControls(s, style);
  return {
    weights: measuredWeights(s, style),
    ranges: measuredRanges(s, style),
    spell: s,
    derived: derive(s),
    house: false,
    ...(controls ? { controls } : {}),
  };
}

/**
 * The weights for one list, by the id the style gives it. A list the bias has
 * nothing to say about draws at weight 1 — which is `pick` — rather than
 * throwing, so a style may grow a list before this file has an opinion of it.
 */
export function weightsFor(bias: Bias, id: string, length: number): number[] {
  const w = bias.weights[id];
  return w && w.length === length ? w : ones(length);
}

/**
 * One list's weights as a picker `Rng.pickWeighted` reads. Handed the entry and
 * its index in the *original* list, which is what lets a weight of 0 park an
 * entry without moving a seed.
 */
export function pickerFor(bias: Bias, id: string, length: number): (entry: any, i: number) => number {
  const w = weightsFor(bias, id, length);
  return (_entry: any, i: number) => w[i];
}

/**
 * A `{ v, w }` list scaled by the bias, for the dice that draw through
 * `Rng.weighted`. At the identity every `w * 1` is `w` and the entry is handed
 * back unchanged, so the ladder `weighted` walks is the same ladder and the
 * same doubles.
 */
export function scaleWeighted<T extends { v: any; w: number }>(list: T[], bias: Bias, id: string): T[] {
  const w = weightsFor(bias, id, list.length);
  return list.map((entry, i) => (w[i] === 1 ? entry : ({ ...entry, w: entry.w * w[i] } as T)));
}

// --- reachability: a spell off a query string --------------------------------

/**
 * `?spell=em:0.7,ti:0.3` or `?spell=ember:0.7,tide:0.3` — the birds named, by
 * their two letters (what the page writes since K29) or in full (every link
 * written before, and read the same, mixed too), the rest at the house. Any
 * separator a URL survives: commas, semicolons or spaces between the pairs, a
 * colon or an equals sign inside one. A name that is neither a bird nor its
 * code, a number that is not a number, or nothing at all, and the whole thing
 * is `null` rather than a
 * half-read spell, because a spell that is half a listener's is worse than the
 * house.
 *
 * `null` back means *nothing was asked for*; the caller uses the house, which
 * is the same call the golden makes.
 */
export function parseSpell(text: string | null | undefined): Spell | null {
  if (!text) return null;
  const out: Partial<Spell> = {};
  let any = false;
  for (const piece of String(text).split(/[,;\s]+/)) {
    if (!piece) continue;
    const m = /^([a-z]+)[:=](-?\d*\.?\d+)$/i.exec(piece.trim());
    if (!m) return null;
    // a full name or its two letters, either, mixed too (K29)
    const bird = birdOfName(m[1]);
    if (!bird) return null;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) return null;
    out[bird] = v;
    any = true;
  }
  return any ? asSpell(out) : null;
}

/**
 * The composer's own read of the page's query string, beside `readBypass`'s,
 * through the link's table (`src/link.ts`). Nothing in the ring is involved:
 * `createMix` asks for this the way it asks for the bypass, so a bench, a test
 * and a URL all reach a spell the same way.
 */
export function spellFromQuery(search?: string | null): Spell | null {
  return parseSpell(linkRaw('spell', search));
}

/** `?recipe=<id>`: the row a spell is rolled inside, by its library id; `none` and nothing are none. */
export function recipeFromQuery(search?: string | null): string | null {
  const id = linkValue('recipe', search)?.trim();
  return id && id !== 'none' ? id : null;
}

export default HOUSE;
