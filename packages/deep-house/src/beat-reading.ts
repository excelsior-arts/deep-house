// **How beat-led a theme is, read off its drums and its tempo** (round mix-voices, the handovers' `beatLed`; round
// loudness-place, the same reading apart for the level a theme is aimed at). One home for the arithmetic, so the seam
// that keeps a rhythm and the trim that aims a theme read one number: performance.ts hands it the compiled program's
// events, loudness.ts the plan's own (the trim is planned before the program is compiled, and compiling it there would
// keep a program built without the theme's sum clip), and the two agree, since every drum the program plays is a
// plan event on the kick's or the drums' bus.
//
// Nothing here names a genre: the drums' share and the tempo's share are what the theme plays.

import { VOICE_BUS } from '@deep-house/engine/voices';

export interface BeatLed {
  /** the product, nought to one: 0.5 and up is beat-led at a seam, 0.75 and up drives */
  value: number;
  /** the tempo it is felt at: its tempo, or twice it where a slow theme's drums run double */
  felt: number;
  /** nought at 112 BPM felt and under, one at 128 and over */
  tempo: number;
  /** the share of its grooves' bars where a kick or a drum strikes */
  drums: number;
}

export const BEAT_LED_TEMPO: readonly [number, number] = [112, 128];

/** A theme, as the reading needs one: its clock, its bar and its sections. */
export interface BeatTrack {
  clock?: string;
  barSeconds: number;
  arrangement?: { sections?: ReadonlyArray<{ kind: string; startBar: number; bars: number }> } | null;
}

/** A struck event, as the reading needs one: when, which voice, and the bus it lands on where the program says. */
export interface BeatEvent { t: number; voice?: string | null; bus?: string | null }

/**
 * The reading off a list of events (`performance.ts` `beatLed`, its rules said there). `bpm` is the tempo it is
 * played at; a free theme reads nought. `tempo: 'played'` (a break's, round break-pulse-rule) reads it without the felt
 * doubling.
 */
export function beatOf(track: BeatTrack, events: readonly BeatEvent[], bpm: number, o: { tempo?: 'felt' | 'played' } = {}): BeatLed {
  if (track.clock === 'free') return { value: 0, felt: bpm, tempo: 0, drums: 0 };
  const bs = track.barSeconds;
  const S = track.arrangement?.sections ?? [];
  const groove = S.filter((s) => s.kind === 'main' || s.kind === 'drop');
  const spans = (groove.length ? groove : S).map((s) => [s.startBar * bs, (s.startBar + s.bars) * bs] as const);
  const bars = Math.max(1, spans.reduce((a, [x, y]) => a + Math.round((y - x) / bs), 0));
  const pulse = new Set<number>(), back = new Set<number>();
  let backHits = 0, hits = 0, kicks = 0;
  for (const e of events) {
    const bus = e.bus ?? ((e.voice && VOICE_BUS[e.voice]) || 'melodic');
    if (bus !== 'kick' && bus !== 'drums') continue;
    if (!spans.some(([x, y]) => e.t >= x && e.t < y)) continue;
    const bar = Math.floor(e.t / bs + 1e-9);
    pulse.add(bar);
    hits++;
    if (bus === 'kick') kicks++;
    const v = e.voice ?? '';
    if (/clap|snare/i.test(v) && !/ghost/i.test(v)) { back.add(bar); backHits++; }
  }
  const drums = Math.min(1, pulse.size / bars);
  // sixteenths, the backbeat on every beat of the bar and the kick at half that: a slow theme played at double time
  const double = o.tempo !== 'played' && bpm < 100 && hits / (bars * 4) >= 3 && back.size / bars >= 0.5 && backHits / Math.max(1, back.size) >= 3.5 && kicks / bars <= 2.5;
  const felt = double ? bpm * 2 : bpm;
  const [lo, hi] = BEAT_LED_TEMPO;
  const tempo = Math.max(0, Math.min(1, (felt - lo) / (hi - lo)));
  return { value: +(tempo * drums).toFixed(3), felt: +felt.toFixed(1), tempo: +tempo.toFixed(3), drums: +drums.toFixed(3) };
}
