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
import { BIRDS, HOUSE, HOUSE_OUTER, asSpell, derive, musicalControls } from './spell.ts';
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
  hands: boolean; rolling: boolean; breaks: boolean;
  pulse: boolean; receding: boolean;
  pedal: boolean; longPedal: boolean; arches: boolean;
  droneFront: boolean; droneBack: boolean; ornament: boolean;
}
const factsCache = new WeakMap<object, ProgramFacts>();
export function programFactsOf(
  events: ArrayLike<{ voice: string; layer: string }> | null | undefined,
  dice: { composition?: string } | null | undefined,
): ProgramFacts | null {
  if (!events) return null;
  const hit = factsCache.get(events as object);
  if (hit) return hit;
  let drums = false;
  for (let i = 0; i < events.length && !drums; i++) { const l = events[i].layer; if (l === 'kick' || l === 'hats' || l === 'clap') drums = true; }
  let trace: { selected?: Record<string, string>; scene?: string; context?: { kit?: string } } | null = null;
  try { trace = dice && typeof dice.composition === 'string' ? JSON.parse(dice.composition) : null; } catch (e) { trace = null; }
  const sel = (trace && trace.selected) || {};
  const out: ProgramFacts = {
    drums,
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
/** The keys a theme plays: the readout's, its program's, or the roll where there is no program. */
function keysOf(t: LabelTheme): string | null {
  const d = t.dice || {};
  if (t.keys !== undefined) return t.keys;
  const k = keysOfProgram(t.events, d.keysPreset);
  return k === undefined ? d.keysPreset ?? null : k;
}

/** The facts a band's parts can be under, for the checks: none of them, each alone, and all. */
function allFacts(items: WithItem[]): Array<[string, ProgramFacts]> {
  const none = { drums: true, hands: false, rolling: false, breaks: false, pulse: false, receding: false, pedal: false, longPedal: false, arches: false, droneFront: false, droneBack: false, ornament: false };
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
}
export const LABEL_TABLE = LABELS as unknown as { kind: string; schema: number; birds: Record<Bird, BirdRow>; timbres: Record<string, string> };

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
/** A timbre id's words: `reedOrgan` → `reed organ`, `fmPluck` → `fm pluck`; a plain id is itself. */
export function timbreWords(id: string | undefined): string {
  return (id || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
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
const keyWords = (key: string) => String(key).replace('minor', 'min').replace('dorian', 'dor');

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
    case 'zephyr': { const k = keysOf(t); return { word: k ? timbreWords(k) : 'no keys', sub: 'keys' }; }
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
      sub2: `${bassMotion(d.bassMask)} · ${plural(maskCount(d.bassMask), 'move')}`,
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
  const band = bandAt(bird, t.spell, style);
  const w = String(locked.word ?? '');
  switch (bird) {
    case 'ember':
    case 'zephyr': return locked;
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
    bass: bassMotion(d.bassMask),
  };
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
  const words = lockedWords(t);
  let first = '';
  if (typeof row.says === 'string') first = fill(row.says, words);
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
  const words = lockedWords(t);
  let line = '';
  if (typeof row.short === 'string') line = fill(row.short, words);
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
  }
  // Zephyr's short line is its keys' phrase
  for (const [id, v] of Object.entries(LABEL_TABLE.timbres)) out.push({ bird: 'zephyr', where: `the keys ${id}`, short: v });
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
    if (row.lockedSays) out.push({ bird, where: 'locked', says: row.lockedSays });
  }
  return out;
}

/** The words no sentence may carry: a pole or a comparison is not a reading. */
// (and since K19 "bird", which is the code's word and not a listener's: *"drop 'bird' from the tooltip text"*)
export const BANNED_WORDS: readonly string[] = Object.freeze(['more', 'less', 'out', 'in', 'shorter', 'longer', 'how', 'bird', 'birds']);
