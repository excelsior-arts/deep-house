// How far one set stands from another, in style rather than in number.
//
// A master seed is a number, and two numbers beside each other say nothing
// about whether the records they grow sound alike: the dice are independent,
// so the seed after this one can roll the same room, the same key and the same
// figures and be, to the ear, the record you were already listening to. That
// is why casting four or five times in a row could land on four or five
// versions of the same thing. A throw of the dice on the ring asks for a
// distance in *style*, and this is what measures it: every die the generator
// rolls, weighted by how much of a record's character it carries, summed and
// normalised — nought for the same theme, one for two that share nothing.
//
// Pure. It is handed two planned themes and touches nothing else, so the bench
// can score a thousand of them without a sound card.
//
// It was `src/style.js` in this package until round F of PLAN-V1-NEXT, where a *style* became
// the thing this project means by the word — the whole deep house profile in
// `src/styles/deep-house.ts` — and the design review's note that "`style.js`
// currently means distance between house plans, not a general style
// definition" stopped being a note and became a rename. Nothing here changed.

// What a listener would notice, in the order they would notice it. The room is
// the biggest single difference the generator can make, the key is the next,
// and the masks are the smallest — a different hat figure is a different
// groove, but it is still the same record.
// The traits themselves, as a closed list: `WEIGHTS`, the `parts` of a
// distance and the loud floors below are all keyed by it, so a name that is
// not a trait is a compiler error rather than a weight that silently counts
// for nothing.
export type Trait =
  | 'room' | 'key' | 'scale' | 'tempo' | 'bpm' | 'density' | 'voicing' | 'lead'
  | 'pad' | 'stab' | 'fx' | 'progression' | 'hat' | 'bass' | 'loop' | 'length';

/** How far apart two themes are on every trait, nought to one each. */
export type Parts = Record<Trait, number>;

export const WEIGHTS: Record<Trait, number> = {
  room: 3,           // the preset: sub, growl, the whole bottom of the record
  key: 2,            // the root, round the shortest way on the chromatic circle
  scale: 1.2,        // minor against major
  tempo: 1.5,        // the tempo family
  bpm: 0.8,          // and how far apart they sit inside it
  density: 1.2,      // how much is playing
  voicing: 1,        // ninths against elevenths
  lead: 1.2,         // which instrument carries the line
  pad: 0.8,
  stab: 0.8,
  fx: 1,             // the palette the noises come from
  progression: 1.2,  // the chord loop, named
  hat: 1,            // the figures, by how many of their sixteen steps differ
  bass: 1,
  loop: 0.5,         // how long the chord loop is
  length: 0.4,       // how long the theme runs
};

// The traits a listener names first. A cast that moves none of them is not a
// new record however different its seed is, so the ring will not offer one.
export const LOUD: Trait[] = ['room', 'key', 'tempo', 'density', 'lead', 'progression'];

// Two floors a candidate can be asked to clear: a throw wants any one of the
// loud traits moved; a tap on the die wants the room or the key, which is the
// pair nothing else can disguise, so two taps in a row can never sound alike.
export const FLOOR = {
  loud: (p: Parts) => LOUD.some((k) => (p[k] || 0) > 0.4),
  fresh: (p: Parts) => (p.room || 0) > 0.4 || (p.key || 0) > 0,
};

/**
 * As much of a planned theme as the scoring reads, and no more. Every field is
 * optional and the whole thing may be missing, because the ring scores against
 * whatever was playing last and on the first cast that is nothing at all.
 */
export interface PlannedTheme {
  dice?: Record<string, unknown>;
  key?: { root?: number; scaleName?: unknown };
  presetLabel?: unknown;
  bpm?: unknown;
  bars?: unknown;
}

// A die is either the word it rolled or a row with the word on it; the cast is
// the narrowing `typeof d === 'object'` cannot do on its own, and nothing is
// read off the row but `value`.
const dieValue = (d: unknown): unknown => (d && typeof d === 'object' ? (d as { value?: unknown }).value : d);

// The dice of a planned theme, as the flat reading the scoring works on.
export function styleOf(t?: PlannedTheme | null) {
  const d: Record<string, unknown> = (t && t.dice) || {};
  const k: NonNullable<PlannedTheme['key']> = (t && t.key) || {};
  return {
    room: String(d.preset ?? t?.presetLabel ?? ''),
    root: Number.isFinite(k.root) ? (k.root as number) : -1,
    scale: String(k.scaleName ?? ''),
    tempo: String(d.tempoFamily ?? ''),
    bpm: Number(t?.bpm) || 0,
    density: String(dieValue(d.densityDie) ?? d.density ?? ''),
    voicing: String(d.voicingStyle ?? ''),
    lead: String(d.leadTimbre ?? ''),
    pad: String(d.padTimbre ?? ''),
    stab: String(d.stabTimbre ?? ''),
    fx: String(d.fxPalette ?? ''),
    progression: String(d.progression ?? ''),
    hat: String(d.hatMask ?? ''),
    bass: String(d.bassMask ?? ''),
    loop: Number(d.loopBars) || 0,
    bars: Number(t?.bars) || 0,
  };
}

const same = <T>(a: T, b: T) => (a === b ? 0 : 1);
// The chromatic circle, the short way round: a tritone is as far as a root can
// get, and that is the one.
const rootApart = (a: number, b: number) => {
  if (a < 0 || b < 0) return a === b ? 0 : 1;
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d) / 6;
};
const hamming = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return same(a, b);
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n / a.length;
};
const apart = (a: number, b: number, full: number) => Math.min(1, Math.abs(a - b) / full);

// Nought to one, with the part each die played in getting there and the names
// of the ones a listener would actually call out.
export function styleDistance(A?: PlannedTheme | null, B?: PlannedTheme | null) {
  const a = styleOf(A);
  const b = styleOf(B);
  const parts: Parts = {
    room: same(a.room, b.room),
    key: rootApart(a.root, b.root),
    scale: same(a.scale, b.scale),
    tempo: same(a.tempo, b.tempo),
    bpm: apart(a.bpm, b.bpm, 16),
    density: same(a.density, b.density),
    voicing: same(a.voicing, b.voicing),
    lead: same(a.lead, b.lead),
    pad: same(a.pad, b.pad),
    stab: same(a.stab, b.stab),
    fx: same(a.fx, b.fx),
    progression: same(a.progression, b.progression),
    hat: hamming(a.hat, b.hat),
    bass: hamming(a.bass, b.bass),
    loop: same(a.loop, b.loop),
    length: apart(a.bars, b.bars, 240),
  };
  let sum = 0;
  let total = 0;
  for (const k in WEIGHTS) {
    // `for ... in` hands back a `string`, and the two tables it walks are keyed
    // by the closed list above. The loop is the one the record was measured
    // with and is not to be swapped for a walk over `Object.keys`, so the key
    // is named for what it is here.
    const t = k as Trait;
    sum += WEIGHTS[t] * (parts[t] || 0);
    total += WEIGHTS[t];
  }
  return {
    distance: sum / total,
    parts,
    differs: (Object.keys(parts) as Trait[]).filter((k) => parts[k] > 0.4),
    from: a,
    to: b,
  };
}

export default styleDistance;
