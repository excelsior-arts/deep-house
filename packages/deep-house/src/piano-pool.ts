// **The piano pool** (round piano-pool, his word 11-01: *"in Vibe list there are 4 or maybe more tracks with piano and
// they have very similar tone … So we should definitely give a round of wider pool of pianos preferable more
// articulated by birds position and music rules"*). A beat-led theme that sounds the house piano draws which grand
// plays it: the house piano holds the middle, and each other grand is drawn more the further the birds stand toward its
// end (`recipes/keys/pianos.json`, the one lean about the house): the birds pick the zone (the middle, or an end),
// the seed draws the grand inside an end. Tone only: the drawn grand's numbers voice the room's
// piano block (its envelope, its string, its lid, its hammer), while the room keeps its own mix and touch (the pool's
// `keep`: the drone's register under the piano, the dry share, the spread, the pedal) and every note keeps what the
// part wrote on it. So the part, its seats, its body, its articulation and its lane are the piano's as before, and the
// lane's level means what it meant (`trimDb`, each grand's strike against the house piano's by register, measured).
//
// Nothing here names a genre or a place: a style switches the pool on (`pianoPool`, its row id), the birds and the seed
// draw inside it, on a stream of its own (`<seed>::piano:pool`), so no other die moves.
import POOL_FILE from '../recipes/keys/pianos.json' with { type: 'json' };
import { BY_NAME } from '@deep-house/engine/voices';
import { registerDb } from '@deep-house/engine/voices/piano-string';
import { lean, leansOf as birdsOf } from './lean.ts';
import { Rng } from './rng.ts';

interface PoolRow {
  id: string; centre: Record<string, number>; strength: number; weights: Record<string, number>;
  [bird: string]: unknown;
}
const ROWS = POOL_FILE.rows as unknown as PoolRow[];
/** the voice the pool voices (the house piano), the room's numbers it keeps, each grand's trim */
export const PIANO_POOL = Object.freeze({
  voice: POOL_FILE.voice as string,
  keep: Object.freeze([...POOL_FILE.keep]) as readonly string[],
  trimDb: Object.freeze({ ...POOL_FILE.trimDb }) as unknown as Readonly<Record<string, ReadonlyArray<{ midi: number; db: number }>>>,
  rows: Object.freeze(ROWS.map((r) => r.id)),
  ring: Object.freeze({ ...POOL_FILE.ring, s: Object.freeze({ ...POOL_FILE.ring.s }) }) as unknown as Readonly<{ s: Readonly<Record<string, number>>; passageBars: number; bedShare: number }>,
});

const rowOf = (id: string): PoolRow => {
  const r = ROWS.find((x) => x.id === id);
  if (!r) throw new Error(`piano pool: no row "${id}"`);
  return r;
};
/** a weight leaned by every bird of the row (the one lean), each about the row's own centre for that bird: the house */
function leanedAbout(w: number, v: string, r: PoolRow, spell: Readonly<Record<string, number>>): number {
  let x = w;
  for (const [bird, leans] of birdsOf(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id' && k !== 'weights' && k !== 'centre'))))
    if (typeof leans[v] === 'number') x *= lean(leans[v], spell[bird], r.strength, r.centre[bird] ?? 0.5);
  return x;
}

/** Each grand's chance at this spell: its weight leaned by the row's birds, as a share of the whole. */
export function pianoChances(id: string, spell: Readonly<Record<string, number>>): Array<{ v: string; w: number }> {
  const r = rowOf(id);
  const list = Object.entries(r.weights).map(([v, w]) => ({ v, w: leanedAbout(w, v, r, spell) }));
  const sum = list.reduce((a, x) => a + x.w, 0);
  return list.map((x) => ({ v: x.v, w: x.w / sum }));
}

/**
 * The grand a theme plays. **The birds pick the zone, the seed draws inside it** (his direction 10-11: few birds pick a
 * zone, the rest steer inside): where the house piano's chance is a half or more, the birds stand in the house's
 * middle and the house piano plays; past it they stand toward an end, and the seed draws among the other grands by
 * their chances there. Off its own stream, so adding the pool moved no other die.
 */
export const MIDDLE = 0.5;
export function drawPiano(id: string, seed: string | number, spell: Readonly<Record<string, number>>, alone: number | null = null): string {
  let ch = pianoChances(id, spell);
  // **a grand that has to ring alone rings as long as the house piano** (`ringAlone`): where the part leaves each chord
  // `alone` seconds over a held bed, a grand falling sooner than that and sooner than the house piano is not drawn; the
  // others' chances, the house piano's among them, are read again as a share of what is left
  if (alone !== null) {
    const R = PIANO_POOL.ring.s, house = R[PIANO_POOL.voice];
    const kept = ch.filter((x) => !(R[x.v] < Math.min(house, alone)));
    const sum = kept.reduce((a, x) => a + x.w, 0);
    if (kept.length < ch.length && sum > 0) ch = kept.map((x) => ({ v: x.v, w: x.w / sum }));
  }
  if ((ch.find((x) => x.v === PIANO_POOL.voice)?.w ?? 0) >= MIDDLE) return PIANO_POOL.voice;
  return new Rng(`${seed}::piano:pool`).weighted(ch.filter((x) => x.v !== PIANO_POOL.voice)) as string;
}

/**
 * **How long the piano rings alone** (round piano-pool 2, his ear 11-01 on a short upright under long synth drones:
 * *"previous was better due to way longer sustain"*): the median gap between the piano's strikes inside a passage (the
 * next within `passageBars`), in seconds, where a held bed (a pad note sounding from one strike to the next) holds
 * across at least `bedShare` of those gaps; else null, nothing rings alone. Read off what the theme holds, its notes
 * and its bed, never its birds.
 */
export function ringAlone(events: ReadonlyArray<{ t: number; voice: string; layer?: string; p: { dur?: number } }>, barSeconds: number): number | null {
  const R = PIANO_POOL.ring;
  const strikes: number[] = [];
  for (const e of [...events].filter((x) => x.voice === PIANO_POOL.voice).sort((a, b) => a.t - b.t))
    if (!strikes.length || e.t - strikes[strikes.length - 1] >= STRUM) strikes.push(e.t);
  const gaps: Array<[number, number]> = [];
  for (let k = 1; k < strikes.length; k++) { const g = strikes[k] - strikes[k - 1]; if (g <= R.passageBars * barSeconds) gaps.push([strikes[k - 1], g]); }
  if (!gaps.length) return null;
  const beds = events.filter((e) => e.layer === 'pad' && (e.p.dur ?? 0) > 0);
  const held = gaps.filter(([t, g]) => beds.some((b) => b.t <= t + EDGE && b.t + b.p.dur! >= t + g - EDGE)).length;
  if (held < R.bedShare * gaps.length) return null;
  const sorted = gaps.map((x) => x[1]).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
// a chord's tones strummed within this many seconds are one strike; a bed's note may start or end this near the gap
const STRUM = 0.12, EDGE = 0.05;

// every optional field of a string, so a drawn grand's string replaces the room's whole (the room's block is merged
// over the instruments table's, which carries the house piano's string)
const STRING_OPTIONAL = ['after', 'unison', 'touch', 'touchUp'] as const;
const AFTER_OPTIONAL = ['fade', 'keep'] as const;
const KEEP_FIELDS = ['db', 'slope', 'by'] as const;

/**
 * The room's piano block as the drawn grand voices it: the grand's tone over the room's block, the room's `keep` kept,
 * the string whole (its absent fields written null, so nothing of the house piano's string is left in it) and its
 * strings trimmed register by register to the house piano's strike (`trimDb`). The house piano itself, or a row the pool does not know:
 * null, the room as it was.
 */
export function pianoVoicing(id: string, room: Readonly<Record<string, unknown>>): Record<string, unknown> | null {
  if (id === PIANO_POOL.voice) return null;
  const row = BY_NAME[id]?.row;
  if (!row || row.topology !== 'piano') return null;
  const P = JSON.parse(JSON.stringify(row.parameters)) as Record<string, unknown> & { string: Record<string, unknown> };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(P)) if (!PIANO_POOL.keep.includes(k)) out[k] = v;
  for (const k of PIANO_POOL.keep) if (room[k] !== undefined) out[k] = room[k];
  const S = P.string;
  for (const k of STRING_OPTIONAL) if (S[k] === undefined) S[k] = null;
  const A = S.after as Record<string, unknown> | null;
  if (A) {
    for (const k of AFTER_OPTIONAL) if (A[k] === undefined) A[k] = null;
    const K = A.keep as Record<string, unknown> | null;
    if (K) for (const k of KEEP_FIELDS) if (K[k] === undefined) K[k] = null;
  }
  // its strings held to the house piano's loudness, register by register (`trimDb`, measured): the part was balanced on
  // the house piano, so a melody keeps its level wherever it walks; the colour, the hammer and the ring stay the grand's
  const trim = PIANO_POOL.trimDb[id] ?? [];
  if (trim.length) {
    const reg = S.register as Array<{ midi: number; db: number }>;
    const at = [...new Set([...reg.map((p) => p.midi), ...trim.map((p) => p.midi)])].sort((a, b) => a - b);
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    S.register = at.map((m) => ({ midi: m, db: Math.round((registerDb(hz(m), reg) + registerDb(hz(m), trim)) * 100) / 100 }));
  }
  out.string = S;
  return out;
}

/**
 * **A part's touch, on the drawn grand** (round piano-pool): a phrase character writes the piano's response on each note
 * in the house piano's numbers (a ringing chord's sustain .72 where the house piano's own is .32, its top let go at .16
 * where the house's is .40). On another grand those numbers would play the house piano's response, not the grand's:
 * the muted upright would ring like the house piano. So a note's own response is read as a ratio to the room it was
 * written for and played on the drawn grand's: the character keeps its shape (twice the sustain, the top held longer),
 * the grand keeps its voice. The pedal (`ring`) is the part's and is left as written.
 */
const RESPONSE = { sustainLevel: [0.01, 1], partialDecay: [0, 8], decayFast: [0.01, 4], hammerLevel: [0, 1], unisonCents: [0, 12] } as const;
export function touchOnGrand(p: Record<string, unknown>, written: Readonly<Record<string, unknown>>, grand: Readonly<Record<string, unknown>>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const [k, [lo, hi]] of Object.entries(RESPONSE)) {
    const v = p[k], a = written[k], b = grand[k];
    if (typeof v !== 'number' || typeof a !== 'number' || typeof b !== 'number' || !(a > 0)) continue;
    (out ??= { ...p })[k] = Math.round(Math.max(lo, Math.min(hi, v * b / a)) * 1e4) / 1e4;
  }
  return out ?? p;
}
