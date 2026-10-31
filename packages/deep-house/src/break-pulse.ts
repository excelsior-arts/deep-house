// **A break keeps its rhythm in beat-led places** (round break-pulse-rule, 10-30). His words: *"on fast, beat-heavy
// zones, the break that doesn't have any even notion of beat is like out of touch with the reality"*; *"There's always
// some notion of rhythm throughout. Not necessarily a full drum set, but we can't lose the rhythm"*; and on the
// sketches (`notes/rounds/break-pulse.md`): *"I liked the most 'hats' and 'half time' is also good, ideally should
// follow beat style, if it's straight then hats, if it's broken half time etc. Pumping pad was fine as well, in some
// cases it does a bit too wobbly and disturbing"*, and on Vibe - Solar Wind *"all three options are nice, could we make
// it up to the birds to control the approach"*.
//
// Everything is read off the plan, never off a genre's name:
//   - **how beat-led** the theme is: `beatLedOf` (performance.ts), the hand-overs' reading with the tempo as played
//     (a slow theme whose drums run double stays slow here: his word, slow places keep their break). Under the row's
//     `bands.lift` nothing moves: the house, deep house, downtempo, trip hop and every ambient place keep today's break;
//   - **the beat's style**: straight where the groove's kick strikes all four beats in `straight` of its kick bars, else
//     broken;
//   - **what the groove has**: a hat (the offbeat lane's own voice), a backbeat, a held bed in the break.
//
// The carriers, every hit a copy of one the theme already plays, nothing new to the cast:
//   - **the hats line** (a straight groove's): the groove's hat, thinned, high-passed, building into the drop;
//   - **the half-time ghost** (a broken groove's): its own backbeat once a bar on 3, kickless and filtered, with its
//     ghosts and its hat on the quarters;
//   - **the gentle pump** (never the default): the bed's held notes breathing on the beat, the house duck's shape
//     written on the notes a few dB deep. Not the kick's sidechain posted by silent kicks: that posts the room's full
//     duck (6-9 dB, the "too wobbly" one), inks the ring's kick lane with hits no one hears, and spares a struck bed.
//
// The beat's style picks the default; the birds lean the others in where they fit (the one lean, centred on the house).
// One draw per theme off its own stream. A drum carrier is lifted inside the break only, never outside it. The timeline
// is the arrangement's and is left as it is: a breakdown's gates already hold the hats on (the liquid one its backbeat),
// so the ring draws the carrier, and the return's contrast the riser was set by reads as it did.
// Leaves alone: the drop's arrival, any build or snare roll into it (the stretch ends where the break's own drums
// begin), the break's length, its harmony, and the bed's level apart from the pump.

import ROW_FILE from '../recipes/arrangement/break-pulse.json' with { type: 'json' };
import { BY_NAME, VOICE_BUS } from '@deep-house/engine/voices';
import { dbToGain } from '@deep-house/engine/dsp';
import { Rng } from './rng.ts';
import { lean } from './lean.ts';
import { beatLedOf } from './performance.ts';

export type Carrier = 'hats' | 'half-time' | 'pump';
export const CARRIERS: readonly Carrier[] = ['hats', 'half-time', 'pump'];
type Stage = 'light' | 'first' | 'second' | 'last';

export interface BreakPulseRow {
  bands: { lift: number; drive: number };
  least: number;
  straight: number;
  weights: { own: number; other: number; pump: number };
  leans: { strength?: number } & Record<string, unknown>;
  hats: { steps: Record<'light' | 'first' | 'second', number[]>; hp: { light: number; first: number; second: number; last: [number, number] };
    db: { light: number; first: number; second: number; last: [number, number]; sixteenth: number } };
  halfTime: { backbeat: number; hatSteps: number[]; hp: { backbeat: number; ghost: number; hats: number; last: number }; db: { backbeat: number; ghost: number; hats: number; last: number } };
  pump: { depthDb: { light: number; first: number; last: number }; attackS: number; minimumBeats: number; back: number; backBeats: number; wholeBeats: number };
  level: { window: number; target: number; most: number; least: number; hits: Record<string, number>; hit: number; beds: Record<string, number>; bed: number };
}
export const BREAK_PULSE: Readonly<BreakPulseRow> = ROW_FILE as unknown as BreakPulseRow;

/** An event of the plan, as far as the rule reads and writes one. */
export interface PulseEvent {
  t: number; voice: string; layer: string; p: Record<string, unknown>;
  bar?: number | null; step?: number | null; by?: string; label?: string; role?: string; part?: string;
  [k: string]: unknown;
}

/** One break as the rule left it: its run of breakdown bars, the stretch it carried, how, and at what lift. */
export interface PulseBreak {
  /** the breakdown run [from, to) and the beatless stretch [from, until) the carrier holds */
  from: number; to: number; until: number;
  band: 'lift' | 'drive';
  carrier: Carrier;
  /** dB the drum carrier stands over its groove level inside the break; the carrier over the bed as the plan reads it before and after */
  liftDb: number; gapDb: number | null;
  hits: number; ridden: number;
  /** what the lift was read from: the main line's hits by voice and the bed by class, as played, dB per window (no loudness per unit) */
  reads?: { hits: Record<string, number>; beds: Record<string, number> };
}
export interface BreakPulsePlan {
  reading: number;
  style: 'straight' | 'broken';
  fits: Carrier[];
  weights: Record<Carrier, number>;
  carrier: Carrier;
  breaks: PulseBreak[];
  summary: string;
}

export interface BreakPulseInput {
  seed: string | number;
  events: PulseEvent[];
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  barSeconds: number;
  bars: number;
  bpm: number;
  clock?: string;
  spell: Readonly<Record<string, number>>;
  /** a backbeat stroke struck as a ghost */
  ghost: (e: PulseEvent) => boolean;
  /** an event's level as the program plays it, in dB (the room's lane, the keyed floor, the stage, gain and velocity) */
  levelOf: (e: PulseEvent) => number;
  /** the class the scene table measures an event by (`keysBody.scene`: a layer and its voice, a pad by its timbre) */
  classOf: (e: PulseEvent) => string;
}

const EPS = 1e-6;
const isDrum = (e: PulseEvent) => { const b = VOICE_BUS[e.voice]; return b === 'kick' || b === 'drums'; };
const rolesOf = (e: PulseEvent): readonly string[] => BY_NAME[e.voice]?.roles ?? [];
const hasRole = (e: PulseEvent, r: string) => rolesOf(e).includes(r);
const built = (e: PulseEvent) => typeof e.by === 'string' && /build/.test(e.by);
const power = (db: number) => Math.pow(10, db / 10);
const half = (x: number) => Math.round(2 * x) / 2;

/**
 * The rule. Writes the carrier into `events` where the theme is beat-led and has a
 * beatless break, and says what it did; `null` (nothing moved) anywhere else.
 */
export function breakPulse(I: BreakPulseInput, R: Readonly<BreakPulseRow> = BREAK_PULSE): BreakPulsePlan | null {
  const { events, sections, barSeconds: bs, bars } = I;
  const reading = beatLedOf({ events, sections, barSeconds: bs, clock: I.clock }, I.bpm, { tempo: 'played' }).value;
  if (!(reading >= R.bands.lift)) return null;
  const st = bs / 16, beat = bs / 4;
  const barOf = (e: PulseEvent) => (e.bar != null ? e.bar : Math.floor(e.t / bs + EPS));
  const stepOf = (e: PulseEvent) => (e.step != null ? e.step : Math.round((e.t - barOf(e) * bs) / st));

  // **The breaks**: runs of breakdown sections side by side, each carried over its beatless stretch, from its first bar
  // to the first bar the break already strikes a kick, a backbeat or a build of its own
  const runs: Array<{ from: number; to: number }> = [];
  for (const s of sections) {
    if (s.kind !== 'breakdown') continue;
    const last = runs[runs.length - 1];
    if (last && last.to === s.startBar) last.to = s.startBar + s.bars; else runs.push({ from: s.startBar, to: s.startBar + s.bars });
  }
  const drumBars = new Map<number, PulseEvent[]>();
  for (const e of events) if (isDrum(e)) { const b = barOf(e); (drumBars.get(b) ?? drumBars.set(b, []).get(b)!).push(e); }
  const stretches = runs.map((r) => {
    let until = r.from;
    while (until < r.to && !(drumBars.get(until) ?? []).some((e) => VOICE_BUS[e.voice] === 'kick' || built(e) || (hasRole(e, 'backbeat') && !I.ghost(e)))) until++;
    return { ...r, until };
  }).filter((r) => r.until - r.from >= R.least);
  if (!stretches.length) return null;

  // **The groove**: its sections, its kick's steps, and the voices it carries on each lane
  const groove = sections.filter((s) => s.kind === 'main' || s.kind === 'drop');
  if (!groove.length) return null;
  const inGroove = (b: number) => groove.some((s) => b >= s.startBar && b < s.startBar + s.bars);
  const kickSteps = new Map<number, Set<number>>();
  for (const e of events) if (VOICE_BUS[e.voice] === 'kick' && inGroove(barOf(e))) { const b = barOf(e); (kickSteps.get(b) ?? kickSteps.set(b, new Set()).get(b)!).add(stepOf(e)); }
  const four = [...kickSteps.values()].filter((s) => [0, 4, 8, 12].every((x) => s.has(x))).length;
  const style: 'straight' | 'broken' = kickSteps.size && four / kickSteps.size >= R.straight ? 'straight' : 'broken';

  /** the groove a break builds into (the first after it: a build may stand between), else the last before it */
  const sourceOf = (r: { from: number; to: number }) => groove.find((s) => s.startBar >= r.to) ?? [...groove].reverse().find((s) => s.startBar + s.bars <= r.from) ?? groove[0];
  /** the source's hits of a voice by step, over its first four bars, each step's first */
  const templates = (src: { startBar: number; bars: number }, pick: (e: PulseEvent) => boolean) => {
    const end = src.startBar + Math.min(4, src.bars);
    const by = new Map<string, Map<number, PulseEvent>>();
    const count = new Map<string, number>();
    for (const e of events) {
      const b = barOf(e);
      if (b < src.startBar || b >= end || !isDrum(e) || built(e) || !pick(e)) continue;
      const m = by.get(e.voice) ?? by.set(e.voice, new Map()).get(e.voice)!;
      if (!m.has(stepOf(e))) m.set(stepOf(e), e);
      count.set(e.voice, (count.get(e.voice) ?? 0) + 1);
    }
    const voice = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
    return voice ? { voice, at: by.get(voice)!, hits: count.get(voice)!, bars: end - src.startBar } : null;
  };
  const firstSrc = sourceOf(stretches[0]);
  const hatT = templates(firstSrc, (e) => hasRole(e, 'offbeat'));
  const sixT = templates(firstSrc, (e) => hasRole(e, 'sixteenth'));
  const backT = templates(firstSrc, (e) => hasRole(e, 'backbeat') && !I.ghost(e));
  const ghostT = templates(firstSrc, (e) => hasRole(e, 'backbeat') && I.ghost(e));
  /** the bed in a stretch: what sounds there besides the drums and the noises, as a beat long or more */
  const bedIn = (a: number, z: number) => events.filter((e) => !isDrum(e) && e.layer !== 'fx' && e.role !== 'detail' && typeof e.p.midi === 'number'
    && e.t < z * bs - EPS && e.t + (Number(e.p.dur) || 0) > a * bs + EPS);
  const held = (e: PulseEvent) => (Number(e.p.dur) || 0) >= beat - EPS && (hasRole(e, 'sustained') || hasRole(e, 'figure'));

  // **Which carriers fit**: a hat the groove plays once a bar or more; a backbeat; a bed held through the break
  const fits: Carrier[] = [];
  if (hatT && hatT.hits / hatT.bars >= 1) fits.push('hats');
  if (backT) fits.push('half-time');
  if (stretches.some((r) => bedIn(r.from, r.until).some(held))) fits.push('pump');
  if (!fits.length) return null;
  const own: Carrier = style === 'straight' ? 'hats' : 'half-time';
  const other: Carrier = own === 'hats' ? 'half-time' : 'hats';
  // the one lean (src/lean.ts), centred on the middle of each bird's range
  const L = R.leans as Record<string, unknown> & { strength?: number; centre?: number };
  const leanOf = (c: Carrier) => {
    let x = 1;
    for (const [bird, row] of Object.entries(L)) {
      if (!row || typeof row !== 'object') continue;
      const w = (row as Record<string, unknown>)[c];
      x *= lean(w, I.spell[bird], L.strength ?? 1, typeof L.centre === 'number' ? L.centre : 0.5);
    }
    return x;
  };
  const weights: Record<Carrier, number> = { hats: 0, 'half-time': 0, pump: 0 };
  const drums = fits.filter((c) => c !== 'pump');
  // the beat's own carrier keeps its weight as written: the birds pull the others in, never push it out
  if (drums.includes(own)) weights[own] = R.weights.own;
  if (drums.includes(other)) weights[other] = (drums.includes(own) ? R.weights.other : R.weights.own) * leanOf(other);
  if (fits.includes('pump')) {
    // no weight of its own: only where the birds lean to it over the house, or where it is all the theme has
    const k = leanOf('pump');
    weights.pump = !drums.length ? 1 : k > 1 ? R.weights.pump * k : 0;
  }
  for (const c of CARRIERS) weights[c] = +weights[c].toFixed(4);
  const order: Carrier[] = [own, other, 'pump'].filter((c) => weights[c as Carrier] > 0) as Carrier[];
  if (!order.length) return null;
  const total = order.reduce((a, c) => a + weights[c], 0);
  let u = new Rng(`${I.seed}::break-pulse`).float() * total, carrier = order[order.length - 1];
  for (const c of order) { u -= weights[c]; if (u <= 0) { carrier = c; break; } }

  const out: PulseBreak[] = [];
  const added: PulseEvent[] = [];
  const dropped = new Set<PulseEvent>();
  for (const r of stretches) {
    const band: 'lift' | 'drive' = reading >= R.bands.drive ? 'drive' : 'lift';
    const n = r.until - r.from;
    const q = Math.max(2, Math.round(n / 4));
    const stageAt = (b: number): Stage => band === 'lift' ? 'light' : b - r.from < Math.floor(n / 2) ? 'first' : b < r.until - q ? 'second' : 'last';
    /** where in the last quarter a bar stands, nought at its first bar to one at its last */
    const lastAt = (b: number) => q > 1 ? (b - (r.until - q)) / (q - 1) : 1;
    const src = sourceOf(r);
    const H = templates(src, (e) => hasRole(e, 'offbeat')) ?? hatT;
    const S16 = templates(src, (e) => hasRole(e, 'sixteenth')) ?? sixT;
    const B = templates(src, (e) => hasRole(e, 'backbeat') && !I.ghost(e)) ?? backT;
    const G = templates(src, (e) => hasRole(e, 'backbeat') && I.ghost(e)) ?? ghostT;
    const mine: PulseEvent[] = [];
    /** a copy of a template's hit nearest the step (the same kind of step first: an off-beat eighth, an eighth, a sixteenth) */
    const nearest = (T: NonNullable<typeof H>, step: number): PulseEvent | null => {
      if (T.at.has(step)) return T.at.get(step)!;
      const kind = (s: number) => (s % 2 ? 2 : s % 4 ? 1 : 0);
      const steps = [...T.at.keys()].sort((a, b) => (kind(a) === kind(step) ? 0 : 1) - (kind(b) === kind(step) ? 0 : 1) || Math.abs(a - step) - Math.abs(b - step) || a - b);
      return steps.length ? T.at.get(steps[0])! : null;
    };
    const lay = (tpl: PulseEvent, bar: number, step: number, db: number, hp: number, what: string) => {
      // its swing and nudge kept where it is a hit of that step, re-timed to the grid where it moved
      const srcStep = stepOf(tpl), nudge = srcStep === step ? tpl.t - (barOf(tpl) * bs + srcStep * st) : 0;
      const p = { ...tpl.p, gain: +((Number(tpl.p.gain ?? 1)) * dbToGain(db)).toFixed(6), hpPath: Math.round(hp) };
      const { bar: _b, step: _s, t: _t, p: _p, by: _by, label: _l, ...rest } = tpl;
      mine.push({ ...rest, t: +(bar * bs + step * st + nudge).toFixed(6), bar, step, p, by: `break-pulse/${carrier}`, label: `the break's ${what}` });
    };
    // the kit's own tops already in the stretch (the house's thinned hats over a breakdown's later phrases): a drum
    // carrier re-lays them as one line from the first bar
    const tops = carrier === 'pump' ? [] : events.filter((e) => isDrum(e) && !built(e) && (hasRole(e, 'offbeat') || hasRole(e, 'sixteenth'))
      && barOf(e) >= r.from && barOf(e) < r.until);
    let liftDb = 0, gapDb: number | null = null, ridden = 0;
    const hitsBy: Record<string, number> = {}, bedBy: Record<string, number> = {};
    if (carrier === 'hats' && H) {
      const T = R.hats;
      for (let b = r.from; b < r.until; b++) {
        const s = stageAt(b), steps = s === 'last' ? T.steps.second : T.steps[s];
        const db = s === 'last' ? T.db.last[0] + (T.db.last[1] - T.db.last[0]) * lastAt(b) : T.db[s];
        const hp = s === 'last' ? T.hp.last[0] * Math.pow(T.hp.last[1] / T.hp.last[0], lastAt(b)) : T.hp[s];
        for (const step of steps) { const tpl = nearest(H, step); if (tpl) lay(tpl, b, step, db, hp, 'hats line'); }
        if (s === 'last' && S16) for (const [step, tpl] of S16.at) lay(tpl, b, step, db + T.db.sixteenth, hp, 'hats line, its sixteenths');
      }
    } else if (carrier === 'half-time' && B) {
      const T = R.halfTime;
      const bb = nearest(B, 12) ?? nearest(B, 4)!;
      for (let b = r.from; b < r.until; b++) {
        const s = stageAt(b), up = s === 'last' ? T.db.last * lastAt(b) : 0;
        const hpOf = (hz: number) => (s === 'last' ? hz * Math.pow(T.hp.last / T.hp.backbeat, lastAt(b)) : hz);
        lay(bb, b, T.backbeat, T.db.backbeat + up, hpOf(T.hp.backbeat), 'half-time backbeat');
        if (s === 'light') continue;
        if (G) for (const [step, tpl] of G.at) if (step !== T.backbeat) lay(tpl, b, step, T.db.ghost + up, hpOf(T.hp.ghost), 'half-time ghosts');
        if (H) for (const step of s === 'last' ? R.hats.steps.second : T.hatSteps) { const tpl = nearest(H, step); if (tpl) lay(tpl, b, step, T.db.hats + up, hpOf(T.hp.hats), 'half-time hats'); }
      }
    } else if (carrier === 'pump') {
      ridden = pump(I, R, r, bedIn(r.from, r.until).filter(held), stageAt, beat);
    }
    if (mine.length) {
      // **Audible against the bed** (the sketches: the tight hat sat 22-28 LU under a Chillstep or Tech House pad): the
      // carrier's main line (the hats, or the backbeat) over the bed, each as played and by its measured loudness per
      // unit (`level.hits` by voice, `level.beds` by class), both per `window` seconds over the stretch, lifted to the
      // row's target
      const main = mine.filter((e) => carrier === 'hats' ? e.label === "the break's hats line" : e.label === "the break's half-time backbeat");
      const span = (r.until - r.from) * bs, W = R.level.window;
      for (const e of main) hitsBy[e.voice] = (hitsBy[e.voice] ?? 0) + power(I.levelOf(e)) * W / span;
      const bed = bedIn(r.from, r.until), beats = (r.until - r.from) * 4;
      for (let k = r.from * 4; k < r.until * 4; k++) {
        const t = k * beat;
        for (const e of bed) {
          const d = Number(e.p.dur) || 0;
          const w = d > W ? Math.max(0, Math.min(e.t + d, t + W) - Math.max(e.t, t)) / W : e.t >= t - 0.02 && e.t < t + W ? 1 : 0;
          if (w > 0) { const c = I.classOf(e); bedBy[c] = (bedBy[c] ?? 0) + w * power(I.levelOf(e)) / beats; }
        }
      }
      const unit = (table: Record<string, number>, k: string, d: number) => table[k] ?? table[k.split(':')[0]] ?? d;
      const e1 = Object.entries(hitsBy).reduce((a, [v, x]) => a + x * power(unit(R.level.hits, v, R.level.hit)), 0);
      const e2 = Object.entries(bedBy).reduce((a, [c, x]) => a + x * power(unit(R.level.beds, c, R.level.bed)), 0);
      if (e1 > 0 && e2 > 0) {
        gapDb = +(10 * Math.log10(e1 / e2)).toFixed(1);
        liftDb = half(Math.max(R.level.least, Math.min(R.level.most, R.level.target - gapDb)));
      }
      if (liftDb) for (const e of mine) e.p = { ...e.p, gain: +(Number(e.p.gain) * dbToGain(liftDb)).toFixed(6) };
      for (const e of tops) dropped.add(e);
      added.push(...mine);
    }
    const dbOf = (x: Record<string, number>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, +(10 * Math.log10(v)).toFixed(2)]));
    out.push({ from: r.from, to: r.to, until: r.until, band, carrier, liftDb, gapDb, hits: mine.length, ridden,
      ...(gapDb != null ? { reads: { hits: dbOf(hitsBy), beds: dbOf(bedBy) } } : {}) });
  }
  if (dropped.size) for (let i = events.length - 1; i >= 0; i--) if (dropped.has(events[i])) events.splice(i, 1);
  if (added.length) { events.push(...added); events.sort((a, b) => a.t - b.t); }
  const summary = `the break keeps a ${carrier === 'hats' ? 'hats line' : carrier === 'half-time' ? 'half-time ghost' : 'gentle pump'} (${style} beat, beat-led ${reading})`;
  return { reading, style, fits, weights, carrier, breaks: out, summary };
}

/**
 * **The gentle pump**: each held note of the bed that sounds inside the stretch ridden on every beat there by the house
 * duck's shape, `depthDb` deep (a lift's throughout; a drive's, deeper over its last quarter), multiplied into any level
 * path the note already rides. Returns how many notes it rode.
 */
function pump(I: BreakPulseInput, R: Readonly<BreakPulseRow>, r: { from: number; until: number }, notes: PulseEvent[], stageAt: (b: number) => Stage, beat: number): number {
  const bs = I.barSeconds, P = R.pump;
  const A = r.from * bs, Z = r.until * bs;
  let n = 0;
  for (const e of notes) {
    const dur = Number(e.p.dur) || 0;
    const t0 = Math.max(e.t, A), t1 = Math.min(e.t + dur, Z);
    if (!(t1 > t0)) continue;
    const pts: Array<[number, number]> = [[t0 - e.t, 1]];
    for (let k = Math.ceil((t0 - EPS) / beat); k * beat < t1 - EPS; k++) {
      const tp = k * beat, s = stageAt(Math.floor(tp / bs + EPS));
      const low = dbToGain(-(s === 'light' ? P.depthDb.light : s === 'last' ? P.depthDb.last : P.depthDb.first));
      const back = low + (1 - low) * P.back;
      const x = tp - e.t;
      if (x < 0) continue;
      pts.push([x, 1], [x + P.attackS, low], [x + P.minimumBeats * beat, low], [x + P.backBeats * beat, back], [x + P.wholeBeats * beat, 1]);
    }
    if (pts.length < 3) continue;
    pts.push([t1 - e.t, 1]);
    // the note's own path, read at any second of it
    const own = e.p.gainPath;
    const ownAt = (s: number): number => {
      if (typeof own === 'number') return own;
      if (!Array.isArray(own) || own.length < 2) return 1;
      const o = own as number[];
      if (s <= o[0]) return o[1];
      for (let k = 2; k < o.length; k += 2) if (s <= o[k]) { const f = (s - o[k - 2]) / Math.max(1e-9, o[k] - o[k - 2]); return o[k - 1] + f * (o[k + 1] - o[k - 1]); }
      return o[o.length - 1];
    };
    const at = (s: number): number => {
      if (s <= pts[0][0] || s >= pts[pts.length - 1][0]) return 1;
      for (let k = 1; k < pts.length; k++) if (s <= pts[k][0]) { const f = (s - pts[k - 1][0]) / Math.max(1e-9, pts[k][0] - pts[k - 1][0]); return pts[k - 1][1] + f * (pts[k][1] - pts[k - 1][1]); }
      return 1;
    };
    const times = new Set<number>([0, ...pts.map(([s]) => s), ...(Array.isArray(own) ? (own as number[]).filter((_, k) => k % 2 === 0) : [])]);
    const path: number[] = [];
    for (const s of [...times].filter((s) => s >= 0).sort((a, b) => a - b)) path.push(+s.toFixed(4), +Math.min(4, ownAt(s) * at(s)).toFixed(4));
    e.p = { ...e.p, gainPath: path };
    n++;
  }
  return n;
}
