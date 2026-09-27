// Requested percussion cells: the recipe rhythm player, the kick's pickup at a
// bridge's end and the gates the percussion development opens bar by bar.
// Split out of generator.ts in the composer fix round of 09-22 without moving
// an event; the development phase is worked out once per bar, where the three
// readers each asked for it with the same arguments before.
import type { Lane } from '@deep-house/engine/style';
import type { Settings } from '@deep-house/engine/settings';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import { dbToGain } from '@deep-house/engine/dsp';
import Rng from '../rng.ts';
import type { Seed } from '../rng.ts';
import { layerOf } from '../lanes.ts';
import { STEPS_PER_BAR } from '../motif.ts';
import type { makeArrangement } from '../arrangement.ts';
import { layersAtBar } from '../arrangement.ts';
import { rhythmCell, rhythmPhaseAt, rhythmPickup, type RhythmDevelopmentPolicy, type prepareRhythmDevelopment } from '../development-rhythm.ts';
import type { ShapePolicy, ShapeTrace } from '../development-shape.ts';
import type { RhythmLane } from './rhythm.ts';
import type { SoundCharacters } from './sound.ts';
import type { PartPin } from '../composition-policy.ts';
import type { RecipeSource } from '../recipe-placement.ts';
import * as P from '../patterns.ts';
import type { BarContext, EventMeta, FigureSource } from '../generator.ts';

export interface RhythmPerformer {
  seed: Seed;
  S: Settings;
  rhythm: readonly RhythmLane[];
  rhythmMotion: ReturnType<typeof prepareRhythmDevelopment> | null;
  rhythmPolicy: RhythmDevelopmentPolicy | null;
  contourPolicy: ShapePolicy | null;
  trace: ShapeTrace | null;
  arrangement: ReturnType<typeof makeArrangement>;
  silent: readonly string[];
  at: (bar: number, step: number) => number;
  beat: number;
  barSeconds: number;
  laneOn: (lane: Lane, layers: Record<string, boolean | undefined>) => boolean;
  voiceOf: (lane: Lane) => string;
  trimOf: (lane: Lane, voice: string) => Record<string, number>;
  push: (voice: string, t: number, p: NoteParams, meta: EventMeta) => void;
  characters: SoundCharacters | undefined;
  pinned: PartPin | null;
  selectedRecipeFor: (role: string) => (RecipeSource & { family: string }) | undefined;
}

/**
 * One bar's percussion development: its phase, the pickups due at the end of a
 * rest, and the section's gates with the ones the development opens added.
 */
export function rhythmGates({ rhythm, rhythmMotion, rhythmPolicy, contourPolicy, trace, arrangement, silent }: RhythmPerformer,
  bar: number, originalLayers: Record<string, boolean>) {
  const phase = rhythmMotion ? rhythmPhaseAt(arrangement,trace!,bar,rhythmPolicy!,contourPolicy!.grooveKind,contourPolicy!.restKind) : null;
  const rhythmPickups: NonNullable<BarContext['rhythmPickups']> = new Map();
  if (rhythmPolicy) for (const {lane,part} of rhythm) {
    if (lane.gate && silent.includes(lane.gate)) continue;
    const pickup=rhythmPickup(part,arrangement,bar,contourPolicy!.restKind,contourPolicy!.grooveKind);
    if (pickup) rhythmPickups.set(lane.id,pickup);
  }
  const opened = phase ? rhythmMotion!.gates.filter(g=>!silent.includes(g)) : [];
  opened.push(...rhythm.filter(r=>rhythmPickups.has(r.lane.id)).flatMap(r=>r.lane.gate?[r.lane.gate]:[]));
  const layers = opened.length ? {...originalLayers,...Object.fromEntries(opened.map(g=>[g,true]))} : originalLayers;
  return { phase, rhythmPickups, layers };
}

/** The kick's own pickup in the last bar of a shaped rest, or null for the ordinary figure. */
export function kickPickupHits({ rhythmMotion, rhythmPolicy, pinned }: RhythmPerformer, c: BarContext):
  Array<{ step: number; vel: number }> | null {
  const pickup = rhythmMotion && pinned?.role !== 'kick' && c.rhythmPhase === 'pickup';
  return pickup ? rhythmPolicy!.kickPickup.steps.map((step,i)=>({step,vel:rhythmPolicy!.kickPickup.accents[i]})) : null;
}

/** A requested part replaces its role's mask, keeping its gate and palette. */
export function recipeRhythmSource({ seed, S, rhythm, rhythmMotion, rhythmPolicy, arrangement, at, beat, barSeconds,
  laneOn, voiceOf, trimOf, push, characters, pinned, selectedRecipeFor }: RhythmPerformer): FigureSource {
  return (g, c) => {
    for (const lane of g.lanes) {
      if (!laneOn(lane, c.layers)) continue;
      const moving = rhythmMotion?.parts.get(lane.id);
      const pickup = c.rhythmPickups?.get(lane.id);
      // Opening one requested player's pickup must not wake another player
      // sharing its role gate (for example the continuous shaker).
      if (!moving && !pickup && !laneOn(lane,layersAtBar(arrangement,c.bar).layers)) continue;
      // The bar's phase, worked out once for the bar (`rhythmGates`).
      const phase = moving ? c.rhythmPhase ?? null : null;
      if(moving&&!phase)continue;
      const part = pickup?.part ?? (moving ? rhythmCell(moving,phase!,seed,c.section.index,
        Math.floor((c.bar-c.section.startBar)/rhythmPolicy!.phraseBars)) : rhythm.find(r => r.lane.id === lane.id)!.part);
      const offset = pickup?.offset ?? (c.bar % part.bars) * STEPS_PER_BAR;
      const r = new Rng(`${seed}::${lane.id}:${c.bar}`);
      const voice = voiceOf(lane);
      if (lane.role === 'kick' && !c.kickThisBar) continue;
      const character = part.character === undefined ? undefined : characters?.rhythm?.[part.character];
      const trim = trimOf(lane, voice);
      part.steps.forEach((s, i) => {
        if (s < offset || s >= offset + STEPS_PER_BAR) return;
        const step = s - offset;
        const sound = part.strokes ? character!.strokes![part.strokes[i]] : character;
        const feel = part.feel;
        const human = feel ? new Rng(`${seed}::${lane.id}:feel:${c.bar}:${s}`) : null;
        const time = feel ? c.bar*barSeconds + Math.max(0,Math.min(4-1e-6,
          P.stepToBeats(step,feel.swing)+feel.delay.beats+human!.float(-feel.timing.beats,feel.timing.beats)))*beat : at(c.bar,step);
        push(voice, time, {
          vel: part.accents[i] * (feel ? human!.float(1-feel.dynamics,1) : r.float(0.96, 1)),
          ...(lane.role === 'kick' ? {} : { pan: r.float(-S.space.hatPan, S.space.hatPan) }),
          ...trim,
          ...(sound ? { ...sound.params, gain:(trim.gain ?? 1)*dbToGain(sound.gainDb) } : {}),
        }, { bar: c.bar, step, layer: layerOf(voice), ...(pinned?.role === lane.role ? { part: pinned.id } : selectedRecipeFor(lane.role) ? { part: selectedRecipeFor(lane.role)!.id } : {}) });
      });
    }
  };
}
