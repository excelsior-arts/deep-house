// **The ensemble** (10-28, his word: *"if we miss abstraction to hold this composition of motifs we need to come up with
// one. Exchanging voices, tones and sounds is fine as long as we maintained the salt of the track we mined"*).
//
// An ensemble row is a set of roles that arrive together with the relations between them held: who leads, who answers
// in whose rests, which registers sit over which, how dense each is, how near each is and how loud against the others.
// The voices (a property window and a `prefer` per role), the key, the tempo and the notes vary by seed; the relations
// are held by how the parts are made (their grids, their cells, a shared breath, their paths' rhythm and landings), and
// `tools/ensemble-salt.ts` measures them over many seeds as a tripwire. Nothing re-rolls at play time.
//
// The row's `ensemble` block is written in the fields of the single technique entry (the slow conversation, the
// journey, the sea): `needs`, `silences`, `level`, `form`, `harmony`, `bed`, `tempo`, and then the ensemble's own:
// `breath`, `roles` (how its check finds each role in a plan) and `relations` (the measured salt, each with its range).
// It plays through the ordinary lanes as a track request (`ensembleTrack`), so the scene, the budget and the stage are
// the composer's own.
import type { Recipe } from './recipe.ts';
import { GRAMMAR_NEEDS, type GrammarNeed } from './needs.ts';
import { TIMBRES } from '@deep-house/engine/voices';
import { airMeasured } from './air-lean.ts';

/** How the check finds a role's notes in a plan: by the part's name (`as`), the event's layer, or its role. */
export type RoleSelector = ({ as: string } | { layer: string } | { role: string }) & {
  /** the voice the role was heard on in its study: its parts' `near` reads distances from it, the check too */
  source?: string;
  /** the role's register in its study: the median MIDI note */
  register?: number;
  /**
   * **The ingredients' tolerances** (plain numbers a later step may scale with one, as reach: *"would it allow to actually
   * pull more voices despite of the limitations?"*): how far a swapped voice may stand from the source (`voiceDistance`),
   * how many semitones the role's median may stand from the study's. The relations (the salt) are never scaled; the
   * draw's reach widens these by the block's `reach` factors (`tolerancesAt`).
   */
  tolerance?: { voice?: number; register?: number };
};

/** One measured relation and the range it must sit in (`tools/ensemble-salt.ts` reads the measures by name). */
export interface Relation {
  /** what it means, in a line */
  says: string;
  measure: 'density' | 'onTheBeat' | 'offbeatEighths' | 'chords' | 'shared' | 'over' | 'breathRests' | 'breathFilled'
    | 'barsPlayed' | 'dry' | 'wet' | 'absentIn' | 'median' | 'voiceDistance';
  a: string;
  b?: string;
  /** a section kind, for `absentIn` */
  section?: string;
  /** the source voice, for `voiceDistance` (`parts/figure.ts`) */
  voice?: string;
  range: [number, number];
}

export interface EnsembleBlock {
  /** what the theme must give it (`src/needs.ts`): the drums on, the four-floor kit */
  needs?: GrammarNeed[];
  /** the roles it holds off (`forbids`): the held bed it never played beside */
  silences?: string[];
  /** dB onto a lane's level inside the ensemble (its approved balance, where a later house rule moved it) */
  level?: Record<string, number>;
  /** its own form; `null` is the theme's */
  form?: null;
  /** its harmony: `pedal`, the key's one chord */
  harmony?: { movement: 'pedal' };
  /** its own bed; `null` is none (`silences` takes the theme's) */
  bed?: null;
  /** the tempo window the vibe survives, BPM */
  tempo: [number, number];
  /**
   * **Where it sits** (its study's measured birds): the centre the birds' leans are read about, inside the ensemble as in
   * any track. Zephyr leans a role's voice by its measured air, Gleam by its declared brightness, Tide the roles' sends
   * (each role's depth kept: a factor on every role at once, inside `tideSends`).
   */
  centre?: Record<string, number>;
  /** the sends' factor at the two ends of Tide's travel about the centre (near stays nearest, far farthest) */
  tideSends?: [number, number];
  /** Root's weight on the bass inside the ensemble: dB onto the sub at Root's two ends about the centre (the bass leads either way) */
  rootSub?: [number, number];
  /** whether the house's swell-in rule reaches its held roles; `false` keeps their entrances as written */
  swellIn?: boolean;
  /**
   * how strongly a bird away from the centre leans a role's voice (`ensembleLean`): the weight's log per octave of the
   * voice's air (Zephyr) or brightness (Gleam) about the draw's middle, per unit of the bird; none, no lean
   */
  lean?: number;
  /** which roles play in a section kind, where it is not every role (the breakdown the hum's): the others sit it out */
  development?: Record<string, string[]>;
  /** one rest several roles take together, every `every` bars from beat `at` for `beats` beats; `fill` plays into it */
  breath?: { every: number; at: number; beats: number; roles: string[]; fill?: string[] };
  roles: Record<string, RoleSelector>;
  relations: Relation[];
  /**
   * **How far the reach stretches its ingredients** (the machine view's draw slider, `reachOf` in `library-draw.ts`, 10-28):
   * each role's tolerance times these factors at reach 1, times 1 at reach 0 (in between in a line). `voice` widens the
   * distance a swapped voice may stand from its source and the falloff of its weight; `register` widens the band its
   * median may stand in, and the pitched parts drift together by the widening, in scale steps (one draw for all, so the
   * registers' order holds). The relations are never scaled: reach loosens the ingredients, never the salt.
   */
  reach?: { voice: number; register: number };
}

const MEASURES = ['density', 'onTheBeat', 'offbeatEighths', 'chords', 'shared', 'over', 'breathRests', 'breathFilled', 'barsPlayed', 'dry', 'wet', 'absentIn', 'median', 'voiceDistance'];

/** What is malformed in an ensemble block, one line each. */
export function ensembleProblems(e: any): string[] {
  const bad: string[] = [];
  if (!e || typeof e !== 'object') return ['ensemble: a block of fields'];
  const known = ['needs', 'silences', 'level', 'form', 'harmony', 'bed', 'tempo', 'centre', 'tideSends', 'rootSub', 'swellIn', 'lean', 'breath', 'development', 'roles', 'relations', 'reach'];
  if (e.lean !== undefined && !(Number.isFinite(e.lean) && e.lean >= 0 && e.lean <= 12)) bad.push('ensemble.lean: a log per octave from 0 to 12');
  if (e.tideSends !== undefined && (!Array.isArray(e.tideSends) || e.tideSends.length !== 2 || !(e.tideSends[0] > 0 && e.tideSends[0] <= 1 && e.tideSends[1] >= 1 && e.tideSends[1] <= 3)))
    bad.push('ensemble.tideSends: a factor under one and one over, at most 3');
  for (const [kind, roles] of Object.entries(e.development ?? {})) if (!Array.isArray(roles) || roles.some((r) => !(r in (e.roles ?? {}))))
    bad.push(`ensemble.development.${kind}: the roles it names`);
  for (const k of Object.keys(e)) if (!known.includes(k)) bad.push(`ensemble.${k}: unknown field`);
  if (!Array.isArray(e.tempo) || e.tempo.length !== 2 || !(e.tempo[0] > 0 && e.tempo[0] <= e.tempo[1])) bad.push('ensemble.tempo: a window of BPM');
  if (e.needs !== undefined && (!Array.isArray(e.needs) || e.needs.some((n: any) => !GRAMMAR_NEEDS.includes(n)))) bad.push(`ensemble.needs: ${GRAMMAR_NEEDS.join(', ')}, or nothing`);
  if (e.level !== undefined && (typeof e.level !== 'object' || Object.values(e.level).some((v: any) => !Number.isFinite(v) || Math.abs(v) > 18)))
    bad.push('ensemble.level: dB within 18 by lane level');
  if (e.harmony !== undefined && e.harmony?.movement !== 'pedal') bad.push('ensemble.harmony: pedal');
  if (e.form !== undefined && e.form !== null) bad.push('ensemble.form: the theme\'s (null) until an ensemble asks for one');
  if (e.bed !== undefined && e.bed !== null) bad.push('ensemble.bed: none (null) until an ensemble asks for one');
  const b = e.breath;
  if (b !== undefined && (!b || !Number.isInteger(b.every) || b.every < 1 || b.every > 16 || !(b.at >= 0) || !(b.beats > 0)
    || b.at + b.beats > b.every * 4 || !Number.isInteger(b.at * 4) || !Number.isInteger(b.beats * 4) || !Array.isArray(b.roles)
    || (b.fill !== undefined && !Array.isArray(b.fill)))) bad.push('ensemble.breath: whole sixteenths inside a cycle of 1-16 bars, and its roles');
  if (!e.roles || typeof e.roles !== 'object') bad.push('ensemble.roles: a selector per role');
  const names = new Set(Object.keys(e.roles ?? {}));
  for (const r of [...(b?.roles ?? []), ...(b?.fill ?? [])]) if (!names.has(r)) bad.push(`ensemble.breath names ${r}, no role`);
  if (e.reach !== undefined && (typeof e.reach !== 'object' || Object.keys(e.reach).sort().join() !== 'register,voice' || !Object.values(e.reach).every((v) => Number(v) >= 1)))
    bad.push('ensemble.reach: a voice and a register factor at reach 1, each 1 or over');
  for (const [name, sel] of Object.entries(e.roles ?? {}) as Array<[string, any]>) {
    if (sel.tolerance !== undefined && (typeof sel.tolerance !== 'object' || Object.entries(sel.tolerance).some(([k, v]) => !['voice', 'register'].includes(k) || !(Number(v) >= 0))))
      bad.push(`ensemble.roles.${name}.tolerance: a voice distance and a register band, at nought or over`);
    if (sel.register !== undefined && !(Number.isInteger(sel.register) && sel.register >= 12 && sel.register <= 108)) bad.push(`ensemble.roles.${name}.register: a MIDI note`);
  }
  if (!Array.isArray(e.relations) || !e.relations.length) bad.push('ensemble.relations: the measured salt');
  for (const [i, r] of (e.relations ?? []).entries()) {
    if (!MEASURES.includes(r?.measure)) bad.push(`ensemble.relations[${i}]: unknown measure ${r?.measure}`);
    if (!names.has(r?.a) || (r?.b !== undefined && !names.has(r.b))) bad.push(`ensemble.relations[${i}]: a role it does not name`);
    if (!Array.isArray(r?.range) || r.range.length !== 2 || !(r.range[0] <= r.range[1])) bad.push(`ensemble.relations[${i}]: a range`);
  }
  return bad;
}

/** The parts' names (`as`) the breath reaches, and the cell or the rests each takes. */
function breathe(wants: Record<string, any>, b: NonNullable<EnsembleBlock['breath']>): Record<string, any> {
  const out = structuredClone(wants);
  const from = b.at * 4, to = (b.at + b.beats) * 4, cycle = b.every * 16;
  for (const cells of Object.values(out.rhythm ?? {}) as any[][]) for (const cell of cells) {
    if (!b.roles.includes(cell.as)) continue;
    // the cell laid over the breath's cycle, its hits inside the breath taken out
    const reps = Math.max(1, Math.round(cycle / (cell.bars * 16)));
    const steps: number[] = [], accents: number[] = [];
    for (let k = 0; k < reps; k++) cell.steps.forEach((s: number, i: number) => {
      const at = s + k * cell.bars * 16;
      if (at % cycle >= from && at % cycle < to) return;
      steps.push(at); accents.push(cell.accents[i]);
    });
    Object.assign(cell, { bars: Math.max(cell.bars, b.every), steps, accents, clock: 'section' });
  }
  // on the section's clock, as a part's statement is: the breath falls where it fell in the approved phrase, whatever
  // bar the section starts on
  const figures = out.figures?.figure ? [out.figures.figure].flat() : [];
  for (const f of figures) if (b.roles.includes(f.as)) f.rests = { bars: b.every, beats: [[b.at, b.at + b.beats]], clock: 'section' };
  return out;
}

/** The factors on the roles' tolerances at a reach (0 to 1, `reachOf`): 1 at nought, the block's `reach` at 1. */
export function reachFactors(e: EnsembleBlock, reach: number): { voice: number; register: number } {
  const r = Math.max(0, Math.min(1, Number(reach) || 0));
  return { voice: 1 + ((e.reach?.voice ?? 1) - 1) * r, register: 1 + ((e.reach?.register ?? 1) - 1) * r };
}

/** Each role's tolerances at a reach: the faithful ones at nought, widened by `reachFactors` above it. */
export function tolerancesAt(e: EnsembleBlock, reach: number): Record<string, { voice?: number; register?: number }> {
  const k = reachFactors(e, reach);
  return Object.fromEntries(Object.entries(e.roles).map(([name, s]) => [name, {
    ...(s.tolerance?.voice !== undefined ? { voice: s.tolerance.voice * k.voice } : {}),
    ...(s.tolerance?.register !== undefined ? { register: s.tolerance.register * k.register } : {}) }]));
}

/**
 * How far the pitched parts' registers may drift together at a reach, in semitones: the narrowest widening among the
 * parts that name a register band (the bass keeps its own; the pulse moves by the parts' steps), 0 at reach 0.
 */
export function driftAt(e: EnsembleBlock, reach: number): number {
  const at = tolerancesAt(e, reach), was = tolerancesAt(e, 0);
  const wide = Object.entries(e.roles).filter(([, s]) => 'as' in s)
    .filter(([name]) => at[name].register !== undefined).map(([name]) => at[name].register! - was[name].register!);
  return wide.length ? Math.round(Math.min(...wide)) : 0;
}

const tracks = new WeakMap<object, Map<number, Recipe>>();
/**
 * An ensemble row as the track request the composer plays: its harmony, its silences as the row's forbids, its breath
 * laid into its roles' cells and rests. The block stays on it, for the level and the swell-in the generator reads.
 */
export function ensembleTrack(row: Recipe, reach = 0): Recipe {
  const had = tracks.get(row)?.get(reach);
  if (had) return had;
  const e = row.ensemble as EnsembleBlock;
  const bad = ensembleProblems(e);
  if (bad.length) throw new Error(`Recipe ${row.id}: ${bad.join('; ')}`);
  const wants: Record<string, any> = { ...(e.breath ? breathe(row.wants ?? {}, e.breath) : structuredClone(row.wants ?? {})), ...(e.harmony ? { harmony: e.harmony } : {}) };
  // its development: a pitched part a section kind does not name sits it out
  for (const f of wants.figures?.figure ? [wants.figures.figure].flat() : [])
    for (const [kind, roles] of Object.entries(e.development ?? {})) if (f.as && !roles.includes(f.as)) f.leaves = [...(f.leaves ?? []), kind];
  // each role's source voice onto its parts' `near` (the row's wants name no voice; the block's roles do)
  const sourceOf = (as: string | undefined) => (as ? (e.roles[as] as { source?: string } | undefined)?.source : undefined);
  // at the draw's reach (`reachFactors`): the tolerance and the falloff widened alike, and the pitched parts' shared drift
  const tol = tolerancesAt(e, reach), kv = reachFactors(e, reach).voice, drift = driftAt(e, reach);
  const voiceTol = (as: string | undefined) => (as ? tol[as]?.voice : undefined);
  const nearAt = (n: { falloff: number; max?: number }, as: string | undefined) =>
    ({ ...n, voice: sourceOf(as), max: voiceTol(as) ?? (n.max === undefined ? undefined : n.max * kv), falloff: n.falloff * kv });
  for (const f of wants.figures?.figure ? [wants.figures.figure].flat() : []) {
    if (f.near && sourceOf(f.as)) f.near = nearAt(f.near, f.as);
    if (drift > 0 && f.as) f.drift = drift;
  }
  const pulseRole = Object.entries(e.roles).find(([, s]) => 'role' in s && s.role === 'texture')?.[0];
  if (wants.figures?.texture?.near && sourceOf(pulseRole)) wants.figures.texture.near = nearAt(wants.figures.texture.near, pulseRole);
  if (drift > 0 && wants.figures?.texture) wants.figures.texture.drift = drift;
  const track = { ...row, scope: 'track', applies: null, wants, forbids: [...new Set([...(row.forbids ?? []), ...(e.silences ?? [])])] } as Recipe;
  if (!tracks.has(row)) tracks.set(row, new Map());
  tracks.get(row)!.set(reach, track);
  return track;
}

/**
 * **The birds' lean on an ensemble's voices**: each candidate's weight times exp(`lean` x the bird's distance from the
 * centre x the voice's air (Zephyr, `voice-air.json` wherever it was measured in front) or brightness (Gleam, the declared facts) about the draw's middle,
 * in octaves). At the centre every weight is as the palette has it; an unmeasured voice stands at the middle.
 */
export function ensembleLean(e: EnsembleBlock, spell: Record<string, number>) {
  // (a voice's air wherever it was measured in front, `airMeasured`: the keys, held, the calls)
  const air = (t: string) => { const hz = airMeasured(t)?.hz; return hz ? Math.log2(hz) : null; };
  const light = (t: string) => { const hz = (TIMBRES as Record<string, { brightnessHz?: number }>)[t]?.brightnessHz; return hz ? Math.log2(hz) : null; };
  const about = (list: Array<{ timbre: string; w: number }>, of: (t: string) => number | null) => {
    const a = list.map((c) => of(c.timbre)); let m = 0, s = 0;
    list.forEach((c, i) => { if (a[i] != null && c.w > 0) { m += c.w; s += c.w * a[i]!; } });
    return a.map((x) => (x == null || !m ? 0 : x - s / m));
  };
  const per = e.lean ?? 0;
  return (_want: unknown, list: Array<{ timbre: string; w: number }>): number[] => {
    const z = (spell.zephyr ?? 0.5) - (e.centre!.zephyr ?? spell.zephyr ?? 0.5), g = (spell.gleam ?? 0.5) - (e.centre!.gleam ?? spell.gleam ?? 0.5);
    const A = about(list, air), L = about(list, light);
    return list.map((c, i) => c.w * Math.exp(per * (z * A[i] + g * L[i])));
  };
}

/** Tide's factor on an ensemble's sends at a spell: 1 at the centre, `tideSends` at Tide's ends, in between by ratio. */
export function ensembleTide(e: EnsembleBlock, tide: number): number {
  if (!e.tideSends || !e.centre) return 1;
  const c = e.centre.tide ?? 0.5, [lo, hi] = e.tideSends;
  return tide >= c ? Math.pow(hi, c >= 1 ? 0 : (tide - c) / (1 - c)) : Math.pow(lo, c <= 0 ? 0 : (c - tide) / c);
}

/** Root's dB on the sub at a spell (`rootSub`): nought at the centre, the row's ends at Root's, in a straight line. */
export function ensembleRoot(e: EnsembleBlock, root: number): number {
  if (!e.rootSub || !e.centre) return 0;
  const c = e.centre.root ?? 0.5, [lo, hi] = e.rootSub;
  return root >= c ? (c >= 1 ? 0 : hi * (root - c) / (1 - c)) : (c <= 0 ? 0 : lo * (c - root) / c);
}
