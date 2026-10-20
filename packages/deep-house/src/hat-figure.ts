// **The hat figure across a phrase** (his word 10-17 on hat-seams: "hats in the figure sound like a good improvement, we
// could explore it too"; standing, 10-16: "voices give it a main gravity that hats can work of on segments", and "tracks
// alive: the small things — fills, breaks, variations every few bars").
//
// The theme's own groove played the way a drummer plays one: the same figure, varied bar to bar, so a phrase has a shape
// — the bar after the line settles on the plain figure, the half-phrase's last bar says a small thing, the bar into the
// line turns round into it. Which bars speak is a rule: a bar's place in its phrase asks a speech of it (`places.from`),
// and the bar's speech is the row's base moved by the scene (`src/hat-scene.ts`: busy voices calm the hats, a resting or
// a held figure lets them speak) and by the birds (Spark and Loom up, Veil down). What it says is the scene's too: over
// busy voices an accent only, over a resting figure a ghost in its gap, over a held one the open hat lifting the last
// offbeat. The theme's kinds turn over phrase by phrase (never one twice in a phrase), its first turn off a stream of
// its own. A hit is laid only on a step no kick, no figure or bass strike, no hand stroke and no hat stands on.
//
// It works on the bars between the seams: a bar a hat move, an answer, a gesture, a stop, a landing, a span, a small
// thing of the house's, a hat variation or the scene's fill holds is the caller's to leave out (`skip`). The row is
// `recipes/arrangement/hat-figure.json`; nothing here names a place, a genre or a seed.
import FIGURE_FILE from '../recipes/arrangement/hat-figure.json' with { type: 'json' };
import { Rng } from './rng.ts';

export type FigureState = 'busy' | 'rest' | 'hold' | 'normal';
type Place = 'breath' | 'lead' | 'half' | 'turn';
const PLACES: readonly Place[] = ['breath', 'lead', 'half', 'turn'];
export interface FigureKind {
  says?: string;
  /** closed-hat ghosts at `level` of the bar's loudest closed hit, on the first free of `steps` (`all`: each free one) */
  ghosts?: { steps: number[]; level: number; all?: boolean };
  /** the closed hat on `step` out and the theme's own open hat there (never on a step the figure or the bass strikes) */
  open?: { step: number };
  /** the first of `steps` the closed hats strike and the figure and the bass leave free, `db` over the bar's loudest closed
   * hit; the bar's other closed hits by `rest` (an accent only: nothing laid) */
  accent?: { steps: number[]; db: number; rest: number };
}
export interface HatFigureRow {
  centre: Record<string, number | string>;
  shape: Record<string, Array<Place | 'settle'>>;
  /** a place's speech to vary (`from`), more by `alt` on every other phrase (a small thing every few bars, not every
   * phrase, where the scene does not ask more of it), and what its ghosts are scaled by */
  places: Record<Place, { from: number; alt?: number; level: number }>;
  speech: { base: number; busy: number; rest: number; hold: number; lean: Record<string, number> };
  hold: { strikes: number; to: number };
  open: { ring: number };
  turn: number;
  kinds: Record<Place, Partial<Record<FigureState, string[]>>>;
  figures: Record<string, FigureKind>;
}
export const HAT_FIGURE: Readonly<HatFigureRow> = FIGURE_FILE as unknown as HatFigureRow;

/** A bar's closed hats as the figure reads them: each hit's step and level. */
export interface FigureBar { closed: Array<{ step: number; vel: number }>; open: number[] }
export interface FigureInput {
  seed: string | number;
  spell: Readonly<Record<string, number>>;
  /** the phrases the figure moves across, in bars [from, to) */
  phrases: ReadonlyArray<{ from: number; to: number }>;
  /** the bars it leaves as they are (the seams', the gestures', the variations', the fills') */
  skip: (bar: number) => boolean;
  /** the scene's state at a bar */
  state: (bar: number) => FigureState;
  /** the bar's own hats (null where it plays none) */
  hats: (bar: number) => FigureBar | null;
  /** a step a hit may be laid on: no kick, no figure or bass strike, no hand stroke, no hat */
  free: (bar: number, step: number) => boolean;
  /** the steps the bar's figure and bass strike (an accent sits against them, never on them) */
  struck: (bar: number) => readonly number[];
  /** the theme's open hat may lift the bar: it rings, it is not the closed hats' own voice, it sounds in the phrase */
  canOpen: (bar: number, from: number, to: number) => boolean;
}
/** One bar's word: where, its place and state, the kind, and what it lays or reshapes. */
export interface FigureWord { bar: number; place: Place; state: FigureState; kind: string;
  ghosts?: Array<{ step: number; level: number }>; open?: number; accent?: { step: number; db: number; rest: number } }

/**
 * A phrase's places, bar by bar: the row's shape for its length, else the longest shape it holds that fits, on the
 * phrase's last bars, the bars before it settling (a sixteen-bar phrase is eight settled and the eight-bar shape into
 * its line, never the four-bar one four times over; one shorter than every shape settles whole).
 */
export function placesOf(n: number, F: Readonly<HatFigureRow> = HAT_FIGURE): Array<Place | 'settle'> {
  const own = F.shape[String(n)];
  if (own) return [...own];
  const fit = Object.keys(F.shape).map(Number).filter((L) => L <= n).sort((x, y) => y - x)[0];
  const out: Array<Place | 'settle'> = new Array(Math.max(0, n)).fill('settle');
  if (fit) F.shape[String(fit)].forEach((p, i) => { out[n - fit + i] = p; });
  return out;
}

/** A bar's speech: the row's base, its state's step, each bird's lean times its distance from the row's centre. */
export function speechOf(state: FigureState, spell: Readonly<Record<string, number>>, F: Readonly<HatFigureRow> = HAT_FIGURE): number {
  let x = F.speech.base + (state === 'normal' ? 0 : F.speech[state]);
  for (const [bird, k] of Object.entries(F.speech.lean)) {
    const c = F.centre[bird], v = spell[bird];
    if (typeof c === 'number' && typeof v === 'number') x += k * (v - c);
  }
  return x;
}

/** A word's hits, as a listener hears them: its ghosts' steps, its open hat's, its accent's. */
const hitsOf = (w: Pick<FigureWord, 'ghosts' | 'open' | 'accent'>) => `${(w.ghosts ?? []).map((g) => g.step).join(',')}|${w.open ?? ''}|${w.accent?.step ?? ''}`;

/** What a kind says at a bar, or null where it can say nothing there. */
function wordOf(K: FigureKind, I: FigureInput, bar: number, hats: FigureBar, level: number, phrase: { from: number; to: number }):
  Pick<FigureWord, 'ghosts' | 'open' | 'accent'> | null {
  if (K.ghosts) {
    const free = K.ghosts.steps.filter((q) => q % 4 !== 0 && I.free(bar, q));
    const at = K.ghosts.all ? free : free.slice(0, 1);
    return at.length ? { ghosts: at.map((step) => ({ step, level: Math.min(1, K.ghosts!.level * level) })) } : null;
  }
  if (K.open) {
    const q = K.open.step;
    if (!hats.closed.some((h) => h.step === q) || hats.open.length || I.struck(bar).includes(q) || !I.canOpen(bar, phrase.from, phrase.to)) return null;
    return { open: q };
  }
  if (K.accent) {
    const struck = I.struck(bar);
    const q = K.accent.steps.find((s) => hats.closed.some((h) => h.step === s) && !struck.includes(s));
    return q === undefined ? null : { accent: { step: q, db: K.accent.db, rest: K.accent.rest } };
  }
  return null;
}

/**
 * **The figure's words across a theme's phrases**: per phrase, each bar whose place its speech reaches says one of the
 * kinds its place and state admit, the theme's turn over its phrases choosing which (never one twice in a phrase, never
 * the same hits two bars running), the next where one can say nothing there.
 */
export function planHatFigure(I: FigureInput, F: Readonly<HatFigureRow> = HAT_FIGURE): FigureWord[] {
  const words: FigureWord[] = [];
  const turn0 = new Rng(`${I.seed}::hats:figure`).int(0, Math.max(1, F.turn));
  let last: FigureWord | null = null;
  I.phrases.forEach((ph, k) => {
    const places = placesOf(ph.to - ph.from, F);
    const said = new Set<string>();
    for (let i = 0; i < places.length; i++) {
      const place = places[i], bar = ph.from + i;
      if (place === 'settle' || I.skip(bar)) continue;
      const hats = I.hats(bar);
      if (!hats?.closed.length) continue;
      const state = I.state(bar);
      // (a hair under the threshold, so a speech the row's own sums reach is never lost to rounding)
      if (speechOf(state, I.spell, F) < F.places[place].from + (k % 2 === 1 ? F.places[place].alt ?? 0 : 0) - 1e-9) continue;
      const list = F.kinds[place]?.[state] ?? [];
      for (let j = 0; j < list.length; j++) {
        const kind = list[(turn0 + k + j) % list.length];
        if (said.has(kind)) continue;
        const w = wordOf(F.figures[kind], I, bar, hats, F.places[place].level, ph);
        // (never the same hits two bars running: a word the bar before already said is no shape)
        if (!w || (last?.bar === bar - 1 && hitsOf(last) === hitsOf(w))) continue;
        last = { bar, place, state, kind, ...w };
        words.push(last);
        said.add(kind);
        break;
      }
    }
  });
  return words;
}

/** The row's faults: every place named, every kind a figure, an accent only over busy voices, the steps sixteenths. */
export function hatFigureFaults(F: Readonly<HatFigureRow>): string[] {
  const bad: string[] = [];
  const share = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;
  const step = (q: unknown) => Number.isInteger(q) && (q as number) >= 0 && (q as number) < 16;
  for (const [n, list] of Object.entries(F.shape)) {
    if (!(Number.isInteger(Number(n)) && list.length === Number(n))) bad.push(`shape.${n}: a place a bar`);
    for (const p of list) if (p !== 'settle' && !PLACES.includes(p)) bad.push(`shape.${n}: no place ${p}`);
    if (list[0] !== 'settle') bad.push(`shape.${n}: the bar after the line settles`);
  }
  for (const p of PLACES) {
    const x = F.places[p];
    if (!x || !(typeof x.from === 'number') || !(x.level > 0) || !((x.alt ?? 0) >= 0)) bad.push(`places.${p}`);
  }
  for (const k of ['base', 'busy', 'rest', 'hold'] as const) if (typeof F.speech[k] !== 'number') bad.push(`speech.${k}`);
  if (!(F.speech.busy <= 0)) bad.push('speech.busy: busy voices never let the hats speak more');
  for (const b of Object.keys(F.speech.lean)) if (typeof F.centre[b] !== 'number') bad.push(`speech.lean: ${b} with no centre`);
  if (!(Number.isInteger(F.hold.strikes) && F.hold.strikes >= 0) || !(F.hold.to > 0 && F.hold.to <= 16)) bad.push('hold');
  if (!(F.open.ring > 0)) bad.push('open.ring: seconds above nought');
  if (!(Number.isInteger(F.turn) && F.turn >= 1)) bad.push('turn: a count');
  for (const [p, states] of Object.entries(F.kinds)) for (const [st, list] of Object.entries(states ?? {})) for (const k of list ?? []) {
    const K = F.figures[k];
    if (!K) { bad.push(`kinds.${p}.${st}: no figure ${k}`); continue; }
    // (over busy voices the hats stay the figure: an accent, never a hit laid)
    if (st === 'busy' && !K.accent) bad.push(`kinds.${p}.busy: ${k} lays a hit over busy voices`);
  }
  for (const [k, K] of Object.entries(F.figures)) {
    const n = [K.ghosts, K.open, K.accent].filter(Boolean).length;
    if (n !== 1) bad.push(`figures.${k}: one of ghosts, open, accent`);
    if (K.ghosts && (!share(K.ghosts.level) || !K.ghosts.steps.every((q) => step(q) && q % 4 !== 0))) bad.push(`figures.${k}.ghosts: off the beat, a share`);
    if (K.open && !(step(K.open.step) && K.open.step % 4 === 2)) bad.push(`figures.${k}.open: an offbeat`);
    if (K.accent && (!K.accent.steps.every(step) || !(K.accent.db > 0 && K.accent.db <= 3) || !(K.accent.rest <= 0 && K.accent.rest >= -3))) bad.push(`figures.${k}.accent`);
  }
  // (a ghost scaled by its place never passes the groove: at most 0.7 of the bar's loudest)
  for (const [k, K] of Object.entries(F.figures)) if (K.ghosts) for (const p of PLACES) if (K.ghosts.level * F.places[p].level > 0.7) bad.push(`figures.${k}: over the groove at ${p}`);
  return bad;
}
{
  const bad = hatFigureFaults(HAT_FIGURE);
  if (bad.length) throw new Error(`the hat figure: ${bad.join('; ')}`);
}
