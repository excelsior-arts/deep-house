// **A mined kit as a row** (10-06, hands-on with Eugene on source 9): what the drums play bar by
// bar where a place names a kit (`DrumsEntry.kit`), and the moves they make where the form's
// sub-sections fall — every number the composer's kit pass reads, so a second kit is a second
// file and not a second branch of code. The rows live in `recipes/genres/<genre>/kit-*.json`.
//
// - `lanes`: per lane, the group of the drums it replaces (`kick`, `backbeat`, `offbeat`), the
//   voice it plays (`kick` and `snare` play the bar's own drum), and per step of a `cycleBars`
//   cycle a chance, a level over the lane's loudest (with its spread) and an offset in ms against
//   the kick. A lane's `vel` is `[floor, span]` of the velocity the level strikes at (absent, the
//   level itself, never under 0.12); a `ghost` lane strikes under the backbeat's ghost line; the
//   kick's `minVel` drops a step the transcription read as noise; `accent: 'level'` gives the
//   level as gain one to one (the others its square root). Pan, spread, room and reverb place it.
// - `grooves`: the section kinds the kit plays whole in; `minP` the least chance a step is played at.
// - `sections`: per kind, the lanes a section keeps (an intro's `lastBars` lead-in, an outro's stop
//   `lanesUntilBeforeEnd`); a kind it leaves out keeps the kit.
// - `phraseFill`: a fill on the last bar of every `everyBars` of a groove, at a chance.
// - `lift`: over a run of grooves, straight eighths on a hat for the bars before its midpoint and
//   a closing hit every bar from it.
// - `moves`: per sub-section kind, hits struck (`lane`) or taken off (`drop`) on its first, last
//   or each bar, at a chance (`p`), only where the step is free (`ifFree`); or every hit of some
//   lanes taken off from a step on (`clear`, `from`, `to`).
// - `answers` (liquid-space, 10-11): the kit's own answer bars, by id, each a list of moves on the one
//   bar a phrase's plan puts it (`src/phrase-development.ts`): a hit taken out, a pickup added, a
//   secondary accent moved. The skeleton stays the lanes'; an answer changes the end of one bar.
// - `states` (liquid-space, 10-11): other bars the kit can play, by name, each a full set of lanes of
//   its own (`half-time`: the snare on the bar's middle step; `hints`, `pulse`: a passage that only
//   remembers the drums). A bar in a state plays the state's lanes and no other; its draws are off
//   streams of their own, so a bar outside every state strikes what it always struck.
import KIT_LIQUID from '../recipes/genres/dnb/kit-liquid-two-step.json' with { type: 'json' };

export type KitGroup = 'kick' | 'backbeat' | 'offbeat';
export interface KitStep { step: number; p: number; vel: number; velSd: number; ms: number }
export interface KitLane {
  plays: string;
  group: KitGroup;
  steps: KitStep[];
  vel?: [number, number];
  ghost?: boolean;
  minVel?: number;
  accent?: 'level';
  gainDb?: number;
  pan?: number;
  panSpread?: number;
  room?: number;
  reverb?: number;
}
export interface KitMove {
  bar: 'first' | 'last' | 'each';
  lane?: string;
  drop?: string;
  /** every hit of these lanes taken off the bar from step `fromStep` (inclusive) to `toStep` (exclusive, 16 where absent) */
  clear?: string[];
  fromStep?: number;
  toStep?: number;
  step?: number;
  vel?: number;
  p?: number;
  ifFree?: boolean;
}
/** A state's own lanes: a full set, read in place of the kit's on a bar in the state (liquid-space, 10-11). */
export interface KitState { lanes: Record<string, KitLane>; note?: string }
export interface KitSection { lanes?: string[]; lastBars?: number; minP?: number; lanesUntilBeforeEnd?: number }
export interface Kit {
  cycleBars: number;
  minP: number;
  grooves: string[];
  lanes: Record<string, KitLane>;
  sections?: Record<string, KitSection>;
  phraseFill?: { everyBars: number; chance: number };
  lift?: {
    minBars: number;
    eighthsBars: number;
    eighths: { lane: string; clears: string[]; steps: Array<[number, number]> };
    close: { lane: string; step: number; vel: number };
  };
  moves?: Record<string, KitMove[] | string>;
  answers?: Record<string, KitMove[] | string>;
  states?: Record<string, KitState | string>;
}

/** The kit's answers by id, the note fields left out. */
export function answersOf(kit: Kit): Record<string, KitMove[]> {
  return Object.fromEntries(Object.entries(kit.answers ?? {}).filter((e): e is [string, KitMove[]] => Array.isArray(e[1])));
}
/** The kit's states by name, the note fields left out. */
export function statesOf(kit: Kit): Record<string, KitState> {
  return Object.fromEntries(Object.entries(kit.states ?? {}).filter((e): e is [string, KitState] => typeof e[1] === 'object' && e[1] !== null && 'lanes' in e[1]));
}

// the kit rows by their own ids
const ROWS: Record<string, { id: string; wants: { kit: unknown } }> = Object.fromEntries(
  ([KIT_LIQUID] as Array<{ id: string; wants: { kit: unknown } }>).map((row) => [row.id, row]));

/** The kit a place names, by its row id; null for a name no row carries. Every row is checked once, at load (`kitProblems`). */
export function kitOf(id: string): Kit | null {
  return (ROWS[id]?.wants.kit as Kit | undefined) ?? null;
}

/** The kit rows as written, for what reads a row whole (the measurement stamp). */
export const KIT_ROWS: readonly unknown[] = Object.freeze(Object.values(ROWS));
/** Every kit row's id, for the checks. */
export const KIT_IDS: readonly string[] = Object.freeze(Object.keys(ROWS));

/** What is wrong with a kit, by shape: the composer reads these fields and nothing else. */
export function kitProblems(kit: Kit): string[] {
  const bad: string[] = [];
  const lanes = Object.keys(kit.lanes ?? {});
  if (!Number.isInteger(kit.cycleBars) || kit.cycleBars < 1) bad.push('cycleBars: a whole number of bars');
  if (!Array.isArray(kit.grooves) || !kit.grooves.length) bad.push('grooves: the section kinds the kit plays whole in');
  const within = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!within(kit.minP, 0, 1)) bad.push('minP: a chance from 0 to 1');
  const laneFaults = (name: string, l: KitLane) => {
    if (!['kick', 'backbeat', 'offbeat'].includes(l.group)) bad.push(`${name}: group is kick, backbeat or offbeat`);
    if (!l.plays) bad.push(`${name}: plays names a voice`);
    if (!Array.isArray(l.steps) || !l.steps.length) bad.push(`${name}: steps, one or more`);
    for (const s of l.steps ?? []) {
      if (!(Number.isInteger(s.step) && s.step >= 0 && s.step < 16 * kit.cycleBars) || !within(s.p, 0, 1)) bad.push(`${name}: step ${s.step} out of the cycle or its chance out of 0-1`);
      // a level over the lane's loudest, its spread, and an offset against the kick inside a sixteenth at 120 BPM
      if (!within(s.vel, 0, 1) || !within(s.velSd, 0, 1) || !within(s.ms, -50, 50)) bad.push(`${name}: step ${s.step} needs vel and velSd from 0 to 1 and ms within ±50`);
    }
    if (l.vel !== undefined && (!Array.isArray(l.vel) || l.vel.length !== 2 || !within(l.vel[0], 0, 1) || !within(l.vel[1], 0, 1) || l.vel[0] + l.vel[1] > 1))
      bad.push(`${name}: vel is [floor, span] inside 0-1`);
    if (l.minVel !== undefined && !within(l.minVel, 0, 1)) bad.push(`${name}: minVel from 0 to 1`);
    if (l.accent !== undefined && l.accent !== 'level') bad.push(`${name}: accent is 'level' or absent`);
    if (l.gainDb !== undefined && !within(l.gainDb, -60, 12)) bad.push(`${name}: gainDb from -60 to 12`);
    if (l.pan !== undefined && !within(l.pan, -1, 1)) bad.push(`${name}: pan from -1 to 1`);
    for (const k of ['panSpread', 'room', 'reverb'] as const) if (l[k] !== undefined && !within(l[k], 0, 1)) bad.push(`${name}: ${k} from 0 to 1`);
  };
  for (const [name, l] of Object.entries(kit.lanes ?? {})) laneFaults(name, l);
  for (const [state, st] of Object.entries(kit.states ?? {})) {
    if (state === 'note') continue;
    if (typeof st !== 'object' || st === null || typeof st.lanes !== 'object' || !Object.keys(st.lanes).length) { bad.push(`states.${state}: lanes, one or more`); continue; }
    // a state's lane plays the bar's own drum (`kick`, `snare`) or a voice; its group is one the kit already replaces
    for (const [name, l] of Object.entries(st.lanes)) laneFaults(`states.${state}.${name}`, l);
  }
  const known = (lane: string | undefined, where: string) => { if (lane != null && !lanes.includes(lane)) bad.push(`${where}: no lane ${lane}`); };
  for (const [kind, sec] of Object.entries(kit.sections ?? {})) for (const l of sec.lanes ?? []) known(l, `sections.${kind}`);
  if (kit.lift) { known(kit.lift.eighths.lane, 'lift.eighths'); kit.lift.eighths.clears.forEach((l) => known(l, 'lift.eighths.clears')); known(kit.lift.close.lane, 'lift.close'); }
  const moveFaults = (where: string, m: KitMove) => {
    if (m.clear != null) {
      if (m.lane != null || m.drop != null || !Array.isArray(m.clear) || !m.clear.length) bad.push(`${where}: a clear takes lanes off and strikes or drops nothing`);
      for (const l of m.clear ?? []) known(l, where);
      const from = m.fromStep ?? 0, to = m.toStep ?? 16;
      if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= 16 && from < to)) bad.push(`${where}: a clear runs from a step to a later one inside the bar`);
    } else {
      known(m.lane, where); known(m.drop, where);
      if ((m.lane == null) === (m.drop == null)) bad.push(`${where}: a move strikes a lane or drops one`);
      if (!(Number.isInteger(m.step) && m.step! >= 0 && m.step! < 16)) bad.push(`${where}: a step in the bar`);
    }
    if (!['first', 'last', 'each'].includes(m.bar)) bad.push(`${where}: bar is first, last or each`);
    if ((m.vel !== undefined && !within(m.vel, 0, 1)) || (m.p !== undefined && !within(m.p, 0, 1)))
      bad.push(`${where}: vel and p from 0 to 1`);
  };
  for (const [kind, moves] of Object.entries(kit.moves ?? {})) if (Array.isArray(moves)) for (const m of moves) moveFaults(`moves.${kind}`, m);
  for (const [id, moves] of Object.entries(kit.answers ?? {})) if (Array.isArray(moves)) {
    if (!moves.length) bad.push(`answers.${id}: one move or more`);
    for (const m of moves) { moveFaults(`answers.${id}`, m); if (m.bar !== 'last') bad.push(`answers.${id}: an answer falls on its own bar (bar: last)`); }
  }
  if (kit.lift && (!within(kit.lift.close.vel, 0, 1) || kit.lift.eighths.steps.some(([st, v]) => !(Number.isInteger(st) && st >= 0 && st < 16) || !within(v, 0, 1))))
    bad.push('lift: steps in the bar, velocities from 0 to 1');
  if (kit.phraseFill && (!(Number.isInteger(kit.phraseFill.everyBars) && kit.phraseFill.everyBars >= 1) || !within(kit.phraseFill.chance, 0, 1)))
    bad.push('phraseFill: every whole bars, a chance from 0 to 1');
  return bad;
}

// every kit row read once, here: a row that breaks one of the composer's readings is refused by its id, and the app does not load
for (const [id, row] of Object.entries(ROWS)) {
  const bad = kitProblems(row.wants.kit as Kit);
  if (bad.length) throw new Error(`kit row ${id}: ${bad.join('; ')}`);
}
