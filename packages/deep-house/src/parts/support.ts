// A phrase reserves a span of harmonic space, not just its individual attacks.
// The style owns clearance; the caller supplies actual section/lane activity.
export function sustainedSupport(active: readonly boolean[], clearanceBeats: number) {
  if (!Number.isFinite(clearanceBeats) || clearanceBeats < 0 || clearanceBeats > 16)
    throw new Error('support: invalid sustained clearance');
  let next = Infinity;
  const until = new Array<number>(active.length);
  for (let bar = active.length - 1; bar >= 0; bar--) {
    if (active[bar]) next = bar;
    until[bar] = next * 4 - clearanceBeats;
  }
  return {
    reserved: active,
    /** The latest dry release end, on the theme's beat clock. */
    until,
  };
}
