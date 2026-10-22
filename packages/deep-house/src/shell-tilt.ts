// **The ring follows the phone's tilt in the Apple app** (round phone-tilt, his idea 10-21): the lean a hovering mouse
// gives the ring on the web, given on an iPhone or iPad by how the device is held. In a browser there is no shell
// (`window.deepHouseShell`) and nothing here runs, so the site is unchanged; the Mac's shell sends nothing (it has no
// motion sensor and keeps the mouse).
//
// The shell (ShellTilt.swift) posts the device's gravity, as CoreMotion's device motion reads it, in the device's own
// axes (x to the right of the screen held upright, y to its top, z out of its face; in g), with the interface's
// orientation. The page:
//
// - **Turns it into the screen's axes**, by the interface's orientation, so tipping right tips the ring right in
//   portrait and in landscape.
// - **Reads the tilt as a marble would:** how far gravity has moved along the screen's own x and y, which is how much
//   lower one edge stands than the other. A steering-wheel turn and a roll of a flat phone both count; a phone turned
//   on the spot like a door does not, because gravity does not see it.
// - **Neutral is the way he holds the phone:** the reference is the gravity of a few seconds ago (`REF_S`), so held at
//   any angle, lying down or standing, the ring settles flat; only a change of how it is held leans it.
// - **Calm:** the lean is smoothed (`SMOOTH_S`) before the ring's own ease, and saturates softly (`FULL`) at the
//   hover's 4°.
//
// A finger, a drag, the throne's hold and Reduce Motion are the ring's to judge (`lean` in ring.ts). Nothing here
// changes what plays.

type Message = { kind: string; [k: string]: unknown };
type Vec = [number, number, number];

/** The reference drifts to the present with this time constant, in seconds: a held change settles back to flat (95 %) in about three of these. */
export const REF_S = 4;   // 3 settled too soon on his iPhone (10-21: "too slow" to show)
/** The lean's own smoothing, in seconds: a hand's tremor and a walk's bob are gone before the ring sees them. */
export const SMOOTH_S = 0.12;   // 0.5 lagged behind the hand on his iPhone (10-21); a tremor is still gone
/** The tilt at which the lean is three quarters of the hover's, as gravity's share along an axis (0.15, about 8.6°). */
export const FULL = 0.15;
/** No word from the shell for this long and the lean goes back to flat (the shell says something twice a second while it runs). */
const QUIET_MS = 2000;
/** A gap longer than this starts over from the present, so nothing that happened while it slept leans the ring. */
const GAP_MS = 1000;

/** The device's axes in the screen's, for UIKit's interface orientation (the shell's word for it). */
export function toScreen(g: Vec, o: string): Vec {
  const [x, y, z] = g;
  switch (o) {
    case 'portraitUpsideDown': return [-x, -y, z];
    // the device turned a quarter to the left: its top at the screen's left, its x pointing up the screen
    case 'landscapeRight': return [-y, x, z];
    // a quarter to the right: its top at the screen's right
    case 'landscapeLeft': return [y, -x, z];
    default: return [x, y, z];
  }
}

const unit = (v: Vec): Vec | null => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > 0.5 && n < 1.5 ? [v[0] / n, v[1] / n, v[2] / n] : null;
};

/**
 * **The filter, on its own** (exported for the checks): each reading of gravity (in the screen's axes, any length near
 * one g) with the seconds since the last, to the lean as fractions of the ring's most, `[x, y]`: `x` the rotation about
 * the screen's horizontal axis (positive sinks the top, as CSS's `rotateX`), `y` about its vertical (positive sinks the
 * right, as `rotateY`). A right edge held lower sinks the ring's right; a top held lower sinks its top.
 */
export function tiltFilter(): { step(g: Vec, dt: number): [number, number]; reset(): void } {
  let ref: Vec | null = null;
  let out: [number, number] = [0, 0];
  return {
    reset() { ref = null; out = [0, 0]; },
    step(raw, dt) {
      const g = unit(raw);
      if (!g) return out;
      if (!ref) { ref = g; out = [0, 0]; return out; }
      const k = 1 - Math.exp(-Math.max(0, dt) / REF_S);
      ref = unit([ref[0] + (g[0] - ref[0]) * k, ref[1] + (g[1] - ref[1]) * k, ref[2] + (g[2] - ref[2]) * k]) ?? g;
      // how much lower the right edge, and the top, stand now than they did
      const want: [number, number] = [Math.tanh((g[1] - ref[1]) / FULL), Math.tanh((g[0] - ref[0]) / FULL)];
      const s = 1 - Math.exp(-Math.max(0, dt) / SMOOTH_S);
      out = [out[0] + (want[0] - out[0]) * s, out[1] + (want[1] - out[1]) * s];
      return out;
    },
  };
}

/**
 * **Start listening to the shell's tilt.** `lean` is the ring's: the target as fractions of its most lean (`[x, y]`
 * as `tiltFilter`'s), which the ring takes or leaves (a finger wins). Nothing in a browser.
 */
export function startShellTilt(lean: (x: number, y: number) => void): void {
  const s = typeof window !== 'undefined' ? window.deepHouseShell : undefined;
  if (!s || typeof s.on !== 'function' || s.platform === 'macos') return;
  const f = tiltFilter();
  let at = 0;
  let orientation = '';
  let quiet = 0;
  const flat = () => { f.reset(); at = 0; lean(0, 0); };
  s.on('tilt', (m: Message) => {
    clearTimeout(quiet);
    if (m.off) { flat(); return; }
    const g = Array.isArray(m.g) ? (m.g as unknown[]).map(Number) : [];
    if (g.length !== 3 || !g.every(Number.isFinite)) return;
    const o = typeof m.o === 'string' ? m.o : 'portrait';
    const now = performance.now();
    // a turn of the screen, or a long gap, starts from the present: no jump
    if (o !== orientation || !at || now - at > GAP_MS) f.reset();
    orientation = o;
    const [x, y] = f.step(toScreen(g as Vec, o), at ? (now - at) / 1000 : 0);
    at = now;
    lean(x, y);
    quiet = window.setTimeout(flat, QUIET_MS);
  });
}
