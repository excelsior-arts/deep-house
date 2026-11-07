// **The top moved by the form** (round tops-bus, 11-02; his word 11-01: *"make our root deep house music more interesting
// and fill in a bit better our lacking high freq domain"*, and on the table of the top end's ideas: *"All T1-12
// improvements are go"*).
//
// Our top end is not short on level (at matched loudness it sits 1.8 to 3.4 dB over the sources' deep house, and his own
// word on the hats is "too pronounced"); it is short on turns. It switches — a level step of 3 dB or more above 6 kHz
// 2.1 times a minute against the sources' 0.9 — where theirs turns. The engine's tops bus (`TOPS_FILTER`, engine
// `master.ts`: a low-pass stage, a high shelf at 8 kHz and a gate on the drums' top lanes alone) lets the form move the
// top without touching a note, and this file writes its moves, each by rule and never by a coin (`riser-by-rules`), off
// the row `recipes/arrangement/tops-bus.json`:
//
//   **the lid** (T06)       inside a main after the first, with the kick running, the top held under the low-pass for
//                           the bars before a phrase line and snapped open on it, once a track. It is one of the house's
//                           own top switches turned (a drop-out on the bar before the line that clears the hats: the
//                           hats resting, the breath, the drop-out), which is then not played (`lidOf`, chosen before
//                           the house's small things play): a switch replaced, never one added.
//   **the step-out** (T11)  at a line where the kick comes back, the top leaves so its return is the event: the bus to
//                           8 kHz for the last half or whole bar, the top gated from step 12 or 14, or dived from 16 to
//                           5 kHz under a riser that is already there. Only where the top is there to step out.
//   **the air** (T12)       over a long main's last 24-32 bars the 8 kHz shelf rises 2.5-5 dB and is back on the line,
//                           from a shelf lowered across the theme so the top's mean never goes up; in a build the top's
//                           low-pass opens from 3-5 kHz to 16, off the melodic bus's own move.
//   **the second drop** (T04) where the lanes' round lays its second drop (`Section.topOpens`), the kick lands on the
//                           line under a dull top and the air opens on the line the lanes' top opens on.
//
// Nothing here knows a genre or a place: a section is read by its kind, the top by its hits, the birds by their numbers.
// Automation only: no die is drawn and no note moves (but the one switch the lid takes back).

import ROW_FILE from '../recipes/arrangement/tops-bus.json' with { type: 'json' };
import { REGISTRY } from '@deep-house/engine/voices';

// --- the row -------------------------------------------------------------------

export interface TopsRow {
  place: { bpm: [number, number] };
  lid: { takes: string[]; bars: number; longBars: number; loomLong: number; hz: [number, number]; snapVeil: number; openS: number };
  stepOut: {
    presentShare: number; everyVeil: number;
    cut: { hz: number; bars: [number, number] };
    gate: { step: [number, number]; fadeS: number };
    dive: { hz: [number, number]; bars: number; longBars: number };
  };
  air: {
    main: { leastBars: number; bars: number; longBars: number; loomLong: number; db: [number, number] };
    build: { hz: [number, number]; openHz: number };
  };
  secondDrop: { hz: [number, number]; openBeats: number };
}

const strip = (o: unknown): unknown => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => k !== 'says').map(([k, v]) => [k, strip(v)])) : o);
export const TOPS_ROW: Readonly<TopsRow> = Object.freeze({
  place: strip(ROW_FILE.place), lid: strip(ROW_FILE.lid), stepOut: strip(ROW_FILE.stepOut),
  air: strip(ROW_FILE.air), secondDrop: strip(ROW_FILE.secondDrop),
} as unknown as TopsRow);

/** The bus's open corner and the crossfade's length, as the melodic bus's sweep stage has them (`sweep.ts`). */
export const OPEN_HZ = 20000;
export const ENGAGE_S = 0.01;

/**
 * **The layers that ride the bus**: the drum voices whose role is a top lane's (the offbeat hats, the sixteenths and
 * the hands), read off the registry — never the kick's, the backbeat's or the glue's.
 */
export const TOP_LAYERS: readonly string[] = Object.freeze([...new Set((REGISTRY as ReadonlyArray<{ bus: string; layer: string; roles?: readonly string[] }>)
  .filter((d) => d.bus === 'drums' && (d.roles ?? []).some((r) => r === 'offbeat' || r === 'sixteenth')).map((d) => d.layer))].sort());

// --- what the rules read -------------------------------------------------------

export interface Sec { kind: string; startBar: number; bars: number; /** the line the second drop's top opens on (top-form's `Section.topOpens`) */ topOpens?: number }
export interface Birds { veil: number; loom: number; zephyr: number }
const by = (x: number, [a, b]: readonly [number, number]) => a + (b - a) * Math.min(1, Math.max(0, x));
const endOf = (s: Sec) => s.startBar + s.bars;

/**
 * Whether a theme takes any move: a tempo in the row's window, and an offbeat hat in the theme. The moves are the
 * hats' air turned by the form; a top of hands or a woodblock alone (the bells' percussion) has no air to lid, and a
 * hatless deep groove stays as dark as it is.
 */
export function topsPlaced(bpm: number, hats: boolean, row: TopsRow = TOPS_ROW): boolean {
  return hats && bpm >= row.place.bpm[0] && bpm <= row.place.bpm[1];
}

// --- the lid: chosen before the house's small things play ------------------------

/** What the lid reads of a house sub-section (`SubSection`): its kind, its bars, and the lanes its figure clears. */
export interface SubLike {
  kind: string; startBar: number; bars: number; label?: string;
  row: { id?: string; applies?: string | null; figure?: { lanes?: Record<string, { clear?: number } | undefined> } | null };
}

/** The lid as chosen: its span, its line, and the switch it takes the place of. */
export interface LidChoice<S extends SubLike = SubLike> { from: number; line: number; takes: S; section: number }

/**
 * **Where the lid goes, and which switch it turns** (T06). A house small thing of a kind the row names (`takes`) on the
 * bar before a line, clearing the closed hats from the bar's first step, inside a main after the theme's first, with
 * the kick on every bar of the span before it: the lid holds the top over the `bars` before that line (Loom's longer
 * span from `loomLong`), after the main's first phrase, and the switch is not played. The longest such main, then the
 * latest line; one a track.
 */
export function lidOf<S extends SubLike>(input: { sections: readonly Sec[]; subs: readonly S[]; kickAt: (bar: number) => boolean; birds: Birds },
  row: TopsRow = TOPS_ROW): LidChoice<S> | null {
  const { sections, subs, kickAt, birds } = input;
  const L = row.lid;
  const first = sections.findIndex((s) => s.kind === 'main');
  // dropped at once (Veil from `snapVeil`), it holds `bars`; lowered (a stiller Veil), Loom's long arc lowers it over `longBars`
  const want = birds.veil < L.snapVeil && birds.loom >= L.loomLong ? L.longBars : L.bars;
  const found: Array<LidChoice<S> & { len: number }> = [];
  for (const s of subs) {
    if (!L.takes.includes(s.kind) || s.row.applies !== s.kind) continue;
    if (s.row.figure?.lanes?.offbeat?.clear !== 0) continue;
    const i = sections.findIndex((x) => s.startBar >= x.startBar && s.startBar < endOf(x));
    const sec = sections[i];
    if (!sec || sec.kind !== 'main' || i === first) continue;
    const line = s.startBar + s.bars;
    if (line > endOf(sec)) continue;
    const from = Math.max(line - want, sec.startBar + 8);
    if (line - from < 2) continue;
    let kicked = true;
    for (let b = from; b < line; b++) if (!kickAt(b)) { kicked = false; break; }
    if (!kicked) continue;
    found.push({ from, line, takes: s, section: i, len: sec.bars });
  }
  found.sort((a, b) => b.len - a.len || b.line - a.line);
  const pick = found[0];
  return pick ? { from: pick.from, line: pick.line, takes: pick.takes, section: pick.section } : null;
}

// --- the moves -----------------------------------------------------------------

export type TopsKind = 'lid' | 'stepOut' | 'air' | 'build' | 'secondDrop';
/** One move on the bus, with the rule's reading of it (refused ones included, which the survey reads). */
export interface TopsMove {
  kind: TopsKind;
  /** the shape: the lid dropped or lowered, the step-out's cut, gate or dive, the air's shelf or the build's opening */
  shape: 'snap' | 'swept' | 'cut' | 'gate' | 'dive' | 'shelf' | 'open' | 'held';
  /** the bar it starts on (fractional where it starts inside a bar), and the line it ends on */
  from: number;
  line: number;
  /** its corner (the low-pass's), or its rise and base (the shelf's), or the gate's step */
  hz?: number;
  db?: number;
  base?: number;
  step?: number;
  laid: boolean;
  why: string;
}

export interface TopsInput {
  sections: readonly Sec[];
  bars: number;
  barSeconds: number;
  beat: number;
  birds: Birds;
  /** the kick sounds in the bar */
  kickAt: (bar: number) => boolean;
  /** the top lanes' hits in the bar */
  topAt: (bar: number) => number;
  /** a riser or a swell sounds into the line */
  risingInto: (line: number) => boolean;
  /** a gesture the arrangement already lands on the line's last bar (a fill, a drop-out, a turn, a bass out) */
  gestureInto: (line: number) => string | null;
  /** where the melodic bus's own sweep into a section starting on this bar ends, in bars (the bar itself where none) */
  sweepEnd: (bar: number) => number;
  /** the lid chosen before the small things played */
  lid: LidChoice | null;
  /** which of the four the style switches on */
  on: { lid: boolean; stepOut: boolean; air: boolean; secondDrop: boolean };
}

/** The lines where the kick comes back after a breakdown or a build: each kick section that follows one. */
export function returnsOf(sections: readonly Sec[]): Array<{ line: number; index: number; after: string }> {
  const out: Array<{ line: number; index: number; after: string }> = [];
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i], p = sections[i - 1];
    if ((s.kind === 'drop' || s.kind === 'main') && (p.kind === 'breakdown' || p.kind === 'build')) out.push({ line: s.startBar, index: i, after: p.kind });
  }
  return out;
}

/**
 * **The second drop's moment** (T04): the kick back on a section's first bar under the thin hat the lanes' round laid
 * (`top-form`), the air opening on the line its top opens on (`Section.topOpens`), so the two halves are one move:
 * the lanes' thin hat and the bus's dull top land together, and the whole top opens on the same downbeat. Once a
 * track, as the lanes' round lays it (round top-end-1; wave 1 read its own moment off the sections and the top's hits,
 * and laid two on Vibe - Deep Dive).
 */
export function secondDropsOf(input: Pick<TopsInput, 'sections'>): Array<{ line: number; open: number; thin: boolean }> {
  return input.sections.filter((s) => typeof s.topOpens === 'number' && s.topOpens > s.startBar)
    .map((s) => ({ line: s.startBar, open: s.topOpens!, thin: true }));
}

/** The theme's groove top: the mean top hits a bar over the mains' bars with the kick. */
export function grooveTop(input: Pick<TopsInput, 'sections' | 'kickAt' | 'topAt'>): number {
  let n = 0, sum = 0;
  for (const s of input.sections) if (s.kind === 'main') for (let b = s.startBar; b < endOf(s); b++) if (input.kickAt(b)) { n++; sum += input.topAt(b); }
  return n ? sum / n : 0;
}

/** Every move the four rules ask for, with the verdicts; the laid ones are what the curves write. */
export function topsMovesOf(input: TopsInput, row: TopsRow = TOPS_ROW): TopsMove[] {
  const { sections, birds, kickAt, topAt, on } = input;
  const out: TopsMove[] = [];
  const groove = grooveTop(input);
  const lpBusy: Array<[number, number]> = [];
  const lpFree = (a: number, b: number) => !lpBusy.some(([x, y]) => a < y && b > x);

  // the lid, as chosen before the small things played
  if (on.lid && input.lid) {
    const L = row.lid, lid = input.lid;
    const shape = birds.veil >= L.snapVeil ? 'snap' : 'swept';
    out.push({ kind: 'lid', shape, from: lid.from, line: lid.line, hz: Math.round(by(birds.zephyr, L.hz)), laid: true,
      why: `takes the place of the house's ${lid.takes.label ?? lid.takes.row.id ?? lid.takes.kind} on ${lid.line - 1}` });
    lpBusy.push([lid.from, lid.line]);
  }

  // the air in a build first: its bars are the build's, and the line it opens into is its own
  const builds = new Set<number>();
  if (on.air) for (const s of sections) {
    if (s.kind !== 'build') continue;
    const line = endOf(s);
    const A = row.air.build;
    let top = 0;
    for (let b = s.startBar; b < line; b++) top += topAt(b);
    const start = Math.min(line - 2, Math.max(s.startBar, input.sweepEnd(s.startBar)));
    const why = top === 0 ? 'none (no top in the build)' : !lpFree(s.startBar, line) ? 'none (another move holds the low-pass)' : 'laid';
    const laid = why === 'laid';
    out.push({ kind: 'build', shape: 'open', from: s.startBar, line, step: start, hz: Math.round(by(birds.zephyr, A.hz)), laid, why });
    if (laid) { lpBusy.push([s.startBar, line]); builds.add(line); }
  }

  // the second drop, where the kick comes back under a thin top: never on a line a build opens the top into, and a
  // phrase of open top kept before any other move on the low-pass after it (shortened to one phrase, else none)
  const drops = secondDropsOf(input);
  const held = new Set<number>();
  if (on.secondDrop) for (const d of drops) {
    const D = row.secondDrop;
    let open = d.open;
    const clear = (o: number) => lpFree(d.line, o + 8);
    if (!clear(open) && open - d.line > 8 && clear(d.line + 8)) open = d.line + 8;
    const why = builds.has(d.line) ? 'none (the build opens the top into this line)' : !d.thin ? 'none (the top is there before the line: the step-out\'s)'
      : open - d.line < 8 ? 'none (no phrase of kick after the line)' : !clear(open) ? 'none (the lid holds the bars after it)' : 'laid';
    const laid = why === 'laid';
    out.push({ kind: 'secondDrop', shape: 'held', from: d.line, line: open, hz: Math.round(by(birds.zephyr, D.hz)), laid, why });
    if (laid) { lpBusy.push([d.line, open]); held.add(d.line); }
  }

  // the step-out, at the lines the second drop does not hold
  if (on.stepOut) {
    const S = row.stepOut;
    const every = birds.veil >= S.everyVeil;
    const cands: TopsMove[] = [];
    for (const r of returnsOf(sections)) {
      const line = r.line;
      const before = (topAt(line - 1) + topAt(line - 2)) / 2;
      // the seam steps out already: its last bar drops the kick the bar before had, or half its top
      const steps = (kickAt(line - 2) && !kickAt(line - 1)) || topAt(line - 1) < 0.5 * topAt(line - 2);
      const rising = input.risingInto(line);
      const shape: TopsMove['shape'] = builds.has(line) || (r.after === 'build' && !rising) ? 'gate' : rising ? 'dive' : 'cut';
      const gesture = input.gestureInto(line);
      const why = held.has(line) ? 'none (the second drop holds this line)' : before < S.presentShare * groove ? 'none (the top is thin before the line)'
        : steps ? 'none (the seam steps out already)' : gesture ? `none (the line has its gesture already: ${gesture})` : 'laid';
      cands.push({ kind: 'stepOut', shape, from: line, line, laid: why === 'laid', why });
    }
    // Veil: every line from `everyVeil`, under it the track's last
    const laid = cands.filter((m) => m.laid);
    if (!every) for (const m of laid.slice(0, -1)) { m.laid = false; m.why = 'none (a still Veil keeps the last line\'s)'; }
    let prev: TopsMove['shape'] | null = null;
    for (const m of cands) {
      if (!m.laid) { out.push(m); continue; }
      if (m.shape === prev && m.shape !== 'dive') m.shape = m.shape === 'cut' ? 'gate' : 'cut';
      if (m.shape === 'cut') { const c = S.cut.bars[every ? 1 : 0]; m.from = m.line - c; m.hz = S.cut.hz; }
      else if (m.shape === 'gate') { m.step = S.gate.step[every ? 1 : 0]; m.from = m.line - 1 + m.step / 16; }
      else { const d = birds.loom >= row.lid.loomLong ? S.dive.longBars : S.dive.bars; m.from = m.line - d; m.hz = S.dive.hz[1]; }
      if (m.shape !== 'gate' && !lpFree(m.from, m.line)) { m.laid = false; m.why = 'none (another move holds the low-pass)'; out.push(m); continue; }
      if (m.shape !== 'gate') lpBusy.push([m.from, m.line]);
      prev = m.shape;
      out.push(m);
    }
  }

  // the air over a long main's last bars: the track's last long main the lid does not hold
  if (on.air) {
    const A = row.air.main;
    const lidSec = input.lid && on.lid ? input.lid.section : -1;
    const mains = sections.map((s, i) => ({ s, i })).filter(({ s, i }) => s.kind === 'main' && s.bars >= A.leastBars && i !== lidSec);
    const pick = mains[mains.length - 1];
    if (pick) {
      const s = pick.s, line = endOf(s);
      const n = birds.loom >= A.loomLong && s.bars >= A.longBars + 8 ? A.longBars : A.bars;
      // after the main's first phrase, and after a second drop held over its start
      const heldTo = Math.max(0, ...out.filter((m) => m.kind === 'secondDrop' && m.laid && m.from >= s.startBar && m.from < line).map((m) => m.line));
      const from = Math.max(line - n, s.startBar + 8, heldTo);
      const rise = +by(birds.zephyr, A.db).toFixed(2);
      if (line - from >= 8) {
        // the base under it: the top's mean power, weighted by where the top plays, at or under its own
        let w = 0, wr = 0;
        for (let b = 0; b < input.bars; b++) {
          const x = topAt(b);
          const r = b >= from && b < line ? rise * (b - from + 0.5) / (line - from) : 0;
          w += x; wr += x * 10 ** (r / 10);
        }
        const base = w > 0 ? Math.floor(-10 * Math.log10(wr / w) * 10) / 10 : 0;
        out.push({ kind: 'air', shape: 'shelf', from, line, db: rise, base, laid: true, why: `the shelf from ${base} dB, up ${rise} dB over ${line - from} bars` });
      } else out.push({ kind: 'air', shape: 'shelf', from, line, laid: false, why: 'none (no 8 bars free before the line)' });
    }
  }
  return out.sort((a, b) => a.from - b.from || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

// --- the curves ----------------------------------------------------------------

interface Pt { t: number; value: number }
/** The bus's lines in theme seconds, a stage absent where nothing moves it (`PlanAutomation.tops`). */
export interface TopsCurves { lp: { cutoff: Pt[]; wet: Pt[] } | null; shelf: Pt[] | null; gate: Pt[] | null }

const r6 = (x: number) => +x.toFixed(6);

/**
 * The laid moves as the bus's automation. The low-pass is a sweep stage: engaged at its open corner, its corner moved,
 * let go once open again, so it is the bus to the sample between its moves (each move's points in theme seconds). The
 * shelf is one line in dB; the gate one line of gain.
 */
export function topsCurves(moves: readonly TopsMove[], input: Pick<TopsInput, 'barSeconds' | 'beat'>, row: TopsRow = TOPS_ROW): TopsCurves | null {
  const bs = input.barSeconds, B = input.beat, E = ENGAGE_S, O = row.lid.openS;
  const laid = moves.filter((m) => m.laid);
  // each low-pass move: when it is engaged and let go, and its corner's points between
  const lpMoves = laid.filter((m) => m.kind !== 'air' && !(m.kind === 'stepOut' && m.shape === 'gate')).map((m) => {
    const a = m.from * bs, L = m.line * bs, hz = m.hz!;
    if (m.kind === 'lid') {
      // dropped over its first beat and held; or lowered across the span, at its corner by the line's last beat
      const shut = m.shape === 'snap' ? a + B : L - B;
      return { on: a, off: L + E, pts: [{ t: a, value: OPEN_HZ }, { t: shut, value: hz }, { t: L - O, value: hz }, { t: L, value: OPEN_HZ }] };
    }
    if (m.kind === 'stepOut' && m.shape === 'cut') return { on: a - E, off: L + E, pts: [{ t: a - E, value: OPEN_HZ }, { t: a, value: hz }, { t: L - O, value: hz }, { t: L, value: OPEN_HZ }] };
    if (m.kind === 'stepOut') return { on: a, off: L + E, pts: [{ t: a, value: OPEN_HZ }, { t: L - O, value: hz }, { t: L, value: OPEN_HZ }] };
    if (m.kind === 'build') {
      const hold = m.step! * bs, open = row.air.build.openHz;
      return { on: a, off: L + E, pts: [{ t: a - E, value: hz }, ...(hold > a ? [{ t: hold, value: hz }] : []), { t: L - O, value: open }, { t: L, value: OPEN_HZ }] };
    }
    // the second drop: engaged at its corner on the line, opened over its beats on the phrase line
    const D = row.secondDrop.openBeats * B;
    return { on: a, off: L + D + E, pts: [{ t: a - E, value: hz }, { t: L, value: hz }, { t: L + D, value: OPEN_HZ }] };
  }).sort((x, y) => x.on - y.on);
  let lp: TopsCurves['lp'] = null;
  if (lpMoves.length) {
    const cutoff: Pt[] = [{ t: 0, value: OPEN_HZ }], wet: Pt[] = [{ t: 0, value: 0 }];
    for (const m of lpMoves) {
      // parked until the move: the corner walks to its first value while the wet is at nought, then the move's own
      // points, then open again before it is let go
      cutoff.push({ t: r6(Math.max(0, m.on - E)), value: m.pts[0].value }, ...m.pts.map((p) => ({ t: r6(p.t), value: p.value })), { t: r6(m.off), value: OPEN_HZ });
      wet.push({ t: r6(Math.max(0, m.on - E)), value: 0 }, { t: r6(m.on), value: 1 }, { t: r6(m.off - E), value: 1 }, { t: r6(m.off), value: 0 });
    }
    lp = { cutoff: monotone(cutoff), wet: monotone(wet) };
  }
  // the shelf: its base across the theme, the rise over its bars, back on the line
  const air = laid.find((m) => m.kind === 'air');
  const shelf: Pt[] | null = air ? [{ t: 0, value: air.base! }, { t: r6(air.from * bs), value: air.base! },
    { t: r6(air.line * bs - O), value: r6(air.base! + air.db!) }, { t: r6(air.line * bs), value: air.base! }] : null;
  // the gate: the top out from its step, back on the downbeat
  const gates = laid.filter((m) => m.kind === 'stepOut' && m.shape === 'gate');
  let gate: Pt[] | null = null;
  if (gates.length) {
    const F = row.stepOut.gate.fadeS;
    gate = [{ t: 0, value: 1 }];
    for (const m of gates) {
      const a = m.from * bs, L = m.line * bs;
      gate.push({ t: r6(a), value: 1 }, { t: r6(a + F), value: 0 }, { t: r6(L - 0.005), value: 0 }, { t: r6(L), value: 1 });
    }
  }
  return lp || shelf || gate ? { lp, shelf, gate } : null;
}

/** A line's points in time order, a later point at an earlier instant dropped (a move's points never step back). */
function monotone(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && p.t < out[out.length - 1].t) continue;
    out.push(p);
  }
  return out;
}
