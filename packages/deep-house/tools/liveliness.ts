// **The ring's liveliness** (U2e; his word 10-13 on seed 11 at Zephyr high: "the more boring the ring in terms of
// graphics, the more boring the music too … we should account this metric as well, despite unconventional"; on the
// lanes: "sometimes they look like chess and you know what this track is giving you … ambients and DnB give the most
// interesting ring graphics, while deep house the most boring"; and "an interesting-looking asymmetrical ring with
// various depths and blanks and constellations gives likely an exploratory feel"). A reading of what the ring draws
// for a planned theme — its marks (`marksOf`, the section lines) and its lanes (`lanesOf`, the levels per bar) — never
// a render. A report, not a gate.
//
// The marks:
//   perMin    marks a minute: the section lines, the sub-segments, the builds, every moment the ring draws
//   longestS  the longest stretch of the rim with no mark on it, in seconds (a span mark covers its bars)
//   cluster   how the marks gather: the spread of the gaps between their starts over their mean (1 a random scatter,
//             under 1 an even spacing, over 1 constellations: the Drum & Bass tile 1.1, the house 0.7)
// The lanes (the seven rows of the rim, a level 0-3 a bar, as `lanesOf` draws them):
//   fill      the share of the band inked: lanes sounding a bar, over seven (a full band reads as one block; blanks and
//             depth leave it open)
//   chess     the share of the whole band drawn at a lane's full thickness: the dark squares of the chessboard he named
//   depth     how much the ink varies bar to bar: the spread of the bars' summed levels over their mean
// Measured against his anchors (10-13: the Ambient and the Drum & Bass tiles the most interesting rings, the house the
// most boring; seeds 1-12, medians): fill 0.38 and 0.64 against the house's 0.73, chess 0.10 and 0.07 against 0.28,
// depth 0.43 and 0.34 against 0.30. Three other readings were tried and left out because they disagree with him: a lane's bar
// against the bar four before (the house 0.74, the Ambient 0.78), the rests inside a lane's own stretch (the Ambient
// 0.03, the house 0.17), and the quarters against each other (the Ambient 0.05, the house 0.12).
//
// **The band** (his word 10-13: "techno and technically deep house do assume repetitiveness … but the license should
// still be there in our rhythms and arrangement, and it should be clearly visible in the ring"): what a theme is read
// against is its place's, from `recipes/arrangement/liveliness.json`: the slow side's row under the phrases' tempo
// (its liveliness is in its lanes, its marks few), the groove's from there up, each leaned by the birds about the
// house's own — the floor of marks a minute, the longest unmarked stretch it tolerates, and the chessboard's ceiling,
// higher at the house and the faster four-on-the-floor (their groove may repeat: the license is in the marks) than
// where the beat breaks or the side is slow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marksOf } from '../src/ring-subsections.ts';
import { lanesOf } from '../src/control.ts';
import { lean } from '../src/lean.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A planned theme as far as the ring reads it. */
export interface RingTheme { bars: number; barSeconds: number; arrangement: { sections: ReadonlyArray<{ startBar: number; bars: number }> };
  events: ReadonlyArray<unknown>; timeline: ReadonlyArray<unknown>; moments?: unknown; phrasing?: unknown }

export interface Liveliness { minutes: number; marks: number; perMin: number; longestS: number; longestAt: number; cluster: number;
  fill: number; chess: number; depth: number }

const r3 = (x: number) => +x.toFixed(3);
const cv = (xs: number[]) => { if (xs.length < 2) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; if (!(m > 0)) return 0; const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; return Math.sqrt(v) / m; };

export function livelinessOf(plan: RingTheme): Liveliness {
  const bars = plan.bars, bs = plan.barSeconds, minutes = bars * bs / 60;
  // ----- the marks: every section line, every sub mark (`marksOf`: the moments, or the phrasing on an older track) -----
  const subs = marksOf(plan as Parameters<typeof marksOf>[0], bars);
  const lines = plan.arrangement.sections.map((s) => s.startBar).filter((b) => b >= 0 && b < bars);
  const starts = [...new Set([...lines, ...subs.map((m) => m.from)])].sort((a, b) => a - b);
  // what covers the rim: a span over its bars, a line or a stroke at its bar line (a pair at both its lines)
  const covers: Array<[number, number]> = [...lines.map((b): [number, number] => [b, b]), [bars, bars]];
  for (const m of subs) {
    if (m.to > m.from && m.kind !== 'drop-out') covers.push([m.from, m.to]);
    else { covers.push([m.from, m.from]); if (m.to > m.from) covers.push([m.to, m.to]); }
  }
  covers.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let reach = 0, longest = 0, longestAt = 0;
  for (const [a, z] of covers) { if (a - reach > longest) { longest = a - reach; longestAt = reach; } reach = Math.max(reach, z); }
  const gaps = starts.slice(1).map((b, i) => b - starts[i]).concat(starts.length ? [bars - starts[starts.length - 1]] : []);
  // ----- the lanes, as the rim draws them -----
  const lanes = lanesOf(plan as unknown as Parameters<typeof lanesOf>[0])!;
  const ink = new Array<number>(bars).fill(0);
  let on = 0, full = 0;
  for (const id of lanes.order) {
    const L = lanes.level[id];
    for (let b = 0; b < bars; b++) { ink[b] += L[b]; if (L[b] > 0) on++; if (L[b] === 3) full++; }
  }
  const cells = Math.max(1, lanes.order.length * bars);
  return {
    minutes: r3(minutes), marks: lines.length + subs.length, perMin: r3((lines.length + subs.length) / minutes),
    longestS: +(longest * bs).toFixed(1), longestAt, cluster: r3(cv(gaps)),
    fill: r3(on / cells), chess: r3(full / cells), depth: r3(cv(ink)),
  };
}

// ----- the band -----

interface Band { perMin: number; longestS: number; chess: number }
interface BandRow { id: string; leastBpm?: number; underBpm?: number; centre: Record<string, number>; band: Band; lean: Record<keyof Band, Record<string, number>> }
const ROWS: BandRow[] = (JSON.parse(fs.readFileSync(path.join(HERE, '..', 'recipes', 'arrangement', 'liveliness.json'), 'utf8')) as { rows: BandRow[] }).rows;

/** The band a theme is read against: its tempo's row (the slow side's own, or the groove's), each number leaned by the birds the row names about the house's own. */
export function bandOf(spell: Readonly<Record<string, number>>, bpm: number): Band {
  const row = ROWS.find((r) => (r.underBpm == null || bpm < r.underBpm) && (r.leastBpm == null || bpm >= r.leastBpm)) ?? ROWS[ROWS.length - 1];
  const leaned = (k: keyof Band) => {
    let x = row.band[k];
    for (const [bird, v] of Object.entries(row.lean[k] ?? {})) x *= lean(v, spell[bird], 1, row.centre[bird]);
    return x;
  };
  return { perMin: r3(leaned('perMin')), longestS: +leaned('longestS').toFixed(1), chess: r3(Math.min(1, leaned('chess'))) };
}

/** Where a theme falls outside its band: each reading under its floor or over its ceiling, said once. */
export function outOfBand(x: Liveliness, band: Band): string[] {
  const out: string[] = [];
  if (x.perMin < band.perMin) out.push(`${x.perMin.toFixed(1)} marks a minute (floor ${band.perMin.toFixed(1)})`);
  if (x.longestS > band.longestS) out.push(`${x.longestS.toFixed(0)} s unmarked (at most ${band.longestS.toFixed(0)})`);
  if (x.chess > band.chess) out.push(`chess ${x.chess.toFixed(2)} (ceiling ${band.chess.toFixed(2)})`);
  return out;
}
