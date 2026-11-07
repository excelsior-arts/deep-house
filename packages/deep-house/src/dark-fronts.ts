// **The front where the bass leads** (round dark-fronts, his ear 11-03 on two pages of sketches): in a place that turned
// the roles round (the reese carries the sub, the kick the rhythm), the theme's front lane is written by the row
// (`recipes/arrangement/dark-fronts.json`): the drop's lead by the beat (a crushed pluck where the kick leaves room in
// the bar, swelling chords where it does not), the formant call's long curves at the build's end and through the breaks,
// trading with the pluck in some drop segments, and the dark bell as hints. Nothing here names a genre; the voices are
// the row's, the choices the birds' and the plan's own beat. The writer is `frontSketch` (`src/front-sketch.ts`).

import DARK_FRONTS_FILE from '../recipes/arrangement/dark-fronts.json' with { type: 'json' };
import { frontSketch } from './front-sketch.ts';
import { relayEvents } from './roles.ts';
import { CEILING } from './catalogue-v2.ts';
import { settingsOf } from '@deep-house/engine/settings';
import { costOf as effectsCost } from '@deep-house/engine/effects';
import { BY_NAME, ROWS, VOICE_COST_UNITS, VOICE_LEVEL, timbreOfNote } from '@deep-house/engine/voices';
import { topsOver, type TopsLines, type TopsReadEvent } from './tops-read.ts';
import WET_FIT from '@deep-house/engine/voices/wet-fit' with { type: 'json' };
import { RETURN_COST } from '@deep-house/engine/master';
import { laneLevelDb } from './lane-level.ts';
import Rng from './rng.ts';
import { stepToBeats } from './patterns.ts';
import { buildBack, materialCycle } from './break-form.ts';
import { grownBy, type LongMainHint } from './long-main.ts';
import { feltPulseOf } from './beat-reading.ts';
import type { Track } from './generator.ts';
import type { Spell } from './spell.ts';
import type { Style } from '@deep-house/engine/style';

interface DarkFrontsRow {
  id: string; roles: string[]; leastBpm: number; halfTimeKicks: number;
  pluck: string; swell: string; call: string; bell: string;
  callUnderLoom: number; mainFrom: number; trade: { every: number; from: number; bars: number };
  lift: { hz: number; db: number; q: number; floorHz: number }; bellDb: number; throwDb: number; keepLead: string[]; keepLeadPerBar: number; keepLeadRange: number; keepLeadRepeat: number; keepLeadMedian: number;
  draw: { untouched: number; untouchedNoFront: number; pluck: number; swellMoment: number; momentBars: number; callBreak: number; callBuild: number; bell: number; throw: number; loops: number }; swellBesideLead: number;
  hintNotes: [number, number]; hintAir: number; oneBreakAir: number; throwAir: number; lid: [number, number]; gain: number;
  colour: Colour; regrind: Record<string, string>; answer: { voice: string; callDb: number }; liftVoices: ('call' | 'pluck' | 'swell')[];
  wet: Wet; underDb: number;
  form: { splitFrom: number; passage: { phrases: number; cycles: number; feltBars: number }; build: { lp: [number, number]; gainDb: number } };
  movement: { air: number; root: number; openMul: [number, number, number]; wobble: number };
}
/** Tide's wetness (the ninth pass): each pair a bird's or a measure's two ends. */
interface Wet {
  tide: [number, number]; die: [number, number];
  sound: { onsetMs: [number, number]; tail: [number, number]; low: [number, number] };
  register: [number, number, number]; dubFrom: number; strike: number; strikeDb: number; echo: number; roomDelay: number; reverb: number;
  throw: { echo: number; reverb: number; chance: number };
  played: { lenS: [number, number]; perBar: [number, number] }; frozen: ('pluck' | 'bell' | 'call' | 'swell')[];
}
/** The voices' measured facts the wetness reads (`tools/wet-fit-table.ts`). */
const WET_TABLE = (WET_FIT as unknown as { voices: Record<string, { onset: number; tail: number; low: number }> }).voices;
/** The accents' grind by the birds (the eighth pass): each pair from one end of its bird to the other. */
interface Colour {
  voices: string[]; lidVoices: string[]; makeupDb: Record<string, number>;
  grind: [number, number]; bits: [number, number]; holdHz: [number, number]; drive: [number, number]; smear: [number, number];
  event: { depth: number; bars: [number, number]; phrase: number };
  lid: { refHz: number; refTilt: number; dbPerOctave: number; least: number; most: number };
}
export const DARK_FRONTS: DarkFrontsRow = (DARK_FRONTS_FILE as unknown as { rows: DarkFrontsRow[] }).rows[0];

/** What the rule read and chose for a theme, said on the plan (`darkFronts`). */
export interface DarkFrontsRead { kicksPerBar: number; lead: 'pluck' | 'swell' | 'kept' | 'untouched' | 'today';
  /** the call's drawn breaks (by index) and the build's end, the swells' drawn moments (their first bars) */
  callBreaks?: number[]; callBuild?: boolean; moments?: number[]; phrasing: string; air: number; hints: number; throws: boolean;
  /** what the phone's ceiling took out, where it took any */
  shed?: string;
  /** the accents' colour (the eighth pass): the ground share, the crush, the tape, the grains, the lid, the bed's top read */
  colour?: { grind: number; bits: number; holdHz: number; drive: number; smear: number; lidHz: number; bedTilt: number | null; events: number };
  /** the front's movement (the tenth pass): its grit, how far a held chord's filter opens (under one, closes), the call's wobble */
  movement?: { grit: number; openMul: number; wobble: number };
  /** the break's form (the ninth pass): each break's part by index, the groove passages, the bars cut, the break that builds */
  form?: { roles: Record<number, string>; passages: Array<{ from: number; bars: number; grow: number }>; build: number | null;
    /** the bar from which the groove's bass arrives under the intro (the tenth pass), where it does */
    seeded?: number;
    /** the first plan's ask (the tenth pass): each long break the call plays, in two around a groove passage, for the plan's second ask */
    wants?: LongMainHint['splits'] };
  /** the first plan's draws (the tenth pass), handed to the second plan so it draws nothing again */
  given?: DarkFrontsGiven;
  /** Tide's wetness on the lead's chords (the ninth pass): the voice's ceiling, the theme's draw, struck short or not, the echo return on the phone's budget */
  wet?: { ceiling: number; amount: number; dub: boolean; echo: boolean; thrown: number;
    /** the other struck parts Tide took, by voice and section start: the share it took */
    notes?: Record<string, number> } }

/**
 * **What the first plan drew** (the tenth pass): the theme is planned once, its die cast here, and where its form is to
 * change (a long break in two around a passage, long-main's half-break) planned again with the splits in its form and
 * these draws given, in the first plan's bar numbering (`grownBy` moves them where the theme grew).
 */
export interface DarkFrontsGiven {
  early?: 'kept' | 'untouched';
  drawnLead: 'pluck' | 'swell'; leadDrawn: boolean; phrasing: string;
  moments: number[]; callBreakStarts: number[]; callBuild: boolean; hints: number; throws: boolean; hintBreakStart: number | null;
  /** each break split: its start, its bars before, its pieces and its growth */
  splits: Array<{ start: number; oldBars: number; pieces: [number, number, number]; grow: number }>;
}

/** The kick's hits a bar through the drops and mains, as the plan plays them. */
function kicksPerBar(track: Track): number {
  const bars = new Set<number>();
  for (const s of track.arrangement.sections) if (s.kind === 'drop' || s.kind === 'main') for (let b = s.startBar; b < s.startBar + s.bars; b++) bars.add(b);
  if (!bars.size) return 0;
  return track.events.filter((e) => e.layer === 'kick' && bars.has(e.bar)).length / bars.size;
}

/** The theme with its front written by the rule where the place turned the roles round; the plan as it was elsewhere. */
export function darkFronts<T extends Track>(track: T, spell: Spell, row: DarkFrontsRow = DARK_FRONTS, style?: Style, given: DarkFrontsGiven | null = null): T {
  const roles = (track.sound as { roles?: { id?: string } } | undefined)?.roles;
  if (!roles?.id || !row.roles.includes(roles.id) || track.bpm < row.leastBpm) return track;
  const kicks = kicksPerBar(track);
  // **A piano that leads stays** (his ear 11-03 on Vibe - Undertow: "this was one of those I was saying piano works too
  // for these themes"): today's front in the drops, by its topology; where most of it is the row's kept kind, it leads
  const drops = new Set<number>();
  for (const sec of track.arrangement.sections) if (sec.kind === 'drop' || sec.kind === 'main') for (let b = sec.startBar; b < sec.startBar + sec.bars; b++) drops.add(b);
  const topologyOf = (e: Track['events'][number]) => ROWS[timbreOfNote(e.voice, e.p) ?? '']?.topology ?? BY_NAME[e.voice]?.row?.topology ?? '';
  const front = track.events.filter((e) => e.layer === 'keys' && drops.has(e.bar));
  const keptNotes = front.filter((e) => row.keepLead.includes(topologyOf(e)));
  // ...and only a piano that is a line, as Vibe - Undertow's is (his ear 11-03: a bright piano looping a fifth over the
  // reese "isn't great"): its range, how often a bar repeats the one before, and where its notes sit, measured
  const midis = keptNotes.map((e) => Number(e.p.midi)).filter(Number.isFinite).sort((a, b) => a - b);
  const byBar = new Map<number, string[]>();
  for (const e of keptNotes) byBar.set(e.bar, [...(byBar.get(e.bar) ?? []), `${e.step}:${e.p.midi}`]);
  const playedBars = [...byBar.keys()].sort((a, b) => a - b);
  let repeats = 0;
  for (let i = 1; i < playedBars.length; i++) if (byBar.get(playedBars[i])!.sort().join() === byBar.get(playedBars[i - 1])!.sort().join()) repeats++;
  const pianoLine = midis.length > 0 && midis[midis.length - 1] - midis[0] >= row.keepLeadRange
    && repeats / Math.max(1, playedBars.length - 1) <= row.keepLeadRepeat && midis[Math.floor(midis.length / 2)] >= row.keepLeadMedian;
  const keepLead = front.length > 0 && keptNotes.length * 2 >= front.length && keptNotes.length >= row.keepLeadPerBar * drops.size && pianoLine;
  // **Drawn, not stamped** (his ear 11-03 on the live app: "it seems now the rule is inserting it in every chillstep
  // track"; Vibe - Undertow "was a complete track"): a piano line like Undertow's leaves the theme whole; elsewhere the
  // theme's own die keeps today's front untouched in a share of themes, and draws each new part on its own
  const read = (r: DarkFrontsRead) => { (track as T & { darkFronts?: DarkFrontsRead }).darkFronts = r; return track; };
  const air = Math.max(0, Math.min(1, (spell.zephyr + spell.gleam) / 0.8));
  const shifted = (b: number) => (given ? b + grownBy(given.splits.map((x) => ({ section: -1, at: x.start, bars: x.oldBars + x.grow, kind: 'passage' as const, grow: x.grow })), b) : b);
  if (given ? given.early === 'kept' : keepLead) return read({ kicksPerBar: +kicks.toFixed(2), lead: 'kept', phrasing: 'none', air: +air.toFixed(2), hints: 0, throws: false, given: { ...(given ?? {} as DarkFrontsGiven), early: 'kept' } as DarkFrontsGiven });
  const r = new Rng(`${track.seed}::dark-fronts`);
  const D = row.draw;
  // today's front: where no drawn part takes the bar it keeps its notes, unless it is a loop (most of its bars the bar before)
  const todayBars = [...new Set(track.events.filter((e) => e.layer === 'keys').map((e) => e.bar))].sort((a, b) => a - b);
  const todayBy = new Map<number, string>();
  for (const b of todayBars) todayBy.set(b, track.events.filter((e) => e.layer === 'keys' && e.bar === b).map((e) => `${e.step}:${e.p.midi}`).sort().join());
  let loops = 0;
  for (let k = 1; k < todayBars.length; k++) if (todayBy.get(todayBars[k]) === todayBy.get(todayBars[k - 1])) loops++;
  const todayLoops = loops / Math.max(1, todayBars.length - 1) > D.loops;
  // ...and a loop is never left untouched (his ear 11-03 on Cloudburst's theme 13: a bright piano looping a fifth "isn't great")
  const untouched = given ? given.early === 'untouched' : r.chance(front.length ? D.untouched : D.untouchedNoFront) && !todayLoops;
  if (untouched) return read({ kicksPerBar: +kicks.toFixed(2), lead: 'untouched', phrasing: 'none', air: +air.toFixed(2), hints: 0, throws: false, given: { ...(given ?? {} as DarkFrontsGiven), early: 'untouched' } as DarkFrontsGiven });
  const drawnLead: 'pluck' | 'swell' = given ? given.drawnLead : kicks < row.halfTimeKicks ? 'pluck' : 'swell';
  const leadDrawn = given ? given.leadDrawn : drawnLead === 'swell' || r.chance(D.pluck);
  const phrasing = given ? given.phrasing : drawnLead === 'swell' ? 'swell' : spell.loom < row.callUnderLoom ? 'call' : 'figure';
  const secs = track.arrangement.sections;
  // the swells: never the long-standing texture over a held pad and the reese (his ear: "waves could stack, maybe for
  // extra expression in drops etc, but it shouldn't be the long-standing texture of the whole track"): where a pad holds
  // the bar, only a drawn moment of a drop (its peak); where none does, they may carry the section
  const padBars = new Set<number>();
  const bs = track.barSeconds;
  for (const e of track.events) if (e.layer === 'pad' && (e.p.dur ?? 0) >= bs) for (let b = e.bar; b * bs < e.t + (e.p.dur ?? 0) - 1e-6; b++) padBars.add(b);
  const leadBars: number[] = [], moments: number[] = [];
  // (a passage the second plan brought: a groove between two break pieces, the drop's peak by its place, so its moment is its middle)
  const passageAt = new Set((given?.splits ?? []).map((x) => shifted(x.start) + x.pieces[0]));
  const givenMoments = new Set((given?.moments ?? []).map(shifted));
  for (const sec of secs) {
    if (sec.kind !== 'drop' && sec.kind !== 'main') continue;
    const mid = sec.startBar + Math.floor(sec.bars / 2 / 4) * 4;
    const moment = drawnLead === 'swell' && sec.kind === 'drop' && (given ? givenMoments.has(mid) || passageAt.has(sec.startBar) : r.chance(D.swellMoment)) ? mid : null;
    if (moment != null) moments.push(moment);
    for (let b = sec.startBar; b < sec.startBar + sec.bars; b++) {
      if (drawnLead === 'pluck' || !padBars.has(b) || (moment != null && b >= moment && b < moment + D.momentBars)) leadBars.push(b);
    }
  }
  // the call: the breaks and the build's end only, each drawn (his ear: "Call sounds the best on breaks and lightweight segments")
  const breakSecs = secs.filter((x) => x.kind === 'breakdown');
  const breakIdx = breakSecs.map((_, k) => k);
  const callStarts = given ? new Set(given.callBreakStarts.map(shifted)) : null;
  const callBreaks = callStarts ? breakIdx.filter((k) => callStarts.has(breakSecs[k].startBar)) : breakIdx.filter(() => r.chance(D.callBreak));
  const callBuild = given ? given.callBuild : secs.some((x) => x.kind === 'build') && r.chance(D.callBuild);
  const breaks = breakIdx.length;
  const hintBreak = given ? (given.hintBreakStart == null ? -1 : breakSecs.findIndex((x) => x.startBar === shifted(given.hintBreakStart!)))
    : air < row.hintAir ? -1 : breaks >= 2 ? 1 : breaks === 1 && air >= row.oneBreakAir ? 0 : -1;
  let hints = given ? given.hints : hintBreak >= 0 && r.chance(D.bell) ? Math.round(row.hintNotes[0] + (row.hintNotes[1] - row.hintNotes[0]) * air) : 0;
  let throws = given ? given.throws : air >= row.throwAir && r.chance(D.throw);
  const drawn: DarkFrontsGiven = given ?? { drawnLead, leadDrawn, phrasing, moments: [...moments], callBreakStarts: callBreaks.map((k) => breakSecs[k].startBar), callBuild, hints, throws,
    hintBreakStart: hintBreak >= 0 ? breakSecs[hintBreak].startBar : null, splits: [] };
  // **Under the phone's ceiling** (the catalogue's units, the voices 4/12/35 and the part space's effects): the bell goes
  // first, then the lead, then the call
  const lead_ = leadDrawn ? (drawnLead === 'pluck' ? row.pluck : row.swell) : null;
  const unitsOf = (voices: Iterable<string>) => [...new Set(voices)].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
  const S = settingsOf(track as never) as unknown as { partSpace?: { inserts: { effect: string }[]; sends: { effect: string; after?: { effect: string }[] }[] }; returns?: Record<string, { inserts: { effect: string }[]; sends: { effect: string; after?: { effect: string }[] }[] }> };
  const space = [...(S.partSpace ? [S.partSpace] : []), ...Object.values(S.returns ?? {})]
    .reduce((a, x) => a + effectsCost([...x.inserts, ...x.sends, ...x.sends.flatMap((y) => y.after ?? [])].map((y) => y.effect)), 0);
  // (a kept front the colour plays ground counts as its ground voice)
  const others = track.events.map((e) => { const v = (e as { drawn?: string }).drawn ?? e.voice; return e.layer === 'keys' ? row.regrind[v] ?? v : v; });
  const fits = (voices: string[]) => unitsOf([...others, ...voices]) + space <= CEILING;
  // the break's answer is shed before the lead and the call (the ninth pass: on Drive - Cloudburst's next theme it had
  // pushed the swells he accepted over the ceiling); the call then plays its break as the seventh pass wrote it
  const answer = callBreaks.length ? [row.answer.voice] : [];
  const calls = callBreaks.length || callBuild ? [row.call] : [];
  if (!fits([...(lead_ ? [lead_] : []), ...calls, ...answer, row.bell])) { hints = 0; throws = false; }
  const leadOn = !!lead_ && fits([lead_, ...calls]);
  const callOn = !!calls.length && fits([...(leadOn ? [lead_!] : []), ...calls]);
  const answerOn = callOn && !!answer.length && fits([...(leadOn ? [lead_!] : []), ...calls, ...answer]);
  // the echo return the wet chords would open, priced as the engine prices a lazy return, over the voices the theme
  // plays once the rule has written it
  const echoFits = (voices: string[]) => unitsOf(voices) + space + VOICE_COST_UNITS[RETURN_COST.echo as keyof typeof VOICE_COST_UNITS] <= CEILING;
  const wet: NonNullable<DarkFrontsRead['wet']> = { ceiling: 0, amount: 0, dub: false, echo: false, thrown: 0 };
  if (!leadOn && !callOn && !hints && !throws) return read({ kicksPerBar: +kicks.toFixed(2), lead: 'today', phrasing: 'none', air: +air.toFixed(2), hints: 0, throws: false, given: drawn });
  const lead = leadOn ? drawnLead : 'today';
  // **The break's form** (the ninth pass, his ear 11-04: the break "twice as long as needed for this kind of track";
  // "when using Call voice having two separate breaks could be a great compromise"; the tenth pass, his ear on the
  // groove passage between the two: it "doesn't have enough time to unfold with current bass wave and motif, it should
  // be at least twice the size", and on a section shorter than its phrase: "the phrase feels chopped"): a break the call
  // plays that runs `splitFrom` bars or more becomes two, each a whole phrase or more, around a groove passage the plan's
  // second ask lays as a section of its own (long-main's splice, `set-plan.ts`): the passage long enough for the
  // groove's material to unfold (`materialCycle`: the front's cycle in the groove before the break, the bass's, the
  // phrase), `passage.cycles` of it and never less than `passage.phrases` phrases, rounded up to whole phrases; where
  // the break's own bars are too few for two pieces and the passage, the theme grows by the difference. Asked here on
  // the first plan (`wants`); the second plan finds the pieces in its form.
  const F = row.form;
  // the bed's top read before the form moves (the accents' lid stays where his ear set it, 11-04: "golden position")
  const bed0 = bedTopOf(track, spell, style);
  const phraseBars = Math.max(4, (track as { phraseMap?: { time?: { phraseBars?: number } } }).phraseMap?.time?.phraseBars ?? 8);
  const wants: LongMainHint['splits'] = [];
  const passages: Array<{ from: number; bars: number; grow: number }> = [];
  const groove = (k?: string) => k === 'drop' || k === 'main';
  // (asked after the front is written, below: the cycle is the front the rule plays, not today's)
  // (the theme grows only up to a phrase past its length band's top, `lengthTopBars` beside the plan; at or past it the
  // passage comes out of the break's own bars, or the break stays one)
  let room = Math.max(0, ((track as { lengthTopBars?: number }).lengthTopBars ?? Infinity) - track.bars);
  const askSplits = () => { if (!given && callOn) for (const k of callBreaks) {
    const sec = breakSecs[k];
    if (!sec || sec.bars < F.splitFrom) continue;
    const before = [...secs].reverse().find((x) => groove(x.kind) && x.startBar + x.bars <= sec.startBar);
    if (!before) continue;
    const cycle = Math.min(2 * phraseBars, materialCycle(track.events as never, before.startBar, before.startBar + before.bars));
    // (in felt bars: a half-time groove's bar is twice as long to the ear, `feltPulseOf`, so its passage takes twice the written bars)
    const feltMul = feltPulseOf({ barSeconds: track.barSeconds, arrangement: track.arrangement }, track.events as never, track.bpm).half ? 2 : 1;
    const need = Math.max(F.passage.phrases * phraseBars, F.passage.cycles * cycle, F.passage.feltBars * feltMul);
    const passage = Math.ceil(need / phraseBars) * phraseBars;
    const piece = Math.max(phraseBars, Math.floor((sec.bars - passage) / 2 / phraseBars) * phraseBars);
    const bars = piece + passage + piece, grow = Math.max(0, bars - sec.bars);
    // the pieces are whole phrases or there is no split (a cut piece is what he heard as chopped): a theme may grow a
    // phrase past its band's top for them, never more; past that the break stays one, its statement and its build
    if (grow > room + phraseBars) continue;
    room -= grow;
    wants.push({ section: sec.index, at: sec.startBar, bars, kind: 'passage', pieces: [piece, passage, piece], groove: before.kind, grow });
    drawn.splits.push({ start: sec.startBar, oldBars: sec.bars, pieces: [piece, passage, piece], grow });
  } };
  // each break's part: the call's statement in the first piece of a break it plays (the second statement of a track
  // shorter and answered, none past two), the second piece a breather
  const newBreaks = breakSecs;
  const idxAt = (start: number) => newBreaks.findIndex((x) => x.startBar === start);
  const secondPiece = new Map<number, number>(); // a split break's (shifted) start -> its second piece's start
  if (given) for (const x of given.splits) secondPiece.set(shifted(x.start), shifted(x.start) + x.pieces[0] + x.pieces[1]);
  if (given) for (const x of given.splits) passages.push({ from: shifted(x.start) + x.pieces[0], bars: x.pieces[1], grow: x.grow });
  const breakRoles: Record<number, 'cameo' | 'answered' | 'breather'> = {};
  let statements = 0;
  if (callOn) for (const k of [...callBreaks].sort((a, b) => a - b)) {
    const i = k;
    breakRoles[i] = statements === 0 ? 'cameo' : statements === 1 ? 'answered' : 'breather';
    statements++;
    const j = secondPiece.has(newBreaks[k].startBar) ? idxAt(secondPiece.get(newBreaks[k].startBar)!) : -1;
    if (j >= 0) breakRoles[j] = 'breather';
  }
  const newCallBreaks = Object.entries(breakRoles).filter(([, r_]) => r_ !== 'breather').map(([i]) => +i);
  const hintIndex = hintBreak < 0 ? -1 : secondPiece.has(newBreaks[hintBreak].startBar) ? idxAt(secondPiece.get(newBreaks[hintBreak].startBar)!) : hintBreak;
  // the last break before the final groove builds into it: the reese back under its second half, filtered and opening
  const lastGroove = secs.reduce((a, x, i) => (groove(x.kind) ? i : a), -1);
  const lastBreak = secs.reduce((a, x, i) => (x.kind === 'breakdown' && i < lastGroove ? i : a), -1);
  const built = lastBreak >= 0 && breakRoles[newBreaks.indexOf(secs[lastBreak])] != null && groove(secs[lastBreak + 1]?.kind) ? secs[lastBreak] : null;
  if (built) {
    const n = Math.max(4, Math.floor(built.bars / 2 / 4) * 4);
    relayEvents(track as never, (events) => buildBack(track, built, n, secs[lastBreak + 1].startBar, F.build.lp, F.build.gainDb, events as never) as never);
  }
  // **The intro seeds the groove** (the tenth pass, his ear 11-04 on Drive - Cloudburst's next theme: the intro into the
  // groove "feels like two different songs stitched together"): where the intro hands straight to a groove that brings
  // the bass, the bass arrives under the intro's last phrase, filtered shut and opening, rising from under, so the
  // groove's first bar is the arrival of what the ear already heard coming; an intro that hands to a build keeps it (the
  // build is that arrival). The same gesture as the last break's way back into the drop (`buildBack`)
  const intro = secs[0], after = secs[1];
  const seeded = intro?.kind === 'intro' && after && groove(after.kind) && intro.bars >= 8
    && !track.events.some((e) => e.layer === 'bass' && e.bar >= intro.startBar && e.bar < intro.startBar + intro.bars)
    && track.events.some((e) => e.layer === 'bass' && e.bar >= after.startBar && e.bar < after.startBar + 8);
  if (seeded) {
    const n = Math.min(intro.bars, phraseBars);
    relayEvents(track as never, (events) => buildBack(track, intro, n, after.startBar, F.build.lp, F.build.gainDb, events as never) as never);
  }
  const taken = new Set<number>();
  for (const sec of secs) {
    const end = sec.startBar + sec.bars;
    if (callOn && callBuild && sec.kind === 'build') for (let b = Math.max(sec.startBar, end - 8); b < end; b++) taken.add(b);
    if (sec.kind === 'breakdown' && breakRoles[newBreaks.indexOf(sec)] != null) for (let b = sec.startBar; b < end; b++) taken.add(b);
  }
  if (leadOn) for (const b of leadBars) taken.add(b);
  const keepBars = todayLoops ? [] : todayBars.filter((b) => !taken.has(b));
  const colour: NonNullable<DarkFrontsRead['colour']> = { grind: 0, bits: 0, holdHz: 0, drive: 0, smear: 0, lidHz: 0, bedTilt: null, events: 0 };
  // **A dark front moves by grit, not by pitch** (the tenth pass, his ear 11-04 on the saw stab: "some modulation effects
  // that make it cartoonish and diminish its darkness"): the darker the air and the heavier the bass, the more of a
  // front's movement is grit (the stack pulled tight, the strike's zap flattened, the crush and the drive up, a held
  // chord's filter closing instead of opening, its crush rising across the hold) and the less is pitch (the call's
  // wobble gone); in a light, light-footed place the chord opens and the call wobbles as before
  const M = row.movement;
  const grit = Math.max(0, Math.min(1, M.air * (1 - air) + M.root * spell.root));
  const openMul = grit < 0.5 ? M.openMul[0] + (M.openMul[1] - M.openMul[0]) * (grit / 0.5) : M.openMul[1] + (M.openMul[2] - M.openMul[1]) * ((grit - 0.5) / 0.5);
  const movement = { grit, openMul, wobble: M.wobble * (1 - grit) };
  relayEvents(track as never, (events) => wetNotes(wetChords(colourAccents<Track['events'][number]>(frontSketch({ ...track, events } as unknown as T, {
    voice: row.call, loom: spell.loom, gain: row.gain, centre: 'voicing', mainFrom: row.mainFrom, movement,
    lift: { voices: row.liftVoices.map((k) => row[k]), ...row.lift }, bellDb: row.bellDb, throwDb: row.throwDb,
    ...(answerOn ? { answer: row.answer } : {}), breakRoles, underDb: row.underDb,
    keepBars, leadBars, callBreaks: callOn ? newCallBreaks : [], callBuild: callOn && callBuild,
    parts: {
      ...(callOn ? { build: { voice: row.call, how: 'legato' }, breakdown: { voice: row.call, how: 'legato' } } : {}),
      ...(leadOn && lead_ ? { drop: { voice: lead_, how: phrasing } } : {}),
      ...(throws ? { throw: { voice: row.bell, how: '16' } } : {}),
    },
    throwOnce: true,
    ...(hints && hintIndex >= 0 ? { hints: { voice: row.bell, notes: hints, cutoffMul: row.lid[0] + (row.lid[1] - row.lid[0]) * air, breakIndex: hintIndex } } : {}),
  }).events as never, colourOf(track, spell, row, style, colour, bed0) as never), track, spell, row, leadOn && drawnLead === 'swell', echoFits, wet), track, spell, row, echoFits, wet) as never);
  askSplits();
  read({ kicksPerBar: +kicks.toFixed(2), lead, phrasing: leadOn ? phrasing : 'none', air: +air.toFixed(2), hints, throws,
    callBreaks: callOn ? callBreaks : [], callBuild: callOn && callBuild, ...(moments.length && leadOn ? { moments } : {}), colour,
    movement: { grit: +grit.toFixed(2), openMul: +openMul.toFixed(2), wobble: +movement.wobble.toFixed(3) },
    ...(Object.keys(breakRoles).length || seeded ? { form: { roles: breakRoles, passages, build: built ? built.startBar : null, ...(wants.length ? { wants } : {}), ...(seeded ? { seeded: intro.startBar + intro.bars - Math.min(intro.bars, phraseBars) } : {}) } } : {}),
    ...(wet.ceiling > 0 || wet.notes ? { wet } : {}), given: drawn });
  return track;
}

/** The accents' colour for a theme (the eighth pass): what every ground note carries, and its grind along the theme. */
interface ColourPlan { colour: { bits: number; holdHz: number; drive: number; smear: number }; grindAt: (t: number) => number; lidHz: number; row: DarkFrontsRow }

/**
 * **The bed's top, as the plan reads it** (`tops-read.ts`, round hat-floor's table): the pad's and the bass's notes through
 * the drops and the mains, above 3 kHz against their K-weighted whole, in dB. Null where no bed plays there or no room
 * is known.
 */
export function bedTopOf(track: Track, spell: Spell, style?: Style): number | null {
  if (!style) return null;
  const set = settingsOf(track as never) as unknown as { levels: Record<string, number> };
  const levelDb = (e: TopsReadEvent) => laneLevelDb(style, set.levels, e.voice, VOICE_LEVEL[e.voice]) ?? -12;
  const bs = track.barSeconds;
  let pk = 0, ph = 0;
  for (const s of track.arrangement.sections) {
    if (s.kind !== 'drop' && s.kind !== 'main') continue;
    const r = topsOver({ events: track.events as unknown as TopsReadEvent[], from: s.startBar * bs, to: (s.startBar + s.bars) * bs, levelDb,
      pick: (e) => e.layer === 'pad' || e.layer === 'bass', birds: { spark: spell.spark, gleam: spell.gleam, zephyr: spell.zephyr },
      lines: (track as { automation?: unknown }).automation as TopsLines, knobs: (track as { knobs?: Record<string, Record<string, number>> }).knobs ?? null });
    if (!r) continue;
    pk += s.bars * bs * Math.pow(10, r.k / 10);
    ph += s.bars * bs * Math.pow(10, r.hi / 10);
  }
  return pk > 0 && ph > 0 ? 10 * Math.log10(ph / pk) : null;
}

/**
 * **The accents ground by the birds** (round dark-fronts' eighth pass, his ear 11-04 on his link: *"if we use marimba
 * again, can we explore some rules of how to color it relative to this genre (birds position), maybe add some
 * bitcrusher or other processing events … this vibe is totally suiting dark fronts, but marimba in itself original voice
 * isn't a great fit"*). Each move follows one bird:
 *
 *   the crush    the darker the air (Zephyr and Gleam), the more of the tone is ground down: fewer bits, a lower held
 *                rate, more of the ground strike over the clean one;
 *   the tape     the heavier the bass (Root), the hotter the saturation in front of the crush;
 *   the grains   the wider the room (Tide), the more the strike is smeared into grains;
 *   the lid      every accent's top sits at the bed's: the darker the pad and the bass above 3 kHz, the lower the lid;
 *   the events   the crush closes over a build's last bars into a drop and opens after it; over a break the tone comes
 *                up out of the grit and goes back in before the drop; a still texture (Veil low) moves only at those
 *                seams, a shifting one also closes it over the last bars of a phrase and lets it go on the line.
 */
function colourOf(track: Track, spell: Spell, row: DarkFrontsRow, style: Style | undefined, out: NonNullable<DarkFrontsRead['colour']>, bedRead?: number | null): ColourPlan {
  const C = row.colour;
  const u = (x: number) => Math.max(0, Math.min(1, x));
  const lerp = (p: [number, number], x: number) => p[0] + (p[1] - p[0]) * u(x);
  const dark = 1 - u((spell.zephyr + spell.gleam) / 0.8);
  const base = lerp(C.grind, dark);
  const colour = { bits: Math.round(lerp(C.bits, dark)), holdHz: Math.round(C.holdHz[0] * Math.pow(C.holdHz[1] / C.holdHz[0], dark)),
    drive: +lerp(C.drive, spell.root).toFixed(2), smear: +lerp(C.smear, spell.tide).toFixed(2) };
  const bed = bedRead !== undefined ? bedRead : bedTopOf(track, spell, style);
  const L = C.lid;
  const lidHz = Math.round(Math.max(L.least, Math.min(L.most, L.refHz * Math.pow(2, ((bed ?? L.refTilt) - L.refTilt) / L.dbPerOctave))));
  // the grind along the theme: points [t, value], straight between them
  const bs = track.barSeconds, E = Math.round(lerp(C.event.bars, spell.veil)), D = C.event.depth;
  const hi = u(base + D), lo = u(base - D);
  const r = new Rng(`${track.seed}::dark-fronts::colour`);
  const pts: { t: number; value: number }[] = [{ t: 0, value: base }];
  const secs = track.arrangement.sections;
  let events = 0;
  const groove = (k?: string) => k === 'drop' || k === 'main';
  secs.forEach((sec, i) => {
    const a = sec.startBar * bs, z = (sec.startBar + sec.bars) * bs, e = Math.min(E, sec.bars) * bs;
    const intoGroove = groove(secs[i + 1]?.kind);
    if (sec.kind === 'build') {
      pts.push({ t: a, value: base });
      if (intoGroove) { pts.push({ t: z - e, value: base }, { t: z, value: hi }); events++; }
    } else if (sec.kind === 'breakdown') {
      const mid = a + Math.max(e, (z - a) / 2);
      pts.push({ t: a, value: hi }, { t: Math.min(mid, z - e), value: lo }, { t: z - e, value: lo }, { t: z, value: intoGroove ? hi : base });
      events++;
    } else if (groove(sec.kind)) {
      const seam = i > 0 && !groove(secs[i - 1].kind);
      pts.push({ t: a, value: seam ? hi : base }, { t: a + (seam ? e : 0), value: base });
      if (seam) events++;
      // a shifting texture breathes the crush at a phrase's end: closing over its last bars, let go on the line
      for (let b = sec.startBar + 8; b < sec.startBar + sec.bars; b += 8) {
        if (!r.chance(spell.veil * C.event.phrase)) continue;
        pts.push({ t: b * bs - e, value: base }, { t: b * bs - 1e-3, value: hi }, { t: b * bs, value: base });
        events++;
      }
      pts.push({ t: z - 1e-3, value: base });
    } else pts.push({ t: a, value: base }, { t: z - 1e-3, value: base });
  });
  pts.sort((x, y) => x.t - y.t);
  const grindAt = (t: number) => {
    if (t <= pts[0].t) return pts[0].value;
    for (let k = 1; k < pts.length; k++) if (t < pts[k].t) { const A = pts[k - 1], B = pts[k]; return B.t > A.t ? A.value + ((t - A.t) / (B.t - A.t)) * (B.value - A.value) : B.value; }
    return pts[pts.length - 1].value;
  };
  Object.assign(out, { grind: +base.toFixed(2), ...colour, lidHz, bedTilt: bed == null ? null : +bed.toFixed(1), events });
  return { colour, grindAt, lidHz, row };
}

/** The front lane's accents in their colour: a kept marimba played ground, every ground note its colour and its grind, every accent its lid. */
function colourAccents<E extends { t: number; bar: number; voice: string; layer?: string; p: Record<string, unknown> }>(events: E[], plan: ColourPlan): E[] {
  const C = plan.row.colour, G = plan.row.regrind;
  return events.map((e) => {
    if (e.layer !== 'keys') return e;
    let x = e;
    if (G[x.voice]) { const { preset: _preset, ...p } = x.p; x = { ...x, voice: G[x.voice], p }; }
    if (!C.voices.includes(x.voice) && !C.lidVoices.includes(x.voice)) return x;
    const p = { ...x.p };
    if (C.voices.includes(x.voice)) {
      const dur = Math.max(0, Number(p.dur ?? 0));
      p.colour = plan.colour;
      const g0 = +plan.grindAt(x.t).toFixed(3), g1 = +plan.grindAt(x.t + dur).toFixed(3);
      p.grind = g0 === g1 ? g0 : [g0, g1];
    }
    if (C.lidVoices.includes(x.voice)) {
      p.lid = { hz: plan.lidHz };
      if (C.makeupDb[x.voice]) p.gain = +(Number(p.gain ?? 1) * Math.pow(10, C.makeupDb[x.voice] / 20)).toFixed(4);
    }
    return { ...x, p };
  });
}

/**
 * **How wet Tide may take a voice, by its own sound** (the ninth pass, his word 11-04: *"max wet should be taken
 * responsibly, maybe for known voices that we know will perform archetypically fine"*): the voice's measured facts
 * (`wet-fit.json`), each passing whole up to its first number and not at all from its second: it peaks at once (its
 * repeats are echoes, not a smear), it stops when released (no ring of its own piling under them), it has little under
 * 200 Hz where it plays (its repeats never queue under the reese; measured at MIDI 60, so taken off as its notes rise to
 * MIDI 67, whose fundamental is twice 200 Hz); and the notes it plays here sit in the middle register. The product,
 * nought to one. A voice the table has not measured gets nought: it stays as it was.
 */
export function wetCeiling(voice: string, midis: readonly number[], W: Wet): number {
  const m = WET_TABLE[voice];
  if (!m || !midis.length) return 0;
  const pass = (x: number, [whole, none]: [number, number]) => Math.max(0, Math.min(1, (none - x) / Math.max(1e-9, none - whole)));
  const med = midis.slice().sort((a, b) => a - b)[Math.floor(midis.length / 2)];
  const [lo, hi, fade] = W.register;
  const reg = Math.max(0, Math.min(1, 1 - Math.max(lo - med, med - hi, 0) / fade));
  // the low end is the table's at MIDI 60; a voice played an octave and more over it has none under 200 Hz there
  const low = m.low * Math.max(0, Math.min(1, (67 - med) / 7));
  return pass(m.onset, W.sound.onsetMs) * pass(m.tail, W.sound.tail) * pass(low, W.sound.low) * reg;
}

/**
 * **The chord becomes its echoes** (the ninth pass, his ear 11-04 on Drive - Cloudburst's next theme at Tide 0.9: the
 * saw stab *"sounds fairly dry, hence a bit scratching the ear … what if we actually research on making it maximum wet
 * on this Tide bird, reverb/delay etc. perhaps this could be a strong voice that takes stage attention with its FX
 * effect richness"*). Tide, from `wet.tide[0]` to `[1]`, takes the lead's chords as wet as their voice allows
 * (`wetCeiling`), the theme's die drawing how far (`wet.die`): their room opens; from `dubFrom` each swelled chord is
 * struck short instead (`strike` sixteenths, the voice's own fall), a second strike on the next bar's offbeat where it
 * held two, into the echo send (a dotted eighth fed back, each pass darker and thinner, ducked to the kick: the engine's
 * own `p.echo`), and now and then a phrase's last chord thrown whole. Where the phone's budget has no room for the echo
 * return, the room's own dotted-eighth line carries the repeats, shorter. Low Tide, and every voice that does not qualify, plays as before.
 */
function wetChords<E extends { t: number; bar: number; step?: number; voice: string; layer?: string; p: Record<string, unknown> }>(
  events: E[], track: Track, spell: Spell, row: DarkFrontsRow, swells: boolean, echoFits: (voices: string[]) => boolean, out: NonNullable<DarkFrontsRead['wet']>): E[] {
  const W = row.wet;
  const tide = Math.max(0, Math.min(1, (spell.tide - W.tide[0]) / Math.max(1e-9, W.tide[1] - W.tide[0])));
  if (!swells || !(tide > 0)) return events;
  const chords = events.filter((e) => e.layer === 'keys' && e.voice === row.swell);
  if (!chords.length) return events;
  const ceiling = wetCeiling(row.swell, chords.map((e) => Number(e.p.midi)).filter(Number.isFinite), W);
  if (!(ceiling > 0)) return events;
  const r = new Rng(`${track.seed}::dark-fronts::wet`);
  const amount = ceiling * tide * (W.die[0] + (W.die[1] - W.die[0]) * r.next());
  const base = Number(chords[0].p.reverb ?? 0);
  const reverb = +(base + amount * Math.max(0, W.reverb - base)).toFixed(3);
  // its repeats: the echo return (long, darker each pass) where the phone's budget has room for it; else the room's own
  // dotted-eighth line, already built (shorter: its feedback is the room's)
  const fits = echoFits(events.map((e) => (e as { drawn?: string }).drawn ?? e.voice));
  const dub = amount >= W.dubFrom;
  Object.assign(out, { ceiling: +ceiling.toFixed(2), amount: +amount.toFixed(2), dub, echo: dub && fits, thrown: 0 });
  if (!dub) return events.map((e) => (chords.includes(e) ? { ...e, p: { ...e.p, reverb } } : e));
  // the struck chords: the swell's onset and, where it held two bars, the next bar's offbeat
  const bs = track.barSeconds, sixteenth = bs / 16, beat = (track as { beat?: number }).beat ?? bs / 4, swing = (track as { swing?: number }).swing ?? 0.5;
  const send = (x: number) => (fits ? { echo: +(x * W.echo).toFixed(3) } : { delay: +(x * W.roomDelay).toFixed(3) });
  const struck: E[] = [];
  for (const e of chords) {
    const bars = Math.max(1, Math.round(Number(e.p.dur ?? bs) / bs));
    const { attack: _a, open: _o, openMul: _m, sustain: _s, release: _r, ...p } = e.p;
    const gain = +(Number(p.gain ?? 1) * Math.pow(10, W.strikeDb / 20)).toFixed(4);
    const hit = (t: number, bar: number, step: number) => ({ ...e, t, bar, step, p: { ...p, gain, dur: W.strike * sixteenth, release: 0.25, reverb, ...send(amount) } }) as E;
    struck.push(hit(e.t, e.bar, e.step ?? 0));
    if (bars >= 2) struck.push(hit((e.bar + 1) * bs + stepToBeats(6, swing) * beat, e.bar + 1, 6));
  }
  struck.sort((a, b) => a.t - b.t);
  // the throws: the last chord of an eight-bar phrase, by the die
  const lastOf = new Map<number, number>();
  for (const e of struck) lastOf.set(Math.floor(e.bar / 8), +e.t.toFixed(4));
  let thrown = 0;
  const throwAt = new Set<number>();
  for (const t of lastOf.values()) if (r.chance(W.throw.chance)) { throwAt.add(t); thrown++; }
  out.thrown = thrown;
  const thrownHit = (e: E) => throwAt.has(+e.t.toFixed(4))
    ? { ...e, p: { ...e.p, reverb: W.throw.reverb, ...send(Math.max(amount, amount * W.throw.echo / W.echo)) } } as E : e;
  return [...events.filter((e) => !chords.includes(e)), ...struck.map(thrownHit)].sort((a, b) => a.t - b.t);
}

/**
 * **The other struck parts, as wet as Tide and their measure allow** (the ninth pass, his ear 11-04 on his link's break:
 * the ground marimba *"is way more fitting, still feels not wet enough though"*). Every front part the rule writes but the
 * lead's chords and the parts his ear froze, section by section where it plays: its sound's ceiling (`wetCeiling`), its
 * notes' median length and their onsets a bar there (`wet.played`), Tide and the theme's die; its room opens, and its
 * repeats ride the echo send (the room's own line where the phone's budget has no room for it). A long curve (the call)
 * or a busy figure takes nothing and plays as it was.
 */
function wetNotes<E extends { t: number; bar: number; voice: string; layer?: string; p: Record<string, unknown> }>(
  events: E[], track: Track, spell: Spell, row: DarkFrontsRow, echoFits: (voices: string[]) => boolean, out: NonNullable<DarkFrontsRead['wet']>): E[] {
  const W = row.wet;
  const tide = Math.max(0, Math.min(1, (spell.tide - W.tide[0]) / Math.max(1e-9, W.tide[1] - W.tide[0])));
  if (!(tide > 0)) return events;
  const skip = new Set([row.swell, ...W.frozen.map((k) => row[k])]);
  const r = new Rng(`${track.seed}::dark-fronts::wet-notes`);
  const die = W.die[0] + (W.die[1] - W.die[0]) * r.next();
  const fits = echoFits(events.map((e) => (e as { drawn?: string }).drawn ?? e.voice));
  const pass = (x: number, [whole, none]: [number, number]) => Math.max(0, Math.min(1, (none - x) / Math.max(1e-9, none - whole)));
  const took: Record<string, number> = {};
  const amountOf = new Map<E, number>();
  for (const sec of track.arrangement.sections) {
    const inSec = events.filter((e) => e.layer === 'keys' && !skip.has(e.voice) && e.bar >= sec.startBar && e.bar < sec.startBar + sec.bars && WET_TABLE[e.voice]);
    for (const voice of new Set(inSec.map((e) => e.voice))) {
      const notes = inSec.filter((e) => e.voice === voice);
      const lens = notes.map((e) => Number(e.p.dur ?? 0)).sort((a, b) => a - b);
      const bars = new Set(notes.map((e) => e.bar)).size, onsets = new Set(notes.map((e) => e.t.toFixed(3))).size;
      const share = wetCeiling(voice, notes.map((e) => Number(e.p.midi)).filter(Number.isFinite), W)
        * pass(lens[Math.floor(lens.length / 2)], W.played.lenS) * pass(onsets / Math.max(1, bars), W.played.perBar) * tide * die;
      if (!(share > 0.01)) continue;
      took[`${voice}@${sec.startBar}`] = +share.toFixed(2);
      for (const e of notes) amountOf.set(e, share);
    }
  }
  if (!amountOf.size) return events;
  out.notes = took;
  return events.map((e) => {
    const a = amountOf.get(e);
    if (a == null) return e;
    const base = Number(e.p.reverb ?? 0);
    return { ...e, p: { ...e.p, reverb: +(base + a * Math.max(0, W.reverb - base)).toFixed(3),
      ...(fits ? { echo: +(a * W.echo).toFixed(3) } : { delay: +Math.max(Number(e.p.delay ?? 0), a * W.roomDelay).toFixed(3) }) } } as E;
  });
}
