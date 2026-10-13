/**
 * **The riff's phrase** (the liquid bass rounds of 10-06/07): where the drops
 * play, a phrase of held runs in place of the bar shapes. Each run is one note
 * from `step` for `len` sixteenths, and everything it does is knots in
 * sixteenths from its start:
 *
 * - `anchors` `[step, shape, note]` or `[step, "home"]`: the notes the run's
 *   gestures belong to — a note of the theme's own rolled shapes, or home.
 *   Between two knots naming the same note the run holds on it; between two
 *   naming different notes it travels from one to the other in a straight
 *   line over that interval. The anchors keep their rolled intervals over the
 *   line's home, which is folded into the register once (liquid-fix, 10-07:
 *   folding each note, or each knot, on its own can turn a gesture over);
 * - `pitch` `[step, semitones]`: the gesture's own shape, a residual added to
 *   that anchor path — the falls, the flicks and the settling — so every theme
 *   plays the same gestures on its own notes, and no die is thrown again;
 * - `level` `[step, gain]`: the note's output, straight lines between knots;
 * - `pair` `[step, share]`: the voice's pair level as a share of the row's own;
 * - `body` `[step, gain]`, optional: the voice's third harmonic as a share
 *   of the row's own; a gesture can brighten without raising its fundamental;
 * - `press`: a kick inside the run, while the run holds through its duck,
 *   takes the low duck at the phrase's `pressDb`.
 *
 * And for the whole phrase, `afterKick` (liquid-k10, 10-07): where a run is
 * still held, flat and without its pair, from the bar's kick on `step` through
 * the snare on `snare`, the line does what source 9's drum-free break does
 * there — a flick up on the kick that falls back within about a sixteenth, then
 * a sag through the snare to the run's next travel — so no note sits unchanged
 * across the two hits (`withAfterKick`). Its gesture's size is three knobs
 * of its own (the liquid desk, 10-08): `flickSt`, `sagStPerStep` and
 * `sagMaxSt`, each a declared range with the measured number as its default
 * (`afterKickAt` resolves them); its condition and its timing stay numbers.
 *
 * **The phrase's knobs** (the liquid knobs, 10-07): its gestures as declared
 * ranges, each with V's number as its default — `scoop` (a scale on the
 * gesture's residual, every `pitch` knot over its anchor path, `afterKick`'s
 * flick and sag with it, never on the anchors: 0 is the anchors' plain path),
 * `swell` (on every level knot's distance from one), `pairOnHold` (on every
 * pair share), `edge` (on every body knot's distance from one: 0 no accent,
 * the liquid desk, 10-08) and `pressDb` (the low duck a pressed kick asks). Nothing writes a setting yet: the generator
 * plays each at its default, and at the default the arithmetic is the
 * identity (`x × 1`, `g × 1 + 0`), so V is V to the bit. The birds come later.
 */
export type PhraseAnchor = [step: number, home: 'home'] | [step: number, shape: string, index: number];
export interface PhraseRun {
  step: number;
  len: number;
  press?: boolean;
  anchors: PhraseAnchor[];
  pitch: [step: number, semis: number][];
  level: [step: number, gain: number][];
  pair: [step: number, share: number][];
  body?: [step: number, gain: number][];
}
/**
 * **After the kick** (liquid-k10, 10-07): the condition and the gesture, in
 * sixteenths and semitones. The condition, at each bar a run spans: the run
 * sounds from the kick on `step`; its pair share at the snare on `snare` is
 * under `pairUnder` (it does not wobble there); its path stays within `flatSt`
 * of the snare's pitch from the snare to `clearSteps` after it (nothing moves
 * it there already); and it rises no more than `flatSt` over its ends between
 * the kick and the snare (no flick there already). The gesture, a residual
 * over the run's own path: up to `flickSt` over the higher of the note held
 * into the kick (the highest of its sixteenth before) and the snare's, at
 * `peakSteps` after the kick, back down to the path `fallSteps` later; then a straight sag to the start of the run's next
 * travel (or its end) at `sagStPerStep`, at most `sagMaxSt` deep, eased back
 * to the path over that travel. The sag is lifted, never cut, where it would
 * take the line under the register's floor less `underFloorSt`.
 */
export interface AfterKick {
  step: number;
  snare: number;
  pairUnder: number;
  flatSt: number;
  clearSteps: number;
  flickSt: number;
  peakSteps: number;
  fallSteps: number;
  sagStPerStep: number;
  sagMaxSt: number;
  underFloorSt: number;
}
/** The gesture's size as knobs (the liquid desk, 10-08): the flick's height, the sag's rate and its depth. */
export const AFTER_KICK_KNOBS = ['flickSt', 'sagStPerStep', 'sagMaxSt'] as const;
export type AfterKickKnob = typeof AFTER_KICK_KNOBS[number];
/** `afterKick` as the row writes it: the condition and the timing as numbers, the gesture's size as knobs. */
export type AfterKickSpec = Omit<AfterKick, AfterKickKnob> & { knobs: Readonly<Record<AfterKickKnob, ComposerKnob>> };
/** The rule `withAfterKick` plays: the row's numbers, each knob at its setting or its default. */
export function afterKickAt(spec: AfterKickSpec, settings: Partial<Readonly<Record<AfterKickKnob, number>>> = {}): AfterKick {
  const { knobs, ...rule } = spec;
  return { ...rule, flickSt: knobAt(knobs.flickSt, settings.flickSt), sagStPerStep: knobAt(knobs.sagStPerStep, settings.sagStPerStep), sagMaxSt: knobAt(knobs.sagMaxSt, settings.sagMaxSt) };
}
export interface PhraseSpec {
  bars: number;
  knobs: Readonly<Record<PhraseKnob, ComposerKnob>>;
  runs: PhraseRun[];
  afterKick?: AfterKickSpec;
  /**
   * The phrase's level against the place's line, in dB (liquid-riffs-2, 10-08):
   * a riff read off another record sits louder or softer than V's in the same
   * voice, and is brought level by this, on every note it plays (the note's
   * gain). Absent, nought: V's own row states none.
   */
  trimDb?: number;
}

/**
 * **A number the composer reads, declared as a range** (the liquid knobs,
 * 10-07): what it is in (the desk's words, `FieldUnit`), the two ends a
 * setting is held to, and the number it plays at where nothing sets it — V's.
 * A voice's knob is a `KnobSpec` the spell writes; this is the composer's
 * side, read off a recipe row or a place, and no writer reaches it yet.
 */
export interface ComposerKnob {
  /** `st`, semitones, is the composer's own: the desk has no word for it yet */
  unit: 'x' | 'db' | 'ms' | 'ratio' | 'seconds' | 'st';
  min: number;
  max: number;
  default: number;
}
/** The phrase's knobs, exactly: Zephyr's scoop, Tide's swell and pair on the holds, the accents' edge, Ember's press. */
export const PHRASE_KNOBS = ['scoop', 'swell', 'pairOnHold', 'edge', 'pressDb'] as const;
export type PhraseKnob = typeof PHRASE_KNOBS[number];

/** Everything wrong with a table of composer knobs against the names it must declare, as sentences. */
export function composerKnobFaults(table: unknown, names: readonly string[], within: Readonly<Record<string, readonly [number, number]>> = {}): string[] {
  const bad: string[] = [];
  if (!record(table)) return ['knobs is not a table'];
  const have = Object.keys(table);
  if (have.length !== names.length || names.some((n) => !have.includes(n))) bad.push(`knobs are ${have.join(', ')}, where ${names.join(', ')} are declared`);
  for (const name of names) {
    const k = table[name];
    if (!record(k)) { bad.push(`${name} is not a knob`); continue; }
    if (!['x', 'db', 'ms', 'ratio', 'seconds', 'st'].includes(k.unit as string)) bad.push(`${name} is in ${String(k.unit)}, not a unit`);
    if (!finite(k.min) || !finite(k.max) || !(k.min < k.max)) bad.push(`${name} runs from ${String(k.min)} to ${String(k.max)}`);
    else if (!finite(k.default) || k.default < k.min || k.default > k.max) bad.push(`${name} defaults to ${String(k.default)}, outside its ${k.min} to ${k.max}`);
    const bound = within[name];
    if (bound && finite(k.min) && finite(k.max) && (k.min < bound[0] || k.max > bound[1])) bad.push(`${name} reaches past ${bound[0]} to ${bound[1]}`);
  }
  return bad;
}

/** A composer knob's number: a setting held to its range, or its default where nothing sets it. */
export const knobAt = (k: ComposerKnob, setting?: number): number =>
  (typeof setting === 'number' && Number.isFinite(setting) ? Math.max(k.min, Math.min(k.max, setting)) : k.default);

type ShapeNotes = Readonly<Record<string, readonly (readonly unknown[])[]>>;
type MinedNote = readonly [step: number, len: number, semis: number, slide?: 's'];
export interface ResolvedRun {
  step: number;
  len: number;
  press: boolean;
  /** the anchor path: the knot's step and its note's rolled semitones over home (unfolded) */
  anchors: [step: number, semis: number][];
  /** the residual over the anchor path */
  pitch: [step: number, semis: number][];
  level: [step: number, gain: number][];
  pair: [step: number, share: number][];
  body?: [step: number, gain: number][];
}

/** A straight-line path through `[step, value]` knots, held outside them. */
export function pathAt(knots: readonly (readonly [number, number])[], at: number): number {
  if (at <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    if (at > knots[i][0]) continue;
    const [s0, v0] = knots[i - 1], [s1, v1] = knots[i];
    return at === s1 ? v1 : v0 + ((at - s0) / (s1 - s0)) * (v1 - v0);
  }
  return knots[knots.length - 1][1];
}

/**
 * A run's pitch over its anchor path, in semitones over the line's home, at
 * every knot of either — the anchor path and the residual are both straight
 * between their knots, so their sum is straight between the union of them.
 * `scoop` (the phrase's knob) scales the residual alone, so the notes the
 * gestures belong to stay where they are; at one, `r × 1` is `r` to the bit.
 */
export function runPitch(run: Pick<ResolvedRun, 'anchors' | 'pitch'>, scoop = 1): [step: number, semis: number][] {
  const steps = [...new Set([...run.anchors.map(([s]) => s), ...run.pitch.map(([s]) => s)])].sort((a, b) => a - b);
  return steps.map((s) => [s, pathAt(run.anchors, s) + pathAt(run.pitch, s) * scoop]);
}

/**
 * **A bend kept inside its register** (the producer's `bass.register`): a held bass note's pitch path (`bend`, pairs of seconds and
 * semitones over `midi`) with its excursions scaled by where the line stands over the riff's floor. The line's own
 * level at each knot is `lineUnder`'s; the excursion over it keeps its whole depth up to `fullSt` over the floor and narrows to `least` of it
 * by `octaveSt` over, so a note an octave up bends little; and whatever still passes `ceilingSt` over the floor rises
 * at `over` of its distance past it. Falls under the line are left as they are, and so is a path that never leaves
 * the depth it was given: at the floor the path is the one written, to the bit.
 */
export interface BendRoom { fullSt: number; octaveSt: number; least: number; ceilingSt: number; over: number; windowS: number }
/**
 * The line under a bend path's knot `i` (in pairs: the knot at `bend[2i]`): the higher of the lowest the path reaches
 * within `windowS` before it and within `windowS` after it, in semitones over the note (a flick is lower on both sides;
 * a glide into a new note is not, and the note it arrives on is the line).
 */
export function lineUnder(bend: readonly number[], i: number, windowS: number): number {
  const at = (t: number): number => {
    if (t <= bend[0]) return bend[1];
    for (let k = 2; k < bend.length; k += 2) if (t <= bend[k]) { const u = (t - bend[k - 2]) / Math.max(1e-9, bend[k] - bend[k - 2]); return bend[k - 1] + u * (bend[k + 1] - bend[k - 1]); }
    return bend[bend.length - 1];
  };
  const t = bend[2 * i], v = bend[2 * i + 1];
  let left = Math.min(v, at(t - windowS)), right = Math.min(v, at(t + windowS));
  for (let j = 0; j < bend.length; j += 2) {
    if (bend[j] >= t - windowS && bend[j] <= t) left = Math.min(left, bend[j + 1]);
    if (bend[j] >= t && bend[j] <= t + windowS) right = Math.min(right, bend[j + 1]);
  }
  return Math.max(left, right);
}
export function bendInRoom(bend: readonly number[], midi: number, floor: number, R: BendRoom): number[] {
  const n = bend.length >> 1;
  if (n < 2) return [...bend];
  const out: number[] = [];
  for (let i = 0; i < bend.length; i += 2) {
    const t = bend[i], v = bend[i + 1];
    const low = lineUnder(bend, i >> 1, R.windowS), line = midi + low, over = line - floor;
    const depth = over <= R.fullSt ? 1 : over >= R.octaveSt ? R.least : 1 - (1 - R.least) * (over - R.fullSt) / (R.octaveSt - R.fullSt);
    let p = line + (v - low) * depth;
    const cap = floor + R.ceilingSt;
    if (p > cap && p > line) p = Math.max(line, cap + (p - cap) * R.over);
    out.push(t, +(p - midi).toFixed(4));
  }
  // a path the room did not touch is handed back as it was
  return out.every((x, i) => x === bend[i] || Math.abs(x - bend[i]) < 5e-5) ? [...bend] : out;
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate the row once, at load, against the shapes every theme rolls from. */
export function validatePhrase(spec: unknown, shapes: ShapeNotes): asserts spec is PhraseSpec {
  const fail = (message: string): never => { throw new Error(`mined phrase: ${message}`); };
  if (!record(spec) || !finite(spec.bars) || !Number.isInteger(spec.bars) || spec.bars < 1 || spec.bars > 8)
    fail('bars must be an integer from 1 to 8');
  const phrase = spec as Record<string, unknown>;
  // the ends a gesture is held to: a scale never negative, the press a duck and never a lift
  const knobs = composerKnobFaults(phrase.knobs, PHRASE_KNOBS, { scoop: [0, 2], swell: [0, 2], pairOnHold: [0, 2], edge: [0, 4], pressDb: [-24, 0] });
  if (knobs.length) fail(knobs.join('; '));
  const period = (phrase.bars as number) * 16;
  if (!Array.isArray(phrase.runs) || phrase.runs.length === 0) fail('runs must be a nonempty array');
  const runs = phrase.runs as unknown[];
  const intervals: { from: number; to: number }[] = [];
  for (let r = 0; r < runs.length; r++) {
    const item = runs[r];
    if (!record(item)) fail(`run ${r} must be an object`);
    const run = item as Record<string, unknown>;
    if (!finite(run.step) || run.step < 0 || run.step >= period
      || !finite(run.len) || run.len < 0.1 || run.len > 32 || run.step + run.len > period)
      fail(`run ${r} needs a start inside the phrase and a length from 0.1 to 32 steps ending inside it`);
    if (run.press !== undefined && typeof run.press !== 'boolean') fail(`run ${r} press must be true or false`);
    const start = run.step as number, len = run.len as number;
    intervals.push({ from: start, to: start + len });
    // knots from nought to the run's length, each later than the one before
    const knots = (name: string, widths: number[], least: number, value: (k: unknown[], p: number, width: number) => void): void => {
      const list = run[name];
      if (!Array.isArray(list) || list.length < least || list.length > 128) fail(`run ${r} ${name} needs ${least} to 128 knots`);
      let previous = -1;
      (list as unknown[]).forEach((k, p) => {
        if (!Array.isArray(k) || !widths.includes(k.length)) fail(`run ${r} ${name} knot ${p} needs ${widths.join(' or ')} fields`);
        const at = (k as unknown[])[0];
        if (!finite(at) || at <= previous || at > len || (p === 0 && at !== 0) || (p === (list as unknown[]).length - 1 && at !== len))
          fail(`run ${r} ${name} knots must rise from nought to the run's length`);
        previous = at as number;
        value(k as unknown[], p, (k as unknown[]).length);
      });
    };
    knots('anchors', [2, 3], 2, ([, shape, index], p, width) => {
      if (width === 2 ? shape !== 'home'
        : typeof shape !== 'string' || !Object.hasOwn(shapes, shape) || !Array.isArray(shapes[shape])
          || !finite(index) || !Number.isInteger(index) || index < 0 || index >= shapes[shape].length
          || !Array.isArray(shapes[shape][index]) || !finite(shapes[shape][index][2]))
        fail(`run ${r} anchor ${p} must be "home" or name an existing shape note`);
    });
    knots('pitch', [2], 2, ([, semis], p) => {
      if (!finite(semis) || Math.abs(semis) > 24) fail(`run ${r} pitch knot ${p} needs a residual within two octaves`);
    });
    knots('level', [2], 2, ([, gain], p) => { if (!finite(gain) || gain < 0 || gain > 2) fail(`run ${r} level knot ${p} needs a gain from 0 to 2`); });
    knots('pair', [2], 2, ([, share], p) => { if (!finite(share) || share < 0 || share > 2) fail(`run ${r} pair knot ${p} needs a share from 0 to 2`); });
    if (run.body !== undefined) knots('body', [2], 2, ([, gain], p) => { if (!finite(gain) || gain < 0 || gain > 8) fail(`run ${r} body knot ${p} needs a gain from 0 to 8`); });
  }
  if (phrase.afterKick !== undefined) {
    const k = phrase.afterKick;
    const within = (v: unknown, lo: number, hi: number): boolean => finite(v) && v >= lo && v <= hi;
    // the gesture's size as knobs, each range inside the bounds its number had
    const sized = record(k) ? composerKnobFaults(k.knobs, AFTER_KICK_KNOBS, { flickSt: [0, 24], sagStPerStep: [0, 2], sagMaxSt: [0, 4] }) : [];
    if (sized.length) fail(`afterKick ${sized.join('; ')}`);
    const fixed = Object.keys(record(k) ? k : {}).filter((n) => (AFTER_KICK_KNOBS as readonly string[]).includes(n));
    if (fixed.length) fail(`afterKick states ${fixed.join(', ')} as numbers, where they are its knobs`);
    if (!record(k) || !Number.isInteger(k.step) || !Number.isInteger(k.snare) || !within(k.step, 0, 15) || !within(k.snare, 0, 15)
      || (k.snare as number) <= (k.step as number)
      || !within(k.pairUnder, 0, 2) || !within(k.flatSt, 0, 2) || !within(k.clearSteps, 0, 4)
      || !within(k.peakSteps, 0.05, 2) || !within(k.fallSteps, 0.1, 4)
      || (k.peakSteps as number) + (k.fallSteps as number) >= (k.snare as number) - (k.step as number)
      || !within(k.underFloorSt, 0, 2))
      fail('afterKick needs a kick and a later snare step, its condition (pairUnder, flatSt, clearSteps) and its gesture (peakSteps, fallSteps landing before the snare, underFloorSt), each in bounds, and its knobs (flickSt, sagStPerStep, sagMaxSt)');
  }
  if (phrase.trimDb !== undefined && (!finite(phrase.trimDb) || phrase.trimDb < -12 || phrase.trimDb > 12))
    fail('trimDb must be a level from -12 to 12 dB');
  intervals.sort((a, b) => a.from - b.from);
  for (let i = 1; i < intervals.length; i++)
    if (intervals[i].from < intervals[i - 1].to) fail('runs must not overlap');
}

/** The runs that start in this bar of the phrase, on this theme's rolled shapes; a run held across bar lines is emitted once. */
export function minedPhraseRuns(
  spec: PhraseSpec,
  line: { shapes: Readonly<Record<string, readonly MinedNote[]>> },
  inSection: number,
): ResolvedRun[] {
  const bar = ((Math.floor(inSection) % spec.bars) + spec.bars) % spec.bars;
  const start = bar * 16;
  return spec.runs.filter((run) => run.step >= start && run.step < start + 16)
    .sort((a, b) => a.step - b.step)
    .map((run) => ({
      step: run.step - start,
      len: run.len,
      press: run.press === true,
      anchors: run.anchors.map((a): [number, number] => [a[0], a.length === 2 ? 0 : line.shapes[a[1]][a[2]][2]]),
      pitch: run.pitch.map(([step, semis]): [number, number] => [step, semis]),
      level: run.level.map(([step, gain]): [number, number] => [step, gain]),
      pair: run.pair.map(([step, share]): [number, number] => [step, share]),
      ...(run.body ? { body: run.body.map(([step, gain]): [number, number] => [step, gain]) } : {}),
    }));
}

/**
 * A run with the phrase's `afterKick` gesture added to its residual wherever
 * its condition holds (see `AfterKick`). `run.step` is the run's step in its
 * bar; `lowest` is the lowest the line may sound, in semitones over the
 * line's home (the frame `runPitch` writes in). Every value is a straight line
 * between knots, as the rest of the run is, so the floor is held exactly by
 * holding it at the knots.
 */
export function withAfterKick(run: ResolvedRun, rule: AfterKick, lowest: number): ResolvedRun {
  const path = runPitch(run);
  const at = (s: number): number => pathAt(path, s);
  const steps = (from: number, to: number): number[] => [from, to, ...path.map(([s]) => s).filter((s) => s > from && s < to)];
  type Piece = [step: number, semis: number][];
  const pieces: Piece[] = [];
  for (let bar = 0; bar * 16 < run.step + run.len; bar++) {
    const kick = bar * 16 + rule.step - run.step, snare = bar * 16 + rule.snare - run.step;
    if (kick < 0 || snare >= run.len) continue;
    if (pathAt(run.pair, snare) >= rule.pairUnder) continue;
    const held = at(snare), clear = Math.min(snare + rule.clearSteps, run.len);
    if (steps(snare, clear).some((s) => Math.abs(at(s) - held) > rule.flatSt)) continue;
    const top = Math.max(at(kick), held);
    if (steps(kick, snare).some((s) => at(s) - top > rule.flatSt)) continue;
    // the sag: from the flick's landing to the start of the run's next travel after the snare, then back over it
    const land = kick + rule.peakSteps + rule.fallSteps;
    const a = run.anchors;
    const travel = a.findIndex(([s, v], i) => s >= snare && i + 1 < a.length && a[i + 1][1] !== v);
    // a run held into the next bar eases back before that bar's kick, so each bar's gesture starts from the path
    const next = kick + 16;
    let sagEnd = travel >= 0 ? a[travel][0] : run.len, back = travel >= 0 ? a[travel + 1][0] : run.len;
    if (back > next) { sagEnd = Math.min(sagEnd, next - 1); back = next; }
    const depth = Math.min(rule.sagStPerStep * (sagEnd - land), rule.sagMaxSt);
    const sag = (s: number): number => (s <= land ? 0 : s <= sagEnd ? -depth * (s - land) / (sagEnd - land)
      : back > sagEnd ? -depth * (back - s) / (back - sagEnd) : -depth);
    // lift the sag where the line would go under the floor, never past its own depth. The line is the path plus the
    // piece below, straight between the path's knots, the landing, the sag's bottom and the taper's end, so the floor
    // is held at those: down to the bottom the piece is the sag lifted; over the taper it carries (lift − depth) down
    // to nought at its end, so a lift there counts by the share of the taper still to run
    const need = (s: number): number => {
      if (s <= sagEnd) return lowest - (at(s) + sag(s));
      const share = (back - s) / (back - sagEnd);
      return share > 0 ? depth + (lowest - at(s)) / share : 0;
    };
    const lift = Math.min(depth, Math.max(0, ...[...steps(land, back), sagEnd].map(need)));
    // the flick's top: flickSt over the higher of the note held into the kick (its sixteenth before) and the snare's
    const over = Math.max(held, ...steps(Math.max(0, kick - 1), kick).map(at));
    const peak = kick + rule.peakSteps;
    const piece: Piece = [[kick, 0], [peak, over + rule.flickSt - at(peak)], [land, lift], [sagEnd, lift - depth]];
    if (back > sagEnd) piece.push([back, 0]);
    pieces.push(piece);
  }
  if (!pieces.length) return run;
  const extra = (s: number): number => pieces.reduce((sum, p) => sum + (s < p[0][0] || s > p[p.length - 1][0] ? 0 : pathAt(p, s)), 0);
  const knots = [...new Set([...run.pitch.map(([s]) => s), ...pieces.flat().map(([s]) => s)])].sort((x, y) => x - y);
  return { ...run, pitch: knots.map((s): [number, number] => [s, pathAt(run.pitch, s) + extra(s)]) };
}
