// Draw compatible musical components from a style's catalogue. No recipe
// interpreter, bird names, named family or taste constants belong here.
import type { Style } from '@deep-house/engine/style';
import { biasFor, type Bias } from './spell.ts';
import type { CompositionPolicy, Conditions, ControlValue, PartUsage, PartPin, Scene, ScenePolicy, Texture, TextureBed, TexturePolicy } from './composition-policy.ts';
import { resolveParts } from './parts/resolve.ts';
import { emptyParts, type MusicalParts, type PartRequest } from './parts/types.ts';
import { charactersOf, type SoundCharacters } from './parts/sound.ts';
import { placementProblems, type RecipeSource } from './recipe-placement.ts';
import Rng, { type Seed } from './rng.ts';

export interface Composition {
  parts: MusicalParts;
  trace: { version: string; selected: Record<string, string>; usage: PartUsage;
    pinned?: { id: string; role: string; revision?: number };
    recipes?: Array<RecipeSource & { family: string }>;
    context?: { grammar: string; beatsPerBar: number; bpm: number; kit: string; drums: boolean };
    support?: { figure: { sustained: 'separate'; clearanceBeats: number }; reservedBars: number[] };
    /** the composition's texture and the things in it that hold (`textureOf`) */
    texture?: { is: Texture; held: string[] };
    /** the theme's one foreground (`ScenePolicy`): `air` on an airy texture */
    scene?: Scene;
    skipped: Array<{ family: string; reason: string }> };
}
/** Which logical roles a candidate writes, including their treatment. */
export function partRoles(request: PartRequest): Set<string> {
  return new Set([
    ...(request.bassMotif || request.heldBass ? ['bassline'] : []),
    ...(request.struckFigures?.length ? ['figure'] : []),
    ...(request.texture ? ['texture'] : []),
    ...Object.keys(request.rhythm || {}), ...Object.keys(request.tone || {}),
    ...Object.keys(request.ambience || {}), ...Object.keys(request.presence || {}),
  ]);
}
const valueOf = (v: ControlValue, bias: Bias): number => {
  const result = typeof v === 'number' ? v : bias.controls?.[v];
  if (!Number.isFinite(result)) throw new Error(`composition: undeclared or nonfinite control ${v}`);
  return result!;
};
/**
 * **The texture of a composition**: air, or sustained. It counts the things
 * in it that hold — the words and thresholds are `TexturePolicy`'s — out of
 * the request (or the parts it resolved to) and the properties the timbre
 * dice declare. A bed absent (a tool asking the catalogue alone) is a bed
 * that says nothing.
 */
type Holding = Pick<PartRequest, 'heldBass' | 'struckFigures' | 'tone'> & { bassMotif?: PartRequest['bassMotif'] | null };
export function textureOf(request: Holding, bed: TextureBed | undefined, policy: TexturePolicy): { is: Texture; held: string[] } {
  const held = [
    ...(request.heldBass || (request.bassMotif && policy.droneContours.includes(request.bassMotif.contour)) ? ['drone'] : []),
    ...(request.tone?.bassline && policy.heldBodies.includes(request.tone.bassline) ? ['body'] : []),
    ...(bed && bed.bedHold >= policy.bedHold ? ['bed'] : []),
    ...(bed?.leadHolds ? ['lead'] : []),
    ...(request.struckFigures?.some(f => (f.duration?.beats[0] ?? 0) >= policy.heldBeats) ? ['chords'] : []),
  ];
  return { is: held.length >= policy.sustainedFrom ? 'sustained' : 'air', held };
}
const traceOfDice = (dice: Readonly<Record<string, unknown>>): Composition['trace'] | undefined =>
  typeof dice.composition === 'string' ? JSON.parse(dice.composition) as Composition['trace'] : undefined;
/** The texture a planned theme's composition read, off its dice; none where it read none. */
export const textureOfDice = (dice: Readonly<Record<string, unknown>>): Texture | undefined => traceOfDice(dice)?.texture?.is;
/** The scene a planned theme's composition drew, off its dice; none where it drew none. */
export const sceneOfDice = (dice: Readonly<Record<string, unknown>>): Scene | undefined => traceOfDice(dice)?.scene;
/**
 * **The real-world class** (`ScenePolicy.realWorld`): what a drone in front
 * does not stand beside. It is a *pace* and not an instrument (Eugene, 09-22,
 * of an unmetered track at 50 bpm: a marimba stab and a bell every eight bars
 * "become Buddhist-bowl-like tones that go well on endless synth drones"). A
 * part is in it when all of these hold:
 *
 *   - there is a grid: with the drums off nothing struck is withdrawn at all,
 *     since at that pace every struck tone is a bowl;
 *   - it arrives as a hit (`struck`) and is gone before `holdBelow` of the bar;
 *   - and, for a tone, its onsets come closer than `sparseSeconds` (the median
 *     gap, at the theme's tempo) and what it holds of each note does not
 *     bridge `ringCovers` of that gap. A hit with no pitch (a drum, a shaker)
 *     is in the class at any pace: a bowl is a tone, and a bongo once a bar is
 *     still a bongo.
 *
 * Properties and a plan only: never a list of names. The same marimba is a
 * bowl at 50 bpm on a two-bar cycle and a clatter in sixteenths at 104.
 */
export interface Pace {
  /** does it arrive as a hit */
  struck: boolean;
  /** is it a tone (it follows the harmony) rather than a drum or a noise */
  pitched: boolean;
  /** the longest hold its instrument may have, as a fraction of the bar; unknown is short */
  hold?: number;
  /** the median gap between its onsets, in seconds */
  gap: number;
  /** how long each note is held, in seconds */
  ring: number;
}
export interface SceneContext { policy: ScenePolicy; bpm: number; drumsOn: boolean; characters?: SoundCharacters }
export function realWorld(pace: Pace, ctx: SceneContext): boolean {
  const r = ctx.policy.realWorld;
  return ctx.drumsOn && pace.struck && !(pace.hold !== undefined && pace.hold >= r.holdBelow)
    && (!pace.pitched || pace.gap < r.sparseSeconds && pace.ring < r.ringCovers * pace.gap);
}
/** The median of the gaps between onsets on a cycle of `cycle` steps, in steps. */
export function medianGapSteps(steps: readonly number[], cycle: number): number {
  const on = [...new Set(steps)].sort((a, b) => a - b);
  if (!on.length) return Infinity;
  const gaps = on.map((s, i) => (i + 1 < on.length ? on[i + 1] : on[0] + cycle) - s).sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}
/**
 * The paces a request asks for, off its own numbers: a pitched figure's notes a
 * bar and its declared duration (else the struck note the style's player
 * writes, `characters.figure.struck`), a pulse's cycle and duration, a rhythm
 * cell's own steps.
 */
export function pacesOf(request: PartRequest, bpm: number, characters?: SoundCharacters): Pace[] {
  const beat = 60 / bpm, bar = 4 * beat, step = beat / 4;
  const struckRing = (gap: number) => {
    const s = characters?.figure.struck;
    return s ? Math.max(s.floor, Math.min(s.ceiling, s.share * gap)) : 0;
  };
  return [
    ...(request.struckFigures || []).map((f): Pace => {
      const gap = bar / Math.max(...f.motif.density);
      return { struck: f.properties?.struck === true, pitched: true, hold: f.properties?.holdMax, gap,
        ring: f.duration ? Math.min(...f.duration.beats) * beat : struckRing(gap) };
    }),
    ...(request.texture ? [{ struck: request.texture.properties?.struck === true, pitched: true, hold: request.texture.properties?.holdMax,
      gap: Math.min(...request.texture.spacing.bars) * bar, ring: Math.min(...request.texture.duration.beats) * beat }] : []),
    ...Object.values(request.rhythm || {}).flatMap(cells => (cells || []).map((c): Pace => ({
      struck: c.properties?.struck === true, pitched: false, hold: c.properties?.holdMax,
      gap: medianGapSteps(c.steps, c.bars * 16) * step, ring: 0 }))),
  ];
}
/** Whether a request asks for any part of the real-world class at this pace. */
export const asksRealWorld = (request: PartRequest, ctx: SceneContext): boolean =>
  pacesOf(request, ctx.bpm, ctx.characters).some(p => realWorld(p, ctx));
export function permitted(when: Conditions | undefined, bias: Bias, density: string, bpm: number): boolean {
  return !when || (when.drums === undefined || when.drums === bias.derived.drumsOn)
    && (when.bpm?.above === undefined || bpm > when.bpm.above)
    && (when.bpm?.atMost === undefined || bpm <= when.bpm.atMost)
    && (!when.kits || when.kits.includes(bias.derived.kit))
    && (!when.densities || when.densities.includes(density))
    && Object.entries(when.controls || {}).every(([key, span]) => {
      const n = valueOf(key, bias);
      return (span.min === undefined || n >= span.min) && (span.max === undefined || n < span.max);
    });
}
function combine(a: PartRequest, b: PartRequest): PartRequest {
  for (const key of ['bassMotif', 'texture', 'heldBass', 'pedalHarmony'] as const) {
    if (a[key] !== undefined && b[key] !== undefined) throw new Error(`part conflict: ${key} already occupied`);
  }
  const out = { ...a, ...b };
  if (a.struckFigures || b.struckFigures) out.struckFigures = [...a.struckFigures || [], ...b.struckFigures || []];
  for (const key of ['rhythm', 'tone', 'ambience', 'presence'] as const) {
    if (!a[key] && !b[key]) continue;
    for (const role of Object.keys(b[key] || {})) if (Object.hasOwn(a[key] || {}, role)) throw new Error(`part conflict: ${key}.${role} already occupied`);
    Object.assign(out, { [key]: { ...a[key], ...b[key] } });
  }
  return out;
}
/** Arrangement occupancy, not measured DSP cost; derived from resolved parts. */
export function partUsage(parts: MusicalParts, style: Style): PartUsage {
  const names = new Set<string>(), sounds = charactersOf(style);
  const sends = [...Object.values(parts.ambience).map(name => sounds?.ambience[name]),
    ...(parts.texture ? [sounds?.pulse.space[parts.texture.ambience]] : [])];
  for (const send of sends) for (const name of ['background', 'immersed']) if (send?.[name as keyof typeof send]) names.add(name);
  return { upperParts: parts.struckFigures.length + Number(!!parts.texture),
    sparseUpper: parts.struckFigures.filter(p => p.behavior !== 'ostinato').length + Number(!!parts.texture),
    rhythmParts: parts.rhythm.length, spatialReturns: names.size };
}
const sourceFits = (source: RecipeSource, policy: CompositionPolicy, bias: Bias): boolean =>
  source.grammar === policy.placement?.grammar && source.beatsPerBar === policy.placement?.beatsPerBar
  && (source.drums === undefined || source.drums === bias.derived.drumsOn)
  && (!source.kits || source.kits.includes(bias.derived.kit));
function validateSource(source: RecipeSource, request: PartRequest): void {
  const {id, revision, ...placement} = source;
  if (!id || !Number.isSafeInteger(revision) || revision < 1 || placementProblems(placement).length) throw new Error('composition: invalid recipe source');
  const roles = partRoles(request);
  if (roles.size !== source.roles.length || source.roles.some(role=>!roles.has(role)))
    throw new Error('composition: recipe claims do not match the roles it writes');
}
const checked = new WeakSet<object>();
function validatePolicy(policy: CompositionPolicy, bias: Bias): void {
  if (checked.has(policy)) return;
  if (policy.placement && (!policy.placement.grammar || policy.placement.beatsPerBar !== 4))
    throw new Error('composition: the current player requires a named four-beat placement grammar');
  const resources = ['upperParts', 'sparseUpper', 'rhythmParts', 'spatialReturns'] as const;
  for (const name of resources) if (!Number.isInteger(policy.limits[name]) || policy.limits[name] < 0) throw new Error(`composition: invalid ${name} limit`);
  for (const name of Object.keys(policy.limits)) if (!resources.includes(name as typeof resources[number])) throw new Error(`composition: unknown resource ${name}`);
  if (policy.prefer !== undefined && (!Number.isFinite(policy.prefer) || policy.prefer < 1)) throw new Error('composition: a preference lean is a finite number of at least 1');
  const seen = new Set<string>();
  const t = policy.texture;
  if (t && (!Number.isInteger(t.sustainedFrom) || t.sustainedFrom < 1 || !(t.bedHold > 0 && t.bedHold <= 1)
    || !(t.heldBeats > 0) || !Array.isArray(t.droneContours) || !Array.isArray(t.heldBodies)))
    throw new Error('composition: invalid texture policy');
  const sc = policy.scene;
  if (sc && (!t || !(sc.realWorld?.holdBelow > 0 && sc.realWorld.holdBelow <= 1)
    || !(sc.realWorld.sparseSeconds > 0) || !(sc.realWorld.ringCovers > 0 && sc.realWorld.ringCovers <= 1)))
    throw new Error('composition: a scene needs a texture policy and a real-world pace (hold line and ring share inside (0, 1], a positive gap)');
  if (sc) valueOf(sc.forward, bias);
  if (sc?.always && (!Array.isArray(sc.always) || sc.always.some(set => !Array.isArray(set) || !set.length || set.some(w => typeof w !== 'string'))))
    throw new Error('composition: a scene\'s always-forward sets are non-empty lists of held words');
  const validateWhen = (when: Conditions | undefined) => {
    if (when?.bpm && (Object.values(when.bpm).some(v => !Number.isFinite(v) || v <= 0)
      || (when.bpm.above !== undefined && when.bpm.atMost !== undefined && when.bpm.above >= when.bpm.atMost)))
      throw new Error('composition: invalid bpm condition');
    for (const [name, span] of Object.entries(when?.controls || {})) {
      valueOf(name, bias);
      if (Object.values(span).some(v => !Number.isFinite(v)) || (span.min !== undefined && span.max !== undefined && span.min >= span.max)) throw new Error(`composition: invalid condition ${name}`);
    }
  };
  for (const family of policy.families) {
    if (!family.id || seen.has(family.id)) throw new Error(`composition: duplicate/empty family ${family.id}`);
    if ([...family.requires || [], ...family.excludes || []].some(id => !seen.has(id))) throw new Error(`composition: dependency must precede ${family.id}`);
    seen.add(family.id); valueOf(family.chance, bias); validateWhen(family.when);
    const variants = new Set<string>();
    if (!family.variants.length) throw new Error(`composition: empty family ${family.id}`);
    for (const variant of family.variants) {
      if (!variant.id || variants.has(variant.id)) throw new Error(`composition: duplicate/empty variant ${family.id}`);
      variants.add(variant.id); valueOf(variant.weight, bias); validateWhen(variant.when);
      if (variant.source) validateSource(variant.source, variant.request);
    }
  }
  checked.add(policy);
}
/**
 * A style's composition data, checked once where the strategy table loads it:
 * the families, their conditions and controls, and the sound characters they
 * name. A malformed entry throws with its name instead of turning into a traced
 * skip on every theme that reaches it. Controls are style constants, so the
 * house bias is enough to ask whether a named control exists.
 */
export function validateStyle(style: Style): void {
  charactersOf(style);
  const policy = (style as Style & { composition?: CompositionPolicy }).composition;
  if (policy) validatePolicy(policy, biasFor(null, style));
}
/**
 * Draw the style's families for one theme.
 *
 * `bed` is what the timbre dice say about the harmonic layer, for the texture
 * (`textureOf`); the generator passes it and a tool asking the catalogue alone
 * need not.
 *
 * **One foreground.** Where the style has a texture and a scene policy, the
 * families are drawn once as the palette has them and the texture is read off
 * that draw. An airy theme's scene is `air` and that draw is the theme. A
 * sustained theme draws its scene off a stream of its own
 * (`<seed>::scene:<version>`, one number, so no other stream moves):
 *
 *   drone-back     the same draw, with the sustained role at the background
 *                  presence (the treatment the ringing keys already ask for,
 *                  nine decibels under). Everything an airy theme may carry.
 *   drone-forward  the families drawn again off the same per-family streams,
 *                  with every variant that asks for an instrument of the
 *                  real-world class skipped (`asksRealWorld`) — a drum or a
 *                  shaker at any pace, a tone only where it comes round faster
 *                  than `sparseSeconds` and does not ring through the gap: the
 *                  hand rows, and the struck figures and ornaments that fast.
 *                  The pulse (a hit every four to eight bars) and the ringing
 *                  keys (each note held for its whole gap) never meet that
 *                  pace, so the rule as written never withdraws them (R39 of
 *                  the review of 09-24). The ringing keys stay, and over a grid
 *                  the background presence they ask for the pad is cleared:
 *                  the drone in front is in front (R6, Eugene's answer to
 *                  question 3). What is left is drawn exactly as before; a
 *                  family that only follows a withdrawn one goes with it, and
 *                  a family the palette's own draw left out stays out.
 *
 * A pin is explicit and always plays, so a pinned theme on a sustained
 * texture is drone-back whatever its number said: the pad sits under what the
 * listener asked for (`?recipe=house/hand-conversation&accompaniment=auto`).
 * The number is drawn anyway, so a pin moves no stream.
 */
export function composeParts(style: Style, seed: Seed, bias: Bias, density: string, bpm: number, pin?: PartPin, bed?: TextureBed): Composition | null {
  const policy = (style as Style & { composition?: CompositionPolicy }).composition;
  if (!policy) {
    if (pin) throw new Error('composition: this style has no accompaniment policy');
    return null;
  }
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('composition: invalid planned bpm');
  validatePolicy(policy, bias);
  const usageOf = (p: MusicalParts): PartUsage => {
    const usage = partUsage(p, style);
    for (const key of Object.keys(pin?.usage || {}) as Array<keyof PartUsage>) usage[key] += pin!.usage![key]!;
    return usage;
  };
  const overBudget = (usage: PartUsage) => (Object.keys(usage) as Array<keyof PartUsage>).some(key => usage[key] > policy.limits[key]);
  let start: { request: PartRequest; parts: MusicalParts } = { request: {}, parts: emptyParts() };
  if (pin) {
    if (pin.source) {
      validateSource(pin.source, pin.request);
      if (!sourceFits(pin.source, policy, bias)) throw new Error('composition: pinned recipe requires a different placement context');
    }
    if (!policy.placement || !permitted(policy.placement.pinWhen, bias, density, bpm))
      throw new Error(`composition: pinned part ${pin.id} is outside this style's supported placement context`);
    if (!pin.id || !style.lanes.some(l => l.role === pin.role)) throw new Error('composition: pinned part has no logical role');
    if ([...partRoles(pin.request)].some(role => role !== pin.role) || pin.request.pedalHarmony !== undefined)
      throw new Error('composition: pinned part writes outside its role');
    if (Object.values(pin.usage || {}).some(n => !Number.isInteger(n) || n! < 0) || Object.keys(pin.usage || {}).some(k => !(k in policy.limits)))
      throw new Error('composition: invalid pinned part usage');
    const resolved = resolveParts(pin.request, style, [], 'composition');
    if (resolved.errors.length) throw new Error(`composition: ${resolved.errors.join('; ')}`);
    start = { request: structuredClone(pin.request), parts: resolved.parts };
    if (overBudget(usageOf(start.parts))) throw new Error('composition: pinned part exceeds the arrangement budget');
  }
  // One pass over the families. `withdrawn` is the drone in front: a variant
  // that asks for the real-world class is not a candidate, and a family left
  // with none is skipped for the scene.
  //
  // `first` is the palette's own draw, where this is the redraw under the drone
  // in front: the redraw only ever takes away (R35 of the review of 09-24). A
  // family the first draw left out stays out, for the reason it was left out,
  // though the withdrawn family that excluded it or took its budget is gone —
  // dropping the figure used to open the door to the ringing keys. It is asked
  // last, where the family would otherwise be picked, so every family the
  // redraw left out anyway is traced as it always was.
  type Drawn = { selected: Record<string, string>; skipped: Composition['trace']['skipped'] };
  const draw = (withdrawn: SceneContext | null, first?: Drawn) => {
    const selected: Record<string, string> = {}, skipped: Composition['trace']['skipped'] = [];
    const recipes: NonNullable<Composition['trace']['recipes']> = [];
    let request: PartRequest = start.request, parts = start.parts;
    for (const family of policy.families) {
      const skip = (reason: string) => skipped.push({ family: family.id, reason });
      if (!permitted(family.when, bias, density, bpm)) { skip('compatibility'); continue; }
      if (family.requires?.some(id => !selected[id]) || family.excludes?.some(id => selected[id])) { skip('compatibility'); continue; }
      if (withdrawn && family.variants.every(v => asksRealWorld(v.request, withdrawn))) { skip('scene'); continue; }
      const rng = new Rng(`${seed}::parts:${policy.version}:${family.id}`);
      if (!rng.chance(Math.max(0, Math.min(1, valueOf(family.chance, bias))))) { skip('chance'); continue; }
      const candidates: Array<{ v: { id: string; request: PartRequest; parts: MusicalParts; source?: RecipeSource }; w: number }> = [];
      const rejected: string[] = [];
      for (const variant of family.variants) {
        if (!permitted(variant.when, bias, density, bpm)) continue;
        if (withdrawn && asksRealWorld(variant.request, withdrawn)) { rejected.push('scene'); continue; }
        if (pin && partRoles(variant.request).has(pin.role)) { rejected.push(`reserved role ${pin.role}: ${pin.id}`); continue; }
        if (variant.source && !sourceFits(variant.source, policy, bias)) { rejected.push(`recipe placement: ${variant.source.id}`); continue; }
        const roles = partRoles(variant.request);
        if (recipes.some(r=>r.roles.some(role=>roles.has(role)))
          || variant.source?.roles.some(role=>partRoles(request).has(role))) {
          rejected.push('reserved recipe role'); continue;
        }
        const weight = valueOf(variant.weight, bias);
        if (weight < 0) throw new Error(`composition: negative weight ${family.id}/${variant.id}`);
        if (!weight) continue;
        let merged: PartRequest;
        try { merged = combine(request, variant.request); }
        catch (e) { rejected.push((e as Error).message); continue; }
        const resolved = resolveParts(merged, style, [], 'composition');
        if (resolved.errors.length) { rejected.push(...resolved.errors); continue; }
        const usage = usageOf(resolved.parts);
        if (overBudget(usage)) { rejected.push('part budget'); continue; }
        candidates.push({ v: { id: variant.id, request: merged, parts: resolved.parts, source: variant.source }, w: weight });
      }
      if (!candidates.length) { skip([...new Set(rejected)].join('; ') || 'no eligible variant'); continue; }
      if (first && !first.selected[family.id]) { skip(first.skipped.find(s => s.family === family.id)?.reason ?? 'compatibility'); continue; }
      const picked = rng.weighted(candidates);
      selected[family.id] = picked.id; request = picked.request; parts = picked.parts;
      if (picked.source) recipes.push({ ...picked.source, family: family.id });
    }
    return { selected, skipped, recipes, request, parts };
  };
  const whole = draw(null);
  const texture = policy.texture ? textureOf(whole.request, bed, policy.texture) : undefined;
  let scene: Scene | undefined;
  if (texture && policy.scene) {
    const forward = new Rng(`${seed}::scene:${policy.version}`).chance(Math.max(0, Math.min(1, valueOf(policy.scene.forward, bias))));
    // With no grid there is nothing for a drone to sit behind: it is the
    // foreground, and at that pace nothing struck is withdrawn beside it.
    // A held set the style names as the endless drone (`ScenePolicy.always`)
    // is in front whatever the coin said: the number is drawn anyway, so no
    // other stream moves, and a pin still puts it behind.
    const endless = (policy.scene.always || []).some(set => set.every(word => texture.held.includes(word)));
    scene = texture.is === 'air' ? 'air' : !bias.derived.drumsOn || ((forward || endless) && !pin) ? 'drone-forward' : 'drone-back';
  }
  const drawn = scene === 'drone-forward'
    ? draw({ policy: policy.scene!, bpm, drumsOn: bias.derived.drumsOn, characters: charactersOf(style) }, whole) : whole;
  const { selected, skipped, recipes } = drawn;
  // The drone behind: the sustained role at the background presence, over
  // whatever the draw or the pin asked of it.
  //
  // The drone in front of a grid: the sustained role is the foreground, so no
  // family puts it at the background presence — the ringing keys' variants ask
  // for exactly that, and under a coin or the endless set they played the
  // drone nine decibels back, `drone + body` included, which is the set on
  // record as always in front (R6 of the review of 09-24, Eugene's answer to
  // question 3: 15 of 63 forward themes at the house, theme 0). With no grid
  // the scene is in front because there is nothing for a drone to sit behind,
  // not because a coin put it there, and the ringing keys' own presence stands:
  // that is the benchmark, 27191 at its spell, whose first two themes are the
  // bells over a pad kept under them.
  const cleared = scene === 'drone-forward' && bias.derived.drumsOn && drawn.parts.presence.sustained === 'background';
  const { sustained: _behind, ...inFront } = drawn.parts.presence;
  const parts = scene === 'drone-back' ? { ...drawn.parts, presence: { ...drawn.parts.presence, sustained: 'background' as const } }
    : cleared ? { ...drawn.parts, presence: inFront } : drawn.parts;
  // A recipe's cells play off streams keyed by the recipe's identity, whether
  // it was pinned or drawn by the catalogue, so the two are one performance:
  // the same instrument draw, the same feel and the same velocities (the
  // composition review of 09-22, #6). The key keeps the spelling the approved
  // pinned performances were heard under. Generated cells keep theirs.
  const owners = [...(pin ? [{ id: pin.id, roles: [pin.role] }] : []), ...recipes];
  for (const row of parts.rhythm) {
    const owner = owners.find(o => o.roles.includes(row.lane.role));
    if (owner) row.lane.id = row.lane.id.replace('composition:', `pin:${owner.id}:`);
  }
  return { parts, trace: { version: policy.version, selected, skipped, usage: usageOf(parts),
    ...(recipes.length ? { recipes } : {}),
    ...(pin ? { pinned: { id: pin.id, role: pin.role, ...(pin.source ? {revision:pin.source.revision} : {}) }, context: { grammar: policy.placement!.grammar, beatsPerBar: policy.placement!.beatsPerBar,
      bpm, kit: bias.derived.kit, drums: bias.derived.drumsOn } } : {}),
    ...(texture ? { texture } : {}),
    ...(scene ? { scene } : {}),
  } };
}
