// What a bird's cell says, in one place (round K13 of the ring).
//
// Eugene, 2026-09-24: *"it's a dead UX that we bold a value on a bird that
// doesn't change on movement. If a value is locked, move it to a subtitle like
// TIGHT · FX, and the big label should show an actual role based on the
// percentage value, at least roughly, on some segmented scale."*
//
// So a cell's big word is **the quantity its own bird biases**, the way Ember's
// big number has always been the tempo the composer derives from the pulse: a
// control of the style, a field of `derive()`, or a reading of the plan the
// bird leans. A continuous quantity is cut into named bands, and every cut is
// solved from the composer at load — a family's own window on that control, or
// the edge of what the record's fourteen themes reach on the bird — so a
// threshold is never a number typed twice (`bird-labels.json` says which).
// The seed's locked reading, which the bird does not bias — the key, the room,
// the density, the palette, the section count, the hats — moves to the
// subtitle, with the role it is a reading of.
//
// Reading a derived value for a label moves no plan: `derive().changeRate` is
// computed and unread by the composer, and reading it here is a word on a page.
//
// Pure: no DOM, so the page (`ring.ts`) and the memo (`tools/birds-memo.ts`)
// read the one author.

import LABELS from './bird-labels.json' with { type: 'json' };
import AIR from './voice-air.json' with { type: 'json' };
import { BIRDS, HOUSE, HOUSE_OUTER, asSpell, derive, musicalControls, knobsFor } from './spell.ts';
import { surfRowOf, type SurfRow } from './surf.ts';
import { nearestEntry, leanFactor, leanShift, type BirdLeans } from './places.ts';
import { VOICE_KNOBS } from '@deep-house/engine/voices';
import { conversationRowOf, conversationFrame, conversationLeansIn, type ConversationFrame, type ConversationZone } from './slow-conversation.ts';
import { zoneBands, type StylePlaces } from './places.ts';
import type { Bird, Derived, Spell } from './spell.ts';
import type { Style } from '@deep-house/engine/style';

/** A die is the word it rolled, or a row carrying that word. */
type Die = string | number | { value?: string | number; label?: string } | null | undefined;
/** A sixteen-step figure, in any of the three shapes the dice hand one over in. */
type Mask = number[] | string | number | null | undefined;

/** What a cell prints: the big word, the line under it, and a second line for the pair. */
export interface CellValue { word: string | number | null | undefined; sub: string; sub2?: string }

/**
 * The theme a cell reads: a playing readout or a planned one, and the spell it
 * was planned under (absent is the house).
 */
export interface LabelTheme {
  spell?: Partial<Spell> | null;
  bpm: number;
  key: string;
  presetName?: string;
  preset?: string;
  bars: number;
  plan: ArrayLike<unknown>;
  dice?: any;
  durationLabel?: string;
  /** what the hats play, read off the program (`hatsOfProgram`), where the theme was asked for it */
  hats?: HatsReading | null;
  /** what the program plays, as facts a line may state (`programFactsOf`), where the theme was asked for it */
  facts?: ProgramFacts | null;
  /** the keys that play (`keysOfProgram`), where the theme was asked for it */
  keys?: string | null;
  /** the held layer's voice that plays most (`heldOfProgram`), where the theme was asked for it */
  held?: string | null;
  /** the front voices' brightness settings as the program plays them (`airPlayOf`), where the theme was asked for it */
  air?: AirPlay | null;
  /** or the seasoning the theme plays under (the plan's `knobs`, by event voice), read with `events` */
  knobs?: Record<string, Record<string, number>> | null;
  /** or the program itself, for a planned theme the hats are read off here */
  events?: ArrayLike<{ voice: string; layer: string; bar: number; step?: number }>;
  timeline?: ArrayLike<{ bar: number; section: string }>;
}

/**
 * **What the hats play, read off the program** (round K28). The dice roll a
 * hat mask, but what plays is a lane's own reading of it — the offbeat lane
 * takes only its offbeats, an open hat takes one of them, a broken kit or a
 * sixteenth lane changes the rest — so a subtitle built from the mask can say
 * six hits while four play. This is the bar the listener hears most: over the
 * main section (or, where a strategy names none, every bar the hats play in),
 * the step pattern of the hats layer most bars share, its distinct steps the
 * hits, and how many of them an open hat takes.
 */
export interface HatsReading { hits: number; steps: number[]; open: number }
const hatsCache = new WeakMap<object, HatsReading>();
export function hatsOfProgram(
  events: ArrayLike<{ voice: string; layer: string; bar: number; step?: number }> | null | undefined,
  timeline: ArrayLike<{ bar: number; section: string }> | null | undefined,
): HatsReading | null {
  if (!events || !timeline) return null;
  const hit = hatsCache.get(events as object);
  if (hit) return hit;
  const bars = new Map<number, { steps: Set<number>; open: Set<number> }>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.layer !== 'hats' || e.step == null) continue;
    let b = bars.get(e.bar);
    if (!b) { b = { steps: new Set(), open: new Set() }; bars.set(e.bar, b); }
    b.steps.add(e.step);
    if (/open/i.test(e.voice)) b.open.add(e.step);
  }
  const main: number[] = [];
  for (let i = 0; i < timeline.length; i++) if (/main/i.test(timeline[i].section) && bars.has(timeline[i].bar)) main.push(timeline[i].bar);
  const pool = main.length ? main : [...bars.keys()].sort((a, b) => a - b);
  let out: HatsReading = { hits: 0, steps: [], open: 0 };
  if (pool.length) {
    const tally = new Map<string, { n: number; bar: number }>();
    for (const b of pool) {
      const k = [...bars.get(b)!.steps].sort((x, y) => x - y).join(',') + '|' + [...bars.get(b)!.open].sort((x, y) => x - y).join(',');
      const t = tally.get(k);
      if (t) t.n++; else tally.set(k, { n: 1, bar: b });
    }
    let best: { n: number; bar: number } | null = null;
    for (const t of tally.values()) if (!best || t.n > best.n) best = t;
    const b = bars.get(best!.bar)!;
    const steps = [...b.steps].sort((x, y) => x - y);
    out = { hits: steps.length, steps, open: b.open.size };
  }
  hatsCache.set(events as object, out);
  return out;
}
/**
 * **What the program plays, as facts a line may state** (round K30, the
 * reviews of 09-26). A band's word is the control
 * its bird moves; its sentence used to name parts that control only makes more
 * likely — "rolling hands" on 1 of 40 house themes, "on a pedal" on 37 of 80,
 * a beat with the drums off. A line now names a part only where the program
 * carries it: the drums from the drum lanes' events (kick, hats, clap), the
 * rest from the composition's own record of what it drew (`selected`, `scene`,
 * the trace the dice carry since the parts round). A theme with no record (the
 * record's engine, a pinned recipe) states none of the parts.
 */
export interface ProgramFacts {
  drums: boolean;
  /** a bass layer plays (the bells-birds round: a struck conversation holds the bassline off, and Spark's second line said a bass's moves) */
  bass: boolean;
  /**
   * the conversation's hand strikes (the bird-labels review, 10-18: at Spark 0 the record names a frame drum and it
   * strikes in none of 24 themes, in 6 of 24 at 0.1): an event of the part `conversation-punctuation`
   */
  hand: boolean;
  hands: boolean; rolling: boolean; breaks: boolean;
  pulse: boolean; receding: boolean;
  pedal: boolean; longPedal: boolean; arches: boolean;
  droneFront: boolean; droneBack: boolean; ornament: boolean;
  /** a shimmer pad sounds (ambient-waves-3: at WAVES Gleam's own reach is the shimmer's climb, on the bloom where it is the shimmer) */
  shimmer: boolean;
}
const factsCache = new WeakMap<object, ProgramFacts>();
export function programFactsOf(
  events: ArrayLike<{ voice: string; layer: string; part?: string }> | null | undefined,
  dice: { composition?: string } | null | undefined,
): ProgramFacts | null {
  if (!events) return null;
  const hit = factsCache.get(events as object);
  if (hit) return hit;
  let drums = false, bass = false, hand = false, shimmer = false;
  for (let i = 0; i < events.length && !(drums && bass && hand && shimmer); i++) {
    const l = events[i].layer;
    if (l === 'kick' || l === 'hats' || l === 'clap') drums = true;
    if (l === 'bass') bass = true;
    if (events[i].part === 'conversation-punctuation') hand = true;
    if (events[i].voice === 'shimmerPad') shimmer = true;
  }
  let trace: { selected?: Record<string, string>; scene?: string; context?: { kit?: string } } | null = null;
  try { trace = dice && typeof dice.composition === 'string' ? JSON.parse(dice.composition) : null; } catch (e) { trace = null; }
  const sel = (trace && trace.selected) || {};
  const out: ProgramFacts = {
    drums, bass, hand,
    hands: drums && !!sel.percussion,
    rolling: drums && sel.percussion === 'rolling',
    breaks: drums && !!sel['figure-groove'] || (drums && !!(trace && trace.context && trace.context.kit === 'breaks')),
    pulse: !!sel.pulse,
    receding: drums && !!sel['receding-backbeat'],
    pedal: sel.harmony === 'pedal' || sel.bass === 'pedal' || sel.bass === 'long-pedal',
    longPedal: sel.bass === 'long-pedal',
    arches: sel.figure === 'arch' || sel.figure === 'long-arch' || sel.ornament === 'late-arch' || sel.ornament === 'long-answer',
    droneFront: !!trace && trace.scene === 'drone-forward',
    droneBack: !!trace && trace.scene === 'drone-back',
    ornament: !!sel.ornament,
    shimmer,
  };
  factsCache.set(events as object, out);
  return out;
}
/** A theme's facts: the readout's, or read off its own program. */
export const factsOf = (t: LabelTheme): ProgramFacts | null => t.facts ?? programFactsOf(t.events, t.dice);

/**
 * **The keys that play** (round K30, the reviews of 09-26): the dice roll a stab timbre and
 * the readout named it whether or not the stab part was drawn — 46 of 234
 * plans named a keyboard that plays nowhere. The keys layer's own voices, read
 * off the program: the rolled timbre where it plays, else the one that plays
 * most; none where no keys play.
 */
const keysCache = new WeakMap<object, string | null>();
export function keysOfProgram(events: ArrayLike<{ voice: string; layer: string; p?: unknown }> | null | undefined, rolled: string | null | undefined): string | null | undefined {
  if (!events) return undefined;
  if (keysCache.has(events as object)) return keysCache.get(events as object)!;
  const n = new Map<string, number>();
  // a keys voice plays a timbre by its preset (the generic keys voice plays an
  // electric piano or vibes by `preset`), and a named one is its own timbre
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.layer !== 'keys') continue;
    const pre = e.p && typeof (e.p as { preset?: unknown }).preset === 'string' ? (e.p as { preset: string }).preset : e.voice;
    n.set(pre, (n.get(pre) || 0) + 1);
  }
  let out: string | null = null;
  if (rolled && n.has(rolled)) out = rolled;
  else { let best = 0; for (const [v, c] of n) if (c > best) { best = c; out = v; } }
  keysCache.set(events as object, out);
  return out;
}
/**
 * **The held voice that plays** (the bird-labels round, 10-18): where no keys play, Zephyr's cell said "no keys" while
 * Zephyr brightened the voice that holds — the shimmer pad at the Ambient tile in 31 % of its themes, the supersaw lead
 * at the Trance tile in 37 % — and Zephyr's own lists draw it (`list.padPartners`, `list.sustainedLeads`). The held
 * layer's voice that plays most, by its timbre where the voice names one; none where nothing holds.
 */
const heldCache = new WeakMap<object, string | null>();
export function heldOfProgram(events: ArrayLike<{ voice: string; layer: string; p?: unknown }> | null | undefined): string | null | undefined {
  if (!events) return undefined;
  if (heldCache.has(events as object)) return heldCache.get(events as object)!;
  const n = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.layer !== 'pad') continue;
    const tim = e.p && typeof (e.p as { timbre?: unknown }).timbre === 'string' ? (e.p as { timbre: string }).timbre : e.voice;
    n.set(tim, (n.get(tim) || 0) + 1);
  }
  let out: string | null = null, best = 0;
  for (const [v, c] of n) if (c > best) { best = c; out = v; }
  heldCache.set(events as object, out);
  return out;
}
/** The held voice a theme plays: the readout's, or its program's. */
function heldOf(t: LabelTheme): string | null {
  if (t.held !== undefined) return t.held;
  return heldOfProgram(t.events) ?? null;
}

/** The keys a theme plays: the readout's, its program's, or the roll where there is no program. */
function keysOf(t: LabelTheme): string | null {
  const d = t.dice || {};
  if (t.keys !== undefined) return t.keys;
  const k = keysOfProgram(t.events, d.keysPreset);
  return k === undefined ? d.keysPreset ?? null : k;
}

/**
 * **The voice in front**, as Zephyr's cell reads it: the keys that play, else the voice that holds (the shimmer pad at
 * the Ambient tile, the supersaw lead at the Trance tile), with its role. None where neither plays.
 */
export function frontOf(t: LabelTheme): { id: string; role: AirRole } | null {
  const k = keysOf(t);
  if (k) return { id: k, role: 'keys' };
  const h = heldOf(t);
  return h ? { id: h, role: 'held' } : null;
}
/** Zephyr's air at a theme: the front voice's as it plays, where it has been measured. */
function frontAir(t: LabelTheme) {
  const f = frontOf(t);
  if (!f) return null;
  const a = airOf(f.id, f.role, settingOf(playOf(t), f.id, f.role));
  return a ? { ...a, ...f } : null;
}

/**
 * **The front voices as they are played** (bird-labels round 3, 10-18, his words on BELLS: *"ring label doesn't change
 * although immediate description in popup label on slide has good number of variants"*). Zephyr moves a voice's
 * brightness as well as which voice plays: the calls' strike (`hardness`, the velocity), the keys row's low-pass
 * (`keysLp`, the notes' `lpMul`) and a voice's brightness knob (`brightnessHz`, the seasoning the spell writes). These
 * are the settings the program plays, per role: the keys that play, the held voice, and each voice that calls; the
 * cell reads its voice's curve (`voice-air.json`, `curve`) at them.
 */
export interface AirSetting { voice: string; lpMul: number; vel: number; knob?: number }
export interface AirPlay { keys?: AirSetting & { id: string }; held?: AirSetting & { id: string }; calls?: Record<string, AirSetting> }
type AirEvent = { voice: string; layer: string; part?: string; p?: unknown };
const airPlayCache = new WeakMap<object, { rolled: string | null | undefined; play: AirPlay }>();
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** One role's notes as played: the voice most of them are on, their median low-pass factor and velocity. */
function settingOfNotes(evs: AirEvent[]): AirSetting {
  const n = new Map<string, number>();
  for (const e of evs) n.set(e.voice, (n.get(e.voice) || 0) + 1);
  let voice = '', best = 0;
  for (const [v, c] of n) if (c > best) { best = c; voice = v; }
  const pOf = (e: AirEvent) => (e.p || {}) as { lpMul?: unknown; vel?: unknown };
  const lp = (e: AirEvent) => { const m = pOf(e).lpMul; return Array.isArray(m) && typeof m[0] === 'number' ? Math.sqrt(Math.abs(m[0] * (typeof m[1] === 'number' ? m[1] : m[0]))) : 1; };
  const vels = evs.map((e) => pOf(e).vel).filter((v): v is number => typeof v === 'number');
  return { voice, lpMul: +median(evs.map(lp)).toFixed(4), vel: vels.length ? +median(vels).toFixed(4) : NaN };
}
export function airPlayOf(events: ArrayLike<AirEvent> | null | undefined, knobs: Record<string, Record<string, number>> | null | undefined, rolled: string | null | undefined): AirPlay | null {
  if (!events) return null;
  let hit = airPlayCache.get(events as object);
  if (!hit || hit.rolled !== rolled) {
    const keysId = keysOfProgram(events, rolled) ?? null, heldId = heldOfProgram(events) ?? null;
    const keys: AirEvent[] = [], keysConv: AirEvent[] = [], held: AirEvent[] = [], calls = new Map<string, AirEvent[]>();
    const preset = (e: AirEvent) => { const v = (e.p as { preset?: unknown } | undefined)?.preset; return typeof v === 'string' ? v : e.voice; };
    const timbre = (e: AirEvent) => { const v = (e.p as { timbre?: unknown } | undefined)?.timbre; return typeof v === 'string' ? v : e.voice; };
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.part === 'conversation-call') { const id = preset(e); (calls.get(id) ?? calls.set(id, []).get(id)!).push(e); }
      if (e.layer === 'keys' && keysId && preset(e) === keysId) (String(e.part ?? '').startsWith('conversation-') ? keysConv : keys).push(e);
      else if (e.layer === 'pad' && heldId && timbre(e) === heldId) held.push(e);
    }
    const play: AirPlay = {};
    if (keysId && (keys.length || keysConv.length)) play.keys = { id: keysId, ...settingOfNotes(keys.length ? keys : keysConv) };
    if (heldId && held.length) play.held = { id: heldId, ...settingOfNotes(held) };
    if (calls.size) play.calls = Object.fromEntries([...calls].map(([id, evs]) => [id, settingOfNotes(evs)]));
    hit = { rolled, play };
    airPlayCache.set(events as object, hit);
  }
  // the knob the seasoning sets on each role's voice (absent: the voice's own default)
  const k = (s: AirSetting) => { const v = knobs?.[s.voice]?.brightnessHz; return typeof v === 'number' ? { ...s, knob: v } : s; };
  const p = hit.play;
  return { ...(p.keys ? { keys: k(p.keys) as AirSetting & { id: string } } : {}), ...(p.held ? { held: k(p.held) as AirSetting & { id: string } } : {}),
    ...(p.calls ? { calls: Object.fromEntries(Object.entries(p.calls).map(([id, s]) => [id, k(s)])) } : {}) };
}
/** A theme's played settings: the readout's, or its program's. */
function playOf(t: LabelTheme): AirPlay | null {
  if (t.air !== undefined) return t.air;
  return airPlayOf(t.events as ArrayLike<AirEvent> | undefined, t.knobs, t.dice?.keysPreset);
}
/** The setting a voice plays at in a role, where the theme's program plays it there. */
export function settingOf(play: AirPlay | null, id: string | null | undefined, role: AirRole): AirSetting | null {
  if (!play || !id) return null;
  if (role === 'call') return play.calls?.[id] ?? null;
  const s = play[role];
  return s && s.id === id ? s : null;
}

/** The facts a band's parts can be under, for the checks: none of them, each alone, and all. */
function allFacts(items: WithItem[]): Array<[string, ProgramFacts]> {
  const none = { drums: true, bass: true, hand: true, hands: false, rolling: false, breaks: false, pulse: false, receding: false, pedal: false, longPedal: false, arches: false, droneFront: false, droneBack: false, ornament: false, shimmer: true };
  const out: Array<[string, ProgramFacts]> = [['', none]];
  for (const w of items) out.push([` with ${w.needs}`, { ...none, [w.needs]: true }]);
  if (items.length > 1) out.push([' with every part', { ...none, ...Object.fromEntries(items.map((w) => [w.needs, true])) }]);
  return out;
}

/** Fill a line's `{with}` from the parts the program plays. */
function fillWith(text: string, band: Pick<Band, 'with' | 'joiner'>, facts: ProgramFacts | null, kind: 'says' | 'short'): string {
  if (!text.includes('{with}')) return text;
  const on = facts ? band.with.filter((w) => facts[w.needs]) : [];
  if (!on.length) return text.replace('{with}', '');
  if (kind === 'short') return text.replace('{with}', `, ${on[0].short}`);
  const words = on.map((w) => w.says);
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  return text.replace('{with}', `${band.joiner}${list}`);
}

/** The hats a theme plays: its program where it carries one, else its dice's mask. */
function hatsOf(t: LabelTheme): { character: string; hits: string } {
  const h = t.hats ?? hatsOfProgram(t.events, t.timeline);
  if (!h) { const d = t.dice || {}; return { character: hatCharacter(d.hatMask), hits: plural(maskCount(d.hatMask), 'hit') }; }
  const bits = new Array(16).fill(0);
  for (const x of h.steps) if (x >= 0 && x < 16) bits[x] = 1;
  return { character: hatCharacter(bits), hits: plural(h.hits, 'hit') + (h.open ? ` · ${h.open} open` : '') };
}

// --- the table ----------------------------------------------------------------

type Bound = { window: [string, string | null, string, 'min' | 'max'] } | { record: 'low' | 'high' } | null;
interface LeanRow { short: string; says: string }
/** A part a band's line names, said only where the program plays it (K30): the fact it needs, and its words. */
export interface WithItem { needs: keyof ProgramFacts; says: string; short: string }
interface BandRow { word: string; says: string; short: string; upTo: Bound; lean?: { low: LeanRow; high: LeanRow }; with?: WithItem[]; joiner?: string }
interface BirdRow {
  cell: string;
  big: { control?: string; derive?: string; plan?: string; unit?: string };
  bands?: BandRow[];
  family?: Record<string, string>;
  /** the long form: a band's own, or the bird's where its word is the plan's (a map by family for Ember) */
  says?: string | Record<string, string>;
  /** the short form the panel and the track show: the band's fact in five words at most (a map by family for Ember) */
  short?: string | Record<string, string>;
  lockedSays?: string;
  sub: string;
  reads: string[];
  /** the word and lines with no drum event in the theme (K30, Spark) */
  noDrums?: { word: string; says: string; short: string };
  /** Zephyr's air (the bird-labels round, 10-18): the scale its big word is cut on, and the front voice's role as a sentence says it */
  air?: AirRow;
}
export const LABEL_TABLE = LABELS as unknown as { kind: string; schema: number; birds: Record<Bird, BirdRow>; timbres: Record<string, string>; cellWords: Record<string, string> };

// --- Zephyr's air (the bird-labels round, 10-18) -----------------------------------------------------------------

/**
 * **Zephyr is air** (Eugene, 10-18, on its "No keys": *"Zephyr is air and you tend to name musical instruments in it
 * … is it really the most efficient way to call the timbre? … "No keys" is a bit strange value"*). The words listeners
 * use alike for a timbre come down to three axes: luminance (dark to bright), texture (smooth to rough) and mass
 * (thin to full); past them a source's name ("a saw pad") packs the rest into one word. So the instrument is the
 * locked reading, the subtitle, and the big word is the air of the voice in front, on the axis Zephyr moves: its
 * brightness, measured from the sound (`voice-air.json`, `tools/voice-air.ts`: the spectral centroid at the onsets, each
 * voice alone at its place's pitch) and cut on a scale of plain words (`bird-labels.json`, `zephyr.air`). A cut is
 * never a number typed: it falls between two measured neighbours, at the geometric middle of their centroids. The
 * texture index earns no second word (every voice's flatness is under 0.12).
 */
export type AirRole = 'keys' | 'held' | 'call';
/** a voice's brightness along the control Zephyr moves it by (`tools/voice-air.ts`, step 4): `[setting, hz]` points */
export interface AirCurve { by: 'knob' | 'lpMul' | 'vel'; voice?: string; unset?: number; points: Array<[number, number]> }
interface AirEntry { hz: number; over1500: number; flat: number; at: string[]; curve?: AirCurve }
type AirTable = 'keys' | 'held' | 'calls';
interface AirBandRow { word: string; upTo: { between: [string, string] } | null; says: string; short: string; lean?: { low: LeanRow; high: LeanRow } }
interface AirRow { bands: AirBandRow[]; on: Record<AirRole, string> }
export const AIR_TABLE = AIR as unknown as Record<AirTable, Record<string, AirEntry>>;
const AIR_TABLES: readonly AirTable[] = ['keys', 'held', 'calls'];
const tableOfRole = (role: AirRole): AirTable => (role === 'call' ? 'calls' : role);
/** A voice's measured centroid in a role: its own role's, else the one role it was measured in (the keys' strings, held). */
export function airHz(id: string | null | undefined, role: AirRole, setting?: AirSetting | null): number | null {
  if (!id) return null;
  let e = AIR_TABLE[tableOfRole(role)][id];
  if (!e) for (const t of AIR_TABLES) if (AIR_TABLE[t][id]) { e = AIR_TABLE[t][id]; break; }
  if (!e) return null;
  const x = e.curve && setting ? curveSetting(e.curve, setting) : null;
  return x == null ? e.hz : Math.round(airCurveAt(e.curve!, x));
}
/** The setting a curve reads off a role's played notes: the strike, the low-pass, or the knob where it is that voice's. */
function curveSetting(c: AirCurve, s: AirSetting): number | null {
  const x = c.by === 'vel' ? s.vel : c.by === 'lpMul' ? s.lpMul : c.voice === s.voice ? s.knob ?? c.unset : undefined;
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
}
/** A curve at a setting: linear in octaves between its points, held at its ends. */
export function airCurveAt(c: AirCurve, x: number): number {
  const P = c.points;
  if (x <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (x <= P[i][0]) {
    const [x0, h0] = P[i - 1], [x1, h1] = P[i];
    const u = Math.log(x / x0) / Math.log(x1 / x0);
    return Math.exp(Math.log(h0) + u * Math.log(h1 / h0));
  }
  return P[P.length - 1][1];
}
/** A band of the air, solved: its cut in hertz, and its span (the neighbour cuts, the table's ends) for the leans. */
export interface AirBand { word: string; says: string; short: string; upTo: number | null; from: string; lo: number; hi: number; lean: { low: LeanRow; high: LeanRow } | null }
let AIR_SOLVED: AirBand[] | null = null;
/** Zephyr's air scale, solved against the measured table once. */
export function airBands(): AirBand[] {
  if (AIR_SOLVED) return AIR_SOLVED;
  const row = LABEL_TABLE.birds.zephyr.air!;
  const all = AIR_TABLES.flatMap((t) => Object.values(AIR_TABLE[t]).map((e) => e.hz));
  const hzOf = (ref: string) => {
    const [t, id] = ref.split('.') as [AirTable, string];
    const e = AIR_TABLE[t]?.[id];
    if (!e) throw new Error(`bird-labels: the air's cut names ${ref}, which voice-air.json has not measured`);
    return e.hz;
  };
  const cuts = row.bands.map((b) => (b.upTo ? Math.round(Math.sqrt(hzOf(b.upTo.between[0]) * hzOf(b.upTo.between[1]))) : null));
  AIR_SOLVED = row.bands.map((b, k) => ({
    word: b.word, says: b.says, short: b.short, upTo: cuts[k],
    from: b.upTo ? `between ${b.upTo.between[0]} (${hzOf(b.upTo.between[0])} Hz) and ${b.upTo.between[1]} (${hzOf(b.upTo.between[1])} Hz)` : '',
    lo: k > 0 ? cuts[k - 1]! : Math.min(...all), hi: cuts[k] ?? Math.max(...all), lean: b.lean ?? null,
  }));
  return AIR_SOLVED;
}
/** The air a voice carries in a role: its band, and where in the band its centroid stands (the lower and upper thirds, in octaves). */
export function airOf(id: string | null | undefined, role: AirRole, setting?: AirSetting | null): { band: AirBand; lean: 'low' | 'mid' | 'high'; hz: number } | null {
  const hz = airHz(id, role, setting);
  if (hz == null) return null;
  const bands = airBands();
  const band = bands.find((b) => b.upTo == null || hz < b.upTo) ?? bands[bands.length - 1];
  const span = Math.log(band.hi / band.lo);
  const p = span > 0 ? Math.log(hz / band.lo) / span : 0.5;
  return { band, lean: p < 1 / 3 ? 'low' : p > 2 / 3 ? 'high' : 'mid', hz };
}
/** A band of the air's line at its lean. */
const airLine = (a: { band: AirBand; lean: 'low' | 'mid' | 'high' }, kind: 'says' | 'short') =>
  a.lean !== 'mid' && a.band.lean ? a.band.lean[a.lean][kind] : a.band[kind];

/** One band, with its threshold solved: in the quantity's own units and in the bird's. */
export interface Band {
  word: string;
  /** what the music is in this band, one plain sentence */
  says: string;
  /** the same in five words at most, for the panel and the track */
  short: string;
  /** the quantity's value the band holds up to (exclusive), or null for the last */
  upTo: number | null;
  /** the same threshold as the bird's own value (others at the house), or null */
  birdAt: number | null;
  /** where it was solved from, in words */
  from: string;
  /** the quantity's value the band starts at: the band before's threshold, or the quantity at the bird's wall */
  from0: number | null;
  /** and where it ends: its own threshold, or the quantity at the bird's other wall */
  to0: number | null;
  /** its two leans, the lower third's and the upper third's (round K15) */
  lean: { low: LeanRow; high: LeanRow } | null;
  /** the parts its lines name, each said only where the program plays it (K30) */
  with: WithItem[];
  joiner: string;
}

type StyleLike = Style & { controls?: Record<string, { home: number; slopes: Partial<Record<Bird, number>>; bounds: [number, number] }>; composition?: { families: any[] } };

/** Whether a style reads the spell at all, and so whether its birds have quantities to say. */
export const labelsFor = (style: Style | null | undefined): boolean => {
  const s = style as StyleLike | null | undefined;
  return !!s && !!s.controls && !!s.composition;
};

const SOLVED = new WeakMap<object, Record<Bird, Band[]>>();

/** A control's value at a bird's value, the other seven at the house. */
function controlAt(style: StyleLike, control: string, bird: Bird, v: number): number {
  return musicalControls({ ...HOUSE, [bird]: v } as Spell, style)![control];
}

/** The bird's value where one control (a straight line in it) reaches `x`. */
function birdWhere(style: StyleLike, control: string, bird: Bird, x: number): number | null {
  const rule = style.controls![control];
  const slope = rule && rule.slopes[bird];
  if (!rule || !slope) return null;
  return HOUSE[bird] + (x - rule.home) / slope;
}

function solveBound(style: StyleLike, bird: Bird, row: BirdRow, b: Bound): { upTo: number | null; birdAt: number | null; from: string } {
  if (!b) return { upTo: null, birdAt: null, from: '' };
  if ('record' in b) {
    const at = b.record === 'low' ? HOUSE[bird] - HOUSE_OUTER[bird] : HOUSE[bird] + HOUSE_OUTER[bird];
    const upTo = row.big.control ? controlAt(style, row.big.control, bird, at) : at;
    return { upTo, birdAt: at, from: `the record's ${b.record === 'low' ? 'lowest' : 'highest'} ${bird} (house ${b.record === 'low' ? '-' : '+'} HOUSE_OUTER)` };
  }
  const [familyId, variantId, control, bound] = b.window;
  const family = style.composition!.families.find((f: any) => f.id === familyId);
  if (!family) throw new Error(`bird-labels: no family ${familyId}`);
  const where = variantId ? (family.variants || []).find((v: any) => v.id === variantId) : family;
  if (!where) throw new Error(`bird-labels: no variant ${familyId}/${variantId}`);
  const x = where.when?.controls?.[control]?.[bound];
  if (typeof x !== 'number') throw new Error(`bird-labels: ${familyId}/${variantId ?? '-'} has no ${control}.${bound}`);
  if (row.big.control !== control) throw new Error(`bird-labels: ${bird} reads ${row.big.control}, not ${control}`);
  return { upTo: x, birdAt: birdWhere(style, control, bird, x), from: `${familyId}${variantId ? ':' + variantId : ''} ${control} ${bound === 'min' ? '≥' : '<'} ${x}` };
}

/** Every bird's bands, solved against a style once. Ember and Zephyr, whose words are the plan's, have none. */
export function bandsOf(style: Style): Record<Bird, Band[]> {
  const s = style as StyleLike;
  const hit = SOLVED.get(s);
  if (hit) return hit;
  const out = {} as Record<Bird, Band[]>;
  for (const bird of BIRDS) {
    const row = LABEL_TABLE.birds[bird];
    const bands: Band[] = (row.bands || []).map((band) => ({ word: band.word, says: band.says, short: band.short, ...solveBound(s, bird, row, band.upTo), from0: null, to0: null, lean: band.lean ?? null, with: band.with ?? [], joiner: band.joiner ?? ', with ' }));
    // the band's span in the quantity: its neighbours' thresholds, and at the
    // two ends the quantity the bird reaches at its walls, the others at the house
    const walls = [0, 1].map((v) => quantityOf(bird, { ...HOUSE, [bird]: v } as Spell, s)).filter((q): q is number => q != null);
    bands.forEach((b, k) => {
      b.from0 = k > 0 ? bands[k - 1].upTo : walls.length ? Math.min(...walls) : null;
      b.to0 = b.upTo ?? (walls.length ? Math.max(...walls) : null);
    });
    out[bird] = bands;
  }
  SOLVED.set(s, out);
  return out;
}

/** The quantity a bird biases, at a spell. */
export function quantityOf(bird: Bird, spell: Partial<Spell> | null | undefined, style: Style): number | null {
  const row = LABEL_TABLE.birds[bird];
  const s = asSpell(spell);
  if (row.big.control) return musicalControls(s, style)![row.big.control];
  if (row.big.derive) {
    const v = derive(s)[row.big.derive as keyof Derived];
    return typeof v === 'number' ? v : null;
  }
  return null;
}

/** The band a spell puts a bird in, or null where its word is the plan's. */
export function bandAt(bird: Bird, spell: Partial<Spell> | null | undefined, style: Style): Band | null {
  const bands = bandsOf(style)[bird];
  if (!bands.length) return null;
  const q = quantityOf(bird, spell, style);
  if (q == null) return null;
  return bands.find((b) => b.upTo == null || q < b.upTo) ?? bands[bands.length - 1];
}

/**
 * A bird's band word, or null where the style has no bands to read — a style
 * whose composition does not name the families the labels' thresholds are
 * solved against (a check's hand-built style) reads no band and so no bias.
 * The gates' one reading of the ring's words (`swell.ts`, `glue.ts`).
 */
export function bandWordOf(bird: Bird, spell: Partial<Spell> | null | undefined, style: Style): string | null {
  try { return bandAt(bird, spell, style)?.word ?? null; } catch { return null; }
}

/**
 * **Where in its band a value stands** (round K15, Eugene: *"we have at best
 * 3–4 word variations per bird — could we fill in more text variants on bird
 * movement?"*): the lower third of the band's span in the quantity, the upper
 * third, or the middle. The word turns only at a threshold the composer has;
 * the line says which side of its band the value leans to.
 */
export function leanAt(bird: Bird, spell: Partial<Spell> | null | undefined, style: Style): 'low' | 'mid' | 'high' {
  const band = bandAt(bird, spell, style);
  const q = quantityOf(bird, spell, style);
  if (!band || q == null || band.from0 == null || band.to0 == null || !(band.to0 > band.from0)) return 'mid';
  const p = (q - band.from0) / (band.to0 - band.from0);
  return p < 1 / 3 ? 'low' : p > 2 / 3 ? 'high' : 'mid';
}
/** A band's line at a spell: its own, or its lean's. */
function bandLine(bird: Bird, spell: Partial<Spell> | null | undefined, style: Style, kind: 'short' | 'says', facts: ProgramFacts | null = null): string {
  const band = bandAt(bird, spell, style);
  if (!band) return '';
  // K30: a beat named with no drum in the theme is not what the music is
  const nd = LABEL_TABLE.birds[bird].noDrums;
  if (nd && facts && !facts.drums) return nd[kind];
  const lean = leanAt(bird, spell, style);
  return fillWith(lean !== 'mid' && band.lean ? band.lean[lean][kind] : band[kind], band, facts, kind);
}


// --- the dice, as words (moved here from ring.ts) -------------------------------

/**
 * **A timbre as a sentence says it** (round K15: *"The keys are a vibes"*): the
 * table's own phrase for the id — `vibes`, `an electric piano`, `a reed
 * organ` — and never an article guessed from the first letter. An id the table
 * lacks is said as its words alone; `tools/check.ts` holds that every id the
 * four keys lists can draw has a phrase.
 */
export function timbrePhrase(id: string | undefined): string {
  return (id && LABEL_TABLE.timbres[id]) || timbreWords(id);
}
/**
 * A timbre id's words: `reedOrgan` → `reed organ`, `fmPluck` → `fm pluck`; a plain id is itself.
 * An id named family first (`keysSuitcase`, `pianoFelt`) reads backwards split, and
 * `keys suitcase` was wider than the cell's room at 130 % (the v2.2 cut's words row,
 * seed 15576): the table's `cellWords` say those as a cell would.
 */
export function timbreWords(id: string | undefined): string {
  return (id && LABEL_TABLE.cellWords[id]) || (id || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}
export function maskBits(m: Mask): number[] {
  if (Array.isArray(m)) return m.slice(0, 16).map((v) => (v ? 1 : 0));
  if (typeof m === 'string') return m.slice(0, 16).split('').map((ch) => (ch === 'x' || ch === 'X' || ch === '1' ? 1 : 0));
  if (typeof m === 'number') { const o = []; for (let i = 0; i < 16; i++) o.push((m >> i) & 1); return o; }
  return new Array(16).fill(0);
}
export const maskCount = (m: Mask) => maskBits(m).reduce((a, b) => a + b, 0);
// What a sixteen-step figure sounds like, said in a word. The offbeat eighths
// are steps 2, 6, 10 and 14; anything on an even step is on the eighth grid.
export function hatCharacter(mask: Mask) {
  const b = maskBits(mask);
  const steps = [];
  for (let i = 0; i < 16; i++) if (b[i]) steps.push(i);
  if (!steps.length) return 'silent';
  if (steps.length <= 3) return 'sparse';
  if (steps.every((x) => x === 2 || x === 6 || x === 10 || x === 14)) return 'offbeat';
  if (steps.every((x) => x % 2 === 0)) return 'eighths';
  if (steps.length >= 10) return 'sixteenths';
  return 'broken';
}
// How the bass line moves: one note a bar is held, a few is walking, more is a pulse.
export function bassMotion(mask: Mask) {
  const n = maskCount(mask);
  if (n <= 1) return 'held';
  if (n <= 3) return 'walking';
  return 'pulsing';
}
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const dieLabel = (d: Die) => (d && typeof d === 'object' ? d.label ?? d.value : d) as string | number | null | undefined;
const keyWords = (key: string) => String(key).replace('minor', 'min').replace('dorian', 'dor').replace('mixolydian', 'mix').replace('lydian', 'lyd').replace('phrygian', 'phr');

// --- the readings -------------------------------------------------------------

/**
 * **The locked reading**: what each cell printed before round K13, one die of
 * the planned theme per bird. Under a strategy that reads no spell (the record)
 * it is still the whole cell; under one that does, it is the subtitle.
 */
export function lockedReading(bird: Bird, t: LabelTheme): CellValue {
  const d = t.dice || {};
  switch (bird) {
    case 'root': return { word: t.presetName || t.preset, sub: t.preset || '' };
    case 'gleam': return { word: keyWords(t.key), sub: d.progression || '' };
    case 'ember': return { word: String(t.bpm), sub: 'bpm' };
    // A timbre's id is a name in camel case (`reedOrgan`); the cell prints it as words.
    // K30: the keys that play, not the stab the dice rolled (the reviews of 09-26)
    // (the bird-labels round: with no keys, the voice that holds, which Zephyr's lists draw and brighten)
    case 'zephyr': { const k = keysOf(t); if (k) return { word: timbreWords(k), sub: 'keys' }; const h = heldOf(t); return h ? { word: timbreWords(h), sub: 'held' } : { word: 'no keys', sub: 'keys' }; }
    // Until the sound engine exposes the density and wetness dice, these two
    // fall through to the theme's length and how many sections it has.
    case 'loom': return d.density ? { word: dieLabel(d.density), sub: 'density' } : { word: String(t.bars), sub: 'bars' };
    case 'veil': return { word: d.fxPalette || '', sub: 'fx' };
    case 'tide': return d.wetness
      ? { word: dieLabel(d.wetness), sub: d.wetnessDb != null ? `${d.wetnessDb} db` : 'wet' }
      : { word: String(t.plan.length), sub: 'sections' };
    // one cell, two figures: what the hats do, and what the bass does
    case 'spark': return {
      word: hatsOf(t).character,
      sub: hatsOf(t).hits,
      // (the bird-labels round: the bass's moves only where a bass plays, read off the program as the hats are)
      sub2: factsOf(t)?.bass === false ? 'no bass' : `${bassMotion(d.bassMask)} · ${plural(maskCount(d.bassMask), 'move')}`,
    };
    default: return { word: '', sub: '' };
  }
}

/**
 * **What a cell prints.** Under a strategy that reads the spell, the big word
 * is the band of the quantity the bird biases (Ember's tempo and Zephyr's keys
 * are the plan's own reading of their bird), and the subtitle is the locked
 * reading with its role: `TIGHT · FX`, `C MIN · I-VI`, `7 SECTIONS`.
 */
export function cellReading(bird: Bird, t: LabelTheme, style: Style | null | undefined): CellValue {
  const locked = lockedReading(bird, t);
  if (!style || !labelsFor(style)) return locked;
  const general = generalCell(bird, t, style, locked);
  const o = overlayOf(bird, t, style);
  if (!o) return general;
  // the technique's own words (the bird-labels round): the big word its band, or the plan's word where the
  // technique names one (the tempo; a word of its record, the call's voice); the subtitle its locked reading where it
  // names one (its own where a fact it names is false: no hand)
  const words = { ...lockedWords(t), ...o.words };
  const band = techniqueBandAt(o, t.spell);
  const air = o.label.big.air;
  // (a big word of its own where a fact the block names is false: at WAVES, Gleam where the bloom is no shimmer)
  const own = lockedOf(o, 'word');
  const word = own != null ? own : o.label.big.plan === 'tempo' ? locked.word : air ? o.words.air || timbreWords(o.words[air.voice]) : o.label.big.word ? o.words[o.label.big.word] : band.word;
  const sub = lockedOf(o, 'sub');
  const out: CellValue = { word, sub: sub != null ? fill(sub, words) : general.sub };
  if (sub == null && general.sub2 != null) out.sub2 = general.sub2;
  return out;
}

/** The cell a style's general words print (round K13): the band of the quantity the bird biases, and the locked reading under it. */
function generalCell(bird: Bird, t: LabelTheme, style: Style, locked: CellValue): CellValue {
  const band = bandAt(bird, t.spell, style);
  const w = String(locked.word ?? '');
  switch (bird) {
    // Ember's word is the tempo that plays (the theme's own, inside the window
    // round the curve's centre since GA5): the ring's rule that a reading is
    // what plays, which the beat's flash and the fills are held to.
    case 'ember': return locked;
    // the air of the voice in front, and the voice under it with its role: CLEAR · PIANO · KEYS, AIRY · SHIMMER PAD · HELD
    // (a voice the table has not measured keeps its name as the word)
    case 'zephyr': { const a = frontAir(t); return a ? { word: a.band.word, sub: `${timbreWords(a.id)} · ${a.role}` } : locked; }
    case 'spark': {
      // K30: with no drum in the theme the word is no beat, not a band of one
      const f = factsOf(t);
      const word = f && !f.drums && LABEL_TABLE.birds.spark.noDrums ? LABEL_TABLE.birds.spark.noDrums.word : band!.word;
      return { word, sub: `${w} · ${locked.sub}`, sub2: locked.sub2 };
    }
    case 'gleam': return { word: band!.word, sub: locked.sub ? `${w} · ${locked.sub}` : w };
    case 'root': return { word: band!.word, sub: `${w} · room` };
    case 'tide': return { word: band!.word, sub: `${w} ${locked.sub}` };
    default: return { word: band!.word, sub: `${w} · ${locked.sub}` };
  }
}

/** Ember's family, as the key its words are kept under. */
function familyKey(spell: Partial<Spell> | null | undefined): string {
  const d = derive(asSpell(spell));
  return !d.drumsOn ? 'noDrums' : d.tempoFamily;
}

const fill = (t: string, words: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => words[k] ?? '');

/** The locked reading's words, for the sentence. */
function lockedWords(t: LabelTheme): Record<string, string> {
  const d = t.dice || {};
  const ch = String(d.progression || '').split('-').filter(Boolean);
  return {
    bpm: String(t.bpm),
    keys: keysOf(t) ? timbrePhrase(keysOf(t)!) : 'silent',
    key: String(t.key).toLowerCase(),
    chords: ch.length ? ` over ${ch.join(' and ')}` : '',
    room: String(t.presetName || t.preset || '').toLowerCase(),
    density: String(dieLabel(d.density) ?? '').toLowerCase(),
    sections: plural(t.plan.length, 'section'),
    fx: String(d.fxPalette || '').toLowerCase(),
    hats: hatsOf(t).character,
    hits: hatsOf(t).hits.replace(' · ', ', '),
    bass: factsOf(t)?.bass === false ? 'silent' : bassMotion(d.bassMask),
    held: heldOf(t) ? timbrePhrase(heldOf(t)!) : 'silent',
    ...frontWords(t),
  };
}
/** The front voice's words for Zephyr's lines: its phrase, its role as the sentence says it, its air. */
function frontWords(t: LabelTheme): Record<string, string> {
  const f = frontOf(t);
  if (!f) return { front: 'nothing', on: '', air: '' };
  const voice = timbrePhrase(f.id);
  return { front: voice, on: fill(LABEL_TABLE.birds.zephyr.air?.on[f.role] ?? '', { voice }), air: airOf(f.id, f.role, settingOf(playOf(t), f.id, f.role))?.band.word ?? '' };
}

/**
 * **What the music is at this value, in one plain sentence** (Eugene, on K13:
 * *"when dragging, the user should see human language explaining the CURRENT
 * value instead of computing it in their heads"*): the band's own sentence —
 * or Ember's family and tempo, or Zephyr's keys — and the locked reading after
 * it, present tense, no pole words. The explanation along the track, the phone
 * panel's line and the screen reader say this and nothing else; it reads the
 * spell on the theme it is handed, so a hand's provisional value reads its own.
 */
export function sentenceOf(bird: Bird, t: LabelTheme, style: Style | null | undefined): string {
  const row = LABEL_TABLE.birds[bird];
  const o = style && labelsFor(style) ? overlayOf(bird, t, style) : null;
  if (o) {
    const words = { ...lockedWords(t), ...o.words };
    const first = cap(fill(techniqueLine(o, t.spell, 'says'), words));
    const own = lockedOf(o, 'lockedSays');
    const lockedSays = own !== undefined ? own : row.lockedSays;
    const locked = lockedSays ? fill(lockedSays, words) : '';
    return locked ? `${first.replace(/\.$/, '')}; ${locked}.` : first;
  }
  const words = lockedWords(t);
  let first = '';
  const air = bird === 'zephyr' ? frontAir(t) : null;
  if (air) first = fill(airLine(air, 'says'), words);
  else if (typeof row.says === 'string') first = fill(row.says, words);
  else if (row.says) first = fill(row.says[familyKey(t.spell)] ?? '', words);
  else if (style && labelsFor(style)) first = fill(bandLine(bird, t.spell, style, 'says', factsOf(t)), words);
  const locked = row.lockedSays ? fill(row.lockedSays, words) : '';
  if (!first) return locked ? locked[0].toUpperCase() + locked.slice(1) + '.' : '';
  return locked ? `${first.replace(/\.$/, '')}; ${locked}.` : first;
}

/**
 * **The same, in five words at most** (Eugene, 09-24, on the sentence in the
 * phone panel: *"the sentence form is probably not the best UX … for the UI we
 * need more compact factual explanations that fit in 4-5 words"*): the band's
 * fact alone — never the locked reading, which is the subtitle's, and never a
 * genre. The line along the track and the phone panel's line show this; the
 * screen reader keeps the sentence (`sentenceOf`), and so will an info tip.
 */
export function shortOf(bird: Bird, t: LabelTheme, style: Style | null | undefined): string {
  const row = LABEL_TABLE.birds[bird];
  const o = style && labelsFor(style) ? overlayOf(bird, t, style) : null;
  if (o) return cap(fill(techniqueLine(o, t.spell, 'short'), { ...lockedWords(t), ...o.words }));
  const words = lockedWords(t);
  let line = '';
  const air = bird === 'zephyr' ? frontAir(t) : null;
  if (air) line = fill(airLine(air, 'short'), words);
  else if (typeof row.short === 'string') line = fill(row.short, words);
  else if (row.short) line = fill(row.short[familyKey(t.spell)] ?? '', words);
  else if (style && labelsFor(style)) line = fill(bandLine(bird, t.spell, style, 'short', factsOf(t)), words);
  return line ? line[0].toUpperCase() + line.slice(1) : '';
}

/** Every short line the table can say, for the check. */
export function allShorts(): Array<{ bird: Bird; where: string; short: string }> {
  const out: Array<{ bird: Bird; where: string; short: string }> = [];
  for (const bird of BIRDS) {
    const row = LABEL_TABLE.birds[bird];
    if (typeof row.short === 'string') out.push({ bird, where: 'the bird', short: row.short });
    else if (row.short) for (const [k, v] of Object.entries(row.short)) out.push({ bird, where: k, short: v });
    for (const b of row.bands || []) {
      const band = { with: b.with ?? [], joiner: b.joiner ?? ', with ' };
      const lines: Array<[string, string]> = [[b.word, b.short ?? '']];
      if (b.lean) for (const k of ['low', 'high'] as const) lines.push([`${b.word} leaning ${k}`, b.lean[k].short]);
      for (const [where, text] of lines) for (const [name, f] of allFacts(band.with)) out.push({ bird, where: `${where}${name}`, short: fillWith(text, band, f, 'short') });
    }
    if (row.noDrums) out.push({ bird, where: 'no drums', short: row.noDrums.short });
    for (const b of row.air?.bands ?? []) {
      out.push({ bird, where: `the air ${b.word}`, short: b.short });
      if (b.lean) for (const k of ['low', 'high'] as const) out.push({ bird, where: `the air ${b.word} leaning ${k}`, short: b.lean[k].short });
    }
  }
  for (const x of techniqueLines()) if (x.short) out.push({ bird: x.bird, where: x.where, short: x.short });
  return out;
}

/** Every sentence the table can say, for the check: each band's, each family's and each bird's own. */
export function allSentences(): Array<{ bird: Bird; where: string; says: string }> {
  const out: Array<{ bird: Bird; where: string; says: string }> = [];
  for (const bird of BIRDS) {
    const row = LABEL_TABLE.birds[bird];
    if (typeof row.says === 'string') out.push({ bird, where: 'the bird', says: row.says });
    else if (row.says) for (const [k, v] of Object.entries(row.says)) out.push({ bird, where: k, says: v });
    for (const b of row.bands || []) {
      // every form the line can take: no part, each part alone, and all of them (K30)
      const band = { with: b.with ?? [], joiner: b.joiner ?? ', with ' };
      const forms = allFacts(band.with);
      const lines: Array<[string, string]> = [[b.word, b.says ?? '']];
      if (b.lean) for (const k of ['low', 'high'] as const) lines.push([`${b.word} leaning ${k}`, b.lean[k].says]);
      for (const [where, text] of lines) for (const [name, f] of forms) out.push({ bird, where: `${where}${name}`, says: fillWith(text, band, f, 'says') });
    }
    if (row.noDrums) out.push({ bird, where: 'no drums', says: row.noDrums.says });
    // the air's sentences with each role's words (the front voice said as one)
    for (const b of row.air?.bands ?? []) for (const [role, on] of Object.entries(row.air!.on)) {
      const words = { on: fill(on, { voice: 'a saw pad' }) };
      out.push({ bird, where: `the air ${b.word}, ${role}`, says: fill(b.says, words) });
      if (b.lean) for (const k of ['low', 'high'] as const) out.push({ bird, where: `the air ${b.word} leaning ${k}, ${role}`, says: fill(b.lean[k].says, words) });
    }
    if (row.lockedSays) out.push({ bird, where: 'locked', says: row.lockedSays });
  }
  for (const x of techniqueLines()) out.push({ bird: x.bird, where: x.where, says: x.says });
  return out;
}

/** The words no sentence may carry: a pole or a comparison is not a reading. */
// (and since K19 "bird", which is the code's word and not a listener's: *"drop 'bird' from the tooltip text"*)
export const BANNED_WORDS: readonly string[] = Object.freeze(['more', 'less', 'out', 'in', 'shorter', 'longer', 'how', 'bird', 'birds']);


// --- a technique's own words (the bird-labels round, 10-18) ------------------------------------------------------

/**
 * **Where a technique owns the foreground, its controls say its quantities** (Eugene, 10-18, after hearing the bells:
 * *"we likely need to update strings in the UI to actually refer to bells … to have label more specific to the
 * immediate role of the position and not abstract across all tracks which in case of Bass now missing the point"*).
 * A technique's recipe row carries a `labels` block in this table's own shape, per control: the quantity its band
 * reads (`big.reads`, one of the technique's own readings), the plan's word where the big word is one (`big.plan`: the
 * tempo; `big.word`: a word of the technique's record, the call's voice), the bands and their sentences, the leans, and
 * the locked subtitle. A cell reads it only where the theme's program carries the technique (the dice's record of it,
 * the way `programFactsOf` states parts), never from the spell's address: a library turn at the technique's place plays
 * none of it and reads the general words. A band's cut is solved from the technique's own arithmetic (its readings
 * about its frame's centre, the bird moved), never typed: `mid` is halfway, in the reading, from the place's own value
 * to the bird's wall (`low` its low wall, `high` its high one: nought and one, or a zone's band edges); `at` is where the
 * reading reaches a number of the row (`pulse.from`); `turns` is where a reading first leaves its value at the bird's
 * low wall (the memory of the answers, the recall). A lean's `highFrom` is a cut of the same kinds where the band's
 * high lean starts, in place of its upper third (Veil's busy band: where the count stops at its ceiling and only the
 * voices change); its `lowTo` a cut where the low lean ends, in place of its lower third (Spark's still band: the low
 * lean held over the whole still end, where the planner plays one program, to where `still` turns). A line, a lean or
 * the block names in `without` what it says where a fact of the program is false
 * (Spark's hand where it never strikes). The gates' reading of the ring's words (`bandWordOf`) stays the general table's.
 */
type TechniqueBound = { mid: 'low' | 'high'; of: string } | { at: string; of: string } | { turns: string } | null;
type FactKey = keyof ProgramFacts;
/** A line, and what it says where a fact of the program is false. */
interface TechniqueLine extends LeanRow { without?: Partial<Record<FactKey, LeanRow>> }
interface TechniqueBandRow extends TechniqueLine { word: string; upTo: TechniqueBound; lean?: { low: TechniqueLine; high: TechniqueLine; highFrom?: TechniqueBound; lowTo?: TechniqueBound } }
export interface TechniqueLabel {
  /** the reading the bands cut (and the leans read); the tempo, or a word of the technique's record, where the big word is the plan's */
  big: { reads: string; plan?: 'tempo'; word?: string; air?: { voice: string; role: AirRole } };
  /**
   * the voice of the record whose measured air the lines and the subtitle say (`{air}`) where the big word is not the
   * air: at the sea Zephyr biases the spray, and the bloom's air is the locked reading (ambient-waves-4)
   */
  air?: { voice: string; role: AirRole };
  /** `false`: only while the drums are off (with a kit, the beat is the bird's foreground) */
  drums?: boolean;
  bands: TechniqueBandRow[];
  /** the locked subtitle, filled from the record's and the theme's words (absent: the general subtitle) */
  sub?: string;
  /** the locked reading after the sentence (absent: the general one; empty: none) */
  lockedSays?: string;
  /** the subtitle and the locked reading where a fact of the program is false */
  without?: Partial<Record<FactKey, { sub?: string; lockedSays?: string; word?: string }>>;
}
/** A technique's band, solved: its cut in the bird's own value, and its span in the reading for the leans. */
export interface TechniqueBand {
  word: string; says: string; short: string;
  /** the bird's value the band holds up to (exclusive), or null for the last */
  upTo: number | null;
  from: string;
  /** the reading at the band's lower and upper edges (the bird's walls at the two ends) */
  from0: number; to0: number;
  lean: { low: TechniqueLine; high: TechniqueLine } | null;
  /**
   * where the row names its high lean's own cut (`highFrom`): the bird's value it starts at, or null where the band never
   * reaches it (no high lean); `highOwn` false, the upper third of its span
   */
  highAt: number | null;
  highOwn: boolean;
  /** where the row names its low lean's own end (`lowTo`): the bird's value it ends at, or null where it has none */
  lowAt: number | null;
  lowOwn: boolean;
  without: Partial<Record<FactKey, LeanRow>>;
}
interface Technique {
  /** the dice's field the program records the technique in: its row, then its voices, ` · ` between */
  field: string;
  /** what the place and the people say of the technique, for the check and the note */
  name: string;
  labelsOf(row: string): Partial<Record<Bird, TechniqueLabel>> | null;
  rows(): string[];
  /** the leans' frame: the centre (the place's own birds, as the composer reads them) and a zone's bands */
  frameOf(row: string, style: Style): ConversationFrame | null;
  /** the technique's own readings at a spell: its one arithmetic, the planner's */
  readings(row: string, spell: Spell, style: Style): Record<string, number> | null;
  /** a number of the row, by its dotted path */
  rowNumber(row: string, path: string): number | undefined;
  /** the record's words a line may say: who plays which role, a voice the program never strikes said silent */
  words(record: string, facts: ProgramFacts | null): Record<string, string>;
}

const numberAt = (o: unknown, path: string): number | undefined => {
  let x: unknown = o;
  for (const k of path.split('.')) x = x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined;
  return typeof x === 'number' ? x : undefined;
};
type CentreEntry = { id?: string; place: { birds: Partial<Spell> }; centre?: Partial<Spell>; conversation?: { row: string } };
/**
 * **The zone that holds a conversation entry as its own** (`Zone.rows.conversation` in places.ts), as the leans' frame
 * reads it: its centre and its address birds' bands, each band's two ends as the planner reads them (`zoneBands`). None
 * on a style with no zones, so the frame is the entry's alone.
 */
function zoneOfEntry(style: Style, e: CentreEntry): ConversationZone | null {
  const zones = (style as Style & { places?: StylePlaces }).places?.zones;
  const z = e.id ? zones?.find((x) => x.rows.conversation === e.id) : undefined;
  return z ? { centre: z.centre, bands: zoneBands(z) } : null;
}
/**
 * **The struck conversation** (`src/slow-conversation.ts`, `recipes/ambient/conversation.json`): its record is the
 * dice's `conversation` (`row · ground · caller · answerer · hand`), its readings `conversationLeans`, the planner's own,
 * in the frame the planner leans it in (`conversationFrame`: the entry's `centre`, else its zone's, else its place;
 * inside a zone the zone's bands).
 */
const CONVERSATION: Technique = {
  field: 'conversation',
  name: 'the struck conversation',
  labelsOf: (row) => ((conversationRowOf(row) as unknown as { labels?: Partial<Record<Bird, TechniqueLabel>> } | null)?.labels ?? null),
  rows: () => ['bells-in-conversation'].filter((r) => !!conversationRowOf(r)),
  frameOf(row, style) {
    const table = (style as Style & { places?: { conversation?: readonly CentreEntry[] } }).places?.conversation;
    const e = table?.find((x) => x.conversation?.row === row);
    return e ? conversationFrame(e, zoneOfEntry(style, e)) : null;
  },
  readings(row, spell, style) {
    const R = conversationRowOf(row), f = CONVERSATION.frameOf(row, style);
    if (!R || !f) return null;
    const L = conversationLeansIn(R, spell, f);
    // the bells' size as the share of casts handed to a pole's voice: -1 every cast the small bells', +1 the great bell's
    return { pole: Math.sign(L.size) * L.reach, size: L.size, count: L.count, handover: L.handover, lively: L.lively, still: L.still, leave: L.leave, hard: L.hard,
      pulse: L.pulse, memory: L.memory, recall: L.recall ? 1 : 0, rests: L.factor('rest'), tail: L.tail, width: L.width };
  },
  rowNumber: (row, path) => numberAt(conversationRowOf(row), path),
  words(record, facts) {
    const [, ground, caller, answerer, hand] = record.split(' · ');
    // the record names the hand the cast drew; at Spark's still end it may never strike (facts.hand)
    const handOn = !!hand && hand !== 'no hand' && facts?.hand !== false;
    return {
      ground: timbrePhrase(ground), caller: timbrePhrase(caller), answerer: timbrePhrase(answerer), hand: handOn ? timbrePhrase(hand) : 'silent',
      groundWord: timbreWords(ground), callerWord: timbreWords(caller), answererWord: timbreWords(answerer), handWord: handOn ? timbreWords(hand) : 'none',
      callerVoice: caller,
    };
  },
};
/**
 * **The sea** (`src/surf.ts`, `recipes/ambient/surf.json`; ambient-waves-3, his rule `labels-name-the-local-role`):
 * its record is the dice's `sea` (`row · period · bloom · bell · bass`), its readings the planner's own leans about
 * the place's birds (`leanFactor`/`leanShift` on the row's `birds`), and Gleam's the one knob it moves there (the
 * shimmer's climb, the style's seasoning of `shift`). Its frame is the place's birds, and on each bird the walls are
 * where the sea still plays along it from the tile (the admission's own tables at the place's tempo: WAVES the ambient
 * voices' nearest with this row, no conversation and no journey nearer in theirs, and no drums), so a cut halfway to a
 * wall is inside what a listener can reach and hear.
 */
type SeaEntry = { id?: string; place: { birds: Partial<Spell>; tempo: readonly [number, number] }; weather?: { row: string } };
const SEA_FRAMES = new WeakMap<object, Map<string, ConversationFrame | null>>();
const seaPlaces = (style: Style) => ((style as Style & { places?: StylePlaces }).places ?? {}) as StylePlaces;
function seaFrameOf(row: string, style: Style): ConversationFrame | null {
  let cache = SEA_FRAMES.get(style as object);
  if (!cache) { cache = new Map(); SEA_FRAMES.set(style as object, cache); }
  if (cache.has(row)) return cache.get(row)!;
  const P = seaPlaces(style);
  const e = (P.ambientVoices as readonly SeaEntry[] | undefined)?.find((x) => x.weather?.row === row);
  let out: ConversationFrame | null = null;
  if (e) {
    const centre = Object.fromEntries(BIRDS.map((b) => [b, e.place.birds[b] ?? HOUSE[b]])) as Record<string, number>;
    const bpm = (e.place.tempo[0] + e.place.tempo[1]) / 2;
    const plays = (sp: Spell) => (nearestEntry(P.ambientVoices as readonly SeaEntry[] as never, sp, bpm) as SeaEntry | null)?.weather?.row === row
      && !nearestEntry(P.conversation, sp, bpm)?.conversation && !nearestEntry(P.journey, sp, bpm)?.journey && !derive(sp).drumsOn;
    const bands: Record<string, readonly [number, number]> = {};
    for (const b of BIRDS) {
      const at = (v: number) => plays(asSpell({ ...centre, [b]: v }));
      let lo = centre[b], hi = centre[b];
      while (lo - 0.01 >= -1e-9 && at(+(lo - 0.01).toFixed(2))) lo = +(lo - 0.01).toFixed(2);
      while (hi + 0.01 <= 1 + 1e-9 && at(+(hi + 0.01).toFixed(2))) hi = +(hi + 0.01).toFixed(2);
      bands[b] = [lo, hi];
    }
    out = { centre, bands };
  }
  cache.set(row, out);
  return out;
}
const SEA: Technique = {
  field: 'sea',
  name: 'the sea',
  labelsOf: (row) => ((surfRowOf(row) as unknown as { labels?: Partial<Record<Bird, TechniqueLabel>> } | null)?.labels ?? null),
  rows: () => ['waves-surf'].filter((r) => !!surfRowOf(r)),
  frameOf: (row, style) => seaFrameOf(row, style),
  readings(row, spell, style) {
    const R = surfRowOf(row) as SurfRow | null, f = seaFrameOf(row, style);
    if (!R || !f) return null;
    const L: BirdLeans = { centre: f.centre, by: R.birds.by, ...(R.birds.most ? { most: R.birds.most } : {}) };
    const factor = (k: string) => leanFactor(L, k, spell), shift = (k: string) => leanShift(L, k, spell);
    // Gleam's one reach at the sea: the shimmer's climb, as the style seasons it (a shimmer's share of its loop pitched up)
    const shiftKnob = VOICE_KNOBS.shimmerPad?.shift;
    const shine = shiftKnob ? (knobsFor(spell, { shimmerPad: { shift: shiftKnob } }).shimmerPad?.shift ?? shiftKnob.default) : 0;
    return { size: factor('size'), seaDb: shift('seaDb'), period: factor('period'), spread: Math.min(R.state.main.spreadMost, R.state.main.spread * factor('spread')),
      chop: Math.min(R.state.chop.ampMost, R.state.chop.amp * factor('chop')), cross: Math.min(1, R.state.cross.share * factor('cross')),
      spray: shift('surfDb'), sprayBright: factor('surfBright'), undertow: shift('undertowDb'), shine };
  },
  rowNumber: (row, path) => numberAt(surfRowOf(row), path),
  words(record) {
    const [, period, bloom, bell, bass] = record.split(' · ');
    const secs = String(period ?? '').replace(/\s*s$/, '');
    return {
      period: String(period ?? ''), periodSays: `${secs} seconds`,
      bloom: timbrePhrase(bloom), bloomWord: timbreWords(bloom), bloomVoice: bloom ?? '',
      bell: bell && bell !== 'no bell' ? timbrePhrase(bell) : 'silent', bellWord: bell && bell !== 'no bell' ? timbreWords(bell) : 'no bell',
      bass: timbrePhrase(bass),
    };
  },
};
const TECHNIQUES: readonly Technique[] = Object.freeze([CONVERSATION, SEA]);

/** The technique a theme's program carries, read off its record, with labels of its own; none where it carries none. */
export function techniqueOf(t: Pick<LabelTheme, 'dice'>): { tech: Technique; row: string; record: string } | null {
  const d = t.dice || {};
  for (const tech of TECHNIQUES) {
    const rec = d[tech.field];
    if (typeof rec !== 'string' || !rec) continue;
    const row = rec.split(' · ')[0];
    if (tech.labelsOf(row)) return { tech, row, record: rec };
  }
  return null;
}

/** A bird's two walls in a technique's frame: a zone's band on it, else nought and one. */
const wallsOf = (frame: ConversationFrame, bird: Bird): readonly [number, number] => frame.bands?.[bird] ?? [0, 1];

const TECH_SOLVED = new WeakMap<object, Map<string, TechniqueBand[] | null>>();
/** A technique row's bands for a bird, solved against a style once, or null where it has none or cannot solve them. */
export function techniqueBandsOf(tech: Technique, row: string, bird: Bird, style: Style): TechniqueBand[] | null {
  let cache = TECH_SOLVED.get(style as object);
  if (!cache) { cache = new Map(); TECH_SOLVED.set(style as object, cache); }
  const key = `${tech.field}:${row}:${bird}`;
  if (cache.has(key)) return cache.get(key)!;
  const label = tech.labelsOf(row)?.[bird];
  const frame = tech.frameOf(row, style);
  let out: TechniqueBand[] | null = null;
  if (label && frame) {
    const centre = frame.centre as Spell;
    const read = (k: string, v: number) => tech.readings(row, { ...centre, [bird]: v } as Spell, style)?.[k] ?? NaN;
    const c = centre[bird], [w0, w1] = wallsOf(frame, bird);
    const first = (lo: number, hi: number, holds: (v: number) => boolean): number | null => {
      for (let i = 0; i <= 1000; i++) { const v = lo + ((hi - lo) * i) / 1000; if (holds(v)) return +v.toFixed(4); }
      return null;
    };
    const solve = (b: TechniqueBound): { at: number | null; from: string } | null => {
      if (!b) return { at: null, from: '' };
      if ('mid' in b) {
        const end = b.mid === 'low' ? w0 : w1, xe = read(b.of, end), xc = read(b.of, c), target = (xe + xc) / 2;
        const [lo, hi, a, z] = b.mid === 'low' ? [w0, c, xe, xc] : [c, w1, xc, xe];
        if (!(Math.abs(z - a) > 1e-9)) return null;
        const at = first(lo, hi, (v) => (z > a ? read(b.of, v) >= target : read(b.of, v) <= target));
        return at == null ? null : { at, from: `${b.of} halfway from the place's own ${+xc.toFixed(3)} to ${+xe.toFixed(3)} at ${end}` };
      }
      if ('at' in b) {
        const x = tech.rowNumber(row, b.at);
        if (x == null) return null;
        // (a reading held at the row's number, as the count at its ceiling, reaches it within a rounding)
        const up = read(b.of, w1) > read(b.of, w0);
        const at = first(w0, w1, (v) => (up ? read(b.of, v) >= x - 1e-9 : read(b.of, v) <= x + 1e-9));
        return at == null ? null : { at, from: `${b.of} reaches ${b.at} (${x})` };
      }
      const x0 = read(b.turns, w0);
      const at = first(w0, w1, (v) => read(b.turns, v) !== x0);
      return at == null ? null : { at, from: `${b.turns} leaves its ${x0} at ${w0}` };
    };
    const cuts = label.bands.map((x) => solve(x.upTo));
    if (cuts.every((x) => x != null) && cuts.slice(0, -1).every((x, k) => x!.at != null && (k === 0 || x!.at! > cuts[k - 1]!.at!))) {
      out = label.bands.map((x, k) => {
        const lo = k > 0 ? cuts[k - 1]!.at! : w0, hi = cuts[k]!.at ?? w1;
        // a high lean cut of its own counts inside the band (its top wall too: inside a zone the count reaches its
        // ceiling at the band's edge); never reached there, the band has no high lean
        const hf = x.lean?.highFrom ? solve(x.lean.highFrom) : null;
        const highAt = hf && hf.at != null && hf.at > lo && (hf.at < hi || (cuts[k]!.at == null && hf.at <= hi)) ? hf.at : null;
        // a low lean's own end counts inside the band; past the band's top it holds the whole band
        const lt = x.lean?.lowTo ? solve(x.lean.lowTo) : null;
        const lowAt = lt && lt.at != null && lt.at > lo ? Math.min(lt.at, hi) : null;
        return { word: x.word, says: x.says, short: x.short, upTo: cuts[k]!.at, from: cuts[k]!.from + (highAt != null ? `; its high lean from ${highAt} (${hf!.from})` : '') + (lowAt != null ? `; its low lean to ${lowAt} (${lt!.from})` : ''),
          from0: read(label.big.reads, lo), to0: read(label.big.reads, hi), lean: x.lean ? { low: x.lean.low, high: x.lean.high } : null, highAt, highOwn: !!x.lean?.highFrom, lowAt, lowOwn: !!x.lean?.lowTo, without: x.without ?? {} };
      });
    }
  }
  cache.set(key, out);
  return out;
}

interface Overlay { tech: Technique; row: string; record: string; label: TechniqueLabel; bands: TechniqueBand[]; bird: Bird; style: Style; words: Record<string, string>; facts: ProgramFacts | null }
/** A cell's technique words, where the theme's program carries a technique that labels this control; else null. */
function overlayOf(bird: Bird, t: LabelTheme, style: Style): Overlay | null {
  const at = techniqueOf(t);
  if (!at) return null;
  const label = at.tech.labelsOf(at.row)?.[bird];
  if (!label) return null;
  if (label.drums === false && derive(asSpell(t.spell)).drumsOn) return null;
  const bands = techniqueBandsOf(at.tech, at.row, bird, style);
  if (!bands) return null;
  const facts = factsOf(t);
  const words = at.tech.words(at.record, facts);
  // the air of the voice the block names (the conversation's caller), as Zephyr's general cell reads the front voice's
  // ...as the program plays it (the calls' strike, bird-labels round 3)
  const airAt = label.big.air ?? label.air;
  if (airAt) { const v = words[airAt.voice]; words.air = airOf(v, airAt.role, settingOf(playOf(t), v, airAt.role))?.band.word ?? ''; }
  return { ...at, label, bands, bird, style, words, facts };
}
/** The facts the program carries that are false, among the ones a line names in `without`. */
const falseOf = (without: Partial<Record<FactKey, unknown>> | undefined, facts: ProgramFacts | null): FactKey | null => {
  if (!without || !facts) return null;
  for (const k of Object.keys(without) as FactKey[]) if (facts[k] === false) return k;
  return null;
};
/** A line, or what it says where a fact it names is false. */
const lineOf = (x: TechniqueLine, facts: ProgramFacts | null, kind: 'says' | 'short'): string => {
  const k = falseOf(x.without, facts);
  return k ? x.without![k]![kind] : x[kind];
};
/** The locked subtitle and the locked reading under a technique, where a fact it names is false its own. */
function lockedOf(o: Overlay, kind: 'sub' | 'lockedSays' | 'word'): string | undefined {
  const k = falseOf(o.label.without, o.facts);
  const alt = k ? o.label.without![k]![kind] : undefined;
  return alt !== undefined ? alt : kind === 'word' ? undefined : o.label[kind];
}
/** The band a spell puts a control in, under its technique. */
function techniqueBandAt(o: Overlay, spell: Partial<Spell> | null | undefined): TechniqueBand {
  const v = asSpell(spell)[o.bird];
  return o.bands.find((b) => b.upTo == null || v < b.upTo) ?? o.bands[o.bands.length - 1];
}
/** A technique band's line at a spell: its own, or its lean's (the lower and upper thirds of its span in the reading, or its own high cut). */
function techniqueLine(o: Overlay, spell: Partial<Spell> | null | undefined, kind: 'says' | 'short'): string {
  const band = techniqueBandAt(o, spell);
  const own = lineOf({ says: band.says, short: band.short, without: band.without }, o.facts, kind);
  if (!band.lean) return own;
  const v = asSpell(spell)[o.bird];
  if (band.highOwn && band.highAt != null && v >= band.highAt) return lineOf(band.lean.high, o.facts, kind);
  // (to and with its end: the end is the last value the reading still holds, to the solver's step)
  if (band.lowOwn && band.lowAt != null && v <= band.lowAt) return lineOf(band.lean.low, o.facts, kind);
  const c = o.tech.frameOf(o.row, o.style)!.centre as Spell;
  const r = o.tech.readings(o.row, { ...c, [o.bird]: v } as Spell, o.style)?.[o.label.big.reads];
  const span = band.to0 - band.from0;
  if (r == null || !(Math.abs(span) > 1e-9)) return own;
  const p = (r - band.from0) / span;
  return p < 1 / 3 && !band.lowOwn ? lineOf(band.lean.low, o.facts, kind) : p > 2 / 3 && !band.highOwn ? lineOf(band.lean.high, o.facts, kind) : own;
}
const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);

/** Every line a technique's labels can say, for the checks: each band's, each lean's, and each one's `without`. */
export function techniqueLines(): Array<{ bird: Bird; where: string; says: string; short: string }> {
  const out: Array<{ bird: Bird; where: string; says: string; short: string }> = [];
  const push = (bird: Bird, where: string, x: TechniqueLine) => {
    out.push({ bird, where, says: x.says, short: x.short });
    for (const [k, w] of Object.entries(x.without ?? {})) if (w) out.push({ bird, where: `${where} without ${k}`, says: w.says, short: w.short });
  };
  for (const tech of TECHNIQUES) for (const row of tech.rows()) for (const [bird, label] of Object.entries(tech.labelsOf(row) ?? {}) as Array<[Bird, TechniqueLabel]>) {
    if (!(BIRDS as readonly string[]).includes(bird) || !Array.isArray(label?.bands)) continue;   // the block's own note
    for (const b of label.bands) {
      push(bird, `${row} ${b.word}`, b);
      if (b.lean) for (const k of ['low', 'high'] as const) push(bird, `${row} ${b.word} leaning ${k}`, b.lean[k]);
    }
    if (label.lockedSays) out.push({ bird, where: `${row} locked`, says: label.lockedSays, short: '' });
    for (const [k, w] of Object.entries(label.without ?? {})) if (w?.lockedSays) out.push({ bird, where: `${row} locked without ${k}`, says: w.lockedSays, short: '' });
  }
  return out;
}
/** The techniques with labels, for the check and the memo. */
export const TECHNIQUE_LIST: readonly Technique[] = TECHNIQUES;
