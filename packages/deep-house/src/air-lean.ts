/**
 * **Zephyr is air** (his word, 10-18: "Zephyr is air"; the zephyr-air round): wherever Zephyr leans a timbre draw (the
 * house's lead, pad and stab lists, the liquid keys' tone, the struck conversation's caller and answerer), it leans by
 * the voice's measured air and never by named families typed per place. Up means airier, down means darker.
 *
 * The air is `voice-air.json`'s `hz`: the spectral centroid of each voice alone at its place's own pitch, the table the
 * ring's Zephyr word is cut from (`bird-labels.ts`, `airOf`), so the word and the draw read one measurement. A voice's
 * air here is in octaves (log2 of its centroid) about the middle of the draw it stands in.
 *
 * Three things the rule keeps:
 *
 *   - **The place's menu.** It only re-weights the voices a draw already offers; a voice weighted nought stays nought.
 *   - **The place's centre.** The lean is about the place's own Zephyr (`AirCentre`, blended near a boundary between
 *     places: `airBlend`): there it is exactly one, so a place at its own birds draws what it drew; only the pull away
 *     from it follows the air.
 *   - **One step a voice.** `airDraw` couples a draw off the centre to the draw at the centre: the same dice land in the
 *     same place of the air's order, so as Zephyr rises a theme's voice only ever steps to an airier one, never back
 *     (the measured travel of the labels round fell where a weighted ladder in the list's own order let a fixed die slip
 *     into a darker neighbour).
 *
 * A voice the table has not measured stands at its draw's middle: the rule neither lifts nor lowers it.
 */
import AIR from './voice-air.json' with { type: 'json' };
import type Rng from './rng.ts';

/** The role a voice's air is read in: the keys' onsets, a held voice's whole sound, the conversation's calls and answers. */
export type AirRole = 'keys' | 'held' | 'call' | 'answer';
type AirTable = 'keys' | 'held' | 'calls' | 'answers';
const TABLE = AIR as unknown as Record<AirTable, Record<string, { hz: number }>>;
const ORDER: readonly AirTable[] = ['keys', 'held', 'calls', 'answers'];
const TABLE_OF: Record<AirRole, AirTable> = { keys: 'keys', held: 'held', call: 'calls', answer: 'answers' };

/** A voice's measured air in octaves (log2 of its centroid in hertz): its own role's, else the one role it was measured in; null where none. */
export function airOctaves(id: string, role: AirRole): number | null {
  const own = TABLE[TABLE_OF[role]]?.[id];
  if (own) return Math.log2(own.hz);
  for (const t of ORDER) if (TABLE[t]?.[id]) return Math.log2(TABLE[t][id].hz);
  return null;
}

/** A role's reading of a voice's air, for the draws below. */
export const voiceAir = (role: AirRole | ((v: string) => AirRole)) => (v: string): number | null => airOctaves(v, typeof role === 'function' ? role(v) : role);

/**
 * Each entry's air about its draw's middle (octaves): the middle is the weight-weighted mean of the measured voices the
 * draw offers (`w` over nought), so a draw's own palette sets it; an unmeasured voice, and one the draw weighs nought,
 * stands at the middle.
 */
export function airAbout<T extends { v: string; w: number }>(list: readonly T[], airOf: (v: string) => number | null): number[] {
  const a = list.map((e) => airOf(e.v));
  let mass = 0, sum = 0;
  list.forEach((e, i) => { if (a[i] != null && e.w > 0) { mass += e.w; sum += e.w * a[i]!; } });
  const mid = mass > 0 ? sum / mass : 0;
  return a.map((x) => (x == null ? 0 : x - mid));
}

/**
 * The air's lean on one draw: each weight times exp(`per` x `off` x its air about the middle), `per` the lean's strength
 * (a factor's log per octave per unit of the bird) and `off` the bird's distance from the place's centre. At the centre
 * (`off` nought) every entry is handed back as it was.
 */
export function airLeaned<T extends { v: string; w: number }>(list: readonly T[], per: number, off: number, airOf: (v: string) => number | null): T[] {
  if (!off || !per) return list as T[];
  const a = airAbout(list, airOf);
  return list.map((e, i) => (a[i] === 0 ? e : { ...e, w: e.w * Math.exp(per * off * a[i]) }));
}

/**
 * **The coupled draw** (one die, as `Rng.weighted` reads one): the voice the centre's weights draw on this die, and from
 * it the voice here. The die is the centre's ladder walked as `Rng.weighted` walks it; where it lands inside the voice it
 * picked is carried into the same voice's span on the air's own ladder (darkest first), and that point read on the air's
 * ladder of the weights here. Where the weights here are the centre's, the voice is the centre's, to the bit; as the
 * weights tilt toward the air (an exponential lean on it), every point of the air's ladder moves only toward the airier
 * voices, so a theme's voice rises with Zephyr and never steps back.
 */
export function airDraw<T>(rng: Rng, centre: ReadonlyArray<{ v: T; w: number }>, hereAsked: ReadonlyArray<{ v: T; w: number }>, airOf: (v: T) => number,
  groupOf?: (v: T) => string): T {
  // the centre's walk, as `Rng.weighted` walks it (one draw from the stream)
  let total = 0;
  for (const p of centre) total += p.w;
  const u = rng.next() * total;
  let r = u, at = -1, before = 0, last = -1;
  for (let i = 0; i < centre.length; i++) {
    const p = centre[i];
    if (!(p.w > 0)) continue;
    last = i;
    if (r - p.w <= 0) { at = i; break; }
    r -= p.w; before += p.w;
  }
  if (at < 0) at = last >= 0 ? last : centre.length - 1;
  const picked = centre[at];
  const same = centre.length === hereAsked.length && centre.every((p, i) => p.w === hereAsked[i].w && p.v === hereAsked[i].v);
  if (same || !(picked.w > 0)) return picked.v;
  // **a group keeps its share** (`groupOf`, a lead list's held and struck voices): the air re-weights the voices inside
  // each group and leaves the group's whole weight as the centre had it, and the air's ladder runs group by group, so a
  // die never leaves its group: Zephyr moves which voice, never which role
  const here = !groupOf ? hereAsked : (() => {
    const sum = (xs: ReadonlyArray<{ v: T; w: number }>) => { const m = new Map<string, number>(); for (const p of xs) if (p.w > 0) m.set(groupOf(p.v), (m.get(groupOf(p.v)) ?? 0) + p.w); return m; };
    const was = sum(centre), now = sum(hereAsked);
    return hereAsked.map((p) => { const g = groupOf(p.v), n = now.get(g) ?? 0; return n > 0 ? { v: p.v, w: p.w * (was.get(g) ?? 0) / n } : p; });
  })();
  // where in its span the die fell, as a share of the span (0 at its foot)
  const share = Math.max(0, Math.min(1, (u - before) / picked.w));
  // the air's ladder: darkest first, ties in the list's own order
  const gOf = (i: number) => (groupOf ? groupOf(centre[i].v) : '');
  const order = centre.map((_, i) => i).sort((i, j) => (gOf(i) < gOf(j) ? -1 : gOf(i) > gOf(j) ? 1 : 0) || airOf(centre[i].v) - airOf(centre[j].v) || i - j);
  let foot = 0;
  for (const i of order) { if (i === at) break; foot += Math.max(0, centre[i].w); }
  const point = total > 0 ? (foot + share * picked.w) / total : 0;
  // the same point on the air's ladder of the weights here (indices: `here` is `centre` re-weighted, entry for entry)
  let hereTotal = 0;
  for (const p of here) hereTotal += Math.max(0, p.w);
  let x = point * hereTotal, lastHere: T | undefined;
  for (const i of order) {
    const w = Math.max(0, here[i].w);
    if (!(w > 0)) continue;
    lastHere = here[i].v;
    x -= w;
    if (x <= 0) return here[i].v;
  }
  return lastHere ?? picked.v;
}

/**
 * **Where Zephyr's centre stands** (the place tables' `air`): the places a draw was tuned at, each its Zephyr the centre
 * the air leans about, and the house's own among them.
 */
export interface AirCentre { id: string; place: { birds: Readonly<Partial<Record<string, number>>>; tempo: readonly [number, number] } }

/**
 * How near two places' distances must stand before their centres blend (bird units): over it the nearer place's Zephyr
 * is the centre alone, under it the two are mixed by how much nearer the one is. A tenth of a bird, so the house's own
 * pulls and every tuned place keep their centre to the bit, and a pull crossing from one place's region to another's
 * slides the centre over about a tenth of the bird instead of stepping it.
 */
export const AIR_BAND = 0.1;

/**
 * **The centre, blended by distance** (the review of 10-18: the nearest place alone stepped the timbre draws wherever a
 * bird other than Zephyr crossed a boundary): each place's weight is (1 - (its distance - the nearest's) / `band`)
 * squared, nought past the band, so the centre is the nearest place's Zephyr wherever no other place stands within the
 * band of it (to the bit: one weight of one), and continuous everywhere. The distances leave Zephyr out (the caller's),
 * so along Zephyr's own travel the centre never moves and the travel is one lean.
 */
export function airBlend(near: ReadonlyArray<{ d: number; zephyr: number }>, band = AIR_BAND): number {
  let m = Infinity;
  for (const p of near) if (p.d < m) m = p.d;
  let mass = 0, sum = 0;
  for (const p of near) {
    const w = Math.max(0, 1 - (p.d - m) / band) ** 2;
    if (w > 0) { mass += w; sum += w * p.zephyr; }
  }
  return sum / mass;
}
