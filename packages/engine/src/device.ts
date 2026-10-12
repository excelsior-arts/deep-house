// The device: one instrument's numbers, as the desk reads them.
//
// PLAN-DESK D0 (10-04). The desk's principle is that the declared parameter is
// the unit of the interface, and the inventory it asked for — *every parameter
// the engine reads, declared or fixed with a reason* — exists by construction
// since the sounds became rows (R1, R2, 10-02/03): a topology's contract
// (`voices/schema.ts`) names exactly the fields a row carries, each in its
// range, and `soundFaults` refuses a row with a number nothing reads or without
// one the topology renders from. What was missing was a way to *see* it. This
// file is that: the row's parameters, resolved the way the note resolves them
// (the room's block where the row names one, the row's own numbers otherwise),
// flattened to one line each with its value, its unit, its range, and the knob
// a bird moves it by or the control a part writes on it where there is one.
//
// It is a description and writes nothing: a reading of a value the plan froze,
// taken on demand by the strip's popover and never on the frame.
//
// **D1: the lines become setters** (10-04). `setDeviceParam` puts a number on
// the desk's layer (`voices/desk-layer.ts`), clamped to the field's own range,
// and the next note of the voice renders from it — through `patchOf`, the one
// door every topology reads its numbers by, which hands back the very same
// patch where nothing is moved. A note already sounding keeps the numbers it
// was built from. The device reads the moved value and keeps the row's beside
// it (`row`), so a panel can say what moved and from where. It is the page's:
// no plan, link or lock ever sees it.
//
// **A dispatcher's device** (round SOUNDS-R3): `pad` and `keys` are event
// names standing for several rows, and their own lines are their table and
// their controls — words, read and not moved. Asked with the timbres a theme's
// events of the voice name (`p.timbre`, `p.preset`), the device carries one
// device more per row those timbres render through (`parts`), each a row like
// any other, with its setters: the drone pad's strings with their breath,
// their corner, their voices and their detune.
//
// **D1b: a line says how it reaches the sound** (10-04). A topology declares
// which of its paths a sounding note can still take (`Topology.live`), and a
// numeric line reads `how`: `live` where a move ramps the notes sounding now
// as well as the next ones (`moveLive`, over 40 ms), `next` where it is heard
// from the next note — what decides a build: a count, a curve, an envelope's
// legs already scheduled, a body rendered ahead.

import { BY_NAME, rowOfTimbre } from './voices/index.ts';
import { TOPOLOGIES } from './voices/topologies.ts';
import { contractFaults, unitOf } from './voices/schema.ts';
import type { Field, Fields, FieldUnit, NumField } from './voices/schema.ts';
import { clearMoves, layerVersion, movedAll, movedOf, putMove, stepsOf } from './voices/desk-layer.ts';
import { admittedOf, deskFault, rowBase } from './voices/sound.ts';
import type { Settings } from './settings.ts';
import type { ProgramEvent } from './program.ts';
import type { PrepareHook } from './voices/descriptor.ts';
import type { ControlSpec, KnobSpec } from './voices/descriptor.ts';
import { BLOCKS } from './params.ts';
import { moveLive } from './voices/live.ts';
import { CONTOUR_DEPTH, CONTOUR_DEPTH_PATH } from './voices/output-envelope.ts';
import type { SoundRow } from './voices/sound.ts';

export { armLive, clearLive, liveArmed, liveCount, liveNotes, moveLive, LIVE_RAMP } from './voices/live.ts';

/** One parameter of a device, as one line of the panel. */
export interface DeviceParam {
  /** the field's path in the row: `cutoffHz`, `clip.drive`, `ratios.bright` */
  path: string;
  /** what the note renders from, now; `null` for a part the row does not build */
  value: number | string | boolean | null;
  /** what the value is in; `''` for a bare number, a word or a switch */
  unit: FieldUnit | '';
  /** the field's kind: a number, a switch, a word, a name */
  kind: 'num' | 'bool' | 'word' | 'name' | 'list' | 'table';
  min?: number;
  max?: number;
  /** a whole number */
  int?: boolean;
  /** the knob a bird moves this parameter by, where the topology maps one onto it */
  knob?: { name: string } & KnobSpec;
  /** the control a part writes this parameter by, where the topology maps one onto it */
  control?: { name: string } & ControlSpec;
  /** where the desk has moved it (D1): the row's own value — the room's copy of it, where a block voices it — under the move */
  row?: number;
  /**
   * how a move on a numeric line reaches the sound (D1b): `live`, the notes
   * sounding now as well as the next ones; `next`, from the next note
   */
  how?: DeviceHow;
}

/** How a device line's move reaches the sound: the notes sounding now and the next (`live`), or the next note only (`next`). */
export type DeviceHow = 'live' | 'next';

/** One instrument's device: the facts of its row and its parameters, in the row's own order. */
export interface Device {
  voice: string;
  topology: string;
  revision: number;
  /** the block of the settings table the room voices, or `null` for a row rendered from its own numbers */
  block: string | null;
  bus: string;
  /** the key in the settings' `levels` it is trimmed to, and that level now */
  level: string;
  levelDb: number | null;
  cost: string;
  returns: string[];
  /** the loudness its timbre table measured, for the one timbre it makes; `null` with several or none */
  loudnessDb: number | null;
  params: DeviceParam[];
  /** the knobs the row declares that map onto no parameter (a property the voice computes) */
  knobs: Array<{ name: string } & KnobSpec>;
  /** the controls the row declares that map onto no parameter (a note's own: a colour, a vowel) */
  controls: Array<{ name: string } & ControlSpec>;
  /** why the desk's moves on it are not being played, where a room's numbers made them break the contract; else `null` */
  fault: string | null;
  /** the block or blocks that voice a row the room reaches by voicing (`voicedBy`), else empty */
  voicedBy: string[];
  /**
   * for a dispatcher asked with timbres: one device per row they render
   * through, in the order the timbres were asked, each with the timbres that
   * reach it; else empty
   */
  parts: Array<{ timbres: string[]; device: Device }>;
}

const isTable = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The value's own fields, flattened in the contract's order. */
function walk(fields: Fields, values: Record<string, unknown>, at: string, out: DeviceParam[]): void {
  for (const [name, f0] of Object.entries(fields)) {
    const path = at ? `${at}.${name}` : name;
    const v = values[name];
    let f: Field = f0;
    while (f.kind === 'maybe') f = f.of;
    if (f.kind === 'table') {
      if (v === null || v === undefined) { out.push({ path, value: null, unit: '', kind: 'table' }); continue; }
      if (isTable(v)) walk(f.fields, v, path, out);
      continue;
    }
    if (f.kind === 'map') {
      if (!isTable(v)) { out.push({ path, value: null, unit: '', kind: 'table' }); continue; }
      let g: Field = f.of;
      while (g.kind === 'maybe') g = g.of;
      for (const [k, x] of Object.entries(v)) {
        if (g.kind === 'table' && isTable(x)) walk(g.fields, x, `${path}.${k}`, out);
        else out.push(leaf(`${path}.${k}`, g, x));
      }
      continue;
    }
    if (f.kind === 'list') {
      const xs = Array.isArray(v) ? v : [];
      let g: Field = f.of;
      while (g.kind === 'maybe') g = g.of;
      if (g.kind === 'table') { xs.forEach((x, i) => { if (isTable(x)) walk((g as { fields: Fields }).fields, x, `${path}[${i}]`, out); }); continue; }
      // a list of numbers is a line a number (the liquid knobs, 10-07: the sine's third harmonic is
      // `subHarmonics[1]`), each in the list's own field; a list of lists is read, one line
      if (g.kind === 'num' && xs.length && xs.every((x) => typeof x === 'number')) { xs.forEach((x, i) => out.push(leaf(`${path}[${i}]`, g, x))); continue; }
      out.push({ path, value: xs.map((x) => (typeof x === 'number' ? +x.toFixed(4) : String(x))).join(' '), unit: unitOf(path, g), kind: 'list' });
      continue;
    }
    if (f.kind === 'either') {
      // a number, or the word naming the room's field that holds it: typed by what it is
      const num = f.a.kind === 'num' ? f.a : f.b.kind === 'num' ? f.b : null;
      if (typeof v === 'number' && num) out.push(leaf(path, num, v));
      else out.push({ path, value: v === null || v === undefined ? null : String(v), unit: '', kind: 'name' });
      continue;
    }
    out.push(leaf(path, f, v));
  }
}

function leaf(path: string, f: Field, v: unknown): DeviceParam {
  const value: DeviceParam['value'] = v === null || v === undefined ? null
    : typeof v === 'number' ? v : typeof v === 'boolean' ? v : String(v);
  if (f.kind === 'num') return { path, value, unit: unitOf(path, f), kind: 'num', min: f.min, max: f.max, ...(f.int ? { int: true } : {}) };
  if (f.kind === 'bool') return { path, value, unit: '', kind: 'bool' };
  if (f.kind === 'word') return { path, value, unit: '', kind: 'word' };
  return { path, value, unit: '', kind: 'name' };
}

/**
 * The device of one instrument under these settings, or `null` for a name the
 * registry has no row for (a legacy voice, or nothing). With no settings — a
 * registry question with no theme playing — a row with a block reads the row's
 * own numbers, which is the house's copy of them.
 */
export function deviceOf(settings: Settings | null, voice: string, timbres: readonly string[] = []): Device | null {
  // an event name, or a row a dispatcher renders through (a timbre row has no event name of its own)
  const d = BY_NAME[voice] ?? admittedOf(voice);
  const row = d && d.row;
  if (!row || row.id !== voice) return null;
  const topology = TOPOLOGIES[row.topology];
  if (!topology) return null;
  const S = settings as unknown as Record<string, unknown> | null;
  const block = row.block !== undefined && BLOCKS[row.block] === row.id ? row.block : null;
  const resolved = rowBase(settings, row);
  const params: DeviceParam[] = [];
  walk(topology.parameters.fields, resolved as Record<string, unknown>, '', params);
  // the row's output contour, where it has one: its depth, a line beside the contract's (`output-envelope.ts`)
  const contour = row.descriptor.contour;
  if (contour) params.push({ ...leaf(CONTOUR_DEPTH_PATH, CONTOUR_DEPTH, contour.depth ?? 1), unit: 'ratio' });
  const byPath = new Map(params.map((p) => [p.path, p]));
  const live = topology.live ?? {};
  for (const p of params) if (p.kind === 'num') p.how = Object.prototype.hasOwnProperty.call(live, p.path) ? 'live' : 'next';
  for (const [path, value] of movedOf(voice) ?? []) {
    const p = byPath.get(path);
    if (p && typeof p.value === 'number') { p.row = p.value; p.value = value; }
  }
  const knobs: Device['knobs'] = [];
  for (const [name, spec] of Object.entries(d.knobs ?? {})) {
    const param = topology.knobOf?.[name];
    const p = param ? byPath.get(param) : undefined;
    if (p) p.knob = { name, ...spec }; else knobs.push({ name, ...spec });
  }
  const controls: Device['controls'] = [];
  for (const [name, spec] of Object.entries(d.controls ?? {})) {
    const param = topology.controlOf?.[name];
    const p = param ? byPath.get(param) : undefined;
    if (p) p.control = { name, ...spec }; else controls.push({ name, ...spec });
  }
  const levels = S && isTable(S.levels) ? (S.levels as Record<string, unknown>) : null;
  const levelDb = levels && typeof levels[d.level] === 'number' ? (levels[d.level] as number) : null;
  const own = Object.values(d.timbres ?? {});
  const parts: Device['parts'] = [];
  for (const t of timbres) {
    const id = rowOfTimbre(voice, t);
    if (!id) continue;
    const had = parts.find((x) => x.device.voice === id);
    if (had) { if (!had.timbres.includes(t)) had.timbres.push(t); continue; }
    const dev = deviceOf(settings, id);
    if (dev) parts.push({ timbres: [t], device: dev });
  }
  return {
    voice,
    topology: row.topology,
    revision: row.revision,
    block,
    bus: d.bus,
    level: d.level,
    levelDb,
    cost: d.cost ?? topology.cost,
    returns: [...(d.returns ?? [])],
    loudnessDb: own.length === 1 ? own[0].loudnessDb : null,
    params,
    knobs,
    controls,
    fault: deskFault(voice),
    voicedBy: [...(row.voicedBy ?? [])],
    parts,
  };
}

/** A value as the panel prints it: a corner to the hertz, a time in milliseconds where it is short, a fraction to three places. */
export function sayParam(p: DeviceParam): string {
  const v = p.value;
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'string') return v;
  switch (p.unit) {
    case 'hz': return v >= 100 ? `${Math.round(v)} Hz` : `${+v.toFixed(2)} Hz`;
    case 'seconds': return v < 1 ? `${+(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${+v.toFixed(2)} s`;
    case 'ms': return `${+v.toFixed(1)} ms`;
    case 'db': return `${v > 0 ? '+' : ''}${+v.toFixed(1)} dB`;
    case 'cents': return `${+v.toFixed(0)} ct`;
    case 'x': return `${+v.toFixed(3)}×`;
    case 'count': return String(v);
    default: return Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toFixed(3));
  }
}

// --- the setters (D1) ----------------------------------------------------------

/** The number field at a path of a contract's fields, where the path names one: a `maybe` or an `either` unwrapped to its number. */
export function fieldAt(fields: Fields, path: string): NumField | null {
  const steps = stepsOf(path);
  if (!steps.length) return null;
  let f: Field | undefined = { kind: 'table', fields };
  for (const step of steps) {
    while (f && f.kind === 'maybe') f = f.of;
    if (!f) return null;
    if (f.kind === 'table' && typeof step === 'string') f = f.fields[step];
    else if (f.kind === 'map' && typeof step === 'string') f = f.of;
    else if (f.kind === 'list' && typeof step === 'number') f = f.of;
    else return null;
  }
  while (f && f.kind === 'maybe') f = f.of;
  if (f && f.kind === 'either') f = f.a.kind === 'num' ? f.a : f.b.kind === 'num' ? f.b : undefined;
  return f && f.kind === 'num' ? f : null;
}

/**
 * The number field of a line of a row's device: a field of its topology's
 * contract, or the depth of the row's own output contour where it has one.
 */
export function lineField(row: SoundRow, path: string): NumField | null {
  if (path === CONTOUR_DEPTH_PATH) return row.descriptor.contour ? CONTOUR_DEPTH : null;
  const topology = TOPOLOGIES[row.topology];
  return topology ? fieldAt(topology.parameters.fields, path) : null;
}

/**
 * A value as the field admits it: inside its own `min` and `max`; above `min`
 * by a hair where the bound is open (nought divides there); a whole number
 * where it is a count. What is not a finite number is `null`: a reset.
 */
export function clampToField(f: NumField, value: number | null): number | null {
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return null;
  let v = f.int ? Math.round(value) : value;
  v = Math.max(f.min, Math.min(f.max, v));
  if (f.open && !(v > f.min)) v = f.int ? f.min + 1 : f.min + Math.max(1e-9, (f.max - f.min) * 1e-6);
  return v;
}

/** What a move did: the number now on the layer (`null` where the line is the row's again), or why it was refused. */
export interface DeviceMove {
  changed: boolean;
  value: number | null;
  refused?: string;
}

/**
 * **Move one number of an instrument** (D1): `value` on the line at `path`,
 * clamped to the contract field's range, for the next note of `voice` to
 * render from; `null` (or anything not a finite number) puts the line back to
 * the row. A line that is not a number of the row's — a word, a name, a switch,
 * a list, a part the row does not build — is refused, and so is a move that
 * would break a relation the contract states between the numbers (it is said
 * why). `settings` is the room the move is heard in, for that check; without
 * one the row's own numbers stand in.
 */
export function setDeviceParam(voice: string, path: string, value: number | null, settings: Settings | null = null): DeviceMove {
  const d = BY_NAME[voice] ?? admittedOf(voice);
  const row = d && d.row && d.row.id === voice ? d.row : undefined;
  const topology = row ? TOPOLOGIES[row.topology] : undefined;
  if (!row || !topology) return { changed: false, value: null, refused: `${voice} has no row` };
  const f = lineField(row, path);
  if (!f) return { changed: false, value: null, refused: `${voice}'s ${path} is not a number of its row` };
  const v = clampToField(f, value);
  // the contour's depth is the row's own and in no contract: its field is its whole check
  if (v !== null && path !== CONTOUR_DEPTH_PATH) {
    const block = row.block !== undefined && BLOCKS[row.block] === row.id ? row.block : null;
    const base = rowBase(settings, row) as Record<string, unknown>;
    const now = readPath(base, path);
    if (typeof now !== 'number')
      return { changed: false, value: null, refused: now === null || now === undefined ? `${voice}'s ${path} is a part the row does not build` : `${voice}'s ${path} is the word ${JSON.stringify(now)}, not a number` };
    const trial = structuredClone(base) as Record<string, unknown>;
    for (const [p, x] of movedOf(voice) ?? []) writeNum(trial, p, x);
    writeNum(trial, path, v);
    const bad = contractFaults(trial, topology.parameters, !!block);
    if (bad.length) return { changed: false, value: movedOf(voice)?.get(path) ?? null, refused: bad.join('; ') };
  }
  return { changed: putMove(voice, path, v), value: v };
}

/**
 * **How a line of an instrument reaches the sound** (D1b): `live` where its
 * topology declares the path a sounding note can still take, `next` for any
 * other number of the row, `null` for a line that is not a number of it.
 */
export function howOfLine(voice: string, path: string): DeviceHow | null {
  const row = (BY_NAME[voice] ?? admittedOf(voice))?.row;
  const topology = row ? TOPOLOGIES[row.topology] : undefined;
  if (!row || !topology || !lineField(row, path)) return null;
  return topology.live && Object.prototype.hasOwnProperty.call(topology.live, path) ? 'live' : 'next';
}

/**
 * **A move onto the notes sounding now** (D1b): the number on the layer (the
 * value `setDeviceParam` put there, or `null` for the row's) ramped onto every
 * live note of the voice on `ctx`, over 40 ms, where the topology declares the
 * path live; nothing where it does not. How many notes took it.
 */
export function moveSounding(voice: string, path: string, value: number | null, ctx: BaseAudioContext | null): number {
  return howOfLine(voice, path) === 'live' ? moveLive(voice, path, value, ctx) : 0;
}

/** What one line of an instrument's device is in, by its path: the field's unit, or `''` for a bare number or a line it has not. */
export function unitOfLine(voice: string, path: string): FieldUnit | '' {
  const row = (BY_NAME[voice] ?? admittedOf(voice))?.row;
  const f = row ? lineField(row, path) : null;
  return f ? unitOf(path, f) : '';
}

/** What the desk has moved on one instrument, by path; empty where nothing is. */
export const deviceOverrides = (voice: string): Record<string, number> => Object.fromEntries(movedOf(voice) ?? []);

/** Every instrument the desk has moved, and what. */
export const deviceMoves = (): Record<string, Record<string, number>> => movedAll();

/** One instrument's lines back to its row, or every instrument's. True when anything was moved. */
export const clearDevice = (voice?: string): boolean => clearMoves(voice);

/** How many times the desk's layer has changed: what a reading of it is good for. */
export const deviceVersion = (): number => layerVersion();

/**
 * **What a move asks to be rendered again** (D1). The kit drums and the hats
 * render their bodies ahead and key them by the patch they were made of, so a
 * moved patch is a new key and the next hit never reads a body of the old
 * numbers — it builds itself live from the new ones, and asks for its body off
 * the tick. This warms the bodies the upcoming window of these voices will
 * read: each voice's own preparation (one call a hook, however many of its rows
 * moved), handed that voice's events. The caller defers it off the tick.
 */
export function prepareMoved(ctx: BaseAudioContext, settings: Settings, events: ProgramEvent[], voices: string[]): Promise<void> {
  const hooks = new Map<PrepareHook, string[]>();
  for (const v of voices) {
    const hook = BY_NAME[v]?.prepare;
    if (hook) hooks.set(hook, [...(hooks.get(hook) ?? []), v]);
  }
  const jobs = [...hooks].map(([hook, vs]) => hook(ctx, settings, events.filter((e) => vs.includes(e.voice)), {}));
  return Promise.all(jobs).then(() => undefined);
}

function readPath(o: unknown, path: string): unknown {
  let at = o;
  for (const s of stepsOf(path)) {
    if (!at || typeof at !== 'object') return undefined;
    at = (at as Record<string | number, unknown>)[s];
  }
  return at;
}
function writeNum(o: Record<string, unknown>, path: string, v: number): void {
  const steps = stepsOf(path);
  let at: unknown = o;
  for (let i = 0; i < steps.length - 1; i++) {
    if (!at || typeof at !== 'object') return;
    at = (at as Record<string | number, unknown>)[steps[i]];
  }
  const last = steps[steps.length - 1];
  if (at && typeof at === 'object' && typeof (at as Record<string | number, unknown>)[last] === 'number') (at as Record<string | number, unknown>)[last] = v;
}

export default deviceOf;
