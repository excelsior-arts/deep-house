// **The trance corner, drawn** (round trance-drawn, 11-04). His word on the dream round: *"we take one theme (supersaw
// that time) now it's piano, and make everything in the genre sound exactly the same … I was rather hoping it would be
// organic integration of genre specific techniques in the birds position while having our app voice"*; and: *"we don't
// really want to reproduce that 90s cheap sound … what we want is moods, approaches on trance classics, while staying in
// our noisy, deep, ambient Deep House app domain."*
//
// So the corner shares its **grammar** (the tempo band, the four-on-the-floor groove, the long arc of breakdowns and
// builds, eight-bar phrases: the place's rows, untouched) and draws its **techniques**: each theme inside the corner's
// radius draws one front and one or two more by its own die (`<seed>::trance-drawn`), each weighted by the birds
// (`recipes/arrangement/trance-techniques.json`), the voices from the house's palette. The kit, the sub and its weight,
// the noise, the grit and the master are the house's own: a technique brings a mood and a phrasing, never thin drums or
// a shallow bass.
//
//   fronts   the melancholic phrase (a call and its answer over eight bars, landing on long notes), the hypnotic figure
//            (a sixteenth cell grouped 3+3+2, a note turning every eight bars, its filter moving for minutes), or today's
//            saw riff (the gallops and the gated chords, kept whole as they are drawn);
//   colours  a voice-like pad calling in long curves, the dark cinematic bed (a low drone, distance), the euphoric
//            progression (a lifting loop, the build opening into the drop's brightest chord): one bed at most; the long
//            filter-opening build; the breakdown stripped to the melody; echo throws; the rolling bass in our weight; the
//            smooth supersaw as the last drop's peak; the dream opening (no kick for sixteen bars); strip to the groove.
//
// Nothing here names a genre: the row says which places' radius it reads, and the writers are named for what they play.
// Pure: no DOM, no engine audio; the voices' cost read off the engine's tables.

import FILE from '../recipes/arrangement/trance-techniques.json' with { type: 'json' };
import Rng from './rng.ts';
import { scaleNote, voiceHeld, chordAtBar } from './theory.ts';
import { stepToBeats } from './patterns.ts';
import { placeDistance, nearestEntry, type Place, type PlaceEntry } from './places.ts';
import { CEILING } from './catalogue-v2.ts';
import { settingsOf } from '@deep-house/engine/settings';
import { costOf as effectsCost } from '@deep-house/engine/effects';
import { BY_NAME, VOICE_COST_UNITS } from '@deep-house/engine/voices';
import type { PlanEvent, Track } from './generator.ts';
import type { Bird, Spell } from './spell.ts';

type Leans = Partial<Record<Bird, number>>;
interface Weighted { w: number; by?: Leans }
interface VoicePick extends Weighted { v: string }
interface Technique extends Weighted { id: string; where: string; bed?: boolean; needs?: string[]; voices?: VoicePick[]; double?: { v: string; db: number } }
export interface TranceRow {
  id: string; places: string[]; radius: number;
  more: { w: number; by: Leans; most: number };
  /** the saw riff's own call, beside the walk (pass 2) */
  sawCall?: { w: number; by: Leans; most: number };
  fronts: Technique[]; colours: Technique[]; beds: VoicePick[]; gains: Record<string, number>; gainsAbout?: string;
  /** a release pays for its wait (the third pass): how much longer than its release a wait may run, leaned by Loom */
  release?: Weighted & { about?: string };
}
export const TRANCE_ROW: TranceRow = (FILE as unknown as { rows: TranceRow[] }).rows[0];

/** What the draw chose for a theme, said on the plan (`tranceDrawn`). */
export interface TranceRead {
  front: string; voice: string; colours: string[]; bed: string; double: string | null;
  /** what the phone's ceiling took out, where it took any */
  shed?: string[];
  /** the form's ask on the first plan (the third and fourth passes): each wait that outran its release and what pays it, the intro's and the outro's bars */
  form?: { wants: Array<{ section: number; at: number; bars: number; kind: 'pay'; give: number; drop: number; grow?: number; what: 'breakdown-gives' | 'drop-grows' | 'main-gives' | 'intro' | 'outro' }>; said: string[] };
}

/**
 * **A release pays for its wait** (the third pass; his ear 11-04 on Trance 4568: *"this break looks a bit too long?"*: a
 * breakdown of 32 bars and a build of 16 into a drop of 16, then the outro). A producer sizes the wait by the payoff:
 * the groove that answers a breakdown and its build runs at least as long as they did, give or take the hypnotic hold
 * (Loom lets the wait run longer: the row's `release`, `w` × e^(k × (Loom − ½)) times the release). Where a wait outruns
 * that, the breakdown gives the drop its bars over one phrase, in whole phrases, the theme's length kept; where the
 * breakdown is already one phrase, the longest main of three phrases or more gives the drop one, the length still kept,
 * and only where no main can does the drop grow (the fourth pass). The release is the drop and every groove
 * after it up to the next break or the outro. A form rule, naming no place, asked on the first plan and laid by the
 * plan's second ask (`src/long-main.ts`, the `pay` split; `set-plan.ts`).
 */
export function releaseWants(secs: ReadonlyArray<{ kind: string; startBar: number; bars: number; ix: number }>, phraseBars: number, spell: Spell, row: TranceRow = TRANCE_ROW,
  /** the theme's bars and its length band's top (the fourth pass, its order his word 11-05: where the breakdown has nothing to give, the longest main of three phrases or more gives the drop a phrase, else the drop grows by one inside the top) */
  length: { bars: number; top: number | null } = { bars: 0, top: null }): NonNullable<TranceRead['form']> | null {
  if (!row.release) return null;
  const ratio = leaned(row.release, spell);
  const wants: NonNullable<TranceRead['form']>['wants'] = [], said: string[] = [];
  let grown = 0;
  /** the mains that have given a phrase already */
  const given = new Set<number>();
  const end = (k: number) => secs[k].startBar + secs[k].bars;
  for (let i = 0; i < secs.length; i++) {
    if (secs[i].kind !== 'breakdown') continue;
    let j = i + 1, wait = secs[i].bars;
    while (j < secs.length && secs[j].kind === 'build') { wait += secs[j].bars; j++; }
    if (secs[j]?.kind !== 'drop') continue;
    let release = 0, k = j;
    while (k < secs.length && (secs[k].kind === 'drop' || secs[k].kind === 'main')) { release += secs[k].bars; k++; }
    if (wait <= ratio * release + 1e-9) continue;
    // the fewest whole phrases that pay it, never past what the breakdown has over one phrase
    const room = Math.floor((secs[i].bars - phraseBars) / phraseBars) * phraseBars;
    let give = 0;
    while (give + phraseBars <= room && wait - give > ratio * (release + give) + 1e-9) give += phraseBars;
    if (give > 0) {
      wants.push({ section: secs[i].ix, at: secs[i].startBar, bars: end(j) - secs[i].startBar, kind: 'pay', give, drop: secs[j].ix, what: 'breakdown-gives' });
      said.push(`${secs[i].startBar}: a wait of ${wait} bars against a release of ${release} (${ratio.toFixed(2)}×): the breakdown gives the drop ${give}`);
      continue;
    }
    // **the breakdown one phrase** (the fourth pass; his word 11-04: "it's fine to move my hit, if it's just length of
    // segments"; and 11-05, on the merge: "for trance use 3:31"): the longest main of three phrases or more gives the drop
    // a phrase, the theme's length kept; only where no such main stands does the drop grow by a phrase, the theme with
    // it, inside its band's top; else the theme is left as it is
    const why = `${secs[i].startBar}: a wait of ${wait} bars against a release of ${release} (${ratio.toFixed(2)}×), the breakdown one phrase`;
    // (each main gives once, and its window, from its last phrase to the drop's end, crosses no other ask's)
    const windowOf = (m: { startBar: number; bars: number }) => m.startBar < secs[j].startBar
      ? { at: m.startBar + m.bars - phraseBars, to: end(j) } : { at: secs[j].startBar, to: m.startBar + m.bars };
    const giver = secs.map((s, ix) => ({ s, ix, w: windowOf(s) }))
      .filter(({ s, ix, w }) => s.kind === 'main' && s.bars >= 3 * phraseBars && !given.has(ix) && wants.every((x) => w.to <= x.at || w.at >= x.at + x.bars))
      .sort((a, b) => b.s.bars - a.s.bars)[0];
    if (giver) {
      wants.push({ section: giver.ix, at: giver.w.at, bars: giver.w.to - giver.w.at, kind: 'pay', give: phraseBars, drop: secs[j].ix, what: 'main-gives' });
      given.add(giver.ix);
      said.push(`${why}: the ${giver.s.bars}-bar main at ${giver.s.startBar} gives the drop ${phraseBars}`);
      continue;
    }
    if (length.top == null || length.bars + grown + phraseBars <= length.top) {
      wants.push({ section: -1, at: secs[j].startBar, bars: secs[j].bars + phraseBars, kind: 'pay', give: 0, drop: secs[j].ix, grow: phraseBars, what: 'drop-grows' });
      grown += phraseBars;
      said.push(`${why}: the drop grows by ${phraseBars}, the theme with it`);
      continue;
    }
    said.push(`${why}, no main of three phrases and the band's top reached: left`);
  }
  // **The intro is a whole phrase** (the fourth pass; his word 11-04: "intro and outro could be worked on now"; the
  // producer's note: a 4-bar intro at 140 is seven seconds, no intro): an intro shorter than the phrase grows to one, the
  // theme with it, at most a phrase past the band's top (dark-fronts' own allowance)
  const intro = secs[0];
  if (intro?.kind === 'intro' && intro.bars < phraseBars && secs.length > 1) {
    const grow = phraseBars - intro.bars;
    if (length.top == null || length.bars + grown + grow <= length.top + phraseBars) {
      wants.push({ section: -1, at: intro.startBar, bars: phraseBars, kind: 'pay', give: 0, drop: intro.ix, grow, what: 'intro' });
      grown += grow;
      said.push(`the intro of ${intro.bars} bars grows to the phrase (${phraseBars}), the theme with it`);
    } else said.push(`the intro of ${intro.bars} bars stays: a phrase past the band's top`);
  }
  // **The outro never outlasts the groove before it** (the same pass; the producer's note: a 20-bar outro after a 16-bar
  // drop): an outro longer than a phrase and longer than the last groove is cut to the phrase, the theme that much shorter
  const last = secs[secs.length - 1], before = secs[secs.length - 2];
  if (last?.kind === 'outro' && before && (before.kind === 'drop' || before.kind === 'main') && last.bars > phraseBars) {
    const groove = before.bars + (wants.find((w) => w.drop === before.ix)?.grow ?? 0) + (wants.find((w) => w.drop === before.ix)?.give ?? 0);
    if (last.bars > groove) {
      wants.push({ section: last.ix, at: last.startBar, bars: phraseBars, kind: 'pay', give: 0, drop: -1, grow: phraseBars - last.bars, what: 'outro' });
      said.push(`the outro of ${last.bars} bars outlasts the ${groove}-bar groove before it: cut to the phrase (${phraseBars})`);
    }
  }
  return wants.length || said.length ? { wants, said } : null;
}

const leaned = (x: Weighted, spell: Spell) => x.w * Math.exp(Object.entries(x.by ?? {}).reduce((s, [b, k]) => s + (k as number) * ((spell[b as Bird] ?? 0.5) - 0.5), 0));
const pc = (m: number) => ((m % 12) + 12) % 12;
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m: number) => `${NAMES[pc(m)]}${Math.floor(m / 12) - 1}`;
const db = (x: number) => 10 ** (x / 20);
const DRUMS = new Set(['kick', 'hats', 'clap', 'shaker', 'perc', 'snare', 'toms', 'ride', 'crash']);
/** fronts whose notes ring like struck strings: the left hand in a breakdown, a soft lead doubling them at the peak */
const STRUCK = new Set(['piano', 'pianoFelt', 'fmEpSoft', 'karplusPluck']);
/** voices whose low-pass a note can move (`p.cutoffMul`) */
const FILTERED = new Set(['triLead', 'pulseLead', 'karplusPluck', 'fmPluck', 'wavePad', 'sawPad', 'padHaze', 'formantPad', 'supersawSmooth']);

/**
 * Is the theme in the corner, and at which of the row's places (the corner's tiles), at the theme's own tempo: one of
 * them is the hook table's nearest entry, as the hook reads the table (`nearestEntry`, the house and the tables' other
 * places voting), and the theme stands inside the row's radius about it. (The merge pass, 11-05: the radius alone
 * reached past the corner's own neighbourhood, so every theme of the Techno star and a third of the Breaks star's drew
 * the corner's techniques, whose nearest entry is a place of their own.)
 */
export function cornerOf(spell: Spell, bpm: number, entries: ReadonlyArray<PlaceEntry>, row: TranceRow = TRANCE_ROW): string | null {
  const near = nearestEntry(entries, spell, bpm);
  return near && row.places.includes(near.id) && placeDistance(near.place, spell, bpm) <= row.radius ? near.id : null;
}

/**
 * **The draw**: one front and one or two colours, by the theme's own die and the birds. `force` (a tool's sketch) names
 * the techniques outright, a voice after a colon (`phrase-hook:pianoFelt`).
 */
export function drawTechniques(seed: string | number, spell: Spell, has: { hook: boolean; kinds: Set<string>; mains: number; noSaw?: boolean }, row: TranceRow = TRANCE_ROW, force?: string[] | null): { front: Technique; voice: string; colours: Technique[]; bedVoice: string } {
  const r = new Rng(`${seed}::trance-drawn`);
  const byId = (id: string) => [...row.fronts, ...row.colours].find((t) => t.id === id);
  const pickVoice = (list: VoicePick[] | undefined, tag: string) => list?.length
    ? new Rng(`${seed}::trance-drawn:${tag}`).weighted(list.map((v) => ({ v: v.v, w: leaned(v, spell) }))) : '';
  const needsMet = (t: Technique, front: Technique) => (t.needs ?? []).every((n) =>
    n === 'melodic-front' ? front.id !== 'saw-riff' : n === 'second-main' ? has.mains >= 2 : has.kinds.has(n));
  if (force?.length) {
    const [fid, fv] = force[0].split(':');
    const front = byId(fid)!;
    const colours = force.slice(1).map((x) => byId(x.split(':')[0])).filter((x): x is Technique => !!x);
    const bedForced = force.slice(1).find((x) => x.startsWith('bed:'))?.split(':')[1];
    return { front, voice: fv ?? pickVoice(front.voices, 'voice'), colours, bedVoice: bedForced ?? pickVoice(row.beds, 'bed') };
  }
  const fronts = row.fronts.filter((f) => f.id !== 'saw-riff' || has.hook);
  let front = r.weighted(fronts.map((f) => ({ v: f, w: leaned(f, spell) })));
  // **Spark calls the riff anywhere in the corner** (pass 2, his word: the gritty saw riff "aiming for 20% chance"): where
  // the walk drew another front, a die of its own may still call the saw riff, by Spark (the hook is then planned for it
  // where its own zone placed none: `GenerateOptions.hookForced`); the walk itself is as it was, so every theme the die
  // leaves alone keeps its draw
  const saw = row.fronts.find((f) => f.id === 'saw-riff');
  if (saw && front.id !== 'saw-riff' && !has.noSaw && row.sawCall && new Rng(`${seed}::trance-drawn:saw`).chance(Math.min(row.sawCall.most, leaned(row.sawCall, spell)))) front = saw;
  const n = 1 + (r.chance(Math.min(row.more.most, leaned(row.more, spell))) ? 1 : 0);
  const colours: Technique[] = [];
  for (let k = 0; k < n; k++) {
    const pool = row.colours.filter((c) => !colours.includes(c) && needsMet(c, front)
      && !(c.bed && (front.id === 'saw-riff' || colours.some((x) => x.bed))) && !(c.id === 'vocal-pad' && front.id === 'voice-line'));
    if (!pool.length) break;
    colours.push(r.weighted(pool.map((c) => ({ v: c, w: leaned(c, spell) }))));
  }
  return { front, voice: pickVoice(front.voices, 'voice'), colours, bedVoice: pickVoice(row.beds, 'bed') };
}

/** What a theme's own hook is, as the walk reads it: the zone's (a hook the corner called for itself is not the zone's). */
const hookOf = (track: Track) => track.events.some((e) => e.layer === 'keys' && e.p?.hook != null);
const calledOf = (track: Track) => !!(track as Track & { hookCalled?: boolean }).hookCalled;

/**
 * **The corner's grammar is four on the floor** (pass 2): at the corner's edge a high Spark turns the theme into a broken
 * beat at a drum & bass tempo (the fast places' kit and bass), which is not this grammar's; the rule leaves those themes
 * as they are. Four on the floor: most bars of the mains and drops strike the kick on all four beats.
 */
export function fourFloor(track: Track): boolean {
  const bars = new Map<number, Set<number>>();
  const want = new Set<number>();
  for (const s of track.arrangement.sections) if (s.kind === 'main' || s.kind === 'drop') for (let b = s.startBar; b < s.startBar + s.bars; b++) want.add(b);
  for (const e of track.events) if (e.layer === 'kick' && want.has(e.bar)) (bars.get(e.bar) ?? bars.set(e.bar, new Set()).get(e.bar)!).add(e.step ?? -1);
  let four = 0;
  for (const b of want) { const s = bars.get(b); if (s && [0, 4, 8, 12].every((x) => s.has(x))) four++; }
  return want.size > 0 && four / want.size >= 0.5;
}

/** **The front the corner would draw** for a theme, or null outside the radius: what `planTheme` asks before it plans the hook for the riff. */
export function frontOf(track: Track, spell: Spell, entries: ReadonlyArray<{ id: string; place: Place }>, row: TranceRow = TRANCE_ROW): string | null {
  if (!cornerOf(spell, track.bpm, entries, row) || !fourFloor(track)) return null;
  const kinds = new Set(track.arrangement.sections.map((s) => s.kind));
  return drawTechniques(track.seed, spell, { hook: hookOf(track) && !calledOf(track), kinds, mains: track.arrangement.sections.filter((s) => s.kind === 'main').length }, row).front.id;
}

/** The theme's sections as the writers read them. */
interface Sec { kind: string; startBar: number; bars: number; ix: number; nth: number }

/**
 * **The theme with its techniques written**, inside the corner's radius; the plan as it was elsewhere. `entries` are the
 * hook table's places (the corner's tiles among them).
 */
export function tranceDrawn<T extends Track>(track: T, spell: Spell, entries: ReadonlyArray<{ id: string; place: Place }>, opts: { force?: string[] | null; row?: TranceRow;
  /** what the first plan's ceiling shed, for the plan's second ask (the third pass): the second sheds the same, so the splice has no seam */
  shed?: string[] | null } = {}): T {
  const row = opts.row ?? TRANCE_ROW;
  if (!opts.force && (!cornerOf(spell, track.bpm, entries, row) || !fourFloor(track))) return track;
  const secs: Sec[] = [];
  const nth: Record<string, number> = {};
  track.arrangement.sections.forEach((s, ix) => { secs.push({ kind: s.kind, startBar: s.startBar, bars: s.bars, ix, nth: nth[s.kind] = (nth[s.kind] ?? -1) + 1 }); });
  const kinds = new Set(secs.map((s) => s.kind));
  const hook = hookOf(track);
  // the walk reads the zone's hook; a riff called with no hook to play (its needs unmet) is no riff
  const D = drawTechniques(track.seed, spell, { hook: hook && !calledOf(track), kinds, mains: secs.filter((s) => s.kind === 'main').length, noSaw: !hook && calledOf(track) }, row, opts.force);
  const on = new Set(D.colours.map((c) => c.id));
  const front = D.front.id;
  const read: TranceRead = { front, voice: front === 'saw-riff' ? 'supersawGrit' : D.voice, colours: D.colours.map((c) => c.id), bed: '', double: null };
  // the form's ask (a release pays for its wait), read off this plan's sections for the plan's second ask
  const form = releaseWants(secs, (track as Track & { phraseMap?: { time?: { phraseBars?: number } } }).phraseMap?.time?.phraseBars ?? 8, spell, row,
    { bars: track.bars, top: (track as Track & { lengthTopBars?: number }).lengthTopBars ?? null });
  if (form) read.form = form;

  const bs = track.barSeconds, beat = track.beat ?? bs / 4, swing = track.swing ?? 0.5;
  const sixteenth = bs / 16;
  const tAt = (bar: number, step: number) => bar * bs + stepToBeats(step, swing) * beat;
  const secAt = (bar: number) => secs.find((s) => bar >= s.startBar && bar < s.startBar + s.bars) ?? secs[secs.length - 1];
  const scale = [...(track.key?.scale ?? [0, 2, 3, 5, 7, 8, 10])];
  const keyPc = pc(track.key?.root ?? track.progression.root);
  let tonic = 60 + keyPc; while (tonic > 66) tonic -= 12;
  const degOfPc = (p: number) => { const i = scale.findIndex((s) => pc(keyPc + s) === p); return i < 0 ? 0 : i; };

  // --- the harmony: the theme's own chords, or the euphoric loop the bed and the bass follow -------------------------
  const EUPHORIC = [[0, 5, 2, 6], [5, 6, 0, 0], [3, 5, 6, 0]];
  const loop = on.has('euphoric-progression') ? EUPHORIC[new Rng(`${track.seed}::trance-drawn:loop`).int(0, EUPHORIC.length)] : null;
  const drops = secs.filter((s) => s.kind === 'drop');
  const anchor = drops[0]?.startBar ?? 0;
  /** the chord at a bar: its scale degree and its tones' pitch classes (a triad on the degree) */
  const chordAt = (bar: number): { deg: number; pcs: number[]; rootPc: number } => {
    if (loop) {
      const i = Math.floor((((bar - anchor) % 8) + 8) % 8 / 2);
      const deg = loop[i];
      return { deg, rootPc: pc(scaleNote(keyPc, scale, deg)), pcs: [0, 2, 4].map((k) => pc(scaleNote(keyPc, scale, deg + k))) };
    }
    const c = chordAtBar(track.progression, bar);
    const rootPc = pc(c.rootMidi);
    const deg = degOfPc(rootPc);
    return { deg, rootPc, pcs: [0, 2, 4].map((k) => pc(scaleNote(keyPc, scale, deg + k))) };
  };

  const kept = front === 'saw-riff' ? track.events.slice() : track.events.filter((e) => e.layer !== 'keys' && e.layer !== 'pad');
  const added: PlanEvent[] = [];
  const frontDb = track.events.find((e) => e.layer === 'keys' && typeof e.frontDb === 'number')?.frontDb;
  const padDb = track.events.find((e) => e.layer === 'pad' && typeof e.frontDb === 'number')?.frontDb;
  const add = (layer: string, voice: string, bar: number, step: number, midi: number | null, p: Record<string, unknown>, tag: string) => {
    const meta = layer === 'keys' && frontDb != null ? { frontDb } : layer === 'pad' && padDb != null ? { frontDb: padDb } : {};
    // a bed row the pad's dispatch plays by its timbre (`stringsPad`), not a voice of its own
    if (!BY_NAME[voice] && layer === 'pad') { p = { ...p, timbre: voice }; voice = 'pad'; }
    added.push({ t: tAt(bar, step), voice, bar, step, layer, ...(midi != null ? { note: noteName(midi) } : {}), part: `trance:${tag}`, ...meta,
      p: { ...(midi != null ? { midi } : {}), ...p } } as unknown as PlanEvent);
  };
  const gainOf = (v: string, tech?: string) => row.gains[`${tech}:${v}`] ?? row.gains[v] ?? 0.5;

  // --- the opening and the strips: where the kit and the bass step out --------------------------------------------
  const intro = secs.find((s) => s.kind === 'intro');
  const firstMain = secs.find((s) => s.kind === 'main');
  const openEnd = on.has('dream-opening') && intro ? Math.min(track.bars, intro.startBar + intro.bars + (intro.bars < 16 && firstMain ? 16 - intro.bars : 0)) : 0;
  const mains = secs.filter((s) => s.kind === 'main');
  const groove = on.has('strip-to-groove') && mains[1] && mains[1].bars >= 16
    ? { from: mains[1].startBar + Math.floor(mains[1].bars / 2 / 8) * 8, to: mains[1].startBar + Math.floor(mains[1].bars / 2 / 8) * 8 + 8 } : null;
  const inGroove = (bar: number) => !!groove && bar >= groove.from && bar < groove.to;
  const stripped = (bar: number) => on.has('strip-breakdown') && secAt(bar).kind === 'breakdown';
  // the last drop's second half (the whole of it at Ember's top): the peak the saw earns
  const last = drops[drops.length - 1];
  const peak = on.has('supersaw-peak') && last ? { from: last.startBar + (spell.ember >= 0.86 ? 0 : Math.floor(last.bars / 2 / 4) * 4), to: last.startBar + last.bars } : null;
  const inPeak = (bar: number) => !!peak && bar >= peak.from && bar < peak.to;
  /**
   * **A long main breathes** (the producer's note on the whole tracks: the same eight bars five times over): in a main of
   * 32 bars or more the front rests through its third eight-bar block (the figure thins to its accents), so the groove
   * and the bed carry it and the front's return is news
   */
  const resting = (bar: number) => { const s = secAt(bar); return s.kind === 'main' && s.bars >= 32 && Math.floor((bar - s.startBar) / 8) === 2; };

  // --- the front ------------------------------------------------------------------------------------------------------
  const fr = new Rng(`${track.seed}::trance-drawn:front`);
  const voice = D.voice;
  const fGain = gainOf(voice, front);
  const struck = STRUCK.has(voice);
  const double = front === 'phrase-hook' && struck && D.front.double ? D.front.double : null;
  read.double = double?.v ?? null;
  const wet = on.has('dark-bed') ? 1.25 : 1;
  /** where the phrase's landing notes are thrown (no more often than every sixteenth bar) */
  const throwAt = (bar: number) => on.has('echo-throws') && ((bar - secAt(bar).startBar) % 16 === 15);
  if (front === 'phrase-hook') {
    // the phrase: eight bars, each a list of [step, scale steps over the chord's root, length in sixteenths]; bars 0-3
    // the call and its landing, 4-7 the call again and an answer landing elsewhere; a second answer (B) for the later
    // mains and the drop. The rhythm by the birds: an eighth pulse with a breath (the restless), a lilt of 3-3-2, or a
    // sparse one (the patient)
    const cells = { eighths: [0, 2, 4, 6, 8, 12, 14], lilt: [0, 3, 6, 8, 11, 14], sparse: [0, 6, 8, 12] } as const;
    const cell = cells[fr.weighted([{ v: 'eighths' as const, w: leaned({ w: 1, by: { veil: 2.5 } }, spell) },
      { v: 'lilt' as const, w: 1.2 }, { v: 'sparse' as const, w: leaned({ w: 0.8, by: { tide: 2.5 } }, spell) }])];
    const threeOne = fr.chance(0.5);  // three bars moving and one landing, or two pairs of a bar moving and a bar landing
    type N = [number, number, number];
    const chordTone = (d: number) => [0, 2, 4].includes(((d % 7) + 7) % 7);
    const movingBar = (from: number, dir: number, g: Rng): N[] => {
      const out: N[] = [];
      let d = from, leapt = false;
      cell.forEach((s, i) => {
        const next = cell[i + 1] ?? 16;
        if (i > 0) {
          if (!leapt && g.chance(0.35)) { d += dir * (g.chance(0.5) ? 3 : 4); leapt = true; dir = -dir; }
          else d += g.chance(0.2) ? 0 : dir;
          // the bar's strong steps land on a chord tone (the nearest)
          if (s === 8 && !chordTone(d)) d = chordTone(d + dir) ? d + dir : d - dir;
          d = Math.max(-3, Math.min(9, d));
          if (d >= 8) dir = -1;
          if (d <= -2) dir = 1;
        }
        out.push([s, d, Math.max(1, next - s)]);
      });
      return out;
    };
    const landing = (d: number, pickup: boolean): N[] => pickup ? [[0, d, 12], [14, d + 1, 2]] : [[0, d, 16]];
    const write = (g: Rng, open: number, close: number): N[][] => {
      const bars: N[][] = [];
      const a = movingBar(g.pick([0, 2, 4]), 1, g);
      const b = threeOne ? movingBar(a[a.length - 1][1], -1, g) : landing(open, g.chance(0.5));
      const c = threeOne ? movingBar(g.pick([2, 4]), -1, g) : movingBar(a[0][1] + 1, -1, g);
      bars.push(a, b, c, landing(open, false));
      const a2 = a.map((n) => [...n] as N);
      const c2 = threeOne ? movingBar(c[0][1] + 1, 1, g) : movingBar(a[0][1] + 2, -1, g);
      bars.push(a2, b, c2, landing(close, false));
      return bars;
    };
    const A = write(new Rng(`${track.seed}::trance-drawn:phrase`), fr.pick([2, 4]), fr.pick([0, 4, 7]));
    const B = [...A.slice(0, 4), ...write(new Rng(`${track.seed}::trance-drawn:phrase:b`), 4, fr.pick([0, 7])).slice(4)];
    let lastMidi = tonic + 7;
    const midiOf = (bar: number, d: number) => {
      const c = chordAt(bar);
      let m = scaleNote(tonic, scale, c.deg + d);
      while (m - lastMidi > 7) m -= 12;
      while (lastMidi - m > 7) m += 12;
      // a ceiling a tenth over the tonic's octave (the phrase sings in the middle of the keyboard, never shrill)
      while (m > tonic + 16) m -= 12;
      while (m < tonic - 5) m += 12;
      return m;
    };
    type How = { vel: number; dbl?: number; first?: number; ring?: number; B?: boolean };
    const play = (bar: number, k: number, h: How) => {
      const P = h.B ? B : A;
      // each half of the phrase starts from the same place, so its repeats are the same notes (the octave never drifts)
      if (((k % 4) + 4) % 4 === 0) lastMidi = tonic + 7;
      const notes = P[((k % 8) + 8) % 8].slice(0, h.first ?? 99);
      for (const [s, d, len] of notes) {
        const midi = midiOf(bar, d);
        lastMidi = midi;
        const accent = s === 0 || s === 8 ? 1 : 0.86;
        const long = len >= 8;
        const vel = Math.max(0.2, Math.min(1, h.vel * accent + (((bar * 7 + s * 13) % 11) / 10 - 0.5) * 0.06));
        const thrown = long && throwAt(bar);
        add('keys', voice, bar, s, midi, { dur: len * sixteenth * (long ? 1.5 : (h.ring ?? 1.1)), vel, gain: fGain, reverb: Math.min(0.9, 0.5 * wet), hall: 0.9,
          delay: thrown ? 0.62 : long ? 0.22 : 0.14 }, 'front');
        if (h.dbl && double) add('keys', double.v, bar, s, midi, { dur: len * sixteenth * (long ? 1.3 : 1), vel: Math.min(1, h.dbl * accent), tremolo: false,
          reverb: 0.42, delay: 0.24, gain: fGain * db(double.db) * (gainOf(double.v) / Math.max(0.05, fGain)) }, 'double');
      }
    };
    const leftHand = (bar: number, vel: number) => {
      let r = scaleNote(tonic, scale, chordAt(bar).deg) - 12;
      while (r > 52) r -= 12; while (r < 40) r += 12;
      for (const m of [r, r + 7]) add('keys', voice, bar, 0, m, { dur: bs * 1.05, vel, gain: fGain, reverb: 0.5 * wet, hall: 0.9, delay: 0.08 }, 'left-hand');
    };
    let mainsSeen = 0;
    for (const s of secs) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        if (inGroove(bar)) continue;
        const x = k / Math.max(1, s.bars - 1);
        switch (s.kind) {
          case 'intro':
            if (openEnd) play(bar, k, { vel: 0.5 + 0.1 * x });
            else if (k >= s.bars - 4 && k < s.bars - 2) play(bar, k - (s.bars - 4), { vel: 0.5 });
            break;
          case 'main':
            // its answers alternate block by block (A, then B), and a long main rests a block
            if (resting(bar)) break;
            if (mainsSeen > 0 || k >= 8 || openEnd) play(bar, k, { vel: bar < openEnd ? 0.56 : mainsSeen ? 0.8 : 0.72, B: mainsSeen > 0 || Math.floor(k / 8) % 2 === 1, dbl: mainsSeen > 0 && Math.floor(k / 8) % 2 === 1 ? 0.6 : undefined });
            break;
          case 'breakdown':
            // the breakdown sits well under the mains (the producer's note: a breakdown 1 LU under the groove is no break)
            if (struck) leftHand(bar, 0.36);
            play(bar, k, { vel: k < 4 ? 0.52 : 0.62, ring: 2.0 });
            break;
          case 'build':
            play(bar, k, { vel: 0.7 + 0.15 * x, dbl: k >= s.bars - 8 ? 0.3 + 0.4 * ((k - (s.bars - 8)) / 7) : undefined });
            break;
          case 'drop':
            play(bar, k, { vel: 0.86, B: true, dbl: 0.8 });
            break;
          case 'outro':
            if (k < 8) play(bar, k, { vel: 0.72 - 0.03 * k });
            break;
          default:
            play(bar, k, { vel: 0.7 });
        }
      }
      if (s.kind === 'main') mainsSeen++;
    }
  } else if (front === 'voice-line') {
    // the sung line: the voice-like pad as the lead, a long note a phrase's half (one to two bars), a chord tone near
    // the last by step, a sigh down on some halves; through the opening's second half, the mains from their ninth bar,
    // the breakdowns whole (its heart) and the builds; at the drop it climbs a third to its high point (the release)
    const g = new Rng(`${track.seed}::trance-drawn:line`);
    const sighs = g.float(0.25, 0.6);
    let top = tonic + 7;
    const sing = (bar: number, bars: number, vel: number, lift: number) => {
      const c = chordAt(bar);
      // each eight bars start again from the middle of the range, so the line breathes rather than drifting down
      if ((bar - secAt(bar).startBar) % 8 === 0) top = tonic + 8 + lift;
      const cands = c.pcs.flatMap((q) => [q + 48, q + 60, q + 72]).filter((m) => m >= tonic + 2 + lift && m <= tonic + 14 + lift);
      top = cands.sort((x, y) => Math.abs(x - top) - Math.abs(y - top))[g.chance(0.35) ? 1 : 0] ?? top;
      const sigh = bars >= 2 && g.chance(sighs);
      add('keys', voice, bar, 0, top, { dur: (sigh ? 1.5 : bars) * bs * 0.97, vel, attack: 0.35, release: 1.8, vowelFrom: +g.float(0, 1).toFixed(2), vowelTo: +g.float(0, 1).toFixed(2),
        reverb: Math.min(0.9, 0.7 * wet), delay: throwAt(bar + bars - 1) ? 0.6 : 0.26, spread: 0.6, gain: fGain }, 'front');
      if (sigh) {
        const down = scaleNote(tonic, scale, degOfPc(pc(top)) - 1) + 12 * Math.floor((top - tonic) / 12);
        add('keys', voice, bar + 1, 8, down, { dur: 0.5 * bs * 0.97, vel: vel * 0.85, attack: 0.2, release: 1.6, reverb: 0.7 * wet, delay: 0.3, spread: 0.6, gain: fGain }, 'front');
      }
    };
    let mainsSeen = 0;
    for (const s of secs) {
      for (let k = 0; k < s.bars; k += 2) {
        const bar = s.startBar + k;
        if (inGroove(bar)) continue;
        const n = Math.min(2, s.bars - k);
        switch (s.kind) {
          case 'intro': if (openEnd || k >= s.bars / 2) sing(bar, n, 0.6, 0); break;
          case 'main': if (!resting(bar) && (mainsSeen > 0 || k >= 8 || openEnd)) sing(bar, n, bar < openEnd ? 0.6 : 0.72, 0); break;
          case 'breakdown': sing(bar, n, 0.64, 0); break;
          case 'build': sing(bar, n, 0.7 + 0.12 * (k / Math.max(1, s.bars - 1)), 0); break;
          case 'drop': sing(bar, n, 0.82, 3); break;
          case 'outro': if (k < 8) sing(bar, n, 0.62, 0); break;
          default: sing(bar, n, 0.7, 0);
        }
      }
      if (s.kind === 'main') mainsSeen++;
    }
  } else if (front === 'hypnotic-figure') {
    // the cell: sixteen steps, accents on the 3+3+2 groups' heads, the chord's root, fifth, octave and a ninth or a
    // fourth; a rest or two to breathe; one step turning to a new tone every eight bars
    const tones = [0, 2, 4, 7, fr.chance(0.5) ? 8 : 4];
    const heads = new Set([0, 3, 6, 8, 11, 14]);
    const base = Array.from({ length: 16 }, (_, s) => heads.has(s) ? (s === 0 || s === 8 ? 0 : fr.pick([0, 7, 4])) : fr.chance(0.22) ? null : fr.pick(tones));
    const cellAt = (bar: number) => {
      const c = base.slice();
      const g = new Rng(`${track.seed}::trance-drawn:figure:${Math.floor(bar / 8)}`);
      for (let turns = Math.floor(bar / 8) % 4, i = 0; i < turns; i++) { const s = g.int(1, 16); if (!heads.has(s) || s > 8) c[s] = g.pick(tones); }
      return c;
    };
    const period = fr.pick([32, 48, 64]);
    const slow = (bar: number) => 0.4 + 0.6 * (0.5 - 0.5 * Math.cos((2 * Math.PI * bar) / period));
    for (const s of secs) for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (inGroove(bar)) continue;
      const x = k / Math.max(1, s.bars - 1);
      // the mains hold the filter under its top so the drop's full opening is the release (the producer's note on the
      // whole track: a drop 0.6 LU over the mains is no release)
      let cut = Math.min(0.72, slow(bar)), vel = 0.8;
      if (s.kind === 'intro') { cut *= 0.4 + 0.4 * x; vel = 0.6; }
      else if (s.kind === 'breakdown') { cut = 0.22 + 0.12 * Math.sin(Math.PI * x); vel = 0.55; }
      else if (s.kind === 'build') { cut = 0.25 + 0.75 * x * x; vel = 0.7 + 0.15 * x; }
      else if (s.kind === 'drop') { cut = Math.max(0.85, cut); vel = 0.86; }
      else if (s.kind === 'outro') { cut *= 1 - 0.6 * x; vel = 0.7 * (1 - 0.7 * x); }
      // a long main's third block thins to the accents; the last bar before a breakdown or a drop leaves its second half
      // open (a breath before the change)
      const thin = resting(bar);
      const next = secs[s.ix + 1];
      const breath = k === s.bars - 1 && !!next && (next.kind === 'breakdown' || next.kind === 'drop');
      const c = chordAt(bar);
      const rootM = scaleNote(tonic, scale, c.deg);
      let shift = 0;
      while (rootM + shift > tonic + 4) shift -= 12;
      while (rootM + shift < tonic - 8) shift += 12;
      cellAt(bar).forEach((d, step) => {
        if (d == null || (thin && !heads.has(step)) || (breath && step >= 8)) return;
        const midi = scaleNote(tonic, scale, c.deg + d) + shift;
        const opening = bar < openEnd ? 0.7 : 1;
        add('keys', voice, bar, step, midi, { dur: sixteenth * (heads.has(step) ? 1.4 : 0.9), vel: vel * opening * (heads.has(step) ? 1 : 0.72), gain: fGain,
          cutoffMul: +Math.max(0.15, Math.min(1, cut * (opening < 1 ? 0.7 : 1))).toFixed(3), reverb: 0.32 * wet, delay: step === 14 && throwAt(bar) ? 0.6 : 0.2 }, 'front');
      });
    }
  }

  // --- the bed (every front but the saw riff, which keeps its own) ---------------------------------------------------
  if (front !== 'saw-riff') {
    const dark = on.has('dark-bed');
    let bedVoice = D.bedVoice;
    if (dark) bedVoice = spell.gleam < 0.35 ? 'padHaze' : 'stringsPad';
    if (loop) bedVoice = spell.gleam >= 0.7 ? 'sawPad' : 'stringsPad';
    if (on.has('filter-build') && !FILTERED.has(bedVoice)) bedVoice = spell.gleam < 0.35 ? 'padHaze' : 'wavePad';
    read.bed = bedVoice;
    const bGain = gainOf(bedVoice);
    let lastTop: number | null = null;
    const strikes: number[] = [];
    for (let b = 0; b < track.bars; b++) {
      const s = secAt(b);
      if (b === s.startBar || chordAt(b).rootPc !== chordAt(b - 1).rootPc || (b - s.startBar) % 4 === 0) strikes.push(b);
    }
    strikes.forEach((b, i) => {
      const s = secAt(b), k = b - s.startBar, x = k / Math.max(1, s.bars - 1);
      const until = Math.min(strikes[i + 1] ?? track.bars, s.startBar + s.bars);
      if (inGroove(b) || inPeak(b)) return;
      let vel: number;
      switch (s.kind) {
        case 'intro': vel = 0.45 + 0.3 * x; break;
        // the first main holds the bed back so the drop's full, wide chord is news (the producer's note on the whole
        // tracks: a drop barely over the first main)
        case 'main': vel = s.nth === 0 ? 0.5 : 0.66; break;
        case 'breakdown': if (stripped(b) && k < 4) return; vel = 0.46; break;
        case 'build': vel = 0.55 + 0.3 * x; break;
        case 'drop': vel = 0.86; break;
        // the outro's bed runs to the end, fading (a held chord never stops into nothing)
        case 'outro': vel = 0.08 + 0.52 * (1 - x); break;
        default: vel = 0.6;
      }
      // the beatless opening sits under the groove, as the dream versions' openings do (5-6 dB under, mined)
      if (b < openEnd) vel *= 0.75;
      const c = chordAt(b);
      const n = s.kind === 'drop' ? 5 : 4;
      const notes = voiceHeld(c.pcs, n, [64, 74], lastTop, null);
      lastTop = notes[notes.length - 1];
      for (const m of notes) add('pad', bedVoice, b, 0, m, { dur: (until - b) * bs, vel, timbre: bedVoice, release: 1.6, spread: 0.9,
        reverb: Math.min(0.85, 0.55 * wet), delay: 0.12, gain: bGain, ...(dark ? { cutoffMul: 0.6 } : {}) }, 'bed');
    });
    // the dark bed's drone: the tonic and its fifth, low, a section long, under everything but the breakdowns' first bars
    if (dark) for (const s of secs) {
      let r = tonic - 12; while (r < 43) r += 12; while (r >= 55) r -= 12;
      for (const m of [r, r + 7]) add('pad', 'padHaze', s.startBar, 0, m, { dur: s.bars * bs, vel: s.kind === 'drop' ? 0.5 : 0.62, timbre: 'padHaze', release: 2.4,
        spread: 0.7, reverb: 0.7, delay: 0.05, cutoffMul: 0.45, gain: gainOf('drone') }, 'drone');
    }
    // the voice-like pad's call: one long line on the chord's top, two to four bars a note, through the opening, the
    // breakdowns and the build's first half (never in a drop), beside the bed (a call alone wears out in seconds)
    if (on.has('vocal-pad')) {
      const vv = new Rng(`${track.seed}::trance-drawn:vocal`).weighted((D.colours.find((c) => c.id === 'vocal-pad')!.voices ?? []).map((v) => ({ v: v.v, w: leaned(v, spell) })));
      read.bed += `+${vv}`;
      const g = new Rng(`${track.seed}::trance-drawn:call`);
      for (const s of secs) {
        if (!['intro', 'breakdown', 'build'].includes(s.kind) && !(openEnd && s.kind === 'main' && s.startBar < openEnd)) continue;
        const end = s.kind === 'build' ? s.startBar + Math.ceil(s.bars / 2) : s.kind === 'main' ? Math.min(openEnd, s.startBar + s.bars) : s.startBar + s.bars;
        let b = s.startBar + (s.kind === 'breakdown' ? 2 : 0), top = tonic + 7;
        while (b < end) {
          const len = Math.min(end - b, g.pick([2, 4, 4]));
          const c = chordAt(b);
          const cands = c.pcs.flatMap((p) => [p + 60, p + 72]).filter((m) => m >= tonic + 3 && m <= tonic + 15);
          top = cands.sort((x, y) => Math.abs(x - top) - Math.abs(y - top))[g.chance(0.3) ? 1 : 0] ?? top;
          add('pad', vv, b, 0, top, { dur: len * bs * 0.96, vel: 0.7, timbre: vv, attack: 0.9, release: 2.2, vowelFrom: +g.float(0, 1).toFixed(2), vowelTo: +g.float(0, 1).toFixed(2),
            reverb: 0.75, delay: 0.3, spread: 0.8, gain: gainOf(vv) }, 'call');
          b += len;
        }
      }
    }
  }

  // --- the saw at the peak -------------------------------------------------------------------------------------------
  if (peak) {
    // two or three chords, held, a chord a change (his ear 10-28: "three chords at best"), under the kick; a tool's
    // sketch may name another saw (`saw:supersawLead`, today's held one) for the A/B
    const [sawVoice, sawDb] = (opts.force?.find((x) => x.startsWith('saw:'))?.slice(4) ?? 'supersawSmooth').split('@');
    const sawGain = gainOf('supersawSmooth') * db(Number(sawDb ?? 0) || 0);
    const sawLayer = (BY_NAME[sawVoice] as { row?: { descriptor?: { layer?: string } } } | undefined)?.row?.descriptor?.layer ?? 'keys';
    const seen: number[] = [];
    let lastTop: number | null = null;
    for (let b = peak.from; b < peak.to; b += 2) {
      let c = chordAt(b);
      if (!seen.includes(c.rootPc)) { if (seen.length >= 3) c = chordAt(peak.from); else seen.push(c.rootPc); }
      const notes = voiceHeld(c.pcs, 4, [67, 74], lastTop, null);
      lastTop = notes[notes.length - 1];
      for (const m of notes) add(sawLayer, sawVoice, b, 0, m, { dur: 2 * bs - 0.02, vel: 0.7 + 0.1 * ((b - peak.from) / Math.max(1, peak.to - peak.from)), gain: sawGain,
        reverb: 0.5, delay: 0.1 }, 'saw');
    }
    // its tease: the build's last bar, a chord swelling in under a closed filter
    const before = secs[secs.findIndex((s) => s.startBar === last!.startBar) - 1];
    if (before && before.kind === 'build') {
      const b = before.startBar + before.bars - 1, c = chordAt(b);
      for (const m of voiceHeld(c.pcs, 4, [67, 74], null, null)) add(sawLayer, sawVoice, b, 0, m, { dur: bs, vel: 0.6, attack: bs * 0.8, cutoffMul: 0.35, gain: sawGain, reverb: 0.6, delay: 0.1 }, 'saw-tease');
    }
  }

  // --- the kit and the bass: the opening, the strips, the rolling bass -------------------------------------------------
  const bassTpl = track.events.filter((e) => e.layer === 'bass');
  const rolling = on.has('rolling-bass');
  let events = kept.filter((e) => {
    if (e.bar == null) return true;
    if (e.bar < openEnd && (e.layer === 'kick' || e.layer === 'bass' || e.layer === 'clap')) return false;
    if (stripped(e.bar) && (DRUMS.has(e.layer) || e.layer === 'bass')) return false;
    if (inGroove(e.bar) && e.layer !== 'kick' && e.layer !== 'bass' && e.layer !== 'fx') return false;
    if (rolling && e.layer === 'bass') return false;
    return true;
  });
  if (rolling && bassTpl.length) {
    const tpl = { ...(bassTpl[0].p as Record<string, unknown>) };
    delete tpl.slideFrom; delete tpl.midi; delete tpl.dur; delete tpl.vel;
    const reg = bassTpl.map((e) => Number(e.p.midi)).filter(Number.isFinite).sort((a, b) => a - b);
    const home = reg[Math.floor(reg.length / 2)] ?? 33;
    const roll = spell.root >= 0.66 || spell.spark >= 0.5;
    const steps = roll ? [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15] : [2, 6, 10, 14];
    const bassBars = new Set(bassTpl.map((e) => e.bar));
    for (const b of [...bassBars].sort((x, y) => x - y)) {
      if (b < openEnd || stripped(b)) continue;
      let r = chordAt(b).rootPc + 12 * Math.floor(home / 12); if (r - home > 6) r -= 12; if (home - r > 6) r += 12;
      for (const s of steps) {
        const v = roll ? [0.92, 0.66, 0.78][(s % 4) - 1] : s === 2 ? 0.95 : 0.88;
        events.push({ t: tAt(b, s), voice: bassTpl[0].voice, bar: b, step: s, layer: 'bass', note: noteName(r), part: 'trance:bass',
          p: { ...tpl, midi: r, dur: sixteenth * (roll ? 0.85 : 1.7), vel: v * 0.95 } } as unknown as PlanEvent);
      }
    }
  } else if (front !== 'saw-riff') {
    // the bass follows the bed's harmony (the saw's loop is gone with the saw): each note to its chord's root, the
    // nearest octave, its slide moved with it
    events = events.map((e) => {
      if (e.layer !== 'bass' || !Number.isFinite(Number(e.p.midi))) return e;
      const m = Number(e.p.midi), want = chordAt(e.bar).rootPc;
      if (pc(m) === want && !loop) return e;
      let n = m - pc(m) + want; if (n - m > 6) n -= 12; if (m - n > 6) n += 12;
      const shift = n - m;
      return { ...e, note: noteName(n), p: { ...e.p, midi: n, ...(e.p.slideFrom != null ? { slideFrom: Number(e.p.slideFrom) + shift } : {}) } } as PlanEvent;
    });
  }

  // --- the long filter-opening build ---------------------------------------------------------------------------------
  let all = [...events, ...added];
  // **The build opens from where the breakdown left it** (the third pass; the producer's note on the whole tracks: the
  // build darker than the breakdown for ten of its sixteen bars, since the colour's closing multiplied the figure's own
  // build arc, 0.03 of the corner at the build's start): the bed and a front with no arc of its own open from about the
  // breakdown's lid (0.3) to the top along a curve that is half open by the build's middle; the figure keeps its own arc
  if (on.has('filter-build')) for (const s of secs.filter((x) => x.kind === 'build')) {
    const end = s.startBar + s.bars, from = Math.max(0, end - 16);
    all = all.map((e) => {
      if (e.bar == null || e.bar < from || e.bar >= end || !FILTERED.has(e.voice) || (e.layer !== 'pad' && e.layer !== 'keys')) return e;
      if (e.layer === 'keys' && front === 'hypnotic-figure') return e;
      const x = (e.bar - from) / Math.max(1, end - from);
      return { ...e, p: { ...e.p, cutoffMul: +(((e.p.cutoffMul as number | undefined) ?? 1) * (0.3 + 0.7 * Math.pow(x, 1.5))).toFixed(3) } } as PlanEvent;
    });
    all.push({ t: tAt(end - 8, 0), voice: 'airRise', bar: end - 8, step: 0, layer: 'fx', part: 'trance:rise', p: { dur: 8 * bs, gain: 0.8 } } as unknown as PlanEvent);
  }

  // --- under the phone's ceiling: the double goes first, then the call, then the drone, then the saw --------------------
  const unitsOf = (voices: Iterable<string>) => [...new Set(voices)].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
  const S = settingsOf(track as never) as unknown as { partSpace?: { inserts: { effect: string }[]; sends: { effect: string; after?: { effect: string }[] }[] }; returns?: Record<string, { inserts: { effect: string }[]; sends: { effect: string; after?: { effect: string }[] }[] }> };
  const space = [...(S.partSpace ? [S.partSpace] : []), ...Object.values(S.returns ?? {})]
    .reduce((a, x) => a + effectsCost([...x.inserts, ...x.sends, ...x.sends.flatMap((y) => y.after ?? [])].map((y) => y.effect)), 0);
  const shed: string[] = [];
  for (const tag of ['trance:double', 'trance:call', 'trance:drone', 'trance:saw']) {
    // (the plan's second ask sheds what the first did, no more and no less: the two plans are spliced bar by bar, and
    // the first's one-shot sweeps cost units the second's window has not)
    if (opts.shed ? !opts.shed.includes(tag.slice(7)) : unitsOf(all.map((e) => (e as { drawn?: string }).drawn ?? e.voice)) + space <= CEILING) { if (opts.shed) continue; break; }
    if (!all.some((e) => e.part === tag || (tag === 'trance:saw' && e.part === 'trance:saw-tease'))) continue;
    all = all.filter((e) => e.part !== tag && !(tag === 'trance:saw' && e.part === 'trance:saw-tease'));
    shed.push(tag.slice(7));
  }
  if (shed.length) read.shed = shed;
  track.events = all.sort((x, y) => x.t - y.t);
  (track as T & { tranceDrawn?: TranceRead }).tranceDrawn = read;
  return track;
}
