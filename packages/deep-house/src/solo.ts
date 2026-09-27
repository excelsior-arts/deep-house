// Round S3 of the composer: two rules for the sparse passages of a calm theme,
// where the bass and one quiet layer are all there is (Eugene, 09-25, of the
// benchmark: *"19 minutes of smooth ambient with cool segments of bass and
// whistle only"*).
//
// ## The whistle comes up a little (house-v2's `sparseTexture`)
//
// The whistle is the texture part: one soft note of a near-sine FM bell every
// eight bars, sent wholly into the immersed space (7.5 s, diffuse), so what is
// heard is the cloud of a sine breathing out over five seconds. Measured, it
// sits 30 to 33 dB under the bass, audible only where the pad is away. The rule
// brings it up where it is alone with the bass:
//
//   **The spell**: the slow side (S1's `spellVerdict`), and nowhere else.
//   **The cast**: in the note's bar and the next (its tail), nothing on a
//     sustained lane, no percussion, and at most one melodic layer besides the
//     bass — a passage of bass and one quiet voice.
//   **The voice**: the lift is written on what the voice declares. Its send
//     into the space it is played in comes up `TEXTURE_LIFT_DB` (a send is
//     every voice's, `SEND_CONTROL`, up to +6 dB), and where the voice declares
//     an `indexMul` control the index comes up by half, `TEXTURE_INDEX`: a
//     little more of the bell's upper partial at the strike, still a sine by
//     the time the cloud forms.
//
// ## The bass takes a solo at the theme's arc (house-v2's `bassSolo`)
//
// An experiment, and Eugene's own framing: *"solo is not easy to code, but we
// could try and see; if it is silly we drop the idea"*. The switch was written
// off for his ear and is on since S17.
//
//   **The spell**: the slow side. **The form**: a theme of `SOLO_MIN_BARS` or
//     more. **The cast**: no percussion in the whole theme, and an arc section
//     that is sparse all through — the bass, at most one other melodic layer,
//     nothing sustained.
//   **The arc** is one place: of the main sections of 16 bars or more that
//     are sparse all through, the one whose middle is nearest the golden point
//     of the theme's length. None qualifying is no solo; there is never a
//     second.
//   **The solo** is the section's last 16 bars (8 where it is under 24),
//     with a rest bar before it and the other melodic layers `SOLO_THIN_DB`
//     down and back with the landing. Since round S7 it is the theme's own bass
//     figure, ornamented — octave pops, glides between octaves, a dynamic
//     pluck, under an arc that peaks at the golden point; the rules are at
//     `soloEvents` below. Round S3 moved the figure up an octave ("little licks
//     one octave higher"); round S5 wrote a line of its own up the scale ("a
//     first-grade student ... one note at a time").
//
// No die is drawn: the same plan always solos in the same place, or nowhere.

import type { Lane, Style } from '@deep-house/engine/style';
import { BY_NAME } from '@deep-house/engine/voices';
import type { Spell } from './spell.ts';
import { spellVerdict } from './swell.ts';
import type { Arrangement } from './arrangement.ts';

export const TEXTURE_LIFT_DB = 4;
export const TEXTURE_INDEX = 1.5;
/**
 * A long theme, in bars: 128 until round S19 cut every theme to 0.85 of its
 * drawn length, and 108 since, so the themes that solo are the ones S17
 * counted (four of the golden and benchmark themes under the ambient spell, 20
 * of 120 over seeds 1-40).
 */
export const SOLO_MIN_BARS = 108;
export const SOLO_THIN_DB = -4;
/**
 * **How high the bass may go in a solo**, per voice: the sub is a sine body
 * with its octave and a touch of triangle, and it plays any pitch; what stops
 * it is the room above, where the chords live. So its solo ceiling is the
 * bottom of the chord register (`register.chordLow`, 55, G3, 196 Hz) less a
 * semitone — two octaves up from any base the sub's own register draws (24 to
 * 30) fits under it, and three (60 and over) never does, so a sub's peak is
 * always two octaves. A bass voice with its own declared range would read that.
 */
export const soloCeiling = (register: { chordLow: number }): number => register.chordLow - 1;

type Ev = { t: number; bar?: number | null; step?: number; layer: string; voice: string; role?: string; part?: string; note?: string; p: Record<string, any> };

interface SparseInput {
  style: Style;
  spell: Partial<Spell> | null | undefined;
  bars: number;
  barSeconds: number;
  beat: number;
  arrangement: Arrangement;
  events: Ev[];
  lanes: readonly Lane[];
}

const PERCUSSION = ['kick', 'offbeat', 'sixteenth', 'backbeat'];

/** Which layers sound in a span of bars, by kind. */
function soundingIn(input: SparseInput, from: number, to: number) {
  const { events, lanes } = input;
  const role = (layer: string) => lanes.find((l) => l.gate === layer)?.role ?? null;
  const layers = new Set(events.filter((e) => e.role !== 'texture' && e.layer !== 'fx' && e.bar != null && e.bar >= from && e.bar < to).map((e) => e.layer));
  const list = [...layers];
  return {
    drums: list.some((l) => PERCUSSION.includes(role(l) ?? '')),
    sustained: list.some((l) => role(l) === 'sustained'),
    melodic: list.filter((l) => l !== 'bass' && !PERCUSSION.includes(role(l) ?? '')),
    bass: layers.has('bass'),
  };
}

const sparse = (s: ReturnType<typeof soundingIn>) => !s.drums && !s.sustained && s.melodic.length <= 1;

/** The texture part's notes a sparse passage lifts, and the lift. Returns the bars lifted. */
export function liftTexture(input: SparseInput, apply = false): number[] {
  if (spellVerdict(input.spell, input.style).side !== 'slow') return [];
  const lifted: number[] = [];
  for (const e of input.events) {
    if (e.role !== 'texture' || e.bar == null) continue;
    if (!sparse(soundingIn(input, e.bar, e.bar + 2))) continue;
    lifted.push(e.bar);
    if (!apply) continue;
    const up = Math.pow(10, TEXTURE_LIFT_DB / 20);
    const p = { ...e.p };
    for (const send of ['immersed', 'background', 'reverb', 'delay', 'hall', 'dry']) if (typeof p[send] === 'number' && p[send] > 0) p[send] = Math.min(2, p[send] * up);
    const controls = BY_NAME[e.voice]?.controls ?? {};
    if (controls.indexMul && typeof p.indexMul === 'number') p.indexMul = Math.min(controls.indexMul.max, p.indexMul * TEXTURE_INDEX);
    e.p = p;
  }
  return lifted;
}

/** Where the arc is, and why there or nowhere. */
export interface SoloPlace { from: number; to: number; section: number; why: string }

export function soloPlace(input: SparseInput): SoloPlace | null {
  const { style, spell, bars, arrangement } = input;
  if (spellVerdict(spell, style).side !== 'slow' || bars < SOLO_MIN_BARS) return null;
  if (soundingIn(input, 0, bars).drums) return null;
  const golden = bars * 0.618;
  const candidates = arrangement.sections.filter((s) => s.kind === 'main' && s.bars >= 16
    && sparse(soundingIn(input, s.startBar, s.startBar + s.bars)) && soundingIn(input, s.startBar, s.startBar + s.bars).bass);
  if (!candidates.length) return null;
  const arc = candidates.reduce((a, s) => Math.abs(s.startBar + s.bars / 2 - golden) < Math.abs(a.startBar + a.bars / 2 - golden) ? s : a);
  const len = arc.bars >= 24 ? 16 : 8;
  return { from: arc.startBar + arc.bars - len, to: arc.startBar + arc.bars, section: arc.index, why: `the ${arc.kind} at ${arc.startBar}, nearest the golden point ${golden.toFixed(0)}` };
}

/** How the solo ends: back down to its own octave, or a quick run into the next groove's first note. */
export type SoloEnding = 'descent' | 'slide';

/** What `soloEvents` reads beyond the gates' input: the key, the chords, the voice's ceiling. */
export interface SoloInput extends SparseInput {
  scale: number[];
  root: number;
  progression: { chords: Array<{ degree: number; startBar: number }>; loopBars: number; root: number; scale: number[] };
  /** the highest note the bass may reach in a solo: `SOLO_CEILING` of the style's register */
  ceiling: number;
}

/**
 * **The solo is the theme's own bass figure, ornamented** (round S7). Round S5
 * wrote the solo as a line of its own and Eugene heard *"a first-grade student
 * slowly going one note at a time up the scale ... I was hoping for something
 * at the level of Flea: slides between octaves, dynamic pluck, while following
 * a bass line similar to the track's, which is good — punchy, broken and
 * rhythmical"*. So the skeleton is the figure the dice drew for this theme —
 * every hit of it in the window, on its own step, with its own rests,
 * anticipations and pitches — and the solo is what is done to those hits:
 *
 *   **Octave pops.** Selected hits jump an octave or two, never a walk. Which:
 *     in each bar the hits are ranked off-the-beat first (the figure's
 *     syncopation is what makes it broken), then by the figure's own velocity,
 *     then later in the bar; the envelope (below) says how many of them pop
 *     and how high — an octave, two at the top of it where the ceiling allows.
 *   **Struck, never slid** (round S15). A pop is a jump to the octave or two
 *     and back, with no portamento into it or out of it: Eugene on S11's
 *     slower slides, *"the slides up don't sound like bass, too smooth and
 *     uniform, like some effect"*, and on S7's staccato, *"sounds like a real
 *     bass"*. No note of the solo carries a `slideFrom`: the pops' glides
 *     and the figure's own, which include its octave leaps, are dropped
 *     inside the window, and the figure glides as before outside it.
 *   **Dynamic pluck.** Velocity is contrast, not a ramp: the bar's first
 *     third of the ranking are accents (0.95), its last third ghosts (0.35),
 *     the rest 0.7. Accents are struck with the sub's shortest declared
 *     attack and its brightness knob open; ghosts darker; pops staccato —
 *     held half their gap and shortened by the sub's `hold` knob.
 *   **The arc as an envelope.** How many hits pop and how high rises from
 *     nought at the start to its most at the golden point of the window and
 *     falls back; the ending is S5's — home on the line (no pops in the last
 *     bars), or the scale run into the next groove's first note. The rest bar
 *     before it and the other layers 4 dB down are as before. Density is never
 *     under the figure's own: no hit is removed but the one run replaces.
 */
export const SOLO_VELOCITY = { accent: 1, mid: 0.8, ghost: 0.45 } as const;
/** How many of a bar's hits pop at the top of the arc, and above what share the pops go two octaves. */
export const SOLO_POP = { most: 0.75, twoOctavesAbove: 0.6 } as const;
/** The sub's own knobs per kind of hit: accent, middle, ghost, and a pop's shortened hold. */
export const SOLO_KNOBS = {
  accent: { attack: 0.002, brightnessHz: 900 },
  mid: { brightnessHz: 480 },
  ghost: { brightnessHz: 260 },
  popHold: 0.4,
} as const;
/**
 * A pop is heard louder for its register: taken back per octave it climbs.
 * -2.5 dB an octave until round S22, Eugene on 27191 theme 3's solo: *"the
 * bass energy at two octaves up is dominating, it just sounds out of the
 * theme ... calm those higher-octave spices at least 50 %"*. A pop is an
 * accent (velocity 1, the sub's brightness open) and two octaves up puts the
 * sub's fundamental near 185 Hz, where the ear is fifteen decibels and more
 * kinder than at 46, so -5 dB was not the register's worth. -5.5 an octave
 * takes a further 3 dB off an octave's pop and 6 dB (half) off two octaves';
 * a note at the root register is untouched.
 */
export const SOLO_POP_DB = -5.5;

export function soloEvents(input: SoloInput, place: SoloPlace): { events: Ev[]; ending: SoloEnding; base: number; peak: number; peakBar: number } {
  const { events, barSeconds, beat, scale, root, ceiling, arrangement, style, spell } = input;
  const step = barSeconds / 16;
  const L = place.to - place.from;
  const inWin = (e: Ev) => e.bar != null && e.bar >= place.from && e.bar < place.to;
  const figure = events.filter((e) => e.layer === 'bass' && inWin(e)).sort((a, b) => a.t - b.t);
  const base = Math.min(...figure.map((e) => e.p.midi));
  const peakBar = place.from + Math.round(L * 0.618);
  const next = arrangement.sections.find((s) => s.startBar === place.to);
  const grooveFirst = events.filter((e) => e.layer === 'bass' && e.bar === place.to).sort((a, b) => a.t - b.t)[0];
  const ending: SoloEnding = next && ['drop', 'main'].includes(next.kind) && grooveFirst ? 'slide' : 'descent';
  const slideBeats = spellVerdict(spell, style).side === 'slow' ? 2 : 1;
  const slideFrom = place.to * barSeconds - slideBeats * beat;
  // The envelope: 0 at the start, 1 at the golden point, 0 again two bars
  // before the end (home) or held at a half into the run (slide).
  const envAt = (bar: number) => {
    const u = bar - place.from, pk = peakBar - place.from;
    if (u <= pk) return u / pk;
    if (ending === 'slide') return 1 - 0.5 * (u - pk) / (L - pk);
    return Math.max(0, 1 - (u - pk) / Math.max(1, L - 2 - pk));
  };
  const out: Ev[] = [];
  for (const e of events) {
    if (e.layer === 'bass' && e.bar === place.from - 1) continue; // the rest before
    if (e.layer === 'bass' && inWin(e)) continue; // the figure is re-written below
    if (inWin(e) && e.layer !== 'bass' && e.layer !== 'fx' && e.role !== 'texture')
      out.push({ ...e, p: { ...e.p, gain: (e.p.gain ?? 1) * Math.pow(10, SOLO_THIN_DB / 20) } });
    else out.push(e);
  }
  const line: Ev[] = [];
  for (let bar = place.from; bar < place.to; bar++) {
    const hits = figure.filter((e) => e.bar === bar);
    if (!hits.length) continue;
    const off = (e: Ev) => ((e.step ?? 0) % 4 !== 0 ? 1 : 0);
    const ranked = [...hits].sort((a, b) => off(b) - off(a) || (b.p.vel ?? 0) - (a.p.vel ?? 0) || (b.step ?? 0) - (a.step ?? 0));
    const rank = new Map(ranked.map((e, i) => [e, i]));
    const env = envAt(bar);
    const pops = Math.round(hits.length * SOLO_POP.most * env);
    const high = env >= SOLO_POP.twoOctavesAbove;
    for (const e of hits) {
      const r = rank.get(e)!;
      const third = r < hits.length / 3 ? 'accent' : r >= (2 * hits.length) / 3 && hits.length >= 3 ? 'ghost' : 'mid';
      const pop = r < pops ? (high && e.p.midi + 24 <= ceiling ? 24 : e.p.midi + 12 <= ceiling ? 12 : 0) : 0;
      const knobs: Record<string, number> = { ...(third === 'accent' || pop ? SOLO_KNOBS.accent : SOLO_KNOBS[third]) };
      if (pop) knobs.hold = SOLO_KNOBS.popHold;
      line.push({ ...e, p: { ...e.p, midi: e.p.midi + pop, vel: SOLO_VELOCITY[pop ? 'accent' : third],
        gain: (e.p.gain ?? 1) * Math.pow(10, (SOLO_POP_DB * pop) / 12 / 20),
        ...(pop ? { pop } : {}), knobs } });
    }
  }
  // Staccato on the pops.
  for (let i = 0; i < line.length; i++) {
    const e = line[i], nx = line[i + 1];
    const gap = (nx ? nx.t : place.to * barSeconds) - e.t;
    if (e.p.pop) e.p = { ...e.p, dur: Math.min(e.p.dur ?? gap, gap * 0.7) };
    if (e.t + (e.p.dur ?? 0) > place.to * barSeconds) e.p = { ...e.p, dur: place.to * barSeconds - e.t };
  }
  // No note of the solo glides (round S15): the figure's own slides go with
  // the pops', since among them are the figure's octave leaps (30 to 42 in the
  // benchmark), and a slide up an octave is the effect Eugene heard.
  let solo = line.map((e) => { const { pop: _pop, slideFrom: _from, slideTime: _time, ...p } = e.p; return { ...e, p }; });
  if (ending === 'slide') {
    // The last beats are the scale run down from where the line got to into the groove's first note.
    solo = solo.filter((e) => e.t < slideFrom - 1e-6);
    const land = grooveFirst.p.midi;
    // from the pop register at least: an octave over the groove's note, or where the line was if higher
    const from = Math.max(solo.length ? solo[solo.length - 1].p.midi : base, land + 12);
    const tones: number[] = [];
    for (let m = from - 1; m > land; m--) if (scale.includes((((m - root) % 12) + 12) % 12)) tones.push(m);
    const k = Math.max(1, tones.length);
    const template = figure[figure.length - 1];
    tones.forEach((m, i) => {
      const t = slideFrom + (i * (place.to * barSeconds - slideFrom)) / k;
      const bar = Math.floor(t / barSeconds + 1e-9);
      solo.push({ ...template, t, bar, step: Math.round((t - bar * barSeconds) / step), note: undefined,
        p: { ...template.p, midi: m, vel: SOLO_VELOCITY.mid, dur: (place.to * barSeconds - slideFrom) / k, slideFrom: undefined, knobs: { ...SOLO_KNOBS.mid } } });
    });
  }
  solo.sort((a, b) => a.t - b.t);
  const peak = Math.max(...solo.map((e) => e.p.midi));
  return { events: [...out, ...solo].sort((x, y) => x.t - y.t), ending, base, peak, peakBar };
}
