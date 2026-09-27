// The ring's colour, as a function of the eight birds.
//
// Ported unchanged in arithmetic from the lab script the sheet
// `notes/diagrams/colours.md` was drawn with. Two things moved on the way in,
// and both are the point of porting it at all: the house vector and the house
// box are **imported from `spell.ts`** rather than written out again, so there
// is one house in the tree and not two; and the tests are `tools/check.ts`'s,
// because a file that checks itself only when somebody runs it is not checked.
//
// The one rule everything here is built around: **at the house vector it returns
// today's gold, exactly** — the same four hex stops the page's `#gold` gradient
// has always carried. A bird sitting at its house value contributes nothing to
// the sum at all, so the deep house region is gold by construction rather than
// by tuning, and the two measured rooms come out as gold with a harder or a
// softer edge.
//
// Everything is done in OKLab. sRGB is never averaged: halfway from the gold to
// blue in sRGB is a muddy olive, and the whole point is that a listener reads
// the colour as a mood.
//
// Pure: no DOM, no imports but the spell's own constants, and nothing in here
// knows that a ring exists.

import { HOUSE, HOUSE_BOX, type Bird, type Spell } from './spell.ts';

export { HOUSE, HOUSE_BOX };

// ==========================================================================
// sRGB <-> OKLab, Björn Ottosson's matrices
export type Rgb = [number, number, number];
export type Lab = [number, number, number];
export type Lch = [number, number, number];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function srgbToOklab([r, g, b]: Rgb): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function oklabToSrgb([L, A, B]: Lab): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    gam(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gam(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

const D = Math.PI / 180;
export const lchToLab = (L: number, C: number, h: number): Lab => [L, C * Math.cos(h * D), C * Math.sin(h * D)];
export const labToLch = ([L, a, b]: Lab): Lch => [L, Math.hypot(a, b), ((Math.atan2(b, a) / D) % 360 + 360) % 360];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
export const rgbToHex = ([r, g, b]: Rgb) =>
  `#${((1 << 24) + (byte(r) << 16) + (byte(g) << 8) + byte(b)).toString(16).slice(1)}`;
export const hexToLch = (hex: string): Lch => labToLch(srgbToOklab(hexToRgb(hex)));

const inGamut = ([r, g, b]: Rgb) => {
  const e = 1e-6;
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
};

/** WCAG contrast against the page's ground, which is pure black. */
export function contrastOnBlack(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05) / 0.05;
}

/**
 * Keep the lightness and the hue, give up chroma: a hue that cannot be that
 * colourful at that lightness goes quiet rather than shifting to another hue.
 */
export function gamutClamp(L: number, C: number, h: number): Lch {
  if (inGamut(oklabToSrgb(lchToLab(L, C, h)))) return [L, C, h];
  let lo = 0, hi = C;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToSrgb(lchToLab(L, mid, h)))) lo = mid; else hi = mid;
  }
  return [L, lo, h];
}

export const lchToHex = (L: number, C: number, h: number) => {
  const [l, c, hh] = gamutClamp(L, C, h);
  return rgbToHex(oklabToSrgb(lchToLab(l, c, hh)));
};

/**
 * Legibility is a floor, not a hope: raise the lightness (never the hue) until
 * the colour clears the contrast the page already ships with.
 */
export function liftToContrast(L: number, C: number, h: number, floor: number): number {
  const at = (l: number) => contrastOnBlack(lchToHex(l, C, h));
  if (at(L) >= floor) return L;
  let lo = L, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= floor) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * sRGB holds very little chroma in the blues at a high lightness and very
 * little in the yellows at a low one, so a colour that cannot be as saturated
 * as it asked for spends lightness to get there — downward only, and never past
 * the floor. At the gold itself nothing moves: it is already in gamut.
 */
export function fitLightness(L: number, C: number, h: number): number {
  if (inGamut(oklabToSrgb(lchToLab(L, C, h)))) return L;
  const N = 48;
  for (let i = 1; i <= N; i++) {
    const l = L + (K.LMIN - L) * (i / N);
    if (inGamut(oklabToSrgb(lchToLab(l, C, h)))) return l;
  }
  let bl = L, bc = -1;
  for (let i = 0; i <= N; i++) {
    const l = K.LMIN + (K.LMAX - K.LMIN) * (i / N);
    const c = gamutClamp(l, C, h)[1];
    if (c > bc) { bc = c; bl = l; }
  }
  return bl;
}

// ==========================================================================
// the wheel, and the palette it is one row of
//
// In the ring's own compass order, clockwise from north — Ember north and Root
// south since round K turned the compass over (bass is gravity). Hue rises
// clockwise, which is forced rather than chosen (`notes/diagrams/colours.md`
// §1; before the mirror it rose anticlockwise, the same wheel read from the
// other side): the ring puts earth opposite fire and air opposite water, hue does not,
// and what gives way is the even spacing. Earth must be green — ochre sits
// between fire and air in hue and the bird between air and fire is Spark, not
// Root — and Veil owns the wide violet arc alone, which suits the bird that
// measures how fast things change.
//
// **A palette is the wheel and two warm numbers** (Eugene, 09-23: *"explore
// warmer sets on all hue variations"*). Both are laid on **at `m` of the way**,
// exactly as the birds' own tint is, so at the house they are nought and the
// gold is the gold to the byte whichever palette is on.
//
// - `turn` warms **every hue the ring can wear**, not only the eight on the
//   wheel: a colour's hue is turned toward `toward` by `turn · sin` of how far
//   it stands from it, so a pink fire comes round to a vermilion, a cerulean to
//   an ultramarine, a lilac to a plum, a blue-green to a green, while the warm
//   side barely moves. **The gold's own neighbourhood is shielded**: the turn
//   fades to nothing over `shield` degrees either side of the gold, because
//   the fourteen golden themes sit within 12° of it and the record must still
//   read as gold (`colours.md` §3's whole argument for `SFULL`). It is a warp
//   of the circle and not a shift of it, and gentle enough to stay monotone,
//   so no hue passes another and the compass order holds (`tools/check.ts`
//   asserts both, over the whole circle).
// - `cream` is the trip through neutral. A spell whose birds pull against each
//   other drains the ring toward the grey axis (`#c7beab`, Zephyr pulled to
//   nought); a colour quieter than `quiet` in chroma is pushed toward the
//   gold's own hue by up to `cream`, so it drains to a cream — the gold with
//   the colour taken out — instead. A colour with any real chroma of its own is
//   not touched, so the cool pole stays a real blue.
export type WheelRow = readonly [Bird, number, string];
export interface Palette {
  /** the eight hues, clockwise from north */
  wheel: ReadonlyArray<WheelRow>;
  /** the warm hue everything leans toward, in OKLCh degrees */
  toward: number;
  /** the most a hue is turned toward it at a full pull, in degrees */
  turn: number;
  /** how far either side of the gold the turn fades in over, in degrees */
  shield: number;
  /** the chroma a drained colour is pushed toward it by, and what counts as drained */
  cream: number;
  quiet: number;
}

const SHEET_WHEEL: ReadonlyArray<WheelRow> = Object.freeze([
  ['ember', 21, 'coal red'],
  ['spark', 53, 'amber'],
  ['zephyr', 85, 'gold'],          // the gold's own hue, to within a degree
  ['gleam', 123, 'leaf green'],
  ['root', 161, 'moss green'],
  ['loom', 208, 'teal'],
  ['tide', 255, 'ink blue'],
  ['veil', 318, 'violet'],
] as const);

export const PALETTES: Readonly<Record<'sheet' | 'warm', Palette>> = Object.freeze({
  // 09-18, the sheet's own (`notes/diagrams/colours.md` §1)
  sheet: Object.freeze({ wheel: SHEET_WHEEL, toward: 40, turn: 0, shield: 90, cream: 0, quiet: 0.07 }),
  // 09-23, the warmer set (`notes/rounds/ring-look.md`): the same wheel, every
  // hue it makes leaned toward a marigold, and the drained states a cream
  warm: Object.freeze({ wheel: SHEET_WHEEL, toward: 40, turn: 24, shield: 90, cream: 0.06, quiet: 0.07 }),
});

/** **The switch.** One line: `PALETTES.sheet` puts the 09-18 wheel back. */
export const PALETTE: Palette = PALETTES.warm;

/**
 * A hue leaned toward `toward` by at most `deg`, the lean fading to nothing
 * over `shield` degrees either side of the gold (a smoothstep, so its own slope
 * is gentle and the warp stays monotone round the circle).
 */
export function warp(h: number, deg: number, toward: number, shield = 90): number {
  const off = Math.abs(((h - GOLD_HUE + 540) % 360) - 180);
  const u = Math.min(1, off / shield);
  const g = u * u * (3 - 2 * u);
  return ((h - deg * g * Math.sin((h - toward) * D)) % 360 + 360) % 360;
}

/**
 * The page's own gradient, exactly as `index.html` carries it. The third stop is
 * the `--gold` token, the one ink, and it is the base everything is measured
 * from. `tools/check.ts` reads the four out of the page and compares them, so
 * this table and the markup cannot drift apart.
 */
export const GOLD_STOPS: ReadonlyArray<{ off: number; hex: string }> = Object.freeze([
  { off: 0, hex: '#fff3c8' },
  { off: 0.34, hex: '#ffd97a' },
  { off: 0.68, hex: '#f2c14e' },
  { off: 1, hex: '#b9781f' },
]);
export const BASE = 2;

export const K = Object.freeze({
  SFULL: 1.0,    // the pull length at which the gold has fully given way
  CTINT: 0.16,   // the chroma of a colour that is all bird and no gold
  KZ: 0.08,      // lightness rises with zephyr
  KR: 0.08,      // and falls with root
  LMIN: 0.74,    // the band that keeps thin strokes legible on black
  LMAX: 0.88,
  INK_FLOOR: 7,      // the base ink: what the line work is cut in
  STOP_FLOOR: 5.5,   // the gradient's dark end — today's own bronze is 5.7:1
  TYPE_FLOOR: 7,     // and the type, which may never be dimmer than the line work
  TYPE_L: 0.95,      // the lightness the words lean toward at a full pull
  TYPE_KEEP: 0.3,    // and the share of the ink's chroma they keep there
});

export const GOLD_LCH: Lch = hexToLch(GOLD_STOPS[BASE].hex);
const GOLD_HUE = GOLD_LCH[2];

/**
 * A colour written as an offset from the gold: how much lighter it is, what
 * share of the gold's chroma it carries, and how far round the wheel it sits.
 * It is how a gradient stop keeps the gradient's own shape when the base moves,
 * and since the port it is how **every** fixed colour on the ring is re-based —
 * a halo, the cursor, the beat flash — so there is one rule for all of them and
 * no second palette to keep in step.
 */
export interface Rel { dL: number; cRatio: number; dh: number; }

export const relTo = (hex: string, base: Lch = GOLD_LCH): Rel => {
  const [L, C, h] = hexToLch(hex);
  return { dL: L - base[0], cRatio: C / base[1], dh: ((h - base[2] + 540) % 360) - 180 };
};

export const STOP_REL: ReadonlyArray<Rel & { off: number }> =
  Object.freeze(GOLD_STOPS.map((s) => ({ off: s.off, ...relTo(s.hex) })));

/** The same offset laid back down on a new base, held to a contrast floor. */
export function applyRel(rel: Rel, L: number, C: number, h: number, floor: number): string {
  const sh = (h + rel.dh + 360) % 360;
  const sC = C * rel.cRatio;
  const sL = liftToContrast(Math.max(0, Math.min(1, L + rel.dL)), sC, sh, floor);
  const [cL, cC, ch] = gamutClamp(sL, sC, sh);
  return rgbToHex(oklabToSrgb(lchToLab(cL, cC, ch)));
}

// ==========================================================================
// the colour itself
//
//   S  = Σ (spell − house) · (cos hue, sin hue)      a vector on the a/b plane
//   m  = min(1, |S| / SFULL)                          how far out of the room
//   ab = (1 − m) · gold + m · CTINT · Ŝ               the gold giving way
//   L  = Lgold + KZ·Δzephyr − KR·Δroot                clamped to the band
//
// At the house vector S is zero, m is zero, and the answer is the gold to the
// last bit. A bird at its house value is not in the sum at all.
export interface RingColour {
  /** the ink: what the line work is cut in */
  hex: string;
  L: number; C: number; h: number;
  /** the four stops of the page's own gradient, moved with it */
  stops: { off: number; hex: string }[];
  /** how far out of the room the spell stands, and that clamped to 0..1 */
  pull: number; m: number;
  tintHue: number;
  contrast: number;
  /** the derived lightness before the ink's own floor lifted it */
  fit: number;
}

export function ringColour(spell: Partial<Spell> | null | undefined, palette: Palette = PALETTE): RingColour {
  const s = spell || {};
  let x = 0, y = 0;
  for (const [bird, hue] of palette.wheel) {
    const d = (s[bird] == null ? HOUSE[bird] : (s[bird] as number)) - HOUSE[bird];
    x += d * Math.cos(hue * D);
    y += d * Math.sin(hue * D);
  }
  const len = Math.hypot(x, y);
  const m = Math.min(1, len / K.SFULL);
  const [gL, gC, gh] = GOLD_LCH;
  const [, ga, gb] = lchToLab(gL, gC, gh);
  let a = len > 0 ? (1 - m) * ga + m * K.CTINT * (x / len) : ga;
  let bb = len > 0 ? (1 - m) * gb + m * K.CTINT * (y / len) : gb;

  const dz = (s.zephyr == null ? HOUSE.zephyr : s.zephyr) - HOUSE.zephyr;
  const dr = (s.root == null ? HOUSE.root : s.root) - HOUSE.root;
  const L = Math.max(K.LMIN, Math.min(K.LMAX, gL + K.KZ * dz - K.KR * dr));
  // the palette's warmth, at `m` of the way (nought at the house, so the gold
  // is untouched): a drained colour pushed toward a cream, then every hue
  // leaned toward the warm side
  const c0 = Math.hypot(a, bb);
  if (m > 0 && palette.cream > 0 && c0 < palette.quiet) {
    const push = Math.min(1, 2 * m) * palette.cream * (1 - c0 / palette.quiet);
    a += push * Math.cos(GOLD_HUE * D);
    bb += push * Math.sin(GOLD_HUE * D);
  }
  const [, C, h0] = labToLch([L, a, bb]);
  const h = m > 0 && palette.turn ? warp(h0, m * palette.turn, palette.toward, palette.shield) : h0;

  const fit = fitLightness(L, C, h);
  const [bL, bC, bh] = gamutClamp(liftToContrast(fit, C, h, K.INK_FLOOR), C, h);
  const hex = rgbToHex(oklabToSrgb(lchToLab(bL, bC, bh)));
  return {
    hex, L: bL, C: bC, h: bh, fit,
    stops: STOP_REL.map((r) => ({ off: r.off, hex: applyRel(r, fit, C, h, K.STOP_FLOOR) })),
    pull: len, m, tintHue: len > 0 ? ((Math.atan2(y, x) / D) % 360 + 360) % 360 : gh,
    contrast: contrastOnBlack(hex),
  };
}

/**
 * Any of the page's own fixed colours, re-based onto a derived one: the halos,
 * the cursor, the beat flash. It is the gradient stops' own rule applied to a
 * single colour, so **at the house every one of them comes back exactly the hex
 * the page has always carried**, which is what the byte-for-byte proof rests on.
 */
export function restyle(hex: string, colour: RingColour, floor = K.STOP_FLOOR): string {
  return applyRel(relTo(hex), colour.fit, colour.C, colour.h, floor);
}

/**
 * **The type, leaning toward white as the ring leaves the gold** (Eugene,
 * 09-23: *"give the text a bias toward white/light as the hue travels, so type
 * stays readable on every hue"*; before it, 09-20: *"gold letters with the
 * lilac ring doesn't really look that good"*).
 *
 * Round one's rule was that the type stays flat gold, because a value's colour
 * is never itself a value; the 09-20 switch (a link parameter, retired) put the words on a
 * lighter tint of the ring's own hue instead, and this is that tint made the
 * only reading and pushed further toward white. The rule survives in its real
 * form: the type still carries no reading of its own — it is **the ring's hue,
 * quieter and lighter**, one family with the line work and never a second
 * palette — and the further the spell stands from the house the more of its
 * chroma it gives up for lightness, so a word is always the lightest thing in
 * its cell:
 *
 *     e = 1 − (1 − m)²          how far the words have left the gold
 *     L = fit + e · (TYPE_L − fit),   C = C · (1 − e · (1 − TYPE_KEEP)),   h = the ink's own
 *
 * `e` rises faster than `m` on purpose: a single pull already moves the ink a
 * visible way off the gold, and the words should already be leaving it with it.
 * **At the house `m` is nought and so is `e`, and the answer is the page's own
 * `#f2c14e` to the byte**, which the blessed pictures rest on. At a full pull
 * the words are at `TYPE_L` with three tenths of the ink's chroma — a white with
 * the hue in it.
 */
export function typeInk(colour: RingColour, floor = K.TYPE_FLOOR): string {
  const e = 1 - (1 - colour.m) ** 2;
  return applyRel(
    { dL: e * (K.TYPE_L - colour.fit), cRatio: 1 - e * (1 - K.TYPE_KEEP), dh: 0 },
    colour.fit, colour.C, colour.h, floor,
  );
}

/**
 * And the page's pale gold, `--pale` (`#ffe9a8`: the seed while it is typed,
 * the focus ring), by the same lean: re-based on the ink the way every fixed
 * colour is, then taken the same `e` of the way toward white as the words.
 */
export function paleInk(colour: RingColour): string {
  const e = 1 - (1 - colour.m) ** 2;
  return mixHex(restyle(PALE, colour), '#ffffff', e * 0.6);
}
export const PALE = '#ffe9a8';

/** Two colours, mixed in OKLab — never in sRGB, where the middle is a mud. */
export function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const A = srgbToOklab(hexToRgb(a));
  const B = srgbToOklab(hexToRgb(b));
  return rgbToHex(oklabToSrgb([
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ]));
}

export default ringColour;
