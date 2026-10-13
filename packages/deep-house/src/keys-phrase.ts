// **The sparse keys and the harmony they set** (liquid-space round 1): one harmonic
// authority for a theme that admits a keys part, written from the rows the keys lab
// grew and he approved (`recipes/keys/`).
//
// A theme draws one **phrase** (`phrases.json`): mostly two chords, A and B. They do
// not loop on a clock. The keys land where a **density** row draws (`density.json`,
// a whole track's row: by section, with a landing budget for the track), each landing
// strikes the next chord in turn, and **the harmony changes only where the keys land**:
// the bed, the bass's home and the keys read one chord state. Before the first landing
// the phrase's first chord holds.
//
// A landing is written by the **motif** grammar (`motifs.json`): a pickup before it
// (pre notes) sinks into a deeper voicing, an answer after it (post notes); a row says
// how often each is there. The keys play through one **tone** (`tones.json`: a sound,
// its layers and its inserts) into one **space** (a space row of the engine) at one
// **wetness** (`wetness.json`): the part's own space, one per theme (`partSpace` in the
// settings), never a reverb per note.
//
// The **bed** reads the same state with common tones (manual A1): its voices hold
// where the next chord keeps them and one moves; around a landing the voice that moves
// leaves before the pickup and comes back after the strike, so the bed thins and
// never leaves a hole.
//
// Nothing here knows a genre or a place: a place table names the rows (`KeysEntry`),
// the seed draws inside them, each draw off a stream of its own (`<seed>::keys:*`), so
// adding this part moves no other die.
import PHRASE_FILE from '../recipes/keys/phrases.json' with { type: 'json' };
import MOTIF_FILE from '../recipes/keys/motifs.json' with { type: 'json' };
import DENSITY_FILE from '../recipes/keys/density.json' with { type: 'json' };
import TONE_FILE from '../recipes/keys/tones.json' with { type: 'json' };
import WET_FILE from '../recipes/keys/wetness.json' with { type: 'json' };
import DRAW_FILE from '../recipes/keys/draw.json' with { type: 'json' };
import { SPACE_ROWS } from '@deep-house/engine/space-rows';
import type { SpaceRow } from '@deep-house/engine/space';
import { BY_NAME } from '@deep-house/engine/voices';
import { Rng } from './rng.ts';

// --- the rows -------------------------------------------------------------------

interface Hands { left: number[]; right: number[] }
export interface PhraseChord extends Hands {
  symbol: string; root: string; bars: number; deep: Hands; scale: number[];
  retouch?: { bar: number; step: number; hands: 'right' | 'both'; vel: number };
  vel?: number;
  /** the bass's home under this chord: the phrase's key root (`key`, a pedal) or the chord's own root (`root`) */
  bass: 'key' | 'root';
}
export interface PhraseRow { id: string; name: string; key: string; mood: string; weight: number; chords: PhraseChord[] }
interface MotifRow { id: string; name: string; density: 'pre-post' | 'pre' | 'none'; bare: number; counts?: Record<string, number>; postChance?: number }
interface Way { weight: number; from: number | 'half'; every: Array<[number, number]> }
interface DensityRule { ways: Way[]; levelDb?: number; send?: number; dry?: number }
export interface TrackDensityRow {
  id: string; name: string; scope: 'track';
  /** no landing in the track's first `cleanBars` (the mixing region) nor in its last `cleanEndBars` */
  cleanBars: number; cleanEndBars: number;
  /** the fewest bars between two landings */
  minGapBars: number;
  /** the most landings a track has: past it, the lowest class's landings go first, the latest of a section first */
  budget: { most: number; keep: string[] };
  /** a section's kind to its class; `otherwise` for a kind the row does not name */
  classes: Record<string, string>;
  sections: Record<string, DensityRule>;
  /** the bed around a landing: how many voices, how long before the strike a bare landing thins it, how long after it the moved voice returns, and its release where it leaves */
  bed: { voices: number; bareLeadSteps: number; returnSteps: number; thinRelease: number };
}
interface ToneRow { id: string; name: string; gainDb: number; sparseDb?: Record<string, number>; layers: Array<{ sound: string; hands: 'both' | 'right'; gainDb: number }>; inserts: Array<{ effect: string; params: Record<string, number> }> }
interface WetRow { id: string; send: number; dry: number; trimDb: number }
/** A choice the draw row weighs, by row id. */
type Weights = Record<string, number>;
const CHOICES = ['tone', 'space', 'motif', 'wetness', 'density', 'phrase'] as const;
type ChoiceName = typeof CHOICES[number];
interface DrawRow {
  id: string; name: string;
  tone: Weights; space: Weights; motif: Weights; wetness: Weights; density: Weights;
  centre: number; strength: number;
  /** by bird, the leans on each choice's rows */
  birds: Record<string, Partial<Record<ChoiceName, Weights>> & { says?: string }>;
}

const PHRASES = PHRASE_FILE.rows as unknown as PhraseRow[];
const TOUCH = PHRASE_FILE.touch as { left: number; right: number; top: number; rollMs: number; jitterMs: number; velJitter: number };
const GRAMMAR = MOTIF_FILE.grammar as unknown as {
  pre: { windowSteps: number; counts: Record<string, number>; cells: Record<string, Array<{ at: number[]; weight: number }>>;
    contours: Record<string, { weight: number; steps: Record<string, number[]> }>; targets: Array<{ voice: 'top' | 'inner'; weight: number }>;
    vel: [number, number]; lateMs: [number, number]; legato: number };
  post: { windowSteps: [number, number]; shapes: Array<{ id: string; steps: number[]; weight: number }>; cells: Record<string, Array<{ at: number[]; weight: number }>>;
    vel: [number, number]; lateMs: [number, number]; beats: number };
};
const MOTIFS = MOTIF_FILE.rows as unknown as MotifRow[];
const DENSITIES = (DENSITY_FILE.rows as unknown as Array<{ id: string; scope?: string }>);
const TONES = TONE_FILE.rows as unknown as ToneRow[];
const WETNESS = WET_FILE.rows as unknown as WetRow[];
const UNDER_DB = WET_FILE.underDb as Record<string, number>;
const DRAWS = DRAW_FILE.rows as unknown as DrawRow[];
/** The keys' level on the sparse writing, the phrase file's (`levelDb`). */
const PHRASE_LEVEL_DB = PHRASE_FILE.levelDb as number;

export const KEYS_ROWS = Object.freeze({
  phrases: PHRASES.map((r) => r.id), motifs: MOTIFS.map((r) => r.id), tones: TONES.map((r) => r.id), wetness: WETNESS.map((r) => r.id),
  densities: DENSITIES.filter((r) => r.scope === 'track').map((r) => r.id), spaces: Object.keys(SPACE_ROWS), draws: DRAWS.map((r) => r.id),
});

// --- small arithmetic -------------------------------------------------------------

const mod = (a: number, n: number) => ((a % n) + n) % n;
const NAMES: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SPELL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** A pitch class off a name at the head of a string: "Eb minor" is 3, "F#m9" is 6. */
const pcOfName = (s: string): number => {
  const m = /^([A-G](?:#|b)?)/.exec(s.trim().replace(/ flat\b/, 'b').replace(/ sharp\b/, '#'));
  if (!m || NAMES[m[1]] === undefined) throw new Error(`keys: "${s}" names no pitch`);
  return NAMES[m[1]];
};
const pcsOf = (notes: readonly number[]) => [...new Set(notes.map((n) => mod(n, 12)))];
const notesOf = (c: { left: number[]; right: number[]; deep: Hands }) => [...c.left, ...c.right, ...c.deep.left, ...c.deep.right];
/** `k` steps of `scale` (pitch classes) from `midi`. */
function scaleStep(midi: number, k: number, scale: readonly number[]): number {
  let x = midi, left = Math.abs(k);
  const dir = Math.sign(k);
  while (left > 0) { x += dir; if (scale.includes(mod(x, 12))) left--; }
  return x;
}
const lerp = (r: Rng, [a, b]: readonly [number, number]) => a + (b - a) * r.float();
const pick = <T>(r: Rng, items: ReadonlyArray<readonly [T, number]>): T => r.weighted(items.map(([v, w]) => ({ v, w })));

// --- the bass under a chord, measured -------------------------------------------

/** Notes under this are the low register, where two fundamentals that are not a unison, an octave or a fifth apart beat (MIDI 52, E3, 165 Hz). */
export const LOW_REGISTER_MIDI = 52;
/**
 * **How many of a chord's low notes beat against a bass home** (the bass under B,
 * liquid-space round 1): every note of the chord's voicings, plain and deep, under
 * `LOW_REGISTER_MIDI`, whose interval to the home is not a unison, an octave or a
 * fifth. The row's `bass` field was chosen with it, second to the riffs' fit (the round note,
 * `notes/archive/2026-10-liquid/liquid-space-keys.md`): the home whose riff lands more on the chord's tones, and
 * where the two are even, the one that beats less low.
 */
export function lowClash(chord: PhraseChord, homePc: number): number {
  return notesOf(chord).filter((n) => n < LOW_REGISTER_MIDI && ![0, 7].includes(mod(n - homePc, 12))).length;
}
/** The pitch class a chord's bass home is, in the row's own key. */
export const bassPcOf = (row: PhraseRow, chord: PhraseChord): number => (chord.bass === 'key' ? pcOfName(row.key) : pcOfName(chord.root));

// --- admission --------------------------------------------------------------------

/** Everything wrong with the keys rows, as sentences; empty is admitted. */
export function keysRowsFaults(): string[] {
  const bad: string[] = [];
  for (const row of PHRASES) {
    if (!(Number.isFinite(row.weight) && row.weight > 0)) bad.push(`${row.id}: weight ${row.weight}`);
    if (row.chords.length < 1 || row.chords.length > 2) bad.push(`${row.id}: ${row.chords.length} chords; a phrase has one or two`);
    try { pcOfName(row.key); } catch (e) { bad.push(`${row.id}: key ${row.key}`); }
    for (const c of row.chords) {
      if (c.bass !== 'key' && c.bass !== 'root') { bad.push(`${row.id} ${c.symbol}: bass is ${c.bass}, not key or root`); continue; }
      // a pedal only where it is a tone of the chord it holds under
      if (c.bass === 'key' && !pcsOf([...c.left, ...c.right]).includes(pcOfName(row.key)))
        bad.push(`${row.id} ${c.symbol}: the bass holds ${row.key.split(' ')[0]}, which is not a tone of the chord`);
      for (const n of [...c.scale]) if (!Number.isInteger(n) || n < 0 || n > 11) bad.push(`${row.id} ${c.symbol}: scale has ${n}`);
    }
  }
  for (const r of DENSITIES.filter((d) => d.scope === 'track') as unknown as TrackDensityRow[]) {
    if (!r.classes?.otherwise || !r.sections?.[r.classes.otherwise]) bad.push(`${r.id}: classes.otherwise names no section rule`);
    for (const [kind, cls] of Object.entries(r.classes ?? {})) if (!r.sections?.[cls]) bad.push(`${r.id}: ${kind} is ${cls}, no rule`);
    for (const cls of r.budget?.keep ?? []) if (!r.sections?.[cls]) bad.push(`${r.id}: budget keeps ${cls}, no rule`);
    for (const [cls, rule] of Object.entries(r.sections ?? {})) for (const w of rule.ways ?? []) {
      if (!(w.weight > 0)) bad.push(`${r.id} ${cls}: a way weighs ${w.weight}`);
      for (const [gap, wt] of w.every) if (!(Number.isInteger(gap) && gap > 0 && wt > 0)) bad.push(`${r.id} ${cls}: a gap of ${gap} at ${wt}`);
    }
  }
  for (const t of TONES) for (const l of t.layers) if (!BY_NAME[l.sound]) bad.push(`tone ${t.id}: ${l.sound} is no voice`);
  const ids: Record<ChoiceName, readonly string[]> = { tone: TONES.map((r) => r.id), space: Object.keys(SPACE_ROWS), motif: MOTIFS.map((r) => r.id),
    wetness: WETNESS.map((r) => r.id), density: DENSITIES.filter((r) => r.scope === 'track').map((r) => r.id), phrase: PHRASES.map((r) => r.id) };
  for (const d of DRAWS) {
    for (const c of ['tone', 'space', 'motif', 'wetness', 'density'] as const) {
      const w = d[c] ?? {};
      if (!Object.values(w).some((x) => x > 0)) bad.push(`draw ${d.id}: no ${c} weighs anything`);
      for (const [id, x] of Object.entries(w)) { if (!ids[c].includes(id)) bad.push(`draw ${d.id}: ${id} is not a ${c} row`); if (!(Number.isFinite(x) && x >= 0)) bad.push(`draw ${d.id}: ${id} weighs ${x}`); }
    }
    for (const [bird, leans] of Object.entries(d.birds ?? {})) for (const c of CHOICES) for (const [id, x] of Object.entries(leans[c] ?? {})) {
      if (!ids[c].includes(id)) bad.push(`draw ${d.id}: ${bird} leans ${id}, not a ${c} row`);
      if (!(Number.isFinite(x) && Math.abs(x) <= 2)) bad.push(`draw ${d.id}: ${bird} leans ${id} by ${x}`);
    }
  }
  return bad;
}
{
  const bad = keysRowsFaults();
  if (bad.length) throw new Error(`the keys rows: ${bad.join('; ')}`);
}

// --- the place's choice -----------------------------------------------------------

/** What a place's keys entry names: the draw row its themes draw their keys from (`draw.json`), and the part's level in the place's mix. */
export interface KeysChoice { draw: string; levelDb: number }
/** A hand's override for an audition (a tool's, no link reads it yet): any of the rows by id. */
export type KeysOverride = Partial<Record<'tone' | 'space' | 'motif' | 'wetness' | 'density' | 'phrase', string>>;

// --- the plan ---------------------------------------------------------------------

export interface KeysChord {
  index: 0 | 1;
  symbol: string;
  rootPc: number;
  /** the bass's home pitch class under this chord (the row's `bass`), which the bass line resolves its riff against */
  bassPc: number;
  bass: 'key' | 'root';
  plain: Hands;
  deep: Hands;
  /** every pitch class the chord sounds (its voicings') */
  tones: number[];
  /** the motif's scale over it, as pitch classes */
  scale: number[];
  vel: number;
  retouch?: PhraseChord['retouch'];
}
export interface KeysNote {
  /** sixteenths from the theme's first bar */
  step: number;
  lateMs: number;
  midi: number;
  vel: number;
  /** seconds */
  dur: number;
  kind: 'strike' | 'retouch' | 'pre' | 'post';
  hand: 'left' | 'right';
  landing: number;
}
export interface KeysLanding {
  bar: number;
  chord: 0 | 1;
  /** whether the chord changes here */
  change: boolean;
  section: number;
  kind: string;
  cls: string;
  deep: boolean;
  bare: boolean;
  pre: number;
  post: number;
  hold: number;
  contour?: string;
  shape?: string;
}
/** A window the keys own (manual §5, priority 3 over a secondary answer or a texture): in sixteenths from the theme's first bar, `to` not included. */
export interface KeysWindow { kind: 'pickup' | 'landing'; bar: number; from: number; to: number }
/** One voice of the bed between two moments, in sixteenths; `release` in seconds where it leaves for a landing. */
export interface BedSpan { voice: number; midi: number; from: number; to: number; release?: number }
export interface KeysPlan {
  phrase: string;
  /** semitones the row was moved by into the theme's key */
  transpose: number;
  chords: KeysChord[];
  landings: KeysLanding[];
  notes: KeysNote[];
  /** the chord in force from each bar on: the first holds from bar 0 */
  states: Array<{ bar: number; chord: 0 | 1 }>;
  reserved: KeysWindow[];
  bed: BedSpan[];
  /** by section: the keys' level under the section's class, and the space's send and dry against the wetness's */
  sections: Array<{ index: number; startBar: number; bars: number; cls: string; levelDb: number; send: number; dry: number }>;
  /** the part's space: the tone's inserts and the space row at the wetness, as one space row (`settings.partSpace`) */
  space: SpaceRow;
  /** each tone layer: the voice and its gain, and which hands it plays */
  layers: Array<{ voice: string; gain: number; hands: 'both' | 'right' }>;
  choice: Required<KeysOverride>;
  /** how many landings the density drew before the budget, and how many it kept */
  drawn: number;
}

export interface KeysInput {
  seed: string;
  /** the theme's key: its root's pitch class and its scale's intervals */
  root: number;
  scale: readonly number[];
  bars: number;
  barSeconds: number;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number; index: number; lift?: boolean }>;
  choice: KeysChoice;
  /** the birds the theme plays under, which lean the draw (the draw row's `birds`) */
  spell: Readonly<Record<string, number>>;
  override?: KeysOverride;
  /** the bed's register (the style's `padLow` and `padHigh`) */
  padLow: number;
  padHigh: number;
}

const byId = <T extends { id: string }>(list: readonly T[], id: string | undefined, what: string): T => {
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`keys: no ${what} row ${id}`);
  return r;
};

/**
 * **Where a phrase sits in a theme's key**: the semitones that take every note of it
 * (its voicings and its motif's scales) into the theme's scale, the phrase's own key
 * root onto the theme's where that fits (a minor phrase into a minor key), else onto
 * whichever degree fits (a major phrase onto the relative major); moved by the nearest
 * octave, so the row's register stays. Null where nothing fits: the phrase is not drawn.
 */
export function transposeInto(row: PhraseRow, root: number, scale: readonly number[]): number | null {
  const key = new Set(scale.map((s) => mod(root + s, 12)));
  const pcs = pcsOf(row.chords.flatMap((c) => [...notesOf(c), ...c.scale]));
  const fits = Array.from({ length: 12 }, (_, t) => t).filter((t) => pcs.every((p) => key.has(mod(p + t, 12))));
  if (!fits.length) return null;
  const home = mod(root - pcOfName(row.key), 12);
  const t = fits.includes(home) ? home : fits.sort((a, b) => Math.min(a, 12 - a) - Math.min(b, 12 - b))[0];
  return t > 6 ? t - 12 : t;
}

/** A chord's symbol moved by `t` semitones: its root renamed, the rest as written. */
const moveSymbol = (s: string, t: number) => s.replace(/^([A-G](?:#|b)?)/, (m) => SPELL[mod(NAMES[m] + t, 12)]);

/** The part's space as one row: the tone's inserts before the space's, the wetness on its dry and its sends, the levels in its trim. */
export function partSpaceRow(tone: ToneRow, spaceId: string, wet: WetRow, levelDb: number): SpaceRow {
  const space = SPACE_ROWS[spaceId];
  if (!space) throw new Error(`keys: no space row ${spaceId}`);
  // the wetness step holds the space's loudness (`wetness.json`): its return's share of the energy at its own levels
  const under = UNDER_DB[spaceId];
  const w = under == null ? 0.2 : 10 ** (-under / 10);
  const wetTrim = wet.trimDb - 10 * Math.log10((1 - w) * wet.dry ** 2 + w * wet.send ** 2);
  const trimDb = space.trimDb + tone.gainDb + (tone.sparseDb?.[spaceId] ?? 0) + PHRASE_LEVEL_DB + wetTrim + levelDb;
  return Object.freeze({
    schema: 1, kind: 'space', id: 'keysPart', revision: 1,
    dry: +(space.dry * wet.dry).toFixed(4),
    trimDb: +Math.max(-24, Math.min(12, trimDb)).toFixed(3),
    inserts: [...tone.inserts.map((e) => ({ effect: e.effect, params: { ...e.params } })), ...space.inserts.map((e) => ({ effect: e.effect, params: { ...e.params } }))],
    sends: space.sends.map((s) => ({ ...s, params: { ...s.params }, level: +(s.level * wet.send).toFixed(4), ...(s.after ? { after: s.after.map((e) => ({ effect: e.effect, params: { ...e.params } })) } : {}) })),
  }) as SpaceRow;
}

/** The phrases a theme in this key may draw, with their weights and where each sits. */
export function phrasesFor(root: number, scale: readonly number[]): Array<{ row: PhraseRow; t: number; w: number }> {
  return PHRASES.flatMap((row) => { const t = transposeInto(row, root, scale); return t === null ? [] : [{ row, t, w: row.weight }]; });
}

/**
 * **A theme's keys, harmony and bed.** Null where no phrase fits the theme's key (the
 * place then plays as it did).
 */
export function planKeys(input: KeysInput): KeysPlan | null {
  const { seed, bars, sections } = input;
  const o = input.override ?? {};
  const D = byId(DRAWS, input.choice.draw, 'draw');
  // each choice off a stream of its own, by the row's weights leaned by the birds: a new choice moves no other
  const lean = (c: ChoiceName, id: string) => {
    let m = 1;
    for (const [bird, leans] of Object.entries(D.birds ?? {})) {
      const x = leans[c]?.[id], v = input.spell[bird];
      if (x && Number.isFinite(v)) m *= Math.exp(x * D.strength * (v - D.centre));
    }
    return m;
  };
  const draw = (c: Exclude<ChoiceName, 'phrase'>): string => o[c] ?? new Rng(`${seed}::keys:${c}`)
    .weighted(Object.entries(D[c]).filter(([, w]) => w > 0).map(([v, w]) => ({ v, w: w * lean(c, v) })));
  const tone = byId(TONES, draw('tone'), 'tone');
  const spaceId = draw('space');
  const motif = byId(MOTIFS, draw('motif'), 'motif');
  const wet = byId(WETNESS, draw('wetness'), 'wetness');
  const density = byId(DENSITIES as unknown as Array<TrackDensityRow>, draw('density'), 'density');
  if (density.scope !== 'track') throw new Error(`keys: density ${density.id} is not a whole track's row`);

  // the phrase: drawn among those that fit the key, by the rows' own weights (leaned by the birds), off a stream of its own
  const fit = phrasesFor(input.root, input.scale);
  const asked = o.phrase ? fit.find((f) => f.row.id === o.phrase) : undefined;
  if (!fit.length) return null;
  const drawn = asked ?? new Rng(`${seed}::keys:phrase`).weighted(fit.map((f) => ({ v: f, w: f.w * lean('phrase', f.row.id) })));
  const { row, t } = drawn;
  const move = (n: number) => n + t;
  const hands = (h: Hands): Hands => ({ left: h.left.map(move), right: h.right.map(move) });
  const chords: KeysChord[] = row.chords.map((c, i) => ({
    index: i as 0 | 1, symbol: moveSymbol(c.symbol, t), rootPc: mod(pcOfName(c.root) + t, 12), bass: c.bass,
    bassPc: mod(bassPcOf(row, c) + t, 12), plain: hands(c), deep: hands(c.deep),
    tones: pcsOf([...c.left, ...c.right, ...c.deep.left, ...c.deep.right].map(move)), scale: c.scale.map((p) => mod(p + t, 12)), vel: c.vel ?? 1,
    ...(c.retouch ? { retouch: c.retouch } : {}),
  }));

  // --- the landings, section by section, then the track's budget
  const classOf = (kind: string) => density.classes[kind] ?? density.classes.otherwise;
  type Cand = { bar: number; section: number; kind: string; cls: string; line: boolean };
  const cands: Cand[] = [];
  for (const s of sections) {
    const cls = classOf(s.kind);
    const rule = density.sections[cls];
    const r = new Rng(`${seed}::keys:land:${s.index}`);
    const way = r.weighted(rule.ways.map((w) => ({ v: w, w: w.weight })));
    let at = way.from === 'half' ? Math.floor(s.bars / 2) : way.from;
    while (at < s.bars) {
      cands.push({ bar: s.startBar + at, section: s.index, kind: s.kind, cls, line: at === 0 });
      if (!way.every.length) break;
      at += pick(r, way.every);
    }
  }
  let kept = cands.filter((c) => c.bar >= density.cleanBars && c.bar < bars - density.cleanEndBars)
    .sort((a, b) => a.bar - b.bar)
    .filter((c, i, all) => i === 0 || c.bar - all[i - 1].bar >= density.minGapBars);
  const drawnCount = kept.length;
  if (kept.length > density.budget.most) {
    // the lowest class goes first, a section's later landings before its line, the latest first
    const rank = (c: Cand) => { const k = density.budget.keep.indexOf(c.cls); return (k < 0 ? 99 : k) * 1e6 + (c.line ? 0 : 5e5) + c.bar; };
    const order = [...kept].sort((a, b) => rank(b) - rank(a));
    const out = new Set(order.slice(0, kept.length - density.budget.most));
    kept = kept.filter((c) => !out.has(c));
  }

  // --- each landing's writing (the lab's grammar, `lab/keys/plan.ts`), off a stream per landing
  const G = GRAMMAR;
  const stepSeconds = input.barSeconds / 16;
  const landings: KeysLanding[] = [];
  const notes: KeysNote[] = [];
  const reserved: KeysWindow[] = [];
  let current: 0 | 1 = 0;
  kept.forEach((c, n) => {
    const chordIndex = (chords.length > 1 ? n % 2 : 0) as 0 | 1;
    const change = chordIndex !== current;
    current = chordIndex;
    const chord = chords[chordIndex];
    const gapBefore = n > 0 ? c.bar - kept[n - 1].bar : c.bar;
    const gapAfter = n + 1 < kept.length ? kept[n + 1].bar - c.bar : Math.max(1, bars - c.bar);
    const r = new Rng(`${seed}::keys:motif:${c.bar}`);
    const topVel = TOUCH.top * chord.vel;
    const bare = motif.density === 'none' || r.chance(motif.bare);
    const pre: Array<{ at: number; midi: number; vel: number; lateMs: number; sixteenths: number }> = [];
    const post: typeof pre = [];
    let contour: string | undefined, shape: string | undefined;
    const preRoom = Math.min(G.pre.windowSteps, Math.floor(gapBefore / 2) * 16);
    if (!bare && preRoom > 0) {
      const counts = Object.entries(motif.counts ?? G.pre.counts).map(([k, w]) => [+k, w] as const);
      const count = pick(r, counts);
      const cells = (G.pre.cells[count] ?? []).filter((x) => -x.at[0] <= preRoom);
      const shapeOf = pick(r, Object.entries(G.pre.contours).map(([id, x]) => [{ id, ...x }, x.weight] as const));
      const target = pick(r, G.pre.targets.map((x) => [x, x.weight] as const));
      if (cells.length) {
        const cell = pick(r, cells.map((x) => [x, x.weight] as const));
        const right = chord.deep.right;
        const aim = target.voice === 'top' ? right[right.length - 1] : right[right.length - 2];
        const steps = shapeOf.steps[count];
        cell.at.forEach((at, i) => {
          const next = cell.at[i + 1] ?? 0;
          pre.push({ at, midi: scaleStep(aim, steps[i], chord.scale), vel: topVel * lerp(r, G.pre.vel), lateMs: lerp(r, G.pre.lateMs), sixteenths: (next - at) * G.pre.legato });
        });
        contour = shapeOf.id;
      }
    }
    const deep = pre.length > 0;
    const voicing = deep ? chord.deep : chord.plain;
    const nextPre = Math.min(G.pre.windowSteps, Math.floor(gapAfter / 2) * 16);
    const postEnd = Math.min(G.post.windowSteps[1], gapAfter * 16 - nextPre);
    if (!bare && motif.density === 'pre-post' && r.chance(motif.postChance ?? 1)) {
      const sh = pick(r, G.post.shapes.map((x) => [x, x.weight] as const));
      const cells = (G.post.cells[sh.steps.length] ?? []).filter((x) => x.at[x.at.length - 1] < postEnd && x.at[0] >= G.post.windowSteps[0]);
      if (cells.length) {
        const cell = pick(r, cells.map((x) => [x, x.weight] as const));
        const top = voicing.right[voicing.right.length - 1];
        cell.at.forEach((at, i) => post.push({ at, midi: scaleStep(top, sh.steps[i], chord.scale), vel: topVel * lerp(r, G.post.vel), lateMs: lerp(r, G.post.lateMs), sixteenths: G.post.beats * 4 }));
        shape = sh.id;
      }
    }
    const hold = Math.min(gapAfter, 8);
    const base = c.bar * 16;
    // the strike: both hands rolled up from the bass, the top a little over the rest (the lab's touch), its own stream
    const touch = new Rng(`${seed}::keys:touch:${c.bar}`);
    const strike = (h: Hands, both: boolean, step: number, vel: number, held: number, kind: 'strike' | 'retouch') => {
      const all = [...(both ? h.left.map((m) => [m, 'left'] as const) : []), ...h.right.map((m) => [m, 'right'] as const)].sort((a, b) => a[0] - b[0]);
      const top = Math.max(...h.right);
      all.forEach(([midi, hand], i) => {
        const lateMs = i * TOUCH.rollMs + touch.float(-1, 1) * TOUCH.jitterMs;
        const v = Math.max(0.05, Math.min(1, (midi === top ? TOUCH.top : TOUCH[hand]) * vel + touch.float(-1, 1) * TOUCH.velJitter));
        notes.push({ step, lateMs: Math.max(0, lateMs), midi, vel: +v.toFixed(4), dur: held, kind, hand, landing: c.bar });
      });
    };
    strike(voicing, true, base, chord.vel, hold * input.barSeconds - 0.05, 'strike');
    const rt = chord.retouch && chord.retouch.bar < hold ? chord.retouch : null;
    if (rt) strike({ left: [], right: voicing.right }, rt.hands === 'both', base + rt.bar * 16 + rt.step, rt.vel, (hold - rt.bar) * input.barSeconds - 0.05, 'retouch');
    for (const x of pre) notes.push({ step: base + x.at, lateMs: x.lateMs, midi: x.midi, vel: +x.vel.toFixed(4), dur: Math.max(stepSeconds, x.sixteenths * stepSeconds), kind: 'pre', hand: 'right', landing: c.bar });
    for (const x of post) notes.push({ step: base + x.at, lateMs: x.lateMs, midi: x.midi, vel: +x.vel.toFixed(4), dur: Math.max(stepSeconds, x.sixteenths * stepSeconds), kind: 'post', hand: 'right', landing: c.bar });
    // the windows the keys own: the pickup up to the strike, and the strike's own beat
    if (pre.length) reserved.push({ kind: 'pickup', bar: c.bar, from: base + pre[0].at, to: base });
    reserved.push({ kind: 'landing', bar: c.bar, from: base, to: base + 4 });
    landings.push({ bar: c.bar, chord: chordIndex, change, section: c.section, kind: c.kind, cls: c.cls, deep, bare, pre: pre.length, post: post.length, hold,
      ...(contour ? { contour } : {}), ...(shape ? { shape } : {}) });
  });
  notes.sort((a, b) => a.step - b.step || a.lateMs - b.lateMs);
  const states: KeysPlan['states'] = [{ bar: 0, chord: 0 }, ...landings.filter((l) => l.change).map((l) => ({ bar: l.bar, chord: l.chord }))];

  // --- the bed: common tones held, one voice moving, thinned round each landing
  const B = density.bed;
  // the first chord's right hand, its lowest voices, moved as one block by octaves into the bed's register (its spacing kept)
  const first = (() => {
    const out: number[] = [];
    for (const m of [...chords[0].plain.right].sort((a, b) => a - b)) {
      if (!out.some((x) => mod(x, 12) === mod(m, 12))) out.push(m);
      if (out.length === B.voices) break;
    }
    let shift = 0;
    while (Math.max(...out) + shift > input.padHigh) shift -= 12;
    while (Math.min(...out) + shift < input.padLow && Math.max(...out) + shift + 12 <= input.padHigh) shift += 12;
    return out.map((m) => m + shift);
  })();
  /**
   * The voicing a chord takes from the one before (manual A1): a voice on a tone of it
   * holds, any other moves to the nearest tone not already taken; and where every voice
   * could hold, the one nearest a tone the old chord did not have moves there, so the
   * change is heard in the bed by one voice and never by none.
   */
  const nearestOf = (m: number, ok: (pc: number) => boolean, taken: Set<number>): number | null => {
    for (let d = 1; d <= 6; d++) for (const x of [m - d, m + d]) {
      if (ok(mod(x, 12)) && !taken.has(mod(x, 12)) && x >= input.padLow && x <= input.padHigh) return x;
    }
    return null;
  };
  const lead = (from: number[], was: KeysChord, to: KeysChord): number[] => {
    const out = from.map((m) => (to.tones.includes(mod(m, 12)) ? m : null));
    from.forEach((m, i) => {
      if (out[i] !== null) return;
      const taken = new Set(out.filter((x): x is number => x !== null).map((x) => mod(x, 12)));
      out[i] = nearestOf(m, (pc) => to.tones.includes(pc), taken) ?? m - 1;
    });
    if (out.every((m, i) => m === from[i])) {
      const own = (pc: number) => to.tones.includes(pc) && !was.tones.includes(pc);
      let best: { i: number; x: number } | null = null;
      from.forEach((m, i) => {
        const taken = new Set(from.filter((_, j) => j !== i).map((x) => mod(x, 12)));
        const x = nearestOf(m, own, taken);
        if (x !== null && (!best || Math.abs(x - m) < Math.abs(best.x - from[best.i]))) best = { i, x };
      });
      if (best) out[(best as { i: number; x: number }).i] = (best as { i: number; x: number }).x;
    }
    return out as number[];
  };
  const bed: BedSpan[] = [];
  const open = first.map((midi, voice) => ({ voice, midi, from: 0 }));
  let voicing = first;
  const thinRelease = B.thinRelease;
  const releaseSteps = Math.ceil(thinRelease / stepSeconds);
  for (const l of landings) {
    const L = l.bar * 16;
    const next = l.change ? lead(voicing, chords[1 - l.chord], chords[l.chord]) : voicing;
    let moving = next.map((m, i) => (m !== voicing[i] ? i : -1)).filter((i) => i >= 0);
    if (!moving.length) moving = [voicing.indexOf(Math.max(...voicing))];
    // a bed with no common tone keeps its lowest voice to the strike, so it never leaves a hole
    const holder = moving.length === voicing.length ? moving.reduce((a, i) => (voicing[i] < voicing[a] ? i : a), moving[0]) : -1;
    const pickup = reserved.find((w) => w.kind === 'pickup' && w.bar === l.bar);
    const thinFrom = Math.min(pickup ? pickup.from : L - B.bareLeadSteps, L - releaseSteps);
    for (const i of moving) {
      const sp = open[i];
      const end = i === holder ? L - releaseSteps : thinFrom;
      if (end > sp.from) bed.push({ voice: i, midi: sp.midi, from: sp.from, to: end, release: thinRelease });
      open[i] = { voice: i, midi: next[i], from: L + B.returnSteps };
    }
    voicing = next;
  }
  for (const sp of open) if (bars * 16 > sp.from) bed.push({ ...sp, to: bars * 16 });
  // a voice strikes again where the sections change their stage (a lifted section's bed sits where it was, a full one's
  // up and under, `BedEntry.up`), so a held tone never carries one section's register into the other
  const lines = sections.filter((x, i) => i > 0 && !!x.lift !== !!sections[i - 1].lift).map((x) => x.startBar * 16);
  const split: BedSpan[] = [];
  for (const sp of bed) {
    let from = sp.from;
    for (const at of lines) if (at > from && at < sp.to) { split.push({ voice: sp.voice, midi: sp.midi, from, to: at }); from = at; }
    split.push({ ...sp, from });
  }
  bed.length = 0;
  bed.push(...split.sort((a, b) => a.from - b.from || a.voice - b.voice));

  // --- the section's mix of the keys, and the part's space
  const sectionMix = sections.map((s) => {
    const cls = classOf(s.kind), rule = density.sections[cls];
    return { index: s.index, startBar: s.startBar, bars: s.bars, cls, levelDb: rule.levelDb ?? 0, send: rule.send ?? 1, dry: rule.dry ?? 1 };
  });
  const space = partSpaceRow(tone, spaceId, wet, input.choice.levelDb);
  const layers = tone.layers.map((l) => ({ voice: l.sound, gain: 10 ** (l.gainDb / 20), hands: l.hands }));
  return {
    phrase: row.id, transpose: t, chords, landings, notes, states, reserved, bed, sections: sectionMix, space, layers,
    choice: { tone: tone.id, space: spaceId, motif: motif.id, wetness: wet.id, density: density.id, phrase: row.id }, drawn: drawnCount,
  };
}

/** The chord state in force at a bar. */
export function chordIndexAt(plan: KeysPlan, bar: number): 0 | 1 {
  let c: 0 | 1 = 0;
  for (const s of plan.states) { if (s.bar > bar) break; c = s.chord; }
  return c;
}

/** Whether a moment (in sixteenths from the theme's start) falls inside a pickup the keys own. */
export function inPickup(plan: KeysPlan | null, step: number): boolean {
  return !!plan && plan.reserved.some((w) => w.kind === 'pickup' && step >= w.from && step < w.to);
}

/** What a plan says about its keys, as plain data on the theme: the readout, the checks and a planner placing answers read it. */
export interface KeysReadout {
  phrase: string;
  transpose: number;
  choice: Required<KeysOverride>;
  chords: Array<{ symbol: string; rootPc: number; bassPc: number; bass: 'key' | 'root'; tones: number[] }>;
  states: Array<{ bar: number; chord: 0 | 1 }>;
  landings: KeysLanding[];
  /** the windows the keys own, in sixteenths from the theme's start: a pickup up to its strike, the strike's own beat */
  reserved: KeysWindow[];
  drawn: number;
}
export function keysReadout(plan: KeysPlan): KeysReadout {
  return {
    phrase: plan.phrase, transpose: plan.transpose, choice: { ...plan.choice },
    chords: plan.chords.map((c) => ({ symbol: c.symbol, rootPc: c.rootPc, bassPc: c.bassPc, bass: c.bass, tones: [...c.tones] })),
    states: plan.states.map((s) => ({ ...s })), landings: plan.landings.map((l) => ({ ...l })), reserved: plan.reserved.map((w) => ({ ...w })), drawn: plan.drawn,
  };
}
