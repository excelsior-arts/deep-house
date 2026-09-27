// What a role's musical request does to the notes after they are written: its
// presence, its space, its tone and each phrase's own arch; and the harmonic
// pulse, a second part on its own bar cycle. Split out of generator.ts in the
// composer fix round of 09-22 without moving an event.
import type { Lane, Style } from '@deep-house/engine/style';
import type { Settings } from '@deep-house/engine/settings';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import { BY_NAME } from '@deep-house/engine/voices';
import { dbToGain } from '@deep-house/engine/dsp';
import type Rng from '../rng.ts';
import { layerOf } from '../lanes.ts';
import { laneLevelDb } from '../lane-level.ts';
import { placementOf } from '../motif.ts';
import { chordAtBar, foldTo, noteName, scaleNote, type Progression } from '../theory.ts';
import { layersAtBar, type makeArrangement } from '../arrangement.ts';
import { textureCandidates } from './texture.ts';
import type { MusicalParts } from './types.ts';
import type { SoundCharacters } from './sound.ts';
import type { EventMeta, PlanEvent } from '../generator.ts';

/** The pulse's instrument and numbers, off its own stream, or null with no pulse requested. */
export function rollTexture({ style, parts, forbids, dice, partStream }:
  { style: Style; parts: MusicalParts; forbids: readonly string[]; dice: (tag: string) => Rng; partStream: string }) {
  if (!parts.texture) return null;
  const want = parts.texture;
  const candidates = textureCandidates(want, style, forbids);
  if (!candidates.length) throw new Error('recipe texture has no enabled pulse instrument');
  const r = dice(`${partStream}-texture`);
  return { ...r.weighted(candidates.map(c => ({ v: c, w: c.w }))),
    strength: r.float(...want.strength), spacing: Math.round(r.float(...want.spacing.bars)),
    entry: Math.round(r.float(...want.entry.beats) * 4), duration: r.float(...want.duration.beats) };
}

export interface Treatment {
  style: Style;
  S: Settings;
  parts: MusicalParts;
  characters: SoundCharacters | undefined;
  events: PlanEvent[];
  upperEvents: Set<PlanEvent>;
  phraseParameters: Map<PlanEvent, NoteParams>;
  LANES: readonly Lane[];
  voiceOf: (lane: Lane) => string;
  UPPERS: readonly unknown[];
  TEXTURE: ReturnType<typeof rollTexture>;
  silent: readonly string[];
  bars: number;
  arrangement: ReturnType<typeof makeArrangement>;
  progression: Progression;
  at: (bar: number, step: number) => number;
  beat: number;
  barSeconds: number;
  push: (voice: string, t: number, p: NoteParams, meta: EventMeta) => void;
}

/** The post-passes, in the order they always ran, before the events are sorted. */
export function treat({ style, S, parts, characters, events, upperEvents, phraseParameters, LANES, voiceOf, UPPERS, TEXTURE,
  silent, bars, arrangement, progression, at, beat, barSeconds, push }: Treatment): void {
  // Space follows the actual musical role; it never changes a note's
  // onset, pitch, strength or the dry kick/bass. Engine defaults survive when
  // no spatial character was requested.
  const eventsForRole = (role: string) => {
    // A melody and a sustained bed can share an instrument. The explicit
    // part owns its notes, so its level and room must not retreat the melody
    // with the bed or bring the bed forward with the melody.
    if (role === 'figure' && UPPERS.length) return events.filter(e => upperEvents.has(e));
    const voices = new Set(LANES.filter(l => l.role === role).map(voiceOf));
    return events.filter(e => !upperEvents.has(e) && voices.has(e.voice));
  };
  for (const role of Object.keys(parts.presence)) {
    for (const e of eventsForRole(role)) {
      const level = BY_NAME[e.voice].level as keyof typeof S.levels;
      const baseLevel = style.base.levels[level], roomLevel = laneLevelDb(style, S.levels as Record<string, number>, e.voice, level) as number;
      if (!Number.isFinite(baseLevel) || !Number.isFinite(roomLevel)) throw new Error(`recipe presence: no level for ${role}`);
      const targetLevel = parts.presence[role as keyof typeof parts.presence] === 'background'
        ? Math.min(baseLevel, roomLevel) + characters!.presence.backgroundDb : baseLevel;
      e.p = { ...e.p, gain: (e.p.gain ?? 1) * dbToGain(targetLevel - roomLevel) };
    }
  }
  for (const [role, character] of Object.entries(parts.ambience)) {
    const sends = characters!.ambience[character!];
    for (const e of eventsForRole(role)) e.p = { ...e.p, ...sends, ...(role === 'figure' ? { hall: sends.reverb } : {}) };
  }
  // Tone is an explicit musical character, mapped only where the renderer
  // declares the needed controls. It never changes the rhythm or pitch line.
  for (const role of Object.keys(parts.tone)) {
    for (const e of events.filter(e => BY_NAME[e.voice].roles.includes(role as any))) {
      const controls = BY_NAME[e.voice].noteControls || [];
      const profile = characters?.tone[role]?.[parts.tone[role as keyof typeof parts.tone]!];
      if (!profile || !profile.requires.every(k => controls.includes(k))) throw new Error(`musical tone: ${role} has no supported character`);
      e.p = { ...e.p, ...profile.params };
    }
  }
  // A phrase's articulation and tail refine the broad role's space. The style
  // owns these controls; the compiler only interpolates its musical arch.
  for (const [event, params] of phraseParameters) event.p = { ...event.p, ...params };
  // A second musical part, not another foreground phrase or a second transport
  // clock. Its global bar phase survives section changes; closed gates omit a
  // pulse instead of delaying it. Tails may ring across the next bar.
  if (TEXTURE) {
    const gate = style.lanes.find(l => l.role === 'figure')?.gate;
    if (!gate || silent.includes(gate)) throw new Error('recipe texture has no permitted arrangement gate');
    for (let cycleBar = 0; cycleBar < bars; cycleBar += TEXTURE.spacing) {
      const bar = cycleBar + Math.floor(TEXTURE.entry / 16), step = TEXTURE.entry % 16;
      if (bar >= bars) break;
      const context = layersAtBar(arrangement, bar);
      if (!context.layers[gate] || !placementOf(context.section.kind).plays) continue;
      const chord = chordAtBar(progression, bar);
      const midi = foldTo(scaleNote(progression.root, progression.scale, chord.degree), ...characters!.pulse.register);
      push(TEXTURE.voice, at(bar, step), {
        midi, dur: Math.min(TEXTURE.duration * beat, (bars - bar) * barSeconds - step / 4 * beat),
        vel: TEXTURE.strength, preset: TEXTURE.timbre,
        ...characters!.pulse.articulation,
        ...characters!.pulse.space[parts.texture!.ambience],
      }, { bar, step, layer: layerOf(TEXTURE.voice), role: 'texture', note: noteName(midi) });
    }
  }
}
