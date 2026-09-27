// house-v2's candidate lists: the kitchen wired to the dice, and open.
//
// Rounds K5a and K5b of PLAN-KITCHEN. `src/catalogue.ts` is house-v1's, frozen:
// seven lead timbres, two pad partners, five stab partners, two rooms and the
// mined mask tables, which is the catalogue the cookbook review called *three
// ingredients*. This file is the same shape with the whole kitchen in it —
// fifty-two voices and twenty-six effects.
//
// **K5a wired every one of them at weight nought and K5b opens them**, which is
// the first deliberate move of the golden and is why house-v2's digests are no
// longer house-v1's. house-v1's own lists are untouched, entry for entry and
// weight for weight, and stand at the **head** of every list below: the
// record's own instruments keep exactly the weight the reference sets measured
// them at, and what the kitchen adds is added behind them.
//
// Appended, and never interleaved, for a reason that survives the opening:
// `Rng.pickWeighted` drops a zero-weight entry *before* it draws, proved
// bit-identical to `pick` on every boundary value in round A, and `Rng.weighted`
// can only ever return an entry of weight nought at the **head** of its ladder,
// because `r` is strictly under the total and the last positive entry always
// catches it. So an entry the ceiling drops back to nought is not in the
// running, is not counted in any denominator, and cannot catch a boundary,
// wherever else in the list it stands.
//
// ## Where the membership comes from
//
// **From the descriptors and from nowhere else.** A voice enters every list
// whose role it declares (`descriptor.roles`, the closed vocabulary in
// `packages/engine/src/voices/descriptor.ts`), and a harmonic timbre enters the
// lead, pad-partner and stab-partner lists by the role the voice that makes it
// declares. Nothing below is a hand-written list of instruments except the
// **incumbents** — the voices the record already plays in each lane, which have
// to be named because "what v1 plays" is a fact about the record and not a
// property any descriptor states.
//
// ## Where the weights come from (K5b)
//
// Eugene's kitchen review of 09-18 (`notes/reviews/kitchen.json`, 48 of 74
// answered) said *identity* yes to everything, *artefacts* clean to everything
// but the ladder, and mostly skipped placement — "it was a guess, I'm not that
// pro". So K5b could not be filled from his fit answers, and it is filled **by
// rule** instead, with his ear on three reference seeds as the gate. The rule,
// once, and `OPENING_SHARE`, `FLAGGED` and `admit` below are it as data:
//
//   1. **Membership** by role and family, off the descriptors (above).
//   2. **The opening weight**: a new voice opens at **one third of the mean
//      weight of the entries its list already has**, a new treatment at **half
//      the mean of the rota**. A third keeps the record's own instruments the
//      likely draw — house-v2 is recognisably house with more to choose
//      between, not a different record — and a half is a rota that is a rota:
//      a treatment is heard for eight or sixteen bars and a new one wants to
//      turn up often enough to be judged.
//   3. **Exclusions**: anything in `FLAGGED` opens at nought whatever the rule
//      says, with the reason and the date beside it.
//   4. **The ceiling** last, and it is where the round actually bites. See
//      `admit` below: the cast is free and the chain is not.
//
// Every entry below therefore carries what happened to it. An incumbent is
// `{ v, w }` and nothing else. A newcomer the rule opened is `{ v, w, opened }`,
// where `opened` is the number rule 2 made and `w` is what the dice read — the
// same number, until something takes it away. A newcomer something took it away
// from is `{ v, w: 0, opened, dropped }`, and `dropped` says which rule did it,
// why, and what it costs, so a weight of nought is never a silence.

import { REGISTRY } from '@deep-house/engine/voices';
import type { Descriptor, VoiceRole } from '@deep-house/engine/voices';
import { REGISTRY as EFFECTS, costOf } from '@deep-house/engine/effects';
import { STAGE_HARMONIC } from './performance.ts';
import {
  ROOMS, VOICING_STYLES, FX_PALETTES, DENSITY_LABEL, MASK_TABLES, SIXTEENTH_MASKS, candidateLists,
} from './catalogue.ts';
import type { CatalogueLists, MaskRow } from './catalogue.ts';
import type { BreakRow } from './patterns.ts';
import type { Weighted, CandidateList } from '@deep-house/engine/style';
import type { LayerRow, LayerTable } from './spell.ts';

export { ROOMS, VOICING_STYLES, FX_PALETTES, DENSITY_LABEL, MASK_TABLES, SIXTEENTH_MASKS };

/** Which rule took a weight away, why, and what it costs where it is a price. */
export interface Dropped {
  by: string;
  why: string;
  units?: number;
}

/**
 * One entry of a widened list.
 *
 * `w` is what the dice read and is the only field any die looks at. `opened` is
 * what rule 2 made of this newcomer, and it stays on the row after the weight
 * has been taken away so the arithmetic can be read back. `dropped` is the rule
 * that took it away and what it costs. An incumbent carries neither: it is not
 * a newcomer and rule 2 has nothing to say about it.
 */
export interface Entry {
  v: string;
  w: number;
  opened?: number;
  dropped?: Readonly<Dropped>;
}

// --- the rule, as numbers ----------------------------------------------------

/**
 * Rule 2. A new voice opens at a third of the mean weight its list already
 * carries; a new treatment at half the mean of the rota. Both are stated here
 * and read by `openingWeight` below, so the two places the rule is written are
 * this constant and the sentence over it.
 */
export const OPENING_SHARE = { voice: 1 / 3, treatment: 1 / 2 };

/**
 * Rule 3. What an ear has ruled out, with the reason. A row here opens at
 * nought however good the arithmetic looks, and it leaves when the fault named
 * is found and fixed — which is a commit that deletes a line from this list and
 * says why.
 *
 * It stood empty from K5b to the music review of 09-19: the kitchen review of
 * 09-18 produced exactly one exclusion — `ladder`, the only *bad* in
 * seventy-four auditions — and `bb83f04` found what it was (an asymmetric
 * shaping curve leaving -23 dBFS of DC riding the envelope), so the ladder
 * took the rule's own weight with a remark against it. The six percussion reservations are the
 * other kind of exclusion, `reserved` rather than *bad*: instruments with
 * nothing wrong in them that this record's percussion lanes are not the place
 * for, on his ear and on a measurement, kept for the strategy that is. Five
 * landed with the music review of 09-19 and the sixth, the woodblock, with
 * Eugene's listen of the morning after it.
 */
export const FLAGGED: ReadonlyArray<{ id: string; kind: string; why: string; since: string }> = Object.freeze([
  // The focus-companion review, 09-21: this sound returned in the incoming
  // theme of seed 543831854 after a pleasing first-theme excerpt. Each chord
  // note schedules its own fast internal chord cycle. Reserve the voice in
  // every v2 harmonic selection path, not only in the reference recipe.
  //
  // **The electric piano, retired 09-22 and restored the same day.** The
  // composer fix round put `ep` here (`02c457d`) to delete the sampler's one
  // condition on a timbre's name, reading the focus review's rejection of its
  // short stab as a retirement. Eugene, after listening: "the electric piano
  // is a good sound and I didn't intend to retire it"; what he had asked to be
  // removed was the accordion-like fast riff, and that was this pad (below;
  // the round note of 09-22 on the electric piano). So `ep` is off the list and back
  // at the record's own weight on the lead and stab lists; the ringing keys
  // stay an ordinary figure variant beside it.
  { id: 'grainPad', kind: 'reserved', since: '2026-09-21',
    why: 'the recurring accordion-like sound rejected in the listening pilot and the following theme: each sustained chord note cycles [0, 7, 12, 3, 19] at 35 ms intervals, introducing rapid internal pitch movement into the focus companion; reserved from the v2 palette until its musical use is separately reviewed' },
  // **The music review of 09-19: the metal on the record's percussion lanes,
  // reserved for a breaks recipe.** Eugene heard the kitchen's hats as
  // "very metallic", "out of balance", "too pronounced" on six of thirteen
  // cards (`notes/reviews/k6.json`, `mined.json`), and every candidate of the
  // four lanes was then rendered alone on its lane against the incumbent on
  // the record's own figure (`tools/imprint/lane-trim.ts`,
  // `styles/deep-house-v2-lane-trims.json`). A level can be trimmed and is,
  // below; a spectrum cannot, and these five are the ones whose character and
  // not their level is what he named. They stay registered, measured and
  // reachable by a strategy that wants them — a breaks recipe is where a ride
  // and a sizzle belong (PLAN-DAY steps 2 and 4) — and leave this list the day
  // one names them. **A woodblock is the same kind of instrument on the same
  // kind of lane**, and it joined them on 09-20; its row is at the end.
  { id: 'ride', kind: 'reserved', since: '2026-09-19',
    why: 'on the closed offbeat lane 13.9 dB louder than the record\'s closed hat on the same figure, and his "hi-hat or cymbals out of balance" (92970) and "out of balance and style" (47814) were both a ride on that lane; a ride is a breaks and techno colour and not this record\'s offbeat' },
  { id: 'hatSizzle', kind: 'reserved', since: '2026-09-19',
    why: 'on the closed offbeat lane 4.6 dB louder than the record\'s closed hat and 13.9 dB more 4-12 kHz over 400 Hz-2 kHz (19.6 dB on the open lane); his "very metallic sound hi-hat" (21323) was this voice on that lane, and the outside review\'s +7.7 dB high/mid on the same seed is the same hat' },
  { id: 'tambourine', kind: 'reserved', since: '2026-09-19',
    why: 'on the sixteenth lane level with the shaker and 11.4 dB brighter above 4 kHz: metal jingles on the record\'s shaker figure, the same character his three hat notes name' },
  { id: 'cowbell', kind: 'reserved', since: '2026-09-19',
    why: 'his "some touch-up sounds out of stylistic coherence, I guess the cowbell, just too noticeable" (67#1); measured 1.9 dB under the shaker and dark, so it is the pitched bell on a sixteenth lane and not its level' },
  { id: 'crash', kind: 'reserved', since: '2026-09-19',
    why: 'a cymbal on the section glue, on the card whose note was "hi-hat or cymbals" (92970: the crash on the impact); the glue lanes fire at a boundary and are not measured by the lane trim, so it is reserved on his ear alone until they are' },
  // **The woodblock, reserved 09-20 and released 09-22.** On the morning of
  // 09-20 he named one fault on three sessions — "a faint repetitive click
  // like knocking an empty plastic box", "probably a woodblock — tune it to
  // fit the mix ... now it reads as a clip (bug) rather than a feature" — and
  // it was reserved here on the measurement in `shape` of
  // `styles/deep-house-v2-lane-trims.json`: a tuned mid resonator (88.9-89.7 %
  // in 400 Hz-2 kHz, 49.1-56.8 % in the 1250 Hz band alone, the lane's highest
  // crest) given a +6.1 dB LUFS-matched trim on a lane whose part is air.
  //
  // On 09-22 Eugene rolled that reservation back: he had asked for more
  // percussion, and the percussion development's palette had already
  // re-admitted it at a third of the shaker. "If I hear it out of line we
  // correct its sound, not remove it as a class." So it is off this list, the
  // list is binding again (a side table may not draw a flagged id, which
  // `rhythmDevelopmentProblems` now refuses), and it opens on the sixteenth
  // lane at rule 2's weight with its measured trim. The measurement stays in
  // `tools/check.ts` as the brief for correcting its sound.
]);

const FLAGGED_IDS = new Set<string>(FLAGGED.map((f) => String(f.id)));

/** The mean weight of what a list already holds, which is rule 2's denominator. */
const meanWeight = (entries: readonly { w: number }[]): number =>
  entries.length ? entries.reduce((s, e) => s + e.w, 0) / entries.length : 1;

/**
 * What rule 2 opens one newcomer at, to two decimals, or nought when rule 3
 * has already spoken. Two decimals because a weight is a ratio between entries
 * and nobody is going to argue about the third one.
 */
function openingWeight(id: string, incumbents: readonly { w: number }[], kind: 'voice' | 'treatment'): number {
  if (FLAGGED_IDS.has(id)) return 0;
  return +(meanWeight(incumbents) * OPENING_SHARE[kind]).toFixed(2);
}

/**
 * One list, widened. The incumbents come through at exactly the weight they
 * have — their entries are the same numbers and, for the weighted lists, the
 * same order — and every newcomer is appended at `w: 0` with rule 2's opening
 * weight beside it.
 *
 * Appended, and never interleaved: the order of a list is what the golden
 * digest hashes, and while a zero-weight entry is free wherever it stands,
 * `Rng.weighted` hands the very front of its ladder to a weight of nought. The
 * rule is simpler than the exception, so the kitchen goes on the end.
 * @param dropped rule 4's answer for this newcomer, or null when nothing took
 *   it away
 */
function widen(
  incumbents: readonly { v: string; w: number }[],
  newcomers: readonly string[],
  kind: 'voice' | 'treatment',
  dropped: (id: string) => Dropped | null = () => null
): readonly Entry[] {
  const have = new Set(incumbents.map((e) => e.v));
  // An incumbent the ear has since ruled out keeps its place in the list (the
  // order is what the golden hashes) at nought, with the rule on the row.
  // Rule 2's denominator is still the record's own weights.
  const out: Entry[] = incumbents.map((e) => (FLAGGED_IDS.has(e.v)
    ? { v: e.v, w: 0, dropped: Object.freeze({ by: 'rule 3', why: reasonFlagged(e.v) }) } : { ...e }));
  for (const v of newcomers) {
    if (have.has(v)) continue;
    const opened = openingWeight(v, incumbents, kind);
    const off = opened > 0 ? dropped(v) : { by: 'rule 3', why: reasonFlagged(v) };
    out.push(off ? { v, w: 0, opened, dropped: Object.freeze(off) } : { v, w: opened, opened });
  }
  return Object.freeze(out.map((e) => Object.freeze(e)));
}

/** Why rule 3 said no, in the words the flag itself carries. */
const reasonFlagged = (id: string): string =>
  ((FLAGGED.find((f) => f.id === id) || {}) as { why?: string }).why || 'flagged';

// --- what the registry says an instrument can do -----------------------------

/** The voice that makes a timbre: the one whose own table holds it, or its alias. */
const voiceOfTimbre = (t: string): Descriptor | undefined =>
  REGISTRY.find((d) => t in d.timbres) || REGISTRY.find((d) => d.dispatches.includes(t));

/** Every timbre in the registry whose voice declares one of these roles, in registry order. */
function timbresByRole(...roles: VoiceRole[]): string[] {
  const out: string[] = [];
  for (const d of REGISTRY) {
    if (!roles.some((r) => d.roles.includes(r))) continue;
    // The harmonic half only: a drum's "timbre" is the name of a drum and a
    // lead list that could draw a cowbell is a lead list nobody meant.
    if (d.family !== 'keyboard' && d.family !== 'ensemble') continue;
    for (const t of Object.keys(d.timbres)) if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Every registered voice that declares a role, in registry order. */
const voicesByRole = (role: VoiceRole): string[] =>
  REGISTRY.filter((d) => d.roles.includes(role)).map((d) => d.name);

// --- the lanes the record already plays --------------------------------------

/**
 * Which voice fills each lane in v1, and so which entries of the lists below
 * are incumbents at weight 1. It is written out because it is a fact about the
 * *record* and not a property of any instrument: a descriptor says a snare can
 * play a backbeat, and only the record can say that the thing playing the
 * backbeat today is the clap.
 *
 * The four are the percussion roles PLAN-KITCHEN §3 names. The kick and the
 * bassline have kitchen alternatives too (`kickLong`, `kickPunch`; `subSoft`,
 * `subTri`, `pluckBass`) and are deliberately not lists yet: a kick is not
 * drawn in this record — every theme has the one — and making it a draw is a
 * composition change of its own rather than a wider list.
 */
const INCUMBENTS = Object.freeze({
  backbeat: ['clap'],
  offbeat: ['hatClosed', 'hatOpen'],
  sixteenth: ['shaker'],
  texture: ['riser', 'sweepDown', 'swell', 'impact'],
} satisfies Partial<Record<VoiceRole, string[]>>);

/** One percussion role's list: the incumbents at 1, the kitchen behind them at 0. */
function roleList(role: keyof typeof INCUMBENTS): readonly Entry[] {
  const incumbents = INCUMBENTS[role].map((v) => ({ v, w: 1 }));
  return widen(incumbents, voicesByRole(role), 'voice');
}

// --- the widened harmonic lists ----------------------------------------------
//
// Named by reference into the style's own table in v1, because the weights
// there are a measurement of the reference sets. They are named by reference
// here too — `LEAD_TIMBRES` below is handed v1's list and widens it — so the
// mined weights stay where their provenance is and this file adds only what the
// kitchen brought.

/** Every timbre a theme's lead may be, whichever role it leads from. */
export const leadTimbresV2 = (v1: readonly Weighted<string>[]): readonly Entry[] =>
  widen(v1, timbresByRole('figure', 'melody', 'sustained'), 'voice');

/**
 * Which of those lead from the sustained role. A **membership test** and not a
 * draw, so there is no weight to put at nought: a timbre in here is one whose
 * lead holds the chord instead of striking it. Appending is free for exactly
 * as long as no new lead timbre can be drawn, which at weight nought is now,
 * and K5b inherits the list rather than a column.
 */
export const sustainedLeadsV2 = (v1: readonly string[]): readonly string[] =>
  Object.freeze([...v1, ...timbresByRole('sustained').filter((t) => !v1.includes(t))]);

/** What may hold under a lead stab. Every sustained timbre the kitchen makes. */
export const padPartnersV2 = (v1: readonly Weighted<string>[]): readonly Entry[] =>
  widen(v1, timbresByRole('sustained'), 'voice');

/** What may strike over a lead pad. Every figure the kitchen makes. */
export const stabPartnersV2 = (v1: readonly Weighted<string>[]): readonly Entry[] =>
  widen(v1, timbresByRole('figure', 'melody'), 'voice');

// --- the drum lanes ----------------------------------------------------------

/** The backbeat: the clap the record plays, and the snares and rims behind it. */
export const BACKBEAT_VOICES = roleList('backbeat');
/** The offbeat: both hats, and the tight, loose, sizzle and ride behind them. */
export const OFFBEAT_VOICES = roleList('offbeat');
/** The sixteenths: the shaker, and the congas, toms and small percussion behind it. */
export const SIXTEENTH_VOICES = roleList('sixteenth');
/** The glue: the four the record uses, and the crash, the vinyl bed and the up-sweep. */
export const TEXTURE_VOICES = roleList('texture');

// --- the rota ----------------------------------------------------------------

/**
 * One entry of the stage's rota, as data rather than as a word.
 *
 * `kind` is round K1 §6's line, which is the one that makes this table
 * possible: **what the desk does is a gesture, what the desk has on it is an
 * effect.** A `gesture` moves parameters that already exist — the voice's own
 * filter, the delay send, the pad's bar off — and costs a strategy nothing it
 * was not already paying. An `effect` is an instance out of
 * `packages/engine/src/effects/`, which costs what its descriptor says it
 * costs, and every one of them is at weight nought here.
 *
 * `over` names what a gesture writes to, so the six the stage runs today can be
 * read against the kitchen they will be built out of.
 */
export interface RotaEntry extends Entry {
  kind: 'gesture' | 'effect';
  over?: string[];
  family?: string;
}

/**
 * The six the stage runs today, at the weight it runs them at — which is **1
 * each**, because `rota()` in `src/performance.ts` draws with
 * `pool[r.int(0, pool.length)]`, a uniform pick over whatever it is allowed.
 * The `over` column is round K1 §6's map, verbatim.
 */
const INCUMBENT_ROTA: readonly RotaEntry[] = ([
  { v: 'hpRise', w: 1, kind: 'gesture', over: ['filter'] },
  { v: 'lpClose', w: 1, kind: 'gesture', over: ['filter'] },
  { v: 'phaser', w: 1, kind: 'gesture', over: ['phaser'] },
  { v: 'breath', w: 1, kind: 'gesture', over: ['filter', 'width'] },
  { v: 'throw', w: 1, kind: 'gesture', over: ['tapeDelay'] },
  { v: 'hole', w: 1, kind: 'gesture', over: [] },
] satisfies RotaEntry[]).map((e) => Object.freeze(e));

// --- rule 4, the ceiling -----------------------------------------------------
//
// Round K5a's own finding, and the one number K5b had to answer: **the chain
// and not the cast is what the ceiling constrains.** Every voice the kitchen
// adds fits in a lane whose dearest candidate the record already pays for, so
// opening all fifty-two of them costs nothing at all; opening all twenty-six
// effect instances costs 64 units built at once or 16 one per treated lane,
// against a ceiling of 220 that the record already sits 5 under.
//
// **The ceiling stays at 220** — Eugene's decision of 09-18, and it is his
// listeners' phones and not an arithmetic preference. What K5b resolves is the
// other half of K5a's question, and it is resolved by stating what the stage
// actually builds rather than by moving the number:
//
//   **At most one treatment instance per treated lane at a time.** The rota
//   draws *one* kind for a segment of eight or sixteen bars, per lane, which is
//   what `rota()` in `src/performance.ts` has done since v1 — so the worst case
//   is not twenty-six instances standing up together, it is the **dearest
//   admitted instance, on each treated lane**. There are two treated lanes, the
//   pad and the keys, and `STAGE_HARMONIC` is where that is said.
//
// Then the newcomers are admitted in order of the weight rule 2 opened them at,
// dearest-dropped first where that ties — which it does, because rule 2 opens
// every treatment at the same half — until the worst case fits. That is the
// whole of rule 4, and what it lets through is decided by arithmetic below and
// not by a list anybody typed.
//
// What it lets through, and the honest edge: the seventeen **cheap** effects
// come to 1 unit each, so two lanes of the dearest of them is 2 and the
// strategy is 217. The first **mid** effect is 3 units, two lanes of it is 6,
// and the strategy is **221 against 220** — the mid band misses by a single
// unit, and with it go the tape delay and the chorus, which are as deep house
// as an effect gets. That is not a rounding to be shrugged off; it is the
// ceiling saying exactly what it is for, and the nine it drops are listed with
// what each would cost (`DROPPED_FOR_COST`) so the trade can be made on
// purpose: one dear reverb instead of nine cheap ones, or a phone measured
// instead of assumed.

/** STATED, with the band it came from: round K4 read 216–223 on this machine at
 * `--phone 4 --headroom 1.5` and round K5a's run read 227. `tools/check.ts`
 * carries the same number and `packages/engine/tools/budget.ts` measures it. */
export const CEILING = 220;

/** MEASURED (`budget.ts --lanes`): the record's own cast, which is the dearest
 * live candidate of every lane the arrangement gates. It is identical under
 * both strategies because every lane's dearest is the voice the record already
 * plays — the ride is mid where the hats are mid, the snare and the rim are
 * cheap where the clap is mid, the whole sixteenth kitchen is mid under a dear
 * shaker. `tools/check.ts` proves it rather than trusting this line. */
export const CAST_UNITS = 215;

/** How many lanes the stage treats at once: the harmonic two, off the stage's
 * own list and not off a number written here. */
export const TREATED_LANES = STAGE_HARMONIC.length;

/**
 * Rule 4, applied. Which newcomers the ceiling admits, and what it costs to
 * drop each of the rest.
 */
function admitUnderCeiling(
  newcomers: readonly { id: string; opened: number }[]
): { admitted: Set<string>; dropped: Map<string, Dropped & { units: number }> } {
  // Dearest dropped first where the opened weight ties, which is every tie
  // here: what is being rationed is time on the audio thread, so the tie-break
  // is the thing being rationed.
  const order = [...newcomers].sort((a, b) => b.opened - a.opened || costOf([a.id]) - costOf([b.id]));
  const admitted = new Set<string>();
  const dropped = new Map<string, Dropped & { units: number }>();
  let dearest = 0;
  for (const e of order) {
    const units = costOf([e.id]);
    const worst = Math.max(dearest, units);
    if (CAST_UNITS + worst * TREATED_LANES > CEILING) {
      dropped.set(e.id, {
        by: 'rule 4',
        why: `${units} units on each of ${TREATED_LANES} treated lanes is ${CAST_UNITS + units * TREATED_LANES} against a ceiling of ${CEILING}`,
        units,
      });
      continue;
    }
    dearest = worst;
    admitted.add(e.id);
  }
  return { admitted, dropped };
}

const OPENED_ROTA = EFFECTS.map((d) => ({ id: `fx:${d.id}`, opened: openingWeight(d.id, INCUMBENT_ROTA, 'treatment') }));
const CEILING_SAYS = admitUnderCeiling(OPENED_ROTA.filter((e) => e.opened > 0).map((e) => ({ id: e.id.slice(3), opened: e.opened })));

/**
 * The instances rule 4 would not let in, with what each of them costs. It is
 * exported so the round's write-up and Eugene's next decision are reading the
 * arithmetic and not a paragraph about it.
 */
export const DROPPED_FOR_COST: ReadonlyArray<{ id: string; units: number; why: string }> = Object.freeze([...CEILING_SAYS.dropped.entries()]
  .map(([id, d]) => Object.freeze({ id: `fx:${id}`, units: d.units, why: d.why }))
  .sort((a, b) => b.units - a.units || a.id.localeCompare(b.id)));

/**
 * The rota, widened with one instance of every registered effect, by family, in
 * the registry's own order. The six gestures keep their weight; every instance
 * rule 2 opened and rule 4 admitted stands at that weight, and the rest stand
 * at nought with the reason and the cost on the row.
 *
 * An instance is named `fx:<id>` and not `<id>`, so a rota entry can never be
 * confused with the gesture of the same name: `phaser` is the gesture the stage
 * has run since v1 and `fx:phaser` is an instance of the effect out of the
 * kitchen, and the day the gesture is rebuilt on the instance, one of the two
 * leaves this list in a commit that says so.
 */
export const TREATMENT_ROTA: readonly RotaEntry[] = Object.freeze([
  ...INCUMBENT_ROTA,
  ...EFFECTS.map((d) => {
    const opened = openingWeight(d.id, INCUMBENT_ROTA, 'treatment');
    const off = opened > 0
      ? CEILING_SAYS.dropped.get(d.id) || null
      : { by: 'rule 3', why: reasonFlagged(d.id) };
    return Object.freeze({
      v: `fx:${d.id}`,
      w: off ? 0 : opened,
      opened,
      ...(off ? { dropped: Object.freeze(off) } : {}),
      kind: 'effect',
      family: d.family,
    }) as RotaEntry;
  }),
]);

/** The entries a die can actually reach: weight above nought, in list order. */
export const liveOf = (list: readonly { v: string; w: number }[]): string[] =>
  list.filter((e) => e.w > 0).map((e) => String(e.v));

// --- the broken kit ----------------------------------------------------------
//
// Derive-lite. `derive().kit` is `breaks` above spark 0.45, and until this round
// the word reached nothing: PLAN-MAGIC-V2 §6 put *break patterns* second on its
// honest list — "the mask tables are mined deep house figures; there is no
// breakbeat vocabulary" — and named the two halves of the fix, a small table of
// classic breaks and a kit whose snare is not the clap. Both are here, and both
// are **authored**, which is rule 3 of that plan said out loud: deep house is
// the only region this project has measured, a breakbeat corpus does not exist,
// and these five rows are production convention written down rather than a
// measurement wearing a mined table's clothes. The day a breaks corpus is mined
// they are replaced by it and this comment is the receipt.
//
// A row is two masks of sixteen, a bass budget and a weight. `m` is the
// **kick's** — the mask field every other table of this catalogue carries, so
// the gate reads a row of this table the way it reads a mined one — `s` is the
// **snare's**, and `b` is how many notes of bass the break leaves room for.
//
// None of them is a transcription. "Amen-shaped" is the shape of that break's
// kick conversation at sixteenth resolution, not the Amen; the distinction
// matters because the one is convention and the other is somebody's record.
//
// **Thinned 09-20, on Eugene's ear and on a count.** The first cut of this
// table put its accents in the snare — two hits and two ghosts on four of the
// five rows — on the theory that *a break is a backbeat with a conversation
// underneath it*. He heard the two cards it plays and said what it actually is:
// "I definitely hear the structure change, but as a music piece this is too
// complex and hardly listenable" (spark-high) and "same, just faster; I hear
// the change, but no musical value in this particular clip" (dnb). The count
// agrees and is the reason this is a thinning and not a taste: over twenty
// broken themes a break was laying **10.97 events a bar on the drum lanes
// against the four on the floor's 8.87** — the figure that is supposed to open
// a groove up was the denser of the two, and the bass had nothing to speak in.
//
// So: the kick in two or three places and never four, **the snare on the
// backbeat only**, the sixteenth lane off under a break (`generator.ts`), and a
// bass budget on the row. The five shapes are still five shapes and they are
// told apart by the **kick** now, which is where a break's identity actually
// lives; the ghosts are still a word this table can say and the day a corpus
// says where they go, they come back off a measurement instead of a theory.

export const BREAK_MASKS: readonly BreakRow[] = Object.freeze([
  // The two-step, and the plainest of them: the kick leaves the third beat
  // alone and lands late on it, the snare keeps two and four. A pump under it.
  Object.freeze({ name: 'two-step', m: 'x.........x.....', s: '....x.......x...', b: 2, c: 30 }),
  // The garage swing: the kick skips — off the beat before three and late on to
  // it — and that skip is the whole row. A pump.
  Object.freeze({ name: 'garage swing', m: 'x......x..x.....', s: '....x.......x...', b: 2, c: 22 }),
  // Half-time: one snare in the bar, on three, and the whole bar reads at half
  // the tempo it is counted at. It is the one row that is a tempo decision
  // rather than a figure, and it is how a fast band can still be heavy. One
  // note of bass: half-time is the row with the most air in it and a pedal is
  // what that air is for.
  Object.freeze({ name: 'half-time', m: 'x.....x.........', s: '........x.......', b: 1, c: 18 }),
  // Amen-shaped: the kick doubles on the first beat and answers late. A pump.
  Object.freeze({ name: 'amen-shaped', m: 'x.x.......x.....', s: '....x.......x...', b: 2, c: 18 }),
  // Funky-shaped: the sixteenth one — a pickup a sixteenth after the downbeat
  // and a late answer before the fourth beat. It is the busiest kick of the
  // five, so it takes the pedal.
  Object.freeze({ name: 'funky-shaped', m: 'x..x.......x....', s: '....x.......x...', b: 1, c: 12 }),
]);

/**
 * **Who plays the backbeat when the kit is broken.** PLAN-MAGIC-V2 §6's own
 * words: *a kit whose snare is not the clap*. It is a list of one, exactly as
 * every lane of the record is a list of one, because the kitchen has one snare
 * and the rim is a different part rather than a quieter snare; the day a breaks
 * corpus says which of the two a garage tune uses, it widens by the same rule
 * every other list here widened by.
 *
 * The snare is not an incumbent of anything — it plays no part in the record —
 * so it carries no `opened`: rule 2 opens a newcomer *into a list the record
 * already draws*, and this is a list the record never draws at all.
 */
export const BREAKS_BACKBEAT_VOICES: readonly Entry[] = Object.freeze([
  Object.freeze({ v: 'snare', w: 1 }),
]);

// --- the gate's walk ---------------------------------------------------------
//
// One row per list, the same shape `src/catalogue.ts`'s `candidateLists` has,
// with two kinds of candidate it did not need: `voice`, which has to be a name
// in the registry, and `effect`, which is either a gesture the style's own
// `stage.treatment` table knows or an `fx:` instance of a registered effect.

/**
 * house-v1's lists, and the six house-v2 adds: the four percussion lanes, the
 * sixteenth lane's own mined figures, and the rota the stage draws from.
 */
export interface CatalogueListsV2 extends CatalogueLists {
  sixteenthMasks: readonly MaskRow[];
  backbeatVoices: readonly Entry[];
  offbeatVoices: readonly Entry[];
  sixteenthVoices: readonly Entry[];
  textureVoices: readonly Entry[];
  treatmentRota: readonly RotaEntry[];
  /** derive-lite's two: the authored breaks, and who plays their backbeat */
  breakMasks: readonly BreakRow[];
  breaksBackbeatVoices: readonly Entry[];
  /** PLAN-MOTIF T1's two: which register states the theme, and which family it is */
  motifRegisters: readonly Weighted<string>[];
  motifFamilies: readonly Weighted<string>[];
  motifChance: number;
}

/** The v1 rows whose lists house-v2 widens. */
const WIDENED = new Set(['leadTimbres', 'sustainedLeads', 'padPartners', 'stabPartners']);

/** @param c a style's assembled `catalogue` */
export function candidateListsV2(c: CatalogueListsV2): CandidateList[] {
  return [
    // house-v1's fifteen rows as `candidateLists` writes them, the four whose
    // lists this file widens saying so: one table and not a copy of it with
    // four words changed (round (f) of the reconciled review of 09-24, D28).
    ...candidateLists(c).map((r) => (WIDENED.has(r.id) ? { ...r, where: `${r.where}, widened in src/catalogue-v2.ts` } : r)),
    // ...and the lists house-v2 adds. Since round K6 every one of them is
    // drawn: a lane is a row of the style's own lane table and the composer
    // asks it who is playing, off a stream named for the lane. The four glue
    // lanes share `textureVoices` and each keeps its own incumbent, because an
    // impact and a riser are two moments and not two spellings.
    { id: 'backbeatVoices', die: 'lane:backbeat', where: 'src/catalogue-v2.ts', of: 'voice', list: () => c.backbeatVoices.map((o) => o.v) },
    { id: 'offbeatVoices', die: 'lane:offbeat, lane:offbeatOpen', where: 'src/catalogue-v2.ts', of: 'voice', list: () => c.offbeatVoices.map((o) => o.v) },
    { id: 'sixteenthVoices', die: 'lane:sixteenth', where: 'src/catalogue-v2.ts', of: 'voice', list: () => c.sixteenthVoices.map((o) => o.v) },
    { id: 'textureVoices', die: 'lane:glueImpact, lane:glueSwell, lane:glueSweep, lane:glueRiser', where: 'src/catalogue-v2.ts', of: 'voice', list: () => c.textureVoices.map((o) => o.v) },
    // ...and the sixteenth lane's own figure, mined for it out of the same hat
    // masks: what the reference sets put *between* the offbeats. `dice('sixteenth')`.
    { id: 'sixteenthMasks', die: 'sixteenth', where: 'src/catalogue.ts, derived from src/corpus.ts hats', of: 'mask', list: () => c.sixteenthMasks as MaskRow[] },
    { id: 'treatmentRota', die: 'treat:pad, treat:keys', where: 'src/styles/deep-house-v2.ts', of: 'effect', list: () => c.treatmentRota.map((o) => o.v) },
    // ...and derive-lite's two, drawn only when `derive().kit` is `breaks`,
    // which is `spark >= 0.45` and is therefore nothing the record or the house
    // ever asks for. Both are off streams of their own — `<seed>::break` and
    // `<seed>::lane:<id>:breaks` — so a theme that never reaches them draws
    // exactly the numbers it always drew.
    { id: 'breakMasks', die: 'break', where: 'src/catalogue-v2.ts', of: 'mask', list: () => c.breakMasks as unknown as MaskRow[] },
    { id: 'breaksBackbeatVoices', die: 'lane:backbeat (breaks)', where: 'src/catalogue-v2.ts', of: 'voice', list: () => c.breaksBackbeatVoices.map((o) => o.v) },
    // ...and PLAN-MOTIF T1's two, both off `<seed>::motif`, a stream of its own
    // that nothing else reads. A theme that draws no theme consumes one number
    // from it and nothing from anywhere else, which is why house-v1 — which
    // carries no `motif` switch and never asks — is where it was.
    { id: 'motifRegisters', die: 'motif', where: 'src/styles/deep-house-v2.ts', of: 'own', list: () => c.motifRegisters.map((o) => o.v) },
    { id: 'motifFamilies', die: 'motif', where: 'src/motif.ts, named here', of: 'own', list: () => c.motifFamilies.map((o) => o.v) },
  ];
}

/** Every voice any of house-v2's lists can name, by the lane it would fill. */
export const LANES = Object.freeze({
  backbeat: BACKBEAT_VOICES,
  offbeat: OFFBEAT_VOICES,
  sixteenth: SIXTEENTH_VOICES,
  texture: TEXTURE_VOICES,
});

/** What a timbre's voice is, for a table that wants to say which instrument it is. */
export { voiceOfTimbre };

export default candidateListsV2;

// --- the per-layer table, keyed by what a list can name ----------------------
//
// `packages/engine/src/voices/signatures.json` is what every playable
// instrument reads as when it is rendered **alone** through the real graph
// (rounds K2 and K4, `tools/imprint/layer.ts`). It is the instrument the
// answer to phase 1's honest finding — *an imprint over a whole mix separates
// the two rooms and nothing else* — because a mix is mostly its drums and a
// lead read under one is a lead nobody measured.
//
// It is keyed by **instrument**: `keys:rhodes`, `pad:strings`, `sawLead`. A
// candidate list names a **timbre**: `rhodes`, `strings`, `sawLead`. So this is
// the join, and it is made here rather than in `src/spell.ts` because it is the
// registry that knows which voice makes which timbre, and the spell layer is
// deliberately a file that knows about birds and about nothing else.
//
// A timbre's row is the one the voice **whose own table declares it** was
// measured in. That is unambiguous where a name is rendered by two voices:
// `organ` is `keys`'s own timbre and is also something the pad dispatches, and
// the reading that belongs to the name is the instrument that is really it.

/** The eight, in the order every reading writes them. Stated, not imported: this
 * module joins two tables and does not need to know what a bird means. */
const BIRD_KEYS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];

/**
 * One instrument's row of `packages/engine/src/voices/signatures.json`, as this
 * join reads it: the eight birds, the spread and the confidence of each, and
 * how many registers it was read in. The file carries more per row — which
 * voice, which timbre, which table — and this names what is read.
 */
interface SignatureRow {
  birds: Record<string, number>;
  spread: Record<string, number>;
  confidence: Record<string, number>;
  registers: number;
}

/** The table itself: when it was measured, and one row per instrument. */
export interface SignatureTable {
  measured: Record<string, unknown>;
  instruments: Record<string, SignatureRow>;
}

/** The key a timbre's reading is filed under, or null if nobody measured it. */
function layerKeyOf(timbre: string, rows: Record<string, SignatureRow>): string | null {
  const voice = voiceOfTimbre(timbre);
  if (voice && `${voice.name}:${timbre}` in rows) return `${voice.name}:${timbre}`;
  if (timbre in rows) return timbre;
  if (voice && voice.name in rows) return voice.name;
  return null;
}

/** The spread of a set of readings on one bird: the population's own, not a candidate's. */
function spreadOf(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length);
}

/**
 * The layer table as the spell layer reads it: one row per timbre a candidate
 * list can name, and the **kernel's width**, which is the spread of the whole
 * table on each bird.
 *
 * The width is the population's spread and not a candidate's own, which is
 * phase 1's measured lesson repeated on the new scale: a kernel as narrow as
 * one instrument's own reading is a switch and not a lean — it put a room at
 * twenty to one at the edge of the house box — and what a bird is supposed to
 * do is lean. On this scale the population is *every instrument the kitchen
 * holds*, each read alone, which is exactly what the table is.
 *
 * `n` is not a count of themes. A whole-mix signature is a sample and its `n`
 * is how many rendered themes rolled the candidate; a layer signature is the
 * instrument **read alone in two registers**, which is not a sample of anything
 * — so the row says how many registers it was read in and carries `direct`, and
 * the spell layer's "a mean of two themes is a rumour" floor does not apply to
 * a reading that is not a mean of themes at all.
 *
 * @param table the engine's `voices/signatures.json`
 * @param timbres every timbre any list of this catalogue names
 */
export function layerTable(table: SignatureTable, timbres: readonly string[]): LayerTable {
  const rows: Record<string, LayerRow> = {};
  const seen = new Set<string>();
  const byBird: Record<string, number[]> = Object.fromEntries(BIRD_KEYS.map((b) => [b, []]));
  for (const t of timbres) {
    if (seen.has(t)) continue;
    seen.add(t);
    const key = layerKeyOf(t, table.instruments);
    if (!key) continue;
    const row = table.instruments[key];
    // The eight are walked as a list of names, so what comes out of
    // `fromEntries` is a table keyed by string and the row says it is the eight.
    rows[t] = {
      instrument: key,
      mean: Object.fromEntries(BIRD_KEYS.map((b) => [b, row.birds[b]])),
      sd: Object.fromEntries(BIRD_KEYS.map((b) => [b, row.spread[b]])),
      confidence: Object.fromEntries(BIRD_KEYS.map((b) => [b, row.confidence[b]])),
      n: row.registers,
      direct: true,
    } as LayerRow;
    for (const b of BIRD_KEYS) byBird[b].push(row.birds[b]);
  }
  return Object.freeze({
    kind: 'layer',
    provenance: table.measured,
    spread: Object.freeze(Object.fromEntries(BIRD_KEYS.map((b) => [b, +spreadOf(byBird[b]).toFixed(4)]))),
    rows: Object.freeze(rows),
  }) as LayerTable;
}
