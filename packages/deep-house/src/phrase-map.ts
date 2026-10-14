// **The phrase map** (PLAN-UNIFY §2.5, step 1): the track's phrases and its structural arrivals, worked out once,
// before the part planners, from what every theme has — its form (the sections), its harmony (the keys' landings
// where a keys plan sets it, else the progression's own chords) and its time (`src/musical-time.ts`). It is written
// to the plan (`track.phraseMap`) for the planners that choose to read it: the producer's arrivals, where no keys plan
// runs, and the arrangement's phrases (`src/phrasing.ts`, PLAN-UNIFY U2: the sub-segments by the phrases' functions,
// the answers at the arrivals).
//
//   - **phrases**: each section cut into phrases of the theme's phrase length (`time.phraseBars`), counted from the
//     section's start (a section shorter than a phrase is one), each given a function by where it stands and where it
//     goes, in the producer's own words (`src/producer.ts`): intro, opening, arrival, approach, interior, intoBreak,
//     exposed, intoDrop, outro, last — the one the producer gives from its drums (the crest) left to it;
//   - **arrivals**: where the harmony arrives structurally — a section's start, the keys' landings, and a chord change
//     of the progression after the harmony held a phrase or more — each with whether the chord changes there (the
//     producer's `landings`). A vamp's turns are not arrivals: the house's two chords are not answered at every turn
//     (§1.3), only where a section starts.
//
// Nothing here names a place, a genre or a seed.
import type { MusicalTime } from './musical-time.ts';

export interface MapPhrase { from: number; to: number; section: string; fn: string }
export interface Arrival { bar: number; change: boolean; by: 'section' | 'landing' | 'progression' }
/** The track's phrases and arrivals, and the time they were counted in. */
export interface PhraseMap {
  time: { bpm: number; barS: number; felt: MusicalTime['felt']; feltBarS: number; phraseTargetS: number; phraseBars: number; phraseS: number; pinned: boolean };
  phrases: MapPhrase[];
  arrivals: Arrival[];
}

export interface PhraseMapInput {
  time: MusicalTime;
  bars: number;
  sections: ReadonlyArray<{ kind: string; startBar: number; bars: number }>;
  /** the keys plan's landings, where one sets the harmony */
  landings?: ReadonlyArray<{ bar: number; change: boolean }> | null;
  /** the chord in force at a bar (its label), for the progression's own changes */
  chordAt: (bar: number) => string;
}

export function planPhraseMap(I: PhraseMapInput): PhraseMap {
  const T = I.time, L = T.phraseBars;
  const sections = [...I.sections].sort((a, b) => a.startBar - b.startBar);
  const sectionOf = (bar: number) => sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
  const kindAt = (bar: number) => sectionOf(bar)?.kind ?? 'outro';
  const starts = new Map(sections.map((s) => [s.startBar, s.kind]));

  // ----- arrivals -----
  const at = new Map<number, Arrival>();
  const add = (a: Arrival) => { const was = at.get(a.bar); if (!was) at.set(a.bar, a); else if (a.change && !was.change) at.set(a.bar, { ...was, change: true }); };
  const changes: number[] = [];
  for (let b = 1; b < I.bars; b++) if (I.chordAt(b) !== I.chordAt(b - 1)) changes.push(b);
  const changesAt = new Set(changes);
  if (I.landings) for (const l of I.landings) add({ bar: l.bar, change: l.change, by: 'landing' });
  else {
    // the progression's changes that are structural: a change after the harmony held a phrase or more (a vamp turning
    // every bar or two, or every half phrase, is the harmony's rhythm, not an arrival; its section lines still are)
    let last = 0;
    for (const b of changes) {
      if (b - last >= L) add({ bar: b, change: true, by: 'progression' });
      last = b;
    }
  }
  for (const s of sections) if (s.startBar > 0 && s.startBar < I.bars) add({ bar: s.startBar, change: changesAt.has(s.startBar), by: 'section' });
  const arrivals = [...at.values()].sort((a, b) => a.bar - b.bar);
  const arrivalAt = (bar: number) => at.get(bar);

  // ----- phrases -----
  const phrases: MapPhrase[] = [];
  for (const s of sections) for (let p = s.startBar; p < s.startBar + s.bars && p < I.bars; p += L) {
    const q = Math.min(p + L, s.startBar + s.bars, I.bars);
    const kind = s.kind, into = starts.get(q);
    const last = q >= I.bars - Math.min(4, L) || (kind === 'outro' && q >= I.bars);
    const fn = kind === 'breakdown' ? (into === 'drop' ? 'intoDrop' : 'exposed')
      : into === 'drop' ? 'intoDrop'
      : into === 'breakdown' ? 'intoBreak'
      : kind === 'intro' ? (arrivalAt(q)?.change ? 'approach' : 'intro')
      : kind === 'outro' ? (last ? 'last' : 'outro')
      : arrivalAt(q)?.change ? 'approach'
      : arrivalAt(p)?.change ? 'arrival'
      : p === s.startBar ? 'opening'
      : 'interior';
    phrases.push({ from: p, to: q, section: kind, fn });
  }
  const { bpm, barS, felt, feltBarS, phraseTargetS, phraseBars, phraseS, pinned } = T;
  return { time: { bpm, barS, felt, feltBarS, phraseTargetS, phraseBars, phraseS, pinned }, phrases, arrivals };
}
