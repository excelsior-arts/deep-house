// **A room's "off" is about its own voice** (house-v2's `laneFloors`, round
// S18). A room's level table is keyed by a voice's level word, and several
// voices share a word: the snare and the rimshot read `clap`, the cabasa, the
// congas, the bongos, the tom, the tambourine, the cowbell and the woodblock
// read `shaker`. The sub room writes its clap off (`clap: -60`, `clap.on:
// false`) and the growl room its shaker (`shaker: -60`), and every voice that
// shared the word went silent with it: under a broken kit a sub-room theme had
// no backbeat (the snare at -56 dB on every DnB audit seed), and a third of the
// themes a Tech House spell drew a cabasa, a tom or hand drums for had a
// sixteenth lane at -54 to -71 dB. A room's word about its clap is not a word
// about a backbeat, so a voice that is not the one the room turned off reads
// the record's own level for the word (the style's base table) instead.

import type { Style } from '@deep-house/engine/style';
import { switchOn } from './lanes.ts';

/** At or under this, a room's level for a word is that room saying "off". */
export const ROOM_OFF_DB = -40;

/**
 * The level a voice plays at, in dB, off a room's resolved table: the table's
 * own number, or — under `laneFloors`, where the room has turned the word off
 * and the voice is not the word's own — the style's base level for the word.
 */
export function laneLevelDb(style: Style, levels: Record<string, number>, voice: string, key: string): number | undefined {
  const room = levels[key];
  if (!switchOn(style, 'laneFloors') || voice === key || !Number.isFinite(room) || room > ROOM_OFF_DB) return room;
  const base = (style.base.levels as Record<string, number>)[key];
  return Number.isFinite(base) ? base : room;
}
