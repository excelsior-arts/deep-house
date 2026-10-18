// **Every moment the composer made, in one list** (U2e; his word 10-13 on the Downtempo tile seed 39: "has little sub
// segments that are not marked on the ring in any way", and on the DnB tile seed 6: "great track! but no markings of
// sub segments"). The ring marks what the arrangement's phrases did (`track.phrasing`); a theme has more moments than
// those, each written down somewhere already, and this reads them all into `track.moments`, labelled, each at its real
// bars, in the ring's mark kinds (`src/ring-subsections.ts`):
//
//   phrasing     the arrangement's phrases (U2/U2d): the sub-segments, their builds, the outs, the cooldowns, the answers
//   house        the house's own small things as heard: the fills, the drop-out bars (a breath, a kick out, the bass
//                out), the switch-ups, the turnarounds, the variations
//   glue         the lead-ins' risers into a line
//   arc          the pad arc's crest (U3)
//   producer     what the fast places' producer did, read as fields (`track.passage.marks`, `ProducerMarks` in
//                `src/producer.ts`; dnb-marks), the first passage as the rest: the drums' states (the half-time breath, the
//                roller's answer, the snare displaced, the straight top and its spotlight, the build into a drop), its
//                endings and inflections by the one vocabulary, the bass's outs, the cooldowns, the closing arc's moment,
//                the keys' strikes, and the drum-led builds into the drops and returns as heard (`track.passage.builds`)
//   development  the phrase development's moves (`track.development.answers`)
//
// It reads; it writes nothing the program plays, so a theme sounds exactly as it did. Nothing here names a place, a
// genre or a seed.
import PHRASING_FILE from '../recipes/arrangement/phrasing.json' with { type: 'json' };
import { subMarksOf, SUB_STYLE, type SubMarkKind } from './ring-subsections.ts';
import { END_EMPTIES, type End } from './passage.ts';
import type { ProducerMarks } from './producer.ts';

/** Where a moment was written. */
export type MomentSource = 'phrasing' | 'house' | 'glue' | 'arc' | 'producer' | 'development';
/**
 * One moment: its mark kind, its bars (`to` exclusive; a stroke at a line has `to` equal to `from`), its words, and its
 * source. A bar emptied from a sixteenth to its line, and a build of a beat or two, stand at their real length: `from`
 * and `to` may fall inside a bar, in sixteenths.
 */
export interface Moment { kind: SubMarkKind; from: number; to: number; label: string; by: MomentSource }

/** The kinds a stroke at a line is drawn as (`to` equal to `from`). */
const AT_LINE: ReadonlySet<SubMarkKind> = new Set(['answer', 'turn', 'keys']);

/** The house's small things by their figure kind (`src/treatment.ts` `PLAYED_KINDS`). */
const HOUSE_KIND: Readonly<Record<string, SubMarkKind>> = { fill: 'fill', 'drop-out': 'drop-out', 'switch-up': 'switch-up', turnaround: 'turn', variation: 'groove' };

/**
 * The vocabulary's entries (`recipes/arrangement/phrasing.json`): each producer ending name to the mark its entry is
 * drawn as. The kick carried on through a build's bar (`kick-back`) is no moment: it keeps the groove whole.
 */
const ENTRY_KIND: Readonly<Record<string, SubMarkKind>> = {
  fill: 'fill', 'drop-out': 'drop-out', turnaround: 'turn', variation: 'turn', 'switch-up': 'switch-up',
  crash: 'answer', 'hats-breathe': 'answer', reverse: 'answer',
};
const ENDING: Readonly<Record<string, SubMarkKind>> = (() => {
  const out: Record<string, SubMarkKind> = {};
  const entries = (PHRASING_FILE as unknown as { rows: Array<{ vocabulary: { entries: Record<string, { producer: string[] }> } }> }).rows[0].vocabulary.entries;
  for (const [id, e] of Object.entries(entries)) for (const name of e.producer) if (ENTRY_KIND[id]) out[name] = ENTRY_KIND[id];
  return out;
})();
/** The endings that lean into the next line rather than land on their own bar (a reverse swell rises into it). */
const INTO_LINE: ReadonlySet<string> = new Set(['reverseCymbal']);
/** An ending's words on the ring. */
const ENDING_WORDS: Readonly<Partial<Record<End, (bar: number) => string>>> = {
  crash: (b) => `the crash on ${b}`, hatsBreathe: (b) => `the hats breathe on ${b}`, reverseCymbal: (b) => `a reverse swell into ${b}`,
  halfBarBreath: (b) => `the drums out over the last half of ${b}`, lastBeatEmpty: (b) => `the last beat of ${b} empty`, beatSilence: (b) => `the last beat of ${b} silent`,
};

/**
 * The producer's drum states (`src/passage.ts` `DrumState`), each to its mark and its words: the half-time breath, the
 * straight top (its spotlight where it has one), the build into a drop, and the groove's other states, each said as
 * what it does; the straight groove is no moment.
 */
const STATE: Readonly<Record<string, { kind: SubMarkKind; says: (span: string, spot: boolean) => string }>> = {
  H: { kind: 'half-time', says: (x) => `the drums at half time ${x}` },
  T: { kind: 'crest', says: (x, spot) => (spot ? `the drums in the spotlight ${x}` : `the straight top ${x}`) },
  B: { kind: 'lead-in', says: (x) => `the drop's drums fading in ${x}` },
  R: { kind: 'groove', says: (x) => `the roller's answer ${x}: ghosts and the accents moved every other bar` },
  X: { kind: 'groove', says: (x) => `the snare displaced ${x}: the quieter snare from 4 to 6 every other bar` },
  O: { kind: 'groove', says: (x) => `the drums out ${x}` },
};

export interface MomentsInput {
  bars: number;
  phrasing?: Parameters<typeof subMarksOf>[0] | null;
  /** the house's small things as heard (the sub-sections the readout names) */
  house?: ReadonlyArray<{ kind: string; startBar: number; bars: number; label: string }>;
  /** the lead-ins' risers into a line, in bars */
  risers?: ReadonlyArray<{ from: number; to: number; label?: string }>;
  padArc?: { arcs?: ReadonlyArray<{ crest?: readonly [number, number] | number[] | null }> } | null;
  /** the producer's moments as fields, and the drum-led builds as heard (absolute lines, in written beats) */
  passage?: { marks?: ProducerMarks | null; builds?: ReadonlyArray<{ line: number; beats: number; label: string }> } | null;
  /**
   * the phrase development's moves; `emptied`, by answer, the stretch of its bar every lane of the kit leaves (the
   * sixteenths from and to), where the kit's own moves clear them all
   */
  development?: { answers?: ReadonlyArray<{ bar: number; answer: string }>; phrases?: ReadonlyArray<{ family?: string; variant?: string; at?: number }>;
    emptied?: Readonly<Record<string, readonly [number, number]>> } | null;
}

/**
 * The theme's moments, in bar order, each clipped to the theme and each once (a kind at a bar). The producer's groove
 * states (the lightest dash) yield to every other span of the phrase track where they meet (a cooldown, a build, a
 * fill): one line a stretch of the track. The house's own variations are drawn as they were.
 */
export function momentsOf(I: MomentsInput): Moment[] {
  const bars = I.bars, out: Moment[] = [];
  const seen = new Set<string>();
  // `exact`: a mark inside a bar (an emptied bar's end, a short build) keeps its sixteenths; any other is a whole bar
  const add = (kind: SubMarkKind, from: number, to: number, label: string, by: MomentSource, exact = false) => {
    const q = (x: number) => Math.round(x * 16) / 16;
    const a = Math.max(0, exact ? q(from) : Math.floor(from));
    const z = AT_LINE.has(kind) ? a : Math.min(bars, exact ? q(to) : Math.ceil(to));
    if (AT_LINE.has(kind) ? !(a < bars) : !(z > a)) return;
    const key = `${kind}|${a}|${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, from: a, to: z, label, by });
  };
  for (const m of subMarksOf(I.phrasing, bars)) add(m.kind, m.from, m.to, m.label, 'phrasing');
  // the hats' moves at the transitions (hat-moves): a turn where the move starts, inside its bar
  for (const h of I.phrasing?.hats ?? []) add('turn', h.bar + h.from / 16, h.bar + h.from / 16, h.label, 'phrasing', true);
  for (const s of I.house ?? []) { const k = HOUSE_KIND[s.kind]; if (k) add(k, s.startBar, s.startBar + s.bars, s.label, 'house'); }
  for (const r of I.risers ?? []) add('lead-in', r.from, r.to, r.label ?? 'a riser into the line', 'glue');
  for (const a of I.padArc?.arcs ?? []) if (a.crest && a.crest.length === 2) add('crest', a.crest[0], a.crest[1], `the pad arc's crest ${a.crest[0]}-${a.crest[1] - 1}`, 'arc');
  const P = I.passage?.marks;
  if (P) {
    const span = (a: number, z: number) => `${a}-${z - 1}`;
    for (const s of P.states) { const S = STATE[s.state]; if (S) add(S.kind, s.from, s.to, S.says(span(s.from, s.to), !!s.spotlight), 'producer'); }
    for (const x of P.endings) for (const name of x.end) {
      const k = ENDING[name];
      if (!k) continue;
      const words = ENDING_WORDS[name];
      if (k === 'answer') { const line = INTO_LINE.has(name) ? x.bar + 1 : x.bar; add(k, line, line, words ? words(line) : `${name} on ${line}`, 'producer'); continue; }
      const empties = k === 'drop-out' ? END_EMPTIES[name] : undefined;
      if (empties != null) add(k, x.bar + empties / 16, x.bar + 1, words ? words(x.bar) : `${name} on ${x.bar}`, 'producer', true);
      else add(k, x.bar, x.bar + 1, `${name} on ${x.bar}`, 'producer');
    }
    for (const c of P.cooldowns) add('cooldown', c.from, c.to, `the cooldown ${span(c.from, c.to)}: the drums alone into the ${c.into}`, 'producer');
    for (const o of P.bassOuts) add('bass-out', o.from, o.to, o.cooldown ? `the bass out across the cooldown ${span(o.from, o.to)}` : `the bass out ${span(o.from, o.to)}, back on ${o.to}`, 'producer');
    if (P.feature) add('crest', P.feature.from, P.feature.to, `the closing arc's moment ${span(P.feature.from, P.feature.to)}: the motif recalled, the bass climbing`, 'producer');
    for (const k of P.keys) add('keys', k.at, k.at, k.label, 'producer');
  }
  // the drum-led builds into the drops and the breath's returns (fast-drops), each over its own beats into its line
  for (const b of I.passage?.builds ?? []) add('fill', b.line - b.beats / 4, b.line, `the build into ${b.line}: ${b.label}`, 'producer', true);
  const family = new Map((I.development?.phrases ?? []).filter((p) => p.variant).map((p) => [p.variant!, p.family ?? '']));
  for (const a of I.development?.answers ?? []) {
    const f = family.get(a.answer) ?? (/out\b|-out$/.test(a.answer) ? 'subtract' : 'answer');
    const emptied = f === 'subtract' ? I.development?.emptied?.[a.answer] : undefined;
    if (emptied) add('drop-out', a.bar + emptied[0] / 16, a.bar + emptied[1] / 16, `${a.answer} at ${a.bar}`, 'development', true);
    else add(f === 'subtract' ? 'drop-out' : 'turn', a.bar, a.bar + 1, `${a.answer} at ${a.bar}`, 'development');
  }
  return unhidden(yieldGrooves(out)).sort((x, y) => x.from - y.from || x.to - y.to || x.kind.localeCompare(y.kind));
}

/**
 * The producer's and the development's strokes another mark already draws: a turn or a keys strike at a line the drums
 * answer (the answer's stroke crosses both tracks), and a turn on a bar a fill fills (the heavier bar is its ending).
 */
function unhidden(ms: Moment[]): Moment[] {
  const answered = new Set(ms.filter((m) => m.kind === 'answer').map((m) => m.from));
  const fills = ms.filter((m) => m.kind === 'fill');
  return ms.filter((m) => m.by === 'house' || m.by === 'phrasing' || m.by === 'glue' || m.by === 'arc'
    || !((m.kind === 'turn' || m.kind === 'keys') && answered.has(m.from)) && !(m.kind === 'turn' && fills.some((f) => f.from <= m.from && f.to > m.from)));
}

/** The producer's groove states cut where another span of the phrase track runs (a cooldown, a fill, a build): what is left of each stays. */
function yieldGrooves(ms: Moment[]): Moment[] {
  const spans = ms.filter((m) => m.kind !== 'groove' && SUB_STYLE[m.kind].track === 'phrase' && SUB_STYLE[m.kind].shape === 'span').sort((a, b) => a.from - b.from);
  const out: Moment[] = [];
  for (const m of ms) {
    if (m.kind !== 'groove' || m.by !== 'producer') { out.push(m); continue; }
    let a = m.from;
    for (const s of spans) {
      if (s.to <= a || s.from >= m.to) continue;
      if (s.from > a) out.push({ ...m, from: a, to: s.from });
      a = Math.max(a, s.to);
    }
    if (m.to > a) out.push({ ...m, from: a, to: m.to });
  }
  return out;
}
