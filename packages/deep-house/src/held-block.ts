// **The held block** (round sound-properties; his word 10-30: *"rule out annoying organ motifs and approaches"*). Every
// held lead plays the same part — one strike a chord, four or five voices, the progression's loop — and what made the
// organ's wear was its sound, not its part: it strikes in milliseconds and holds flat, so each chord lands whole, high
// and level, and a loop of two chords is the same block again for a whole main. A held voice is a **block** by its own
// numbers: the attack of the row it renders through, and the hold `TIMBRES` declares for it. A block's chord is voiced
// as one line, its top led by step inside a band that moves phrase by phrase, and it swells in
// (`recipes/arrangement/held-block.json`).
//
// Nothing here names a voice, a place, a genre or a seed.
import HELD_BLOCK_FILE from '../recipes/arrangement/held-block.json' with { type: 'json' };
import { TIMBRES, BY_NAME, ROWS, dispatches, rowOfTimbre } from '@deep-house/engine/voices';
import { voiceHeld } from './theory.ts';

export interface HeldBlockRow {
  id: string;
  name: string;
  block: { attackMostS: number; holdLeast: number };
  leastBpm: number;
  phraseBars: number;
  voicing: { voices: number; top: [number, number]; root: boolean };
  attackBeats: number;
}

const FILE = HELD_BLOCK_FILE as unknown as { rows: HeldBlockRow[] };
/** The held-block rows, by id (`recipes/arrangement/held-block.json`). */
export const HELD_BLOCK_ROWS: Readonly<Record<string, HeldBlockRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/**
 * The attack a held note of this voice and timbre opens with, as the row it renders through states it: the voice's own
 * row, or where the voice dispatches by timbre the row its table names for this one (a timbre the table does not name
 * has no answer, rather than the table's fallback's).
 */
export function attackOf(voice: string, timbre: string): number | null {
  const own = BY_NAME[voice]?.row;
  if (!own) return null;
  const row = dispatches(voice) ? (rowOfTimbre(voice, timbre) ? ROWS[rowOfTimbre(voice, timbre)!] : null) : own;
  const a = (row?.parameters as { attack?: unknown } | undefined)?.attack;
  return typeof a === 'number' ? a : null;
}

/** Whether a held timbre arrives as a block: struck in a moment and still sounding at the bar line, by its own numbers. */
export function isBlock(row: HeldBlockRow, voice: string, timbre: string): boolean {
  const facts = TIMBRES[timbre];
  const attack = attackOf(voice, timbre);
  return !!facts && !facts.struck && facts.hold >= row.block.holdLeast && attack != null && attack <= row.block.attackMostS;
}

/**
 * A block's chord, voiced as a line: its top the chord tone nearest the last inside the row's band (a phrase's first
 * chord reaching for the band's other half, so the line answers itself phrase by phrase), and under it `voices` chord
 * tones each a third or more below the one over it, so a ninth never rubs a second against its neighbour on a voice that
 * holds flat; the root under them where the row asks. `phrase` is the phrase's index inside its section; `lastTop` the
 * top the line stood on (null at the first).
 */
export function blockVoicing(row: HeldBlockRow, pcs: readonly number[], rootMidi: number, lastTop: number | null, phraseStart: boolean, phrase: number): number[] {
  const [lo, hi] = row.voicing.top;
  const want = phraseStart ? (phrase % 2 ? hi : lo) : lastTop;
  const top = voiceHeld(pcs, 1, row.voicing.top, want)[0];
  const set = new Set(pcs.map((p) => ((p % 12) + 12) % 12));
  const out = [top];
  let m = top - 3;
  while (out.length < row.voicing.voices) { while (!set.has(((m % 12) + 12) % 12)) m--; out.unshift(m); m -= 3; }
  if (row.voicing.root) { let r = out[0] - 1; while (((r - rootMidi) % 12 + 12) % 12) r--; out.unshift(r); }
  return out;
}
