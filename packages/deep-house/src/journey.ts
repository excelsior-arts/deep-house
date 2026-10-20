// **One long journey** (PLAN-AMBIENT Phase 6, ambient-psy, 10-18; his words of 10-17: *"looking for waves,
// psychodelical vibes ..."*). A composer mechanism that knows a row, the theme's sections and its events, never a
// genre; a place table says where it plays (`JOURNEY` in `styles/deep-house-places.ts`), and the theme's own lanes
// play under it as the composer drew them, in the place's own mode (`HarmonyEntry.scales`).
//
// **The music, as a producer hears it.** The whole theme is one trip through the macro filter. It begins near the
// dark end, opens to air over three to five minutes, holds there a while, and closes again over three to five more,
// down to some 400 Hz as the theme ends: one line over minutes, never a sweep per section. On the way up, the low
// end's parallel saturation (the push) comes in with the light, so the peak is warmer as well as brighter, and it
// leaves again on the way down. The held voices drift on tape: a slow sine of 10-20 cents with a shallow wobble on it,
// every held note of the theme on the same tape. The stage's own treatments turn slowly (its phasers and auto-pans
// at 0.03-0.08 Hz, its treatments weighed by the place's `TREATMENTS` row). The keys and the bed are sent into a
// shared return of two ping-pong echoes, a dotted eighth and a dotted quarter, fed back long and darkened on each
// pass. And where Spark allows, a soft broken pulse far back: a muted frame drum on a swung, broken sixteenth figure in
// the grooves, fuller as the filter opens.
//
// **The birds** lean the row about the place's own values (the one lean, `src/lean.ts`), each on one knob, so the
// place's own tile plays the row's numbers exactly: Veil the swirl's rate, Tide the echoes' feedback and their sends,
// Root the depth of the filter's dark end, Spark the pulse. Gleam's is the mode's brightness, on the harmony entry.
//
// **Draws off streams of their own** (`<seed>::journey:<what>`): the line's minutes, the drift, the pulse's voice and
// each phrase's figure. Nothing here draws from another planner's stream, so every die the theme had is where it was.
import { Rng } from './rng.ts';
import { leanFactor, leanShift, type BirdLeans } from './places.ts';
import { dbToGain } from '@deep-house/engine/dsp';
import { asSpace, type SpaceRow } from '@deep-house/engine/space';
import type { Spell } from './spell.ts';
import JOURNEY_FILE from '../recipes/ambient/journey.json' with { type: 'json' };

type Range = [number, number];
/** A role's voice: its weight, and a level of its own beside the role's. */
export interface JourneyVoice { v: string; w: number; db?: number }
export interface JourneyRow {
  id: string;
  /**
   * The macro line: from `fromShare` of the way up from the dark end at the theme's start, open to `airHz` over
   * `riseMinutes` (at most `riseMost` of the theme), held at most `holdMostS` (a longer hold starts the descent at the
   * peak, so the top breathes and never sits), closed over `fallMinutes` back to where it began by the theme's hand-over
   * floor (`handAt`), held there through any blend, and to `darkHz` over the theme's last two bars (`fallMinutes`
   * of it) as the theme ends; a knot every `stepS`, eased in and out in octaves.
   */
  filter: { darkHz: number; airHz: number; fromShare: number; riseMinutes: Range; fallMinutes: Range; riseMost: number; holdMostS: number; stepS: number };
  /** the push (the low end's parallel saturation) with the line: nought at the dark end, `peak` in the air */
  push: { peak: number };
  /** the tape drift on the layers named: its depth and rate, and the wobble on it, drawn once a theme */
  drift: { layers: string[]; cents: Range; hz: Range; wobbleCents: Range; wobbleHz: Range };
  /**
   * the held layer's level at the place, dB on its notes' gains, and the keys' (`keysDb`): the growl room's bed (the
   * strings pad most) stands its peaks 9-11 dB over the limiter's ceiling at a trim of nought, and a struck keys chord
   * thrown into the echoes some 10, a crest the trim alone (at most 6 dB down) cannot take down
   */
  bed: { layers: string[]; db: number; keysDb?: number };
  /**
   * The struck lead's chords (ambient-psy, his ear on seed 1, 10-18: "if it's loud please fix"): where the theme's lead
   * is the struck keys (a struck lead plays the stab lane), each chord it strikes is voiced as a lead plays one, its
   * `top` highest notes, touched as one strike (each at 1/√top of its gain, so the dyad sums to one note's level). A
   * four-note seventh struck on a bright lead and thrown into the echoes stood its peaks 5-6 dB into the limiter and
   * its level 2 dB over the bed, where the journey's keys stand under it; a lead under a held lead (the pad's) is a
   * figure, not the front, and keeps its chords as written.
   */
  leadChord?: { top: number };
  /** the stage's treatments' rate (the rota's roll mapped into it), Hz */
  swirl: { hz: Range };
  /**
   * The echoes: a shared return (`settings.returns.<id>`, a space row of sends only), the feedback its sends are fed at
   * (Tide leans it), and what each layer sends into it, by the return's send ids.
   */
  echo: { id: string; space: unknown; feedback: number; sends: Record<string, Record<string, number>> };
  /**
   * The pulse: a voice once a theme, in the sections of the kinds named; each four bars draws a figure (`x` a hit,
   * `o` a soft one), each hit kept at `keep` (Spark leans it, fuller as the line opens, `openShare` of it from the
   * line), its second sixteenths late by the swing; none under `sparkFrom`.
   */
  pulse: { voices: JourneyVoice[]; sections: string[]; sparkFrom: number; masks: Array<[string, number]>; keep: number; openShare: number; swing: number;
    vel: Range; soft: number; levelDb: number; dur: number; reverb: number; echo: number; lateMs: Range };
  birds: { by: BirdLeans['by']; most?: BirdLeans['most'] };
}

const ROWS = JOURNEY_FILE.rows as unknown as JourneyRow[];
export const JOURNEY_ROWS: readonly JourneyRow[] = Object.freeze(ROWS);
export const journeyRowOf = (id: string | null | undefined): JourneyRow | null => (id ? ROWS.find((r) => r.id === id) ?? null : null);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const range = (v: unknown, lo = -Infinity, hi = Infinity): boolean => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] <= v[1] && v[0] >= lo && v[1] <= hi;

/** Everything wrong with the journey rows, as sentences; `voiceExists` is the engine's word on a voice. */
export function journeyRowsFaults(voiceExists: (v: string) => boolean = () => true): string[] {
  const bad: string[] = [];
  for (const r of ROWS) {
    const at = (what: string) => `${r.id}: ${what}`;
    const F = r.filter;
    if (!(F.darkHz >= 150 && F.darkHz < F.airHz && F.airHz <= 20000)) bad.push(at('the line runs from a dark end over 150 Hz to its air, at most 20 kHz'));
    if (!(F.fromShare >= 0 && F.fromShare <= 1)) bad.push(at('fromShare in [0, 1]'));
    if (!range(F.riseMinutes, 0.5, 10) || !range(F.fallMinutes, 0.5, 10)) bad.push(at('the rise and the fall 0.5-10 minutes'));
    if (!(F.riseMost > 0 && F.riseMost < 0.75)) bad.push(at('the rise takes under three quarters of the theme, before its hand-over floor'));
    if (!(F.holdMostS >= 0 && F.holdMostS <= 120)) bad.push(at('the hold at the air 0-120 s'));
    if (!(F.stepS >= 1 && F.stepS <= 30)) bad.push(at('a knot every 1-30 s'));
    if (!(r.push.peak >= 0 && r.push.peak <= 0.6)) bad.push(at('the push\'s peak in [0, 0.6]'));
    const D = r.drift;
    if (!Array.isArray(D.layers) || !D.layers.length) bad.push(at('the drift names its layers'));
    if (!range(D.cents, 0, 30) || !range(D.hz, 0.01, 0.5) || !range(D.wobbleCents, 0, 8) || !range(D.wobbleHz, 0.2, 3)) bad.push(at('the drift a few cents, slow; the wobble shallower, under 3 Hz'));
    if (!range(r.swirl.hz, 0.005, 1)) bad.push(at('the swirl\'s rate 0.005-1 Hz'));
    if (!Array.isArray(r.bed?.layers) || !(finite(r.bed.db) && r.bed.db <= 0 && r.bed.db >= -12)) bad.push(at('the bed\'s level from -12 to 0 dB, on layers named'));
    if (r.bed?.keysDb !== undefined && !(finite(r.bed.keysDb) && r.bed.keysDb <= 0 && r.bed.keysDb >= -12)) bad.push(at('the keys\' level from -12 to 0 dB'));
    if (r.leadChord !== undefined && !(Number.isInteger(r.leadChord.top) && r.leadChord.top >= 1 && r.leadChord.top <= 4)) bad.push(at('the lead\'s chord keeps one to four notes'));
    try { asSpace(r.echo.space); } catch (e) { bad.push(at(`the echo's space: ${(e as Error).message}`)); }
    const space = (r.echo.space ?? {}) as { dry?: number; sends?: Array<{ id: string }> };
    const ids = (space.sends ?? []).map((x) => x.id);
    if (space.dry !== 0) bad.push(at('the echo\'s return carries no dry (the notes go dry on their own)'));
    if (!(r.echo.feedback >= 0 && r.echo.feedback <= 0.7)) bad.push(at('the echo\'s feedback in [0, 0.7]'));
    for (const [layer, sends] of Object.entries(r.echo.sends)) for (const [id, v] of Object.entries(sends))
      if (!ids.includes(id) || !(v >= 0 && v <= 1)) bad.push(at(`${layer} sends ${v} into ${id}`));
    const P = r.pulse;
    if (!P.voices?.some((x) => x.w > 0)) bad.push(at('the pulse draws no voice'));
    for (const x of P.voices ?? []) if (!voiceExists(x.v)) bad.push(at(`the pulse: ${x.v} is no voice`));
    if (!P.masks?.length || P.masks.some(([m, w]) => typeof m !== 'string' || m.length !== 16 || !/^[xo.]+$/.test(m) || !(w > 0))) bad.push(at('the pulse\'s figures are sixteen steps of x, o and .'));
    if (!(P.sparkFrom >= 0 && P.sparkFrom <= 1) || !(P.keep > 0 && P.keep <= 1) || !(P.openShare >= 0 && P.openShare <= 1)) bad.push(at('the pulse\'s sparkFrom, keep and openShare in [0, 1]'));
    if (!(P.swing >= 0.5 && P.swing <= 0.75)) bad.push(at('the swing from 0.5 (straight) to 0.75'));
    if (!range(P.vel, 0, 1) || !(P.soft > 0 && P.soft <= 1) || !finite(P.levelDb) || P.levelDb > 0 || P.levelDb < -30) bad.push(at('the pulse\'s touch and its level from -30 to 0 dB'));
    if (!range(P.lateMs, 0, 60) || !(P.reverb >= 0 && P.reverb <= 1) || !(P.echo >= 0 && P.echo <= 1) || !(P.dur > 0)) bad.push(at('the pulse\'s lateness, sends and length'));
    for (const [bird, knobs] of Object.entries(r.birds.by)) for (const k of Object.keys(knobs ?? {}))
      if (!['swirl', 'feedback', 'wet', 'dark', 'pulse'].includes(k)) bad.push(at(`${bird} leans ${k}, which the planner reads nowhere`));
  }
  return bad;
}

/** One of the journey's events, as the composer pushes it. */
export interface JourneyEvent { voice: string; t: number; bar: number; step: number; part: 'journey-pulse'; p: Record<string, number | Record<string, number>> }

export interface JourneySummary {
  row: string;
  /** the line's knots: where it starts, opens, holds and closes (s), and its two ends (Hz) */
  line: { fromHz: number; airHz: number; darkHz: number; riseFrom: number; riseTo: number; fallFrom: number; handAt: number; fallTo: number };
  drift: { cents: number; hz: number; wobbleCents: number; wobbleHz: number; notes: number };
  swirl: Range;
  echo: { feedback: number; wet: number; notes: number };
  pulse: { voice: string | null; hits: number; why?: string };
  /** the struck lead's chords voiced as a lead's (the row's `leadChord`): how many, and the notes they gave up */
  lead?: { top: number; chords: number; dropped: number };
  says: string;
}

export interface JourneyInput {
  seed: string;
  row: JourneyRow;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  bars: number;
  barSeconds: number;
  /**
   * the second the theme may hand over from (its style's seam floor, `set.seamFloor`, of its length): the line stands back
   * where it began there and reaches the dark end only across the blend, so a seam never lands in the dark
   */
  handAt: number;
  spell: Spell;
  /** the place's own birds, every bird named: the leans' centre */
  centre: Readonly<Record<string, number>>;
  /** the dB a voice is moved by to stand on the keys layer's footing (its layer's room level against the keys') */
  layerDbOf: (voice: string) => number;
  /** whether the cast has room for a voice besides what it sounds (the catalogue's ceiling) */
  roomFor: (voice: string, returnSpace: SpaceRow) => boolean;
}

const ease = (u: number) => u * u * (3 - 2 * u);
const between = (r: Rng, [a, b]: Range) => a + (b - a) * r.next();
const turn = (x: number) => +(((x % 1) + 1) % 1).toFixed(5);

/**
 * **The journey over a theme**: the macro line's and the push's points (theme seconds), the drift and the sends to
 * write on the held and the struck notes, the return to build, the stage's rate, and the pulse's events.
 */
export function planJourney(I: JourneyInput) {
  const R = I.row;
  const L: BirdLeans = { centre: I.centre, by: R.birds.by, ...(R.birds.most ? { most: R.birds.most } : {}) };
  const factor = (knob: string) => leanFactor(L, knob, I.spell);
  const shift = (knob: string) => leanShift(L, knob, I.spell);
  const T = I.bars * I.barSeconds;

  // --- the line: from near the dark end, open over minutes, held, closed over minutes as the theme ends ---
  const F = R.filter;
  const rl = new Rng(`${I.seed}::journey:line`);
  const darkHz = +(F.darkHz * factor('dark')).toFixed(1);
  const airHz = F.airHz;
  const fromHz = +(darkHz * Math.pow(airHz / darkHz, F.fromShare)).toFixed(1);
  const handAt = Math.max(0, Math.min(T, I.handAt));
  const riseTo = Math.min(between(rl, F.riseMinutes) * 60, F.riseMost * T, 0.75 * handAt);
  const fall = between(rl, F.fallMinutes) * 60;
  // the descent back to the line's start ends at the hand-over floor; a hold at the air longer than `holdMostS` starts
  // it at the peak instead, slower, so the top breathes
  const held = handAt - fall - riseTo;
  const riseFrom = 0, fallTo = T, fallFrom = held > F.holdMostS ? riseTo : Math.max(riseTo, handAt - fall);
  const darkFrom = Math.max(handAt, T - 2 * I.barSeconds);
  /** where the line stands at t, as a share of the way from the dark end to the air (in octaves) */
  const openAt = (t: number): number => {
    if (t <= riseTo) return F.fromShare + (1 - F.fromShare) * ease(Math.max(0, t - riseFrom) / Math.max(1e-6, riseTo - riseFrom));
    if (t < fallFrom) return 1;
    if (t < handAt) return F.fromShare + (1 - F.fromShare) * (1 - ease((t - fallFrom) / Math.max(1e-6, handAt - fallFrom)));
    // where the theme may hand over, the line holds where it began: a blend from the floor on crosses the next theme's
    // own start at the same corner, and the dark end is the theme's last two bars, behind every blend the set can lay
    // (a blend ends two bars before the theme does, `seamPlan`)
    if (t < darkFrom) return F.fromShare;
    return F.fromShare * (1 - ease(Math.min(1, (t - darkFrom) / Math.max(1e-6, fallTo - darkFrom))));
  };
  const hzAt = (t: number) => +(darkHz * Math.pow(airHz / darkHz, openAt(t))).toFixed(2);
  const knots = new Set<number>([0, riseTo, fallFrom, handAt, darkFrom, fallTo]);
  for (let t = 0; t < T; t += F.stepS) knots.add(+t.toFixed(3));
  const times = [...knots].filter((t) => t >= 0 && t <= T).sort((a, b) => a - b);
  const macroFilter = times.map((t) => ({ t: +t.toFixed(3), value: hzAt(t) }));
  const push = times.map((t) => ({ t: +t.toFixed(3), value: +(R.push.peak * Math.max(0, (openAt(t) - F.fromShare) / Math.max(1e-6, 1 - F.fromShare))).toFixed(4) }));

  // --- the drift, once a theme ---
  const rd = new Rng(`${I.seed}::journey:drift`);
  const D = R.drift;
  const drift = { cents: +between(rd, D.cents).toFixed(2), hz: +between(rd, D.hz).toFixed(4), wobbleCents: +between(rd, D.wobbleCents).toFixed(2), wobbleHz: +between(rd, D.wobbleHz).toFixed(3),
    phase: rd.next(), wobblePhase: rd.next() };
  /**
   * a held note's drift at its onset: both sines where the theme's tape stands then. The engine's sine at a phase a is
   * cos(ωτ − a) from the note's start (`phasedLfo`), so the tape's cos(ω(t + τ) + θ) is the phase −(θ + ωt), in turns
   */
  const driftAt = (t: number) => ({ cents: drift.cents, hz: drift.hz, phase: turn(-(drift.phase + t * drift.hz)), wobbleCents: drift.wobbleCents, wobbleHz: drift.wobbleHz,
    wobblePhase: turn(-(drift.wobblePhase + t * drift.wobbleHz)) });

  // --- the swirl and the echoes ---
  const sw = factor('swirl');
  const swirl: Range = [+(R.swirl.hz[0] * sw).toFixed(4), +(R.swirl.hz[1] * sw).toFixed(4)];
  const feedback = +Math.max(0, Math.min(0.7, R.echo.feedback + shift('feedback'))).toFixed(3);
  const wet = +Math.min(2, factor('wet')).toFixed(4);
  const raw = R.echo.space as SpaceRow;
  const space = asSpace({ ...raw, sends: raw.sends.map((x) => (x.effect === 'tapeDelay' ? { ...x, params: { ...x.params, feedback } } : x)) });
  const sendsOf = (layer: string): Record<string, number> | null => {
    const s = R.echo.sends[layer];
    if (!s) return null;
    return Object.fromEntries(Object.entries(s).map(([id, v]) => [`${R.echo.id}.${id}`, +Math.min(1, v * wet).toFixed(4)]));
  };

  // --- the pulse, where Spark allows and the cast has room ---
  const P = R.pulse;
  const events: JourneyEvent[] = [];
  const rv = new Rng(`${I.seed}::journey:pulse`);
  const drawn = rv.weighted(P.voices.map((x) => ({ v: x, w: x.w })));
  let pulseVoice: string | null = null, why: string | undefined;
  if (I.spell.spark < P.sparkFrom) why = `Spark under ${P.sparkFrom}`;
  else if (!I.roomFor(drawn.v, space)) why = 'no room in the cast';
  else {
    pulseVoice = drawn.v;
    const keep = Math.min(1, P.keep * factor('pulse'));
    const s16 = I.barSeconds / 16;
    const late = (P.swing - 0.5) * 2 * s16;
    const footing = I.layerDbOf(pulseVoice) + (drawn.db ?? 0);
    for (const sec of I.sections) {
      if (!P.sections.includes(sec.kind)) continue;
      for (let b0 = sec.startBar; b0 < sec.startBar + sec.bars; b0 += 4) {
        const rp = new Rng(`${I.seed}::journey:pulse:${b0}`);
        const mask = rp.weighted(P.masks.map(([m, w]) => ({ v: m, w })));
        for (let b = b0; b < Math.min(b0 + 4, sec.startBar + sec.bars, I.bars); b++) {
          for (let step = 0; step < 16; step++) {
            const ch = mask[step];
            const roll = rp.next(), vr = rp.next(), lr = rp.next();
            if (ch === '.') continue;
            const t0 = b * I.barSeconds + step * s16 + (step % 2 === 1 ? late : 0);
            const open = openAt(t0);
            if (roll >= keep * (1 - P.openShare + P.openShare * open)) continue;
            const vel = (P.vel[0] + (P.vel[1] - P.vel[0]) * vr) * (ch === 'o' ? P.soft : 1);
            const t = +(t0 + (P.lateMs[0] + (P.lateMs[1] - P.lateMs[0]) * lr) / 1000).toFixed(4);
            events.push({ voice: pulseVoice, t, bar: b, step, part: 'journey-pulse',
              p: { vel: +vel.toFixed(3), gain: +dbToGain(P.levelDb + footing).toFixed(5), dur: P.dur, reverb: P.reverb,
                ...(P.echo > 0 && sendsOf('pulse') ? { returns: sendsOf('pulse')! } : {}) } });
          }
        }
      }
    }
  }

  const summary: JourneySummary = {
    row: R.id,
    line: { fromHz, airHz, darkHz, riseFrom, riseTo: +riseTo.toFixed(2), fallFrom: +fallFrom.toFixed(2), handAt: +handAt.toFixed(2), fallTo: +fallTo.toFixed(2) },
    drift: { cents: drift.cents, hz: drift.hz, wobbleCents: drift.wobbleCents, wobbleHz: drift.wobbleHz, notes: 0 },
    swirl,
    echo: { feedback, wet, notes: 0 },
    pulse: { voice: pulseVoice, hits: events.length, ...(why ? { why } : {}) },
    says: '',
  };
  return { macroFilter, push, driftAt, sendsOf, space, swirl, events, summary, openAt };
}

/**
 * Two lines of points in theme seconds as one, the higher of the two at every knot of either (each read linearly
 * between its own knots, held past its ends): the push the arrangement marks and the journey's rise, together.
 */
export function higherOf(a: ReadonlyArray<{ t: number; value: number }>, b: ReadonlyArray<{ t: number; value: number }>): Array<{ t: number; value: number }> {
  const at = (pts: ReadonlyArray<{ t: number; value: number }>, t: number) => {
    if (!pts.length) return 0;
    if (t <= pts[0].t) return pts[0].value;
    for (let i = 1; i < pts.length; i++) if (t <= pts[i].t) { const p = pts[i - 1], q = pts[i]; return q.t === p.t ? q.value : p.value + (q.value - p.value) * (t - p.t) / (q.t - p.t); }
    return pts[pts.length - 1].value;
  };
  const times = [...new Set([...a.map((p) => p.t), ...b.map((p) => p.t)])].sort((x, y) => x - y);
  return times.map((t) => ({ t, value: +Math.max(at(a, t), at(b, t)).toFixed(4) }));
}

/** The journey's one line for a listener: the line's minutes, the drift, the echoes, the pulse. */
export function journeySays(s: JourneySummary): string {
  const m = (x: number) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  return `the filter ${Math.round(s.line.fromHz)} Hz → air by ${m(s.line.riseTo)}, closing from ${m(s.line.fallFrom)}, back to ${Math.round(s.line.fromHz)} Hz at ${m(s.line.handAt)} and held, ${Math.round(s.line.darkHz)} Hz at the end · `
    + `drift ±${s.drift.cents} c at ${s.drift.hz} Hz on ${s.drift.notes} held notes · swirl ${s.swirl[0]}-${s.swirl[1]} Hz · `
    + `echoes fb ${s.echo.feedback} on ${s.echo.notes} notes · pulse ${s.pulse.voice ? `${s.pulse.voice} ×${s.pulse.hits}` : `none (${s.pulse.why})`}`
    + (s.lead?.chords ? ` · the lead's ${s.lead.chords} chords in ${s.lead.top === 1 ? 'single notes' : `${s.lead.top}s`}` : '');
}

/** A note the lead's chords are read from: the stab lane's, as the composer pushed it. */
interface Struck { t: number; voice: string; bar?: number | null; step?: number | null; p: { midi?: number; gain?: number } }

/**
 * **The struck lead's chords, voiced as a lead's** (the row's `leadChord`): the notes given, the lead's own (its stab
 * lane's), grouped into the chords they were struck as (one bar, one step, one voice, inside a strum's 0.1 s), and of
 * each chord the `top` highest kept, each at 1/√top of its gain (a chord of no more notes than `top` is touched the same
 * way, a single note not at all). Hands back the notes it drops; the kept ones' gains are written onto copies of their
 * params. Pure in the notes given: nothing is drawn.
 */
export function leadChords<E extends Struck>(notes: readonly E[], top: number): { drop: Set<E>; chords: number } {
  const drop = new Set<E>();
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  const chords: E[][] = [];
  for (const e of sorted) {
    const c = chords[chords.length - 1];
    if (c && c[0].bar === e.bar && c[0].step === e.step && c[0].voice === e.voice && e.t - c[0].t < 0.1) c.push(e);
    else chords.push([e]);
  }
  let n = 0;
  for (const c of chords) {
    if (c.length < 2) continue;
    n++;
    const byPitch = [...c].sort((a, b) => (b.p.midi ?? 0) - (a.p.midi ?? 0));
    const kept = byPitch.slice(0, top);
    for (const e of byPitch.slice(top)) drop.add(e);
    const g = 1 / Math.sqrt(kept.length);
    for (const e of kept) if (kept.length > 1) e.p = { ...e.p, gain: +(Number(e.p.gain ?? 1) * g).toFixed(6) };
  }
  return { drop, chords: n };
}
