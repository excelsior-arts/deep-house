// The interpreter: what a recipe's `wants` does to the dice.
//
// A recipe is a **box in bird space plus a set of preferences**, and until this
// round only the box was read: `spellFor` rolled a spell inside `birds` and
// every other field on the row was documentation. The outside review found it
// and named the consequence exactly (the outside composition review of 09-19,
// §4): *two schema-valid rows with identical boxes but opposite roles and hard
// exclusions produce the same spell, therefore the same plan.* One of those two
// asked for a drumless piece. It got drums.
//
// So this file is the second half of a recipe, and it is written under the same
// three rules the first half is:
//
//   **It names no voice, no effect and no engine number.** Every want is read
//   as a property of a candidate — the timbre's own declared `hold` and
//   `brightnessHz`, the voice's declared family and roles, the density's own
//   budget — so a want written in 2026 still means something in 2028 when the
//   instrument it happens to land on has been replaced.
//
//   **It is a lean and not a switch**, except where the row says otherwise.
//   `wants` multiplies the weights the bias already handed the dice, inside the
//   same clamp; `forbids` is the one hard rule, and it is allowed to reach
//   nought because "drumless" must not quietly become drums.
//
//   **It says what it did and what it could not do.** A want this build cannot
//   interpret is reported as `unsupported` with the reason, and a want that
//   would empty a pool is reported as `unsatisfied` and not applied — the
//   review's own ask: *"do not let a label-valid recipe imply behavior the
//   engine does not implement."*
//
// ## The identity
//
// **A recipe with no `wants` and no `forbids` hands the bias straight back**,
// the same object, so a plan made under it is the plan it always was, to the
// bit. That is the arithmetic the golden rests on: the house row's `wants` is
// `{}` and every theme of both locks is planned with no recipe at all.
//
// ## The version
//
// `INTERPRETER` is the version of *these rules*, separate from the schema.
// PLAN-RECIPES rule 3: a row records the interpreter it was captured under, and
// **resolving an old row with a newer interpreter is allowed and logged**.
// `resolvedFrom` below is that line.

import type { Style } from '@deep-house/engine/style';
import type { MusicalParts } from './parts/types.ts';
import { resolveParts } from './parts/resolve.ts';
import { BY_NAME, TIMBRES, voicePlaying } from '@deep-house/engine/voices';
import { WEIGHT_CEILING, WEIGHT_FLOOR } from './spell.ts';
import type { Bias } from './spell.ts';
import { SLOT_LISTS, bassFigureProblems, struckFigureProblems } from './recipe.ts';
import type { Recipe } from './recipe.ts';
import { resolveRhythm } from './parts/rhythm.ts';
import { switchOn } from './lanes.ts';
import type { MotifBox } from './motif.ts';
import { textureProblems, textureCandidates, toneProblems, type PulseTexture, type Tone } from './parts/texture.ts';
import { ambienceProblems, presenceProblems, figureCandidates, type Ambience, type Presence, type StruckFigure } from './parts/figure.ts';

/**
 * The interpretation these rules are. It moves when what a want *means*
 * changes, never when a list widens or a number is re-measured.
 *
 *   `v1`  the box and nothing else: `birds` rolled a spell, `wants` was read by
 *         the tools that rank candidates and by nothing on a playing path.
 *   `v2`  this file.
 */
// v2.9 shares admission with ordinary composition and preserves texture-only
// and tone-only requests. New captures require this generator's calibration;
// v2.8 and earlier retain their historical reading-to-die map in mix.ts.
// v2.10 admits an explicit onset lattice, multi-bar ostinatos and ringing
// durations. Requests omitting these additions retain their previous score.
// v2.11 extends presence to sustained accompaniment; omitted requests keep
// their room level. Ringing struck notes carry their articulation to the desk.
// v2.12 preserves ordered relative-note paths and admits sustained harmonic phrases with explicit duration and optional
// attack/release in beats on instruments declaring those note controls.
// v2.13 admits kick cells, per-part human feel and style-owned phrase gestures.
// v2.14 admits 8/16-bar cells for infrequent whole-interval dropouts.
// v2.15 admits three independent pitched parts: accompaniment, melody and voice.
// v2.16 admits chord inversions below the melody's note.
// v2.17 distinguishes a figure's articulation from a forbidden sustained bed.
// v2.18 admits explicit attack-rest windows on the theme clock.
// v2.19 routes an explicit motif recipe to its own player, never global wants.
// v2.20 admits a layer or motif pin with `accompaniment=auto`: the pin reserves
// its logical role and ordinary composition fills the rest (recipe-request.ts).
// v2.21 admits `support: { sustained: 'separate' }` on a pitched part, reserving
// harmonic space from the sustained bed while the part plays.
// v2.22 admits a rhythm part's `character`, a style-owned sound colour resolved
// through declared controls; an unknown or incapable character refuses.
// v2.23 admits per-hit `strokes`, one named articulation per step of the cell.
// v2.24 admits a rhythm part's `pickup`, a one/two-bar lead-in at the end of a
// shaped rest under `development=percussion`.
// Most of v2.20-v2.24 were additive admissions that changed no existing want's
// meaning; by the rule above only a change of meaning moves this line.
// v2.25 withdraws `stage.front` naming a percussion role (harmonic notes at a
// quarter strength): an experiment only a rejected listening candidate used.
// Such a want is now reported unsupported, as it was before v2.x admitted it.
// It also admits `prefer` on a rhythm or pitched part: a narrower property
// profile inside `properties` that the draw leans toward, never a gate.
export const INTERPRETER = 'v2.25';

/**
 * **How hard a want leans.** A candidate that misses a want by one whole
 * tolerance — its `hold` is nought where the floor is the floor, its brightness
 * is a whole band out — draws at `e^-3`, which is **0.0498**, which is
 * `WEIGHT_FLOOR` to two figures. So the statement is: *one whole tolerance out
 * is the floor of the pool, and the floor is where the bias already put its own
 * worst candidate.* Nothing leaves the pool and nothing owns it, exactly as in
 * `spell.ts`; a want is a preference with a known worst case.
 */
export const WANT_LEAN = 3;

/**
 * What a membership miss costs, in tolerances. Half, and it is the number
 * `notes/analysis/recipe-demo.md` §11 settled on for the same question about a
 * role: *a role the recipe wants and the candidate does not play costs a half,
 * not more, because the one outright hit on recipe A does not play its source's
 * melody role either.* Role identity is worth less than hold.
 */
export const MEMBER_COST = 0.5;

/**
 * The stage's own costs, from the eight verdicts of 09-18
 * (`tools/imprint/plan-facts.ts`, `STAGE_POLICY`, restated here because a
 * playing path may not import a tool). A row that carries its own
 * `wants.stage.tolerance` overrides them, which is what that field is for.
 *
 *   `lead` is a match and `front` a **quarter-weight preference**, which is the
 *   one rule in the demo decided by measurement rather than by argument.
 *   A treatment the source did not have costs a quarter; **a phaser where the
 *   source had none costs 1.5**, because it is the only treatment ever named in
 *   a complaint and the only variant carrying one is the one it was named in.
 */
export const STAGE_COST = Object.freeze({
  leadPenalty: 1,
  frontPenalty: 1,
  frontMustMatch: false,
  treatmentNotInSource: 0.25,
  phaserWhereSourceHadNone: 1.5,
});

/** One line of the report: which block, how it went, and in what words. */
export interface WantNote {
  block: string;
  state: 'applied' | 'unsupported' | 'unsatisfied';
  say: string;
}

/** What the interpreter hands back. */
export interface Wanted extends MusicalParts {
  /** the bias the dice read: the same object when there was nothing to do */
  bias: Bias;
  /** lane gates a `forbids` closed, for the arrangement to hold off */
  silent: string[];
  /** every block, applied or refused, in the order they were read */
  notes: WantNote[];
  /** the version of these rules */
  interpreter: string;
  /** the row's own interpreter, when it is older than this one */
  resolvedFrom: string | null;
  /** true when nothing was changed at all */
  identity: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** A penalty in tolerances, as a weight. 0 is 1; one whole tolerance is the floor. */
const leanOf = (penalty: number) => Math.exp(-WANT_LEAN * penalty);

/**
 * Which voice makes a timbre, in the slot the list belongs to.
 *
 * The lead is the one case that is not a lane: a theme's lead family leads from
 * the **sustained** role when the style says that timbre is one of its
 * sustained leads and from the rhythmic one otherwise, which is the generator's
 * own rule (`CAT.sustainedLeads`). So the same word names two different
 * instruments depending on where it lands, and a want about a family has to ask
 * the same question the composer asks.
 */
function voiceOfTimbre(style: Style, listId: string, timbre: string): string | null {
  const cat: any = style.catalogue || {};
  const sustained = (cat.sustainedLeads || []).includes(timbre);
  const gate = listId === 'padPartners' || (listId === 'leadTimbres' && sustained) ? 'pad' : 'keys';
  try {
    return voicePlaying(gate, timbre) || null;
  } catch {
    return null;
  }
}

/** Every candidate of a list as the voice behind it, or null where there is none. */
function voicesOf(style: Style, row: { id: string; of: string; list: () => any[] }): Array<string | null> {
  const entries = row.list().map((e: any) => String(e && e.v !== undefined ? e.v : e));
  if (row.of === 'voice') return entries.map((v) => (BY_NAME[v] ? v : null));
  if (row.of === 'timbre') return entries.map((t) => voiceOfTimbre(style, row.id, t));
  return entries.map(() => null);
}

/**
 * One timbre against one slot's want, in tolerances.
 *
 * The shapes are the row's own numbers and the row's own numbers only —
 * `holdMin` is a **floor and not a window** because the one outright hit of the
 * eight verdicts had *more* hold than its source, `brightnessMin`/`Max` are the
 * wide band the verdicts could not support narrowing, and `struckRequired` is
 * false on every row the encoder writes because the hit changed it.
 */
function timbrePenalty(want: any, timbre: string): number {
  const got: any = (TIMBRES as any)[timbre];
  if (!got || !want) return 0;
  let p = 0;
  if (Number.isFinite(want.holdMin) && got.hold < want.holdMin) p += (want.holdMin - got.hold) / want.holdMin;
  if (Number.isFinite(want.holdMax) && got.hold > want.holdMax) p += (got.hold - want.holdMax) / want.holdMax;
  // The two brightness penalties divide by the *candidate's* corner where the
  // hold penalties divide by the want (R103 of the reconciled review of 09-24):
  // a too-bright timbre's penalty is capped under one tolerance and a too-dark
  // one's is not. Dividing both by the want would move the brightness wants of
  // the recipe rows that name one, a house-v2 re-bless, so it is said here.
  if (Number.isFinite(want.brightnessMin) && got.brightnessHz < want.brightnessMin)
    p += (want.brightnessMin - got.brightnessHz) / got.brightnessHz;
  if (Number.isFinite(want.brightnessMax) && got.brightnessHz > want.brightnessMax)
    p += (got.brightnessHz - want.brightnessMax) / got.brightnessHz;
  if (want.struckRequired === true && want.struck !== got.struck) p += 1;
  return p;
}

/**
 * **What a density is worth, per role, in onsets a bar.** The only two rates a
 * die in this composer really sets: the bass's note budget and the stab's. They
 * are the style's own table (`settings.density`) read by the word the
 * `densities` list draws, so nothing here knows what a density is called.
 *
 * Every other role a row may name — a kick on the floor, the offbeat a mined
 * mask decides, a melody's own phrase — is reported `unsupported`, because a
 * weight on a list nobody draws for that reason would be a rule pretending to
 * be a measurement.
 */
const RATE_ROLE_BUDGET: Readonly<Record<string, string>> = Object.freeze({
  bassline: 'bassNotes',
  figure: 'maxStabs',
});

export interface InterpretOptions {
  /** where a line about an older row is said; nothing in a test */
  log?: ((line: string) => void) | null;
}

/**
 * The bias the dice read, with a recipe's `wants` folded into it, and the
 * report of what that meant.
 *
 * **Handed no recipe, or a recipe with nothing to say, it hands the bias
 * straight back** — the same object, not a copy — which is the identity the
 * golden rests on.
 */
export function interpretWants(
  recipe: Recipe | null | undefined,
  style: Style,
  bias: Bias,
  opts: InterpretOptions = {}
): Wanted {
  const notes: WantNote[] = [];
  const silent: string[] = [];
  const heldBass = wantsHeldBass(recipe?.wants?.figures);
  const bassFigure = recipe?.wants?.figures?.bassline;
  const bassMotif = bassFigure?.articulation === 'legato' && !bassFigureProblems(bassFigure).length ? bassFigure.motif as MotifBox : null;
  const harmony = recipe?.wants?.harmony;
  const pedalHarmony = !!harmony && harmony.movement === 'pedal' && Object.keys(harmony).length === 1;
  const nothing: Wanted = {
    bias, silent: [], notes, interpreter: INTERPRETER, resolvedFrom: null, identity: true, heldBass: false,
    pedalHarmony: false, rhythm: [],
    bassMotif: null, struckFigures: [], ambience: {}, presence: {}, texture: null, tone: {},
  };
  if (!recipe) return nothing;
  const wants: any = recipe.wants || {};
  const forbids: string[] = Array.isArray(recipe.forbids) ? recipe.forbids : [];
  const rawTexture = wants.figures?.texture;
  const texture: PulseTexture | null = rawTexture !== undefined && !textureProblems(rawTexture).length ? rawTexture : null;
  const tone: Tone = wants.tone && !toneProblems(wants.tone).length ? wants.tone : {};
  if (rawTexture !== undefined) notes.push({ block: 'figures.texture', state: texture && switchOn(style, 'motif') && textureCandidates(texture, style, forbids).length ? 'applied' : 'unsatisfied', say: 'one independent harmonic pulse in its requested background space, on its own bar cycle; unavailable candidates refuse planning' });
  if (wants.tone !== undefined) notes.push({ block: 'tone', state: toneProblems(wants.tone).length ? 'unsatisfied' : 'applied', say: 'rounded kick reduces upper body; defined bass thins lingering harmonics; full bass restores audible body with a short release; note patterns stay fixed' });
  const upper = wants.figures?.figure;
  const struckFigures: StruckFigure[] = upper !== undefined && !struckFigureProblems(upper).length ? (Array.isArray(upper) ? upper : [upper]) : [];
  const ambience: Ambience = wants.ambience && !ambienceProblems(wants.ambience).length ? wants.ambience : {};
  const presence: Presence = wants.presence && !presenceProblems(wants.presence).length ? wants.presence : {};
  if (upper !== undefined) notes.push({ block: 'figures.figure', state: struckFigures.length && switchOn(style, 'motif') && struckFigures.every(part => figureCandidates(part, style, forbids).length) ? 'applied' : 'unsatisfied', say: 'independent pitched parts from enabled candidates and motif families; ostinatos repeat continuously, phrases enter within their spacing; empty or unrollable requests refuse planning' });
  if (wants.ambience !== undefined) notes.push({ block: 'ambience', state: ambienceProblems(wants.ambience).length ? 'unsatisfied' : 'applied', say: 'selected percussion and figure roles use the requested spatial character' });
  if (wants.presence !== undefined) notes.push({ block: 'presence', state: presenceProblems(wants.presence).length ? 'unsatisfied' : 'applied', say: 'supporting roles use the base style level; background roles sit nine decibels below the quieter of the style and current room levels; accents retain their shape' });
  const rhythm = resolveRhythm(wants.rhythm, style, forbids);
  if (wants.rhythm !== undefined) notes.push(rhythm.errors.length
    ? { block: 'rhythm', state: 'unsatisfied', say: rhythm.errors.join('; ') }
    : { block: 'rhythm', state: 'applied', say: `${rhythm.lanes.length} percussion cells replace their roles' default figures, using enabled palettes and arrangement gates` });
  const blocks = Object.keys(wants).filter((k) => wants[k] != null);
  for (const block of blocks) {
    if (block === 'figures' && heldBass) {
      notes.push({ block: 'figures.bassline', state: 'applied', say: 'the root bass follows harmonic changes and holds through each chord, stopping at arrangement gates' });
      for (const key of Object.keys(wants.figures)) if (!['bassline', 'figure', 'texture'].includes(key)) notes.push({ block: `figures.${key}`, state: 'unsupported', say: 'this figure instruction is not implemented' });
    } else if (block === 'figures' && bassMotif) {
      notes.push({ block: 'figures.bassline', state: switchOn(style, 'motif') ? 'applied' : 'unsupported', say: switchOn(style, 'motif')
        ? 'the existing motif grammar rolls the requested bass family and plays it legato under arrangement gates; an unrollable family refuses planning'
        : 'this style has no motif grammar' });
      for (const key of Object.keys(wants.figures)) if (!['bassline', 'figure', 'texture'].includes(key)) notes.push({ block: `figures.${key}`, state: 'unsupported', say: 'this figure instruction is not implemented' });
    } else if (block === 'figures' && (upper !== undefined || rawTexture !== undefined)) {
      for (const key of Object.keys(wants.figures)) if (!['figure', 'texture'].includes(key)) notes.push({ block: `figures.${key}`, state: 'unsupported', say: 'this figure instruction is not implemented' });
    } else if (block === 'harmony' && pedalHarmony) {
      notes.push({ block, state: 'applied', say: 'one tonic chord and voicing throughout the harmonic loop' });
    } else if (!['timbres', 'families', 'roles', 'rates', 'stage', 'rhythm', 'ambience', 'presence', 'tone'].includes(block)) {
      notes.push({ block, state: 'unsupported', say: 'this recipe interpreter does not apply this block' });
    }
  }
  if (!blocks.length && !forbids.length) {
    return { ...nothing, resolvedFrom: recipe.interpreter && recipe.interpreter !== INTERPRETER ? recipe.interpreter : null };
  }

  // The multipliers, per list, built lazily: a list nobody has an opinion about
  // is never allocated and is handed through as the bias wrote it.
  const mul: Record<string, number[]> = {};
  const rows = style.candidates as Array<{ id: string; of: string; die: string; list: () => any[] }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lengthOf = (id: string) => (byId.get(id) ? byId.get(id)!.list().length : 0);
  const at = (id: string): number[] | null => {
    const n = lengthOf(id);
    if (!n) return null;
    if (!mul[id]) mul[id] = new Array(n).fill(1);
    return mul[id];
  };
  // A lean is a preference and never an exclusion: nought is the forbid's
  // mark alone. A want with a bound of nought (`holdMax: 0`, `perBar: 0`)
  // divides by it, and its infinite penalty used to lean the whole pool to
  // nought, which the weights below then read as forbidden while the report
  // said `applied` (R40 of the review of 09-24). The smallest positive number
  // keeps it a lean, and the weights floor it as they floor every lean.
  const lean = (id: string, i: number, penalty: number) => {
    const m = at(id);
    if (m && m[i] !== 0) m[i] = Math.max(m[i] * leanOf(penalty), Number.MIN_VALUE);
  };

  // --- wants.timbres: the registry's own declared properties, per slot -------
  if (wants.timbres && typeof wants.timbres === 'object') {
    const said: string[] = [];
    for (const slot of Object.keys(wants.timbres)) {
      const listId = (SLOT_LISTS as Record<string, string>)[slot];
      const row = listId ? byId.get(listId) : undefined;
      if (!row) { notes.push({ block: `timbres.${slot}`, state: 'unsupported', say: `this style fills no ${slot} slot` }); continue; }
      const entries = row.list().map((e: any) => String(e.v ?? e));
      let moved = 0;
      entries.forEach((t, i) => {
        const p = timbrePenalty(wants.timbres[slot], t);
        if (p > 0) { lean(listId, i, p); moved++; }
      });
      said.push(`${slot} leans ${moved} of ${entries.length}`);
    }
    if (said.length) notes.push({ block: 'timbres', state: 'applied', say: said.join(', ') });
  }

  // --- wants.families and wants.roles: membership, over the voice behind a
  // candidate. A list whose every candidate is outside the wanted set is leaned
  // uniformly, which `pickWeighted` reads as no lean at all — so the report says
  // how many candidates actually moved relative to their neighbours.
  for (const [block, field] of [['families', 'family'], ['roles', 'roles']] as const) {
    const want: string[] = Array.isArray(wants[block]) ? wants[block].filter((x: any) => typeof x === 'string') : [];
    if (!want.length) continue;
    const set = new Set(want);
    let moved = 0;
    let lists = 0;
    for (const row of rows) {
      if (row.of !== 'voice' && row.of !== 'timbre') continue;
      const voices = voicesOf(style, row);
      const outside = voices.map((v) => {
        if (!v || !BY_NAME[v]) return false;
        const d: any = BY_NAME[v];
        const mine: string[] = field === 'family' ? [d.family] : (d.roles || []);
        return !mine.some((x) => set.has(x));
      });
      // A uniform lean is not a lean: `pickWeighted` reads relative weights and
      // multiplying a whole list by one constant changes nothing it does. Said
      // out loud rather than applied and then explained away.
      if (outside.every(Boolean) || !outside.some(Boolean)) continue;
      lists++;
      outside.forEach((bad, i) => { if (bad) { lean(row.id, i, MEMBER_COST); moved++; } });
    }
    notes.push(moved
      ? { block, state: 'applied', say: `${moved} candidates on ${lists} lists are outside ${want.join(', ')}` }
      : { block, state: 'unsatisfied', say: `no list this style draws separates ${want.join(', ')} from the rest` });
  }

  // --- wants.rates: the two budgets a die really sets ------------------------
  if (wants.rates && typeof wants.rates === 'object') {
    const table: any = (style.settings as any)?.density || {};
    const row = byId.get('densities');
    const used: string[] = [];
    const unsupported: string[] = [];
    for (const role of Object.keys(wants.rates)) {
      const budget = RATE_ROLE_BUDGET[role];
      const want = wants.rates[role];
      if (!budget || !row || !table[budget] || !want || !Number.isFinite(want.perBar)) { unsupported.push(role); continue; }
      const entries = row.list().map((e: any) => String(e.v ?? e));
      entries.forEach((word, i) => {
        const perBar = table[budget][word];
        if (!Number.isFinite(perBar)) return;
        const lo = Number.isFinite(want.min) ? want.min : want.perBar;
        const hi = Number.isFinite(want.max) ? want.max : want.perBar;
        const p = perBar < lo ? (lo - perBar) / want.perBar : perBar > hi ? (perBar - hi) / want.perBar : 0;
        if (p > 0) lean('densities', i, p);
      });
      used.push(`${role} ${want.perBar}/bar`);
    }
    if (used.length) notes.push({ block: 'rates', state: 'applied', say: `the density budget leans on ${used.join(', ')}` });
    if (unsupported.length) notes.push({
      block: 'rates', state: 'unsupported',
      say: `${unsupported.join(', ')}: no die in this composer sets that rate — the floor, the mined masks and the phrase do`,
    });
  }

  // --- wants.stage: who leads, who is in front, what the desk has on ---------
  if (wants.stage && typeof wants.stage === 'object') {
    const pol = { ...STAGE_COST, ...(wants.stage.tolerance && typeof wants.stage.tolerance === 'object' ? wants.stage.tolerance : {}) };
    const cat: any = style.catalogue || {};
    const sustained = new Set<string>(cat.sustainedLeads || []);
    const leadRow = byId.get('leadTimbres');
    // `lead` is a match and `front` a quarter-weight preference. Both reach the
    // same list, because which *role* leads a theme is a property of the lead
    // timbre and of nothing else: the style's `sustainedLeads` is the question
    // the composer itself asks (`leadSustained` in `src/generator.ts`).
    for (const [key, cost] of [['lead', pol.leadPenalty], ['front', pol.frontMustMatch ? pol.frontPenalty : pol.frontPenalty * 0.25]] as const) {
      const wantRole = wants.stage[key];
      if (typeof wantRole !== 'string') continue;
      const holds = wantRole === 'sustained';
      if (!holds && wantRole !== 'figure' && wantRole !== 'melody') {
        notes.push({ block: `stage.${key}`, state: 'unsupported', say: `${wantRole} is not a role a harmonic draw decides` });
        continue;
      }
      if (!leadRow) continue;
      const entries = leadRow.list().map((e: any) => String(e.v ?? e));
      let moved = 0;
      entries.forEach((t, i) => {
        if (sustained.has(t) === holds) return;
        lean('leadTimbres', i, cost);
        moved++;
      });
      notes.push({ block: `stage.${key}`, state: 'applied', say: `${moved} of ${entries.length} leads lean away from ${wantRole} at ${cost} of a tolerance` });
    }
    const rota = byId.get('treatmentRota');
    if (Array.isArray(wants.stage.treatments) && rota) {
      const had = new Set<string>(wants.stage.treatments.filter((x: any) => typeof x === 'string'));
      const entries = rota.list().map((e: any) => String(e.v ?? e));
      let moved = 0;
      entries.forEach((t, i) => {
        if (had.has(t)) return;
        // The one treatment the verdicts price differently, and it is named on
        // the row rather than in a branch about an effect: `phaser` is the
        // stage's own gesture and the only one ever named in a complaint.
        const cost = /phaser/i.test(t) && !had.has('phaser') ? pol.phaserWhereSourceHadNone : pol.treatmentNotInSource;
        lean('treatmentRota', i, cost);
        moved++;
      });
      notes.push({ block: 'stage.treatments', state: 'applied', say: `${moved} of ${entries.length} rota entries are not what the source had` });
    } else if (Array.isArray(wants.stage.treatments)) {
      notes.push({ block: 'stage.treatments', state: 'unsupported', say: 'this style draws no treatment rota' });
    }
    if (Array.isArray(wants.stage.back) && wants.stage.back.length) {
      notes.push({ block: 'stage.back', state: 'unsupported', say: 'which role has receded is the sound stage\'s reading of the figure, not a draw' });
    }
  }

  // --- forbids: the one hard rule -------------------------------------------
  //
  // A role or a family that is refused outright. Every candidate whose voice
  // carries it goes to nought, where `pickWeighted` drops it before it draws;
  // and a **lane** whose every candidate is refused is held off in the
  // arrangement itself, phrase by phrase, which is the same machinery
  // derive-lite uses for a drumless piece. A list that would be emptied with no
  // lane to switch off is reported and left alone: a pool with nothing in it is
  // a broken plan and not a refused one.
  if (forbids.length) {
    const set = new Set(forbids);
    const carries = (v: string | null) => {
      if (!v || !BY_NAME[v]) return false;
      const d: any = BY_NAME[v];
      return set.has(d.family) || (d.roles || []).some((r: string) => set.has(r));
    };
    const zeroed: string[] = [];
    const kept: string[] = [];
    for (const row of rows) {
      if (row.of !== 'voice' && row.of !== 'timbre') continue;
      const voices = voicesOf(style, row);
      const bad = voices.map(carries);
      if (!bad.some(Boolean)) continue;
      const lanesOn = (style.lanes || []).filter((l: any) => l.list === row.id);
      if (bad.every(Boolean)) {
        const gates = lanesOn.filter((l: any) => l.gate).map((l: any) => l.gate as string);
        if (gates.length) { for (const g of gates) if (!silent.includes(g)) silent.push(g); zeroed.push(`${row.id} (the lane goes quiet)`); }
        else kept.push(row.id);
        continue;
      }
      const m = at(row.id);
      if (m) bad.forEach((x, i) => { if (x) m[i] = 0; });
      zeroed.push(`${row.id} drops ${bad.filter(Boolean).length} of ${bad.length}`);
    }
    // A lane the style gives no candidate list — the kick, the bass and the two
    // harmonic lanes — is refused by its **role**, which is the only thing such
    // a lane declares about what it plays.
    for (const l of (style.lanes || []) as any[]) {
      if (l.gate && set.has(l.role) && !silent.includes(l.gate)) { silent.push(l.gate); zeroed.push(`${l.id} (the lane goes quiet)`); }
    }
    if (zeroed.length) notes.push({ block: 'forbids', state: 'applied', say: zeroed.join('; ') });
    if (kept.length) notes.push({ block: 'forbids', state: 'unsatisfied', say: `${kept.join(', ')} would be emptied and there is no lane to switch off; left alone` });
    if (!zeroed.length && !kept.length) notes.push({ block: 'forbids', state: 'applied', say: `nothing this style draws carries ${forbids.join(', ')}` });
  }

  const ids = Object.keys(mul);
  const changed = !!texture || Object.keys(tone).length > 0 || heldBass || !!bassMotif || struckFigures.length > 0 || Object.keys(ambience).length > 0 || Object.keys(presence).length > 0 || pedalHarmony || rhythm.lanes.length > 0 || ids.some((id) => mul[id].some((m) => m !== 1)) || silent.length > 0;
  const resolvedFrom = recipe.interpreter && recipe.interpreter !== INTERPRETER ? recipe.interpreter : null;
  if (resolvedFrom && opts.log) {
    opts.log(`recipe: ${recipe.id} was captured under interpreter ${resolvedFrom} and is resolved by ${INTERPRETER}`);
  }
  if (!changed) return { ...nothing, resolvedFrom };

  const weights: Record<string, number[]> = { ...bias.weights };
  for (const id of ids) {
    const base = bias.weights[id];
    const m = mul[id];
    if (!base || base.length !== m.length) continue;
    // A forbidden candidate is nought and is **not** clamped up to the floor:
    // a lean is a preference and an exclusion is not, and `Rng.pickWeighted`
    // drops a weight of nought before it draws.
    weights[id] = base.map((w, i) => (m[i] === 0 ? 0 : clamp(w * m[i], WEIGHT_FLOOR, WEIGHT_CEILING)));
  }
  const resolved = resolveParts({
    heldBass, ...(bassMotif ? { bassMotif } : {}), struckFigures,
    ambience, presence, ...(texture ? { texture } : {}), tone,
    pedalHarmony, ...(wants.rhythm ? { rhythm: wants.rhythm } : {}),
  }, style, forbids);
  if (resolved.errors.length) throw new Error(`musical parts: ${resolved.errors.join('; ')}`);
  return {
    bias: { ...bias, weights, house: false },
    silent, notes, interpreter: INTERPRETER, resolvedFrom, identity: false,
    ...resolved.parts,
  };
}

function wantsHeldBass(figures: any): boolean {
  const bass = figures?.bassline;
  return !!bass && bass.follows === 'harmony' && bass.articulation === 'held'
    && Object.keys(bass).every(key => ['follows', 'articulation'].includes(key));
}

/** The report as one line, for a console that has room for one. */
export const sayWanted = (w: Wanted): string =>
  w.notes.map((n) => `${n.block}: ${n.state === 'applied' ? '' : `${n.state} — `}${n.say}`).join(' | ');

export default interpretWants;
