// **A minute that doesn't move** (round long-main; his ear 11-04 on Drive - Cloudburst's next theme: *"essentially the
// same minimalistic development going on for 1 minute straight, with some fluctuation through our drum work"*; on the
// sketches: the half-break *"is a lot better"*, the harmony's departures and the bass's walk out — a long main in these
// genres is answered by form, not by new chords).
//
// The reading: bar by bar, each part above the drums (a lane's voice: the bass, the bed, the front, a texture; the kit
// and the one-shot FX are the drums' and never count) has a state — out, held, or the pitch classes it strikes with its
// register (the bass by its pitch classes only: its octave flips are its fluctuation, not a figure). A bar changes where
// some part's state was not heard in the eight bars before (a loop up to a phrase long repeats; a figure coming back
// after a phrase away is news), or where a filter arc or a riser two bars long starts. A **static run** is the stretch
// between two changes, 32 bars or 45 seconds or longer (the row's numbers), in a beat-led theme: the kick through it,
// at `leastBpm` or over. The slow places keep their stillness.
//
// **The answer: a half-break** (the row, `recipes/arrangement/long-main.json`). Where a run stands still in a main or a
// drop, and the theme's die lets it (Loom, the hypnotic hold, keeps about one run in two still at its top), eight bars
// at the phrase line nearest the run's middle become a half-break — the grammar's breakdown, a phrase long: the kick and
// the bass out, the bed exposed, the riser back in, the groove returning with the crash. The theme keeps its length: the
// eight bars come out of the main. Where the stretch left after it is still a run's length, a second move: the build
// into the drop where the main leads into one, else a second half-break. Never more than three.
//
// **Nothing after it moves** (`spliceSplits`): the theme is planned as it is, then again with the split in its form,
// and only the bars the split changes (its way in, the half-break, the crash on the return) are taken from the second
// plan; every other bar, its notes, its curves and its drawn moments, is the first plan's, so what comes after plays as
// before (a section added to the form would otherwise re-draw every small thing counted by the section after it).
// Nothing here names a place, a genre or a seed.
import ROW_FILE from '../recipes/arrangement/long-main.json' with { type: 'json' };
import Rng from './rng.ts';
import { leaned } from './lean.ts';
import type { Arrangement, Section } from './arrangement.ts';

type W<T> = Array<{ v: T; w: number }>;
export interface LongMainRow {
  leastBpm: number; leastBars: number; leastSeconds: number; window: number; chance: number;
  leans: Record<string, unknown>;
  form: { half: number; build: W<number>; kinds: Record<'half' | 'build', number>; near: number; lead: number };
}
export const LONG_MAIN = ROW_FILE as unknown as LongMainRow;

// --- the reading -----------------------------------------------------------------------------------------------------

interface Ev { layer: string; voice: string; t: number; bar?: number; step?: number; p: Record<string, unknown> }
const DRUM_LAYERS = new Set(['kick', 'hats', 'clap', 'shaker', 'sixteenths', 'perc', 'percussion', 'congas']);
const ARC_FX = new Set(['riser', 'sweepUp', 'sweepDown', 'reverse', 'noiseRiser', 'uplifter', 'downlifter']);

/** A part's name: its lane and its voice (a timbre or a preset beside it where the note names one). */
export const partOf = (e: Ev): string => {
  const n = (e.p.timbre ?? e.p.preset) as string | undefined;
  return `${e.layer}:${e.voice}${n && n !== e.voice ? '/' + n : ''}`;
};

export interface StaticReading {
  /** each part's state a bar ('' out, 'held', or `on<pitch classes>[/o<octave>]`), the filter's and the arcs' too */
  parts: Map<string, string[]>;
  /** the bars where something above the drums changed, and what */
  changes: number[];
  why: Record<number, string[]>;
}

/** Each part's state a bar, and where some state is new against the last `window` bars. */
export function readStatic(events: readonly Ev[], bars: number, barSeconds: number, macroFilter: ReadonlyArray<{ t: number; value: number }> = [], window = LONG_MAIN.window): StaticReading {
  const bs = barSeconds;
  const parts = new Map<string, string[]>();
  const part = (k: string) => { let a = parts.get(k); if (!a) { a = Array(bars).fill(''); parts.set(k, a); } return a; };
  const onsets = new Map<string, number[][]>();
  for (const e of events) {
    const b0 = Math.floor(e.t / bs + 1e-6);
    if (b0 < 0 || b0 >= bars) continue;
    const dur = Number(e.p.dur ?? 0);
    if (e.layer === 'fx') {
      if (ARC_FX.has(e.voice) && dur >= 2 * bs - 1e-3) { const a = part(`fx:${e.voice}`); for (let b = b0; b < Math.min(bars, b0 + Math.ceil(dur / bs)); b++) a[b] = `arc${b - b0}`; }
      continue;
    }
    if (DRUM_LAYERS.has(e.layer)) continue;
    const name = partOf(e);
    const a = part(name);
    const ms = [e.p.midi, ...((e.p.notes as unknown[]) ?? [])].filter((m): m is number => typeof m === 'number');
    let on = onsets.get(name); if (!on) { on = Array.from({ length: bars }, () => []); onsets.set(name, on); }
    on[b0].push(...(ms.length ? ms : [-1]));
    // held: the bars it sounds into by its own length (the last quarter of a bar is its tail, not the part playing)
    const end = Math.min(bars, Math.floor((e.t + dur) / bs - 0.25 + 1e-6) + 1);
    for (let b = b0 + 1; b < end; b++) if (!a[b]) a[b] = 'held';
  }
  for (const [name, on] of onsets) {
    const a = part(name), bass = name.startsWith('bass:') || name.startsWith('sub:');
    for (let b = 0; b < bars; b++) {
      const ms = on[b]; if (!ms.length) continue;
      const real = ms.filter((m) => m >= 0).sort((x, y) => x - y);
      const pcs = [...new Set(real.map((m) => ((Math.round(m) % 12) + 12) % 12))].sort((x, y) => x - y).join('.');
      a[b] = `on${pcs}${bass || !real.length ? '' : `/o${Math.floor(real[real.length >> 1] / 12)}`}`;
    }
  }
  // the filter: a move of a quarter or more across the bar is an arc bar
  const at = (t: number) => { let v = macroFilter.length ? macroFilter[0].value : 15000; for (const p of macroFilter) { if (p.t <= t + 1e-6) v = p.value; else break; } return v; };
  const filt = part('filter');
  for (let b = 0; b < bars; b++) { const x = at(b * bs), z = at((b + 1) * bs - 1e-3); if (x > 0 && z > 0 && Math.abs(Math.log(z / x)) > Math.log(1.25)) filt[b] = `arc${b}`; }
  const why: Record<number, string[]> = {};
  const changes: number[] = [];
  for (let b = 0; b < bars; b++) {
    const w: string[] = [];
    for (const [name, a] of parts) {
      const s = a[b];
      // an arc counts where it starts: its bars after are the same move
      if (name === 'filter' || name.startsWith('fx:')) { if (s && (s === 'arc0' || !(b > 0 && a[b - 1]))) w.push(name === 'filter' ? 'filter arc' : name); continue; }
      // a held note goes on from the bar before: its continuation, never news
      if (s === 'held' && b > 0 && a[b - 1]) continue;
      let seen = b === 0 ? !s : false;
      for (let k = 1; k <= window && b - k >= 0 && !seen; k++) if (a[b - k] === s) seen = true;
      if (!seen) w.push(`${name} ${s || 'out'}`);
    }
    if (w.length) { changes.push(b); why[b] = w; }
  }
  return { parts, changes, why };
}

export interface StaticRun { from: number; to: number; bars: number; seconds: number; kind: string; section: number; kinds: string[];
  /** the parts sounding through a third of it or more */
  parts: string[]; beatLed: boolean }

interface PlanLike { bars: number; barSeconds: number; bpm: number; events: readonly Ev[]; automation?: { macroFilter?: ReadonlyArray<{ t: number; value: number }> };
  arrangement: { sections: ReadonlyArray<{ kind: string; startBar: number; bars: number; index?: number }> } }

/** The runs of a plan that stand still: 32 bars or 45 s with no change above the drums (the row's numbers). */
export function staticRuns(track: PlanLike, row: LongMainRow = LONG_MAIN): StaticRun[] {
  const { bars, barSeconds: bs } = track;
  const R = readStatic(track.events, bars, bs, track.automation?.macroFilter ?? [], row.window);
  const secs = track.arrangement.sections;
  const secAt = (b: number) => Math.max(0, secs.findIndex((s) => b >= s.startBar && b < s.startBar + s.bars));
  const kicks = new Set<number>();
  for (const e of track.events) if (e.layer === 'kick') kicks.add(Math.floor(e.t / bs + 1e-6));
  const marks = [...R.changes, bars];
  const out: StaticRun[] = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const from = marks[i], to = marks[i + 1], n = to - from;
    if (n < row.leastBars && n * bs < row.leastSeconds) continue;
    const count: Record<number, number> = {};
    for (let b = from; b < to; b++) count[secAt(b)] = (count[secAt(b)] ?? 0) + 1;
    const section = Number(Object.entries(count).sort((x, y) => y[1] - x[1])[0][0]);
    let kicked = 0; for (let b = from; b < to; b++) if (kicks.has(b)) kicked++;
    const names = [...R.parts.entries()].filter(([nm, a]) => nm !== 'filter' && !nm.startsWith('fx:') && a.slice(from, to).filter(Boolean).length >= n / 3).map(([nm]) => nm);
    out.push({ from, to, bars: n, seconds: +(n * bs).toFixed(1), kind: secs[section]?.kind ?? '?', section, kinds: [...new Set(Object.keys(count).map((k) => secs[+k]?.kind ?? '?'))],
      parts: names, beatLed: track.bpm >= row.leastBpm && kicked * 2 >= n });
  }
  return out;
}

// --- the answer, drawn ---------------------------------------------------------------------------------------------

export interface LongMainHint {
  /** the runs it read (the first plan's), for the readout */
  runs: Array<{ from: number; to: number; kind: string }>;
  /** a section split at a bar: a half-break of `bars` there, or its last `bars` a build; or (round dark-fronts, the tenth
   * pass) a break in two around a groove passage (`pieces`: the first piece, the passage, the second piece, in bars;
   * `groove` the passage's kind; `bars` their sum; `grow` the bars the theme grows by where the break's own are too few:
   * everything after it plays as it was, later) */
  splits: Array<{ section: number; at: number; bars: number; kind: 'half' | 'build' | 'passage' | 'pay'; pieces?: [number, number, number]; groove?: string; grow?: number;
    /** `pay` (round trance-drawn, the third and fourth passes: a release pays for its wait; the intro a whole phrase; the outro
     * no longer than the groove before it): the section at `section` (none at -1) gives `give` bars to the section at `drop`
     * (none at -1), the sections between moved by them, and the taker grows by `grow` besides (the theme that much longer;
     * negative, a giver with no taker: the theme that much shorter); `at` is the window's first bar in the first plan's
     * numbering and `bars` its length in the second's (the growth inside it) */
    give?: number; drop?: number }>;
  said: string[];
  /** what another planner drew on the first plan, handed to the second so it draws nothing again (`src/dark-fronts.ts`) */
  darkFronts?: unknown;
  /** and what the corner's first plan shed under the phone's ceiling (`src/trance-drawn.ts`), so the second sheds the same */
  tranceDrawn?: { shed?: string[] };
}

/** The bars the first plan's bar `b` stands at in the second: the growth of every passage split that ends before it. */
export const grownBy = (splits: LongMainHint['splits'], b: number): number =>
  splits.reduce((a, sp) => a + ((sp.kind === 'passage' || sp.kind === 'pay') && sp.grow && b >= sp.at + sp.bars - sp.grow ? sp.grow : 0), 0);

interface HintPlan extends PlanLike { seed: unknown }

/** The phrase lines of a section from `from` on (its first bar and every eight after). */
const linesOf = (s: { startBar: number; bars: number }, from: number, to: number) => {
  const out: number[] = [];
  for (let b = s.startBar; b < s.startBar + s.bars; b += 8) if (b >= from && b < to) out.push(b);
  return out;
};

/** Where the plan's static runs split, drawn by the theme's own die and Loom; null where none does. */
export function longMainHint(track: HintPlan, spell: Readonly<Record<string, number>>, row: LongMainRow = LONG_MAIN): LongMainHint | null {
  const runs = staticRuns(track, row).filter((r) => r.beatLed);
  if (!runs.length) return null;
  const hint: LongMainHint = { runs: runs.map((r) => ({ from: r.from, to: r.to, kind: r.kind })), splits: [], said: [] };
  const secs = track.arrangement.sections;
  const bs = track.barSeconds;
  const still = (from: number, to: number) => to - from >= row.leastBars || (to - from) * bs >= row.leastSeconds;
  for (const run of runs) {
    const die = new Rng(`${String(track.seed)}::long-main:${run.from}`);
    const p = Math.min(1, leaned(row.chance, 'develop', row.leans as never, spell));
    if (!die.chance(p)) { hint.said.push(`${run.from}-${run.to}: kept still (Loom, ${p.toFixed(2)})`); continue; }
    const sec = secs[run.section];
    if (sec.kind !== 'main' && sec.kind !== 'drop') { hint.said.push(`${run.from}-${run.to}: a ${sec.kind}, left as it is`); continue; }
    const secEnd = sec.startBar + sec.bars;
    const end = Math.min(run.to, secEnd);
    // **The stretches still standing**, each answered in turn: the run as read first (even where a section line cuts
    // it), then each side a split leaves while it is still a run's length (never more than three moves a run)
    const queue: Array<[number, number]> = [[run.from, end]];
    for (let move = 0; move < 3 && queue.length; move++) {
      const k = queue.findIndex(([a, b], i) => (move === 0 && i === 0) || still(a, b));
      if (k < 0) break;
      const [from, to] = queue.splice(k, 1)[0];
      const kinds: W<'half' | 'build'> = [];
      const after = secs[run.section + 1];
      const built = hint.splits.some((x) => x.section === run.section && x.kind === 'build');
      const builds = row.form.build.filter((x) => secEnd - x.v >= Math.max(from + 8, sec.startBar + 16));
      // the build into the drop: a second move only, on the stretch that runs into a drop
      if (move > 0 && !built && to >= secEnd - 1 && after?.kind === 'drop' && sec.kind === 'main' && builds.length) kinds.push({ v: 'build', w: row.form.kinds.build });
      // the half-break: a phrase of the section before it (give or take half a phrase where the stretch starts off the
      // line) and a phrase of it after; where it can, one that leaves neither side still, drawn among the lines nearest
      // the stretch's middle
      const halves = linesOf(sec, Math.max(from + 4, sec.startBar + 8), to).filter((l) => l + row.form.half + 8 <= secEnd);
      if (halves.length) kinds.push({ v: 'half', w: row.form.kinds.half });
      if (!kinds.length) { if (!move) hint.said.push(`${run.from}-${run.to}: no room for a half-break`); break; }
      const kind = die.weighted(kinds);
      if (kind === 'build') {
        const n = die.weighted(builds);
        hint.splits.push({ section: run.section, at: secEnd - n, bars: n, kind });
        if (secEnd - n > from) queue.push([from, secEnd - n]);
        continue;
      }
      const mid = (from + to) / 2, H = row.form.half;
      const clear = halves.filter((l) => !still(from, l) && !still(l + H, to));
      const pool = clear.length ? clear : halves;
      const best = Math.min(...pool.map((l) => Math.abs(l + H / 2 - mid)));
      const near = pool.filter((l) => Math.abs(l + H / 2 - mid) <= best + row.form.near);
      const at = near.length > 1 ? die.pick(near) : near[0];
      hint.splits.push({ section: run.section, at, bars: H, kind });
      queue.push([from, at], [at + H, to]);
    }
  }
  return hint.splits.length ? hint : null;
}

// --- the answer, played: the form ----------------------------------------------------------------------------------

/**
 * **The form tightens** : each split section in two around a half-break (the grammar's breakdown, a phrase
 * long), or its last bars a build; every other section as it was, its harmonic roll kept where its place moved.
 */
export function splitArrangement(arrangement: Arrangement, splits: LongMainHint['splits'], made: (kind: string, bars: number) => Section | null): Arrangement {
  if (!splits.length) return arrangement;
  const out: Section[] = [];
  // (`by`: the bars every section and phrase after a grown break moves by, in the second plan's numbering)
  let by = 0;
  const shift = (s: Section, startBar: number, keep: (p: Section['phrases'][number]) => boolean, bars: number, moved = 0): Section => {
    const kept = s.phrases.filter(keep);
    // (a piece that starts off the phrase line and holds no phrase start of its own — the bars after a half-break
    // drawn half a phrase off the line — keeps the phrase it starts inside, from its first bar: a section always has
    // a phrase, which `layersAtBar` reads; the dub key's 14/1 threw here)
    const from = startBar - moved;
    const own = kept.length ? kept : s.phrases.filter((p) => p.startBar <= from).slice(-1).map((p) => ({ ...p, startBar: from }));
    const phrases = own.map((p, j) => ({ ...p, startBar: p.startBar + moved, indexInSection: j }));
    return { ...s, startBar, bars, phrases, roll: s.roll ?? s.index };
  };
  const placed = (x: Section, startBar: number): Section => ({ ...x, startBar, phrases: x.phrases.map((p) => ({ ...p, startBar: p.startBar - x.startBar + startBar })) });
  // (`pay`, round trance-drawn: a section gives bars to another, or one grows or shrinks on its own)
  const pays = splits.filter((x) => x.kind === 'pay');
  for (const s of arrangement.sections) {
    const sps = splits.filter((x) => x.section === s.index && x.kind !== 'pay').sort((x, y) => x.at - y.at);
    // **A section gives, a section takes** (round trance-drawn, the third and fourth passes: a release pays for its wait,
    // the intro a whole phrase, the outro no longer than the groove before it): the giver keeps its first bars (its own
    // phrases), the taker is laid again that much longer (its own roll), and every section between or after moves by it
    const giving = pays.filter((x) => x.section === s.index && (x.give ?? 0) > 0).reduce((a, x) => a + (x.give ?? 0), 0);
    const taking = pays.filter((x) => x.drop === s.index).reduce((a, x) => a + (x.give ?? 0) + (x.grow ?? 0), 0);
    const shrink = pays.filter((x) => x.section === s.index && (x.grow ?? 0) < 0 && (x.drop ?? -1) < 0).reduce((a, x) => a - (x.grow ?? 0), 0);
    if (giving + shrink > 0 && !taking) {
      const keep = s.bars - giving - shrink;
      out.push(shift(s, s.startBar + by, (p) => p.startBar >= s.startBar && p.startBar < s.startBar + keep, keep, by));
      by -= giving + shrink;
      continue;
    }
    if (taking > 0) {
      const longer = made(s.kind, s.bars + taking);
      if (longer) { out.push({ ...placed(longer, s.startBar + by), roll: s.roll ?? s.index }); by += taking; continue; }
    }
    const passage = sps.find((x) => x.kind === 'passage' && x.pieces);
    if (passage) {
      // **A break in two around a groove passage** (round dark-fronts): the break's own first bars, a groove the grammar
      // makes, the break's own last bars (its phrases moved by the growth), and every section after moved by it
      const [b1, pb, b2] = passage.pieces!, grow = passage.grow ?? 0, a = s.startBar + by;
      const groove = made(passage.groove ?? 'drop', pb);
      if (groove) {
        // (the passage plays the harmonic roll of the groove the break interrupted, so it is that groove come back)
        const before = [...arrangement.sections].reverse().find((x) => x.startBar < s.startBar && (x.kind === 'drop' || x.kind === 'main'));
        out.push(shift(s, a, (p) => p.startBar >= s.startBar && p.startBar < s.startBar + b1, b1, by));
        out.push({ ...placed(groove, a + b1), ...(before ? { roll: before.roll ?? before.index } : {}) });
        const c = s.startBar + s.bars - b2;
        out.push(shift(s, a + b1 + pb, (p) => p.startBar >= c, b2, by + grow));
        by += grow;
        continue;
      }
    }
    const pieces = sps.filter((x) => x.kind !== 'passage').map((sp) => ({ sp, piece: made(sp.kind === 'half' ? 'breakdown' : 'build', sp.bars) })).filter((x) => x.piece);
    if (!pieces.length) { out.push(shift(s, s.startBar + by, () => true, s.bars, by)); continue; }
    let cursor = s.startBar;
    const end = s.startBar + s.bars;
    for (const { sp, piece } of pieces) {
      if (sp.at > cursor) { const a0 = cursor; out.push(shift(s, a0 + by, (p) => p.startBar >= a0 && p.startBar < sp.at, sp.at - a0, by)); }
      out.push({ ...placed(piece!, sp.at + by), ...(sp.kind === 'half' ? { half: true as const } : {}) });
      cursor = sp.at + sp.bars;
    }
    if (cursor < end) { const c0 = cursor; out.push(shift(s, c0 + by, (p) => p.startBar >= c0, end - c0, by)); }
  }
  out.forEach((s, i) => { s.index = i; if (s.roll === i) delete s.roll; });
  return { ...arrangement, sections: out, bars: arrangement.bars + by, ...(typeof arrangement.phrases === 'number' ? { phrases: Math.round((arrangement.bars + by) / 8) } : {}) };
}


// --- the answer, played: nothing after it moves --------------------------------------------------------------------

interface SpliceEv { layer: string; voice: string; t: number; bar?: number; step?: number; p: Record<string, unknown> }
interface SplicePlan {
  bars: number; barSeconds: number; events: SpliceEv[];
  automation?: Record<string, unknown>;
  timeline?: unknown[];
  arrangement: Arrangement;
  moments?: Array<{ from: number; to: number }>;
}

/** A bar's notes as the ear has them: each event's lane, voice, place, pitch, length and level. */
const barKey = (events: readonly SpliceEv[], bs: number, b: number) => events.filter((e) => Math.floor(e.t / bs + 1e-6) === b)
  .map((e) => `${e.layer}|${e.voice}|${e.t.toFixed(4)}|${JSON.stringify(e.p)}`).sort().join('\n');

/**
 * **The split, spliced into the plan as it was.** `today` is the theme as planned; `split` the same theme planned with
 * the hint's splits in its form. Each split's window is taken from `split` — from its way in (the bars before it where
 * the second plan already leads into it, at most the row's `lead`) to its end, and the one-shot strokes on the return's
 * line — and everything else stays `today`'s: the notes (a note of the first plan held into a window takes the second
 * plan's length where the second plan has it), every automation curve, the timeline's bars and the drawn moments. The
 * form is the split's. Returns the bars taken.
 */
export function spliceSplits<T extends SplicePlan>(today: T, split: SplicePlan, hint: LongMainHint, row: LongMainRow = LONG_MAIN): Array<[number, number]> {
  const bs = today.barSeconds;
  // **The theme grows** where a passage split asks it (round dark-fronts): the first plan's bars from a grown break's end
  // move later by its growth, every note, curve, drawn moment and phrase among them, so what comes after plays as it
  // was, later; the grown bars themselves are the window's, the second plan's
  // (and shrinks, round trance-drawn's fourth pass: an outro cut to a phrase; the bars after it are none, the length less)
  const grows = hint.splits.filter((sp) => (sp.kind === 'passage' || sp.kind === 'pay') && (sp.grow ?? 0) !== 0).sort((a, b) => b.at - a.at);
  for (const sp of grows) {
    const from = (sp.at + sp.bars - sp.grow!) * bs, dt = sp.grow! * bs, n = sp.grow!;
    if (n < 0) {
      const cut = (sp.at + sp.bars) * bs;
      today.events = today.events.filter((e) => e.t < cut - 1e-6);
      if (Array.isArray(today.timeline)) today.timeline.splice(sp.at + sp.bars, -n);
      const T = today as T & { bars: number; duration?: number };
      T.bars += n;
      if (typeof T.duration === 'number') T.duration += dt;
      continue;
    }
    // (what moves is rebuilt, never shifted in place: the plan before the split, `unsplit`, shares these objects and is
    // what the trim and the clip were planned on; trance-drawn's fourth pass, the trim's own check caught it)
    today.events = today.events.map((e) => (e.t >= from - 1e-6 ? { ...e, t: e.t + dt, ...(typeof e.bar === 'number' ? { bar: e.bar + n } : {}) } : e));
    const walk = (x: unknown): unknown => {
      if (Array.isArray(x)) return x.length && x.every((p) => p && typeof p === 'object' && typeof (p as { t?: unknown }).t === 'number')
        ? (x as Array<{ t: number }>).map((p) => (p.t >= from - 1e-6 ? { ...p, t: p.t + dt } : p)) : x.map(walk);
      if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
      return x;
    };
    today.automation = walk(today.automation) as Record<string, unknown> | undefined;
    if (Array.isArray(today.timeline) && Array.isArray(split.timeline)) { const b0 = sp.at + sp.bars - n; today.timeline.splice(b0, 0, ...split.timeline.slice(b0, b0 + n)); for (let b = b0 + n; b < today.timeline.length; b++) { const x = today.timeline[b] as { bar?: number; t?: number }; if (x && typeof x === 'object') today.timeline[b] = { ...x, ...(typeof x.bar === 'number' ? { bar: x.bar + n } : {}), ...(typeof x.t === 'number' ? { t: x.t + dt } : {}) }; } }
    if (today.moments) { const b0 = sp.at + sp.bars - n; today.moments = today.moments.map((m) => (m.from >= b0 ? { ...m, from: m.from + n, to: m.to + n } : m.to > b0 ? { ...m, to: m.to + n } : m)); }
    const T = today as T & { bars: number; duration?: number; phraseMap?: unknown; phrasing?: unknown };
    T.bars += n;
    if (typeof T.duration === 'number') T.duration += dt;
    const S = split as SplicePlan & { phraseMap?: unknown; phrasing?: unknown };
    if (S.phraseMap) T.phraseMap = S.phraseMap;
    if (S.phrasing) T.phrasing = S.phrasing;
  }
  const windows: Array<[number, number]> = [];
  for (const sp of hint.splits) {
    const moved = grownBy(hint.splits, sp.at);
    const w1 = sp.at + moved + sp.bars;
    let w0 = sp.at + moved;
    while (w0 > sp.at - row.form.lead && w0 > 0 && barKey(today.events, bs, w0 - 1) !== barKey(split.events, bs, w0 - 1)) w0--;
    windows.push([w0, w1]);
  }
  const inside = (t: number) => windows.some(([a, b]) => t >= a * bs - 1e-6 && t < b * bs - 1e-6);
  const returnStroke = (t: number) => windows.some(([, b]) => t >= b * bs - 1e-6 && t < (b + 1) * bs - 1e-6);
  // (the same note: its lane, voice, time, pitch, and whether it is a line's ride copy laid beside it)
  const same = (a: SpliceEv, b: SpliceEv) => a.layer === b.layer && a.voice === b.voice && Math.abs(a.t - b.t) < 1e-6 && a.p.midi === b.p.midi && a.p.ride === b.p.ride;
  const kept = today.events.filter((e) => !inside(e.t) && !(e.layer === 'fx' && returnStroke(e.t))).map((e) => {
    const end = e.t + Number(e.p.dur ?? 0);
    if (!(typeof e.p.dur === 'number' && windows.some(([a]) => e.t < a * bs && end > a * bs + 1e-6))) return e;
    const twin = split.events.find((x) => same(x, e));
    return twin && twin.p.dur !== e.p.dur ? { ...e, p: { ...e.p, dur: twin.p.dur } } : e;
  });
  const taken = split.events.filter((e) => inside(e.t) || (e.layer === 'fx' && returnStroke(e.t)));
  today.events = [...kept, ...taken].sort((x, y) => x.t - y.t);
  // every curve: the first plan's outside the windows, the second's inside; each held to its own value up to a window's
  // edge and moved there in a few hundredths of a second (a linear curve would otherwise lean across the bars before)
  const EDGE = 0.04;
  const A = today.automation ?? {}, B = split.automation ?? {};
  type Pt = { t: number } & Record<string, unknown>;
  const valueAt = (list: Pt[], t: number): Pt | null => {
    if (!list.length) return null;
    let i = 0; while (i < list.length && list[i].t <= t + 1e-9) i++;
    const lo = list[Math.max(0, i - 1)], hi = list[Math.min(list.length - 1, i)];
    if (i === 0 || i === list.length || hi.t - lo.t < 1e-9) return { ...(i === 0 ? hi : lo), t };
    const f = (t - lo.t) / (hi.t - lo.t);
    const out: Pt = { ...lo, t };
    for (const k of Object.keys(lo)) if (k !== 't' && typeof lo[k] === 'number' && typeof hi[k] === 'number') out[k] = +((lo[k] as number) + ((hi[k] as number) - (lo[k] as number)) * f).toFixed(5);
    return out;
  };
  for (const k of Object.keys(A)) {
    const a = A[k], b = B[k];
    if (!Array.isArray(a) || !Array.isArray(b) || !a.every((x) => typeof (x as { t?: unknown }).t === 'number')) continue;
    const pts = a as Pt[], bp = b as Pt[];
    let out: Pt[] = pts.filter((x) => !windows.some(([w0, w1]) => x.t >= w0 * bs - EDGE && x.t <= w1 * bs + 1e-9));
    for (const [w0, w1] of windows) {
      const t0 = w0 * bs, t1 = w1 * bs;
      const add = [valueAt(pts, t0 - EDGE), valueAt(bp, t0), ...bp.filter((x) => x.t > t0 + 1e-9 && x.t < t1 - EDGE), valueAt(bp, t1 - EDGE), valueAt(pts, t1)];
      out = [...out, ...(add.filter(Boolean) as Pt[])];
    }
    (A as Record<string, unknown>)[k] = out.sort((x, y) => x.t - y.t);
  }
  if (Array.isArray(today.timeline) && Array.isArray(split.timeline)) for (const [w0, w1] of windows) for (let b = w0; b < w1; b++) today.timeline[b] = split.timeline[b];
  // A drawn moment is kept where its notes are (round dark-fronts, the eleventh pass: a switch-up of the first plan that
  // ran into a window kept its notes up to the window's edge and lost its mark, so the ring read a straight line over a
  // beat that moved): the first plan's outside the windows, a span that runs into one cut at its edge, and the second
  // plan's inside them, cut at the edges the same way; a stroke at a line is where it is.
  if (today.moments && split.moments) {
    type M = (typeof today.moments)[number];
    const touching = (m: M) => windows.find(([a, b]) => m.from < b && m.to >= a) ?? null;
    const kept: M[] = [];
    for (const m of today.moments) {
      const w = touching(m);
      if (!w) { kept.push(m); continue; }
      if (m.from < w[0] && Math.min(m.to, w[0]) > m.from) kept.push({ ...m, to: Math.min(m.to, w[0]) });
      if (m.to > w[1] && Math.max(m.from, w[1]) < m.to) kept.push({ ...m, from: Math.max(m.from, w[1]) });
    }
    for (const m of split.moments) {
      const w = touching(m);
      if (!w) continue;
      const from = Math.max(m.from, w[0]), to = Math.min(m.to, w[1]);
      if (to > from || (m.to === m.from && m.from >= w[0] && m.from < w[1])) kept.push(from === m.from && to === m.to ? m : { ...m, from, to });
    }
    today.moments = kept.sort((x, y) => x.from - y.from);
  }
  today.arrangement = split.arrangement;
  return windows;
}
