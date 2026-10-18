// **The hats' transition vocabulary** (his word 10-16 on house seed 35: "space is huge, so congas fill in well that
// upper mid freq, that said we could explore a bit more interesting hi-hat patterns in sub-segments transitions").
// At the bar into each of the arrangement's sub-segments and out of it, into and out of the house's own hat variations,
// and where a noise transition was refused (`src/seams.ts`: the drum work in its place), the hats play one row of
// `recipes/arrangement/hat-moves.json` — an open-hat lift, a roll that thins, a flam, a swung push, a choke pattern, a
// ride-like swap, a pedal's ghosts, a triplet, a gap that answers the hand part — drawn per transition off a
// stream of its own, leaned by the birds, never the same move twice in a row within a theme. A move is a sub-section
// (`src/subsections.ts`) on the hats' own lanes: every hit a copy of one the theme's hats already play. The phrasing
// (`src/phrasing.ts`) says where the transitions are and which bars a gesture, a stop or the house's own small things
// own; nothing here names a place, a genre or a seed.
//
// **The scene** (round hat-scene, his word 10-16: "voices give it a main gravity that hats can work of on segments while
// adding their accents for vectors of track change upward/downward/seam on similar segment parts"): each transition
// carries the vector the voices make across it (`src/hat-scene.ts`), and a row's `vectors` lean it — a lift, a building
// roll, a triplet into more; a thinning, a choke, a gap, a roll that thins into less; on a level seam a small answer to
// the figure (`answer`: the closed hats stepping off the figure's strikes and answering each in its gap). Where the
// bar's voices are busy the busy rows are kept out, as they are out of the hand player's room.
import HAT_FILE from '../recipes/arrangement/hat-moves.json' with { type: 'json' };
import { Rng } from './rng.ts';
import { lean } from './lean.ts';
import type { Recipe } from './recipe.ts';
import type { SubSection } from './subsections.ts';
import type { LaneEdit, Letter } from './treatment.ts';
import { HAT_SCENE, type Vector } from './hat-scene.ts';

type W = Record<string, number>;
type HatLane = 'closed' | 'open' | 'offbeat';
export interface HatMoveRow {
  id: string; name: string; says?: string; weight: number;
  /** a row of many small hits, kept out of the hand player's room */
  busy?: boolean;
  /** an accent on the open or the closed hat, leaned in where the hand player plays */
  accent?: boolean;
  /** an accent into the line: its last or main hit may reach the groove's full level (every other row stays under it) */
  full?: boolean;
  /** a row that only clears: the hits it must take at least, or it is never drawn there */
  take?: number;
  /** its rests filled or its early hits thinned by Spark */
  dense?: boolean;
  birds?: W; beats: W;
  /** the row's weight by the vector of change across the seam (a row names the ones it leans; 1 where it names none; a
   * row with a nought is drawn only where the transition's vector is read) */
  vectors?: Partial<Record<Vector, number>>;
  /** the row's weight by the vector where the figure keeps playing across the seam (it strikes in the move's bar and in
   * the line's): in place of `vectors` there */
  keeps?: Partial<Record<Vector, number>>;
  /** call and response (round hat-scene): over the window the closed hats keep their offbeats at `time` but where the
   * figure strikes, and answer each of the figure's strikes at `hit` once its note has stopped sounding (or, where it
   * rings on, on the next offbeat the figure leaves free), never on a kick's beat */
  answer?: { hit: string; time: string; clear: number };
  needs?: Array<'open' | 'talk' | 'call'>;
  letters?: Record<string, Letter>;
  lanes: Partial<Record<HatLane, { clear?: 'window'; pattern?: string | Record<string, string> }>>;
}
export interface HatFile {
  centre: Record<string, number | string>;
  box: { ember: [number, number] };
  chance: number; lean: W; recent: number; repeat: number;
  /** the rows that need the open hat: its voice's ring to -10 dB at least `ring` seconds (a tight hat in the open slot
   * has no tail to choke, lift or wash) */
  open: { ring: number };
  hands: { busy: number; accent: number };
  talk: number;
  length: Record<string, number | string>;
  density: { spark: number; range: [number, number] };
  rows: HatMoveRow[];
}
export const HAT_MOVES: Readonly<HatFile> = HAT_FILE as unknown as HatFile;

/** A transition the hats may mark: the bar the move sits on and the line it leads into. */
export interface HatTransition { bar: number; line: number; where: string;
  /** inside a span whose tops are out (a breakdown-lite, a filtered phrase): the closed hats alone */
  closedOnly?: boolean;
  /** drum work in place of a refused noise gesture */
  swap?: boolean;
  /** the vector the voices make across the seam (round hat-scene): into more, into less, or level */
  vector?: Vector }
/** The steps a bar's hats strike on as the figures before the moves leave them: all of them, the closed's, the open's. */
export interface HatSteps { all: number[]; closed: number[]; open: number[] }
/** A move as placed: its bar, its line, its row, its window (from a sixteenth of the bar), and its words. */
export interface HatMove { bar: number; line: number; kind: string; beats: number; from: number; label: string; where: string; swap?: boolean; vector?: Vector }

export interface HatInput {
  seed: string | number;
  spell: Readonly<Record<string, number>>;
  four: boolean;
  transitions: readonly HatTransition[];
  /** the bars the move may not sit on: a gesture's, a stop's, the house's own small things', a pickup's */
  busy: ReadonlySet<number>;
  /** the bar plays its hats (the offbeat lane) and the move may edit them */
  hats: (bar: number) => boolean;
  /** the theme plays an open hat of its own voice (never the closed hats' own) */
  open: boolean;
  /** the open hat's ring to -10 dB, in seconds */
  openRing?: number;
  /** the steps of the bar where the hand part strikes (the lane's own player) */
  hands: (bar: number) => number[];
  /** the steps the bar's hats strike on, as the house's own figures leave them */
  hatSteps?: (bar: number) => HatSteps;
  /** the scene at a bar (round hat-scene): whether its voices are busy, and the figure's strikes with the sixteenth each
   * note stops sounding (the call) */
  scene?: { busy: (bar: number) => boolean; call: (bar: number) => ReadonlyArray<{ step: number; end: number }>; kicks: (bar: number) => number[] };
}

const DIGITS: Readonly<Record<string, Letter>> = Object.freeze(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), { level: (i + 1) / 10 }])));
const patternOf = (spec: string | Record<string, string>, beats: number): string => {
  const n = beats * 4;
  const raw = typeof spec === 'string' ? spec : spec[String(beats)] ?? spec[Object.keys(spec).sort((x, y) => Number(y) - Number(x))[0]] ?? '';
  const cut = raw.length >= n ? raw.slice(raw.length - n) : '.'.repeat(n - raw.length) + raw;
  return cut.padStart(16, '.');
};
/** A busy roll's density: above nought its rests filled, the latest first, at the lower neighbour's level; below, its early hits thinned. */
function densified(pat: string, share: number): string {
  if (!share) return pat;
  const lvl = (c: string) => (c >= '1' && c <= '9' ? Number(c) : 0);
  const hits = [...pat].map((c, i) => (lvl(c) ? i : -1)).filter((i) => i >= 0);
  if (hits.length < 2) return pat;
  const a = hits[0], z = hits[hits.length - 1], out = pat.split('');
  if (share > 0) {
    const rests: number[] = [];
    for (let i = z - 1; i > a; i--) if (out[i] === '.') rests.push(i);
    for (const i of rests.slice(0, Math.round(rests.length * Math.min(1, share)))) {
      let l = i - 1; while (l > a && !lvl(pat[l])) l--;
      let r = i + 1; while (r < z && !lvl(pat[r])) r++;
      out[i] = String(Math.max(1, Math.min(lvl(pat[l]), lvl(pat[r]))));
    }
  } else {
    const early = hits.filter((i) => i < a + (pat.length - a) * Math.min(1, -share) && i < 12);
    early.forEach((i, k) => { if (k % 2 === 1) out[i] = '.'; });
  }
  return out.join('');
}

/**
 * **A hat answer's figure** over a window of `beats` (round hat-scene): the closed hats on their offbeats at `time`
 * except where the figure strikes, and an answer to each of its strikes at `hit`, in its gap before the next — a
 * response, never a flam under the called note: on the first sixteenth after it where no note of the figure sounds (every
 * one stopped `clear` of a sixteenth before it at least: a strum's late voices, the hats' own swing and humanising), or,
 * where the figure rings on, on the next offbeat half a beat after it at least; each on a step the figure, the hand part
 * and the other answers leave free, never on a kick (nor on a beat: the hats move only in a four-floor kit). Empty where
 * nothing in the window answers.
 */
export function answerPattern(a: NonNullable<HatMoveRow['answer']>, beats: number, call: ReadonlyArray<{ step: number; end: number }>,
  hands: readonly number[], kicks: readonly number[] = []): string {
  const from = 16 - beats * 4, out = new Array(16).fill('.'), struck = call.map((c) => c.step);
  const free = (q: number) => q % 4 !== 0 && !kicks.includes(q) && out[q] === '.' && !struck.includes(q) && !hands.includes(q);
  const sounding = (q: number) => call.some((c) => c.step < q && q < c.end + a.clear);
  let answers = 0;
  for (const c of call) {
    const gap = Math.min(16, ...struck.filter((q) => q > c.step));
    let r = -1;
    for (let q = c.step + 1; q < gap && r < 0; q++) if (free(q) && !sounding(q)) r = q;
    for (let q = c.step + 2; q < gap && r < 0; q++) if (q % 4 === 2 && free(q)) r = q;
    if (r >= from) { out[r] = a.hit; answers++; }
  }
  if (!answers) return '';
  for (let q = from; q < 16; q++) if (q % 4 === 2 && out[q] === '.' && !struck.includes(q) && !hands.includes(q)) out[q] = a.time;
  return out.join('');
}

/**
 * **Whether a row changes the bar's hats** over a window of `beats`: a lane it clears has a hit there to take (a row
 * that only clears, `take` of them at least), a pattern on a lane it clears has a hit to copy, and a pattern laid only
 * where the lane is silent (add-if-absent) finds a step of its own. The open hat is copied from the theme's nearest
 * where the bar has none.
 */
function changes(r: HatMoveRow, beats: number, st: HatSteps, answer = ''): boolean {
  const from = 16 - beats * 4, inside = (xs: number[]) => xs.filter((q) => q >= from);
  const onlyClears = !r.answer && !Object.values(r.lanes).some((l) => l?.pattern);
  let any = false;
  for (const [lane, spec] of Object.entries(r.lanes) as Array<[HatLane, NonNullable<HatMoveRow['lanes'][HatLane]>]>) {
    const pat = r.answer && lane === 'closed' ? answer : spec.pattern ? patternOf(spec.pattern, beats) : '', hits = [...pat].flatMap((c, q) => (c !== '.' ? [q] : []));
    const have = lane === 'offbeat' ? st.all : lane === 'closed' ? st.closed : st.open;
    // (the closed hats copy only the bar's own: a bar with none of them takes nothing on that lane)
    if (lane !== 'open' && !have.length) continue;
    if (spec.clear === 'window') { if (inside(have).length >= (onlyClears ? r.take ?? 1 : 1) || hits.length) any = true; }
    else if (hits.some((q) => !have.includes(q))) any = true;
  }
  return any;
}

/** A bird's leans about the file's centre, multiplied. */
function leanOf(F: Readonly<HatFile>, leans: Readonly<Record<string, number | string>>, spell: Readonly<Record<string, number>>, units = 1): number {
  let x = 1;
  for (const [bird, v] of Object.entries(leans)) {
    const c = F.centre[bird];
    if (typeof v === 'number' && typeof c === 'number') x *= lean(v * units, spell[bird], 1, c);
  }
  return x;
}

/** Whether the hats move at all where the theme is: a four-floor kit, Ember inside the box. */
export function hatsMoveHere(spell: Readonly<Record<string, number>>, four: boolean, F: Readonly<HatFile> = HAT_MOVES): boolean {
  const e = spell.ember;
  return four && typeof e === 'number' && e >= F.box.ember[0] && e <= F.box.ember[1];
}

/**
 * **The hats' moves of a theme**: per transition (in bar order, each bar once), a die at the file's `chance` (Veil
 * leaning it), then a row among those the bar admits (its needs; out of the hand player's room where it plays; never
 * the theme's last move), then its window by Loom, its density by Spark. Each move is a sub-section on the hats' lanes.
 */
export function planHatMoves(I: HatInput, F: Readonly<HatFile> = HAT_MOVES): { subs: SubSection[]; moves: HatMove[] } {
  const subs: SubSection[] = [], moves: HatMove[] = [];
  if (!hatsMoveHere(I.spell, I.four, F)) return { subs, moves };
  const seen = new Set<number>(), used = new Set<string>();
  let prev: string | null = null;
  const chance = Math.min(1, F.chance * leanOf(F, F.lean, I.spell));
  const dense = Math.max(F.density.range[0], Math.min(F.density.range[1], F.density.spark * ((I.spell.spark ?? 0) - (F.centre.spark as number))));
  for (const t of [...I.transitions].sort((a, b) => a.bar - b.bar || Number(!!b.swap) - Number(!!a.swap))) {
    if (seen.has(t.bar) || t.bar < 1 || (!t.swap && I.busy.has(t.bar)) || !I.hats(t.bar)) continue;
    seen.add(t.bar);
    const rng = new Rng(`${I.seed}::phrasing:hats:${t.bar}`);
    // (drum work in place of a refused noise gesture is always laid where the bar admits a move)
    if (!rng.chance(t.swap ? 1 : chance)) continue;
    const hands = I.hands(t.bar);
    const talkFrom = (beats: number) => hands.some((s) => s >= 16 - beats * 4);
    const st = I.hatSteps?.(t.bar) ?? null;
    // (the scene, round hat-scene: the figure's strikes a hat answer answers, and whether the bar's voices are busy)
    const call = I.scene?.call(t.bar) ?? [];
    const sceneBusy = !!I.scene?.busy(t.bar);
    // (the figure keeps playing across the seam: it strikes in the move's bar and in the line's)
    const keeps = call.length > 0 && (I.scene?.call(t.line).length ?? 0) > 0;
    const vectorW = (r: HatMoveRow, v: Vector) => (keeps ? r.keeps?.[v] : undefined) ?? r.vectors?.[v] ?? 1;
    const kicks = I.scene?.kicks(t.bar) ?? [];
    const answerOf = (r: HatMoveRow, beats: number) => (r.answer ? answerPattern(r.answer, beats, call, hands, kicks) : '');
    // the row's windows: its lengths, the longer leaned by Loom per doubling; a gap's only where its talk falls inside it,
    // and only where the row changes the hats there (a move that adds nothing never spends the transition)
    const windows = (r: HatMoveRow) => Object.entries(r.beats).map(([b, x]) => ({ v: Number(b), w: x * leanOf(F, F.length, I.spell, Math.log2(Number(b) / 2)) }))
      .filter((x) => x.w > 0 && (!(r.needs ?? []).includes('talk') || talkFrom(x.v)) && (!r.answer || answerOf(r, x.v) !== '')
        && (!st || changes(r, x.v, st, answerOf(r, x.v))));
    const admits = (r: HatMoveRow) => (r.needs ?? []).every((n) => (n === 'open' ? I.open && (I.openRing ?? Infinity) >= F.open.ring : n === 'talk' ? talkFrom(2) : n === 'call' ? call.length > 0 : false))
      && !(t.closedOnly && r.lanes.open) && !(r.busy && hands.length && F.hands.busy === 0) && !(r.busy && sceneBusy && HAT_SCENE.moves.busy === 0)
      // (a row that must never go one way, a building roll into less, is drawn only where the way is read)
      && !(t.vector ? vectorW(r, t.vector) === 0 : Object.values(r.vectors ?? {}).includes(0)) && windows(r).length > 0;
    const w = (r: HatMoveRow, repeat: number) => r.weight * leanOf(F, r.birds ?? {}, I.spell)
      * (hands.length ? (r.busy ? F.hands.busy : r.accent ? F.hands.accent : 1) : 1)
      * (sceneBusy && r.busy ? HAT_SCENE.moves.busy : 1)
      * (t.vector ? vectorW(r, t.vector) : 1)
      * ((r.needs ?? []).includes('talk') ? F.talk : 1)
      * (r.id === prev ? repeat : used.has(r.id) ? F.recent : 1);
    const ok = F.rows.filter(admits);
    const pairs = ok.map((r) => ({ v: r, w: w(r, F.repeat) })).filter((x) => x.w > 0);
    if (!pairs.length) continue;
    const row = rng.weighted(pairs);
    const bw = windows(row);
    const beats = rng.weighted(bw), from = 16 - beats * 4;
    const lanes: Record<string, LaneEdit> = {};
    for (const [lane, spec] of Object.entries(row.lanes) as Array<[HatLane, NonNullable<HatMoveRow['lanes'][HatLane]>]>) {
      const e: LaneEdit = {};
      if (spec.clear === 'window') e.clear = from;
      const pat = row.answer && lane === 'closed' ? answerOf(row, beats) : spec.pattern ? patternOf(spec.pattern, beats) : '';
      if (pat) {
        const m = row.dense ? densified(pat, dense) : pat;
        if (/[^.]/.test(m)) { e.mask = [m]; if (spec.clear !== 'window') e.insert = 'add-if-absent'; }
      }
      if (Object.keys(e).length) lanes[lane] = e;
    }
    const figure = { lanes, letters: { ...DIGITS, ...(row.letters ?? {}) } };
    const r0 = { schema: 1, kind: 'recipe', id: `phrasing/hats/${row.id}`, revision: 1, name: row.name, scope: 'treatment', applies: 'fill', birds: {}, figure, forbids: [], weight: 0 } as unknown as Recipe;
    const label = `${row.name} into ${t.line}${t.swap ? ' (the drums in place of a noise sweep)' : ''}`;
    subs.push({ kind: 'fill', startBar: t.bar, bars: 1, label, figure: r0.id, row: r0 });
    moves.push({ bar: t.bar, line: t.line, kind: row.id, beats, from, label, where: t.where, ...(t.swap ? { swap: true } : {}), ...(t.vector ? { vector: t.vector } : {}) });
    prev = row.id;
    used.add(row.id);
  }
  return { subs, moves };
}

/** The file's faults: every row's lanes the hats', its patterns its letters, its windows a bar at most, its leans on a centre. */
export function hatMoveFaults(F: Readonly<HatFile>): string[] {
  const bad: string[] = [];
  const ids = new Set<string>();
  if (!(F.open?.ring > 0)) bad.push('open.ring: seconds above nought');
  for (const r of F.rows) {
    const at = `hat move ${r.id}`;
    if (ids.has(r.id)) bad.push(`${at}: twice`);
    ids.add(r.id);
    if (!(r.weight >= 0)) bad.push(`${at}: a weight`);
    for (const k of Object.keys(r.beats)) if (![1, 2, 4].includes(Number(k))) bad.push(`${at}: beats are 1, 2 or 4`);
    const letters = { ...DIGITS, o: { level: 0.3, ghost: true }, ...(r.letters ?? {}) } as Record<string, Letter>;
    // (a move stays under the groove, 0.7 of its lane's loudest hit at most, digits and letters alike; an accent into
    // the line, `full`, may reach the lane's own level on its last or main hit)
    const cap = r.full ? 1 : 0.7;
    if (r.take !== undefined && !(r.take >= 1)) bad.push(`${at}: take is a count of hits`);
    for (const [k, l] of Object.entries(r.letters ?? {})) {
      if (!(l.level > 0 && l.level <= cap)) bad.push(`${at}: letter ${k}'s level ${l.level} over ${cap}`);
      if (l.shift !== undefined && !(Math.abs(l.shift) <= 0.75)) bad.push(`${at}: letter ${k}'s shift`);
      if (l.chokeAfter !== undefined && !(l.chokeAfter > 0 && l.chokeAfter <= 4)) bad.push(`${at}: letter ${k}'s choke`);
    }
    for (const [lane, spec] of Object.entries(r.lanes)) {
      if (!['closed', 'open', 'offbeat'].includes(lane)) bad.push(`${at}: ${lane} is not a hats' lane`);
      const pats = !spec?.pattern ? [] : typeof spec.pattern === 'string' ? [spec.pattern] : Object.values(spec.pattern);
      for (const p of pats) for (const c of p) if (c !== '.' && !letters[c]) bad.push(`${at}: ${c} is no letter`);
      for (const p of pats) for (const c of p) if (c >= '8' && c <= '9') bad.push(`${at}: a digit never over 7 (a full row reaches its lane's level by a letter of its own)`);
    }
    const all = Object.values(r.lanes).flatMap((l) => (!l?.pattern ? [] : typeof l.pattern === 'string' ? [l.pattern] : Object.values(l.pattern)));
    if (r.full && !all.some((p) => [...p].some((c) => (letters[c]?.level ?? 0) >= 1))) bad.push(`${at}: a full row with no hit at its lane's level`);
    for (const k of Object.keys(r.birds ?? {})) if (typeof F.centre[k] !== 'number') bad.push(`${at}: a lean on ${k} with no centre`);
    for (const n of r.needs ?? []) if (!['open', 'talk', 'call'].includes(n)) bad.push(`${at}: no need ${n}`);
    for (const k of ['vectors', 'keeps'] as const) for (const [v, x] of Object.entries(r[k] ?? {}))
      if (!['up', 'down', 'level'].includes(v) || !(typeof x === 'number' && x >= 0)) bad.push(`${at}: ${k}.${v}`);
    if (r.keeps && !(r.needs ?? []).includes('call')) bad.push(`${at}: keeps reads the figure: it needs a call`);
    if (r.answer) {
      if (!(r.answer.clear >= 0 && r.answer.clear < 1)) bad.push(`${at}: answer.clear is a share of a sixteenth`);
      for (const c of [r.answer.hit, r.answer.time]) if (!letters[c] || (letters[c].level ?? 0) > cap) bad.push(`${at}: answer letter ${c}`);
      if (!(r.needs ?? []).includes('call')) bad.push(`${at}: an answer needs a call`);
      if (!r.lanes.closed) bad.push(`${at}: an answer plays on the closed hats`);
    }
  }
  return bad;
}
{
  const bad = hatMoveFaults(HAT_MOVES);
  if (bad.length) throw new Error(`the hat moves: ${bad.join('; ')}`);
}
