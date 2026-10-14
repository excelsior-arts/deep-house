// **The pad arc** (PLAN-UNIFY §1.12, U3; his goal for the round: *"the pads move across the main and still sit
// behind"*). The fast places' producer writes its pads as a line arcing to a crest (its row's `arc`: more voices, louder,
// wider, more air toward the crest, thinning into the cooldown). Everywhere else the house's own pad is reshaped the
// same way, never a second pad laid over it and never a new layer switched on: every restrike keeps its time, its chord
// and its length, and takes its place on its main's arc —
//
//   - **the voicing**: at the thin end the chord's top voices (the colour tones over the triad) leave, never under the
//     row's least; the chord as written at the crest;
//   - **the level, the width and the air**: a little under at the thin end, a little over at the crest (the voice's own
//     spread and reverb send, scaled), so the pad moves and still sits behind.
//
// The arc rises from the main's first bar to a crest phrase and settles into the main's end. It reads the arrangement's
// phrases (`src/phrasing.ts`, `track.phrasing`): the crest is a phrase no sub-segment stands in (else the bars of one
// before its sub-segment, never a build's bar), ending where the main's cooldown starts, and the arc holds still across a sub-segment (a breakdown-lite exposes the bed and lifts it, a
// filtered phrase closes the master), so the two gestures never fight. Positions are the phrase map's (`src/phrase-map.ts`).
//
// Nothing here draws a die, names a place, a genre or a seed.
import PAD_ARC_FILE from '../recipes/arrangement/pad-arc.json' with { type: 'json' };
import { dbToGain } from '@deep-house/engine/dsp';
import { lean } from './lean.ts';
import type { PhraseMap } from './phrase-map.ts';
import type { PlanEvent } from './generator.ts';

export interface ArcShape { open: number; afterDrop: number; settle: number; crest: 'last' | 'middle' }
export interface ArcVoicing { least: number; drop: number }
export interface ArcKnobs { shape: ArcShape; voicing: ArcVoicing | null; levelDb: [number, number]; width: [number, number]; air: [number, number] }
export interface PadArcRow extends ArcKnobs {
  id: string;
  name: string;
  /** the house's own birds: every lean of the row is nought there */
  centre: Record<string, number | string>;
  leastBpm: number;
  sections: string[];
  leastPhrases: number;
  lean: Record<string, Record<string, number> | string>;
  /** the slow side's own knobs (under `leastBpm`), and its switch: played only where `on` is */
  slow: Partial<ArcKnobs> & { on: boolean };
}

const FILE = PAD_ARC_FILE as unknown as { rows: PadArcRow[] };
/** The pad-arc rows, by id (`recipes/arrangement/pad-arc.json`). */
export const PAD_ARC_ROWS: Readonly<Record<string, PadArcRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/** One main's arc, as the readout says it. */
export interface MainArc { section: number; from: number; to: number; crest: [number, number]; open: number; settle: number }
/** What the pass did: the track's `padArc`. */
export interface PadArc { slow: boolean; arcs: MainArc[]; strikes: number; thinned: number; summary: string }

export interface PadArcInput {
  row: PadArcRow;
  /** the slow side's knobs over the row's (the theme is under `leastBpm` and the row's `slow.on` is set) */
  slow: boolean;
  events: PlanEvent[];
  barSeconds: number;
  spell: Readonly<Record<string, number>>;
  map: PhraseMap;
  sections: ReadonlyArray<{ index: number; kind: string; startBar: number; bars: number }>;
  /** the arrangement's phrases as they were heard: the sub-segments and the cooldowns */
  phrasing: { segments: ReadonlyArray<{ from: number; to: number }>; cooldowns: ReadonlyArray<{ from: number; to: number }> } | null;
  /** the theme's own pad: the notes the arc reshapes */
  isPad: (e: PlanEvent) => boolean;
  /** the pad's chords are a track row's own part: their voices are kept (level, width and air still move) */
  keepVoicing: boolean;
  /** the pitch class of the chord's root in force at a bar: what a voice's function is read from */
  rootPcAt: (bar: number) => number;
}

/**
 * **Which voices leave at the thin end, in order** (the review of U3: the top voice was often the chord's third, the
 * pads being folded into their register): by function from the chord's root, the extensions first (the ninth, the
 * eleventh, the thirteenth), then the seventh, then a doubled root or fifth (the higher first); never the third, never
 * the lowest root or fifth. A voice of the same function higher up leaves before a lower one.
 */
export function thinOrder(midis: readonly number[], rootPc: number): number[] {
  const pcs = midis.map((m) => (((m - rootPc) % 12) + 12) % 12);
  const has = (iv: number) => pcs.includes(iv);
  const rank = (iv: number): number | null => {
    if (iv === 1 || iv === 2) return 0;                      // the ninth
    if (iv === 5 || (iv === 6 && has(7))) return 1;          // the eleventh (a sharp one beside a fifth)
    if (iv === 8 || iv === 9) return 2;                      // the thirteenth (or a sixth)
    if (iv === 10 || iv === 11) return 3;                    // the seventh
    return null;                                             // the root, the third, the fifth
  };
  const order = midis.map((m, i) => ({ i, m, r: rank(pcs[i]) }));
  const ext = order.filter((x) => x.r != null).sort((a, b) => a.r! - b.r! || b.m - a.m).map((x) => x.i);
  // a doubled root or fifth (a diminished fifth where no perfect one stands): every instance but the lowest
  const fifth = has(7) ? 7 : 6;
  const doubled = [0, fifth].flatMap((iv) => order.filter((x) => pcs[x.i] === iv).sort((a, b) => a.m - b.m).slice(1).sort((a, b) => b.m - a.m).map((x) => x.i));
  return [...ext, ...doubled];
}

const round = (v: number, n: number) => +v.toFixed(n);
const lerp = (r: readonly [number, number], x: number) => r[0] + (r[1] - r[0]) * x;

export function applyPadArc(I: PadArcInput): PadArc | null {
  const R = I.row, K: ArcKnobs = I.slow ? { ...R, ...R.slow } as ArcKnobs : R;
  const L = I.map.time.phraseBars, bs = I.barSeconds;
  const segs = I.phrasing?.segments ?? [], cools = I.phrasing?.cooldowns ?? [];
  const sections = [...I.sections].sort((a, b) => a.startBar - b.startBar);
  // the birds on the width and the air, the one lean about the house's own values
  const birdOn = (knob: string) => {
    let x = 1;
    for (const [bird, w] of Object.entries(R.lean)) {
      const c = R.centre[bird];
      if (typeof w === 'object' && typeof c === 'number') x *= lean(w[knob], I.spell[bird], 1, c);
    }
    return x;
  };
  const widthK = birdOn('width'), airK = birdOn('air');

  // ----- each long main's arc -----
  const arcs: Array<MainArc & { at: (bar: number) => number }> = [];
  sections.forEach((s, i) => {
    if (!R.sections.includes(s.kind) || s.bars < R.leastPhrases * L) return;
    const A = s.startBar, E = A + s.bars;
    const cool = cools.find((c) => c.to === E)?.from ?? E;
    const free = (a: number, z: number) => !segs.some((g) => g.from < z && g.to > a);
    // a phrase's free head: its bars before the first sub-segment that stands in it
    const head = (p: { from: number; to: number }) => Math.min(p.to, ...segs.filter((g) => g.from < p.to && g.to > p.from).map((g) => g.from));
    const phrases = I.map.phrases.filter((p) => p.from > A && p.to - p.from === L && p.to <= Math.min(cool, cool === E ? E - L : cool));
    if (!phrases.length) return;
    let crest: { from: number; to: number };
    if (K.shape.crest === 'middle') {
      const mid = (A + E) / 2, by = (p: { from: number; to: number }) => Math.abs((p.from + p.to) / 2 - mid);
      crest = [...phrases].sort((a, b) => Number(!free(a.from, a.to)) - Number(!free(b.from, b.to)) || by(a) - by(b))[0];
    } else crest = [...phrases].reverse().find((p) => free(p.from, p.to)) ?? [...phrases].reverse().find((p) => head(p) > p.from) ?? phrases[phrases.length - 1];
    // where every phrase holds a sub-segment, the crest is its phrase's bars before the first one (U2c: every
    // sub-segment builds into its line on its last bar and stops on its last eighth, so a crest over one would peak on
    // the build); the arc then holds the crest's value across the sub-segment, as it holds any
    if (!free(crest.from, crest.to) && head(crest) > crest.from) crest = { from: crest.from, to: head(crest) };
    const open = sections[i - 1]?.kind === 'drop' && sections[i - 1].startBar + sections[i - 1].bars === A ? K.shape.afterDrop : K.shape.open;
    const C0 = crest.from, C1 = crest.to, settle = K.shape.settle;
    const line = (bar: number) => (bar < C0 ? open + (1 - open) * (bar - A) / Math.max(1e-9, C0 - A)
      : bar < C1 ? 1 : 1 + (settle - 1) * Math.min(1, (bar - C1) / Math.max(1e-9, E - 1 - C1)));
    // the arc holds still across a sub-segment: the value it stood at as the segment began
    const at = (bar: number) => { const g = segs.find((x) => bar >= x.from && bar < x.to); return Math.max(0, Math.min(1, line(g ? g.from : bar))); };
    arcs.push({ section: s.index, from: A, to: E, crest: [C0, C1], open, settle, at });
  });
  if (!arcs.length) return null;

  // ----- every restrike of the pad inside an arc, reshaped -----
  const strikes = new Map<string, PlanEvent[]>();
  for (const e of I.events) {
    if (!I.isPad(e)) continue;
    const bar = e.t / bs + 1e-6;
    if (!arcs.some((a) => bar >= a.from && bar < a.to)) continue;
    const key = `${Math.round(e.t * 1e4)}|${e.voice}`;
    const list = strikes.get(key);
    if (list) list.push(e); else strikes.set(key, [e]);
  }
  // a main whose pad rests (the section's harmonic roll gave it to the keys) has nothing to reshape: never a layer switched on
  if (!strikes.size) return null;
  const gone = new Set<PlanEvent>();
  for (const notes of strikes.values()) {
    const bar = notes[0].t / bs + 1e-6;
    const arc = arcs.find((a) => bar >= a.from && bar < a.to)!;
    // read at the strike's middle (a held chord sounds its place across its length), inside its main
    const x = arc.at(Math.min(arc.to - 1, bar + Number(notes[0].p.dur ?? 0) / bs / 2));
    const db = lerp(K.levelDb, x), w = lerp(K.width, x) * widthK, a = lerp(K.air, x) * airK;
    // the voicing: the top voices leave toward the thin end
    if (K.voicing && !I.keepVoicing && notes.length > K.voicing.least) {
      const n = Math.min(notes.length - K.voicing.least, Math.round(K.voicing.drop * (1 - x)));
      // by function from the chord's root: the extensions, then the seventh, then a doubled root or fifth; never the third
      // (nothing that may leave: no thinning)
      const order = thinOrder(notes.map((e) => Number(e.p.midi)), I.rootPcAt(Math.floor(bar)));
      for (const i of order.slice(0, Math.max(0, n))) gone.add(notes[i]);
    }
    for (const e of notes) {
      if (gone.has(e)) continue;
      const p = { ...e.p };
      // the level unrounded: a scene's own step on the pad (the drone-back background) stays exactly its step over it
      if (db !== 0) p.gain = Number(p.gain ?? 1) * dbToGain(db);
      if (typeof p.spread === 'number') p.spread = round(Math.min(1, p.spread * w), 4);
      if (typeof p.reverb === 'number') p.reverb = round(Math.min(1, p.reverb * a), 4);
      e.p = p;
    }
  }
  if (gone.size) {
    const kept = I.events.filter((e) => !gone.has(e));
    I.events.length = 0;
    I.events.push(...kept);
  }
  const out = arcs.map(({ at: _at, ...rest }) => rest);
  return { slow: I.slow, arcs: out, strikes: strikes.size, thinned: gone.size,
    summary: `pad arc${I.slow ? ' (slow)' : ''}: ${out.length} main${out.length === 1 ? '' : 's'} (${out.map((a) => `${a.from}-${a.to - 1} crest ${a.crest[0]}-${a.crest[1] - 1}`).join(', ')}), ${strikes.size} strikes reshaped, ${gone.size} top voices left out at the thin ends` };
}

/** The row's faults: every range a pair, every arc position inside 0..1, every lean on a bird with a centre. */
export function padArcFaults(row: PadArcRow): string[] {
  const bad: string[] = [];
  const pos = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;
  const pair = (r: unknown) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'number' && Number.isFinite(x));
  for (const K of [row, { ...row, ...row.slow }] as ArcKnobs[]) {
    if (!pos(K.shape.open) || !pos(K.shape.afterDrop) || !pos(K.shape.settle)) bad.push(`${row.id}: an arc position outside 0..1`);
    if (K.shape.crest !== 'last' && K.shape.crest !== 'middle') bad.push(`${row.id}: crest ${K.shape.crest}`);
    for (const k of ['levelDb', 'width', 'air'] as const) if (!pair(K[k])) bad.push(`${row.id}: ${k} is not a pair of numbers`);
    if (K.voicing && !(K.voicing.least >= 1 && K.voicing.drop >= 0)) bad.push(`${row.id}: voicing ${JSON.stringify(K.voicing)}`);
  }
  if (typeof row.slow?.on !== 'boolean') bad.push(`${row.id}: the slow side's switch \`on\` is not a boolean`);
  for (const bird of Object.keys(row.lean)) if (bird !== 'says' && typeof row.centre[bird] !== 'number') bad.push(`${row.id}: a lean on ${bird} with no centre`);
  return bad;
}
{
  const bad = Object.values(PAD_ARC_ROWS).flatMap(padArcFaults);
  if (bad.length) throw new Error(`the pad-arc rows: ${bad.join('; ')}`);
}
