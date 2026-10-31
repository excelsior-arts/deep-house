// A theme's length, in minutes, from the birds (round L1).
//
// Eugene, 10-01: *"fast beat tracks tend to be too short, sometimes under 2
// minutes; the length must not come only from bars count and speed, it should
// be something more holistic"* — and then: *no hard-coded minutes; the length
// comes from the birds through a heuristic we can tune.*
//
// Until L1 a theme rolled its **bars** out of the set table and the tempo only
// converted them, so the same 56 bars were 2:13 at the house and 1:17 at 172.
// Now the derived state says how long a theme wants to be **in minutes**, the
// seed rolls inside that band the way it rolled bars, and the bars follow from
// the tempo the theme actually plays at (`barsFor`).
//
// **The heuristic, in one line**, per family (round length-2): a groove where the derived state has drums, the
// drumless row where it has none, each about its own centre —
//
//   scale = (centre's tempo / tempoCentre)^ember
//         × e^( −veil × (changeRate − centre)
//               + tide × (wet − centre)
//               + loom × (formLength − centre) )
//   band  = row.band × scale, each end inside the knobs' guard
//
// and a drumless theme where the place's entry names the struck row (`length: 'struck'` on BELLS's and BOWLS's technique
// entries; round length-2b, below) reads it by its share: band = drumless^(1 − share) × struck^share, end by end.
// The rows are the style's (`length` on `styles/deep-house-v2.ts`); this file is the arithmetic.
//
// every bird read as its distance from the row's centre, so **at the centre the scale is exactly 1** and the band is
// the row's as written; the groove's centre is the house. Every term is multiplicative, so a knob reads the same share
// at every length.
//
// **What each bird is for:**
//   Ember — energy. Its tempo centre on the curve (`tempoCentreOf`): a faster pulse is a shorter track, gently,
//     since a track at 172 is still a whole track and not a sketch. The drumless row gives it no say.
//   Veil — change rate. Restless is shorter (the material is used up sooner), patient is longer (it unfolds).
//   Tide — wet and held. A deep, slow-wet piece is longer.
//   Loom — how long a form it wants. The bird whose very meaning is length.
//
// **Shorter, by family** (round length-2, Eugene 10-27: *"if you look at our featured playlist vibe and drive most
// song 4-5 minutes some 8 or 10, and these are not slow ambient just easy listening standard stuff. We should aim for
// 3-4mins here"*; *"for ambient … some our tracks have 10 or even 12, it's a bit too much"*, then *"let's aim 9-10"*;
// and *"I don't want hard cut, but to tune parameters to yield into that territory"*). Until then one row served both
// families about the house — [3.5, 5.9] minutes, Loom 1.3, Tide 0.5 — and his Loom- and Tide-high grooves ran 7 to
// 12 minutes while a Veil-high ambient piece ran 3. Now the groove row is 3:03-4:00 at the house with every bird a
// small lean (Loom 0.3 takes its top to about 4:30), and the drumless row is 9:06-9:54 at the slow places' middle
// (Tide 0.85, Loom 0.9, Veil 0.4), every bird smaller still. No clamp does it: the guards bind only at the far
// corners of the ring.
//
// **The simplest ambient tone is shorter** (round length-2b, Eugene 10-28: *"bowls and bells should not aim to 9 mins
// as they are simplest ambient tone, for them 5-6 minute range was just right"*). What sets BELLS and BOWLS apart from
// the other drumless places is no single bird (Gleam is high at both, and at the featured Moon Tide too, which plays
// the journey) but what plays: the struck voices in conversation. So the struck row (5:21-5:51 about the middle of the
// conversation's places, every bird a smaller lean still) is read by its **share**: 1 wherever the place's entry names
// it, from a twentieth of a bird inside its border (`lengthMargin` in places.ts, the depth into its zone's box or the
// margin over the nearest place that names none), nought outside it, smooth between. No place
// that lays no conversation moves, and a spell sliding off BELLS or BOWLS toward the floating pulse glides.
//
// **At the family pulls** (each the named birds over the house; the tempo the centre the pulse reads, the bars the
// band's ends at that tempo):
//
//   pull            family    bpm  minutes      bars
//   house           groove    100  3:03–4:00    76–100
//   tech house      groove    125  2:59–3:55    92–124
//   techno          groove    125  2:59–3:55    92–124
//   DnB             groove    170  2:58–3:53   124–164
//   downtempo       groove     90  3:07–4:05    72–92
//   dub techno      groove    120  3:29–4:35   104–136
//   Loom 1, Tide 1  groove    100  3:39–4:47    92–120
//   Veil 1, Loom 0  groove    100  2:30–3:11    64–80    (the corner: the lower guard)
//   ambient         drumless   47  9:02–9:50   108–116
//   27191           drumless   48  8:49–9:35   104–116
//   PSY             drumless   47  8:31–9:16   100–108
//   WAVES           drumless   47  9:01–9:49   108–116
//   BELLS           struck     47  5:15–5:44    60–68    (was 9:02–9:49 on the drumless row)
//   BOWLS, Tide 0   struck     46  5:12–5:41    60–64    (was 8:55–9:42)
//   BOWLS, Tide .48 struck     46  5:20–5:49    60–68    (was 9:16–10:04)
//   BOWLS's address struck     46  5:27–5:58    64–68    (Tide 0.95; was 9:37–10:28)
//
// Over seeds 1-40, themes 1-3, at the house, the genre tiles and the slow places (`tools/length-table.ts`): the
// grooves' median 3:28 (10th percentile 3:07, 90th 4:00), the drumless median 9:13 (8:40, 9:41), the struck (BELLS and
// BOWLS down its Tide) 5:30 (5:16, 5:47).

import { HOUSE, HOUSE_DERIVED, derive } from './spell.ts';
import type { Derived, Spell } from './spell.ts';

/** One family's knobs: its band at its centre, and how far each bird stretches it from there. */
export interface LengthRow {
  /** the birds the family's band is stated at (over the house's); none is the house itself */
  centre: Readonly<Partial<Spell>> | null;
  /** the band at the centre, in minutes: the shortest and the longest a seed rolls (its ladder's 10th and 90th) */
  band: readonly [number, number];
  /** Ember: the exponent on the centre's tempo over the theme's (0 = tempo has no say; 1 = a fixed bar count) */
  ember: number;
  /** Veil: e-folds of length per unit of change rate off the centre, shorter as it rises */
  veil: number;
  /** Tide: e-folds per unit of wet off the centre, longer as it rises */
  tide: number;
  /** Loom: e-folds per unit of form length off the centre, longer as it rises */
  loom: number;
}

/** A row a place names by its technique entry's `length` (engine-data): blended into one family's band by its share. */
export interface NamedLengthRow extends LengthRow {
  /** the family whose band it blends into (the struck row: the drumless one) */
  family: 'groove' | 'drumless';
}
/**
 * **The knobs**, the style's (`length` on `styles/deep-house-v2.ts`; engine-data, 10-28, his word: *"we keep changes in
 * data"*): tuning the length is editing those numbers and nothing else. A theme reads the row of its family
 * (`lengthRow`): a groove where the derived state has drums, the drumless row where it has none; and a named row
 * (`named`, the struck one) by its share where a place's entry names it (`lengthMargin` in places.ts, `namedShare`).
 */
export interface LengthKnobs {
  groove: LengthRow;
  drumless: LengthRow;
  /** the rows a place may name, by name */
  named: Readonly<Record<string, NamedLengthRow>>;
  /** how far inside the naming entries' border (bird units, `lengthMargin`) a named row's share is whole */
  fade: number;
  /** the guards, in minutes: never under, never over, and never the answer at a family pull */
  guard: readonly [number, number];
}

/** The row a derived state reads: its family's (a named row is read beside it, by its share). */
export const lengthRow = (d: Derived, k: LengthKnobs): LengthRow => (d.drumsOn ? k.groove : k.drumless);

const centres = new Map<object, Derived>();
/** A row's centre as a derived state (the house's own where it names none). */
function centreOf(row: LengthRow): Derived {
  if (!row.centre) return HOUSE_DERIVED;
  let c = centres.get(row.centre);
  if (!c) centres.set(row.centre, (c = derive({ ...HOUSE, ...row.centre } as Spell)));
  return c;
}

/** A row's share of its band at a derived state; exactly 1 at the row's centre. */
function rowScale(d: Derived, row: LengthRow): number {
  const c = centreOf(row);
  const tempo = d.tempoCentre === c.tempoCentre || !row.ember ? 1 : Math.pow(c.tempoCentre / d.tempoCentre, row.ember);
  return tempo * Math.exp(
    -row.veil * (d.changeRate - c.changeRate)
    + row.tide * (d.wet - c.wet)
    + row.loom * (d.formLength - c.formLength),
  );
}

/** The share of its family's band the derived state asks for; exactly 1 at the family's centre (the house, for a groove). */
export function lengthScale(d: Derived, k: LengthKnobs): number {
  return rowScale(d, lengthRow(d, k));
}

/**
 * **A named row's share** (round length-2b, the struck share): nought outside the entries that name it (a margin under
 * nought, `lengthMargin` in places.ts), 1 from `fade` of a bird inside their border, and smooth between, so a spell
 * sliding off BELLS or BOWLS toward the floating pulse glides from the one length to the other, and no place that names
 * no row moves.
 */
export function namedShare(margin: number, k: LengthKnobs): number {
  if (!(margin > 0)) return 0;
  if (margin >= k.fade) return 1;
  const t = margin / k.fade;
  return t * t * (3 - 2 * t);
}

/**
 * The band a theme's minutes are rolled inside: `[shortest, longest]`. Pure. A theme of the named row's family reads it
 * by its share (`namedShare`), the two bands blended geometrically, end by end; a theme of the other family reads its
 * family's band alone.
 */
export function minutesBand(d: Derived, k: LengthKnobs, named: { row: string; share: number } | null = null): readonly [number, number] {
  const row = lengthRow(d, k), N = named ? k.named[named.row] : undefined;
  const s = N && row === k[N.family] ? Math.min(1, Math.max(0, named!.share)) : 0;
  const a = rowScale(d, row), b = s > 0 ? rowScale(d, N!) : 0;
  const [lo, hi] = k.guard;
  const at = (i: 0 | 1) => {
    const m = s > 0 ? Math.exp((1 - s) * Math.log(row.band[i] * a) + s * Math.log(N!.band[i] * b)) : row.band[i] * a;
    return Math.min(hi, Math.max(lo, m));
  };
  return [at(0), at(1)];
}

/** Where `pos` (0..1, the seed's place in the set table's ladder) lands in the band. */
export function minutesAt(band: readonly [number, number], pos: number): number {
  return band[0] + Math.min(1, Math.max(0, pos)) * (band[1] - band[0]);
}

/**
 * Minutes at a tempo as bars, on the four-bar grid: `minutes × bpm / 4`. The
 * grid never rounds a theme under the lower guard: a band that ends at it
 * keeps every bar of it.
 */
export function barsFor(minutes: number, bpm: number, k: LengthKnobs): number {
  let bars = Math.max(16, Math.round((minutes * bpm) / 16) * 4);
  while (minutesOf(bars, bpm) < k.guard[0]) bars += 4;
  return bars;
}

/** What a theme of `bars` at `bpm` lasts, in minutes. */
export const minutesOf = (bars: number, bpm: number): number => (bars * 4) / bpm;

/** Minutes as the clock a listener reads them, `m:ss`. */
export function clockOf(minutes: number): string {
  const s = Math.round(minutes * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
