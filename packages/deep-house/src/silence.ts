// **Nothing in the middle of a theme is ever fully silent** — house-v2's
// `neverSilent`, round S21, on Eugene's `?seed=41475&v=2&theme=3&t=88`
// ("completely empty interval in the middle of the song"). Three rules that
// are each right on their own met in a breakdown's first phrase and left it
// empty for eight bars (18.2 s): the grammar gives that phrase the closed hat,
// the keys and the pad and no bass; the `minimal` density die took the pad
// off; the theme's motif rides the keys and is absent in a breakdown so its
// return is an event (`src/motif.ts`); and S6 rests the hat there because the
// harmony is being given the room (`src/hats.ts`). Nothing was left.
//
// The rule is a last word on the plan's events, after every pass that takes
// notes away: a run of two bars or more in which nothing sounds — no onset and
// nothing held over — anywhere past the intro's first phrase and before the
// outro's last eight bars, takes the theme's own bed: the pad chords the theme
// plays at the same point of its progression, copied from the nearest bar that
// has them (before, else after) and moved in time, or, with no pad anywhere in
// the theme, its keys, else its bass. Nothing is drawn, so no die moves.

/** The shortest silent run that is a gap and not a rest. */
export const SILENT_RUN_BARS = 2;
/** The layers that can carry a gap, in the order they are asked. */
export const BED_LAYERS: readonly string[] = ['pad', 'keys', 'bass'];

interface Ev { layer: string; bar?: number | null; t: number; p: { dur?: number; release?: number; [k: string]: any }; [k: string]: any }
interface Section { kind: string; startBar: number; bars: number; phrases: Array<{ startBar: number }> }

/** Which bars of a theme sound at all: an onset in the bar, or a note held into it. */
export function soundingBars(events: readonly Ev[], bars: number, barSeconds: number): boolean[] {
  const on = new Array<boolean>(bars).fill(false);
  for (const e of events) {
    const end = e.t + Math.max(e.p.dur ?? 0, 0) + Math.max(e.p.release ?? 0, 0);
    const a = Math.max(0, Math.floor(e.t / barSeconds + 1e-9));
    const b = Math.min(bars - 1, Math.ceil(end / barSeconds - 1e-9) - 1);
    for (let i = a; i <= Math.max(a, b) && i < bars; i++) on[i] = true;
  }
  return on;
}

/** The bars a silent run may lie in: past the intro's first phrase, before the outro's last eight. */
export function gapWindow(sections: readonly Section[], bars: number): [number, number] {
  const intro = sections[0] && sections[0].kind === 'intro' ? sections[0] : null;
  const from = intro ? Math.min(intro.startBar + intro.bars, (intro.phrases[1]?.startBar ?? intro.startBar + intro.bars)) : 0;
  const last = sections[sections.length - 1];
  const to = last && last.kind === 'outro' ? Math.max(last.startBar, bars - 8) : bars;
  return [from, to];
}

/** The silent runs of a theme inside its window, as [first bar, bars]. */
export function silentRuns(events: readonly Ev[], sections: readonly Section[], bars: number, barSeconds: number): Array<[number, number]> {
  const on = soundingBars(events, bars, barSeconds);
  const [from, to] = gapWindow(sections, bars);
  const runs: Array<[number, number]> = [];
  for (let b = from; b < to; b++) {
    if (on[b]) continue;
    let e = b;
    while (e + 1 < to && !on[e + 1]) e++;
    if (e - b + 1 >= SILENT_RUN_BARS) runs.push([b, e - b + 1]);
    b = e;
  }
  return runs;
}

/**
 * Fill every silent run with the theme's bed, in place. `loopBars` is the
 * progression's length, so the run is filled from a window a whole number of
 * loops away — the nearest earlier one where the layer sounds, else the nearest
 * later — which puts every chord on its own bars; a note that was already
 * sounding when the source window opens enters at the run's first bar, and
 * every note ends by the run's last. Answers the runs it filled and the layer.
 */
export function fillSilence(events: Ev[], sections: readonly Section[], bars: number, barSeconds: number, loopBars: number,
  timeline?: Array<{ layers: string[] }>): Array<{ from: number; bars: number; layer: string }> {
  const filled: Array<{ from: number; bars: number; layer: string }> = [];
  const endOf = (e: Ev) => e.t + Math.max(e.p.dur ?? 0, 0);
  for (const [from, n] of silentRuns(events, sections, bars, barSeconds)) {
    const a = from * barSeconds, b = (from + n) * barSeconds;
    for (const layer of BED_LAYERS) {
      const own = events.filter((e) => e.layer === layer);
      if (!own.length) continue;
      // the nearest whole number of loops away whose window this layer sounds all through
      const covers = (shift: number) => {
        const lo = a - shift, hi = b - shift;
        if (lo < 0 || hi > bars * barSeconds) return false;
        const ivs = own.filter((e) => e.t < hi && endOf(e) > lo).map((e) => [Math.max(lo, e.t), Math.min(hi, endOf(e))]).sort((x, y) => x[0] - y[0]);
        let at = lo;
        for (const [x, y] of ivs) { if (x > at + 1e-6) return false; at = Math.max(at, y); }
        return at >= hi - 1e-6;
      };
      let shift: number | null = null;
      for (let k = 1; k * loopBars <= bars && shift == null; k++) {
        if (covers(k * loopBars * barSeconds)) shift = k * loopBars * barSeconds;
        else if (covers(-k * loopBars * barSeconds)) shift = -k * loopBars * barSeconds;
      }
      if (shift == null) continue;
      const add: Ev[] = [];
      for (const e of own) {
        const t = Math.max(a, e.t + shift), end = Math.min(b, endOf(e) + shift);
        if (end - t < 0.05) continue;
        add.push({ ...e, t, bar: Math.floor(t / barSeconds + 1e-9), p: { ...e.p, dur: end - t } });
      }
      if (!add.length) continue;
      events.push(...add);
      events.sort((x, y) => x.t - y.t);
      if (timeline) for (let i = from; i < from + n; i++) if (timeline[i] && !timeline[i].layers.includes(layer)) timeline[i].layers = [...timeline[i].layers, layer];
      filled.push({ from, bars: n, layer });
      break;
    }
  }
  return filled;
}
