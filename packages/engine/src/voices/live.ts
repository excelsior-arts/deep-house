// The notes sounding now, per voice, and what each can still be told.
//
// PLAN-DESK D1b (10-04). Until this round a desk move on an instrument's row
// reached its **next** note only: the layer under `patchOf` (`desk-layer.ts`)
// is read when a note is built, and a note already sounding kept the numbers
// it was built from. That is right for what decides a build — a count of saws,
// a clip's curve, an envelope's legs already scheduled, a drum body rendered
// ahead — and wrong for everything a sounding note still holds an audio
// parameter for: a filter's corner, a resonance, a movement's rate, a level.
// Eugene, 10-04: *"not having feedback it's really hard to operate."*
//
// So a voice that builds a note hands the engine a **handle** for it, by the
// row's own paths (`cutoffHz`, `resonanceDb`, `breath.level`): for each, the
// audio parameter the path is, or a setter that does the voice's own
// arithmetic (a resonance in decibels onto a Q, a level against the note's
// scale, a corner through the knob's factor the note was built with). The
// topology declares which paths its sounding note can still take — its `live`
// table (`sound.ts`) — and the desk's move ramps every live note of the voice
// to the moved number over 40 ms (`moveLive`), beside writing the layer for
// the notes to come. A path the topology does not declare reaches the next
// note only, as it always did.
//
// **What it costs the ring.** Registering is one map write per note, on a
// context that is playing (an offline render registers nothing: a desk move is
// never written into an export), and nothing at all while nothing moves: no
// timer per note, no reading per sample. The notes whose end has passed are
// let go on each move and on one slow timer, never per note. MEASURED in the
// round's note (`notes/rounds/desk-d1b.md`).
//
// **Armed** is the one other thing here: while the machine view's desk is up
// (`armLive`), a voice builds at nought a layer its row leaves out at nought —
// the strings' breath — so that a hand bringing it in is heard on the note
// that is sounding. Away from the desk nothing is built that the row does not
// ask for, which is the ring's ordinary play to the node.
//
// It imports nothing that renders, so a voice and the desk can both read it.

import { line } from '../ramp.ts';
import type { Line } from '../ramp.ts';
import type { Settings } from '../settings.ts';
import type { SoundRow } from './sound.ts';
import { stepsOf } from './desk-layer.ts';

/**
 * How a live path is in the note: what kind of number the handle takes, which
 * is the row's own unit (a corner in hertz, a resonance in decibels, a level, a
 * share, a pitch spread in cents, a filter's Q, a ratio, a side).
 */
export const LIVE_KINDS = ['hz', 'db', 'level', 'ratio', 'cents', 'q', 'x', 'pan'] as const;
export type LiveKind = typeof LIVE_KINDS[number];

/** Which paths of a row a sounding note of its topology can still take, and in what. */
export type LiveTable = Readonly<Record<string, LiveKind>>;

/**
 * A path's number onto a sounding note, at an instant and over a ramp: the
 * voice's own arithmetic, writing the parameters it built. `value` is the
 * row's number (what the device line reads), never the parameter's.
 */
export type ParamSetter = (value: number, at: number, over: number) => void;

/** One sounding note, as the desk can reach it. */
export interface LiveHandle {
  /** by the row's path: the audio parameter that is the number itself, or a setter that does the voice's arithmetic */
  params: Readonly<Record<string, AudioParam | ParamSetter>>;
  /** the context the note plays on: a move is written on its clock */
  ctx: BaseAudioContext;
  /** the row and the room the note was built in, for a move back to the row */
  row: SoundRow;
  settings: Settings | null;
}

/** A registered note: its handle and the instant it is silent. */
export interface LiveEntry {
  handle: LiveHandle;
  /** the instant the note is silent, in its context's seconds; `Infinity` for a held voice not yet released */
  until: number;
}

// The notes, by the row's id. A set per voice, so a registration is one add.
const notes = new Map<string, Set<LiveEntry>>();
let armed = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** The slow timer's period: a note's handle outlives its end by at most this. */
export const PRUNE_MS = 4000;

const isOffline = (ctx: BaseAudioContext): boolean =>
  typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

/** Whether a voice building a note on this context should hand its handle over: a playing context, never an offline render. */
export const registers = (ctx: BaseAudioContext): boolean => !isOffline(ctx);

/**
 * **Keep a sounding note** (D1b): its handle, by the row's id, until `until`.
 * One add to a set. Hands back the entry, so a held voice can say when it ends
 * (`until`) or let it go (`dropLive`).
 */
export function liveNote(voice: string, handle: LiveHandle, until: number): LiveEntry | null {
  if (isOffline(handle.ctx)) return null;
  const entry: LiveEntry = { handle, until };
  let set = notes.get(voice);
  if (!set) notes.set(voice, (set = new Set()));
  set.add(entry);
  if (!timer && typeof setInterval === 'function') {
    timer = setInterval(prune, PRUNE_MS);
    (timer as { unref?: () => void }).unref?.();
  }
  return entry;
}

/** Let one registered note go now (a held voice disposed). */
export function dropLive(voice: string, entry: LiveEntry | null): void {
  if (!entry) return;
  const set = notes.get(voice);
  if (!set) return;
  set.delete(entry);
  if (!set.size) notes.delete(voice);
}

/** Let go every note whose end has passed on its own clock. */
export function prune(): number {
  let gone = 0;
  for (const [voice, set] of notes) {
    for (const e of set) if (e.until <= e.handle.ctx.currentTime) { set.delete(e); gone++; }
    if (!set.size) notes.delete(voice);
  }
  if (!notes.size && timer) { clearInterval(timer); timer = null; }
  return gone;
}

/** The notes of one voice still sounding (pruned first). */
export function liveNotes(voice: string): LiveHandle[] {
  prune();
  return [...(notes.get(voice) ?? [])].map((e) => e.handle);
}

/** How many notes are kept, over every voice: what a gate reads. */
export const liveCount = (): number => { let n = 0; for (const s of notes.values()) n += s.size; return n; };

/** Forget every note (a gate between two of its probes). */
export function clearLive(): void {
  notes.clear();
  if (timer) { clearInterval(timer); timer = null; }
}

/** The desk is up: voices build at nought a layer the row leaves out, so a hand can bring it in on the note that sounds. */
export function armLive(on: boolean): void { armed = on; }
/** Whether the desk is up (`armLive`). */
export const liveArmed = (): boolean => armed;

/** The value at a path of a row's numbers, or `undefined`. */
function readPath(o: unknown, path: string): unknown {
  let at = o;
  for (const s of stepsOf(path)) {
    if (!at || typeof at !== 'object') return undefined;
    at = (at as Record<string | number, unknown>)[s];
  }
  return at;
}

/** The ramp a desk move takes on a sounding note: the stage's, 40 ms. */
export const LIVE_RAMP = 0.04;

// The row's number at a path in a note's own room: what a move back to the
// row ramps to. `rowBase` is passed in rather than imported, so this file
// reads nothing that renders (`sound.ts` imports the layer it sits beside).
type BaseOf = (settings: Settings | null, row: SoundRow) => Readonly<Record<string, unknown>>;
let baseOf: BaseOf = (_s, row) => row.parameters;
/** `sound.ts` hands its `rowBase` over at load, so a reset reads the room's copy of the row. */
export const useRowBase = (f: BaseOf): void => { baseOf = f; };

// A bare AudioParam a handle names: its own line, so a second move starts
// from where the first had got to.
const bare = new WeakMap<AudioParam, Line>();

/**
 * **A desk move onto the notes sounding now** (D1b): every live note of
 * `voice` whose handle names `path`, ramped to `value` — the row's number,
 * through each note's own arithmetic — from now over `over`; `null` is back
 * to the row, the number the note's own room gives it. With `ctx`, only the
 * notes on that context (the set playing, never an export). How many notes
 * took it.
 */
export function moveLive(voice: string, path: string, value: number | null, ctx: BaseAudioContext | null = null, over = LIVE_RAMP): number {
  prune();
  const set = notes.get(voice);
  if (!set) return 0;
  let n = 0;
  for (const e of set) {
    const h = e.handle;
    if (ctx && h.ctx !== ctx) continue;
    const target = h.params[path];
    if (!target) continue;
    const v = value ?? readPath(baseOf(h.settings, h.row), path);
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const at = h.ctx.currentTime;
    if (typeof target === 'function') target(v, at, over);
    else {
      let l = bare.get(target);
      if (!l) bare.set(target, (l = line(h.ctx, target, target.value)));
      l.to(v, at, over);
    }
    n++;
  }
  return n;
}

/**
 * **A note's live paths, built where the note is built.** A voice asks for one
 * (`liveOf`, which is `null` on an offline render, so a render builds no
 * closure), says for each path what the parameters it built are to be told
 * for a number of the row (`on`), and registers it once its end is known
 * (`keep`). Each parameter is moved along its own line (`ramp.ts`), started
 * from the value it was given when it was built, so a second move starts from
 * where the first had got to and never from a stale reading.
 */
export interface LiveBuilder {
  /**
   * `write` turns the row's number into the parameters a move of `path`
   * reaches and the values they are to stand at; an empty list where the note
   * holds nothing for it (a part not built, a note's own control over the row's).
   * A parameter that carries a ramp the note wrote is `seed`ed with it, so a
   * move cuts it where it had got to.
   */
  on(path: string, write: (v: number) => ReadonlyArray<readonly [AudioParam, number]>): LiveBuilder;
  /** a setter of the voice's own, for a path whose move is not a parameter to a value (a held voice's control) */
  set(path: string, setter: ParamSetter): LiveBuilder;
  /** a parameter's known history before any move: its value, or the ramp the note wrote */
  seed(param: AudioParam, from: number | { from: number; to: number; start: number; end: number }): LiveBuilder;
  /** a parameter's line, for a setter that chooses its own instant (a vibrato that arrives after the attack) */
  line(param: AudioParam): Line;
  /** hand the note over, until it is silent */
  keep(voice: string, row: SoundRow, settings: Settings | null, until: number): LiveEntry | null;
}

/** A builder for one note's live paths, or `null` where nothing is registered (an offline render). */
export function liveOf(ctx: BaseAudioContext): LiveBuilder | null {
  if (isOffline(ctx)) return null;
  const params: Record<string, AudioParam | ParamSetter> = {};
  const lines = new Map<AudioParam, Line>();
  const seeds = new Map<AudioParam, number | { from: number; to: number; start: number; end: number }>();
  const lineOf = (p: AudioParam): Line => {
    let l = lines.get(p);
    if (!l) {
      const s = seeds.get(p);
      lines.set(p, (l = line(ctx, p, s === undefined ? p.value : s)));
    }
    return l;
  };
  const b: LiveBuilder = {
    on(path, write) {
      params[path] = (v, at, over) => { for (const [p, x] of write(v)) if (Number.isFinite(x)) lineOf(p).to(x, at, over); };
      return b;
    },
    set(path, setter) { params[path] = setter; return b; },
    seed(param, from) { seeds.set(param, from); return b; },
    line: lineOf,
    keep(voice, row, settings, until) { return liveNote(voice, { params, ctx, row, settings }, until); },
  };
  return b;
}

/** A side, as `panner` holds it when it builds one: hard left to hard right. */
export const side = (x: number): number => Math.max(-1, Math.min(1, x));

/** Cents between two corners: what a filter's `detune` is told to move a corner it was built at onto another, keeping every ramp the note wrote on its frequency. */
export const centsOf = (to: number, from: number): number => (to > 0 && from > 0 ? 1200 * Math.log2(to / from) : 0);
