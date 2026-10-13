// A space: the room and the repeats a bus sits in, as a row.
//
// A row under `packages/engine/spaces/<id>.json` names the kitchen's own
// effects (`effects/index.ts`) and their numbers, in two places:
//
//   inserts  in series on the bus, before anything is sent: a chorus, a width,
//            a filter — each with its own dry/wet `mix`, as the effect has it
//   sends    taken off after the inserts, each at its `level`, each an effect
//            run fully wet (`mix` 1), its return summed beside the dry; a send
//            may carry `after`, a series chain on its return (a lowpass over a
//            wash), and `into`, a share of its return fed on into a *later*
//            send (a delay whose repeats fall into the hall) — later only, so
//            no loop can be written
//
// and `dry` (the bus's own level, 1 is a wire) and `trimDb` (the whole space's
// output, so two spaces can be matched in loudness). It knows nothing of what
// plays into it: a space is a mix decision a part or a page names by id.
//
//   input -> inserts -> dry ---------------------------------> trim -> output
//                    \-> level -> send -> after -> return ---^
//                                                     \-> into -> a later send
//
// A send's effect is built with the tempo's beat (`beat`, seconds), which is
// what a delay's `timeBeats` is read against. Every number is held to its
// effect's declared range by `spaceFaults` at admission, and an effect a row
// names that the registry has not is a fault, never a silent skip.

import { BY_ID, makeEffect } from './index.ts';
import { isOffline } from './shell.ts';
import type { EffectInstance } from './contract.ts';
import type { Settings } from '../settings.ts';

/** One effect of a space, with the numbers it is built with. */
export interface SpaceEffect {
  effect: string;
  params: Record<string, number>;
}

/** One send of a space: an effect run wet, at a level, with its return's chain and onward feeds. */
export interface SpaceSend extends SpaceEffect {
  id: string;
  level: number;
  after?: SpaceEffect[];
  into?: Record<string, number>;
}

/** A space row, as admitted. */
export interface SpaceRow {
  schema: 1;
  kind: 'space';
  id: string;
  revision: number;
  dry: number;
  trimDb: number;
  inserts: SpaceEffect[];
  sends: SpaceSend[];
  descriptor?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function effectFaults(e: unknown, where: string, wet: boolean): string[] {
  if (!isObject(e)) return [`${where} is not a table`];
  const d = typeof e.effect === 'string' ? BY_ID[e.effect] : undefined;
  if (!d) return [`${where} names ${JSON.stringify(e.effect)}, which is not an effect`];
  if (!isObject(e.params)) return [`${where}: params is not a table`];
  const bad: string[] = [];
  for (const [k, v] of Object.entries(e.params)) {
    const spec = d.params[k];
    if (!spec) { bad.push(`${where}: ${k} is not a parameter of ${d.id}`); continue; }
    if (!finite(v)) bad.push(`${where}: ${k} is not a finite number`);
    else if (v < spec.min || v > spec.max) bad.push(`${where}: ${k} is ${v}, outside ${spec.min}..${spec.max}`);
  }
  if (wet && e.params.mix !== 1) bad.push(`${where}: a send runs wet, so its mix is 1`);
  return bad;
}

/** Everything wrong with a space row; empty is a space. */
export function spaceFaults(raw: unknown): string[] {
  if (!isObject(raw)) return ['a space row is not a table'];
  const id = typeof raw.id === 'string' ? raw.id : '(no id)';
  const bad: string[] = [];
  const say = (s: string) => bad.push(`${id}: ${s}`);
  if (raw.schema !== 1) say('schema is not 1');
  if (raw.kind !== 'space') say('kind is not space');
  if (typeof raw.id !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(raw.id)) say('id is not a camelCase name');
  if (!Number.isInteger(raw.revision) || (raw.revision as number) < 1) say('revision is not a positive whole number');
  if (!finite(raw.dry) || raw.dry < 0 || raw.dry > 2) say('dry is not a level from 0 to 2');
  if (!finite(raw.trimDb) || raw.trimDb < -24 || raw.trimDb > 12) say('trimDb is not from -24 to 12 dB');
  if (!Array.isArray(raw.inserts)) say('inserts is not a list');
  else raw.inserts.forEach((e, i) => bad.push(...effectFaults(e, `${id}: inserts[${i}]`, false)));
  if (!Array.isArray(raw.sends)) { say('sends is not a list'); return bad; }
  const ids: string[] = [];
  raw.sends.forEach((s, i) => {
    const where = `${id}: sends[${i}]`;
    bad.push(...effectFaults(s, where, true));
    if (!isObject(s)) return;
    if (typeof s.id !== 'string' || !s.id) bad.push(`${where} has no id`);
    else if (ids.includes(s.id)) bad.push(`${where}: ${s.id} is named twice`);
    if (!finite(s.level) || s.level < 0 || s.level > 2) bad.push(`${where}: level is not from 0 to 2`);
    if (s.after !== undefined) {
      if (!Array.isArray(s.after)) bad.push(`${where}: after is not a list`);
      else s.after.forEach((e, j) => bad.push(...effectFaults(e, `${where}.after[${j}]`, false)));
    }
    ids.push(typeof s.id === 'string' ? s.id : '');
  });
  raw.sends.forEach((s, i) => {
    if (!isObject(s) || s.into === undefined) return;
    if (!isObject(s.into)) { bad.push(`${id}: sends[${i}].into is not a table`); return; }
    for (const [to, v] of Object.entries(s.into)) {
      const at = ids.indexOf(to);
      if (at <= i) bad.push(`${id}: sends[${i}] feeds ${to}, which is not a later send`);
      if (!finite(v) || v < 0 || v > 2) bad.push(`${id}: sends[${i}].into.${to} is not a level from 0 to 2`);
    }
  });
  return bad;
}

/** A space row, admitted: throws naming every fault. */
export function asSpace(raw: unknown): SpaceRow {
  const bad = spaceFaults(raw);
  if (bad.length) throw new Error(`not a space: ${bad.join('; ')}`);
  return raw as SpaceRow;
}

/** A built space: connect a bus to `input`, `output` onward, and let it go with `dispose`. */
export interface SpaceInstance {
  input: AudioNode;
  output: AudioNode;
  /**
   * the gains the row's `dry` and each send's `level` are set on, by send id:
   * a page may scale them (a wetter balance) from the row's own values
   */
  levels: { dry: GainNode; sends: Record<string, GainNode> };
  /** each send's own door, past its level, by send id: what a note may be sent into directly (`withReturns`) */
  doors: Record<string, AudioNode>;
  /** the tail rings out from `at` and then everything is let go */
  dispose(at?: number): void;
}

/**
 * A space, built.
 * @param opts.beat the beat in seconds a delay's `timeBeats` is read against
 * @param opts.at when the effects' own sources start
 */
export function buildSpace(ctx: BaseAudioContext, settings: Settings, row: SpaceRow, opts: { beat?: number; at?: number } = {}): SpaceInstance {
  const at = opts.at ?? 0;
  const made: EffectInstance[] = [];
  let tail = 0;
  const nodes: AudioNode[] = [];
  const gain = (v: number): GainNode => { const g = ctx.createGain(); g.gain.value = v; nodes.push(g); return g; };
  const build = (e: SpaceEffect): EffectInstance => {
    const fx = makeEffect(e.effect, ctx, settings, opts.beat ? { ...e.params, beat: opts.beat } : e.params, at);
    const d = BY_ID[e.effect];
    tail = Math.max(tail, d.tail === 'none' ? 0 : d.tail.seconds);
    made.push(fx);
    return fx;
  };
  const chain = (from: AudioNode, list: readonly SpaceEffect[]): AudioNode =>
    list.reduce((node, e) => { const fx = build(e); node.connect(fx.input); return fx.output; }, from);

  const input = gain(1);
  const trim = gain(10 ** (row.trimDb / 20));
  const post = chain(input, row.inserts);
  const dry = gain(row.dry);
  post.connect(dry).connect(trim);
  const levels: Record<string, GainNode> = {};
  const sends = new Map<string, AudioNode>();
  // Built in order; a send's `into` names a later one, so its door is built first.
  const doors = row.sends.map((s) => { const g = gain(1); sends.set(s.id, g); return g; });
  row.sends.forEach((s, i) => {
    levels[s.id] = gain(s.level);
    post.connect(levels[s.id]).connect(doors[i]);
    const fx = build(s);
    doors[i].connect(fx.input);
    const ret = chain(fx.output, s.after ?? []);
    ret.connect(trim);
    for (const [to, v] of Object.entries(s.into ?? {})) ret.connect(gain(v)).connect(sends.get(to)!);
  });
  return {
    input,
    output: trim,
    levels: { dry, sends: levels },
    doors: Object.fromEntries(row.sends.map((s, i) => [s.id, doors[i]])),
    dispose(when) {
      // each effect lets its own nodes go once its tail has rung; the wires of
      // this module carry none of their own, and go with the longest of them
      for (const fx of made) fx.dispose(when);
      if (isOffline(ctx)) return;
      const wait = Math.max(0, (when ?? ctx.currentTime) - ctx.currentTime) + tail + 0.1;
      setTimeout(() => { for (const n of nodes) n.disconnect(); }, wait * 1000);
    },
  };
}

export default buildSpace;
