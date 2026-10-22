// **The throne, B5 · Four steps** (his pick 10-20, from the design round): four concentric arcs stepping up from the
// rim, each shorter and finer than the one under it, their gaps narrowing like perspective (no risers, no ticks, no
// posts), and the shackle ring set tight on top with **the save** in it: a thin plus and a small centre dot.
//
// In the wireframe's units: the rim at radius 96 about the ring's centre, angles from twelve o'clock. The ring draws it
// on its rim, scaled to its own units, behind its text and marks (`ring.ts`); the Playlists tab's first visit draws the
// same (`throneSvg`). **The press, Stops:** the upper three arcs close down toward the rim (`press`, wireframe units)
// and the shackle follows, tooth by tooth; on release they lift back, innermost first, with no overshoot (index.html).

/** The steps: radius, half-angle (degrees), weight (the design's, in the wireframe's units), and how far a press closes it. */
export const THRONE_STEPS: ReadonlyArray<{ r: number; half: number; w: number; press: number }> = [
  { r: 98.3, half: 8, w: 1.0, press: 0 },
  { r: 100.0, half: 5.6, w: 0.85, press: 0.9 },
  { r: 101.5, half: 3.6, w: 0.7, press: 1.4 },
  { r: 102.8, half: 2.0, w: 0.6, press: 1.8 },
];
/** The shackle ring (its centre's height and radius), its weight, and the save inside it: the plus's arm and the dot. */
export const THRONE_SHACKLE = { y: -106.9, r: 3.4, w: 0.9, arm: 2.0, armW: 0.6, dot: 0.55, press: 1.8 } as const;
/** The whole glyph a fifth larger than the design (his word 10-20, "to balance it with the ring"), about its foot on the rim: the steps' heights, lengths and weights, the shackle and the press's travel. */
export const THRONE_SCALE = 1.2;
/** **Larger on a phone, for the thumb** (his word 10-21): the same glyph at this scale on a phone-size touch screen (`phoneSize`, motion.ts). */
export const THRONE_SCALE_PHONE = 1.45;
/** And on the mini player, where the ring is small and the throne is its one key at the rim (his word 10-21). */
export const THRONE_SCALE_MINI = 2;
/** The design's weights to the ring's own units: half again bolder than the first 1.7 (his word 10-21: "lines should be thicker ... more aligned to the ring itself"), its strokes standing with the ring's rim and lanes. */
export const THRONE_WEIGHT = 2.6;

export interface ThronePart { d: string; w: number; press: number; dot?: true; plus?: { x: number; y: number } }

/**
 * **The glyph's parts**, as paths in a frame where the wireframe's unit is `k` and the ring's centre stands at `cx, cy`:
 * each with its weight in that frame (`unit` per wireframe unit of weight) and how far a press closes it, at scale `Z`.
 */
export function throneParts(k: number, cx: number, cy: number, unit: number, Z = THRONE_SCALE): ThronePart[] {
  const f = (v: number) => v.toFixed(2);
  const RIM = 96;
  unit *= Z;
  const arc = (r0: number, half0: number) => {
    // a fifth larger about the rim: its height over the rim and its length grow, its centre stays the ring's
    const r = RIM + (r0 - RIM) * Z, half = (half0 * Z * r0) / r;
    const a = (half * Math.PI) / 180, R = r * k;
    return `M ${f(cx - R * Math.sin(a))} ${f(cy - R * Math.cos(a))} A ${f(R)} ${f(R)} 0 0 1 ${f(cx + R * Math.sin(a))} ${f(cy - R * Math.cos(a))}`;
  };
  const S = THRONE_SHACKLE, sy = cy + (-RIM + (S.y + RIM) * Z) * k, r = S.r * Z * k;
  const circle = (rr: number) => `M ${f(cx - rr)} ${f(sy)} A ${f(rr)} ${f(rr)} 0 1 1 ${f(cx + rr)} ${f(sy)} A ${f(rr)} ${f(rr)} 0 1 1 ${f(cx - rr)} ${f(sy)}`;
  return [
    ...THRONE_STEPS.map((s) => ({ d: arc(s.r, s.half), w: s.w * unit, press: s.press })),
    { d: circle(r), w: S.w * unit, press: S.press },
    { d: `M ${f(cx)} ${f(sy - S.arm * Z * k)} L ${f(cx)} ${f(sy + S.arm * Z * k)} M ${f(cx - S.arm * Z * k)} ${f(sy)} L ${f(cx + S.arm * Z * k)} ${f(sy)}`, w: S.armW * unit, press: S.press, plus: { x: cx, y: sy } },
    { d: circle(S.dot * Z * k), w: S.armW * unit, press: S.press, dot: true },
  ];
}

/** **The glyph on its own**, for the panel: the same parts in the wireframe's units over an arc of the rim. */
export function throneSvg(cls: string, bold = 1.25): string {
  const parts = throneParts(1, 0, 0, 0.42 * bold);
  return `<svg class="${cls}" viewBox="-18 -114 36 19.5" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`
    + `<path class="arc" d="M -17.5 -94.4 A 96 96 0 0 1 17.5 -94.4" stroke-width="0.45"/>`
    + parts.map((p) => `<path d="${p.d}" stroke-width="${p.w.toFixed(2)}"/>`).join('') + '</svg>';
}
