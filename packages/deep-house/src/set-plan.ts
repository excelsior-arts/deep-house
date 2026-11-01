// The set's plan: which theme follows which, and where the seams fall.
//
// Pure. Nothing here builds a node, reads a context or touches a clock that is
// running: a master seed and a handful of options in, the whole layout of a set
// out — the themes, the instant each one starts on the set's grid, the bar every
// hand-over lands on, the curves the hand-over is going to write and the holes
// it cuts in the low end. A deck is what plays it (`packages/engine/src/deck.ts`), and the same
// value is what `tools/setplan.ts` predicts, what `tools/program.ts` locks and
// what `renderMix` lays a whole render out on.
//
// It was the first half of `src/mix.ts` until round E of PLAN-V1-NEXT, where
// that file was planning, time mapping, transition rules, graph ownership and
// offline layout at once. The arithmetic is that arithmetic, in the order it was
// in; what changed is that none of it can see a deck.
//
// MEASURED (49 well-formed transitions):
//   theme length   p10/p50/p90 = 79 / 145 / 247 bars — drawn, not fixed
//   transition     bimodal: ~70% short (8-16 bars, modal 8), ~30% long (32-64)
//   boundary       16 bars: 41% against 19% by chance, the strongest alignment
//   tempo          median change across a seam is exactly 0.00 BPM. One tempo
//                  for the mix, drifting ~0.1 BPM a minute, never in a seam
//   key            no harmonic mixing: Camelot compatibility is 20% against
//                  17% by chance and the interval histogram is flat. The next
//                  theme takes any root; the mode stays minor ~75% of the time
//   shape          the mix is built around a dip, not a crossfade: a -14 dB
//                  momentary dip while the average level holds within 2.3 dB
//                  of the flanks. So the seam sits in the outgoing theme's
//                  last breakdown and the incoming arrives as it empties —
//                  and in its last quarter, never before it: a theme has to
//                  play its own build, its drop and its closing groove alone
//                  before anything is mixed over them
//   kick           clean swap, never two; absent for part of the seam in two
//                  transitions out of three
//   sub            about 3 dB down through the seam in half of them
//   entry          no highpass-first: the highs lead in 47% of seams. A filter
//                  moves in about half of all mixes, direction a coin flip
//   effects        nothing dramatic: the flux peak is 1.7x the median

import { linkRaw } from './link-table.ts';
import { generate, resolveRoom, rollTempo, heldByZone } from './generator.ts';
import type { Track } from './generator.ts';
import { clone, mergeParams } from '@deep-house/engine/params';
import type { PlainTable } from '@deep-house/engine/params';
import { loudnessTrimDb, loudnessPlanOf, densityOf } from './loudness.ts';
import { classicRoles } from './roles.ts';
import { seamPlan, blendAsked, seamTempo, glideBarsFor, freeSides, freeSeamBars, isFree, splitSeamBars, listPull, SPLIT_SWAP_BARS, programOf, beatLed, BEAT_LED, BEAT_DRIVE } from './performance.ts';
import { HOLE_ALL, holeOfBus } from '@deep-house/engine/schedule';
import { clockAt, freeBlendSeconds, freeRingSeconds, FREE_BPM } from './musical-time.ts';
import { lengthMargin, type StylePlaces } from './places.ts';
import { makeSetClock } from '@deep-house/engine/set-clock';
import type { SetClock } from '@deep-house/engine/set-clock';
import type { SeamPlan } from '@deep-house/engine/program';
import type { CurveStep, SeamLine, SeamHole, SeamWrite } from '@deep-house/engine/program';
import type { Room, Style } from '@deep-house/engine/style';
import Rng from './rng.ts';
import { biasFor, tempoInFamily } from './spell.ts';
import { minutesBand, minutesAt, barsFor, namedShare, type LengthKnobs } from './length.ts';
import type { Spell } from './spell.ts';
import { switchOn } from './lanes.ts';
import { libraryTurn } from './library-draw.ts';
import type { Recipe } from './recipe.ts';
import type { Accompaniment } from './recipe-request.ts';
import type { Development } from './development.ts';
import { LOOKAHEAD } from '@deep-house/engine/clock';
import { keysShared, wheelRoot, rootOnWheel } from './theory.ts';


// Every number a set is laid out by is the **style's**, since round F of
// PLAN-V1-NEXT: the theme lengths, the bimodal blend, the 16-bar line, the
// skip, the filter move, the seam's two trims, where the bottom changes hands,
// the tempo glide, the key steps, the two hand-over groups and the seam floor
// itself. They were `MIX_DEFAULTS` here with their measurements beside them and
// they are `style.set` now, with the same comments.
//
// What is left here is the one default that is the machine's and not the
// music's: how far ahead the scheduler fills while the page is visible. The
// player raises it for a device that hands out a large output buffer.
export const ENGINE_DEFAULTS = { lookahead: LOOKAHEAD };

/**
 * The options a set is laid out under: the machine's defaults, the style's own
 * numbers over them, and the caller's over both. Every entry point below takes
 * `opts` and resolves it this way, so a caller may state a theme length or a
 * boundary and say nothing about the rest.
 */
/**
 * One of a strategy's switches — `src/lanes.ts`, beside the other read of what a
 * style declares about itself. It is re-exported here because this is where it
 * was until derive-lite and because `planTheme` below is one of its two callers;
 * the other is `generate`, which is why it could not stay in this module.
 */
export { switchOn };

export function setOptions(style: Style, opts: Partial<MixOptions> = {}): MixOptions {
  const o = { ...ENGINE_DEFAULTS, ...style.set, ...opts, style } as MixOptions;
  // a zone's inert birds held at its centre for the set's own reads too (PLAN-ZONES §3.4): its length, its tempo, its turn
  const held = heldByZone(style, o.spell);
  return held === o.spell ? o : { ...o, spell: held };
}

/**
 * **A planned theme, and the value the whole app passes around.**
 *
 * A `Track` is `generate`'s own answer — the notes, the sections, the room's
 * overrides, every die it rolled — and it is handed on here under the name
 * every caller imports from, because `src/mix.ts` is the door and a plan is
 * what comes through it. The machine has no shape for one and deliberately does
 * not: `Deck.track` in `packages/engine/src/deck.ts` is `any` because what a
 * plan *is* belongs to whoever composed it, and this package is whoever
 * composed it.
 *
 * A **`SetTrack`** is that value once a *set* has planned it. Four fields of a
 * `Track` are optional there and are optional for a reason — a single theme
 * rendered on its own has no place in a set, no blend and no seam — and
 * `planTheme` below is the one function that writes all four, so what it hands
 * back carries them and every reader of a set's plan can count on them. That is
 * the whole of the difference: a `SetTrack` is a `Track` that is in a set.
 */
export type SetTrack = Track & Required<Pick<Track, 'index' | 'blendBars' | 'filterMove' | 'trimDb'>>;

export type { Track };

/**
 * What a caller may hand `planTheme`, `setLayout` and `createMix` beside the
 * defaults. The three that are not in the table above are overrides a caller
 * supplies and the set never writes down: a stated theme length (the scene
 * suite renders sixteen-bar themes), the drift the set's tempo takes per
 * minute, and the room the set was asked for.
 */
export type MixOptions = Style['set'] & {
  /** the music the set is made of; every entry point takes it and passes it on */
  style: Style;
  /**
   * The composition strategy, by id — `house-v1` or `house-v2`
   * (`src/strategies/index.ts`). It is resolved to a `style` before anything
   * below reads it, so this is a label a set carries and never a second way of
   * asking what music is playing. Absent is the default, which is the record.
   */
  strategy?: string;
  /**
   * The eight birds, if a listener, a bench or a URL asked for any. Absent — and
   * it is absent everywhere the golden is planned — the house vector is used and
   * the bias above the dice is the identity. `src/spell.ts`.
   */
  spell?: Partial<Spell> | null;
  /** a tool's override of which voice plays a lane, by lane id; never a page's */
  lanes?: Record<string, string> | null;
  /** and the same hand on the three harmonic draws: see `GenerateOptions` */
  timbres?: { leadTimbre?: string; padTimbre?: string; stabTimbre?: string } | null;
  /**
   * The track recipe this set is cast under, where one was named or drawn
   * (`?recipe=<id>`, `?recipe=auto`). Its box has already become `spell`; what
   * travels with it is the rest of the row, whose `wants` the interpreter turns
   * into weights on the same lists the bias leans (`src/interpret.ts`). Absent
   * on every path the golden takes.
   */
  recipe?: Recipe | null;
  /** Explicit component assembly; absent preserves accepted recipe playback. */
  accompaniment?: Accompaniment;
  development?: Development;
  /** a tool's hand on which melody family states the theme: see `GenerateOptions` */
  motif?: { family?: string; register?: string; off?: boolean } | null;
  /** a tool's hand on the library a turn draws from: see `GenerateOptions` */
  library?: readonly Recipe[] | null;
  /**
   * **How far a library turn's row may leak beyond its place** (round D1,
   * `src/library-draw.ts`): 0 to 1, the style's own in its `set` (house-v2's
   * is 0, today's band) unless a private-tier hand asks for another. The
   * record draws no library row and never reads it.
   */
  reach?: number | null;
  /**
   * a tool's stated tempo for the theme, in place of the set's drawn one and its
   * drift — for a seam between two stated tempos rendered for an ear
   * (`renderMix`'s `plans`); never a page's, and absent on every path a lock takes
   */
  tempo?: number | null;
  lookahead: number;
  themeBars?: number;
  driftBpmPerMinute?: number;
  preset?: string;
  masterSeed?: string | number;
  /**
   * The page's query string, for a caller that is not a page: the strategy, the
   * spell and the recipe are all read off one of these, so a bench, a check and
   * a URL reach a set the same way. A page passes nothing and `location.search`
   * is read instead.
   */
  search?: string | null;
  /** the audio-only overrides `readBypass` answered with, or none */
  bypass?: Bypass | null;
  destination?: AudioNode;
  /**
   * The page's own call on each of the transport's ticks, after it has
   * scheduled (round audio-slack: the slowdown watch, `src/slowdown.ts`). It
   * reads two clocks and touches nothing the mix plays.
   */
  onTick?: () => void;
};


// Sample a value from a p10/p25/p50/p75/p90 ladder.
function fromPercentiles(rng: Rng, p: number[]): number {
  const q = rng.next();
  const xs = [0.1, 0.25, 0.5, 0.75, 0.9];
  if (q <= xs[0]) return p[0];
  if (q >= xs[xs.length - 1]) return p[p.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (q <= xs[i]) {
      const t = (q - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return p[i - 1] + t * (p[i] - p[i - 1]);
    }
  }
  return p[2];
}

// --- audio-only bypass switches -----------------------------------------
//
// Read off the page's query string so a listener can take one stage out of the
// chain and hear what it was doing. Every one of these is a *mixing* override:
// none of them touches a plan, so the notes are identical with the switch on
// or off and only the sound differs.
//
//   ?kickdrive=0  the kick's saturation        ?glue=0     the kick+bass glue
//   ?body=0       the bass's driven body       ?basscomp=0 the bass compressor
//   ?bassdrive=0  the bass drive in parallel, and where a place turned the
//                 roles round the line's own clip (round DUB-2: the grit twin)
//   ?push=0       the push macro               ?duck=0     the sidechain
//   ?limiter=0    the master limiter           ?clip=0     the soft clipper
//   ?sub=-3       the sub's level under its room, in dB, in place of the plan's step
//                 (-2, -5 or -6, `subTrimDb`)   ?all=0      every one of them
//   ?duckdb=-14   the melodic duck's depth, in dB (round EQ-2: his ear owns it):
//                 the held voices', the pads' pump
//   ?struckduckdb=-12  the struck voices' duck, in dB (round PIANO-2): the
//                 piano's, the plucks', the stabs' shallow dip after the strike
//   ?strings=1800 the strings' low-pass corner, in Hz (round EQ-2)
//   ?spark=0      the grain a place gives the voices, every part of it (SPARK-1)
//   ?sparkkeys=0  the keys' edge and strike   ?sparkpad=0  the strings' breath
//   ?sparkpiano=0 the piano's hammer and body ?sparkbus=0  the harmonic bus's edge
//   ?sparkstrike=0 the struck bars' click, where the edge does not read them (HF-NOISE)
//   ?sparkdrums=0 the drums' grain, every part (SPARK-2)  ?sparkhats=0 the hats' top, air and tail
//   ?sparkshaker=0 the shaker's air, tail and beads       ?sparkclap=0 the clap's crack
//   ?roles=classic the kick and the bass in the roles the room drew them in,
//                 where a place turned them round (round DUB-1, `roles.ts`):
//                 the voices swapped back, the line's sweep off it, the
//                 room's own duck and copy in parallel, the classic trim.
//                 The notes are the notes either way
//
const BYPASS = {
  kickdrive: { kick: { drive: 0 } },
  body: { bass: { drive: 0, even: 0, triangle: 0, octave: 0 } },
  push: { push: { satAmount: 0, bodyDb: 0, subDb: 0 } },
  limiter: { master: { limiter: { ceiling: 1 }, limiterFallbackDb: 0 } },
  clip: { master: { clipKnee: 0.999 } },
  glue: { master: { glue: { ratio: 1, drive: 0 } } },
  basscomp: { bass: { comp: { ratio: 1 } } },
  // The bass drive in parallel (round B1): a blend of nought is no copy built,
  // and a theme the places leave clean has nothing here to take out.
  bassdrive: { bass: { parallel: { blend: 0 } } },
  // Both depths: `depthDb` is the melodic duck and `lowDepthDb` is the bass's,
  // and a switch called `duck` that left the bass ducking 8 dB was not a
  // sidechain bypass, which made every A/B taken with it read wrong.
  duck: { sidechain: { depthDb: 0, lowDepthDb: 0, struckDepthDb: 0 } },
};

/**
 * What one reading of the query string asked to be taken out of the chain: the
 * overrides themselves, the sub's own trim in dB, and the line the console
 * says it in. `null` — which is every path the golden takes — is "nothing was
 * asked for".
 */
export interface Bypass {
  params: PlainTable | null;
  /** the sub's level under its room, in dB, in place of the plan's step; absent, the plan's */
  subDb?: number;
  label: string;
  /** the grain's parts taken out (round SPARK-1), as paths into the theme's room: an absent part is the record's sound */
  strip?: string[][];
  /** the roles a place turned round, put back (round DUB-1, `roles=classic`) */
  roles?: 'classic';
  /** the turned line's own clip taken out (round DUB-2: `bassdrive=0` where the line carries the drive) */
  noGrit?: true;
}

/**
 * **The grain's listening rows** (round SPARK-1): each takes one part a place
 * wrote out of the theme's room, so the voice plays exactly as it did before
 * the round, and `spark` takes all four. A path and not a value, because an
 * absent part is the record's graph and a part at nought would be a different
 * one (and not a whole part the engine admits).
 */
const GRAIN_ROWS: Record<string, string[][]> = {
  sparkkeys: [['keys', 'edge']],
  sparkpad: [['strings', 'breath']],
  sparkpiano: [['piano', 'grain']],
  sparkbus: [['harmonicEdge']],
  sparkstrike: [['malletStrike']],
};
GRAIN_ROWS.spark = Object.values(GRAIN_ROWS).flat();
// The drums' grain (round SPARK-2): the hats' three fields in the `hats` block
// and in each kit hat's, the shaker's three, the clap's crack. Not in `spark`,
// which is SPARK-1's harmonic grain; `sparkdrums` takes all three parts.
const HAT_GRAIN = ['top', 'air', 'tail'];
const DRUM_GRAIN_ROWS: Record<string, string[][]> = {
  sparkhats: [...HAT_GRAIN.map((f) => ['hats', f]), ...['hatTight', 'hatLoose', 'hatSizzle'].flatMap((id) => HAT_GRAIN.map((f) => [id, f]))],
  sparkshaker: ['shakerAir', 'shakerTail', 'shakerBeads'].map((f) => ['hats', f]),
  sparkclap: ['crack', 'crackHz', 'crackDecay'].map((f) => ['clap', f]),
};
DRUM_GRAIN_ROWS.sparkdrums = Object.values(DRUM_GRAIN_ROWS).flat();
Object.assign(GRAIN_ROWS, DRUM_GRAIN_ROWS);

export function readBypass(search?: string | null): Bypass | null {
  // Through the link's table (`src/link.ts`): every one of these is a row of
  // class `bypass`, kept on the address as given and never written.
  const q = { has: (k: string) => linkRaw(k, search) !== null, get: (k: string) => linkRaw(k, search) };
  const on: string[] = [];
  let params: PlainTable | null = null;
  const take = (name: string) => {
    params = mergeParams(params || {}, BYPASS[name as keyof typeof BYPASS]);
    on.push(name);
  };
  const off = (k: string) => q.has(k) && q.get(k) !== '1' && q.get(k) !== 'on';
  if (off('all')) Object.keys(BYPASS).forEach(take);
  else for (const k of Object.keys(BYPASS)) if (off(k)) take(k);
  // The sub is a level in dB under the theme's room rather than a switch, and
  // it replaces the plan's own step (round LOUD-2, `subTrimDb` in
  // lane-level.ts: -2, -5 or -6 by what competes with the sub), so `?sub=-6`
  // plays every theme six under its room whatever the rule chose, and `?sub=0`
  // plays the room's own level.
  const subDb = q.has('sub') ? Number(q.get('sub')) : NaN;
  const sub = Number.isFinite(subDb) && subDb >= -30 && subDb <= 12 ? subDb : null;
  if (sub != null) on.push(`sub ${sub > 0 ? '+' : ''}${sub} dB`);
  // Two numbers to listen between (round EQ-2), each a value and not a switch:
  // the melodic duck's depth (the bass's is left where it is) and the strings'
  // corner. Audio only, as every row here: the plan and its trim are the link's.
  const duckDb = q.has('duckdb') ? Number(q.get('duckdb')) : NaN;
  if (Number.isFinite(duckDb) && duckDb <= 0 && duckDb >= -30) {
    params = mergeParams(params || {}, { sidechain: { depthDb: duckDb } });
    on.push(`duck ${duckDb} dB`);
  }
  // ...and the struck voices' (round PIANO-2), its listening twin.
  const struckDb = q.has('struckduckdb') ? Number(q.get('struckduckdb')) : NaN;
  if (Number.isFinite(struckDb) && struckDb <= 0 && struckDb >= -30) {
    params = mergeParams(params || {}, { sidechain: { struckDepthDb: struckDb } });
    on.push(`struck duck ${struckDb} dB`);
  }
  const stringsHz = q.has('strings') ? Number(q.get('strings')) : NaN;
  if (Number.isFinite(stringsHz) && stringsHz >= 400 && stringsHz <= 8000) {
    params = mergeParams(params || {}, { strings: { cutoffHz: stringsHz } });
    on.push(`strings ${stringsHz} Hz`);
  }
  // The roles (round DUB-1): a word and not a switch, since `roles=0` would
  // read as the roles taken out, which is not what it plays.
  const roles = q.get('roles') === 'classic' ? 'classic' as const : null;
  if (roles) on.push('classic roles');
  const strip: string[][] = [];
  for (const [k, paths] of Object.entries(GRAIN_ROWS)) if (off(k)) { strip.push(...paths); on.push(k === 'spark' ? 'grain' : k === 'sparkdrums' ? 'drums grain' : k.replace('spark', 'grain ')); }
  if (!on.length) return null;
  // The bass's drive is the line's own clip where a place's roles took the
  // copy in parallel off (round DUB-2), so the switch takes that too.
  const noGrit = on.includes('bassdrive');
  return { params, ...(sub != null ? { subDb: sub } : {}), label: on.join(', '), ...(strip.length ? { strip } : {}), ...(roles ? { roles } : {}), ...(noGrit ? { noGrit: true as const } : {}) };
}

// Fold the bypass into one theme's audio-level overrides. The plan is not
// touched: `paramOverrides` is exactly the part of a track the golden snapshot
// leaves out.
export function applyBypass<T extends Track>(track: T, bypass: Bypass | null): T {
  if (!bypass) return track;
  // First, so every row after it takes the classic theme's stage out.
  if (bypass.roles === 'classic' && track.sound?.roles) {
    const back = classicRoles(track);
    track.events = back.events;
    track.paramOverrides = back.paramOverrides;
    track.sound = back.sound;
    if (back.trimDb != null) track.trimDb = back.trimDb;
  }
  // The turned line's clip (round DUB-2): the reese's `grit` switch at
  // nought on every note of the line the roles swapped in. Under
  // `roles=classic`, above, there is no turned line left to write it on.
  const turned = track.sound?.roles?.swapped;
  if (bypass.noGrit && turned) {
    const lines = new Set(Object.keys(turned));
    track.events = track.events.map((e) => e.layer === 'bass' && lines.has(e.voice) ? { ...e, p: { ...e.p, grit: 0 } } : e);
  }
  if (bypass.params) track.paramOverrides = mergeParams(track.paramOverrides, bypass.params);
  if (bypass.strip) {
    const room = mergeParams(track.paramOverrides, {}) as PlainTable;
    for (const path of bypass.strip) {
      let at: PlainTable | undefined = room;
      for (const k of path.slice(0, -1)) at = at && typeof at[k] === 'object' ? at[k] as PlainTable : undefined;
      if (at) delete at[path[path.length - 1]];
    }
    track.paramOverrides = room as typeof track.paramOverrides;
  }
  if (bypass.subDb != null) {
    // The room's own level is the planned one less the step the plan took.
    const level = mergeParams(clone(track.style.base), track.paramOverrides || {}).levels.sub;
    const room = level - (track.sound?.subDb ?? 0);
    track.paramOverrides = mergeParams(track.paramOverrides, { levels: { sub: room + bypass.subDb } });
  }
  return track;
}

export function themeSeed(masterSeed: string | number, n: number): string {
  return `${masterSeed}#${n}`;
}

// Which room theme n of a set is in, without generating it: the preset die is
// the theme seed's own, so this is the same roll `generate` makes, and a set
// that names a preset gets that one whatever the die says.
export function presetOfTheme(style: Style, masterSeed: string | number, n: number, asked = 'auto', spell: Partial<Spell> | null = null): Room {
  return resolveRoom(style, asked, new Rng(`${themeSeed(masterSeed, n)}::preset`), biasFor(spell, style));
}

// What `generate` is asked for theme n of a set — its seed, tempo, key and
// length and everything the set was handed — and the stream the set draws the
// theme's own numbers from, which `planTheme` goes on drawing after the theme
// is composed.
function themeAt(masterSeed: string | number, n: number, opts: Partial<MixOptions> & { style: Style }) {
  const style = opts.style;
  const o = setOptions(style, opts);
  const r = new Rng(`${masterSeed}::mix:${n}`);
  // **A length in minutes** (house-v2's `themeMinutes`, round L1): the seed's
  // place on the same ladder, one draw off the same stream as the bars it
  // replaces, so every later draw of `r` is where it was. Turned into bars
  // below, once the tempo the theme plays at is known.
  const byMinutes = !o.themeBars && !!o.themeMinutes;
  const ladder = byMinutes ? fromPercentiles(r, o.themeBarPercentiles) : 0;
  let bars = o.themeBars
    ? o.themeBars
    : byMinutes
      ? 0
      : Math.max(
          o.themeBarsMin,
          Math.min(o.themeBarsMax, Math.round(fromPercentiles(r, o.themeBarPercentiles) / 16) * 16)
        );

  // One tempo for the whole set. Read the ranges off the *base* settings
  // rather than a room's, which a preset may have narrowed, so a theme's tempo
  // does not depend on which preset happened to be applied last. A frozen
  // value since round C, so this costs no clone and nothing can write to it.
  const BASE = style.settings;
  // The spell above the dice, as the bias they read. At the house vector — and
  // with no spell asked for, which is the golden's case — every weight is 1 and
  // every range below is multiplied by 1, so this is the plan it always was.
  const bias = biasFor(o.spell, style);
  const RANGE = bias.ranges;
  let { bpm } = rollTempo(new Rng(`${masterSeed}::mix:tempo`), BASE.tempo, RANGE);
  // **A set has one tempo and one grid**, so the derived family is read here,
  // once, and never again per theme: `makeSetClock` pins every deck to this
  // number and a seam is a glide on it. The room drew its tempo out of its own
  // measured window above; `tempoInFamily` carries that draw into the band the
  // spell's pulse landed in, at the same position in the band, and at the house
  // family the two bands are the same pair of numbers and this is `bpm` to the
  // bit — which is what both of house-v2's digests check on fourteen themes.
  //
  // Before the drift and not after it: the drift is the session's own tenth of a
  // BPM a minute and belongs to whatever tempo the set is really running at.
  if (switchOn(style, 'derived')) bpm = tempoInFamily(bpm, bias.derived);
  // MEASURED: the change across a seam is exactly zero. The drift belongs to
  // the session, not the seam — about 0.1 BPM a minute.
  //
  // Said plainly, because it is not the elapsed time of the set: it is the
  // time `n` themes would take at the *median* length of 145 bars. A theme's
  // real length is drawn, so a set of short themes drifts faster in this
  // number than in the room. It stays that way on purpose — every plan in the
  // golden snapshot is pinned to it, and the drift it produces is a tenth of a
  // BPM between one theme and the next either way. What it never does any more
  // is break a seam: the set plays on one grid (`makeSetClock`) and a theme's
  // BPM is the tempo it is heading for, not the rate it is played at while
  // another theme is still up.
  //
  // **And it stops** where a style says (`driftMost`, house-v2's; the deep
  // review of 10-08, B15): the drift climbed for as long as the set ran and
  // faster the slower the tempo — 27191's set went 49 to 54.6 BPM over twenty
  // themes, eleven per cent. It climbs as before up to that share of the
  // tempo the set drew and holds there; the themes before it are unmoved.
  const medianThemeMinutes = (n * 145 * 4 * 60) / (bpm * 60 * 4);
  const drift = medianThemeMinutes * (o.driftBpmPerMinute ?? 0.1);
  bpm = Math.round((bpm + (o.driftMost != null ? Math.min(drift, o.driftMost * bpm) : drift)) * 10) / 10;
  if (opts.tempo && opts.tempo > 0) bpm = opts.tempo;
  // **The second clock** (PLAN-AMBIENT §4, C1): a place whose time says `free` plans its theme at the nominal 60 BPM,
  // asked here at the tempo the set drew (the place's address), so the minutes below become bars at 60 and
  // `generate` is told (`clock`) rather than asking again at 60. No shipped place says it.
  // Its place tables and its library are still read at the tempo drawn (`placeBpm`), as its metered self reads them.
  const free = switchOn(style, 'placeTables') && clockAt((style as Style & { places?: StylePlaces }).places, bias.spell, bpm) === 'free';
  const placeBpm = bpm;
  if (free) bpm = FREE_BPM;

  // **The minutes become bars at the tempo played** (L1): the band is the
  // derived state's (`minutesBand`, `src/length.ts`), the seed's place on the
  // set table's ladder — its tenth percentile the band's shortest, its
  // ninetieth its longest — says where in it, and `bars = minutes × bpm / 4` on
  // the four-bar grid is what is heard. So the seed's own tempo inside the
  // family's window changes the bars and not the minutes.
  //
  // S19's cut stays and keeps its job, which is *where* the bars come off: the
  // arrangement is drawn at the heard length over `themeTrim` and cut back to
  // it, the mains first, so the breakdowns, builds and drops keep the
  // proportions Eugene approved. The cut's own bounds (`themeTrimBars`) are the
  // band's business now and are not read on this path.
  let fit: number | null = null;
  if (byMinutes) {
    const P = o.themeBarPercentiles;
    // the rows are the style's (`length`, engine-data); a row a place's entry names (the struck voices' conversation, the
    // simplest ambient tone, round length-2b) by its share, read where the place's read stands at the place's address
    // (`placeBpm`), so a slide off it glides; the row with the largest share where several are named
    const K = (style as Style & { length?: LengthKnobs }).length;
    if (!K) throw new Error('set-plan: a style that rolls minutes needs its length rows (`length`)');
    const places = switchOn(style, 'placeTables') ? (style as Style & { places?: StylePlaces }).places : undefined;
    const named = places ? Object.keys(K.named).map((row) => ({ row, share: namedShare(lengthMargin(places, row, bias.spell, placeBpm), K) }))
      .filter((x) => x.share > 0).sort((a, b) => b.share - a.share)[0] ?? null : null;
    const band = minutesBand(bias.derived, K, named);
    const minutes = minutesAt(band, (ladder - P[0]) / (P[P.length - 1] - P[0]));
    fit = barsFor(minutes, bpm, K);
    bars = o.themeTrim ? Math.ceil(fit / o.themeTrim / 4) * 4 : fit;
  }

  // MEASURED: no harmonic mixing. The root moves anywhere; only the mode keeps
  // its bias. That is the record. house-v2 mixes in key since round MIX-X2
  // (`harmonicMixing`, `planKey` below): the same two draws off the same
  // stream, read as a step on the wheel and a mode.
  const { root, scaleName } = planKey(masterSeed, n, o, BASE.key.minorChance);

  // `generate` composes the theme; the four fields below are the set's own and
  // are written here, in this order, which is why what leaves this function is
  // a `SetTrack` and what arrives is a `Track` with those four still open. The
  // assertion states that arithmetic and widens nothing — every one of the four
  // is written before the plan is handed back.
  const args = {
    style,
    seed: themeSeed(masterSeed, n),
    preset: opts.preset || 'auto',
    bpm,
    ...(free ? { clock: 'free' as const, placeBpm } : {}),
    root,
    scaleName,
    bars,
    // **The cut** (house-v2's `themeTrim`, S19): the theme is drawn at the
    // table's length and the arrangement is cut to this share of it, the mains
    // giving their bars first. A stated length (`themeBars`) is never cut.
    fitBars: byMinutes
      ? fit
      : !o.themeBars && o.themeTrim
      ? Math.max(o.themeTrimBars ? o.themeTrimBars[0] : 16, Math.min(o.themeTrimBars ? o.themeTrimBars[1] : bars, Math.round((bars * o.themeTrim) / 4) * 4))
      : null,
    spell: o.spell,
    // A tool's hand on the lanes and on the harmonic draws, and nothing a page
    // passes: see `GenerateOptions`.
    lanes: opts.lanes ?? null,
    timbres: opts.timbres ?? null,
    recipe: opts.recipe ?? null,
    accompaniment: opts.accompaniment,
    development: opts.development,
    motif: (opts.motif as any) ?? null,
    // **The library's turn** (round GA1): one theme in three, by the set's own
    // rule (`libraryTurn`), asked only by a style that draws from the library.
    visit: switchOn(style, 'libraryDraw') && libraryTurn(masterSeed, n, o.spell ?? null),
    library: opts.library ?? null,
    // **How far that turn may reach** (round D1): the set's own, 0 at the style's.
    reach: o.reach ?? null,
  };
  return { args, o, r, RANGE };
}

/**
 * **Theme n's tempo, without composing it** (round pl-clock): the tempo `generate` is asked for, which is the plan's
 * own (`planTheme`'s `bpm`), and for a free theme the tempo its place was read at (its address). A playlist reads its
 * tracks' tempi through this rather than planning each one: a plan is 5 to 90 ms a track, this is the dice before it.
 */
export function themeTempo(masterSeed: string | number, n: number, opts: Partial<MixOptions> & { style: Style }): { bpm: number; free: boolean } {
  const { args } = themeAt(masterSeed, n, opts);
  const a = args as { bpm: number; clock?: 'free'; placeBpm?: number };
  return a.clock === 'free' ? { bpm: a.placeBpm ?? a.bpm, free: true } : { bpm: a.bpm, free: false };
}

/**
 * **The tail a record leaves on two clocks**, in seconds (round pl-clock): the free tail's law (`freeBlendSeconds`,
 * PLAN-AMBIENT §4.3) read at the record's own birds — Loom's presence, from the blend's start to its last new note,
 * and Tide's ring after it. A free theme carries the same two numbers on its plan (`blendSeconds`, `ringSeconds`);
 * a metered one is asked at its seam, so no plan carries a byte more.
 */
export function tailSeconds(spell: Partial<Spell> | null | undefined, style: Style): { blendSeconds: number; ringSeconds: number } {
  const birds = biasFor(spell ?? null, style).spell;
  return { blendSeconds: freeBlendSeconds(birds.loom, birds.tide), ringSeconds: freeRingSeconds(birds.tide) };
}

// The whole plan of theme n, pure and cheap: no audio, no context.
export function planTheme(masterSeed: string | number, n: number, opts: Partial<MixOptions> & { style: Style }): SetTrack {
  const style = opts.style;
  const { args, o, r, RANGE } = themeAt(masterSeed, n, opts);
  const track = generate(args) as SetTrack;
  track.index = n;
  // MEASURED: bimodal blend length, and a filter moves in half of all mixes.
  track.blendBars = Math.round(
    (r.chance(o.shortBlendChance * RANGE.shortBlendChance)
      ? r.weighted(o.shortBlendBars)
      : r.weighted(o.longBlendBars)) * RANGE.blendBars
  );
  track.filterMove = r.chance(o.filterMoveChance) ? (r.chance(0.5) ? 'close' : 'open') : null;
  // **A free theme's blend is its tail, in seconds** (PLAN-AMBIENT §4.3, C3; `freeBlendSeconds`): Loom's presence and
  // Tide's ring, in its own four-second bars rounded up, where the seam out of it is planned (`seamPlan`), with the
  // seconds beside them, which is what the seam out of it lays (`freeSeamBars`) and the ring `seamCurves` closes. The
  // draw above is still taken, so every later draw of the stream is where it was.
  if (isFree(track)) {
    const birds = biasFor(o.spell, style).spell;
    track.blendSeconds = freeBlendSeconds(birds.loom, birds.tide);
    track.ringSeconds = freeRingSeconds(birds.tide);
    track.blendBars = Math.max(2, Math.ceil(track.blendSeconds / track.barSeconds - 1e-9));
  }
  // How far this theme is from the record's target loudness, worked out from
  // the plan and nothing else — no render, no meter, no audio. It is a number
  // *beside* the plan and not in it: the events, the sections and the dice are
  // untouched, which is why the golden snapshot does not see it. `makeDeck` and
  // `renderTrack` both hand it to `buildGraph` as the theme's own
  // output gain, so the live decks, the offline mix and a single-track render
  // level the same way.
  //
  // **The theme's sum clip** (round drum-clip, `loudness.ts` `sumClipOf`) is planned with it, off the same read of the
  // same window (`loudnessPlanOf`), where the front rule moved a house window; beside the plan, in the room it is
  // built with, as the trim is.
  const { trimDb, sumClip, aimLufs, hitDb } = loudnessPlanOf(track, style);
  track.trimDb = trimDb;
  // ...and the kick and the clap set down where the loudest hit, not the body, held the trim (round loudness-place, round
  // 2, `loudness.ts` `clipPlan`): the room's levels as the theme plays them, less the hit's decibels, beside the plan
  const HIT = style.settings.loudness.density?.hit;
  if (HIT && hitDb > 0) {
    const now = (mergeParams(clone(style.base), track.paramOverrides || {}) as { levels: Record<string, number> }).levels;
    const down = Object.fromEntries(HIT.levels.filter((k) => Number.isFinite(now[k])).map((k) => [k, +(now[k] - hitDb).toFixed(3)]));
    track.paramOverrides = mergeParams(track.paramOverrides || {}, { levels: down });
  }
  if (aimLufs != null) track.aimLufs = aimLufs;
  // ...never over the place's ceiling, where the place states one (round DNB-3: the model does not see the place's lifts).
  const most = track.sound?.trimMostDb;
  if (most != null && track.trimDb > most) track.trimDb = most;
  if (sumClip) track.paramOverrides = mergeParams(track.paramOverrides || {}, { master: { sumClip } });
  // ...and the density its place asks (round loudness-place, `densityOf`: the beat-led band's drive made upstream)
  const density = densityOf(track, style);
  if (density) track.paramOverrides = mergeParams(track.paramOverrides || {}, { master: density });
  // **The trim under the classic roles** (round DUB-1): a theme whose place
  // turned the roles round carries the trim it would have had without them,
  // so `roles=classic` plays the theme as it was, level and all.
  if (track.sound?.roles) track.sound.roles.trimDb = loudnessTrimDb(classicRoles(track), style);
  return track;
}

/**
 * **The key of theme n**, without generating it. Two draws off the theme's own
 * key stream, in the order they have always been taken: one for the root and
 * one for the mode (minor at `minorChance`, dorian otherwise).
 *
 * The record reads the first as any root — MEASURED, the references do not
 * mix in key: Camelot compatibility 20 % against 17 % by chance. **House-v2
 * reads it as a step on the wheel** (round MIX-X2, `harmonicMixing`): the
 * wheel is the root of the minor key that sounds a key's notes (`wheelRoot`:
 * D dorian sits where A minor does), the step is drawn from `keySteps` —
 * nought, a fifth either way, and now and then a whole tone — and the root
 * is where that place lands in the mode drawn after it (`rootOnWheel`). So
 * the mode draw is the draw it was, theme nought's key is the key it was, and
 * every later theme is a neighbour of the one before it on the wheel as often
 * as the table says. A bird move keeps the theme's own key (the stream is the
 * theme's); this is what a *planned* seam hands between, and the harmonic
 * cross (`seamCurves`) is what catches the rest.
 */
export function planKey(masterSeed: string | number, n: number, o: MixOptions, minorChance: number): { root: number; scaleName: string } {
  // **The planner's boundary** (I01 of the review of 10-03): a theme is
  // a count from nought. Anything else is refused here by name, where it was a
  // stream named `mix:key:NaN` or a walk with no floor.
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`theme index ${String(n)} is not a whole number from nought`);
  // **A loop and not a recursion** (I01): theme n's key is theme n−1's moved by
  // n's own two draws, so it is walked up from theme nought — each theme's own
  // stream, its own two draws in their own order, exactly the keys the
  // recursion gave — and theme 9999 is ten thousand steps and not ten thousand
  // frames on the stack. Without harmonic mixing a theme's key is its own and
  // nothing before it is read.
  if (!o.harmonicMixing || n === 0) return ownKey(masterSeed, n, minorChance);
  let key = ownKey(masterSeed, 0, minorChance);
  for (let i = 1; i <= n; i++) {
    const kr = new Rng(`${masterSeed}::mix:key:${i}`);
    const step = kr.weighted(o.keySteps);
    const scaleName = kr.chance(minorChance) ? 'minor' : 'dorian';
    key = { root: rootOnWheel(wheelRoot(key.root, key.scaleName) + step, scaleName), scaleName };
  }
  return key;
}

/** A theme's key off its own stream alone: the record's, and theme nought's. */
function ownKey(masterSeed: string | number, n: number, minorChance: number): { root: number; scaleName: string } {
  const kr = new Rng(`${masterSeed}::mix:key:${n}`);
  const root = kr.int(0, 12);
  return { root, scaleName: kr.chance(minorChance) ? 'minor' : 'dorian' };
}

// --- the set, laid out ------------------------------------------------------

/** One hand-over of a set, as numbers: where it lands and how long it runs. */
export interface SetSeam {
  /** the theme handing over, and the one arriving */
  from: number;
  to: number;
  /** the bar of the outgoing theme it begins on, and how far through that is */
  bar: number;
  pct: number;
  /** the line it was quantised to, and whether it landed on one */
  boundary: number;
  onLine: boolean;
  /** the blend, in bars, and what a bar costs on the grid it is pinned to */
  bars: number;
  barSeconds: number;
  /** the instants: the seam begins, the low end changes hands, the seam ends */
  at: number;
  swapAt: number;
  end: number;
  /** what the theme wanted before the blend before it was allowed a say */
  natural: SeamPlan;
  /** a seam on two clocks (`seamTempo`'s `split`): the outgoing theme is held off the grid from `at`, and leaves by its tail */
  split?: { ringS: number };
}

/** A whole set, before anything makes a sound. */
export interface SetPlan {
  plans: SetTrack[];
  /** where each theme's first bar falls: the instant, and the beat of the set */
  starts: number[];
  startBeats: number[];
  /** each theme's beats to one beat of the grid (`seamTempo`): 1 but at double or half time */
  perBeats: number[];
  /** where a theme was held off the grid by a two-clock seam out of it (`Deck.held`), or null */
  helds: ({ from: number; at: number; rate: number } | null)[];
  seams: SetSeam[];
  clock: SetClock;
}

/**
 * How many bars into a blend the low end changes hands. GENRE: only one bass is
 * ever prominent, so the swap is a downbeat — eight bars in whatever the blend's
 * length, and never past its own halfway point.
 */
export const swapAfterBars = (blendBars: number, o: { swapAfterBars: number }) =>
  Math.max(1, Math.min(o.swapAfterBars, Math.floor(blendBars / 2)));
/** ...and on two clocks, four arriving bars in at the most (`SPLIT_SWAP_BARS`): the outgoing beat has already left */
export const splitSwap = <O extends { swapAfterBars: number }>(o: O): O => ({ ...o, swapAfterBars: Math.min(o.swapAfterBars, SPLIT_SWAP_BARS) });

/**
 * **The lead: how long the arriving theme is heard before its groove lands** (round mix-voices, his word 10-30: *"our
 * mixing became kind of too abrupt. Almost feels like one song quickly plugs to another one. I almost don't even hear
 * any ahead of time voices"*). A hand-over between two tracks (a playlist's, a hand's, every seam on two clocks)
 * swaps on the arriving theme's **phrase line**: its first phrase (eight bars at the house, sixteen at half time, four
 * on the slow side) is heard over the record before its groove lands, halved while it does not fit:
 *
 *   - no longer than `LEAD_MOST_S` (a phrase of a slow theme is as long as a listener waits for the next thing);
 *   - room after it where the record's voices linger (`seamShape`): a third of the blend where the two keys fit, two
 *     arriving bars where they do not (the record's harmony has gone at the lead's middle by the key rule, so the
 *     lead may take the blend). A first build left two bars whatever the keys, and over the grid the record's voices
 *     lingered a second less than before on two clocks;
 *   - and inside the record: it keeps a bar of its own past the swap, so the groove that carries the lead is there.
 *
 * Never shorter than the swap it replaces (`least`: four arriving bars on two clocks, the hand's fourteen seconds),
 * never the blend's last bar. Pure numbers, so the transport's forecast (`foresee`), the layout (`layOut`) and the
 * seam (`scheduleTransition`) read one answer.
 *
 * @param recordLeftS the record's seconds from the blend's first instant to its end, as heard (context seconds)
 * @param recordBarS a bar of the record, as heard
 */
export const LEAD_MOST_S = 20;
export function seamLead(bars: number, barSeconds: number, phrase: number, recordLeftS: number, recordBarS: number, least: number, related = false): number {
  const after = related ? Math.max(2, Math.ceil(bars / 3)) : 2;
  const fits = (L: number) => L * barSeconds <= LEAD_MOST_S + 1e-9 && bars - L >= after && L * barSeconds <= recordLeftS - recordBarS + 1e-6;
  let L = Math.max(1, Math.round(phrase));
  while (L > 1 && !fits(L)) L = Math.floor(L / 2);
  if (!fits(L) || L < least) L = least;
  return Math.max(1, Math.min(L, bars - 1));
}
/**
 * **The lead a hand-over between two tracks takes** (`seamLead`), for a record and an arriving plan: the arriving
 * phrase, inside the blend and inside the record. `foresee` reads it before the decks exist, `layOut` for a seam on two
 * clocks, `scheduleTransition` once the decks do.
 *
 * @param atInRecord the blend's first instant in the record's own seconds
 * @param recordRate the record's own seconds a context second
 */
export function leadFor(record: SetTrack, arriving: SetTrack, atInRecord: number, recordRate: number, bars: number, barSeconds: number, least: number,
  o: { harmonicCross?: { related: number } } = {}): number {
  const leftS = (record.bars * record.barSeconds - atInRecord) / recordRate;
  const lead = seamLead(bars, barSeconds, phraseBarsOf(arriving), leftS, record.barSeconds / recordRate, least, keysFit(record, arriving, o));
  // a longer lead is for the arriving voices: where its theme strikes no harmonic note in it (an intro of drums alone),
  // the swap stays where it was (a render: Drive - Cloudburst into Drive - Supercell, whose intro is a kick, only
  // lost the record's voices to it)
  const voices = programOf(arriving).events.some((e) => (e.bus === 'melodic' || e.bus === 'keys') && e.t < lead * arriving.barSeconds);
  return voices ? lead : least;
}
/** whether two themes' keys fit (the key rule): `related` notes of seven in common, or no harmonic cross in the style */
export const keysFit = (a: SetTrack, b: SetTrack, o: { harmonicCross?: { related: number } }): boolean =>
  !o.harmonicCross || keysShared(a.key, b.key) >= o.harmonicCross.related;
/** a theme's phrase in its own bars (the phrase map's), eight where it states none */
export const phraseBarsOf = (t: { phraseMap?: { time?: { phraseBars?: number } } }): number => Math.max(1, Math.round(t.phraseMap?.time?.phraseBars ?? 8));

/**
 * **How a hand-over between two tracks goes** (round mix-voices). Which of three ways is the record's: how beat-led it
 * is (`beatLed`) at the tempo it is heard at. The record's, because the rhythm that would stop is the record's: the
 * arriving groove lands at the swap whatever it is.
 *
 *   - **drive** (beat-led from 0.75; his word: *"we can't lose the rhythm when mixing"*): the record's kick and top
 *     percussion carry the tempo to the swap; its bass, the weight, goes as the arriving voices come in;
 *   - **lift** (beat-led, 0.5-0.75): its kick goes with the bass and its top percussion carries; where it has none,
 *     its kick does;
 *   - **deep** (under 0.5; slow and deep places, ambient): its drums and bass go first, on the blend's first instant
 *     (a phrase line), like going into its last breakdown; its pads and keys ring, the arriving theme comes in on its
 *     intro's voices, and its groove lands on its phrase line. A beatless bridge, allowed here, where it has a bed:
 *     the arriving voices in the lead, with the record's where the keys fit, or two arriving voices where they do not.
 *     Otherwise a deep record goes the lift way: an intro of drums alone has nothing to bridge on, and with unrelated
 *     keys the record's harmony crosses out, so the arriving intro stands alone and must be a bed (two voices at least).
 *
 * **The carrier** (beat-led ways): what keeps the tempo audible to the swap, where the grooves change hands. The
 * record's top percussion where it strikes in three bars of four of the lead, else its kick, else (on two clocks: no
 * other grid is heard) the arriving theme's own top percussion from the first instant.
 *
 * **The key rule.** Where the two keys share fewer notes than `related` (six of seven: the same key, a fifth either
 * way, the same root in the other mode), two beds would clash for the whole lead and linger, so the harmony belongs to
 * one side at a time: the record's for the lead's first half, the arriving theme's from its middle (`crossAt`), crossed
 * over the harmonic cross's bars with the record's harmony filtered as it goes, and no linger of the record's harmony
 * past the swap. Related keys keep both through the lead and the record's lingers.
 */
export type SeamWay = 'drive' | 'lift' | 'deep';
export interface SeamShape {
  way: SeamWay;
  /** the record's reading (`beatLed`) at the tempo heard */
  beatLed: number;
  /** arriving bars from the blend's first instant to the swap (`seamLead`) */
  lead: number;
  /** what keeps the tempo audible before the swap: the record's top percussion or its kick, the arriving theme's top, or nothing (a deep bridge) */
  carrier: 'drums' | 'kick' | 'arriving' | 'none';
  /** whether the two keys share `related` notes (the key rule) */
  related: boolean;
  /** on two clocks */
  split: boolean;
  /** whether the arriving theme strikes a harmonic note in the lead: where it does not, nothing crosses before the swap */
  voices: boolean;
}
type ShapeProgram = { events: ReadonlyArray<{ t: number; bus: string; layer?: string }> };
export function seamShape(x: {
  from: SetTrack; to: SetTrack; fromProgram?: ShapeProgram; toProgram?: ShapeProgram;
  /** the tempo the record is heard at */
  fromBpm: number; bars: number; barSeconds: number; split: boolean; lead: number;
  /** the blend's first instant in each theme's own seconds, and each one's own seconds a context second */
  atInFrom: number; atInTo: number; fromRate: number; toRate: number;
  o: MixOptions;
}): SeamShape {
  const { from, to, lead, barSeconds } = x;
  const fp = x.fromProgram ?? programOf(from), tp = x.toProgram ?? programOf(to);
  const leadS = lead * barSeconds;
  // the record's own bars of the lead, and which of them strike on a bus
  const fromBar = from.barSeconds;
  const a0 = x.atInFrom, a1 = x.atInFrom + leadS * x.fromRate;
  const leadBars = Math.max(1, Math.round((a1 - a0) / fromBar));
  const barsOn = (bus: string) => {
    const on = new Set<number>();
    for (const e of fp.events) if (e.bus === bus && e.t >= a0 - 1e-9 && e.t < a1) on.add(Math.floor((e.t - a0) / fromBar + 1e-9));
    return on.size / leadBars;
  };
  const bedOf = (p: ShapeProgram, t0: number, t1: number) => new Set(p.events.filter((e) => (e.bus === 'melodic' || e.bus === 'keys') && e.t >= t0 - 1e-9 && e.t < t1).map((e) => e.layer)).size;
  const harmonic = (p: ShapeProgram, t0: number, t1: number) => p.events.some((e) => (e.bus === 'melodic' || e.bus === 'keys') && e.t >= t0 - 1e-9 && e.t < t1);
  const b0 = x.atInTo, b1 = x.atInTo + leadS * x.toRate;
  // the bridge is the arriving theme's voices: drums dropped for a record's pads alone are a long breakdown with nothing
  // arriving in it (a render: Vibe - Pure Gold into Vibe - Solar Wind, whose intro is its drums alone, left 11 s of
  // Takeoff's pads 8 dB under the flanks); a record whose arriving theme brings no voice keeps its top to the swap
  const bridge = harmonic(tp, b0, b1);
  const bl = beatLed(from, x.fromBpm).value;
  const related = keysFit(from, to, x.o);
  const drums = barsOn('drums'), kick = barsOn(x.o.swapGroup);
  let way: SeamWay = bl >= BEAT_DRIVE ? 'drive' : bl >= BEAT_LED ? 'lift' : 'deep';
  // a beatless bridge needs a bed: the arriving voices, and the record's with them. Where the keys do not fit the
  // record's harmony crosses out, so the arriving intro must be a bed on its own, two voices (layers) at least, or a
  // record with drums keeps its top to the swap. Two renders: Vibe - Aurora into Vibe - Night Side, Night Side's intro a
  // lone pad, sat 8-14 dB under the flanks for seven seconds; Vibe - Deep Dive into Vibe - Drizzle, its intro
  // keys, pad and effects, bridged at the flanks' level with the limiter idle, where Deep Dive's drums kept on loaded
  // it in half the lead (0.54 against 0.08)
  if (way === 'deep' && (!bridge || (!related && Math.max(drums, kick) >= 0.5 && bedOf(tp, b0, b1) < 2))) way = 'lift';
  const carrier: SeamShape['carrier'] = way === 'deep' ? 'none'
    : drums >= 0.75 ? 'drums' : kick >= 0.75 ? 'kick' : 'arriving';
  return { way, beatLed: bl, lead, carrier, related, split: x.split, voices: bridge };
}

/**
 * The whole of a set from its master seed: every theme, where it starts, and
 * every hand-over between them, on one grid that is pinned through a blend and
 * glides to the arriving theme's tempo once the theme it replaced has gone.
 *
 * This is the one layout. `renderMix` renders it, `tools/setplan.ts` predicts
 * it for the scene gate, `tools/program.ts` locks the curves it writes and
 * `tools/check.ts` sweeps nine hundred pairs of it. It used to be written
 * twice — once in `renderMix` and once in the tool that predicted `renderMix` —
 * and the two were held together by a gate comparing them; they are the same
 * function since round E and there is nothing left to drift.
 */
export function setLayout(masterSeed: string | number, themes = 3, opts: Partial<MixOptions> & { style: Style; listBpm?: number | null }): SetPlan {
  const o = setOptions(opts.style, opts);
  const plans: SetTrack[] = [];
  for (let i = 0; i < themes; i++) {
    plans.push(planTheme(String(masterSeed), i, { ...o, themeBars: o.themeBars || undefined }));
  }
  return layOut(plans, opts.listBpm != null ? { ...o, listBpm: opts.listBpm } : o);
}

/**
 * **A set of stated themes, laid out**: what `setLayout` does with a seed's own
 * themes, for any list of plans — two themes of two seeds, or of one seed
 * under two spells, which is a hand's move rendered offline for an ear
 * (`renderMix`'s `plans`). Each seam takes the tempo rule (`seamTempo`): a
 * drift glides as it always has, a near move glides by its ratio after the
 * blend, a half or double one is counted at two to one, and a far one rides
 * the outgoing theme to the new tempo over the bars before the seam's line and
 * blends there, so the line `seamPlan` chose is still where the blend begins.
 */
export function layOut(plans: SetTrack[], opts: Partial<MixOptions> & { style: Style; seams?: ({ bar: number; bars: number } | null)[]; entries?: number[];
  listBpm?: number | null; spells?: (Partial<Spell> | null)[] }): SetPlan {
  const o = setOptions(opts.style, opts);
  // **The tempo each theme is played at** (round pl-clock): its own, or a playlist's clock where one is stated and
  // pulls it (`listPull`); a free theme's is its own nominal one. The grid is aimed at this and the plans are untouched.
  const playBpm = (t: SetTrack): number => (isFree(t) ? t.bpm : listPull(t.bpm, opts.listBpm) ?? t.bpm);
  const playBeat = (t: SetTrack): number => 60 / playBpm(t);
  const clock = makeSetClock(playBeat(plans[0]), 0);
  // (a stated entry of the first theme, a render that opens inside it, is its first bar on the grid before nought)
  const startBeats = [-(opts.entries?.[0] ?? 0) / plans[0].beat];
  const starts = [0];
  const perBeats = [1];
  const helds: ({ from: number; at: number; rate: number } | null)[] = plans.map(() => null);
  const seams: SetSeam[] = [];
  // where a free theme's second nought falls (`Deck.zeroAt`): it is counted by offset, never by the grid
  const zeros: number[] = [-(opts.entries?.[0] ?? 0)];
  let free = 0;
  for (let i = 0; i < plans.length - 1; i++) {
    const t = plans[i];
    const b0 = startBeats[i];
    const m = perBeats[i];
    // a beat of the grid, in this theme's seconds (`gridBeat` of a deck)
    const g = t.beat * m;
    const own = isFree(t), z = zeros[i];
    const themeTimeAt = own ? (time: number) => time - z : (time: number) => (clock.beatAt(time) - b0) * g;
    const contextTimeAt = own ? (themeTime: number) => z + themeTime : (themeTime: number) => clock.timeAt(b0 + themeTime / g);
    // A stated seam — a hand's move rendered for an ear, `renderMix`'s
    // `seams` — or the one the plan puts there.
    const told = opts.seams?.[i];
    const p = told
      ? { at: told.bar * t.barSeconds, bar: told.bar, bars: told.bars, boundary: 1 }
      : seamPlan(t, blendAsked(t), {
        boundaryBars: o.boundaryBars,
        notBefore: Math.max(0, themeTimeAt(free)),
        style: o.style,
      });
    // The tempo the outgoing theme is heard at as the seam is reached, and
    // what the rule does with the arriving one's.
    const heard = own ? t.bpm : (60 / clock.spbAt(clock.beatAt(contextTimeAt(p.at)))) * m;
    const rule = seamTempo(heard, playBpm(plans[i + 1]), o, freeSides(t, plans[i + 1]));
    // A far jump rides first: the bars before the line, from no earlier than
    // the blend before it ended, onto the arriving theme's own tempo. (No rule
    // asks for one since round pl-clock: a far seam is two clocks.)
    if (rule.ride > 0) {
      const from = Math.max(themeTimeAt(free), p.at - rule.ride * t.barSeconds);
      const beats = (p.at - from) / g;
      if (beats > 0) clock.glide(clock.beatAt(contextTimeAt(from)), playBeat(plans[i + 1]) * m, beats);
    }
    const at = contextTimeAt(p.at);
    const gridBar = (clock.spbAt(clock.beatAt(at)) * 4) / m;
    // A seam with a free side (`seamTempo`'s `free`): into a free theme the grid is pinned and holds; out of one it
    // jumps to the arriving theme's own tempo where the blend begins, and the blend is the free theme's seconds on
    // the bar it is counted in (`freeSeamBars`). **A seam on two clocks** (`split`, round pl-clock) is the second
    // case for a metered record: it is held off the grid where the blend begins, at the tempo it is heard at, and the
    // grid jumps under it; the blend is its own tail's seconds (`tailSeconds`) on the arriving bar.
    const split = rule.kind === 'split';
    const tail = split ? tailSeconds(opts.spells?.[i] ?? o.spell, t.style ?? o.style) : null;
    const freeSeam = rule.kind === 'free'
      ? freeSeamBars(t, plans[i + 1], p.bars, gridBar)
      : split ? splitSeamBars(p.bars, gridBar, tail!.blendSeconds, playBeat(plans[i + 1]) * 4) : null;
    if (split) helds[i] = { from: p.at, at, rate: clock.spbAt(clock.beatAt(at)) / g };
    if (freeSeam?.jump) clock.jump(clock.beatAt(at), playBeat(plans[i + 1]));
    const barSeconds = freeSeam && freeSeam.jump ? freeSeam.barSeconds : (clock.pin(clock.beatAt(at)) * 4) / m;
    const bars = freeSeam ? freeSeam.bars : p.bars;
    const seamBar = freeSeam ? freeSeam.barSeconds : barSeconds;
    const end = at + bars * seamBar;
    seams.push({
      from: i,
      to: i + 1,
      bar: p.bar,
      pct: p.bar / t.bars,
      boundary: p.boundary,
      onLine: p.bar % p.boundary === 0,
      bars,
      barSeconds: seamBar,
      at,
      // on two clocks a hand-over between two tracks: the arriving phrase line (`leadFor`), as `scheduleTransition` lays it
      swapAt: at + (split ? leadFor(t, plans[i + 1], p.at, 1 / helds[i]!.rate, bars, seamBar, swapAfterBars(bars, splitSwap(o)), o)
        : swapAfterBars(bars, o)) * seamBar,
      end,
      natural: seamPlan(t, blendAsked(t), { boundaryBars: o.boundaryBars, style: o.style }),
      ...(split ? { split: { ringS: tail!.ringSeconds } } : {}),
    });
    const mIn = freeSeam?.jump || rule.kind === 'free' ? 1 : m * rule.perBeat;
    // and where the arriving theme enters: its first bar, or a stated second
    // of it (`renderMix`'s `entries`: a move in place)
    startBeats.push(clock.beatAt(at) - (opts.entries?.[i + 1] ?? 0) / (plans[i + 1].beat * mIn));
    starts.push(at);
    zeros.push(at - (opts.entries?.[i + 1] ?? 0));
    perBeats.push(mIn);
    free = end;
    // A free side glides nothing after the blend: the grid holds where the metered theme left it, or already runs at
    // the arriving one's own tempo. Nor does a seam on two clocks: the grid is the arriving theme's from its first beat.
    if (rule.kind === 'free' || split) continue;
    // What is left after the blend, over its own length: sixteen bars for a
    // drift, a bar a percent for a near move, nothing for a far one.
    const target = playBeat(plans[i + 1]) * mIn;
    const left = clock.spbAt(clock.beatAt(end)) / target;
    clock.glide(clock.beatAt(end), target, Math.max(1, (glideBarsFor(left, o) * 4) / mIn));
  }
  return { plans, starts, startBeats, perBeats, helds, seams, clock };
}

// --- what a hand-over writes ------------------------------------------------
//
// MEASURED: the mix is built around a dip rather than a crossfade. The seam
// sits in the outgoing theme's last breakdown, so the level the listener hears
// dips while the incoming theme fills the hole; the average across the seam is
// only 2.3 dB below the flanks.
//
//   at                     the incoming starts, full band, fading up
//   at .. swapAt           both play; the outgoing's sub is 3 dB down and the
//                          incoming has no bass at all
//   swapAt (8 bars in)     the low end changes hands on a downbeat, with a bar
//                          of no kick on either side of it
//   swapAt .. end          the incoming is the record; the outgoing is a
//                          harmonic layer over it, easing away
//   end                    the outgoing is gone
//
// All of it is numbers here and nodes in `packages/engine/src/deck.ts`. A seam's curves are
// functions of the time since it began, so the runtime writes them from
// whatever instant it is standing at — the seam's own start in ordinary play,
// the present moment when a pause or a reload landed inside the blend — and the
// line says where it had reached either way.

// What a hand-over *is* — a line of points on a named parameter, a hole in a
// deck's event list — is the machine's contract and not this style's: round W
// of PLAN-V1-NEXT moved the four shapes to `@deep-house/engine/program`, where
// `writeSeam` reads them. What stays here is every number in them.

/**
 * What a seam needs to know that is a property of the moment rather than of the
 * plan: where the swap falls on each deck's own clock, what a bar of the
 * outgoing theme costs, and where the sum's gain stands as the curve is written.
 */
export interface SeamMoment {
  at: number;
  bars: number;
  barSeconds: number;
  swapAt: number;
  filterMove: string | null;
  /** a bar of the outgoing theme, in its own seconds */
  outgoingBar: number;
  /** the swap in each deck's own theme seconds */
  swapInFrom: number;
  swapInTo: number;
  /** where the sum stands, or null when there is no sum to dip */
  sumGain: number | null;
  /**
   * whether each deck plays a kick at all (`playsKick`); absent is both, which
   * is every seam inside one set
   */
  fromKick?: boolean;
  toKick?: boolean;
  /**
   * the two themes' keys, for the harmonic cross (`set.harmonicCross`, round
   * MIX-X2); absent, a seam under that rule treats them as unrelated
   */
  fromKey?: { root: number; scale: number[] };
  toKey?: { root: number; scale: number[] };
  /**
   * **The outgoing theme is free** (PLAN-AMBIENT §4.3, the second clock): its tail thins (`FREE_TAIL_CURVES`), and
   * `ringS` is its ring, Tide's (`ringSeconds` on the plan). Absent on every seam out of a metered theme, which writes
   * what it always wrote.
   */
  freeTail?: { ringS: number; rate?: number; beatOut?: boolean };
  /**
   * **A hand-over between two tracks** (round mix-voices, `seamShape`): the way, the lead, the carrier and the key
   * rule; with the blend's first instant in each deck's own seconds. Absent on the set's own beat-matched seams, which
   * write what they always wrote.
   */
  shape?: SeamShape;
  atInFrom?: number;
  atInTo?: number;
  /** each track's aim (`aimLufs` on the plan, round loudness-place): a hand-over whose step is past the cap glides the arriving one in (`ENTRY_GLIDE`) */
  fromAimLufs?: number;
  toAimLufs?: number;
}

/**
 * **A free side's tail, as a change and not a hold** (his ear 10-18: the 77 s tail "too long ... use general wisdom
 * on humans perception of change patience, not strictly follow machine settings"). What a listener hears as a long
 * overlap is how long it stays the same, so from the moment the arriving theme enters the free side keeps leaving,
 * the way a DJ takes an ambient outro down under a beat: the top first, as the arriving hats take it; the low end at
 * the swap, as every seam does; then its level, linear in decibels so every second is the same audible step, and its
 * voices one at a time, so something changes every few seconds:
 *
 *   at .. swap     the top closes from open to `swapHz`; the level holds (the sum's trim makes the room)
 *   swap           the low end changes hands; the free side's percussion (`drums`) plays no new note
 *   swap .. last   the level falls to `lastDb` and the top to `lastHz`; halfway, at -12 dB, the calls (`keys`) leave
 *   last           no new note at all (`end` less the ring): the pad's notes and the rooms ring on
 *   last .. end    the ring, Tide's: what rings closes to nothing and the top to `goneHz`
 *
 * Every hole drops a note's onset and never cuts one, so each voice leaves on its own last envelope. Numbers of the
 * mix, not of the music, as the seam's other numbers are: a free side's alone, which no seam out of a metered theme
 * reads. The tail's seconds are the birds' (`freeBlendSeconds`); these say only how it leaves inside them.
 */
export const FREE_TAIL_CURVES = Object.freeze({ swapHz: 6000, lastHz: 1200, goneHz: 500, lastDb: -24 });

/**
 * **A metered record leaving on two clocks** (round pl-clock; the DJ's rule: never two kicks, or two hat grids, at two
 * tempi at once). The free tail above, with the grooves changing hands whole: a seam whose decks keep their own clocks
 * (`seamTempo`'s `split`) is a hand-over and not a beat-matched blend, so one groove plays at a time and the swap is
 * where it changes hands:
 *
 *   at             the arriving theme enters at its own tempo, fading up on its top alone: its percussion (`drums`),
 *                  kick and bass held for the swap; the record plays on, groove and all, its top starting to close
 *   swap           four arriving bars in (`SPLIT_SWAP_BARS`): the arriving groove lands whole, and the record's
 *                  percussion, bass and calls (`keys`) play no new note (its kick a bar before, as on every seam)
 *   swap .. last   the record's pads' last notes under the arriving groove, its level falling to `lastDb` and its top
 *                  to `lastHz`
 *   last .. end    the ring, Tide's
 *
 * It was first written with the record's beat leaving at the blend's first instant, and a render said no (seed 4 at
 * bar 32 into seed 14): a record whose bar is mostly its beat left 8 s at -35 to -45 dB before the arriving kick. The
 * seconds are the free tail's law at the record's own birds (`tailSeconds`), the same patience a listener has for a
 * pad under a groove. Written by the free tail's own lines (`freeTail` with `beatOut`); the record's own seconds run at
 * the rate it was held at (`rate`).
 */


function pointLine() {
  const pts: CurveStep[] = [];
  return {
    pts,
    set(v: number, t: number) { pts.push({ v, t, k: 'set' }); return this; },
    lin(v: number, t: number) { pts.push({ v, t, k: 'lin' }); return this; },
    exp(v: number, t: number) { pts.push({ v, t, k: 'exp' }); return this; },
  };
}

/**
 * Every curve a hand-over writes and every hole it cuts, as values. The order
 * of the lines is the order they have always been written in, which is what
 * `tools/program.ts` locks.
 */
export function seamCurves(m: SeamMoment, o: MixOptions): SeamWrite {
  if (m.shape) return handOverCurves(m, m.shape, o);
  const { at, bars, barSeconds, swapAt } = m;
  const end = at + bars * barSeconds;
  const lines: SeamLine[] = [];
  const holes: SeamHole[] = [];
  const line = (deck: 'from' | 'to' | 'sum', param: string, points: CurveStep[]) =>
    lines.push({ deck, param, points });
  // The bus the low end leaves by is the group it belongs to: one name, and the
  // hole and the trim cannot come apart.
  const subGain = `buses.${o.bassGroup}.dry.gain`;

  // Two decks at full fader is +6 dB into one master, and what that sounds
  // like on a record whose peaks are the bass is an overdriven low end for the
  // whole length of the blend. The sum comes down while both are playing, and
  // MEASURED this is also what the references do: the average level across a
  // seam sits about 2.3 dB below the flanks.
  if (m.sumGain != null) {
    const sumTrim = Math.pow(10, o.seamSumTrimDb / 20);
    line('sum', 'gain', pointLine()
      .set(m.sumGain, at)
      .lin(sumTrim, at + barSeconds)
      .set(sumTrim, end - barSeconds)
      .lin(1, end).pts);
  }
  const trim = Math.pow(10, o.seamSubTrimDb / 20);

  // The incoming arrives full-band: the highs lead the sub in only 47% of
  // measured seams, so there is no highpass-first rule to apply.
  line('to', 'fader.gain', pointLine()
    .set(0.0001, at)
    .exp(1, at + Math.min(4, bars / 3) * barSeconds).pts);

  // Only one bass is ever prominent. The incoming's sub is muted until the
  // swap bar, and its own events in that stretch are dropped so nothing has to
  // be faded out mid-note.
  line('to', subGain, pointLine()
    .set(0.0001, at)
    .set(0.0001, swapAt)
    .lin(1, swapAt + barSeconds * 0.25).pts);
  // In the arriving theme's own seconds — the two decks are on one grid, so
  // this is exactly its eighth bar. A hair is taken off the end so the
  // downbeat the bass changes hands on is not itself excluded.
  holes.push({ deck: 'to', group: o.bassGroup, gap: [0, m.swapInTo - 1e-6] });

  // (on two clocks the grooves change hands whole at the swap: `beatOut`, below)
  const beatOut = !!m.freeTail?.beatOut;
  line('from', subGain, pointLine()
    .set(1, at)
    .lin(trim, at + barSeconds)
    .set(trim, swapAt)
    .lin(0.0001, swapAt + barSeconds * 0.25).pts);

  // MEASURED: the kick plays through the whole transition in only a third of
  // them. A bar without one at the swap is normal, and it is also how two
  // kicks are guaranteed never to overlap.
  //
  // **Only where there are two kicks to overlap** (the fault pass of 09-24).
  // A drummed theme arriving over a drone had its kick holed from its first
  // bar to the swap with no other kick anywhere — eight bars of a groove with
  // no bottom, its entry sounding like its own breakdown, and then the kick
  // dropped in at the swap: the "clear audible drop" of Ember 50 → 120. So the
  // arriving theme's kick is holed only when the outgoing one plays a kick, and
  // the outgoing one's only when the arriving one does: a drummed theme
  // arriving after a drone enters on its kick, and a drone arriving after a
  // drummed theme leaves that theme its kick to fade out on. Two drones, or two
  // drummed themes — every seam inside one set — hole exactly as they did.
  const both = m.fromKick !== false && m.toKick !== false;
  const neither = m.fromKick === false && m.toKick === false;
  const rate = m.freeTail?.rate ?? 1;
  if (both || neither || m.toKick) holes.push({ deck: 'from', group: o.swapGroup, gap: [m.swapInFrom - m.outgoingBar, Infinity] });
  // **On two clocks the arriving theme's percussion waits for the swap too** (round pl-clock): the record's groove
  // plays on to it, so two hat grids at two tempi never sound together; the arriving theme comes in on its top alone
  if (beatOut) holes.push({ deck: 'to', group: holeOfBus('drums'), gap: [0, m.swapInTo - 1e-6] });
  if (both || neither || m.fromKick) holes.push({ deck: 'to', group: o.swapGroup, gap: [0, m.swapInTo - 1e-6] });

  // MEASURED: a filter moves in about half of all mixes, direction a coin
  // flip, and nothing at the seam is dramatic.
  if (m.filterMove === 'close' && !m.freeTail) {
    line('from', 'lp.frequency', pointLine()
      .set(20000, at)
      .exp(o.outgoingLpHz, end).pts);
  } else if (m.filterMove === 'open') {
    line('to', 'hp.frequency', pointLine()
      .set(o.outgoingHpHz, at)
      .exp(18, at + Math.max(2, bars / 2) * barSeconds).pts);
  }

  if (m.freeTail) {
    // **A free side leaves as a change** (`FREE_TAIL_CURVES`): top, low end, level and voices, then its ring.
    const F = FREE_TAIL_CURVES;
    const ring = Math.max(0, Math.min(m.freeTail.ringS, (end - swapAt) / 2));
    const last = end - ring;
    // a free deck's seconds are the context's one to one, so its own seconds are the swap's plus the distance; a held
    // metered one's run at the rate it was held at
    const own = (t: number) => m.swapInFrom + (t - swapAt) / rate;
    line('from', 'lp.frequency', pointLine()
      .set(20000, at)
      .exp(F.swapHz, swapAt)
      .exp(F.lastHz, last)
      .exp(F.goneHz, end).pts);
    line('from', 'fader.gain', pointLine()
      .set(1, swapAt)
      .exp(Math.pow(10, F.lastDb / 20), last)
      .exp(0.0002, end)
      .lin(0, end + 0.02).pts);
    if (beatOut) {
      // the record's groove — its percussion, its bass — and its calls leave as the arriving groove lands
      holes.push({ deck: 'from', group: o.bassGroup, gap: [own(swapAt), Infinity] });
      holes.push({ deck: 'from', group: holeOfBus('drums'), gap: [own(swapAt), Infinity] });
      holes.push({ deck: 'from', group: holeOfBus('keys'), gap: [own(swapAt), Infinity] });
    } else {
      holes.push({ deck: 'from', group: holeOfBus('drums'), gap: [own(swapAt), Infinity] });
      holes.push({ deck: 'from', group: holeOfBus('keys'), gap: [own((swapAt + last) / 2), Infinity] });
    }
    holes.push({ deck: 'from', group: HOLE_ALL, gap: [own(last), Infinity] });
  }

  // Once the bottom has changed hands the outgoing theme is a harmonic layer
  // over someone else's groove, so it eases away rather than standing at full
  // level until the last bar.
  if (!m.freeTail) {
    const tailFrom = Math.max(at, end - 2 * barSeconds);
    const fromFader = pointLine();
    if (swapAt < tailFrom) fromFader.set(1, swapAt).lin(0.55, tailFrom);
    // The outgoing theme's last two bars close down to the same place. When the
    // seam itself is a closing filter, the ramp above is already on its way
    // there and there is nothing to add: what used to be added was the
    // parameter's *current* value written in as an event two bars from the end —
    // `.value` is where the filter is now, not where it will be — which flattened
    // the whole close into those two bars.
    if (m.filterMove !== 'close') {
      line('from', 'lp.frequency', pointLine()
        .set(20000, tailFrom)
        .exp(o.outgoingLpHz, end).pts);
    }
    fromFader
      .set(swapAt < tailFrom ? 0.55 : 1, tailFrom)
      .exp(0.0002, end)
      .lin(0, end + 0.02);
    line('from', 'fader.gain', fromFader.pts);
  }

  // **The harmonic cross is short, the rhythmic cross is long** (round MIX-X2;
  // Eugene, 10-02: *"for a significant time — 4–6 s — users may experience
  // overlaid voices from different keys"*). The fader above crosses every
  // layer of the outgoing theme over the whole blend, and MEASURED on the
  // worst seams that is the two themes' pads and keys sounding together for
  // five to seven seconds of an eight-bar blend and for most of a long one.
  // Where the two keys share fewer notes than `related` of seven (a fifth
  // apart or the same root in the other mode share six; a semitone or a
  // tritone apart share two), the harmonic sum of each deck — `harmonic.gain`,
  // the engine's seam gain after the melodic bus — takes its own curve: the
  // outgoing pads and keys fade over the `fadeBars` before the low end changes
  // hands and are gone at the swap, and the arriving ones are held at nothing
  // until the `crossBars` before it and are full on the swap's downbeat, so
  // the two harmonies cross over that bar and never longer. The drums, the
  // hats, the sends' rooms and the bass hole cross as they always have.
  // Related keys keep the blend as it is: the pad over the new groove is the
  // record's own mix. The rule is both engines' (`set.harmonicCross` in
  // `deep-house.ts`): a seam is mixing, not the music.
  //
  // **And the outgoing harmony is filtered as it fades** (round MIX-X4, the
  // filter MIX-X2 declined while the record was a byte). The engine's close
  // after the seam gain — `harmonicLp.frequency`, built on the deck the first
  // time this line names it — goes from open at the fade's start to `lpHz`
  // exponentially, landing **where the cross begins** and held through it, so
  // the pads have lost their top before the arriving chords come in: MEASURED
  // (`tools/seam-overlap.ts`, the crossing seams of 19, 28, 26 and 27191) a
  // close landing at the swap instead left the outgoing harmony at the cross
  // bar's start 1 dB under the gain alone above a kilohertz, since by then it
  // had only reached 1.6 kHz; landing at the cross bar it is 9 to 11 dB under
  // above a kilohertz and 20 dB under above two, with the same nought seconds
  // of two harmonies both above -20 or -30 dB. Where the fade is the cross bar
  // alone it closes over that bar to the swap. A hand's seam (`handSeam`)
  // crosses on its own bars and the close follows the same ones.
  const cross = o.harmonicCross;
  if (cross && (!m.fromKey || !m.toKey || keysShared(m.fromKey, m.toKey) < cross.related)) {
    const fadeFrom = Math.max(at, swapAt - cross.fadeBars * barSeconds);
    const crossFrom = Math.max(fadeFrom, swapAt - cross.crossBars * barSeconds);
    const fromHarmonic = pointLine().set(1, at);
    if (fadeFrom > at) fromHarmonic.set(1, fadeFrom);
    if (crossFrom > fadeFrom) fromHarmonic.lin(0.3, crossFrom);
    fromHarmonic.exp(0.0001, swapAt).lin(0, swapAt + 0.02);
    line('from', 'harmonic.gain', fromHarmonic.pts);
    const toHarmonic = pointLine().set(0.0001, at);
    if (crossFrom > at) toHarmonic.set(0.0001, crossFrom);
    toHarmonic.exp(1, swapAt);
    line('to', 'harmonic.gain', toHarmonic.pts);
    line('from', 'harmonicLp.frequency', pointLine().set(20000, fadeFrom).exp(cross.lpHz, crossFrom > fadeFrom ? crossFrom : swapAt).pts);
  }

  return { at, end, swapAt, bars, lines, holes };
}

/**
 * **A hand-over between two tracks, written** (round mix-voices; `seamShape` says which way and why). His word 10-30:
 * the arriving voices *"heard earlier and more clearly before the swap"*, the leaving ones lingering after it, and in a
 * beat-led place *"we can't lose the rhythm when mixing"*. Against the curves before it, which a render measured: the
 * arriving theme rose from -80 dB on an exponential line over four bars (-40 dB halfway, -20 at three quarters), so on
 * two clocks its voices were near silence until the bar before the swap; the record fell in decibels from the swap.
 *
 *   at             the arriving theme rises to `inDb` over its first bar and is full at the lead's middle, on its
 *                  sustained voices (the melodic bus: pads, pianos, beds) and, on one clock in a beat-led place, its
 *                  top percussion; its kick and bass wait for the swap. The record: deep, its kick, drums and bass go
 *                  (a beatless bridge on its voices); on two clocks beat-led, its bass goes (the weight), and at lift
 *                  its kick too where its top percussion carries; on one clock beat-led it plays on whole, as every
 *                  beat-matched seam.
 *   lead's middle  the arriving theme's rhythmic voices (the keys bus: riffs, plucks, calls) come in; on two clocks the
 *                  record's leave there, so a riff over another tempo's beat runs half a phrase at most, and never two
 *                  at once. Unrelated keys cross their harmony here (`seamShape`'s key rule).
 *   swap           on the arriving phrase line (`seamLead`): its groove lands whole; the record's groove has gone (its
 *                  kick a bar before, or a beat before where the kick alone carried).
 *   swap .. hold   the record's voices linger at full level, its top at `swapHz` on two clocks: the first half of what
 *                  is left of the blend before its ring (one clock: before its last two bars)
 *   hold .. end    and fall as before: to -24 dB and 1.2 kHz, then the ring (two clocks); to 0.55 and closing (one).
 *
 * The blend's length is the one it was (the free tail's law on two clocks, the hand's on one: his word 10-18, the tail
 * "too long"); this is what is heard inside it. The sum's trim is every seam's.
 */
export const HANDOVER_CURVES = Object.freeze({ inDb: -6, lingerShare: 0.5 });

/**
 * **The entry glide** (round loudness-place, the design's fifth decision; his word 10-30: *"playlist could be assembled
 * wildly, even a mix of ambient, vibe and drive … we need to take this loudness rules accurately"*). Alone, a track
 * plays at its own aim (a link is a promise), and a playlist's arc is its order's: Ambient → Vibe → Drive rises about
 * 5 dB over two hours, as a set rises into its dance part. What a listener's knob does not forgive is a step at one
 * hand-over: so neighbours may differ by at most `capDb` at the flanks of a hand-over, and an arriving track whose aim
 * is further from the record's than that enters within `capDb` of it and glides to its own aim over its first phrase
 * after the swap (`bars` of the grid, linear in decibels, on its fader): the DJ's lift into the dance part, and the
 * settle out of it. The record is never pulled toward the arrival: its ending is the one it was planned with. The
 * playlist's tempo pull's sibling, and just as small: a glide of 3 dB over 16 bars is not heard as motion.
 */
export const ENTRY_GLIDE = Object.freeze({ capDb: 2.5, bars: 16 });

/** The decibels the arriving track enters under (or over) its own aim at a hand-over (`ENTRY_GLIDE`), nought within the cap. */
export function entryOffsetDb(fromAim: number | null | undefined, toAim: number | null | undefined): number {
  if (fromAim == null || toAim == null || !Number.isFinite(fromAim) || !Number.isFinite(toAim)) return 0;
  const step = toAim - fromAim, cap = ENTRY_GLIDE.capDb;
  return Math.abs(step) > cap ? +(-(step - Math.sign(step) * cap)).toFixed(3) : 0;
}

function handOverCurves(m: SeamMoment, s: SeamShape, o: MixOptions): SeamWrite {
  const { at, bars, barSeconds: bar, swapAt } = m;
  const end = at + bars * bar;
  const lines: SeamLine[] = [];
  const holes: SeamHole[] = [];
  const line = (deck: 'from' | 'to' | 'sum', param: string, points: CurveStep[]) => lines.push({ deck, param, points });
  const subGain = `buses.${o.bassGroup}.dry.gain`;
  const deep = s.way === 'deep', two = s.split;
  // each deck's own seconds at a context instant: straight through the blend's first instant and the swap
  const ownOf = (t0In: number, t1In: number) => (t: number) => (swapAt > at ? t0In + ((t - at) * (t1In - t0In)) / (swapAt - at) : t1In + (t - swapAt));
  const own = ownOf(m.atInFrom ?? m.swapInFrom - (swapAt - at), m.swapInFrom);
  const toOwn = ownOf(m.atInTo ?? 0, m.swapInTo);
  // the lead's middle, on an arriving bar: the rhythmic voices, and the harmony where the keys do not fit
  const half = Math.min(swapAt, at + Math.max(1, Math.floor(s.lead / 2)) * bar);

  if (m.sumGain != null) {
    const sumTrim = Math.pow(10, o.seamSumTrimDb / 20);
    line('sum', 'gain', pointLine().set(m.sumGain, at).lin(sumTrim, at + bar).set(sumTrim, end - bar).lin(1, end).pts);
  }

  // the arriving theme: heard from its first bar, full by the lead's middle; where its aim is past the cap from the
  // record's, full at the record's aim within the cap, and to its own over its first phrase after the swap (`ENTRY_GLIDE`)
  const enter = entryOffsetDb(m.fromAimLufs, m.toAimLufs), top = Math.pow(10, enter / 20);
  const inAt = Math.min(at + bar, half);
  const toFader = pointLine().set(0.0001, at).exp(top * Math.pow(10, HANDOVER_CURVES.inDb / 20), inAt);
  const full = half > inAt + 1e-6 ? half : inAt + bar / 2;
  toFader.lin(top, full);
  if (enter) toFader.set(top, Math.max(full, swapAt)).exp(1, Math.max(full, swapAt) + ENTRY_GLIDE.bars * bar);
  line('to', 'fader.gain', toFader.pts);
  // its low end and its kick land at the swap, as on every seam
  line('to', subGain, pointLine().set(0.0001, at).set(0.0001, swapAt).lin(1, swapAt + bar * 0.25).pts);
  holes.push({ deck: 'to', group: o.bassGroup, gap: [0, m.swapInTo - 1e-6] });
  holes.push({ deck: 'to', group: o.swapGroup, gap: [0, m.swapInTo - 1e-6] });
  // its top percussion: at the swap where another grid is heard or the bridge is beatless, else from the first bar
  const toDrumsAt = deep || (two && s.carrier !== 'arriving') ? swapAt : at;
  if (toDrumsAt > at) holes.push({ deck: 'to', group: holeOfBus('drums'), gap: [0, toOwn(toDrumsAt) - 1e-6] });
  // its rhythmic voices from the lead's middle
  if (half > at) holes.push({ deck: 'to', group: holeOfBus('keys'), gap: [0, toOwn(half) - 1e-6] });

  // the record's low end: deep, it goes with the drums at the first instant; on two clocks beat-led, the weight goes
  // over the bar before the lead's middle, where the arriving voices take over; on one clock beat-led it is trimmed to
  // the swap, as every seam
  // (deep, where the keys do not fit, the record's groove leaves where its harmony crosses: its drums dropped under its
  // own voices alone left the lead's first half 8-10 dB under the flanks on Vibe - Aurora into Vibe - Night Side)
  // (and where the arriving theme brings no voice to the lead, the harmony crosses at the swap, as on every seam)
  const crossing = !!o.harmonicCross && !s.related;
  const crossAt = s.voices === false ? swapAt : half;
  const voicesAt = crossing ? Math.max(at, crossAt - o.harmonicCross!.crossBars * bar) : at;
  if (deep || two) {
    const goes = deep ? voicesAt : Math.max(at, half - bar);
    line('from', subGain, pointLine().set(1, at).set(1, goes).lin(0.0001, goes + bar).pts);
    holes.push({ deck: 'from', group: o.bassGroup, gap: [own(goes), Infinity] });
  } else {
    const trim = Math.pow(10, o.seamSubTrimDb / 20);
    line('from', subGain, pointLine().set(1, at).lin(trim, at + bar).set(trim, swapAt).lin(0.0001, swapAt + bar * 0.25).pts);
  }
  // its kick
  const kickFrom = deep ? own(voicesAt) : two && s.way === 'lift' && s.carrier === 'drums' ? own(half)
    : s.carrier === 'kick' ? m.swapInFrom - m.outgoingBar / 4
    : m.swapInFrom - m.outgoingBar;
  if (deep || two || m.toKick !== false) holes.push({ deck: 'from', group: o.swapGroup, gap: [kickFrom, Infinity] });
  // its top percussion: out first where deep; to the swap on two clocks; on under the arriving groove on one
  if (deep) holes.push({ deck: 'from', group: holeOfBus('drums'), gap: [own(voicesAt), Infinity] });
  else if (two) holes.push({ deck: 'from', group: holeOfBus('drums'), gap: [own(swapAt), Infinity] });
  // its rhythmic voices: on two clocks one side's at a time
  if (two) holes.push({ deck: 'from', group: holeOfBus('keys'), gap: [own(half), Infinity] });

  // its level and its top: whole to the swap, lingering for a share of what is left, then falling as before
  const share = HANDOVER_CURVES.lingerShare;
  if (m.freeTail) {
    const F = FREE_TAIL_CURVES;
    const ring = Math.max(0, Math.min(m.freeTail.ringS, (end - swapAt) / 2));
    const last = end - ring;
    const hold = swapAt + (last - swapAt) * share;
    line('from', 'lp.frequency', pointLine().set(20000, at).exp(F.swapHz, swapAt).set(F.swapHz, hold).exp(F.lastHz, last).exp(F.goneHz, end).pts);
    line('from', 'fader.gain', pointLine().set(1, at).set(1, hold).exp(Math.pow(10, F.lastDb / 20), last).exp(0.0002, end).lin(0, end + 0.02).pts);
    holes.push({ deck: 'from', group: HOLE_ALL, gap: [own(last), Infinity] });
  } else {
    const tailFrom = Math.max(swapAt, end - 2 * bar);
    const hold = swapAt + (tailFrom - swapAt) * share;
    const fader = pointLine().set(1, at).set(1, hold);
    if (tailFrom > hold + 1e-6) fader.lin(0.55, tailFrom);
    fader.exp(0.0002, end).lin(0, end + 0.02);
    line('from', 'lp.frequency', pointLine().set(20000, tailFrom).exp(o.outgoingLpHz, end).pts);
    line('from', 'fader.gain', fader.pts);
  }

  // the key rule: one side's harmony at a time where the keys do not fit, crossed over the cross's bar into the lead's
  // middle (the record's whole before it: a render of the hand's longer fade left a 4-5 dB dip in the lead's first half)
  // (linear in gain over the cross, the two harmonies -3 dB each at its middle: the exponential pair of the record's
  // seams left both near -40 dB there, a hole of a second or two in a slow theme's long bar, Ambient - Nebula Breath
  // into Ambient - Pulsar)
  const cross = o.harmonicCross;
  if (cross && crossing) {
    const crossFrom = voicesAt;
    const fromHarmonic = pointLine().set(1, at);
    if (crossFrom > at) fromHarmonic.set(1, crossFrom);
    fromHarmonic.lin(0.0001, crossAt).lin(0, crossAt + 0.02);
    line('from', 'harmonic.gain', fromHarmonic.pts);
    const toHarmonic = pointLine().set(0.0001, at);
    if (crossFrom > at) toHarmonic.set(0.0001, crossFrom);
    toHarmonic.lin(1, crossAt);
    line('to', 'harmonic.gain', toHarmonic.pts);
    line('from', 'harmonicLp.frequency', pointLine().set(20000, crossFrom).exp(cross.lpHz, crossAt).pts);
  }
  return { at, end, swapAt, bars, lines, holes };
}

export { makeSetClock };
export default setLayout;
