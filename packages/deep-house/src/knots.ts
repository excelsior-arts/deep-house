/** A knot curve over nought to one, read at `u` (straight between knots, held outside them): the contour idiom's one reader. */
export function arcAt(knots: ReadonlyArray<readonly [number, number]>, u: number): number {
  if (u <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (u <= knots[i][0]) {
    const [a, x] = knots[i - 1], [b, y] = knots[i];
    return x + ((u - a) / (b - a)) * (y - x);
  }
  return knots[knots.length - 1][1];
}
