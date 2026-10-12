// The shape of the track. The order of sections is drawn from real section
// runs mined out of the reference sets, and their lengths from the measured
// per-label distributions, so two seeds do not get the same plan.
//
// Sections decide which layers may play and where the macro filter sits; the
// pattern generators decide what those layers actually do.
//
// The *grammar* — which layers each kind of section switches on, phrase by
// phrase, and where its filter sits — left for the style file in round F of
// PLAN-V1-NEXT, because a breakdown that drops the kick and keeps the pad is
// deep house and not the machine. What is here is the arithmetic that reads
// it: draw an order, draw a length per label, round to phrases, settle the
// remainder, and turn the result into sections and phrases.

import type Rng from './rng.ts';
import type { Style } from '@deep-house/engine/style';
import type { Settings } from '@deep-house/engine/settings';
import type { Admits, RowKind } from './sections.ts';

/** One eight-bar phrase of a section: where it starts, and what plays in it. */
export interface Phrase {
  startBar: number;
  indexInSection: number;
  /** the arrangement layers this phrase switches on, by the grammar's own keys */
  layers: Record<string, boolean>;
}

/**
 * One section of a track: the kind of section it is out of the style's
 * grammar, the word a listener is shown, where it sits, and the four things
 * the grammar says happen at its edges.
 */
export interface Section {
  kind: string;
  label: string;
  startBar: number;
  bars: number;
  phrases: Phrase[];
  /** where the macro filter starts and ends across it */
  filter: number[];
  sweepFirst: boolean;
  impactFirst: boolean;
  riserLast: number;
  lift: boolean;
  /** the figure kinds this section takes and where (round T2, `src/sections.ts`): its row's `admits` */
  admits: Admits;
  /** the section row it plays (round T2), where its kind is a row */
  row?: string;
  /** the row's own name, where it is not the kind's word: the ledger's, never the ring's */
  name?: string;
  index: number;
  /**
   * The drawn section whose harmonic roll this one plays (`<seed>::harm:<roll>`),
   * where it is not its own index: S25's rule puts a section between two
   * mains alike (`mainsApart`), and every section after it keeps the roll it
   * was drawn with. Absent, the roll is the index's, which is every section of
   * the record.
   */
  roll?: number;
}

/** The shape of the whole track: its sections, and how long it came out. */
export interface Arrangement {
  sections: Section[];
  bars: number;
  phrases: number;
  /** The natural handover must leave this musical span intact, in theme bars. */
  handoverNotBefore?: number;
}

/** One point of a curve written in bars, which is what a section knows. */
export interface BarPoint {
  bar: number;
  value: number;
}

/**
 * The two mined tables a plan's shape is drawn from, as `src/corpus.ts` holds
 * them: the real section orders, and the measured length distribution per
 * section label.
 */
export interface ArrangementCorpus {
  sectionOrders: string[][];
  sectionBars: Record<string, { p25: number; p75: number; median: number }>;
  /**
   * A form laid in whole blocks (round DNB-6, a track row's `form`): the one
   * order's bars as the row writes them, the labels that take up the rest of
   * the theme sixteen bars at a time, the remainder under sixteen to the outro.
   */
  sectionBlocks?: { bars: readonly number[]; stretch: readonly string[] };
}

/** A short theme's outro, where it has one (R38, `sectionPhrases`): a phrase. */
export const SHORT_OUTRO_BARS = 8;

/**
 * **The form is counted in time, not in bars** (round L3, Eugene, 10-01: *"our
 * mains are long and boring generally … time-based metrics"*). Until L3 a
 * theme took one section per 22 drawn bars, which is one per 53 seconds at the
 * house's 100 BPM and one per 106 at the benchmark's 50: a 9-minute theme there
 * had the sections of a 4.5-minute house theme. The window is now **seconds at
 * the played tempo**, calibrated on the house:
 *
 *   window = `windowBars` at the tempo the house would play the theme
 *            (`houseTempoOf`, `src/spell.ts`: the room's draw, 95-105)
 *          = windowBars × played / house tempo, in bars
 *
 * so at the house the ratio is exactly 1 and every form is the record's; at
 * 50 BPM a section comes per ~11 bars, at DnB's 172 per ~38.
 *
 * **The floors are bars at every tempo** (a phrase is a phrase, however slow):
 * the shortest a section is drawn at, the corpus's own p25 on the phrase grid,
 * and a main the cut's two phrases (`CUT_FLOORS`). Since round T2 the floor
 * is the kind's row's (`recipes/sections/`, `floor`), read through the
 * grammar, which holds a row for every kind (`grammarFromRows`). Where counting in time
 * would lay a section under its floor, the window gives one section fewer,
 * down to two, and nothing is squeezed: a breakdown, a build or a drop is never
 * 4 bars because the tempo is slow. At the house the window is the record's
 * and the floors are not read there, so its few drops and builds that the
 * record's scaling lays at 4 stay where they are.
 */
export const SECTION_TIME = Object.freeze({
  /** one section per this many bars at the tempo the house would play the theme (52.8 s at 100 BPM) */
  windowBars: 22,
});

/** The section window in bars at a played tempo, for a theme the house would play at `houseBpm`; exactly `windowBars` at the house. */
export function sectionWindowBars(bpm: number, houseBpm: number): number {
  return bpm === houseBpm ? SECTION_TIME.windowBars : SECTION_TIME.windowBars * (bpm / houseBpm);
}

// Round to whole 4-bar phrases: MEASURED, 85% of section boundaries land on a
// multiple of 4.
function toPhrases(bars: number, min = 4): number {
  return Math.max(min, Math.round(bars / 4) * 4);
}

// Draw a plan: an order from the corpus, lengths from the measured
// distribution for each label, then scaled to the length that was asked for.
//
// `grammar` is the style's section grammar: `kinds`, one row per kind of
// section, and `labelToKind`, which maps the words the corpus's mined orders
// are written in onto them.
//
// `barsMul` is the spell layer's one word here (`src/spell.ts`): it multiplies
// the window a section's length is drawn between, and it is **1** at the house,
// where `p25 * 1` is `p25` and the draw is the draw it always was. The plan is
// then scaled to the length that was asked for, so this moves the proportions
// between kinds of section and never the length of the track.
//
// `silent` is derive-lite's one word here: the grammar's own gates that this
// theme is to hold **off**, whatever the section says. It is how `drumsOn` is
// false — the lane is switched off *in the plan*, phrase by phrase, so the
// timeline says so, the machine view draws it gated for nothing, and the figure
// sources below are never asked. Empty, which is every theme of the record and
// every theme at the house, the phrase carries the grammar's own object
// unchanged and this costs a comparison against nought.
//
// `shortOutro` is house-v2's `sectionPhrases` switch, for a theme with a grid
// (R38 of the reconciled review of 09-24, Eugene's answer to question 4): a
// theme under 96 bars gets an outro too, of at least that many bars, so its
// seam has somewhere to land that is not its own build or drop. Nought — the
// record, and a theme with no drums — is the arrangement it always was.
export function makeArrangement(
  totalBars: number,
  rng: Rng,
  corpus: ArrangementCorpus,
  grammar: Style['sections'],
  barsMul = 1,
  silent: readonly string[] = [],
  shortOutro = 0,
  fitBars: number | null = null,
  cutRule: CutRule | null = null,
  windowBars: number = SECTION_TIME.windowBars,
  mains = false
): Arrangement {
  const orders = corpus.sectionOrders.filter((o) => o.length >= 2);
  // A draw off a list with something in it, which the filter above leaves: the
  // sampler answers `undefined` only for a list nothing can be drawn from.
  const drawn = rng.pickWeighted(orders)!;
  // Counted in time away from the house (L3): the window is the record's 22
  // bars only where the theme plays at the tempo the house would.
  const timed = windowBars !== SECTION_TIME.windowBars;
  // The floor is the kind's row's (T2): every kind of the grammar is read off a row that states one.
  const floorOf = (label: string) => (grammar.kinds[grammar.labelToKind[label] || 'main'] as Partial<RowKind> | undefined)?.floor ?? 8;

  // One window of the drawn run, laid: its sections, their lengths off the
  // measured distributions, scaled to the length asked, settled and cut.
  function layWindow(order: string[], wantSections: number): { order: string[]; bars: number[]; fits: boolean } {
    if (order.length > wantSections) {
      // Start the window on a groove, so the track does not open on the far side
      // of a breakdown that never happened.
      const grooveStarts = order
        .map((l, i) => (l === 'groove' && i <= order.length - wantSections ? i : -1))
        .filter((i) => i >= 0);
      const start = grooveStarts.length
        ? rng.pickWeighted(grooveStarts)!
        : rng.int(0, order.length - wantSections + 1);
      order = order.slice(start, start + wantSections);
    }
    // An outro that is not last is a key-segment boundary in the middle of a
    // DJ set, not a section of this track.
    order = order.filter((l, i) => l !== 'outro' || i === order.length - 1);
    if (!['intro', 'build'].includes(order[0])) order.unshift('intro');
    if (order[1] && ['drop', 'breakdown'].includes(order[1])) order.splice(1, 0, 'groove');
    const endsOpen = order[order.length - 1] !== 'outro';
    if (totalBars >= 96 && endsOpen) order.push('outro');
    const shortEnd = totalBars < 96 && endsOpen && shortOutro > 0;
    if (shortEnd) order.push('outro');

    const dist = corpus.sectionBars;
    const raw = order.map((label) => {
      const d = dist[label] || { p25: 8, p75: 16, median: 12 };
      return Math.max(4, rng.float(d.p25 * barsMul, d.p75 * barsMul));
    });

    const rawTotal = raw.reduce((a, b) => a + b, 0);
    const scale = totalBars / rawTotal;
    // Away from the house no section is laid under its floor (L3): it keeps
    // the floor, and the bars come off the mains below.
    const soloRoom = timed ? mainsOf(order, cutRule).soloRoom : () => 0;
    const floorAt = (i: number) => Math.max(floorOf(order[i]), soloRoom(i));
    const bars = raw.map((b, i) => (timed ? Math.max(floorAt(i), toPhrases(b * scale)) : toPhrases(b * scale)));
    if (shortEnd) bars[bars.length - 1] = Math.max(bars[bars.length - 1], shortOutro);

    // Settle the remainder on the longest groove, which is where a real set
    // absorbs it too.
    // Settle the remainder round-robin over the grooves — the way a set absorbs
    // it — rather than piling it all onto one, which makes a 4-minute track that
    // is eighty bars of the same loop.
    let total = bars.reduce((a, b) => a + b, 0);
    const grooves = order.map((l, i) => (l === 'groove' ? i : -1)).filter((i) => i >= 0);
    const pool = grooves.length ? grooves : order.map((_, i) => i);
    let turn = 0;
    let guard = 0;
    // The lowest the settling takes a section to: the record's 8 at the
    // house, the section's own floor where the window is counted in time.
    const least = (i: number) => (timed ? floorAt(i) : 8);
    while (total !== totalBars && guard++ < 500) {
      const idx = pool[turn % pool.length];
      turn++;
      if (total < totalBars) {
        bars[idx] += 4;
        total += 4;
      } else if (bars[idx] - 4 >= least(idx)) {
        bars[idx] -= 4;
        total -= 4;
      } else if (guard > pool.length * 3) {
        let big = -1;
        for (let i = 0; i < bars.length; i++) if (bars[i] - 4 >= least(i) && (big < 0 || bars[i] > bars[big])) big = i;
        if (big < 0) break;
        bars[big] -= 4;
        total -= 4;
      }
    }

    if (fitBars != null && fitBars < total) {
      cutMainsFirst(order, bars, total - fitBars, cutRule);
      // A theme cut under 96 bars that ends on a drawn outro keeps the short
      // outro such a theme is given (R16, R38): its bars come off the mains too.
      const last = bars.length - 1;
      if (fitBars < 96 && shortOutro > 0 && order[last] === 'outro' && bars[last] < shortOutro) {
        const need = shortOutro - bars[last];
        bars[last] = shortOutro;
        cutMainsFirst(order, bars, need, cutRule);
      }
    }
    // It fits where the floors left the length that was asked, and the cut
    // the length that was heard.
    const laidBars = bars.reduce((a, b) => a + b, 0);
    return { order, bars, fits: total === totalBars && (fitBars == null || laidBars <= fitBars || fitBars >= totalBars) };
  }

  // Long mined runs are whole DJ stretches; take a window that suits the
  // length we want rather than squeezing eleven sections into two minutes —
  // one section per `windowBars`, which is time at the played tempo (L3,
  // `SECTION_TIME`). Away from the house every section keeps its floor, and a
  // window whose floors the length cannot hold gives one section fewer and is
  // laid again, on the same die.
  // **A form in blocks** (round DNB-6): the row's order whole, at its bars, so
  // its drops land on the lines it puts them on; the stretch labels take up the
  // theme's length sixteen bars at a time, by turns, never under their floor,
  // and what is left under sixteen goes to the outro (or the last stretch).
  if (corpus.sectionBlocks && corpus.sectionBlocks.bars.length === drawn.length) {
    // a block under its kind's floor is laid at the floor (the review of 10-08, B10: the two-drop row's 16-bar intro
    // under the pads-first intro's 24 lost its middle phrase); the bars come back off the remainder below
    const order = drawn.slice(), bars = corpus.sectionBlocks.bars.map((b, i) => Math.max(b, floorOf(order[i])));
    const pool = order.map((l, i) => (corpus.sectionBlocks!.stretch.includes(l) ? i : -1)).filter((i) => i >= 0);
    // laid to the length heard: a theme cut to fit (a set's trim) is laid at that length, not cut after
    let diff = Math.min(totalBars, fitBars ?? Infinity) - bars.reduce((a, b) => a + b, 0);
    for (let turn = 0, idle = 0; Math.abs(diff) >= 16 && pool.length && idle < pool.length; turn++) {
      const i = pool[turn % pool.length];
      if (diff > 0) { bars[i] += 16; diff -= 16; idle = 0; }
      else if (bars[i] - 16 >= Math.max(8, floorOf(order[i]))) { bars[i] -= 16; diff += 16; idle = 0; }
      else idle++;
    }
    const out = order.lastIndexOf('outro');
    const rest = [out, ...pool.slice().reverse(), ...order.map((_, i) => i)].find((i) => i >= 0 && bars[i] + diff >= 4);
    if (rest != null) bars[rest] += diff;
    if (fitBars != null && fitBars < bars.reduce((a, b) => a + b, 0)) cutMainsFirst(order, bars, bars.reduce((a, b) => a + b, 0) - fitBars, cutRule);
    const rolls = order.map((_, i) => i);
    if (mains) mainsApart(order, bars, rolls, cutRule, order.length);
    return sectionsFrom(order.map((label, i) => ({ kind: grammar.labelToKind[label] || 'main', bars: bars[i], roll: rolls[i] })), grammar, silent);
  }
  let want = Math.max(2, Math.min(drawn.length, Math.round(totalBars / windowBars)));
  let laid = layWindow(drawn.slice(), want);
  while (timed && want > 2 && !laid.fits) laid = layWindow(drawn.slice(), --want);
  const { order, bars } = laid;
  // Each section plays its own drawn index's harmonic roll, which S25's rule
  // (house-v2's `mainsApart`) keeps with its main when it parts two alike.
  const rolls = order.map((_, i) => i);
  if (mains) mainsApart(order, bars, rolls, cutRule, order.length);
  return sectionsFrom(order.map((label, i) => ({ kind: grammar.labelToKind[label] || 'main', bars: bars[i], roll: rolls[i] })), grammar, silent);
}

/**
 * **Two mains alike never stand side by side** (round S25, Eugene of 27191's
 * third theme: *"the solo comes at the very end, after two main segments one
 * after another"*). Where the laid run puts a main directly after a main of
 * the same texture (L2's: the sustained layer held or away, and the figure on
 * or not, `MainTexture.key`) — a repeat with no relief — a section goes
 * between them; two mains of different textures side by side are a
 * progression and stay as drawn. The section goes between them at its floor
 * (`CUT_FLOORS`, 8 bars): a breakdown, or a build where a drop follows the
 * second main. Its bars come off the longer of the two, the later of two of a
 * length (L2's order: the second of two alike is the repeat), so long as the
 * giver keeps the main's floor (16); the other gives where the first cannot.
 * Where neither can, the two merge into one main of both their bars, playing
 * the first's roll. The intro → main and main → outro edges are not mains
 * side by side and are never touched. No die: the same run is always parted
 * the same way; the length of the theme never moves. The inserted section
 * plays a roll of its own (`fresh` on), since it was never drawn. Written in
 * place.
 */
export function mainsApart(order: string[], bars: number[], rolls: number[], rule: CutRule | null, fresh: number): void {
  const tex = (i: number): MainTexture => (rule ? rule.texture(rolls[i]) : { key: 'main', open: false });
  const floor = CUT_FLOORS.groove;
  for (let a = 0; a + 1 < order.length; ) {
    const b = a + 1;
    if (order[a] !== 'groove' || order[b] !== 'groove' || tex(a).key !== tex(b).key) { a++; continue; }
    const label = order[b + 1] === 'drop' ? 'build' : 'breakdown';
    const gap = CUT_FLOORS[label];
    const first = bars[a] > bars[b] ? a : b;
    const giver = [first, first === a ? b : a].find((i) => bars[i] - gap >= floor);
    if (giver != null) {
      bars[giver] -= gap;
      order.splice(b, 0, label);
      bars.splice(b, 0, gap);
      rolls.splice(b, 0, fresh++);
      a = b + 1;
    } else {
      bars[a] += bars[b];
      order.splice(b, 1);
      bars.splice(b, 1);
      rolls.splice(b, 1);
    }
  }
}

/**
 * **The floors a cut stops at, by the corpus label** (house-v2's `themeTrim`,
 * S19). A main keeps two phrases; a breakdown, a build and a drop one; the
 * intro its first phrase, which is where S13's opening sound lives; the outro
 * its last eight bars, the line S4's `seamLineInside` hands the mix on.
 */
export const CUT_FLOORS: Readonly<Record<string, number>> = Object.freeze({ groove: 16, breakdown: 8, build: 8, drop: 8, intro: 8, outro: 8 });

/**
 * **What the cut knows of a main before its bars are laid** (round L2): its
 * texture, read off the plan's own harmonic roll for that section
 * (`<seed>::harm:<index>`, the draw the bars will play) — whether the
 * sustained layer holds under it, and whether the figure plays in it.
 */
export interface MainTexture {
  /** the texture as a word: two mains with the same word repeat each other */
  key: string;
  /** no sustained layer under it: a passage the bass could solo over (`src/solo.ts`) */
  open: boolean;
}

/** The cut's reading of a theme (round L2): each main's texture, and the bars a solo asks of its section. */
export interface CutRule {
  /** the texture of the main at this index of the drawn order */
  texture: (index: number) => MainTexture;
  /**
   * The bars an open main whose texture is the theme's only one keeps, where
   * the theme may solo (`SOLO_SECTION_BARS`: the slow side, no drums, at
   * least `soloMinBars` at the played tempo); 0 where it may not.
   */
  soloBars: number;
}

/**
 * Cut `cut` bars off a drawn arrangement, **the mains first** (S19, Eugene:
 * *"bias the trimming toward the longer segments and away from the breaks and
 * bridges, which are already a lot shorter than the main runs"*), and **the
 * repeats before the variety** (L2, Eugene of 27191: *"those pads were making
 * the track diverse — reducing the length by increasing repetitive main
 * segments is actually a less interesting scenario"*). In order:
 *
 *   1. the mains whose texture another main of the theme shares (`CutRule`:
 *      the same sustained layer, held or away, and the same figure), a whole
 *      phrase (8 bars) at a time, then four, always off the longest one that
 *      stays at or over its floor, and between two of a length off the later
 *      one — the second of two alike is the repeat;
 *   2. then the mains whose texture is the theme's only one, the same way.
 *      An open one (no sustained layer: where the bass can solo) keeps the
 *      section a solo asks (`CutRule.soloBars`) when the theme may solo;
 *   3. then the breakdowns, the builds and the drops, four bars at a time off
 *      the longest, down to their floor;
 *   4. then the intro past its first phrase and the outro past its last line.
 *
 * No die: the same plan is always cut the same way. Without a rule every main
 * is read as a repeat, which is S19's cut. A cut that the floors cannot take
 * whole leaves the theme that much longer. Written in place on `bars`; the
 * order of the sections never changes.
 */
export function cutMainsFirst(order: readonly string[], bars: number[], cut: number, rule: CutRule | null = null): void {
  const { repeats, only, soloRoom } = mainsOf(order, rule);
  const floor = (i: number) => Math.max(CUT_FLOORS[order[i]] ?? 8, soloRoom(i));
  const take = (at: readonly number[], step: number, later = false) => {
    while (cut >= step) {
      let best = -1;
      for (const i of at) {
        if (bars[i] - step < floor(i)) continue;
        if (best < 0 || bars[i] > bars[best] || (later && bars[i] === bars[best])) best = i;
      }
      if (best < 0) return;
      bars[best] -= step;
      cut -= step;
    }
  };
  // The sections that are not mains keep S19's order exactly: the longest,
  // the first of two of a length.
  const of = (labels: readonly string[]) => order.flatMap((l, i) => (labels.includes(l) ? [i] : []));
  take(repeats, 8, true);
  take(repeats, 4, true);
  take(only, 8, true);
  take(only, 4, true);
  take(of(['breakdown', 'build', 'drop']), 4);
  take(of(['intro', 'outro']), 4);
}

/**
 * The mains of a drawn order as the cut reads them (L2): those whose texture
 * another main shares, those whose texture is the theme's only one, and the
 * bars a main keeps for the bass's solo — an open main that is the only one
 * of its texture, where the theme may solo (`CutRule.soloBars`); 0 elsewhere.
 */
export function mainsOf(order: readonly string[], rule: CutRule | null) {
  const mains = order.flatMap((l, i) => (l === 'groove' ? [i] : []));
  const texture = new Map(mains.map((i) => [i, rule ? rule.texture(i) : { key: 'main', open: false }]));
  const alike = (i: number) => mains.some((j) => j !== i && texture.get(j)!.key === texture.get(i)!.key);
  const repeats = mains.filter(alike);
  const only = mains.filter((i) => !alike(i));
  const soloRoom = (i: number) => (rule && only.includes(i) && texture.get(i)!.open ? rule.soloBars : 0);
  return { repeats, only, soloRoom };
}

/** Realize declared section spans without another draw or another clock. */
export function sectionsFrom(rows: readonly { kind: string; bars: number; roll?: number }[], grammar: Style['sections'], silent: readonly string[] = []): Arrangement {
  // The gates this theme holds off. A theme with none — the record's every
  // theme, and every theme at the house — is handed the grammar's own object
  // back, so nothing about the phrase is a copy of anything.
  const hush = silent.length
    ? (layers: Record<string, boolean>) => {
        const out = { ...layers };
        for (const g of silent) if (g in out) out[g] = false;
        return out;
      }
    : (layers: Record<string, boolean>) => layers;

  const sections: Section[] = [];
  let bar = 0;
  rows.forEach(({ kind: kindName, bars, roll }) => {
    if (bars <= 0) return;
    const kind = grammar.kinds[kindName] as Partial<RowKind> & Style['sections']['kinds'][string];
    const section: Section = {
      kind: kindName,
      label: kind.label,
      startBar: bar,
      bars,
      phrases: [],
      filter: kind.filter,
      sweepFirst: !!kind.sweepFirst,
      impactFirst: !!kind.impactFirst,
      riserLast: kind.riserLast || 0,
      lift: !!kind.lift,
      admits: kind.admits ?? {},
      index: sections.length,
    };
    if (kind.row) section.row = kind.row;
    if (kind.name) section.name = kind.name;
    if (roll != null && roll !== section.index) section.roll = roll;
    // Phrases of 8 bars, with a 4-bar remainder allowed at the end.
    const n = Math.max(1, Math.ceil(bars / 8));
    for (let j = 0; j < n; j++) {
      section.phrases.push({
        startBar: bar + j * 8,
        indexInSection: j,
        layers: hush(kind.layers(j, n)),
      });
    }
    bar += bars;
    sections.push(section);
  });

  return { sections, bars: bar, phrases: Math.round(bar / 8) };
}

// The macro filter curve, in bars. One point at the start of each section and
// one at its end, plus an extra open point where a riser lifts into a drop.
export function filterCurve(arrangement: Arrangement): BarPoint[] {
  const points: BarPoint[] = [];
  for (const s of arrangement.sections) {
    points.push({ bar: s.startBar, value: s.filter[0] });
    const endBar = s.startBar + s.bars;
    if (s.riserLast && s.bars > s.riserLast + 2) {
      points.push({ bar: endBar - s.riserLast / 4 - 1, value: s.filter[1] * 0.55 });
    }
    points.push({ bar: endBar - 0.05, value: s.filter[1] });
  }
  return points;
}

// The push curve, in bars: how hard the low end is driven. Zero through a
// normal groove — the kick and the bass are the structure of the record and
// structure does not distort — lifting over the last bars of a build, high for
// the first bars of a drop, and gone again within eight. Eugene's ear, not a
// measurement: distortion is "fine in some parts to support exaggeration of
// the moment, but only on breaks where the drums fill and the energy rises".
//
// `edges` is house-v2's `sectionEdges` switch (R111 of the review of 09-24): a
// drop that runs straight into a breakdown ends its drive where the
// breakdown's hand-off begins, so the mark before the breakdown is not cut to
// nothing on its first bar by the drop's own zero. Off — the record — the
// curve is the one it always was.
export function pushCurve(arrangement: Arrangement, push: Settings['push'], edges = false): BarPoint[] {
  const pts: BarPoint[] = [{ bar: 0, value: 0 }];
  const sections = arrangement.sections;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const end = s.startBar + s.bars;
    if (s.kind === 'build') {
      const lift = Math.min(s.bars, push.buildBars);
      pts.push({ bar: Math.max(0, end - lift), value: 0 });
      pts.push({ bar: end - 0.02, value: push.buildLevel });
    } else if (s.kind === 'drop') {
      // The drive belongs to the drop and starts on its downbeat. Without a
      // zero immediately before that downbeat there is no point between the
      // end of the previous section and the drop's, and the curve is a list of
      // ramps -- so a drop that follows a breakdown rather than a build used to
      // ramp the *whole breakdown* up into it. MEASURED on master seed 1, theme
      // 2: bars 101-112 are a breakdown, and the push read 0.08 at bar 102 and
      // 0.77 at bar 111, which is how the quietest section of the theme came
      // out 4.5 LU *louder* than the mains round it.
      const prev = sections[i - 1];
      if (!prev || prev.kind !== 'build') {
        pts.push({ bar: Math.max(0, s.startBar - 0.02), value: 0 });
      }
      pts.push({ bar: s.startBar, value: push.dropLevel });
      const next = sections[i + 1];
      const handOff = edges && next && next.kind === 'breakdown' && next.startBar > 1 ? next.startBar - 1.5 : Infinity;
      pts.push({ bar: Math.min(end, s.startBar + push.dropBars, handOff), value: 0 });
    } else if (s.kind === 'breakdown' && s.startBar > 1) {
      // The hand-off out of a loud section into a quiet one: one bar of drive
      // to mark the change, then clean again on the other side of it.
      pts.push({ bar: s.startBar - 1.5, value: 0 });
      pts.push({ bar: s.startBar - 0.1, value: push.markLevel });
      pts.push({ bar: s.startBar + 1, value: 0 });
    } else {
      pts.push({ bar: s.startBar, value: 0 });
    }
  }
  pts.push({ bar: arrangement.bars, value: 0 });
  pts.sort((a, b) => a.bar - b.bar);
  // Strictly increasing, so the curve is a list of ramps and not a stack of
  // events at one instant. Of two points at one bar the later one stands (the
  // sort is stable, so it is the later section's): a drop straight after a
  // drop keeps its own push where the first drop's drive ends on its line
  // (the review of 10-08, A4; the first point used to stand, and the second
  // drop played without its drive).
  return pts.filter((p, i) => i === pts.length - 1 || p.bar < pts[i + 1].bar);
}

export function sectionAtBar(arrangement: Arrangement, bar: number): Section {
  for (const s of arrangement.sections) {
    if (bar >= s.startBar && bar < s.startBar + s.bars) return s;
  }
  return arrangement.sections[arrangement.sections.length - 1];
}

export function layersAtBar(
  arrangement: Arrangement,
  bar: number
): { section: Section; phrase: Phrase; layers: Record<string, boolean> } {
  const s = sectionAtBar(arrangement, bar);
  let phrase = s.phrases[0];
  for (const p of s.phrases) if (bar >= p.startBar) phrase = p;
  return { section: s, phrase, layers: phrase.layers };
}

/**
 * **A span of a phrase grid**: its first bar, the bar after its last, and a
 * number for it — `start / every`, which is the phrase's own index where the
 * span sits on the set's line and a fraction where it does not, so a stream
 * keyed by it is the stream it always was on every span the two grids share.
 */
export interface Span { start: number; end: number; n: number }
/** Where a bar's span of `every` bars is, on one grid or the other. */
export type PhraseGrid = (bar: number, every?: number) => Span;

/** **The set's line**: every span counted from bar nought — the record's grid. */
export const setGrid: PhraseGrid = (bar, every = 8) => {
  const start = Math.floor(bar / every) * every;
  return { start, end: start + every, n: start / every };
};

/**
 * **The section's line**: every span counted from the first bar of the section
 * it is in, and cut at the section's end — a section of twelve bars is a phrase
 * of eight and one of four, the way `sectionsFrom` lays its phrases out. A bar
 * off either end of the arrangement is on the set's line.
 */
export function sectionGrid(arrangement: Arrangement): PhraseGrid {
  return (bar, every = 8) => {
    if (bar < 0 || bar >= arrangement.bars) return setGrid(bar, every);
    const s = sectionAtBar(arrangement, bar);
    const start = s.startBar + Math.floor((bar - s.startBar) / every) * every;
    return { start, end: Math.min(start + every, s.startBar + s.bars), n: start / every };
  };
}

/**
 * **Whether a theme has a grid to count phrases on**: its kick plays in some
 * phrase of it. A theme whose drums are off (`drumsOn` false, the gate hushed
 * in every phrase) has none, and the ambient benchmark, 27191 at its spell, is
 * such a theme. What "a grid" is in full — one quantity off the pulse — is
 * Eugene's question 13, decided with the pulse weights; this is the reading the
 * scene already makes (`composition.ts`: with no drums the drone is in front
 * because there is nothing to sit behind).
 */
export function hasGrid(arrangement: Arrangement, kickGate: string | undefined): boolean {
  return !!kickGate && arrangement.sections.some((s) => s.phrases.some((p) => p.layers[kickGate]));
}

/**
 * **The phrase grid a theme's devices count on** (R16 of the reconciled review
 * of 09-24, Eugene's answer to question 4). Sections start on a four-bar line
 * and half of them four bars into the set's eight, so a fill, a dropout, a
 * variation or a stage move counted on the set's line lands four bars into a
 * section. Under a style with the `sectionPhrases` switch, a theme with a grid
 * counts every phrase from its section's first bar; everything else — the
 * record, and a theme with no drums — keeps the set's line.
 */
export function phraseGrid(arrangement: Arrangement, sectionPhrases: boolean, kickGate: string | undefined): PhraseGrid {
  return sectionPhrases && hasGrid(arrangement, kickGate) ? sectionGrid(arrangement) : setGrid;
}

export default makeArrangement;
