// **A sustained layer that enters a passage without one swells in** — house-v2's
// `swellIn` switch, round S1 of the composer (Eugene, 09-25, on the benchmark's
// third theme: *"the pad kicks in hard at 16:00 ... bass + vibes only are fairly
// quiet, and then the pads come in and it feels like double the volume. The
// dynamic is fine generally, but too coarse"*). Measured there: bars 198-199
// sound at -15.0 LUFS and bars 200-201, where five notes of wave pad arrive on
// one downbeat, at -11.2 — a step of 3.8 dB inside one note-on.
//
// The rule is by rules and never by a coin (`riser-by-rules`): three gates, each
// of which may refuse, and a span and a depth that follow from what they read.
// A move a gate refuses leaves the notes exactly as the plan wrote them.
//
//   **The entrance.** A layer whose drawn voice holds (its lane's role is
//     `sustained`, or the timbre it drew is not struck and is still half there
//     at the bar line) enters at a bar after `ABSENT_BARS` bars — a phrase — in
//     which nothing of it sounded. Bar nought is the theme's own entrance and
//     the seam's business, not this.
//   **The section** keeps a drop's hit. A line where the section is a drop, or
//     where the kick comes back after a bar without it, is a step: a drop is
//     meant to hit (the brief's own words), and the lead-ins already lead it.
//     And a line where nothing heard before it goes on under the entrance is a
//     hand-over, and a step too: the held layer takes the place of what
//     stopped, so the level is already continuous and a swell would be a hole
//     (measured: five such entrances under the ambient spell dipped 11 to 19
//     dB when they swelled).
//   **The spell** (the birds' combination, read by the words the ring shows):
//     Ember's family — the drums off or the pulse free is the slow side and
//     takes the long swell; a steady four takes the short one; a driving or a
//     fast kick takes a step. Spark in its `broken` band takes a step (a broken
//     beat is all edges). Loom in its `loops` band halves the span (a loop's
//     entrance is its point). Veil in its `shifting` band doubles a steady
//     four's span, the side the riser already reads as haze.
//   **The cast** (the instrument the dice drew): a voice whose own envelope
//     already swells needs less of one. Its entrance — the attack its own table
//     states, `entranceOf` — is set against the span: at half the span or more
//     the voice swells by itself and the step stays; under it the depth is
//     scaled by what is left, `1 - 2 x attack / span`.
//   **The contrast**, the riser's measure turned on the bed: what the entrance
//     gains over everything heard on the line — the entering layers over the
//     layers the timeline lists at the line. At a half or more the pad is a
//     large share of what is heard and takes the full span and the full depth;
//     under a half it takes half the span and a shallower start. A line that
//     also loses a layer (a turnover: the benchmark's bass leaves on the bar
//     the pad arrives) already steps down by what leaves, and starts at
//     `DEPTH_DB.turnover`, -6 dB, at any contrast: whether such a line jumps
//     at all is decided downstream of the plan (the master limiter, the sends'
//     returns), and no plan-time estimate tried predicts it (round S1's note),
//     so a turnover's swell is shallow enough that a line which did not jump
//     dips by about 2 dB and one that did still softens.
//
// The span is in bars, a power of two between one and eight, so a swell that
// starts on a section's line lands on a phrase line: eight bars (or four) on the
// slow side, two (or one) on a steady four. It never runs past the layer's own
// run or its section's end. The depth is where it starts, in decibels under the
// written level, and the tone opens with it: `OPEN_OCT` octaves darker at the
// full depth, in proportion below it — the way a real pad opens.
//
// What it writes is one field on each note it reaches, `p.swell`: where on the
// one line the note starts and how long is left until it lands. The engine's
// insert (`@deep-house/engine/voices/treat.ts`) walks each note's gain and
// corner along that line, so an entrance of four held chords is one swell and
// not four. No note moves, no die is drawn, and the golden plan — which names
// times, pitches, lengths and velocities — does not see it; the program does.

import { entranceOf, TIMBRES } from '@deep-house/engine/voices';
import type { Lane, Style } from '@deep-house/engine/style';
import { derive, asSpell } from './spell.ts';
import type { Spell } from './spell.ts';
import { bandAt } from './bird-labels.ts';
import type { Arrangement } from './arrangement.ts';

/** A phrase without the layer is what makes its return an entrance. */
export const ABSENT_BARS = 8;
/** The spans, in bars, by the spell's side: the full one and the half. */
export const SPAN = { slow: 8, steady: 2 } as const;
/** Where a swell starts, in decibels under the written level: full contrast, and under a half. */
export const DEPTH_DB = { full: -24, half: -10, turnover: -6 } as const;
/** How much darker a swell at the full depth starts, in octaves. */
export const OPEN_OCT = 1.5;
/** The lane roles whose layers may hold: the chord's, the figure's and the tune's. */
export const HARMONIC_ROLES: readonly string[] = ['sustained', 'figure', 'melody'];
/** A timbre still this much there at the bar line holds rather than strikes. */
export const HELD_AT_BAR = 0.5;

/** The spell's reading, as the note's table says it. */
export interface SpellVerdict {
  /** slow, steady, or step (with the reason) */
  side: 'slow' | 'steady' | 'step';
  why: string;
  /** the span the spell grants at full contrast, in bars */
  span: number;
}

/** One entrance of a held layer, and what the three gates made of it. */
export interface SwellEntry {
  layer: string;
  bar: number;
  voice: string;
  timbre: string | null;
  section: string;
  /** bars the layer was silent before it */
  absent: number;
  /** the entering layers over the layers heard on the line */
  contrast: number;
  spell: SpellVerdict;
  /** the section's verdict: `swell`, or `step (drop)` / `step (kick returns)` */
  sectionVerdict: string;
  /** the cast's verdict: `swell`, `less (x0.62)`, `none (own attack 0.85 s)` */
  castVerdict: string;
  /** bars, where it swells; 0 where it steps */
  span: number;
  /** decibels under the written level the swell starts at */
  depthDb: number;
  oct: number;
}

/** What `swellsOf` reads of a plan: all of it the plan's own, plus the spell it was cast under. */
export interface SwellInput {
  style: Style;
  spell: Partial<Spell> | null | undefined;
  barSeconds: number;
  bars: number;
  arrangement: Arrangement;
  timeline: Array<{ layers: string[] }>;
  events: Array<{ t: number; bar?: number | null; layer: string; voice: string; articulation?: string; role?: string; p: Record<string, any> }>;
  lanes: readonly Lane[];
}

/**
 * A bird's band word, or null where the style has no bands to read — a style
 * whose composition does not name the families the labels' thresholds are
 * solved against (a check's hand-built style) reads no band and so no bias.
 */
function wordOf(bird: 'spark' | 'loom' | 'veil', spell: Partial<Spell> | null | undefined, style: Style): string | null {
  try { return bandAt(bird, spell, style)?.word ?? null; } catch { return null; }
}

/** The spell's side, read off the words the ring shows for it. */
export function spellVerdict(spell: Partial<Spell> | null | undefined, style: Style): SpellVerdict {
  const d = derive(asSpell(spell));
  if (d.drumsOn && (d.tempoFamily === 'techno' || d.tempoFamily === 'drumAndBass'))
    return { side: 'step', why: `Ember: ${d.tempoFamily === 'techno' ? 'a driving' : 'a fast'} kick`, span: 0 };
  const spark = wordOf('spark', spell, style);
  if (spark === 'broken') return { side: 'step', why: 'Spark: a broken beat', span: 0 };
  const slow = !d.drumsOn || d.tempoFamily === 'unmetered';
  let span: number = slow ? SPAN.slow : SPAN.steady;
  const why = [slow ? `Ember: ${d.drumsOn ? 'a free pulse' : 'no drums'}` : 'Ember: a steady four'];
  const loom = wordOf('loom', spell, style);
  if (loom === 'loops') { span /= 2; why.push('Loom: loops, half'); }
  const veil = wordOf('veil', spell, style);
  if (!slow && veil === 'shifting') { span *= 2; why.push('Veil: shifting, double'); }
  return { side: slow ? 'slow' : 'steady', why: why.join('; '), span };
}

/**
 * Every entrance of a held layer in a plan, with the three gates' verdicts and
 * the swell each gets — refused ones included, which is what the survey and the
 * checks read. `swellsOf(...).filter((e) => e.span > 0)` is what is applied.
 */
export function swellsOf(input: SwellInput): SwellEntry[] {
  const { style, spell, barSeconds, bars, arrangement, timeline, events, lanes } = input;
  const sv = spellVerdict(spell, style);
  const kickGate = lanes.find((l) => l.role === 'kick')?.gate ?? null;
  // The layers a sustained role plays on, and every other gated layer whose
  // drawn voice turns out to hold: asked of the notes, since the dice drew them.
  const sustainedGates = new Set(lanes.filter((l) => l.role === 'sustained' && l.gate).map((l) => l.gate!));
  // Only the layers the harmony and the tune are played on: the glue lanes'
  // beds and sweeps are moments of their own and the drums never hold.
  const tuned = new Set(lanes.filter((l) => l.gate && HARMONIC_ROLES.includes(l.role)).map((l) => l.gate!));
  const byLayer = new Map<string, typeof events>();
  for (const e of events) {
    if (e.role === 'texture' || e.bar == null || !tuned.has(e.layer)) continue;
    if (!byLayer.has(e.layer)) byLayer.set(e.layer, []);
    byLayer.get(e.layer)!.push(e);
  }
  const holds = (e: (typeof events)[number]): boolean => {
    if (e.articulation === 'struck') return false;
    if (sustainedGates.has(e.layer)) return true;
    const facts = TIMBRES[e.p.timbre ?? e.voice] ?? TIMBRES[e.voice];
    return !!facts && !facts.struck && facts.hold >= HELD_AT_BAR;
  };
  const out: SwellEntry[] = [];
  for (const [layer, list] of byLayer) {
    // Which bars the layer sounds in: a note covers the bars it is held over.
    const sounding: boolean[] = new Array(bars).fill(false);
    for (const e of list) {
      const from = Math.max(0, Math.floor(e.t / barSeconds + 1e-6));
      const to = Math.min(bars, Math.ceil((e.t + Math.max(0, e.p.dur ?? 0)) / barSeconds - 1e-6));
      for (let b = from; b < Math.max(from + 1, to); b++) if (b < bars) sounding[b] = true;
    }
    for (let bar = ABSENT_BARS; bar < bars; bar++) {
      if (!sounding[bar]) continue;
      let absent = 0;
      while (absent < bar && !sounding[bar - 1 - absent]) absent++;
      if (absent < ABSENT_BARS) continue;
      const first = list.filter((e) => e.bar === bar);
      if (!first.length || !first.some(holds)) continue;
      const lead = first.find(holds)!;
      const section = sectionAt(arrangement, bar);
      // The contrast: what enters, over what is heard on the line.
      const heard = timeline[bar]?.layers ?? [];
      const entering = heard.filter((l) => l === layer || enteringHeld(byLayer, l, bar, barSeconds, holds));
      const contrast = Math.min(1, Math.max(1, entering.length) / Math.max(1, heard.length));
      // The section.
      const drop = section.kind === 'drop';
      const kickBack = !!kickGate && bar > 0 && !(timeline[bar - 1]?.layers ?? []).includes(kickGate) && heard.includes(kickGate);
      // What the entrance is laid over: the layers heard on both sides of the
      // line. Nothing kept is a hand-over — the held layer takes the place of
      // what stopped, the level is already continuous, and a swell there would
      // be a hole. Something lost on the same line is a turnover: the line
      // already steps down by what leaves, so the swell starts shallower.
      const before = timeline[bar - 1]?.layers ?? [];
      const kept = heard.filter((l) => before.includes(l) && !entering.includes(l));
      const lost = before.filter((l) => !heard.includes(l));
      const sectionVerdict = drop ? 'step (a drop)' : kickBack ? 'step (the kick returns)'
        : !kept.length ? 'step (a hand-over: nothing continues under it)' : 'swell';
      // The spell and the contrast set the span; the layer's run and its
      // section's end bound it; a power of two keeps it landing on a line.
      let span = sv.span * (contrast >= 0.5 ? 1 : 0.5);
      let run = 0;
      while (bar + run < bars && sounding[bar + run]) run++;
      span = Math.min(span, run, section.startBar + section.bars - bar);
      span = span >= 1 ? Math.pow(2, Math.floor(Math.log2(span))) : 0;
      let depthDb: number = lost.length ? DEPTH_DB.turnover : contrast >= 0.5 ? DEPTH_DB.full : DEPTH_DB.half;
      // The cast: the drawn voice's own entrance against the span.
      const attack = entranceOf(lead.voice, lead.p);
      const seconds = span * barSeconds;
      let castVerdict = 'swell';
      if (span > 0 && attack >= seconds / 2) { castVerdict = `none (own attack ${attack.toFixed(2)} s)`; }
      else if (span > 0 && attack > 0.05) {
        const k = 1 - (2 * attack) / seconds;
        depthDb *= k;
        castVerdict = `less (x${k.toFixed(2)}, own attack ${attack.toFixed(2)} s)`;
      }
      const swells = sv.side !== 'step' && sectionVerdict === 'swell' && span > 0 && !castVerdict.startsWith('none');
      out.push({
        layer, bar, voice: lead.voice, timbre: lead.p.timbre ?? null, section: section.kind, absent, contrast,
        spell: sv, sectionVerdict, castVerdict,
        span: swells ? span : 0,
        depthDb: swells ? depthDb : 0,
        oct: swells ? (OPEN_OCT * depthDb) / DEPTH_DB.full : 0,
      });
    }
  }
  return out.sort((a, b) => a.bar - b.bar || a.layer.localeCompare(b.layer));
}

/**
 * The swells applied: each note of an entering layer that starts inside its
 * span is handed its place on the one line — how far under, how dark, and how
 * long until the line lands. A new parameter object for each note it reaches,
 * and the same one for every other note.
 */
export function applySwells<E extends { t: number; layer: string; role?: string; p: Record<string, any> }>(
  events: E[], entries: readonly SwellEntry[], barSeconds: number,
): void {
  for (const s of entries) {
    if (!(s.span > 0)) continue;
    const t0 = s.bar * barSeconds;
    const t1 = (s.bar + s.span) * barSeconds;
    for (const e of events) {
      if (e.layer !== s.layer || e.role === 'texture' || e.t < t0 - 1e-6 || e.t >= t1 - 1e-6) continue;
      const u = (e.t - t0) / (t1 - t0);
      e.p = { ...e.p, swell: { db: s.depthDb * (1 - u), oct: s.oct * (1 - u), over: t1 - e.t } };
    }
  }
}

function sectionAt(arrangement: Arrangement, bar: number) {
  for (const s of arrangement.sections) if (bar >= s.startBar && bar < s.startBar + s.bars) return s;
  return arrangement.sections[arrangement.sections.length - 1];
}

// Whether another layer enters with this one: it holds, and it was silent the
// phrase before. Two held layers arriving on one line are one entrance's share.
function enteringHeld(
  byLayer: Map<string, SwellInput['events']>, layer: string, bar: number, barSeconds: number,
  holds: (e: SwellInput['events'][number]) => boolean,
): boolean {
  const list = byLayer.get(layer);
  if (!list) return false;
  const lo = (bar - ABSENT_BARS) * barSeconds;
  const at = bar * barSeconds;
  if (list.some((e) => e.t < at - 1e-6 && e.t + (e.p.dur ?? 0) > lo + 1e-6)) return false;
  return list.some((e) => e.bar === bar && holds(e));
}
