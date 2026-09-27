// The ledger: what the machine just did, written down as it does it.
//
// Eugene, 09-19: *"Now I hear music but my intuition is guessing: did I hear
// the effect or was it a ghost in my ears? ... It will be 'I hear boom boom
// boom, it doesn't sound good, go figure'."* So this is the strip that turns an
// ear's moment into a named event with a bar and a clock on it — a treatment
// engaged, a section turned over, a seam begun and landed, a cast, a lane gated
// off, a voice drawn, a clip, a late or dropped note, a preparation that fell
// back, the clock source changing.
//
// **Every line is a value somebody already has.** Nothing here measures
// anything or decides anything: the transport calls `note()` at the instants it
// already knows about, the page's scribe writes down what the readout shows it —
// a section turning over, a lane gated, a voice drawn, a treatment engaging, a
// counter moving (`machine/scribe.ts`) — and the view what only its taps can
// see, a peak reaching the ceiling. There is
// no second source of truth to keep in step, and a line that is wrong is a
// line whose caller was wrong.
//
// **It is not a tap.** It touches no node and is in no signal path, so it is
// not part of the inert-taps gate and does not need to be: it is an array and a
// counter. It runs whether or not the view is open, on purpose, because the
// whole point is to be able to open the view from the panel mark *after*
// hearing something and find out what it was. What it costs is one object a few times a second and a trim of a
// bounded list; offline renders never reach it, because `renderMix` and
// `renderProgram` are not the session.

/** What kind of thing happened. Closed, so a view can colour a line by it. */
export const KINDS = [
  'transport', 'seam', 'cast', 'spell', 'engine', 'theme', 'section',
  'treatment', 'lane', 'voice', 'clip', 'late', 'clock',
  // a hand on the machine view's desk: a mute, a solo, a level, a band — what
  // was moved, to what, over what, so a report can say what was heard (M1)
  'desk',
  // a recording made by the private tier's tools: the whole theme as a WAV or a video
  'record',
  // a bus's float sum at or over 0 dBFS before the limiter: loud, and not a clip (M15)
  'hot',
  // a stage of the transport that threw: the mix's tick, a voice's note, the limiter's processor, a link the planner could not read (K33)
  'fault',
  // a theme's voices that could not be prepared, falling back to the live path (K33; it was written as `late`)
  'prepare',
] as const;

export type LedgerKind = typeof KINDS[number];

/**
 * **Which lines are faults** (round K33, Eugene: *"two pads were pushing the
 * sound and I saw red messages in the ledger; is this a case to report? If I
 * didn't look at the ledger, how would I know?"*). One table, so the view and
 * the error reports agree on what is wrong rather than loud: the output
 * reaching full scale (the limiter failed — a bus over 0 dBFS is `hot` since
 * M15 and is not a fault), a stage that threw, a theme's voices that could not
 * be built, and notes reached late at a start. Each kind is reported once a
 * session and six in all (`REPORT_CAPS`, `fault-report.ts`), and only where the
 * listener's switch is on. The table is data: a later reporter extends it.
 */
/**
 * **What the page catches and carries on from, by name** (round R1 of the
 * reports, on the held-errors audit of 09-26, `notes/reviews/held-errors-2026-09-26.md`:
 * Eugene, *"anything that is a serious error that we catch in our code and hold
 * to ourselves might be subject for a report, if it is fixable"*). Each is a
 * `fault` line with the name in its `report` field, written by `report()` below
 * from the one `catch` that holds it, and reported once a session like every
 * other fault. Only what is ours to fix: a browser without a capability, a
 * refused permission, a network blip or a hidden tab is never one (`ours`).
 */
export const CAUGHT = Object.freeze([
  { report: 'transport', why: 'a hand-over the transport could not build, planning ahead that threw, or a mix whose stop threw' },
  { report: 'limiter', why: 'the limiter\'s module did not load where the browser has worklets: the set plays on lower and unlimited' },
  { report: 'start', why: 'the set could not start for a reason of ours (not a context the browser refused)' },
  { report: 'plan', why: 'a theme the composer could not plan for a seed, a spell or a candidate of a throw' },
  { report: 'page', why: 'a part of the page listening to the set threw' },
  { report: 'view', why: 'the machine view threw while it opened (not a chunk the network lost)' },
  { report: 'link', why: 'the page could not write its own link for where it is' },
  { report: 'address', why: 'the browser refused the address for writing it too often (Safari\'s flood limit), so the address stopped being the save' },
] as const);
export type CaughtKind = typeof CAUGHT[number]['report'];

export const REPORTED_KINDS: ReadonlyArray<{ kind: LedgerKind; why: string; report?: CaughtKind; when?: (e: Entry) => boolean }> = Object.freeze([
  { kind: 'clip', why: 'the output reached full scale: the limiter did not hold', when: (e: Entry) => /^out\b/.test(e.what) },
  { kind: 'fault', why: 'a stage of the transport threw: the mix tick, a voice, the limiter\'s processor, the planner under a link' },
  { kind: 'prepare', why: 'a theme\'s voices could not be built ahead and fell back to the live path' },
  // An ordinary late note is a phone or a throttled tab and stays a ledger line
  // (the held-errors audit of 09-26 put it at 300-1500 events a thousand
  // sessions); the transport's own fault is a late note at a start
  // (`lateInfo().cause === 'resume'`, `dsp.ts`).
  { kind: 'late', why: 'notes reached late at a start: the transport\'s own fault', when: (e: Entry) => e.fields.cause === 'resume' },
  // and what the page catches, each its own kind of report (`CAUGHT`)
  ...CAUGHT.map((c) => ({ kind: 'fault' as const, report: c.report, why: c.why })),
]);
/**
 * **How many a session sends** (the held-errors audit of 09-26: a healthy build
 * 0-5 events a thousand sessions): each kind once a session, and six in all.
 */
export const REPORT_CAPS = Object.freeze({ perKind: 1, perSession: 6 });
/** Whether a line is a fault the reports carry. */
export const isReported = (e: Entry): boolean => REPORTED_KINDS.some((r) => r.kind === e.kind
  && (r.report ? e.fields.report === r.report : !e.fields.report) && (!r.when || r.when(e)));
/** The kind a report goes under: a caught error's own name, or the line's kind. */
export const reportedAs = (e: Entry): string => (typeof e.fields.report === 'string' ? e.fields.report : e.kind);

/** One field of a line: the values that make a report worth pasting. */
export type Field = string | number | boolean | null;

/** One line. */
export interface Entry {
  /** a serial, so a reader can tell a line it has already drawn */
  n: number;
  /** the wall clock when it was written, in milliseconds since the page began */
  at: number;
  /** the audio context's own clock, where the place-keeper knows one */
  clock: number | null;
  seed: string;
  /** the theme of the set, one-based, as the readout counts it */
  theme: number;
  /** the bar of that theme, one-based */
  bar: number;
  kind: LedgerKind;
  /** the one line, already in words */
  what: string;
  fields: Record<string, Field>;
}

/**
 * Where the set is, asked of whoever knows. The transport registers one of
 * these when a set starts and takes it away when the set stops, so a line
 * carries a bar and a clock without every caller having to pass them.
 */
export interface Place {
  seed: string;
  theme: number;
  bar: number;
  clock: number | null;
}

/** How much is kept: the last half minute, and never more than this many lines. */
export const KEEP_SECONDS = 30;
const CAP = 240;

let entries: Entry[] = [];
let serial = 0;
let place: (() => Place) | null = null;
const listeners = new Set<() => void>();

/** Who to ask where the set is. `null` takes it away, which a stop does. */
export function keepPlace(fn: (() => Place) | null): void {
  place = fn;
}

const NOWHERE: Place = { seed: '', theme: 0, bar: 0, clock: null };

/**
 * Write a line.
 *
 * It is called on paths the transport is already on, so it does the least it
 * can: one object, one push, and a trim that only runs when the list is over
 * its cap. The listeners are the view's, and there are none when it is closed.
 */
export function note(kind: LedgerKind, what: string, fields: Record<string, Field> = {}): Entry {
  const p = place ? place() : NOWHERE;
  const entry: Entry = {
    n: ++serial,
    at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    clock: p.clock,
    seed: p.seed,
    theme: p.theme,
    bar: p.bar,
    kind,
    what,
    fields,
  };
  entries.push(entry);
  if (entries.length > CAP) entries = entries.slice(-CAP);
  for (const fn of listeners) fn();
  return entry;
}

/**
 * **The output's clip line, written by the limiter's processor** (round S16).
 * The processor measures every sample past the clipper and the trim and posts
 * `{ clip: { peakDb, over, overshootDb, gr } }` at most once a second while
 * the output is at full scale (`limiter-worklet.js`); this turns those posts
 * into the ledger's `clip` line — the line `REPORTED_KINDS` reports — whether
 * or not the view is open. A clip is written when it *begins*: a post within
 * `CLIP_EPISODE_MS` of the one before is the same loud passage, and one line.
 * The view's taps keep their meters and write only `hot`: one writer.
 */
export const CLIP_EPISODE_MS = 1500;
export function outputClipWriter(now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())): (data: unknown) => Entry | null {
  let last = -Infinity;
  return (data) => {
    const c = data && typeof data === 'object' ? (data as { clip?: { peakDb?: unknown; over?: unknown; overshootDb?: unknown; gr?: unknown } }).clip : null;
    if (!c || typeof c.peakDb !== 'number') return null;
    const t = now();
    const fresh = t - last > CLIP_EPISODE_MS;
    last = t;
    if (!fresh) return null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const overshoot = num(c.overshootDb);
    return note('clip', 'out reached full scale', {
      peak: c.peakDb, over: num(c.over), gr: num(c.gr), ...(overshoot ? { overshoot } : {}),
    });
  };
}

/**
 * The lines still inside the window, oldest first.
 *
 * The trim is on the way out and not on the way in, because a write is on a
 * transport path and a read is on a frame nobody is scheduling notes in.
 */
export function lines(seconds = KEEP_SECONDS): Entry[] {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const from = now - seconds * 1000;
  let i = 0;
  while (i < entries.length && entries[i].at < from) i++;
  // a copy always: the snapshot that holds it is immutable, and the live array
  // is pushed to on the next line (R116)
  return entries.slice(i);
}

/** Everything kept, whatever its age: what an export writes down. */
export const all = (): Entry[] => entries.slice();

/** How many lines have ever been written. A reader watches this to redraw. */
export const written = (): number => serial;

/** Tell me when a line is written. Returns the way to stop being told. */
export function watch(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Forget everything. The scenarios use it; nothing on a playing path does. */
export function forget(): void {
  entries = [];
}

/**
 * One line as a sentence somebody can paste into a report: the bar, what
 * happened, and the fields that make it a measurement rather than an anecdote.
 * It is what a tap on a line copies — Eugene's *"bar 33: tapeDelay on keys, mix
 * 0.32, bus peaked −0.1 dBTP"*.
 */
export function sentence(e: Entry): string {
  const fields = Object.entries(e.fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k} ${typeof v === 'number' ? +v.toFixed(3) : v}`);
  const where = e.theme ? `seed ${e.seed} theme ${e.theme} bar ${e.bar}` : `seed ${e.seed}`;
  return `${where}: ${e.what}${fields.length ? ` — ${fields.join(', ')}` : ''}`;
}

/**
 * **Whether a thrown thing is ours to fix** (the held-errors audit's rule). A
* `DOMException` the browser raises for a permission, a capability, a state it
 * will not enter, an abort, a quota or a network (by its name: an
 * `IndexSizeError` or an `InvalidAccessError` is a value of ours) — or a dynamic import the
 * network lost — is the listener's machine and not a fault of ours; a
 * `TypeError`, a `RangeError`, a `ReferenceError` or an `Error` of our own is.
 */
const ENVIRONMENT = new Set(['NotAllowedError', 'NotSupportedError', 'InvalidStateError', 'AbortError',
  'SecurityError', 'QuotaExceededError', 'NetworkError', 'NotFoundError', 'NotReadableError', 'OperationError', 'TimeoutError']);
const LOST_IMPORT = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|Load failed|NetworkError when attempting/i;
export function ours(err: unknown): boolean {
  if (err == null) return false;
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  if (ENVIRONMENT.has(name)) return false;
  if (typeof e.message === 'string' && LOST_IMPORT.test(e.message)) return false;
  return true;
}

/**
 * **A bug, and not a refusal**: where the composer refuses by throwing an
 * `Error` with its reason (a recipe a seed cannot take, a mode a link cannot
 * have), only a `TypeError`, a `RangeError` or a `ReferenceError` is ours to fix
 * — K33's rule for a link, and the plan's and the link's here.
 */
export const aBug = (err: unknown): boolean =>
  err instanceof TypeError || err instanceof RangeError || err instanceof ReferenceError;

/** Only Safari's flood limit on `history.replaceState` is an `address` report: every other refusal is a framed page's. */
export const addressFlood = (err: unknown): boolean =>
  !!err && (err as { name?: unknown }).name === 'SecurityError' && typeof window !== 'undefined' && window.top === window;

const said = new Set<string>();
/**
 * **A caught error, written down to be reported** (round R1 of the reports).
 * The one call every `catch` in the audit's Report bucket makes: a `fault`
 * line with the error's kind and its own words (no stack), which
 * `fault-report.ts` turns into an event under the listener's switch and the
 * caps — once a kind a session, six in all, never on localhost — with the
 * track's link and where in it. Written once per kind and message a page, so a
 * throw on every frame is one line and not a ledger of them. `keep` decides
 * whether this throw is one at all: `ours` unless the caller says otherwise.
 * Hands back the line, or `null` where there was nothing to write.
 */
export function report(kind: CaughtKind, what: string, err?: unknown,
  fields: Record<string, Field> = {}, keep: (err: unknown) => boolean = ours): Entry | null {
  if (err !== undefined && !keep(err)) return null;
  const error = err === undefined ? null : String((err as Error)?.message ?? err).slice(0, 160);
  const key = `${kind}|${what}|${error}`;
  if (said.has(key) || said.size >= 64) return null;
  said.add(key);
  return note('fault', what, { ...fields, report: kind, error });
}

export default note;
