// **A roll is a build device** (round trance-drawn, pass 2; his ear 11-04 on two Trance themes: *"strange, loud too … too
// intense and repetitive and sometimes too long. 16th beat on snare"*). A library row written for a build (the snare roll
// that doubles its rate, quarters, eighths, sixteenths, rising from quiet to full into the drop) was looping as a whole
// track's groove: the roll every eight bars through the mains, its peak 8 dB over the groove's backbeat.
//
// The rule, for any theme on any place (it names no genre and no row): where the snare-or-clap lane strikes sixteenths
// for more than two bars running outside a build, the lane is rolling as its groove, and
//   - every build plays the roll once, in its last eight bars, into the drop: two bars of quarters, two of eighths, four
//     of sixteenths, rising from the groove's backbeat to a few dB over it (`peakDb`), never more;
//   - a breakdown's last bar keeps its sixteenths where it has them (the short roll where a breakdown hands over);
//   - every other bar where the lane rolls plays the plain backbeat, two and four, at the groove's own level.
// A theme whose lane never rolls outside a build is left as it is. Pure: no DOM, no engine.

import { stepToBeats } from './patterns.ts';
import type { PlanEvent, Track } from './generator.ts';

const LANES = new Set(['clap', 'snare']);
/** how far over the groove's backbeat the roll may rise at its peak, dB */
export const ROLL_PEAK_DB = 4;

/** What the rule did to a theme, said on the plan (`rolls`). */
export interface RollRead { runs: number; plain: number; built: number; grooveVel: number; peakVel: number }

const neighbours = (steps: Set<number>) => { let n = 0; for (const s of steps) if (steps.has(s + 1)) n++; return n; };

export function rollsAtBuilds<T extends Track>(track: T): T {
  const lane = track.events.filter((e) => LANES.has(e.layer) && e.step != null);
  if (!lane.length) return track;
  const byBar = new Map<number, PlanEvent[]>();
  for (const e of lane) (byBar.get(e.bar) ?? byBar.set(e.bar, []).get(e.bar)!).push(e);
  const secs = track.arrangement.sections;
  const secAt = (b: number) => secs.find((s) => b >= s.startBar && b < s.startBar + s.bars);
  const sixteenths = (b: number) => neighbours(new Set((byBar.get(b) ?? []).map((e) => e.step!))) >= 6;
  // the trigger: sixteenths for more than two bars running outside a build
  let run = 0, runs = 0;
  for (let b = 0; b <= track.bars; b++) {
    if (b < track.bars && sixteenths(b) && secAt(b)?.kind !== 'build') run++;
    else { if (run > 2) runs++; run = 0; }
  }
  if (!runs) return track;
  // the groove's backbeat: the lane's hits on two and four in bars that do not roll (four hits or fewer)
  const vel = (e: PlanEvent) => Number(e.p?.vel ?? 1);
  const plainHits = lane.filter((e) => (byBar.get(e.bar)?.length ?? 0) <= 4 && (e.step === 4 || e.step === 12)).map(vel).sort((a, b) => a - b);
  const all = lane.map(vel).sort((a, b) => a - b);
  const groove = plainHits.length ? plainHits[Math.floor(plainHits.length / 2)] : all[Math.floor(all.length * 0.1)];
  const peak = Math.min(1, groove * 10 ** (ROLL_PEAK_DB / 20));
  // the lane's own voice and its settings, off a backbeat hit where one plays, for the hits the rule lays
  const tpl = lane.find((e) => e.step === 4 || e.step === 12) ?? lane[0];
  const bs = track.barSeconds, beat = track.beat ?? bs / 4, swing = track.swing ?? 0.5;
  const hit = (bar: number, step: number, v: number): PlanEvent => ({ ...tpl, t: bar * bs + stepToBeats(step, swing) * beat, bar, step,
    p: { ...tpl.p, vel: +v.toFixed(3) } } as PlanEvent);
  const laid: PlanEvent[] = [];
  const rewritten = new Set<number>();
  let plain = 0, built = 0;
  for (const s of secs) {
    const end = s.startBar + s.bars;
    for (let b = s.startBar; b < end; b++) {
      const k = b - s.startBar;
      if (s.kind === 'build' && b >= end - 8) {
        // the roll, once, into the drop: two bars of quarters, two of eighths, four of sixteenths, rising to the peak
        const at = b - (end - 8), every = at < 2 ? 4 : at < 4 ? 2 : 1;
        rewritten.add(b); built++;
        for (let st = 0; st < 16; st += every) {
          const x = (at * 16 + st) / 128;
          laid.push(hit(b, st, groove + (peak - groove) * x));
        }
        continue;
      }
      const hits = byBar.get(b) ?? [];
      if (hits.length <= 2) continue;
      if (s.kind === 'breakdown' && k === s.bars - 1 && sixteenths(b)) continue;
      // the plain backbeat, two and four, at the groove's level
      rewritten.add(b); plain++;
      laid.push(hit(b, 4, groove), hit(b, 12, groove));
    }
  }
  track.events = [...track.events.filter((e) => !(LANES.has(e.layer) && rewritten.has(e.bar))), ...laid].sort((x, y) => x.t - y.t);
  (track as T & { rolls?: RollRead }).rolls = { runs, plain, built, grooveVel: +groove.toFixed(3), peakVel: +peak.toFixed(3) };
  return track;
}
