// **The top's quiet voices** (round top-voices-2, 11-02). His ear on the wave-1 sketches took eleven quiet players for
// the top end (T14 the chk, T16 the snap and its far answer, T17 the splash, T18 the tuned tick, T19 the talking
// percussion, T20 the puff, T26b the air bed, T27c the held hiss, T28 the wash, T30c the arcs, T38 the jingle). The
// sources' deep house keeps two to four quiet players sounding under the hat at once, and one of them arrives or leaves
// about every dozen bars; so a track never plays all of them:
//
// - **the set**: each theme draws three or four of them (four leaned by Spark and Veil), by the birds' leans on each
//   and by what the theme can carry (the chk only where a groove has no backbeat, the tuned tick only over acoustic
//   harmony, the jingle not at the dark end, the snap only in a break no backbeat holds, the arcs only where a break is
//   beatless and the pad stands still); under a drone in front only the air and the wash (the one-foreground rule);
// - **the rota's players**: the groove voices of the set come in and out on the 8-bar lines of the grooves, one change
//   on a line, about one change per 12 bars (Veil shortens the wait), never on a line the top form's own moves take,
//   two of them at most at once, silent while the top waits a phrase after a break (T04);
// - **the break's voices** play where their moment is: the snap through a break, its answer from a phrase in; the hiss
//   over a break's last bars, cut by the drop; the arcs in its beatless bars; the wash on about half the returns.
//
// The puff (T20) plays the hats' gaps or, by span, a figure of its own: a short call and its answer that returns every
// two or four bars, drawn among the row's `figures` (his word 11-02: "I wish we had some recipes for these … so it's not
// only rhythm follow … but sometimes it's own idea"). The talking percussion (T19) plays the same figures, the call to
// the left and the answer to the right.
//
// Levels are dB against the theme's own closed hat (its notes' 90th percentile), so a voice sits where the sketch he
// heard sat whatever the hat's lane level; nothing raises a level the theme had. Every draw is off a stream of its own
// (`<seed>::top:voices:…`): no other die moves.

import ROW_FILE from '../recipes/arrangement/top-voices.json' with { type: 'json' };
import { Rng } from './rng.ts';
import { lean } from './lean.ts';

type W = Record<string, number>;
type Leans = Record<string, W>;
interface RowPick { v: string; w: number; rel?: number; answer?: { room: number; delay: number }; ring?: { v: string; rel: number } }
interface VoiceRow {
  idea: string; where: 'groove' | 'break' | 'breakEnd' | 'beatless' | 'return'; weight: number; leans: Leans; rows: RowPick[];
  [k: string]: unknown;
}
export interface TopFigure { id: string; name: string; bars: number; hits: Array<[number, 'c' | 'a', number]>; leans: Leans; weight: number }
export interface TopVoicesRow {
  centre: Record<string, number>;
  tempo: { bpm: [number, number] };
  set: { size: number; four: number; fourLeans: Leans; grooveLeast: number; barsPerGrooveVoice: number };
  rota: { lines: number; gaps: number[]; short: W; atOnce: number; enter: number; leastBars: number };
  front: { admit: string[] };
  voices: Record<string, VoiceRow>;
  figures: TopFigure[];
}
export const TOP_VOICES: Readonly<TopVoicesRow> = ROW_FILE as unknown as TopVoicesRow;
export const TOP_VOICE_KEYS = Object.freeze(Object.keys(TOP_VOICES.voices));

export interface VEvent { t: number; voice: string; layer: string; p: Record<string, unknown>; bar?: number | null; step?: number | null; [k: string]: unknown }

export interface TopVoicesInput {
  seed: string | number;
  sections: ReadonlyArray<{ index: number; kind: string; startBar: number; bars: number }>;
  spell: Readonly<Record<string, number>>;
  bpm: number;
  barSeconds: number;
  bars: number;
  rootPc: number;
  /** a drone in front: only the air and the wash */
  front: boolean;
  /** the theme's events as they stand (the kit, the harmony, the break's holder) */
  events: readonly VEvent[];
  /** the top form's moves (the rota's turns and the structural moves), whose lines the voices keep off */
  top: { subs: ReadonlyArray<{ startBar: number; bars: number; top?: string }>; holder: string | null };
  /** a voice's lane level in this room, dB (the compiler's level table) */
  levelDb: (voice: string) => number;
  /** the layer a voice plays on */
  layerOf: (voice: string) => string;
  /** the stage's treatments on the harmonic lanes at a bar */
  treatAt: (bar: number) => readonly string[];
  /**
   * A row the request refuses (integration 11-02): a recipe forbids its family or one of its roles (the generator's
   * admission, as of a lane's sound). A voice none of whose rows the theme admits is not drawn; absent, every row is
   * admitted.
   */
  refuses?: (voice: string) => boolean;
  /**
   * an event of a part the listener asked for (a pin, a row asked by name): its feel is its own, so the voices take
   * their push from the theme's kit alone and a phrase the listener swaps moves nothing of theirs (integration 11-02)
   */
  asked?: (e: VEvent) => boolean;
  /** a noise lead-in of the glue's, which the held hiss leaves its return to (one lead-in a return) */
  leadIn?: (e: VEvent) => boolean;
  row?: Readonly<TopVoicesRow>;
}

export interface TopVoiceSpan { key: string; voice: string; from: number; to: number; mode?: string }
export interface TopVoicesPlan {
  set: string[];
  spans: TopVoiceSpan[];
  events: VEvent[];
  hatRef: number | null;
  summary: string;
}

const GROOVE = new Set(['main', 'drop']);
const dbToGain = (db: number) => Math.pow(10, db / 20);
const leanOf = (leans: Leans | undefined, choice: string, sp: Readonly<Record<string, number>>, C: Readonly<Record<string, number>>) => {
  let x = 1;
  for (const [bird, w] of Object.entries(leans ?? {})) x *= lean(w?.[choice], sp[bird], 1, C[bird] ?? 0.5);
  return x;
};

/** The theme's quiet top voices: the set, the rota's spans and the break's moments, as events. */
export function planTopVoices(I: TopVoicesInput): TopVoicesPlan | null {
  const R = I.row ?? TOP_VOICES, C = R.centre, sp = I.spell, V = R.voices;
  if (I.bpm < R.tempo.bpm[0] || I.bpm > R.tempo.bpm[1]) return null;
  const bs = I.barSeconds, st = bs / 16;
  const bird = (b: string) => (typeof sp[b] === 'number' ? sp[b] : C[b] ?? 0.5);
  const barOf = (e: VEvent) => (e.bar != null ? e.bar : Math.floor(e.t / bs + 1e-6));
  const stepOf = (e: VEvent) => (e.step != null ? e.step : Math.round((e.t - barOf(e) * bs) / st));

  // ----- what the theme plays, bar by bar -----
  const kick = new Set<number>(), clap = new Set<number>(), drums = new Set<number>(), keysAc = new Set<number>(), padSynth = new Set<number>();
  const beat = new Set<number>(), arcsUnder = new Set<string>(((V.arcs as VoiceRow & { under?: string[] } | undefined)?.under ?? []));
  const hatSteps = new Map<number, Set<number>>();
  const push: number[][] = Array.from({ length: 16 }, () => []);
  const hatDb: number[] = [];
  const tick = V.tick as VoiceRow & { acoustic: string[]; synthPads: string[] };
  const acoustic = (v: string) => tick.acoustic.includes(v) || /^piano|^keys(Rhodes|Ep|Suitcase|Reed|Tine)/.test(v);
  for (const e of I.events) {
    const b = barOf(e);
    if (e.layer === 'kick') kick.add(b);
    if (e.layer === 'clap') clap.add(b);
    if (e.layer === 'kick' || e.layer === 'hats' || e.layer === 'clap' || e.layer === 'shaker') drums.add(b);
    // (the arcs' beat: the kit, less a holder's hits the arcs' row lets them sound over (`under`); round hat-ceiling)
    if ((e.layer === 'kick' || e.layer === 'hats' || e.layer === 'clap' || e.layer === 'shaker') && !arcsUnder.has(String(e.by ?? ''))) beat.add(b);
    if (e.layer === 'keys' && acoustic(e.voice)) keysAc.add(b);
    if (e.layer === 'pad' && tick.synthPads.includes(e.voice)) padSynth.add(b);
    if (e.layer === 'hats' || e.layer === 'shaker') {
      const s = stepOf(e);
      (hatSteps.get(b) ?? hatSteps.set(b, new Set()).get(b)!).add(s);
      if (s >= 0 && s < 16 && e.step != null && !I.asked?.(e)) push[s].push(e.t - b * bs - s * st);
    }
    if (e.layer === 'hats' && !/open/i.test(e.voice) && !e.by) {
      const g = Number(e.p.gain ?? 1) * Number(e.p.vel ?? 1);
      if (g > 0) hatDb.push(I.levelDb(e.voice) + 20 * Math.log10(g));
    }
  }
  // (the top's voices are the kit's quiet players: a theme that plays no kit at all, a recipe's drumless theme among
  // them, has none; integration 11-02)
  if (!drums.size) return null;
  hatDb.sort((a, b) => a - b);
  const hatRef = hatDb.length ? hatDb[Math.floor(hatDb.length * 0.9)] : null;
  const ref = hatRef ?? -12;
  const pushOf = (s: number) => { const l = push[s].slice().sort((a, b) => a - b); return l.length ? l[Math.floor(l.length / 2)] : 0; };
  const timeOf = (bar: number, step: number) => +(bar * bs + step * st + pushOf(step)).toFixed(6);

  // the top form's lines (the rota's turns, the breather, the second drop, the staged entries) and the waiting bars
  const taken = new Set<number>(), waiting = new Set<number>();
  for (const x of I.top.subs) {
    // (the line the top opens on after a second drop is free: a voice may arrive with the air)
    if (x.top === 'rota' || x.top === 'breather' || x.top === 'steps') { taken.add(x.startBar); taken.add(x.startBar + x.bars); }
    if (x.top === 'second-drop') taken.add(x.startBar);
    if (x.top === 'second-drop') for (let b = x.startBar; b < x.startBar + x.bars; b++) waiting.add(b);
  }

  // ----- the runs of groove (adjacent mains and drops) -----
  const runs: Array<{ from: number; to: number }> = [];
  for (const s of I.sections) {
    if (!GROOVE.has(s.kind)) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === s.startBar) last.to = s.startBar + s.bars;
    else runs.push({ from: s.startBar, to: s.startBar + s.bars });
  }
  const grooveBars: number[] = runs.flatMap((r) => Array.from({ length: r.to - r.from }, (_, k) => r.from + k));
  const breaks = I.sections.filter((s) => s.kind === 'breakdown');
  const lastBar = Math.max(...I.sections.map((s) => s.startBar + s.bars));

  // ----- the set -----
  // (each voice's rows the theme admits: the list as written where nothing is refused, so no draw moves there)
  const rowsOf: Record<string, RowPick[]> = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, I.refuses ? v.rows.filter((r) => !I.refuses!(r.v)) : v.rows]));
  const can: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(V)) {
    let ok = rowsOf[k].length > 0;
    if (I.front && !R.front.admit.includes(k)) ok = false;
    if (v.where === 'groove' && !runs.some((r) => r.to - r.from >= R.rota.leastBars)) ok = false;
    if (k === 'chk') ok &&= grooveBars.filter((b) => !clap.has(b)).length >= 16;
    if (k === 'tick') ok &&= grooveBars.filter((b) => keysAc.has(b) && !padSynth.has(b)).length >= 16;
    if (k === 'jingle') ok &&= bird('zephyr') >= Number(v.zephyrLeast ?? 0);
    if (k === 'snap') ok &&= I.top.holder !== 'backbeat' && breaks.some((s) => s.bars >= Number(v.leastBars) && !range(s.startBar, s.startBar + s.bars).some((b) => clap.has(b)));
    if (k === 'hiss') ok &&= breaks.some((s) => s.bars >= Number(v.leastBars) && s.startBar + s.bars < lastBar);
    if (k === 'arcs') ok &&= breaks.some((s) => range(s.startBar, s.startBar + s.bars).filter((b) => !beat.has(b) && !moving(b)).length >= 4);
    if (k === 'wash') ok &&= I.sections.some((s, i) => GROOVE.has(s.kind) && i > 0 && (I.sections[i - 1].kind === 'breakdown' || I.sections[i - 1].kind === 'build'));
    can[k] = ok;
  }
  function moving(b: number) { const m = (V.arcs as VoiceRow & { moving: string[] }).moving; return I.treatAt(b).some((x) => m.some((y) => x.includes(y))); }
  const rs = new Rng(`${I.seed}::top:voices:set`);
  const size = Math.min(4, R.set.size + (rs.chance(Math.min(1, R.set.four * leanOf(R.set.fourLeans, 'on', sp, C))) ? 1 : 0));
  const weightOf = (k: string) => V[k].weight * leanOf(V[k].leans, 'on', sp, C);
  const set: string[] = [];
  // (as many groove players as the grooves have room to turn: one for every 24 bars of groove, so none is drawn silent)
  const grooveCap = Math.max(1, Math.round(grooveBars.length / R.set.barsPerGrooveVoice));
  const grooves = () => set.filter((k) => V[k].where === 'groove').length;
  const open = (k: string) => can[k] && !set.includes(k) && weightOf(k) > 0 && (V[k].where !== 'groove' || grooves() < grooveCap);
  const draw = (pool: string[]) => { const p = pool.filter(open); if (p.length) set.push(rs.weighted(p.map((k) => ({ v: k, w: weightOf(k) })))); };
  for (let i = 0; i < R.set.grooveLeast; i++) draw(Object.keys(V).filter((k) => V[k].where === 'groove'));
  while (set.length < size && Object.keys(V).some(open)) draw(Object.keys(V));
  if (!set.length) return null;

  // each voice's row, drawn once a theme
  const rowOf: Record<string, RowPick> = {};
  for (const k of set) {
    const r = new Rng(`${I.seed}::top:voices:row:${k}`).weighted(rowsOf[k].map((r) => ({ v: r, w: r.w })));
    // (the wash's high ring is a voice of its own: refused, the wash plays alone)
    rowOf[k] = r.ring && I.refuses?.(r.ring.v) ? { ...r, ring: undefined } : r;
  }

  const out: VEvent[] = [];
  const spans: TopVoiceSpan[] = [];
  const said: string[] = [];
  const gainOf = (voice: string, rel: number, vel: number) => +(dbToGain(ref + rel - I.levelDb(voice)) / vel).toFixed(6);
  const hit = (key: string, voice: string, bar: number, step: number, rel: number, vel: number, extra: Record<string, unknown> = {}, label = key) => {
    out.push({ t: timeOf(bar, step), voice, layer: I.layerOf(voice), bar, step, p: { vel, gain: gainOf(voice, rel, vel), ...extra }, by: `top-voices/${key}`, label: `the top's ${label}` });
  };

  // ----- the figures (T20's recipes, T19's call and answer) -----
  const figureFor = (key: string, a: number) => {
    const F = R.figures.map((f) => ({ v: f, w: f.weight * leanOf(f.leans, 'on', sp, C) })).filter((x) => x.w > 0);
    return new Rng(`${I.seed}::top:voices:figure:${key}:${a}`).weighted(F);
  };
  const playFigure = (key: string, voice: string, a: number, z: number, F: TopFigure, rel: number, vel: number, pan: number | null, extra: Record<string, unknown> = {}) => {
    for (let b0 = a; b0 + F.bars <= z; b0 += F.bars) for (const [at, side, db] of F.hits) {
      const bar = b0 + Math.floor(at / 16), step = at % 16;
      if (waiting.has(bar)) continue;
      hit(key, voice, bar, step, rel + db, vel, { ...extra, ...(pan != null ? { pan: side === 'c' ? -pan : pan } : {}) }, `${key} (${F.name})`);
    }
  };

  // ----- a groove voice over its span -----
  const lay = (key: string, a: number, z: number): TopVoiceSpan => {
    const v = V[key], r = rowOf[key], vel = Number(v.vel ?? 0.9);
    const span: TopVoiceSpan = { key, voice: r.v, from: a, to: z };
    const rr = new Rng(`${I.seed}::top:voices:play:${key}:${a}`);
    const bars = range(a, z).filter((b) => !waiting.has(b));
    if (key === 'chk') for (const b of bars) { if (!clap.has(b)) for (const s of v.steps as number[]) hit(key, r.v, b, s, Number(v.rel), vel); }
    else if (key === 'splash') for (const b of bars) { if ((b - a) % 2 === 1) hit(key, r.v, b, 0, r.rel ?? -15, vel); }
    else if (key === 'tick') {
      const m = 108 + (((I.rootPc % 12) + 12) % 12), g = 108 + ((((I.rootPc + 7) % 12) + 12) % 12), wander = [0, 3, 7, 5, 0, -2, 3, 0];
      for (const b of bars) {
        if (!keysAc.has(b) || padSynth.has(b)) continue;
        const k = b - a;
        if (r.v === 'tickTuned') for (const [s, pan, db] of (k % 2 ? [[7, -0.5, 0], [11, 0, -3], [15, -0.5, -2]] : [[7, -0.5, 0], [13, 0, -3]])) hit(key, r.v, b, s, (r.rel ?? -12) + db, vel, { midi: m, strikePan: pan });
        else if (r.v === 'glint') { if (k % 2 === 1) for (const [s, db] of [[0, 0], [1, -4], [2, -8]]) hit(key, r.v, b, s, (r.rel ?? -12) + db, vel, { midi: g, strikePan: 0.2 }); }
        else hit(key, r.v, b, 13, r.rel ?? -12, vel, { midi: 100 + (((I.rootPc % 12) + 12) % 12) + wander[k % wander.length], strikePan: 0.6 });
      }
    } else if (key === 'talk') {
      const F = figureFor(key, a);
      span.mode = F.id;
      playFigure(key, r.v, a, z, F, r.rel ?? -17, vel, Number(v.pan), { room: v.room });
    } else if (key === 'puff') {
      const G = v.gaps as { prefer: number[]; second: number; secondDb: number; spreadDb: number };
      if (rr.chance(Number(v.figure))) {
        const F = figureFor(key, a);
        span.mode = F.id;
        playFigure(key, r.v, a, z, F, r.rel ?? -16, vel, null);
      } else {
        span.mode = 'gaps';
        for (const b of bars) {
          const hs = hatSteps.get(b) ?? new Set<number>();
          const free = G.prefer.filter((s) => !hs.has(s) && !hs.has(s - 1));
          if (!free.length) continue;
          hit(key, r.v, b, free[0], (r.rel ?? -16) + rr.float(-G.spreadDb, G.spreadDb) / 2, vel, {}, 'puff (in the hats\' gaps)');
          if ((b - a) % 2 === 1 && free.length > 1 && rr.chance(G.second)) hit(key, r.v, b, free[1], (r.rel ?? -16) + G.secondDb + rr.float(-G.spreadDb, G.spreadDb) / 2, vel, {}, 'puff (in the hats\' gaps)');
        }
      }
    } else if (key === 'jingle') {
      const D = v.down as { steps: number[]; rel: number; vel: number }, O = v.off as { steps: number[]; rel: number; vel: number };
      for (const b of bars) if ((b - a) % 2 === 0) { for (const s of D.steps) hit(key, r.v, b, s, D.rel, D.vel); for (const s of O.steps) hit(key, r.v, b, s, O.rel, O.vel); }
    } else if (key === 'bed') {
      // one bed over the span (the waiting bars leave it out: it starts after them), ducked on the kick's beats
      const b0 = bars[0];
      if (b0 != null) {
        const dur = (z - b0) * bs, pumped = range(b0, z).some((b) => kick.has(b));
        out.push({ t: +(b0 * bs).toFixed(6), voice: r.v, layer: I.layerOf(r.v), bar: b0, step: 0, by: `top-voices/${key}`, label: 'the top\'s air bed',
          p: { shape: 'bed', dur: +dur.toFixed(4), attack: +(Number(v.attackBars) * bs).toFixed(4), gain: gainOf(r.v, r.rel ?? -2.5, 1),
            ...(pumped ? { pumpBeat: +(bs / 4).toFixed(6), pumpDb: Number(v.pumpDb) } : {}) } });
        span.from = b0;
      }
    }
    return span;
  };

  // ----- the rota: the set's groove voices in and out on the lines -----
  const grooveSet = set.filter((k) => V[k].where === 'groove');
  if (grooveSet.length) {
    const Q = R.rota;
    const entered = new Map<string, number>();
    const pShort = Math.max(0, Math.min(1, 0.5 * leanOf({ veil: { on: Q.short.veil ?? 1 } }, 'on', sp, C)));
    // (the players a groove ends with come back with the kit after the break, where the top opens: the break is the
    // section's change, not the rota's)
    const playing = new Map<string, number>();
    for (const run of runs) {
      for (const k of [...playing.keys()]) playing.set(k, run.from);
      if (run.to - run.from < Q.leastBars) {
        for (const [k, from] of playing) spans.push(lay(k, from, run.to));
        continue;
      }
      const rr = new Rng(`${I.seed}::top:voices:rota:${run.from}`);
      let next = run.from + Q.lines;
      for (let L = run.from + Q.lines; L < run.to; L += Q.lines) {
        if (L < next || taken.has(L) || waiting.has(L)) continue;
        // (an entry needs a phrase of the run ahead of it to be heard)
        const idle = grooveSet.filter((k) => !playing.has(k));
        let enter = playing.size === 0 ? true : playing.size >= Q.atOnce ? false : rr.chance(Q.enter);
        if (enter && (!idle.length || run.to - L < Q.lines)) enter = false;
        if (enter) {
          const least = Math.min(...idle.map((k) => entered.get(k) ?? 0));
          const pool = idle.filter((k) => (entered.get(k) ?? 0) === least);
          const k = rr.weighted(pool.map((x) => ({ v: x, w: weightOf(x) })));
          playing.set(k, L);
          entered.set(k, (entered.get(k) ?? 0) + 1);
        } else if (playing.size) {
          const [k, from] = [...playing].sort((x, y) => x[1] - y[1])[0];
          playing.delete(k);
          spans.push(lay(k, from, L));
        } else continue;
        next = L + (rr.chance(pShort) ? Q.gaps[0] : Q.gaps[Q.gaps.length - 1]);
      }
      for (const [k, from] of playing) spans.push(lay(k, from, run.to));
    }
  }

  // ----- the break's voices -----
  if (set.includes('snap')) {
    const v = V.snap as VoiceRow & { leastBars: number; step: number; answerStep: number; delay: { base: number; tide: number; least: number; most: number }; vel: number };
    const r = rowOf.snap, vel = v.vel;
    const pDelay = Math.max(v.delay.least, Math.min(v.delay.most, v.delay.base + v.delay.tide * (bird('tide') - (C.tide ?? 0.5))));
    const how = new Rng(`${I.seed}::top:voices:snap`).chance(pDelay) ? 'delay' : 'room';
    for (const s of breaks) {
      const z = s.startBar + s.bars;
      if (s.bars < v.leastBars || range(s.startBar, z).some((b) => clap.has(b))) continue;
      const from = s.startBar + (s.bars >= 16 ? 8 : 4);
      for (let b = s.startBar; b < z - 1; b++) {
        hit('snap', r.v, b, v.step, r.rel ?? -3, vel, { pan: 0, room: 0 }, 'snap');
        if (b >= from) hit('snap', r.v, b, v.answerStep, r.answer?.[how] ?? -8, vel,
          how === 'delay' ? { pan: 0, dry: 0, room: 0, delay: 1, reverb: 0.3 } : { pan: 0, dry: 0, room: 0, reverb: 1 }, `snap's far answer (${how})`);
      }
      spans.push({ key: 'snap', voice: r.v, from: s.startBar, to: z - 1, mode: how });
    }
  }
  if (set.includes('hiss')) {
    const v = V.hiss as VoiceRow & { bars: number; attack: number; chance: number; leastBars: number };
    const r = rowOf.hiss;
    for (const s of breaks) {
      const z = s.startBar + s.bars;
      if (s.bars < v.leastBars || z >= lastBar || !new Rng(`${I.seed}::top:voices:hiss:${s.startBar}`).chance(v.chance)) continue;
      const a = z - v.bars;
      // (a return the glue already leads in by a noise, a riser or a swell over these bars or one ending on the line, is
      // that lead-in's: the hiss is the break's held air, never a second lead-in; integration 11-02)
      const A = a * bs - 1e-6, Z = z * bs + 1e-6;
      if (I.leadIn && I.events.some((e) => I.leadIn!(e) && e.t < Z && e.t + Number(e.p.dur ?? 0) > A)) continue;
      out.push({ t: +(a * bs).toFixed(6), voice: r.v, layer: I.layerOf(r.v), bar: a, step: 0, by: 'top-voices/hiss', label: 'the top\'s held hiss',
        p: { flat: 1, attack: v.attack, dur: +(v.bars * bs).toFixed(4), gain: gainOf(r.v, r.rel ?? -1, 1) } });
      spans.push({ key: 'hiss', voice: r.v, from: a, to: z });
    }
  }
  if (set.includes('arcs')) {
    const v = V.arcs as VoiceRow & { every: number; arcs: number[][] };
    const r = rowOf.arcs;
    const snapBars = new Set(spans.filter((x) => x.key === 'snap').flatMap((x) => range(x.from, x.to)));
    for (const s of breaks) {
      // the beatless runs of the break, the pad standing still
      let a = -1;
      const flush = (z: number) => {
        if (a >= 0 && z - a >= 4) for (let b0 = a; b0 < z; b0 += v.every) for (const [o, n] of v.arcs) {
          const b = b0 + o;
          if (b + n > z) continue;
          out.push({ t: +(b * bs).toFixed(6), voice: r.v, layer: I.layerOf(r.v), bar: b, step: 0, by: 'top-voices/arcs', label: 'the top\'s arc of air', p: { shape: 'swell', dur: +(n * bs).toFixed(4), gain: gainOf(r.v, r.rel ?? -2.5, 1) } });
          spans.push({ key: 'arcs', voice: r.v, from: b, to: b + n });
        }
        a = -1;
      };
      for (let b = s.startBar; b < s.startBar + s.bars; b++) {
        const ok = !beat.has(b) && !snapBars.has(b) && !moving(b);
        if (ok && a < 0) a = b;
        if (!ok) flush(b);
      }
      flush(s.startBar + s.bars);
    }
  }
  if (set.includes('wash')) {
    const v = V.wash as VoiceRow & { chance: number; chanceLeans: Leans; reverb: Record<string, number>; vel: number };
    const r = rowOf.wash;
    const p = Math.min(1, v.chance * leanOf(v.chanceLeans, 'on', sp, C));
    I.sections.forEach((s, i) => {
      if (!GROOVE.has(s.kind) || i === 0 || !(I.sections[i - 1].kind === 'breakdown' || I.sections[i - 1].kind === 'build')) return;
      if (!new Rng(`${I.seed}::top:voices:wash:${s.startBar}`).chance(p)) return;
      hit('wash', r.v, s.startBar, 0, r.rel ?? -19, v.vel, { pan: 0, reverb: v.reverb[r.v] ?? 0.4 }, 'wash at the kick\'s return');
      if (r.ring) hit('wash', r.ring.v, s.startBar, 0, r.ring.rel, v.vel, { midi: 108 + ((((I.rootPc + 7) % 12) + 12) % 12), strikePan: 0.15 }, 'ring at the kick\'s return');
      spans.push({ key: 'wash', voice: r.v, from: s.startBar, to: s.startBar + 1 });
    });
  }

  // (a groove span the top's wait covers whole plays nothing)
  for (let i = spans.length - 1; i >= 0; i--) if (V[spans[i].key].where === 'groove' && !range(spans[i].from, spans[i].to).some((b) => !waiting.has(b))) spans.splice(i, 1);
  spans.sort((a, b) => a.from - b.from || a.key.localeCompare(b.key));
  const by = new Map<string, string[]>();
  for (const x of spans) (by.get(x.key) ?? by.set(x.key, []).get(x.key)!).push(x.to - x.from > 1 ? `${x.from}-${x.to}` : `${x.from}`);
  said.push(`the top's voices: ${set.map((k) => `${k} (${rowOf[k].v})`).join(', ')}`);
  for (const [k, l] of by) said.push(`${k}: ${l.join(' ')}`);
  return { set, spans, events: out, hatRef, summary: said.join(' · ') };
}

function range(a: number, z: number): number[] { return Array.from({ length: Math.max(0, z - a) }, (_, k) => a + k); }
