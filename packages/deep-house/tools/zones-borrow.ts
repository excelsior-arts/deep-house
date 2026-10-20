// **The zones' borrowed rows, held** (PLAN-ZONES §3.1; the review of 10-18, M4): for every lane a zone does not write,
// the row that lane reads at the zone's centre with the zone's entries among the tables (`nearestEntry` over the whole
// table), at every tempo the box can draw. The rows are written out by value (`src/styles/zones-borrowed.json`, by
// `tools/zones.ts --freeze`) so no live coupling reaches the zone; and they are held to that read here, by
// `node tools/zones.ts` and by `tools/check-zones.ts`: a lane whose source moved, or whose written row was edited by hand,
// fails until the zone's own round adopts it (`--freeze`) or keeps it (`--keep`), the kept row held by its digest.
import crypto from 'node:crypto';
import { nearestEntry, rowOf, PLACE_LANES, type PlaceEntry, type PlaceLane, type StylePlaces, type Zone } from '../src/places.ts';
import { derive } from '../src/spell.ts';

/** The file's shape: the rows by zone and lane, and the lanes a zone keeps against today's read, each by its row's digest. */
export interface BorrowedFile {
  note?: string;
  zones: Record<string, Record<string, PlaceEntry | null>>;
  kept?: Record<string, Record<string, string>>;
}

/** The tempos a zone's centre is read at: its centre's window, five either side for a set's drift and a forced tempo, by tenths. */
export function temposOf(z: Zone): number[] {
  const [lo, hi] = derive(z.centre).tempoRange;
  const out: number[] = [];
  for (let t = Math.floor(lo) - 5; t <= Math.ceil(hi) + 5 + 1e-9; t += 0.1) out.push(+t.toFixed(1));
  return out;
}

/** A row's digest, as a kept lane records it: the row written out, whole. */
export const digestOf = (e: PlaceEntry | null | undefined): string =>
  crypto.createHash('sha256').update(JSON.stringify(e ?? null)).digest('hex').slice(0, 16);

/** What a lane reads at a zone's centre today, the same row at every tempo it can be read at, or a sentence why not. */
export function borrowedOf(P: StylePlaces, z: Zone, lane: PlaceLane): { entry: PlaceEntry | null } | { fault: string } {
  const table = P[lane] as readonly PlaceEntry[] | undefined;
  const reads = temposOf(z).map((bpm) => ({ bpm, e: nearestEntry(table, z.centre, bpm) }));
  const rows = new Set(reads.map((r) => `${r.e?.id ?? 'house'} ${rowOf(r.e)}`));
  if (rows.size > 1) return { fault: `${z.id}: ${lane} reads ${[...new Set(reads.map((r) => r.e?.id ?? 'house'))].join(', ')} across ${reads[0].bpm}-${reads.at(-1)!.bpm} BPM` };
  const e = reads[0].e;
  if (!e) return { entry: null };
  const byValue = JSON.parse(JSON.stringify(e)) as PlaceEntry;
  if (rowOf(byValue) !== rowOf(e) || JSON.stringify(byValue.place) !== JSON.stringify(e.place)) return { fault: `${z.id}: ${lane}'s ${e.id} does not survive being written out` };
  return { entry: byValue };
}

/** One lane of one zone, held: today's read, what the zone plays, and whether they agree (or the lane is kept by digest). */
export interface BorrowLine { zone: string; lane: PlaceLane; today: PlaceEntry | null; written: PlaceEntry | null; kept: string | null; fault: string | null }

/**
 * **Every borrowed lane of every zone against today's read** (the rows as the zone plays them, `Zone.borrow`): a lane
 * agrees by value, or is kept and its row still has the digest the keep recorded. A kept lane that agrees again is a
 * stale keep and fails too, so the list says only what a zone really holds apart.
 */
export function borrowLines(P: StylePlaces, kept: BorrowedFile['kept'] = {}): BorrowLine[] {
  const out: BorrowLine[] = [];
  for (const z of P.zones ?? []) {
    const keeps = kept[z.id] ?? {};
    for (const lane of Object.keys(keeps)) if (!Object.hasOwn(z.borrow, lane)) out.push({ zone: z.id, lane: lane as PlaceLane, today: null, written: null, kept: keeps[lane], fault: `${z.id}: keeps ${lane}, a lane it does not borrow` });
    for (const lane of PLACE_LANES) {
      if (!Object.hasOwn(z.borrow, lane)) continue;
      const written = z.borrow[lane] ?? null, got = borrowedOf(P, z, lane), keep = keeps[lane] ?? null;
      if ('fault' in got) { out.push({ zone: z.id, lane, today: null, written, kept: keep, fault: got.fault }); continue; }
      const same = JSON.stringify(written) === JSON.stringify(got.entry);
      const fault = keep !== null
        ? digestOf(written) !== keep ? `${z.id}: ${lane} is kept as ${keep} and now reads ${digestOf(written)} (the kept row was edited)`
          : same ? `${z.id}: ${lane} is kept but agrees with today's read again (drop the keep)` : null
        : same ? null : `${z.id}: ${lane} plays ${written?.id ?? 'the house'} as written, and today's read at its centre is ${got.entry?.id ?? 'the house'}${written?.id === got.entry?.id ? ' with another row' : ''} (the source moved or the row was edited: --freeze adopts it, --keep holds it)`;
      out.push({ zone: z.id, lane, today: got.entry, written, kept: keep, fault });
    }
  }
  return out;
}
