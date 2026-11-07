// **The stereo image follows the form** (round stereo-motion, his rule 10-31; the stereo audit's 5.5).
//
// Until this round the width only followed the parts that played: a breakdown that lost its pad narrowed, a build
// was as wide as its drop, and nothing wrote the image by the section. This writes the width stage's two numbers
// (`master.ts`: the side gain over the harmonic sum, `width.gain`, and its breathing depth, `widthDepth.gain`) as a
// line by the form, off the row `recipes/arrangement/stereo-plan.json`:
//
//   - the intro arrives narrower, and the first section after it opens over a bar or two;
//   - the breakdown is the widest moment, and breathes deepest;
//   - the build draws in across its whole length toward the drop;
//   - the drop opens from there over its first bar, to the base or a touch over it;
//   - the outro closes.
//
// The kick and the bass never pass the width stage, so the floor stays mono under every move; no voice is moved (a
// voice's seat and its own width are its row's). Tide scales the swing; a theme with no kick takes none of it (the
// row's `noKick`), because there the wash is the record and its correlation already dips under nought. No die is
// drawn and no note moves: the line is automation, which the program digest records and the plan's golden section
// does not see.
//
// Nothing here knows a genre or a place: a section is read by its kind, the birds by their numbers.

import ROW_FILE from '../recipes/arrangement/stereo-plan.json' with { type: 'json' };

export interface StereoKind { db: number; depth: number }
export interface StereoPlanRow {
  kinds: Record<string, StereoKind>;
  walk: { bars: number; outroBars: number; dropBars: number };
  tide: { at0: number; at1: number };
  noKick: { share: number };
}

const strip = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'says'));
export const STEREO_PLAN_ROW: Readonly<StereoPlanRow> = Object.freeze({
  kinds: strip(ROW_FILE.kinds) as unknown as Record<string, StereoKind>,
  walk: strip(ROW_FILE.walk) as unknown as StereoPlanRow['walk'],
  tide: strip(ROW_FILE.tide) as unknown as StereoPlanRow['tide'],
  noKick: strip(ROW_FILE.noKick) as unknown as StereoPlanRow['noKick'],
});

/** A point of the plan's lines: theme seconds and a multiple of the room's own number. */
export interface StereoPoint { t: number; value: number }

export interface StereoPlanInput {
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  barSeconds: number;
  /** the spell's Tide, 0..1 */
  tide: number;
  /** whether the theme plays a kick anywhere */
  kick: boolean;
}

/** The swing's scale for a theme: Tide's line, times the no-kick share where there is no kick. */
export function stereoSwing(input: Pick<StereoPlanInput, 'tide' | 'kick'>, row: StereoPlanRow = STEREO_PLAN_ROW): number {
  const tide = Math.min(1, Math.max(0, Number.isFinite(input.tide) ? input.tide : 0.5));
  const s = row.tide.at0 + (row.tide.at1 - row.tide.at0) * tide;
  return input.kick ? s : s * row.noKick.share;
}

/**
 * The two lines, as multiples of the room's `space.widthBase` (`width`) and `space.widthDepth` (`depth`), or `null`
 * for a theme the form never moves (one section, or every section the same kind). Each change is walked from the
 * section's first bar; a build walks its whole length.
 */
export function stereoPlanOf(input: StereoPlanInput, row: StereoPlanRow = STEREO_PLAN_ROW): { width: StereoPoint[]; depth: StereoPoint[] } | null {
  const { sections, barSeconds } = input;
  if (!sections.length || !(barSeconds > 0)) return null;
  const swing = stereoSwing(input, row);
  if (!(swing > 0)) return null;
  const kindOf = (k: string): StereoKind => row.kinds[k] ?? row.kinds.main ?? { db: 0, depth: 1 };
  const target = (k: string) => {
    const r = kindOf(k);
    return { width: +Math.pow(10, (r.db * swing) / 20).toFixed(4), depth: +(1 + (r.depth - 1) * swing).toFixed(4) };
  };
  const width: StereoPoint[] = [];
  const depth: StereoPoint[] = [];
  let was = target(sections[0].kind);
  width.push({ t: 0, value: was.width });
  depth.push({ t: 0, value: was.depth });
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const now = target(sec.kind);
    if (now.width === was.width && now.depth === was.depth) continue;
    const at = sec.startBar * barSeconds;
    const walk = sec.kind === 'build' ? sec.bars
      : sec.kind === 'drop' ? row.walk.dropBars
      : sec.kind === 'outro' ? row.walk.outroBars
      : row.walk.bars;
    const end = at + Math.max(1, Math.min(walk, sec.bars)) * barSeconds;
    width.push({ t: +at.toFixed(4), value: was.width }, { t: +end.toFixed(4), value: now.width });
    depth.push({ t: +at.toFixed(4), value: was.depth }, { t: +end.toFixed(4), value: now.depth });
    was = now;
  }
  if (width.length < 2) return null;
  return { width, depth };
}

/**
 * The plan as the graph's lines (`performance.ts`): **one source, the form's factor**. `widthForm.gain` is the plan's
 * width multiple itself (one at rest) on the width stage's side, after the room's base and its breathing; the breathing
 * depth is written over the form (`widthDepth` x depth / width) so the side breathes by the plan's own multiple of the
 * room's: the side is (base + LFO x depth x d / f) x f = base x f + LFO x depth x d.
 */
export function stereoLines(plan: { width: readonly StereoPoint[]; depth: readonly StereoPoint[] }, widthDepth: number): Array<{ param: string; curve: 'linear'; points: StereoPoint[] }> {
  const formAt = (t: number): number => {
    const w = plan.width;
    if (t <= w[0].t) return w[0].value;
    for (let i = 1; i < w.length; i++) if (t <= w[i].t) {
      const a = w[i - 1], b = w[i];
      return b.t > a.t ? a.value + (b.value - a.value) * (t - a.t) / (b.t - a.t) : b.value;
    }
    return w[w.length - 1].value;
  };
  return [
    { param: 'widthForm.gain', curve: 'linear', points: plan.width.map((p) => ({ t: p.t, value: p.value })) },
    { param: 'widthDepth.gain', curve: 'linear', points: plan.depth.map((p) => ({ t: p.t, value: +(widthDepth * p.value / formAt(p.t)).toFixed(5) })) },
  ];
}

/**
 * **For a return that keeps its impulse's width** (stereo-room's correction, reconciled at the merge): the same form
 * line inverted, so a return reaching the width stage is narrowed by exactly what the form widens it by. Its points are
 * the form's own instants; between them a ramp of 1/f and the inverse of a ramp of f differ by under 0.1 % for the
 * row's swings (±3.5 dB over a bar or more).
 */
export function returnFormPoints(plan: { width: readonly StereoPoint[] }): StereoPoint[] {
  return plan.width.map((p) => ({ t: p.t, value: +(1 / p.value).toFixed(5) }));
}
