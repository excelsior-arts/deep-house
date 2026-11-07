// **The dark fronts' sketch** (round dark-fronts, 11-03): a private-tier switch that puts one of the round's new front
// voices in the front of a theme, in the ways a producer of the dark, bass-led places would bring it in, so he can hear
// the voices and their way in before any rule draws them. Nothing in the house calls it: a dev or preview build reads
// `front=` off the address (`readBypass`, `set-plan.ts`), and the round's renderer calls it by name.
//
// His word 11-03, on a dark half-time track whose marimba plays chords from the build through the breakdown: *"we
// perhaps lacking some voices that would fit better … the bass in that track and long synth background pads create good
// mood, but front voices are lacking."* The bass leads in these places; a front voice punctuates it rather than playing
// a line through the drop. So the sketch takes today's front lane (every `keys` note) out of the theme and writes the new
// voice in four ways, each a section's:
//
//   tease      the build's last eight bars: the motif's call, twice, softer (a hint of what is coming);
//   punctuate  the drop: a hit or a few on the bass's gaps (off the kick, the backbeat and the bass's own onsets,
//              where no bass note sounds if any such step is free), Loom setting how many (low Loom, space: one a bar
//              and a bar's rest in four; high Loom, three), the second hit of a bar softer;
//   throw      the last bar of each eight in the drop, and the breakdown's last bar: one hit late in the bar sent whole
//              into the reverb and the delay, its tail blooming over the phrase line;
//   motif      the breakdown: a phrase of call and answer on the chord's tones (steps with a leap, a long note where it
//              lands), its variation in the second four bars at Loom over 0.4 or where no bed holds the bar, else a
//              single landing note and space.
//
// The register is today's front's (its median note); the call sits an octave under it, a low call. No note is ever moved
// up for brightness: the edge is each voice's own.

import { chordAtBar } from './theory.ts';
import { stepToBeats } from './patterns.ts';
import type { PlanEvent, Track } from './generator.ts';

export type FrontWay = 'tease' | 'punctuate' | 'throw' | 'motif';
export const FRONT_WAYS: readonly FrontWay[] = ['tease', 'punctuate', 'throw', 'motif'];

/** A section's front in the second pass (his ear 11-03): which voice, and how it phrases there. */
export interface FrontPart { voice: string; how: string }
/**
 * The phrasings by section (round dark-fronts' second pass, his ear on the first: the stab grammar, short punches, read
 * off the genre; shapes and long phrases worked):
 *
 *   build      `tease` (the motif's call, twice) · `legato` (one long curve over the last eight bars, gliding)
 *   drop       `stab` (the first pass's hits) · `figure` (a short figure on the bass's gaps, repeating, Loom setting how
 *              many notes) · `call` (a sparser call answering the bass's re-strike, landing long) · `swell` (held chords
 *              swelling in and opening over a bar or two)
 *   throw      `8` or `16`: a hit into the reverb on the last bar of every eight or sixteen in the drop, and into a drop
 *   breakdown  `motif` (call and answer) · `legato` (long gliding phrases) · `swell` (held chords, swelling)
 */
export const FRONT_HOWS: Readonly<Record<'build' | 'drop' | 'throw' | 'breakdown', readonly string[]>> = Object.freeze({
  build: ['tease', 'legato'], drop: ['stab', 'figure', 'call', 'swell'], throw: ['8', '16'], breakdown: ['motif', 'legato', 'swell'],
});
type Sections = Partial<Record<keyof typeof FRONT_HOWS, FrontPart>>;

/**
 * What the sketch is asked: a voice and the ways (the first pass), or a part for each section (the second), the spell's
 * Loom, and the front's level against the lane's in dB (a sketch's own: a theme whose front was a piano, or had none,
 * is set by ear and by measure).
 */
export interface FrontAsk { voice: string; ways?: readonly FrontWay[]; loom?: number; levelDb?: number;
  /** the breakdown's own voice for the motif, where it is not the drop's (the release after the growl) */
  calm?: string;
  /** the second pass: a voice and its phrasing by section; where given, `ways` and `calm` are not read */
  parts?: Sections;
  /** the third pass (the rule, `src/dark-fronts.ts`): the front's gain on the keys lane, in place of today's front's */
  gain?: number;
  /** the register: today's front's median note (the sketches), or the top of the first chord's voicing (the rule) */
  centre?: 'front' | 'voicing';
  /** bars a main section holds its lead back at its start (the lead withheld, then exposed) */
  mainFrom?: number;
  /** the call trading with the drop's lead in some segments: in each `every`-bar block of a drop, from bar `from`,
   * `bars` of the lead then `bars` of the call, never together */
  trade?: { voice: string; every: number; from: number; bars: number };
  /** a few notes of a voice as hints in one break's breaths, never the main voice: how many, how dark (the lid's
   * share), and which break (its index among the theme's breakdowns) */
  hints?: { voice: string; notes: number; cutoffMul: number; breakIndex: number };
  /** one throw only, into the last drop a breakdown leads into (the rule's `throw`), in place of a throw a block */
  throwOnce?: boolean;
  /** the front's presence (`p.lift`: a floor and a bell), on the notes of these voices */
  lift?: { voices: readonly string[]; hz: number; db: number; q: number; floorHz: number };
  /** the bell's hints, and its throw (`throwDb`, where given), in dB against the front's level */
  bellDb?: number; throwDb?: number;
  /** the section kinds where today's front keeps its notes (a piano that leads), but for the bars the call takes */
  keepToday?: readonly string[];
  /** the bars where today's front keeps its notes (the rule's draw: wherever no drawn part takes the bar) */
  keepBars?: readonly number[];
  /** the bars where the drop's lead may play (the swells over a held pad: only their drawn moments); absent, every bar */
  leadBars?: readonly number[];
  /** which breaks (by their index among the theme's breakdowns) the call plays, and whether it plays the build's end */
  callBreaks?: readonly number[]; callBuild?: boolean;
  /** the eighth pass (his ear 11-04: the call alone over the hats "interesting for a couple of seconds but gets a bit boring
   * after 6-7 secs"): in a break the call plays two bars and rests two, and this voice answers in its rests, a struck
   * figure and a landing note, the eighth bar of each eight left to the bed; the call there `callDb` softer */
  answer?: { voice: string; callDb: number };
  /** the ninth pass (his ear 11-04: the break "twice as long as needed … Call coolness in its situational appearance, and
   * not prolonged variations"): each break's part by its index: `cameo` the call's one statement (its long curve, four
   * bars) then the answer's voice under the bed; `answered` a shorter statement (two bars) the answer replies to, then
   * under the bed; `breather` the answer's voice under the bed alone. Where given, the call plays no other way in a
   * break, and `answer.voice` is the voice under the bed, `underDb` under the front */
  breakRoles?: Record<number, 'cameo' | 'answered' | 'breather'>; underDb?: number;
  /** the tenth pass (his ear 11-04: a dark front's pitch movement "cartoonish"): how much of a front's movement is grit
   * (`grit`, nought to one, the voice's own `p.grit`), how far a held chord's filter opens (or closes, under one) across
   * its hold, and the call's wobble depth */
  movement?: { grit: number; openMul: number; wobble: number } }

/** How a voice plays in each way: lengths in sixteenths, how many notes a stab stacks, its sends, its register. */
interface FrontShape {
  /** a stab's length, and the longest note a motif may hold */
  stab: number; hold: number;
  /** a throw's length */
  throwLen: number;
  /** the notes a stab stacks: 1 the chord's tone, 2 the tone and its fifth */
  size: 1 | 2;
  /** where its register sits against today's front, in semitones (never over nought) */
  register: number;
  reverb: number; delay: number;
  /** the motif's velocity scale (a bell rings over its neighbours) */
  motifVel: number;
  /** the voice's level in the sketch over the lane's, where its notes are long (a held chord, a curve) */
  gainDb?: number;
}

/** The round's five voices, and the marimba so the page can hear today's voice in the same ways. */
export const FRONT_SHAPES: Readonly<Record<string, FrontShape>> = Object.freeze({
  neuroStab: { stab: 2, hold: 4, throwLen: 4, size: 1, register: 0, reverb: 0.16, delay: 0.12, motifVel: 1 },
  // the second pass's levels, its long notes measured while they sound against the rest: the call's curves 2.5 dB down, the
  // swelling chords 7 dB down (they had stood level with the whole rest of the drop, 7 dB over the pluck); the fourth
  // pass's (his ear: the call "sinking behind other synths"): after its presence (+6 dB at 1.5-4 kHz against the synths),
  // the call still under the pad there in a break, so 4 dB up
  formantCall: { stab: 4, hold: 12, throwLen: 8, size: 1, register: -12, reverb: 0.42, delay: 0.22, motifVel: 1, gainDb: 1.5 },
  crushPluck: { stab: 3, hold: 6, throwLen: 6, size: 1, register: 0, reverb: 0.22, delay: 0.2, motifVel: 1 },
  bellDark: { stab: 8, hold: 16, throwLen: 24, size: 1, register: 0, reverb: 0.5, delay: 0.25, motifVel: 0.85 },
  sawStabDark: { stab: 2, hold: 4, throwLen: 4, size: 2, register: 0, reverb: 0.16, delay: 0.1, motifVel: 0.9, gainDb: -7 },
  marimba: { stab: 2, hold: 6, throwLen: 6, size: 1, register: 0, reverb: 0.2, delay: 0.2, motifVel: 1 },
  marimbaGrit: { stab: 2, hold: 8, throwLen: 6, size: 1, register: 0, reverb: 0.24, delay: 0.14, motifVel: 1 },
});

/** The throw's sends: the hit goes into the reverb whole and into the delay. */
const THROW = { reverb: 1.4, delay: 0.6 } as const;

/** The steps a stab may take in a bar, in the order it tries them: the offbeats and the sixteenths around them. */
const GAP_ORDER = [6, 14, 3, 11, 7, 15, 10, 2, 13, 5] as const;
/** A figure's steps: the eighths off the beat and the sixteenths around them, in the bar's order of preference. */
const FIGURE_ORDER = [2, 6, 10, 14, 3, 7, 11, 15, 5, 13, 9, 1] as const;
/** The long curve: eight bars of [bar, step, degree, length in sixteenths], each note gliding from the one before. */
const LEGATO: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 28], [1, 12, 2, 20], [3, 0, 1, 16], [4, 0, 3, 30], [5, 14, 2, 18], [6, 16 - 16, 1, 26],
];
/** Hits a bar over a four-bar group, by Loom: space, the middle, dense. */
const DENSITY = [[1, 1, 1, 0], [2, 1, 2, 1], [3, 2, 3, 2]] as const;

/** The motif: eight bars, each a list of [step, degree on the chord's tones, length]; the second four its variation. */
const MOTIF: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 2, 4], [6, 1, 2], [10, 0, 6]],
  [[0, 1, 12]],
  [[0, 3, 4], [6, 2, 2], [10, 1, 4]],
  [[2, 0, 14]],
  [[0, 2, 4], [6, 4, 4], [12, 3, 4]],
  [[0, 2, 12]],
  [[0, 1, 6], [8, 0, 8]],
  [],
];

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/**
 * **The theme with its front written by the sketch**: today's `keys` notes out, the asked voice in by its ways. The
 * plan is changed in place and handed back, as `applyBypass` does with its rows.
 */
export function frontSketch<T extends Track>(track: T, ask: FrontAsk | null): T {
  if (!ask || !FRONT_SHAPES[ask.voice]) return track;
  // the first pass's ask, as parts: the one voice in each of its ways, the breakdown's own where named
  const ways = new Set(ask.ways ?? FRONT_WAYS);
  const parts: Sections = ask.parts ?? {
    ...(ways.has('tease') ? { build: { voice: ask.voice, how: 'tease' } } : {}),
    ...(ways.has('punctuate') ? { drop: { voice: ask.voice, how: 'stab' } } : {}),
    ...(ways.has('throw') ? { throw: { voice: ask.voice, how: '8' } } : {}),
    ...(ways.has('motif') ? { breakdown: { voice: ask.calm && FRONT_SHAPES[ask.calm] ? ask.calm : ask.voice, how: 'motif' } } : {}),
  };
  const loom = Math.max(0, Math.min(1, ask.loom ?? 0.5));
  const bs = track.barSeconds, beat = track.beat ?? bs / 4, swing = track.swing ?? 0.5;
  const tAt = (bar: number, step: number) => bar * bs + stepToBeats(step, swing) * beat;
  const sixteenth = bs / 16;
  // a held note that ends while the music goes on fades out unnoticed (his rule: no hold stops dead): a bar and a half,
  // between two and five seconds
  const fade = Math.max(2, Math.min(5, 1.5 * bs));

  // today's front: its register and its level, then out
  const today = track.events.filter((e) => e.layer === 'keys');
  const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const midis = today.map((e) => e.p?.midi).filter((m): m is number => typeof m === 'number');
  const firstChord = chordAtBar(track.progression, 0);
  const centre0 = ask.centre === 'voicing' ? Math.max(...firstChord.voicing) : midis.length ? med(midis) : med(firstChord.voicing);
  const gains = today.map((e) => e.p?.gain).filter((g): g is number => typeof g === 'number');
  const gain = (ask.gain ?? (gains.length ? med(gains) : 0.35)) * 10 ** ((ask.levelDb ?? 0) / 20);
  const frontDb = ask.gain != null ? undefined : today.find((e) => typeof e.frontDb === 'number')?.frontDb;
  // the bars the call takes (the build's last eight, the breaks): today's kept front leaves them to it
  const breakIndex = (sec: { startBar: number }) => track.arrangement.sections.filter((x) => x.kind === 'breakdown' && x.startBar < sec.startBar).length;
  const breakOn = (sec: { startBar: number }) => !ask.callBreaks || ask.callBreaks.includes(breakIndex(sec));
  const callBars = new Set<number>();
  for (const sec of track.arrangement.sections) {
    const end = sec.startBar + sec.bars;
    if (sec.kind === 'build' && parts.build && ask.callBuild !== false) for (let b = Math.max(sec.startBar, end - 8); b < end; b++) callBars.add(b);
    if (sec.kind === 'breakdown' && parts.breakdown && (breakOn(sec) || ask.breakRoles?.[breakIndex(sec)])) for (let b = sec.startBar; b < end; b++) callBars.add(b);
  }
  const kindOf = (bar: number) => track.arrangement.sections.find((x) => bar >= x.startBar && bar < x.startBar + x.bars)?.kind ?? '';
  const keepToday = new Set(ask.keepToday ?? []);
  const keepBars = ask.keepBars ? new Set(ask.keepBars) : null;
  const leadBars = ask.leadBars ? new Set(ask.leadBars) : null;
  const kept = track.events.filter((e) => e.layer !== 'keys' || (keepBars ? keepBars.has(e.bar) : keepToday.has(kindOf(e.bar)) && !callBars.has(e.bar)));

  // the chord's tones in a voice's register: degree 0 the tone at or just under its centre
  const centreOf = (voice: string) => centre0 + Math.min(0, FRONT_SHAPES[voice].register);
  const tonesAt = (bar: number, centre: number) => {
    const pcs = new Set(chordAtBar(track.progression, bar).notes.map((n) => ((n % 12) + 12) % 12));
    const out: number[] = [];
    for (let m = centre - 14; m <= centre + 16; m++) if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
    return out;
  };
  const degree = (bar: number, d: number, voice: string) => {
    const c = centreOf(voice), t = tonesAt(bar, c);
    let i0 = t.length - 1;
    while (i0 > 0 && t[i0] > c) i0--;
    return t[Math.max(0, Math.min(t.length - 1, i0 + d))];
  };
  const rootAt = (bar: number, voice: string) => {
    const c = centreOf(voice), pc = ((chordAtBar(track.progression, bar).rootMidi % 12) + 12) % 12;
    let m = c - ((((c - pc) % 12) + 12) % 12);
    if (c - m > 6) m += 12;
    return m;
  };

  const MV = ask.movement ?? { grit: 0, openMul: 5, wobble: 0.08 };
  const added: PlanEvent[] = [];
  const note = (voice: string, bar: number, step: number, midi: number, len: number, vel: number, extra: Record<string, unknown> = {}, stack = false) => {
    const sh = FRONT_SHAPES[voice];
    // a stacked chord takes the chord's own tone a fourth or more over the note, so it never leaves the key
    const over = (stack || (sh.size === 2 && len <= sh.hold)) ? tonesAt(bar, centreOf(voice)).find((m) => m >= midi + 5) : undefined;
    const notes = over != null ? [midi, over] : [midi];
    const { gainDb: extraDb = 0, ...rest } = extra as { gainDb?: number };
    const lift = ask.lift && ask.lift.voices.includes(voice) ? { lift: { hz: ask.lift.hz, db: ask.lift.db, q: ask.lift.q, floorHz: ask.lift.floorHz } } : {};
    for (const m of notes) added.push({
      t: tAt(bar, step), voice, bar, step, layer: 'keys', note: noteName(m),
      ...(frontDb != null ? { frontDb } : {}),
      p: { midi: m, dur: Math.max(0.05, len * sixteenth), vel, gain: gain * 10 ** (((sh.gainDb ?? 0) + extraDb) / 20), reverb: sh.reverb, delay: sh.delay,
        ...(voice === 'marimba' ? { preset: 'marimba' } : {}), ...lift, ...rest },
    } as PlanEvent);
  };

  // the drums and the bass, bar by bar: the steps a hit must leave alone, the steps a bass note covers, its onsets
  const blocked = new Map<number, Set<number>>(), covered = new Map<number, Set<number>>(), bassOn = new Map<number, number[]>();
  const at = (m: Map<number, Set<number>>, b: number) => { let s = m.get(b); if (!s) m.set(b, (s = new Set())); return s; };
  for (const e of kept) {
    if (e.layer === 'kick' || e.layer === 'clap') at(blocked, e.bar).add(e.step ?? 0);
    if (e.layer === 'bass') {
      const s = e.step ?? 0;
      bassOn.set(e.bar, [...(bassOn.get(e.bar) ?? []), s]);
      for (const k of [s - 1, s, s + 1]) at(blocked, e.bar + Math.floor(k / 16)).add(((k % 16) + 16) % 16);
      const n = Math.round((e.p?.dur ?? 0) / sixteenth);
      for (let k = 0; k < n; k++) at(covered, e.bar + Math.floor((s + k) / 16)).add((s + k) % 16);
    }
  }
  const gapsOf = (bar: number, want: number, apart = 3, order: readonly number[] = GAP_ORDER): number[] => {
    const b = blocked.get(bar) ?? new Set<number>(), c = covered.get(bar) ?? new Set<number>();
    const free = order.filter((s) => !b.has(s));
    const pick = [...free.filter((s) => !c.has(s)), ...free.filter((s) => c.has(s))];
    const out: number[] = [];
    for (const s of pick) { if (out.length >= want) break; if (out.every((o) => Math.abs(o - s) >= apart)) out.push(s); }
    return out.sort((x, y) => x - y);
  };

  const bedBars = new Set<number>();
  for (const e of kept) if (e.layer === 'pad') for (let b = e.bar; b * bs < e.t + (e.p?.dur ?? 0); b++) bedBars.add(b);
  const bedAt = (bar: number) => bedBars.has(bar);
  const secs = track.arrangement.sections;
  const bandOf = loom < 0.33 ? 0 : loom < 0.66 ? 1 : 2;
  const throwAt = (voice: string, bar: number) => {
    const s = gapsOf(bar, 4).filter((x) => x >= 8)[0] ?? 10;
    note(voice, bar, s, degree(bar, 2, voice), FRONT_SHAPES[voice].throwLen, 0.9, { reverb: THROW.reverb, delay: THROW.delay, gainDb: ask.throwDb ?? ask.bellDb ?? 0 });
  };
  const motifBar = (voice: string, bar: number, k: number, vel: number, landingOnly = false) => {
    const line = MOTIF[k % 8], sh = FRONT_SHAPES[voice];
    for (const [s, d, len] of landingOnly ? line.slice(0, 1) : line) note(voice, bar, s, degree(bar, d, voice), Math.min(len, sh.hold), vel * sh.motifVel);
  };
  // a long curve: each note glides in from the one before it, its vowel opening slowly, the phrase's last falling away
  const legato = (voice: string, from: number, to: number, vel: number) => {
    let prev: number | null = null;
    for (let b0 = from; b0 + 8 <= to || b0 === from; b0 += 8) {
      LEGATO.forEach(([bar, step, d, len], n) => {
        const b = b0 + bar;
        if (b >= to) return;
        const m = degree(b, d, voice), last = n === LEGATO.length - 1;
        const secs = len * sixteenth;
        note(voice, b, step, m, len, vel * (last ? 0.85 : 1), {
          attack: Math.min(0.35, secs * 0.25), vowelTime: secs * 0.8, wobbleDepth: +MV.wobble.toFixed(3),
          ...(prev != null && prev !== m ? { slideCents: (prev - m) * 100, slideTime: Math.min(0.35, secs * 0.3) } : {}),
          bendCents: last ? -300 : 0, bendTime: last ? Math.min(1.2, secs * 0.5) : 0,
          ...(last ? { release: fade } : {}),
        });
        prev = m;
      });
      if (b0 + 8 > to) break;
    }
  };
  // **the call and its answer** (the eighth pass): each eight bars, the call's curve over bars 0-1 and 4-5 (each phrase two
  // notes, the second gliding from the first and falling away as it fades), the answer's struck figure in bar 2 and its
  // landing in bar 3, one soft note in bar 6, and bar 7 the bed's alone; each eight the call starts a degree higher
  const traded = (voice: string, answer: string, from: number, to: number, vel: number, callDb: number) => {
    let prev: number | null = null;
    const CALL: ReadonlyArray<readonly [number, number, number, number]> = [[0, 0, 0, 20], [1, 4, 2, 12], [4, 0, 1, 20], [5, 4, 3, 12]];
    for (let b0 = from; b0 < to; b0 += 8) {
      const k = Math.floor((b0 - from) / 8);
      CALL.forEach(([bar, step, d, len], n) => {
        const b = b0 + bar;
        if (b >= to) return;
        const m = degree(b, (d + k) % 4, voice);
        const secs = len * sixteenth;
        note(voice, b, step, m, len, vel * (n % 2 ? 0.9 : 1), {
          attack: Math.min(0.35, secs * 0.25), vowelTime: secs * 0.8, wobbleDepth: +MV.wobble.toFixed(3), gainDb: callDb,
          ...(prev != null && prev !== m && n % 2 === 1 ? { slideCents: (prev - m) * 100, slideTime: Math.min(0.35, secs * 0.3) } : {}),
          bendCents: n % 2 ? -200 : 0, bendTime: n % 2 ? Math.min(0.8, secs * 0.4) : 0, release: n % 2 ? fade : 0.6,
        });
        prev = m;
      });
      // the answer, under the call (2 dB, measured: an octave over it, at the same gain it stood level or over): a figure,
      // its landing, and one soft note before the bed's bar
      const fig = MOTIF[(2 * k) % 6], land = MOTIF[(2 * k + 1) % 6], under = { gainDb: -2 };
      if (b0 + 2 < to) for (const [s, d, len] of fig) note(answer, b0 + 2, s, degree(b0 + 2, d, answer), Math.min(len, FRONT_SHAPES[answer].hold), 0.78, under);
      if (b0 + 3 < to) for (const [s, d, len] of land.slice(0, 1)) note(answer, b0 + 3, s, degree(b0 + 3, d, answer), FRONT_SHAPES[answer].hold, 0.7, under);
      if (b0 + 6 < to) note(answer, b0 + 6, 8, degree(b0 + 6, 1 + (k % 2), answer), FRONT_SHAPES[answer].hold, 0.55, under);
    }
  };
  // **the cameo** (the ninth pass): the call's one statement, its long curve over four bars (or two, answered), gone after
  // it; the answer's voice under the bed from there on, a figure every four bars and a landing between
  const cameo = (voice: string, from: number, to: number, role: 'cameo' | 'answered' | 'breather', intoGroove = false) => {
    const under = ask.answer?.voice && FRONT_SHAPES[ask.answer.voice] ? ask.answer.voice : null;
    let rest = from;
    // **the answer closes the break** (the tenth pass, his ear 11-04: "if it starts the break, the answer likely should
    // end the break and transit into the groove"): where the statement opened a break that leads into a groove, the
    // call answers itself over the break's last four bars, the call's contour mirrored home (it rose; the answer falls
    // to the chord's root), its last note landing on the return's downbeat and fading under the groove, so the seam's
    // own treatments (the riser, the fill, the crash) land on the answer; the ground stays out of those bars
    const answerAt = role !== 'breather' && intoGroove && to - from >= 8 ? to - 4 : -1;
    const stop = answerAt >= 0 ? answerAt - 1 : to;
    if (role !== 'breather') {
      const line: ReadonlyArray<readonly [number, number, number, number]> = role === 'cameo' ? [[0, 0, 0, 28], [1, 12, 2, 20], [3, 0, 1, 16]] : [[0, 0, 1, 20], [1, 4, 2, 12]];
      let prev: number | null = null;
      line.forEach(([bar, step, d, len], n) => {
        const b = from + bar;
        if (b >= to) return;
        const m = degree(b, d, voice), last = n === line.length - 1, secs = len * sixteenth;
        note(voice, b, step, m, len, 0.8 * (last ? 0.9 : 1), {
          attack: Math.min(0.35, secs * 0.25), vowelTime: secs * 0.8, wobbleDepth: +MV.wobble.toFixed(3), gainDb: ask.answer?.callDb ?? 0,
          ...(prev != null && prev !== m ? { slideCents: (prev - m) * 100, slideTime: Math.min(0.35, secs * 0.3) } : {}),
          bendCents: last ? -300 : 0, bendTime: last ? Math.min(1.2, secs * 0.5) : 0, ...(last ? { release: fade } : {}),
        });
        prev = m;
      });
      rest = from + (role === 'cameo' ? 4 : 2);
      // answered: the reply in the two bars after the statement, at the answer's own level
      if (role === 'answered' && under) {
        for (const [s_, d, len] of MOTIF[0]) if (rest < to) note(under, rest, s_, degree(rest, d, under), Math.min(len, FRONT_SHAPES[under].hold), 0.78, { gainDb: -2 });
        if (rest + 1 < to) note(under, rest + 1, MOTIF[1][0][0], degree(rest + 1, MOTIF[1][0][1], under), FRONT_SHAPES[under].hold, 0.7, { gainDb: -2 });
        rest += 2;
      }
    }
    if (answerAt >= 0) {
      const line: ReadonlyArray<readonly [number, number, number, number]> = [[0, 0, 2, 24], [1, 8, 1, 16], [2, 8, 0, 24 + 16]];
      let prev: number | null = null;
      line.forEach(([bar, step, d, len], n) => {
        const b = answerAt + bar, m = n === line.length - 1 ? rootAt(b, voice) : degree(b, d, voice), last = n === line.length - 1, secs = len * sixteenth;
        note(voice, b, step, m, len, 0.8 * (last ? 0.95 : 0.9), {
          attack: Math.min(0.35, secs * 0.25), vowelTime: secs * 0.8, wobbleDepth: +MV.wobble.toFixed(3), gainDb: ask.answer?.callDb ?? 0,
          ...(prev != null && prev !== m ? { slideCents: (prev - m) * 100, slideTime: Math.min(0.35, secs * 0.3) } : {}),
          bendCents: last ? -200 : 0, bendTime: last ? Math.min(1.2, secs * 0.4) : 0, ...(last ? { release: fade } : {}),
        });
        prev = m;
      });
    }
    if (!under) return;
    for (let b = rest, k = 0; b < stop; b++, k++) {
      const db = ask.underDb ?? -6;
      if (k % 4 === 0) for (const [s_, d, len] of MOTIF[(2 * Math.floor(k / 4)) % 6].slice(0, 2)) note(under, b, s_, degree(b, d, under), Math.min(len, FRONT_SHAPES[under].hold), 0.7, { gainDb: db });
      else if (k % 4 === 2) note(under, b, 8, degree(b, 1 + (Math.floor(k / 4) % 2), under), FRONT_SHAPES[under].hold, 0.6, { gainDb: db });
    }
  };
  // held chords that swell in and open over their length
  const gritOf = (voice: string) => (voice === parts.drop?.voice && MV.grit > 0 ? { grit: +MV.grit.toFixed(2) } : {});
  const swell = (voice: string, bar: number, bars: number, vel: number) => {
    const secs = bars * bs;
    note(voice, bar, 0, degree(bar, 0, voice), bars * 16, vel, { attack: secs * 0.45, open: secs * 0.9, openMul: +MV.openMul.toFixed(2), sustain: 0.95, release: fade, ...gritOf(voice) }, true);
  };

  for (const [i, sec] of secs.entries()) {
    const end = sec.startBar + sec.bars;
    const intoDrop = !!secs[i + 1] && (secs[i + 1].kind === 'drop' || secs[i + 1].kind === 'main');
    if (sec.kind === 'build' && parts.build && ask.callBuild !== false) {
      const { voice, how } = parts.build;
      if (how === 'legato') legato(voice, Math.max(sec.startBar, end - 8), end, 0.6);
      else for (const from of [end - 8, end - 4]) if (from >= sec.startBar) { motifBar(voice, from, 0, 0.65); motifBar(voice, from + 1, 1, 0.6); }
    }
    if (sec.kind === 'drop' || sec.kind === 'main') {
      const every = parts.throw && !ask.throwOnce ? Number(parts.throw.how) : 0;
      const T = ask.trade;
      let traded: number | null = null;
      for (let bar = sec.startBar; bar < end; bar++) {
        const k = bar - sec.startBar;
        if (every && k % every === every - 1) { throwAt(parts.throw!.voice, bar); continue; }
        if (!parts.drop) continue;
        if (sec.kind === 'main' && k < (ask.mainFrom ?? 0)) continue;
        if (leadBars && !leadBars.has(bar)) continue;
        // the trade: in its segment, the lead's bars and the call's bars take turns, never together
        if (T && sec.kind === 'drop' && sec.bars >= T.every && k % T.every >= T.from && Math.floor(k / T.every) % 2 === 0) {
          const j = k % T.every - T.from;
          if (Math.floor(j / T.bars) % 2 === 1) {
            if (j % T.bars === 0) {
              const len = T.bars * 16 - 2, m = degree(bar, [2, 1, 3, 0][Math.floor(j / (2 * T.bars)) % 4], T.voice);
              note(T.voice, bar, 0, m, len, 0.75, { attack: Math.min(0.35, len * sixteenth * 0.25), vowelTime: len * sixteenth * 0.8, wobbleDepth: +MV.wobble.toFixed(3),
                ...(traded != null && traded !== m ? { slideCents: (traded - m) * 100, slideTime: 0.3 } : {}), bendCents: -200, bendTime: Math.min(0.8, len * sixteenth * 0.3), release: fade });
              traded = m;
            }
            continue;
          }
        }
        const { voice, how } = parts.drop;
        // a main plays its lead at the space band, a drop at the Loom's: the lead withheld, then exposed (the rule's)
        const band = sec.kind === 'main' && ask.mainFrom != null ? 0 : bandOf;
        if (how === 'stab') {
          const want = DENSITY[band][k % 4];
          if (!want) continue;
          const steps = k % 2 ? gapsOf(bar, want + 1).slice(-want) : gapsOf(bar, want);
          const first = [rootAt(bar, voice), rootAt(bar, voice), degree(bar, 1, voice), degree(bar, -1, voice)][k % 4];
          steps.forEach((s, j) => note(voice, bar, s, j === 0 ? first : degree(bar, 1 + ((k + j) % 2), voice), FRONT_SHAPES[voice].stab, j === 0 ? 0.85 : 0.68));
        } else if (how === 'figure') {
          // a short figure on the bar's gaps, the same two bars, its turn on the third, a breath on the fourth at low Loom
          if (k % 4 === 3 && band === 0) continue;
          const n = [3, 4, 5][band];
          const steps = gapsOf(bar, n, 2, FIGURE_ORDER);
          const cell = k % 4 === 2 ? [2, 1, 3, 2, 1] : k % 4 === 3 ? [1, 0, -1, 0, 1] : [2, 1, 0, 1, 2];
          steps.forEach((s, j) => {
            const next = steps[j + 1] ?? 16;
            note(voice, bar, s, degree(bar, cell[j], voice), Math.max(2, Math.min(4, next - s)), j === 0 ? 0.85 : 0.7);
          });
        } else if (how === 'call') {
          // a call after the bass's re-strike, landing long; every second bar at low Loom, every bar over it (the even bar's an echo)
          const answer = k % 2 === 1;
          if (!answer && band === 0) continue;
          const after = Math.max(...(bassOn.get(bar) ?? [0]));
          const order = after < 12 ? FIGURE_ORDER.filter((s) => s > after) : FIGURE_ORDER;
          const steps = gapsOf(bar, answer ? 3 : 2, 2, order);
          const line = answer ? ((k >> 1) % 2 ? [0, 1, 2] : [2, 1, 0]) : [1, 0];
          steps.slice(0, line.length).forEach((s, j, all) => {
            const lastOne = j === all.length - 1;
            note(voice, bar, s, degree(bar, line[j], voice), lastOne ? Math.max(4, 16 - s) : 2, answer ? (j === 0 ? 0.8 : 0.72) : 0.6);
          });
        } else if (how === 'swell') {
          if (k % 4 === 0) swell(voice, bar, 2, 0.8);
          else if (k % 4 === 2 && band > 0) swell(voice, bar, 1, 0.65);
        }
      }
    }
    if (sec.kind === 'breakdown') {
      // a few notes of the hint voice in the breaths of one break (the call's phrase rests on its eighth bar)
      if (ask.hints && ask.hints.notes > 0 && secs.slice(0, i).filter((x) => x.kind === 'breakdown').length === ask.hints.breakIndex) {
        const H = ask.hints, blocks = Math.max(1, Math.floor(sec.bars / 8));
        for (let h = 0; h < H.notes; h++) {
          const block = blocks - 1 - (h % blocks), bar = sec.startBar + block * 8 + 7 - Math.floor(h / blocks) % 2;
          if (bar >= end) continue;
          note(H.voice, bar, h % 2 ? 6 : 10, degree(bar, 3 - (h % 3), H.voice), 12, 0.6, { cutoffMul: H.cutoffMul, gainDb: ask.bellDb ?? 0 });
        }
      }
      const role = ask.breakRoles?.[breakIndex(sec)];
      if (role && parts.breakdown) cameo(parts.breakdown.voice, sec.startBar, end, role, intoDrop);
      else if (parts.breakdown && breakOn(sec)) {
        const { voice, how } = parts.breakdown;
        if (how === 'legato' && ask.answer && FRONT_SHAPES[ask.answer.voice]) traded(voice, ask.answer.voice, sec.startBar, end, 0.8, ask.answer.callDb);
        else if (how === 'legato') legato(voice, sec.startBar, end, 0.8);
        else if (how === 'swell') for (let bar = sec.startBar; bar < end; bar += 2) swell(voice, bar, Math.min(2, end - bar), 0.75);
        else for (let bar = sec.startBar; bar < end; bar++) {
          const k = bar - sec.startBar;
          // space by Loom only over a bed: a breakdown whose pad is out has the front as its harmony, so the phrase plays whole
          if (k % 8 >= 4 && loom < 0.4 && bedAt(bar)) { if (k % 8 === 4) motifBar(voice, bar, 5, 0.75, true); continue; }
          motifBar(voice, bar, k, 0.8);
        }
      }
      const lastIntoDrop = intoDrop && !secs.slice(i + 1).some((x, j) => x.kind === 'breakdown' && !!secs[i + 2 + j] && (secs[i + 2 + j].kind === 'drop' || secs[i + 2 + j].kind === 'main'));
      if (parts.throw && intoDrop && (!ask.throwOnce || lastIntoDrop)) throwAt(parts.throw.voice, end - 1);
    }
  }
  track.events = [...kept, ...added].sort((x, y) => x.t - y.t);
  return track;
}
