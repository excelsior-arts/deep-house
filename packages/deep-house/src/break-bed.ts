// **A break must breathe, not blast** (round long-main, pass 3; his ear 11-04 on house seed 190's first break: *"after
// fairly spacious acoustic we blast with Drone pad strings and it doesn't even feel like break, the formula on this part
// should be tuned up a bit"*).
//
// The formula as it was: a breakdown rolls its own harmonic layers (`harmonyOf`, the section's own stream), so a groove
// played by the keys alone may break into a held bed it never had; the bed comes in whole at the line, with no kick to
// duck it, the breakdown's lift on the melodic bus (1.4 dB, held to the groove's ducked power where `breakdownBed` reads
// one), and the desk brings a bed with no kick under it to the front (its level up, its low-pass open, drier). Read off
// seed 190's renders: the main -15.7 LUFS, the break -11.2, the bed alone -11.5.
//
// The reading: a break's loudest block against the groove's last bars before it, off the plan the way the hat floor
// reads the highs (`stretchK` in set-plan.ts: the tops table's K-weighted energy of every note at its gain, its lane's
// level and the mix's lines, the kick's duck where it plays); checked against renders (seed 190 +4.5 read, +4.5 heard;
// house seed 100's half-break +4.4 and +5.0; Cloudburst's next theme's -3.7 and -2.9).
//
// The answers he heard, each under the same ceiling; every build plays mine, his pick (11-04), and a lab tool may
// set another (`globalThis.__BREAK_BED__`):
//   ceiling  the break as drawn, never louder than the groove it interrupts (`ceilingDb` under it; a ceiling, not a
//            flat cut: a break under it is left as it is), half-breaks too
//   keep     the break keeps the groove's own voice (the harmonic roll of the groove before it), thinned: darker, wetter
//            and softer; a bed the groove had stays
//   grow     the break's own texture, but a bed the groove did not have enters low and dark and grows over the break,
//            under a lower ceiling (`newBedCeilingDb`)
//   mine     the groove's voice carries the break's first half; its own texture comes in for the second, a new bed
//            growing under it into the drop
// The half-breaks (b2) keep their texture and take the ceiling. Nothing here names a place, a genre or a seed.
import ROW_FILE from '../recipes/arrangement/break-bed.json' with { type: 'json' };

export interface BreakBedRow {
  leastBpm: number; ceilingDb: number; newBedCeilingDb: number; blockBars: number; grooveBars: number;
  keep: { toneMul: number; reverbMul: number; delayMul: number; velMul: number };
  grow: { fromDb: number; toDb: number; toneFrom: number; toneTo: number };
}
export const BREAK_BED = ROW_FILE as unknown as BreakBedRow;

export type BreakSketch = '' | 'ceiling' | 'keep' | 'grow' | 'mine';
/**
 * The sketch every build plays: **mine** (his pick, 11-04: "a pure improvement … without obvious downsides"). A node
 * tool may set `globalThis.__BREAK_BED__` to hear another (ceiling, keep, grow) or `none` for the breaks as drawn.
 */
export function breakSketch(): BreakSketch {
  const s = (globalThis as { __BREAK_BED__?: string }).__BREAK_BED__;
  if (s == null) return 'mine';
  return (['ceiling', 'keep', 'grow', 'mine'].includes(s) ? s : '') as BreakSketch;
}

interface Ev { layer: string; voice: string; t: number; bar?: number; p: Record<string, unknown> }
interface Sec { kind: string; startBar: number; bars: number; index: number; roll?: number; half?: true }
interface BreakPlan { bars: number; barSeconds: number; bpm: number; events: Ev[]; arrangement: { sections: readonly Sec[] }; automation?: { partSpace?: unknown } }

const HELD = new Set(['pad']);
const MELODIC = new Set(['pad', 'keys', 'bass', 'fx']);

export interface BreakRead {
  /** the break's section and bars, the groove's bars read before it */
  section: number; from: number; to: number; groove: [number, number];
  /** its loudest block against the groove, dB */
  overDb: number | null;
  /** the bed voices it plays that the groove before it did not */
  newBed: string[];
  half: boolean;
  /**
   * read and answered: the groove before it beat-led (its kick on, at the row's tempo or over: the deep and slow places
   * keep their breaks), and the theme's parts not in a space of their own (the liquid places' part space, whose exposed
   * passages are their own grammar and which the read does not model: it read them 4 to 12 dB over their renders)
   */
  beatLed: boolean;
}

/** Each break that interrupts a groove (a breakdown right after a main or a drop): its level against it, and its new bed. */
export function readBreaks(track: BreakPlan, readK: (fromBar: number, toBar: number) => number | null, row: BreakBedRow = BREAK_BED): BreakRead[] {
  const secs = track.arrangement.sections, bs = track.barSeconds;
  const out: BreakRead[] = [];
  const voices = (from: number, to: number) => new Set(track.events.filter((e) => HELD.has(e.layer) && e.t < to * bs && e.t + Number(e.p.dur ?? 0) > from * bs + 0.1).map((e) => e.voice));
  secs.forEach((s, i) => {
    const prev = secs[i - 1];
    if (s.kind !== 'breakdown' || !prev || (prev.kind !== 'main' && prev.kind !== 'drop')) return;
    const g0 = Math.max(prev.startBar, s.startBar - row.grooveBars), g1 = s.startBar;
    const groove = readK(g0, g1);
    let loud: number | null = null;
    for (let b = s.startBar; b < s.startBar + s.bars; b += row.blockBars) {
      const k = readK(b, Math.min(s.startBar + s.bars, b + row.blockBars));
      if (k != null && (loud == null || k > loud)) loud = k;
    }
    const had = voices(prev.startBar, prev.startBar + prev.bars);
    const kicked = track.events.some((e) => e.layer === 'kick' && e.t >= g0 * bs && e.t < g1 * bs);
    out.push({ section: i, from: s.startBar, to: s.startBar + s.bars, groove: [g0, g1], overDb: groove != null && loud != null ? +(loud - groove).toFixed(2) : null,
      newBed: [...voices(s.startBar, s.startBar + s.bars)].filter((v) => !had.has(v)), half: !!s.half, beatLed: kicked && track.bpm >= row.leastBpm && !track.automation?.partSpace });
  });
  return out;
}

/** The notes a break owns: struck inside it, above the drums. */
const inBreak = (e: Ev, r: BreakRead, bs: number) => MELODIC.has(e.layer) && e.t >= r.from * bs - 1e-6 && e.t < r.to * bs - 1e-6;

/**
 * **The ceiling**: where a break's loudest block stands over the groove by more than the row's ceiling (a break with a
 * bed the groove did not have, under the lower one), every note it owns above the drums comes down by the excess; a
 * break under it is left as it is. Returns the cuts, in dB, by the break's first bar.
 */
export function breakCeiling(track: BreakPlan, reads: readonly BreakRead[], row: BreakBedRow = BREAK_BED, strictNew = false): Record<number, number> {
  const bs = track.barSeconds, cuts: Record<number, number> = {};
  for (const r of reads) {
    if (r.overDb == null || !r.beatLed) continue;
    const ceiling = strictNew && r.newBed.length ? row.newBedCeilingDb : row.ceilingDb;
    const cut = Math.min(0, ceiling - r.overDb);
    if (cut >= -0.05) continue;
    const g = Math.pow(10, cut / 20);
    for (const e of track.events) if (inBreak(e, r, bs)) e.p = { ...e.p, gain: Math.round(Number(e.p.gain ?? 1) * g * 10000) / 10000 };
    cuts[r.from] = +cut.toFixed(2);
  }
  return cuts;
}

/** **Keep**: where the break would bring a bed the groove did not have, the groove's own voice through it (its roll, in the generator), thinned: darker, wetter, softer. */
export function keepThin(track: BreakPlan & { breakKept?: number[] }, reads: readonly BreakRead[], row: BreakBedRow = BREAK_BED, fromHalf = false): number {
  const bs = track.barSeconds, K = row.keep;
  let n = 0;
  for (const r of reads) {
    // (only a break whose roll the groove's took: one that would have brought a bed the groove did not have)
    if (r.half || !r.beatLed || !track.breakKept?.includes(r.from)) continue;
    const to = fromHalf ? r.from + Math.max(4, Math.floor((r.to - r.from) / 2)) : r.to;
    for (const e of track.events) {
      if (e.layer !== 'keys' || e.t < r.from * bs - 1e-6 || e.t >= to * bs - 1e-6) continue;
      const p = { ...e.p, toneMul: K.toneMul, vel: +(Number(e.p.vel ?? 1) * K.velMul).toFixed(4) } as Record<string, unknown>;
      if (typeof e.p.reverb === 'number') p.reverb = +Math.min(1, e.p.reverb * K.reverbMul).toFixed(4);
      if (typeof e.p.hall === 'number') p.hall = +Math.min(1, e.p.hall * K.reverbMul).toFixed(4);
      if (typeof e.p.delay === 'number') p.delay = +Math.min(0.85, e.p.delay * K.delayMul).toFixed(4);
      e.p = p; n++;
    }
  }
  return n;
}

/**
 * **Grow**: a bed the groove did not have enters low and dark and grows to its own level and tone over the stretch it
 * plays in the break (from `fromBar`, the break's first by default): each strike's gain and tone placed on the line from
 * the row's start to its end by where the strike falls.
 */
export function growBeds(track: BreakPlan, reads: readonly BreakRead[], row: BreakBedRow = BREAK_BED, fromHalf = false): number {
  const bs = track.barSeconds, G = row.grow;
  let n = 0;
  for (const r of reads) {
    if (r.half || !r.beatLed || !r.newBed.length) continue;
    const a = fromHalf ? r.from + Math.max(4, Math.floor((r.to - r.from) / 2)) : r.from;
    const span = Math.max(1, r.to - a);
    for (const e of track.events) {
      if (!r.newBed.includes(e.voice) || !HELD.has(e.layer) || e.t < a * bs - 1e-6 || e.t >= r.to * bs - 1e-6) continue;
      const x = Math.max(0, Math.min(1, (e.t / bs - a) / span));
      const db = G.fromDb + (G.toDb - G.fromDb) * x, tone = G.toneFrom + (G.toneTo - G.toneFrom) * x;
      const end = Math.min(1, x + Number(e.p.dur ?? 0) / bs / span);
      e.p = { ...e.p, gain: Math.round(Number(e.p.gain ?? 1) * Math.pow(10, db / 20) * 10000) / 10000,
        toneMul: [+tone.toFixed(3), +(G.toneFrom + (G.toneTo - G.toneFrom) * end).toFixed(3)] };
      n++;
    }
  }
  return n;
}

/** The harmonic roll a breakdown bar plays under the sketch (the groove's before it), or null for its own. */
export function breakRoll(sketch: BreakSketch, sections: readonly Sec[], section: Sec, bar: number, bpm: number, row: BreakBedRow = BREAK_BED): number | null {
  if ((sketch !== 'keep' && sketch !== 'mine') || section.kind !== 'breakdown' || section.half || bpm < row.leastBpm) return null;
  const prev = sections[section.index - 1];
  if (!prev || (prev.kind !== 'main' && prev.kind !== 'drop')) return null;
  if (sketch === 'mine' && bar >= section.startBar + Math.max(4, Math.floor(section.bars / 2))) return null;
  return prev.roll ?? prev.index;
}
