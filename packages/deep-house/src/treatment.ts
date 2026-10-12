// **The three scoped row kinds, as a contract** (round T1, `notes/plans/PLAN-TREATMENTS.md`).
//
// A `treatment` row is a figure applied to bars; a `section` row is a kind of
// section — its floor, its layer pattern, what it admits; a `seam` row is a
// hand-over's character. The scopes have been in `src/recipe.ts` since the
// cookbook and were stored and never read; this file is what each one may say,
// held exactly. `src/subsections.ts` is the mechanism that plays the first and
// `src/sections.ts` (round T2) the one that plays the second.
//
// The one rule of every row holds here too: **no voice, no effect, no engine
// number**. A figure speaks in roles (`kick`, `backbeat`, `offbeat`,
// `sixteenth`), sixteenths, levels and bars; what a level is a copy of — the
// bar's own loudest hit, its quietest for a ghost — is the mechanism's, so a
// row written on the house's clap plays on a snare at the fast broken place
// without knowing either exists.

/**
 * The figure kinds the composer places, each a placement rule of its own (`src/subsections.ts`).
 * `variation` (round M1, his word on seed 1's hats): a span over the second
 * half of a sixteen-bar phrase inside a section — `halves`, where the reference
 * cuts vary more on every one of the four read — beside a switch-up rather than
 * instead of one, a part's own figure for a phrase (the hats, today).
 */
export const PLAYED_KINDS = Object.freeze(['switch-up', 'turnaround', 'fill', 'drop-out', 'variation'] as const);
/** ...and the kinds the plan names and nothing plays yet (PLAN-TREATMENTS §3): a row of one is stored, validated and refused a pin. */
export const NAMED_KINDS = Object.freeze(['lead-in', 'pickup', 'solo', 'swell-in', 'sweep'] as const);
export const FIGURE_KINDS: readonly string[] = Object.freeze([...PLAYED_KINDS, ...NAMED_KINDS]);
export type PlayedKind = (typeof PLAYED_KINDS)[number];

/** The roles a figure may edit: the four drum roles, in the order a bar is written. */
export const DRUM_ROLES: readonly string[] = Object.freeze(['kick', 'backbeat', 'offbeat', 'sixteenth']);
/**
 * ...and, since round M1 (the mains pass), the rest of a house bar: `open`, the
 * open hat alone (the `offbeat` role is both hats, as it always was); the
 * `bassline`; the `figure`, the struck harmonic layer (the stabs, the keys); and
 * the `drone`, the held one (the pad). A figure may clear any of them, mask the
 * open hat (a hit copied from the theme's own open hat, whichever bar it is in:
 * an unpitched hit has no chord to be wrong in), and switch the harmonic and
 * the low layers in or out for its bars (`layers`) — the pitched lanes are laid
 * by the composer, on the chord, and never copied from another bar.
 */
export const LAYER_ROLES: readonly string[] = Object.freeze(['open', 'bassline', 'figure', 'drone']);
export const FIGURE_ROLES: readonly string[] = Object.freeze([...DRUM_ROLES, ...LAYER_ROLES]);
/** The roles a mask may write: the drums and the open hat, every one of them unpitched. */
export const MASKED_ROLES: readonly string[] = Object.freeze([...DRUM_ROLES, 'open']);
/** The roles whose layer a figure may switch in or out for its bars (`figure.layers`). */
export const GATED_ROLES: readonly string[] = Object.freeze(['kick', 'backbeat', 'offbeat', 'open', 'sixteenth', 'bassline', 'figure', 'drone']);

/** Where a section may admit a figure kind: the placement rules of `src/subsections.ts`, by name. */
export const PLACEMENTS: readonly string[] = Object.freeze(['span', 'groups', 'last', 'lines', 'first', 'halves']);

/**
 * **Where the player places each kind it plays** (the review of 10-03,
 * R03): the placements `planSubSections` asks a section's `admits` for, kind
 * by kind. A section row that admits a played kind at any other placement is
 * refused — it would validate and never be heard — while a kind the plan only
 * names keeps whatever placement it was stored with, as data for the day it
 * is played.
 */
export const PLACED_AT: Readonly<Record<PlayedKind, readonly string[]>> = Object.freeze({
  'switch-up': Object.freeze(['span']),
  turnaround: Object.freeze(['groups']),
  fill: Object.freeze(['last']),
  'drop-out': Object.freeze(['lines', 'last']),
  variation: Object.freeze(['halves']),
});
const isPlayed = (kind: unknown): kind is PlayedKind => (PLAYED_KINDS as readonly unknown[]).includes(kind);

/** The glue slots a figure may name (the lanes of section glue). */
export const GLUE_SLOTS: readonly string[] = Object.freeze(['impact', 'swell', 'sweep', 'riser']);

/**
 * A letter of a mask: the level it writes, whether it copies the bar's quietest
 * hit (a ghost) rather than its loudest, and whether the level is absolute
 * rather than a share of the copied hit's velocity.
 */
export interface Letter { level: number; ghost?: boolean; absolute?: boolean }

/** The three letters every row has. A row may add its own under `figure.letters`. */
export const DEFAULT_LETTERS: Readonly<Record<string, Letter>> = Object.freeze({
  X: Object.freeze({ level: 1 }),
  x: Object.freeze({ level: 0.65 }),
  o: Object.freeze({ level: 0.3, ghost: true }),
});

/** What a figure does to one lane of a bar. */
export interface LaneEdit {
  /** the lane's own hits from this step go (0: the whole bar); absent, they stay */
  clear?: number;
  /** one sixteen-step string per bar, tiled over a span: a letter is a hit, `.` a rest */
  mask?: readonly string[];
  /** a hit on every step from `from` to the bar's end, the levels climbing by `rise` from `base`: hit k of n at base + rise·k/n */
  roll?: { from: number; base: number; rise: number };
  /** the lane's last hit of the bar copied a sixteenth later, at an absolute level */
  double?: { level: number };
  /**
   * how a hit this lane writes meets a hit of the role already on its step,
   * where the row means other than its operation's own policy
   * (`src/subsections.ts` `INSERTION`): `add-if-absent`, `replace`, or `stack`
   * — both sound, said on purpose
   */
  insert?: Insertion;
}

/** How a written hit meets one already on its step (`src/subsections.ts` `INSERTION`). */
export type Insertion = 'add-if-absent' | 'replace' | 'stack';
export const INSERTIONS: readonly Insertion[] = Object.freeze(['add-if-absent', 'replace', 'stack'] as const);

/** A figure: lane edits by role, the letters they use, and what else the bars carry. */
export interface Figure {
  /** the figure's own length in bars (a two-bar mask tiles over a span); 1 by default */
  bars?: number;
  lanes?: Readonly<Record<string, LaneEdit>>;
  letters?: Readonly<Record<string, Letter>>;
  /** the glue's stroke on the next bar's one, where the place lands one */
  stroke?: { level: number };
  /** a glue lane's voice at the line (the lead-in kinds; stored in T1, played at PLAN-TREATMENTS §3 step 5) */
  glue?: { slot: string; bars?: number; level: number };
  /** the figure where a role has nothing to copy: the same lanes block, played instead */
  without?: Readonly<Record<string, { lanes: Readonly<Record<string, LaneEdit>> }>>;
  /**
   * the layers the figure switches for its bars (round M1), by role: `on` in,
   * `off` out, `swap` the two harmonic layers traded — whichever of the figure
   * and the drone plays alone, the other plays instead; where both play, the
   * drone rests and the figure carries the chords; where neither, nothing
   * moves. The composer lays what a layer switched in plays, on the chord; a
   * held note of a layer switched out is cut at the span's first bar.
   */
  layers?: { on?: readonly string[]; off?: readonly string[]; swap?: readonly string[] };
}

/** Where a kind's rule may lay a row: a narrowing of the kind's own placement, never a widening. */
export interface TreatmentPlace {
  /** the section kinds it may sit in */
  sections?: readonly string[];
  /** for a last-bar placement, the kinds of the section that follows */
  into?: readonly string[];
  /**
   * for a lines placement, the line spacing in bars: a drop-out at the lines
   * `every`, `2·every`, … bars into its section, so a multiple of the
   * sixteen-bar line (a narrowing, never a widening); a kind the plan only
   * names keeps its own reading of it until it is played
   */
  every?: number;
  /**
   * for a switch-up, the kit it is written for (round M1): `broken` (absent:
   * every switch-up written before the mains pass, the figures of a broken
   * kit), `four` (the house's four-floor) or `any`
   */
  kit?: 'broken' | 'four' | 'any';
  /** for a switch-up, the span lengths in bars it may hold, a narrowing of the place's own (round M1) */
  bars?: readonly number[];
}

/** A `section` row's block: a kind of section, in the grammar's own words. */
export interface SectionBlock {
  /** the fewest bars the kind is laid at where the form is counted in time, on the four-bar grid */
  floor: number;
  /** the layer pattern, read in order: the first entry that holds for a phrase gives its lanes (`src/sections.ts`) */
  phrases: ReadonlyArray<{ at: 'first' | 'rest' | 'penult' | 'last'; on: readonly string[] }>;
  /** the figure kinds it takes and where — a placement, or a list of them */
  admits?: Readonly<Record<string, string | readonly string[]>>;
  flags?: { sweepFirst?: boolean; impactFirst?: boolean; riserLast?: number; lift?: boolean };
  /**
   * What a place's kit does in the section (liquid-space, 10-11): `gated`, it plays whatever the phrases switch on
   * and its own section rule (`Kit.sections`) stands aside — the row's promise is the drums' (a mixing intro that
   * opens on the kick and the hats has them in the final events). Absent, the kit's rule for the kind.
   */
  kit?: 'gated';
}

/** A `seam` row's block: the line between two kinds and what marks it. */
export interface SeamBlock {
  from: string;
  to: string;
  out?: { bars: number; treatments?: readonly string[] };
  in?: { bars: number; treatments?: readonly string[] };
}

const isCount = (n: unknown, lo = 0): n is number => Number.isSafeInteger(n) && (n as number) >= lo;
const isLevel = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1.5;

function letterProblems(letters: unknown, at: string): string[] {
  if (letters === undefined) return [];
  if (!letters || typeof letters !== 'object' || Array.isArray(letters)) return [`${at} is not an object of letters`];
  const bad: string[] = [];
  for (const [k, v] of Object.entries(letters as Record<string, unknown>)) {
    if (k.length !== 1 || k === '.') { bad.push(`${at}.${k} is not one letter`); continue; }
    const l = v as Partial<Letter> | null;
    if (!l || typeof l !== 'object' || !isLevel(l.level)) bad.push(`${at}.${k} needs a level in 0..1.5`);
    for (const f of Object.keys(l ?? {})) if (!['level', 'ghost', 'absolute'].includes(f)) bad.push(`${at}.${k}.${f} is not a letter's field`);
    // A flag is true or false, never a word for one: 'false' is truthy where the bar is played (R05).
    for (const f of ['ghost', 'absolute'] as const) if (l && typeof l === 'object' && l[f] !== undefined && typeof l[f] !== 'boolean') bad.push(`${at}.${k}.${f} is not true or false`);
  }
  return bad;
}

function lanesProblems(lanes: unknown, at: string, bars: number, letters: Readonly<Record<string, Letter>>): string[] {
  if (!lanes || typeof lanes !== 'object' || Array.isArray(lanes)) return [`${at} is not an object of lanes`];
  const bad: string[] = [];
  for (const [role, edit] of Object.entries(lanes as Record<string, unknown>)) {
    const here = `${at}.${role}`;
    if (!FIGURE_ROLES.includes(role)) { bad.push(`${here} is not a role a figure edits (${FIGURE_ROLES.join(', ')})`); continue; }
    const e = edit as LaneEdit | null;
    if (!e || typeof e !== 'object' || Array.isArray(e)) { bad.push(`${here} is not an edit`); continue; }
    for (const f of Object.keys(e)) if (!['clear', 'mask', 'roll', 'double', 'insert'].includes(f)) bad.push(`${here}.${f} is not an edit`);
    if (e.insert !== undefined) {
      if (!INSERTIONS.includes(e.insert)) bad.push(`${here}.insert is not ${INSERTIONS.join(', ')}`);
      if (e.mask === undefined && e.roll === undefined && e.double === undefined) bad.push(`${here}.insert says how a written hit meets one already there, and this lane writes none`);
    }
    if (e.clear !== undefined && !(isCount(e.clear) && e.clear <= 16)) bad.push(`${here}.clear is not a step in 0..16`);
    if ((e.mask !== undefined || e.roll !== undefined || e.double !== undefined) && !MASKED_ROLES.includes(role))
      bad.push(`${here} writes hits, which only an unpitched role may (${MASKED_ROLES.join(', ')}); a pitched layer is cleared or switched`);
    if (e.mask !== undefined) {
      if (!Array.isArray(e.mask) || !e.mask.length) bad.push(`${here}.mask is not a list of bars`);
      else {
        if (bars % e.mask.length) bad.push(`${here}.mask has ${e.mask.length} bars, which does not tile ${bars}`);
        e.mask.forEach((m, i) => {
          if (typeof m !== 'string' || m.length !== 16) { bad.push(`${here}.mask[${i}] is not sixteen steps`); return; }
          for (const c of m) if (c !== '.' && !letters[c]) bad.push(`${here}.mask[${i}] uses ${JSON.stringify(c)}, which is not a letter of this row`);
        });
      }
    }
    if (e.roll !== undefined) {
      const r = e.roll;
      if (!r || typeof r !== 'object' || !isCount(r.from) || r.from > 15 || !isLevel(r.base) || typeof r.rise !== 'number' || !Number.isFinite(r.rise))
        bad.push(`${here}.roll needs a step to start on, a base level and a rise`);
    }
    if (e.double !== undefined && (!e.double || typeof e.double !== 'object' || !isLevel(e.double.level))) bad.push(`${here}.double needs a level`);
    if (!Object.keys(e).length) bad.push(`${here} does nothing`);
  }
  return bad;
}

/** What is wrong with a treatment row's figure; nothing for a good one. */
export function figureProblems(figure: unknown): string[] {
  if (!figure || typeof figure !== 'object' || Array.isArray(figure)) return ['figure is not an object'];
  const f = figure as Figure;
  const bad: string[] = [];
  for (const k of Object.keys(f)) if (!['bars', 'lanes', 'letters', 'stroke', 'glue', 'without', 'layers'].includes(k)) bad.push(`figure.${k} is not part of a figure`);
  const bars = f.bars ?? 1;
  if (!isCount(bars, 1) || bars > 4) bad.push('figure.bars is not 1..4');
  bad.push(...letterProblems(f.letters, 'figure.letters'));
  const letters = { ...DEFAULT_LETTERS, ...(f.letters ?? {}) };
  if (f.lanes !== undefined) bad.push(...lanesProblems(f.lanes, 'figure.lanes', isCount(bars, 1) ? bars : 1, letters));
  if (f.stroke !== undefined && (!f.stroke || typeof f.stroke !== 'object' || !isLevel(f.stroke.level))) bad.push('figure.stroke needs a level');
  if (f.glue !== undefined) {
    const g = f.glue;
    if (!g || typeof g !== 'object' || !GLUE_SLOTS.includes(g.slot) || !isLevel(g.level) || (g.bars !== undefined && !isCount(g.bars, 1)))
      bad.push(`figure.glue needs a slot (${GLUE_SLOTS.join(', ')}), a level and, if any, bars`);
  }
  if (f.without !== undefined) {
    if (!f.without || typeof f.without !== 'object' || Array.isArray(f.without)) bad.push('figure.without is not an object by role');
    else for (const [role, alt] of Object.entries(f.without)) {
      if (!FIGURE_ROLES.includes(role)) { bad.push(`figure.without.${role} is not a role`); continue; }
      if (!alt || typeof alt !== 'object' || Object.keys(alt).some((k) => k !== 'lanes')) bad.push(`figure.without.${role} carries only lanes`);
      else bad.push(...lanesProblems(alt.lanes, `figure.without.${role}.lanes`, isCount(bars, 1) ? bars : 1, letters));
    }
  }
  if (f.layers !== undefined) {
    const l = f.layers;
    if (!l || typeof l !== 'object' || Array.isArray(l)) bad.push('figure.layers is not an object of on, off and swap');
    else {
      for (const [k, v] of Object.entries(l)) {
        if (!['on', 'off', 'swap'].includes(k)) { bad.push(`figure.layers.${k} is not on, off or swap`); continue; }
        if (!Array.isArray(v) || !v.length) { bad.push(`figure.layers.${k} is not a list of roles`); continue; }
        for (const r of v) if (!GATED_ROLES.includes(r)) bad.push(`figure.layers.${k} names ${JSON.stringify(r)}, which is not a role a figure switches (${GATED_ROLES.join(', ')})`);
      }
      if (l.swap && (l.swap.length !== 2 || !l.swap.includes('figure') || !l.swap.includes('drone'))) bad.push('figure.layers.swap trades the figure and the drone, and nothing else');
    }
  }
  if (!f.lanes && !f.stroke && !f.glue && !f.layers) bad.push('a figure edits a lane, lands a stroke, plays the glue or switches a layer');
  return bad;
}

/** What is wrong with a treatment row's place; nothing for a good one. `sections` is the style's kinds, `applies` the row's kind. */
export function placeProblems(place: unknown, sections: readonly string[], applies?: string | null): string[] {
  if (place === undefined) return [];
  if (!place || typeof place !== 'object' || Array.isArray(place)) return ['place is not an object'];
  const p = place as TreatmentPlace;
  const bad: string[] = [];
  for (const k of Object.keys(p)) if (!['sections', 'into', 'every', 'kit', 'bars'].includes(k)) bad.push(`place.${k} is not part of a place`);
  if (p.kit !== undefined && !['broken', 'four', 'any'].includes(p.kit)) bad.push('place.kit is not broken, four or any');
  if (p.bars !== undefined && (!Array.isArray(p.bars) || !p.bars.length || p.bars.some((n) => !(isCount(n, 1) && n % 4 === 0))))
    bad.push('place.bars is not a list of span lengths on the four-bar grid');
  for (const k of ['sections', 'into'] as const) {
    const v = p[k];
    if (v === undefined) continue;
    if (!Array.isArray(v) || !v.length) { bad.push(`place.${k} is not a list of section kinds`); continue; }
    for (const s of v) if (!sections.includes(s)) bad.push(`place.${k} names ${JSON.stringify(s)}, which is not a kind of section this style has`);
  }
  if (p.every !== undefined) {
    if (!isCount(p.every, 1)) bad.push('place.every is not a count of bars');
    // A played kind reads it, so it means what the player does with it (R03).
    else if (isPlayed(applies)) {
      if (!PLACED_AT[applies].includes('lines')) bad.push(`place.every spaces the lines placement, which a ${applies} does not have`);
      else if (p.every % 16) bad.push('place.every is a count of bars on the sixteen-bar line grid (16, 32, …)');
    }
  }
  return bad;
}

/** What is wrong with a section row's block; nothing for a good one. `gates` is the grammar's layer keys. */
export function sectionProblems(section: unknown, gates: readonly string[]): string[] {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return ['section is not an object'];
  const s = section as SectionBlock;
  const bad: string[] = [];
  for (const k of Object.keys(s)) if (!['floor', 'phrases', 'admits', 'flags', 'kit'].includes(k)) bad.push(`section.${k} is not part of a section`);
  if (s.kit !== undefined && s.kit !== 'gated') bad.push('section.kit is gated or absent');
  if (!isCount(s.floor, 4) || s.floor % 4) bad.push('section.floor is not a count of bars on the four-bar grid');
  if (!Array.isArray(s.phrases) || !s.phrases.length) bad.push('section.phrases is not a list');
  else {
    s.phrases.forEach((p, i) => {
      if (!p || typeof p !== 'object' || !['first', 'rest', 'penult', 'last'].includes(p.at)) bad.push(`section.phrases[${i}].at is not first, rest, penult or last`);
      if (!Array.isArray(p?.on)) bad.push(`section.phrases[${i}].on is not a list of layers`);
      else for (const g of p.on) if (!gates.includes(g)) bad.push(`section.phrases[${i}].on names ${JSON.stringify(g)}, which is not a layer this style gates`);
    });
    // Every phrase of every section is answered: the first, the last, and the rest.
    for (const at of ['first', 'rest', 'last']) if (!s.phrases.some((p) => p?.at === at)) bad.push(`section.phrases says nothing of the ${at} phrase`);
  }
  if (s.admits !== undefined) {
    if (!s.admits || typeof s.admits !== 'object' || Array.isArray(s.admits)) bad.push('section.admits is not an object by kind');
    else for (const [k, v] of Object.entries(s.admits)) {
      if (!FIGURE_KINDS.includes(k)) bad.push(`section.admits.${k} is not a figure kind`);
      const list = Array.isArray(v) ? v : [v];
      if (!list.length || list.some((w) => !PLACEMENTS.includes(w))) bad.push(`section.admits.${k} is ${JSON.stringify(v)}, not ${PLACEMENTS.join(', ')} or a list of them`);
      // A played kind is admitted only where the player places it (R03).
      else if (isPlayed(k)) for (const w of list) if (!PLACED_AT[k].includes(w))
        bad.push(`section.admits.${k} asks ${JSON.stringify(w)}, where nothing places a ${k} (${PLACED_AT[k].join(', ')})`);
    }
  }
  if (s.flags !== undefined) {
    const f = s.flags;
    if (!f || typeof f !== 'object') bad.push('section.flags is not an object');
    else for (const [k, v] of Object.entries(f)) {
      if (k === 'riserLast') { if (!isCount(v)) bad.push('section.flags.riserLast is not a count of bars'); }
      else if (!['sweepFirst', 'impactFirst', 'lift'].includes(k) || typeof v !== 'boolean') bad.push(`section.flags.${k} is not a flag`);
    }
  }
  return bad;
}

/** What is wrong with a seam row's block; nothing for a good one. */
export function seamProblems(seam: unknown, sections: readonly string[]): string[] {
  if (!seam || typeof seam !== 'object' || Array.isArray(seam)) return ['seam is not an object'];
  const s = seam as SeamBlock;
  const bad: string[] = [];
  for (const k of Object.keys(s)) if (!['from', 'to', 'out', 'in'].includes(k)) bad.push(`seam.${k} is not part of a seam`);
  for (const k of ['from', 'to'] as const) if (!sections.includes(s[k])) bad.push(`seam.${k} is ${JSON.stringify(s[k])}, which is not a kind of section this style has`);
  for (const k of ['out', 'in'] as const) {
    const side = s[k];
    if (side === undefined) continue;
    if (!side || typeof side !== 'object' || !isCount(side.bars, 1)) { bad.push(`seam.${k} needs bars`); continue; }
    for (const f of Object.keys(side)) if (!['bars', 'treatments'].includes(f)) bad.push(`seam.${k}.${f} is not part of a seam's side`);
    if (side.treatments !== undefined) {
      if (!Array.isArray(side.treatments)) bad.push(`seam.${k}.treatments is not a list`);
      else for (const t of side.treatments) if (!FIGURE_KINDS.includes(t)) bad.push(`seam.${k}.treatments names ${JSON.stringify(t)}, which is not a figure kind`);
    }
  }
  return bad;
}
