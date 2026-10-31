// **The arc rule: a signature part withheld, teased, exposed in runs, then peaking** (round engine-data, 10-28; the rule
// is the trance hook's, measured on source 10 in trance-2, lifted out so any part can name it). His rule (RULES, 10-28):
// *"A genre's signature sound is placed by the track's form the way a producer of that genre places it: withheld,
// teased, exposed, then the peak."*
//
// A rule is a row of `recipes/arrangement/arcs.json`, named by the part that plays it (the hook row's `arc`). It says,
// by the section's kind, where the part plays: a tease at the track's start (`tease` bars), a run at a main's end after
// a groove of `groove` bars, a run from a point of a section (`from`, a share of it, on the `step` grid), a section the
// run continues into (`continues`), a build that joins only into a run (`into`), and a kind that joins only where the
// part's share would fall under the row's bottom without it (`short`). The runs are shaped so none outlasts the last
// (the peak; the code review of 10-29: the promise held for every run, not only the ones a main's end opens): a run that
// opens with a main's end is shortened from its front (a longer groove first), any other from its end, a hard cut with
// the section's groove going on; and the share stays inside `share` where the form allows. Every run of `breakFrom` bars
// or more ends in `breakBars` of the part alone, unless it runs into a kind in `noBreakInto` or was cut short. `knobs` are any quantities ramped from
// the first run to the peak (the hook's chop depth and level), each with its tease value.
//
// The output is one entry a bar: its state, its place in the run, the run's number, its position from the first run
// to the peak, and every knob's value there. The part reads the knobs in its own units (the hook turns dB into gains).
// Pure: no DOM, no engine, no die; the code names no place and no part.

import FILE from '../recipes/arrangement/arcs.json' with { type: 'json' };

/** `short`: the kind joins only where the part's share would fall under the row's bottom without it */
export type SectionArc = { tease?: number; end?: boolean; groove?: number; from?: number; into?: boolean; continues?: boolean; short?: boolean };
/** A knob ramped over the arc: its value in the tease, at the first run and at the peak (the runs between in step). */
export interface ArcKnob { tease: number; first: number; peak: number }
/** An arc rule (`recipes/arrangement/arcs.json`). */
export interface ArcRule {
  id: string;
  sections: Record<string, SectionArc>;
  /** the grid runs are shortened by, in bars */
  step: number;
  /** a run's closing bars, the part alone */
  breakBars: number;
  /** runs of this many bars or more get a break */
  breakFrom: number;
  /** no break into these kinds (a breakdown: the drums are out there already) */
  noBreakInto?: string[];
  /** the part's share of the track, bottom and top, where the form allows */
  share: [number, number];
  knobs: Record<string, ArcKnob>;
}
export const ARC_RULES: readonly ArcRule[] = (FILE as unknown as { rows: ArcRule[] }).rows;
/** An arc rule by id; none where the name is unknown. */
export const arcRuleOf = (id?: string | null): ArcRule | null => ARC_RULES.find((r) => r.id === id) ?? null;

/** A section as the arc reads it. */
export interface ArcSection { kind: string; startBar: number; bars: number }
/** A bar of the arc: off, the tease, a run, or a run's closing bars of the part alone. */
export type ArcState = 'off' | 'tease' | 'run' | 'break';
export interface ArcBar {
  state: ArcState;
  /** the bar's place in its run (or the tease), from nought: a part's cells count from it */
  at: number;
  /** the run's number, from nought (-1: the tease or none) */
  run: number;
  /** the run's position from the first run (0) to the peak (1); 1 where there is one run; 0 off and in the tease */
  u: number;
  /** the run's bars before its break (the tease's length in the tease; 0 off) */
  until: number;
  /** every knob's value here (the rule's `knobs`, ramped by `u`; the tease value in the tease; the tease value off, unused) */
  knobs: Record<string, number>;
}
/** A run of the part: its first bar and its length (its break included); `cut`, shortened from its end inside its section. */
export interface ArcRun { from: number; bars: number; adjustable: boolean; cut?: boolean }

/** The runs over the sections by the rule (with or without the kinds that join only when short), shaped and shared. */
function runsOf(A: ArcRule, sections: readonly ArcSection[], bars: number, withShort: boolean): { runs: ArcRun[]; tease: number; share: number } {
  const step = A.step;
  const on = new Array<boolean>(bars).fill(false), soft = new Array<boolean>(bars).fill(false);
  let tease = 0;
  sections.forEach((s, i) => {
    const k = A.sections[s.kind];
    if (!k || (k.short && !withShort)) return;
    const end = Math.min(bars, s.startBar + s.bars);
    if (k.tease) { if (s.startBar === 0) tease = Math.min(end, k.tease); return; }
    // a build joins only the run it leads straight into
    const next = A.sections[sections[i + 1]?.kind ?? ''];
    if (k.into && !(next && next.from != null)) return;
    if (k.continues) { if (s.startBar > 0 && on[s.startBar - 1]) for (let b = s.startBar; b < end; b++) on[b] = true; return; }
    const from = k.end ? s.startBar + Math.min(s.bars, Math.max(k.groove ?? 0, 0)) : s.startBar + Math.round((k.from ?? 0) * s.bars / step) * step;
    for (let b = from; b < end; b++) { on[b] = true; if (k.end) soft[b] = true; }
  });
  // the runs: contiguous bars, adjustable where they open with a main's end (shortened from the front, by the step)
  const runs: ArcRun[] = [];
  for (let b = 0; b < bars; b++) if (on[b] && (b === 0 || !on[b - 1])) {
    let e = b; while (e < bars && on[e]) e++;
    runs.push({ from: b, bars: e - b, adjustable: soft[b] });
  }
  const shrink = (r: ArcRun) => { if (!r.adjustable || r.bars < step) return false; r.from += step; r.bars -= step; return true; };
  // (a run no main's end opens, a drop's: shortened from its end, the part cut out while the section's groove goes on)
  const cut = (r: ArcRun) => { if (r.bars < step) return false; r.bars -= step; r.cut = true; return true; };
  // the peak is the last run, and no other one is longer (the deepest knob goes to it)
  const peak = runs[runs.length - 1];
  if (peak) for (const r of runs.slice(0, -1)) while (r.bars > peak.bars && (shrink(r) || (!r.adjustable && cut(r)))) { /* shorter */ }
  // the share: shortened from the first while over the row's top
  const share = () => (tease + runs.reduce((s, r) => s + r.bars, 0)) / Math.max(1, bars);
  for (const r of runs.slice(0, -1)) while (share() > A.share[1] + 1e-9 && r.bars > 0 && shrink(r)) { /* shorter */ }
  return { runs: runs.filter((r) => r.bars > 0), tease, share: share() };
}

/**
 * **Where the part plays** over a theme's sections by the rule: the runs, shaped so the last is the longest (the peak)
 * and the part's share of the track inside the rule's `share` where the form allows, each run's closing bars the part
 * alone, every knob ramped from the first run to the peak. One entry a bar.
 */
export function arcOf(A: ArcRule, sections: readonly ArcSection[], bars: number): ArcBar[] {
  const plan = (withShort: boolean) => runsOf(A, sections, bars, withShort);
  let p = plan(false);
  if (p.share < A.share[0] && Object.values(A.sections).some((k) => k.short)) { const q = plan(true); if (q.share > p.share) p = q; }
  const { runs, tease } = p;
  const names = Object.keys(A.knobs);
  const teased = Object.fromEntries(names.map((k) => [k, A.knobs[k].tease]));
  const out: ArcBar[] = Array.from({ length: bars }, () => ({ state: 'off' as ArcState, at: 0, run: -1, u: 0, until: 0, knobs: { ...teased } }));
  for (let b = 0; b < tease; b++) { out[b].state = 'tease'; out[b].at = b; out[b].until = tease; }
  runs.forEach((r, n) => {
    const u = runs.length > 1 ? n / (runs.length - 1) : 1;
    const knobs = Object.fromEntries(names.map((k) => [k, A.knobs[k].first + (A.knobs[k].peak - A.knobs[k].first) * u]));
    // the closing bars alone, unless the run runs into a section with the drums out already (a breakdown), or was cut
    // short inside its section (the groove goes on under the cut)
    const into = sections.find((s) => s.startBar === r.from + r.bars)?.kind;
    const brk = !r.cut && r.bars >= A.breakFrom && !(into && A.noBreakInto?.includes(into)) ? A.breakBars : 0;
    const until = r.bars - brk;
    for (let b = r.from; b < r.from + r.bars; b++) {
      const at = b - r.from;
      out[b] = { state: at >= until ? 'break' : 'run', at, run: n, u, until, knobs: { ...knobs } };
    }
  });
  return out;
}

/** The part's share of a theme's bars by the arc (the tease, the runs and their breaks). */
export const arcShare = (arc: readonly ArcBar[]): number => arc.filter((x) => x.state !== 'off').length / Math.max(1, arc.length);
