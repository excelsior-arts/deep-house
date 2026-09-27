import { placementProblems, type RecipePlacement } from './recipe-placement.ts';
import { motifWants, bassFigureProblems, struckFigureProblems } from './parts/validation.ts';
export { bassFigureProblems, struckFigureProblems } from './parts/validation.ts';
// A recipe, in code: the row `notes/plans/PLAN-RECIPES.md` specifies, the rules
// that keep it readable in five years, and the arithmetic that turns one into a
// spell.
//
// A recipe describes musical material at a scope: a motif, role, section or
// complete theme. A track can request a box of bird readings; a local part
// can describe its phrase without moving the birds. An imprint measures the
// same eight axes. Playback admission is narrower than storage: see
// recipe-request.ts and notes/recipes/CONVENTIONS.md.
//
// The one rule that makes a recipe survive the engine growing under it:
//
//   **a recipe names no voice, no effect and no engine number.** Roles,
//   families, properties and birds only. A new instrument that declares its
//   properties satisfies an old recipe; a renamed voice cannot break one,
//   because no recipe ever knew the name.
//
// `validate` below is that rule as a gate rather than as a paragraph, and it is
// run over every row the loader reads and over the house row in `npm run check`.
// What it does *not* police is the prose half — the name, the provenance, a
// listener's own words, a verdict — because "I like the drum, strings and hi
// hat match" is a quotation and not an instruction. The line is drawn at what
// the interpreter reads.

import type { Style } from '@deep-house/engine/style';
import { BIRDS, HOUSE, HOUSE_BOX, asSpell } from './spell.ts';
import type { Bird, Spell } from './spell.ts';
import { boxInDice } from './calibration.ts';
import type { Calibration } from './calibration.ts';
import { HOUSE_FAMILIES, REGISTERS } from './motif.ts';
import type { MotifFamily } from './motif.ts';
import { rhythmProblems } from './parts/rhythm.ts';
import { ambienceProblems, presenceProblems } from './parts/figure.ts';
import { textureProblems, toneProblems } from './parts/texture.ts';

/**
 * Which part of a track a row speaks for. PLAN-RECIPES' hierarchy.
 *
 * **`motif` joined on 09-20** (PLAN-MOTIF T1). It was in the plan's table of
 * scopes from 09-19 and not in this file, on purpose: nothing interpreted one,
 * and a scope the validator accepts and nobody reads is a promise. The mining
 * catalog has been carrying two boxed `motif` candidates marked *not
 * adoptable, by name*, with the reason on each — *the library has no `motif`
 * scope yet* — since the run of 09-20, and the bass contour is the
 * best-separating feature it has measured. This is the answer to that.
 */
export type Scope = 'track' | 'section' | 'layer' | 'seam' | 'treatment' | 'motif';
export const SCOPES: readonly Scope[] = Object.freeze(['track', 'section', 'layer', 'seam', 'treatment', 'motif'] as const);

/** Where a row came from. */
export type Origin = 'golden' | 'mined' | 'listener';
export const ORIGINS: readonly Origin[] = Object.freeze(['golden', 'mined', 'listener'] as const);

/** A bird's range: `[lo, hi]`, both inside 0..1, `lo <= hi`. */
export type Range = [number, number];

/**
 * **What the row is worth, and it is the one thing on a row nobody derives.**
 *
 * Eugene's own words, 2026-09-18: *"I'd introduce some sort of score to recipes,
 * as I am the chef; and if people hit a recipe in the wild and like it they can
 * increase the score by liking it."* So a row carries two numbers and they come
 * from two different places and never from a measurement:
 *
 *   `chef`  — his own hand on the bench's scale, -3..+3, 0 by default;
 *   `likes` — how many listeners kept it, a count, 0 by default.
 *
 * Both survive every re-encoding, the way `verdicts` does, because a tool that
 * recomputed them would be a tool that overwrote the only opinion in the file.
 */
export interface Score {
  /** the chef's own, on the bench's scale: -3..+3 */
  chef: number;
  /** how many listeners liked the row in the wild */
  likes: number;
}

/** The chef's scale, which is the bench's own. */
export const CHEF_MIN = -3;
export const CHEF_MAX = 3;

/**
 * How often the randomiser reaches for a row, once the chef and the listeners
 * have had their say:
 *
 *     weightOf(row) = row.weight x 2^(chef / 2) x (1 + log10(1 + likes))
 *
 * `row.weight` is the share it already carries — what the extraction measured
 * of the record, or what a library decided — and the two factors are the two
 * opinions, each with a shape the other cannot have.
 *
 * **The chef's factor is a doubling every two points**, so his scale spans
 * 0.354 at -3 to 2.83 at +3: a factor of eight across his own hand, which is a
 * big lever and a bounded one. **The likes factor is a log base ten**, and that
 * base is the whole design: it takes **sixty-seven likes to be worth what one
 * +3 from the chef is worth**, and a thousand is still only half as much again.
 * So
 * the chef decides the library while it is young — which it is, with eight
 * labels on it — and a row loved by a few hundred people in the wild still
 * moves without ever running away with the draw.
 *
 * And at `chef: 0, likes: 0` it is **exactly `row.weight`**, to the bit:
 * `2 ** 0` is 1 and `log10(1)` is 0, both exact doubles. A library nobody has
 * scored yet draws exactly as it drew before this existed, which is the same
 * arithmetic identity phase 0 and phase 1 are built on.
 */
export function weightOf(recipe: Recipe): number {
  const share = Number.isFinite(recipe.weight as number) ? Math.max(0, recipe.weight as number) : 1;
  const s = recipe.score;
  const chef = Math.min(CHEF_MAX, Math.max(CHEF_MIN, Number.isFinite(s?.chef as number) ? (s as Score).chef : 0));
  const likes = Math.max(0, Number.isFinite(s?.likes as number) ? Math.floor((s as Score).likes) : 0);
  return share * (2 ** (chef / 2)) * (1 + Math.log10(1 + likes));
}

/** What a listener said about a variant of a row, in their own words. */
export interface Verdict {
  seed: string | number;
  theme: number;
  bar?: number;
  wav?: string;
  verdict: string;
  note?: string;
  at?: string;
  by?: string;
}

/**
 * One row of the library. `schema` is bumped only when a field's meaning
 * changes; unknown fields are **kept and not dropped**, so a newer app's row
 * survives an older one's round trip, and everything past `weight` is
 * documentation the interpreter never reads.
 */
export interface Recipe {
  /** Musical definition revision; schema versions the document language. */
  revision?: number;
  /** Explicit admission requirements for a reusable shipped part. */
  placement?: RecipePlacement;
  schema: number;
  kind?: 'recipe';
  id: string;
  scope: Scope;
  /** the section kind, role or family the scope needs; `null` at track scope */
  applies: string | null;
  name: string;
  origin: Origin;
  /** the box: a range per bird, and a bird it does not name is the house's */
  birds: Partial<Record<Bird, Range>>;
  wants?: Record<string, any>;
  forbids?: string[];
  weight?: number;
  /** which interpretation the row was captured under; a newer one is allowed */
  interpreter?: string;
  /** the chef's own hand and the listeners' likes; never derived */
  score?: Score;
  /** whether the chef keeps it, for a row that is still a candidate */
  picked?: boolean;
  provenance?: Record<string, any>;
  reading?: Record<string, any>;
  alternates?: Record<string, any>;
  verdicts?: Verdict[];
  [extra: string]: any;
}

// --- the box -----------------------------------------------------------------

/**
 * The row's box, all eight axes, clamped into 0..1. **A bird the row does not
 * name is the house's own box** — the randomiser's, which is what PLAN-RECIPES
 * means by "anything no recipe touches is the randomiser's" — so a row that
 * speaks about two birds says nothing about the other six rather than pinning
 * them.
 */
export function boxOf(recipe: Recipe): Record<Bird, Range> {
  const out = {} as Record<Bird, Range>;
  for (const b of BIRDS) {
    const r = recipe.birds ? recipe.birds[b] : undefined;
    const lo = Array.isArray(r) ? r[0] : HOUSE[b] - HOUSE_BOX[b];
    const hi = Array.isArray(r) ? r[1] : HOUSE[b] + HOUSE_BOX[b];
    out[b] = [Math.min(1, Math.max(0, lo)), Math.min(1, Math.max(0, hi))];
  }
  return out;
}

/**
 * **The row's box as dice**, which is the box the randomiser actually rolls
 * inside once a strategy has a calibration map.
 *
 * A row's `birds` is a box of **readings** — it always was, on every row this
 * project has ever written. The house row is the median and the interquartile
 * range of the fourteen golden themes *as measured*; the two room rows are the
 * two clusters `notes/analysis/imprint-calibration.md` found in the same
 * readings; a mined row is a box cut out of somebody's record. Nothing has ever
 * cut a box out of dice, because a die is not a thing anybody can measure.
 *
 * What was wrong was the reading, not the numbers: those readings were handed
 * to `rng.float` as if they were positions. `notes/rounds/analysts-tooling.md`
 * §7 is the reproduction — Loom asked for 0.381 and read 0.758 — and
 * `src/calibration.ts` is the map that closes it.
 *
 * **With no map this is the identity**, the same object back, so a strategy
 * that carries none rolls exactly the box it always rolled and `house-v1` is
 * untouched in every byte.
 */
export function diceBoxOf(recipe: Recipe, calibration: Calibration | null = null): Record<Bird, Range> {
  return boxInDice(calibration, boxOf(recipe)) as Record<Bird, Range>;
}

/**
 * A spell rolled inside the row's box: one draw per bird, in the order the
 * eight are always written, off whichever stream the caller hands in.
 *
 * It is the caller's `Rng` and never a die of the theme's, so this adds no draw
 * to any stream that exists — rule R3 of PLAN-SCALE §3, kept by not needing it.
 *
 * The box is mapped into dice **before** the roll and never after it: eight
 * draws off the stream either way, the same eight doubles in the same order, so
 * a map arriving changes where a set lands and never how many numbers it took
 * to get there.
 */
export function spellFrom(
  recipe: Recipe,
  rng: { float: (a: number, b: number) => number },
  calibration: Calibration | null = null,
): Spell {
  const box = diceBoxOf(recipe, calibration);
  const out = {} as Spell;
  for (const b of BIRDS) out[b] = rng.float(box[b][0], box[b][1]);
  return asSpell(out);
}

/**
 * How far a **reading** sits outside a row's box, per bird; 0 where it is
 * inside. The box is readings and so is what is held against it: this is the
 * question *did the audio come out where the row asked*, which is answered
 * after the render and never before it. Handing it a rolled spell asks whether
 * a die is inside a box of readings, which is the question this round exists
 * to stop anybody asking.
 */
export function outsideBox(recipe: Recipe, spell: Spell): Partial<Record<Bird, number>> {
  const box = boxOf(recipe);
  const s = asSpell(spell);
  const out: Partial<Record<Bird, number>> = {};
  for (const b of BIRDS) {
    if (s[b] < box[b][0]) out[b] = s[b] - box[b][0];
    else if (s[b] > box[b][1]) out[b] = s[b] - box[b][1];
  }
  return out;
}

// --- the house row -----------------------------------------------------------

/**
 * Recipe number one: the house itself, as a row. The centre is the measured
 * house vector and the box is the measured spread of the golden round it, so
 * `spellFrom(HOUSE_RECIPE, rng)` is a roll inside the catalogue rather than a
 * roll at its centre — which is exactly what PLAN-MAGIC-V2 means by the centre
 * die rolling inside the box.
 *
 * It is built here and written to `recipes/house.json` beside the package;
 * `npm run check` proves the committed file is this row, so the file on disk
 * and the numbers in `src/spell.ts` cannot drift apart.
 */
export function houseRecipe(): Recipe {
  const birds = {} as Record<Bird, Range>;
  for (const b of BIRDS) {
    birds[b] = [
      Math.round((HOUSE[b] - HOUSE_BOX[b]) * 1000) / 1000,
      Math.round((HOUSE[b] + HOUSE_BOX[b]) * 1000) / 1000,
    ];
  }
  return {
    schema: 1,
    kind: 'recipe',
    id: 'house/deep-house',
    interpreter: 'v1',
    scope: 'track',
    applies: null,
    name: 'the house',
    origin: 'golden',
    birds,
    wants: {},
    forbids: [],
    weight: 1,
    provenance: {
      from: 'the fourteen golden themes of master seeds 1, 92970 and 21323',
      centre: 'the median of the fourteen, measured',
      box: 'half the interquartile range of the fourteen, per bird',
      anchors: 'anchors.json@1e899ba4',
      calibration: 'notes/analysis/imprint-calibration.md',
      note:
        'The catalogue is two clusters split by the room — Tide, Zephyr, Veil and Spark ' +
        'separate sub from growl with no overlap — so this box is the union of two tighter ' +
        'ones and a roll in the middle of it is a roll between two rooms.',
    },
  };
}

/** The house row as a value, built once. */
export const HOUSE_RECIPE: Recipe = Object.freeze(houseRecipe());

// --- the gate ----------------------------------------------------------------

/**
 * What a row may say, by field. Anything under one of these paths is checked
 * against that vocabulary and nothing else; anything else under `wants` is
 * checked against the names it may **not** use.
 */
const ROLE_FIELDS = new Set(['roles', 'front', 'lead', 'back', 'forbids']);
const FAMILY_FIELDS = new Set(['families']);
/** The keyed blocks whose *keys* are roles: a rate per role, a length per role. */
const ROLE_KEYED = new Set(['rates', 'noteLength', 'level', 'rhythm', 'ambience', 'presence', 'tone']);
/** A number the engine owns, by the unit in its name. */
const ENGINE_UNIT = /(Db|Hz|Cents|Ms|Sec|Seconds|Samples|Gain|Cutoff|Q)$/;

/**
 * The three harmonic slots a theme fills, and the candidate list each draws.
 *
 * `wants.timbres` is keyed by these and never by a timbre: "the slot that leads
 * wants something struck and bright" is a property, "the slot that leads wants
 * the electric piano" is a name, and only the first survives the engine growing.
 * The slots are held to the style: one is a slot here only if the style exposes
 * the list that fills it, so a style with no pad has no `wants.timbres.pad`.
 */
export const SLOT_LISTS: Readonly<Record<string, string>> = Object.freeze({ lead: 'leadTimbres', pad: 'padPartners', stab: 'stabPartners' });

/**
 * The shapes a reading adds beside a declared property: the class it was put
 * in and the window round it. They are how a want says "bright" and "at least
 * this held" without naming the instrument that is.
 */
const PROPERTY_SHAPE = /^([a-z]+)(?:Required|Class|Min|Max)$/;
/**
 * A declared property, or one of the four shapes round a declared property —
 * named with or without the unit its declaration carries, because a reading's
 * class is `brightnessClass` and the property it classes is `brightnessHz`.
 */
const isProperty = (k: string, props: readonly string[]): boolean => {
  if (props.includes(k)) return true;
  const m = PROPERTY_SHAPE.exec(k);
  return !!m && props.some((p) => p === m[1] || p.replace(ENGINE_UNIT, '') === m[1]);
};

/** The vocabularies a row is held to, read off the machine and the style. */
export interface Vocabulary {
  roles: readonly string[];
  families: readonly string[];
  /** every registered voice's name, and every timbre it declares */
  voices: readonly string[];
  timbres: readonly string[];
  /** the properties a timbre declares about itself — the only way to ask for one */
  timbreProperties: readonly string[];
  /** the harmonic slots this style fills, which `wants.timbres` is keyed by */
  slots: readonly string[];
  /** the style's own words a row may not use as an instruction */
  rooms: readonly string[];
  fxPalettes: readonly string[];
  /** the section kinds and labels a `section` scope may apply to */
  sections: readonly string[];
  /** the stage's gestures, which a `treatment` scope may name */
  treatments: readonly string[];
}

/**
 * The vocabulary this build speaks, gathered from the registry and the style
 * rather than written down twice. `registry` is `@deep-house/engine/voices` —
 * handed in rather than imported, so this module stays a contract and the gate
 * that runs it decides what the machine is.
 */
export function vocabularyOf(style: Style, registry: any): Vocabulary {
  const timbres = Object.keys(registry.TIMBRES || {});
  const props = new Set<string>();
  for (const t of Object.values(registry.TIMBRES || {})) {
    for (const k of Object.keys(t as object)) props.add(k);
  }
  const kinds = style.sections?.kinds || {};
  const exposed = new Set((style.candidates || []).map((c: any) => c.id));
  return {
    roles: registry.ROLES || [],
    slots: Object.keys(SLOT_LISTS).filter((slot) => exposed.has(SLOT_LISTS[slot])),
    families: registry.FAMILIES || [],
    voices: Object.keys(registry.BY_NAME || {}),
    timbres,
    timbreProperties: [...props],
    rooms: Object.keys(style.rooms || {}),
    fxPalettes: (style.catalogue?.fxPalettes || []).map((p: any) => p.name),
    sections: [
      ...Object.keys(kinds),
      ...Object.values(kinds).map((k: any) => k.label),
      ...Object.keys(style.sections?.labelToKind || {}),
    ],
    treatments: style.stage?.treatments || [],
  };
}

/**
 * Check a row. Returns the problems, in the order they were found; an empty
 * list is a valid row. It never throws on a malformed row — a library of a
 * thousand rows wants every fault named at once, not the first one.
 */
export function validate(recipe: any, vocab: Vocabulary): string[] {
  const bad: string[] = [];
  const say = (m: string) => bad.push(m);
  if (!recipe || typeof recipe !== 'object') return ['not an object'];

  // --- the shape ---
  if (recipe.schema !== 1) say(`schema is ${JSON.stringify(recipe.schema)}, not 1`);
  if (typeof recipe.id !== 'string' || !recipe.id.trim()) say('id is missing');
  if (typeof recipe.name !== 'string' || !recipe.name.trim()) say('name is missing');
  if (!SCOPES.includes(recipe.scope)) say(`scope ${JSON.stringify(recipe.scope)} is not one of ${SCOPES.join(', ')}`);
  if (!ORIGINS.includes(recipe.origin)) say(`origin ${JSON.stringify(recipe.origin)} is not one of ${ORIGINS.join(', ')}`);
  if (recipe.weight !== undefined && !(Number.isFinite(recipe.weight) && recipe.weight >= 0)) {
    say(`weight ${JSON.stringify(recipe.weight)} is not a number at or above nought`);
  }
  if (recipe.interpreter !== undefined && typeof recipe.interpreter !== 'string') say('interpreter is not a word');

  if (recipe.revision !== undefined && (!Number.isSafeInteger(recipe.revision) || recipe.revision < 1)) say('revision must be a positive integer');
  if (recipe.placement !== undefined) {
    bad.push(...placementProblems(recipe.placement));
    if (Array.isArray(recipe.placement?.roles)) for (const role of recipe.placement.roles)
      if (!vocab.roles.includes(role)) say(`placement names unknown role ${role}`);
  }

  // --- the chef's score and the listeners' likes ---
  // Held to their own shapes and to nothing else: a score is an opinion, so the
  // gate asks only that it is the kind of number it says it is.
  if (recipe.score !== undefined) {
    if (typeof recipe.score !== 'object' || recipe.score === null || Array.isArray(recipe.score)) say('score is not an object');
    else {
      const { chef, likes } = recipe.score;
      if (!Number.isFinite(chef) || chef < CHEF_MIN || chef > CHEF_MAX) say(`score.chef is ${JSON.stringify(chef)}, not a number in ${CHEF_MIN}..${CHEF_MAX}`);
      if (!Number.isInteger(likes) || likes < 0) say(`score.likes is ${JSON.stringify(likes)}, not a count`);
    }
  }
  if (recipe.picked !== undefined && typeof recipe.picked !== 'boolean') say('picked is not true or false');

  // --- what it applies to ---
  if (recipe.scope === 'track') {
    if (recipe.applies != null) say('a track recipe applies to the whole theme and names nothing');
  } else if (recipe.applies == null) {
    if (recipe.scope === 'section' || recipe.scope === 'layer') say(`a ${recipe.scope} recipe has to say what it applies to`);
  } else if (typeof recipe.applies !== 'string') {
    say('applies is not a word');
  } else if (recipe.scope === 'section' && !vocab.sections.includes(recipe.applies)) {
    say(`applies ${JSON.stringify(recipe.applies)} is not a kind of section this style has`);
  } else if (recipe.scope === 'layer' && !vocab.roles.includes(recipe.applies) && !vocab.families.includes(recipe.applies)) {
    say(`applies ${JSON.stringify(recipe.applies)} is neither a role nor a family`);
  } else if (recipe.scope === 'treatment' && !vocab.treatments.includes(recipe.applies)) {
    say(`applies ${JSON.stringify(recipe.applies)} is not a treatment this style has`);
  } else if (recipe.scope === 'motif' && !REGISTERS.includes(recipe.applies)) {
    say(`applies ${JSON.stringify(recipe.applies)} is not a register (${REGISTERS.join(', ')})`);
  }
  if (recipe.scope === 'motif' && recipe.applies == null) say('a motif recipe has to say which register states it');

  // --- the box ---
  if (!recipe.birds || typeof recipe.birds !== 'object' || Array.isArray(recipe.birds)) say('birds is not an object of ranges');
  else {
    for (const [k, v] of Object.entries(recipe.birds)) {
      if (!BIRDS.includes(k as Bird)) { say(`birds names ${JSON.stringify(k)}, which is not one of the eight`); continue; }
      if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isFinite(n))) { say(`birds.${k} is not a pair of numbers`); continue; }
      const [lo, hi] = v as Range;
      if (lo < 0 || hi > 1) say(`birds.${k} reaches outside 0..1`);
      if (lo > hi) say(`birds.${k} runs backwards`);
    }
  }

  // --- the rule: no voice, no effect, no engine number ---
  // Built widest first, so a word that is two things is named as the nearest
  // one to the machine: `sub` is a room and a voice, and it is the voice that
  // makes a row unreadable in five years.
  const forbidden = new Map<string, string>();
  for (const n of vocab.fxPalettes) forbidden.set(n.toLowerCase(), 'an effect palette');
  for (const n of vocab.rooms) forbidden.set(n.toLowerCase(), 'a room');
  for (const n of vocab.timbres) forbidden.set(n.toLowerCase(), 'a timbre');
  for (const n of vocab.voices) forbidden.set(n.toLowerCase(), 'a voice');

  // `zone` says which vocabulary the keys at this depth belong to: none, the
  // slots `wants.timbres` is keyed by, or the properties inside one slot.
  const walk = (node: any, path: string, key: string, zone: '' | 'timbres' | 'slot') => {
    if (node == null) {
      if (ROLE_FIELDS.has(key) || FAMILY_FIELDS.has(key) || key === 'treatments') say(`${path} is ${node}, which is not a word`);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, key, zone));
      return;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        const here = `${path}.${k}`;
        // A key that is a role is a role, whatever else the word is: `rates.kick`
        // is the kick *role*'s rate and not the kick voice, and `timbres.pad` is
        // the slot that holds the chord and not the voice called pad.
        if (ROLE_KEYED.has(key)) {
          if (!vocab.roles.includes(k) && !vocab.families.includes(k)) say(`${here} is keyed by ${JSON.stringify(k)}, which is neither a role nor a family`);
        } else if (zone === 'timbres') {
          if (!vocab.slots.includes(k)) say(`${here} is keyed by ${JSON.stringify(k)}, which is not a harmonic slot this style fills`);
        } else if (zone === 'slot') {
          if (!isProperty(k, vocab.timbreProperties)) say(`${here} asks for ${JSON.stringify(k)}, which is not a property a timbre declares`);
        } else {
          if (forbidden.has(k.toLowerCase())) say(`${here} is named after ${forbidden.get(k.toLowerCase())}`);
          if (ENGINE_UNIT.test(k)) say(`${here} names an engine number (${k})`);
        }
        walk(v, here, k, k === 'timbres' ? 'timbres' : zone === 'timbres' ? 'slot' : zone === 'slot' ? 'slot' : '');
      }
      return;
    }
    // A number that is not a number is an instruction nobody can read: an
    // infinity or a NaN cannot come out of a JSON file, but it can come out of
    // a tool's arithmetic on the way to one (the outside review, 09-19).
    if (typeof node !== 'string') {
      // A role, a family, a treatment or an exclusion is a word; a number, a
      // boolean or a null there used to pass, because only a string leaf was
      // read at all.
      if (ROLE_FIELDS.has(key) || FAMILY_FIELDS.has(key) || key === 'treatments')
        say(`${path} is ${JSON.stringify(node)}, which is not a word`);
      else if (typeof node === 'number' && !Number.isFinite(node))
        say(`${path} is ${node}, which is not a finite number`);
      return;
    }
    // A value in a role or family field is checked against that vocabulary and
    // against nothing else, which is how `kick` is a role here and a voice there.
    if (ROLE_FIELDS.has(key)) {
      if (vocab.roles.includes(node) || vocab.families.includes(node)) return;
      say(
        forbidden.has(node.toLowerCase())
          ? `${path} names ${forbidden.get(node.toLowerCase())} (${JSON.stringify(node)}) where a role or a family belongs`
          : `${path} is ${JSON.stringify(node)}, which is neither a role nor a family`
      );
      return;
    }
    if (FAMILY_FIELDS.has(key)) {
      if (!vocab.families.includes(node)) say(`${path} is ${JSON.stringify(node)}, which is not a family`);
      return;
    }
    if (key === 'treatments') {
      if (!vocab.treatments.includes(node)) say(`${path} is ${JSON.stringify(node)}, which is not a treatment this style has`);
      return;
    }
    if (forbidden.has(node.toLowerCase())) say(`${path} names ${forbidden.get(node.toLowerCase())} (${JSON.stringify(node)})`);
  };

  if (recipe.wants !== undefined) {
    if (recipe.wants === null || typeof recipe.wants !== 'object' || Array.isArray(recipe.wants)) say('wants is not an object');
    else {
      walk(recipe.wants, 'wants', 'wants', '');
      if (recipe.wants.figures?.bassline !== undefined) bassFigureProblems(recipe.wants.figures.bassline).forEach(say);
      if (recipe.wants.figures?.figure !== undefined) struckFigureProblems(recipe.wants.figures.figure).forEach(say);
      if (recipe.wants.figures?.texture !== undefined) textureProblems(recipe.wants.figures.texture).forEach(say);
      if (recipe.wants.tone !== undefined) toneProblems(recipe.wants.tone).forEach(say);
      if (recipe.wants.ambience !== undefined) ambienceProblems(recipe.wants.ambience).forEach(say);
      if (recipe.wants.presence !== undefined) presenceProblems(recipe.wants.presence).forEach(say);
      if (recipe.wants.rhythm !== undefined) rhythmProblems(recipe.wants.rhythm).forEach(say);
      if (recipe.wants.harmony !== undefined) {
        const h = recipe.wants.harmony;
        if (!h || typeof h !== 'object' || Array.isArray(h) || h.movement !== 'pedal' || Object.keys(h).length !== 1) say('wants.harmony must be { movement: "pedal" }');
      }
      // **A melody family's box is a known field and is held exactly.** The
      // outside review's §5 asked for this of every known field — *"make known
      // fields exact and unknown extension fields preserved but inert"* — and
      // this is the first block written after it, so it is the first one that
      // is. Everything in it is a share, a count of beats or a relative
      // interval, and not one of them is a note.
      if (recipe.wants.motif !== undefined) motifWants(recipe.wants.motif, say);
      else if (recipe.scope === 'motif') say('a motif recipe with no wants.motif is a family with no box');
    }
  }
  if (recipe.forbids !== undefined) {
    if (!Array.isArray(recipe.forbids)) say('forbids is not a list');
    else walk(recipe.forbids, 'forbids', 'forbids', '');
  }
  return bad;
}

// --- a melody family as a row ------------------------------------------------

/**
 * One of the authored house families as a library row: scope `motif`, applying
 * to the register that states it, with the box under `wants.motif` and no bird
 * named at all — **a melody family is not a place in bird space**, and a bird a
 * row does not name is the randomiser's, which is what `boxOf` already says.
 *
 * It is built here and written to `recipes/motif-*.json` the way the house row
 * is, and `npm run check` proves the committed files are these rows, so the
 * table in `src/motif.ts` and the files on disk cannot drift apart.
 */
export function motifRecipe(family: MotifFamily): Recipe {
  return {
    schema: 1,
    kind: 'recipe',
    id: family.id,
    interpreter: 'v2',
    scope: 'motif',
    applies: family.register,
    name: family.name,
    origin: 'golden',
    birds: {},
    wants: { motif: family.box as unknown as Record<string, any> },
    forbids: [],
    weight: family.weight,
    score: { chef: 0, likes: 0 },
    verdicts: [],
    provenance: {
      from: 'authored from production convention, PLAN-MOTIF §3',
      degrees: 'scale degrees relative to the chord that is sounding; the row names no note and no voice',
      calibration: 'the twelve authored motifs of src/motif.ts, each of which falls inside one of these boxes',
      note: family.note,
    },
  };
}

/** The three authored families as rows, built once. */
export const MOTIF_RECIPES: readonly Recipe[] = Object.freeze(HOUSE_FAMILIES.map(motifRecipe));

// --- the library on disk -----------------------------------------------------

/**
 * Read every `.json` row of a directory, in name order.
 *
 * Node only, and it says so by asking for its file system at the moment it
 * needs one rather than at the top of the module: this file is imported by the
 * page — `createMix` resolves `?recipe=` through it — and a page has no `fs`.
 * The specifier is built rather than written so no bundler follows it.
 *
 * Nothing is thrown for a bad row: every row comes back with what is wrong with
 * it, because a library is read to be reported on.
 */
export async function loadRecipes(
  dir: string,
  vocab: Vocabulary | null = null
): Promise<Array<{ file: string; recipe: Recipe | null; problems: string[] }>> {
  const fs = await import(/* @vite-ignore */ 'node:' + 'fs');
  const path = await import(/* @vite-ignore */ 'node:' + 'path');
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  return names.map((file) => {
    const full = path.join(dir, file);
    let row: any = null;
    try {
      row = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e: any) {
      return { file: full, recipe: null, problems: [`not readable as JSON: ${e.message}`] };
    }
    const problems = vocab ? validate(row, vocab) : [];
    return { file: full, recipe: problems.length ? null : (row as Recipe), problems };
  });
}

export default HOUSE_RECIPE;
