// The set's clock: one grid for the night.
//
// MEASURED: the tempo change across a seam is exactly 0.00 BPM. The themes are
// still *drawn* a tenth of a BPM apart — that is the session's slow drift and
// the plans are not touched — so a theme's `bpm` is its target and not the rate
// it is played at while somebody else is still on the record.
//
// The set keeps one grid. It counts beats: a theme's events are beats of its
// own, and the clock says what a beat costs in seconds. While two decks are up
// they share the grid the outgoing theme brought, so the eighth bar of the
// incoming theme falls on the same instant as the eighth bar of the outgoing
// one and the downbeat the bass changes hands on is one downbeat rather than
// two 17 ms apart — which is the kick that used to be dropped, leaving the
// incoming theme's first 559 ms with no bottom at all. When the outgoing deck
// is gone the grid glides to the incoming theme's own tempo, linear in BPM, the
// way a pitch fader moves. Nothing ever jumps.
//
// How far and when is the composer's seam rule and not the clock's
// (`seamTempo` in `performance.ts`, the fault pass of 09-24): a drift glides
// sixteen bars after the blend, a near move a bar a percent, a half or double
// move is counted two beats of one theme to one of the grid (the deck's
// `perBeat`) and glides only what is left, and a far jump is a glide *before*
// the blend, on the outgoing deck alone. The clock has the two moves it always
// had — `pin` and `glide` — and they are all any of that needs.
//
// It is here rather than in the mix since round E: a clock is time, and time is
// not a deck. Nothing in this file builds a node, reads a context or knows what
// a theme is — `tools/check.ts` sweeps it, `tools/setplan.ts` lays a whole set
// out on it and neither has a browser.

/** One stretch of the grid, in beat order. */
export interface Segment {
  /** the beat it begins at */
  b0: number;
  /** the instant that beat falls on, on the context's clock */
  t0: number;
  /** what a beat costs at the start of the segment, and at its end */
  spb0: number;
  spb1: number;
  /** how many beats it runs for; `Infinity` for the one that is still open */
  beats: number;
}

/**
 * The grid a set counts on: beats to instants and back, with two ways of
 * changing it — `pin`, which holds it where it stands, and `glide`, which
 * leans it to a new tempo over a stated number of beats.
 */
export interface SetClock {
  timeAt(beat: number): number;
  beatAt(time: number): number;
  spbAt(beat: number): number;
  barSecondsAt(beat: number): number;
  pin(beat: number): number;
  glide(beat: number, toBeatSeconds: number, overBeats: number): void;
  readonly segments: Segment[];
}

export function makeSetClock(beatSeconds: number, atTime = 0): SetClock {
  // The grid, as segments in beat order. Each runs from beat `b0` at context
  // time `t0` for `beats` beats, its beat length going from `spb0` to `spb1`.
  let segs: Segment[] = [{ b0: 0, t0: atTime, spb0: beatSeconds, spb1: beatSeconds, beats: Infinity }];
  const bpmOf = (spb: number): number => 60 / spb;
  const straight = (s: Segment): boolean => !Number.isFinite(s.beats) || Math.abs(s.spb1 - s.spb0) < 1e-12;
  // Tempo linear in beat: bpm(b) = m0 + k(b - b0), so the time across the
  // segment is the integral of 60/bpm, and the beat at a time is its inverse.
  const rate = (s: Segment): number => (bpmOf(s.spb1) - bpmOf(s.spb0)) / s.beats;

  function timeIn(s: Segment, beat: number): number {
    const d = beat - s.b0;
    if (straight(s)) return s.t0 + d * s.spb0;
    const m0 = bpmOf(s.spb0);
    const k = rate(s);
    return s.t0 + (60 / k) * Math.log((m0 + k * d) / m0);
  }
  function beatIn(s: Segment, time: number): number {
    const dt = time - s.t0;
    if (straight(s)) return s.b0 + dt / s.spb0;
    const m0 = bpmOf(s.spb0);
    const k = rate(s);
    return s.b0 + (m0 * Math.exp((k * dt) / 60) - m0) / k;
  }
  function spbIn(s: Segment, beat: number): number {
    if (straight(s)) return s.spb0;
    return 60 / (bpmOf(s.spb0) + rate(s) * (beat - s.b0));
  }
  // **Every segment is kept, for the night.** They were capped at sixteen, and
  // a lookup before the oldest one left was the oldest one extrapolated
  // backwards — through a glide, a logarithm of whatever it reached: after
  // twenty glides `timeAt(32)` was NaN, and in a twelve-theme layout
  // `timeAt(100)` moved from 49.18 s to 27.72 s (the reconciled review of
  // 09-24, R32). A seam adds three segments, so a night of a hundred and twenty
  // themes is a few hundred small objects; the lookups walk from the newest,
  // which is where the live pump always asks.
  const byBeat = (beat: number): Segment => {
    for (let i = segs.length - 1; i >= 0; i--) if (beat >= segs[i].b0 || i === 0) return segs[i];
    return segs[0];
  };
  const byTime = (time: number): Segment => {
    for (let i = segs.length - 1; i >= 0; i--) if (time >= segs[i].t0 || i === 0) return segs[i];
    return segs[0];
  };

  const clock: SetClock = {
    timeAt: (beat) => timeIn(byBeat(beat), beat),
    beatAt: (time) => beatIn(byTime(time), time),
    spbAt: (beat) => spbIn(byBeat(beat), beat),
    barSecondsAt: (beat) => spbIn(byBeat(beat), beat) * 4,
    // Hold the grid where it is from this beat on: nothing changes tempo while
    // two decks are up, so a seam beginning in the middle of a glide takes
    // whatever the glide had reached and keeps it.
    pin(beat) {
      const spb = clock.spbAt(beat);
      const t0 = clock.timeAt(beat);
      segs = segs.filter((s) => s.b0 < beat);
      const head = segs[segs.length - 1];
      // A pin inside a glide ends the glide where it had got to: the segment
      // is shortened and its closing tempo is the tempo at the pin, so the
      // slope is the one it had and no beat already played moves. It kept its
      // old closing tempo, over fewer beats — a steeper glide under beats that
      // had already been given their instants (the reconciled review of 09-24,
      // R17: 16 / 50 / 544 ms at 122→124, 118→124 and 104→169 BPM).
      if (head && Number.isFinite(head.beats) && beat - head.b0 < head.beats) head.spb1 = spbIn(head, beat);
      if (head) head.beats = Math.min(head.beats, beat - head.b0);
      segs.push({ b0: beat, t0, spb0: spb, spb1: spb, beats: Infinity });
      return spb;
    },
    // From this beat, take `overBeats` to reach the stated beat — sixteen bars
    // of it for a drift, fewer for a near move, the ride before a far one.
    glide(beat, toBeatSeconds, overBeats) {
      const spb = clock.pin(beat);
      if (!(overBeats > 0) || Math.abs(toBeatSeconds - spb) < 1e-9) return;
      const t0 = clock.timeAt(beat);
      segs[segs.length - 1] = { b0: beat, t0, spb0: spb, spb1: toBeatSeconds, beats: overBeats };
      segs.push({
        b0: beat + overBeats,
        t0: timeIn(segs[segs.length - 1], beat + overBeats),
        spb0: toBeatSeconds,
        spb1: toBeatSeconds,
        beats: Infinity,
      });
    },
    get segments() {
      return segs.map((s) => ({ ...s }));
    },
  };
  return clock;
}

export default makeSetClock;
