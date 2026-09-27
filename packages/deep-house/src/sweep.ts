// **A filter on the melodic bus, moved by the section** — house-v2's `busSweeps`
// switch, round S2 of the composer (Eugene, 09-25: *"not sure if we have
// high-pass and low-pass filters as an ongoing track insert effect; it seems one
// of those low-hanging fruits that can bring a more dynamic nature to some
// tracks"*). What there was: the stage's `hpRise` and `lpClose`, multipliers on
// each note's own filter, so a held chord only takes the move at its next note;
// and the macro filter, which closes the drums and the melodic bus together
// through a breakdown. What this adds is the kitchen filter's core on the
// melodic bus itself (`SWEEP_FILTER`, engine `master.ts`: its biquad and its
// resonance, not its drive, which measured as a level change on what it swept),
// a high-pass and a low-pass stage, engaged by a crossfade at an open corner and
// swept over bars — so a chord held across the move moves with it.
//
// Three moves, each by rule and never by a coin (`riser-by-rules`), each through
// the same four gates round S1 wrote (`src/swell.ts`):
//
//   **entry**   a high-pass opening down into a section: the section arrives
//               thin, its corner at `ENTRY_HZ`, and fills out to open over the
//               span. At a line into a groove, a breakdown or a build — never a
//               drop, never the kick's return (a drop is meant to hit), and
//               never where round S1 already swells a held layer in on the same
//               line (the swell is that entrance).
//   **exit**    a low-pass closing into a breakdown: the corner falls to
//               `EXIT_HZ` over the section's last bars and lets go on the
//               breakdown's downbeat. Only into a breakdown: out of a theme is
//               the seam's own low-pass (`set-plan.ts`), and two low-passes
//               closing on one theme at once is what the seam rule forbids.
//   **breath**  a slow low-pass under a long passage with no kick and a held
//               layer: down to `BREATH_HZ` and back, once, across the middle
//               of a section of `BREATH_MIN` bars or more. The slow side only —
//               a steady four has its groove to move it.
//
// The gates:
//
//   **The spell** is S1's `spellVerdict`: a driving or fast kick, or a broken
//     beat, takes no sweep at all; the slow side's spans are eight bars (the
//     breath sixteen), a steady four's two into a section and four out of one;
//     Loom in `loops` halves, Veil `shifting` doubles a steady four's.
//   **The cast** (the voices the dice drew, per layer on the bus): a high-pass
//     is for a layer with a body under the corner — a held one; a line whose
//     melodic layers are all struck takes none. A low-pass closing on a bright
//     struck keys (a pluck, a bell: struck, its corner at `BRIGHT_HZ` or over)
//     dulls its attack and not its colour, so a bus with one in front takes no
//     low-pass. Both read `TIMBRES` and the note's articulation.
//   **The section** as above; and a bus with nothing on it in the span has
//     nothing to sweep.
//   **The seam.** The deck's own filters move at a seam — the arriving theme's
//     high-pass in its first bars, the outgoing one's low-pass in its last — so
//     no sweep is laid in a theme's first `SEAM_IN_BARS` or past the seam's
//     floor, the last quarter (`style.set.seamFloor`). The two never stack.
//   **One at a time.** Two moves that would overlap on the bus keep the first.
//
// No die is drawn, no note moves, and the plan's golden section does not see
// it: the moves are automation, which the lock leaves to the program's digest.

import { TIMBRES } from '@deep-house/engine/voices';
import type { Lane, Style } from '@deep-house/engine/style';
import type { Spell } from './spell.ts';
import { spellVerdict, HARMONIC_ROLES, HELD_AT_BAR } from './swell.ts';
import type { SwellEntry } from './swell.ts';
import type { Arrangement } from './arrangement.ts';

/** Where the high-pass stands when a section arrives thin, by the spell's side. */
export const ENTRY_HZ = { slow: 500, steady: 350 } as const;
/** Where the low-pass closes to on the way into a breakdown. */
export const EXIT_HZ = { slow: 600, steady: 1000 } as const;
/** Where a breath takes the low-pass to, and back from. */
export const BREATH_HZ = 1800;
/** The shortest section a breath is laid under, and its length. */
export const BREATH_MIN = 24;
/** Bars at a theme's start a seam may still be blending over. */
export const SEAM_IN_BARS = 16;
/** A struck timbre this bright is a pluck or a bell: no low-pass closes on it. */
export const BRIGHT_HZ = 3000;
/** The parked corners, the crossfade's length in seconds, and a release's length in bars. */
export const OPEN = { lp: 20000, hp: 30 } as const;
export const ENGAGE_S = 0.1;
export const RELEASE_BARS = 0.25;

/** One sweep, and what the gates made of it. */
export interface SweepMove {
  kind: 'entry' | 'exit' | 'breath';
  stage: 'hp' | 'lp';
  /** the bar it starts on, and how many bars it runs */
  bar: number;
  bars: number;
  /** the section line it belongs to */
  line: number;
  section: string;
  /** the corner it goes to */
  hz: number;
  spell: string;
  cast: string;
  sectionVerdict: string;
  /** whether all the gates let it through */
  laid: boolean;
}

/** What `sweepsOf` reads of a plan: S1's input, and the swells S1 laid. */
export interface SweepInput {
  style: Style;
  spell: Partial<Spell> | null | undefined;
  barSeconds: number;
  bars: number;
  arrangement: Arrangement;
  timeline: Array<{ layers: string[] }>;
  events: Array<{ t: number; bar?: number | null; layer: string; voice: string; articulation?: string; role?: string; p: Record<string, any> }>;
  lanes: readonly Lane[];
  swells: readonly SwellEntry[];
}

/**
 * Every move the three rules ask for in a plan, with the gates' verdicts —
 * refused ones included, which is what the survey and the checks read.
 */
export function sweepsOf(input: SweepInput): SweepMove[] {
  const { style, spell, bars, arrangement, timeline, events, lanes, swells } = input;
  const sv = spellVerdict(spell, style);
  const kickGate = lanes.find((l) => l.role === 'kick')?.gate ?? null;
  const tuned = new Set(lanes.filter((l) => l.gate && HARMONIC_ROLES.includes(l.role)).map((l) => l.gate!));
  const sustained = new Set(lanes.filter((l) => l.role === 'sustained' && l.gate).map((l) => l.gate!));
  const floor = Math.floor(bars * style.set.seamFloor);
  const slow = sv.side === 'slow';
  const spans = sv.side === 'step' ? { entry: 0, exit: 0, breath: 0 }
    : { entry: sv.span, exit: slow ? sv.span : Math.min(8, sv.span * 2), breath: slow ? sv.span * 2 : 0 };

  // What is on the bus in a span of bars: each melodic layer's notes, read for
  // whether they hold and whether they are a bright struck keys.
  const castOf = (from: number, to: number) => {
    const notes = events.filter((e) => e.role !== 'texture' && e.bar != null && e.bar >= from && e.bar < to && tuned.has(e.layer));
    const facts = (e: (typeof notes)[number]) => TIMBRES[e.p.timbre ?? e.voice] ?? TIMBRES[e.voice];
    const held = notes.some((e) => e.articulation !== 'struck' && (sustained.has(e.layer) || (!!facts(e) && !facts(e)!.struck && facts(e)!.hold >= HELD_AT_BAR)));
    const bright = [...new Set(notes.filter((e) => {
      const f = facts(e);
      return (e.articulation === 'struck' || (!!f && f.struck)) && !!f && f.brightnessHz >= BRIGHT_HZ;
    }).map((e) => e.p.timbre ?? e.voice))];
    return { any: notes.length > 0, held, bright };
  };
  const heardAt = (bar: number) => timeline[bar]?.layers ?? [];

  const out: SweepMove[] = [];
  const sections = arrangement.sections;
  sections.forEach((s, i) => {
    const line = s.startBar;
    const next = sections[i + 1];
    // entry: a high-pass opening down into this section.
    if (line > 0) {
      const span = Math.min(spans.entry, s.bars);
      const kickBack = !!kickGate && !heardAt(line - 1).includes(kickGate) && heardAt(line).includes(kickGate);
      const swelled = swells.some((w) => w.span > 0 && w.bar === line);
      const c = castOf(line, line + Math.max(1, span));
      const sectionVerdict = s.kind === 'drop' ? 'none (a drop)' : kickBack ? 'none (the kick returns)'
        : swelled ? 'none (S1 swells this entrance)' : s.kind === 'outro' ? 'none (an outro is the seam\'s)' : 'sweep';
      const cast = !c.any ? 'none (nothing on the bus)' : !c.held ? 'none (every layer struck)' : 'sweep';
      out.push(move('entry', 'hp', line, span, line, s.kind, slow ? ENTRY_HZ.slow : ENTRY_HZ.steady, sectionVerdict, cast));
    }
    // exit: a low-pass closing into the breakdown that follows.
    if (next && next.kind === 'breakdown') {
      const span = Math.min(spans.exit, Math.floor(s.bars / 2));
      const from = next.startBar - span;
      const c = castOf(from, next.startBar);
      const cast = !c.any ? 'none (nothing on the bus)' : c.bright.length ? `none (a bright struck ${c.bright.join(', ')})` : 'sweep';
      out.push(move('exit', 'lp', from, span, next.startBar, s.kind, slow ? EXIT_HZ.slow : EXIT_HZ.steady, 'sweep', cast));
    }
    // breath: a slow low-pass under a long passage with no kick and a held layer.
    if (s.bars >= BREATH_MIN && spans.breath && ['main', 'breakdown'].includes(s.kind)) {
      const span = Math.min(spans.breath, s.bars - 8);
      const from = s.startBar + Math.floor((s.bars - span) / 2 / 4) * 4;
      const kick = !!kickGate && Array.from({ length: span }, (_, k) => heardAt(from + k)).some((l) => l.includes(kickGate));
      const c = castOf(from, from + span);
      const sectionVerdict = kick ? 'none (a kick under it)' : 'sweep';
      const cast = !c.held ? 'none (nothing held)' : c.bright.length ? `none (a bright struck ${c.bright.join(', ')})` : 'sweep';
      out.push(move('breath', 'lp', from, span, s.startBar, s.kind, BREATH_HZ, sectionVerdict, cast));
    }
  });

  function move(kind: SweepMove['kind'], stage: SweepMove['stage'], bar: number, span: number, line: number, section: string, hz: number, sectionVerdict: string, cast: string): SweepMove {
    const spellSays = sv.side === 'step' ? `none (${sv.why})` : span < 1 ? 'none (no span)' : sv.why;
    const seam = bar < SEAM_IN_BARS ? 'none (the arriving seam)' : bar + span > floor ? 'none (the seam\'s floor)' : null;
    const sec = seam ?? sectionVerdict;
    const laid = sv.side !== 'step' && span >= 1 && sec === 'sweep' && cast === 'sweep';
    return { kind, stage, bar, bars: span, line, section, hz, spell: spellSays, cast, sectionVerdict: sec, laid };
  }

  // One at a time on the bus: a move that would overlap one already laid keeps out.
  out.sort((a, b) => a.bar - b.bar || a.kind.localeCompare(b.kind));
  let busyTo = -1;
  for (const m of out) {
    if (!m.laid) continue;
    const end = m.bar + m.bars + (m.kind === 'exit' ? RELEASE_BARS : 0);
    if (m.bar < busyTo) { m.laid = false; m.sectionVerdict = 'none (another sweep is on the bus)'; continue; }
    busyTo = end;
  }
  return out;
}

/** A point on a plan's curve, in theme seconds. */
interface Pt { t: number; value: number }

/** One stage's two lines: its corner and its engagement. */
export interface SweepStageCurves { cutoff: Pt[]; wet: Pt[] }
/** The bus sweep's lines, a stage absent where no move is laid on it. */
export interface BusSweepCurves { hp: SweepStageCurves | null; lp: SweepStageCurves | null }

/**
 * The laid moves as the plan's automation: one corner line and one engagement
 * line per stage, in theme seconds. Parked between moves — the corner open and
 * the wet at nought — so a stage is the bus to the sample outside its moves.
 * `null` where no move is laid, which is what keeps a theme without one from
 * building the stage at all.
 */
export function sweepCurves(moves: readonly SweepMove[], barSeconds: number): BusSweepCurves {
  const curves = (stage: 'hp' | 'lp') => {
    const laid = moves.filter((m) => m.laid && m.stage === stage);
    if (!laid.length) return null;
    const open = OPEN[stage];
    const cutoff: Pt[] = [{ t: 0, value: open }];
    const wet: Pt[] = [{ t: 0, value: 0 }];
    for (const m of laid) {
      const a = m.bar * barSeconds;
      const b = (m.bar + m.bars) * barSeconds;
      if (m.kind === 'entry') {
        // In at the line, already thin: the crossfade and the corner's rise
        // land together on the downbeat, and the corner opens down over the span.
        wet.push({ t: a - ENGAGE_S, value: 0 }, { t: a, value: 1 }, { t: b, value: 1 }, { t: b + ENGAGE_S, value: 0 });
        cutoff.push({ t: a - ENGAGE_S, value: open }, { t: a, value: m.hz }, { t: b, value: open });
      } else if (m.kind === 'exit') {
        // Engaged open, closed over the span onto the breakdown's line, and let
        // go over a quarter of a bar on its downbeat.
        const r = b + RELEASE_BARS * barSeconds;
        wet.push({ t: a, value: 0 }, { t: a + ENGAGE_S, value: 1 }, { t: r, value: 1 }, { t: r + ENGAGE_S, value: 0 });
        cutoff.push({ t: a + ENGAGE_S, value: open }, { t: b, value: m.hz }, { t: r, value: open });
      } else {
        // Down and back, half the span each way.
        const mid = (a + b) / 2;
        wet.push({ t: a, value: 0 }, { t: a + ENGAGE_S, value: 1 }, { t: b, value: 1 }, { t: b + ENGAGE_S, value: 0 });
        cutoff.push({ t: a + ENGAGE_S, value: open }, { t: mid, value: m.hz }, { t: b, value: open });
      }
    }
    return { cutoff, wet };
  };
  return { hp: curves('hp'), lp: curves('lp') };
}

// --- the glue's curves --------------------------------------------------------
//
// **A noise at a section line fades in by a curve and never cuts** — house-v2's
// `glueFades`, round S2 (Eugene, 09-25, of 21323 theme 1's breakdown under the
// ambient spell: *"that noise/wind segue sounds trashy — it should come in and
// out more smoothly"*). It was the glue's falling sweep (`sweepDown`, placed by
// the lead-ins at a breakdown's first bar): white noise under a resonant
// low-pass falling from 9 kHz, at full level 10 ms after the downbeat — above
// 3 kHz 25 to 40 dB over everything else on a quiet ambient line for its first
// two and a half seconds. The same cut is in the swell's end (30 ms to
// silence) and the riser's (80 ms).
//
// The rules read the spell and the cast, as the swells and the sweeps do:
//
//   **The spell's side** (S1's `spellVerdict`). A driving, fast or broken beat
//     keeps the glue as it is: its cuts are edges and the kick is the grid.
//     A steady four softens the edges by an eighth (`beat / 2`): the rise and
//     the fall. The slow side softens them by a beat: the sweep is full on the
//     line's second beat, the swell and the riser breathe out over a beat —
//     and the sweep starts an octave lower (`SLOW_TOP_HZ`), since 9 kHz of
//     noise is the brightest thing a drone passage ever hears.
//   **The cast.** On the slow side, a line with no percussion playing on it is
//     sparse, and the glue comes down `SPARSE_DB` there: over a bass and a
//     pad the full level was the loudest thing in the room's top octave by a
//     margin nothing else in the theme has. Where drums play the level stays.
//   **The voice.** What a glue voice lets a note write is its own table
//     (`GLUE_SHAPES`, engine `voices/fx.ts`): the sweep's rise and its top,
//     the swell's and the riser's fall; the impact, a sine, takes nothing.
//
// No die, no time moves: the notes the lead-ins placed are where they were.

/** Where a falling noise starts on the slow side, an octave under the voice's own 9 kHz. */
export const SLOW_TOP_HZ = 4500;
/** How far the glue comes down on a sparse slow line. */
export const SPARSE_DB = -6;

/** One glue note, and what the rule wrote on it. */
export interface GlueFade {
  bar: number;
  voice: string;
  side: string;
  sparse: boolean;
  attack?: number;
  release?: number;
  top?: number;
  levelDb: number;
}

/** The glue curves a plan's glue notes take, and the notes written with them. */
export function glueFadesOf(
  input: Pick<SweepInput, 'style' | 'spell' | 'barSeconds' | 'timeline' | 'events' | 'lanes'> & { beat: number },
  shapes: Readonly<Record<string, { attack?: true; release?: true; top?: true }>>,
  apply = false,
): GlueFade[] {
  const { style, spell, barSeconds, timeline, events, lanes, beat } = input;
  const sv = spellVerdict(spell, style);
  const out: GlueFade[] = [];
  if (sv.side === 'step') return out;
  const drums = new Set(lanes.filter((l) => l.gate && ['kick', 'offbeat', 'sixteenth', 'backbeat'].includes(l.role)).map((l) => l.gate!));
  const edge = sv.side === 'slow' ? beat : beat / 2;
  for (const e of events) {
    const shape = shapes[e.voice];
    if (e.layer !== 'fx' || !shape) continue;
    const bar = e.bar ?? Math.floor(e.t / barSeconds);
    const sparse = sv.side === 'slow' && !(timeline[bar]?.layers ?? []).some((l) => drums.has(l));
    const f: GlueFade = { bar, voice: e.voice, side: sv.side, sparse, levelDb: sparse ? SPARSE_DB : 0 };
    if (shape.attack) f.attack = edge;
    if (shape.release) f.release = edge;
    if (shape.top && sv.side === 'slow') f.top = SLOW_TOP_HZ;
    out.push(f);
    if (!apply) continue;
    const p: Record<string, any> = { ...e.p };
    if (f.attack != null) p.attack = f.attack;
    if (f.release != null) p.release = f.release;
    if (f.top != null) p.top = f.top;
    if (f.levelDb) p.gain = (p.gain ?? 1) * Math.pow(10, f.levelDb / 20);
    e.p = p;
  }
  return out;
}
