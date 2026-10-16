// **The program guards**: the bad-sound checks the liquid producer rounds wrote into their listen-through
// (`tools/producer-timeline.ts`), made general and run over the ring (PLAN-UNIFY §3). Each one reads a planned theme
// and its compiled program — never a render — and is written against what every theme has: its time (the helper of
// `src/musical-time.ts`: written bars and beats, the felt pulse, the phrase, seconds), its section map, its chords,
// its layers and the birds it was planned under. Nothing here names a place, a genre or a seed.
//
//   node tools/check-program-guards.ts                   the whole grid: counts per guard per spell, the worst ten, the
//                                                        bird-inertness table, each against the baseline file
//   node tools/check-program-guards.ts --baseline        the same, and the baseline file rewritten (`program-guards-baseline.json`)
//   node tools/check-program-guards.ts --json <file>     the same, and every finding written to a file
//   node tools/check-program-guards.ts --link "<query>"  one theme, every finding
//   node tools/check-program-guards.ts --line            one line of totals (`npm run check` prints it; no bird sweep)
//   --base <url>                                         the page a finding's link opens on (the Pages preview by default)
//
// It reports and never fails: the findings are the next round's list of what may sound bad; a guard becomes a gate
// only once his ear agrees its findings are bad. The guards (every threshold is `LIMITS`, in the unit it declares):
//
//   - **unlabelled**: where an arrangement labels its phrases, a foreground event no phrase owns;
//   - **landing**: a landing (a drop, or a chord change after the harmony held half a phrase, outside a break) the
//     drums play into with no gesture: no crash, swell or riser near it, no fill, no breath, no entry, no new top;
//   - **hole**: in a build or a drop, no harmonic or melodic part sounding (release tails counted) for longer than
//     max(1.5 felt beats, 0.7 s), in a track that has harmony around it; a bar of ticking hats or of a moving bass line
//     holds the space (his ear, 10-13: the bass and the hats of a break are a solid break);
//   - **empty**: more than a phrase of drums and/or bass with nothing harmonic or textural over them, outside the
//     intro, the outro, a break and a declared cooldown (half a phrase to a phrase is said as near);
//   - **stop**: a held chord or pad (2 s or more) that ends while the music goes on with no fade, no handover to the
//     next harmonic strike within a felt beat (the beat itself included), and a release under the fade a hold that long
//     wants (1.5 bars, held between 2 s and 5 s), from 70 BPM up (the slow side's cut notes are its way of delivering
//     pads: his ear, 10-13); a struck texture (the plan's `texture` and `detail` roles: a bell, a
//     marimba) decays in its own envelope and is not a hold, and a note the compile stage's `hole` cut short is said so;
//   - **drone**: one pitch sounding (restrikes counted) for longer than max(a phrase, 20 s), the limit leaned by Tide,
//     with no move in level, filter or path (its own, or the melodic bus's level and the master's and the bus's
//     filters over the span, or effects, noises and layers coming or going again and again, no stretch between two
//     such moves as long as the limit: his ear, 10-13); on a
//     drone-forward scene the drone is allowed two phrases;
//   - **register**: a bass bend thrown past the bend room's ceiling (floor + 17 + 2); a bass note over floor + 28
//     outside the closing arc's moment; a front melodic note over MIDI 84;
//   - **density**: a drum or bass role striking faster than two onsets a felt sixteenth over a bar; a break's drums
//     busier than the groove's (the median main bar);
//   - **front**: a bell-like key (an electric piano, a mallet, an organ, an FM bell) striking chords outside the sparse
//     keys' scene; a hand drum in a four-on-the-floor groove;
//   - **thin**: a bar of a main or a drop with no kick, no bass and harmony under 30 % of it (a drop-out that took
//     everything, a chord cut with the groove out);
//   - **salient**: nothing salient (a section line, an arrival, a fill, an effect's gesture, the macro filter's move, a
//     phrase entering, a layer coming or going) for longer than 60 s, Veil shortening it to 45 s;
//   - **cost**: a cast over the phone's 220 units; events a minute over the phone's budget.
//
// Beside them, **the ring's liveliness** (U2e, `tools/liveliness.ts`): marks a minute, the longest unmarked stretch
// (his "boring ring" over 45 s), how the marks gather, and how the lanes look (the band inked, the chessboard, the depth),
// each theme against its place's band. A reading, never a finding.
//
// The measured hole (a build bar quieter than the bar before) reads a render, so it stays in the timeline tool.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme, programOf, recipesFor } from '../src/mix.ts';
import { linkRead, linkWrite } from '../src/link.ts';
import { HOUSE, type Spell, type Bird } from '../src/spell.ts';
import { COMPASS } from '../src/bird-influence.ts';
import { CELLS, presetSpell } from '../src/machine/genre-table.ts';
import { lineUnder } from '../src/mined-phrase.ts';
import { musicalTime, clampS, type MusicalTime } from '../src/musical-time.ts';
import { lean } from '../src/lean.ts';
import { nearestEntry, rowOf, type StylePlaces } from '../src/places.ts';
import { castOf } from './ambient-program.ts';
import { themeHash } from './link-digest.ts';
import { livelinessOf, bandOf, outOfBand, type Liveliness } from './liveliness.ts';

/** His "boring ring" (10-13): a stretch of the rim with no mark on it longer than this, in seconds. */
export const LIVELY_BORING_S = 45;
/** The Pages preview a finding's link opens on (`t=` the second to hear); `--base` names another (a local build). */
export const PREVIEW = 'https://eugene-tea.github.io/deep-house/';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The baseline the full report is read against (`--baseline` writes it). */
export const BASELINE = path.join(HERE, 'program-guards-baseline.json');

const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};

// ----- the grid -----

/** A spell of the grid, by name, and the seeds it is planned at. */
export interface GridSpell { name: string; spell: Partial<Spell> | null; seeds: string[] }

const SEEDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const pull = (birds: Partial<Record<Bird, number>>): Partial<Spell> => ({ ...HOUSE, ...birds });

/**
 * **The grid**: every genre tile's spell (the nine cells, Deep House the centre); the ring's corners (each bird of the
 * compass pulled to 0.95) and midpoints (two neighbours at 0.8); the slow side; the odd crossings (opposite birds both
 * pulled; fast without drums; slow with drums); and the ambient benchmark's spell, with its own seed. Seeds 1-12 at
 * each. The Dubstep tile is the Dubstep spell, so seed 6 there is the app's own ear example of the odd crossing.
 */
export function grid(): GridSpell[] {
  const out: GridSpell[] = [];
  for (const c of CELLS) if (c) out.push({ name: `tile ${c.label}`, spell: c.spell && Object.keys(c.spell).length ? presetSpell(c) : null, seeds: SEEDS });
  for (const b of COMPASS) out.push({ name: `ring ${b}`, spell: pull({ [b]: 0.95 }), seeds: SEEDS });
  COMPASS.forEach((b, i) => { const n = COMPASS[(i + 1) % 8]; out.push({ name: `ring ${b}+${n}`, spell: pull({ [b]: 0.8, [n]: 0.8 }), seeds: SEEDS }); });
  out.push({ name: 'ring slow side', spell: pull({ ember: 0.1 }), seeds: SEEDS });
  for (let i = 0; i < 4; i++) { const a = COMPASS[i], z = COMPASS[i + 4]; out.push({ name: `ring ${a}x${z}`, spell: pull({ [a]: 0.9, [z]: 0.9 }), seeds: SEEDS }); }
  out.push({ name: 'ring fast, no spark', spell: pull({ ember: 0.95, spark: 0 }), seeds: SEEDS });
  out.push({ name: 'ring slow, spark', spell: pull({ ember: 0.1, spark: 0.9 }), seeds: SEEDS });
  out.push({ name: '27191 ambient', spell: pull({ ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }), seeds: ['27191', ...SEEDS] });
  return out;
}

/** The written link of a grid point (the page's own writer). */
export const linkOf = (seed: string, spell: Partial<Spell> | null, theme = 0) => linkWrite({ seed, theme, strategy: 'house-v2', spell });

/** What the page plays off a link — read, cast and planned as the page does — and the birds it was planned under. */
export function playedWith(link: string) {
  const read = quiet(() => linkRead(`?${link.replace(/^\?/, '')}`));
  const L = read.link;
  const seed = L.seed ?? '1';
  const cast = quiet(() => recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` }));
  const plan = quiet(() => planTheme(seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development }));
  return { plan, spell: { ...HOUSE, ...(cast.spell ?? {}) } as Spell };
}
/** What the page plays off a link. */
export const playedAt = (link: string) => playedWith(link).plan;

// ----- the guards -----

export type Guard = 'unlabelled' | 'landing' | 'hole' | 'thin' | 'empty' | 'stop' | 'drone' | 'register' | 'density' | 'front' | 'salient' | 'cost';
export const GUARDS: readonly Guard[] = ['unlabelled', 'landing', 'hole', 'thin', 'empty', 'stop', 'drone', 'register', 'density', 'front', 'salient', 'cost'];
/** One finding: the guard, the bar it starts at, how bad (in the guard's own measure), what it is, and the part it fired on. */
export interface Finding { guard: Guard; bar: number; weight: number; says: string; part: string }

type Ev = { t: number; bar: number | null; voice: string; layer: string; part?: string; role?: string; label?: string; note?: string; p: Record<string, any> };
export interface Theme { bpm: number; barSeconds: number; beat: number; bars: number; events: Ev[]; arrangement: { sections: Array<{ kind: string; startBar: number; bars: number }> };
  progression?: { states?: Array<{ bar: number; chord: { label: string } }>; changeEvery?: number }; passage?: { phrases?: Array<{ from: number; to: number; fn: string; voice?: string }> };
  phraseMap?: { time: { felt: 'whole' | 'half'; phraseBars: number; phraseTargetS: number; pinned: boolean }; arrivals: Array<{ bar: number; change: boolean }> };
  phrasing?: { cooldowns?: Array<{ from: number; to: number }> };
  automation?: { macroFilter?: Array<{ t: number; value: number }> };
  dice?: { scene?: string } }

const DRUMS = new Set(['kick', 'clap', 'hats', 'shaker', 'perc']);
/** The harmonic and melodic layers: what holds a chord or sings a line (the bass and the drums are neither). */
const TONAL = new Set(['keys', 'pad', 'lead', 'stab', 'arp', 'pluck', 'piano', 'bell', 'vocal', 'strings', 'melodic']);
/** The front melodic layers: what sings a line in front. */
const FRONT = new Set(['lead', 'arp', 'pluck', 'bell', 'vocal', 'melodic']);
const tonal = (e: Ev) => TONAL.has(e.layer) && typeof e.p.midi === 'number';
/** A bed: what holds the space when no chord or line does (a weather, a vinyl bed, an arranged texture). */
const bedding = (e: Ev) => tonal(e) || e.part === 'texture' || (e.layer === 'fx' && /weather|vinyl|airBed/i.test(e.voice));
const isSnare = (e: Ev) => e.layer === 'clap';

/**
 * **Every threshold, in one place, each in the unit it declares** (`src/musical-time.ts`): felt beats and sixteenths
 * are the pulse the kit makes, phrases the theme's phrase (eight bars at the fast places and the house, four on the
 * slow side), seconds the ear's. The register's ceiling is the bend room's (`bendInRoom`, the liquid row's
 * `bass.register.ceilingSt`), with a margin before a throw past it is said.
 */
export const LIMITS = Object.freeze({
  /** landing: a chord change is a landing after the harmony held this many phrases; a gesture counts within this many bars of it */
  landingHoldPhrases: 0.5, gestureBars: 0.6,
  /** a fill: this many more snares over the last beat than the bar before had, or `fillBar` more over the bar */
  fillBeat: 2, fillBar: 3,
  /** a breath: the last beat's drums at this share of the bar before's, or the bar's at `breathBar` */
  breathBeat: 0.5, breathBar: 0.6,
  /** an entry: the drums on the landing this many times the bar before's; a turn: the hats' steps on it share under this of the bar before's, or their closed voices change */
  entry: 1.5, turn: 0.5,
  /** the run-up into a drop out of an intro or a break, in phrases */
  runUpPhrases: 1,
  /** thin: a main's or a drop's bar with no kick and no bass, its harmony sounding over less than this share of it */
  thinHarmony: 0.3,
  /** hole: nothing harmonic for longer than this many felt beats, and never under `holeLeastS` seconds */
  holeFeltBeats: 1.5, holeLeastS: 0.7,
  /** empty: the groove bare for more than this many phrases; more than `nearPhrases` is said as near */
  emptyPhrases: 1, nearPhrases: 0.5,
  /** stop: a hold of this many seconds or more; the fade it wants (bars, held between seconds); a handover within this many felt beats; none under this tempo (the slow side's cut notes are its way of delivering pads: his ear, 10-13) */
  heldLeastS: 2, fadeBars: 1.5, fadeLeastS: 2, fadeMostS: 5, handoverFeltBeats: 1, stopLeastBpm: 70,
  /** hole: a bar of ticking hats (this many onsets) or of a moving bass line (this many pitches) holds the space (his ear, 10-13: the bass and the hats of a break are a solid break) */
  holeHatsLeast: 2, holeBassMoves: 2,
  /** drone: one pitch for longer than max(this many phrases, `droneLeastS` s), Tide leaning the limit (×0.71 at nought, ×1.41 at one); a drone-forward scene's in phrases; a move in level, in dB */
  dronePhrases: 1, droneLeastS: 20, droneTideStrength: Math.LN2, droneScenePhrases: 2, droneMoveDb: 1,
  /** a filter's move, as the ratio of its highest corner to its lowest over the span (about two semitones) */
  droneMoveRatio: 1.12,
  /** register: the bass's floor its lowest twentieth of notes; the bend room's ceiling over it and the margin before a throw is said; a throw a bend this many semitones over its own line, read over this many sixteenths each side */
  floorShare: 0.05, ceilingSt: 17, marginSt: 2, throwSt: 3, windowSteps: 1.5,
  /** register: a bass note this many semitones over its floor outside the closing arc's moment; a front note over this MIDI */
  bassTopSt: 28, frontTopMidi: 84,
  /** density: a role striking more than this many onsets a felt sixteenth over a bar; a break's drums over this share of the groove's median bar */
  perFeltSixteenth: 2, breakOverGroove: 1,
  /** front: a bell-like key's chord (this many notes struck together); a four-on-the-floor bar (kicks on the four beats) on this share of the groove's bars */
  chordNotes: 3, fourShare: 0.5,
  /** salient: the deadline in seconds, Veil nought to one (60 s to 45 s); a move of the macro filter of this many octaves is a gesture */
  salientMostS: 60, salientLeastS: 45, salientFilterOctaves: 1,
  /** cost: the phone's cast ceiling (units) and its events a minute */
  castUnits: 220, eventsPerMinute: 1200,
});
/** The bell-like keys (an electric piano, a mallet, an organ, an FM bell) and the hand drums, by voice. */
const BELL_LIKE = /^(fmEp|fmEpSoft|fmEpGlass|fmGlass|fmBell|keysTineDark|keysSuitcase|keysReed|keysReedAmp|pianoElectric|marimba|vibes|malletSoft|reedOrgan|organStab)$/;
const HANDS = /^(conga|bongo)$/;

/** A theme's time, as its phrase map resolved it (house-v2's places), else the ring's own rule at its tempo and birds. */
export function timeOf(plan: Theme, spell: Partial<Spell> = HOUSE): MusicalTime {
  const M = plan.phraseMap?.time;
  const t = musicalTime({ bpm: plan.bpm, spell: spell as Record<string, number>, entry: M ? { felt: M.felt } : null });
  return M ? { ...t, phraseFeltBars: M.phraseBars / (M.felt === 'half' ? 2 : 1), phraseBars: M.phraseBars, phraseS: M.phraseBars * t.barS, phraseTargetS: M.phraseTargetS, pinned: M.pinned } : t;
}

/** Every guard over one theme: its plan (the labels, the sections, the chords, the phrase map) and its compiled program (what sounds). */
export function guards(plan: Theme, spell: Partial<Spell> = HOUSE): Finding[] {
  const prog = programOf(plan as any) as unknown as { events: Ev[]; settings: Record<string, any>; duration: number };
  const T = timeOf(plan, spell);
  const bs = plan.barSeconds, beat = plan.beat, s16 = bs / 16, bars = plan.bars;
  const PB = T.phraseBars;
  const ev = prog.events.filter((e) => !e.p?.gone);
  const out: Finding[] = [];
  const find = (guard: Guard, bar: number, weight: number, says: string, part: string) => out.push({ guard, bar, weight: +weight.toFixed(2), says, part });
  const sections = [...plan.arrangement.sections].sort((a, b) => a.startBar - b.startBar);
  const kindAt = (b: number) => sections.find((s) => b >= s.startBar && b < s.startBar + s.bars)?.kind ?? 'outro';
  const endOf = (e: Ev) => e.t + Number(e.p.dur ?? 0);
  // a note's release, as it says or as its voice's settings do (a voice that declares none shapes its own tail: unknown)
  const releaseOf = (e: Ev): number | null => { const r = e.p.release ?? prog.settings?.[e.voice]?.release; return typeof r === 'number' ? r : null; };
  const lastT = Math.max(...ev.map((e) => e.t));
  // per bar: drum onsets, snare onsets by quarter, kicks by step, the layers struck, tonal and bed sounding, bass sounding
  const perBar = Array.from({ length: bars + 1 }, () => ({ drums: 0, snares: 0, lastBeatDrums: 0, lastBeatSnares: 0, kicks: 0, kickSteps: new Set<number>(), hats: new Set<number>(),
    hatVoices: new Set<string>(), tonal: false, bed: false, bass: false, layers: new Set<string>(), byRole: new Map<string, Set<number>>(), bassPitches: new Set<number>(), fx: 0, built: 0 }));
  for (const e of ev) {
    const b = Math.floor(e.t / bs + 1e-6);
    if (b < 0 || b > bars) continue;
    const step = (e.t - b * bs) / s16;
    perBar[b].layers.add(e.layer);
    if (e.layer === 'bass' && typeof e.p.midi === 'number') perBar[b].bassPitches.add(e.p.midi);
    if (e.layer === 'fx') perBar[b].fx++;
    // a role's onsets as the slots they take (thirty-second notes): two voices struck together are one stroke
    if (DRUMS.has(e.layer) || e.layer === 'bass') { const r = perBar[b].byRole.get(e.layer) ?? new Set<number>(); r.add(Math.round(step * 2)); perBar[b].byRole.set(e.layer, r); }
    if (DRUMS.has(e.layer)) {
      perBar[b].drums++;
      if (e.layer === 'kick') { perBar[b].kicks++; perBar[b].kickSteps.add(Math.round(step)); }
      if (isSnare(e)) perBar[b].snares++;
      if (e.layer === 'hats') { perBar[b].hats.add(Math.round(step)); if (!/open/i.test(e.voice)) perBar[b].hatVoices.add(e.voice); }
      if (step >= 11.5) { perBar[b].lastBeatDrums++; if (isSnare(e)) perBar[b].lastBeatSnares++; }
    }
  }
  // what sounds over a bar (the note's span with its release, at most a bar of it): a chord or a line, a bed of any kind, the bass
  for (const e of ev) {
    const isBass = e.layer === 'bass' && typeof e.p.midi === 'number';
    if (!bedding(e) && !isBass) continue;
    const a = Math.floor(e.t / bs + 1e-6), z = Math.min(bars, Math.floor((endOf(e) + Math.min(releaseOf(e) ?? 0, bs)) / bs - 1e-6));
    for (let b = Math.max(0, a); b <= z; b++) {
      if (isBass) { perBar[b].bass = true; continue; }
      perBar[b].bed = true; if (tonal(e)) perBar[b].tonal = true;
    }
  }
  // a build's own hits, off the plan (the program's events carry no `by`): U2d, a kick roll, a hat roll, a stutter as
  // much a fill as a snare roll
  for (const e of plan.events as Array<Ev & { by?: string }>) if (typeof e.by === 'string' && e.by.includes('+build') && DRUMS.has(e.layer) && e.bar != null && e.bar >= 0 && e.bar <= bars) perBar[e.bar].built++;
  const tonalSpans = ev.filter(tonal).map((e) => [e.t, endOf(e) + Math.min(releaseOf(e) ?? 0, bs)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const s of tonalSpans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }

  // unlabelled: a theme the arrangement labels owns every foreground note with a phrase
  if (plan.passage) {
    const fg = plan.events.filter((e) => !e.p?.gone && (e.role === 'sparse-keys' || e.voice === 'wordlessVocal' || (e.part ?? '').startsWith('study-')) && !e.label);
    for (const e of fg) find('unlabelled', e.bar ?? Math.floor(e.t / bs), 1, `${e.voice}${e.part ? `/${e.part}` : ''} ${e.note ?? ''}`.trim(), e.voice);
  }

  // landing: each drop's start, and each chord change after the harmony held half a phrase, outside a break; a landing
  // the drums play into (the bar before has them) wants a gesture
  const landings = new Set<number>(sections.filter((s) => s.kind === 'drop').map((s) => s.startBar));
  const states = plan.progression?.states ?? [];
  for (let i = 1; i < states.length; i++) if (states[i].bar - states[i - 1].bar >= LIMITS.landingHoldPhrases * PB && states[i].chord.label !== states[i - 1].chord.label) landings.add(states[i].bar);
  const fxNear = (b: number) => ev.some((e) => e.layer === 'fx' && Math.abs(e.t - b * bs) <= LIMITS.gestureBars * bs && !/weather|vinyl|airBed/i.test(e.voice));
  for (const L of [...landings].sort((a, b) => a - b)) {
    if (L < 2 || L >= bars || kindAt(L) === 'breakdown') continue;
    const before = perBar[L - 1], prior = perBar[L - 2];
    if (!before.drums) continue; // the drums do not play into it: their entry is the answer
    const fill = before.lastBeatSnares >= prior.lastBeatSnares + LIMITS.fillBeat || before.snares >= prior.snares + LIMITS.fillBar || before.built >= LIMITS.fillBar;
    const breath = (before.lastBeatDrums <= LIMITS.breathBeat * prior.lastBeatDrums && prior.lastBeatDrums > 0) || before.drums <= LIMITS.breathBar * prior.drums;
    const entry = perBar[L].drums > LIMITS.entry * Math.max(1, before.drums);
    const on = perBar[L].hats, shared = [...on].filter((x) => before.hats.has(x)).length;
    const voices = perBar[L].hatVoices, sameVoices = voices.size === before.hatVoices.size && [...voices].every((v) => before.hatVoices.has(v));
    const turn = on.size > 0 && (shared < LIMITS.turn * Math.max(on.size, before.hats.size) || !sameVoices);
    if (fxNear(L) || fill || breath || entry || turn) continue;
    find('landing', L, 1, `${kindAt(L - 1)} into ${kindAt(L)}${states.some((s) => s.bar === L) ? ' (a chord change)' : ''}: no crash, swell, fill, breath, entry or new top`, 'drums');
  }

  // thin: a bar inside a main or a drop with no kick, no bass sounding and harmony over less than `thinHarmony` of it (a
  // drop-out bar that took everything with it, a cut chord and a gap: what a phrase event must never leave, U2's review)
  for (let b = 0; b < bars; b++) {
    if (!['main', 'drop'].includes(kindAt(b)) || perBar[b].kicks > 0 || perBar[b].bass) continue;
    const a = b * bs, z = (b + 1) * bs;
    let cover = 0;
    for (const [x, y] of merged) { if (y <= a) continue; if (x >= z) break; cover += Math.min(y, z) - Math.max(x, a); }
    if (cover / bs < LIMITS.thinHarmony) find('thin', b, 1 - cover / bs, `bar ${b} of a ${kindAt(b)} with no kick, no bass and harmony over ${Math.round(100 * cover / bs)} % of it`, 'arrangement');
  }

  // hole: in a build or a drop, nothing harmonic for longer than max(1.5 felt beats, 0.7 s)
  const hasHarmony = perBar.some((x) => x.tonal);
  if (hasHarmony) {
    const holeS = Math.max(LIMITS.holeFeltBeats * T.feltBeatS, LIMITS.holeLeastS);
    const scope = new Set<number>(buildBars(plan, PB));
    for (const s of sections) if (s.kind === 'drop') for (let b = s.startBar; b < s.startBar + s.bars && b < bars; b++) scope.add(b);
    for (const run of runs([...scope].sort((a, b) => a - b))) {
      const a = run[0] * bs, z = (run[run.length - 1] + 1) * bs;
      let at = a;
      const gaps: Array<[number, number]> = [];
      for (const [x, y] of merged) { if (y <= at) continue; if (x >= z) break; if (x > at) gaps.push([at, x]); at = Math.max(at, y); }
      if (at < z) gaps.push([at, z]);
      // a bar of ticking hats or of a moving bass line holds the space: the gaps are what is left between such bars
      const held = (b: number) => perBar[b] && (perBar[b].hats.size >= LIMITS.holeHatsLeast || perBar[b].bassPitches.size >= LIMITS.holeBassMoves);
      const open: Array<[number, number]> = [];
      for (const [x, y] of gaps) {
        let at2 = x;
        for (let b = Math.floor(x / bs + 1e-6); b * bs < y; b++) {
          if (!held(b)) continue;
          const bx = Math.max(x, b * bs), by = Math.min(y, (b + 1) * bs);
          if (bx > at2) open.push([at2, bx]);
          at2 = Math.max(at2, by);
        }
        if (at2 < y) open.push([at2, y]);
      }
      for (const [x, y] of open) if (y - x > holeS) {
        const b0 = Math.floor(x / bs + 1e-6), b1 = Math.max(b0, Math.ceil(y / bs - 1e-6) - 1);
        find('hole', b0, y - x, `${(y - x).toFixed(1)} s of a ${kindAt(b0) === 'drop' ? 'drop' : 'build'} with nothing harmonic or melodic (bars ${b0}-${b1}; the limit ${holeS.toFixed(1)} s)`, 'harmony');
      }
    }
  }

  // empty: drums and/or bass with nothing harmonic or textural over them, longer than a phrase (half a phrase said as
  // near), outside the intro, the outro, a break and a declared cooldown (the arrangement's phrase into a break, the
  // producer's or the arrangement's phrases' own: `track.phrasing.cooldowns`)
  const cooldown = new Set<number>([...(plan.passage?.phrases ?? []).filter((p) => p.fn === 'intoBreak'), ...(plan.phrasing?.cooldowns ?? [])]
    .flatMap((p) => Array.from({ length: p.to - p.from }, (_, i) => p.from + i)));
  const groove = (b: number) => (perBar[b].drums > 0 || perBar[b].bass) && !['intro', 'outro', 'breakdown'].includes(kindAt(b)) && !cooldown.has(b);
  const bare = [...Array(bars).keys()].filter((b) => groove(b) && !perBar[b].bed);
  for (const run of runs(bare)) if (run.length > LIMITS.nearPhrases * PB) {
    const what = run.every((b) => perBar[b].drums > 0) ? (run.some((b) => perBar[b].bass) ? 'drums and bass' : 'drums') : 'bass';
    find('empty', run[0], run.length / PB, `${run.length} bars of ${what} alone (${run[0]}-${run[run.length - 1]})${run.length <= LIMITS.emptyPhrases * PB ? ', near' : ''}; the phrase is ${PB} bars`, what);
  }

  // stop: a held chord or pad ending while the music goes on, with no fade, handover or release of the fade it wants
  const fadeS = clampS(T, LIMITS.fadeBars, 'bars', LIMITS.fadeLeastS, LIMITS.fadeMostS);
  // a struck texture (a bell, a marimba: the plan's `texture` and `detail` roles) decays in its own envelope and is not a
  // hold (PLAN-UNIFY U1: the long-hold fade leaves it, `recipes/arrangement/hygiene.json`'s `skipRoles`); a note the
  // compile stage cut short (its `hole` treatment: the pad letting a sixteen-bar phrase's last bar go by) is said as such
  const planKey = (e: { voice: string; t: number; p: Record<string, any> }) => `${e.voice}|${e.t.toFixed(4)}|${e.p.midi}`;
  const struckTexture = new Set(plan.events.filter((e) => e.role === 'texture' || e.role === 'detail').map(planKey));
  const planDur = new Map(plan.events.map((e) => [planKey(e), Number(e.p.dur ?? 0)]));
  const held = ev.filter((e) => tonal(e) && (e.layer === 'keys' || e.layer === 'pad') && Number(e.p.dur ?? 0) >= LIMITS.heldLeastS && e.voice !== 'wordlessVocal' && !struckTexture.has(planKey(e)));
  const onsets = ev.filter((e) => tonal(e) && Number(e.p.dur ?? 0) >= s16 * 4).map((e) => e.t).sort((a, b) => a - b);
  const stops = new Map<number, string[]>();
  for (const e of plan.bpm >= LIMITS.stopLeastBpm ? held : []) {
    const d = Number(e.p.dur), end = e.t + d;
    if (end > lastT - bs) continue;
    const gp = e.p.gainPath;
    const faded = Array.isArray(gp) && gp[gp.length - 1] <= 0.5 && gp[gp.length - 2] >= d - 0.05;
    // within a felt beat, the beat itself included (a restrike a beat after a hold's end is a handover, whatever the float says)
    const handed = onsets.some((x) => x > e.t + 0.5 && Math.abs(x - end) <= LIMITS.handoverFeltBeats * T.feltBeatS + 1e-6);
    const r = releaseOf(e);
    if (faded || handed || r == null || r >= fadeS) continue;
    const b = Math.floor(end / bs);
    const l = stops.get(b) ?? []; l.push(`${e.voice} ${e.note ?? e.p.midi} (release ${r.toFixed(1)} s)${(planDur.get(planKey(e)) ?? d) > d + 1e-6 ? ' hole' : ''}`); stops.set(b, l);
  }
  for (const [b, xs] of stops) find('stop', b, xs.length, `${xs.length} held note${xs.length > 1 ? 's' : ''} stop at ${b} with no fade (${[...new Set(xs.map((x) => x.split(' ')[0]))].join(', ')}; ${fadeS.toFixed(1)} s wanted)${xs.every((x) => x.endsWith(' hole')) ? ', cut by the stage\'s hole' : ''}`,
    [...new Set(xs.map((x) => x.split(' ')[0]))].join(','));

  // drone: one pitch sounding on a part (restrikes counted) longer than its limit with nothing in it moving
  const droneForward = plan.dice?.scene === 'drone-forward';
  const droneS = Math.max((droneForward ? LIMITS.droneScenePhrases : LIMITS.dronePhrases) * T.phraseS, LIMITS.droneLeastS) * lean(1, spell.tide, LIMITS.droneTideStrength, 0.5);
  const chains = new Map<string, Ev[]>();
  for (const e of ev) if (tonal(e)) { const k = `${e.layer}|${e.voice}|${e.p.midi}`; const l = chains.get(k); if (l) l.push(e); else chains.set(k, [e]); }
  // a move: a path of the note's own that goes somewhere (a level, a filter, a pan, a pitch), or the melodic bus's level or
  // the master's and the bus's filters moving over the span (`automation`)
  const pathMoves = (x: unknown) => Array.isArray(x) ? new Set(x.filter((_, i) => x.length <= 2 || i % 2 === 1).map((v) => Number(v).toFixed(3))).size > 1 : x != null && typeof x === 'object';
  const moves = (e: Ev) => ['gainPath', 'lpPath', 'hpPath', 'cutoffPath', 'panPath', 'swell', 'pitchPath', 'bend', 'lpMul', 'hpMul'].some((k) => pathMoves(e.p[k]));
  const A = (plan as unknown as { automation?: Record<string, any> }).automation ?? {};
  const lanes: Array<{ pts: Array<{ t: number; value: number }>; dB: boolean }> = [
    ...(Array.isArray(A.melodicGain) ? [{ pts: A.melodicGain, dB: true }] : []),
    ...(Array.isArray(A.macroFilter) ? [{ pts: A.macroFilter, dB: false }] : []),
    ...['lp', 'hp'].flatMap((k) => (Array.isArray(A.sweep?.[k]?.cutoff) ? [{ pts: A.sweep[k].cutoff, dB: false }] : [])),
  ];
  const valueAt = (pts: Array<{ t: number; value: number }>, t: number) => { let v = pts[0]?.value; for (const p of pts) { if (p.t > t) break; v = p.value; } return v; };
  const busMoves = (a: number, z: number) => lanes.some(({ pts, dB }) => {
    const vs = [valueAt(pts, a), ...pts.filter((p) => p.t > a && p.t < z).map((p) => p.value)].filter((v) => typeof v === 'number' && v > 0);
    if (vs.length < 2) return false;
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return dB ? 20 * Math.log10(hi / lo) >= LIMITS.droneMoveDb : hi / lo >= LIMITS.droneMoveRatio;
  });
  const levelDb = (e: Ev) => 20 * Math.log10(Math.max(1e-6, Number(e.p.gain ?? 1) * Number(e.p.vel ?? 1)));
  // the field moving around a held pitch (his ear, 10-13: on Spark and Loom high, seed 10, the wave effects and the noise
  // move over the drone, and people like it): an effect or a noise struck, or a layer coming or going, again and again —
  // the drone moves where no stretch of it, from its start through each such move to its end, outlasts the drone's limit
  const fxOnsets = ev.filter((e) => e.layer === 'fx').map((e) => e.t).sort((x, y) => x - y);
  const fieldGaps = (a: number, z: number): number => {
    const at: number[] = [a];
    for (const t of fxOnsets) if (t > a && t < z) at.push(t);
    const b0 = Math.floor(a / bs + 1e-6), b1 = Math.min(bars, Math.floor(z / bs - 1e-6));
    const sig = (b: number) => [...perBar[b].layers].sort().join('|');
    for (let b = b0 + 1; b <= b1; b++) if (sig(b) !== sig(b - 1)) at.push(b * bs);
    at.push(z);
    at.sort((x, y) => x - y);
    let most = 0;
    for (let i = 1; i < at.length; i++) most = Math.max(most, at[i] - at[i - 1]);
    return most;
  };
  const fieldMoves = (a: number, z: number) => fieldGaps(a, z) < droneS;
  for (const [k, list] of chains) {
    list.sort((a, b) => a.t - b.t);
    let run: Ev[] = [];
    const close = () => {
      if (!run.length) return;
      const a = run[0].t, z = Math.max(...run.map(endOf)), span = z - a;
      const lv = run.map(levelDb);
      if (span > droneS && !run.some(moves) && Math.max(...lv) - Math.min(...lv) < LIMITS.droneMoveDb && !busMoves(a, z) && !fieldMoves(a, z)) {
        const [layer, voice, midi] = k.split('|');
        find('drone', Math.floor(a / bs), span, `${voice} holds ${run[0].note ?? midi} for ${span.toFixed(0)} s (${run.length} strike${run.length > 1 ? 's' : ''}) with nothing moving; the limit ${droneS.toFixed(0)} s`, `${layer}/${voice}`);
      }
      run = [];
    };
    for (const e of list) { if (run.length && e.t > Math.max(...run.map(endOf)) + 0.25) close(); run.push(e); }
    close();
  }

  // register: a bass bend thrown over its own line past the bend room's ceiling; a bass note over floor + 28 outside the
  // closing arc's moment; a front note over MIDI 84
  const bass = ev.filter((e) => e.layer === 'bass' && typeof e.p.midi === 'number');
  if (bass.length) {
    const sorted = bass.map((e) => Number(e.p.midi)).sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * LIMITS.floorShare)], cap = floor + LIMITS.ceilingSt + LIMITS.marginSt;
    for (const e of bass) {
      if (!Array.isArray(e.p.bend)) continue;
      const x = bendThrow(e.p.bend as number[], Number(e.p.dur ?? 0), LIMITS.windowSteps * s16);
      const top = Number(e.p.midi) + x.top;
      if (x.throw > LIMITS.throwSt && top > cap) find('register', Math.floor(e.t / bs), top - cap, `a bend throws the line +${x.throw.toFixed(1)} to ${top.toFixed(1)} (${(top - floor).toFixed(1)} over its floor ${floor})`, `bass/${e.voice}`);
    }
    const feature = (plan.passage?.phrases ?? []).filter((p) => (p.voice ?? '').startsWith('the closing arc'));
    const inFeature = (b: number) => feature.some((p) => b >= p.from && b < p.to);
    const high = bass.filter((e) => Number(e.p.midi) > floor + LIMITS.bassTopSt && !inFeature(Math.floor(e.t / bs)));
    for (const run of runs([...new Set(high.map((e) => Math.floor(e.t / bs)))].sort((a, b) => a - b)))
      find('register', run[0], Math.max(...high.filter((e) => run.includes(Math.floor(e.t / bs))).map((e) => Number(e.p.midi))) - floor - LIMITS.bassTopSt,
        `the bass climbs over its floor ${floor} + ${LIMITS.bassTopSt} outside the closing arc's moment (bars ${run[0]}-${run[run.length - 1]})`, 'bass');
  }
  const frontHigh = ev.filter((e) => FRONT.has(e.layer) && typeof e.p.midi === 'number' && Number(e.p.midi) > LIMITS.frontTopMidi);
  for (const run of runs([...new Set(frontHigh.map((e) => Math.floor(e.t / bs)))].sort((a, b) => a - b))) {
    const xs = frontHigh.filter((e) => run.includes(Math.floor(e.t / bs)));
    find('register', run[0], Math.max(...xs.map((e) => Number(e.p.midi))) - LIMITS.frontTopMidi, `a front line over MIDI ${LIMITS.frontTopMidi} (${[...new Set(xs.map((e) => e.voice))].join(', ')} to ${Math.max(...xs.map((e) => Number(e.p.midi)))}, bars ${run[0]}-${run[run.length - 1]})`,
      [...new Set(xs.map((e) => `${e.layer}/${e.voice}`))].join(','));
  }

  // density: a role striking faster than two onsets a felt sixteenth; a break busier than the groove
  const capPerBar = LIMITS.perFeltSixteenth * 16 * bs / T.feltBarS;
  const roles = new Set(perBar.flatMap((x) => [...x.byRole.keys()]));
  for (const role of roles) {
    const n = (b: number) => perBar[b].byRole.get(role)?.size ?? 0;
    const over = [...Array(bars).keys()].filter((b) => n(b) > capPerBar);
    for (const run of runs(over)) {
      const most = Math.max(...run.map(n));
      find('density', run[0], most / capPerBar, `${role} strikes on ${most} slots of a bar (bars ${run[0]}-${run[run.length - 1]}), over ${capPerBar.toFixed(0)} (two a felt sixteenth)`, role);
    }
  }
  const grooveDrums = [...Array(bars).keys()].filter((b) => kindAt(b) === 'main' || kindAt(b) === 'groove' || kindAt(b) === 'drop').map((b) => perBar[b].drums).filter((n) => n > 0).sort((a, b) => a - b);
  const median = grooveDrums.length ? grooveDrums[Math.floor(grooveDrums.length / 2)] : 0;
  if (median > 0) for (const s of sections.filter((x) => x.kind === 'breakdown')) {
    const xs = Array.from({ length: s.bars }, (_, i) => perBar[s.startBar + i]?.drums ?? 0);
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    if (mean > LIMITS.breakOverGroove * median) find('density', s.startBar, mean / median, `the break at ${s.startBar} strikes ${mean.toFixed(0)} drums a bar against the groove's ${median}`, 'drums');
  }

  // front: a bell-like key striking chords outside the sparse keys' scene; a hand drum in a four-on-the-floor groove
  const chordsBy = new Map<string, Set<number>>();
  const struck = new Map<string, number>();
  for (const e of ev) if (tonal(e) && BELL_LIKE.test(e.voice) && e.role !== 'sparse-keys') { const k = `${e.voice}@${e.t.toFixed(3)}`; struck.set(k, (struck.get(k) ?? 0) + 1); }
  for (const [k, n] of struck) if (n >= LIMITS.chordNotes) { const [voice, t] = k.split('@'); const s = chordsBy.get(voice) ?? new Set<number>(); s.add(Math.floor(Number(t) / bs + 1e-6)); chordsBy.set(voice, s); }
  if (!droneForward) for (const [voice, bs_] of chordsBy) {
    const xs = [...bs_].sort((a, b) => a - b);
    find('front', xs[0], xs.length, `${voice}, a bell-like key, strikes chords in front on ${xs.length} bars from bar ${xs[0]}`, voice);
  }
  const grooveBars = [...Array(bars).keys()].filter((b) => perBar[b].kicks > 0 && !['intro', 'outro', 'breakdown'].includes(kindAt(b)));
  const four = grooveBars.filter((b) => [0, 4, 8, 12].every((s) => perBar[b].kickSteps.has(s)));
  if (grooveBars.length && four.length >= LIMITS.fourShare * grooveBars.length) {
    const fourSet = new Set(four);
    const hands = ev.filter((e) => HANDS.test(e.voice) && fourSet.has(Math.floor(e.t / bs + 1e-6)));
    const hb = [...new Set(hands.map((e) => Math.floor(e.t / bs + 1e-6)))].sort((a, b) => a - b);
    if (hb.length) find('front', hb[0], hb.length, `a hand drum (${[...new Set(hands.map((e) => e.voice))].join(', ')}) in a four-on-the-floor groove on ${hb.length} bars from bar ${hb[0]}`, [...new Set(hands.map((e) => e.voice))].join(','));
  }

  // salient: the longest stretch with nothing salient, against a deadline Veil shortens
  const deadline = LIMITS.salientMostS - (LIMITS.salientMostS - LIMITS.salientLeastS) * Math.min(1, Math.max(0, spell.veil ?? 0.5));
  const marks: number[] = [0, ...sections.map((s) => s.startBar * bs), ...(plan.phraseMap?.arrivals ?? []).map((a) => a.bar * bs)];
  for (const e of ev) if (e.layer === 'fx' && !/weather|vinyl|airBed/i.test(e.voice)) marks.push(e.t);
  // the macro filter's move (a filtered phrase, a breakdown's close): its corner an octave or more from where it stood
  const macro = plan.automation?.macroFilter ?? [];
  for (let i = 1; i < macro.length; i++) if (Math.abs(Math.log2(macro[i].value / Math.max(1, macro[i - 1].value))) >= LIMITS.salientFilterOctaves) marks.push(macro[i].t);
  for (let b = 1; b < bars; b++) {
    const x = perBar[b], y = perBar[b - 1];
    if (x.snares >= y.snares + LIMITS.fillBar || x.lastBeatSnares >= y.lastBeatSnares + LIMITS.fillBeat) marks.push(b * bs);
    if ([...x.layers].some((l) => !y.layers.has(l)) || [...y.layers].some((l) => !x.layers.has(l))) marks.push(b * bs);
  }
  const lastFront = new Map<string, number>();
  for (const e of [...ev].filter((x) => (FRONT.has(x.layer) || x.role === 'sparse-keys') && typeof x.p.midi === 'number').sort((a, b) => a.t - b.t)) {
    const was = lastFront.get(e.layer);
    if (was == null || e.t - was >= bs) marks.push(e.t);
    lastFront.set(e.layer, endOf(e));
  }
  marks.push(Math.min(lastT, bars * bs));
  marks.sort((a, b) => a - b);
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > deadline) {
    const b = Math.floor(marks[i - 1] / bs + 1e-6);
    find('salient', b, marks[i] - marks[i - 1], `${(marks[i] - marks[i - 1]).toFixed(0)} s with nothing salient from bar ${b} (no section line, arrival, fill, gesture, phrase or layer change; the deadline ${deadline.toFixed(0)} s)`, 'arrangement');
  }

  // cost: the cast against the phone's ceiling, the events a minute against its budget
  const cast = castOf(prog);
  if (cast.total > LIMITS.castUnits) find('cost', 0, cast.total - LIMITS.castUnits, `the cast is ${cast.total} units (voices ${cast.voices}, space ${cast.space}), over ${LIMITS.castUnits}`, 'cast');
  const perMin = prog.events.length / (Math.max(1, bars * bs) / 60);
  if (perMin > LIMITS.eventsPerMinute) find('cost', 0, perMin / LIMITS.eventsPerMinute, `${perMin.toFixed(0)} events a minute, over ${LIMITS.eventsPerMinute}`, 'events');
  return out.sort((a, b) => a.bar - b.bar);
}

/** Runs of consecutive bars. */
function runs(xs: number[]): number[][] {
  const out: number[][] = [];
  for (const x of xs) { const l = out[out.length - 1]; if (l && l[l.length - 1] === x - 1) l.push(x); else out.push([x]); }
  return out;
}

/** How far a bend path throws its note over its own line (`lineUnder`, as the register's room reads it), and the knot's height. */
export function bendThrow(b: number[], d: number, w: number): { throw: number; top: number } {
  let thrown = 0, top = 0;
  for (let i = 0; i < b.length; i += 2) {
    if (b[i] > d) break;
    const x = b[i + 1] - lineUnder(b, i >> 1, w);
    if (x > thrown) { thrown = x; top = b[i + 1]; }
  }
  return { throw: thrown, top };
}

/** The bars of a theme's builds: every build section, and the run-up (a phrase, `runUpPhrases`) into a drop out of an intro or a break. */
export function buildBars(plan: Pick<Theme, 'arrangement'>, phraseBars = 8): Set<number> {
  const sections = [...plan.arrangement.sections].sort((a, b) => a.startBar - b.startBar);
  const kindAt = (b: number) => sections.find((s) => b >= s.startBar && b < s.startBar + s.bars)?.kind ?? 'outro';
  const build = new Set<number>();
  const runUp = Math.round(LIMITS.runUpPhrases * phraseBars);
  for (const s of sections) {
    if (s.kind === 'build') for (let b = s.startBar; b < s.startBar + s.bars; b++) build.add(b);
    if (s.kind === 'drop' && s.startBar > 0 && ['intro', 'breakdown'].includes(kindAt(s.startBar - 1))) for (let b = Math.max(0, s.startBar - runUp); b < s.startBar; b++) build.add(b);
  }
  return build;
}

// ----- the birds at the fast places (PLAN-UNIFY, the addendum of 10-12) -----

/** The Drum & Bass tile's birds (the liquid key), Gleam at the house's. */
const TILE: Partial<Spell> = { ember: 0.95, tide: 0.45, zephyr: 0.60, root: 0.75, veil: 0.60, spark: 0.85, loom: 0.85 };
/** The three anchors a bird is swept from: the tile, the tile at Ember and Spark maxed, and a house position. */
export const ANCHORS: Record<string, Partial<Spell>> = { tile: { ...HOUSE, ...TILE }, max: { ...HOUSE, ...TILE, ember: 1, spark: 1 }, house: { ...HOUSE, ember: 0.5, spark: 0.3 } };
export const SWEPT: readonly Bird[] = ['zephyr', 'tide', 'root', 'gleam', 'loom', 'veil'];
/** The eight seeds of the 10-12 analysis. */
export const BIRD_SEEDS: readonly string[] = ['1', '2', '7', '15576', '27191', '1620', '32012', '10079'];
const SWEEP = [0, 0.25, 0.5, 0.75, 1];

/** Where a theme stands in its style's place tables: each table's nearest entry, by id and by row (what it says). */
function placesOf(plan: { style?: { places?: StylePlaces }; bpm: number }, spell: Spell): { ids: string; rows: string } {
  const P = (plan.style?.places ?? {}) as Record<string, unknown>;
  const ids: string[] = [], rows: string[] = [];
  for (const [k, tab] of Object.entries(P)) {
    if (!Array.isArray(tab) || !tab.length || !(tab[0] as { place?: unknown }).place) continue;
    const e = nearestEntry(tab as any, spell, plan.bpm);
    ids.push(`${k}:${e?.id ?? 'house'}`); rows.push(`${k}:${rowOf(e)}`);
  }
  return { ids: ids.join('\n'), rows: rows.join('\n') };
}

/**
 * **Bird inertness**: for each anchor and each swept bird, over the eight seeds, the mean number of distinct tracks a
 * five-value sweep gives (5.0: every position a different track), and the place tables it crosses — by entry and by
 * row. A flip onto an entry whose row is the same is not steering: only the rows count as the bird moving a table.
 */
export function birdInertness(): Record<string, Record<string, { tracks: number; rows: number; entries: number }>> {
  const out: Record<string, Record<string, { tracks: number; rows: number; entries: number }>> = {};
  for (const [name, base] of Object.entries(ANCHORS)) {
    out[name] = {};
    for (const bird of SWEPT) {
      let tracks = 0, rows = 0, entries = 0;
      for (const seed of BIRD_SEEDS) {
        const h = new Set<string>(), r = new Set<string>(), e = new Set<string>();
        for (const v of SWEEP) {
          const { plan, spell } = playedWith(linkOf(seed, { ...base, [bird]: v }));
          h.add(themeHash(plan as any));
          const p = placesOf(plan as any, spell);
          r.add(p.rows); e.add(p.ids);
        }
        tracks += h.size; rows += r.size; entries += e.size;
      }
      const n = BIRD_SEEDS.length;
      out[name][bird] = { tracks: +(tracks / n).toFixed(2), rows: +(rows / n).toFixed(2), entries: +(entries / n).toFixed(2) };
    }
  }
  return out;
}

// ----- the run -----

/** A finding's whole link: the page, the written link, the second its bar starts at. */
export const findingLink = (link: string, barSeconds: number, bar: number, base = PREVIEW) => `${base}?${link}&t=${Math.max(0, Math.floor(bar * barSeconds))}`;

interface Row { spell: string; seed: string; link: string; bpm: number; barSeconds: number; phraseBars: number; ms: number; found: Finding[];
  /** the ring's liveliness (U2e, `tools/liveliness.ts`): a reading, never a finding */
  live: Liveliness; out: string[] }

/** The worst ten: by weight inside each guard, ranked across guards by how far over the guard's own median it stands; no more than two of one guard and one of a theme a guard. */
function worstTen(rows: Row[]) {
  const all = rows.flatMap((r) => r.found.map((f) => ({ ...f, row: r })));
  const medians = new Map<Guard, number>();
  for (const g of GUARDS) { const v = all.filter((f) => f.guard === g).map((f) => f.weight).sort((a, b) => a - b); medians.set(g, v.length ? v[Math.floor(v.length / 2)] : 1); }
  const score = (f: Finding) => f.weight / Math.max(1e-6, medians.get(f.guard)!);
  const worst: typeof all = [];
  for (const f of [...all].sort((a, b) => score(b) - score(a) || b.weight - a.weight)) {
    if (worst.length >= 10) break;
    if (worst.filter((x) => x.guard === f.guard).length >= 2 || worst.some((x) => x.row.link === f.row.link && x.guard === f.guard)) continue;
    worst.push(f);
  }
  return { all, worst };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const base = arg('--base') ?? PREVIEW;
  if (argv.includes('--link')) {
    const link = arg('--link')!.replace(/^.*\?/, '');
    const { plan, spell } = playedWith(link);
    const found = guards(plan as unknown as Theme, spell);
    for (const g of GUARDS) {
      const xs = found.filter((f) => f.guard === g);
      console.log(`${g}: ${xs.length ? xs.map((f) => `${f.bar} ${f.says}`).join('; ') : 'none'}`);
    }
    const live = livelinessOf(plan as unknown as Parameters<typeof livelinessOf>[0]), band = bandOf(spell as unknown as Record<string, number>, (plan as unknown as Theme).bpm);
    console.log(`liveliness: ${JSON.stringify(live)}; band ${JSON.stringify(band)}${outOfBand(live, band).length ? `; out: ${outOfBand(live, band).join(', ')}` : ''}`);
    return;
  }
  const line = argv.includes('--line');
  const t0 = performance.now();
  const rows: Row[] = [];
  for (const g of grid()) for (const seed of g.seeds) {
    const link = linkOf(seed, g.spell);
    const a = performance.now();
    const { plan, spell } = playedWith(link);
    const ms = performance.now() - a;
    const P = plan as unknown as Theme;
    const live = livelinessOf(P as unknown as Parameters<typeof livelinessOf>[0]);
    rows.push({ spell: g.name, seed, link, bpm: P.bpm, barSeconds: P.barSeconds, phraseBars: timeOf(P, spell).phraseBars, ms, found: guards(P, spell),
      live, out: outOfBand(live, bandOf(spell as unknown as Record<string, number>, P.bpm)) });
  }
  const ms = performance.now() - t0;
  const total = (g: Guard) => rows.reduce((a, r) => a + r.found.filter((f) => f.guard === g).length, 0);
  // the ring's liveliness (U2e): his "boring ring", a stretch of more than 45 s with no mark; and each theme against its place's band
  const boring = rows.filter((r) => r.live.longestS > LIVELY_BORING_S).length, outBand = rows.filter((r) => r.out.length).length;
  const med = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  const liveLine = `liveliness ${med(rows.map((r) => r.live.perMin)).toFixed(1)} marks a minute (median), ${boring} themes with over ${LIVELY_BORING_S} s unmarked, ${outBand} out of their band`;
  if (line) { console.log(`program guards (a report, not a gate; npm run guards for the table and the birds): ${GUARDS.map((g) => `${g} ${total(g)}`).join(' · ')} · ${liveLine} over ${rows.length} themes in ${(ms / 1000).toFixed(1)} s`); return; }
  const was = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as { totals: Record<string, number>; perSpell: Record<string, Record<string, number>>; birds?: ReturnType<typeof birdInertness>;
    liveliness?: { line: string } } : null;
  const names = [...new Set(rows.map((r) => r.spell))];
  const w = Math.max(...names.map((n) => n.length));
  const short: Record<Guard, string> = { unlabelled: 'unlab', landing: 'land', hole: 'hole', thin: 'thin', empty: 'empty', stop: 'stop', drone: 'drone', register: 'reg', density: 'dens', front: 'front', salient: 'salnt', cost: 'cost' };
  console.log(`${'spell'.padEnd(w)}  ${GUARDS.map((g) => short[g].padStart(6)).join('')}   bpm      phrase  plan ms (median/max)`);
  const perSpell: Record<string, Record<string, number>> = {};
  for (const n of names) {
    const rs = rows.filter((r) => r.spell === n);
    perSpell[n] = Object.fromEntries(GUARDS.map((g) => [g, rs.reduce((a, r) => a + r.found.filter((f) => f.guard === g).length, 0)]));
    const bpms = [...new Set(rs.map((r) => Math.round(r.bpm)))].sort((a, b) => a - b);
    const pbs = [...new Set(rs.map((r) => r.phraseBars))].sort((a, b) => a - b);
    const mss = rs.map((r) => r.ms).sort((a, b) => a - b);
    console.log(`${n.padEnd(w)}  ${GUARDS.map((g) => String(perSpell[n][g]).padStart(6)).join('')}   ${(bpms.length > 2 ? `${bpms[0]}-${bpms[bpms.length - 1]}` : bpms.join(',')).padEnd(8)} ${pbs.join(',').padStart(6)}  ${mss[Math.floor(mss.length / 2)].toFixed(0)}/${mss[mss.length - 1].toFixed(0)}`);
  }
  const totals = Object.fromEntries(GUARDS.map((g) => [g, total(g)]));
  console.log(`${'total'.padEnd(w)}  ${GUARDS.map((g) => String(totals[g]).padStart(6)).join('')}`);
  if (was) console.log(`${'baseline'.padEnd(w)}  ${GUARDS.map((g) => String(was.totals[g] ?? '-').padStart(6)).join('')}`);
  // the ring's liveliness by spell: the medians of its readings, the themes over 45 s unmarked, the themes out of their band
  console.log(`\nthe ring's liveliness (a reading, not a gate; tools/liveliness.ts): medians by spell, and the themes out of their place's band`);
  console.log(`${'spell'.padEnd(w)}  ${['/min', 'gap s', 'clust', 'fill', 'chess', 'depth', '>45s', 'out'].map((x) => x.padStart(6)).join('')}`);
  const liveSpell: Record<string, Record<string, number>> = {};
  for (const n of names) {
    const rs = rows.filter((r) => r.spell === n);
    const m = (k: keyof Liveliness) => med(rs.map((r) => r.live[k] as number));
    liveSpell[n] = { perMin: m('perMin'), longestS: m('longestS'), cluster: m('cluster'), fill: m('fill'), chess: m('chess'), depth: m('depth'),
      boring: rs.filter((r) => r.live.longestS > LIVELY_BORING_S).length, out: rs.filter((r) => r.out.length).length };
    const L = liveSpell[n];
    console.log(`${n.padEnd(w)}  ${[L.perMin.toFixed(1), L.longestS.toFixed(0), L.cluster.toFixed(2), L.fill.toFixed(2), L.chess.toFixed(2), L.depth.toFixed(2), String(L.boring), String(L.out)].map((x) => x.padStart(6)).join('')}`);
  }
  console.log(liveLine);
  if (was?.liveliness) console.log(`baseline: ${was.liveliness.line}`);
  const { all, worst } = worstTen(rows);
  console.log('\nthe worst ten (at most two a guard):');
  for (const f of worst) console.log(`  ${f.guard} · ${f.row.spell} seed ${f.row.seed} bar ${f.bar} (${f.part}): ${f.says}\n    ${findingLink(f.row.link, f.row.barSeconds, Math.max(0, f.bar - 2), base)}`);
  // the ear examples: seed 6 at the Dubstep spell (the odd crossing) and 27191 at its own spell (the benchmark)
  const examples = rows.filter((r) => (r.spell === 'tile Dubstep' && r.seed === '6') || (r.spell === '27191 ambient' && r.seed === '27191'))
    .map((r) => ({ spell: r.spell, seed: r.seed, link: r.link, phraseBars: r.phraseBars, counts: Object.fromEntries(GUARDS.map((g) => [g, r.found.filter((f) => f.guard === g).length])) }));
  console.log('\nthe ear examples:');
  for (const x of examples) console.log(`  ${x.spell} seed ${x.seed} (phrase ${x.phraseBars} bars): ${GUARDS.filter((g) => x.counts[g]).map((g) => `${g} ${x.counts[g]}`).join(' · ') || 'nothing found'}`);
  // the birds at the fast places
  const birds = birdInertness();
  console.log('\nbird inertness: distinct tracks per five-value sweep, mean of 8 seeds (5.0: every position a different track); place rows crossed (entries)');
  console.log(`${'anchor'.padEnd(7)}${SWEPT.map((b) => b.padStart(16)).join('')}`);
  for (const [a, xs] of Object.entries(birds)) console.log(`${a.padEnd(7)}${SWEPT.map((b) => `${xs[b].tracks.toFixed(1)} · ${xs[b].rows.toFixed(1)} (${xs[b].entries.toFixed(1)})`.padStart(16)).join('')}`);
  if (was?.birds) {
    const moved = Object.entries(birds).flatMap(([a, xs]) => SWEPT.filter((b) => was.birds![a]?.[b]?.tracks !== xs[b].tracks).map((b) => `${a} ${b} ${was.birds![a]?.[b]?.tracks} -> ${xs[b].tracks}`));
    console.log(moved.length ? `against the baseline: ${moved.join('; ')}` : 'against the baseline: every sweep as it was');
  }
  console.log(`\n${rows.length} themes in ${(ms / 1000).toFixed(1)} s; a report, never a failure`);
  const jsonAt = argv.indexOf('--json');
  if (jsonAt >= 0) fs.writeFileSync(argv[jsonAt + 1], JSON.stringify(rows, null, 1));
  if (argv.includes('--baseline')) {
    const doc = {
      note: 'The program guards\' baseline (tools/check-program-guards.ts --baseline): the counts per guard per spell over the grid (the tiles, the ring\'s corners and midpoints, the slow side, the crossings, the Dubstep spell, 27191; seeds 1-12), the worst ten with their links, and the bird-inertness table (distinct tracks per five-value sweep, mean of the eight seeds; the place rows a sweep crosses, and the entries in brackets). A report, not a gate: rewritten when a round moves what it reads, said in the round\'s note.',
      themes: rows.length,
      totals,
      perSpell,
      examples,
      worst: worst.map((f) => ({ guard: f.guard, spell: f.row.spell, seed: f.row.seed, bar: f.bar, part: f.part, weight: f.weight, says: f.says, link: findingLink(f.row.link, f.row.barSeconds, Math.max(0, f.bar - 2)) })),
      birds,
      liveliness: { line: liveLine, perSpell: liveSpell },
    };
    fs.writeFileSync(BASELINE, `${JSON.stringify(doc, null, 1)}\n`);
    console.log(`baseline written: ${path.relative(process.cwd(), BASELINE)} (${all.length} findings)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
