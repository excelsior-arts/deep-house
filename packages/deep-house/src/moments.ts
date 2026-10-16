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
//   producer     what the fast places' producer wrote on its phrases (`track.passage.phrases`): the drums' states (a
//                half-time breath, a roller's answer, the crest's spotlight, the build into a drop), its endings and
//                inflections, the bass's outs and cooldowns, the climb and the closing arc's moment, the drums and the
//                field leaning into an arrival
//   development  the phrase development's moves (`track.development.answers`)
//
// It reads; it writes nothing the program plays, so a theme sounds exactly as it did. Nothing here names a place, a
// genre or a seed.
import PHRASING_FILE from '../recipes/arrangement/phrasing.json' with { type: 'json' };
import { subMarksOf, type SubMarkKind } from './ring-subsections.ts';

/** Where a moment was written. */
export type MomentSource = 'phrasing' | 'house' | 'glue' | 'arc' | 'producer' | 'development';
/** One moment: its mark kind, its bars (`to` exclusive; a stroke at a line has `to` equal to `from`), its words, and its source. */
export interface Moment { kind: SubMarkKind; from: number; to: number; label: string; by: MomentSource }

/** The kinds a stroke at a line is drawn as (`to` equal to `from`). */
const AT_LINE: ReadonlySet<SubMarkKind> = new Set(['answer', 'turn']);

/** The house's small things by their figure kind (`src/treatment.ts` `PLAYED_KINDS`). */
const HOUSE_KIND: Readonly<Record<string, SubMarkKind>> = { fill: 'fill', 'drop-out': 'drop-out', 'switch-up': 'switch-up', turnaround: 'turn', variation: 'groove' };

/** The vocabulary's entries (`recipes/arrangement/phrasing.json`): each producer ending name to the mark its entry is drawn as. */
const ENTRY_KIND: Readonly<Record<string, SubMarkKind>> = {
  fill: 'fill', 'kick-back': 'fill', 'drop-out': 'drop-out', turnaround: 'turn', variation: 'turn', 'switch-up': 'switch-up',
  crash: 'answer', 'hats-breathe': 'answer', reverse: 'answer',
};
const ENDING: Readonly<Record<string, SubMarkKind>> = (() => {
  const out: Record<string, SubMarkKind> = {};
  const entries = (PHRASING_FILE as unknown as { rows: Array<{ vocabulary: { entries: Record<string, { producer: string[] }> } }> }).rows[0].vocabulary.entries;
  for (const [id, e] of Object.entries(entries)) for (const name of e.producer) if (ENTRY_KIND[id]) out[name] = ENTRY_KIND[id];
  return out;
})();
/** The producer's drum states (`src/passage.ts` `DrumState`): the half-time breath, the crest's spotlight, the build into a drop, and the groove's other states; the straight groove is no moment. */
const STATE_KIND: Readonly<Record<string, SubMarkKind>> = { H: 'half-time', T: 'crest', B: 'lead-in', R: 'groove', X: 'groove', O: 'groove' };

export interface MomentsInput {
  bars: number;
  phrasing?: Parameters<typeof subMarksOf>[0] | null;
  /** the house's small things as heard (the sub-sections the readout names) */
  house?: ReadonlyArray<{ kind: string; startBar: number; bars: number; label: string }>;
  /** the lead-ins' risers into a line, in bars */
  risers?: ReadonlyArray<{ from: number; to: number; label?: string }>;
  padArc?: { arcs?: ReadonlyArray<{ crest?: readonly [number, number] | number[] | null }> } | null;
  passage?: { phrases?: ReadonlyArray<{ from: number; to: number; fn: string; by?: string; drums?: string; bass?: string; voice?: string; answers?: string }> } | null;
  development?: { answers?: ReadonlyArray<{ bar: number; answer: string }>; phrases?: ReadonlyArray<{ family?: string; variant?: string; at?: number }> } | null;
}

/** The theme's moments, in bar order, each clipped to the theme and each once (a kind at a bar). */
export function momentsOf(I: MomentsInput): Moment[] {
  const bars = I.bars, out: Moment[] = [];
  const seen = new Set<string>();
  const add = (kind: SubMarkKind, from: number, to: number, label: string, by: MomentSource) => {
    const a = Math.max(0, Math.floor(from));
    const z = AT_LINE.has(kind) ? a : Math.min(bars, Math.ceil(to));
    if (AT_LINE.has(kind) ? !(a < bars) : !(z > a)) return;
    const key = `${kind}|${a}|${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, from: a, to: z, label, by });
  };
  for (const m of subMarksOf(I.phrasing, bars)) add(m.kind, m.from, m.to, m.label, 'phrasing');
  for (const s of I.house ?? []) { const k = HOUSE_KIND[s.kind]; if (k) add(k, s.startBar, s.startBar + s.bars, s.label, 'house'); }
  for (const r of I.risers ?? []) add('lead-in', r.from, r.to, r.label ?? 'a riser into the line', 'glue');
  for (const a of I.padArc?.arcs ?? []) if (a.crest && a.crest.length === 2) add('crest', a.crest[0], a.crest[1], `the pad arc's crest ${a.crest[0]}-${a.crest[1] - 1}`, 'arc');
  for (const p of I.passage?.phrases ?? []) {
    if (p.by !== 'grammar') continue;
    const drums = p.drums ?? '';
    // the drums' states: "S 96-99, R 100-103; …"
    for (const m of drums.matchAll(/\b([SRXTHOB]) (\d+)-(\d+)/g)) {
      const k = STATE_KIND[m[1]];
      if (k) add(k, Number(m[2]), Number(m[3]) + 1, `the drums ${m[1] === 'H' ? 'at half time' : m[1] === 'T' ? 'in the spotlight' : m[1] === 'B' ? 'building into the drop' : 'turning'} ${m[2]}-${m[3]}`, 'producer');
    }
    // the ending on the phrase's last bar, and the inflections at their bars: "ending kickOut; ghostTail at 123"
    const end = /ending ([A-Za-z+]+)/.exec(drums);
    if (end) for (const name of end[1].split('+')) { const k = ENDING[name]; if (k) add(k, k === 'answer' ? p.to : p.to - 1, p.to, `${name} into ${p.to}`, 'producer'); }
    for (const m of drums.matchAll(/([A-Za-z]+) at (\d+)/g)) { const k = ENDING[m[1]]; if (k) add(k, Number(m[2]), Number(m[2]) + 1, `${m[1]} at ${m[2]}`, 'producer'); }
    const bass = p.bass ?? '';
    const out1 = /out for the last (\d+) bars? before (\d+)/.exec(bass);
    if (out1) add('bass-out', Number(out1[2]) - Number(out1[1]), Number(out1[2]), `the bass out before ${out1[2]}`, 'producer');
    const cool = /the cooldown: [^(]*\((\d+)-(\d+)\)/.exec(bass);
    if (cool) add('cooldown', Number(cool[1]), Number(cool[2]) + 1, `the cooldown ${cool[1]}-${cool[2]}`, 'producer');
    if (/the climb/.test(bass) || /the closing arc's moment/.test(p.voice ?? '')) add('crest', p.from, p.to, `the closing arc's moment ${p.from}-${p.to - 1}`, 'producer');
    for (const m of (p.answers ?? '').matchAll(/lean into (\d+)/g)) add('answer', Number(m[1]), Number(m[1]), `the drums and the field lean into ${m[1]}`, 'producer');
  }
  const family = new Map((I.development?.phrases ?? []).filter((p) => p.variant).map((p) => [p.variant!, p.family ?? '']));
  for (const a of I.development?.answers ?? []) {
    const f = family.get(a.answer) ?? (/out\b|-out$/.test(a.answer) ? 'subtract' : 'answer');
    add(f === 'subtract' ? 'drop-out' : 'turn', a.bar, a.bar + 1, `${a.answer} at ${a.bar}`, 'development');
  }
  return out.sort((x, y) => x.from - y.from || x.to - y.to || x.kind.localeCompare(y.kind));
}
