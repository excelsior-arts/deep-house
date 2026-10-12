// **Who carries the low end** (round DUB-1, `notes/rounds/dub-1.md`).
//
// A place may turn the roles of the kick and the bass round (`ROLES` in
// `styles/deep-house-places.ts`, typed in `places.ts`): the kick a punch over
// the line, the line the sub with its sweep on its own filter. It is read last
// of all, over a theme the other tables have already written, and it says on
// the plan what it changed (`sound.roles`), so the listening row
// `roles=classic` (`applyBypass`, set-plan.ts) puts the theme back to the bit:
// the same events with the voices they were drawn as and no controls on the
// line, the room's own sidechain and copy, and the trim the theme had.
//
// A swap keeps the event's time, step, pitch, length, level and gain, and the
// controls it writes are the sweep's rate and phase, which the plain bottoms do
// not read and `classic` takes off again. The one thing that moves a note is
// the line's hold (round DUB-2, `holdLine`): a note runs on, or goes into the
// held note before it — never a new note and never a new pitch — and the
// readout keeps what it took (`held`), so `classic` lays the line back as it
// was drawn.

import { mergeParams, clone } from '@deep-house/engine/params';
import type { PlainTable } from '@deep-house/engine/params';
import type { ParamOverrides } from '@deep-house/engine/params';
import type { RolesEntry, RolesHold } from './places.ts';
import { SUB_BOTTOMS, voiceClass } from './lane-level.ts';

/** The kit's kicks a place may swap: the room-voiced one and the kitchen's two (`voice-classes.json` `kitKicks`). */
const KIT_KICKS: ReadonlySet<string> = voiceClass('kitKicks');
/** The controls the sweep writes on a note of the line, and `classic` takes off. */
const SWEEP_CONTROLS = ['movementHz', 'movementPhase'] as const;

/** What a place's roles changed on a theme, said on the plan so it can be undone. */
export interface RolesReadout {
  /** the row that turned them */
  id: string;
  /** each swapped voice to the voice it was drawn as: one drawn voice per row, so the map runs back */
  swapped: Record<string, string>;
  /** the sweep's period in beats, where the line's notes carry it */
  wobbleBeats?: number;
  /**
   * The room's own values at the paths the row wrote, as they stood before it:
   * `null` is a path that was absent (a theme whose room said nothing there).
   */
  was: { lowDepthDb?: number | null; parallel?: PlainTable | null };
  /** the theme's trim under its classic roles (`planTheme` writes it): what `roles=classic` plays at */
  trimDb?: number;
  /**
   * What the line's hold took (round DUB-2), by each event's place in the
   * theme's events as drawn: the notes that went into a held note, whole, and
   * the parameters each note that was held had before it ran on.
   */
  held?: { gone: Array<[number, RolesEvent]>; was: Array<[number, Record<string, unknown>]> };
  /** the ride's notes laid beside the held line (round DUB-4): each carries the reese's `ride` switch, which is how `classic` finds them */
  ride?: number;
}

type RolesEvent = { t: number; voice: string; layer?: string; p: Record<string, unknown> };

interface RolesTrack {
  bpm: number;
  beat: number;
  events: RolesEvent[];
  paramOverrides: ParamOverrides;
  sound: { roles?: RolesReadout } & Record<string, unknown>;
  trimDb?: number;
}

/** The voice of a layer the swap takes: the swappable one drawn most, so one row maps back to one drawn voice. */
function drawnMost(events: RolesTrack['events'], layer: string, swappable: ReadonlySet<string>): string | null {
  const n = new Map<string, number>();
  for (const e of events) if (e.layer === layer && swappable.has(e.voice)) n.set(e.voice, (n.get(e.voice) ?? 0) + 1);
  let best: string | null = null, most = 0;
  for (const [v, k] of n) if (k > most) { best = v; most = k; }
  return best;
}

/**
 * **Turn the roles** a place's row asks for, on a theme already written: the
 * kick and the bass swapped on the events, the sweep written on the line's
 * notes off the grid, the bass's duck and the copy in parallel set in the
 * theme's room — and what each was, said on `sound.roles`. A row that changes
 * nothing writes nothing, so every place but the one that asks is the theme it
 * was.
 * @param sounds the style's sound words (`SOUNDS`), a word to the row it resolves to
 */
export function turnRoles(track: RolesTrack, row: RolesEntry | null, sounds: Readonly<Record<string, string | null>>): void {
  if (!row) return;
  const swapped: Record<string, string> = {};
  const swap = (layer: string, swappable: ReadonlySet<string>, word: string | undefined) => {
    const to = word ? sounds[word] : null;
    const from = to ? drawnMost(track.events, layer, swappable) : null;
    if (!to || !from || from === to) return null;
    for (const e of track.events) if (e.layer === layer && e.voice === from) e.voice = to;
    swapped[to] = from;
    return to;
  };
  swap('kick', KIT_KICKS, row.kick);
  const line = swap('bass', SUB_BOTTOMS, row.bass);
  // The line held (round DUB-2) before the sweep is written on it, so a held
  // note carries the phase of where it starts.
  const held = line && row.hold ? holdLine(track, line, row.hold) : null;
  // The ride (round DUB-4): the line as drawn, laid again beside the held one
  // with the reese's `ride` switch on every note, so it plays into the copy
  // alone. Before the sweep, so its notes carry the sweep's phase as well.
  const ride = line && held && row.ride ? layRide(track, line, held, row.ride.releaseS) : 0;
  // The sweep on the grid: the theme's own rate, and where in its cycle each
  // note of the line starts, so a note held over a bar line sweeps on and the
  // next note picks the sweep up where it is. Nought turns is the corner at its
  // lowest, on the bar line (`wobbleBeats` divides the bar).
  const wobble = line && (row.wobbleBeats ?? 0) > 0 ? row.wobbleBeats! : 0;
  if (wobble) {
    const period = wobble * track.beat;
    const hz = +(1 / period).toFixed(5);
    for (const e of track.events) {
      if (e.layer !== 'bass' || e.voice !== line) continue;
      const turns = e.t / period;
      e.p = { ...e.p, movementHz: hz, movementPhase: +(turns - Math.floor(turns)).toFixed(5) % 1 };
    }
  }
  const room = track.paramOverrides as PlainTable;
  const was: RolesReadout['was'] = {};
  const write: PlainTable = {};
  if (row.lowDepthDb != null) {
    const sc = room.sidechain as PlainTable | undefined;
    was.lowDepthDb = typeof sc?.lowDepthDb === 'number' ? sc.lowDepthDb : null;
    write.sidechain = { lowDepthDb: row.lowDepthDb };
  }
  let parallelGone = false;
  if (row.parallelOff || row.parallelBlend != null) {
    const bass = room.bass as PlainTable | undefined;
    was.parallel = bass?.parallel ? clone(bass.parallel as PlainTable) : null;
    // The copy's own blend over the turned line (round DUB-3): the room's copy
    // as its row wrote it, sweep and all, only its level the roles row's — and
    // since round DUB-4 its floor, and where a ride is laid, the side door as
    // all it is fed.
    if (row.parallelOff) parallelGone = !!bass?.parallel;
    else if (bass?.parallel) write.bass = { parallel: { blend: row.parallelBlend!,
      ...(row.parallelFloorHz != null ? { floorHz: row.parallelFloorHz } : {}), ...(ride ? { side: 1 } : {}) } };
  }
  if (!Object.keys(swapped).length && !Object.keys(write).length && !parallelGone) return;
  let next = Object.keys(write).length ? mergeParams(room, write) as PlainTable : room;
  if (parallelGone) next = withoutPath(next, ['bass', 'parallel']);
  track.paramOverrides = next as ParamOverrides;
  track.sound = { ...track.sound, roles: { id: row.id, swapped, ...(wobble ? { wobbleBeats: wobble } : {}), was, ...(held ? { held } : {}), ...(ride ? { ride } : {}) } };
}

/**
 * **Lay the ride** (round DUB-4): the swapped line as it was drawn — the
 * events the hold left, with what it took put back — each copied with the
 * reese's `ride` switch and merged into the events in time order, after the
 * events already at its instant. Returns how many it laid.
 */
function layRide(track: RolesTrack, line: string, held: NonNullable<RolesReadout['held']>, releaseS?: number): number {
  const drawn = unhold(track.events, held).filter((e) => e.layer === 'bass' && e.voice === line)
    .map((e): RolesEvent => ({ ...e, p: { ...e.p, ride: 1, ...(releaseS != null ? { release: releaseS } : {}) } }));
  if (!drawn.length) return 0;
  // each note fallen to nothing a release before the next strikes
  if (releaseS != null) for (let i = 0; i + 1 < drawn.length; i++) {
    const d = drawn[i].p.dur, room = drawn[i + 1].t - drawn[i].t - 2 * releaseS;
    if (typeof d === 'number' && d > room && room > 0.03) drawn[i].p.dur = +room.toFixed(5);
  }
  const out: RolesEvent[] = [];
  let k = 0;
  for (const e of track.events) {
    while (k < drawn.length && drawn[k].t < e.t) out.push(drawn[k++]);
    out.push(e);
  }
  while (k < drawn.length) out.push(drawn[k++]);
  track.events = out;
  return drawn.length;
}

/**
 * **Hold the line** (round DUB-2, `RolesHold` in places.ts): the swapped
 * line's notes in time order, each joining the held note before it or
 * striking, as the row says. A note that joins goes, and the held note runs to
 * its end at the loudest of the velocities it took in — the figure's accent
 * goes to the note that carries it, so a ghost on the half bar does not hold
 * two beats at a ghost's level; a note that strikes ends the held note before
 * it at its own start, where the gap was a bridge and not a rest. What it took
 * is returned for the readout, by each event's place in the events as drawn;
 * `null` where nothing moved.
 */
function holdLine(track: RolesTrack, line: string, hold: RolesHold, eps = 1e-3): RolesReadout['held'] | null {
  const beat = track.beat;
  const order = track.events.map((e, i) => i).filter((i) => track.events[i].layer === 'bass' && track.events[i].voice === line)
    .sort((a, b) => track.events[a].t - track.events[b].t || a - b);
  // on a line of the grid within a twentieth of it (a swung step is off it)
  const on = (t: number, every: number) => { const k = t / (every * beat); return Math.abs(k - Math.round(k)) < 0.05; };
  const len = (i: number) => { const d = track.events[i].p.dur; return typeof d === 'number' && Number.isFinite(d) ? d : 0; };
  const vel = (i: number) => { const v = track.events[i].p.vel; return typeof v === 'number' && Number.isFinite(v) ? v : 1; };
  const changed = new Map<number, { end: number; vel: number }>();
  const gone = new Set<number>();
  let cur = -1, end = 0, loud = 1;
  const close = () => {
    if (cur < 0) return;
    if (Math.abs(end - (track.events[cur].t + len(cur))) > 1e-9 || loud !== vel(cur)) changed.set(cur, { end, vel: loud });
  };
  for (const i of order) {
    const e = track.events[i];
    if (cur >= 0 && e.t - end <= hold.bridgeBeats * beat + eps) {
      const same = e.p.midi === track.events[cur].p.midi;
      const joins = e.t - track.events[cur].t < eps || !on(e.t, hold.strikeBeats) || (same && !on(e.t, hold.againBeats));
      if (joins) { gone.add(i); end = Math.max(end, e.t + len(i)); loud = Math.max(loud, vel(i)); continue; }
      end = e.t;
    }
    close();
    cur = i; end = e.t + len(i); loud = vel(i);
  }
  close();
  if (!gone.size && !changed.size) return null;
  const held: NonNullable<RolesReadout['held']> = { gone: [], was: [] };
  for (const [i, { end: t, vel: v }] of changed) {
    const e = track.events[i];
    held.was.push([i, { ...e.p }]);
    e.p = { ...e.p, dur: +(t - e.t).toFixed(5), ...(v !== vel(i) ? { vel: v } : {}) };
  }
  for (const i of gone) held.gone.push([i, { ...track.events[i], p: { ...track.events[i].p } }]);
  held.was.sort((a, b) => a[0] - b[0]);
  held.gone.sort((a, b) => a[0] - b[0]);
  track.events = track.events.filter((_, i) => !gone.has(i));
  return held;
}

/** The events as drawn, from the events the hold left and what it took (`RolesReadout['held']`). */
function unhold(events: readonly RolesEvent[], held: NonNullable<RolesReadout['held']>): RolesEvent[] {
  const out: RolesEvent[] = [];
  let k = 0, g = 0;
  const n = events.length + held.gone.length;
  for (let i = 0; i < n; i++) out.push(g < held.gone.length && held.gone[g][0] === i ? held.gone[g++][1] : events[k++]);
  for (const [i, p] of held.was) out[i] = { ...out[i], p: { ...p } };
  return out;
}

/** A copy of a room with one path taken out, and its parent with it where nothing else is left there. */
function withoutPath(room: PlainTable, path: readonly string[]): PlainTable {
  const out = clone(room) as PlainTable;
  const stack: PlainTable[] = [out];
  let at: PlainTable | undefined = out;
  for (const k of path.slice(0, -1)) { at = at && typeof at[k] === 'object' ? at[k] as PlainTable : undefined; if (at) stack.push(at); }
  if (!at) return out;
  delete at[path[path.length - 1]];
  for (let i = stack.length - 1; i > 0; i--) if (!Object.keys(stack[i]).length) delete stack[i - 1][path[i - 1]];
  return out;
}

/**
 * **The theme under its classic roles**: the events with the voices they were
 * drawn as and no sweep on the line, the room's own duck and copy in
 * parallel, the classic trim where `planTheme` wrote one — a theme the roles
 * never touched comes back as it is. A copy: the track handed in is not
 * changed.
 */
export function classicRoles<T extends RolesTrack>(track: T): T {
  const R = track.sound?.roles;
  if (!R) return track;
  const back = new Map(Object.entries(R.swapped));
  const lines = new Set(Object.keys(R.swapped));
  const kept = R.ride ? track.events.filter((e) => !(e.layer === 'bass' && lines.has(e.voice) && e.p.ride === 1)) : track.events;
  const drawn = R.held ? unhold(kept, R.held) : kept;
  const events = drawn.map((e) => {
    const from = back.get(e.voice);
    if (!from) return e;
    const p = { ...e.p };
    if (e.layer === 'bass') for (const k of SWEEP_CONTROLS) delete p[k];
    return { ...e, voice: from, p };
  });
  let room = clone(track.paramOverrides as PlainTable) as PlainTable;
  if (R.was.lowDepthDb !== undefined) {
    room = R.was.lowDepthDb === null ? withoutPath(room, ['sidechain', 'lowDepthDb']) : mergeParams(room, { sidechain: { lowDepthDb: R.was.lowDepthDb } }) as PlainTable;
  }
  // the room's copy whole, as it was: a key the roles wrote that it never had (the floor, the side door) goes too
  if (R.was.parallel) room = mergeParams(withoutPath(room, ['bass', 'parallel']), { bass: { parallel: clone(R.was.parallel) } }) as PlainTable;
  const { roles: _roles, ...sound } = track.sound;
  return {
    ...track,
    events,
    paramOverrides: room as ParamOverrides,
    sound,
    ...(R.trimDb != null ? { trimDb: R.trimDb } : {}),
  };
}
