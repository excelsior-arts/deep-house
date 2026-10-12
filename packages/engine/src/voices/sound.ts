// A sound as a row: a patch over a topology.
//
// Round R1 of the sounds (10-02): the rules stay in the engine; the sounds —
// the kicks, the basses, every voice's notes — become data. Until this
// round a voice module bundled two things: a **topology** — how the sound is
// made, the nodes and the arithmetic between them — and a **patch** — the
// numbers that make it *this* sound: the oscillators' levels, the envelope's
// legs, the filter's corner, the ranges a bird may move, the properties a
// recipe matches on, the lane price. The topologies are few and the patches are
// many, and every new patch was arriving as a module (`reese-driven.ts` is
// `reese.ts` with one switch thrown and its own measured knobs; `reese-deep.ts`
// is three numbers). From here a new kick or reese is a **row** — a JSON file
// under `packages/engine/sounds/<family>/<id>.json`, the shape `SoundRow` below
// and `sounds/SCHEMA.md` beside them — rendered by a topology module
// (`voices/<topology>.ts`) that reads its numbers off the row and knows no
// sound of its own.
//
// **Where a row's numbers are read from, at the note.** Two cases, and the row
// says which with `block`:
//
//   - a row **with a `block`** names a block of the settings table
//     (`kick`, `bass`, `kickLong`…). Its parameters are what `params.ts` puts in
//     that block, so a room may voice them (`rooms` write `kick.drive`, a place
//     writes `kick.t20`), and the voice renders from the **resolved** block —
//     `settings[block]` — which is the room's copy of the row. That is what
//     the settings hash in the program lock already carries by value.
//   - a row **without one** renders from its own parameters, frozen, and no
//     room reaches them. The KV1 bottoms were written this way ("their
//     constants are this module's own and not a block of the settings table:
//     the settings are hashed into the program lock, and a voice nothing draws
//     must not move it"), and the row keeps that.
//   - a row **voiced by** a block (`voicedBy`, round SOUNDS-R3) renders from
//     its own parameters with the room's voicing written over them: the
//     fields its topology lets a room voice (`Topology.voiced`), taken from
//     the settings at each path the row names, where the room holds them. That
//     is the dispatchers' timbre rows — the two strings rows share the
//     ensemble's body (`strings`), the five keyboard patches the amplifier
//     (`keys`) and each its own voicing (`keyboardPatches.<name>`) — where one
//     block is the room's word on several rows and so can be no one row's copy.
//     `VOICINGS` in `params.ts` says which rows each such block voices, as
//     `BLOCKS` says whose a block is.
//
// The topology states which parameters it renders from, **exactly** — a row
// may not carry a number nothing reads, or lack one — and which of its knobs
// and controls default to which parameter, so the duplication a knob table
// always had (`default: 0.17` beside `t34: 0.17`) is checked and not hoped for.
// `asSound` reads a row off its JSON and refuses one that is not a row;
// `soundDescriptor` is the descriptor the registry gathers, built from the row
// and the topology exactly as a module used to declare one by hand.

import type {
  Anticipates, Controls, Descriptor, Knobs, LazyReturn, PrepareHook, TimbreFacts, VoiceBus, VoiceCost, VoiceFamily,
  VoiceRenderer, VoiceRole,
} from './descriptor.ts';
import { BUSES, FAMILIES, LAZY_RETURNS, ROLES, controlFaults, knobFaults } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { contractFaults } from './schema.ts';
import { BLOCKS, INSTRUMENTS, VOICINGS } from '../params.ts';
import type { SoundBlock } from '../params.ts';
import type { Contract, Fields, PatchOf } from './schema.ts';
import { layerVersion, movedOf, stepsOf } from './desk-layer.ts';
import { useRowBase } from './live.ts';
import { withOutputEnvelope, contourFaults, CONTOUR_DEPTH_PATH, type OutputContour } from './output-envelope.ts';
import type { LiveTable } from './live.ts';

/** What a row says about the sound, in the descriptor's own words: everything of a `Descriptor` that is a value and not a function. */
export interface SoundDescriptor {
  family: VoiceFamily;
  roles: VoiceRole[];
  bus: VoiceBus;
  level: string;
  layer: string;
  plays: string | null;
  mono: boolean;
  treat: boolean;
  /** MEASURED by `tools/budget.ts --bless`; absent, the topology's own class */
  cost?: VoiceCost;
  knobs?: Knobs;
  controls?: Controls;
  returns?: LazyReturn[];
  /** a gain over every note's output from its onset (`output-envelope.ts`); absent, none */
  contour?: OutputContour;
  timbres: Record<string, TimbreFacts>;
  dispatches: string[];
  mood: string[];
}

/** One sound, as its row states it. */
export interface SoundRow {
  schema: 1;
  kind: 'sound';
  /** the event string, and the file's name; it never changes (the golden digest hashes every event's `voice`) */
  id: string;
  /** a positive integer a material change increments; it is hashed into the program lock's `sounds` line */
  revision: number;
  /** which topology renders it: a key of `TOPOLOGIES` */
  topology: string;
  /**
   * the block of the settings table these parameters are, where a room may
   * voice them — a declared alias, held to `BLOCKS` in `params.ts`: only the
   * row that owns a block may name it. Absent, the row's own numbers, which no
   * room reaches (a variant copied from a row with a block drops it).
   */
  block?: SoundBlock;
  /**
   * the settings paths whose fields voice this row, in order (round SOUNDS-R3):
   * a block that is the room's word on several rows — the ensemble's body both
   * strings rows are made of, the amplifier every keyboard patch plays through
   * — or one row's own partial voicing (`keyboardPatches.ep`). The row's
   * parameters with the fields its topology lets a room voice written over
   * them, where the room holds them; held to `VOICINGS` in `params.ts`. Never
   * beside a `block`.
   */
  voicedBy?: string[];
  /** exactly what the topology renders from */
  parameters: Readonly<Record<string, unknown>>;
  descriptor: SoundDescriptor;
  /**
   * numbers a gate measured that are not a timbre fact: a kit drum's click
   * bound, and an articulation's own loudness and click bound by its scene's
   * name (`congaSlap: { loudnessDb, clickStep }`)
   */
  measured?: Readonly<Record<string, number | Readonly<Record<string, number>>>>;
  /** a kit instrument's own offset in the strike dice, outside the patch because no room voices it */
  dice?: number;
  provenance: { module: string; round: string; [k: string]: unknown };
}

/**
 * A topology: the module that renders a row. `parameters` is its contract
 * (`schema.ts`): the exact fields a row of it carries, each with its type and
 * range, and the relations between them; `knobOf` and `controlOf` say which
 * parameter each knob and control defaults from, so `soundFaults` can hold the
 * row's tables to its numbers. `cost` is the class a row of it is priced at
 * when the row declares none (`tools/budget.ts --bless` writes the row's own).
 */
export interface Topology {
  id: string;
  cost: VoiceCost;
  parameters: Contract<any>;
  knobOf?: Readonly<Record<string, string>>;
  controlOf?: Readonly<Record<string, string>>;
  /** the voice function for this row: a closure over the row, the same five arguments as every voice */
  render(row: SoundRow): VoiceRenderer;
  /** the pre-render hook, shared by every row of the topology (it is handed the events of all of them) */
  prepare?: PrepareHook;
  /**
   * The rows of this topology the registry has admitted, by event name, where
   * its `prepare` reads them: a preparation shared by every row resolves each
   * event's patch through its own row (`patchOf`), so what it warms is what
   * that event will play — never the incumbent block's numbers for a variant
   * that has its own (E06 of the outside review of 10-03).
   */
  rows?: Map<string, SoundRow>;
  anticipates?: Anticipates;
  /** how far ahead of its event a note of this row begins, where that is the row's own (a swell's length) */
  anticipatesOf?(row: SoundRow): Anticipates;
  /** what of the envelope a note of a glue gesture may write (`GLUE_SHAPES`); absent, nothing */
  glue?: Readonly<{ attack?: true; release?: true; top?: true }>;
  /** anything else a row of this topology must carry (a kit's `dice`), as sentences; empty is fine */
  check?(row: SoundRow): string[];
  /**
   * the fields of the contract a room may voice where a row names a block that
   * voices it (`voicedBy`): the rest are the row's own and no room reaches
   * them (a strings row's shape; a keyboard patch's family and envelope)
   */
  voiced?: readonly string[];
  /**
   * **What a sounding note can still take** (PLAN-DESK D1b): the paths of the
   * contract whose number a note already built still holds an audio parameter
   * for — a corner, a resonance, a movement's rate, a level — each with the
   * kind of number it is. `render` hands a handle for each of them at the note
   * (`live.ts`), so a desk move ramps the notes sounding now as well as writing
   * the layer for the next ones. Everything else — what decides a build: a
   * count of oscillators, a clip's curve, an envelope's legs already
   * scheduled, a body rendered ahead — reaches the next note only, and is
   * declared nothing here. Absent, every line is next-note.
   */
  live?: LiveTable;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) deepFreeze((o as Record<string, unknown>)[k]);
  }
  return o;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A finite number, or a table or list whose every leaf is one: what a row's `measured` may hold. */
const numeric = (v: unknown): boolean => (typeof v === 'number' && Number.isFinite(v))
  || (Array.isArray(v) && v.length > 0 && v.every(numeric))
  || (isObject(v) && Object.keys(v).length > 0 && Object.values(v).every(numeric));

/**
 * A row off its JSON, or a throw naming what is wrong with it. The shape only:
 * whether its numbers are the topology's is `soundFaults`, asked when the
 * descriptor is built.
 */
export function asSound(raw: unknown): SoundRow {
  const bad: string[] = [];
  const r = raw as Record<string, unknown>;
  const name = isObject(r) && typeof r.id === 'string' ? r.id : 'a row with no id';
  if (!isObject(r)) throw new Error('a sound row is not an object');
  if (r.schema !== 1) bad.push(`schema ${JSON.stringify(r.schema)} where 1 was wanted`);
  if (r.kind !== 'sound') bad.push(`kind ${JSON.stringify(r.kind)} where "sound" was wanted`);
  if (typeof r.id !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(r.id)) bad.push(`id ${JSON.stringify(r.id)} is not an event name`);
  if (!Number.isSafeInteger(r.revision) || (r.revision as number) < 1) bad.push(`revision ${JSON.stringify(r.revision)} is not a positive integer`);
  if (typeof r.topology !== 'string' || !r.topology) bad.push('it names no topology');
  if (r.block !== undefined && (typeof r.block !== 'string' || !Object.prototype.hasOwnProperty.call(BLOCKS, r.block)))
    bad.push(`block ${JSON.stringify(r.block)} is not a block of the instruments table (\`BLOCKS\` in params.ts)`);
  if (r.voicedBy !== undefined && (!Array.isArray(r.voicedBy) || !r.voicedBy.length
    || r.voicedBy.some((v) => typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(VOICINGS, v))))
    bad.push(`voicedBy ${JSON.stringify(r.voicedBy)} is not a list of the voicings \`VOICINGS\` in params.ts names`);
  if (r.block !== undefined && r.voicedBy !== undefined) bad.push('it names a block and a voicing: a block is one row\'s copy, a voicing the room\'s word on several');
  if (!isObject(r.parameters)) bad.push('parameters is not a table');
  if (!isObject(r.descriptor)) bad.push('descriptor is not a table');
  if (r.measured !== undefined && (!isObject(r.measured) || !numeric(r.measured))) bad.push('measured is not a table of numbers');
  if (r.dice !== undefined && !Number.isFinite(r.dice)) bad.push('dice is not a number');
  if (!isObject(r.provenance) || typeof r.provenance.module !== 'string' || typeof r.provenance.round !== 'string')
    bad.push('provenance names no module and round');
  if (bad.length) throw new Error(`${name}: ${bad.join('; ')}`);
  return deepFreeze(r as unknown as SoundRow);
}

/**
 * Everything wrong with a row against its topology, as sentences; empty is a
 * row the registry may build a descriptor from. The parameters are the
 * topology's exactly; a knob or control that defaults from a parameter defaults
 * to it; the descriptor's words are the closed vocabularies'.
 */
export function soundFaults(row: SoundRow, topology: Topology | undefined): string[] {
  const bad: string[] = [];
  const say = (what: string) => bad.push(`${row.id}: ${what}`);
  if (!topology) { say(`no topology called ${row.topology}`); return bad; }
  if (topology.id !== row.topology) say(`the topology ${topology.id} is not the row's ${row.topology}`);
  // The topology's contract (E04 of the outside review of 10-03): every field
  // it renders from, present, of its type and in its range, nothing it never
  // reads, and the relations between them — where until then any finite
  // number, switch, word or table of numbers passed for any parameter.
  for (const f of contractFaults(row.parameters, topology.parameters)) say(`parameter ${f}`);
  // One sound, one identity (E05): a block is the room's copy of the one row
  // that owns it. A row that names another's block — a copy that kept the
  // `block` it was copied with — would play that row's numbers and not its own.
  if (row.block !== undefined && BLOCKS[row.block] !== row.id)
    say(`the block ${row.block} is ${BLOCKS[row.block] ?? 'nobody'}'s: a row copied from it carries no \`block\` and renders its own numbers`);
  // The same rule for a voicing (round SOUNDS-R3): a block that voices several
  // rows voices the ones `VOICINGS` names and no other, so a copy that kept a
  // `voicedBy` would play the room's word on its original and not its own
  // numbers; and at rest the row is its own numbers — every field the
  // topology lets the room voice that the instruments table holds at that
  // path is the row's own value there — so a room that writes nothing plays
  // the row.
  for (const path of row.voicedBy ?? []) {
    const own = VOICINGS[path];
    if (!own || !own.includes(row.id))
      say(`the voicing ${path} is ${own ? own.join(' and ') : 'nobody'}'s: a row copied from them carries no \`voicedBy\` and renders its own numbers`);
    if (!topology.voiced) { say(`the topology ${topology.id} names no field a room may voice`); continue; }
    const held = valueAt(INSTRUMENTS, path);
    if (!isObject(held)) continue;
    for (const k of topology.voiced) {
      if (!(k in held)) continue;
      if (JSON.stringify(held[k]) !== JSON.stringify(row.parameters[k]))
        say(`the instruments table's ${path}.${k} is ${JSON.stringify(held[k])} and the row's ${k} is ${JSON.stringify(row.parameters[k])}`);
    }
  }
  for (const k of topology.voiced ?? []) if (!(k in topology.parameters.fields)) say(`the topology lets a room voice ${k}, which is not a field of its contract`);
  const d = row.descriptor;
  if (!(FAMILIES as readonly string[]).includes(d.family)) say(`${d.family} is not a family`);
  if (!Array.isArray(d.roles) || !d.roles.length) say('it plays no role');
  else for (const r of d.roles) if (!(ROLES as readonly string[]).includes(r)) say(`${r} is not a role`);
  if (!(BUSES as readonly string[]).includes(d.bus)) say(`${d.bus} is not a bus`);
  for (const k of ['level', 'layer'] as const) if (typeof d[k] !== 'string' || !d[k]) say(`no ${k}`);
  if (!(d.plays === null || (typeof d.plays === 'string' && d.plays))) say(`plays ${JSON.stringify(d.plays)}`);
  for (const k of ['mono', 'treat'] as const) if (typeof d[k] !== 'boolean') say(`${k} is not a boolean`);
  if (d.cost !== undefined && !['cheap', 'mid', 'dear'].includes(d.cost)) say(`${d.cost} is not a cost class`);
  if (d.returns !== undefined) for (const r of d.returns) if (!(LAZY_RETURNS as readonly string[]).includes(r)) say(`${r} is not a lazy return`);
  if (!isObject(d.timbres)) say('timbres is not a table');
  if (d.contour !== undefined) for (const f of contourFaults(d.contour)) say(f);
  for (const k of ['dispatches', 'mood'] as const) if (!Array.isArray(d[k])) say(`${k} is not a list`);
  bad.push(...knobFaults({ name: row.id, cost: d.cost ?? topology.cost, knobs: d.knobs }));
  bad.push(...controlFaults({ name: row.id, controls: d.controls, noteControls: d.controls ? Object.keys(d.controls) : undefined }));
  for (const [knob, param] of Object.entries(topology.knobOf ?? {})) {
    const spec = d.knobs?.[knob];
    if (spec && spec.default !== row.parameters[param]) say(`knob ${knob} defaults to ${spec.default} and the parameter ${param} is ${row.parameters[param]}`);
  }
  if (topology.check) bad.push(...topology.check(row));
  for (const [control, param] of Object.entries(topology.controlOf ?? {})) {
    const spec = d.controls?.[control];
    if (spec && spec.default !== null && spec.default !== row.parameters[param]) say(`control ${control} defaults to ${spec.default} and the parameter ${param} is ${row.parameters[param]}`);
  }
  return bad;
}

/**
 * The descriptor the registry gathers for a row: the row's own words, the
 * topology's functions, and the row itself (`row`) so a tool that measures the
 * sound writes what it read back into the row and not into a module.
 */
export function soundDescriptor(row: SoundRow, topology: Topology | undefined): Descriptor {
  const faults = soundFaults(row, topology);
  if (faults.length || !topology) throw new Error(`a sound row is not a sound: ${faults.join('; ')}`);
  // admitted: the row's own numbers are its topology's patch from here on,
  // and a preparation shared by its topology finds it by its event name
  provePatch(row.parameters, topology.parameters, row.id);
  topology.rows?.set(row.id, row);
  if (row.voicedBy) voicing.set(row, topology.voiced ?? []);
  const d = row.descriptor;
  const descriptor: Descriptor = {
    name: row.id,
    family: d.family,
    roles: [...d.roles],
    bus: d.bus,
    level: d.level,
    layer: d.layer,
    plays: d.plays,
    mono: d.mono,
    treat: d.treat,
    anticipates: topology.anticipatesOf ? topology.anticipatesOf(row) : topology.anticipates ?? null,
    prepare: topology.prepare ?? null,
    render: withOutputEnvelope(topology.render(row), d.contour ?? null, row.id),
    cost: d.cost ?? topology.cost,
    ...(d.knobs ? { knobs: d.knobs } : {}),
    ...(d.controls ? { controls: d.controls, noteControls: Object.keys(d.controls) } : {}),
    ...(d.returns ? { returns: d.returns } : {}),
    timbres: d.timbres,
    dispatches: [...d.dispatches],
    mood: [...d.mood],
    row,
  };
  ADMITTED.set(row.id, descriptor);
  return descriptor;
}

/**
 * Every row the registry has admitted, by its id, with the descriptor built
 * for it: the registered voices and the rows a dispatcher renders through
 * (`pad`'s and `keys`' timbre rows), which are rows and not event names. A
 * dispatching topology finds its targets here, and the desk a timbre row's
 * device. Filled at admission (`soundDescriptor`); a later admission of the
 * same id is the one that stands.
 */
const ADMITTED = new Map<string, Descriptor>();
/** The descriptor of an admitted row, by its id; `undefined` for none. */
export const admittedOf = (id: string): Descriptor | undefined => ADMITTED.get(id);
/** Every admitted row's descriptor, in the order they were admitted. */
export const admittedAll = (): Descriptor[] => [...ADMITTED.values()];

// The fields each voiced row's topology lets a room voice, filled at admission.
const voicing = new WeakMap<SoundRow, readonly string[]>();

/** The value at a dotted path of a table (`keyboardPatches.ep`), or `undefined`. */
function valueAt(o: unknown, path: string): unknown {
  let at = o;
  for (const step of path.split('.')) {
    if (!isObject(at)) return undefined;
    at = at[step];
  }
  return at;
}

// A voiced row's patch per settings value, so a note built under one room
// asks once: a settings value is frozen, and a note whose controls rescale the
// room (the pad's motion) is a value of its own.
const voicedOf = new WeakMap<object, Map<string, Readonly<Record<string, unknown>>>>();

/**
 * **A voiced row's numbers in this room** (round SOUNDS-R3): its parameters
 * with every field its topology lets a room voice written over them from the
 * settings at each path the row names, in order, where the room holds that
 * field. The fields are taken whole (a table — the strings' breath, the keys'
 * edge — is the room's table). A room that holds none of them hands back the
 * row's own parameters, the very object.
 */
export function voicedPatch(settings: Settings, row: SoundRow): Readonly<Record<string, unknown>> {
  const S = settings as unknown as object;
  let per = voicedOf.get(S);
  if (!per) voicedOf.set(S, (per = new Map()));
  const had = per.get(row.id);
  if (had) return had;
  const fields = voicing.get(row) ?? [];
  let out: Record<string, unknown> | null = null;
  for (const path of row.voicedBy ?? []) {
    const block = valueAt(settings, path);
    if (!isObject(block)) continue;
    for (const k of fields) {
      if (!Object.prototype.hasOwnProperty.call(block, k)) continue;
      out ??= { ...row.parameters };
      out[k] = block[k];
    }
  }
  const patch = out ? deepFreeze(out) : row.parameters;
  per.set(row.id, patch);
  return patch;
}

/**
 * What a row's numbers are in this room before the desk: the room's block
 * where the row names one (the room's copy of it), the row voiced by the room
 * where it names voicings, and the row's own parameters otherwise. With no
 * settings, the row's own.
 */
export function rowBase(settings: Settings | null, row: SoundRow): Readonly<Record<string, unknown>> {
  if (!settings) return row.parameters;
  if (row.block !== undefined) {
    const block = (settings as unknown as Record<string, unknown>)[row.block];
    return isObject(block) ? block : row.parameters;
  }
  if (row.voicedBy !== undefined) return voicedPatch(settings, row);
  return row.parameters;
}
// a live note put back to the row reads the row in its own room (`live.ts`)
useRowBase(rowBase);

// What has been held to which contract: a row's parameters at admission, a
// settings value's blocks when it is resolved, and anything else the first
// time a voice is handed it. Keyed by the object, which is frozen either way.
const proven = new WeakMap<object, Set<Contract<any>>>();

/**
 * `v` as the patch `c` describes, once it has passed `c`; a throw naming what
 * is wrong with it otherwise. Each object is checked against each contract
 * once — at admission where it has one — and read back for nothing after.
 * `extra` admits fields of a settings block's own beside the contract's.
 */
export function provePatch<S extends Fields>(v: unknown, c: Contract<S>, who: string, extra = false): PatchOf<S> {
  if (v && typeof v === 'object') {
    const had = proven.get(v);
    if (had && had.has(c)) return v as PatchOf<S>;
  }
  const bad = contractFaults(v, c, extra);
  if (bad.length) throw new Error(`${who}: ${bad.join('; ')}`);
  const o = v as object;
  let had = proven.get(o);
  if (!had) proven.set(o, (had = new Set()));
  had.add(c);
  return v as PatchOf<S>;
}

/**
 * The numbers a note of this row is made from: the resolved settings' block
 * where the row names one — the room's copy of the patch — and the row's own
 * parameters otherwise, **as the topology's contract types them, once they
 * have passed it** (E04): the cast is the proof's, not an assertion. Where the
 * desk has moved a number of this voice (PLAN-DESK D1, `desk-layer.ts`), the
 * patch is that one with the moves on it (`withDesk`); where it has not, it is
 * the very object it always was.
 */
export function patchOf<S extends Fields>(settings: Settings, row: SoundRow, c: Contract<S>): PatchOf<S> {
  if (row.voicedBy !== undefined) {
    const who = `${row.id}, as the room voices it`;
    return withDesk(row.id, provePatch(voicedPatch(settings, row), c, who), c, who);
  }
  if (row.block === undefined) return rowPatch(row, c);
  if (BLOCKS[row.block] !== row.id) throw new Error(`${row.id}: the block ${row.block} is ${BLOCKS[row.block] ?? 'nobody'}'s, not this row's`);
  const block = (settings as unknown as Record<string, unknown>)[row.block];
  if (block === undefined) throw new Error(`${row.id}: the settings carry no block called ${row.block}`);
  const who = `${row.id}: the settings' ${row.block} block`;
  return withDesk(row.id, provePatch(block, c, who, true), c, who, true);
}

/** A row's own numbers, frozen, with the desk's moves on them where it has any: what a row with no block renders from. */
export const rowPatch = <S extends Fields>(row: SoundRow, c: Contract<S>): PatchOf<S> =>
  withDesk(row.id, provePatch(row.parameters, c, row.id), c, row.id);

// The patch with the desk's moves on it, once per (base object, version of the
// layer): the next note of the voice reads it, a note already sounding keeps
// the numbers it was built from, and nothing is built per note. A copy that
// fails its contract (a relation a cast's room broke under a move) is not
// handed to a voice: the base is, and the fault is kept for the device to say.
const built = new WeakMap<object, { voice: string; version: number; patch: object }>();
const refused = new Map<string, string>();

/** Why the desk's moves on this voice are not being played, where they are not (a fault the room's numbers made of them). */
export const deskFault = (voice: string): string | null => refused.get(voice) ?? null;

/**
 * `base` with the desk's moves on `voice` written over it — a copy, frozen and
 * proven against `c` — or `base` itself, **the same object**, where the desk
 * has moved nothing on the voice: the engine's identity at rest. The held
 * voices, which read the room's block by name, ask it too.
 */
export function withDesk<S extends Fields>(voice: string, base: PatchOf<S>, c: Contract<S>, who: string, extra = false): PatchOf<S> {
  const moves = movedOf(voice);
  // the contour's depth is the row's and not the patch's: the wrapper reads it (`output-envelope.ts`)
  if (!moves || !moves.size || (moves.size === 1 && moves.has(CONTOUR_DEPTH_PATH))) return base;
  const version = layerVersion();
  const had = built.get(base as object);
  if (had && had.voice === voice && had.version === version) return had.patch as PatchOf<S>;
  const copy = structuredClone(base) as Record<string, unknown>;
  for (const [path, value] of moves) writePath(copy, path, value);
  let patch: PatchOf<S> = base;
  try {
    patch = provePatch(deepFreeze(copy), c, `${who}, as the desk moved it`, extra);
    refused.delete(voice);
  } catch (err) {
    refused.set(voice, String((err as Error).message ?? err));
  }
  built.set(base as object, { voice, version, patch: patch as object });
  return patch;
}

/** Write `value` at `path` inside a plain copy; a step that is not there (a part the row does not build) writes nothing. */
function writePath(o: Record<string, unknown>, path: string, value: number): void {
  const steps = stepsOf(path);
  let at: unknown = o;
  for (let i = 0; i < steps.length - 1; i++) {
    if (!at || typeof at !== 'object') return;
    at = (at as Record<string | number, unknown>)[steps[i]];
  }
  const last = steps[steps.length - 1];
  if (at && typeof at === 'object' && last !== undefined && typeof (at as Record<string | number, unknown>)[last] === 'number')
    (at as Record<string | number, unknown>)[last] = value;
}

/** What the program lock hashes of a row: its identity, its revision, the block or voicings the room reaches it by, and its numbers. */
export const soundLine = (row: SoundRow): { id: string; topology: string; revision: number; block: string | null; voicedBy?: string[]; parameters: Readonly<Record<string, unknown>> } =>
  ({ id: row.id, topology: row.topology, revision: row.revision, block: row.block ?? null, ...(row.voicedBy ? { voicedBy: [...row.voicedBy] } : {}), parameters: row.parameters });
