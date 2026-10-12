// The desk: what a hand may move on the machine view, and the line each move
// writes down.
//
// Eugene (09-25): *"add more interactive controls where possible without heavy
// changes in the engine, to give a more interactive, tunable UX for quick
// experiments on sound and grounded feedback for agents."* Round M1 read what
// the engine hands out today (`notes/rounds/machine-m1.md` has the list) and
// built the cheapest three, none of which needs a line of the engine changed:
//
//   **a source's strip** — mute, solo, sends off (dry) and a level — which is
//   the listening mixer the engine already has (`source-mix.ts`) and the
//   control already carries (`setSourceMix`);
//
//   **a bus's mute, solo and sends off**, which is the same mixer asked for
//   every instrument the lanes put on that bus: a group on a desk;
//
//   **the master's five band gains**, as an offset over the room the set is
//   in, written through the one door the master's handle offers for it
//   (`master.lean('airDb', …)`, round E1), ramped over 40 ms so a move is not
//   a click, and kept by the master over the profile a theme's boundary walks
//   it to, so a hand's lean is never stepped away under it.
//
// **None of it is the link, and none of it outlives the view** (the link is a
// promise; a view that only looks must not be a different record). Every move
// writes one ledger line — `desk` — carrying what was moved, to what and over
// what, which is the grounded feedback: a report can hold *"the kick bus was
// muted"* beside the clip it explains.
//
// **The bands go back to the room before the room moves.** A cast walks the
// master to the arriving seed's room over a bar (`retuneMaster` in mix.ts),
// through a ramp line that remembers where it put each band; an offset written
// behind its back would be a step at the next cast. So the desk lets the bands
// go the moment a cast is asked for — before the swap that retunes — and a
// stop and a start, which build a new master, find nothing to let go. Both
// write the line that says so.
//
// **The device's lines are setters** (PLAN-DESK D1, 10-04). A number of an
// instrument's row — the reese's `cutoffHz`, its `clip.drive`, the kick's `hz`
// — moves on the engine's desk layer (`setDeviceParam`), clamped to the
// contract field's own range, and the **next note** of that instrument renders
// from it; a note already sounding keeps its numbers. A knob the ring turns
// still scales the moved number by the spell's factor, as it scales the row's.
// A drum whose bodies are rendered ahead renders the upcoming window's again
// from the moved patch, off the tick. One `desk` line a move (a slider's on its
// release), one for a line put back to the row; a cast keeps the moves, since
// they are the instrument's and not the room's; and they go with the view, as
// everything on it does until a saved desk (D3) says otherwise.
//
// **The stage's blocks are setters too** (PLAN-DESK D2, 10-04): the bass
// drive's blend and wobble, the ducks' depths, the bass's body and compressor,
// the glue, the bell, the width, the macro's open corner — every line a stage
// box declares (`@deep-house/engine/stage`). A move goes on the engine's stage
// layer, clamped to the line's declared range, and reaches the sound one of
// two ways, which the panel and the ledger say: **live**, through each deck's
// graph's own door, ramped over 40 ms (the duck's depth from the next kick);
// or **at the next theme**, where the graph holds no parameter for it — the
// mix builds every graph with the layer on. A cast keeps the moves; RESET,
// the box's reset and the view closing put them back.
//
// **Nothing outlives the view unless saved** (PLAN-DESK D3, 10-04, Eugene's
// word: *"proceed with D1-3"*). A **scene** is the desk's whole state as one
// value — the strips, the master's band leans, the device moves and the stage
// moves, under a head that says when, on which seed and theme and engine — read
// by `scene(name)` and kept per viewer in this browser (`SCENES_KEY`, one key,
// a table by name, versioned), never in the address, a link or a server. A
// recall (`apply`) cleans the desk first and then writes the scene through the
// desk's own setters, so a recall is the scene and nothing else, a line the
// tree no longer has is left out and said, and the ledger says one line a
// layer. The recalled scene stays **armed** until RESET or the view closes:
// the bands go back to the room before a cast (M1's rule, kept) and the armed
// scene's leans are leant again over the new room once it has landed, walked
// in over a bar beside the room's own walk. The unsaved desk still goes with
// the view.

import { note } from '../ledger.ts';
import type { Control } from '../control.ts';
import type { SourceMix } from '@deep-house/engine/source-mix';
import type { EqProfile } from '@deep-house/engine/master';
import { clearDevice, deviceMoves, deviceOf, howOfLine, moveSounding, prepareMoved, sayParam, setDeviceParam } from '@deep-house/engine/device';
import type { DeviceMove } from '@deep-house/engine/device';
import { deckThemeTime } from '@deep-house/engine/deck';
import { settingsOf } from '@deep-house/engine/settings';
import type { Settings } from '@deep-house/engine/settings';
import { clearStage, roomOf, setStageParam, stageLine, stageMoves } from '@deep-house/engine/stage';
import type { StageHow, StageMove } from '@deep-house/engine/stage';
import { BY_NAME } from '@deep-house/engine/voices';

/** The master's five bands a hand may lean, by the path the master's handle names. */
export const BANDS = ['lowShelf', 'lowMid', 'mid', 'presence', 'air'] as const;
export type Band = typeof BANDS[number];
/** Which master row is which band. */
export const BAND_OF: Record<string, Band> = {
  'm:lowShelf': 'lowShelf', 'm:lowMid': 'lowMid', 'm:mid': 'mid', 'm:presence': 'presence', 'm:air': 'air',
};
/** How far a hand may lean a band, either way, in decibels; and a step of − or +. */
export const BAND_RANGE = 6;
export const BAND_STEP = 0.5;
/** A level's step on the − and + of a strip's popover, in percent. */
export const LEVEL_STEP = 1;
/** How long a band move ramps: long enough not to click, short enough to hear at once. */
const RAMP = 0.04;

const DB_OF: Record<Band, keyof EqProfile> = {
  lowShelf: 'lowShelfDb', lowMid: 'lowMidDb', mid: 'midDb', presence: 'presenceDb', air: 'airDb',
};

type Kind = 'mute' | 'solo' | 'dry';
const WORD: Record<Kind, [string, string]> = {
  mute: ['muted', 'unmuted'], solo: ['soloed', 'unsoloed'], dry: ['sent dry', 'given its sends back'],
};

/** What the desk has leant, for the view to draw and a scenario to read. */
export interface DeskState {
  /** band → offset in dB over the room, only where one is leant */
  bands: Partial<Record<Band, number>>;
  /**
   * band → the lean waiting for a master to take it: a cast on its way (a
   * hand's lean made under it, or the armed scene's), a master built again, a
   * recall with nothing playing. The fader shows it and says it waits.
   */
  waits: Partial<Record<Band, number>>;
  /** instrument → path → the number the desk moved it to, only where one is moved (D1) */
  device: Record<string, Record<string, number>>;
  /** a stage block's path → the number the desk moved it to, only where one is moved (D2) */
  stage: Record<string, number>;
}

// --- the saved desk (D3) -----------------------------------------------------

/**
 * **What a scene holds: the desk, every layer.** The strips are the source
 * mixer as the control carries it (a voice muted, soloed, sent dry, or at a
 * level other than unity); the bands are leans in dB over whatever room is
 * playing; the device and stage moves are the **numbers** the desk moved a line
 * to (D1's decision kept: an instrument's number, not an offset from the room,
 * so a scene saved in one room plays the same number in another).
 */
export interface SceneBody {
  mix: { mute: string[]; solo: string[]; dry: string[]; gain: Record<string, number> };
  bands: Partial<Record<Band, number>>;
  device: Record<string, Record<string, number>>;
  stage: Record<string, number>;
}
/** Where and when a scene was saved: for the list to say, never to gate a recall. */
export interface SceneHead {
  name: string;
  /** when, as an ISO time */
  saved: string;
  seed: string;
  /** the theme's index, as the link's `theme=` counts it */
  theme: number;
  /** the engine, by id */
  engine: string;
}
export interface Scene extends SceneBody {
  head: SceneHead;
}

/** Where this browser keeps the scenes: beside the view's other choices (`deep-house.machine.ledger`, `.genre`). */
export const SCENES_KEY = 'deep-house.machine.scenes';
/** The table's shape, by number: a later page reads an earlier one, and an earlier page refuses a later one kindly. */
export const SCENE_SCHEMA = 1;
/** A small table: this many scenes, and a name this long. */
export const SCENE_CAP = 48;
export const SCENE_NAME_MAX = 40;

/** What a read of the table found. */
export interface Shelf {
  /** newest first */
  scenes: Scene[];
  /** a table written by a later page, which this one neither reads nor writes over */
  later: number | null;
  /** entries left out because they were not a scene */
  spoiled: number;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isTable = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const names = (x: unknown): string[] | null => (Array.isArray(x) && x.every((v) => typeof v === 'string') ? [...new Set(x as string[])].sort() : null);
const numbers = (x: unknown): Record<string, number> | null => {
  if (!isTable(x)) return null;
  const out: Record<string, number> = {};
  for (const k of Object.keys(x).sort()) { if (!finite(x[k])) return null; out[k] = x[k] as number; }
  return out;
};

/** One layer of moves in a stable order, so two readings of the same desk are the same text. */
function canonBody(b: SceneBody): SceneBody {
  const gain = Object.fromEntries(Object.entries(b.mix.gain).filter(([, v]) => v !== 1).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0)));
  const bands: Partial<Record<Band, number>> = {};
  for (const band of BANDS) if (finite(b.bands[band]) && b.bands[band] !== 0) bands[band] = b.bands[band];
  const device: Record<string, Record<string, number>> = {};
  for (const v of Object.keys(b.device).sort()) {
    const lines = numbers(b.device[v]);
    if (lines && Object.keys(lines).length) device[v] = lines;
  }
  return {
    mix: { mute: [...new Set(b.mix.mute)].sort(), solo: [...new Set(b.mix.solo)].sort(), dry: [...new Set(b.mix.dry)].sort(), gain },
    bands, device, stage: numbers(b.stage) ?? {},
  };
}
const bodyText = (b: SceneBody): string => JSON.stringify(canonBody(b));

/** A stored entry as a scene, or `null` where it is not one. */
export function asScene(x: unknown): Scene | null {
  if (!isTable(x) || !isTable(x.head) || !isTable(x.mix) || !isTable(x.bands)) return null;
  const h = x.head;
  if (typeof h.name !== 'string' || !h.name.trim() || h.name.length > SCENE_NAME_MAX || typeof h.saved !== 'string'
    || typeof h.seed !== 'string' || !finite(h.theme) || typeof h.engine !== 'string') return null;
  const mute = names(x.mix.mute), solo = names(x.mix.solo), dry = names(x.mix.dry);
  const gain = x.mix.gain === undefined ? {} : numbers(x.mix.gain);
  const bands = numbers(x.bands);
  const stage = numbers(x.stage);
  if (!mute || !solo || !dry || !gain || !bands || !stage || !isTable(x.device)) return null;
  if (Object.keys(bands).some((b) => !(BANDS as readonly string[]).includes(b))) return null;
  for (const lines of Object.values(x.device)) if (!numbers(lines)) return null;
  return {
    head: { name: h.name, saved: h.saved, seed: h.seed, theme: h.theme as number, engine: h.engine },
    ...canonBody({ mix: { mute, solo, dry, gain }, bands, device: x.device as Record<string, Record<string, number>>, stage }),
  };
}

/** The stored table, read: newest first, the spoiled entries left out, a later shape refused. */
export function readShelf(raw: string | null): Shelf {
  if (!raw) return { scenes: [], later: null, spoiled: 0 };
  let t: unknown;
  try { t = JSON.parse(raw); } catch (e) { return { scenes: [], later: null, spoiled: 1 }; }
  if (!isTable(t) || !finite(t.schema)) return { scenes: [], later: null, spoiled: 1 };
  if (t.schema > SCENE_SCHEMA) return { scenes: [], later: t.schema, spoiled: 0 };
  // schema 1 is the first: an earlier one would be read up to this one here
  const all = isTable(t.scenes) ? Object.values(t.scenes) : [];
  const scenes = all.map(asScene).filter((s): s is Scene => s !== null);
  scenes.sort((a, b) => (a.head.saved < b.head.saved ? 1 : a.head.saved > b.head.saved ? -1 : 0));
  return { scenes, later: null, spoiled: all.length - scenes.length };
}

/** The table as it is stored: one key, the scenes by name, and the schema. */
export function shelfText(scenes: Scene[]): string {
  return JSON.stringify({ schema: SCENE_SCHEMA, scenes: Object.fromEntries(scenes.map((s) => [s.head.name, s])) });
}

/** Storage, where there is any and it will have us (as `journal.ts` asks for it). */
export interface Bin { getItem(k: string): string | null; setItem(k: string, v: string): void }
function bin(): Bin | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

/** This viewer's scenes. A browser that keeps nothing has none. */
export function shelf(store: Bin | null = bin()): Shelf {
  try { return readShelf(store ? store.getItem(SCENES_KEY) : null); } catch (e) { return { scenes: [], later: null, spoiled: 0 }; }
}

/** What a save or a delete did, for the block to say. */
export interface Kept { ok: boolean; over?: boolean; why?: string }

/** Keep a scene under its name, over one of the same name. */
export function keepScene(scene: Scene, store: Bin | null = bin()): Kept {
  if (!store) return { ok: false, why: 'this browser keeps nothing' };
  const was = shelf(store);
  if (was.later !== null) return { ok: false, why: 'the scenes here were kept by a later page: not written over' };
  const over = was.scenes.some((s) => s.head.name === scene.head.name);
  if (!over && was.scenes.length >= SCENE_CAP) return { ok: false, why: `${SCENE_CAP} scenes are kept: delete one first` };
  try { store.setItem(SCENES_KEY, shelfText([scene, ...was.scenes.filter((s) => s.head.name !== scene.head.name)])); } catch (e) { return { ok: false, why: 'this browser would not keep it' }; }
  return { ok: true, over };
}

/** Take a scene off the table by its name. */
export function dropScene(name: string, store: Bin | null = bin()): Kept {
  if (!store) return { ok: false, why: 'this browser keeps nothing' };
  const was = shelf(store);
  if (was.later !== null) return { ok: false, why: 'the scenes here were kept by a later page: not written over' };
  if (!was.scenes.some((s) => s.head.name === name)) return { ok: false, why: 'no scene of that name' };
  try { store.setItem(SCENES_KEY, shelfText(was.scenes.filter((s) => s.head.name !== name))); } catch (e) { return { ok: false, why: 'this browser would not keep it' }; }
  return { ok: true };
}

/** A scene's lines, counted the way the list and the ledger count them. */
export function sceneCounts(b: SceneBody): { strips: number; bands: number; device: number; stage: number } {
  const strips = new Set([...b.mix.mute, ...b.mix.solo, ...b.mix.dry, ...Object.keys(b.mix.gain)]).size;
  return {
    strips, bands: Object.keys(b.bands).length,
    device: Object.values(b.device).reduce((n, l) => n + Object.keys(l).length, 0), stage: Object.keys(b.stage).length,
  };
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "3 strips, 2 bands, 5 device lines, 2 stage lines", or "nothing moved". */
export function sayCounts(b: SceneBody): string {
  const c = sceneCounts(b);
  const out = [c.strips && plural(c.strips, 'strip'), c.bands && plural(c.bands, 'band'), c.device && plural(c.device, 'device line'), c.stage && plural(c.stage, 'stage line')].filter(Boolean);
  return out.length ? out.join(', ') : 'nothing moved: a clean desk';
}

/**
 * **How much of a scene the theme playing can use** (D3's greying): a strip
 * for a voice on no lane, a device line of an instrument this theme does not
 * play, a stage line on a box this theme does not build. The bands always
 * apply: every theme has a master. `built` answers a stage path, or `null`
 * where nothing is playing to ask.
 */
export function sceneFit(b: SceneBody, here: { voices: ReadonlySet<string>; built: (path: string) => boolean | null }): { lines: number; out: number; outs: string[] } {
  const c = sceneCounts(b);
  const outs: string[] = [];
  for (const v of new Set([...b.mix.mute, ...b.mix.solo, ...b.mix.dry, ...Object.keys(b.mix.gain)])) if (!here.voices.has(v)) outs.push(`the ${v} strip`);
  for (const [v, lines] of Object.entries(b.device)) if (!here.voices.has(v)) for (const p of Object.keys(lines)) outs.push(`${v}'s ${p}`);
  for (const p of Object.keys(b.stage)) if (here.built(p) === false) outs.push(stageLine(p) ? `${stageLine(p)!.box.title}'s ${stageLine(p)!.line.name}` : p);
  return { lines: c.strips + c.bands + c.device + c.stage, out: outs.length, outs };
}

/** What a recall did: the counts it wrote and the lines it left out. */
export interface Recall { name: string; counts: ReturnType<typeof sceneCounts>; skipped: string[] }

export interface Desk {
  state(): DeskState;
  /** the room's own gain on a band, where a set is playing */
  planned(band: Band): number | null;
  /** the band's gain as the node reads it now */
  reading(band: Band): number | null;
  /**
   * lean a band to an offset over the room; nought takes the lean away. A
   * slider under a finger moves it with `say` false, and writes its one line
   * when it is let go (`said`), so a drag is one line and not forty.
   */
  setBand(band: Band, offset: number, say?: boolean): void;
  /** mute, solo or dry a group of instruments: one source's, or a bus's */
  toggle(kind: Kind, voices: string[], what: string): void;
  /** a level on one instrument, 0–2 */
  setLevel(voice: string, level: number, what: string, say?: boolean): void;
  /** the line a slider let go of writes: where the level or the band now stands */
  said(what: string, voice: string | null, band: Band | null): void;
  /** one source's strip, or a bus's, back to clean */
  resetGroup(voices: string[], what: string): void;
  /**
   * move one number of an instrument's device (D1), clamped to its field, for
   * its next note — and, where the topology declares the line live (D1b), on
   * the notes sounding now, ramped over 40 ms; `null` puts the line back to
   * the row. `say` false is a slider under a finger, which writes its line on
   * release (`saidParam`).
   */
  setParam(voice: string, path: string, value: number | null, say?: boolean): DeviceMove;
  /** the line a device slider let go of writes: where the number now stands */
  saidParam(voice: string, path: string): void;
  /** every line of one instrument's device back to its row */
  resetDevice(voice: string): void;
  /**
   * move one number of a stage block (D2), clamped to its declared line; `null`
   * puts it back to the room. Live where the record's graph holds it, else from
   * the next theme: `how` says which. `say` false is a slider under a finger.
   */
  setStage(path: string, value: number | null, say?: boolean): StageMove & { how: StageHow | null };
  /** the line a stage slider let go of writes */
  saidStage(path: string): void;
  /** every line of one stage box back to the room (by its id), or of every box */
  resetStage(box?: string): void;
  /** how a move on a stage line reaches the record's graph now, or `null` with nothing playing */
  stageHow(path: string): StageHow | null;
  /** everything back: the mixer to clean and the bands to the room; disarms a recalled scene */
  resetAll(): void;
  /** the desk as it stands, every layer, as a scene of this name (D3) */
  scene(name: string): Scene;
  /**
   * recall a scene: the desk cleaned, then every layer written through the
   * desk's own setters, a line this tree lacks left out and said; the scene is
   * armed until RESET or the view closes
   */
  apply(scene: Scene): Recall;
  /** the armed scene, whether the desk has moved since it was recalled, and whether its bands wait for a master */
  armed(): Armed | null;
  /** follow the set: let the bands go before a cast, forget a master that went */
  follow(): void;
  /** the view is closing: let everything go */
  release(): void;
}

/** The armed scene as the block draws it: one value until it changes. */
export interface Armed { name: string; dirty: boolean; waiting: boolean }

const desks = new WeakMap<Control, Desk>();

/** The one desk a control has. */
export function deskFor(control: Control): Desk {
  const had = desks.get(control);
  if (had) return had;
  const made = makeDesk(control);
  desks.set(control, made);
  return made;
}

function makeDesk(control: Control): Desk {
  let bands: Partial<Record<Band, number>> = {};
  let master: unknown = null;
  // one value until something changes, so a component may subscribe to it
  let snap: DeskState = { bands: {}, waits: {}, device: {}, stage: {} };
  const moved = () => { snap = { bands: { ...bands }, waits: owed ? { ...owed.bands } : {}, device: deviceMoves(), stage: stageMoves() }; };

  const mix = () => control.state.mix;
  const paramOf = (band: Band) => {
    const m = mix();
    return m ? m.master.param(`${band}.gain`) : null;
  };
  const planned = (band: Band): number | null => {
    const m = mix();
    if (!m) return null;
    const table = m.masterSettings.master as unknown as Record<string, number>;
    const v = table[DB_OF[band]];
    return Number.isFinite(v) ? v : null;
  };
  // A lean is the master's to keep (round E1): written through its profile's
  // own lines, so a theme's boundary walks the band to the new profile plus it.
  const write = (band: Band, offset: number, over = RAMP) => {
    const m = mix();
    const ctx = control.state.ctx;
    if (!m || !ctx) return;
    m.master.lean(DB_OF[band], offset, ctx.currentTime, over);
  };
  // **The armed scene** (D3): what was recalled, the desk as the recall left
  // it (to tell a desk moved since), and its leans while they wait for a
  // master — the cast's let-go, a master built again, or a recall with nothing
  // playing.
  let armedScene: Scene | null = null;
  let appliedText = '';
  // (a hand's own lean made while a cast is on its way waits here too: it was
  // let go by `follow` a frame later, about 100 ms, the deep review of 10-08)
  let owed: { why: 'cast' | 'master' | 'stopped'; bands: Partial<Record<Band, number>>; from: string | null } | null = null;
  let armedView: Armed | null = null;
  const readSeed = () => { const r = control.readout(); return r ? r.seed : null; };
  const emit = () => control.emit();

  const mixState = (): SourceMix => control.sourceMix;
  const put = (next: SourceMix) => control.setSourceMix(next);

  // The room the record plays in, for the device's row values and the check of
  // a move against the contract's relations; none while nothing is playing.
  const settings = (): Settings | null => {
    const r = control.readout();
    return r && r.track ? settingsOf(r.track) : null;
  };
  // A device line as the panel prints it, for the ledger's sentence.
  const sayLine = (voice: string, path: string): { now: string; row: string } | null => {
    const p = deviceOf(settings(), voice)?.params.find((x) => x.path === path);
    if (!p) return null;
    return { now: sayParam(p), row: sayParam({ ...p, value: p.row ?? p.value }) };
  };
  // A line that reaches the next note only says so after a comma (D1b); a
  // live one — the notes sounding now and the next — is the ordinary case.
  const lineOf = (voice: string, path: string) => {
    const said = sayLine(voice, path);
    const value = snap.device[voice]?.[path];
    const how = howOfLine(voice, path);
    const wait = how === 'next' ? ', from the next note' : '';
    if (value === undefined) note('desk', `${voice}'s ${path} went back to the row${wait}`, { voice, path, ...(said ? { row: said.row } : {}), ...(how ? { how } : {}) });
    else note('desk', `${voice}'s ${path} went to ${said ? said.now : value} (the row's ${said ? said.row : '—'})${wait}`, { voice, path, value, ...(said ? { row: said.row } : {}), ...(how ? { how } : {}) });
  };
  // **The notes sounding now** (D1b): a move on a line the voice's topology
  // declares live is ramped onto every note of it still sounding on the set's
  // context, over 40 ms, as well as written for the next ones; `null` walks
  // them back to the row. Every moved line of every voice, for a reset.
  const sounding = (voice: string, path: string, value: number | null) => {
    const ctx = control.state.ctx;
    if (ctx) moveSounding(voice, path, value, ctx);
  };
  const unsound = (moves: Record<string, Record<string, number>>) => {
    for (const [voice, paths] of Object.entries(moves)) for (const path of Object.keys(paths)) sounding(voice, path, null);
  };
  // **The bodies a move makes stale, rendered again ahead of the hits** (D1):
  // the upcoming window of every deck that is sounding, for these voices, off
  // the tick. A hit that comes first builds itself live from the moved patch,
  // which is the same sound; this is so the next ones read a body again.
  const AHEAD = 30;
  const pending = new Set<string>();
  const refresh = (voices: string[]) => {
    const m = mix();
    const ctx = control.state.ctx;
    if (!m || !ctx || !voices.length) return;
    const first = !pending.size;
    for (const v of voices) pending.add(v);
    if (!first) return;
    setTimeout(() => {
      const vs = [...pending];
      pending.clear();
      for (const deck of [m.record, m.arriving]) {
        if (!deck) continue;
        const from = Math.max(0, deckThemeTime(deck, ctx.currentTime));
        const events = deck.program.events.filter((e) => vs.includes(e.voice) && e.t >= from && e.t < from + AHEAD);
        if (!events.length) continue;
        void prepareMoved(ctx, deck.settings, events, vs).catch((err: unknown) =>
          note('prepare', 'a moved instrument\'s bodies could not be rendered ahead and are built live', { voices: vs.join('+'), why: String((err as Error)?.message ?? err).slice(0, 80) }));
      }
    }, 0);
  };

  // **A stage line, said** (D2): its box's name, the line, the number the
  // panel prints, the room's beside it, and — where the move does not reach
  // the graph that is up — what it waits for.
  const sayStage = (path: string, value: number | null): string => {
    const found = stageLine(path);
    return value === null ? '—' : sayParam({ path, value, unit: found ? found.line.unit : '', kind: 'num' });
  };
  const WAITS: Partial<Record<StageHow, string>> = {
    build: ', from the next theme', line: ', held: the arrangement\'s line writes it this theme', absent: ', not built this theme',
  };
  const stageNote = (path: string, how: StageHow | null) => {
    const found = stageLine(path);
    if (!found) return;
    const S = settings();
    const room = S ? roomOf(S, path) : null;
    const value = snap.stage[path];
    const what = `${found.box.title}'s ${found.line.name}`;
    const data = { path, ...(room !== null ? { room: +room.toPrecision(6) } : {}), ...(how ? { how } : {}) };
    if (value === undefined) note('desk', `${what} went back to the room`, data);
    else note('desk', `${what} went to ${sayStage(path, value)} (the room's ${sayStage(path, room)})${(how && WAITS[how]) || ''}`, { ...data, value });
  };
  const stageHow = (path: string): StageHow | null => {
    const m = mix();
    return m && m.record ? m.record.graph.stageHow(path) : null;
  };
  // the layer's moves off, and each deck's graph put back to its room where it holds the line live
  const unstage = (box?: string): string[] => {
    const paths = clearStage(box);
    const m = mix();
    if (m) for (const p of paths) m.stage(p, null);
    return paths;
  };

  // The desk as a scene's body: the strips the control carries, the leans
  // (the armed scene's where they wait for a master), the device and the stage.
  const held = (): SceneBody => {
    const m = control.sourceMix;
    return canonBody({
      mix: { mute: m.mute, solo: m.solo, dry: m.dry, gain: { ...(m.gain ?? {}) } },
      bands: owed ? owed.bands : bands, device: deviceMoves(), stage: stageMoves(),
    });
  };
  // Everything back, silently: the strips to unity, the bands to the room, the
  // device to its rows and the stage to the room. Whether anything was moved.
  const clean = (): boolean => {
    const devices = Object.keys(snap.device);
    const had = !!(control.sourceMixOn || Object.keys(bands).length || devices.length || Object.keys(snap.stage).length);
    control.resetSources();
    for (const band of Object.keys(bands) as Band[]) { const room = planned(band); if (room != null) write(band, 0); }
    bands = {};
    const was = deviceMoves();
    clearDevice();
    unsound(was);
    unstage();
    moved();
    refresh(devices);
    return had;
  };
  const disarm = () => { armedScene = null; appliedText = ''; owed = null; armedView = null; };

  const desk: Desk = {
    state: () => snap,
    planned,
    reading: (band) => { const p = paramOf(band); return p ? +p.value.toFixed(2) : null; },
    setBand(band, offset, say = true) {
      const room = planned(band);
      if (room == null) return;
      const lean = +Math.max(-BAND_RANGE, Math.min(BAND_RANGE, offset)).toFixed(2);
      // **A lean under a cast waits for it** (the deep review of 10-08): the
      // cast walks the master to the arriving room, and a lean written now was
      // let go by the next frame's `follow`. It is held, shown as waiting, and
      // leant over the new room once the cast has landed.
      if (control.state.castTo) {
        const waiting = { ...(owed ? owed.bands : {}) };
        if ((waiting[band] ?? 0) === lean && owed) return;
        if (lean === 0) delete waiting[band]; else waiting[band] = lean;
        owed = Object.keys(waiting).length || armedScene ? { why: 'cast', bands: waiting, from: owed && owed.why === 'cast' ? owed.from : readSeed() } : null;
        moved();
        if (say) note('desk', lean === 0 ? `the master's ${band} will stay at the room after the cast` : `the master's ${band} will be leant ${lean > 0 ? '+' : ''}${lean} dB once the cast lands`, {
          band, offset: lean, to: control.state.castTo,
        });
        emit();
        return;
      }
      if ((bands[band] ?? 0) === lean) return;
      master = mix() ? mix()!.master : null;
      if (lean === 0) delete bands[band]; else bands[band] = lean;
      moved();
      write(band, lean);
      if (say) note('desk', lean === 0 ? `the master's ${band} went back to the room` : `the master's ${band} was leant ${lean > 0 ? '+' : ''}${lean} dB`, {
        band, offset: lean, room: +room.toFixed(2), gain: +(room + lean).toFixed(2),
      });
      emit();
    },
    toggle(kind, voices, what) {
      if (!voices.length) return;
      const cur = mixState();
      const off = voices.every((v) => cur[kind].includes(v));
      const list = off ? cur[kind].filter((v) => !voices.includes(v)) : [...new Set([...cur[kind], ...voices])];
      put({ ...cur, [kind]: list });
      note('desk', `${what} was ${WORD[kind][off ? 1 : 0]}`, {
        voices: voices.join('+'), muted: control.sourceMix.mute.join('+') || '—', soloed: control.sourceMix.solo.join('+') || '—',
      });
    },
    setLevel(voice, level, what, say = true) {
      const cur = mixState();
      const v = +Math.max(0, Math.min(2, level)).toFixed(2);
      if ((cur.gain?.[voice] ?? 1) === v) return;
      put({ ...cur, gain: { ...cur.gain, [voice]: v } });
      if (say) note('desk', `${what}'s ${voice} went to ${Math.round(v * 100)} %`, { voice, level: v, db: v > 0 ? +(20 * Math.log10(v)).toFixed(1) : '−∞' });
    },
    said(what, voice, band) {
      if (voice) {
        const v = control.sourceMix.gain?.[voice] ?? 1;
        note('desk', `${what}'s ${voice} went to ${Math.round(v * 100)} %`, { voice, level: v, db: v > 0 ? +(20 * Math.log10(v)).toFixed(1) : '−∞' });
      }
      if (band) {
        const room = planned(band);
        const waits = owed && control.state.castTo ? owed.bands[band] : undefined;
        if (waits !== undefined) { note('desk', `the master's ${band} will be leant ${waits > 0 ? '+' : ''}${waits} dB once the cast lands`, { band, offset: waits, to: control.state.castTo }); return; }
        const lean = bands[band] ?? 0;
        if (room != null) note('desk', lean ? `the master's ${band} was leant ${lean > 0 ? '+' : ''}${lean} dB` : `the master's ${band} went back to the room`,
          { band, offset: lean, room: +room.toFixed(2), gain: +(room + lean).toFixed(2) });
      }
    },
    setParam(voice, path, value, say = true) {
      const got = setDeviceParam(voice, path, value, settings());
      if (!got.changed) return got;
      sounding(voice, path, got.value);
      moved();
      if (say) { lineOf(voice, path); refresh([voice]); }
      emit();
      return got;
    },
    saidParam(voice, path) {
      lineOf(voice, path);
      refresh([voice]);
    },
    resetDevice(voice) {
      const was = { [voice]: deviceMoves()[voice] ?? {} };
      if (!clearDevice(voice)) return;
      unsound(was);
      moved();
      note('desk', `${voice}'s device went back to the row`, { voice });
      refresh([voice]);
      emit();
    },
    setStage(path, value, say = true) {
      const got = setStageParam(path, value, settings());
      if (!got.changed) return { ...got, how: stageHow(path) };
      moved();
      const m = mix();
      const how = m ? m.stage(path, got.value) : null;
      if (say) stageNote(path, how);
      emit();
      return { ...got, how };
    },
    saidStage(path) {
      stageNote(path, stageHow(path));
    },
    resetStage(box) {
      const paths = unstage(box);
      if (!paths.length) return;
      moved();
      const found = stageLine(paths[0]);
      note('desk', box && found ? `${found.box.title} went back to the room` : 'every stage block went back to the room', { paths: paths.join('+') });
      emit();
    },
    stageHow,
    resetGroup(voices, what) {
      const cur = mixState();
      const gain = { ...cur.gain };
      for (const v of voices) delete gain[v];
      const drop = (xs: string[]) => xs.filter((v) => !voices.includes(v));
      const next = { mute: drop(cur.mute), solo: drop(cur.solo), dry: drop(cur.dry), gain };
      if (JSON.stringify(next) === JSON.stringify({ ...cur, gain: { ...cur.gain } })) return;
      put(next);
      note('desk', `${what} went back to clean`, { voices: voices.join('+') });
    },
    resetAll() {
      const had = clean();
      disarm();
      if (had) note('desk', 'the desk went back to clean: every source at unity, every device at its row, every stage block and the master at the room');
      emit();
    },
    scene(name) {
      const r = control.readout();
      return {
        head: {
          name: name.trim().slice(0, SCENE_NAME_MAX), saved: new Date().toISOString(),
          seed: r ? r.seed : '', theme: control.state.themeIndex ?? 0, engine: r ? r.strategy : '',
        },
        ...held(),
      };
    },
    apply(scene) {
      const name = scene.head.name;
      const said = `the scene '${name}'`;
      clean();
      disarm();
      const skipped: string[] = [];
      // the strips: a voice this tree has no instrument for is left out
      const known = (v: string) => { if (BY_NAME[v]) return true; skipped.push(`the ${v} strip`); return false; };
      const strips = [...new Set([...scene.mix.mute, ...scene.mix.solo, ...scene.mix.dry, ...Object.keys(scene.mix.gain)])].filter(known);
      const keep = (xs: string[]) => xs.filter((v) => strips.includes(v));
      const gain = Object.fromEntries(Object.entries(scene.mix.gain).filter(([v]) => strips.includes(v)).map(([v, x]) => [v, +Math.max(0, Math.min(2, x)).toFixed(2)]));
      if (strips.length) put({ mute: keep(scene.mix.mute), solo: keep(scene.mix.solo), dry: keep(scene.mix.dry), gain });
      // the bands: leant now where a master is up, else when one is
      const leans: Partial<Record<Band, number>> = {};
      for (const band of BANDS) {
        const x = scene.bands[band];
        if (finite(x) && x !== 0) leans[band] = +Math.max(-BAND_RANGE, Math.min(BAND_RANGE, x)).toFixed(2);
      }
      const leanNow = BANDS.some((b) => planned(b) != null);
      if (leanNow) for (const band of Object.keys(leans) as Band[]) desk.setBand(band, leans[band]!, false);
      else if (Object.keys(leans).length) owed = { why: 'stopped', bands: leans, from: null };
      // the device and the stage, through their setters: a line refused is a line left out
      const voices: string[] = [];
      for (const [voice, lines] of Object.entries(scene.device)) for (const [path, x] of Object.entries(lines)) {
        const got = desk.setParam(voice, path, x, false);
        if (got.refused) skipped.push(`${voice}'s ${path}`);
        else if (!voices.includes(voice)) voices.push(voice);
      }
      const waits: Record<string, string> = {};
      for (const [path, x] of Object.entries(scene.stage)) {
        const got = desk.setStage(path, x, false);
        if (got.refused) { skipped.push(stageLine(path) ? `${stageLine(path)!.box.title}'s ${stageLine(path)!.line.name}` : path); continue; }
        const wait = got.how ? WAITS[got.how] : undefined;
        if (wait) waits[path] = wait.replace(/^, /, '');
      }
      refresh(voices);
      moved();
      armedScene = { ...scene, bands: leans };
      appliedText = bodyText(held());
      armedView = null;
      // **one line a layer**, under one that says the whole of it
      const now = held();
      note('desk', `${said} was recalled: ${sayCounts(now)}`, { scene: name, seed: scene.head.seed, theme: scene.head.theme, engine: scene.head.engine, skipped: skipped.length });
      if (strips.length) {
        const m = control.sourceMix;
        note('desk', `${said} set ${plural(strips.length, 'strip')}: ${strips.map((v) => [
          m.mute.includes(v) && 'muted', m.solo.includes(v) && 'soloed', m.dry.includes(v) && 'sent dry',
          (m.gain?.[v] ?? 1) !== 1 && `at ${Math.round((m.gain?.[v] ?? 1) * 100)} %`,
        ].filter(Boolean).map((w, i) => (i ? w : `${v} ${w}`)).join(', ')).join('; ')}`, { voices: strips.join('+') });
      }
      if (Object.keys(leans).length) {
        const text = (Object.keys(leans) as Band[]).map((b) => `${b} ${leans[b]! > 0 ? '+' : ''}${leans[b]} dB`).join(', ');
        note('desk', leanNow ? `${said} leant the master: ${text}` : `${said} will lean the master when a set plays: ${text}`, { bands: Object.keys(leans).join('+') });
      }
      const lines = Object.entries(now.device).flatMap(([v, ls]) => Object.keys(ls).map((p) => { const s = sayLine(v, p); return `${v}'s ${p} ${s ? s.now : ls[p]}`; }));
      if (lines.length) note('desk', `${said} moved ${plural(lines.length, 'device line')}: ${lines.join(', ')}`, { voices: Object.keys(now.device).join('+') });
      const stages = Object.keys(now.stage).map((p) => {
        const found = stageLine(p);
        return `${found ? `${found.box.title}'s ${found.line.name}` : p} ${sayStage(p, now.stage[p])}${waits[p] ? ` (${waits[p]})` : ''}`;
      });
      if (stages.length) note('desk', `${said} moved ${plural(stages.length, 'stage line')}: ${stages.join(', ')}`, { paths: Object.keys(now.stage).join('+') });
      if (skipped.length) note('desk', `${said} left out what this page does not have: ${skipped.join(', ')}`, { skipped: skipped.length });
      emit();
      return { name, counts: sceneCounts(now), skipped };
    },
    armed() {
      if (!armedScene) return null;
      const dirty = bodyText(held()) !== appliedText;
      const waiting = !!owed;
      if (!armedView || armedView.name !== armedScene.head.name || armedView.dirty !== dirty || armedView.waiting !== waiting) armedView = { name: armedScene.head.name, dirty, waiting };
      return armedView;
    },
    follow() {
      const m = mix();
      if (Object.keys(bands).length) {
        if (!m || m.master !== master) {
          // a stop and a start built a new master at the room: nothing to let go
          bands = {};
          moved();
          note('desk', 'the master was built again, at the room: the bands\' leans went with the old one');
          if (armedScene && Object.keys(armedScene.bands).length) owed = { why: 'master', bands: { ...armedScene.bands }, from: null };
          emit();
        } else if (control.state.castTo) {
          for (const band of Object.keys(bands) as Band[]) { const room = planned(band); if (room != null) write(band, 0); }
          bands = {};
          moved();
          note('desk', 'a cast is arriving: the master\'s bands went back to the room before it retunes them', { to: control.state.castTo });
          // the armed scene's leans wait for the cast to land, and are leant again over its room
          // (beside whatever a hand has leant under the cast already, which wins)
          if (armedScene && Object.keys(armedScene.bands).length) owed = { why: 'cast', bands: { ...armedScene.bands, ...(owed && owed.why === 'cast' ? owed.bands : {}) }, from: readSeed() };
          emit();
        }
      }
      // **the armed scene's leans, leant again** once there is a master and no
      // cast on its way: over a bar, so they walk in beside the room's own walk
      // to the arriving seed (`retuneMaster`) rather than stepping across it
      if (owed && m && !control.state.castTo && BANDS.some((b) => planned(b) != null)) {
        const was = owed;
        owed = null;
        const over = m.record ? m.record.program.barSeconds : RAMP;
        master = m.master;
        for (const band of Object.keys(was.bands) as Band[]) {
          const lean = was.bands[band]!;
          if (planned(band) == null) continue;
          bands[band] = lean;
          write(band, lean, over);
        }
        moved();
        const seed = readSeed();
        const what = !armedScene
          ? (seed !== was.from ? 'the master\'s bands were leant once the cast landed, as the hand asked under it' : 'the cast did not come: the master\'s bands were leant as the hand asked')
          : was.why === 'cast'
          ? (seed !== was.from ? 'the armed scene\'s bands were leant again after the cast' : 'the cast did not come: the armed scene\'s bands were leant again')
          : was.why === 'master' ? 'the armed scene\'s bands were leant again on the master built again' : 'the armed scene\'s bands were leant on the master';
        note('desk', what, { ...(armedScene ? { scene: armedScene.head.name } : {}), bands: Object.keys(was.bands).join('+'), bars: m.record ? 1 : 0 });
        emit();
      }
    },
    release() {
      disarm();
      for (const band of Object.keys(bands) as Band[]) { const room = planned(band); if (room != null && mix() && mix()!.master === master) write(band, 0); }
      bands = {};
      // and the master it leant is not held past the view (10-08): a graph
      // the next open would only compare against, kept alive meanwhile
      master = null;
      // the device's moves go with the view (D0's rule; D3 keeps only what is
      // saved, and a saved scene is in the browser, not on the desk): the next
      // note of each is the row's again, and its bodies are rendered back
      const devices = Object.keys(snap.device);
      const was = deviceMoves();
      clearDevice();
      unsound(was);
      // and the stage's (D2): each graph that holds a line live is put back to its room
      unstage();
      moved();
      refresh(devices);
    },
  };
  return desk;
}

export default deskFor;
