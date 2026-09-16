// Where a set's seams fall, worked out from the plans alone.
//
// This is the same arithmetic `renderMix` does before it builds a node — each
// theme's hand-over taken from `seamPlan` with the previous blend's end as its
// floor, laid out on one `makeSetClock` grid that is pinned through a blend and
// glides afterwards — and it is here rather than in a probe script because two
// things now stand on it: the scene gate, which has to know where the first
// seam of a set is *before* it renders one (so it can render up to it and no
// further), and `tools/check.mjs`, which sweeps nine hundred pairs of it and
// needs no browser to do so.
//
// Keeping it out here is deliberate duplication, and it is checked rather than
// trusted: the scene gate compares the seam it predicted against the one the
// rendered mix reports, so the two can never drift apart quietly.
//
// It runs on a machine and imports src/ directly, the way tools/golden.mjs
// does; nothing here is ever served to a browser.

import { planTheme, seamPlan, makeSetClock, MIX_DEFAULTS } from '../src/mix.js';

export const swapAfterBars = (blendBars, o = MIX_DEFAULTS) =>
  Math.max(1, Math.min(o.swapAfterBars, Math.floor(blendBars / 2)));

// masterSeed, how many themes, and whatever a render would pass as its opts.
// Back comes the plan of the set: the themes, where each one starts on the
// set's clock, and one row per seam with the bar it lands on, the instant it
// begins, the instant the low end changes hands and the instant it ends.
export function setLayout(masterSeed, themes = 3, opts = {}) {
  const o = { ...MIX_DEFAULTS, ...opts };
  const plans = [];
  for (let i = 0; i < themes; i++) {
    plans.push(planTheme(String(masterSeed), i, { ...o, themeBars: o.themeBars || undefined }));
  }
  const clock = makeSetClock(plans[0].beat, 0);
  const startBeats = [0];
  const starts = [0];
  const seams = [];
  let free = 0;
  for (let i = 0; i < plans.length - 1; i++) {
    const t = plans[i];
    const b0 = startBeats[i];
    const themeTimeAt = (time) => (clock.beatAt(time) - b0) * t.beat;
    const contextTimeAt = (themeTime) => clock.timeAt(b0 + themeTime / t.beat);
    const p = seamPlan(t, t.blendBars || 8, {
      boundaryBars: o.boundaryBars,
      notBefore: Math.max(0, themeTimeAt(free)),
    });
    const at = contextTimeAt(p.at);
    const barSeconds = clock.pin(clock.beatAt(at)) * 4;
    const end = at + p.bars * barSeconds;
    seams.push({
      from: i,
      to: i + 1,
      bar: p.bar,
      pct: p.bar / t.bars,
      boundary: p.boundary,
      onLine: p.bar % p.boundary === 0,
      bars: p.bars,
      barSeconds,
      at,
      swapAt: at + swapAfterBars(p.bars, o) * barSeconds,
      end,
      // What the theme wanted before the previous blend was allowed a say, so
      // a sweep can tell a moved line from a shortened one.
      natural: seamPlan(t, t.blendBars || 8, { boundaryBars: o.boundaryBars }),
    });
    startBeats.push(clock.beatAt(at));
    starts.push(at);
    free = end;
    clock.glide(clock.beatAt(end), plans[i + 1].beat, Math.max(1, (o.tempoGlideBars ?? 16) * 4));
  }
  return { plans, starts, seams, clock };
}

export default setLayout;
