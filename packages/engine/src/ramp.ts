// One parameter's written history, and where it will be at an instant.
//
// Everything in this engine that moves a parameter has to answer one question
// before it writes: *where will this be at the instant I am writing for?*
// `param.value` is the value **now** and not then; `cancelScheduledValues(t)`
// drops a ramp's destination and leaves the parameter heading for where that
// ramp began; and `cancelAndHoldAtTime`, which is the specified answer, is not
// in every engine this runs in. So the answer is kept here, as arithmetic: a
// list of the ramps that have been written and not yet cancelled, and a walk
// along it. Round G found this for the held strings, round K2 wrote it once
// for the held voices (`voices/held.ts`), round K1 wrote it again for the
// effects' knobs (`effects/shell.ts`), and both copies remembered **one** ramp
// — the last one written — which the outside review of 09-19 (its E07) showed
// is not enough: a ramp from nought to one over ten seconds, then a command
// queued for twenty, then a nearer command at five read the parameter at five
// as **1** and not 0.5, because the line it remembered was the twenty-second
// one and five is before its start. The parameter still held the first ramp;
// the helper had forgotten it.
//
// This is the one copy both now stand on. What it keeps is what the parameter
// keeps: every segment written, in the order it starts, and a write at `t`
// does to the list exactly what `cancelScheduledValues(t)` does to the
// parameter — everything that begins at or after `t` is gone, and whatever
// straddles `t` is cut there at the value it had reached. A line and its
// parameter therefore never disagree, which is the whole of the contract.

import { MIN_RELEASE } from './dsp.ts';

/** One ramp: where it started, where it is going, and when. */
export interface Segment {
  from: number;
  to: number;
  start: number;
  end: number;
  /** an exponential leg, as a hand-over's fade-in and its filter sweeps are */
  exp?: boolean;
}

/** One point of a written curve: the value to reach, when, and how. */
export interface WrittenPoint {
  v: number;
  t: number;
  k: 'set' | 'lin' | 'exp';
}

/**
 * What a line writes to: an AudioParam, or anything answering to the three
 * calls a ramp is made of — the recording stand-ins the suites use are the
 * other thing.
 */
export interface Rampable {
  value: number;
  cancelScheduledValues(t: number): unknown;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime?(v: number, t: number): unknown;
}

// An exponential leg's value part of the way along it; a leg that touches or
// crosses nought cannot be exponential, and Web Audio holds such a ramp flat,
// so it reads as the linear one it is written back as.
const along = (s: Segment, t: number): number => {
  const k = (t - s.start) / (s.end - s.start);
  if (s.exp && s.from > 0 && s.to > 0) return s.from * Math.pow(s.to / s.from, k);
  return s.from + (s.to - s.from) * k;
};

/**
 * **A curve's points onto a parameter**, from an instant: what a hand-over has
 * always written (`writeSeam` in `deck.ts`). Everything before `from` is
 * folded into a single value, interpolated along whichever segment `from` falls
 * inside, so a line picked up part-way carries on rather than starting again.
 * It cancels nothing: the calls it makes are exactly the calls the program
 * digest records a seam as making, which is why it is one function that a
 * `Line` and a recording stand-in both go through.
 */
export function writePoints(param: Rampable, pts: readonly WrittenPoint[], from: number): void {
  let i = 0;
  while (i < pts.length && pts[i].t <= from) i++;
  if (i > 0) param.setValueAtTime(foldedAt(pts, i, from), Math.max(0, from));
  for (; i < pts.length; i++) {
    const p = pts[i];
    if (p.k === 'lin') param.linearRampToValueAtTime(p.v, p.t);
    else if (p.k === 'exp') param.exponentialRampToValueAtTime!(p.v, p.t);
    else param.setValueAtTime(p.v, p.t);
  }
}

// The value a curve had reached at `from`, where `i` is the first point after it.
function foldedAt(pts: readonly WrittenPoint[], i: number, from: number): number {
  const a = pts[i - 1];
  const b = pts[i];
  let value = a.v;
  if (b) {
    const span = b.t - a.t;
    const k = span > 0 ? Math.max(0, Math.min(1, (from - a.t) / span)) : 1;
    if (b.k === 'lin') value = a.v + (b.v - a.v) * k;
    else if (b.k === 'exp') value = Math.max(1e-9, a.v) * Math.pow(b.v / Math.max(1e-9, a.v), k);
  }
  return value;
}

/** A parameter's line: readable at any instant, and the way it is written. */
export interface Line {
  /** where the parameter will be at `t`, by everything written so far */
  at(t: number): number;
  /**
   * Move to `value` at `t`, over `over` seconds (a step still takes the
   * engine's minimum ramp), starting from wherever the line had got to at `t`.
   * Everything written for after `t` is cancelled, on the parameter and here.
   * @returns the instant the ramp lands
   */
  to(value: number, t: number, over?: number): number;
  /**
   * Stand at `value` from `t`: everything written for at or after `t` is
   * cancelled, the leg under way at `t` is kept up to `t`, and the parameter is
   * set there. A `then()` after it continues from `value`. The sidechain is the
   * caller: a close kick anchors where the last recovery had got to and lays
   * its own shape from there.
   */
  set(value: number, t: number): void;
  /** whether anything written is still moving at `t` (a segment ends after it) */
  moving(t: number): boolean;
  /**
   * Continue: a ramp to `value` ending at `until`, from where the last segment
   * ends. Appended, cancelling nothing — a release's last step to true nought.
   */
  then(value: number, until: number): void;
  /** the segments that have not ended, for a gate that wants to read them */
  segments(): Segment[];
  /**
   * Write a curve's points from `from` (`writePoints`), and keep them: the
   * parameter is told exactly what a hand-over has always told it, and the
   * line knows where it will be at every instant after, so the next command —
   * a claim, a release, a seam abandoned — starts from there and not from
   * `param.value`.
   */
  write(pts: readonly WrittenPoint[], from: number): void;
}

/**
 * A line over one parameter.
 *
 * @param initial the value the parameter is at before anything is written, or
 *   the ramp a caller has already written on it by hand (a voice's attack), so
 *   the first command after it starts from where that ramp had got to
 */
export function line(ctx: { currentTime: number }, param: Rampable, initial: number | Segment): Line {
  let base = typeof initial === 'number' ? initial : initial.from;
  let segs: Segment[] = typeof initial === 'number' ? [] : [{ ...initial }];

  // **Read from where the answer is, not from the beginning** (R81). The
  // segments are written in the order they start and, but for a curve written
  // over a longer leg it kept (`write`), each ends where or after the one before
  // it ends; while that holds, the first segment still running at `t` is found
  // by halving rather than by a walk. Offline the clock stands at nought and
  // nothing folds, so a whole render's kicks are one line: a walk per kick was
  // 800 ms for 4000 of them. Where the ends are out of order the walk is kept.
  let ordered = true;
  const push = (s: Segment): void => {
    const last = segs[segs.length - 1];
    if (last && (s.end < last.end || s.start < last.start)) ordered = false;
    segs.push(s);
  };
  const at = (t: number): number => {
    if (ordered) {
      let lo = 0, hi = segs.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (t >= segs[mid].end) lo = mid + 1; else hi = mid;
      }
      if (lo === segs.length || t <= segs[lo].start) return lo > 0 ? segs[lo - 1].to : base;
      return along(segs[lo], t);
    }
    let v = base;
    for (const s of segs) {
      // The end first: a step (`set`) is a segment with no length, and at its
      // own instant it is already the value it steps to.
      if (t >= s.end) { v = s.to; continue; }
      if (t <= s.start) break;
      return along(s, t);
    }
    return v;
  };

  // A segment over before the clock's own present cannot be written into
  // again — an instant a caller names in the past is now to the parameter —
  // so the past is folded into the base, one segment kept as the margin. A
  // knob turned forty times a second for an hour is then a handful of
  // segments and not a hundred and forty thousand; offline the clock stands
  // at nought while a whole life is scheduled, and nothing is folded.
  const fold = (): void => {
    const now = ctx.currentTime;
    let n = 0;
    while (n < segs.length && segs[n].end <= now) n++;
    if (n > 1) {
      base = segs[n - 2].to;
      segs = segs.slice(n - 1);
    }
  };

  // Cut the line at `t`, on the parameter and here, and anchor it: at `value`
  // if one is given, else where it had got to. Hands back where it had got to.
  //
  // **The leg under way at `t` is written again, up to `t`.** What
  // `cancelScheduledValues(t)` removes is every *event* at or after `t`, and a
  // linear ramp is one event, at its end — so cancelling a ramp that is half
  // done removes the whole of it, and the parameter holds whatever came before
  // the ramp's start until the anchor and then jumps. Offline, where the whole
  // timeline is written before a sample is rendered, that is a certainty: a
  // 0-to-1 ramp interrupted at its middle rendered 0 up to the middle and then
  // stepped by 0.5 (the engine review of 09-22, finding 2). The specified
  // answer, `cancelAndHoldAtTime`, is missing in Firefox, so the answer is
  // arithmetic again: a ramp to where the leg had got to, ending at `t`, which
  // puts back exactly the part of the leg that played. A leg that ends at `t`
  // itself is written back whole, for the same reason.
  const cut = (t: number, value?: number): number => {
    const from = at(t);
    param.cancelScheduledValues(t);
    let leg: Segment | null = null;
    const kept: Segment[] = [];
    if (ordered) {
      // From the end: what begins at or after `t` goes, and of what is left
      // only the tail that is still running at `t` is touched.
      let k = segs.length;
      while (k > 0 && segs[k - 1].start >= t) k--;
      segs.length = k;
      for (let j = k - 1; j >= 0 && segs[j].end >= t; j--) {
        const s = segs[j];
        const cutS = s.end > t ? { ...s, to: from, end: t } : s;
        segs[j] = cutS;
        if (!leg) leg = cutS;
      }
    } else {
      for (const s of segs) {
        if (s.start >= t) break;
        if (s.end >= t) {
          leg = s.end > t ? { ...s, to: from, end: t } : s;
          kept.push(leg);
        } else kept.push(s);
      }
      segs = kept;
    }
    // An exponential leg is written back as the exponential it was: the same
    // curve, cut at `t`, is the same start raised to the same power.
    if (leg) {
      if (leg.exp && leg.from > 0 && from > 0 && param.exponentialRampToValueAtTime) param.exponentialRampToValueAtTime(from, t);
      else param.linearRampToValueAtTime(from, t);
    }
    // Where the leg was written back the parameter is already at `from` at
    // `t`, so a set is only for a line that was standing still or a step.
    if (!leg || (value !== undefined && value !== from)) param.setValueAtTime(value ?? from, t);
    return from;
  };

  return {
    at,
    to(value, t, over = 0) {
      const ramp = Math.max(MIN_RELEASE, over || 0);
      const from = cut(t);
      param.linearRampToValueAtTime(value, t + ramp);
      push({ from, to: value, start: t, end: t + ramp });
      fold();
      return t + ramp;
    },
    set(value, t) {
      cut(t, value);
      push({ from: value, to: value, start: t, end: t });
      fold();
    },
    moving: (t) => segs.length > 0 && segs[segs.length - 1].end > t,
    then(value, until) {
      const last = segs[segs.length - 1];
      const start = last ? last.end : ctx.currentTime;
      const end = Math.max(until, start);
      param.linearRampToValueAtTime(value, end);
      push({ from: at(start), to: value, start, end });
    },
    segments: () => segs.map((s) => ({ ...s })),
    write(pts, from) {
      writePoints(param, pts, from);
      // The history keeps what began before the instant written from; the
      // points are appended after it, each leg starting where the last ended.
      segs = segs.filter((s) => s.start < from);
      let i = 0;
      while (i < pts.length && pts[i].t <= from) i++;
      if (i > 0) {
        const v = foldedAt(pts, i, from);
        const w = Math.max(0, from);
        push({ from: v, to: v, start: w, end: w });
      }
      for (; i < pts.length; i++) {
        const p = pts[i];
        const last = segs[segs.length - 1];
        const start = last ? last.end : ctx.currentTime;
        if (p.k === 'set') push({ from: p.v, to: p.v, start: p.t, end: p.t });
        else push({ from: at(start), to: p.v, start, end: Math.max(start, p.t), ...(p.k === 'exp' ? { exp: true } : {}) });
      }
      fold();
    },
  };
}

export default line;
