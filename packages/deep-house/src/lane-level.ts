// **A room's "off" is about its own voice** (round S18, the recipes' audit; a
// house-v2 switch, `laneFloors`, until V1-1 of 10-02, and the rule for every
// style since). A room's level table is keyed by a voice's level word, and
// several voices share a word: the snare and the rimshot read `clap`, the
// cabasa, the congas, the bongos, the tom, the tambourine, the cowbell and the
// woodblock read `shaker`. The sub room writes its clap off (`clap: -60`,
// `clap.on: false`) and the growl room its shaker (`shaker: -60`), and every
// voice that shared the word went silent with it: under a broken kit a sub-room
// theme had no backbeat (the snare at -56 dB on every DnB audit seed), and a
// third of the themes a Tech House spell drew a cabasa, a tom or hand drums for
// had a sixteenth lane at -54 to -71 dB. A room's word about its clap is not a
// word about a backbeat, so a voice that is not the one the room turned off
// reads the record's own level for the word (the style's base table) instead.
//
// It is level machinery and not a composition rule, so it is not a switch: the
// record's rooms turn off only words whose own voice is the one the record
// draws, and a rule that reads the base level for *another* voice never fires
// there (V1-1: house-v1 is a composing preset, not a byte lock).

import type { Style } from '@deep-house/engine/style';
import { BY_NAME } from '@deep-house/engine/voices';
import VOICE_CLASSES from './voice-classes.json' with { type: 'json' };

/** At or under this, a room's level for a word is that room saying "off". */
export const ROOM_OFF_DB = -40;

/**
 * The level a voice plays at, in dB, off a room's resolved table: the table's
 * own number, or — where the room has turned the word off and the voice is not
 * the word's own — the style's base level for the word.
 */
export function laneLevelDb(style: Style, levels: Record<string, number>, voice: string, key: string): number | undefined {
  const room = levels[key];
  if (voice === key || !Number.isFinite(room) || room > ROOM_OFF_DB) return room;
  const base = (style.base.levels as Record<string, number>)[key];
  return Number.isFinite(base) ? base : room;
}

// **The sub under what competes with it** (round EQ-5, 10-03: *"my ears hurt
// experiencing it non-stop; even the DnB tracks I listen to don't sound as
// boomy as pretty much every track"*; round LOUD-2, 10-04: *"for tracks like
// 27191 t3, which is basically ambient with bass as one voice, the sub was
// alright and created a great room -- from before our sub reduction I'd only
// reduce it 2 dB, not 6; but for tracks that are faster, sub and moving bass
// make it muddy ... on complex tracks with drums, percussion and other
// attention grabbers the super low sub makes the scene overloaded, on sparse
// ambient tracks its depth supports it ... for deep house with plenty of mid
// voices a safe reduction is -4..-5 dB"*). Every theme's sub plays under its
// room's own `levels.sub`, and `?sub=` replaces the step with its own number
// (`applyBypass`, set-plan.ts) -- the room's level less the trim, under the
// sub's ceiling. Three steps, keyed to what competes with the sub for the ear
// and read off the plan by both engines, never to a place, a genre word or a
// tempo:
//
// - **two down where the bass is the room**: no grid of drums under it (the
//   spell's drums off, `derive().drumsOn`): the theme is nearly empty and the
//   bass is one of its few voices, and its depth is the room (27191; his ear
//   10-04: *"-2 is definitely the way: the deeper sub is the kill advantage,
//   the mid-high sync and the super-low bass make that unique ambient room"*);
// - **six down under a grid with the mids carrying the theme**: the kick is
//   the hammer, and the keys, the pads and the piano hold the ear above it --
//   the house (his ear 10-04 on seed 1's first main, -5 against -6: *"-6 is
//   better"*);
// - **four down where the scene is loaded**: a grid plus an attention grabber
//   down in the sub's own range -- a bass in front of the bottom (a voice with
//   its own grit, the reese or the 303 line, or the sub with the driven copy
//   under it) or a broken kit (the break-beat vocabulary, a snare that moves).
//   Where the fast places land. His number for now (10-04: *"we can set it to
//   -4, the upcoming exploration might invalidate it"*): at the Dubstep place
//   the kick carries the sub and the bass is a passenger, so the step there is
//   provisional until the roles are groomed (the DnB and the Dubstep rounds).
//
// MEASURED over the nine tiles' spells and nine seeds, three themes each
// (round LOUD-2's note, `notes/rounds/loud-2.md`). Two things the brief
// expected did not hold. The drone in front (`scene === 'drone-forward'`) is
// not "the bass is the room" on a grid: at the house it is 15 themes in 27,
// every one of them with a kick under the drone, so it keys nothing here and
// those themes read the grid's step like any other. And the percussion lanes
// beyond the kick, the hats and the clap (shakers, woodblock, hand drums) do
// not tell a loaded scene from the house: the house draws them in 9 themes of
// 27, a cabasa and congas at seven a bar among them, so they would put a third
// of the house at six; the bass in front and the broken kit put every tile's
// themes on its tile's step.
//
// The shelf, the bass's duck and the kick are not this rule's.
export const SUB_BASS_IS_ROOM_DB = -2;
export const SUB_UNDER_GRID_DB = -6;
export const SUB_LOADED_DB = -4;
/**
 * The bass voices that are only the bottom: the sub itself, soft or
 * triangular (`voice-classes.json` `bottoms`). Any other voice on the bassline
 * (a reese, the 303 line, the pluck) is a bass with its own grit in front of
 * the bottom.
 */
export const SUB_BOTTOMS: ReadonlySet<string> = voiceClass('bottoms');
/** A list of `voice-classes.json` as a set, every name a voice the engine has (refused at load otherwise). */
export function voiceClass(name: 'bottoms' | 'kitKicks'): ReadonlySet<string> {
  const list = (VOICE_CLASSES as unknown as Record<string, unknown>)[name];
  if (!Array.isArray(list) || !list.length || list.some((v) => typeof v !== 'string' || !BY_NAME[v]))
    throw new Error(`voice-classes.json ${name}: a list of voices the engine has`);
  return new Set(list as string[]);
}

/** What competes with the sub, as the plan says it. */
export interface SubScene {
  /** a grid of drums under the theme (`derive().drumsOn`; the record, always) */
  drums: boolean;
  /** the kit is broken (`derive().kit === 'breaks'`) */
  brokenKit: boolean;
  /** the voices the bassline plays */
  bassVoices: Iterable<string>;
  /** the sub carries the driven copy in parallel (`bass.parallel`, blend over nought) */
  bassDriven: boolean;
}

/** Which of the three steps a theme's sub takes. */
export function subStepOf(scene: SubScene): 'room' | 'grid' | 'loaded' {
  if (!scene.drums) return 'room';
  const front = scene.bassDriven || [...scene.bassVoices].some((v) => !SUB_BOTTOMS.has(v));
  return front || scene.brokenKit ? 'loaded' : 'grid';
}

/** How far under its room's `levels.sub` a theme's sub plays, in dB. */
export function subTrimDb(scene: SubScene): number {
  const step = subStepOf(scene);
  return step === 'room' ? SUB_BASS_IS_ROOM_DB : step === 'grid' ? SUB_UNDER_GRID_DB : SUB_LOADED_DB;
}
