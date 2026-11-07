// **Tide decides how much of the record is room** (round tide-space, 11-01; the birds' ledger, rows A1–A8).
//
// His word on Drive - Tailwind's keys in a wide hall at Tide 0: *"Tide is at 0 literally says very close dry sound and
// we have this spacious hall"*; and on how strictly: *"not absolute birds follow, but … more musical"*. Until this
// round Tide reached the slow places' rows, the fast places' keys and the stage's plate seconds, and not the house's own
// wash: the chord reverb's length and level, the pad's, the stab's, the figure's and the piano's sends, and the fx
// palette that multiplied them heard no bird. Three rules, one factor, off the row
// `recipes/arrangement/tide-space.json`:
//
//   1. **A part's own room is a ceiling** (`ceilingOf`, `tidalRoom`). A pinned or a mined part arrives with its
//      ambience fixed (the dub chord's spacious room); Tide plays less of it below the house and never more of it
//      above, so the ensemble lands whole (its roles, its relations, its echo) and only its distance follows the bird.
//      The figure's room where Tide itself chose it (near under 0.5, open from it: a 17 dB step) is one slope.
//   2. **The house's wash by Tide** (`tideWashOf`): one factor, geometric about the house, on the reverb's, the hall's and
//      the delay's returns, so it rides whatever plays (a place's form may drop the pad: the piano's hall still
//      follows); the reverb's and the hall's length with it. The fx palette's own reverb and delay multipliers are
//      folded into it (`paletteAt`): near the house they colour the wash as they drew, toward either end of Tide the
//      bird owns it (the palette keeps its riser, impact and sweep).
//   3. **The plate by Tide** (`plateSecondsOf`, `frontShareOf`): the front's plate takes the same factor, its length
//      falls under the house to a short bright room, and a driving kit in a dry room moves less of a front's wash into
//      it, on a slope where kit-tight had a switch.
//
// Where the drums are off, a place's rows already set its room by Tide about their own centre (the soloist's sends,
// the conversation's tail, the sea, the journey): they are the model, and nothing here touches them.
// Nothing here knows a genre or a place: the birds by their numbers, a part by the room it asked for.

import ROW_FILE from '../recipes/arrangement/tide-space.json' with { type: 'json' };
import { HOUSE } from './spell.ts';

interface Ends { nought: number; one: number; curve?: number }
export interface TideSpaceRow {
  wash: Ends;
  length: { reverb: Ends; hall: Ends };
  figure: { near: number };
  plate: { seconds: number; slope: number; nought: number; most: number };
  tight: { from: number; to: number };
}

const strip = <T>(o: unknown): T => JSON.parse(JSON.stringify(o, (k, v) => (k === 'says' ? undefined : v))) as T;
export const TIDE_SPACE_ROW: Readonly<TideSpaceRow> = Object.freeze(strip<TideSpaceRow>({
  wash: ROW_FILE.wash, length: ROW_FILE.length, figure: ROW_FILE.figure, plate: ROW_FILE.plate, tight: ROW_FILE.tight,
}));

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const r3 = (x: number): number => +x.toFixed(3) + 0;
const r4 = (x: number): number => +x.toFixed(4) + 0;
const tideOf = (spell: Record<string, number> | number): number => {
  const t = typeof spell === 'number' ? spell : spell.tide;
  return clamp(Number.isFinite(t) ? t : HOUSE.tide, 0, 1);
};

/**
 * A factor geometric about the house: one at the house's Tide, `nought` at nought and `one` at one. Under the house the
 * way down is bent by `curve` (his ear 11-01: *"very dry on 0 and then maybe start making it wetter earlier … dead zero
 * is dry, but if i love a bit puff"*): the dry end is the last few hundredths of Tide, a low Tide such as 0.17 stays
 * close to the house's room (about −2 dB of wash at the row's curve of 4), and 0.05 to 0.1 is a little puff.
 */
export function aboutHouse(tide: number, ends: Ends): number {
  const h = HOUSE.tide, t = clamp(tide, 0, 1);
  return t < h ? Math.pow(ends.nought, Math.pow((h - t) / h, ends.curve ?? 1)) : Math.pow(ends.one, (t - h) / (1 - h));
}

/** **The wash's factor** (rule 2): how much of the house's room a theme at this Tide plays. */
export function wetOf(spell: Record<string, number> | number, row: TideSpaceRow = TIDE_SPACE_ROW): number {
  return aboutHouse(tideOf(spell), row.wash);
}

/**
 * **A part's own room is a ceiling** (rule 1): what an asked ambience's sends are scaled by where the drums play, so
 * that through the wash's returns (rule 2) the part plays `wetOf` of its room below the house and its room as written
 * above it, never more.
 */
export function ceilingOf(spell: Record<string, number> | number, row: TideSpaceRow = TIDE_SPACE_ROW): number {
  return 1 / Math.max(1, wetOf(spell, row));
}

interface Room { room: number; reverb: number; delay: number }
/**
 * **The figure's room by Tide** (rule 1, the near and open figure space): the intimate room at and under the row's
 * `near`, the spacious one from the house up, geometric between (the delay, which the intimate room has none of,
 * linear).
 */
export function tidalRoom(spell: Record<string, number> | number, near: Room, open: Room, row: TideSpaceRow = TIDE_SPACE_ROW): Room {
  const t = tideOf(spell);
  const a = clamp((t - row.figure.near) / (HOUSE.tide - row.figure.near), 0, 1);
  const geo = (x: number, y: number) => (x > 0 && y > 0 ? Math.pow(x, 1 - a) * Math.pow(y, a) : x + (y - x) * a);
  return { room: r4(geo(near.room, open.room)), reverb: r4(geo(near.reverb, open.reverb)), delay: r4(near.delay + (open.delay - near.delay) * a) };
}

interface WashBase { reverbSeconds: number; reverbLevel: number; hallSeconds: number; hallLevel: number; delayLevel: number }
/**
 * **The house's wash by Tide** (rule 2): the room's send settings for a theme where the drums play, over the place's own
 * (`base`: the style's, with a place's `sends` row over it). The returns take the factor, so every send into them does
 * (the pad's, the stab's, the figure's, the piano's hall and delay, whatever the form lets play); the reverb's and the
 * hall's length follow, a longer tail at the square root of its factor's level so it reads longer and not louder.
 */
export function tideWashOf(spell: Record<string, number> | number, base: WashBase, row: TideSpaceRow = TIDE_SPACE_ROW) {
  const t = tideOf(spell), w = wetOf(t, row);
  const lr = aboutHouse(t, row.length.reverb), lh = aboutHouse(t, row.length.hall);
  return {
    reverbSeconds: r3(base.reverbSeconds * lr),
    reverbLevel: r4(base.reverbLevel * w / Math.sqrt(Math.max(1, lr))),
    hallSeconds: r3(base.hallSeconds * lh),
    hallLevel: r4(base.hallLevel * w / Math.sqrt(Math.max(1, lh))),
    delayLevel: r4(base.delayLevel * w),
  };
}

/**
 * **The front's plate length** (rule 3): the house's 2.6 s and its slope above the house as before; under the house
 * geometric down to the row's `nought` of it at Tide nought (1.2 s), so a close record's plate is a short bright room.
 */
export function plateSecondsOf(spell: Record<string, number> | number, row: TideSpaceRow = TIDE_SPACE_ROW): number {
  const t = tideOf(spell), P = row.plate;
  const s = t < HOUSE.tide ? P.seconds * aboutHouse(t, { nought: P.nought, one: 1 }) : P.seconds + P.slope * (t - HOUSE.tide);
  return r3(Math.min(P.most, s));
}

/**
 * **How much of a sparse front's wash moves into the plate** (rule 3, round kit-tight's switch as a slope): all of it
 * under the row's `from` of `tightOf` (Ember's drive times Tide's dryness), none from `to`; the rest keeps the wash it
 * was mixed in.
 */
export function frontShareOf(tight: number, row: TideSpaceRow = TIDE_SPACE_ROW): number {
  return r3(clamp((row.tight.to - tight) / (row.tight.to - row.tight.from), 0, 1));
}


/**
 * **The fx palette's wetness, folded into Tide's** (rule 2): a palette's reverb or delay multiplier (dry 0.65, deep
 * 1.3 …) colours the wash as it drew at the house and fades to none toward either end of Tide, so a bird at its end is
 * clearly that bird and near the house the seed's colour stays (a "deep" draw at Tide 0.17 no longer outwets the house).
 */
export function paletteAt(spell: Record<string, number> | number, multiplier: number): number {
  const t = tideOf(spell), h = HOUSE.tide;
  const keep = clamp(1 - Math.abs(t - h) / (t < h ? h : 1 - h), 0, 1);
  return r4(Math.pow(multiplier, keep));
}
