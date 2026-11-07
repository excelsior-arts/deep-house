// **A break's way back into the groove** (round dark-fronts' ninth pass; the tenth made the break's split one piece with
// long-main's splice, `src/long-main.ts`: a break in two around a groove passage is now a split in the plan's second ask,
// planned by the generator, not copied). What stays here touches only the bars it names, so every note, curve and draw
// outside them is the plan's own:
//
//   build   the reese comes back under a break's last bars, filtered and opening, its notes the next drop's first
//           bars' own, so the break leads into the drop;
//   cycle   how long the groove's material takes to come round (the front's figure, the bass's pattern), for the
//           passage's length.
//
// Nothing here knows a genre.

import type { Track } from './generator.ts';

type Ev = Track['events'][number];
type Sec = Track['arrangement']['sections'][number];

/** The held line's events the roles took out (`sound.roles.held.gone`): they never sound, so they are never copied. */
const goneOf = (track: Track): Set<Ev> => new Set(((track.sound as { roles?: { held?: { gone: Array<[number, Ev]> } } } | undefined)?.roles?.held?.gone ?? []).map(([, e]) => e));

/**
 * **The build back into the drop**: under the break's last `bars`, the bass notes of the next drop's first `bars`,
 * shifted back in time, each note filtered (`lpMul`, walked across it) along one line from `lp[0]` to `lp[1]` of the
 * voice's own corner and rising in level from `gainDb` to nought: the reese returning, filtered and opening.
 */
export function buildBack(track: Track, sec: Sec, bars: number, drop: number, lp: [number, number], gainDb: number, events: Ev[], gone = goneOf(track)): Ev[] {
  const bs = track.barSeconds, from = sec.startBar + sec.bars - bars, a = from * bs, span = bars * bs, dt = (from - drop) * bs;
  const add: Ev[] = [];
  for (const e of events) {
    if (gone.has(e) || e.layer !== 'bass' || e.bar < drop || e.bar >= drop + bars) continue;
    const t = e.t + dt, dur = Math.min(Number(e.p?.dur ?? 0), a + span - t);
    if (!(dur > 0.02)) continue;
    const at = (x: number) => Math.max(0, Math.min(1, (x - a) / span));
    const lpAt = (x: number) => +(lp[0] * Math.pow(lp[1] / lp[0], at(x))).toFixed(4);
    add.push({ ...e, t, bar: e.bar + (from - drop), p: { ...e.p, dur, lpMul: [lpAt(t), lpAt(t + dur)], gain: +(Number(e.p?.gain ?? 1) * Math.pow(10, (gainDb * (1 - at(t))) / 20)).toFixed(4) } } as Ev);
  }
  return [...events, ...add].sort((x, y) => x.t - y.t);
}

/**
 * **The groove's cycle, in bars**: the smallest of 1, 2, 4, 8, 16, 32 at which a lane's bar-by-bar content comes round
 * (four bars in five the same a lag later), over bars `[from, to)`; the front's cycle (the keys lane) and twice the
 * bass's, whichever is longer; a lane too sparse to read counts 1. What the passage between two breaks must give the
 * ear once and then once more (his ear 11-04: *"doesn't have enough time to unfold with current bass wave and motif"*).
 */
export function materialCycle(events: ReadonlyArray<{ layer: string; bar: number; step?: number; voice: string; p: Record<string, unknown> }>, from: number, to: number): number {
  const periodOf = (lane: string): number => {
    const keys: string[] = [];
    for (let b = from; b < to; b++) keys.push(events.filter((e) => e.layer === lane && e.bar === b).map((e) => `${e.step ?? 0}:${e.p.midi ?? e.voice}`).sort().join(','));
    const on = keys.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
    if (on.length < 4) return 1;
    for (const lag of [1, 2, 4, 8, 16, 32]) {
      let same = 0, n = 0;
      for (const i of on) if (i + lag < keys.length && keys[i + lag]) { n++; if (keys[i + lag] === keys[i]) same++; }
      if (n >= 3 && same / n >= 0.8) return lag;
    }
    return 32;
  };
  return Math.max(periodOf('keys'), 2 * periodOf('bass'));
}
