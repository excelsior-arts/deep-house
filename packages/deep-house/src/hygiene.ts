// **The arrangement's hygiene** (PLAN-UNIFY U1: §1.8 the long-hold fade, §1.17 the gap filler): the two repairs every
// house-v2 position gets, in the time helper's units (`src/musical-time.ts`) and leaned by the one lean (`src/lean.ts`).
//
//   - **A long hold fades, never stops.** A held chord or pad that ends while the music goes on fades over its last
//     stretch, a squared level path (some 12 dB down halfway), and rings on past its written end where nothing harmonic
//     follows. The fade is a duration the ear hears, so it is written in seconds out of bars: 1.5 bars held between 2 s
//     and 5 s (2.1 s at 174 BPM, 3.4 s at 105, 5 s at 50), leaned by Tide. `fadeHolds` is the one rule: the producer's
//     passage plays it at the fast places (its row's `holds`, with the ease into a next strike it was approved with),
//     and `applyHygiene` everywhere else, where it repairs only what would stop — a hold whose own release is shorter
//     than the fade it wants and that nothing harmonic takes over within a felt beat (the program guards' `stop`).
//   - **No groove goes bare.** Where the groove (a main, a drop or a build: the drums or the bass playing) would run
//     with nothing harmonic, melodic or textural over it for longer than 4 bars or 8 s, whichever is shorter, a quiet
//     bed is laid: the theme's own held chord over the chord in force, swelling in from the bar before. A sparse texture
//     (a struck bell, a marimba) is present: nothing is laid over it. The fast places' producer lays its own (its row's
//     `arc.filler`, the same rule in its own units).
//
// Nothing here names a place, a genre or a seed.
import HYGIENE_FILE from '../recipes/arrangement/hygiene.json' with { type: 'json' };
import { dbToGain } from '@deep-house/engine/dsp';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';
import { clampS, type MusicalTime } from './musical-time.ts';
import { lean, centreOf, strengthOf, type LeanRow } from './lean.ts';
import type { PlanEvent } from './generator.ts';

/** A long hold's fade, in the row's units: `fadeBars` held between `fadeLeastS` and `fadeMostS`, then leaned by its birds. */
export interface FadeRow { fadeBars: number; fadeLeastS: number; fadeMostS: number; lean?: LeanRow }
export interface HoldsRow extends FadeRow { leastS: number; tailShare: number; handoverFeltBeats: number; layers: string[]; skipRoles: string[]; leastBpm: number; skipScenes: string[] }
export interface GapsRow { emptyBars: number; emptyMostS: number; fillerBars: number; leastBars: number; levelDb: number; attackS: number; layers: string[]; hatsLeast: number; bassMoves: number }
export interface HygieneRow { id: string; name: string; holds: HoldsRow; gaps: GapsRow }

const FILE = HYGIENE_FILE as unknown as { rows: HygieneRow[] };
/** The hygiene rows, by id (`recipes/arrangement/hygiene.json`). */
export const HYGIENE_ROWS: Readonly<Record<string, HygieneRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/** Every bird of a lean row on one knob: the product of the one lean, each bird about the row's centre. */
const leanOn = (row: LeanRow | undefined, spell: Readonly<Record<string, number>>): number => {
  if (!row) return 1;
  const s = strengthOf(row), c = centreOf(row);
  let x = 1;
  for (const [bird, v] of Object.entries(row)) if (bird !== 'centre' && bird !== 'strength' && typeof v === 'number') x *= lean(v, spell[bird], s, c);
  return x;
};

/**
 * **The fade a long hold wants, in seconds**: `fadeBars` of the theme's bars held between `fadeLeastS` and `fadeMostS`,
 * then leaned by the row's birds (Tide: a wetter field rings longer). At a bird value on the row's centre the lean is
 * exactly one, so a place whose bars land inside the bounds plays `fadeBars` bars to the bit.
 */
export const fadeSOf = (T: Pick<MusicalTime, 'barS'>, H: FadeRow, spell: Readonly<Record<string, number>>): number =>
  clampS(T as MusicalTime, H.fadeBars, 'bars', H.fadeLeastS, H.fadeMostS) * leanOn(H.lean, spell);

const round = (v: number, n = 5) => +v.toFixed(n);

/** The squared fall over a note's last stretch: flat to `f0`, then six steps down to nothing at `D` (seconds into the note). */
export function fadePath(D: number, fadeS: number): number[] {
  const f0 = Math.max(D * 0.35, D - fadeS), path = [0, 1, round(f0, 4), 1];
  for (let k = 1; k <= 6; k++) path.push(round(f0 + (D - f0) * k / 6, 4), round((1 - k / 6) ** 2, 4));
  return path;
}

export interface FadeHoldsInput {
  /** the fade, the ring past a written end where nothing harmonic follows, and the handover window, in seconds */
  fadeS: number; tailS: number; handoverS: number;
  /** the shortest hold that fades */
  leastS: number;
  /** a hold that ends into the next strike eases this many dB into it over its last `easeS` (the producer's), or is left (null) */
  easeDb: number | null; easeS: number;
  /** the shortest harmonic note whose onset counts as a next strike, and how far before the theme's last onset a hold must end */
  onsetLeastS: number; endMarginS: number;
  /** the holds, and the harmony they hand over to (the holds themselves where no other is named) */
  harmonic: (e: PlanEvent) => boolean;
  onset?: (e: PlanEvent) => boolean;
  /** the stretch of the track the pass rewrites (an onset inside it) */
  inWindow: (t: number) => boolean;
  /** a hold that would stop and is repaired (the rest left as they are); every one where none is named */
  wants?: (e: PlanEvent) => boolean;
  /** the next chord change after a time (seconds), where the ring past an end must stop short of it; none where not named */
  nextChangeS?: (t: number) => number;
  /** a hold that does not ring past its end keeps its duration to the bit (the producer's passage rounds it, as it always did) */
  keepDur?: boolean;
  note?: (what: string) => void;
}

/**
 * **Long holds fade, never stop** (§1.8): every hold of `leastS` or more that ends while the music goes on (before the
 * theme's last onset, less `endMarginS`) and carries no level path yet either eases into the next harmonic strike within
 * `handoverS` of its end (where the input names an ease) or fades over its last `fadeS`, rung on past its end by up to
 * `tailS` where nothing harmonic follows (to 50 ms before the next harmonic onset). Rewrites the events in place.
 */
export function fadeHolds(events: PlanEvent[], I: FadeHoldsInput): void {
  const live = events.filter((e) => !e.p.gone);
  const onsets = live.filter((e) => (I.onset ?? I.harmonic)(e) && Number(e.p.dur) >= I.onsetLeastS).map((e) => e.t).sort((a, b) => a - b);
  const lastOn = Math.max(...live.map((e) => e.t));
  for (const e of live) {
    if (!I.harmonic(e) || !I.inWindow(e.t) || Array.isArray(e.p.gainPath)) continue;
    const d = Number(e.p.dur);
    if (!(d >= I.leastS)) continue;
    const end = e.t + d;
    if (end > lastOn - I.endMarginS) continue;
    if (onsets.some((t) => t > e.t + 0.5 && Math.abs(t - end) <= I.handoverS)) {
      if (I.easeDb == null) continue;
      const f0 = Math.max(d * 0.5, d - I.easeS);
      e.p = { ...e.p, gainPath: [0, 1, round(f0, 4), 1, round(d, 4), round(dbToGain(I.easeDb), 4)] };
      I.note?.('hold eased into the next strike');
      continue;
    }
    if (I.wants && !I.wants(e)) continue;
    const nextOn = onsets.find((t) => t > end + 1e-3) ?? Infinity;
    const D = d + Math.max(0, Math.min(I.tailS, nextOn - end - 0.05, (I.nextChangeS?.(end - 1e-3) ?? Infinity) - end - 0.05));
    e.p = { ...e.p, dur: I.keepDur && D === d ? e.p.dur : round(D, 4), gainPath: fadePath(D, I.fadeS) };
    I.note?.('hold faded');
  }
}

/** What the generator hands the pass: the theme's time, form, harmony and birds, its events (rewritten in place), and each voice's release. */
export interface HygieneInput {
  row: HygieneRow;
  events: PlanEvent[];
  bars: number;
  time: MusicalTime;
  spell: Readonly<Record<string, number>>;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  /** the chord in force at a bar (its label), and the bars it changes at */
  chordAt: (bar: number) => string;
  /** a note's release in seconds, as it says or as its voice's settings do; null where neither says */
  releaseOf: (e: PlanEvent) => number | null;
  /** the theme's scene (`composition.trace.scene`): a scene the row names keeps its holds as they are */
  scene?: string | null;
  /** a grammar's own notes, which shape their own holds and endings (the ambient bed's): left as they are */
  ownShape?: (e: PlanEvent) => boolean;
  noteName: (midi: number) => string;
}
export interface HygieneResult { faded: number; fillers: Array<{ from: number; to: number; bare: [number, number]; voice: string; notes: number }>; bare: Array<[number, number]> }

const DRUMS = new Set(['kick', 'clap', 'hats', 'shaker', 'perc']);
/** The harmonic and melodic layers: what holds a chord or sings a line (the program guards' own list). */
const TONAL = new Set(['keys', 'pad', 'lead', 'stab', 'arp', 'pluck', 'piano', 'bell', 'vocal', 'strings', 'melodic']);
const tonal = (e: PlanEvent) => TONAL.has(e.layer ?? '') && typeof e.p.midi === 'number';
/** What holds the space when no chord or line does: any harmonic or melodic note (a sparse texture too), an arranged texture, a weather or a vinyl bed. */
const present = (e: PlanEvent) => tonal(e) || e.part === 'texture' || (e.layer === 'fx' && /weather|vinyl|airBed/i.test(e.voice));
const GROOVE = new Set(['main', 'drop', 'build']);

/**
 * **The hygiene pass** at a position the producer does not arrange: first the bare grooves bedded (`row.gaps`), then the
 * holds that would stop faded (`row.holds`). Rewrites the events in place and says what it did.
 */
export function applyHygiene(I: HygieneInput): HygieneResult {
  const { row, time: T } = I;
  const bs = T.barS, ev = I.events;
  const fadeS = fadeSOf(T, row.holds, I.spell);
  const out: HygieneResult = { faded: 0, fillers: [], bare: [] };
  const sections = [...I.sections].sort((a, b) => a.startBar - b.startBar);
  const kindAt = (b: number) => sections.find((s) => b >= s.startBar && b < s.startBar + s.bars)?.kind ?? 'outro';

  // ----- the gaps: a bed where the groove would go bare -----
  const G = row.gaps;
  const live = ev.filter((e) => !e.p.gone);
  const covered = new Uint8Array(I.bars + 1), groove = new Uint8Array(I.bars + 1);
  // a moving bass line and a groove of ticking hats hold the space too (his ear on U0's guards, 10-13: the bass and the
  // hats of a break are "a solid break", not a hole): a bar of `bassMoves` bass pitches or more, or of `hatsLeast` hats
  const hats = new Uint16Array(I.bars + 1), bassPitches = Array.from({ length: I.bars + 1 }, () => new Set<number>());
  let firstTonal = Infinity;
  for (const e of live) {
    const a = Math.floor(e.t / bs + 1e-6);
    if (a >= 0 && a <= I.bars && e.layer === 'hats') hats[a]++;
    if (a >= 0 && a <= I.bars && e.layer === 'bass' && typeof e.p.midi === 'number') bassPitches[a].add(e.p.midi);
    if (present(e)) {
      if (tonal(e)) firstTonal = Math.min(firstTonal, a);
      const z = Math.min(I.bars, Math.floor((e.t + Number(e.p.dur ?? 0) + Math.min(I.releaseOf(e) ?? 0, bs)) / bs - 1e-6));
      for (let b = Math.max(0, a); b <= z; b++) covered[b] = 1;
    } else if (DRUMS.has(e.layer ?? '') && a >= 0 && a <= I.bars) groove[a] = 1;
    else if (e.layer === 'bass' && typeof e.p.midi === 'number') {
      const z = Math.min(I.bars, Math.floor((e.t + Number(e.p.dur ?? 0)) / bs - 1e-6));
      for (let b = Math.max(0, a); b <= z; b++) groove[b] = 1;
    }
  }
  for (let b = 0; b <= I.bars; b++) if (hats[b] >= G.hatsLeast || bassPitches[b].size >= G.bassMoves) covered[b] = 1;
  const grooveAt = (b: number) => groove[b] === 1 && GROOVE.has(kindAt(b)) && b >= firstTonal;
  const mostBare = Math.min(G.emptyBars, G.emptyMostS / bs);
  // the theme's own held chords: each voice's notes struck together on a held layer, a bar or longer, by the chord in force
  const chords = new Map<string, PlanEvent[]>();
  for (const e of live) {
    if (!G.layers.includes(e.layer ?? '') || !tonal(e) || row.holds.skipRoles.includes(e.role ?? '') || Number(e.p.dur) < bs || I.ownShape?.(e)) continue;
    const k = `${e.voice}|${Math.round(e.t * 100)}`;
    const l = chords.get(k); if (l) l.push(e); else chords.set(k, [e]);
  }
  const changes: number[] = [];
  for (let b = 1; b < I.bars; b++) if (I.chordAt(b) !== I.chordAt(b - 1)) changes.push(b);
  const nextChange = (bar: number) => changes.find((b) => b > bar) ?? I.bars;
  for (let b = 0; b < I.bars; b++) {
    if (!grooveAt(b) || covered[b]) continue;
    let z = b;
    while (z < I.bars && grooveAt(z) && !covered[z]) z++;
    if (z - b > mostBare) {
      out.bare.push([b, z - 1]);
      const a = Math.max(0, b - 1), e = Math.min(nextChange(a), a + Math.min(z - a + 1, G.fillerBars));
      const label = I.chordAt(a);
      const near = [...chords.values()].filter((g) => I.chordAt(Math.floor(g[0].t / bs + 1e-6)) === label)
        .sort((x, y) => Math.abs(x[0].t - a * bs) - Math.abs(y[0].t - a * bs) || x[0].t - y[0].t)[0];
      if (near && e - a >= G.leastBars) {
        const D = (e - a) * bs;
        for (const n of near) {
          const { swell: _swell, gainPath: _gp, ...p0 } = n.p as NoteParams & { swell?: unknown; gainPath?: unknown };
          ev.push({ ...n, t: round(a * bs, 6), bar: a, step: 0, part: 'hygiene-bed', label: `a bed where the groove went bare (${b}-${z - 1})`,
            p: { ...p0, dur: round(D, 4), attack: Math.max(Number(p0.attack ?? 0), G.attackS), gain: round(Number(p0.gain ?? 1) * dbToGain(G.levelDb), 6), gainPath: fadePath(D, fadeS) } });
        }
        for (let x = a; x < e; x++) covered[x] = 1;
        out.fillers.push({ from: a, to: e, bare: [b, z - 1], voice: near[0].voice, notes: near.length });
      }
    }
    b = z;
  }
  if (out.fillers.length) ev.sort((x, y) => x.t - y.t);

  // ----- the holds: a fade where one would stop -----
  // not on the slow side (his ear on U0's guards, 10-13: the ambient's cut notes are "an artistic way of delivering
  // pads"; the Ambient tile and 27191 play them as they are): from `leastBpm` up
  const H = row.holds;
  // nor where the held layer in front is the drone (his ear, 10-13: Spark and Loom high, seed 10, a drone people like;
  // keep the combo): a drone-forward scene's held chords end as they were written
  if (T.bpm >= H.leastBpm && !H.skipScenes.includes(I.scene ?? '')) fadeHolds(ev, {
    fadeS, tailS: fadeS * H.tailShare, handoverS: H.handoverFeltBeats * T.feltBeatS + 1e-6, leastS: H.leastS,
    easeDb: null, easeS: 0, onsetLeastS: T.beatS, endMarginS: bs,
    harmonic: (e) => tonal(e) && H.layers.includes(e.layer ?? '') && !H.skipRoles.includes(e.role ?? '') && e.voice !== 'wordlessVocal' && !I.ownShape?.(e),
    onset: tonal,
    inWindow: () => true,
    wants: (e) => { const r = I.releaseOf(e); return r != null && r < fadeS; },
    // a hold rings on past its end only up to the next chord change (a pad never crosses one)
    nextChangeS: (t) => (nextChange(Math.floor(t / bs + 1e-6)) * bs),
    keepDur: true,
    note: (w) => { if (w === 'hold faded') out.faded++; },
  });
  return out;
}
