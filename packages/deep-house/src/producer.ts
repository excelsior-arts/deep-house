// **The producer's grammar**: the whole track arranged in eight-bar phrases, each one an exchange chosen for where it
// stands and where it goes. The written passage (`recipes/ambient/passage.json`, `src/passage.ts`) keeps its window and
// lends the vocabulary; every other phrase of the track is drawn here, off the track's own stream, conditionally:
//
//   - its function: an intro phrase, an opening, an arrival (it starts on a chord's landing), an approach (it reaches
//     one), an interior phrase, a crest, the exposed section (the harmony alone), the build into a drop, the way into
//     the break, the outro;
//   - the soloist's utterance for that function, target first: an approach whose last note is the next chord's downbeat
//     over that chord, an answer after a landing, a statement, an enclosure, a sequence, a fragment after a drum
//     feature, a repeated-note figure, a dub stroke (one held chord tone thrown into the slow dub echo), or rest; the
//     drums thin a little under it and answer in its gap;
//   - the drummer's two halves and the ending drawn by the destination; at every chord's landing the drums take part
//     (a crash into the hall or the hats breathing, a reverse-like swell into it);
//   - the bass: out for the bars before an anchor so its return lands with the chord, the drums alone as the cooldown
//     before a break, written answers into the drums' gaps, the riff developed after the break;
//   - the keys between the landings (a touch, a suspension, a colour, or nothing), the passing dominant's shells before
//     a change, the planner's answer dropped where the voice answers;
//   - the space: the field swelling into each arrival, the weather brought forward and moving in the exposed section,
//     a held pad under its landings, the eight-bar build out of it.
//
// Then, over the whole track, the techniques the row names (each block of the row is one; a row without it leaves it
// out): `builds` (no holes in a build: the harmony held and rising, the kick carried), `arc` (the pads as a line across
// each main passage, and a bed wherever the groove would go bare), `texture` (a sixteenth texture under the drums'
// straight top), `drop` (every drop after the break restruck at its interior), `feature` (the closing arc's moment:
// the motif recalled as a solo, the bass climbing), `holds` (long holds fade) and `bass.register` (bends kept in it).
//
// The result is one row in the passage's shape over the whole track (its window the track), which `playPassage`
// plays; and a plan, phrase by phrase, with what each event answers. Nothing names a seed or a genre: the places are
// TypeScript tables, the choices rows, the pitches scale steps over the track's own chords.

import PRODUCER_FILE from '../recipes/ambient/producer.json' with { type: 'json' };
import { PASSAGE_ROWS, LEN, posOf, posAt as posFrom, sixteenthsOf, scalePitch, type PassageRow, type Line, type Strike, type BassOp, type DrumState, type End, type WeatherSpan, type Fx,
  type FieldSwell, type Bloom, type Holds, type Texture } from './passage.ts';
import { Rng } from './rng.ts';
import type { PlanEvent } from './generator.ts';

type W = Record<string, number>;
/** a phrase an archetype may draw; `needs` a scale step of the chord it sounds over to lie so many semitones over the chord's root (a natural thirteenth is a colour only where the mode has one) */
interface PhraseRef { id: string; w: number; stage?: 'first' | 'later'; skip?: number; needs?: { deg: number; semis: number } }
/** an archetype: its phrases, where it may start (`landing`: its last note on the next landing), its send, the chance its last note is thrown, a dub stroke's held lengths */
interface Archetype { phrases: PhraseRef[]; at: string | string[]; send: string; throwLast?: number; dub?: boolean; stretch?: [string, string] }
interface StrikeRow { notes?: number[]; dominant?: number[]; db: number; bars: number; vel: number; cut?: number[] }
export interface ProducerRow {
  id: string;
  name: string;
  /** the written passage whose window it keeps and whose vocabulary it draws on */
  passage: string;
  retire: { parts: string[]; voices: string[]; layers: string[]; bed: boolean };
  phrases: Record<string, unknown>;
  archetypes: Record<string, Archetype | string>;
  /** what was just drawn (a phrase, a riff variant) is drawn at `weight` of itself within `phrases` phrases */
  recent: { weight: number; phrases: number };
  voice: { byFunction: Record<string, W>; leastRestBars: number; birds: Record<string, Record<string, number | string>>; exposedQuestionVel: number };
  drums: { states: Record<string, W>; birds: Record<string, Record<string, number | string>>; endings: Record<string, W>; inflection: { chance: number; ends: W };
    landing: W & { says?: unknown }; restrikeSwell: number; thinUnder: number; answerAfter: number; skeletonSpace: string };
  bass: { leadIn: Record<string, W>; orchestra: { chance: number; where: Record<string, W> }; answers: Record<string, BassOp[]>; answerChance: number;
    developed: { variants: Array<{ id: string; w: number; ops: BassOp[] }> }; first: W; floor: number; breath: BassOp[];
    register?: NonNullable<PassageRow['bass']['register']> };
  keys: { byFunction: Record<string, W>; dominant: { chance: number; drop: number; apartBars: number }; touch: StrikeRow; suspension: StrikeRow & { resolve: StrikeRow }; colour: StrikeRow;
    sus4: StrikeRow; flat9: StrikeRow };
  /** the field's swell into an arrival (dB; into a drop), the keys' pickup send, and each swell's way back (beats) by what it leans into */
  anticipation: { fieldDb: number; fieldDbDrop: number; keysPickupSend: string;
    releaseBeats: { landing: number; breakLanding: number; breath: number; build: number; thinning: number; return: number } };
  exposed: { weather: { db: number; bright: number; lid: number; pan: [number, number]; panBars: number; send: string; panShape?: 'triangle' | 'sine'; air?: number };
    pad: { notes: number[]; bars: number; attack: number; release: number; at: string; send: string };
    filter: { macro: [number, number]; lp: [number, number]; hp: [number, number]; says: string };
    build: { bars: number; hp: [number, number]; db: [number, number]; riserBeats: number; riserDb: number; fieldDb: number; windRise?: [number, number]; touches?: { at: number[]; db: [number, number] }; landingDb?: [number, number];
      pad: { notes: number[]; bars: number; attack: number; release: number; rise?: [number, number] } } };
  /** no holes in a build: the landings' chords handed to rising pads, the wind rising, only the endings and inflections that keep the level, a riser into the first drop */
  builds?: { pad: { from: number; db?: number; attack: number; release: number; rise: [number, number]; air: number; width: number; notes: number[][] }; wind: { rise: [number, number] };
    endings: string[]; inflections: string[]; riserBeats: number };
  /** long holds fade */
  holds?: Holds;
  /** the pads as a line across each main passage; the drop's chord handed on; a bed where the groove would go bare */
  arc?: { first: Array<[string, number]>; later: Array<[string, number]>; voicings: number[][][]; voices: [number, number]; top: number; db: [number, number]; bars: [number, number];
    width: [number, number]; air: [number, number]; attack: [number, number]; release: number; rise: [number, number]; fadeBars: number; gapBelow: number; landingAt: number; takeover: number;
    maxEmptyBars: number; cooldownDb: number; handover: { from: number; bars: number; level: number }; filler: { bars: number; level: number } };
  /** the texture under the straight top (its spans are the arrangement's) */
  texture?: Omit<Texture, 'spans'>;
  /** every drop after the break restruck at its interior, the voice on top */
  drop?: { restrike: { at: number; db: number; vel: number }; voice: W };
  /** the closing arc's feature moment; `after`: the bars of the passage's own it needs after it */
  feature?: { bars: number; after: number; lines: Array<Line & { label?: string }>;
    bass: { top: number; notes: Array<[string, number, number, number]>; vel: number; scoopSt: number; scoopS: number; db: number; dbPerSt: number };
    drums: { states: string; answer: string } };
}

const FILE = PRODUCER_FILE as unknown as { rows: ProducerRow[] };
/** The producer rows, by id (`recipes/ambient/producer.json`). */
export const PRODUCER_ROWS: Readonly<Record<string, ProducerRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/** What the generator hands the grammar: the track's form, its harmony's landings, and its planned events (read, not written). */
export interface ProducerInput {
  row: ProducerRow;
  seed: string;
  spell: Readonly<Record<string, number>>;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  bars: number;
  /** the first drop's bar: the row's positions are counted from it */
  drop: number;
  landings: ReadonlyArray<{ bar: number; change: boolean }>;
  events: readonly PlanEvent[];
  barSeconds: number;
  isKick: (voice: string) => boolean;
  /** the key's scale and the chord in force (its scale degree), for a phrase's colour against the chord it sounds over */
  scale: readonly number[];
  degreeAt: (bar: number) => number;
  /** the key's tonic (a pitch class), for a line fitted to the bass's register */
  tonic: number;
}

/** One phrase of the arrangement as the grammar chose it: what each part does and what it answers. */
export interface PhrasePlan {
  from: number;
  to: number;
  section: string;
  fn: string;
  by: 'passage' | 'grammar';
  drums: string;
  harmony: string;
  bass: string;
  voice: string;
  keys: string;
  space: string;
  answers: string;
}

/** A span whose filters the arrangement opens: the master's macro low-pass and the melodic bus's sweep corners, each walked from the first value to the second (absolute bars). */
export interface FilterSpan { from: number; to: number; macro: [number, number]; lp: [number, number]; hp: [number, number]; says: string }

/** An archetype struck off for want of a place is replaced by another drawn, this many times at most. */
const TRIES = 5;
/** The endings that answer a landing: one in the bar before it or on it and the drums already took part. */
const GESTURE = new Set<End>(['fill', 'roll', 'shortRoll', 'crash', 'hatsBreathe', 'openEnding', 'snarePickup', 'ghostAnswer', 'reverseCymbal', 'topsOpen']);

export function arrange(I: ProducerInput): { row: PassageRow; phrases: PhrasePlan[]; filters: FilterSpan[] } {
  const G = I.row;
  const passage = PASSAGE_ROWS[G.passage];
  if (!passage) throw new Error(`producer ${G.id}: no passage row ${G.passage}`);
  const rng = new Rng(`${I.seed}::producer:${G.id}`);
  const bs = I.barSeconds;
  const RB = G.anticipation.releaseBeats;
  // a weight table leaned by the birds: each bird's lean on a key (or on any key of a pair naming it), as far as the bird stands from its middle
  const lean = (w: W, birds: Record<string, Record<string, number | string>>): W => {
    const out: W = { ...w };
    for (const [bird, leans] of Object.entries(birds)) for (const [k, v] of Object.entries(leans)) {
      if (typeof v !== 'number') continue;
      for (const key of Object.keys(out)) if (key === k || key.split('|').includes(k)) out[key] *= Math.exp(v * ((I.spell[bird] ?? 0.5) - 0.5) * 2);
    }
    return out;
  };
  const draw = (w: W, allow: (k: string) => boolean = () => true): string => {
    const pairs = Object.entries(w).filter(([k, x]) => x > 0 && allow(k)).map(([v, x]) => ({ v, w: x }));
    return pairs.length ? rng.weighted(pairs) : 'none';
  };
  // positions: a bar relative to the first drop, a sixteenth as a row position, a row position over a phrase as a sixteenth
  const rel = (bar: number) => bar - I.drop;
  const posAt = (sixteenth: number) => posFrom(sixteenth, I.drop);
  const at16 = (p: number, at: string) => p * 16 + sixteenthsOf(at);
  const absBar = (at: string) => I.drop + posOf(at).bar;

  // ----- what the planner laid, read off its events -----
  const per = new Map<number, { drums: number; kicks: number; bass: number; hatShut: number; crash: number }>();
  const cell = (b: number) => { let c = per.get(b); if (!c) per.set(b, (c = { drums: 0, kicks: 0, bass: 0, hatShut: 0, crash: 0 })); return c; };
  for (const e of I.events) {
    if (e.p.gone) continue;
    const c = cell(e.bar);
    if (e.layer === 'kick' || e.layer === 'clap' || e.layer === 'hats') c.drums++;
    if (I.isKick(e.voice)) c.kicks++;
    if (e.layer === 'bass' && typeof e.p.midi === 'number') c.bass++;
    if (e.voice === 'hatShut') c.hatShut++;
    if (e.voice === 'crash') c.crash++;
  }
  const drumsIn = (a: number, b: number) => { for (let x = a; x < b; x++) if ((per.get(x)?.drums ?? 0) > 0) return true; return false; };
  const bassIn = (a: number, b: number) => { for (let x = a; x < b; x++) if ((per.get(x)?.bass ?? 0) > 0) return true; return false; };
  const shutIn = (a: number, b: number) => { for (let x = a; x < b; x++) if (!(per.get(x)?.hatShut)) return false; return true; };
  const hits = (a: number, b: number) => { let x = 0; for (let k = a; k < b; k++) x += per.get(k)?.drums ?? 0; return x; };

  // ----- the form, as phrases -----
  const sections = [...I.sections].sort((a, b) => a.startBar - b.startBar);
  const sectionOf = (bar: number) => sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
  const kindAt = (bar: number) => sectionOf(bar)?.kind ?? 'outro';
  const starts = new Map(sections.map((s) => [s.startBar, s.kind]));
  const landingAt = (bar: number) => I.landings.find((l) => l.bar === bar);
  const breakStart = sections.find((s) => s.kind === 'breakdown' && s.startBar > I.drop)?.startBar ?? I.bars;
  // the passage ends where its main passage does: a form whose break comes sooner clips it there, and the grammar
  // arranges the break
  const clip = Math.min(passage.window.to, breakStart - I.drop);
  const wFrom = I.drop, wTo = Math.min(I.bars, I.drop + clip);
  const inPassage = (relBar: number) => relBar < clip;
  const cuts = new Set<number>([0, I.bars, wFrom, wTo, ...sections.map((s) => s.startBar)]);
  const grid: Array<[number, number]> = [];
  const sorted = [...cuts].filter((x) => x >= 0 && x <= I.bars).sort((a, b) => a - b);
  for (let i = 0; i + 1 < sorted.length; i++) for (let p = sorted[i]; p < sorted[i + 1]; p += 8) grid.push([p, Math.min(p + 8, sorted[i + 1])]);

  // ----- the row it writes: the passage's vocabulary and its window's content, and the grammar's around it -----
  const lines: Line[] = passage.lines.filter((x) => inPassage(posOf(x.at).bar));
  const strikes: Strike[] = passage.keys.strikes.filter((x) => inPassage(posOf(x.at).bar));
  const keysDrop = passage.keys.drop.filter((x) => inPassage(x.bar));
  const blooms = passage.pad.blooms.filter((x) => inPassage(posOf(x.at).bar));
  const states: DrumState[] = passage.drums.states.filter((x) => inPassage(x.from)).map((x) => ({ ...x, to: Math.min(x.to, clip) }));
  const endings: Array<{ bar: number; end: End[]; says?: string }> = passage.drums.endings.filter((x) => inPassage(x.bar));
  const bassPhrases: PassageRow['bass']['phrases'] = passage.bass.phrases.filter((x) => inPassage(x.from));
  const fx: Fx[] = [];
  const swells: FieldSwell[] = (passage.swells ?? []).filter((x) => inPassage(posOf(x.to).bar));
  const thin: number[] = [];
  const thinned: number[] = [];
  const filters: FilterSpan[] = [];
  const weather: WeatherSpan[] = passage.wind ? [{ from: passage.window.from, to: Math.min(clip, passage.wind.dropFrom), db: passage.wind.db, send: passage.wind.send, label: 'the wind\'s visit (the passage)' },
    { from: Math.min(clip, passage.wind.dropFrom), to: clip, gone: true, label: 'the passage rests the weather' }] : [];
  const phrases: Record<string, unknown> = { ...passage.phrases, ...G.phrases };
  delete phrases.says;
  const plans: PhrasePlan[] = [];
  const end = (bar: number, e: End[], says: string) => { if (e.length) endings.push({ bar: rel(bar), end: e, says }); };
  /** the field swelling from a sixteenth into the downbeat of `bar`, back over `release` beats */
  const swellInto = (from16: number, bar: number, db: number, release: number) => swells.push({ from: posAt(from16), to: posAt(bar * 16), db, release });
  /** a return marked: a reverse swell into `bar`, a crash on it into the hall, the field leaning in */
  const markReturn = (bar: number, into: string, on: string) => {
    end(bar - 1, ['reverseCymbal'], into);
    end(bar, ['crash'], on);
    swellInto((bar - 1) * 16, bar, G.anticipation.fieldDb, RB.return);
  };
  /** the drums thinning at `bar` (into the outro, or the planner's skeleton): the tops close into it, a crash marks it, the field leans in */
  const markThinning = (bar: number, into: string, on: string) => {
    end(bar - 1, ['topsClose', 'reverseCymbal'], into);
    end(bar, ['crash'], on);
    swellInto((bar - 1) * 16, bar, G.anticipation.fieldDb, RB.thinning);
  };
  /** the exposed section's weather over a span, forward and moving */
  const weatherSpan = (from: number, to: number, label: string, extra: Partial<WeatherSpan> = {}): WeatherSpan => {
    const Wt = G.exposed.weather;
    return { from, to, db: Wt.db, bright: Wt.bright, lid: Wt.lid, pan: Wt.pan, panBars: Wt.panBars, send: Wt.send,
      ...(Wt.panShape ? { panShape: Wt.panShape } : {}), ...(Wt.air != null ? { air: Wt.air } : {}), ...extra, label };
  };

  // the passage's own phrases, read back for the plan (its timeline is written when it plays)
  for (const [p, q] of grid) if (p >= wFrom && q <= wTo)
    plans.push({ from: p, to: q, section: kindAt(p), fn: 'the written first passage', by: 'passage', drums: '', harmony: '', bass: '', voice: '', keys: '', space: '', answers: '' });

  // ----- where the track builds, and where its closing arc's moment stands -----
  // a build: from the first landing of the harmony to the first drop (and the build out of a break, `intoDrop`); a
  // harmony-alone section before the drop is a break of its own, and only its last phrase, the build out of it, builds
  const firstHarmony = Math.min(I.drop, ...I.landings.map((l) => l.bar).filter((b) => b < I.drop));
  const preBuild = (bar: number) => bar >= firstHarmony && bar < I.drop && kindAt(bar) !== 'breakdown';
  const sectionStart = (bar: number) => sectionOf(bar)?.startBar ?? bar;
  const drop2 = sections.find((s) => s.kind === 'drop' && s.startBar >= breakStart);
  const outroAt = sections.find((s) => s.kind === 'outro')?.startBar ?? I.bars;
  const F = G.feature;
  const featureFrom = F && drop2 ? sections.find((s) => s.kind === 'main' && s.startBar >= drop2.startBar + drop2.bars)?.startBar : undefined;
  const nextBreakAfter = (bar: number) => sections.find((s) => s.kind === 'breakdown' && s.startBar > bar)?.startBar ?? I.bars;
  // the moment stands where its bars and the passage's own after it fit before the outro or a break
  const feature = F && featureFrom != null && featureFrom + F.bars + F.after <= Math.min(outroAt, nextBreakAfter(featureFrom)) ? featureFrom : null;

  // ----- the grammar, phrase by phrase -----
  let lastVoiceEnd = -Infinity; // in sixteenths
  const dominants: number[] = passage.keys.strikes.filter((x) => x.dominant && inPassage(posOf(x.at).bar)).map((x) => absBar(x.at) + 1);
  // what was just used is drawn less (a phrase, a riff variant, a drum pair): development, not a loop
  const recent = new Map<string, number>();
  let plansDone = 0;
  const fresh = <T>(key: string, items: T[], idOf: (x: T) => string, w: (x: T) => number) =>
    items.map((x) => ({ v: x, w: w(x) * ((recent.get(`${key}:${idOf(x)}`) ?? -99) >= plansDone - G.recent.phrases ? G.recent.weight : 1) }));
  const used = (key: string, id: string) => recent.set(`${key}:${id}`, plansDone);
  const passageUsed = new Set<string>();
  const orchestraUsed = new Set<string>();
  let crestNext = false;
  const archetype = (id: string): Archetype => { const a = G.archetypes[id]; if (!a || typeof a === 'string') throw new Error(`producer ${G.id}: no archetype ${id}`); return a; };
  const phraseLen = (id: string, skip = 0) => { const ns = (phrases[id] as Array<{ len?: string; rest?: string }>).slice(skip); return { total: ns.reduce((a, n) => a + LEN[n.len ?? n.rest ?? 'e'], 0), last: LEN[ns[ns.length - 1].len ?? 'e'] }; };

  for (const [p, q] of grid) {
    if (p >= wFrom && q <= wTo) continue;
    const kind = kindAt(p);
    const stage: 'first' | 'later' = p < breakStart ? 'first' : 'later';
    const into = starts.get(q);
    const landsHere = landingAt(p), arrives = landingAt(q);
    const lastPhrase = q >= I.bars - 4 || (kind === 'outro' && q >= I.bars - 12);
    const fn = kind === 'breakdown' ? (into === 'drop' ? 'intoDrop' : 'exposed')
      : into === 'drop' ? 'intoDrop'
      : into === 'breakdown' ? 'intoBreak'
      : kind === 'intro' ? (arrives?.change ? 'approach' : 'intro')
      : kind === 'outro' ? (lastPhrase ? 'last' : 'outro')
      : arrives?.change ? 'approach'
      : landsHere?.change ? 'arrival'
      : crestNext ? 'crest'
      : p === sections.find((s) => s.startBar === p)?.startBar ? 'opening'
      : 'interior';
    crestNext = false;
    const plan: PhrasePlan = { from: p, to: q, section: kind, fn, by: 'grammar', drums: '', harmony: '', bass: '', voice: 'rest', keys: '', space: '', answers: '' };
    const says: string[] = [];
    const drums = drumsIn(p, q), bass = bassIn(p, q);
    const n = q - p;
    // a phrase of a build keeps rising (no ending or thinning that drops the level for more than a beat); the closing
    // arc's moment; a drop's interior, restruck
    const building = !!G.builds && (preBuild(p) || fn === 'intoDrop');
    const featurePhrase = feature != null && (p === feature || p === feature + 8) ? (p === feature ? 1 : 2) : 0;
    const dropInterior = !!G.drop && kind === 'drop' && stage === 'later' && p === sectionStart(p) + G.drop.restrike.at && n >= 4;

    // --- the drums' two halves ---
    let s1 = 'S', s2 = 'S';
    if (kind === 'breakdown') { s1 = s2 = 'O'; }
    else if (drums && n >= 8 && kind !== 'intro' && kind !== 'outro') {
      const table = G.drums.states[fn] ?? G.drums.states.interior;
      const pair = draw(lean(table, G.drums.birds), (k) => {
        const [a, b] = k.split('|');
        if ((a === 'T' && !shutIn(p, p + 4)) || (b === 'T' && !shutIn(p + 4, q))) return false;
        // a half-time breath once a passage, a crest not twice running, and a drop's interior keeps a groove the voice sits on
        if (k.includes('H') && (kind !== 'main' || passageUsed.has(`H:${kind}:${stage}`))) return false;
        if (k.includes('T') && (recent.get('crest') ?? -99) >= plansDone - 1) return false;
        if (k.includes('T') && dropInterior) return false;
        return true;
      });
      [s1, s2] = pair === 'none' ? ['S', 'S'] : pair.split('|');
      if (pair.includes('H')) passageUsed.add(`H:${kind}:${stage}`);
      if (pair.includes('T')) recent.set('crest', plansDone);
      if (featurePhrase && F) [s1, s2] = F.drums.states.split('|');
    }
    const half = n >= 8 ? p + 4 : q;
    // a skeleton (the planner's drums thinned to kick and snare, the bass gone) has its snares carried by the space
    const skeleton = drums && kind !== 'breakdown' && kind !== 'intro' && thinned.some((b) => b <= p) && !bass && n >= 4;
    if (kind !== 'breakdown' && drums) {
      const space = skeleton ? { space: G.drums.skeletonSpace } : {};
      states.push({ from: rel(p), to: rel(half), state: s1 as DrumState['state'], ...space });
      if (half < q) states.push({ from: rel(half), to: rel(q), state: s2 as DrumState['state'], ...space });
    }
    if (skeleton) says.push('the skeleton\'s snares carried by the hall and the echo, so its gaps ring');
    plan.drums = kind === 'breakdown' ? 'none (the harmony alone)' : !drums ? 'none' : n >= 8 ? `${s1} ${p}-${half - 1}, ${s2} ${half}-${q - 1}` : `${s1}`;
    if (s2 === 'T') crestNext = true;
    // the half-time breath, with its way in and its way out
    if (s2 === 'H') {
      end(half - 1, ['halfBarBreath', 'snareDeparture', 'topsClose', 'reverseCymbal'], 'the way into the half-time breath: the tops close, the snare thrown into the echo, a reverse swell into the gap');
      end(q - 1, ['fill'], 'the way out: the snare\'s fill rising, its last hit thrown');
      swellInto((q - 1) * 16, q, G.anticipation.fieldDb, RB.breath);
      plan.drums += ' (in: tops closing, snare thrown, reverse swell; out: fill, crash, tops opening)';
    }

    // --- the voice: the function's utterance, target first ---
    let voiceArch = 'rest';
    let line: Line | null = null;
    let lineSpan: [number, number] | null = null; // sixteenths
    let dominant = false;
    // the passing dominant is the arrival's special colour: never within the dominant memory of another (the passage's own counted)
    const canDominant = arrives?.change && n >= 8 && (fn === 'approach' || fn === 'intoDrop') && kind !== 'intro'
      && !dominants.some((b) => Math.abs(b - q) < G.keys.dominant.apartBars);
    if (canDominant) dominant = rng.chance(fn === 'intoDrop' ? G.keys.dominant.drop : G.keys.dominant.chance);
    if (dominant) dominants.push(q);
    if (featurePhrase && F) {
      // the moment's solo: the track's motif recalled and developed, each line where the row puts it
      const spans: Array<[number, number]> = [];
      const here = F.lines.filter((L) => { const x = at16(feature!, L.at); return x >= p * 16 && x < q * 16; });
      for (const L of here) {
        const x = at16(feature!, L.at);
        const { label, ...rest } = L;
        const total = phraseLen(L.phrase, L.skip ?? 0).total;
        lines.push({ ...rest, at: posAt(x), label: `feature: ${label ?? L.phrase} (the closing arc's moment ${feature}-${feature! + F.bars})` });
        spans.push([x, x + total]);
        lastVoiceEnd = Math.max(lastVoiceEnd, x + total);
      }
      plan.voice = `the closing arc's moment, ${featurePhrase === 1 ? 'the motif recalled and answered high' : 'the solo developed over the bass\'s climb'}: ${here.map((L) => L.phrase).join(', ')}`;
      voiceArch = 'feature';
      // the drums thin under each line (never on the phrase's last bar) and answer in its gaps
      if (drums) for (const [a, z] of spans) {
        for (let b = a >> 4; b <= (z - 1) >> 4 && b < q - 1; b++) if (b >= p && !thin.includes(rel(b))) thin.push(rel(b));
        const gap = ((z - 1) >> 4) + 1;
        if (gap < q - 1 && !spans.some(([a2]) => a2 >> 4 === gap)) end(gap, [F.drums.answer as End], 'the drums answer the solo in its gap');
      }
      plan.drums += '; thinned under the solo, answering in its gaps';
      says.push(featurePhrase === 1 ? 'the closing arc\'s moment: the motif comes back' : 'the bass climbs out of its riff and answers the solo in its gaps');
    } else {
      let table = { ...(dropInterior ? G.drop!.voice : G.voice.byFunction[fn] ?? G.voice.byFunction.interior) };
      if (s1 === 'T' || s2 === 'T') table = { rest: 1 };
      table = lean(table, G.voice.birds);
      const allow = (k: string) => {
        if (k === 'approach') return !!arrives || into === 'drop';
        if (k === 'answer') return !!landsHere || fn === 'exposed';
        return true;
      };
      // drawn, then placed: an archetype that finds no place after the voice's last breath (its rest kept) is struck off
      // and another drawn
      const restOk = (x: number, arch: string) => x - lastVoiceEnd >= G.voice.leastRestBars * 16 - (arch === 'approach' || arch === 'dominant' ? 16 : 0);
      let id = '', skip = 0, s16 = -1, A: Archetype | null = null;
      const struck = new Set<string>();
      for (let tries = 0; tries < TRIES; tries++) {
        voiceArch = dominant && tries === 0 ? 'dominant' : draw(table, (k) => allow(k) && !struck.has(k));
        if (voiceArch === 'rest' || voiceArch === 'none') { voiceArch = 'rest'; break; }
        if (voiceArch === 'dominant') { id = 'leading-tone-into-arrival'; s16 = (q - 1) * 16 + 14; A = null; if (restOk(s16, 'dominant')) break; dominant = false; continue; }
        A = archetype(voiceArch);
        const over = A.at === 'landing' ? q : p;
        const semis = (deg: number) => { const d0 = ((I.degreeAt(over) % 7) + 7) % 7; return ((I.scale[(d0 + deg) % 7] - I.scale[d0]) % 12 + 12) % 12; };
        const choices = A.phrases.filter((x) => (!x.stage || x.stage === stage) && phrases[x.id] && (!x.needs || semis(x.needs.deg) === x.needs.semis));
        if (!choices.length) { struck.add(voiceArch); continue; }
        const pick = rng.weighted(fresh('phrase', choices, (x) => x.id, (x) => x.w));
        id = pick.id; skip = pick.skip ?? 0;
        used('phrase', id);
        const L0 = phraseLen(id, skip);
        const options = A.at === 'landing' ? [q * 16 - (L0.total - L0.last)]
          : (Array.isArray(A.at) ? A.at : [A.at]).map((x) => at16(p, x)).filter((x) => x + L0.total <= q * 16 - 2 && x >= p * 16);
        const ok = options.filter((x) => restOk(x, voiceArch));
        if (ok.length) { s16 = rng.pick(ok); break; }
        struck.add(voiceArch);
        s16 = -1;
      }
      if (voiceArch !== 'rest' && s16 >= 0) {
        const L = phraseLen(id, skip);
        const over = voiceArch === 'approach' || voiceArch === 'dominant' ? 'arrival' as const : 'here' as const;
        line = { at: posAt(s16), phrase: id, over, send: A?.send ?? 'main', ...(skip ? { skip } : {}),
          ...(A?.throwLast && rng.chance(A.throwLast) ? { throwLast: true } : {}),
          ...(A?.dub ? { dubLast: true, stretch: { 0: rng.chance(0.5) ? A.stretch![0] : A.stretch![1] } } : {}),
          ...(kind === 'breakdown' && voiceArch === 'question' ? { vel: G.voice.exposedQuestionVel } : {}),
          label: `${voiceArch}: ${id} (${fn} ${p}-${q})` };
        const len = A?.dub && line.stretch ? LEN[line.stretch[0]] : L.total;
        lineSpan = [s16, s16 + len];
        lastVoiceEnd = s16 + len;
        lines.push(line);
        plan.voice = `${voiceArch === 'dominant' ? 'approach (the leading tone over the dominant)' : voiceArch} at ${s16 >> 4}:${((s16 & 15) >> 2) + 1}: ${id}${skip ? ` (from its note ${skip + 1})` : ''}${line.throwLast ? ', last note thrown' : ''}${line.dubLast ? ', into the dub echo' : ''}`;
        if (over === 'arrival') says.push(`the voice reaches the ${arrives?.change ? 'chord change' : 'drop'} at ${q}`);
        else if (voiceArch === 'answer') says.push(`the voice answers the landing at ${p}`);
        else if (voiceArch === 'dub') says.push('one held chord tone, the dub echo writing its phrase');
        else if (fn === 'crest') says.push('the voice replies after the drums\' crest');
      } else voiceArch = 'rest';
    }

    // --- the drums around the voice: thinner under it, answering in its gap ---
    // the phrase's last bar is the drummer's ending, never thinned: under a closing ending and a bass already out it
    // would stack into a hole before the change
    if (lineSpan && drums && kind !== 'breakdown' && rng.chance(G.drums.thinUnder) && !building) {
      for (let b = lineSpan[0] >> 4; b <= (lineSpan[1] - 1) >> 4 && b < q - 1; b++) if (b >= p) thin.push(rel(b));
      plan.drums += '; thinned under the voice';
    }
    const voiceEndBar = lineSpan ? (lineSpan[1] - 1) >> 4 : -1;
    if (lineSpan && drums && kind !== 'breakdown' && voiceEndBar < q - 1 && line?.over === 'here' && rng.chance(G.drums.answerAfter)) {
      end(voiceEndBar + 1 < q - 1 ? voiceEndBar + 1 : voiceEndBar, ['ghostTail'], 'the drums answer in the voice\'s gap');
      says.push('the drums answer the voice in its gap');
    }

    // --- the drummer's ending, by where the phrase goes; the landing's gesture ---
    let answerTo = ''; // the ending whose gap the bass may answer
    if (drums && kind !== 'breakdown' && n >= 4) {
      let table: string;
      if (dominant) table = 'dominant';
      else if (fn === 'intoBreak') table = 'exposed';
      else if (crestNext) table = 'crest';
      else if (line?.over === 'arrival') table = 'pickup';
      else if (arrives || into === 'drop') table = 'arrival';
      else table = 'plain';
      let pick = 'none';
      if (table === 'dominant') { end(q - 1, ['ghostAnswer', 'lastBeatEmpty'], 'a short ghost answer, then the leading tone alone over the dominant'); pick = 'ghostAnswer+lastBeatEmpty'; }
      else if (into === 'drop') {
        end(q - 1, ['roll'], 'the roll into the drop'); pick = 'roll';
        // the build into the first drop rises to it as the break's does (the planner takes its kick out there)
        if (kind !== 'breakdown' && G.builds) {
          const Bx = G.exposed.build, from16 = (q - G.builds.riserBeats / 4) * 16;
          fx.push({ at: posAt(from16), kind: 'riser', beats: G.builds.riserBeats, db: Bx.riserDb, send: 'riser', label: `the riser into the drop at ${q}` });
          swellInto(from16, q, Bx.fieldDb, RB.build);
        }
      }
      else if (into === 'outro') {
        markThinning(q, 'the tops close into the outro, a reverse swell into it', 'the outro begins with a crash into the hall');
        pick = 'topsClose+reverseCymbal';
      }
      else { pick = draw(G.drums.endings[table], (k) => !building || k === 'none' || G.builds!.endings.includes(k)); if (pick !== 'none') end(q - 1, pick.split('+') as End[], `the ending (${table})`); }
      plan.drums += `; ending ${pick}`;
      // the inflection inside the phrase
      const ib = fn === 'arrival' ? p + 1 : p + 3;
      if (n >= 8 && s1 !== 'H' && s1 !== 'T' && rng.chance(G.drums.inflection.chance) && !endings.some((x) => x.bar === rel(ib))) {
        const e = draw(G.drums.inflection.ends, (k) => !building || G.builds!.inflections.includes(k));
        end(ib, [e as End], 'a small inflection');
        plan.drums += `; ${e} at ${ib}`;
      }
      // the bass may answer into the ending's gap
      if (bass && ['kickOut', 'openEnding', 'hatCut', 'ghostTurn'].includes(pick) && rng.chance(G.bass.answerChance)) answerTo = pick;
    }
    // the planner's own thinning (the drums falling to a skeleton, the bass gone) gets a way in: the tops close into it,
    // a crash into the hall marks it, the field leans in
    const thins = hits(q, q + 2) > 0 && (hits(q, q + 2) < 0.6 * hits(q - 2, q) || (bassIn(q - 2, q) && !bassIn(q, q + 2)));
    if (drums && kind !== 'breakdown' && q < I.bars - 2 && thins && !into && !arrives
      && !endings.some((x) => x.bar === rel(q) && x.end.includes('crash'))) {
      markThinning(q, `the tops close into the drums' thinning at ${q}`, `a crash into the hall marks the thinning at ${q}`);
      thinned.push(q);
      says.push(`the drums thin at ${q}: the tops close into it, a crash and the field mark it`);
    }
    if (arrives && (drums || drumsIn(q, q + 1)) && kindAt(q) !== 'breakdown') {
      // the landing: the drums take part (a strong change), or at least lean into it (a restrike)
      const intoDrop = starts.get(q) === 'drop';
      const g = arrives.change && !intoDrop ? draw(G.drums.landing) : intoDrop ? 'reverseCymbal' : rng.chance(G.drums.restrikeSwell) ? 'reverseCymbal' : 'hatsBreathe';
      const parts = g.split('+');
      if (parts.includes('reverseCymbal')) end(q - 1, ['reverseCymbal'], `a reverse swell into the landing at ${q}`);
      const onIt = parts.filter((x) => x !== 'reverseCymbal');
      if (intoDrop && !(per.get(q)?.crash)) onIt.push('crash');
      end(q, onIt as End[], `the drums on the landing at ${q}`);
      swellInto((q - 1) * 16 + 8, q, intoDrop ? G.anticipation.fieldDbDrop : G.anticipation.fieldDb, RB.landing);
      says.push(`the drums and the field lean into ${q} (${g.replace(/\+/g, ', ')}, the field swelling)`);
    } else if (arrives && kindAt(q) === 'breakdown') {
      fx.push({ at: posAt(q * 16), kind: 'swell', beats: 4, label: `a reverse swell into the break's landing at ${q}` });
      swellInto((q - 1) * 16 + 8, q, G.anticipation.fieldDb, RB.breakLanding);
    }

    // --- the keys ---
    const keysSays: string[] = [];
    const strike = (at16: number, K: StrikeRow, label: string, extra: Partial<Strike> = {}) =>
      strikes.push({ at: posAt(at16), ...(K.notes ? { over: 'here' as const, notes: K.notes } : {}), ...(K.dominant ? { dominant: K.dominant } : {}), db: K.db, bars: K.bars, vel: K.vel, ...extra, label });
    if (dominant) {
      strikes.push({ at: posAt((q - 1) * 16), dominant: G.keys.sus4.dominant, db: G.keys.sus4.db, bars: G.keys.sus4.bars, vel: G.keys.sus4.vel, send: G.anticipation.keysPickupSend, label: `keys: the dominant's suspended shell into ${q}` });
      strikes.push({ at: posAt((q - 1) * 16 + 8), dominant: G.keys.flat9.dominant, db: G.keys.flat9.db, bars: G.keys.flat9.bars, vel: G.keys.flat9.vel, send: G.anticipation.keysPickupSend, label: `keys: the dominant's flat-ninth shell into ${q}` });
      keysDrop.push({ bar: rel(q - 1), from: 8, to: 16, says: 'the planner\'s pickup: the dominant\'s shells approach instead' });
      keysSays.push(`the passing dominant's two shells at ${q - 1}, into the hall`);
    } else if (line?.over === 'arrival' && arrives) {
      keysDrop.push({ bar: rel(q - 1), from: 8, to: 16, says: 'the planner\'s pickup: the voice\'s line is the approach' });
      keysSays.push('the planner\'s pickup left to the voice');
    }
    if (landsHere && voiceArch === 'answer') {
      keysDrop.push({ bar: rel(p), from: 4, to: 16 }, { bar: rel(p + 1), from: 0, to: 16 });
      keysSays.push('the planner\'s answer left to the voice');
    }
    if (dropInterior) {
      // the drop's interior: its chord struck again under the pad, the voice on top
      const R0 = G.drop!.restrike;
      strikes.push({ at: posAt(p * 16), restrike: true, db: R0.db, vel: R0.vel, bars: Math.min(8, n), label: `keys: the drop's chord restruck at its interior (${p})` });
      keysSays.push(`the drop's chord restruck at ${p}`);
    } else if (featurePhrase) keysSays.push('none: the solo and the bass\'s climb over the pad');
    else if (!landsHere && n >= 4 && kind !== 'intro' && fn !== 'last') {
      const table = G.keys.byFunction[kind === 'breakdown' ? 'exposed' : kind === 'outro' ? 'outro' : fn === 'opening' ? 'opening' : 'interior'] ?? G.keys.byFunction.interior;
      const k = draw(table);
      const K = k === 'touch' ? G.keys.touch : k === 'suspension' ? G.keys.suspension : k === 'colour' ? G.keys.colour : null;
      if (K) {
        strike(p * 16, { ...K, bars: Math.min(K.bars, n) }, `keys ${k} (${fn} ${p}-${q})`);
        if (k === 'suspension') { const R = G.keys.suspension.resolve; strike(p * 16 + 24, R, `keys: the suspension resolves (${p + 1})`, { cut: R.cut }); }
        keysSays.push(`a ${k} at ${p}`);
      }
    }
    if (landsHere) keysSays.unshift(`the planner's landing at ${p}${landsHere.change ? ' (a change)' : ''}`);
    plan.keys = keysSays.join('; ') || 'none';
    plan.harmony = landsHere ? `landing ${p}` : '';

    // --- the bass ---
    if (bass && kind !== 'breakdown') {
      const ops: BassOp[] = [];
      let what = '';
      const familiar = kind === 'drop' && p === sections.find((x) => x.startBar === p)?.startBar;
      if (featurePhrase === 2 && F) {
        // the bass climbs out of its riff into an upper melodic line in the solo's gaps, and falls home on the downbeat
        // after; the line fitted under its ceiling over the floor by whole octaves
        const B = F.bass;
        ops.push({ op: 'out', from: 0, to: n });
        const midiOf = (at: string, deg: number, oct: number) => scalePitch(I.scale, I.tonic, I.degreeAt(p + posOf(at).bar), G.bass.floor, deg) + 12 * oct;
        let shift = 0;
        while (Math.max(...B.notes.map(([at, deg, oct]) => midiOf(at, deg, oct + shift))) > G.bass.floor + B.top) shift--;
        for (const [at, deg, oct, len] of B.notes) ops.push({ op: 'add', at, deg, oct: oct + shift, len, vel: B.vel, plain: { st: B.scoopSt, s: B.scoopS },
          db: +(B.db + B.dbPerSt * Math.max(0, midiOf(at, deg, oct + shift) - G.bass.floor - 12)).toFixed(2) });
        what = 'the climb: out of the riff into an upper melodic line in the solo\'s gaps';
        markReturn(q, 'the riff\'s return announced', 'the riff returns on the downbeat after the moment, a crash into the hall');
      } else if (stage === 'later' && (kind === 'main' || kind === 'drop') && !familiar) {
        const v = rng.weighted(fresh('riff', G.bass.developed.variants, (x) => x.id, (x) => x.w));
        used('riff', v.id);
        ops.push(...v.ops);
        what = `the developed riff ${v.id}`;
      } else {
        const v = familiar ? 'B0' : draw(G.bass.first);
        const ref = passage.bass.variants[v];
        if (Array.isArray(ref)) ops.push(...ref);
        what = v;
      }
      // out before an anchor, so its return lands with the chord
      let out = 0;
      if (dominant) out = bassIn(p, q - 1) ? 1 : 0;
      else if (into === 'drop') out = bassIn(p, p + Math.max(1, n - 4)) ? Number(draw(G.bass.leadIn.drop)) : 0;
      else if (fn === 'intoBreak') out = Number(draw(G.bass.leadIn.break));
      else if (arrives?.change) out = Number(draw(G.bass.leadIn.change));
      // the drums alone are the cooldown: the last phrase before the break (or four bars before the outro), flowing
      // straight into its way in, once a passage
      const stretch = `${kind}:${stage}`;
      let orchestra = 0;
      const cool = fn === 'intoBreak' ? 'intoBreak' : into === 'outro' && (kind === 'main' || kind === 'drop') ? 'intoOutro' : null;
      const where = G.bass.orchestra.where;
      if (cool && where[cool] && n >= 8 && s2 !== 'H' && !orchestraUsed.has(stretch) && rng.chance(G.bass.orchestra.chance)) {
        orchestra = Number(draw(where[cool]));
        orchestraUsed.add(stretch);
        out = 0;
      }
      if (out) {
        ops.push({ op: 'out', from: n - out, to: n });
        what += `; out for the last ${out} bar${out > 1 ? 's' : ''} before ${q}`;
        says.push(fn === 'intoBreak' ? `the bass leaves ${out} bar${out > 1 ? 's' : ''} before the break at ${q}` : `the bass leaves ${out} bar${out > 1 ? 's' : ''} before ${q} and returns with it`);
      }
      if (orchestra) {
        ops.push({ op: 'out', from: n - orchestra, to: n });
        what += `; the cooldown: the drums alone for ${orchestra} bars (${q - orchestra}-${q - 1}), straight into the ${cool === 'intoBreak' ? 'break' : 'outro'} at ${q}`;
        // the drums-only stretch carries a voice phrase or a keys colour on top
        const sung = !!lineSpan && lineSpan[1] > (q - orchestra) * 16;
        if (!sung && !strikes.some((x) => posOf(x.at).bar >= rel(q - orchestra) && posOf(x.at).bar < rel(q))) {
          strike((q - orchestra) * 16, { ...G.keys.colour, bars: Math.min(orchestra, G.keys.colour.bars) }, `keys colour over the drums alone (${q - orchestra})`);
          plan.keys += `; a colour over the drums alone at ${q - orchestra}`;
        }
        says.push(`the orchestra: drums and ${sung ? 'the voice' : 'a keys colour'} alone, the bass returning at ${q}`);
      }
      if (!out && !orchestra && featurePhrase !== 2 && answerTo && G.bass.answers[answerTo]) {
        ops.push(...G.bass.answers[answerTo]);
        what += `; a written answer into the drums' ${answerTo}`;
        says.push(`the bass answers the drums' ${answerTo}`);
      }
      if (s2 === 'H') { ops.push(...G.bass.breath); what += '; holds the floor under the half-time breath'; }
      bassPhrases.push({ from: rel(p), variant: ops, label: `bass: ${what} (${p}-${q})` });
      plan.bass = what;
    } else plan.bass = bass ? 'the planner\'s' : 'none';

    // --- the exposed section: the weather forward and moving, a held pad under its landings, the build out ---
    if (kind === 'breakdown') {
      const E = G.exposed;
      // a landing that starts the build is held by the build's own pad (two pads, one leaving three bars in, dig a hole)
      if (landsHere && !(fn === 'intoDrop' && G.builds)) {
        blooms.push({ at: `${rel(p)}:${E.pad.at.split(':')[1]}`, over: 'here', notes: E.pad.notes, bars: E.pad.bars, attack: E.pad.attack, release: E.pad.release, send: E.pad.send, label: `pad held under the landing at ${p}` });
        plan.space = 'a held pad under the landing; ';
      }
      if (fn === 'intoDrop') {
        const B = E.build, b0 = Math.max(p, q - B.bars);
        states.push({ from: rel(b0), to: rel(q), state: 'B', fade: { source: q - b0, hp: B.hp, db: landingAt(b0) && B.landingDb ? B.landingDb : B.db } });
        end(q - 1, ['roll', 'reverseCymbal'], 'the roll accelerating into the drop, a reverse swell on it');
        fx.push({ at: posAt((q - B.riserBeats / 4) * 16), kind: 'riser', beats: B.riserBeats, db: B.riserDb, send: 'riser', label: `the riser into the drop at ${q}` });
        swellInto(b0 * 16, q, B.fieldDb, RB.build);
        if (!(per.get(q)?.crash)) end(q, ['crash'], 'the drop\'s crash');
        // the keys' touch under the build, struck again every few bars, each louder, so the harmony climbs into the drop
        if (!strikes.some((x) => posOf(x.at).bar === rel(b0))) {
          const ats = (B.touches?.at ?? [0]).map((x) => b0 + x).filter((x) => x < q), k = ats.length;
          ats.forEach((at, i) => {
            if (i === 0 && landsHere) return; // the landing's own chord is the first strike
            const T0 = B.touches, db = T0 ? T0.db[0] + (T0.db[1] - T0.db[0]) * (k > 1 ? i / (k - 1) : 1) : G.keys.touch.db;
            strikes.push({ at: posAt(at * 16), over: 'here', notes: G.keys.touch.notes, db: +db.toFixed(2), bars: T0 ? (ats[i + 1] ?? q) - at : 4, vel: G.keys.touch.vel, send: G.anticipation.keysPickupSend, label: `keys touch under the build into ${q}${k > 1 ? ` (${i + 1} of ${k})` : ''}` });
          });
        }
        // the weather rising across the build (ahead of the section's own span, so it is the one that applies)
        if (B.windRise) weather.unshift(weatherSpan(rel(b0), rel(q), `the weather rising into the drop at ${q}`, { rise: B.windRise, panAt: rel(sectionStart(p)) }));
        // the space holds while the drums come in: the pad under the build, on the arriving chord's fifth and seventh,
        // held across the whole build and rising into the drop
        blooms.push({ at: `${rel(b0)}:1`, over: 'here', notes: B.pad.notes, bars: Math.min(B.pad.bars, q - b0), attack: B.pad.attack, release: B.pad.release, send: E.pad.send, ...(B.pad.rise ? { rise: B.pad.rise } : {}), label: `pad under the build into ${q}` });
        plan.drums = `B ${b0}-${q - 1}: the drop's drums fading in through a high-pass ${B.hp[0]}->${B.hp[1]} Hz, ${B.db[0]}->${B.db[1]} dB; the roll in ${q - 1}`;
        plan.space += `the riser and the field swelling (+${B.fieldDb} dB) into ${q}`;
        says.push(`the build: drums, riser, field and ${dominant ? 'the dominant with the voice\'s leading tone' : 'the voice\'s approach'} all point at ${q}`);
      } else plan.space += 'the weather forward and moving across the field';
      const s = sectionOf(p)!;
      if (!weather.some((w) => w.from === rel(s.startBar))) {
        weather.push(weatherSpan(rel(s.startBar), rel(s.startBar + s.bars), 'the weather forward and moving (the harmony alone)'));
        // a less dull section: the master's low-pass and the melodic bus's band opened, still under the mains', opening fully into the drop
        const Fl = E.filter;
        filters.push({ from: s.startBar, to: s.startBar + s.bars, macro: Fl.macro, lp: Fl.lp, hp: Fl.hp, says: Fl.says });
      }
    }
    if (!plan.space) plan.space = swells.some((x) => posOf(x.to).bar === rel(q)) ? `the field swells into ${q}` : '';
    plan.answers = says.join('; ');
    plans.push(plan);
    plansDone++;
  }

  // every chord change the drums play into is answered by them: the passage is written for its own track's landings, and
  // a landing can fall inside a phrase; where nothing in the bar before or on the landing is a landing's gesture, the
  // drums take part there too
  for (const l of I.landings) {
    if (!l.change || !drumsIn(l.bar - 1, l.bar + 1) || kindAt(l.bar) === 'breakdown') continue;
    if (endings.some((x) => (x.bar === rel(l.bar) || x.bar === rel(l.bar - 1)) && x.end.some((e) => GESTURE.has(e)))) continue;
    if (states.some((x) => x.from === rel(l.bar) && (x.state === 'T' || x.state === 'H'))) continue;
    const g = draw(G.drums.landing).split('+');
    if (g.includes('reverseCymbal')) end(l.bar - 1, ['reverseCymbal'], `a reverse swell into the landing at ${l.bar}`);
    const on = g.filter((x) => x !== 'reverseCymbal') as End[];
    end(l.bar, on.length ? on : ['crash'], `the drums on the landing at ${l.bar}`);
    swellInto((l.bar - 1) * 16 + 8, l.bar, G.anticipation.fieldDb, RB.landing);
    const pl = planAt(l.bar) ?? plans.find((x) => x.to === l.bar);
    if (pl) pl.answers = [pl.answers, `the drums take part in the landing at ${l.bar} (${g.join(', ')})`].filter(Boolean).join('; ');
  }
  function planAt(bar: number) { return plans.find((y) => y.from <= bar && y.to > bar); }

  // ----- a build keeps its kick: a bar the planner emptied before the drop's last bar carries the kick on -----
  if (G.builds) for (let b = firstHarmony + 1; b < I.drop - 1; b++) {
    if (!(per.get(b)?.kicks) && (per.get(b - 1)?.kicks ?? 0) > 0 && (per.get(b)?.drums ?? 0) > 0) {
      end(b, ['kickBack'], 'the build keeps its kick: only the roll\'s bar goes without');
      const pl = planAt(b);
      if (pl) pl.drums += `; the kick carried on through ${b}`;
      per.get(b)!.kicks = 1;
    }
  }

  // ----- the straight top heard by the main line: the texture's spans are the straight top's -----
  const tSpans: Array<{ from: number; to: number; label: string }> = [];
  for (const st of [...states].filter((x) => x.state === 'T').sort((a, b) => a.from - b.from)) {
    const last = tSpans[tSpans.length - 1];
    if (last && st.from <= last.to) last.to = Math.max(last.to, st.to);
    else tSpans.push({ from: st.from, to: st.to, label: '' });
  }
  for (const x of tSpans) {
    x.label = `the texture under the straight top ${I.drop + x.from}-${I.drop + x.to - 1}`;
    const pl = planAt(I.drop + x.from);
    if (pl) pl.space = [pl.space, `a texture locked to the sixteenths with the straight top ${I.drop + x.from}-${I.drop + x.to - 1}, in and out with it`].filter(Boolean).join('; ');
  }

  // ----- the harmony held across a build, the pads as a line across each main passage, no empty groove -----
  const bloomsAbs = () => blooms.map((b) => { const x = posOf(b.at); return { from: I.drop + x.bar + x.step / 16, to: I.drop + x.bar + x.step / 16 + b.bars }; });
  const changeAt = (bar: number) => I.landings.some((l) => l.bar === bar && l.change);
  // a pad never crosses a chord change, a dominant's strike or the end of its passage
  const dominantStrikes = strikes.filter((k) => k.dominant).map((k) => I.drop + posOf(k.at).bar + posOf(k.at).step / 16);
  const capAfter = (start: number, limit: number) => Math.min(limit, ...I.landings.filter((l) => l.change && l.bar > start + 0.01).map((l) => l.bar), ...dominantStrikes.filter((b) => b > start + 0.01));
  const padPlans = new Map<number, string[]>();
  const sayPad = (bar: number, x: string) => { const pl = planAt(bar); if (pl) { const l = padPlans.get(pl.from) ?? []; l.push(x); padPlans.set(pl.from, l); } };
  if (G.builds && G.arc) {
    const Bd = G.builds;
    // the build: each landing's chord handed to a pad under its second half, rising to the next entry, its voicing growing
    const ls = I.landings.map((l) => l.bar).filter((b) => b >= firstHarmony && b < I.drop).sort((a, b) => a - b);
    ls.forEach((L, i) => {
      const N = ls[i + 1] ?? I.drop, a = L + Bd.pad.from;
      if (N - a < 2 || bloomsAbs().some((b) => b.from < N - 0.5 && b.to > a + 1)) return;
      const notes = Bd.pad.notes[Math.min(i, Bd.pad.notes.length - 1)];
      blooms.push({ at: `${rel(a)}:1`, over: 'here', notes, bars: N - a, db: Bd.pad.db, attack: Bd.pad.attack, release: Bd.pad.release, send: 'padBloom', rise: Bd.pad.rise, air: Bd.pad.air, width: Bd.pad.width,
        top: G.arc!.top, label: `pad: the build held from ${a}, rising to ${N}` });
      sayPad(a, `the build held: a pad from ${a} rising to ${N}`);
    });
    // the wind rising toward the drop across the build, where the planner laid it
    if (I.drop > firstHarmony) weather.push({ from: rel(firstHarmony), to: 0, rise: Bd.wind.rise, label: 'the wind rising toward the drop' });
  }
  if (G.arc) {
    const A = G.arc;
    const voicing = (nv: number, k: number) => { const V = A.voicings; const row = V[Math.max(0, Math.min(V.length - 1, nv - A.voices[0]))]; return row[k % row.length]; };
    // one entry of the line at `x` along its arc (0 its thinnest, 1 its crest): more voices, louder, wider, more air
    const addPad = (from: number, to: number, x: number, k: number, label: string, extra: Partial<Bloom> = {}) => {
      if (to - from < 1) return;
      const nv = A.voices[0] + Math.round((A.voices[1] - A.voices[0]) * x), lerp = (r: [number, number]) => r[0] + (r[1] - r[0]) * x;
      const whole = Math.floor(from), step = Math.round((from - whole) * 16);
      blooms.push({ at: posAt(whole * 16 + step), over: 'here', notes: voicing(nv, k), bars: +(to - from).toFixed(3), attack: +lerp([A.attack[0], A.attack[1]]).toFixed(2), release: A.release,
        send: 'padBloom', db: +lerp(A.db).toFixed(2), width: +lerp(A.width).toFixed(3), air: +lerp(A.air).toFixed(3), top: A.top, rise: A.rise, fadeBars: A.fadeBars, label, ...extra });
      sayPad(from, `${label} ${from}-${to}`);
    };
    const dropStarts = sections.filter((x) => x.kind === 'drop').map((x) => x.startBar).sort((a, b) => a - b);
    for (const D of dropStarts) {
      const endS = sections.filter((x) => x.startBar > D && (x.kind === 'breakdown' || x.kind === 'outro')).sort((a, b) => a.startBar - b.startBar)[0];
      const E = endS?.startBar ?? I.bars, stg: 'first' | 'later' = D < breakStart ? 'first' : 'later';
      if (E - D < 16) continue;
      const firstBloom = bloomsAbs().filter((b) => b.from >= D && b.from < E).sort((a, b) => a.from - b.from)[0]?.from;
      const crest = I.landings.filter((l) => l.change && l.bar > D && l.bar <= E - 16).map((l) => l.bar).sort((a, b) => b - a)[0];
      const featureHere = feature != null && feature >= D && feature < E;
      const marks: Record<string, number | undefined> = { start: firstBloom ?? D + Math.round((E - D) / 16) * 8, drop: D, crest,
        feature: featureHere ? feature! : undefined, featureEnd: featureHere ? feature! + (F?.bars ?? 16) : undefined, cooldown: E - 8 };
      const knots: Array<[number, number]> = [];
      for (const [m, v] of stg === 'first' ? A.first : A.later) { const b = marks[m]; if (b != null && (!knots.length || b > knots[knots.length - 1][0])) knots.push([b, v]); }
      const arcAt = (bar: number): number | null => {
        if (!knots.length || bar < knots[0][0]) return null;
        for (let i = 1; i < knots.length; i++) if (bar <= knots[i][0]) { const [b0, v0] = knots[i - 1], [b1, v1] = knots[i]; return v0 + (v1 - v0) * (bar - b0) / (b1 - b0); }
        return knots[knots.length - 1][1];
      };
      let k = 0;
      const firstEntry = stg === 'first' ? (firstBloom != null ? Math.floor(firstBloom / 8) * 8 + 8 : marks.start!) : D;
      for (let p = D; p < E; p += 8) {
        const q = Math.min(E, p + 8), x = arcAt(p);
        // the drop's own chord held under it and handed to a pad as it fades (every drop: the bed under the entry)
        if (p === D && (x == null || p < firstEntry)) {
          const a = p + A.handover.from, z = Math.min(capAfter(a, E), a + A.handover.bars);
          if (!bloomsAbs().some((b) => b.from < z && b.to > a + 0.5)) addPad(a, z, A.handover.level, k++, `pad: the drop's chord handed on as it fades (${p})`);
          continue;
        }
        if (x == null || p < firstEntry) continue;
        if (bloomsAbs().some((b) => b.from >= p && b.from < q)) continue;
        const cooldown = p >= E - 8;
        const lands = changeAt(p) || p === D;
        // a half-time breath plays alone: the pad enters after it
        const hEnd = Math.max(p, ...states.filter((st) => st.state === 'H' && I.drop + st.from < p + 4 && I.drop + st.to > p).map((st) => I.drop + st.to));
        let a = lands ? (x >= A.landingAt ? p : p + A.takeover) : p + (x < A.gapBelow ? 1 : 0);
        a = Math.max(a, hEnd);
        const len = Math.round(A.bars[0] + (A.bars[1] - A.bars[0]) * x);
        const z = Math.min(capAfter(a, E), a + len, x >= 0.8 ? q + 1 : q);
        addPad(a, z, x, k++, cooldown ? `pad: the cooldown's last wisp (${p})` : `pad line, entry ${k} of ${D}-${E}`, cooldown ? { db: +(A.db[0] + (A.db[1] - A.db[0]) * x + A.cooldownDb).toFixed(2) } : {});
      }
    }
    // no stretch of the groove without a bed or a phrase: a quiet pad where more than `maxEmptyBars` go bare
    const covered = new Set<number>();
    const cover = (a: number, z: number) => { for (let b = Math.floor(a); b < Math.ceil(z); b++) covered.add(b); };
    for (const e of I.events) if (!e.p.gone && (e.role === 'sparse-keys' || e.layer === 'pad' || e.part === 'weather') && e.part !== 'soloist' && e.part !== 'soloist-swell' && Number(e.p.dur) >= 2 * bs) cover(e.t / bs, e.t / bs + Number(e.p.dur) / bs + 0.75);
    for (const k0 of strikes) { const x = posOf(k0.at); if (k0.bars >= 1) cover(I.drop + x.bar, I.drop + x.bar + k0.bars + 0.75); }
    for (const b of bloomsAbs()) cover(b.from, b.to);
    for (const L of lines) { const a = I.drop * 16 + sixteenthsOf(L.at); cover(a / 16, (a + phraseLen(L.phrase, L.skip ?? 0).total) / 16 + 1); }
    for (const t of tSpans) cover(I.drop + t.from, I.drop + t.to);
    const groove = (b: number) => { const k0 = kindAt(b); return (k0 === 'drop' || k0 === 'main' || k0 === 'build' || (k0 === 'outro' && !plans.find((y) => y.from <= b && y.to > b && y.fn === 'last'))) && b >= firstHarmony && drumsIn(b, b + 1); };
    for (let b = 0; b < I.bars; b++) {
      if (!groove(b) || covered.has(b)) continue;
      let z = b;
      while (z < I.bars && groove(z) && !covered.has(z)) z++;
      if (z - b > A.maxEmptyBars) {
        const a = Math.max(0, b - 1), e = Math.min(capAfter(a, I.bars), a + Math.min(z - a + 1, A.filler.bars));
        if (e - a >= 2) { addPad(a, e, A.filler.level, b, `pad: a bed where the groove went bare (${b}-${z - 1})`); cover(a, e); }
      }
      b = z;
    }
    for (const [from, xs] of padPlans) { const pl = plans.find((y) => y.from === from); if (pl) pl.space = [pl.space, ...xs].filter(Boolean).join('; '); }
  }

  // the row: the passage's vocabulary and its window, the grammar's phrases everywhere else, one window the whole track
  const row: PassageRow = {
    ...passage,
    id: `${passage.id}+${G.id}`,
    name: `${passage.name}, and ${G.name}`,
    window: { from: -I.drop, to: I.bars - I.drop },
    retire: { parts: [...new Set([...passage.retire.parts, ...G.retire.parts])], voices: [...new Set([...passage.retire.voices, ...G.retire.voices])], layers: G.retire.layers, bed: true },
    phrases: phrases as PassageRow['phrases'],
    lines: lines.sort((a, b) => sixteenthsOf(a.at) - sixteenthsOf(b.at)),
    keys: { ...passage.keys, strikes, drop: keysDrop, pickupSend: G.anticipation.keysPickupSend },
    pad: { ...passage.pad, blooms },
    wind: undefined,
    weather,
    fx,
    swells,
    drums: { ...passage.drums, states, endings, thinBars: thin },
    bass: { ...passage.bass, phrases: bassPhrases, floor: G.bass.floor, ...(G.bass.register ? { register: G.bass.register } : {}) },
    ...(G.holds ? { holds: G.holds } : {}),
    ...(G.texture && tSpans.length ? { texture: { ...G.texture, spans: tSpans } } : {}),
  };
  return { row, phrases: plans.sort((a, b) => a.from - b.from), filters };
}
