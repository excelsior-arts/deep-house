// **The stage: width from the room a sound plays in, never from one ear** (round stereo-room, 10-31).
//
// His word after the stereo audit's pairs: *"there was like a hat going on left ear or right ear … that's sort of
// confusing. So if you can get the stereo by not just like placing instruments in one ear, but kind of like writing in
// the room reverb, that would be … what liquid drum and bass is doing."* Three house rules, keyed by what a sound is
// and by the birds, never by a seed or a place's name:
//
//   1. **Nothing sits in one ear.** A part stands within `STAGE_EDGE` of the middle; a part that needs a side has a
//      counterweight on the other (`kitSeats`: the kit's lanes about their own middle); a keyboard is the one
//      instrument that is itself a spread, its notes seated by pitch about its part's middle (`keyboardSeats`, round
//      voice-homes), and it brings its own body (`bodyRow`): a voice's home is the instrument's, under Tide.
//   2. **The kit's width is a room, not a pan.** The hats, the cymbals, the snares and the shakers play near the
//      centre, their noise half in two ears (`KitBuild.air`, the engine) and in the short room (`space.kitRoom`, the
//      floor of their send), the room's two tails drawn apart and its top opened (`roomOf`): Zephyr opens it, a dense
//      fast kit narrows it, Tide and Veil give its size.
//   3. **A sparse struck front plays into a plate** (`frontOf`, `frontSends`): the liquid keys' own space (their
//      part space's plate: dense from the first sample, bright to the end, two tails at 0.05) given to every front
//      voice that strikes and leaves room around its notes — the piano's hall and a share of its wash move into it,
//      so the dry note stands in the middle and its ring opens around it. Every return leaves as wide as its impulse
//      (`space.returnSide`, the engine), so the tail is wide and never hollow.
//
// What stays: the kick and the bass mono, the chord band's breath, the grooves' correlation.

import { HOUSE } from './spell.ts';
import { wetOf, plateSecondsOf, frontShareOf } from './tide-space.ts';
import { strikes, BY_NAME } from '@deep-house/engine/voices';
import { asSpace, type SpaceRow } from '@deep-house/engine/space';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';

/** The furthest a part stands from the middle on its own (his word: never a part in one ear). */
export const STAGE_EDGE = 0.35;

/** a pan held to the stage */
export const onStage = (pan: number): number => Math.max(-STAGE_EDGE, Math.min(STAGE_EDGE, pan)) + 0; // + 0: never a -0 (JSON writes it as 0)

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const r3 = (x: number): number => +x.toFixed(3) + 0;

interface SeatLane { plays: string; pan?: number; panSpread?: number; steps: Array<{ vel: number }> }

/**
 * **The kit's seats about its own middle** (rule 1): the lanes that strike the top of the kit (every lane but the
 * kick's and the snare's) are re-seated about their weighted middle (each lane by its steps' level), so a kit seated
 * to one side (the liquid kit's hats at +0.4 and the open hat at +0.5: Vibe - Solar Wind 5.9 dB right) answers itself
 * across the middle; then each lane's seat and its spread are held to the stage, the seat first. A lane with no seat
 * keeps none.
 */
export function kitSeats(lanes: Record<string, SeatLane>): Map<SeatLane, { pan: number; spread: number }> {
  const out = new Map<SeatLane, { pan: number; spread: number }>();
  const top = Object.values(lanes).filter((l) => l.pan != null && l.plays !== 'kick' && l.plays !== 'snare');
  const weight = (l: SeatLane) => l.steps.reduce((a, s) => a + s.vel * ((s as { p?: number }).p ?? 1), 0);
  const sum = top.reduce((a, l) => a + weight(l), 0);
  const middle = sum > 0 ? top.reduce((a, l) => a + weight(l) * (l.pan as number), 0) / sum : 0;
  for (const l of Object.values(lanes)) {
    if (l.pan == null) continue;
    const seat = onStage(top.includes(l) ? l.pan - middle : l.pan);
    out.set(l, { pan: r3(seat), spread: r3(Math.max(0, Math.min(l.panSpread ?? 0, STAGE_EDGE - Math.abs(seat)))) });
  }
  return out;
}

interface StageEvent { voice: string; layer?: string; bar?: number; t: number; p: NoteParams }

/** the most onsets a sounding bar averages for a struck front to count as sparse: room around its notes (more than
 * three a bar is a comp or an ostinato, the bed's motion, and keeps the wash it was mixed in) */
const SPARSE_PER_BAR = 3;

/**
 * **The front's plate** (rule 3): the liquid keys' plate (dense from the first sample, bright to the end) as a shared
 * return (`settings.returns.front`), one send, no echo of its own (the record's delay already throws the note), its
 * two tails drawn in to the references' chord tail: the liquid keys' sense of space rebuilt in phase, never their
 * part space cloned (its tail read side over mid, a hollow ring). Its tail by Tide, 2.6 s at the house.
 */
export function frontRow(spell: Record<string, number>, drums = false): SpaceRow {
  // (round tide-space) where the drums play the plate is Tide's like the rest of the wash: its return by `wetOf` (the
  // row's trim: a note sends through the plate's door, past the send's own level, and nothing plays the row's dry) and
  // its length falling under the house to a short bright room (`plateSecondsOf`); a drumless place keeps the plate it had
  const seconds = drums ? plateSecondsOf(spell) : r3(clamp(2.6 + 1.6 * ((spell.tide ?? HOUSE.tide) - HOUSE.tide), 2.0, 3.6));
  const trimDb = drums ? r3(20 * Math.log10(wetOf(spell))) : 0;
  return asSpace({ schema: 1, kind: 'space', id: 'frontPlate', revision: 1, dry: 1, trimDb, inserts: [],
    sends: [{ id: 'plate', level: 1, effect: 'reverb', params: { mode: 2, decaySeconds: seconds, predelayMs: 18, lowCutHz: 300, dampHz: 5000, level: 2, mix: 1 },
      // in phase: the plate's two tails (0.05) drawn a little together (to about 0.2, its side 1.7 dB under its mid),
      // so the ring is wide around the note, never wider than two unrelated ears, and folds to one speaker without
      // going missing
      after: [{ effect: 'width', params: { width: 0.9, depth: 0, rateHz: 0.21, mix: 1 } }] }] });
}

/**
 * Where a front note's wash goes (rule 3, read by the compiler after the stage has coloured its sends): its hall
 * all into the plate and a share of its reverb, so the dry stands in the middle and the ring opens around it; the
 * hall is then never built for it. Nought where the theme has no front plate or the note is not a front's. The
 * shares keep the part's wet energy where it was (a front's stem within half a decibel of its level before).
 */
export const FRONT = { fromHall: 0.8, fromReverb: 0.65, reverbKept: 0.65 };
export function frontSends(p: NoteParams, isFront: boolean, share = 1): NoteParams {
  if (!isFront || !(share > 0)) return p;
  const hall = typeof p.hall === 'number' ? p.hall : 0, reverb = typeof p.reverb === 'number' ? p.reverb : 0;
  // (round tide-space) `share` of the wash moves (`frontShareOf`, a driving kit in a dry room moving less); the rest
  // keeps the wash it was mixed in
  const plate = share * (FRONT.fromHall * hall + FRONT.fromReverb * reverb);
  if (!(plate > 0)) return p;
  return { ...p, hall: r3(hall * (1 - share)), reverb: r3(reverb * (1 - share * (1 - FRONT.reverbKept))),
    returns: { ...((p.returns as Record<string, unknown> | undefined) ?? {}), 'front.plate': r3(Math.min(1, plate)) } };
}

/**
 * Whether a voice's part is a sparse struck front (rule 3): its keys-layer notes that strike and send to a wash, three
 * onsets a sounding bar or fewer. Read off the plan's events by the plan (does the theme carry the plate) and by the
 * compiler (which notes go to it), so the plan's notes carry no mark of it.
 */
export function frontVoice(keys: StageEvent[]): boolean {
  const struck = keys.filter((e) => e.layer === 'keys' && strikes(e.voice, e.p) && (Number(e.p.reverb ?? 0) > 0 || Number(e.p.hall ?? 0) > 0));
  if (!struck.length) return false;
  const bars = new Set(struck.map((e) => e.bar ?? Math.floor(e.t))).size;
  const onsets = new Set(struck.map((e) => e.t.toFixed(3))).size;
  return onsets / Math.max(1, bars) <= SPARSE_PER_BAR;
}

/** Every voice of a plan whose part is a sparse struck front (`frontVoice`). */
export function frontVoices(events: StageEvent[]): Set<string> {
  const by = new Map<string, StageEvent[]>();
  for (const e of events) if (e.layer === 'keys') { let l = by.get(e.voice); if (!l) by.set(e.voice, (l = [])); l.push(e); }
  return new Set([...by].filter(([, l]) => frontVoice(l)).map(([v]) => v));
}

/**
 * **The kit's room, by the birds** (rule 2): the short room's two tails drawn apart (its correlation from the house's
 * 0.7 to 0.45, the place's own where it states one), its top opened to 13 kHz, its size by Tide and Veil, and the
 * floor every hit of the kit's top sends into it. Zephyr opens it (air), a dense fast kit narrows it (the references
 * keep a busy top tighter); a driving kit in a dry room keeps less of its two ears (`kitAirOf`).
 */
export function roomOf(spell: Record<string, number>, place: { roomCorr?: number; roomSeconds?: number; roomHighHz?: number },
  base: { roomSeconds: number; roomHighHz: number; kitRoom: number }, dense: number) {
  const ze = (spell.zephyr ?? HOUSE.zephyr) - HOUSE.zephyr;
  const ti = (spell.tide ?? HOUSE.tide) - HOUSE.tide;
  const ve = (spell.veil ?? HOUSE.veil) - HOUSE.veil;
  const air = kitAirOf(spell);
  return {
    sends: {
      roomCorr: r3(clamp((place.roomCorr ?? 0.45) - 0.3 * ze + 0.15 * dense, 0.15, 0.75)),
      // a busy fast top in a big room smears its transients: the dense kit's room is the shorter
      roomSeconds: r3(clamp((place.roomSeconds ?? base.roomSeconds) * (1 + 0.6 * ti + 0.3 * ve) * (1 - 0.3 * dense), 0.2, 0.55)),
      roomHighHz: Math.round(Math.max(place.roomHighHz ?? base.roomHighHz, 13000)),
    },
    space: { kitRoom: r3(clamp(base.kitRoom * (1 + 0.9 * ze) * (1 - 0.4 * dense), 0.08, 0.4)), ...(air < 1 ? { kitAir: air } : {}) },
  };
}

/**
 * **A driving kit in a dry room plays tight** (round kit-tight; his ear 11-01 on Drive - Tailwind: *"the space is to big
 * for that beat … it kind of defeats the original sound, more condenced tech house rythm"*): how much of the kit's
 * two-ear spread (`space.kitAir`) a theme keeps. Only Ember and Tide together: Ember from 0.45 to 0.75 the drive, Tide
 * from 0.4 to nought the dryness; their product takes the spread down to a third. Either alone moves nothing, so a
 * relaxed groove or a wet mix keeps the room it has.
 */
export function kitAirOf(spell: Record<string, number>): number {
  return r3(1 - (2 / 3) * tightOf(spell));
}
/** How driving and how dry a theme is, nought to one: Ember's drive times Tide's dryness (`kitAirOf`, the plate). */
export function tightOf(spell: Record<string, number>): number {
  const drive = clamp(((spell.ember ?? HOUSE.ember) - 0.45) / 0.3, 0, 1);
  const dry = clamp((0.4 - (spell.tide ?? HOUSE.tide)) / 0.4, 0, 1);
  return drive * dry;
}
// **A driving dry theme carries less plate** (round kit-tight; his ear 11-01 on Drive - Tailwind's keys pluck, which
// read as a snare in a wide hall): as `tightOf` rises past a quarter a sparse struck front moves less of its wash into
// the plate and keeps the rest where it was mixed, none from three quarters (`frontShareOf` in `stagePass`, round
// tide-space: kit-tight's switch at a half, as a slope about it). A plate's bright ring is what the birds asked a dry
// track not to have.

/**
 * **A keyboard stands across the field** (round voice-homes, his word 11-01: *"sparse piano should get that extra width
 * because it just doesn't sound good dry"*): a voice whose home spreads by pitch (its row's `home.spread`, the piano)
 * seats each note by its pitch about its part's middle, low to one side and high to the other, in phase, as a
 * keyboard's strings stand before a listener. The middle is the part's mean pitch over eight bars (stereo-room's bar
 * by bar kept a melody of a note a bar dead in the middle, and moved a note's seat from bar to bar), so a line walks
 * the keyboard and the part still sums in the middle over its phrase. The spread is wider where the part leaves room
 * around its notes and narrower where it comps (a dense spread smears): `KEYBOARD.sparse` times the room's spread at
 * two onsets a sounding bar or fewer, `dense` at four or more, a line between; no seat past `KEYBOARD.edge` (rule 4's
 * edge for a fan of parts: rule 1's ±0.35 gives way for an instrument that is itself a spread). Read by the compiler
 * off the plan, so the plan's notes carry no mark of it; by event index, the seat a number in -edge..edge.
 */
/** a voice's home, its row's word (`descriptor.home`, round voice-homes); never its name */
export const homeOf = (voice: string): { spread?: 'pitch'; body?: number } | undefined => BY_NAME[voice]?.row?.descriptor.home;
export const spreadsByPitch = (voice: string): boolean => homeOf(voice)?.spread === 'pitch';
export const hasBody = (voice: string): boolean => (homeOf(voice)?.body ?? 0) > 0;
export const KEYBOARD = { bars: 8, sparse: 1.5, dense: 0.7, edge: 0.6 };
export function keyboardSeats(events: StageEvent[], spread: number, spreads: (voice: string) => boolean): Map<number, { seat: number; lift: number }> {
  const out = new Map<number, { seat: number; lift: number }>();
  for (const list of keyboardBlocks(events, spreads)) {
    const about = list.reduce((a, i) => a + (events[i].p.midi as number), 0) / list.length;
    const bars = new Set(list.map((i) => events[i].bar ?? Math.floor(events[i].t))).size;
    const onsets = new Set(list.map((i) => events[i].t.toFixed(3))).size;
    const k = KEYBOARD.sparse + (KEYBOARD.dense - KEYBOARD.sparse) * clamp((onsets / Math.max(1, bars) - 2) / 2, 0, 1);
    // (round voice-homes 2, his ear on Drive - Slow Burn: *"lost a bit in volume and reads worse"*) **the spread costs
    // no level**: the panner's fold played a note off the middle louder (`piano.ts` now takes it back note by note), and
    // the piano's lane was balanced with it, so the part keeps the loudness its seats about the bar's middle gave it
    // (stereo-room's: 1 + cos((1 - |seat|) π / 2) in power, by its notes' strike), as one lift over the block
    const bar = new Map<number, number[]>();
    for (const i of list) { const b = events[i].bar ?? Math.floor(events[i].t); let l = bar.get(b); if (!l) bar.set(b, (l = [])); l.push(events[i].p.midi as number); }
    let w = 0, f = 0;
    for (const i of list) {
      const m = events[i].p.midi as number, near = bar.get(events[i].bar ?? Math.floor(events[i].t))!;
      const was = clamp((m - near.reduce((a, x) => a + x, 0) / near.length) / 14 * spread, -1, 1);
      const v = Number(events[i].p.vel ?? 0.7), wt = v * v;
      w += wt; f += wt * (1 + Math.cos((1 - Math.abs(was)) * Math.PI / 2));
    }
    const lift = r3(Math.sqrt(w > 0 ? f / w : 1));
    for (const i of list) out.set(i, { seat: r3(clamp(((events[i].p.midi as number) - about) / 14 * spread * k, -KEYBOARD.edge, KEYBOARD.edge)), lift });
  }
  return out;
}

/** a keyboard voice's notes by voice and eight-bar block (`KEYBOARD.bars`), as event indices */
function keyboardBlocks(events: StageEvent[], spreads: (voice: string) => boolean): number[][] {
  const blocks = new Map<string, number[]>();
  events.forEach((e, i) => {
    if (e.layer !== 'keys' || typeof e.p.midi !== 'number' || !spreads(e.voice)) return;
    const k = `${e.voice}:${Math.floor((e.bar ?? Math.floor(e.t)) / KEYBOARD.bars)}`;
    let l = blocks.get(k); if (!l) blocks.set(k, (l = [])); l.push(i);
  });
  return [...blocks.values()];
}

/**
 * **A rhythmic keyboard articulates** (round voice-homes 2, his ear 11-01 on Vibe - Drizzle: *"a bit too much sustain …
 * have piano a bit more dynamic too? not just trails?"*). Where a keyboard part plays as rhythm, a pianist comps with
 * the dampers: each note lets go near its written length, and the accents stand out. Read off the part's own rhythm,
 * eight bars at a time: how dense it is (`dense`, onsets a sounding bar, none at 1.5, all at 3.5) and how short its
 * notes are (`short`, the median written length in beats, none at three, all at 1.25), their geometric mean, leaned by
 * Ember's drive (`space.keysTouch`, `touchLeanOf`). A part that plays as rhythm (`r` of it):
 *   - its pedal goes, and the key lets go a little early: held 1 - 0.25 r of its written length (détaché, a comp's
 *     touch) and its ring times 1 - r (`p.held`; the damper then
 *     stops it, 0.15 s), while the string is the one its full life asks for (so its strike keeps its loudness);
 *   - its dynamics widen: each velocity's distance from the block's mean times 1 + 2 r, the hits on a beat `beat` r
 *     harder and those off the eighths as much softer (a velocity is a strike's level and its brightness), the
 *     block's strike power held where it was.
 * A sparse melodic piano (two onsets a bar, notes of a bar or more) reads nought and keeps its ring. By event index.
 */
export const TOUCH = { dense: [1.5, 3.5], short: [3, 1.25], ring: 1, detache: 0.25, spread: 2, beat: 0.08 };
export function keyboardTouch(events: StageEvent[], barSeconds: number, ring: (voice: string) => number, lean: number,
  spreads: (voice: string) => boolean): Map<number, { vel: number; held: number }> {
  const out = new Map<number, { vel: number; held: number }>();
  const beat = barSeconds / 4;
  for (const list of keyboardBlocks(events, spreads)) {
    const bars = new Set(list.map((i) => events[i].bar ?? Math.floor(events[i].t))).size;
    const onsets = new Set(list.map((i) => events[i].t.toFixed(3))).size;
    const durs = list.map((i) => Number(events[i].p.dur ?? 0.6) / beat).sort((a, b) => a - b);
    const d = clamp((onsets / Math.max(1, bars) - TOUCH.dense[0]) / (TOUCH.dense[1] - TOUCH.dense[0]), 0, 1);
    const s = clamp((TOUCH.short[0] - durs[Math.floor(durs.length / 2)]) / (TOUCH.short[0] - TOUCH.short[1]), 0, 1);
    const r = clamp(Math.sqrt(d * s) * lean, 0, 1);
    if (!(r > 0.01)) continue;
    const vel = (i: number) => Number(events[i].p.vel ?? 0.7);
    const mean = list.reduce((a, i) => a + vel(i), 0) / list.length;
    const wide = list.map((i) => {
      const ph = ((events[i].t / beat) % 1 + 1) % 1;
      const on = ph < 0.06 || ph > 0.94 ? 1 : Math.abs(ph - 0.5) < 0.06 ? 0 : -1;
      return clamp(mean + (vel(i) - mean) * (1 + TOUCH.spread * r) + TOUCH.beat * r * on, 0.08, 1);
    });
    // ...about the part's own loudness: the strikes' power (a velocity's level is its square) held to what it was, so
    // the accents stand out by contrast and the part is no louder for them
    const k = Math.pow(list.reduce((a, i) => a + vel(i) ** 4, 0) / Math.max(1e-9, wide.reduce((a, v) => a + v ** 4, 0)), 0.25);
    list.forEach((i, j) => out.set(i, { vel: r3(clamp(wide[j] * k, 0.08, 1)),
      held: r3(Number(events[i].p.dur ?? 0.6) * (1 - TOUCH.detache * r) + (typeof events[i].p.ring === 'number' ? events[i].p.ring as number : ring(events[i].voice)) * (1 - TOUCH.ring * r)) }));
  }
  return out;
}
/** Ember's lean on a rhythmic keyboard (`keyboardTouch`): a driving theme comps tighter, a gentle one rings more; 1 at the house */
export const touchLeanOf = (spell: Record<string, number>): number => r3(1 + 0.5 * clamp(((spell.ember ?? HOUSE.ember) - HOUSE.ember) / 0.4, -1, 1));

/**
 * **A voice's own body** (round voice-homes): the soundboard and a close early reflection, which a piano has at every
 * distance, as one shared return (`settings.returns.body`): a small room a third of a second long, two ears near the
 * small room's own (0.55), its bottom and top trimmed, three milliseconds behind the note. A voice whose home has a
 * body (`home.body`) sends that much of its note into it (`bodySends`), at every Tide: Tide scales the tail above it
 * (the wash, the hall, the plate), never the instrument. Built only where such a voice plays.
 */
export const BODY = { seconds: 0.35, predelayMs: 3, lowCutHz: 400, dampHz: 7000, trimDb: 3.5 };
export function bodyRow(): SpaceRow {
  return asSpace({ schema: 1, kind: 'space', id: 'voiceBody', revision: 1, dry: 1, trimDb: BODY.trimDb, inserts: [],
    sends: [{ id: 'body', level: 1, effect: 'reverb', params: { mode: 0, decaySeconds: BODY.seconds, predelayMs: BODY.predelayMs, lowCutHz: BODY.lowCutHz, dampHz: BODY.dampHz, level: 2, mix: 1 } }] });
}
/** a note of a voice with a body into it (`home.body`), through the send's door; nought or absent, the note as it was */
export function bodySends(p: NoteParams, body: number | undefined): NoteParams {
  // (round voice-homes 3) a note that plays in its part's own room (`partSpace`, the liquid keys') takes no second one:
  // the body there measured +2 dB on the far grand's keys and smeared the space they were written for
  if (!(typeof body === 'number' && body > 0) || Number(p.partSpace ?? 0) > 0) return p;
  return { ...p, returns: { ...((p.returns as Record<string, unknown> | undefined) ?? {}), 'body.body': r3(body) } };
}

/**
 * The plan's pass (rules 1 to 3), over the events as they play: the kit's top about its middle, whether the theme
 * carries the plate (a sparse struck front plays), and how dense the kit's top is (its
 * hits a sounding bar, at a fast tempo): what `roomOf` narrows by. Returns what the theme's room is to carry.
 */
export function stagePass(events: StageEvent[], bpm: number, spell: Record<string, number>, drums = false,
  bodied: (voice: string) => boolean = () => false): { dense: number; front: SpaceRow | null; frontShare: number; body: SpaceRow | null } {
  const byVoice = new Map<string, StageEvent[]>();
  for (const e of events) { let l = byVoice.get(e.voice); if (!l) byVoice.set(e.voice, (l = [])); l.push(e); }
  let fronts = 0;
  for (const list of byVoice.values()) {
    const keys = list.filter((e) => e.layer === 'keys');
    if (!keys.length) continue;
    if (frontVoice(keys)) fronts++;
  }
  // the kit's top about the middle (rule 1): its hits' pans sum in the middle (a level never moves them), so a
  // seat to one side is a placement the rest of the kit answers and never the kit leaning into one ear
  // (the hand player is not the kit: a hand drum names its drum and stands on its own stage, `hand-phrase.ts`)
  const top = events.filter((e) => (e.layer === 'hats' || e.layer === 'shaker') && typeof e.p.pan === 'number' && !(e as { drum?: string }).drum);
  // (eight bars at a time and a layer at a time, so a section that plays one lane more than the rest still sums in
  // the middle, and the hats never move for what the shaker plays)
  if (top.length) {
    const blocks = new Map<string, StageEvent[]>();
    for (const e of top) { const k = `${e.layer}:${Math.floor((e.bar ?? 0) / 8)}`; let l = blocks.get(k); if (!l) blocks.set(k, (l = [])); l.push(e); }
    for (const list of blocks.values()) {
      const middle = list.reduce((a, e) => a + (e.p.pan as number), 0) / list.length;
      if (Math.abs(middle) > 0.02) for (const e of list) e.p.pan = r3(onStage((e.p.pan as number) - middle));
    }
  }
  const hats = events.filter((e) => e.layer === 'hats' || e.layer === 'shaker');
  const hatBars = new Set(hats.map((e) => e.bar ?? 0)).size;
  const perBar = hats.length / Math.max(1, hatBars);
  const dense = clamp((bpm - 115) / 55, 0, 1) * clamp(perBar / 16, 0, 1);
  const frontShare = frontShareOf(tightOf(spell));
  return { dense: r3(dense), front: fronts && frontShare > 0 ? frontRow(spell, drums) : null, frontShare,
    // (round voice-homes 3) a part that plays in a room of its own (the liquid keys' part space) brings its body with it
    body: events.some((e) => bodied(e.voice) && !(Number(e.p.partSpace ?? 0) > 0)) ? bodyRow() : null };
}
