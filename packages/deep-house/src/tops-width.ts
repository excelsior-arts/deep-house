// **The top's width and colour** (round tops-bus-2, 11-02; his picks on the top end's table: T22, T24, T32).
//
// Our top is narrow where the sources' is wide (6-16 kHz at -7.8 dB of side against their -5.6) and wide where theirs is
// narrow: their hats sit near the middle, tight, and the width is the quieter players around them. This file writes,
// off the row `recipes/arrangement/tops-width.json`, each block its own switch:
//
//   **the centre** (T22)   the offbeat hat in the middle (its pan draw scaled down, its room send narrowed); the
//                          sixteenths' hiss panned wider around it; the tops bus's side shelved down under 4.5 kHz (the
//                          hat's body a point) and up over 9 (its air wide), so the higher a part sits the wider it is.
//   **the form** (T24)     the bus's side stepping with the sections at constant power: a section kind opens it or draws
//                          it in, a long main comes home on its 16-bar line, and a breakdown's remaining top stands to
//                          one side and comes home with the drop.
//   **the character** (T32) the hats' and the shaker's lid moved per theme by Zephyr and a die of its own, trimmed where it
//                          opens so the colour changes and the level never rises.
//
// No width here is anti-phase: the hats reach the bus at a correlation near 0.8 (side about 9 dB under mid), and the
// shelf and the steps together stay well inside that (`tools/tops-bus-2-width.py` measures the lowest bar). Nothing
// knows a genre or a place.

import ROW_FILE from '../recipes/arrangement/tops-width.json' with { type: 'json' };
import Rng from './rng.ts';
import type { Sec } from './tops-bus.ts';

export interface WidthRow {
  centre: { hatPan: number; roomMul: number; voices: string[]; sixteenthPan: [number, number]; low: [number, number]; high: [number, number]; trimPerDb: number };
  form: { open: Record<string, number>; line: number; range: [number, number]; dbPerOctave: number; sideShare: number; breakPan: number };
  character: { centre: [number, number]; spread: number; octaves: [number, number]; trimPerOct: number };
}

const strip = (o: unknown): unknown => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => k !== 'says').map(([k, v]) => [k, strip(v)])) : o);
export const WIDTH_ROW: Readonly<WidthRow> = Object.freeze({
  centre: strip(ROW_FILE.centre), form: strip(ROW_FILE.form), character: strip(ROW_FILE.character),
} as unknown as WidthRow);

const by = (x: number, [a, b]: readonly [number, number]) => a + (b - a) * Math.min(1, Math.max(0, x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r4 = (x: number) => +x.toFixed(4);

export interface WidthBirds { tide: number; zephyr: number }

/** The bus's width lines (T22's side shelves, by Tide; T24's side and mid gains, by the steps), in theme seconds. */
export interface WidthLines { low: Pt[]; high: Pt[]; side: Pt[] | null; mid: Pt[] | null }
interface Pt { t: number; value: number }

/**
 * The bus's width lines: T22's two shelves static from the theme's start (none where T22 is off), and T24's steps as
 * the side's gain (`dbPerOctave` of side for each doubling of the step's multiple) with the mid's made up for the
 * power (the side taken as `sideShare` of the mid's power, the hats' own), each step landing on its bar line in
 * `rampS` seconds.
 */
export function widthLinesOf(birds: WidthBirds, steps: readonly WidthStep[], barSeconds: number, on: { centre: boolean; form: boolean; hats: boolean }, row: WidthRow = WIDTH_ROW): WidthLines | null {
  const F = row.form;
  const low = [{ t: 0, value: on.centre ? r4(by(birds.tide, row.centre.low)) : 0 }];
  // a top of hiss alone (no offbeat hat) is two unrelated ears already (correlation near 0.5, under 0 in a bar of
  // Vibe - Night Side when widened): no shelf up, and the form only draws it in, never out
  const high = [{ t: 0, value: on.centre && on.hats ? r4(by(birds.tide, row.centre.high)) : 0 }];
  let side: Pt[] | null = null, mid: Pt[] | null = null;
  if (on.form && steps.some((s) => (on.hats ? s.open !== 1 : s.open < 1))) {
    side = []; mid = [];
    const RAMP = 0.02;
    let prev = { s: 1, m: 1 };
    for (const st of steps) {
      const sg = 10 ** ((F.dbPerOctave * Math.log2(on.hats ? st.open : Math.min(1, st.open))) / 20);
      const mg = Math.sqrt(Math.max(0.25, 1 + F.sideShare * (1 - sg * sg)));
      const t = st.from * barSeconds;
      if (t > 0) { side.push({ t: r4(Math.max(0, t - RAMP)), value: r4(prev.s) }); mid.push({ t: r4(Math.max(0, t - RAMP)), value: r4(prev.m) }); }
      side.push({ t: r4(t), value: r4(sg) }); mid.push({ t: r4(t), value: r4(mg) });
      prev = { s: sg, m: mg };
    }
  }
  if (!on.centre && !side) return null;
  return { low, high, side, mid };
}

/** One step of the form's width: from a bar, the multiple on T22's width, and why. */
export interface WidthStep { from: number; open: number; why: string }

/**
 * **The form's width** (T24): the multiple on the top's width, section by section and on a long main's 16-bar line,
 * Tide setting the range. A theme with the form switched off is one throughout.
 */
export function widthStepsOf(sections: readonly Sec[], birds: WidthBirds, on: boolean, row: WidthRow = WIDTH_ROW): WidthStep[] {
  if (!on) return [{ from: 0, open: 1, why: 'home' }];
  const F = row.form;
  const range = by(birds.tide, F.range);
  const firstMain = sections.findIndex((s) => s.kind === 'main');
  const out: WidthStep[] = [];
  sections.forEach((s, i) => {
    const kind = s.kind === 'main' && i === firstMain ? 'firstMain' : s.kind;
    const raw = F.open[kind] ?? 1;
    const open = r4(1 + (raw - 1) * range);
    out.push({ from: s.startBar, open, why: kind });
    if ((s.kind === 'main' || s.kind === 'drop') && s.bars > F.line && open !== 1) out.push({ from: s.startBar + F.line, open: 1, why: `${kind}, home on its ${F.line}-bar line` });
  });
  // a step that changes nothing is not a step
  return out.filter((x, k) => k === 0 || x.open !== out[k - 1].open);
}

/** What the width rules did to a theme, for the readouts. */
export interface WidthRead { birds: WidthBirds; centre: boolean; sixteenthPan: number; steps: WidthStep[]; breakSide: number; hats: number; sixteenths: number }

interface Ev { voice: string; bar?: number; layer?: string; p: Record<string, unknown> }

/**
 * **The centre and the form, on the events** (T22, T24): the offbeat hits' pan drawn in and their room send
 * narrowed; the sixteenths' noise voices panned wider; in a breakdown the top to the theme's side; `gainDb` on all of
 * them (the trims that keep the level). Over the events as they stand, after every die: their own pan draws are scaled, never
 * redrawn, so nothing else of the theme moves.
 */
export function widthEvents(events: Ev[], input: { sections: readonly Sec[]; birds: WidthBirds; seed: string | number; hatLayers: ReadonlySet<string>; sixteenthLayers: ReadonlySet<string>;
  on: { centre: boolean; form: boolean }; gainDb?: number }, row: WidthRow = WIDTH_ROW): WidthRead {
  const C = row.centre, F = row.form;
  const steps = widthStepsOf(input.sections, input.birds, input.on.form, row);
  const breaks = input.on.form ? input.sections.filter((s) => s.kind === 'breakdown') : [];
  const inBreak = (bar: number) => breaks.some((s) => bar >= s.startBar && bar < s.startBar + s.bars);
  const side = new Rng(`${input.seed}::tops:side`).chance(0.5) ? 1 : -1;
  const k0 = by(input.birds.tide, C.sixteenthPan);
  const voices = new Set(C.voices);
  // the trims (T22's shelf, T32's opened lid) on the notes themselves, so a kit hat takes them as a ladder hat does
  const k = 10 ** ((input.gainDb ?? 0) / 20);
  // never rounded: a note's gain already carries the lane's own relations (a recipe's supporting presence is a ratio
  // on the candidate's trim, checked to 1e-8), and a rounded product broke them by up to 3e-5 (tops-bus-2's integration)
  const gained = (p: Record<string, unknown>) => (k === 1 ? {} : { gain: (typeof p.gain === 'number' ? p.gain : 1) * k });
  let hats = 0, sixteenths = 0;
  for (const e of events) {
    if (e.bar == null || !e.layer) continue;
    const isHat = input.hatLayers.has(e.layer);
    const isSixteenth = !isHat && input.sixteenthLayers.has(e.layer) && voices.has(e.voice);
    if (!isHat && !isSixteenth) continue;
    const pan0 = typeof e.p.pan === 'number' ? e.p.pan : 0;
    const lean = inBreak(e.bar) ? side * F.breakPan : 0;
    if (isHat) {
      const pan = input.on.centre ? pan0 * C.hatPan : pan0;
      e.p = { ...e.p, pan: r4(clamp(pan + lean, -1, 1)), ...(input.on.centre ? { roomMul: C.roomMul } : {}), ...gained(e.p) };
      hats++;
    } else {
      const wide = input.on.centre ? k0 : 1;
      e.p = { ...e.p, pan: r4(clamp(pan0 * wide + lean, -0.9, 0.9)), ...gained(e.p) };
      sixteenths++;
    }
  }
  return { birds: input.birds, centre: input.on.centre, sixteenthPan: r4(k0), steps, breakSide: breaks.length ? side : 0, hats, sixteenths };
}

/** T22's trim on the hats, in dB: the high shelf's added side power taken back, so the top is wider and never louder. */
export function centreTrimDb(birds: WidthBirds, row: WidthRow = WIDTH_ROW): number {
  return r4(-row.centre.trimPerDb * by(birds.tide, row.centre.high));
}

/** The hats' air for a theme (T32): the lid's octave share, its multiple, and the trim that keeps the level. */
export interface Character { oct: number; lidMul: number; trimDb: number }

/** **Air as the track's character** (T32): the lid moved per theme, by Zephyr and a die of its own; trimmed where it opens. */
export function characterOf(seed: string | number, birds: WidthBirds, row: WidthRow = WIDTH_ROW): Character {
  const K = row.character;
  const u = new Rng(`${seed}::tops:air`).float(-1, 1);
  // the ceiling leans with Zephyr too: a theme at Zephyr nought never opens its lid (dark stays dark; it may get darker)
  const oct = r4(clamp(by(birds.zephyr, K.centre) + K.spread * u, K.octaves[0], by(birds.zephyr, [0, K.octaves[1]])));
  return { oct, lidMul: r4(2 ** oct), trimDb: r4(-K.trimPerOct * Math.max(0, oct)) };
}
