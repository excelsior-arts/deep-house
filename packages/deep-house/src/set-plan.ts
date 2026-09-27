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
import { generate, resolveRoom, leadTimbreOfTheme, rollTempo } from './generator.ts';
import type { Track } from './generator.ts';
import { clone, mergeParams } from '@deep-house/engine/params';
import type { PlainTable } from '@deep-house/engine/params';
import { loudnessTrimDb } from './loudness.ts';
import { seamPlan, blendAsked, seamTempo, glideBarsFor } from './performance.ts';
import { makeSetClock } from '@deep-house/engine/set-clock';
import type { SetClock } from '@deep-house/engine/set-clock';
import type { SeamPlan } from '@deep-house/engine/program';
import type { CurveStep, SeamLine, SeamHole, SeamWrite } from '@deep-house/engine/program';
import type { Room, Style } from '@deep-house/engine/style';
import Rng from './rng.ts';
import { biasFor, tempoInFamily } from './spell.ts';
import type { Spell } from './spell.ts';
import { switchOn } from './lanes.ts';
import type { Recipe } from './recipe.ts';
import type { Accompaniment } from './recipe-request.ts';
import type { Development } from './development.ts';
import { LOOKAHEAD } from '@deep-house/engine/clock';


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
  return { ...ENGINE_DEFAULTS, ...style.set, ...opts, style } as MixOptions;
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
//   ?push=0       the push macro               ?duck=0     the sidechain
//   ?limiter=0    the master limiter           ?clip=0     the soft clipper
//   ?sub=-3       the sub's level, in dB       ?all=0      every one of them
//
const BYPASS = {
  kickdrive: { kick: { drive: 0 } },
  body: { bass: { drive: 0, even: 0, triangle: 0, octave: 0 } },
  push: { push: { satAmount: 0, bodyDb: 0, subDb: 0 } },
  limiter: { master: { limiter: { ceiling: 1 }, limiterFallbackDb: 0 } },
  clip: { master: { clipKnee: 0.999 } },
  glue: { master: { glue: { ratio: 1, drive: 0 } } },
  basscomp: { bass: { comp: { ratio: 1 } } },
  // Both depths: `depthDb` is the melodic duck and `lowDepthDb` is the bass's,
  // and a switch called `duck` that left the bass ducking 8 dB was not a
  // sidechain bypass, which made every A/B taken with it read wrong.
  duck: { sidechain: { depthDb: 0, lowDepthDb: 0 } },
};

/**
 * What one reading of the query string asked to be taken out of the chain: the
 * overrides themselves, the sub's own trim in dB, and the line the console
 * says it in. `null` — which is every path the golden takes — is "nothing was
 * asked for".
 */
export interface Bypass {
  params: PlainTable | null;
  subDb: number;
  label: string;
}

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
  // The sub is a trim in dB rather than a switch, and it is applied to
  // whatever level the preset ended up at, not to the base one.
  const subDb = q.has('sub') ? Number(q.get('sub')) : NaN;
  const trim = Number.isFinite(subDb) && subDb !== 0 ? subDb : 0;
  if (trim) on.push(`sub ${trim > 0 ? '+' : ''}${trim} dB`);
  if (!on.length) return null;
  return { params, subDb: trim, label: on.join(', ') };
}

// Fold the bypass into one theme's audio-level overrides. The plan is not
// touched: `paramOverrides` is exactly the part of a track the golden snapshot
// leaves out.
export function applyBypass<T extends Track>(track: T, bypass: Bypass | null): T {
  if (!bypass) return track;
  if (bypass.params) track.paramOverrides = mergeParams(track.paramOverrides, bypass.params);
  if (bypass.subDb) {
    const level = mergeParams(clone(track.style.base), track.paramOverrides || {}).levels.sub;
    track.paramOverrides = mergeParams(track.paramOverrides, { levels: { sub: level + bypass.subDb } });
  }
  return track;
}

export function themeSeed(masterSeed: string | number, n: number): string {
  return `${masterSeed}#${n}`;
}

/**
 * Was theme `n` of this set an organ theme? Asked of the lead the theme really
 * plays.
 *
 * This is the other half of round K5a's `avoidOrgan` switch, and it is what
 * makes the rule *not twice running* rather than *never*: the flag `generate`
 * takes is "the theme before this one was an organ", and only the set knows
 * what the theme before this one was.
 *
 * It asked the raw die until the review of 09-24 (R37): a pure function of the
 * theme's seed, and not the draw `generate` makes — the hold lean under a
 * minimal density and the drone in front's redraw both move it — so it
 * answered wrongly on 46 of 1200 themes and let seed 123 play two organs
 * running. It asks `leadTimbreOfTheme` now, which is `generate`'s own code up
 * to the lead and no further, with the set's own arguments for that theme.
 *
 * The rule composes without a walk over the whole set: refusing the organ only
 * ever takes it away, so a theme whose lead is not an organ when nothing is
 * refused is not an organ theme, whatever came before it. Only a theme that
 * would lead with the organ asks about the one before it — the organ is about
 * one draw in ten, and a run of two is one in a hundred.
 *
 * A style whose `avoidOrgan` switch is off never asks: `switchOn` is checked
 * before this is called, and under house-v1 the rule has never run at all,
 * which is the fifth reachability fact at the head of `deep-house.ts`.
 */
export function organTheme(masterSeed: string | number, n: number, opts: Partial<MixOptions> & { style: Style }): boolean {
  if (n < 0) return false;
  const { args } = themeAt(masterSeed, n, opts);
  if (leadTimbreOfTheme({ ...args, avoidOrgan: false }) !== 'organ') return false;
  return !organTheme(masterSeed, n - 1, opts) || leadTimbreOfTheme({ ...args, avoidOrgan: true }) === 'organ';
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
// is composed. Everything but the organ rule, which is asked of these.
function themeAt(masterSeed: string | number, n: number, opts: Partial<MixOptions> & { style: Style }) {
  const style = opts.style;
  const o = setOptions(style, opts);
  const r = new Rng(`${masterSeed}::mix:${n}`);
  const bars = o.themeBars
    ? o.themeBars
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
  const medianThemeMinutes = (n * 145 * 4 * 60) / (bpm * 60 * 4);
  bpm = Math.round((bpm + medianThemeMinutes * (o.driftBpmPerMinute ?? 0.1)) * 10) / 10;
  if (opts.tempo && opts.tempo > 0) bpm = opts.tempo;

  // MEASURED: no harmonic mixing. The root moves anywhere; only the mode keeps
  // its bias. Key compatibility is available as a flag and off by default.
  const kr = new Rng(`${masterSeed}::mix:key:${n}`);
  let root: number;
  if (o.harmonicMixing && n > 0) {
    const prev = planRoot(masterSeed, n - 1, o);
    root = (prev + kr.weighted(o.keySteps)) % 12;
  } else {
    root = kr.int(0, 12);
  }
  const scaleName = kr.chance(BASE.key.minorChance) ? 'minor' : 'dorian';

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
    root,
    scaleName,
    bars,
    // **The cut** (house-v2's `themeTrim`, S19): the theme is drawn at the
    // table's length and the arrangement is cut to this share of it, the mains
    // giving their bars first. A stated length (`themeBars`) is never cut.
    fitBars: !o.themeBars && o.themeTrim
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
  };
  return { args, o, r, RANGE };
}

// The whole plan of theme n, pure and cheap: no audio, no context.
export function planTheme(masterSeed: string | number, n: number, opts: Partial<MixOptions> & { style: Style }): SetTrack {
  const style = opts.style;
  const { args, o, r, RANGE } = themeAt(masterSeed, n, opts);
  const track = generate({
    ...args,
    // `dice('timbre:again')`, the fifth reachability fact: the rule that a set
    // never runs two organ themes back to back. A strategy that carries
    // switches decides (round K5a); a style that carries none is `false`, which
    // is `generate`'s own default and is the record.
    //
    // **Round K5b turns it on for house-v2, and hands it the predecessor** —
    // which is why the switch was wired to reach the die rather than the
    // answer. A theme is told "the one before you was an organ" and refuses a
    // second one; a theme after anything else is told nothing and draws what it
    // would have drawn. Theme 0 has no predecessor and is never refused, so the
    // organ is still the record's rare colour and is only ever prevented from
    // being the colour twice.
    avoidOrgan: switchOn(style, 'avoidOrgan') && organTheme(masterSeed, n - 1, opts),
  }) as SetTrack;
  track.index = n;
  // MEASURED: bimodal blend length, and a filter moves in half of all mixes.
  track.blendBars = Math.round(
    (r.chance(o.shortBlendChance * RANGE.shortBlendChance)
      ? r.weighted(o.shortBlendBars)
      : r.weighted(o.longBlendBars)) * RANGE.blendBars
  );
  track.filterMove = r.chance(o.filterMoveChance) ? (r.chance(0.5) ? 'close' : 'open') : null;
  // How far this theme is from the record's target loudness, worked out from
  // the plan and nothing else — no render, no meter, no audio. It is a number
  // *beside* the plan and not in it: the events, the sections and the dice are
  // untouched, which is why the golden snapshot does not see it. `makeDeck` and
  // `renderTrack` both hand it to `buildGraph` as the theme's own
  // output gain, so the live decks, the offline mix and a single-track render
  // level the same way.
  track.trimDb = loudnessTrimDb(track, style);
  return track;
}

function planRoot(masterSeed: string | number, n: number, o: MixOptions): number {
  const kr = new Rng(`${masterSeed}::mix:key:${n}`);
  if (!o.harmonicMixing || n === 0) return kr.int(0, 12);
  return (planRoot(masterSeed, n - 1, o) + kr.weighted(o.keySteps)) % 12;
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
}

/** A whole set, before anything makes a sound. */
export interface SetPlan {
  plans: SetTrack[];
  /** where each theme's first bar falls: the instant, and the beat of the set */
  starts: number[];
  startBeats: number[];
  /** each theme's beats to one beat of the grid (`seamTempo`): 1 but at double or half time */
  perBeats: number[];
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
export function setLayout(masterSeed: string | number, themes = 3, opts: Partial<MixOptions> & { style: Style }): SetPlan {
  const o = setOptions(opts.style, opts);
  const plans: SetTrack[] = [];
  for (let i = 0; i < themes; i++) {
    plans.push(planTheme(String(masterSeed), i, { ...o, themeBars: o.themeBars || undefined }));
  }
  return layOut(plans, o);
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
export function layOut(plans: SetTrack[], opts: Partial<MixOptions> & { style: Style; seams?: ({ bar: number; bars: number } | null)[]; entries?: number[] }): SetPlan {
  const o = setOptions(opts.style, opts);
  const clock = makeSetClock(plans[0].beat, 0);
  const startBeats = [0];
  const starts = [0];
  const perBeats = [1];
  const seams: SetSeam[] = [];
  let free = 0;
  for (let i = 0; i < plans.length - 1; i++) {
    const t = plans[i];
    const b0 = startBeats[i];
    const m = perBeats[i];
    // a beat of the grid, in this theme's seconds (`gridBeat` of a deck)
    const g = t.beat * m;
    const themeTimeAt = (time: number) => (clock.beatAt(time) - b0) * g;
    const contextTimeAt = (themeTime: number) => clock.timeAt(b0 + themeTime / g);
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
    const heard = (60 / clock.spbAt(clock.beatAt(contextTimeAt(p.at)))) * m;
    const rule = seamTempo(heard, plans[i + 1].bpm, o);
    // A far jump rides first: the bars before the line, from no earlier than
    // the blend before it ended, onto the arriving theme's own tempo.
    if (rule.ride > 0) {
      const from = Math.max(themeTimeAt(free), p.at - rule.ride * t.barSeconds);
      const beats = (p.at - from) / g;
      if (beats > 0) clock.glide(clock.beatAt(contextTimeAt(from)), plans[i + 1].beat * m, beats);
    }
    const at = contextTimeAt(p.at);
    const barSeconds = (clock.pin(clock.beatAt(at)) * 4) / m;
    const end = at + p.bars * barSeconds;
    seams.push({
      from: i,
      to: i + 1,
      bar: p.bar,
      pct: p.bar / t.bars,
      boundary: p.boundary,
      onLine: p.bar % p.boundary === 0,
      bars: p.bars,
      barSeconds,
      at,
      swapAt: at + swapAfterBars(p.bars, o) * barSeconds,
      end,
      natural: seamPlan(t, blendAsked(t), { boundaryBars: o.boundaryBars, style: o.style }),
    });
    const mIn = m * rule.perBeat;
    // and where the arriving theme enters: its first bar, or a stated second
    // of it (`renderMix`'s `entries`: a move in place)
    startBeats.push(clock.beatAt(at) - (opts.entries?.[i + 1] ?? 0) / (plans[i + 1].beat * mIn));
    starts.push(at);
    perBeats.push(mIn);
    free = end;
    // What is left after the blend, over its own length: sixteen bars for a
    // drift, a bar a percent for a near move, nothing for a far one.
    const target = plans[i + 1].beat * mIn;
    const left = clock.spbAt(clock.beatAt(end)) / target;
    clock.glide(clock.beatAt(end), target, Math.max(1, (glideBarsFor(left, o) * 4) / mIn));
  }
  return { plans, starts, startBeats, perBeats, seams, clock };
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
}

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
  if (both || neither || m.toKick) holes.push({ deck: 'from', group: o.swapGroup, gap: [m.swapInFrom - m.outgoingBar, Infinity] });
  if (both || neither || m.fromKick) holes.push({ deck: 'to', group: o.swapGroup, gap: [0, m.swapInTo - 1e-6] });

  // MEASURED: a filter moves in about half of all mixes, direction a coin
  // flip, and nothing at the seam is dramatic.
  if (m.filterMove === 'close') {
    line('from', 'lp.frequency', pointLine()
      .set(20000, at)
      .exp(o.outgoingLpHz, end).pts);
  } else if (m.filterMove === 'open') {
    line('to', 'hp.frequency', pointLine()
      .set(o.outgoingHpHz, at)
      .exp(18, at + Math.max(2, bars / 2) * barSeconds).pts);
  }

  // Once the bottom has changed hands the outgoing theme is a harmonic layer
  // over someone else's groove, so it eases away rather than standing at full
  // level until the last bar.
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

  return { at, end, swapAt, bars, lines, holes };
}

export { makeSetClock };
export default setLayout;
