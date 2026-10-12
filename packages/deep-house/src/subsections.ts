// **The small things inside a section** — round DNB-1, 10-02: *"the track has
// to be alive … sub-segments inside the mains, timed."*
//
// A section of the form (`arrangement.ts`) is one beat played for as long as
// the section lasts: the break row is drawn once a theme and every bar replays
// it. The drum and bass mix of source 8, read bar by bar
// (`notes/rounds/dnb-1.md` §2, *The small things*), does not: a two-step drop
// changes something in its beat about once in four bars, half time once in
// three, and the changes are of four kinds —
//
//   - a **switch-up**: a second beat for 8, 16 or 32 bars inside the drop (the
//     form read two to five beat kinds a cut, holding 12–32 bars: cut 2 plays
//     A 32, B 16, C 32), the snare moved first, then the kick;
//   - a **turnaround**: the last bar of a four-bar group answering the three
//     before it — a double kick, two ghost snares into the line, the hats
//     gapped (cut 7 alternates its two kinds every four bars);
//   - a **fill**: the bar before a section line, a snare roll through its last
//     beat (the bar before a line varies on 0.74 of the half-time lines and
//     0.86 of the breakdowns' against 0.42 elsewhere);
//   - a **drop-out**: one bar with the drums gone but a snare on four-and, the
//     commonest single gesture of the mix (82 of its 104 drop-outs are one
//     bar), and a crash on the one after it; at a sixteen-bar line inside a
//     drop, and on the last bar before a drop or a breakdown (the line the
//     mix marks with one).
//
// They are **sub-sections**: named, timed spans inside a section that leave
// its kind, its start and its length alone, so nothing that reads the form —
// the phrase grid, the dropouts, the lead-ins, the ring's arc, K41's needle —
// sees a different form.
//
// **Since round T1 this file is the mechanism and the figures are rows**
// (`notes/plans/PLAN-TREATMENTS.md`; `recipes/treatments/*.json`, the
// contract in `src/treatment.ts`). The four kinds are the four placement
// rules below — where a kind's bars are, in which sections, under what — and
// a place table (`deep-house-places.ts` `SUBSECTIONS`) says how much of each
// kind a theme draws there: the fast broken beat a lot, the house some, the
// drone places none. Which figure plays is a draw among the `treatment` rows
// of the kind by their weight, off a stream of the kind's own
// (`<seed>::sub:…`), so no die the record or any other rule rolls moves. What
// a figure does to a bar is its row's `figure`: lane edits in roles, steps
// and levels, played by `playSubSections` by copying a hit the bar already
// has — the same voice, the same lane trim, the same room — so a figure is
// the theme's own kit playing other steps and never an instrument the theme
// did not draw. A row names no voice and no number of the engine's.

import { Rng } from './rng.ts';
import type { Arrangement } from './arrangement.ts';
import { weightOf, type Recipe } from './recipe.ts';
import { admits } from './sections.ts';
import { DEFAULT_LETTERS, PLAYED_KINDS, type Figure, type Insertion, type LaneEdit, type Letter, type PlayedKind } from './treatment.ts';
import { BIRDS, type Spell } from './spell.ts';

/** What a span inside a section is. */
export type SubKind = PlayedKind;

/** One sub-section: its kind, where it is, how long, the row that plays it, and the name a listener reads. */
export interface SubSection {
  kind: SubKind;
  startBar: number;
  bars: number;
  /** the name on the ring: the row's own */
  label: string;
  /** the row's id */
  figure: string;
  /** the row, whose `figure` is played */
  row: Recipe;
  /** a variation's other rows, in the draw's order after it: played in turn where the drawn one had nothing to change (round M1) */
  alternates?: Recipe[];
}

/**
 * **How much a place draws**: the chance a main or a drop of 24 bars or more
 * carries a switch-up and how long it may be, the chance each four-bar group's
 * last bar turns around, that the bar before a section line fills, that a
 * sixteen-bar line inside a main (or the line into a drop) drops out for a
 * bar; and whether a crash marks the one after a drop-out. Which figure of a
 * kind plays is the rows' weights, not the place's (round T1).
 */
export interface SubRates {
  switchUp: number;
  switchBars: readonly number[];
  turnaround: number;
  fill: number;
  dropOut: number;
  crash: boolean;
  /**
   * the turnaround at the phrase before a switch-up (round M1, the mains pass):
   * the bar before a switch-up's first is a four-bar group's last, and where a
   * place says so it turns around whatever its own die said — the line the
   * switch is heard on is announced, as a house main announces its changes
   */
  turnIntoSwitch?: boolean;
  /**
   * the variations (round M1, the hats): the chance each sixteen-bar phrase's
   * second half carries one, the spans it may hold (ending on the line), and
   * the length past which a section takes at least one whatever its dice said
   */
  variation?: number;
  variationBars?: readonly number[];
  variationFloor?: number;
}

/** None of it: the drone places, and any theme without drums. */
export const NO_SUBS: SubRates = Object.freeze({ switchUp: 0, switchBars: [], turnaround: 0, fill: 0, dropOut: 0, crash: false });

/**
 * The rates a pinned treatment row plays under: its own kind at every bar the kind's rule admits, the other kinds silent.
 * A switch-up's spans are the place's; where the place names none (most places draw no switch-up of their own) a
 * pinned one takes `spans` — the row's own, else every span the style's tables name — so it plays at every place
 * (the review of 10-08, A4: it played nothing at nine places of thirteen).
 */
export function pinnedRates(base: SubRates, kind: string, spans: readonly number[] = []): SubRates {
  const key = ({ 'switch-up': 'switchUp', turnaround: 'turnaround', fill: 'fill', 'drop-out': 'dropOut', variation: 'variation' } as const)[kind as PlayedKind];
  const switchBars = base.switchBars.length || kind !== 'switch-up' ? base.switchBars : spans;
  return { ...NO_SUBS, switchBars, crash: base.crash, variationBars: base.variationBars ?? [8], ...(key ? { [key]: 1 } : {}) };
}

/** The rows of a kind, in the library's order; a row of a kind the mechanism does not play is nobody's. */
const ofKind = (rows: readonly Recipe[], kind: PlayedKind): Recipe[] => rows.filter((r) => r.scope === 'treatment' && r.applies === kind);

/**
 * **Whether a row is in the running where the theme is** (round M1): its tempo
 * window, where it names one, holds the theme's tempo, and every bird it names
 * a range for holds the theme's spell. A bird it does not name says nothing —
 * every row written before the mains pass names none and no tempo, so it is in
 * the running everywhere, as it always was. A row pinned by link is the
 * listener's word and plays wherever it is asked.
 */
export function inBox(row: Recipe, spell: Spell | null | undefined, bpm: number | undefined): boolean {
  const t = row.tempo?.bpm;
  if (t && bpm !== undefined && (bpm < t[0] || bpm > t[1])) return false;
  if (spell) for (const b of BIRDS) {
    const r = row.birds?.[b];
    if (Array.isArray(r) && (spell[b] < r[0] || spell[b] > r[1])) return false;
  }
  return true;
}

/** The kit a switch-up row is written for: a broken kit's where it says nothing (every figure before the mains pass). */
const kitOf = (row: Recipe): 'broken' | 'four' | 'any' => row.place?.kit ?? 'broken';

/**
 * **One row of a kind, by weight.** A row at weight nought is not in the
 * running; one row in the running is the row, and no die is spent on it —
 * so a kind with one figure draws exactly as the code did before it was a
 * row, and a candidate at nought beside it moves nothing. Two or more draw
 * through `pickWeighted`, which is `pick` to the bit where the weights are
 * equal (`src/rng.ts`).
 */
function draw(rng: Rng, rows: readonly Recipe[], pinned = false): Recipe | null {
  // A row pinned by link plays whatever it weighs: the pin is the listener's word.
  const live = pinned ? [...rows] : rows.filter((r) => weightOf(r) > 0);
  if (!live.length) return null;
  if (live.length === 1) return live[0];
  return rng.pickWeighted(live, weightOf) ?? null;
}

/** Whether a row's place admits a section kind, and the section after it. */
const placed = (row: Recipe, kind: string, into?: string): boolean =>
  (!row.place?.sections || row.place.sections.includes(kind)) && (into === undefined || !row.place?.into || row.place.into.includes(into));

/**
 * **The roles a row may change** (C04 of the 10-03 review): its lanes, the
 * lanes of its `without` blocks (played where a lane had nothing), and the
 * roles its `layers` switch or trade — and, since the `offbeat` role is both
 * hats, the open hat with it and it with the open hat.
 */
export function footprint(row: Recipe): Set<string> {
  const f = row.figure ?? {};
  const out = new Set<string>(Object.keys(f.lanes ?? {}));
  for (const w of Object.values(f.without ?? {})) for (const role of Object.keys(w.lanes ?? {})) out.add(role);
  for (const list of [f.layers?.on, f.layers?.off, f.layers?.swap]) for (const role of list ?? []) out.add(role);
  if (out.has('offbeat')) out.add('open');
  if (out.has('open')) out.add('offbeat');
  return out;
}

/**
 * **Whether a variation's row would edit what a switch-up over the same bars
 * edits**: the one overlap check, run on the row drawn and on each row it may
 * fall back to. Only a switch-up is guarded; a fill, a turnaround or a
 * drop-out on a switch-up's bar plays over it, as the precedence says.
 */
export function clashes(row: Recipe, span: { startBar: number; bars: number }, others: readonly SubSection[]): boolean {
  const mine = footprint(row);
  return others.some((o) => o.kind === 'switch-up' && o.startBar < span.startBar + span.bars && span.startBar < o.startBar + o.bars
    && [...footprint(o.row)].some((role) => mine.has(role)));
}

/**
 * **The sub-sections of one theme.** Only where drums play; a switch-up only
 * under a broken kit. Which kinds a section takes, and where, is its row's
 * `admits` (round T2, `src/sections.ts`; `recipes/sections/`): the record's
 * main and drop carry switch-ups over a span, turnarounds on their four-bar
 * groups, drop-outs at their sixteen-bar lines and on the last bar into a
 * drop or a breakdown, and a fill on their last bar; its build fills or
 * drops out its last bar; its breakdown fills; its intro and outro take
 * nothing. The rules themselves — where a line is, how long a span may be,
 * that the bar into a drop is the bar the mix marks — are here.
 * Precedence on a bar: a drop-out, then a fill, then a turnaround; a
 * switch-up is a span the three may sit inside.
 *
 * @param rows the treatment rows the draw sees, in the library's order
 */
export function planSubSections(seed: string | number, arrangement: Arrangement, rates: SubRates,
  { drums, broken, pinned = false, spell = null, bpm }: { drums: boolean; broken: boolean; pinned?: boolean; spell?: Spell | null; bpm?: number },
  allRows: readonly Recipe[]): SubSection[] {
  if (!drums) return [];
  // The rows in the running where the theme is: a row's box and tempo (round M1).
  const rows = pinned ? allRows : allRows.filter((row) => inBox(row, spell, bpm));
  const out: SubSection[] = [];
  const taken = new Set<number>();
  const mark = (s: SubSection) => { out.push(s); for (let b = s.startBar; b < s.startBar + s.bars; b++) taken.add(b); };
  const sub = (kind: SubKind, row: Recipe, startBar: number, bars: number): SubSection => ({ kind, startBar, bars, label: row.name, figure: row.id, row });
  const secs = arrangement.sections;
  for (const s of secs) {
    const r = new Rng(`${seed}::sub:${s.index}`);
    const next = secs[s.index + 1];
    const last = s.startBar + s.bars - 1;
    // The drop-out into a drop or a breakdown: the last bar before it, where
    // the row admits one there (a section whose last phrase plays the kit).
    const into = next && (next.kind === 'drop' || next.kind === 'breakdown') && admits(s, 'drop-out', 'last') ? r.chance(rates.dropOut) : false;
    // The drop-outs at the sixteen-bar lines inside a section that admits them.
    const lines: number[] = [];
    if (admits(s, 'drop-out', 'lines')) for (let b = s.startBar + 16; b < s.startBar + s.bars; b += 16) if (r.chance(rates.dropOut)) lines.push(b - 1);
    // The fill on the section's last bar, and which fill: the draw is made
    // whether or not the fill is, so the stream reads as it always has.
    const fill = next && admits(s, 'fill', 'last') ? r.chance(rates.fill) : false;
    const fillRow = draw(r, ofKind(rows, 'fill').filter((row) => placed(row, s.kind, next?.kind)), pinned);
    const dropRows = ofKind(rows, 'drop-out');
    const dropRow = (into?: string) => dropRows.filter((row) => placed(row, s.kind, into));
    // A row that spaces its lines (`place.every`, R03 of the 10-03 review) is in the running only on
    // the lines that many bars apart from the section's start: every row that names none, on all of them.
    const onLine = (row: Recipe, b: number) => !row.place?.every || (b + 1 - s.startBar) % row.place.every === 0;
    for (const b of lines) { const row = draw(r, dropRow().filter((row) => onLine(row, b)), pinned); if (row) mark(sub('drop-out', row, b, 1)); }
    if (into && !taken.has(last)) { const row = draw(r, dropRow(next!.kind), pinned); if (row) mark(sub('drop-out', row, last, 1)); }
    else if (fill && fillRow && !taken.has(last)) mark(sub('fill', fillRow, last, 1));
    if (!admits(s, 'turnaround', 'groups')) continue;
    // The turnarounds: the last bar of every four-bar group but the first and the section's last.
    const turns = ofKind(rows, 'turnaround').filter((row) => placed(row, s.kind));
    for (let b = s.startBar + 7; b < last; b += 4) {
      const t = new Rng(`${seed}::sub:bar:${b}`);
      if (!t.chance(rates.turnaround) || taken.has(b)) continue;
      const row = draw(t, turns, pinned);
      if (row) mark(sub('turnaround', row, b, 1));
    }
  }
  // The switch-ups, last, as spans the bar marks above sit inside. A
  // switch-up's figure is written for a kit (round M1, `place.kit`): the
  // figures of source 8 for a broken one, the house's for its four-floor,
  // and a theme draws among the rows written for its own.
  const kit = broken ? 'broken' : 'four';
  for (const s of secs) {
    if (!admits(s, 'switch-up', 'span') || s.bars < 24) continue;
    const r = new Rng(`${seed}::sub:switch:${s.index}`);
    if (!r.chance(rates.switchUp)) continue;
    const lens = rates.switchBars.filter((n) => n <= s.bars - 8);
    const figures = ofKind(rows, 'switch-up').filter((row) => placed(row, s.kind) && (pinned || weightOf(row) > 0)
      && (kitOf(row) === kit || kitOf(row) === 'any'));
    if (!lens.length || !figures.length) continue;
    const len = lens[r.int(0, lens.length)];
    const slots = Math.floor((s.bars - len) / 8);
    const start = s.startBar + 8 * (1 + r.int(0, Math.max(1, slots)));
    const at = Math.min(start, s.startBar + s.bars - len);
    // A row that names its spans (`place.bars`) holds only those; the length is drawn first, as it always was.
    const fits = figures.filter((row) => !row.place?.bars || row.place.bars.includes(len));
    if (!fits.length) continue;
    const row = draw(r, fits, pinned)!;
    out.push(sub('switch-up', row, at, len));
    // The turnaround at the phrase before the switch, where the place says so
    // (round M1): a four-bar group's last bar, inside the section, not a bar
    // another small thing already took.
    const before = at - 1;
    if (rates.turnIntoSwitch && before >= s.startBar + 7 && (before - s.startBar) % 4 === 3 && !taken.has(before)
      && admits(s, 'turnaround', 'groups')) {
      const t = draw(new Rng(`${seed}::sub:turn:${before}`), ofKind(rows, 'turnaround').filter((row) => placed(row, s.kind)), pinned);
      if (t) mark(sub('turnaround', t, before, 1));
    }
  }
  // The variations (round M1): a span over the second half of a sixteen-bar
  // phrase, ending on its line — where the cuts vary more, on all four read —
  // off a stream of their own, never over a switch-up that edits the same
  // roles (`clashes`, for the drawn row and for every row it may fall back
  // to); a section longer than the place's floor takes at least one.
  const variations = ofKind(rows, 'variation').filter((row) => pinned || weightOf(row) > 0);
  if (variations.length && (rates.variation ?? 0) > 0) for (const s of secs) {
    if (!admits(s, 'variation', 'halves') || s.bars < 16) continue;
    const r = new Rng(`${seed}::sub:vary:${s.index}`);
    const lens = (rates.variationBars ?? [8]).filter((n) => n <= 8);
    const fits = variations.filter((row) => placed(row, s.kind));
    if (!lens.length || !fits.length) continue;
    // Each phrase's slot: its length drawn, its row drawn, then whether it plays.
    const slots: SubSection[] = [];
    let drawn = 0;
    for (let p = s.startBar; p + 8 < s.startBar + s.bars; p += 16) {
      const line = Math.min(p + 16, s.startBar + s.bars);
      const len = Math.min(lens[r.int(0, lens.length)], line - (p + 8));
      const row = draw(r, fits, pinned);
      const plays = r.chance(rates.variation ?? 0);
      if (!row || len < 1) continue;
      const span = { startBar: line - len, bars: len };
      if (clashes(row, span, out)) continue;
      // The fallbacks are the rows the same check admits over the same bars: a
      // fallback is never a way round the switch-up the drawn row was kept off (C04).
      const v: SubSection = { ...sub('variation', row, span.startBar, len), alternates: fits.filter((x) => x !== row && !clashes(x, span, out)) };
      slots.push(v);
      if (plays) { out.push(v); drawn++; }
    }
    // The floor: a long section with no variation drawn takes its last free slot's.
    if (!drawn && s.bars > (rates.variationFloor ?? Infinity) && slots.length) out.push(slots[slots.length - 1]);
  }
  return out.sort((a, b) => a.startBar - b.startBar || b.bars - a.bars);
}

/** The sub-section a bar is in, the shortest first: a drop-out or a fill inside a switch-up names the bar. */
export function subAt(subs: readonly SubSection[], bar: number): SubSection | null {
  let best: SubSection | null = null;
  for (const s of subs) if (bar >= s.startBar && bar < s.startBar + s.bars && (!best || s.bars < best.bars)) best = s;
  return best;
}

/** An event as the generator keeps it. */
interface Ev { t: number; voice: string; p: Record<string, any>; bar?: number; step?: number; layer?: string; [k: string]: unknown }

/**
 * **The layer each role's hits are written on** — the grammar's own words for
 * the four drum lanes (`deep-house.ts` `lanes`, the `plays` of the registered
 * voices). A figure speaks in roles; the events carry layers.
 */
export const ROLE_LAYERS: Readonly<Record<string, string>> = Object.freeze({ kick: 'kick', backbeat: 'clap', offbeat: 'hats', sixteenth: 'shaker' });

/**
 * **Where a role's events are** (round M1): the layer they carry, and where a
 * role is one voice of a layer — the open hat among the hats — the voices it
 * is. `borrow`: a bar with no hit of the role copies the theme's nearest one,
 * whichever bar it is in (the open hat: unpitched, so no chord to be wrong
 * in). `held`: a note of the role sounds past its own bar (the bassline, the
 * keys, the pad), so clearing a bar cuts a note that rings into it.
 */
export interface RoleLane { layer: string; voices?: ReadonlySet<string> | null; borrow?: boolean; held?: boolean }
export type RoleLanes = Readonly<Record<string, RoleLane>>;

/** The drum roles as they have always been read: a layer each, every voice on it. */
export const DRUM_ROLE_LANES: RoleLanes = Object.freeze(Object.fromEntries(Object.entries(ROLE_LAYERS).map(([role, layer]) => [role, { layer }])));

/**
 * **A figure's role in the lane table's words**: the open hat is a slot of the
 * `offbeat` lanes and the drone is the `sustained` one; every other role is
 * its lane's own name. The roles an explicit part owns (the generator's
 * `heldRoles`) are written in the lane table's words, so a figure's role is
 * read through this before it is asked whether it is held.
 */
export const laneRoleOf = (role: string): string => (role === 'open' ? 'offbeat' : role === 'drone' ? 'sustained' : role);

/**
 * **How an added hit meets a hit of its role already on its step** (C01 of
 * the 10-03 review), one policy per operation, here and nowhere else:
 *
 *   - `add-if-absent`: the step keeps the hit it has and the new one is not
 *     written — a mask opens the groove where it is closed and leaves alone
 *     where it is already open (`mains/hats-open-and`'s idiom: *the open hat
 *     on the and … without a new instrument*), and a doubled kick or a crash
 *     on the one never lands on itself;
 *   - `replace`: the step's hit goes and the new one is written — a roll is a
 *     climb, and a hit at its own level inside it would break the climb;
 *   - `stack`: both sound, on purpose (a layer that means to double); no
 *     operation asks it by default, and a row that means it says so.
 *
 * A row's lane edit may say otherwise for its own hits (`LaneEdit.insert`,
 * `src/treatment.ts`): the policy is the operation's unless the row names one.
 *
 * Only the same role on the same step meets: a chord, or two roles on one
 * onset, are music, and nothing here dedupes them.
 */
export type { Insertion };
export const INSERTION: Readonly<Record<'mask' | 'roll' | 'double', Insertion>> = Object.freeze({
  mask: 'add-if-absent', roll: 'replace', double: 'add-if-absent',
});

/**
 * **What a lane's hit is copied from**: the backbeat's loudest hit of the bar
 * (the snare on the beat) and its quietest for a ghost; the kick's hit on the
 * one — its first — since the downbeat is the kick's reference. A level is a
 * share of the loudest hit's velocity unless the letter says it is absolute.
 */
const FIRST = new Set(['kick']);

/**
 * **The glue a figure plays on its line** (round M1): the slot's own voice,
 * over the sub-section's last `bars` bars ending on the line after it (a
 * riser, a sweep, a swell), or on the line's one (the impact); the composer
 * lays it, and says whether it did.
 */
export type GlueAt = (slot: string, line: number, bars: number, level: number) => boolean;

/**
 * **The small things, played.** Each sub-section rewrites the events of its
 * bars as its row's figure says, copying an event the bar already has for
 * each hit it adds — the same voice, the same lane trim, the same room — so
 * a figure is the theme's own kit playing other steps and never an instrument
 * the theme did not draw. A lane with nothing to copy takes no edit (a mask
 * over no backbeat in a room that plays none adds nothing, and the figure's
 * `without` block, where it has one, plays instead). A figure's `layers` are
 * the composer's (`gatesAt`); its `glue` is laid through `glue`.
 *
 * @param at where a step of a bar falls, in theme seconds
 * @param crash the voice that marks the one after a drop-out, or null
 */
export function playSubSections(events: Ev[], subs: readonly SubSection[], at: (bar: number, step: number) => number,
  crash: { voice: string; layer: string } | null,
  keep: { bars?: ReadonlySet<number>; roles?: RoleLanes; glue?: GlueAt; held?: ReadonlySet<string> } = {}): SubSection[] {
  // A bar another small thing already owns (the development's pickup) is
  // left alone, and an event a recipe asked for by name (`part`) is never
  // dropped: an explicit cell is a promise the overlay keeps (DNB-1 landing;
  // `check-development-rhythm.ts`).
  if (keep.bars?.size) subs = subs.filter((s) => { for (let b = s.startBar; b < s.startBar + s.bars; b++) if (keep.bars!.has(b)) return false; return true; });
  if (!subs.length) return [];
  const roles: RoleLanes = { ...DRUM_ROLE_LANES, ...(keep.roles ?? {}) };
  const isRole = (e: Ev, role: string) => { const r = roles[role]; return !!r && e.layer === r.layer && (!r.voices || r.voices.has(e.voice)); };
  // **A role an explicit part owns is the part's for the whole edit** (C02 of
  // the 10-03 review): nothing is cleared from it, copied out of it, borrowed
  // from it or added to it — the generator's `heldRoles` (a pinned part, a
  // recipe's cells, the recipes a composition drew), and any role an event a
  // recipe named (`part`) sounds in. A promise kept only against removal let a
  // mask double a pinned kick under the pin's own name.
  const reserved = new Set(Object.keys(roles).filter((role) => keep.held?.has(laneRoleOf(role)) || events.some((e) => e.part && isRole(e, role))));
  const layers = new Set(Object.values(roles).map((r) => r.layer));
  const byBar = new Map<number, Ev[]>();
  for (const e of events) if (e.bar != null && e.layer && layers.has(e.layer)) {
    if (!byBar.has(e.bar)) byBar.set(e.bar, []);
    byBar.get(e.bar)!.push(e);
  }
  const dropped = new Set<Ev>();
  const drop = { add: (e: Ev) => { if (!e.part) dropped.add(e); }, has: (e: Ev) => dropped.has(e), get size() { return dropped.size; } };
  const add: Ev[] = [];
  // A held note cut where a cleared bar begins: the event, and the length it keeps.
  const cut = new Map<Ev, number>();
  // What each sub-section changed, so the ring names only the ones heard.
  const heard = new Set<SubSection>();
  let mark = 0;
  const changed = () => drop.size + add.length + cut.size;
  const note = (s: SubSection, glued = false) => { if (changed() !== mark || glued) heard.add(s); mark = changed(); };
  // A hit a figure writes is the row's, by `by`: copied from the bar's own hit
  // for its sound, never under a part's name it was not written by (C02).
  const copy = (e: Ev, bar: number, step: number, vel: number, by: string): Ev => {
    const { part: _part, ...rest } = e;
    return { ...rest, t: at(bar, step) + (e.t - at(e.bar!, e.step ?? 0)), bar, step, p: { ...e.p, vel }, by };
  };
  // The bar as the edits so far left it: its own hits not dropped, and what was added.
  const current = (bar: number, role: string) => [
    ...(byBar.get(bar) || []).filter((e) => isRole(e, role) && !drop.has(e)),
    ...add.filter((e) => e.bar === bar && isRole(e, role) && !drop.has(e)),
  ];
  const remove = (bar: number, role: string, from = 0) => {
    for (const e of current(bar, role)) if ((e.step ?? 0) >= from) drop.add(e);
    // A held role: a note begun before the cleared step and still sounding there stops where the clearing begins.
    if (roles[role]?.held) {
      const t0 = at(bar, from);
      for (const e of events) if (isRole(e, role) && !e.part && !drop.has(e) && e.t < t0 - 1e-9 && typeof e.p.dur === 'number' && e.t + e.p.dur > t0 + 1e-9)
        cut.set(e, Math.min(cut.get(e) ?? Infinity, t0 - e.t));
    }
  };
  // The theme's own hits of a role that borrows, for a bar with none of its own.
  const nearest = (bar: number, role: string): Ev | null => {
    let best: Ev | null = null;
    for (const e of events) if (isRole(e, role) && e.bar != null && (!best || Math.abs(e.bar - bar) < Math.abs(best.bar! - bar))) best = e;
    return best;
  };
  // The lane's templates: what a hit and a ghost are copied from, and the velocity a level is a share of.
  const templates = (bar: number, role: string) => {
    const list = current(bar, role);
    const loud = [...list].sort((a, b) => (b.p.vel ?? 1) - (a.p.vel ?? 1));
    const full = loud[0] ?? (roles[role]?.borrow ? nearest(bar, role) : null);
    const from = FIRST.has(role) ? ([...list].sort((a, z) => (a.step ?? 0) - (z.step ?? 0))[0] ?? null) : full;
    return { from, ghost: loud[loud.length - 1] ?? full, vel: from?.p.vel ?? 1 };
  };
  /** A hit written onto its step as its operation's policy says (`INSERTION`), or as its row says. */
  const insert = (role: string, ev: Ev, op: keyof typeof INSERTION, own?: Insertion) => {
    const policy = own ?? INSERTION[op];
    if (policy !== 'stack') {
      const here = current(ev.bar!, role).filter((e) => (e.step ?? 0) === ev.step);
      if (here.length && policy === 'add-if-absent') return;
      for (const e of here) drop.add(e);
    }
    add.push(ev);
  };
  /**
   * One lane's edit on one bar of the figure: the templates first, then what
   * goes, then what comes. `applied`, `empty` where the lane had nothing to
   * copy (the figure's `without` block plays instead), `owned` where an
   * explicit part owns the role (nothing plays instead: the part is kept).
   */
  const edit = (bar: number, k: number, role: string, e: LaneEdit, letters: Readonly<Record<string, Letter>>, by: string): 'applied' | 'empty' | 'owned' => {
    if (!roles[role]) return 'empty';
    if (reserved.has(role)) return 'owned';
    const t = templates(bar, role);
    // A clear alone needs nothing to copy; a held note ringing into the bar is a thing to cut.
    if (!t.from && !(e.clear !== undefined && !e.mask && !e.roll && !e.double && roles[role].held)) return 'empty';
    if (e.clear !== undefined) remove(bar, role, e.clear);
    if (!t.from) return 'applied';
    if (e.mask) {
      const m = e.mask[k % e.mask.length];
      for (let step = 0; step < 16; step++) {
        const c = m[step];
        if (c === '.') continue;
        const l = letters[c];
        insert(role, copy(l.ghost ? t.ghost! : t.from, bar, step, l.absolute ? l.level : t.vel * l.level, by), 'mask', e.insert);
      }
    }
    if (e.roll) {
      const n = 16 - e.roll.from;
      for (let step = e.roll.from; step < 16; step++) insert(role, copy(t.from, bar, step, t.vel * (e.roll.base + (e.roll.rise * (step - e.roll.from + 1)) / n), by), 'roll', e.insert);
    }
    if (e.double) {
      const last = current(bar, role).sort((a, z) => (z.step ?? 0) - (a.step ?? 0))[0];
      if (last && (last.step ?? 0) < 15) insert(role, copy(last, bar, Math.min(15, (last.step ?? 0) + 1), e.double.level, by), 'double', e.insert);
    }
    return 'applied';
  };
  /** The figure on one bar of the sub-section: every lane in the figure's order, the `without` block where a lane had nothing. */
  const play = (row: Recipe, bar: number, k: number) => {
    const f = row.figure!;
    const letters = { ...DEFAULT_LETTERS, ...(f.letters ?? {}) };
    const lanes = f.lanes ?? {};
    for (const [role, e] of Object.entries(lanes)) {
      if (edit(bar, k, role, e, letters, row.id) === 'empty' && f.without?.[role]) for (const [r2, e2] of Object.entries(f.without[role].lanes)) edit(bar, k, r2, e2, letters, row.id);
    }
  };
  // The switch-ups first: the bar marks read the bar as a switch-up left it.
  for (const s of subs) {
    if (s.kind !== 'switch-up' && s.kind !== 'variation') continue;
    mark = changed();
    for (let b = s.startBar; b < s.startBar + s.bars; b++) play(s.row, b, b - s.startBar);
    // A variation whose row found nothing to change (a hat figure in a room with no closed hat)
    // takes its kind's next row on the same bars, so the span is heard where any row can be —
    // a row the overlap check admits over those bars, asked again of the one actually played (C04).
    for (const alt of s.alternates ?? []) {
      if (changed() !== mark) break;
      if (clashes(alt, s, subs)) continue;
      for (let b = s.startBar; b < s.startBar + s.bars; b++) play(alt, b, b - s.startBar);
      if (changed() !== mark) { s.row = alt; s.label = alt.name; s.figure = alt.id; }
    }
    note(s);
  }
  for (const s of subs) {
    if (s.kind === 'switch-up' || s.kind === 'variation') continue;
    mark = changed();
    const f = s.row.figure!;
    for (let b = s.startBar; b < s.startBar + s.bars; b++) play(s.row, b, b - s.startBar);
    if (f.stroke && crash) {
      // The crash on the one after: add-if-absent against the theme's crashes and the strokes already laid (a crash on the one never lands on itself).
      const b = s.startBar + s.bars;
      const on = (e: Ev) => e.voice === crash.voice && e.bar === b && (e.step ?? 0) === 0 && !drop.has(e);
      if (!(events.some(on) || add.some(on)))
        add.push({ t: at(b, 0), voice: crash.voice, p: { vel: f.stroke.level }, bar: b, step: 0, layer: crash.layer, by: s.row.id });
    }
    // The glue on the line, where the composer lays it (round M1).
    const glued = !!(f.glue && keep.glue && keep.glue(f.glue.slot, s.startBar + s.bars, f.glue.bars ?? 1, f.glue.level));
    note(s, glued);
  }
  if (!drop.size && !add.length && !cut.size) return subs.filter((s) => heard.has(s));
  // A held note cut short is the same note, shorter (C03 of the 10-03 review):
  // its length changes on the event itself, so every table keyed on it — the
  // upper part's notes, a phrase's articulation, its room — still finds it.
  for (const [e, dur] of cut) e.p = { ...e.p, dur };
  const kept = events.filter((e) => !drop.has(e));
  events.length = 0;
  events.push(...kept, ...add.filter((e) => !drop.has(e)));
  return subs.filter((s) => heard.has(s));
}

/**
 * **The layers a bar's sub-sections switch** (round M1, a figure's `layers`):
 * the roles switched in, the roles switched out, and whether the two harmonic
 * layers trade, over every sub-section the bar is in. The composer applies
 * them to the bar's gates before it lays the bar, so what a layer switched in
 * plays is the composer's own figure, on the chord.
 */
export function gatesAt(subs: readonly SubSection[], bar: number): { on: Set<string>; off: Set<string>; swap: boolean; by: SubSection[] } | null {
  let out: { on: Set<string>; off: Set<string>; swap: boolean; by: SubSection[] } | null = null;
  for (const s of subs) {
    const l = s.row.figure?.layers;
    if (!l || bar < s.startBar || bar >= s.startBar + s.bars) continue;
    out ??= { on: new Set(), off: new Set(), swap: false, by: [] };
    for (const r of l.on ?? []) out.on.add(r);
    for (const r of l.off ?? []) out.off.add(r);
    if (l.swap) out.swap = true;
    out.by.push(s);
  }
  return out;
}

/** The kinds the mechanism plays, for the checks and the audit. */
export { PLAYED_KINDS };
