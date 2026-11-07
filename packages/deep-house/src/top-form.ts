// **The top follows the form** (round top-form, 11-02; his word 11-01: *"make our root deep house music more
// interesting and fill in a bit better our lacking high freq domain"*, and on the table of 39 ideas, 11-02: *"All T1-12
// improvements are go"*). The gap, measured (the top-end round, 11-01): at matched loudness our top is not short on
// level, it is short on time — it turns in 17% of bars against the sources' 47%, steps by 3 dB or more 2.1 times a
// minute against their 0.9, and 14% of our featured deep bars have nothing above 6 kHz against their 3%. So nothing
// here raises a level, and the moves are turns rather than switches.
//
// **One owner for the top lanes' in and out on the phrase lines.** Until this round four things decided the top of a
// house groove, each on its own: the section grammar's gates and `hatSections` (`src/hats.ts`: a breakdown's first
// phrase without hats, the later ones thinned), the sub-sections' variations over a phrase's second half
// (`src/subsections.ts`), and the hats' moves at the seams (`src/hat-moves.ts`, through the phrasing). This planner is
// the one place the top's form is decided, and it is planned where the sub-sections are — after their draw, before a
// bar is laid — and played by the same machine: every idea is a sub-section (`kind: 'top'`) whose figure is lanes in
// roles, played by `playSubSections` on the theme's own kit (the same voice, the same trim, the same room: never an
// instrument the theme did not draw). It reads what is already decided and keeps off it: a bar a switch-up, a
// variation, a turnaround, a fill or a drop-out edits on the same roles is theirs; the rhythm development's pickups are
// theirs; and its own moves never share a bar (a rota span, a breather, a second drop, a staged entry). The phrasing
// reads its sub-sections as it reads the variations (a phrase event may sit over a turn of the top, the hats' moves lead
// into and out of none of them), except the breather, which is a phrase event of its own and holds its bars. `hatSections`
// asks it which bars it owns. The break's first phrase it hands to the break pulse (`src/break-pulse.ts`), the one
// writer of a break's carrier, with the holder it drew; and the breakdown's slope to the automation.
//
// The ideas, each a word in the place's list (`SubRates.top`) and a block of `recipes/arrangement/top-form.json`, so one
// can come out by ear without unpicking the others:
//
//   rota          T01  a quiet player out or in for a phrase, about every dozen bars (Veil the rate, Loom the span)
//   floor         T02  the breakdown's drums slope instead of closing, and its first phrase is held (the holders)
//   clock         T03  one offbeat opens every four or eight bars: a clock for the phrase
//   second-drop   T04  after the longest breakdown the top waits a phrase under a thin hat, once a track (`Section.topOpens`)
//   breather      T05  the kick and the bass out for two or four bars inside a long main, the top on, once a track
//   grow          T07  each groove adds one small thing to the hat that then stays
//   steps         T08  a long breakdown's way out on the hats alone; a build's last half takes the sixteenths in
//   answer        T09  the eighth bar of every sixteen answers itself: the backbeat on the 3e, the open hat on the 4a
//   pulse         T10  the deep break's lighter holders (the backbeat alone, a few ticks), drawn by `floor`
//   voices        the quiet players (round top-voices-2, `src/top-voices.ts`): a few a track, the rota's players
//
// Everything is read off the birds and the form, never a genre's name; every draw is off a stream of its own
// (`<seed>::top:…`), so a top move drawn or not moves no other die.

import ROW_FILE from '../recipes/arrangement/top-form.json' with { type: 'json' };
import { Rng } from './rng.ts';
import { lean } from './lean.ts';
import type { Recipe } from './recipe.ts';
import { footprint, type SubSection } from './subsections.ts';
import type { Letter } from './treatment.ts';

export type TopIdea = 'rota' | 'floor' | 'clock' | 'second-drop' | 'breather' | 'grow' | 'steps' | 'answer' | 'pulse' | 'voices';
export const TOP_IDEAS: readonly TopIdea[] = Object.freeze(['rota', 'floor', 'clock', 'second-drop', 'breather', 'grow', 'steps', 'answer', 'pulse', 'voices']);
/** What holds a breakdown's first phrase at the top: the hat as a whisper, the backbeat alone, a few ticks, or nothing. */
export type TopHolder = 'floor' | 'backbeat' | 'ticks' | 'none' | 'carry';
// (`carry`, round top-lanes pass 3, T37: the groove's hat carried on the offbeats of two and four; taken by a chance of its
// own after the draw over the four older holders, so that draw is the one it was wherever `carry` is not taken)
export const TOP_HOLDERS: readonly TopHolder[] = Object.freeze(['floor', 'backbeat', 'ticks', 'none']);

type W = Record<string, number>;
type Leans = Record<string, W>;
export interface TopFormRow {
  centre: Record<string, number>;
  tempo: { bpm: [number, number] };
  front: { off: TopIdea[] };
  rota: { leastBars: number; bars: { short: number; long: number; loomLong: number }; gapBars: { still: number; shifting: number };
    players: string[]; later: string[]; ghosts: { steps: number[]; level: number }; leans: Leans };
  clock: { slots: number[]; period: { short: number; long: number; loomLong: number }; level: number; chokeAfter: number };
  secondDrop: { bars: { short: number; long: number; loomLong: number }; hat: string; level: number };
  breather: { leastBars: number; bars: { short: number; long: number; longMain: number }; chance: number; leans: Leans };
  grow: { tick: { steps: number[]; level: number }; pickup: { steps: number[]; level: number }; leastGrooves: number };
  steps: { breakLeast: number; buildLeast: number; hat: string; level: number; long?: { loomLong: number; bars: number; hat: string } };
  answer: { chance: number; leastBars: number; every: number; at: number; clap: { step: number; level: number }; splash: { step: number; level: number }; leans: Leans };
  floor: { slope: { hz: number; zephyr: number; least: number; most: number }; holders: Record<Exclude<TopHolder, 'carry'>, number>; leans: Leans;
    hats: { steps: number[]; db: number }; least: number; carry: { share: number; steps: number[]; db: number } };
  pulse: { backbeat: { steps: number[]; db: number; reverb: number; hp: number }; ticks: { bars: number[][]; db: number } };
}
export const TOP_FORM: Readonly<TopFormRow> = ROW_FILE as unknown as TopFormRow;

/** What the theme plays up top, as the planner needs it (read off the lanes and the dice before a bar is laid). */
export interface TopTheme {
  /** the sixteenth lane plays a figure of its own in the grooves (never a hand player's phrase, which keeps its own) */
  sixteenths: boolean;
  /** a closed hat lane plays */
  closed: boolean;
  /** an open hat voice the theme carries, for the clock and the answer to borrow */
  open: boolean;
  /** a backbeat lane plays */
  backbeat: boolean;
  /** a drone in front (the one-foreground rule): the top stays simple */
  front?: boolean;
}

export interface TopFormInput {
  seed: string | number;
  sections: ReadonlyArray<{ index: number; kind: string; startBar: number; bars: number; phrases?: ReadonlyArray<{ startBar: number }> }>;
  spell: Readonly<Record<string, number>>;
  /** the theme's tempo: the top form plays inside the row's window (the house's pace) */
  bpm: number;
  ideas: readonly TopIdea[];
  theme: TopTheme;
  /** the sub-sections already drawn: their bars are theirs on the roles they edit */
  drawn: readonly SubSection[];
  /** bars another small thing owns whole (the rhythm development's pickups) */
  keep?: ReadonlySet<number>;
  row?: Readonly<TopFormRow>;
}

/** One breakdown's first phrase, as the break pulse lays its holder over it. */
export interface TopBreak { from: number; until: number }
export interface TopFormPlan {
  subs: SubSection[];
  /** the bars whose hats the top form writes, which `hatSections` leaves as they are */
  hats: Set<number>;
  /** the holder of every breakdown's first phrase, drawn once a theme (`floor`); null where the idea is off */
  holder: TopHolder | null;
  /** the drums' corner at a breakdown's start, in Hz (`floor`'s slope); null where the idea is off */
  slope: number | null;
  /** the second drops: the section and the bar its top opens on (`Section.topOpens`) */
  opens: Array<{ section: number; bar: number }>;
  /** what was drawn, one line a move, for the readout */
  summary: string;
}

/** A figure as `playSubSections` plays it: a treatment's shape, written here and never in the library. */
const figureRow = (id: string, name: string, figure: Recipe['figure']): Recipe =>
  ({ schema: 1, kind: 'recipe', id, revision: 1, name, scope: 'treatment', applies: 'top', birds: {}, figure, forbids: [], weight: 0 }) as unknown as Recipe;

/** A sixteen-step mask with `c` on each of `steps`. */
const maskOf = (steps: readonly number[], c: string): string => Array.from({ length: 16 }, (_, i) => (steps.includes(i) ? c : '.')).join('');

/** The one lean (`src/lean.ts`) of a choice over every bird of a row's leans, about the row's centre (the house's own birds). */
function leanOf(leans: Leans | undefined, choice: string, spell: Readonly<Record<string, number>>, centre: Readonly<Record<string, number>>): number {
  let x = 1;
  for (const [bird, w] of Object.entries(leans ?? {})) x *= lean(w?.[choice], spell[bird], 1, centre[bird] ?? 0.5);
  return x;
}

const GROOVE = new Set(['main', 'drop']);

/**
 * **The top's form for one theme.** Every idea the place lists, in the order a producer would lay them: the structure
 * first (the breakdowns' way out, the second drops, the builds), then the long main's breather, the hats' growth, the
 * rota's turns, the eighth-bar answers and the clock last, each keeping off the bars the ones before it took.
 */
export function planTopForm(I: TopFormInput): TopFormPlan {
  const R = I.row ?? TOP_FORM, C = R.centre, sp = I.spell, T = I.theme;
  // the house's pace only; under a drone in front the top stays simple
  const paced = I.bpm >= R.tempo.bpm[0] && I.bpm <= R.tempo.bpm[1];
  const on = new Set(paced ? I.ideas.filter((x) => !(T.front && R.front.off.includes(x))) : []);
  const subs: SubSection[] = [];
  const hats = new Set<number>();
  const opens: TopFormPlan['opens'] = [];
  const said: string[] = [];
  const bird = (b: string) => (typeof sp[b] === 'number' ? sp[b] : C[b] ?? 0.5);
  const keep = I.keep ?? new Set<number>();
  // the roles each bar's drawn small things edit
  const drawnAt = new Map<number, Set<string>>();
  for (const s of I.drawn) {
    const roles = footprint(s.row);
    for (let b = s.startBar; b < s.startBar + s.bars; b++) { const m = drawnAt.get(b) ?? new Set<string>(); drawnAt.set(b, m); for (const r of roles) m.add(r); }
  }
  // the bars a move of this planner's own holds (one at a time: a rota span, a breather, a second drop, a staged entry)
  const owned = new Set<number>();
  const touches = (b: number, roles: readonly string[]) => keep.has(b) || roles.some((r) => drawnAt.get(b)?.has(r));
  const free = (a: number, z: number, roles: readonly string[], own = true) => {
    for (let b = a; b < z; b++) if (touches(b, roles) || (own && owned.has(b))) return false;
    return true;
  };
  // (...and the structural ones among them, which hold their bars against the accents too: a staged entry, a second
  // drop, a breather; the rota's turns let the clock and the answer play over them)
  const structural = new Set<number>();
  const take = (a: number, z: number, hold = true) => { for (let b = a; b < z; b++) { owned.add(b); if (hold) structural.add(b); } };
  const add = (id: string, name: string, top: TopIdea, startBar: number, bars: number, figure: Recipe['figure']) => {
    const row = figureRow(`top/${id}`, name, figure);
    subs.push({ kind: 'top', startBar, bars, label: name, figure: row.id, row, top });
  };
  const HATS = ['offbeat', 'closed', 'open'];
  const grooves = I.sections.filter((s) => GROOVE.has(s.kind));
  const loom = bird('loom'), veil = bird('veil');

  // ----- T08, the steps: a long breakdown's way out on the hats alone; a build's last half takes the sixteenths in -----
  if (on.has('steps')) {
    const S = R.steps;
    for (const s of I.sections) {
      if (s.kind === 'breakdown' && s.bars >= S.breakLeast && T.closed) {
        const phrases = s.phrases?.length ? s.phrases.map((p) => p.startBar) : [s.startBar];
        // (at a long Loom trimmed, round top-end-1: its last bars only, on the thin hat the second drop carries on)
        const trim = S.long && loom >= S.long.loomLong ? S.long : null;
        const z = s.startBar + s.bars, a = trim ? Math.max(phrases[phrases.length - 1], z - trim.bars) : phrases[phrases.length - 1];
        if (a > s.startBar && free(a, z, [...HATS, 'sixteenth'])) {
          add('hats-lead-out', 'the hats lead the way out', 'steps', a, z - a,
            { lanes: { sixteenth: { clear: 0 }, closed: { clear: 0, mask: [trim ? trim.hat : S.hat] } }, letters: { x: { level: S.level } } });
          take(a, z);
          for (let b = a; b < z; b++) hats.add(b);
          said.push(`the hats lead out ${a}-${z}`);
        }
      }
      if (s.kind === 'build' && s.bars >= S.buildLeast && T.sixteenths) {
        // over its last half (a phrase at most), ending before a last bar another small thing marks (a fill, a drop-out)
        const n = Math.min(8, Math.floor(s.bars / 2)), last = s.startBar + s.bars;
        const z = touches(last - 1, ['sixteenth']) ? last - 1 : last, a = z - n;
        if (z - a >= 2 && free(a, z, ['sixteenth'])) {
          add('sixteenths-step-in', 'the sixteenths step in', 'steps', a, n, { layers: { on: ['sixteenth'] } });
          take(a, z);
          said.push(`the sixteenths step in ${a}-${z}`);
        }
      }
    }
  }

  // ----- T04, the second drop: the top waits a phrase after a breakdown -----
  const waiting = new Set<number>();
  if (on.has('second-drop') && T.closed) {
    const D = R.secondDrop;
    const n0 = loom >= D.bars.loomLong ? D.bars.long : D.bars.short;
    // once a track (round top-end-1): the groove after the longest breakdown, the later of two alike, else the next
    // that can take it
    const breakBars = (s: { index: number }) => I.sections.find((x) => x.index === s.index - 1)?.bars ?? 0;
    const order = [...grooves].sort((x, y) => breakBars(y) - breakBars(x) || y.startBar - x.startBar);
    for (const s of order) {
      if (opens.length) break;
      const prev = I.sections.find((x) => x.index === s.index - 1);
      if (prev?.kind !== 'breakdown') continue;
      // a phrase at least of the whole top after it (in the section, or the groove after it); a long wait only where
      // the section holds a phrase after it
      const next = I.sections.find((x) => x.index === s.index + 1);
      const after = !!next && GROOVE.has(next.kind);
      // (the long wait only where the full top then holds two phrases of the section at least: never most of a main)
      const long = n0 > D.bars.short ? s.bars >= n0 + 16 : s.bars >= n0 + 8 || (after && s.bars >= n0);
      const n = long ? n0 : s.bars >= D.bars.short + 8 || (after && s.bars >= D.bars.short) ? D.bars.short : 0;
      if (!n) continue;
      const a = s.startBar, z = a + n;
      if (!free(a, z, [...HATS, 'sixteenth'])) continue;
      add('the-top-waits', 'the top waits a phrase', 'second-drop', a, n,
        { lanes: { open: { clear: 0 }, sixteenth: { clear: 0 }, closed: { clear: 0, mask: [D.hat] } }, letters: { t: { level: D.level } } });
      take(a, z);
      for (let b = a; b < z; b++) waiting.add(b);
      opens.push({ section: s.index, bar: z });
      said.push(`the top waits ${a}-${z}`);
    }
  }

  // ----- T05, the breather: the kick and the bass out inside a long main, the top on -----
  if (on.has('breather') && T.closed) {
    const B = R.breather;
    // once a track at most, and short (round top-end-1; his ear 11-02: "probably shorter segments"): each long main
    // draws as before, in order, and the first that plays takes it; its line a sixteen-bar line inside the main, after
    // its first phrase and a phrase before its end
    const leanLong = leanOf(B.leans, 'long', sp, C) > 1.15;
    let pick: { line: number; len: number } | null = null;
    for (const s of grooves) {
      if (pick) break;
      if (s.kind !== 'main' || s.bars < B.leastBars) continue;
      const r = new Rng(`${I.seed}::top:breather:${s.index}`);
      const plays = r.chance(Math.min(1, B.chance * leanOf(B.leans, 'on', sp, C)));
      const len = leanLong || s.bars >= B.bars.longMain ? B.bars.long : B.bars.short;
      const lines: number[] = [];
      for (let line = s.startBar + 16; line <= s.startBar + s.bars - 8; line += 16) {
        if (line - len >= s.startBar + 8 && free(line - len, line, ['kick', 'bassline', 'backbeat', ...HATS, 'sixteenth'])) lines.push(line);
      }
      if (plays && lines.length) pick = { line: lines[r.int(0, lines.length)], len };
    }
    if (pick) {
      const a = pick.line - pick.len;
      add('breather', 'a breather', 'breather', a, pick.len, { lanes: { kick: { clear: 0 }, bassline: { clear: 0 } } });
      take(a, pick.line);
      said.push(`a breather ${a}-${pick.line}`);
    }
  }

  // the hats' growth by bar (its level: 1 the tick, 2 the pickups too), which the rota's ghosts keep off at 2: a hat
  // with ticks and pickups is busy enough under the hat
  const grown = new Map<number, number>();
  // ----- T07, the hats grow across the track -----
  if (on.has('grow') && T.closed && grooves.length >= R.grow.leastGrooves) {
    const G = R.grow;
    // (one small thing a groove that is heard: a groove whose top waited throughout grows nothing, and the next takes
    // the step it would have; so the hat never gains two things at once)
    let level = 0, heard = true;
    grooves.forEach((s, gi) => {
      if (gi < 1) return;
      if (heard) level++;
      heard = false;
      const g = level;
      const steps = g >= 2 ? [...G.tick.steps, ...G.pickup.steps] : G.tick.steps;
      const mask = Array.from({ length: 16 }, (_, i) => (G.tick.steps.includes(i) ? '+' : g >= 2 && G.pickup.steps.includes(i) ? 'p' : '.')).join('');
      const letters: Record<string, Letter> = { '+': { level: G.tick.level }, p: { level: G.pickup.level } };
      // runs of bars the hats are this growth's: never a bar another small thing edits the hats on, or a waiting top
      let a = -1;
      const flush = (z: number) => {
        if (a >= 0 && z > a) { heard = true; for (let b = a; b < z; b++) grown.set(b, g); }
        if (a >= 0 && z > a) add(`grow-${g}`, g >= 2 ? 'the hats grow: the pickups' : 'the hats grow: a tick on the beat', 'grow', a, z - a,
          { lanes: { closed: { mask: [mask] } }, letters });
        a = -1;
      };
      for (let b = s.startBar; b < s.startBar + s.bars; b++) {
        const mine = !touches(b, HATS) && !waiting.has(b) && !hats.has(b);
        if (mine && a < 0) a = b;
        if (!mine) flush(b);
      }
      flush(s.startBar + s.bars);
      if (heard) said.push(`the hats grow in groove ${gi + 1} (${steps.join(' ')})`);
    });
  }

  // ----- T01, the rota: a quiet player out or in for a phrase -----
  const clockOut = new Set<number>();
  if (on.has('rota')) {
    const Q = R.rota;
    const span = loom >= Q.bars.loomLong ? Q.bars.long : Q.bars.short;
    const gap = Q.gapBars.still + (Q.gapBars.shifting - Q.gapBars.still) * Math.max(0, Math.min(1, veil));
    const avail = (p: string) => (p === 'sixteenths' ? T.sixteenths : p === 'clock' ? on.has('clock') && T.open : p === 'ghosts' ? T.closed : false);
    const players = Q.players.filter(avail);
    const roleOf: Record<string, string[]> = { sixteenths: ['sixteenth'], clock: ['open', 'offbeat'], ghosts: ['closed', 'offbeat'] };
    let last: string | null = null as string | null;
    // the edges of the structural moves laid before the rota (their first bar and their line)
    const edges: number[] = [];
    for (const x of subs) if (x.top === 'breather' || x.top === 'second-drop' || x.top === 'steps') edges.push(x.startBar, x.startBar + x.bars);
    for (const s of grooves) {
      if (s.bars < Q.leastBars || !players.length) continue;
      const r = new Rng(`${I.seed}::top:rota:${s.index}`);
      // (the section's line is a change of its own: the first turn comes a phrase in at the soonest)
      let since = s.startBar + 8 - gap;
      for (let b = s.startBar + 8; b + span <= s.startBar + s.bars; b += 8) {
        if (b - since < gap) continue;
        // a phrase clear of every other in-or-out move's edge (a breather's, a second drop's), so two changes never
        // share a line
        if (edges.some((e) => Math.abs(e - b) < 8 || Math.abs(e - (b + span)) < 8)) continue;
        // the players free over the span, the last one played kept for when no other is
        const ok = players.filter((p) => free(b, b + span, roleOf[p]) && ![...Array(span).keys()].some((k) => waiting.has(b + k) || (p === 'ghosts' && (grown.get(b + k) ?? 0) >= 2)));
        if (!ok.length) continue;
        const pool: string[] = ok.length > 1 && last ? ok.filter((x) => x !== last) : ok;
        const pairs: Array<{ v: string; w: number }> = pool.map((x) => ({ v: x, w: leanOf(Q.leans, x, sp, C) }));
        const p: string = r.weighted(pairs);
        if (p === 'sixteenths') add('rota-sixteenths-out', 'the sixteenths step out', 'rota', b, span, { lanes: { sixteenth: { clear: 0 } } });
        else if (p === 'ghosts') add('rota-ghosts-in', 'ghost sixteenths under the hat', 'rota', b, span,
          { lanes: { closed: { mask: [maskOf(Q.ghosts.steps, 'g')] } }, letters: { g: { level: Q.ghosts.level } } });
        else for (let k = 0; k < span; k++) clockOut.add(b + k);
        take(b, b + span, false);
        said.push(`rota ${p} ${b}-${b + span}`);
        last = p;
        since = b + span;
        b = b + span - 8;
      }
    }
  }

  // ----- T09, the eighth-bar answer -----
  const answered = new Set<number>();
  if (on.has('answer') && T.backbeat) {
    const A = R.answer;
    const plays = new Rng(`${I.seed}::top:answer`).chance(Math.min(1, A.chance * leanOf(A.leans, 'on', sp, C)));
    if (plays) for (const s of grooves) {
      if (s.bars < A.leastBars) continue;
      for (let b = s.startBar + A.at; b < s.startBar + s.bars - 1; b += A.every) {
        if (drawnAt.has(b) || keep.has(b) || structural.has(b)) continue;
        add('eighth-bar-answer', 'the eighth-bar answer', 'answer', b, 1, {
          lanes: { backbeat: { clear: A.clap.step - 1, until: A.clap.step, mask: [maskOf([A.clap.step], 'a')] },
            ...(T.open ? { open: { mask: [maskOf([A.splash.step], 's')] } } : {}) },
          letters: { a: { level: A.clap.level }, s: { level: A.splash.level } },
        });
        answered.add(b);
      }
      if ([...answered].some((b) => b >= s.startBar && b < s.startBar + s.bars)) said.push(`the eighth-bar answer in ${s.kind} ${s.index}`);
    }
  }

  // ----- T03, the clock: one offbeat opens every four or eight bars -----
  if (on.has('clock') && T.open && T.closed) {
    const K = R.clock;
    const r = new Rng(`${I.seed}::top:clock`);
    const slot = K.slots[r.int(0, K.slots.length)];
    const period = loom >= K.period.loomLong ? K.period.long : K.period.short;
    let n = 0;
    for (const s of grooves) for (let k = 0; k < s.bars; k++) {
      const b = s.startBar + k;
      const atBar = slot < 8 ? k % period === 0 : k % period === period - 1;
      if (!atBar || touches(b, HATS) || structural.has(b) || clockOut.has(b) || answered.has(b)) continue;
      add('clock', 'the open hat marks the phrase', 'clock', b, 1, {
        lanes: { closed: { clear: slot, until: slot + 1 }, open: { mask: [maskOf([slot], 'O')] } },
        letters: { O: { level: K.level, chokeAfter: K.chokeAfter } },
      });
      n++;
    }
    if (n) said.push(`the clock on step ${slot} every ${period} (${n})`);
  }

  // ----- T02, the floor, and T10, the pulse: the breakdown's slope and its first phrase's holder -----
  let holder: TopHolder | null = null, slope: number | null = null;
  if (on.has('floor') && I.sections.some((s) => s.kind === 'breakdown')) {
    const F = R.floor;
    slope = Math.round(Math.max(F.slope.least, Math.min(F.slope.most, F.slope.hz * Math.exp(F.slope.zephyr * (bird('zephyr') - (C.zephyr ?? 0.5))))));
    const can: Record<TopHolder, boolean> = { floor: T.closed, backbeat: on.has('pulse') && T.backbeat, ticks: on.has('pulse') && T.closed, none: true,
      carry: on.has('pulse') && T.closed };
    const pairs = TOP_HOLDERS.filter((h) => can[h] && F.holders[h as Exclude<TopHolder, 'carry'>] > 0).map((h) => ({ v: h, w: F.holders[h as Exclude<TopHolder, 'carry'>] * leanOf(F.leans, h, sp, C) }));
    holder = pairs.length ? new Rng(`${I.seed}::top:holder`).weighted(pairs) : 'none';
    // T37 (round top-lanes pass 3, his ear 11-02: "after-half sounds good"): where the draw left the deep break beatless,
    // at a share (Loom leaning it: a long break is where a walk is missed) the hats carry it instead; "none" stays
    // possible, and a holder already drawn (the whisper, the backbeat alone, the ticks) is never displaced
    if (holder === 'none' && can.carry && new Rng(`${I.seed}::top:carry`).chance(Math.min(1, F.carry.share * leanOf(F.leans, 'carry', sp, C)))) holder = 'carry';
    said.push(`the break slopes from ${slope} Hz, held by ${holder}`);
  }

  subs.sort((a, b) => a.startBar - b.startBar || b.bars - a.bars);
  return { subs, hats, holder, slope, opens, summary: said.join(' · ') };
}

/** What the top form laid, in words, one move a line (after the composer settled it on the bars as laid). */
export function topSummary(P: Pick<TopFormPlan, 'subs' | 'holder' | 'slope'>): string {
  const words: string[] = [];
  const by = new Map<string, Array<{ a: number; z: number }>>();
  for (const x of P.subs) { const k = x.label; (by.get(k) ?? by.set(k, []).get(k)!).push({ a: x.startBar, z: x.startBar + x.bars }); }
  for (const [label, spans] of by) words.push(`${label}: ${spans.map((s) => (s.z - s.a > 1 ? `${s.a}-${s.z}` : `${s.a}`)).join(' ')}`);
  if (P.slope) words.push(`the break slopes from ${P.slope} Hz, its first phrase held by ${P.holder}`);
  return words.join(' · ');
}

/**
 * **The breakdowns' first phrases the holder takes**: each breakdown run's bars from its first to the first bar its own
 * hats or sixteenths play (the phrase `hatSections` leaves bare), at least `least` bars long, and never past the
 * breakdown's first phrase. (Integration of top-lanes and hats-level, 11-02: a theme whose groove plays no offbeat hat
 * keeps none in its breakdowns either, so the bare run is the whole breakdown; before T15 the holder found no hat there
 * to lay from, and T15's floor in the mains gave it one, so a holder ran on through every phrase into the drop.)
 */
export function holderStretches(sections: TopFormInput['sections'], topBars: (bar: number) => boolean, least = TOP_FORM.floor.least): TopBreak[] {
  const out: TopBreak[] = [];
  for (const s of sections) {
    if (s.kind !== 'breakdown') continue;
    const end = s.phrases?.find((p) => p.startBar > s.startBar)?.startBar ?? s.startBar + s.bars;
    let until = s.startBar;
    while (until < end && !topBars(until)) until++;
    if (until - s.startBar >= least) out.push({ from: s.startBar, until });
  }
  return out;
}
