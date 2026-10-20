// **The sea, and the music on its waves** (PLAN-AMBIENT Phase 4, ambient-waves, 10-18; his words of 10-17: *"looking
// for waves, psychodelical vibes, yoga shabassana sound healing themes etc"*). A weather admitted by its own needs
// (PLAN-UNIFY §0b's cut, for the weather alone): it reads the theme's sections, its seconds, its key and the chords
// the progression drew, never a kit and never the keys' harmony. A composer mechanism that knows a row, never a genre;
// a place table says where it plays (`AMBIENT_VOICES`'s `weather` in `styles/deep-house-places.ts`), and the place
// holds off the lanes it replaces (the held pad, the sub, the keys' figure), so what is heard is the sea and what
// enters on it.
//
// **The music, as a producer hears it.** The sea is shaped noise, one wave at a time, made of the weather's own
// voices: the swell rises over 4-6 s (the wind's broad band, from under its level and dark, opening as it comes), it
// crests (the upper air: a high band opens, the spray, and breaks), and it falls into the undertow over 5-8 s (the dark
// air closing toward its floor, a low rumble under it). **The sea is irregular, as a real one is** (his ear 10-18 on the
// first build's seventh wave: "not sure if the assumption on ocean waves, those have more irregular patterns that break
// them out of normal sync pattern"): its surface is a sum, a narrow band of swell about a peak period drawn once a
// theme (8-14 s), sometimes a second swell from another storm, and a local wind chop (`planWaves`). Each wave's period
// and height are the sum's, so the periods scatter some ±20 % and the heights spread as a sea's do (roughly Rayleigh);
// the sets and the lulls between them come out of the swells' interference, of any length; two crests merge now and
// then, the chop breaks a wave early, and now and then the crests line up into a great wave. No wave is on the beat.
// Over the theme the sea is a calm, a swell and a calm. The music enters on the wave: the pad's chord blooms with each
// crest — from as far under its level and as dark as the wave is large, so a calm sea barely breathes and a swell
// blooms — and falls with the undertow; a bell sounds on the break of a set's peak and of a great wave; the bass moves
// on the undertow, and on a set's last wave it slides to the
// next set's root, so the harmony moves with the sets of waves and not with the bars. The sea is a surface under the
// music and never a riser (his rule, `noise-transitions-earn-their-place`): every wave ends, and the trough between two
// is nearly still.
//
// **The chapters** are the section kinds: the intro and the outro are the sea and the pad's blooms, the grooves (the
// mains) everything, the breakdown the sea, the bell on its peaks and the bass, with no pad: a stripped segment.
//
// **Hierarchical draws, each off a stream of its own** (`<seed>::surf:<what>`): the peak period and the voices once a
// theme, the sea state's components (`swell`, `cross`, `chop`: their partials' frequencies and phases), each wave's
// crest hold (`wave:<i>`), each bell's pitch and break (`bell:<i>`). Nothing here draws from another planner's stream,
// so every die the theme had is where it was. Where a rule can choose (a wave's period, height and set, which waves are
// great, the bell's waves, the bass's moves), the sum and a rule do.
//
// **The birds** lean the row about the place's own birds (the one lean, `leanFactor`/`leanShift` in places.ts), so the
// place's tile plays the row's numbers exactly and each bird moves only the sea's own numbers: Tide the sea's size and
// distance, Root the undertow's weight, Veil the sea state (calmer down: a long clean groundswell, its band narrow, little
// chop, rarely a cross swell; rougher up: a shorter period, a broader band, more chop, a cross swell more often), Zephyr
// the surf's brightness.
//
// **Time**: every onset is a second of the theme, placed where the wave says (the plan's bar and sixteenth say where it
// falls, its seconds when): the waves are incommensurate with the bars, which is the point, and none is on a beat.

import { Rng } from './rng.ts';
import { leanFactor, leanShift, cycleFaults, type BirdLeans, type Cycle } from './places.ts';
import { dbToGain } from '@deep-house/engine/dsp';
import type { Spell } from './spell.ts';
import { arcAt } from './knots.ts';
import SURF_FILE from '../recipes/ambient/surf.json' with { type: 'json' };
import WEATHER_FILE from '../recipes/ambient/weather.json' with { type: 'json' };

type Range = [number, number];
type Knots = Array<[number, number]>;
/**
 * A role's voice by weight; a bloom's voice may hold into the fall (`holdShare` of it at its level) and release over a
 * share of it (`releaseShare`): a voice whose release falls in decibels (the wavetable pad's) is held most of the fall
 * and let go over more than it, so its trough is as deep as a voice's whose release falls in amplitude (the shimmer's)
 */
export interface SurfVoice { v: string; w: number; db?: number; holdShare?: number; releaseShare?: number }
export type BellChapter = 'peaks' | 'none';
export interface SurfChapter { bloom: boolean; bell: BellChapter; bass: boolean }
/** One of the sea's noises: its level (dB at size 1), its touch, its pitch (the stage's tone corner reads it) and its send. */
interface SeaPart { db: number; vel: number; midi: number; reverb: number }
export interface SurfRow {
  id: string;
  /**
   * the weather's voices the sea is made of: the swell's band, the spray, the dark air of the backwash, the undertow's
   * rumble — named once, in the weather's row (`recipes/ambient/weather.json`): the surf row says which weather (`of`)
   * and which of its sounds plays each part, and is read with the voices resolved (`SURF_ROWS`)
   */
  sounds: { swell: string; surf: string; backwash: string; undertow: string };
  /** the swell's peak period drawn once a theme (s); each wave's own is the sea's sum's */
  period: { s: Range };
  /**
   * **The sea state** (the surface as a sum): the main swell's `partials` about the peak frequency, spread a share of it
   * (`spread`, at most `spreadMost`); a cross swell, a theme's share of the time (`share`), its period the main's times
   * or over a `ratio` (longer by `longer`), its amplitude a share of the main's (`amp`); a wind chop, `periodS`, broad
   * (`spread`), its amplitude a share of the main's (`amp`, at most `ampMost`); sampled every `dt` s
   */
  state: { dt: number; main: { partials: number; spread: number; spreadMost: number };
    cross: { share: number; partials: number; spread: number; ratio: Range; longer: number; amp: Range };
    chop: { partials: number; spread: number; periodS: Range; amp: number; ampMost: number } };
  /**
   * a wave's shape: its rise the sum's, trough to crest, held to `riseS`; its crest held `crestS`; its fall the sum's,
   * crest to the next trough, stretched by `fallStretch` (the backwash recedes past the trough) and held to `fallS`;
   * two crests nearer than `leastS` are one wave (the larger), as two humps of the sum merge
   */
  shape: { riseS: Range; crestS: Range; fallStretch: number; fallS: Range; leastS: number };
  /** the first swell starts this soon (s); the last wave has ended this long before the theme's end (s) */
  firstS: Range;
  endS: number;
  /**
   * a wave's height over the sea state's significant height (4σ of the sum, H1/3) is its size at the arc's 1 times
   * `significant`; a crest the chop brings `early` s or more before the swell's own is an early break
   */
  heights: { significant: number; early: number };
  /** the sets: a line at each low of the swells' envelope under `lull` of its mean, `leastS` apart at least; a set longer than `mostS` is cut at its lowest low */
  set: { lull: number; leastS: number; mostS: number };
  /** the great wave: a wave over `over` times the significant height (a rare large set member, where the sum's crests line up) */
  great: { over: number };
  /**
   * no wave's swell, crest or undertow strike, and no bell, within this of a beat line (s): one that would be is moved
   * to a point drawn off its own stream across the beat about it (a wave within half a beat either way, a bell inside
   * its own window), so the onsets are spread over the beat's phases and none is stacked at the margin's edge
   */
  offBeatS: number;
  /**
   * the sea's own chords (a harmony table's cycles, `Cycle` in places.ts): the composer draws one where the sea plays,
   * in place of its place's harmony row, and the sets play its chords one a set, round (`progression.states`)
   */
  harmony: { cycles: Cycle[] };
  /** the sea's size over the theme (the contour idiom: [the theme's share, size]): the calm, the swell, the calm */
  arc: Knots;
  sizeMost: number;
  /** the sea's level by its size (dB a unit of size under size 1), and the whole sea's over its parts' (dB) */
  sea: { sizeDb: number; levelDb: number };
  /** the swell: from `fromDb` under its level and `oct` octaves darker at size 0 and 1, reaching both at the crest */
  swell: SeaPart & { fromDb: Range; oct: number };
  /** the spray: `leadS` before the crest, held `durS` by size (an early break's `earlyLonger` times), its top walked by `lpMul`; none on a wave under `least` */
  surf: SeaPart & { leadS: number; durS: Range; lpMul: Range; least: number; earlyLonger: number };
  /** the backwash: from the crest through the fall, its top closing by `lpMul`; `releaseS` is its voice's own release */
  backwash: SeaPart & { lpMul: Range; releaseS: number };
  /** the undertow: `afterS` past the crest, held `durS` by size, darker by `lpMul`; `releaseS` is its voice's own release */
  undertow: SeaPart & { afterS: number; durS: Range; lpMul: Range; releaseS: number };
  /**
   * the pad's chord on each crest: its voice by weight once a theme; at most `notesMost` of the chord's notes; its level
   * (`gain`, `levelDb`) and touch (`vel`, `velStep` a note up the chord); the bloom from `fromDb` under its level at size
   * 0 and 1 (a great wave from `greatDb`), `oct` octaves darker, over the rise; a great wave lifts the chord's top an
   * octave, under `topMost`
   */
  bloom: { voices: SurfVoice[]; notesMost: number; gain: number; vel: number; velStep: number; fromDb: Range; greatDb: number; oct: number; attack: number;
    spread: number; reverb: number; delay: number; topMost: number; levelDb: number };
  /** a bell on the break: the key's pentatonic (`scale`, indexes of the theme's scale) in `register`, on a tone of the set's chord, `afterS` past the crest; a great wave's falls a step `pairS` later */
  bell: { voices: SurfVoice[]; scale: number[]; register: Range; afterS: Range; pairS: Range; vel: Range; durS: number; restartW: number; levelDb: number;
    indexMul: number; lpMul: Range; reverb: number; delay: number };
  /**
   * the bass on the undertow: the set's root in `register`, `afterS` past the crest; held `fall.holdInto` of the way into
   * the next swell's rise and let go to be gone `fall.goneInto` of the way (never past the next undertow, less `gapS`);
   * a set's last wave slides to the next root over `slideS`
   */
  bass: { voice: string; register: Range; afterS: number; vel: Range; slideS: number; gapS: number; levelDb: number; fall: { holdInto: number; goneInto: number } };
  /** what enters on the wave, by section kind (a kind not named is `main`'s) */
  chapters: Record<string, SurfChapter>;
  birds: { by: BirdLeans['by']; most?: BirdLeans['most'] };
  budget: { fallbacks: Array<'backwash' | 'surf' | 'bell'> };
}

/** The weather's rows' sounds (`weather.json`), which the surf rows name by role (the sea's voices are named once). */
const WEATHER_SOUNDS: Record<string, Record<string, string>> = Object.fromEntries((WEATHER_FILE.rows as unknown as Array<{ id: string; sounds: Record<string, string> }>).map((r) => [r.id, r.sounds]));
type SoundsByRole = { of: string; swell: string; surf: string; backwash: string; undertow: string };
const SOUND_FAULTS: string[] = [];
const ROWS = (SURF_FILE.rows as unknown as Array<Omit<SurfRow, 'sounds'> & { sounds: SoundsByRole }>).map((r): SurfRow => {
  const W = WEATHER_SOUNDS[r.sounds.of];
  if (!W) SOUND_FAULTS.push(`${r.id}: its sounds are the weather ${r.sounds.of}'s, which is no weather row`);
  const voice = (part: keyof SurfRow['sounds']) => {
    const v = W?.[r.sounds[part]];
    if (W && !v) SOUND_FAULTS.push(`${r.id}: the ${part} is the weather's ${r.sounds[part]}, which ${r.sounds.of} has no sound for`);
    return v ?? '';
  };
  return { ...r, sounds: { swell: voice('swell'), surf: voice('surf'), backwash: voice('backwash'), undertow: voice('undertow') } };
});
export const SURF_ROWS: readonly SurfRow[] = Object.freeze(ROWS);
export const surfRowOf = (id: string | null | undefined): SurfRow | null => (id ? ROWS.find((r) => r.id === id) ?? null : null);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const range = (v: unknown, lo = -Infinity, hi = Infinity): boolean => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] <= v[1] && v[0] >= lo && v[1] <= hi;
/** two numbers inside the bounds, in either order (a walk from one to the other) */
const ends = (v: unknown, lo: number, hi: number): boolean => Array.isArray(v) && v.length === 2 && v.every((x) => finite(x) && x >= lo && x <= hi);
const knots = (v: unknown, lo: number, hi: number): boolean => Array.isArray(v) && v.length >= 2 && v.every((x, i) => Array.isArray(x) && x.length === 2 && finite(x[0]) && finite(x[1])
  && x[1] >= lo && x[1] <= hi && (i === 0 ? x[0] === 0 : x[0] > (v as Knots)[i - 1][0])) && (v as Knots)[(v as Knots).length - 1][0] === 1;

/** Everything wrong with the surf rows, as sentences; `voiceExists` is the engine's word on a voice. */
export function surfRowsFaults(voiceExists: (v: string) => boolean = () => true): string[] {
  const bad: string[] = [...SOUND_FAULTS];
  for (const r of ROWS) {
    const at = (what: string) => `${r.id}: ${what}`;
    for (const [k, v] of Object.entries(r.sounds)) if (!voiceExists(v)) bad.push(at(`the ${k}: ${v} is no voice`));
    for (const [role, list] of [['bloom', r.bloom.voices], ['bell', r.bell.voices]] as const) {
      if (!Array.isArray(list) || !list.some((x) => x.w > 0)) bad.push(at(`the ${role} draws no voice`));
      for (const x of list ?? []) {
        if (!voiceExists(x.v) || !(x.w >= 0)) bad.push(at(`the ${role}: ${x.v} is no voice, or weighs ${x.w}`));
        if ((x.holdShare !== undefined && !(x.holdShare >= 0 && x.holdShare < 1)) || (x.releaseShare !== undefined && !(x.releaseShare > 0 && x.releaseShare <= 3))) bad.push(at(`the ${role}: ${x.v}'s hold and release shares of the fall`));
      }
    }
    if (!voiceExists(r.bass.voice)) bad.push(at(`the bass: ${r.bass.voice} is no voice`));
    if (!range(r.period.s, 6, 20)) bad.push(at('the peak period 6-20 s'));
    const S = r.state;
    const part = (x: { partials: number; spread: number } | undefined, most: number) => !!x && Number.isInteger(x.partials) && x.partials >= 2 && x.partials <= 16 && x.spread > 0 && x.spread <= most;
    if (!S || !(S.dt > 0 && S.dt <= 0.2) || !part(S.main, 0.3) || !(S.main.spreadMost >= S.main.spread && S.main.spreadMost <= 0.3)) bad.push(at('the sea state: the main swell, 2-16 partials spread under 0.3 of its frequency, sampled under 0.2 s'));
    if (!S?.cross || !part(S.cross, 0.3) || !(S.cross.share >= 0 && S.cross.share <= 1) || !range(S.cross.ratio, 0.5, 0.97) || !(S.cross.longer >= 0 && S.cross.longer <= 1) || !range(S.cross.amp, 0, 1)) bad.push(at('the cross swell: a share, partials, its period a ratio of 0.5-0.97 off the main\'s, weaker'));
    if (!S?.chop || !part(S.chop, 0.4) || !range(S.chop.periodS, 2, 7) || !(S.chop.amp >= 0 && S.chop.amp <= S.chop.ampMost && S.chop.ampMost <= 1)) bad.push(at('the chop: partials, a period of 2-7 s, weaker than the swell'));
    if (!range(r.shape.riseS, 2, 8) || !range(r.shape.fallS, 3, 12) || !range(r.shape.crestS, 0.2, 3)) bad.push(at('a rise of 2-8 s, a crest of 0.2-3 s, a fall of 3-12 s'));
    if (!(r.shape.fallStretch >= 1 && r.shape.fallStretch <= 2) || !(r.shape.leastS >= r.shape.riseS[0] + r.shape.crestS[1])) bad.push(at('the fall stretched 1-2, two crests a rise and a crest apart at least'));
    if (!range(r.firstS, 0, 10) || !(r.endS >= 0)) bad.push(at('the first swell in the first ten seconds, the last wave ended before the end'));
    if (!(r.heights?.significant > 0 && r.heights.significant <= 2) || !(r.heights.early > 0 && r.heights.early < 3)) bad.push(at('the heights: the significant wave\'s size, the early break'));
    if (!(r.set?.lull > 0 && r.set.lull < 1) || !(r.set.leastS >= 10 && r.set.mostS > 2 * r.set.leastS)) bad.push(at('the sets: a lull under the envelope\'s mean, sets 10 s at least and a longest over twice that'));
    if (!(r.great?.over >= 1.1 && r.great.over <= 3)) bad.push(at('the great wave over 1.1-3 times the significant height'));
    if (!(r.offBeatS >= 0 && r.offBeatS <= 0.15)) bad.push(at('the waves off the beat by 0-0.15 s'));
    if (!r.harmony?.cycles?.length) bad.push(at('the sea\'s chords: a cycle at least'));
    else bad.push(...cycleFaults({ id: `${r.id}.harmony`, place: { birds: {}, tempo: [0, Infinity] }, cycles: r.harmony.cycles }).map((m) => at(m)));
    if (!knots(r.arc, 0.05, 1.5) || !(r.sizeMost >= 1 && r.sizeMost <= 2)) bad.push(at('the arc: knots from 0 to 1, sizes 0.05-1.5; sizeMost 1-2'));
    if (!(r.sea.sizeDb >= 0 && r.sea.sizeDb <= 20) || !(finite(r.sea.levelDb) && Math.abs(r.sea.levelDb) <= 18)) bad.push(at('the sea\'s level by size, 0-20 dB, and its whole level within 18'));
    for (const k of ['swell', 'surf', 'backwash', 'undertow'] as const) {
      const p = r[k];
      if (!(finite(p.db) && p.db <= 0 && p.db >= -30) || !(p.vel > 0 && p.vel <= 1) || !(p.reverb >= 0 && p.reverb <= 1) || !(p.midi >= 24 && p.midi <= 108)) bad.push(at(`the ${k}'s level, touch, pitch and send`));
    }
    if (!ends(r.swell.fromDb, -30, 0) || !(r.swell.oct >= 0 && r.swell.oct <= 3)) bad.push(at('the swell from under its level (fromDb -30-0) and darker (oct 0-3)'));
    if (!range(r.surf.durS, 0.2, 4) || !ends(r.surf.lpMul, 0.1, 2) || !(r.surf.least >= 0 && r.surf.least < r.sizeMost) || !(r.surf.earlyLonger >= 1 && r.surf.earlyLonger <= 2)) bad.push(at('the spray\'s length, its top, its least wave and an early break\'s'));
    if (!range(r.undertow.durS, 0.5, 6) || !ends(r.undertow.lpMul, 0.05, 1.5) || !ends(r.backwash.lpMul, 0.05, 1.5)) bad.push(at('the undertow\'s length and the two tops'));
    if (!(Number.isInteger(r.bloom.notesMost) && r.bloom.notesMost >= 2 && r.bloom.notesMost <= 6)) bad.push(at('the bloom two to six notes of the chord'));
    if (!ends(r.bloom.fromDb, -30, 0) || !(r.bloom.greatDb <= 0 && r.bloom.greatDb >= -30) || !(r.bloom.oct >= 0 && r.bloom.oct <= 3)) bad.push(at('the bloom from under its level, and darker'));
    if (!(r.bloom.gain > 0 && r.bloom.gain <= 1) || !(r.bloom.vel > 0 && r.bloom.vel <= 1)) bad.push(at('the bloom\'s gain and touch'));
    if (!r.bell.scale.length || r.bell.scale[0] !== 0 || r.bell.scale.some((i) => !Number.isInteger(i) || i < 0 || i > 6)) bad.push(at('the bell\'s scale: indexes of the theme\'s scale, the tonic first'));
    if (!range(r.bell.register, 48, 100) || r.bell.register[1] - r.bell.register[0] < 11) bad.push(at('the bell\'s register an octave at least'));
    if (!range(r.bell.afterS, 0, 3) || !range(r.bell.pairS, 0.1, 3) || !range(r.bell.vel, 0.05, 1)) bad.push(at('the bell on the break'));
    if (!range(r.bass.register, 20, 52) || r.bass.register[1] - r.bass.register[0] < 11) bad.push(at('the bass\'s register an octave at least'));
    if (!range(r.bass.vel, 0.05, 1) || !(r.bass.afterS >= 0) || !(r.bass.slideS > 0 && r.bass.slideS <= 4)) bad.push(at('the bass on the undertow'));
    if (!(r.bass.fall?.holdInto >= 0 && r.bass.fall.goneInto > r.bass.fall.holdInto && r.bass.fall.goneInto <= 1.2)) bad.push(at('the bass\'s fall: held a share into the next rise, gone further into it'));
    for (const [kind, c] of Object.entries(r.chapters)) if (typeof c.bloom !== 'boolean' || typeof c.bass !== 'boolean' || !['peaks', 'none'].includes(c.bell)) bad.push(at(`chapter ${kind}`));
    if (!r.chapters.main) bad.push(at('the main chapter, the kinds not named'));
    for (const f of r.budget.fallbacks) if (!['backwash', 'surf', 'bell'].includes(f)) bad.push(at(`fallback ${f}`));
  }
  return bad;
}

// --- the plan -------------------------------------------------------------------------

/**
 * One wave: when its swell starts, crests and has fallen (s), its size, its set and place in it, whether it is a great
 * wave (over the row's share of the significant height), its set's peak, and whether the chop broke it early.
 */
export interface Wave { i: number; set: number; pos: number; of: number; t0: number; crest: number; hold: number; until: number; size: number; great: boolean; peak: boolean; early: boolean }
/** The theme's sea state, as drawn: the peak period, the main swell's spread, the cross swell's period (or none), the chop's period and share. */
export interface SeaState { periodS: number; spread: number; crossS: number | null; crossAmp: number; chopS: number; chopAmp: number }
/**
 * **The crest anchors** a part may enter on (s): a wave's swell start, its crest, its break (the spray's peak, just past
 * the crest), its undertow; and each set's line (its first swell), where the harmony moves.
 */
export interface SurfAnchors { waves: Wave[]; sets: Array<{ k: number; t: number; waves: number; chord: number }> }
export type SurfPart = 'sea-swell' | 'sea-surf' | 'sea-backwash' | 'sea-undertow' | 'wave-bloom' | 'wave-bell' | 'wave-bass';
/** The parts that enter on the waves (laid in the lanes the place holds off; the ring draws them there, `lanesOf`). */
export const ON_WAVE: ReadonlySet<string> = new Set<SurfPart>(['wave-bloom', 'wave-bell', 'wave-bass']);
/** One event the composer lays: a voice at a second, its bar and sixteenth, the part it plays and its notes' numbers. */
export interface SurfEvent { voice: string; t: number; bar: number; step: number; part: SurfPart; role: 'texture' | 'detail'; p: Record<string, unknown> }
/** What the plan says of the sea: its row, its voices, its period and waves, what entered on them and what the budget did. */
export interface SurfSummary {
  row: string;
  voices: { bloom: string; bell: string | null; bass: string; sea: string[] };
  periodS: number;
  waves: number;
  sets: number;
  greats: number;
  /** the sea state the theme drew (the peak period, the swell's spread, the cross swell, the chop) */
  state: SeaState;
  blooms: number;
  bells: number;
  bassNotes: number;
  /**
   * the anchors, for a reader: each wave's swell start, crest and end (s), its size (two decimals), its set, and what it
   * is besides (`peak`: its set's largest, `great`: a great wave, `''`: neither), and 1 where the chop broke it early;
   * and each set's first swell (s)
   */
  waveList: Array<[number, number, number, number, number, '' | 'peak' | 'great', 0 | 1]>;
  setLines: number[];
  budget: { ceiling: number; before: number; after: number; fallback: string[] };
  /**
   * where the theme's trim windows measure at nought against the place's own (dB): what Tide and Veil take from the
   * sea, measured (the row's `measuredDb` leans), so the trim follows them (`generator.ts`, the sea's level)
   */
  levelDb: number;
  says: string;
}

export interface SurfInput {
  seed: string;
  row: SurfRow;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  bars: number;
  barSeconds: number;
  /** the key's root (pitch class) and the theme's scale, as semitones from it */
  key: { root: number; scale: readonly number[] };
  /** the progression's chords in its loop's order (their notes, MIDI, and their root): set k plays chord k of them, round */
  chords: ReadonlyArray<{ notes: readonly number[]; rootMidi: number }>;
  spell: Spell;
  /** the place's own birds, every bird named: the leans' centre */
  centre: Readonly<Record<string, number>>;
  /** the cast budget: the units of a set of voices, the units the theme sounds besides, and the ceiling */
  unitsOf: (voices: Iterable<string>) => number;
  besides: number;
  ceiling: number;
  /** the waves and sets `planWaves` drew for these inputs, where the caller has them (the composer moves its chords at the sets' lines first) */
  anchors?: ReturnType<typeof planWaves>;
}

const lerp = (r: Rng, [a, b]: Range) => a + (b - a) * r.next();
const mix = ([a, b]: Range, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
const clamp = (x: number, [a, b]: Range) => Math.max(a, Math.min(b, x));
/** a contour's value at a share (the contour idiom: knots of [share, value], straight between; `src/knots.ts`) */
export { arcAt };
/** a second at least `margin` off every beat line of a beat `beat` s long (no onset of the sea on the grid) */
const offBeatOf = (beat: number, margin: number) => (t: number): boolean => { const ph = ((t / beat) % 1 + 1) % 1; return Math.min(ph, 1 - ph) * beat >= margin - 1e-9; };
/**
 * **The escape off the beat** (the review of 10-18, its second finding): a shift `d` in 10 ms steps over `[lo, hi]` that
 * puts every one of `ats` off the beat, drawn at `u` among all that do (none where none does). The least shift had stacked
 * the emptied 100 ms at the margin's edge, 50-80 ms from a line (2.4 times a uniform sea's share there); drawn across the
 * beat, an onset moved off a line lands anywhere a free one might.
 */
const escape = (ats: readonly number[], lo: number, hi: number, ok: (t: number) => boolean, u: number, also: (d: number) => boolean = () => true): number | null => {
  const ds: number[] = [];
  for (let k = Math.ceil(lo / 0.01 - 1e-9); k * 0.01 <= hi + 1e-9; k++) { const d = +(k * 0.01).toFixed(2); if (ats.every((t) => ok(t + d)) && also(d)) ds.push(d); }
  return ds.length ? ds[Math.min(ds.length - 1, Math.floor(u * ds.length))] : null;
};
const pc = (m: number) => ((m % 12) + 12) % 12;
const fold = (m: number, [lo, hi]: Range) => { let x = m; while (x < lo) x += 12; while (x > hi) x -= 12; return x; };

/** The standard normal's quantile (Abramowitz and Stegun 26.2.23, within 4.5e-4): the stratified partials' offsets. */
const probit = (p: number): number => {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  const t = Math.sqrt(-2 * Math.log(q < 0.5 ? q : 1 - q));
  const x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return q < 0.5 ? -x : x;
};
type Partial = { f: number; a: number; ph: number };
/** `n` partials about `f0`, spread `spread` of it (stratified normal offsets), of rms `rms` together, at random phases. */
const partials = (r: Rng, f0: number, n: number, spread: number, rms: number): Partial[] =>
  Array.from({ length: n }, (_, k) => ({ f: f0 * Math.max(0.3, 1 + spread * probit((k + r.next()) / n)), a: rms * Math.sqrt(2 / n), ph: 2 * Math.PI * r.next() }));

/**
 * **The waves of a theme and their sets** (the anchors), from the sea's surface as a sum (the oceanographers' picture:
 * a narrow band of swell, sometimes a cross swell, a local wind chop). The waves are the swells' sum's zero
 * up-crossings, each its own period; a wave's rise and fall are the sum's (trough to crest, crest to the next trough);
 * its crest is where the whole surface peaks (the chop too, so a chop's crest can break a wave early); its height is
 * the surface's crest over its trough, and its size that over the sea state's significant height, times the theme's
 * arc and Tide. The sets come out of the swells' envelope: a set's line at each low of it (a lull), so a set's length,
 * its waves and its lulls are the interference's and not a count. The great wave is a wave far over the significant
 * height. No onset falls on a beat line: a wave whose swell, crest or undertow strike would is moved off it by the
 * least it takes (a few hundredths of a second). Pure: the same inputs give the same sea.
 */
export function planWaves(I: Pick<SurfInput, 'seed' | 'row' | 'bars' | 'barSeconds' | 'chords' | 'spell' | 'centre'>): SurfAnchors & { periodS: number; state: SeaState } {
  const R = I.row;
  const L: BirdLeans = { centre: I.centre, by: R.birds.by, ...(R.birds.most ? { most: R.birds.most } : {}) };
  const factor = (knob: string) => leanFactor(L, knob, I.spell);
  const end = I.bars * I.barSeconds;
  const rp = new Rng(`${I.seed}::surf:period`);
  // Veil, the sea state: the peak period shorter up (a younger, wind-driven sea), the swell's band broader, the chop
  // stronger and a cross swell more often; down, a long clean groundswell
  const periodS = +(lerp(rp, R.period.s) * factor('period')).toFixed(3);
  const first = lerp(rp, R.firstS);
  const S = R.state;
  const spread = Math.min(S.main.spreadMost, S.main.spread * factor('spread'));
  const main = partials(new Rng(`${I.seed}::surf:swell`), 1 / periodS, S.main.partials, spread, 1);
  const rc = new Rng(`${I.seed}::surf:cross`);
  const crossOn = rc.chance(Math.min(1, S.cross.share * factor('cross')));
  const ratio = lerp(rc, S.cross.ratio), longer = rc.chance(S.cross.longer), crossAmp = lerp(rc, S.cross.amp);
  const crossS = crossOn ? +(periodS * (longer ? 1 / ratio : ratio)).toFixed(3) : null;
  const cross = crossS ? partials(rc, 1 / crossS, S.cross.partials, S.cross.spread, crossAmp) : [];
  const rw0 = new Rng(`${I.seed}::surf:chop`);
  const chopS = lerp(rw0, S.chop.periodS), chopAmp = Math.min(S.chop.ampMost, S.chop.amp * factor('chop'));
  const chop = partials(rw0, 1 / chopS, S.chop.partials, S.chop.spread, chopAmp);
  const swells = [...main, ...cross];
  // the surface, sampled: the swells' sum, the chop, and the swells' envelope (the sum's modulus)
  const dt = S.dt, n = Math.max(2, Math.ceil(end / dt) + 1);
  const sw = new Float64Array(n), eta = new Float64Array(n), env = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k * dt;
    let x = 0, y = 0, c = 0;
    for (const p of swells) { const th = 2 * Math.PI * p.f * t + p.ph; x += p.a * Math.cos(th); y += p.a * Math.sin(th); }
    for (const p of chop) c += p.a * Math.cos(2 * Math.PI * p.f * t + p.ph);
    sw[k] = x; eta[k] = x + c; env[k] = Math.hypot(x, y);
  }
  const rms = Math.sqrt([...swells, ...chop].reduce((a, p) => a + p.a * p.a / 2, 0));
  const Hs = 4 * rms;
  const size0 = factor('size');
  // the swells' crests between zero up-crossings, and their troughs
  const ups: number[] = [];
  for (let k = 1; k < n; k++) if (sw[k - 1] < 0 && sw[k] >= 0) ups.push(k);
  type Raw = { crestK: number; troughK: number; nextTroughK: number };
  const raw: Raw[] = [];
  const argOf = (a: number, b: number, f: Float64Array, max: boolean) => { let best = a; for (let k = a; k <= b; k++) if (max ? f[k] > f[best] : f[k] < f[best]) best = k; return best; };
  for (let j = 0; j + 1 < ups.length; j++) {
    const crestK = argOf(ups[j], ups[j + 1] - 1, sw, true);
    const troughK = j > 0 ? argOf(ups[j - 1], ups[j] - 1, sw, false) : argOf(0, ups[j], sw, false);
    const nextTroughK = argOf(crestK, ups[j + 1], sw, false);
    raw.push({ crestK, troughK, nextTroughK });
  }
  // the whole surface's crest and trough about the swell's (the chop rides on it): the wave's height and its crest's time
  const near = Math.max(1, Math.round(chopS / 2 / dt));
  const read = raw.map((w) => {
    const ck = argOf(Math.max(0, w.crestK - near), Math.min(n - 1, w.crestK + near), eta, true);
    const tk = argOf(Math.max(0, w.troughK - near), Math.min(n - 1, w.troughK + near), eta, false);
    const nk = argOf(Math.max(0, w.nextTroughK - near), Math.min(n - 1, w.nextTroughK + near), eta, false);
    return { crest: ck * dt, swellCrest: w.crestK * dt, trough: tk * dt, next: nk * dt, h: (eta[ck] - eta[tk]) / Hs, top: eta[ck], low: eta[tk] };
  });
  // two crests nearer than a rise and a crest are one wave, the larger (two humps of the sum merged); the merged wave
  // rises from the earlier trough, so its height is the larger of the two humps' and its crest over that trough
  const kept: typeof read = [];
  for (const w of read) {
    const last = kept[kept.length - 1];
    if (last && w.crest - last.crest < R.shape.leastS) {
      const later = w.h > last.h;
      const top = later ? w.top : last.top;
      kept[kept.length - 1] = { ...(later ? w : last), trough: last.trough, low: last.low, h: Math.max(w.h, last.h, (top - last.low) / Hs) };
      continue;
    }
    kept.push(w);
  }
  // off the beat: a wave whose swell, crest or undertow strike would fall within `offBeatS` of a beat line is moved, the
  // three together, to a shift drawn off its own stream across the beat about it (`escape`)
  const beat = I.barSeconds / 4;
  const offBeat = offBeatOf(beat, R.offBeatS);
  const waves: Wave[] = [];
  let i = 0;
  for (const w of kept) {
    const rw = new Rng(`${I.seed}::surf:wave:${i}`);
    const crestHold = lerp(rw, R.shape.crestS);
    const prev = waves[waves.length - 1];
    let crest = w.crest;
    let t0 = Math.max(w.trough, crest - R.shape.riseS[1]);
    t0 = Math.min(t0, crest - R.shape.riseS[0]);
    if (prev && t0 < prev.crest + prev.hold) t0 = prev.crest + prev.hold;
    if (t0 < first) { if (crest - first < R.shape.riseS[0]) continue; t0 = Math.max(t0, first); }
    const fall = clamp((w.next - w.crest) * R.shape.fallStretch, R.shape.fallS);
    const ats = [t0, crest, crest + R.bass.afterS];
    if (!ats.every(offBeat)) {
      const d = escape(ats, -beat / 2, beat / 2, offBeat, rw.next(), (x) => t0 + x >= first && (!prev || t0 + x >= prev.crest + prev.hold));
      if (d != null) { t0 += d; crest += d; }
    }
    if (crest - t0 < R.shape.riseS[0] - 1e-6 || (prev && t0 <= prev.t0)) continue;
    const until = crest + crestHold + fall;
    if (until > end - R.endS) break;
    const great = w.h >= R.great.over;
    const size = Math.min(R.sizeMost, arcAt(R.arc, crest / end) * size0 * w.h * R.heights.significant);
    waves.push({ i, set: 0, pos: 0, of: 0, t0: +t0.toFixed(4), crest: +crest.toFixed(4), hold: +crestHold.toFixed(4), until: +until.toFixed(4), size: +size.toFixed(4),
      great, peak: false, early: w.swellCrest - w.crest >= R.heights.early });
    i++;
  }
  // the sets: a line at each low of the swells' envelope under `lull` of its mean (the deepest first, `leastS` apart),
  // a set longer than `mostS` cut at its own lowest low; each wave in the set its crest falls in
  const mean = env.reduce((a, b) => a + b, 0) / n;
  const lows: number[] = [];
  const hop = Math.max(1, Math.round(0.5 / dt));
  for (let k = hop; k + hop < n; k += hop) if (env[k] <= env[k - hop] && env[k] <= env[k + hop]) lows.push(k);
  const lines: number[] = [];
  const far = (k: number, from: number[]) => from.every((x) => Math.abs(x - k) * dt >= R.set.leastS);
  for (const k of [...lows].filter((k) => env[k] < R.set.lull * mean).sort((a, b) => env[a] - env[b])) if (far(k, lines)) lines.push(k);
  for (let more = true; more;) {
    more = false;
    const b = [0, ...[...lines].sort((x, y) => x - y), n - 1];
    for (let j = 0; j + 1 < b.length; j++) if ((b[j + 1] - b[j]) * dt > R.set.mostS) {
      const inner = lows.filter((k) => k > b[j] && k < b[j + 1] && far(k, [b[j], b[j + 1]]));
      if (!inner.length) continue;
      lines.push(inner.reduce((a, k) => (env[k] < env[a] ? k : a)));
      more = true; break;
    }
  }
  const at = [...lines].sort((x, y) => x - y).map((k) => k * dt);
  const sets: SurfAnchors['sets'] = [];
  let k = -1, line = -1;
  for (const w of waves) {
    const of = at.filter((x) => x <= w.crest).length;
    if (of !== line) { k++; line = of; sets.push({ k, t: w.t0, waves: 0, chord: I.chords.length ? k % I.chords.length : 0 }); }
    w.set = k;
    sets[k].waves++;
  }
  for (const set of sets) {
    const mine = waves.filter((w) => w.set === set.k);
    mine.forEach((w, j) => { w.pos = j; w.of = mine.length; });
    // the set's peak: its largest wave that is not a great one (a great wave has its own bell), the latest of equals
    const plain = mine.filter((w) => !w.great);
    if (plain.length) plain.reduce((a, w) => (w.size >= a.size ? w : a)).peak = true;
  }
  return { waves, sets, periodS, state: { periodS, spread: +spread.toFixed(4), crossS, crossAmp: crossS ? +crossAmp.toFixed(3) : 0, chopS: +chopS.toFixed(3), chopAmp: +chopAmp.toFixed(3) } };
}

/**
 * **The sea over a theme and what enters on its waves**: the events in time order and what they were. The invariants
 * the check holds (`tools/check-surf.ts`): every wave ends before the theme does and before its fall runs out; the sea
 * is never a bed (between two waves' crests it falls by at least the trough the row's numbers give); the bloom's notes
 * are the set's chord; the bell only on a peak's or a seventh's break, in its register and the key's pentatonic; the
 * bass on undertows, its pitch the set's root or a slide to the next one, inside its register.
 */
export function planSurf(I: SurfInput): { events: SurfEvent[]; anchors: SurfAnchors; summary: SurfSummary } | null {
  const R = I.row;
  const L: BirdLeans = { centre: I.centre, by: R.birds.by, ...(R.birds.most ? { most: R.birds.most } : {}) };
  const factor = (knob: string) => leanFactor(L, knob, I.spell);
  const shift = (knob: string) => leanShift(L, knob, I.spell);
  const s16 = I.barSeconds / 16;
  const end = I.bars * I.barSeconds;

  // --- the voices, once a theme, under the budget ---
  const rv = new Rng(`${I.seed}::surf:voices`);
  const bloomVoice = rv.weighted(R.bloom.voices.filter((x) => x.w > 0).map((x) => ({ v: x.v, w: x.w })));
  let bellVoice: string | null = rv.weighted(R.bell.voices.filter((x) => x.w > 0).map((x) => ({ v: x.v, w: x.w })));
  const sea = { swell: R.sounds.swell, surf: R.sounds.surf as string | null, backwash: R.sounds.backwash as string | null, undertow: R.sounds.undertow };
  const fallback: string[] = [];
  const cast = () => [bloomVoice, R.bass.voice, sea.swell, sea.undertow, ...(sea.surf ? [sea.surf] : []), ...(sea.backwash ? [sea.backwash] : []), ...(bellVoice ? [bellVoice] : [])];
  const cost = () => I.unitsOf(cast()) + I.besides;
  const before = cost();
  for (const f of R.budget.fallbacks) {
    if (cost() <= I.ceiling) break;
    if (f === 'bell') bellVoice = null; else sea[f] = null;
    fallback.push(f);
  }
  if (cost() > I.ceiling) return null;

  const anchors = I.anchors ?? planWaves(I);
  const { waves } = anchors;
  if (!waves.length) return null;
  const events: SurfEvent[] = [];
  const push = (voice: string, t: number, part: SurfPart, role: SurfEvent['role'], p: Record<string, unknown>) => {
    if (!(t >= 0) || t >= end - 0.05) return;
    const step = Math.floor(t / s16 + 1e-9);
    events.push({ voice, t: +t.toFixed(6), bar: Math.min(I.bars - 1, Math.floor(step / 16)), step: step % 16, part, role, p });
  };
  const kindAt = (t: number) => (I.sections.find((x) => t >= x.startBar * I.barSeconds && t < (x.startBar + x.bars) * I.barSeconds) ?? I.sections[I.sections.length - 1])?.kind ?? 'main';
  const chapterAt = (t: number): SurfChapter => R.chapters[kindAt(t)] ?? R.chapters.main;
  const g = (db: number) => +dbToGain(db).toFixed(5);
  const send = (x: number) => +Math.max(0, Math.min(1, x + shift('send'))).toFixed(3);
  const offBeat = offBeatOf(I.barSeconds / 4, R.offBeatS);

  // --- the sea: each wave its swell, its spray, its backwash and its undertow ---
  // Tide: the sea's size (planWaves) and its level and distance; Root: the undertow's weight; Zephyr: the spray
  const seaDb = shift('seaDb');
  const undertowDb = shift('undertowDb'), undertowLong = factor('undertowLong');
  const surfDb = shift('surfDb'), surfBright = factor('surfBright');
  for (const w of waves) {
    const rise = w.crest - w.t0;
    const crestHold = w.hold, fall = w.until - w.crest - w.hold;
    const levelBy = (db: number) => db + R.sea.levelDb + R.sea.sizeDb * (w.size - 1) + seaDb;
    const sw = R.swell;
    push(sea.swell, w.t0, 'sea-swell', 'texture', { dur: +(rise + crestHold).toFixed(4), vel: sw.vel, gain: g(levelBy(sw.db)), midi: sw.midi, reverb: send(sw.reverb),
      swell: { db: +mix(sw.fromDb, w.size).toFixed(2), oct: sw.oct, over: +rise.toFixed(3) } });
    if (sea.surf && w.size >= R.surf.least) {
      const S = R.surf;
      // an early break (the chop's crest ahead of the swell's) spills: its whitewater runs longer
      const dur = mix(S.durS, (w.size - S.least) / Math.max(1e-6, 1 - S.least)) * (w.early ? S.earlyLonger : 1);
      push(sea.surf, w.crest - S.leadS, 'sea-surf', 'texture', { dur: +dur.toFixed(4), vel: S.vel, gain: g(levelBy(S.db) + surfDb), midi: S.midi, reverb: send(S.reverb),
        lpMul: S.lpMul.map((x) => +Math.min(2, x * surfBright).toFixed(3)) });
    }
    if (sea.backwash) {
      const B = R.backwash;
      push(sea.backwash, w.crest, 'sea-backwash', 'texture', { dur: +Math.max(0.5, crestHold + fall - B.releaseS).toFixed(4), vel: B.vel, gain: g(levelBy(B.db)), midi: B.midi, reverb: send(B.reverb), lpMul: [...B.lpMul] });
    }
    const U = R.undertow;
    const udur = Math.min(Math.max(0.5, fall - U.releaseS), mix(U.durS, w.size) * undertowLong);
    push(sea.undertow, w.crest + U.afterS, 'sea-undertow', 'texture', { dur: +udur.toFixed(4), vel: U.vel, gain: g(levelBy(U.db) + undertowDb), midi: U.midi, reverb: send(U.reverb), lpMul: [...U.lpMul] });
  }

  // --- what enters on the wave ---
  const chordOf = (w: Wave) => I.chords.length ? I.chords[anchors.sets[w.set].chord] : { notes: [I.key.root + 48], rootMidi: I.key.root + 36 };
  // the bloom: the set's chord on each crest, from under its level as far as the wave is large; Tide's distance moves its
  // level, nearer a little louder (ambient-waves-3: the calm pulls' level is the bloom's, the sea's noises a small share)
  const bloomDb = shift('bloomDb');
  let blooms = 0;
  for (const w of waves) {
    if (!chapterAt(w.crest).bloom) continue;
    const B = R.bloom;
    const c = chordOf(w);
    // at most `notesMost` of the chord's notes (two blooms overlap, the fall of one under the rise of the next, so the pad
    // sounds twice this at once): a chord with more gives up its fifth first, the colour and the root kept, then its top
    const all = [...c.notes].sort((a, b) => a - b);
    const fifth = all.length > B.notesMost ? all.findIndex((m, k) => k > 0 && pc(m) === pc(c.rootMidi + 7)) : -1;
    const notes = all.filter((_, k) => k !== fifth).slice(0, B.notesMost);
    // a great wave opens the voicing: its top an octave up, in its place, so it is never a note more
    if (w.great && notes.length && notes[notes.length - 1] + 12 <= B.topMost) notes[notes.length - 1] += 12;
    const rise = w.crest - w.t0;
    const crestHold = w.hold, fall = w.until - w.crest - w.hold;
    const fromDb = w.great ? B.greatDb : mix(B.fromDb, w.size);
    const V = B.voices.find((x) => x.v === bloomVoice);
    // the phone: a bloom has died by the swell after next's start, so at most two blooms sound at once (an irregular
    // sea brings short waves close together, and three overlapping blooms were twelve notes)
    const next2 = waves[waves.indexOf(w) + 2];
    const life = rise + crestHold + fall * ((V?.holdShare ?? 0) + (V?.releaseShare ?? 1));
    const cut = next2 ? Math.min(1, Math.max(0, next2.t0 - w.t0 - rise - crestHold - 0.01) / Math.max(1e-6, life - rise - crestHold)) : 1;
    const held = fall * (V?.holdShare ?? 0) * cut, release = fall * (V?.releaseShare ?? 1) * cut;
    notes.forEach((m, k) => push(bloomVoice, w.t0, 'wave-bloom', 'detail', { midi: m, dur: +(rise + crestHold + held).toFixed(4), vel: +Math.max(0.2, B.vel - B.velStep * k).toFixed(3),
      attack: B.attack, release: +release.toFixed(3), gain: +(B.gain * dbToGain(B.levelDb + bloomDb)).toFixed(5), spread: B.spread, reverb: send(B.reverb), delay: B.delay,
      swell: { db: +fromDb.toFixed(2), oct: B.oct, over: +rise.toFixed(3) } }));
    blooms++;
  }
  // the bell on the break: a set's peak and a great wave, on a tone of the set's chord in the key's pentatonic
  let bells = 0;
  if (bellVoice) {
    const B = R.bell;
    const pcs = B.scale.map((ix) => pc(I.key.root + I.key.scale[ix]));
    const pitches: number[] = [];
    for (let m = B.register[0]; m <= B.register[1]; m++) if (pcs.includes(pc(m))) pitches.push(m);
    let last: number | null = null;
    for (const w of waves) {
      if (!(w.peak || w.great) || chapterAt(w.crest).bell === 'none') continue;
      const r = new Rng(`${I.seed}::surf:bell:${w.i}`);
      const tones = new Set(chordOf(w).notes.map(pc));
      const on = pitches.filter((m) => tones.has(pc(m)));
      const pool = on.length ? on : pitches;
      const m = r.weighted(pool.map((v) => ({ v, w: v === last ? B.restartW : 1 })));
      last = m;
      // off the beat, as the waves are: a strike that would be on a line is drawn again inside the break's own window
      // (`escape`, off its own stream), and the tumble's second inside its own
      const at0 = w.crest + lerp(r, B.afterS);
      const pair = w.great ? lerp(r, B.pairS) : 0;
      const re = new Rng(`${I.seed}::surf:bell:${w.i}:off`);
      const at = offBeat(at0) ? at0 : at0 + (escape([at0], w.crest + B.afterS[0] - at0, w.crest + B.afterS[1] - at0, offBeat, re.next()) ?? 0);
      const p = (midi: number, vel: number) => ({ midi, vel: +vel.toFixed(3), dur: B.durS, gain: g(B.levelDb), indexMul: B.indexMul, lpMul: [...B.lpMul], reverb: send(B.reverb), delay: B.delay });
      const vel = mix(B.vel, w.size / R.sizeMost);
      push(bellVoice, at, 'wave-bell', 'detail', p(m, vel));
      bells++;
      // a great wave's break tumbles: a second strike a step down the pentatonic, softer, off the beat too
      if (w.great) {
        const below = pitches.filter((x) => x < m);
        const t2 = at + pair;
        const t = offBeat(t2) ? t2 : t2 + (escape([t2], at + B.pairS[0] - t2, at + B.pairS[1] - t2, offBeat, re.next()) ?? 0);
        if (below.length) { push(bellVoice, t, 'wave-bell', 'detail', p(below[below.length - 1], vel * 0.8)); bells++; }
      }
    }
  }
  // the bass on the undertow: the set's root, struck with the undertow and gone in the next swell's rise, so the low end
  // breathes with the sea (the sub's release falls in decibels, so it is held to the rise and let go there); where the
  // next wave plays no bass it stops with its own wave's fall. A set's last wave slides to the next set's root, a
  // great wave's drops an octave where the register holds it
  let bassNotes = 0;
  {
    const B = R.bass;
    const bassDb = shift('bassDb');
    const lane = waves.filter((w) => chapterAt(w.crest + B.afterS).bass);
    const rootOf = (w: Wave) => fold(chordOf(w).rootMidi, B.register);
    lane.forEach((w, n) => {
      const at = w.crest + B.afterS;
      const next = lane[n + 1];
      const nextSet = anchors.sets[w.set + 1];
      const lastOfSet = w.pos === w.of - 1 && !!nextSet;
      let midi = rootOf(w);
      let slideFrom: number | null = null;
      if (lastOfSet) {
        const to = fold(I.chords.length ? I.chords[nextSet.chord].rootMidi : midi, B.register);
        if (to !== midi) { slideFrom = midi; midi = to; }
      } else if (w.great && midi - 12 >= B.register[0]) midi -= 12;
      // held through the trough into the next swell's rise and let go as that swell gathers (gone before its undertow),
      // so the low end never drops out between two waves and the breath is the swell's; where the next wave plays none
      // (a chapter without the bass) it is let go as long and gone with its own wave's fall
      const F = B.fall;
      const linked = !!next && next.i === w.i + 1;
      const rise = linked ? next.crest - next.t0 : w.crest - w.t0;
      const stop = linked ? Math.min(next.crest + B.afterS - B.gapS, next.t0 + F.goneInto * rise) : w.until;
      const letGo = Math.max(0.5, Math.min(stop - at - 0.5, (F.goneInto - F.holdInto) * rise));
      const vel = mix(B.vel, w.size / R.sizeMost);
      push(B.voice, at, 'wave-bass', 'detail', { midi, dur: +Math.max(0.5, stop - at - letGo).toFixed(4), release: +letGo.toFixed(4), vel: +vel.toFixed(3), gain: g(B.levelDb + bassDb),
        ...(slideFrom != null ? { slideFrom, slideTime: B.slideS } : {}) });
      bassNotes++;
    });
  }
  events.sort((a, b) => a.t - b.t);
  const greats = waves.filter((w) => w.great).length;
  const seaVoices = [sea.swell, sea.surf, sea.backwash, sea.undertow].filter((v): v is string => !!v);
  const summary: SurfSummary = {
    row: R.id,
    voices: { bloom: bloomVoice, bell: bellVoice, bass: R.bass.voice, sea: seaVoices },
    periodS: anchors.periodS,
    waves: waves.length,
    sets: anchors.sets.length,
    greats,
    state: anchors.state,
    blooms,
    bells,
    bassNotes,
    waveList: waves.map((w) => [+w.t0.toFixed(3), +w.crest.toFixed(3), +w.until.toFixed(3), +w.size.toFixed(2), w.set, w.great ? 'great' : w.peak ? 'peak' : '', w.early ? 1 : 0]),
    setLines: anchors.sets.map((x) => +x.t.toFixed(3)),
    budget: { ceiling: I.ceiling, before, after: cost(), fallback },
    levelDb: +shift('measuredDb').toFixed(2),
    says: `the sea (${R.id}): ${waves.length} waves of ${anchors.periodS.toFixed(1)} s in ${anchors.sets.length} sets, ${greats} great${greats === 1 ? '' : 's'}${anchors.state.crossS ? `, a cross swell of ${anchors.state.crossS.toFixed(1)} s` : ''}; `
      + `${bloomVoice} blooms ×${blooms}, ${bellVoice ?? 'no bell'}${bellVoice ? ` ×${bells}` : ''}, ${R.bass.voice} on the undertow ×${bassNotes}${fallback.length ? `; over the budget: ${fallback.join(', ')} out` : ''}`,
  };
  return { events, anchors, summary };
}
